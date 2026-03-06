import { storage } from '../storage';
import { sendSms } from './twilioService';
import { isAgentEnabled, getAgentConfig, fillTemplate } from './agentSettingsService';
import { logAgentAction } from './agentActivityService';

export async function triggerFollowUp(
  entityType: 'job' | 'appointment',
  entityId: number,
  businessId: number,
): Promise<void> {
  try {
    const enabled = await isAgentEnabled(businessId, 'follow_up');
    if (!enabled) return;

    const config = await getAgentConfig(businessId, 'follow_up');
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
    if (!customer?.phone || !customer.smsOptIn) return;

    const templateVars: Record<string, string> = {
      customerName: customer.firstName || 'there',
      businessName: business.name,
      businessPhone: business.phone || '',
      bookingLink: business.bookingSlug ? `https://smallbizagent.ai/book/${business.bookingSlug}` : '',
    };

    // Send thank-you message
    if (config.enableThankYou) {
      const delayMs = (config.thankYouDelayMinutes ?? 30) * 60 * 1000;
      setTimeout(async () => {
        try {
          const message = fillTemplate(config.thankYouTemplate, templateVars);
          await sendSms(customer.phone!, message);
          await logAgentAction({
            businessId,
            agentType: 'follow_up',
            action: 'sms_sent',
            customerId: customer.id,
            referenceType: entityType,
            referenceId: entityId,
            details: { messageType: 'thank_you', message },
          });
        } catch (err) {
          console.error('[FollowUpAgent] Error sending thank-you SMS:', err);
        }
      }, delayMs);
    }

    // Send upsell message (separate delay)
    if (config.enableUpsell && templateVars.bookingLink) {
      const delayMs = (config.upsellDelayHours ?? 48) * 60 * 60 * 1000;
      setTimeout(async () => {
        try {
          // Re-check opt-in in case they opted out between thank-you and upsell
          const freshCustomer = await storage.getCustomer(customerId!);
          if (!freshCustomer?.phone || !freshCustomer.smsOptIn) return;

          const message = fillTemplate(config.upsellTemplate, templateVars);
          await sendSms(freshCustomer.phone, message);
          await logAgentAction({
            businessId,
            agentType: 'follow_up',
            action: 'sms_sent',
            customerId: freshCustomer.id,
            referenceType: entityType,
            referenceId: entityId,
            details: { messageType: 'upsell', message },
          });
        } catch (err) {
          console.error('[FollowUpAgent] Error sending upsell SMS:', err);
        }
      }, delayMs);
    }

    console.log(`[FollowUpAgent] Scheduled follow-up messages for ${entityType} ${entityId}`);
  } catch (err) {
    console.error('[FollowUpAgent] Error triggering follow-up:', err);
  }
}

export default { triggerFollowUp };
