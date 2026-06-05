# Structured Triage + Cash-Loop Friction Polish — Implementation Plan

## Decisions locked (confirmed by owner)
- **`urgency` storage**: **hard Postgres enum** `job_urgency` with values `emergency` / `urgent` / `routine`. Created via `CREATE TYPE ... IF NOT EXISTS` guard in the migration. The `jobs.urgency` column is currently `text` in `shared/schema.ts` — see 1.1 below for the enum reconciliation. DB-level integrity, clean sort ordering, app-layer Zod still mirrors the 3 values for fast UX feedback.
- **Triage scope**: **jobs only** for v1. Appointment verticals (salon/barber) skip it.
- Build **Phase 1 (triage) first**, then **Phase 2 (cash-loop polish)** on top of richer job data. Low file collision between phases.

## KEY RESEARCH FINDINGS (resolve the pre-code blockers)
1. **The four triage columns ALREADY EXIST in `shared/schema.ts`** (`jobs` table, lines ~391-394): `urgency: text("urgency")`, `issueType: text("issue_type")`, `symptoms: text("symptoms")`, `accessNotes: text("access_notes")`. They are NOT yet in `server/migrations/runMigrations.ts`. → **Phase 1.1 reduces to the migration + enum reconciliation only.**
2. **`bookAppointment` DOES create a `jobs` row** (`callToolHandlers.ts` ~line 2211, `storage.createJob({...})`) in addition to the appointment. → **AI triage capture (1.3) is in-scope for v1** — wire triage params through the tool schema + handler → `createJob`.
3. **Dispatch active-sessions payload carries only `jobId` (number), not urgency** (`gpsTrackingRoutes.ts` `GET /api/gps/sessions/active`, ~lines 434-452). → **Urgency sort/filter belongs on `client/src/pages/jobs/index.tsx`** (the jobs calendar/list view), NOT `dispatch/index.tsx` (which is a live-map-only surface). See 1.6.
4. **Three hardcoded `0.08` tax rates** for Phase 2.1: `jobRoutes.ts:251` (auto-invoice, no override), `jobRoutes.ts:507` (manual generate-invoice, already accepts `req.body.taxRate`), `InvoiceForm.tsx:87` (`const TAX_RATE = 0.08`).
5. **`POST /api/jobs/:id/send-tracking-link`** (`jobRoutes.ts` ~676-706) is the auth-chain template for the new one-tap `send-invoice` endpoint (2.2).

## Out of scope (deferred)
- Line-item templates / POS presets
- Pay-link expiry tuning (90d is fine)
- Triage on appointments

---

## Phase 1 — Structured Triage

### 1.1 Schema (`shared/schema.ts`) — ALREADY DONE (columns exist) + enum reconciliation
The four columns already exist on `jobs` (lines ~391-394). For the **hard DB enum** decision:
- Define a `pgEnum("job_urgency", ["emergency", "urgent", "routine"])` near the top of the schema.
- Change `urgency: text("urgency")` → `urgency: jobUrgencyEnum("urgency")` (still nullable — existing jobs default null).
- `issueType` / `symptoms` / `accessNotes` stay `text` (free-form).
- `insertJobSchema` (line ~1461) uses `createInsertSchema(jobs).omit({ id, createdAt, updatedAt })` — the enum column auto-flows and Zod auto-derives the 3-value union from the pgEnum. Confirm no `.pick()` excludes it.

### 1.2 Migration (`server/migrations/runMigrations.ts`)
Insert after the existing jobs-column block (~line 169, before the call_logs section). Order matters — create the type BEFORE the column references it:
1. **Create enum type (idempotent):**
   ```sql
   DO $$ BEGIN
     CREATE TYPE job_urgency AS ENUM ('emergency', 'urgent', 'routine');
   EXCEPTION WHEN duplicate_object THEN null; END $$;
   ```
   (Run as a raw `pool.query(...)` — `addColumnIfNotExists` only does columns.)
2. **Add the columns** via `addColumnIfNotExists`:
   - `addColumnIfNotExists('jobs', 'urgency', 'job_urgency')` ← uses the enum type
   - `addColumnIfNotExists('jobs', 'issue_type', 'TEXT')`
   - `addColumnIfNotExists('jobs', 'symptoms', 'TEXT')`
   - `addColumnIfNotExists('jobs', 'access_notes', 'TEXT')`

   **Migration-safety note:** if any runtime DB already created `jobs.urgency` as `TEXT` from a prior deploy of the schema (since the schema currently declares it `text`), the `ADD COLUMN IF NOT EXISTS` is a no-op and the column stays `TEXT` — there is NO automatic TEXT→enum conversion. Add a guarded `ALTER TABLE jobs ALTER COLUMN urgency TYPE job_urgency USING urgency::job_urgency` wrapped in a try/catch so prod DBs get the enum, while fresh DBs (column created as enum) skip it harmlessly.

### 1.3 AI capture — `bookAppointment` (CONFIRMED in-scope: handler creates a job)
The tool schema lives in **`server/services/retellService.ts` (~lines 361-381)** via `customTool(...)`, and the handler is in **`callToolHandlers.ts` (~line 1692)** which creates the job at **~line 2211** (`storage.createJob({...})`).
- Add `urgency` (enum string), `issueType`, `symptoms`, `accessNotes` as **optional** properties to the `bookAppointment` JSON schema in `retellService.ts`. Do NOT add them to `required` (`['customerPhone','customerName','date','time']`). For `urgency`, set `enum: ['emergency','urgent','routine']` in the property so the model emits a valid value.
- Add the same fields to the handler's `params` type and pass them into the `storage.createJob({...})` call (~line 2211). Keep optional → graceful degrade when the caller doesn't volunteer details.
- Optional: a one-line system-prompt nudge ("for service jobs, capture urgency + the core symptom when natural") — defer if it bloats the prompt.

