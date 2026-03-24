/**
 * Message Intelligence Service
 *
 * The SINGLE outbound path for all SMS. Every message — transactional, agent,
 * marketing, campaign — passes through this service before reaching Twilio.
 *
 * Two modes controlled by `useTemplate`:
 *   true  → Smart template: fillTemplate() with enhanced variable injection (no OpenAI)
 *   false → Full AI generation: GPT-5.4-mini with vertical config + business profile + customer memory
 *
 * Fallback: If AI fails, falls back to the provided fallbackTemplate. Never silently drops a message.
 *
 * Architecture:
 *   Agent/Trigger/Notification → messageIntelligenceService.generateMessage() → twilioService.sendSms()
 */

import OpenAI from 'openai';
import { storage } from '../storage';
import { sendSms } from './twilioService';
import { getVerticalConfig, type VerticalConfig } from '../config/verticals';
import { fillTemplate } from './agentSettingsService';
import type { SmsBusinessProfile, CustomerInsightsRow } from '@shared/schema';

// ─── Types ───────────────────────────────────────────────────────────────────

export type MessageType =
  | 'BOOKING_CONFIRMATION'
  | 'APPOINTMENT_REMINDER'
  | 'JOB_CONFIRMATION'
  | 'JOB_REMINDER'
  | 'ETA_UPDATE'
  | 'JOB_COMPLETE'
  | 'ESTIMATE_FOLLOWUP'
  | 'POST_SERVICE_FOLLOWUP'
  | 'RESCHEDULE_CONFIRMATION'
  | 'CANCELLATION_ACKNOWLEDGMENT'
  | 'NO_SHOW_FOLLOWUP'
  | 'WIN_BACK'
  | 'REBOOKING_NUDGE'
  | 'BIRTHDAY'
  | 'REVIEW_REQUEST'
  | 'WEATHER_DELAY'
  | 'RESERVATION_CONFIRMATION'
  | 'RESERVATION_REMINDER'
  | 'CAMPAIGN_BROADCAST'
  | 'CAMPAIGN_SEQUENCE'
  | 'HOLDING_MESSAGE'
  | 'ESCALATION_NOTICE'
  | 'FOLLOW_UP_THANK_YOU'
  | 'FOLLOW_UP_UPSELL';

export interface MessageContext {
  messageType: MessageType;
  businessId: number;
  customerId: number;
  recipientPhone: string;
  /** true = smart template (no AI), false = full AI generation */
  useTemplate: boolean;
  /** Context data for template variables and AI prompt */
  context: Record<string, any>;
  /** Existing template for fallback if AI fails */
  fallbackTemplate?: string;
  fallbackVars?: Record<string, string>;
  /** Flags */
  isMarketing: boolean;
  campaignId?: number;
  sequenceId?: number;
  stepNumber?: number;
  appendOptOut?: boolean;
}

export interface MessageResult {
  success: boolean;
  body?: string;
  messageId?: number;
  fallbackUsed: boolean;
  queued?: boolean;
  skipped?: boolean;
  skipReason?: string;
  error?: string;
}

// ─── Message-Type-Specific AI Instructions ───────────────────────────────────

