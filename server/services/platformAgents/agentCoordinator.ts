/**
 * Agent Coordinator
 *
 * The "brain" that connects all platform agents. Instead of agents running
 * in isolation and logging results nobody reads, this coordinator:
 *
 * 1. Collects outputs from all agents into a unified intelligence feed
 * 2. Triggers cross-agent actions (churn alert → onboarding nudge → support ticket)
 * 3. Provides real platform stats to content/social agents (not generic marketing)
 * 4. Maintains a priority queue of admin action items
 *
 * Events flow:
 *   churn_prediction.high_risk → trigger onboarding_coach intervention + support_triage alert
 *   lead_scoring.hot_lead → trigger personalized onboarding nudge
 *   health_score.critical → trigger revenue_optimization check + support_triage
 *   support_triage.critical_issue → (logged for admin action, future: auto-email)
 *   content_seo + social_media → share platform stats for data-driven content
 *
 * agentType: 'platform:coordinator'
 */

import { db } from "../../db";
import { businesses, users, callLogs, appointments, customers, invoices, agentActivityLog } from "../../../shared/schema";
import { eq, sql, gte, and, desc, or } from "drizzle-orm";
import { logAgentAction } from "../agentActivityService";

const AGENT_TYPE = 'platform:coordinator';

/**
 * Live platform stats — fed into social media and content agents for data-driven posts.
 * Returns real numbers, not marketing fluff.
 */
export async function getPlatformStats(): Promise<PlatformStats> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  try {
    const [
      totalBusinesses,
      activeBusinesses,
      totalCustomers,
      totalAppointments30d,
      totalCalls30d,
      totalInvoicesPaid30d,
      topIndustries,
      newBusinesses7d,
    ] = await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(businesses),
      db.select({ count: sql<number>`count(*)::int` }).from(businesses)
        .where(or(eq(businesses.subscriptionStatus, 'active'), eq(businesses.subscriptionStatus, 'trialing'))),
      db.select({ count: sql<number>`count(*)::int` }).from(customers),
      db.select({ count: sql<number>`count(*)::int` }).from(appointments)
        .where(gte(appointments.createdAt, thirtyDaysAgo)),
      db.select({ count: sql<number>`count(*)::int` }).from(callLogs)
        .where(gte(callLogs.callTime, thirtyDaysAgo)),
      db.select({
        count: sql<number>`count(*)::int`,
        total: sql<number>`COALESCE(SUM(total), 0)::int`
      }).from(invoices)
        .where(and(eq(invoices.status, 'paid'), gte(invoices.updatedAt, thirtyDaysAgo))),
      db.select({ industry: businesses.industry, count: sql<number>`count(*)::int` })
        .from(businesses)
        .where(sql`${businesses.industry} IS NOT NULL AND ${businesses.industry} != ''`)
        .groupBy(businesses.industry)
        .orderBy(sql`count(*) DESC`)
        .limit(5),
      db.select({ count: sql<number>`count(*)::int` }).from(businesses)
        .where(gte(businesses.createdAt, sevenDaysAgo)),
    ]);

    return {
      totalBusinesses: totalBusinesses[0]?.count || 0,
      activeBusinesses: activeBusinesses[0]?.count || 0,
      totalCustomers: totalCustomers[0]?.count || 0,
      appointmentsLast30d: totalAppointments30d[0]?.count || 0,
      callsLast30d: totalCalls30d[0]?.count || 0,
      invoicesPaidLast30d: totalInvoicesPaid30d[0]?.count || 0,
      revenueLast30d: totalInvoicesPaid30d[0]?.total || 0,
      topIndustries: topIndustries.map(i => ({ industry: i.industry!, count: i.count })),
      newBusinessesLast7d: newBusinesses7d[0]?.count || 0,
    };
  } catch (err) {
    console.error(`[${AGENT_TYPE}] Error fetching platform stats:`, err);
    return {
      totalBusinesses: 0,
      activeBusinesses: 0,
      totalCustomers: 0,
      appointmentsLast30d: 0,
      callsLast30d: 0,
      invoicesPaidLast30d: 0,
      revenueLast30d: 0,
      topIndustries: [],
      newBusinessesLast7d: 0,
    };
  }
}

export interface PlatformStats {
  totalBusinesses: number;
  activeBusinesses: number;
  totalCustomers: number;
  appointmentsLast30d: number;
  callsLast30d: number;
  invoicesPaidLast30d: number;
  revenueLast30d: number;
  topIndustries: { industry: string; count: number }[];
  newBusinessesLast7d: number;
}

/**
 * Process outputs from churn prediction and trigger downstream agents.
 * Called after churn prediction completes.
 */
