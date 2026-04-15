import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock values hoisted before module loads ─────────────────────────────
const {
  mockPaymentIntentsCreate, mockPaymentIntentsRetrieve,
  mockCustomersCreate,
  mockInvoiceItemsCreate, mockInvoicesCreate,
  mockWebhooksConstructEvent,
} = vi.hoisted(() => {
  // Set env before any module loads
  process.env.STRIPE_SECRET_KEY = 'sk_test_fake_key_for_unit_tests';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_webhook_secret';

  const mockPaymentIntentsCreate = vi.fn();
  const mockPaymentIntentsRetrieve = vi.fn();
  const mockCustomersCreate = vi.fn();
  const mockInvoiceItemsCreate = vi.fn();
  const mockInvoicesCreate = vi.fn();
  const mockWebhooksConstructEvent = vi.fn();

  return {
    mockPaymentIntentsCreate, mockPaymentIntentsRetrieve,
    mockCustomersCreate,
    mockInvoiceItemsCreate, mockInvoicesCreate,
    mockWebhooksConstructEvent,
  };
});

// ── Mock Stripe SDK ─────────────────────────────────────────────────────
vi.mock('stripe', () => {
  function StripeMock() {
    return {
      paymentIntents: {
        create: mockPaymentIntentsCreate,
        retrieve: mockPaymentIntentsRetrieve,
      },
      customers: {
        create: mockCustomersCreate,
      },
      invoiceItems: {
        create: mockInvoiceItemsCreate,
      },
      invoices: {
        create: mockInvoicesCreate,
      },
      webhooks: {
        constructEvent: mockWebhooksConstructEvent,
      },
    };
  }
  return { default: StripeMock };
});

// ── Import the service under test ───────────────────────────────────────
import {
  createPaymentIntent,
  getPaymentIntent,
  createCustomer,
  createInvoice,
  handleWebhookEvent,
  getStripe,
} from './stripeService';

