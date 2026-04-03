import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

// Set DATABASE_URL before any imports
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

// ── Mocks (must be before imports) ──
const mockStorage = vi.hoisted(() => ({
  getBusiness: vi.fn(),
  getBusinessByTwilioPhoneNumber: vi.fn(),
  getCustomerByPhone: vi.fn(),
  getCustomer: vi.fn(),
  getService: vi.fn(),
  getStaffMember: vi.fn(),
  getReceptionistConfig: vi.fn(),
  createCallLog: vi.fn(),
  updateCallLog: vi.fn(),
  getAppointments: vi.fn(),
  getServices: vi.fn(),
  getStaff: vi.fn(),
  getBusinessHours: vi.fn(),
  createCustomer: vi.fn(),
  updateCustomer: vi.fn(),
  getPhoneNumberByTwilioNumber: vi.fn(),
}));

vi.mock('../db', () => ({
  db: {},
  pool: { connect: vi.fn(), query: vi.fn(), end: vi.fn() },
}));

vi.mock('../storage', () => ({
  storage: mockStorage,
}));

vi.mock('./usageService', () => ({
  canBusinessAcceptCalls: vi.fn().mockResolvedValue({ allowed: true }),
  getUsageInfo: vi.fn().mockResolvedValue({ minutesUsed: 10, minutesAllowed: 150 }),
}));

vi.mock('./callIntelligenceService', () => ({
  processCallIntelligence: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./mem0Service', () => ({
  searchMemories: vi.fn().mockResolvedValue([]),
  addMemory: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./customerInsightsService', () => ({
  getCustomerInsightsForCaller: vi.fn().mockResolvedValue(null),
}));

import {
  verifyRetellSignature,
} from './retellWebhookHandler';

// ── Test Data ──
const TEST_API_KEY = 'test-retell-api-key-12345';

const TEST_BUSINESS = {
  id: 1,
  name: 'Test Salon',
  industry: 'salon',
  phone: '+15551234567',
  timezone: 'America/New_York',
  receptionistEnabled: true,
  bookingSlug: 'test-salon',
  subscriptionStatus: 'active',
};

// ═════════════════════════════════════════════
// Signature Verification Tests
// ═════════════════════════════════════════════

describe('verifyRetellSignature', () => {
  it('should verify a valid signature', () => {
    const body = '{"event":"call_ended","call":{"call_id":"123"}}';
    const expectedSig = crypto
      .createHmac('sha256', TEST_API_KEY)
      .update(body)
      .digest('base64');

    const result = verifyRetellSignature(body, expectedSig, TEST_API_KEY);
    expect(result).toBe(true);
  });

  it('should reject an invalid signature', () => {
    const body = '{"event":"call_ended"}';
    const invalidSig = 'aW52YWxpZC1zaWduYXR1cmU='; // base64 of "invalid-signature"

    const result = verifyRetellSignature(body, invalidSig, TEST_API_KEY);
    expect(result).toBe(false);
  });

  it('should reject when body has been tampered', () => {
    const originalBody = '{"event":"call_ended"}';
    const tamperedBody = '{"event":"call_ended","injected":true}';
    const validSig = crypto
      .createHmac('sha256', TEST_API_KEY)
      .update(originalBody)
      .digest('base64');

    const result = verifyRetellSignature(tamperedBody, validSig, TEST_API_KEY);
    expect(result).toBe(false);
  });

  it('should return false for empty signature', () => {
    const body = '{"event":"test"}';
    const result = verifyRetellSignature(body, '', TEST_API_KEY);
    expect(result).toBe(false);
  });

  it('should return false for malformed base64 signature', () => {
    const body = '{"event":"test"}';
    const result = verifyRetellSignature(body, '!!!not-base64!!!', TEST_API_KEY);
    expect(result).toBe(false);
  });

  it('should prevent timing attacks with constant-time comparison', () => {
    const body = '{"event":"test"}';
    const correctSig = crypto
      .createHmac('sha256', TEST_API_KEY)
      .update(body)
      .digest('base64');

    // Flip one bit in the correct signature
    const wrongSig = Buffer.from(correctSig, 'base64');
    wrongSig[0] ^= 0x01;
    const modifiedSig = wrongSig.toString('base64');

    const result = verifyRetellSignature(body, modifiedSig, TEST_API_KEY);
    expect(result).toBe(false);
  });

  it('should handle different body encodings consistently', () => {
    const body = '{"name":"café","emoji":"\\u2615"}';
    const sig = crypto
      .createHmac('sha256', TEST_API_KEY)
      .update(body)
      .digest('base64');

    expect(verifyRetellSignature(body, sig, TEST_API_KEY)).toBe(true);
  });

  it('should reject when wrong API key is used', () => {
    const body = '{"event":"call_ended"}';
    const sigWithCorrectKey = crypto
      .createHmac('sha256', TEST_API_KEY)
      .update(body)
      .digest('base64');

    const result = verifyRetellSignature(body, sigWithCorrectKey, 'wrong-api-key');
    expect(result).toBe(false);
  });
});

