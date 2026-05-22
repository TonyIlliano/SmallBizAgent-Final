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
}
