import { Request, Response } from "express";
import { z } from "zod";
import { isAuthenticated } from "../auth";
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
  // Fallback for development
  return 1;
};

/**
 * Register analytics API routes
 */
export function registerAnalyticsRoutes(app: any) {
  /**
   * Get comprehensive business analytics
   */
  app.get("/api/analytics", isAuthenticated, async (req: Request, res: Response) => {
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
  app.get("/api/analytics/revenue", isAuthenticated, async (req: Request, res: Response) => {
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
  app.get("/api/analytics/jobs", isAuthenticated, async (req: Request, res: Response) => {
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
  app.get("/api/analytics/appointments", isAuthenticated, async (req: Request, res: Response) => {
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
  app.get("/api/analytics/calls", isAuthenticated, async (req: Request, res: Response) => {
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
  app.get("/api/analytics/customers", isAuthenticated, async (req: Request, res: Response) => {
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
  app.get("/api/analytics/performance", isAuthenticated, async (req: Request, res: Response) => {
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
}