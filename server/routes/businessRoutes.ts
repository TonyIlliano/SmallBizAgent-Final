import { Router, Request, Response } from "express";
import { storage } from "../storage";
import { db } from "../db";
import {
  insertBusinessSchema,
  insertBusinessHoursSchema,
  auditLogs,
} from "@shared/schema";
import { eq, desc, sql } from "drizzle-orm";
import { z } from "zod";
import {
  isAuthenticated,
  belongsToBusiness,
  checkIsAdmin,
  checkBelongsToBusiness,
  ApiKeyRequest,
} from "../auth";
import { sanitizeBusiness } from '../utils/sanitize';
import { logAndSwallow } from '../utils/safeAsync';
import { dataCache } from "../services/callToolHandlers";
import retellProvisioningService from "../services/retellProvisioningService";
import businessProvisioningService from "../services/businessProvisioningService";
import schedulerService from "../services/schedulerService";
import { GoogleBusinessProfileService } from "../services/googleBusinessProfileService";

import multer from "multer";
import { uploadBufferToS3, isS3Configured } from "../utils/s3Upload";

const router = Router();

// Multer for logo upload (2MB max, images only)
const logoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files allowed"));
  },
});

// Helper to get businessId from authenticated request
const getBusinessId = (req: Request): number => {
  if (req.isAuthenticated() && req.user?.businessId) {
    return req.user.businessId;
  }
  if ((req as ApiKeyRequest).apiKeyBusinessId) {
    return (req as ApiKeyRequest).apiKeyBusinessId!;
  }
  return 0;
};

// =================== BUSINESS API ===================
router.get("/business", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const businessId = getBusinessId(req);
    if (businessId === 0) {
      return res.status(404).json({
        message: "No business associated with this account",
        needsBusinessSetup: true
      });
    }
    const business = await storage.getBusiness(businessId);
    if (!business) {
      return res.status(404).json({ message: "Business not found" });
    }
    res.json(sanitizeBusiness(business));
  } catch (error) {
    res.status(500).json({ message: "Error fetching business" });
  }
});

router.post("/business", isAuthenticated, async (req: Request, res: Response) => {
  try {
    // Clean up empty strings and non-existent fields before validation
    const body = { ...req.body };
    if (body.website === '') body.website = null;
    if (body.zip === '') body.zip = null;
    if (body.address === '') body.address = null;
    if (body.city === '') body.city = null;
    if (body.state === '') body.state = null;
    if (body.industry === '') body.industry = null;
    if (body.phone === '') body.phone = null;
    // Remove fields that don't exist in the businesses table
    delete body.description;
    delete body.zipCode;

    console.log('Business create request:', JSON.stringify(body));
    const validatedData = insertBusinessSchema.parse(body);
    const business = await storage.createBusiness(validatedData);

    // Set up 14-day free trial for the new business
    try {
      const trialEnd = new Date();
      trialEnd.setDate(trialEnd.getDate() + 14);
      await storage.updateBusiness(business.id, {
        trialEndsAt: trialEnd,
        subscriptionStatus: 'trialing',
      });
      console.log(`Set 14-day trial for business ${business.id}, expires ${trialEnd.toISOString()}`);
    } catch (trialError) {
      console.error(`Failed to set trial for business ${business.id}:`, trialError);
      // Non-blocking — business still created
    }

    // Link the authenticated user to this business
    if (req.isAuthenticated() && req.user) {
      try {
        const updatedUser = await storage.updateUser(req.user.id, { businessId: business.id });
        console.log(`Linked user ${req.user.id} to business ${business.id}. Updated user:`, JSON.stringify(updatedUser));
        // Update the session user object so subsequent requests see the new businessId
        req.user.businessId = business.id;
      } catch (linkError) {
        console.error(`Failed to link user ${req.user.id} to business ${business.id}:`, linkError);
      }
    } else {
      console.log('Business created without authenticated user - no linking performed');
    }

    // Notify admin about new signup (non-blocking)
    try {
      const { sendNewBusinessSignupNotification } = await import("../emailService");
      const ownerEmail = req.user?.email || 'unknown';
      const ownerUsername = req.user?.username || 'unknown';
      sendNewBusinessSignupNotification(
        business.name,
        ownerEmail,
        ownerUsername,
        body.industry || null,
        body.phone || null
      ).catch(notifyErr => console.error('Failed to send signup notification:', notifyErr));
    } catch (notifyErr) {
      console.error('Failed to load email service for signup notification:', notifyErr);
    }

    // Start reminder scheduler for the new business
    schedulerService.startReminderScheduler(business.id);

    // Automatically provision business resources
    try {
      // Get area code from request if available
      const preferredAreaCode = req.body.areaCode || req.body.zipCode?.substring(0, 3);

      // Provision business in background, don't wait for completion
      // This prevents the API from blocking if Twilio is slow
      businessProvisioningService.provisionBusiness(business.id, {
        preferredAreaCode,
        // Never auto-provision a phone number on signup — businesses
        // enable the AI receptionist themselves (saves Twilio costs and
        // avoids buying numbers for accounts that may never use them).
        skipTwilioProvisioning: true
      }).catch(provisionError => {
        console.error(`Error provisioning business ${business.id}:`, provisionError);
      });

      res.status(201).json({
        ...sanitizeBusiness(business),
        provisioning: "started",
        message: "Business created. Resources are being provisioned in the background."
      });
    } catch (provisionError) {
      // Even if provisioning fails, still return created business
      console.error("Failed to start business provisioning:", provisionError);
      res.status(201).json({
        ...sanitizeBusiness(business),
        provisioning: "failed",
        message: "Business created but resource provisioning failed to start."
      });
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      const fieldErrors = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
      console.error('Business create validation error:', fieldErrors);
      return res.status(400).json({
        message: `Validation error: ${fieldErrors}`,
        errors: error.format()
      });
    }
    console.error('Business create error:', error);
    res.status(500).json({ message: `Error creating business: ${error instanceof Error ? error.message : 'Unknown error'}` });
  }
});

