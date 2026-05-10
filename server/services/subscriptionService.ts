import { subscriptionPlans, businesses, overageCharges, businessGroups } from '@shared/schema';
import { db } from '../db';
import { eq } from 'drizzle-orm';
import Stripe from 'stripe';
import { sendPaymentFailedEmail } from '../emailService';
import { toMoney } from '../utils/money';

/**
 * Stripe API version 2025-03-31.basil removed some top-level fields from
 * Subscription and Invoice types. These interfaces provide type-safe access
 * to the legacy fields that Stripe still returns in API responses.
 */
interface SubscriptionWithLegacyFields {
  current_period_end: number;
  discount?: { coupon: { percent_off: number | null; name: string | null } } | null;
  discounts?: Array<string | { coupon: { percent_off: number | null; name: string | null } }>;
}

interface InvoiceWithLegacyFields {
  subscription?: string | null;
  attempt_count?: number;
}

/**
 * Helper to access legacy Stripe fields that exist on the API response
 * but are not in the SDK type definitions for this API version.
 */
function asLegacySubscription(sub: Stripe.Subscription): SubscriptionWithLegacyFields {
  return sub as unknown as SubscriptionWithLegacyFields;
}

function asLegacyInvoice(inv: Stripe.Invoice): InvoiceWithLegacyFields {
  return inv as unknown as InvoiceWithLegacyFields;
}

/**
 * When latest_invoice is expanded with payment_intent, this interface
 * provides type-safe access to the nested client_secret.
 */
interface ExpandedInvoice {
  payment_intent?: { client_secret: string | null } | null;
}

function asExpandedInvoice(inv: string | Stripe.Invoice | null): ExpandedInvoice | null {
  if (!inv || typeof inv === 'string') return null;
  return inv as unknown as ExpandedInvoice;
}

// Initialize Stripe lazily — don't crash at module load if env var is missing
let stripe: Stripe | null = null;

function getStripe(): Stripe {
  if (!stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY is not set — cannot perform Stripe operations');
    }
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2025-03-31.basil',
    });
  }
  return stripe;
}

