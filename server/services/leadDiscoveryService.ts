/**
 * Lead Discovery Service
 *
 * Admin-only feature for scanning Google Places, filtering ICP-matching
 * small businesses in curated regions (Maryland + Northern VA + Delaware
 * + SE PA + custom), and scoring survivors with Claude using a
 * self-refining rubric.
 *
 * Cost discipline:
 *   1. Layer 1: Google Places Text Search ($0.032/call)
 *   2. Layer 2: rule-based filters (free) — reject before any Details lookup
 *   3. Layer 3: Google Places Details ($0.017/call) — only on Layer 2 survivors
 *   4. Layer 4: Claude scoring with few-shot ($0.008/call) — only on Layer 3 survivors
 *
 * Hard $20/month spend cap enforced pre-flight via `getCurrentMonthSpend()`.
 *
 * Forward-compatible: pattern works for any state. UI exposes curated
 * region presets + custom zip-code paste. Default = Maryland.
 */

import { db } from '../db';
import {
  leads,
  leadDiscoveryRuns,
  leadScoringRubrics,
  type Lead,
  type InsertLead,
  type LeadScoringRubric,
} from '../../shared/schema';
import { and, eq, gte, sql, desc, inArray, isNull } from 'drizzle-orm';
import { claudeJson } from './claudeClient';
import * as googlePlaces from './googlePlacesService';

// ─── Constants ──────────────────────────────────────────────────────────────

export const MONTHLY_BUDGET_USD = 20;

// Sonnet 4.6 pricing
const COST_INPUT_PER_M = 3;
const COST_OUTPUT_PER_M = 15;

// Google Places pricing
const COST_PLACES_SEARCH = 0.032;
const COST_PLACES_DETAILS = 0.017;

/** Curated region presets. Add more by extending this map. */
export const REGION_PRESETS: Record<string, string[]> = {
  maryland: ['21201', '21401', '20814', '21701', '20850', '20910', '21044', '21204'],
  northern_va: ['22030', '22102', '22182', '22202', '20176'],
  delaware: ['19801', '19711', '19958'],
  se_pa: ['19103', '19087', '19380', '17602'],
};

/** Industry → Google Places text-search query. */
export const INDUSTRY_QUERIES: Record<string, string> = {
  hvac: 'HVAC contractor',
  plumbing: 'plumber',
  electrical: 'electrician',
  salon: 'hair salon',
  barbershop: 'barber shop',
  spa: 'day spa',
};

export const VALID_INDUSTRIES = Object.keys(INDUSTRY_QUERIES);

/** Layer 2 filter — patterns that suggest a chain or too-large business. */
const CHAIN_MARKERS = [
  /\b(inc|llc|corp|corporation|group|holdings|enterprises)\b/i,
  /\b(franchise|chain|nationwide)\b/i,
];

// ─── Spend tracking ──────────────────────────────────────────────────────────

/** Sum of total_cost from runs + estimatedCost from rubrics in the last 30 days. */
export async function getCurrentMonthSpend(): Promise<number> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [runsTotal] = await db
    .select({ sum: sql<number>`COALESCE(SUM(${leadDiscoveryRuns.totalCost}), 0)` })
    .from(leadDiscoveryRuns)
    .where(gte(leadDiscoveryRuns.startedAt, thirtyDaysAgo));

  const [rubricsTotal] = await db
    .select({ sum: sql<number>`COALESCE(SUM(${leadScoringRubrics.estimatedCost}), 0)` })
    .from(leadScoringRubrics)
    .where(gte(leadScoringRubrics.createdAt, thirtyDaysAgo));

  return Number(runsTotal?.sum ?? 0) + Number(rubricsTotal?.sum ?? 0);
}

// ─── Active rubric cache ─────────────────────────────────────────────────────

