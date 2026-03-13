/**
 * Health Score Agent
 *
 * Runs every 24 hours. Calculates a composite health score for each active business.
 * Unlike churn prediction (which looks for negative signals), this looks at positive engagement.
 *
 * Scoring (0-100, higher = healthier):
 * - Owner logged in within 7 days: +15
 * - Call volume this week > 0: +15
 * - Appointments this week > 0: +15
 * - Customers growing (added any in last 14d): +10
 * - Payment current (active, not past_due): +15
 * - Feature adoption score (phone + forwarding + receptionist + booking link): up to +20
 * - Has staff members: +10
 *
 * Store in agent_activity_log:
 *   agentType: 'platform:health_score'
 *   action: 'health_scored'
 *   details: { score, tier: 'excellent'|'good'|'at_risk'|'critical', breakdown }
 *
 * Tiers: excellent (>=80), good (60-79), at_risk (40-59), critical (<40)
 */

import { db } from "../../db";
import { eq, sql, and, gte, or, inArray } from "drizzle-orm";
import {
  businesses,
  users,
  callLogs,
  appointments,
  customers,
  staff,
  agentActivityLog,
} from "@shared/schema";
import { logAgentAction } from "../agentActivityService";

// ── Types ────────────────────────────────────────────────────────────────

type HealthTier = 'excellent' | 'good' | 'at_risk' | 'critical';

interface HealthBreakdown {
  ownerActive: number;
  callVolume: number;
  appointmentVolume: number;
  customerGrowth: number;
  paymentCurrent: number;
  featureAdoption: number;
  hasStaff: number;
}

