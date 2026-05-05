/**
 * Phone Routes
 *
 * Multi-line phone number management endpoints for businesses.
 * Handles provisioning, releasing, updating, and connecting phone numbers to Vapi.
 */

import { Router, Request, Response } from "express";
import { isAuthenticated } from "../middleware/auth";
import { storage } from "../storage";
import {
  provisionPhoneNumber,
  provisionSpecificPhoneNumber,
  releaseSpecificPhoneNumber,
  searchAvailablePhoneNumbers,
} from "../services/twilioProvisioningService";
import { connectSpecificPhoneToRetell } from "../services/retellProvisioningService";

const router = Router();

/**
 * Middleware: Verify that the authenticated user owns the business (or is admin).
 * Expects :id as the business ID route parameter.
 */
function verifyBusinessOwnership(req: Request, res: Response, next: Function) {
  const businessId = parseInt(req.params.id);

  if (!businessId || isNaN(businessId)) {
    return res.status(400).json({ error: "Invalid business ID" });
  }

  // Admins can access any business
  if (req.user?.role === "admin") {
    return next();
  }

  if (req.user?.businessId !== businessId) {
    return res.status(403).json({ error: "Access denied to this business" });
  }

  next();
}

/**
 * GET /api/business/:id/phone-numbers
 * List all phone numbers for a business
 */
router.get(
  "/business/:id/phone-numbers",
  isAuthenticated,
  verifyBusinessOwnership,
  async (req: Request, res: Response) => {
    try {
      const businessId = parseInt(req.params.id);
      const rows = await storage.getPhoneNumbersByBusiness(businessId);
      // Project DB rows into the shape the UI expects.
      // The DB column is twilio_phone_number → drizzle field twilioPhoneNumber,
      // but the frontend reads `phoneNumber` (matching adminRoutes.ts:152). Without
      // this mapping, the UI sees `phoneNumber: undefined` and renders blank cells.
      const phoneNumbers = rows.map((row) => ({
        id: row.id,
        businessId: row.businessId,
        phoneNumber: row.twilioPhoneNumber,
        phoneNumberSid: row.twilioPhoneNumberSid,
        retellPhoneNumberId: row.retellPhoneNumberId ?? null,
        retellConnected: !!row.retellPhoneNumberId,
        label: row.label,
        status: row.status,
        isPrimary: row.isPrimary,
        dateProvisioned: row.dateProvisioned,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }));
      res.json({ phoneNumbers });
    } catch (error: any) {
      console.error("[Phone] Error listing phone numbers:", error);
      res.status(500).json({ error: "Failed to list phone numbers", details: error.message });
    }
  }
);

/**
 * GET /api/business/:id/phone-numbers/available?areaCode=212
 * Search for available phone numbers to provision
 */
router.get(
  "/business/:id/phone-numbers/available",
  isAuthenticated,
  verifyBusinessOwnership,
  async (req: Request, res: Response) => {
    try {
      const areaCode = req.query.areaCode as string;
      if (!areaCode || !/^\d{3}$/.test(areaCode)) {
        return res.status(400).json({ error: "Valid 3-digit area code is required" });
      }

      const phoneNumbers = await searchAvailablePhoneNumbers(areaCode);
      res.json(phoneNumbers);
    } catch (error: any) {
      console.error("[Phone] Error searching available numbers:", error);
      res.status(500).json({ error: "Failed to search available numbers", details: error.message });
    }
  }
);

/**
 * POST /api/business/:id/phone-numbers
 * Provision a new phone number for a business
 *
 * Body (all optional):
 *   areaCode       - Preferred area code (e.g. "212")
 *   specificNumber  - Exact E.164 number to purchase (e.g. "+12125551234")
 *   label          - Friendly label (e.g. "Main Line", "After Hours")
 */
router.post(
  "/business/:id/phone-numbers",
  isAuthenticated,
  verifyBusinessOwnership,
  async (req: Request, res: Response) => {
    try {
      const businessId = parseInt(req.params.id);
      const { areaCode, specificNumber, label } = req.body;

      const business = await storage.getBusiness(businessId);
      if (!business) {
        return res.status(404).json({ error: "Business not found" });
      }

      let provisionResult;

      if (specificNumber) {
        // Provision a specific phone number
        provisionResult = await provisionSpecificPhoneNumber(businessId, specificNumber);
      } else {
        // Provision by area code (or general search)
        provisionResult = await provisionPhoneNumber(business, areaCode);
      }

      // Check if this is the first phone number for the business
      const existingNumbers = await storage.getPhoneNumbersByBusiness(businessId);
      const isPrimary = existingNumbers.length === 0;

      // Save the phone number record in the multi-line table
      const phoneRecord = await storage.createPhoneNumber({
        businessId,
        twilioPhoneNumber: provisionResult.phoneNumber,
        twilioPhoneNumberSid: provisionResult.phoneNumberSid,
        label: label || null,
        isPrimary,
        status: "active",
        dateProvisioned: new Date(),
      });

      res.status(201).json({ phoneNumber: phoneRecord });
    } catch (error: any) {
      console.error("[Phone] Error provisioning phone number:", error);
      res.status(500).json({ error: "Failed to provision phone number", details: error.message });
    }
  }
);

