/**
 * Revenue Optimization Agent
 *
 * Runs every 24 hours. Analyzes business usage patterns to recommend:
 * 1. Upgrade candidates: businesses on lower tier using features beyond their plan
 * 2. Downgrade risks: businesses on higher tier but not using premium features
 * 3. Expansion opportunities: businesses with high call volumes that could benefit from more
 * 4. Pricing insights: which plan tier has best retention
 *
 * Stores in agent_activity_log:
 *   agentType: 'platform:revenue_optimization'
 *   action: 'opportunity_identified'
 *   details: { type: 'upgrade'|'downgrade_risk'|'expansion'|'pricing_insight', businessName?, recommendation, estimatedImpact }
 */

import { db } from "../../db";
import { eq, sql, gte, and, desc } from "drizzle-orm";
import {
  businesses,
  callLogs,
  appointments,
  customers,
  subscriptionPlans,
  overageCharges,
  agentActivityLog,
} from "../../../shared/schema";
import { logAgentAction } from "../agentActivityService";
import { storage } from "../../storage";

const AGENT_TYPE = "platform:revenue_optimization";
const ACTION = "opportunity_identified";

type OpportunityType = "upgrade" | "downgrade_risk" | "expansion" | "pricing_insight";

interface Opportunity {
  type: OpportunityType;
  businessId?: number;
  businessName?: string;
  recommendation: string;
  estimatedImpact: string;
}

interface OptimizationSummary {
  upgradeOpportunities: number;
  downgradeRisks: number;
  expansionTargets: number;
}

// Thresholds for identifying opportunities
const UPGRADE_CALL_THRESHOLD = 50;
const UPGRADE_APPOINTMENT_THRESHOLD = 100;
const DOWNGRADE_CALL_THRESHOLD = 5;
const DOWNGRADE_APPOINTMENT_THRESHOLD = 10;

/**
 * Check if an opportunity of a given type has already been logged for a business today.
 * For pricing_insight (no businessId), checks by type alone.
 */
async function isAlreadyLoggedToday(
  type: OpportunityType,
  businessId?: number
): Promise<boolean> {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const conditions = [
    eq(agentActivityLog.agentType, AGENT_TYPE),
    eq(agentActivityLog.action, ACTION),
    gte(agentActivityLog.createdAt, twentyFourHoursAgo),
    sql`${agentActivityLog.details}->>'type' = ${type}`,
  ];

  if (businessId) {
    conditions.push(eq(agentActivityLog.businessId, businessId));
  }

  const existing = await db
    .select({ id: agentActivityLog.id })
    .from(agentActivityLog)
    .where(and(...conditions))
    .limit(1);

  return existing.length > 0;
}

/**
 * Get the first day of the current month as a Date for filtering this month's data.
 */
function getFirstDayOfMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

/**
 * Fetch call counts per business for the current month.
 */
async function getMonthlyCallCounts(): Promise<Map<number, number>> {
  const firstOfMonth = getFirstDayOfMonth();

  const rows = await db
    .select({
      businessId: callLogs.businessId,
      callCount: sql<number>`count(*)`.as("call_count"),
    })
    .from(callLogs)
    .where(gte(callLogs.callTime, firstOfMonth))
    .groupBy(callLogs.businessId);

  const map = new Map<number, number>();
  for (const row of rows) {
    map.set(row.businessId, Number(row.callCount));
  }
  return map;
}

/**
 * Fetch appointment counts per business for the current month.
 */
async function getMonthlyAppointmentCounts(): Promise<Map<number, number>> {
  const firstOfMonth = getFirstDayOfMonth();

  const rows = await db
    .select({
      businessId: appointments.businessId,
      apptCount: sql<number>`count(*)`.as("appt_count"),
    })
    .from(appointments)
    .where(gte(appointments.createdAt, firstOfMonth))
    .groupBy(appointments.businessId);

  const map = new Map<number, number>();
  for (const row of rows) {
    map.set(row.businessId, Number(row.apptCount));
  }
  return map;
}

/**
 * Fetch customer counts per business.
 */
