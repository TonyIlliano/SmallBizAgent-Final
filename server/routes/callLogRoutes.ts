import { Router, Request, Response } from "express";
import { storage } from "../storage";
import { z } from "zod";
import { insertCallLogSchema } from "@shared/schema";
import { isAuthenticated } from "../auth";

const router = Router();

// Helper to get businessId from authenticated request
const getBusinessId = (req: Request): number => {
  if (req.isAuthenticated() && req.user?.businessId) {
    return req.user.businessId;
  }
  if ((req as any).apiKeyBusinessId) {
    return (req as any).apiKeyBusinessId;
  }
  return 0;
};

// Helper to verify resource belongs to user's business
const verifyBusinessOwnership = (resource: any, req: Request): boolean => {
  if (!resource) return false;
  const userBusinessId = getBusinessId(req);
  return resource.businessId === userBusinessId;
};

// =================== CALL LOGS API ===================
router.get("/call-logs", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const businessId = getBusinessId(req);
    const params: any = {};

    if (req.query.startDate) {
      params.startDate = new Date(req.query.startDate as string);
    }

    if (req.query.endDate) {
      params.endDate = new Date(req.query.endDate as string);
    }

    if (req.query.isEmergency !== undefined) {
      params.isEmergency = req.query.isEmergency === 'true';
    }

    if (req.query.status) {
      params.status = req.query.status as string;
    }

    const logs = await storage.getCallLogs(businessId, params);
    res.json(logs);
  } catch (error: any) {
    // Handle missing column errors gracefully (DB migration may not have run yet)
    if (error?.message?.includes('does not exist') || error?.code === '42703') {
      console.warn('[CallLogs] Column missing in call_logs table, returning empty:', error.message);
      res.json([]);
    } else {
      console.error('[CallLogs] Error fetching call logs:', error?.message || error);
      res.status(500).json({ message: "Error fetching call logs" });
    }
  }
});

router.get("/call-logs/:id", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid call log ID" });
    }
    const log = await storage.getCallLog(id);
    if (!log || !verifyBusinessOwnership(log, req)) {
      return res.status(404).json({ message: "Call log not found" });
    }
    res.json(log);
  } catch (error) {
    res.status(500).json({ message: "Error fetching call log" });
  }
});

router.post("/call-logs", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const businessId = getBusinessId(req);
    const validatedData = insertCallLogSchema.parse({ ...req.body, businessId });
    const log = await storage.createCallLog(validatedData);
    res.status(201).json(log);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.format() });
    }
    res.status(500).json({ message: "Error creating call log" });
  }
});

router.put("/call-logs/:id", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid call log ID" });
    }
    const existing = await storage.getCallLog(id);
    if (!existing || !verifyBusinessOwnership(existing, req)) {
      return res.status(404).json({ message: "Call log not found" });
    }
    const validatedData = insertCallLogSchema.partial().parse(req.body);
    const log = await storage.updateCallLog(id, validatedData);
    res.json(log);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.format() });
    }
    res.status(500).json({ message: "Error updating call log" });
  }
});

// =================== CALL INTELLIGENCE API ===================

router.get("/call-intelligence/:callLogId", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const callLogId = parseInt(req.params.callLogId);
    if (isNaN(callLogId)) {
      return res.status(400).json({ error: "Invalid call log ID" });
    }
    const intelligence = await storage.getCallIntelligence(callLogId);
    if (!intelligence) {
      return res.status(404).json({ error: 'Intelligence not found for this call' });
    }
    const businessId = getBusinessId(req);
    if (intelligence.businessId !== businessId && req.user!.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    res.json(intelligence);
  } catch (error) {
    console.error('Error fetching call intelligence:', error);
    res.status(500).json({ error: 'Failed to fetch call intelligence' });
  }
});

router.get("/call-intelligence/business/summary", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const businessId = getBusinessId(req);
    const { startDate, endDate } = req.query;

    const intelligence = await storage.getCallIntelligenceByBusiness(businessId, {
      startDate: startDate ? new Date(startDate as string) : undefined,
      endDate: endDate ? new Date(endDate as string) : undefined,
      limit: 100,
    });

    const totalCalls = intelligence.length;
    const avgSentiment = intelligence.reduce((sum, r) => sum + (r.sentiment || 3), 0) / (totalCalls || 1);
    const intentBreakdown = intelligence.reduce((acc, r) => {
      if (r.intent) acc[r.intent] = (acc[r.intent] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    const followUpsNeeded = intelligence.filter(r => r.followUpNeeded).length;

    res.json({
      totalAnalyzed: totalCalls,
      averageSentiment: Math.round(avgSentiment * 10) / 10,
      intentBreakdown,
      followUpsNeeded,
      recentIntelligence: intelligence.slice(0, 20),
    });
  } catch (error) {
    console.error('Error fetching intelligence summary:', error);
    res.status(500).json({ error: 'Failed to fetch intelligence summary' });
  }
});

// =================== CUSTOMER INSIGHTS API ===================

router.get("/customers/:id/insights", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const customerId = parseInt(req.params.id);
    if (isNaN(customerId)) {
      return res.status(400).json({ message: "Invalid customer ID" });
    }
    const businessId = getBusinessId(req);
    const insights = await storage.getCustomerInsights(customerId, businessId);
    if (!insights) {
      return res.json({ message: 'No insights calculated yet', insights: null });
    }
    res.json(insights);
  } catch (error) {
    console.error('Error fetching customer insights:', error);
    res.status(500).json({ error: 'Failed to fetch customer insights' });
  }
});

router.get("/customers/insights/high-risk", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const businessId = getBusinessId(req);
    const highRisk = await storage.getHighRiskCustomers(businessId);
    res.json(highRisk);
  } catch (error) {
    console.error('Error fetching high-risk customers:', error);
    res.status(500).json({ error: 'Failed to fetch high-risk customers' });
  }
});

export default router;
