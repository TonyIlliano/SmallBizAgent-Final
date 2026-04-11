/**
 * Workflow Engine
 *
 * Core engine for user-configured automation workflows.
 * Workflows are sequences of steps (wait, send_sms) triggered by business events.
 *
 * Execution flow:
 * 1. Orchestrator fires event (e.g., appointment.completed)
 * 2. startWorkflowRun() creates a run and advances to first step
 * 3. Wait steps set nextStepAt — scheduler picks them up later
 * 4. SMS steps create marketing_trigger rows — existing trigger engine sends them
 * 5. After trigger sends, trigger engine calls advanceWorkflowRun() → next step
 * 6. Run completes when all steps are done
 */

import { storage } from '../storage';
import type { Workflow, WorkflowRun } from '@shared/schema';

// ─── Step Types ──────────────────────────────────────────────────────────────

interface WaitStep {
  type: 'wait';
  config: {
    delayMinutes: number; // e.g., 120 = 2h, 4320 = 3d
  };
}

interface SendSmsStep {
  type: 'send_sms';
  config: {
    messageType: string; // Maps to MessageType enum
    messagePrompt?: string; // Optional AI prompt hint
  };
}

type WorkflowStep = WaitStep | SendSmsStep;

// ─── Templates ───────────────────────────────────────────────────────────────

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  triggerEvent: string;
  steps: WorkflowStep[];
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'post_appointment_followup',
    name: 'Post-Appointment Follow-Up',
    description: 'Thank the customer after their appointment, then request a review 3 days later.',
    triggerEvent: 'appointment.completed',
    steps: [
      { type: 'wait', config: { delayMinutes: 120 } }, // 2 hours
      { type: 'send_sms', config: { messageType: 'FOLLOW_UP_THANK_YOU', messagePrompt: 'Thank the customer for visiting and mention what service they had.' } },
      { type: 'wait', config: { delayMinutes: 4320 } }, // 3 days
      { type: 'send_sms', config: { messageType: 'REVIEW_REQUEST', messagePrompt: 'Ask for a Google review. Keep it short and appreciative.' } },
    ],
  },
  {
    id: 'no_show_recovery',
    name: 'No-Show Recovery',
    description: 'Reach out to no-show customers with a follow-up, then offer rebooking.',
    triggerEvent: 'appointment.no_show',
    steps: [
      { type: 'wait', config: { delayMinutes: 30 } }, // 30 minutes
      { type: 'send_sms', config: { messageType: 'NO_SHOW_FOLLOWUP', messagePrompt: 'We missed you today! Hope everything is okay. Let us know if you would like to reschedule.' } },
      { type: 'wait', config: { delayMinutes: 2880 } }, // 2 days
      { type: 'send_sms', config: { messageType: 'REBOOKING_NUDGE', messagePrompt: 'Offer to reschedule the missed appointment. Be warm, not pushy.' } },
    ],
  },
  {
    id: 'job_completion_flow',
    name: 'Job Completion Flow',
    description: 'Full follow-up after job completion: thank you, review request, and rebooking offer.',
    triggerEvent: 'job.completed',
    steps: [
      { type: 'wait', config: { delayMinutes: 60 } }, // 1 hour
      { type: 'send_sms', config: { messageType: 'FOLLOW_UP_THANK_YOU', messagePrompt: 'Thank the customer for choosing us for the job.' } },
      { type: 'wait', config: { delayMinutes: 10080 } }, // 7 days
      { type: 'send_sms', config: { messageType: 'REVIEW_REQUEST', messagePrompt: 'Ask for a review of the completed job.' } },
      { type: 'wait', config: { delayMinutes: 20160 } }, // 14 days
      { type: 'send_sms', config: { messageType: 'REBOOKING_NUDGE', messagePrompt: 'Check if they need any follow-up service or maintenance.' } },
    ],
  },
  {
    id: 'invoice_collection',
    name: 'Invoice Collection',
    description: 'Escalating reminders for overdue invoices at Day 1, 2, 4, and 7.',
    triggerEvent: 'invoice.overdue',
    steps: [
      { type: 'send_sms', config: { messageType: 'INVOICE_COLLECTION_REMINDER', messagePrompt: 'Friendly reminder about the outstanding invoice. Include the payment link.' } },
      { type: 'wait', config: { delayMinutes: 2880 } }, // 2 days
      { type: 'send_sms', config: { messageType: 'INVOICE_COLLECTION_REMINDER', messagePrompt: 'Second reminder about the invoice. Still friendly but note it is overdue.' } },
      { type: 'wait', config: { delayMinutes: 2880 } }, // 2 more days (day 4)
      { type: 'send_sms', config: { messageType: 'INVOICE_COLLECTION_REMINDER', messagePrompt: 'Third reminder. More direct — ask them to take care of this soon.' } },
      { type: 'wait', config: { delayMinutes: 4320 } }, // 3 more days (day 7)
      { type: 'send_sms', config: { messageType: 'INVOICE_COLLECTION_FINAL', messagePrompt: 'Final notice about the overdue invoice. Firm but professional.' } },
    ],
  },
  {
    id: 'rebooking_drip',
    name: 'Rebooking Drip',
    description: 'Post-service sequence: thank you, rebooking nudge after 21 days, then upsell.',
    triggerEvent: 'appointment.completed',
    steps: [
      { type: 'wait', config: { delayMinutes: 120 } }, // 2 hours
      { type: 'send_sms', config: { messageType: 'FOLLOW_UP_THANK_YOU', messagePrompt: 'Quick thank you after their visit.' } },
      { type: 'wait', config: { delayMinutes: 30240 } }, // 21 days
      { type: 'send_sms', config: { messageType: 'REBOOKING_NUDGE', messagePrompt: 'Time for another visit? Mention their usual service.' } },
      { type: 'wait', config: { delayMinutes: 10080 } }, // 7 more days (28 total)
      { type: 'send_sms', config: { messageType: 'FOLLOW_UP_UPSELL', messagePrompt: 'Suggest a complementary service they have not tried yet.' } },
    ],
  },
];

