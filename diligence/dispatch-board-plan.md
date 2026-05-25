# Real-Time Dispatch Board — Implementation Plan (v1.1, Option A)

**Status:** Awaiting user approval
**Scope:** Field-service dispatch board with real-time updates, drag-and-drop scheduling, Google Maps, continuous GPS tracking, and customer-facing Track Now page
**Competitive target:** Feature parity with Housecall Pro + Jobber Live Tracking on dispatch; differentiation kept on AI receptionist + SMS intelligence
**Industry gate:** `isJobCategory()` — HVAC, plumbing, electrical, landscaping, construction, pest control, roofing, painting, automotive, cleaning
**Role gate:** Owner, manager, admin can view board; staff get their own mobile flow
**Pricing tier gate:** Continuous GPS + Track Now require Growth tier ($299) or above

---

## Decisions locked in

1. **Real-time mechanism:** Server-Sent Events (SSE), one-way server→client push. Lighter than WebSocket, works through corporate proxies, auto-reconnects.
2. **GPS tracking:** Two-phase — manual "Arrived" check-in in v1 (PR 6) + continuous background GPS in v1.1 (PR 8), opt-in per staff with business-level kill switch.
3. **Map provider:** Google Maps (uses existing `VITE_GOOGLE_PLACES_API_KEY`).
4. **Drag-and-drop:** Reassign tech + reschedule time + unassigned→assigned (all three).
5. **Customer Track Now:** Public token-based URL `/track/:token` with branded mobile-first page, live tech pin, ETA, tap-to-call/text business.
6. **Tier strategy:** Manual Arrived ships to all tiers. Continuous GPS + Track Now gated to Growth+.

---

## 9-PR rollout

| PR | Scope | Ships independently? |
|---|---|---|
| 1 | Schema migrations + storage extensions | Yes — no UI |
| 2 | Dispatch routes (assign/reschedule/arrived) | Yes — no client yet |
| 3 | `/dispatch` page (polling fallback) | Yes — fully usable |
| 4 | SSE infrastructure + live updates | Yes — UX upgrade |
| 5 | Google Maps view | Yes — additive |
| 6 | Mobile manual "Arrived" GPS capture | Yes — backend already shipped |
| 7 | E2E tests + polish + claude.md update | Yes — hardening |
| **8** | **Continuous background GPS tracking** | **Yes — gated behind business flag** |
| **9** | **Customer Track Now public page + SMS** | **Yes — gated behind business flag** |

---

# PART A: Core Dispatch Board (PRs 1-7)

## A1. Database schema (PR 1)

### New columns on `staff`
| Column | Type | Purpose |
|---|---|---|
| `current_location_lat` | `real` | Most recent ping latitude |
| `current_location_lng` | `real` | Most recent ping longitude |
| `current_location_at` | `timestamp` | When ping was captured |
| `current_location_source` | `text` | `manual_arrived` / `on_my_way` / `background` / `foreground` |

### New columns on `jobs`
| Column | Type | Purpose |
|---|---|---|
| `arrived_at` | `timestamp` | Server-stamped when tech taps Arrived |
| `arrival_lat` | `real` | Captured at arrival |
| `arrival_lng` | `real` | Captured at arrival |
| `dispatch_priority` | `integer` default 0 | For Unassigned bucket sort (0 = normal, 10 = rush) |

### New table `dispatch_events` (audit + SSE replay buffer)
```
dispatch_events
  id              serial PK
  business_id     integer NOT NULL
  event_type      text NOT NULL   -- 'job.assigned' | 'job.status_changed' | 'job.rescheduled' | 'tech.arrived' | etc.
  payload         jsonb NOT NULL
  actor_user_id   integer
  created_at      timestamp default now()
indexes: (business_id, created_at), (business_id, id)
```
**Retention:** scheduler purges rows > 7 days old.

### New indexes
- `jobs_business_appointment_idx (business_id, appointment_id)`
- `jobs_business_staff_idx (business_id, staff_id)`

## A2. Backend services + routes (PR 2)

### New service: `server/services/dispatchEventBroadcaster.ts`
Singleton EventEmitter. Per-business subscriber Map. Heartbeat every 25s. Auto-cleanup on disconnect. Max 50 subscribers per business (oldest force-disconnected at cap). Persists every event to `dispatch_events` for replay.

