/**
 * Monthly AI-ROI Email
 *
 * A focused, once-a-month "here's the money your AI made you" email to the
 * business owner — the retention/renewal centerpiece the audit called for.
 * Distinct from the weekly report (which buries AI ROI in a multi-section
 * digest): this is a single punchy message leading with the dollar figure.
 *
 * Reports the PREVIOUS complete calendar month (sent on the 1st), so the
 * number is a full month of data, not a rolling partial window.
 *
 * Quality gate: businesses with no AI-attributed wins that month are skipped
 * — we never send a demoralizing "$0 / 0 bookings" email. This also keeps
 * volume sane without needing an opt-out column (weekly reports are ungated
 * today; this matches that convention but only fires when there's good news).
 *
 * Once-per-month-per-business is enforced via notification_log
 * (type = `monthly_roi:YYYY-MM`).
 */

import { storage } from '../storage';
import { sendEmail } from '../emailService';
import { getAiRoiAnalytics } from './analyticsService';

const APP_URL = process.env.APP_URL || 'https://smallbizagent.ai';

export interface PreviousMonthRange {
  startDate: Date;
  endDate: Date;
  monthKey: string;   // YYYY-MM of the reported month (dedup key + log)
  monthLabel: string; // e.g. "May 2026" (human display)
}

/**
 * The previous calendar month as a UTC range. Pure — takes `now` for testing.
 * Edge effects from using UTC boundaries (vs. each business's timezone) are
 * negligible for a whole-month aggregate.
 */
export function previousMonthRange(now: Date): PreviousMonthRange {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth(); // 0-based; previous month is m-1 (Date handles Jan rollover)
  const startDate = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
  const endDate = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999)); // day 0 of this month = last day of prev
  const monthKey = `${startDate.getUTCFullYear()}-${String(startDate.getUTCMonth() + 1).padStart(2, '0')}`;
  const monthLabel = startDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return { startDate, endDate, monthKey, monthLabel };
}

type Roi = Awaited<ReturnType<typeof getAiRoiAnalytics>>;

/** True when the month has nothing worth bragging about → no email. */
export function hasNoAiWins(roi: Roi): boolean {
  return (roi.bookedFromCalls || 0) <= 0 && (roi.revenueFromBookings || 0) <= 0;
}

function money(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US');
}

export function buildRoiEmailSubject(roi: Roi, monthLabel: string): string {
  if ((roi.revenueFromBookings || 0) > 0) {
    return `Your AI receptionist booked ${money(roi.revenueFromBookings)} in ${monthLabel.split(' ')[0]}`;
  }
  const n = roi.bookedFromCalls || 0;
  return `Your AI receptionist booked ${n} ${n === 1 ? 'appointment' : 'appointments'} in ${monthLabel.split(' ')[0]}`;
}

