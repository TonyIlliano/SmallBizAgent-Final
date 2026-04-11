import { Router, Request, Response } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { isAuthenticated, isAdmin, checkIsAdmin, checkBelongsToBusiness } from "../auth";
import { logAndSwallow } from '../utils/safeAsync';
import retellProvisioningService from "../services/retellProvisioningService";
import { handleRetellFunction, handleRetellWebhook, handleInboundWebhook, validateRetellWebhook } from '../services/retellWebhookHandler';
import businessProvisioningService from "../services/businessProvisioningService";
import twilioProvisioningService from "../services/twilioProvisioningService";

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

// ==================== Order History API ====================

/**
 * GET /api/orders
 * Fetch AI order history (Clover + Square + Heartland) for a business
 * Query params: businessId (required), limit (optional, default 50)
 */
router.get("/orders", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const businessId = parseInt(req.query.businessId as string, 10);
    const limit = parseInt(req.query.limit as string, 10) || 50;

    if (isNaN(businessId)) {
      return res.status(400).json({ error: "Invalid business ID" });
    }

    if (!checkIsAdmin(req) && !checkBelongsToBusiness(req, businessId)) {
      return res.status(403).json({ message: "Not authorized" });
    }

    // Fetch from all POS order logs
    const [cloverOrders, squareOrders, heartlandOrders] = await Promise.all([
      storage.getCloverOrderLogs(businessId, limit),
      storage.getSquareOrderLogs(businessId, limit),
      storage.getHeartlandOrderLogs(businessId, limit),
    ]);

    // Normalize into a unified format
    const orders = [
      ...cloverOrders.map(o => ({
        id: o.id,
        posType: 'clover' as const,
        posOrderId: o.cloverOrderId,
        callerPhone: o.callerPhone,
        callerName: o.callerName,
        items: o.items,
        totalAmount: o.totalAmount,
        status: o.status,
        orderType: o.orderType,
        errorMessage: o.errorMessage,
        createdAt: o.createdAt,
      })),
      ...squareOrders.map(o => ({
        id: o.id,
        posType: 'square' as const,
        posOrderId: o.squareOrderId,
        callerPhone: o.callerPhone,
        callerName: o.callerName,
        items: o.items,
        totalAmount: o.totalAmount,
        status: o.status,
        orderType: o.orderType,
        errorMessage: o.errorMessage,
        createdAt: o.createdAt,
      })),
      ...heartlandOrders.map(o => ({
        id: o.id,
        posType: 'heartland' as const,
        posOrderId: o.heartlandOrderId,
        callerPhone: o.callerPhone,
        callerName: o.callerName,
        items: o.items,
        totalAmount: o.totalAmount,
        status: o.status,
        orderType: o.orderType,
        errorMessage: o.errorMessage,
        createdAt: o.createdAt,
      })),
    ].sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    }).slice(0, limit);

    // Calculate stats
    const successfulOrders = orders.filter(o => o.status === 'created');
    const totalRevenue = successfulOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayOrders = successfulOrders.filter(o =>
      o.createdAt && new Date(o.createdAt) >= today
    );
    const todayRevenue = todayOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);

    res.json({
      orders,
      stats: {
        totalOrders: successfulOrders.length,
        failedOrders: orders.length - successfulOrders.length,
        totalRevenue,
        todayOrders: todayOrders.length,
        todayRevenue,
      },
    });
  } catch (error) {
    console.error("Error fetching order history:", error);
    res.status(500).json({ error: "Failed to fetch order history" });
  }
});

// Retell AI webhook endpoints (all voice AI calls handled here)
router.post('/retell/webhook', validateRetellWebhook, handleRetellWebhook);
router.post('/retell/function', validateRetellWebhook, handleRetellFunction);
router.post('/retell/inbound', handleInboundWebhook);  // Pre-fetch caller data before call starts