let _cachedRubric: { rubric: LeadScoringRubric; cachedAt: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min

/** Get the currently-active rubric. Cached for 5 min. */
export async function getActiveRubric(): Promise<LeadScoringRubric | null> {
  if (_cachedRubric && Date.now() - _cachedRubric.cachedAt < CACHE_TTL_MS) {
    return _cachedRubric.rubric;
  }

  const [rubric] = await db
    .select()
    .from(leadScoringRubrics)
    .where(eq(leadScoringRubrics.isActive, true))
    .limit(1);

  if (!rubric) return null;

  _cachedRubric = { rubric, cachedAt: Date.now() };
  return rubric;
}

/** Invalidate the in-memory rubric cache (called after weekly refinement). */
export function invalidateRubricCache(): void {
  _cachedRubric = null;
}

// ─── Layer 2 — rule-based pre-filters ───────────────────────────────────────

export interface PreFilterReason {
  pass: boolean;
  reason?: string;
}

export function applyRuleBasedFilters(place: googlePlaces.PlaceSummary): PreFilterReason {
  if (!place.placeId) return { pass: false, reason: 'no_place_id' };
  if (!place.name || place.name.length === 0) return { pass: false, reason: 'no_name' };

  // business_status must be OPERATIONAL
  if (place.businessStatus && place.businessStatus !== 'OPERATIONAL') {
    return { pass: false, reason: `business_status=${place.businessStatus}` };
  }

  // Review-count guards: < 5 = likely abandoned/fake; > 500 = too big
  const reviewCount = place.userRatingCount ?? 0;
  if (reviewCount < 5) return { pass: false, reason: `review_count=${reviewCount}<5` };
  if (reviewCount > 500) return { pass: false, reason: `review_count=${reviewCount}>500` };

  // Chain/franchise markers in the name
  for (const pattern of CHAIN_MARKERS) {
    if (pattern.test(place.name)) {
      return { pass: false, reason: 'chain_marker_in_name' };
    }
  }

  return { pass: true };
}

// ─── Few-shot retrieval ─────────────────────────────────────────────────────

interface SimilarLead {
  id: number;
  businessName: string;
  industry: string;
  rating: number | null;
  reviewCount: number | null;
  status: string;
  leadScore: number | null;
  scoringRationale: string | null;
}

/**
 * Pull 3-5 already-classified leads (qualified, converted, OR dismissed)
 * matching the new lead's industry, closest by review_count, biased toward
 * including 1-2 dismissed for negative-example contrast.
 */
export async function findSimilarLeads(
  industry: string,
  reviewCount: number | null | undefined,
  excludeId?: number,
): Promise<SimilarLead[]> {
  const conditions = [
    eq(leads.industry, industry),
    inArray(leads.status, ['qualified', 'converted', 'dismissed']),
  ];
  if (excludeId !== undefined) {
    conditions.push(sql`${leads.id} != ${excludeId}`);
  }

  // Pull recent classified leads in the same industry
  const candidates = await db
    .select({
      id: leads.id,
      businessName: leads.businessName,
      industry: leads.industry,
      rating: leads.rating,
      reviewCount: leads.reviewCount,
      status: leads.status,
      leadScore: leads.leadScore,
      scoringRationale: leads.scoringRationale,
    })
    .from(leads)
    .where(and(...conditions))
    .orderBy(desc(leads.contactedAt))
    .limit(20);

  if (candidates.length === 0) return [];

  // Sort by closeness in review count (when both have it)
  const refCount = reviewCount ?? 0;
  candidates.sort((a, b) => {
    const aDist = Math.abs((a.reviewCount ?? 0) - refCount);
    const bDist = Math.abs((b.reviewCount ?? 0) - refCount);
    return aDist - bDist;
  });

  // Bias the final pick: 2-3 positives + 1-2 negatives if available
  const positives = candidates.filter(c => c.status === 'qualified' || c.status === 'converted').slice(0, 3);
  const negatives = candidates.filter(c => c.status === 'dismissed').slice(0, 2);
  const mix = [...positives, ...negatives].slice(0, 5);
  return mix;
}

// ─── Layer 4 — Claude scoring ───────────────────────────────────────────────

export interface ScoredLead {
  leadScore: number;          // 0-100, computed
  icpFit: number;             // 0-10
  painSignals: number;        // 0-10
  reachDifficulty: number;    // 0-10
  scoringRationale: string;
  painSummary: string;
  rubricVersionId: number;
  similarLeadIds: number[];
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
}

interface LeadToScore {
  id?: number;                // present when rescoring
  businessName: string;
  industry: string;
  city?: string | null;
  state?: string | null;
  rating?: number | null;
  reviewCount?: number | null;
  website?: string | null;
  phone?: string | null;
  businessHours?: any;
}

// ─── TODO(managed-agent): future refactor path ──────────────────────────────
// Scoring is currently a direct claudeJson() call per lead. Chosen for:
//   - Speed (2s per lead vs 30-90s for a Managed Agent session)
//   - Simplicity (stateless, one-shot)
//   - Cost identical at the token level
//
// If we ever want:
//   - Multi-step tool-calling research per lead (look up website, scrape
//     reviews, cross-reference competitors)
//   - Anthropic Dreaming integration to extract cross-lead patterns
//     (requires Managed Agent sessions as the substrate)
//   - Persistent session memory across many leads
// then refactor scoreLeadWithClaude to use runAgentSession() with a new
// 'Lead Scout' agent registered in the Anthropic Console.
//
// Preconditions before doing that:
//   1. Anthropic Dreaming access granted
//   2. 100+ classified leads with real conversion data
//   3. A clear use case for multi-step research per lead (not just scoring)
// ─────────────────────────────────────────────────────────────────────────────
export async function scoreLeadWithClaude(lead: LeadToScore): Promise<ScoredLead | null> {
  const rubric = await getActiveRubric();
  if (!rubric) {
    console.error('[LeadDiscovery] No active rubric in lead_scoring_rubrics; cannot score');
    return null;
  }

  const similar = await findSimilarLeads(lead.industry, lead.reviewCount, lead.id);
  const similarBlock = similar.length === 0
    ? '(no classified leads in this industry yet — score based on rubric only)'
    : similar
        .map(s =>
          `- ${s.businessName} (${s.rating ?? 'no rating'}/5 from ${s.reviewCount ?? 0} reviews) ` +
          `→ ${s.status.toUpperCase()}${s.leadScore !== null ? ` (score ${s.leadScore})` : ''}` +
          (s.scoringRationale ? ` — "${s.scoringRationale}"` : ''),
        )
        .join('\n');

  const rubricObj = rubric.rubric as any;
  const systemPrompt = rubricObj.systemPrompt || 'Score this lead.';
  const dimensionsText = (rubricObj.dimensions || [])
    .map((d: any, i: number) => `${i + 1}. **${d.key}** — ${d.label}: ${d.description}`)
    .join('\n');
  const guidance = rubricObj.guidance || '';

  const userPrompt = `EXAMPLES OF PAST CLASSIFICATIONS (for reference):
${similarBlock}

NEW LEAD TO SCORE:
- Business: ${lead.businessName}
- Industry: ${lead.industry}
- Location: ${lead.city || '?'}, ${lead.state || '?'}
- Rating: ${lead.rating ?? 'unknown'} / 5${lead.reviewCount ? ` from ${lead.reviewCount} reviews` : ''}
- Has website: ${lead.website ? 'yes' : 'no'}
- Has phone: ${lead.phone ? 'yes' : 'no'}
- Has business hours: ${lead.businessHours ? 'yes' : 'no'}

DIMENSIONS:
${dimensionsText}

${guidance}

Return JSON only.`;

  const fullSystem = `${systemPrompt}\n\n${guidance}`;

  let result: any;
  try {
    result = await claudeJson<any>({
      system: fullSystem,
      prompt: userPrompt,
      maxTokens: 800,
    });
  } catch (err) {
    console.error(`[LeadDiscovery] Claude scoring failed for "${lead.businessName}":`, err);
    return null;
  }

  // Validate the response shape
  const icpFit = clampInt(result.icpFit, 0, 10);
  const painSignals = clampInt(result.painSignals, 0, 10);
  const reachDifficulty = clampInt(result.reachDifficulty, 0, 10);
  if (icpFit === null || painSignals === null || reachDifficulty === null) {
    console.warn(`[LeadDiscovery] Invalid scoring response for "${lead.businessName}":`, result);
    return null;
  }

  // Combined 0-100 score: equal-weighted across 3 dimensions × 10
  const leadScore = Math.round(((icpFit + painSignals + reachDifficulty) / 30) * 100);

  // Cost estimate (mirrors callQualityService pattern)
  const inputTokens = Math.ceil((fullSystem.length + userPrompt.length) / 4);
  const outputTokens = Math.ceil(JSON.stringify(result).length / 4);
  const estimatedCost =
    (inputTokens / 1_000_000) * COST_INPUT_PER_M +
    (outputTokens / 1_000_000) * COST_OUTPUT_PER_M;

  return {
    leadScore,
    icpFit,
    painSignals,
    reachDifficulty,
    scoringRationale: String(result.scoringRationale ?? '').slice(0, 500),
    painSummary: String(result.painSummary ?? '').slice(0, 500),
    rubricVersionId: rubric.id,
    similarLeadIds: similar.map(s => s.id),
    inputTokens,
    outputTokens,
    estimatedCost: Number(estimatedCost.toFixed(4)),
  };
}

function clampInt(value: unknown, min: number, max: number): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(min, Math.min(max, Math.round(n)));
}

