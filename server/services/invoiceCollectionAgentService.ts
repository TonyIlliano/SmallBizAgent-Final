import { storage } from '../storage';
import { isAgentEnabled, getAgentConfig } from './agentSettingsService';
import { logAgentAction } from './agentActivityService';

/**
 * Invoice Collection Agent Service
 *
 * Sends escalating SMS reminders for overdue invoices.
 * Messages are AI-generated via Message Intelligence Service (Claude)
 * with template fallbacks.
 *
 * Escalation tiers:
 *   - Day 1:  Friendly reminder ("just a heads up")
 *   - Day 3:  Gentle follow-up with payment link
 *   - Day 7:  Firmer reminder ("outstanding balance")
 *   - Day 14: Urgent notice ("final reminder")
 *   - Day 30: Final notice ("we need to discuss next steps")
 *
 * TCPA compliance:
 *   - Checks smsOptIn (transactional, NOT marketing)
 *   - Goes through centralized twilioService.sendSms() for suppression list
 *   - Checks engagement locks (won't pile on if another agent is mid-convo)
 *   - Idempotent via notification_log (won't resend same tier)
 *
 * Skips invoices that are: paid, partially_paid, cancelled, void, draft
 */

const REMINDER_TIERS = [1, 3, 7, 14, 30] as const;

const FALLBACK_TEMPLATES: Record<number, string> = {
  1: 'Hi {{customerName}}! Just a friendly reminder — your invoice #{{invoiceNumber}} for {{amount}} was due {{dueDate}}.{{payLink}} If you have any questions, reach out to {{businessName}}.',
  3: 'Hi {{customerName}}, following up on invoice #{{invoiceNumber}} for {{amount}} from {{businessName}}. This was due on {{dueDate}}.{{payLink}} Let us know if you need anything!',
  7: 'Hi {{customerName}}, your invoice #{{invoiceNumber}} for {{amount}} from {{businessName}} is now {{daysOverdue}} days past due.{{payLink}} Please let us know when we can expect payment.',
  14: '{{customerName}}, this is an urgent reminder: invoice #{{invoiceNumber}} for {{amount}} is {{daysOverdue}} days overdue.{{payLink}} Please contact {{businessName}} to arrange payment.',
  30: '{{customerName}}, final notice: invoice #{{invoiceNumber}} for {{amount}} from {{businessName}} is {{daysOverdue}} days past due.{{payLink}} We need to resolve this soon — please reach out.',
};

export async function runInvoiceCollectionCheck(): Promise<void> {
  console.log('[InvoiceCollectionAgent] Running invoice collection check...');

  try {
    const businesses = await storage.getAllBusinesses();
    let totalReminders = 0;

    for (const business of businesses) {
      try {
        const enabled = await isAgentEnabled(business.id, 'invoice_collection');
        if (!enabled) continue;

        const sent = await processBusinessInvoices(business.id);
        totalReminders += sent;
        // Rate limit: 1 second between businesses
        await new Promise(r => setTimeout(r, 1000));
      } catch (err) {
        console.error(`[InvoiceCollectionAgent] Error processing business ${business.id}:`, err);
      }
    }

    console.log(`[InvoiceCollectionAgent] Done — ${totalReminders} reminders sent.`);
  } catch (err) {
    console.error('[InvoiceCollectionAgent] Error in main loop:', err);
  }
}

