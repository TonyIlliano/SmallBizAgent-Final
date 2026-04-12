import { storage } from "../storage";
import { Business } from "@shared/schema";
import reminderService from "./reminderService";
import { processDueRecurringSchedules } from "../routes/recurring";
import { updateRetellAgent } from "./retellProvisioningService";
import { sendQuoteFollowUpNotification, sendInvoiceReminderNotification } from "./notificationService";
import { sendBirthdayCampaigns } from "./marketingService";
import { deprovisionBusiness } from "./businessProvisioningService";
import twilioService from "./twilioService";
import { sendTrialExpirationWarningEmail } from "../emailService";
import { runDataRetention } from './dataRetentionService';
import { pool } from '../db';

// Track scheduled jobs to prevent duplicates
const scheduledJobs: Map<string, NodeJS.Timeout> = new Map();

// ── Re-entry Guard ──────────────────────────────────────────────────
// Prevents a job from overlapping itself if a previous run is still in progress.
// This is an in-process guard — it does NOT protect across multiple server instances.
const runningJobs = new Set<string>();

async function withReentryGuard(jobName: string, fn: () => Promise<void>): Promise<void> {
  if (runningJobs.has(jobName)) {
    console.log(`[Scheduler] Skipping ${jobName} — previous run still in progress`);
    return;
  }
  runningJobs.add(jobName);
  try {
    await fn();
  } finally {
    runningJobs.delete(jobName);
  }
}

// ── PostgreSQL Advisory Lock ────────────────────────────────────────
// Prevents a job from running on multiple server instances simultaneously.
// Uses non-blocking pg_try_advisory_lock so the second instance skips instead of waiting.
async function withAdvisoryLock(lockName: string, fn: () => Promise<void>): Promise<void> {
  // Generate a deterministic lock ID from the name
  let hash = 0;
  for (let i = 0; i < lockName.length; i++) {
    hash = ((hash << 5) - hash + lockName.charCodeAt(i)) | 0;
  }
  const lockId = Math.abs(hash);

  const client = await pool.connect();
  try {
    // Try to acquire lock (non-blocking)
    const result = await client.query('SELECT pg_try_advisory_lock($1) as acquired', [lockId]);
    if (!result.rows[0].acquired) {
      console.log(`[Scheduler] Could not acquire lock for ${lockName} — another instance is running it`);
      return;
    }

    try {
      await fn();
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [lockId]);
    }
  } finally {
    client.release();
  }
}

/**
 * Start the global reminder scheduler.
 * Uses a SINGLE timer that iterates all businesses, instead of one timer per business.
 * Runs every hour to check for appointments needing reminders across all businesses.
 */
export function startGlobalReminderScheduler(): void {
  const jobKey = 'reminders-global';

  if (scheduledJobs.has(jobKey)) {
    console.log('Global reminder scheduler already running');
    return;
  }

  console.log('Starting global reminder scheduler');

  // Do NOT run immediately on start — prevents duplicate reminders on every deploy/restart.
  // The dedup check in reminderService is a safety net, but skipping the immediate run
  // avoids unnecessary DB queries and SMS sends on every Railway deploy.

  // Run every hour (first run happens ~1 hour after deploy, not immediately)
  const intervalId = setInterval(() => {
    withReentryGuard('reminders-global', () => runAllBusinessReminderChecks());
  }, 60 * 60 * 1000); // Every hour

  scheduledJobs.set(jobKey, intervalId);
}

/**
 * @deprecated Use startGlobalReminderScheduler() instead.
 * Kept for backward compatibility — called when a new business is created.
 * Now a no-op since the global scheduler handles all businesses.
 */
export function startReminderScheduler(_businessId: number): void {
  // No-op — the global scheduler handles all businesses
}

/**
 * @deprecated No longer needed with global scheduler.
 */
export function stopReminderScheduler(_businessId: number): void {
  // No-op — the global scheduler handles all businesses
}

/**
 * Run reminder checks for ALL businesses in a single pass.
 */
async function runAllBusinessReminderChecks(): Promise<void> {
  try {
    console.log(`[Reminders] Running reminder check for all businesses at ${new Date().toISOString()}`);
    const allBusinesses = await storage.getAllBusinesses();
    let totalSent = 0;
    let totalSkipped = 0;
    let totalFailed = 0;

    for (const business of allBusinesses) {
      try {
        const results = await reminderService.sendUpcomingAppointmentReminders(business.id, 24);
        totalSent += results.filter(r => r.status === 'sent').length;
        totalSkipped += results.filter(r => r.status === 'skipped').length;
        totalFailed += results.filter(r => r.status === 'failed').length;
      } catch (error) {
        console.error(`[Reminders] Error for business ${business.id}:`, error);
      }
    }

    if (totalSent > 0 || totalFailed > 0) {
      console.log(`[Reminders] Done — ${totalSent} sent, ${totalSkipped} skipped, ${totalFailed} failed across ${allBusinesses.length} businesses`);
    }
  } catch (error) {
    console.error('[Reminders] Error:', error);
  }
}

/**
 * Start the recurring jobs scheduler
 * Runs every hour to process due recurring schedules
 */
export function startRecurringJobsScheduler(): void {
  const jobKey = 'recurring-jobs';

  // Don't start if already running
  if (scheduledJobs.has(jobKey)) {
    console.log('Recurring jobs scheduler already running');
    return;
  }

  console.log('Starting recurring jobs scheduler');

  // Run immediately on start
  withReentryGuard('recurring-jobs', () => runRecurringJobsCheck());

  // Then run every hour
  const intervalId = setInterval(() => {
    withReentryGuard('recurring-jobs', () => runRecurringJobsCheck());
  }, 60 * 60 * 1000); // Every hour

  scheduledJobs.set(jobKey, intervalId);
}

/**
 * Run the recurring jobs check
 */
async function runRecurringJobsCheck(): Promise<void> {
  try {
    console.log(`Running recurring jobs check at ${new Date().toISOString()}`);

    const results = await processDueRecurringSchedules();

    if (results.length > 0) {
      const success = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
      console.log(`Recurring jobs processed: ${success} successful, ${failed} failed`);
    }
  } catch (error) {
    console.error('Error running recurring jobs check:', error);
  }
}

/**
 * Start the daily Vapi assistant refresh scheduler.
 * Updates all active Vapi assistants so TODAY'S DATE in the system prompt stays current.
 * The AI's system prompt includes a static date that gets stale — this refreshes it
 * immediately on startup and then every 24 hours automatically.
 */
export function startRetellDailyRefreshScheduler(): void {
  const jobKey = 'retell-daily-refresh';

  if (scheduledJobs.has(jobKey)) {
    console.log('Vapi daily refresh scheduler already running');
    return;
  }

  console.log('Starting Vapi daily refresh scheduler');

  // Run immediately on startup so the date is always fresh after a deploy
  withReentryGuard('retell-daily-refresh', () => runVapiRefresh());

  // Then run every 24 hours
  const intervalId = setInterval(() => {
    withReentryGuard('retell-daily-refresh', () => runVapiRefresh());
  }, 24 * 60 * 60 * 1000); // Every 24 hours

  scheduledJobs.set(jobKey, intervalId);
}

/**
 * Refresh all Vapi assistants with the current date/time
 */
async function runVapiRefresh(): Promise<void> {
  try {
    console.log(`[VapiRefresh] Refreshing all Vapi assistants at ${new Date().toISOString()}`);
    const allBusinesses = await storage.getAllBusinesses();
    let updated = 0;

    for (const business of allBusinesses) {
      if ((business.retellAgentId || business.vapiAssistantId) && business.receptionistEnabled !== false) {
        try {
          await updateRetellAgent(business.id);
          updated++;
        } catch (err) {
          console.error(`[VapiRefresh] Failed for business ${business.id}:`, err);
        }
        // 500ms delay between updates to avoid Vapi rate limits
        await new Promise(r => setTimeout(r, 500));
      }
    }

    console.log(`[VapiRefresh] Done — ${updated} assistants refreshed`);
  } catch (error) {
    console.error('[VapiRefresh] Error:', error);
  }
}

/**
 * Start the overdue invoice detection scheduler.
 * Runs every 6 hours to find pending invoices past their due date,
 * marks them as "overdue", and sends automated payment reminders.
 */
export function startOverdueInvoiceScheduler(): void {
  const jobKey = 'overdue-invoices';

  if (scheduledJobs.has(jobKey)) {
    console.log('Overdue invoice scheduler already running');
    return;
  }

  console.log('Starting overdue invoice scheduler');

  // Run immediately on start
  withReentryGuard('overdue-invoices', () => runOverdueInvoiceCheck());

  // Then run every 6 hours
  const intervalId = setInterval(() => {
    withReentryGuard('overdue-invoices', () => runOverdueInvoiceCheck());
  }, 6 * 60 * 60 * 1000); // Every 6 hours

  scheduledJobs.set(jobKey, intervalId);
}

/** Milliseconds in one day */
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Check all businesses for pending invoices past their due date,
 * mark them as overdue, and send automated payment reminders at
 * 1 day, 7 days, 14 days, and 30 days overdue.
 *
 * Idempotency: uses notification_log to ensure each reminder tier
 * is only sent once per invoice.
 */