router.put("/business/:id", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid business ID" });
    }

    // Authorization: user must be admin or belong to this business
    if (!checkIsAdmin(req) && !checkBelongsToBusiness(req, id)) {
      return res.status(403).json({ message: "Not authorized to update this business" });
    }

    // Clean up empty strings for optional/nullable fields before validation
    const body = { ...req.body };
    if (body.website === '') body.website = null;
    if (body.zip === '') body.zip = null;
    if (body.address === '') body.address = null;
    if (body.city === '') body.city = null;
    if (body.state === '') body.state = null;
    if (body.industry === '') body.industry = null;
    if (body.phone === '') body.phone = null;
    if (body.ownerPhone === '') body.ownerPhone = null;
    if (body.logoUrl === '') body.logoUrl = null;
    // Remove fields that don't exist in the businesses table
    delete body.description;
    delete body.zipCode;

    console.log(`Business update request for id ${id}:`, JSON.stringify(body));
    const validatedData = insertBusinessSchema.partial().parse(body);
    console.log(`Business update validated data for id ${id}:`, JSON.stringify(validatedData));
    const business = await storage.updateBusiness(id, validatedData);

    // Update Retell agent if any business info that affects the AI prompt changed (debounced)
    if (validatedData.name || validatedData.industry || validatedData.businessHours ||
        validatedData.phone || validatedData.address || validatedData.city || validatedData.state || validatedData.zip ||
        validatedData.restaurantPickupEnabled !== undefined || validatedData.restaurantDeliveryEnabled !== undefined) {
      retellProvisioningService.debouncedUpdateRetellAgent(id);
    }

    // Fire-and-forget GBP sync to detect conflicts (pull only, no auto-push)
    if (validatedData.name || validatedData.phone || validatedData.address || validatedData.description || validatedData.website) {
      const gbpSvc = new GoogleBusinessProfileService();
      gbpSvc.isConnected(id).then(connected => {
        if (connected) gbpSvc.syncBusinessData(id).catch(logAndSwallow('Routes'));
      }).catch(logAndSwallow('Routes'));
    }

    res.json(sanitizeBusiness(business));
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('Business update validation error:', JSON.stringify(error.format()));
      // Extract human-readable error messages from Zod format
      const fieldErrors = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
      return res.status(400).json({
        message: `Validation error: ${fieldErrors}`,
        errors: error.format()
      });
    }
    console.error('Business update error:', error);
    res.status(500).json({ message: `Error updating business: ${error instanceof Error ? error.message : 'Unknown error'}` });
  }
});

