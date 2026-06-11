/**
 * Job Queue Service (pg-boss)
 *
 * Replaces fire-and-forget patterns with a reliable, retryable job queue
 * backed by PostgreSQL. Jobs are persisted, retried on failure, and
 * provide visibility into what's pending/failed.
 *
 * Key benefits:
 * - Jobs survive server restarts (persisted in PostgreSQL)
 * - Automatic retry with exponential backoff (3 retries by default)
 * - Dead letter queue for permanently failed jobs
 * - Cross-instance safe (pg-boss uses PostgreSQL advisory locks)
 * - Built-in monitoring (job counts by state)
 *
 * Usage:
 *   import { enqueue } from './services/jobQueue';
 *   await enqueue('send-sms', { phone: '+1234567890', message: 'Hello' });
 *
 * Job types are defined in JOB_HANDLERS below.
 */

import PgBoss from 'pg-boss';
import { logAndSwallow } from '../utils/safeAsync';

// ── Singleton ──

let boss: PgBoss | null = null;
let started = false;

/**
 * Get or create the pg-boss instance.
 * Uses DATABASE_URL from environment (same as Drizzle/Neon).
 */
export function getBoss(): PgBoss {
  if (!boss) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('[JobQueue] DATABASE_URL is required');
    }
    boss = new PgBoss({
      connectionString,
      // Schema for pg-boss tables (keeps them separate from app tables)
      schema: 'pgboss',
      // Retry configuration
      retryLimit: 3,
      retryDelay: 30, // 30 seconds between retries
      retryBackoff: true, // Exponential backoff (30s, 60s, 120s)
      // Expiration: jobs older than 4 hours are expired (pg-boss v10 max is < 24h)
      expireInHours: 4,
      // Archive completed jobs for 7 days (for debugging)
      archiveCompletedAfterSeconds: 7 * 24 * 60 * 60,
      // Delete archived jobs after 14 days
      deleteAfterDays: 14,
      // Monitor interval (check for stuck/expired jobs)
      monitorStateIntervalSeconds: 60,
    });

    boss.on('error', (error) => {
      console.error('[JobQueue] pg-boss error:', error);
    });

    boss.on('monitor-states', (states: any) => {
      const queues = states?.queues || [];
      const active = queues.reduce((sum: number, q: any) => sum + (q.active || 0), 0);
      const failed = queues.reduce((sum: number, q: any) => sum + (q.failed || 0), 0);
      if (active > 0 || failed > 0) {
        console.log(`[JobQueue] Active: ${active}, Failed: ${failed}`);
      }
    });
  }
  return boss;
}

// ── Job Type Definitions ──

export type JobType =
  | 'send-sms'
  | 'send-email'
  | 'send-appointment-confirmation'
  | 'send-payment-confirmation'
  | 'send-job-completed-notification'
  | 'send-job-status-notification'
  | 'dispatch-orchestration-event'
  | 'fire-webhook-event'
  | 'sync-calendar'
  | 'analyze-call-intelligence'
  | 'notify-owner';

// ── Job Handlers ──

/**
 * Each handler processes one job type. They receive the job data
 * and must throw on failure (pg-boss will retry).
 */
