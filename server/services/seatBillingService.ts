/**
 * Per-Seat Billing (Starter plan only)
 *
 * Product decision: the Starter plan includes 1 seat (the owner). Each
 * ADDITIONAL team member on Starter adds a recurring per-seat charge.
 * Growth and Pro include UNLIMITED seats (no per-seat charge) — the UI
 * reminds Starter owners of this as an upgrade nudge.
 *
 * Mechanic: a SEPARATE Stripe subscription line item (a recurring per-seat
 * Price) whose quantity = the number of extra seats. Stripe handles the
 * recurring charge and mid-cycle proration. We never touch the base-plan
 * item.
 *
 * `syncSeatBilling()` is a RECONCILE (not a delta): it reads the current
 * seat count and sets the seat-item quantity to match. That makes it
 * idempotent and self-healing — if a call site is missed, the next team
 * change corrects it, and upgrading Starter→Growth computes extraSeats=0,
 * which removes the seat item through the same path. Fail-soft throughout:
 * a billing hiccup must never break the invite/accept/remove flows.
 */

import Stripe from 'stripe';
import { db } from '../db';
import { businesses, subscriptionPlans, users, userBusinessAccess } from '@shared/schema';
import { eq } from 'drizzle-orm';

/** Monthly price per EXTRA seat on Starter. Single source of truth. */
export const EXTRA_SEAT_PRICE_USD = 15;

/** Only the Starter plan charges per seat; everyone else is unlimited / N/A. */
export function isSeatChargeablePlan(planTier: string | null | undefined): boolean {
  return planTier === 'starter';
}

/**
 * Seats included in the base plan. Starter → its maxStaff (1). Unlimited
 * tiers (growth/pro/founder) → Infinity. Anything else → its maxStaff or 1.
 */
export function getIncludedSeats(planTier: string | null | undefined, maxStaff: number | null | undefined): number {
  if (planTier === 'growth' || planTier === 'pro' || planTier === 'founder') return Infinity;
  return maxStaff ?? 1;
}

/** Billable extra seats. 0 for non-chargeable plans (unlimited or no plan). */
export function computeExtraSeats(
  planTier: string | null | undefined,
  includedSeats: number,
  usedSeats: number,
): number {
  if (!isSeatChargeablePlan(planTier)) return 0;
  if (!Number.isFinite(includedSeats)) return 0;
  return Math.max(0, usedSeats - includedSeats);
}

/**
 * Authoritative seat count: distinct users who can access this business.
 * The data model is split — staff users carry `businessId` directly while
 * managers/multi-location go through `user_business_access` — so we union
 * both sources and de-dupe (the existing getTeamMembers() undercounts the
 * former; for BILLING we must not).
 */
export async function countTeamSeats(businessId: number): Promise<number> {
  const [direct, access] = await Promise.all([
    db.select({ id: users.id }).from(users).where(eq(users.businessId, businessId)),
    db.select({ id: userBusinessAccess.userId }).from(userBusinessAccess).where(eq(userBusinessAccess.businessId, businessId)),
  ]);
  const ids = new Set<number>();
  for (const r of direct) ids.add(r.id);
  for (const r of access) ids.add(r.id);
  return ids.size;
}

export interface SeatInfo {
  usedSeats: number;
  includedSeats: number | null; // null = unlimited
  unlimited: boolean;
  chargeable: boolean;          // true only on Starter
  perSeatPrice: number;
  extraSeats: number;
  monthlySeatCharge: number;    // extraSeats * perSeatPrice
}

async function loadPlan(businessId: number): Promise<{ planTier: string | null; maxStaff: number | null; business: typeof businesses.$inferSelect | null }> {
  const [business] = await db.select().from(businesses).where(eq(businesses.id, businessId));
  if (!business) return { planTier: null, maxStaff: null, business: null };
  let planTier: string | null = null;
  let maxStaff: number | null = null;
  if (business.stripePlanId) {
    const [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, business.stripePlanId));
    planTier = plan?.planTier ?? null;
    maxStaff = plan?.maxStaff ?? null;
  }
  return { planTier, maxStaff, business };
}

