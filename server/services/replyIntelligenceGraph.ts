/**
 * Reply Intelligence Agent — LangGraph State Graph
 *
 * Processes inbound customer SMS replies using a proper state machine.
 * Follows the exact LangGraph pattern from agentGraph.ts:
 * - Dynamic imports (graceful degradation if LangGraph unavailable)
 * - Annotation.Root for typed state
 * - StateGraph with named nodes + conditional edges
 * - PostgreSQL checkpointing via PostgresSaver
 * - Falls back to existing smsConversationRouter.ts
 *
 * Graph:
 *   START → loadContext → classifyIntent → [route] →
 *     ├─ confirmNode → logResult → END
 *     ├─ cancelNode → logResult → END
 *     ├─ rescheduleNode → logResult → END
 *     ├─ infoNode → logResult → END
 *     ├─ campaignReplyNode → logResult → END
 *     └─ escalationNode → logResult → END
 */

import OpenAI from 'openai';
import { storage } from '../storage';
import { getVerticalConfig } from '../config/verticals';
import type { MessageType } from './messageIntelligenceService';

// ─── State Type ──────────────────────────────────────────────────────────────

interface ReplyIntelligenceState {
  // Input
  businessId: number;
  customerId: number | null;
  customerPhone: string;
  incomingMessage: string;
  twilioMessageSid?: string;
  // Context (set by loadContext)
  customerName: string;
  businessName: string;
  verticalId: string;
  upcomingAppointment: any | null;
  mem0Context: string;
  activeConversation: any | null;
  activeCampaignId: number | null;
  // Classification (set by classifyIntent)
  intent: string; // RESCHEDULE, CANCEL, CONFIRM, QUESTION, COMPLAINT, CAMPAIGN_REPLY, UNKNOWN
  confidence: number;
  entities: Record<string, any>;
  // Output
  responseMessage: string;
  action: string;
  result: string;
  complete: boolean;
  error: string | null;
}

// ─── Graph State ─────────────────────────────────────────────────────────────

let graphReady = false;
let compiledGraph: any = null;

export function isReplyGraphReady(): boolean {
  return graphReady;
}

export async function initReplyIntelligenceGraph(): Promise<void> {
  try {
    const { Annotation, StateGraph, START, END } = await import('@langchain/langgraph');
    const { PostgresSaver } = await import('@langchain/langgraph-checkpoint-postgres');

    // Define state annotation
    const StateAnnotation = Annotation.Root({
      businessId: Annotation<number>,
      customerId: Annotation<number | null>,
      customerPhone: Annotation<string>,
      incomingMessage: Annotation<string>,
      twilioMessageSid: Annotation<string | undefined>,
      customerName: Annotation<string>,
      businessName: Annotation<string>,
      verticalId: Annotation<string>,
      upcomingAppointment: Annotation<any>,
      mem0Context: Annotation<string>,
      activeConversation: Annotation<any>,
      activeCampaignId: Annotation<number | null>,
      intent: Annotation<string>,
      confidence: Annotation<number>,
      entities: Annotation<Record<string, any>>,
      responseMessage: Annotation<string>,
      action: Annotation<string>,
      result: Annotation<string>,
      complete: Annotation<boolean>,
      error: Annotation<string | null>,
    });

    // Build the graph
    const graph = new StateGraph(StateAnnotation)
      .addNode('loadContext', loadContextNode)
      .addNode('classifyIntent', classifyIntentNode)
      .addNode('confirmNode', confirmNode)
      .addNode('cancelNode', cancelNode)
      .addNode('rescheduleNode', rescheduleNode)
      .addNode('infoNode', infoNode)
      .addNode('escalationNode', escalationNode)
      .addNode('campaignReplyNode', campaignReplyNode)
      .addNode('logResult', logResultNode)
      .addEdge(START, 'loadContext')
      .addEdge('loadContext', 'classifyIntent')
      .addConditionalEdges('classifyIntent', routeByIntent, {
        confirm: 'confirmNode',
        cancel: 'cancelNode',
        reschedule: 'rescheduleNode',
        question: 'infoNode',
        campaign_reply: 'campaignReplyNode',
        escalate: 'escalationNode',
      })
      .addEdge('confirmNode', 'logResult')
      .addEdge('cancelNode', 'logResult')
      .addEdge('rescheduleNode', 'logResult')
      .addEdge('infoNode', 'logResult')
      .addEdge('escalationNode', 'logResult')
      .addEdge('campaignReplyNode', 'logResult')
      .addEdge('logResult', END);

    // Compile with PostgreSQL checkpointing if available
    if (process.env.DATABASE_URL) {
      try {
        const checkpointer = PostgresSaver.fromConnString(process.env.DATABASE_URL);
        await checkpointer.setup();
        compiledGraph = graph.compile({ checkpointer });
        console.log('[ReplyGraph] Compiled with PostgreSQL checkpointing');
      } catch (cpErr) {
        compiledGraph = graph.compile();
        console.warn('[ReplyGraph] PostgreSQL checkpointing failed, running without:', (cpErr as Error).message);
      }
    } else {
      compiledGraph = graph.compile();
    }

    graphReady = true;
    console.log('[ReplyGraph] Reply Intelligence Graph initialized successfully');
  } catch (err) {
    graphReady = false;
    console.warn('[ReplyGraph] LangGraph unavailable — reply intelligence will use fallback router:', (err as Error).message);
  }
}