export async function processChurnResults(predictions: Array<{
  businessId: number;
  businessName: string;
  ownerEmail: string | null;
  score: number;
  riskLevel: 'low' | 'medium' | 'high';
  factors: Array<{ factor: string; weight: number; detail: string }>;
  recommendations: string[];
}>): Promise<void> {
  const highRisk = predictions.filter(p => p.riskLevel === 'high');
  const mediumRisk = predictions.filter(p => p.riskLevel === 'medium');

  if (highRisk.length === 0 && mediumRisk.length === 0) return;

  console.log(`[${AGENT_TYPE}] Processing churn results: ${highRisk.length} high-risk, ${mediumRisk.length} medium-risk`);

  // For high-risk businesses: trigger onboarding coach to send re-engagement email
  for (const biz of highRisk) {
    try {
      // Check if onboarding coach already nudged this business recently (7 days)
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const [recentNudge] = await db.select({ count: sql<number>`count(*)::int` })
        .from(agentActivityLog)
        .where(and(
          eq(agentActivityLog.businessId, biz.businessId),
          eq(agentActivityLog.agentType, 'platform:coordinator'),
          eq(agentActivityLog.action, 'churn_intervention_sent'),
          gte(agentActivityLog.createdAt, sevenDaysAgo)
        ));

      if ((recentNudge?.count || 0) > 0) {
        console.log(`[${AGENT_TYPE}] Skipping churn intervention for business ${biz.businessId} — already sent within 7 days`);
        continue;
      }

      // Determine the best intervention based on churn factors
      const intervention = determineIntervention(biz.factors);

      // Send re-engagement email
      try {
        const { sendChurnInterventionEmail } = await import('../../emailService');
        await sendChurnInterventionEmail(
          biz.ownerEmail || '',
          biz.businessName,
          intervention.type,
          intervention.message,
          intervention.ctaUrl
        );
        console.log(`[${AGENT_TYPE}] Sent ${intervention.type} intervention to ${biz.businessName}`);
      } catch (emailErr) {
        // Email function may not exist yet — log but don't fail
        console.warn(`[${AGENT_TYPE}] Could not send churn intervention email (function may not exist):`, (emailErr as Error).message);
      }

      await logAgentAction({
        businessId: biz.businessId,
        agentType: AGENT_TYPE,
        action: 'churn_intervention_sent',
        details: {
          businessName: biz.businessName,
          churnScore: biz.score,
          interventionType: intervention.type,
          topFactors: biz.factors.slice(0, 3).map(f => f.detail),
          recommendations: biz.recommendations,
        },
      });
    } catch (err) {
      console.error(`[${AGENT_TYPE}] Error processing churn for business ${biz.businessId}:`, err);
    }
  }

  // Log summary
  await logAgentAction({
    businessId: 0,
    agentType: AGENT_TYPE,
    action: 'churn_processing_complete',
    details: {
      highRiskCount: highRisk.length,
      mediumRiskCount: mediumRisk.length,
      interventionsSent: highRisk.length, // approximate
    },
  });
}

/**
 * Process lead scoring results and trigger personalized outreach for hot leads.
 */
export async function processLeadResults(leads: Array<{
  businessId: number;
  businessName: string;
  ownerEmail: string | null;
  score: number;
  tier: 'hot' | 'warm' | 'cold';
  recommendedAction: string;
}>): Promise<void> {
  const hotLeads = leads.filter(l => l.tier === 'hot');
  if (hotLeads.length === 0) return;

  console.log(`[${AGENT_TYPE}] Processing ${hotLeads.length} hot leads`);

  for (const lead of hotLeads) {
    try {
      // Deduplicate — don't nudge same lead within 3 days
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      const [recentAction] = await db.select({ count: sql<number>`count(*)::int` })
        .from(agentActivityLog)
        .where(and(
          eq(agentActivityLog.businessId, lead.businessId),
          eq(agentActivityLog.agentType, AGENT_TYPE),
          eq(agentActivityLog.action, 'hot_lead_nudge'),
          gte(agentActivityLog.createdAt, threeDaysAgo)
        ));

      if ((recentAction?.count || 0) > 0) continue;

      // Send targeted onboarding email for hot leads
      try {
        const { sendHotLeadNudgeEmail } = await import('../../emailService');
        await sendHotLeadNudgeEmail(
          lead.ownerEmail || '',
          lead.businessName,
          lead.recommendedAction
        );
      } catch (emailErr) {
        console.warn(`[${AGENT_TYPE}] Could not send hot lead nudge (function may not exist):`, (emailErr as Error).message);
      }

      await logAgentAction({
        businessId: lead.businessId,
        agentType: AGENT_TYPE,
        action: 'hot_lead_nudge',
        details: {
          businessName: lead.businessName,
          score: lead.score,
          action: lead.recommendedAction,
        },
      });
    } catch (err) {
      console.error(`[${AGENT_TYPE}] Error processing hot lead ${lead.businessId}:`, err);
    }
  }
}