### New service: `server/services/dispatchService.ts`
Atomic transactional helper: assign + reschedule wrapped in `db.transaction()` so dragging a job to new tech + new time succeeds or rolls back together.

### New route file: `server/routes/dispatchRoutes.ts`

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/dispatch/board?date=YYYY-MM-DD` | Single batched payload: business hours, staff, assigned jobs, unassigned jobs, stats, SSE cursor |
| GET | `/api/dispatch/sse?since=N` | SSE stream with replay-from-cursor |
| PUT | `/api/jobs/:id/assign` | Body `{ staffId }` (null = unassign) |
| PUT | `/api/jobs/:id/reschedule` | Body `{ startDate, endDate? }` (updates linked appointment) |
| POST | `/api/jobs/:id/arrived` | Body `{ lat?, lng?, accuracy? }` (location optional) |
| GET | `/api/dispatch/staff-locations` | Snapshot for map (30s cache fallback) |

All endpoints require `isAuthenticated` + `requireRole(['admin','owner','manager'])` + `requireJobCategoryBusiness` middleware (new). Staff role explicitly rejected (403).

SSE endpoint added to CSRF exempt paths in `server/index.ts`.

### Storage extensions
- Extend `getJobs()` with `startDate?`, `endDate?`, `unassignedOnly?`, `assignedOnly?`, `includeCustomer?`, `includeAppointment?`
- New `getDispatchBoardData(businessId, date, staffIds?)` parallel-batched helper

## A3. Frontend dispatch page (PR 3 + 4 + 5)

### Route
- `/dispatch` mounted in `App.tsx` (lazy-loaded, ProtectedRoute)
- Industry-gated sidebar nav item with `Truck` icon, `hideForRoles: ['staff']`
- Mobile (`<lg` viewport): redirects to `/jobs` — dispatch is desktop-first

### Layout (CSS grid, 3 columns)
```
┌──── 240px ────┬──── flex 1 ────────────────┬──── 360px ────┐
│               │ Toolbar (date / status)    │               │
│  Unassigned   ├────────────────────────────┤  Google Map   │
│  Bucket       │ Stats bar                  │  (tech pins   │
│  (drag src)   ├────────────────────────────┤  + job pins)  │
│               │ Staff filter pills         │               │
│               ├────────────────────────────┤               │
│               │ Swim lanes (drag src+tgt)  │               │
│               │  Mike   ▢▢░░▢░░░░░         │               │
│               │  Sarah  ░▢▢▢░░░░░░         │               │
└───────────────┴────────────────────────────┴───────────────┘
```

### New files
```
client/src/pages/dispatch/index.tsx
client/src/pages/dispatch/DispatchProvider.tsx
client/src/components/dispatch/
  UnassignedBucket.tsx
  SwimLanes.tsx
  SwimLaneRow.tsx
  JobCard.tsx
  DispatchMap.tsx
  LiveStatusBadge.tsx
  DispatchToolbar.tsx
  DispatchStatsBar.tsx
client/src/hooks/
  use-dispatch-stream.ts
  use-dispatch-board.ts