/**
 * DELETE /api/business/:id/phone-numbers/:phoneId
 * Release a phone number
 */
router.delete(
  "/business/:id/phone-numbers/:phoneId",
  isAuthenticated,
  verifyBusinessOwnership,
  async (req: Request, res: Response) => {
    try {
      const businessId = parseInt(req.params.id);
      const phoneId = parseInt(req.params.phoneId);

      if (!phoneId || isNaN(phoneId)) {
        return res.status(400).json({ error: "Invalid phone number ID" });
      }

      // Fetch the phone record to verify it belongs to this business
      const phoneRecord = await storage.getPhoneNumber(phoneId);
      if (!phoneRecord) {
        return res.status(404).json({ error: "Phone number not found" });
      }

      if (phoneRecord.businessId !== businessId) {
        return res.status(403).json({ error: "Phone number does not belong to this business" });
      }

      // Release the specific number from Twilio and delete from our database
      try {
        await releaseSpecificPhoneNumber(phoneId);
      } catch (twilioError: any) {
        console.warn("[Phone] Twilio release warning (proceeding with local delete):", twilioError.message);
        // If Twilio release fails, still delete locally
        await storage.deletePhoneNumber(phoneId, businessId);
      }

      res.json({ success: true, message: "Phone number released successfully" });
    } catch (error: any) {
      console.error("[Phone] Error releasing phone number:", error);
      res.status(500).json({ error: "Failed to release phone number", details: error.message });
    }
  }
);

/**
 * PATCH /api/business/:id/phone-numbers/:phoneId
 * Update label or set as primary
 *
 * Body (all optional):
 *   label     - New friendly label
 *   isPrimary - Set this number as the primary line
 */
router.patch(
  "/business/:id/phone-numbers/:phoneId",
  isAuthenticated,
  verifyBusinessOwnership,
  async (req: Request, res: Response) => {
    try {
      const businessId = parseInt(req.params.id);
      const phoneId = parseInt(req.params.phoneId);

      if (!phoneId || isNaN(phoneId)) {
        return res.status(400).json({ error: "Invalid phone number ID" });
      }

      // Fetch the phone record to verify it belongs to this business
      const phoneRecord = await storage.getPhoneNumber(phoneId);
      if (!phoneRecord) {
        return res.status(404).json({ error: "Phone number not found" });
      }

      if (phoneRecord.businessId !== businessId) {
        return res.status(403).json({ error: "Phone number does not belong to this business" });
      }

      const { label, isPrimary } = req.body;

      // Build update payload
      const updateData: Record<string, any> = {};
      if (label !== undefined) {
        updateData.label = label;
      }

      // If setting isPrimary, unset isPrimary on all other numbers for this business first
      if (isPrimary === true) {
        const allNumbers = await storage.getPhoneNumbersByBusiness(businessId);
        for (const num of allNumbers) {
          if (num.isPrimary && num.id !== phoneId) {
            await storage.updatePhoneNumber(num.id, { isPrimary: false });
          }
        }
        updateData.isPrimary = true;
      } else if (isPrimary === false) {
        updateData.isPrimary = false;
      }

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ error: "No valid fields provided to update" });
      }

      const updated = await storage.updatePhoneNumber(phoneId, updateData);
      res.json({ phoneNumber: updated });
    } catch (error: any) {
      console.error("[Phone] Error updating phone number:", error);
      res.status(500).json({ error: "Failed to update phone number", details: error.message });
    }
  }
);

/**
 * POST /api/business/:id/phone-numbers/:phoneId/connect-retell
 * Connect a phone number to Retell AI assistant
 */
router.post(
  "/business/:id/phone-numbers/:phoneId/connect-retell",
  isAuthenticated,
  verifyBusinessOwnership,
  async (req: Request, res: Response) => {
    try {
      const businessId = parseInt(req.params.id);
      const phoneId = parseInt(req.params.phoneId);

      if (!phoneId || isNaN(phoneId)) {
        return res.status(400).json({ error: "Invalid phone number ID" });
      }

      // Fetch the phone record to verify it belongs to this business
      const phoneRecord = await storage.getPhoneNumber(phoneId);
      if (!phoneRecord) {
        return res.status(404).json({ error: "Phone number not found" });
      }

      if (phoneRecord.businessId !== businessId) {
        return res.status(403).json({ error: "Phone number does not belong to this business" });
      }

      // Connect the specific phone number to Retell AI
      const result = await connectSpecificPhoneToRetell(businessId, phoneId);

      if (!result.success) {
        return res.status(500).json({ error: "Failed to connect phone to AI receptionist", details: result.error });
      }

      // Re-fetch the updated phone record
      const updated = await storage.getPhoneNumber(phoneId);

      res.json({
        success: true,
        phoneNumber: updated,
        retellPhoneNumberId: result.retellPhoneNumberId,
      });
    } catch (error: any) {
      console.error("[Phone] Error connecting phone to Vapi:", error);
      res.status(500).json({ error: "Failed to connect phone to Vapi", details: error.message });
    }
  }
);

export default router;
