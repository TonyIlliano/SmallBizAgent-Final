/**
 * Morning Brief Service
 *
 * Generates and sends a daily summary email to business owners at 7am
 * in their local timezone. The brief is INDUSTRY-AWARE:
 *
 * - Salon/Barber: Appointments, clients, no-shows, at-risk clients (no invoices/revenue — we're not their payment processor)
 * - Restaurant: Reservations, covers, calls, POS orders (no appointments)
 * - Service trades (HVAC, Plumbing, Electrical, etc.): Jobs, invoices, revenue, appointments
 * - Auto/Computer Repair: Jobs, invoices, revenue, appointments
 * - Other: Shows all sections but hides any that are zero
 *
 * All businesses get: Calls, Agent Activity, Attention Items
 * Skips businesses with zero activity yesterday.
 */

import { storage } from '../storage';
import { sendEmail } from '../emailService';

// ============================================================
// Industry Classification
// ============================================================

type BusinessProfile = 'salon' | 'restaurant' | 'service_trade' | 'general';

/**
 * Classify a business industry into a profile that determines
 * which morning brief sections are relevant.
 */
function classifyIndustry(industry: string | null | undefined): BusinessProfile {
  if (!industry) return 'general';
  const lower = industry.toLowerCase();

  // Salon/Barber — appointment-based, we don't process payments
  if (lower.includes('salon') || lower.includes('barber') || lower.includes('spa')
    || lower.includes('nail') || lower.includes('hair') || lower.includes('beauty')) {
    return 'salon';
  }

  // Restaurant — reservations + POS, not appointments
  if (lower.includes('restaurant') || lower.includes('cafe') || lower.includes('bar')
    || lower.includes('pizza') || lower.includes('food') || lower.includes('bakery')
    || lower.includes('catering') || lower.includes('diner') || lower.includes('grill')) {
    return 'restaurant';
  }

  // Service trades — jobs + invoices + appointments, we ARE the payment processor
  if (lower.includes('plumb') || lower.includes('hvac') || lower.includes('electric')
    || lower.includes('landscap') || lower.includes('clean') || lower.includes('carpet')
    || lower.includes('roof') || lower.includes('floor') || lower.includes('paint')
    || lower.includes('pest') || lower.includes('pool') || lower.includes('contract')
    || lower.includes('construct') || lower.includes('handyman') || lower.includes('repair')
    || lower.includes('auto') || lower.includes('computer') || lower.includes('appliance')
    || lower.includes('dental') || lower.includes('moving') || lower.includes('locksmith')
    || lower.includes('tow') || lower.includes('garage') || lower.includes('mechanic')) {
    return 'service_trade';
  }

  return 'general';
}

/**
 * Get industry-appropriate labels.
 */
function getLabels(profile: BusinessProfile) {
  switch (profile) {
    case 'salon':
      return {
        bookingsTitle: 'Clients & Appointments',
        newBookingLabel: 'New Appointments',
        completedLabel: 'Completed',
        emoji: '💇',
      };
    case 'restaurant':
      return {
        bookingsTitle: 'Reservations',
        newBookingLabel: 'New Reservations',
        completedLabel: 'Seated/Completed',
        emoji: '🍽️',
      };
    case 'service_trade':
      return {
        bookingsTitle: 'Jobs & Appointments',
        newBookingLabel: 'New Appointments',
        completedLabel: 'Jobs Completed',
        emoji: '🔧',
      };
    default:
      return {
        bookingsTitle: 'Bookings',
        newBookingLabel: 'New Bookings',
        completedLabel: 'Completed',
        emoji: '📅',
      };
  }
}

// ============================================================
// Data Interfaces
// ============================================================

interface MorningBriefData {
  businessName: string;
  date: string;
  profile: BusinessProfile;
  industry: string;

  // Calls (all industries)
  totalCalls: number;
  answeredCalls: number;
  missedCalls: number;
  averageSentiment: number | null;
  averageCallDuration: number | null;

  // Appointments/Bookings (salon, service_trade, general)
  newAppointments: number;
  completedAppointments: number;
  noShows: number;
  cancellations: number;

  // Reservations (restaurant only)
  newReservations: number;
  totalCovers: number;
  reservationNoShows: number;
  reservationCancellations: number;

  // Jobs (service_trade only)
  jobsCompleted: number;
  jobsCreated: number;

  // Revenue/Invoices (service_trade, general — NOT salon/restaurant)
  invoicesPaid: number;
  totalCollected: number;

