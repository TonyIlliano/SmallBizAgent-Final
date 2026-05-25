/**
 * GPS Live Dispatch — server ingestion + dispatcher + customer-facing routes.
 *
 * Mounted at /api/gps. The public track endpoint at /api/gps/public/track/:token
 * is CSRF-exempt + auth-exempt (see server/index.ts CSRF exempt list).
 *
 * All authenticated endpoints go through:
 *   isAuthenticated → requireEmailVerified → requireGpsPlan
 * which enforces: logged in, email verified, field-service industry, Growth+ plan,
 * business.gpsTrackingEnabled = true, GPS_FEATURE_ENABLED env var not 'false'.
 *
 * Tenant safety:
 *   - businessId resolved from req.user, NEVER from URL/body
 *   - Every storage call passes businessId for defense-in-depth WHERE clauses
 *   - Public endpoint sanitizes payload — never exposes other-tenant data
 */

import { Router, Request, Response, Express } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { randomBytes } from "crypto";
import { storage } from "../storage";
import { db } from "../db";
import { businesses, staff, customers, jobs } from "@shared/schema";
import { eq } from "drizzle-orm";
import { isAuthenticated } from "../auth";
import { requireEmailVerified } from "../middleware/auth";
import { requireGpsPlan, requireGpsPlanForSettings, getGpsRetentionMaxHours } from "../middleware/gpsPlanGate";
import { getUsageInfo } from "../services/usageService";
import {
  getActiveDisclosure,
  needsTechReAcceptance,
  recordTechAcceptance,
  bumpDisclosureVersion,
  revokeTechConsent,
  DEFAULT_DISCLOSURE_VERSION,
  DEFAULT_DISCLOSURE_COPY,
} from "../services/gpsDisclosureService";
import { logAudit, getRequestContext } from "../services/auditService";
import { getRequestId } from "../utils/requestContext";

// ─── Rate limiters ────────────────────────────────────────────────────────
// Authenticated ping ingestion — generous, since techs fire pings every 30s.
// 120 req/min per IP. Each request can carry up to 50 pings, so effective
// ceiling is 6000 pings/min/IP, way above the realistic 2 pings/min/tech.
const gpsPingLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: { error: "Too many GPS ping requests" },
  standardHeaders: true,
  legacyHeaders: false,
});

// Public track endpoint — 60 req/min per IP. Customer's phone polling every
// 15s = 4 req/min. Headroom for tab reloads.
const publicTrackLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: "Too many tracking requests. Please wait." },
  standardHeaders: true,
  legacyHeaders: false,
});

// ─── Validation schemas ───────────────────────────────────────────────────
const pingSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracyMeters: z.number().nullable().optional(),
  speedMps: z.number().nullable().optional(),
  headingDegrees: z.number().min(0).max(360).nullable().optional(),
  altitudeMeters: z.number().nullable().optional(),
  batteryLevel: z.number().min(0).max(1).nullable().optional(),
  isMoving: z.boolean().optional(),
  source: z.enum(['background', 'foreground', 'manual']).optional(),
  recordedAt: z.string().or(z.date()),
});

const pingsBatchSchema = z.object({
  sessionId: z.number().int().positive(),
  pings: z.array(pingSchema).min(1).max(50),
});

const startSessionSchema = z.object({
  staffId: z.number().int().positive(),
  jobId: z.number().int().positive().nullable().optional(),
  disclosureVersion: z.string(),
});

const endSessionSchema = z.object({
  reason: z.enum(['manual', 'job_completed', 'shift_end', 'auto_timeout', 'permissions_revoked']),
});

const pauseSessionSchema = z.object({
  paused: z.boolean(),
});

const createLinkSchema = z.object({
  jobId: z.number().int().positive(),
  customerId: z.number().int().positive().nullable().optional(),
  expiresInMinutes: z.number().int().min(15).max(1440).optional(), // 15min–24h
});

const consentAcceptSchema = z.object({
  staffId: z.number().int().positive(),
  version: z.string(),
});

// ─── Helpers ──────────────────────────────────────────────────────────────
function getBusinessId(req: Request): number | null {
  return req.user?.businessId ?? null;
}

/**
 * Send a 500 with a stable shape: { error, requestId }.
 * The requestId comes from AsyncLocalStorage (server/utils/requestContext.ts)
 * so support can grep server logs for the same id the client received.
 *
 * Always log the underlying err — never trust the caller did it.
 */
function send500(res: Response, message: string, err?: unknown): Response {
  const requestId = getRequestId();
  if (err) console.error(`[GPS] [${requestId}] ${message}:`, err);
  return res.status(500).json({ error: message, requestId });
}

/**
 * Validate that a recordedAt timestamp is within an acceptable window vs. server clock.
 * Defends against device clock skew and replay attacks.
 * Returns null if valid, error string if not.
 */
