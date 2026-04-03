import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks (must be before imports) ──
const mockStorage = vi.hoisted(() => ({
  getBusiness: vi.fn(),
  getCustomer: vi.fn(),
  getSmsBusinessProfile: vi.fn(),
  getEngagementLock: vi.fn(),
  createOutboundMessage: vi.fn(),
  createSmsActivityFeedEntry: vi.fn(),
  upsertConversationState: vi.fn(),
}));

const mockTwilioSendSms = vi.hoisted(() => vi.fn());
const mockOpenAICreate = vi.hoisted(() => vi.fn());
const mockMem0Search = vi.hoisted(() => vi.fn());
const mockMem0Add = vi.hoisted(() => vi.fn());

vi.mock('../storage', () => ({
  storage: mockStorage,
}));

vi.mock('./twilioService', () => ({
  sendSms: mockTwilioSendSms,
}));

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: mockOpenAICreate,
      },
    },
  })),
}));

vi.mock('../config/verticals', () => ({
  getVerticalConfig: vi.fn().mockReturnValue({
    category: 'appointment',
    rules: { hasStaffBooking: true, hasLateCancelProtection: false, hasWinBack: true, rebookingCycleDays: 30 },
    defaultTone: 'casual',
    defaultEmojiUsage: 'moderate',
    defaultMaxLength: 160,
    exampleVoice: 'Hey John, time for a fresh cut!',
    forbiddenPhrases: [],
  }),
}));

vi.mock('./agentSettingsService', () => ({
  fillTemplate: vi.fn().mockImplementation((tmpl: string, vars: Record<string, string>) => {
    let result = tmpl;
    for (const [k, v] of Object.entries(vars || {})) {
      result = result.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
    }
    return result;
  }),
}));

vi.mock('./mem0Service', () => ({
  searchMemories: mockMem0Search.mockResolvedValue([]),
  addMemory: mockMem0Add.mockResolvedValue(undefined),
}));

vi.mock('./customerInsightsService', () => ({
  getCustomerInsightsForCaller: vi.fn().mockResolvedValue(null),
}));

// ── Test Data ──
const TEST_BUSINESS = {
  id: 1,
  name: "Tony's Barbershop",
  industry: 'barbershop',
  phone: '+15551234567',
  timezone: 'America/New_York',
};

const TEST_CUSTOMER = {
  id: 10,
  businessId: 1,
  firstName: 'John',
  lastName: 'Smith',
  phone: '+15559876543',
  email: 'john@example.com',
  smsOptIn: true,
  marketingOptIn: true,
};

const TEST_CUSTOMER_OPT_OUT = {
  ...TEST_CUSTOMER,
  id: 11,
  smsOptIn: false,
  marketingOptIn: false,
};

const TEST_SMS_PROFILE = {
  businessId: 1,
  tone: 'casual',
  emojiUsage: 'moderate',
  signOffName: 'Tony',
  customerDescription: 'Local regulars who like a clean cut',
  uniqueSellingPoint: 'Best fades in town',
};

// ═════════════════════════════════════════════
// Core generateMessage Tests
// ═════════════════════════════════════════════

