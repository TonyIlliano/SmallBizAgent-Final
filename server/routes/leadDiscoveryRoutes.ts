/**
 * Lead Discovery Routes — admin-only.
 *
 * Endpoints:
 *   POST  /api/admin/leads/discover-run         — async start-then-poll scan
 *   GET   /api/admin/leads/discover-run/:runId  — poll run status
 *   GET   /api/admin/leads/runs                 — recent runs
 *   GET   /api/admin/leads                       — paginated lead list
 *   GET   /api/admin/leads/:id                   — single lead detail
 *   PATCH /api/admin/leads/:id                   — update status / notes
 *   POST  /api/admin/leads/:id/rescore           — re-run Claude scoring
 *   GET   /api/admin/leads/spend                 — current month spend
 *   GET   /api/admin/leads/rubric/active         — active rubric + provenance
 *   GET   /api/admin/leads/rubric/history        — last 10 rubric versions
 *   POST  /api/admin/leads/rubric/refine-now     — force-run refinement
 *
 * Kill switch: when env LEAD_DISCOVERY_ENABLED=false, all endpoints return 501.
 */

import { Router, Request, Response } from 'express';
import { isAdmin } from '../middleware/auth';
import { db } from '../db';
import { leads, leadDiscoveryRuns, leadScoringRubrics } from '../../shared/schema';
import { and, desc, eq, gte, ilike, sql } from 'drizzle-orm';
import {
  runScan,
  rescoreLead,
  getCurrentMonthSpend,
  MONTHLY_BUDGET_USD,
  REGION_PRESETS,
  VALID_INDUSTRIES,
} from '../services/leadDiscoveryService';

const router = Router();

// ─── Kill-switch middleware ─────────────────────────────────────────────────

function killSwitchGate(req: Request, res: Response, next: any) {
  if (process.env.LEAD_DISCOVERY_ENABLED === 'false') {
    return res.status(501).json({
      error: 'Lead Discovery is disabled (LEAD_DISCOVERY_ENABLED=false). Set the env var to re-enable.',
    });
  }
  next();
}

// ─── POST /api/admin/leads/discover-run ─────────────────────────────────────
// Async start-then-poll. Returns 202 with runId immediately.
router.post(
  '/admin/leads/discover-run',
  isAdmin,
  killSwitchGate,
  async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) return res.status(401).json({ error: 'Not authenticated' });

      const body = req.body ?? {};
      const industries = Array.isArray(body.industries) ? body.industries : [];
      const region = typeof body.region === 'string' ? body.region : 'maryland';
      const customZipCodes = Array.isArray(body.zipCodes) ? body.zipCodes.filter((z: any) => typeof z === 'string') : undefined;
      const dryRun = body.dryRun === true;

      // Validate industries
      const validIndustries = industries.filter((i: string) => VALID_INDUSTRIES.includes(i));
      if (validIndustries.length === 0) {
        return res.status(400).json({
          error: `industries must include at least one of: ${VALID_INDUSTRIES.join(', ')}`,
        });
      }

      // For dry-run, run synchronously — it's fast (no API calls)
      if (dryRun) {
        const result = await runScan({
          userId,
          region,
          industries: validIndustries,
          zipCodes: customZipCodes,
          dryRun: true,
        });
        return res.status(200).json(result);
      }

      // Insert the run row immediately so the frontend has an ID to poll
      const [created] = await db
        .insert(leadDiscoveryRuns)
        .values({
          invokedByUserId: userId,
          region,
          industries: validIndustries as any,
          zipCodes: (customZipCodes || REGION_PRESETS[region] || REGION_PRESETS.maryland) as any,
          status: 'running',
        })
        .returning();

      res.status(202).json({ runId: created.id, status: 'running' });

      // Fire-and-forget the actual scan
      (async () => {
        try {
          await runScan({
            userId,
            region,
            industries: validIndustries,
            zipCodes: customZipCodes,
            runId: created.id,
          });
        } catch (err) {
          console.error(`[LeadDiscoveryRoutes] Scan ${created.id} threw:`, err);
        }
      })();
    } catch (error: any) {
      console.error('[LeadDiscoveryRoutes] discover-run error:', error);
      res.status(500).json({ error: error?.message || 'Failed to start scan' });
    }
  },
);

