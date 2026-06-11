/**
 * Customer Erasure & Export Service (GDPR Art. 17 / Art. 20, CCPA §1798.105 / §1798.110)
 *
 * Design: SCRUB-IN-PLACE + DELETE CONTENT ROWS — not a hard row delete.
 *
 * Why not hard delete: appointments/jobs/invoices/quotes carry ON DELETE
 * RESTRICT foreign keys to customers, and those are business/financial records
 * the data controller (the business owner) may legally retain under GDPR
 * Art. 17(3)(b) (tax + accounting obligations trump erasure). So:
 *
 *   - The customers row is ANONYMIZED in place: name → "Deleted Customer",
 *     phone → "erased-{id}" (the (business_id, phone) unique constraint
 *     requires a unique placeholder), every nullable PII column nulled,
 *     opt-ins revoked, deletedAt + isArchived set. The row no longer relates
 *     to an identifiable person, which is what erasure requires.
 *   - Transactional records are kept but their PII-bearing free-text columns
 *     are nulled (appointment notes, job symptoms/access notes, invoice/quote
 *     notes, reservation special requests).
 *   - Call logs are scrubbed (callerId/callerName/transcript/recordingUrl
 *     nulled) rather than deleted — the rows are billing evidence for call-
 *     minute overage charges.
 *   - Everything behavioral/conversational with no financial value is hard
 *     DELETED: AI intelligence, insights, SMS threads + message bodies,
 *     notification log, agent activity, equipment, engagement locks,
 *     tracking links, review requests, marketing triggers, workflow runs.
 *   - Mem0 AI memories are deleted via the Mem0 API (best-effort, after the
 *     DB transaction commits).
 *
 * Known limitation (documented, not hidden): call recordings + transcripts
 * also live on Retell's infrastructure. We null our references; Retell-side
 * deletion is governed by Retell's own retention policy. The SMS suppression
 * list intentionally KEEPS the phone number — honoring a STOP is a legal
 * obligation that survives erasure.
 *
 * Guard: a customer with an ACTIVE membership (live Stripe subscription on
 * the owner's Connect account) cannot be erased — the owner must cancel the
 * membership first, otherwise billing would continue against an anonymized
 * record.
 */

import { db } from '../db';
import {
  customers, appointments, jobs, invoices, invoiceItems, quotes, quoteItems, quoteFollowUps,
  callLogs, callIntelligence, customerInsights,
  smsConversations, notificationLog, agentActivityLog,
  customerEquipment, customerEngagementLock, customerTrackingLinks,
  reviewRequests, restaurantReservations,
  inboundMessages, outboundMessages, conversationStates,
  marketingTriggers, smsActivityFeed, workflowRuns,
  customerMemberships, membershipBenefitUsage,
} from '@shared/schema';
import { and, eq, inArray } from 'drizzle-orm';
import { logAudit } from './auditService';

export interface EraseResult {
  ok: boolean;
  reason?: 'customer_not_found' | 'active_membership' | 'database_error';
  message?: string;
  /** Per-table row counts, recorded in the audit log (no PII). */
  counts?: Record<string, number>;
  mem0Deleted?: boolean;
}

function rowCount(result: any): number {
  return result?.rowCount ?? 0;
}

/**
 * Erase a customer's personal data. Tenant-scoped: the customer must belong
 * to businessId. The relational scrub + deletes run in ONE transaction;
 * Mem0 deletion and audit logging run best-effort after commit.
 */