async function getCustomerCounts(): Promise<Map<number, number>> {
  const rows = await db
    .select({
      businessId: customers.businessId,
      customerCount: sql<number>`count(*)`.as("customer_count"),
    })
    .from(customers)
    .groupBy(customers.businessId);

  const map = new Map<number, number>();
  for (const row of rows) {
    map.set(row.businessId, Number(row.customerCount));
  }
  return map;
}

/**
 * Build a lookup of plan tiers by subscription plan ID.
 */
async function getPlanTierMap(): Promise<Map<number, { planTier: string | null; name: string; price: number }>> {
  const plans = await db.select().from(subscriptionPlans);
  const map = new Map<number, { planTier: string | null; name: string; price: number }>();
  for (const plan of plans) {
    map.set(plan.id, { planTier: plan.planTier, name: plan.name, price: plan.price });
  }
  return map;
}

/**
 * Identify businesses on a lower-tier plan that are using features heavily,
 * suggesting they would benefit from an upgrade.
 */
async function detectUpgradeCandidates(
  allBusinesses: { id: number; name: string; stripePlanId: number | null; subscriptionStatus: string | null }[],
  planTierMap: Map<number, { planTier: string | null; name: string; price: number }>,
  callCounts: Map<number, number>,
  appointmentCounts: Map<number, number>
): Promise<Opportunity[]> {
  const opportunities: Opportunity[] = [];

  const starterTiers = new Set(["starter"]);

  for (const biz of allBusinesses) {
    if (!biz.stripePlanId || biz.subscriptionStatus !== "active") continue;

    const plan = planTierMap.get(biz.stripePlanId);
    if (!plan || !plan.planTier || !starterTiers.has(plan.planTier)) continue;

    const calls = callCounts.get(biz.id) ?? 0;
    const appts = appointmentCounts.get(biz.id) ?? 0;

    const exceedsCalls = calls > UPGRADE_CALL_THRESHOLD;
    const exceedsAppointments = appts > UPGRADE_APPOINTMENT_THRESHOLD;

    if (exceedsCalls || exceedsAppointments) {
      const reasons: string[] = [];
      if (exceedsCalls) reasons.push(`${calls} calls this month (threshold: ${UPGRADE_CALL_THRESHOLD})`);
      if (exceedsAppointments) reasons.push(`${appts} appointments this month (threshold: ${UPGRADE_APPOINTMENT_THRESHOLD})`);

      opportunities.push({
        type: "upgrade",
        businessId: biz.id,
        businessName: biz.name,
        recommendation: `Business "${biz.name}" is on the ${plan.name} plan (${plan.planTier}) but has high usage: ${reasons.join("; ")}. Consider reaching out about upgrading to Professional or Business tier for better value and higher limits.`,
        estimatedImpact: `Potential MRR increase if upgraded from $${plan.price}/mo to a higher tier.`,
      });
    }
  }

  return opportunities;
}

/**
 * Identify businesses on a higher-tier plan with low usage,
 * indicating a potential downgrade or churn risk.
 */
async function detectDowngradeRisks(
  allBusinesses: { id: number; name: string; stripePlanId: number | null; subscriptionStatus: string | null }[],
  planTierMap: Map<number, { planTier: string | null; name: string; price: number }>,
  callCounts: Map<number, number>,
  appointmentCounts: Map<number, number>
): Promise<Opportunity[]> {
  const opportunities: Opportunity[] = [];

  const premiumTiers = new Set(["professional", "business", "enterprise"]);

  for (const biz of allBusinesses) {
    if (!biz.stripePlanId || biz.subscriptionStatus !== "active") continue;

    const plan = planTierMap.get(biz.stripePlanId);
    if (!plan || !plan.planTier || !premiumTiers.has(plan.planTier)) continue;

    const calls = callCounts.get(biz.id) ?? 0;
    const appts = appointmentCounts.get(biz.id) ?? 0;

    if (calls < DOWNGRADE_CALL_THRESHOLD && appts < DOWNGRADE_APPOINTMENT_THRESHOLD) {
      opportunities.push({
        type: "downgrade_risk",
        businessId: biz.id,
        businessName: biz.name,
        recommendation: `Business "${biz.name}" is on the ${plan.name} plan (${plan.planTier}) but has very low usage this month: ${calls} calls, ${appts} appointments. This may indicate the business is not getting value from their plan and is at risk of downgrading or churning.`,
        estimatedImpact: `At risk of losing $${plan.price}/mo if this business churns. Proactive outreach and onboarding support recommended.`,
      });
    }
  }

  return opportunities;
}

