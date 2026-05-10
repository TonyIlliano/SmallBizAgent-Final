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

// =================== CALL QUALITY SCORES API ===================
// Per-call quality scores from the rubric grader. Becomes the merchant-facing
// "AI Quality Score" feature: per-call score, monthly trend, flagged calls.

/** GET /api/call-quality/:callLogId — single call's score */
router.get("/call-quality/:callLogId", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const callLogId = parseInt(req.params.callLogId, 10);
    if (isNaN(callLogId)) return res.status(400).json({ error: "Invalid callLogId" });

    const businessId = getBusinessId(req);
    if (!businessId) return res.status(401).json({ error: "Not authenticated" });

    const { db } = await import('../db');
    const { callQualityScores } = await import('@shared/schema');
    const { eq } = await import('drizzle-orm');

    const [score] = await db.select().from(callQualityScores)
      .where(eq(callQualityScores.callLogId, callLogId))
      .limit(1);

    if (!score) return res.status(404).json({ error: "No quality score for this call" });
    if (score.businessId !== businessId && req.user?.role !== 'admin') {
      return res.status(403).json({ error: "Access denied" });
    }

    res.json(score);
  } catch (error) {
    console.error('Error fetching call quality score:', error);
    res.status(500).json({ error: 'Failed to fetch call quality score' });
  }
});

/** GET /api/call-quality/business/summary — monthly average + dimension breakdown */
router.get("/call-quality/business/summary", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const businessId = getBusinessId(req);
    if (!businessId) return res.status(401).json({ error: "Not authenticated" });

    const { db } = await import('../db');
    const { callQualityScores } = await import('@shared/schema');
    const { and, eq, gte, sql } = await import('drizzle-orm');

    // Last 30 days vs prior 30 days for trend
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

    // Current month
    const [current] = await db.select({
      avg: sql<number>`COALESCE(AVG(${callQualityScores.totalScore}), 0)`,
      count: sql<number>`COUNT(*)`,
      flagged: sql<number>`COUNT(*) FILTER (WHERE ${callQualityScores.flagged} = true AND ${callQualityScores.flagDismissed} = false)`,
    })
      .from(callQualityScores)
      .where(and(
        eq(callQualityScores.businessId, businessId),
        gte(callQualityScores.scoredAt, thirtyDaysAgo),
      ));

    // Prior period (30-60 days ago) for trend arrow
    const [prior] = await db.select({
      avg: sql<number>`COALESCE(AVG(${callQualityScores.totalScore}), 0)`,
    })
      .from(callQualityScores)
      .where(and(
        eq(callQualityScores.businessId, businessId),
        gte(callQualityScores.scoredAt, sixtyDaysAgo),
        sql`${callQualityScores.scoredAt} < ${thirtyDaysAgo}`,
      ));

    // Dimension breakdown — pull all rows in current period and average each dimension
    const recentRows = await db.select({
      dimensions: callQualityScores.dimensions,
    })
      .from(callQualityScores)
      .where(and(
        eq(callQualityScores.businessId, businessId),
        gte(callQualityScores.scoredAt, thirtyDaysAgo),
      ))
      .limit(500);

    const dimensionTotals: Record<string, { sum: number; count: number }> = {};
    for (const row of recentRows) {
      const dims = row.dimensions as Record<string, { score: number; justification?: string }> | null;
      if (!dims) continue;
      for (const [key, val] of Object.entries(dims)) {
        if (typeof val?.score !== 'number') continue;
        if (!dimensionTotals[key]) dimensionTotals[key] = { sum: 0, count: 0 };
        dimensionTotals[key].sum += val.score;
        dimensionTotals[key].count += 1;
      }
    }
    const dimensionBreakdown = Object.entries(dimensionTotals).map(([key, { sum, count }]) => ({
      key,
      avg: count > 0 ? Number((sum / count).toFixed(2)) : 0,
      count,
    })).sort((a, b) => a.avg - b.avg); // weakest first so the merchant sees what to improve

    res.json({
      currentAvg: Number((current?.avg ?? 0).toFixed(2)),
      priorAvg: Number((prior?.avg ?? 0).toFixed(2)),
      callsScored: Number(current?.count ?? 0),
      flaggedCount: Number(current?.flagged ?? 0),
      dimensionBreakdown,
      windowDays: 30,
    });
  } catch (error) {
    console.error('Error fetching call quality summary:', error);
    res.status(500).json({ error: 'Failed to fetch call quality summary' });
  }
});

/** GET /api/call-quality/business/trend — last 6 months of monthly averages */
router.get("/call-quality/business/trend", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const businessId = getBusinessId(req);
    if (!businessId) return res.status(401).json({ error: "Not authenticated" });

    const { db } = await import('../db');
    const { callQualityScores } = await import('@shared/schema');
    const { eq, sql } = await import('drizzle-orm');

    const rows = await db.select({
      month: sql<string>`TO_CHAR(${callQualityScores.scoredAt}, 'YYYY-MM')`,
      avg: sql<number>`AVG(${callQualityScores.totalScore})`,
      count: sql<number>`COUNT(*)`,
    })
      .from(callQualityScores)
      .where(eq(callQualityScores.businessId, businessId))
      .groupBy(sql`TO_CHAR(${callQualityScores.scoredAt}, 'YYYY-MM')`)
      .orderBy(sql`TO_CHAR(${callQualityScores.scoredAt}, 'YYYY-MM') DESC`)
      .limit(6);

    res.json({
      months: rows.reverse().map(r => ({
        month: r.month,
        avg: Number(Number(r.avg).toFixed(2)),
        count: Number(r.count),
      })),
    });
  } catch (error) {
    console.error('Error fetching call quality trend:', error);
    res.status(500).json({ error: 'Failed to fetch call quality trend' });
  }
});

/** GET /api/call-quality/business/flagged — flagged calls awaiting review */
router.get("/call-quality/business/flagged", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const businessId = getBusinessId(req);
    if (!businessId) return res.status(401).json({ error: "Not authenticated" });

    const { db } = await import('../db');
    const { callQualityScores } = await import('@shared/schema');
    const { and, eq, desc } = await import('drizzle-orm');

    const flagged = await db.select()
      .from(callQualityScores)
      .where(and(
        eq(callQualityScores.businessId, businessId),
        eq(callQualityScores.flagged, true),
        eq(callQualityScores.flagDismissed, false),
      ))
      .orderBy(desc(callQualityScores.scoredAt))
      .limit(50);

    res.json({ flagged });
  } catch (error) {
    console.error('Error fetching flagged calls:', error);
    res.status(500).json({ error: 'Failed to fetch flagged calls' });
  }
});

/** POST /api/call-quality/:callLogId/dismiss-flag — merchant marks "I reviewed" */
router.post("/call-quality/:callLogId/dismiss-flag", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const callLogId = parseInt(req.params.callLogId, 10);
    if (isNaN(callLogId)) return res.status(400).json({ error: "Invalid callLogId" });

    const businessId = getBusinessId(req);
    if (!businessId) return res.status(401).json({ error: "Not authenticated" });

    const { dismissQualityFlag } = await import('../services/callQualityService');
    const ok = await dismissQualityFlag(callLogId, businessId);
    if (!ok) return res.status(404).json({ error: "Score not found or access denied" });

    res.json({ success: true });
  } catch (error) {
    console.error('Error dismissing quality flag:', error);
    res.status(500).json({ error: 'Failed to dismiss flag' });
  }
});

export default router;