async function runOverdueInvoiceCheck(): Promise<void> {
  try {
    console.log(`[OverdueCheck] Running overdue invoice check at ${new Date().toISOString()}`);
    const allBusinesses = await storage.getAllBusinesses();
    let totalMarked = 0;
    let totalReminders = 0;

    for (const business of allBusinesses) {
      try {
        // Use business timezone for "today" comparison (default UTC)
        const tz = business.timezone || 'UTC';
        const nowInTz = new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
        nowInTz.setHours(0, 0, 0, 0);

        const pendingInvoices = await storage.getInvoices(business.id, { status: 'pending' });

        for (const invoice of pendingInvoices) {
          if (invoice.dueDate) {
            const dueDate = new Date(invoice.dueDate);
            dueDate.setHours(0, 0, 0, 0);

            if (dueDate < nowInTz) {
              await storage.updateInvoice(invoice.id, { status: 'overdue' });
              totalMarked++;
              console.log(`[OverdueCheck] Invoice ${invoice.invoiceNumber} (business ${business.id}) marked as overdue`);

              // Send first reminder immediately when newly overdue
              try {
                await sendInvoiceReminderIfDue(invoice.id, business.id, 1);
                totalReminders++;
              } catch (err) {
                console.error(`[OverdueCheck] Failed to send reminder for invoice ${invoice.id}:`, err);
              }
            }
          }
        }

        // Also check already-overdue invoices for follow-up reminders (7d, 14d, 30d)
        const overdueInvoices = await storage.getInvoices(business.id, { status: 'overdue' });

        for (const invoice of overdueInvoices) {
          if (!invoice.dueDate) continue;
          const dueDate = new Date(invoice.dueDate);
          const daysOverdue = Math.floor((nowInTz.getTime() - dueDate.getTime()) / ONE_DAY_MS);

          // Send escalating reminders at 7, 14, and 30 days overdue
          const reminderTiers = [7, 14, 30];
          for (const tier of reminderTiers) {
            if (daysOverdue >= tier) {
              try {
                const sent = await sendInvoiceReminderIfDue(invoice.id, business.id, tier);
                if (sent) totalReminders++;
              } catch (err) {
                console.error(`[OverdueCheck] Failed ${tier}d reminder for invoice ${invoice.id}:`, err);
              }
            }
          }
        }
      } catch (err) {
        console.error(`[OverdueCheck] Error checking business ${business.id}:`, err);
      }
    }

    console.log(`[OverdueCheck] Done — ${totalMarked} newly overdue, ${totalReminders} reminders sent`);
  } catch (error) {
    console.error('[OverdueCheck] Error:', error);
  }
}

/**
 * Send a payment reminder for an overdue invoice if it hasn't been sent
 * for this tier yet. Uses notification_log for idempotency.
 *
 * @returns true if a reminder was sent
 */
async function sendInvoiceReminderIfDue(
  invoiceId: number,
  businessId: number,
  daysTier: number
): Promise<boolean> {
  const idempotencyKey = `invoice_reminder:${daysTier}d:${invoiceId}`;

  // Check if we already sent this tier's reminder (efficient single-row lookup)
  const alreadySent = await storage.hasNotificationLogByType(businessId, idempotencyKey, 'sent');
  if (alreadySent) return false;

  // Send the actual reminder (email + SMS based on business preferences)
  await sendInvoiceReminderNotification(invoiceId, businessId);

  // Log the tier so we don't resend
  await storage.createNotificationLog({
    businessId,
    type: idempotencyKey,
    channel: 'system',
    recipient: 'internal',
    subject: `Invoice reminder tier: ${daysTier} days overdue`,
    status: 'sent',
    referenceType: 'invoice',
    referenceId: invoiceId,
  });

  console.log(`[OverdueCheck] Sent ${daysTier}-day reminder for invoice ${invoiceId} (business ${businessId})`);
  return true;
}

/**
 * Start the automated quote follow-up scheduler.
 * Runs every 12 hours. For each business, finds pending quotes older than
 * 3 days that haven't already received a follow-up email, and sends one.
 * Only one follow-up per quote (checked via notification_log).
 */
export function startQuoteFollowUpScheduler(): void {
  const jobKey = 'quote-follow-ups';

  if (scheduledJobs.has(jobKey)) {
    console.log('Quote follow-up scheduler already running');
    return;
  }

  console.log('Starting quote follow-up scheduler');

  // Run immediately on start
  withReentryGuard('quote-follow-ups', () => runQuoteFollowUpCheck());

  // Then run every 12 hours
  const intervalId = setInterval(() => {
    withReentryGuard('quote-follow-ups', () => runQuoteFollowUpCheck());
  }, 12 * 60 * 60 * 1000); // Every 12 hours

  scheduledJobs.set(jobKey, intervalId);
}

/**
 * Check all businesses for pending quotes older than 3 days
 * that haven't received a follow-up email yet.
 */
async function runQuoteFollowUpCheck(): Promise<void> {
  try {
    console.log(`[QuoteFollowUp] Running quote follow-up check at ${new Date().toISOString()}`);
    const allBusinesses = await storage.getAllBusinesses();
    let totalSent = 0;

    for (const business of allBusinesses) {
      try {
        const pendingQuotes = await storage.getAllQuotes(business.id, { status: 'pending' });

        // Get recent notification logs to check for existing follow-ups
        // Limit to 100 — quote follow-ups are recent entries
        const logs = await storage.getNotificationLogs(business.id, 100);
        const followUpQuoteIds = new Set(
          logs
            .filter(l => l.type === 'quote_follow_up' && l.referenceType === 'quote')
            .map(l => l.referenceId)
        );

        const threeDaysAgo = new Date();
        threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

        for (const quote of pendingQuotes) {
          // Skip if already followed up
          if (followUpQuoteIds.has(quote.id)) continue;

          // Skip if quote is less than 3 days old
          const createdAt = new Date(quote.createdAt);
          if (createdAt > threeDaysAgo) continue;

          // Skip if quote is expired (validUntil < today)
          if (quote.validUntil) {
            const validUntil = new Date(quote.validUntil);
            if (validUntil < new Date()) continue;
          }

          // Send follow-up
          await sendQuoteFollowUpNotification(quote.id, business.id);
          totalSent++;

          // Small delay between emails
          await new Promise(r => setTimeout(r, 300));
        }
      } catch (err) {
        console.error(`[QuoteFollowUp] Error checking business ${business.id}:`, err);
      }
    }

    console.log(`[QuoteFollowUp] Done — ${totalSent} follow-up emails sent`);
  } catch (error) {
    console.error('[QuoteFollowUp] Error:', error);
  }
}

/**
 * Start the overage billing scheduler.
 * Runs every 6 hours to bill businesses for call minutes exceeding their plan.
 * Idempotent: unique constraint on (business_id, period_start) prevents double-billing.
 */
export function startOverageBillingScheduler(): void {
  const jobKey = 'overage-billing';

  if (scheduledJobs.has(jobKey)) {
    console.log('Overage billing scheduler already running');
    return;
  }

  console.log('Starting overage billing scheduler');

  // Run immediately on start (critical financial job — uses advisory lock for cross-instance safety)
  withReentryGuard('overage-billing', () =>
    withAdvisoryLock('overage-billing', () => runOverageBillingCheck())
  );

  // Then run every 6 hours
  const intervalId = setInterval(() => {
    withReentryGuard('overage-billing', () =>
      withAdvisoryLock('overage-billing', () => runOverageBillingCheck())
    );
  }, 6 * 60 * 60 * 1000);

  scheduledJobs.set(jobKey, intervalId);
}

async function runOverageBillingCheck(): Promise<void> {
  try {
    console.log(`[OverageBilling] Running overage billing check at ${new Date().toISOString()}`);
    const { processAllOverageBilling } = await import('./overageBillingService.js');
    const results = await processAllOverageBilling();
    const invoiced = results.filter(r => r.status === 'invoiced').length;
    const noOverage = results.filter(r => r.status === 'no_overage').length;
    const skipped = results.filter(r => r.status === 'skipped').length;
    const failed = results.filter(r => r.status === 'failed').length;
    console.log(`[OverageBilling] Done — ${invoiced} invoiced, ${noOverage} no overage, ${skipped} skipped, ${failed} failed`);
  } catch (error) {
    console.error('[OverageBilling] Error:', error);
  }
}

/**
 * Start the daily birthday campaign scheduler.
 * Runs once per day (every 24 hours) to find customers with birthdays today
 * and send them a personalized birthday discount via SMS/email.
 * Only sends to customers with marketing_opt_in = true.
 * Deduplicates — won't send multiple birthday messages in the same year.
 */
export function startBirthdayCampaignScheduler(): void {
  const jobKey = 'birthday-campaigns';

  if (scheduledJobs.has(jobKey)) {
    console.log('Birthday campaign scheduler already running');
    return;
  }

  console.log('Starting birthday campaign scheduler');

  // Run immediately on start
  withReentryGuard('birthday-campaigns', () => runBirthdayCampaignCheck());

  // Then run every 24 hours
  const intervalId = setInterval(() => {
    withReentryGuard('birthday-campaigns', () => runBirthdayCampaignCheck());
  }, 24 * 60 * 60 * 1000);

  scheduledJobs.set(jobKey, intervalId);
}

