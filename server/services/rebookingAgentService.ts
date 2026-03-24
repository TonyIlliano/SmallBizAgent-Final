import { storage } from '../storage';
import { sendSms } from './twilioService';
import { isAgentEnabled, getAgentConfig, fillTemplate } from './agentSettingsService';
import { logAgentAction } from './agentActivityService';
import { classifyReply } from './smsReplyParser';
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

  // Load data ONCE for the entire business (not per-customer!)
  // Previous version called getJobs() and getAppointments() inside the customer loop,
  // causing 1,500+ DB queries for a business with 500 customers.
  const customers = await storage.getCustomers(businessId);
  const allJobs = await storage.getJobs(businessId);
  const allAppointments = await storage.getAppointments(businessId);
  const recentLogs = await storage.getAgentActivityLogs(businessId, { agentType: 'rebooking', limit: 500 });

  // Pre-filter to completed only
  const completedJobs = allJobs.filter(j => j.status === 'completed');
  const completedAppts = allAppointments.filter(a => a.status === 'completed');

  // Pre-index sent SMS by customer ID for O(1) dedup lookup
  const sentByCustomerId = new Map<number, Date>();
  for (const log of recentLogs) {
    if (log.action !== 'sms_sent' || !log.customerId) continue;
    const logDate = new Date(log.createdAt!);
    const existing = sentByCustomerId.get(log.customerId);
    if (!existing || logDate > existing) {
      sentByCustomerId.set(log.customerId, logDate);
    }
  }

  // Pre-filter to only marketing-eligible customers (rebooking is a promotional message)
  const eligibleCustomers = customers.filter(c => c.phone && c.marketingOptIn);

  for (const customer of eligibleCustomers) {
    try {
      // Find their last completed job or appointment (using pre-loaded data)
      const customerJobs = completedJobs.filter(j => j.customerId === customer.id);
      const customerAppts = completedAppts.filter(a => a.customerId === customer.id);

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

      // Check dedup using pre-indexed sent logs (O(1) instead of O(n))
      const lastSentDate = sentByCustomerId.get(customer.id);
      if (lastSentDate) {
        const logAge = Date.now() - lastSentDate.getTime();
        if (logAge < interval * 24 * 60 * 60 * 1000) continue;
      }

      // Check no active conversation already exists
      const activeConv = await storage.getActiveSmsConversation(customer.phone!, businessId);
      if (activeConv) continue;

      // Re-check marketingOptIn right before sending (customer may have opted out during loop iteration)
      const freshCustomer = await storage.getCustomer(customer.id);
      if (!freshCustomer?.phone || !freshCustomer.marketingOptIn) {
        console.log(`[RebookingAgent] Skipping SMS — customer ${customer.id} has not opted into marketing (re-check)`);
        continue;
      }

      const templateVars = {
        customerName: customer.firstName || 'there',
        businessName: business.name,
        businessPhone: business.twilioPhoneNumber || business.phone || '',
        bookingLink: business.bookingSlug ? `${process.env.APP_URL || 'https://www.smallbizagent.ai'}/book/${business.bookingSlug}` : '',
        daysSinceVisit: String(daysSinceVisit),
        serviceName: lastServiceName,
      };

      // Route through Message Intelligence Service (AI generation with template fallback)
      const { generateMessage } = await import('./messageIntelligenceService');
      const misResult = await generateMessage({
        messageType: 'REBOOKING_NUDGE',
        businessId,
        customerId: customer.id,
        recipientPhone: customer.phone,
        useTemplate: false,
        context: { ...templateVars, triggerSource: 'agent' },
        fallbackTemplate: config.messageTemplate,
        fallbackVars: templateVars,
        isMarketing: true,
        appendOptOut: true,
      });
      const message = misResult.body || fillTemplate(config.messageTemplate, templateVars);

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
      // Also log to notification_log so business owners see it in Notification History
      await storage.createNotificationLog({
        businessId,
        customerId: customer.id,
        type: 'agent_rebooking',
        channel: 'sms',
        recipient: customer.phone,
        message,
        status: 'sent',
        referenceType: 'customer',
        referenceId: customer.id,
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
      try { await storage.updateCustomer(customer.id, { marketingOptIn: false }); } catch {}
    }
    return { replyMessage: `You've been unsubscribed from ${business.name} promotional messages. You'll still receive appointment reminders & confirmations. Reply START to re-subscribe.` };
  }

  if (intent === 'positive') {
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
    // Release engagement lock via orchestrator
    if (customer?.id) {
      import('./orchestrationService').then(mod => {
        mod.dispatchEvent('conversation.resolved', { businessId, customerId: customer!.id }).catch(() => {});
      }).catch(() => {});
    }
    const reply = fillTemplate(config.bookingReplyTemplate, templateVars);
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

  return { replyMessage: `Would you like to book your next visit with ${business.name}? Reply YES or NO.` };
}

export default { runRebookingCheck, handleRebookingReply };
