import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Mocks ──

const { mockStorage, mockSendSms, mockLogAgentAction } = vi.hoisted(() => ({
  mockStorage: {
    getBusiness: vi.fn(),
    getAppointment: vi.fn(),
    getJob: vi.fn(),
    getCustomer: vi.fn(),
    getAgentSettings: vi.fn(),
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

import { triggerFollowUp } from './followUpAgentService';
import { isAgentEnabled, getAgentConfig } from './agentSettingsService';

// ── Test Data ──

const BUSINESS = { id: 1, name: 'Test Barber', phone: '+15551234567', bookingSlug: 'test-barber' };
const CUSTOMER = { id: 10, firstName: 'Jane', phone: '+15559876543', smsOptIn: true };
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
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does nothing when agent is disabled', async () => {
    (isAgentEnabled as any).mockResolvedValue(false);

    await triggerFollowUp('appointment', 100, 1);

    expect(mockSendSms).not.toHaveBeenCalled();
  });

  it('does nothing when business not found', async () => {
    (isAgentEnabled as any).mockResolvedValue(true);
    (getAgentConfig as any).mockResolvedValue(DEFAULT_CONFIG);
    mockStorage.getBusiness.mockResolvedValue(null);

    await triggerFollowUp('appointment', 100, 1);

    expect(mockSendSms).not.toHaveBeenCalled();
  });

  it('does nothing when appointment is not completed', async () => {
    (isAgentEnabled as any).mockResolvedValue(true);
    (getAgentConfig as any).mockResolvedValue(DEFAULT_CONFIG);
    mockStorage.getBusiness.mockResolvedValue(BUSINESS);
    mockStorage.getAppointment.mockResolvedValue({ ...COMPLETED_APPOINTMENT, status: 'scheduled' });

    await triggerFollowUp('appointment', 100, 1);

    expect(mockSendSms).not.toHaveBeenCalled();
  });

  it('does nothing when customer has no phone', async () => {
    (isAgentEnabled as any).mockResolvedValue(true);
    (getAgentConfig as any).mockResolvedValue(DEFAULT_CONFIG);
    mockStorage.getBusiness.mockResolvedValue(BUSINESS);
    mockStorage.getAppointment.mockResolvedValue(COMPLETED_APPOINTMENT);
    mockStorage.getCustomer.mockResolvedValue({ ...CUSTOMER, phone: null });

    await triggerFollowUp('appointment', 100, 1);

    expect(mockSendSms).not.toHaveBeenCalled();
  });

  it('does nothing when customer has not opted into SMS', async () => {
    (isAgentEnabled as any).mockResolvedValue(true);
    (getAgentConfig as any).mockResolvedValue(DEFAULT_CONFIG);
    mockStorage.getBusiness.mockResolvedValue(BUSINESS);
    mockStorage.getAppointment.mockResolvedValue(COMPLETED_APPOINTMENT);
    mockStorage.getCustomer.mockResolvedValue({ ...CUSTOMER, smsOptIn: false });

    await triggerFollowUp('appointment', 100, 1);

    expect(mockSendSms).not.toHaveBeenCalled();
  });

  it('schedules thank-you SMS for completed appointment', async () => {
    (isAgentEnabled as any).mockResolvedValue(true);
    (getAgentConfig as any).mockResolvedValue(DEFAULT_CONFIG);
    mockStorage.getBusiness.mockResolvedValue(BUSINESS);
    mockStorage.getAppointment.mockResolvedValue(COMPLETED_APPOINTMENT);
    mockStorage.getCustomer.mockResolvedValue(CUSTOMER);
    mockSendSms.mockResolvedValue(undefined);
    mockLogAgentAction.mockResolvedValue(undefined);

    await triggerFollowUp('appointment', 100, 1);

    // The SMS is scheduled via setTimeout — advance timers to fire it
    await vi.advanceTimersByTimeAsync(1);

    expect(mockSendSms).toHaveBeenCalledWith(
      CUSTOMER.phone,
      expect.stringContaining('Jane'),
      undefined,
      BUSINESS.id,
    );
    expect(mockLogAgentAction).toHaveBeenCalledWith(
      expect.objectContaining({
        agentType: 'follow_up',
        action: 'sms_sent',
        details: expect.objectContaining({ messageType: 'thank_you' }),
      }),
    );
  });

  it('schedules upsell SMS for completed appointment', async () => {
    (isAgentEnabled as any).mockResolvedValue(true);
    (getAgentConfig as any).mockResolvedValue(DEFAULT_CONFIG);
    mockStorage.getBusiness.mockResolvedValue(BUSINESS);
    mockStorage.getAppointment.mockResolvedValue(COMPLETED_APPOINTMENT);
    mockStorage.getCustomer.mockResolvedValue(CUSTOMER);
    mockSendSms.mockResolvedValue(undefined);
    mockLogAgentAction.mockResolvedValue(undefined);

    await triggerFollowUp('appointment', 100, 1);

    // Advance past both timers
    await vi.advanceTimersByTimeAsync(1);

    // Should have sent both thank-you and upsell (both delay = 0)
    expect(mockSendSms).toHaveBeenCalledTimes(2);
    const upsellCall = mockSendSms.mock.calls[1];
    expect(upsellCall[0]).toBe(CUSTOMER.phone);
  });

  it('handles job entity type correctly', async () => {
    (isAgentEnabled as any).mockResolvedValue(true);
    (getAgentConfig as any).mockResolvedValue(DEFAULT_CONFIG);
    mockStorage.getBusiness.mockResolvedValue(BUSINESS);
    mockStorage.getJob.mockResolvedValue(COMPLETED_JOB);
    mockStorage.getCustomer.mockResolvedValue(CUSTOMER);
    mockSendSms.mockResolvedValue(undefined);
    mockLogAgentAction.mockResolvedValue(undefined);

    await triggerFollowUp('job', 200, 1);

    await vi.advanceTimersByTimeAsync(1);

    expect(mockSendSms).toHaveBeenCalled();
    expect(mockLogAgentAction).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceType: 'job',
        referenceId: 200,
      }),
    );
  });

  it('skips upsell when enableUpsell is false', async () => {
    (isAgentEnabled as any).mockResolvedValue(true);
    (getAgentConfig as any).mockResolvedValue({ ...DEFAULT_CONFIG, enableUpsell: false });
    mockStorage.getBusiness.mockResolvedValue(BUSINESS);
    mockStorage.getAppointment.mockResolvedValue(COMPLETED_APPOINTMENT);
    mockStorage.getCustomer.mockResolvedValue(CUSTOMER);
    mockSendSms.mockResolvedValue(undefined);
    mockLogAgentAction.mockResolvedValue(undefined);

    await triggerFollowUp('appointment', 100, 1);

    await vi.advanceTimersByTimeAsync(1);

    // Only thank-you, not upsell
    expect(mockSendSms).toHaveBeenCalledTimes(1);
  });

  it('skips thank-you when enableThankYou is false', async () => {
    (isAgentEnabled as any).mockResolvedValue(true);
    (getAgentConfig as any).mockResolvedValue({ ...DEFAULT_CONFIG, enableThankYou: false });
    mockStorage.getBusiness.mockResolvedValue(BUSINESS);
    mockStorage.getAppointment.mockResolvedValue(COMPLETED_APPOINTMENT);
    mockStorage.getCustomer.mockResolvedValue(CUSTOMER);
    mockSendSms.mockResolvedValue(undefined);
    mockLogAgentAction.mockResolvedValue(undefined);

    await triggerFollowUp('appointment', 100, 1);

    await vi.advanceTimersByTimeAsync(1);

    // Only upsell, not thank-you
    expect(mockSendSms).toHaveBeenCalledTimes(1);
  });
});
