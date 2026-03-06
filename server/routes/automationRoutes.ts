/**
 * Automation Routes
 *
 * Endpoints for SMS automation agents — settings, activity logs,
 * active conversations, and dashboard stats.
 */

import { Request, Response } from 'express';
import { isAuthenticated } from '../auth';
import { isOwnerOrAdmin } from '../middleware/auth';
import { storage } from '../storage';
import { getAgentTypes } from '../services/agentSettingsService';
import { sql } from 'drizzle-orm';
import { db } from '../db';

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
        const agentLogs = recentLogs
          .filter(l => l.agentType === type)
          .filter(l => !(l.details as any)?.isTest);
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

  // ── Agent Test ──

  /** POST /api/automations/test/:agentType — Send a test SMS to the owner's phone */
  app.post('/api/automations/test/:agentType', isOwnerOrAdmin, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const { agentType } = req.params;
      const { phone } = req.body;

      if (!phone || typeof phone !== 'string' || phone.replace(/\D/g, '').length < 10) {
        return res.status(400).json({ message: 'A valid phone number is required.' });
      }

      const validTypes = getAgentTypes();
      if (!validTypes.includes(agentType)) {
        return res.status(400).json({ message: `Invalid agent type: ${agentType}` });
      }

      const { sendAgentTest } = await import('../services/agentTestService');
      const result = await sendAgentTest(businessId, agentType, phone);
      res.json({ success: true, ...result });
    } catch (error: any) {
      console.error('[Automations] Error sending test:', error);
      res.status(500).json({ message: error.message });
    }
  });

  // ── Agent Performance Report ──

  /** GET /api/automations/report — Aggregated agent performance metrics (owner only) */
  app.get('/api/automations/report', isOwnerOrAdmin, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const period = (req.query.period as string) || 'month';

      // Compute date range
      const now = new Date();
      let sinceDate: Date;
      switch (period) {
        case 'week':
          sinceDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'quarter':
          sinceDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
          break;
        case 'year':
          sinceDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
        default:
          sinceDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
      }

      // Per-agent action counts from activity log (exclude test data)
      const actionCounts = await db.execute(sql`
        SELECT agent_type, action, COUNT(*)::int AS count
        FROM agent_activity_log
        WHERE business_id = ${businessId}
          AND created_at >= ${sinceDate}
          AND NOT (details->>'isTest' = 'true')
        GROUP BY agent_type, action
        ORDER BY agent_type, action
      `);

      // Per-agent conversation outcome counts (exclude test data)
      const convOutcomes = await db.execute(sql`
        SELECT agent_type, state, COUNT(*)::int AS count
        FROM sms_conversations
        WHERE business_id = ${businessId}
          AND created_at >= ${sinceDate}
          AND NOT (context->>'isTest' = 'true')
        GROUP BY agent_type, state
        ORDER BY agent_type, state
      `);

      // Average response time (hours) per agent (exclude test data)
      const avgResponseTime = await db.execute(sql`
        SELECT agent_type,
          ROUND(AVG(EXTRACT(EPOCH FROM (last_reply_received_at - last_message_sent_at)) / 3600)::numeric, 1) AS avg_hours
        FROM sms_conversations
        WHERE business_id = ${businessId}
          AND created_at >= ${sinceDate}
          AND last_reply_received_at IS NOT NULL
          AND last_message_sent_at IS NOT NULL
          AND NOT (context->>'isTest' = 'true')
        GROUP BY agent_type
      `);

      // Daily activity trend (exclude test data)
      const dailyTrend = await db.execute(sql`
        SELECT
          TO_CHAR(created_at, 'YYYY-MM-DD') AS date,
          action,
          COUNT(*)::int AS count
        FROM agent_activity_log
        WHERE business_id = ${businessId}
          AND created_at >= ${sinceDate}
          AND NOT (details->>'isTest' = 'true')
        GROUP BY TO_CHAR(created_at, 'YYYY-MM-DD'), action
        ORDER BY date
      `);

      // Appointments booked via conversational SMS (exclude test data)
      const smsBookings = await db.execute(sql`
        SELECT COUNT(*)::int AS count
        FROM agent_activity_log
        WHERE business_id = ${businessId}
          AND created_at >= ${sinceDate}
          AND action = 'booking_reply_received'
          AND (details->>'replyMessage') ILIKE '%booked%'
          AND NOT (details->>'isTest' = 'true')
      `);

      // Build per-agent report
      const agentTypes = getAgentTypes();
      const actionRows = actionCounts.rows as { agent_type: string; action: string; count: number }[];
      const convRows = convOutcomes.rows as { agent_type: string; state: string; count: number }[];
      const responseRows = avgResponseTime.rows as { agent_type: string; avg_hours: string | null }[];

      const agents = agentTypes.map(type => {
        const actions = actionRows.filter(r => r.agent_type === type);
        const convs = convRows.filter(r => r.agent_type === type);
        const respTime = responseRows.find(r => r.agent_type === type);

        const smsSent = actions.find(a => a.action === 'sms_sent')?.count ?? 0;
        const repliesReceived = actions.find(a => a.action === 'reply_received')?.count ?? 0;
        const bookingReplies = actions.find(a => a.action === 'booking_reply_received')?.count ?? 0;
        const escalated = actions.filter(a => a.action === 'escalated').reduce((s, a) => s + a.count, 0);
        const reviewsDrafted = actions.find(a => a.action === 'review_drafted')?.count ?? 0;
        const reviewsPosted = actions.find(a => a.action === 'review_posted')?.count ?? 0;

        const totalConversations = convs.reduce((s, c) => s + c.count, 0);
        const resolved = convs.find(c => c.state === 'resolved')?.count ?? 0;
        const expired = convs.find(c => c.state === 'expired')?.count ?? 0;
        const active = convs.filter(c => !['resolved', 'expired'].includes(c.state)).reduce((s, c) => s + c.count, 0);

        return {
          agentType: type,
          smsSent,
          repliesReceived,
          replyRate: smsSent > 0 ? Math.round((repliesReceived / smsSent) * 100) : 0,
          bookingReplies,
          escalated,
          reviewsDrafted,
          reviewsPosted,
          totalConversations,
          resolved,
          expired,
          active,
          resolutionRate: totalConversations > 0 ? Math.round((resolved / totalConversations) * 100) : 0,
          avgResponseTimeHours: respTime?.avg_hours ? parseFloat(respTime.avg_hours) : null,
        };
      });

      // Aggregate totals
      const totals = {
        smsSent: agents.reduce((s, a) => s + a.smsSent, 0),
        repliesReceived: agents.reduce((s, a) => s + a.repliesReceived, 0),
        totalConversations: agents.reduce((s, a) => s + a.totalConversations, 0),
        resolved: agents.reduce((s, a) => s + a.resolved, 0),
        appointmentsBooked: (smsBookings.rows as { count: number }[])[0]?.count ?? 0,
      };
      const totalReplyRate = totals.smsSent > 0 ? Math.round((totals.repliesReceived / totals.smsSent) * 100) : 0;
      const totalResolutionRate = totals.totalConversations > 0 ? Math.round((totals.resolved / totals.totalConversations) * 100) : 0;

      // Format daily trend
      const trendRows = dailyTrend.rows as { date: string; action: string; count: number }[];
      const trendMap = new Map<string, { date: string; sent: number; replies: number }>();
      for (const row of trendRows) {
        if (!trendMap.has(row.date)) trendMap.set(row.date, { date: row.date, sent: 0, replies: 0 });
        const entry = trendMap.get(row.date)!;
        if (row.action === 'sms_sent') entry.sent += row.count;
        if (row.action === 'reply_received' || row.action === 'booking_reply_received') entry.replies += row.count;
      }
      const trend = Array.from(trendMap.values()).sort((a, b) => a.date.localeCompare(b.date));

      res.json({
        period,
        since: sinceDate.toISOString(),
        totals: { ...totals, replyRate: totalReplyRate, resolutionRate: totalResolutionRate },
        agents,
        trend,
      });
    } catch (error: any) {
      console.error('[Automations] Error fetching report:', error);
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