/**
 * Identify businesses that have overage charges, meaning they are consistently
 * hitting their plan limits and could benefit from a larger plan.
 */
async function detectExpansionOpportunities(): Promise<Opportunity[]> {
  const opportunities: Opportunity[] = [];

  // Look for businesses with recent overage charges (last 60 days)
  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

  const overages = await db
    .select({
      businessId: overageCharges.businessId,
      totalOverageMinutes: sql<number>`sum(${overageCharges.overageMinutes})`.as("total_overage_minutes"),
      totalOverageAmount: sql<number>`sum(${overageCharges.overageAmount})`.as("total_overage_amount"),
      chargeCount: sql<number>`count(*)`.as("charge_count"),
    })
    .from(overageCharges)
    .where(
      and(
        gte(overageCharges.periodStart, sixtyDaysAgo),
        sql`${overageCharges.status} != 'no_overage'`
      )
    )
    .groupBy(overageCharges.businessId);

  for (const row of overages) {
    const business = await storage.getBusiness(row.businessId);
    if (!business) continue;

    const totalMinutes = Number(row.totalOverageMinutes);
    const totalAmount = Number(row.totalOverageAmount);
    const chargeCount = Number(row.chargeCount);

    if (chargeCount >= 1) {
      opportunities.push({
        type: "expansion",
        businessId: row.businessId,
        businessName: business.name,
        recommendation: `Business "${business.name}" has been charged overages ${chargeCount} time(s) in the last 60 days, totaling ${totalMinutes} overage minutes ($${totalAmount.toFixed(2)}). They would likely save money and get a better experience by upgrading to a plan with higher included minutes.`,
        estimatedImpact: `Business is already spending $${totalAmount.toFixed(2)} in overages. An upgrade could convert this to predictable recurring revenue while saving the customer money.`,
      });
    }
  }

  return opportunities;
}

/**
 * Generate a pricing insight: which plan tier has the best retention.
 * Compares active vs. churned businesses by plan tier.
 */
async function generatePricingInsight(
  planTierMap: Map<number, { planTier: string | null; name: string; price: number }>
): Promise<Opportunity | null> {
  // Count active and churned businesses by plan tier
  const allBusinesses = await storage.getAllBusinesses();

  const tierStats: Record<string, { active: number; churned: number; total: number }> = {};

  for (const biz of allBusinesses) {
    if (!biz.stripePlanId) continue;

    const plan = planTierMap.get(biz.stripePlanId);
    if (!plan || !plan.planTier) continue;

    const tier = plan.planTier;
    if (!tierStats[tier]) {
      tierStats[tier] = { active: 0, churned: 0, total: 0 };
    }

    tierStats[tier].total += 1;

    if (biz.subscriptionStatus === "active" || biz.subscriptionStatus === "trialing") {
      tierStats[tier].active += 1;
    } else if (
      biz.subscriptionStatus === "canceled" ||
      biz.subscriptionStatus === "cancelled" ||
      biz.subscriptionStatus === "inactive"
    ) {
      tierStats[tier].churned += 1;
    }
  }

  // Find tier with best retention rate
  let bestTier: string | null = null;
  let bestRetention = -1;
  const insightParts: string[] = [];

  for (const [tier, stats] of Object.entries(tierStats)) {
    if (stats.total === 0) continue;
    const retentionRate = stats.active / stats.total;
    const retentionPct = (retentionRate * 100).toFixed(1);
    insightParts.push(`${tier}: ${retentionPct}% retention (${stats.active}/${stats.total})`);

    if (retentionRate > bestRetention) {
      bestRetention = retentionRate;
      bestTier = tier;
    }
  }

  if (!bestTier || insightParts.length === 0) {
    return null;
  }

  return {
    type: "pricing_insight",
    recommendation: `Plan retention analysis: ${insightParts.join(", ")}. The "${bestTier}" tier has the highest retention at ${(bestRetention * 100).toFixed(1)}%.`,
    estimatedImpact: `Focus acquisition efforts on the ${bestTier} tier which shows strongest product-market fit. Consider reviewing pricing or features of lower-retention tiers.`,
  };
}

