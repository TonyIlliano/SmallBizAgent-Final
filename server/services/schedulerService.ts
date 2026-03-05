import { storage } from "../storage";
import { Business } from "@shared/schema";
import reminderService from "./reminderService";
import { processDueRecurringSchedules } from "../routes/recurring";
import { updateVapiAssistant } from "./vapiProvisioningService";
import { sendQuoteFollowUpNotification } from "./notificationService";
import { sendBirthdayCampaigns } from "./marketingService";
import { deprovisionBusiness } from "./businessProvisioningService";
import twilioService from "./twilioService";
import { sendTrialExpirationWarningEmail, sendDailySummaryEmail } from "../emailService";
import { runDataRetention } from './dataRetentionService';

// Track scheduled jobs to prevent duplicates
const scheduledJobs: Map<string, NodeJS.Timeout> = new Map();

/**
 * Start the reminder scheduler for a business
 * Runs every hour to check for appointments needing reminders
 */
export function startReminderScheduler(businessId: number): void {
  const jobKey = `reminder-${businessId}`;

  // Don't start if already running
  if (scheduledJobs.has(jobKey)) {
    console.log(`Reminder scheduler already running for business ${businessId}`);
    return;
  }

  console.log(`Starting reminder scheduler for business ${businessId}`);

  // Run immediately on start
  runReminderCheck(businessId);

  // Then run every hour
  const intervalId = setInterval(() => {
    runReminderCheck(businessId);
  }, 60 * 60 * 1000); // Every hour

  scheduledJobs.set(jobKey, intervalId);
}

/**
 * Stop the reminder scheduler for a business
 */
export function stopReminderScheduler(businessId: number): void {
  const jobKey = `reminder-${businessId}`;
  const intervalId = scheduledJobs.get(jobKey);

  if (intervalId) {
    clearInterval(intervalId);
    scheduledJobs.delete(jobKey);
    console.log(`Stopped reminder scheduler for business ${businessId}`);
  }
}

/**
 * Run the reminder check for a business
 */