const MESSAGE_TYPE_INSTRUCTIONS: Record<string, string> = {
  BOOKING_CONFIRMATION: 'Confirm their booking. Include service name, date, time, and staff if assigned. Keep it warm and brief.',
  APPOINTMENT_REMINDER: 'Remind them about their upcoming appointment. Include the date, time, and service. Mention they can reply CONFIRM, RESCHEDULE, or C.',
  JOB_CONFIRMATION: 'Confirm the scheduled job. Include what service, the date/time window, and property address if applicable.',
  JOB_REMINDER: 'Remind about the upcoming job visit. Include date and time window.',
  ETA_UPDATE: 'Update on technician arrival. Include estimated arrival time. Be reassuring and brief.',
  JOB_COMPLETE: 'Thank them for choosing the business after job completion. Brief and warm.',
  ESTIMATE_FOLLOWUP: 'Follow up on a pending quote/estimate. Be helpful, not pushy. Mention the amount if available.',
  POST_SERVICE_FOLLOWUP: 'Thank them after their visit. Ask if everything went well. Very brief.',
  FOLLOW_UP_THANK_YOU: 'Thank them for their recent visit. Keep it personal and brief. Reference the service if known.',
  FOLLOW_UP_UPSELL: 'Suggest rebooking. Mention the service they had. Include a booking link if available. Casual, not salesy.',
  RESCHEDULE_CONFIRMATION: 'Confirm their rescheduled appointment with the new date and time.',
  CANCELLATION_ACKNOWLEDGMENT: 'Acknowledge the cancellation. Be understanding. Mention they can rebook anytime.',
  NO_SHOW_FOLLOWUP: 'Reach out after a missed appointment. Be understanding, not accusatory. Ask if they want to reschedule.',
  WIN_BACK: 'Re-engage an inactive customer. Reference how long it has been. Keep it natural, not desperate.',
  REBOOKING_NUDGE: 'Suggest it might be time for their next visit based on their usual schedule. Casual and helpful.',
  BIRTHDAY: 'Happy birthday! Brief, warm, personal. Mention any birthday special if the business offers one.',
  REVIEW_REQUEST: 'Ask for a review after a good experience. Be genuine, not transactional. Include the review link.',
  WEATHER_DELAY: 'Inform about a weather-related delay or reschedule. Be straightforward and offer alternatives.',
  RESERVATION_CONFIRMATION: 'Confirm their restaurant reservation. Include date, time, party size.',
  RESERVATION_REMINDER: 'Remind about their upcoming reservation. Include date, time, party size.',
  CAMPAIGN_BROADCAST: 'Deliver the campaign message. Follow the campaign prompt closely. Sound natural, not like a mass text.',
  CAMPAIGN_SEQUENCE: 'Continue the campaign sequence. Reference previous touchpoints naturally.',
  HOLDING_MESSAGE: 'Let the customer know their message was received and someone will follow up. Brief and reassuring.',
  ESCALATION_NOTICE: 'Internal: notify the business owner that a customer needs human attention.',
};

// ─── Core Function ───────────────────────────────────────────────────────────

/**
 * Generate and send an intelligent SMS message.
 *
 * This is the ONLY path to Twilio for the entire platform.
 */