client/src/lib/dispatch-utils.ts
```

### Drag-and-drop (reuses existing dnd-kit from appointments)
- Reassign: drag job between tech rows → `PUT /api/jobs/:id/assign`
- Reschedule: drag within same row to new time slot → `PUT /api/jobs/:id/reschedule`
- Unassigned→Assigned: drag from left rail to tech row → both endpoints in atomic transaction
- Past dates: reject locally + toast "Can't schedule in the past"
- Overlap: confirmation dialog "Mike has another job at 2pm. Reschedule anyway?"
- Optimistic updates + cache snapshot rollback on error

### Map (PR 5, additive)
- `@vis.gl/react-google-maps` (new dep)
- Customer pins (color-matched to assigned staff, gray if unassigned)
- Tech pins (custom HTML markers with avatar)
- Stale pins (> 5 min) gray at 40% opacity
- Auto-fit bounds on first load; respects user pan/zoom afterwards
- Click job card → recenters map on customer pin
- Staff filter applies to map markers too

## A4. SSE infrastructure (PR 4)

### Server: `dispatchEventBroadcaster`
- Singleton per Node worker
- `publish(businessId, event)` → persists to `dispatch_events` + emits to all subscribers
- `subscribe(businessId, handle)` → returns unsubscribe fn
- Heartbeat every 25s (kept-alive comment, not a persisted event)
- Auto-disconnect after 4 hours of inactivity
- Max 50 connections per business (oldest force-disconnected)

### Event types
| Event | Payload |
|---|---|
| `job.created` | `{ job, customer, staff? }` |
| `job.assigned` | `{ jobId, oldStaffId, newStaffId, byUserId }` |
| `job.unassigned` | `{ jobId, oldStaffId, byUserId }` |
| `job.rescheduled` | `{ jobId, oldStart, newStart, newEnd, byUserId }` |
| `job.status_changed` | `{ jobId, oldStatus, newStatus }` |
| `job.cancelled` | `{ jobId }` |
| `tech.arrived` | `{ jobId, staffId, lat, lng, arrivedAt }` |
| `tech.en_route` | `{ jobId, staffId, etaMinutes, enRouteAt }` |
| `tech.eta_updated` | `{ jobId, staffId, etaMinutes }` |
| `heartbeat` | `{ ts }` (every 25s, not persisted) |

### Client: `useDispatchStream({ businessId, sinceCursor })`
- EventSource with `?since=cursor` for replay-on-reconnect
- Status: `connected` / `connecting` / `disconnected` / `replaying`
- Exponential backoff on disconnect: 1s, 2s, 4s, 8s, 16s, 30s (cap)
- Auto-close when tab hidden > 60s; reconnect on visible
- Cache reducer mutates React Query data via `setQueryData` (no refetch storm)

### Resilience
- Corporate proxy buffering: `X-Accel-Buffering: no` header
- Failed reconnects > 3 attempts: fall back to 10s polling, badge says "Polling"
- iOS Safari quirks: explicit test pass required

## A5. Mobile "Arrived" workflow (PR 6)

### New helper: `client/src/lib/capacitor-location.ts`
- `getCurrentPosition()` with 8s timeout
- Native: `@capacitor/geolocation` plugin (one-shot, not background)
- Web: `navigator.geolocation.getCurrentPosition`
- Returns `{ lat, lng, accuracy } | null` (null on denial/timeout/unsupported)

### Extension to `OnMyWayCard.tsx`
- "I've Arrived" button → calls `getCurrentPosition()` first (non-blocking 8s)
- Then `POST /api/jobs/:id/arrived` with optional coords
- Permission denied → falls back to status change only, toast "Location not available"
- Inline "Capturing location…" prompt while resolving

### iOS Info.plist additions
- `NSLocationWhenInUseUsageDescription` = "We use your location to confirm job arrivals."

### Android Manifest additions
- `ACCESS_COARSE_LOCATION` + `ACCESS_FINE_LOCATION` permissions

## A6. Tests (PR 7)

| File | What it covers |
|---|---|
| `server/test/dispatch-routes.test.ts` | Auth, scoping, range filtering, assign/reschedule atomicity, arrived workflow with/without coords |
| `server/test/dispatch-event-broadcaster.test.ts` | Subscribe/unsubscribe, heartbeat, throttling, cap |
| `server/test/e2e-dispatch-flow.test.ts` | Full create → assign → en_route → arrived → completed → audit row check |
| `client/src/__tests__/dispatch-page.test.tsx` | 3-pane render, drag behaviors, SSE updates via mock EventSource |
| `client/src/__tests__/use-dispatch-stream.test.tsx` | Reconnect backoff, replay cursor, cleanup |
| `client/src/__tests__/on-my-way-arrived.test.tsx` | Coords flow + permission denial fallback |

---

# PART B: Continuous GPS Tracking (PR 8)

## B1. Schema additions (on top of PR 1)

### New columns on `staff`
| Column | Type | Default | Purpose |
|---|---|---|---|
| `gps_tracking_enabled` | `boolean` | `false` | Per-staff opt-in |
| `gps_tracking_consented_at` | `timestamp` | `null` | Disclosure acceptance |
| `gps_tracking_consent_version` | `text` | `null` | Re-prompt on version bump |
| `gps_tracking_override` | `text` | `null` | Owner override: `null` or `force_off` |
| `gps_last_ping_battery` | `smallint` | `null` | 0-100 |
| `gps_session_id` | `uuid` | `null` | Active session id |

### New columns on `businesses`
| Column | Type | Default | Purpose |
|---|---|---|---|
| `gps_tracking_enabled` | `boolean` | `false` | Business-level kill switch |
| `gps_tracking_retention_hours` | `integer` | `24` | Per-business retention (24/72/168) |
| `gps_tracking_required_for_dispatch` | `boolean` | `false` | Prefer GPS-active techs for assignments |
| `gps_eta_refinement_enabled` | `boolean` | `false` | Enable server-computed ETA refinement |
| `customer_tracking_enabled` | `boolean` | `false` | PR 9 kill switch |

### New table: `staff_location_history` (time-series ping log)
```
staff_location_history
  id                bigserial PK
  staff_id          integer NOT NULL → staff(id) ON DELETE CASCADE
  business_id       integer NOT NULL → businesses(id) ON DELETE CASCADE
  session_id        uuid NOT NULL
  recorded_at       timestamp NOT NULL
  received_at       timestamp NOT NULL DEFAULT now()
  lat               double precision NOT NULL
  lng               double precision NOT NULL
  accuracy_meters   real
  speed_mps         real
  heading_deg       real
  battery_level     smallint
  source            text NOT NULL
  job_id            integer → jobs(id) ON DELETE SET NULL

