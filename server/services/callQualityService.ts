/**
 * Call Quality Service
 *
 * Grades each Retell call against an industry-aware rubric and persists the
 * score. Becomes the merchant-facing "AI Quality Score" feature: per-call
 * score, monthly trend, flagged-call queue.
 *
 * Flow:
 *   1. callIntelligenceService completes (intent + sentiment + summary extracted)
 *   2. This service is fired-and-forgotten with the same transcript + business
 *   3. Single Claude call grades the transcript against industry rubric
 *   4. Result persisted to call_quality_scores table
 *   5. Score < 6 OR critical failure mode → flagged for merchant review
 *
 * Cost: ~$0.005 per call (single Claude call, ~5K input tokens, ~500 output).
 *
 * Design notes:
 *  - Paid-tier only (free businesses skip the grader entirely).
 *  - Industry-aware rubric (4 universal dimensions + up to 2 industry-specific).
 *  - rubricVersion column lets us evolve the rubric without losing history.
 *  - Failure modes are extracted as tags so we can build a "common failure
 *    patterns" report later (e.g., "30% of low-scoring calls failed at booking
 *    confirmation").
 */

import { claudeJson } from './claudeClient';
import { z } from 'zod';
import { db } from '../db';
import { callQualityScores, type InsertCallQualityScore } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import { isFreePlan } from './usageService';
import { storage } from '../storage';

const RUBRIC_VERSION = 'v1';

// Sonnet 4.6 pricing for cost estimates
const COST_INPUT_PER_M = 3;
const COST_OUTPUT_PER_M = 15;

// ─── Industry → rubric dimensions ────────────────────────────────────────────

interface RubricDimension {
  key: string;
  label: string;
  description: string; // shown to the grader
}

const UNIVERSAL_DIMENSIONS: RubricDimension[] = [
  {
    key: 'greeting',
    label: 'Greeting & professionalism',
    description: 'Did the AI greet the caller professionally? Was the tone warm and brand-appropriate? Did it handle the opening smoothly?',
  },
  {
    key: 'identification',
    label: 'Service / intent identification',
    description: 'Did the AI correctly identify what the caller wanted (service requested, question asked, problem reported)? Did it ask clarifying questions when needed?',
  },
  {
    key: 'resolution',
    label: 'Resolution',
    description: 'Did the AI accomplish the goal — booked the appointment, answered the question, properly escalated, or set the correct next step? An unresolved call where the AI tried but failed is OK; a call where the AI never attempted resolution scores low.',
  },
  {
    key: 'closing',
    label: 'Closing & confirmation',
    description: 'Did the AI confirm details (date/time/service), set expectations (reminder coming, link being texted), and end professionally? Did the caller leave knowing what happens next?',
  },
];

const SALON_DIMENSIONS: RubricDimension[] = [
  {
    key: 'stylist_handling',
    label: 'Stylist preference handled',
    description: 'If the caller mentioned a preferred stylist, did the AI honor it (or explain why it could not)? If no preference, did the AI offer options?',
  },
  {
    key: 'time_slots_offered',
    label: 'Time slots offered',
    description: 'When availability was needed, did the AI offer 2-3 concrete options rather than vague generalities?',
  },
];

const HVAC_DIMENSIONS: RubricDimension[] = [
  {
    key: 'urgency_assessment',
    label: 'Urgency assessment',
    description: 'For service businesses, did the AI assess urgency (no heat in winter, water leak, etc.) and route appropriately?',
  },
  {
    key: 'address_captured',
    label: 'Address & access info captured',
    description: 'For on-site service, did the AI capture the service address and any access instructions (gate code, where to park)?',
  },
];

const RESTAURANT_DIMENSIONS: RubricDimension[] = [
  {
    key: 'order_accuracy',
    label: 'Order accuracy',
    description: 'For ordering calls, did the AI correctly capture items, modifiers, quantities, and special requests?',
  },
  {
    key: 'pos_write',
    label: 'POS write succeeded',
    description: 'Did the AI successfully send the order to POS (Heartland/Clover/Square)? An order taken but not written to POS scores low.',
  },
];

