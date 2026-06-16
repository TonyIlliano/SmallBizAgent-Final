/**
 * monthlyRoiEmailService tests.
 *
 * Contracts:
 *  - previousMonthRange returns the prior CALENDAR month (UTC boundaries,
 *    correct Jan→Dec rollover, right monthKey/label).
 *  - sendMonthlyRoiEmail is idempotent per month, skips zero-win months and
 *    missing owners, and only logs after a successful send.
 *  - subject/HTML lead with revenue when there is any, else booking count.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockStorage, mockSendEmail, mockGetAiRoi } = vi.hoisted(() => ({
  mockStorage: {
    getBusiness: vi.fn(),
    getBusinessOwner: vi.fn(),
    hasNotificationLogByType: vi.fn(),
    createNotificationLog: vi.fn(async () => ({})),
  },
  mockSendEmail: vi.fn(async () => ({ messageId: 'm1' })),
  mockGetAiRoi: vi.fn(),
}));

vi.mock('../storage', () => ({ storage: mockStorage }));
vi.mock('../emailService', () => ({ sendEmail: mockSendEmail }));
vi.mock('./analyticsService', () => ({ getAiRoiAnalytics: mockGetAiRoi }));

import {
  previousMonthRange,
  hasNoAiWins,
  buildRoiEmailSubject,
  buildRoiEmailHtml,
  sendMonthlyRoiEmail,
} from './monthlyRoiEmailService';

function roi(overrides: Record<string, any> = {}) {
  return {
    totalCalls: 40, answeredCalls: 38, bookedFromCalls: 12,
    revenueFromBookings: 4200, planCost: 299, roi: 1304,
    conversionRate: 30, avgRevenuePerBooking: 350,
    ...overrides,
  };
}

beforeEach(() => {
  mockStorage.getBusiness.mockReset();
  mockStorage.getBusinessOwner.mockReset();
  mockStorage.hasNotificationLogByType.mockReset();
  mockStorage.createNotificationLog.mockClear();
  mockSendEmail.mockClear();
  mockGetAiRoi.mockReset();
  // Defaults: happy path
  mockStorage.getBusiness.mockResolvedValue({ id: 7, name: 'Hot HVAC', timezone: 'America/New_York' });
  mockStorage.getBusinessOwner.mockResolvedValue({ id: 1, email: 'owner@hothvac.com' });
  mockStorage.hasNotificationLogByType.mockResolvedValue(false);
  mockGetAiRoi.mockResolvedValue(roi());
});

describe('previousMonthRange', () => {
  it('returns the prior calendar month with UTC boundaries', () => {
    const r = previousMonthRange(new Date('2026-06-01T13:00:00Z'));
    expect(r.monthKey).toBe('2026-05');
    expect(r.monthLabel).toBe('May 2026');
    expect(r.startDate.toISOString()).toBe('2026-05-01T00:00:00.000Z');
    expect(r.endDate.toISOString()).toBe('2026-05-31T23:59:59.999Z');
  });

  it('rolls over correctly from January to the previous December', () => {
    const r = previousMonthRange(new Date('2026-01-01T09:00:00Z'));
    expect(r.monthKey).toBe('2025-12');
    expect(r.monthLabel).toBe('December 2025');
    expect(r.startDate.toISOString()).toBe('2025-12-01T00:00:00.000Z');
    expect(r.endDate.toISOString()).toBe('2025-12-31T23:59:59.999Z');
  });

  it('handles February length correctly (non-leap)', () => {
    const r = previousMonthRange(new Date('2026-03-01T09:00:00Z'));
    expect(r.endDate.toISOString()).toBe('2026-02-28T23:59:59.999Z');
  });
});

describe('hasNoAiWins', () => {
  it('true only when zero bookings AND zero revenue', () => {
    expect(hasNoAiWins(roi({ bookedFromCalls: 0, revenueFromBookings: 0 }))).toBe(true);
    expect(hasNoAiWins(roi({ bookedFromCalls: 0, revenueFromBookings: 100 }))).toBe(false);
    expect(hasNoAiWins(roi({ bookedFromCalls: 3, revenueFromBookings: 0 }))).toBe(false);
  });
});

describe('buildRoiEmailSubject', () => {
  it('leads with revenue when there is any', () => {
    expect(buildRoiEmailSubject(roi({ revenueFromBookings: 4200 }), 'May 2026'))
      .toBe('Your AI receptionist booked $4,200 in May');
  });
  it('falls back to booking count when revenue is zero', () => {
    expect(buildRoiEmailSubject(roi({ revenueFromBookings: 0, bookedFromCalls: 5 }), 'May 2026'))
      .toBe('Your AI receptionist booked 5 appointments in May');
  });
  it('uses singular for a single booking', () => {
    expect(buildRoiEmailSubject(roi({ revenueFromBookings: 0, bookedFromCalls: 1 }), 'May 2026'))
      .toContain('1 appointment in May');
  });
});

describe('buildRoiEmailHtml', () => {
  it('embeds the headline figure, stats, and a non-null ROI line', () => {
    const html = buildRoiEmailHtml('Hot HVAC', roi(), 'May 2026');
    expect(html).toContain('$4,200');
    expect(html).toContain('Hot HVAC');
    expect(html).toContain('1304% return');
    expect(html).toContain('/analytics');
  });
  it('omits the ROI line when roi is null (no plan cost)', () => {
    const html = buildRoiEmailHtml('Hot HVAC', roi({ roi: null }), 'May 2026');
    expect(html).not.toContain('% return');
  });
});

describe('sendMonthlyRoiEmail', () => {
  it('happy path: sends and logs with the month-keyed dedup type', async () => {
    const result = await sendMonthlyRoiEmail(7, new Date('2026-06-01T13:00:00Z'));
    expect(result).toEqual({ sent: true, subject: 'Your AI receptionist booked $4,200 in May' });

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail.mock.calls[0][0]).toMatchObject({ to: 'owner@hothvac.com' });

    expect(mockStorage.createNotificationLog).toHaveBeenCalledTimes(1);
    const log = mockStorage.createNotificationLog.mock.calls[0][0] as any;
    expect(log).toMatchObject({
      businessId: 7, type: 'monthly_roi:2026-05', channel: 'email',
      status: 'sent', referenceType: 'business', referenceId: 7,
    });
  });

  it('skips (already_sent) when a log for this month exists — no email, no new log', async () => {
    mockStorage.hasNotificationLogByType.mockResolvedValue(true);
    const result = await sendMonthlyRoiEmail(7, new Date('2026-06-01T13:00:00Z'));
    expect(result).toEqual({ sent: false, reason: 'already_sent' });
    expect(mockGetAiRoi).not.toHaveBeenCalled(); // cheap check happens before analytics
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockStorage.createNotificationLog).not.toHaveBeenCalled();
  });

  it('skips (no_activity) a zero-win month without sending or logging', async () => {
    mockGetAiRoi.mockResolvedValue(roi({ bookedFromCalls: 0, revenueFromBookings: 0 }));
    const result = await sendMonthlyRoiEmail(7, new Date('2026-06-01T13:00:00Z'));
    expect(result).toEqual({ sent: false, reason: 'no_activity' });
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockStorage.createNotificationLog).not.toHaveBeenCalled();
  });

  it('skips (no_owner_email) when the business has no owner email', async () => {
    mockStorage.getBusinessOwner.mockResolvedValue({ id: 1, email: null });
    const result = await sendMonthlyRoiEmail(7, new Date('2026-06-01T13:00:00Z'));
    expect(result).toEqual({ sent: false, reason: 'no_owner_email' });
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it('returns business_not_found when the business is missing', async () => {
    mockStorage.getBusiness.mockResolvedValue(undefined);
    const result = await sendMonthlyRoiEmail(7, new Date('2026-06-01T13:00:00Z'));
    expect(result).toEqual({ sent: false, reason: 'business_not_found' });
  });

  it('is fail-soft: a send error returns { sent:false, reason:error } and does not log', async () => {
    mockSendEmail.mockRejectedValue(new Error('smtp down'));
    const result = await sendMonthlyRoiEmail(7, new Date('2026-06-01T13:00:00Z'));
    expect(result).toEqual({ sent: false, reason: 'error' });
    expect(mockStorage.createNotificationLog).not.toHaveBeenCalled();
  });
});
