# HVAC Vertical-First Roadmap — Step 5: Quote-from-Job + SMS Approval

> **Status: PLAN — awaiting owner sign-off before implementation.**
> Per roadmap pattern, every step gets a plan first, then ships in its own focused commit. Steps 1-4 are shipped (commits `cad650f` → `9806c92`); this is the final step on the active HVAC roadmap before we declare the vertical wedge feature-complete.

---

## 1. What this earns the platform

HVAC field service has a structural problem that none of the incumbents (ServiceTitan, Housecall Pro, Jobber) handle cleanly:

1. Tech goes out for a diagnostic (which Step 2 already routes through automatically when the caller asks about an `AC Repair` style `quote_required` service).
2. Tech diagnoses on-site. Real cost is not $89 — it's $1,400 to replace the compressor.
3. Tech needs to convert the diagnostic visit into a real estimate the customer can approve on the spot or after thinking about it for 24 hours.
4. Once approved, the *actual repair* needs to land as its own dispatchable job (so the calendar reflects reality, the tech has a fresh briefing, and the membership-discount + financing + invoice paths all flow through cleanly).

Today our app stops at step 2. The tech taps "Send Invoice" or "Send Quote" but the quote-side flow is half-built: there's a `quotes` table, a portal page, a follow-up scheduler — but **no path from "the diagnostic job is done" to "the customer texted YES and a fresh repair job is on the calendar."** Step 5 closes that loop.

After Step 5 ships, HVAC owners get the demo magic moment:
> Tech to customer: "I'll text you the quote. Reply Y and we'll schedule the repair."
> *5 minutes later* — customer texts "Y" → quote moves to `accepted` → new repair job lands on the dispatcher's calendar with the same customer + linked equipment + member discount + financing CTA already applied → tech's mobile app pings them with the briefing for the follow-up visit.

That sequence is the wedge over ServiceTitan/Housecall Pro because none of them have:
- The diagnostic-first booking trigger (Step 2)
- The auto-priced member-discount line (Step 4)
- The SMS-keyword approval chain (Step 5 — this plan)
- The auto-job-creation back into the dispatch calendar (Step 5 — this plan)

…all stitched together. They do quotes. They do jobs. None of them do this loop.

---

## 2. What we're reusing vs building net-new

