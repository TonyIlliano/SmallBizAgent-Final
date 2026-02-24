/**
 * Admin Routes
 *
 * Platform-wide admin endpoints for the owner dashboard.
 * All routes are protected by the isAdmin middleware.
 */

import { Router, Request, Response } from "express";
import { isAdmin } from "../middleware/auth";
import * as adminService from "../services/adminService";
import { storage } from "../storage";

const router = Router();

/**
 * GET /api/admin/stats — Platform-wide statistics
 */
router.get("/api/admin/stats", isAdmin, async (req: Request, res: Response) => {
  try {
    const stats = await adminService.getPlatformStats();
    res.json(stats);
  } catch (error: any) {
    console.error("[Admin] Error fetching platform stats:", error);
    res.status(500).json({ error: "Failed to fetch platform stats", details: error.message });
  }
});

/**
 * GET /api/admin/businesses — All businesses with owner info and activity counts
 */
router.get("/api/admin/businesses", isAdmin, async (req: Request, res: Response) => {
  try {
    const businesses = await adminService.getAdminBusinesses();
    res.json({ businesses });
  } catch (error: any) {
    console.error("[Admin] Error fetching businesses:", error);
    res.status(500).json({ error: "Failed to fetch businesses", details: error.message });
  }
});

/**
 * GET /api/admin/users — All users with business names
 */
router.get("/api/admin/users", isAdmin, async (req: Request, res: Response) => {
  try {
    const users = await adminService.getAdminUsers();
    res.json({ users });
  } catch (error: any) {
    console.error("[Admin] Error fetching users:", error);
    res.status(500).json({ error: "Failed to fetch users", details: error.message });
  }
});

/**
 * GET /api/admin/revenue — Revenue and subscription data
 */
router.get("/api/admin/revenue", isAdmin, async (req: Request, res: Response) => {
  try {
    const revenue = await adminService.getRevenueData();
    res.json(revenue);
  } catch (error: any) {
    console.error("[Admin] Error fetching revenue data:", error);
    res.status(500).json({ error: "Failed to fetch revenue data", details: error.message });
  }
});

/**
 * GET /api/admin/system — System health checks
 */
router.get("/api/admin/system", isAdmin, async (req: Request, res: Response) => {
  try {
    const health = await adminService.getSystemHealth();
    res.json(health);
  } catch (error: any) {
    console.error("[Admin] Error fetching system health:", error);
    res.status(500).json({ error: "Failed to fetch system health", details: error.message });
  }
});

/**
 * GET /api/admin/activity — Recent platform activity feed
 */
router.get("/api/admin/activity", isAdmin, async (req: Request, res: Response) => {
  try {
    const activity = await adminService.getRecentActivity();
    res.json({ activity });
  } catch (error: any) {
    console.error("[Admin] Error fetching activity:", error);
    res.status(500).json({ error: "Failed to fetch activity", details: error.message });
  }
});

/**
 * GET /api/admin/costs — Revenue vs costs breakdown (P&L)
 */
router.get("/api/admin/costs", isAdmin, async (req: Request, res: Response) => {
  try {
    const costs = await adminService.getCostsData();
    res.json(costs);
  } catch (error: any) {
    console.error("[Admin] Error fetching costs data:", error);
    res.status(500).json({ error: "Failed to fetch costs data", details: error.message });
  }
});

/**
 * GET /api/admin/phone-numbers — Phone number inventory across all businesses
 */
router.get("/api/admin/phone-numbers", isAdmin, async (req: Request, res: Response) => {
  try {
    const businesses = await storage.getAllBusinesses();
    const phoneNumbers = businesses.map(business => ({
      businessId: business.id,
      businessName: business.name,
      phoneNumber: business.twilioPhoneNumber,
      phoneNumberSid: business.twilioPhoneNumberSid,
      dateProvisioned: business.twilioDateProvisioned,
      status: business.twilioPhoneNumber ? "active" : "not provisioned",
    }));
    res.json({ phoneNumbers });
  } catch (error: any) {
    console.error("[Admin] Error fetching phone numbers:", error);
    res.status(500).json({ error: "Failed to fetch phone numbers", details: error.message });
  }
});

/**
 * POST /api/admin/process-overage-billing — Manually trigger overage billing check
 */
router.post("/api/admin/process-overage-billing", isAdmin, async (req: Request, res: Response) => {
  try {
    const { processAllOverageBilling } = await import("../services/overageBillingService.js");
    const results = await processAllOverageBilling();
    const invoiced = results.filter(r => r.status === 'invoiced').length;
    const noOverage = results.filter(r => r.status === 'no_overage').length;
    const skipped = results.filter(r => r.status === 'skipped').length;
    const failed = results.filter(r => r.status === 'failed').length;
    res.json({
      summary: { invoiced, noOverage, skipped, failed, total: results.length },
      results,
    });
  } catch (error: any) {
    console.error("[Admin] Error processing overage billing:", error);
    res.status(500).json({ error: "Failed to process overage billing", details: error.message });
  }
});

export default router;
