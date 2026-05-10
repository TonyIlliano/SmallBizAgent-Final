/**
 * Lead Rubric Refinement Service — the "agent gets better" loop.
 *
 * Runs weekly (or on-demand via admin endpoint). Pulls user feedback signals
 * (`qualified` + `converted` = positive; `dismissed` = negative) from the last
 * 30 days, feeds them to Claude with the last 3 rubric versions for context,
 * and asks Claude to refine the rubric. The new version is persisted, the
 * previous active version is demoted, and the in-memory rubric cache is
 * invalidated so subsequent scans use the new version immediately.
 *
 * Skips refinement when signal volume is too low (<5 positive OR <3 negative)
 * — not enough data to learn from. Logs that decision for visibility.
 *
 * Mirrors `autoRefineService.runWeeklyAutoRefine` pattern.
 */

import { db } from '../db';
import { leads, leadScoringRubrics } from '../../shared/schema';
import { and, eq, gte, inArray, desc, sql } from 'drizzle-orm';
import { claudeJson } from './claudeClient';
import { invalidateRubricCache } from './leadDiscoveryService';

// Sonnet 4.6 pricing
const COST_INPUT_PER_M = 3;
const COST_OUTPUT_PER_M = 15;

// Minimum signal counts before we'll attempt to refine.
const MIN_POSITIVE_SIGNALS = 5;
const MIN_NEGATIVE_SIGNALS = 3;

const META_SYSTEM_PROMPT = `You are a B2B SaaS lead-scoring rubric refiner.

Your job: review how the current scoring rubric performed against user feedback (which leads the user qualified/converted vs dismissed), then produce an improved rubric. The rubric is used by a downstream Claude scoring call to grade new leads on a 0-10 scale across three dimensions: ICP Fit, Pain Signals, and Reach Difficulty.

RULES (do not violate):
1. You may adjust dimension descriptions, guidance text, and the systemPrompt.
2. You may NOT add or remove dimensions. The three are fixed: icp_fit, pain_signals, reach_difficulty.
3. You may NOT change the 0-10 scale.
4. Your refinement summary must be 2-3 sentences explaining what you changed and why, citing specific patterns from the user feedback.
5. Be conservative. If feedback patterns are unclear, change less.

Return JSON with this exact shape:
{
  "rubric": {
    "systemPrompt": "string — the scoring agent's system prompt",
    "dimensions": [
      { "key": "icp_fit", "label": "string", "description": "string" },
      { "key": "pain_signals", "label": "string", "description": "string" },
      { "key": "reach_difficulty", "label": "string", "description": "string" }
    ],
    "guidance": "string — closing guidance to the scoring agent"
  },
  "refinementSummary": "2-3 sentence summary of what you changed and why"
}`;

export interface RefinementResult {
  status: 'refined' | 'skipped_insufficient_signal' | 'failed';
  newVersionId?: number;
  newVersion?: number;
  positiveSignalsCount: number;
  negativeSignalsCount: number;
  summary?: string;
  errorMessage?: string;
}

/**
 * Run the weekly rubric refinement. Returns the result for surfacing in the
 * admin UI / logs. Never throws — failure is captured in the result object.
 */