/**
 * Invoke the reply intelligence graph for an inbound SMS.
 */
export async function invokeReplyGraph(input: {
  businessId: number;
  customerId?: number;
  customerPhone: string;
  incomingMessage: string;
  twilioMessageSid?: string;
}): Promise<ReplyIntelligenceState | null> {
  if (!graphReady || !compiledGraph) return null;

  try {
    const threadId = `sms_reply_${input.businessId}_${input.customerPhone.replace(/\D/g, '')}`;

    const initialState: Partial<ReplyIntelligenceState> = {
      businessId: input.businessId,
      customerId: input.customerId || null,
      customerPhone: input.customerPhone,
      incomingMessage: input.incomingMessage,
      twilioMessageSid: input.twilioMessageSid,
      customerName: '',
      businessName: '',
      verticalId: 'general',
      upcomingAppointment: null,
      mem0Context: '',
      activeConversation: null,
      activeCampaignId: null,
      intent: 'UNKNOWN',
      confidence: 0,
      entities: {},
      responseMessage: '',
      action: '',
      result: '',
      complete: false,
      error: null,
    };

    const result = await compiledGraph.invoke(initialState, {
      configurable: { thread_id: threadId },
    });

    return result as ReplyIntelligenceState;
  } catch (err) {
    console.error('[ReplyGraph] Invocation error:', err);
    return null;
  }
}

// ─── Graph Nodes ─────────────────────────────────────────────────────────────

async function loadContextNode(state: ReplyIntelligenceState): Promise<Partial<ReplyIntelligenceState>> {
  try {
    const business = await storage.getBusiness(state.businessId);
    if (!business) return { error: 'Business not found', complete: true };

    const vertical = getVerticalConfig(business.industry);
    const customer = state.customerId ? await storage.getCustomer(state.customerId) :
      await storage.getCustomerByPhone(state.customerPhone, state.businessId);

    let mem0Context = '';
    let upcomingAppointment = null;
    let activeConversation = null;
    let activeCampaignId = null;

    if (customer) {
      // Load context in parallel
      const [memory, appointments, conversation, convState] = await Promise.all([
        import('./mem0Service').then(({ searchMemory }) =>
          searchMemory(state.businessId, customer.id, 'customer history preferences', 3, 2000)
        ).catch(() => ''),
        storage.getAppointmentsByCustomerId(customer.id).catch(() => []),
        storage.getActiveSmsConversation(state.customerPhone, state.businessId).catch(() => null),
        storage.getConversationState(state.businessId, customer.id).catch(() => null),
      ]);

      mem0Context = memory;
      upcomingAppointment = (appointments as any[])
        .filter(a => new Date(a.startDate) > new Date() && a.status !== 'cancelled')
        .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())[0] || null;
      activeConversation = conversation;
      activeCampaignId = convState?.activeCampaignSequenceId ?? null;
    }

    return {
      customerId: customer?.id || null,
      customerName: customer?.firstName || 'there',
      businessName: business.name,
      verticalId: vertical.id,
      upcomingAppointment,
      mem0Context,
      activeConversation,
      activeCampaignId,
    };
  } catch (err) {
    console.error('[ReplyGraph] loadContext error:', err);
    return { error: (err as Error).message };
  }
}

