# GPS Live Dispatch — Operator's Guide

**Audience**: SmallBizAgent operations team + customer success when onboarding field-service customers.

**Last updated**: 2026-05-24
**Feature owner**: Engineering (Tony Illiano)
**Disclosure version baseline**: `2026-05-24`

> ⚠️ **This document is informational, not legal advice.** State labor and privacy laws change frequently and apply differently to W-2 employees vs 1099 contractors. **Customers should consult counsel** before deploying GPS tracking — especially in CA, CT, DE, NY, TX, WA, IL. The default in-product disclosure and 90-day re-acceptance cadence reflect *current best practice*, not a legal guarantee.

---

## 1. What it does

Real-time GPS location tracking for field-service techs (HVAC, plumbing, electrical, landscaping, construction, pest control, roofing, painting). Two surfaces:

1. **Dispatcher dashboard** (`/dispatch`) — owner + manager see live tech positions on a Google Map.
2. **Customer tracking page** (`/track/:token`) — public, no-auth page where a customer can watch "their tech" arrive in real time. **Opt-in per send** — the tech explicitly taps "Send tracking link to customer" on a job; never auto-attached to the en-route SMS.

**Plan gate**: Growth+ tier ($299/mo) or legacy Professional/Business. Free, Starter, and trialing-without-paid-plan are blocked.

**Industry gate**: Only field-service (`isJobCategory()`-matching) industries. Barbers, salons, dentists, restaurants are blocked at both UI and middleware layers.

**Kill switch**: `GPS_FEATURE_ENABLED=false` env var turns the entire feature off (routes return 501, sweeper skips, settings tab still visible but reports unavailable).

---

## 2. Mobile setup (one-time per device)

### iOS (Xcode)

After running `npx cap sync ios`, open `ios/App/App.xcworkspace` in Xcode and verify:

1. **Signing & Capabilities → Background Modes** has "Location updates" checked.
2. **Info.plist** contains:
   - `NSLocationWhenInUseUsageDescription`
   - `NSLocationAlwaysAndWhenInUseUsageDescription`
   - `UIBackgroundModes` array includes `location`

These are already in the repo's `ios/App/App/Info.plist`. Xcode usually picks them up automatically on `cap sync`.

**Tester checklist (iOS)**:
- [ ] First session prompts for "Allow While Using App" location
- [ ] Background tracking continues after lock screen
- [ ] Pause/resume from `TrackingStatusBar` works
- [ ] Killing the app and reopening drains the offline queue
- [ ] Denying permission shows the consent dialog's denial state

### Android (Gradle)

After running `npx cap sync android`, open in Android Studio and verify:

1. **AndroidManifest.xml** has the GPS permissions block (already in repo):
   - `ACCESS_FINE_LOCATION`
   - `ACCESS_COARSE_LOCATION`
   - `ACCESS_BACKGROUND_LOCATION` (Android 10+)
   - `FOREGROUND_SERVICE`
   - `FOREGROUND_SERVICE_LOCATION` (Android 14+)
   - `WAKE_LOCK`

2. **Build > Generate Signed Bundle** for Play Store upload.

**Tester checklist (Android)**:
- [ ] First session prompts for fine + coarse location
- [ ] On Android 10+: separate prompt for "Allow all the time" (background)
- [ ] Foreground service notification appears while tracking active
- [ ] Notification text reads "You are currently on the clock"
- [ ] Backgrounding the app keeps pings flowing for at least 10 min

### NPM dependency

Before building either platform:

```bash
npm install @capacitor-community/background-geolocation
npx cap sync ios && npx cap sync android
```

This is **not** committed to `package.json` yet because the package isn't strictly needed for the web build (the source uses dynamic imports with `as any`). Add it before your first mobile release.

---

## 3. Google Maps prerequisites

The dispatcher map and customer track page both use the Google Maps JavaScript API.

1. In Google Cloud Console for the project owning `VITE_GOOGLE_PLACES_API_KEY`:
   - APIs & Services → Library → enable **Maps JavaScript API** (alongside Places).
2. Credentials → edit the API key → confirm HTTP referrer restrictions include:
   - `https://smallbizagent.ai/*`
   - `https://www.smallbizagent.ai/*`
   - `http://localhost:*`
