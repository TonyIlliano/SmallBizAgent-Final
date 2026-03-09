import { storage } from '../storage';
import { sendSms } from './twilioService';
import { isAgentEnabled, getAgentConfig, fillTemplate } from './agentSettingsService';
import { logAgentAction } from './agentActivityService';
import type { SmsConversation, Customer } from '@shared/schema';

export async function runRebookingCheck(): Promise<void> {
  console.log('[RebookingAgent] Running rebooking check...');

  try {
    const businesses = await storage.getAllBusinesses();

    for (const business of businesses) {
      try {
        const enabled = await isAgentEnabled(business.id, 'rebooking');
        if (!enabled) continue;

        await checkRebookingCandidates(business.id);
        await new Promise(r => setTimeout(r, 1000));
      } catch (err) {
        console.error(`[RebookingAgent] Error processing business ${business.id}:`, err);
      }
    }

    console.log('[RebookingAgent] Rebooking check complete.');
  } catch (err) {
    console.error('[RebookingAgent] Error in main loop:', err);
  }
}

async function checkRebookingCandidates(businessId: number): Promise<void> {
  const config = await getAgentConfig(businessId, 'rebooking');
  const business = await storage.getBusiness(businessId);
  if (!business) return;

  const defaultInterval = config.defaultIntervalDays ?? 42;

  // Use the existing getInactiveCustomers-style query
  // Find customers whose last activity was around the rebooking interval ago
  const customers = await storage.getCustomers(businessId);

  for (const customer of customers) {
    try {
      if (!customer.phone || !customer.smsOptIn) continue;

      // Find their last completed job or appointment
      const jobs = await storage.getJobs(businessId);
      const customerJobs = jobs.filter(j => j.customerId === customer.id && j.status === 'completed');
      const appointments = await storage.getAppointments(businessId);
      const customerAppts = appointments.filter(a => a.customerId === customer.id && a.status === 'completed');

      // Find most recent activity
      let lastActivityDate: Date | null = null;
      let lastServiceName = 'visit';

      for (const job of customerJobs) {
        const jobDate = job.updatedAt ? new Date(job.updatedAt) : (job.createdAt ? new Date(job.createdAt) : null);
        if (jobDate && (!lastActivityDate || jobDate > lastActivityDate)) {
          lastActivityDate = jobDate;
          lastServiceName = job.title || 'service';
        }
      }
      for (const appt of customerAppts) {
        const apptDate = appt.updatedAt ? new Date(appt.updatedAt) : (appt.createdAt ? new Date(appt.createdAt) : null);
        if (apptDate && (!lastActivityDate || apptDate > lastActivityDate)) {
          lastActivityDate = apptDate;
        }
      }

      if (!lastActivityDate) continue;

      const daysSinceVisit = Math.floor((Date.now() - lastActivityDate.getTime()) / (1000 * 60 * 60 * 24));

      // Check if within the rebooking window (interval ± 3 days to avoid repeat sends)
      const serviceIntervals = config.serviceIntervals ?? {};
      const interval = serviceIntervals[lastServiceName] ?? defaultInterval;

      if (daysSinceVisit < interval || daysSinceVisit > interval + 3) continue;

      // Check dedup: have we already sent a rebooking SMS to this customer recently?
      const recentLogs = await storage.getAgentActivityLogs(businessId, { agentType: 'rebooking', limit: 200 });
      const alreadySent = recentLogs.some(log => {
        if (log.customerId !== customer.id || log.action !== 'sms_sent') return false;
        const logAge = Date.now() - new Date(log.createdAt!).getTime();
        return logAge < interval * 24 * 60 * 60 * 1000; // Don't re-send within the interval
      });
      if (alreadySent) continue;

      // Check no active conversation already exists
      const activeConv = await storage.getActiveSmsConversation(customer.phone, businessId);
      if (activeConv) continue;

      const message = fillTemplate(config.messageTemplate, {
        customerName: customer.firstName || 'there',
        businessName: business.name,
        businessPhone: business.phone || '',
        bookingLink: business.bookingSlug ? `https://smallbizagent.ai/book/${business.bookingSlug}` : '',
        daysSinceVisit: String(daysSinceVisit),
        serviceName: lastServiceName,
      });

      await sendSms(customer.phone, message, undefined, businessId);

      // Create conversation for reply tracking
      await storage.createSmsConversation({
        businessId,
        customerId: customer.id,
        customerPhone: customer.phone,
        agentType: 'rebooking',
        referenceType: 'customer',
        referenceId: customer.id,
        state: 'awaiting_reply',
        context: { expectedReplies: ['YES', 'NO'], daysSinceVisit, serviceName: lastServiceName },
        lastMessageSentAt: new Date(),
        expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000), // 48h expiry
      });

      await logAgentAction({
        businessId,
        agentType: 'rebooking',
        action: 'sms_sent',
        customerId: customer.id,
        referenceType: 'customer',
        referenceId: customer.id,
        details: { message, daysSinceVisit, serviceName: lastServiceName },
      });

      console.log(`[RebookingAgent] Sent rebooking SMS to customer ${customer.id} (${daysSinceVisit} days)`);
      await new Promise(r => setTimeout(r, 500));
    } catch (err) {
      console.error(`[RebookingAgent] Error processing customer ${customer.id}:`, err);
    }
  }
}

export async function handleRebookingReply(
  conversation: SmsConversation,
  messageBody: string,
  customer: Customer | undefined,
  businessId: number,
): Promise<{ replyMessage: string } | null> {
  const config = await getAgentConfig(businessId, 'rebooking');
  const business = await storage.getBusiness(businessId);
  if (!business) return null;

  const normalized = messageBody.trim().toUpperCase();
  const positiveWords = ['YES', 'YEAH', 'YEP', 'SURE', 'BOOK', 'OK', 'OKAY', 'Y', 'PLEASE'];
  const negativeWords = ['NO', 'NOPE', 'NAH', 'NOT', 'N', 'LATER', 'STOP'];

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
        return initializeBookingConversation(conversation, customer, businessId);
      }
    } catch (err) {
      console.error('[RebookingAgent] Conversational booking unavailable, falling back to link:', err);
    }
    // Fallback: send booking link (original behavior)
    await storage.updateSmsConversation(conversation.id, { state: 'resolved' });
    const reply = fillTemplate(config.bookingReplyTemplate, templateVars);
    return { replyMessage: reply };
  }

  if (isNegative && !isPositive) {
    await storage.updateSmsConversation(conversation.id, { state: 'resolved' });
    const reply = fillTemplate(config.declineReplyTemplate, templateVars);
    return { replyMessage: reply };
  }

  return { replyMessage: `Would you like to book your next visit with ${business.name}? Reply YES or NO.` };
}

export default { runRebookingCheck, handleRebookingReply };
