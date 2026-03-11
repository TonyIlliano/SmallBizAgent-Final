/**
 * Agent Graph — LangGraph.js State Machine Orchestration
 *
 * Replaces the switch/case event dispatcher in orchestrationService.ts with a
 * proper state graph. Each orchestrator event flows through:
 *
 *   START → check_lock → load_context → route →
 *     ├─ (appointment.completed) → acquire_lock → follow_up → log_result → END
 *     ├─ (appointment.no_show) → acquire_lock → no_show_recovery → log_result → END
 *     ├─ (appointment.cancelled) → recalculate_insights → log_result → END
 *     ├─ (job.completed) → acquire_lock → follow_up → log_result → END
 *     ├─ (intelligence.ready) → [conditional] → log_result → END
 *     ├─ (invoice.paid) → recalculate_insights → log_result → END
 *     └─ (conversation.resolved) → release_lock → log_result → END
 *
 *   If check_lock finds customer locked → skip_locked → END
 *
 * PostgreSQL checkpointing via @langchain/langgraph-checkpoint-postgres.
 * Falls back gracefully if LangGraph is unavailable — orchestrationService
 * keeps its existing switch/case as backup.
 */

import { Annotation, StateGraph, START, END } from '@langchain/langgraph';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';
import { storage } from '../storage';

// ============================================================
// State Schema
// ============================================================

const AgentState = Annotation.Root({
  // Input fields (set by caller)
  event: Annotation<string>,
  businessId: Annotation<number>,
  customerId: Annotation<number | undefined>,
  referenceType: Annotation<string | undefined>,
  referenceId: Annotation<number | undefined>,
  callLogId: Annotation<number | undefined>,
  metadata: Annotation<Record<string, any> | undefined>,

  // Context fields (set by nodes)
  isLocked: Annotation<boolean>,
  customerInsights: Annotation<any>,
  agentEnabled: Annotation<Record<string, boolean>>,

  // Result (set by action nodes)
  result: Annotation<string>,
  action: Annotation<string>,
});

type AgentStateType = typeof AgentState.State;

// ============================================================
// Graph Nodes
// ============================================================

/**
 * Check if the customer has an active engagement lock.
 */
async function checkLock(state: AgentStateType): Promise<Partial<AgentStateType>> {
  const { customerId, businessId } = state;
  if (!customerId) {
    return { isLocked: false };
  }

  try {
    const lock = await storage.getEngagementLock(customerId, businessId);
    if (lock) {
      console.log(`[AgentGraph] Customer ${customerId} locked by ${lock.lockedByAgent} — skipping`);
      return { isLocked: true };
    }
  } catch { /* best effort */ }

  return { isLocked: false };
}

/**
 * Load customer insights and agent settings for context-aware routing.
 */
async function loadContext(state: AgentStateType): Promise<Partial<AgentStateType>> {
  const { customerId, businessId } = state;

  let customerInsights: any = null;
  const agentEnabled: Record<string, boolean> = {};

  // Load customer insights if we have a customer
  if (customerId) {
    try {
      customerInsights = await storage.getCustomerInsights(customerId, businessId);
    } catch { /* best effort */ }
  }

  // Load agent enabled states
  try {
    const { isAgentEnabled } = await import('./agentSettingsService');
    const [followUp, noShow] = await Promise.all([
      isAgentEnabled(businessId, 'follow_up').catch(() => false),
      isAgentEnabled(businessId, 'no_show').catch(() => false),
    ]);
    agentEnabled.follow_up = followUp;
    agentEnabled.no_show = noShow;
  } catch { /* best effort */ }

  return { customerInsights, agentEnabled };
}

/**
 * Acquire engagement lock before messaging a customer.
 */
async function acquireLock(state: AgentStateType): Promise<Partial<AgentStateType>> {
  const { businessId, customerId, event } = state;
  if (!customerId) {
    return { result: 'No customer ID — skipping lock acquisition' };
  }

  const agentType = event.includes('no_show') ? 'no_show' : 'follow_up';
  const ttlMinutes = agentType === 'no_show' ? 60 : 30;

  try {
    const lockResult = await storage.acquireEngagementLock(
      businessId, customerId, '', agentType, ttlMinutes
    );
    if (!lockResult.acquired) {
      return { isLocked: true, result: `Could not acquire lock — customer ${customerId} already locked` };
    }
    return { result: `Lock acquired for ${agentType} (${ttlMinutes}min)` };
  } catch (err) {
    return { result: `Lock acquisition error: ${(err as Error).message}` };
  }
}