3. Billing → set a **budget alert at $50/mo**. Free tier covers 28K map loads/mo. A single business with 100 customer-page views/day + dispatcher use stays comfortably under.

If the existing key is Places-only and you don't want to widen it, set a separate `VITE_GOOGLE_MAPS_API_KEY` in Railway env. The shared loader at `client/src/lib/google-maps-loader.ts` tries `VITE_GOOGLE_PLACES_API_KEY` first, then `VITE_GOOGLE_MAPS_API_KEY`, then a runtime fetch from `/api/config/public`.

---

## 4. State-by-state legal notes

> Again: this is informational. Recommend customers contact employment counsel before turning GPS on in any state with explicit-consent laws.

### Written-consent required (W-2 employees)

| State | Statute / Reference | Notes |
|---|---|---|
| **California** | Cal. Lab. Code § 980 + Cal. Civ. Code § 1798.99.5 (CCPA-adjacent) | Employer must provide written notice. Some local ordinances stricter. |
| **Connecticut** | Conn. Gen. Stat. § 31-48d | Written notice to employees before any electronic monitoring, including GPS. |
| **Delaware** | Del. Code Title 19 § 705 | Written or electronic notice. Daily reminder not required if one-time notice is signed. |
| **New York** | N.Y. Lab. Law § 52-c (effective 2022-05-07) | Written notice + acknowledgment before any electronic monitoring of employees. |
| **Texas** | Texas Penal Code § 16.06 (vehicle-tracking statute) | Consent required; criminal penalty for tracking without it. Generally satisfied by employment agreement. |
| **Washington** | RCW 49.44.135 | Notice required when tracking is added to existing workforce. |
| **Illinois** | 820 ILCS 55/10 (Right to Privacy in the Workplace Act) + Illinois BIPA | Notice required; BIPA touches biometric data adjacency. |

### One-party consent / general notice satisfactory

Most other states permit employer GPS tracking of company-issued devices used during work hours as long as a written policy exists in the employee handbook AND the employee has access to it.

### Personal vehicle vs company vehicle

Customers tracking techs in their **personal vehicles** face significantly higher legal exposure. The default product copy says "while you are on the clock" — but if a tech sometimes drives a personal car, the disclosure should explicitly say that tracking only runs during active sessions the tech starts, and tech can pause anytime. Owners can customize the copy via Settings → Live Dispatch → Tech Disclosure.

### 1099 contractors

Tracking 1099 contractors raises misclassification risk (location tracking is one factor IRS/state agencies use to argue actual W-2 employee status). Recommend customers consult counsel before turning on GPS for 1099-classified field staff.

---

## 5. Disclosure & consent model

### Default disclosure copy

Hard-coded in `server/services/gpsDisclosureService.ts` as `DEFAULT_DISCLOSURE_COPY`. It:
- Identifies the business by name
- States the purpose (dispatch coordination, customer ETA, route optimization)
- Notes tracking runs only during sessions the tech starts
- Notes pause/stop from device any time
- States retention period (defaults to 24h)
- States customer share TTL (defaults to 4h)
- Notes some US states require written consent and asks the tech to confirm they've reviewed employer policy

Owners can override this per business via Settings → Live Dispatch → Tech Disclosure.

### Re-acceptance triggers (CYA model)

A tech is prompted to re-accept on their **next session start** when any of these is true:

1. **Never accepted** (`gpsConsentAcceptedAt is null`)
2. **Owner bumped the version** (`staff.gpsConsentVersion != business.gpsDisclosureVersion`)
3. **Older than 90 days** (`gpsConsentAcceptedAt < now - 90d`)

The 90-day cadence is *lazy* — it only fires when the tech tries to start a new session. No background job pings dormant accounts.

### Owner-triggered revoke

Settings → Live Dispatch → Tech Consent Status table → per-row "Revoke" button. Clears `gpsConsentAcceptedAt` + `gpsConsentVersion`, forcing the tech to re-accept on their next session. Audit-logged as `gps_consent_revoked_by_owner`.

---

## 6. Data retention

### How it works

Hourly cron `runGpsRetentionSweep()` (in `server/services/schedulerService.ts`):
- Iterates all businesses with `gpsTrackingEnabled = true`
- For each, computes `cutoff = now - max(1, business.gpsRetentionHours) * 1h`
- Calls `storage.deleteExpiredPings(businessId, cutoff)`
- Globally calls `storage.deleteExpiredLinks()` to clean revoked/expired share tokens