export class SubscriptionService {
  /**
   * Get all available subscription plans
   */
  async getPlans() {
    try {
      const plans = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.active, true));
      return plans;
    } catch (error) {
      console.error('Error getting subscription plans:', error);
      throw new Error('Failed to retrieve subscription plans');
    }
  }

  /**
   * Get subscription status for a business
   * @param businessId The ID of the business
   */
  async getSubscriptionStatus(businessId: number) {
    try {
      const business = await db.select().from(businesses).where(eq(businesses.id, businessId)).limit(1);
      
      if (!business || business.length === 0) {
        throw new Error('Business not found');
      }
      
      // Get the business record
      const businessRecord = business[0];
      
      // If the business doesn't have a subscription, return basic status
      if (!businessRecord.stripeSubscriptionId) {
        return {
          status: 'none',
          message: 'No active subscription',
          trialEndsAt: businessRecord.trialEndsAt,
          isTrialActive: businessRecord.trialEndsAt ? new Date(businessRecord.trialEndsAt) > new Date() : false
        };
      }
      
      // Fetch live subscription data from Stripe
      try {
        const subscription = await getStripe().subscriptions.retrieve(businessRecord.stripeSubscriptionId);

        // Check if subscription is active
        const isActive = subscription.status === 'active' || subscription.status === 'trialing';
        const periodEnd = new Date(asLegacySubscription(subscription).current_period_end * 1000);
        
        // Get plan details
        const plan = await db.select()
          .from(subscriptionPlans)
          .where(eq(subscriptionPlans.id, businessRecord.stripePlanId as number))
          .limit(1);
        
        return {
          status: subscription.status,
          isActive,
          currentPeriodEnd: periodEnd,
          plan: plan[0] || null,
          cancelAtPeriodEnd: subscription.cancel_at_period_end
        };
      } catch (stripeError) {
        console.error('Error retrieving subscription from Stripe:', stripeError);
        return {
          status: 'error',
          message: 'Could not retrieve current subscription status from payment provider',
          trialEndsAt: businessRecord.trialEndsAt,
          isTrialActive: businessRecord.trialEndsAt ? new Date(businessRecord.trialEndsAt) > new Date() : false
        };
      }
    } catch (error) {
      console.error('Error getting subscription status:', error);
      throw new Error('Failed to retrieve subscription status');
    }
  }

  /**
   * Create a new subscription for a business
   * @param businessId The ID of the business
   * @param planId The ID of the subscription plan
   *
   * If the business is in an active trial period, this saves the selected plan
   * without requiring payment. Stripe subscription is created when trial ends
   * or the user manually upgrades.
   */
  async createSubscription(businessId: number, planId: number, promoCode?: string) {
    try {
      // Get the business details
      const business = await db.select().from(businesses).where(eq(businesses.id, businessId)).limit(1);

      if (!business || business.length === 0) {
        throw new Error('Business not found');
      }

      const businessRecord = business[0];

      // Get the plan details
      const plan = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, planId)).limit(1);

      if (!plan || plan.length === 0) {
        throw new Error('Subscription plan not found');
      }

      const planRecord = plan[0];

      // Use the pre-created Stripe price ID from the plan record (set by migration)
      // This avoids creating duplicate products/prices on every subscription
      const stripePriceId = planRecord.stripePriceId;
      if (!stripePriceId) {
        throw new Error(`Plan ${planRecord.name} (${planRecord.planTier}/${planRecord.interval}) has no Stripe price ID. Run migrations to set it.`);
      }
      
      // Create or get customer in Stripe
      let stripeCustomer;
      try {
        if (businessRecord.stripeCustomerId) {
          try {
            stripeCustomer = await getStripe().customers.retrieve(businessRecord.stripeCustomerId);
            // If customer was deleted in Stripe, create a new one
            if ('deleted' in stripeCustomer && stripeCustomer.deleted) {
              stripeCustomer = null;
            }
          } catch (retrieveError: any) {
            // Customer doesn't exist in Stripe anymore, create a new one
            console.warn(`Stripe customer ${businessRecord.stripeCustomerId} not found, creating new one`);
            stripeCustomer = null;
          }
        }

        if (!stripeCustomer) {
          stripeCustomer = await getStripe().customers.create({
            email: businessRecord.email,
            name: businessRecord.name,
            metadata: {
              businessId: businessRecord.id.toString()
            }
          });

          // Update business with Stripe customer ID
          await db.update(businesses)
            .set({
              stripeCustomerId: stripeCustomer.id,
              updatedAt: new Date()
            })
            .where(eq(businesses.id, businessId));
        }
      } catch (stripeError: any) {
        console.error('Error creating customer in Stripe:', stripeError?.message || stripeError);
        throw new Error(`Failed to create customer record for subscription: ${stripeError?.message || 'Unknown error'}`);
      }
      
      // Re-entry guard: if the business already has a Stripe subscription and
      // the user lands back here (e.g., abandoned the card-collection step,
      // browser closed mid-flow, etc.), DON'T create a duplicate sub on the
      // same Stripe customer. Inspect the existing one instead.
      //
      //   - status=trialing with no default_payment_method → return a fresh
      //     SetupIntent so the user can finish saving their card on the
      //     SAME existing subscription. No duplicate sub created.
      //   - status=trialing with payment method already attached → no-op,
      //     return the existing trial info.
      //   - status=active/past_due/canceled/etc → caller wants to change plan,
      //     route through change-plan endpoint instead. Return informative error.
      if (businessRecord.stripeSubscriptionId) {
        try {
          const existing = await getStripe().subscriptions.retrieve(
            businessRecord.stripeSubscriptionId,
            { expand: ['default_payment_method'] }
          );

          if (existing.status === 'trialing') {
            const trialEndDate = existing.trial_end
              ? new Date(existing.trial_end * 1000)
              : null;

            if (!existing.default_payment_method) {
              // Card-collection abandoned. Generate a fresh SetupIntent so the
              // user can complete card collection on this existing subscription.
              const setupIntent = await getStripe().setupIntents.create({
                customer: stripeCustomer.id,
                payment_method_types: ['card'],
                usage: 'off_session',
                metadata: {
                  businessId: businessId.toString(),
                  subscriptionId: existing.id,
                  purpose: 'trial_payment_method_resume',
                },
              });
              return {
                subscriptionId: existing.id,
                status: existing.status,
                clientSecret: setupIntent.client_secret,
                intentType: 'setup' as const,
                trialEndsAt: trialEndDate?.toISOString() || null,
                planName: planRecord.name,
              };
            }

            // Card already on file, trial active — nothing to do.
            return {
              subscriptionId: existing.id,
              status: existing.status,
              clientSecret: null,
              intentType: 'setup' as const,
              trialEndsAt: trialEndDate?.toISOString() || null,
              planName: planRecord.name,
            };
          }

          // Non-trial existing sub — caller should use change-plan flow.
          if (existing.status === 'active' || existing.status === 'past_due') {
            throw new Error(
              'You already have an active subscription. Use Change Plan in Settings to switch tiers.'
            );
          }
          // Subscription is canceled / incomplete_expired / etc — fall through
          // to create a new subscription below.
        } catch (retrieveErr: any) {
          // If Stripe says the sub doesn't exist (deleted), fall through and create fresh.
          // Any other retrieve error → bubble up.
          if (retrieveErr?.code !== 'resource_missing') {
            throw retrieveErr;
          }
          console.warn(
            `Stripe sub ${businessRecord.stripeSubscriptionId} missing in Stripe, creating fresh`
          );
        }
      }

      // Determine if this should be a trial subscription
      // New businesses get a 14-day trial with card on file
      const isNewSubscription = !businessRecord.stripeSubscriptionId;
      const hasActiveTrialDays = businessRecord.trialEndsAt && new Date(businessRecord.trialEndsAt) > new Date();
      const trialDays = (isNewSubscription && hasActiveTrialDays)
        ? Math.max(1, Math.ceil((new Date(businessRecord.trialEndsAt!).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
        : isNewSubscription ? 14 : undefined;

      // Create a subscription (with trial if applicable)
      let subscription;
      try {
        const subscriptionParams: Stripe.SubscriptionCreateParams = {
          customer: stripeCustomer.id,
          items: [
            { price: stripePriceId }
          ],
          payment_behavior: 'default_incomplete',
          payment_settings: {
            save_default_payment_method: 'on_subscription',
          },
          expand: ['latest_invoice.payment_intent'],
          ...(promoCode ? { promotion_code: promoCode } : {}),
        };

        // Add trial period — card collected upfront, charged after trial ends
        if (trialDays) {
          subscriptionParams.trial_period_days = trialDays;
          // For trials, we need to collect payment method upfront
          subscriptionParams.payment_behavior = 'default_incomplete';
          subscriptionParams.trial_settings = {
            end_behavior: { missing_payment_method: 'cancel' },
          };
        }

        subscription = await getStripe().subscriptions.create(subscriptionParams);

        // Update the business with subscription info
        const trialEnd = subscription.trial_end
          ? new Date(subscription.trial_end * 1000)
          : null;

        await db.update(businesses)
          .set({
            stripeSubscriptionId: subscription.id,
            stripePlanId: planId,
            subscriptionStatus: subscription.status, // 'trialing' or 'incomplete'
            subscriptionStartDate: new Date(),
            subscriptionPeriodEnd: new Date(asLegacySubscription(subscription).current_period_end * 1000),
            ...(trialEnd ? { trialEndsAt: trialEnd } : {}),
            updatedAt: new Date()
          })
          .where(eq(businesses.id, businessId));

        console.log(`Business ${businessId} subscribed to ${planRecord.name} (${subscription.status}${trialDays ? `, ${trialDays}-day trial` : ''})`);

        // ── Resolve clientSecret for the frontend ───────────────────────
        // Two cases:
        //   1) Trial subscription — first invoice is $0, no PaymentIntent.
        //      We must create a SetupIntent so the user can save a card now;
        //      Stripe will charge it automatically when the trial ends.
        //      Frontend uses stripe.confirmSetup() with this clientSecret.
        //   2) Immediate-charge subscription — Stripe attaches a PaymentIntent
        //      to the first invoice; frontend uses stripe.confirmPayment().
        //
        // We always tell the frontend which intent type it's dealing with so
        // it can call the correct confirm method.
        const paymentIntentSecret =
          asExpandedInvoice(subscription.latest_invoice)?.payment_intent?.client_secret;

        let clientSecret: string | null = paymentIntentSecret || null;
        let intentType: 'payment' | 'setup' = 'payment';

        if (!paymentIntentSecret && trialDays) {
          // Card-required trial flow — create SetupIntent for the customer.
          try {
            const setupIntent = await getStripe().setupIntents.create({
              customer: stripeCustomer.id,
              payment_method_types: ['card'],
              usage: 'off_session', // Allow Stripe to charge automatically post-trial
              metadata: {
                businessId: businessId.toString(),
                subscriptionId: subscription.id,
                purpose: 'trial_payment_method',
              },
            });
            clientSecret = setupIntent.client_secret;
            intentType = 'setup';
          } catch (setupErr: any) {
            console.error(
              `Failed to create SetupIntent for trial subscription ${subscription.id}:`,
              setupErr?.message || setupErr,
            );
            // Don't fail the whole subscription create — return without clientSecret.
            // The frontend will surface this as "your business was saved but we
            // couldn't collect a card; set it up from Settings."
          }
        }

        return {
          subscriptionId: subscription.id,
          status: subscription.status,
          clientSecret,
          intentType,
          trialEndsAt: trialEnd?.toISOString() || null,
          planName: planRecord.name,
        };
      } catch (stripeError: any) {
        console.error('Error creating subscription in Stripe:', stripeError?.message || stripeError);
        throw new Error(`Failed to create subscription: ${stripeError?.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error creating subscription:', error);
      throw error;
    }
  }

  /**
   * Cancel a subscription at the end of the current billing period
   * @param businessId The ID of the business
   */
  async cancelSubscription(businessId: number) {
    try {
      // Get the business details
      const business = await db.select().from(businesses).where(eq(businesses.id, businessId)).limit(1);
      
      if (!business || business.length === 0) {
        throw new Error('Business not found');
      }
      
      const businessRecord = business[0];
      
      if (!businessRecord.stripeSubscriptionId) {
        throw new Error('No active subscription found');
      }
      
      // Cancel the subscription at period end
      const subscription = await getStripe().subscriptions.update(
        businessRecord.stripeSubscriptionId,
        { cancel_at_period_end: true }
      );
      
      // Update the business record
      await db.update(businesses)
        .set({
          subscriptionStatus: 'canceling',
          updatedAt: new Date()
        })
        .where(eq(businesses.id, businessId));
      
      return {
        status: 'canceling',
        message: 'Subscription will be canceled at the end of the current billing period',
        periodEnd: new Date(asLegacySubscription(subscription).current_period_end * 1000)
      };
    } catch (error) {
      console.error('Error canceling subscription:', error);
      throw new Error('Failed to cancel subscription');
    }
  }

  /**
   * Resume a canceled subscription
   * @param businessId The ID of the business
   */
  async resumeSubscription(businessId: number) {
    try {
      // Get the business details
      const business = await db.select().from(businesses).where(eq(businesses.id, businessId)).limit(1);
      
      if (!business || business.length === 0) {
        throw new Error('Business not found');
      }
      
      const businessRecord = business[0];
      
      if (!businessRecord.stripeSubscriptionId) {
        throw new Error('No subscription found');
      }
      
      // Resume the subscription by canceling the cancellation
      const subscription = await getStripe().subscriptions.update(
        businessRecord.stripeSubscriptionId,
        { cancel_at_period_end: false }
      );
      
      // Update the business record
      await db.update(businesses)
        .set({
          subscriptionStatus: subscription.status,
          updatedAt: new Date()
        })
        .where(eq(businesses.id, businessId));
      
      return {
        status: subscription.status,
        message: 'Subscription resumed successfully'
      };
    } catch (error) {
      console.error('Error resuming subscription:', error);
      throw new Error('Failed to resume subscription');
    }
  }

  /**
   * Handle a webhook event from Stripe
   * @param event The Stripe event
   */
  async handleWebhookEvent(event: Stripe.Event) {
    try {
      console.log('Processing webhook event:', event.type, event.id);

      // ── Idempotency check: prevent double-processing on Stripe webhook retries ──
      // Stripe retries on any non-2xx for up to 3 days with exponential backoff.
      // Without strict dedup, a duplicate payment_succeeded could double-fire reprovisioning,
      // a duplicate payment_failed could send duplicate dunning emails/SMS, etc.
      //
      // STRICT mode: if dedup check fails for any reason other than duplicate (23505) or
      // table-missing (42P01), throw so the route returns non-2xx and Stripe retries.
      // Better to retry once on a transient DB error than to silently double-process.
      const { pool } = await import('../db');
      try {
        await pool.query(
          `INSERT INTO processed_webhook_events (event_id, source, event_type) VALUES ($1, 'stripe', $2)`,
          [event.id, event.type]
        );
      } catch (dupErr: any) {
        if (dupErr?.code === '23505') {
          // Duplicate event — already processed, ack as success
          console.log(`[Stripe] Skipping duplicate webhook event: ${event.id} (${event.type})`);
          return { success: true, duplicate: true };
        }
        if (dupErr?.code === '42P01') {
          // Table missing (pre-migration window) — log and continue rather than fail prod
          console.warn('[Stripe] processed_webhook_events table missing; skipping idempotency check');
        } else {
          // Any other DB error — throw so Stripe retries; do NOT process
          console.error(`[Stripe] Idempotency check failed for ${event.id}, requesting retry:`, dupErr);
          throw new Error(`Idempotency check failed: ${dupErr?.message || 'unknown error'}`);
        }
      }

      switch (event.type) {
        case 'invoice.payment_succeeded': {
          const invoice = event.data.object as Stripe.Invoice;
          if (asLegacyInvoice(invoice).subscription) {
            await this.handleInvoicePaymentSucceeded(invoice);
          }
          // Handle overage invoice payment
          if (invoice.metadata?.type === 'overage') {
            await this.handleOveragePaymentSucceeded(invoice);
          }
          break;
        }

        case 'invoice.payment_failed': {
          const invoice = event.data.object as Stripe.Invoice;
          if (asLegacyInvoice(invoice).subscription) {
            // Use enhanced dunning with notifications
            await this.handleInvoicePaymentFailedWithDunning(invoice);
          }
          // Handle overage invoice payment failure
          if (invoice.metadata?.type === 'overage') {
            await this.handleOveragePaymentFailed(invoice);
          }
          break;
        }
        
        case 'customer.subscription.updated': {
          const subscription = event.data.object as Stripe.Subscription;
          await this.updateSubscriptionStatus(subscription);
          break;
        }
        
        case 'customer.subscription.deleted': {
          const subscription = event.data.object as Stripe.Subscription;
          await this.handleSubscriptionCanceled(subscription);
          break;
        }

        case 'setup_intent.succeeded': {
          // Card-required trial flow: when the customer saves a card via the
          // SetupIntent we generate at trial creation, attach the resulting
          // payment method as the default on BOTH the customer and the
          // trialing subscription so day-14 auto-charge has the right card.
          //
          // Without this handler, Stripe USUALLY links the PM to the sub on
          // its own when it's the only PM on the customer — but "usually" is
          // not "always". This guarantees correctness.
          const setupIntent = event.data.object as Stripe.SetupIntent;
          await this.handleSetupIntentSucceeded(setupIntent);
          break;
        }
      }

      return { success: true };
    } catch (error) {
      console.error('Error handling webhook event:', error);
      throw error;
    }
  }

  /**
   * Handle a successful SetupIntent — attach payment method to customer
   * and to the trialing subscription as default_payment_method.
   *
   * Idempotent: if PM is already the default on customer or sub, the Stripe
   * API calls are no-ops. Safe to retry.
   *
   * @private
   */
  private async handleSetupIntentSucceeded(setupIntent: Stripe.SetupIntent) {
    try {
      // Only act on SetupIntents we created for the trial flow. Filter by
      // the metadata we set in createSubscription/re-entry guard.
      const purpose = setupIntent.metadata?.purpose;
      if (purpose !== 'trial_payment_method' && purpose !== 'trial_payment_method_resume') {
        // Not ours (e.g., a SetupIntent created by Billing Portal). Skip.
        return;
      }

      const customerId = typeof setupIntent.customer === 'string'
        ? setupIntent.customer
        : setupIntent.customer?.id;
      const paymentMethodId = typeof setupIntent.payment_method === 'string'
        ? setupIntent.payment_method
        : setupIntent.payment_method?.id;
      const subscriptionId = setupIntent.metadata?.subscriptionId;

      if (!customerId || !paymentMethodId) {
        console.warn(
          `[setup_intent.succeeded] Missing customer or payment_method on SetupIntent ${setupIntent.id}; skipping`
        );
        return;
      }

      const stripe = getStripe();

      // 1. Set as default payment method on the customer.
      try {
        await stripe.customers.update(customerId, {
          invoice_settings: { default_payment_method: paymentMethodId },
        });
        console.log(
          `[setup_intent.succeeded] Set default PM on customer ${customerId}: ${paymentMethodId}`
        );
      } catch (custErr: any) {
        console.error(
          `[setup_intent.succeeded] Failed to set default PM on customer ${customerId}:`,
          custErr?.message || custErr
        );
      }

      // 2. Set as default payment method on the subscription (if known).
      //    This is the critical bit — Stripe charges the SUBSCRIPTION's
      //    default_payment_method at trial end, not the customer's.
      if (subscriptionId) {
        try {
          await stripe.subscriptions.update(subscriptionId, {
            default_payment_method: paymentMethodId,
          });
          console.log(
            `[setup_intent.succeeded] Set default PM on subscription ${subscriptionId}: ${paymentMethodId}`
          );
        } catch (subErr: any) {
          console.error(
            `[setup_intent.succeeded] Failed to set default PM on subscription ${subscriptionId}:`,
            subErr?.message || subErr
          );
        }
      } else {
        console.warn(
          `[setup_intent.succeeded] No subscriptionId in SetupIntent ${setupIntent.id} metadata; ` +
          `customer-level default PM is set but subscription-level may not be.`
        );
      }
    } catch (error) {
      console.error('Error handling setup_intent.succeeded:', error);
      // Don't throw — Stripe will retry but this is best-effort. The customer
      // can also re-add the card from Settings if day-14 charge fails.
    }
  }

  /**
   * Update subscription status in database
   * @private
   */
  private async updateSubscriptionStatus(subscription: Stripe.Subscription) {
    try {
      // Find the business with this subscription
      const business = await db.select()
        .from(businesses)
        .where(eq(businesses.stripeSubscriptionId, subscription.id))
        .limit(1);
      
      if (!business || business.length === 0) {
        console.warn('No business found with subscription ID:', subscription.id);
        return;
      }
      
      // Update subscription details
      await db.update(businesses)
        .set({
          subscriptionStatus: subscription.status,
          subscriptionPeriodEnd: new Date(asLegacySubscription(subscription).current_period_end * 1000),
          updatedAt: new Date()
        })
        .where(eq(businesses.id, business[0].id));
      
      console.log(`Updated subscription status for business ${business[0].id} to ${subscription.status}`);
    } catch (error) {
      console.error('Error updating subscription status:', error);
      throw error;
    }
  }

  /**
   * Handle subscription canceled event
   * @private
   */
  private async handleSubscriptionCanceled(subscription: Stripe.Subscription) {
    try {
      // Find the business with this subscription
      const business = await db.select()
        .from(businesses)
        .where(eq(businesses.stripeSubscriptionId, subscription.id))
        .limit(1);

      if (!business || business.length === 0) {
        console.warn('No business found with subscription ID:', subscription.id);
        return;
      }

      // Downgrade to Free tier (CRM only) — soft-landing instead of locking the
      // user out. They keep their account + customers + invoice history but lose
      // AI/SMS/booking until they re-subscribe. Clear stripeSubscriptionId so
      // resubscription works cleanly.
      await db.update(businesses)
        .set({
          subscriptionStatus: 'free',
          stripeSubscriptionId: null,
          updatedAt: new Date()
        })
        .where(eq(businesses.id, business[0].id));

      console.log(`Downgraded business ${business[0].id} to Free tier after subscription cancellation`);

      // Deprovision resources (Twilio number, Vapi assistant)
      // This also triggers call forwarding deactivation notifications if applicable
      if (business[0].twilioPhoneNumberSid) {
        try {
          const { deprovisionBusiness } = await import('./businessProvisioningService.js');
          await deprovisionBusiness(business[0].id);
          console.log(`Deprovisioned resources for canceled subscription business ${business[0].id}`);
        } catch (deprovErr) {
          console.error(`Failed to deprovision business ${business[0].id} after subscription cancellation:`, deprovErr);
        }
      }
    } catch (error) {
      console.error('Error handling subscription canceled:', error);
      throw error;
    }
  }

  /**
   * Handle successful invoice payment
   * @private
   */
  private async handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
    try {
      // Update the subscription status in our database
      const subscriptionId = asLegacyInvoice(invoice).subscription;
      if (subscriptionId) {
        const subscription = await getStripe().subscriptions.retrieve(subscriptionId as string);
        await this.updateSubscriptionStatus(subscription);

        console.log(`Subscription payment succeeded for subscription ${subscriptionId}`);

        // Auto-reprovision if the business was previously deprovisioned
        // (canceled, expired, suspended, past_due — and now paying again)
        const [business] = await db.select()
          .from(businesses)
          .where(eq(businesses.stripeSubscriptionId, subscriptionId as string));

        if (business) {
          const prevStatus = business.subscriptionStatus;

          // Case 1: Grace period business — already has phone number, just re-enable AI
          if (prevStatus === 'grace_period' && business.twilioPhoneNumberSid) {
            try {
              console.log(`[Reactivation] Re-enabling AI for grace_period business ${business.id} (number already active)`);
              await db.update(businesses)
                .set({
                  receptionistEnabled: true,
                  subscriptionStartDate: new Date(),
                  updatedAt: new Date(),
                })
                .where(eq(businesses.id, business.id));

              console.log(`[Reactivation] Business ${business.id} AI re-enabled successfully`);

              if (business.email) {
                const { sendEmail } = await import('../emailService.js');
                const appUrl = process.env.APP_URL || 'https://www.smallbizagent.ai';
                await sendEmail({
                  to: business.email,
                  subject: `Welcome back! Your SmallBizAgent is active again`,
                  text: `Hi ${business.name}, great news! Your payment was successful and your AI receptionist is back online with your same phone number. Visit your dashboard at ${appUrl}/dashboard.`,
                  html: `
                    <h2>Your AI Receptionist Is Back!</h2>
                    <p>Hi ${business.name},</p>
                    <p>Great news! Your payment was successful and your AI receptionist is back online.</p>
                    <p>Your phone number <strong>${business.twilioPhoneNumber}</strong> is still yours, and your AI assistant is ready to take calls.</p>
                    <p>Visit your <a href="${appUrl}/dashboard">dashboard</a> to get started.</p>
                  `,
                });
              }
            } catch (provErr) {
              console.error(`[Reactivation] Failed to re-enable AI for business ${business.id}:`, provErr);
            }
          }
          // Case 2: Fully deprovisioned business — needs new phone number + Vapi assistant
          else if (!business.twilioPhoneNumberSid) {
            if (prevStatus === 'canceled' || prevStatus === 'expired' || prevStatus === 'suspended' || prevStatus === 'past_due' || prevStatus === 'grace_period' || prevStatus === 'free') {
              try {
                const { provisionBusiness } = await import('./businessProvisioningService.js');
                console.log(`[Reactivation] Auto-provisioning business ${business.id} (was ${prevStatus}, now paying)`);
                await provisionBusiness(business.id);

                // Set subscriptionStartDate for accurate billing periods
                await db.update(businesses)
                  .set({
                    subscriptionStartDate: new Date(),
                    receptionistEnabled: true,
                    updatedAt: new Date(),
                  })
                  .where(eq(businesses.id, business.id));

                console.log(`[Reactivation] Business ${business.id} re-provisioned successfully`);

                // Notify business owner
                if (business.email) {
                  const { sendEmail } = await import('../emailService.js');
                  const appUrl = process.env.APP_URL || 'https://www.smallbizagent.ai';
                  await sendEmail({
                    to: business.email,
                    subject: `Welcome back! Your SmallBizAgent is active again`,
                    text: `Hi ${business.name}, great news! Your payment was successful and your AI receptionist has been automatically reactivated. Your phone number and AI assistant are back online. Visit your dashboard at ${appUrl}/dashboard to get started.`,
                    html: `
                      <h2>Your Service Is Restored!</h2>
                      <p>Hi ${business.name},</p>
                      <p>Great news! Your payment was successful and your AI receptionist has been automatically reactivated.</p>
                      <p>Your phone number and AI assistant are back online and ready to take calls.</p>
                      <p>All your existing data (customers, appointments, invoices) has been preserved.</p>
                      <p>Visit your <a href="${appUrl}/dashboard">dashboard</a> to get started.</p>
                    `,
                  });
                }
              } catch (provErr) {
                console.error(`[Reactivation] Failed to auto-provision business ${business.id}:`, provErr);
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Error handling invoice payment succeeded:', error);
      throw error;
    }
  }

  /**
   * Handle successful overage invoice payment
   * @private
   */
  private async handleOveragePaymentSucceeded(invoice: Stripe.Invoice) {
    try {
      const invoiceId = invoice.id;
      if (!invoiceId) return;
      await db.update(overageCharges)
        .set({ status: 'paid', updatedAt: new Date() })
        .where(eq(overageCharges.stripeInvoiceId, invoiceId));
      console.log(`[OverageBilling] Payment succeeded for overage invoice ${invoiceId} (business ${invoice.metadata?.businessId})`);
    } catch (error) {
      console.error('[OverageBilling] Error updating overage charge status:', error);
    }
  }

  /**
   * Handle failed overage invoice payment
   * @private
   */
  private async handleOveragePaymentFailed(invoice: Stripe.Invoice) {
    try {
      const invoiceId = invoice.id;
      if (!invoiceId) return;
      await db.update(overageCharges)
        .set({
          status: 'failed',
          failureReason: 'Payment failed',
          updatedAt: new Date(),
        })
        .where(eq(overageCharges.stripeInvoiceId, invoiceId));
      console.log(`[OverageBilling] Payment FAILED for overage invoice ${invoiceId} (business ${invoice.metadata?.businessId})`);
    } catch (error) {
      console.error('[OverageBilling] Error updating overage charge status:', error);
    }
  }
  // ===================== Multi-Location Billing =====================

  /**
   * Create a group subscription for a business group
   * @param groupId The business group ID
   * @param planId The plan ID to subscribe to
   */
  async createGroupSubscription(groupId: number, planId: number) {
    try {
      const [group] = await db.select().from(businessGroups).where(eq(businessGroups.id, groupId)).limit(1);
      if (!group) throw new Error('Business group not found');

      // Get all active locations in the group
      const locations = await db.select().from(businesses)
        .where(eq(businesses.businessGroupId, groupId));
      const activeLocations = locations.filter(l => l.isActive !== false);

      // Get plan details
      const [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, planId)).limit(1);
      if (!plan) throw new Error('Plan not found');

      // Create or get Stripe customer for the group
      let customerId = group.stripeCustomerId;
      if (!customerId) {
        const customer = await getStripe().customers.create({
          email: group.billingEmail || undefined,
          name: group.name,
          metadata: { businessGroupId: group.id.toString() },
        });
        customerId = customer.id;
        await db.update(businessGroups)
          .set({ stripeCustomerId: customerId, updatedAt: new Date() })
          .where(eq(businessGroups.id, groupId));
      }

      // Create product/price in Stripe
      const unitAmount = Math.round(toMoney(plan.price) * 100);
      const stripeInterval = plan.interval === 'monthly' ? 'month' as const : 'year' as const;

      let stripeProduct;
      try {
        const products = await getStripe().products.list({ ids: [plan.id.toString()] });
        stripeProduct = products.data.length > 0
          ? products.data[0]
          : await getStripe().products.create({ id: plan.id.toString(), name: plan.name });
      } catch {
        stripeProduct = await getStripe().products.create({ name: plan.name });
      }

      // Find or create price
      const prices = await getStripe().prices.list({ product: stripeProduct.id, active: true });
      let stripePrice = prices.data.find(p => p.unit_amount === unitAmount && p.recurring?.interval === stripeInterval);
      if (!stripePrice) {
        stripePrice = await getStripe().prices.create({
          product: stripeProduct.id,
          unit_amount: unitAmount,
          currency: 'usd',
          recurring: { interval: stripeInterval },
        });
      }

      // Apply multi-location discount (20% for 2+ locations)
      const locationCount = activeLocations.length;
      let coupon;
      if (locationCount >= 2) {
        const discountPercent = group.multiLocationDiscountPercent || 20;
        try {
          coupon = await getStripe().coupons.retrieve(`multi_loc_${discountPercent}`);
        } catch {
          coupon = await getStripe().coupons.create({
            id: `multi_loc_${discountPercent}`,
            percent_off: discountPercent,
            duration: 'forever',
            name: `Multi-Location ${discountPercent}% Discount`,
          });
        }
      }

      // Create subscription with quantity = number of locations
      const subscriptionParams: Stripe.SubscriptionCreateParams = {
        customer: customerId,
        items: [{ price: stripePrice.id, quantity: locationCount }],
        payment_behavior: 'default_incomplete',
        expand: ['latest_invoice.payment_intent'],
      };

      if (coupon) {
        subscriptionParams.discounts = [{ coupon: coupon.id }];
      }

      const subscription = await getStripe().subscriptions.create(subscriptionParams);

      // Update group with subscription info
      await db.update(businessGroups)
        .set({
          stripeSubscriptionId: subscription.id,
          subscriptionStatus: subscription.status,
          updatedAt: new Date(),
        })
        .where(eq(businessGroups.id, groupId));

      return {
        subscriptionId: subscription.id,
        status: subscription.status,
        clientSecret: asExpandedInvoice(subscription.latest_invoice)?.payment_intent?.client_secret,
        locationCount,
        discountApplied: locationCount >= 2,
      };
    } catch (error) {
      console.error('Error creating group subscription:', error);
      throw error;
    }
  }

  /**
   * Update the location count on a group subscription (e.g. when adding/removing locations)
   * @param groupId The business group ID
   */
  async updateLocationCount(groupId: number) {
    try {
      const [group] = await db.select().from(businessGroups).where(eq(businessGroups.id, groupId)).limit(1);
      if (!group || !group.stripeSubscriptionId) {
        throw new Error('No group subscription found');
      }

      // Count active locations
      const locations = await db.select().from(businesses)
        .where(eq(businesses.businessGroupId, groupId));
      const activeCount = locations.filter(l => l.isActive !== false).length;

      // Get the subscription
      const subscription = await getStripe().subscriptions.retrieve(group.stripeSubscriptionId);
      const itemId = subscription.items.data[0]?.id;

      if (!itemId) throw new Error('No subscription item found');

      // Update quantity
      await getStripe().subscriptions.update(group.stripeSubscriptionId, {
        items: [{ id: itemId, quantity: activeCount }],
      });

      // Apply or remove discount based on location count
      const discountPercent = group.multiLocationDiscountPercent || 20;
      const hasDiscount = subscription.discounts?.length > 0 || asLegacySubscription(subscription).discount;
      if (activeCount >= 2 && !hasDiscount) {
        let coupon;
        try {
          coupon = await getStripe().coupons.retrieve(`multi_loc_${discountPercent}`);
        } catch {
          coupon = await getStripe().coupons.create({
            id: `multi_loc_${discountPercent}`,
            percent_off: discountPercent,
            duration: 'forever',
            name: `Multi-Location ${discountPercent}% Discount`,
          });
        }
        await getStripe().subscriptions.update(group.stripeSubscriptionId, {
          discounts: [{ coupon: coupon.id }],
        });
      }

      console.log(`Updated group ${groupId} subscription to ${activeCount} locations`);
      return { locationCount: activeCount };
    } catch (error) {
      console.error('Error updating location count:', error);
      throw error;
    }
  }

  /**
   * Get consolidated billing info for a business group
   * @param groupId The business group ID
   */
  async getGroupBilling(groupId: number) {
    try {
      const [group] = await db.select().from(businessGroups).where(eq(businessGroups.id, groupId)).limit(1);
      if (!group) throw new Error('Business group not found');

      const locations = await db.select().from(businesses)
        .where(eq(businesses.businessGroupId, groupId));
      const activeLocations = locations.filter(l => l.isActive !== false);

      let subscriptionDetails = null;
      if (group.stripeSubscriptionId) {
        try {
          const subscription = await getStripe().subscriptions.retrieve(group.stripeSubscriptionId);
          subscriptionDetails = {
            id: subscription.id,
            status: subscription.status,
            currentPeriodEnd: new Date(asLegacySubscription(subscription).current_period_end * 1000),
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
            quantity: subscription.items.data[0]?.quantity || 0,
            discount: (() => {
              const legacyDisc = asLegacySubscription(subscription).discount;
              const firstDiscount = subscription.discounts?.[0];
              const disc = legacyDisc || (typeof firstDiscount !== 'string' ? firstDiscount : null);
              if (!disc?.coupon) return null;
              return { percentOff: disc.coupon.percent_off, name: disc.coupon.name };
            })(),
          };
        } catch (err) {
          console.error('Error retrieving group subscription:', err);
        }
      }

      return {
        group: {
          id: group.id,
          name: group.name,
          billingEmail: group.billingEmail,
          multiLocationDiscountPercent: group.multiLocationDiscountPercent,
        },
        totalLocations: locations.length,
        activeLocations: activeLocations.length,
        subscription: subscriptionDetails,
        locations: locations.map(l => ({
          id: l.id,
          name: l.name,
          locationLabel: l.locationLabel,
          isActive: l.isActive,
        })),
      };
    } catch (error) {
      console.error('Error getting group billing:', error);
      throw error;
    }
  }
  /**
   * Validate a promo code
   */
  async validatePromoCode(code: string): Promise<{ valid: boolean; description?: string; message?: string; trialDays?: number; percentOff?: number; error?: string }> {
    try {
      // Check Stripe for the coupon/promotion code
      const promotionCodes = await getStripe().promotionCodes.list({
        code,
        active: true,
        limit: 1,
      });

      if (promotionCodes.data.length > 0) {
        const promoCode = promotionCodes.data[0];
        const coupon = promoCode.coupon;

        let description = '';
        if (coupon.percent_off) {
          description = `${coupon.percent_off}% off`;
        } else if (coupon.amount_off) {
          description = `$${(coupon.amount_off / 100).toFixed(2)} off`;
        }
        if (coupon.duration === 'repeating' && coupon.duration_in_months) {
          description += ` for ${coupon.duration_in_months} month${coupon.duration_in_months > 1 ? 's' : ''}`;
        } else if (coupon.duration === 'once') {
          description += ' (first month)';
        } else if (coupon.duration === 'forever') {
          description += ' forever';
        }

        return {
          valid: true,
          description,
          message: `Promo code applied! ${description}`,
          percentOff: coupon.percent_off || undefined,
          trialDays: coupon.metadata?.trialDays ? parseInt(coupon.metadata.trialDays) : undefined,
        };
      }

      return { valid: false, error: 'Invalid or expired promo code' };
    } catch (error: any) {
      console.error('Error validating promo code:', error);
      return { valid: false, error: 'Invalid or expired promo code' };
    }
  }

  /**
   * Apply a promo code to an existing active subscription
   */
  async applyPromoToSubscription(businessId: number, code: string): Promise<{ success: boolean; description?: string; error?: string }> {
    try {
      const [business] = await db.select().from(businesses).where(eq(businesses.id, businessId));
      if (!business?.stripeSubscriptionId) {
        return { success: false, error: 'No active subscription found' };
      }

      // Look up the promotion code in Stripe
      const promotionCodes = await getStripe().promotionCodes.list({
        code,
        active: true,
        limit: 1,
      });

      if (promotionCodes.data.length === 0) {
        return { success: false, error: 'Invalid or expired promo code' };
      }

      const promoCode = promotionCodes.data[0];
      const coupon = promoCode.coupon;

      // Apply the coupon to the existing subscription
      await getStripe().subscriptions.update(business.stripeSubscriptionId, {
        discounts: [{ coupon: coupon.id }],
      });

      // Build description
      let description = '';
      if (coupon.percent_off) {
        description = `${coupon.percent_off}% off`;
      } else if (coupon.amount_off) {
        description = `$${(coupon.amount_off / 100).toFixed(2)} off`;
      }
      if (coupon.duration === 'repeating' && coupon.duration_in_months) {
        description += ` for ${coupon.duration_in_months} month${coupon.duration_in_months > 1 ? 's' : ''}`;
      } else if (coupon.duration === 'once') {
        description += ' (next invoice)';
      } else if (coupon.duration === 'forever') {
        description += ' forever';
      }

      return { success: true, description: `Promo applied! ${description}` };
    } catch (error: any) {
      console.error('Error applying promo to subscription:', error);
      return { success: false, error: error.message || 'Failed to apply promo code' };
    }
  }

  // ===================== Billing Portal =====================

  /**
   * Create a Stripe Billing Portal session for self-service subscription management
   * Allows customers to update payment methods, view invoices, cancel, etc.
   */
  async createBillingPortalSession(businessId: number, returnUrl: string) {
    try {
      const [business] = await db.select().from(businesses).where(eq(businesses.id, businessId));
      if (!business) throw new Error('Business not found');
      if (!business.stripeCustomerId) throw new Error('No Stripe customer found. Please subscribe first.');

      const session = await getStripe().billingPortal.sessions.create({
        customer: business.stripeCustomerId,
        return_url: returnUrl,
      });

      return { url: session.url };
    } catch (error: any) {
      console.error('Error creating billing portal session:', error);
      throw new Error(error.message || 'Failed to create billing portal session');
    }
  }

  // ===================== Plan Upgrade/Downgrade =====================

  /**
   * Change subscription plan with prorated billing
   * Stripe handles proration automatically — charges/credits are applied at next invoice
   */
  async changePlan(businessId: number, newPlanId: number) {
    try {
      const [business] = await db.select().from(businesses).where(eq(businesses.id, businessId));
      if (!business) throw new Error('Business not found');
      if (!business.stripeSubscriptionId) throw new Error('No active subscription found');

      // Get the new plan
      const [newPlan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, newPlanId));
      if (!newPlan) throw new Error('Plan not found');

      // Get current subscription from Stripe
      const subscription = await getStripe().subscriptions.retrieve(business.stripeSubscriptionId);
      const currentItemId = subscription.items.data[0]?.id;
      if (!currentItemId) throw new Error('No subscription item found');

      // Find or create the Stripe price for the new plan
      const unitAmount = Math.round(toMoney(newPlan.price) * 100);
      const stripeInterval = newPlan.interval === 'monthly' ? 'month' as const : 'year' as const;

      // Get or create product
      let stripeProduct;
      try {
        const products = await getStripe().products.list({ ids: [newPlan.id.toString()] });
        stripeProduct = products.data.length > 0
          ? products.data[0]
          : await getStripe().products.create({ id: newPlan.id.toString(), name: newPlan.name });
      } catch {
        stripeProduct = await getStripe().products.create({ name: newPlan.name });
      }

      // Find or create price
      const prices = await getStripe().prices.list({ product: stripeProduct.id, active: true });
      let stripePrice = prices.data.find(p => p.unit_amount === unitAmount && p.recurring?.interval === stripeInterval);
      if (!stripePrice) {
        stripePrice = await getStripe().prices.create({
          product: stripeProduct.id,
          unit_amount: unitAmount,
          currency: 'usd',
          recurring: { interval: stripeInterval },
        });
      }

      // Update the subscription — Stripe prorates automatically
      const updatedSubscription = await getStripe().subscriptions.update(business.stripeSubscriptionId, {
        items: [{ id: currentItemId, price: stripePrice.id }],
        proration_behavior: 'create_prorations',
      });

      // Update our database
      await db.update(businesses)
        .set({
          stripePlanId: newPlanId,
          subscriptionStatus: updatedSubscription.status,
          subscriptionPeriodEnd: new Date(asLegacySubscription(updatedSubscription).current_period_end * 1000),
          updatedAt: new Date(),
        })
        .where(eq(businesses.id, businessId));

      console.log(`Business ${businessId} changed plan to ${newPlan.name} (prorated)`);

      return {
        status: updatedSubscription.status,
        plan: newPlan,
        message: `Switched to ${newPlan.name}. Prorated charges will appear on your next invoice.`,
      };
    } catch (error: any) {
      console.error('Error changing plan:', error);
      throw new Error(error.message || 'Failed to change subscription plan');
    }
  }

  // ===================== Enhanced Dunning =====================

  /**
   * Handle payment failure with dunning logic:
   * - Track attempt count
   * - Send email + SMS notifications
   * - Set grace period (7 days from first failure)
   * - After 3 failures + grace period, deprovision
   */
  private async handleInvoicePaymentFailedWithDunning(invoice: Stripe.Invoice) {
    try {
      const subscriptionId = asLegacyInvoice(invoice).subscription;
      if (!subscriptionId) return;

      // Update subscription status in DB
      const subscription = await getStripe().subscriptions.retrieve(subscriptionId as string);
      await this.updateSubscriptionStatus(subscription);

      // Find the business
      const [business] = await db.select()
        .from(businesses)
        .where(eq(businesses.stripeSubscriptionId, subscriptionId as string));

      if (!business) {
        console.warn(`[Dunning] No business found for subscription ${subscriptionId}`);
        return;
      }

      // Determine attempt number from Stripe invoice attempt_count
      const attemptNumber = asLegacyInvoice(invoice).attempt_count || 1;

      // Calculate next retry date (Stripe retries at 3, 5, 7 days by default)
      const retryDays = [3, 5, 7];
      const nextRetryDate = attemptNumber < 3
        ? new Date(Date.now() + (retryDays[attemptNumber - 1] || 3) * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
        : null;

      // Grace period: 7 days from first failure
      const gracePeriodEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const gracePeriodEndsAt = gracePeriodEnd.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

      // Send email notification
      if (business.email) {
        try {
          await sendPaymentFailedEmail(
            business.email,
            business.name,
            attemptNumber,
            nextRetryDate,
            gracePeriodEndsAt
          );
          console.log(`[Dunning] Payment failure email sent to business ${business.id} (attempt ${attemptNumber})`);
        } catch (emailErr) {
          console.error(`[Dunning] Failed to send payment failure email to business ${business.id}:`, emailErr);
        }
      }

      // Send SMS notification to owner's personal cell phone
      const ownerCell = business.ownerPhone;
      if (ownerCell) {
        try {
          const { sendSms } = await import('./twilioService.js');
          const isLast = attemptNumber >= 3;
          const smsBody = isLast
            ? `SmallBizAgent: Your payment for ${business.name} has failed after 3 attempts. Please update your payment method at ${(process.env.APP_URL || 'https://www.smallbizagent.ai').replace('https://', '')}/settings to avoid service interruption.`
            : `SmallBizAgent: Payment failed for ${business.name} (attempt ${attemptNumber}/3). We'll retry automatically. No action needed right now.`;
          await sendSms(ownerCell, smsBody);
          console.log(`[Dunning] Payment failure SMS sent to owner of business ${business.id} at ${ownerCell} (attempt ${attemptNumber})`);
        } catch (smsErr) {
          console.error(`[Dunning] Failed to send payment failure SMS to business ${business.id}:`, smsErr);
        }
      } else {
        console.log(`[Dunning] No owner cell phone for business ${business.id} — skipping SMS notification`);
      }

      // Notify platform admin
      try {
        const { sendAdminAlert } = await import('./adminAlertService');
        await sendAdminAlert({
          type: 'payment_failed',
          severity: 'high',
          title: `Payment Failed: ${business.name}`,
          details: { businessId: business.id, businessName: business.name, attempt: `${attemptNumber}/3`, ownerEmail: business.email || 'N/A', gracePeriodEnds: gracePeriodEndsAt },
        });
      } catch (alertErr) {
        console.error('[Dunning] Admin alert failed:', alertErr);
      }

      // Update business with payment failure tracking
      await db.update(businesses)
        .set({
          subscriptionStatus: attemptNumber >= 3 ? 'past_due' : 'payment_failed',
          updatedAt: new Date(),
        })
        .where(eq(businesses.id, business.id));

      console.log(`[Dunning] Business ${business.id}: payment failed (attempt ${attemptNumber})`);
    } catch (error) {
      console.error('[Dunning] Error handling payment failure:', error);
    }
  }
}

export const subscriptionService = new SubscriptionService();