// ─── Core Functions ──────────────────────────────────────────────────────────

/**
 * Start a new workflow run for a customer.
 * Deduplicates: won't create if the same workflow+customer already has an active run.
 */
export async function startWorkflowRun(
  workflowId: number,
  businessId: number,
  customerId: number,
  refType?: string,
  refId?: number,
): Promise<WorkflowRun | null> {
  try {
    // Load workflow
    const workflow = await storage.getWorkflow(workflowId, businessId);
    if (!workflow || workflow.status !== 'active') {
      console.log(`[WorkflowEngine] Workflow ${workflowId} not found or not active`);
      return null;
    }

    const steps = (workflow.steps || []) as WorkflowStep[];
    if (steps.length === 0) {
      console.log(`[WorkflowEngine] Workflow ${workflowId} has no steps`);
      return null;
    }

    // Dedup: skip if same workflow+customer already has an active run
    const existing = await storage.getActiveRunsForCustomer(customerId, businessId, workflowId);
    if (existing.length > 0) {
      console.log(`[WorkflowEngine] Customer ${customerId} already has active run for workflow ${workflowId} — skipping`);
      return null;
    }

    // Build context
    const context: Record<string, any> = {};
    if (refType) context.triggerReferenceType = refType;
    if (refId) context.triggerReferenceId = refId;

    // Create run
    const run = await storage.createWorkflowRun({
      workflowId,
      businessId,
      customerId,
      triggerReferenceType: refType || null,
      triggerReferenceId: refId || null,
      currentStep: 0,
      status: 'active',
      context,
      startedAt: new Date(),
    });

    console.log(`[WorkflowEngine] Started run ${run.id} for workflow "${workflow.name}" (customer ${customerId})`);

    // Advance to execute step 0
    await advanceWorkflowRun(run.id);

    return run;
  } catch (err) {
    console.error(`[WorkflowEngine] Error starting run for workflow ${workflowId}:`, err);
    return null;
  }
}

/**
 * Advance a workflow run to execute the current step.
 * Called after a wait expires or after startWorkflowRun.
 */
