/**
 * Stripe Orphan Detection + Auto-Heal
 *
 * Stripe Customer IDs stored on `businesses.stripeCustomerId` and
 * `users.stripeCustomerId` can become orphaned when the underlying Stripe
 * Customer is deleted out from under us:
 *
 *   - Admin action in the Stripe Dashboard
 *   - Test-mode customer ID written into a live-mode DB (mode mismatch)
 *   - Abandoned onboarding where the Customer was created and then
 *     manually cleaned up
 *
 * Once orphaned, every subsequent Stripe API call using that ID returns
 * `resource_missing` 400. The hourly dedup scheduler is the worst offender —
 * it re-hits the same orphan every run, producing hundreds of 400s/week in
 * the Stripe error dashboard.
 *
 * This module centralizes the fix:
 *
 *   1. `isStripeResourceMissing(err)` — sniff a Stripe SDK error and return
 *      true if it's specifically the "no such customer" / "no such resource"
 *      400. Stripe attaches the machine-readable code at `err.code` and
 *      `err.raw.code`, with `err.statusCode === 400`.
 *
 *   2. `clearOrphanedBusinessStripeCustomer(businessId, orphanedCustomerId)`
 *      — null out the orphan on the business row so the next attempt creates
 *      a fresh Customer. Also clears `stripeSubscriptionId` because any
 *      subscription pointing at the dead customer is itself unreachable.
 *      Fail-soft: a DB failure here is logged but does not throw, so the
 *      caller can still return a useful sentinel to the user instead of
 *      cascading the failure.
 *
 *   3. `clearOrphanedUserStripeCustomer(userId, orphanedCustomerId)` — same
 *      shape for `users.stripeCustomerId` (used by the card-first onboarding
 *      flow, where the Customer is created BEFORE the business exists).
 *
 * Usage pattern at every Stripe call site that uses a stored customer ID:
 *
 *     try {
 *       const customer = await stripe.customers.retrieve(storedId);
 *       // …
 *     } catch (err) {
 *       if (isStripeResourceMissing(err)) {
 *         await clearOrphanedBusinessStripeCustomer(businessId, storedId);
 *         return null; // or whatever "no customer" sentinel the caller expects
 *       }
 *       throw err;
 *     }
 *
 * Fail-soft DB updates: if the heal write fails we still want the caller to
 * proceed (the next request will re-detect the orphan and try again). A
 * thrown error here would defeat the purpose — we'd just convert a
 * `resource_missing` 400 into a 500.
 */

import { db } from '../db';
import { businesses, users } from '@shared/schema';
import { and, eq } from 'drizzle-orm';

const LOG_PREFIX = '[StripeOrphan]';

/**
 * Returns true when the given error is Stripe's `resource_missing` 400 —
 * the specific shape we see when a stored Customer ID no longer exists in
 * Stripe.
 *
 * Defensive on shape: the Stripe SDK exposes the code on the top-level
 * `error.code` AND on `error.raw.code`. We check both so a wrapped /
 * re-thrown error from a different layer still matches.
 *
 * Returns false for any other error (network failures, auth failures,
 * rate limits, etc.) — those should propagate so the caller can decide
 * whether to retry.
 */
export function isStripeResourceMissing(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { statusCode?: unknown; code?: unknown; raw?: { code?: unknown } };
  if (e.statusCode !== 400) return false;
  if (e.code === 'resource_missing') return true;
  if (e.raw && typeof e.raw === 'object' && e.raw.code === 'resource_missing') return true;
  return false;
}

/**
 * Null out the orphaned `stripeCustomerId` (and the now-unreachable
 * `stripeSubscriptionId`) on the given business row.
 *
 * Fail-soft: errors are logged and swallowed. The caller proceeds with its
 * "no customer" code path. The next request will re-detect the orphan and
 * try again.
 */
export async function clearOrphanedBusinessStripeCustomer(
  businessId: number,
  orphanedCustomerId: string,
): Promise<void> {
  try {
    // Match on (id AND stripeCustomerId = orphan) so we don't accidentally
    // null out a column that's already been healed to a different value by
    // a concurrent request, AND so we don't clear a *valid* business
    // customer when the orphan we detected was actually on the user row
    // (caller passes businessId for cleanup, but the IDs may differ).
    await db
      .update(businesses)
      .set({
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(businesses.id, businessId),
          eq(businesses.stripeCustomerId, orphanedCustomerId),
        ),
      );
    console.warn(
      `${LOG_PREFIX} Cleared orphaned Stripe customer ${orphanedCustomerId} from business ${businessId} ` +
        `(also cleared stripeSubscriptionId — was unreachable on the dead customer)`,
    );
  } catch (err) {
    console.error(
      `${LOG_PREFIX} Failed to clear orphaned customer ${orphanedCustomerId} from business ${businessId}:`,
      err instanceof Error ? err.message : String(err),
    );
    // Intentionally swallowed — heal failures must not break the caller.
  }
}

/**
 * Null out the orphaned `stripeCustomerId` on the given user row. Used by
 * the card-first onboarding flow where the Stripe Customer is created
 * BEFORE the business exists (so the orphan lives on `users` instead of
 * `businesses`).
 *
 * Same fail-soft contract as the business variant.
 */
export async function clearOrphanedUserStripeCustomer(
  userId: number,
  orphanedCustomerId: string,
): Promise<void> {
  try {
    // Match on (id AND stripeCustomerId = orphan) so a concurrent heal or
    // a freshly-created Customer ID isn't accidentally nulled out.
    await db
      .update(users)
      .set({
        stripeCustomerId: null,
      })
      .where(
        and(
          eq(users.id, userId),
          eq(users.stripeCustomerId, orphanedCustomerId),
        ),
      );
    console.warn(
      `${LOG_PREFIX} Cleared orphaned Stripe customer ${orphanedCustomerId} from user ${userId}`,
    );
  } catch (err) {
    console.error(
      `${LOG_PREFIX} Failed to clear orphaned customer ${orphanedCustomerId} from user ${userId}:`,
      err instanceof Error ? err.message : String(err),
    );
    // Intentionally swallowed — heal failures must not break the caller.
  }
}
