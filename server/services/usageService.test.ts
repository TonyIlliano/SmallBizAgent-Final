import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock the db module ────────────────────────────────────────────────────
const { mockWhere, mockSelectChain, mockSelect } = vi.hoisted(() => {
  const mockWhere = vi.fn();
  const mockSelectChain = {
    from: vi.fn().mockReturnThis(),
    where: mockWhere,
  };
  const mockSelect = vi.fn().mockReturnValue(mockSelectChain);
  return { mockWhere, mockSelectChain, mockSelect };
});

vi.mock('../db', () => ({
  db: {
    select: mockSelect,
  },
  pool: { query: vi.fn(), connect: vi.fn() },
}));

// ── Mock drizzle-orm operators so imports don't fail ──────────────────────
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col, val) => ({ op: 'eq', value: val })),
  and: vi.fn((...args: any[]) => ({ op: 'and', conditions: args })),
  gte: vi.fn((_col, val) => ({ op: 'gte', value: val })),
  sql: vi.fn((strings: TemplateStringsArray, ...values: any[]) => strings.join('')),
}));

// ── Mock the @shared/schema module ────────────────────────────────────────
vi.mock('@shared/schema', () => ({
  callLogs: {
    businessId: 'businessId',
    callDuration: 'callDuration',
    callTime: 'callTime',
  },
  businesses: {
    id: 'id',
  },
  subscriptionPlans: {
    id: 'id',
  },
}));

// Set DATABASE_URL to prevent db.ts errors during indirect imports
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/testdb';

import { getMinutesUsedThisMonth, getUsageInfo, canBusinessAcceptCalls } from './usageService';