function validatePingTimestamp(recordedAt: Date): string | null {
  const now = Date.now();
  const t = recordedAt.getTime();
  const MAX_PAST_MS = 30 * 60 * 1000;  // 30 minutes
  const MAX_FUTURE_MS = 5 * 60 * 1000; // 5 minutes
  if (t < now - MAX_PAST_MS) return 'stale_ping';
  if (t > now + MAX_FUTURE_MS) return 'future_ping';
  return null;
}

/**
 * Generate a URL-safe random tracking token. ~190 bits of entropy, 32 chars.
 * Token IS the secret — never enumerable, never indexed by user-supplied data.
 *
 * Wrapped in try/catch with webcrypto fallback. Node's `randomBytes` can
 * throw synchronously under rare conditions (e.g., entropy pool issues on a
 * container). Webcrypto uses a separate source and is part of the standard
 * library in Node 19+.
 */
function generateTrackingToken(): string {
  try {
    return randomBytes(24).toString('base64url');
  } catch (err) {
    console.error('[GPS] randomBytes failed, falling back to webcrypto:', err);
    const buf = new Uint8Array(24);
    const webCrypto: Crypto = (globalThis as any).crypto;
    if (!webCrypto?.getRandomValues) {
      // Last resort — re-throw so the caller surfaces a 500 rather than
      // returning a token from a weak source. This is virtually impossible
      // to hit on a modern Node install.
      throw err;
    }
    webCrypto.getRandomValues(buf);
    return Buffer.from(buf).toString('base64url');
  }
}

/**
 * Haversine distance in meters between two lat/lng points.
 * Used by the public track endpoint to compute approximate ETA.
 */
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // earth radius (meters)
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// ═══════════════════════════════════════════════════════════════════════════
// Router setup
// ═══════════════════════════════════════════════════════════════════════════