async function classifyIntentNode(state: ReplyIntelligenceState): Promise<Partial<ReplyIntelligenceState>> {
  if (!process.env.OPENAI_API_KEY) {
    return { intent: 'UNKNOWN', confidence: 0, entities: {} };
  }

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const activeConvHint = state.activeConversation
      ? `Active conversation: Yes (type: ${state.activeConversation.agentType}, state: ${state.activeConversation.state})`
      : 'Active conversation: None';

    const systemPrompt = `Classify this SMS reply from a customer of a ${state.verticalId} business.
Customer: ${state.customerName}
Upcoming appointment: ${state.upcomingAppointment ? `Yes, on ${new Date(state.upcomingAppointment.startDate).toLocaleDateString()}` : 'None'}
${activeConvHint}
Active campaign: ${state.activeCampaignId ? 'Yes' : 'No'}
Customer memory: ${state.mem0Context || 'No history'}

IMPORTANT: If there is an active reschedule conversation (type: reschedule, state: reschedule_awaiting) and the customer provides a date, time, or day of the week, classify as RESCHEDULE with high confidence and extract the date/time into entities.

Return JSON only:
{
  "intent": "RESCHEDULE" | "CANCEL" | "CONFIRM" | "QUESTION" | "COMPLAINT" | "CAMPAIGN_REPLY" | "UNKNOWN",
  "confidence": 0.0-1.0,
  "entities": { "requestedDate": null, "requestedTime": null, "reason": null, "questionContent": null }
}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-5.4-mini',
      temperature: 0.2,
      max_completion_tokens: 200,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: state.incomingMessage },
      ],
    });

    let content = response.choices[0]?.message?.content?.trim() ?? '';
    content = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const parsed = JSON.parse(content);

    return {
      intent: parsed.intent || 'UNKNOWN',
      confidence: parsed.confidence || 0,
      entities: parsed.entities || {},
    };
  } catch (err) {
    console.error('[ReplyGraph] classifyIntent error:', err);
    return { intent: 'UNKNOWN', confidence: 0, entities: {} };
  }
}

function routeByIntent(state: ReplyIntelligenceState): string {
  // Low confidence = escalate
  if (state.confidence < 0.6) return 'escalate';

  switch (state.intent) {
    case 'CONFIRM': return 'confirm';
    case 'CANCEL': return 'cancel';
    case 'QUESTION': return 'question';
    case 'CAMPAIGN_REPLY': return 'campaign_reply';
    case 'COMPLAINT': return 'escalate';
    case 'RESCHEDULE': return 'reschedule';
    default: return 'escalate';
  }
}

async function confirmNode(state: ReplyIntelligenceState): Promise<Partial<ReplyIntelligenceState>> {
  try {
    if (state.upcomingAppointment) {
      await storage.updateAppointment(state.upcomingAppointment.id, { status: 'confirmed' });
      // Cancel pending reminder triggers
      if (state.customerId) {
        import('./marketingTriggerEngine').then(({ cancelTriggersOnEvent }) => {
          cancelTriggersOnEvent(state.businessId, state.customerId!, 'confirmed').catch(() => {});
        }).catch(() => {});
      }

      const tz = (await storage.getBusiness(state.businessId))?.timezone || 'America/New_York';
      const dateStr = new Date(state.upcomingAppointment.startDate).toLocaleDateString('en-US', { timeZone: tz, weekday: 'long', month: 'long', day: 'numeric' });
      const timeStr = new Date(state.upcomingAppointment.startDate).toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true });

      return {
        responseMessage: `Your appointment on ${dateStr} at ${timeStr} is confirmed! See you then. - ${state.businessName}`,
        action: 'confirmed',
        result: `Confirmed appointment ${state.upcomingAppointment.id}`,
        complete: true,
      };
    }
    return {
      responseMessage: `Thanks for confirming! We don't see an upcoming appointment on file. Call us at any time to book. - ${state.businessName}`,
      action: 'confirm_no_appointment',
      result: 'No appointment to confirm',
      complete: true,
    };
  } catch (err) {
    return { error: (err as Error).message, complete: true };
  }
}

