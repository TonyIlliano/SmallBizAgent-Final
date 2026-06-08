import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock the DB BEFORE importing the module under test ──────────────────
// We capture the update payload + where clause so we can assert on them.
const mockUpdateSet = vi.fn();
const mockUpdateWhere = vi.fn();

// db.update(table).set(payload).where(condition)
// Default: resolves successfully (heal path happy case).
const buildUpdateChain = () => ({
  set: (payload: any) => {
    mockUpdateSet(payload);
    return {
      where: (cond: any) => {
        mockUpdateWhere(cond);
        return Promise.resolve();
      },
    };
  },
});

const mockUpdate = vi.fn(() => buildUpdateChain());

vi.mock('../db', () => ({
  db: {
    update: (...args: any[]) => mockUpdate(...args),
  },
}));

// Minimal stand-in for the schema tables. drizzle-orm's eq/and are imported
// for real and produce real condition objects when passed these stand-ins;
// the test doesn't care about the contents — only that the mockUpdateWhere
// spy was called.
vi.mock('@shared/schema', () => ({
  businesses: { id: 'business_id_column', stripeCustomerId: 'business_stripe_col' },
  users: { id: 'user_id_column', stripeCustomerId: 'user_stripe_col' },
}));

import {
  isStripeResourceMissing,
  clearOrphanedBusinessStripeCustomer,
  clearOrphanedUserStripeCustomer,
} from './stripeOrphanCheck';

beforeEach(() => {
  mockUpdate.mockReset();
  mockUpdate.mockImplementation(() => buildUpdateChain());
  mockUpdateSet.mockReset();
  mockUpdateWhere.mockReset();
});

