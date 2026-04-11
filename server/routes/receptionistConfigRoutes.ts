import { Router, Request, Response } from "express";
import { storage } from "../storage";
import { z } from "zod";
import { insertReceptionistConfigSchema } from "@shared/schema";
import { isAuthenticated } from "../auth";
import retellProvisioningService from "../services/retellProvisioningService";

const router = Router();

// Helper to get businessId from authenticated request
const getBusinessId = (req: Request): number => {
  if (req.isAuthenticated() && req.user?.businessId) {
    return req.user.businessId;
  }
  if ((req as any).apiKeyBusinessId) {
    return (req as any).apiKeyBusinessId;
  }
  return 0;
};

// Helper to verify resource belongs to user's business
const verifyBusinessOwnership = (resource: any, req: Request): boolean => {
  if (!resource) return false;
  const userBusinessId = getBusinessId(req);
  return resource.businessId === userBusinessId;
};

// =================== VOICE PREVIEW PROXY ===================
// Proxy ElevenLabs voice preview audio to avoid browser CORS/autoplay issues
const VOICE_PREVIEW_URLS: Record<string, string> = {
  paula: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/21m00Tcm4TlvDq8ikWAM/dff5d82d-d16d-45b9-ae73-be2ad8850855.mp3',
  rachel: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/21m00Tcm4TlvDq8ikWAM/dff5d82d-d16d-45b9-ae73-be2ad8850855.mp3',
  domi: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/AZnzlk1XvdvUeBnXmlld/53bd2f5f-bb59-4146-9922-245b2a466c80.mp3',
  bella: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/EXAVITQu4vr4xnSDxMaL/53bd2f5f-bb59-4146-8822-245b2a466c80.mp3',
  elli: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/MF3mGyEYCl7XYWbV9V6O/bea2dc16-9abf-4162-b011-66531458e022.mp3',
  adam: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/pNInz6obpgDQGcFmaJgB/d6905d7a-dd26-4187-bfff-1bd3a5ea7cac.mp3',
  antoni: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/ErXwobaYiN019PkySvjV/53bd2f5f-bb59-1111-8822-225b2a466c80.mp3',
  josh: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/TxGEqnHWrfWFTfGW9XjX/bdc4303c-a20d-4cec-97eb-dca625044eac.mp3',
  arnold: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/VR6AewLTigWG4xSOukaG/2c4395e7-91b1-44cd-8f0f-e4aebd292461.mp3',
  sam: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/yoZ06aMxZJJ28mfd3POQ/1c4d417c-ba80-4de8-874a-a1c57987ea63.mp3',
};

router.get("/voice-preview/:voiceId", async (req: Request, res: Response) => {
  try {
    const voiceId = req.params.voiceId.toLowerCase();
    const url = VOICE_PREVIEW_URLS[voiceId];
    if (!url) {
      return res.status(404).json({ error: "Voice not found" });
    }

    const response = await fetch(url);
    if (!response.ok) {
      return res.status(502).json({ error: "Failed to fetch voice preview" });
    }

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
    const buffer = await response.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (error) {
    console.error("Voice preview error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// =================== TEST CALL ===================
// Let business owner test their AI receptionist by receiving an outbound call
router.post("/receptionist/test-call", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const businessId = getBusinessId(req);
    if (businessId === 0) {
      return res.status(400).json({ error: 'No business associated with your account' });
    }

    const business = await storage.getBusiness(businessId);
    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }

    // Validate prerequisites: Retell agent and phone number must be provisioned
    if (!business.retellAgentId) {
      return res.status(400).json({
        error: 'AI receptionist not set up yet. Please provision your receptionist first.'
      });
    }
    if (!business.retellPhoneNumberId) {
      return res.status(400).json({
        error: 'No phone number configured for your AI receptionist. Please set up a phone number first.'
      });
    }

    // Get the phone number to call — use request body or fall back to business phone
    let phoneNumber = req.body.phoneNumber || business.phone;
    if (!phoneNumber) {
      return res.status(400).json({
        error: 'No phone number provided. Please enter a phone number to call.'
      });
    }

    // Normalize to E.164 format
    phoneNumber = phoneNumber.replace(/[\s\-\(\)\.]/g, '');
    if (!phoneNumber.startsWith('+')) {
      if (phoneNumber.startsWith('1') && phoneNumber.length === 11) {
        phoneNumber = '+' + phoneNumber;
      } else {
        phoneNumber = '+1' + phoneNumber;
      }
    }

    // Validate E.164 format
    if (!/^\+[1-9]\d{6,14}$/.test(phoneNumber)) {
      return res.status(400).json({
        error: 'Invalid phone number format. Please enter a valid phone number.'
      });
    }

    // Call Retell outbound API
    const retellService = (await import('../services/retellService')).default;
    const result = await retellService.createOutboundCall(
      business.retellAgentId,
      business.twilioPhoneNumber!,
      phoneNumber
    );

    if (result.error) {
      console.error(`[TestCall] Failed for business ${businessId}:`, result.error);
      return res.status(500).json({
        error: 'Failed to initiate test call. Please try again in a moment.'
      });
    }

    console.log(`[TestCall] Initiated for business ${businessId}: callId=${result.callId}, to=${phoneNumber}`);
    res.json({
      success: true,
      callId: result.callId,
      message: 'Test call initiated! Answer your phone to speak with your AI receptionist.'
    });
  } catch (error) {
    console.error('[TestCall] Error:', error);
    res.status(500).json({ error: 'Failed to initiate test call' });
  }
});

// =================== VIRTUAL RECEPTIONIST API ===================
router.get("/receptionist-config/:businessId", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const requestedBusinessId = parseInt(req.params.businessId);
    if (isNaN(requestedBusinessId)) {
      return res.status(400).json({ message: "Invalid business ID" });
    }
    const userBusinessId = getBusinessId(req);
    // Only allow access to own business config
    if (requestedBusinessId !== userBusinessId) {
      return res.status(403).json({ message: "Access denied" });
    }
    const config = await storage.getReceptionistConfig(requestedBusinessId);
    if (!config) {
      return res.status(404).json({ message: "Receptionist configuration not found" });
    }
    res.json(config);
  } catch (error) {
    res.status(500).json({ message: "Error fetching receptionist configuration" });
  }
});

