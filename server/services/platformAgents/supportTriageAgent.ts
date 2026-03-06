/**
 * Support Triage Agent
 *
 * Runs every 6 hours. Scans for businesses with potential issues:
 * - Failed provisioning (provisioningStatus = 'failed')
 * - Expired/expiring trials without subscription
 * - Call failures (callLogs with status 'failed' or 'error')
 * - SMS delivery failures in notification_log
 * - Businesses with past_due payment status
 *
 * Creates categorized support tickets in agent_activity_log:
 *   agentType: 'platform:support_triage'
 *   action: 'issue_detected'
 *   details: { category, severity: 'critical'|'high'|'medium'|'low', businessName, description, suggestedResolution }
 *
 * Deduplicates: Only creates one ticket per issue per business per day.
 */

import { db } from "../../db";
import { eq, sql, gte, and, desc } from "drizzle-orm";
import { businesses, callLogs, notificationLog, agentActivityLog } from "../../../shared/schema";
import { logAgentAction } from "../agentActivityService";
import { storage } from "../../storage";

const AGENT_TYPE = "platform:support_triage";
const ACTION = "issue_detected";

type Severity = "critical" | "high" | "medium" | "low";
type Category = "provisioning" | "trial_expiring" | "call_failure" | "notification_failure" | "payment";

interface TriageIssue {
  businessId: number;
  businessName: string;
  category: Category;
  severity: Severity;
  description: string;
  suggestedResolution: string;
}

interface TriageSummary {
  issuesFound: number;
  byCategory: Record<string, number>;
}

/**
 * Check if an issue of a given category has already been logged for a business today.
 * Prevents duplicate tickets within a 24-hour window.
 */
async function isAlreadyLoggedToday(businessId: number, category: Category): Promise<boolean> {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const existing = await db
    .select({ id: agentActivityLog.id })
    .from(agentActivityLog)
    .where(
      and(
        eq(agentActivityLog.businessId, businessId),
        eq(agentActivityLog.agentType, AGENT_TYPE),
        eq(agentActivityLog.action, ACTION),
        gte(agentActivityLog.createdAt, twentyFourHoursAgo),
        sql`${agentActivityLog.details}->>'category' = ${category}`
      )
    )
    .limit(1);

  return existing.length > 0;
}

/**
 * Detect businesses with failed provisioning.
 */
async function detectProvisioningFailures(): Promise<TriageIssue[]> {
  const issues: TriageIssue[] = [];

  const failedBusinesses = await db
    .select({ id: businesses.id, name: businesses.name })
    .from(businesses)
    .where(eq(businesses.provisioningStatus, "failed"));

  for (const biz of failedBusinesses) {
    issues.push({
      businessId: biz.id,
      businessName: biz.name,
      category: "provisioning",
      severity: "critical",
      description: `Business "${biz.name}" (ID: ${biz.id}) has a failed provisioning status. Phone number or AI receptionist setup may have failed.`,
      suggestedResolution:
        "Review provisioning_result JSON for error details. Re-trigger provisioning via admin panel or manually provision Twilio number and Vapi assistant.",
    });
  }

  return issues;
}

/**
 * Detect businesses with trials expiring in less than 3 days that have no active subscription.
 */