// ─────────────────────────────────────────────────────────────────────────
// isStripeResourceMissing
// ─────────────────────────────────────────────────────────────────────────
describe('isStripeResourceMissing', () => {
  it('returns true when statusCode is 400 and top-level code is resource_missing', () => {
    const err = { statusCode: 400, code: 'resource_missing', message: 'No such customer: cus_dead' };
    expect(isStripeResourceMissing(err)).toBe(true);
  });

  it('returns true when statusCode is 400 and raw.code is resource_missing (wrapped error)', () => {
    const err = {
      statusCode: 400,
      raw: { code: 'resource_missing', message: 'No such customer' },
    };
    expect(isStripeResourceMissing(err)).toBe(true);
  });

  it('returns true when both top-level and raw both carry the code', () => {
    const err = {
      statusCode: 400,
      code: 'resource_missing',
      raw: { code: 'resource_missing' },
    };
    expect(isStripeResourceMissing(err)).toBe(true);
  });

  it('returns false when statusCode is 400 but code is something else (e.g., parameter_invalid)', () => {
    const err = { statusCode: 400, code: 'parameter_invalid_empty' };
    expect(isStripeResourceMissing(err)).toBe(false);
  });

  it('returns false when code is resource_missing but statusCode is not 400 (defensive)', () => {
    // Stripe always returns 400 for resource_missing in practice — but the
    // sniffer is strict on both fields to avoid false positives on any
    // re-wrapped error shape.
    expect(isStripeResourceMissing({ statusCode: 404, code: 'resource_missing' })).toBe(false);
    expect(isStripeResourceMissing({ statusCode: 500, code: 'resource_missing' })).toBe(false);
  });

  it('returns false for unrelated 400 errors (auth, rate limit, etc.)', () => {
    expect(isStripeResourceMissing({ statusCode: 400, code: 'authentication_required' })).toBe(false);
    expect(isStripeResourceMissing({ statusCode: 429, code: 'rate_limit' })).toBe(false);
  });

  it('returns false for generic Error instances (network failures)', () => {
    expect(isStripeResourceMissing(new Error('ECONNRESET'))).toBe(false);
  });

  it('returns false for null / undefined / primitives', () => {
    expect(isStripeResourceMissing(null)).toBe(false);
    expect(isStripeResourceMissing(undefined)).toBe(false);
    expect(isStripeResourceMissing('No such customer: cus_dead')).toBe(false);
    expect(isStripeResourceMissing(400)).toBe(false);
    expect(isStripeResourceMissing(false)).toBe(false);
  });

  it('returns false for empty object', () => {
    expect(isStripeResourceMissing({})).toBe(false);
  });

  it('returns false when raw is present but malformed (no code property)', () => {
    expect(isStripeResourceMissing({ statusCode: 400, raw: { message: 'oops' } })).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// clearOrphanedBusinessStripeCustomer
// ─────────────────────────────────────────────────────────────────────────
describe('clearOrphanedBusinessStripeCustomer', () => {
  it('nulls stripeCustomerId and stripeSubscriptionId on the matching business row', async () => {
    await clearOrphanedBusinessStripeCustomer(42, 'cus_dead');

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdateSet).toHaveBeenCalledTimes(1);
    const payload = mockUpdateSet.mock.calls[0][0];
    expect(payload.stripeCustomerId).toBeNull();
    expect(payload.stripeSubscriptionId).toBeNull();
    expect(payload.updatedAt).toBeInstanceOf(Date);
    expect(mockUpdateWhere).toHaveBeenCalledTimes(1);
  });

  it('is idempotent — re-running for the same orphan does not throw', async () => {
    // Simulate a no-op update (zero rows matched because we already cleared
    // it on a previous run). drizzle-orm's update().where() resolves
    // successfully regardless of how many rows matched.
    await clearOrphanedBusinessStripeCustomer(42, 'cus_dead');
    await clearOrphanedBusinessStripeCustomer(42, 'cus_dead');
    expect(mockUpdate).toHaveBeenCalledTimes(2);
    // Both calls completed without throwing — the contract.
  });

  it('is fail-soft — swallows DB errors instead of throwing (cannot break the caller)', async () => {
    // Override the chain to reject on .where()
    mockUpdate.mockImplementationOnce(() => ({
      set: (payload: any) => {
        mockUpdateSet(payload);
        return {
          where: (cond: any) => {
            mockUpdateWhere(cond);
            return Promise.reject(new Error('connection pool exhausted'));
          },
        };
      },
    }));

    // Should NOT throw. If it does, this test will fail.
    await expect(
      clearOrphanedBusinessStripeCustomer(42, 'cus_dead'),
    ).resolves.toBeUndefined();
  });

  it('is fail-soft — swallows synchronous errors thrown by drizzle setup', async () => {
    mockUpdate.mockImplementationOnce(() => {
      throw new Error('db client not initialized');
    });
    await expect(
      clearOrphanedBusinessStripeCustomer(42, 'cus_dead'),
    ).resolves.toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// clearOrphanedUserStripeCustomer
// ─────────────────────────────────────────────────────────────────────────
describe('clearOrphanedUserStripeCustomer', () => {
  it('nulls stripeCustomerId on the matching user row', async () => {
    await clearOrphanedUserStripeCustomer(7, 'cus_dead');

    expect(mockUpdate).toHaveBeenCalledTimes(1);
    expect(mockUpdateSet).toHaveBeenCalledTimes(1);
    const payload = mockUpdateSet.mock.calls[0][0];
    expect(payload.stripeCustomerId).toBeNull();
    // Users have no stripeSubscriptionId column to clear — verify we
    // didn't accidentally include one (would crash drizzle on an
    // unknown column).
    expect(payload).not.toHaveProperty('stripeSubscriptionId');
    expect(mockUpdateWhere).toHaveBeenCalledTimes(1);
  });

  it('is idempotent — re-running for the same orphan does not throw', async () => {
    await clearOrphanedUserStripeCustomer(7, 'cus_dead');
    await clearOrphanedUserStripeCustomer(7, 'cus_dead');
    expect(mockUpdate).toHaveBeenCalledTimes(2);
  });

  it('is fail-soft — swallows DB errors', async () => {
    mockUpdate.mockImplementationOnce(() => ({
      set: (payload: any) => {
        mockUpdateSet(payload);
        return {
          where: (cond: any) => {
            mockUpdateWhere(cond);
            return Promise.reject(new Error('statement_timeout'));
          },
        };
      },
    }));

    await expect(
      clearOrphanedUserStripeCustomer(7, 'cus_dead'),
    ).resolves.toBeUndefined();
  });

  it('is fail-soft — swallows synchronous errors thrown by drizzle setup', async () => {
    mockUpdate.mockImplementationOnce(() => {
      throw new Error('db client not initialized');
    });
    await expect(
      clearOrphanedUserStripeCustomer(7, 'cus_dead'),
    ).resolves.toBeUndefined();
  });
});
