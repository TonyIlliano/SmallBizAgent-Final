/**
 * SMS Campaign Routes
 *
 * Business owners create, manage, and analyze broadcast + sequence campaigns.
 * All routes scoped to authenticated businessId.
 */

import { Router, Request, Response } from 'express';
import { storage } from '../storage';
import { createCampaign, launchCampaign, pauseCampaign, getCampaignMetrics, previewAudienceCount } from '../services/smsCampaignService';
import { z } from 'zod';

const router = Router();

const createCampaignSchema = z.object({
  name: z.string().min(1).max(200),
  type: z.enum(['broadcast', 'sequence']),
  audience: z.object({
    allCustomers: z.boolean().optional(),
    inactiveSinceDays: z.number().int().positive().optional(),
    tags: z.array(z.string()).optional(),
    minimumVisits: z.number().int().positive().optional(),
    segment: z.enum(['loyal', 'at_risk', 'new', 'lapsed']).optional(),
  }).optional(),
  steps: z.array(z.object({
    stepNumber: z.number().int().positive(),
    messageType: z.string(),
    delayDays: z.number().int().min(0),
    delayHours: z.number().int().min(0),
    prompt: z.string().optional(),
  })).optional(),
  messagePrompt: z.string().max(500).optional(),
  scheduledFor: z.string().datetime().optional(),
});

/** GET /api/sms-campaigns — List campaigns for business */
router.get('/', async (req: Request, res: Response) => {
  try {
    const businessId = req.user!.businessId;
    if (!businessId) return res.status(400).json({ error: 'No business' });
    const status = req.query.status as string | undefined;
    const campaigns = await storage.getSmsCampaigns(businessId, { status });
    res.json(campaigns);
  } catch (err) {
    console.error('[Campaigns] List error:', err);
    res.status(500).json({ error: 'Failed to list campaigns' });
  }
});

/** POST /api/sms-campaigns — Create campaign */
router.post('/', async (req: Request, res: Response) => {
  try {
    const businessId = req.user!.businessId;
    if (!businessId) return res.status(400).json({ error: 'No business' });
    const parsed = createCampaignSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid data', details: parsed.error.flatten() });
    const campaign = await createCampaign(businessId, {
      ...parsed.data,
      scheduledFor: parsed.data.scheduledFor ? new Date(parsed.data.scheduledFor) : undefined,
    });
    res.status(201).json(campaign);
  } catch (err) {
    console.error('[Campaigns] Create error:', err);
    res.status(500).json({ error: 'Failed to create campaign' });
  }
});

/** GET /api/sms-campaigns/:id — Campaign detail + metrics */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const businessId = req.user!.businessId;
    if (!businessId) return res.status(400).json({ error: 'No business' });
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    const campaign = await storage.getSmsCampaign(id, businessId);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    const metrics = await getCampaignMetrics(id);
    res.json({ ...campaign, metrics });
  } catch (err) {
    console.error('[Campaigns] Detail error:', err);
    res.status(500).json({ error: 'Failed to get campaign' });
  }
});

/** PUT /api/sms-campaigns/:id — Update draft campaign */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const businessId = req.user!.businessId;
    if (!businessId) return res.status(400).json({ error: 'No business' });
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    const campaign = await storage.getSmsCampaign(id, businessId);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    if (campaign.status !== 'draft') return res.status(400).json({ error: 'Can only edit draft campaigns' });
    const updated = await storage.updateSmsCampaign(id, req.body);
    res.json(updated);
  } catch (err) {
    console.error('[Campaigns] Update error:', err);
    res.status(500).json({ error: 'Failed to update campaign' });
  }
});

/** POST /api/sms-campaigns/:id/launch — Launch campaign */
router.post('/:id/launch', async (req: Request, res: Response) => {
  try {
    const businessId = req.user!.businessId;
    if (!businessId) return res.status(400).json({ error: 'No business' });
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    const result = await launchCampaign(id, businessId);
    if (!result.success) return res.status(400).json({ error: result.error });
    res.json(result);
  } catch (err) {
    console.error('[Campaigns] Launch error:', err);
    res.status(500).json({ error: 'Failed to launch campaign' });
  }
});

/** POST /api/sms-campaigns/:id/pause — Pause active campaign */
router.post('/:id/pause', async (req: Request, res: Response) => {
  try {
    const businessId = req.user!.businessId;
    if (!businessId) return res.status(400).json({ error: 'No business' });
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    const result = await pauseCampaign(id, businessId);
    if (!result.success) return res.status(400).json({ error: 'Campaign is not active' });
    res.json(result);
  } catch (err) {
    console.error('[Campaigns] Pause error:', err);
    res.status(500).json({ error: 'Failed to pause campaign' });
  }
});

/** DELETE /api/sms-campaigns/:id — Delete draft campaign */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const businessId = req.user!.businessId;
    if (!businessId) return res.status(400).json({ error: 'No business' });
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });
    const campaign = await storage.getSmsCampaign(id, businessId);
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    if (campaign.status !== 'draft') return res.status(400).json({ error: 'Can only delete draft campaigns' });
    await storage.updateSmsCampaign(id, { status: 'cancelled' as any });
    res.json({ success: true });
  } catch (err) {
    console.error('[Campaigns] Delete error:', err);
    res.status(500).json({ error: 'Failed to delete campaign' });
  }
});

/** POST /api/sms-campaigns/preview-audience — Count matching customers */
router.post('/preview-audience', async (req: Request, res: Response) => {
  try {
    const businessId = req.user!.businessId;
    if (!businessId) return res.status(400).json({ error: 'No business' });
    const count = await previewAudienceCount(businessId, req.body.filter || { allCustomers: true });
    res.json({ count });
  } catch (err) {
    console.error('[Campaigns] Preview audience error:', err);
    res.status(500).json({ error: 'Failed to preview audience' });
  }
});

export default router;
