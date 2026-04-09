import type { SmsConversation, Customer } from '@shared/schema';
import { storage } from '../storage';
import { logAgentAction } from './agentActivityService';
import { isStopRequest } from './smsReplyParser';
import { logAndSwallow } from '../utils/safeAsync';
import { claudeJson } from './claudeClient';

type ConversationHandler = (
  conversation: SmsConversation,
  messageBody: string,
  customer: Customer | undefined,
  businessId: number,
) => Promise<{ replyMessage: string } | null>;

const handlers: Record<string, () => Promise<{ handler: ConversationHandler }>> = {
  no_show: () => import('./noShowAgentService').then(m => ({ handler: m.handleNoShowReply })),
  rebooking: () => import('./rebookingAgentService').then(m => ({ handler: m.handleRebookingReply })),
  disambiguation: () => Promise.resolve({ handler: handleDisambiguationReply }),
  reschedule: () => Promise.resolve({ handler: handleRescheduleReply }),
  marketing_opt_in: () => Promise.resolve({ handler: handleMarketingOptInReply }),
  birthday_collection: () => Promise.resolve({ handler: handleBirthdayCollectionReply }),
};

export async function routeConversationReply(
  conversation: SmsConversation,
  messageBody: string,
  customer: Customer | undefined,
  businessId: number,
): Promise<{ replyMessage: string } | null> {
  // ── STOP/Unsubscribe handling (TCPA compliance) ──
  // Intercept STOP requests before routing to any agent.
  // STOP opts out of MARKETING only — transactional (reminders, confirmations) still go through.
  if (isStopRequest(messageBody)) {
    await storage.updateSmsConversation(conversation.id, { state: 'resolved' });
    if (customer?.id) {
      try { await storage.updateCustomer(customer.id, { marketingOptIn: false }); } catch (err) { console.error('[SMSRouter] Error:', err instanceof Error ? err.message : err); }
      // Release engagement lock
      import('./orchestrationService').then(mod => {
        mod.dispatchEvent('conversation.resolved', { businessId, customerId: customer!.id }).catch(logAndSwallow('SMSRouter'));
      }).catch(logAndSwallow('SMSRouter'));
    }
    await logAgentAction({
      businessId,
      agentType: conversation.agentType,
      action: 'customer_opted_out',
      customerId: customer?.id,
      referenceType: conversation.referenceType ?? undefined,
      referenceId: conversation.referenceId ?? undefined,
      details: { incomingMessage: messageBody },
    });
    const business = await storage.getBusiness(businessId);
    const businessName = business?.name || 'us';
    return { replyMessage: `You've been unsubscribed from ${businessName} promotional messages. You'll still receive appointment reminders & confirmations. Reply START to re-subscribe.` };
  }

  // Route conversations in active booking flow to the conversational booking handler
  const bookingStates = ['collecting_preferences', 'offering_slots', 'confirming_booking'];
  if (bookingStates.includes(conversation.state)) {
    try {
      const { handleBookingConversation } = await import('./conversationalBookingService');
      const result = await handleBookingConversation(conversation, messageBody, customer, businessId);
      if (result) {
        await logAgentAction({
          businessId,
          agentType: conversation.agentType,
          action: 'booking_reply_received',
          customerId: customer?.id,
          referenceType: conversation.referenceType ?? undefined,
          referenceId: conversation.referenceId ?? undefined,
          details: { incomingMessage: messageBody, replyMessage: result.replyMessage, state: conversation.state },
        });
        await storage.updateSmsConversation(conversation.id, {
          lastReplyReceivedAt: new Date(),
        });
        // Check if conversation was resolved and release engagement lock if so
        // (catches any paths in conversationalBookingService that resolved without releasing)
        try {
          const updatedConv = await storage.getActiveSmsConversation(conversation.customerPhone, businessId);
          // If no active conversation found, the handler resolved it — release the lock
          if (!updatedConv && customer?.id) {
            import('./orchestrationService').then(mod => {
              mod.dispatchEvent('conversation.resolved', { businessId, customerId: customer!.id }).catch(logAndSwallow('SMSRouter'));
            }).catch(logAndSwallow('SMSRouter'));
          }
        } catch (err) { console.error('[SMSRouter] Error:', err instanceof Error ? err.message : err); }
      }
      return result;
    } catch (err) {
      console.error('[SMSRouter] Error in conversational booking handler:', err);
      return null;
    }
  }

  const loader = handlers[conversation.agentType];
  if (!loader) {
    console.log(`[SMSRouter] No handler for agent type: ${conversation.agentType}`);
    return null;
  }

  try {
    const { handler } = await loader();
    const result = await handler(conversation, messageBody, customer, businessId);

    if (result) {
      // Log the reply received
      await logAgentAction({
        businessId,
        agentType: conversation.agentType,
        action: 'reply_received',
        customerId: customer?.id,
        referenceType: conversation.referenceType ?? undefined,
        referenceId: conversation.referenceId ?? undefined,
        details: { incomingMessage: messageBody, replyMessage: result.replyMessage },
      });

      // Update conversation with reply timestamp
      await storage.updateSmsConversation(conversation.id, {
        lastReplyReceivedAt: new Date(),
      });
    }

    return result;
  } catch (err) {
    console.error(`[SMSRouter] Error handling reply for ${conversation.agentType}:`, err);
    return null;
  }
}

