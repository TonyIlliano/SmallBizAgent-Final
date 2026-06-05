# Month Plan — Dispatch Kanban + Driver Route Handoff + 2 BI Cards + PostHog Instrumentation

**Scope:** 4 deliverables, ~2 weeks of work. Ships incrementally.
**Goal:** Make GPS Live Dispatch + existing analytics actually usable for HVAC beta customers. Instrument what's already shipped so we have signal on what to build next.

---

## Phase Order (Ship Incrementally)

1. **Day 1 (one PR):** PostHog instrumentation (7 capture points) + `job_line_items.serviceId` migration + line-item route accepts serviceId. Zero dependencies, ships first so data starts flowing.
2. **Day 2:** Client-side line-item creator passes `serviceId` when picked from a service template.
3. **Days 2–5:** Dispatch Kanban tab on existing `/dispatch` page.
4. **Day 5:** Driver Route Handoff helper + mount in jobs/index.tsx + KanbanColumn header.
5. **Days 6–7:** Tech Utilization BI card.
6. **Days 8–9:** Revenue per Service BI card.
7. **Day 10:** Buffer / polish / `npx tsc --noEmit` / smoke test.

---

## Deliverable 1 — PostHog Instrumentation

**Goal:** Capture events at decisions points so we know what features customers actually use.

### Server-side (5 services)

**Files to modify:**

- `server/routes/gpsTrackingRoutes.ts`
  - After `POST /sessions/start` success: `capture(String(req.user.id), 'gps_session_started', { sessionId, staffId, jobId, businessId }, { business: String(businessId) })`
  - After `POST /sessions/:sessionId/end` success: `capture(..., 'gps_session_ended', { sessionId, endReason, pingCount, durationMinutes }, ...)`
  - After `POST /links` success: `capture(..., 'gps_tracking_link_created', { jobId, linkId }, ...)`
  - Import: `import { capture } from "../services/posthogService";`

- `server/services/leadDiscoveryService.ts`
  - In `runScan()` after `lead_discovery_runs` row created: `capture(String(initiatorUserId ?? 0), 'lead_discovery_scan_started', { runId, industries, zipsCount, dryRun, projectedCost })`
  - After run row updated to `completed`: `capture(..., 'lead_discovery_scan_completed', { runId, totalLeads, scoredCount, actualCost, durationSeconds })`

- `server/services/callQualityService.ts`
  - After `scoreCall` persists: `capture(String(businessId), 'call_quality_scored', { callLogId, score, flagged, rubricVersion }, { business: String(businessId) })`
  - In `dismissQualityFlag` after row updated: `capture(String(userId), 'call_quality_flag_dismissed', { callLogId, originalScore }, { business: String(businessId) })`

- `server/services/smsCampaignService.ts`
  - After `launchCampaign` success: `capture(String(launcherUserId), 'sms_campaign_launched', { campaignId, audienceSize, type, channel }, { business: String(businessId) })`

### Client-side (2 capture points)

- `client/src/pages/dispatch/index.tsx`
  - On mount: `captureEvent('dispatch_page_viewed', { tab: activeTab })`
  - In Kanban drag-end mutation success: `captureEvent('kanban_job_assigned', { jobId, fromStaffId, toStaffId })`

- `client/src/lib/route-handoff.ts` (new file — see Deliverable 2)
  - Before opening Maps: `captureEvent('route_handoff_started', { stopCount, platform })`

### Risk notes
- `capture()` already no-ops silently when `POSTHOG_API_KEY` not set. Cannot break anything.
- `leadDiscoveryService.runScan()` may not currently know the initiator userId — thread it through from the route handler or fall back to `'0'`.

---

## Deliverable 2 — Schema: `job_line_items.serviceId`

**Goal:** Tag line items with their source service so the Revenue-per-Service card can attribute revenue cleanly. Ships in Phase 1 PR so data accumulates from day 1.

### Migration

**`server/migrations/runMigrations.ts`** — in `fixExistingTables()`:
```ts
await addColumnIfNotExists('job_line_items', 'service_id', 'INTEGER REFERENCES services(id) ON DELETE SET NULL');
```

### Schema

