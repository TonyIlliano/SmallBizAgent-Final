/**
 * Call Intelligence Service
 *
 * Analyzes call transcripts after each call to extract structured intelligence:
 * intent, outcome, sentiment, summary, key facts, and follow-up recommendations.
 *
 * Flow:
 * 1. Call ends -> handleEndOfCall creates call_log
 * 2. This service runs fire-and-forget to analyze the transcript
 * 3. Results stored in call_intelligence table
 * 4. recognizeCaller() pulls latest intelligence for returning callers
 * 5. Customer insights service recalculates after intelligence is ready
 * 6. Orchestrator dispatches intelligence.ready event
 */

import { claudeJson } from './claudeClient';
import { z } from 'zod';
import { storage } from '../storage';

// Zod schema for validating GPT-extracted intelligence
const extractedIntelligenceSchema = z.object({
  intent: z.enum(['booking', 'question', 'complaint', 'pricing_inquiry', 'emergency', 'general_inquiry', 'cancellation', 'follow_up', 'order']).catch('general_inquiry'),
  outcome: z.enum(['booked', 'not_booked', 'voicemail', 'transferred', 'complaint_filed', 'information_provided', 'order_placed']).catch('information_provided'),
  sentiment: z.number().min(1).max(5).catch(3),
  summary: z.string().max(500).catch(''),
  keyFacts: z.object({
    servicesMentioned: z.array(z.string()).catch([]),
    objections: z.array(z.string()).catch([]),
    preferredTimes: z.array(z.string()).catch([]),
    staffPreference: z.string().nullable().catch(null),
    priceDiscussed: z.boolean().catch(false),
  }).catch({ servicesMentioned: [], objections: [], preferredTimes: [], staffPreference: null, priceDiscussed: false }),
  followUpNeeded: z.boolean().catch(false),
  followUpType: z.enum(['callback', 'send_info', 'send_quote', 'reschedule', 'none']).catch('none'),
  followUpNotes: z.string().max(500).catch(''),
  isNewCaller: z.boolean().catch(false),
});

type ExtractedIntelligence = z.infer<typeof extractedIntelligenceSchema>;

/**
 * Analyze a call transcript and store extracted intelligence.
 * Runs fire-and-forget — must not throw to caller.
 */