async function cancelNode(state: ReplyIntelligenceState): Promise<Partial<ReplyIntelligenceState>> {
  try {
    if (state.upcomingAppointment) {
      const business = await storage.getBusiness(state.businessId);
      const tz = business?.timezone || 'America/New_York';
      const dateStr = new Date(state.upcomingAppointment.startDate).toLocaleDateString('en-US', { timeZone: tz, weekday: 'long', month: 'long', day: 'numeric' });
      const timeStr = new Date(state.upcomingAppointment.startDate).toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true });

      await storage.updateAppointment(state.upcomingAppointment.id, { status: 'cancelled' });

      // Write rebooking nudge trigger if vertical supports it
      const vertical = getVerticalConfig(business?.industry);
      if (vertical.rules.hasRebookingNudge && state.customerId) {
        const nudgeDate = new Date(Date.now() + (vertical.rules.rebookingCycleDays * 0.5 * 24 * 60 * 60 * 1000));
        storage.createMarketingTrigger({
          businessId: state.businessId,
          customerId: state.customerId,
          triggerType: 'REBOOKING_NUDGE',
          messageType: 'REBOOKING_NUDGE',
          scheduledFor: nudgeDate,
          status: 'pending',
        }).catch(() => {});
      }

      // Dispatch event
      import('./orchestrationService').then(({ dispatchEvent }) => {
        dispatchEvent('appointment.cancelled', {
          businessId: state.businessId, customerId: state.customerId ?? undefined,
          referenceType: 'appointment', referenceId: state.upcomingAppointment.id,
        }).catch(() => {});
      }).catch(() => {});

      return {
        responseMessage: `Your appointment on ${dateStr} at ${timeStr} has been cancelled. To rebook, reply RESCHEDULE or call us anytime. - ${state.businessName}`,
        action: 'cancelled',
        result: `Cancelled appointment ${state.upcomingAppointment.id}`,
        complete: true,
      };
    }
    return {
      responseMessage: `We don't see any upcoming appointments to cancel. Call us if you need help. - ${state.businessName}`,
      action: 'cancel_no_appointment',
      result: 'No appointment to cancel',
      complete: true,
    };
  } catch (err) {
    return { error: (err as Error).message, complete: true };
  }
}

