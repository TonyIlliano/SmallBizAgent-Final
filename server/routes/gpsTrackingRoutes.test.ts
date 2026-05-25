/**
 * GPS routes integration tests.
 *
 * Mounts registerGpsTrackingRoutes() on a stripped-down Express app with
 * mocked storage + middleware. Focuses on:
 *   - Tenant isolation (Business A can't read/modify Business B's GPS data)
 *   - Public track endpoint sanitization (no PII leakage)
 *   - Session start consent + version validation
 *   - Ping ingestion validation (lat/lng range, accuracy, timestamp skew)
 *   - Link revocation + expiry semantics
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import supertest from 'supertest';

// ── Mocks BEFORE imports ──────────────────────────────────────────────
// Use vi.hoisted() so these are available inside vi.mock() factories
// (which are themselves hoisted above the const declarations).

const { mockStorage, mockDbSelect, mockDbUpdate, mockRequireGpsPlan, mockRequireGpsPlanForSettings } = vi.hoisted(() => {
  return {
    mockStorage: {
      getActiveSessionByStaff: vi.fn(),
      getTrackingSession: vi.fn(),
      getActiveSessionsByBusiness: vi.fn(),
      createTrackingSession: vi.fn(),
      endTrackingSession: vi.fn(),
      pauseTrackingSession: vi.fn(),
      updateSessionPingMeta: vi.fn(),
      createLocationPings: vi.fn(),
      getPingsForJob: vi.fn(),
      getLatestPingByStaff: vi.fn(),
      createTrackingLink: vi.fn(),
      getTrackingLinkByToken: vi.fn(),
      incrementTrackingLinkViews: vi.fn(),
      revokeTrackingLink: vi.fn(),
      getActiveTrackingLinksForJob: vi.fn(),
    },
    mockDbSelect: vi.fn(),
    mockDbUpdate: vi.fn(),
    mockRequireGpsPlan: vi.fn((_req: any, _res: any, next: any) => next()),
    mockRequireGpsPlanForSettings: vi.fn((_req: any, _res: any, next: any) => next()),
  };
});

vi.mock('../storage', () => ({ storage: mockStorage }));

vi.mock('../db', () => ({
  db: {
    select: (...args: any[]) => mockDbSelect(...args),
    update: (...args: any[]) => mockDbUpdate(...args),
  },
}));

vi.mock('@shared/schema', () => ({
  businesses: { id: 'id' },
  staff: { id: 'id', businessId: 'business_id', firstName: 'first_name', lastName: 'last_name', email: 'email', gpsConsentAcceptedAt: 'a', gpsConsentVersion: 'v', gpsTrackingPaused: 'p' },
  customers: { id: 'id' },
  jobs: { id: 'id' },
}));

// Bypass auth + email-verified middleware in tests
vi.mock('../auth', () => ({
  isAuthenticated: (req: any, _res: any, next: any) => {
    if (!req.user) req.user = { id: 1, businessId: 1, role: 'owner' };
    next();
  },
}));

vi.mock('../middleware/auth', () => ({
  requireEmailVerified: (_req: any, _res: any, next: any) => next(),
}));

// Plan gate — by default let everything through. Individual tests override.
vi.mock('../middleware/gpsPlanGate', () => ({
  requireGpsPlan: (req: any, res: any, next: any) => mockRequireGpsPlan(req, res, next),
  requireGpsPlanForSettings: (req: any, res: any, next: any) => mockRequireGpsPlanForSettings(req, res, next),
  getGpsRetentionMaxHours: () => 168,
}));

vi.mock('../services/usageService', () => ({
  getUsageInfo: vi.fn().mockResolvedValue({ planTier: 'pro' }),
}));

vi.mock('../services/auditService', () => ({
  logAudit: vi.fn(),
  getRequestContext: () => ({ ipAddress: '1.1.1.1', userAgent: 'test' }),
}));

// ── Import AFTER mocks ────────────────────────────────────────────────
import { registerGpsTrackingRoutes } from './gpsTrackingRoutes';

// ── Helpers ───────────────────────────────────────────────────────────

function makeApp(userOverride?: any) {
  const app = express();
  app.use(express.json());
  // Inject user before any handler
  app.use((req: any, _res, next) => {
    req.user = userOverride ?? { id: 1, businessId: 1, role: 'owner' };
    next();
  });
  registerGpsTrackingRoutes(app);
  return app;
}

/**
 * Stub `db.select().from(X).where(Y)` to return `rows`.
 * Reuses on every call until overridden.
 */