export async function analyzeCallIntelligence(
  businessId: number,
  callLogId: number,
  transcript: string,
  callerPhone?: string
): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return;

  // Skip very short transcripts (hangups, wrong numbers)
  if (!transcript || transcript.length < 100) {
    console.log(`[CallIntelligence] Skipping short transcript (${transcript?.length || 0} chars) for call ${callLogId}`);
    return;
  }

  // Idempotency: check if already processed
  const existing = await storage.getCallIntelligence(callLogId);
  if (existing && existing.processingStatus === 'completed') return;

  // Resolve customerId from callerPhone once (reused throughout)
  let resolvedCustomerId: number | null = existing?.customerId || null;
  if (!resolvedCustomerId && callerPhone && callerPhone !== 'Unknown') {
    try {
      const customer = await storage.getCustomerByPhone(callerPhone, businessId);
      if (customer) resolvedCustomerId = customer.id;
    } catch { /* best effort */ }
  }

  try {
    // Create or get the pending intelligence row
    let intelligenceId: number;
    if (existing) {
      intelligenceId = existing.id;
      await storage.updateCallIntelligence(intelligenceId, { processingStatus: 'processing' });
    } else {
      const row = await storage.createCallIntelligence({
        businessId,
        callLogId,
        customerId: resolvedCustomerId,
        processingStatus: 'processing',
      });
      intelligenceId = row.id;
    }

    const truncatedTranscript = transcript.substring(0, 15000);

    const systemPrompt = `You are analyzing a phone call transcript between an AI receptionist and a caller for a small business.

Extract the following structured intelligence from the call:

1. **intent**: The primary reason for the call. One of: booking, question, complaint, pricing_inquiry, emergency, general_inquiry, cancellation, follow_up, order
2. **outcome**: What happened on the call. One of: booked, not_booked, voicemail, transferred, complaint_filed, information_provided, order_placed
3. **sentiment**: Caller's overall sentiment on a 1-5 scale (1=very negative/angry, 2=somewhat negative, 3=neutral, 4=positive, 5=very positive/enthusiastic)
4. **summary**: A 1-2 sentence plain English summary of the call (e.g., "Returning customer called to reschedule their haircut appointment from Thursday to Friday at 2pm.")
5. **keyFacts**: An object with:
   - servicesMentioned: array of services discussed (e.g., ["haircut", "color treatment"])
   - objections: array of any objections or concerns (e.g., ["price too high", "can't find parking"])
   - preferredTimes: array of preferred appointment times mentioned (e.g., ["mornings", "Tuesdays"])
   - staffPreference: name of preferred staff member if mentioned, null otherwise
   - priceDiscussed: boolean, whether pricing was discussed
6. **followUpNeeded**: boolean, whether this call needs a follow-up action
7. **followUpType**: One of: callback, send_info, send_quote, reschedule, none
8. **followUpNotes**: Brief description of what follow-up is needed (empty string if none)
9. **isNewCaller**: boolean, whether this appears to be a first-time caller (based on transcript context like "I found you online" or AI greeting them as new)

Return valid JSON only. No markdown, no code blocks.`;

    let rawParsed: any;
    try {
      rawParsed = await claudeJson<any>({
        system: systemPrompt,
        prompt: `Analyze this call transcript:\n\n${truncatedTranscript}`,
        maxTokens: 1500,
      });
    } catch (parseErr) {
      console.warn('[CallIntelligence] Failed to get/parse JSON for call', callLogId, ':', (parseErr as Error).message);
      await storage.updateCallIntelligence(intelligenceId, {
        processingStatus: 'failed',
        processingError: `AI/JSON parse error: ${(parseErr as Error).message?.substring(0, 200)}`,
      });
      return;
    }

    // Validate extracted data with Zod (uses .catch() defaults for invalid fields)
    const extracted = extractedIntelligenceSchema.parse(rawParsed);

    // Store the extracted intelligence
    await storage.updateCallIntelligence(intelligenceId, {
      customerId: resolvedCustomerId,
      intent: extracted.intent,
      outcome: extracted.outcome,
      sentiment: extracted.sentiment,
      summary: extracted.summary,
      keyFacts: extracted.keyFacts,
      followUpNeeded: extracted.followUpNeeded,
      followUpType: extracted.followUpType || 'none',
      followUpNotes: extracted.followUpNotes || '',
      isNewCaller: extracted.isNewCaller,
      processingStatus: 'completed',
      processingError: null,
      modelUsed: 'claude-sonnet-4-6',
      tokenCount: 0,
    });

    // Also update the call_log intentDetected field with the real intent
    // (replacing the static 'vapi-ai-call' value)
    await storage.updateCallLog(callLogId, {
      intentDetected: extracted.intent,
    });

    console.log(`[CallIntelligence] Analyzed call ${callLogId}: intent=${extracted.intent}, sentiment=${extracted.sentiment}, followUp=${extracted.followUpNeeded}`);

    // Store call memory in Mem0 (fire-and-forget — never blocks)
    if (resolvedCustomerId) {
      import('./mem0Service').then(({ addMemory }) => {
        const memoryContent = [
          `Call summary: ${extracted.summary}`,
          `Intent: ${extracted.intent}`,
          `Sentiment: ${extracted.sentiment}/5`,
          extracted.keyFacts.servicesMentioned.length > 0
            ? `Services mentioned: ${extracted.keyFacts.servicesMentioned.join(', ')}`
            : null,
          extracted.keyFacts.staffPreference
            ? `Staff preference: ${extracted.keyFacts.staffPreference}`
            : null,
          extracted.keyFacts.objections.length > 0
            ? `Concerns: ${extracted.keyFacts.objections.join(', ')}`
            : null,
          extracted.followUpNeeded
            ? `Follow-up needed: ${extracted.followUpType} — ${extracted.followUpNotes}`
            : null,
        ].filter(Boolean).join('. ');

        addMemory(
          businessId,
          resolvedCustomerId!,
          [{ role: 'assistant', content: memoryContent }],
          { type: 'call_intelligence', callLogId }
        ).catch(err => console.error('[Mem0] Error storing call memory:', err));
      }).catch(() => { /* mem0 import failed — graceful degradation */ });
    }

    // Trigger incremental customer insights update (fire-and-forget)
    if (resolvedCustomerId) {
      import('./customerInsightsService').then(({ recalculateCustomerInsights }) => {
        recalculateCustomerInsights(resolvedCustomerId!, businessId)
          .catch(err => console.error('[CustomerInsights] Incremental update error:', err));
      }).catch(err => console.error('[CustomerInsights] Import error:', err));
    }

    // Notify orchestrator that intelligence is ready (fire-and-forget)
    import('./orchestrationService').then(({ dispatchEvent }) => {
      dispatchEvent('intelligence.ready', {
        businessId,
        customerId: resolvedCustomerId || undefined,
        callLogId,
      }).catch(err => console.error('[Orchestrator] intelligence.ready dispatch error:', err));
    }).catch(err => console.error('[Orchestrator] Import error:', err));

    // Score call quality against the rubric (fire-and-forget, paid-tier only).
    // Becomes the merchant-facing "AI Quality Score" — one of two visible
    // artifacts of the agent platform (the other is Dreaming, post-launch).
    import('./callQualityService').then(({ scoreCall }) => {
      // Look up business industry/name once for the rubric
      storage.getBusiness(businessId)
        .then((business) => {
          return scoreCall({
            businessId,
            callLogId,
            transcript,
            industry: business?.industry,
            businessName: business?.name,
          });
        })
        .catch(err => console.error('[CallQuality] scoreCall error:', err));
    }).catch(err => console.error('[CallQuality] Import error:', err));

  } catch (err) {
    console.error(`[CallIntelligence] Error analyzing call ${callLogId}:`, err);
    try {
      if (existing?.id) {
        await storage.updateCallIntelligence(existing.id, {
          processingStatus: 'failed',
          processingError: (err as Error).message?.substring(0, 500),
        });
      }
    } catch { /* best effort */ }
  }
}

