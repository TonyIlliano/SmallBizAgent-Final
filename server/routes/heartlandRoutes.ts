/**
 * Heartland/Genius POS Integration Routes
 *
 * Handles API key connection, menu syncing, and connection management
 * for restaurants using Heartland POS. Unlike Clover/Square which use
 * OAuth, Heartland uses simple API key authentication.
 *
 * Security: All authenticated endpoints enforce business ownership via
 * session-derived businessId to prevent IDOR attacks.
 */

import { Router } from 'express';
import { isAuthenticated } from '../middleware/auth';
import {
  validateApiKey,
  connectHeartland,
  syncMenu,
  getHeartlandStatus,
  disconnectHeartland,
  getCachedMenu,
} from '../services/heartlandService';
import { debouncedUpdateRetellAgent } from '../services/retellProvisioningService';

const router = Router();

/**
 * GET /api/heartland/status
 * Check Heartland connection status for the authenticated user's business
 */
router.get('/status', isAuthenticated, async (req, res) => {
  try {
    const businessId = (req.user as any)?.businessId;
    if (!businessId) {
      return res.status(400).json({ error: 'No business associated with your account' });
    }

    const status = await getHeartlandStatus(businessId);
    res.json(status);
  } catch (error) {
    console.error('Error checking Heartland status:', error);
    res.status(500).json({ error: 'Failed to check Heartland status' });
  }
});

/**
 * GET /api/heartland/check-config
 * Check if Heartland partner key is configured in environment
 */
router.get('/check-config', isAuthenticated, async (req, res) => {
  try {
    const configured = !!process.env.HEARTLAND_PARTNER_KEY;
    res.json({
      configured,
      partnerKeyExists: !!process.env.HEARTLAND_PARTNER_KEY,
    });
  } catch (error) {
    console.error('Error checking Heartland configuration:', error);
    res.status(500).json({ error: 'Failed to check Heartland configuration' });
  }
});

/**
 * POST /api/heartland/connect
 * Connect the authenticated user's business to Heartland by validating and saving their API key
 */
router.post('/connect', isAuthenticated, async (req, res) => {
  try {
    const businessId = (req.user as any)?.businessId;
    if (!businessId) {
      return res.status(400).json({ error: 'No business associated with your account' });
    }

    const apiKey = req.body.apiKey as string;

    if (!apiKey || !apiKey.trim()) {
      return res.status(400).json({ error: 'API key is required' });
    }

    const business = await connectHeartland(businessId, apiKey.trim());

    // Auto-refresh VAPI assistant so it picks up the synced menu
    try {
      debouncedUpdateRetellAgent(business.id);
      console.log(`Triggered VAPI assistant refresh after Heartland connection for business ${business.id}`);
    } catch (e) {
      console.error('Failed to trigger VAPI refresh after Heartland connection:', e);
    }

    res.json({ success: true, message: 'Heartland connected successfully' });
  } catch (error: any) {
    console.error('Error connecting Heartland:', error);
    res.status(400).json({ error: error.message || 'Failed to connect Heartland' });
  }
});

/**
 * POST /api/heartland/sync-menu
 * Trigger a manual menu sync from Heartland for the authenticated user's business
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
      console.log(`Triggered VAPI assistant refresh after Heartland menu sync for business ${businessId}`);
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
    console.error('Error syncing Heartland menu:', error);
    res.status(500).json({ error: error.message || 'Failed to sync menu from Heartland' });
  }
});

/**
 * GET /api/heartland/menu
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
      return res.status(404).json({ error: 'No menu cached. Connect Heartland and sync first.' });
    }

    res.json(menu);
  } catch (error: any) {
    console.error('Error fetching cached menu:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch cached menu' });
  }
});

/**
 * POST /api/heartland/disconnect
 * Disconnect the authenticated user's business from Heartland
 */
router.post('/disconnect', isAuthenticated, async (req, res) => {
  try {
    const businessId = (req.user as any)?.businessId;
    if (!businessId) {
      return res.status(400).json({ error: 'No business associated with your account' });
    }

    await disconnectHeartland(businessId);

    // Refresh VAPI assistant to remove menu data
    try {
      debouncedUpdateRetellAgent(businessId);
    } catch (e) {
      console.error('Failed to trigger VAPI refresh after Heartland disconnect:', e);
    }

    res.json({ success: true, message: 'Heartland disconnected successfully' });
  } catch (error: any) {
    console.error('Error disconnecting Heartland:', error);
    res.status(500).json({ error: error.message || 'Failed to disconnect Heartland' });
  }
});

export default router;
