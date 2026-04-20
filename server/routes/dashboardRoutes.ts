import { Router, Request, Response } from "express";
import { storage } from "../storage";
import { isAuthenticated, ApiKeyRequest } from "../auth";
import { sanitizeBusiness } from "../utils/sanitize";
import { getBusinessAnalytics } from "../services/analyticsService";
import { getUsageInfo } from "../services/usageService";

const router = Router();

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

/**
 * GET /api/dashboard
 *
 * Batched dashboard endpoint that replaces 8 separate API calls with a single
 * parallel fetch. Returns all data needed to render the main dashboard page.
 *
 * Returns:
 * {
 *   business, jobs, invoices, appointments, callLogs, quotes, usage, analytics
 * }
 */
router.get("/dashboard", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const businessId = getBusinessId(req);
    if (businessId === 0) {
      return res.status(404).json({
        message: "No business associated with this account",
        needsBusinessSetup: true,
      });
    }

    // Build date range for appointments (today + 7 days)
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    const sevenDaysOut = new Date(today);
    sevenDaysOut.setDate(sevenDaysOut.getDate() + 7);

    // Run ALL queries in parallel
    const [
      business,
      jobs,
      rawInvoices,
      rawAppointments,
      callLogs,
      quotes,
      usage,
      analytics,
    ] = await Promise.all([
      // 1. Business profile
      storage.getBusiness(businessId).catch((err) => {
        console.error("[Dashboard] Error fetching business:", err);
        return null;
      }),

      // 2. Completed jobs (limit 50)
      storage
        .getJobs(businessId, { status: "completed" })
        .then((allJobs) => allJobs.slice(0, 50))
        .catch((err) => {
          console.error("[Dashboard] Error fetching jobs:", err);
          return [];
        }),

      // 3. All invoices (limit 50) — hydration happens after Promise.all
      storage
        .getInvoices(businessId)
        .then((allInvoices) => allInvoices.slice(0, 50))
        .catch((err) => {
          console.error("[Dashboard] Error fetching invoices:", err);
          return [];
        }),

      // 4. Upcoming appointments (today's date, limit 50) — hydration after Promise.all
      storage
        .getAppointments(businessId, {
          startDate: new Date(todayStr),
          endDate: new Date(todayStr),
        })
        .then((allAppointments) => allAppointments.slice(0, 50))
        .catch((err) => {
          console.error("[Dashboard] Error fetching appointments:", err);
          return [];
        }),

      // 5. Recent call logs (limit 25)
      storage
        .getCallLogs(businessId)
        .then((allLogs) => allLogs.slice(0, 25))
        .catch((err) => {
          // Handle missing column gracefully (same as callLogRoutes)
          if (
            err?.message?.includes("does not exist") ||
            err?.code === "42703"
          ) {
            console.warn(
              "[Dashboard] call_logs column missing, returning empty"
            );
          } else {
            console.error("[Dashboard] Error fetching call logs:", err);
          }
          return [];
        }),

      // 6. Recent quotes (limit 50)
      storage
        .getAllQuotes(businessId)
        .then((allQuotes) => allQuotes.slice(0, 50))
        .catch((err) => {
          console.error("[Dashboard] Error fetching quotes:", err);
          return [];
        }),

      // 7. Subscription usage info
      getUsageInfo(businessId).catch((err) => {
        console.error("[Dashboard] Error fetching usage:", err);
        return null;
      }),

      // 8. Monthly analytics
      getBusinessAnalytics(businessId, "month").catch((err) => {
        console.error("[Dashboard] Error fetching analytics:", err);
        return null;
      }),
    ]);

    // Collect unique related IDs across invoices + appointments for batch fetch
    const customerIdSet = new Set<number>();
    for (const inv of rawInvoices) {
      if (inv.customerId != null) customerIdSet.add(inv.customerId);
    }
    for (const appt of rawAppointments) {
      if (appt.customerId != null) customerIdSet.add(appt.customerId);
    }
    const staffIdSet = new Set<number>();
    const serviceIdSet = new Set<number>();
    for (const appt of rawAppointments) {
      if (appt.staffId != null) staffIdSet.add(appt.staffId);
      if (appt.serviceId != null) serviceIdSet.add(appt.serviceId);
    }

    const customerIds = Array.from(customerIdSet);
    const staffIds = Array.from(staffIdSet);
    const serviceIds = Array.from(serviceIdSet);

    // Batch fetch related rows in parallel
    const [customersList, staffList, servicesList] = await Promise.all([
      storage.getCustomersByIds(customerIds).catch((err) => {
        console.error("[Dashboard] Error batch-fetching customers:", err);
        return [];
      }),
      storage.getStaffByIds(staffIds).catch((err) => {
        console.error("[Dashboard] Error batch-fetching staff:", err);
        return [];
      }),
      storage.getServicesByIds(serviceIds).catch((err) => {
        console.error("[Dashboard] Error batch-fetching services:", err);
        return [];
      }),
    ]);

    // Build O(1) lookup maps
    const customerMap = new Map(customersList.map((c) => [c.id, c]));
    const staffMap = new Map(staffList.map((s) => [s.id, s]));
    const serviceMap = new Map(servicesList.map((s) => [s.id, s]));

    // Hydrate invoices with customer
    const invoices = rawInvoices.map((invoice) => ({
      ...invoice,
      customer: invoice.customerId != null
        ? customerMap.get(invoice.customerId) ?? null
        : null,
    }));

    // Hydrate appointments with customer + staff + service
    const appointments = rawAppointments.map((appointment) => ({
      ...appointment,
      customer: appointment.customerId != null
        ? customerMap.get(appointment.customerId) ?? null
        : null,
      staff: appointment.staffId != null
        ? staffMap.get(appointment.staffId) ?? null
        : null,
      service: appointment.serviceId != null
        ? serviceMap.get(appointment.serviceId) ?? null
        : null,
    }));

    res.json({
      business: business ? sanitizeBusiness(business) : null,
      jobs,
      invoices,
      appointments,
      callLogs,
      quotes,
      usage,
      analytics,
    });
  } catch (error) {
    console.error("[Dashboard] Batched endpoint error:", error);
    res.status(500).json({ message: "Error fetching dashboard data" });
  }
});

export default router;
