import { storage } from "../storage";
import reminderService from "./reminderService";
import { processDueRecurringSchedules } from "../routes/recurring";
import { updateVapiAssistant } from "./vapiProvisioningService";

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
  startAllSchedulers,
  stopAllSchedulers
};
