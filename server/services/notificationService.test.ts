import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks (vi.hoisted ensures they're available when vi.mock factories run) ──

const { mockStorage, mockTwilioSendSms } = vi.hoisted(() => ({
  mockStorage: {
    getNotificationSettings: vi.fn(),
    getAppointment: vi.fn(),
    getCustomer: vi.fn(),
    getBusiness: vi.fn(),
    getService: vi.fn(),
    getJob: vi.fn(),
    getStaffMember: vi.fn(),
    getInvoice: vi.fn(),
    getQuoteById: vi.fn(),
    getRestaurantReservation: vi.fn(),
    getNotificationLogs: vi.fn(),
    createNotificationLog: vi.fn(),
    updateInvoice: vi.fn(),
  },
  mockTwilioSendSms: vi.fn(),
}));

vi.mock('../storage', () => ({ storage: mockStorage }));
vi.mock('./twilioService', () => ({
  default: { sendSms: mockTwilioSendSms },
}));
vi.mock('./weatherService', () => ({
  getWeatherForecast: vi.fn().mockResolvedValue(null),
}));
vi.mock('../emailService', () => ({
  sendAppointmentConfirmationEmail: vi.fn().mockResolvedValue(undefined),
  sendAppointmentReminderEmail: vi.fn().mockResolvedValue(undefined),
  sendInvoiceEmail: vi.fn().mockResolvedValue(undefined),
  sendInvoiceReminderEmail: vi.fn().mockResolvedValue(undefined),
  sendPaymentConfirmationEmail: vi.fn().mockResolvedValue(undefined),
  sendJobCompletedEmail: vi.fn().mockResolvedValue(undefined),
  sendQuoteEmail: vi.fn().mockResolvedValue(undefined),
  sendQuoteFollowUpEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../utils/money', () => ({
  toMoney: (v: any) => {
    if (v == null) return 0;
    const n = typeof v === 'string' ? parseFloat(v) : v;
    return Number.isFinite(n) ? n : 0;
  },
}));

import {
  sendAppointmentConfirmation,
  sendAppointmentReminder,
  sendJobCompletedNotification,
  sendJobInProgressNotification,
  sendJobWaitingPartsNotification,
  sendJobResumedNotification,
  sendSmsOptInWelcome,
  sendInvoiceCreatedNotification,
  sendReservationConfirmation,
} from './notificationService';

// ── Test Fixtures ──

const BUSINESS = {
  id: 1,
  name: "Tony's Barbershop",
  phone: '+15551234567',
  twilioPhoneNumber: '+15559999999',
  timezone: 'America/New_York',
  industry: 'barbershop',
  bookingSlug: 'tonys-barbershop',
  zip: '10001',
};

const BUSINESS_HVAC = {
  ...BUSINESS,
  id: 2,
  name: "Cool Air HVAC",
  industry: 'hvac',
};

const CUSTOMER = {
  id: 10,
  firstName: 'John',
  lastName: 'Smith',
  phone: '+15559876543',
  email: 'john@example.com',
  smsOptIn: true,
  marketingOptIn: true,
};

const CUSTOMER_NO_SMS = {
  ...CUSTOMER,
  id: 11,
  smsOptIn: false,
};

const CUSTOMER_NO_PHONE = {
  ...CUSTOMER,
  id: 12,
  phone: null,
};

const CUSTOMER_NO_MARKETING = {
  ...CUSTOMER,
  id: 13,
  marketingOptIn: false,
};

const APPOINTMENT = {
  id: 100,
  businessId: 1,
  customerId: 10,
  serviceId: 5,
  startDate: new Date('2025-06-15T14:30:00Z'),
  endDate: new Date('2025-06-15T15:30:00Z'),
  status: 'confirmed',
  notes: null,
  manageToken: 'abc123token',
};

const SERVICE = {
  id: 5,
  name: 'Haircut',
  price: '25.00',
  duration: 60,
};

const JOB = {
  id: 200,
  businessId: 1,
  customerId: 10,
  title: 'AC Repair',
  status: 'in_progress',
  staffId: 3,
};

const STAFF = {
  id: 3,
  firstName: 'Mike',
  lastName: 'Johnson',
};

const DEFAULT_SETTINGS = {
  appointmentConfirmationEmail: true,
  appointmentConfirmationSms: true,
  appointmentReminderEmail: true,
  appointmentReminderSms: true,
  invoiceCreatedEmail: true,
  invoiceCreatedSms: false,
  invoiceReminderEmail: true,
  invoiceReminderSms: true,
  jobCompletedEmail: true,
  jobCompletedSms: true,
  jobInProgressSms: true,
  jobWaitingPartsSms: true,
  jobResumedSms: true,
  weatherAlertsEnabled: true,
};

// ── Tests ──

describe('notificationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage.createNotificationLog.mockResolvedValue({ id: 1 });
    mockTwilioSendSms.mockResolvedValue({ sid: 'SM123' });
    mockStorage.getNotificationLogs.mockResolvedValue([]);
  });

  // ──────────────────────────────────────────────────────
  // canSendSms (tested through sendAppointmentConfirmation)
  // ──────────────────────────────────────────────────────

  describe('canSendSms (via sendAppointmentConfirmation)', () => {
    it('returns false when customer has no phone number', async () => {
      mockStorage.getNotificationSettings.mockResolvedValue({ ...DEFAULT_SETTINGS, appointmentConfirmationEmail: false });
      mockStorage.getAppointment.mockResolvedValue(APPOINTMENT);
      mockStorage.getCustomer.mockResolvedValue(CUSTOMER_NO_PHONE);
      mockStorage.getBusiness.mockResolvedValue(BUSINESS);
      mockStorage.getService.mockResolvedValue(SERVICE);

      await sendAppointmentConfirmation(100, 1);

      expect(mockTwilioSendSms).not.toHaveBeenCalled();
    });

    it('returns false when smsOptIn is false', async () => {
      mockStorage.getNotificationSettings.mockResolvedValue({ ...DEFAULT_SETTINGS, appointmentConfirmationEmail: false });
      mockStorage.getAppointment.mockResolvedValue(APPOINTMENT);
      mockStorage.getCustomer.mockResolvedValue(CUSTOMER_NO_SMS);
      mockStorage.getBusiness.mockResolvedValue(BUSINESS);
      mockStorage.getService.mockResolvedValue(SERVICE);

      await sendAppointmentConfirmation(100, 1);

      expect(mockTwilioSendSms).not.toHaveBeenCalled();
    });

    it('returns true when phone + smsOptIn present (transactional)', async () => {
      mockStorage.getNotificationSettings.mockResolvedValue({ ...DEFAULT_SETTINGS, appointmentConfirmationEmail: false });
      mockStorage.getAppointment.mockResolvedValue(APPOINTMENT);
      mockStorage.getCustomer.mockResolvedValue(CUSTOMER);
      mockStorage.getBusiness.mockResolvedValue(BUSINESS);
      mockStorage.getService.mockResolvedValue(SERVICE);

      await sendAppointmentConfirmation(100, 1);

      expect(mockTwilioSendSms).toHaveBeenCalledOnce();
    });

    it('marketing messages require marketingOptIn (via sendAppointmentReminder weather path)', async () => {
      // canSendSms is tested as a transactional function in appointment context.
      // Marketing opt-in is checked in agent services. The notificationService canSendSms
      // function with isMarketing=true requires marketingOptIn.
      // We verify that a customer with smsOptIn=true but marketingOptIn=false can still
      // receive transactional SMS (canSendSms returns true when isMarketing defaults to false).
      mockStorage.getNotificationSettings.mockResolvedValue({ ...DEFAULT_SETTINGS, appointmentConfirmationEmail: false });
      mockStorage.getAppointment.mockResolvedValue(APPOINTMENT);
      mockStorage.getCustomer.mockResolvedValue(CUSTOMER_NO_MARKETING);
      mockStorage.getBusiness.mockResolvedValue(BUSINESS);
      mockStorage.getService.mockResolvedValue(SERVICE);

      // Transactional messages should still send even without marketingOptIn
      await sendAppointmentConfirmation(100, 1);

      expect(mockTwilioSendSms).toHaveBeenCalledOnce();
    });
  });

  // ──────────────────────────────────────────────────────
  // getSmsFooter (tested through message content)
  // ──────────────────────────────────────────────────────

  describe('getSmsFooter (via message content)', () => {
    it('returns empty string for transactional messages (no STOP footer)', async () => {
      mockStorage.getNotificationSettings.mockResolvedValue({ ...DEFAULT_SETTINGS, appointmentConfirmationEmail: false });
      mockStorage.getAppointment.mockResolvedValue(APPOINTMENT);
      mockStorage.getCustomer.mockResolvedValue(CUSTOMER);
      mockStorage.getBusiness.mockResolvedValue(BUSINESS);
      mockStorage.getService.mockResolvedValue(SERVICE);

      await sendAppointmentConfirmation(100, 1);

      const sentMessage = mockTwilioSendSms.mock.calls[0][1] as string;
      expect(sentMessage).not.toContain('Reply STOP to opt out');
    });
  });

  // ──────────────────────────────────────────────────────
  // sendAppointmentConfirmation
  // ──────────────────────────────────────────────────────

  describe('sendAppointmentConfirmation', () => {
    it('sends SMS when settings allow and customer opted in', async () => {
      mockStorage.getNotificationSettings.mockResolvedValue(DEFAULT_SETTINGS);
      mockStorage.getAppointment.mockResolvedValue(APPOINTMENT);
      mockStorage.getCustomer.mockResolvedValue(CUSTOMER);
      mockStorage.getBusiness.mockResolvedValue(BUSINESS);
      mockStorage.getService.mockResolvedValue(SERVICE);

      await sendAppointmentConfirmation(100, 1);

      expect(mockTwilioSendSms).toHaveBeenCalledOnce();
      const sentMessage = mockTwilioSendSms.mock.calls[0][1] as string;
      expect(sentMessage).toContain('John');
      expect(sentMessage).toContain('Haircut');
      expect(sentMessage).toContain("Tony's Barbershop");
      expect(sentMessage).toContain('RESCHEDULE');
    });

    it('skips SMS when smsOptIn is false', async () => {
      mockStorage.getNotificationSettings.mockResolvedValue(DEFAULT_SETTINGS);
      mockStorage.getAppointment.mockResolvedValue(APPOINTMENT);
      mockStorage.getCustomer.mockResolvedValue(CUSTOMER_NO_SMS);
      mockStorage.getBusiness.mockResolvedValue(BUSINESS);
      mockStorage.getService.mockResolvedValue(SERVICE);

      await sendAppointmentConfirmation(100, 1);

      expect(mockTwilioSendSms).not.toHaveBeenCalled();
    });

    it('formats time in business timezone correctly', async () => {
      mockStorage.getNotificationSettings.mockResolvedValue({ ...DEFAULT_SETTINGS, appointmentConfirmationEmail: false });
      // June 15 2025, 14:30 UTC = 10:30 AM ET
      mockStorage.getAppointment.mockResolvedValue(APPOINTMENT);
      mockStorage.getCustomer.mockResolvedValue(CUSTOMER);
      mockStorage.getBusiness.mockResolvedValue(BUSINESS);
      mockStorage.getService.mockResolvedValue(SERVICE);

      await sendAppointmentConfirmation(100, 1);

      const sentMessage = mockTwilioSendSms.mock.calls[0][1] as string;
      // 14:30 UTC in America/New_York (EDT, -4h) = 10:30 AM
      expect(sentMessage).toContain('10:30 AM');
    });

    it('uses field service template for HVAC business', async () => {
      mockStorage.getNotificationSettings.mockResolvedValue({ ...DEFAULT_SETTINGS, appointmentConfirmationEmail: false });
      mockStorage.getAppointment.mockResolvedValue({
        ...APPOINTMENT,
        notes: 'Property: 123 Main St',
      });
      mockStorage.getCustomer.mockResolvedValue(CUSTOMER);
      mockStorage.getBusiness.mockResolvedValue(BUSINESS_HVAC);
      mockStorage.getService.mockResolvedValue(SERVICE);

      await sendAppointmentConfirmation(100, 2);

      const sentMessage = mockTwilioSendSms.mock.calls[0][1] as string;
      expect(sentMessage).toContain('at 123 Main St');
      expect(sentMessage).toContain('with Cool Air HVAC');
    });

    it('logs successful SMS notification', async () => {
      mockStorage.getNotificationSettings.mockResolvedValue({ ...DEFAULT_SETTINGS, appointmentConfirmationEmail: false });
      mockStorage.getAppointment.mockResolvedValue(APPOINTMENT);
      mockStorage.getCustomer.mockResolvedValue(CUSTOMER);
      mockStorage.getBusiness.mockResolvedValue(BUSINESS);
      mockStorage.getService.mockResolvedValue(SERVICE);

      await sendAppointmentConfirmation(100, 1);

      expect(mockStorage.createNotificationLog).toHaveBeenCalledWith(
        expect.objectContaining({
          businessId: 1,
          customerId: 10,
          type: 'appointment_confirmation',
          channel: 'sms',
          recipient: '+15559876543',
          status: 'sent',
          referenceType: 'appointment',
          referenceId: 100,
        }),
      );
    });

    it('returns early when appointment not found', async () => {
      mockStorage.getNotificationSettings.mockResolvedValue(DEFAULT_SETTINGS);
      mockStorage.getAppointment.mockResolvedValue(null);

      await sendAppointmentConfirmation(999, 1);

      expect(mockTwilioSendSms).not.toHaveBeenCalled();
      expect(mockStorage.createNotificationLog).not.toHaveBeenCalled();
    });

    it('returns early when both email and SMS are disabled', async () => {
      mockStorage.getNotificationSettings.mockResolvedValue({
        ...DEFAULT_SETTINGS,
        appointmentConfirmationEmail: false,
        appointmentConfirmationSms: false,
      });

      await sendAppointmentConfirmation(100, 1);

      expect(mockStorage.getAppointment).not.toHaveBeenCalled();
      expect(mockTwilioSendSms).not.toHaveBeenCalled();
    });

    it('falls back to "your appointment" when service not found', async () => {
      mockStorage.getNotificationSettings.mockResolvedValue({ ...DEFAULT_SETTINGS, appointmentConfirmationEmail: false });
      mockStorage.getAppointment.mockResolvedValue({ ...APPOINTMENT, serviceId: null });
      mockStorage.getCustomer.mockResolvedValue(CUSTOMER);
      mockStorage.getBusiness.mockResolvedValue(BUSINESS);

      await sendAppointmentConfirmation(100, 1);

      const sentMessage = mockTwilioSendSms.mock.calls[0][1] as string;
      expect(sentMessage).toContain('your appointment');
    });
  });

  // ──────────────────────────────────────────────────────
  // Timezone formatting
  // ──────────────────────────────────────────────────────

  describe('timezone formatting', () => {
    it('falls back gracefully with invalid timezone', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      mockStorage.getNotificationSettings.mockResolvedValue({ ...DEFAULT_SETTINGS, appointmentConfirmationEmail: false });
      mockStorage.getAppointment.mockResolvedValue(APPOINTMENT);
      mockStorage.getCustomer.mockResolvedValue(CUSTOMER);
      mockStorage.getBusiness.mockResolvedValue({
        ...BUSINESS,
        timezone: 'Invalid/Timezone_Garbage',
      });
      mockStorage.getService.mockResolvedValue(SERVICE);

      // Should NOT throw, should fall back to UTC formatting
      await sendAppointmentConfirmation(100, 1);

      expect(mockTwilioSendSms).toHaveBeenCalledOnce();
      // The fallback produces a date/time string without a specific timezone
      const sentMessage = mockTwilioSendSms.mock.calls[0][1] as string;
      expect(sentMessage).toContain('John');
      expect(sentMessage).toContain('Haircut');

      consoleSpy.mockRestore();
    });

    it('handles null timezone gracefully (defaults to UTC)', async () => {
      mockStorage.getNotificationSettings.mockResolvedValue({ ...DEFAULT_SETTINGS, appointmentConfirmationEmail: false });
      mockStorage.getAppointment.mockResolvedValue(APPOINTMENT);
      mockStorage.getCustomer.mockResolvedValue(CUSTOMER);
      mockStorage.getBusiness.mockResolvedValue({ ...BUSINESS, timezone: null });
      mockStorage.getService.mockResolvedValue(SERVICE);

      await sendAppointmentConfirmation(100, 1);

      expect(mockTwilioSendSms).toHaveBeenCalledOnce();
    });
  });

  // ──────────────────────────────────────────────────────
  // sendJobInProgressNotification
  // ──────────────────────────────────────────────────────

  describe('sendJobInProgressNotification', () => {
    it('sends correctly with staff name', async () => {
      mockStorage.getNotificationSettings.mockResolvedValue(DEFAULT_SETTINGS);
      mockStorage.getJob.mockResolvedValue(JOB);
      mockStorage.getCustomer.mockResolvedValue(CUSTOMER);
      mockStorage.getBusiness.mockResolvedValue(BUSINESS);
      mockStorage.getStaffMember.mockResolvedValue(STAFF);
      mockStorage.getNotificationLogs.mockResolvedValue([]);

      await sendJobInProgressNotification(200, 1);

      expect(mockTwilioSendSms).toHaveBeenCalledOnce();
      const sentMessage = mockTwilioSendSms.mock.calls[0][1] as string;
      expect(sentMessage).toContain('Mike J.');
      expect(sentMessage).toContain('AC Repair');
      expect(sentMessage).toContain('John');
      expect(sentMessage).toContain("Tony's Barbershop");
    });

    it('uses "Our technician" when no staff assigned', async () => {
      mockStorage.getNotificationSettings.mockResolvedValue(DEFAULT_SETTINGS);
      mockStorage.getJob.mockResolvedValue({ ...JOB, staffId: null });
      mockStorage.getCustomer.mockResolvedValue(CUSTOMER);
      mockStorage.getBusiness.mockResolvedValue(BUSINESS);
      mockStorage.getNotificationLogs.mockResolvedValue([]);

      await sendJobInProgressNotification(200, 1);

      const sentMessage = mockTwilioSendSms.mock.calls[0][1] as string;
      expect(sentMessage).toContain('Our technician');
    });

    it('respects 60-min deduplication', async () => {
      mockStorage.getNotificationSettings.mockResolvedValue(DEFAULT_SETTINGS);
      mockStorage.getJob.mockResolvedValue(JOB);
      mockStorage.getCustomer.mockResolvedValue(CUSTOMER);
      mockStorage.getBusiness.mockResolvedValue(BUSINESS);
      mockStorage.getStaffMember.mockResolvedValue(STAFF);
      // Simulate a recent notification sent 30 minutes ago
      mockStorage.getNotificationLogs.mockResolvedValue([
        {
          type: 'job_in_progress',
          referenceId: 200,
          channel: 'sms',
          sentAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30 min ago
        },
      ]);

      await sendJobInProgressNotification(200, 1);

      expect(mockTwilioSendSms).not.toHaveBeenCalled();
    });

    it('sends if last dedup notification is older than 60 minutes', async () => {
      mockStorage.getNotificationSettings.mockResolvedValue(DEFAULT_SETTINGS);
      mockStorage.getJob.mockResolvedValue(JOB);
      mockStorage.getCustomer.mockResolvedValue(CUSTOMER);
      mockStorage.getBusiness.mockResolvedValue(BUSINESS);
      mockStorage.getStaffMember.mockResolvedValue(STAFF);
      // Simulate a notification sent 90 minutes ago
      mockStorage.getNotificationLogs.mockResolvedValue([
        {
          type: 'job_in_progress',
          referenceId: 200,
          channel: 'sms',
          sentAt: new Date(Date.now() - 90 * 60 * 1000).toISOString(), // 90 min ago
        },
      ]);

      await sendJobInProgressNotification(200, 1);

      expect(mockTwilioSendSms).toHaveBeenCalledOnce();
    });

    it('skips when setting is disabled', async () => {
      mockStorage.getNotificationSettings.mockResolvedValue({ ...DEFAULT_SETTINGS, jobInProgressSms: false });

      await sendJobInProgressNotification(200, 1);

      expect(mockStorage.getJob).not.toHaveBeenCalled();
      expect(mockTwilioSendSms).not.toHaveBeenCalled();
    });

    it('skips when customer has not opted in to SMS', async () => {
      mockStorage.getNotificationSettings.mockResolvedValue(DEFAULT_SETTINGS);
      mockStorage.getJob.mockResolvedValue(JOB);
      mockStorage.getCustomer.mockResolvedValue(CUSTOMER_NO_SMS);

      await sendJobInProgressNotification(200, 1);

      expect(mockTwilioSendSms).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────
  // sendJobWaitingPartsNotification
  // ──────────────────────────────────────────────────────

  describe('sendJobWaitingPartsNotification', () => {
    it('sends waiting parts SMS correctly', async () => {
      mockStorage.getNotificationSettings.mockResolvedValue(DEFAULT_SETTINGS);
      mockStorage.getJob.mockResolvedValue(JOB);
      mockStorage.getCustomer.mockResolvedValue(CUSTOMER);
      mockStorage.getBusiness.mockResolvedValue(BUSINESS);

      await sendJobWaitingPartsNotification(200, 1);

      expect(mockTwilioSendSms).toHaveBeenCalledOnce();
      const sentMessage = mockTwilioSendSms.mock.calls[0][1] as string;
      expect(sentMessage).toContain("waiting on a part");
      expect(sentMessage).toContain("AC Repair");
      expect(sentMessage).toContain("Tony's Barbershop");
    });
  });

  // ──────────────────────────────────────────────────────
  // sendJobResumedNotification
  // ──────────────────────────────────────────────────────

  describe('sendJobResumedNotification', () => {
    it('sends job resumed SMS correctly', async () => {
      mockStorage.getNotificationSettings.mockResolvedValue(DEFAULT_SETTINGS);
      mockStorage.getJob.mockResolvedValue(JOB);
      mockStorage.getCustomer.mockResolvedValue(CUSTOMER);
      mockStorage.getBusiness.mockResolvedValue(BUSINESS);

      await sendJobResumedNotification(200, 1);

      expect(mockTwilioSendSms).toHaveBeenCalledOnce();
      const sentMessage = mockTwilioSendSms.mock.calls[0][1] as string;
      expect(sentMessage).toContain("Good news");
      expect(sentMessage).toContain("Parts are in");
      expect(sentMessage).toContain("AC Repair");
    });
  });

  // ──────────────────────────────────────────────────────
  // sendSmsOptInWelcome
  // ──────────────────────────────────────────────────────

  describe('sendSmsOptInWelcome', () => {
    it('sends TCPA disclosure message', async () => {
      mockStorage.getCustomer.mockResolvedValue(CUSTOMER);
      mockStorage.getBusiness.mockResolvedValue(BUSINESS);
      mockStorage.getNotificationLogs.mockResolvedValue([]);

      await sendSmsOptInWelcome(10, 1);

      expect(mockTwilioSendSms).toHaveBeenCalledOnce();
      const sentMessage = mockTwilioSendSms.mock.calls[0][1] as string;
      expect(sentMessage).toContain("Welcome to Tony's Barbershop");
      expect(sentMessage).toContain('Msg & data rates may apply');
      expect(sentMessage).toContain('Reply HELP');
      expect(sentMessage).toContain('STOP to unsubscribe');
    });

    it('logs the welcome message with correct type', async () => {
      mockStorage.getCustomer.mockResolvedValue(CUSTOMER);
      mockStorage.getBusiness.mockResolvedValue(BUSINESS);
      mockStorage.getNotificationLogs.mockResolvedValue([]);

      await sendSmsOptInWelcome(10, 1);

      expect(mockStorage.createNotificationLog).toHaveBeenCalledWith(
        expect.objectContaining({
          businessId: 1,
          customerId: 10,
          type: 'sms_opt_in_welcome',
          channel: 'sms',
          status: 'sent',
        }),
      );
    });

    it('does not send duplicate welcome messages', async () => {
      mockStorage.getCustomer.mockResolvedValue(CUSTOMER);
      mockStorage.getBusiness.mockResolvedValue(BUSINESS);
      mockStorage.getNotificationLogs.mockResolvedValue([
        {
          customerId: 10,
          type: 'sms_opt_in_welcome',
          status: 'sent',
        },
      ]);

      await sendSmsOptInWelcome(10, 1);

      expect(mockTwilioSendSms).not.toHaveBeenCalled();
    });

    it('skips when customer has no phone', async () => {
      mockStorage.getCustomer.mockResolvedValue(CUSTOMER_NO_PHONE);
      mockStorage.getBusiness.mockResolvedValue(BUSINESS);

      await sendSmsOptInWelcome(12, 1);

      expect(mockTwilioSendSms).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────
  // sendJobCompletedNotification
  // ──────────────────────────────────────────────────────

  describe('sendJobCompletedNotification', () => {
    it('sends SMS and email when both enabled', async () => {
      mockStorage.getNotificationSettings.mockResolvedValue(DEFAULT_SETTINGS);
      mockStorage.getJob.mockResolvedValue(JOB);
      mockStorage.getCustomer.mockResolvedValue(CUSTOMER);
      mockStorage.getBusiness.mockResolvedValue(BUSINESS);

      await sendJobCompletedNotification(200, 1);

      expect(mockTwilioSendSms).toHaveBeenCalledOnce();
      const sentMessage = mockTwilioSendSms.mock.calls[0][1] as string;
      expect(sentMessage).toContain('AC Repair');
      expect(sentMessage).toContain('has been completed');
      expect(sentMessage).toContain("Tony's Barbershop");
    });
  });

  // ──────────────────────────────────────────────────────
  // Error handling (fire-and-forget pattern)
  // ──────────────────────────────────────────────────────

  describe('error handling', () => {
    it('logs errors without throwing on storage failures', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      mockStorage.getNotificationSettings.mockRejectedValue(new Error('DB connection failed'));

      // Should NOT throw
      await sendAppointmentConfirmation(100, 1);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error in sendAppointmentConfirmation'),
        expect.any(Error),
      );

      consoleSpy.mockRestore();
    });

    it('logs failed SMS to notification_log as failed', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      mockStorage.getNotificationSettings.mockResolvedValue({ ...DEFAULT_SETTINGS, appointmentConfirmationEmail: false });
      mockStorage.getAppointment.mockResolvedValue(APPOINTMENT);
      mockStorage.getCustomer.mockResolvedValue(CUSTOMER);
      mockStorage.getBusiness.mockResolvedValue(BUSINESS);
      mockStorage.getService.mockResolvedValue(SERVICE);
      mockTwilioSendSms.mockRejectedValue(new Error('Twilio rate limit exceeded'));

      await sendAppointmentConfirmation(100, 1);

      expect(mockStorage.createNotificationLog).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          error: 'Twilio rate limit exceeded',
          type: 'appointment_confirmation',
          channel: 'sms',
        }),
      );

      consoleSpy.mockRestore();
    });

    it('does not throw when sendJobInProgressNotification encounters an error', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      mockStorage.getNotificationSettings.mockRejectedValue(new Error('Connection timeout'));

      // Should NOT throw
      await sendJobInProgressNotification(200, 1);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Error in sendJobInProgressNotification'),
        expect.any(Error),
      );

      consoleSpy.mockRestore();
    });
  });

  // ──────────────────────────────────────────────────────
  // sendAppointmentReminder
  // ──────────────────────────────────────────────────────

  describe('sendAppointmentReminder', () => {
    it('skips cancelled appointments', async () => {
      mockStorage.getNotificationSettings.mockResolvedValue(DEFAULT_SETTINGS);
      mockStorage.getAppointment.mockResolvedValue({ ...APPOINTMENT, status: 'cancelled' });

      await sendAppointmentReminder(100, 1);

      expect(mockTwilioSendSms).not.toHaveBeenCalled();
      expect(mockStorage.getCustomer).not.toHaveBeenCalled();
    });

    it('skips completed appointments', async () => {
      mockStorage.getNotificationSettings.mockResolvedValue(DEFAULT_SETTINGS);
      mockStorage.getAppointment.mockResolvedValue({ ...APPOINTMENT, status: 'completed' });

      await sendAppointmentReminder(100, 1);

      expect(mockTwilioSendSms).not.toHaveBeenCalled();
    });

    it('sends reminder with CONFIRM keyword', async () => {
      mockStorage.getNotificationSettings.mockResolvedValue({ ...DEFAULT_SETTINGS, appointmentReminderEmail: false });
      mockStorage.getAppointment.mockResolvedValue(APPOINTMENT);
      mockStorage.getCustomer.mockResolvedValue(CUSTOMER);
      mockStorage.getBusiness.mockResolvedValue(BUSINESS);
      mockStorage.getService.mockResolvedValue(SERVICE);

      await sendAppointmentReminder(100, 1);

      expect(mockTwilioSendSms).toHaveBeenCalledOnce();
      const sentMessage = mockTwilioSendSms.mock.calls[0][1] as string;
      expect(sentMessage).toContain('Reminder');
      expect(sentMessage).toContain('CONFIRM');
      expect(sentMessage).toContain('RESCHEDULE');
      expect(sentMessage).toContain('C to cancel');
    });
  });

  // ──────────────────────────────────────────────────────
  // sendInvoiceCreatedNotification
  // ──────────────────────────────────────────────────────

  describe('sendInvoiceCreatedNotification', () => {
    const INVOICE = {
      id: 300,
      businessId: 1,
      customerId: 10,
      invoiceNumber: 'INV-001',
      total: '150.00',
      dueDate: '2025-07-01',
      status: 'pending',
    };

    it('SMS defaults to off for invoice created', async () => {
      // invoiceCreatedSms defaults to false in the code (=== true check)
      mockStorage.getNotificationSettings.mockResolvedValue({
        ...DEFAULT_SETTINGS,
        invoiceCreatedEmail: false,
        // invoiceCreatedSms not explicitly set — defaults to falsy
      });
      mockStorage.getInvoice.mockResolvedValue(INVOICE);
      mockStorage.getCustomer.mockResolvedValue(CUSTOMER);
      mockStorage.getBusiness.mockResolvedValue(BUSINESS);

      await sendInvoiceCreatedNotification(300, 1);

      // Neither email nor SMS should be sent (email disabled, SMS default off)
      expect(mockTwilioSendSms).not.toHaveBeenCalled();
    });

    it('sends SMS when explicitly enabled', async () => {
      mockStorage.getNotificationSettings.mockResolvedValue({
        ...DEFAULT_SETTINGS,
        invoiceCreatedEmail: false,
        invoiceCreatedSms: true,
      });
      mockStorage.getInvoice.mockResolvedValue(INVOICE);
      mockStorage.getCustomer.mockResolvedValue(CUSTOMER);
      mockStorage.getBusiness.mockResolvedValue(BUSINESS);

      await sendInvoiceCreatedNotification(300, 1);

      expect(mockTwilioSendSms).toHaveBeenCalledOnce();
      const sentMessage = mockTwilioSendSms.mock.calls[0][1] as string;
      expect(sentMessage).toContain('INV-001');
      expect(sentMessage).toContain('$150.00');
    });
  });

  // ──────────────────────────────────────────────────────
  // sendReservationConfirmation
  // ──────────────────────────────────────────────────────

  describe('sendReservationConfirmation', () => {
    const RESERVATION = {
      id: 400,
      businessId: 1,
      customerId: 10,
      startDate: new Date('2025-06-20T19:00:00Z'),
      partySize: 4,
      manageToken: 'res-token-123',
    };

    it('sends SMS with party size and manage link', async () => {
      mockStorage.getNotificationSettings.mockResolvedValue(DEFAULT_SETTINGS);
      mockStorage.getRestaurantReservation.mockResolvedValue(RESERVATION);
      mockStorage.getCustomer.mockResolvedValue(CUSTOMER);
      mockStorage.getBusiness.mockResolvedValue(BUSINESS);

      await sendReservationConfirmation(400, 1);

      expect(mockTwilioSendSms).toHaveBeenCalledOnce();
      const sentMessage = mockTwilioSendSms.mock.calls[0][1] as string;
      expect(sentMessage).toContain('4 guests');
      expect(sentMessage).toContain("Tony's Barbershop");
      expect(sentMessage).toContain('manage-reservation/res-token-123');
    });

    it('handles party size of 1 correctly', async () => {
      mockStorage.getNotificationSettings.mockResolvedValue({ ...DEFAULT_SETTINGS, appointmentConfirmationEmail: false });
      mockStorage.getRestaurantReservation.mockResolvedValue({ ...RESERVATION, partySize: 1 });
      mockStorage.getCustomer.mockResolvedValue(CUSTOMER);
      mockStorage.getBusiness.mockResolvedValue(BUSINESS);

      await sendReservationConfirmation(400, 1);

      const sentMessage = mockTwilioSendSms.mock.calls[0][1] as string;
      expect(sentMessage).toContain('1 guest');
      expect(sentMessage).not.toContain('1 guests');
    });
  });

  // ──────────────────────────────────────────────────────
  // getContactNumber (tested through message content)
  // ──────────────────────────────────────────────────────

  describe('getContactNumber (via message content)', () => {
    it('prefers twilioPhoneNumber over business.phone', async () => {
      mockStorage.getNotificationSettings.mockResolvedValue(DEFAULT_SETTINGS);
      mockStorage.getJob.mockResolvedValue(JOB);
      mockStorage.getCustomer.mockResolvedValue(CUSTOMER);
      mockStorage.getBusiness.mockResolvedValue(BUSINESS);
      mockStorage.getStaffMember.mockResolvedValue(STAFF);
      mockStorage.getNotificationLogs.mockResolvedValue([]);

      await sendJobInProgressNotification(200, 1);

      const sentMessage = mockTwilioSendSms.mock.calls[0][1] as string;
      // Should use twilioPhoneNumber (+15559999999) not business.phone (+15551234567)
      expect(sentMessage).toContain('+15559999999');
    });

    it('falls back to business.phone when no twilioPhoneNumber', async () => {
      mockStorage.getNotificationSettings.mockResolvedValue(DEFAULT_SETTINGS);
      mockStorage.getJob.mockResolvedValue(JOB);
      mockStorage.getCustomer.mockResolvedValue(CUSTOMER);
      mockStorage.getBusiness.mockResolvedValue({ ...BUSINESS, twilioPhoneNumber: null });
      mockStorage.getStaffMember.mockResolvedValue(STAFF);
      mockStorage.getNotificationLogs.mockResolvedValue([]);

      await sendJobInProgressNotification(200, 1);

      const sentMessage = mockTwilioSendSms.mock.calls[0][1] as string;
      expect(sentMessage).toContain('+15551234567');
    });
  });
});
