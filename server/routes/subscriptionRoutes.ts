import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import { z } from 'zod';
import { subscriptionService } from '../services/subscriptionService';
import { getUsageInfo } from '../services/usageService';

// Create subscription router
const router = Router();

// Initialize Stripe for webhook handling
if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('Missing STRIPE_SECRET_KEY environment variable');
}
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-03-31.basil',
});
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

// Define schemas for validation
const createSubscriptionSchema = z.object({
  businessId: z.number(),
  planId: z.number(),
});

// Middleware for checking authentication
const isAuthenticated = (req: Request, res: Response, next: Function) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ error: 'Not authenticated' });
};

// Get all subscription plans
router.get('/plans', async (req: Request, res: Response) => {
  try {
    const plans = await subscriptionService.getPlans();
    res.json(plans);
  } catch (error: any) {
    console.error('Error fetching subscription plans:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get subscription status for a business
router.get('/status/:businessId', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const businessId = parseInt(req.params.businessId);
    const status = await subscriptionService.getSubscriptionStatus(businessId);
    res.json(status);
  } catch (error: any) {
    console.error('Error fetching subscription status:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create a subscription
router.post('/create-subscription', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const validationResult = createSubscriptionSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ error: validationResult.error });
    }
    
    const { businessId, planId } = validationResult.data;
    const subscription = await subscriptionService.createSubscription(businessId, planId);
    res.json(subscription);
  } catch (error: any) {
    console.error('Error creating subscription:', error);
    res.status(500).json({ error: error.message });
  }
});

// Cancel a subscription
router.post('/cancel/:businessId', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const businessId = parseInt(req.params.businessId);
    const result = await subscriptionService.cancelSubscription(businessId);
    res.json(result);
  } catch (error: any) {
    console.error('Error canceling subscription:', error);
    res.status(500).json({ error: error.message });
  }
});

// Resume a subscription
router.post('/resume/:businessId', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const businessId = parseInt(req.params.businessId);
    const result = await subscriptionService.resumeSubscription(businessId);
    res.json(result);
  } catch (error: any) {
    console.error('Error resuming subscription:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get AI call usage for a business
router.get('/usage/:businessId', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const businessId = parseInt(req.params.businessId);
    const usage = await getUsageInfo(businessId);
    res.json(usage);
  } catch (error: any) {
    console.error('Error fetching usage info:', error);
    res.status(500).json({ error: error.message });
  }
});

// Stripe webhook handler
router.post('/webhook', async (req: Request, res: Response) => {
  let event: Stripe.Event;

  try {
    if (endpointSecret) {
      // Get the signature sent by Stripe
      const signature = req.headers['stripe-signature'] as string;
      if (!signature) {
        return res.status(400).json({ error: 'Missing Stripe signature' });
      }

      // Verify the event
      event = stripe.webhooks.constructEvent(
        req.body,
        signature,
        endpointSecret
      );
    } else {
      // If no webhook secret for verification, just parse the event
      event = req.body;
    }

    // Handle the event
    await subscriptionService.handleWebhookEvent(event);
    
    // Return a 200 to acknowledge receipt of the event
    res.json({ received: true });
  } catch (error: any) {
    console.error('Webhook Error:', error.message);
    res.status(400).json({ error: `Webhook Error: ${error.message}` });
  }
});

export default router;