/**
 * Scheduler guard tests — cross-instance safety.
 *
 * The contract under test: EVERY scheduler job that goes through
 * withReentryGuard is also protected by a Postgres advisory lock, so two
 * Railway instances can never run the same job concurrently. Before this
 * change, ~25 jobs (reminders, agent SMS sends, digests) had only the
 * in-memory guard — scaling to a second instance meant every customer got
 * duplicate texts.
 *
 * Also pins the lock-namespace contract: withReentryGuard locks on
 * 'xinstance:<jobName>' (NOT the bare job name) so jobs that ALSO take an
 * explicit withAdvisoryLock(jobName) inside their callback don't collide.
 * Advisory locks are session-scoped and each withAdvisoryLock call uses its
 * own pool connection — same-name nesting would silently skip the job forever.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockQuery, mockRelease, mockConnect, state } = vi.hoisted(() => {
  const state = { acquireResult: true, queries: [] as Array<{ sql: string; params: any[] }> };
  const mockQuery = vi.fn(async (sql: string, params: any[] = []) => {
    state.queries.push({ sql, params });
    if (sql.includes('pg_try_advisory_lock')) {
      return { rows: [{ acquired: state.acquireResult }] };
    }
    return { rows: [] };
  });
  const mockRelease = vi.fn();
  const mockConnect = vi.fn(async () => ({ query: mockQuery, release: mockRelease }));
  return { mockQuery, mockRelease, mockConnect, state };
});

vi.mock('../db', () => ({
  db: {},
  pool: { connect: mockConnect, query: vi.fn() },
}));

vi.mock('../storage', () => ({
  storage: {
    getAllBusinesses: vi.fn(async () => []),
  },
}));

import { withReentryGuard, withAdvisoryLock } from './schedulerService';

// Mirrors the hash in schedulerService.withAdvisoryLock so we can assert
// which lock ID a given name resolves to.
function lockIdFor(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

beforeEach(() => {
  state.acquireResult = true;
  state.queries = [];
  mockQuery.mockClear();
  mockRelease.mockClear();
  mockConnect.mockClear();
});

describe('withAdvisoryLock', () => {
  it('runs the fn and releases the lock when acquired', async () => {
    const fn = vi.fn(async () => {});
    await withAdvisoryLock('my-job', fn);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(state.queries.some(q => q.sql.includes('pg_advisory_unlock'))).toBe(true);
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });

  it('skips the fn when another instance holds the lock', async () => {
    state.acquireResult = false;
    const fn = vi.fn(async () => {});
    await withAdvisoryLock('my-job', fn);
    expect(fn).not.toHaveBeenCalled();
    // No unlock for a lock we never acquired
    expect(state.queries.some(q => q.sql.includes('pg_advisory_unlock'))).toBe(false);
    expect(mockRelease).toHaveBeenCalledTimes(1); // connection still released
  });

  it('releases the lock even when the fn throws', async () => {
    const fn = vi.fn(async () => { throw new Error('job blew up'); });
    await expect(withAdvisoryLock('my-job', fn)).rejects.toThrow('job blew up');
    expect(state.queries.some(q => q.sql.includes('pg_advisory_unlock'))).toBe(true);
    expect(mockRelease).toHaveBeenCalledTimes(1);
  });
});

describe('withReentryGuard — cross-instance safety', () => {
  it('acquires a Postgres advisory lock for every job (not just in-memory)', async () => {
    const fn = vi.fn(async () => {});
    await withReentryGuard('reminders-global', fn);
    expect(fn).toHaveBeenCalledTimes(1);
    const lockCall = state.queries.find(q => q.sql.includes('pg_try_advisory_lock'));
    expect(lockCall).toBeDefined();
  });

  it('does NOT run the job when another instance holds the lock (duplicate-SMS guard)', async () => {
    state.acquireResult = false;
    const fn = vi.fn(async () => {});
    await withReentryGuard('reminders-global', fn);
    expect(fn).not.toHaveBeenCalled();
  });

  it("locks on the 'xinstance:' namespace so nested explicit advisory locks on the same job name don't collide", async () => {
    const fn = vi.fn(async () => {});
    await withReentryGuard('overage-billing', fn);
    const lockCall = state.queries.find(q => q.sql.includes('pg_try_advisory_lock'));
    expect(lockCall!.params[0]).toBe(lockIdFor('xinstance:overage-billing'));
    expect(lockCall!.params[0]).not.toBe(lockIdFor('overage-billing'));
  });

  it('still applies the same-instance re-entry guard (overlapping run skipped without touching the DB)', async () => {
    let resolveFirst!: () => void;
    const firstRun = withReentryGuard('slow-job', () => new Promise<void>(r => { resolveFirst = r; }));
    // Give the first run a tick to register + acquire the lock
    await new Promise(r => setImmediate(r));
    const connectsAfterFirst = mockConnect.mock.calls.length;

    const second = vi.fn(async () => {});
    await withReentryGuard('slow-job', second);
    expect(second).not.toHaveBeenCalled();
    // The overlap was rejected in-memory — no extra DB connection checkout
    expect(mockConnect.mock.calls.length).toBe(connectsAfterFirst);

    resolveFirst();
    await firstRun;
  });

  it('releases the in-memory guard after completion so the next tick can run', async () => {
    const fn = vi.fn(async () => {});
    await withReentryGuard('repeat-job', fn);
    await withReentryGuard('repeat-job', fn);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('releases the in-memory guard even when the job throws', async () => {
    await expect(
      withReentryGuard('crashy-job', async () => { throw new Error('boom'); })
    ).rejects.toThrow('boom');
    const fn = vi.fn(async () => {});
    await withReentryGuard('crashy-job', fn);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
