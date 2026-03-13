/**
 * Lead Scoring Agent
 *
 * Runs every 12 hours. Scores users/businesses that signed up but haven't subscribed.
 * Helps admin prioritize follow-up outreach.
 *
 * Scoring (0-100, higher = more likely to convert):
 * - Email verified: +20
 * - Completed onboarding steps: +10 each (max 30)
 * - Has business profile filled out: +15
 * - Visited multiple pages (proxy: has customers/appointments already): +15
 * - Account age 1-7 days (hot lead): +20 (drops off after 7 days)
 * - Came from a referral: +10 (check if referralCode exists on user or business)
 *
 * Results stored in agent_activity_log:
 *   agentType: 'platform:lead_scoring'
 *   action: 'lead_scored'
 *   details: { score, tier: 'hot'|'warm'|'cold', factors, recommendedAction }
 */

import { db } from "../../db";
import { eq, sql, and, gte, or, isNull } from "drizzle-orm";
import {
  businesses,
  users,
  customers,
  appointments,
  staff,
  agentActivityLog,
} from "@shared/schema";
import { logAgentAction } from "../agentActivityService";

// ── Types ────────────────────────────────────────────────────────────────

interface LeadScoreResult {
  businessId: number;
  score: number;
  tier: 'hot' | 'warm' | 'cold';
  factors: Record<string, number>;
  recommendedAction: string;
}

// ── Scoring helpers ──────────────────────────────────────────────────────

function computeAccountAgeFactor(createdAt: Date | null): number {
  if (!createdAt) return 0;
  const ageMs = Date.now() - new Date(createdAt).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  if (ageDays >= 1 && ageDays <= 7) return 20;
  if (ageDays > 7 && ageDays <= 14) return 10;
  if (ageDays > 14 && ageDays <= 21) return 5;
  return 0;
}

function computeProfileFactor(biz: any): number {
  // Business is "filled out" if it has at least: address, phone, type/industry
  let filled = 0;
  if (biz.address) filled++;
  if (biz.phone) filled++;
  if (biz.type && biz.type !== 'general') filled++;
  if (biz.industry) filled++;
  if (biz.website) filled++;
  // Consider filled if 3+ of the above fields are present
  return filled >= 3 ? 15 : 0;
}

function determineTier(score: number): 'hot' | 'warm' | 'cold' {
  if (score >= 70) return 'hot';
  if (score >= 40) return 'warm';
  return 'cold';
}

function recommendAction(tier: 'hot' | 'warm' | 'cold'): string {
  switch (tier) {
    case 'hot':
      return 'Personal outreach within 24 hours';
    case 'warm':
      return 'Send feature highlight email';
    case 'cold':
      return 'Add to nurture drip campaign';
  }
}

// ── Main runner ──────────────────────────────────────────────────────────