// Get provisioning status for a business
router.get("/business/:id/provisioning-status", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const businessId = parseInt(req.params.id);
    if (isNaN(businessId)) {
      return res.status(400).json({ message: "Invalid business ID" });
    }

    if (!checkIsAdmin(req) && !checkBelongsToBusiness(req, businessId)) {
      return res.status(403).json({ message: "Not authorized" });
    }

    const business = await storage.getBusiness(businessId);
    if (!business) {
      return res.status(404).json({ message: "Business not found" });
    }

    res.json({
      provisioningStatus: business.provisioningStatus || 'unknown',
      provisioningResult: business.provisioningResult ? JSON.parse(business.provisioningResult) : null,
      provisioningCompletedAt: business.provisioningCompletedAt,
      twilioPhoneNumber: business.twilioPhoneNumber,
      retellAgentId: business.retellAgentId,
    });
  } catch (error) {
    console.error("Error fetching provisioning status:", error);
    res.status(500).json({ message: "Error fetching provisioning status" });
  }
});

// Audit log endpoint
router.get("/business/:id/audit-log", isAuthenticated, belongsToBusiness, async (req: Request, res: Response) => {
  try {
    const businessId = parseInt(req.params.id);
    if (isNaN(businessId)) {
      return res.status(400).json({ message: "Invalid business ID" });
    }
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const offset = (page - 1) * limit;
    const actionFilter = req.query.action as string;

    let query = db.select().from(auditLogs)
      .where(eq(auditLogs.businessId, businessId))
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
      .offset(offset);

    const logs = await query;

    // Get total count for pagination
    const [{ count }] = await db.select({ count: sql<number>`count(*)` })
      .from(auditLogs)
      .where(eq(auditLogs.businessId, businessId));

    res.json({ logs, total: Number(count), page, limit });
  } catch (error) {
    console.error('Error fetching audit log:', error);
    res.status(500).json({ error: 'Error fetching audit log' });
  }
});

// Get real setup status for the business (replaces localStorage-based checklist)
router.get("/business/setup-status", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const businessId = getBusinessId(req);
    if (businessId === 0) {
      return res.json({
        businessProfile: false,
        services: false,
        receptionist: false,
        calendar: false,
        allComplete: false,
      });
    }

    const business = await storage.getBusiness(businessId);
    if (!business) {
      return res.json({
        businessProfile: false,
        services: false,
        receptionist: false,
        calendar: false,
        allComplete: false,
      });
    }

    // Check business profile: must have name, phone, and email at minimum
    const businessProfile = !!(business.name && business.phone && business.email);

    // Check services: must have at least one service
    const services = await storage.getServices(businessId);
    const hasServices = services.length > 0;

    // Check receptionist: must have a Retell agent created
    const hasReceptionist = !!(business.retellAgentId);

    // Check calendar/integrations: has business hours configured
    const businessHours = await storage.getBusinessHours(businessId);
    const hasCalendar = businessHours.length > 0;

    // Check staff: has at least one staff member
    const staff = await storage.getStaff(businessId);
    const hasStaff = staff.length > 0;

    // Check customers: has at least one customer
    const customers = await storage.getCustomers(businessId);
    const hasCustomers = customers.length > 0;

    // Check online booking: booking is enabled with a slug
    const hasBooking = !!(business.bookingEnabled && business.bookingSlug);

    // Check POS integration: Clover, Square, or Heartland connected
    const hasPOS = !!(business.cloverMerchantId || business.squareMerchantId || business.heartlandApiKey);

    // Check reservations (restaurant-specific)
    const hasReservations = !!(business.reservationEnabled);

    // Check AI agents: at least one agent enabled
    const agentSettings = await storage.getAllAgentSettings(businessId);
    const enabledAgentCount = agentSettings.filter(s => s.enabled).length;
    const hasAgents = enabledAgentCount > 0;

    // Determine business category for industry-specific checklist
    const businessType = business.type || 'general';
    const businessIndustry = business.industry || null;

    const allComplete = businessProfile && hasServices && hasReceptionist && hasCalendar;

    res.json({
      businessProfile,
      services: hasServices,
      receptionist: hasReceptionist,
      calendar: hasCalendar,
      staff: hasStaff,
      customers: hasCustomers,
      booking: hasBooking,
      pos: hasPOS,
      reservations: hasReservations,
      agents: hasAgents,
      allComplete,
      businessType,
      businessIndustry,
      details: {
        businessName: business.name || null,
        businessPhone: business.phone || null,
        businessEmail: business.email || null,
        serviceCount: services.length,
        staffCount: staff.length,
        customerCount: customers.length,
        retellAgentId: business.retellAgentId || null,
        twilioPhoneNumber: business.twilioPhoneNumber || null,
        businessHoursDays: businessHours.length,
        bookingSlug: business.bookingSlug || null,
        bookingEnabled: business.bookingEnabled || false,
        enabledAgentCount,
      }
    });
  } catch (error) {
    console.error("Error fetching setup status:", error);
    res.status(500).json({ message: "Error fetching setup status" });
  }
});

