import Stripe from 'stripe';
import { db } from '../db';
import { subscriptionPlans, businesses } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is required for subscription service');
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16',
});

export class SubscriptionService {
  /**
   * Get all subscription plans
   */
  async getSubscriptionPlans() {
    return db.select().from(subscriptionPlans).where(eq(subscriptionPlans.active, true)).orderBy(subscriptionPlans.sortOrder);
  }

  /**
   * Get a subscription plan by ID
   */
  async getSubscriptionPlan(id: number) {
    const [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, id));
    return plan;
  }

  /**
   * Create a subscription plan in both Stripe and local database
   */
  async createSubscriptionPlan(planData: any) {
    // Create product in Stripe
    const product = await stripe.products.create({
      name: planData.name,
      description: planData.description || '',
      active: planData.active,
    });

    // Create price in Stripe
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: Math.round(planData.price * 100), // Convert to cents
      currency: 'usd',
      recurring: {
        interval: planData.interval === 'yearly' ? 'year' : 'month',
      },
    });

    // Create plan in database
    const [plan] = await db.insert(subscriptionPlans).values({
      name: planData.name,
      description: planData.description,
      price: planData.price,
      interval: planData.interval,
      features: planData.features,
      stripeProductId: product.id,
      stripePriceId: price.id,
      active: planData.active,
      sortOrder: planData.sortOrder || 0,
    }).returning();

    return plan;
  }

  /**
   * Update a subscription plan
   */
  async updateSubscriptionPlan(id: number, planData: any) {
    const [currentPlan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, id));
    
    if (!currentPlan) {
      throw new Error('Subscription plan not found');
    }

    // Update Stripe product if it exists
    if (currentPlan.stripeProductId) {
      await stripe.products.update(currentPlan.stripeProductId, {
        name: planData.name,
        description: planData.description || '',
        active: planData.active,
      });
    }

    // For price changes, we need to create a new price in Stripe
    // as prices cannot be updated once created
    if (planData.price !== currentPlan.price || planData.interval !== currentPlan.interval) {
      if (currentPlan.stripeProductId) {
        const price = await stripe.prices.create({
          product: currentPlan.stripeProductId,
          unit_amount: Math.round(planData.price * 100), // Convert to cents
          currency: 'usd',
          recurring: {
            interval: planData.interval === 'yearly' ? 'year' : 'month',
          },
        });

        planData.stripePriceId = price.id;
      }
    }

    // Update plan in database
    const [plan] = await db.update(subscriptionPlans)
      .set({
        name: planData.name,
        description: planData.description,
        price: planData.price,
        interval: planData.interval,
        features: planData.features,
        stripePriceId: planData.stripePriceId || currentPlan.stripePriceId,
        active: planData.active,
        sortOrder: planData.sortOrder || currentPlan.sortOrder,
      })
      .where(eq(subscriptionPlans.id, id))
      .returning();

    return plan;
  }

  /**
   * Create or update a Stripe customer record for a business
   */
  async getOrCreateStripeCustomer(businessId: number) {
    // Get business information
    const [business] = await db.select().from(businesses).where(eq(businesses.id, businessId));
    
    if (!business) {
      throw new Error('Business not found');
    }

    // If business already has a Stripe customer ID, return it
    if (business.stripeCustomerId) {
      try {
        // Verify the customer still exists in Stripe
        const customer = await stripe.customers.retrieve(business.stripeCustomerId);
        if (!customer.deleted) {
          return business.stripeCustomerId;
        }
      } catch (error) {
        // If there's an error retrieving the customer, create a new one
      }
    }

    // Create a new customer in Stripe
    const customer = await stripe.customers.create({
      email: business.email,
      name: business.name,
      metadata: {
        businessId: business.id.toString()
      }
    });

    // Update business with Stripe customer ID
    await db.update(businesses)
      .set({ stripeCustomerId: customer.id })
      .where(eq(businesses.id, businessId));

    return customer.id;
  }

  /**
   * Create a subscription session for a business
   */
  async createSubscriptionSession(businessId: number, planId: number) {
    // Get customer ID (create if doesn't exist)
    const customerId = await this.getOrCreateStripeCustomer(businessId);
    
    // Get subscription plan
    const plan = await this.getSubscriptionPlan(planId);
    
    if (!plan || !plan.stripePriceId) {
      throw new Error('Invalid subscription plan');
    }

    // Create a subscription
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: plan.stripePriceId }],
      payment_behavior: 'default_incomplete',
      expand: ['latest_invoice.payment_intent'],
      metadata: {
        businessId: businessId.toString(),
        planId: planId.toString()
      }
    });

    // Update business with subscription information
    await db.update(businesses)
      .set({ 
        stripeSubscriptionId: subscription.id,
        subscriptionStatus: 'pending',
        subscriptionPlanId: planId.toString(),
      })
      .where(eq(businesses.id, businessId));

    // Return client secret for frontend
    // @ts-ignore - Stripe types don't properly expose this structure
    const clientSecret = subscription.latest_invoice?.payment_intent?.client_secret;
    
    return {
      subscriptionId: subscription.id,
      clientSecret,
    };
  }

  /**
   * Get current subscription status for a business
   */
  async getSubscriptionStatus(businessId: number) {
    const [business] = await db.select().from(businesses).where(eq(businesses.id, businessId));
    
    if (!business) {
      throw new Error('Business not found');
    }

    if (!business.stripeSubscriptionId) {
      return {
        status: 'none',
        planId: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false
      };
    }

    try {
      const subscription = await stripe.subscriptions.retrieve(business.stripeSubscriptionId);
      
      return {
        status: subscription.status,
        planId: business.subscriptionPlanId,
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        cancelAtPeriodEnd: subscription.cancel_at_period_end
      };
    } catch (error) {
      // If subscription can't be found, reset business subscription status
      await db.update(businesses)
        .set({ 
          stripeSubscriptionId: null,
          subscriptionStatus: 'inactive',
          subscriptionPlanId: null,
        })
        .where(eq(businesses.id, businessId));
      
      return {
        status: 'none',
        planId: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false
      };
    }
  }
  
  /**
   * Cancel a subscription at the end of the current billing period
   */
  async cancelSubscription(businessId: number) {
    const [business] = await db.select().from(businesses).where(eq(businesses.id, businessId));
    
    if (!business || !business.stripeSubscriptionId) {
      throw new Error('No active subscription found');
    }

    const subscription = await stripe.subscriptions.update(business.stripeSubscriptionId, {
      cancel_at_period_end: true
    });

    await db.update(businesses)
      .set({ subscriptionStatus: 'canceling' })
      .where(eq(businesses.id, businessId));

    return { 
      status: 'canceling',
      currentPeriodEnd: new Date(subscription.current_period_end * 1000)
    };
  }

  /**
   * Resume a subscription that was scheduled for cancellation
   */
  async resumeSubscription(businessId: number) {
    const [business] = await db.select().from(businesses).where(eq(businesses.id, businessId));
    
    if (!business || !business.stripeSubscriptionId) {
      throw new Error('No active subscription found');
    }

    const subscription = await stripe.subscriptions.update(business.stripeSubscriptionId, {
      cancel_at_period_end: false
    });

    await db.update(businesses)
      .set({ subscriptionStatus: 'active' })
      .where(eq(businesses.id, businessId));

    return { status: subscription.status };
  }

  /**
   * Update subscription when webhook event is received
   */
  async handleSubscriptionUpdated(subscriptionId: string, status: string) {
    const [business] = await db.select().from(businesses).where(eq(businesses.stripeSubscriptionId, subscriptionId));
    
    if (!business) {
      // No business found with this subscription, log and exit
      console.log(`No business found with subscription ID: ${subscriptionId}`);
      return;
    }

    // Map Stripe status to our status
    let subscriptionStatus: string;
    switch (status) {
      case 'active':
      case 'trialing':
        subscriptionStatus = 'active';
        break;
      case 'past_due':
      case 'unpaid':
        subscriptionStatus = 'past_due';
        break;
      case 'canceled':
        subscriptionStatus = 'inactive';
        break;
      default:
        subscriptionStatus = status;
    }

    // Update business subscription status
    await db.update(businesses)
      .set({ subscriptionStatus })
      .where(eq(businesses.id, business.id));
  }
}

export const subscriptionService = new SubscriptionService();