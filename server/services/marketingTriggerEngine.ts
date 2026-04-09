/**
 * Marketing Trigger Engine
 *
 * Watches for conditions, writes to the marketing_triggers queue.
 * Does NOT send messages directly — all sends go through messageIntelligenceService.
 *
 * Two modes:
 * 1. processReadyTriggers() — Scheduler runs every 5 min, processes pending triggers
 * 2. evaluateAndCreateTriggers(businessId) — Scheduler runs every 1h, scans for new trigger conditions
 */

import { storage } from '../storage';
import { getVerticalConfig } from '../config/verticals';
import { generateMessage, type MessageType } from './messageIntelligenceService';
import type { MarketingTrigger } from '@shared/schema';

// ─── Process Ready Triggers ──────────────────────────────────────────────────

/**
 * Process all pending marketing triggers whose scheduledFor <= now.
 * Called by scheduler every 5 minutes with advisory lock.
 */
export async function processReadyTriggers(): Promise<{ processed: number; sent: number; skipped: number; failed: number }> {
  const stats = { processed: 0, sent: 0, skipped: 0, failed: 0 };

  try {
    const triggers = await storage.getPendingMarketingTriggers(50);
    if (triggers.length === 0) return stats;

    console.log(`[MarketingTrigger] Processing ${triggers.length} pending triggers`);

    for (const trigger of triggers) {
      stats.processed++;
      try {
        await processSingleTrigger(trigger, stats);
        // Rate limit: 200ms between sends
        await new Promise(r => setTimeout(r, 200));
      } catch (err) {
        console.error(`[MarketingTrigger] Error processing trigger ${trigger.id}:`, err);
        await storage.updateMarketingTrigger(trigger.id, { status: 'failed', skipReason: 'processing_error' });
        stats.failed++;
      }
    }

    console.log(`[MarketingTrigger] Done: ${stats.sent} sent, ${stats.skipped} skipped, ${stats.failed} failed`);
  } catch (err) {
    console.error('[MarketingTrigger] Error in processReadyTriggers:', err);
  }

  return stats;
}

