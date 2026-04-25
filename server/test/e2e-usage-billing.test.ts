import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import express from 'express';
import supertest from 'supertest';

// ────────────────────────────────────────────────────────
// Module mocks — must be declared before any app imports
// ────────────────────────────────────────────────────────

const { mockGetUsageInfo, mockGetUsageProjection } = vi.hoisted(() => {
  return {
    mockGetUsageInfo: vi.fn(),
    mockGetUsageProjection: vi.fn(),
  };
});

vi.mock('../services/usageService', () => ({
  getUsageInfo: mockGetUsageInfo,
  getUsageProjection: mockGetUsageProjection,
  getMinutesUsedThisMonth: vi.fn().mockResolvedValue(0),
  canBusinessAcceptCalls: vi.fn().mockResolvedValue({ allowed: true }),
}));

// Track which user is "authenticated"
let currentTestUser: any = null;

vi.mock('../middleware/auth', () => ({
  isAuthenticated: vi.fn((req: any, res: any, next: any) => {
    if (!currentTestUser) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    req.user = currentTestUser;
    req.isAuthenticated = () => true;
    next();
  }),
  isAdmin: vi.fn((req: any, res: any, next: any) => {
    if (!currentTestUser) {
      return res.status(401).json({ error: 'Not authenticated' });
    }
    if (currentTestUser.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    req.user = currentTestUser;
    req.isAuthenticated = () => true;
    next();
  }),
  checkBelongsToBusinessAsync: vi.fn((_user: any, _businessId: number) => {
    // Default: user belongs to business 1
    return Promise.resolve(true);
  }),
}));

vi.mock('../db', () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
  },
  pool: {
    connect: vi.fn().mockResolvedValue({ query: vi.fn(), release: vi.fn() }),
    query: vi.fn().mockResolvedValue({ rows: [] }),
    end: vi.fn(),
  },
}));

vi.mock('../storage', () => ({
  storage: {
    getBusiness: vi.fn(),
    updateBusiness: vi.fn(),
    getUser: vi.fn(),
    sessionStore: null,
  },
}));

// Mock Stripe module
vi.mock('stripe', () => {
  return {
    default: class MockStripe {
      webhooks = { constructEvent: vi.fn() };
      subscriptions = { retrieve: vi.fn() };
      checkout = { sessions: { create: vi.fn() } };
      billingPortal = { sessions: { create: vi.fn() } };
      customers = { create: vi.fn(), retrieve: vi.fn() };
      prices = { list: vi.fn().mockResolvedValue({ data: [] }) };
    },
  };
});

vi.mock('../services/subscriptionService', () => ({
  subscriptionService: {
    handleWebhookEvent: vi.fn(),
    getPlans: vi.fn().mockResolvedValue([]),
    createSubscription: vi.fn(),
    cancelSubscription: vi.fn(),
    createBillingPortalSession: vi.fn(),
    changePlan: vi.fn(),
  },
}));

vi.mock('../services/overageBillingService', () => ({
  getOverageHistory: vi.fn().mockResolvedValue([]),
}));

// ────────────────────────────────────────────────────────
// Import routes after mocks
// ────────────────────────────────────────────────────────

process.env.STRIPE_SECRET_KEY = 'sk_test_fake';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';

import subscriptionRoutes from '../routes/subscriptionRoutes';

// ────────────────────────────────────────────────────────
// Test helpers
// ────────────────────────────────────────────────────────

let app: express.Express;

function makeUsageInfo(overrides: Record<string, any> = {}) {
  return {
    minutesUsed: 45,
    minutesIncluded: 150,
    minutesRemaining: 105,
    overageMinutes: 0,
    overageRate: 0.20,
    overageCost: 0,
    percentUsed: 30,
    planName: 'Starter',
    planTier: 'starter',
    isTrialActive: false,
    trialEndsAt: null,
    subscriptionStatus: 'active',
    canAcceptCalls: true,
    ...overrides,
  };
}

