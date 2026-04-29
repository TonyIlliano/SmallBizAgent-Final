import { storage } from '../storage';
import { db } from '../db';
import { businesses } from '@shared/schema';
import { eq } from 'drizzle-orm';

/**
 * Weekly auto-refresh of the Retell agent system prompt with fresh
 * call_intelligence patterns. Runs as a scheduler job — see
 * `startIntelligenceRefreshScheduler()` in schedulerService.ts.
 *
 * Why this exists:
 * - `call_intelligence` rows accumulate after every call (objections,
 *   services mentioned, sentiment trends, unanswered questions).
 * - `buildIntelligenceHints()` reads those rows and produces a
 *   "CALLER PATTERNS" block that gets injected into the agent's system
 *   prompt at provisioning/refresh time.
 * - Without this scheduler, the prompt only refreshes when the owner
 *   takes action (manual Refresh, accepting an auto-refine suggestion,
 *   knowledge-base / config edit). Dormant owners → static AI.
 *
 * Eligibility for refresh:
 *   1. Business has a provisioned Retell agent (retell_agent_id + retell_llm_id)
 *   2. Subscription is active OR trialing (no point burning API calls on canceled accounts)
 *   3. New `call_intelligence` rows since `last_intelligence_refresh_at`
 *      (or null = never refreshed)
 */

const MIN_INTERVAL_MS = 6 * 24 * 60 * 60 * 1000; // 6 days — guards against scheduler over-firing

interface RefreshResult {
  total: number;
  refreshed: number;
  skipped: number;
  failed: number;
  errors: { businessId: number; error: string }[];
}

export async function runWeeklyIntelligenceRefresh(): Promise<RefreshResult> {
  const result: RefreshResult = {
    total: 0,
    refreshed: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  console.log(`[IntelligenceRefresh] Starting weekly run at ${new Date().toISOString()}`);

  let allBusinesses;
  try {
    allBusinesses = await storage.getAllBusinesses();
  } catch (err: any) {
    console.error('[IntelligenceRefresh] Failed to load businesses:', err);
    return result;
  }

  result.total = allBusinesses.length;

  for (const business of allBusinesses) {
    try {
      const eligible = await isEligibleForRefresh(business);
      if (!eligible.ok) {
        result.skipped++;
        if (eligible.reason) {
          console.log(`[IntelligenceRefresh] Skipping business ${business.id}: ${eligible.reason}`);
        }
        continue;
      }

      const updated = await refreshOneBusiness(business.id);
      if (updated.success) {
        result.refreshed++;
      } else {
        result.failed++;
        result.errors.push({ businessId: business.id, error: updated.error ?? 'unknown' });
      }

      // Tiny pause between businesses to avoid bursting Retell's rate limit.
      await sleep(500);
    } catch (err: any) {
      result.failed++;
      result.errors.push({ businessId: business.id, error: err?.message ?? String(err) });
      console.error(`[IntelligenceRefresh] Unexpected error for business ${business.id}:`, err);
    }
  }

  console.log(
    `[IntelligenceRefresh] Done. total=${result.total} refreshed=${result.refreshed} ` +
      `skipped=${result.skipped} failed=${result.failed}`
  );
  return result;
}

async function isEligibleForRefresh(
  business: any
): Promise<{ ok: boolean; reason?: string }> {
  // Must have a provisioned Retell agent.
  if (!business.retellAgentId || !business.retellLlmId) {
    return { ok: false, reason: 'no Retell agent' };
  }

  // Skip canceled / expired accounts. Trialing and active are both eligible —
  // a trial user benefits from a smarter AI just as much as a paying one.
  const status = business.subscriptionStatus;
  const eligibleStatuses = new Set([
    'active',
    'trialing',
    'grace_period', // still has phone, just AI paused — refresh anyway so resubscribe is instant-on
  ]);
  if (status && !eligibleStatuses.has(status)) {
    return { ok: false, reason: `subscription status=${status}` };
  }

  // Don't refresh more often than the minimum interval. Defends against
  // scheduler over-firing (e.g., process restart loops) and avoids spamming
  // Retell when nothing has actually changed.
  const last = business.lastIntelligenceRefreshAt
    ? new Date(business.lastIntelligenceRefreshAt).getTime()
    : 0;
  if (last > 0 && Date.now() - last < MIN_INTERVAL_MS) {
    return { ok: false, reason: 'refreshed recently' };
  }

  // Skip dormant businesses with no new intelligence to learn from.
  // We compare the most-recent call_intelligence row's createdAt against
  // last_intelligence_refresh_at. If the latest intelligence is older than
  // the last refresh, nothing has changed.
  try {
    const recent = await storage.getCallIntelligenceByBusiness(business.id, { limit: 1 });
    if (!recent || recent.length === 0) {
      return { ok: false, reason: 'no call intelligence yet' };
    }
    const latestIntelligenceAt = new Date(recent[0].createdAt as any).getTime();
    if (last > 0 && latestIntelligenceAt <= last) {
      return { ok: false, reason: 'no new intelligence since last refresh' };
    }
  } catch (err) {
    console.error(
      `[IntelligenceRefresh] Failed to check intelligence for business ${business.id}:`,
      err
    );
    // Fail open — if we can't check, attempt the refresh anyway.
  }

  return { ok: true };
}

async function refreshOneBusiness(
  businessId: number
): Promise<{ success: boolean; error?: string }> {
  const { updateRetellAgent } = await import('./retellProvisioningService');

  const updated = await updateRetellAgent(businessId);
  if (!updated.success) {
    return { success: false, error: updated.error };
  }

  // Stamp the timestamp so we don't refresh again until new intelligence arrives.
  try {
    await db
      .update(businesses)
      .set({ lastIntelligenceRefreshAt: new Date() })
      .where(eq(businesses.id, businessId));
  } catch (err: any) {
    console.error(
      `[IntelligenceRefresh] Failed to write last_intelligence_refresh_at for business ${businessId}:`,
      err
    );
    // Non-fatal — the prompt update succeeded; we'll just refresh again next week.
  }

  return { success: true };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
