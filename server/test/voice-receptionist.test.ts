/**
 * Voice Receptionist Tests
 *
 * Covers critical path functions from:
 * - server/services/systemPromptBuilder.ts (pure functions + prompt generation)
 * - server/services/callToolHandlers.ts (scheduling logic + dispatcher)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Set DATABASE_URL before any imports that might need it
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';

// ── Mocks (vi.hoisted ensures they're available when vi.mock factories run) ──

const { mockStorage, mockTwilioService, mockFireEvent, mockCanBusinessAcceptCalls } = vi.hoisted(() => ({
  mockStorage: {
    getBusiness: vi.fn(),
    getBusinessHours: vi.fn(),
    getServices: vi.fn(),
    getStaff: vi.fn(),
    getStaffHours: vi.fn(),
    getStaffServices: vi.fn(),
    getStaffMember: vi.fn(),
    getAppointments: vi.fn(),
    getCustomerByPhone: vi.fn(),
    getCustomer: vi.fn(),
    createCustomer: vi.fn(),
    updateCustomer: vi.fn(),
    createCallLog: vi.fn(),
    createAppointment: vi.fn(),
    getService: vi.fn(),
    getPhoneNumberByTwilioNumber: vi.fn(),
    getStaffTimeOffForDate: vi.fn(),
    getStaffTimeOff: vi.fn(),
    getUpcomingAppointmentsByBusinessId: vi.fn(),
    getUnansweredQuestions: vi.fn(),
    getCallIntelligenceByBusiness: vi.fn(),
    createNotificationLog: vi.fn(),
    getReceptionistConfig: vi.fn(),
    getBusinessKnowledge: vi.fn(),
    getCustomerInsights: vi.fn(),
    getAppointmentsByCustomerId: vi.fn(),
  },
  mockTwilioService: {
    sendSms: vi.fn().mockResolvedValue(undefined),
  },
  mockFireEvent: vi.fn().mockResolvedValue(undefined),
  mockCanBusinessAcceptCalls: vi.fn().mockResolvedValue({ allowed: true }),
}));

vi.mock('../storage', () => ({ storage: mockStorage }));
vi.mock('../db', () => ({
  db: {},
  pool: { connect: vi.fn(), query: vi.fn(), end: vi.fn() },
}));
vi.mock('./twilioService', () => ({ default: mockTwilioService, ...mockTwilioService }));
vi.mock('./webhookService', () => ({ fireEvent: mockFireEvent }));
vi.mock('./usageService', () => ({
  canBusinessAcceptCalls: mockCanBusinessAcceptCalls,
  getUsageInfo: vi.fn().mockResolvedValue({ minutesUsed: 10, minutesAllowed: 150 }),
}));
vi.mock('./callIntelligenceService', () => ({
  getLatestCustomerIntelligence: vi.fn().mockResolvedValue(null),
  analyzeCallIntelligence: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./mem0Service', () => ({
  searchMemory: vi.fn().mockResolvedValue([]),
  addMemory: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('./cloverService', () => ({
  getCachedMenu: vi.fn().mockResolvedValue(null),
  createOrder: vi.fn().mockResolvedValue(null),
  formatMenuForPrompt: vi.fn().mockReturnValue(''),
}));
vi.mock('./squareService', () => ({
  getCachedMenu: vi.fn().mockResolvedValue(null),
  createOrder: vi.fn().mockResolvedValue(null),
}));
vi.mock('./heartlandService', () => ({
  getCachedMenu: vi.fn().mockResolvedValue(null),
  createOrder: vi.fn().mockResolvedValue(null),
}));
vi.mock('../utils/timezone', () => ({
  getTimezoneAbbreviation: vi.fn().mockReturnValue('EST'),
}));
vi.mock('../utils/safeAsync', () => ({
  logAndSwallow: vi.fn((fn: () => Promise<any>) => fn().catch(() => {})),
}));

// Now import the modules under test AFTER mocks are set up
import {
  formatBusinessHoursFromDB,
  isBusinessOpenNow,
  buildFirstMessage,
  generateSystemPrompt,
  buildIntelligenceHints,
} from '../services/systemPromptBuilder';

import {
  dispatchToolCall,
  getAvailableSlotsForDay,
  dataCache,
} from '../services/callToolHandlers';


// ── Test Data ──

const TEST_BUSINESS = {
  id: 1,
  name: 'Tony\'s Barbershop',
  industry: 'barber',
  type: 'salon',
  phone: '+15551234567',
  timezone: 'America/New_York',
  bookingSlug: 'tonys-barbershop',
  bookingEnabled: true,
  address: '123 Main St, New York, NY',
  businessHours: 'Monday-Friday 9am-5pm',
  twilioPhoneNumber: '+15559999999',
};

const WEEKDAY_HOURS = [
  { day: 'monday', open: '09:00', close: '17:00', isClosed: false },
  { day: 'tuesday', open: '09:00', close: '17:00', isClosed: false },
  { day: 'wednesday', open: '09:00', close: '17:00', isClosed: false },
  { day: 'thursday', open: '09:00', close: '17:00', isClosed: false },
  { day: 'friday', open: '09:00', close: '17:00', isClosed: false },
  { day: 'saturday', open: '10:00', close: '14:00', isClosed: false },
  { day: 'sunday', open: '00:00', close: '00:00', isClosed: true },
];

const TEST_SERVICES = [
  { id: 1, name: 'Haircut', price: '25', duration: 30, description: 'Standard haircut', businessId: 1 },
  { id: 2, name: 'Beard Trim', price: '15', duration: 15, description: 'Beard shaping', businessId: 1 },
  { id: 3, name: 'Hot Shave', price: '35', duration: 45, description: 'Straight razor shave', businessId: 1 },
];

const TEST_STAFF = [
  { id: 1, firstName: 'Mike', lastName: 'Johnson', specialty: 'Barber', active: true, businessId: 1 },
  { id: 2, firstName: 'Sarah', lastName: 'Smith', specialty: 'Stylist', active: true, businessId: 1 },
];


// ═══════════════════════════════════════════════════
// GROUP 1: systemPromptBuilder (pure functions)
// ═══════════════════════════════════════════════════

describe('systemPromptBuilder', () => {

  // ── formatBusinessHoursFromDB ──

  describe('formatBusinessHoursFromDB', () => {
    it('groups Mon-Fri same hours into "Monday through Friday: 9 AM to 5 PM"', () => {
      const hours = [
        { day: 'monday', open: '09:00', close: '17:00', isClosed: false },
        { day: 'tuesday', open: '09:00', close: '17:00', isClosed: false },
        { day: 'wednesday', open: '09:00', close: '17:00', isClosed: false },
        { day: 'thursday', open: '09:00', close: '17:00', isClosed: false },
        { day: 'friday', open: '09:00', close: '17:00', isClosed: false },
      ];

      const result = formatBusinessHoursFromDB(hours);
      expect(result).toContain('Monday through Friday');
      expect(result).toContain('9 AM to 5 PM');
    });

    it('returns fallback for empty array', () => {
      const result = formatBusinessHoursFromDB([]);
      expect(result).toBe('Monday through Friday 9 AM to 5 PM');
    });

    it('returns fallback for null/undefined', () => {
      const result = formatBusinessHoursFromDB(null as any);
      expect(result).toBe('Monday through Friday 9 AM to 5 PM');
    });

    it('handles closed days', () => {
      const hours = [
        { day: 'monday', open: '09:00', close: '17:00', isClosed: false },
        { day: 'tuesday', open: '09:00', close: '17:00', isClosed: false },
        { day: 'sunday', open: '', close: '', isClosed: true },
      ];

      const result = formatBusinessHoursFromDB(hours);
      expect(result).toContain('CLOSED');
    });

    it('groups two consecutive days with "and"', () => {
      const hours = [
        { day: 'saturday', open: '10:00', close: '14:00', isClosed: false },
        { day: 'sunday', open: '10:00', close: '14:00', isClosed: false },
      ];

      const result = formatBusinessHoursFromDB(hours);
      expect(result).toContain('Saturday and Sunday');
      expect(result).toContain('10 AM to 2 PM');
    });

    it('formats half-hour times correctly', () => {
      const hours = [
        { day: 'monday', open: '09:30', close: '19:00', isClosed: false },
      ];

      const result = formatBusinessHoursFromDB(hours);
      expect(result).toContain('9:30 AM');
      expect(result).toContain('7 PM');
    });
  });


  // ── isBusinessOpenNow ──

  describe('isBusinessOpenNow', () => {
    it('reports open during business hours', () => {
      // We use the actual system time so we need to construct hours
      // that cover the current day. Use a simple approach: create hours
      // for today's day name that span midnight to midnight (always open).
      const now = new Date();
      const dayName = now.toLocaleDateString('en-US', {
        timeZone: 'America/New_York',
        weekday: 'long',
      }).toLowerCase();

      const hours = [{ day: dayName, open: '00:00', close: '23:59', isClosed: false }];

      const { isOpen } = isBusinessOpenNow(hours, 'America/New_York');
      expect(isOpen).toBe(true);
    });

    it('reports closed after hours', () => {
      // Create hours for today that have already ended (open 00:00 to 00:01)
      const now = new Date();
      const dayName = now.toLocaleDateString('en-US', {
        timeZone: 'America/New_York',
        weekday: 'long',
      }).toLowerCase();

      const hours = [{ day: dayName, open: '00:00', close: '00:01', isClosed: false }];

      const { isOpen } = isBusinessOpenNow(hours, 'America/New_York');
      // Unless it's literally midnight, this should be closed
      expect(isOpen).toBe(false);
    });

    it('reports closed on a closed day', () => {
      const now = new Date();
      const dayName = now.toLocaleDateString('en-US', {
        timeZone: 'America/New_York',
        weekday: 'long',
      }).toLowerCase();

      const hours = [{ day: dayName, open: '09:00', close: '17:00', isClosed: true }];

      const { isOpen, todayHours } = isBusinessOpenNow(hours, 'America/New_York');
      expect(isOpen).toBe(false);
      expect(todayHours).toBe('CLOSED today');
    });

    it('reports closed when no hours exist for today', () => {
      // Pass an empty array for hours but a valid timezone
      const { isOpen, todayHours } = isBusinessOpenNow([], 'America/New_York');
      expect(isOpen).toBe(false);
      expect(todayHours).toBe('CLOSED today');
    });
  });


  // ── buildFirstMessage ──

  describe('buildFirstMessage', () => {
    it('includes business name in default greeting', () => {
      const msg = buildFirstMessage('Tony\'s Barbershop');
      expect(msg).toContain('Tony\'s Barbershop');
      expect(msg).toContain('How can I help you today?');
    });

    it('includes recording disclosure when enabled (default)', () => {
      const msg = buildFirstMessage('Tony\'s Barbershop', null, true);
      expect(msg).toContain('recorded for quality purposes');
    });

    it('does NOT include recording disclosure when disabled', () => {
      const msg = buildFirstMessage('Tony\'s Barbershop', null, false);
      expect(msg).not.toContain('recorded');
      expect(msg).toContain('How can I help you today?');
    });

    it('preserves custom greeting text', () => {
      const custom = 'Welcome to the shop! What brings you in today?';
      const msg = buildFirstMessage('Tony\'s Barbershop', custom, false);
      expect(msg).toContain('What brings you in today?');
    });

    it('adds recording disclosure to custom greeting when enabled', () => {
      const custom = 'Welcome to the shop! What brings you in today?';
      const msg = buildFirstMessage('Tony\'s Barbershop', custom, true);
      expect(msg).toContain('recorded for quality purposes');
      expect(msg).toContain('What brings you in today?');
    });

    it('adds engagement question when custom greeting lacks one', () => {
      const custom = 'Welcome to the shop.';
      const msg = buildFirstMessage('Tony\'s Barbershop', custom, false);
      expect(msg).toContain('How can I help you today?');
    });

    it('does not double-add engagement question to greeting that already has one', () => {
      const custom = 'Welcome! How can I help you?';
      const msg = buildFirstMessage('Tony\'s Barbershop', custom, false);
      // Should only have one question mark-terminated segment
      const questionMarks = (msg.match(/\?/g) || []).length;
      expect(questionMarks).toBe(1);
    });
  });


  // ── generateSystemPrompt ──

  describe('generateSystemPrompt', () => {
    it('returns a string containing the business name', () => {
      const prompt = generateSystemPrompt(
        TEST_BUSINESS as any,
        TEST_SERVICES as any,
        WEEKDAY_HOURS,
      );
      expect(typeof prompt).toBe('string');
      expect(prompt).toContain('Tony\'s Barbershop');
    });

    it('includes services list in the prompt', () => {
      const prompt = generateSystemPrompt(
        TEST_BUSINESS as any,
        TEST_SERVICES as any,
        WEEKDAY_HOURS,
      );
      expect(prompt).toContain('Haircut');
      expect(prompt).toContain('Beard Trim');
      expect(prompt).toContain('Hot Shave');
      expect(prompt).toContain('$25');
    });

    it('includes industry-specific content for barbershop', () => {
      const prompt = generateSystemPrompt(
        TEST_BUSINESS as any,
        TEST_SERVICES as any,
        WEEKDAY_HOURS,
      );
      // Barbershop prompt includes customer lingo (e.g., lineup, shape-up, fade, etc.)
      expect(prompt.toLowerCase()).toContain('barber');
    });

    it('includes formatted business hours', () => {
      const prompt = generateSystemPrompt(
        TEST_BUSINESS as any,
        TEST_SERVICES as any,
        WEEKDAY_HOURS,
      );
      expect(prompt).toContain('Monday through Friday');
    });

    it('uses generic service list when no services provided', () => {
      const prompt = generateSystemPrompt(
        TEST_BUSINESS as any,
        [],
        WEEKDAY_HOURS,
      );
      expect(prompt).toContain('General services');
    });

    it('includes staff section when provided via options', () => {
      const prompt = generateSystemPrompt(
        TEST_BUSINESS as any,
        TEST_SERVICES as any,
        WEEKDAY_HOURS,
        null,
        { staffSection: 'TEAM:\n- Mike Johnson (Barber)\n- Sarah Smith (Stylist)\n' },
      );
      expect(prompt).toContain('Mike Johnson');
      expect(prompt).toContain('Sarah Smith');
    });

    it('includes knowledge section when provided', () => {
      const prompt = generateSystemPrompt(
        TEST_BUSINESS as any,
        TEST_SERVICES as any,
        WEEKDAY_HOURS,
        null,
        undefined,
        'Q: Do you accept walk-ins?\nA: Yes, walk-ins are welcome!',
      );
      expect(prompt).toContain('walk-ins');
    });

    it('includes intelligence hints when provided', () => {
      const prompt = generateSystemPrompt(
        TEST_BUSINESS as any,
        TEST_SERVICES as any,
        WEEKDAY_HOURS,
        null,
        undefined,
        undefined,
        undefined,
        'Most requested services recently: haircut (5 calls)',
      );
      expect(prompt).toContain('Most requested services recently');
    });

    it('includes custom instructions when provided', () => {
      const prompt = generateSystemPrompt(
        TEST_BUSINESS as any,
        TEST_SERVICES as any,
        WEEKDAY_HOURS,
        null,
        { customInstructions: 'Always ask if the caller wants a hot towel.' },
      );
      expect(prompt).toContain('hot towel');
    });

    it('accepts provider hints for Retell', () => {
      const prompt = generateSystemPrompt(
        TEST_BUSINESS as any,
        TEST_SERVICES as any,
        WEEKDAY_HOURS,
        null,
        undefined,
        undefined,
        undefined,
        undefined,
        {
          endCallInstruction: 'Call the end_call tool to hang up.',
          silenceDuringTools: false,
          toolCallFormat: 'Retell format note',
        },
      );
      expect(prompt).toContain('end_call');
    });
  });


  // ── buildIntelligenceHints ──

  describe('buildIntelligenceHints', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('returns undefined when no data available', async () => {
      mockStorage.getUnansweredQuestions.mockResolvedValue([]);
      mockStorage.getCallIntelligenceByBusiness.mockResolvedValue([]);

      const hints = await buildIntelligenceHints(1);
      expect(hints).toBeUndefined();
    });

    it('includes unanswered questions when present', async () => {
      mockStorage.getUnansweredQuestions.mockResolvedValue([
        { question: 'Do you offer beard dyeing?', status: 'pending' },
        { question: 'What are your prices?', status: 'pending' },
      ]);
      mockStorage.getCallIntelligenceByBusiness.mockResolvedValue([]);

      const hints = await buildIntelligenceHints(1);
      expect(hints).toBeDefined();
      expect(hints).toContain('beard dyeing');
    });

    it('includes frequently requested services', async () => {
      mockStorage.getUnansweredQuestions.mockResolvedValue([]);
      mockStorage.getCallIntelligenceByBusiness.mockResolvedValue([
        { keyFacts: { servicesMentioned: ['fade', 'lineup'] } },
        { keyFacts: { servicesMentioned: ['fade'] } },
        { keyFacts: { servicesMentioned: ['fade'] } },
      ]);

      const hints = await buildIntelligenceHints(1);
      expect(hints).toBeDefined();
      expect(hints).toContain('fade');
    });

    it('returns undefined gracefully on error', async () => {
      mockStorage.getUnansweredQuestions.mockRejectedValue(new Error('DB error'));
      mockStorage.getCallIntelligenceByBusiness.mockRejectedValue(new Error('DB error'));

      const hints = await buildIntelligenceHints(1);
      expect(hints).toBeUndefined();
    });

    it('caps hints at 500 characters', async () => {
      const longQuestions = Array.from({ length: 20 }, (_, i) => ({
        question: `Very long question number ${i} about something important for the business operations?`,
        status: 'pending',
      }));
      mockStorage.getUnansweredQuestions.mockResolvedValue(longQuestions);
      mockStorage.getCallIntelligenceByBusiness.mockResolvedValue([]);

      const hints = await buildIntelligenceHints(1);
      expect(hints).toBeDefined();
      expect(hints!.length).toBeLessThanOrEqual(500);
    });
  });
});


// ═══════════════════════════════════════════════════
// GROUP 2: getAvailableSlotsForDay (scheduling logic)
// ═══════════════════════════════════════════════════

describe('getAvailableSlotsForDay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dataCache.clear();
    // Default: no time off
    mockStorage.getStaffTimeOffForDate.mockResolvedValue([]);
  });

  it('returns slots during business hours', async () => {
    // Use a date far in the future (not today) to avoid "skip past times" filter
    // Pick a Wednesday
    const futureDate = new Date(2030, 0, 2); // Jan 2, 2030 = Wednesday
    const businessHours = [
      { day: 'wednesday', open: '09:00', close: '12:00', isClosed: false },
    ];

    const { slots, isClosed } = await getAvailableSlotsForDay(
      1, futureDate, businessHours, [], 30, undefined, 30, 'America/New_York'
    );

    expect(isClosed).toBe(false);
    expect(slots.length).toBeGreaterThan(0);
    // Should have slots from 9:00 to 11:30 (30-min intervals for 30-min service within 9-12)
    expect(slots).toContain('9:00 AM');
    expect(slots).toContain('9:30 AM');
    expect(slots).toContain('10:00 AM');
    expect(slots).toContain('10:30 AM');
    expect(slots).toContain('11:00 AM');
    expect(slots).toContain('11:30 AM');
    // 12:00 should NOT be available (service would end at 12:30 which is past close)
    expect(slots).not.toContain('12:00 PM');
  });

  it('returns empty when business is closed', async () => {
    const futureDate = new Date(2030, 0, 6); // Jan 6, 2030 = Sunday
    const businessHours = [
      { day: 'sunday', open: '', close: '', isClosed: true },
    ];

    const { slots, isClosed } = await getAvailableSlotsForDay(
      1, futureDate, businessHours, [], 30, undefined, 30, 'America/New_York'
    );

    expect(isClosed).toBe(true);
    expect(slots).toEqual([]);
  });

  it('returns closed when no hours configured for the day', async () => {
    const futureDate = new Date(2030, 0, 2); // Wednesday
    const businessHours = [
      // Only Monday configured
      { day: 'monday', open: '09:00', close: '17:00', isClosed: false },
    ];

    const { slots, isClosed } = await getAvailableSlotsForDay(
      1, futureDate, businessHours, [], 30, undefined, 30, 'America/New_York'
    );

    expect(isClosed).toBe(true);
    expect(slots).toEqual([]);
  });

  it('skips slots that overlap existing appointments', async () => {
    const futureDate = new Date(2030, 0, 2); // Wednesday
    const businessHours = [
      { day: 'wednesday', open: '09:00', close: '12:00', isClosed: false },
    ];

    // Create an appointment at 10:00-10:30 on that Wednesday
    // We need to create a UTC date that maps to 10:00 AM ET on Jan 2, 2030
    const aptStart = new Date(Date.UTC(2030, 0, 2, 15, 0)); // 15:00 UTC = 10:00 AM ET
    const aptEnd = new Date(Date.UTC(2030, 0, 2, 15, 30));   // 15:30 UTC = 10:30 AM ET

    const appointments = [
      {
        id: 1,
        startDate: aptStart.toISOString(),
        endDate: aptEnd.toISOString(),
        status: 'scheduled',
      },
    ];

    const { slots } = await getAvailableSlotsForDay(
      1, futureDate, businessHours, appointments, 30, undefined, 30, 'America/New_York'
    );

    // 10:00 AM should be blocked (existing appointment)
    expect(slots).not.toContain('10:00 AM');
    // Other slots should still be available
    expect(slots).toContain('9:00 AM');
    expect(slots).toContain('9:30 AM');
    expect(slots).toContain('10:30 AM');
  });

  it('handles staff-specific hours', async () => {
    const futureDate = new Date(2030, 0, 2); // Wednesday
    const businessHours = [
      { day: 'wednesday', open: '09:00', close: '17:00', isClosed: false },
    ];
    // Staff only works 10-14 on Wednesday
    const staffHours = [
      { day: 'wednesday', startTime: '10:00', endTime: '14:00', isOff: false },
    ];

    const { slots, isClosed } = await getAvailableSlotsForDay(
      1, futureDate, businessHours, [], 30, staffHours, 30, 'America/New_York'
    );

    expect(isClosed).toBe(false);
    // Should use staff hours (10-14), not business hours (9-17)
    expect(slots).toContain('10:00 AM');
    expect(slots).not.toContain('9:00 AM');
    expect(slots).not.toContain('2:00 PM'); // 14:00 = 2 PM, service would end at 14:30 = past staff close
    expect(slots).toContain('1:30 PM');     // Last valid slot: 13:30 + 30 = 14:00 exactly at close
  });

  it('returns closed when staff is off on that day', async () => {
    const futureDate = new Date(2030, 0, 2); // Wednesday
    const businessHours = [
      { day: 'wednesday', open: '09:00', close: '17:00', isClosed: false },
    ];
    const staffHours = [
      { day: 'wednesday', startTime: '10:00', endTime: '14:00', isOff: true },
    ];

    const { slots, isClosed } = await getAvailableSlotsForDay(
      1, futureDate, businessHours, [], 30, staffHours, 30, 'America/New_York'
    );

    expect(isClosed).toBe(true);
    expect(slots).toEqual([]);
  });

  it('respects slot interval parameter', async () => {
    const futureDate = new Date(2030, 0, 2); // Wednesday
    const businessHours = [
      { day: 'wednesday', open: '09:00', close: '11:00', isClosed: false },
    ];

    // 15-minute intervals with 15-minute duration
    const { slots } = await getAvailableSlotsForDay(
      1, futureDate, businessHours, [], 15, undefined, 15, 'America/New_York'
    );

    // 9:00 to 10:45 in 15-min intervals = 8 slots
    expect(slots).toContain('9:00 AM');
    expect(slots).toContain('9:15 AM');
    expect(slots).toContain('9:30 AM');
    expect(slots).toContain('9:45 AM');
    expect(slots.length).toBe(8);
  });

  it('does not return cancelled appointment slots as occupied', async () => {
    const futureDate = new Date(2030, 0, 2); // Wednesday
    const businessHours = [
      { day: 'wednesday', open: '09:00', close: '12:00', isClosed: false },
    ];

    const aptStart = new Date(Date.UTC(2030, 0, 2, 15, 0)); // 10:00 AM ET
    const aptEnd = new Date(Date.UTC(2030, 0, 2, 15, 30));

    const appointments = [
      {
        id: 1,
        startDate: aptStart.toISOString(),
        endDate: aptEnd.toISOString(),
        status: 'cancelled', // This appointment was cancelled
      },
    ];

    const { slots } = await getAvailableSlotsForDay(
      1, futureDate, businessHours, appointments, 30, undefined, 30, 'America/New_York'
    );

    // 10:00 AM should be available since the appointment is cancelled
    expect(slots).toContain('10:00 AM');
  });
});


// ═══════════════════════════════════════════════════
// GROUP 3: dispatchToolCall (dispatcher)
// ═══════════════════════════════════════════════════

describe('dispatchToolCall', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dataCache.clear();
  });

  it('routes checkAvailability and returns result', async () => {
    mockStorage.getBusiness.mockResolvedValue(TEST_BUSINESS);
    mockStorage.getBusinessHours.mockResolvedValue(WEEKDAY_HOURS);
    mockStorage.getServices.mockResolvedValue(TEST_SERVICES);
    mockStorage.getStaff.mockResolvedValue(TEST_STAFF);
    mockStorage.getStaffServices.mockResolvedValue([1, 2, 3]);
    mockStorage.getStaffHours.mockResolvedValue([]);
    mockStorage.getAppointments.mockResolvedValue([]);
    mockStorage.getStaffTimeOffForDate.mockResolvedValue([]);

    const result = await dispatchToolCall(
      'checkAvailability',
      1,
      { date: 'next wednesday' },
      '+15551112222'
    );

    // Should return a FunctionResult (has .result property)
    expect(result).toHaveProperty('result');
    expect((result as any).error).toBeUndefined();
  });

  it('returns error for unknown function names', async () => {
    const result = await dispatchToolCall(
      'nonExistentFunction',
      1,
      {},
      '+15551112222'
    );

    expect(result).toHaveProperty('error');
    expect((result as any).error).toContain('Unknown function');
  });

  it('handles missing required date parameter for checkAvailability', async () => {
    const result = await dispatchToolCall(
      'checkAvailability',
      1,
      {}, // No date parameter
      '+15551112222'
    );

    // Should return a result (not crash), with an error message
    expect(result).toHaveProperty('result');
    const res = result as any;
    expect(res.result.available).toBe(false);
    expect(res.result.error).toBeDefined();
  });

  it('routes getServices correctly', async () => {
    mockStorage.getBusiness.mockResolvedValue(TEST_BUSINESS);
    mockStorage.getServices.mockResolvedValue(TEST_SERVICES);

    const result = await dispatchToolCall(
      'getServices',
      1,
      {},
      '+15551112222'
    );

    expect(result).toHaveProperty('result');
    const res = result as any;
    expect(res.result.services).toBeDefined();
    expect(res.result.services.length).toBe(3);
  });

  it('routes getStaffMembers correctly', async () => {
    mockStorage.getBusiness.mockResolvedValue(TEST_BUSINESS);
    mockStorage.getStaff.mockResolvedValue(TEST_STAFF);

    const result = await dispatchToolCall(
      'getStaffMembers',
      1,
      {},
      '+15551112222'
    );

    expect(result).toHaveProperty('result');
    const res = result as any;
    expect(res.result.staff).toBeDefined();
  });

  it('routes getBusinessHours correctly', async () => {
    mockStorage.getBusiness.mockResolvedValue(TEST_BUSINESS);
    mockStorage.getBusinessHours.mockResolvedValue(WEEKDAY_HOURS);

    const result = await dispatchToolCall(
      'getBusinessHours',
      1,
      {},
      '+15551112222'
    );

    expect(result).toHaveProperty('result');
  });

  it('routes recognizeCaller correctly', async () => {
    mockStorage.getBusiness.mockResolvedValue(TEST_BUSINESS);
    mockStorage.getBusinessHours.mockResolvedValue(WEEKDAY_HOURS);
    mockStorage.getCustomerByPhone.mockResolvedValue(null);
    mockStorage.getServices.mockResolvedValue(TEST_SERVICES);
    mockStorage.getStaff.mockResolvedValue(TEST_STAFF);
    mockStorage.getAppointments.mockResolvedValue([]);
    mockStorage.createCustomer.mockResolvedValue({ id: 99, firstName: 'Caller', lastName: '2222' });

    const result = await dispatchToolCall(
      'recognizeCaller',
      1,
      {},
      '+15551112222'
    );

    expect(result).toHaveProperty('result');
    const res = result as any;
    // New caller should return isNewCaller: true
    expect(res.result.isNewCaller).toBe(true);
  });

  it('handles thrown errors inside tool handlers gracefully', async () => {
    // Make getBusiness throw to cause getServices to fail
    mockStorage.getBusiness.mockRejectedValue(new Error('DB connection lost'));
    mockStorage.getServices.mockRejectedValue(new Error('DB connection lost'));

    const result = await dispatchToolCall(
      'getServices',
      1,
      {},
      '+15551112222'
    );

    // Should return a result with error message, not throw
    expect(result).toHaveProperty('result');
    const res = result as any;
    expect(res.result.error).toBeDefined();
  });

  it('passes callerPhone through to handlers', async () => {
    // Testing recognizeCaller which uses callerPhone
    mockStorage.getBusiness.mockResolvedValue(TEST_BUSINESS);
    mockStorage.getBusinessHours.mockResolvedValue(WEEKDAY_HOURS);
    mockStorage.getCustomerByPhone.mockResolvedValue({
      id: 10,
      firstName: 'Tony',
      lastName: 'I',
      phone: '+15551112222',
      smsOptIn: true,
    });
    mockStorage.getServices.mockResolvedValue(TEST_SERVICES);
    mockStorage.getStaff.mockResolvedValue(TEST_STAFF);
    mockStorage.getAppointments.mockResolvedValue([]);
    mockStorage.getAppointmentsByCustomerId.mockResolvedValue([]);
    mockStorage.getCustomerInsights.mockResolvedValue(null);

    const result = await dispatchToolCall(
      'recognizeCaller',
      1,
      {},
      '+15551112222'
    );

    expect(result).toHaveProperty('result');
    const res = result as any;
    // Known caller should be recognized
    expect(res.result.recognized).toBe(true);
    expect(res.result.customerName).toContain('Tony');
  });
});
