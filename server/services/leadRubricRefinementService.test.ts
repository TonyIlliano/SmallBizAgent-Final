/**
 * leadRubricRefinementService tests
 *
 * Covers the weekly rubric refinement loop.
 * Critical paths:
 *   - Insufficient-signal skip
 *   - Successful refinement (demote old + insert new)
 *   - Graceful failure on Claude errors
 *   - Provenance fields written correctly
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

const {
  mockClaudeJson,
  mockInvalidateRubricCache,
  mockDbPositives,
  mockDbNegatives,
  mockDbRubrics,
  mockDbActiveRubricAfter,
  mockTxUpdate,
  mockTxInsert,
} = vi.hoisted(() => ({
  mockClaudeJson: vi.fn(),
  mockInvalidateRubricCache: vi.fn(),
  mockDbPositives: vi.fn(),
  mockDbNegatives: vi.fn(),
  mockDbRubrics: vi.fn(),
  mockDbActiveRubricAfter: vi.fn(),
  mockTxUpdate: vi.fn(),
  mockTxInsert: vi.fn(),
}));

vi.mock('./claudeClient', () => ({
  claudeJson: mockClaudeJson,
  claudeText: vi.fn(),
  claudeWithTools: vi.fn(),
}));

vi.mock('./leadDiscoveryService', () => ({
  invalidateRubricCache: mockInvalidateRubricCache,
}));

// db.select() is called in a sequence we control here:
//   1st call → positives query
//   2nd call → negatives query
//   3rd call → recentRubrics query (orderBy desc + limit 3)
//   4th call → active rubric after refinement (limit 1)
// Use mockSelectSequence to return values in order.
let selectSequence: any[] = [];
function nextSelect() {
  if (selectSequence.length === 0) return Promise.resolve([]);
  return Promise.resolve(selectSequence.shift());
}

vi.mock('../db', () => ({
  db: {
    select: vi.fn(() => {
      const chain: any = {
        from: vi.fn(() => chain),
        where: vi.fn(() => chain),
        orderBy: vi.fn(() => chain),
        limit: vi.fn(() => nextSelect()),
      };
      return chain;
    }),
    transaction: vi.fn(async (fn: any) => {
      const tx = {
        update: vi.fn(() => ({
          set: vi.fn(() => ({
            where: vi.fn(() => {
              mockTxUpdate();
              return Promise.resolve();
            }),
          })),
        })),
        insert: vi.fn(() => ({
          values: vi.fn((v: any) => {
            mockTxInsert(v);
            return Promise.resolve();
          }),
        })),
      };
      await fn(tx);
    }),
  },
  pool: { connect: vi.fn(), query: vi.fn(), end: vi.fn() },
}));

import { runWeeklyRubricRefinement } from './leadRubricRefinementService';

const activeRubricRow = {
  id: 1,
  version: 3,
  isActive: true,
  rubric: {
    systemPrompt: 'Old prompt',
    dimensions: [
      { key: 'icp_fit', label: 'ICP', description: 'old' },
      { key: 'pain_signals', label: 'Pain', description: 'old' },
      { key: 'reach_difficulty', label: 'Reach', description: 'old' },
    ],
    guidance: 'old guidance',
  },
  refinedFromVersion: 2,
  refinementSummary: 'previous refinement',
  createdAt: new Date(),
  activatedAt: new Date(),
  deactivatedAt: null,
};

const validClaudeOutput = {
  rubric: {
    systemPrompt: 'New prompt',
    dimensions: [
      { key: 'icp_fit', label: 'ICP', description: 'new' },
      { key: 'pain_signals', label: 'Pain', description: 'new' },
      { key: 'reach_difficulty', label: 'Reach', description: 'new' },
    ],
    guidance: 'new guidance',
  },
  refinementSummary: 'Increased weight on review count between 5-200.',
};

function makeFakePositives(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    businessName: `Pos${i}`,
    industry: 'hvac',
    rating: 4.0,
    reviewCount: 30,
    leadScore: 70,
    status: 'qualified',
    painSummary: 'good',
    scoringRationale: 'fine',
  }));
}

function makeFakeNegatives(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: 100 + i,
    businessName: `Neg${i}`,
    industry: 'hvac',
    rating: 4.5,
    reviewCount: 800,
    leadScore: 80,
    status: 'dismissed',
    painSummary: 'looked good but',
    scoringRationale: 'good fit',
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  selectSequence = [];
});

// ─── insufficient signal ─────────────────────────────────────────────────

describe('leadRubricRefinementService — skips when signals are too low', () => {
  it('skips when positive < 5', async () => {
    selectSequence = [
      makeFakePositives(3),
      makeFakeNegatives(5),
    ];
    const result = await runWeeklyRubricRefinement();
    expect(result.status).toBe('skipped_insufficient_signal');
    expect(result.positiveSignalsCount).toBe(3);
    expect(mockClaudeJson).not.toHaveBeenCalled();
  });

  it('skips when negative < 3', async () => {
    selectSequence = [
      makeFakePositives(10),
      makeFakeNegatives(1),
    ];
    const result = await runWeeklyRubricRefinement();
    expect(result.status).toBe('skipped_insufficient_signal');
    expect(result.negativeSignalsCount).toBe(1);
    expect(mockClaudeJson).not.toHaveBeenCalled();
  });
});

// ─── successful refinement ───────────────────────────────────────────────

describe('leadRubricRefinementService — refines on sufficient signal', () => {
  it('demotes active rubric and inserts new version', async () => {
    selectSequence = [
      makeFakePositives(8),         // positives
      makeFakeNegatives(4),         // negatives
      [activeRubricRow],            // recentRubrics (last 3)
      [{ id: 2, version: 4 }],      // active after refinement
    ];
    mockClaudeJson.mockResolvedValueOnce(validClaudeOutput);

    const result = await runWeeklyRubricRefinement();
    expect(result.status).toBe('refined');
    expect(result.newVersion).toBe(4); // was 3, now 4
    expect(result.positiveSignalsCount).toBe(8);
    expect(result.negativeSignalsCount).toBe(4);
    expect(mockTxUpdate).toHaveBeenCalled(); // demote
    expect(mockTxInsert).toHaveBeenCalled(); // new version
    expect(mockInvalidateRubricCache).toHaveBeenCalled();
  });

  it('writes provenance (refinedFromVersion, summary)', async () => {
    selectSequence = [
      makeFakePositives(8),
      makeFakeNegatives(4),
      [activeRubricRow],
      [{ id: 2, version: 4 }],
    ];
    mockClaudeJson.mockResolvedValueOnce(validClaudeOutput);

    await runWeeklyRubricRefinement();
    const insertCall = mockTxInsert.mock.calls[0][0];
    expect(insertCall.refinedFromVersion).toBe(3);
    expect(insertCall.positiveSignalsCount).toBe(8);
    expect(insertCall.negativeSignalsCount).toBe(4);
    expect(insertCall.refinementSummary).toContain('review count');
    expect(insertCall.version).toBe(4);
    expect(insertCall.isActive).toBe(true);
  });
});

// ─── graceful failure ────────────────────────────────────────────────────

describe('leadRubricRefinementService — failure modes', () => {
  it('returns failed status when Claude rejects', async () => {
    selectSequence = [
      makeFakePositives(8),
      makeFakeNegatives(4),
      [activeRubricRow],
    ];
    mockClaudeJson.mockRejectedValueOnce(new Error('Claude API down'));

    const result = await runWeeklyRubricRefinement();
    expect(result.status).toBe('failed');
    expect(result.errorMessage).toContain('Claude API down');
    expect(mockTxInsert).not.toHaveBeenCalled();
  });

  it('returns failed status when refined rubric missing required dimension', async () => {
    selectSequence = [
      makeFakePositives(8),
      makeFakeNegatives(4),
      [activeRubricRow],
    ];
    mockClaudeJson.mockResolvedValueOnce({
      rubric: {
        systemPrompt: 'oops',
        dimensions: [
          { key: 'icp_fit', label: '', description: '' },
          { key: 'pain_signals', label: '', description: '' },
          // missing reach_difficulty
        ],
        guidance: '',
      },
      refinementSummary: 'broken',
    });

    const result = await runWeeklyRubricRefinement();
    expect(result.status).toBe('failed');
    expect(result.errorMessage).toContain('reach_difficulty');
    expect(mockTxInsert).not.toHaveBeenCalled();
  });

  it('returns failed when no active rubric exists', async () => {
    selectSequence = [
      makeFakePositives(8),
      makeFakeNegatives(4),
      [], // no recent rubrics → no active rubric
    ];

    const result = await runWeeklyRubricRefinement();
    expect(result.status).toBe('failed');
    expect(result.errorMessage).toContain('No active rubric');
  });
});
