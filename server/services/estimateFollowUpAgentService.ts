import { storage } from '../storage';
import { sendSms } from './twilioService';
import { isAgentEnabled, getAgentConfig, fillTemplate } from './agentSettingsService';
import { logAgentAction } from './agentActivityService';

export async function runEstimateFollowUpCheck(): Promise<void> {
  console.log('[EstimateFollowUpAgent] Running estimate follow-up check...');

  try {
    const businesses = await storage.getAllBusinesses();

    for (const business of businesses) {
      try {
        const enabled = await isAgentEnabled(business.id, 'estimate_follow_up');
        if (!enabled) continue;

        await processBusinessEstimates(business.id);
        // Rate limit: 1 second between businesses
        await new Promise(r => setTimeout(r, 1000));
      } catch (err) {
        console.error(`[EstimateFollowUpAgent] Error processing business ${business.id}:`, err);
      }
    }

    console.log('[EstimateFollowUpAgent] Estimate follow-up check complete.');
  } catch (err) {
    console.error('[EstimateFollowUpAgent] Error in main loop:', err);
  }
}

async function processBusinessEstimates(businessId: number): Promise<void> {
  const config = await getAgentConfig(businessId, 'estimate_follow_up');
  const business = await storage.getBusiness(businessId);
  if (!business) return;

  const intervalHours: number[] = config.attemptIntervalHours ?? [48, 96, 168];
  const maxAttempts: number = config.maxAttempts ?? 3;
  const templates: string[] = config.messageTemplates ?? [];

  // Get all pending quotes for this business
  const quotes = await storage.getAllQuotes(businessId);
  const pendingQuotes = quotes.filter(q => q.status === 'pending');

  for (const quote of pendingQuotes) {
    try {
      if (!quote.customerId) continue;

      const attemptCount = await storage.getQuoteFollowUpCount(quote.id);

      // Already hit max attempts
      if (attemptCount >= maxAttempts) {
        if (config.autoExpire) {
          await storage.updateQuoteStatus(quote.id, 'expired');
          await logAgentAction({
            businessId,
            agentType: 'estimate_follow_up',
            action: 'status_changed',
            customerId: quote.customerId,
            referenceType: 'quote',
            referenceId: quote.id,
            details: { newStatus: 'expired', reason: 'max_attempts_reached' },
          });
        }
        continue;
      }

      // Check if it's time for the next follow-up
      const quoteAgeHours = (Date.now() - new Date(quote.createdAt!).getTime()) / (1000 * 60 * 60);
      const nextAttemptThreshold = intervalHours[attemptCount] ?? intervalHours[intervalHours.length - 1];

      if (quoteAgeHours < nextAttemptThreshold) continue;

      // Note: attemptCount from the query above is reused here to avoid a duplicate DB call.
      // The previous code called getQuoteFollowUpCount a second time, but it returns
      // the same value within the same loop iteration.

      const customer = await storage.getCustomer(quote.customerId);
      if (!customer?.phone || !customer.smsOptIn) continue;

      const templateIdx = Math.min(attemptCount, templates.length - 1);
      const template = templates[templateIdx] || templates[0];
      if (!template) continue;

      const message = fillTemplate(template, {
        customerName: customer.firstName || 'there',
        businessName: business.name,
        quoteTotal: quote.total ? `$${Number(quote.total).toFixed(2)}` : '',
        validUntil: quote.validUntil || '',
      });

      await sendSms(customer.phone, message + '\n\nReply STOP to unsubscribe.', undefined, businessId);

      await storage.createQuoteFollowUp({
        quoteId: quote.id,
        businessId,
        attemptNumber: attemptCount + 1,
        channel: 'sms',
        messageBody: message,
      });

      await logAgentAction({
        businessId,
        agentType: 'estimate_follow_up',
        action: 'sms_sent',
        customerId: customer.id,
        referenceType: 'quote',
        referenceId: quote.id,
        details: { attemptNumber: attemptCount + 1, message },
      });

      console.log(`[EstimateFollowUpAgent] Sent follow-up #${attemptCount + 1} for quote ${quote.id}`);

      // Rate limit between SMS sends
      await new Promise(r => setTimeout(r, 500));
    } catch (err) {
      console.error(`[EstimateFollowUpAgent] Error processing quote ${quote.id}:`, err);
    }
  }
}

export default { runEstimateFollowUpCheck };
