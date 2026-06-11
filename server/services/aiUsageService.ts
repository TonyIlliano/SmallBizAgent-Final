/**
 * AI Usage Service — per-tenant AI cost accounting.
 *
 * Why this exists: at scale, AI inference is the platform's COGS. Without
 * per-business token accounting, one business with a hostile or buggy
 * integration can run unbounded Claude spend and nobody notices until the
 * Anthropic invoice arrives. This service gives the platform owner:
 *
 *   1. A ledger — ai_usage_daily, one row per (business, day, provider),
 *      incremented by claudeClient on EVERY call (fire-and-forget, never
 *      blocks or fails the AI call itself).
 *   2. A per-business soft limit — businesses.ai_monthly_budget (dollars).
 *      When month-to-date estimated cost crosses it, a high-severity admin
 *      alert fires (once per business per month). Calls are NOT blocked —
 *      cutting off a paying customer's AI receptionist over an estimate
 *      would be worse than the overage; the alert is the intervention point.
 *   3. Admin visibility — getAiUsageSummary() powers
 *      GET /api/admin/ai-usage (per-business ranking by cost).
 *
 * businessId 0 = platform-level usage (admin content agents, lead scoring,
 * anything without a tenant in scope).
 */

import { pool } from '../db';

// ── Rate card (dollars per 1M tokens) ──
// Claude pricing matches the figure already used by the smart-agent cost
// display (socialMediaRoutes). OpenAI fallback numbers are ESTIMATES for the
// gpt-5.4-mini fallback path — fallback volume should be near zero anyway.
// Update here when provider pricing changes.
export const AI_RATE_CARD: Record<string, { inputPerMTok: number; outputPerMTok: number }> = {
  claude: { inputPerMTok: 3.0, outputPerMTok: 15.0 },
  openai: { inputPerMTok: 0.25, outputPerMTok: 2.0 },
};

export function estimateCostUsd(provider: string, inputTokens: number, outputTokens: number): number {
  const rates = AI_RATE_CARD[provider] ?? AI_RATE_CARD.claude;
  return (inputTokens / 1_000_000) * rates.inputPerMTok + (outputTokens / 1_000_000) * rates.outputPerMTok;
}

export interface AiUsageEvent {
  /** Tenant the call was made on behalf of. undefined/null → 0 (platform). */
  businessId?: number | null;
  provider: 'claude' | 'openai';
  inputTokens: number;
  outputTokens: number;
}

// ── Budget-check throttles (per process) ──
// Checking the budget needs 2 queries; doing that on every AI call would be
// wasteful. Throttle to once per business per BUDGET_CHECK_INTERVAL_MS.
// Alert dedup is per (business, month) — on multi-instance deploys each
// instance may alert once, which is acceptable for an admin notification.
const BUDGET_CHECK_INTERVAL_MS = 15 * 60_000;
const lastBudgetCheckAt = new Map<number, number>();
const budgetAlertedMonths = new Map<number, string>();

/** Test helper — reset throttle/dedup state. */
export function _resetAiUsageState(): void {
  lastBudgetCheckAt.clear();
  budgetAlertedMonths.clear();
}

/**
 * Record one AI call against the tenant's daily ledger. Safe to call
 * fire-and-forget: every failure is swallowed after logging — usage
 * accounting must never break the AI call it's measuring.
 */
export async function recordAiUsage(evt: AiUsageEvent): Promise<void> {
  const businessId = evt.businessId ?? 0;
  const inputTokens = Math.max(0, Math.floor(evt.inputTokens || 0));
  const outputTokens = Math.max(0, Math.floor(evt.outputTokens || 0));
  const cost = estimateCostUsd(evt.provider, inputTokens, outputTokens);

  try {
    await pool.query(
      `INSERT INTO ai_usage_daily (business_id, day, provider, call_count, input_tokens, output_tokens, estimated_cost, updated_at)
       VALUES ($1, CURRENT_DATE, $2, 1, $3, $4, $5, NOW())
       ON CONFLICT (business_id, day, provider)
       DO UPDATE SET
         call_count = ai_usage_daily.call_count + 1,
         input_tokens = ai_usage_daily.input_tokens + EXCLUDED.input_tokens,
         output_tokens = ai_usage_daily.output_tokens + EXCLUDED.output_tokens,
         estimated_cost = ai_usage_daily.estimated_cost + EXCLUDED.estimated_cost,
         updated_at = NOW()`,
      [businessId, evt.provider, inputTokens, outputTokens, cost.toFixed(6)],
    );
  } catch (err: any) {
    // Table missing on a pre-migration boot is fine; anything else is logged
    if (!String(err?.message || err).includes('does not exist')) {
      console.warn('[AiUsage] Failed to record usage:', err?.message || err);
    }
    return;
  }

  // Soft-limit budget check (throttled; platform usage has no budget)
  if (businessId > 0) {
    try {
      await maybeCheckBudget(businessId);
    } catch (err: any) {
      console.warn('[AiUsage] Budget check failed:', err?.message || err);
    }
  }
}