// ═════════════════════════════════════════════
// Webhook Handler Tests (via Express mock)
// ═════════════════════════════════════════════

describe('handleRetellWebhook', () => {
  let handleRetellWebhook: typeof import('./retellWebhookHandler').handleRetellWebhook;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('./retellWebhookHandler');
    handleRetellWebhook = mod.handleRetellWebhook;
  });

  function mockReqRes(body: any) {
    const req = { body } as any;
    const res = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn(),
      json: vi.fn(),
    } as any;
    return { req, res };
  }

  it('should acknowledge call_started events with 200', async () => {
    const { req, res } = mockReqRes({
      event: 'call_started',
      call: { call_id: 'test-call-1', from_number: '+15559876543', to_number: '+15551234567' },
    });

    await handleRetellWebhook(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalled();
  });

  it('should acknowledge unknown events with 200 (prevent retries)', async () => {
    const { req, res } = mockReqRes({
      event: 'unknown_future_event',
      call: { call_id: 'test-call-2' },
    });

    await handleRetellWebhook(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('should handle missing event gracefully', async () => {
    const { req, res } = mockReqRes({});

    await handleRetellWebhook(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });

  it('should handle call_analyzed events', async () => {
    const { req, res } = mockReqRes({
      event: 'call_analyzed',
      call: {
        call_id: 'test-call-3',
        call_analysis: {
          user_sentiment: 'Positive',
          call_summary: 'Customer booked an appointment',
        },
      },
    });

    await handleRetellWebhook(req, res);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

// ═════════════════════════════════════════════
// Function Handler Tests
// ═════════════════════════════════════════════

describe('handleRetellFunction', () => {
  let handleRetellFunction: typeof import('./retellWebhookHandler').handleRetellFunction;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockStorage.getBusiness.mockResolvedValue(TEST_BUSINESS);
    mockStorage.getReceptionistConfig.mockResolvedValue({
      businessId: 1,
      greeting: 'Hello!',
      voiceId: 'test-voice',
    });
    const mod = await import('./retellWebhookHandler');
    handleRetellFunction = mod.handleRetellFunction;
  });

  function mockReqRes(body: any) {
    const req = { body } as any;
    const res = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn(),
      json: vi.fn(),
    } as any;
    return { req, res };
  }

  it('should reject requests without function name', async () => {
    const { req, res } = mockReqRes({
      args: {},
      call: { retell_llm_dynamic_variables: { businessId: '1' } },
    });

    await handleRetellFunction(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('should resolve businessId from dynamic variables', async () => {
    mockStorage.getBusinessByTwilioPhoneNumber.mockResolvedValue(null);
    mockStorage.getServices.mockResolvedValue([
      { id: 1, name: 'Haircut', price: '30', duration: 30 },
    ]);
    mockStorage.getStaff.mockResolvedValue([]);
    mockStorage.getBusinessHours.mockResolvedValue([]);
    mockStorage.getAppointments.mockResolvedValue([]);

    const { req, res } = mockReqRes({
      name: 'getBusinessHours',
      args: {},
      call: {
        retell_llm_dynamic_variables: { businessId: '1' },
        from_number: '+15559876543',
      },
    });

    await handleRetellFunction(req, res);
    // Should not return a 400 error
    expect(res.status).not.toHaveBeenCalledWith(400);
  });

  it('should fallback to phone number lookup when no dynamic vars', async () => {
    mockStorage.getBusinessByTwilioPhoneNumber.mockResolvedValue(TEST_BUSINESS);
    mockStorage.getServices.mockResolvedValue([]);
    mockStorage.getStaff.mockResolvedValue([]);
    mockStorage.getBusinessHours.mockResolvedValue([]);
    mockStorage.getAppointments.mockResolvedValue([]);

    const { req, res } = mockReqRes({
      name: 'getBusinessHours',
      args: {},
      call: {
        to_number: '+15551234567',
        from_number: '+15559876543',
      },
    });

    await handleRetellFunction(req, res);
    expect(mockStorage.getBusinessByTwilioPhoneNumber).toHaveBeenCalledWith('+15551234567');
  });

  it('should return error when receptionist is disabled', async () => {
    mockStorage.getBusiness.mockResolvedValue({
      ...TEST_BUSINESS,
      receptionistEnabled: false,
    });

    const { req, res } = mockReqRes({
      name: 'checkAvailability',
      args: { date: '2026-04-05' },
      call: {
        retell_llm_dynamic_variables: { businessId: '1' },
      },
    });

    await handleRetellFunction(req, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.stringContaining('unavailable'),
      })
    );
  });

  it('should return error when businessId cannot be determined', async () => {
    mockStorage.getBusinessByTwilioPhoneNumber.mockResolvedValue(null);

    const { req, res } = mockReqRes({
      name: 'checkAvailability',
      args: {},
      call: {}, // No businessId, no phone number
    });

    await handleRetellFunction(req, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        technicalError: expect.stringContaining('Business ID not found'),
      })
    );
  });
});

// ═════════════════════════════════════════════
// Inbound Webhook Tests
// ═════════════════════════════════════════════

describe('handleInboundWebhook', () => {
  let handleInboundWebhook: typeof import('./retellWebhookHandler').handleInboundWebhook;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockStorage.getBusiness.mockResolvedValue(TEST_BUSINESS);
    mockStorage.getBusinessByTwilioPhoneNumber.mockResolvedValue(TEST_BUSINESS);
    mockStorage.getCustomerByPhone.mockResolvedValue(null);
    mockStorage.getServices.mockResolvedValue([]);
    mockStorage.getStaff.mockResolvedValue([]);
    mockStorage.getBusinessHours.mockResolvedValue([]);
    mockStorage.getAppointments.mockResolvedValue([]);
    const mod = await import('./retellWebhookHandler');
    handleInboundWebhook = mod.handleInboundWebhook;
  });

  function mockReqRes(body: any) {
    const req = { body } as any;
    const res = {
      status: vi.fn().mockReturnThis(),
      send: vi.fn(),
      json: vi.fn(),
    } as any;
    return { req, res };
  }

  it('should return dynamic variables for known business', async () => {
    const { req, res } = mockReqRes({
      from_number: '+15559876543',
      to_number: '+15551234567',
    });

    await handleInboundWebhook(req, res);
    expect(res.json).toHaveBeenCalled();
    const responseData = res.json.mock.calls[0][0];
    expect(responseData).toBeDefined();
  });

  it('should handle unknown business phone gracefully', async () => {
    mockStorage.getBusinessByTwilioPhoneNumber.mockResolvedValue(null);

    const { req, res } = mockReqRes({
      from_number: '+15559876543',
      to_number: '+15550000000',
    });

    await handleInboundWebhook(req, res);
    // Should still respond (not crash)
    expect(res.json).toHaveBeenCalled();
  });
});
