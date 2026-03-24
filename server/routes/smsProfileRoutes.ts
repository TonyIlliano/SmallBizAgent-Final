/**
 * SMS Business Profile Routes
 *
 * CRUD for the SMS personality profile that powers messageIntelligenceService.
 * All routes scoped to authenticated businessId.
 */

import { Router, Request, Response } from 'express';
import { storage } from '../storage';
import { z } from 'zod';

const router = Router();

// Validation schema for profile updates
const profileUpdateSchema = z.object({
  vibeChoice: z.enum(['casual', 'professional', 'warm', 'direct']).optional(),
  useEmoji: z.boolean().optional(),
  signOffName: z.string().max(100).optional(),
  staffMembers: z.array(z.object({ name: z.string(), role: z.string() })).optional(),
  topServices: z.array(z.object({ name: z.string(), price: z.number() })).max(10).optional(),
  cancellationPolicy: z.string().max(500).nullable().optional(),
  typicalCustomerDescription: z.string().max(500).optional(),
  oneThingCustomersShouldKnow: z.string().max(500).optional(),
  responseTimeExpectation: z.enum(['within_hour', 'same_day', 'next_business_day']).optional(),
  winBackDays: z.number().int().min(7).max(365).optional(),
});

/**
 * GET /api/sms-profile
 * Get the SMS business profile for the authenticated business.
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const businessId = req.user!.businessId;
    if (!businessId) return res.status(400).json({ error: 'No business associated with account' });

    const profile = await storage.getSmsBusinessProfile(businessId);
    if (!profile) {
      // Return empty defaults so the frontend can render the form
      return res.json({
        businessId,
        vibeChoice: null,
        useEmoji: false,
        signOffName: null,
        staffMembers: [],
        topServices: [],
        cancellationPolicy: null,
        typicalCustomerDescription: null,
        oneThingCustomersShouldKnow: null,
        responseTimeExpectation: null,
        winBackDays: 30,
        profileComplete: false,
        completedAt: null,
      });
    }

    res.json(profile);
  } catch (err) {
    console.error('[SMS Profile] Error fetching profile:', err);
    res.status(500).json({ error: 'Failed to fetch SMS profile' });
  }
});

/**
 * PUT /api/sms-profile
 * Save/update the SMS business profile (partial updates supported).
 */
router.put('/', async (req: Request, res: Response) => {
  try {
    const businessId = req.user!.businessId;
    if (!businessId) return res.status(400).json({ error: 'No business associated with account' });

    const parsed = profileUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid profile data', details: parsed.error.flatten() });
    }

    const profile = await storage.upsertSmsBusinessProfile(businessId, parsed.data as any);
    res.json(profile);
  } catch (err) {
    console.error('[SMS Profile] Error updating profile:', err);
    res.status(500).json({ error: 'Failed to update SMS profile' });
  }
});

/**
 * POST /api/sms-profile/complete
 * Mark the SMS profile as complete (gates AI message generation).
 */
router.post('/complete', async (req: Request, res: Response) => {
  try {
    const businessId = req.user!.businessId;
    if (!businessId) return res.status(400).json({ error: 'No business associated with account' });

    // Verify minimum required fields are set
    const existing = await storage.getSmsBusinessProfile(businessId);
    if (!existing) {
      return res.status(400).json({ error: 'SMS profile not started. Complete the setup first.' });
    }
    if (!existing.vibeChoice || !existing.signOffName) {
      return res.status(400).json({ error: 'Please set your business vibe and sign-off name before completing.' });
    }

    const profile = await storage.upsertSmsBusinessProfile(businessId, {
      profileComplete: true,
      completedAt: new Date(),
    });

    res.json({ success: true, profile });
  } catch (err) {
    console.error('[SMS Profile] Error completing profile:', err);
    res.status(500).json({ error: 'Failed to complete SMS profile' });
  }
});

/**
 * POST /api/sms-profile/preview
 * Generate 3 sample AI messages to preview before activating.
 */
router.post('/preview', async (req: Request, res: Response) => {
  try {
    const businessId = req.user!.businessId;
    if (!businessId) return res.status(400).json({ error: 'No business associated with account' });

    const business = await storage.getBusiness(businessId);
    if (!business) return res.status(404).json({ error: 'Business not found' });

    // Temporarily mark profile as complete for preview generation
    const profile = await storage.getSmsBusinessProfile(businessId);
    if (!profile) return res.status(400).json({ error: 'Complete the SMS profile setup first' });

    const { generateMessage } = await import('../services/messageIntelligenceService');

    // Generate 3 sample messages using dummy customer data
    const samples = await Promise.allSettled([
      generateMessage({
        messageType: 'BOOKING_CONFIRMATION',
        businessId,
        customerId: 0, // Dummy — won't actually send (no phone)
        recipientPhone: '',
        useTemplate: false,
        context: { customerName: 'Sarah', serviceName: 'Haircut', appointmentDate: 'Tuesday, March 25', appointmentTime: '2:00 PM', businessName: business.name },
        isMarketing: false,
      }).catch(() => ({ body: `Hi Sarah! Your Haircut is confirmed for Tuesday at 2:00 PM. See you then! - ${profile.signOffName || business.name}` })),

      generateMessage({
        messageType: 'APPOINTMENT_REMINDER',
        businessId,
        customerId: 0,
        recipientPhone: '',
        useTemplate: false,
        context: { customerName: 'Mike', serviceName: 'Beard Trim', appointmentDate: 'Tomorrow', appointmentTime: '10:30 AM', businessName: business.name },
        isMarketing: false,
      }).catch(() => ({ body: `Hey Mike! Just a reminder — your Beard Trim is tomorrow at 10:30 AM. Reply CONFIRM, RESCHEDULE, or C. - ${profile.signOffName || business.name}` })),

      generateMessage({
        messageType: 'FOLLOW_UP_THANK_YOU',
        businessId,
        customerId: 0,
        recipientPhone: '',
        useTemplate: false,
        context: { customerName: 'Tony', serviceName: 'Fade', businessName: business.name },
        isMarketing: true,
      }).catch(() => ({ body: `Thanks for coming in today, Tony! Hope the Fade turned out great. See you next time! - ${profile.signOffName || business.name}` })),
    ]);

    const previews = samples.map((result, idx) => {
      const types = ['Booking Confirmation', 'Day-Before Reminder', 'Post-Service Follow-Up'];
      if (result.status === 'fulfilled') {
        const val = result.value as any;
        return { type: types[idx], body: val.body || val };
      }
      return { type: types[idx], body: 'Preview unavailable — AI will generate this live.' };
    });

    res.json({ previews });
  } catch (err) {
    console.error('[SMS Profile] Error generating preview:', err);
    res.status(500).json({ error: 'Failed to generate preview messages' });
  }
});

export default router;