  // Agent Activity (all industries)
  followUpsSent: number;
  noShowRecoverySent: number;
  rebookingMessagesSent: number;
  reviewRequestsSent: number;

  // Attention Items (all industries)
  callsNeedingFollowUp: number;
  atRiskCustomers: number;
  missedCallDetails: Array<{ callerPhone: string; time: string }>;
  noShowDetails: Array<{ customerName: string; service: string }>;
}

// ============================================================
// Main Entry Point
// ============================================================

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

        // Gather yesterday's data (industry-aware)
        const profile = classifyIndustry(business.industry);
        const briefData = await gatherBriefData(business.id, business.name, business.industry || 'General', profile, tz);

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
        console.log(`[MorningBrief] Sent brief to ${owner.email} for business ${business.id} (${business.name}, ${profile})`);
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

// ============================================================
// Timezone Helpers
// ============================================================

function getHourInTimezone(date: Date, timezone: string): number {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    });
    return parseInt(formatter.format(date), 10);
  } catch {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      hour: 'numeric',
      hour12: false,
    });
    return parseInt(formatter.format(date), 10);
  }
}

function getYesterdayRange(timezone: string): { start: Date; end: Date; yesterdayDateStr: string } {
  const now = new Date();
  const todayStr = new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(now);
  const [year, month, day] = todayStr.split('-').map(Number);

  const todayLocal = new Date(year, month - 1, day);
  const yesterdayLocal = new Date(year, month - 1, day - 1);

  function toUTCMidnight(localDate: Date, tz: string): Date {
    const dateStr = `${localDate.getFullYear()}-${String(localDate.getMonth() + 1).padStart(2, '0')}-${String(localDate.getDate()).padStart(2, '0')}`;
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
    return new Date(new Date(`${dateStr}T00:00:00`).getTime() - offsetMs);
  }

  const yesterdayDateStr = `${yesterdayLocal.getFullYear()}-${String(yesterdayLocal.getMonth() + 1).padStart(2, '0')}-${String(yesterdayLocal.getDate()).padStart(2, '0')}`;

  return {
    start: toUTCMidnight(yesterdayLocal, timezone),
    end: toUTCMidnight(todayLocal, timezone),
    yesterdayDateStr,
  };
}

// ============================================================
// Data Gathering (Industry-Aware + Performance-Optimized)
// ============================================================