/**
 * Get the most recent call intelligence for a customer.
 * Used by recognizeCaller() to enrich Vapi context.
 */
export async function getLatestCustomerIntelligence(
  customerId: number,
  businessId: number
): Promise<{
  lastCallSummary: string;
  lastCallSentiment: number;
  preferredServices: string[];
  preferredTimes: string[];
  staffPreference: string | null;
  pendingFollowUp: boolean;
  followUpType: string;
  totalCalls: number;
} | null> {
  const records = await storage.getCallIntelligenceByCustomer(customerId, businessId, 10);
  if (records.length === 0) return null;

  const latest = records[0];

  // Aggregate across recent calls
  const allFacts = records
    .map(r => r.keyFacts as any)
    .filter(Boolean);

  const preferredServices = Array.from(new Set(
    allFacts.flatMap((f: any) => f.servicesMentioned || [])
  ));

  const preferredTimes = Array.from(new Set(
    allFacts.flatMap((f: any) => f.preferredTimes || [])
  ));

  const staffPreference = allFacts
    .map((f: any) => f.staffPreference)
    .find((s: any) => s != null) || null;

  const pendingFollowUp = records.some(r => r.followUpNeeded && r.followUpType !== 'none');

  return {
    lastCallSummary: latest.summary || '',
    lastCallSentiment: latest.sentiment || 3,
    preferredServices,
    preferredTimes,
    staffPreference,
    pendingFollowUp,
    followUpType: latest.followUpType || 'none',
    totalCalls: records.length,
  };
}
