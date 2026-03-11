/**
 * Orchestration Service
 *
 * Central event dispatcher for coordinating all agent actions. Instead of agents
 * running on timers and scanning all businesses, events flow here and get routed
 * to the right agent(s) with full context.
 *
 * Events:
 * - intelligence.ready -> post-call follow-up decisions, owner alerts for negative sentiment
 * - appointment.completed -> follow-up + review request
 * - appointment.no_show -> no-show recovery (with VIP detection)
 * - appointment.cancelled -> recalculate customer insights
 * - job.completed -> follow-up + review request
 * - invoice.paid -> recalculate customer insights (LTV update)
 * - conversation.resolved -> release engagement lock
 *
 * Key rules:
 * 1. Never message a customer who is in an active conversation (engagement lock)
 * 2. Prioritize high-value customers for immediate response
 * 3. Coordinate multiple agents so they don't pile on the same customer
 * 4. Log all decisions for auditability
 */

import { storage } from '../storage';

// Event types the orchestrator handles
export type OrchestratorEvent =
  | 'intelligence.ready'
  | 'appointment.completed'
  | 'appointment.no_show'
  | 'appointment.cancelled'
  | 'job.completed'
  | 'invoice.paid'
  | 'conversation.resolved';

interface OrchestratorPayload {
  businessId: number;
  customerId?: number;
  referenceType?: string;
  referenceId?: number;
  callLogId?: number;
  metadata?: Record<string, any>;
}

/**
 * Main dispatch function. Routes events to appropriate handlers.
 * Fire-and-forget — never blocks the caller.
 *
 * Strategy: Try LangGraph state machine first. If it's not available or fails,
 * fall back to the existing switch/case handlers (zero downtime risk).
 */
export async function dispatchEvent(
  event: OrchestratorEvent,
  payload: OrchestratorPayload
): Promise<void> {
  try {
    console.log(`[Orchestrator] Event: ${event} for business ${payload.businessId}, customer ${payload.customerId || 'unknown'}`);

    // Try LangGraph-based routing first
    try {
      const { isGraphReady, invokeAgentGraph } = await import('./agentGraph');
      if (isGraphReady()) {
        const result = await invokeAgentGraph(event, payload);
        console.log(`[Orchestrator] LangGraph handled ${event}: ${result.action || 'done'}`);
        return; // LangGraph handled it — no need for fallback
      }
    } catch (err) {
      console.warn(`[Orchestrator] LangGraph failed for ${event}, falling back to switch/case:`, (err as Error).message);
    }

    // Fallback: existing switch/case handlers (always available)

    switch (event) {
      case 'intelligence.ready':
        await handleIntelligenceReady(payload);
        break;
      case 'appointment.completed':
        await handleAppointmentCompleted(payload);
        break;
      case 'appointment.no_show':
        await handleNoShow(payload);
        break;
      case 'appointment.cancelled':
        await handleAppointmentCancelled(payload);
        break;
      case 'job.completed':
        await handleJobCompleted(payload);
        break;
      case 'invoice.paid':
        await handleInvoicePaid(payload);
        break;
      case 'conversation.resolved':
        await handleConversationResolved(payload);
        break;
      default:
        console.log(`[Orchestrator] No handler for event: ${event}`);
    }
  } catch (err) {
    console.error(`[Orchestrator] Error handling ${event}:`, err);
  }
}

/**
 * Store an event memory in Mem0. Fire-and-forget — never blocks the caller.
 */
function storeEventMemory(businessId: number, customerId: number, content: string): void {
  import('./mem0Service').then(({ addMemory }) => {
    addMemory(
      businessId,
      customerId,
      [{ role: 'assistant', content }],
      { type: 'orchestrator_event', timestamp: new Date().toISOString() }
    ).catch(err => console.error('[Mem0] Error storing event memory:', err));
  }).catch(() => { /* mem0 import failed — graceful degradation */ });
}

/**
 * Check if a customer has an active engagement lock.
 * Returns true if locked (should skip messaging).
 */