// Check what's missing for AI receptionist to work properly
router.get("/retell/setup-status/:businessId", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const businessId = parseInt(req.params.businessId);
    if (isNaN(businessId)) {
      return res.status(400).json({ message: "Invalid business ID" });
    }

    if (!checkIsAdmin(req) && !checkBelongsToBusiness(req, businessId)) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const business = await storage.getBusiness(businessId);
    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }

    const hours = await storage.getBusinessHours(businessId);
    const services = await storage.getServices(businessId);
    const receptionistConfig = await storage.getReceptionistConfig(businessId);

    const missing: string[] = [];
    const configured: string[] = [];

    if (hours.length === 0) {
      missing.push('Business hours not configured - AI will ask customers to leave callback info instead of scheduling');
    } else {
      configured.push(`Business hours configured for ${hours.filter(h => !h.isClosed).length} days`);
    }

    if (services.length === 0) {
      missing.push('No services configured - AI will offer general appointments only');
    } else {
      configured.push(`${services.length} services configured`);
    }

    if (!receptionistConfig) {
      missing.push('Receptionist config not set - using defaults');
    } else {
      configured.push('Receptionist configuration set');
    }

    if (!business.retellAgentId) {
      missing.push('Retell AI agent not provisioned');
    } else {
      configured.push('Retell AI agent active');
    }

    res.json({
      businessId,
      businessName: business.name,
      ready: missing.length === 0,
      configured,
      missing,
      details: {
        hours: hours.map(h => ({ day: h.day, open: h.open, close: h.close, isClosed: h.isClosed })),
        services: services.map(s => ({ id: s.id, name: s.name, price: s.price, duration: s.duration })),
        hasReceptionistConfig: !!receptionistConfig,
        retellAgentId: business.retellAgentId
      },
      setupInstructions: missing.length > 0 ? [
        'Go to Settings > Business Hours to configure your schedule',
        'Go to Settings > Services to add your service offerings with prices',
        'The AI will use this information to help customers book appointments'
      ] : null
    });
  } catch (error) {
    console.error('Error checking receptionist status:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Diagnostic endpoint to check business data for AI receptionist
router.get("/retell/diagnostic/:businessId", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const businessId = parseInt(req.params.businessId);
    if (isNaN(businessId)) {
      return res.status(400).json({ message: "Invalid business ID" });
    }

    if (!checkIsAdmin(req) && !checkBelongsToBusiness(req, businessId)) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const business = await storage.getBusiness(businessId);
    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }

    const hours = await storage.getBusinessHours(businessId);
    const services = await storage.getServices(businessId);
    const receptionistConfig = await storage.getReceptionistConfig(businessId);
    const appointments = await storage.getAppointmentsByBusinessId(businessId);

    res.json({
      business: {
        id: business.id,
        name: business.name,
        industry: business.industry,
        retellAgentId: business.retellAgentId,
        twilioPhoneNumber: business.twilioPhoneNumber
      },
      businessHours: {
        count: hours.length,
        days: hours.map(h => ({ day: h.day, open: h.open, close: h.close, isClosed: h.isClosed }))
      },
      services: {
        count: services.length,
        list: services.map(s => ({ id: s.id, name: s.name, price: s.price, active: s.active }))
      },
      receptionistConfig: receptionistConfig ? {
        greeting: receptionistConfig.greeting?.substring(0, 50) + '...',
        voicemailEnabled: receptionistConfig.voicemailEnabled,
        transferPhoneNumbers: receptionistConfig.transferPhoneNumbers
      } : null,
      appointments: {
        total: appointments.length,
        upcoming: appointments.filter(a => new Date(a.startDate) > new Date() && a.status === 'scheduled').length
      },
      diagnosis: {
        hasHours: hours.length > 0,
        hasServices: services.length > 0,
        hasRetellAgent: !!business.retellAgentId,
        hasReceptionistConfig: !!receptionistConfig,
        issues: [
          ...(hours.length === 0 ? ['No business hours configured - availability will use defaults (Mon-Fri 9-5)'] : []),
          ...(services.length === 0 ? ['No services configured - AI will offer general appointments only'] : []),
          ...(!business.retellAgentId ? ['No Retell agent configured - run provisioning'] : []),
          ...(!receptionistConfig ? ['No receptionist config - run provisioning'] : [])
        ]
      }
    });
  } catch (error) {
    console.error('Error in Retell diagnostic:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Force refresh Retell agent (for debugging - updates webhook URL and system prompt)
router.post("/retell/refresh/:businessId", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const businessId = parseInt(req.params.businessId);
    if (isNaN(businessId)) {
      return res.status(400).json({ message: "Invalid business ID" });
    }

    // Authorization: user must be admin or belong to this business
    if (!checkIsAdmin(req) && !checkBelongsToBusiness(req, businessId)) {
      return res.status(403).json({ message: "Not authorized to refresh this business's agent" });
    }

    console.log(`Force refreshing Retell agent for business ${businessId}`);

    const business = await storage.getBusiness(businessId);
    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }

    // If no agent exists, CREATE one (+ connect phone if available)
    if (!business.retellAgentId) {
      console.log(`[RetellRefresh] Business ${businessId} has no agent — creating new one via full provisioning`);
      const provisionResult = await retellProvisioningService.provisionRetellForBusiness(businessId);
      if (!provisionResult.success) {
        console.error('[RetellRefresh] Failed to create Retell agent:', provisionResult.error);
        return res.status(500).json({ error: provisionResult.error || 'Failed to create agent' });
      }
      // Re-enable receptionist
      await storage.updateBusiness(businessId, { receptionistEnabled: true } as any);
      console.log(`[RetellRefresh] Created new agent ${provisionResult.agentId} for business ${businessId}`);
      return res.json({
        success: true,
        agentId: provisionResult.agentId,
        phoneConnected: provisionResult.phoneConnected,
        message: 'New agent created and connected successfully',
        webhookUrl: `${process.env.APP_URL || process.env.BASE_URL}/api/retell/webhook`
      });
    }

    // Agent exists — update it
    const updateResult = await retellProvisioningService.updateRetellAgent(businessId);

    if (!updateResult.success) {
      console.error('Failed to update Retell agent:', updateResult.error);
      return res.status(500).json({ error: updateResult.error });
    }

    console.log('Retell agent updated successfully');

    // Ensure phone is connected to Retell (may have been skipped on initial creation)
    let phoneConnected = !!business.retellPhoneNumberId;
    if (!phoneConnected && business.twilioPhoneNumber) {
      console.log(`[RetellRefresh] Phone not connected — setting up SIP trunk + Retell import for business ${businessId}`);
      try {
        const phoneResult = await retellProvisioningService.connectPhoneToRetell(businessId, business.retellAgentId);
        phoneConnected = phoneResult.success;
        if (phoneResult.success) {
          console.log(`[RetellRefresh] Phone connected successfully for business ${businessId}`);
        } else {
          console.error(`[RetellRefresh] Phone connection failed:`, phoneResult.error);
        }
      } catch (phoneErr) {
        console.error(`[RetellRefresh] Phone connection error:`, phoneErr);
      }
    }

    res.json({
      success: true,
      agentId: business.retellAgentId,
      phoneConnected,
      message: 'Agent refreshed successfully',
      webhookUrl: `${process.env.APP_URL || process.env.BASE_URL}/api/retell/webhook`
    });
  } catch (error) {
    console.error('Error refreshing Retell agent:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create or update Retell agent for a business
router.post("/retell/assistant", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { businessId } = req.body;

    if (!businessId) {
      return res.status(400).json({ error: 'Business ID required' });
    }

    // Check authorization
    if (!checkIsAdmin(req) && !checkBelongsToBusiness(req, businessId)) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const business = await storage.getBusiness(businessId);
    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }

    const services = await storage.getServices(businessId);
    const businessHours = await storage.getBusinessHours(businessId);
    const rcConfig = await storage.getReceptionistConfig(businessId);

    // Check if business already has a Retell agent
    if (business.retellAgentId) {
      // Update existing agent
      const result = await retellProvisioningService.updateRetellAgent(businessId);

      if (!result.success) {
        return res.status(500).json({ error: result.error });
      }

      res.json({
        success: true,
        agentId: business.retellAgentId,
        message: 'Agent updated successfully'
      });
    } else {
      // Create new agent
      const result = await retellProvisioningService.provisionRetellForBusiness(businessId);

      if (!result.success) {
        return res.status(500).json({ error: result.error });
      }

      res.json({
        success: true,
        agentId: result.agentId,
        message: 'Agent created successfully'
      });
    }
  } catch (error) {
    console.error('Error creating/updating Retell agent:', error);
    res.status(500).json({ error: 'Failed to create/update agent' });
  }
});

// Connect Twilio phone number to Retell
router.post("/retell/connect-phone", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { businessId } = req.body;

    if (!businessId) {
      return res.status(400).json({ error: 'Business ID required' });
    }

    // Authorization: user must be admin or belong to this business
    if (!checkIsAdmin(req) && !checkBelongsToBusiness(req, businessId)) {
      return res.status(403).json({ error: 'Not authorized to connect phone for this business' });
    }

    const business = await storage.getBusiness(businessId);
    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }

    if (!business.twilioPhoneNumber) {
      return res.status(400).json({ error: 'Business does not have a phone number provisioned' });
    }

    if (!business.retellAgentId) {
      return res.status(400).json({ error: 'Business does not have a Retell agent. Create one first.' });
    }

    // Connect the phone number to Retell via provisioning service
    const result = await retellProvisioningService.connectPhoneToRetell(businessId, business.retellAgentId);

    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    res.json({
      success: true,
      phoneNumberId: result.phoneNumberId,
      message: 'Phone number connected to Retell successfully'
    });
  } catch (error) {
    console.error('Error connecting phone to Retell:', error);
    res.status(500).json({ error: 'Failed to connect phone number' });
  }
});

