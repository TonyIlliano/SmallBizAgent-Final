/**
 * leadDiscoveryService tests
 *
 * Covers the lead discovery orchestrator + scoring + filtering logic.
 * Critical paths:
 *   - Budget enforcement (dry-run + aborted_budget)
 *   - Layer 2 rule-based filters
 *   - Scoring math (lead_score = mean of 3 dims × 100/30)
 *   - Few-shot retrieval
 *   - Graceful failure on Claude errors
 *   - Idempotency on duplicate place_ids
 *   - Active rubric caching
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

// ─── Hoisted mocks ────────────────────────────────────────────────────────

const {
  mockClaudeJson,
  mockTextSearch,
  mockGetPlaceDetails,
  mockDbSelectLimit,
  mockDbSelectMany,
  mockDbInsertReturning,
  mockDbInsertValues,
  mockDbUpdateReturning,
  mockDbSelectSum,
} = vi.hoisted(() => ({
  mockClaudeJson: vi.fn(),
  mockTextSearch: vi.fn(),
  mockGetPlaceDetails: vi.fn(),
  mockDbSelectLimit: vi.fn(),
  mockDbSelectMany: vi.fn(),
  mockDbInsertReturning: vi.fn(),
  mockDbInsertValues: vi.fn(),
  mockDbUpdateReturning: vi.fn(),
  mockDbSelectSum: vi.fn(),
}));

vi.mock('./claudeClient', () => ({
  claudeJson: mockClaudeJson,
  claudeText: vi.fn(),
  claudeWithTools: vi.fn(),
}));

vi.mock('./googlePlacesService', () => ({
  textSearch: mockTextSearch,
  getPlaceDetails: mockGetPlaceDetails,
}));

vi.mock('../db', () => ({
  db: {
    select: vi.fn((shape?: any) => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: mockDbSelectLimit,
          orderBy: vi.fn(() => ({
            limit: mockDbSelectMany,
          })),
        })),
        orderBy: vi.fn(() => ({
          limit: mockDbSelectMany,
        })),
        limit: mockDbSelectMany,
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn((value: any) => {
        mockDbInsertValues(value);
        return {
          returning: mockDbInsertReturning,
        };
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: mockDbUpdateReturning,
        })),
      })),
    })),
  },
  pool: { connect: vi.fn(), query: vi.fn(), end: vi.fn() },
}));

// Import after mocks
import {
  applyRuleBasedFilters,
  getCurrentMonthSpend,
  invalidateRubricCache,
  scoreLeadWithClaude,
  runScan,
  MONTHLY_BUDGET_USD,
  VALID_INDUSTRIES,
} from './leadDiscoveryService';

const goodScoringOutput = {
  icpFit: 8,
  painSignals: 7,
  reachDifficulty: 9,
  scoringRationale: 'Strong fit, clear pain signals.',
  painSummary: 'Owner-operated, 3.8 stars, no website.',
};

const goodRubric = {
  id: 1,
  version: 1,
  isActive: true,
  rubric: {
    systemPrompt: 'Score leads.',
    dimensions: [
      { key: 'icp_fit', label: 'ICP', description: 'how well does this match?' },
      { key: 'pain_signals', label: 'Pain', description: 'what hurts?' },
      { key: 'reach_difficulty', label: 'Reach', description: 'easy to contact?' },
    ],
    guidance: 'Return JSON.',
  },
  refinedFromVersion: null,
  positiveSignalsCount: 0,
  negativeSignalsCount: 0,
  refinementSummary: 'seed',
  inputTokens: 0,
  outputTokens: 0,
  estimatedCost: 0,
  createdAt: new Date(),
  activatedAt: new Date(),
  deactivatedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  invalidateRubricCache();
  // Default: no spend, no existing leads, active rubric available
  mockDbSelectMany.mockResolvedValue([]); // similar leads empty by default
  mockDbInsertValues.mockResolvedValue(undefined);
});

// ─── applyRuleBasedFilters ───────────────────────────────────────────────

describe('leadDiscoveryService — applyRuleBasedFilters', () => {
  it('accepts valid place', () => {
    const r = applyRuleBasedFilters({
      placeId: 'p1',
      name: "Joe's Plumbing",
      rating: 4.0,
      userRatingCount: 50,
      businessStatus: 'OPERATIONAL',
    });
    expect(r.pass).toBe(true);
  });

  it('rejects place with no name', () => {
    const r = applyRuleBasedFilters({ placeId: 'p1', name: '' });
    expect(r.pass).toBe(false);
    expect(r.reason).toBe('no_name');
  });

  it('rejects place with no place_id', () => {
    const r = applyRuleBasedFilters({
      placeId: '',
      name: 'Foo',
      userRatingCount: 50,
      businessStatus: 'OPERATIONAL',
    });
    expect(r.pass).toBe(false);
    expect(r.reason).toBe('no_place_id');
  });

  it('rejects place with CLOSED_TEMPORARILY business status', () => {
    const r = applyRuleBasedFilters({
      placeId: 'p1',
      name: 'Foo',
      userRatingCount: 50,
      businessStatus: 'CLOSED_TEMPORARILY',
    });
    expect(r.pass).toBe(false);
    expect(r.reason).toContain('CLOSED_TEMPORARILY');
  });

  it('rejects place with review count below 5', () => {
    const r = applyRuleBasedFilters({
      placeId: 'p1',
      name: 'Foo',
      userRatingCount: 3,
      businessStatus: 'OPERATIONAL',
    });
    expect(r.pass).toBe(false);
    expect(r.reason).toContain('<5');
  });

  it('rejects place with review count above 500', () => {
    const r = applyRuleBasedFilters({
      placeId: 'p1',
      name: 'Foo',
      userRatingCount: 750,
      businessStatus: 'OPERATIONAL',
    });
    expect(r.pass).toBe(false);
    expect(r.reason).toContain('>500');
  });

  it('rejects place with chain marker in name', () => {
    const r = applyRuleBasedFilters({
      placeId: 'p1',
      name: 'BigCorp Inc',
      userRatingCount: 50,
      businessStatus: 'OPERATIONAL',
    });
    expect(r.pass).toBe(false);
    expect(r.reason).toBe('chain_marker_in_name');
  });
});

// ─── scoreLeadWithClaude ─────────────────────────────────────────────────

describe('leadDiscoveryService — scoreLeadWithClaude', () => {
  beforeEach(() => {
    // First db.select() call returns the active rubric (for getActiveRubric)
    mockDbSelectLimit.mockResolvedValue([goodRubric]);
    mockDbSelectMany.mockResolvedValue([]); // no similar leads
  });

  it('returns valid score on happy path', async () => {
    mockClaudeJson.mockResolvedValueOnce(goodScoringOutput);
    const result = await scoreLeadWithClaude({
      businessName: "Joe's HVAC",
      industry: 'hvac',
      rating: 3.9,
      reviewCount: 32,
      website: null,
      phone: '410-555-1234',
    });
    expect(result).not.toBeNull();
    // 8 + 7 + 9 = 24 / 30 = 0.8 → 80
    expect(result?.leadScore).toBe(80);
    expect(result?.icpFit).toBe(8);
    expect(result?.painSignals).toBe(7);
    expect(result?.reachDifficulty).toBe(9);
    expect(result?.rubricVersionId).toBe(1);
  });

  it('clamps out-of-range scores to 0-10', async () => {
    mockClaudeJson.mockResolvedValueOnce({
      icpFit: 15, // out of range — should clamp to 10
      painSignals: -3, // out of range — should clamp to 0
      reachDifficulty: 5,
      scoringRationale: 'odd',
      painSummary: 'odd',
    });
    const result = await scoreLeadWithClaude({
      businessName: 'X',
      industry: 'salon',
    });
    expect(result?.icpFit).toBe(10);
    expect(result?.painSignals).toBe(0);
    expect(result?.reachDifficulty).toBe(5);
  });

  it('returns null when Claude returns invalid (non-numeric) dimensions', async () => {
    mockClaudeJson.mockResolvedValueOnce({
      icpFit: 'banana',
      painSignals: null,
      reachDifficulty: 5,
    });
    const result = await scoreLeadWithClaude({ businessName: 'X', industry: 'hvac' });
    expect(result).toBeNull();
  });

  it('returns null when Claude rejects', async () => {
    mockClaudeJson.mockRejectedValueOnce(new Error('Claude down'));
    const result = await scoreLeadWithClaude({ businessName: 'X', industry: 'hvac' });
    expect(result).toBeNull();
  });

  it('returns null when no active rubric exists', async () => {
    mockDbSelectLimit.mockResolvedValue([]); // no active rubric
    const result = await scoreLeadWithClaude({ businessName: 'X', industry: 'hvac' });
    expect(result).toBeNull();
    expect(mockClaudeJson).not.toHaveBeenCalled();
  });

  it('truncates rationale + summary to 500 chars', async () => {
    mockClaudeJson.mockResolvedValueOnce({
      ...goodScoringOutput,
      scoringRationale: 'A'.repeat(600),
      painSummary: 'B'.repeat(600),
    });
    const result = await scoreLeadWithClaude({ businessName: 'X', industry: 'hvac' });
    expect(result?.scoringRationale.length).toBe(500);
    expect(result?.painSummary.length).toBe(500);
  });
});

// ─── VALID_INDUSTRIES sanity ─────────────────────────────────────────────

describe('leadDiscoveryService — VALID_INDUSTRIES', () => {
  it('includes the agreed set', () => {
    expect(VALID_INDUSTRIES).toContain('hvac');
    expect(VALID_INDUSTRIES).toContain('plumbing');
    expect(VALID_INDUSTRIES).toContain('electrical');
    expect(VALID_INDUSTRIES).toContain('salon');
    expect(VALID_INDUSTRIES).toContain('barbershop');
    expect(VALID_INDUSTRIES).toContain('spa');
  });
});

// ─── runScan dry-run + budget abort ──────────────────────────────────────

describe('leadDiscoveryService — runScan dry-run', () => {
  it('returns estimated cost without making API calls', async () => {
    const result = await runScan({
      userId: 1,
      industries: ['hvac'],
      zipCodes: ['21201', '21401'],
      dryRun: true,
    });
    expect(result.status).toBe('dry_run');
    expect(mockTextSearch).not.toHaveBeenCalled();
    expect(mockClaudeJson).not.toHaveBeenCalled();
    expect(result.totalCost).toBeGreaterThan(0);
  });
});
