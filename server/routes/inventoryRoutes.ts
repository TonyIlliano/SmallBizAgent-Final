/**
 * Inventory API Routes
 *
 * Restaurant-only endpoints for POS inventory tracking with low-stock alerts.
 * Requires business to have Clover or Square connected and type = 'restaurant'.
 */

import type { Express, Request, Response } from 'express';
import { isAuthenticated } from '../auth';
import { storage } from '../storage';
import {
  syncInventory,
  getInventoryItems,
  updateInventoryItem,
  getInventoryStats,
  getInventoryCategories,
  checkAndSendLowStockAlerts,
  handleCloverInventoryWebhook,
} from '../services/inventoryService';

const getBusinessId = (req: Request): number => {
  if (req.isAuthenticated() && req.user?.businessId) {
    return req.user.businessId;
  }
  throw new Error('Not authenticated');
};

/**
 * Middleware: ensure business is a restaurant with POS connected
 */
async function requireRestaurantWithPOS(req: Request, res: Response, next: Function) {
  try {
    const businessId = getBusinessId(req);
    const business = await storage.getBusiness(businessId);

    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }

    const isRestaurant = business.industry?.toLowerCase() === 'restaurant' || business.type === 'restaurant';
    if (!isRestaurant) {
      return res.status(403).json({ error: 'Inventory tracking is only available for restaurants' });
    }

    const hasPOS =
      (business.cloverMerchantId && business.cloverAccessToken) ||
      (business.squareAccessToken && business.squareLocationId);

    if (!hasPOS) {
      return res.status(400).json({ error: 'No POS system connected. Connect Clover or Square first.' });
    }

    next();
  } catch (err: any) {
    res.status(401).json({ error: err.message });
  }
}

export function registerInventoryRoutes(app: Express) {

  // ── GET /api/inventory/items — Paginated inventory items ──
  app.get('/api/inventory/items', isAuthenticated, requireRestaurantWithPOS, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const result = await getInventoryItems(businessId, {
        category: req.query.category as string | undefined,
        lowStockOnly: req.query.lowStock === 'true',
        search: req.query.search as string | undefined,
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        pageSize: req.query.pageSize ? parseInt(req.query.pageSize as string) : 25,
        sortBy: req.query.sortBy as string | undefined,
        sortDir: req.query.sortDir as string | undefined,
      });
      res.json(result);
    } catch (err: any) {
      console.error('[Inventory Routes] Error fetching items:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ── GET /api/inventory/stats — Dashboard stats ──
  app.get('/api/inventory/stats', isAuthenticated, requireRestaurantWithPOS, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const stats = await getInventoryStats(businessId);
      res.json(stats);
    } catch (err: any) {
      console.error('[Inventory Routes] Error fetching stats:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ── GET /api/inventory/categories — Unique categories for filter ──
  app.get('/api/inventory/categories', isAuthenticated, requireRestaurantWithPOS, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const categories = await getInventoryCategories(businessId);
      res.json(categories);
    } catch (err: any) {
      console.error('[Inventory Routes] Error fetching categories:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ── POST /api/inventory/sync — Trigger a manual inventory sync ──
  app.post('/api/inventory/sync', isAuthenticated, requireRestaurantWithPOS, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const result = await syncInventory(businessId);
      res.json({
        message: `Synced ${result.synced} items (${result.created} new, ${result.updated} updated)`,
        ...result,
      });
    } catch (err: any) {
      console.error('[Inventory Routes] Sync error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ── PATCH /api/inventory/items/:id — Update item threshold/tracking ──
  app.patch('/api/inventory/items/:id', isAuthenticated, requireRestaurantWithPOS, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const itemId = parseInt(req.params.id);
      const { lowStockThreshold, trackStock } = req.body;

      const updated = await updateInventoryItem(itemId, businessId, {
        lowStockThreshold,
        trackStock,
      });

      if (!updated) {
        return res.status(404).json({ error: 'Item not found' });
      }

      res.json(updated);
    } catch (err: any) {
      console.error('[Inventory Routes] Update error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ── POST /api/inventory/check-alerts — Manually trigger alert check ──
  app.post('/api/inventory/check-alerts', isAuthenticated, requireRestaurantWithPOS, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const result = await checkAndSendLowStockAlerts(businessId);
      res.json(result);
    } catch (err: any) {
      console.error('[Inventory Routes] Alert check error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ── POST /api/webhooks/clover/inventory — Clover inventory webhook receiver ──
  // This endpoint is called by Clover when inventory changes occur
  // No auth required (Clover webhooks use verification tokens)
  app.post('/api/webhooks/clover/inventory', async (req: Request, res: Response) => {
    try {
      const { merchantId, objectId, type } = req.body;

      // Clover sends UPDATE events for inventory changes
      if (type === 'UPDATE' && merchantId && objectId) {
        // Process asynchronously (don't block webhook response)
        handleCloverInventoryWebhook(merchantId, objectId).catch((err) =>
          console.error('[Clover Inventory Webhook] Error:', err)
        );
      }

      // Always respond 200 to Clover quickly
      res.status(200).json({ received: true });
    } catch (err: any) {
      console.error('[Clover Inventory Webhook] Error:', err);
      res.status(200).json({ received: true }); // Still 200 so Clover doesn't retry
    }
  });

  console.log('[Routes] Inventory routes registered');
}

export default registerInventoryRoutes;
