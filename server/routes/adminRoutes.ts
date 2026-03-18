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
import { agentActivityLog, businesses, blogPosts, notificationLog, users } from "../../shared/schema";
import { eq, sql, desc, and, gte, lte, inArray, isNull, or, ilike } from "drizzle-orm";
import { hashPassword } from "../auth";

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
    // Step 1: Try the full admin service (enriched data with counts/owners)
    const businesses = await adminService.getAdminBusinesses();
    res.json({ businesses });
  } catch (error: any) {
    console.error("[Admin] Error fetching businesses via adminService:", error);
    // Step 2: Fallback — return raw businesses from DB without enrichment
    try {
      const rawBusinesses = await db.select().from(businesses);
      console.log(`[Admin] Fallback: returning ${rawBusinesses.length} raw businesses`);
      res.json({
        businesses: rawBusinesses.map(b => ({
          id: b.id,
          name: b.name,
          email: b.email,
          phone: b.phone,
          type: b.type,
          industry: b.industry,
          subscriptionStatus: b.subscriptionStatus,
          twilioPhoneNumber: b.twilioPhoneNumber,
          vapiAssistantId: b.vapiAssistantId,
          createdAt: b.createdAt,
          ownerUsername: null,
          ownerEmail: null,
          callCount: 0,
          appointmentCount: 0,
        })),
        _fallback: true,
        _error: error?.message,
      });
    } catch (fallbackError: any) {
      console.error("[Admin] Fallback also failed:", fallbackError);
      res.status(500).json({ error: `Failed to fetch businesses: ${error?.message}. Fallback: ${fallbackError?.message}` });
    }
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
    // Use direct DB query — no encryption/decryption needed for phone number listing
    const allBusinesses = await db.select({
      id: businesses.id,
      name: businesses.name,
      twilioPhoneNumber: businesses.twilioPhoneNumber,
      twilioPhoneNumberSid: businesses.twilioPhoneNumberSid,
      twilioDateProvisioned: businesses.twilioDateProvisioned,
    }).from(businesses);
    const phoneNumbers = allBusinesses.map(business => ({
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

/**
 * PATCH /api/admin/businesses/:id/subscription-status — Update a business's subscription status
 */
router.patch("/api/admin/businesses/:id/subscription-status", isAdmin, async (req: Request, res: Response) => {
  try {
    const businessId = parseInt(req.params.id);
    const { status } = req.body;
    const validStatuses = ['active', 'trialing', 'inactive', 'past_due', 'canceled', 'canceling'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    const [updated] = await db.update(businesses)
      .set({ subscriptionStatus: status, updatedAt: new Date() })
      .where(eq(businesses.id, businessId))
      .returning();

    if (!updated) {
      return res.status(404).json({ error: 'Business not found' });
    }

    res.json({ success: true, business: { id: updated.id, name: updated.name, subscriptionStatus: updated.subscriptionStatus } });
  } catch (error: any) {
    console.error("[Admin] Error updating subscription status:", error);
    res.status(500).json({ error: "Failed to update subscription status", details: error.message });
  }
});

/**
 * POST /api/admin/businesses/bulk-subscription-status — Bulk update subscription status
 */
router.post("/api/admin/businesses/bulk-subscription-status", isAdmin, async (req: Request, res: Response) => {
  try {
    const { status, businessIds } = req.body;
    const validStatuses = ['active', 'trialing', 'inactive', 'past_due', 'canceled', 'canceling'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    if (!businessIds || !Array.isArray(businessIds) || businessIds.length === 0) {
      return res.status(400).json({ error: 'businessIds must be a non-empty array' });
    }

    const result = await db.update(businesses)
      .set({ subscriptionStatus: status, updatedAt: new Date() })
      .where(inArray(businesses.id, businessIds))
      .returning();

    res.json({
      success: true,
      updated: result.length,
      businesses: result.map(b => ({ id: b.id, name: b.name, subscriptionStatus: b.subscriptionStatus }))
    });
  } catch (error: any) {
    console.error("[Admin] Error bulk updating subscription status:", error);
    res.status(500).json({ error: "Failed to bulk update subscription status", details: error.message });
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
  {
    id: 'coordinator',
    name: 'Agent Coordinator',
    description: 'Connects all agents — routes churn alerts to interventions, hot leads to nudges, critical health to escalation',
    schedule: 'Triggered by other agents',
    category: 'operations',
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
      case 'coordinator': {
        // Coordinator doesn't have a traditional "run" cycle — it's triggered by other agents.
        // Manual run generates a platform status report + recent cross-agent activity summary.
        const { getPlatformStats, getContentFacts } = await import("../services/platformAgents/agentCoordinator");
        const { logAgentAction } = await import("../services/agentActivityService");

        const stats = await getPlatformStats();
        const facts = await getContentFacts();

        // Pull recent coordinator actions (last 7 days)
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const recentActions = await db.select({
          action: agentActivityLog.action,
          details: agentActivityLog.details,
          createdAt: agentActivityLog.createdAt,
        }).from(agentActivityLog)
          .where(and(
            eq(agentActivityLog.agentType, 'platform:coordinator'),
            gte(agentActivityLog.createdAt, sevenDaysAgo)
          ))
          .orderBy(desc(agentActivityLog.createdAt))
          .limit(20);

        const summary = {
          platformStats: stats,
          contentFacts: facts,
          recentCoordinatorActions: recentActions.length,
          recentActions: recentActions.map(a => ({
            action: a.action,
            details: a.details,
            timestamp: a.createdAt,
          })),
        };

        await logAgentAction({
          businessId: 0,
          agentType: 'platform:coordinator',
          action: 'manual_status_report',
          details: {
            totalBusinesses: stats.totalBusinesses,
            activeBusinesses: stats.activeBusinesses,
            totalCustomers: stats.totalCustomers,
            recentActionsCount: recentActions.length,
            contentFactsCount: facts.length,
          },
        });

        result = summary;
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

// ===========================================
// Platform Messages (notifications sent to business owners)
// ===========================================

/**
 * GET /api/admin/platform-messages — All platform-to-business-owner notifications
 * (drip campaigns, trial warnings, onboarding nudges, grace period, etc.)
 * These are notification_log entries WITHOUT a customerId — sent to owners, not customers.
 */
router.get("/api/admin/platform-messages", isAdmin, async (req: Request, res: Response) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);

    // Get all platform-level notifications (no customerId = sent to business owner, not a customer)
    const logs = await storage.getAllPlatformNotificationLogs(limit);

    // Enrich with business names
    const businessIds = Array.from(new Set(logs.map(l => l.businessId)));
    const businessMap = new Map<number, string>();
    if (businessIds.length > 0) {
      const bizRows = await db
        .select({ id: businesses.id, name: businesses.name })
        .from(businesses)
        .where(inArray(businesses.id, businessIds));
      for (const b of bizRows) {
        businessMap.set(b.id, b.name);
      }
    }

    const enriched = logs.map(log => ({
      ...log,
      businessName: businessMap.get(log.businessId) || `Business #${log.businessId}`,
    }));

    res.json(enriched);
  } catch (error: any) {
    console.error("[Admin] Error fetching platform messages:", error);
    res.status(500).json({ error: "Failed to fetch platform messages", details: error.message });
  }
});

// ===========================================
// Blog Content Management Routes
// ===========================================

/**
 * GET /api/admin/blog-posts — List all blog posts with optional status filter
 */
router.get("/api/admin/blog-posts", isAdmin, async (req: Request, res: Response) => {
  try {
    const status = req.query.status as string | undefined;
    const queryLimit = Math.min(parseInt(req.query.limit as string) || 50, 200);

    let posts;
    if (status && ['draft', 'approved', 'published', 'archived'].includes(status)) {
      posts = await db.select().from(blogPosts).where(eq(blogPosts.status, status)).orderBy(desc(blogPosts.createdAt)).limit(queryLimit);
    } else {
      posts = await db.select().from(blogPosts).orderBy(desc(blogPosts.createdAt)).limit(queryLimit);
    }

    res.json({ posts });
  } catch (error: any) {
    console.error("[Admin] Error fetching blog posts:", error);
    res.status(500).json({ error: "Failed to fetch blog posts", details: error.message });
  }
});

/**
 * GET /api/admin/blog-posts/:id — Get a single blog post
 */
router.get("/api/admin/blog-posts/:id", isAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid blog post ID" });

    const [post] = await db.select().from(blogPosts).where(eq(blogPosts.id, id));
    if (!post) return res.status(404).json({ error: "Blog post not found" });

    res.json(post);
  } catch (error: any) {
    console.error("[Admin] Error fetching blog post:", error);
    res.status(500).json({ error: "Failed to fetch blog post", details: error.message });
  }
});

/**
 * PUT /api/admin/blog-posts/:id — Update a blog post (edit content, approve, publish)
 */
router.put("/api/admin/blog-posts/:id", isAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid blog post ID" });

    const { title, editedBody, excerpt, metaTitle, metaDescription, status } = req.body;

    const updates: Record<string, any> = { updatedAt: new Date() };
    if (title !== undefined) updates.title = title;
    if (editedBody !== undefined) updates.editedBody = editedBody;
    if (excerpt !== undefined) updates.excerpt = excerpt;
    if (metaTitle !== undefined) updates.metaTitle = metaTitle;
    if (metaDescription !== undefined) updates.metaDescription = metaDescription;
    if (status !== undefined && ['draft', 'approved', 'published', 'archived'].includes(status)) {
      updates.status = status;
      if (status === 'published') updates.publishedAt = new Date();
    }

    const [updated] = await db
      .update(blogPosts)
      .set(updates)
      .where(eq(blogPosts.id, id))
      .returning();

    if (!updated) return res.status(404).json({ error: "Blog post not found" });

    res.json(updated);
  } catch (error: any) {
    console.error("[Admin] Error updating blog post:", error);
    res.status(500).json({ error: "Failed to update blog post", details: error.message });
  }
});

/**
 * POST /api/admin/blog-posts/:id/approve — Approve a draft blog post
 */
router.post("/api/admin/blog-posts/:id/approve", isAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid blog post ID" });

    const [updated] = await db
      .update(blogPosts)
      .set({ status: 'approved', updatedAt: new Date() })
      .where(eq(blogPosts.id, id))
      .returning();

    if (!updated) return res.status(404).json({ error: "Blog post not found" });

    res.json(updated);
  } catch (error: any) {
    console.error("[Admin] Error approving blog post:", error);
    res.status(500).json({ error: "Failed to approve blog post", details: error.message });
  }
});

/**
 * POST /api/admin/blog-posts/:id/publish — Publish a blog post
 */
router.post("/api/admin/blog-posts/:id/publish", isAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid blog post ID" });

    const [updated] = await db
      .update(blogPosts)
      .set({ status: 'published', publishedAt: new Date(), updatedAt: new Date() })
      .where(eq(blogPosts.id, id))
      .returning();

    if (!updated) return res.status(404).json({ error: "Blog post not found" });

    res.json(updated);
  } catch (error: any) {
    console.error("[Admin] Error publishing blog post:", error);
    res.status(500).json({ error: "Failed to publish blog post", details: error.message });
  }
});

