/**
 * callQualityService tests
 *
 * Covers the post-call grader that produces per-call AI quality scores.
 * Critical paths:
 *   - Free-plan gate (silent skip)
 *   - Short-transcript skip
 *   - Idempotency (already-scored skip)
 *   - Persists with totalScore = mean of dimensions
 *   - Flags when totalScore < 6 OR criticalFailure = true
 *   - Graceful failure on grader exceptions
 *   - dismissQualityFlag ownership check
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Required before any imports that touch db.ts
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

// ── Hoisted mocks ────────────────────────────────────────────────────────────

const { mockClaudeJson, mockIsFreePlan, mockDbInsertValues, mockDbUpdateReturning, mockDbSelectLimit } = vi.hoisted(() => ({
  mockClaudeJson: vi.fn(),
  mockIsFreePlan: vi.fn(),
  mockDbInsertValues: vi.fn(),
  mockDbUpdateReturning: vi.fn(),
  mockDbSelectLimit: vi.fn(),
}));

vi.mock('./claudeClient', () => ({
  claudeJson: mockClaudeJson,
  claudeText: vi.fn(),
  claudeWithTools: vi.fn(),
}));

vi.mock('./usageService', () => ({
  isFreePlan: mockIsFreePlan,
}));

vi.mock('../storage', () => ({
  storage: {},
}));

// db.select().from().where().limit() chain — used by idempotency check.
// db.insert().values() — used to persist a new score row.
// db.update().set().where().returning() — used by dismissQualityFlag.
vi.mock('../db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: mockDbSelectLimit,
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values: mockDbInsertValues,
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

// Import AFTER mocks are set up
import { scoreCall, getCallQualityScore, dismissQualityFlag } from './callQualityService';

// Long-enough transcript so the < 100 char gate doesn't trip in the "happy path" tests
const LONG_TRANSCRIPT =
  'Caller: Hi, I want to book a haircut for next Tuesday at 2pm with Mike. ' +
  'AI: Sure, I can help with that. Let me check Mike\'s availability for next Tuesday at 2pm. ' +
  'AI: Great, Mike has a 2pm slot open. I\'ve got you booked for a haircut with Mike next Tuesday at 2pm. ' +
  'You\'ll get a confirmation text shortly. Anything else? Caller: No thanks. AI: Perfect, see you Tuesday!';

// Helper: a "good" grader output
const goodGraderOutput = {
  dimensions: {
    greeting: { score: 9, justification: 'Warm and professional opening.' },
    identification: { score: 8, justification: 'Quickly identified the booking request.' },
    resolution: { score: 9, justification: 'Booked the appointment successfully.' },
    closing: { score: 8, justification: 'Confirmed details and ended professionally.' },
  },
  failureModes: [],
  criticalFailure: false,
};

// Helper: a "bad" grader output (would flag)
const badGraderOutput = {
  dimensions: {
    greeting: { score: 4, justification: 'Robotic.' },
    identification: { score: 3, justification: 'Misunderstood request.' },
    resolution: { score: 2, justification: 'Did not book.' },
    closing: { score: 4, justification: 'Hung up abruptly.' },
  },
  failureModes: ['didnt_book_when_should_have', 'sounded_robotic'],
  criticalFailure: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  // Default: not free, not previously scored, insert succeeds
  mockIsFreePlan.mockResolvedValue(false);
  mockDbSelectLimit.mockResolvedValue([]); // no existing score
  mockDbInsertValues.mockResolvedValue(undefined);
});

// ─── Free-plan gate ──────────────────────────────────────────────────────────

describe('callQualityService — free-plan gate', () => {
  it('skips scoring entirely when business is on free plan', async () => {
    mockIsFreePlan.mockResolvedValueOnce(true);

    await scoreCall({
      businessId: 1,
      callLogId: 100,
      transcript: LONG_TRANSCRIPT,
      industry: 'Salon',
    });

    expect(mockClaudeJson).not.toHaveBeenCalled();
    expect(mockDbInsertValues).not.toHaveBeenCalled();
  });

  it('proceeds to score when isFreePlan check throws (fail-open)', async () => {
    mockIsFreePlan.mockRejectedValueOnce(new Error('DB unavailable'));
    mockClaudeJson.mockResolvedValueOnce(goodGraderOutput);

    await scoreCall({
      businessId: 1,
      callLogId: 100,
      transcript: LONG_TRANSCRIPT,
    });

    // Failed-open: scored anyway
    expect(mockClaudeJson).toHaveBeenCalledTimes(1);
    expect(mockDbInsertValues).toHaveBeenCalledTimes(1);
  });
});

// ─── Short transcript skip ───────────────────────────────────────────────────

describe('callQualityService — short transcript skip', () => {
  it('skips when transcript is empty', async () => {
    await scoreCall({
      businessId: 1,
      callLogId: 100,
      transcript: '',
    });
    expect(mockClaudeJson).not.toHaveBeenCalled();
  });

  it('skips when transcript is under 100 chars', async () => {
    await scoreCall({
      businessId: 1,
      callLogId: 100,
      transcript: 'Caller: Hi. AI: Hello. Caller: Wrong number, sorry. Bye.',
    });
    expect(mockClaudeJson).not.toHaveBeenCalled();
  });
});

// ─── Idempotency ─────────────────────────────────────────────────────────────

describe('callQualityService — idempotency', () => {
  it('skips when call has already been scored', async () => {
    mockDbSelectLimit.mockResolvedValueOnce([{ id: 42 }]); // existing row

    await scoreCall({
      businessId: 1,
      callLogId: 100,
      transcript: LONG_TRANSCRIPT,
    });

    expect(mockClaudeJson).not.toHaveBeenCalled();
    expect(mockDbInsertValues).not.toHaveBeenCalled();
  });
});

// ─── Persist with correct totalScore ─────────────────────────────────────────

describe('callQualityService — persist + scoring math', () => {
  it('computes totalScore as mean of dimension scores', async () => {
    mockClaudeJson.mockResolvedValueOnce(goodGraderOutput);

    await scoreCall({
      businessId: 1,
      callLogId: 100,
      transcript: LONG_TRANSCRIPT,
    });

    expect(mockDbInsertValues).toHaveBeenCalledTimes(1);
    const [insertArg] = mockDbInsertValues.mock.calls[0];
    // mean of [9, 8, 9, 8] = 8.5
    expect(insertArg.totalScore).toBe(8.5);
    expect(insertArg.flagged).toBe(false);
    expect(insertArg.businessId).toBe(1);
    expect(insertArg.callLogId).toBe(100);
    expect(insertArg.rubricVersion).toBe('v1');
  });

  it('flags when totalScore < 6', async () => {
    mockClaudeJson.mockResolvedValueOnce(badGraderOutput);

    await scoreCall({
      businessId: 1,
      callLogId: 100,
      transcript: LONG_TRANSCRIPT,
    });

    const [insertArg] = mockDbInsertValues.mock.calls[0];
    // mean of [4, 3, 2, 4] = 3.25
    expect(insertArg.totalScore).toBe(3.25);
    expect(insertArg.flagged).toBe(true);
    expect(insertArg.failureModes).toEqual(['didnt_book_when_should_have', 'sounded_robotic']);
  });

  it('flags when criticalFailure = true even if totalScore is high', async () => {
    mockClaudeJson.mockResolvedValueOnce({
      ...goodGraderOutput,
      criticalFailure: true,
    });

    await scoreCall({
      businessId: 1,
      callLogId: 100,
      transcript: LONG_TRANSCRIPT,
    });

    const [insertArg] = mockDbInsertValues.mock.calls[0];
    expect(insertArg.totalScore).toBe(8.5); // still high
    expect(insertArg.flagged).toBe(true); // but flagged anyway
  });

  it('snapshots the industry on the persisted row', async () => {
    mockClaudeJson.mockResolvedValueOnce(goodGraderOutput);

    await scoreCall({
      businessId: 1,
      callLogId: 100,
      transcript: LONG_TRANSCRIPT,
      industry: 'Hair Salon',
    });

    const [insertArg] = mockDbInsertValues.mock.calls[0];
    expect(insertArg.industry).toBe('Hair Salon');
  });

  it('uses null industry when not provided', async () => {
    mockClaudeJson.mockResolvedValueOnce(goodGraderOutput);

    await scoreCall({
      businessId: 1,
      callLogId: 100,
      transcript: LONG_TRANSCRIPT,
    });

    const [insertArg] = mockDbInsertValues.mock.calls[0];
    expect(insertArg.industry).toBeNull();
  });
});

// ─── Graceful failure ────────────────────────────────────────────────────────

describe('callQualityService — graceful failure', () => {
  it('does not throw when claudeJson rejects', async () => {
    mockClaudeJson.mockRejectedValueOnce(new Error('Anthropic API down'));

    await expect(
      scoreCall({
        businessId: 1,
        callLogId: 100,
        transcript: LONG_TRANSCRIPT,
      })
    ).resolves.toBeUndefined();

    expect(mockDbInsertValues).not.toHaveBeenCalled();
  });

  it('does not persist when grader returns malformed output', async () => {
    // Missing dimensions key entirely — Zod parse will fail
    mockClaudeJson.mockResolvedValueOnce({ wrong: 'shape' });

    await scoreCall({
      businessId: 1,
      callLogId: 100,
      transcript: LONG_TRANSCRIPT,
    });

    expect(mockDbInsertValues).not.toHaveBeenCalled();
  });

  it('does not persist when grader returns no dimensions', async () => {
    mockClaudeJson.mockResolvedValueOnce({
      dimensions: {},
      failureModes: [],
      criticalFailure: false,
    });

    await scoreCall({
      businessId: 1,
      callLogId: 100,
      transcript: LONG_TRANSCRIPT,
    });

    expect(mockDbInsertValues).not.toHaveBeenCalled();
  });
});

// ─── dismissQualityFlag ───────────────────────────────────────────────────────

describe('callQualityService — dismissQualityFlag', () => {
  it('returns true when row exists and businessId matches', async () => {
    mockDbUpdateReturning.mockResolvedValueOnce([{ id: 1, businessId: 42 }]);

    const result = await dismissQualityFlag(100, 42);
    expect(result).toBe(true);
  });

  it('returns false when row exists but businessId does not match (ownership)', async () => {
    mockDbUpdateReturning.mockResolvedValueOnce([{ id: 1, businessId: 999 }]);

    const result = await dismissQualityFlag(100, 42);
    expect(result).toBe(false);
  });

  it('returns false when no row was updated', async () => {
    mockDbUpdateReturning.mockResolvedValueOnce([]);

    const result = await dismissQualityFlag(100, 42);
    expect(result).toBe(false);
  });
});

// ─── getCallQualityScore ──────────────────────────────────────────────────────

describe('callQualityService — getCallQualityScore', () => {
  it('returns the row when found', async () => {
    const row = { id: 1, callLogId: 100, totalScore: 8.5 };
    mockDbSelectLimit.mockResolvedValueOnce([row]);

    const result = await getCallQualityScore(100);
    expect(result).toEqual(row);
  });

  it('returns null when no row exists', async () => {
    mockDbSelectLimit.mockResolvedValueOnce([]);

    const result = await getCallQualityScore(100);
    expect(result).toBeNull();
  });
});