// ─── GET /api/admin/leads/discover-run/:runId ───────────────────────────────
router.get('/admin/leads/discover-run/:runId', isAdmin, killSwitchGate, async (req, res) => {
  try {
    const runId = parseInt(req.params.runId, 10);
    if (isNaN(runId)) return res.status(400).json({ error: 'Invalid runId' });

    const [run] = await db
      .select()
      .from(leadDiscoveryRuns)
      .where(eq(leadDiscoveryRuns.id, runId))
      .limit(1);
    if (!run) return res.status(404).json({ error: 'Run not found' });

    res.json(run);
  } catch (error: any) {
    console.error('[LeadDiscoveryRoutes] poll error:', error);
    res.status(500).json({ error: error?.message || 'Failed to fetch run' });
  }
});

// ─── GET /api/admin/leads/runs ──────────────────────────────────────────────
router.get('/admin/leads/runs', isAdmin, killSwitchGate, async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(leadDiscoveryRuns)
      .orderBy(desc(leadDiscoveryRuns.startedAt))
      .limit(20);
    res.json({ runs: rows });
  } catch (error: any) {
    console.error('[LeadDiscoveryRoutes] runs list error:', error);
    res.status(500).json({ error: error?.message || 'Failed to fetch runs' });
  }
});

// ─── GET /api/admin/leads/spend ─────────────────────────────────────────────
router.get('/admin/leads/spend', isAdmin, killSwitchGate, async (_req, res) => {
  try {
    const current = await getCurrentMonthSpend();
    res.json({
      currentMonthSpend: Number(current.toFixed(2)),
      monthlyBudget: MONTHLY_BUDGET_USD,
      remaining: Math.max(0, Number((MONTHLY_BUDGET_USD - current).toFixed(2))),
    });
  } catch (error: any) {
    console.error('[LeadDiscoveryRoutes] spend error:', error);
    res.status(500).json({ error: error?.message || 'Failed to fetch spend' });
  }
});

// ─── GET /api/admin/leads ───────────────────────────────────────────────────
router.get('/admin/leads', isAdmin, killSwitchGate, async (req, res) => {
  try {
    const page = Math.max(1, parseInt((req.query.page as string) || '1', 10));
    const limit = Math.min(100, Math.max(5, parseInt((req.query.limit as string) || '30', 10)));
    const status = (req.query.status as string) || undefined;
    const industry = (req.query.industry as string) || undefined;
    const minScore = req.query.minScore ? parseInt(req.query.minScore as string, 10) : undefined;
    const search = (req.query.search as string)?.trim() || undefined;

    const conditions: any[] = [];
    if (status && status !== 'all') conditions.push(eq(leads.status, status));
    if (industry && industry !== 'all') conditions.push(eq(leads.industry, industry));
    if (typeof minScore === 'number' && !isNaN(minScore)) {
      conditions.push(gte(leads.leadScore, minScore));
    }
    if (search) {
      conditions.push(ilike(leads.businessName, `%${search}%`));
    }
    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const offset = (page - 1) * limit;
    const rows = await db
      .select()
      .from(leads)
      .where(whereClause)
      .orderBy(desc(leads.leadScore), desc(leads.discoveredAt))
      .limit(limit)
      .offset(offset);

    const [countRow] = await db
      .select({ count: sql<number>`COUNT(*)::int` })
      .from(leads)
      .where(whereClause);

    res.json({
      leads: rows,
      total: countRow?.count ?? 0,
      page,
      limit,
    });
  } catch (error: any) {
    console.error('[LeadDiscoveryRoutes] list error:', error);
    res.status(500).json({ error: error?.message || 'Failed to fetch leads' });
  }
});

