# CRM Overhaul Plan

## Context
The AI voice receptionist (Retell) is the primary source of customer records. Most customers are auto-created during calls — many have placeholder names ("Caller 9926", "Darius 5945") and no email. The CRM needs to reflect this reality: surface call intelligence, make it easy to clean up placeholder records, and give business owners actionable insights from the AI data.

## Files to Modify
1. `client/src/pages/customers/index.tsx` — Remove duplicate search bar, move Export into table
2. `client/src/components/customers/CustomerTable.tsx` — Status filters, dropdown menu replacing Delete button, Export button integration
3. `client/src/pages/customers/[id].tsx` — Customer Intelligence card, quick actions, better timeline formatting, birthday/SMS status in contact card

No new files. No backend changes (all APIs already exist).

---

## Changes

### 1. Clean up the list page (customers/index.tsx)
**Problem**: Page has a standalone `ExportButton` floating above, then a `FeatureTip`, then the `CustomerTable` which has its own header with search + "Add Customer". Two search areas.

**Fix**: Pass `ExportButton` as a prop to `CustomerTable` so it renders in the table header row. Remove the standalone export div. Keep the FeatureTip.

### 2. Status filter pills (CustomerTable.tsx)
**Problem**: Can't filter by Active/New/Lead/Inactive/Overdue. Hard to find customers that need attention.

**Fix**: Add a row of clickable filter pills below the search bar. Uses existing `getCustomerStatus()` to count per status. Client-side filtering on already-fetched enriched data. `useState<string>('all')` toggles the active filter.

Pills: `All (10) | Active (1) | New (3) | Lead (4) | Inactive (1) | Overdue (1)`

### 3. Replace Delete button with dropdown menu (CustomerTable.tsx)
**Problem**: Red "Delete" button on every row, one misclick from data loss. No quick actions.

**Fix**: Keep "View" button. Replace "Delete" with a `MoreVertical` dropdown containing:
- Send SMS (opens `sms:${phone}`)
- Create Invoice → `/invoices/create?customerId=X`
- Book Appointment → `/appointments?action=book&customerId=X`
- Separator
- Delete (red text, opens existing AlertDialog)

### 4. Customer Intelligence card on detail page ([id].tsx)
**Problem**: Backend calculates rich insights (LTV, sentiment, risk, preferences, reliability) but none of it is shown. The `/api/customers/:id/insights` endpoint exists and returns data.

**Fix**: Add a new `useQuery` for insights. Render a "Customer Intelligence" card below the Contact Information card:

- **Risk & Retention**: Risk level badge (low/medium/high with color), churn probability %, auto-tags as badges
- **Sentiment**: Average score (1-5) with trend indicator (arrow up/down/flat)
- **Reliability**: Score as percentage, with no-show / cancel / completed counts
- **Preferences**: Preferred services (pills), staff, day of week, time of day
- **LTV**: Lifetime value prominently displayed

Falls back to "Intelligence data will appear after calls are processed" when no insights exist yet — important since most records come from the AI receptionist and insights are calculated post-call.

### 5. Quick action buttons on detail page ([id].tsx)
**Problem**: Only action is "Edit". To SMS, invoice, or book you have to navigate away.

**Fix**: Add buttons to `PageTitle.actions` (alongside Edit):
- **Send SMS** — `MessageSquare` icon, `variant="outline"`, opens `sms:${phone}`
- **Create Invoice** — `FileText` icon, `variant="outline"`, navigates to `/invoices/create?customerId=${id}`
- **Book Appointment** — `Calendar` icon, `variant="outline"`, navigates to `/appointments?action=book&customerId=${id}`

### 6. Clean up activity timeline display ([id].tsx)
**Problem**: Raw system text shown to users: "[Recurring: monthly, 2/4] [Rescheduled to new appointment on Wednesday, Apr...]", "Phone Call — ai-call", "SMS: 1".

**Fix**: Add a `formatTimelineTitle()` function that:
- **Appointments**: Strips `[Rescheduled...]` and `[Recurring...]` brackets, extracts service name. "Haircut with Mike [Cancelled via phone]" → "Haircut with Mike". Bare "Appointment" stays as "Appointment".
- **Calls**: "Phone Call — ai-call" → "Phone Call". Shows intent only if it's a real intent (not "ai-call").
- **SMS**: "SMS: 1" → "SMS Message". Shows preview text if longer than just a number.
- Truncates all titles at 80 chars with ellipsis.

### 7. Surface birthday & SMS status in contact card ([id].tsx)
**Problem**: Contact card doesn't show birthday or SMS consent status despite the data being in the schema.

**Fix**: Add two items to the Contact Information card:
- **Birthday**: `Cake` icon, displayed if `customer.birthday` exists. Convert MM-DD to readable format ("March 15").
- **SMS Status**: `MessageSquare` icon, show "SMS opted in" (green text) or "SMS not opted in" (muted text) based on `customer.smsOptIn`. Show marketing status separately if different.

---

## Out of scope
- Pagination (customer count is manageable today)
- Customer merge/dedup (separate complex feature)
- Backend changes (all needed APIs already exist)
- New component files (everything fits in existing files)