export async function generateMessage(ctx: MessageContext): Promise<MessageResult> {
  const startTime = Date.now();

  try {
    // ── 1. Load business ──
    const business = await storage.getBusiness(ctx.businessId);
    if (!business) {
      console.error(`[MIS] Business ${ctx.businessId} not found`);
      return { success: false, fallbackUsed: false, error: 'Business not found' };
    }

    // ── 2. Load vertical config ──
    const vertical = getVerticalConfig(business.industry);

    // ── 3. Load SMS business profile ──
    let smsProfile: SmsBusinessProfile | null = null;
    try {
      smsProfile = await storage.getSmsBusinessProfile(ctx.businessId);
    } catch {
      // Profile table may not exist yet on older deployments — graceful degradation
    }

    // ── 4. Opt-out check (with business ownership verification) ──
    if (ctx.customerId) {
      const customer = await storage.getCustomer(ctx.customerId);
      if (customer) {
        // CRITICAL: Verify customer belongs to this business (prevents IDOR)
        if (customer.businessId !== ctx.businessId) {
          console.error(`[MIS] SECURITY: Customer ${ctx.customerId} does not belong to business ${ctx.businessId} (belongs to ${customer.businessId})`);
          return { success: false, fallbackUsed: false, error: 'Customer does not belong to this business' };
        }
        if (ctx.isMarketing && !customer.marketingOptIn) {
          return { success: false, fallbackUsed: false, skipped: true, skipReason: 'marketing_opt_out' };
        }
        if (!ctx.isMarketing && !customer.smsOptIn) {
          return { success: false, fallbackUsed: false, skipped: true, skipReason: 'sms_opt_out' };
        }
      }
    }

    // ── 5. Engagement lock check (marketing only) ──
    if (ctx.isMarketing && ctx.customerId) {
      try {
        const lock = await storage.getEngagementLock(ctx.customerId, ctx.businessId);
        if (lock && lock.status === 'active' && lock.expiresAt && new Date(lock.expiresAt) > new Date()) {
          return { success: false, fallbackUsed: false, queued: true, skipReason: 'engagement_locked' };
        }
      } catch {
        // Lock check failed — proceed anyway (don't block sends on lock infrastructure issues)
      }
    }

    // ── 6. Generate message body ──
    let body: string;
    let fallbackUsed = false;
    let aiMetadata: Record<string, any> = {};

    if (ctx.useTemplate) {
      // ── Smart template path (no AI) ──
      body = buildSmartTemplate(ctx, business, vertical);
    } else {
      // ── AI generation path ──
      const profileComplete = smsProfile?.profileComplete === true;

      if (!profileComplete || !process.env.OPENAI_API_KEY) {
        // Profile not complete or no OpenAI key — use fallback template
        if (ctx.fallbackTemplate && ctx.fallbackVars) {
          body = fillTemplate(ctx.fallbackTemplate, ctx.fallbackVars);
          fallbackUsed = true;
        } else {
          body = buildSmartTemplate(ctx, business, vertical);
          fallbackUsed = true;
        }
      } else {
        // Full AI generation
        try {
          const aiResult = await generateAiMessage(ctx, business, vertical, smsProfile!);
          body = aiResult.body;
          aiMetadata = {
            modelUsed: aiResult.modelUsed,
            tokenCount: aiResult.tokenCount,
            aiGeneratedBody: aiResult.body,
          };
        } catch (aiErr) {
          console.error(`[MIS] AI generation failed for ${ctx.messageType}, falling back:`, aiErr);
          if (ctx.fallbackTemplate && ctx.fallbackVars) {
            body = fillTemplate(ctx.fallbackTemplate, ctx.fallbackVars);
          } else {
            body = buildSmartTemplate(ctx, business, vertical);
          }
          fallbackUsed = true;
        }
      }
    }

    // ── 7. Validate ──
    if (!body || body.trim().length === 0) {
      console.error(`[MIS] Empty message body for ${ctx.messageType}, business ${ctx.businessId}`);
      return { success: false, fallbackUsed, error: 'Empty message body' };
    }

    // ── 8. Append opt-out footer for marketing ──
    if (ctx.appendOptOut || (ctx.isMarketing && !body.includes('STOP'))) {
      body += '\n\nReply STOP to unsubscribe.';
    }

    // ── 9. Send via Twilio ──
    const twilioResult = await sendSms(ctx.recipientPhone, body, undefined, ctx.businessId);

    // ── 10. Log to outbound_messages ──
    const latencyMs = Date.now() - startTime;
    let messageId: number | undefined;
    try {
      const logEntry = await storage.createOutboundMessage({
        businessId: ctx.businessId,
        customerId: ctx.customerId,
        messageType: ctx.messageType,
        campaignId: ctx.campaignId ?? null,
        sequenceId: ctx.sequenceId ?? null,
        stepNumber: ctx.stepNumber ?? null,
        body,
        generatedAt: new Date(),
        sentAt: new Date(),
        twilioSid: (twilioResult as any)?.sid || null,
        status: 'sent',
        fallbackUsed,
        metadata: {
          ...aiMetadata,
          triggerSource: ctx.context?.triggerSource || 'unknown',
          latencyMs,
          templateUsed: fallbackUsed ? (ctx.fallbackTemplate?.substring(0, 50) || 'smart_template') : null,
        },
      });
      messageId = logEntry?.id;
    } catch (logErr) {
      console.error('[MIS] Failed to log outbound message:', logErr);
    }

    // ── 11. Update conversation state (fire-and-forget) ──
    if (ctx.customerId) {
      storage.upsertConversationState(ctx.businessId, ctx.customerId, {
        lastMessageSentAt: new Date(),
        lastMessageType: ctx.messageType,
        awaitingResponse: ctx.isMarketing, // Marketing messages expect a reply; transactional don't
        activeCampaignSequenceId: ctx.sequenceId ?? null,
      }).catch(() => {});
    }

    // ── 12. Store in Mem0 (fire-and-forget) ──
    if (ctx.customerId) {
      import('./mem0Service').then(({ addMemory }) => {
        const memContent = `Sent ${ctx.messageType} SMS: "${body.substring(0, 80)}..."`;
        addMemory(ctx.businessId, ctx.customerId, [{ role: 'assistant', content: memContent }]).catch(() => {});
      }).catch(() => {});
    }

    // ── 13. Write to activity feed (fire-and-forget) ──
    try {
      storage.createSmsActivityFeedEntry({
        businessId: ctx.businessId,
        eventType: mapMessageTypeToFeedEvent(ctx.messageType),
        customerName: ctx.context?.customerName || null,
        customerId: ctx.customerId,
        appointmentId: ctx.context?.appointmentId || null,
        campaignId: ctx.campaignId || null,
        metadata: {
          messagePreview: body.substring(0, 60),
          messageType: ctx.messageType,
          aiGenerated: !fallbackUsed && !ctx.useTemplate,
        },
      }).catch(() => {});
    } catch {}

    return {
      success: true,
      body,
      messageId,
      fallbackUsed,
    };
  } catch (err) {
    console.error(`[MIS] Unexpected error for ${ctx.messageType}, business ${ctx.businessId}:`, err);
    return {
      success: false,
      fallbackUsed: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

// ─── AI Generation ───────────────────────────────────────────────────────────

interface AiResult {
  body: string;
  modelUsed: string;
  tokenCount: number;
}

async function generateAiMessage(
  ctx: MessageContext,
  business: any,
  vertical: VerticalConfig,
  smsProfile: SmsBusinessProfile,
): Promise<AiResult> {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  // Load customer insights + memory in parallel
  let customerInsights: CustomerInsightsRow | null = null;
  let mem0Context = '';
  if (ctx.customerId) {
    const [insights, memory] = await Promise.all([
      storage.getCustomerInsights(ctx.customerId, ctx.businessId).catch(() => null),
      import('./mem0Service').then(({ searchMemory }) =>
        searchMemory(ctx.businessId, ctx.customerId, 'customer preferences history concerns', 3, 2000)
      ).catch(() => ''),
    ]);
    customerInsights = insights ?? null;
    mem0Context = memory;
  }

  // Build system prompt
  const systemPrompt = buildSystemPrompt(business, vertical, smsProfile, customerInsights, mem0Context, ctx);
  const userPrompt = buildUserPrompt(ctx);

  const response = await openai.chat.completions.create({
    model: 'gpt-5.4-mini',
    temperature: 0.7,
    max_completion_tokens: 100,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  });

  let body = response.choices[0]?.message?.content?.trim() ?? '';

  // Strip any wrapping quotes the AI might add
  if ((body.startsWith('"') && body.endsWith('"')) || (body.startsWith("'") && body.endsWith("'"))) {
    body = body.slice(1, -1);
  }

  // Validate length
  if (body.length > vertical.defaultMaxLength + 40) { // +40 for opt-out footer room
    // Truncate at last sentence boundary
    const truncated = body.substring(0, vertical.defaultMaxLength);
    const lastPeriod = Math.max(truncated.lastIndexOf('.'), truncated.lastIndexOf('!'), truncated.lastIndexOf('?'));
    body = lastPeriod > 50 ? truncated.substring(0, lastPeriod + 1) : truncated;
  }

  // Validate forbidden phrases
  for (const phrase of vertical.forbiddenPhrases) {
    if (body.toLowerCase().includes(phrase.toLowerCase())) {
      throw new Error(`AI output contains forbidden phrase: "${phrase}"`);
    }
  }

  return {
    body,
    modelUsed: 'gpt-5.4-mini',
    tokenCount: response.usage?.total_tokens ?? 0,
  };
}

function buildSystemPrompt(
  business: any,
  vertical: VerticalConfig,
  smsProfile: SmsBusinessProfile,
  insights: CustomerInsightsRow | null,
  mem0Context: string,
  ctx: MessageContext,
): string {
  const parts: string[] = [];

  // Identity
  parts.push(`You are the AI messaging assistant for ${business.name}, a ${vertical.displayName.toLowerCase()} business${business.city ? ` in ${business.city}` : ''}.`);

  // Personality
  parts.push(`\nBusiness personality: ${smsProfile.vibeChoice || vertical.defaultTone}`);
  parts.push(`How to sound: ${vertical.exampleVoice}.`);
  parts.push(`Sign messages as: ${smsProfile.signOffName || business.name}`);

  // Emoji
  const emojiRule = smsProfile.useEmoji ? 'Use emoji occasionally and naturally — 1 max per message' : 'Never use emoji';
  parts.push(`Emoji: ${emojiRule}`);

  // Length
  parts.push(`Max length: ${vertical.defaultMaxLength} characters. Be concise.`);

  // Business context
  if (smsProfile.oneThingCustomersShouldKnow) {
    parts.push(`\nAbout this business: ${smsProfile.oneThingCustomersShouldKnow}`);
  }
  if (smsProfile.cancellationPolicy) {
    parts.push(`Cancellation policy: ${smsProfile.cancellationPolicy}`);
  }
  if (smsProfile.topServices) {
    try {
      const services = JSON.parse(typeof smsProfile.topServices === 'string' ? smsProfile.topServices : JSON.stringify(smsProfile.topServices));
      if (Array.isArray(services) && services.length > 0) {
        parts.push(`Services: ${services.map((s: any) => s.name).join(', ')}`);
      }
    } catch {}
  }
  if (smsProfile.staffMembers) {
    try {
      const staff = JSON.parse(typeof smsProfile.staffMembers === 'string' ? smsProfile.staffMembers : JSON.stringify(smsProfile.staffMembers));
      if (Array.isArray(staff) && staff.length > 0) {
        parts.push(`Team: ${staff.map((s: any) => `${s.name} (${s.role})`).join(', ')}`);
      }
    } catch {}
  }

  // Customer context (from Mem0 + insights)
  if (insights || mem0Context) {
    parts.push('\nCustomer context:');
    if (insights) {
      const visitInfo = insights.totalVisits ? `This is visit #${insights.totalVisits}.` : 'New customer.';
      parts.push(visitInfo);
      if (insights.daysSinceLastVisit) parts.push(`Last visit: ${insights.daysSinceLastVisit} days ago.`);
      if (insights.preferredStaff) parts.push(`Prefers: ${insights.preferredStaff}`);
      if (insights.smsResponseRate !== null && insights.smsResponseRate !== undefined) {
        parts.push(`SMS response rate: ${Math.round((insights.smsResponseRate as number) * 100)}%`);
      }
      if (insights.riskLevel === 'high') parts.push('At risk of churning — be extra warm.');
    }
    if (mem0Context) parts.push(mem0Context);
  }

  // Message-type-specific instruction
  const typeInstruction = MESSAGE_TYPE_INSTRUCTIONS[ctx.messageType];
  if (typeInstruction) {
    parts.push(`\nTask: ${typeInstruction}`);
  }

  // Campaign context
  if (ctx.campaignId) {
    parts.push('This message is part of a campaign. Do not reference the campaign directly. Sound like a natural follow-up.');
  }

  // Rules
  parts.push('\nRules — never break these:');
  parts.push('- Sound like a human from THIS specific business');
  parts.push('- Never sound like software or a platform');
  parts.push(`- Never use: ${vertical.forbiddenPhrases.join(', ')}`);
  parts.push('- Reference specific details you have: name, service, staff member, time');
  parts.push('- First-time customer: warmer, more context');
  parts.push('- Regular (3+ visits): brief, they know you');
  parts.push('- Write the SMS message text ONLY. No quotes, no explanation, no prefixes.');

  return parts.join('\n');
}

function buildUserPrompt(ctx: MessageContext): string {
  const parts = [`Write one SMS for: ${ctx.messageType}`];

  if (ctx.context) {
    for (const [key, value] of Object.entries(ctx.context)) {
      if (value !== undefined && value !== null && value !== '' && key !== 'triggerSource') {
        parts.push(`${key}: ${value}`);
      }
    }
  }

  return parts.join('\n');
}

// ─── Smart Template Builder ──────────────────────────────────────────────────

/**
 * Build a personalized message using enhanced template logic (no AI call).
 * Used for confirmations, invoice notifications, and as fallback when AI is unavailable.
 */
function buildSmartTemplate(ctx: MessageContext, business: any, vertical: VerticalConfig): string {
  const c = ctx.context;
  const name = c?.customerName || 'there';
  const bizName = c?.businessName || business.name;

  switch (ctx.messageType) {
    case 'BOOKING_CONFIRMATION':
    case 'JOB_CONFIRMATION':
      return `Hi ${name}! Your ${c?.serviceName || 'appointment'} is confirmed for ${c?.appointmentDate || 'the scheduled date'} at ${c?.appointmentTime || 'the scheduled time'}. Reply RESCHEDULE or C to change. - ${bizName}`;
    case 'APPOINTMENT_REMINDER':
    case 'JOB_REMINDER':
      return `Hi ${name}! Reminder: Your ${c?.serviceName || 'appointment'} is on ${c?.appointmentDate || 'your scheduled date'} at ${c?.appointmentTime || 'the scheduled time'}. Reply CONFIRM, RESCHEDULE, or C. - ${bizName}`;
    case 'RESCHEDULE_CONFIRMATION':
      return `Hi ${name}! Your appointment has been rescheduled to ${c?.newDate || 'the new date'} at ${c?.newTime || 'the new time'}. - ${bizName}`;
    case 'CANCELLATION_ACKNOWLEDGMENT':
      return `Hi ${name}, your appointment has been cancelled. We'd love to see you again — book anytime at ${c?.bookingLink || 'our booking page'}. - ${bizName}`;
    case 'RESERVATION_CONFIRMATION':
      return `Hi ${name}! Your reservation for ${c?.partySize || '2'} at ${bizName} is confirmed for ${c?.appointmentDate || 'the date'} at ${c?.appointmentTime || 'the time'}.`;
    case 'RESERVATION_REMINDER':
      return `Hi ${name}! Reminder: Your reservation at ${bizName} is tomorrow at ${c?.appointmentTime || 'the time'} for ${c?.partySize || 'your party'}.`;
    case 'HOLDING_MESSAGE':
      return `Thanks for reaching out! We got your message and will follow up shortly. - ${bizName}`;
    default:
      // Generic fallback for types that should use AI but don't have a template
      if (ctx.fallbackTemplate && ctx.fallbackVars) {
        return fillTemplate(ctx.fallbackTemplate, ctx.fallbackVars);
      }
      return `Hi ${name}! Thanks for being a customer of ${bizName}. Call us anytime at ${c?.businessPhone || business.phone || 'our number'}.`;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mapMessageTypeToFeedEvent(messageType: MessageType): string {
  const map: Record<string, string> = {
    BOOKING_CONFIRMATION: 'booking_confirmed',
    APPOINTMENT_REMINDER: 'reminder_sent',
    JOB_CONFIRMATION: 'job_confirmed',
    NO_SHOW_FOLLOWUP: 'no_show_followup_sent',
    WIN_BACK: 'win_back_sent',
    REBOOKING_NUDGE: 'rebooking_nudge_sent',
    BIRTHDAY: 'birthday_sent',
    REVIEW_REQUEST: 'review_request_sent',
    CAMPAIGN_BROADCAST: 'campaign_sent',
    CAMPAIGN_SEQUENCE: 'campaign_sequence_sent',
    FOLLOW_UP_THANK_YOU: 'follow_up_sent',
    FOLLOW_UP_UPSELL: 'upsell_sent',
    ESTIMATE_FOLLOWUP: 'estimate_followup_sent',
    HOLDING_MESSAGE: 'escalation_needed',
    ESCALATION_NOTICE: 'escalation_needed',
    RESCHEDULE_CONFIRMATION: 'reschedule_confirmed',
    CANCELLATION_ACKNOWLEDGMENT: 'cancellation_acknowledged',
  };
  return map[messageType] || 'sms_sent';
}

export default { generateMessage };