// ─── GET /api/admin/leads/:id ───────────────────────────────────────────────
router.get('/admin/leads/:id', isAdmin, killSwitchGate, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
    const [row] = await db.select().from(leads).where(eq(leads.id, id)).limit(1);
    if (!row) return res.status(404).json({ error: 'Lead not found' });
    res.json(row);
  } catch (error: any) {
    console.error('[LeadDiscoveryRoutes] get-one error:', error);
    res.status(500).json({ error: error?.message || 'Failed to fetch lead' });
  }
});

// ─── PATCH /api/admin/leads/:id ─────────────────────────────────────────────
router.patch('/admin/leads/:id', isAdmin, killSwitchGate, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

    const allowedStatuses = ['discovered', 'contacted', 'qualified', 'converted', 'dismissed'];
    const updateData: any = {};
    if (req.body?.status !== undefined) {
      if (!allowedStatuses.includes(req.body.status)) {
        return res.status(400).json({ error: `Invalid status. Allowed: ${allowedStatuses.join(', ')}` });
      }
      updateData.status = req.body.status;
      // Stamp contactedAt on first transition out of 'discovered'
      if (req.body.status !== 'discovered') {
        updateData.contactedAt = new Date();
      }
    }
    if (typeof req.body?.contactedNotes === 'string') {
      updateData.contactedNotes = req.body.contactedNotes.slice(0, 2000);
    }
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const [updated] = await db.update(leads).set(updateData).where(eq(leads.id, id)).returning();
    if (!updated) return res.status(404).json({ error: 'Lead not found' });
    res.json(updated);
  } catch (error: any) {
    console.error('[LeadDiscoveryRoutes] patch error:', error);
    res.status(500).json({ error: error?.message || 'Failed to update lead' });
  }
});

// ─── POST /api/admin/leads/:id/rescore ──────────────────────────────────────
router.post('/admin/leads/:id/rescore', isAdmin, killSwitchGate, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
    const updated = await rescoreLead(id);
    if (!updated) return res.status(404).json({ error: 'Lead not found or scoring failed' });
    res.json(updated);
  } catch (error: any) {
    console.error('[LeadDiscoveryRoutes] rescore error:', error);
    res.status(500).json({ error: error?.message || 'Failed to rescore' });
  }
});

// ─── GET /api/admin/leads/rubric/active ─────────────────────────────────────
router.get('/admin/leads/rubric/active', isAdmin, killSwitchGate, async (_req, res) => {
  try {
    const [active] = await db
      .select()
      .from(leadScoringRubrics)
      .where(eq(leadScoringRubrics.isActive, true))
      .limit(1);
    if (!active) return res.status(404).json({ error: 'No active rubric found' });
    res.json(active);
  } catch (error: any) {
    console.error('[LeadDiscoveryRoutes] active-rubric error:', error);
    res.status(500).json({ error: error?.message || 'Failed to fetch active rubric' });
  }
});

// ─── GET /api/admin/leads/rubric/history ────────────────────────────────────
router.get('/admin/leads/rubric/history', isAdmin, killSwitchGate, async (_req, res) => {
  try {
    const rows = await db
      .select()
      .from(leadScoringRubrics)
      .orderBy(desc(leadScoringRubrics.version))
      .limit(10);
    res.json({ rubrics: rows });
  } catch (error: any) {
    console.error('[LeadDiscoveryRoutes] rubric-history error:', error);
    res.status(500).json({ error: error?.message || 'Failed to fetch rubric history' });
  }
});

// ─── POST /api/admin/leads/rubric/refine-now ────────────────────────────────
router.post('/admin/leads/rubric/refine-now', isAdmin, killSwitchGate, async (_req, res) => {
  try {
    const { runWeeklyRubricRefinement } = await import('../services/leadRubricRefinementService');
    const result = await runWeeklyRubricRefinement();
    res.json(result);
  } catch (error: any) {
    console.error('[LeadDiscoveryRoutes] refine-now error:', error);
    res.status(500).json({ error: error?.message || 'Refinement failed' });
  }
});

export default router;
