# Stripe Orphan Auto-Heal — Smoke Test Runbook

> **Use this to verify the orphan auto-heal shipped in commit `08792ea` is working end-to-end in the deployed environment.** Run it once in **test mode** before relying on the fix in production, and once again ~24 hours after the production deploy to confirm the 728/week `resource_missing` curve is dropping.
>
> **Time required:** ~10 minutes.
> **Risk level:** Low when run in Stripe test mode. **Never delete a live-mode customer that belongs to a real paying business.** That will not break anything (the heal will fix it), but it does interrupt that customer's billing until the next request triggers the heal.

---

## 0. Prerequisites

You need:
- Stripe Dashboard access with permission to delete customers
- Railway / Neon production DB access (for verifying the column gets nulled)
- Server logs access (Railway log tail OR Sentry, depending on which observability path lit up)
- A "throwaway" test-mode business in the deployed environment

**Setup once:**

1. Sign in to the deployed app at `https://smallbizagent.ai` (or your test env) and create a brand-new account using a throwaway email.
2. Pick a paid plan and complete card-first onboarding to the point where:
   - `users.stripeCustomerId` is populated for your test user
   - `businesses.stripeCustomerId` is populated for the test business (copied during express setup)
   - `businesses.stripeSubscriptionId` is populated and the business shows status `trialing`
