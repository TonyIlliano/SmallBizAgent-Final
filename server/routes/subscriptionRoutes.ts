import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import { z } from 'zod';
import { getUsageInfo } from '../services/usageService';
import { isAuthenticated, checkBelongsToBusinessAsync } from '../middleware/auth';

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
  planId: z.number(),
  promoCode: z.string().optional(),
});

// Get all subscription plans (requires Stripe) — public endpoint, plans are not sensitive
router.get('/plans', requireStripe, async (req: Request, res: Response) => {
  try {
    const plans = await subscriptionService.getPlans();
    res.json(plans);
  } catch (error: any) {
    console.error('Error fetching subscription plans:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get subscription status for the authenticated user's business (requires Stripe)
router.get('/status/:businessId', isAuthenticated, requireStripe, async (req: Request, res: Response) => {
  try {
    const businessId = parseInt(req.params.businessId);
    // Verify ownership (supports multi-location + admin access)
    const hasAccess = await checkBelongsToBusinessAsync(req.user, businessId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this business' });
    }
    const status = await subscriptionService.getSubscriptionStatus(businessId);
    res.json(status);
  } catch (error: any) {
    console.error('Error fetching subscription status:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create a subscription (requires Stripe) — uses session businessId
router.post('/create-subscription', isAuthenticated, requireStripe, async (req: Request, res: Response) => {
  try {
    const validationResult = createSubscriptionSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ error: validationResult.error });
    }

    const businessId = (req.user as any)?.businessId;
    if (!businessId) {
      return res.status(400).json({ error: 'No business associated with your account' });
    }

    const { planId, promoCode } = validationResult.data;
    const subscription = await subscriptionService.createSubscription(businessId, planId, promoCode);
    res.json(subscription);
  } catch (error: any) {
    console.error('Error creating subscription:', error);
    res.status(500).json({ error: error.message });
  }
});

// Validate promo code — public endpoint (promo codes are not sensitive, needed pre-auth)
router.post('/validate-promo', requireStripe, async (req: Request, res: Response) => {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ valid: false, error: 'Promo code required' });

    const result = await subscriptionService.validatePromoCode(code);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ valid: false, error: 'Failed to validate promo code' });
  }
});

// Apply a promo code to an existing subscription
router.post('/apply-promo/:businessId', isAuthenticated, requireStripe, async (req: Request, res: Response) => {
  try {
    const businessId = parseInt(req.params.businessId);
    const hasAccess = await checkBelongsToBusinessAsync(req.user, businessId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this business' });
    }

    const { code } = req.body;
    if (!code) return res.status(400).json({ success: false, error: 'Promo code required' });

    const result = await subscriptionService.applyPromoToSubscription(businessId, code);
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error: any) {
    res.status(500).json({ success: false, error: 'Failed to apply promo code' });
  }
});

// Cancel a subscription (requires Stripe)
router.post('/cancel/:businessId', isAuthenticated, requireStripe, async (req: Request, res: Response) => {
  try {
    const businessId = parseInt(req.params.businessId);
    const hasAccess = await checkBelongsToBusinessAsync(req.user, businessId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this business' });
    }

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
    const hasAccess = await checkBelongsToBusinessAsync(req.user, businessId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this business' });
    }

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
    const hasAccess = await checkBelongsToBusinessAsync(req.user, businessId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this business' });
    }

    const usage = await getUsageInfo(businessId);
    res.json(usage);
  } catch (error: any) {
    console.error('Error fetching usage info:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create Stripe Billing Portal session (self-service subscription management)
router.post('/billing-portal/:businessId', isAuthenticated, requireStripe, async (req: Request, res: Response) => {
  try {
    const businessId = parseInt(req.params.businessId);
    const hasAccess = await checkBelongsToBusinessAsync(req.user, businessId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this business' });
    }

    const appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    const returnUrl = `${appUrl}/settings?tab=subscription`;
    const result = await subscriptionService.createBillingPortalSession(businessId, returnUrl);
    res.json(result);
  } catch (error: any) {
    console.error('Error creating billing portal session:', error);
    res.status(500).json({ error: error.message });
  }
});

// Change subscription plan (upgrade/downgrade with proration)
router.post('/change-plan/:businessId', isAuthenticated, requireStripe, async (req: Request, res: Response) => {
  try {
    const businessId = parseInt(req.params.businessId);
    const hasAccess = await checkBelongsToBusinessAsync(req.user, businessId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this business' });
    }

    const { planId } = req.body;
    if (!planId) return res.status(400).json({ error: 'planId is required' });
    const result = await subscriptionService.changePlan(businessId, planId);
    res.json(result);
  } catch (error: any) {
    console.error('Error changing plan:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get overage billing history for a business
router.get('/overage-history/:businessId', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const businessId = parseInt(req.params.businessId);
    const hasAccess = await checkBelongsToBusinessAsync(req.user, businessId);
    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied to this business' });
    }

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

  if (!endpointSecret) {
    console.error('STRIPE_WEBHOOK_SECRET not configured - rejecting webhook');
    return res.status(500).json({ error: 'Webhook not configured' });
  }

  // ── Step 1: signature verification (4xx errors here are permanent — bad payload/sig) ──
  // Stripe treats 4xx as "do not retry" and marks the event as failed in their dashboard.
  let event: Stripe.Event;
  try {
    const signature = req.headers['stripe-signature'] as string;
    if (!signature) {
      return res.status(400).json({ error: 'Missing Stripe signature' });
    }
    event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      endpointSecret
    );
  } catch (sigError: any) {
    console.error('[Stripe] Signature verification failed:', sigError.message);
    return res.status(400).json({ error: `Signature verification failed: ${sigError.message}` });
  }

  // ── Step 2: event processing (5xx errors here are transient — Stripe should retry) ──
  // The service throws on transient errors (e.g., idempotency check DB failure).
  // Returning 500 tells Stripe to retry with exponential backoff (up to 3 days).
  try {
    await subscriptionService.handleWebhookEvent(event);
    res.json({ received: true });
  } catch (procError: any) {
    console.error(`[Stripe] Processing failed for event ${event.id} (${event.type}):`, procError.message);
    res.status(500).json({ error: 'Processing failed; will be retried' });
  }
});

export default router;