indexes:
  (staff_id, recorded_at DESC)
  (business_id, recorded_at DESC)
  (session_id, recorded_at ASC)
  (job_id, recorded_at DESC) WHERE job_id IS NOT NULL
```

## B2. Opt-in flow

### Two-layer gate
```
GPS ping accepted ⇔
  business.gps_tracking_enabled = TRUE
  AND staff.gps_tracking_enabled = TRUE
  AND staff.gps_tracking_override != 'force_off'
  AND staff.gps_tracking_consented_at IS NOT NULL
  AND staff is on-clock
  AND business is isJobCategory()
```

### On-clock definition
Either: (a) at least one assigned job today not yet completed AND logged in within 12h, OR (b) tapped "Start Shift" button.

### Tech consent flow (mobile, first time after owner enables)
4 screens: Why → Disclosure (5 paragraphs covering tracking scope, battery 10-15%/hr, data 5-10 MB/day, retention) → OS permission grant → Accept + on. Owner-customizable disclosure copy. Stored as `gps_tracking_consent_version` so re-prompts when materially changed.

### iOS permissions
- `NSLocationAlwaysAndWhenInUseUsageDescription` (new)
- `UIBackgroundModes` += `location`
- iOS 14+ precise vs approximate — request precise, accept approximate

### Android permissions
- `ACCESS_BACKGROUND_LOCATION` (Android 10+)
- `FOREGROUND_SERVICE_LOCATION` (Android 14+)
- Foreground service notification: "SmallBizAgent is tracking your location for dispatch"

## B3. Mobile client

### Plugin: `@capacitor-community/background-geolocation`
Free, open-source, foreground service support. Re-evaluate `@transistorsoft` paid plugin later if motion-detection accuracy lags.

### New module: `client/src/lib/capacitor-bg-location.ts`
- `startTrackingIfEligible()` — called on app launch + resume
- `stopTracking()` — on logout, opt-out, or eligibility loss
- `getTrackingState()` — `{ active, sessionId, lastPingAt }`

### Cadence (motion-aware)
| Mode | Trigger | Cadence | Distance filter |
|---|---|---|---|
| Stationary | No `en_route` job | 60s | 50 m |
| Moving normal | Job `in_progress` | 45s | 25 m |
| On-the-way (hot) | Job `en_route` | 15s | 10 m |
| Off | Any eligibility fail | — | — |

### Offline buffering
Plugin queues pings to local SQLite when offline. Flushes batches of 50 on reconnect. Server dedups by `(staff_id, recorded_at)`. Pings > 1h old dropped server-side.

### Session lifecycle
- UUID generated on tracking start
- All pings tagged with session_id
- `POST /api/staff/me/location/session-end` on stop

## B4. Backend ingestion

### `POST /api/staff/me/location`
Body: `{ pings: [...up to 50], sessionId, clientVersion }`

Validation:
- lat ∈ [-90, 90], lng ∈ [-180, 180]
- `accuracyMeters` ≤ 5000 (drop wildly inaccurate)
- `recordedAt` within (now - 1h) and (now + 5min) — clock skew defense
- `jobId` belongs to staff's business

Behavior:
1. Re-verify eligibility (returns 403 with `stopTracking: true` if disabled)
2. Dedup by `(staff_id, recorded_at)`
3. Bulk insert survivors into `staff_location_history`
4. Update `staff.current_location_*` with latest ping
5. Throttle: emit SSE `tech.location_updated` only if moved > 30 m OR > 60s since last broadcast
6. Force broadcast every 2 min regardless (freshness floor)

Rate limit: 60 batches/min/staff.

### Other GPS endpoints
- `POST /api/staff/me/location/session-end` — clears `gps_session_id`
- `GET /api/dispatch/staff/:id/breadcrumb?since=ISO` — owner/manager only; 500-row cap
- `GET /api/dispatch/staff/locations` — current snapshot of all tracking-active staff

### SSE event additions
| Event | Payload | When |
|---|---|---|
| `tech.tracking_started` | `{ staffId, sessionId, startedAt }` | First ping of session |
| `tech.location_updated` | `{ staffId, lat, lng, recordedAt, accuracy, speed?, heading?, batteryLevel? }` | After throttle |
| `tech.tracking_stopped` | `{ staffId, sessionId, lastPingAt, reason }` | Session end |
| `tech.battery_low` | `{ staffId, batteryLevel }` | < 20%, 1x per session |

## B5. Dispatch board UI additions

- **Live-moving pins:** 800ms easing animation between pings (snap if > 30km jump = likely GPS noise)
- **Staleness:** green border (< 5min), amber (5-30min), gray + 50% opacity (> 30min)
- **Battery indicator:** yellow battery icon overlay if < 20%
- **Tooltip:** tech name + first job + last ping time + battery + source
- **"Show trails" toggle:** renders last 2h of pings as polyline (color-coded by staff via STAFF_COLORS)
- **Tech roster side panel:** click name → pans map + highlights breadcrumb
- **Stale-tech alerts:** toast if tracking-active tech goes stale during `en_route`/`in_progress`

## B6. Owner controls

### New settings card: `Settings → Operations → GPS Tracking`
- Toggle: Enable GPS tracking for business
- Retention selector: 24h / 72h / 7 days
- Disclosure text (textarea, owner-customizable per-business state law)
- Toggle: Require for dispatch suggestions
- Per-staff table: name, state, last seen, battery, Disable button
- "Purge location history for a staff member" dropdown
- Audit logging on every action (gps_enabled, gps_override_set, gps_history_purged, gps_retention_changed)

## B7. Retention scheduler

- New job `purgeStaleLocationHistory` runs hourly with `withAdvisoryLock('gps-purge')`
- Deletes `staff_location_history` rows older than per-business `gps_tracking_retention_hours`

## B8. Privacy + Compliance

### Hard rules
- Never ping outside business hours unless tech is mid-job
- Never ping when business or tech flag is off
- Always show Android persistent foreground notification
- iOS always-allow only after first while-in-use grant + actual usage

### Right to delete
- Owner UI: per-staff "Delete all location history" → DELETE + audit log
- Tech-facing: filed via existing in-app support flow (Phase 1 manual)

### Risk callouts
- State labor laws (CA, IL, NY, TX, CT, DE require employee monitoring disclosure)
- Contractor classification: GPS-tracking 1099 contractors can reclassify them as employees in some states
- Cross-border data flow not specially handled in v1.1
- CCPA/CPRA geolocation data classification — consult counsel
- Insurance subpoena risk for accident breadcrumbs — comply with valid legal process

---

# PART C: Customer Track Now Public Page (PR 9)

## C1. Schema additions

### New columns on `jobs`
| Column | Type | Default | Purpose |
|---|---|---|---|
| `tracking_token` | `text` UNIQUE | `null` | UUID v4, base64url, 22 chars |
| `tracking_token_expires_at` | `timestamp` | `null` | Now+24h on create; completed+2h on completion |
| `customer_tracking_opened_at` | `timestamp` | `null` | First open (analytics) |
| `customer_tracking_open_count` | `integer` | `0` | Open count (analytics) |

### Index
`CREATE UNIQUE INDEX idx_jobs_tracking_token ON jobs (tracking_token) WHERE tracking_token IS NOT NULL`

## C2. Token lifecycle

```
[status=pending]
   ↓ tech taps "On My Way"
