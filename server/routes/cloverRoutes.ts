/**
 * Clover POS Integration Routes
 *
 * Handles OAuth connection, menu syncing, and connection management
 * for restaurants using Clover POS.
 */

import { Router } from 'express';
import { isAuthenticated } from '../middleware/auth';
import {
  getCloverAuthUrl,
  handleCloverOAuthCallback,
  syncMenu,
  getCloverStatus,
  disconnectClover,
  getCachedMenu,
} from '../services/cloverService';

const router = Router();

/**
 * GET /api/clover/status
 * Check Clover connection status for a business
 */
router.get('/status', isAuthenticated, async (req, res) => {
  try {
    const businessId = parseInt(req.query.businessId as string, 10);

    if (isNaN(businessId)) {
      return res.status(400).json({ error: 'Invalid business ID' });
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
 */
router.get('/check-config', async (req, res) => {
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
 * Generate the Clover OAuth authorization URL
 */
router.get('/auth-url', isAuthenticated, async (req, res) => {
  try {
    const businessId = parseInt(req.query.businessId as string, 10);
    const environment = (req.query.environment as string) || 'sandbox';

    if (isNaN(businessId)) {
      return res.status(400).json({ error: 'Invalid business ID' });
    }

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
 */
router.get('/callback', async (req, res) => {
  try {
    const { code, merchant_id, state } = req.query;

    if (!code || !merchant_id || !state) {
      return res.redirect('/settings?clover=error&message=Missing+OAuth+parameters&tab=restaurant');
    }

    await handleCloverOAuthCallback(
      code as string,
      merchant_id as string,
      state as string
    );

    // Redirect back to settings page with success message
    res.redirect('/settings?clover=connected&tab=restaurant');
  } catch (error: any) {
    console.error('Clover OAuth callback error:', error);
    res.redirect(`/settings?clover=error&message=${encodeURIComponent(error.message)}&tab=restaurant`);
  }
});

/**
 * POST /api/clover/sync-menu
 * Trigger a manual menu sync from Clover
 */
router.post('/sync-menu', isAuthenticated, async (req, res) => {
  try {
    const businessId = parseInt(req.body.businessId as string, 10);

    if (isNaN(businessId)) {
      return res.status(400).json({ error: 'Invalid business ID' });
    }

    const menu = await syncMenu(businessId);
    const totalItems = menu.categories.reduce((sum, cat) => sum + cat.items.length, 0);

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
 * Get the cached menu for a business (for display/debugging)
 */
router.get('/menu', isAuthenticated, async (req, res) => {
  try {
    const businessId = parseInt(req.query.businessId as string, 10);

    if (isNaN(businessId)) {
      return res.status(400).json({ error: 'Invalid business ID' });
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
 * Disconnect a business from Clover
 */
router.post('/disconnect', isAuthenticated, async (req, res) => {
  try {
    const businessId = parseInt(req.body.businessId as string, 10);

    if (isNaN(businessId)) {
      return res.status(400).json({ error: 'Invalid business ID' });
    }

    await disconnectClover(businessId);
    res.json({ success: true, message: 'Clover disconnected successfully' });
  } catch (error: any) {
    console.error('Error disconnecting Clover:', error);
    res.status(500).json({ error: error.message || 'Failed to disconnect Clover' });
  }
});

export default router;