// ── Test suite ──────────────────────────────────────────────────────────
describe('stripeService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── getStripe() ────────────────────────────────────────────────────
  describe('getStripe()', () => {
    it('returns a Stripe instance when STRIPE_SECRET_KEY is set', () => {
      const stripe = getStripe();
      expect(stripe).toBeDefined();
      expect(stripe.paymentIntents).toBeDefined();
      expect(stripe.customers).toBeDefined();
      expect(stripe.webhooks).toBeDefined();
    });
  });

  // ─── createPaymentIntent() ──────────────────────────────────────────
  describe('createPaymentIntent()', () => {
    it('creates a payment intent with the correct amount in cents', async () => {
      const fakePaymentIntent = {
        id: 'pi_test123',
        amount: 2500,
        currency: 'usd',
        status: 'requires_payment_method',
      };
      mockPaymentIntentsCreate.mockResolvedValueOnce(fakePaymentIntent);

      const result = await createPaymentIntent(25.00);

      expect(mockPaymentIntentsCreate).toHaveBeenCalledWith({
        amount: 2500,
        currency: 'usd',
        metadata: {},
      });
      expect(result.id).toBe('pi_test123');
      expect(result.amount).toBe(2500);
    });

    it('passes custom currency and metadata to Stripe', async () => {
      const fakePaymentIntent = {
        id: 'pi_eur456',
        amount: 10000,
        currency: 'eur',
        status: 'requires_payment_method',
      };
      mockPaymentIntentsCreate.mockResolvedValueOnce(fakePaymentIntent);

      const metadata = { businessId: '42', invoiceId: '100' };
      const result = await createPaymentIntent(100.00, 'eur', metadata);

      expect(mockPaymentIntentsCreate).toHaveBeenCalledWith({
        amount: 10000,
        currency: 'eur',
        metadata: { businessId: '42', invoiceId: '100' },
      });
      expect(result.currency).toBe('eur');
    });

    it('correctly rounds fractional cent amounts (e.g., $19.99)', async () => {
      mockPaymentIntentsCreate.mockResolvedValueOnce({
        id: 'pi_fractional',
        amount: 1999,
        currency: 'usd',
        status: 'requires_payment_method',
      });

      await createPaymentIntent(19.99);

      expect(mockPaymentIntentsCreate).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 1999 }),
      );
    });

    it('correctly rounds amounts that produce floating-point imprecision (e.g., $10.10)', async () => {
      // 10.10 * 100 = 1009.9999999999998 in IEEE 754
      mockPaymentIntentsCreate.mockResolvedValueOnce({
        id: 'pi_round',
        amount: 1010,
        currency: 'usd',
        status: 'requires_payment_method',
      });

      await createPaymentIntent(10.10);

      expect(mockPaymentIntentsCreate).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 1010 }),
      );
    });

    // ── Validation tests ──────────────────────────────────────────────
    it('rejects amounts below Stripe minimum ($0.50)', async () => {
      await expect(createPaymentIntent(0.49)).rejects.toThrow(
        'Payment amount must be at least $0.50 (Stripe minimum)',
      );
      expect(mockPaymentIntentsCreate).not.toHaveBeenCalled();
    });

    it('rejects amounts exceeding maximum ($999,999.99)', async () => {
      await expect(createPaymentIntent(1_000_000)).rejects.toThrow(
        'Payment amount exceeds maximum allowed ($999,999.99)',
      );
      expect(mockPaymentIntentsCreate).not.toHaveBeenCalled();
    });

    it('rejects zero amount', async () => {
      await expect(createPaymentIntent(0)).rejects.toThrow(
        'Payment amount must be a positive finite number',
      );
      expect(mockPaymentIntentsCreate).not.toHaveBeenCalled();
    });

    it('rejects negative amounts', async () => {
      await expect(createPaymentIntent(-50)).rejects.toThrow(
        'Payment amount must be a positive finite number',
      );
      expect(mockPaymentIntentsCreate).not.toHaveBeenCalled();
    });

    it('rejects NaN amounts', async () => {
      await expect(createPaymentIntent(NaN)).rejects.toThrow(
        'Payment amount must be a positive finite number',
      );
      expect(mockPaymentIntentsCreate).not.toHaveBeenCalled();
    });

    it('rejects Infinity amounts', async () => {
      await expect(createPaymentIntent(Infinity)).rejects.toThrow(
        'Payment amount must be a positive finite number',
      );
      expect(mockPaymentIntentsCreate).not.toHaveBeenCalled();
    });

    it('rejects negative Infinity amounts', async () => {
      await expect(createPaymentIntent(-Infinity)).rejects.toThrow(
        'Payment amount must be a positive finite number',
      );
      expect(mockPaymentIntentsCreate).not.toHaveBeenCalled();
    });

    it('accepts the exact minimum amount ($0.50)', async () => {
      mockPaymentIntentsCreate.mockResolvedValueOnce({
        id: 'pi_min',
        amount: 50,
        currency: 'usd',
        status: 'requires_payment_method',
      });

      const result = await createPaymentIntent(0.50);

      expect(mockPaymentIntentsCreate).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 50 }),
      );
      expect(result.id).toBe('pi_min');
    });

    it('accepts the exact maximum amount ($999,999.99)', async () => {
      mockPaymentIntentsCreate.mockResolvedValueOnce({
        id: 'pi_max',
        amount: 99999999,
        currency: 'usd',
        status: 'requires_payment_method',
      });

      const result = await createPaymentIntent(999_999.99);

      expect(mockPaymentIntentsCreate).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 99999999 }),
      );
      expect(result.id).toBe('pi_max');
    });

    it('propagates Stripe SDK errors', async () => {
      const stripeError = new Error('Your card was declined.');
      mockPaymentIntentsCreate.mockRejectedValueOnce(stripeError);

      await expect(createPaymentIntent(50.00)).rejects.toThrow('Your card was declined.');
    });
  });

  // ─── getPaymentIntent() ─────────────────────────────────────────────
  describe('getPaymentIntent()', () => {
    it('retrieves a payment intent by ID', async () => {
      const fakePaymentIntent = {
        id: 'pi_retrieve_test',
        amount: 5000,
        currency: 'usd',
        status: 'succeeded',
      };
      mockPaymentIntentsRetrieve.mockResolvedValueOnce(fakePaymentIntent);

      const result = await getPaymentIntent('pi_retrieve_test');

      expect(mockPaymentIntentsRetrieve).toHaveBeenCalledWith('pi_retrieve_test');
      expect(result.id).toBe('pi_retrieve_test');
      expect(result.status).toBe('succeeded');
    });

    it('propagates Stripe errors when payment intent is not found', async () => {
      const stripeError = new Error('No such payment_intent: pi_nonexistent');
      mockPaymentIntentsRetrieve.mockRejectedValueOnce(stripeError);

      await expect(getPaymentIntent('pi_nonexistent')).rejects.toThrow(
        'No such payment_intent: pi_nonexistent',
      );
    });
  });

  // ─── createCustomer() ───────────────────────────────────────────────
  describe('createCustomer()', () => {
    it('creates a Stripe customer with all fields', async () => {
      const fakeCustomer = {
        id: 'cus_test789',
        email: 'tony@smallbiz.com',
        name: 'Tony Illiano',
        phone: '+15551234567',
      };
      mockCustomersCreate.mockResolvedValueOnce(fakeCustomer);

      const result = await createCustomer(
        'tony@smallbiz.com',
        'Tony Illiano',
        '+15551234567',
        { businessId: '1' },
      );

      expect(mockCustomersCreate).toHaveBeenCalledWith({
        email: 'tony@smallbiz.com',
        name: 'Tony Illiano',
        phone: '+15551234567',
        metadata: { businessId: '1' },
      });
      expect(result.id).toBe('cus_test789');
      expect(result.email).toBe('tony@smallbiz.com');
    });

    it('creates a customer without phone (optional parameter)', async () => {
      const fakeCustomer = {
        id: 'cus_no_phone',
        email: 'nophone@test.com',
        name: 'No Phone Customer',
      };
      mockCustomersCreate.mockResolvedValueOnce(fakeCustomer);

      const result = await createCustomer('nophone@test.com', 'No Phone Customer');

      expect(mockCustomersCreate).toHaveBeenCalledWith({
        email: 'nophone@test.com',
        name: 'No Phone Customer',
        phone: undefined,
        metadata: {},
      });
      expect(result.id).toBe('cus_no_phone');
    });

    it('propagates Stripe errors on customer creation failure', async () => {
      const stripeError = new Error('Customer email is invalid');
      mockCustomersCreate.mockRejectedValueOnce(stripeError);

      await expect(
        createCustomer('bad-email', 'Bad Customer'),
      ).rejects.toThrow('Customer email is invalid');
    });
  });

  // ─── createInvoice() ────────────────────────────────────────────────
  describe('createInvoice()', () => {
    it('creates an invoice item and then the invoice', async () => {
      const fakeInvoiceItem = { id: 'ii_test1', amount: 15000 };
      const fakeInvoice = {
        id: 'in_test1',
        customer: 'cus_invoice_test',
        status: 'open',
        amount_due: 15000,
      };

      mockInvoiceItemsCreate.mockResolvedValueOnce(fakeInvoiceItem);
      mockInvoicesCreate.mockResolvedValueOnce(fakeInvoice);

      const result = await createInvoice(
        'cus_invoice_test',
        'Haircut service',
        150.00,
        { jobId: '42' },
      );

      // Verify invoice item was created first with correct cent conversion
      expect(mockInvoiceItemsCreate).toHaveBeenCalledWith({
        customer: 'cus_invoice_test',
        amount: 15000,
        currency: 'usd',
        description: 'Haircut service',
      });

      // Verify the invoice was created with auto_advance
      expect(mockInvoicesCreate).toHaveBeenCalledWith({
        customer: 'cus_invoice_test',
        description: 'Haircut service',
        metadata: { jobId: '42' },
        auto_advance: true,
      });

      expect(result.id).toBe('in_test1');
    });

    it('propagates errors when invoice item creation fails', async () => {
      const stripeError = new Error('No such customer: cus_bad');
      mockInvoiceItemsCreate.mockRejectedValueOnce(stripeError);

      await expect(
        createInvoice('cus_bad', 'Service', 50.00),
      ).rejects.toThrow('No such customer: cus_bad');

      // The invoice should NOT have been created since the item failed
      expect(mockInvoicesCreate).not.toHaveBeenCalled();
    });

    it('propagates errors when invoice creation fails after item is created', async () => {
      mockInvoiceItemsCreate.mockResolvedValueOnce({ id: 'ii_ok' });
      const stripeError = new Error('Invoice creation failed');
      mockInvoicesCreate.mockRejectedValueOnce(stripeError);

      await expect(
        createInvoice('cus_ok', 'Service', 75.00),
      ).rejects.toThrow('Invoice creation failed');
    });

    it('converts fractional dollar amounts to cents correctly', async () => {
      mockInvoiceItemsCreate.mockResolvedValueOnce({ id: 'ii_cents' });
      mockInvoicesCreate.mockResolvedValueOnce({ id: 'in_cents' });

      await createInvoice('cus_test', 'Plumbing repair', 249.95);

      expect(mockInvoiceItemsCreate).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 24995 }),
      );
    });
  });

  // ─── handleWebhookEvent() ───────────────────────────────────────────
  describe('handleWebhookEvent()', () => {
    it('constructs and returns a verified webhook event', () => {
      const fakeEvent = {
        id: 'evt_test1',
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_success1', amount: 5000 } },
      };
      mockWebhooksConstructEvent.mockReturnValueOnce(fakeEvent);

      const payload = '{"raw":"body"}';
      const signature = 'test_sig_header';
      const secret = 'whsec_test_secret';

      const result = handleWebhookEvent(signature, payload, secret);

      expect(mockWebhooksConstructEvent).toHaveBeenCalledWith(
        payload,
        signature,
        secret,
      );
      expect(result.id).toBe('evt_test1');
      expect(result.type).toBe('payment_intent.succeeded');
    });

    it('falls back to STRIPE_WEBHOOK_SECRET env when no secret is passed', () => {
      const fakeEvent = {
        id: 'evt_env_fallback',
        type: 'invoice.payment_failed',
        data: { object: {} },
      };
      mockWebhooksConstructEvent.mockReturnValueOnce(fakeEvent);

      const result = handleWebhookEvent('sig_header', '{"body":"data"}');

      expect(mockWebhooksConstructEvent).toHaveBeenCalledWith(
        '{"body":"data"}',
        'sig_header',
        'whsec_test_webhook_secret', // from process.env set in vi.hoisted()
      );
      expect(result.id).toBe('evt_env_fallback');
    });

    it('throws when webhook secret is missing from both arg and env', () => {
      const originalSecret = process.env.STRIPE_WEBHOOK_SECRET;
      delete process.env.STRIPE_WEBHOOK_SECRET;

      expect(() => {
        handleWebhookEvent('sig_header', '{"body":"data"}');
      }).toThrow('STRIPE_WEBHOOK_SECRET not configured');

      // Restore for other tests
      process.env.STRIPE_WEBHOOK_SECRET = originalSecret;
    });

    it('propagates Stripe signature verification errors', () => {
      const verificationError = new Error(
        'No signatures found matching the expected signature for payload',
      );
      mockWebhooksConstructEvent.mockImplementationOnce(() => {
        throw verificationError;
      });

      expect(() => {
        handleWebhookEvent('bad_sig', '{"tampered":"payload"}', 'whsec_real');
      }).toThrow('No signatures found matching the expected signature for payload');
    });

    it('accepts Buffer payloads', () => {
      const fakeEvent = {
        id: 'evt_buffer',
        type: 'customer.created',
        data: { object: { id: 'cus_new' } },
      };
      mockWebhooksConstructEvent.mockReturnValueOnce(fakeEvent);

      const bufferPayload = Buffer.from('{"raw":"buffer_body"}');
      const result = handleWebhookEvent('sig_buf', bufferPayload, 'whsec_buf');

      expect(mockWebhooksConstructEvent).toHaveBeenCalledWith(
        bufferPayload,
        'sig_buf',
        'whsec_buf',
      );
      expect(result.type).toBe('customer.created');
    });
  });
});
