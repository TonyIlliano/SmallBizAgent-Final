import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock DB BEFORE importing the middleware under test
const mockSelect = vi.fn();

vi.mock('../db', () => ({
  db: {
    select: (...args: any[]) => mockSelect(...args),
  },
}));

vi.mock('@shared/schema', () => ({
  businesses: { id: 'id' },
}));

const mockGetUsageInfo = vi.fn();
vi.mock('../services/usageService', () => ({
  getUsageInfo: (...args: any[]) => mockGetUsageInfo(...args),
}));

import { requireGpsPlan, requireGpsPlanForSettings, getGpsRetentionMaxHours } from './gpsPlanGate';

// ── Helpers ──
function mockReq(overrides: any = {}) {
  return {
    user: { id: 1, businessId: 1, role: 'owner' },
    ...overrides,
  } as any;
}
function mockRes() {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}
const mockNext = vi.fn();

function mockBusiness(overrides: any = {}) {
  return {
    id: 1,
    industry: 'HVAC',
    gpsTrackingEnabled: true,
    gpsBetaApproved: true, // default to approved; opt out per test
    ...overrides,
  };
}

function stubBusinessLookup(business: any) {
  mockSelect.mockReturnValue({
    from: () => ({
      where: () => Promise.resolve(business ? [business] : []),
    }),
  });
}

describe('getGpsRetentionMaxHours', () => {
  it('returns 168 (7 days) for pro tier', () => {
    expect(getGpsRetentionMaxHours('pro')).toBe(168);
  });
  it('returns 168 for legacy business tier', () => {
    expect(getGpsRetentionMaxHours('business')).toBe(168);
  });
  it('returns 168 for founder', () => {
    expect(getGpsRetentionMaxHours('founder')).toBe(168);
  });
  it('returns 24 for growth tier', () => {
    expect(getGpsRetentionMaxHours('growth')).toBe(24);
  });
  it('returns 24 for legacy professional tier', () => {
    expect(getGpsRetentionMaxHours('professional')).toBe(24);
  });
  it('returns 0 for free, starter, trial, null, undefined', () => {
    expect(getGpsRetentionMaxHours('free')).toBe(0);
    expect(getGpsRetentionMaxHours('starter')).toBe(0);
    expect(getGpsRetentionMaxHours('trial')).toBe(0);
    expect(getGpsRetentionMaxHours(null)).toBe(0);
    expect(getGpsRetentionMaxHours(undefined)).toBe(0);
  });
  it('is case-insensitive', () => {
    expect(getGpsRetentionMaxHours('PRO')).toBe(168);
    expect(getGpsRetentionMaxHours('Growth')).toBe(24);
  });
});

