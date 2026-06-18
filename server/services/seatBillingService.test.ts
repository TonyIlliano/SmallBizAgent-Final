/**
 * seatBillingService tests — per-seat billing on Starter.
 *
 * Contracts:
 *  - Only Starter charges; Growth/Pro/founder = unlimited (extraSeats always 0).
 *  - Seat count unions users.businessId + user_business_access (the existing
 *    getTeamMembers undercounts; billing must not).
 *  - syncSeatBilling is an idempotent reconcile: sets the seat-item quantity
 *    to match extra seats, creates/updates/clears as needed, never touches
 *    the base item, fail-soft.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { stripeMock, dbState } = vi.hoisted(() => {
  const stripeMock = {
    subscriptions: { retrieve: vi.fn() },
    subscriptionItems: { create: vi.fn(), update: vi.fn(), del: vi.fn() },
    products: { create: vi.fn() },
    prices: { create: vi.fn() },
  };
  const dbState = { rows: new Map<any, any[]>() };
  return { stripeMock, dbState };
});

vi.mock('stripe', () => ({
  default: class MockStripe {
    subscriptions = stripeMock.subscriptions;
    subscriptionItems = stripeMock.subscriptionItems;
    products = stripeMock.products;
    prices = stripeMock.prices;
  },
}));

vi.mock('../db', () => ({
  db: {
    select: (_proj?: any) => ({
      from: (table: any) => ({
        where: async (_cond: any) => dbState.rows.get(table) ?? [],
      }),
    }),
  },
}));

import {
  isSeatChargeablePlan,
  getIncludedSeats,
  computeExtraSeats,
  getSeatInfo,
  syncSeatBilling,
  getOrCreateSeatPrice,
  _resetSeatPriceCache,
  EXTRA_SEAT_PRICE_USD,
} from './seatBillingService';
import { businesses, subscriptionPlans, users, userBusinessAccess } from '@shared/schema';

function setBusiness(b: Record<string, any>) { dbState.rows.set(businesses, [b]); }
function setPlan(p: Record<string, any> | null) { dbState.rows.set(subscriptionPlans, p ? [p] : []); }
function setSeatUsers(directCount: number, accessUserIds: number[] = []) {
  dbState.rows.set(users, Array.from({ length: directCount }, (_, i) => ({ id: i + 1 })));
  dbState.rows.set(userBusinessAccess, accessUserIds.map((id) => ({ id })));
}

beforeEach(() => {
  dbState.rows.clear();
  stripeMock.subscriptions.retrieve.mockReset();
  stripeMock.subscriptionItems.create.mockReset();
  stripeMock.subscriptionItems.update.mockReset();
  stripeMock.subscriptionItems.del.mockReset();
  stripeMock.products.create.mockReset();
  stripeMock.prices.create.mockReset();
  _resetSeatPriceCache();
  process.env.STRIPE_SECRET_KEY = 'sk_test_x';
  process.env.STRIPE_SEAT_PRICE_ID = 'price_seat_test';
});

describe('pure helpers', () => {
  it('only Starter is chargeable', () => {
    expect(isSeatChargeablePlan('starter')).toBe(true);
    expect(isSeatChargeablePlan('growth')).toBe(false);
    expect(isSeatChargeablePlan('pro')).toBe(false);
    expect(isSeatChargeablePlan(null)).toBe(false);
  });

  it('getIncludedSeats: Starter→maxStaff, Growth/Pro/founder→unlimited', () => {
    expect(getIncludedSeats('starter', 1)).toBe(1);
    expect(getIncludedSeats('growth', 5)).toBe(Infinity);
    expect(getIncludedSeats('pro', 15)).toBe(Infinity);
    expect(getIncludedSeats('founder', null)).toBe(Infinity);
    expect(getIncludedSeats('starter', null)).toBe(1); // default 1
  });

  it('computeExtraSeats: 0 for non-Starter and unlimited; positive only over Starter limit', () => {
    expect(computeExtraSeats('growth', Infinity, 9)).toBe(0);
    expect(computeExtraSeats('starter', 1, 1)).toBe(0); // owner only
    expect(computeExtraSeats('starter', 1, 4)).toBe(3); // 3 extra
    expect(computeExtraSeats('starter', 1, 0)).toBe(0); // never negative
  });
});

describe('getSeatInfo', () => {
  it('Starter with 3 people → 2 extra at the per-seat price', async () => {
    setBusiness({ id: 7, stripePlanId: 100 });
    setPlan({ id: 100, planTier: 'starter', maxStaff: 1 });
    setSeatUsers(3); // owner + 2 staff with businessId set
    const info = await getSeatInfo(7);
    expect(info).toMatchObject({
      usedSeats: 3, includedSeats: 1, unlimited: false, chargeable: true,
      perSeatPrice: EXTRA_SEAT_PRICE_USD, extraSeats: 2, monthlySeatCharge: 2 * EXTRA_SEAT_PRICE_USD,
    });
  });

  it('Growth → unlimited, never chargeable, extraSeats 0', async () => {
    setBusiness({ id: 7, stripePlanId: 200 });
    setPlan({ id: 200, planTier: 'growth', maxStaff: 5 });
    setSeatUsers(8);
    const info = await getSeatInfo(7);
    expect(info).toMatchObject({ unlimited: true, includedSeats: null, chargeable: false, extraSeats: 0, monthlySeatCharge: 0 });
  });

  it('unions direct users and user_business_access, de-duping', async () => {
    setBusiness({ id: 7, stripePlanId: 100 });
    setPlan({ id: 100, planTier: 'starter', maxStaff: 1 });
    // 2 direct users (ids 1,2) + access rows for ids 2,3 → distinct {1,2,3} = 3
    setSeatUsers(2, [2, 3]);
    const info = await getSeatInfo(7);
    expect(info.usedSeats).toBe(3);
    expect(info.extraSeats).toBe(2);
  });
});

describe('syncSeatBilling', () => {
  const activeStarter = { id: 7, stripePlanId: 100, stripeSubscriptionId: 'sub_1', subscriptionStatus: 'active' };

  it('business not found → ok:false', async () => {
    dbState.rows.set(businesses, []);
    expect(await syncSeatBilling(7)).toEqual({ ok: false, reason: 'business_not_found' });
  });

  it('Starter with no active subscription → no_active_subscription (no Stripe calls)', async () => {
    setBusiness({ ...activeStarter, stripeSubscriptionId: null });
    setPlan({ id: 100, planTier: 'starter', maxStaff: 1 });
    setSeatUsers(3);
    const r = await syncSeatBilling(7);
    expect(r).toMatchObject({ ok: true, action: 'no_active_subscription', extraSeats: 2 });
    expect(stripeMock.subscriptions.retrieve).not.toHaveBeenCalled();
  });

  it('Starter, 2 extra seats, no existing item → creates the seat item with quantity 2', async () => {
    setBusiness(activeStarter);
    setPlan({ id: 100, planTier: 'starter', maxStaff: 1 });
    setSeatUsers(3);
    stripeMock.subscriptions.retrieve.mockResolvedValue({ id: 'sub_1', items: { data: [{ id: 'si_base', price: { id: 'price_base' } }] } });
    const r = await syncSeatBilling(7);
    expect(r).toMatchObject({ ok: true, action: 'created', extraSeats: 2 });
    expect(stripeMock.subscriptionItems.create).toHaveBeenCalledWith(
      expect.objectContaining({ subscription: 'sub_1', price: 'price_seat_test', quantity: 2 }),
    );
  });

  it('updates quantity when the existing seat item count changed', async () => {
    setBusiness(activeStarter);
    setPlan({ id: 100, planTier: 'starter', maxStaff: 1 });
    setSeatUsers(4); // 3 extra now
    stripeMock.subscriptions.retrieve.mockResolvedValue({
      id: 'sub_1',
      items: { data: [
        { id: 'si_base', price: { id: 'price_base' } },
        { id: 'si_seat', price: { id: 'price_seat_test' }, quantity: 1 },
      ] },
    });
    const r = await syncSeatBilling(7);
    expect(r).toMatchObject({ ok: true, action: 'updated', extraSeats: 3 });
    expect(stripeMock.subscriptionItems.update).toHaveBeenCalledWith('si_seat', expect.objectContaining({ quantity: 3 }));
  });

  it('no-op when the existing quantity already matches', async () => {
    setBusiness(activeStarter);
    setPlan({ id: 100, planTier: 'starter', maxStaff: 1 });
    setSeatUsers(3); // 2 extra
    stripeMock.subscriptions.retrieve.mockResolvedValue({
      id: 'sub_1',
      items: { data: [{ id: 'si_seat', price: { id: 'price_seat_test' }, quantity: 2 }] },
    });
    const r = await syncSeatBilling(7);
    expect(r).toMatchObject({ ok: true, action: 'noop', extraSeats: 2 });
    expect(stripeMock.subscriptionItems.update).not.toHaveBeenCalled();
  });

  it('clears the seat item when upgrading to Growth (extraSeats becomes 0)', async () => {
    setBusiness({ ...activeStarter, stripePlanId: 200 });
    setPlan({ id: 200, planTier: 'growth', maxStaff: 5 });
    setSeatUsers(4);
    stripeMock.subscriptions.retrieve.mockResolvedValue({
      id: 'sub_1',
      items: { data: [{ id: 'si_seat', price: { id: 'price_seat_test' }, quantity: 3 }] },
    });
    const r = await syncSeatBilling(7);
    expect(r).toMatchObject({ ok: true, action: 'cleared', extraSeats: 0 });
    expect(stripeMock.subscriptionItems.del).toHaveBeenCalledWith('si_seat', expect.anything());
  });

  it('fail-soft: a Stripe error returns ok:false reason:error', async () => {
    setBusiness(activeStarter);
    setPlan({ id: 100, planTier: 'starter', maxStaff: 1 });
    setSeatUsers(3);
    stripeMock.subscriptions.retrieve.mockRejectedValue(new Error('stripe down'));
    expect(await syncSeatBilling(7)).toEqual({ ok: false, reason: 'error' });
  });
});

describe('getOrCreateSeatPrice', () => {
  it('returns the pinned env price without creating anything', async () => {
    process.env.STRIPE_SEAT_PRICE_ID = 'price_pinned';
    expect(await getOrCreateSeatPrice()).toBe('price_pinned');
    expect(stripeMock.prices.create).not.toHaveBeenCalled();
  });

  it('creates + caches a price when none is pinned', async () => {
    delete process.env.STRIPE_SEAT_PRICE_ID;
    _resetSeatPriceCache();
    stripeMock.products.create.mockResolvedValue({ id: 'prod_x' });
    stripeMock.prices.create.mockResolvedValue({ id: 'price_created' });
    expect(await getOrCreateSeatPrice()).toBe('price_created');
    expect(stripeMock.prices.create).toHaveBeenCalledWith(
      expect.objectContaining({ unit_amount: EXTRA_SEAT_PRICE_USD * 100, recurring: { interval: 'month' } }),
    );
    // cached — second call doesn't re-create
    await getOrCreateSeatPrice();
    expect(stripeMock.prices.create).toHaveBeenCalledTimes(1);
  });
});