// Dismiss or show the setup checklist (replaces localStorage)
router.post("/user/setup-checklist-dismiss", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Not authenticated" });
    const { dismissed } = req.body;
    await storage.updateUser(userId, { setupChecklistDismissed: !!dismissed });
    res.json({ success: true });
  } catch (error) {
    console.error("Error updating checklist dismiss state:", error);
    res.status(500).json({ message: "Error updating preference" });
  }
});

// Dismiss a feature discovery tip
router.post("/user/dismiss-tip", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ message: "Not authenticated" });
    const { tipId } = req.body;
    if (!tipId || typeof tipId !== 'string') return res.status(400).json({ message: "Invalid tip ID" });

    const user = await storage.getUser(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const dismissed: string[] = user.dismissedTips ? JSON.parse(user.dismissedTips) : [];
    if (!dismissed.includes(tipId)) {
      dismissed.push(tipId);
    }
    await storage.updateUser(userId, { dismissedTips: JSON.stringify(dismissed) });
    res.json({ success: true });
  } catch (error) {
    console.error("Error dismissing tip:", error);
    res.status(500).json({ message: "Error dismissing tip" });
  }
});

// Endpoint to manually provision a business (useful for businesses created before this feature)
router.post("/business/:id/provision", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const businessId = parseInt(req.params.id);
    if (isNaN(businessId)) {
      return res.status(400).json({ message: "Invalid business ID" });
    }

    // Check if business exists
    const business = await storage.getBusiness(businessId);
    if (!business) {
      return res.status(404).json({ message: "Business not found" });
    }

    // Check if user is authorized to access this business
    // Admin users can provision any business
    if (!checkIsAdmin(req) && !checkBelongsToBusiness(req, businessId)) {
      return res.status(403).json({ message: "Unauthorized to provision this business" });
    }

    // Extract options from request
    const preferredAreaCode = req.body.areaCode || business.zip?.substring(0, 3);
    const skipTwilioProvisioning = req.body.skipTwilioProvisioning ||
      !process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN;

    // Start provisioning in the background
    businessProvisioningService.provisionBusiness(businessId, {
      preferredAreaCode,
      skipTwilioProvisioning
    }).then(result => {
      console.log(`Provisioning completed for business ${businessId}:`, result);
    }).catch(error => {
      console.error(`Error provisioning business ${businessId}:`, error);
    });

    res.json({
      business: businessId,
      provisioning: "started",
      message: "Business provisioning started"
    });
  } catch (error) {
    console.error("Error in business provisioning endpoint:", error);
    res.status(500).json({ message: "Error starting business provisioning" });
  }
});