async function detectExpiringTrials(): Promise<TriageIssue[]> {
  const issues: TriageIssue[] = [];

  const now = new Date();
  const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

  const expiringBusinesses = await db
    .select({
      id: businesses.id,
      name: businesses.name,
      trialEndsAt: businesses.trialEndsAt,
      subscriptionStatus: businesses.subscriptionStatus,
    })
    .from(businesses)
    .where(
      and(
        gte(businesses.trialEndsAt, now),
        sql`${businesses.trialEndsAt} <= ${threeDaysFromNow}`,
        sql`(${businesses.subscriptionStatus} IS NULL OR ${businesses.subscriptionStatus} IN ('inactive', 'trialing'))`
      )
    );

  for (const biz of expiringBusinesses) {
    const trialEnd = biz.trialEndsAt ? new Date(biz.trialEndsAt) : null;
    const daysLeft = trialEnd
      ? Math.ceil((trialEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
      : 0;

    issues.push({
      businessId: biz.id,
      businessName: biz.name,
      category: "trial_expiring",
      severity: daysLeft <= 1 ? "high" : "medium",
      description: `Business "${biz.name}" (ID: ${biz.id}) has a trial expiring in ${daysLeft} day(s) with no active subscription.`,
      suggestedResolution:
        "Send a targeted conversion email/SMS. Consider offering a discount or extended trial. Reach out to understand blockers to conversion.",
    });
  }

  return issues;
}

/**
 * Detect recent call failures (last 24 hours) across all businesses.
 */
async function detectCallFailures(): Promise<TriageIssue[]> {
  const issues: TriageIssue[] = [];
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Count failed calls grouped by business in the last 24 hours
  const failedCalls = await db
    .select({
      businessId: callLogs.businessId,
      failCount: sql<number>`count(*)`.as("fail_count"),
    })
    .from(callLogs)
    .where(
      and(
        sql`${callLogs.status} IN ('failed', 'error')`,
        gte(callLogs.callTime, twentyFourHoursAgo)
      )
    )
    .groupBy(callLogs.businessId);

  for (const row of failedCalls) {
    const business = await storage.getBusiness(row.businessId);
    if (!business) continue;

    const failCount = Number(row.failCount);
    let severity: Severity = "low";
    if (failCount >= 10) severity = "critical";
    else if (failCount >= 5) severity = "high";
    else if (failCount >= 2) severity = "medium";

    issues.push({
      businessId: row.businessId,
      businessName: business.name,
      category: "call_failure",
      severity,
      description: `Business "${business.name}" (ID: ${business.id}) had ${failCount} failed/error call(s) in the last 24 hours.`,
      suggestedResolution:
        "Check Twilio and Vapi dashboards for error details. Verify the Twilio phone number is active and the Vapi assistant is properly configured. Review call logs for patterns (e.g., specific caller IDs or times).",
    });
  }

  return issues;
}

/**
 * Detect SMS/email notification delivery failures in the last 24 hours.
 */
async function detectNotificationFailures(): Promise<TriageIssue[]> {
  const issues: TriageIssue[] = [];
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Count failed notifications grouped by business
  const failedNotifications = await db
    .select({
      businessId: notificationLog.businessId,
      failCount: sql<number>`count(*)`.as("fail_count"),
      channels: sql<string>`string_agg(DISTINCT ${notificationLog.channel}, ', ')`.as("channels"),
    })
    .from(notificationLog)
    .where(
      and(
        eq(notificationLog.status, "failed"),
        gte(notificationLog.sentAt, twentyFourHoursAgo)
      )
    )
    .groupBy(notificationLog.businessId);

  for (const row of failedNotifications) {
    const business = await storage.getBusiness(row.businessId);
    if (!business) continue;

    const failCount = Number(row.failCount);
    let severity: Severity = "low";
    if (failCount >= 10) severity = "high";
    else if (failCount >= 3) severity = "medium";

    issues.push({
      businessId: row.businessId,
      businessName: business.name,
      category: "notification_failure",
      severity,
      description: `Business "${business.name}" (ID: ${business.id}) had ${failCount} failed notification(s) via ${row.channels} in the last 24 hours.`,
      suggestedResolution:
        "Review notification_log error messages. Check Twilio SMS quota and SendGrid/email provider status. Verify recipient phone numbers and email addresses are valid.",
    });
  }

  return issues;
}

/**
 * Detect businesses with past_due payment status.
 */
async function detectPaymentIssues(): Promise<TriageIssue[]> {
  const issues: TriageIssue[] = [];

  const pastDueBusinesses = await db
    .select({ id: businesses.id, name: businesses.name })
    .from(businesses)
    .where(eq(businesses.subscriptionStatus, "past_due"));

  for (const biz of pastDueBusinesses) {
    issues.push({
      businessId: biz.id,
      businessName: biz.name,
      category: "payment",
      severity: "high",
      description: `Business "${biz.name}" (ID: ${biz.id}) has a past_due subscription payment status. Service may be at risk of interruption.`,
      suggestedResolution:
        "Check Stripe dashboard for failed payment details. Trigger dunning email sequence. If card has repeatedly failed, reach out directly to the business owner to update payment method.",
    });
  }

  return issues;
}

/**
 * Main entry point: run the full support triage scan.
 * Returns a summary of issues found and their category breakdown.
 */
export async function runSupportTriage(): Promise<TriageSummary> {
  console.log(`[${AGENT_TYPE}] Starting support triage scan...`);

  const summary: TriageSummary = {
    issuesFound: 0,
    byCategory: {},
  };

  try {
    // Collect all potential issues from every detector
    const allIssues: TriageIssue[] = [];

    const [provisioningIssues, trialIssues, callIssues, notificationIssues, paymentIssues] =
      await Promise.all([
        detectProvisioningFailures(),
        detectExpiringTrials(),
        detectCallFailures(),
        detectNotificationFailures(),
        detectPaymentIssues(),
      ]);

    allIssues.push(
      ...provisioningIssues,
      ...trialIssues,
      ...callIssues,
      ...notificationIssues,
      ...paymentIssues
    );

    // Deduplicate and log each issue
    for (const issue of allIssues) {
      try {
        const alreadyLogged = await isAlreadyLoggedToday(issue.businessId, issue.category);
        if (alreadyLogged) {
          continue;
        }

        await logAgentAction({
          businessId: issue.businessId,
          agentType: AGENT_TYPE,
          action: ACTION,
          details: {
            category: issue.category,
            severity: issue.severity,
            businessName: issue.businessName,
            description: issue.description,
            suggestedResolution: issue.suggestedResolution,
          },
        });

        summary.issuesFound += 1;
        summary.byCategory[issue.category] = (summary.byCategory[issue.category] ?? 0) + 1;

        console.log(
          `[${AGENT_TYPE}] Logged ${issue.severity} ${issue.category} issue for business "${issue.businessName}" (${issue.businessId})`
        );
      } catch (err) {
        console.error(
          `[${AGENT_TYPE}] Error logging issue for business ${issue.businessId}:`,
          err
        );
      }
    }

    console.log(
      `[${AGENT_TYPE}] Triage complete. ${summary.issuesFound} new issue(s) logged.`,
      summary.byCategory
    );
  } catch (err) {
    console.error(`[${AGENT_TYPE}] Fatal error during triage scan:`, err);
  }

  return summary;
}

export default { runSupportTriage };
