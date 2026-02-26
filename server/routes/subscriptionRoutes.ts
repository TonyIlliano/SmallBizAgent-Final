import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import { z } from 'zod';
import { getUsageInfo } from '../services/usageService';

// Create subscription router
const router = Router();

// Initialize Stripe for webhook handling (optional — usage endpoint works without Stripe)
let stripe: Stripe | null = null;
let subscriptionService: any = null;
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

if (process.env.STRIPE_SECRET_KEY) {
  stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2025-03-31.basil',
  });
  // Lazy-load subscription service only when Stripe is available
  import('../services/subscriptionService').then(mod => {
    subscriptionService = mod.subscriptionService;
  }).catch(err => {
    console.warn('⚠️ Could not load subscriptionService:', err.message);
  });
} else {
  console.warn('⚠️ STRIPE_SECRET_KEY not set — subscription billing endpoints disabled, usage tracking still active');
}

// Helper: guard routes that require Stripe
function requireStripe(req: Request, res: Response, next: Function) {
  if (!stripe || !subscriptionService) {
    return res.status(503).json({ error: 'Stripe is not configured. Set STRIPE_SECRET_KEY to enable billing.' });
  }
  next();
}

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

// Get all subscription plans (requires Stripe)
router.get('/plans', requireStripe, async (req: Request, res: Response) => {
  try {
    const plans = await subscriptionService.getPlans();
    res.json(plans);
  } catch (error: any) {
    console.error('Error fetching subscription plans:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get subscription status for a business (requires Stripe)
router.get('/status/:businessId', isAuthenticated, requireStripe, async (req: Request, res: Response) => {
  try {
    const businessId = parseInt(req.params.businessId);
    const status = await subscriptionService.getSubscriptionStatus(businessId);
    res.json(status);
  } catch (error: any) {
    console.error('Error fetching subscription status:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create a subscription (requires Stripe)
router.post('/create-subscription', isAuthenticated, requireStripe, async (req: Request, res: Response) => {
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

// Cancel a subscription (requires Stripe)
router.post('/cancel/:businessId', isAuthenticated, requireStripe, async (req: Request, res: Response) => {
  try {
    const businessId = parseInt(req.params.businessId);
    const result = await subscriptionService.cancelSubscription(businessId);
    res.json(result);
  } catch (error: any) {
    console.error('Error canceling subscription:', error);
    res.status(500).json({ error: error.message });
  }
});

// Resume a subscription (requires Stripe)
router.post('/resume/:businessId', isAuthenticated, requireStripe, async (req: Request, res: Response) => {
  try {
    const businessId = parseInt(req.params.businessId);
    const result = await subscriptionService.resumeSubscription(businessId);
    res.json(result);
  } catch (error: any) {
    console.error('Error resuming subscription:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get AI call usage for a business (does NOT require Stripe — always available)
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

// Get overage billing history for a business
router.get('/overage-history/:businessId', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const businessId = parseInt(req.params.businessId);
    const { getOverageHistory } = await import('../services/overageBillingService.js');
    const charges = await getOverageHistory(businessId);
    res.json({ charges });
  } catch (error: any) {
    console.error('Error fetching overage history:', error);
    res.status(500).json({ error: error.message });
  }
});

// Stripe webhook handler (requires Stripe)
router.post('/webhook', async (req: Request, res: Response) => {
  if (!stripe || !subscriptionService) {
    return res.status(503).json({ error: 'Stripe not configured' });
  }

  let event: Stripe.Event;

  try {
    if (!endpointSecret) {
      console.error('STRIPE_WEBHOOK_SECRET not configured - rejecting webhook');
      return res.status(500).json({ error: 'Webhook not configured' });
    }

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