**`shared/schema.ts`** — in `jobLineItems` table definition:
```ts
serviceId: integer("service_id").references(() => services.id, { onDelete: 'set null' }),
```

### API

**`server/routes/jobRoutes.ts`** — POST + PUT line-items endpoints:
- Destructure `serviceId` from `req.body`, pass through to storage. Nullable.

### Client wiring (Day 2)

- Grep `client/src/` for `'line-items'` POST callers
- Update the service-template picker to include `serviceId` in body when user selects from dropdown
- Free-text line items continue to omit `serviceId` (will show as "untagged" in BI)

### Risk notes
- Nullable + `ON DELETE SET NULL` = safe additive change, no backfill required
- Existing line items remain `serviceId = NULL` — BI card shows empty state until tagging starts

---

## Deliverable 3 — Dispatch Kanban Board

**Goal:** Dispatcher's daily work surface. Drag unassigned jobs to staff swim lanes, drag between staff to reassign.

### Architecture
Wrap existing `/dispatch` content in `<Tabs>` with two tabs: **Live Map** (current) and **Kanban** (new). Live map polling pauses when Kanban tab active (saves Google Maps quota).

### Files to create

**`client/src/components/dispatch/KanbanBoard.tsx`** (~300 lines)
- Props: `{ businessId: number }`
- State: `currentDate: Date` (defaults to today in business TZ), `optimisticAssignments: Map<jobId, staffId | null>`
- Queries: `/api/jobs` (filter to currentDate), `/api/staff`, `/api/business` (for timezone)
- Mutation: `PUT /api/jobs/:id { staffId }` with optimistic update + revert on error
- Sensors: `useSensor(PointerSensor, { activationConstraint: { distance: 8 } })` (match appointments page pattern)
- `DndContext` with `onDragEnd` handler
- Date picker at top (today/forward/back)

**`client/src/components/dispatch/KanbanColumn.tsx`** (~120 lines)
- Props: `{ staff: Staff | null, jobs: Job[], businessId, currentDate, staffColor }` (null staff = Unassigned column)
- Single `useDroppable` with `id: \`staff-${staffId ?? 'unassigned'}\``
- Header: staff name + avatar + job count + "Start Route" icon button (Deliverable 4 mount point)
- Body: vertical stack of `<KanbanJobCard>` sorted by scheduled time

**`client/src/components/dispatch/KanbanJobCard.tsx`** (~100 lines)
- Props: `{ job: PopulatedJob }`
- `useDraggable({ id: job.id })`
- Card content: customer name, service title, time pill, status badge (`JOB_STATUS_COLORS[job.status]`), ETA pill if `en_route`
- Click → navigate to `/jobs/${job.id}` (wrap drag handle separately so 8px-threshold click works)

**`client/src/lib/kanban-utils.ts`** (~50 lines)
- `getJobsForDate(jobs, date, timezone): PopulatedJob[]`
- `groupJobsByStaff(jobs, staffMembers): Map<number | null, Job[]>` (null = unassigned)
- `sortJobsByTime(jobs)` — by appointment.startDate or scheduledDate+09:00, untimed last

### Files to modify

**`client/src/pages/dispatch/index.tsx`**
- Wrap existing content in `<TabsContent value="map">`
- Add `<Tabs defaultValue="map">` with two `<TabsTrigger>`
- Add `<TabsContent value="kanban"><KanbanBoard businessId={user.businessId} /></TabsContent>`
- Gate logic stays at page level (gated → render `<GateCard>` without tabs)
- Conditional polling: `refetchInterval: (gate || activeTab !== 'map') ? false : POLL_INTERVAL_MS`

### Patterns to reuse
- DnD: `client/src/components/appointments/DragDropComponents.tsx`
- Staff colors: `getStaffColor()` from `client/src/lib/scheduling-utils.ts:102`
- Status colors: `JOB_STATUS_COLORS` from `client/src/lib/scheduling-utils.ts`
- Tabs: pattern from `client/src/pages/receptionist/index.tsx`
- Optimistic mutation: pattern from appointments page

### Edge cases
- Job with no `customerLocationLat/Lng` → drag works, route handoff skips
- Job with no scheduled time → "Anytime" pill, sorts to bottom of column
- Inactive staff → column hidden
- Cancelled jobs → filtered out
- "Today" computed in `business.timezone` (fallback `America/New_York`)
- Click-vs-drag conflict → `activationConstraint: { distance: 8 }`
- Drag-while-pending → disable card during in-flight mutation