describe('requireGpsPlan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.GPS_FEATURE_ENABLED;
  });

  it('admin bypasses all gates (no DB lookup)', async () => {
    const req = mockReq({ user: { id: 1, businessId: 1, role: 'admin' } });
    const res = mockRes();
    await requireGpsPlan(req, res, mockNext);
    expect(mockNext).toHaveBeenCalled();
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it('401 when no businessId on session', async () => {
    const req = mockReq({ user: { id: 1, businessId: null, role: 'owner' } });
    const res = mockRes();
    await requireGpsPlan(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('404 when business not found', async () => {
    stubBusinessLookup(null);
    const res = mockRes();
    await requireGpsPlan(mockReq(), res, mockNext);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('403 GPS_NOT_AVAILABLE_FOR_INDUSTRY when industry is a salon', async () => {
    stubBusinessLookup(mockBusiness({ industry: 'Salon' }));
    const res = mockRes();
    await requireGpsPlan(mockReq(), res, mockNext);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      code: 'GPS_NOT_AVAILABLE_FOR_INDUSTRY',
    }));
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('403 GPS_NOT_AVAILABLE_FOR_INDUSTRY when industry is a restaurant', async () => {
    stubBusinessLookup(mockBusiness({ industry: 'Restaurant' }));
    const res = mockRes();
    await requireGpsPlan(mockReq(), res, mockNext);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      code: 'GPS_NOT_AVAILABLE_FOR_INDUSTRY',
    }));
  });

  it('402 GPS_PLAN_REQUIRED when free tier', async () => {
    stubBusinessLookup(mockBusiness());
    mockGetUsageInfo.mockResolvedValue({ planTier: 'free' });
    const res = mockRes();
    await requireGpsPlan(mockReq(), res, mockNext);
    expect(res.status).toHaveBeenCalledWith(402);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      code: 'GPS_PLAN_REQUIRED',
      requiredTier: 'growth',
    }));
  });

  it('402 GPS_PLAN_REQUIRED when starter tier', async () => {
    stubBusinessLookup(mockBusiness());
    mockGetUsageInfo.mockResolvedValue({ planTier: 'starter' });
    const res = mockRes();
    await requireGpsPlan(mockReq(), res, mockNext);
    expect(res.status).toHaveBeenCalledWith(402);
  });

  it('402 GPS_PLAN_REQUIRED when trialing without paid plan', async () => {
    stubBusinessLookup(mockBusiness());
    mockGetUsageInfo.mockResolvedValue({ planTier: 'trial' });
    const res = mockRes();
    await requireGpsPlan(mockReq(), res, mockNext);
    expect(res.status).toHaveBeenCalledWith(402);
  });

  it('passes for growth tier on HVAC business with gpsTrackingEnabled', async () => {
    stubBusinessLookup(mockBusiness({ industry: 'HVAC', gpsTrackingEnabled: true }));
    mockGetUsageInfo.mockResolvedValue({ planTier: 'growth' });
    const res = mockRes();
    await requireGpsPlan(mockReq(), res, mockNext);
    expect(mockNext).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('passes for pro tier', async () => {
    stubBusinessLookup(mockBusiness({ industry: 'Plumbing' }));
    mockGetUsageInfo.mockResolvedValue({ planTier: 'pro' });
    const res = mockRes();
    await requireGpsPlan(mockReq(), res, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });

  it('passes for legacy professional + business tier names', async () => {
    stubBusinessLookup(mockBusiness({ industry: 'Electrical' }));
    mockGetUsageInfo.mockResolvedValue({ planTier: 'professional' });
    let res = mockRes();
    await requireGpsPlan(mockReq(), res, mockNext);
    expect(mockNext).toHaveBeenCalled();

    vi.clearAllMocks();
    stubBusinessLookup(mockBusiness({ industry: 'Landscaping' }));
    mockGetUsageInfo.mockResolvedValue({ planTier: 'business' });
    res = mockRes();
    await requireGpsPlan(mockReq(), res, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });

  it('passes for founder tier (no industry restriction bypass — still gated)', async () => {
    stubBusinessLookup(mockBusiness({ industry: 'HVAC' }));
    mockGetUsageInfo.mockResolvedValue({ planTier: 'founder' });
    const res = mockRes();
    await requireGpsPlan(mockReq(), res, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });

  it('403 GPS_NOT_ENABLED when business has gpsTrackingEnabled = false', async () => {
    stubBusinessLookup(mockBusiness({ gpsTrackingEnabled: false }));
    mockGetUsageInfo.mockResolvedValue({ planTier: 'growth' });
    const res = mockRes();
    await requireGpsPlan(mockReq(), res, mockNext);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      code: 'GPS_NOT_ENABLED',
    }));
  });

  it('403 GPS_BETA_NOT_APPROVED when business not approved by admin', async () => {
    // Even with everything else in order, the beta gate blocks until admin opts the business in.
    stubBusinessLookup(mockBusiness({ gpsBetaApproved: false }));
    mockGetUsageInfo.mockResolvedValue({ planTier: 'growth' });
    const res = mockRes();
    await requireGpsPlan(mockReq(), res, mockNext);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      code: 'GPS_BETA_NOT_APPROVED',
    }));
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('beta gate fires AFTER plan check but BEFORE master-toggle check', async () => {
    // If both beta and master toggle are off, beta gate should fire first
    // (so admins see the right friction point).
    stubBusinessLookup(mockBusiness({ gpsBetaApproved: false, gpsTrackingEnabled: false }));
    mockGetUsageInfo.mockResolvedValue({ planTier: 'growth' });
    const res = mockRes();
    await requireGpsPlan(mockReq(), res, mockNext);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      code: 'GPS_BETA_NOT_APPROVED',
    }));
  });

  it('501 GPS_FEATURE_DISABLED when env kill switch is set', async () => {
    process.env.GPS_FEATURE_ENABLED = 'false';
    stubBusinessLookup(mockBusiness());
    mockGetUsageInfo.mockResolvedValue({ planTier: 'pro' });
    const res = mockRes();
    await requireGpsPlan(mockReq(), res, mockNext);
    expect(res.status).toHaveBeenCalledWith(501);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      code: 'GPS_FEATURE_DISABLED',
    }));
  });

  it('fails OPEN on DB error (paying customers not blocked by transient issues)', async () => {
    mockSelect.mockImplementation(() => {
      throw new Error('DB connection lost');
    });
    const res = mockRes();
    await requireGpsPlan(mockReq(), res, mockNext);
    expect(mockNext).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe('requireGpsPlanForSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.GPS_FEATURE_ENABLED;
  });

  it('does NOT check gpsTrackingEnabled (owner can configure before flipping on)', async () => {
    stubBusinessLookup(mockBusiness({ industry: 'HVAC', gpsTrackingEnabled: false }));
    mockGetUsageInfo.mockResolvedValue({ planTier: 'growth' });
    const res = mockRes();
    await requireGpsPlanForSettings(mockReq(), res, mockNext);
    expect(mockNext).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('still enforces industry gate', async () => {
    stubBusinessLookup(mockBusiness({ industry: 'Salon' }));
    const res = mockRes();
    await requireGpsPlanForSettings(mockReq(), res, mockNext);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      code: 'GPS_NOT_AVAILABLE_FOR_INDUSTRY',
    }));
  });

  it('still enforces plan gate', async () => {
    stubBusinessLookup(mockBusiness({ industry: 'HVAC' }));
    mockGetUsageInfo.mockResolvedValue({ planTier: 'free' });
    const res = mockRes();
    await requireGpsPlanForSettings(mockReq(), res, mockNext);
    expect(res.status).toHaveBeenCalledWith(402);
  });

  it('still enforces beta-approval gate (so Settings tab stays hidden too)', async () => {
    stubBusinessLookup(mockBusiness({ gpsBetaApproved: false }));
    mockGetUsageInfo.mockResolvedValue({ planTier: 'growth' });
    const res = mockRes();
    await requireGpsPlanForSettings(mockReq(), res, mockNext);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      code: 'GPS_BETA_NOT_APPROVED',
    }));
  });

  it('admin bypasses', async () => {
    const req = mockReq({ user: { id: 1, businessId: 1, role: 'admin' } });
    const res = mockRes();
    await requireGpsPlanForSettings(req, res, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });

  it('fails OPEN on DB error', async () => {
    mockSelect.mockImplementation(() => {
      throw new Error('DB down');
    });
    const res = mockRes();
    await requireGpsPlanForSettings(mockReq(), res, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });
});