/**
 * DELETE /api/admin/blog-posts/:id — Delete a blog post
 */
router.delete("/api/admin/blog-posts/:id", isAdmin, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid blog post ID" });

    const [deleted] = await db
      .delete(blogPosts)
      .where(eq(blogPosts.id, id))
      .returning();

    if (!deleted) return res.status(404).json({ error: "Blog post not found" });

    res.json({ success: true });
  } catch (error: any) {
    console.error("[Admin] Error deleting blog post:", error);
    res.status(500).json({ error: "Failed to delete blog post", details: error.message });
  }
});

/**
 * POST /api/admin/blog-posts/generate — Manually trigger the Content SEO agent
 */
router.post("/api/admin/blog-posts/generate", isAdmin, async (req: Request, res: Response) => {
  try {
    const { runContentSeoAgent } = await import("../services/platformAgents/contentSeoAgent");
    const result = await runContentSeoAgent();
    res.json({ success: true, ...result });
  } catch (error: any) {
    console.error("[Admin] Error running content SEO agent:", error);
    res.status(500).json({ error: "Failed to generate content", details: error.message });
  }
});

// ============================================================
// BUSINESS MANAGEMENT — Provision, deprovision, subscription control
// ============================================================

/**
 * POST /api/admin/businesses/:id/provision — Re-provision a business (Twilio + Vapi)
 */
