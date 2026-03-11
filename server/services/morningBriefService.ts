/**
 * Morning Brief Service
 *
 * Generates and sends a daily summary email to business owners at 7am
 * in their local timezone. Covers yesterday's activity:
 * - Call stats (total, answered, missed, avg sentiment)
 * - Booking stats (new, completed, no-shows, cancellations)
 * - Revenue (invoices paid, total collected)
 * - Agent activity (follow-ups, no-show recovery, rebooking)
 * - Attention items (missed calls, no-shows, follow-ups needed, at-risk customers)
 *
 * Skips businesses with zero activity yesterday.
 */

import { storage } from '../storage';
import { sendEmail } from '../emailService';

interface MorningBriefData {
  businessName: string;
  date: string; // Yesterday's date formatted

  // Calls
  totalCalls: number;
  answeredCalls: number;
  missedCalls: number;
  averageSentiment: number | null;
  averageCallDuration: number | null;

  // Bookings
  newAppointments: number;
  completedAppointments: number;
  noShows: number;
  cancellations: number;

  // Revenue
  invoicesPaid: number;
  totalCollected: number;

  // Agent Activity
  followUpsSent: number;
  noShowRecoverySent: number;
  rebookingMessagesSent: number;
  reviewRequestsSent: number;

  // Attention Items
  callsNeedingFollowUp: number;
  atRiskCustomers: number;
  missedCallDetails: Array<{ callerPhone: string; time: string }>;
  noShowDetails: Array<{ customerName: string; service: string }>;
}

/**
 * Check all businesses and send morning briefs to those where it's 7am.
 * Called hourly by the scheduler.
 */
export async function sendMorningBriefs(): Promise<void> {
  try {
    const allBusinesses = await storage.getAllBusinesses();
    const now = new Date();
    let briefsSent = 0;

    for (const business of allBusinesses) {
      try {
        // Determine if it's 7am in the business's timezone
        const tz = business.timezone || 'America/New_York';
        const businessHour = getHourInTimezone(now, tz);

        if (businessHour !== 7) continue;

        // Get the owner's email
        const owner = await storage.getBusinessOwner(business.id);
        if (!owner?.email) continue;

        // Gather yesterday's data
        const briefData = await gatherBriefData(business.id, business.name, tz);

        // Skip if no activity
        if (isZeroActivity(briefData)) {
          continue;
        }

        // Generate and send email
        const { subject, html, text } = formatBriefEmail(briefData);
        await sendEmail({
          to: owner.email,
          subject,
          text,
          html,
          senderName: 'SmallBizAgent',
        });

        briefsSent++;
        console.log(`[MorningBrief] Sent brief to ${owner.email} for business ${business.id} (${business.name})`);
      } catch (err) {
        console.error(`[MorningBrief] Error for business ${business.id}:`, err);
      }
    }

    if (briefsSent > 0) {
      console.log(`[MorningBrief] Sent ${briefsSent} morning briefs`);
    }
  } catch (err) {
    console.error('[MorningBrief] Error in sendMorningBriefs:', err);
  }
}

/**
 * Get the current hour (0-23) in a given timezone.
 */
function getHourInTimezone(date: Date, timezone: string): number {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    });
    return parseInt(formatter.format(date), 10);
  } catch {
    // Fallback to EST if timezone is invalid
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric',
      hour12: false,
    });
    return parseInt(formatter.format(date), 10);
  }
}

/**
 * Get the start and end of "yesterday" in a given timezone.
 * Returns UTC Date objects that represent midnight-to-midnight in the business timezone.
 */