async function processSingleTrigger(trigger: MarketingTrigger, stats: { sent: number; skipped: number; failed: number }): Promise<void> {
  const customer = await storage.getCustomer(trigger.customerId);
  if (!customer) {
    await storage.updateMarketingTrigger(trigger.id, { status: 'skipped', skipReason: 'customer_not_found' });
    stats.skipped++;
    return;
  }

  const business = await storage.getBusiness(trigger.businessId);
  if (!business) {
    await storage.updateMarketingTrigger(trigger.id, { status: 'skipped', skipReason: 'business_not_found' });
    stats.skipped++;
    return;
  }

  // Opt-out check — skip for MARKETING_OPT_IN (asking them to opt in) and BIRTHDAY_COLLECTION (requires marketingOptIn checked at creation)
  const skipOptOutCheck = trigger.triggerType === 'MARKETING_OPT_IN' || trigger.triggerType === 'BIRTHDAY_COLLECTION';
  if (!skipOptOutCheck && !customer.marketingOptIn) {
    await storage.updateMarketingTrigger(trigger.id, { status: 'skipped', skipReason: 'opted_out' });
    stats.skipped++;
    return;
  }

  if (!customer.phone) {
    await storage.updateMarketingTrigger(trigger.id, { status: 'skipped', skipReason: 'no_phone' });
    stats.skipped++;
    return;
  }

  // Condition-still-valid check
  const stillValid = await isTriggerConditionStillValid(trigger, customer, business);
  if (!stillValid) {
    await storage.updateMarketingTrigger(trigger.id, { status: 'cancelled', skipReason: 'condition_changed' });
    stats.skipped++;
    return;
  }

  // Check engagement lock — if locked, reschedule 15 min out
  try {
    const lock = await storage.getEngagementLock(customer.id, trigger.businessId);
    if (lock && lock.status === 'active' && lock.expiresAt && new Date(lock.expiresAt) > new Date()) {
      const rescheduleTime = new Date(Date.now() + 15 * 60 * 1000);
      await storage.updateMarketingTrigger(trigger.id, { scheduledFor: rescheduleTime });
      stats.skipped++;
      return;
    }
  } catch (err) { console.error('[MarketingTrigger] Error:', err instanceof Error ? err.message : err); }

  // Send via messageIntelligenceService
  const context: Record<string, any> = {
    customerName: customer.firstName || 'there',
    businessName: business.name,
    businessPhone: business.twilioPhoneNumber || business.phone || '',
    bookingLink: business.bookingSlug ? `${process.env.APP_URL || 'https://www.smallbizagent.ai'}/book/${business.bookingSlug}` : '',
    triggerSource: 'marketing_trigger',
    ...(typeof trigger.context === 'object' && trigger.context !== null ? trigger.context as Record<string, any> : {}),
  };

  const result = await generateMessage({
    messageType: trigger.messageType as MessageType,
    businessId: trigger.businessId,
    customerId: trigger.customerId,
    recipientPhone: customer.phone,
    useTemplate: false, // Full AI generation for marketing
    context,
    isMarketing: true,
    campaignId: trigger.campaignId ?? undefined,
    sequenceId: trigger.sequenceId ?? undefined,
    stepNumber: trigger.stepNumber ?? undefined,
    appendOptOut: true,
  });

  if (result.success) {
    await storage.updateMarketingTrigger(trigger.id, { status: 'sent', sentAt: new Date() });
    stats.sent++;

    // Create SMS conversation for reply-based triggers (opt-in, birthday collection)
    if (trigger.triggerType === 'MARKETING_OPT_IN' && customer.phone) {
      try {
        await storage.createSmsConversation({
          businessId: trigger.businessId,
          customerId: customer.id,
          customerPhone: customer.phone,
          agentType: 'marketing_opt_in',
          state: 'opt_in_awaiting',
          context: {},
          expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 min expiry
        });
      } catch (convErr) {
        console.error(`[MarketingTrigger] Error creating opt-in conversation:`, convErr);
      }
    }

    if (trigger.triggerType === 'BIRTHDAY_COLLECTION' && customer.phone) {
      try {
        await storage.createSmsConversation({
          businessId: trigger.businessId,
          customerId: customer.id,
          customerPhone: customer.phone,
          agentType: 'birthday_collection',
          state: 'birthday_awaiting',
          context: { attempts: 0 },
          expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 min expiry
        });
      } catch (convErr) {
        console.error(`[MarketingTrigger] Error creating birthday collection conversation:`, convErr);
      }
    }

    // Update campaign analytics if campaign-linked
    if (trigger.campaignId) {
      try {
        const existing = await storage.getCampaignAnalytics(trigger.campaignId);
        await storage.upsertCampaignAnalytics(trigger.campaignId, trigger.businessId, {
          sentCount: (existing?.sentCount || 0) + 1,
        });
      } catch (err) { console.error('[MarketingTrigger] Error:', err instanceof Error ? err.message : err); }
    }
  } else if (result.skipped) {
    await storage.updateMarketingTrigger(trigger.id, { status: 'skipped', skipReason: result.skipReason || 'send_skipped' });
    stats.skipped++;
  } else {
    await storage.updateMarketingTrigger(trigger.id, { status: 'failed', skipReason: result.error || 'send_failed' });
    stats.failed++;
  }
}