### Reusing (already shipped)
- `quotes` table — already has `jobId` (source-job link), `accessToken` + `accessTokenExpiresAt`, `status` enum-as-text (`pending` / `accepted` / `declined` / `expired` / `converted`), `convertedToInvoiceId` (we'll repurpose the converted concept).
- `quoteItems` table — line-item shape already matches `jobLineItems`.
- `quote_follow_ups` table + scheduler (existing) — reminder cadence on un-acted quotes.
- `/portal/quote/:token` route + UI — already renders the customer-facing quote view with financing CTA + member discount (Step 4 wired the member-discount surface, financing came in earlier).
- Portal access-token generation pattern from the `send-invoice` flow shipped in the Cash-Loop Polish phase.
- Notification service `sendQuoteSentNotification(quoteId, businessId, quoteUrl)` — already TCPA-aware, already free-plan gated.
- SMS keyword handler infrastructure in `server/routes.ts` (the CONFIRM / CANCEL / RESCHEDULE / C handlers). We extend it.
- `getIndustryConfig()` matrix from Step 1 — gates the "Send Quote" button visibility.
- `createAppointmentSafely()` transactional pattern from prior race-fix work — we use it for the auto-created follow-up appointment.

### New (this step ships)
- **Server**: `POST /api/jobs/:jobId/send-quote` endpoint (mirrors `send-invoice`).
- **Server**: New SMS keyword handler for `APPROVE` / `Y` / `YES` and `DECLINE` / `N` / `NO` that resolves a recent outbound quote SMS and acts on it.
- **Server**: Quote-accepted hook that auto-creates a follow-up repair job (and optionally a placeholder appointment slot) linked to the source diagnostic job.
- **Server**: Migration for one new column: `jobs.sourceQuoteId` (links the auto-created repair job back to the quote it came from, for reporting).
- **UI**: "Send Quote" button on the completed-job page, conditional on industry-config gating.
- **UI**: Job detail page — new "Created from quote #N" pill on the auto-created repair job, plus a "Quote sent" status pill on the source diagnostic job once a quote has been sent.
- **Tests**: New unit tests for the keyword routing + auto-job-creation path; new integration test for the end-to-end flow.
- **CLAUDE.md changelog entry**.

---

## 3. Schema changes

Single net-new column. No new tables.

```ts
// shared/schema.ts — on the existing `jobs` table
sourceQuoteId: integer("source_quote_id"),  // nullable — set when this job was auto-created from quote approval
```

Migration in `server/migrations/runMigrations.ts`:
```sql
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS source_quote_id INTEGER;
```

Idempotent via `addColumnIfNotExists()`. No backfill needed — existing jobs have null, which is the "not created from a quote" sentinel.

**Why not also add `quotes.sourceJobId`?** Because `quotes.jobId` already exists and serves that purpose (the source diagnostic job is the job the quote was built from). The new `jobs.sourceQuoteId` is the *reverse* link — on the auto-created repair job, point back at the quote that triggered it. The two columns together let us build the reporting view "diagnostic job N → quote N → repair job N" without a join through three tables.

---

## 4. Server changes

### 4.1. `POST /api/jobs/:jobId/send-quote` endpoint

New endpoint in `server/routes/jobRoutes.ts`. Modeled on the existing `POST /api/jobs/:jobId/send-invoice`.

**Auth**: `isAuthenticated` + business-ownership check (read job, verify `job.businessId === req.user.businessId`).

**Validation**:
- Job must exist and belong to the requesting business
- Job must have at least 1 line item (otherwise there's nothing to quote)
- No existing un-accepted quote already linked to this job (idempotency — second call returns the existing quote URL instead of creating a duplicate)

**Logic**:
1. Fetch job, customer, business, line items, business hours, tax rate (existing helpers).
2. Resolve member discount via `getActiveMembershipByCustomer()` — if the customer is an active member with a `memberDiscountPercent`, subtract that from labor + parts on the way into `quoteItems`.
3. Compute totals using existing `resolveTaxRate(business)` helper.
4. Generate access token via `randomBytes(24).toString('base64url')`; set `accessTokenExpiresAt = now + 90 days`.
5. Quote number format: `Q-YYYYMMDD-{jobId}` (matches the invoice-number convention).
6. Insert `quotes` row with `jobId = sourceJob.id`, `status: 'pending'`, `validUntil = now + 30 days`.
7. Insert `quoteItems` rows (one per source job line item).
8. Stamp the source job's notes (or a new `quoteId` reverse-pointer if we want one — see §3) so the UI can render the "Quote sent" pill.
9. Call `sendQuoteSentNotification(quoteId, businessId, quoteUrl)` (existing helper, already free-plan and TCPA gated).
10. Return `{ success: true, quoteId, quoteUrl, notified }`.

**Idempotency** matters: if a tech double-taps "Send Quote", the second call must NOT create a second quote with a different access token. The endpoint checks for an existing `quotes` row with `jobId = sourceJob.id` AND `status IN ('pending', 'sent')`, and if found, re-sends the existing access token via the notification path instead of creating a new row. This matches the same pattern the `send-invoice` endpoint already follows.

### 4.2. SMS keyword handler for APPROVE / DECLINE on quotes

Extension to the existing SMS keyword handler chain in `server/routes/twilioWebhookRoutes.ts` (or wherever the CONFIRM/CANCEL/RESCHEDULE keywords land — need to verify the file location during implementation).

**Trigger**: incoming SMS body matches `/^(approve|y|yes|sounds good|let'?s do it|book it)$/i` OR `/^(decline|n|no|no thanks|not now)$/i`.

**Resolution path** (in order):
1. Find any active `sms_conversations` row for this `(businessId, customerPhone)` pair with `agentType = 'quote_approval'` and the keyword logic routes through that conversation's state (this lets the SMS agent handle disambiguation if multiple quotes are outstanding).
2. If no active quote conversation: look up the **most recent** outbound `notification_log` row with `type = 'quote_sent'` for this customer phone within the last 7 days. The quote ID is in the log row's `referenceId`.
3. If no recent quote either: fall through to the existing keyword handlers (so APPROVE doesn't accidentally trigger anything when no quote is outstanding — silent no-op or a generic "I don't have a recent quote for you, please call us" reply).

**Multi-quote disambiguation**: if step 2 finds 2+ recent quotes (rare in practice — most HVAC contractors won't have multiple pending quotes for the same customer in a 7-day window — but worth handling for correctness), reply with the numbered list pattern already used for multi-appointment CONFIRM/CANCEL/RESCHEDULE disambiguation:
> "I see 2 recent quotes. Reply with the number to approve:
> 1. AC repair — $1,400 (sent Tue)
> 2. Duct cleaning — $350 (sent Thu)"

Then wait for `1` or `2` in the next SMS turn (same `sms_conversations` state-machine pattern as the existing CANCEL flow).

**On APPROVE**:
- Set `quote.status = 'accepted'`.
- Fire `quote.accepted` event (see §4.3).
- Reply via TwiML: `"Approved! We'll text you to confirm scheduling. Reply STOP to opt out of marketing."` (Note: this is transactional — opt-out footer is the standard TCPA one, NOT the marketing one.)

**On DECLINE**:
- Set `quote.status = 'declined'`.
- Reply via TwiML: `"No problem. Let us know if you change your mind!"`.

**On STOP / opt-out keywords**: route through the existing opt-out flow (don't accidentally hijack STOP).

### 4.3. Quote-accepted → auto-create repair job

New service: `server/services/quoteAcceptanceService.ts` (mirrors `quoteConversionService` if it exists, otherwise a fresh module). Exports:

```ts
export async function handleQuoteAcceptance(quoteId: number): Promise<{
  newJobId: number;
  notified: boolean;
}>
```

**Logic**:
1. Fetch quote + quote items + source job (via `quote.jobId`) + customer + business.
2. Insert new `jobs` row:
   - `customerId` = source.customerId
   - `businessId` = source.businessId
   - `staffId` = source.staffId (default to the same tech; dispatcher can reassign)
   - `title` = `"Repair from quote ${quote.quoteNumber}"`
   - `description` = quote notes
   - `status` = `'pending'`
   - `urgency` = source.urgency (carry triage data forward — Phase 1 work)
   - `issueType` / `symptoms` / `accessNotes` = source.* (same)
   - `sourceQuoteId` = quote.id
   - `scheduledDate` = null (dispatcher schedules separately — we don't auto-schedule a slot because availability isn't knowable from the SMS context)
3. Insert `jobLineItems` rows mirroring the `quoteItems` (1:1 copy, prices carry over).
4. Mark the quote as `status = 'converted'` (existing column value, used today by the invoice-conversion path — we reuse it for job-conversion, which is the better semantic).
5. Send a notification to the business owner: `"Quote #N approved — new repair job #M is ready to schedule."` Fire-and-forget via existing email path or owner SMS.
6. Fire `job.created_from_quote` event (existing orchestration dispatcher) — currently a no-op but available for future agents (e.g., a future agent that auto-schedules into the next-available slot for emergency-urgency jobs).
7. Return `{ newJobId, notified }`.

**Idempotency**: if `quote.status` is already `'converted'` AND there's already a `jobs` row with `sourceQuoteId = quote.id`, return that existing job ID instead of creating a duplicate. Defends against double-SMS-approval (customer texts Y twice from different devices, retry races, etc.).

**Transaction**: wrap the quote-status-update + new-job-insert + line-item-inserts in `db.transaction()`. Either all three land or none do.

### 4.4. Things NOT in this step (out of scope, future work)

- **Auto-scheduling the follow-up appointment**. We considered it but availability isn't known from SMS context, and "AI picks a time and we live with it" is the kind of feature that creates more support tickets than it saves. Dispatcher schedules from the job-detail page (existing flow). If owner data after Step 5 ships shows >50% of approved quotes get scheduled in <5 minutes by the dispatcher, we can add a future "auto-suggest next slot" feature — but not now.
- **Voice approval via Retell**. Same SMS flow except by phone. Adds a `quoteApproval` tool to the AI receptionist. Cleaner to wait — most HVAC quote approvals happen async (customer thinks about it for hours/days), not while the customer is on the phone. Defer to data.
- **Stripe Payment Link embedded in the quote SMS**. Tempting (customer approves AND pays deposit in one tap), but doubles the surface area and creates ambiguity around partial approvals. v2.
- **Quote expiration auto-decline**. We already have `validUntil` + the `quote_follow_ups` scheduler for reminders. Auto-flipping to `expired` on date arrival is a 1-line scheduler addition, but it's separable — ship Step 5 first, add the auto-expire as a follow-up if it actually causes support pain.
- **Multi-line discount editing in the quote portal**. The portal already renders the quote read-only. If customer wants to negotiate, they call/text the owner directly. Negotiation-via-portal is a v2 feature that requires owner-side approval flow.

---

## 5. UI changes

### 5.1. Job detail page — "Send Quote" button

`client/src/pages/jobs/[id].tsx` — the completed-job actions cluster gets a new "Send Quote" button (matches the existing "Send Invoice" treatment from the Cash-Loop Polish phase).

**Visibility gate**: only renders when
- job.status === 'completed' AND
- job has ≥1 line item AND
- the source service was `pricingType: 'quote_required'` OR the business's `industryConfig.bookingFlow === 'diagnostic_first'` (i.e., HVAC / plumbing / electrical / automotive contexts where quote-from-job is the natural follow-up).

For barbershops/salons/restaurants/etc. the button never renders. They don't need a quote flow — they have direct fixed-price services.

**Button states**:
- No quote yet: outlined "Send Quote" button (primary action: "Send Invoice" stays green; "Send Quote" sits beside it)
- Quote already sent + status='pending': disabled with "Quote sent" label + "Resend" secondary action
- Quote accepted: pill showing "Quote accepted — repair job #M created" with a link to the new job
- Quote declined: pill showing "Quote declined"

**Test IDs**: `job-send-quote`, `job-quote-resend`, `job-quote-accepted-link`.

### 5.2. Job detail page — "Created from quote" pill

When viewing a job that has `sourceQuoteId` set, render an info pill at the top: `"Created from quote ${quoteNumber} — view"` with a link back to the source quote's portal page (or an admin quote view if we have one). Lets dispatch see the audit trail at a glance.

### 5.3. Portal quote page

Existing page already renders the quote. The Step-4-shipped member-discount surface already shows discounts. The Cash-Loop financing CTA already shows financing. **No frontend changes needed** beyond a one-line "Reply Y to your text to approve, or call us" hint, but that's content not code.

---

## 6. Tests

### 6.1. Unit tests
- `server/routes/jobRoutes.test.ts` (or extend existing) — `POST /api/jobs/:jobId/send-quote`:
  - Happy path: creates quote + quote items + access token + sends SMS
  - Idempotency: second call returns existing quote ID, doesn't create a duplicate row
  - Validation: 400 when no line items
  - Auth: 403 when calling business doesn't own the job
  - Free-plan: notification path returns `notified: false` but quote is still created
- `server/services/quoteAcceptanceService.test.ts` — `handleQuoteAcceptance(quoteId)`:
  - Happy path: creates new repair job with correct sourceQuoteId, mirrors line items, flips quote.status to 'converted'
  - Idempotency: second call returns existing repair job ID, doesn't create a duplicate
  - Triage carry-forward: urgency/issueType/symptoms/accessNotes copied to new job
  - Transaction rollback: simulated DB error during line-item insert rolls back the quote-status update too
- `server/routes/twilioWebhookRoutes.test.ts` (or wherever SMS keywords live) — APPROVE / DECLINE handlers:
  - Y/YES/APPROVE all trigger acceptance
  - N/NO/DECLINE all trigger decline
  - With no recent quote: silent no-op (or generic "no recent quote" reply)
  - Multi-quote disambiguation: numbered-list reply, then a `1` reply resolves correctly
  - STOP still routes to opt-out (not hijacked)

### 6.2. Integration test
- `server/test/e2e-quote-from-job.test.ts` (new file) — end-to-end:
  1. Create business + HVAC service catalog (uses Step 2 seed)
  2. Create customer + diagnostic job + line items
  3. POST send-quote → assert quote created, SMS log row created
  4. Simulate inbound SMS "Y" → assert quote.status='converted', new job created with correct sourceQuoteId
  5. Assert new job appears in `GET /api/jobs` for this business
  6. Re-send "Y" → assert idempotent (no duplicate job)

Target: bring total test count to ~1180 (currently 1175). All green.

---

## 7. Risk register

| Risk | Mitigation |
|---|---|
| SMS APPROVE collides with another customer's CONFIRM flow | Handler routes through `sms_conversations.agentType` first; only falls back to "most recent quote" lookup if no active conversation exists |
| Customer approves a quote 60 days after it was sent and the price is stale | `validUntil` exists today + auto-expire (deferred to follow-up) — for now, the keyword handler checks `validUntil` and replies "This quote has expired — please contact us for a new one" instead of converting |
| Tech sends quote, customer replies Y, owner has meanwhile deleted the quote in admin UI | Idempotency check + null-quote-handling → silent no-op + log warning |
| Duplicate repair job from SMS retry storm | `sourceQuoteId` + `quote.status='converted'` checked in transaction — only one job ever gets created per accepted quote |
| Race: two devices reply Y simultaneously | `db.transaction()` + `SELECT ... FOR UPDATE` on the quote row (or equivalent advisory lock); second tx sees `status='converted'` and returns the already-created job |
| Member discount snapshot drift: customer's membership expires between quote-sent and quote-accepted | We snapshot the discount % into the `quoteItems` row prices at send time. Acceptance uses the snapshot, not the live membership state. This matches industry expectation (a quote is a price commitment) |
| Free-plan business sends a quote, customer can't reply via SMS | Free-plan gate already blocks outbound SMS at the Twilio chokepoint; the endpoint creates the quote + portal link successfully, but no SMS goes out. Tech tells customer to use the portal link instead. Existing behavior, no new work. |

---

## 8. Sequencing within Step 5

Within Step 5 itself, I'd ship in this order across 2-3 commits (depending on owner preference):

**Option A — single commit (faster, riskier)**: ship schema + endpoint + service + SMS handler + UI + tests in one commit. ~15 file changes. Easier to roll back atomically.

**Option B — two commits (recommended)**:
1. **Commit 1**: schema migration + `POST /api/jobs/:jobId/send-quote` endpoint + Send Quote button. Quote sends work, customer can see portal, but APPROVE/DECLINE keywords don't route yet (customer can still approve via portal click). Ship + smoke-test in prod for a day.
2. **Commit 2**: SMS keyword handler + `quoteAcceptanceService` + auto-repair-job creation + "Created from quote" pill + integration test. Adds the magic moment.

I recommend **Option B**. The quote-portal-click approval flow is already working via the existing portal view + accept button (need to verify), so commit 1 doesn't break anything new. Commit 2 adds the wedge feature on top of working infrastructure. If something goes sideways in commit 2's SMS handler, owners still have the portal click as a fallback path.

**Option C — three commits**: same as Option B but split commit 2 into "SMS handler" + "auto-job-creation". Slower but safest. Probably overkill unless the SMS keyword regression risk feels high.

---

## 9. Verification gates (per existing roadmap pattern)

1. `npx tsc --noEmit` clean
2. Full test suite passes (target 1180/1180; current baseline 1175 with 2 pre-existing flakes documented in CLAUDE.md)
3. New tests added per §6
4. Manual smoke: load a barbershop business — **zero visible change** (Send Quote button never renders, SMS keyword handler never matches because no recent quote exists for the test customer)
5. Manual smoke: load an HVAC business — full end-to-end works (tech sends quote from a completed diagnostic job, customer SMS-approves, new repair job appears in dispatch)
6. CLAUDE.md updated with new "Recent changes" entry
7. Owner approves (commits per step, do not auto-commit)

---

## 10. Decision matrix — what I need from the owner before implementing

1. **Approve the scope.** Are §2 (reuse vs new), §3 (one schema column), §4 (endpoints + service + handler), §5 (one new button + one pill), and §6 (test plan) what you want? Or scope-add / scope-cut?

2. **Pick a commit sequence.** Option B (two commits) is my recommendation. Want A (single) or C (three)?

3. **Auto-create job AND auto-create appointment, or job only?** §4.3 ships job-only. Adding the appointment is +1 transaction line and the dispatcher has to confirm it anyway — but if you want the magic-moment demo to show a real slot landing on the calendar I can wire `createAppointmentSafely()` for the next-available staff slot. Trade-off: looks slicker in demos, generates more "wait that's the wrong time" support tickets in practice.

4. **Quote keyword set.** I went with `APPROVE/Y/YES/SOUNDS GOOD/LET'S DO IT/BOOK IT` + `DECLINE/N/NO/NO THANKS/NOT NOW`. Tighten (just `Y`/`N`)? Loosen (add more colloquial variants)? Localize for Spanish?

5. **Member discount snapshot vs live.** §7 risk-register entry says we snapshot at send-time. Confirm. Alternative is "re-resolve at accept-time" — more accurate if membership state changed, but breaks the "a quote is a commitment" mental model.

6. **Hold deploy for HVAC beta customer to test, or ship to prod immediately on commit?** Step 4 shipped without a staged rollout. Same approach here?

---

## 11. What "ship done" looks like

When Step 5 lands and CLAUDE.md gets its changelog entry, the HVAC vertical-first roadmap (Steps 1-5) is **feature-complete**. The remaining roadmap section in CLAUDE.md ("Step 5 — Quote-from-Job + SMS Approval") moves out of the "Active Strategic Roadmap" and into the "Recent changes" archive.

The next strategic body of work after that is **GTM execution** — actually getting 10 paying HVAC customers on the platform, gathering Sentry/usage data, then layering on Step 6+ based on what the data tells us (member-pricing rules engine, family plans, equipment-age predictive outreach, auto-scheduling, voice quote approval, etc.).

But ALL of that is post-launch. The platform itself, from a vertical-feature perspective, is done after Step 5 ships.
