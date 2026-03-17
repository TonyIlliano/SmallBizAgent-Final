import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks (vi.hoisted ensures they're available when vi.mock factories run) ──

const { mockStorage, mockSendSms, mockLogAgentAction } = vi.hoisted(() => ({
  mockStorage: {
    getBusiness: vi.fn(),
    getAppointment: vi.fn(),
    getCustomer: vi.fn(),
    updateCustomer: vi.fn(),
    getAgentSettings: vi.fn(),
    getAgentActivityLogs: vi.fn(),
    createSmsConversation: vi.fn(),
    updateSmsConversation: vi.fn(),
    getExpiredConversations: vi.fn(),
  },
  mockSendSms: vi.fn(),
  mockLogAgentAction: vi.fn(),
}));

vi.mock('../storage', () => ({ storage: mockStorage }));
vi.mock('./twilioService', () => ({ sendSms: mockSendSms }));
vi.mock('./agentActivityService', () => ({ logAgentAction: mockLogAgentAction }));

// Mock conversational booking as unavailable (so reply handler falls back to link-based flow)
vi.mock('./conversationalBookingService', () => ({
  canStartConversationalBooking: vi.fn().mockResolvedValue(false),
  initializeBookingConversation: vi.fn(),
}));

vi.mock('./agentSettingsService', () => ({
  isAgentEnabled: vi.fn(),
  getAgentConfig: vi.fn(),
  fillTemplate: vi.fn((template: string, vars: Record<string, string>) => {
    let result = template;
    for (const [key, value] of Object.entries(vars)) {
      result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    }
    return result;
  }),
}));

import { triggerNoShowSms, handleNoShowReply, processExpiredConversations } from './noShowAgentService';
import { isAgentEnabled, getAgentConfig } from './agentSettingsService';

// ── Test Data ──

const BUSINESS = { id: 1, name: 'Test Barber', phone: '+15551234567', bookingSlug: 'test-barber' };
const CUSTOMER = { id: 10, firstName: 'John', phone: '+15559876543', smsOptIn: true, marketingOptIn: true };
const APPOINTMENT = { id: 100, businessId: 1, customerId: 10, startDate: new Date('2025-03-15T14:00:00Z'), status: 'no_show' };
const DEFAULT_CONFIG = {
  messageTemplate: 'Hey {customerName}, we missed you at your {appointmentTime} appointment with {businessName}. Want to reschedule? Reply YES.',
  rescheduleReplyTemplate: 'Great! Book online at {bookingLink} or call us at {businessPhone}.',
  declineReplyTemplate: 'No problem! We\'ll be here whenever you\'re ready. - {businessName}',
  expirationHours: 24,
};

// ── Tests ──

describe('noShowAgentService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('triggerNoShowSms', () => {
    it('sends SMS when all conditions are met', async () => {
      (isAgentEnabled as any).mockResolvedValue(true);
      (getAgentConfig as any).mockResolvedValue(DEFAULT_CONFIG);
      mockStorage.getBusiness.mockResolvedValue(BUSINESS);
      mockStorage.getAppointment.mockResolvedValue(APPOINTMENT);
      mockStorage.getCustomer.mockResolvedValue(CUSTOMER);
      mockStorage.getAgentActivityLogs.mockResolvedValue([]);
      mockStorage.createSmsConversation.mockResolvedValue({ id: 1 });
      mockSendSms.mockResolvedValue(undefined);
      mockLogAgentAction.mockResolvedValue(undefined);

      const result = await triggerNoShowSms(100, 1);

      expect(result.sent).toBe(true);
      expect(mockSendSms).toHaveBeenCalledOnce();
      expect(mockSendSms).toHaveBeenCalledWith(
        CUSTOMER.phone,
        expect.stringContaining('John'),
        undefined,
        BUSINESS.id,
      );
      expect(mockStorage.createSmsConversation).toHaveBeenCalledOnce();
      expect(mockLogAgentAction).toHaveBeenCalledWith(
        expect.objectContaining({
          businessId: 1,
          agentType: 'no_show',
          action: 'sms_sent',
          customerId: CUSTOMER.id,
          referenceType: 'appointment',
          referenceId: APPOINTMENT.id,
        }),
      );
    });

    it('skips when agent is disabled', async () => {
      (isAgentEnabled as any).mockResolvedValue(false);

      const result = await triggerNoShowSms(100, 1);

      expect(result.sent).toBe(false);
      expect(result.reason).toBe('no_show agent is disabled');
      expect(mockSendSms).not.toHaveBeenCalled();
    });

    it('skips when business not found', async () => {
      (isAgentEnabled as any).mockResolvedValue(true);
      (getAgentConfig as any).mockResolvedValue(DEFAULT_CONFIG);
      mockStorage.getBusiness.mockResolvedValue(null);

      const result = await triggerNoShowSms(100, 1);

      expect(result.sent).toBe(false);
      expect(result.reason).toBe('business not found');
    });

    it('skips when appointment not found', async () => {
      (isAgentEnabled as any).mockResolvedValue(true);
      (getAgentConfig as any).mockResolvedValue(DEFAULT_CONFIG);
      mockStorage.getBusiness.mockResolvedValue(BUSINESS);
      mockStorage.getAppointment.mockResolvedValue(null);

      const result = await triggerNoShowSms(100, 1);

      expect(result.sent).toBe(false);
      expect(result.reason).toBe('appointment not found');
    });

    it('skips when appointment has no customer', async () => {
      (isAgentEnabled as any).mockResolvedValue(true);
      (getAgentConfig as any).mockResolvedValue(DEFAULT_CONFIG);
      mockStorage.getBusiness.mockResolvedValue(BUSINESS);
      mockStorage.getAppointment.mockResolvedValue({ ...APPOINTMENT, customerId: null });

      const result = await triggerNoShowSms(100, 1);

      expect(result.sent).toBe(false);
      expect(result.reason).toBe('appointment has no customer');
    });

    it('skips when customer has no phone', async () => {
      (isAgentEnabled as any).mockResolvedValue(true);
      (getAgentConfig as any).mockResolvedValue(DEFAULT_CONFIG);
      mockStorage.getBusiness.mockResolvedValue(BUSINESS);
      mockStorage.getAppointment.mockResolvedValue(APPOINTMENT);
      mockStorage.getCustomer.mockResolvedValue({ ...CUSTOMER, phone: null });

      const result = await triggerNoShowSms(100, 1);

      expect(result.sent).toBe(false);
      expect(result.reason).toBe('customer has no phone number');
    });

    it('skips when customer has not opted into marketing SMS (TCPA)', async () => {
      (isAgentEnabled as any).mockResolvedValue(true);
      (getAgentConfig as any).mockResolvedValue(DEFAULT_CONFIG);
      mockStorage.getBusiness.mockResolvedValue(BUSINESS);
      mockStorage.getAppointment.mockResolvedValue(APPOINTMENT);
      mockStorage.getCustomer.mockResolvedValue({ ...CUSTOMER, marketingOptIn: false });

      const result = await triggerNoShowSms(100, 1);

      expect(result.sent).toBe(false);
      expect(result.reason).toBe('customer has not opted into marketing SMS');
    });

    it('prevents duplicate SMS (idempotency)', async () => {
      (isAgentEnabled as any).mockResolvedValue(true);
      (getAgentConfig as any).mockResolvedValue(DEFAULT_CONFIG);
      mockStorage.getBusiness.mockResolvedValue(BUSINESS);
      mockStorage.getAppointment.mockResolvedValue(APPOINTMENT);
      mockStorage.getCustomer.mockResolvedValue(CUSTOMER);
      mockStorage.getAgentActivityLogs.mockResolvedValue([
        { referenceType: 'appointment', referenceId: 100, action: 'sms_sent' },
      ]);

      const result = await triggerNoShowSms(100, 1);

      expect(result.sent).toBe(false);
      expect(result.reason).toBe('no-show SMS already sent for this appointment');
      expect(mockSendSms).not.toHaveBeenCalled();
    });

    it('creates conversation with correct expiration', async () => {
      (isAgentEnabled as any).mockResolvedValue(true);
      (getAgentConfig as any).mockResolvedValue({ ...DEFAULT_CONFIG, expirationHours: 48 });
      mockStorage.getBusiness.mockResolvedValue(BUSINESS);
      mockStorage.getAppointment.mockResolvedValue(APPOINTMENT);
      mockStorage.getCustomer.mockResolvedValue(CUSTOMER);
      mockStorage.getAgentActivityLogs.mockResolvedValue([]);
      mockStorage.createSmsConversation.mockResolvedValue({ id: 1 });
      mockSendSms.mockResolvedValue(undefined);
      mockLogAgentAction.mockResolvedValue(undefined);

      await triggerNoShowSms(100, 1);

      expect(mockStorage.createSmsConversation).toHaveBeenCalledWith(
        expect.objectContaining({
          businessId: 1,
          customerId: CUSTOMER.id,
          agentType: 'no_show',
          state: 'awaiting_reply',
          context: { expectedReplies: ['YES', 'NO'] },
        }),
      );
    });

    it('returns gracefully on unexpected error', async () => {
      (isAgentEnabled as any).mockRejectedValue(new Error('DB connection failed'));

      const result = await triggerNoShowSms(100, 1);

      expect(result.sent).toBe(false);
      expect(result.reason).toBe('unexpected error');
    });
  });

  describe('handleNoShowReply', () => {
    const conversation = {
      id: 50,
      businessId: 1,
      customerId: 10,
      agentType: 'no_show',
      referenceType: 'appointment',
      referenceId: 100,
      state: 'awaiting_reply',
    } as any;

    beforeEach(() => {
      (getAgentConfig as any).mockResolvedValue(DEFAULT_CONFIG);
      mockStorage.getBusiness.mockResolvedValue(BUSINESS);
    });

    it('sends reschedule reply on positive response (YES)', async () => {
      const result = await handleNoShowReply(conversation, 'YES', CUSTOMER as any, 1);

      expect(result).not.toBeNull();
      expect(result!.replyMessage).toContain('Book online');
      expect(mockStorage.updateSmsConversation).toHaveBeenCalledWith(50, { state: 'resolved' });
    });

    it.each(['yeah', 'Sure', 'ok', 'PLEASE', 'yep'])(
      'recognizes positive response: "%s"',
      async (reply) => {
        (getAgentConfig as any).mockResolvedValue(DEFAULT_CONFIG);
        mockStorage.getBusiness.mockResolvedValue(BUSINESS);

        const result = await handleNoShowReply(conversation, reply, CUSTOMER as any, 1);
        expect(result).not.toBeNull();
        expect(result!.replyMessage).toBeDefined();
        expect(result!.replyMessage).not.toContain('Reply YES or NO');
      },
    );

    it('sends decline reply on negative response (NO)', async () => {
      const result = await handleNoShowReply(conversation, 'NO', CUSTOMER as any, 1);

      expect(result).not.toBeNull();
      expect(result!.replyMessage).toContain('No problem');
      expect(mockStorage.updateSmsConversation).toHaveBeenCalledWith(50, { state: 'resolved' });
    });

    it('recognizes variations of negative responses', async () => {
      for (const reply of ['nope', 'Nah', 'NEVERMIND', 'not now']) {
        vi.clearAllMocks();
        (getAgentConfig as any).mockResolvedValue(DEFAULT_CONFIG);
        mockStorage.getBusiness.mockResolvedValue(BUSINESS);

        const result = await handleNoShowReply(conversation, reply, CUSTOMER as any, 1);
        expect(result).not.toBeNull();
        expect(result!.replyMessage).toContain('No problem');
      }
    });

    it('asks for clarification on ambiguous reply', async () => {
      const result = await handleNoShowReply(conversation, 'what time?', CUSTOMER as any, 1);

      expect(result).not.toBeNull();
      expect(result!.replyMessage).toContain('Reply YES or NO');
      expect(mockStorage.updateSmsConversation).not.toHaveBeenCalled();
    });

    it('returns null if business not found', async () => {
      mockStorage.getBusiness.mockResolvedValue(null);

      const result = await handleNoShowReply(conversation, 'YES', CUSTOMER as any, 1);

      expect(result).toBeNull();
    });

    it('handles STOP request by opting customer out (TCPA)', async () => {
      mockStorage.updateCustomer.mockResolvedValue(undefined);

      const result = await handleNoShowReply(conversation, 'STOP', CUSTOMER as any, 1);

      expect(result).not.toBeNull();
      expect(result!.replyMessage).toContain('unsubscribed');
      expect(mockStorage.updateSmsConversation).toHaveBeenCalledWith(50, { state: 'resolved' });
      expect(mockStorage.updateCustomer).toHaveBeenCalledWith(10, { marketingOptIn: false });
    });
  });

  describe('processExpiredConversations', () => {
    it('expires timed-out conversations', async () => {
      const expired = [
        { id: 1, businessId: 1, agentType: 'no_show', customerId: 10, referenceType: 'appointment', referenceId: 100 },
        { id: 2, businessId: 1, agentType: 'no_show', customerId: 11, referenceType: 'appointment', referenceId: 101 },
      ];
      mockStorage.getExpiredConversations.mockResolvedValue(expired);
      mockStorage.updateSmsConversation.mockResolvedValue(undefined);
      mockLogAgentAction.mockResolvedValue(undefined);

      await processExpiredConversations();

      expect(mockStorage.updateSmsConversation).toHaveBeenCalledTimes(2);
      expect(mockStorage.updateSmsConversation).toHaveBeenCalledWith(1, { state: 'expired' });
      expect(mockStorage.updateSmsConversation).toHaveBeenCalledWith(2, { state: 'expired' });
      expect(mockLogAgentAction).toHaveBeenCalledTimes(2);
    });

    it('does nothing when no conversations are expired', async () => {
      mockStorage.getExpiredConversations.mockResolvedValue([]);

      await processExpiredConversations();

      expect(mockStorage.updateSmsConversation).not.toHaveBeenCalled();
    });

    it('handles errors gracefully', async () => {
      mockStorage.getExpiredConversations.mockRejectedValue(new Error('DB error'));

      // Should not throw
      await processExpiredConversations();
    });
  });
});