Wrapped in `withReentryGuard + withAdvisoryLock + withTimeout(5min)`. Safe across multiple Railway instances. First run is ~1 hour after deploy (not on boot, to avoid competing with boot-time DB pressure).

### Defaults & caps

| Plan tier | Default retention | Max retention (owner-configurable) |
|---|---|---|
| Free / Starter / Trial | N/A — feature blocked | — |
| **Growth** ($299) | 24h | 24h |
| **Pro** ($449+) | 24h | 168h (7 days) |
| Founder | 24h | 168h |

The 1-hour **floor** in `runGpsRetentionSweep()` is defense-in-depth — even if owner mis-configures retention to 0, pings less than 1h old will not be swept.

### Disabling tracking

When owner turns OFF the master toggle in Settings:
- All active sessions for that business are immediately ended (no orphans).
- Subsequent ping ingestion returns 410 (session ended).
- Sweeper continues to delete old pings on its hourly tick.
- Settings tab remains visible for re-enabling.

### Compliance export

Future PR. The endpoint shape is documented in `server/middleware/gpsPlanGate.ts` (`gps_export_downloaded` audit action is already defined).

---

## 7. Customer tracking page

### What customers see

Public URL: `https://smallbizagent.ai/track/<32-char-base64url-token>`

Renders:
- Business name + phone (with "Call us" button)
- Tech first name + last initial only (e.g. "Mike S.")
- Live Google Map with a single marker, no breadcrumb history
- ETA pill: "ETA: ~12 min" (computed haversine from latest ping → job's `customerLocationLat/Lng` w/ 30mph fallback; falls back to tech-provided ETA from HVAC en-route flow if no GPS yet)
- Paused state copy: "(Mike is briefly paused — may be on a quick stop)"
- Completed state: "Service complete" with checkmark

Polls every 15 seconds. Mobile-first responsive design.

### What customers do NOT see

- Tech full name, email, or phone
- Breadcrumb / historical path
- Customer address read back to them (privacy + redundant)
- Any data from other tenants

### Sharing flow

The tech opens the job detail page → starts a tracking session → taps "Send tracking link to customer" (separate transactional SMS, never bundled with the en-route SMS). The tech can revoke the link any time from the same panel. Link expires after `gpsCustomerShareDefaultMinutes` (default 4h).

### Rate limiting

The public endpoint is rate-limited to 60 requests/minute per IP. A customer reloading their tracking page at 15s intervals = 4 req/min, leaving plenty of headroom.

---

## 8. Settings panel walkthrough

Owner navigates to **Settings → Business → Live Dispatch** (tab only renders for field-service industries).

### Master toggle
Single switch. Turning OFF immediately ends all active sessions.

### Data retention
Slider 1h – plan-tier max. Visual warning at <8h ("dispatcher may lose today's breadcrumb"). Pro upsell if cap is 24h.

### Customer sharing
Toggle + default link TTL dropdown (30m / 1h / 4h default / 8h / 24h).

### Tech disclosure
Editable copy. "Save & bump version" triggers an AlertDialog confirming all techs will need to re-accept. "Reset to default" reverts to `DEFAULT_DISCLOSURE_COPY` with a fresh version. Placeholders: `{businessName}`, `{retentionHours}`.

### Tech consent status table
Per-tech rows showing:
- Status badge: "Up to date" / "Never accepted" / "Needs re-accept" / "90+ days old"
- Paused badge if applicable
- Last accepted date + version
- "Revoke" action (with AlertDialog confirmation)

### Quick link
"Open Dispatch Map" button → `/dispatch`.

---

## 9. Audit log

Every state-changing GPS action emits an `audit_logs` row via `logAudit()`. Twelve action types:

| Action | Triggered by |
|---|---|
| `gps_session_started` | Tech taps "Start Live Dispatch" on a job |
| `gps_session_ended` | Tech taps "Stop" / job completes / shift ends / permissions revoked |
| `gps_session_paused` | Tech toggles pause/resume |
| `gps_disclosure_updated` | Owner saves new disclosure copy (bumps version) |
| `gps_retention_changed` | Owner updates retention slider |
| `gps_tracking_toggled` | Owner flips master toggle |
| `gps_link_created` | Tech taps "Send tracking link to customer" |
| `gps_link_revoked` | Owner or tech revokes a customer share link |
| `gps_export_downloaded` | (Reserved — future export endpoint) |
| `gps_consent_accepted` | Tech accepts the disclosure dialog |
| `gps_consent_expired_reprompt` | (Reserved — currently inferred from `gps_consent_accepted` after a re-prompt) |
| `gps_consent_revoked_by_owner` | Owner revokes a tech's consent from Settings |

All include IP address + user agent for forensic correlation.

---

## 10. Customer service script (for support team)

### "My tech is freaking out about being watched."
The disclosure flow is consent-first. The tech sees the policy before any tracking starts, can pause anytime, and can decline the session entirely. Owners can customize the copy or shorten the retention period via Settings. Reassure the customer (business owner) that this is the most privacy-respecting model in the field-service software market.

### "I want to track my techs without their knowledge."
We do not support that and won't enable it. The product requires per-tech consent for legal and ethical reasons. Direct the customer to talk to legal counsel about what they're actually trying to achieve.

### "My customer says they didn't consent to having their location tracked."
Customer location is **not** tracked — only the tech's location is tracked. Show the customer how to revoke the tracking link or wait for it to expire (default 4h).

### "I'm in California (or CT, DE, NY, TX, WA, IL) — can I use this?"
Yes, but you must provide written notice and acknowledgment to employees before turning on tracking. The product's default disclosure includes such notice; have employees acknowledge it via the in-app consent flow OR via your own offline written policy. Consult counsel.

### "How much data is stored?"
For Growth tier: up to 24 hours of GPS pings per tech per session, deleted hourly. For Pro tier: up to 7 days. Pings include lat/lng + accuracy + speed + heading + battery + timestamp. No video, no audio.

### "I want to delete a tech's data immediately."
Owner can: (1) end the session in Settings / dispatcher, (2) lower retention temporarily to 1h to force sweep, (3) [future] use compliance export endpoint to grab a copy first.

---

## 11. Operational runbook

### "GPS appears broken — tech can't start a session."

1. Confirm `GPS_FEATURE_ENABLED` env var is NOT set to `false` on Railway.
2. Confirm business industry matches `isJobCategory()` (HVAC, plumbing, electrical, landscaping, construction, pest control, roofing, painting, automotive, cleaning).
3. Confirm business plan tier is Growth/Pro/Professional/Business/Founder (admin always passes).
4. Confirm `business.gpsTrackingEnabled = true`.
5. Confirm the tech's `staff.businessId` matches the calling user's business.
6. Check browser console / mobile device logs for `[GPS]` prefix messages.

### "Pings aren't reaching the server."

1. Check Capacitor permission status (`getPermissionStatus()` returns `granted`).
2. Check device clock — pings older than 30 min OR more than 5 min in the future are dropped server-side.
3. Check accuracy — pings with accuracy >500m are dropped.
4. Check session status — paused sessions silently drop pings; ended sessions return 410.
5. Check rate limit — 120 pings/min/IP. Multi-tech shops on shared office WiFi should not hit this.

### "Customer tracking page shows 'Tracking is no longer available' even though session is active."

The master toggle (`business.gpsCustomerShareEnabled`) was turned off, OR the link was revoked, OR the link expired. Check `customer_tracking_links` row for `revokedAt` and `expiresAt`.

### "Sweeper isn't deleting old pings."

1. Confirm the scheduler is running: look for `[Scheduler] GPS retention sweeper started (1h interval)` in startup logs.
2. Confirm `GPS_FEATURE_ENABLED` isn't set to `false`.
3. The first sweep runs ~1 hour after deploy, not immediately on boot.
4. Manually trigger via psql: `SELECT pg_advisory_lock(hashtext('gps-retention-sweeper'));` then watch for the next interval tick.

---

## 12. Future work (not in current release)

- Compliance export endpoint (`gps_export_downloaded` action already reserved)
- Geofencing alerts (notify dispatcher when tech leaves job site)
- Driving behavior scoring (hard braking, speeding)
- Multi-tech route optimization
- Auto-time-clock punch on arrival
- WebSocket live updates for dispatcher (currently 10s polling)
- Native widget for tech home-screen quick-start