// ─── Layer 4b — rescore a single existing lead ──────────────────────────────

export async function rescoreLead(leadId: number): Promise<Lead | null> {
  const [lead] = await db.select().from(leads).where(eq(leads.id, leadId)).limit(1);
  if (!lead) return null;

  const scored = await scoreLeadWithClaude({
    id: lead.id,
    businessName: lead.businessName,
    industry: lead.industry,
    city: lead.city,
    state: lead.state,
    rating: lead.rating,
    reviewCount: lead.reviewCount,
    website: lead.website,
    phone: lead.phone,
    businessHours: lead.businessHours,
  });

  if (!scored) return null;

  const [updated] = await db
    .update(leads)
    .set({
      leadScore: scored.leadScore,
      icpFit: scored.icpFit,
      painSignals: scored.painSignals,
      reachDifficulty: scored.reachDifficulty,
      scoringRationale: scored.scoringRationale,
      painSummary: scored.painSummary,
      rubricVersionId: scored.rubricVersionId,
      similarLeadIds: scored.similarLeadIds as any,
      inputTokens: scored.inputTokens,
      outputTokens: scored.outputTokens,
      estimatedCost: scored.estimatedCost,
      lastRescoredAt: new Date(),
      rescoreCount: sql`${leads.rescoreCount} + 1`,
    })
    .where(eq(leads.id, leadId))
    .returning();

  return updated || null;
}

