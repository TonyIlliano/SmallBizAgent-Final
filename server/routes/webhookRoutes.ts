/**
 * Webhook Management Routes
 *
 * CRUD endpoints for managing webhooks + delivery log viewer.
 * Businesses can register webhook URLs to receive events (compatible with Zapier, Make.com, etc.)
 */

import { Request, Response } from 'express';
import { isAuthenticated } from '../auth';
import * as webhookService from '../services/webhookService';

const getBusinessId = (req: Request): number => {
  if (req.isAuthenticated() && req.user?.businessId) {
    return req.user.businessId;
  }
  throw new Error('Business ID not found for authenticated user');
};

export function registerWebhookRoutes(app: any) {
  /**
   * GET /api/webhooks — List all webhooks for the business
   */
  app.get('/api/webhooks', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const webhooks = await webhookService.getWebhooks(businessId);
      // Don't expose full secret — show last 6 chars only
      const sanitized = webhooks.map((w: any) => ({
        ...w,
        secret: '••••••' + w.secret.slice(-6),
      }));
      res.json(sanitized);
    } catch (error: any) {
      console.error('[Webhooks] Error listing:', error);
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * GET /api/webhooks/events — List all supported webhook events
   */
  app.get('/api/webhooks/events', isAuthenticated, async (_req: Request, res: Response) => {
    res.json(webhookService.WEBHOOK_EVENTS);
  });

  /**
   * POST /api/webhooks — Create a new webhook
   */
  app.post('/api/webhooks', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const { url, events, description } = req.body;

      if (!url || !events || !Array.isArray(events) || events.length === 0) {
        return res.status(400).json({ message: 'URL and at least one event are required' });
      }

      // Validate URL format
      try {
        new URL(url);
      } catch {
        return res.status(400).json({ message: 'Invalid URL format' });
      }

      // Validate events
      const invalidEvents = events.filter((e: string) => !webhookService.WEBHOOK_EVENTS.includes(e as any));
      if (invalidEvents.length > 0) {
        return res.status(400).json({ message: `Invalid events: ${invalidEvents.join(', ')}` });
      }

      const webhook = await webhookService.createWebhook(businessId, url, events, description);
      // Return full secret on creation (only time it's shown)
      res.status(201).json(webhook);
    } catch (error: any) {
      console.error('[Webhooks] Error creating:', error);
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * PUT /api/webhooks/:id — Update a webhook
   */
  app.put('/api/webhooks/:id', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const webhookId = parseInt(req.params.id);
      const { url, events, active, description } = req.body;

      // Validate events if provided
      if (events) {
        const invalidEvents = events.filter((e: string) => !webhookService.WEBHOOK_EVENTS.includes(e as any));
        if (invalidEvents.length > 0) {
          return res.status(400).json({ message: `Invalid events: ${invalidEvents.join(', ')}` });
        }
      }

      const webhook = await webhookService.updateWebhook(webhookId, businessId, { url, events, active, description });
      if (!webhook) {
        return res.status(404).json({ message: 'Webhook not found' });
      }
      res.json(webhook);
    } catch (error: any) {
      console.error('[Webhooks] Error updating:', error);
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * DELETE /api/webhooks/:id — Delete a webhook
   */
  app.delete('/api/webhooks/:id', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const webhookId = parseInt(req.params.id);
      const deleted = await webhookService.deleteWebhook(webhookId, businessId);
      if (!deleted) {
        return res.status(404).json({ message: 'Webhook not found' });
      }
      res.json({ message: 'Webhook deleted' });
    } catch (error: any) {
      console.error('[Webhooks] Error deleting:', error);
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * POST /api/webhooks/:id/test — Send a test webhook event
   */
  app.post('/api/webhooks/:id/test', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const webhookId = parseInt(req.params.id);
      const result = await webhookService.sendTestEvent(webhookId, businessId);
      if (!result.success) {
        return res.status(400).json({ message: result.error });
      }
      res.json({ message: 'Test event sent' });
    } catch (error: any) {
      console.error('[Webhooks] Error sending test:', error);
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * GET /api/webhooks/:id/deliveries — Get delivery log for a webhook
   */
  app.get('/api/webhooks/:id/deliveries', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const webhookId = parseInt(req.params.id);
      const limit = parseInt(req.query.limit as string) || 50;
      const deliveries = await webhookService.getDeliveries(webhookId, businessId, limit);
      res.json(deliveries);
    } catch (error: any) {
      console.error('[Webhooks] Error fetching deliveries:', error);
      res.status(500).json({ message: error.message });
    }
  });
}