/** Read-only seat summary for the UI / disclosure. No Stripe calls. */
export async function getSeatInfo(businessId: number): Promise<SeatInfo> {
  const { planTier, maxStaff } = await loadPlan(businessId);
  const usedSeats = await countTeamSeats(businessId);
  const includedSeats = getIncludedSeats(planTier, maxStaff);
  const chargeable = isSeatChargeablePlan(planTier);
  const extraSeats = computeExtraSeats(planTier, includedSeats, usedSeats);
  return {
    usedSeats,
    includedSeats: Number.isFinite(includedSeats) ? includedSeats : null,
    unlimited: !Number.isFinite(includedSeats),
    chargeable,
    perSeatPrice: EXTRA_SEAT_PRICE_USD,
    extraSeats,
    monthlySeatCharge: extraSeats * EXTRA_SEAT_PRICE_USD,
  };
}

// ── Stripe plumbing ──

let _stripe: Stripe | null = null;
function getStripe(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY is not set');
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2025-03-31.basil' });
  }
  return _stripe;
}

let _cachedSeatPriceId: string | null = null;

/**
 * The platform-level recurring per-seat Stripe Price. Prefers
 * STRIPE_SEAT_PRICE_ID; otherwise creates one on first use, caches it
 * in-process, and logs the id so the operator can pin it via env.
 */
export async function getOrCreateSeatPrice(): Promise<string> {
  if (process.env.STRIPE_SEAT_PRICE_ID) return process.env.STRIPE_SEAT_PRICE_ID;
  if (_cachedSeatPriceId) return _cachedSeatPriceId;
  const stripe = getStripe();
  const product = await stripe.products.create({
    name: 'Additional Team Seat',
    metadata: { kind: 'extra_seat' },
  });
  const price = await stripe.prices.create({
    unit_amount: EXTRA_SEAT_PRICE_USD * 100,
    currency: 'usd',
    recurring: { interval: 'month' },
    product: product.id,
    metadata: { kind: 'extra_seat' },
  });
  _cachedSeatPriceId = price.id;
  console.warn(`[SeatBilling] Created per-seat price ${price.id}. Pin it with STRIPE_SEAT_PRICE_ID=${price.id}`);
  return price.id;
}

/** Test helper. */
export function _resetSeatPriceCache(): void {
  _cachedSeatPriceId = null;
}

export type SeatSyncResult =
  | { ok: true; action: 'created' | 'updated' | 'cleared' | 'noop' | 'no_active_subscription'; extraSeats: number }
  | { ok: false; reason: 'business_not_found' | 'error' };

/**
 * Reconcile the Stripe seat-item quantity to the current extra-seat count.
 * Idempotent, fail-soft, never touches the base-plan item. Call after a team
 * member is added (invite accepted) or removed.
 */
export async function syncSeatBilling(businessId: number): Promise<SeatSyncResult> {
  try {
    const { planTier, maxStaff, business } = await loadPlan(businessId);
    if (!business) return { ok: false, reason: 'business_not_found' };

    const usedSeats = await countTeamSeats(businessId);
    const includedSeats = getIncludedSeats(planTier, maxStaff);
    const extraSeats = computeExtraSeats(planTier, includedSeats, usedSeats); // 0 for non-Starter

    const status = business.subscriptionStatus;
    if (!business.stripeSubscriptionId || !(status === 'active' || status === 'trialing')) {
      return { ok: true, action: 'no_active_subscription', extraSeats };
    }

    const stripe = getStripe();
    const sub = await stripe.subscriptions.retrieve(business.stripeSubscriptionId);
    const seatPriceId = await getOrCreateSeatPrice();
    const existing = sub.items.data.find((it) => it.price?.id === seatPriceId);

    if (extraSeats <= 0) {
      if (existing) {
        await stripe.subscriptionItems.del(existing.id, { proration_behavior: 'create_prorations' });
        return { ok: true, action: 'cleared', extraSeats: 0 };
      }
      return { ok: true, action: 'noop', extraSeats: 0 };
    }

    if (existing) {
      if (existing.quantity !== extraSeats) {
        await stripe.subscriptionItems.update(existing.id, { quantity: extraSeats, proration_behavior: 'create_prorations' });
        return { ok: true, action: 'updated', extraSeats };
      }
      return { ok: true, action: 'noop', extraSeats };
    }

    await stripe.subscriptionItems.create({
      subscription: sub.id,
      price: seatPriceId,
      quantity: extraSeats,
      proration_behavior: 'create_prorations',
    });
    return { ok: true, action: 'created', extraSeats };
  } catch (err: any) {
    console.error(`[SeatBilling] sync failed for business ${businessId}:`, err?.message || err);
    return { ok: false, reason: 'error' };
  }
}