async function rescheduleNode(state: ReplyIntelligenceState): Promise<Partial<ReplyIntelligenceState>> {
  try {
    if (!state.upcomingAppointment) {
      const business = await storage.getBusiness(state.businessId);
      const bookingLink = business?.bookingSlug
        ? `${process.env.APP_URL || 'https://www.smallbizagent.ai'}/book/${business.bookingSlug}`
        : '';
      return {
        responseMessage: bookingLink
          ? `We don't see an upcoming appointment to reschedule. Book a new one here: ${bookingLink} - ${state.businessName}`
          : `We don't see an upcoming appointment to reschedule. Call us to book! - ${state.businessName}`,
        action: 'reschedule_no_appointment',
        result: 'No appointment to reschedule',
        complete: true,
      };
    }

    const business = await storage.getBusiness(state.businessId);
    const tz = business?.timezone || 'America/New_York';
    const oldDateStr = new Date(state.upcomingAppointment.startDate).toLocaleDateString('en-US', { timeZone: tz, weekday: 'long', month: 'long', day: 'numeric' });
    const oldTimeStr = new Date(state.upcomingAppointment.startDate).toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true });

    const requestedDate = state.entities?.requestedDate;
    const requestedTime = state.entities?.requestedTime;

    if (!requestedDate && !requestedTime) {
      // No specific date/time — ask for one
      return {
        responseMessage: `Sure! Your current appointment is ${oldDateStr} at ${oldTimeStr}. What day and time works better? - ${state.businessName}`,
        action: 'reschedule_awaiting_time',
        result: 'Asked customer for preferred time',
        complete: true,
      };
    }

    // ── Import scheduling utilities from callToolHandlers (provider-agnostic) ──
    const toolHandlers = await import('./callToolHandlers');
    const { parseNaturalDate, parseNaturalTime, createDateInTimezone, getAvailableSlotsForDay } = toolHandlers;

    // Parse the customer's requested date/time
    const parsedDate = requestedDate ? parseNaturalDate(requestedDate, tz) : new Date(state.upcomingAppointment.startDate);
    const parsedTime = requestedTime ? parseNaturalTime(requestedTime) : null;

    if (!parsedDate) {
      return {
        responseMessage: `I didn't catch the date. When would you like to reschedule to? - ${state.businessName}`,
        action: 'reschedule_parse_failed',
        result: 'Could not parse requested date',
        complete: true,
      };
    }

    // Calculate appointment duration from original
    const origStart = new Date(state.upcomingAppointment.startDate).getTime();
    const origEnd = new Date(state.upcomingAppointment.endDate || state.upcomingAppointment.startDate).getTime();
    const durationMinutes = origEnd > origStart ? Math.round((origEnd - origStart) / 60000) : 30;

    // Get business hours and existing appointments for that day
    const [businessHoursData, existingAppointments] = await Promise.all([
      storage.getBusinessHours(state.businessId),
      storage.getAppointmentsByBusinessId(state.businessId),
    ]);

    // Check availability for the requested day
    const slotsResult = await getAvailableSlotsForDay(
      state.businessId,
      parsedDate,
      businessHoursData,
      existingAppointments,
      durationMinutes,
      undefined, // staffHours — use business hours
      (business as any).bookingSlotIntervalMinutes || 30,
      tz,
    );

    if (slotsResult.isClosed) {
      // Business is closed that day — find next 2 available days
      const alternatives = await findNearestAlternatives(state.businessId, parsedDate, businessHoursData, existingAppointments, durationMinutes, tz, business);
      if (alternatives.length > 0) {
        const altText = alternatives.map(a => `${a.day} at ${a.slot}`).join(' or ');
        return {
          responseMessage: `We're closed ${slotsResult.dayName}. How about ${altText}? - ${state.businessName}`,
          action: 'reschedule_alternatives_offered',
          result: `Business closed ${slotsResult.dayName}, offered alternatives`,
          complete: true,
        };
      }
      return {
        responseMessage: `We're closed ${slotsResult.dayName}. What other day works for you? - ${state.businessName}`,
        action: 'reschedule_closed',
        result: `Business closed ${slotsResult.dayName}`,
        complete: true,
      };
    }

    if (parsedTime) {
      // Customer requested a specific time — check if it's available
      const [reqH, reqM] = parsedTime.split(':').map(Number);
      const requestedSlotLabel = new Date(2000, 0, 1, reqH, reqM).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

      // Check if this exact slot (or close to it) is in the available list
      const exactMatch = slotsResult.slots.find(s => s === requestedSlotLabel);
      // Also check ±30min
      const nearMatch = slotsResult.slots.find(s => {
        const [sh, sm] = parseSlotToHourMin(s);
        return Math.abs((sh * 60 + sm) - (reqH * 60 + reqM)) <= 30;
      });

      if (exactMatch || nearMatch) {
        const matchedSlot = exactMatch || nearMatch!;
        const [slotH, slotM] = parseSlotToHourMin(matchedSlot);

        // ── DIRECT DB UPDATE: Reschedule the appointment ──
        const yr = parsedDate.getFullYear();
        const mo = parsedDate.getMonth();
        const dy = parsedDate.getDate();
        const newStartUtc = createDateInTimezone(yr, mo, dy, slotH, slotM, tz);
        const newEndUtc = new Date(newStartUtc.getTime() + durationMinutes * 60000);

        await storage.updateAppointment(state.upcomingAppointment.id, {
          startDate: newStartUtc,
          endDate: newEndUtc,
          notes: `${state.upcomingAppointment.notes || ''}\n[Rescheduled via SMS on ${new Date().toLocaleDateString()} from ${oldDateStr} ${oldTimeStr}]`.trim(),
        });

        const newDateDisplay = newStartUtc.toLocaleDateString('en-US', { timeZone: tz, weekday: 'long', month: 'long', day: 'numeric' });
        const newTimeDisplay = newStartUtc.toLocaleTimeString('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true });

        // Activity feed: reschedule completed
        storage.createSmsActivityFeedEntry({
          businessId: state.businessId,
          eventType: 'reschedule_via_sms',
          customerName: state.customerName,
          customerId: state.customerId,
          appointmentId: state.upcomingAppointment.id,
          metadata: {
            oldDate: oldDateStr,
            oldTime: oldTimeStr,
            newDate: newDateDisplay,
            newTime: newTimeDisplay,
            aiHandled: true,
          },
        }).catch(() => {});

        // Mem0: record the reschedule
        if (state.customerId) {
          import('./mem0Service').then(({ addMemory }) => {
            addMemory(state.businessId, state.customerId!, [
              { role: 'assistant', content: `Rescheduled appointment from ${oldDateStr} ${oldTimeStr} to ${newDateDisplay} ${newTimeDisplay} via SMS.` },
            ]).catch(() => {});
          }).catch(() => {});
        }

        // Cancel pending triggers (customer is active again)
        if (state.customerId) {
          import('./marketingTriggerEngine').then(({ cancelTriggersOnEvent }) => {
            cancelTriggersOnEvent(state.businessId, state.customerId!, 'booked').catch(() => {});
          }).catch(() => {});
        }

        return {
          responseMessage: `Done! Moved you to ${newDateDisplay} at ${newTimeDisplay}. See you then! - ${state.businessName}`,
          action: 'rescheduled',
          result: `Rescheduled appointment ${state.upcomingAppointment.id} from ${oldDateStr} ${oldTimeStr} to ${newDateDisplay} ${newTimeDisplay}`,
          complete: true,
        };
      } else {
        // Requested time not available — offer 2 nearest alternatives
        const nearest = findNearestSlots(slotsResult.slots, reqH, reqM, 2);
        if (nearest.length > 0) {
          const dayDisplay = parsedDate.toLocaleDateString('en-US', { timeZone: tz, weekday: 'long' });
          const altText = nearest.join(' or ');
          return {
            responseMessage: `${requestedSlotLabel} on ${dayDisplay} is taken. I have ${altText} available. Which works? - ${state.businessName}`,
            action: 'reschedule_alternatives_offered',
            result: `Requested slot unavailable, offered ${nearest.length} alternatives`,
            complete: true,
          };
        }
        // No slots at all that day
        const alternatives = await findNearestAlternatives(state.businessId, parsedDate, businessHoursData, existingAppointments, durationMinutes, tz, business);
        if (alternatives.length > 0) {
          const altText = alternatives.map(a => `${a.day} at ${a.slot}`).join(' or ');
          return {
            responseMessage: `Nothing available that day. How about ${altText}? - ${state.businessName}`,
            action: 'reschedule_alternatives_offered',
            result: 'No slots that day, offered alternatives on nearby days',
            complete: true,
          };
        }
        return {
          responseMessage: `That day is fully booked. What other day works for you? - ${state.businessName}`,
          action: 'reschedule_fully_booked',
          result: 'No availability that day',
          complete: true,
        };
      }
    }

    // Customer gave a date but no time — show available slots for that day
    if (slotsResult.slots.length > 0) {
      const bestSlots = slotsResult.slots.slice(0, 4);
      const dayDisplay = parsedDate.toLocaleDateString('en-US', { timeZone: tz, weekday: 'long' });
      const slotsText = bestSlots.join(', ');
      return {
        responseMessage: `Here's what's open ${dayDisplay}: ${slotsText}. Which time works? - ${state.businessName}`,
        action: 'reschedule_slots_offered',
        result: `Offered ${bestSlots.length} slots for ${dayDisplay}`,
        complete: true,
      };
    }

    return {
      responseMessage: `That day is fully booked. What other day works? - ${state.businessName}`,
      action: 'reschedule_fully_booked',
      result: 'No availability that day',
      complete: true,
    };
  } catch (err) {
    // Fallback: send manage link if direct reschedule fails
    console.error('[ReplyGraph] rescheduleNode error, sending manage link:', err);
    try {
      const business = await storage.getBusiness(state.businessId);
      const manageToken = state.upcomingAppointment?.manageToken;
      const bookingSlug = business?.bookingSlug;
      if (manageToken && bookingSlug) {
        const manageUrl = `${process.env.APP_URL || 'https://www.smallbizagent.ai'}/book/${bookingSlug}/manage/${manageToken}`;
        return {
          responseMessage: `Let me help you reschedule — use this link: ${manageUrl} - ${state.businessName}`,
          action: 'reschedule_fallback_link',
          result: `Error in direct reschedule, sent manage link: ${(err as Error).message}`,
          complete: true,
        };
      }
    } catch {}
    return {
      responseMessage: `Something went wrong rescheduling. Please call us at ${(await storage.getBusiness(state.businessId))?.phone || 'our number'}. - ${state.businessName}`,
      action: 'reschedule_error',
      error: (err as Error).message,
      complete: true,
    };
  }
}