### Risk callouts
- **Optimistic vs server-confirm**: use optimistic (match appointments page). Revert + toast on error.
- **Live map polling stops on Kanban tab**: intentional (quota savings). Document.
- **Job.staffId is source of truth for Kanban** — don't sync appointment.staffId on drag (out of scope).

---

## Deliverable 4 — Driver Route Handoff

**Goal:** Tech (or dispatcher) taps one button → device opens native Maps with multi-stop route for today's jobs.

### Files to create

**`client/src/lib/route-handoff.ts`** (~120 lines)
```ts
export interface RouteStop { lat: number; lng: number; label?: string }
export function startRoute(stops: RouteStop[]): { opened: boolean; reason?: string }
```

Implementation:
- Reject if `stops.length === 0` → `{ opened: false, reason: 'no_stops' }`
- Detect platform via `Capacitor.getPlatform()` → `'ios' | 'android' | 'web'`
- Build URL:
  - **iOS**: `maps://?saddr=Current+Location&daddr=<lat1>,<lng1>+to:<lat2>,<lng2>+to:...` (truncate at 10 stops)
  - **Android single**: `google.navigation:q=<lat>,<lng>`
  - **Android multi / web**: `https://www.google.com/maps/dir/?api=1&origin=Current+Location&waypoints=...&destination=...`
- iOS/Android: `window.location.href = url`
- Web: `window.open(url, '_blank', 'noopener,noreferrer')`
- Fire `captureEvent('route_handoff_started', { stopCount, platform })` before navigation

### Files to modify

**`client/src/pages/jobs/index.tsx`** — top of list view
- Add "Today's Route" card above QuickJobStatsBar
- Visible to staff role, OR to owners/managers when a single staff filter pill is active
- "Start My Route" button → computes today's jobs for current staff with geocoded locations → calls `startRoute()`

**`client/src/components/dispatch/KanbanColumn.tsx`** (created in Deliverable 3)
- In staff-column header: `<Button size="icon" variant="ghost">` with `Navigation` (lucide) icon
- onClick: collects column's jobs with lat/lng, calls `startRoute()`
- Tooltip: "Hand off route to {staff.firstName}"
- Disabled if no stops have geolocation

### Edge cases
- URL length: truncate at 10 stops, toast "Showing first 10 stops"
- Missing geocoded jobs: "(2 of 5 stops have no address geocoded)" hint
- Capacitor not loaded (Vite dev) → `getPlatform()` returns `'web'` → web fallback
- Maps app not installed → iOS shows native alert (out of our control)

### Risk callouts
- **No "send route to other device"** — handoff is on current device only
- **No route optimization** — order = scheduled time ascending (Kanban order)
- **URL length** — safe under 10 stops, guarded

---

## Deliverable 5 — Two BI Cards

### Card A — Tech Utilization (this week)

**Backend** (`server/services/analyticsService.ts`):
```ts
export async function getTechUtilization(
  businessId: number,
  dateRange: DateRange
): Promise<{ staff: Array<{ staffId, name, billedMinutes, availableMinutes, utilizationPct }>, totalAvailableMinutes }>
```

Logic:
- Pull active staff
- For each: sum `(endDate - startDate)` minutes where `status = 'completed'` in range
- Denominator (available minutes): **staff_hours first → business_hours fallback → 40h/wk final fallback**
- Cap at 100%
- Skip staff with zero billed AND zero available

**Endpoint:** `GET /api/analytics/tech-utilization?period=week|month|quarter|year` (reuse `analyticsRequestSchema` + dateRange switch from line 71)

**Card** (`client/src/components/analytics/TechUtilizationCard.tsx`):
- Recharts horizontal `<BarChart>`, per-staff bars
- Bar color = `getStaffColor(staffId, staffList)`
- X axis 0–100%, label on right
- Empty state: "No staff utilization data yet."
- Tooltip: "{billedMinutes} min billed of {availableMinutes} available"

### Card B — Revenue per Service (this month)