async function runBirthdayCampaignCheck(): Promise<void> {
  try {
    console.log(`[BirthdayCampaign] Running birthday campaign check at ${new Date().toISOString()}`);
    const allBusinesses = await storage.getAllBusinesses();
    let totalSent = 0;

    for (const business of allBusinesses) {
      // Only send for businesses that have birthday campaigns enabled
      if (!business.birthdayCampaignEnabled) continue;

      try {
        const result = await sendBirthdayCampaigns(business.id, {
          discountPercent: business.birthdayDiscountPercent || 15,
          validDays: business.birthdayCouponValidDays || 7,
          channel: (business.birthdayCampaignChannel as 'sms' | 'email' | 'both') || 'both',
          customMessage: business.birthdayCampaignMessage || undefined,
        });
        if (result.sentCount > 0) {
          console.log(`[BirthdayCampaign] Business ${business.id}: sent ${result.sentCount} birthday messages`);
          totalSent += result.sentCount;
        }
      } catch (err) {
        console.error(`[BirthdayCampaign] Error for business ${business.id}:`, err);
      }
      // Small delay between businesses
      await new Promise(r => setTimeout(r, 200));
    }

    console.log(`[BirthdayCampaign] Done — ${totalSent} total birthday messages sent`);
  } catch (error) {
    console.error('[BirthdayCampaign] Error:', error);
  }
}

/**
 * Start the trial expiration scheduler.
 * Runs once per day. Handles two things:
 * 1. Deprovisions businesses whose trial has expired (no subscription, still have Twilio number)
 *    — this triggers call forwarding deactivation notifications via deprovisionBusiness()
 * 2. Sends pre-expiration warning emails/SMS at 3 days and 1 day before trial expiry
 */
export function startTrialExpirationScheduler(): void {
  const jobKey = 'trial-expiration';

  if (scheduledJobs.has(jobKey)) {
    console.log('Trial expiration scheduler already running');
    return;
  }

  console.log('Starting trial expiration scheduler');

  // Run immediately on start (critical — uses advisory lock for cross-instance safety)
  withReentryGuard('trial-expiration', () =>
    withAdvisoryLock('trial-expiration', () => runTrialExpirationCheck())
  );

  // Then run every 24 hours
  const intervalId = setInterval(() => {
    withReentryGuard('trial-expiration', () =>
      withAdvisoryLock('trial-expiration', () => runTrialExpirationCheck())
    );
  }, 24 * 60 * 60 * 1000);

  scheduledJobs.set(jobKey, intervalId);
}

/**
 * Grace Period Model for Trial Expiration:
 *
 * 1. Trial active: Full AI features, phone number, everything works
 * 2. Trial expired (0-30 days, "grace_period"): Phone number KEPT, AI calls DISABLED
 *    - Business can still log in, see dashboard, manage customers
 *    - Callers hear a "please subscribe" message or get forwarded
 *    - Nudge emails sent at 0, 7, 14, 21 days past expiry
 * 3. 30+ days past trial with no subscription: Number released, full deprovision
 *    - Final warning email sent before deprovision
 *
 * This prevents the "lost number" problem where a business's number gets
 * released to Twilio's pool and someone else buys it.
 */
const GRACE_PERIOD_DAYS = 30;

async function runTrialExpirationCheck(): Promise<void> {
  try {
    console.log(`[TrialExpiration] Running trial expiration check at ${new Date().toISOString()}`);
    const allBusinesses = await storage.getAllBusinesses();
    const now = new Date();
    let graceStarted = 0;
    let deprovisioned = 0;
    let warned = 0;

    // Pre-fetch admin business IDs so we never deprovision the platform owner
    const SUBSCRIPTION_LAUNCH_DATE = new Date('2026-02-23T00:00:00Z');
    let adminBusinessIds: Set<number> = new Set();
    try {
      const { db: database } = await import('../db.js');
      const { users: usersTable } = await import('../../shared/schema.js');
      const { eq } = await import('drizzle-orm');
      const admins = await database.select({ businessId: usersTable.businessId })
        .from(usersTable)
        .where(eq(usersTable.role, 'admin'));
      adminBusinessIds = new Set(admins.filter(a => a.businessId != null).map(a => a.businessId!));
    } catch (err) {
      console.warn('[TrialExpiration] Could not fetch admin business IDs:', err);
    }

    for (const business of allBusinesses) {
      // Skip businesses with active paid subscriptions
      const status = business.subscriptionStatus;
      if (status === 'active') {
        continue;
      }

      // Skip businesses already fully deprovisioned (canceled, suspended)
      if (status === 'canceled' || status === 'suspended') {
        continue;
      }

      // Skip founder/grandfathered accounts (created before subscription system launched)
      const businessCreatedAt = business.createdAt ? new Date(business.createdAt) : null;
      if (businessCreatedAt && businessCreatedAt < SUBSCRIPTION_LAUNCH_DATE) {
        continue;
      }

      // Skip admin user's businesses (platform owner should never be auto-deprovisioned)
      if (adminBusinessIds.has(business.id)) {
        continue;
      }

      // SAFETY: Never deprovision a business that was recently provisioned (within 24h)
      // This prevents race conditions where admin provisions and scheduler immediately un-does it
      const provisionedAt = business.provisioningCompletedAt || business.twilioDateProvisioned;
      if (provisionedAt) {
        const hoursSinceProvisioned = (now.getTime() - new Date(provisionedAt).getTime()) / (1000 * 60 * 60);
        if (hoursSinceProvisioned < 24) {
          console.log(`[TrialExpiration] Skipping business ${business.id} — provisioned ${Math.round(hoursSinceProvisioned)}h ago (< 24h safety window)`);
          continue;
        }
      }

      if (!business.trialEndsAt) continue;

      const trialEnd = new Date(business.trialEndsAt);
      const daysUntilExpiry = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      const daysPastExpiry = Math.floor((now.getTime() - trialEnd.getTime()) / (1000 * 60 * 60 * 24));

      // TRIAL HAS EXPIRED
      if (trialEnd < now) {
        // Phase 1: Grace period (0-30 days past expiry)
        // Keep the phone number, but disable AI features
        if (daysPastExpiry < GRACE_PERIOD_DAYS) {
          // Update status to 'grace_period' if still 'trialing' or first transition to 'expired'
          if (status === 'trialing') {
            try {
              await storage.updateBusiness(business.id, {
                subscriptionStatus: 'grace_period',
                receptionistEnabled: false,  // Disable AI calls
              });
              graceStarted++;
              console.log(`[TrialExpiration] Business ${business.id} → grace_period (AI disabled, number kept). ${GRACE_PERIOD_DAYS - daysPastExpiry} days until deprovision.`);
              // Notify admin
              try {
                const { sendAdminAlert } = await import('./adminAlertService');
                await sendAdminAlert({ type: 'trial_expired', severity: 'medium', title: `Trial Expired: ${business.name}`, details: { businessId: business.id, businessName: business.name, daysUntilDeprovision: GRACE_PERIOD_DAYS - daysPastExpiry, email: business.email || 'N/A' } });
              } catch (err) { console.error('[Scheduler] Error:', err instanceof Error ? err.message : err); }
            } catch (err) {
              console.error(`[TrialExpiration] Failed to update status for business ${business.id}:`, err);
            }
          }

          // Send nudge emails at 0, 7, 14, 21 days past expiry
          if (daysPastExpiry === 0 || daysPastExpiry === 7 || daysPastExpiry === 14 || daysPastExpiry === 21) {
            try {
              const logs = await storage.getNotificationLogs(business.id, 50);
              const nudgeKey = `grace_period_${daysPastExpiry}`;
              const alreadySent = logs.some(
                (l: any) => l.type === nudgeKey &&
                     l.sentAt && (now.getTime() - new Date(l.sentAt).getTime()) < 24 * 60 * 60 * 1000
              );

              if (!alreadySent) {
                const daysLeft = GRACE_PERIOD_DAYS - daysPastExpiry;
                await sendGracePeriodNudge(business, daysPastExpiry, daysLeft);
                warned++;
              }
            } catch (err) {
              console.error(`[TrialExpiration] Error sending grace period nudge for business ${business.id}:`, err);
            }
          }

          continue;
        }

        // Phase 2: Grace period expired (30+ days past trial) — NOW deprovision
        // Update status to 'expired' if in grace_period
        if (status === 'grace_period' || status === 'trialing' || status === 'expired') {
          try {
            await storage.updateBusiness(business.id, { subscriptionStatus: 'expired' });
            console.log(`[TrialExpiration] Updated business ${business.id} status to 'expired' (grace period ended)`);
          } catch (err) {
            console.error(`[TrialExpiration] Failed to update status for business ${business.id}:`, err);
          }
        }

        // Deprovision resources (release Twilio number, delete Vapi assistant)
        if (business.twilioPhoneNumberSid) {
          try {
            console.log(`[TrialExpiration] Deprovisioning business ${business.id} (${daysPastExpiry} days past trial, grace period ended)`);
            await deprovisionBusiness(business.id);
            deprovisioned++;

            // Send final deprovision notification
            await sendDeprovisionNotification(business);
          } catch (err) {
            console.error(`[TrialExpiration] Failed to deprovision business ${business.id}:`, err);
          }
          // Delay between deprovisions to avoid rate limits
          await new Promise(r => setTimeout(r, 500));
        }
        continue;
      }

      // PRE-EXPIRATION WARNINGS: 7 days, 3 days, and 1 day before expiry
      if (daysUntilExpiry === 7 || daysUntilExpiry === 3 || daysUntilExpiry === 1) {
        // Check notification log to avoid duplicate warnings on the same day
        try {
          const logs = await storage.getNotificationLogs(business.id, 50);
          const alreadySent = logs.some(
            (l: any) => l.type === 'trial_expiration_warning' &&
                 l.referenceId === daysUntilExpiry &&
                 l.sentAt && (now.getTime() - new Date(l.sentAt).getTime()) < 24 * 60 * 60 * 1000
          );

          if (!alreadySent) {
            await sendTrialExpirationWarnings(business, daysUntilExpiry);
            warned++;
          }
        } catch (err) {
          console.error(`[TrialExpiration] Error checking/sending warnings for business ${business.id}:`, err);
        }
      }

      await new Promise(r => setTimeout(r, 200));
    }

    console.log(`[TrialExpiration] Done — ${graceStarted} entered grace period, ${deprovisioned} deprovisioned, ${warned} warned`);
  } catch (error) {
    console.error('[TrialExpiration] Error:', error);
  }
}