export async function eraseCustomer(
  customerId: number,
  businessId: number,
  requestedByUserId?: number,
): Promise<EraseResult> {
  // Pre-flight reads (outside the tx — read-only)
  const [customer] = await db.select().from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.businessId, businessId)));
  if (!customer) {
    return { ok: false, reason: 'customer_not_found', message: 'Customer not found' };
  }

  const activeMemberships = await db.select({ id: customerMemberships.id }).from(customerMemberships)
    .where(and(
      eq(customerMemberships.customerId, customerId),
      eq(customerMemberships.businessId, businessId),
      eq(customerMemberships.status, 'active'),
    ));
  if (activeMemberships.length > 0) {
    return {
      ok: false,
      reason: 'active_membership',
      message: 'This customer has an active membership. Cancel the membership before erasing — otherwise billing would continue against an anonymized record.',
    };
  }

  const phone = customer.phone;
  const counts: Record<string, number> = {};

  try {
    await db.transaction(async (tx) => {
      // ── 1. Anonymize the customer row in place ──
      await tx.update(customers).set({
        firstName: 'Deleted',
        lastName: 'Customer',
        phone: `erased-${customerId}`,
        email: null,
        address: null,
        city: null,
        state: null,
        zip: null,
        notes: null,
        birthday: null,
        tags: null,
        smsOptIn: false,
        smsOptInDate: null,
        smsOptInMethod: null,
        marketingOptIn: false,
        marketingOptInDate: null,
        stripeCustomerConnectId: null,
        deletedAt: new Date(),
        isArchived: true,
        updatedAt: new Date(),
      }).where(and(eq(customers.id, customerId), eq(customers.businessId, businessId)));
      counts.customers_scrubbed = 1;

      // ── 2. Scrub PII free-text on retained transactional records ──
      counts.appointments_scrubbed = rowCount(await tx.update(appointments)
        .set({ notes: null })
        .where(and(eq(appointments.customerId, customerId), eq(appointments.businessId, businessId))));

      counts.jobs_scrubbed = rowCount(await tx.update(jobs)
        .set({ notes: null, symptoms: null, accessNotes: null })
        .where(and(eq(jobs.customerId, customerId), eq(jobs.businessId, businessId))));

      counts.invoices_scrubbed = rowCount(await tx.update(invoices)
        .set({ notes: null })
        .where(and(eq(invoices.customerId, customerId), eq(invoices.businessId, businessId))));

      counts.quotes_scrubbed = rowCount(await tx.update(quotes)
        .set({ notes: null })
        .where(and(eq(quotes.customerId, customerId), eq(quotes.businessId, businessId))));

      counts.reservations_scrubbed = rowCount(await tx.update(restaurantReservations)
        .set({ specialRequests: null })
        .where(and(eq(restaurantReservations.customerId, customerId), eq(restaurantReservations.businessId, businessId))));

      // Call logs have no customerId FK — they link via callerId = phone.
      // Scrub (not delete): the rows are billing evidence for minute overages.
      if (phone && phone.trim().length > 0) {
        counts.call_logs_scrubbed = rowCount(await tx.update(callLogs)
          .set({ callerId: null, callerName: null, transcript: null, recordingUrl: null })
          .where(and(eq(callLogs.businessId, businessId), eq(callLogs.callerId, phone))));
      }

      // ── 3. Hard-delete behavioral/conversational data ──
      counts.call_intelligence = rowCount(await tx.delete(callIntelligence)
        .where(and(eq(callIntelligence.customerId, customerId), eq(callIntelligence.businessId, businessId))));

      counts.customer_insights = rowCount(await tx.delete(customerInsights)
        .where(and(eq(customerInsights.customerId, customerId), eq(customerInsights.businessId, businessId))));

      counts.sms_conversations = rowCount(await tx.delete(smsConversations)
        .where(and(eq(smsConversations.customerId, customerId), eq(smsConversations.businessId, businessId))));

      counts.notification_log = rowCount(await tx.delete(notificationLog)
        .where(and(eq(notificationLog.customerId, customerId), eq(notificationLog.businessId, businessId))));

      counts.agent_activity_log = rowCount(await tx.delete(agentActivityLog)
        .where(and(eq(agentActivityLog.customerId, customerId), eq(agentActivityLog.businessId, businessId))));

      counts.customer_equipment = rowCount(await tx.delete(customerEquipment)
        .where(and(eq(customerEquipment.customerId, customerId), eq(customerEquipment.businessId, businessId))));

      counts.engagement_locks = rowCount(await tx.delete(customerEngagementLock)
        .where(and(eq(customerEngagementLock.customerId, customerId), eq(customerEngagementLock.businessId, businessId))));

      counts.tracking_links = rowCount(await tx.delete(customerTrackingLinks)
        .where(and(eq(customerTrackingLinks.customerId, customerId), eq(customerTrackingLinks.businessId, businessId))));

      counts.review_requests = rowCount(await tx.delete(reviewRequests)
        .where(and(eq(reviewRequests.customerId, customerId), eq(reviewRequests.businessId, businessId))));

      counts.inbound_messages = rowCount(await tx.delete(inboundMessages)
        .where(and(eq(inboundMessages.customerId, customerId), eq(inboundMessages.businessId, businessId))));

      counts.outbound_messages = rowCount(await tx.delete(outboundMessages)
        .where(and(eq(outboundMessages.customerId, customerId), eq(outboundMessages.businessId, businessId))));

      counts.conversation_states = rowCount(await tx.delete(conversationStates)
        .where(and(eq(conversationStates.customerId, customerId), eq(conversationStates.businessId, businessId))));

      counts.marketing_triggers = rowCount(await tx.delete(marketingTriggers)
        .where(and(eq(marketingTriggers.customerId, customerId), eq(marketingTriggers.businessId, businessId))));

      counts.sms_activity_feed = rowCount(await tx.delete(smsActivityFeed)
        .where(and(eq(smsActivityFeed.customerId, customerId), eq(smsActivityFeed.businessId, businessId))));

      counts.workflow_runs = rowCount(await tx.delete(workflowRuns)
        .where(and(eq(workflowRuns.customerId, customerId), eq(workflowRuns.businessId, businessId))));

      // Quote follow-ups hang off quotes (messageBody contains sent SMS text)
      const customerQuotes = await tx.select({ id: quotes.id }).from(quotes)
        .where(and(eq(quotes.customerId, customerId), eq(quotes.businessId, businessId)));
      if (customerQuotes.length > 0) {
        counts.quote_follow_ups = rowCount(await tx.delete(quoteFollowUps)
          .where(inArray(quoteFollowUps.quoteId, customerQuotes.map(q => q.id))));
      }

      // Membership history (guard above ensures none are active)
      const memberships = await tx.select({ id: customerMemberships.id }).from(customerMemberships)
        .where(and(eq(customerMemberships.customerId, customerId), eq(customerMemberships.businessId, businessId)));
      if (memberships.length > 0) {
        counts.membership_benefit_usage = rowCount(await tx.delete(membershipBenefitUsage)
          .where(inArray(membershipBenefitUsage.membershipId, memberships.map(m => m.id))));
        counts.customer_memberships = rowCount(await tx.delete(customerMemberships)
          .where(and(eq(customerMemberships.customerId, customerId), eq(customerMemberships.businessId, businessId))));
      }
    });
  } catch (err: any) {
    console.error(`[Erasure] Transaction failed for customer ${customerId} (business ${businessId}):`, err?.message || err);
    return { ok: false, reason: 'database_error', message: 'Erasure failed — no data was modified. Please retry.' };
  }

  // ── 4. Best-effort post-commit cleanup (failures logged, never undo the erase) ──
  let mem0Deleted = false;
  try {
    const { deleteCustomerMemories } = await import('./mem0Service');
    mem0Deleted = await deleteCustomerMemories(businessId, customerId);
  } catch (err) {
    console.error(`[Erasure] Mem0 deletion failed for customer ${customerId}:`, err);
  }

  await logAudit({
    userId: requestedByUserId ?? null,
    businessId,
    action: 'data_delete',
    resource: 'customer',
    resourceId: customerId,
    details: { type: 'gdpr_erasure', counts, mem0Deleted },
  });

  console.log(`[Erasure] Customer ${customerId} (business ${businessId}) erased:`, JSON.stringify(counts));
  return { ok: true, counts, mem0Deleted };
}