// ── Reschedule helpers ──

/** Parse a slot label like "2:30 PM" to [14, 30] */
function parseSlotToHourMin(slot: string): [number, number] {
  const match = slot.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return [0, 0];
  let h = parseInt(match[1]);
  const m = parseInt(match[2]);
  const ampm = match[3].toUpperCase();
  if (ampm === 'PM' && h < 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return [h, m];
}

/** Find the N nearest available slots to a requested time */
function findNearestSlots(availableSlots: string[], targetH: number, targetM: number, count: number): string[] {
  const targetMin = targetH * 60 + targetM;
  const sorted = availableSlots
    .map(slot => ({ slot, diff: Math.abs((parseSlotToHourMin(slot)[0] * 60 + parseSlotToHourMin(slot)[1]) - targetMin) }))
    .sort((a, b) => a.diff - b.diff);
  return sorted.slice(0, count).map(s => s.slot);
}

/** Find available slots on nearby days (checks next 5 business days) */
async function findNearestAlternatives(
  businessId: number, startDate: Date, businessHours: any[], appointments: any[],
  duration: number, tz: string, business: any,
): Promise<Array<{ day: string; slot: string }>> {
  const { getAvailableSlotsForDay } = await import('./callToolHandlers');
  const alternatives: Array<{ day: string; slot: string }> = [];
  const checkDate = new Date(startDate);
  const interval = (business as any).bookingSlotIntervalMinutes || 30;

  for (let i = 0; i < 7 && alternatives.length < 2; i++) {
    checkDate.setDate(checkDate.getDate() + 1);
    const result = await getAvailableSlotsForDay(businessId, checkDate, businessHours, appointments, duration, undefined, interval, tz);
    if (!result.isClosed && result.slots.length > 0) {
      // Pick a mid-day slot
      const midIdx = Math.floor(result.slots.length / 2);
      alternatives.push({ day: result.dayName, slot: result.slots[midIdx] });
    }
  }
  return alternatives;
}

async function infoNode(state: ReplyIntelligenceState): Promise<Partial<ReplyIntelligenceState>> {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return {
        responseMessage: `Thanks for your question! We'll get back to you shortly. - ${state.businessName}`,
        action: 'info_fallback',
        result: 'No OpenAI key — sent holding message',
        complete: true,
      };
    }

    const business = await storage.getBusiness(state.businessId);
    const knowledge = await storage.getBusinessKnowledge(state.businessId).catch(() => []);
    const knowledgeStr = knowledge.map((k: any) => `Q: ${k.question}\nA: ${k.answer}`).join('\n\n');

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await openai.chat.completions.create({
      model: 'gpt-5.4-mini',
      temperature: 0.5,
      max_completion_tokens: 100,
      messages: [
        { role: 'system', content: `You are the SMS assistant for ${state.businessName}. Answer this customer question briefly (< 120 chars). Use these knowledge base entries if relevant:\n\n${knowledgeStr}\n\nBusiness phone: ${business?.phone || 'our number'}. If you cannot answer, say you'll have someone follow up.` },
        { role: 'user', content: state.incomingMessage },
      ],
    });

    const answer = response.choices[0]?.message?.content?.trim() || `Thanks for your question! We'll follow up shortly. - ${state.businessName}`;

    return {
      responseMessage: answer,
      action: 'info_answered',
      result: 'Answered customer question via AI',
      complete: true,
    };
  } catch (err) {
    return {
      responseMessage: `Thanks for reaching out! We'll get back to you shortly. - ${state.businessName}`,
      action: 'info_error',
      result: (err as Error).message,
      complete: true,
    };
  }
}