/**
 * Send grace period nudge email — business trial expired but they still have their phone number.
 * Encourage them to subscribe to reactivate AI features.
 */
async function sendGracePeriodNudge(business: Business, daysPastExpiry: number, daysLeft: number): Promise<void> {
  if (!business.email) return;

  try {
    const { sendEmail } = await import('../emailService.js');
    const appUrl = process.env.APP_URL || 'https://www.smallbizagent.ai';

    const urgency = daysLeft <= 7 ? 'URGENT' : '';
    const subject = daysPastExpiry === 0
      ? `Your SmallBizAgent trial has ended — your AI receptionist is paused`
      : `${urgency ? urgency + ': ' : ''}${daysLeft} days left to keep your phone number`;

    await sendEmail({
      to: business.email,
      subject,
      text: `Hi ${business.name},\n\nYour SmallBizAgent trial has ended. Your AI receptionist is currently paused, but we're keeping your phone number (${business.twilioPhoneNumber || 'your business line'}) reserved for you.\n\nYou have ${daysLeft} days to subscribe and reactivate your AI receptionist. After that, your phone number will be released.\n\nSubscribe now: ${appUrl}/settings\n\nBest,\nSmallBizAgent`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1a1a1a;">${daysPastExpiry === 0 ? 'Your trial has ended' : `${daysLeft} days left to keep your number`}</h2>
          <p>Hi ${business.name},</p>
          <p>Your SmallBizAgent trial has ended. Your AI receptionist is currently <strong>paused</strong>, but we're keeping your phone number${business.twilioPhoneNumber ? ` <strong>${business.twilioPhoneNumber}</strong>` : ''} reserved for you.</p>
          ${daysLeft <= 7 ? '<p style="color: #dc2626; font-weight: bold;">⚠️ Your phone number will be released in ' + daysLeft + ' days if you don\'t subscribe.</p>' : ''}
          <p>Subscribe to reactivate your AI receptionist and keep your number:</p>
          <p style="text-align: center; margin: 24px 0;">
            <a href="${appUrl}/settings" style="background-color: #2563eb; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">Subscribe Now</a>
          </p>
          <p style="color: #666; font-size: 14px;">You have ${daysLeft} days remaining before your phone number is released.</p>
        </div>
      `
    });

    await storage.createNotificationLog({
      businessId: business.id,
      type: `grace_period_${daysPastExpiry}`,
      channel: 'email',
      recipient: business.email,
      subject,
      status: 'sent',
      referenceType: 'business',
      referenceId: daysPastExpiry,
    });

    console.log(`[TrialExpiration] Grace period nudge sent to business ${business.id} (day ${daysPastExpiry}, ${daysLeft} days left)`);
  } catch (err) {
    console.error(`[TrialExpiration] Failed to send grace period nudge for business ${business.id}:`, err);
  }
}

/**
 * Send final deprovision notification — phone number is being released.
 */
async function sendDeprovisionNotification(business: Business): Promise<void> {
  if (!business.email) return;

  try {
    const { sendEmail } = await import('../emailService.js');
    const appUrl = process.env.APP_URL || 'https://www.smallbizagent.ai';

    await sendEmail({
      to: business.email,
      subject: 'Your SmallBizAgent phone number has been released',
      text: `Hi ${business.name},\n\nYour grace period has ended and your phone number (${business.twilioPhoneNumber || 'your business line'}) has been released.\n\nYou can still subscribe and get a new number at any time: ${appUrl}/settings\n\nBest,\nSmallBizAgent`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1a1a1a;">Your phone number has been released</h2>
          <p>Hi ${business.name},</p>
          <p>Your 30-day grace period has ended and your phone number${business.twilioPhoneNumber ? ` <strong>${business.twilioPhoneNumber}</strong>` : ''} has been released.</p>
          <p>You can still subscribe at any time — we'll set you up with a new phone number:</p>
          <p style="text-align: center; margin: 24px 0;">
            <a href="${appUrl}/settings" style="background-color: #2563eb; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold;">Subscribe & Get a New Number</a>
          </p>
        </div>
      `
    });

    await storage.createNotificationLog({
      businessId: business.id,
      type: 'trial_deprovisioned',
      channel: 'email',
      recipient: business.email,
      subject: 'Your SmallBizAgent phone number has been released',
      status: 'sent',
      referenceType: 'business',
      referenceId: 0,
    });
  } catch (err) {
    console.error(`[TrialExpiration] Failed to send deprovision notification for business ${business.id}:`, err);
  }
}

/**
 * Send trial expiration warning email and SMS to a business owner.
 * SMS is only sent if call forwarding is enabled (most urgent case).
 */
async function sendTrialExpirationWarnings(business: Business, daysRemaining: number): Promise<void> {
  const hasCallForwarding = business.callForwardingEnabled === true;

  // Send email warning
  if (business.email) {
    try {
      await sendTrialExpirationWarningEmail(
        business.email,
        business.name,
        daysRemaining,
        hasCallForwarding
      );
      await storage.createNotificationLog({
        businessId: business.id,
        type: 'trial_expiration_warning',
        channel: 'email',
        recipient: business.email,
        subject: `Your SmallBizAgent trial expires in ${daysRemaining} day(s)`,
        status: 'sent',
        referenceType: 'business',
        referenceId: daysRemaining, // Track which warning (3-day vs 1-day)
      });
      console.log(`[TrialExpiration] Warning email sent to business ${business.id} (${daysRemaining} days)`);
    } catch (err) {
      console.error(`[TrialExpiration] Failed to send warning email for business ${business.id}:`, err);
    }
  }

  // Send SMS warning — especially important if they have call forwarding
  if (business.phone && hasCallForwarding) {
    try {
      const smsBody = `SmallBizAgent: Your trial expires in ${daysRemaining} day${daysRemaining > 1 ? 's' : ''}. ` +
        `You have call forwarding set up — if your trial expires, callers won't be able to reach you. ` +
        `Subscribe to keep your AI receptionist or dial *73 to remove forwarding.`;
      await twilioService.sendSms(business.phone, smsBody);
      await storage.createNotificationLog({
        businessId: business.id,
        type: 'trial_expiration_warning',
        channel: 'sms',
        recipient: business.phone,
        message: smsBody,
        status: 'sent',
        referenceType: 'business',
        referenceId: daysRemaining,
      });
      console.log(`[TrialExpiration] Warning SMS sent to business ${business.id} (${daysRemaining} days)`);
    } catch (err) {
      console.error(`[TrialExpiration] Failed to send warning SMS for business ${business.id}:`, err);
    }
  }
}

/**
 * Start the dunning deprovisioning scheduler.
 * Runs every 12 hours. If a business has been in 'past_due' status for 7+ days
 * (grace period), deprovision resources (Twilio number, Vapi assistant).
 * This closes the gap where failed payments don't release resources.
 */
export function startDunningDeprovisionScheduler(): void {
  const jobKey = 'dunning-deprovision';
  if (scheduledJobs.has(jobKey)) return;

  console.log('Starting dunning deprovisioning scheduler');

  // Run immediately on start
  withReentryGuard(jobKey, () =>
    withAdvisoryLock(jobKey, () => runDunningDeprovisionCheck())
  );

  // Then every 12 hours
  const intervalId = setInterval(() => {
    withReentryGuard(jobKey, () =>
      withAdvisoryLock(jobKey, () => runDunningDeprovisionCheck())
    );
  }, 12 * 60 * 60 * 1000);

  scheduledJobs.set(jobKey, intervalId);
}

const DUNNING_GRACE_PERIOD_DAYS = 7;