// =================== BUSINESS HOURS API ===================
router.get("/business/:businessId/hours", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const businessId = parseInt(req.params.businessId);
    if (isNaN(businessId)) {
      return res.status(400).json({ message: "Invalid business ID" });
    }

    // Authorization: user must be admin or belong to this business
    if (!checkIsAdmin(req) && !checkBelongsToBusiness(req, businessId)) {
      return res.status(403).json({ message: "Not authorized to view this business's hours" });
    }

    const hours = await storage.getBusinessHours(businessId);
    res.json(hours);
  } catch (error) {
    res.status(500).json({ message: "Error fetching business hours" });
  }
});

router.post("/business-hours", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const validatedData = insertBusinessHoursSchema.parse(req.body);

    // Authorization: user must belong to the business they're creating hours for
    if (validatedData.businessId && !checkIsAdmin(req) && !checkBelongsToBusiness(req, validatedData.businessId)) {
      return res.status(403).json({ message: "Not authorized to create hours for this business" });
    }

    const hours = await storage.createBusinessHours(validatedData);

    // Invalidate cache for this business's hours
    if (hours.businessId) {
      dataCache.invalidate(hours.businessId, 'hours');
    }

    // Auto-refresh Retell agent when business hours are created (includes knowledge base)
    if (hours.businessId) {
      const business = await storage.getBusiness(hours.businessId);
      if (business?.retellAgentId) {
        retellProvisioningService.debouncedUpdateRetellAgent(hours.businessId);
      }
    }

    res.status(201).json(hours);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.format() });
    }
    res.status(500).json({ message: "Error creating business hours" });
  }
});

router.put("/business-hours/:id", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid ID" });
    }

    // Authorization: if businessId is in the body, verify user belongs to that business
    // Otherwise, the update is scoped by the hours record ID (which was created under their business)
    const reqBusinessId = req.body.businessId || getBusinessId(req);
    if (reqBusinessId && !checkIsAdmin(req) && !checkBelongsToBusiness(req, reqBusinessId)) {
      return res.status(403).json({ message: "Not authorized to update these business hours" });
    }

    const validatedData = insertBusinessHoursSchema.partial().parse(req.body);
    const hours = await storage.updateBusinessHours(id, validatedData);

    // Invalidate cache for this business's hours
    if (hours.businessId) {
      dataCache.invalidate(hours.businessId, 'hours');
    }

    // Auto-refresh Retell agent when business hours change (includes knowledge base)
    if (hours.businessId) {
      const business = await storage.getBusiness(hours.businessId);
      if (business?.retellAgentId) {
        retellProvisioningService.debouncedUpdateRetellAgent(hours.businessId);
      }
    }

    // Fire-and-forget GBP sync when hours change
    if (hours.businessId) {
      const gbpSvc = new GoogleBusinessProfileService();
      gbpSvc.isConnected(hours.businessId).then(connected => {
        if (connected) gbpSvc.syncBusinessData(hours.businessId).catch(logAndSwallow('Routes'));
      }).catch(logAndSwallow('Routes'));
    }

    res.json(hours);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ errors: error.format() });
    }
    res.status(500).json({ message: "Error updating business hours" });
  }
});

/**
 * POST /api/business/:id/logo — Upload business logo to S3
 */
router.post("/api/business/:id/logo", isAuthenticated, logoUpload.single("logo"), async (req: Request, res: Response) => {
  try {
    const businessId = parseInt(req.params.id);
    if (isNaN(businessId)) return res.status(400).json({ error: "Invalid business ID" });

    const userBusinessId = (req.user as any)?.businessId;
    if (businessId !== userBusinessId) return res.status(403).json({ error: "Not your business" });

    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    if (!isS3Configured()) {
      return res.status(503).json({ error: "File storage not configured" });
    }

    const ext = req.file.originalname.split(".").pop() || "png";
    const key = `logos/business-${businessId}-${Date.now()}.${ext}`;
    const logoUrl = await uploadBufferToS3(req.file.buffer, key, req.file.mimetype);

    // Save URL to business record
    await db.execute(sql`UPDATE businesses SET logo_url = ${logoUrl} WHERE id = ${businessId}`);

    res.json({ logoUrl });
  } catch (error: any) {
    console.error("[Business] Logo upload error:", error);
    res.status(500).json({ error: error.message || "Upload failed" });
  }
});

export default router;