export function registerGpsTrackingRoutes(app: Express) {
  const router = Router();

  // ─── Disclosure & consent ──────────────────────────────────────────────
  router.get('/disclosure', isAuthenticated, requireEmailVerified, requireGpsPlan, async (req, res) => {
    try {
      const businessId = getBusinessId(req);
      if (!businessId) return res.status(401).json({ error: 'Not authenticated' });
      const disclosure = await getActiveDisclosure(businessId);
      res.json(disclosure);
    } catch (err) {
      console.error('[GPS] /disclosure error:', err);
      send500(res, 'Failed to load disclosure');
    }
  });

  router.post('/consent/accept', isAuthenticated, requireEmailVerified, requireGpsPlan, async (req, res) => {
    try {
      const businessId = getBusinessId(req);
      if (!businessId) return res.status(401).json({ error: 'Not authenticated' });

      const parsed = consentAcceptSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });

      // Validate the staff belongs to this business
      const [staffRow] = await db.select().from(staff).where(eq(staff.id, parsed.data.staffId));
      if (!staffRow || staffRow.businessId !== businessId) {
        return res.status(404).json({ error: 'Staff not found' });
      }

      await recordTechAcceptance(parsed.data.staffId, businessId, parsed.data.version);
      const ctx = getRequestContext(req);
      await logAudit({
        userId: req.user?.id,
        businessId,
        action: 'gps_consent_accepted',
        resource: 'staff',
        resourceId: parsed.data.staffId,
        details: { version: parsed.data.version },
        ...ctx,
      });
      res.json({ ok: true });
    } catch (err) {
      console.error('[GPS] /consent/accept error:', err);
      send500(res, 'Failed to record consent');
    }
  });

  router.get('/consent/check/:staffId', isAuthenticated, requireEmailVerified, requireGpsPlan, async (req, res) => {
    try {
      const businessId = getBusinessId(req);
      if (!businessId) return res.status(401).json({ error: 'Not authenticated' });

      const staffId = parseInt(req.params.staffId, 10);
      if (isNaN(staffId)) return res.status(400).json({ error: 'Invalid staffId' });

      const [staffRow] = await db.select().from(staff).where(eq(staff.id, staffId));
      if (!staffRow || staffRow.businessId !== businessId) {
        return res.status(404).json({ error: 'Staff not found' });
      }

      const [business] = await db.select().from(businesses).where(eq(businesses.id, businessId));
      const check = needsTechReAcceptance(staffRow, business || { gpsDisclosureVersion: DEFAULT_DISCLOSURE_VERSION });
      res.json(check);
    } catch (err) {
      console.error('[GPS] /consent/check error:', err);
      send500(res, 'Failed to check consent');
    }
  });

  // ─── Sessions ──────────────────────────────────────────────────────────
  router.post('/sessions/start', isAuthenticated, requireEmailVerified, requireGpsPlan, async (req, res) => {
    try {
      const businessId = getBusinessId(req);
      if (!businessId) return res.status(401).json({ error: 'Not authenticated' });

      const parsed = startSessionSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
      const { staffId, jobId, disclosureVersion } = parsed.data;

      // Validate staff belongs to business
      const [staffRow] = await db.select().from(staff).where(eq(staff.id, staffId));
      if (!staffRow || staffRow.businessId !== businessId) {
        return res.status(404).json({ error: 'Staff not found' });
      }

      // Validate disclosure version is current
      const [business] = await db.select().from(businesses).where(eq(businesses.id, businessId));
      const currentVersion = business?.gpsDisclosureVersion || DEFAULT_DISCLOSURE_VERSION;
      if (disclosureVersion !== currentVersion) {
        return res.status(409).json({
          code: 'DISCLOSURE_VERSION_STALE',
          message: 'Disclosure version has changed. Re-accept required.',
          currentVersion,
        });
      }

      // Re-acceptance check (covers never-accepted, expired_90_days)
      const consentCheck = needsTechReAcceptance(staffRow, { gpsDisclosureVersion: currentVersion });
      if (consentCheck.required) {
        return res.status(409).json({
          code: 'CONSENT_REQUIRED',
          reason: consentCheck.reason,
          daysSinceAcceptance: consentCheck.daysSinceAcceptance,
        });
      }

      // Validate job belongs to business if provided
      if (jobId) {
        const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId));
        if (!job || job.businessId !== businessId) {
          return res.status(404).json({ error: 'Job not found' });
        }
      }

      // Check no active session exists (partial unique index also enforces this)
      const existing = await storage.getActiveSessionByStaff(staffId, businessId);
      if (existing) {
        return res.status(409).json({
          code: 'SESSION_ALREADY_ACTIVE',
          sessionId: existing.id,
          message: 'You already have an active tracking session.',
        });
      }

      const session = await storage.createTrackingSession({
        businessId,
        staffId,
        jobId: jobId ?? null,
        status: 'active',
        disclosureAcceptedAt: staffRow.gpsConsentAcceptedAt,
        disclosureVersion: currentVersion,
      });

      const ctx = getRequestContext(req);
      await logAudit({
        userId: req.user?.id,
        businessId,
        action: 'gps_session_started',
        resource: 'tech_tracking_session',
        resourceId: session.id,
        details: { staffId, jobId: jobId ?? null, disclosureVersion: currentVersion },
        ...ctx,
      });

      res.status(201).json({
        sessionId: session.id,
        retentionHours: business?.gpsRetentionHours ?? 24,
        expectedPingIntervalSeconds: 30,
      });
    } catch (err: any) {
      // Partial unique index race
      if (err?.code === '23505') {
        return res.status(409).json({ code: 'SESSION_ALREADY_ACTIVE', message: 'Active session already exists.' });
      }
      console.error('[GPS] /sessions/start error:', err);
      send500(res, 'Failed to start session');
    }
  });

  router.post('/sessions/:sessionId/end', isAuthenticated, requireEmailVerified, requireGpsPlan, async (req, res) => {
    try {
      const businessId = getBusinessId(req);
      if (!businessId) return res.status(401).json({ error: 'Not authenticated' });

      const sessionId = parseInt(req.params.sessionId, 10);
      if (isNaN(sessionId)) return res.status(400).json({ error: 'Invalid sessionId' });

      const parsed = endSessionSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });

      const session = await storage.endTrackingSession(sessionId, businessId, parsed.data.reason);
      if (!session) return res.status(404).json({ error: 'Session not found' });

      const durationMs = session.endedAt && session.startedAt
        ? session.endedAt.getTime() - session.startedAt.getTime()
        : 0;

      const ctx = getRequestContext(req);
      await logAudit({
        userId: req.user?.id,
        businessId,
        action: 'gps_session_ended',
        resource: 'tech_tracking_session',
        resourceId: sessionId,
        details: { reason: parsed.data.reason, durationMinutes: Math.round(durationMs / 60000), pingCount: session.pingCount },
        ...ctx,
      });

      res.json({
        sessionId: session.id,
        endedAt: session.endedAt,
        durationMinutes: Math.round(durationMs / 60000),
        pingCount: session.pingCount,
      });
    } catch (err) {
      console.error('[GPS] /sessions/:id/end error:', err);
      send500(res, 'Failed to end session');
    }
  });

  router.post('/sessions/:sessionId/pause', isAuthenticated, requireEmailVerified, requireGpsPlan, async (req, res) => {
    try {
      const businessId = getBusinessId(req);
      if (!businessId) return res.status(401).json({ error: 'Not authenticated' });

      const sessionId = parseInt(req.params.sessionId, 10);
      if (isNaN(sessionId)) return res.status(400).json({ error: 'Invalid sessionId' });

      const parsed = pauseSessionSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });

      const session = await storage.pauseTrackingSession(sessionId, businessId, parsed.data.paused);
      if (!session) return res.status(404).json({ error: 'Session not found' });

      const ctx = getRequestContext(req);
      await logAudit({
        userId: req.user?.id,
        businessId,
        action: 'gps_session_paused',
        resource: 'tech_tracking_session',
        resourceId: sessionId,
        details: { paused: parsed.data.paused },
        ...ctx,
      });

      res.json({ sessionId: session.id, status: session.status });
    } catch (err) {
      console.error('[GPS] /sessions/:id/pause error:', err);
      send500(res, 'Failed to pause session');
    }
  });

  router.get('/sessions/active', isAuthenticated, requireEmailVerified, requireGpsPlan, async (req, res) => {
    try {
      const businessId = getBusinessId(req);
      if (!businessId) return res.status(401).json({ error: 'Not authenticated' });

      const sessions = await storage.getActiveSessionsByBusiness(businessId);

      // Enrich with latest ping + staff name
      const enriched = await Promise.all(sessions.map(async (s) => {
        const [staffRow] = await db.select({
          id: staff.id, firstName: staff.firstName, lastName: staff.lastName,
        }).from(staff).where(eq(staff.id, s.staffId));
        const latest = await storage.getLatestPingByStaff(s.staffId, businessId);

        return {
          sessionId: s.id,
          staffId: s.staffId,
          staffName: staffRow ? `${staffRow.firstName} ${staffRow.lastName}` : 'Unknown',
          jobId: s.jobId,
          status: s.status,
          startedAt: s.startedAt,
          lastPingAt: s.lastPingAt,
          pingCount: s.pingCount,
          latestPing: latest ? {
            lat: parseFloat(latest.lat),
            lng: parseFloat(latest.lng),
            recordedAt: latest.recordedAt,
            accuracyMeters: latest.accuracyMeters,
            speedMps: latest.speedMps,
            headingDegrees: latest.headingDegrees,
            batteryLevel: latest.batteryLevel,
          } : null,
        };
      }));

      res.json({ sessions: enriched });
    } catch (err) {
      console.error('[GPS] /sessions/active error:', err);
      send500(res, 'Failed to list active sessions');
    }
  });

  // ─── Ping ingestion ───────────────────────────────────────────────────
  router.post('/pings', isAuthenticated, requireEmailVerified, requireGpsPlan, gpsPingLimiter, async (req, res) => {
    try {
      const businessId = getBusinessId(req);
      if (!businessId) return res.status(401).json({ error: 'Not authenticated' });

      const parsed = pingsBatchSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
      const { sessionId, pings } = parsed.data;

      // Validate session belongs to caller's business AND is active
      const session = await storage.getTrackingSession(sessionId, businessId);
      if (!session) return res.status(404).json({ error: 'Session not found' });
      if (session.status === 'ended') return res.status(410).json({ error: 'Session has ended' });
      if (session.status === 'paused') {
        // Silently accept but drop — tech may have re-resumed locally before server caught up
        return res.json({ accepted: 0, rejected: pings.length, reason: 'session_paused', sessionStillActive: true });
      }

      // Filter pings: validate timestamp window + accuracy
      const accepted: Array<typeof pings[0] & { recordedAt: Date }> = [];
      const rejected: Array<{ index: number; reason: string }> = [];
      pings.forEach((p, i) => {
        const recordedAt = new Date(p.recordedAt as any);
        if (isNaN(recordedAt.getTime())) {
          rejected.push({ index: i, reason: 'invalid_recordedAt' });
          return;
        }
        const skewErr = validatePingTimestamp(recordedAt);
        if (skewErr) {
          rejected.push({ index: i, reason: skewErr });
          return;
        }
        if (p.accuracyMeters != null && p.accuracyMeters > 500) {
          rejected.push({ index: i, reason: 'accuracy_too_low' });
          return;
        }
        accepted.push({ ...p, recordedAt });
      });

      if (accepted.length === 0) {
        return res.json({ accepted: 0, rejected: pings.length, sessionStillActive: true, details: rejected });
      }

      // Map to InsertTechLocationPing — convert numbers to strings for numeric columns
      const rows = accepted.map(p => ({
        businessId,
        staffId: session.staffId,
        jobId: session.jobId ?? null,
        lat: String(p.lat),
        lng: String(p.lng),
        accuracyMeters: p.accuracyMeters ?? null,
        speedMps: p.speedMps ?? null,
        headingDegrees: p.headingDegrees ?? null,
        altitudeMeters: p.altitudeMeters ?? null,
        batteryLevel: p.batteryLevel ?? null,
        isMoving: p.isMoving ?? false,
        source: p.source ?? 'background',
        recordedAt: p.recordedAt,
      }));

      const inserted = await storage.createLocationPings(businessId, rows);

      // Update session denormalized meta
      const latestRecordedAt = accepted.reduce((max, p) => p.recordedAt > max ? p.recordedAt : max, accepted[0].recordedAt);
      await storage.updateSessionPingMeta(sessionId, businessId, latestRecordedAt, inserted);

      res.json({
        accepted: inserted,
        rejected: rejected.length,
        sessionStillActive: true,
        details: rejected.length > 0 ? rejected : undefined,
      });
    } catch (err) {
      console.error('[GPS] /pings error:', err);
      send500(res, 'Failed to ingest pings');
    }
  });

  // ─── Breadcrumb queries (dispatcher) ──────────────────────────────────
  router.get('/jobs/:jobId/breadcrumb', isAuthenticated, requireEmailVerified, requireGpsPlan, async (req, res) => {
    try {
      const businessId = getBusinessId(req);
      if (!businessId) return res.status(401).json({ error: 'Not authenticated' });

      const jobId = parseInt(req.params.jobId, 10);
      if (isNaN(jobId)) return res.status(400).json({ error: 'Invalid jobId' });

      const since = req.query.since ? new Date(String(req.query.since)) : undefined;
      const limit = req.query.limit ? Math.min(parseInt(String(req.query.limit), 10) || 1000, 1000) : 1000;

      const pings = await storage.getPingsForJob(jobId, businessId, { limit, since });
      res.json({
        pings: pings.map(p => ({
          lat: parseFloat(p.lat),
          lng: parseFloat(p.lng),
          accuracyMeters: p.accuracyMeters,
          speedMps: p.speedMps,
          headingDegrees: p.headingDegrees,
          isMoving: p.isMoving,
          recordedAt: p.recordedAt,
        })),
      });
    } catch (err) {
      console.error('[GPS] /jobs/:jobId/breadcrumb error:', err);
      send500(res, 'Failed to fetch breadcrumb');
    }
  });

  router.get('/staff/:staffId/latest', isAuthenticated, requireEmailVerified, requireGpsPlan, async (req, res) => {
    try {
      const businessId = getBusinessId(req);
      if (!businessId) return res.status(401).json({ error: 'Not authenticated' });

      const staffId = parseInt(req.params.staffId, 10);
      if (isNaN(staffId)) return res.status(400).json({ error: 'Invalid staffId' });

      const ping = await storage.getLatestPingByStaff(staffId, businessId);
      if (!ping) return res.json({ ping: null });

      res.json({
        ping: {
          lat: parseFloat(ping.lat),
          lng: parseFloat(ping.lng),
          accuracyMeters: ping.accuracyMeters,
          speedMps: ping.speedMps,
          headingDegrees: ping.headingDegrees,
          batteryLevel: ping.batteryLevel,
          isMoving: ping.isMoving,
          recordedAt: ping.recordedAt,
        },
      });
    } catch (err) {
      console.error('[GPS] /staff/:id/latest error:', err);
      send500(res, 'Failed to fetch latest ping');
    }
  });

  // ─── Customer share links ─────────────────────────────────────────────
  router.post('/links', isAuthenticated, requireEmailVerified, requireGpsPlan, async (req, res) => {
    try {
      const businessId = getBusinessId(req);
      if (!businessId) return res.status(401).json({ error: 'Not authenticated' });

      const parsed = createLinkSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });
      const { jobId, customerId, expiresInMinutes } = parsed.data;

      // Validate job belongs to business
      const [job] = await db.select().from(jobs).where(eq(jobs.id, jobId));
      if (!job || job.businessId !== businessId) {
        return res.status(404).json({ error: 'Job not found' });
      }

      // Honor master toggle
      const [business] = await db.select().from(businesses).where(eq(businesses.id, businessId));
      if (!business?.gpsCustomerShareEnabled) {
        return res.status(403).json({
          code: 'CUSTOMER_SHARE_DISABLED',
          message: 'Customer-facing share links are disabled for this business.',
        });
      }

      const ttlMinutes = expiresInMinutes ?? business.gpsCustomerShareDefaultMinutes ?? 240;
      const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

      // Find active session for this job (link is best-effort tied to current session)
      const activeSessions = await storage.getActiveSessionsByBusiness(businessId);
      const sessionForJob = activeSessions.find(s => s.jobId === jobId);

      const token = generateTrackingToken();
      const link = await storage.createTrackingLink({
        businessId,
        jobId,
        sessionId: sessionForJob?.id ?? null,
        customerId: customerId ?? job.customerId ?? null,
        token,
        expiresAt,
      });

      const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;

      const ctx = getRequestContext(req);
      await logAudit({
        userId: req.user?.id,
        businessId,
        action: 'gps_link_created',
        resource: 'customer_tracking_link',
        resourceId: link.id,
        details: { jobId, customerId: customerId ?? job.customerId ?? null, expiresInMinutes: ttlMinutes },
        ...ctx,
      });

      res.status(201).json({
        linkId: link.id,
        token: link.token,
        url: `${baseUrl}/track/${link.token}`,
        expiresAt: link.expiresAt,
      });
    } catch (err) {
      console.error('[GPS] /links error:', err);
      send500(res, 'Failed to create tracking link');
    }
  });

  router.delete('/links/:linkId', isAuthenticated, requireEmailVerified, requireGpsPlan, async (req, res) => {
    try {
      const businessId = getBusinessId(req);
      if (!businessId) return res.status(401).json({ error: 'Not authenticated' });

      const linkId = parseInt(req.params.linkId, 10);
      if (isNaN(linkId)) return res.status(400).json({ error: 'Invalid linkId' });

      await storage.revokeTrackingLink(linkId, businessId);
      const ctx = getRequestContext(req);
      await logAudit({
        userId: req.user?.id,
        businessId,
        action: 'gps_link_revoked',
        resource: 'customer_tracking_link',
        resourceId: linkId,
        ...ctx,
      });
      res.json({ ok: true });
    } catch (err) {
      console.error('[GPS] /links/:id DELETE error:', err);
      send500(res, 'Failed to revoke link');
    }
  });

  router.get('/jobs/:jobId/links', isAuthenticated, requireEmailVerified, requireGpsPlan, async (req, res) => {
    try {
      const businessId = getBusinessId(req);
      if (!businessId) return res.status(401).json({ error: 'Not authenticated' });

      const jobId = parseInt(req.params.jobId, 10);
      if (isNaN(jobId)) return res.status(400).json({ error: 'Invalid jobId' });

      const links = await storage.getActiveTrackingLinksForJob(jobId, businessId);
      res.json({
        links: links.map(l => ({
          linkId: l.id,
          token: l.token,
          expiresAt: l.expiresAt,
          viewCount: l.viewCount,
          lastViewedAt: l.lastViewedAt,
          createdAt: l.createdAt,
        })),
      });
    } catch (err) {
      console.error('[GPS] /jobs/:id/links error:', err);
      send500(res, 'Failed to list links');
    }
  });

  // ═══════════════════════════════════════════════════════════════════════
  // PUBLIC track endpoint — NO auth, NO CSRF, rate-limited.
  // Mounted directly on `app` because the router-level isAuthenticated chain
  // doesn't apply here.
  // ═══════════════════════════════════════════════════════════════════════
  app.get('/api/gps/public/track/:token', publicTrackLimiter, async (req: Request, res: Response) => {
    try {
      const token = String(req.params.token || '');
      if (!token || token.length < 16 || token.length > 64) {
        return res.status(404).json({ error: 'Tracking link not found' });
      }

      const link = await storage.getTrackingLinkByToken(token);
      if (!link) return res.status(404).json({ error: 'Tracking link not found' });

      // Expiry & revoke check
      const now = new Date();
      if (link.revokedAt) return res.status(410).json({ error: 'Tracking link has been revoked', code: 'REVOKED' });
      if (link.expiresAt < now) return res.status(410).json({ error: 'Tracking link has expired', code: 'EXPIRED' });

      // Fetch context — business, job, latest ping
      const [business] = await db.select().from(businesses).where(eq(businesses.id, link.businessId));
      const [job] = await db.select().from(jobs).where(eq(jobs.id, link.jobId));
      if (!business || !job) return res.status(404).json({ error: 'Tracking link not found' });

      // Honor master toggle even on cached links (owner could have turned it off)
      if (!business.gpsCustomerShareEnabled) {
        return res.status(410).json({ error: 'Tracking is no longer available', code: 'DISABLED' });
      }

      // Get the active session (or the one this link was tied to)
      const session = link.sessionId
        ? await storage.getTrackingSession(link.sessionId, link.businessId)
        : null;

      // Pull tech name + latest ping
      let tech: { firstName: string; lastInitial: string } | null = null;
      let latestPing: any = null;
      if (session) {
        const [staffRow] = await db.select().from(staff).where(eq(staff.id, session.staffId));
        if (staffRow) {
          tech = {
            firstName: staffRow.firstName,
            lastInitial: staffRow.lastName ? staffRow.lastName.charAt(0).toUpperCase() : '',
          };
        }
        const ping = await storage.getLatestPingByStaff(session.staffId, link.businessId);
        if (ping) {
          latestPing = {
            lat: parseFloat(ping.lat),
            lng: parseFloat(ping.lng),
            recordedAt: ping.recordedAt,
            isMoving: ping.isMoving,
          };
        }
      }

      // Compute ETA — haversine from latest ping to job's customerLocationLat/Lng,
      // assume 30mph (13.4m/s) average speed if no speed available.
      let etaMinutes: number | null = null;
      if (latestPing && job.customerLocationLat && job.customerLocationLng) {
        const distMeters = haversineMeters(
          latestPing.lat, latestPing.lng,
          job.customerLocationLat, job.customerLocationLng
        );
        const speedMps = 13.4; // 30mph fallback
        etaMinutes = Math.max(1, Math.round(distMeters / speedMps / 60));
      } else if (job.etaMinutes && job.enRouteAt) {
        // Fall back to tech-provided ETA from the HVAC track if no GPS available
        const elapsedMin = (Date.now() - new Date(job.enRouteAt).getTime()) / 60000;
        etaMinutes = Math.max(1, Math.round(job.etaMinutes - elapsedMin));
      }

      // Increment view count (fire and forget)
      storage.incrementTrackingLinkViews(link.id).catch(e => console.error('[GPS] view increment error:', e));

      // Sanitized payload — NEVER expose other-tenant data, breadcrumb history,
      // or customer-side PII. Destination is intentionally null (customer knows their own address).
      res.json({
        businessName: business.name,
        businessPhone: business.phone || null,
        tech,
        jobStatus: job.status,
        etaMinutes,
        latestPing,
        sessionStatus: session?.status ?? 'ended',
        linkExpiresAt: link.expiresAt,
      });
    } catch (err) {
      console.error('[GPS] public/track error:', err);
      send500(res, 'Failed to load tracking page');
    }
  });

  // ═════════════════════════════════════════════════════════════════════════
  // OWNER SETTINGS — uses requireGpsPlanForSettings (skips gpsTrackingEnabled
  // master toggle check, so owner can configure BEFORE flipping it on).
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * GET /api/gps/settings — Returns current GPS config + tier-capped retention
   * max + list of staff with consent state. Used by the Settings panel.
   */
  router.get('/settings', isAuthenticated, requireEmailVerified, requireGpsPlanForSettings, async (req, res) => {
    try {
      const businessId = getBusinessId(req);
      if (!businessId) return res.status(401).json({ error: 'Not authenticated' });

      const [business] = await db.select().from(businesses).where(eq(businesses.id, businessId));
      if (!business) return res.status(404).json({ error: 'Business not found' });

      const usage = await getUsageInfo(businessId);
      const maxRetentionHours = getGpsRetentionMaxHours(usage.planTier || '');

      // Tech consent table
      const staffRows = await db.select({
        id: staff.id,
        firstName: staff.firstName,
        lastName: staff.lastName,
        email: staff.email,
        gpsConsentAcceptedAt: staff.gpsConsentAcceptedAt,
        gpsConsentVersion: staff.gpsConsentVersion,
        gpsTrackingPaused: staff.gpsTrackingPaused,
      }).from(staff).where(eq(staff.businessId, businessId));

      const currentVersion = business.gpsDisclosureVersion || DEFAULT_DISCLOSURE_VERSION;
      const techs = staffRows.map(s => {
        const check = needsTechReAcceptance(
          { gpsConsentAcceptedAt: s.gpsConsentAcceptedAt, gpsConsentVersion: s.gpsConsentVersion },
          { gpsDisclosureVersion: currentVersion }
        );
        return {
          staffId: s.id,
          name: `${s.firstName}${s.lastName ? ' ' + s.lastName : ''}`,
          email: s.email,
          consentAcceptedAt: s.gpsConsentAcceptedAt,
          consentVersion: s.gpsConsentVersion,
          paused: s.gpsTrackingPaused,
          needsReacceptance: check.required,
          reacceptanceReason: check.reason,
        };
      });

      res.json({
        settings: {
          gpsTrackingEnabled: business.gpsTrackingEnabled,
          gpsRetentionHours: business.gpsRetentionHours ?? 24,
          gpsDisclosureCopy: business.gpsDisclosureCopy || DEFAULT_DISCLOSURE_COPY,
          gpsDisclosureVersion: currentVersion,
          gpsDisclosureIsCustom: !!business.gpsDisclosureCopy,
          gpsCustomerShareEnabled: business.gpsCustomerShareEnabled,
          gpsCustomerShareDefaultMinutes: business.gpsCustomerShareDefaultMinutes ?? 240,
        },
        planTier: usage.planTier || null,
        maxRetentionHours,
        techs,
      });
    } catch (err) {
      console.error('[GPS] /settings GET error:', err);
      send500(res, 'Failed to load settings');
    }
  });

  const settingsUpdateSchema = z.object({
    gpsTrackingEnabled: z.boolean().optional(),
    gpsRetentionHours: z.number().int().min(1).max(168).optional(),
    gpsCustomerShareEnabled: z.boolean().optional(),
    gpsCustomerShareDefaultMinutes: z.number().int().min(15).max(1440).optional(),
  });

  /**
   * PUT /api/gps/settings — Owner updates GPS config (toggle, retention, share defaults).
   * Disclosure copy bumps go through a SEPARATE endpoint to make version-bump intent explicit.
   */
  router.put('/settings', isAuthenticated, requireEmailVerified, requireGpsPlanForSettings, async (req, res) => {
    try {
      const businessId = getBusinessId(req);
      if (!businessId) return res.status(401).json({ error: 'Not authenticated' });

      const parsed = settingsUpdateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });

      // Cap retention to plan max (defense-in-depth — UI already clamps)
      const usage = await getUsageInfo(businessId);
      const maxHours = getGpsRetentionMaxHours(usage.planTier || '');
      if (parsed.data.gpsRetentionHours != null && parsed.data.gpsRetentionHours > maxHours) {
        return res.status(400).json({
          error: 'Retention exceeds plan maximum',
          maxHours,
          requestedHours: parsed.data.gpsRetentionHours,
        });
      }

      // Detect toggle change for audit
      const [before] = await db.select().from(businesses).where(eq(businesses.id, businessId));
      const toggleChanged = parsed.data.gpsTrackingEnabled !== undefined
        && before?.gpsTrackingEnabled !== parsed.data.gpsTrackingEnabled;
      const retentionChanged = parsed.data.gpsRetentionHours !== undefined
        && before?.gpsRetentionHours !== parsed.data.gpsRetentionHours;

      const updateFields: any = { updatedAt: new Date() };
      if (parsed.data.gpsTrackingEnabled !== undefined) updateFields.gpsTrackingEnabled = parsed.data.gpsTrackingEnabled;
      if (parsed.data.gpsRetentionHours !== undefined) updateFields.gpsRetentionHours = parsed.data.gpsRetentionHours;
      if (parsed.data.gpsCustomerShareEnabled !== undefined) updateFields.gpsCustomerShareEnabled = parsed.data.gpsCustomerShareEnabled;
      if (parsed.data.gpsCustomerShareDefaultMinutes !== undefined) updateFields.gpsCustomerShareDefaultMinutes = parsed.data.gpsCustomerShareDefaultMinutes;

      await db.update(businesses).set(updateFields).where(eq(businesses.id, businessId));

      // If owner turned tracking OFF, end all active sessions for this business
      if (parsed.data.gpsTrackingEnabled === false) {
        const active = await storage.getActiveSessionsByBusiness(businessId);
        for (const session of active) {
          try {
            await storage.endTrackingSession(session.id, businessId, 'manual');
          } catch (err) {
            console.error(`[GPS settings] Failed to end session ${session.id} on toggle-off:`, err);
          }
        }
      }

      const ctx = getRequestContext(req);
      if (toggleChanged) {
        await logAudit({
          userId: req.user?.id,
          businessId,
          action: 'gps_tracking_toggled',
          resource: 'business',
          resourceId: businessId,
          details: { enabled: parsed.data.gpsTrackingEnabled },
          ...ctx,
        });
      }
      if (retentionChanged) {
        await logAudit({
          userId: req.user?.id,
          businessId,
          action: 'gps_retention_changed',
          resource: 'business',
          resourceId: businessId,
          details: { from: before?.gpsRetentionHours, to: parsed.data.gpsRetentionHours },
          ...ctx,
        });
      }

      res.json({ ok: true });
    } catch (err) {
      console.error('[GPS] /settings PUT error:', err);
      send500(res, 'Failed to update settings');
    }
  });

  const disclosureUpdateSchema = z.object({
    copy: z.string().max(10000).nullable(), // null = reset to default
  });

  /**
   * PUT /api/gps/disclosure — Bump the disclosure version with new copy.
   * Sets gpsDisclosureCopy + gpsDisclosureVersion = today's ISO date.
   * Forces all techs to re-accept on their next session.
   */
  router.put('/disclosure', isAuthenticated, requireEmailVerified, requireGpsPlanForSettings, async (req, res) => {
    try {
      const businessId = getBusinessId(req);
      if (!businessId) return res.status(401).json({ error: 'Not authenticated' });

      const parsed = disclosureUpdateSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: 'Invalid body', details: parsed.error.flatten() });

      const result = await bumpDisclosureVersion(businessId, parsed.data.copy);

      const ctx = getRequestContext(req);
      await logAudit({
        userId: req.user?.id,
        businessId,
        action: 'gps_disclosure_updated',
        resource: 'business',
        resourceId: businessId,
        details: { newVersion: result.version, isCustom: parsed.data.copy !== null, length: parsed.data.copy?.length ?? 0 },
        ...ctx,
      });

      res.json({ version: result.version });
    } catch (err) {
      console.error('[GPS] /disclosure PUT error:', err);
      send500(res, 'Failed to update disclosure');
    }
  });

  /**
   * POST /api/gps/staff/:staffId/revoke-consent — Owner-triggered revoke.
   * Clears the tech's gpsConsentAcceptedAt + gpsConsentVersion so they MUST
   * re-accept before their next session.
   */
  router.post('/staff/:staffId/revoke-consent', isAuthenticated, requireEmailVerified, requireGpsPlanForSettings, async (req, res) => {
    try {
      const businessId = getBusinessId(req);
      if (!businessId) return res.status(401).json({ error: 'Not authenticated' });

      const staffId = parseInt(req.params.staffId, 10);
      if (isNaN(staffId)) return res.status(400).json({ error: 'Invalid staffId' });

      const [staffRow] = await db.select().from(staff).where(eq(staff.id, staffId));
      if (!staffRow || staffRow.businessId !== businessId) {
        return res.status(404).json({ error: 'Staff not found' });
      }

      await revokeTechConsent(staffId, businessId);

      const ctx = getRequestContext(req);
      await logAudit({
        userId: req.user?.id,
        businessId,
        action: 'gps_consent_revoked_by_owner',
        resource: 'staff',
        resourceId: staffId,
        ...ctx,
      });

      res.json({ ok: true });
    } catch (err) {
      console.error('[GPS] /staff/:id/revoke-consent error:', err);
      send500(res, 'Failed to revoke consent');
    }
  });

  // Mount the authenticated router at /api/gps
  app.use('/api/gps', router);
}
