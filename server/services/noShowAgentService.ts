import { storage } from '../storage';
import { sendSms } from './twilioService';
import { isAgentEnabled, getAgentConfig, fillTemplate } from './agentSettingsService';
import { logAgentAction } from './agentActivityService';
import { classifyReply } from './smsReplyParser';
import type { SmsConversation, Customer } from '@shared/schema';

/**
 * Triggered when a staff member manually marks an appointment as "no_show".
 * Sends the customer an SMS offering to reschedule and opens a conversation.
 *
 * This replaces the old auto-detection approach which scanned all appointments
 * on a 30-minute timer. Manual triggering prevents false positives — only a
 * human who knows the customer didn't show up can fire this.
 */
export async function triggerNoShowSms(
  appointmentId: number,
  businessId: number,
): Promise<{ sent: boolean; reason?: string }> {
  try {
    const enabled = await isAgentEnabled(businessId, 'no_show');
    if (!enabled) {
      return { sent: false, reason: 'no_show agent is disabled' };
    }

    const config = await getAgentConfig(businessId, 'no_show');
    const business = await storage.getBusiness(businessId);
    if (!business) {
      return { sent: false, reason: 'business not found' };
    }

    const appointment = await storage.getAppointment(appointmentId);
    if (!appointment) {
      return { sent: false, reason: 'appointment not found' };
    }

    if (!appointment.customerId) {
      return { sent: false, reason: 'appointment has no customer' };
    }

    const customer = await storage.getCustomer(appointment.customerId);
    if (!customer?.phone) {
      return { sent: false, reason: 'customer has no phone number' };
    }
    if (!customer.smsOptIn) {
      return { sent: false, reason: 'customer has not opted into SMS' };
    }

    // Idempotency: don't send twice for the same appointment
    const existingLogs = await storage.getAgentActivityLogs(businessId, { agentType: 'no_show' });
    const alreadySent = existingLogs.some(
      (log) => log.referenceType === 'appointment' && log.referenceId === appointmentId && log.action === 'sms_sent'
    );
    if (alreadySent) {
      return { sent: false, reason: 'no-show SMS already sent for this appointment' };
    }

    // Format appointment time
    const apptTime = appointment.startDate
      ? new Date(appointment.startDate).toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        })
      : 'your appointment';

    const message = fillTemplate(config.messageTemplate, {
      customerName: customer.firstName || 'there',
      appointmentTime: apptTime,
      businessName: business.name,
      businessPhone: business.twilioPhoneNumber || business.phone || '',
      bookingLink: business.bookingSlug ? `${process.env.APP_URL || 'https://www.smallbizagent.ai'}/book/${business.bookingSlug}` : '',
    });

    await sendSms(customer.phone, message, undefined, businessId);

    // Create conversation for reply tracking
    const expirationHours = config.expirationHours ?? 24;
    const expiresAt = new Date(Date.now() + expirationHours * 60 * 60 * 1000);
    await storage.createSmsConversation({
      businessId,
      customerId: customer.id,
      customerPhone: customer.phone,
      agentType: 'no_show',
      referenceType: 'appointment',
      referenceId: appointmentId,
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
      referenceId: appointmentId,
      details: { message, appointmentTime: apptTime },
    });

    console.log(`[NoShowAgent] Sent no-show SMS for appointment ${appointmentId} (manual trigger)`);
    return { sent: true };
  } catch (err) {
    console.error(`[NoShowAgent] Error sending no-show SMS for appointment ${appointmentId}:`, err);
    return { sent: false, reason: 'unexpected error' };
  }
}

/**
 * @deprecated Use triggerNoShowSms() instead — called when staff marks appointment as no_show.
 * Kept temporarily for backward compatibility; the scheduler no longer calls this.
 */
export async function runNoShowDetection(): Promise<void> {
  console.log('[NoShowAgent] Auto-detection is disabled. No-show SMS is now triggered when staff marks an appointment as no_show.');
  // Only process expired conversations (cleanup)
  await processExpiredConversations();
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

  const intent = classifyReply(messageBody);

  const templateVars: Record<string, string> = {
    customerName: customer?.firstName || 'there',
    businessName: business.name,
    businessPhone: business.twilioPhoneNumber || business.phone || '',
    bookingLink: business.bookingSlug ? `${process.env.APP_URL || 'https://www.smallbizagent.ai'}/book/${business.bookingSlug}` : '',
  };

  // Handle STOP requests — opt the customer out immediately (TCPA)
  if (intent === 'stop') {
    await storage.updateSmsConversation(conversation.id, { state: 'resolved' });
    // Release engagement lock via orchestrator
    if (customer?.id) {
      import('./orchestrationService').then(mod => {
        mod.dispatchEvent('conversation.resolved', { businessId, customerId: customer!.id }).catch(() => {});
      }).catch(() => {});
      try { await storage.updateCustomer(customer.id, { smsOptIn: false }); } catch {}
    }
    return { replyMessage: `You've been unsubscribed from SMS messages. Reply START to re-subscribe. - ${business.name}` };
  }

  if (intent === 'positive') {
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
    // Release engagement lock via orchestrator
    if (customer?.id) {
      import('./orchestrationService').then(mod => {
        mod.dispatchEvent('conversation.resolved', { businessId, customerId: customer!.id }).catch(() => {});
      }).catch(() => {});
    }
    const reply = fillTemplate(config.rescheduleReplyTemplate, templateVars);
    return { replyMessage: reply };
  }

  if (intent === 'negative') {
    await storage.updateSmsConversation(conversation.id, { state: 'resolved' });
    // Release engagement lock via orchestrator
    if (customer?.id) {
      import('./orchestrationService').then(mod => {
        mod.dispatchEvent('conversation.resolved', { businessId, customerId: customer!.id }).catch(() => {});
      }).catch(() => {});
    }
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
      // Release engagement lock via orchestrator
      if (conv.customerId) {
        import('./orchestrationService').then(mod => {
          mod.dispatchEvent('conversation.resolved', { businessId: conv.businessId, customerId: conv.customerId! }).catch(() => {});
        }).catch(() => {});
      }
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

export default { triggerNoShowSms, runNoShowDetection, handleNoShowReply, processExpiredConversations };
