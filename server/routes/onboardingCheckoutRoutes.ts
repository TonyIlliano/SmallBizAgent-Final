/**
 * Onboarding Checkout Routes — Card-First Onboarding
 *
 * These endpoints power the new /onboarding/checkout page, which sits between
 * the plan picker and the business-info form. They create a Stripe Customer
 * + SetupIntent so the user can save a card BEFORE any business is provisioned.
 *
 * Endpoints:
 *   POST /api/onboarding/start-trial    — create/reuse Stripe Customer + SetupIntent
 *   GET  /api/onboarding/payment-status — poll whether the SetupIntent has succeeded
 *
 * The Stripe Customer ID is stored on `users.stripeCustomerId` (one-to-one with
 * the user) so it persists across abandonment + resume. If the user closes the
 * browser mid-flow, calling start-trial again returns a fresh SetupIntent on
 * the same Customer — no duplicates.
 *
 * The Subscription itself is NOT created here. That happens in the
 * setup_intent.succeeded webhook handler in subscriptionService.ts, after the
 * payment method is confirmed attached. This decoupling means we never end up
 * with a half-created subscription if the user bails at the card step.
 */

import type { Express, Request, Response } from 'express';
import Stripe from 'stripe';
import { db } from '../db';
import { users, subscriptionPlans } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { isAuthenticated, requireEmailVerified } from '../middleware/auth';
import { hasPaymentMethodOnFile } from '../middleware/paymentRequired';

let stripe: Stripe | null = null;
function getStripe(): Stripe {
  if (!stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY is not set');
    }
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2025-03-31.basil',
    });
  }
  return stripe;
}