async function isTriggerConditionStillValid(trigger: MarketingTrigger, customer: any, business: any): Promise<boolean> {
  switch (trigger.triggerType) {
    case 'WIN_BACK': {
      // Has customer booked since trigger was written?
      const appointments = await storage.getAppointmentsByCustomerId(customer.id);
      const hasUpcoming = appointments.some((a: any) => new Date(a.startDate) > new Date() && a.status !== 'cancelled');
      return !hasUpcoming; // Valid only if no upcoming appointments
    }
    case 'BIRTHDAY': {
      // Is it still their birthday?
      if (!customer.birthday) return false;
      const today = new Date();
      const [mm, dd] = customer.birthday.split('-');
      return (today.getMonth() + 1) === parseInt(mm) && today.getDate() === parseInt(dd);
    }
    case 'ESTIMATE_FOLLOWUP': {
      // Has quote been accepted?
      const ctx = trigger.context as any;
      if (ctx?.quoteId) {
        const quotes = await storage.getAllQuotes(trigger.businessId);
        const quote = quotes.find((q: any) => q.id === ctx.quoteId);
        if (quote && quote.status !== 'pending') return false; // Already accepted/declined
      }
      return true;
    }
    case 'REBOOKING_NUDGE': {
      // Has customer booked since trigger was created?
      const appts = await storage.getAppointmentsByCustomerId(customer.id);
      const recentBooking = appts.some((a: any) => new Date(a.createdAt) > new Date(trigger.createdAt!) && a.status !== 'cancelled');
      return !recentBooking;
    }
    case 'MARKETING_OPT_IN': {
      // Already opted in?
      return !customer.marketingOptIn;
    }
    case 'BIRTHDAY_COLLECTION': {
      // Already have birthday?
      return !customer.birthday;
    }
    default:
      return true; // Other triggers always valid
  }
}

// ─── Trigger Evaluation & Creation ───────────────────────────────────────────

/**
 * Evaluate all customers for a business and create new marketing triggers.
 * Called by scheduler every 1 hour.
 */
export async function evaluateAndCreateTriggers(businessId: number): Promise<{ created: number }> {
  let created = 0;

  try {
    const business = await storage.getBusiness(businessId);
    if (!business) return { created };

    // Check if SMS profile is complete — skip businesses without AI personality
    const smsProfile = await storage.getSmsBusinessProfile(businessId);
    if (!smsProfile?.profileComplete) return { created };

    const vertical = getVerticalConfig(business.industry);
    const customers = await storage.getCustomers(businessId);

    for (const customer of customers) {
      if (!customer.phone || !customer.marketingOptIn) continue;

      try {
        // WIN_BACK
        if (vertical.rules.hasWinBack) {
          const winBackDays = smsProfile.winBackDays || 30;
          created += await evaluateWinBack(businessId, customer, winBackDays);
        }

        // REBOOKING_NUDGE
        if (vertical.rules.hasRebookingNudge && vertical.rules.rebookingCycleDays > 0) {
          created += await evaluateRebookingNudge(businessId, customer, vertical.rules.rebookingCycleDays);
        }

        // BIRTHDAY
        if (vertical.rules.hasBirthdayMessage) {
          created += await evaluateBirthday(businessId, customer);
        }

        // REVIEW_REQUEST
        created += await evaluateReviewRequest(businessId, customer);

      } catch (err) {
        console.error(`[MarketingTrigger] Error evaluating customer ${customer.id}:`, err);
      }
    }

    // ESTIMATE_FOLLOWUP
    if (vertical.rules.estimateFollowUp) {
      created += await evaluateEstimateFollowups(businessId);
    }

    // MARKETING_OPT_IN — runs for customers with smsOptIn but NOT marketingOptIn
    for (const customer of customers) {
      if (!customer.phone || !customer.smsOptIn || customer.marketingOptIn) continue;
      try {
        created += await evaluateMarketingOptIn(businessId, customer);
      } catch (err) {
        console.error(`[MarketingTrigger] Error evaluating opt-in for customer ${customer.id}:`, err);
      }
    }

    // BIRTHDAY_COLLECTION — runs for opted-in customers without birthday
    if (business.birthdayCampaignEnabled) {
      for (const customer of customers) {
        if (!customer.phone || !customer.marketingOptIn || customer.birthday) continue;
        try {
          created += await evaluateBirthdayCollection(businessId, customer);
        } catch (err) {
          console.error(`[MarketingTrigger] Error evaluating birthday collection for customer ${customer.id}:`, err);
        }
      }
    }
  } catch (err) {
    console.error(`[MarketingTrigger] Error evaluating business ${businessId}:`, err);
  }

  return { created };
}

