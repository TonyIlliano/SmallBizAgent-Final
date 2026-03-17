import { storage } from '../storage';
import { sendSms } from './twilioService';
import { isAgentEnabled, getAgentConfig, fillTemplate } from './agentSettingsService';
import { logAgentAction } from './agentActivityService';

/**
 * Follow-Up Agent Service
 *
 * Sends thank-you and upsell SMS after completed jobs/appointments.
 *
 * ARCHITECTURE NOTE: Previous version used setTimeout() which meant scheduled
 * sends were lost on server restart/deploy. This rewrite uses a scheduler-based
 * approach — a periodic check runs every 5 minutes and sends any messages
 * whose delay has elapsed since completion time. Messages are idempotent
 * (checked against agentActivityLog) so they'll never double-send.
 *
 * `triggerFollowUp()` is still called when an entity is completed, but now
 * it just logs a "follow_up_queued" action. The actual sending is done by
 * `runFollowUpCheck()` which is called by the scheduler.
 */

/**
 * Called when an appointment/job is marked completed.
 * Logs a "queued" entry so the scheduler knows to send follow-ups.
 */
export async function triggerFollowUp(
  entityType: 'job' | 'appointment',
  entityId: number,
  businessId: number,
): Promise<void> {
  try {
    const enabled = await isAgentEnabled(businessId, 'follow_up');
    if (!enabled) return;

    const business = await storage.getBusiness(businessId);
    if (!business) return;

    let customerId: number | null = null;

    if (entityType === 'job') {
      const job = await storage.getJob(entityId);
      if (!job || job.status !== 'completed') return;
      customerId = job.customerId;
    } else {
      const appointment = await storage.getAppointment(entityId);
      if (!appointment || appointment.status !== 'completed') return;
      customerId = appointment.customerId;
    }

    if (!customerId) return;

    const customer = await storage.getCustomer(customerId);
    if (!customer?.phone || !customer.marketingOptIn) return;

    // Check if we already queued follow-ups for this entity (idempotency)
    const existingLogs = await storage.getAgentActivityLogs(businessId, { agentType: 'follow_up' });
    const alreadyQueued = existingLogs.some(
      log => log.referenceType === entityType && log.referenceId === entityId &&
             (log.action === 'follow_up_queued' || log.action === 'sms_sent'),
    );
    if (alreadyQueued) return;

    // Log the queued event — the scheduler will pick this up
    await logAgentAction({
      businessId,
      agentType: 'follow_up',
      action: 'follow_up_queued',
      customerId: customer.id,
      referenceType: entityType,
      referenceId: entityId,
      details: { queuedAt: new Date().toISOString() },
    });

    console.log(`[FollowUpAgent] Queued follow-up for ${entityType} ${entityId}`);
  } catch (err) {
    console.error('[FollowUpAgent] Error queuing follow-up:', err);
  }
}

/**
 * Scheduler entry point — runs every 5 minutes.
 * Scans for queued follow-ups whose delay has elapsed and sends them.
 *
 * This survives server restarts because it checks the database state,
 * not in-memory timers.
 */
export async function runFollowUpCheck(): Promise<void> {
  try {
    const businesses = await storage.getAllBusinesses();

    for (const business of businesses) {
      try {
        const enabled = await isAgentEnabled(business.id, 'follow_up');
        if (!enabled) continue;

        await processBusinessFollowUps(business.id);
      } catch (err) {
        console.error(`[FollowUpAgent] Error processing business ${business.id}:`, err);
      }
    }
  } catch (err) {
    console.error('[FollowUpAgent] Error in scheduler check:', err);
  }
}

