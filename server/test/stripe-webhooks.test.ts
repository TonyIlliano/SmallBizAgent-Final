/**
 * Stripe Webhook Integration Tests
 *
 * Tests the SubscriptionService.handleWebhookEvent() method directly
 * with mock Stripe events. Mocks only the database (drizzle db),
 * external services (Stripe API, email, provisioning) -- NOT the
 * subscription service itself.
 *
 * Verifies correct business state transitions, email notifications,
 * provisioning triggers, and error handling for all webhook event types.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type Stripe from 'stripe';

// ────────────────────────────────────────────────────────
// Module mocks -- declared before imports via vi.hoisted
// ────────────────────────────────────────────────────────

const {
  mockDbUpdate,
  mockDbSet,
  mockDbWhere,
  mockDbSelect,
  mockDbFrom,
  mockDbLimit,
  mockStripeSubscriptionsRetrieve,
  mockSendPaymentFailedEmail,
  mockSendEmail,
  mockProvisionBusiness,
  mockDeprovisionBusiness,
  mockSendSms,
  mockSendAdminAlert,
} = vi.hoisted(() => {
  return {
    mockDbUpdate: vi.fn(),
    mockDbSet: vi.fn(),
    mockDbWhere: vi.fn(),
    mockDbSelect: vi.fn(),
    mockDbFrom: vi.fn(),
    mockDbLimit: vi.fn().mockResolvedValue([]),
    mockStripeSubscriptionsRetrieve: vi.fn(),
    mockSendPaymentFailedEmail: vi.fn().mockResolvedValue(undefined),
    mockSendEmail: vi.fn().mockResolvedValue({ messageId: 'test-id' }),
    mockProvisionBusiness: vi.fn().mockResolvedValue({ success: true }),
    mockDeprovisionBusiness: vi.fn().mockResolvedValue(undefined),
    mockSendSms: vi.fn().mockResolvedValue(undefined),
    mockSendAdminAlert: vi.fn().mockResolvedValue(undefined),
  };
});

// DB mock with chainable API
vi.mock('../db', () => {
  const makeSetChain = () => ({
    set: (...sArgs: any[]) => {
      mockDbSet(...sArgs);
      return { where: vi.fn().mockResolvedValue([]) };
    },
  });

  return {
    db: {
      select: (...args: any[]) => {
        mockDbSelect(...args);
        return {
          from: (...fArgs: any[]) => {
            mockDbFrom(...fArgs);
            return {
              where: (...wArgs: any[]) => {
                // Return the where mock value directly for queries without .limit()
                // (e.g., handleInvoicePaymentSucceeded destructures [business] from where())
                const whereResult = mockDbWhere(...wArgs);
                return {
                  limit: (...lArgs: any[]) => mockDbLimit(...lArgs),
                  // Also make the where result thenable so it can be awaited directly
                  then: whereResult?.then?.bind(whereResult),
                };
              },
            };
          },
        };
      },
      update: (...args: any[]) => {
        mockDbUpdate(...args);
        return makeSetChain();
      },
    },
    pool: {
      connect: vi.fn().mockResolvedValue({ query: vi.fn(), release: vi.fn() }),
      query: vi.fn().mockResolvedValue({ rows: [] }),
      end: vi.fn(),
    },
  };
});

// Stripe mock -- must be a constructor (class-like)
vi.mock('stripe', () => {
  const StripeMock = function (this: any) {
    this.subscriptions = {
      retrieve: mockStripeSubscriptionsRetrieve,
    };
  } as any;
  return { default: StripeMock };
});

// Email service
vi.mock('../emailService', () => ({
  sendPaymentFailedEmail: (...args: any[]) => mockSendPaymentFailedEmail(...args),
  sendEmail: (...args: any[]) => mockSendEmail(...args),
}));

// Business provisioning service (both relative paths the code uses)
vi.mock('../services/businessProvisioningService', () => ({
  provisionBusiness: (...args: any[]) => mockProvisionBusiness(...args),
  deprovisionBusiness: (...args: any[]) => mockDeprovisionBusiness(...args),
}));
// Also mock the .js extension variant used by dynamic imports
vi.mock('../services/businessProvisioningService.js', () => ({
  provisionBusiness: (...args: any[]) => mockProvisionBusiness(...args),
  deprovisionBusiness: (...args: any[]) => mockDeprovisionBusiness(...args),
}));

// Twilio service (SMS for dunning)
vi.mock('../services/twilioService', () => ({
  sendSms: (...args: any[]) => mockSendSms(...args),
  default: { sendSms: (...args: any[]) => mockSendSms(...args) },
}));
vi.mock('../services/twilioService.js', () => ({
  sendSms: (...args: any[]) => mockSendSms(...args),
  default: { sendSms: (...args: any[]) => mockSendSms(...args) },
}));

// Admin alert service
vi.mock('../services/adminAlertService', () => ({
  sendAdminAlert: (...args: any[]) => mockSendAdminAlert(...args),
}));

// Email service .js variant (used by dynamic import in handleInvoicePaymentSucceeded)
vi.mock('../emailService.js', () => ({
  sendPaymentFailedEmail: (...args: any[]) => mockSendPaymentFailedEmail(...args),
  sendEmail: (...args: any[]) => mockSendEmail(...args),
}));

// Money utility
vi.mock('../utils/money', () => ({
  toMoney: (val: any) => {
    if (val == null) return 0;
    const n = typeof val === 'string' ? parseFloat(val) : val;
    return Number.isFinite(n) ? n : 0;
  },
}));

// ────────────────────────────────────────────────────────
// Imports (after mocks)
// ────────────────────────────────────────────────────────

import { SubscriptionService } from '../services/subscriptionService';

// ────────────────────────────────────────────────────────
// Test helpers
// ────────────────────────────────────────────────────────

// Set STRIPE_SECRET_KEY so getStripe() doesn't throw
process.env.STRIPE_SECRET_KEY = 'sk_test_fake_key_for_testing';

function buildStripeEvent(type: string, dataObject: Record<string, any>): Stripe.Event {
  return {
    id: `evt_test_${Date.now()}`,
    object: 'event',
    api_version: '2025-03-31.basil',
    created: Math.floor(Date.now() / 1000),
    type,
    data: {
      object: dataObject as any,
      previous_attributes: undefined,
    },
    livemode: false,
    pending_webhooks: 0,
    request: null,
  } as unknown as Stripe.Event;
}

function buildInvoice(overrides: Record<string, any> = {}): Record<string, any> {
  return {
    id: 'in_test_123',
    object: 'invoice',
    customer: 'cus_test_123',
    subscription: 'sub_test_123',
    status: 'paid',
    amount_paid: 14900,
    billing_reason: 'subscription_cycle',
    attempt_count: 1,
    metadata: {},
    ...overrides,
  };
}

function buildSubscription(overrides: Record<string, any> = {}): Record<string, any> {
  return {
    id: 'sub_test_123',
    object: 'subscription',
    customer: 'cus_test_123',
    status: 'active',
    current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
    cancel_at_period_end: false,
    items: {
      data: [{ id: 'si_test_123', price: { id: 'price_test_123' } }],
    },
    discounts: [],
    ...overrides,
  };
}

function buildBusiness(overrides: Record<string, any> = {}) {
  return {
    id: 1,
    name: 'Test Business',
    email: 'owner@test.com',
    phone: '+15551234567',
    ownerPhone: '+15559876543',
    stripeSubscriptionId: 'sub_test_123',
    stripeCustomerId: 'cus_test_123',
    stripePlanId: 1,
    subscriptionStatus: 'active',
    twilioPhoneNumber: '+15550001111',
    twilioPhoneNumberSid: 'PN_test_123',
    receptionistEnabled: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

let service: SubscriptionService;

beforeEach(() => {
  vi.clearAllMocks();
  service = new SubscriptionService();

  // Default mock values
  mockDbLimit.mockResolvedValue([]);
  mockDbWhere.mockResolvedValue([]);
  mockStripeSubscriptionsRetrieve.mockResolvedValue(buildSubscription());
});

// ════════════════════════════════════════════════════════
// TEST SUITES
// ════════════════════════════════════════════════════════

describe('SubscriptionService.handleWebhookEvent()', () => {

  // ──────────────────────────────────────────────
  // 1. invoice.payment_succeeded (subscription_cycle)
  // ──────────────────────────────────────────────
  describe('invoice.payment_succeeded -- subscription cycle', () => {
    it('updates business subscription status to active', async () => {
      const business = buildBusiness({ subscriptionStatus: 'active' });

      // updateSubscriptionStatus: where() -> limit(1)
      mockDbLimit.mockResolvedValueOnce([business]);
      // First where() consumed by updateSubscriptionStatus (not awaited), second by handleInvoicePaymentSucceeded
      mockDbWhere
        .mockResolvedValueOnce([]) // consumed by updateSubscriptionStatus
        .mockResolvedValueOnce([business]); // consumed by handleInvoicePaymentSucceeded

      const invoice = buildInvoice({ billing_reason: 'subscription_cycle' });
      const event = buildStripeEvent('invoice.payment_succeeded', invoice);

      const result = await service.handleWebhookEvent(event);

      expect(result).toEqual({ success: true });
      expect(mockStripeSubscriptionsRetrieve).toHaveBeenCalledWith('sub_test_123');
      expect(mockDbUpdate).toHaveBeenCalled();
      expect(mockDbSet).toHaveBeenCalledWith(
        expect.objectContaining({ subscriptionStatus: 'active' }),
      );
    });
  });

  // ──────────────────────────────────────────────
  // 2. invoice.payment_succeeded for grace_period business
  // ──────────────────────────────────────────────
  describe('invoice.payment_succeeded -- grace_period reactivation', () => {
    it('re-enables receptionist for grace_period business without reprovisioning', async () => {
      const business = buildBusiness({
        subscriptionStatus: 'grace_period',
        twilioPhoneNumberSid: 'PN_existing_123',
        receptionistEnabled: false,
      });

      // updateSubscriptionStatus: where() -> limit(1) -> returns [business]
      mockDbLimit.mockResolvedValueOnce([business]);
      // handleInvoicePaymentSucceeded: where() is called (2nd call), returns directly as thenable
      // First where() call is consumed by updateSubscriptionStatus (result unused since .limit() is called)
      // Second where() call needs to resolve to [business]
      mockDbWhere
        .mockResolvedValueOnce([]) // consumed by updateSubscriptionStatus (not awaited)
        .mockResolvedValueOnce([business]); // consumed by handleInvoicePaymentSucceeded

      mockStripeSubscriptionsRetrieve.mockResolvedValue(buildSubscription({ status: 'active' }));

      const invoice = buildInvoice({ billing_reason: 'subscription_cycle' });
      const event = buildStripeEvent('invoice.payment_succeeded', invoice);

      const result = await service.handleWebhookEvent(event);

      expect(result).toEqual({ success: true });
      // Should re-enable AI receptionist
      expect(mockDbSet).toHaveBeenCalledWith(
        expect.objectContaining({ receptionistEnabled: true }),
      );
      // Should NOT trigger full reprovisioning
      expect(mockProvisionBusiness).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────
  // 3. invoice.payment_succeeded for suspended business
  // ──────────────────────────────────────────────
  describe('invoice.payment_succeeded -- suspended reactivation', () => {
    it('triggers full reprovisioning for suspended business without phone', async () => {
      const business = buildBusiness({
        subscriptionStatus: 'suspended',
        twilioPhoneNumberSid: null, // fully deprovisioned
        receptionistEnabled: false,
      });

      // updateSubscriptionStatus: where() -> limit(1)
      mockDbLimit.mockResolvedValueOnce([business]);
      // First where() consumed by updateSubscriptionStatus (not awaited), second by handleInvoicePaymentSucceeded
      mockDbWhere
        .mockResolvedValueOnce([]) // consumed by updateSubscriptionStatus
        .mockResolvedValueOnce([business]); // consumed by handleInvoicePaymentSucceeded

      mockStripeSubscriptionsRetrieve.mockResolvedValue(buildSubscription({ status: 'active' }));

      const invoice = buildInvoice();
      const event = buildStripeEvent('invoice.payment_succeeded', invoice);

      const result = await service.handleWebhookEvent(event);

      expect(result).toEqual({ success: true });
      // Should trigger full provisioning since no phone number SID
      expect(mockProvisionBusiness).toHaveBeenCalledWith(business.id);
    });
  });

  // ──────────────────────────────────────────────
  // 4. invoice.payment_failed -- first attempt
  // ──────────────────────────────────────────────
  describe('invoice.payment_failed -- first attempt', () => {
    it('marks business as payment_failed and sends notification email', async () => {
      const business = buildBusiness({ subscriptionStatus: 'active' });

      // updateSubscriptionStatus: where() -> limit(1)
      mockDbLimit.mockResolvedValueOnce([business]);
      // First where() consumed by updateSubscriptionStatus, second by dunning handler
      mockDbWhere
        .mockResolvedValueOnce([]) // consumed by updateSubscriptionStatus (not awaited)
        .mockResolvedValueOnce([business]); // consumed by handleInvoicePaymentFailedWithDunning

      mockStripeSubscriptionsRetrieve.mockResolvedValue(
        buildSubscription({ status: 'past_due' }),
      );

      const invoice = buildInvoice({ status: 'open', attempt_count: 1 });
      const event = buildStripeEvent('invoice.payment_failed', invoice);

      const result = await service.handleWebhookEvent(event);

      expect(result).toEqual({ success: true });
      // Should send payment failed email
      expect(mockSendPaymentFailedEmail).toHaveBeenCalledWith(
        business.email,
        business.name,
        1,
        expect.any(String),
        expect.any(String),
      );
      // Should send admin alert
      expect(mockSendAdminAlert).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'payment_failed', severity: 'high' }),
      );
      // Should update status to payment_failed (attempt 1 < 3)
      expect(mockDbSet).toHaveBeenCalledWith(
        expect.objectContaining({ subscriptionStatus: 'payment_failed' }),
      );
    });
  });

  // ──────────────────────────────────────────────
  // 5. invoice.payment_failed -- third attempt (escalated)
  // ──────────────────────────────────────────────
  describe('invoice.payment_failed -- third attempt (escalated)', () => {
    it('marks business as past_due and sends escalated dunning email', async () => {
      const business = buildBusiness({
        subscriptionStatus: 'payment_failed',
        ownerPhone: '+15551112222',
      });

      // updateSubscriptionStatus: where() -> limit(1)
      mockDbLimit.mockResolvedValueOnce([business]);
      // First where() consumed by updateSubscriptionStatus, second by dunning handler
      mockDbWhere
        .mockResolvedValueOnce([]) // consumed by updateSubscriptionStatus (not awaited)
        .mockResolvedValueOnce([business]); // consumed by handleInvoicePaymentFailedWithDunning

      mockStripeSubscriptionsRetrieve.mockResolvedValue(
        buildSubscription({ status: 'past_due' }),
      );

      const invoice = buildInvoice({ status: 'open', attempt_count: 3 });
      const event = buildStripeEvent('invoice.payment_failed', invoice);

      const result = await service.handleWebhookEvent(event);

      expect(result).toEqual({ success: true });
      // Should send email with attempt 3
      expect(mockSendPaymentFailedEmail).toHaveBeenCalledWith(
        business.email,
        business.name,
        3,
        null, // no next retry for attempt 3
        expect.any(String),
      );
      // Should send escalated SMS to owner
      expect(mockSendSms).toHaveBeenCalledWith(
        business.ownerPhone,
        expect.stringContaining('failed after 3 attempts'),
      );
      // Should update status to past_due (attempt >= 3)
      expect(mockDbSet).toHaveBeenCalledWith(
        expect.objectContaining({ subscriptionStatus: 'past_due' }),
      );
    });
  });

  // ──────────────────────────────────────────────
  // 6. customer.subscription.deleted
  // ──────────────────────────────────────────────
  describe('customer.subscription.deleted', () => {
    it('marks business as canceled, clears subscription ID, and triggers deprovisioning', async () => {
      const business = buildBusiness({
        subscriptionStatus: 'active',
        twilioPhoneNumberSid: 'PN_active_123',
      });

      // handleSubscriptionCanceled: find business
      mockDbLimit.mockResolvedValueOnce([business]);

      const subscription = buildSubscription({ status: 'canceled' });
      const event = buildStripeEvent('customer.subscription.deleted', subscription);

      const result = await service.handleWebhookEvent(event);

      expect(result).toEqual({ success: true });
      expect(mockDbSet).toHaveBeenCalledWith(
        expect.objectContaining({
          subscriptionStatus: 'canceled',
          stripeSubscriptionId: null,
        }),
      );
      // Should trigger deprovisioning since business has a phone number SID
      expect(mockDeprovisionBusiness).toHaveBeenCalledWith(business.id);
    });

    it('does not deprovision when business has no phone SID', async () => {
      const business = buildBusiness({
        subscriptionStatus: 'active',
        twilioPhoneNumberSid: null, // no phone provisioned
      });

      mockDbLimit.mockResolvedValueOnce([business]);

      const subscription = buildSubscription({ status: 'canceled' });
      const event = buildStripeEvent('customer.subscription.deleted', subscription);

      const result = await service.handleWebhookEvent(event);

      expect(result).toEqual({ success: true });
      expect(mockDbSet).toHaveBeenCalledWith(
        expect.objectContaining({
          subscriptionStatus: 'canceled',
          stripeSubscriptionId: null,
        }),
      );
      // Should NOT deprovision since no phone number SID
      expect(mockDeprovisionBusiness).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────
  // 7. customer.subscription.updated -- to past_due
  // ──────────────────────────────────────────────
  describe('customer.subscription.updated', () => {
    it('updates business subscription status to past_due', async () => {
      const business = buildBusiness({ subscriptionStatus: 'active' });
      mockDbLimit.mockResolvedValueOnce([business]);

      const subscription = buildSubscription({ status: 'past_due' });
      const event = buildStripeEvent('customer.subscription.updated', subscription);

      const result = await service.handleWebhookEvent(event);

      expect(result).toEqual({ success: true });
      expect(mockDbSet).toHaveBeenCalledWith(
        expect.objectContaining({ subscriptionStatus: 'past_due' }),
      );
    });

    it('updates business subscription status to active', async () => {
      const business = buildBusiness({ subscriptionStatus: 'past_due' });
      mockDbLimit.mockResolvedValueOnce([business]);

      const subscription = buildSubscription({ status: 'active' });
      const event = buildStripeEvent('customer.subscription.updated', subscription);

      const result = await service.handleWebhookEvent(event);

      expect(result).toEqual({ success: true });
      expect(mockDbSet).toHaveBeenCalledWith(
        expect.objectContaining({ subscriptionStatus: 'active' }),
      );
    });
  });

  // ──────────────────────────────────────────────
  // 8. Unknown event type
  // ──────────────────────────────────────────────
  describe('Unknown event type', () => {
    it('handles unknown event type gracefully without throwing', async () => {
      const event = buildStripeEvent('charge.refunded', { id: 'ch_test_123' });

      const result = await service.handleWebhookEvent(event);

      expect(result).toEqual({ success: true });
      expect(mockDbUpdate).not.toHaveBeenCalled();
      expect(mockStripeSubscriptionsRetrieve).not.toHaveBeenCalled();
    });

    it('handles checkout.session.completed without throwing', async () => {
      const event = buildStripeEvent('checkout.session.completed', {
        id: 'cs_test_123',
        subscription: 'sub_test_123',
      });

      const result = await service.handleWebhookEvent(event);
      expect(result).toEqual({ success: true });
    });
  });

  // ──────────────────────────────────────────────
  // 9. invoice.payment_succeeded with overage metadata
  // ──────────────────────────────────────────────
  describe('invoice.payment_succeeded -- overage payment', () => {
    it('updates overage charge status to paid', async () => {
      const business = buildBusiness({ subscriptionStatus: 'active' });
      // updateSubscriptionStatus: where() -> limit(1)
      mockDbLimit.mockResolvedValueOnce([business]);
      // First where() consumed by updateSubscriptionStatus, second by handleInvoicePaymentSucceeded
      mockDbWhere
        .mockResolvedValueOnce([]) // consumed by updateSubscriptionStatus
        .mockResolvedValueOnce([business]); // consumed by handleInvoicePaymentSucceeded

      mockStripeSubscriptionsRetrieve.mockResolvedValue(buildSubscription({ status: 'active' }));

      const invoice = buildInvoice({
        id: 'in_overage_123',
        metadata: { type: 'overage', businessId: '1' },
      });
      const event = buildStripeEvent('invoice.payment_succeeded', invoice);

      const result = await service.handleWebhookEvent(event);

      expect(result).toEqual({ success: true });
      // handleOveragePaymentSucceeded should update overage charges to 'paid'
      expect(mockDbSet).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'paid' }),
      );
    });
  });

  // ──────────────────────────────────────────────
  // 10. Missing customer/business
  // ──────────────────────────────────────────────
  describe('Missing customer/business', () => {
    it('returns success when no business found for subscription update', async () => {
      // Return empty result -- no business matches
      mockDbLimit.mockResolvedValueOnce([]);

      const subscription = buildSubscription({ status: 'active' });
      const event = buildStripeEvent('customer.subscription.updated', subscription);

      // Should not throw
      const result = await service.handleWebhookEvent(event);

      expect(result).toEqual({ success: true });
      // Should not try to update anything since no business was found
      // (the code returns early after the warn)
    });

    it('returns success when no business found for subscription deletion', async () => {
      mockDbLimit.mockResolvedValueOnce([]);

      const subscription = buildSubscription({ status: 'canceled' });
      const event = buildStripeEvent('customer.subscription.deleted', subscription);

      const result = await service.handleWebhookEvent(event);

      expect(result).toEqual({ success: true });
      // Should NOT try to deprovision since no business was found
      expect(mockDeprovisionBusiness).not.toHaveBeenCalled();
    });

    it('does not send email when no business found for payment failure', async () => {
      const business = buildBusiness();
      // updateSubscriptionStatus: where() -> limit(1) finds a business
      mockDbLimit.mockResolvedValueOnce([business]);
      // First where() consumed by updateSubscriptionStatus, second by dunning handler (no business)
      mockDbWhere
        .mockResolvedValueOnce([]) // consumed by updateSubscriptionStatus (not awaited)
        .mockResolvedValueOnce([]); // consumed by handleInvoicePaymentFailedWithDunning (no business found)

      mockStripeSubscriptionsRetrieve.mockResolvedValue(buildSubscription({ status: 'past_due' }));

      const invoice = buildInvoice({ attempt_count: 1 });
      const event = buildStripeEvent('invoice.payment_failed', invoice);

      const result = await service.handleWebhookEvent(event);

      expect(result).toEqual({ success: true });
      // Should not send email since no business was found
      expect(mockSendPaymentFailedEmail).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────
  // Edge cases
  // ──────────────────────────────────────────────
  describe('Edge cases', () => {
    it('handles invoice.payment_succeeded without subscription field gracefully', async () => {
      const invoice = buildInvoice({ subscription: null });
      const event = buildStripeEvent('invoice.payment_succeeded', invoice);

      const result = await service.handleWebhookEvent(event);

      expect(result).toEqual({ success: true });
      // Should not call stripe.subscriptions.retrieve when no subscription
      expect(mockStripeSubscriptionsRetrieve).not.toHaveBeenCalled();
    });

    it('handles invoice.payment_failed for overage invoice', async () => {
      const invoice = buildInvoice({
        id: 'in_overage_fail_123',
        subscription: null,
        metadata: { type: 'overage', businessId: '1' },
        attempt_count: 1,
      });
      const event = buildStripeEvent('invoice.payment_failed', invoice);

      const result = await service.handleWebhookEvent(event);

      expect(result).toEqual({ success: true });
      // Should update overage charge status to failed
      expect(mockDbSet).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          failureReason: 'Payment failed',
        }),
      );
    });
  });
});