async function maybeCheckBudget(businessId: number): Promise<void> {
  const now = Date.now();
  const last = lastBudgetCheckAt.get(businessId) ?? 0;
  if (now - last < BUDGET_CHECK_INTERVAL_MS) return;
  lastBudgetCheckAt.set(businessId, now);

  const monthKey = new Date().toISOString().slice(0, 7); // YYYY-MM
  if (budgetAlertedMonths.get(businessId) === monthKey) return;

  const { rows: bizRows } = await pool.query(
    `SELECT name, ai_monthly_budget FROM businesses WHERE id = $1`,
    [businessId],
  );
  const budget = parseFloat(bizRows[0]?.ai_monthly_budget);
  if (!bizRows[0] || !Number.isFinite(budget) || budget <= 0) return;

  const mtd = await getMonthToDateCost(businessId);
  if (mtd < budget) return;

  budgetAlertedMonths.set(businessId, monthKey);
  try {
    const { sendAdminAlert } = await import('./adminAlertService');
    await sendAdminAlert({
      type: 'ai_budget_exceeded',
      severity: 'high',
      title: `AI budget exceeded: ${bizRows[0].name} (business ${businessId})`,
      details: {
        businessId,
        businessName: bizRows[0].name,
        monthToDateCost: `$${mtd.toFixed(2)}`,
        monthlyBudget: `$${budget.toFixed(2)}`,
        month: monthKey,
        note: 'Soft limit — AI calls are NOT being blocked. Investigate usage or raise the budget.',
      },
    });
    console.warn(`[AiUsage] Business ${businessId} exceeded AI budget: $${mtd.toFixed(2)} / $${budget.toFixed(2)} MTD`);
  } catch (err: any) {
    // Alert failed — clear the dedup so the next check retries
    budgetAlertedMonths.delete(businessId);
    console.error('[AiUsage] Failed to send budget alert:', err?.message || err);
  }
}

/** Month-to-date estimated AI cost (dollars) for one business. */
export async function getMonthToDateCost(businessId: number): Promise<number> {
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(estimated_cost), 0) AS total
     FROM ai_usage_daily
     WHERE business_id = $1 AND day >= date_trunc('month', CURRENT_DATE)`,
    [businessId],
  );
  return parseFloat(rows[0]?.total) || 0;
}

export interface AiUsageSummaryRow {
  businessId: number;
  businessName: string | null;
  callCount: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  monthlyBudget: number | null;
}

/**
 * Per-business usage for a month (default: current), ranked by cost.
 * Powers GET /api/admin/ai-usage.
 */
export async function getAiUsageSummary(month?: string): Promise<AiUsageSummaryRow[]> {
  const monthStart = month && /^\d{4}-\d{2}$/.test(month)
    ? `${month}-01`
    : new Date().toISOString().slice(0, 8) + '01';

  const { rows } = await pool.query(
    `SELECT u.business_id,
            b.name AS business_name,
            b.ai_monthly_budget,
            SUM(u.call_count)::int AS call_count,
            SUM(u.input_tokens)::bigint AS input_tokens,
            SUM(u.output_tokens)::bigint AS output_tokens,
            SUM(u.estimated_cost) AS estimated_cost
     FROM ai_usage_daily u
     LEFT JOIN businesses b ON b.id = u.business_id
     WHERE u.day >= $1::date AND u.day < ($1::date + interval '1 month')
     GROUP BY u.business_id, b.name, b.ai_monthly_budget
     ORDER BY SUM(u.estimated_cost) DESC`,
    [monthStart],
  );

  return rows.map((r: any) => ({
    businessId: r.business_id,
    businessName: r.business_id === 0 ? 'Platform (no tenant)' : (r.business_name ?? null),
    callCount: Number(r.call_count) || 0,
    inputTokens: Number(r.input_tokens) || 0,
    outputTokens: Number(r.output_tokens) || 0,
    estimatedCost: parseFloat(r.estimated_cost) || 0,
    monthlyBudget: r.ai_monthly_budget != null ? parseFloat(r.ai_monthly_budget) : null,
  }));
}