async function isCustomerLocked(customerId: number | undefined, businessId: number): Promise<boolean> {
  if (!customerId) return false;
  try {
    const lock = await storage.getEngagementLock(customerId, businessId);
    if (lock) {
      console.log(`[Orchestrator] Customer ${customerId} locked by ${lock.lockedByAgent} (expires ${lock.expiresAt}) — skipping`);
      return true;
    }
  } catch { /* best effort */ }
  return false;
}

/**
 * After call intelligence is extracted, decide what agents need to act.
 * - Negative sentiment + follow-up needed -> trigger immediate follow-up
 * - Recalculate customer insights
 */
async function handleIntelligenceReady(payload: OrchestratorPayload): Promise<void> {
  const { businessId, callLogId, customerId } = payload;
  if (!callLogId) return;

  const intelligence = await storage.getCallIntelligence(callLogId);
  if (!intelligence || intelligence.processingStatus !== 'completed') return;

  // Check if customer has engagement lock
  if (await isCustomerLocked(customerId, businessId)) return;

  // If follow-up is needed and caller was upset, log it for the morning brief
  // Note: follow-up agent requires a job/appointment ID, not a call ID.
  // Until we have a call-based follow-up path, we flag it for the owner's attention.
  if (intelligence.followUpNeeded && intelligence.sentiment && intelligence.sentiment <= 2) {
    console.log(`[Orchestrator] Urgent follow-up flagged for call ${callLogId}: sentiment=${intelligence.sentiment}, type=${intelligence.followUpType}`);
    // No lock needed — we're not messaging the customer, just flagging for morning brief
  }
}

/**
 * After an appointment is completed, trigger follow-up agent.
 */
async function handleAppointmentCompleted(payload: OrchestratorPayload): Promise<void> {
  const { businessId, customerId, referenceId } = payload;
  if (!referenceId) return;

  if (await isCustomerLocked(customerId, businessId)) return;

  // Acquire engagement lock before triggering follow-up
  if (customerId) {
    const lockResult = await storage.acquireEngagementLock(
      businessId, customerId, '', 'follow_up', 30
    );
    if (!lockResult.acquired) return;
  }

  // Store appointment completion memory in Mem0 (fire-and-forget)
  if (customerId) {
    storeEventMemory(businessId, customerId, `Customer completed an appointment (appointment #${referenceId}).`);
  }

  try {
    const { isAgentEnabled } = await import('./agentSettingsService');
    if (await isAgentEnabled(businessId, 'follow_up')) {
      const { triggerFollowUp } = await import('./followUpAgentService');
      await triggerFollowUp('appointment', referenceId, businessId);
    }
  } catch (err) {
    console.error(`[Orchestrator] Error triggering follow-up for appointment ${referenceId}:`, err);
    // Release lock on failure
    if (customerId) {
      await storage.releaseEngagementLock(customerId, businessId).catch(() => {});
    }
  }
}

/**
 * Handle no-show with context-aware response.
 */
async function handleNoShow(payload: OrchestratorPayload): Promise<void> {
  const { businessId, customerId, referenceId } = payload;
  if (!referenceId) return;

  if (await isCustomerLocked(customerId, businessId)) return;

  // Get customer insights for context-aware logging
  let insights = null;
  if (customerId) {
    try {
      insights = await storage.getCustomerInsights(customerId, businessId);
    } catch { /* best effort */ }
  }

  const isHighValue = insights && (insights.lifetimeValue || 0) > 500;
  const isRepeatNoShow = insights && (insights.noShowCount || 0) >= 2;

  if (isHighValue) {
    console.log(`[Orchestrator] High-value customer no-show (LTV=$${insights!.lifetimeValue}) — appointment ${referenceId}`);
  }
  if (isRepeatNoShow) {
    console.log(`[Orchestrator] Repeat no-show (count=${insights!.noShowCount}) — appointment ${referenceId}`);
  }

  // Store no-show memory in Mem0 (fire-and-forget)
  if (customerId) {
    const noShowContext = [
      `Customer was a no-show for appointment #${referenceId}`,
      isHighValue ? `(high-value customer, LTV=$${insights!.lifetimeValue})` : null,
      isRepeatNoShow ? `(repeat no-show, count=${insights!.noShowCount})` : null,
    ].filter(Boolean).join(' ');
    storeEventMemory(businessId, customerId, noShowContext);
  }

  // Acquire engagement lock before triggering no-show recovery
  if (customerId) {
    const lockResult = await storage.acquireEngagementLock(
      businessId, customerId, '', 'no_show', 60 // 60 min lock for no-show conversations
    );
    if (!lockResult.acquired) return;
  }

  try {
    const { isAgentEnabled } = await import('./agentSettingsService');
    if (await isAgentEnabled(businessId, 'no_show')) {
      const { triggerNoShowSms } = await import('./noShowAgentService');
      await triggerNoShowSms(referenceId, businessId);
    }
  } catch (err) {
    console.error(`[Orchestrator] Error triggering no-show for appointment ${referenceId}:`, err);
    if (customerId) {
      await storage.releaseEngagementLock(customerId, businessId).catch(() => {});
    }
  }
}

