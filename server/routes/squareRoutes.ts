/**
 * Square POS Integration Routes
 *
 * Handles OAuth connection, menu syncing, and connection management
 * for restaurants using Square POS.
 *
 * Security: All authenticated endpoints enforce business ownership via
 * session-derived businessId to prevent IDOR attacks.
 */

import { Router } from 'express';
import { isAuthenticated } from '../middleware/auth';
import {
  getSquareAuthUrl,
  handleSquareOAuthCallback,
  syncMenu,
  getSquareStatus,
  disconnectSquare,
  getCachedMenu,
} from '../services/squareService';
import { debouncedUpdateRetellAgent } from '../services/retellProvisioningService';

const router = Router();

/**
 * GET /api/square/status
 * Check Square connection status for the authenticated user's business
 */
router.get('/status', isAuthenticated, async (req, res) => {
  try {
    const businessId = (req.user as any)?.businessId;
    if (!businessId) {
      return res.status(400).json({ error: 'No business associated with your account' });
    }

    const status = await getSquareStatus(businessId);
    res.json(status);
  } catch (error) {
    console.error('Error checking Square status:', error);
    res.status(500).json({ error: 'Failed to check Square status' });
  }
});

/**
 * GET /api/square/check-config
 * Check if Square API credentials are configured in environment
 */
router.get('/check-config', isAuthenticated, async (req, res) => {
  try {
    const configured = !!(process.env.SQUARE_APP_ID && process.env.SQUARE_APP_SECRET);
    res.json({
      configured,
      appIdExists: !!process.env.SQUARE_APP_ID,
      appSecretExists: !!process.env.SQUARE_APP_SECRET,
    });
  } catch (error) {
    console.error('Error checking Square configuration:', error);
    res.status(500).json({ error: 'Failed to check Square configuration' });
  }
});

/**
 * GET /api/square/auth-url
 * Generate the Square OAuth authorization URL for the authenticated user's business
 */
router.get('/auth-url', isAuthenticated, async (req, res) => {
  try {
    const businessId = (req.user as any)?.businessId;
    if (!businessId) {
      return res.status(400).json({ error: 'No business associated with your account' });
    }

    const environment = (req.query.environment as string) || 'sandbox';

    if (!process.env.SQUARE_APP_ID || !process.env.SQUARE_APP_SECRET) {
      return res.status(400).json({
        error: 'Square integration not configured',
        message: 'SQUARE_APP_ID and SQUARE_APP_SECRET must be set in environment variables',
      });
    }

    const authUrl = getSquareAuthUrl(businessId, environment);
    res.json({ authUrl });
  } catch (error: any) {
    console.error('Error generating Square auth URL:', error);
    res.status(500).json({ error: error.message || 'Failed to generate authorization URL' });
  }
});

/**
 * GET /api/square/callback
 * OAuth callback handler — exchanges code for tokens and connects the business
 * This is called by Square after the merchant approves the connection
 * Note: OAuth callbacks can't require session auth — state param validates the request
 */
router.get('/callback', async (req, res) => {
  try {
    const { code, state } = req.query;

    if (!code || !state) {
      return res.redirect('/settings?square=error&message=Missing+OAuth+parameters&tab=restaurant');
    }

    const business = await handleSquareOAuthCallback(
      code as string,
      state as string
    );

    // Auto-refresh VAPI assistant so it picks up the synced menu
    try {
      debouncedUpdateRetellAgent(business.id);
      console.log(`Triggered VAPI assistant refresh after Square connection for business ${business.id}`);
    } catch (e) {
      console.error('Failed to trigger VAPI refresh after Square connection:', e);
    }

    // Redirect back to settings page with success message
    res.redirect('/settings?square=connected&tab=restaurant');
  } catch (error: any) {
    console.error('Square OAuth callback error:', error);
    res.redirect(`/settings?square=error&message=${encodeURIComponent(error.message)}&tab=restaurant`);
  }
});

/**
 * POST /api/square/sync-menu
 * Trigger a manual menu sync from Square for the authenticated user's business
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
      console.log(`Triggered VAPI assistant refresh after Square menu sync for business ${businessId}`);
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
    console.error('Error syncing Square menu:', error);
    res.status(500).json({ error: error.message || 'Failed to sync menu from Square' });
  }
});

/**
 * GET /api/square/menu
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
      return res.status(404).json({ error: 'No menu cached. Connect Square and sync first.' });
    }

    res.json(menu);
  } catch (error: any) {
    console.error('Error fetching cached menu:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch cached menu' });
  }
});

/**
 * POST /api/square/disconnect
 * Disconnect the authenticated user's business from Square
 */
router.post('/disconnect', isAuthenticated, async (req, res) => {
  try {
    const businessId = (req.user as any)?.businessId;
    if (!businessId) {
      return res.status(400).json({ error: 'No business associated with your account' });
    }

    await disconnectSquare(businessId);
    res.json({ success: true, message: 'Square disconnected successfully' });
  } catch (error: any) {
    console.error('Error disconnecting Square:', error);
    res.status(500).json({ error: error.message || 'Failed to disconnect Square' });
  }
});

export default router;