router.post("/receptionist-config", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const businessId = getBusinessId(req);
    const validatedData = insertReceptionistConfigSchema.parse({ ...req.body, businessId });
    const config = await storage.createReceptionistConfig(validatedData);

    // Auto-refresh Retell agent when receptionist config is created (syncs transfer numbers etc.)
    retellProvisioningService.debouncedUpdateRetellAgent(businessId);

    res.status(201).json(config);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.format() });
    }
    res.status(500).json({ message: "Error creating receptionist configuration" });
  }
});

router.put("/receptionist-config/:id", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid receptionist config ID" });
    }
    // Verify ownership: look up config by the user's businessId (NOT by the URL param id)
    // because getReceptionistConfig queries by businessId, not by config record id
    const userBusinessId = getBusinessId(req);
    const existing = await storage.getReceptionistConfig(userBusinessId);
    if (!existing || existing.id !== id) {
      return res.status(404).json({ message: "Receptionist configuration not found" });
    }
    const validatedData = insertReceptionistConfigSchema.partial().parse(req.body);
    const config = await storage.updateReceptionistConfig(id, validatedData);

    // Auto-refresh Retell agent when receptionist config changes (syncs transfer numbers etc.)
    retellProvisioningService.debouncedUpdateRetellAgent(userBusinessId);

    res.json(config);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.format() });
    }
    res.status(500).json({ message: "Error updating receptionist configuration" });
  }
});

// =================== AI SUGGESTIONS (Auto-Refine Pipeline) ===================

// Get all suggestions for the current business
router.get("/receptionist/suggestions", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const businessId = getBusinessId(req);
    const params: any = {};
    if (req.query.status) params.status = req.query.status as string;
    const suggestions = await storage.getAiSuggestions(businessId, params);
    res.json(suggestions);
  } catch (error) {
    res.status(500).json({ message: "Error fetching suggestions" });
  }
});

// Get pending + accepted suggestion counts (for badge + summary)
router.get("/receptionist/suggestions/count", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const businessId = getBusinessId(req);
    const count = await storage.getAiSuggestionCount(businessId);
    const acceptedCount = await storage.getAiSuggestionsAcceptedCount(businessId);
    res.json({ count, acceptedCount });
  } catch (error) {
    res.status(500).json({ message: "Error fetching suggestion count" });
  }
});

// Accept a suggestion (applies change to config/knowledge + triggers Retell agent update)
router.post("/receptionist/suggestions/:id/accept", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid suggestion ID" });
    }
    const suggestion = await storage.getAiSuggestion(id);
    if (!suggestion || !verifyBusinessOwnership(suggestion, req)) {
      return res.status(404).json({ message: "Suggestion not found" });
    }
    const { acceptSuggestion } = await import('../services/autoRefineService');
    const result = await acceptSuggestion(id);
    if (result.success) {
      res.json({ message: "Suggestion accepted and applied" });
    } else {
      res.status(400).json({ message: result.error });
    }
  } catch (error) {
    res.status(500).json({ message: "Error accepting suggestion" });
  }
});

// Dismiss a suggestion
router.post("/receptionist/suggestions/:id/dismiss", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid suggestion ID" });
    }
    const suggestion = await storage.getAiSuggestion(id);
    if (!suggestion || !verifyBusinessOwnership(suggestion, req)) {
      return res.status(404).json({ message: "Suggestion not found" });
    }
    await storage.updateAiSuggestion(id, { status: 'dismissed' });
    res.json({ message: "Suggestion dismissed" });
  } catch (error) {
    res.status(500).json({ message: "Error dismissing suggestion" });
  }
});

// Edit then accept a suggestion (modified value applied)
router.post("/receptionist/suggestions/:id/edit", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid suggestion ID" });
    }
    const { editedValue } = req.body;
    if (!editedValue) {
      return res.status(400).json({ message: "editedValue is required" });
    }
    const suggestion = await storage.getAiSuggestion(id);
    if (!suggestion || !verifyBusinessOwnership(suggestion, req)) {
      return res.status(404).json({ message: "Suggestion not found" });
    }
    const { acceptSuggestion } = await import('../services/autoRefineService');
    const result = await acceptSuggestion(id, editedValue);
    if (result.success) {
      res.json({ message: "Suggestion edited and applied" });
    } else {
      res.status(400).json({ message: result.error });
    }
  } catch (error) {
    res.status(500).json({ message: "Error editing suggestion" });
  }
});

// Manual trigger for auto-refine analysis (testing / on-demand)
router.post("/receptionist/suggestions/trigger", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const businessId = getBusinessId(req);
    const { analyzeBusinessWeek } = await import('../services/autoRefineService');
    await analyzeBusinessWeek(businessId);
    res.json({ message: "Auto-refine analysis triggered" });
  } catch (error) {
    res.status(500).json({ message: "Error triggering auto-refine" });
  }
});

export default router;