const JOB_HANDLERS: Record<string, (data: any) => Promise<void>> = {
  'send-sms': async (data) => {
    const { sendSms } = await import('./twilioService');
    await sendSms(data.to, data.message, data.mediaUrl, data.businessId);
  },

  'send-email': async (data) => {
    const emailService = await import('../emailService');
    await emailService.sendEmail({ to: data.to, subject: data.subject, html: data.html, text: data.text });
  },

  'send-appointment-confirmation': async (data) => {
    const notificationService = (await import('./notificationService')).default;
    await notificationService.sendAppointmentConfirmation(data.appointmentId, data.businessId);
  },

  'send-payment-confirmation': async (data) => {
    const notificationService = (await import('./notificationService')).default;
    await notificationService.sendPaymentConfirmation(data.invoiceId, data.businessId);
  },

  'send-job-completed-notification': async (data) => {
    const notificationService = (await import('./notificationService')).default;
    await notificationService.sendJobCompletedNotification(data.jobId, data.businessId);
  },

  'send-job-status-notification': async (data) => {
    const mod = await import('./notificationService');
    if (data.statusType === 'in_progress') {
      await mod.sendJobInProgressNotification(data.jobId, data.businessId);
    } else if (data.statusType === 'waiting_parts') {
      await mod.sendJobWaitingPartsNotification(data.jobId, data.businessId);
    } else if (data.statusType === 'resumed') {
      await mod.sendJobResumedNotification(data.jobId, data.businessId);
    } else if (data.statusType === 'en_route') {
      await mod.sendJobEnRouteNotification(data.jobId, data.businessId);
    }
  },

  'dispatch-orchestration-event': async (data) => {
    const mod = await import('./orchestrationService');
    await mod.dispatchEvent(data.eventType, {
      businessId: data.businessId,
      customerId: data.customerId,
      referenceType: data.referenceType,
      referenceId: data.referenceId,
    });
  },

  'fire-webhook-event': async (data) => {
    const { fireEvent } = await import('./webhookService');
    await fireEvent(data.businessId, data.event, data.payload);
  },

  'sync-calendar': async (data) => {
    const { CalendarService } = await import('./calendarService');
    const calendarService = new CalendarService();
    if (data.action === 'sync') {
      await calendarService.syncAppointment(data.appointmentId);
    } else if (data.action === 'delete') {
      await calendarService.deleteAppointment(data.appointmentId);
    }
  },

  'analyze-call-intelligence': async (data) => {
    const { analyzeCallIntelligence } = await import('./callIntelligenceService');
    await analyzeCallIntelligence(data.businessId, data.callLogId, data.transcript);
  },

  'notify-owner': async (data) => {
    const mod = await import('./ownerNotificationService');
    if (data.type === 'new-booking') {
      await mod.notifyOwnerNewBooking(data.appointmentId, data.businessId);
    }
  },
};

// ── Dead Letter Queue ──

/**
 * Record a job that failed BOTH the pg-boss enqueue and the direct-execution
 * fallback. These are real customer-facing actions (SMS confirmations, payment
 * notifications, calendar syncs) — losing them silently is a slow churn driver
 * that's nearly impossible to diagnose after the fact. The row is replayable
 * via POST /api/admin/dead-letter-jobs/:id/replay.
 *
 * Best-effort by design: if the DB is so unhealthy that even this insert
 * fails, we alert and log — observability must never make the failure worse.
 */
async function recordDeadLetter(jobType: string, data: Record<string, any>, err: unknown): Promise<void> {
  const errorMessage = err instanceof Error ? `${err.message}\n${err.stack ?? ''}`.slice(0, 4000) : String(err).slice(0, 4000);
  try {
    const { db } = await import('../db');
    const { deadLetterJobs } = await import('@shared/schema');
    await db.insert(deadLetterJobs).values({
      jobType,
      payload: data,
      error: errorMessage,
      status: 'pending',
    });
    console.error(`[JobQueue] Dead-lettered ${jobType} — replay from the admin dashboard`);
  } catch (dbErr) {
    console.error(`[JobQueue] CRITICAL: could not dead-letter ${jobType} — job is lost:`, dbErr);
  }
  try {
    const { sendAdminAlert } = await import('./adminAlertService');
    await sendAdminAlert({
      type: 'job_dead_lettered',
      severity: 'high',
      title: `Background job lost both queue and direct paths: ${jobType}`,
      details: { jobType, error: errorMessage.slice(0, 500), payload: data },
    });
  } catch (alertErr) {
    console.error('[JobQueue] Failed to send dead-letter admin alert:', alertErr);
  }
}

/**
 * Execute a job handler directly, bypassing the queue. Used by the
 * dead-letter replay endpoint. Throws on failure so the caller can report it.
 */