async function runReminderCheck(businessId: number): Promise<void> {
  try {
    console.log(`Running reminder check for business ${businessId} at ${new Date().toISOString()}`);

    // Send 24-hour reminders
    const results = await reminderService.sendUpcomingAppointmentReminders(businessId, 24);

    const sent = results.filter(r => r.status === 'sent').length;
    const skipped = results.filter(r => r.status === 'skipped').length;
    const failed = results.filter(r => r.status === 'failed').length;

    if (results.length > 0) {
      console.log(`Reminder results for business ${businessId}: ${sent} sent, ${skipped} skipped, ${failed} failed`);
    }
  } catch (error) {
    console.error(`Error running reminder check for business ${businessId}:`, error);
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
  runRecurringJobsCheck();

  // Then run every hour
  const intervalId = setInterval(() => {
    runRecurringJobsCheck();
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
export function startVapiDailyRefreshScheduler(): void {
  const jobKey = 'vapi-daily-refresh';

  if (scheduledJobs.has(jobKey)) {
    console.log('Vapi daily refresh scheduler already running');
    return;
  }

  console.log('Starting Vapi daily refresh scheduler');

  // Run immediately on startup so the date is always fresh after a deploy
  runVapiRefresh();

  // Then run every 24 hours
  const intervalId = setInterval(() => {
    runVapiRefresh();
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
      if (business.vapiAssistantId && business.receptionistEnabled !== false) {
        try {
          await updateVapiAssistant(business.id);
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
 * Runs every 6 hours to find pending invoices past their due date
 * and marks them as "overdue".
 */
export function startOverdueInvoiceScheduler(): void {
  const jobKey = 'overdue-invoices';

  if (scheduledJobs.has(jobKey)) {
    console.log('Overdue invoice scheduler already running');
    return;
  }

  console.log('Starting overdue invoice scheduler');

  // Run immediately on start
  runOverdueInvoiceCheck();

  // Then run every 6 hours
  const intervalId = setInterval(() => {
    runOverdueInvoiceCheck();
  }, 6 * 60 * 60 * 1000); // Every 6 hours

  scheduledJobs.set(jobKey, intervalId);
}

/**
 * Check all businesses for pending invoices past their due date
 * and mark them as overdue
 */
async function runOverdueInvoiceCheck(): Promise<void> {
  try {
    console.log(`[OverdueCheck] Running overdue invoice check at ${new Date().toISOString()}`);
    const allBusinesses = await storage.getAllBusinesses();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let totalMarked = 0;

    for (const business of allBusinesses) {
      try {
        const pendingInvoices = await storage.getInvoices(business.id, { status: 'pending' });

        for (const invoice of pendingInvoices) {
          if (invoice.dueDate) {
            const dueDate = new Date(invoice.dueDate);
            dueDate.setHours(0, 0, 0, 0);

            if (dueDate < today) {
              await storage.updateInvoice(invoice.id, { status: 'overdue' });
              totalMarked++;
              console.log(`[OverdueCheck] Invoice ${invoice.invoiceNumber} (business ${business.id}) marked as overdue`);
            }
          }
        }
      } catch (err) {
        console.error(`[OverdueCheck] Error checking business ${business.id}:`, err);
      }
    }

    console.log(`[OverdueCheck] Done — ${totalMarked} invoices marked as overdue`);
  } catch (error) {
    console.error('[OverdueCheck] Error:', error);
  }
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
  runQuoteFollowUpCheck();

  // Then run every 12 hours
  const intervalId = setInterval(() => {
    runQuoteFollowUpCheck();
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

        // Get existing follow-up notification logs for this business
        const logs = await storage.getNotificationLogs(business.id, 500);
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

  // Run immediately on start
  runOverageBillingCheck();

  // Then run every 6 hours
  const intervalId = setInterval(() => {
    runOverageBillingCheck();
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
  runBirthdayCampaignCheck();

  // Then run every 24 hours
  const intervalId = setInterval(() => {
    runBirthdayCampaignCheck();
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
      if (!(business as any).birthdayCampaignEnabled) continue;

      try {
        const result = await sendBirthdayCampaigns(business.id, {
          discountPercent: (business as any).birthdayDiscountPercent || 15,
          validDays: (business as any).birthdayCouponValidDays || 7,
          channel: (business as any).birthdayCampaignChannel || 'both',
          customMessage: (business as any).birthdayCampaignMessage || undefined,
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

  // Run immediately on start
  runTrialExpirationCheck();

  // Then run every 24 hours
  const intervalId = setInterval(() => {
    runTrialExpirationCheck();
  }, 24 * 60 * 60 * 1000);

  scheduledJobs.set(jobKey, intervalId);
}

async function runTrialExpirationCheck(): Promise<void> {
  try {
    console.log(`[TrialExpiration] Running trial expiration check at ${new Date().toISOString()}`);
    const allBusinesses = await storage.getAllBusinesses();
    const now = new Date();
    let deprovisioned = 0;
    let warned = 0;

    for (const business of allBusinesses) {
      // Skip businesses with active paid subscriptions
      const status = (business as any).subscriptionStatus;
      if (status === 'active' || status === 'trialing') {
        continue;
      }

      if (!business.trialEndsAt) continue;

      const trialEnd = new Date(business.trialEndsAt);
      const daysUntilExpiry = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      // EXPIRED: Deprovision if trial has expired and still has Twilio number
      if (trialEnd < now && (business as any).twilioPhoneNumberSid) {
        try {
          console.log(`[TrialExpiration] Deprovisioning business ${business.id} (trial expired ${trialEnd.toISOString()})`);
          await deprovisionBusiness(business.id);
          deprovisioned++;
        } catch (err) {
          console.error(`[TrialExpiration] Failed to deprovision business ${business.id}:`, err);
        }
        // Delay between deprovisions to avoid rate limits
        await new Promise(r => setTimeout(r, 500));
        continue;
      }

      // PRE-EXPIRATION WARNINGS: 3 days and 1 day before expiry
      if (daysUntilExpiry === 3 || daysUntilExpiry === 1) {
        // Check notification log to avoid duplicate warnings on the same day
        try {
          const logs = await storage.getNotificationLogs(business.id, 50);
          const alreadySent = logs.some(
            (l: any) => l.type === 'trial_expiration_warning' &&
                 l.referenceId === daysUntilExpiry &&
                 l.sentAt && (now.getTime() - new Date(l.sentAt).getTime()) < 24 * 60 * 60 * 1000
          );

          if (!alreadySent) {
            await sendTrialExpirationWarnings(business as any, daysUntilExpiry);
            warned++;
          }
        } catch (err) {
          console.error(`[TrialExpiration] Error checking/sending warnings for business ${business.id}:`, err);
        }
      }

      await new Promise(r => setTimeout(r, 200));
    }

    console.log(`[TrialExpiration] Done — ${deprovisioned} deprovisioned, ${warned} warned`);
  } catch (error) {
    console.error('[TrialExpiration] Error:', error);
  }
}

/**
 * Send trial expiration warning email and SMS to a business owner.
 * SMS is only sent if call forwarding is enabled (most urgent case).
 */
async function sendTrialExpirationWarnings(business: any, daysRemaining: number): Promise<void> {
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
  runDataRetention();

  // Then run every 24 hours
  const intervalId = setInterval(() => {
    runDataRetention();
  }, 24 * 60 * 60 * 1000); // Every 24 hours

  scheduledJobs.set(jobKey, intervalId);
}

/**
 * Daily Summary Email Scheduler
 * Sends a morning recap email to business owners with yesterday's metrics
 */
function startDailySummaryScheduler(): void {
  const jobKey = 'daily-summary';
  if (scheduledJobs.has(jobKey)) return;

  console.log('Starting daily summary scheduler');

  const runDailySummaries = async () => {
    try {
      const businesses = await storage.getAllBusinesses();
      const baseUrl = process.env.APP_URL || process.env.BASE_URL || 'https://www.smallbizagent.ai';

      for (const business of businesses) {
        try {
          // Check if business has daily summary enabled
          const notifSettings = await storage.getNotificationSettings(business.id);
          if (notifSettings && notifSettings.dailySummaryEmail === false) continue;

          // Get business owner
          const owner = await storage.getBusinessOwner(business.id);
          if (!owner?.email) continue;

          const tz = business.timezone || 'America/New_York';
          const now = new Date();
          const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          const startOfYesterday = new Date(yesterday.toLocaleDateString('en-US', { timeZone: tz }));
          const endOfYesterday = new Date(now.toLocaleDateString('en-US', { timeZone: tz }));

          // Gather yesterday's metrics
          const yesterdayCalls = await storage.getCallLogs(business.id, {
            startDate: startOfYesterday,
            endDate: endOfYesterday,
          });

          const appointments = await storage.getAppointments(business.id);
          const yesterdayBooked = appointments.filter(a => {
            const created = new Date(a.createdAt || '');
            return created >= startOfYesterday && created < endOfYesterday;
          });
          const todayAppts = appointments.filter(a => {
            const start = new Date(a.startDate || '');
            return start >= endOfYesterday && start < new Date(endOfYesterday.getTime() + 24 * 60 * 60 * 1000) && a.status !== 'cancelled';
          });

          const customers = await storage.getCustomers(business.id);
          const newCustomers = customers.filter(c => {
            const created = new Date(c.createdAt || '');
            return created >= startOfYesterday && created < endOfYesterday;
          });

          // Skip if nothing happened yesterday (don't spam with empty summaries)
          if (yesterdayCalls.length === 0 && yesterdayBooked.length === 0 && newCustomers.length === 0 && todayAppts.length === 0) {
            continue;
          }

          const dateStr = yesterday.toLocaleDateString('en-US', { timeZone: tz, weekday: 'long', month: 'short', day: 'numeric' });

          await sendDailySummaryEmail(
            owner.email,
            business.name || 'Your Business',
            {
              date: dateStr,
              totalCalls: yesterdayCalls.length,
              missedCalls: yesterdayCalls.filter(c => c.status === 'missed').length,
              appointmentsBooked: yesterdayBooked.length,
              appointmentsToday: todayAppts.length,
              invoicesPaid: 0, // Would need invoice lookup
              revenueCollected: '$0', // Would need payment lookup
              newCustomers: newCustomers.length,
            },
            `${baseUrl}/dashboard`
          );
          console.log(`[DailySummary] Sent to ${owner.email} for business ${business.id}`);
        } catch (err) {
          console.error(`[DailySummary] Error for business ${business.id}:`, err);
        }
      }
    } catch (err) {
      console.error('[DailySummary] Scheduler error:', err);
    }
  };

  // Run every 24 hours (designed to run at ~8am server time)
  const intervalId = setInterval(() => {
    runDailySummaries();
  }, 24 * 60 * 60 * 1000);

  scheduledJobs.set(jobKey, intervalId);

  // Run first check after 1 minute (let server fully start)
  setTimeout(() => {
    // Only send if it's morning time (6am-10am) in US Eastern
    const nowET = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
    const hour = new Date(nowET).getHours();
    if (hour >= 6 && hour <= 10) {
      runDailySummaries();
    }
  }, 60 * 1000);
}

/**
 * Start schedulers for all active businesses
 */
export async function startAllSchedulers(): Promise<void> {
  try {
    // Get all businesses and start a reminder scheduler for each
    const allBusinesses = await storage.getAllBusinesses();

    for (const business of allBusinesses) {
      startReminderScheduler(business.id);
    }

    if (allBusinesses.length === 0) {
      console.log('No businesses found — reminder schedulers skipped');
    }

    // Start recurring jobs scheduler (runs globally, not per-business)
    startRecurringJobsScheduler();

    // Start Vapi daily refresh (keeps TODAY'S DATE current in AI prompts)
    startVapiDailyRefreshScheduler();

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

    // Start data retention scheduler (purges expired call recordings and transcripts daily)
    startDataRetentionScheduler();

    // Start daily summary scheduler (sends morning recap to business owners)
    startDailySummaryScheduler();

    console.log('All schedulers started');
  } catch (error) {
    console.error('Error starting schedulers:', error);
  }
}

/**
 * Stop all schedulers
 */
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
  startRecurringJobsScheduler,
  startVapiDailyRefreshScheduler,
  startOverdueInvoiceScheduler,
  startQuoteFollowUpScheduler,
  startOverageBillingScheduler,
  startBirthdayCampaignScheduler,
  startTrialExpirationScheduler,
  startDataRetentionScheduler,
  startDailySummaryScheduler,
  startAllSchedulers,
  stopAllSchedulers
};