async function campaignReplyNode(state: ReplyIntelligenceState): Promise<Partial<ReplyIntelligenceState>> {
  // Customer replied to a campaign message — log engagement
  if (state.customerId && state.activeCampaignId) {
    try {
      const existing = await storage.getCampaignAnalytics(state.activeCampaignId);
      await storage.upsertCampaignAnalytics(state.activeCampaignId, state.businessId, {
        replyCount: (existing?.replyCount || 0) + 1,
      });
    } catch {}
  }

  // Store memory
  if (state.customerId) {
    import('./mem0Service').then(({ addMemory }) => {
      addMemory(state.businessId, state.customerId!, [
        { role: 'user', content: `Customer replied to campaign: "${state.incomingMessage}"` },
      ]).catch(() => {});
    }).catch(() => {});
  }

  return {
    responseMessage: `Thanks for getting back to us! We appreciate you. - ${state.businessName}`,
    action: 'campaign_reply_logged',
    result: 'Campaign reply logged',
    complete: true,
  };
}

async function escalationNode(state: ReplyIntelligenceState): Promise<Partial<ReplyIntelligenceState>> {
  // Send holding message, notify business owner
  try {
    const business = await storage.getBusiness(state.businessId);
    const signOff = business?.name || state.businessName;

    // Create activity feed entry for business owner
    storage.createSmsActivityFeedEntry({
      businessId: state.businessId,
      eventType: 'escalation_needed',
      customerName: state.customerName,
      customerId: state.customerId,
      metadata: {
        message: state.incomingMessage,
        intent: state.intent,
        confidence: state.confidence,
        reason: state.confidence < 0.6 ? 'low_confidence' : state.intent,
      },
    }).catch(() => {});

    // Log inbound message with escalated flag
    storage.createInboundMessage({
      businessId: state.businessId,
      customerId: state.customerId,
      customerPhone: state.customerPhone,
      body: state.incomingMessage,
      twilioSid: state.twilioMessageSid || null,
      intent: state.intent,
      confidence: state.confidence,
      action: 'escalated',
      handledBy: 'ai',
      escalated: true,
      campaignReply: !!state.activeCampaignId,
      campaignId: state.activeCampaignId,
    }).catch(() => {});

    // Cancel active campaign sequences for this customer while escalated
    if (state.customerId) {
      import('./marketingTriggerEngine').then(({ cancelTriggersOnEvent }) => {
        cancelTriggersOnEvent(state.businessId, state.customerId!, 'escalated').catch(() => {});
      }).catch(() => {});
    }

    return {
      responseMessage: `Thanks for reaching out — we got your message and will follow up shortly. - ${signOff}`,
      action: 'escalated',
      result: `Escalated: intent=${state.intent}, confidence=${state.confidence}`,
      complete: true,
    };
  } catch (err) {
    return {
      responseMessage: `Thanks for your message! We'll get back to you soon. - ${state.businessName}`,
      action: 'escalation_error',
      error: (err as Error).message,
      complete: true,
    };
  }
}

