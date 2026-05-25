/**
 * runGpsRetentionSweep — direct tests against a stateful mock storage.
 *
 * Unlike the route tests (which mock storage as bare vi.fn() and assert call
 * shape), this suite mocks storage with an in-memory ping/business store so
 * the test asserts ACTUAL deletion behavior: which pings get swept, which
 * survive, which businesses are skipped, what happens on partial failure.
 *
 * Why this matters: pings accumulating beyond retention is a real liability
 * + storage cost issue. The sweeper is the only safety net.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// In-memory store for the mock storage layer
interface StoreBusiness {
  id: number;
  gpsTrackingEnabled: boolean;
  gpsRetentionHours: number | null;
}
interface StorePing {
  id: number;
  businessId: number;
  receivedAt: Date;
}

const { store, mockGetAllBusinesses, mockDeleteExpiredPings, mockDeleteExpiredLinks } = vi.hoisted(() => {
  const store: { businesses: any[]; pings: any[]; linksDeleted: number } = {
    businesses: [],
    pings: [],
    linksDeleted: 0,
  };
  return {
    store,
    mockGetAllBusinesses: vi.fn(async () => store.businesses),
    mockDeleteExpiredPings: vi.fn(async (businessId: number, cutoff: Date) => {
      const before = store.pings.length;
      store.pings = store.pings.filter(
        (p) => !(p.businessId === businessId && p.receivedAt < cutoff)
      );
      return before - store.pings.length;
    }),
    mockDeleteExpiredLinks: vi.fn(async () => {
      const n = store.linksDeleted;
      store.linksDeleted = 0;
      return n;
    }),
  };
});

vi.mock('../storage', () => ({
  storage: {
    getAllBusinesses: mockGetAllBusinesses,
    deleteExpiredPings: mockDeleteExpiredPings,
    deleteExpiredLinks: mockDeleteExpiredLinks,
  },
}));

// schedulerService transitively imports server/db which throws if
// DATABASE_URL isn't set. Stub it so the import resolves.
vi.mock('../db', () => ({
  db: {},
  pool: { query: vi.fn() },
}));

import { runGpsRetentionSweep } from './schedulerService';

// ── Helpers ────────────────────────────────────────────────────────────

function hoursAgo(h: number): Date {
  return new Date(Date.now() - h * 60 * 60 * 1000);
}

function setupBusinessesAndPings(
  businesses: Partial<StoreBusiness>[],
  pings: Partial<StorePing>[]
) {
  store.businesses = businesses.map((b, i) => ({
    id: b.id ?? i + 1,
    gpsTrackingEnabled: b.gpsTrackingEnabled ?? true,
    gpsRetentionHours: b.gpsRetentionHours ?? 24,
    ...b,
  }));
  store.pings = pings.map((p, i) => ({
    id: p.id ?? i + 1,
    businessId: p.businessId ?? 1,
    receivedAt: p.receivedAt ?? new Date(),
    ...p,
  }));
  store.linksDeleted = 0;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Re-bind mock impls after clearAllMocks (clearAllMocks resets impls too in vitest 4)
  mockGetAllBusinesses.mockImplementation(async () => store.businesses);
  mockDeleteExpiredPings.mockImplementation(async (businessId: number, cutoff: Date) => {
    const before = store.pings.length;
    store.pings = store.pings.filter(
      (p) => !(p.businessId === businessId && p.receivedAt < cutoff)
    );
    return before - store.pings.length;
  });
  mockDeleteExpiredLinks.mockImplementation(async () => {
    const n = store.linksDeleted;
    store.linksDeleted = 0;
    return n;
  });
});

// ═══════════════════════════════════════════════════════════════════════════

describe('runGpsRetentionSweep — core behavior', () => {
  it('deletes pings older than 24h retention but keeps younger ones', async () => {
    setupBusinessesAndPings(
      [{ id: 1, gpsRetentionHours: 24 }],
      [
        { id: 1, businessId: 1, receivedAt: hoursAgo(25) }, // SHOULD delete
        { id: 2, businessId: 1, receivedAt: hoursAgo(48) }, // SHOULD delete
        { id: 3, businessId: 1, receivedAt: hoursAgo(2) },  // KEEP
        { id: 4, businessId: 1, receivedAt: hoursAgo(0.5) }, // KEEP
      ]
    );

    await runGpsRetentionSweep();

    expect(store.pings.map(p => p.id).sort()).toEqual([3, 4]);
    expect(mockDeleteExpiredPings).toHaveBeenCalledTimes(1);
    expect(mockDeleteExpiredPings).toHaveBeenCalledWith(1, expect.any(Date));
  });

  it('honors per-business retention — 24h biz and 168h biz swept independently', async () => {
    setupBusinessesAndPings(
      [
        { id: 1, gpsRetentionHours: 24 },   // 1-day retention
        { id: 2, gpsRetentionHours: 168 },  // 7-day retention (Pro tier)
      ],
      [
        { id: 1, businessId: 1, receivedAt: hoursAgo(48) },   // biz 1, 2d old → DELETE
        { id: 2, businessId: 2, receivedAt: hoursAgo(48) },   // biz 2, 2d old → KEEP (within 7d)
        { id: 3, businessId: 2, receivedAt: hoursAgo(200) },  // biz 2, 8d old → DELETE
        { id: 4, businessId: 1, receivedAt: hoursAgo(0.5) },  // biz 1, fresh → KEEP
      ]
    );

    await runGpsRetentionSweep();

    expect(store.pings.map(p => p.id).sort()).toEqual([2, 4]);
    expect(mockDeleteExpiredPings).toHaveBeenCalledTimes(2);
    // Biz 1 called with cutoff ~24h ago, biz 2 called with cutoff ~168h ago
    const calls = mockDeleteExpiredPings.mock.calls;
    const cutoffForBiz1 = calls.find(c => c[0] === 1)?.[1] as Date;
    const cutoffForBiz2 = calls.find(c => c[0] === 2)?.[1] as Date;
    expect(cutoffForBiz1.getTime()).toBeGreaterThan(Date.now() - 25 * 3600 * 1000);
    expect(cutoffForBiz1.getTime()).toBeLessThan(Date.now() - 23 * 3600 * 1000);
    expect(cutoffForBiz2.getTime()).toBeGreaterThan(Date.now() - 169 * 3600 * 1000);
    expect(cutoffForBiz2.getTime()).toBeLessThan(Date.now() - 167 * 3600 * 1000);
  });

  it('skips businesses with gpsTrackingEnabled = false (their pings remain)', async () => {
    setupBusinessesAndPings(
      [
        { id: 1, gpsTrackingEnabled: false, gpsRetentionHours: 24 },
        { id: 2, gpsTrackingEnabled: true, gpsRetentionHours: 24 },
      ],
      [
        { id: 1, businessId: 1, receivedAt: hoursAgo(48) }, // KEEP (biz disabled, not swept)
        { id: 2, businessId: 2, receivedAt: hoursAgo(48) }, // DELETE
      ]
    );

    await runGpsRetentionSweep();

    expect(store.pings.map(p => p.id)).toEqual([1]);
    expect(mockDeleteExpiredPings).toHaveBeenCalledTimes(1);
    expect(mockDeleteExpiredPings).toHaveBeenCalledWith(2, expect.any(Date));
  });

  it('applies 1-hour floor even when retention is misconfigured to 0', async () => {
    // Owner somehow saved gpsRetentionHours = 0 (Zod should prevent this but
    // defense-in-depth: the sweeper should NEVER delete pings <1h old).
    setupBusinessesAndPings(
      [{ id: 1, gpsRetentionHours: 0 }],
      [
        { id: 1, businessId: 1, receivedAt: hoursAgo(0.5) }, // 30 min old — KEEP (within 1h floor)
        { id: 2, businessId: 1, receivedAt: hoursAgo(2) },   // 2h old — DELETE
      ]
    );

    await runGpsRetentionSweep();

    expect(store.pings.map(p => p.id)).toEqual([1]);
    const cutoff = mockDeleteExpiredPings.mock.calls[0][1] as Date;
    // Cutoff should be ~1h ago, NOT now (which would be retention=0)
    expect(cutoff.getTime()).toBeGreaterThan(Date.now() - 70 * 60 * 1000);
    expect(cutoff.getTime()).toBeLessThan(Date.now() - 55 * 60 * 1000);
  });

  it('handles null gpsRetentionHours by defaulting to 24h', async () => {
    setupBusinessesAndPings(
      [{ id: 1, gpsRetentionHours: null }],
      [
        { id: 1, businessId: 1, receivedAt: hoursAgo(25) }, // DELETE (24h default kicks in)
        { id: 2, businessId: 1, receivedAt: hoursAgo(2) },  // KEEP
      ]
    );

    await runGpsRetentionSweep();

    expect(store.pings.map(p => p.id)).toEqual([2]);
  });

  it('continues sweeping other businesses when one throws (per-biz try/catch)', async () => {
    setupBusinessesAndPings(
      [
        { id: 1, gpsRetentionHours: 24 },
        { id: 2, gpsRetentionHours: 24 },  // this one will throw
        { id: 3, gpsRetentionHours: 24 },
      ],
      [
        { id: 1, businessId: 1, receivedAt: hoursAgo(48) },
        { id: 2, businessId: 2, receivedAt: hoursAgo(48) },
        { id: 3, businessId: 3, receivedAt: hoursAgo(48) },
      ]
    );

    // Make biz 2 throw, others use real impl
    mockDeleteExpiredPings.mockImplementation(async (businessId: number, cutoff: Date) => {
      if (businessId === 2) throw new Error('Simulated DB hiccup on business 2');
      const before = store.pings.length;
      store.pings = store.pings.filter(
        (p) => !(p.businessId === businessId && p.receivedAt < cutoff)
      );
      return before - store.pings.length;
    });

    await runGpsRetentionSweep();

    // biz 1 + biz 3 pings deleted; biz 2's ping survives because that call threw
    expect(store.pings.map(p => p.id).sort()).toEqual([2]);
    expect(mockDeleteExpiredPings).toHaveBeenCalledTimes(3);
  });

  it('always calls deleteExpiredLinks (global cleanup) even when no businesses', async () => {
    setupBusinessesAndPings([], []);
    store.linksDeleted = 5; // simulate 5 expired/revoked links

    await runGpsRetentionSweep();

    expect(mockDeleteExpiredLinks).toHaveBeenCalledOnce();
    expect(store.linksDeleted).toBe(0); // mock drained the counter
    expect(mockDeleteExpiredPings).not.toHaveBeenCalled();
  });

  it('still calls deleteExpiredLinks even if a per-business sweep errored', async () => {
    setupBusinessesAndPings(
      [{ id: 1, gpsRetentionHours: 24 }],
      [{ id: 1, businessId: 1, receivedAt: hoursAgo(48) }]
    );
    store.linksDeleted = 3;
    mockDeleteExpiredPings.mockRejectedValueOnce(new Error('biz sweep failed'));

    await runGpsRetentionSweep();

    expect(mockDeleteExpiredLinks).toHaveBeenCalledOnce();
  });

  it('does not throw when storage.getAllBusinesses itself throws (outer try)', async () => {
    mockGetAllBusinesses.mockRejectedValueOnce(new Error('Catastrophic DB failure'));

    // Should NOT throw — outer try wraps the whole sweep
    await expect(runGpsRetentionSweep()).resolves.toBeUndefined();
    expect(mockDeleteExpiredPings).not.toHaveBeenCalled();
    expect(mockDeleteExpiredLinks).not.toHaveBeenCalled();
  });

  it('continues to deleteExpiredLinks even if that itself throws', async () => {
    setupBusinessesAndPings([], []);
    mockDeleteExpiredLinks.mockRejectedValueOnce(new Error('Links delete failed'));

    // Should not throw — error is caught inside the inner try
    await expect(runGpsRetentionSweep()).resolves.toBeUndefined();
  });

  it('TENANT ISOLATION: deleteExpiredPings receives businessId, never deletes across tenants', async () => {
    setupBusinessesAndPings(
      [
        { id: 1, gpsRetentionHours: 24 },
        { id: 2, gpsRetentionHours: 24 },
      ],
      [
        { id: 1, businessId: 1, receivedAt: hoursAgo(48) },
        { id: 2, businessId: 2, receivedAt: hoursAgo(48) },
      ]
    );

    await runGpsRetentionSweep();

    // Each call MUST be scoped to its own businessId
    const calls = mockDeleteExpiredPings.mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls.map(c => c[0]).sort()).toEqual([1, 2]);
    // Our in-memory impl respects businessId — both pings deleted because both
    // are 48h old in their own businesses
    expect(store.pings).toHaveLength(0);
  });
});