// ─── Layer 0 — orchestrator ─────────────────────────────────────────────────

export interface RunScanOpts {
  userId: number;
  region?: string;
  industries: string[];
  zipCodes?: string[];
  dryRun?: boolean;
  runId?: number; // optional: when provided, updates that row instead of creating new
}

export interface RunScanResult {
  runId: number;
  status: 'completed' | 'aborted_budget' | 'dry_run' | 'failed';
  leadsDiscovered: number;
  leadsRescored: number;
  placesSearchCount: number;
  placesDetailsCount: number;
  claudeScoringCount: number;
  totalCost: number;
  errorMessage?: string;
}

/**
 * Main entrypoint. For each (industry × zip-code) combo:
 *   1. Text Search → list of candidates
 *   2. Apply Layer 2 filters (free)
 *   3. Place Details on survivors
 *   4. Claude scoring + upsert
 *
 * Returns an aggregate result. Updates the lead_discovery_runs row as it goes.
 */
export async function runScan(opts: RunScanOpts): Promise<RunScanResult> {
  // Validate industries
  const industries = (opts.industries || []).filter(i => VALID_INDUSTRIES.includes(i));
  if (industries.length === 0) {
    throw new Error('At least one valid industry required');
  }

  // Resolve zip codes: explicit > region preset > maryland default
  let zipCodes = opts.zipCodes && opts.zipCodes.length > 0 ? opts.zipCodes : null;
  if (!zipCodes && opts.region) {
    zipCodes = REGION_PRESETS[opts.region] || null;
  }
  if (!zipCodes) {
    zipCodes = REGION_PRESETS.maryland;
  }

  // Estimate cost up front (for dry-run + budget check)
  const estimatedSearches = industries.length * zipCodes.length;
  const estimatedDetails = Math.round(estimatedSearches * 5); // assume ~5 survivors per search after filtering
  const estimatedScoring = estimatedDetails;
  const estimatedTotalCost =
    estimatedSearches * COST_PLACES_SEARCH +
    estimatedDetails * COST_PLACES_DETAILS +
    estimatedScoring * 0.008;

  if (opts.dryRun) {
    return {
      runId: 0,
      status: 'dry_run',
      leadsDiscovered: 0,
      leadsRescored: 0,
      placesSearchCount: estimatedSearches,
      placesDetailsCount: estimatedDetails,
      claudeScoringCount: estimatedScoring,
      totalCost: Number(estimatedTotalCost.toFixed(2)),
    };
  }

  // Budget check
  const currentSpend = await getCurrentMonthSpend();
  if (currentSpend + estimatedTotalCost > MONTHLY_BUDGET_USD) {
    const errMsg = `Monthly budget exceeded: current=$${currentSpend.toFixed(2)} + projected=$${estimatedTotalCost.toFixed(2)} > $${MONTHLY_BUDGET_USD}`;
    console.warn(`[LeadDiscovery] ${errMsg}`);
    // Persist the aborted run for visibility
    const [aborted] = await db
      .insert(leadDiscoveryRuns)
      .values({
        invokedByUserId: opts.userId,
        region: opts.region || 'maryland',
        industries: industries as any,
        zipCodes: zipCodes as any,
        status: 'aborted_budget',
        errorMessage: errMsg,
        finishedAt: new Date(),
      })
      .returning();
    return {
      runId: aborted.id,
      status: 'aborted_budget',
      leadsDiscovered: 0,
      leadsRescored: 0,
      placesSearchCount: 0,
      placesDetailsCount: 0,
      claudeScoringCount: 0,
      totalCost: 0,
      errorMessage: errMsg,
    };
  }

  // Use existing run row if provided, otherwise create new
  let runId = opts.runId;
  if (!runId) {
    const [created] = await db
      .insert(leadDiscoveryRuns)
      .values({
        invokedByUserId: opts.userId,
        region: opts.region || 'maryland',
        industries: industries as any,
        zipCodes: zipCodes as any,
        status: 'running',
      })
      .returning();
    runId = created.id;
  }

  let placesSearchCount = 0;
  let placesDetailsCount = 0;
  let claudeScoringCount = 0;
  let leadsDiscovered = 0;
  let leadsRescored = 0;

  try {
    for (const industry of industries) {
      const query = INDUSTRY_QUERIES[industry];
      for (const zip of zipCodes) {
        // ── Layer 1 — Text Search ───────────────────────────────────────
        let candidates: googlePlaces.PlaceSummary[] = [];
        try {
          candidates = await googlePlaces.textSearch({
            query: `${query} near ${zip}, MD`,
            maxResultCount: 20,
          });
          placesSearchCount++;
        } catch (err) {
          console.error(`[LeadDiscovery] Search failed for ${industry} @ ${zip}:`, err);
          continue;
        }

        // ── Layer 2 — rule-based filters ────────────────────────────────
        const survivors = candidates.filter(c => applyRuleBasedFilters(c).pass);

        for (const candidate of survivors) {
          // Skip if already in leads table (idempotency)
          const [existing] = await db
            .select({ id: leads.id })
            .from(leads)
            .where(eq(leads.googlePlaceId, candidate.placeId))
            .limit(1);
          if (existing) {
            continue; // skip — already discovered
          }

          // ── Layer 3 — Place Details ─────────────────────────────────
          let details: googlePlaces.PlaceDetails;
          try {
            details = await googlePlaces.getPlaceDetails(candidate.placeId);
            placesDetailsCount++;
          } catch (err) {
            console.error(`[LeadDiscovery] Details failed for ${candidate.placeId}:`, err);
            continue;
          }

          const phone = details.nationalPhoneNumber || details.internationalPhoneNumber || null;
          // Re-apply phone gate now that we have it
          if (!phone) continue;

          // ── Layer 4 — Claude scoring ────────────────────────────────
          const scored = await scoreLeadWithClaude({
            businessName: details.displayName,
            industry,
            city: extractAddressComponent(details, 'locality'),
            state: 'MD',
            rating: details.rating ?? null,
            reviewCount: details.userRatingCount ?? null,
            website: details.websiteUri ?? null,
            phone,
            businessHours: details.regularOpeningHours ?? null,
          });
          claudeScoringCount++;

          if (!scored) continue;

          // Upsert
          const insertData: InsertLead = {
            source: 'google_places',
            googlePlaceId: candidate.placeId,
            businessName: details.displayName,
            industry,
            phone,
            website: details.websiteUri ?? null,
            address: details.formattedAddress ?? null,
            city: extractAddressComponent(details, 'locality'),
            state: extractAddressComponent(details, 'administrative_area_level_1') || 'MD',
            zipCode: extractAddressComponent(details, 'postal_code') || zip,
            latitude: details.location?.latitude ?? null,
            longitude: details.location?.longitude ?? null,
            rating: details.rating ?? null,
            reviewCount: details.userRatingCount ?? null,
            businessHours: (details.regularOpeningHours ?? null) as any,
            leadScore: scored.leadScore,
            icpFit: scored.icpFit,
            painSignals: scored.painSignals,
            reachDifficulty: scored.reachDifficulty,
            scoringRationale: scored.scoringRationale,
            painSummary: scored.painSummary,
            rubricVersionId: scored.rubricVersionId,
            similarLeadIds: scored.similarLeadIds as any,
            inputTokens: scored.inputTokens,
            outputTokens: scored.outputTokens,
            estimatedCost: scored.estimatedCost,
            status: 'discovered',
          };

          try {
            await db.insert(leads).values(insertData);
            leadsDiscovered++;
          } catch (err) {
            console.error(`[LeadDiscovery] Insert failed for ${candidate.placeId}:`, err);
          }
        }
      }
    }

    // Final cost tally
    const placesCost = placesSearchCount * COST_PLACES_SEARCH + placesDetailsCount * COST_PLACES_DETAILS;
    const claudeCost = claudeScoringCount * 0.008; // rough flat per-lead estimate
    const totalCost = Number((placesCost + claudeCost).toFixed(2));

    await db
      .update(leadDiscoveryRuns)
      .set({
        status: 'completed',
        placesSearchCount,
        placesDetailsCount,
        claudeScoringCount,
        leadsDiscovered,
        leadsRescored,
        placesCost: Number(placesCost.toFixed(2)),
        claudeCost: Number(claudeCost.toFixed(2)),
        totalCost,
        finishedAt: new Date(),
      })
      .where(eq(leadDiscoveryRuns.id, runId));

    return {
      runId,
      status: 'completed',
      leadsDiscovered,
      leadsRescored,
      placesSearchCount,
      placesDetailsCount,
      claudeScoringCount,
      totalCost,
    };
  } catch (err: any) {
    const errMsg = err?.message || String(err);
    console.error(`[LeadDiscovery] Run ${runId} failed:`, err);
    try {
      await db
        .update(leadDiscoveryRuns)
        .set({
          status: 'failed',
          errorMessage: errMsg,
          placesSearchCount,
          placesDetailsCount,
          claudeScoringCount,
          leadsDiscovered,
          leadsRescored,
          finishedAt: new Date(),
        })
        .where(eq(leadDiscoveryRuns.id, runId));
    } catch (writeErr) {
      console.error('[LeadDiscovery] Failed to write error state:', writeErr);
    }
    return {
      runId,
      status: 'failed',
      leadsDiscovered,
      leadsRescored,
      placesSearchCount,
      placesDetailsCount,
      claudeScoringCount,
      totalCost: 0,
      errorMessage: errMsg,
    };
  }
}

function extractAddressComponent(details: googlePlaces.PlaceDetails, type: string): string | null {
  if (!Array.isArray(details.addressComponents)) return null;
  const component = details.addressComponents.find((c: any) => Array.isArray(c.types) && c.types.includes(type));
  return component?.shortText || component?.longText || null;
}