/**
 * Trigger follow-up SMS for completed appointment or job.
 */
async function followUp(state: AgentStateType): Promise<Partial<AgentStateType>> {
  const { businessId, referenceId, referenceType, agentEnabled, customerId } = state;

  if (!referenceId || !agentEnabled.follow_up) {
    return { action: 'follow_up_skipped', result: 'Follow-up agent disabled or no reference ID' };
  }

  try {
    const { triggerFollowUp } = await import('./followUpAgentService');
    const type = referenceType === 'job' ? 'job' : 'appointment';
    await triggerFollowUp(type, referenceId, businessId);

    // Store memory in Mem0
    if (customerId) {
      storeMem0Event(businessId, customerId, `Customer completed ${type} #${referenceId}.`);
    }

    return { action: 'follow_up_sent', result: `Follow-up triggered for ${type} ${referenceId}` };
  } catch (err) {
    // Release lock on failure
    if (customerId) {
      await storage.releaseEngagementLock(customerId, businessId).catch(() => {});
    }
    return { action: 'follow_up_error', result: `Error: ${(err as Error).message}` };
  }
}

/**
 * Trigger no-show recovery SMS.
 */
async function noShowRecovery(state: AgentStateType): Promise<Partial<AgentStateType>> {
  const { businessId, referenceId, agentEnabled, customerId, customerInsights } = state;

  if (!referenceId || !agentEnabled.no_show) {
    return { action: 'no_show_skipped', result: 'No-show agent disabled or no reference ID' };
  }

  // Log context-aware details
  const isHighValue = customerInsights && (customerInsights.lifetimeValue || 0) > 500;
  const isRepeatNoShow = customerInsights && (customerInsights.noShowCount || 0) >= 2;

  if (isHighValue) {
    console.log(`[AgentGraph] High-value customer no-show (LTV=$${customerInsights.lifetimeValue})`);
  }
  if (isRepeatNoShow) {
    console.log(`[AgentGraph] Repeat no-show (count=${customerInsights.noShowCount})`);
  }

  try {
    const { triggerNoShowSms } = await import('./noShowAgentService');
    await triggerNoShowSms(referenceId, businessId);

    // Store memory in Mem0
    if (customerId) {
      const context = [
        `Customer was a no-show for appointment #${referenceId}`,
        isHighValue ? `(high-value, LTV=$${customerInsights.lifetimeValue})` : null,
        isRepeatNoShow ? `(repeat no-show, count=${customerInsights.noShowCount})` : null,
      ].filter(Boolean).join(' ');
      storeMem0Event(businessId, customerId, context);
    }

    return { action: 'no_show_recovery_sent', result: `No-show recovery triggered for appointment ${referenceId}` };
  } catch (err) {
    if (customerId) {
      await storage.releaseEngagementLock(customerId, businessId).catch(() => {});
    }
    return { action: 'no_show_error', result: `Error: ${(err as Error).message}` };
  }
}

/**
 * Recalculate customer insights (after cancellation, invoice payment, etc.).
 */
async function recalculateInsights(state: AgentStateType): Promise<Partial<AgentStateType>> {
  const { businessId, customerId, event } = state;

  if (!customerId) {
    return { action: 'insights_skipped', result: 'No customer ID' };
  }

  try {
    const { recalculateCustomerInsights } = await import('./customerInsightsService');
    await recalculateCustomerInsights(customerId, businessId);

    // Store memory for cancellations
    if (event === 'appointment.cancelled') {
      storeMem0Event(businessId, customerId, 'Customer cancelled an appointment.');
    }

    return { action: 'insights_recalculated', result: `Insights recalculated for customer ${customerId} (${event})` };
  } catch (err) {
    return { action: 'insights_error', result: `Error: ${(err as Error).message}` };
  }
}

