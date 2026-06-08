/**
 * Payment-required gate.
 *
 * Used by the card-first onboarding flow. Routes that mount this middleware
 * will return 402 PAYMENT_METHOD_REQUIRED unless ONE of the following is true:
 *
 *   1. User is an admin (platform operations bypass)
 *   2. User is grandfathered (every user alive in the DB at migration time)
 *   3. The currently selected onboarding plan is the Free tier (no card needed)
 *   4. User has a Stripe Customer ID AND that customer has a default payment
 *      method attached (the only way `paymentMethodOnFile === true`)
 *
 * Designed to fail-OPEN on Stripe API errors (transient network issues should
 * never lock a paying customer out of their dashboard). Failing closed would
 * be safer for revenue but punishes legit users for upstream Stripe outages.
 *
 * Use AFTER `isAuthenticated` + `requireEmailVerified` so the user's identity
 * and verification state are already established.
 */

import { Request, Response, NextFunction } from 'express';
import Stripe from 'stripe';
import { db } from '../db';
import { users, businesses, subscriptionPlans } from '@shared/schema';
import { eq } from 'drizzle-orm';
import {
  isStripeResourceMissing,
  clearOrphanedBusinessStripeCustomer,
  clearOrphanedUserStripeCustomer,
} from '../utils/stripeOrphanCheck';

let stripe: Stripe | null = null;
function getStripe(): Stripe {
  if (!stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY is not set — cannot check payment method');
    }
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2025-03-31.basil',
    });
  }
  return stripe;
}

/**
 * Check whether a Stripe Customer has a default payment method attached.
 * Used by both the middleware and the GET /payment-status endpoint.
 *
 * @param stripeCustomerId  The Stripe Customer ID stored on `users` or `businesses`.
 * @param businessId        Optional. When supplied, an orphan (resource_missing
 *                          400) on the customer lookup will also clear
 *                          `businesses.stripeCustomerId` for this business so
 *                          downstream code paths (dedup sweeper, repair
 *                          endpoint, createSubscription) stop re-hitting the
 *                          dead ID.
 */
export async function hasPaymentMethodOnFile(
  stripeCustomerId: string | null | undefined,
  businessId?: number,
): Promise<boolean> {
  if (!stripeCustomerId) return false;
  try {
    const stripe = getStripe();
    const customer = await stripe.customers.retrieve(stripeCustomerId);
    if ('deleted' in customer && customer.deleted) return false;

    // Primary check: customer.invoice_settings.default_payment_method.
    // The setup_intent.succeeded webhook handler sets this AFTER a successful
    // SetupIntent. If we get here while the webhook hasn't fired yet (Stripe
    // can take a few seconds), fall through to the payment_methods list check.
    const defaultPm = (customer as Stripe.Customer).invoice_settings?.default_payment_method;
    if (defaultPm) return true;

    // Fallback: list any card payment_methods attached to the customer.
    // This catches the "card was saved via SetupIntent but the webhook
    // hasn't run yet" race AND the "webhook ran but skipped this purpose"
    // bug we just fixed. Either way, if a card is attached we're good.
    const paymentMethods = await stripe.paymentMethods.list({
      customer: stripeCustomerId,
      type: 'card',
      limit: 1,
    });
    return paymentMethods.data.length > 0;
  } catch (err: any) {
    if (isStripeResourceMissing(err)) {
      // Orphan auto-heal: the stored Customer ID points at a deleted
      // Stripe Customer. Clear it from whatever row(s) we have a handle
      // on, then return false (no payment method on file) so the gate
      // correctly redirects to /onboarding/checkout where a fresh
      // Customer will be created.
      if (businessId !== undefined) {
        await clearOrphanedBusinessStripeCustomer(businessId, stripeCustomerId);
      }
      return false;
    }
    console.warn(`[paymentRequired] Stripe customer ${stripeCustomerId} lookup failed: ${err?.message || err}`);
    // Fail-open: if Stripe can't be reached, assume the user has a card.
    // The gate's job is to block obvious abuse, not to gate every request
    // on Stripe availability.
    return true;
  }
}

export async function requirePaymentMethod(req: Request, res: Response, next: NextFunction) {
  // Belt-and-suspenders: middleware should run after isAuthenticated, but if
  // somehow it doesn't, return 401 rather than crashing on undefined req.user.
  if (!req.isAuthenticated() || !req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  // 1. Admin bypass
  if (req.user.role === 'admin') return next();

  try {
    // Re-fetch the user so we see the latest grandfathering flag + stripeCustomerId.
    // The session copy can be stale across deploys.
    const [user] = await db.select().from(users).where(eq(users.id, req.user.id));
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // 2. Grandfathered bypass — set by the v1 backfill migration for every
    //    user alive in the DB at deploy time. New users default to false.
    if (user.paymentMethodGrandfathered) return next();

    // 3. Free-plan bypass — if the user has selected the Free tier in this
    //    onboarding session, no card is required.
    const selectedPlanId = (req.session as any)?.onboarding?.selectedPlanId;
    if (selectedPlanId && typeof selectedPlanId === 'number') {
      try {
        const [plan] = await db
          .select({ planTier: subscriptionPlans.planTier })
          .from(subscriptionPlans)
          .where(eq(subscriptionPlans.id, selectedPlanId));
        if (plan?.planTier === 'free') return next();
      } catch (planErr) {
        // Plan lookup failure shouldn't block — continue to payment-method check
        console.warn('[paymentRequired] Plan lookup failed:', planErr);
      }
    }

    // 4. Payment-method-on-file check. Pass businessId so an orphan
    //    detected here also clears the dead reference on businesses.stripeCustomerId,
    //    stopping downstream code paths (dedup sweeper, repair endpoint)
    //    from re-hitting Stripe with the same dead ID.
    const onFile = await hasPaymentMethodOnFile(user.stripeCustomerId, user.businessId ?? undefined);
    if (onFile) return next();

    // Gate hit — no path to bypass. Tell the client where to go.
    return res.status(402).json({
      error: 'Payment method required',
      code: 'PAYMENT_METHOD_REQUIRED',
      redirectTo: '/onboarding/checkout',
      message: 'Please add a payment method to start your trial.',
    });
  } catch (err: any) {
    console.error('[paymentRequired] Unexpected error, failing open:', err?.message || err);
    // Fail-open on unexpected errors — same logic as planGate.ts.
    return next();
  }
}
