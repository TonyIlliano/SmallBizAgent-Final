import { Router } from 'express';
import { stripe, subscriptionService } from '../services/subscriptionService';
import { isAuthenticated, isAdmin } from '../middleware/auth';
import { seedSubscriptionPlans } from '../migrations/add_subscription_plans';

const router = Router();

/**
 * Get all subscription plans
 */
router.get('/plans', async (req, res) => {
  try {
    const plans = await subscriptionService.getSubscriptionPlans();
    res.json(plans);
  } catch (error) {
    console.error('Error fetching subscription plans:', error);
    res.status(500).json({ error: 'Failed to fetch subscription plans' });
  }
});

/**
 * Get subscription status for a business
 */
router.get('/status/:businessId', isAuthenticated, async (req, res) => {
  try {
    const businessId = parseInt(req.params.businessId);
    const status = await subscriptionService.getSubscriptionStatus(businessId);
    res.json(status);
  } catch (error) {
    console.error('Error fetching subscription status:', error);
    res.status(500).json({ error: 'Failed to fetch subscription status' });
  }
});

/**
 * Create a subscription checkout session
 */
router.post('/create-subscription', isAuthenticated, async (req, res) => {
  try {
    const { businessId, planId } = req.body;
    
    if (!businessId || !planId) {
      return res.status(400).json({ error: 'Business ID and Plan ID are required' });
    }

    const session = await subscriptionService.createSubscriptionSession(
      parseInt(businessId),
      parseInt(planId)
    );

    res.json(session);
  } catch (error: any) {
    console.error('Error creating subscription:', error);
    res.status(500).json({ error: error.message || 'Failed to create subscription' });
  }
});

/**
 * Cancel a subscription
 */
router.post('/cancel/:businessId', isAuthenticated, async (req, res) => {
  try {
    const businessId = parseInt(req.params.businessId);
    const result = await subscriptionService.cancelSubscription(businessId);
    res.json(result);
  } catch (error: any) {
    console.error('Error cancelling subscription:', error);
    res.status(500).json({ error: error.message || 'Failed to cancel subscription' });
  }
});

/**
 * Resume a canceled subscription
 */
router.post('/resume/:businessId', isAuthenticated, async (req, res) => {
  try {
    const businessId = parseInt(req.params.businessId);
    const result = await subscriptionService.resumeSubscription(businessId);
    res.json(result);
  } catch (error: any) {
    console.error('Error resuming subscription:', error);
    res.status(500).json({ error: error.message || 'Failed to resume subscription' });
  }
});

/**
 * ADMIN: Manually seed subscription plans
 */
router.post('/seed-plans', isAdmin, async (req, res) => {
  try {
    await seedSubscriptionPlans();
    res.json({ success: true, message: 'Subscription plans seeded successfully' });
  } catch (error) {
    console.error('Error seeding subscription plans:', error);
    res.status(500).json({ error: 'Failed to seed subscription plans' });
  }
});

/**
 * ADMIN: Create a new subscription plan
 */
router.post('/plans', isAdmin, async (req, res) => {
  try {
    const plan = await subscriptionService.createSubscriptionPlan(req.body);
    res.status(201).json(plan);
  } catch (error: any) {
    console.error('Error creating subscription plan:', error);
    res.status(500).json({ error: error.message || 'Failed to create subscription plan' });
  }
});

/**
 * ADMIN: Update a subscription plan
 */
router.put('/plans/:id', isAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const plan = await subscriptionService.updateSubscriptionPlan(id, req.body);
    res.json(plan);
  } catch (error: any) {
    console.error('Error updating subscription plan:', error);
    res.status(500).json({ error: error.message || 'Failed to update subscription plan' });
  }
});

/**
 * Stripe webhook endpoint
 */
router.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'] as string;

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(500).json({ error: 'Stripe webhook secret is not configured' });
  }

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err: any) {
    console.error(`Webhook Error: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'customer.subscription.updated':
    case 'customer.subscription.created':
      const subscription = event.data.object;
      await subscriptionService.handleSubscriptionUpdated(
        subscription.id,
        subscription.status
      );
      break;
    
    case 'customer.subscription.deleted':
      const canceledSubscription = event.data.object;
      await subscriptionService.handleSubscriptionUpdated(
        canceledSubscription.id,
        'canceled'
      );
      break;
      
    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  // Return a 200 response to acknowledge receipt of the event
  res.json({ received: true });
});

export default router;