// ── Test suite ────────────────────────────────────────────────────────────
describe('UsageService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── getMinutesUsedThisMonth() ────────────────────────────────────────
  describe('getMinutesUsedThisMonth()', () => {
    it('calculates minutes by rounding up total seconds', async () => {
      // 150 seconds = 2.5 minutes, should round up to 3
      mockSelectChain.from.mockReturnValueOnce({
        where: vi.fn().mockResolvedValueOnce([{ totalSeconds: 150 }]),
      });

      const minutes = await getMinutesUsedThisMonth(1);
      expect(minutes).toBe(3);
    });

    it('returns 0 when no calls have been made', async () => {
      mockSelectChain.from.mockReturnValueOnce({
        where: vi.fn().mockResolvedValueOnce([{ totalSeconds: 0 }]),
      });

      const minutes = await getMinutesUsedThisMonth(1);
      expect(minutes).toBe(0);
    });

    it('returns exact minute count when seconds divide evenly', async () => {
      // 300 seconds = exactly 5 minutes
      mockSelectChain.from.mockReturnValueOnce({
        where: vi.fn().mockResolvedValueOnce([{ totalSeconds: 300 }]),
      });

      const minutes = await getMinutesUsedThisMonth(1);
      expect(minutes).toBe(5);
    });

    it('rounds up partial minutes (61 seconds = 2 minutes)', async () => {
      mockSelectChain.from.mockReturnValueOnce({
        where: vi.fn().mockResolvedValueOnce([{ totalSeconds: 61 }]),
      });

      const minutes = await getMinutesUsedThisMonth(1);
      expect(minutes).toBe(2);
    });

    it('returns 0 when call_duration column is missing (graceful degradation)', async () => {
      mockSelectChain.from.mockReturnValueOnce({
        where: vi.fn().mockRejectedValueOnce(new Error('column call_duration does not exist')),
      });

      const minutes = await getMinutesUsedThisMonth(1);
      expect(minutes).toBe(0);
    });
  });

  // ─── getUsageInfo() ───────────────────────────────────────────────────
  describe('getUsageInfo()', () => {
    it('throws when business is not found', async () => {
      mockSelectChain.from.mockReturnValueOnce({
        where: vi.fn().mockResolvedValueOnce([]),
      });

      await expect(getUsageInfo(999)).rejects.toThrow('Business not found');
    });

    it('returns trial usage info for a business in trial', async () => {
      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const business = {
        id: 1,
        name: 'Trial Biz',
        trialEndsAt: futureDate,
        subscriptionStatus: 'inactive',
        stripePlanId: null,
        subscriptionStartDate: null,
        createdAt: new Date('2026-03-01'), // After the subscription launch date
      };

      // First call: business lookup
      mockSelectChain.from.mockReturnValueOnce({
        where: vi.fn().mockResolvedValueOnce([business]),
      });

      // Second call: getMinutesUsedThisMonth -> db.select().from(callLogs).where(...)
      mockSelectChain.from.mockReturnValueOnce({
        where: vi.fn().mockResolvedValueOnce([{ totalSeconds: 600 }]), // 10 minutes
      });

      const usage = await getUsageInfo(1);

      expect(usage.planName).toBe('Free Trial');
      expect(usage.planTier).toBe('trial');
      expect(usage.isTrialActive).toBe(true);
      expect(usage.minutesIncluded).toBe(25); // TRIAL_MINUTES constant
      expect(usage.minutesUsed).toBe(10);
      expect(usage.minutesRemaining).toBe(15);
      expect(usage.canAcceptCalls).toBe(true);
    });

    it('returns founder usage info for grandfathered businesses', async () => {
      const business = {
        id: 2,
        name: 'Founder Biz',
        trialEndsAt: null,
        subscriptionStatus: 'inactive',
        stripePlanId: null,
        subscriptionStartDate: null,
        createdAt: new Date('2026-01-01'), // Before SUBSCRIPTION_LAUNCH_DATE (2026-02-23)
      };

      mockSelectChain.from.mockReturnValueOnce({
        where: vi.fn().mockResolvedValueOnce([business]),
      });

      mockSelectChain.from.mockReturnValueOnce({
        where: vi.fn().mockResolvedValueOnce([{ totalSeconds: 0 }]),
      });

      const usage = await getUsageInfo(2);

      expect(usage.planName).toBe('Founder (Unlimited)');
      expect(usage.planTier).toBe('founder');
      expect(usage.minutesIncluded).toBe(9999);
      expect(usage.canAcceptCalls).toBe(true);
      expect(usage.subscriptionStatus).toBe('founder');
      expect(usage.isTrialActive).toBe(false);
    });

    it('calculates overage for subscribed businesses exceeding included minutes', async () => {
      const business = {
        id: 3,
        name: 'Over Limit Biz',
        trialEndsAt: null,
        subscriptionStatus: 'active',
        stripePlanId: 1,
        subscriptionStartDate: new Date('2026-02-25'),
        createdAt: new Date('2026-02-25'),
      };

      const plan = {
        id: 1,
        name: 'Starter',
        maxCallMinutes: 100,
        overageRatePerMinute: 0.15,
        planTier: 'starter',
      };

      // Business lookup
      mockSelectChain.from.mockReturnValueOnce({
        where: vi.fn().mockResolvedValueOnce([business]),
      });

      // Plan lookup
      mockSelectChain.from.mockReturnValueOnce({
        where: vi.fn().mockResolvedValueOnce([plan]),
      });

      // Usage lookup: 7200 seconds = 120 minutes (20 overage)
      mockSelectChain.from.mockReturnValueOnce({
        where: vi.fn().mockResolvedValueOnce([{ totalSeconds: 7200 }]),
      });

      const usage = await getUsageInfo(3);

      expect(usage.minutesUsed).toBe(120);
      expect(usage.minutesIncluded).toBe(100);
      expect(usage.overageMinutes).toBe(20);
      expect(usage.overageRate).toBe(0.15);
      expect(usage.overageCost).toBeCloseTo(3.0); // 20 * $0.15
      expect(usage.minutesRemaining).toBe(0);
      expect(usage.percentUsed).toBe(100); // capped at 100
      expect(usage.canAcceptCalls).toBe(true); // paid subscribers always allowed
    });

    it('returns zero overage when usage is within limits', async () => {
      const business = {
        id: 4,
        name: 'Within Limits Biz',
        trialEndsAt: null,
        subscriptionStatus: 'active',
        stripePlanId: 2,
        subscriptionStartDate: new Date('2026-02-25'),
        createdAt: new Date('2026-02-25'),
      };

      const plan = {
        id: 2,
        name: 'Professional',
        maxCallMinutes: 500,
        overageRatePerMinute: 0.10,
        planTier: 'professional',
      };

      mockSelectChain.from.mockReturnValueOnce({
        where: vi.fn().mockResolvedValueOnce([business]),
      });

      mockSelectChain.from.mockReturnValueOnce({
        where: vi.fn().mockResolvedValueOnce([plan]),
      });

      // 12000 seconds = 200 minutes (within 500 limit)
      mockSelectChain.from.mockReturnValueOnce({
        where: vi.fn().mockResolvedValueOnce([{ totalSeconds: 12000 }]),
      });

      const usage = await getUsageInfo(4);

      expect(usage.minutesUsed).toBe(200);
      expect(usage.overageMinutes).toBe(0);
      expect(usage.overageCost).toBe(0);
      expect(usage.minutesRemaining).toBe(300);
      expect(usage.percentUsed).toBe(40);
    });
  });

  // ─── canBusinessAcceptCalls() ─────────────────────────────────────────
  describe('canBusinessAcceptCalls()', () => {
    it('returns allowed: false when business is not found', async () => {
      mockSelectChain.from.mockReturnValueOnce({
        where: vi.fn().mockResolvedValueOnce([]),
      });

      const result = await canBusinessAcceptCalls(999);

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Business not found');
    });

    it('blocks calls when trial limit is exceeded', async () => {
      const business = {
        id: 5,
        name: 'Exhausted Trial',
        trialEndsAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // Trial still active
        subscriptionStatus: 'inactive',
        subscriptionStartDate: null,
        createdAt: new Date('2026-03-01'), // After launch date (not a founder)
      };

      // Business lookup
      mockSelectChain.from.mockReturnValueOnce({
        where: vi.fn().mockResolvedValueOnce([business]),
      });

      // Usage query: 1500 seconds = 25 minutes = at trial limit
      mockSelectChain.from.mockReturnValueOnce({
        where: vi.fn().mockResolvedValueOnce([{ totalSeconds: 1500 }]),
      });

      const result = await canBusinessAcceptCalls(5);

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Trial limit');
      expect(result.reason).toContain('25 minutes reached');
    });

    it('allows calls for active subscribers (even with high usage)', async () => {
      const business = {
        id: 6,
        name: 'Paid Biz',
        trialEndsAt: null,
        subscriptionStatus: 'active',
        subscriptionStartDate: new Date('2026-02-25'),
        createdAt: new Date('2026-02-25'),
      };

      mockSelectChain.from.mockReturnValueOnce({
        where: vi.fn().mockResolvedValueOnce([business]),
      });

      const result = await canBusinessAcceptCalls(6);

      expect(result.allowed).toBe(true);
    });

    it('allows calls for founder accounts', async () => {
      const business = {
        id: 7,
        name: 'Founder Biz',
        trialEndsAt: null,
        subscriptionStatus: 'inactive',
        subscriptionStartDate: null,
        createdAt: new Date('2026-01-15'), // Before SUBSCRIPTION_LAUNCH_DATE
      };

      mockSelectChain.from.mockReturnValueOnce({
        where: vi.fn().mockResolvedValueOnce([business]),
      });

      const result = await canBusinessAcceptCalls(7);

      expect(result.allowed).toBe(true);
    });

    it('blocks calls when no trial and no subscription', async () => {
      const business = {
        id: 8,
        name: 'Expired Biz',
        trialEndsAt: new Date('2026-01-01'), // Trial expired in the past
        subscriptionStatus: 'inactive',
        subscriptionStartDate: null,
        createdAt: new Date('2026-03-01'),
      };

      mockSelectChain.from.mockReturnValueOnce({
        where: vi.fn().mockResolvedValueOnce([business]),
      });

      const result = await canBusinessAcceptCalls(8);

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('No active subscription or trial');
    });

    it('fails open when an internal error occurs', async () => {
      mockSelectChain.from.mockReturnValueOnce({
        where: vi.fn().mockRejectedValueOnce(new Error('unexpected db failure')),
      });

      const result = await canBusinessAcceptCalls(100);

      // Service fails open to avoid blocking legitimate calls
      expect(result.allowed).toBe(true);
    });
  });
});