interface HealthScoreResult {
  businessId: number;
  score: number;
  tier: HealthTier;
  breakdown: HealthBreakdown;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function determineTier(score: number): HealthTier {
  if (score >= 80) return 'excellent';
  if (score >= 60) return 'good';
  if (score >= 40) return 'at_risk';
  return 'critical';
}

function computeFeatureAdoption(biz: any): number {
  let points = 0;
  // Has a Twilio phone number provisioned: +5
  if (biz.twilioPhoneNumber) points += 5;
  // Has call forwarding enabled: +5
  if (biz.callForwardingEnabled) points += 5;
  // Has AI receptionist enabled with a Vapi assistant: +5
  if (biz.receptionistEnabled && biz.vapiAssistantId) points += 5;
  // Has a public booking link configured: +5
  if (biz.bookingSlug && biz.bookingEnabled) points += 5;
  return points; // max 20
}

// ── Main runner ──────────────────────────────────────────────────────────

export async function runHealthScoring(): Promise<void> {
  const startTime = Date.now();
  console.log(`[HealthScore] Starting health scoring run at ${new Date().toISOString()}`);

  try {
    // 1. Get all active or trialing businesses
    const activeBusinesses = await db
      .select()
      .from(businesses)
      .where(
        or(
          eq(businesses.subscriptionStatus, 'active'),
          eq(businesses.subscriptionStatus, 'trialing'),
        ),
      );

    if (activeBusinesses.length === 0) {
      console.log('[HealthScore] No active/trialing businesses found.');
      return;
    }

    const businessIds = activeBusinesses.map(b => b.id);

    // 2. Batch query: owner last login per business
    const allOwners = await db
      .select({
        businessId: users.businessId,
        lastLogin: users.lastLogin,
      })
      .from(users)
      .where(
        and(
          inArray(users.businessId, businessIds),
          eq(users.role, 'user'), // owners have role 'user'
        ),
      );

    const ownerLastLoginMap = new Map<number, Date | null>();
    for (const owner of allOwners) {
      if (owner.businessId) {
        const existing = ownerLastLoginMap.get(owner.businessId);
        // Keep the most recent login across multiple owners
        if (!existing || (owner.lastLogin && owner.lastLogin > existing)) {
          ownerLastLoginMap.set(owner.businessId, owner.lastLogin);
        }
      }
    }

    // 3. Batch query: call counts per business this week
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const callCounts = await db
      .select({
        businessId: callLogs.businessId,
        count: sql<number>`count(*)::int`,
      })
      .from(callLogs)
      .where(gte(callLogs.callTime, sevenDaysAgo))
      .groupBy(callLogs.businessId);

    const callCountMap = new Map(callCounts.map(c => [c.businessId, c.count]));

    // 4. Batch query: appointment counts per business this week
    const appointmentCounts = await db
      .select({
        businessId: appointments.businessId,
        count: sql<number>`count(*)::int`,
      })
      .from(appointments)
      .where(gte(appointments.startDate, sevenDaysAgo))
      .groupBy(appointments.businessId);

    const appointmentCountMap = new Map(appointmentCounts.map(a => [a.businessId, a.count]));

    // 5. Batch query: new customers added in last 14 days per business
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    const newCustomerCounts = await db
      .select({
        businessId: customers.businessId,
        count: sql<number>`count(*)::int`,
      })
      .from(customers)
      .where(gte(customers.createdAt, fourteenDaysAgo))
      .groupBy(customers.businessId);

    const newCustomerCountMap = new Map(newCustomerCounts.map(c => [c.businessId, c.count]));

    // 6. Batch query: staff counts per business
    const staffCounts = await db
      .select({
        businessId: staff.businessId,
        count: sql<number>`count(*)::int`,
      })
      .from(staff)
      .where(eq(staff.active, true))
      .groupBy(staff.businessId);

    const staffCountMap = new Map(staffCounts.map(s => [s.businessId, s.count]));

    // 7. Delete previous health_scored entries for idempotency
    await db
      .delete(agentActivityLog)
      .where(
        and(
          eq(agentActivityLog.agentType, 'platform:health_score'),
          eq(agentActivityLog.action, 'health_scored'),
        ),
      );

    // Also delete previous alert entries so they refresh
    await db
      .delete(agentActivityLog)
      .where(
        and(
          eq(agentActivityLog.agentType, 'platform:health_score'),
          eq(agentActivityLog.action, 'alert_generated'),
        ),
      );

    // 8. Score each business
    let excellent = 0;
    let good = 0;
    let atRisk = 0;
    let critical = 0;
    const criticalBusinesses: Array<{ businessId: number; businessName: string; score: number; tier: string; factors: Record<string, any> }> = [];

    for (const biz of activeBusinesses) {
      try {
        const breakdown: HealthBreakdown = {
          ownerActive: 0,
          callVolume: 0,
          appointmentVolume: 0,
          customerGrowth: 0,
          paymentCurrent: 0,
          featureAdoption: 0,
          hasStaff: 0,
        };

        // Owner logged in within 7 days: +15
        const ownerLastLogin = ownerLastLoginMap.get(biz.id);
        if (ownerLastLogin && ownerLastLogin >= sevenDaysAgo) {
          breakdown.ownerActive = 15;
        }

        // Call volume this week > 0: +15
        const weekCalls = callCountMap.get(biz.id) || 0;
        if (weekCalls > 0) {
          breakdown.callVolume = 15;
        }

        // Appointments this week > 0: +15
        const weekAppts = appointmentCountMap.get(biz.id) || 0;
        if (weekAppts > 0) {
          breakdown.appointmentVolume = 15;
        }

        // Customers growing (added any in last 14d): +10
        const recentCustomers = newCustomerCountMap.get(biz.id) || 0;
        if (recentCustomers > 0) {
          breakdown.customerGrowth = 10;
        }

        // Payment current (active, not past_due): +15
        if (biz.subscriptionStatus === 'active' || biz.subscriptionStatus === 'trialing') {
          breakdown.paymentCurrent = 15;
        }

        // Feature adoption (phone, forwarding, receptionist, booking): up to +20
        breakdown.featureAdoption = computeFeatureAdoption(biz);

        // Has staff members: +10
        const staffCount = staffCountMap.get(biz.id) || 0;
        if (staffCount > 0) {
          breakdown.hasStaff = 10;
        }

        // Sum up
        const score = Math.min(
          100,
          breakdown.ownerActive +
          breakdown.callVolume +
          breakdown.appointmentVolume +
          breakdown.customerGrowth +
          breakdown.paymentCurrent +
          breakdown.featureAdoption +
          breakdown.hasStaff,
        );

        const tier = determineTier(score);

        // Log the health score
        await logAgentAction({
          businessId: biz.id,
          agentType: 'platform:health_score',
          action: 'health_scored',
          details: { score, tier, breakdown },
        });

        // For critical health scores, also log an alert
        if (tier === 'critical') {
          await logAgentAction({
            businessId: biz.id,
            agentType: 'platform:health_score',
            action: 'alert_generated',
            details: {
              alertType: 'critical_health_score',
              score,
              breakdown,
              message: `Business "${biz.name}" (ID: ${biz.id}) has a critical health score of ${score}. Immediate attention recommended.`,
            },
          });
        }

        // Track tier counts
        switch (tier) {
          case 'excellent': excellent++; break;
          case 'good': good++; break;
          case 'at_risk': atRisk++; break;
          case 'critical':
            critical++;
            criticalBusinesses.push({
              businessId: biz.id,
              businessName: biz.name,
              score,
              tier,
              factors: breakdown,
            });
            break;
        }
      } catch (err) {
        console.error(`[HealthScore] Error scoring business ${biz.id}:`, err);
      }
    }

    // Feed critical health scores into the agent coordinator for escalation
    if (criticalBusinesses.length > 0) {
      try {
        const { processHealthResults } = await import('./agentCoordinator');
        await processHealthResults(criticalBusinesses);
      } catch (err) {
        console.warn(`[HealthScore] Coordinator processing failed (non-blocking):`, (err as Error).message);
      }
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(
      `[HealthScore] Done in ${elapsed}s ` +
      `-- ${activeBusinesses.length} businesses scored: ` +
      `${excellent} excellent, ${good} good, ${atRisk} at_risk, ${critical} critical`,
    );
  } catch (err) {
    console.error('[HealthScore] Fatal error:', err);
  }
}

export default { runHealthScoring };