export async function runWeeklyRubricRefinement(): Promise<RefinementResult> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // 1. Pull positive + negative signals
  let positives: any[] = [];
  let negatives: any[] = [];
  try {
    positives = await db
      .select({
        id: leads.id,
        businessName: leads.businessName,
        industry: leads.industry,
        rating: leads.rating,
        reviewCount: leads.reviewCount,
        leadScore: leads.leadScore,
        status: leads.status,
        painSummary: leads.painSummary,
        scoringRationale: leads.scoringRationale,
      })
      .from(leads)
      .where(
        and(
          inArray(leads.status, ['qualified', 'converted']),
          gte(leads.discoveredAt, thirtyDaysAgo),
        ),
      )
      .limit(50);

    negatives = await db
      .select({
        id: leads.id,
        businessName: leads.businessName,
        industry: leads.industry,
        rating: leads.rating,
        reviewCount: leads.reviewCount,
        leadScore: leads.leadScore,
        status: leads.status,
        painSummary: leads.painSummary,
        scoringRationale: leads.scoringRationale,
      })
      .from(leads)
      .where(
        and(
          eq(leads.status, 'dismissed'),
          gte(leads.discoveredAt, thirtyDaysAgo),
        ),
      )
      .limit(50);
  } catch (err: any) {
    console.error('[LeadRubricRefinement] Failed to fetch signals:', err);
    return {
      status: 'failed',
      positiveSignalsCount: 0,
      negativeSignalsCount: 0,
      errorMessage: err?.message || String(err),
    };
  }

  if (positives.length < MIN_POSITIVE_SIGNALS || negatives.length < MIN_NEGATIVE_SIGNALS) {
    console.log(
      `[LeadRubricRefinement] Insufficient signal — ${positives.length} positive ` +
      `(need ${MIN_POSITIVE_SIGNALS}), ${negatives.length} negative (need ${MIN_NEGATIVE_SIGNALS}). Skipping.`,
    );
    return {
      status: 'skipped_insufficient_signal',
      positiveSignalsCount: positives.length,
      negativeSignalsCount: negatives.length,
    };
  }

  // 2. Pull last 3 rubric versions for context
  const recentRubrics = await db
    .select()
    .from(leadScoringRubrics)
    .orderBy(desc(leadScoringRubrics.version))
    .limit(3);

  const activeRubric = recentRubrics.find(r => r.isActive);
  if (!activeRubric) {
    console.error('[LeadRubricRefinement] No active rubric — cannot refine');
    return {
      status: 'failed',
      positiveSignalsCount: positives.length,
      negativeSignalsCount: negatives.length,
      errorMessage: 'No active rubric in lead_scoring_rubrics',
    };
  }

  // 3. Build the meta-prompt
  const recentVersionsText = recentRubrics
    .map(r =>
      `### Rubric v${r.version} (${r.isActive ? 'ACTIVE' : 'historical'})\n` +
      `Summary: ${r.refinementSummary || '(seed)'}\n` +
      `Rubric: ${JSON.stringify(r.rubric).slice(0, 800)}`,
    )
    .join('\n\n');

  const positivesText = positives
    .slice(0, 30)
    .map(p =>
      `- ${p.businessName} (${p.industry}, ${p.rating ?? '?'}/5, ${p.reviewCount ?? 0} reviews) ` +
      `→ ${p.status.toUpperCase()} (was scored ${p.leadScore ?? '?'})` +
      (p.painSummary ? ` — "${p.painSummary}"` : ''),
    )
    .join('\n');

  const negativesText = negatives
    .slice(0, 30)
    .map(n =>
      `- ${n.businessName} (${n.industry}, ${n.rating ?? '?'}/5, ${n.reviewCount ?? 0} reviews) ` +
      `→ DISMISSED (was scored ${n.leadScore ?? '?'})` +
      (n.scoringRationale ? ` — agent had said: "${n.scoringRationale}"` : ''),
    )
    .join('\n');

  const userPrompt = `## RECENT RUBRIC VERSIONS

${recentVersionsText}

## POSITIVE SIGNALS — leads the user marked QUALIFIED or CONVERTED (${positives.length} total)

${positivesText}

## NEGATIVE SIGNALS — leads the user marked DISMISSED (${negatives.length} total)

${negativesText}

## YOUR TASK

The active rubric is v${activeRubric.version}. Look at how it scored the leads above vs how the user classified them. Refine the rubric so future scores better match what the user wants. Return JSON.`;

  // 4. Call Claude
  let result: any;
  let inputTokens = 0;
  let outputTokens = 0;
  let estimatedCost = 0;

  try {
    result = await claudeJson<any>({
      system: META_SYSTEM_PROMPT,
      prompt: userPrompt,
      maxTokens: 2000,
    });

    inputTokens = Math.ceil((META_SYSTEM_PROMPT.length + userPrompt.length) / 4);
    outputTokens = Math.ceil(JSON.stringify(result).length / 4);
    estimatedCost =
      (inputTokens / 1_000_000) * COST_INPUT_PER_M +
      (outputTokens / 1_000_000) * COST_OUTPUT_PER_M;
  } catch (err: any) {
    console.error('[LeadRubricRefinement] Claude meta-call failed:', err);
    return {
      status: 'failed',
      positiveSignalsCount: positives.length,
      negativeSignalsCount: negatives.length,
      errorMessage: err?.message || String(err),
    };
  }

  // 5. Validate the new rubric shape
  if (!result?.rubric?.dimensions || !Array.isArray(result.rubric.dimensions)) {
    console.error('[LeadRubricRefinement] Invalid rubric structure returned:', result);
    return {
      status: 'failed',
      positiveSignalsCount: positives.length,
      negativeSignalsCount: negatives.length,
      errorMessage: 'Invalid rubric structure returned by Claude',
    };
  }

  const requiredKeys = ['icp_fit', 'pain_signals', 'reach_difficulty'];
  const returnedKeys = result.rubric.dimensions.map((d: any) => d.key);
  for (const key of requiredKeys) {
    if (!returnedKeys.includes(key)) {
      console.error(`[LeadRubricRefinement] Refined rubric missing required dimension: ${key}`);
      return {
        status: 'failed',
        positiveSignalsCount: positives.length,
        negativeSignalsCount: negatives.length,
        errorMessage: `Refined rubric missing required dimension: ${key}`,
      };
    }
  }

  // 6. Persist: demote current active, insert new version
  const newVersion = activeRubric.version + 1;
  const refinementSummary = String(result.refinementSummary ?? '').slice(0, 1000);

  try {
    await db.transaction(async (tx) => {
      // Demote current active
      await tx
        .update(leadScoringRubrics)
        .set({ isActive: false, deactivatedAt: new Date() })
        .where(eq(leadScoringRubrics.isActive, true));

      // Insert new version
      await tx.insert(leadScoringRubrics).values({
        version: newVersion,
        isActive: true,
        rubric: result.rubric,
        refinedFromVersion: activeRubric.version,
        positiveSignalsCount: positives.length,
        negativeSignalsCount: negatives.length,
        refinementSummary,
        inputTokens,
        outputTokens,
        estimatedCost: Number(estimatedCost.toFixed(4)),
      });
    });
  } catch (err: any) {
    console.error('[LeadRubricRefinement] Failed to persist new rubric:', err);
    return {
      status: 'failed',
      positiveSignalsCount: positives.length,
      negativeSignalsCount: negatives.length,
      errorMessage: err?.message || String(err),
    };
  }

  // 7. Invalidate the scoring service's rubric cache so the next scan picks
  //    up the new version immediately.
  invalidateRubricCache();

  const [newRow] = await db
    .select({ id: leadScoringRubrics.id, version: leadScoringRubrics.version })
    .from(leadScoringRubrics)
    .where(eq(leadScoringRubrics.isActive, true))
    .limit(1);

  console.log(
    `[LeadRubricRefinement] Refined v${activeRubric.version} → v${newVersion} ` +
    `(${positives.length} positive, ${negatives.length} negative signals, $${estimatedCost.toFixed(4)})`,
  );

  return {
    status: 'refined',
    newVersionId: newRow?.id,
    newVersion,
    positiveSignalsCount: positives.length,
    negativeSignalsCount: negatives.length,
    summary: refinementSummary,
  };
}