// Get Retell agent status for a business
router.get("/retell/status/:businessId", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const businessId = parseInt(req.params.businessId);
    if (isNaN(businessId)) {
      return res.status(400).json({ error: "Invalid business ID" });
    }

    if (!checkIsAdmin(req) && !checkBelongsToBusiness(req, businessId)) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const business = await storage.getBusiness(businessId);
    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }

    // Retell agent info — get from Retell API if agent exists
    let agentInfo = null;
    if (business.retellAgentId) {
      try {
        const retellService = (await import('../services/retellService')).default;
        agentInfo = await retellService.getAgent(business.retellAgentId);
      } catch (e) {
        console.warn('Could not fetch Retell agent info:', e);
      }
    }

    res.json({
      hasAgent: !!business.retellAgentId,
      agentId: business.retellAgentId,
      hasPhoneConnected: !!business.retellPhoneNumberId,
      phoneNumberId: business.retellPhoneNumberId,
      phoneNumber: business.twilioPhoneNumber,
      receptionistEnabled: business.receptionistEnabled !== false, // Default to true if not set
      agentInfo: agentInfo || null
    });
  } catch (error) {
    console.error('Error getting Retell status:', error);
    res.status(500).json({ error: 'Failed to get status' });
  }
});

// =================== RECEPTIONIST ENABLE/DISABLE ===================