[status=en_route]  → generate token, expires = now+24h, send SMS with /track/{token}
   ↓ customer opens link → stamp opened_at, increment open_count
[customer sees live map]
   ↓ tech taps "I've Arrived"
[status=in_progress] → token still valid, page shows "Mike has arrived"
   ↓ tech taps "Mark complete"
[status=completed] → token expires = completed_at + 2h grace
   ↓ after grace
[GET /track/:token returns 410 Gone with friendly copy]
```

### Reuse rules
- Single token across full lifecycle
- Re-tap "On My Way" with non-expired token → reuse, resend SMS with same link
- Re-tap with expired token → regenerate + resend
- Cancelled → expire immediately

## C3. Public route

### `GET /api/public/track/:token`
**No auth, no CSRF.** Added to CSRF exempt paths in `server/index.ts`. Rate-limited 10 req/sec per token+IP.

Behavior:
1. Lookup by token → 404 if not found
2. If expired → 410 with `{ code: 'EXPIRED', businessPhone, businessName }`
3. If status not in `('en_route','in_progress','completed')` → 410 with `{ code: 'NOT_ACTIVE' }`
4. Stamp `customer_tracking_opened_at` if null, increment count
5. Return minimal shape (see C4)

### Response shape (intentionally minimal PII)
```
{
  job: { id, status, enRouteAt, etaMinutes, estimatedArrival, completedAt, destinationLat, destinationLng },
  tech: { firstName, photoUrl?, currentLat, currentLng, lastUpdatedAt },
  business: { name, logoUrl, accentColor, phone, smsNumber },
  expiresAt
}
```

### Deliberately excluded (defense in depth)
Customer name/email/phone, tech last name, tech personal phone, job line items, pricing, service name, other appointments, other techs' locations.

### Critical privacy rule
**When job.status = `in_progress`, suppress live `tech.currentLat/Lng`** — page shows "Mike is at your location now." Prevents leaking next customer's location when tech moves on.

## C4. Public SSE stream

### `GET /api/public/track/:token/stream`
**No auth, no CSRF.** Reuses SSE infra with public broadcaster keyed by `job_id`.

Subscription state: `{ jobId, staffId, expiresAt }`.

Public event types (filtered by jobId/staffId):
- `tech.location_updated` (filtered, suppressed during `in_progress`)
- `job.status_changed` (only `in_progress`/`completed`)
- `job.eta_updated`
- `job.cancelled` → then close stream
- `link.expiring_soon` (5 min before expiry)
- `heartbeat` every 25s

Auto-closes after 4h connection time or job completion.

## C5. Frontend public page

### Route in `client/src/App.tsx`
```
const TrackNow = lazy(() => import('./pages/track/[token]'));
<Route path="/track/:token" component={TrackNow} />
```
**Outside ProtectedRoute.** No sidebar, no top nav, no app shell.

### Layout (mobile-first, 375px first)
```
┌─────────────────────────────────────────┐
│  [LOGO] Smith HVAC                       │  ← branding banner, accentColor
├─────────────────────────────────────────┤
│  Mike is on the way                      │
│  Estimated arrival: 3:02 PM              │
│  in about 18 minutes                     │
│                                          │
│  ┌─ Google Map ────────────────────────┐ │
│  │  🚐 Mike (live, pulsing)             │ │
│  │  🏠 You (destination)                │ │
│  └─────────────────────────────────────┘ │
│                                          │
│  [📞 Call (330) 555-1234]                │
│  [💬 Text us]                            │
│                                          │
│  Powered by SmallBizAgent (or hidden)    │
└─────────────────────────────────────────┘
```

Status transitions:
- `in_progress`: "Mike has arrived and started the job."
- `completed`: "Job complete! How did Mike do? [Leave a review →]"

### Live map
- Pin animates between pings (800ms easing, same as dispatch)
- Auto-fits to include tech + destination
- Auto-fit stops following on first user gesture
- Pinch-zoom enabled

### Meta tags
`<meta name="robots" content="noindex,nofollow" />` — tokens random but defense in depth.

### White-label
- `business.brandName` set → hide "Powered by SmallBizAgent"
- `business.logoUrl` set → use logo; else text-only header
- Pro tier: full white-label (hide Powered-by even if brandName unset)

## C6. SMS template

### New MessageType: `TECH_EN_ROUTE_WITH_TRACKING`
```
{techFirstName} from {businessName} is on the way! ETA: {etaTime}.

