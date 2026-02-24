/**
 * Overage Billing Service
 *
 * Automatically bills businesses for AI call minutes exceeding their plan's included amount.
 * Runs at the end of each billing period, creates Stripe invoices, and tracks charges
 * in the overage_charges table to prevent double-billing.
 */

import { db } from '../db';
import { businesses, callLogs, subscriptionPlans, overageCharges } from '@shared/schema';
import { eq, and, gte, lt, sql } from 'drizzle-orm';
import * as stripeService from './stripeService';

// Businesses created before this date are grandfathered as "Founder" accounts
const SUBSCRIPTION_LAUNCH_DATE = new Date('2026-02-23T00:00:00Z');

export interface OverageChargeResult {
  businessId: number;
  businessName: string;
  status: 'invoiced' | 'no_overage' | 'skipped' | 'failed';
  reason?: string;
  overageMinutes?: number;
  overageAmount?: number;
  stripeInvoiceId?: string;
}

/**
 * Check if a business is a grandfathered "Founder" account.
 */
function isFounderAccount(business: any): boolean {
  if (!business.createdAt) return false;
  const createdAt = new Date(business.createdAt);
  return createdAt < SUBSCRIPTION_LAUNCH_DATE;
}

/**
 * Get the previous completed billing period for a business.
 * The "previous period" is the one that just ended when the current period started.
 */
function getPreviousBillingPeriod(subscriptionStartDate?: Date | null): { periodStart: Date; periodEnd: Date } {
  const now = new Date();

  if (subscriptionStartDate) {
    const startDay = new Date(subscriptionStartDate).getDate();

    // Current period start: the most recent occurrence of startDay
    const currentPeriodStart = new Date(now.getFullYear(), now.getMonth(), startDay);
    currentPeriodStart.setHours(0, 0, 0, 0);
    if (currentPeriodStart > now) {
      currentPeriodStart.setMonth(currentPeriodStart.getMonth() - 1);
    }

    // Previous period: one month before current period
    const previousPeriodStart = new Date(currentPeriodStart);
    previousPeriodStart.setMonth(previousPeriodStart.getMonth() - 1);

    return {
      periodStart: previousPeriodStart,
      periodEnd: currentPeriodStart,
    };
  }

  // Fallback: previous calendar month
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return { periodStart: previousMonthStart, periodEnd: currentMonthStart };
}

/**
 * Get total call minutes used by a business in a specific date range.
 */
async function getMinutesUsedForPeriod(businessId: number, periodStart: Date, periodEnd: Date): Promise<number> {
  try {
    const result = await db
      .select({
        totalSeconds: sql<number>`COALESCE(SUM(${callLogs.callDuration}), 0)`,
      })
      .from(callLogs)
      .where(
        and(
          eq(callLogs.businessId, businessId),
          gte(callLogs.callTime, periodStart),
          lt(callLogs.callTime, periodEnd)
        )
      );

    const totalSeconds = Number(result[0]?.totalSeconds || 0);
    return Math.ceil(totalSeconds / 60);
  } catch (error: any) {
    if (error.message?.includes('does not exist')) {
      console.warn(`[OverageBilling] Column missing for business ${businessId}, returning 0 minutes`);
      return 0;
    }
    throw error;
  }
}

/**
 * Format a date range as a human-readable period label.
 */
function formatPeriodLabel(periodStart: Date, periodEnd: Date): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const startMonth = months[periodStart.getMonth()];
  const startDay = periodStart.getDate();
  const endMonth = months[periodEnd.getMonth()];
  const endDay = periodEnd.getDate();
  const year = periodStart.getFullYear();
  return `${startMonth} ${startDay} - ${endMonth} ${endDay}, ${year}`;
}

/**
 * Process overage billing for a single business.
 * Idempotent: will not double-bill thanks to unique constraint on (business_id, period_start).
 */