async function runDunningDeprovisionCheck(): Promise<void> {
  try {
    console.log(`[Dunning] Running deprovisioning check at ${new Date().toISOString()}`);
    const allBusinesses = await storage.getAllBusinesses();
    const now = new Date();
    let deprovisioned = 0;

    // Pre-fetch admin business IDs
    let adminBusinessIds: Set<number> = new Set();
    try {
      const { db: database } = await import('../db.js');
      const { users: usersTable } = await import('../../shared/schema.js');
      const { eq } = await import('drizzle-orm');
      const admins = await database.select({ businessId: usersTable.businessId })
        .from(usersTable)
        .where(eq(usersTable.role, 'admin'));
      adminBusinessIds = new Set(admins.filter(a => a.businessId != null).map(a => a.businessId!));
    } catch { /* non-critical */ }

    for (const business of allBusinesses) {
      const status = business.subscriptionStatus;
      if (status !== 'past_due' && status !== 'payment_failed') continue;

      // Never deprovision admin businesses
      if (adminBusinessIds.has(business.id)) continue;

      // Check if past grace period by looking at updatedAt (when status was set to past_due)
      const updatedAt = business.updatedAt ? new Date(business.updatedAt) : null;
      if (!updatedAt) continue;

      const daysSinceFailure = Math.floor((now.getTime() - updatedAt.getTime()) / (1000 * 60 * 60 * 24));

      if (daysSinceFailure >= DUNNING_GRACE_PERIOD_DAYS && business.twilioPhoneNumberSid) {
        try {
          console.log(`[Dunning] Deprovisioning business ${business.id} (${status} for ${daysSinceFailure} days, past ${DUNNING_GRACE_PERIOD_DAYS}-day grace period)`);
          await deprovisionBusiness(business.id);

          // Update status to reflect deprovisioning
          await storage.updateBusiness(business.id, { subscriptionStatus: 'suspended' });
          deprovisioned++;

          // Send final notification
          if (business.email) {
            try {
              const { sendEmail } = await import('../emailService.js');
              const appUrl = process.env.APP_URL || 'https://www.smallbizagent.ai';
              await sendEmail({
                to: business.email,
                subject: `SmallBizAgent: Your service has been suspended`,
                text: `Hi ${business.name}, your SmallBizAgent service has been suspended due to ${DUNNING_GRACE_PERIOD_DAYS} days of unpaid invoices. Your AI receptionist and phone number have been deactivated. Your data is preserved. To reactivate, update your payment method at ${appUrl}/settings.`,
                html: `
                  <h2>Service Suspended</h2>
                  <p>Hi ${business.name},</p>
                  <p>Your SmallBizAgent service has been suspended due to ${DUNNING_GRACE_PERIOD_DAYS} days of unpaid invoices.</p>
                  <p>Your AI receptionist and phone number have been deactivated. Your data (customers, appointments, invoices) is preserved.</p>
                  <p><strong>To reactivate:</strong> Update your payment method at <a href="${appUrl}/settings">Settings</a> and we'll restore your service immediately.</p>
                  <p>If you have questions, reply to this email or visit our <a href="${appUrl}/support">support page</a>.</p>
                `,
              });
            } catch (emailErr) {
              console.error(`[Dunning] Failed to send suspension email for business ${business.id}:`, emailErr);
            }
          }
        } catch (err) {
          console.error(`[Dunning] Failed to deprovision business ${business.id}:`, err);
        }
        await new Promise(r => setTimeout(r, 500));
      }
    }

    console.log(`[Dunning] Done — ${deprovisioned} businesses deprovisioned after grace period`);
  } catch (error) {
    console.error('[Dunning] Error in deprovisioning check:', error);
  }
}

/**
 * Start the daily data retention scheduler.
 * Runs once per day (every 24 hours) to purge expired call recordings
 * and transcripts based on each business's retention settings.
 */
export function startDataRetentionScheduler(): void {
  const jobKey = 'data-retention';

  if (scheduledJobs.has(jobKey)) {
    console.log('Data retention scheduler already running');
    return;
  }

  console.log('Starting data retention scheduler');

  // Run immediately on start
  withReentryGuard('data-retention', () => runDataRetention());

  // Then run every 24 hours
  const intervalId = setInterval(() => {
    withReentryGuard('data-retention', () => runDataRetention());
  }, 24 * 60 * 60 * 1000); // Every 24 hours

  scheduledJobs.set(jobKey, intervalId);
}

/**
 * Start the weekly auto-refine scheduler.
 * Analyzes call transcripts and suggests improvements to the AI receptionist.
 * Runs every 7 days — does NOT run immediately on startup to avoid duplicate runs on restarts.
 */
export function startAutoRefineScheduler(): void {
  const jobKey = 'auto-refine';

  if (scheduledJobs.has(jobKey)) {
    console.log('Auto-refine scheduler already running');
    return;
  }

  console.log('Starting auto-refine scheduler (runs every 7 days)');

  // Run every 7 days — no immediate run on startup
  const intervalId = setInterval(() => {
    withReentryGuard('auto-refine', () => runAutoRefine());
  }, 7 * 24 * 60 * 60 * 1000);

  scheduledJobs.set(jobKey, intervalId);
}

async function runAutoRefine(): Promise<void> {
  try {
    console.log(`[AutoRefine] Running weekly auto-refine at ${new Date().toISOString()}`);
    const { runWeeklyAutoRefine } = await import('./autoRefineService');
    await runWeeklyAutoRefine();
  } catch (error) {
    console.error('[AutoRefine] Error:', error);
  }
}

// ── Follow-Up Agent Scheduler (every 5 minutes) ──
// Sends thank-you and upsell SMS for completed appointments/jobs.
// Replaced the old setTimeout-based approach which lost pending sends on server restart.

export function startFollowUpAgentScheduler(): void {
  const jobKey = 'follow-up-agent';
  if (scheduledJobs.has(jobKey)) return;

  const intervalMs = 5 * 60 * 1000; // 5 minutes
  const intervalId = setInterval(() => {
    withReentryGuard('follow-up-agent', async () => {
      try {
        const { runFollowUpCheck } = await import('./followUpAgentService');
        await runFollowUpCheck();
      } catch (error) {
        console.error('[FollowUpAgent] Scheduler error:', error);
      }
    });
  }, intervalMs);

  scheduledJobs.set(jobKey, intervalId);
  console.log(`Follow-up agent scheduler started (every 5 minutes)`);
}

// ── Estimate Follow-Up Agent Scheduler (every 6 hours) ──

export function startEstimateFollowUpAgentScheduler(): void {
  const jobKey = 'estimate-follow-up-agent';
  if (scheduledJobs.has(jobKey)) return;

  const intervalMs = 6 * 60 * 60 * 1000; // 6 hours
  const intervalId = setInterval(() => {
    withReentryGuard('estimate-follow-up-agent', async () => {
      try {
        console.log(`[EstimateFollowUpAgent] Running scheduled check at ${new Date().toISOString()}`);
        const { runEstimateFollowUpCheck } = await import('./estimateFollowUpAgentService');
        await runEstimateFollowUpCheck();
      } catch (error) {
        console.error('[EstimateFollowUpAgent] Scheduler error:', error);
      }
    });
  }, intervalMs);

  scheduledJobs.set(jobKey, intervalId);
  console.log(`Estimate follow-up agent scheduler started (every 6 hours)`);
}

export function startInvoiceCollectionAgentScheduler(): void {
  const jobKey = 'invoice-collection-agent';
  if (scheduledJobs.has(jobKey)) return;

  const intervalMs = 12 * 60 * 60 * 1000; // 12 hours
  const intervalId = setInterval(() => {
    withReentryGuard('invoice-collection-agent', async () => {
      try {
        console.log(`[InvoiceCollectionAgent] Running scheduled check at ${new Date().toISOString()}`);
        const { runInvoiceCollectionCheck } = await import('./invoiceCollectionAgentService');
        await runInvoiceCollectionCheck();
      } catch (error) {
        console.error('[InvoiceCollectionAgent] Scheduler error:', error);
      }
    });
  }, intervalMs);

  scheduledJobs.set(jobKey, intervalId);
  console.log(`Invoice collection agent scheduler started (every 12 hours)`);
}

// ── No-Show Conversation Cleanup (every 30 minutes) ──
// Note: No-show SMS is now triggered manually when staff marks an appointment
// as "no_show" (see routes.ts PUT /api/appointments/:id). This scheduler only
// cleans up expired conversations that never got a reply.

export function startNoShowAgentScheduler(): void {
  const jobKey = 'no-show-agent';
  if (scheduledJobs.has(jobKey)) return;

  const intervalMs = 30 * 60 * 1000; // 30 minutes
  const intervalId = setInterval(() => {
    withReentryGuard('no-show-agent', async () => {
      try {
        const { processExpiredConversations } = await import('./noShowAgentService');
        await processExpiredConversations();
      } catch (error) {
        console.error('[NoShowAgent] Scheduler error:', error);
      }
    });
  }, intervalMs);

  scheduledJobs.set(jobKey, intervalId);
  console.log(`No-show conversation cleanup scheduler started (every 30 minutes)`);
}

// ── Rebooking Agent Scheduler (every 24 hours) ──

export function startRebookingAgentScheduler(): void {
  const jobKey = 'rebooking-agent';
  if (scheduledJobs.has(jobKey)) return;

  const intervalMs = 24 * 60 * 60 * 1000; // 24 hours
  const intervalId = setInterval(() => {
    withReentryGuard('rebooking-agent', async () => {
      try {
        console.log(`[RebookingAgent] Running scheduled check at ${new Date().toISOString()}`);
        const { runRebookingCheck } = await import('./rebookingAgentService');
        await runRebookingCheck();
      } catch (error) {
        console.error('[RebookingAgent] Scheduler error:', error);
      }
    });
  }, intervalMs);

  scheduledJobs.set(jobKey, intervalId);
  console.log(`Rebooking agent scheduler started (every 24 hours)`);
}

