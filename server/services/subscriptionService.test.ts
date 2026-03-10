import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock the db module (Drizzle ORM) ──────────────────────────────────────
// Replicate the chainable query-builder API that Drizzle exposes.
const {
  mockWhere, mockLimit, mockSet, mockSelectChain, mockUpdateChain, mockSelect, mockUpdate,
  mockStripeSubscriptionsUpdate, mockStripeSubscriptionsRetrieve,
  mockStripeBillingPortalSessionsCreate, mockStripeProductsList,
  mockStripePricesList, mockStripePricesCreate,
} = vi.hoisted(() => {
  // Set env before any module loads
  process.env.STRIPE_SECRET_KEY = 'sk_test_fake_key_for_unit_tests';
  const mockWhere = vi.fn();
  const mockLimit = vi.fn();
  const mockSet = vi.fn();

  const mockSelectChain = {
    from: vi.fn().mockReturnThis(),
    where: mockWhere,
  };
  mockWhere.mockReturnValue({ limit: mockLimit });

  const mockUpdateChain = { set: mockSet };
  mockSet.mockReturnValue({ where: vi.fn() });

  const mockSelect = vi.fn().mockReturnValue(mockSelectChain);
  const mockUpdate = vi.fn().mockReturnValue(mockUpdateChain);

  const mockStripeSubscriptionsUpdate = vi.fn();
  const mockStripeSubscriptionsRetrieve = vi.fn();
  const mockStripeBillingPortalSessionsCreate = vi.fn();
  const mockStripeProductsList = vi.fn();
  const mockStripePricesList = vi.fn();
  const mockStripePricesCreate = vi.fn();

  return {
    mockWhere, mockLimit, mockSet, mockSelectChain, mockUpdateChain, mockSelect, mockUpdate,
    mockStripeSubscriptionsUpdate, mockStripeSubscriptionsRetrieve,
    mockStripeBillingPortalSessionsCreate, mockStripeProductsList,
    mockStripePricesList, mockStripePricesCreate,
  };
});

vi.mock('../db', () => ({
  db: {
    select: mockSelect,
    update: mockUpdate,
  },
  pool: { query: vi.fn(), connect: vi.fn() },
}));

// ── Mock Stripe ───────────────────────────────────────────────────────────
vi.mock('stripe', () => {
  function StripeMock() {
    return {
      subscriptions: {
        update: mockStripeSubscriptionsUpdate,
        retrieve: mockStripeSubscriptionsRetrieve,
      },
      billingPortal: {
        sessions: {
          create: mockStripeBillingPortalSessionsCreate,
        },
      },
      products: {
        list: mockStripeProductsList,
      },
      prices: {
        list: mockStripePricesList,
        create: mockStripePricesCreate,
      },
    };
  }
  return { default: StripeMock };
});

// ── Mock emailService ─────────────────────────────────────────────────────
vi.mock('../emailService', () => ({
  sendPaymentFailedEmail: vi.fn(),
}));

// ── Set required env before importing the service ─────────────────────────
process.env.STRIPE_SECRET_KEY = 'sk_test_fake_key_for_unit_tests';

import { SubscriptionService } from './subscriptionService';

