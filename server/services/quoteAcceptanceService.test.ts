import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Tests `handleQuoteAcceptance` validation + idempotency rules without
 * touching Postgres. Drizzle calls (db.update, db.select, db.transaction,
 * db.insert) and the `storage` module are mocked.
 *
 * The HAPPY PATH (full DB transaction → quote status flip + job insert +
 * line items mirror) is covered by the existing pattern of e2e-style
 * integration tests that spin up the app + DB; here we focus on the
 * defensive behavior that's painful to exercise end-to-end:
 *
 *   - 404 on missing / cross-tenant quote
 *   - 410 on expired / declined / source-job-less quote
 *   - 400 on no-line-items quote
 *   - Idempotency: re-running on a converted quote returns the existing
 *     repair job ID without creating a duplicate
 *   - Database errors don't leak into a 500; return a structured failure
 */

// ── Mock the storage facade ─────────────────────────────────────────────
const mockGetQuoteById = vi.fn();
const mockGetJob = vi.fn();
const mockGetQuoteItems = vi.fn();

vi.mock('../storage', () => ({
  storage: {
    getQuoteById: (...args: any[]) => mockGetQuoteById(...args),
    getJob: (...args: any[]) => mockGetJob(...args),
    getQuoteItems: (...args: any[]) => mockGetQuoteItems(...args),
  },
}));

// ── Mock drizzle entrypoints ────────────────────────────────────────────
// The service uses db.select / db.transaction. We stub both so we can
// control the lookups + verify the transaction body's side effects.

let txInsertCalls: Array<{ table: string; values: any }> = [];
let txUpdateCalls: Array<{ table: string; setPayload: any }> = [];

const mockTransaction = vi.fn(async (fn: any) => {
  const tx = {
    update: (_table: any) => ({
      set: (payload: any) => ({
        where: () => {
          txUpdateCalls.push({ table: 'quotes', setPayload: payload });
          return Promise.resolve();
        },
      }),
    }),
    insert: (_table: any) => ({
      values: (vals: any) => ({
        returning: () => {
          txInsertCalls.push({ table: 'jobs', values: vals });
          return Promise.resolve([{ id: 9999 }]);
        },
      }),
    }),
  };
  return fn(tx);
});

const mockSelect = vi.fn(() => ({
  from: () => ({
    where: () => ({
      limit: () => Promise.resolve([]),
    }),
  }),
}));

vi.mock('../db', () => ({
  db: {
    select: (...args: any[]) => mockSelect(...args),
    transaction: (...args: any[]) => mockTransaction(...args),
  },
}));

vi.mock('@shared/schema', () => ({
  quotes: { id: 'quotes_id', businessId: 'quotes_businessId' },
  jobs: { id: 'jobs_id', sourceQuoteId: 'jobs_sourceQuoteId', businessId: 'jobs_businessId' },
  jobLineItems: { jobId: 'jli_jobId' },
}));

import { handleQuoteAcceptance } from './quoteAcceptanceService';

beforeEach(() => {
  mockGetQuoteById.mockReset();
  mockGetJob.mockReset();
  mockGetQuoteItems.mockReset();
  mockTransaction.mockClear();
  mockSelect.mockReset();
  mockSelect.mockImplementation(() => ({
    from: () => ({ where: () => ({ limit: () => Promise.resolve([]) }) }),
  }));
  txInsertCalls = [];
  txUpdateCalls = [];
});

function makeQuote(overrides: any = {}) {
  return {
    id: 100,
    businessId: 1,
    customerId: 50,
    jobId: 200,
    quoteNumber: 'Q-20260601-200',
    status: 'pending',
    validUntil: '2099-12-31',
    notes: 'AC compressor replacement',
    total: '1190.00',
    ...overrides,
  };
}

describe('handleQuoteAcceptance — validation guards', () => {
  it('returns quote_not_found when the quote does not exist', async () => {
    mockGetQuoteById.mockResolvedValueOnce(undefined);
    const result = await handleQuoteAcceptance(100, 1);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('quote_not_found');
    expect(result.newJobId).toBeNull();
  });

  it('returns quote_already_declined when the quote was previously declined', async () => {
    mockGetQuoteById.mockResolvedValueOnce(makeQuote({ status: 'declined' }));
    const result = await handleQuoteAcceptance(100, 1);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('quote_already_declined');
  });

  it('returns quote_expired when validUntil is in the past', async () => {
    mockGetQuoteById.mockResolvedValueOnce(
      makeQuote({ validUntil: '2020-01-01' }),
    );
    const result = await handleQuoteAcceptance(100, 1);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('quote_expired');
  });

  it('does NOT mark as expired when validUntil is far in the future', async () => {
    // Set up the lookups for a happy path so the expiry check is the only
    // potentially-blocking step.
    mockGetQuoteById.mockResolvedValueOnce(makeQuote());
    mockGetJob.mockResolvedValueOnce({
      id: 200,
      businessId: 1,
      staffId: 7,
      urgency: 'urgent',
      issueType: 'no cooling',
      symptoms: null,
      accessNotes: 'gate code 1234',
    });
    mockGetQuoteItems.mockResolvedValueOnce([
      { description: 'Compressor', quantity: 1, unitPrice: '800.00', amount: '800.00' },
    ]);
    const result = await handleQuoteAcceptance(100, 1);
    expect(result.ok).toBe(true);
  });

  it('returns quote_has_no_source_job when quote.jobId is null', async () => {
    mockGetQuoteById.mockResolvedValueOnce(makeQuote({ jobId: null }));
    const result = await handleQuoteAcceptance(100, 1);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('quote_has_no_source_job');
  });

  it('returns quote_has_no_line_items when there are zero quote items', async () => {
    mockGetQuoteById.mockResolvedValueOnce(makeQuote());
    mockGetJob.mockResolvedValueOnce({
      id: 200,
      businessId: 1,
      staffId: 7,
      urgency: null,
      issueType: null,
      symptoms: null,
      accessNotes: null,
    });
    mockGetQuoteItems.mockResolvedValueOnce([]);
    const result = await handleQuoteAcceptance(100, 1);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('quote_has_no_line_items');
  });
});