function getYesterdayRange(timezone: string): { start: Date; end: Date } {
  const now = new Date();

  // Get today's date string in the business timezone (YYYY-MM-DD)
  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(now);
  const [year, month, day] = todayStr.split('-').map(Number);

  // Calculate yesterday
  const todayLocal = new Date(year, month - 1, day); // local date object
  const yesterdayLocal = new Date(year, month - 1, day - 1); // handles month boundaries

  // Convert timezone-local dates to UTC by calculating the offset
  // Get the UTC offset for this timezone at midnight of the target date
  function toUTCMidnight(localDate: Date, tz: string): Date {
    const dateStr = `${localDate.getFullYear()}-${String(localDate.getMonth() + 1).padStart(2, '0')}-${String(localDate.getDate()).padStart(2, '0')}`;
    // Create a date at noon UTC to avoid DST edge cases, then use formatter to find the offset
    const noonUTC = new Date(`${dateStr}T12:00:00Z`);
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false,
    }).formatToParts(noonUTC);

    const get = (type: string) => parseInt(parts.find(p => p.type === type)?.value || '0', 10);
    const localNoon = new Date(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
    const offsetMs = localNoon.getTime() - noonUTC.getTime();

    // Midnight in this timezone = midnight local time minus the offset
    return new Date(new Date(`${dateStr}T00:00:00`).getTime() - offsetMs);
  }

  const yesterdayDateStr = `${yesterdayLocal.getFullYear()}-${String(yesterdayLocal.getMonth() + 1).padStart(2, '0')}-${String(yesterdayLocal.getDate()).padStart(2, '0')}`;
  const todayDateStr = `${todayLocal.getFullYear()}-${String(todayLocal.getMonth() + 1).padStart(2, '0')}-${String(todayLocal.getDate()).padStart(2, '0')}`;

  return {
    start: toUTCMidnight(yesterdayLocal, timezone),
    end: toUTCMidnight(todayLocal, timezone),
  };
}

/**
 * Gather all data for the morning brief.
 */
