/**
 * Admin Routes
 *
 * Platform-wide admin endpoints for the owner dashboard.
 * All routes are protected by the isAdmin middleware.
 */

import { Router, Request, Response } from "express";
import { isAdmin } from "../middleware/auth";
import * as adminService from "../services/adminService";
import { storage } from "../storage";
import { db } from "../db";
import { agentActivityLog } from "../../shared/schema";
import { eq, sql, desc, and, gte } from "drizzle-orm";

const router = Router();

/**
 * GET /api/admin/stats — Platform-wide statistics
 */
router.get("/api/admin/stats", isAdmin, async (req: Request, res: Response) => {
  try {
    const stats = await adminService.getPlatformStats();
    res.json(stats);
  } catch (error: any) {
    console.error("[Admin] Error fetching platform stats:", error);
    res.status(500).json({ error: "Failed to fetch platform stats", details: error.message });
  }
});

/**
 * GET /api/admin/businesses — All businesses with owner info and activity counts
 */
router.get("/api/admin/businesses", isAdmin, async (req: Request, res: Response) => {
  try {
    const businesses = await adminService.getAdminBusinesses();
    res.json({ businesses });
  } catch (error: any) {
    console.error("[Admin] Error fetching businesses:", error);
    res.status(500).json({ error: "Failed to fetch businesses", details: error.message });
  }
});

/**
 * GET /api/admin/users — All users with business names
 */
router.get("/api/admin/users", isAdmin, async (req: Request, res: Response) => {
  try {
    const users = await adminService.getAdminUsers();
    res.json({ users });
  } catch (error: any) {
    console.error("[Admin] Error fetching users:", error);
    res.status(500).json({ error: "Failed to fetch users", details: error.message });
  }
});

/**
 * GET /api/admin/revenue — Revenue and subscription data
 */
router.get("/api/admin/revenue", isAdmin, async (req: Request, res: Response) => {
  try {
    const revenue = await adminService.getRevenueData();
    res.json(revenue);
  } catch (error: any) {
    console.error("[Admin] Error fetching revenue data:", error);
    res.status(500).json({ error: "Failed to fetch revenue data", details: error.message });
  }
});

/**
 * GET /api/admin/system — System health checks
 */
router.get("/api/admin/system", isAdmin, async (req: Request, res: Response) => {
  try {
    const health = await adminService.getSystemHealth();
    res.json(health);
  } catch (error: any) {
    console.error("[Admin] Error fetching system health:", error);
    res.status(500).json({ error: "Failed to fetch system health", details: error.message });
  }
});

/**
 * GET /api/admin/activity — Recent platform activity feed
 */
router.get("/api/admin/activity", isAdmin, async (req: Request, res: Response) => {
  try {
    const activity = await adminService.getRecentActivity();
    res.json({ activity });
  } catch (error: any) {
    console.error("[Admin] Error fetching activity:", error);
    res.status(500).json({ error: "Failed to fetch activity", details: error.message });
  }
});

/**
 * GET /api/admin/costs — Revenue vs costs breakdown (P&L)
 */
router.get("/api/admin/costs", isAdmin, async (req: Request, res: Response) => {
  try {
    const costs = await adminService.getCostsData();
    res.json(costs);
  } catch (error: any) {
    console.error("[Admin] Error fetching costs data:", error);
    res.status(500).json({ error: "Failed to fetch costs data", details: error.message });
  }
});

/**
 * GET /api/admin/phone-numbers — Phone number inventory across all businesses
 */
router.get("/api/admin/phone-numbers", isAdmin, async (req: Request, res: Response) => {
  try {
    const businesses = await storage.getAllBusinesses();
    const phoneNumbers = businesses.map(business => ({
      businessId: business.id,
      businessName: business.name,
      phoneNumber: business.twilioPhoneNumber,
      phoneNumberSid: business.twilioPhoneNumberSid,
      dateProvisioned: business.twilioDateProvisioned,
      status: business.twilioPhoneNumber ? "active" : "not provisioned",
    }));
    res.json({ phoneNumbers });
  } catch (error: any) {
    console.error("[Admin] Error fetching phone numbers:", error);
    res.status(500).json({ error: "Failed to fetch phone numbers", details: error.message });
  }
});

/**
 * POST /api/admin/process-overage-billing — Manually trigger overage billing check
 */
router.post("/api/admin/process-overage-billing", isAdmin, async (req: Request, res: Response) => {
  try {
    const { processAllOverageBilling } = await import("../services/overageBillingService.js");
    const results = await processAllOverageBilling();
    const invoiced = results.filter(r => r.status === 'invoiced').length;
    const noOverage = results.filter(r => r.status === 'no_overage').length;
    const skipped = results.filter(r => r.status === 'skipped').length;
    const failed = results.filter(r => r.status === 'failed').length;
    res.json({
      summary: { invoiced, noOverage, skipped, failed, total: results.length },
      results,
    });
  } catch (error: any) {
    console.error("[Admin] Error processing overage billing:", error);
    res.status(500).json({ error: "Failed to process overage billing", details: error.message });
  }
});

