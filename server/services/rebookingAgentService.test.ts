import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──

const { mockStorage, mockSendSms, mockLogAgentAction } = vi.hoisted(() => ({
  mockStorage: {
    getBusiness: vi.fn(),
    getAllBusinesses: vi.fn(),
    getCustomers: vi.fn(),
    getCustomer: vi.fn(),
    getJobs: vi.fn(),
    getAppointments: vi.fn(),
    getAgentSettings: vi.fn(),
    getAgentActivityLogs: vi.fn(),
    getActiveSmsConversation: vi.fn(),
    createSmsConversation: vi.fn(),
    updateSmsConversation: vi.fn(),
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

import { handleRebookingReply } from './rebookingAgentService';
import { isAgentEnabled, getAgentConfig } from './agentSettingsService';

// ── Test Data ──

const BUSINESS = { id: 1, name: 'Test Salon', phone: '+15551234567', bookingSlug: 'test-salon' };
const CUSTOMER = { id: 10, firstName: 'Alice', phone: '+15559876543', smsOptIn: true };
const DEFAULT_CONFIG = {
  defaultIntervalDays: 42,
  serviceIntervals: {},
  messageTemplate: 'Hi {customerName}! It\'s been {daysSinceVisit} days since your last {serviceName}. Reply YES!',
  bookingReplyTemplate: 'Awesome! Book here: {bookingLink} or call {businessPhone}',
  declineReplyTemplate: 'No worries! We\'ll be here when you\'re ready. - {businessName}',
};

describe('rebookingAgentService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('handleRebookingReply', () => {
    const conversation = {
      id: 50,
      businessId: 1,
      customerId: 10,
      agentType: 'rebooking',
      referenceType: 'customer',
      referenceId: 10,
      state: 'awaiting_reply',
    } as any;

    beforeEach(() => {
      (getAgentConfig as any).mockResolvedValue(DEFAULT_CONFIG);
      mockStorage.getBusiness.mockResolvedValue(BUSINESS);
    });

    it('sends booking reply on positive response (YES)', async () => {
      const result = await handleRebookingReply(conversation, 'YES', CUSTOMER as any, 1);

      expect(result).not.toBeNull();
      expect(result!.replyMessage).toContain('Book here');
      expect(mockStorage.updateSmsConversation).toHaveBeenCalledWith(50, { state: 'resolved' });
    });

    it('sends decline reply on negative response (NO)', async () => {
      const result = await handleRebookingReply(conversation, 'NO', CUSTOMER as any, 1);

      expect(result).not.toBeNull();
      expect(result!.replyMessage).toContain('No worries');
      expect(mockStorage.updateSmsConversation).toHaveBeenCalledWith(50, { state: 'resolved' });
    });

    it.each(['yeah', 'SURE', 'BOOK', 'ok', 'please'])(
      'recognizes positive response: "%s"',
      async (reply) => {
        (getAgentConfig as any).mockResolvedValue(DEFAULT_CONFIG);
        mockStorage.getBusiness.mockResolvedValue(BUSINESS);

        const result = await handleRebookingReply(conversation, reply, CUSTOMER as any, 1);
        expect(result).not.toBeNull();
        expect(result!.replyMessage).toBeDefined();
        expect(result!.replyMessage).not.toContain('Reply YES or NO');
      },
    );

    it('recognizes negative variants: nope, nah, later, stop', async () => {
      for (const reply of ['nope', 'NAH', 'later', 'STOP']) {
        vi.clearAllMocks();
        (getAgentConfig as any).mockResolvedValue(DEFAULT_CONFIG);
        mockStorage.getBusiness.mockResolvedValue(BUSINESS);

        const result = await handleRebookingReply(conversation, reply, CUSTOMER as any, 1);
        expect(result).not.toBeNull();
        expect(result!.replyMessage).toContain('No worries');
      }
    });

    it('asks for clarification on ambiguous reply', async () => {
      const result = await handleRebookingReply(conversation, 'hmm idk', CUSTOMER as any, 1);

      expect(result).not.toBeNull();
      expect(result!.replyMessage).toContain('Reply YES or NO');
      expect(mockStorage.updateSmsConversation).not.toHaveBeenCalled();
    });

    it('returns null when business not found', async () => {
      mockStorage.getBusiness.mockResolvedValue(null);

      const result = await handleRebookingReply(conversation, 'YES', CUSTOMER as any, 1);

      expect(result).toBeNull();
    });

    it('handles conflicting positive/negative words as ambiguous', async () => {
      // "yes but no" contains both — should be treated as ambiguous
      const result = await handleRebookingReply(conversation, 'yes but no', CUSTOMER as any, 1);

      expect(result).not.toBeNull();
      expect(result!.replyMessage).toContain('Reply YES or NO');
    });
  });
});
