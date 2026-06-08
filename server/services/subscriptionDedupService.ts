/**
 * Subscription Dedup Sweep
 *
 * Hourly background job that walks every business with a stripeCustomerId,
 * lists their Stripe subscriptions, and auto-cancels duplicates using the
 * "prefer coupon-attached, else oldest" survivor logic. Aligns the DB row to
 * point at the survivor.
 *
 * Catches race-condition duplicates, retry-induced duplicates, Billing Portal
 * mistakes, and Stripe Dashboard manual ops that the realtime guards in
 * createSubscription miss.
 *
 * Idempotent: re-runs are no-ops for businesses with 0 or 1 live subscription.
 *
 * Logging: every action (kept, cancelled) is written to console with the
 * business ID and reason, so day-14 customer support tickets can be answered
 * by grepping logs.
 */

import Stripe from 'stripe';
import { db } from '../db';
import { businesses } from '@shared/schema';
import { eq, isNotNull, and, ne } from 'drizzle-orm';
import {
  isStripeResourceMissing,
  clearOrphanedBusinessStripeCustomer,
} from '../utils/stripeOrphanCheck';

let stripe: Stripe | null = null;
function getStripe(): Stripe {
  if (!stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY is not set');
    }
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2025-03-31.basil',
    });
  }
  return stripe;
}

interface SweepResult {
  scanned: number;
  withDuplicates: number;
  totalCancelled: number;
  failures: number;
  details: Array<{
    businessId: number;
    customerId: string | null;
    survivorId: string | null;
    cancelledIds: string[];
    reason?: string;
    error?: string;
  }>;
}

/**
 * Walk every business with a Stripe customer, consolidate any duplicate live
 * subscriptions. Returns a summary that can be inspected via the scheduler
 * logs or stored for admin reporting.
 */
export async function runSubscriptionDedupSweep(): Promise<SweepResult> {
  const result: SweepResult = {
    scanned: 0,
    withDuplicates: 0,
    totalCancelled: 0,
    failures: 0,
    details: [],
  };

  // Only consider businesses that have a Stripe Customer. No customer → no
  // possible duplicates. Skip businesses on the Free tier — they intentionally
  // have no subscription.
  let rows: Array<typeof businesses.$inferSelect>;
  try {
    rows = await db
      .select()
      .from(businesses)
      .where(
        and(
          isNotNull(businesses.stripeCustomerId),
          ne(businesses.subscriptionStatus, 'free'),
        ),
      );
  } catch (err: any) {
    console.error('[SubscriptionDedup] Failed to load businesses:', err?.message || err);
    return result;
  }

  console.log(`[SubscriptionDedup] Scanning ${rows.length} businesses for duplicate Stripe subscriptions...`);

  for (const business of rows) {
    result.scanned++;
    const customerId = business.stripeCustomerId;
    if (!customerId) continue;

    try {
      // List ALL subscriptions on this customer (live + cancelled, so we have
      // a complete picture). Expand discounts so we can identify the
      // coupon-attached survivor.
      let list;
      try {
        list = await getStripe().subscriptions.list({
          customer: customerId,
          status: 'all',
          limit: 20,
          expand: ['data.discounts'],
        });
      } catch (listErr) {
        // Orphan auto-heal: customer was deleted out from under us. Clear
        // the dead reference so the next sweep doesn't re-hit Stripe with
        // the same dead ID (the hourly sweeper is the #1 source of
        // resource_missing 400s in the Stripe error dashboard).
        if (isStripeResourceMissing(listErr)) {
          await clearOrphanedBusinessStripeCustomer(business.id, customerId, 'sweeper');
          result.details.push({
            businessId: business.id,
            customerId,
            survivorId: null,
            cancelledIds: [],
            reason: 'orphaned-customer-cleared',
          });
          continue;
        }
        throw listErr;
      }

      const live = list.data
        .filter((s) => s.status === 'trialing' || s.status === 'active')
        .sort((a, b) => a.created - b.created);

      if (live.length <= 1) {
        // Healthy state — at most one live sub. Skip.
        continue;
      }

      result.withDuplicates++;

      // Smart survivor selection: prefer coupon-attached, else oldest.
      const hasDiscount = (s: any): boolean => {
        if (Array.isArray(s.discounts) && s.discounts.length > 0) return true;
        if (s.discount) return true;
        return false;
      };
      const discounted = live.filter(hasDiscount);
      const survivor = discounted.length > 0 ? discounted[0] : live[0];
      const reason = discounted.length > 0 ? 'has-discount-attached' : 'oldest-no-discount';

      // Cancel all non-survivors immediately.
      const toCancel = live.filter((s) => s.id !== survivor.id);
      const cancelledIds: string[] = [];
      for (const sub of toCancel) {
        try {
          await getStripe().subscriptions.cancel(sub.id);
          cancelledIds.push(sub.id);
          console.log(
            `[SubscriptionDedup] Business ${business.id} (customer ${customerId}): ` +
            `canceled duplicate ${sub.id}`,
          );
        } catch (cancelErr: any) {
          console.error(
            `[SubscriptionDedup] Business ${business.id}: failed to cancel ${sub.id}:`,
            cancelErr?.message || cancelErr,
          );
        }
      }
      result.totalCancelled += cancelledIds.length;

      // Align the DB row to the survivor.
      try {
        await db.update(businesses)
          .set({
            stripeSubscriptionId: survivor.id,
            subscriptionStatus: survivor.status,
            updatedAt: new Date(),
          })
          .where(eq(businesses.id, business.id));
      } catch (dbErr: any) {
        console.error(
          `[SubscriptionDedup] Business ${business.id}: failed to align DB row:`,
          dbErr?.message || dbErr,
        );
      }

      console.log(
        `[SubscriptionDedup] Business ${business.id}: kept ${survivor.id} (${reason}), ` +
        `canceled ${cancelledIds.length} duplicate(s)`,
      );

      result.details.push({
        businessId: business.id,
        customerId,
        survivorId: survivor.id,
        cancelledIds,
        reason,
      });
    } catch (err: any) {
      result.failures++;
      console.error(
        `[SubscriptionDedup] Business ${business.id} (customer ${customerId}) sweep failed:`,
        err?.message || err,
      );
      result.details.push({
        businessId: business.id,
        customerId,
        survivorId: null,
        cancelledIds: [],
        error: err?.message || String(err),
      });
    }
  }

  console.log(
    `[SubscriptionDedup] Sweep complete: scanned ${result.scanned}, ` +
    `fixed ${result.withDuplicates} businesses with duplicates, ` +
    `cancelled ${result.totalCancelled} extra subs, ${result.failures} failures`,
  );

  return result;
}