3. Confirm in Stripe Dashboard (toggle to **Test mode** if you're using test keys) that the Customer + Subscription both exist.

**Record the IDs you'll be operating on:**

```
SELECT id, email, stripe_customer_id FROM users WHERE email = 'YOUR_TEST_EMAIL';
SELECT id, name, stripe_customer_id, stripe_subscription_id, subscription_status
FROM businesses WHERE id = (SELECT business_id FROM users WHERE email = 'YOUR_TEST_EMAIL');
```

You should have:
- `user.stripeCustomerId` = `cus_AAA...`
- `business.stripeCustomerId` = `cus_AAA...` (same as user — copied at provisioning)
- `business.stripeSubscriptionId` = `sub_BBB...`
- `business.subscriptionStatus` = `'trialing'`

---

## 1. Trigger the orphan

In Stripe Dashboard:

1. **Customers** → find `cus_AAA...`
2. Open it, click the `⋯` overflow → **Delete customer**
3. Confirm the deletion

This deletes the Stripe Customer **and** every Subscription attached to it. The DB columns on your business + user rows still hold the dead `cus_AAA...` reference. **This is exactly the production failure mode** the heal is designed to fix.

**Verify the orphan exists from Stripe's perspective:**

```bash
curl https://api.stripe.com/v1/customers/cus_AAA... \
  -u sk_test_YOUR_KEY:
# Expected: 400 { "error": { "code": "resource_missing", "message": "No such customer: 'cus_AAA...'" } }
```

---

## 2. Verify each call site heals correctly

Run these in the order listed. After each one, query the DB to confirm the column was nulled. The columns should stay null between steps — once one site heals it, every subsequent site sees `stripeCustomerId IS NULL` and short-circuits without re-hitting Stripe (this is the whole point — no more re-spamming the 400).

### 2.1. Hourly dedup sweeper (the #1 source of the 728/week)

This is the biggest one. Two ways to trigger:

**Option A — wait for the scheduler** (up to 60 minutes — checks `withReentryGuard('subscription-dedup')` first).

**Option B — call the admin endpoint manually:**

```bash
curl -X POST https://smallbizagent.ai/api/admin/subscription-dedup/run \
  -H "Cookie: <your admin session cookie>" \
  -H "X-CSRF-Token: <your token>"
```

(If that endpoint doesn't exist yet, just restart the server — the sweeper runs once on boot.)

**Expected log lines:**

```
[StripeOrphan] Cleared orphaned Stripe customer cus_AAA... from business 42 (also cleared stripeSubscriptionId — was unreachable on the dead customer)
[SubscriptionDedup] Sweep complete: scanned N, fixed 0 businesses with duplicates, cancelled 0 extra subs, 0 failures
```

Note: **0 failures**, not 1. Pre-fix, this would have logged `1 failure` and `resource_missing` would appear in the Stripe error dashboard.

**Expected DB state:**

```sql
SELECT stripe_customer_id, stripe_subscription_id, updated_at FROM businesses WHERE id = <test biz id>;
-- stripe_customer_id    | NULL
-- stripe_subscription_id| NULL
-- updated_at            | <recent timestamp>
```

**Expected Stripe dashboard state:** zero new `resource_missing` 400s for that customer. The sweeper saw the orphan, healed the DB, moved on — and won't re-hit it on the next run because the column is now NULL.

### 2.2. payment-required gate

Trigger by logging in as the test user and hitting any route protected by `requirePaymentMethod`. If you cleared the columns in step 2.1, repopulate them first:

```sql
UPDATE users SET stripe_customer_id = 'cus_AAA...' WHERE id = <test user id>;
UPDATE businesses SET stripe_customer_id = 'cus_AAA...' WHERE id = <test biz id>;
```

Then hit the gate (e.g., load a protected page in the dashboard).

**Expected log line:**

```
[StripeOrphan] Cleared orphaned Stripe customer cus_AAA... from business 42 (also cleared stripeSubscriptionId — was unreachable on the dead customer)
```

**Expected HTTP response:** 402 `{ code: 'PAYMENT_METHOD_REQUIRED', redirectTo: '/onboarding/checkout' }`. Frontend routes user to the checkout page where a fresh Customer will be created.

### 2.3. `POST /api/onboarding/start-trial`

Repopulate `users.stripeCustomerId` if necessary, then:

```bash
curl -X POST https://smallbizagent.ai/api/onboarding/start-trial \
  -H "Cookie: <test user session>" \
  -H "X-CSRF-Token: <your token>"
```

**Expected log line:**

```
[StripeOrphan] Cleared orphaned Stripe customer cus_AAA... from user 7
[OnboardingCheckout] Created Stripe customer cus_NEW... for user 7
```

**Expected response:** 200 with `{ clientSecret, customerId: 'cus_NEW...', planName }`. A fresh Stripe Customer was created and `users.stripeCustomerId` now points at it.

### 2.4. `POST /api/onboarding/repair-subscription`

Repopulate `users.stripeCustomerId = 'cus_AAA...'` and `users.businessId`, then:

```bash
curl -X POST https://smallbizagent.ai/api/onboarding/repair-subscription \
  -H "Cookie: <test user session>" \
  -H "X-CSRF-Token: <your token>"
```

**Expected response:**

```json
{
  "ok": false,
  "reason": "orphaned_stripe_customer",
  "message": "The Stripe customer for this user no longer exists. We cleared the dead reference — start a new trial to create a fresh customer."
}
```

**Expected log line:**

```
[StripeOrphan] Cleared orphaned Stripe customer cus_AAA... from user 7
```

### 2.5. `GET /api/onboarding/diagnose-subscription`

Same setup as 2.4, then:

```bash
curl https://smallbizagent.ai/api/onboarding/diagnose-subscription \
  -H "Cookie: <test user session>"
```

**Expected response:**

```json
{
  "ok": false,
  "reason": "orphaned_stripe_customer",
  "message": "The Stripe customer for this user no longer exists..."
}
```

### 2.6. createSubscription (express setup path)

If you want to exercise the `subscriptionService.createSubscription` heals (sites #2 + #3), the cleanest way is:

1. Repopulate `users.stripeCustomerId = 'cus_AAA...'`
2. Repopulate `businesses.stripeCustomerId = 'cus_AAA...'`, set `subscriptionStatus = 'free'`, clear `stripeSubscriptionId`
3. Trigger a plan change from Settings → Subscription, picking a paid plan

The flow will call `customers.retrieve` (site #2) → orphan detected → cleared → falls through to create a new Customer → calls `subscriptions.list` on the new Customer (site #3) → returns `{ data: [] }` cleanly → proceeds to create a new Subscription.

**Expected log lines:**

```
[StripeOrphan] Cleared orphaned Stripe customer cus_AAA... from business 42 (also cleared stripeSubscriptionId — was unreachable on the dead customer)
Stripe customer cus_AAA... not found, creating new one
[createSubscription] Healed business 42 DB row to point at live Stripe sub sub_NEW...  (was: null)
```

**Expected DB state:** fresh `cus_NEW...` and `sub_NEW...`, status `'trialing'`.

### 2.7. setup_intent.succeeded webhook (site #4)

Hardest to trigger naturally. To exercise it manually, use the Stripe CLI:

```bash
stripe trigger setup_intent.succeeded --override 'setup_intent[metadata][purpose]=onboarding_trial_card'
```

When the webhook fires with a deleted customer ID, you should see:

```
[StripeOrphan] Cleared orphaned Stripe customer cus_AAA... from business 42 ...
```

…and the welcome email is skipped (no business to look up an email for).

---

## 3. Post-deploy production verification (run ~24h after deploy)

Open the **Stripe error dashboard** → filter to `resource_missing` over the last 7 days. You should see:

- **Hour 0 (deploy)**: the existing ~104 errors/day curve (728/week)
- **Hour 1 (first sweeper run after deploy)**: a small burst of `[StripeOrphan]` log lines as the sweeper heals every orphan it encounters on first pass
- **Hour 2 onwards**: dramatic drop. Each orphan should fire exactly once (when first detected) and never again from the same source.
- **Week 1**: residual `resource_missing` errors should come **only** from net-new orphans (admin deletes a Customer in the Dashboard, test/live mode mismatch on a fresh ID, etc.). Expected steady-state: <10/week. If you're still seeing >100/week, something is wrong — open a ticket.

**Sentry verification (if observability hook is shipped in next commit):** filter Sentry events to message `stripe_orphan_healed` and group by tag `source`. You should see the bulk land under `source: sweeper` on first run, then a steep decline.

---

## 4. Rollback plan (if something goes wrong)

The heal is **fail-soft by design** — a bug in the heal helper cannot break a paying customer's flow. If you observe weirdness:

1. **Symptom: a real customer with a valid Customer ID gets it accidentally nulled.** Read the audit trail (search logs for `[StripeOrphan] Cleared orphaned Stripe customer cus_XXX...`). If the cleared ID was actually live in Stripe, that's a bug — `git revert 08792ea` and ship. The user's next visit will recreate a fresh Customer (no permanent damage; their existing Stripe Subscription stays intact since we only clear the DB pointer, not Stripe state).
2. **Symptom: heal log line appears but column isn't actually nulled.** Check the WHERE clause — the `eq(stripeCustomerId, orphanedCustomerId)` guard prevents nulling if the row's column has already been changed to a different value by a concurrent request. This is **correct behavior**, not a bug.
3. **Symptom: customer-facing 500 errors after deploy.** The heal helpers are fail-soft (any DB error is logged + swallowed), so they can't cause 500s on their own. If you see 500s with `[paymentRequired]` or `[OnboardingCheckout]` in the stack, the bug is elsewhere — investigate before reverting.

---

## 5. What "best in class" looks like after this ships

- `resource_missing` rate in Stripe error dashboard: **<10/week** (was 728/week)
- Mean orphan-detection-to-heal latency: **<1 hour** (next sweeper run, in most cases — instant for active onboarding flows)
- No DB integrity issues: the WHERE-clause race guard prevents accidental data loss
- No customer-facing impact: the heal is transparent; users either complete their flow on a freshly-created Customer or get a clear "orphaned_stripe_customer" message they can act on
