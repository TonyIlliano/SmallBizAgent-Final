/**
 * Daily Digest Service
 *
 * Sends each business owner a morning summary email with:
 * - Today's appointments
 * - Yesterday's revenue collected
 * - Overdue invoices needing attention
 * - Missed calls (last 24 hours)
 *
 * Called daily by the scheduler (8:00 AM in business timezone, or ~8 AM ET as fallback).
 */

import { storage } from "../storage";
import { sendEmail } from "../emailService";

const APP_URL = process.env.APP_URL || "https://www.smallbizagent.ai";

/**
 * Process daily digest for active businesses.
 * @param businessIds — optional list of business IDs to send to (timezone-filtered by scheduler).
 *                      If omitted, sends to all active businesses (legacy behavior).
 */
export async function processDailyDigests(businessIds?: number[]): Promise<void> {
  try {
    console.log(`[DailyDigest] Starting at ${new Date().toISOString()}`);
    let businesses = await storage.getAllBusinesses();

    // If caller supplied a filtered list of IDs, only process those
    if (businessIds && businessIds.length > 0) {
      const idSet = new Set(businessIds);
      businesses = businesses.filter((b) => idSet.has(b.id));
    }

    let sent = 0;

    for (const business of businesses) {
      try {
        if (!business.email) continue;

        // Skip inactive businesses
        const status = (business as any).subscriptionStatus;
        if (status === "canceled" || status === "unpaid") continue;

        const didSend = await sendDigestForBusiness(business);
        if (didSend) sent++;
      } catch (err) {
        console.error(`[DailyDigest] Error for business ${business.id}:`, err);
      }
    }

    console.log(`[DailyDigest] Done — sent ${sent} digests`);
  } catch (error) {
    console.error("[DailyDigest] Fatal error:", error);
  }
}