// ── Email Drip Campaign Scheduler (every 6 hours) ──

export function startEmailDripScheduler(): void {
  const jobKey = 'email-drip-campaigns';
  if (scheduledJobs.has(jobKey)) {
    console.log('Email drip campaign scheduler already running');
    return;
  }

  console.log('Starting email drip campaign scheduler');

  // Run immediately on start
  withReentryGuard('email-drip-campaigns', () => runEmailDripCheck());

  // Then run every 6 hours
  const intervalId = setInterval(() => {
    withReentryGuard('email-drip-campaigns', () => runEmailDripCheck());
  }, 6 * 60 * 60 * 1000); // Every 6 hours

  scheduledJobs.set(jobKey, intervalId);
}

async function runEmailDripCheck(): Promise<void> {
  try {
    console.log(`[EmailDrip] Running scheduled drip check at ${new Date().toISOString()}`);
    const { processEmailDrips } = await import('./emailDripService');
    await processEmailDrips();
  } catch (error) {
    console.error('[EmailDrip] Scheduler error:', error);
  }
}

export function startReviewResponseAgentScheduler(): void {
  const jobKey = 'review-response-agent';
  if (scheduledJobs.has(jobKey)) return;

  const intervalMs = 6 * 60 * 60 * 1000; // 6 hours
  const intervalId = setInterval(() => {
    withReentryGuard('review-response-agent', async () => {
      try {
        console.log(`[ReviewResponseAgent] Running scheduled check at ${new Date().toISOString()}`);
        const { runReviewResponseCheck } = await import('./reviewResponseAgentService');
        await runReviewResponseCheck();
      } catch (error) {
        console.error('[ReviewResponseAgent] Scheduler error:', error);
      }
    });
  }, intervalMs);

  scheduledJobs.set(jobKey, intervalId);
  console.log(`Review response agent scheduler started (every 6 hours)`);
}

// ── Platform-Level AI Agents Scheduler ──────────────────────────────

export function startPlatformAgentsScheduler(): void {
  // Churn Prediction — every 24 hours
  const churnKey = 'platform-churn-prediction';
  if (!scheduledJobs.has(churnKey)) {
    // Run after 5 min delay on startup (let the DB warm up)
    const churnStartupTimer = setTimeout(() => {
      withReentryGuard(churnKey, async () => {
        try {
          const { runChurnPrediction } = await import('./platformAgents/churnPredictionAgent');
          await runChurnPrediction();
        } catch (err) { console.error('[PlatformAgent:ChurnPrediction] Startup error:', err); }
      });
    }, 5 * 60 * 1000);
    scheduledJobs.set(`${churnKey}-startup`, churnStartupTimer);
    const id = setInterval(() => {
      withReentryGuard(churnKey, async () => {
        try {
          const { runChurnPrediction } = await import('./platformAgents/churnPredictionAgent');
          await runChurnPrediction();
        } catch (err) { console.error('[PlatformAgent:ChurnPrediction] Error:', err); }
      });
    }, 24 * 60 * 60 * 1000);
    scheduledJobs.set(churnKey, id);
    console.log('Platform agent started: Churn Prediction (every 24h)');
  }

  // Onboarding Coach — every 6 hours
  const onboardKey = 'platform-onboarding-coach';
  if (!scheduledJobs.has(onboardKey)) {
    const onboardStartupTimer = setTimeout(() => {
      withReentryGuard(onboardKey, async () => {
        try {
          const { runOnboardingCoach } = await import('./platformAgents/onboardingCoachAgent');
          await runOnboardingCoach();
        } catch (err) { console.error('[PlatformAgent:OnboardingCoach] Startup error:', err); }
      });
    }, 6 * 60 * 1000);
    scheduledJobs.set(`${onboardKey}-startup`, onboardStartupTimer);
    const id = setInterval(() => {
      withReentryGuard(onboardKey, async () => {
        try {
          const { runOnboardingCoach } = await import('./platformAgents/onboardingCoachAgent');
          await runOnboardingCoach();
        } catch (err) { console.error('[PlatformAgent:OnboardingCoach] Error:', err); }
      });
    }, 6 * 60 * 60 * 1000);
    scheduledJobs.set(onboardKey, id);
    console.log('Platform agent started: Onboarding Coach (every 6h)');
  }

  // Lead Scoring — every 12 hours
  const leadKey = 'platform-lead-scoring';
  if (!scheduledJobs.has(leadKey)) {
    const leadStartupTimer = setTimeout(() => {
      withReentryGuard(leadKey, async () => {
        try {
          const { runLeadScoring } = await import('./platformAgents/leadScoringAgent');
          await runLeadScoring();
        } catch (err) { console.error('[PlatformAgent:LeadScoring] Startup error:', err); }
      });
    }, 7 * 60 * 1000);
    scheduledJobs.set(`${leadKey}-startup`, leadStartupTimer);
    const id = setInterval(() => {
      withReentryGuard(leadKey, async () => {
        try {
          const { runLeadScoring } = await import('./platformAgents/leadScoringAgent');
          await runLeadScoring();
        } catch (err) { console.error('[PlatformAgent:LeadScoring] Error:', err); }
      });
    }, 12 * 60 * 60 * 1000);
    scheduledJobs.set(leadKey, id);
    console.log('Platform agent started: Lead Scoring (every 12h)');
  }

  // Health Score — every 24 hours
  const healthKey = 'platform-health-score';
  if (!scheduledJobs.has(healthKey)) {
    const healthStartupTimer = setTimeout(() => {
      withReentryGuard(healthKey, async () => {
        try {
          const { runHealthScoring } = await import('./platformAgents/healthScoreAgent');
          await runHealthScoring();
        } catch (err) { console.error('[PlatformAgent:HealthScore] Startup error:', err); }
      });
    }, 8 * 60 * 1000);
    scheduledJobs.set(`${healthKey}-startup`, healthStartupTimer);
    const id = setInterval(() => {
      withReentryGuard(healthKey, async () => {
        try {
          const { runHealthScoring } = await import('./platformAgents/healthScoreAgent');
          await runHealthScoring();
        } catch (err) { console.error('[PlatformAgent:HealthScore] Error:', err); }
      });
    }, 24 * 60 * 60 * 1000);
    scheduledJobs.set(healthKey, id);
    console.log('Platform agent started: Health Score (every 24h)');
  }

  // Support Triage — every 6 hours
  const supportKey = 'platform-support-triage';
  if (!scheduledJobs.has(supportKey)) {
    const supportStartupTimer = setTimeout(() => {
      withReentryGuard(supportKey, async () => {
        try {
          const { runSupportTriage } = await import('./platformAgents/supportTriageAgent');
          await runSupportTriage();
        } catch (err) { console.error('[PlatformAgent:SupportTriage] Startup error:', err); }
      });
    }, 9 * 60 * 1000);
    scheduledJobs.set(`${supportKey}-startup`, supportStartupTimer);
    const id = setInterval(() => {
      withReentryGuard(supportKey, async () => {
        try {
          const { runSupportTriage } = await import('./platformAgents/supportTriageAgent');
          await runSupportTriage();
        } catch (err) { console.error('[PlatformAgent:SupportTriage] Error:', err); }
      });
    }, 6 * 60 * 60 * 1000);
    scheduledJobs.set(supportKey, id);
    console.log('Platform agent started: Support Triage (every 6h)');
  }

  // Revenue Optimization — every 24 hours
  const revenueKey = 'platform-revenue-optimization';
  if (!scheduledJobs.has(revenueKey)) {
    const revenueStartupTimer = setTimeout(() => {
      withReentryGuard(revenueKey, async () => {
        try {
          const { runRevenueOptimization } = await import('./platformAgents/revenueOptimizationAgent');
          await runRevenueOptimization();
        } catch (err) { console.error('[PlatformAgent:RevenueOptimization] Startup error:', err); }
      });
    }, 10 * 60 * 1000);
    scheduledJobs.set(`${revenueKey}-startup`, revenueStartupTimer);
    const id = setInterval(() => {
      withReentryGuard(revenueKey, async () => {
        try {
          const { runRevenueOptimization } = await import('./platformAgents/revenueOptimizationAgent');
          await runRevenueOptimization();
        } catch (err) { console.error('[PlatformAgent:RevenueOptimization] Error:', err); }
      });
    }, 24 * 60 * 60 * 1000);
    scheduledJobs.set(revenueKey, id);
    console.log('Platform agent started: Revenue Optimization (every 24h)');
  }

  // Content & SEO — every 7 days
  const contentKey = 'platform-content-seo';
  if (!scheduledJobs.has(contentKey)) {
    const id = setInterval(() => {
      withReentryGuard(contentKey, async () => {
        try {
          const { runContentSeoAgent } = await import('./platformAgents/contentSeoAgent');
          await runContentSeoAgent();
        } catch (err) { console.error('[PlatformAgent:ContentSEO] Error:', err); }
      });
    }, 7 * 24 * 60 * 60 * 1000);
    scheduledJobs.set(contentKey, id);
    console.log('Platform agent started: Content & SEO (every 7d)');
  }

  // Testimonial — every 7 days
  const testimonialKey = 'platform-testimonial';
  if (!scheduledJobs.has(testimonialKey)) {
    const id = setInterval(() => {
      withReentryGuard(testimonialKey, async () => {
        try {
          const { runTestimonialAgent } = await import('./platformAgents/testimonialAgent');
          await runTestimonialAgent();
        } catch (err) { console.error('[PlatformAgent:Testimonial] Error:', err); }
      });
    }, 7 * 24 * 60 * 60 * 1000);
    scheduledJobs.set(testimonialKey, id);
    console.log('Platform agent started: Testimonial (every 7d)');
  }

  // Competitive Intelligence — every 7 days
  const compIntelKey = 'platform-competitive-intel';
  if (!scheduledJobs.has(compIntelKey)) {
    const id = setInterval(() => {
      withReentryGuard(compIntelKey, async () => {
        try {
          const { runCompetitiveIntelAgent } = await import('./platformAgents/competitiveIntelAgent');
          await runCompetitiveIntelAgent();
        } catch (err) { console.error('[PlatformAgent:CompetitiveIntel] Error:', err); }
      });
    }, 7 * 24 * 60 * 60 * 1000);
    scheduledJobs.set(compIntelKey, id);
    console.log('Platform agent started: Competitive Intelligence (every 7d)');
  }

  // Social Media Content — every 24 hours (generates drafts)
  const socialMediaKey = 'platform-social-media';
  if (!scheduledJobs.has(socialMediaKey)) {
    const socialStartupTimer = setTimeout(() => {
      withReentryGuard(socialMediaKey, async () => {
        try {
          const { runSocialMediaAgent } = await import('./platformAgents/socialMediaAgent');
          await runSocialMediaAgent();
        } catch (err) { console.error('[PlatformAgent:SocialMedia] Startup error:', err); }
      });
    }, 11 * 60 * 1000);
    scheduledJobs.set(`${socialMediaKey}-startup`, socialStartupTimer);
    const id = setInterval(() => {
      withReentryGuard(socialMediaKey, async () => {
        try {
          const { runSocialMediaAgent } = await import('./platformAgents/socialMediaAgent');
          await runSocialMediaAgent();
        } catch (err) { console.error('[PlatformAgent:SocialMedia] Error:', err); }
      });
    }, 24 * 60 * 60 * 1000);
    scheduledJobs.set(socialMediaKey, id);
    console.log('Platform agent started: Social Media (every 24h)');
  }

  // Social Media Publisher — every 30 minutes (publishes approved posts)
  const socialPublisherKey = 'platform-social-publisher';
  if (!scheduledJobs.has(socialPublisherKey)) {
    const id = setInterval(() => {
      withReentryGuard(socialPublisherKey, async () => {
        try {
          const { publishApprovedPosts } = await import('./platformAgents/socialMediaAgent');
          await publishApprovedPosts();
        } catch (err) { console.error('[PlatformAgent:SocialPublisher] Error:', err); }
      });
    }, 30 * 60 * 1000);
    scheduledJobs.set(socialPublisherKey, id);
    console.log('Platform agent started: Social Media Publisher (every 30m)');
  }
}