// Toggle receptionist enabled status (soft disable - doesn't release resources)
router.post("/business/:id/receptionist/toggle", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const businessId = parseInt(req.params.id);
    if (isNaN(businessId)) {
      return res.status(400).json({ message: "Invalid business ID" });
    }
    const { enabled } = req.body;

    if (!checkIsAdmin(req) && !checkBelongsToBusiness(req, businessId)) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const business = await storage.getBusiness(businessId);
    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }

    // Update the receptionist enabled status
    const updatedBusiness = await storage.updateBusiness(businessId, {
      receptionistEnabled: enabled
    });

    res.json({
      success: true,
      receptionistEnabled: updatedBusiness.receptionistEnabled,
      message: enabled ? 'AI Receptionist enabled' : 'AI Receptionist disabled'
    });
  } catch (error) {
    console.error('Error toggling receptionist:', error);
    res.status(500).json({ error: 'Failed to toggle receptionist status' });
  }
});

// Fully deprovision receptionist (releases Twilio number and deletes Retell agent)
router.post("/business/:id/receptionist/deprovision", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const businessId = parseInt(req.params.id);
    if (isNaN(businessId)) {
      return res.status(400).json({ message: "Invalid business ID" });
    }

    if (!checkIsAdmin(req) && !checkBelongsToBusiness(req, businessId)) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const business = await storage.getBusiness(businessId);
    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }

    // Check if there's anything to deprovision
    if (!business.retellAgentId && !business.twilioPhoneNumberSid && !business.twilioPhoneNumber) {
      return res.json({
        success: true,
        message: 'No receptionist resources to deprovision'
      });
    }

    // Call the deprovision service
    const result = await businessProvisioningService.deprovisionBusiness(businessId);

    // Disable the receptionist and clear all phone/agent fields so UI shows empty state
    await storage.updateBusiness(businessId, {
      receptionistEnabled: false,
      twilioPhoneNumber: null,
      twilioPhoneNumberSid: null,
      twilioPhoneNumberStatus: null,
    });
    // Clear Retell fields via raw SQL
    await db.execute(
      sql`UPDATE businesses SET retell_agent_id = NULL, retell_llm_id = NULL, retell_phone_number_id = NULL WHERE id = ${businessId}`
    ).catch(logAndSwallow('Routes'));

    res.json({
      success: result.success,
      message: 'AI Receptionist deprovisioned successfully',
      details: {
        twilioReleased: result.twilioDeprovisioned,
        retellRemoved: result.retellDeprovisioned
      }
    });
  } catch (error) {
    console.error('Error deprovisioning receptionist:', error);
    res.status(500).json({ error: 'Failed to deprovision receptionist' });
  }
});

