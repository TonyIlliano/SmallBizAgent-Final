/**
 * Clover POS Integration Routes
 *
 * Handles OAuth connection, menu syncing, and connection management
 * for restaurants using Clover POS.
 *
 * Security: All authenticated endpoints enforce business ownership via
 * checkBelongsToBusinessAsync to prevent IDOR attacks.
 */

import { Router } from 'express';
import { isAuthenticated, checkBelongsToBusinessAsync } from '../middleware/auth';
import {
  getCloverAuthUrl,
  handleCloverOAuthCallback,
  syncMenu,
  getCloverStatus,
  disconnectClover,
  getCachedMenu,
} from '../services/cloverService';
import { debouncedUpdateRetellAgent } from '../services/retellProvisioningService';

const router = Router();

/**
 * GET /api/clover/status
 * Check Clover connection status for the authenticated user's business
 */
router.get('/status', isAuthenticated, async (req, res) => {
  try {
    const businessId = (req.user as any)?.businessId;
    if (!businessId) {
      return res.status(400).json({ error: 'No business associated with your account' });
    }

    const status = await getCloverStatus(businessId);
    res.json(status);
  } catch (error) {
    console.error('Error checking Clover status:', error);
    res.status(500).json({ error: 'Failed to check Clover status' });
  }
});

/**
 * GET /api/clover/check-config
 * Check if Clover API credentials are configured in environment
 * Note: Only returns boolean flags about env config, no sensitive data — safe without auth
 */
router.get('/check-config', isAuthenticated, async (req, res) => {
  try {
    const configured = !!(process.env.CLOVER_APP_ID && process.env.CLOVER_APP_SECRET);
    res.json({
      configured,
      appIdExists: !!process.env.CLOVER_APP_ID,
      appSecretExists: !!process.env.CLOVER_APP_SECRET,
    });
  } catch (error) {
    console.error('Error checking Clover configuration:', error);
    res.status(500).json({ error: 'Failed to check Clover configuration' });
  }
});

/**
 * GET /api/clover/auth-url
 * Generate the Clover OAuth authorization URL for the authenticated user's business
 */
router.get('/auth-url', isAuthenticated, async (req, res) => {
  try {
    const businessId = (req.user as any)?.businessId;
    if (!businessId) {
      return res.status(400).json({ error: 'No business associated with your account' });
    }

    const environment = (req.query.environment as string) || 'sandbox';

    if (!process.env.CLOVER_APP_ID || !process.env.CLOVER_APP_SECRET) {
      return res.status(400).json({
        error: 'Clover integration not configured',
        message: 'CLOVER_APP_ID and CLOVER_APP_SECRET must be set in environment variables',
      });
    }

    const authUrl = getCloverAuthUrl(businessId, environment);
    res.json({ authUrl });
  } catch (error: any) {
    console.error('Error generating Clover auth URL:', error);
    res.status(500).json({ error: error.message || 'Failed to generate authorization URL' });
  }
});

/**
 * GET /api/clover/callback
 * OAuth callback handler — exchanges code for tokens and connects the business
 * This is called by Clover after the merchant approves the connection
 * Note: OAuth callbacks can't require session auth — state param validates the request
 */
router.get('/callback', async (req, res) => {
  try {
    const { code, merchant_id, state } = req.query;

    if (!code || !merchant_id || !state) {
      return res.redirect('/settings?clover=error&message=Missing+OAuth+parameters&tab=restaurant');
    }

    const business = await handleCloverOAuthCallback(
      code as string,
      merchant_id as string,
      state as string
    );

    // Auto-refresh VAPI assistant so it picks up the synced menu
    try {
      debouncedUpdateRetellAgent(business.id);
      console.log(`Triggered VAPI assistant refresh after Clover connection for business ${business.id}`);
    } catch (e) {
      console.error('Failed to trigger VAPI refresh after Clover connection:', e);
    }

    // Redirect back to settings page with success message
    res.redirect('/settings?clover=connected&tab=restaurant');
  } catch (error: any) {
    console.error('Clover OAuth callback error:', error);
    res.redirect(`/settings?clover=error&message=${encodeURIComponent(error.message)}&tab=restaurant`);
  }
});

/**
 * POST /api/clover/sync-menu
 * Trigger a manual menu sync from Clover for the authenticated user's business
 */
router.post('/sync-menu', isAuthenticated, async (req, res) => {
  try {
    const businessId = (req.user as any)?.businessId;
    if (!businessId) {
      return res.status(400).json({ error: 'No business associated with your account' });
    }

    const menu = await syncMenu(businessId);
    const totalItems = menu.categories.reduce((sum, cat) => sum + cat.items.length, 0);

    // Auto-refresh VAPI assistant so it picks up the updated menu
    try {
      debouncedUpdateRetellAgent(businessId);
      console.log(`Triggered VAPI assistant refresh after Clover menu sync for business ${businessId}`);
    } catch (e) {
      console.error('Failed to trigger VAPI refresh after menu sync:', e);
    }

    res.json({
      success: true,
      syncedAt: menu.syncedAt,
      categories: menu.categories.length,
      items: totalItems,
    });
  } catch (error: any) {
    console.error('Error syncing Clover menu:', error);
    res.status(500).json({ error: error.message || 'Failed to sync menu from Clover' });
  }
});

/**
 * GET /api/clover/menu
 * Get the cached menu for the authenticated user's business
 */
router.get('/menu', isAuthenticated, async (req, res) => {
  try {
    const businessId = (req.user as any)?.businessId;
    if (!businessId) {
      return res.status(400).json({ error: 'No business associated with your account' });
    }

    const menu = await getCachedMenu(businessId);
    if (!menu) {
      return res.status(404).json({ error: 'No menu cached. Connect Clover and sync first.' });
    }

    res.json(menu);
  } catch (error: any) {
    console.error('Error fetching cached menu:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch cached menu' });
  }
});

/**
 * POST /api/clover/disconnect
 * Disconnect the authenticated user's business from Clover
 */
router.post('/disconnect', isAuthenticated, async (req, res) => {
  try {
    const businessId = (req.user as any)?.businessId;
    if (!businessId) {
      return res.status(400).json({ error: 'No business associated with your account' });
    }

    await disconnectClover(businessId);
    res.json({ success: true, message: 'Clover disconnected successfully' });
  } catch (error: any) {
    console.error('Error disconnecting Clover:', error);
    res.status(500).json({ error: error.message || 'Failed to disconnect Clover' });
  }
});

export default router;