/**
 * Pick the industry-specific dimensions for a given industry string.
 * Falls back to universal-only if no specific match.
 */
function getIndustryDimensions(industry: string | null | undefined): RubricDimension[] {
  if (!industry) return [];
  const lower = industry.toLowerCase();
  if (/(salon|barber|spa|beauty|hair|nail)/.test(lower)) return SALON_DIMENSIONS;
  if (/(hvac|plumb|electric|landscap|cleaning|construction|paint|pest|roof)/.test(lower)) return HVAC_DIMENSIONS;
  if (/(restaurant|food|cafe|pizza|deli|bar|tavern)/.test(lower)) return RESTAURANT_DIMENSIONS;
  return [];
}

/**
 * Build the full rubric for a business based on its industry.
 */
function buildRubric(industry: string | null | undefined): RubricDimension[] {
  return [...UNIVERSAL_DIMENSIONS, ...getIndustryDimensions(industry)];
}

// ─── Zod schema for grader output ────────────────────────────────────────────

const dimensionScoreSchema = z.object({
  score: z.number().min(0).max(10).catch(5),
  justification: z.string().max(500).catch(''),
});

const graderOutputSchema = z.object({
  dimensions: z.record(z.string(), dimensionScoreSchema),
  failureModes: z.array(z.string()).catch([]),
  // Optional: grader can flag "this is a critical failure regardless of score"
  criticalFailure: z.boolean().catch(false),
});

// ─── Main entrypoint ──────────────────────────────────────────────────────────

/**
 * Score a call against the rubric. Fire-and-forget — never throws.
 * Caller (callIntelligenceService) does NOT await this.
 */