export async function executeJobDirectly(jobType: string, data: Record<string, any>): Promise<void> {
  const handler = JOB_HANDLERS[jobType];
  if (!handler) {
    throw new Error(`Unknown job type: ${jobType}`);
  }
  await handler(data);
}

// ── Public API ──

/**
 * Enqueue a job for reliable background processing.
 * Jobs are persisted in PostgreSQL and retried on failure.
 *
 * @param jobType - The type of job to enqueue
 * @param data - Job-specific data (serializable to JSON)
 * @param options - Optional pg-boss send options (priority, delay, etc.)
 */
export async function enqueue(
  jobType: JobType,
  data: Record<string, any>,
  options?: PgBoss.SendOptions
): Promise<string | null> {
  try {
    const b = getBoss();
    if (!started) {
      console.warn(`[JobQueue] Queue not started yet, job ${jobType} may be delayed`);
    }
    const jobId = await b.send(jobType, data, {
      retryLimit: 3,
      retryDelay: 30,
      retryBackoff: true,
      ...options,
    });
    return jobId;
  } catch (err) {
    // If pg-boss fails (DB down, etc.), fall back to fire-and-forget
    console.error(`[JobQueue] Failed to enqueue ${jobType}, falling back to direct execution:`, err);
    try {
      const handler = JOB_HANDLERS[jobType];
      if (!handler) {
        await recordDeadLetter(jobType, data, new Error(`No handler registered for ${jobType}`));
        return null;
      }
      handler(data).catch(async (e) => {
        console.error(`[JobQueue] Fallback execution of ${jobType} also failed — dead-lettering:`, e);
        await recordDeadLetter(jobType, data, e);
      });
    } catch (syncErr) {
      // Synchronous throw from the handler — dead-letter instead of losing the job
      console.error(`[JobQueue] Fallback execution of ${jobType} threw synchronously — dead-lettering:`, syncErr);
      await recordDeadLetter(jobType, data, syncErr);
    }
    return null;
  }
}

/**
 * Start the job queue. Must be called once at server startup.
 * Registers all job handlers and begins processing.
 */
export async function startJobQueue(): Promise<void> {
  try {
    const b = getBoss();
    await b.start();
    started = true;
    console.log('[JobQueue] pg-boss started');

    // Register all job handlers
    for (const [jobType, handler] of Object.entries(JOB_HANDLERS)) {
      await b.work(jobType, async (jobs: PgBoss.Job[]) => {
        for (const job of jobs) {
          try {
            await handler(job.data as any);
          } catch (err) {
            console.error(`[JobQueue] Job ${jobType} (${job.id}) failed:`, err);
            throw err; // Re-throw so pg-boss marks it as failed and retries
          }
        }
      });
      console.log(`[JobQueue] Registered handler: ${jobType}`);
    }

    console.log(`[JobQueue] ${Object.keys(JOB_HANDLERS).length} job handlers registered`);
  } catch (err) {
    console.error('[JobQueue] Failed to start pg-boss:', err);
    // Don't crash the server — jobs will fall back to direct execution
  }
}

/**
 * Stop the job queue gracefully. Called on server shutdown.
 */
export async function stopJobQueue(): Promise<void> {
  if (boss && started) {
    try {
      await boss.stop({ graceful: true, timeout: 10000 });
      started = false;
      console.log('[JobQueue] pg-boss stopped gracefully');
    } catch (err) {
      console.error('[JobQueue] Error stopping pg-boss:', err);
    }
  }
}

/**
 * Get job queue statistics for monitoring.
 */
export async function getQueueStats(): Promise<Record<string, any>> {
  if (!boss || !started) return { status: 'not_started' };
  try {
    const states = await boss.getQueueSize('send-sms');
    return {
      status: 'running',
      // Per-queue stats can be fetched individually
      sendSms: states,
    };
  } catch {
    return { status: 'error' };
  }
}
