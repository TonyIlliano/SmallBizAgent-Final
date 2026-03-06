/**
 * Automation Routes
 *
 * Endpoints for SMS automation agents — settings, activity logs,
 * active conversations, and dashboard stats.
 */

import { Request, Response } from 'express';
import { isAuthenticated } from '../auth';
import { storage } from '../storage';
import { getAgentTypes } from '../services/agentSettingsService';

const getBusinessId = (req: Request): number => {
  if (req.isAuthenticated() && req.user?.businessId) {
    return req.user.businessId;
  }
  throw new Error('Business ID not found for authenticated user');
};

export function registerAutomationRoutes(app: any) {

  // ── Agent Settings ──

  /** GET /api/automations/settings — Get all agent settings for the business */
  app.get('/api/automations/settings', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const settings = await storage.getAllAgentSettings(businessId);

      // Return settings for all agent types, filling in defaults for unconfigured ones
      const agentTypes = getAgentTypes();
      const result = agentTypes.map(type => {
        const existing = settings.find(s => s.agentType === type);
        return existing || { agentType: type, enabled: false, config: null, businessId };
      });

      res.json(result);
    } catch (error: any) {
      console.error('[Automations] Error fetching settings:', error);
      res.status(500).json({ message: error.message });
    }
  });

  /** GET /api/automations/settings/:agentType — Get single agent settings */
  app.get('/api/automations/settings/:agentType', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const { agentType } = req.params;
      const settings = await storage.getAgentSettings(businessId, agentType);
      res.json(settings || { agentType, enabled: false, config: null, businessId });
    } catch (error: any) {
      console.error('[Automations] Error fetching agent settings:', error);
      res.status(500).json({ message: error.message });
    }
  });

  /** PUT /api/automations/settings/:agentType — Update agent settings */
  app.put('/api/automations/settings/:agentType', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const { agentType } = req.params;
      const { enabled, config } = req.body;

      // Preserve existing config when only toggling enabled (config not in payload)
      let configToSave = config ?? null;
      if (config === undefined) {
        const existing = await storage.getAgentSettings(businessId, agentType);
        configToSave = existing?.config ?? null;
      }

      const settings = await storage.upsertAgentSettings(
        businessId,
        agentType,
        enabled ?? false,
        configToSave,
      );

      res.json(settings);
    } catch (error: any) {
      console.error('[Automations] Error updating agent settings:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // ── Activity Log ──

  /** GET /api/automations/activity — Get agent activity log */
  app.get('/api/automations/activity', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const agentType = req.query.agentType as string | undefined;
      const limit = parseInt(req.query.limit as string) || 50;

      const logs = await storage.getAgentActivityLogs(businessId, { agentType, limit });
      res.json(logs);
    } catch (error: any) {
      console.error('[Automations] Error fetching activity:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // ── Conversations ──

  /** GET /api/automations/conversations — Get SMS conversations for the business */
  app.get('/api/automations/conversations', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const agentType = req.query.agentType as string | undefined;
      const state = req.query.state as string | undefined;
      const limit = parseInt(req.query.limit as string) || 50;

      const conversations = await storage.getSmsConversationsByBusiness(businessId, { agentType, state, limit });
      res.json(conversations);
    } catch (error: any) {
      console.error('[Automations] Error fetching conversations:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // ── Dashboard Stats ──

  /** GET /api/automations/dashboard — Get summary stats per agent */
  app.get('/api/automations/dashboard', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const settings = await storage.getAllAgentSettings(businessId);
      const recentLogs = await storage.getAgentActivityLogs(businessId, { limit: 200 });

      const agentTypes = getAgentTypes();
      const dashboard = agentTypes.map(type => {
        const agentSettings = settings.find(s => s.agentType === type);
        const agentLogs = recentLogs.filter(l => l.agentType === type);
        const smsSent = agentLogs.filter(l => l.action === 'sms_sent').length;
        const repliesReceived = agentLogs.filter(l => l.action === 'reply_received').length;
        const lastActivity = agentLogs[0]?.createdAt ?? null;

        return {
          agentType: type,
          enabled: agentSettings?.enabled ?? false,
          smsSentCount: smsSent,
          repliesReceivedCount: repliesReceived,
          lastActivityAt: lastActivity,
        };
      });

      res.json(dashboard);
    } catch (error: any) {
      console.error('[Automations] Error fetching dashboard:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // ── Review Responses ──

  /** GET /api/automations/reviews — List review responses for the business */
  app.get('/api/automations/reviews', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const status = req.query.status as string | undefined;
      const responses = await storage.getReviewResponses(businessId, status ? { status } : undefined);
      res.json(responses);
    } catch (error: any) {
      console.error('[Automations] Error fetching review responses:', error);
      res.status(500).json({ message: error.message });
    }
  });

  /** PUT /api/automations/reviews/:id — Edit a draft review response */
  app.put('/api/automations/reviews/:id', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const id = parseInt(req.params.id);
      const { finalResponse } = req.body;

      const existing = await storage.getReviewResponseById(id);
      if (!existing || existing.businessId !== businessId) {
        return res.status(404).json({ message: 'Review response not found' });
      }

      const updated = await storage.updateReviewResponse(id, { finalResponse });
      res.json(updated);
    } catch (error: any) {
      console.error('[Automations] Error updating review response:', error);
      res.status(500).json({ message: error.message });
    }
  });

  /** POST /api/automations/reviews/:id/approve — Approve and post response to Google */
  app.post('/api/automations/reviews/:id/approve', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const id = parseInt(req.params.id);

      const existing = await storage.getReviewResponseById(id);
      if (!existing || existing.businessId !== businessId) {
        return res.status(404).json({ message: 'Review response not found' });
      }

      // If user edited the response, save it first
      if (req.body.finalResponse) {
        await storage.updateReviewResponse(id, { finalResponse: req.body.finalResponse });
      } else if (!existing.finalResponse) {
        // Use the AI draft as the final response
        await storage.updateReviewResponse(id, { finalResponse: existing.aiDraftResponse });
      }

      const { postReviewResponse } = await import('../services/reviewResponseAgentService');
      await postReviewResponse(id);

      const updated = await storage.getReviewResponseById(id);
      res.json(updated);
    } catch (error: any) {
      console.error('[Automations] Error approving review response:', error);
      res.status(500).json({ message: error.message });
    }
  });

  /** POST /api/automations/reviews/:id/dismiss — Dismiss a review */
  app.post('/api/automations/reviews/:id/dismiss', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const id = parseInt(req.params.id);

      const existing = await storage.getReviewResponseById(id);
      if (!existing || existing.businessId !== businessId) {
        return res.status(404).json({ message: 'Review response not found' });
      }

      const updated = await storage.updateReviewResponse(id, { status: 'dismissed' });
      res.json(updated);
    } catch (error: any) {
      console.error('[Automations] Error dismissing review:', error);
      res.status(500).json({ message: error.message });
    }
  });

  /** POST /api/automations/reviews/fetch — Manual trigger to fetch new reviews */
  app.post('/api/automations/reviews/fetch', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);

      const { GoogleBusinessProfileService } = await import('../services/googleBusinessProfileService');
      const gbp = new GoogleBusinessProfileService();
      const connected = await gbp.isConnected(businessId);
      if (!connected) {
        return res.status(400).json({
          message: 'Google Business Profile not connected. Connect in Settings > Integrations first.',
        });
      }

      const { processBusinessReviews } = await import('../services/reviewResponseAgentService');
      const count = await processBusinessReviews(businessId);
      res.json({ message: `Fetched and processed ${count} new review(s).`, count });
    } catch (error: any) {
      console.error('[Automations] Error fetching reviews:', error);
      res.status(500).json({ message: error.message });
    }
  });
}