// ─── Disambiguation Handler ──────────────────────────────────────────────────
// Handles multi-appointment selection when customer has 2+ upcoming appointments
// and texted CONFIRM, C (cancel), or RESCHEDULE.
// Context shape: { action: 'confirm' | 'cancel' | 'reschedule', appointments: [...] }

async function handleDisambiguationReply(
  conversation: SmsConversation,
  messageBody: string,
  customer: Customer | undefined,
  businessId: number,
): Promise<{ replyMessage: string } | null> {
  const context = conversation.context as any;
  if (!context?.action || !context?.appointments?.length) {
    await storage.updateSmsConversation(conversation.id, { state: 'resolved' });
    return { replyMessage: `Something went wrong. Please try again or call us.` };
  }

  const trimmed = messageBody.trim();
  const selection = parseInt(trimmed, 10);

  if (isNaN(selection) || selection < 1 || selection > context.appointments.length) {
    return {
      replyMessage: `Please reply with a number (1-${context.appointments.length}) to select your appointment.`,
    };
  }

  const selectedApt = context.appointments[selection - 1];
  const business = await storage.getBusiness(businessId);
  const businessName = business?.name || '';

  if (context.action === 'confirm') {
    await storage.updateAppointment(selectedApt.id, { status: 'confirmed' });
    await storage.updateSmsConversation(conversation.id, { state: 'resolved' });
    console.log(`[SMS] Disambiguation: confirmed appointment ${selectedApt.id} for customer ${customer?.id}`);
    return {
      replyMessage: `Your ${selectedApt.serviceName} on ${selectedApt.dateStr} at ${selectedApt.timeStr} is confirmed! See you then. - ${businessName}`,
    };
  }

  if (context.action === 'cancel') {
    await storage.updateAppointment(selectedApt.id, {
      status: 'cancelled',
      notes: `[Cancelled via SMS on ${new Date().toLocaleDateString()}]`,
    });
    // Dispatch cancellation event for insights recalculation
    if (customer?.id) {
      import('./orchestrationService').then(mod => {
        mod.dispatchEvent('appointment.cancelled', {
          businessId,
          customerId: customer!.id,
          referenceType: 'appointment',
          referenceId: selectedApt.id,
        }).catch(logAndSwallow('SMSRouter'));
      }).catch(logAndSwallow('SMSRouter'));
    }
    await storage.updateSmsConversation(conversation.id, { state: 'resolved' });
    console.log(`[SMS] Disambiguation: cancelled appointment ${selectedApt.id} for customer ${customer?.id}`);
    return {
      replyMessage: `Your ${selectedApt.serviceName} on ${selectedApt.dateStr} at ${selectedApt.timeStr} has been cancelled. To rebook, reply RESCHEDULE or call ${business?.twilioPhoneNumber || business?.phone || 'us'}. - ${businessName}`,
    };
  }

  if (context.action === 'reschedule') {
    // Resolve disambiguation and create a new reschedule conversation for the selected appointment
    await storage.updateSmsConversation(conversation.id, { state: 'resolved' });

    await storage.createSmsConversation({
      businessId,
      customerId: customer?.id ?? null,
      customerPhone: conversation.customerPhone,
      agentType: 'reschedule',
      referenceType: 'appointment',
      referenceId: selectedApt.id,
      state: 'reschedule_awaiting',
      context: {
        appointmentId: selectedApt.id,
        oldDate: selectedApt.dateStr,
        oldTime: selectedApt.timeStr,
        serviceName: selectedApt.serviceName,
      },
      lastMessageSentAt: new Date(),
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    });

    console.log(`[SMS] Disambiguation: selected appointment ${selectedApt.id} for reschedule, created reschedule conversation`);
    return {
      replyMessage: `Sure! Your ${selectedApt.serviceName} is on ${selectedApt.dateStr} at ${selectedApt.timeStr}. What day and time works better for you? - ${businessName}`,
    };
  }

  await storage.updateSmsConversation(conversation.id, { state: 'resolved' });
  return { replyMessage: `Something went wrong. Please try again or call us. - ${businessName}` };
}