router.post("/api/admin/businesses/:id/provision", isAdmin, async (req: Request, res: Response) => {
  try {
    const businessId = parseInt(req.params.id);
    if (isNaN(businessId)) return res.status(400).json({ error: "Invalid business ID" });

    const business = await storage.getBusiness(businessId);
    if (!business) return res.status(404).json({ error: "Business not found" });

    console.log(`[Admin] Re-provisioning business ${businessId} (${business.name})`);
    const { provisionBusiness } = await import("../services/businessProvisioningService");
    const result = await provisionBusiness(businessId);

    // Re-enable receptionist and restore subscription status if needed
    if (result.success) {
      const updates: any = { receptionistEnabled: true };
      if (['expired', 'grace_period', 'suspended'].includes(business.subscriptionStatus || '')) {
        updates.subscriptionStatus = 'trialing';
      }
      await storage.updateBusiness(businessId, updates);
    }

    res.json({ success: result.success, error: result.error, business: business.name });
  } catch (error: any) {
    console.error("[Admin] Provision error:", error);
    res.status(500).json({ error: "Failed to provision", details: error.message });
  }
});

/**
 * POST /api/admin/businesses/:id/deprovision — Deprovision a business (release Twilio + delete Vapi)
 */
router.post("/api/admin/businesses/:id/deprovision", isAdmin, async (req: Request, res: Response) => {
  try {
    const businessId = parseInt(req.params.id);
    if (isNaN(businessId)) return res.status(400).json({ error: "Invalid business ID" });

    const business = await storage.getBusiness(businessId);
    if (!business) return res.status(404).json({ error: "Business not found" });

    console.log(`[Admin] Deprovisioning business ${businessId} (${business.name})`);
    const { deprovisionBusiness } = await import("../services/businessProvisioningService");
    await deprovisionBusiness(businessId);

    await storage.updateBusiness(businessId, {
      subscriptionStatus: 'canceled',
      receptionistEnabled: false,
    } as any);

    res.json({ success: true, business: business.name });
  } catch (error: any) {
    console.error("[Admin] Deprovision error:", error);
    res.status(500).json({ error: "Failed to deprovision", details: error.message });
  }
});

