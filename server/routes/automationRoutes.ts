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
}
