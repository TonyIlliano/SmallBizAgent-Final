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
      invoices,
      appointments,
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

      // 3. All invoices (limit 50) with customer data
      storage
        .getInvoices(businessId)
        .then(async (allInvoices) => {
          const capped = allInvoices.slice(0, 50);
          // Populate customer for each invoice (needed for dashboard display)
          return Promise.all(
            capped.map(async (invoice) => {
              const customer = await storage.getCustomer(invoice.customerId).catch(() => null);
              return { ...invoice, customer };
            })
          );
        })
        .catch((err) => {
          console.error("[Dashboard] Error fetching invoices:", err);
          return [];
        }),

      // 4. Upcoming appointments (today's date, limit 50) with related data
      storage
        .getAppointments(businessId, {
          startDate: new Date(todayStr),
          endDate: new Date(todayStr),
        })
        .then(async (allAppointments) => {
          const capped = allAppointments.slice(0, 50);
          return Promise.all(
            capped.map(async (appointment) => {
              const [customer, staff, service] = await Promise.all([
                storage.getCustomer(appointment.customerId).catch(() => null),
                appointment.staffId
                  ? storage.getStaffMember(appointment.staffId).catch(() => null)
                  : null,
                appointment.serviceId
                  ? storage.getService(appointment.serviceId).catch(() => null)
                  : null,
              ]);
              return { ...appointment, customer, staff, service };
            })
          );
        })
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