### 1.4 TriageCard (`client/src/pages/jobs/[id].tsx`)
- New `client/src/components/jobs/TriageCard.tsx`: read-only display of urgency (color-coded badge: emergency=red, urgent=amber, routine=slate), issueType, symptoms, accessNotes. Self-hides when all four are empty.
- **Mount point**: between `<OnMyWayCard>` (~line 841) and `<GpsSessionPanel>` (~line 844), or just before `<JobTimer>` (~line 854) — top of the detail body so dispatched techs see triage first. Job data already loaded via `useQuery(["/api/jobs", numericJobId])`.

### 1.5 Editable triage in JobForm (`client/src/components/jobs/JobForm.tsx`)
- Add the 4 fields to `jobSchema` (~lines 45-58) and the form body:
  - `urgency` → Select (emergency/urgent/routine), Zod `z.enum([...]).optional()`
  - `issueType` → text input (or Select if a fixed list emerges later)
  - `symptoms` → textarea
  - `accessNotes` → textarea
- Wire into the existing `zodResolver` (~line 85) + create POST `/api/jobs` (~114-134) / update PUT `/api/jobs/:id` (~136-159). `prepareDataForSubmission` (~105-112) only parseInt's IDs, so the new string fields pass through untouched.

### 1.6 Urgency sort + filter — on **jobs/index.tsx** (NOT dispatch)
- **Confirmed**: `GET /api/gps/sessions/active` returns only `jobId` (number), no urgency → dispatch is a live-map surface, wrong home. Put sort/filter on **`client/src/pages/jobs/index.tsx`** (jobs calendar/list), after `StaffFilterPills`.
- Add: sort by urgency (emergency → urgent → routine → null last), plus a filter chip/dropdown to show only a given urgency. Jobs payload already includes the row's `urgency` (it's a `jobs` column).
- Deferred (not v1): enriching the gps active-sessions payload with job urgency to color dispatch markers by priority.

---

## Phase 2 — Cash-Loop Friction Polish

### 2.1 Per-business tax rate
- Schema: add `taxRate: numeric("tax_rate", { precision: 5, scale: 2 })` (or match existing money/percent style) to `businesses`, default `0` or `8.00`. Migration via `addColumnIfNotExists('businesses', 'tax_rate', 'NUMERIC(5,2)')`.
- Replace hardcoded `0.08` in `server/routes/jobRoutes.ts` (both auto-invoice and manual-invoice paths) with `business.taxRate` (fallback to a sane default if null).
- Replace hardcoded `0.08` in the InvoiceForm component with the business's `taxRate` (fetched from business profile / `/api/business`).
- Add a tax-rate field to business settings (Billing section) so owners can set it.

### 2.2 One-tap send-from-job
- Collapse the two-step (generate invoice → open invoice → send link) into a single action on the **completed-job view**.
- New endpoint `POST /api/jobs/:id/send-invoice` modeled on the existing `POST /api/jobs/:id/send-tracking-link` pattern (same auth chain + ownership check). It should: ensure an invoice exists for the job (auto-create from line items + business taxRate if missing), generate the portal pay link (access token), and send via `notificationService.sendInvoiceSentNotification` (respecting Free-plan gate + `canSendSms`).
- Add a single "Send Invoice" button on the completed-job view that calls this endpoint and toasts success.

---

## Verification
- `npx tsc --noEmit` clean after each phase.
- Run server + client test suites; no regressions.
- Manual: create a job with triage via UI → appears in TriageCard + jobs/index.tsx urgency sort; complete a job → one-tap send produces a pay link with the business's tax rate applied.

## Files touched (estimate)
- **Phase 1**: `shared/schema.ts` (pgEnum + enum column), `server/migrations/runMigrations.ts` (enum type + 4 columns + TEXT→enum alter guard), `server/services/retellService.ts` (tool schema), `server/services/callToolHandlers.ts` (handler params → createJob), `client/src/components/jobs/TriageCard.tsx` (new), `client/src/pages/jobs/[id].tsx` (mount card), `client/src/components/jobs/JobForm.tsx` (editable fields), `client/src/pages/jobs/index.tsx` (urgency sort/filter).
- **Phase 2**: `shared/schema.ts` (`businesses.taxRate`), `server/migrations/runMigrations.ts` (`tax_rate` column), `server/routes/jobRoutes.ts` (replace 2× hardcoded 0.08 + new `send-invoice` endpoint), `client/src/components/invoices/InvoiceForm.tsx` (read taxRate from business), business settings Billing tab (tax-rate field), `notificationService` (reuse `sendInvoiceSentNotification`), completed-job view button in `[id].tsx`.

## CLAUDE.md
Update `CLAUDE.md` after each phase (new columns, new endpoint, new component) per the project's mandatory maintenance rule.

## Pre-code blockers — RESOLVED
1. ✅ `bookAppointment` creates a `jobs` row (`callToolHandlers.ts:~2211`). → 1.3 AI capture ships in v1.
2. ✅ Dispatch active-sessions payload carries only `jobId`, not urgency. → 1.6 lives on `jobs/index.tsx`.