**Backend:**
```ts
export async function getRevenuePerService(
  businessId: number,
  dateRange: DateRange
): Promise<{ services: Array<{ serviceId, serviceName, revenue, lineItemCount }>, untaggedRevenue }>
```

Logic:
- JOIN `job_line_items` → `jobs` → `invoices` → `services` (LEFT JOIN services)
- WHERE `invoices.status = 'paid' AND invoices.created_at BETWEEN range AND job_line_items.service_id IS NOT NULL`
- GROUP BY service, SUM amount, ORDER DESC LIMIT 10
- Separately compute `untaggedRevenue` = SUM where service_id IS NULL

**Endpoint:** `GET /api/analytics/revenue-per-service?period=...`

**Card** (`client/src/components/analytics/RevenuePerServiceCard.tsx`):
- Top-10 vertical bar chart
- Empty state: "Start tagging line items with services to see this breakdown. Edit a job → add line item → pick a service."
- Footer: "+ ${untaggedRevenue} from untagged line items" (when > 0)

**Mount point:** `client/src/pages/analytics.tsx` — wrap both cards in `<SectionErrorBoundary>`, lazy-import.

### Edge cases
- Staff with no staff_hours → business_hours fallback → 40h/wk final
- Deleted service → skip (NULL service.name via LEFT JOIN)
- All line items untagged → empty state, not "$0" chart
- Tax/discount line items polluting revenue → filter to `type IN ('service', 'labor')` if test data shows pollution (punt to v1.1 if not an issue)
- Refunded invoices → filter to `status = 'paid'` only

### Risk callouts
- **Denominator definition matters** — document the staff_hours → business_hours → 40h chain in tooltip so "100%" is interpretable
- **Revenue card empty at launch** — empty-state copy is critical
- **Performance** — `Promise.all` over staff list for utilization (matches existing `staff-performance` endpoint pattern at line 423)

---

## Cross-Cutting

### No new dependencies
Verified all of these already installed: `@dnd-kit/core`, `recharts`, `posthog-js`, `posthog-node`, shadcn components, lucide-react.

### TypeScript
`npx tsc --noEmit` before each PR. No new types introduced — all reuse existing schema types.

### Migration safety
- One additive nullable column (`job_line_items.serviceId`)
- `addColumnIfNotExists` pattern (idempotent)
- `ON DELETE SET NULL` keeps line items alive if service deleted
- Ships in Phase 1 PR ahead of dependent code

---

## What NOT To Build (Scope Creep Guards)

1. **No live updates on Kanban** — refetch on drop only. No WebSocket. No polling.
2. **No route optimization API** — order = scheduled time. No "shortest path."
3. **No live BI charts** — point-in-time with manual refresh.
4. **No "send route to tech's phone"** — opens on current device only.
5. **No multi-day Kanban view** — single-day picker.
6. **No drag-to-reschedule on Kanban** — only drag-to-assign-staff. Time stays.
7. **No assignment audit log** — `kanban_job_assigned` PostHog event is the record.
8. **No bulk reassignment** — one card at a time.
9. **No customer notification on Kanban reassignment** — status-change SMS only fires on status changes (existing behavior).
10. **No service-tagging migration of historical line items** — Revenue per Service starts empty, fills as people tag.
11. **No PostHog feature flags consumed** — only event capture.
12. **No "30s staff location pings"** from claude.md's original suggestion — GPS already does this via `tech_location_pings`.

---

## Verification Checklist (before merging final PR)

- [ ] `npx tsc --noEmit` clean
- [ ] PostHog Live Events show all 7 server events firing
- [ ] Drag a job in Kanban → optimistic update → refresh → persisted
- [ ] Start Route on web → opens Google Maps tab with waypoints
- [ ] Tech Utilization card renders with seeded completed appointments
- [ ] Revenue per Service shows tagged line items from paid invoices
- [ ] Live Map tab still polls every 10s when active
- [ ] Kanban tab does NOT poll the GPS endpoint
- [ ] Empty states for both BI cards render correctly with zero data
- [ ] Mobile (Capacitor) build: route handoff opens Apple Maps on iOS, Google Maps on Android (manual test on physical device — deferred to ops)

---

*Status: awaiting approval before implementation begins.*