/**
 * GET /api/admin/businesses/:id/detail — Full business detail view
 */
router.get("/api/admin/businesses/:id/detail", isAdmin, async (req: Request, res: Response) => {
  try {
    const businessId = parseInt(req.params.id);
    if (isNaN(businessId)) return res.status(400).json({ error: "Invalid business ID" });

    const business = await storage.getBusiness(businessId);
    if (!business) return res.status(404).json({ error: "Business not found" });

    // Fetch related data in parallel
    const [services, businessHours, staffMembers, receptionistConfig, customers, callLogs, invoices] = await Promise.all([
      storage.getServices(businessId),
      storage.getBusinessHours(businessId),
      storage.getStaff(businessId),
      storage.getReceptionistConfig(businessId),
      storage.getCustomers(businessId),
      storage.getCallLogs(businessId, {}),
      storage.getInvoices(businessId),
    ]);

    // Owner info
    const owner = await db.select().from(users).where(eq(users.businessId, businessId)).limit(1);

    res.json({
      business,
      owner: owner[0] ? { id: owner[0].id, username: owner[0].username, email: owner[0].email, lastLogin: owner[0].lastLogin } : null,
      services: services.length,
      servicesList: services.map(s => ({ name: s.name, price: s.price, duration: s.duration })),
      businessHours: businessHours.map(h => ({ day: h.day, open: h.open, close: h.close, isClosed: h.isClosed })),
      staffCount: staffMembers.length,
      hasReceptionist: !!receptionistConfig,
      receptionistConfig: receptionistConfig ? {
        greeting: receptionistConfig.greeting,
        voiceId: receptionistConfig.voiceId,
        assistantName: receptionistConfig.assistantName,
        callRecordingEnabled: receptionistConfig.callRecordingEnabled,
        voicemailEnabled: receptionistConfig.voicemailEnabled,
      } : null,
      customerCount: customers.length,
      callCount: callLogs.length,
      invoiceCount: invoices.length,
      totalRevenue: invoices.filter(i => i.status === 'paid').reduce((sum, i) => sum + (i.total || 0), 0),
    });
  } catch (error: any) {
    console.error("[Admin] Business detail error:", error);
    res.status(500).json({ error: "Failed to fetch business detail", details: error.message });
  }
});

// ============================================================
// USER MANAGEMENT — Disable, enable, reset password, change role
// ============================================================

/**
 * POST /api/admin/users/:id/disable — Disable a user account
 */
router.post("/api/admin/users/:id/disable", isAdmin, async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params.id);
    if (isNaN(userId)) return res.status(400).json({ error: "Invalid user ID" });

    // Don't let admin disable themselves
    if (req.user && (req.user as any).id === userId) {
      return res.status(400).json({ error: "Cannot disable your own account" });
    }

    await storage.updateUser(userId, { active: false } as any);
    console.log(`[Admin] Disabled user ${userId}`);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to disable user", details: error.message });
  }
});

/**
 * POST /api/admin/users/:id/enable — Re-enable a disabled user account
 */
router.post("/api/admin/users/:id/enable", isAdmin, async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params.id);
    if (isNaN(userId)) return res.status(400).json({ error: "Invalid user ID" });

    await storage.updateUser(userId, { active: true } as any);
    console.log(`[Admin] Enabled user ${userId}`);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to enable user", details: error.message });
  }
});

/**
 * POST /api/admin/users/:id/reset-password — Reset a user's password
 */
