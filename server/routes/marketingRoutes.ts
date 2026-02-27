/**
 * Marketing Routes
 *
 * Endpoints for marketing insights, win-back campaigns, review blasts,
 * campaign management, and customer re-engagement.
 */

import { Request, Response } from 'express';
import { isAuthenticated } from '../auth';
import * as marketingService from '../services/marketingService';

const getBusinessId = (req: Request): number => {
  if (req.isAuthenticated() && req.user?.businessId) {
    return req.user.businessId;
  }
  throw new Error('Business ID not found for authenticated user');
};

export function registerMarketingRoutes(app: any) {
  /**
   * GET /api/marketing/insights — Get marketing insights for the business
   */
  app.get('/api/marketing/insights', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const insights = await marketingService.getMarketingInsights(businessId);
      res.json(insights);
    } catch (error: any) {
      console.error('[Marketing] Error fetching insights:', error);
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * GET /api/marketing/inactive-customers — Get inactive customers
   */
  app.get('/api/marketing/inactive-customers', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const days = parseInt(req.query.days as string) || 90;
      const customers = await marketingService.getInactiveCustomers(businessId, days);
      res.json(customers);
    } catch (error: any) {
      console.error('[Marketing] Error fetching inactive customers:', error);
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * POST /api/marketing/win-back — Send a win-back campaign to selected customers
   */
  app.post('/api/marketing/win-back', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const { customerIds, template, channel, subject } = req.body;
      const result = await marketingService.sendWinBackCampaign(businessId, customerIds, template, channel, subject);
      res.json(result);
    } catch (error: any) {
      console.error('[Marketing] Error sending win-back campaign:', error);
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * GET /api/marketing/review-stats — Get review campaign statistics
   */
  app.get('/api/marketing/review-stats', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const stats = await marketingService.getReviewCampaignStats(businessId);
      res.json(stats);
    } catch (error: any) {
      console.error('[Marketing] Error fetching review stats:', error);
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * POST /api/marketing/review-blast — Send bulk review requests
   */
  app.post('/api/marketing/review-blast', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const { customerIds } = req.body;
      const result = await marketingService.sendBulkReviewRequests(businessId, customerIds);
      res.json(result);
    } catch (error: any) {
      console.error('[Marketing] Error sending review blast:', error);
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * GET /api/marketing/templates — Get available campaign templates
   */
  app.get('/api/marketing/templates', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const templates = await marketingService.getCampaignTemplates();
      res.json(templates);
    } catch (error: any) {
      console.error('[Marketing] Error fetching templates:', error);
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * POST /api/marketing/campaigns — Send a marketing campaign
   */
  app.post('/api/marketing/campaigns', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const { name, type, template, channel, customerIds, subject, segment } = req.body;
      const campaign = await marketingService.sendCampaign(businessId, name, type, template, channel, customerIds, subject, segment);
      res.json(campaign);
    } catch (error: any) {
      console.error('[Marketing] Error sending campaign:', error);
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * GET /api/marketing/campaigns — Get campaign history
   */
  app.get('/api/marketing/campaigns', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const campaigns = await marketingService.getCampaignHistory(businessId);
      res.json(campaigns);
    } catch (error: any) {
      console.error('[Marketing] Error fetching campaign history:', error);
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * GET /api/marketing/birthdays — Get upcoming customer birthdays (next 7 days)
   */
  app.get('/api/marketing/birthdays', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const daysAhead = parseInt(req.query.days as string) || 7;
      const birthdays = await marketingService.getUpcomingBirthdays(businessId, daysAhead);
      res.json(birthdays);
    } catch (error: any) {
      console.error('[Marketing] Error fetching upcoming birthdays:', error);
      res.status(500).json({ message: error.message });
    }
  });

  /**
   * POST /api/marketing/birthday-campaign — Send birthday discount messages
   * Body: { daysAhead?, discountPercent?, validDays?, customMessage?, channel? }
   */
  app.post('/api/marketing/birthday-campaign', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const { daysAhead, discountPercent, validDays, customMessage, channel } = req.body;
      const result = await marketingService.sendBirthdayCampaigns(businessId, {
        daysAhead,
        discountPercent,
        validDays,
        customMessage,
        channel,
      });
      res.json(result);
    } catch (error: any) {
      console.error('[Marketing] Error sending birthday campaigns:', error);
      res.status(500).json({ message: error.message });
    }
  });
}