/**
 * When an appointment is cancelled, recalculate customer insights.
 */
async function handleAppointmentCancelled(payload: OrchestratorPayload): Promise<void> {
  const { businessId, customerId } = payload;
  if (!customerId) return;

  // Store cancellation memory in Mem0 (fire-and-forget)
  storeEventMemory(businessId, customerId, 'Customer cancelled an appointment.');

  // Recalculate customer insights (cancellation affects reliability score)
  try {
    const { recalculateCustomerInsights } = await import('./customerInsightsService');
    await recalculateCustomerInsights(customerId, businessId);
    console.log(`[Orchestrator] Recalculated insights for cancelled appointment — customer ${customerId}`);
  } catch (err) {
    console.error(`[Orchestrator] Error recalculating insights after cancellation:`, err);
  }
}

/**
 * After a job is completed, trigger follow-up agent.
 */
async function handleJobCompleted(payload: OrchestratorPayload): Promise<void> {
  const { businessId, customerId, referenceId } = payload;
  if (!referenceId) return;

  if (await isCustomerLocked(customerId, businessId)) return;

  // Acquire engagement lock
  if (customerId) {
    const lockResult = await storage.acquireEngagementLock(
      businessId, customerId, '', 'follow_up', 30
    );
    if (!lockResult.acquired) return;
  }

  try {
    const { isAgentEnabled } = await import('./agentSettingsService');
    if (await isAgentEnabled(businessId, 'follow_up')) {
      const { triggerFollowUp } = await import('./followUpAgentService');
      await triggerFollowUp('job', referenceId, businessId);
    }
  } catch (err) {
    console.error(`[Orchestrator] Error triggering follow-up for job ${referenceId}:`, err);
    if (customerId) {
      await storage.releaseEngagementLock(customerId, businessId).catch(() => {});
    }
  }
}

/**
 * When an invoice is paid, recalculate customer insights (LTV update).
 */
async function handleInvoicePaid(payload: OrchestratorPayload): Promise<void> {
  const { businessId, customerId } = payload;
  if (!customerId) return;

  try {
    const { recalculateCustomerInsights } = await import('./customerInsightsService');
    await recalculateCustomerInsights(customerId, businessId);
    console.log(`[Orchestrator] Recalculated insights for paid invoice — customer ${customerId}`);
  } catch (err) {
    console.error(`[Orchestrator] Error recalculating insights after payment:`, err);
  }
}

/**
 * When an SMS conversation resolves, release engagement lock.
 */
async function handleConversationResolved(payload: OrchestratorPayload): Promise<void> {
  const { businessId, customerId, metadata } = payload;
  if (!customerId) return;

  // Store conversation resolution memory in Mem0 (fire-and-forget)
  const outcome = metadata?.outcome || 'resolved';
  storeEventMemory(businessId, customerId, `SMS conversation ${outcome}.`);

  try {
    await storage.releaseEngagementLock(customerId, businessId);
    console.log(`[Orchestrator] Released engagement lock for customer ${customerId}`);
  } catch (err) {
    console.error(`[Orchestrator] Error releasing engagement lock for customer ${customerId}:`, err);
  }
}