/**
 * Export everything we hold about a customer as a JSON bundle
 * (GDPR Art. 20 data portability / CCPA right to know). Tenant-scoped.
 * Returns null when the customer doesn't belong to the business.
 */
export async function exportCustomerData(
  customerId: number,
  businessId: number,
  requestedByUserId?: number,
): Promise<Record<string, unknown> | null> {
  const [customer] = await db.select().from(customers)
    .where(and(eq(customers.id, customerId), eq(customers.businessId, businessId)));
  if (!customer) return null;

  const phone = customer.phone;
  const byCustomer = <T extends { customerId: any; businessId: any }>(table: any) =>
    db.select().from(table).where(and(eq(table.customerId, customerId), eq(table.businessId, businessId)));

  const [
    appointmentRows, jobRows, invoiceRows, quoteRows,
    callLogRows, intelligenceRows, insightRows,
    smsConversationRows, notificationRows, equipmentRows,
    membershipRows, reviewRequestRows, reservationRows,
    inboundRows, outboundRows,
  ] = await Promise.all([
    byCustomer(appointments),
    byCustomer(jobs),
    byCustomer(invoices),
    byCustomer(quotes),
    phone && phone.trim().length > 0
      ? db.select().from(callLogs).where(and(eq(callLogs.businessId, businessId), eq(callLogs.callerId, phone)))
      : Promise.resolve([]),
    byCustomer(callIntelligence),
    byCustomer(customerInsights),
    byCustomer(smsConversations),
    byCustomer(notificationLog),
    byCustomer(customerEquipment),
    byCustomer(customerMemberships),
    byCustomer(reviewRequests),
    byCustomer(restaurantReservations),
    byCustomer(inboundMessages),
    byCustomer(outboundMessages),
  ]);

  // Line items for the customer's invoices/quotes
  const invoiceIds = invoiceRows.map((r: any) => r.id);
  const quoteIds = quoteRows.map((r: any) => r.id);
  const [invoiceItemRows, quoteItemRows] = await Promise.all([
    invoiceIds.length > 0 ? db.select().from(invoiceItems).where(inArray(invoiceItems.invoiceId, invoiceIds)) : Promise.resolve([]),
    quoteIds.length > 0 ? db.select().from(quoteItems).where(inArray(quoteItems.quoteId, quoteIds)) : Promise.resolve([]),
  ]);

  await logAudit({
    userId: requestedByUserId ?? null,
    businessId,
    action: 'data_export',
    resource: 'customer',
    resourceId: customerId,
    details: { type: 'gdpr_export' },
  });

  return {
    exportedAt: new Date().toISOString(),
    customer,
    appointments: appointmentRows,
    jobs: jobRows,
    invoices: invoiceRows,
    invoiceItems: invoiceItemRows,
    quotes: quoteRows,
    quoteItems: quoteItemRows,
    callLogs: callLogRows,
    callIntelligence: intelligenceRows,
    customerInsights: insightRows,
    smsConversations: smsConversationRows,
    notifications: notificationRows,
    equipment: equipmentRows,
    memberships: membershipRows,
    reviewRequests: reviewRequestRows,
    reservations: reservationRows,
    inboundMessages: inboundRows,
    outboundMessages: outboundRows,
  };
}
