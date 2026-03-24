import type { SmsConversation, Customer } from '@shared/schema';
import { storage } from '../storage';
import { logAgentAction } from './agentActivityService';
import { isStopRequest } from './smsReplyParser';

type ConversationHandler = (
  conversation: SmsConversation,
  messageBody: string,
  customer: Customer | undefined,
  businessId: number,
) => Promise<{ replyMessage: string } | null>;

const handlers: Record<string, () => Promise<{ handler: ConversationHandler }>> = {
  no_show: () => import('./noShowAgentService').then(m => ({ handler: m.handleNoShowReply })),
  rebooking: () => import('./rebookingAgentService').then(m => ({ handler: m.handleRebookingReply })),
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
      try { await storage.updateCustomer(customer.id, { marketingOptIn: false }); } catch {}
      // Release engagement lock
      import('./orchestrationService').then(mod => {
        mod.dispatchEvent('conversation.resolved', { businessId, customerId: customer!.id }).catch(() => {});
      }).catch(() => {});
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
              mod.dispatchEvent('conversation.resolved', { businessId, customerId: customer!.id }).catch(() => {});
            }).catch(() => {});
          }
        } catch {}
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

export default { routeConversationReply };