/**
 * Main entry point: run the full revenue optimization analysis.
 * Returns a summary of identified opportunities.
 */
export async function runRevenueOptimization(): Promise<OptimizationSummary> {
  console.log(`[${AGENT_TYPE}] Starting revenue optimization analysis...`);

  const summary: OptimizationSummary = {
    upgradeOpportunities: 0,
    downgradeRisks: 0,
    expansionTargets: 0,
  };

  try {
    // Gather all data in parallel
    const [allBiz, planTierMap, callCounts, appointmentCounts, customerCounts] = await Promise.all([
      db
        .select({
          id: businesses.id,
          name: businesses.name,
          stripePlanId: businesses.stripePlanId,
          subscriptionStatus: businesses.subscriptionStatus,
        })
        .from(businesses)
        .where(sql`${businesses.isActive} = true`),
      getPlanTierMap(),
      getMonthlyCallCounts(),
      getMonthlyAppointmentCounts(),
      getCustomerCounts(),
    ]);

    console.log(
      `[${AGENT_TYPE}] Loaded ${allBiz.length} active businesses, ${planTierMap.size} plans, ` +
        `call data for ${callCounts.size} businesses, appointment data for ${appointmentCounts.size} businesses, ` +
        `customer data for ${customerCounts.size} businesses`
    );

    // Run all detectors
    const [upgrades, downgrades, expansions, pricingInsight] = await Promise.all([
      detectUpgradeCandidates(allBiz, planTierMap, callCounts, appointmentCounts),
      detectDowngradeRisks(allBiz, planTierMap, callCounts, appointmentCounts),
      detectExpansionOpportunities(),
      generatePricingInsight(planTierMap),
    ]);

    const allOpportunities: Opportunity[] = [
      ...upgrades,
      ...downgrades,
      ...expansions,
    ];
    if (pricingInsight) {
      allOpportunities.push(pricingInsight);
    }

    // Log each opportunity (with deduplication)
    for (const opp of allOpportunities) {
      try {
        const alreadyLogged = await isAlreadyLoggedToday(opp.type, opp.businessId);
        if (alreadyLogged) continue;

        // For business-specific opportunities, use the real businessId.
        // For pricing_insight (platform-wide), use businessId 0 as a sentinel.
        const logBusinessId = opp.businessId ?? 0;

        await logAgentAction({
          businessId: logBusinessId,
          agentType: AGENT_TYPE,
          action: ACTION,
          details: {
            type: opp.type,
            businessName: opp.businessName ?? null,
            recommendation: opp.recommendation,
            estimatedImpact: opp.estimatedImpact,
          },
        });

        switch (opp.type) {
          case "upgrade":
            summary.upgradeOpportunities += 1;
            break;
          case "downgrade_risk":
            summary.downgradeRisks += 1;
            break;
          case "expansion":
            summary.expansionTargets += 1;
            break;
        }

        console.log(
          `[${AGENT_TYPE}] Logged ${opp.type} opportunity${opp.businessName ? ` for "${opp.businessName}"` : ""}`
        );
      } catch (err) {
        console.error(
          `[${AGENT_TYPE}] Error logging opportunity for business ${opp.businessId}:`,
          err
        );
      }
    }

    console.log(
      `[${AGENT_TYPE}] Analysis complete. Upgrades: ${summary.upgradeOpportunities}, ` +
        `Downgrade risks: ${summary.downgradeRisks}, Expansion targets: ${summary.expansionTargets}`
    );
  } catch (err) {
    console.error(`[${AGENT_TYPE}] Fatal error during revenue optimization:`, err);
  }

  return summary;
}

export default { runRevenueOptimization };
