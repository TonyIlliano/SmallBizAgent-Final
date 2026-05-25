# GPS Tracking Feature — Implementation Plan

**Status:** Planning phase. No code shipped.
**Locked decisions:** Growth tier paywall ($299), one-shot ETA on Free/Starter, Pro gets 7-day retention, default 24h retention, `@capacitor-community/background-geolocation`, owner-customizable disclosure, all tables `businessId`-scoped, **Google Maps** for dispatcher + customer pages (reuse existing `VITE_GOOGLE_PLACES_API_KEY`), **customer SMS tracking link is opt-in per send** (legal/TCPA — tech must explicitly tap "Share live location" on the job, never auto-attached to en_route SMS).

---

## Architectural Decisions That Need Confirmation Before Code

These are choices I'd make if uninterrupted. Flag any you want changed.

| # | Decision | Rationale |
|---|---|---|
| A1 | New domain module `server/storage/gpsTracking.ts` (parallels `sms-intelligence.ts`, `workflows.ts`) | Keeps GPS logic isolated; easy to feature-flag |
| A2 | Plan gate accepts `growth`, `pro`, plus legacy `professional`, `business` as fallback | Mirrors `websiteBuilderRoutes.ts` pattern — legacy tier names persisted on grandfathered customers |
| A3 | Public track endpoint uses `app.get('/api/gps/public/track/:token')` registered BEFORE auth/CSRF middleware in `server/index.ts` (joining the existing exempt list) | Follows Twilio webhook + booking-page pattern |
| A4 | Disclosure version is just an ISO date string (`'2026-05-24'`) bumped manually by owner OR auto-bumped when copy changes | Simple, auditable, no extra table |
| A5 | Server validates `recordedAt` is within `[now - 30min, now + 5min]`. Older = drop with `code: 'stale_ping'`. Future = drop. | Defends against device clock skew + replay |
| A6 | Pings store NUMERIC(10,7) for lat/lng (~1cm precision). NOT geography/geometry types. | No PostGIS dependency. Plain numeric is enough for the dispatcher map. Haversine in app code. |
| A7 | Public track endpoint computes ETA on the fly from latest ping → job's `customerLocationLat/Lng` (already on `jobs` table from HVAC track) via haversine + speed/30mph fallback | Reuses HVAC fields. No new fields needed for ETA. |
| A8 | **LOCKED — Map library: Google Maps JavaScript API** via `@react-google-maps/api`. Reuses the existing `VITE_GOOGLE_PLACES_API_KEY` (already authorized for Maps JavaScript API in your Google Cloud project — verify Maps JavaScript API is enabled alongside Places). Server-side endpoints stay unchanged (no map work on server). | Owner already has the API key + billing set up. Polished UI matches what customers expect. Free tier covers 28K map loads/mo + 100K Directions calls/mo (more than enough). |
| A9 | Mobile background tracking runs ONLY when a `tech_tracking_sessions` row is `active`. Tech explicitly starts it from the "I'm On My Way" CTA on a job — never auto-starts. | Consent-first. No accidental tracking outside dispatch context. |
| A10 | Customer share token format: `nanoid(32)` (URL-safe, ~190 bits entropy). Stored as plain text (no need to hash — token IS the secret, used like an unguessable URL). Rate limited globally. | Matches existing invoice/quote access token pattern. |
| A11 | `gps_tracking_paused = true` on staff means the watcher stays registered but pings are dropped client-side AND server-side. Resume restarts the flow without ending the session. | Lets techs take a lunch break without manager seeing them sit still |
| A12 | Founder accounts bypass plan gate (consistent with other gated features like website builder, GBP, lead discovery) | Documented pattern |
| A13 | `GPS_FEATURE_ENABLED` env var (default true). When false, all routes return 501 + scheduler skips + Settings UI shows "feature disabled" message. | Kill switch matches Lead Discovery pattern |
| A14 | Mobile flush interval: every 30 seconds OR every 10 pings, whichever first. Backlog persisted to `localStorage` (Capacitor maps to Preferences/SharedPreferences). | Reduces network for slow-moving techs; survives app kill |
| A15 | NOT building geofencing, driving behavior scoring, or auto-time-clock in this feature. Explicit out-of-scope. | Scope discipline |

---

## PR 1 — Schema + Migrations + Storage

### Files added
- `server/storage/gpsTracking.ts` (new, ~280 lines)

### Files modified
- `shared/schema.ts` — add 3 tables, 6 columns to `businesses`, 3 columns to `staff`, insert schemas, types
- `server/migrations/runMigrations.ts` — register 3 idempotent migrations
- `server/storage/index.ts` — wire IStorage interface signatures + DatabaseStorage assignments (10 new methods)
- `CLAUDE.md` — schema docs, file reference, last-updated bump

### Schema details