async function gatherBriefData(
  businessId: number,
  businessName: string,
  industry: string,
  profile: BusinessProfile,
  timezone: string
): Promise<MorningBriefData> {
  const { start, end, yesterdayDateStr } = getYesterdayRange(timezone);
  const dateStr = start.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  // === Fetch data in parallel — only query what the industry needs ===
  const fetchPromises: Promise<any>[] = [
    // All industries need calls
    storage.getCallLogs(businessId, { startDate: start, endDate: end }).catch(() => []),
    // All industries need agent logs
    storage.getAgentActivityLogs(businessId, { limit: 500 }).catch(() => []),
    // All industries need call intelligence for sentiment + follow-up flags
    storage.getCallIntelligenceByBusiness(businessId, { startDate: start, endDate: end, limit: 200 }).catch(() => []),
  ];

  // Appointment-based industries
  const needsAppointments = profile !== 'restaurant';
  if (needsAppointments) {
    fetchPromises.push(
      storage.getAppointmentsByBusinessId(businessId).catch(() => [])
    );
  }

  // Restaurant needs reservations
  const needsReservations = profile === 'restaurant';
  if (needsReservations) {
    fetchPromises.push(
      storage.getRestaurantReservations(businessId, { date: yesterdayDateStr }).catch(() => [])
    );
  }

  // Service trades need invoices (salons/restaurants typically don't use our invoicing)
  const needsInvoices = profile === 'service_trade' || profile === 'general';
  if (needsInvoices) {
    fetchPromises.push(
      storage.getInvoices(businessId).catch(() => [])
    );
  }

  // Service trades need jobs
  const needsJobs = profile === 'service_trade';
  if (needsJobs) {
    fetchPromises.push(
      storage.getJobs(businessId).catch(() => [])
    );
  }

  const results = await Promise.all(fetchPromises);

  // Unpack results in order
  let idx = 0;
  const callLogs = results[idx++] as any[];
  const agentLogs = results[idx++] as any[];
  const callIntelligence = results[idx++] as any[];
  const appointments = needsAppointments ? (results[idx++] as any[]) : [];
  const reservations = needsReservations ? (results[idx++] as any[]) : [];
  const invoices = needsInvoices ? (results[idx++] as any[]) : [];
  const jobs = needsJobs ? (results[idx++] as any[]) : [];

  // === Filter to yesterday's date range (for queries that don't support date params) ===
  const yesterdayCallLogs = callLogs; // already filtered by storage query
  const yesterdayIntelligence = callIntelligence; // already filtered by storage query with startDate/endDate

  const yesterdayAppointments = appointments.filter((a: any) =>
    a.createdAt && new Date(a.createdAt) >= start && new Date(a.createdAt) < end
  );
  const updatedAppointments = appointments.filter((a: any) =>
    a.updatedAt && new Date(a.updatedAt) >= start && new Date(a.updatedAt) < end
  );
  const yesterdayInvoices = invoices.filter((inv: any) => {
    if (inv.status !== 'paid') return false;
    const ts = inv.updatedAt || inv.createdAt;
    return ts && new Date(ts) >= start && new Date(ts) < end;
  });
  const yesterdayAgentLogs = agentLogs.filter((l: any) =>
    l.createdAt && new Date(l.createdAt) >= start && new Date(l.createdAt) < end
  );
  const yesterdayJobs = jobs.filter((j: any) =>
    j.updatedAt && new Date(j.updatedAt) >= start && new Date(j.updatedAt) < end
  );
  const newJobs = jobs.filter((j: any) =>
    j.createdAt && new Date(j.createdAt) >= start && new Date(j.createdAt) < end
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

  // === Restaurant reservations ===
  const confirmedReservations = reservations.filter((r: any) => r.status === 'confirmed' || r.status === 'seated' || r.status === 'completed');
  const newReservations = confirmedReservations.length;
  const totalCovers = confirmedReservations.reduce((sum: number, r: any) => sum + (Number(r.partySize) || 0), 0);
  const reservationNoShows = reservations.filter((r: any) => r.status === 'no_show').length;
  const reservationCancellations = reservations.filter((r: any) => r.status === 'cancelled').length;

  // === Jobs ===
  const jobsCompleted = yesterdayJobs.filter((j: any) => j.status === 'completed').length;
  const jobsCreated = newJobs.length;

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
    .slice(0, 5)
    .map((c: any) => ({
      callerPhone: c.callerId || 'Unknown',
      time: new Date(c.callTime || c.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }),
    }));

  // Resolve customer/service names for no-show details
  const noShowSource = profile === 'restaurant'
    ? reservations.filter((r: any) => r.status === 'no_show').slice(0, 5)
    : updatedAppointments.filter((a: any) => a.status === 'no_show').slice(0, 5);

  const noShowDetails = await Promise.all(
    noShowSource.map(async (item: any) => {
      let customerName = 'Unknown';
      let service = profile === 'restaurant' ? 'Reservation' : 'Service';
      try {
        if (item.customerId) {
          const customer = await storage.getCustomer(item.customerId);
          if (customer) customerName = `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || 'Unknown';
        }
        if (profile === 'restaurant') {
          service = `Party of ${item.partySize || '?'} at ${item.reservationTime || '?'}`;
        } else if (item.serviceId) {
          const svc = await storage.getService(item.serviceId);
          if (svc) service = svc.name;
        }
      } catch { /* best effort */ }
      return { customerName, service };
    })
  );

  return {
    businessName,
    date: dateStr,
    profile,
    industry,
    totalCalls,
    answeredCalls,
    missedCalls,
    averageSentiment,
    averageCallDuration,
    newAppointments,
    completedAppointments,
    noShows,
    cancellations,
    newReservations,
    totalCovers,
    reservationNoShows,
    reservationCancellations,
    jobsCompleted,
    jobsCreated,
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
    data.newReservations === 0 &&
    data.reservationNoShows === 0 &&
    data.invoicesPaid === 0 &&
    data.jobsCompleted === 0 &&
    data.jobsCreated === 0 &&
    data.followUpsSent === 0 &&
    data.noShowRecoverySent === 0 &&
    data.rebookingMessagesSent === 0 &&
    data.reviewRequestsSent === 0
  );
}

// ============================================================
// Email Formatting (Industry-Aware)
// ============================================================

function formatBriefEmail(data: MorningBriefData): { subject: string; html: string; text: string } {
  const labels = getLabels(data.profile);
  const subject = `☀️ Morning Brief — ${data.businessName} — ${data.date}`;

  // Sentiment display
  const sentimentEmoji = data.averageSentiment
    ? data.averageSentiment >= 4 ? '😊' : data.averageSentiment >= 3 ? '😐' : '😟'
    : '—';
  const sentimentText = data.averageSentiment ? `${data.averageSentiment.toFixed(1)}/5 ${sentimentEmoji}` : 'N/A';
  const durationText = data.averageCallDuration
    ? `${Math.round(data.averageCallDuration / 60)}m ${Math.round(data.averageCallDuration % 60)}s`
    : 'N/A';

  // Attention items
  const attentionItems: string[] = [];
  if (data.missedCalls > 0) attentionItems.push(`📞 ${data.missedCalls} missed call${data.missedCalls > 1 ? 's' : ''}`);
  const totalNoShows = data.profile === 'restaurant' ? data.reservationNoShows : data.noShows;
  if (totalNoShows > 0) attentionItems.push(`🚫 ${totalNoShows} no-show${totalNoShows > 1 ? 's' : ''}`);
  if (data.callsNeedingFollowUp > 0) attentionItems.push(`📋 ${data.callsNeedingFollowUp} call${data.callsNeedingFollowUp > 1 ? 's' : ''} needing follow-up`);
  if (data.atRiskCustomers > 0) attentionItems.push(`⚠️ ${data.atRiskCustomers} at-risk customer${data.atRiskCustomers > 1 ? 's' : ''}`);

  // === PLAIN TEXT (industry-aware) ===
  const textSections: string[] = [
    `Morning Brief — ${data.businessName}`,
    data.date,
    '',
    `📞 CALLS`,
    `Total: ${data.totalCalls} | Answered: ${data.answeredCalls} | Missed: ${data.missedCalls}`,
    `Avg Sentiment: ${sentimentText} | Avg Duration: ${durationText}`,
  ];

  // Bookings section — depends on industry
  if (data.profile === 'restaurant') {
    textSections.push(
      '',
      `🍽️ RESERVATIONS`,
      `Reservations: ${data.newReservations} | Covers: ${data.totalCovers} | No-Shows: ${data.reservationNoShows} | Cancelled: ${data.reservationCancellations}`,
    );
  } else {
    textSections.push(
      '',
      `${labels.emoji} ${labels.bookingsTitle.toUpperCase()}`,
      `New: ${data.newAppointments} | Completed: ${data.completedAppointments} | No-Shows: ${data.noShows} | Cancelled: ${data.cancellations}`,
    );
  }

  // Jobs section — service trades only
  if (data.profile === 'service_trade' && (data.jobsCreated > 0 || data.jobsCompleted > 0)) {
    textSections.push(
      '',
      `🔧 JOBS`,
      `Created: ${data.jobsCreated} | Completed: ${data.jobsCompleted}`,
    );
  }

  // Revenue section — service trades and general only
  if (data.profile === 'service_trade' || data.profile === 'general') {
    textSections.push(
      '',
      `💰 REVENUE`,
      `Invoices Paid: ${data.invoicesPaid} | Collected: $${data.totalCollected.toFixed(2)}`,
    );
  }

  // Agent activity — always show if there's any
  const totalAgentActions = data.followUpsSent + data.noShowRecoverySent + data.rebookingMessagesSent + data.reviewRequestsSent;
  if (totalAgentActions > 0) {
    textSections.push(
      '',
      `🤖 AGENT ACTIVITY`,
      `Follow-ups: ${data.followUpsSent} | No-show Recovery: ${data.noShowRecoverySent} | Rebooking: ${data.rebookingMessagesSent} | Reviews: ${data.reviewRequestsSent}`,
    );
  }

  // Attention items
  textSections.push(
    '',
    attentionItems.length > 0
      ? `🔔 NEEDS ATTENTION\n${attentionItems.join('\n')}`
      : '✅ No urgent items',
    '',
    '— SmallBizAgent',
  );

  const text = textSections.join('\n').trim();

  // === HTML (industry-aware) ===
  const htmlCards: string[] = [];

  // Calls card (always)
  htmlCards.push(`
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
  `);

  // Bookings/Reservations card — industry-specific
  if (data.profile === 'restaurant') {
    htmlCards.push(`
    <div class="card">
      <div class="section-title">🍽️ Reservations</div>
      <div class="stat-grid">
        <div class="stat-box">
          <div class="label">Reservations</div>
          <div class="value">${data.newReservations}</div>
        </div>
        <div class="stat-box">
          <div class="label">Total Covers</div>
          <div class="value">${data.totalCovers}</div>
        </div>
      </div>
      <div class="stat-row"><span class="stat-label">No-Shows</span><span class="stat-value" style="color: ${data.reservationNoShows > 0 ? '#ef4444' : '#1a1a1a'}">${data.reservationNoShows}</span></div>
      <div class="stat-row"><span class="stat-label">Cancelled</span><span class="stat-value">${data.reservationCancellations}</span></div>
    </div>
    `);
  } else {
    htmlCards.push(`
    <div class="card">
      <div class="section-title">${labels.emoji} ${labels.bookingsTitle}</div>
      <div class="stat-row"><span class="stat-label">${labels.newBookingLabel}</span><span class="stat-value">${data.newAppointments}</span></div>
      <div class="stat-row"><span class="stat-label">${labels.completedLabel}</span><span class="stat-value">${data.completedAppointments}</span></div>
      <div class="stat-row"><span class="stat-label">No-Shows</span><span class="stat-value" style="color: ${data.noShows > 0 ? '#ef4444' : '#1a1a1a'}">${data.noShows}</span></div>
      <div class="stat-row"><span class="stat-label">Cancelled</span><span class="stat-value">${data.cancellations}</span></div>
    </div>
    `);
  }

  // Jobs card — service trades only, and only if there's activity
  if (data.profile === 'service_trade' && (data.jobsCreated > 0 || data.jobsCompleted > 0)) {
    htmlCards.push(`
    <div class="card">
      <div class="section-title">🔧 Jobs</div>
      <div class="stat-row"><span class="stat-label">Created</span><span class="stat-value">${data.jobsCreated}</span></div>
      <div class="stat-row"><span class="stat-label">Completed</span><span class="stat-value">${data.jobsCompleted}</span></div>
    </div>
    `);
  }

  // Revenue card — service trades and general ONLY (not salon/restaurant)
  if (data.profile === 'service_trade' || data.profile === 'general') {
    htmlCards.push(`
    <div class="card">
      <div class="section-title">💰 Revenue</div>
      <div class="stat-row"><span class="stat-label">Invoices Paid</span><span class="stat-value">${data.invoicesPaid}</span></div>
      <div class="stat-row"><span class="stat-label">Total Collected</span><span class="stat-value" style="color: #16a34a">$${data.totalCollected.toFixed(2)}</span></div>
    </div>
    `);
  }

  // Agent activity card — show if there's any activity
  if (totalAgentActions > 0) {
    htmlCards.push(`
    <div class="card">
      <div class="section-title">🤖 Agent Activity</div>
      ${data.followUpsSent > 0 ? `<div class="stat-row"><span class="stat-label">Follow-ups Sent</span><span class="stat-value">${data.followUpsSent}</span></div>` : ''}
      ${data.noShowRecoverySent > 0 ? `<div class="stat-row"><span class="stat-label">No-Show Recovery</span><span class="stat-value">${data.noShowRecoverySent}</span></div>` : ''}
      ${data.rebookingMessagesSent > 0 ? `<div class="stat-row"><span class="stat-label">Rebooking Messages</span><span class="stat-value">${data.rebookingMessagesSent}</span></div>` : ''}
      ${data.reviewRequestsSent > 0 ? `<div class="stat-row"><span class="stat-label">Review Requests</span><span class="stat-value">${data.reviewRequestsSent}</span></div>` : ''}
    </div>
    `);
  }

  // Attention card
  if (attentionItems.length > 0) {
    htmlCards.push(`
    <div class="card attention">
      <div class="section-title">🔔 Needs Attention</div>
      ${attentionItems.map(item => `<div class="attention-item">${item}</div>`).join('')}
      ${data.missedCallDetails.length > 0 ? `
        <div style="margin-top: 8px; font-size: 13px; color: #666;">
          <strong>Missed calls:</strong><br>
          ${data.missedCallDetails.map(mc => `${mc.callerPhone} at ${mc.time}`).join('<br>')}
        </div>
      ` : ''}
      ${data.noShowDetails.length > 0 ? `
        <div style="margin-top: 8px; font-size: 13px; color: #666;">
          <strong>No-shows:</strong><br>
          ${data.noShowDetails.map(ns => `${ns.customerName} — ${ns.service}`).join('<br>')}
        </div>
      ` : ''}
    </div>
    `);
  } else {
    htmlCards.push(`
    <div class="card success">
      <div class="section-title">✅ All Clear</div>
      <p style="margin: 0; color: #166534; font-size: 14px;">No urgent items — great day yesterday!</p>
    </div>
    `);
  }

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

    ${htmlCards.join('\n')}

    <div class="footer">
      Powered by <a href="${process.env.APP_URL || 'https://www.smallbizagent.ai'}" style="color: #666;">SmallBizAgent</a>
    </div>
  </div>
</body>
</html>
  `.trim();

  return { subject, html, text };
}