describe('messageIntelligenceService', () => {
  let generateMessage: typeof import('./messageIntelligenceService').generateMessage;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockStorage.getBusiness.mockResolvedValue(TEST_BUSINESS);
    mockStorage.getCustomer.mockResolvedValue(TEST_CUSTOMER);
    mockStorage.getSmsBusinessProfile.mockResolvedValue(TEST_SMS_PROFILE);
    mockStorage.getEngagementLock.mockResolvedValue(null);
    mockStorage.createOutboundMessage.mockResolvedValue({ id: 1 });
    mockStorage.createSmsActivityFeedEntry.mockResolvedValue({ id: 1 });
    mockStorage.upsertConversationState.mockResolvedValue({});
    mockTwilioSendSms.mockResolvedValue({ sid: 'SM123' });

    const mod = await import('./messageIntelligenceService');
    generateMessage = mod.generateMessage;
  });

  // ── Template Mode Tests ──

  describe('template mode (useTemplate: true)', () => {
    it('should generate a booking confirmation via template', async () => {
      const result = await generateMessage({
        messageType: 'BOOKING_CONFIRMATION',
        businessId: 1,
        customerId: 10,
        recipientPhone: '+15559876543',
        useTemplate: true,
        isMarketing: false,
        context: {
          customerName: 'John',
          serviceName: 'Haircut',
          appointmentDate: 'Friday, April 4th',
          appointmentTime: '2:00 PM',
          businessName: "Tony's Barbershop",
        },
      });

      expect(result.success).toBe(true);
      expect(result.body).toBeDefined();
      expect(result.body).toContain('John');
      expect(result.body).toContain('Haircut');
      expect(result.fallbackUsed).toBe(false);
    });

    it('should generate an appointment reminder with keywords', async () => {
      const result = await generateMessage({
        messageType: 'APPOINTMENT_REMINDER',
        businessId: 1,
        customerId: 10,
        recipientPhone: '+15559876543',
        useTemplate: true,
        isMarketing: false,
        context: {
          customerName: 'John',
          serviceName: 'Fade',
          appointmentDate: 'tomorrow',
          appointmentTime: '10:00 AM',
          businessName: "Tony's Barbershop",
        },
      });

      expect(result.success).toBe(true);
      expect(result.body).toContain('CONFIRM');
      expect(result.body).toContain('RESCHEDULE');
    });

    it('should generate a cancellation acknowledgment', async () => {
      const result = await generateMessage({
        messageType: 'CANCELLATION_ACKNOWLEDGMENT',
        businessId: 1,
        customerId: 10,
        recipientPhone: '+15559876543',
        useTemplate: true,
        isMarketing: false,
        context: {
          customerName: 'John',
          businessName: "Tony's Barbershop",
          bookingLink: 'https://smallbizagent.ai/book/tonys',
        },
      });

      expect(result.success).toBe(true);
      expect(result.body).toContain('cancelled');
    });

    it('should generate a holding message', async () => {
      const result = await generateMessage({
        messageType: 'HOLDING_MESSAGE',
        businessId: 1,
        customerId: 10,
        recipientPhone: '+15559876543',
        useTemplate: true,
        isMarketing: false,
        context: { businessName: "Tony's Barbershop" },
      });

      expect(result.success).toBe(true);
      expect(result.body).toContain('follow up');
    });
  });

  // ── Opt-Out Checks ──

  describe('opt-out checks', () => {
    it('should skip SMS when customer has smsOptIn=false (transactional)', async () => {
      mockStorage.getCustomer.mockResolvedValue(TEST_CUSTOMER_OPT_OUT);

      const result = await generateMessage({
        messageType: 'APPOINTMENT_REMINDER',
        businessId: 1,
        customerId: 11,
        recipientPhone: '+15559876543',
        useTemplate: true,
        isMarketing: false,
        context: {},
      });

      expect(result.success).toBe(false);
      expect(result.skipped).toBe(true);
      expect(result.skipReason).toBe('sms_opt_out');
      // Should NOT have called Twilio
      expect(mockTwilioSendSms).not.toHaveBeenCalled();
    });

    it('should skip marketing SMS when customer has marketingOptIn=false', async () => {
      mockStorage.getCustomer.mockResolvedValue({
        ...TEST_CUSTOMER,
        marketingOptIn: false,
      });

      const result = await generateMessage({
        messageType: 'WIN_BACK',
        businessId: 1,
        customerId: 10,
        recipientPhone: '+15559876543',
        useTemplate: false,
        isMarketing: true,
        context: {},
      });

      expect(result.success).toBe(false);
      expect(result.skipped).toBe(true);
      expect(result.skipReason).toBe('marketing_opt_out');
    });
  });

  // ── Security: Cross-Tenant Protection ──

  describe('security', () => {
    it('should reject customer from different business (IDOR prevention)', async () => {
      mockStorage.getCustomer.mockResolvedValue({
        ...TEST_CUSTOMER,
        businessId: 999, // Different business
      });

      const result = await generateMessage({
        messageType: 'BOOKING_CONFIRMATION',
        businessId: 1,
        customerId: 10,
        recipientPhone: '+15559876543',
        useTemplate: true,
        isMarketing: false,
        context: {},
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('does not belong');
    });
  });

  // ── Engagement Lock ──

  describe('engagement lock', () => {
    it('should queue marketing messages when engagement lock is active', async () => {
      mockStorage.getEngagementLock.mockResolvedValue({
        customerId: 10,
        businessId: 1,
        lockedByAgent: 'noShow',
        status: 'active',
        expiresAt: new Date(Date.now() + 60000), // 1 minute from now
      });

      const result = await generateMessage({
        messageType: 'REBOOKING_NUDGE',
        businessId: 1,
        customerId: 10,
        recipientPhone: '+15559876543',
        useTemplate: false,
        isMarketing: true,
        context: {},
      });

      expect(result.success).toBe(false);
      expect(result.queued).toBe(true);
      expect(result.skipReason).toBe('engagement_locked');
    });

    it('should allow transactional messages even with engagement lock', async () => {
      mockStorage.getEngagementLock.mockResolvedValue({
        customerId: 10,
        businessId: 1,
        lockedByAgent: 'noShow',
        status: 'active',
        expiresAt: new Date(Date.now() + 60000),
      });

      const result = await generateMessage({
        messageType: 'BOOKING_CONFIRMATION',
        businessId: 1,
        customerId: 10,
        recipientPhone: '+15559876543',
        useTemplate: true,
        isMarketing: false, // Transactional — should bypass lock
        context: {
          customerName: 'John',
          serviceName: 'Haircut',
          appointmentDate: 'Friday',
          appointmentTime: '2 PM',
          businessName: "Tony's Barbershop",
        },
      });

      expect(result.success).toBe(true);
    });

    it('should ignore expired engagement locks', async () => {
      mockStorage.getEngagementLock.mockResolvedValue({
        customerId: 10,
        businessId: 1,
        lockedByAgent: 'noShow',
        status: 'active',
        expiresAt: new Date(Date.now() - 60000), // Expired 1 minute ago
      });

      const result = await generateMessage({
        messageType: 'REBOOKING_NUDGE',
        businessId: 1,
        customerId: 10,
        recipientPhone: '+15559876543',
        useTemplate: true,
        isMarketing: true,
        context: {
          customerName: 'John',
          businessName: "Tony's Barbershop",
        },
      });

      // Should proceed (not queued) since lock is expired
      expect(result.queued).not.toBe(true);
    });
  });

  // ── Business Not Found ──

  describe('error handling', () => {
    it('should return error when business not found', async () => {
      mockStorage.getBusiness.mockResolvedValue(null);

      const result = await generateMessage({
        messageType: 'BOOKING_CONFIRMATION',
        businessId: 999,
        customerId: 10,
        recipientPhone: '+15559876543',
        useTemplate: true,
        isMarketing: false,
        context: {},
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  // ── All 24 MessageTypes ──

  describe('all message types produce output', () => {
    const templateTypes = [
      'BOOKING_CONFIRMATION',
      'APPOINTMENT_REMINDER',
      'JOB_CONFIRMATION',
      'JOB_REMINDER',
      'RESCHEDULE_CONFIRMATION',
      'CANCELLATION_ACKNOWLEDGMENT',
      'RESERVATION_CONFIRMATION',
      'RESERVATION_REMINDER',
      'HOLDING_MESSAGE',
      'MARKETING_OPT_IN',
      'BIRTHDAY_COLLECTION',
    ] as const;

    for (const type of templateTypes) {
      it(`should produce a message for ${type}`, async () => {
        const result = await generateMessage({
          messageType: type,
          businessId: 1,
          customerId: 10,
          recipientPhone: '+15559876543',
          useTemplate: true,
          isMarketing: false,
          context: {
            customerName: 'John',
            serviceName: 'Haircut',
            appointmentDate: 'Friday',
            appointmentTime: '2 PM',
            businessName: "Tony's Barbershop",
            businessPhone: '+15551234567',
            bookingLink: 'https://smallbizagent.ai/book/tonys',
            partySize: '4',
            newDate: 'Saturday',
            newTime: '3 PM',
          },
        });

        expect(result.success).toBe(true);
        expect(result.body).toBeDefined();
        expect(result.body!.length).toBeGreaterThan(10);
      });
    }
  });
});