function makeProjection(overrides: Record<string, any> = {}) {
  return {
    projectedMinutesAtPeriodEnd: 120,
    projectedOverageMinutes: 0,
    projectedOverageCost: 0,
    daysRemainingInPeriod: 15,
    averageDailyMinutes: 3,
    billingPeriodStart: '2026-04-01',
    billingPeriodEnd: '2026-04-30',
    ...overrides,
  };
}

// ────────────────────────────────────────────────────────
// Setup
// ────────────────────────────────────────────────────────

beforeAll(() => {
  app = express();
  app.use(express.json());
  app.use('/api/subscription', subscriptionRoutes);
});

beforeEach(() => {
  vi.clearAllMocks();
  currentTestUser = {
    id: 1,
    username: 'testuser',
    email: 'test@example.com',
    role: 'user',
    businessId: 1,
  };
});

// ════════════════════════════════════════════════════════
// TEST SUITES
// ════════════════════════════════════════════════════════

// ────────────────────────────────────────────────────────
// 1. GET /api/subscription/usage/:businessId
// ────────────────────────────────────────────────────────

describe('GET /api/subscription/usage/:businessId', () => {
  it('returns usage info for authenticated business', async () => {
    const usage = makeUsageInfo();
    mockGetUsageInfo.mockResolvedValue(usage);

    const res = await supertest(app).get('/api/subscription/usage/1');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('minutesUsed', 45);
    expect(res.body).toHaveProperty('minutesIncluded', 150);
    expect(res.body).toHaveProperty('minutesRemaining', 105);
    expect(res.body).toHaveProperty('overageMinutes', 0);
    expect(res.body).toHaveProperty('overageRate', 0.20);
    expect(res.body).toHaveProperty('planName', 'Starter');
    expect(res.body).toHaveProperty('planTier', 'starter');
    expect(res.body).toHaveProperty('canAcceptCalls', true);
    expect(mockGetUsageInfo).toHaveBeenCalledWith(1);
  });

  it('returns 401 for unauthenticated request', async () => {
    currentTestUser = null;

    const res = await supertest(app).get('/api/subscription/usage/1');

    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/not authenticated/i);
    expect(mockGetUsageInfo).not.toHaveBeenCalled();
  });

  it('returns trial minutes capped at 25 for trial business', async () => {
    const trialUsage = makeUsageInfo({
      minutesUsed: 10,
      minutesIncluded: 25, // Trial cap
      minutesRemaining: 15,
      planName: 'Free Trial',
      planTier: 'trial',
      isTrialActive: true,
      trialEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      subscriptionStatus: 'trialing',
    });
    mockGetUsageInfo.mockResolvedValue(trialUsage);

    const res = await supertest(app).get('/api/subscription/usage/1');

    expect(res.status).toBe(200);
    expect(res.body.minutesIncluded).toBe(25);
    expect(res.body.planName).toBe('Free Trial');
    expect(res.body.isTrialActive).toBe(true);
  });

  it('returns unlimited minutes for founder account', async () => {
    const founderUsage = makeUsageInfo({
      minutesUsed: 500,
      minutesIncluded: 9999,
      minutesRemaining: 9499,
      overageMinutes: 0,
      planName: 'Founder (Unlimited)',
      planTier: 'founder',
      subscriptionStatus: 'founder',
      canAcceptCalls: true,
    });
    mockGetUsageInfo.mockResolvedValue(founderUsage);

    const res = await supertest(app).get('/api/subscription/usage/1');

    expect(res.status).toBe(200);
    expect(res.body.minutesIncluded).toBe(9999);
    expect(res.body.planTier).toBe('founder');
    expect(res.body.overageMinutes).toBe(0);
    expect(res.body.canAcceptCalls).toBe(true);
  });

  it('returns canAcceptCalls: false for grace period', async () => {
    const gracePeriodUsage = makeUsageInfo({
      minutesUsed: 0,
      minutesIncluded: 0,
      minutesRemaining: 0,
      planName: 'Grace Period (AI Paused)',
      planTier: 'grace_period',
      subscriptionStatus: 'grace_period',
      canAcceptCalls: false,
    });
    mockGetUsageInfo.mockResolvedValue(gracePeriodUsage);

    const res = await supertest(app).get('/api/subscription/usage/1');

    expect(res.status).toBe(200);
    expect(res.body.planTier).toBe('grace_period');
    expect(res.body.canAcceptCalls).toBe(false);
    expect(res.body.planName).toBe('Grace Period (AI Paused)');
  });

  it('calculates overage correctly when over plan limit', async () => {
    const overageUsage = makeUsageInfo({
      minutesUsed: 180,
      minutesIncluded: 150,
      minutesRemaining: 0,
      overageMinutes: 30,
      overageRate: 0.20,
      overageCost: 6.0, // 30 * $0.20
      percentUsed: 100,
    });
    mockGetUsageInfo.mockResolvedValue(overageUsage);

    const res = await supertest(app).get('/api/subscription/usage/1');

    expect(res.status).toBe(200);
    expect(res.body.overageMinutes).toBe(30);
    expect(res.body.overageCost).toBe(6.0);
    expect(res.body.minutesRemaining).toBe(0);
    expect(res.body.percentUsed).toBe(100);
  });

  it('returns 403 when user does not belong to requested business', async () => {
    const { checkBelongsToBusinessAsync } = await import('../middleware/auth');
    (checkBelongsToBusinessAsync as any).mockResolvedValueOnce(false);

    const res = await supertest(app).get('/api/subscription/usage/999');

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/access denied/i);
    expect(mockGetUsageInfo).not.toHaveBeenCalled();
  });

  it('handles service errors gracefully', async () => {
    mockGetUsageInfo.mockRejectedValue(new Error('Business not found'));

    const res = await supertest(app).get('/api/subscription/usage/1');

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/business not found/i);
  });

  it('returns active subscription info for Growth plan', async () => {
    const growthUsage = makeUsageInfo({
      minutesUsed: 100,
      minutesIncluded: 300,
      minutesRemaining: 200,
      planName: 'Growth',
      planTier: 'growth',
      subscriptionStatus: 'active',
    });
    mockGetUsageInfo.mockResolvedValue(growthUsage);

    const res = await supertest(app).get('/api/subscription/usage/1');

    expect(res.status).toBe(200);
    expect(res.body.planName).toBe('Growth');
    expect(res.body.planTier).toBe('growth');
    expect(res.body.minutesIncluded).toBe(300);
  });

  it('returns correct data for Pro plan with high usage', async () => {
    const proUsage = makeUsageInfo({
      minutesUsed: 490,
      minutesIncluded: 500,
      minutesRemaining: 10,
      overageMinutes: 0,
      planName: 'Pro',
      planTier: 'pro',
      percentUsed: 98,
    });
    mockGetUsageInfo.mockResolvedValue(proUsage);

    const res = await supertest(app).get('/api/subscription/usage/1');

    expect(res.status).toBe(200);
    expect(res.body.percentUsed).toBe(98);
    expect(res.body.minutesRemaining).toBe(10);
    expect(res.body.overageMinutes).toBe(0);
  });
});

// ────────────────────────────────────────────────────────
// 2. GET /api/subscription/overage-history/:businessId
// ────────────────────────────────────────────────────────

describe('GET /api/subscription/overage-history/:businessId', () => {
  it('returns overage history for authenticated business', async () => {
    const res = await supertest(app).get('/api/subscription/overage-history/1');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('charges');
    expect(Array.isArray(res.body.charges)).toBe(true);
  });

  it('returns 401 for unauthenticated request', async () => {
    currentTestUser = null;

    const res = await supertest(app).get('/api/subscription/overage-history/1');

    expect(res.status).toBe(401);
  });
});