export async function runLeadScoring(): Promise<void> {
  const startTime = Date.now();
  console.log(`[LeadScoring] Starting lead scoring run at ${new Date().toISOString()}`);

  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // 1. Get all businesses with inactive/null subscription created in last 30 days
    const leads = await db
      .select()
      .from(businesses)
      .where(
        and(
          or(
            eq(businesses.subscriptionStatus, 'inactive'),
            isNull(businesses.subscriptionStatus),
          ),
          gte(businesses.createdAt, thirtyDaysAgo),
        ),
      );

    if (leads.length === 0) {
      console.log('[LeadScoring] No unsubscribed leads found in the last 30 days.');
      return;
    }

    // 2. Get all users (owners) keyed by businessId for quick lookup
    const allUsers = await db
      .select({
        id: users.id,
        businessId: users.businessId,
        email: users.email,
        emailVerified: users.emailVerified,
        onboardingComplete: users.onboardingComplete,
        setupChecklistDismissed: users.setupChecklistDismissed,
        lastLogin: users.lastLogin,
      })
      .from(users);

    const usersByBusiness = new Map<number, typeof allUsers>();
    for (const u of allUsers) {
      if (u.businessId) {
        const existing = usersByBusiness.get(u.businessId) || [];
        existing.push(u);
        usersByBusiness.set(u.businessId, existing);
      }
    }

    // 3. Batch query: customer counts per business (proxy for engagement)
    const customerCounts = await db
      .select({
        businessId: customers.businessId,
        count: sql<number>`count(*)::int`,
      })
      .from(customers)
      .groupBy(customers.businessId);

    const customerCountMap = new Map(customerCounts.map(c => [c.businessId, c.count]));

    // 4. Batch query: appointment counts per business
    const appointmentCounts = await db
      .select({
        businessId: appointments.businessId,
        count: sql<number>`count(*)::int`,
      })
      .from(appointments)
      .groupBy(appointments.businessId);

    const appointmentCountMap = new Map(appointmentCounts.map(a => [a.businessId, a.count]));

    // 5. Delete previous lead_scored entries for idempotency
    await db
      .delete(agentActivityLog)
      .where(
        and(
          eq(agentActivityLog.agentType, 'platform:lead_scoring'),
          eq(agentActivityLog.action, 'lead_scored'),
        ),
      );

    // 6. Score each lead
    let hot = 0;
    let warm = 0;
    let cold = 0;
    const scoredLeads: Array<{ businessId: number; businessName: string; ownerEmail: string | null; score: number; tier: 'hot' | 'warm' | 'cold'; recommendedAction: string }> = [];

    for (const biz of leads) {
      try {
        const factors: Record<string, number> = {};
        let score = 0;

        // --- Owner / user factors ---
        const ownerUsers = usersByBusiness.get(biz.id) || [];
        const primaryOwner = ownerUsers[0]; // First user linked to business

        // Email verified: +20
        if (primaryOwner?.emailVerified) {
          factors.emailVerified = 20;
          score += 20;
        }

        // Onboarding steps completed: +10 each (max 30)
        // We check: onboardingComplete, setupChecklistDismissed, and lastLogin exists
        let onboardingPoints = 0;
        if (primaryOwner?.onboardingComplete) onboardingPoints += 10;
        if (primaryOwner?.setupChecklistDismissed) onboardingPoints += 10;
        if (primaryOwner?.lastLogin) onboardingPoints += 10;
        onboardingPoints = Math.min(onboardingPoints, 30);
        if (onboardingPoints > 0) {
          factors.onboardingSteps = onboardingPoints;
          score += onboardingPoints;
        }

        // Business profile filled out: +15
        const profileScore = computeProfileFactor(biz);
        if (profileScore > 0) {
          factors.businessProfileComplete = profileScore;
          score += profileScore;
        }

        // Has customers or appointments (proxy for page engagement): +15
        const custCount = customerCountMap.get(biz.id) || 0;
        const apptCount = appointmentCountMap.get(biz.id) || 0;
        if (custCount > 0 || apptCount > 0) {
          factors.hasActivityData = 15;
          score += 15;
        }

        // Account age factor: +20 for 1-7 days, decays
        const ageFactor = computeAccountAgeFactor(biz.createdAt);
        if (ageFactor > 0) {
          factors.accountAge = ageFactor;
          score += ageFactor;
        }

        // Referral factor: +10 (check bookingSlug as proxy for shared link, or description mentioning referral)
        // Since we don't have a dedicated referralCode column, check if business was set up via booking slug
        // or if the business description indicates referral. This is a soft heuristic.
        // In practice, you'd check a referralCode column here.
        // For now, we skip this factor unless there's explicit referral data.

        // Clamp score to 0-100
        score = Math.min(100, Math.max(0, score));

        const tier = determineTier(score);
        const recommendedAction = recommendAction(tier);

        // Log the score
        await logAgentAction({
          businessId: biz.id,
          agentType: 'platform:lead_scoring',
          action: 'lead_scored',
          details: { score, tier, factors, recommendedAction },
        });

        if (tier === 'hot') {
          hot++;
          scoredLeads.push({
            businessId: biz.id,
            businessName: biz.name,
            ownerEmail: primaryOwner?.email || biz.email,
            score,
            tier,
            recommendedAction,
          });
        } else if (tier === 'warm') warm++;
        else cold++;
      } catch (err) {
        console.error(`[LeadScoring] Error scoring business ${biz.id}:`, err);
      }
    }

    // Feed hot leads into the agent coordinator for cross-agent outreach
    if (scoredLeads.length > 0) {
      try {
        const { processLeadResults } = await import('./agentCoordinator');
        await processLeadResults(scoredLeads);
      } catch (err) {
        console.warn(`[LeadScoring] Coordinator processing failed (non-blocking):`, (err as Error).message);
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(
      `[LeadScoring] Done in ${elapsed}s ` +
      `-- ${leads.length} leads scored: ${hot} hot, ${warm} warm, ${cold} cold`,
    );
  } catch (err) {
    console.error('[LeadScoring] Fatal error:', err);
  }
}

export default { runLeadScoring };
