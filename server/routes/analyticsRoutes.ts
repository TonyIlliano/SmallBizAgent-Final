import { Request, Response } from "express";
import { z } from "zod";
import { isOwnerOrAdmin } from "../middleware/auth";
import * as analyticsService from "../services/analyticsService";

// Define validation schema for analytics requests
const analyticsRequestSchema = z.object({
  period: z.enum(['week', 'month', 'quarter', 'year']).default('month')
});

// Helper to get businessId from authenticated user
const getBusinessId = (req: Request): number => {
  if (req.isAuthenticated() && req.user?.businessId) {
    return req.user.businessId;
  }
  throw new Error('Business ID not found for authenticated user');
};

/**
 * Register analytics API routes
 */
export function registerAnalyticsRoutes(app: any) {
  /**
   * Get comprehensive business analytics
   */
  app.get("/api/analytics", isOwnerOrAdmin, async (req: Request, res: Response) => {
    try {
      // Get businessId from authenticated user (not query params)
      const businessId = getBusinessId(req);
      const { period = 'month' } = analyticsRequestSchema.parse({
        period: req.query.period || 'month'
      });

      // Get analytics data
      const analytics = await analyticsService.getBusinessAnalytics(businessId, period);

      res.json(analytics);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          message: "Invalid request parameters",
          errors: error.format()
        });
      }

      console.error("Error fetching analytics:", error);
      res.status(500).json({
        message: "Error fetching analytics",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  /**
   * Get revenue analytics
   */
  app.get("/api/analytics/revenue", isOwnerOrAdmin, async (req: Request, res: Response) => {
    try {
      // Get businessId from authenticated user (not query params)
      const businessId = getBusinessId(req);
      const { period = 'month' } = analyticsRequestSchema.parse({
        period: req.query.period || 'month'
      });
      
      // Get date range based on period
      const dateRange = {
        startDate: new Date(),
        endDate: new Date()
      };
      
      switch (period) {
        case 'week':
          dateRange.startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          dateRange.startDate = new Date();
          dateRange.startDate.setMonth(dateRange.startDate.getMonth() - 1);
          break;
        case 'quarter':
          dateRange.startDate = new Date();
          dateRange.startDate.setMonth(dateRange.startDate.getMonth() - 3);
          break;
        case 'year':
          dateRange.startDate = new Date();
          dateRange.startDate.setFullYear(dateRange.startDate.getFullYear() - 1);
          break;
      }
      
      // Get revenue analytics
      const revenueAnalytics = await analyticsService.getRevenueAnalytics(businessId, dateRange);
      
      res.json(revenueAnalytics);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid request parameters",
          errors: error.format() 
        });
      }
      
      console.error("Error fetching revenue analytics:", error);
      res.status(500).json({ 
        message: "Error fetching revenue analytics",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
  
  /**
   * Get job analytics
   */
  app.get("/api/analytics/jobs", isOwnerOrAdmin, async (req: Request, res: Response) => {
    try {
      // Validate and parse query parameters
      const businessId = getBusinessId(req);
      const { period = 'month' } = analyticsRequestSchema.parse({
        period: req.query.period || 'month'
      });
      
      // Get date range based on period
      const dateRange = {
        startDate: new Date(),
        endDate: new Date()
      };
      
      switch (period) {
        case 'week':
          dateRange.startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          dateRange.startDate = new Date();
          dateRange.startDate.setMonth(dateRange.startDate.getMonth() - 1);
          break;
        case 'quarter':
          dateRange.startDate = new Date();
          dateRange.startDate.setMonth(dateRange.startDate.getMonth() - 3);
          break;
        case 'year':
          dateRange.startDate = new Date();
          dateRange.startDate.setFullYear(dateRange.startDate.getFullYear() - 1);
          break;
      }
      
      // Get job analytics
      const jobAnalytics = await analyticsService.getJobAnalytics(businessId, dateRange);
      
      res.json(jobAnalytics);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid request parameters",
          errors: error.format() 
        });
      }
      
      console.error("Error fetching job analytics:", error);
      res.status(500).json({ 
        message: "Error fetching job analytics",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
  
  /**
   * Get appointment analytics
   */
  app.get("/api/analytics/appointments", isOwnerOrAdmin, async (req: Request, res: Response) => {
    try {
      // Validate and parse query parameters
      const businessId = getBusinessId(req);
      const { period = 'month' } = analyticsRequestSchema.parse({
        period: req.query.period || 'month'
      });
      
      // Get date range based on period
      const dateRange = {
        startDate: new Date(),
        endDate: new Date()
      };
      
      switch (period) {
        case 'week':
          dateRange.startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          dateRange.startDate = new Date();
          dateRange.startDate.setMonth(dateRange.startDate.getMonth() - 1);
          break;
        case 'quarter':
          dateRange.startDate = new Date();
          dateRange.startDate.setMonth(dateRange.startDate.getMonth() - 3);
          break;
        case 'year':
          dateRange.startDate = new Date();
          dateRange.startDate.setFullYear(dateRange.startDate.getFullYear() - 1);
          break;
      }
      
      // Get appointment analytics
      const appointmentAnalytics = await analyticsService.getAppointmentAnalytics(businessId, dateRange);
      
      res.json(appointmentAnalytics);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid request parameters",
          errors: error.format() 
        });
      }
      
      console.error("Error fetching appointment analytics:", error);
      res.status(500).json({ 
        message: "Error fetching appointment analytics",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
  
  /**
   * Get call analytics
   */
  app.get("/api/analytics/calls", isOwnerOrAdmin, async (req: Request, res: Response) => {
    try {
      // Validate and parse query parameters
      const businessId = getBusinessId(req);
      const { period = 'month' } = analyticsRequestSchema.parse({
        period: req.query.period || 'month'
      });
      
      // Get date range based on period
      const dateRange = {
        startDate: new Date(),
        endDate: new Date()
      };
      
      switch (period) {
        case 'week':
          dateRange.startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          dateRange.startDate = new Date();
          dateRange.startDate.setMonth(dateRange.startDate.getMonth() - 1);
          break;
        case 'quarter':
          dateRange.startDate = new Date();
          dateRange.startDate.setMonth(dateRange.startDate.getMonth() - 3);
          break;
        case 'year':
          dateRange.startDate = new Date();
          dateRange.startDate.setFullYear(dateRange.startDate.getFullYear() - 1);
          break;
      }
      
      // Get call analytics
      const callAnalytics = await analyticsService.getCallAnalytics(businessId, dateRange);
      
      res.json(callAnalytics);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid request parameters",
          errors: error.format() 
        });
      }
      
      console.error("Error fetching call analytics:", error);
      res.status(500).json({ 
        message: "Error fetching call analytics",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
  
  /**
   * Get customer analytics
   */
  app.get("/api/analytics/customers", isOwnerOrAdmin, async (req: Request, res: Response) => {
    try {
      // Validate and parse query parameters
      const businessId = getBusinessId(req);
      const { period = 'month' } = analyticsRequestSchema.parse({
        period: req.query.period || 'month'
      });
      
      // Get date range based on period
      const dateRange = {
        startDate: new Date(),
        endDate: new Date()
      };
      
      switch (period) {
        case 'week':
          dateRange.startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          dateRange.startDate = new Date();
          dateRange.startDate.setMonth(dateRange.startDate.getMonth() - 1);
          break;
        case 'quarter':
          dateRange.startDate = new Date();
          dateRange.startDate.setMonth(dateRange.startDate.getMonth() - 3);
          break;
        case 'year':
          dateRange.startDate = new Date();
          dateRange.startDate.setFullYear(dateRange.startDate.getFullYear() - 1);
          break;
      }
      
      // Get customer analytics
      const customerAnalytics = await analyticsService.getCustomerAnalytics(businessId, dateRange);
      
      res.json(customerAnalytics);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid request parameters",
          errors: error.format() 
        });
      }
      
      console.error("Error fetching customer analytics:", error);
      res.status(500).json({ 
        message: "Error fetching customer analytics",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });
  
  /**
   * Get performance metrics
   */
  app.get("/api/analytics/performance", isOwnerOrAdmin, async (req: Request, res: Response) => {
    try {
      // Validate and parse query parameters
      const businessId = getBusinessId(req);
      const { period = 'month' } = analyticsRequestSchema.parse({
        period: req.query.period || 'month'
      });
      
      // Get date range based on period
      const dateRange = {
        startDate: new Date(),
        endDate: new Date()
      };
      
      switch (period) {
        case 'week':
          dateRange.startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          dateRange.startDate = new Date();
          dateRange.startDate.setMonth(dateRange.startDate.getMonth() - 1);
          break;
        case 'quarter':
          dateRange.startDate = new Date();
          dateRange.startDate.setMonth(dateRange.startDate.getMonth() - 3);
          break;
        case 'year':
          dateRange.startDate = new Date();
          dateRange.startDate.setFullYear(dateRange.startDate.getFullYear() - 1);
          break;
      }
      
      // Get performance metrics
      const performanceMetrics = await analyticsService.getPerformanceMetrics(businessId, dateRange);
      
      res.json(performanceMetrics);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          message: "Invalid request parameters",
          errors: error.format() 
        });
      }
      
      console.error("Error fetching performance metrics:", error);
      res.status(500).json({ 
        message: "Error fetching performance metrics",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  });

  /**
   * Get staff performance metrics (per-staff breakdown)
   */
  app.get("/api/analytics/staff-performance", isOwnerOrAdmin, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const { period = 'month' } = analyticsRequestSchema.parse({
        period: req.query.period as string
      });

      const dateRange = { startDate: new Date(), endDate: new Date() };
      switch (period) {
        case 'week':
          dateRange.startDate = new Date();
          dateRange.startDate.setDate(dateRange.startDate.getDate() - 7);
          break;
        case 'month':
          dateRange.startDate = new Date();
          dateRange.startDate.setMonth(dateRange.startDate.getMonth() - 1);
          break;
        case 'quarter':
          dateRange.startDate = new Date();
          dateRange.startDate.setMonth(dateRange.startDate.getMonth() - 3);
          break;
        case 'year':
          dateRange.startDate = new Date();
          dateRange.startDate.setFullYear(dateRange.startDate.getFullYear() - 1);
          break;
      }

      const { db } = await import("../db");
      const { staff, appointments, jobs, invoices } = await import("@shared/schema");
      const { eq, and, gte, lte, sql } = await import("drizzle-orm");

      // Get all active staff
      const staffMembers = await db.select().from(staff).where(
        and(eq(staff.businessId, businessId), eq(staff.active, true))
      );

      const staffMetrics = await Promise.all(staffMembers.map(async (member) => {
        // Count appointments for this staff member
        const staffAppointments = await db.select({ count: sql<number>`count(*)` })
          .from(appointments)
          .where(and(
            eq(appointments.businessId, businessId),
            eq(appointments.staffId, member.id),
            gte(appointments.startDate, dateRange.startDate),
            lte(appointments.startDate, dateRange.endDate)
          ));

        const completedAppointments = await db.select({ count: sql<number>`count(*)` })
          .from(appointments)
          .where(and(
            eq(appointments.businessId, businessId),
            eq(appointments.staffId, member.id),
            eq(appointments.status, 'completed'),
            gte(appointments.startDate, dateRange.startDate),
            lte(appointments.startDate, dateRange.endDate)
          ));

        // Count jobs for this staff member
        const staffJobs = await db.select({ count: sql<number>`count(*)` })
          .from(jobs)
          .where(and(
            eq(jobs.businessId, businessId),
            eq(jobs.staffId, member.id),
            gte(jobs.createdAt, dateRange.startDate),
            lte(jobs.createdAt, dateRange.endDate)
          ));

        const completedJobs = await db.select({ count: sql<number>`count(*)` })
          .from(jobs)
          .where(and(
            eq(jobs.businessId, businessId),
            eq(jobs.staffId, member.id),
            eq(jobs.status, 'completed'),
            gte(jobs.createdAt, dateRange.startDate),
            lte(jobs.createdAt, dateRange.endDate)
          ));

        // Revenue from invoices linked to jobs assigned to this staff member
        const staffRevenue = await db.select({ total: sql<number>`COALESCE(SUM(${invoices.total}), 0)` })
          .from(invoices)
          .innerJoin(jobs, eq(invoices.jobId, jobs.id))
          .where(and(
            eq(jobs.businessId, businessId),
            eq(jobs.staffId, member.id),
            eq(invoices.status, 'paid'),
            gte(invoices.createdAt, dateRange.startDate),
            lte(invoices.createdAt, dateRange.endDate)
          ));

        return {
          id: member.id,
          name: `${member.firstName} ${member.lastName}`,
          role: member.role,
          specialty: member.specialty,
          appointments: Number(staffAppointments[0]?.count || 0),
          completedAppointments: Number(completedAppointments[0]?.count || 0),
          jobs: Number(staffJobs[0]?.count || 0),
          completedJobs: Number(completedJobs[0]?.count || 0),
          revenue: Number(staffRevenue[0]?.total || 0),
        };
      }));

      // Sort by revenue descending
      staffMetrics.sort((a, b) => b.revenue - a.revenue);

      res.json({ staff: staffMetrics, period });
    } catch (error) {
      console.error("Error fetching staff performance:", error);
      res.status(500).json({ message: "Error fetching staff performance metrics" });
    }
  });

  /**
   * Export analytics report as CSV
   */
  app.get("/api/analytics/export", isOwnerOrAdmin, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const { period = 'month' } = analyticsRequestSchema.parse({
        period: req.query.period as string
      });

      const dateRange = { startDate: new Date(), endDate: new Date() };
      switch (period) {
        case 'week':
          dateRange.startDate = new Date();
          dateRange.startDate.setDate(dateRange.startDate.getDate() - 7);
          break;
        case 'month':
          dateRange.startDate = new Date();
          dateRange.startDate.setMonth(dateRange.startDate.getMonth() - 1);
          break;
        case 'quarter':
          dateRange.startDate = new Date();
          dateRange.startDate.setMonth(dateRange.startDate.getMonth() - 3);
          break;
        case 'year':
          dateRange.startDate = new Date();
          dateRange.startDate.setFullYear(dateRange.startDate.getFullYear() - 1);
          break;
      }

      // Fetch all analytics data
      const [revenue, jobAnalytics, appointmentAnalytics, callAnalytics, customerAnalytics, performance] = await Promise.all([
        analyticsService.getRevenueAnalytics(businessId, dateRange),
        analyticsService.getJobAnalytics(businessId, dateRange),
        analyticsService.getAppointmentAnalytics(businessId, dateRange),
        analyticsService.getCallAnalytics(businessId, dateRange),
        analyticsService.getCustomerAnalytics(businessId, dateRange),
        analyticsService.getPerformanceMetrics(businessId, dateRange),
      ]);

      // Build CSV sections
      const lines: string[] = [];
      lines.push(`Analytics Report — ${period} (${dateRange.startDate.toLocaleDateString()} to ${dateRange.endDate.toLocaleDateString()})`);
      lines.push('');

      // Revenue Summary
      lines.push('REVENUE SUMMARY');
      lines.push('Metric,Value');
      lines.push(`Total Revenue,"$${(revenue as any).totalRevenue?.toFixed(2) || '0.00'}"`);
      lines.push(`Paid Revenue,"$${(revenue as any).paidRevenue?.toFixed(2) || '0.00'}"`);
      lines.push(`Pending Revenue,"$${(revenue as any).pendingRevenue?.toFixed(2) || '0.00'}"`);
      lines.push(`Overdue Revenue,"$${(revenue as any).overdueRevenue?.toFixed(2) || '0.00'}"`);
      lines.push('');

      // Jobs Summary
      lines.push('JOB SUMMARY');
      lines.push('Metric,Value');
      lines.push(`Total Jobs,${(jobAnalytics as any).totalJobs || 0}`);
      lines.push(`Completed Jobs,${(jobAnalytics as any).completedJobs || 0}`);
      lines.push(`In Progress,${(jobAnalytics as any).inProgressJobs || 0}`);
      lines.push('');

      // Appointments Summary
      lines.push('APPOINTMENT SUMMARY');
      lines.push('Metric,Value');
      lines.push(`Total Appointments,${(appointmentAnalytics as any).totalAppointments || 0}`);
      lines.push(`Completed,${(appointmentAnalytics as any).completedAppointments || 0}`);
      lines.push(`Upcoming,${(appointmentAnalytics as any).upcomingAppointments || 0}`);
      lines.push('');

      // Calls Summary
      lines.push('CALL SUMMARY');
      lines.push('Metric,Value');
      lines.push(`Total Calls,${(callAnalytics as any).totalCalls || 0}`);
      lines.push(`Answered,${(callAnalytics as any).answeredCalls || 0}`);
      lines.push(`Missed,${(callAnalytics as any).missedCalls || 0}`);
      lines.push('');

      // Customers Summary
      lines.push('CUSTOMER SUMMARY');
      lines.push('Metric,Value');
      lines.push(`Total Customers,${(customerAnalytics as any).totalCustomers || 0}`);
      lines.push(`New Customers,${(customerAnalytics as any).newCustomers || 0}`);
      lines.push(`Returning,${(customerAnalytics as any).returningCustomers || 0}`);
      lines.push('');

      // Performance
      lines.push('PERFORMANCE METRICS');
      lines.push('Metric,Value');
      lines.push(`Revenue per Job,"$${(performance as any).revenuePerJob?.toFixed(2) || '0.00'}"`);
      lines.push(`Job Completion Rate,${((performance as any).jobCompletionRate || 0).toFixed(1)}%`);
      lines.push(`Appointment Completion Rate,${((performance as any).appointmentCompletionRate || 0).toFixed(1)}%`);
      lines.push(`Call Conversion Rate,${((performance as any).callConversionRate || 0).toFixed(1)}%`);

      // Top Customers
      const topCustomers = (customerAnalytics as any).topCustomers || [];
      if (topCustomers.length > 0) {
        lines.push('');
        lines.push('TOP CUSTOMERS');
        lines.push('Name,Revenue,Jobs');
        for (const c of topCustomers) {
          lines.push(`"${c.customerName}","$${c.revenue?.toFixed(2) || '0.00'}",${c.jobCount || 0}`);
        }
      }

      const csv = lines.join('\n');
      const today = new Date().toISOString().split('T')[0];
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="analytics-report-${period}-${today}.csv"`);
      res.send(csv);
    } catch (error) {
      console.error("Error exporting analytics:", error);
      res.status(500).json({ message: "Error exporting analytics report" });
    }
  });

  /**
   * Get AI ROI analytics — the "money story" for the dashboard.
   * Shows: calls answered → bookings made → revenue generated → ROI
   */
  app.get("/api/analytics/ai-roi", isOwnerOrAdmin, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const { period = 'month' } = analyticsRequestSchema.parse({
        period: req.query.period
      });

      const now = new Date();
      let startDate: Date;
      switch (period) {
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'quarter':
          startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
          break;
        case 'year':
          startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
        default:
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
      }

      const roiData = await analyticsService.getAiRoiAnalytics(businessId, {
        startDate,
        endDate: now,
      });

      res.json({ period, ...roiData });
    } catch (error) {
      console.error("Error fetching AI ROI analytics:", error);
      res.status(500).json({ message: "Error fetching AI ROI analytics" });
    }
  });

  /**
   * Generate HTML business report (for download/print-to-PDF)
   */
  app.get("/api/analytics/report", isOwnerOrAdmin, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const { period = 'month' } = analyticsRequestSchema.parse({
        period: req.query.period as string || 'month'
      });

      const { generateReport } = await import("../services/weeklyReportService");
      const { html, subject } = await generateReport({ businessId, period: period as 'week' | 'month' | 'quarter' | 'year' });

      // If ?format=html, return raw HTML for download/print
      if (req.query.format === 'html') {
        const today = new Date().toISOString().split('T')[0];
        res.setHeader('Content-Type', 'text/html');
        res.setHeader('Content-Disposition', `attachment; filename="business-report-${period}-${today}.html"`);
        return res.send(html);
      }

      // Default: return JSON with HTML content for frontend rendering
      res.json({ html, subject, period });
    } catch (error) {
      console.error("Error generating report:", error);
      res.status(500).json({ message: "Error generating report" });
    }
  });

  /**
   * Email the business report to the owner
   */
  app.post("/api/analytics/report/email", isOwnerOrAdmin, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const { sendWeeklyReport } = await import("../services/weeklyReportService");
      const sent = await sendWeeklyReport(businessId);

      if (sent) {
        res.json({ message: "Report emailed successfully" });
      } else {
        res.status(500).json({ message: "Failed to send report email" });
      }
    } catch (error) {
      console.error("Error emailing report:", error);
      res.status(500).json({ message: "Error emailing report" });
    }
  });
}