// ── GBP Sync (runs every 24 hours) ──

export function startGbpSyncScheduler(): void {
  // Run every 24 hours (86400000ms)
  setInterval(async () => {
    await withReentryGuard('gbp-sync', async () => {
      await withAdvisoryLock('gbp-sync', async () => {
        try {
          const { runGbpSync } = await import('./googleBusinessProfileService');
          await runGbpSync();
        } catch (error) {
          console.error('[Scheduler] GBP sync error:', error);
        }
      });
    });
  }, 24 * 60 * 60 * 1000);

  console.log('[Scheduler] GBP sync scheduler started (24h interval)');
}

// ── SMS Intelligence Layer Schedulers ──────────────────────────────────────

/**
 * Process pending marketing triggers every 5 minutes.
 * Uses advisory lock — safe across multiple Railway instances.
 */
export function startMarketingTriggerProcessor(): void {
  const jobKey = 'marketing-trigger-processor';
  if (scheduledJobs.has(jobKey)) return;

  const intervalMs = 5 * 60 * 1000; // Every 5 minutes
  const intervalId = setInterval(async () => {
    await withReentryGuard(jobKey, async () => {
      await withAdvisoryLock(jobKey, async () => {
        try {
          const { processReadyTriggers } = await import('./marketingTriggerEngine');
          await processReadyTriggers();
        } catch (error) {
          console.error('[Scheduler] Marketing trigger processor error:', error);
        }
      });
    });
  }, intervalMs);

  scheduledJobs.set(jobKey, intervalId);
  console.log(`[Scheduler] Marketing trigger processor started (${intervalMs / 60000} min interval)`);
}

/**
 * Evaluate all businesses for new marketing triggers every 1 hour.
 * Creates birthday, win-back, rebooking, review request, and estimate follow-up triggers.
 */
export function startMarketingTriggerEvaluator(): void {
  const jobKey = 'marketing-trigger-evaluator';
  if (scheduledJobs.has(jobKey)) return;

  const intervalMs = 60 * 60 * 1000; // Every 1 hour
  const intervalId = setInterval(async () => {
    await withReentryGuard(jobKey, async () => {
      await withAdvisoryLock(jobKey, async () => {
        try {
          const { evaluateAllBusinesses } = await import('./marketingTriggerEngine');
          await evaluateAllBusinesses();
        } catch (error) {
          console.error('[Scheduler] Marketing trigger evaluator error:', error);
        }
      });
    });
  }, intervalMs);

  scheduledJobs.set(jobKey, intervalId);
  console.log(`[Scheduler] Marketing trigger evaluator started (${intervalMs / 60000} min interval)`);
}

/**
 * Start schedulers for all active businesses
 */
/**
 * Process due workflow steps every 60 seconds.
 * Picks up workflow runs whose nextStepAt has passed and advances them.
 */
export function startWorkflowStepProcessor(): void {
  const jobKey = 'workflow-step-processor';
  if (scheduledJobs.has(jobKey)) return;

  const intervalMs = 60 * 1000; // Every 60 seconds
  const intervalId = setInterval(async () => {
    await withReentryGuard(jobKey, async () => {
      try {
        const { processWorkflowSteps } = await import('./workflowEngine');
        await processWorkflowSteps();
      } catch (error) {
        console.error('[Scheduler] Workflow step processor error:', error);
      }
    });
  }, intervalMs);

  scheduledJobs.set(jobKey, intervalId);
  console.log(`[Scheduler] Workflow step processor started (${intervalMs / 1000}s interval)`);
}

// ── Health Check Scheduler (every 5 min) ──
export function startHealthCheckScheduler(): void {
  const jobKey = 'health-checks';
  if (scheduledJobs.has(jobKey)) return;
  console.log('[Scheduler] Starting health check scheduler (every 5 min)');

  const intervalId = setInterval(() => {
    withReentryGuard('health-checks', async () => {
      await withAdvisoryLock('health-checks', async () => {
        const { runAllHealthChecks } = await import('./healthCheckService.js');
        const results = await runAllHealthChecks();
        const downServices = results.filter(r => r.status === 'down');
        if (downServices.length > 0) {
          try {
            const { sendAdminAlert } = await import('./adminAlertService.js');
            await sendAdminAlert({
              type: 'provisioning_failed',
              severity: 'high',
              title: `Service(s) Down: ${downServices.map(s => s.serviceName).join(', ')}`,
              details: Object.fromEntries(downServices.map(s => [s.serviceName, s.errorMessage || 'Unreachable'])),
            });
          } catch (alertErr) {
            console.error('[HealthCheck] Failed to send admin alert:', alertErr);
          }
        }
      });
    });
  }, 5 * 60 * 1000); // Every 5 minutes

  scheduledJobs.set(jobKey, intervalId);
}

export async function startAllSchedulers(): Promise<void> {
  try {
    // Start global reminder scheduler (single timer for all businesses)
    startGlobalReminderScheduler();

    // Start recurring jobs scheduler (runs globally, not per-business)
    startRecurringJobsScheduler();

    // Start Vapi daily refresh (keeps TODAY'S DATE current in AI prompts)
    startRetellDailyRefreshScheduler();

    // Start overdue invoice detection (marks pending invoices past due date as overdue)
    startOverdueInvoiceScheduler();

    // Start automated quote follow-up (sends reminder for pending quotes older than 3 days)
    startQuoteFollowUpScheduler();

    // Start overage billing (bills for call minutes exceeding plan limits)
    startOverageBillingScheduler();

    // Start birthday campaign scheduler (sends birthday discounts to opted-in customers)
    startBirthdayCampaignScheduler();

    // Start trial expiration scheduler (deprovisions expired trials, sends pre-expiration warnings)
    startTrialExpirationScheduler();

    // Start dunning deprovisioning scheduler (deprovisions past_due businesses after grace period)
    startDunningDeprovisionScheduler();

    // Start data retention scheduler (purges expired call recordings and transcripts daily)
    startDataRetentionScheduler();

    // Start auto-refine scheduler (analyzes call transcripts weekly, suggests receptionist improvements)
    startAutoRefineScheduler();

    // Start SMS automation agent schedulers
    startFollowUpAgentScheduler();
    startEstimateFollowUpAgentScheduler();
    startInvoiceCollectionAgentScheduler();
    startNoShowAgentScheduler();
    startRebookingAgentScheduler();
    startReviewResponseAgentScheduler();

    // Start email drip campaign scheduler (onboarding, trial expiration, win-back)
    startEmailDripScheduler();

    // Start platform-level AI agents
    startPlatformAgentsScheduler();

    // Start daily digest email scheduler (morning summary for business owners)
    startDailyDigestScheduler();

    // Start customer insights nightly recalculation
    startCustomerInsightsScheduler();

    // Start engagement lock cleanup (releases expired locks)
    startEngagementLockCleanupScheduler();

    // Start morning brief (AI-powered daily summary for business owners)
    startMorningBriefScheduler();

    // Start admin digest (daily platform summary for admin at 8am ET)
    startAdminDigestScheduler();

    // Start GBP sync (syncs business info + reviews from Google Business Profile every 24h)
    startGbpSyncScheduler();

    // Start SMS Intelligence Layer schedulers
    startMarketingTriggerProcessor();
    startMarketingTriggerEvaluator();

    // Start workflow step processor (advances due workflow runs every 60s)
    startWorkflowStepProcessor();

    // Start weekly business report scheduler (Monday 8 AM per business timezone)
    startWeeklyReportScheduler();

    // Start health check monitor (pings Twilio, Retell, Stripe, OpenAI, DB every 5 min)
    startHealthCheckScheduler();

    console.log('All schedulers started');
  } catch (error) {
    console.error('Error starting schedulers:', error);
  }
}

