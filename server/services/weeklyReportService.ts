/**
 * Weekly Business Report Service
 *
 * Generates comprehensive HTML reports for business owners covering:
 * - Revenue summary (total, paid, pending, overdue)
 * - Call performance (total, answered, missed, conversion rate)
 * - Appointment summary (completed, upcoming, no-shows)
 * - Customer insights (new, returning, top customers)
 * - Job performance (completion rate, avg duration)
 * - AI ROI (calls → bookings → revenue)
 *
 * Reports can be:
 * 1. Downloaded as HTML (prints to PDF in browser)
 * 2. Emailed weekly to business owners
 * 3. Viewed inline in the analytics page
 */

import * as analyticsService from './analyticsService';
import { storage } from '../storage';
import { sendEmail } from '../emailService';
import { db } from '../db';
import { businesses, users } from '../../shared/schema';
import { eq, and, not, isNull, inArray } from 'drizzle-orm';

interface ReportOptions {
  businessId: number;
  period: 'week' | 'month' | 'quarter' | 'year';
}

function getDateRange(period: string): { startDate: Date; endDate: Date } {
  const today = new Date();
  const endDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 23, 59, 59);
  let startDate: Date;

  switch (period) {
    case 'week':
      startDate = new Date(today);
      startDate.setDate(today.getDate() - 7);
      break;
    case 'month':
      startDate = new Date(today.getFullYear(), today.getMonth() - 1, today.getDate());
      break;
    case 'quarter':
      startDate = new Date(today.getFullYear(), today.getMonth() - 3, today.getDate());
      break;
    case 'year':
      startDate = new Date(today.getFullYear() - 1, today.getMonth(), today.getDate());
      break;
    default:
      startDate = new Date(today);
      startDate.setDate(today.getDate() - 7);
  }

  return { startDate, endDate };
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100) / 100}%`;
}

function formatDateRange(start: Date, end: Date): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
  return `${start.toLocaleDateString('en-US', opts)} — ${end.toLocaleDateString('en-US', opts)}`;
}

function periodLabel(period: string): string {
  switch (period) {
    case 'week': return 'Weekly';
    case 'month': return 'Monthly';
    case 'quarter': return 'Quarterly';
    case 'year': return 'Annual';
    default: return 'Weekly';
  }
}

/**
 * Generate a full HTML business report
 */
export async function generateReport(options: ReportOptions): Promise<{ html: string; subject: string }> {
  const { businessId, period } = options;
  const dateRange = getDateRange(period);

  const business = await storage.getBusiness(businessId);
  if (!business) throw new Error('Business not found');

  // Fetch all analytics in parallel
  const [revenue, jobData, apptData, callData, customerData, performance, aiRoi] = await Promise.all([
    analyticsService.getRevenueAnalytics(businessId, dateRange),
    analyticsService.getJobAnalytics(businessId, dateRange),
    analyticsService.getAppointmentAnalytics(businessId, dateRange),
    analyticsService.getCallAnalytics(businessId, dateRange),
    analyticsService.getCustomerAnalytics(businessId, dateRange),
    analyticsService.getPerformanceMetrics(businessId, dateRange),
    analyticsService.getAiRoiAnalytics(businessId, dateRange).catch(() => null),
  ]);

  const periodName = periodLabel(period);
  const dateRangeStr = formatDateRange(dateRange.startDate, dateRange.endDate);
  const subject = `${periodName} Report for ${business.name} — ${dateRangeStr}`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1a1a1a; background: #f8f9fa; line-height: 1.6; }
    .container { max-width: 800px; margin: 0 auto; background: white; }
    .header { background: linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%); color: white; padding: 40px 32px; }
    .header h1 { font-size: 28px; font-weight: 700; margin-bottom: 4px; }
    .header .subtitle { font-size: 14px; opacity: 0.85; }
    .header .period { display: inline-block; background: rgba(255,255,255,0.2); padding: 4px 12px; border-radius: 20px; font-size: 13px; margin-top: 12px; }
    .section { padding: 32px; border-bottom: 1px solid #e5e7eb; }
    .section:last-child { border-bottom: none; }
    .section-title { font-size: 18px; font-weight: 600; color: #1e3a5f; margin-bottom: 20px; display: flex; align-items: center; gap: 8px; }
    .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 16px; }
    .kpi { background: #f8f9fa; border-radius: 12px; padding: 20px; text-align: center; }
    .kpi .value { font-size: 28px; font-weight: 700; color: #1e3a5f; }
    .kpi .label { font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px; }
    .kpi.green .value { color: #059669; }
    .kpi.red .value { color: #dc2626; }
    .kpi.blue .value { color: #2563eb; }
    .kpi.amber .value { color: #d97706; }
    .table { width: 100%; border-collapse: collapse; margin-top: 16px; }
    .table th { background: #f3f4f6; padding: 10px 16px; text-align: left; font-size: 12px; text-transform: uppercase; color: #6b7280; letter-spacing: 0.5px; }
    .table td { padding: 10px 16px; border-bottom: 1px solid #f3f4f6; font-size: 14px; }
    .bar-container { background: #e5e7eb; border-radius: 4px; height: 8px; width: 100%; overflow: hidden; }
    .bar-fill { height: 100%; border-radius: 4px; background: #2563eb; }
    .bar-fill.green { background: #059669; }
    .bar-fill.amber { background: #d97706; }
    .bar-fill.red { background: #dc2626; }
    .highlight-box { background: linear-gradient(135deg, #eff6ff, #dbeafe); border-radius: 12px; padding: 24px; margin-top: 16px; border-left: 4px solid #2563eb; }
    .highlight-box .title { font-weight: 600; color: #1e3a5f; margin-bottom: 8px; }
    .footer { padding: 32px; text-align: center; color: #9ca3af; font-size: 12px; background: #f8f9fa; }
    .footer a { color: #2563eb; text-decoration: none; }
    @media print { body { background: white; } .container { box-shadow: none; } }
    @media (max-width: 600px) { .kpi-grid { grid-template-columns: repeat(2, 1fr); } .section { padding: 24px 16px; } }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <div class="header">
      <h1>${business.name}</h1>
      <div class="subtitle">${periodName} Business Report</div>
      <div class="period">${dateRangeStr}</div>
    </div>

    <!-- Revenue -->
    <div class="section">
      <div class="section-title">Revenue Overview</div>
      <div class="kpi-grid">
        <div class="kpi green">
          <div class="value">${formatCurrency(revenue.paidRevenue)}</div>
          <div class="label">Collected</div>
        </div>
        <div class="kpi amber">
          <div class="value">${formatCurrency(revenue.pendingRevenue)}</div>
          <div class="label">Pending</div>
        </div>
        <div class="kpi red">
          <div class="value">${formatCurrency(revenue.overdueRevenue)}</div>
          <div class="label">Overdue</div>
        </div>
        <div class="kpi blue">
          <div class="value">${formatCurrency(revenue.totalRevenue)}</div>
          <div class="label">Total Revenue</div>
        </div>
      </div>
      ${revenue.revenueByMonth.length > 0 ? `
      <div style="margin-top: 20px;">
        <table class="table">
          <thead><tr><th>Month</th><th>Revenue</th><th></th></tr></thead>
          <tbody>
            ${revenue.revenueByMonth.map(m => {
              const maxRev = Math.max(...revenue.revenueByMonth.map(r => r.revenue), 1);
              const pct = (m.revenue / maxRev) * 100;
              return `<tr><td>${m.month}</td><td>${formatCurrency(m.revenue)}</td><td><div class="bar-container"><div class="bar-fill green" style="width:${pct}%"></div></div></td></tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>` : ''}
    </div>

    <!-- Calls -->
    <div class="section">
      <div class="section-title">AI Receptionist Calls</div>
      <div class="kpi-grid">
        <div class="kpi blue">
          <div class="value">${callData.totalCalls}</div>
          <div class="label">Total Calls</div>
        </div>
        <div class="kpi green">
          <div class="value">${callData.answeredCalls}</div>
          <div class="label">Answered</div>
        </div>
        <div class="kpi red">
          <div class="value">${callData.missedCalls}</div>
          <div class="label">Missed</div>
        </div>
        <div class="kpi">
          <div class="value">${callData.totalCalls > 0 ? formatPercent((callData.answeredCalls / callData.totalCalls) * 100) : '0%'}</div>
          <div class="label">Answer Rate</div>
        </div>
      </div>
      ${callData.intentBreakdown.length > 0 ? `
      <div style="margin-top: 20px;">
        <table class="table">
          <thead><tr><th>Caller Intent</th><th>Count</th><th></th></tr></thead>
          <tbody>
            ${callData.intentBreakdown.slice(0, 8).map(i => {
              const maxCount = Math.max(...callData.intentBreakdown.map(x => x.count), 1);
              return `<tr><td style="text-transform:capitalize">${i.intent.replace(/_/g, ' ')}</td><td>${i.count}</td><td><div class="bar-container"><div class="bar-fill" style="width:${(i.count / maxCount) * 100}%"></div></div></td></tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>` : ''}
    </div>

    <!-- Appointments -->
    <div class="section">
      <div class="section-title">Appointments</div>
      <div class="kpi-grid">
        <div class="kpi green">
          <div class="value">${apptData.completedAppointments}</div>
          <div class="label">Completed</div>
        </div>
        <div class="kpi blue">
          <div class="value">${apptData.upcomingAppointments}</div>
          <div class="label">Upcoming</div>
        </div>
        <div class="kpi">
          <div class="value">${apptData.totalAppointments}</div>
          <div class="label">Total</div>
        </div>
        <div class="kpi">
          <div class="value">${apptData.totalAppointments > 0 ? formatPercent((apptData.completedAppointments / apptData.totalAppointments) * 100) : '0%'}</div>
          <div class="label">Completion Rate</div>
        </div>
      </div>
      ${apptData.appointmentsByStaff.length > 0 ? `
      <div style="margin-top: 20px;">
        <table class="table">
          <thead><tr><th>Staff Member</th><th>Appointments</th><th></th></tr></thead>
          <tbody>
            ${apptData.appointmentsByStaff.slice(0, 10).map(s => {
              const maxStaff = Math.max(...apptData.appointmentsByStaff.map(x => x.count), 1);
              return `<tr><td>${s.staffName}</td><td>${s.count}</td><td><div class="bar-container"><div class="bar-fill" style="width:${(s.count / maxStaff) * 100}%"></div></div></td></tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>` : ''}
    </div>

    <!-- Customers -->
    <div class="section">
      <div class="section-title">Customers</div>
      <div class="kpi-grid">
        <div class="kpi blue">
          <div class="value">${customerData.totalCustomers}</div>
          <div class="label">Total Customers</div>
        </div>
        <div class="kpi green">
          <div class="value">${customerData.newCustomers}</div>
          <div class="label">New This Period</div>
        </div>
        <div class="kpi">
          <div class="value">${customerData.returningCustomers}</div>
          <div class="label">Returning</div>
        </div>
      </div>
      ${customerData.topCustomers.length > 0 ? `
      <div style="margin-top: 20px;">
        <table class="table">
          <thead><tr><th>Customer</th><th>Revenue</th><th>Jobs</th></tr></thead>
          <tbody>
            ${customerData.topCustomers.slice(0, 5).map(c =>
              `<tr><td>${c.customerName}</td><td>${formatCurrency(c.revenue)}</td><td>${c.jobCount}</td></tr>`
            ).join('')}
          </tbody>
        </table>
      </div>` : ''}
    </div>

    <!-- Performance -->
    <div class="section">
      <div class="section-title">Performance Metrics</div>
      <div class="kpi-grid">
        <div class="kpi">
          <div class="value">${formatCurrency(performance.revenuePerJob)}</div>
          <div class="label">Revenue / Job</div>
        </div>
        <div class="kpi ${performance.jobCompletionRate >= 80 ? 'green' : performance.jobCompletionRate >= 60 ? 'amber' : 'red'}">
          <div class="value">${formatPercent(performance.jobCompletionRate)}</div>
          <div class="label">Job Completion</div>
        </div>
        <div class="kpi">
          <div class="value">${performance.averageJobDuration > 0 ? `${Math.round(performance.averageJobDuration)}h` : 'N/A'}</div>
          <div class="label">Avg Job Duration</div>
        </div>
        <div class="kpi ${performance.callConversionRate >= 30 ? 'green' : performance.callConversionRate >= 15 ? 'amber' : ''}">
          <div class="value">${formatPercent(performance.callConversionRate)}</div>
          <div class="label">Call Conversion</div>
        </div>
      </div>
    </div>

    <!-- AI ROI -->
    ${aiRoi ? `
    <div class="section">
      <div class="section-title">AI Return on Investment</div>
      <div class="highlight-box">
        <div class="title">Your AI receptionist generated ${formatCurrency(aiRoi.revenueFromBookings || 0)} in revenue</div>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 16px; margin-top: 12px;">
          <div>
            <div style="font-size: 24px; font-weight: 700; color: #1e3a5f;">${aiRoi.totalCalls || 0}</div>
            <div style="font-size: 12px; color: #6b7280;">AI Calls Answered</div>
          </div>
          <div>
            <div style="font-size: 24px; font-weight: 700; color: #059669;">${aiRoi.bookedFromCalls || 0}</div>
            <div style="font-size: 12px; color: #6b7280;">Bookings Made</div>
          </div>
          <div>
            <div style="font-size: 24px; font-weight: 700; color: #2563eb;">${formatPercent(aiRoi.conversionRate || 0)}</div>
            <div style="font-size: 12px; color: #6b7280;">Conversion Rate</div>
          </div>
          <div>
            <div style="font-size: 24px; font-weight: 700; color: #059669;">${formatPercent(aiRoi.roi || 0)}</div>
            <div style="font-size: 12px; color: #6b7280;">ROI</div>
          </div>
        </div>
      </div>
    </div>` : ''}

    <!-- Footer -->
    <div class="footer">
      <p>Generated by <a href="${process.env.APP_URL || 'https://smallbizagent.ai'}">SmallBizAgent</a> on ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
      <p style="margin-top: 8px;">To adjust report settings, visit your <a href="${process.env.APP_URL || 'https://smallbizagent.ai'}/settings">Settings</a> page.</p>
    </div>
  </div>
</body>
</html>`;

  return { html, subject };
}

/**
 * Send a weekly report email to the business owner
 */
export async function sendWeeklyReport(businessId: number): Promise<boolean> {
  try {
    const business = await storage.getBusiness(businessId);
    if (!business) return false;

    // Find the owner's email
    const owner = await storage.getBusinessOwner(businessId);
    if (!owner?.email) return false;

    const { html, subject } = await generateReport({ businessId, period: 'week' });

    await sendEmail({
      to: owner.email,
      subject,
      text: `Your weekly business report is ready. View it in your dashboard at ${process.env.APP_URL || 'https://smallbizagent.ai'}/analytics`,
      html,
    });

    console.log(`[WeeklyReport] Sent to ${owner.email} for business ${business.name}`);
    return true;
  } catch (error) {
    console.error(`[WeeklyReport] Failed for business ${businessId}:`, error);
    return false;
  }
}

/**
 * Process weekly reports for all active businesses
 * Called by the scheduler every Monday at 8 AM in each business timezone
 */
export async function processWeeklyReports(businessIds: number[]): Promise<void> {
  for (const businessId of businessIds) {
    try {
      await sendWeeklyReport(businessId);
      // Small delay between emails to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (err) {
      console.error(`[WeeklyReport] Error for business ${businessId}:`, err);
    }
  }
}