// ─── Reschedule Handler ──────────────────────────────────────────────────────
// Uses Claude to parse the customer's date/time intent from freeform text.
// Falls back to a manage link if parsing fails or no availability.

async function handleRescheduleReply(
  conversation: SmsConversation,
  messageBody: string,
  customer: Customer | undefined,
  businessId: number,
): Promise<{ replyMessage: string } | null> {
  const business = await storage.getBusiness(businessId);
  const context = conversation.context as any;
  const appUrl = process.env.APP_URL || 'https://www.smallbizagent.ai';
  const businessName = business?.name || '';

  // Try Claude-powered intent classification for the customer's message
  try {
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    const parsed = await claudeJson<{
      intent: 'reschedule' | 'cancel' | 'question' | 'unclear';
      date?: string;
      time?: string;
      timeOfDay?: 'morning' | 'afternoon' | 'evening';
    }>({
      system: `You are parsing a customer's SMS reply about rescheduling an appointment. Today is ${today}. The customer's current appointment: ${context?.serviceName || 'appointment'} on ${context?.oldDate || 'unknown'} at ${context?.oldTime || 'unknown'}.

Extract the customer's intent and any date/time they mention.

Return JSON with:
- intent: "reschedule" if they provide a date/time or preference, "cancel" if they want to cancel, "question" if asking something, "unclear" if can't determine
- date: ISO date string (YYYY-MM-DD) if a specific date is mentioned or can be inferred (e.g. "Thursday" = next Thursday), or null
- time: 24h time string (HH:MM) if a specific time is mentioned, or null
- timeOfDay: "morning", "afternoon", or "evening" if only a general preference is given, or null

Return valid JSON only, no markdown.`,
      prompt: `Customer message: "${messageBody}"`,
      maxTokens: 256,
    });

    if (parsed.intent === 'reschedule' && parsed.date) {
      // Try to check availability for the requested date using callToolHandlers
      try {
        const { getAvailableSlotsForDay } = await import('./callToolHandlers');
        const businessHours = await storage.getBusinessHours(businessId);
        const dateObj = new Date(parsed.date + 'T12:00:00');
        const appointments = await storage.getAppointments(businessId);
        const apt = context?.appointmentId ? await storage.getAppointment(context.appointmentId) : null;
        const duration = apt ? Math.round((new Date(apt.endDate).getTime() - new Date(apt.startDate).getTime()) / 60000) : 60;
        const biz = business;
        const timezone = biz?.timezone || 'America/New_York';

        const result = await getAvailableSlotsForDay(businessId, dateObj, businessHours, appointments, duration, undefined, 30, timezone);

        if (result.slots && result.slots.length > 0) {
          // If they specified a time, check if it's available
          if (parsed.time) {
            const requestedSlot = result.slots.find((s: string) => s.startsWith(parsed.time!.substring(0, 5)));
            if (requestedSlot && context?.appointmentId) {
              // Slot available — update the appointment
              const newStart = new Date(`${parsed.date}T${parsed.time}:00`);
              const newEnd = new Date(newStart.getTime() + duration * 60 * 1000);

              await storage.updateAppointment(context.appointmentId, {
                startDate: newStart,
                endDate: newEnd,
                status: 'confirmed',
              });
              await storage.updateSmsConversation(conversation.id, { state: 'resolved' });

              const dateStr = newStart.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
              const timeStr = newStart.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
              return {
                replyMessage: `You're all set! Your ${context?.serviceName || 'appointment'} has been moved to ${dateStr} at ${timeStr}. See you then! - ${businessName}`,
              };
            }
          }

          // No exact time match — offer top 3 available slots
          const topSlots = result.slots.slice(0, 3);
          const dateStr = new Date(parsed.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
          const slotList = topSlots.map((s: string, i: number) => `${i + 1}. ${s}`).join('\n');

          // Extend conversation expiry for multi-turn
          await storage.updateSmsConversation(conversation.id, {
            expiresAt: new Date(Date.now() + 15 * 60 * 1000),
            context: { ...context, offeredDate: parsed.date, offeredSlots: topSlots },
          });

          return {
            replyMessage: `Here's what's available on ${dateStr}:\n${slotList}\n\nReply with a number (1-${topSlots.length}) to confirm. - ${businessName}`,
          };
        } else {
          // No slots available on that date
          await storage.updateSmsConversation(conversation.id, {
            expiresAt: new Date(Date.now() + 15 * 60 * 1000),
          });
          return {
            replyMessage: `Sorry, we don't have availability on that date. Could you try a different day? - ${businessName}`,
          };
        }
      } catch (err) {
        console.error('[SMSRouter] Error checking availability:', err instanceof Error ? err.message : err);
        // Fall through to manage link
      }
    }

    if (parsed.intent === 'cancel') {
      if (context?.appointmentId) {
        await storage.updateAppointment(context.appointmentId, {
          status: 'cancelled',
          notes: `[Cancelled via SMS reschedule flow on ${new Date().toLocaleDateString()}]`,
        });
        await storage.updateSmsConversation(conversation.id, { state: 'resolved' });
        return {
          replyMessage: `Your ${context?.serviceName || 'appointment'} has been cancelled. To rebook, visit ${business?.bookingSlug ? `${appUrl}/book/${business.bookingSlug}` : 'our website'} or call us. - ${businessName}`,
        };
      }
    }
  } catch (err) {
    console.error('[SMSRouter] Claude intent parsing failed, falling back to manage link:', err instanceof Error ? err.message : err);
  }

  // Fallback: send manage link
  if (context?.appointmentId && business?.bookingSlug) {
    try {
      const apt = await storage.getAppointment(context.appointmentId);
      if (apt?.manageToken) {
        await storage.updateSmsConversation(conversation.id, { state: 'resolved' });
        return {
          replyMessage: `Here's a link to reschedule: ${appUrl}/book/${business.bookingSlug}/manage/${apt.manageToken} - ${businessName}`,
        };
      }
    } catch (err) { console.error('[SMSRouter] Error:', err instanceof Error ? err.message : err); }
  }

  // Final fallback
  await storage.updateSmsConversation(conversation.id, { state: 'resolved' });
  const bookLink = business?.bookingSlug ? `${appUrl}/book/${business.bookingSlug}` : '';
  return {
    replyMessage: bookLink
      ? `Reschedule here: ${bookLink} - ${businessName}`
      : `Please call us at ${business?.phone || 'our number'} to reschedule. - ${businessName}`,
  };
}

// ─── Marketing Opt-In Reply Handler ─────────────────────────────────────────

async function handleMarketingOptInReply(
  conversation: SmsConversation,
  messageBody: string,
  customer: Customer | undefined,
  businessId: number,
): Promise<{ replyMessage: string } | null> {
  const trimmed = messageBody.toUpperCase().trim();
  const business = await storage.getBusiness(businessId);
  const bizName = business?.name || 'us';

  if (trimmed === 'YES' || trimmed === 'Y' || trimmed === 'CONFIRM' || trimmed === 'YEAH' || trimmed === 'YEP' || trimmed === 'SURE') {
    if (customer?.id) {
      await storage.updateCustomer(customer.id, { marketingOptIn: true });
    }
    await storage.updateSmsConversation(conversation.id, { state: 'resolved' });
    if (customer?.id) {
      import('./orchestrationService').then(mod => {
        mod.dispatchEvent('conversation.resolved', { businessId, customerId: customer!.id }).catch(logAndSwallow('SMSRouter'));
      }).catch(logAndSwallow('SMSRouter'));
    }
    return {
      replyMessage: `Awesome! You'll get exclusive deals and updates from ${bizName}. Reply STOP anytime to opt out.`,
    };
  }

  if (trimmed === 'NO' || trimmed === 'N' || trimmed === 'NOPE' || trimmed === 'NAH') {
    await storage.updateSmsConversation(conversation.id, { state: 'resolved' });
    return {
      replyMessage: `No problem! You'll still get appointment reminders and confirmations. - ${bizName}`,
    };
  }

  // Unclear — ask once more
  return {
    replyMessage: `Want deals and updates from ${bizName}? Reply YES or NO.`,
  };
}

// ─── Birthday Collection Reply Handler ──────────────────────────────────────

const MONTH_MAP: Record<string, string> = {
  january: '01', jan: '01', february: '02', feb: '02', march: '03', mar: '03',
  april: '04', apr: '04', may: '05', june: '06', jun: '06',
  july: '07', jul: '07', august: '08', aug: '08', september: '09', sep: '09', sept: '09',
  october: '10', oct: '10', november: '11', nov: '11', december: '12', dec: '12',
};

function parseBirthdayFromText(text: string): string | null {
  const trimmed = text.trim().toLowerCase().replace(/[,]/g, '');

  // Strip "birthday" prefix if present (e.g., "BIRTHDAY 03-15")
  const cleaned = trimmed.replace(/^birthday\s+/i, '');

  // MM-DD or MM/DD format
  const numericMatch = cleaned.match(/^(\d{1,2})[\-\/](\d{1,2})$/);
  if (numericMatch) {
    const mm = numericMatch[1].padStart(2, '0');
    const dd = numericMatch[2].padStart(2, '0');
    if (parseInt(mm) >= 1 && parseInt(mm) <= 12 && parseInt(dd) >= 1 && parseInt(dd) <= 31) {
      return `${mm}-${dd}`;
    }
  }

  // "Month DD" or "Month DDth/st/nd/rd"
  const monthDayMatch = cleaned.match(/^([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?$/);
  if (monthDayMatch) {
    const mm = MONTH_MAP[monthDayMatch[1]];
    const dd = monthDayMatch[2].padStart(2, '0');
    if (mm && parseInt(dd) >= 1 && parseInt(dd) <= 31) {
      return `${mm}-${dd}`;
    }
  }

  // "DD Month" format
  const dayMonthMatch = cleaned.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)$/);
  if (dayMonthMatch) {
    const dd = dayMonthMatch[1].padStart(2, '0');
    const mm = MONTH_MAP[dayMonthMatch[2]];
    if (mm && parseInt(dd) >= 1 && parseInt(dd) <= 31) {
      return `${mm}-${dd}`;
    }
  }

  return null;
}

async function handleBirthdayCollectionReply(
  conversation: SmsConversation,
  messageBody: string,
  customer: Customer | undefined,
  businessId: number,
): Promise<{ replyMessage: string } | null> {
  const business = await storage.getBusiness(businessId);
  const bizName = business?.name || 'us';
  const context = (conversation.context || {}) as any;
  const attempts = context.attempts || 0;

  const parsed = parseBirthdayFromText(messageBody);

  if (parsed) {
    // Valid birthday — save it
    if (customer?.id) {
      await storage.updateCustomer(customer.id, { birthday: parsed });
    }
    await storage.updateSmsConversation(conversation.id, { state: 'resolved' });

    const [mm, dd] = parsed.split('-');
    const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const prettyDate = `${monthNames[parseInt(mm)]} ${parseInt(dd)}`;

    return {
      replyMessage: `Got it — ${prettyDate}! We'll have a special birthday treat waiting for you. 🎂 - ${bizName}`,
    };
  }

  // Invalid — retry logic
  if (attempts >= 1) {
    // Second failure — give up gracefully
    await storage.updateSmsConversation(conversation.id, { state: 'resolved' });
    return {
      replyMessage: `No worries! You can always text us BIRTHDAY MM-DD anytime (like BIRTHDAY 03-15). - ${bizName}`,
    };
  }

  // First failure — ask again
  await storage.updateSmsConversation(conversation.id, {
    context: { ...context, attempts: attempts + 1 },
  });
  return {
    replyMessage: `I didn't quite catch that. Please reply with your birthday like March 15 or 03-15.`,
  };
}

export default { routeConversationReply };
