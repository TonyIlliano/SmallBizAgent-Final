import { Router, Request, Response } from 'express';
import { stripeConnectService } from '../services/stripeConnectService';

const router = Router();

/**
 * GET /api/stripe-connect/status
 * Get the Stripe Connect account status for the authenticated user's business
 */
router.get('/status', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    const businessId = (req.user as any).businessId;
    if (!businessId) {
      return res.status(400).json({ message: 'No business associated with this account' });
    }

    const status = await stripeConnectService.getConnectStatus(businessId);
    res.json(status);
  } catch (error) {
    console.error('Error getting Connect status:', error);
    res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to get Connect status' });
  }
});

/**
 * POST /api/stripe-connect/onboard
 * Start or continue Stripe Connect onboarding for the authenticated user's business
 * Returns a Stripe-hosted onboarding URL
 */
router.post('/onboard', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    const businessId = (req.user as any).businessId;
    if (!businessId) {
      return res.status(400).json({ message: 'No business associated with this account' });
    }

    const result = await stripeConnectService.createConnectAccount(businessId);
    res.json(result);
  } catch (error) {
    console.error('Error starting Connect onboarding:', error);
    res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to start onboarding' });
  }
});

/**
 * GET /api/stripe-connect/dashboard-link
 * Get a Stripe Express dashboard login link for the connected business
 */
router.get('/dashboard-link', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ message: 'Not authenticated' });
    }

    const businessId = (req.user as any).businessId;
    if (!businessId) {
      return res.status(400).json({ message: 'No business associated with this account' });
    }

    const result = await stripeConnectService.createDashboardLink(businessId);
    res.json(result);
  } catch (error) {
    console.error('Error creating dashboard link:', error);
    res.status(500).json({ message: error instanceof Error ? error.message : 'Failed to create dashboard link' });
  }
});

export default router;