export async function processOverageBilling(businessId: number): Promise<OverageChargeResult> {
  // 1. Load business
  const [business] = await db.select().from(businesses).where(eq(businesses.id, businessId));
  if (!business) {
    return { businessId, businessName: 'Unknown', status: 'skipped', reason: 'Business not found' };
  }

  const bizName = business.name || `Business #${businessId}`;

  // 2. Check exemptions
  if (isFounderAccount(business)) {
    return { businessId, businessName: bizName, status: 'skipped', reason: 'Founder account (unlimited)' };
  }

  if (business.subscriptionStatus !== 'active') {
    return { businessId, businessName: bizName, status: 'skipped', reason: `Subscription status: ${business.subscriptionStatus}` };
  }

  if (!business.stripeCustomerId) {
    return { businessId, businessName: bizName, status: 'skipped', reason: 'No Stripe customer ID' };
  }

  // 3. Get the just-completed billing period
  const { periodStart, periodEnd } = getPreviousBillingPeriod(business.subscriptionStartDate);

  // Don't bill for periods that haven't ended yet or are too far in the past
  const now = new Date();
  if (periodEnd > now) {
    return { businessId, businessName: bizName, status: 'skipped', reason: 'Current period not yet complete' };
  }

  // 4. Check if already billed (idempotent)
  const existing = await db.select()
    .from(overageCharges)
    .where(
      and(
        eq(overageCharges.businessId, businessId),
        eq(overageCharges.periodStart, periodStart)
      )
    );

  if (existing.length > 0) {
    return { businessId, businessName: bizName, status: 'skipped', reason: `Already processed for period starting ${periodStart.toISOString().split('T')[0]}` };
  }

  // 5. Get plan details
  const plan = business.stripePlanId
    ? (await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, business.stripePlanId)))[0]
    : null;

  if (!plan) {
    return { businessId, businessName: bizName, status: 'skipped', reason: 'No subscription plan found' };
  }

  const minutesIncluded = plan.maxCallMinutes || 0;
  const overageRate = plan.overageRatePerMinute || 0;

  // 6. Calculate usage for the completed period
  const minutesUsed = await getMinutesUsedForPeriod(businessId, periodStart, periodEnd);
  const overageMinutes = Math.max(0, minutesUsed - minutesIncluded);
  const overageAmount = Math.round(overageMinutes * overageRate * 100) / 100;

  // 7. No overage — record it and move on
  if (overageMinutes === 0) {
    await db.insert(overageCharges).values({
      businessId,
      periodStart,
      periodEnd,
      minutesUsed,
      minutesIncluded,
      overageMinutes: 0,
      overageRate,
      overageAmount: 0,
      status: 'no_overage',
      planName: plan.name,
      planTier: plan.planTier,
    });

    return { businessId, businessName: bizName, status: 'no_overage', overageMinutes: 0, overageAmount: 0 };
  }

  // 8. Create Stripe invoice for overage
  const periodLabel = formatPeriodLabel(periodStart, periodEnd);
  const description = `AI Receptionist Overage: ${overageMinutes} min @ $${overageRate.toFixed(2)}/min (${periodLabel})`;

  try {
    const invoice = await stripeService.createInvoice(
      business.stripeCustomerId,
      description,
      overageAmount,
      {
        type: 'overage',
        businessId: String(businessId),
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        overageMinutes: String(overageMinutes),
        overageRate: String(overageRate),
      }
    );

    // 9. Record the charge
    await db.insert(overageCharges).values({
      businessId,
      periodStart,
      periodEnd,
      minutesUsed,
      minutesIncluded,
      overageMinutes,
      overageRate,
      overageAmount,
      stripeInvoiceId: invoice.id,
      stripeInvoiceUrl: invoice.hosted_invoice_url || null,
      status: 'invoiced',
      planName: plan.name,
      planTier: plan.planTier,
    });

    console.log(`[OverageBilling] Invoiced business ${businessId} (${bizName}): ${overageMinutes} min @ $${overageRate}/min = $${overageAmount} (invoice ${invoice.id})`);

    return {
      businessId,
      businessName: bizName,
      status: 'invoiced',
      overageMinutes,
      overageAmount,
      stripeInvoiceId: invoice.id,
    };
  } catch (error: any) {
    console.error(`[OverageBilling] Failed to invoice business ${businessId}:`, error.message);

    // Record the failure
    await db.insert(overageCharges).values({
      businessId,
      periodStart,
      periodEnd,
      minutesUsed,
      minutesIncluded,
      overageMinutes,
      overageRate,
      overageAmount,
      status: 'failed',
      failureReason: error.message,
      planName: plan.name,
      planTier: plan.planTier,
    });

    return { businessId, businessName: bizName, status: 'failed', reason: error.message };
  }
}

/**
 * Process overage billing for ALL businesses.
 * One failure does not stop processing others.
 */
export async function processAllOverageBilling(): Promise<OverageChargeResult[]> {
  const allBiz = await db.select({
    id: businesses.id,
    name: businesses.name,
  }).from(businesses);

  const results: OverageChargeResult[] = [];

  for (const biz of allBiz) {
    try {
      const result = await processOverageBilling(biz.id);
      results.push(result);
    } catch (error: any) {
      console.error(`[OverageBilling] Unexpected error for business ${biz.id}:`, error.message);
      results.push({
        businessId: biz.id,
        businessName: biz.name || `Business #${biz.id}`,
        status: 'failed',
        reason: error.message,
      });
    }
  }

  return results;
}

/**
 * Get overage billing history for a business.
 */
export async function getOverageHistory(businessId: number): Promise<any[]> {
  const charges = await db.select()
    .from(overageCharges)
    .where(eq(overageCharges.businessId, businessId))
    .orderBy(sql`${overageCharges.periodStart} DESC`);

  return charges;
}
