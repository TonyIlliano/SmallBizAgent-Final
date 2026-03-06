import { storage } from '../storage';
import { sendSms } from './twilioService';
import { isAgentEnabled, getAgentConfig, fillTemplate } from './agentSettingsService';
import { logAgentAction } from './agentActivityService';
import type { SmsConversation, Customer } from '@shared/schema';

export async function runNoShowDetection(): Promise<void> {
  console.log('[NoShowAgent] Running no-show detection...');

  try {
    const businesses = await storage.getAllBusinesses();

    for (const business of businesses) {
      try {
        const enabled = await isAgentEnabled(business.id, 'no_show');
        if (!enabled) continue;

        await detectNoShows(business.id);
        await new Promise(r => setTimeout(r, 1000));
      } catch (err) {
        console.error(`[NoShowAgent] Error processing business ${business.id}:`, err);
      }
    }

    // Also process expired conversations
    await processExpiredConversations();

    console.log('[NoShowAgent] No-show detection complete.');
  } catch (err) {
    console.error('[NoShowAgent] Error in main loop:', err);
  }
}

async function detectNoShows(businessId: number): Promise<void> {
  const config = await getAgentConfig(businessId, 'no_show');
  const business = await storage.getBusiness(businessId);
  if (!business) return;

  const checkDelayMinutes = config.checkDelayMinutes ?? 60;
  const expirationHours = config.expirationHours ?? 24;

  // Get appointments that should have started but are still "scheduled"
  const cutoffTime = new Date(Date.now() - checkDelayMinutes * 60 * 1000);
  const appointments = await storage.getAppointments(businessId);

  for (const appt of appointments) {
    try {
      // Only consider "scheduled" appointments that are past their start time
      if (appt.status !== 'scheduled') continue;
      if (!appt.startDate || new Date(appt.startDate) > cutoffTime) continue;
      if (!appt.customerId) continue;

      const customer = await storage.getCustomer(appt.customerId);
      if (!customer?.phone || !customer.smsOptIn) continue;

      // Check if we already have a conversation for this appointment
      const existingConvs = await storage.getAgentActivityLogs(businessId, { agentType: 'no_show' });
      const alreadySent = existingConvs.some(
        (log) => log.referenceType === 'appointment' && log.referenceId === appt.id && log.action === 'sms_sent'
      );
      if (alreadySent) continue;

      // Mark appointment as no_show
      await storage.updateAppointment(appt.id, { status: 'no_show' as any });

      // Format appointment time
      const apptTime = new Date(appt.startDate).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });

      const message = fillTemplate(config.messageTemplate, {
        customerName: customer.firstName || 'there',
        appointmentTime: apptTime,
        businessName: business.name,
        businessPhone: business.phone || '',
        bookingLink: business.bookingSlug ? `https://smallbizagent.ai/book/${business.bookingSlug}` : '',
      });

      await sendSms(customer.phone, message);

      // Create conversation for reply tracking
      const expiresAt = new Date(Date.now() + expirationHours * 60 * 60 * 1000);
      await storage.createSmsConversation({
        businessId,
        customerId: customer.id,
        customerPhone: customer.phone,
        agentType: 'no_show',
        referenceType: 'appointment',
        referenceId: appt.id,
        state: 'awaiting_reply',
        context: { expectedReplies: ['YES', 'NO'] },
        lastMessageSentAt: new Date(),
        expiresAt,
      });

      await logAgentAction({
        businessId,
        agentType: 'no_show',
        action: 'sms_sent',
        customerId: customer.id,
        referenceType: 'appointment',
        referenceId: appt.id,
        details: { message, appointmentTime: apptTime },
      });

      console.log(`[NoShowAgent] Sent no-show SMS for appointment ${appt.id}`);
      await new Promise(r => setTimeout(r, 500));
    } catch (err) {
      console.error(`[NoShowAgent] Error processing appointment ${appt.id}:`, err);
    }
  }
}

export async function handleNoShowReply(
  conversation: SmsConversation,
  messageBody: string,
  customer: Customer | undefined,
  businessId: number,
): Promise<{ replyMessage: string } | null> {
  const config = await getAgentConfig(businessId, 'no_show');
  const business = await storage.getBusiness(businessId);
  if (!business) return null;

  const normalized = messageBody.trim().toUpperCase();
  const positiveWords = ['YES', 'YEAH', 'YEP', 'SURE', 'RESCHEDULE', 'OK', 'OKAY', 'Y', 'PLEASE'];
  const negativeWords = ['NO', 'NOPE', 'NAH', 'NEVERMIND', 'NEVER', 'N', 'CANCEL'];

  const isPositive = positiveWords.some(w => normalized.includes(w));
  const isNegative = negativeWords.some(w => normalized.includes(w));

  const templateVars: Record<string, string> = {
    customerName: customer?.firstName || 'there',
    businessName: business.name,
    businessPhone: business.phone || '',
    bookingLink: business.bookingSlug ? `https://smallbizagent.ai/book/${business.bookingSlug}` : '',
  };

  if (isPositive && !isNegative) {
    // Try conversational booking flow (parse dates, check availability, book via SMS)
    try {
      const { canStartConversationalBooking, initializeBookingConversation } = await import('./conversationalBookingService');
      if (await canStartConversationalBooking(businessId)) {
        return initializeBookingConversation(conversation, customer, businessId, {
          originalAppointmentId: conversation.referenceId ?? undefined,
        });
      }
    } catch (err) {
      console.error('[NoShowAgent] Conversational booking unavailable, falling back to link:', err);
    }
    // Fallback: send booking link (original behavior)
    await storage.updateSmsConversation(conversation.id, { state: 'resolved' });
    const reply = fillTemplate(config.rescheduleReplyTemplate, templateVars);
    return { replyMessage: reply };
  }

  if (isNegative && !isPositive) {
    await storage.updateSmsConversation(conversation.id, { state: 'resolved' });
    const reply = fillTemplate(config.declineReplyTemplate, templateVars);
    return { replyMessage: reply };
  }

  // Ambiguous reply
  return { replyMessage: `Would you like to reschedule your appointment with ${business.name}? Reply YES or NO.` };
}

export async function processExpiredConversations(): Promise<void> {
  try {
    const expired = await storage.getExpiredConversations();
    for (const conv of expired) {
      await storage.updateSmsConversation(conv.id, { state: 'expired' });
      await logAgentAction({
        businessId: conv.businessId,
        agentType: conv.agentType,
        action: 'status_changed',
        customerId: conv.customerId ?? undefined,
        referenceType: conv.referenceType ?? undefined,
        referenceId: conv.referenceId ?? undefined,
        details: { newState: 'expired', reason: 'no_reply_within_timeout' },
      });
    }
    if (expired.length > 0) {
      console.log(`[NoShowAgent] Expired ${expired.length} conversations`);
    }
  } catch (err) {
    console.error('[NoShowAgent] Error processing expired conversations:', err);
  }
}

export default { runNoShowDetection, handleNoShowReply, processExpiredConversations };