async function gatherBriefData(
  businessId: number,
  businessName: string,
  timezone: string
): Promise<MorningBriefData> {
  const { start, end } = getYesterdayRange(timezone);
  const dateStr = start.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  // Fetch data in parallel — use date range params where available to avoid fetching all records
  const [callLogs, appointments, invoices, agentLogs, callIntelligence] = await Promise.all([
    storage.getCallLogs(businessId, { startDate: start, endDate: end }).catch(() => []),
    storage.getAppointmentsByBusinessId(businessId).catch(() => []),
    storage.getInvoices(businessId).catch(() => []),
    storage.getAgentActivityLogs(businessId, { limit: 500 }).catch(() => []),
    storage.getCallIntelligenceByBusiness(businessId, { limit: 200 }).catch(() => []),
  ]);

  // callLogs already filtered by date range from storage query
  const yesterdayCallLogs = callLogs;
  const yesterdayAppointments = appointments.filter((a: any) =>
    a.createdAt && new Date(a.createdAt) >= start && new Date(a.createdAt) < end
  );
  const updatedAppointments = appointments.filter((a: any) =>
    a.updatedAt && new Date(a.updatedAt) >= start && new Date(a.updatedAt) < end
  );
  // Invoices table has no `paidAt` — use status === 'paid' + updatedAt as proxy
  const yesterdayInvoices = invoices.filter((inv: any) => {
    if (inv.status !== 'paid') return false;
    const ts = inv.updatedAt || inv.createdAt;
    return ts && new Date(ts) >= start && new Date(ts) < end;
  });
  const yesterdayAgentLogs = agentLogs.filter((l: any) =>
    l.createdAt && new Date(l.createdAt) >= start && new Date(l.createdAt) < end
  );
  const yesterdayIntelligence = callIntelligence.filter((ci: any) =>
    ci.createdAt && new Date(ci.createdAt) >= start && new Date(ci.createdAt) < end
  );

  // === Call stats ===
  const totalCalls = yesterdayCallLogs.length;
  const answeredCalls = yesterdayCallLogs.filter((c: any) => c.status === 'completed' || c.callDuration > 0).length;
  const missedCalls = yesterdayCallLogs.filter((c: any) => c.status === 'missed' || c.status === 'no-answer').length;

  const sentiments = yesterdayIntelligence
    .map((ci: any) => ci.sentiment)
    .filter((s: any): s is number => s != null);
  const averageSentiment = sentiments.length > 0
    ? sentiments.reduce((a: number, b: number) => a + b, 0) / sentiments.length
    : null;

  const durations = yesterdayCallLogs
    .map((c: any) => c.callDuration)
    .filter((d: any): d is number => d != null && d > 0);
  const averageCallDuration = durations.length > 0
    ? durations.reduce((a: number, b: number) => a + b, 0) / durations.length
    : null;

  // === Booking stats ===
  const newAppointments = yesterdayAppointments.length;
  const completedAppointments = updatedAppointments.filter((a: any) => a.status === 'completed').length;
  const noShows = updatedAppointments.filter((a: any) => a.status === 'no_show').length;
  const cancellations = updatedAppointments.filter((a: any) => a.status === 'cancelled').length;

  // === Revenue ===
  const invoicesPaid = yesterdayInvoices.length;
  const totalCollected = yesterdayInvoices.reduce((sum: number, inv: any) => sum + (Number(inv.total) || 0), 0);

  // === Agent activity ===
  const followUpsSent = yesterdayAgentLogs.filter((l: any) => l.agentType === 'follow_up' && l.action === 'sms_sent').length;
  const noShowRecoverySent = yesterdayAgentLogs.filter((l: any) => l.agentType === 'no_show' && l.action === 'sms_sent').length;
  const rebookingMessagesSent = yesterdayAgentLogs.filter((l: any) => l.agentType === 'rebooking' && l.action === 'sms_sent').length;
  const reviewRequestsSent = yesterdayAgentLogs.filter((l: any) => l.agentType === 'review' && l.action === 'sms_sent').length;

  // === Attention items ===
  const callsNeedingFollowUp = yesterdayIntelligence.filter((ci: any) => ci.followUpNeeded).length;

  let atRiskCustomers = 0;
  try {
    const highRisk = await storage.getHighRiskCustomers(businessId);
    atRiskCustomers = highRisk.length;
  } catch { /* best effort */ }

  const missedCallDetails = yesterdayCallLogs
    .filter((c: any) => c.status === 'missed' || c.status === 'no-answer')
    .slice(0, 5) // Cap at 5 for email brevity
    .map((c: any) => ({
      callerPhone: c.callerId || 'Unknown',
      time: new Date(c.callTime || c.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
    }));

  // Resolve actual customer/service names for no-show appointments
  const noShowAppointments = updatedAppointments
    .filter((a: any) => a.status === 'no_show')
    .slice(0, 5);
  const noShowDetails = await Promise.all(
    noShowAppointments.map(async (a: any) => {
      let customerName = 'Unknown';
      let service = 'Service';
      try {
        if (a.customerId) {
          const customer = await storage.getCustomer(a.customerId);
          if (customer) customerName = `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || 'Unknown';
        }
        if (a.serviceId) {
          const svc = await storage.getService(a.serviceId);
          if (svc) service = svc.name;
        }
      } catch { /* best effort */ }
      return { customerName, service };
    })
  );

  return {
    businessName,
    date: dateStr,
    totalCalls,
    answeredCalls,
    missedCalls,
    averageSentiment,
    averageCallDuration,
    newAppointments,
    completedAppointments,
    noShows,
    cancellations,
    invoicesPaid,
    totalCollected,
    followUpsSent,
    noShowRecoverySent,
    rebookingMessagesSent,
    reviewRequestsSent,
    callsNeedingFollowUp,
    atRiskCustomers,
    missedCallDetails,
    noShowDetails,
  };
}

function isZeroActivity(data: MorningBriefData): boolean {
  return (
    data.totalCalls === 0 &&
    data.newAppointments === 0 &&
    data.completedAppointments === 0 &&
    data.noShows === 0 &&
    data.cancellations === 0 &&
    data.invoicesPaid === 0 &&
    data.followUpsSent === 0 &&
    data.noShowRecoverySent === 0 &&
    data.rebookingMessagesSent === 0 &&
    data.reviewRequestsSent === 0
  );
}

/**
 * Format the morning brief into email content.
 */
function formatBriefEmail(data: MorningBriefData): { subject: string; html: string; text: string } {
  const subject = `☀️ Morning Brief — ${data.businessName} — ${data.date}`;

  // Sentiment emoji
  const sentimentEmoji = data.averageSentiment
    ? data.averageSentiment >= 4 ? '😊' : data.averageSentiment >= 3 ? '😐' : '😟'
    : '—';
  const sentimentText = data.averageSentiment ? `${data.averageSentiment.toFixed(1)}/5 ${sentimentEmoji}` : 'N/A';

  // Duration format
  const durationText = data.averageCallDuration
    ? `${Math.round(data.averageCallDuration / 60)}m ${Math.round(data.averageCallDuration % 60)}s`
    : 'N/A';

  // Build attention items
  const attentionItems: string[] = [];
  if (data.missedCalls > 0) attentionItems.push(`📞 ${data.missedCalls} missed call${data.missedCalls > 1 ? 's' : ''}`);
  if (data.noShows > 0) attentionItems.push(`🚫 ${data.noShows} no-show${data.noShows > 1 ? 's' : ''}`);
  if (data.callsNeedingFollowUp > 0) attentionItems.push(`📋 ${data.callsNeedingFollowUp} call${data.callsNeedingFollowUp > 1 ? 's' : ''} needing follow-up`);
  if (data.atRiskCustomers > 0) attentionItems.push(`⚠️ ${data.atRiskCustomers} at-risk customer${data.atRiskCustomers > 1 ? 's' : ''}`);

  // Plain text version
  const text = `
Morning Brief — ${data.businessName}
${data.date}

📞 CALLS
Total: ${data.totalCalls} | Answered: ${data.answeredCalls} | Missed: ${data.missedCalls}
Avg Sentiment: ${sentimentText} | Avg Duration: ${durationText}

📅 BOOKINGS
New: ${data.newAppointments} | Completed: ${data.completedAppointments} | No-Shows: ${data.noShows} | Cancelled: ${data.cancellations}

💰 REVENUE
Invoices Paid: ${data.invoicesPaid} | Collected: $${data.totalCollected.toFixed(2)}

🤖 AGENT ACTIVITY
Follow-ups: ${data.followUpsSent} | No-show Recovery: ${data.noShowRecoverySent} | Rebooking: ${data.rebookingMessagesSent} | Reviews: ${data.reviewRequestsSent}

${attentionItems.length > 0 ? `🔔 NEEDS ATTENTION\n${attentionItems.join('\n')}` : '✅ No urgent items'}

— SmallBizAgent
  `.trim();

  // HTML version
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .card { background: white; border-radius: 12px; padding: 24px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .header { text-align: center; margin-bottom: 24px; }
    .header h1 { color: #1a1a1a; font-size: 22px; margin: 0; }
    .header p { color: #666; font-size: 14px; margin: 4px 0 0; }
    .section-title { font-size: 14px; font-weight: 600; color: #888; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 12px; }
    .stat-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f0f0f0; }
    .stat-row:last-child { border-bottom: none; }
    .stat-label { color: #666; font-size: 14px; }
    .stat-value { color: #1a1a1a; font-weight: 600; font-size: 14px; }
    .attention { background: #fff8f0; border-left: 4px solid #f59e0b; }
    .attention-item { padding: 6px 0; font-size: 14px; color: #92400e; }
    .success { background: #f0fdf4; border-left: 4px solid #22c55e; }
    .footer { text-align: center; color: #999; font-size: 12px; padding: 16px; }
    .big-number { font-size: 28px; font-weight: 700; color: #1a1a1a; }
    .stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 8px; }
    .stat-box { text-align: center; padding: 12px; background: #f8f9fa; border-radius: 8px; }
    .stat-box .label { font-size: 12px; color: #888; }
    .stat-box .value { font-size: 20px; font-weight: 600; color: #1a1a1a; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>☀️ Morning Brief</h1>
      <p>${data.businessName} — ${data.date}</p>
    </div>

    <div class="card">
      <div class="section-title">📞 Calls</div>
      <div class="stat-grid">
        <div class="stat-box">
          <div class="label">Total</div>
          <div class="value">${data.totalCalls}</div>
        </div>
        <div class="stat-box">
          <div class="label">Answered</div>
          <div class="value">${data.answeredCalls}</div>
        </div>
        <div class="stat-box">
          <div class="label">Missed</div>
          <div class="value" style="color: ${data.missedCalls > 0 ? '#ef4444' : '#1a1a1a'}">${data.missedCalls}</div>
        </div>
        <div class="stat-box">
          <div class="label">Sentiment</div>
          <div class="value">${sentimentText}</div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="section-title">📅 Bookings</div>
      <div class="stat-row"><span class="stat-label">New Appointments</span><span class="stat-value">${data.newAppointments}</span></div>
      <div class="stat-row"><span class="stat-label">Completed</span><span class="stat-value">${data.completedAppointments}</span></div>
      <div class="stat-row"><span class="stat-label">No-Shows</span><span class="stat-value" style="color: ${data.noShows > 0 ? '#ef4444' : '#1a1a1a'}">${data.noShows}</span></div>
      <div class="stat-row"><span class="stat-label">Cancelled</span><span class="stat-value">${data.cancellations}</span></div>
    </div>

    <div class="card">
      <div class="section-title">💰 Revenue</div>
      <div class="stat-row"><span class="stat-label">Invoices Paid</span><span class="stat-value">${data.invoicesPaid}</span></div>
      <div class="stat-row"><span class="stat-label">Total Collected</span><span class="stat-value" style="color: #16a34a">$${data.totalCollected.toFixed(2)}</span></div>
    </div>

    <div class="card">
      <div class="section-title">🤖 Agent Activity</div>
      <div class="stat-row"><span class="stat-label">Follow-ups Sent</span><span class="stat-value">${data.followUpsSent}</span></div>
      <div class="stat-row"><span class="stat-label">No-Show Recovery</span><span class="stat-value">${data.noShowRecoverySent}</span></div>
      <div class="stat-row"><span class="stat-label">Rebooking Messages</span><span class="stat-value">${data.rebookingMessagesSent}</span></div>
      <div class="stat-row"><span class="stat-label">Review Requests</span><span class="stat-value">${data.reviewRequestsSent}</span></div>
    </div>

    ${attentionItems.length > 0 ? `
    <div class="card attention">
      <div class="section-title">🔔 Needs Attention</div>
      ${attentionItems.map(item => `<div class="attention-item">${item}</div>`).join('')}
      ${data.missedCallDetails.length > 0 ? `
        <div style="margin-top: 8px; font-size: 13px; color: #666;">
          <strong>Missed calls:</strong><br>
          ${data.missedCallDetails.map(mc => `${mc.callerPhone} at ${mc.time}`).join('<br>')}
        </div>
      ` : ''}
    </div>
    ` : `
    <div class="card success">
      <div class="section-title">✅ All Clear</div>
      <p style="margin: 0; color: #166534; font-size: 14px;">No urgent items — great day yesterday!</p>
    </div>
    `}

    <div class="footer">
      Powered by <a href="${process.env.APP_URL || 'https://www.smallbizagent.ai'}" style="color: #666;">SmallBizAgent</a>
    </div>
  </div>
</body>
</html>
  `.trim();

  return { subject, html, text };
}
