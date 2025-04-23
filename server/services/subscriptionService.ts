import { subscriptionPlans, businesses } from '@shared/schema';
import { db } from '../db';
import { eq } from 'drizzle-orm';
import Stripe from 'stripe';

// Initialize Stripe
if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('Missing required environment variable: STRIPE_SECRET_KEY');
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16',
});

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
        const subscription = await stripe.subscriptions.retrieve(businessRecord.stripeSubscriptionId);
        
        // Check if subscription is active
        const isActive = subscription.status === 'active' || subscription.status === 'trialing';
        const periodEnd = new Date(subscription.current_period_end * 1000);
        
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
   */
  async createSubscription(businessId: number, planId: number) {
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
      
      // Create a product in Stripe if it doesn't exist yet
      let stripeProduct;
      try {
        // Check if product already exists
        const products = await stripe.products.list({
          ids: [planRecord.id.toString()]
        });
        
        if (products.data.length > 0) {
          stripeProduct = products.data[0];
        } else {
          // Create new product
          stripeProduct = await stripe.products.create({
            id: planRecord.id.toString(),
            name: planRecord.name,
            description: planRecord.description || undefined,
          });
        }
      } catch (stripeError) {
        console.error('Error creating product in Stripe:', stripeError);
        throw new Error('Failed to create subscription product');
      }
      
      // Create price in Stripe
      let stripePrice;
      try {
        const prices = await stripe.prices.list({
          product: stripeProduct.id,
          active: true,
        });
        
        if (prices.data.length > 0) {
          stripePrice = prices.data[0];
        } else {
          // Create new price
          stripePrice = await stripe.prices.create({
            product: stripeProduct.id,
            unit_amount: planRecord.price * 100, // Convert to cents
            currency: 'usd',
            recurring: {
              interval: planRecord.interval === 'monthly' ? 'month' : 'year',
            },
          });
        }
      } catch (stripeError) {
        console.error('Error creating price in Stripe:', stripeError);
        throw new Error('Failed to create subscription price');
      }
      
      // Create or get customer in Stripe
      let stripeCustomer;
      try {
        if (businessRecord.stripeCustomerId) {
          stripeCustomer = await stripe.customers.retrieve(businessRecord.stripeCustomerId);
        } else {
          stripeCustomer = await stripe.customers.create({
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
      } catch (stripeError) {
        console.error('Error creating customer in Stripe:', stripeError);
        throw new Error('Failed to create customer record for subscription');
      }
      
      // Create a subscription
      let subscription;
      try {
        subscription = await stripe.subscriptions.create({
          customer: stripeCustomer.id,
          items: [
            { price: stripePrice.id }
          ],
          payment_behavior: 'default_incomplete',
          expand: ['latest_invoice.payment_intent']
        });
        
        // Update the business with subscription info
        await db.update(businesses)
          .set({
            stripeSubscriptionId: subscription.id,
            stripePlanId: planId,
            subscriptionStatus: subscription.status,
            subscriptionPeriodEnd: new Date(subscription.current_period_end * 1000),
            updatedAt: new Date()
          })
          .where(eq(businesses.id, businessId));
        
        return {
          subscriptionId: subscription.id,
          status: subscription.status,
          clientSecret: (subscription.latest_invoice as any)?.payment_intent?.client_secret,
        };
      } catch (stripeError) {
        console.error('Error creating subscription in Stripe:', stripeError);
        throw new Error('Failed to create subscription');
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
      const subscription = await stripe.subscriptions.update(
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
        periodEnd: new Date(subscription.current_period_end * 1000)
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
      const subscription = await stripe.subscriptions.update(
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
      console.log('Processing webhook event:', event.type);
      
      switch (event.type) {
        case 'invoice.payment_succeeded': {
          const invoice = event.data.object as Stripe.Invoice;
          if (invoice.subscription) {
            await this.handleInvoicePaymentSucceeded(invoice);
          }
          break;
        }
        
        case 'invoice.payment_failed': {
          const invoice = event.data.object as Stripe.Invoice;
          if (invoice.subscription) {
            await this.handleInvoicePaymentFailed(invoice);
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
      }
      
      return { success: true };
    } catch (error) {
      console.error('Error handling webhook event:', error);
      throw error;
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
          subscriptionPeriodEnd: new Date(subscription.current_period_end * 1000),
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
      
      // Update subscription details
      await db.update(businesses)
        .set({
          subscriptionStatus: 'canceled',
          updatedAt: new Date()
        })
        .where(eq(businesses.id, business[0].id));
      
      console.log(`Marked subscription as canceled for business ${business[0].id}`);
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
      if (invoice.subscription) {
        const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);
        await this.updateSubscriptionStatus(subscription);
        
        console.log(`Subscription payment succeeded for subscription ${invoice.subscription}`);
      }
    } catch (error) {
      console.error('Error handling invoice payment succeeded:', error);
      throw error;
    }
  }

  /**
   * Handle failed invoice payment
   * @private
   */
  private async handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
    try {
      // Update the subscription status in our database
      if (invoice.subscription) {
        const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);
        await this.updateSubscriptionStatus(subscription);
        
        console.log(`Subscription payment failed for subscription ${invoice.subscription}`);
      }
    } catch (error) {
      console.error('Error handling invoice payment failed:', error);
      throw error;
    }
  }
}

export const subscriptionService = new SubscriptionService();