// ══════════════════════════════════════════════════════════════════════
// Platform AI Agents endpoints
// ══════════════════════════════════════════════════════════════════════

/** All platform agent types */
const PLATFORM_AGENTS = [
  {
    id: 'churn_prediction',
    name: 'Churn Prediction',
    description: 'Scores active businesses on churn risk based on engagement signals',
    schedule: 'Every 24 hours',
    category: 'retention',
  },
  {
    id: 'onboarding_coach',
    name: 'Onboarding Coach',
    description: 'Monitors new signups and sends setup nudge emails when they stall',
    schedule: 'Every 6 hours',
    category: 'growth',
  },
  {
    id: 'lead_scoring',
    name: 'Lead Scoring',
    description: 'Scores unsubscribed signups on conversion likelihood',
    schedule: 'Every 12 hours',
    category: 'growth',
  },
  {
    id: 'health_score',
    name: 'Health Score',
    description: 'Assigns a composite health score (0-100) to every active business',
    schedule: 'Every 24 hours',
    category: 'retention',
  },
  {
    id: 'support_triage',
    name: 'Support Triage',
    description: 'Scans for provisioning failures, call errors, and payment issues',
    schedule: 'Every 6 hours',
    category: 'operations',
  },
  {
    id: 'revenue_optimization',
    name: 'Revenue Optimization',
    description: 'Identifies upgrade candidates, downgrade risks, and expansion opportunities',
    schedule: 'Every 24 hours',
    category: 'revenue',
  },
  {
    id: 'content_seo',
    name: 'Content & SEO',
    description: 'Generates blog and social media content drafts targeting top industries',
    schedule: 'Every 7 days',
    category: 'marketing',
  },
  {
    id: 'testimonial',
    name: 'Review & Testimonial',
    description: 'Identifies successful businesses for testimonial/case study outreach',
    schedule: 'Every 7 days',
    category: 'marketing',
  },
  {
    id: 'competitive_intel',
    name: 'Competitive Intelligence',
    description: 'Analyzes cancellation patterns, feature gaps, and pricing insights',
    schedule: 'Every 7 days',
    category: 'strategy',
  },
  {
    id: 'social_media',
    name: 'Social Media',
    description: 'Generates platform-specific marketing content drafts and publishes approved posts',
    schedule: 'Every 24 hours',
    category: 'marketing',
  },
];

/**
 * GET /api/admin/platform-agents — List all platform agents with their latest run info
 */
router.get("/api/admin/platform-agents", isAdmin, async (req: Request, res: Response) => {
  try {
    // Get latest run for each agent type
    const agents = await Promise.all(
      PLATFORM_AGENTS.map(async (agent) => {
        const agentType = `platform:${agent.id}`;
        const [latestRun] = await db
          .select({
            createdAt: agentActivityLog.createdAt,
            action: agentActivityLog.action,
            details: agentActivityLog.details,
          })
          .from(agentActivityLog)
          .where(eq(agentActivityLog.agentType, agentType))
          .orderBy(desc(agentActivityLog.createdAt))
          .limit(1);

        // Count recent actions (last 24h)
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const [countResult] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(agentActivityLog)
          .where(
            and(
              eq(agentActivityLog.agentType, agentType),
              gte(agentActivityLog.createdAt, oneDayAgo)
            )
          );

        // Count alerts (high-priority items)
        const [alertCount] = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(agentActivityLog)
          .where(
            and(
              eq(agentActivityLog.agentType, agentType),
              eq(agentActivityLog.action, 'alert_generated'),
              gte(agentActivityLog.createdAt, oneDayAgo)
            )
          );

        return {
          ...agent,
          agentType,
          lastRunAt: latestRun?.createdAt || null,
          lastAction: latestRun?.action || null,
          actionsLast24h: countResult?.count || 0,
          alertsLast24h: alertCount?.count || 0,
        };
      })
    );

    res.json({ agents });
  } catch (error: any) {
    console.error("[Admin] Error fetching platform agents:", error);
    res.status(500).json({ error: "Failed to fetch platform agents", details: error.message });
  }
});

/**
 * GET /api/admin/platform-agents/:agentId/activity — Activity log for a specific agent
 */
router.get("/api/admin/platform-agents/:agentId/activity", isAdmin, async (req: Request, res: Response) => {
  try {
    const agentType = `platform:${req.params.agentId}`;
    const limit = parseInt(req.query.limit as string) || 50;

    const logs = await db
      .select()
      .from(agentActivityLog)
      .where(eq(agentActivityLog.agentType, agentType))
      .orderBy(desc(agentActivityLog.createdAt))
      .limit(limit);

    res.json({ logs });
  } catch (error: any) {
    console.error("[Admin] Error fetching agent activity:", error);
    res.status(500).json({ error: "Failed to fetch agent activity", details: error.message });
  }
});