async function processBusinessInvoices(businessId: number): Promise<number> {
  const config = await getAgentConfig(businessId, 'invoice_collection');
  const business = await storage.getBusiness(businessId);
  if (!business) return 0;

  // Get overdue invoices for this business
  const overdueInvoices = await storage.getInvoices(businessId, { status: 'overdue' });
  let sentCount = 0;

  // Also check pending invoices that are past due but not yet marked overdue
  const pendingInvoices = await storage.getInvoices(businessId, { status: 'pending' });
  const allTargetInvoices = [
    ...overdueInvoices,
    ...pendingInvoices.filter(inv => {
      if (!inv.dueDate) return false;
      const due = new Date(inv.dueDate);
      due.setHours(0, 0, 0, 0);
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      return due < now;
    }),
  ];

  // Deduplicate by invoice ID
  const seen = new Set<number>();
  const uniqueInvoices = allTargetInvoices.filter(inv => {
    if (seen.has(inv.id)) return false;
    seen.add(inv.id);
    return true;
  });

  // Custom tiers from config or defaults
  const tiers: number[] = config?.reminderDays ?? [...REMINDER_TIERS];

  for (const invoice of uniqueInvoices) {
    try {
      if (!invoice.customerId || !invoice.dueDate) continue;
      // Skip paid/cancelled/void/draft
      if (['paid', 'partially_paid', 'cancelled', 'void', 'draft'].includes(invoice.status || '')) continue;

      const customer = await storage.getCustomer(invoice.customerId);
      if (!customer?.phone || !customer.smsOptIn) continue;

      const dueDate = new Date(invoice.dueDate);
      dueDate.setHours(0, 0, 0, 0);
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));

      if (daysOverdue < 1) continue;

      // Find the highest applicable tier
      const applicableTier = [...tiers].reverse().find(t => daysOverdue >= t);
      if (!applicableTier) continue;

      // Idempotency: check if this tier was already sent for this invoice
      const idempotencyKey = `invoice_collection:${applicableTier}d:${invoice.id}`;
      const alreadySent = await storage.hasNotificationLogByType(businessId, idempotencyKey, 'sent');
      if (alreadySent) continue;

      // Check engagement lock — don't pile on
      try {
        const lock = await storage.getEngagementLock(customer.id, businessId);
        if (lock) {
          console.log(`[InvoiceCollectionAgent] Skipping customer ${customer.id} — engagement lock held by ${lock.lockedByAgent}`);
          continue;
        }
      } catch {
        // No lock check method or lock table issue — proceed anyway
      }

      // Build payment link
      const APP_URL = process.env.APP_URL || 'https://www.smallbizagent.ai';
      let payUrl: string | null = null;
      const hasStripe = !!(business as any).stripeConnectAccountId;
      if (hasStripe) {
        const token = (invoice as any).accessToken;
        if (token) {
          payUrl = `${APP_URL}/portal/invoice/${token}`;
        } else {
          // Generate access token
          try {
            const crypto = await import('crypto');
            const newToken = crypto.randomBytes(32).toString('hex');
            await storage.updateInvoice(invoice.id, { accessToken: newToken } as any);
            payUrl = `${APP_URL}/portal/invoice/${newToken}`;
          } catch {
            // Continue without payment link
          }
        }
      }

      const amount = `$${Number(invoice.total || 0).toFixed(2)}`;
      const dueDateStr = new Date(invoice.dueDate).toLocaleDateString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric',
      });

      const templateVars: Record<string, string> = {
        customerName: customer.firstName || 'there',
        businessName: business.name,
        invoiceNumber: invoice.invoiceNumber || `#${invoice.id}`,
        amount,
        dueDate: dueDateStr,
        daysOverdue: String(daysOverdue),
        payLink: payUrl ? ` Pay now: ${payUrl}` : '',
      };

      // Try AI-generated message via Message Intelligence Service
      let message: string;
      try {
        const { generateMessage } = await import('./messageIntelligenceService');
        const misResult = await generateMessage({
          messageType: applicableTier <= 3 ? 'INVOICE_COLLECTION_REMINDER' : 'INVOICE_COLLECTION_FINAL',
          businessId,
          customerId: customer.id,
          recipientPhone: customer.phone,
          useTemplate: false,
          context: {
            ...templateVars,
            tierDays: applicableTier,
            isFirstReminder: applicableTier === 1,
            isFinalNotice: applicableTier >= 14,
            triggerSource: 'agent',
          },
          fallbackTemplate: FALLBACK_TEMPLATES[applicableTier] || FALLBACK_TEMPLATES[7],
          fallbackVars: templateVars,
          isMarketing: false, // Transactional — owed money
          appendOptOut: false, // Don't add "Reply STOP" — this is transactional
        });
        message = misResult.body || fillTemplate(FALLBACK_TEMPLATES[applicableTier] || FALLBACK_TEMPLATES[7], templateVars);
      } catch {
        // Fallback to template
        message = fillTemplate(FALLBACK_TEMPLATES[applicableTier] || FALLBACK_TEMPLATES[7], templateVars);
      }

      // Send via centralized Twilio (suppression list, sanitization, business number)
      const { sendSms } = await import('./twilioService');
      await sendSms(customer.phone, message, undefined, businessId);

      // Log for idempotency
      await storage.createNotificationLog({
        businessId,
        customerId: customer.id,
        type: idempotencyKey,
        channel: 'sms',
        recipient: customer.phone,
        message,
        status: 'sent',
        referenceType: 'invoice',
        referenceId: invoice.id,
      });

      // Log to agent activity (visible in AI Agents dashboard)
      await logAgentAction({
        businessId,
        agentType: 'invoice_collection',
        action: 'sms_sent',
        customerId: customer.id,
        referenceType: 'invoice',
        referenceId: invoice.id,
        details: {
          tierDays: applicableTier,
          daysOverdue,
          amount,
          invoiceNumber: invoice.invoiceNumber,
          message,
        },
      });

      console.log(`[InvoiceCollectionAgent] Sent ${applicableTier}-day reminder for invoice ${invoice.invoiceNumber} to ${customer.firstName} (business ${businessId})`);
      sentCount++;

      // Rate limit between SMS sends
      await new Promise(r => setTimeout(r, 500));
    } catch (err) {
      console.error(`[InvoiceCollectionAgent] Error processing invoice ${invoice.id}:`, err);
    }
  }

  return sentCount;
}

/** Simple template variable replacer */
function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '');
}

export default { runInvoiceCollectionCheck };