async function evaluateWinBack(businessId: number, customer: any, winBackDays: number): Promise<number> {
  // Check if customer has been inactive for winBackDays
  const insights = await storage.getCustomerInsights(customer.id, businessId).catch(() => null);
  if (!insights?.daysSinceLastVisit || insights.daysSinceLastVisit < winBackDays) return 0;

  // Check no upcoming appointment
  const appointments = await storage.getAppointmentsByCustomerId(customer.id);
  const hasUpcoming = appointments.some((a: any) => new Date(a.startDate) > new Date() && a.status !== 'cancelled');
  if (hasUpcoming) return 0;

  // Check no pending win-back trigger already
  const existing = await storage.getPendingMarketingTriggers(1000); // TODO: add filtered query
  const hasPending = existing.some(t => t.customerId === customer.id && t.businessId === businessId && t.triggerType === 'WIN_BACK');
  if (hasPending) return 0;

  await storage.createMarketingTrigger({
    businessId,
    customerId: customer.id,
    triggerType: 'WIN_BACK',
    messageType: 'WIN_BACK',
    scheduledFor: new Date(), // Send immediately
    status: 'pending',
  });
  return 1;
}

async function evaluateRebookingNudge(businessId: number, customer: any, cycleDays: number): Promise<number> {
  const insights = await storage.getCustomerInsights(customer.id, businessId).catch(() => null);
  if (!insights?.daysSinceLastVisit || insights.daysSinceLastVisit < cycleDays) return 0;
  // Don't overlap with win-back window (win-back is for much longer inactivity)
  if (insights.daysSinceLastVisit > cycleDays + 14) return 0;

  // Check no upcoming appointment
  const appointments = await storage.getAppointmentsByCustomerId(customer.id);
  const hasUpcoming = appointments.some((a: any) => new Date(a.startDate) > new Date() && a.status !== 'cancelled');
  if (hasUpcoming) return 0;

  // Dedup
  const existing = await storage.getPendingMarketingTriggers(1000);
  const hasPending = existing.some(t => t.customerId === customer.id && t.businessId === businessId && t.triggerType === 'REBOOKING_NUDGE');
  if (hasPending) return 0;

  await storage.createMarketingTrigger({
    businessId,
    customerId: customer.id,
    triggerType: 'REBOOKING_NUDGE',
    messageType: 'REBOOKING_NUDGE',
    scheduledFor: new Date(),
    status: 'pending',
  });
  return 1;
}

async function evaluateBirthday(businessId: number, customer: any): Promise<number> {
  if (!customer.birthday) return 0;

  const today = new Date();
  const [mm, dd] = customer.birthday.split('-');
  if ((today.getMonth() + 1) !== parseInt(mm) || today.getDate() !== parseInt(dd)) return 0;

  // Dedup: check if birthday trigger already exists this year
  const existing = await storage.getPendingMarketingTriggers(1000);
  const hasPending = existing.some(t => t.customerId === customer.id && t.businessId === businessId && t.triggerType === 'BIRTHDAY');
  if (hasPending) return 0;

  // Also check outbound messages for birthday sent today
  const today0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const todayMessages = await storage.getOutboundMessages(businessId, { messageType: 'BIRTHDAY', limit: 100 });
  const alreadySent = todayMessages.some((m: any) => m.customerId === customer.id && m.sentAt && new Date(m.sentAt) >= today0);
  if (alreadySent) return 0;

  // Schedule for 9am in business timezone (simplified: use now if already past 9am)
  await storage.createMarketingTrigger({
    businessId,
    customerId: customer.id,
    triggerType: 'BIRTHDAY',
    messageType: 'BIRTHDAY',
    scheduledFor: new Date(),
    status: 'pending',
  });
  return 1;
}

