import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──

const { mockStorage, mockSendSms, mockLogAgentAction } = vi.hoisted(() => ({
  mockStorage: {
    getBusiness: vi.fn(),
    getAllBusinesses: vi.fn(),
    getAppointment: vi.fn(),
    getJob: vi.fn(),
    getCustomer: vi.fn(),
    getAgentSettings: vi.fn(),
    getAgentActivityLogs: vi.fn(),
  },
  mockSendSms: vi.fn(),
  mockLogAgentAction: vi.fn(),
}));

vi.mock('../storage', () => ({ storage: mockStorage }));
vi.mock('./twilioService', () => ({ sendSms: mockSendSms }));
vi.mock('./agentActivityService', () => ({ logAgentAction: mockLogAgentAction }));

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

import { triggerFollowUp, runFollowUpCheck } from './followUpAgentService';
import { isAgentEnabled, getAgentConfig } from './agentSettingsService';

// ── Test Data ──

const BUSINESS = { id: 1, name: 'Test Barber', phone: '+15551234567', bookingSlug: 'test-barber' };
const CUSTOMER = { id: 10, firstName: 'Jane', phone: '+15559876543', smsOptIn: true, marketingOptIn: true };
const COMPLETED_APPOINTMENT = { id: 100, businessId: 1, customerId: 10, status: 'completed' };
const COMPLETED_JOB = { id: 200, businessId: 1, customerId: 10, status: 'completed', title: 'Haircut' };
const DEFAULT_CONFIG = {
  thankYouTemplate: 'Hi {customerName}! Thank you for choosing {businessName}.',
  upsellTemplate: 'Hi {customerName}, ready to book your next visit? {bookingLink}',
  thankYouDelayMinutes: 0, // immediate for testing
  upsellDelayHours: 0,     // immediate for testing
  enableThankYou: true,
  enableUpsell: true,
};