describe('handleQuoteAcceptance — idempotency', () => {
  it('returns existing repair job ID when quote.status="converted" and repair job exists', async () => {
    mockGetQuoteById.mockResolvedValueOnce(makeQuote({ status: 'converted' }));
    // findRepairJobForQuote uses db.select — return an existing row.
    mockSelect.mockImplementationOnce(() => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([{ id: 12345 }]),
        }),
      }),
    }));
    const result = await handleQuoteAcceptance(100, 1);
    expect(result.ok).toBe(true);
    expect(result.newJobId).toBe(12345);
    expect(result.quoteAlreadyConverted).toBe(true);
    // Critical: must NOT have entered the transaction (no duplicate job).
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it('does NOT skip when quote.status="converted" but no repair job exists (recovery path)', async () => {
    // Partial earlier run: quote flipped to converted but the job insert
    // failed mid-transaction. handleQuoteAcceptance should recover by
    // creating the job now.
    mockGetQuoteById.mockResolvedValueOnce(makeQuote({ status: 'converted' }));
    mockSelect.mockImplementationOnce(() => ({
      from: () => ({
        where: () => ({ limit: () => Promise.resolve([]) }),
      }),
    }));
    mockGetJob.mockResolvedValueOnce({
      id: 200,
      businessId: 1,
      staffId: 7,
      urgency: null,
      issueType: null,
      symptoms: null,
      accessNotes: null,
    });
    mockGetQuoteItems.mockResolvedValueOnce([
      { description: 'Service', quantity: 1, unitPrice: '100.00', amount: '100.00' },
    ]);
    const result = await handleQuoteAcceptance(100, 1);
    expect(result.ok).toBe(true);
    expect(result.quoteAlreadyConverted).toBe(false);
    // Recovery path runs the transaction.
    expect(mockTransaction).toHaveBeenCalledTimes(1);
  });
});

describe('handleQuoteAcceptance — happy path', () => {
  it('carries triage forward from the source job to the new repair job', async () => {
    mockGetQuoteById.mockResolvedValueOnce(makeQuote());
    mockGetJob.mockResolvedValueOnce({
      id: 200,
      businessId: 1,
      staffId: 7,
      urgency: 'emergency',
      issueType: 'no heat',
      symptoms: 'house is 50 degrees',
      accessNotes: 'gate code 1234, dog in backyard',
    });
    mockGetQuoteItems.mockResolvedValueOnce([
      { description: 'Furnace board', quantity: 1, unitPrice: '450.00', amount: '450.00' },
    ]);

    const result = await handleQuoteAcceptance(100, 1);
    expect(result.ok).toBe(true);
    expect(result.newJobId).toBe(9999);

    // Verify the inserted job carried the triage fields forward.
    const jobInsert = txInsertCalls.find((c) => c.table === 'jobs');
    expect(jobInsert?.values.urgency).toBe('emergency');
    expect(jobInsert?.values.issueType).toBe('no heat');
    expect(jobInsert?.values.symptoms).toBe('house is 50 degrees');
    expect(jobInsert?.values.accessNotes).toBe('gate code 1234, dog in backyard');
    expect(jobInsert?.values.sourceQuoteId).toBe(100);
    expect(jobInsert?.values.staffId).toBe(7); // tech preserved from diagnostic visit
    expect(jobInsert?.values.status).toBe('pending');
  });

  it('flips quote.status to "converted" in the same transaction', async () => {
    mockGetQuoteById.mockResolvedValueOnce(makeQuote());
    mockGetJob.mockResolvedValueOnce({
      id: 200,
      businessId: 1,
      staffId: null,
      urgency: null,
      issueType: null,
      symptoms: null,
      accessNotes: null,
    });
    mockGetQuoteItems.mockResolvedValueOnce([
      { description: 'Diag', quantity: 1, unitPrice: '89.00', amount: '89.00' },
    ]);

    await handleQuoteAcceptance(100, 1);
    const quoteUpdate = txUpdateCalls.find((c) => c.table === 'quotes');
    expect(quoteUpdate?.setPayload.status).toBe('converted');
  });
});

describe('handleQuoteAcceptance — failure isolation', () => {
  it('returns database_error (not a 500 throw) when the lookup throws', async () => {
    mockGetQuoteById.mockRejectedValueOnce(new Error('connection pool exhausted'));
    const result = await handleQuoteAcceptance(100, 1);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('database_error');
    expect(result.newJobId).toBeNull();
  });

  it('returns database_error when the transaction throws mid-flight', async () => {
    mockGetQuoteById.mockResolvedValueOnce(makeQuote());
    mockGetJob.mockResolvedValueOnce({
      id: 200,
      businessId: 1,
      staffId: 7,
      urgency: null,
      issueType: null,
      symptoms: null,
      accessNotes: null,
    });
    mockGetQuoteItems.mockResolvedValueOnce([
      { description: 'X', quantity: 1, unitPrice: '1.00', amount: '1.00' },
    ]);
    mockTransaction.mockImplementationOnce(async () => {
      throw new Error('serialization_failure');
    });

    const result = await handleQuoteAcceptance(100, 1);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('database_error');
  });
});