export function registerOnboardingCheckoutRoutes(app: Express) {
  /**
   * POST /api/onboarding/start-trial
   *
   * Idempotent. Creates (or reuses) a Stripe Customer for the user and returns
   * a fresh SetupIntent clientSecret. The frontend uses this to render Stripe
   * Elements and call `stripe.confirmSetup()`.
   *
   * Requires:
   *   - authenticated
   *   - email verified
   *   - a non-free plan selected in session (Free skips checkout entirely)
   *
   * Body: none — plan comes from session, user comes from auth.
   *
   * Returns: { clientSecret, customerId, planName }
   */
  app.post(
    '/api/onboarding/start-trial',
    isAuthenticated,
    requireEmailVerified,
    async (req: Request, res: Response) => {
      try {
        const userId = req.user!.id;

        // Read the selected plan from session. The Free tier short-circuits.
        const selectedPlanId = (req.session as any)?.onboarding?.selectedPlanId;
        if (!selectedPlanId || typeof selectedPlanId !== 'number') {
          return res.status(400).json({
            error: 'Plan selection required',
            code: 'PLAN_REQUIRED',
            redirectTo: '/onboarding/subscription',
          });
        }

        // Verify the plan exists + look up its tier so we can short-circuit Free.
        const [plan] = await db
          .select()
          .from(subscriptionPlans)
          .where(eq(subscriptionPlans.id, selectedPlanId));
        if (!plan) {
          return res.status(400).json({
            error: 'Selected plan not found',
            code: 'PLAN_NOT_FOUND',
          });
        }
        if (plan.planTier === 'free') {
          // Free plan doesn't need card collection at all. Tell the client to
          // skip the checkout step.
          return res.json({
            skipCheckout: true,
            planName: plan.name,
          });
        }

        // Re-fetch the user to get the latest stripeCustomerId (session can be stale).
        const [user] = await db.select().from(users).where(eq(users.id, userId));
        if (!user) {
          return res.status(401).json({ error: 'User not found' });
        }

        // 1. Get or create Stripe Customer for this user
        let customerId = user.stripeCustomerId;
        if (customerId) {
          // Verify the customer still exists in Stripe (could have been deleted by admin)
          try {
            const existing = await getStripe().customers.retrieve(customerId);
            if ('deleted' in existing && existing.deleted) {
              customerId = null;
            }
          } catch {
            customerId = null;
          }
        }

        if (!customerId) {
          const customer = await getStripe().customers.create({
            email: user.email,
            name: user.username,
            metadata: {
              userId: String(userId),
              source: 'onboarding-checkout',
            },
          });
          customerId = customer.id;
          await db
            .update(users)
            .set({ stripeCustomerId: customerId, updatedAt: new Date() })
            .where(eq(users.id, userId));
          console.log(`[OnboardingCheckout] Created Stripe customer ${customerId} for user ${userId}`);
        } else {
          console.log(`[OnboardingCheckout] Reusing Stripe customer ${customerId} for user ${userId}`);
        }

        // 2. Already has a payment method? Skip the SetupIntent — they're done.
        const alreadyOnFile = await hasPaymentMethodOnFile(customerId);
        if (alreadyOnFile) {
          return res.json({
            alreadyOnFile: true,
            customerId,
            planName: plan.name,
          });
        }

        // 3. Create a fresh SetupIntent. usage:'off_session' so Stripe can charge
        //    the card automatically when the trial ends.
        const setupIntent = await getStripe().setupIntents.create({
          customer: customerId,
          payment_method_types: ['card'],
          usage: 'off_session',
          metadata: {
            userId: String(userId),
            planId: String(selectedPlanId),
            promoCode: (req.session as any)?.onboarding?.promoCode || '',
            purpose: 'onboarding_trial_card',
          },
        });

        console.log(
          `[OnboardingCheckout] SetupIntent ${setupIntent.id} created for user ${userId}, plan ${selectedPlanId}`,
        );

        return res.json({
          clientSecret: setupIntent.client_secret,
          customerId,
          planName: plan.name,
        });
      } catch (err: any) {
        console.error('[OnboardingCheckout] start-trial error:', err?.message || err);
        return res.status(500).json({
          error: 'Could not start trial. Please try again.',
          code: 'STRIPE_ERROR',
        });
      }
    },
  );

  /**
   * GET /api/onboarding/payment-status
   *
   * Poll endpoint used by the checkout page after stripe.confirmSetup() resolves.
   * Returns { paymentMethodOnFile: boolean }. Frontend polls until true (or a
   * timeout) before redirecting to /onboarding for the business-info form.
   *
   * Trusts Stripe's customer.invoice_settings.default_payment_method as the
   * source of truth — the SetupIntent.succeeded webhook attaches the PM there.
   */
  app.get(
    '/api/onboarding/payment-status',
    isAuthenticated,
    requireEmailVerified,
    async (req: Request, res: Response) => {
      try {
        const userId = req.user!.id;
        const [user] = await db.select().from(users).where(eq(users.id, userId));
        if (!user) {
          return res.status(401).json({ error: 'User not found' });
        }

        // Grandfathered users + admins are always "on file" from the gate's perspective
        if (user.paymentMethodGrandfathered || req.user!.role === 'admin') {
          return res.json({ paymentMethodOnFile: true, grandfathered: !!user.paymentMethodGrandfathered });
        }

        const onFile = await hasPaymentMethodOnFile(user.stripeCustomerId);
        return res.json({ paymentMethodOnFile: onFile });
      } catch (err: any) {
        console.error('[OnboardingCheckout] payment-status error:', err?.message || err);
        return res.status(500).json({ error: 'Could not check payment status' });
      }
    },
  );

  /**
   * GET /api/onboarding/diagnose-subscription
   *
   * Self-serve diagnostic for the current user. Returns the user's Stripe
   * customer's active subscriptions and the business row's stripeSubscriptionId,
   * so the user (or an engineer looking at the output) can see if there are
   * duplicates or a DB/Stripe mismatch.
   *
   * No state changes. Authenticated only — scoped to the requesting user.
   */
  app.get(
    '/api/onboarding/diagnose-subscription',
    isAuthenticated,
    requireEmailVerified,
    async (req: Request, res: Response) => {
      try {
        const userId = req.user!.id;
        const { businesses } = await import('@shared/schema');
        const { db } = await import('../db');
        const { eq } = await import('drizzle-orm');

        const [user] = await db.select().from(users).where(eq(users.id, userId));
        if (!user) {
          return res.status(401).json({ error: 'User not found' });
        }

        const [business] = user.businessId
          ? await db.select().from(businesses).where(eq(businesses.id, user.businessId))
          : [null];

        let stripeSubs: any[] = [];
        if (user.stripeCustomerId) {
          try {
            const list = await getStripe().subscriptions.list({
              customer: user.stripeCustomerId,
              status: 'all',
              limit: 20,
            });
            stripeSubs = list.data.map((s) => ({
              id: s.id,
              status: s.status,
              created: new Date(s.created * 1000).toISOString(),
              trial_end: s.trial_end ? new Date(s.trial_end * 1000).toISOString() : null,
              cancel_at_period_end: s.cancel_at_period_end,
              items: s.items.data.map((i) => ({ price: i.price.id })),
            }));
          } catch (err: any) {
            stripeSubs = [{ error: err?.message || String(err) }];
          }
        }

        return res.json({
          user: {
            id: user.id,
            email: user.email,
            businessId: user.businessId,
            stripeCustomerId: user.stripeCustomerId,
            paymentMethodGrandfathered: user.paymentMethodGrandfathered,
          },
          business: business
            ? {
                id: business.id,
                name: business.name,
                subscriptionStatus: business.subscriptionStatus,
                stripeCustomerId: business.stripeCustomerId,
                stripeSubscriptionId: business.stripeSubscriptionId,
                stripePlanId: business.stripePlanId,
                trialEndsAt: business.trialEndsAt,
              }
            : null,
          stripeSubscriptions: stripeSubs,
          activeStripeSubs: stripeSubs.filter((s: any) => s.status === 'trialing' || s.status === 'active'),
          duplicateDetected: stripeSubs.filter((s: any) => s.status === 'trialing' || s.status === 'active').length > 1,
        });
      } catch (err: any) {
        console.error('[OnboardingCheckout] diagnose error:', err?.message || err);
        return res.status(500).json({ error: 'Could not diagnose subscription state', details: err?.message });
      }
    },
  );

  /**
   * POST /api/onboarding/repair-subscription
   *
   * Self-serve repair: if the current user has multiple active Stripe
   * subscriptions (trialing or active) on the same customer, keep the BEST
   * one and cancel the rest immediately. Then align the user's business row
   * to point at the survivor.
   *
   * Survivor selection (in order of preference):
   *   1. Subscription with a discount/coupon attached (preserves any promo
   *      the customer applied — keep-oldest would silently strip their discount)
   *   2. If none has a discount, the OLDEST subscription (most likely the
   *      "real" one, others are duplicates from retries/races)
   *
   * Idempotent. No-op if there's no duplicate.
   */
  app.post(
    '/api/onboarding/repair-subscription',
    isAuthenticated,
    requireEmailVerified,
    async (req: Request, res: Response) => {
      try {
        const userId = req.user!.id;
        const { businesses } = await import('@shared/schema');
        const { db } = await import('../db');
        const { eq } = await import('drizzle-orm');

        const [user] = await db.select().from(users).where(eq(users.id, userId));
        if (!user) return res.status(401).json({ error: 'User not found' });
        if (!user.stripeCustomerId) return res.status(400).json({ error: 'No Stripe customer for this user' });
        if (!user.businessId) return res.status(400).json({ error: 'No business linked to this user' });

        // Need expanded `discounts` to see if a coupon is attached.
        const list = await getStripe().subscriptions.list({
          customer: user.stripeCustomerId,
          status: 'all',
          limit: 20,
          expand: ['data.discounts'],
        });
        const live = list.data
          .filter((s) => s.status === 'trialing' || s.status === 'active')
          .sort((a, b) => a.created - b.created);

        if (live.length === 0) {
          return res.json({ action: 'noop', reason: 'No live subscriptions found', cancelledIds: [], survivorId: null });
        }

        // Smart survivor selection: prefer the sub with a discount/coupon.
        // Stripe's `subscription.discounts` is the new API surface; older
        // accounts may still have `subscription.discount` (singular). Check both.
        const hasDiscount = (s: any): boolean => {
          const discounts = s.discounts;
          if (Array.isArray(discounts) && discounts.length > 0) return true;
          if (s.discount) return true;
          return false;
        };

        const discounted = live.filter(hasDiscount).sort((a, b) => a.created - b.created);
        const survivor = discounted.length > 0 ? discounted[0] : live[0];
        const survivorReason = discounted.length > 0
          ? 'has-discount-attached'
          : 'oldest-no-discount';

        const toCancel = live.filter((s) => s.id !== survivor.id);
        const cancelledIds: string[] = [];
        for (const sub of toCancel) {
          try {
            await getStripe().subscriptions.cancel(sub.id);
            cancelledIds.push(sub.id);
            console.log(`[RepairSubscription] Canceled duplicate ${sub.id} for user ${userId}`);
          } catch (cancelErr: any) {
            console.error(`[RepairSubscription] Failed to cancel ${sub.id}:`, cancelErr?.message || cancelErr);
          }
        }

        // Align DB business row to point at the survivor
        await db.update(businesses)
          .set({
            stripeSubscriptionId: survivor.id,
            subscriptionStatus: survivor.status,
            updatedAt: new Date(),
          })
          .where(eq(businesses.id, user.businessId));

        return res.json({
          action: 'repaired',
          survivorId: survivor.id,
          survivorStatus: survivor.status,
          survivorReason,
          cancelledIds,
          totalLiveBefore: live.length,
          totalLiveAfter: 1,
        });
      } catch (err: any) {
        console.error('[OnboardingCheckout] repair error:', err?.message || err);
        return res.status(500).json({ error: 'Could not repair subscription state', details: err?.message });
      }
    },
  );
}