describe('followUpAgentService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('triggerFollowUp (queueing)', () => {
    it('does nothing when agent is disabled', async () => {
      (isAgentEnabled as any).mockResolvedValue(false);

      await triggerFollowUp('appointment', 100, 1);

      expect(mockLogAgentAction).not.toHaveBeenCalled();
    });

    it('does nothing when business not found', async () => {
      (isAgentEnabled as any).mockResolvedValue(true);
      (getAgentConfig as any).mockResolvedValue(DEFAULT_CONFIG);
      mockStorage.getBusiness.mockResolvedValue(null);

      await triggerFollowUp('appointment', 100, 1);

      expect(mockLogAgentAction).not.toHaveBeenCalled();
    });

    it('does nothing when appointment is not completed', async () => {
      (isAgentEnabled as any).mockResolvedValue(true);
      (getAgentConfig as any).mockResolvedValue(DEFAULT_CONFIG);
      mockStorage.getBusiness.mockResolvedValue(BUSINESS);
      mockStorage.getAppointment.mockResolvedValue({ ...COMPLETED_APPOINTMENT, status: 'scheduled' });

      await triggerFollowUp('appointment', 100, 1);

      expect(mockLogAgentAction).not.toHaveBeenCalled();
    });

    it('does nothing when customer has no phone', async () => {
      (isAgentEnabled as any).mockResolvedValue(true);
      (getAgentConfig as any).mockResolvedValue(DEFAULT_CONFIG);
      mockStorage.getBusiness.mockResolvedValue(BUSINESS);
      mockStorage.getAppointment.mockResolvedValue(COMPLETED_APPOINTMENT);
      mockStorage.getCustomer.mockResolvedValue({ ...CUSTOMER, phone: null });

      await triggerFollowUp('appointment', 100, 1);

      expect(mockLogAgentAction).not.toHaveBeenCalled();
    });

    it('does nothing when customer has not opted into marketing', async () => {
      (isAgentEnabled as any).mockResolvedValue(true);
      (getAgentConfig as any).mockResolvedValue(DEFAULT_CONFIG);
      mockStorage.getBusiness.mockResolvedValue(BUSINESS);
      mockStorage.getAppointment.mockResolvedValue(COMPLETED_APPOINTMENT);
      mockStorage.getCustomer.mockResolvedValue({ ...CUSTOMER, marketingOptIn: false });

      await triggerFollowUp('appointment', 100, 1);

      expect(mockLogAgentAction).not.toHaveBeenCalled();
    });

    it('queues follow-up for completed appointment', async () => {
      (isAgentEnabled as any).mockResolvedValue(true);
      (getAgentConfig as any).mockResolvedValue(DEFAULT_CONFIG);
      mockStorage.getBusiness.mockResolvedValue(BUSINESS);
      mockStorage.getAppointment.mockResolvedValue(COMPLETED_APPOINTMENT);
      mockStorage.getCustomer.mockResolvedValue(CUSTOMER);
      mockStorage.getAgentActivityLogs.mockResolvedValue([]);
      mockLogAgentAction.mockResolvedValue(undefined);

      await triggerFollowUp('appointment', 100, 1);

      expect(mockLogAgentAction).toHaveBeenCalledWith(
        expect.objectContaining({
          agentType: 'follow_up',
          action: 'follow_up_queued',
          referenceType: 'appointment',
          referenceId: 100,
        }),
      );
    });

    it('handles job entity type correctly', async () => {
      (isAgentEnabled as any).mockResolvedValue(true);
      (getAgentConfig as any).mockResolvedValue(DEFAULT_CONFIG);
      mockStorage.getBusiness.mockResolvedValue(BUSINESS);
      mockStorage.getJob.mockResolvedValue(COMPLETED_JOB);
      mockStorage.getCustomer.mockResolvedValue(CUSTOMER);
      mockStorage.getAgentActivityLogs.mockResolvedValue([]);
      mockLogAgentAction.mockResolvedValue(undefined);

      await triggerFollowUp('job', 200, 1);

      expect(mockLogAgentAction).toHaveBeenCalledWith(
        expect.objectContaining({
          referenceType: 'job',
          referenceId: 200,
        }),
      );
    });

    it('prevents duplicate queueing (idempotency)', async () => {
      (isAgentEnabled as any).mockResolvedValue(true);
      (getAgentConfig as any).mockResolvedValue(DEFAULT_CONFIG);
      mockStorage.getBusiness.mockResolvedValue(BUSINESS);
      mockStorage.getAppointment.mockResolvedValue(COMPLETED_APPOINTMENT);
      mockStorage.getCustomer.mockResolvedValue(CUSTOMER);
      mockStorage.getAgentActivityLogs.mockResolvedValue([
        { referenceType: 'appointment', referenceId: 100, action: 'follow_up_queued' },
      ]);

      await triggerFollowUp('appointment', 100, 1);

      // Should NOT log another queued action
      expect(mockLogAgentAction).not.toHaveBeenCalled();
    });
  });

  describe('runFollowUpCheck (scheduler)', () => {
    it('sends thank-you for queued items past delay', async () => {
      (isAgentEnabled as any).mockResolvedValue(true);
      (getAgentConfig as any).mockResolvedValue(DEFAULT_CONFIG);
      mockStorage.getAllBusinesses.mockResolvedValue([BUSINESS]);
      mockStorage.getBusiness.mockResolvedValue(BUSINESS);
      mockStorage.getCustomer.mockResolvedValue(CUSTOMER);
      mockSendSms.mockResolvedValue(undefined);
      mockLogAgentAction.mockResolvedValue(undefined);

      // Queued item from 1 minute ago (delay is 0, so it should fire)
      mockStorage.getAgentActivityLogs.mockResolvedValue([
        {
          action: 'follow_up_queued',
          referenceType: 'appointment',
          referenceId: 100,
          customerId: 10,
          createdAt: new Date(Date.now() - 60 * 1000).toISOString(),
        },
      ]);

      await runFollowUpCheck();

      expect(mockSendSms).toHaveBeenCalledWith(
        CUSTOMER.phone,
        expect.stringContaining('Jane'),
        undefined,
        BUSINESS.id,
      );
    });

    it('skips disabled businesses', async () => {
      (isAgentEnabled as any).mockResolvedValue(false);
      mockStorage.getAllBusinesses.mockResolvedValue([BUSINESS]);

      await runFollowUpCheck();

      expect(mockSendSms).not.toHaveBeenCalled();
    });

    it('skips items already sent', async () => {
      (isAgentEnabled as any).mockResolvedValue(true);
      (getAgentConfig as any).mockResolvedValue(DEFAULT_CONFIG);
      mockStorage.getAllBusinesses.mockResolvedValue([BUSINESS]);
      mockStorage.getBusiness.mockResolvedValue(BUSINESS);

      // Both queued AND already sent
      mockStorage.getAgentActivityLogs.mockResolvedValue([
        {
          action: 'follow_up_queued',
          referenceType: 'appointment',
          referenceId: 100,
          customerId: 10,
          createdAt: new Date(Date.now() - 60 * 1000).toISOString(),
        },
        {
          action: 'sms_sent',
          referenceType: 'appointment',
          referenceId: 100,
          customerId: 10,
          createdAt: new Date().toISOString(),
          details: { messageType: 'thank_you' },
        },
        {
          action: 'sms_sent',
          referenceType: 'appointment',
          referenceId: 100,
          customerId: 10,
          createdAt: new Date().toISOString(),
          details: { messageType: 'upsell' },
        },
      ]);

      await runFollowUpCheck();

      // Should NOT send again
      expect(mockSendSms).not.toHaveBeenCalled();
    });
  });
});
