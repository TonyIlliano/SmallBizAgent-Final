/**
 * Workflow Routes
 *
 * CRUD + activation endpoints for user-configured automation workflows.
 * All routes scoped to authenticated businessId.
 */

import { Router, Request, Response } from 'express';
import { storage } from '../storage';
import { WORKFLOW_TEMPLATES, cancelWorkflowRun } from '../services/workflowEngine';
import { z } from 'zod';

const router = Router();

const workflowStepSchema = z.object({
  type: z.enum(['wait', 'send_sms']),
  config: z.object({
    delayMinutes: z.number().int().positive().optional(),
    messageType: z.string().optional(),
    messagePrompt: z.string().max(500).optional(),
  }),
});

const createWorkflowSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  triggerEvent: z.string().min(1),
  steps: z.array(workflowStepSchema).min(1),
  templateId: z.string().optional(),
});

const updateWorkflowSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(500).optional(),
  triggerEvent: z.string().min(1).optional(),
  steps: z.array(workflowStepSchema).min(1).optional(),
});

/** GET /api/workflows — List workflows for business */
router.get('/', async (req: Request, res: Response) => {
  try {
    const businessId = req.user!.businessId;
    if (!businessId) return res.status(400).json({ error: 'No business' });
    const status = req.query.status as string | undefined;
    const workflows = await storage.getWorkflows(businessId, { status });
    res.json(workflows);
  } catch (err) {
    console.error('[Workflows] List error:', err);
    res.status(500).json({ error: 'Failed to list workflows' });
  }
});

/** GET /api/workflows/templates — List available pre-built templates */
router.get('/templates', async (_req: Request, res: Response) => {
  try {
    res.json(WORKFLOW_TEMPLATES);
  } catch (err) {
    console.error('[Workflows] Templates error:', err);
    res.status(500).json({ error: 'Failed to list templates' });
  }
});

/** POST /api/workflows/install-template — Create workflow from a template */
router.post('/install-template', async (req: Request, res: Response) => {
  try {
    const businessId = req.user!.businessId;
    if (!businessId) return res.status(400).json({ error: 'No business' });

    const { templateId } = req.body;
    if (!templateId) return res.status(400).json({ error: 'templateId required' });

    const template = WORKFLOW_TEMPLATES.find(t => t.id === templateId);
    if (!template) return res.status(404).json({ error: 'Template not found' });

    const workflow = await storage.createWorkflow({
      businessId,
      name: template.name,
      description: template.description,
      triggerEvent: template.triggerEvent,
      status: 'draft',
      steps: template.steps,
      templateId: template.id,
    });

    res.status(201).json(workflow);
  } catch (err) {
    console.error('[Workflows] Install template error:', err);
    res.status(500).json({ error: 'Failed to install template' });
  }
});

/** POST /api/workflows — Create custom workflow */
router.post('/', async (req: Request, res: Response) => {
  try {
    const businessId = req.user!.businessId;
    if (!businessId) return res.status(400).json({ error: 'No business' });

    const parsed = createWorkflowSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid workflow data', details: parsed.error.errors });
    }

    const workflow = await storage.createWorkflow({
      businessId,
      name: parsed.data.name,
      description: parsed.data.description || null,
      triggerEvent: parsed.data.triggerEvent,
      status: 'draft',
      steps: parsed.data.steps,
      templateId: parsed.data.templateId || null,
    });

    res.status(201).json(workflow);
  } catch (err) {
    console.error('[Workflows] Create error:', err);
    res.status(500).json({ error: 'Failed to create workflow' });
  }
});

/** GET /api/workflows/:id — Get single workflow with run count */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const businessId = req.user!.businessId;
    if (!businessId) return res.status(400).json({ error: 'No business' });

    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid workflow ID' });

    const workflow = await storage.getWorkflow(id, businessId);
    if (!workflow) return res.status(404).json({ error: 'Workflow not found' });

    // Include run counts
    const runs = await storage.getWorkflowRuns(businessId, { workflowId: id });
    const activeRuns = runs.filter(r => r.status === 'active').length;
    const completedRuns = runs.filter(r => r.status === 'completed').length;
    const totalRuns = runs.length;

    res.json({ ...workflow, runStats: { active: activeRuns, completed: completedRuns, total: totalRuns } });
  } catch (err) {
    console.error('[Workflows] Get error:', err);
    res.status(500).json({ error: 'Failed to get workflow' });
  }
});

/** PUT /api/workflows/:id — Update workflow */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const businessId = req.user!.businessId;
    if (!businessId) return res.status(400).json({ error: 'No business' });

    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid workflow ID' });

    // Verify ownership
    const existing = await storage.getWorkflow(id, businessId);
    if (!existing) return res.status(404).json({ error: 'Workflow not found' });

    const parsed = updateWorkflowSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid workflow data', details: parsed.error.errors });
    }

    const updated = await storage.updateWorkflow(id, parsed.data);
    res.json(updated);
  } catch (err) {
    console.error('[Workflows] Update error:', err);
    res.status(500).json({ error: 'Failed to update workflow' });
  }
});