Track live: {trackingUrl}
```
Transactional (no STOP footer required under TCPA).

### Integration in `sendJobEnRouteNotification`
```
if business.gps_tracking_enabled AND business.customer_tracking_enabled AND job.tracking_token:
  use TECH_EN_ROUTE_WITH_TRACKING template
else:
  fall back to existing copy
```

URL built as `${process.env.APP_URL}/track/${job.tracking_token}`.

### Failure handling
Token gen fails → fall back to plain en-route SMS. Don't block send because tracking infra broke.

## C7. Customer-side ETA refinement (off by default in v1.1)

Behind `businesses.gps_eta_refinement_enabled` flag. When enabled, on each ping:
```
distance_remaining = haversine(currentLat/Lng, destinationLat/Lng)
avg_speed_so_far  = total_distance_traveled / elapsed_since_enroute

if avg_speed_so_far > 5 mph AND distance_remaining < 50 miles:
  refined_eta = ceil(distance_remaining / avg_speed_so_far / 60)

if abs(refined_eta - current_eta) >= 2:
  update job.etaMinutes
  emit job.eta_updated
```

**Cap:** refinement clamped to ±50% of original estimate. If real ETA exceeds, send courtesy SMS instead of letting the number drift.

**Traffic-aware ETA via Google Routes API** deferred to v1.2 (cost: ~$5/1000 reqs).

---

# Cross-cutting concerns

## SSE scaling
- Estimated 65 concurrent SSE connections per business at typical load
- 100 businesses on single Node worker = 6,500 connections (within limits)
- Aggressive throttling: 30m / 60s movement threshold
- Connection cap per business: 500 (refuse new ones above)
- Heartbeat-driven cleanup at 4h
- v1.2: swap in-process Maps for Redis pub/sub when going multi-worker

## Feature flag gates

| Component | Gated behind |
|---|---|
| `POST /api/staff/me/location` | `business.gps_tracking_enabled` + `staff.gps_tracking_enabled` + plan tier |
| Mobile bg-location service | Same |
| Dispatch board live pins | Renders manual pins if GPS off |
| `/track/:token` route | `business.customer_tracking_enabled` (defaults to gps_tracking_enabled) |
| Settings cards | Visible to all owners, but disable for plan tier < Growth |

## Pricing tier strategy

| Feature | Starter ($149) | Growth ($299) | Pro ($449) |
|---|---|---|---|
| Dispatch board + map view | ✓ | ✓ | ✓ |
| Manual "Arrived" check-in | ✓ | ✓ | ✓ |
| Continuous GPS tracking | — | ✓ | ✓ |
| Customer Track Now page | — | ✓ | ✓ |
| Breadcrumb retention | — | 24h | up to 7 days |
| White-label tracking page | — | — | ✓ |
| Traffic-aware ETA (v1.2) | — | — | ✓ |

Server enforcement via `requireGrowthOrAbove` middleware on GPS endpoints.

Marketing claim cleanup: keep "GPS Tracking" and "Customer Track Now" off marketing site until PRs 8/9 merged and tested. Then add to Growth tier copy.

## Out-of-scope for v2

| Feature | Reason |
|---|---|
| Tech-to-tech location sharing | No customer demand |
| Geofence-triggered automations | UX/policy questions open |
| Traffic-aware ETA (Google Routes API) | $$ cost; evaluate after data |
| Driver behavior scoring (speed/braking) | Employee surveillance landmines |
| Route history analytics | UI design TBD |
| Tech-to-dispatcher chat | Requires WebSocket |
| AI route optimization | Separate plan (next sub-feature) |
| Multi-tech job assignments | Schema refactor; v2 |
| Week view on dispatch board | Day view covers 90% |
| Drag-to-resize duration | v2 |
| Cross-instance SSE fan-out via Redis | Single-worker fine until ~50 simultaneous dispatchers per tenant |
| Offline support for dispatch board | Online-only; mobile tech flow already offline-cached |
| Customer push notifications (replace SMS) | Requires customer-side native app |
| Predictive arrival ("5 stops away") | Schedule-aware ETA modeling complex |

---

# Risks + Open Questions

1. **`staff.avatarUrl` / `photoUrl` column** — verify existence; add to migration if missing. Default to colored initial circle if absent.
2. **Apple Privacy Manifest** (`PrivacyInfo.xcprivacy`) — required for App Store as of May 2024 with background location.
3. **Android `FOREGROUND_SERVICE_LOCATION`** — Android 14+ permission; verify Capacitor plugin handles manifest entry.
4. **Connection pool impact** — 60 batches/min × 10 techs × 100 businesses = 60K INSERTs/min peak. Verify pg-boss + main pool can handle.
5. **Ping idempotency** — `(staff_id, recorded_at)` dedup without UNIQUE constraint (ms-precision pings legitimately differ).
6. **Public Track Now SEO** — `noindex,nofollow` meta tag.
7. **HTTPS-only** — public Track Now must reject HTTP; Cloudflare/Railway redirect.
8. **CCPA/CPRA geolocation classification** — consult counsel.
9. **State labor laws** — disclosure copy template is starting point only; owner customizes for jurisdiction.
10. **Contractor 1099 reclassification risk** — provide owner-visible warning + per-staff `force_off` override.
11. **iOS Safari SSE quirks** — explicit test pass on iOS Safari before ship.
12. **Drag-and-drop touch devices** — dnd-kit works but board is desktop-first; tablet fallback = "edit job" inline action.
13. **Time-zone footguns** — "today" computed in business timezone, not browser. Toolbar shows "Today (PT)" if browser TZ differs.
14. **Geocoding gap** — backfill scheduler for legacy customer addresses without `customerLocationLat/Lng` (separate PR, not in this plan).
15. **Insurance/legal subpoena** — comply with valid legal process; document SOPs.

---

# Critical files

- `shared/schema.ts` — all schema additions
- `server/migrations/runMigrations.ts` — 3 new migrations registered
- `server/storage/jobs.ts` — extend `getJobs()`, add `getDispatchBoardData()`
- `server/services/dispatchEventBroadcaster.ts` — NEW
- `server/services/dispatchService.ts` — NEW
- `server/routes/dispatchRoutes.ts` — NEW
- `server/routes/trackingRoutes.ts` — NEW (PR 9)
- `server/routes/jobRoutes.ts` — token generation hook in PUT handler + broadcast on status change
- `server/services/notificationService.ts` — extend `sendJobEnRouteNotification` for tracking URL
- `server/services/messageIntelligenceService.ts` — new `TECH_EN_ROUTE_WITH_TRACKING` MessageType
- `server/services/schedulerService.ts` — `startGpsRetentionPurge` + `startDispatchEventsPurge`
- `server/middleware/permissions.ts` — add `dispatch:view`, `dispatch:reassign`, `requireJobCategoryBusiness`
- `server/middleware/planGate.ts` — add `requireGrowthOrAbove`
- `server/index.ts` — CSRF exemptions: `/api/dispatch/sse`, `/api/public/track/*`
- `client/src/App.tsx` — register `/dispatch` (protected) + `/track/:token` (public)
- `client/src/pages/dispatch/index.tsx` — NEW
- `client/src/pages/track/[token].tsx` — NEW
- `client/src/components/dispatch/*` — 8 new components
- `client/src/components/jobs/OnMyWayCard.tsx` — extend for GPS capture
- `client/src/components/settings/GpsTracking.tsx` — NEW
- `client/src/hooks/use-dispatch-stream.ts` — NEW
- `client/src/hooks/use-dispatch-board.ts` — NEW
- `client/src/lib/capacitor-location.ts` — NEW (one-shot)
- `client/src/lib/capacitor-bg-location.ts` — NEW (background)
- `client/src/lib/dispatch-utils.ts` — NEW
- `ios/App/App/Info.plist` — location keys + UIBackgroundModes
- `ios/App/App/PrivacyInfo.xcprivacy` — NEW (Apple Privacy Manifest)
- `android/app/src/main/AndroidManifest.xml` — location permissions + foreground service
- `package.json` — new deps: `@vis.gl/react-google-maps`, `@capacitor-community/background-geolocation`

---

# Approval needed

Before any code changes, please confirm:

1. ✅ Ship all 9 PRs in the order shown? Or start narrower (e.g., 1-7 first, decide on 8-9 after seeing v1 in production)?
2. ✅ Growth tier ($299) is the right paywall for continuous GPS + Track Now?
3. ✅ 24h default retention with optional 7-day max for Pro tier is acceptable?
4. ✅ OK with Capacitor's open-source background-geolocation plugin (vs $300/year `@transistorsoft`)?
5. ✅ OK shipping the disclosure copy template knowing owners are responsible for state-law customization?

Reply with approval or modifications and I'll start PR 1 (schema migrations + storage extensions).
