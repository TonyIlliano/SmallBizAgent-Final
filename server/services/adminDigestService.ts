/**
 * Admin Digest Service
 *
 * Sends a daily summary email to the platform admin at 8am ET.
 * Covers: signups, trial expirations, calls, revenue, failed payments,
 * churn risk, agent activity, and MRR change.
 */

import { db } from '../db';
import { eq, sql, gte, lte, and, desc } from 'drizzle-orm';
import { businesses, users, callLogs, agentActivityLog, notificationLog, subscriptionPlans } from '../../shared/schema';
import { sendEmail } from '../emailService';

const ADMIN_TIMEZONE = process.env.ADMIN_TIMEZONE || 'America/New_York';

/**
 * Check if it's 8am in the admin's timezone and send the digest.
 */
export async function checkAndSendAdminDigest(): Promise<void> {
  const now = new Date();
  const hour = getHourInTimezone(now, ADMIN_TIMEZONE);
  if (hour !== 8) return;

  await sendAdminDigest();
}

export async function sendAdminDigest(): Promise<void> {
  const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || 'bark@smallbizagent.ai';
  const { start, end } = getYesterdayRange(ADMIN_TIMEZONE);

  // Gather all data in parallel
  const [
    newSignups,
    expiredTrials,
    callCount,
    mrrData,
    failedPayments,
    highChurnRisks,
    agentActions,
    failedNotifications,
    currentMrr,
  ] = await Promise.all([
    // New signups yesterday
    db.select({ id: businesses.id, name: businesses.name, email: businesses.email })
      .from(businesses)
      .where(and(gte(businesses.createdAt, start), lte(businesses.createdAt, end))),

    // Trials that expired/entered grace period yesterday
    db.select({ id: businesses.id, name: businesses.name })
      .from(businesses)
      .where(and(
        eq(businesses.subscriptionStatus, 'grace_period'),
        gte(businesses.updatedAt, start),
        lte(businesses.updatedAt, end),
      )),

    // Total calls yesterday
    db.select({ count: sql<number>`count(*)` })
      .from(callLogs)
      .where(and(gte(callLogs.callTime, start), lte(callLogs.callTime, end))),

    // Platform MRR from active subscriptions
    (async () => {
      const activeBiz = await db.select({
        stripePlanId: businesses.stripePlanId,
      }).from(businesses).where(eq(businesses.subscriptionStatus, 'active'));
      const plans = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.active, true));
      const planMap = new Map(plans.map(p => [p.id, p]));
      let mrr = 0;
      for (const b of activeBiz) {
        const plan = b.stripePlanId ? planMap.get(b.stripePlanId) : null;
        if (plan?.price) {
          mrr += plan.interval === 'yearly' ? plan.price / 12 : plan.price;
        }
      }
      return { mrr: Math.round(mrr) };
    })(),

    // Current failed payments
    db.select({ id: businesses.id, name: businesses.name, status: businesses.subscriptionStatus })
      .from(businesses)
      .where(sql`subscription_status IN ('past_due', 'payment_failed')`),

    // High churn risks detected yesterday
    db.select({ businessId: agentActivityLog.businessId, details: agentActivityLog.details })
      .from(agentActivityLog)
      .where(and(
        eq(agentActivityLog.agentType, 'platform:churn_prediction'),
        eq(agentActivityLog.action, 'alert_generated'),
        gte(agentActivityLog.createdAt, start),
        lte(agentActivityLog.createdAt, end),
      )),

    // Agent actions yesterday
    db.select({ count: sql<number>`count(*)`, agentType: agentActivityLog.agentType })
      .from(agentActivityLog)
      .where(and(gte(agentActivityLog.createdAt, start), lte(agentActivityLog.createdAt, end)))
      .groupBy(agentActivityLog.agentType),

    // Failed notifications yesterday
    db.select({ count: sql<number>`count(*)` })
      .from(notificationLog)
      .where(and(eq(notificationLog.status, 'failed'), gte(notificationLog.sentAt, start), lte(notificationLog.sentAt, end))),

    // Current MRR (active subscriptions * plan price)
    db.select({ count: sql<number>`count(*)` })
      .from(businesses)
      .where(eq(businesses.subscriptionStatus, 'active')),
  ]);

  const totalCalls = Number(callCount[0]?.count || 0);
  const platformMrr = Number(mrrData.mrr || 0);
  const failedNotifCount = Number(failedNotifications[0]?.count || 0);

  // Check if there's any activity at all
  const hasActivity = newSignups.length > 0 || expiredTrials.length > 0 || totalCalls > 0 || platformMrr > 0 || failedPayments.length > 0 || highChurnRisks.length > 0;
  if (!hasActivity) {
    console.log('[AdminDigest] No activity yesterday, skipping digest');
    return;
  }

  // Build action items
  const actionItems: string[] = [];
  if (failedPayments.length > 0) actionItems.push(`${failedPayments.length} failed payment(s) need attention`);
  if (highChurnRisks.length > 0) actionItems.push(`${highChurnRisks.length} high churn risk business(es) detected`);
  if (failedNotifCount > 0) actionItems.push(`${failedNotifCount} notification(s) failed delivery`);
  if (expiredTrials.length > 0) actionItems.push(`${expiredTrials.length} trial(s) expired`);

  const dateStr = start.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: ADMIN_TIMEZONE });

  // Agent summary
  const agentSummary = agentActions.map(a => `${a.agentType?.replace('platform:', '').replace(/_/g, ' ')}: ${a.count}`).join(', ') || 'None';

  const subject = `SmallBizAgent Daily Digest — ${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: ADMIN_TIMEZONE })}`;

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;color:#111;">
      <h1 style="font-size:22px;margin:0 0 4px;">Daily Platform Digest</h1>
      <p style="color:#6B7280;margin:0 0 20px;font-size:14px;">${dateStr}</p>

      ${actionItems.length > 0 ? `
      <div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:12px 16px;margin-bottom:20px;">
        <h3 style="margin:0 0 8px;font-size:14px;color:#991B1B;">Action Needed</h3>
        <ul style="margin:0;padding:0 0 0 18px;font-size:14px;color:#B91C1C;">
          ${actionItems.map(a => `<li style="margin-bottom:4px;">${a}</li>`).join('')}
        </ul>
      </div>` : ''}

      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
        <tr>
          <td style="padding:12px;background:#F9FAFB;border-radius:8px;text-align:center;width:25%;">
            <div style="font-size:28px;font-weight:700;">${newSignups.length}</div>
            <div style="font-size:12px;color:#6B7280;">New Signups</div>
          </td>
          <td style="width:4px;"></td>
          <td style="padding:12px;background:#F9FAFB;border-radius:8px;text-align:center;width:25%;">
            <div style="font-size:28px;font-weight:700;">${totalCalls}</div>
            <div style="font-size:12px;color:#6B7280;">Calls Handled</div>
          </td>
          <td style="width:4px;"></td>
          <td style="padding:12px;background:#F9FAFB;border-radius:8px;text-align:center;width:25%;">
            <div style="font-size:28px;font-weight:700;">$${platformMrr.toLocaleString()}</div>
            <div style="font-size:12px;color:#6B7280;">MRR</div>
          </td>
          <td style="width:4px;"></td>
          <td style="padding:12px;background:#F9FAFB;border-radius:8px;text-align:center;width:25%;">
            <div style="font-size:28px;font-weight:700;">${Number(currentMrr[0]?.count || 0)}</div>
            <div style="font-size:12px;color:#6B7280;">Active Subs</div>
          </td>
        </tr>
      </table>

      ${newSignups.length > 0 ? `
      <h3 style="font-size:14px;margin:0 0 8px;color:#059669;">New Signups</h3>
      <ul style="margin:0 0 16px;padding:0 0 0 18px;font-size:14px;">
        ${newSignups.map(s => `<li>${s.name} (${s.email || 'no email'})</li>`).join('')}
      </ul>` : ''}

      ${expiredTrials.length > 0 ? `
      <h3 style="font-size:14px;margin:0 0 8px;color:#D97706;">Trials Expired</h3>
      <ul style="margin:0 0 16px;padding:0 0 0 18px;font-size:14px;">
        ${expiredTrials.map(t => `<li>${t.name}</li>`).join('')}
      </ul>` : ''}

      ${failedPayments.length > 0 ? `
      <h3 style="font-size:14px;margin:0 0 8px;color:#DC2626;">Failed Payments</h3>
      <ul style="margin:0 0 16px;padding:0 0 0 18px;font-size:14px;">
        ${failedPayments.map(p => `<li>${p.name} (${p.status})</li>`).join('')}
      </ul>` : ''}

      <h3 style="font-size:14px;margin:0 0 8px;color:#6B7280;">Agent Activity</h3>
      <p style="font-size:14px;margin:0 0 16px;">${agentSummary}</p>

      <p style="font-size:12px;color:#9CA3AF;margin-top:24px;">SmallBizAgent Platform Digest &bull; ${new Date().toLocaleString('en-US', { timeZone: ADMIN_TIMEZONE })}</p>
    </div>
  `;

  const text = [
    `SmallBizAgent Daily Digest — ${dateStr}`,
    '',
    actionItems.length > 0 ? `ACTION NEEDED:\n${actionItems.map(a => `  - ${a}`).join('\n')}\n` : '',
    `New Signups: ${newSignups.length}`,
    `Calls Handled: ${totalCalls}`,
    `Platform MRR: $${platformMrr.toLocaleString()}`,
    `Active Subscriptions: ${currentMrr[0]?.count || 0}`,
    `Trials Expired: ${expiredTrials.length}`,
    `Failed Payments: ${failedPayments.length}`,
    `High Churn Risk: ${highChurnRisks.length}`,
    `Failed Notifications: ${failedNotifCount}`,
    `Agent Activity: ${agentSummary}`,
  ].filter(Boolean).join('\n');

  try {
    await sendEmail({ to: adminEmail, subject, text, html });
    console.log(`[AdminDigest] Sent daily digest to ${adminEmail}`);
  } catch (error) {
    console.error('[AdminDigest] Failed to send digest:', error);
  }
}

function getHourInTimezone(date: Date, timezone: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: timezone });
  return parseInt(formatter.format(date), 10);
}

function getYesterdayRange(timezone: string): { start: Date; end: Date } {
  const now = new Date();
  const todayStr = now.toLocaleDateString('en-CA', { timeZone: timezone }); // YYYY-MM-DD
  const today = new Date(todayStr + 'T00:00:00');
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  return { start: yesterday, end: today };
}
