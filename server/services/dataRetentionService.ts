import { db } from '../db';
import {
  businesses, callLogs,
  notificationLog, agentActivityLog, webhookDeliveries, processedWebhookEvents, deadLetterJobs,
} from '@shared/schema';
import { and, lt, eq, isNotNull, sql } from 'drizzle-orm';
import { logAudit } from './auditService';

/**
 * Data Retention Service
 * Runs daily to purge expired call recordings and transcripts based on each business's retention settings.
 */
export async function runDataRetention(): Promise<void> {
  console.log('[DataRetention] Starting data retention cleanup...');

  try {
    // Get all businesses with their retention settings
    const allBusinesses = await db.select({
      id: businesses.id,
      name: businesses.name,
      callRecordingRetentionDays: businesses.callRecordingRetentionDays,
      dataRetentionDays: businesses.dataRetentionDays,
    }).from(businesses);

    let totalRecordingsPurged = 0;
    let totalTranscriptsPurged = 0;

    for (const biz of allBusinesses) {
      const recordingRetention = biz.callRecordingRetentionDays || 90;
      const transcriptRetention = biz.dataRetentionDays || 365;

      // Purge expired call recordings (null out recordingUrl)
      const recordingCutoff = new Date();
      recordingCutoff.setDate(recordingCutoff.getDate() - recordingRetention);

      // TODO: Before nulling recordingUrl, delete the actual audio files from S3.
      // Currently we only remove the database reference, leaving orphaned files
      // in the S3 bucket. Implement S3 deletion using the AWS SDK
      // (e.g., s3.deleteObject) for each recordingUrl before setting it to null.
      const recordingsResult = await db.update(callLogs)
        .set({ recordingUrl: null })
        .where(and(
          eq(callLogs.businessId, biz.id),
          isNotNull(callLogs.recordingUrl),
          lt(callLogs.callTime, recordingCutoff)
        ))
        .returning({ id: callLogs.id });

      // Purge expired transcripts
      const transcriptCutoff = new Date();
      transcriptCutoff.setDate(transcriptCutoff.getDate() - transcriptRetention);

      const transcriptsResult = await db.update(callLogs)
        .set({ transcript: null })
        .where(and(
          eq(callLogs.businessId, biz.id),
          isNotNull(callLogs.transcript),
          lt(callLogs.callTime, transcriptCutoff)
        ))
        .returning({ id: callLogs.id });

      const recordingCount = recordingsResult.length;
      const transcriptCount = transcriptsResult.length;

      if (recordingCount > 0 || transcriptCount > 0) {
        totalRecordingsPurged += recordingCount;
        totalTranscriptsPurged += transcriptCount;

        await logAudit({
          businessId: biz.id,
          action: 'data_delete',
          resource: 'call_log',
          details: {
            type: 'retention_cleanup',
            recordingsPurged: recordingCount,
            transcriptsPurged: transcriptCount,
            recordingRetentionDays: recordingRetention,
            transcriptRetentionDays: transcriptRetention,
          },
        });
      }
    }

    console.log(`[DataRetention] Cleanup complete. Purged ${totalRecordingsPurged} recordings, ${totalTranscriptsPurged} transcripts`);
  } catch (error) {
    console.error('[DataRetention] Error during data retention cleanup:', error);
  }

  // Platform log tables — these were previously unbounded and would become
  // the largest tables in the DB at scale, bloating backups and slowing the
  // dedup queries that read them on every send.
  await purgePlatformLogTables();
}

/**
 * Purge platform-wide log tables past their retention windows.
 *
 * Retention windows are chosen to stay safely ABOVE every dedup window that
 * reads these tables:
 *   - notification_log: 365d (longest dedup reader is the 90-day membership
 *     tune-up nudge; 365d also preserves a year of TCPA send evidence)
 *   - agent_activity_log: 180d (activity feed + admin views look back weeks)
 *   - webhook_deliveries: 90d (delivery debugging is only useful recent)
 *   - processed_webhook_events: 90d (Stripe retries max out at 3 days)
 *   - dead_letter_jobs: resolved rows after 90d (pending rows are kept forever)
 *
 * Each purge is independently fail-soft so one bad table never blocks the rest.
 */
export async function purgePlatformLogTables(): Promise<void> {
  const daysAgo = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return d;
  };

  const purges: Array<{ label: string; run: () => Promise<unknown> }> = [
    {
      label: 'notification_log (365d)',
      run: () => db.delete(notificationLog).where(lt(notificationLog.sentAt, daysAgo(365))),
    },
    {
      label: 'agent_activity_log (180d)',
      run: () => db.delete(agentActivityLog).where(lt(agentActivityLog.createdAt, daysAgo(180))),
    },
    {
      label: 'webhook_deliveries (90d)',
      run: () => db.delete(webhookDeliveries).where(lt(webhookDeliveries.createdAt, daysAgo(90))),
    },
    {
      label: 'processed_webhook_events (90d)',
      run: () => db.delete(processedWebhookEvents).where(lt(processedWebhookEvents.processedAt, daysAgo(90))),
    },
    {
      label: 'dead_letter_jobs resolved (90d)',
      run: () => db.delete(deadLetterJobs).where(and(
        lt(deadLetterJobs.failedAt, daysAgo(90)),
        sql`${deadLetterJobs.status} <> 'pending'`,
      )),
    },
  ];

  for (const purge of purges) {
    try {
      const result: any = await purge.run();
      const count = result?.rowCount ?? 0;
      if (count > 0) {
        console.log(`[DataRetention] Purged ${count} rows from ${purge.label}`);
      }
    } catch (err: any) {
      // Table may not exist yet on a fresh deploy — that's fine
      if (!String(err?.message || err).includes('does not exist')) {
        console.error(`[DataRetention] Failed purging ${purge.label}:`, err?.message || err);
      }
    }
  }
}