router.post("/api/admin/users/:id/reset-password", isAdmin, async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params.id);
    if (isNaN(userId)) return res.status(400).json({ error: "Invalid user ID" });

    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters" });
    }

    const hashed = await hashPassword(newPassword);
    await storage.updateUser(userId, { password: hashed } as any);
    console.log(`[Admin] Reset password for user ${userId}`);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to reset password", details: error.message });
  }
});

/**
 * PATCH /api/admin/users/:id/role — Change a user's role
 */
router.patch("/api/admin/users/:id/role", isAdmin, async (req: Request, res: Response) => {
  try {
    const userId = parseInt(req.params.id);
    if (isNaN(userId)) return res.status(400).json({ error: "Invalid user ID" });

    const { role } = req.body;
    if (!['user', 'staff', 'admin'].includes(role)) {
      return res.status(400).json({ error: "Role must be 'user', 'staff', or 'admin'" });
    }

    // Don't let admin remove their own admin role
    if (req.user && (req.user as any).id === userId && role !== 'admin') {
      return res.status(400).json({ error: "Cannot change your own role" });
    }

    await storage.updateUser(userId, { role } as any);
    console.log(`[Admin] Changed user ${userId} role to ${role}`);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: "Failed to change role", details: error.message });
  }
});

// ============================================================
// MONITORING — Failed payments, provisioning failures, alerts
// ============================================================

/**
 * GET /api/admin/alerts — Active platform alerts requiring attention
 */
router.get("/api/admin/alerts", isAdmin, async (req: Request, res: Response) => {
  try {
    // Failed payments (past_due for 3+ days)
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    const failedPayments = await db.select({
      id: businesses.id,
      name: businesses.name,
      status: businesses.subscriptionStatus,
      phone: businesses.twilioPhoneNumber,
    })
      .from(businesses)
      .where(or(
        eq(businesses.subscriptionStatus, 'past_due'),
        eq(businesses.subscriptionStatus, 'payment_failed')
      ));

    // Grace period businesses (trial expired, AI disabled)
    const gracePeriod = await db.select({
      id: businesses.id,
      name: businesses.name,
      phone: businesses.twilioPhoneNumber,
      trialEndsAt: businesses.trialEndsAt,
    })
      .from(businesses)
      .where(eq(businesses.subscriptionStatus, 'grace_period'));

    // Businesses with no phone number (provisioning may have failed)
    const noPhone = await db.select({
      id: businesses.id,
      name: businesses.name,
      status: businesses.subscriptionStatus,
      createdAt: businesses.createdAt,
    })
      .from(businesses)
      .where(and(
        isNull(businesses.twilioPhoneNumber),
        or(
          eq(businesses.subscriptionStatus, 'active'),
          eq(businesses.subscriptionStatus, 'trialing')
        )
      ));

    // Failed notifications (last 24h)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const failedNotifications = await db.select({
      count: sql<number>`count(*)`,
    })
      .from(notificationLog)
      .where(and(
        eq(notificationLog.status, 'failed'),
        gte(notificationLog.sentAt, oneDayAgo)
      ));

    const alerts = [];

    for (const biz of failedPayments) {
      alerts.push({
        type: 'payment_failed',
        severity: 'high',
        businessId: biz.id,
        businessName: biz.name,
        message: `Payment ${biz.status === 'past_due' ? 'past due' : 'failed'} — may need manual intervention`,
        action: 'Check Stripe dashboard or contact business owner',
      });
    }

    for (const biz of gracePeriod) {
      alerts.push({
        type: 'grace_period',
        severity: 'medium',
        businessId: biz.id,
        businessName: biz.name,
        message: `Trial expired — AI disabled, phone number retained`,
        action: 'Business needs to subscribe to restore AI',
      });
    }

    for (const biz of noPhone) {
      alerts.push({
        type: 'provisioning_failed',
        severity: 'high',
        businessId: biz.id,
        businessName: biz.name,
        message: `Active/trialing business has no phone number — provisioning may have failed`,
        action: 'Re-provision from business controls',
      });
    }

    if (failedNotifications[0]?.count > 0) {
      alerts.push({
        type: 'notification_failures',
        severity: 'low',
        message: `${failedNotifications[0].count} failed notifications in the last 24 hours`,
        action: 'Check Messages tab for details',
      });
    }

    res.json({
      alertCount: alerts.length,
      alerts: alerts.sort((a, b) => {
        const sev = { high: 0, medium: 1, low: 2 };
        return (sev[a.severity as keyof typeof sev] || 2) - (sev[b.severity as keyof typeof sev] || 2);
      }),
    });
  } catch (error: any) {
    console.error("[Admin] Alerts error:", error);
    res.status(500).json({ error: "Failed to fetch alerts", details: error.message });
  }
});

export default router;