export async function scoreCall(params: {
  businessId: number;
  callLogId: number;
  transcript: string;
  industry?: string | null;
  businessName?: string | null;
}): Promise<void> {
  const { businessId, callLogId, transcript, industry, businessName } = params;

  // Free-plan gate — paid-tier feature
  try {
    if (await isFreePlan(businessId)) {
      console.log(`[CallQuality] Skipped — business ${businessId} is on Free plan`);
      return;
    }
  } catch (err) {
    console.warn(`[CallQuality] Free plan check failed for business ${businessId}, proceeding:`, err);
  }

  // Skip very short transcripts (hangups, wrong numbers)
  if (!transcript || transcript.length < 100) {
    console.log(`[CallQuality] Skipping short transcript (${transcript?.length || 0} chars) for call ${callLogId}`);
    return;
  }

  // Idempotency: skip if already scored
  try {
    const [existing] = await db.select({ id: callQualityScores.id })
      .from(callQualityScores)
      .where(eq(callQualityScores.callLogId, callLogId))
      .limit(1);
    if (existing) {
      console.log(`[CallQuality] Call ${callLogId} already scored, skipping`);
      return;
    }
  } catch {
    /* fall through and try to score anyway */
  }

  const rubric = buildRubric(industry);
  const truncatedTranscript = transcript.substring(0, 12000);
  const businessLabel = businessName ? `at "${businessName}"` : '';
  const industryLabel = industry ? `, a ${industry} business` : '';

  const systemPrompt = `You are an experienced quality auditor evaluating phone calls between an AI receptionist and a caller ${businessLabel}${industryLabel}.

Score each dimension on a 0-10 integer scale where:
  0-3 = critical failure (caller hung up frustrated, AI completely misunderstood, action skipped entirely)
  4-5 = below average (multiple weaknesses, customer experience suffered)
  6-7 = acceptable (got the job done, some rough edges)
  8-9 = strong (smooth, professional, complete)
  10 = exemplary (a model call you'd use for training)

Rubric dimensions:
${rubric.map((d, i) => `${i + 1}. **${d.key}** — ${d.label}: ${d.description}`).join('\n')}

Also extract failure modes (zero or more, from this list — only include if clearly present):
  misunderstood_service, wrong_appointment_time, didnt_book_when_should_have, escalated_unnecessarily,
  failed_to_escalate, hung_up_early, missed_caller_name, missed_phone_number, missed_address,
  read_id_aloud, sounded_robotic, ignored_objection, gave_wrong_pricing, double_booked

Set criticalFailure = true ONLY if the call had a fundamental breakdown the merchant must review immediately
(e.g., caller hung up angry, AI scheduled the wrong service, AI gave wrong pricing).

Return JSON with this shape:
{
  "dimensions": {
${rubric.map(d => `    "${d.key}": { "score": 0-10, "justification": "1 short sentence" }`).join(',\n')}
  },
  "failureModes": ["..."],
  "criticalFailure": false
}

Be honest. The merchant relies on these scores to improve their AI. Inflated scores hurt them.`;

  const userPrompt = `Call transcript:

${truncatedTranscript}

Score this call.`;

  let inputTokens = 0;
  let outputTokens = 0;
  let modelUsed = 'claude-sonnet-4-6';

  try {
    const result = await claudeJson<unknown>({
      system: systemPrompt,
      prompt: userPrompt,
      maxTokens: 1500,
    });

    // Track usage if claudeJson surfaces it (non-blocking if not)
    // Most claudeClient wrappers don't return usage today; we estimate from prompt size.
    inputTokens = Math.ceil((systemPrompt.length + userPrompt.length) / 4);
    outputTokens = Math.ceil(JSON.stringify(result).length / 4);

    const parsed = graderOutputSchema.safeParse(result);
    if (!parsed.success) {
      console.warn(`[CallQuality] Grader output failed schema validation for call ${callLogId}:`, parsed.error.message);
      return;
    }

    const { dimensions, failureModes, criticalFailure } = parsed.data;

    // Compute total score = mean of dimension scores
    const dimScores = Object.values(dimensions).map(d => d.score);
    if (dimScores.length === 0) {
      console.warn(`[CallQuality] No dimensions returned for call ${callLogId}, skipping persist`);
      return;
    }
    const totalScore = dimScores.reduce((a, b) => a + b, 0) / dimScores.length;

    const flagged = totalScore < 6 || criticalFailure;

    const estimatedCost =
      (inputTokens / 1_000_000) * COST_INPUT_PER_M +
      (outputTokens / 1_000_000) * COST_OUTPUT_PER_M;

    const insertData: InsertCallQualityScore = {
      businessId,
      callLogId,
      industry: industry || null,
      dimensions,
      totalScore: Number(totalScore.toFixed(2)),
      rubricVersion: RUBRIC_VERSION,
      flagged,
      flagDismissed: false,
      flagDismissedAt: null,
      failureModes,
      modelUsed,
      inputTokens,
      outputTokens,
      estimatedCost: Number(estimatedCost.toFixed(4)),
    };

    await db.insert(callQualityScores).values(insertData);

    console.log(
      `[CallQuality] Scored call ${callLogId}: ${totalScore.toFixed(1)}/10` +
      (flagged ? ` ⚠️  FLAGGED${criticalFailure ? ' (critical)' : ''}` : '') +
      (failureModes.length ? ` modes=[${failureModes.join(',')}]` : '')
    );
  } catch (err) {
    console.error(`[CallQuality] Failed to score call ${callLogId}:`, err);
    // Don't persist on failure — better no score than bad data
  }
}

// ─── Read helpers ─────────────────────────────────────────────────────────────

/**
 * Get the quality score for a single call.
 */
export async function getCallQualityScore(callLogId: number) {
  const [row] = await db.select().from(callQualityScores)
    .where(eq(callQualityScores.callLogId, callLogId))
    .limit(1);
  return row ?? null;
}

/**
 * Mark a flagged call as reviewed by the merchant ("dismiss flag").
 * The score stays; only the flag goes away.
 */
export async function dismissQualityFlag(callLogId: number, businessId: number): Promise<boolean> {
  const result = await db.update(callQualityScores)
    .set({
      flagDismissed: true,
      flagDismissedAt: new Date(),
    })
    .where(eq(callQualityScores.callLogId, callLogId))
    .returning({ id: callQualityScores.id, businessId: callQualityScores.businessId });

  // Best-effort ownership check
  return result.length > 0 && result[0].businessId === businessId;
}