/**
 * Stop all schedulers
 */
// ── Daily Digest Email (runs once daily at ~7 AM) ──

/**
 * Get the current hour in a given IANA timezone (0-23).
 * Falls back to UTC if the timezone string is invalid.
 */
function getLocalHour(timezone: string): number {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: timezone });
    return parseInt(formatter.format(new Date()), 10);
  } catch {
    return new Date().getUTCHours(); // fallback to UTC
  }
}

export function startDailyDigestScheduler(): void {
  const jobKey = 'daily-digest';
  if (scheduledJobs.has(jobKey)) return;

  // Check every hour; for each business, send digest when it's 7 AM in their timezone
  const intervalMs = 60 * 60 * 1000; // 1 hour
  const intervalId = setInterval(() => {
    withReentryGuard('daily-digest', async () => {
      try {
        const allBusinesses = await storage.getAllBusinesses();
        const eligibleIds: number[] = [];

        for (const business of allBusinesses) {
          const tz = business.timezone || 'America/New_York';
          const localHour = getLocalHour(tz);
          if (localHour === 7) {
            eligibleIds.push(business.id);
          }
        }

        if (eligibleIds.length > 0) {
          console.log(`[DailyDigest] Running daily digest for ${eligibleIds.length} businesses at ${new Date().toISOString()}`);
          const { processDailyDigests } = await import('./dailyDigestService');
          await processDailyDigests(eligibleIds);
        }
      } catch (error) {
        console.error('[DailyDigest] Scheduler error:', error);
      }
    });
  }, intervalMs);

  scheduledJobs.set(jobKey, intervalId);
  console.log('Daily digest scheduler started (checks hourly, sends at 7 AM per business timezone)');
}

// ── Customer Insights Nightly Recalculation (every 24h) ──

export function startCustomerInsightsScheduler(): void {
  const jobKey = 'customer-insights';
  if (scheduledJobs.has(jobKey)) return;

  const intervalMs = 24 * 60 * 60 * 1000; // 24 hours
  const intervalId = setInterval(() => {
    withReentryGuard('customer-insights', () =>
      withAdvisoryLock('customer-insights', async () => {
        try {
          console.log(`[CustomerInsights] Running nightly batch at ${new Date().toISOString()}`);
          const { runNightlyInsightsRecalculation } = await import('./customerInsightsService');
          await runNightlyInsightsRecalculation();
        } catch (error) {
          console.error('[CustomerInsights] Scheduler error:', error);
        }
      })
    );
  }, intervalMs);

  scheduledJobs.set(jobKey, intervalId);
  console.log('Customer insights scheduler started (every 24 hours)');
}

// ── Engagement Lock Cleanup (every 15 minutes) ──

export function startEngagementLockCleanupScheduler(): void {
  const jobKey = 'engagement-lock-cleanup';
  if (scheduledJobs.has(jobKey)) return;

  const intervalMs = 15 * 60 * 1000; // 15 minutes
  const intervalId = setInterval(() => {
    withReentryGuard('engagement-lock-cleanup', async () => {
      try {
        const released = await storage.releaseExpiredEngagementLocks();
        if (released > 0) {
          console.log(`[EngagementLock] Released ${released} expired locks`);
        }
      } catch (error) {
        console.error('[EngagementLock] Cleanup error:', error);
      }
    });
  }, intervalMs);

  scheduledJobs.set(jobKey, intervalId);
  console.log('Engagement lock cleanup scheduler started (every 15 minutes)');
}

// ── Morning Brief (checks hourly, sends at 7am per business timezone) ──

export function startMorningBriefScheduler(): void {
  const jobKey = 'morning-brief';
  if (scheduledJobs.has(jobKey)) return;

  const intervalMs = 60 * 60 * 1000; // Check every hour
  const intervalId = setInterval(() => {
    withReentryGuard('morning-brief', () =>
      withAdvisoryLock('morning-brief', async () => {
        try {
          const { sendMorningBriefs } = await import('./morningBriefService');
          await sendMorningBriefs();
        } catch (error) {
          console.error('[MorningBrief] Scheduler error:', error);
        }
      })
    );
  }, intervalMs);

  scheduledJobs.set(jobKey, intervalId);
  console.log('Morning brief scheduler started (checks hourly)');
}

// ── Admin Digest (checks hourly, sends at 8am ET) ──

export function startAdminDigestScheduler(): void {
  const jobKey = 'admin-digest';
  if (scheduledJobs.has(jobKey)) return;

  const intervalMs = 60 * 60 * 1000; // Check every hour
  const intervalId = setInterval(() => {
    withReentryGuard('admin-digest', () =>
      withAdvisoryLock('admin-digest', async () => {
        try {
          const { checkAndSendAdminDigest } = await import('./adminDigestService');
          await checkAndSendAdminDigest();
        } catch (error) {
          console.error('[AdminDigest] Scheduler error:', error);
        }
      })
    );
  }, intervalMs);

  scheduledJobs.set(jobKey, intervalId);
  console.log('Admin digest scheduler started (checks hourly, sends at 8am ET)');
}

// ── Weekly Business Report (checks hourly, sends Monday 8 AM per business timezone) ──

export function startWeeklyReportScheduler(): void {
  const jobKey = 'weekly-report';
  if (scheduledJobs.has(jobKey)) return;

  const intervalId = setInterval(() => {
    withReentryGuard('weekly-report', async () => {
      try {
        // Only run on Mondays (getDay() === 1)
        const now = new Date();
        if (now.getDay() !== 1) return;

        // Get all active businesses with a timezone
        const allBusinesses = await storage.getAllBusinesses();
        const eligibleIds = allBusinesses
          .filter(b => {
            const tz = b.timezone || 'America/New_York';
            const localHour = getLocalHour(tz);
            const status = b.subscriptionStatus;
            return localHour === 8 && (status === 'active' || status === 'trialing');
          })
          .map(b => b.id);

        if (eligibleIds.length === 0) return;

        console.log(`[WeeklyReport] Sending reports to ${eligibleIds.length} businesses`);
        const { processWeeklyReports } = await import('./weeklyReportService');
        await processWeeklyReports(eligibleIds);
      } catch (error) {
        console.error('[WeeklyReport] Scheduler error:', error);
      }
    });
  }, 60 * 60 * 1000); // Check every hour

  scheduledJobs.set(jobKey, intervalId);
  console.log('Weekly report scheduler started (checks hourly, sends Monday 8 AM per business timezone)');
}

export function stopAllSchedulers(): void {
  scheduledJobs.forEach((intervalId, jobKey) => {
    clearInterval(intervalId);
    console.log(`Stopped scheduler: ${jobKey}`);
  });
  scheduledJobs.clear();
}

export default {
  startReminderScheduler,
  stopReminderScheduler,
  startGlobalReminderScheduler,
  startRecurringJobsScheduler,
  startRetellDailyRefreshScheduler,
  startOverdueInvoiceScheduler,
  startQuoteFollowUpScheduler,
  startOverageBillingScheduler,
  startBirthdayCampaignScheduler,
  startTrialExpirationScheduler,
  startDunningDeprovisionScheduler,
  startDataRetentionScheduler,
  startAutoRefineScheduler,
  startFollowUpAgentScheduler,
  startEstimateFollowUpAgentScheduler,
  startInvoiceCollectionAgentScheduler,
  startNoShowAgentScheduler,
  startRebookingAgentScheduler,
  startReviewResponseAgentScheduler,
  startEmailDripScheduler,
  startPlatformAgentsScheduler,
  startDailyDigestScheduler,
  startCustomerInsightsScheduler,
  startEngagementLockCleanupScheduler,
  startMorningBriefScheduler,
  startAdminDigestScheduler,
  startGbpSyncScheduler,
  startWeeklyReportScheduler,
  startWorkflowStepProcessor,
  startAllSchedulers,
  stopAllSchedulers
};
