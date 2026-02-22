import { db } from '../db';
import { callLogs, businesses, subscriptionPlans } from '@shared/schema';
import { eq, and, gte, sql } from 'drizzle-orm';

/**
 * Usage tracking service for AI call minutes and subscription enforcement.
 * Tracks call duration from Vapi webhooks (already stored in call_logs.call_duration in seconds)
 * and enforces plan limits.
 */

const TRIAL_MINUTES = 50; // 50 free minutes during 14-day trial
const FREE_TIER_MINUTES = 0; // No free minutes after trial expires

export interface UsageInfo {
  minutesUsed: number;
  minutesIncluded: number;
  minutesRemaining: number;
  overageMinutes: number;
  overageRate: number; // $ per minute
  overageCost: number;
  percentUsed: number;
  planName: string;
  planTier: string | null;
  isTrialActive: boolean;
  trialEndsAt: Date | null;
  subscriptionStatus: string;
  canAcceptCalls: boolean;
}

/**
 * Get the start of the current billing month.
 * Uses the business's subscription start date to determine billing cycle,
 * or falls back to the 1st of the current month.
 */
function getBillingPeriodStart(subscriptionStartDate?: Date | null): Date {
  const now = new Date();

  if (subscriptionStartDate) {
    // Align to the same day of month as subscription start
    const startDay = subscriptionStartDate.getDate();
    const periodStart = new Date(now.getFullYear(), now.getMonth(), startDay);

    // If we haven't reached the billing day yet this month, go back one month
    if (periodStart > now) {
      periodStart.setMonth(periodStart.getMonth() - 1);
    }

    periodStart.setHours(0, 0, 0, 0);
    return periodStart;
  }

  // Fallback: first of current month
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

/**
 * Get total call minutes used by a business in the current billing period.
 * Call duration is stored in seconds in the call_logs table.
 */
export async function getMinutesUsedThisMonth(businessId: number, subscriptionStartDate?: Date | null): Promise<number> {
  const periodStart = getBillingPeriodStart(subscriptionStartDate);

  const result = await db
    .select({
      totalSeconds: sql<number>`COALESCE(SUM(${callLogs.callDuration}), 0)`,
    })
    .from(callLogs)
    .where(
      and(
        eq(callLogs.businessId, businessId),
        gte(callLogs.callTime, periodStart)
      )
    );

  const totalSeconds = Number(result[0]?.totalSeconds || 0);
  // Round up to nearest minute (partial minutes count as full)
  return Math.ceil(totalSeconds / 60);
}

/**
 * Get comprehensive usage information for a business.
 */
export async function getUsageInfo(businessId: number): Promise<UsageInfo> {
  // Fetch business with plan info
  const [business] = await db
    .select()
    .from(businesses)
    .where(eq(businesses.id, businessId));

  if (!business) {
    throw new Error('Business not found');
  }

  // Check trial status
  const now = new Date();
  const isTrialActive = business.trialEndsAt ? new Date(business.trialEndsAt) > now : false;
  const subscriptionStatus = business.subscriptionStatus || 'inactive';
  const isSubscribed = subscriptionStatus === 'active' || subscriptionStatus === 'trialing';

  // Get plan details if subscribed
  let plan = null;
  if (business.stripePlanId) {
    const [planRecord] = await db
      .select()
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.id, business.stripePlanId));
    plan = planRecord || null;
  }

  // Determine included minutes
  let minutesIncluded = FREE_TIER_MINUTES;
  let overageRate = 0;
  let planName = 'No Plan';
  let planTier: string | null = null;

  if (isTrialActive && !isSubscribed) {
    minutesIncluded = TRIAL_MINUTES;
    planName = 'Free Trial';
    planTier = 'trial';
  } else if (isSubscribed && plan) {
    minutesIncluded = plan.maxCallMinutes || 0;
    overageRate = plan.overageRatePerMinute || 0;
    planName = plan.name;
    planTier = plan.planTier || null;
  }

  // Get actual usage
  const minutesUsed = await getMinutesUsedThisMonth(businessId, business.subscriptionStartDate);
  const minutesRemaining = Math.max(0, minutesIncluded - minutesUsed);
  const overageMinutes = Math.max(0, minutesUsed - minutesIncluded);
  const overageCost = overageMinutes * overageRate;
  const percentUsed = minutesIncluded > 0 ? Math.min(100, Math.round((minutesUsed / minutesIncluded) * 100)) : 0;

  // Determine if business can accept calls
  // Allow calls if: in trial, has active subscription, or hasn't exceeded free tier
  const canAcceptCalls = isTrialActive || isSubscribed;

  return {
    minutesUsed,
    minutesIncluded,
    minutesRemaining,
    overageMinutes,
    overageRate,
    overageCost,
    percentUsed,
    planName,
    planTier,
    isTrialActive,
    trialEndsAt: business.trialEndsAt ? new Date(business.trialEndsAt) : null,
    subscriptionStatus,
    canAcceptCalls,
  };
}

/**
 * Quick check: can this business accept AI calls right now?
 * Used by Vapi webhook handler to gate incoming calls.
 */
export async function canBusinessAcceptCalls(businessId: number): Promise<{ allowed: boolean; reason?: string }> {
  try {
    const [business] = await db
      .select()
      .from(businesses)
      .where(eq(businesses.id, businessId));

    if (!business) {
      return { allowed: false, reason: 'Business not found' };
    }

    const now = new Date();
    const isTrialActive = business.trialEndsAt ? new Date(business.trialEndsAt) > now : false;
    const subscriptionStatus = business.subscriptionStatus || 'inactive';
    const isSubscribed = subscriptionStatus === 'active' || subscriptionStatus === 'trialing';

    // If no trial and no subscription, block
    if (!isTrialActive && !isSubscribed) {
      return { allowed: false, reason: 'No active subscription or trial' };
    }

    // Check minute limits
    const minutesUsed = await getMinutesUsedThisMonth(businessId, business.subscriptionStartDate);

    if (isTrialActive && !isSubscribed) {
      // Trial: hard limit at TRIAL_MINUTES
      if (minutesUsed >= TRIAL_MINUTES) {
        return { allowed: false, reason: `Trial limit of ${TRIAL_MINUTES} minutes reached` };
      }
    }

    // For paid subscribers, always allow (overage is billed)
    // But we could add a hard cap for safety if needed

    return { allowed: true };
  } catch (error) {
    console.error('[UsageService] Error checking call allowance:', error);
    // Fail open — don't block calls due to internal errors
    return { allowed: true };
  }
}

export default {
  getMinutesUsedThisMonth,
  getUsageInfo,
  canBusinessAcceptCalls,
};