// Search available phone numbers for a business (user-facing)
router.get("/business/:id/available-numbers", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const businessId = parseInt(req.params.id);
    if (isNaN(businessId)) {
      return res.status(400).json({ message: "Invalid business ID" });
    }

    if (!checkIsAdmin(req) && !checkBelongsToBusiness(req, businessId)) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const areaCode = req.query.areaCode as string;
    if (!areaCode || areaCode.length !== 3 || !/^\d{3}$/.test(areaCode)) {
      return res.status(400).json({
        error: "Invalid area code. Please provide a 3-digit area code."
      });
    }

    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
      return res.status(503).json({
        error: "Phone number service is not configured"
      });
    }

    const phoneNumbers = await twilioProvisioningService.searchAvailablePhoneNumbers(areaCode);
    res.json({ phoneNumbers });
  } catch (error) {
    console.error("Error searching for available phone numbers:", error);
    res.status(500).json({
      error: "Error searching for available phone numbers",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// Re-provision receptionist (provisions new Twilio number and creates Retell agent)
router.post("/business/:id/receptionist/provision", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const businessId = parseInt(req.params.id);
    if (isNaN(businessId)) {
      return res.status(400).json({ message: "Invalid business ID" });
    }
    const { areaCode, phoneNumber } = req.body;

    if (!checkIsAdmin(req) && !checkBelongsToBusiness(req, businessId)) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const business = await storage.getBusiness(businessId);
    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }

    // Check if already provisioned
    if (business.retellAgentId && business.twilioPhoneNumberSid) {
      return res.status(400).json({
        error: 'Receptionist is already provisioned. Deprovision first to reprovision.'
      });
    }

    // Call the provisioning service with options
    const result = await businessProvisioningService.provisionBusiness(businessId, {
      preferredAreaCode: areaCode,
      specificPhoneNumber: phoneNumber
    });

    // Enable the receptionist and protect from scheduler
    const statusUpdate: any = { receptionistEnabled: true };
    const currentStatus = (business as any).subscriptionStatus;
    if (currentStatus === 'expired' || currentStatus === 'grace_period' || currentStatus === 'trialing') {
      // Set to 'active' so the trial scheduler won't touch this business
      // Admin/owner manually provisioning = business should be protected
      statusUpdate.subscriptionStatus = 'active';
    }
    await storage.updateBusiness(businessId, statusUpdate);

    res.json({
      success: result.success,
      message: 'AI Receptionist provisioned successfully',
      phoneNumber: result.twilioPhoneNumber,
      agentId: result.retellAgentId
    });
  } catch (error) {
    console.error('Error provisioning receptionist:', error);
    res.status(500).json({ error: 'Failed to provision receptionist' });
  }
});

