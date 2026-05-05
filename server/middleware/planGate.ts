import { Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { businesses } from '@shared/schema';
import { eq } from 'drizzle-orm';

/**
 * Plan gate middleware.
 *
 * Free tier (subscription_status = 'free') is CRM-only — no AI receptionist,
 * no outbound SMS, no email reminders, no public booking page, no AI agents.
 * This middleware is the route-level enforcement layer.
 *
 * Routes that mount `requirePaidPlan` will 402 with a clear upgrade message
 * when called by a free-tier business. Admins always pass.
 *
 * Use after `isAuthenticated`, NOT in place of it.
 */

const FREE_TIER_BLOCKED_MESSAGE = 'This feature requires a paid plan. Upgrade to reactivate.';

export async function requirePaidPlan(req: Request, res: Response, next: NextFunction) {
  // Admins always pass
  if (req.user?.role === 'admin') return next();

  const businessId = req.user?.businessId;
  if (!businessId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const [business] = await db.select().from(businesses).where(eq(businesses.id, businessId));
    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }

    // Block free tier
    if (business.subscriptionStatus === 'free') {
      return res.status(402).json({
        error: FREE_TIER_BLOCKED_MESSAGE,
        code: 'PAID_PLAN_REQUIRED',
        upgradeUrl: '/settings?tab=subscription',
      });
    }

    next();
  } catch (err) {
    console.error('[planGate] Error checking subscription status:', err);
    // Fail open — don't block legit users due to a transient DB error
    next();
  }
}