**Table: `tech_location_pings`** (append-only breadcrumb log)
```ts
export const techLocationPings = pgTable("tech_location_pings", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businesses.id, { onDelete: "restrict" }),
  staffId: integer("staff_id").notNull().references(() => staff.id, { onDelete: "restrict" }),
  jobId: integer("job_id").references(() => jobs.id, { onDelete: "set null" }),
  lat: numeric("lat", { precision: 10, scale: 7 }).notNull(),
  lng: numeric("lng", { precision: 10, scale: 7 }).notNull(),
  accuracyMeters: real("accuracy_meters"),
  speedMps: real("speed_mps"),
  headingDegrees: real("heading_degrees"),
  altitudeMeters: real("altitude_meters"),
  batteryLevel: real("battery_level"),
  isMoving: boolean("is_moving").default(false),
  source: text("source").default("background"), // 'background' | 'foreground' | 'manual'
  recordedAt: timestamp("recorded_at").notNull(),
  receivedAt: timestamp("received_at").defaultNow().notNull(),
}, (t) => ({
  idxBusinessStaffTime: index("idx_pings_business_staff_time").on(t.businessId, t.staffId, t.recordedAt),
  idxJobTime: index("idx_pings_job_time").on(t.jobId, t.recordedAt),
  idxBusinessReceived: index("idx_pings_business_received").on(t.businessId, t.receivedAt),
}));
```

**Table: `tech_tracking_sessions`** (one active session per tech, partial unique index enforces it)
```ts
export const techTrackingSessions = pgTable("tech_tracking_sessions", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businesses.id, { onDelete: "restrict" }),
  staffId: integer("staff_id").notNull().references(() => staff.id, { onDelete: "restrict" }),
  jobId: integer("job_id").references(() => jobs.id, { onDelete: "set null" }),
  status: text("status").notNull(), // 'active' | 'paused' | 'ended'
  startedAt: timestamp("started_at").defaultNow().notNull(),
  endedAt: timestamp("ended_at"),
  endReason: text("end_reason"), // 'manual' | 'job_completed' | 'shift_end' | 'auto_timeout' | 'permissions_revoked'
  disclosureAcceptedAt: timestamp("disclosure_accepted_at"),
  disclosureVersion: text("disclosure_version"),
  lastPingAt: timestamp("last_ping_at"),
  pingCount: integer("ping_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  idxBusinessActive: index("idx_sessions_business_active").on(t.businessId, t.status),
  idxStaffActive: index("idx_sessions_staff_active").on(t.staffId, t.status),
  // Partial unique index created manually in migration (drizzle-kit can't express WHERE clauses on uniques cleanly)
}));
```
Plus raw SQL in migration:
```sql
CREATE UNIQUE INDEX IF NOT EXISTS uniq_one_active_session_per_staff
  ON tech_tracking_sessions (staff_id) WHERE status = 'active';
```

**Table: `customer_tracking_links`** (public share tokens)
```ts
export const customerTrackingLinks = pgTable("customer_tracking_links", {
  id: serial("id").primaryKey(),
  businessId: integer("business_id").notNull().references(() => businesses.id, { onDelete: "restrict" }),
  jobId: integer("job_id").notNull().references(() => jobs.id, { onDelete: "cascade" }),
  sessionId: integer("session_id").references(() => techTrackingSessions.id, { onDelete: "set null" }),
  customerId: integer("customer_id").references(() => customers.id, { onDelete: "set null" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  viewCount: integer("view_count").default(0),
  lastViewedAt: timestamp("last_viewed_at"),
  revokedAt: timestamp("revoked_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (t) => ({
  idxJob: index("idx_tracking_links_job").on(t.jobId, t.createdAt),
  idxExpires: index("idx_tracking_links_expires").on(t.expiresAt),
}));
```

**Additions to `businesses` table:**
- `gpsTrackingEnabled boolean default(false) NOT NULL`
- `gpsRetentionHours integer default(24) NOT NULL`
- `gpsDisclosureCopy text` (null → use service default)
- `gpsDisclosureVersion text`
- `gpsCustomerShareEnabled boolean default(true) NOT NULL`
- `gpsCustomerShareDefaultMinutes integer default(240) NOT NULL`

**Additions to `staff` table:**
- `gpsConsentAcceptedAt timestamp`
- `gpsConsentVersion text`
- `gpsTrackingPaused boolean default(false) NOT NULL`

### Insert schemas + types
```ts
export const insertTechLocationPingSchema = createInsertSchema(techLocationPings).omit({ id: true, receivedAt: true });
export const insertTechTrackingSessionSchema = createInsertSchema(techTrackingSessions).omit({ id: true, startedAt: true, createdAt: true });
export const insertCustomerTrackingLinkSchema = createInsertSchema(customerTrackingLinks).omit({ id: true, createdAt: true, viewCount: true, lastViewedAt: true });

export type TechLocationPing = typeof techLocationPings.$inferSelect;
export type InsertTechLocationPing = z.infer<typeof insertTechLocationPingSchema>;
// ... etc for sessions + links
```

### Migration functions (server/migrations/runMigrations.ts)

Three new functions, registered after `ensureLeadsTables()`:

1. **`ensureGpsTrackingTables()`** — Tracked via `migrations` table. `CREATE TABLE IF NOT EXISTS` for all 3 tables. Then 3 `CREATE INDEX IF NOT EXISTS` on each, plus the partial unique index (with a `pg_indexes` existence check before `CREATE UNIQUE INDEX` since `IF NOT EXISTS` doesn't handle the partial case in all PG versions).

2. **`addGpsColumnsToBusinesses()`** — 6 `addColumnIfNotExists` calls. Not tracked (idempotent and fast).

3. **`addGpsColumnsToStaff()`** — 3 `addColumnIfNotExists` calls.

### Storage module (`server/storage/gpsTracking.ts`)

10 exported async functions:

```ts
// Session lifecycle
createTrackingSession(data: InsertTechTrackingSession): Promise<TechTrackingSession>
getActiveSessionByStaff(staffId: number, businessId: number): Promise<TechTrackingSession | undefined>
getActiveSessionsByBusiness(businessId: number): Promise<TechTrackingSession[]>
endTrackingSession(sessionId: number, businessId: number, reason: string): Promise<TechTrackingSession>
updateSessionPingMeta(sessionId: number, businessId: number, lastPingAt: Date, increment: number): Promise<void>

// Ping ingestion
createLocationPings(businessId: number, pings: InsertTechLocationPing[]): Promise<number>
getPingsForJob(jobId: number, businessId: number, opts?: { limit?: number; since?: Date }): Promise<TechLocationPing[]>
getPingsForSession(sessionId: number, businessId: number, opts?: { limit?: number; since?: Date }): Promise<TechLocationPing[]>
getLatestPingByStaff(staffId: number, businessId: number): Promise<TechLocationPing | undefined>

// Share links
createTrackingLink(data: InsertCustomerTrackingLink): Promise<CustomerTrackingLink>
getTrackingLinkByToken(token: string): Promise<CustomerTrackingLink | undefined>
incrementTrackingLinkViews(linkId: number): Promise<void>
revokeTrackingLink(linkId: number, businessId: number): Promise<void>
getActiveTrackingLinksForJob(jobId: number, businessId: number): Promise<CustomerTrackingLink[]>

// Retention
deleteExpiredPings(businessId: number, cutoff: Date): Promise<number>
deleteExpiredLinks(): Promise<number>  // global; called from sweeper for revoked/expired
```

**Tenant safety throughout:** Every query filters by `businessId` in the WHERE clause. Never reads it from the row only.

### IStorage wiring (server/storage/index.ts)
- Add 16 method signatures to `IStorage` interface (one per exported function above, minus `deleteExpiredLinks` which is global)
- Add 16 assignments to `DatabaseStorage` class constructor (`this.createTrackingSession = gpsFns.createTrackingSession;` etc.)
- Add `import * as gpsFns from "./gpsTracking";` at top
- Import new types from `@shared/schema`

### CLAUDE.md updates after PR 1
- New "GPS Tracking" subsection under Database Schema (3 tables documented)
- 6 new business columns + 3 new staff columns documented in their tables
- Add `gpsTracking.ts` to File Quick Reference under storage modules
- Bump "Last updated" with summary line

### Risk register for PR 1
| Risk | Mitigation |
|---|---|
| Drizzle can't express partial unique index | Create via raw SQL in migration, check existence via `pg_indexes` |
| `numeric(10,7)` returns as string from Postgres | Document. Server code uses `parseFloat()` before haversine. UI casts to number. |
| FK to staff with `RESTRICT` blocks staff deletion | Acceptable. Owner must end-session before deleting staff (or we add a cascade-on-staff-soft-delete in a future PR) |
| Migrations run before fields used (boot order) | Already handled by existing `runMigrations()` boot sequence |

---

## PR 2 — Plan Gate + Disclosure Service

### Files added
- `server/middleware/gpsPlanGate.ts` (~60 lines)
- `server/services/gpsDisclosureService.ts` (~140 lines)

### Files modified
- `CLAUDE.md` — add disclosure service to Server Services table; add gate to middleware section

### `gpsPlanGate.ts` shape
```ts
const ALLOWED_TIERS = new Set(['growth', 'pro', 'professional', 'business']);  // legacy fallback

export async function requireGpsPlan(req, res, next) {
  if (req.user?.role === 'admin') return next();
  // Founder bypass — read SUBSCRIPTION_LAUNCH_DATE pattern from subscriptionService
  const businessId = req.user?.businessId;
  if (!businessId) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const [business] = await db.select().from(businesses).where(eq(businesses.id, businessId));
    if (!business) return res.status(404).json({ error: 'Business not found' });

    // Get plan tier from subscription_plans via stripePlanId, OR use subscriptionStatus shortcut
    // (mirroring usageService.isFreePlan pattern)
    const tier = await resolvePlanTier(business);  // helper
    if (!ALLOWED_TIERS.has(tier)) {
      return res.status(402).json({
        code: 'GPS_PLAN_REQUIRED',
        upgradeUrl: '/settings?tab=subscription',
        currentTier: tier,
        requiredTier: 'growth',
        message: 'GPS tracking requires Growth plan or higher.',
      });
    }
    next();
  } catch (err) {
    console.error('[gpsPlanGate]', err);
    next();  // fail open
  }
}

export function getGpsRetentionMaxHours(tier: string): number {
  if (tier === 'pro' || tier === 'business') return 168;
  if (tier === 'growth' || tier === 'professional') return 24;
  return 0;
}
```

### `gpsDisclosureService.ts` shape
```ts
export const DEFAULT_DISCLOSURE_VERSION = '2026-05-24';
export const DEFAULT_DISCLOSURE_COPY = `Location Tracking Notice ...`;  // see plan source
export const CONSENT_REPROMPT_AFTER_DAYS = 90;  // CYA reprompt window

export interface ActiveDisclosure {
  copy: string;
  version: string;
  isCustom: boolean;
}

export interface ReacceptanceCheck {
  required: boolean;
  reason: 'version_mismatch' | 'expired_90_days' | 'never_accepted' | null;
  staleSince?: Date;
}

export async function getActiveDisclosure(businessId: number): Promise<ActiveDisclosure>;
export function renderDisclosure(template: string, vars: { businessName: string; retentionHours: number }): string;

// Returns ReacceptanceCheck with reason. Triggers reprompt when ANY of:
//   - staff has never accepted (gpsConsentAcceptedAt is null)
//   - staff.gpsConsentVersion !== business.gpsDisclosureVersion (owner bumped copy)
//   - staff.gpsConsentAcceptedAt < now - 90 days (CYA model — even if version unchanged)
export function needsTechReAcceptance(
  staff: { gpsConsentAcceptedAt: Date | null; gpsConsentVersion: string | null },
  business: { gpsDisclosureVersion: string | null }
): ReacceptanceCheck;

export async function recordTechAcceptance(staffId: number, businessId: number, version: string): Promise<void>;
export async function bumpDisclosureVersion(businessId: number, newCopy: string | null): Promise<{ version: string }>;
```

**90-day expiry behavior**: When `needsTechReAcceptance` returns `reason: 'expired_90_days'`, the consent dialog shown to the tech is identical in copy but includes a small header note "Your last acceptance was X days ago. Please confirm you're still aware of this policy." On accept, `recordTechAcceptance` writes a fresh `gpsConsentAcceptedAt = now`. A new audit action `gps_consent_expired_reprompt` is logged.

**No background job needed** — the check is lazy (only runs when a tech tries to start a session). Avoids waking sleeping accounts.

### Risk register for PR 2
| Risk | Mitigation |
|---|---|
| Plan tier resolution might not match across `usageService`, `websiteBuilderRoutes`, `planGate` | Extract a shared `getEffectivePlanTier(business)` helper in `usageService.ts` and reuse |
| Default copy may not satisfy specific state laws | Owner can override per business. Doc lists explicit-consent states. |

---

## PR 3 — Ingestion API (Server Routes)

### Files added
- `server/routes/gpsTrackingRoutes.ts` (~450 lines, 10 endpoints)

### Files modified
- `server/routes.ts` — mount `registerGpsTrackingRoutes(app)` after `registerLeadDiscoveryRoutes`
- `server/index.ts` — add `/api/gps/public/track/` to CSRF exempt paths (line ~Twilio webhook setup)
- `CLAUDE.md` — add route file to API Route Files table; document endpoints

### Endpoints
All authenticated + `requirePaidPlan` + `requireGpsPlan` except where noted:

| Method | Path | Notes |
|---|---|---|
| POST | `/api/gps/sessions/start` | Body `{ staffId, jobId?, disclosureVersion }` |
| POST | `/api/gps/sessions/:sessionId/end` | Body `{ reason }` |
| POST | `/api/gps/sessions/:sessionId/pause` | Body `{ paused }` |
| POST | `/api/gps/pings` | Batch up to 50 |
| GET | `/api/gps/sessions/active` | Dispatcher live list |
| GET | `/api/gps/jobs/:jobId/breadcrumb` | `?since=ISO8601&limit=` |
| GET | `/api/gps/staff/:staffId/latest` | Single ping |
| POST | `/api/gps/links` | Create share link |
| DELETE | `/api/gps/links/:linkId` | Revoke |
| GET | `/api/gps/public/track/:token` | **PUBLIC** — no auth, no CSRF, rate-limited |
| GET | `/api/gps/disclosure` | Get current disclosure for mobile consent dialog |
| POST | `/api/gps/consent/accept` | Tech records acceptance |
| GET | `/api/gps/export/staff/:staffId` | Owner CSV export (audit/labor) |

### Validation
- Lat in `[-90, 90]`, Lng in `[-180, 180]`
- `accuracyMeters < 500` (drop noisy GPS)
- `recordedAt` within `[now - 30min, now + 5min]`
- Batch size ≤ 50 pings per request
- All ping-rejections returned in response so client can drop them from queue

### Rate limiting
- `gpsPingLimiter`: 120 req/min/session (note: per-session, not per-IP, since techs share office WiFi)
- Implementation: in-memory token bucket keyed by sessionId, falls back to express-rate-limit per-user
- Public endpoint: 60 req/min/IP (express-rate-limit)

### Public endpoint payload
```json
{
  "businessName": "Joe's HVAC",
  "businessPhone": "+1330...",
  "tech": { "firstName": "Mike", "lastInitial": "S" },
  "jobStatus": "en_route",
  "etaMinutes": 12,
  "latestPing": { "lat": "40.7128", "lng": "-74.0060", "recordedAt": "2026-05-24T14:30:00Z" },
  "destination": null,  // Customer address NOT exposed to themselves (they know it)
  "linkExpiresAt": "2026-05-24T18:00:00Z"
}
```

### Risk register for PR 3
| Risk | Mitigation |
|---|---|
| Public endpoint enumeration | 32-char nanoid token (~190 bits entropy), rate limited, 410-on-expiry |
| Cross-tenant ping insert via stale session | Server validates `session.businessId === req.user.businessId` AND `session.staffId === pings[].staffId` |
| Replay attacks (resend old pings) | Drop pings where `recordedAt < now - 30min` |
| DOS via huge batch | Cap 50; oversize request → 413 |
| Clock-skew on tech device | Store both `recordedAt` (device) and `receivedAt` (server). Sweeper + ETA use `receivedAt`. |

---

## PR 4 — Capacitor Mobile Integration

### NPM dependencies added
- `@capacitor-community/background-geolocation` (peer to `@capacitor/core`)

### Files added
- `client/src/lib/capacitor-gps.ts` (~250 lines)
- `client/src/components/gps/GpsConsentDialog.tsx` (~180 lines)
- `client/src/components/gps/TrackingStatusBar.tsx` (~120 lines)

### Files modified
- `capacitor.config.ts` — add `BackgroundGeolocation` plugin config
- `ios/App/App/Info.plist` — 3 new keys: WhenInUse desc, AlwaysAndWhenInUse desc, UIBackgroundModes += 'location'
- `android/app/src/main/AndroidManifest.xml` — 5 new permissions + foreground service declaration
- `client/src/components/jobs/OnMyWayCard.tsx` — when on Growth+ AND `gpsTrackingEnabled`, after en_route SMS, prompt to start GPS session
- `DEPLOYMENT_MOBILE.md` — Xcode capability checklist additions
- `CLAUDE.md` — add 3 new files to File Quick Reference, document consent flow

### `capacitor-gps.ts` exports
```ts
export interface GpsTrackerConfig { sessionId: number; intervalSeconds?: number; distanceFilterMeters?: number; }
export async function startTracking(config: GpsTrackerConfig): Promise<{ ok: boolean; reason?: string }>;
export async function stopTracking(): Promise<{ totalPings: number; flushedSuccessfully: number }>;
export async function pauseTracking(): Promise<void>;
export async function resumeTracking(): Promise<void>;
export async function getPermissionStatus(): Promise<'granted' | 'denied' | 'prompt'>;
export async function flushNow(): Promise<{ accepted: number; rejected: number }>;
```

### Queue & flush behavior
- In-memory queue of `PingDraft[]`
- On each location event from plugin: push to queue, check thresholds
- Flush when `queue.length >= 10` OR `30s` since last flush
- POST `/api/gps/pings`; on success drop pings from queue
- On network failure: persist queue to `Capacitor.Preferences` (`@capacitor/preferences`)
- On app resume / connection restore: drain stored queue before new pings

### iOS Info.plist additions
```xml
<key>NSLocationWhenInUseUsageDescription</key>
<string>We use your location to coordinate dispatch and send accurate ETAs to customers.</string>
<key>NSLocationAlwaysAndWhenInUseUsageDescription</key>
<string>Tracking continues while you're on a job, even when the app is in the background. You can pause or stop tracking from your device at any time.</string>
<key>UIBackgroundModes</key>
<array>
  <string>remote-notification</string>
  <string>location</string>
</array>
```

### Android AndroidManifest additions
```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />
<!-- inside <application>: -->
<service android:name="com.capacitorjs.community.plugins.bgcapacitor.BackgroundGeolocationService"
         android:foregroundServiceType="location"
         android:exported="false" />
```

### Consent dialog flow
1. Tech taps "I'm on my way" on a job (existing button)
2. Existing one-shot ETA SMS fires (existing behavior — keep)
3. If on Growth+ AND business has `gpsTrackingEnabled` AND no active session:
   - Fetch `GET /api/gps/disclosure`
   - If `needsTechReAcceptance`: show `<GpsConsentDialog>` with disclosure text
   - On accept: `POST /api/gps/consent/accept` → `POST /api/gps/sessions/start` → `startTracking()`
   - On decline: do nothing (one-shot ETA still works)
4. Show `<TrackingStatusBar>` persistently while session active

### Risk register for PR 4
| Risk | Mitigation |
|---|---|
| User denies permission mid-shift | Plugin error → `endTrackingSession(reason='permissions_revoked')` → server logs |
| App killed by OS while tracking | Plugin runs as foreground service; auto-resumes. Queue survives in Preferences. |
| Battery complaints from techs | `distanceFilter: 25m` + `pauseOnStationary: true` means stationary techs cost ~nothing. Document. |
| Geolocation plugin doesn't work in browser dev | Web fallback returns mock `{ ok: false, reason: 'unsupported_in_browser' }`. Capacitor target only. |

---

## PR 5 — Dispatcher Dashboard UI

### NPM dependencies added
- `@react-google-maps/api` (peer dep `react` already present)

### Pre-flight check (must complete BEFORE PR 5 ships)
- In Google Cloud Console, confirm the project that owns `VITE_GOOGLE_PLACES_API_KEY` has **Maps JavaScript API** enabled (in addition to Places).
- Confirm HTTP-referrer restrictions on the key allow `https://smallbizagent.ai/*`, `https://www.smallbizagent.ai/*`, and `http://localhost:*`.
- If the key is restricted to Places only, either (a) enable Maps JavaScript API on the existing key, or (b) generate a second key `VITE_GOOGLE_MAPS_API_KEY` and add it to Railway. Plan assumes option (a).

### Files added
- `client/src/pages/dispatch/index.tsx` (~250 lines)
- `client/src/components/dispatch/DispatchMap.tsx` (~180 lines, Google Maps wrapper via `@react-google-maps/api`)
- `client/src/components/dispatch/ActiveTechList.tsx` (~90 lines)
- `client/src/components/dispatch/TechDetailPanel.tsx` (~130 lines)
- `client/src/components/dispatch/BreadcrumbPlayer.tsx` (~140 lines, uses Polyline + animated Marker)
- `client/src/lib/google-maps-loader.ts` (~50 lines, singleton `useJsApiLoader` config so map + customer page share the same script tag — Google charges per script load)

### Files modified
- `client/src/App.tsx` — lazy-import Dispatch page + `ProtectedRoute` at `/dispatch`
- `client/src/components/layout/Sidebar.tsx` — add Dispatch nav item, gated by role + plan
- `CLAUDE.md` — add `/dispatch` to Protected Routes table; add files to Quick Reference

### Data flow
- Polls `GET /api/gps/sessions/active` every 10s
- On tech select: fetches `GET /api/gps/jobs/:jobId/breadcrumb`
- Breadcrumb player: scrubs through timestamps, animates marker along path
- "X seconds ago" indicator updates from `lastPingAt` (relative time formatter)

### Layout (desktop)
```
+--------------------------------------------+
| Dispatch                                    |
+----------+---------------------+-----------+
| Active   |                     | Selected  |
| Techs    |       MAP           | Tech      |
| (list)   |                     | Detail    |
|          |                     |           |
+----------+---------------------+-----------+
```

### Layout (mobile)
- Single column. Map on top, active tech list below. Tech detail in modal.

### Risk register for PR 5
| Risk | Mitigation |
|---|---|
| Google Maps script loads twice (dispatcher + customer) on same session | Singleton `useJsApiLoader` in `client/src/lib/google-maps-loader.ts` — same key, same libraries array reused everywhere |
| Maps JavaScript API not enabled on the existing key | Pre-flight check (see top of PR 5). Ship blocked until verified. |
| Billing surprise from Google | Set Google Cloud budget alert at $50/mo before ship. Free tier (28K loads/mo) covers ~900 dispatcher opens/day across all tenants. |
| Map marker spam at 100+ techs per business | Use `@googlemaps/markerclusterer` (free, official) if `activeSessions.length > 30` |
| Polling load on server | 10s interval × N dispatchers per business is fine. WebSockets future PR. |
| API key referrer restrictions leak the key in client JS | Acceptable — restrictions on the Google Cloud side (HTTP referrer allowlist) make a leaked key unusable elsewhere |

---

## PR 6 — Customer-Facing Track Page

### Files added
- `client/src/pages/track/[token].tsx` (~220 lines)

### Files modified
- `client/src/App.tsx` — public route `/track/:token` (NOT inside `<ProtectedRoute>`)
- `client/src/pages/jobs/[id].tsx` — add "Share Live Location with Customer" section. **Manual button. Never auto-attached to en_route SMS.**
- `client/src/components/jobs/OnMyWayCard.tsx` — **unchanged behavior for SMS**. After GPS session starts, surface a separate "Send tracking link to customer" button below the existing "I've Arrived" button. Two-tap pattern: tap 1 starts tracking, tap 2 sends the link.
- `server/services/notificationService.ts` — **new function** `sendJobTrackingLinkSms(jobId, businessId, trackingUrl)` — explicit transactional SMS triggered ONLY by the manual "Send tracking link" action. Existing `sendJobEnRouteNotification` is NOT modified.
- `CLAUDE.md` — add `/track/:token` to public routes table; document opt-in pattern

### Customer UI
- Mobile-first responsive
- Single map marker (tech), no breadcrumb history shown
- Header: "Mike is on the way!" + ETA pill
- Below map: Business name, "Call us" button (`tel:` link)
- Polls every 15s
- Final state: "Service started" / "Service complete" / "Tracking ended" when session ends
- Expired link: "This tracking link has expired. Contact [business] for an update."

### SMS template (separate, opt-in send)
The standard en_route SMS (already shipped in HVAC track) is unchanged:
```
On my way! ETA: 30 min — Mike from Joe's HVAC.
```

When tech taps "Send tracking link to customer", a **second, separate transactional SMS** is sent:
```
Track Mike's live location: https://smallbizagent.ai/track/abc123def456...
Link expires in 4 hours.
```

**Why two separate SMS, not one combined**:
- **Customer consent shape**: customer opted into transactional SMS by booking. Auto-attaching a tracking URL to every en_route SMS arguably exceeds that scope — it's a *new category of data sharing* (real-time location of an employee). Per-send tech action makes the data-sharing decision explicit and per-call rather than per-business.
- **TCPA exposure**: keeping tracking-link sends as a tech-initiated action ensures we never accidentally send one to a customer who, e.g., texted STOP earlier (the existing `canSendSms()` chokepoint still applies — but a separate send is easier to gate).
- **Auditability**: every tracking-link share lands its own `notification_log` row with type `'job_tracking_link_sent'`, making it trivial to answer "did we share location with this customer?" in a dispute.
- **Owner control**: per-business toggle `gpsCustomerShareEnabled` still applies as a master kill switch. When false, the "Send tracking link" button is hidden entirely.

**Per-job state**: After link sent, the OnMyWayCard shows "✅ Tracking link sent to customer (Xm ago) · Revoke link". Owner or tech can revoke at any time from this card.

### Risk register for PR 6
| Risk | Mitigation |
|---|---|
| Customer shares link on Facebook → anyone can track | Token rate-limited per IP + expires in 4h. Acceptable disclosure risk. Owner can revoke. |
| Tech sees customer geolocation via tracking page | Page hides destination. Customer sees only tech. |
| Link in SMS triggers spam filters | Use `APP_URL` (own domain). Don't use URL shorteners (look like phishing). |
| Customer claims they never consented to location sharing | Tech-initiated per-send model. `notification_log` row + audit log row both exist for every share. Tech UI shows explicit "Send tracking link" button, not auto. |
| Tech sends link to customer who texted STOP | Existing `canSendSms()` gate applies to the new send. Suppression list check still runs. |

---

## PR 7 — Retention Sweeper + Audit

### Files modified
- `server/services/schedulerService.ts` — add `startGpsRetentionSweeper()` (hourly, double-guarded)
- `server/services/auditService.ts` — extend `AuditAction` type with 8 new actions
- All routes in PR 3 — add `logAudit()` calls
- `CLAUDE.md` — document new scheduler + audit actions

### Sweeper logic
```ts
async function runGpsRetentionSweep() {
  const businesses = await storage.getAllBusinesses();
  let totalPings = 0;
  for (const biz of businesses) {
    if (!biz.gpsTrackingEnabled) continue;
    const cutoff = new Date(Date.now() - biz.gpsRetentionHours * 60 * 60 * 1000);
    const deleted = await storage.deleteExpiredPings(biz.id, cutoff);
    totalPings += deleted;
    if (deleted > 0) console.log(`[GPS Retention] Business ${biz.id}: deleted ${deleted} pings older than ${cutoff.toISOString()}`);
  }
  const linksDeleted = await storage.deleteExpiredLinks();
  console.log(`[GPS Retention] Sweep complete: ${totalPings} pings, ${linksDeleted} links`);
}
```

### Audit actions added
- `gps_session_started`, `gps_session_ended`, `gps_session_paused`
- `gps_disclosure_updated`, `gps_retention_changed`, `gps_tracking_toggled`
- `gps_link_created`, `gps_link_revoked`, `gps_export_downloaded`
- `gps_consent_accepted`, `gps_consent_expired_reprompt`, `gps_consent_revoked_by_owner`

### Compliance export
- `GET /api/gps/export/staff/:staffId` — owner-only
- Returns CSV with all pings for staff member (no limit, but caps at 10K rows per response)
- Logged as `gps_export_downloaded` with `targetStaffId` in details

### Risk register for PR 7
| Risk | Mitigation |
|---|---|
| Sweeper deletes pings that owner wanted to keep | Owner exports BEFORE retention bites (UI nudge: "Export now if you want a copy beyond {N}h") |
| Concurrent sweep races with insert | `DELETE WHERE received_at < cutoff` — narrow lock window. No conflict with new inserts. |
| Sweeper hangs on huge business | Per-business loop with `LIMIT 10000` per pass. Run again next hour if needed. |

---

## PR 8 — Settings UI

### Files added
- `client/src/components/settings/GpsTrackingSettings.tsx` (~350 lines)

### Files modified
- `client/src/pages/settings.tsx` (or `settings/CommunicationSection.tsx` — TBD by inspecting current layout) — mount the new component
- `server/routes/businessRoutes.ts` — add `PUT /business/:id/gps-settings` endpoint
- `server/routes/staffRoutes.ts` — add `POST /staff/:id/revoke-gps-consent` endpoint
- `CLAUDE.md` — document settings location

### Settings panel sections
1. **Master toggle** — `gpsTrackingEnabled`. When off, all sessions force-ended on save.
2. **Retention** — slider 1h–24h (Growth) or 1h–168h (Pro). Disabled for non-Growth+.
3. **Customer share** — toggle + default TTL dropdown (30m/1h/4h/8h/24h)
4. **Disclosure** — textarea with "Reset to default" + "Preview" + "Save & bump version" buttons. Bump shows confirmation: "This will require all techs to re-accept on their next session."
5. **Tech consent table** — Name | Consent accepted at | Version | Last session | Actions(Revoke). Revoke clears `gpsConsentAcceptedAt + Version` → forces re-acceptance.
6. **Audit history** — last 20 GPS audit events with link to full log
7. **Compliance docs** — links to state-specific consent templates

### Plan gate UI
- Grey out + tooltip for free/starter: "GPS tracking requires Growth plan ($299/mo)" + upgrade button
- Mirrors the `WebsiteBuilder` gated UI pattern

### Risk register for PR 8
| Risk | Mitigation |
|---|---|
| Owner sets retention to 1h, dispatcher loses today's breadcrumb | UI warning when retention < 8h. Confirmation dialog. |
| Disclosure change while sessions active | New sessions use new version. Active sessions complete on old version (their `disclosureVersion` is stamped at start). |
| Disable master toggle while sessions active | On save: enumerate active sessions → end each with `reason='manual'` → notify each tech via push notification |

---

## PR 9 — Tests + Documentation

### Test files added
- `server/services/gpsDisclosureService.test.ts` (~12 tests)
- `server/middleware/gpsPlanGate.test.ts` (~10 tests)
- `server/routes/gpsTrackingRoutes.test.ts` (~25 tests)
- `server/test/e2e-gps-tenant-isolation.test.ts` (~8 tests)
- `client/src/lib/capacitor-gps.test.ts` (~8 tests, mocked Capacitor)

### Test files extended
- `server/services/schedulerService.test.ts` — +5 GPS retention sweep tests
- `client/src/lib/capacitor-deeplinks.test.ts` — +3 tests for `/track/` allowlist

### Tenant isolation tests (CRITICAL)
1. Business A active session not visible from Business B's `/sessions/active`
2. Business A pings not returned by Business B's `/jobs/:id/breadcrumb`
3. Business A tracking link returns 410 on Business B's public endpoint (different `businessId` in `customer_tracking_links`)
4. Cross-tenant ping insert (session.businessId !== caller.businessId) → 403
5. `deleteExpiredPings(businessAId, ...)` does NOT delete Business B's pings
6. Public track endpoint sanitizes payload — never exposes other tenant data
7. Export endpoint scoped to caller's business
8. Plan gate honors per-business plan tier

### Docs added
- `docs/GPS_TRACKING.md` — architecture, Xcode capability checklist, Android manifest checklist, state-by-state legal notes (CA, CT, DE, NY, TX, WA, IL), tester checklist (permission flows, offline behavior, retention verification), owner-facing customer service script

### CLAUDE.md final update
- Test file count totals updated
- Docs file added to references
- "Last updated" final bump with PR9 summary

### Risk register for PR 9
| Risk | Mitigation |
|---|---|
| Mocking Capacitor in vitest is painful | Use `vi.mock('@capacitor/core')` with manual factory. Tests focus on queue/flush logic, not native bridge. |
| Legal disclaimer in docs not exhaustive | Add prominent note: "Consult counsel before deploying in CA/CT/DE/NY/TX." Document is informational. |

---

## Cross-Cutting Concerns

### Cost analysis
- **Storage**: ~50 bytes/ping × 120 pings/hour × 8h shift × 50 techs × 30 days = ~720 MB/mo across all tenants. Cheap on Neon.
- **Egress**: Batched 30s flushes (~1.5 KB each) = ~3 MB/tech/day. Negligible.
- **Map tiles**: OpenStreetMap free with attribution. Recommend MapTiler if hammering rate limits (~$25/mo for 100k tiles).
- **TTS / Pexels / Anthropic**: unchanged. No new AI cost.

### Battery impact
- `distanceFilterMeters: 25` + `pauseOnStationary: true` — stationary techs cost ~0 battery
- Foreground service notification mandatory on Android — acceptable trade-off

### Security posture summary
- All ingestion auth'd via session cookie OR JWT
- All queries scoped by `businessId` in WHERE clauses (defense-in-depth)
- Public tokens 32-char nanoid, never enumerable, rate-limited, expirable, revocable
- Customer page never sees PII, breadcrumb history, or tech contact info
- TLS-only (Helmet HSTS already)
- Retention server-enforced regardless of client behavior

### Rollback strategy
- Per-business: `gpsTrackingEnabled = false` → instant kill switch (current sessions end on next sweep)
- Global: `GPS_FEATURE_ENABLED=false` env var → all routes return 501, scheduler skips
- Migrations additive — never destructive

### Explicit out of scope (separate future PRs)
- Geofencing alerts (tech leaves job site)
- Driving behavior scoring
- Multi-tech route optimization
- Auto-time-clock punch on arrival
- Proximity-triggered SMS ("Mike is 5 min away")
- WebSocket live updates for dispatcher (currently polling)

---

## Open Questions for Owner

Before I write any code, confirm or override the remaining items:

**ALL RESOLVED:**
- ✅ Map provider: **Google Maps** (reuse existing API key, verify Maps JavaScript API enabled)
- ✅ SMS share link: **Opt-in per send** (tech taps explicit "Send tracking link" button; never auto-attached to en_route SMS) — legal/TCPA reason
- ✅ Dispatcher updates: **10s polling** (WebSockets deferred to a future PR if customers complain)
- ✅ Consent re-acceptance: **Every 90 days** (CYA model — even if version unchanged, tech must re-accept after 90d). Implementation: `needsTechReAcceptance` returns true when `staff.gpsConsentAcceptedAt < now - 90d`. New audit action `gps_consent_expired_reprompt` logged when this fires.
- ✅ Retention: defaults locked — 24h default, 24h max on Growth, 168h max on Pro, 1h floor
- ✅ Export format: **CSV only** for PR 9 (JSON API export deferred — easy to add later if a customer asks)
- ✅ Mobile: **Capacitor only** — `client/src/lib/capacitor-gps.ts` runs inside the existing iOS + Android wrappers. No parallel React Native pipeline.

---

## Sequencing & Delivery

Each PR is independently deployable:

| PR | Ships independently? | Visible to user? | Risk level |
|---|---|---|---|
| 1 | Yes (schema only, no behavior) | No | Low |
| 2 | Yes (no consumers yet) | No | Low |
| 3 | Yes (Postman-testable) | No | Med |
| 4 | Yes (mobile-only feature) | Yes — techs see it | Med |
| 5 | Yes (dispatcher UI only) | Yes — owners see it | Low |
| 6 | Yes (depends on PR 3 endpoints) | Yes — customers see it | Med |
| 7 | Yes (cleanup + compliance) | No | Low |
| 8 | Yes (config only) | Yes — owners see it | Low |
| 9 | Yes (tests + docs) | No | Low |

Total estimated file count: **~55 new/modified files** across all 9 PRs.

---

## Approval Checklist

All decisions resolved:
- [x] 15 architectural decisions (A1–A15)
- [x] 7 open questions
- [x] PR sequencing

**Single remaining action item before code**: confirm in Google Cloud Console that **Maps JavaScript API** is enabled on the project owning `VITE_GOOGLE_PLACES_API_KEY`. If yes (or if you say "your call, just check at deploy time"), I start PR 1.

Once code starts, I'll ship PR 1 fully (schema + migrations + storage + IStorage wiring + CLAUDE.md update + `npx tsc --noEmit` clean) before moving to PR 2.