/**
 * GET /api/admin/platform-agents/:agentId/alerts — High-priority alerts from an agent
 */
router.get("/api/admin/platform-agents/:agentId/alerts", isAdmin, async (req: Request, res: Response) => {
  try {
    const agentType = `platform:${req.params.agentId}`;
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const alerts = await db
      .select()
      .from(agentActivityLog)
      .where(
        and(
          eq(agentActivityLog.agentType, agentType),
          eq(agentActivityLog.action, 'alert_generated'),
          gte(agentActivityLog.createdAt, sevenDaysAgo)
        )
      )
      .orderBy(desc(agentActivityLog.createdAt))
      .limit(100);

    res.json({ alerts });
  } catch (error: any) {
    console.error("[Admin] Error fetching agent alerts:", error);
    res.status(500).json({ error: "Failed to fetch agent alerts", details: error.message });
  }
});

/**
 * POST /api/admin/platform-agents/:agentId/run — Manually trigger an agent run
 */
router.post("/api/admin/platform-agents/:agentId/run", isAdmin, async (req: Request, res: Response) => {
  try {
    const agentId = req.params.agentId;
    let result: any;

    switch (agentId) {
      case 'churn_prediction': {
        const { runChurnPrediction } = await import("../services/platformAgents/churnPredictionAgent");
        result = await runChurnPrediction();
        break;
      }
      case 'onboarding_coach': {
        const { runOnboardingCoach } = await import("../services/platformAgents/onboardingCoachAgent");
        result = await runOnboardingCoach();
        break;
      }
      case 'lead_scoring': {
        const { runLeadScoring } = await import("../services/platformAgents/leadScoringAgent");
        result = await runLeadScoring();
        break;
      }
      case 'health_score': {
        const { runHealthScoring } = await import("../services/platformAgents/healthScoreAgent");
        result = await runHealthScoring();
        break;
      }
      case 'support_triage': {
        const { runSupportTriage } = await import("../services/platformAgents/supportTriageAgent");
        result = await runSupportTriage();
        break;
      }
      case 'revenue_optimization': {
        const { runRevenueOptimization } = await import("../services/platformAgents/revenueOptimizationAgent");
        result = await runRevenueOptimization();
        break;
      }
      case 'content_seo': {
        const { runContentSeoAgent } = await import("../services/platformAgents/contentSeoAgent");
        result = await runContentSeoAgent();
        break;
      }
      case 'testimonial': {
        const { runTestimonialAgent } = await import("../services/platformAgents/testimonialAgent");
        result = await runTestimonialAgent();
        break;
      }
      case 'competitive_intel': {
        const { runCompetitiveIntelAgent } = await import("../services/platformAgents/competitiveIntelAgent");
        result = await runCompetitiveIntelAgent();
        break;
      }
      case 'social_media': {
        const { runSocialMediaAgent } = await import("../services/platformAgents/socialMediaAgent");
        result = await runSocialMediaAgent();
        break;
      }
      default:
        return res.status(404).json({ error: `Unknown agent: ${agentId}` });
    }

    res.json({ success: true, agentId, result });
  } catch (error: any) {
    console.error(`[Admin] Error running agent ${req.params.agentId}:`, error);
    res.status(500).json({ error: `Failed to run agent ${req.params.agentId}`, details: error.message });
  }
});

/**
 * GET /api/admin/platform-agents/summary — Aggregated summary across all agents
 */
router.get("/api/admin/platform-agents-summary", isAdmin, async (req: Request, res: Response) => {
  try {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // Total actions last 24h across all platform agents
    const [totalActions] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(agentActivityLog)
      .where(
        and(
          sql`${agentActivityLog.agentType} LIKE 'platform:%'`,
          gte(agentActivityLog.createdAt, oneDayAgo)
        )
      );

    // Total alerts last 7d
    const [totalAlerts] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(agentActivityLog)
      .where(
        and(
          sql`${agentActivityLog.agentType} LIKE 'platform:%'`,
          eq(agentActivityLog.action, 'alert_generated'),
          gte(agentActivityLog.createdAt, sevenDaysAgo)
        )
      );

    // Actions by agent type last 24h
    const actionsByAgent = await db
      .select({
        agentType: agentActivityLog.agentType,
        count: sql<number>`count(*)::int`,
      })
      .from(agentActivityLog)
      .where(
        and(
          sql`${agentActivityLog.agentType} LIKE 'platform:%'`,
          gte(agentActivityLog.createdAt, oneDayAgo)
        )
      )
      .groupBy(agentActivityLog.agentType);

    res.json({
      totalActionsLast24h: totalActions?.count || 0,
      totalAlertsLast7d: totalAlerts?.count || 0,
      actionsByAgent: actionsByAgent.map(a => ({
        agentType: a.agentType,
        count: a.count,
      })),
    });
  } catch (error: any) {
    console.error("[Admin] Error fetching agents summary:", error);
    res.status(500).json({ error: "Failed to fetch agents summary", details: error.message });
  }
});

export default router;
