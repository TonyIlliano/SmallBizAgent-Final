import Stripe from 'stripe';
import { db } from '../db';
import { eq } from 'drizzle-orm';
import { subscriptionPlans, businesses } from '@shared/schema';

// Initialize Stripe
if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('Missing STRIPE_SECRET_KEY environment variable');
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16',
});

export class SubscriptionService {
  // Get all subscription plans
  async getPlans() {
    const plans = await db.select().from(subscriptionPlans);
    return plans;
  }

  // Get subscription status for a business
  async getSubscriptionStatus(businessId: number) {
    const business = await db.query.businesses.findFirst({
      where: eq(businesses.id, businessId),
    });

    if (!business) {
      throw new Error('Business not found');
    }

    // If no stripe subscription ID, return inactive status
    if (!business.stripeSubscriptionId) {
      return {
        status: 'inactive',
        planId: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
      };
    }

    try {
      // Get subscription details from Stripe
      const subscription = await stripe.subscriptions.retrieve(business.stripeSubscriptionId);
      
      return {
        status: subscription.status,
        planId: business.stripePlanId,
        currentPeriodEnd: new Date(subscription.current_period_end * 1000).toISOString(),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
      };
    } catch (error) {
      console.error('Failed to retrieve subscription from Stripe:', error);
      return {
        status: 'error',
        planId: business.stripePlanId,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
      };
    }
  }

  // Create a subscription
  async createSubscription(businessId: number, planId: number) {
    // Get the business
    const business = await db.query.businesses.findFirst({
      where: eq(businesses.id, businessId),
    });

    if (!business) {
      throw new Error('Business not found');
    }

    // Get the subscription plan
    const plan = await db.query.subscriptionPlans.findFirst({
      where: eq(subscriptionPlans.id, planId),
    });

    if (!plan) {
      throw new Error('Subscription plan not found');
    }

    try {
      // Create or get customer
      let customerId = business.stripeCustomerId;

      if (!customerId) {
        // Create a new customer
        const customer = await stripe.customers.create({
          name: business.name,
          email: business.email,
          metadata: {
            businessId: business.id.toString(),
          },
        });

        customerId = customer.id;

        // Update the business with the customer ID
        await db
          .update(businesses)
          .set({ stripeCustomerId: customerId })
          .where(eq(businesses.id, businessId));
      }

      // Set up the subscription
      const subscription = await stripe.subscriptions.create({
        customer: customerId,
        items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: plan.name,
                description: `SmallBizAgent - ${plan.name}`,
              },
              unit_amount: Math.round(plan.price * 100),
              recurring: {
                interval: plan.interval === 'monthly' ? 'month' : 'year',
              },
            },
          },
        ],
        payment_behavior: 'default_incomplete',
        payment_settings: { save_default_payment_method: 'on_subscription' },
        expand: ['latest_invoice.payment_intent'],
      });

      // Update business with subscription info
      await db
        .update(businesses)
        .set({
          stripeSubscriptionId: subscription.id,
          stripePlanId: planId.toString(),
          subscriptionStatus: subscription.status,
        })
        .where(eq(businesses.id, businessId));

      // Get the client secret from the invoice
      const invoice = subscription.latest_invoice as Stripe.Invoice;
      const paymentIntent = invoice.payment_intent as Stripe.PaymentIntent;

      return {
        subscriptionId: subscription.id,
        clientSecret: paymentIntent.client_secret,
      };
    } catch (error) {
      console.error('Error creating subscription:', error);
      throw new Error('Failed to create subscription');
    }
  }

  // Cancel a subscription
  async cancelSubscription(businessId: number) {
    // Get the business
    const business = await db.query.businesses.findFirst({
      where: eq(businesses.id, businessId),
    });

    if (!business || !business.stripeSubscriptionId) {
      throw new Error('Business or subscription not found');
    }

    try {
      // Cancel the subscription at the end of the billing period
      const subscription = await stripe.subscriptions.update(business.stripeSubscriptionId, {
        cancel_at_period_end: true,
      });

      // Update the business in the database
      await db
        .update(businesses)
        .set({
          subscriptionStatus: subscription.status,
          // Don't clear the subscription ID as it's still active until the end of the period
        })
        .where(eq(businesses.id, businessId));

      return { success: true };
    } catch (error) {
      console.error('Error canceling subscription:', error);
      throw new Error('Failed to cancel subscription');
    }
  }

  // Resume a subscription
  async resumeSubscription(businessId: number) {
    // Get the business
    const business = await db.query.businesses.findFirst({
      where: eq(businesses.id, businessId),
    });

    if (!business || !business.stripeSubscriptionId) {
      throw new Error('Business or subscription not found');
    }

    try {
      // Resume the subscription
      const subscription = await stripe.subscriptions.update(business.stripeSubscriptionId, {
        cancel_at_period_end: false,
      });

      // Update the business in the database
      await db
        .update(businesses)
        .set({
          subscriptionStatus: subscription.status,
        })
        .where(eq(businesses.id, businessId));

      return { success: true };
    } catch (error) {
      console.error('Error resuming subscription:', error);
      throw new Error('Failed to resume subscription');
    }
  }

  // Handle Stripe webhook events
  async handleWebhookEvent(event: Stripe.Event) {
    const { type, data } = event;

    switch (type) {
      case 'customer.subscription.updated': {
        const subscription = data.object as Stripe.Subscription;
        await this.updateSubscriptionStatus(subscription);
        break;
      }
      case 'customer.subscription.deleted': {
        const subscription = data.object as Stripe.Subscription;
        await this.handleSubscriptionCanceled(subscription);
        break;
      }
      case 'invoice.payment_succeeded': {
        const invoice = data.object as Stripe.Invoice;
        if (invoice.subscription) {
          const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);
          await this.updateSubscriptionStatus(subscription);
        }
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = data.object as Stripe.Invoice;
        if (invoice.subscription) {
          const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);
          await this.updateSubscriptionStatus(subscription);
        }
        break;
      }
    }
  }

  // Update subscription status in the database
  private async updateSubscriptionStatus(subscription: Stripe.Subscription) {
    // Find the business by Stripe customer ID
    const business = await db.query.businesses.findFirst({
      where: eq(businesses.stripeCustomerId, subscription.customer as string),
    });

    if (!business) {
      console.error(`Business not found for subscription ${subscription.id}`);
      return;
    }

    // Update subscription status
    await db
      .update(businesses)
      .set({
        subscriptionStatus: subscription.status,
        stripeSubscriptionId: subscription.id,
      })
      .where(eq(businesses.id, business.id));
  }

  // Handle subscription cancellation
  private async handleSubscriptionCanceled(subscription: Stripe.Subscription) {
    // Find the business by Stripe customer ID
    const business = await db.query.businesses.findFirst({
      where: eq(businesses.stripeCustomerId, subscription.customer as string),
    });

    if (!business) {
      console.error(`Business not found for subscription ${subscription.id}`);
      return;
    }

    // Update subscription status
    await db
      .update(businesses)
      .set({
        subscriptionStatus: 'canceled',
        stripeSubscriptionId: null,
        stripePlanId: null,
      })
      .where(eq(businesses.id, business.id));
  }
}

export const subscriptionService = new SubscriptionService();