/**
 * Process health score results — trigger support triage for critical businesses.
 */
export async function processHealthResults(scores: Array<{
  businessId: number;
  businessName: string;
  score: number;
  tier: string;
  factors: Record<string, any>;
}>): Promise<void> {
  const critical = scores.filter(s => s.tier === 'critical');
  if (critical.length === 0) return;

  console.log(`[${AGENT_TYPE}] ${critical.length} critical-health businesses detected`);

  for (const biz of critical) {
    // Log a coordinated alert that links health score to support
    await logAgentAction({
      businessId: biz.businessId,
      agentType: AGENT_TYPE,
      action: 'health_critical_escalation',
      details: {
        businessName: biz.businessName,
        healthScore: biz.score,
        factors: biz.factors,
        recommendation: 'Immediate admin outreach recommended — business at risk of churning',
      },
    });
  }
}

/**
 * Determine the best intervention type based on churn factors.
 */
function determineIntervention(factors: Array<{ factor: string; weight: number; detail: string }>): {
  type: string;
  message: string;
  ctaUrl: string;
} {
  const appUrl = process.env.APP_URL || 'https://www.smallbizagent.ai';
  const factorNames = factors.map(f => f.factor.toLowerCase());

  if (factorNames.some(f => f.includes('login') || f.includes('never logged'))) {
    return {
      type: 'reactivation',
      message: 'We noticed you haven\'t logged in recently. Your AI receptionist is ready to help — let\'s get you set up in just 5 minutes.',
      ctaUrl: `${appUrl}/dashboard`,
    };
  }

  if (factorNames.some(f => f.includes('call') || f.includes('phone'))) {
    return {
      type: 'feature_adoption',
      message: 'Your AI receptionist is waiting for its first call! Forward your business number to start capturing leads 24/7.',
      ctaUrl: `${appUrl}/receptionist`,
    };
  }

  if (factorNames.some(f => f.includes('payment'))) {
    return {
      type: 'payment_recovery',
      message: 'We noticed a billing issue with your account. Update your payment to keep your AI receptionist active.',
      ctaUrl: `${appUrl}/settings`,
    };
  }

  if (factorNames.some(f => f.includes('customer'))) {
    return {
      type: 'growth_tips',
      message: 'Did you know you can share your booking link to let customers schedule directly? It\'s the fastest way to grow.',
      ctaUrl: `${appUrl}/appointments`,
    };
  }

  return {
    type: 'general_checkin',
    message: 'Just checking in! Your SmallBizAgent account is ready to help you capture more business. Need help getting started?',
    ctaUrl: `${appUrl}/dashboard`,
  };
}

/**
 * Get content-ready stats for the social media and content agents.
 * Returns human-readable facts for social posts — not raw numbers.
 */
export async function getContentFacts(): Promise<string[]> {
  const stats = await getPlatformStats();
  const facts: string[] = [];

  if (stats.totalBusinesses > 0) {
    facts.push(`${stats.totalBusinesses} small businesses trust SmallBizAgent`);
  }
  if (stats.totalCustomers > 0) {
    facts.push(`Managing ${stats.totalCustomers.toLocaleString()} customer relationships`);
  }
  if (stats.appointmentsLast30d > 0) {
    facts.push(`${stats.appointmentsLast30d.toLocaleString()} appointments booked in the last 30 days`);
  }
  if (stats.callsLast30d > 0) {
    facts.push(`${stats.callsLast30d.toLocaleString()} calls handled by AI receptionists this month`);
  }
  if (stats.invoicesPaidLast30d > 0) {
    facts.push(`${stats.invoicesPaidLast30d} invoices paid seamlessly this month`);
  }
  if (stats.revenueLast30d > 0) {
    facts.push(`$${stats.revenueLast30d.toLocaleString()} in payments processed for small businesses`);
  }
  if (stats.topIndustries.length > 0) {
    const industryList = stats.topIndustries.slice(0, 3).map(i => i.industry).join(', ');
    facts.push(`Serving ${industryList} businesses and growing`);
  }
  if (stats.newBusinessesLast7d > 0) {
    facts.push(`${stats.newBusinessesLast7d} new businesses joined this week`);
  }

  return facts;
}

export default {
  getPlatformStats,
  processChurnResults,
  processLeadResults,
  processHealthResults,
  getContentFacts,
};