async function evaluateReviewRequest(businessId: number, customer: any): Promise<number> {
  // Find completed appointments from 2-24 hours ago
  const appointments = await storage.getAppointmentsByCustomerId(customer.id);
  const now = Date.now();
  const twoHoursAgo = now - (2 * 60 * 60 * 1000);
  const twentyFourHoursAgo = now - (24 * 60 * 60 * 1000);

  const recentlyCompleted = appointments.filter((a: any) => {
    if (a.status !== 'completed') return false;
    const completedTime = new Date(a.updatedAt || a.endDate || a.startDate).getTime();
    return completedTime > twentyFourHoursAgo && completedTime < twoHoursAgo;
  });

  if (recentlyCompleted.length === 0) return 0;

  // Dedup
  const existing = await storage.getPendingMarketingTriggers(1000);
  const hasPending = existing.some(t => t.customerId === customer.id && t.businessId === businessId && t.triggerType === 'REVIEW_REQUEST');
  if (hasPending) return 0;

  // Check recent outbound for review request
  const recent = await storage.getOutboundMessages(businessId, { messageType: 'REVIEW_REQUEST', limit: 50 });
  const recentlySent = recent.some((m: any) => m.customerId === customer.id && m.sentAt && (now - new Date(m.sentAt).getTime()) < 30 * 24 * 60 * 60 * 1000);
  if (recentlySent) return 0; // Don't re-request within 30 days

  await storage.createMarketingTrigger({
    businessId,
    customerId: customer.id,
    triggerType: 'REVIEW_REQUEST',
    messageType: 'REVIEW_REQUEST',
    scheduledFor: new Date(),
    status: 'pending',
  });
  return 1;
}

async function evaluateEstimateFollowups(businessId: number): Promise<number> {
  let created = 0;
  const quotes = await storage.getAllQuotes(businessId);
  const pendingQuotes = quotes.filter((q: any) => q.status === 'pending');

  for (const quote of pendingQuotes) {
    if (!quote.customerId) continue;
    const ageHours = (Date.now() - new Date(quote.createdAt!).getTime()) / (1000 * 60 * 60);
    if (ageHours < 48) continue; // Wait 48 hours

    // Dedup
    const existing = await storage.getPendingMarketingTriggers(1000);
    const hasPending = existing.some(t => t.customerId === quote.customerId && t.businessId === businessId && t.triggerType === 'ESTIMATE_FOLLOWUP');
    if (hasPending) continue;

    const customer = await storage.getCustomer(quote.customerId);
    if (!customer?.phone || !customer.marketingOptIn) continue;

    await storage.createMarketingTrigger({
      businessId,
      customerId: quote.customerId,
      triggerType: 'ESTIMATE_FOLLOWUP',
      messageType: 'ESTIMATE_FOLLOWUP',
      scheduledFor: new Date(),
      status: 'pending',
      context: { quoteId: quote.id, quoteTotal: quote.total } as any,
    });
    created++;
  }
  return created;
}

// ─── Marketing Opt-In Evaluation ──────────────────────────────────────────────

async function evaluateMarketingOptIn(businessId: number, customer: any): Promise<number> {
  // Find completed appointments from 2+ hours ago
  const appointments = await storage.getAppointmentsByCustomerId(customer.id);
  const now = Date.now();
  const twoHoursAgo = now - (2 * 60 * 60 * 1000);

  const completedAppointments = appointments.filter((a: any) => {
    if (a.status !== 'completed') return false;
    const completedTime = new Date(a.updatedAt || a.endDate || a.startDate).getTime();
    return completedTime < twoHoursAgo; // Completed more than 2 hours ago
  });

  if (completedAppointments.length === 0) return 0;

  // Dedup — check for existing pending trigger
  const existing = await storage.getPendingMarketingTriggers(1000);
  const hasPending = existing.some(t => t.customerId === customer.id && t.businessId === businessId && t.triggerType === 'MARKETING_OPT_IN');
  if (hasPending) return 0;

  // Check if we already sent an opt-in message to this customer (ever)
  const recent = await storage.getOutboundMessages(businessId, { messageType: 'MARKETING_OPT_IN', limit: 100 });
  const alreadySent = recent.some((m: any) => m.customerId === customer.id);
  if (alreadySent) return 0;

  // Schedule for now (the 2-hour delay already passed during evaluation)
  await storage.createMarketingTrigger({
    businessId,
    customerId: customer.id,
    triggerType: 'MARKETING_OPT_IN',
    messageType: 'MARKETING_OPT_IN',
    scheduledFor: new Date(),
    status: 'pending',
  });
  return 1;
}