export function buildRoiEmailHtml(businessName: string, roi: Roi, monthLabel: string): string {
  const headline = (roi.revenueFromBookings || 0) > 0
    ? money(roi.revenueFromBookings)
    : `${roi.bookedFromCalls || 0} ${(roi.bookedFromCalls || 0) === 1 ? 'booking' : 'bookings'}`;
  const headlineCaption = (roi.revenueFromBookings || 0) > 0
    ? `in revenue from appointments your AI booked over the phone`
    : `appointments booked by your AI receptionist`;

  const stat = (value: string, label: string) => `
    <td style="padding:12px 8px;text-align:center;">
      <div style="font-size:22px;font-weight:700;color:#0f172a;">${value}</div>
      <div style="font-size:12px;color:#64748b;margin-top:2px;">${label}</div>
    </td>`;

  const roiLine = roi.roi !== null && roi.roi !== undefined
    ? `<p style="font-size:14px;color:#16a34a;font-weight:600;margin:0 0 4px;">That's a ${roi.roi}% return on your subscription.</p>`
    : '';

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Your AI ROI — ${monthLabel}</title></head>
<body style="margin:0;background:#f1f5f9;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px;">
    <div style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
      <div style="background:#0f172a;padding:20px 24px;">
        <div style="color:#94a3b8;font-size:13px;letter-spacing:.04em;text-transform:uppercase;">${monthLabel} · ${businessName}</div>
        <div style="color:#ffffff;font-size:18px;font-weight:600;margin-top:4px;">Your AI receptionist report</div>
      </div>
      <div style="padding:28px 24px;text-align:center;">
        <div style="font-size:44px;font-weight:800;color:#0f172a;line-height:1;">${headline}</div>
        <p style="font-size:14px;color:#475569;margin:10px 0 16px;">${headlineCaption}.</p>
        ${roiLine}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;border-top:1px solid #e2e8f0;">
          <tr>
            ${stat(String(roi.totalCalls || 0), 'calls answered')}
            ${stat(String(roi.bookedFromCalls || 0), 'turned into bookings')}
            ${stat(`${roi.conversionRate || 0}%`, 'conversion rate')}
          </tr>
        </table>
        <a href="${APP_URL}/analytics" style="display:inline-block;margin-top:24px;background:#0f172a;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 24px;border-radius:8px;">See the full breakdown</a>
      </div>
    </div>
    <p style="text-align:center;color:#94a3b8;font-size:12px;margin-top:16px;">
      You're getting this because your AI receptionist booked work for you last month.<br>
      Manage your plan in <a href="${APP_URL}/settings" style="color:#64748b;">Settings</a>.
    </p>
  </div>
</body></html>`;
}

export type SendResult =
  | { sent: true; subject: string }
  | { sent: false; reason: 'business_not_found' | 'no_owner_email' | 'no_activity' | 'already_sent' | 'error' };

/**
 * Send the monthly ROI email for one business. Idempotent per calendar month,
 * fail-soft (returns a discriminated result rather than throwing).
 */
export async function sendMonthlyRoiEmail(businessId: number, now: Date = new Date()): Promise<SendResult> {
  try {
    const business = await storage.getBusiness(businessId);
    if (!business) return { sent: false, reason: 'business_not_found' };

    const { startDate, endDate, monthKey, monthLabel } = previousMonthRange(now);
    const dedupType = `monthly_roi:${monthKey}`;

    // Cheap dedup check before doing any analytics work
    if (await storage.hasNotificationLogByType(businessId, dedupType, 'sent')) {
      return { sent: false, reason: 'already_sent' };
    }

    const roi = await getAiRoiAnalytics(businessId, { startDate, endDate });
    if (hasNoAiWins(roi)) return { sent: false, reason: 'no_activity' };

    const owner = await storage.getBusinessOwner(businessId);
    if (!owner?.email) return { sent: false, reason: 'no_owner_email' };

    const subject = buildRoiEmailSubject(roi, monthLabel);
    const html = buildRoiEmailHtml(business.name, roi, monthLabel);

    await sendEmail({
      to: owner.email,
      subject,
      text: `Your AI receptionist's ${monthLabel} report is ready. See the full breakdown at ${APP_URL}/analytics`,
      html,
    });

    await storage.createNotificationLog({
      businessId,
      type: dedupType,
      channel: 'email',
      recipient: owner.email,
      subject,
      status: 'sent',
      referenceType: 'business',
      referenceId: businessId,
    });

    console.log(`[MonthlyRoiEmail] Sent ${monthLabel} report to ${owner.email} (business ${businessId})`);
    return { sent: true, subject };
  } catch (error) {
    console.error(`[MonthlyRoiEmail] Failed for business ${businessId}:`, error);
    return { sent: false, reason: 'error' };
  }
}

/** Batch send, rate-limited (mirrors processWeeklyReports). */
export async function processMonthlyRoiEmails(businessIds: number[]): Promise<{ sent: number; skipped: number }> {
  let sent = 0;
  let skipped = 0;
  for (const businessId of businessIds) {
    const result = await sendMonthlyRoiEmail(businessId);
    if (result.sent) sent++; else skipped++;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  return { sent, skipped };
}