function stubDbSelect(rows: any[]) {
  mockDbSelect.mockReturnValue({
    from: () => ({
      where: () => Promise.resolve(rows),
      limit: () => Promise.resolve(rows),
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  // Re-set plan gate to default pass-through behavior after clearAllMocks
  mockRequireGpsPlan.mockImplementation((_req: any, _res: any, next: any) => next());
  mockRequireGpsPlanForSettings.mockImplementation((_req: any, _res: any, next: any) => next());
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/gps/sessions/start
// ═══════════════════════════════════════════════════════════════════════════

describe('POST /api/gps/sessions/start', () => {
  it('400 on invalid body', async () => {
    const r = await supertest(makeApp())
      .post('/api/gps/sessions/start')
      .send({ /* missing staffId, disclosureVersion */ });
    expect(r.status).toBe(400);
  });

  it('404 when staff belongs to a different business (TENANT ISOLATION)', async () => {
    stubDbSelect([{ id: 99, businessId: 2 /* NOT 1 */ }]); // attacker tries staffId 99 from biz 2
    const r = await supertest(makeApp())
      .post('/api/gps/sessions/start')
      .send({ staffId: 99, disclosureVersion: '2026-05-24' });
    expect(r.status).toBe(404);
  });

  it('409 DISCLOSURE_VERSION_STALE when version mismatch', async () => {
    // First select returns staff (business=1), second returns business with v2026-06-01
    let call = 0;
    mockDbSelect.mockImplementation(() => ({
      from: () => ({
        where: () => {
          call++;
          if (call === 1) return Promise.resolve([{ id: 5, businessId: 1, gpsConsentAcceptedAt: new Date(), gpsConsentVersion: '2026-06-01' }]);
          return Promise.resolve([{ id: 1, gpsDisclosureVersion: '2026-06-01' }]);
        },
        limit: () => Promise.resolve([]),
      }),
    }));

    const r = await supertest(makeApp())
      .post('/api/gps/sessions/start')
      .send({ staffId: 5, disclosureVersion: '2026-05-24' /* STALE */ });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('DISCLOSURE_VERSION_STALE');
  });

  it('409 SESSION_ALREADY_ACTIVE when staff already has an active session', async () => {
    let call = 0;
    mockDbSelect.mockImplementation(() => ({
      from: () => ({
        where: () => {
          call++;
          if (call === 1) return Promise.resolve([{ id: 5, businessId: 1, gpsConsentAcceptedAt: new Date(), gpsConsentVersion: '2026-05-24' }]);
          return Promise.resolve([{ id: 1, gpsDisclosureVersion: '2026-05-24' }]);
        },
        limit: () => Promise.resolve([]),
      }),
    }));
    mockStorage.getActiveSessionByStaff.mockResolvedValue({ id: 7, businessId: 1, staffId: 5, status: 'active' });

    const r = await supertest(makeApp())
      .post('/api/gps/sessions/start')
      .send({ staffId: 5, disclosureVersion: '2026-05-24' });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('SESSION_ALREADY_ACTIVE');
  });

  it('201 happy path returns sessionId + retentionHours', async () => {
    let call = 0;
    mockDbSelect.mockImplementation(() => ({
      from: () => ({
        where: () => {
          call++;
          if (call === 1) return Promise.resolve([{ id: 5, businessId: 1, gpsConsentAcceptedAt: new Date(), gpsConsentVersion: '2026-05-24' }]);
          return Promise.resolve([{ id: 1, gpsDisclosureVersion: '2026-05-24', gpsRetentionHours: 48 }]);
        },
        limit: () => Promise.resolve([]),
      }),
    }));
    mockStorage.getActiveSessionByStaff.mockResolvedValue(null);
    mockStorage.createTrackingSession.mockResolvedValue({ id: 42 });

    const r = await supertest(makeApp())
      .post('/api/gps/sessions/start')
      .send({ staffId: 5, disclosureVersion: '2026-05-24' });
    expect(r.status).toBe(201);
    expect(r.body.sessionId).toBe(42);
    expect(r.body.retentionHours).toBe(48);
    expect(r.body.expectedPingIntervalSeconds).toBe(30);
  });

  it('409 SESSION_ALREADY_ACTIVE on partial-unique-index race (pg 23505 from Drizzle)', async () => {
    // Race scenario: getActiveSessionByStaff returns null (no session at read
    // time), but between the SELECT and the INSERT another concurrent request
    // wins, causing the partial unique index
    // `uniq_one_active_session_per_staff` to fire pg error 23505. The route
    // catches err?.code === '23505' and converts to 409.
    //
    // This test locks in that contract — if Drizzle ever stops propagating
    // pg.code through its error wrapper, this breaks and we know to fix it.
    let call = 0;
    mockDbSelect.mockImplementation(() => ({
      from: () => ({
        where: () => {
          call++;
          if (call === 1) return Promise.resolve([{ id: 5, businessId: 1, gpsConsentAcceptedAt: new Date(), gpsConsentVersion: '2026-05-24' }]);
          return Promise.resolve([{ id: 1, gpsDisclosureVersion: '2026-05-24', gpsRetentionHours: 48 }]);
        },
        limit: () => Promise.resolve([]),
      }),
    }));
    mockStorage.getActiveSessionByStaff.mockResolvedValue(null); // read-time: no active session
    // Insert-time: another request beat us, partial unique fires.
    // Emulate what Drizzle propagates: a plain Error with `code` attached.
    const pgUniqueViolation = Object.assign(new Error('duplicate key value violates unique constraint "uniq_one_active_session_per_staff"'), {
      code: '23505',
    });
    mockStorage.createTrackingSession.mockRejectedValueOnce(pgUniqueViolation);

    const r = await supertest(makeApp())
      .post('/api/gps/sessions/start')
      .send({ staffId: 5, disclosureVersion: '2026-05-24' });

    expect(r.status).toBe(409);
    expect(r.body.code).toBe('SESSION_ALREADY_ACTIVE');
  });

  it('500 on non-23505 storage error (other errors propagate, not silently 409)', async () => {
    // Defensive check: if createTrackingSession throws for a non-race reason
    // (e.g., connection pool exhausted), we should NOT misreport as 409.
    let call = 0;
    mockDbSelect.mockImplementation(() => ({
      from: () => ({
        where: () => {
          call++;
          if (call === 1) return Promise.resolve([{ id: 5, businessId: 1, gpsConsentAcceptedAt: new Date(), gpsConsentVersion: '2026-05-24' }]);
          return Promise.resolve([{ id: 1, gpsDisclosureVersion: '2026-05-24', gpsRetentionHours: 48 }]);
        },
        limit: () => Promise.resolve([]),
      }),
    }));
    mockStorage.getActiveSessionByStaff.mockResolvedValue(null);
    const connPoolErr = Object.assign(new Error('Connection terminated'), { code: '57P03' });
    mockStorage.createTrackingSession.mockRejectedValueOnce(connPoolErr);

    const r = await supertest(makeApp())
      .post('/api/gps/sessions/start')
      .send({ staffId: 5, disclosureVersion: '2026-05-24' });

    expect(r.status).toBe(500);
    expect(r.body.code).not.toBe('SESSION_ALREADY_ACTIVE');
    // All 500 responses include requestId for support log correlation
    expect(r.body).toHaveProperty('requestId');
    expect(typeof r.body.requestId).toBe('string');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/gps/pings — validation
// ═══════════════════════════════════════════════════════════════════════════

describe('POST /api/gps/pings', () => {
  function stubActiveSessionForBiz1() {
    mockStorage.getTrackingSession.mockResolvedValue({
      id: 7, businessId: 1, staffId: 5, jobId: 99, status: 'active',
      startedAt: new Date(), endedAt: null,
    });
    mockStorage.createLocationPings.mockResolvedValue(1);
  }

  it('404 when session belongs to a different business (TENANT ISOLATION)', async () => {
    // Session lookup returns null (storage filters by businessId)
    mockStorage.getTrackingSession.mockResolvedValue(undefined);
    const r = await supertest(makeApp())
      .post('/api/gps/pings')
      .send({
        sessionId: 7,
        pings: [{ lat: 40, lng: -74, recordedAt: new Date().toISOString() }],
      });
    expect(r.status).toBe(404);
  });

  it('410 when session has ended', async () => {
    mockStorage.getTrackingSession.mockResolvedValue({
      id: 7, businessId: 1, staffId: 5, status: 'ended',
    });
    const r = await supertest(makeApp())
      .post('/api/gps/pings')
      .send({
        sessionId: 7,
        pings: [{ lat: 40, lng: -74, recordedAt: new Date().toISOString() }],
      });
    expect(r.status).toBe(410);
  });

  it('drops pings with stale recordedAt (>30 min in the past)', async () => {
    stubActiveSessionForBiz1();
    const stale = new Date(Date.now() - 35 * 60 * 1000).toISOString();
    const r = await supertest(makeApp())
      .post('/api/gps/pings')
      .send({
        sessionId: 7,
        pings: [{ lat: 40, lng: -74, recordedAt: stale }],
      });
    expect(r.status).toBe(200);
    expect(r.body.accepted).toBe(0);
    expect(r.body.rejected).toBe(1);
    expect(r.body.details[0].reason).toBe('stale_ping');
  });

  it('drops pings with future recordedAt (>5 min ahead)', async () => {
    stubActiveSessionForBiz1();
    const future = new Date(Date.now() + 10 * 60 * 1000).toISOString();
    const r = await supertest(makeApp())
      .post('/api/gps/pings')
      .send({
        sessionId: 7,
        pings: [{ lat: 40, lng: -74, recordedAt: future }],
      });
    expect(r.body.rejected).toBe(1);
    expect(r.body.details[0].reason).toBe('future_ping');
  });

  it('drops pings with accuracy >500m', async () => {
    stubActiveSessionForBiz1();
    const r = await supertest(makeApp())
      .post('/api/gps/pings')
      .send({
        sessionId: 7,
        pings: [{ lat: 40, lng: -74, accuracyMeters: 600, recordedAt: new Date().toISOString() }],
      });
    expect(r.body.rejected).toBe(1);
    expect(r.body.details[0].reason).toBe('accuracy_too_low');
  });

  it('400 on lat out of range', async () => {
    stubActiveSessionForBiz1();
    const r = await supertest(makeApp())
      .post('/api/gps/pings')
      .send({
        sessionId: 7,
        pings: [{ lat: 91, lng: -74, recordedAt: new Date().toISOString() }],
      });
    expect(r.status).toBe(400);
  });

  it('400 on lng out of range', async () => {
    stubActiveSessionForBiz1();
    const r = await supertest(makeApp())
      .post('/api/gps/pings')
      .send({
        sessionId: 7,
        pings: [{ lat: 40, lng: 200, recordedAt: new Date().toISOString() }],
      });
    expect(r.status).toBe(400);
  });

  it('400 when batch exceeds 50 pings', async () => {
    stubActiveSessionForBiz1();
    const pings = Array.from({ length: 51 }, () => ({
      lat: 40, lng: -74, recordedAt: new Date().toISOString(),
    }));
    const r = await supertest(makeApp())
      .post('/api/gps/pings')
      .send({ sessionId: 7, pings });
    expect(r.status).toBe(400);
  });

  it('accepts valid ping batch and reports counts', async () => {
    stubActiveSessionForBiz1();
    mockStorage.createLocationPings.mockResolvedValue(2);
    const now = new Date().toISOString();
    const r = await supertest(makeApp())
      .post('/api/gps/pings')
      .send({
        sessionId: 7,
        pings: [
          { lat: 40, lng: -74, recordedAt: now },
          { lat: 40.001, lng: -74.001, recordedAt: now },
        ],
      });
    expect(r.status).toBe(200);
    expect(r.body.accepted).toBe(2);
    expect(r.body.rejected).toBe(0);
    expect(r.body.sessionStillActive).toBe(true);
    // businessId should have been stamped by storage layer (defense in depth)
    expect(mockStorage.createLocationPings).toHaveBeenCalledWith(1, expect.any(Array));
  });

  it('paused session drops pings without 410', async () => {
    mockStorage.getTrackingSession.mockResolvedValue({
      id: 7, businessId: 1, staffId: 5, status: 'paused',
      startedAt: new Date(), endedAt: null,
    });
    const r = await supertest(makeApp())
      .post('/api/gps/pings')
      .send({
        sessionId: 7,
        pings: [{ lat: 40, lng: -74, recordedAt: new Date().toISOString() }],
      });
    expect(r.status).toBe(200);
    expect(r.body.accepted).toBe(0);
    expect(r.body.rejected).toBe(1);
    expect(r.body.reason).toBe('session_paused');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GET /api/gps/jobs/:jobId/breadcrumb — TENANT ISOLATION
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /api/gps/jobs/:jobId/breadcrumb', () => {
  it('passes businessId to storage layer (relies on storage WHERE clause for isolation)', async () => {
    mockStorage.getPingsForJob.mockResolvedValue([]);
    const r = await supertest(makeApp())
      .get('/api/gps/jobs/99/breadcrumb');
    expect(r.status).toBe(200);
    // First arg is jobId, SECOND IS BUSINESS ID — defense in depth
    expect(mockStorage.getPingsForJob).toHaveBeenCalledWith(99, 1, expect.any(Object));
  });

  it('caps limit at 1000', async () => {
    mockStorage.getPingsForJob.mockResolvedValue([]);
    await supertest(makeApp())
      .get('/api/gps/jobs/99/breadcrumb?limit=5000');
    expect(mockStorage.getPingsForJob).toHaveBeenCalledWith(99, 1, expect.objectContaining({ limit: 1000 }));
  });

  it('parses numeric strings from postgres into JS floats in response', async () => {
    mockStorage.getPingsForJob.mockResolvedValue([
      { lat: '40.1234567', lng: '-74.0000001', recordedAt: new Date(), accuracyMeters: 10, speedMps: 5, headingDegrees: 90, isMoving: true },
    ]);
    const r = await supertest(makeApp()).get('/api/gps/jobs/99/breadcrumb');
    expect(r.body.pings[0].lat).toBe(40.1234567);
    expect(r.body.pings[0].lng).toBe(-74.0000001);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// POST /api/gps/links + DELETE /api/gps/links/:linkId
// ═══════════════════════════════════════════════════════════════════════════

describe('POST /api/gps/links', () => {
  it('404 when job belongs to different business (TENANT ISOLATION)', async () => {
    stubDbSelect([{ id: 99, businessId: 2 /* not 1 */, customerId: 50 }]);
    const r = await supertest(makeApp())
      .post('/api/gps/links')
      .send({ jobId: 99 });
    expect(r.status).toBe(404);
  });

  it('403 CUSTOMER_SHARE_DISABLED when business has master toggle off', async () => {
    let call = 0;
    mockDbSelect.mockImplementation(() => ({
      from: () => ({
        where: () => {
          call++;
          if (call === 1) return Promise.resolve([{ id: 99, businessId: 1, customerId: 50 }]);
          return Promise.resolve([{ id: 1, gpsCustomerShareEnabled: false }]);
        },
      }),
    }));
    const r = await supertest(makeApp())
      .post('/api/gps/links')
      .send({ jobId: 99 });
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('CUSTOMER_SHARE_DISABLED');
  });

  it('201 creates link with URL-safe token', async () => {
    let call = 0;
    mockDbSelect.mockImplementation(() => ({
      from: () => ({
        where: () => {
          call++;
          if (call === 1) return Promise.resolve([{ id: 99, businessId: 1, customerId: 50 }]);
          return Promise.resolve([{ id: 1, gpsCustomerShareEnabled: true, gpsCustomerShareDefaultMinutes: 240 }]);
        },
      }),
    }));
    mockStorage.getActiveSessionsByBusiness.mockResolvedValue([]);
    mockStorage.createTrackingLink.mockImplementation((data: any) => Promise.resolve({
      id: 12,
      token: data.token,
      expiresAt: data.expiresAt,
    }));

    const r = await supertest(makeApp())
      .post('/api/gps/links')
      .send({ jobId: 99 });
    expect(r.status).toBe(201);
    expect(r.body.linkId).toBe(12);
    expect(r.body.token).toMatch(/^[A-Za-z0-9_-]+$/); // base64url alphabet
    expect(r.body.url).toContain('/track/');
  });
});

describe('DELETE /api/gps/links/:linkId', () => {
  it('passes businessId to storage for ownership check', async () => {
    mockStorage.revokeTrackingLink.mockResolvedValue(undefined);
    const r = await supertest(makeApp())
      .delete('/api/gps/links/77');
    expect(r.status).toBe(200);
    expect(mockStorage.revokeTrackingLink).toHaveBeenCalledWith(77, 1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC GET /api/gps/public/track/:token — sanitization + expiry
// ═══════════════════════════════════════════════════════════════════════════

describe('GET /api/gps/public/track/:token', () => {
  it('404 on unknown token', async () => {
    mockStorage.getTrackingLinkByToken.mockResolvedValue(undefined);
    const r = await supertest(makeApp()).get('/api/gps/public/track/abc123def456abc123def');
    expect(r.status).toBe(404);
  });

  it('404 on too-short token (defends against scanning)', async () => {
    const r = await supertest(makeApp()).get('/api/gps/public/track/short');
    expect(r.status).toBe(404);
    expect(mockStorage.getTrackingLinkByToken).not.toHaveBeenCalled();
  });

  it('410 EXPIRED when link is past expiry', async () => {
    mockStorage.getTrackingLinkByToken.mockResolvedValue({
      id: 1, businessId: 1, jobId: 99, token: 'longtokenstringhere1234567', expiresAt: new Date(Date.now() - 1000),
      revokedAt: null,
    });
    const r = await supertest(makeApp()).get('/api/gps/public/track/longtokenstringhere1234567');
    expect(r.status).toBe(410);
    expect(r.body.code).toBe('EXPIRED');
  });

  it('410 REVOKED when link is revoked', async () => {
    mockStorage.getTrackingLinkByToken.mockResolvedValue({
      id: 1, businessId: 1, jobId: 99, token: 'longtokenstringhere1234567', expiresAt: new Date(Date.now() + 60000),
      revokedAt: new Date(),
    });
    const r = await supertest(makeApp()).get('/api/gps/public/track/longtokenstringhere1234567');
    expect(r.status).toBe(410);
    expect(r.body.code).toBe('REVOKED');
  });

  it('410 DISABLED honors master toggle even on still-valid cached links', async () => {
    mockStorage.getTrackingLinkByToken.mockResolvedValue({
      id: 1, businessId: 1, jobId: 99, sessionId: 7, token: 'longtokenstringhere1234567',
      expiresAt: new Date(Date.now() + 60000), revokedAt: null,
    });
    stubDbSelect([{ id: 1, name: 'Joe HVAC', gpsCustomerShareEnabled: false }]);
    const r = await supertest(makeApp()).get('/api/gps/public/track/longtokenstringhere1234567');
    expect(r.status).toBe(410);
    expect(r.body.code).toBe('DISABLED');
  });

  it('payload sanitized: only first name + last initial, no email/phone of tech', async () => {
    mockStorage.getTrackingLinkByToken.mockResolvedValue({
      id: 1, businessId: 1, jobId: 99, sessionId: 7, token: 'longtokenstringhere1234567',
      expiresAt: new Date(Date.now() + 60000), revokedAt: null,
    });
    let call = 0;
    mockDbSelect.mockImplementation(() => ({
      from: () => ({
        where: () => {
          call++;
          if (call === 1) return Promise.resolve([{ id: 1, name: 'Joe HVAC', phone: '+13305551212', gpsCustomerShareEnabled: true }]);
          if (call === 2) return Promise.resolve([{ id: 99, businessId: 1, status: 'en_route', etaMinutes: 30, customerLocationLat: null, customerLocationLng: null }]);
          // Tech lookup — return name/email/phone, all of which should NOT appear in response
          return Promise.resolve([{ firstName: 'Mike', lastName: 'Smith', email: 'mike@company.com', phone: '+15551234567' }]);
        },
      }),
    }));
    mockStorage.getTrackingSession.mockResolvedValue({ id: 7, businessId: 1, staffId: 5, status: 'active' });
    mockStorage.getLatestPingByStaff.mockResolvedValue({ lat: '40.1', lng: '-74.0', recordedAt: new Date(), isMoving: true });
    mockStorage.incrementTrackingLinkViews.mockResolvedValue(undefined);

    const r = await supertest(makeApp()).get('/api/gps/public/track/longtokenstringhere1234567');
    expect(r.status).toBe(200);
    expect(r.body.businessName).toBe('Joe HVAC');
    expect(r.body.tech).toEqual({ firstName: 'Mike', lastInitial: 'S' });

    // PII protection assertions
    const json = JSON.stringify(r.body);
    expect(json).not.toContain('Smith');         // full last name
    expect(json).not.toContain('mike@company.com');
    expect(json).not.toContain('+15551234567');  // tech phone
  });

  it('rate-limited (returns 429 after burst)', async () => {
    mockStorage.getTrackingLinkByToken.mockResolvedValue(undefined);
    const app = makeApp();
    // Fire enough requests to trip the 60/min limiter
    const tasks = Array.from({ length: 65 }, () => supertest(app).get('/api/gps/public/track/longtokenstringhere1234567'));
    const responses = await Promise.all(tasks);
    const rateLimited = responses.filter(r => r.status === 429);
    expect(rateLimited.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Settings endpoints — owner self-serve
// ═══════════════════════════════════════════════════════════════════════════

describe('PUT /api/gps/settings', () => {
  it('400 on retention value above Zod max (168)', async () => {
    const r = await supertest(makeApp())
      .put('/api/gps/settings')
      .send({ gpsRetentionHours: 999 });
    expect(r.status).toBe(400);
    expect(r.body.error).toBe('Invalid body');
  });

  it('400 on retention value below Zod min (1)', async () => {
    const r = await supertest(makeApp())
      .put('/api/gps/settings')
      .send({ gpsRetentionHours: 0 });
    expect(r.status).toBe(400);
  });

  it('400 on customer share TTL below 15 minutes (Zod)', async () => {
    const r = await supertest(makeApp())
      .put('/api/gps/settings')
      .send({ gpsCustomerShareDefaultMinutes: 5 });
    expect(r.status).toBe(400);
  });
});

describe('POST /api/gps/staff/:staffId/revoke-consent', () => {
  it('404 when staff belongs to different business (TENANT ISOLATION)', async () => {
    stubDbSelect([{ id: 99, businessId: 2 /* not 1 */ }]);
    const r = await supertest(makeApp())
      .post('/api/gps/staff/99/revoke-consent');
    expect(r.status).toBe(404);
  });

  it('400 on invalid staffId', async () => {
    const r = await supertest(makeApp())
      .post('/api/gps/staff/not-a-number/revoke-consent');
    expect(r.status).toBe(400);
  });
});
