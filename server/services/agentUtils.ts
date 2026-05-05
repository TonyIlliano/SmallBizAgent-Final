/**
 * Shared SMS Agent Utilities
 *
 * Common patterns extracted from the 5 SMS agent services
 * (followUp, noShow, estimateFollowUp, rebooking, invoiceCollection).
 *
 * Instead of consolidating 5 agents into 1 generic factory (which would
 * create a config monster), these utilities eliminate copy-paste while
 * keeping each agent's unique logic in its own focused file.
 */

import { storage } from '../storage';
import { isAgentEnabled } from './agentSettingsService';
import { logAgentAction } from './agentActivityService';

/**
 * Iterate all businesses that have a specific agent enabled.
 * Handles the common pattern: getAllBusinesses → check enabled → process.
 *
 * @param agentType - The agent type key (e.g., 'follow_up', 'invoice_collection')
 * @param callback - Async function to process each enabled business
 * @param options - Optional rate limiting between businesses
 */
export async function forEachEnabledBusiness(
  agentType: string,
  callback: (businessId: number) => Promise<void>,
  options?: { delayBetweenMs?: number }
): Promise<{ processed: number; errors: number }> {
  const businesses = await storage.getAllBusinesses();
  let processed = 0;
  let errors = 0;

  // Lazy-import the free-plan check so this module stays cheap to load.
  const { isFreePlanSync } = await import('./usageService');

  for (const business of businesses) {
    try {
      // Free tier gate — agents are paid-only. Skip silently rather than logging
      // every cycle, since this can fire many times per day.
      if (isFreePlanSync(business)) continue;

      const enabled = await isAgentEnabled(business.id, agentType);
      if (!enabled) continue;

      await callback(business.id);
      processed++;

      // Rate limit between businesses
      if (options?.delayBetweenMs) {
        await new Promise(r => setTimeout(r, options.delayBetweenMs));
      }
    } catch (err) {
      errors++;
      console.error(`[${agentType}] Error processing business ${business.id}:`, err);
    }
  }

  return { processed, errors };
}

/**
 * Generate an SMS via Message Intelligence Service with template fallback.
 * Handles the common pattern: try MIS → fall back to template.
 *
 * @returns The generated message text
 */
export async function generateAgentMessage(params: {
  messageType: string;
  businessId: number;
  customerId: number;
  customerPhone: string;
  isMarketing: boolean;
  appendOptOut: boolean;
  context: Record<string, any>;
  fallbackTemplate: string;
  fallbackVars: Record<string, string>;
}): Promise<string> {
  try {
    const { generateMessage } = await import('./messageIntelligenceService');
    const result = await generateMessage({
      messageType: params.messageType as any,
      businessId: params.businessId,
      customerId: params.customerId,
      recipientPhone: params.customerPhone,
      useTemplate: false,
      context: params.context,
      fallbackTemplate: params.fallbackTemplate,
      fallbackVars: params.fallbackVars,
      isMarketing: params.isMarketing,
      appendOptOut: params.appendOptOut,
    });
    return result.body || fillTemplate(params.fallbackTemplate, params.fallbackVars);
  } catch {
    return fillTemplate(params.fallbackTemplate, params.fallbackVars);
  }
}

/**
 * Log an agent SMS send to both agentActivityLog and notificationLog.
 * Handles the common dual-logging pattern.
 */
export async function logAgentSend(params: {
  businessId: number;
  agentType: string;
  customerId: number;
  customerPhone: string;
  message: string;
  referenceType: string;
  referenceId: number;
  details?: Record<string, any>;
}): Promise<void> {
  // Log to agent activity (visible in AI Agents dashboard)
  await logAgentAction({
    businessId: params.businessId,
    agentType: params.agentType,
    action: 'sms_sent',
    customerId: params.customerId,
    referenceType: params.referenceType,
    referenceId: params.referenceId,
    details: params.details || { message: params.message },
  });

  // Log to notification_log (visible in business owner Notification History)
  await storage.createNotificationLog({
    businessId: params.businessId,
    customerId: params.customerId,
    type: `agent_${params.agentType}`,
    channel: 'sms',
    recipient: params.customerPhone,
    message: params.message,
    status: 'sent',
    referenceType: params.referenceType,
    referenceId: params.referenceId,
  });
}

/**
 * Check if we can send SMS to a customer based on opt-in status.
 *
 * @param customer - Customer record
 * @param isTransactional - If true, checks smsOptIn only. If false, checks marketingOptIn.
 */
export function canSendToCustomer(
  customer: any,
  isTransactional: boolean = false
): boolean {
  if (!customer?.phone) return false;
  if (isTransactional) return customer.smsOptIn === true;
  return customer.marketingOptIn === true;
}

/**
 * Simple template variable replacer.
 * Replaces {{variableName}} with values from the vars object.
 */
export function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
}