async function processBusinessFollowUps(businessId: number): Promise<void> {
  const config = await getAgentConfig(businessId, 'follow_up');
  const business = await storage.getBusiness(businessId);
  if (!business) return;

  const thankYouDelayMs = (config.thankYouDelayMinutes ?? 30) * 60 * 1000;
  const upsellDelayMs = (config.upsellDelayHours ?? 48) * 60 * 60 * 1000;

  // Get recent follow_up logs (queued + sent) — limit to last 7 days
  const allLogs = await storage.getAgentActivityLogs(businessId, { agentType: 'follow_up', limit: 500 });

  // Find queued items
  const queuedItems = allLogs.filter(log => log.action === 'follow_up_queued');

  for (const queued of queuedItems) {
    try {
      const queuedAt = new Date(queued.createdAt!).getTime();
      const now = Date.now();

      // Skip items older than 7 days (stale)
      if (now - queuedAt > 7 * 24 * 60 * 60 * 1000) continue;

      const entityType = queued.referenceType as 'job' | 'appointment';
      const entityId = queued.referenceId!;
      const customerId = queued.customerId!;

      // Check what's already been sent for this entity
      const sentLogs = allLogs.filter(
        log => log.action === 'sms_sent' &&
               log.referenceType === entityType &&
               log.referenceId === entityId,
      );
      const thankYouSent = sentLogs.some(log => (log.details as any)?.messageType === 'thank_you');
      const upsellSent = sentLogs.some(log => (log.details as any)?.messageType === 'upsell');

      // Send thank-you if enabled, not yet sent, and delay has elapsed
      if (config.enableThankYou && !thankYouSent && (now - queuedAt >= thankYouDelayMs)) {
        const customer = await storage.getCustomer(customerId);
        if (customer?.phone && customer.marketingOptIn) {
          const templateVars = buildTemplateVars(customer, business);
          const message = fillTemplate(config.thankYouTemplate, templateVars);
          await sendSms(customer.phone, message + '\n\nReply STOP to unsubscribe.', undefined, businessId);
          await logAgentAction({
            businessId,
            agentType: 'follow_up',
            action: 'sms_sent',
            customerId: customer.id,
            referenceType: entityType,
            referenceId: entityId,
            details: { messageType: 'thank_you', message },
          });
          // Also log to notification_log so business owners see it in Notification History
          await storage.createNotificationLog({
            businessId,
            customerId: customer.id,
            type: 'agent_follow_up',
            channel: 'sms',
            recipient: customer.phone,
            message,
            status: 'sent',
            referenceType: entityType,
            referenceId: entityId,
          });
          console.log(`[FollowUpAgent] Sent thank-you for ${entityType} ${entityId}`);
        }
      }

      // Send upsell if enabled, not yet sent, and delay has elapsed
      if (config.enableUpsell && !upsellSent && (now - queuedAt >= upsellDelayMs)) {
        // Re-check customer opt-in (they may have opted out since thank-you)
        const freshCustomer = await storage.getCustomer(customerId);
        if (freshCustomer?.phone && freshCustomer.marketingOptIn) {
          const templateVars = buildTemplateVars(freshCustomer, business);
          if (templateVars.bookingLink) {
            const message = fillTemplate(config.upsellTemplate, templateVars);
            await sendSms(freshCustomer.phone, message + '\n\nReply STOP to unsubscribe.', undefined, businessId);
            await logAgentAction({
              businessId,
              agentType: 'follow_up',
              action: 'sms_sent',
              customerId: freshCustomer.id,
              referenceType: entityType,
              referenceId: entityId,
              details: { messageType: 'upsell', message },
            });
            await storage.createNotificationLog({
              businessId,
              customerId: freshCustomer.id,
              type: 'agent_follow_up',
              channel: 'sms',
              recipient: freshCustomer.phone,
              message,
              status: 'sent',
              referenceType: entityType,
              referenceId: entityId,
            });
            console.log(`[FollowUpAgent] Sent upsell for ${entityType} ${entityId}`);
          }
        }
      }
    } catch (err) {
      console.error(`[FollowUpAgent] Error processing queued item:`, err);
    }
  }
}

function buildTemplateVars(customer: any, business: any): Record<string, string> {
  return {
    customerName: customer.firstName || 'there',
    businessName: business.name,
    businessPhone: business.twilioPhoneNumber || business.phone || '',
    bookingLink: business.bookingSlug ? `${process.env.APP_URL || 'https://www.smallbizagent.ai'}/book/${business.bookingSlug}` : '',
  };
}

export default { triggerFollowUp, runFollowUpCheck };