// =================== ADMIN PHONE NUMBER MANAGEMENT ===================
// Get available phone numbers in an area code
router.get("/admin/phone-numbers/available", isAdmin, async (req: Request, res: Response) => {
  try {
    // Extract area code from query
    const areaCode = req.query.areaCode as string;
    if (!areaCode || areaCode.length !== 3) {
      return res.status(400).json({
        error: "Invalid area code. Please provide a 3-digit area code."
      });
    }

    // Check if Twilio is configured
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
      return res.status(503).json({
        error: "Twilio is not configured. Please set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN"
      });
    }

    // Search for available phone numbers
    const phoneNumbers = await twilioProvisioningService.searchAvailablePhoneNumbers(areaCode);
    res.json({ phoneNumbers });
  } catch (error) {
    console.error("Error searching for available phone numbers:", error);
    res.status(500).json({
      error: "Error searching for available phone numbers",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// Provision a specific phone number for a business (FULL: Twilio + Retell + connection)
router.post("/admin/phone-numbers/provision", isAdmin, async (req: Request, res: Response) => {
  try {
    const { businessId, phoneNumber } = req.body;

    if (!businessId || !phoneNumber) {
      return res.status(400).json({
        error: "Missing required fields. Please provide businessId and phoneNumber"
      });
    }

    // Get business to confirm it exists
    const business = await storage.getBusiness(businessId);
    if (!business) {
      return res.status(404).json({ error: "Business not found" });
    }

    // Check if Twilio is configured
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
      return res.status(503).json({
        error: "Twilio is not configured. Please set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN"
      });
    }

    // Use the FULL provisioning service (Twilio + Retell + phone connection)
    // This ensures the assistant is created AND the phone is connected to it
    const result = await businessProvisioningService.provisionBusiness(businessId, {
      specificPhoneNumber: phoneNumber
    });

    // Protect from scheduler: set status to 'active' and extend trial
    // Admin manually provisioning = business should NOT be auto-deprovisioned
    const statusUpdate: any = {
      receptionistEnabled: true,
      subscriptionStatus: 'active',  // Active businesses skip the trial scheduler entirely
    };
    await storage.updateBusiness(businessId, statusUpdate);
    console.log(`[AdminProvision] Business ${businessId} set to 'active' status (admin-provisioned, protected from scheduler)`);

    res.json({
      success: result.success,
      business: businessId,
      phoneNumber: result.twilioPhoneNumber,
      agentId: result.retellAgentId,
      retellConnected: result.retellPhoneConnected,
      message: result.success
        ? "Phone number + AI agent provisioned successfully"
        : "Provisioning partially completed — check logs"
    });
  } catch (error) {
    console.error("Error provisioning phone number:", error);
    res.status(500).json({
      error: "Error provisioning phone number",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

// Release a phone number (admin only)
router.delete("/admin/phone-numbers/:businessId", isAdmin, async (req: Request, res: Response) => {
  try {
    const businessId = parseInt(req.params.businessId);
    if (isNaN(businessId)) {
      return res.status(400).json({ error: "Invalid business ID" });
    }

    // Get business to confirm it exists
    const business = await storage.getBusiness(businessId);
    if (!business) {
      return res.status(404).json({ error: "Business not found" });
    }

    // Check if business has a phone number
    if (!business.twilioPhoneNumber) {
      return res.status(400).json({
        error: "This business does not have a provisioned phone number"
      });
    }

    // Check if Twilio is configured
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
      return res.status(503).json({
        error: "Twilio is not configured. Please set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN"
      });
    }

    // Release the phone number
    await twilioProvisioningService.releasePhoneNumber(businessId);

    // Return success
    res.json({
      success: true,
      message: "Phone number released successfully",
      business: businessId
    });
  } catch (error) {
    console.error("Error releasing phone number:", error);
    res.status(500).json({
      error: "Error releasing phone number",
      details: error instanceof Error ? error.message : String(error)
    });
  }
});

export default router;