export async function advanceWorkflowRun(runId: number): Promise<void> {
  try {
    const run = await storage.getWorkflowRun(runId);
    if (!run || run.status !== 'active') return;

    // Load workflow to get steps
    const workflow = await storage.getWorkflow(run.workflowId, run.businessId);
    if (!workflow) {
      console.error(`[WorkflowEngine] Workflow ${run.workflowId} not found for run ${runId}`);
      await storage.updateWorkflowRun(runId, { status: 'failed', cancelReason: 'workflow_not_found' });
      return;
    }

    const steps = (workflow.steps || []) as WorkflowStep[];
    const stepIndex = run.currentStep || 0;

    // Past last step? Mark completed.
    if (stepIndex >= steps.length) {
      await storage.updateWorkflowRun(runId, {
        status: 'completed',
        completedAt: new Date(),
        nextStepAt: null,
      });
      console.log(`[WorkflowEngine] Run ${runId} completed (all ${steps.length} steps done)`);
      return;
    }

    const step = steps[stepIndex];
    console.log(`[WorkflowEngine] Run ${runId} executing step ${stepIndex}: ${step.type}`);

    switch (step.type) {
      case 'wait': {
        const delayMs = (step.config.delayMinutes || 1) * 60 * 1000;
        const nextStepAt = new Date(Date.now() + delayMs);
        // Set nextStepAt and increment step — scheduler will pick up when time arrives
        await storage.updateWorkflowRun(runId, {
          currentStep: stepIndex + 1,
          nextStepAt,
        });
        console.log(`[WorkflowEngine] Run ${runId} waiting until ${nextStepAt.toISOString()}`);
        break;
      }

      case 'send_sms': {
        // Create a marketing_trigger row linked to this workflow run.
        // The existing marketing trigger engine will process and send it.
        try {
          await storage.createMarketingTrigger({
            businessId: run.businessId,
            customerId: run.customerId,
            triggerType: 'WORKFLOW_STEP',
            messageType: step.config.messageType,
            scheduledFor: new Date(), // Send immediately
            status: 'pending',
            context: {
              workflowRunId: run.id,
              workflowName: workflow.name,
              messagePrompt: step.config.messagePrompt || null,
              ...(typeof run.context === 'object' && run.context !== null ? run.context as Record<string, any> : {}),
            },
            workflowRunId: run.id,
          });

          // Move to the next step immediately — trigger engine will send the SMS.
          // When the trigger is processed, the trigger engine will call advanceWorkflowRun().
          // For now, we increment step here. The next step (usually a wait) will be
          // advanced by the scheduler when nextStepAt arrives.
          await storage.updateWorkflowRun(runId, {
            currentStep: stepIndex + 1,
            nextStepAt: null, // Will be set by the next step if it's a wait
          });

          // Immediately try to advance to the next step in case it's another send_sms
          // (but if it's a wait, it will set nextStepAt and stop)
          await advanceWorkflowRun(runId);
        } catch (err) {
          console.error(`[WorkflowEngine] Error creating trigger for run ${runId} step ${stepIndex}:`, err);
          await storage.updateWorkflowRun(runId, { status: 'failed', cancelReason: 'trigger_creation_error' });
        }
        break;
      }

      default:
        console.error(`[WorkflowEngine] Unknown step type: ${(step as any).type}`);
        // Skip unknown steps
        await storage.updateWorkflowRun(runId, { currentStep: stepIndex + 1 });
        await advanceWorkflowRun(runId);
    }
  } catch (err) {
    console.error(`[WorkflowEngine] Error advancing run ${runId}:`, err);
  }
}

/**
 * Process all due workflow runs. Called by scheduler every 60 seconds.
 * Picks up runs whose nextStepAt has passed and advances them.
 */
export async function processWorkflowSteps(): Promise<{ processed: number; errors: number }> {
  const stats = { processed: 0, errors: 0 };

  try {
    const dueRuns = await storage.getDueWorkflowRuns(50);
    if (dueRuns.length === 0) return stats;

    console.log(`[WorkflowEngine] Processing ${dueRuns.length} due workflow runs`);

    for (const run of dueRuns) {
      try {
        await advanceWorkflowRun(run.id);
        stats.processed++;
      } catch (err) {
        console.error(`[WorkflowEngine] Error processing run ${run.id}:`, err);
        stats.errors++;
      }
    }

    if (stats.processed > 0) {
      console.log(`[WorkflowEngine] Done: ${stats.processed} processed, ${stats.errors} errors`);
    }
  } catch (err) {
    console.error('[WorkflowEngine] Error in processWorkflowSteps:', err);
  }

  return stats;
}

/**
 * Cancel a specific workflow run.
 */
export async function cancelWorkflowRun(runId: number, reason: string): Promise<void> {
  try {
    await storage.updateWorkflowRun(runId, {
      status: 'cancelled',
      cancelReason: reason,
      nextStepAt: null,
    });
    console.log(`[WorkflowEngine] Cancelled run ${runId}: ${reason}`);
  } catch (err) {
    console.error(`[WorkflowEngine] Error cancelling run ${runId}:`, err);
  }
}
