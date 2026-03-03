import { db } from '../db';
import { businesses, callLogs } from '@shared/schema';
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
}
