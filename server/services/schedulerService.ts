import { storage } from "../storage";
import reminderService from "./reminderService";
import { processDueRecurringSchedules } from "../routes/recurring";

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
  startAllSchedulers,
  stopAllSchedulers
};