async function sendDigestForBusiness(business: any): Promise<boolean> {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);

  // ── Today's appointments ──
  let todaysAppointments: any[] = [];
  try {
    const allAppts = await storage.getAppointments(business.id, {
      startDate: todayStart,
      endDate: todayEnd,
    });
    todaysAppointments = allAppts.filter(
      (a) => a.status === "scheduled" || a.status === "confirmed"
    );
  } catch { /* no appointments */ }

  // ── Yesterday's revenue (paid invoices) ──
  let yesterdayRevenue = 0;
  let paidCount = 0;
  try {
    const invoices = await storage.getInvoices(business.id);
    for (const inv of invoices) {
      if (inv.status === "paid" && inv.updatedAt) {
        const paidDate = new Date(inv.updatedAt);
        if (paidDate >= yesterdayStart && paidDate < todayStart) {
          yesterdayRevenue += parseFloat(String(inv.total || 0));
          paidCount++;
        }
      }
    }
  } catch { /* no invoices */ }

  // ── Overdue invoices ──
  let overdueInvoices: any[] = [];
  try {
    const invoices = await storage.getInvoices(business.id);
    overdueInvoices = invoices.filter((inv) => inv.status === "overdue");
  } catch { /* no invoices */ }

  const overdueTotal = overdueInvoices.reduce(
    (sum, inv) => sum + parseFloat(String(inv.total || 0)),
    0
  );

  // ── Missed calls (last 24 hours) ──
  let missedCalls = 0;
  try {
    const callLogs = await storage.getCallLogs(business.id);
    missedCalls = callLogs.filter((c: any) => {
      if (c.status !== "missed") return false;
      const callTime = new Date(c.callTime || c.createdAt);
      return callTime >= yesterdayStart && callTime < todayStart;
    }).length;
  } catch { /* no call logs */ }

  // ── Skip if nothing to report ──
  if (
    todaysAppointments.length === 0 &&
    yesterdayRevenue === 0 &&
    overdueInvoices.length === 0 &&
    missedCalls === 0
  ) {
    return false; // Don't spam with empty digests
  }

  // ── Build email ──
  const greeting = `Good morning, ${business.name} team!`;
  const subject = `Your Daily Summary — ${todaysAppointments.length} appointments today`;

  // Appointment list for email
  let appointmentHtml = "";
  if (todaysAppointments.length > 0) {
    const rows = await Promise.all(
      todaysAppointments.slice(0, 10).map(async (a) => {
        const customer = a.customerId ? await storage.getCustomer(a.customerId) : null;
        const time = a.startDate
          ? new Date(a.startDate).toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
              hour12: true,
            })
          : "TBD";
        const name = customer
          ? `${customer.firstName} ${customer.lastName}`
          : "Walk-in";
        return `<tr><td style="padding:6px 12px;border-bottom:1px solid #eee;">${time}</td><td style="padding:6px 12px;border-bottom:1px solid #eee;">${name}</td></tr>`;
      })
    );
    appointmentHtml = `
      <h3 style="color:#333;margin-top:24px;">📅 Today's Appointments (${todaysAppointments.length})</h3>
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
        <tr style="background:#f9fafb;"><th style="padding:6px 12px;text-align:left;">Time</th><th style="padding:6px 12px;text-align:left;">Customer</th></tr>
        ${rows.join("")}
      </table>
      ${todaysAppointments.length > 10 ? `<p style="color:#666;font-size:13px;">...and ${todaysAppointments.length - 10} more</p>` : ""}
    `;
  }

  // Stats section
  const statsHtml = `
    <div style="display:flex;gap:16px;margin:20px 0;flex-wrap:wrap;">
      <div style="flex:1;min-width:140px;background:#f0fdf4;border-radius:8px;padding:16px;text-align:center;">
        <div style="font-size:24px;font-weight:bold;color:#16a34a;">$${yesterdayRevenue.toFixed(2)}</div>
        <div style="font-size:13px;color:#666;">Collected Yesterday${paidCount > 0 ? ` (${paidCount} invoices)` : ""}</div>
      </div>
      <div style="flex:1;min-width:140px;background:${overdueInvoices.length > 0 ? "#fef2f2" : "#f9fafb"};border-radius:8px;padding:16px;text-align:center;">
        <div style="font-size:24px;font-weight:bold;color:${overdueInvoices.length > 0 ? "#dc2626" : "#333"};">${overdueInvoices.length}</div>
        <div style="font-size:13px;color:#666;">Overdue Invoices${overdueTotal > 0 ? ` ($${overdueTotal.toFixed(2)})` : ""}</div>
      </div>
      <div style="flex:1;min-width:140px;background:${missedCalls > 0 ? "#fff7ed" : "#f9fafb"};border-radius:8px;padding:16px;text-align:center;">
        <div style="font-size:24px;font-weight:bold;color:${missedCalls > 0 ? "#ea580c" : "#333"};">${missedCalls}</div>
        <div style="font-size:13px;color:#666;">Missed Calls Yesterday</div>
      </div>
    </div>
  `;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
      <h2 style="color:#333;">${greeting}</h2>
      <p style="color:#555;">Here's what's happening today:</p>
      ${statsHtml}
      ${appointmentHtml}
      <div style="margin-top:24px;text-align:center;">
        <a href="${APP_URL}/dashboard" style="display:inline-block;background:#2563eb;color:#fff;padding:12px 28px;border-radius:6px;text-decoration:none;font-weight:bold;">Open Dashboard</a>
      </div>
      <p style="color:#999;font-size:12px;margin-top:24px;text-align:center;">
        You're receiving this because you have an active SmallBizAgent account.
      </p>
    </div>
  `;

  const text = [
    greeting,
    "",
    `Today's Appointments: ${todaysAppointments.length}`,
    `Revenue Collected Yesterday: $${yesterdayRevenue.toFixed(2)}`,
    `Overdue Invoices: ${overdueInvoices.length}${overdueTotal > 0 ? ` ($${overdueTotal.toFixed(2)})` : ""}`,
    `Missed Calls Yesterday: ${missedCalls}`,
    "",
    `Open your dashboard: ${APP_URL}/dashboard`,
  ].join("\n");

  try {
    await sendEmail({ to: business.email, subject, text, html });
    return true;
  } catch (err) {
    console.error(`[DailyDigest] Failed to send to ${business.email}:`, err);
    return false;
  }
}