/**
 * Release engagement lock when a conversation resolves.
 */
async function releaseLock(state: AgentStateType): Promise<Partial<AgentStateType>> {
  const { businessId, customerId, metadata } = state;

  if (!customerId) {
    return { action: 'lock_release_skipped', result: 'No customer ID' };
  }

  // Store conversation resolution memory
  const outcome = metadata?.outcome || 'resolved';
  storeMem0Event(businessId, customerId, `SMS conversation ${outcome}.`);

  try {
    await storage.releaseEngagementLock(customerId, businessId);
    return { action: 'lock_released', result: `Engagement lock released for customer ${customerId}` };
  } catch (err) {
    return { action: 'lock_release_error', result: `Error: ${(err as Error).message}` };
  }
}

/**
 * Handle intelligence.ready — urgent follow-up for negative sentiment calls.
 */
async function handleIntelligence(state: AgentStateType): Promise<Partial<AgentStateType>> {
  const { businessId, callLogId, customerId, agentEnabled } = state;

  if (!callLogId) {
    return { action: 'intelligence_skipped', result: 'No call log ID' };
  }

  try {
    const intelligence = await storage.getCallIntelligence(callLogId);
    if (!intelligence || intelligence.processingStatus !== 'completed') {
      return { action: 'intelligence_not_ready', result: `Intelligence not ready for call ${callLogId}` };
    }

    // Flag urgent follow-ups (negative sentiment) for morning brief
    // Note: No lock needed — we're only flagging, not messaging the customer
    if (intelligence.followUpNeeded && intelligence.sentiment && intelligence.sentiment <= 2) {
      console.log(`[AgentGraph] Urgent: negative sentiment call ${callLogId} needs ${intelligence.followUpType} follow-up`);
      return {
        action: 'urgent_follow_up_flagged',
        result: `Urgent follow-up flagged: call ${callLogId}, sentiment=${intelligence.sentiment}, type=${intelligence.followUpType}`,
      };
    }

    return { action: 'intelligence_processed', result: `Intelligence processed for call ${callLogId} (no urgent action needed)` };
  } catch (err) {
    return { action: 'intelligence_error', result: `Error: ${(err as Error).message}` };
  }
}

/**
 * Log the final result (terminal node before END).
 */
async function logResult(state: AgentStateType): Promise<Partial<AgentStateType>> {
  console.log(`[AgentGraph] ${state.event} → ${state.action || 'completed'}: ${state.result || 'ok'}`);
  return {};
}

/**
 * Node for when customer is locked — just log and exit.
 */
async function skipLocked(state: AgentStateType): Promise<Partial<AgentStateType>> {
  return {
    action: 'skipped_locked',
    result: `Customer ${state.customerId} is locked — skipping ${state.event}`,
  };
}

// ============================================================
// Helper: Mem0 fire-and-forget
// ============================================================

function storeMem0Event(businessId: number, customerId: number, content: string): void {
  import('./mem0Service').then(({ addMemory }) => {
    addMemory(
      businessId,
      customerId,
      [{ role: 'assistant', content }],
      { type: 'agent_graph_event', timestamp: new Date().toISOString() }
    ).catch(() => {});
  }).catch(() => {});
}

// ============================================================
// Routing Logic
// ============================================================

/**
 * After check_lock: route to load_context (if unlocked) or skip_locked.
 */
function routeAfterLockCheck(state: AgentStateType): string {
  if (state.isLocked) return 'skip_locked';

  // Events that don't need context loading (simple operations)
  if (state.event === 'conversation.resolved') return 'release_lock';

  return 'load_context';
}

/**
 * After load_context: route based on event type.
 */
function routeAfterContext(state: AgentStateType): string {
  switch (state.event) {
    case 'appointment.completed':
    case 'job.completed':
      return 'acquire_lock';
    case 'appointment.no_show':
      return 'acquire_lock';
    case 'appointment.cancelled':
    case 'invoice.paid':
      return 'recalculate_insights';
    case 'intelligence.ready':
      return 'handle_intelligence';
    default:
      return 'log_result';
  }
}