// ── Test suite ────────────────────────────────────────────────────────────
describe('SubscriptionService', () => {
  let service: SubscriptionService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SubscriptionService();
  });

  // ─── getPlans() ───────────────────────────────────────────────────────
  describe('getPlans()', () => {
    it('returns an array of active subscription plans', async () => {
      const fakePlans = [
        { id: 1, name: 'Starter', price: 29, interval: 'monthly', active: true },
        { id: 2, name: 'Professional', price: 79, interval: 'monthly', active: true },
      ];

      // db.select().from(subscriptionPlans).where(...) returns the plans array directly
      mockSelectChain.from.mockReturnValueOnce({
        where: vi.fn().mockResolvedValueOnce(fakePlans),
      });

      const plans = await service.getPlans();

      expect(Array.isArray(plans)).toBe(true);
      expect(plans).toHaveLength(2);
      expect(plans[0].name).toBe('Starter');
      expect(plans[1].name).toBe('Professional');
    });

    it('throws when the database query fails', async () => {
      mockSelectChain.from.mockReturnValueOnce({
        where: vi.fn().mockRejectedValueOnce(new Error('connection lost')),
      });

      await expect(service.getPlans()).rejects.toThrow('Failed to retrieve subscription plans');
    });
  });

  // ─── getSubscriptionStatus() ──────────────────────────────────────────
  describe('getSubscriptionStatus()', () => {
    it('returns status "none" when business has no stripeSubscriptionId', async () => {
      const businessRecord = {
        id: 1,
        name: 'Test Biz',
        stripeSubscriptionId: null,
        trialEndsAt: null,
      };

      mockLimit.mockResolvedValueOnce([businessRecord]);

      const result = await service.getSubscriptionStatus(1);

      expect(result.status).toBe('none');
      expect(result.message).toBe('No active subscription');
      expect(result.isTrialActive).toBe(false);
    });

    it('returns isTrialActive = true when trial has not expired', async () => {
      const futureDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days ahead
      const businessRecord = {
        id: 2,
        name: 'Trial Biz',
        stripeSubscriptionId: null,
        trialEndsAt: futureDate,
      };

      mockLimit.mockResolvedValueOnce([businessRecord]);

      const result = await service.getSubscriptionStatus(2);

      expect(result.status).toBe('none');
      expect(result.isTrialActive).toBe(true);
      expect(result.trialEndsAt).toEqual(futureDate);
    });

    it('throws when business is not found', async () => {
      mockLimit.mockResolvedValueOnce([]);

      await expect(service.getSubscriptionStatus(999)).rejects.toThrow(
        'Failed to retrieve subscription status',
      );
    });

    it('fetches live subscription data from Stripe when subscription exists', async () => {
      const businessRecord = {
        id: 3,
        name: 'Subscribed Biz',
        stripeSubscriptionId: 'sub_test123',
        stripePlanId: 1,
        trialEndsAt: null,
      };

      mockLimit
        .mockResolvedValueOnce([businessRecord]) // business lookup
        .mockResolvedValueOnce([{ id: 1, name: 'Pro Plan' }]); // plan lookup

      mockStripeSubscriptionsRetrieve.mockResolvedValueOnce({
        status: 'active',
        current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
        cancel_at_period_end: false,
      });

      const result = await service.getSubscriptionStatus(3);

      expect(result.status).toBe('active');
      expect(result.isActive).toBe(true);
      expect(result.cancelAtPeriodEnd).toBe(false);
      expect(result.plan).toEqual({ id: 1, name: 'Pro Plan' });
    });
  });

  // ─── cancelSubscription() ─────────────────────────────────────────────
  describe('cancelSubscription()', () => {
    it('sets cancel_at_period_end on the Stripe subscription', async () => {
      const businessRecord = {
        id: 10,
        name: 'Cancel Biz',
        stripeSubscriptionId: 'sub_cancel_test',
      };

      mockLimit.mockResolvedValueOnce([businessRecord]);

      const periodEndTimestamp = Math.floor(Date.now() / 1000) + 15 * 86400;
      mockStripeSubscriptionsUpdate.mockResolvedValueOnce({
        cancel_at_period_end: true,
        current_period_end: periodEndTimestamp,
      });

      // db.update chain
      mockSet.mockReturnValueOnce({ where: vi.fn().mockResolvedValueOnce(undefined) });

      const result = await service.cancelSubscription(10);

      expect(mockStripeSubscriptionsUpdate).toHaveBeenCalledWith('sub_cancel_test', {
        cancel_at_period_end: true,
      });
      expect(result.status).toBe('canceling');
      expect(result.message).toContain('canceled at the end of the current billing period');
      expect(result.periodEnd).toBeInstanceOf(Date);
    });

    it('throws when there is no active subscription', async () => {
      const businessRecord = {
        id: 11,
        name: 'No Sub Biz',
        stripeSubscriptionId: null,
      };

      mockLimit.mockResolvedValueOnce([businessRecord]);

      await expect(service.cancelSubscription(11)).rejects.toThrow(
        'Failed to cancel subscription',
      );
    });

    it('throws when business is not found', async () => {
      mockLimit.mockResolvedValueOnce([]);

      await expect(service.cancelSubscription(999)).rejects.toThrow(
        'Failed to cancel subscription',
      );
    });
  });

  // ─── changePlan() ─────────────────────────────────────────────────────
  describe('changePlan()', () => {
    it('creates a prorated update via Stripe', async () => {
      const businessRecord = {
        id: 20,
        name: 'Upgrade Biz',
        stripeSubscriptionId: 'sub_upgrade_test',
        stripePlanId: 1,
      };

      const newPlan = {
        id: 2,
        name: 'Business',
        price: 149,
        interval: 'monthly',
      };

      // First db.select for business lookup (getPlans uses from().where(), changePlan uses from().where().limit())
      // changePlan: const [business] = await db.select().from(businesses).where(...)
      mockSelectChain.from.mockReturnValueOnce({
        where: vi.fn().mockResolvedValueOnce([businessRecord]),
      });

      // Second db.select for plan lookup
      mockSelectChain.from.mockReturnValueOnce({
        where: vi.fn().mockResolvedValueOnce([newPlan]),
      });

      // Stripe retrieve subscription
      mockStripeSubscriptionsRetrieve.mockResolvedValueOnce({
        items: { data: [{ id: 'si_existing_item' }] },
      });

      // Stripe products.list
      mockStripeProductsList.mockResolvedValueOnce({
        data: [{ id: 'prod_existing' }],
      });

      // Stripe prices.list — return a matching price
      mockStripePricesList.mockResolvedValueOnce({
        data: [
          {
            id: 'price_matching',
            unit_amount: 14900,
            recurring: { interval: 'month' },
          },
        ],
      });

      // Stripe subscriptions.update for the plan change
      const updatedPeriodEnd = Math.floor(Date.now() / 1000) + 30 * 86400;
      mockStripeSubscriptionsUpdate.mockResolvedValueOnce({
        status: 'active',
        current_period_end: updatedPeriodEnd,
      });

      // db.update chain
      mockUpdate.mockReturnValueOnce({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });

      const result = await service.changePlan(20, 2);

      expect(result.status).toBe('active');
      expect(result.plan).toEqual(newPlan);
      expect(result.message).toContain('Switched to Business');
      expect(result.message).toContain('Prorated');
      expect(mockStripeSubscriptionsUpdate).toHaveBeenCalledWith(
        'sub_upgrade_test',
        expect.objectContaining({
          proration_behavior: 'create_prorations',
          items: [{ id: 'si_existing_item', price: 'price_matching' }],
        }),
      );
    });

    it('throws when business has no active subscription', async () => {
      mockSelectChain.from.mockReturnValueOnce({
        where: vi.fn().mockResolvedValueOnce([{ id: 20, stripeSubscriptionId: null }]),
      });

      await expect(service.changePlan(20, 2)).rejects.toThrow('No active subscription found');
    });

    it('throws when the target plan does not exist', async () => {
      mockSelectChain.from
        .mockReturnValueOnce({
          where: vi.fn().mockResolvedValueOnce([{ id: 20, stripeSubscriptionId: 'sub_x' }]),
        })
        .mockReturnValueOnce({
          where: vi.fn().mockResolvedValueOnce([]), // empty plan result
        });

      await expect(service.changePlan(20, 999)).rejects.toThrow('Plan not found');
    });
  });

  // ─── createBillingPortalSession() ─────────────────────────────────────
  describe('createBillingPortalSession()', () => {
    it('returns a portal URL when customer exists', async () => {
      const businessRecord = {
        id: 30,
        name: 'Portal Biz',
        stripeCustomerId: 'cus_test_portal',
        stripeSubscriptionId: 'sub_portal',
      };

      mockSelectChain.from.mockReturnValueOnce({
        where: vi.fn().mockResolvedValueOnce([businessRecord]),
      });

      mockStripeBillingPortalSessionsCreate.mockResolvedValueOnce({
        url: 'https://billing.stripe.com/session/test_session_id',
      });

      const result = await service.createBillingPortalSession(30, 'https://app.example.com/settings');

      expect(result.url).toBe('https://billing.stripe.com/session/test_session_id');
      expect(mockStripeBillingPortalSessionsCreate).toHaveBeenCalledWith({
        customer: 'cus_test_portal',
        return_url: 'https://app.example.com/settings',
      });
    });

    it('throws when business has no Stripe customer', async () => {
      mockSelectChain.from.mockReturnValueOnce({
        where: vi.fn().mockResolvedValueOnce([{ id: 31, stripeCustomerId: null }]),
      });

      await expect(
        service.createBillingPortalSession(31, 'https://app.example.com'),
      ).rejects.toThrow('No Stripe customer found');
    });

    it('throws when business does not exist', async () => {
      mockSelectChain.from.mockReturnValueOnce({
        where: vi.fn().mockResolvedValueOnce([]),
      });

      await expect(
        service.createBillingPortalSession(999, 'https://app.example.com'),
      ).rejects.toThrow('Business not found');
    });
  });
});