// ─── Birthday Collection Evaluation ──────────────────────────────────────────

async function evaluateBirthdayCollection(businessId: number, customer: any): Promise<number> {
  // Only collect from customers who completed an appointment 24+ hours ago
  const appointments = await storage.getAppointmentsByCustomerId(customer.id);
  const now = Date.now();
  const twentyFourHoursAgo = now - (24 * 60 * 60 * 1000);

  const completedAppointments = appointments.filter((a: any) => {
    if (a.status !== 'completed') return false;
    const completedTime = new Date(a.updatedAt || a.endDate || a.startDate).getTime();
    return completedTime < twentyFourHoursAgo;
  });

  if (completedAppointments.length === 0) return 0;

  // Dedup
  const existing = await storage.getPendingMarketingTriggers(1000);
  const hasPending = existing.some(t => t.customerId === customer.id && t.businessId === businessId && t.triggerType === 'BIRTHDAY_COLLECTION');
  if (hasPending) return 0;

  // Check if we already sent a birthday collection message (ever)
  const recent = await storage.getOutboundMessages(businessId, { messageType: 'BIRTHDAY_COLLECTION', limit: 100 });
  const alreadySent = recent.some((m: any) => m.customerId === customer.id);
  if (alreadySent) return 0;

  await storage.createMarketingTrigger({
    businessId,
    customerId: customer.id,
    triggerType: 'BIRTHDAY_COLLECTION',
    messageType: 'BIRTHDAY_COLLECTION',
    scheduledFor: new Date(),
    status: 'pending',
  });
  return 1;
}

// ─── Trigger Cancellation (Event-Driven) ─────────────────────────────────────

/**
 * Cancel all pending triggers for a customer. Called when:
 * - Customer books an appointment (cancel WIN_BACK)
 * - Customer confirms (cancel pending reminders)
 * - Customer opts out (cancel ALL)
 */
export async function cancelTriggersOnEvent(
  businessId: number,
  customerId: number,
  event: 'booked' | 'confirmed' | 'opted_out' | 'escalated',
): Promise<number> {
  let cancelled = 0;
  switch (event) {
    case 'booked':
      cancelled = await storage.cancelTriggersForCustomer(businessId, customerId, 'customer_booked');
      break;
    case 'confirmed':
      // Cancel reminder triggers only (not marketing)
      // For now, cancel all — the condition check will handle invalid ones
      cancelled = await storage.cancelTriggersForCustomer(businessId, customerId, 'customer_confirmed');
      break;
    case 'opted_out':
      cancelled = await storage.cancelTriggersForCustomer(businessId, customerId, 'customer_opted_out');
      break;
    case 'escalated':
      cancelled = await storage.cancelTriggersForCustomer(businessId, customerId, 'escalated_to_human');
      break;
  }
  if (cancelled > 0) {
    console.log(`[MarketingTrigger] Cancelled ${cancelled} triggers for customer ${customerId} (event: ${event})`);
  }
  return cancelled;
}

/**
 * Run trigger evaluation for ALL businesses. Called by scheduler.
 */
export async function evaluateAllBusinesses(): Promise<void> {
  try {
    const businesses = await storage.getAllBusinesses();
    let totalCreated = 0;

    for (const business of businesses) {
      try {
        const { created } = await evaluateAndCreateTriggers(business.id);
        totalCreated += created;
        // Rate limit between businesses
        await new Promise(r => setTimeout(r, 500));
      } catch (err) {
        console.error(`[MarketingTrigger] Error evaluating business ${business.id}:`, err);
      }
    }

    if (totalCreated > 0) {
      console.log(`[MarketingTrigger] Created ${totalCreated} new triggers across all businesses`);
    }
  } catch (err) {
    console.error('[MarketingTrigger] Error in evaluateAllBusinesses:', err);
  }
}

export default {
  processReadyTriggers,
  evaluateAndCreateTriggers,
  evaluateAllBusinesses,
  cancelTriggersOnEvent,
};