/**
 * After acquire_lock: route based on event type (follow-up vs no-show).
 * If lock acquisition failed, go straight to log_result.
 */
function routeAfterLock(state: AgentStateType): string {
  if (state.isLocked) return 'log_result'; // Lock failed

  if (state.event === 'appointment.no_show') return 'no_show_recovery';
  return 'follow_up';
}

// ============================================================
// Graph Construction
// ============================================================

let compiledGraph: any = null;
let graphReady = false;

/**
 * Build and compile the agent graph.
 * Must be called once on server startup.
 */
export async function initAgentGraph(): Promise<void> {
  try {
    const graph = new StateGraph(AgentState)
      // Add all nodes
      .addNode('check_lock', checkLock)
      .addNode('load_context', loadContext)
      .addNode('acquire_lock', acquireLock)
      .addNode('follow_up', followUp)
      .addNode('no_show_recovery', noShowRecovery)
      .addNode('recalculate_insights', recalculateInsights)
      .addNode('release_lock', releaseLock)
      .addNode('handle_intelligence', handleIntelligence)
      .addNode('log_result', logResult)
      .addNode('skip_locked', skipLocked)

      // Entry edge
      .addEdge(START, 'check_lock')

      // After lock check: branch on locked status
      .addConditionalEdges('check_lock', routeAfterLockCheck)

      // After context loading: branch on event type
      .addConditionalEdges('load_context', routeAfterContext)

      // After lock acquisition: branch on event type + lock result
      .addConditionalEdges('acquire_lock', routeAfterLock)

      // Terminal edges: all action nodes → log_result → END
      .addEdge('follow_up', 'log_result')
      .addEdge('no_show_recovery', 'log_result')
      .addEdge('recalculate_insights', 'log_result')
      .addEdge('release_lock', 'log_result')
      .addEdge('handle_intelligence', 'log_result')
      .addEdge('skip_locked', 'log_result')
      .addEdge('log_result', END);

    // Set up PostgreSQL checkpointer if DATABASE_URL is available
    const databaseUrl = process.env.DATABASE_URL;
    if (databaseUrl) {
      try {
        const checkpointer = PostgresSaver.fromConnString(databaseUrl);
        await checkpointer.setup();
        compiledGraph = graph.compile({ checkpointer });
        console.log('[AgentGraph] Compiled with PostgreSQL checkpointing');
      } catch (err) {
        console.warn('[AgentGraph] PostgreSQL checkpointer failed, using in-memory:', (err as Error).message);
        // Fall back to compiling without checkpointer
        compiledGraph = graph.compile();
      }
    } else {
      compiledGraph = graph.compile();
      console.log('[AgentGraph] Compiled without checkpointer (no DATABASE_URL)');
    }

    graphReady = true;
    console.log('[AgentGraph] Agent graph initialized successfully');
  } catch (err) {
    console.error('[AgentGraph] Failed to initialize:', err);
    graphReady = false;
  }
}

/**
 * Check if the agent graph is available for use.
 */
export function isGraphReady(): boolean {
  return graphReady && compiledGraph !== null;
}

/**
 * Invoke the agent graph with an orchestrator event.
 * Returns the final state, or throws if the graph is not available.
 */
export async function invokeAgentGraph(
  event: string,
  payload: {
    businessId: number;
    customerId?: number;
    referenceType?: string;
    referenceId?: number;
    callLogId?: number;
    metadata?: Record<string, any>;
  }
): Promise<AgentStateType> {
  if (!compiledGraph) {
    throw new Error('Agent graph not initialized');
  }

  const threadId = `evt_${event}_${payload.businessId}_${payload.customerId || 0}_${Date.now()}`;

  const result = await compiledGraph.invoke(
    {
      event,
      businessId: payload.businessId,
      customerId: payload.customerId,
      referenceType: payload.referenceType,
      referenceId: payload.referenceId,
      callLogId: payload.callLogId,
      metadata: payload.metadata,
      // Initialize context fields
      isLocked: false,
      customerInsights: null,
      agentEnabled: {},
      result: '',
      action: '',
    },
    {
      configurable: { thread_id: threadId },
    }
  );

  return result;
}