async function logResultNode(state: ReplyIntelligenceState): Promise<Partial<ReplyIntelligenceState>> {
  try {
    // Log inbound message (if not already logged by escalation)
    if (state.action !== 'escalated') {
      storage.createInboundMessage({
        businessId: state.businessId,
        customerId: state.customerId,
        customerPhone: state.customerPhone,
        body: state.incomingMessage,
        twilioSid: state.twilioMessageSid || null,
        intent: state.intent,
        confidence: state.confidence,
        action: state.action,
        handledBy: 'ai',
        escalated: false,
        campaignReply: !!state.activeCampaignId,
        campaignId: state.activeCampaignId,
      }).catch(() => {});
    }

    // Update conversation state
    if (state.customerId) {
      storage.upsertConversationState(state.businessId, state.customerId, {
        lastReplyReceivedAt: new Date(),
        lastReplyBody: state.incomingMessage,
        currentState: state.action === 'escalated' ? 'escalated' : 'idle',
        awaitingResponse: false,
      }).catch(() => {});
    }

    // Store to Mem0
    if (state.customerId) {
      import('./mem0Service').then(({ addMemory }) => {
        addMemory(state.businessId, state.customerId!, [
          { role: 'user', content: `Customer SMS: "${state.incomingMessage}"` },
          { role: 'assistant', content: `AI action: ${state.action}. Response: "${state.responseMessage.substring(0, 80)}"` },
        ]).catch(() => {});
      }).catch(() => {});
    }

    console.log(`[ReplyGraph] ${state.action} for business ${state.businessId}, customer ${state.customerId}: "${state.incomingMessage.substring(0, 50)}"`);
  } catch (err) {
    console.error('[ReplyGraph] logResult error:', err);
  }

  return { complete: true };
}

export default { initReplyIntelligenceGraph, isReplyGraphReady, invokeReplyGraph };