/** DELETE /api/workflows/:id — Delete workflow + cancel active runs */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const businessId = req.user!.businessId;
    if (!businessId) return res.status(400).json({ error: 'No business' });

    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid workflow ID' });

    // Verify ownership
    const existing = await storage.getWorkflow(id, businessId);
    if (!existing) return res.status(404).json({ error: 'Workflow not found' });

    // Cancel any active runs for this workflow
    const runs = await storage.getWorkflowRuns(businessId, { workflowId: id, status: 'active' });
    for (const run of runs) {
      await cancelWorkflowRun(run.id, 'workflow_deleted');
    }

    await storage.deleteWorkflow(id, businessId);
    res.json({ success: true });
  } catch (err) {
    console.error('[Workflows] Delete error:', err);
    res.status(500).json({ error: 'Failed to delete workflow' });
  }
});

/** POST /api/workflows/:id/activate — Set workflow to active */
router.post('/:id/activate', async (req: Request, res: Response) => {
  try {
    const businessId = req.user!.businessId;
    if (!businessId) return res.status(400).json({ error: 'No business' });

    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid workflow ID' });

    const existing = await storage.getWorkflow(id, businessId);
    if (!existing) return res.status(404).json({ error: 'Workflow not found' });

    const steps = (existing.steps || []) as any[];
    if (steps.length === 0) {
      return res.status(400).json({ error: 'Cannot activate a workflow with no steps' });
    }

    const updated = await storage.updateWorkflow(id, { status: 'active' });
    res.json(updated);
  } catch (err) {
    console.error('[Workflows] Activate error:', err);
    res.status(500).json({ error: 'Failed to activate workflow' });
  }
});

/** POST /api/workflows/:id/pause — Pause workflow + cancel active runs */
router.post('/:id/pause', async (req: Request, res: Response) => {
  try {
    const businessId = req.user!.businessId;
    if (!businessId) return res.status(400).json({ error: 'No business' });

    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid workflow ID' });

    const existing = await storage.getWorkflow(id, businessId);
    if (!existing) return res.status(404).json({ error: 'Workflow not found' });

    // Cancel all active runs
    const runs = await storage.getWorkflowRuns(businessId, { workflowId: id, status: 'active' });
    for (const run of runs) {
      await cancelWorkflowRun(run.id, 'workflow_paused');
    }

    const updated = await storage.updateWorkflow(id, { status: 'paused' });
    res.json(updated);
  } catch (err) {
    console.error('[Workflows] Pause error:', err);
    res.status(500).json({ error: 'Failed to pause workflow' });
  }
});

/** GET /api/workflows/:id/runs — List runs for a workflow */
router.get('/:id/runs', async (req: Request, res: Response) => {
  try {
    const businessId = req.user!.businessId;
    if (!businessId) return res.status(400).json({ error: 'No business' });

    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid workflow ID' });

    // Verify workflow ownership
    const existing = await storage.getWorkflow(id, businessId);
    if (!existing) return res.status(404).json({ error: 'Workflow not found' });

    const status = req.query.status as string | undefined;
    const limit = parseInt(req.query.limit as string) || 50;
    const runs = await storage.getWorkflowRuns(businessId, { workflowId: id, status, limit });
    res.json(runs);
  } catch (err) {
    console.error('[Workflows] List runs error:', err);
    res.status(500).json({ error: 'Failed to list workflow runs' });
  }
});

/** POST /api/workflows/:id/cancel-run/:runId — Cancel a specific run */
router.post('/:id/cancel-run/:runId', async (req: Request, res: Response) => {
  try {
    const businessId = req.user!.businessId;
    if (!businessId) return res.status(400).json({ error: 'No business' });

    const workflowId = parseInt(req.params.id);
    const runId = parseInt(req.params.runId);
    if (isNaN(workflowId) || isNaN(runId)) return res.status(400).json({ error: 'Invalid ID' });

    // Verify workflow ownership
    const existing = await storage.getWorkflow(workflowId, businessId);
    if (!existing) return res.status(404).json({ error: 'Workflow not found' });

    // Verify run belongs to this workflow
    const run = await storage.getWorkflowRun(runId);
    if (!run || run.workflowId !== workflowId) return res.status(404).json({ error: 'Run not found' });

    await cancelWorkflowRun(runId, req.body.reason || 'manual_cancel');
    res.json({ success: true });
  } catch (err) {
    console.error('[Workflows] Cancel run error:', err);
    res.status(500).json({ error: 'Failed to cancel run' });
  }
});

export default router;
