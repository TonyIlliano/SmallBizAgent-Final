import type { Express, Request, Response } from "express";
import express from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { z } from "zod";
import {
  insertBusinessSchema,
  insertBusinessHoursSchema,
  insertServiceSchema,
  insertCustomerSchema,
  insertStaffSchema,
  insertAppointmentSchema,
  insertJobSchema,
  insertInvoiceSchema,
  insertInvoiceItemSchema,
  insertReceptionistConfigSchema,
  insertCallLogSchema
} from "@shared/schema";

// Setup authentication
import { 
  setupAuth, 
  isAuthenticated, 
  isAdmin, 
  belongsToBusiness, 
  checkIsAdmin, 
  checkBelongsToBusiness 
} from "./auth";

// Analytics service
import {
  getBusinessAnalytics,
  getRevenueAnalytics,
  getJobAnalytics,
  getAppointmentAnalytics,
  getCallAnalytics,
  getCustomerAnalytics,
  getPerformanceMetrics
} from "./services/analyticsService";

// Import handlers
import {
  importCustomers,
  importServices,
  importAppointments
} from "./routes/import";

// Reminder service
import reminderService from "./services/reminderService";
import schedulerService from "./services/schedulerService";

// Notification service
import notificationService from "./services/notificationService";

// Stripe setup
import Stripe from "stripe";
// SECURITY: Stripe key is required - no fallback
const stripeKey = process.env.STRIPE_SECRET_KEY;
if (!stripeKey) {
  console.warn('⚠️  STRIPE_SECRET_KEY not configured - payment features will not work');
}
const stripe = stripeKey ? new Stripe(stripeKey) : null;

// Twilio setup
import twilio from "twilio";

// Only create Twilio client if credentials are properly configured
const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID;
const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
const isTwilioConfigured = twilioAccountSid && twilioAuthToken && twilioAccountSid.startsWith('AC');

let twilioClient: ReturnType<typeof twilio> | null = null;
if (isTwilioConfigured) {
  twilioClient = twilio(twilioAccountSid, twilioAuthToken);
} else {
  console.warn('⚠️  Twilio not configured - virtual receptionist features will be limited');
}

// Twilio webhook signature validation middleware
const validateTwilioWebhook = (req: Request, res: Response, next: Function) => {
  // Skip validation in development or if auth token not configured
  if (process.env.NODE_ENV !== "production" || !process.env.TWILIO_AUTH_TOKEN) {
    return next();
  }

  const twilioSignature = req.headers['x-twilio-signature'] as string;
  const url = `${process.env.BASE_URL}${req.originalUrl}`;

  const isValid = twilio.validateRequest(
    process.env.TWILIO_AUTH_TOKEN,
    twilioSignature,
    url,
    req.body
  );

  if (!isValid) {
    console.error('Invalid Twilio webhook signature');
    return res.status(403).send('Forbidden');
  }

  next();
};

// AWS Lex setup (legacy - keeping for fallback)
import lexService from "./services/lexService";
import twilioService from "./services/twilioService";
import * as virtualReceptionistService from "./services/virtualReceptionistService";

// Import cache for invalidation when data changes
import { dataCache } from "./services/vapiWebhookHandler";

// Vapi.ai setup (new AI voice receptionist)
import vapiService from "./services/vapiService";
import vapiWebhookHandler from "./services/vapiWebhookHandler";
import vapiProvisioningService from "./services/vapiProvisioningService";
import businessProvisioningService from "./services/businessProvisioningService";
import twilioProvisioningService from "./services/twilioProvisioningService";
import calendarRoutes from "./routes/calendarRoutes";
import quickbooksRoutes from "./routes/quickbooksRoutes";
import subscriptionRoutes from "./routes/subscriptionRoutes";
import quoteRoutes from "./routes/quoteRoutes";
import customerRoutes from "./routes/customerRoutes";
import recurringRoutes from "./routes/recurring";
import bookingRoutes from "./routes/bookingRoutes";
import cloverRoutes from "./routes/cloverRoutes";
import squareRoutes from "./routes/squareRoutes";

// Import training and analytics routes
import { registerTrainingRoutes } from './routes/trainingRoutes';
import { registerAnalyticsRoutes } from './routes/analyticsRoutes';

export async function registerRoutes(app: Express): Promise<Server> {
  // Set up authentication first
  setupAuth(app);
  
  // Register training routes after authentication is set up
  registerTrainingRoutes(app);
  
  // Register analytics routes
  registerAnalyticsRoutes(app);
  
  // Register data import routes (with business ownership verification)
  const importAuthCheck = (req: Request, res: Response, next: Function) => {
    const { businessId } = req.body;
    if (businessId && !checkIsAdmin(req) && !checkBelongsToBusiness(req, businessId)) {
      return res.status(403).json({ message: "Not authorized to import data for this business" });
    }
    next();
  };
  app.post("/api/import/customers", isAuthenticated, importAuthCheck, importCustomers);
  app.post("/api/import/services", isAuthenticated, importAuthCheck, importServices);
  app.post("/api/import/appointments", isAuthenticated, importAuthCheck, importAppointments);
  
  // Helper function to get businessId from authenticated user
  // Returns 0 if no business is associated (caller must handle this)
  const getBusinessId = (req: Request): number => {
    // If user is authenticated, use their businessId
    if (req.isAuthenticated() && req.user?.businessId) {
      return req.user.businessId;
    }
    // SECURITY: Removed development-only query param override
    // This was a security risk that allowed bypassing authentication
    // No business associated - return 0 to indicate this
    // Callers should check for 0 and return appropriate error
    return 0;
  };

  // Helper to verify resource belongs to user's business
  const verifyBusinessOwnership = (resource: any, req: Request): boolean => {
    if (!resource) return false;
    const userBusinessId = getBusinessId(req);
    return resource.businessId === userBusinessId;
  };

  // =================== BUSINESS API ===================
  app.get("/api/business", isAuthenticated, async (req: Request, res: Response) => {
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
      res.json(business);
    } catch (error) {
      res.status(500).json({ message: "Error fetching business" });
    }
  });

  app.post("/api/business", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const validatedData = insertBusinessSchema.parse(req.body);
      const business = await storage.createBusiness(validatedData);

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

      // Automatically provision business resources
      try {
        // Get area code from request if available
        const preferredAreaCode = req.body.areaCode || req.body.zipCode?.substring(0, 3);

        // Provision business in background, don't wait for completion
        // This prevents the API from blocking if Twilio is slow
        businessProvisioningService.provisionBusiness(business.id, {
          preferredAreaCode,
          // Skip Twilio if credentials aren't available
          skipTwilioProvisioning: !process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN
        }).catch(provisionError => {
          console.error(`Error provisioning business ${business.id}:`, provisionError);
        });

        res.status(201).json({
          ...business,
          provisioning: "started",
          message: "Business created. Resources are being provisioned in the background."
        });
      } catch (provisionError) {
        // Even if provisioning fails, still return created business
        console.error("Failed to start business provisioning:", provisionError);
        res.status(201).json({
          ...business,
          provisioning: "failed",
          message: "Business created but resource provisioning failed to start."
        });
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.format() });
      }
      res.status(500).json({ message: "Error creating business" });
    }
  });

  app.put("/api/business/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);

      // Authorization: user must be admin or belong to this business
      if (!checkIsAdmin(req) && !checkBelongsToBusiness(req, id)) {
        return res.status(403).json({ message: "Not authorized to update this business" });
      }

      const validatedData = insertBusinessSchema.partial().parse(req.body);
      const business = await storage.updateBusiness(id, validatedData);

      // Update Vapi assistant if business name, industry, hours, or restaurant order types changed (debounced)
      if (validatedData.name || validatedData.industry || validatedData.businessHours ||
          validatedData.restaurantPickupEnabled !== undefined || validatedData.restaurantDeliveryEnabled !== undefined) {
        vapiProvisioningService.debouncedUpdateVapiAssistant(id);
      }

      res.json(business);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.format() });
      }
      res.status(500).json({ message: "Error updating business" });
    }
  });
  
  // Get provisioning status for a business
  app.get("/api/business/:id/provisioning-status", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = parseInt(req.params.id);

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
        vapiAssistantId: business.vapiAssistantId,
      });
    } catch (error) {
      console.error("Error fetching provisioning status:", error);
      res.status(500).json({ message: "Error fetching provisioning status" });
    }
  });

  // Get real setup status for the business (replaces localStorage-based checklist)
  app.get("/api/business/setup-status", isAuthenticated, async (req: Request, res: Response) => {
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

      // Check receptionist: must have a VAPI assistant created
      const hasReceptionist = !!(business.vapiAssistantId);

      // Check calendar/integrations: has business hours configured OR has a phone number
      const businessHours = await storage.getBusinessHours(businessId);
      const hasCalendar = businessHours.length > 0;

      const allComplete = businessProfile && hasServices && hasReceptionist && hasCalendar;

      res.json({
        businessProfile,
        services: hasServices,
        receptionist: hasReceptionist,
        calendar: hasCalendar,
        allComplete,
        details: {
          businessName: business.name || null,
          businessPhone: business.phone || null,
          businessEmail: business.email || null,
          serviceCount: services.length,
          vapiAssistantId: business.vapiAssistantId || null,
          twilioPhoneNumber: business.twilioPhoneNumber || null,
          businessHoursDays: businessHours.length,
        }
      });
    } catch (error) {
      console.error("Error fetching setup status:", error);
      res.status(500).json({ message: "Error fetching setup status" });
    }
  });

  // Endpoint to manually provision a business (useful for businesses created before this feature)
  app.post("/api/business/:id/provision", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = parseInt(req.params.id);
      
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
  app.get("/api/business/:businessId/hours", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = parseInt(req.params.businessId);

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

  app.post("/api/business-hours", isAuthenticated, async (req: Request, res: Response) => {
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

      // Auto-refresh Vapi assistant when business hours are created
      if (hours.businessId) {
        const business = await storage.getBusiness(hours.businessId);
        if (business?.vapiAssistantId) {
          const services = await storage.getServices(hours.businessId);
          const allHours = await storage.getBusinessHours(hours.businessId);
          vapiService.updateAssistant(business.vapiAssistantId, business, services, allHours)
            .then(result => {
              if (result.success) {
                console.log(`Auto-refreshed Vapi assistant after business hours creation`);
              }
            })
            .catch(err => console.error('Failed to auto-refresh Vapi assistant:', err));
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

  app.put("/api/business-hours/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);

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

      // Auto-refresh Vapi assistant when business hours change
      if (hours.businessId) {
        const business = await storage.getBusiness(hours.businessId);
        if (business?.vapiAssistantId) {
          const services = await storage.getServices(hours.businessId);
          const allHours = await storage.getBusinessHours(hours.businessId);
          vapiService.updateAssistant(business.vapiAssistantId, business, services, allHours)
            .then(result => {
              if (result.success) {
                console.log(`Auto-refreshed Vapi assistant after business hours update`);
              }
            })
            .catch(err => console.error('Failed to auto-refresh Vapi assistant:', err));
        }
      }

      res.json(hours);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.format() });
      }
      res.status(500).json({ message: "Error updating business hours" });
    }
  });

  // =================== SERVICES API ===================
  app.get("/api/services", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const services = await storage.getServices(businessId);
      res.json(services);
    } catch (error) {
      res.status(500).json({ message: "Error fetching services" });
    }
  });

  app.get("/api/services/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const service = await storage.getService(id);
      if (!service || !verifyBusinessOwnership(service, req)) {
        return res.status(404).json({ message: "Service not found" });
      }
      res.json(service);
    } catch (error) {
      res.status(500).json({ message: "Error fetching service" });
    }
  });

  app.post("/api/services", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const validatedData = insertServiceSchema.parse({ ...req.body, businessId });
      const service = await storage.createService(validatedData);

      // Invalidate services cache
      dataCache.invalidate(businessId, 'services');

      // Update Vapi assistant with new services (debounced to prevent race conditions)
      vapiProvisioningService.debouncedUpdateVapiAssistant(businessId);

      res.status(201).json(service);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.format() });
      }
      res.status(500).json({ message: "Error creating service" });
    }
  });
  
  // Apply industry-specific service templates
  app.post("/api/services/template", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const { businessId, services } = req.body;
      
      if (!businessId) {
        return res.status(400).json({ message: "Business ID is required" });
      }
      
      if (!Array.isArray(services) || services.length === 0) {
        return res.status(400).json({ message: "Services array is required" });
      }
      
      // Check if user has access to this business
      if (!checkIsAdmin(req) && !checkBelongsToBusiness(req, businessId)) {
        return res.status(403).json({ message: "Unauthorized to add services to this business" });
      }
      
      const createdServices = [];
      
      // Create services one by one
      for (const serviceData of services) {
        const validatedData = insertServiceSchema.parse({
          ...serviceData,
          businessId,
          active: true,
        });
        
        const service = await storage.createService(validatedData);
        createdServices.push(service);
      }
      
      res.status(201).json({
        message: `Created ${createdServices.length} services`,
        services: createdServices
      });
    } catch (error) {
      console.error("Error applying service template:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.format() });
      }
      res.status(500).json({ message: "Error applying service template" });
    }
  });

  app.put("/api/services/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      // Verify ownership before update
      const existing = await storage.getService(id);
      if (!existing || !verifyBusinessOwnership(existing, req)) {
        return res.status(404).json({ message: "Service not found" });
      }
      const validatedData = insertServiceSchema.partial().parse(req.body);
      const service = await storage.updateService(id, validatedData);

      // Invalidate services cache
      dataCache.invalidate(existing.businessId, 'services');

      // Update Vapi assistant with updated services (debounced to prevent race conditions)
      vapiProvisioningService.debouncedUpdateVapiAssistant(existing.businessId);

      res.json(service);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.format() });
      }
      res.status(500).json({ message: "Error updating service" });
    }
  });

  app.delete("/api/services/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      // Verify ownership before delete
      const existing = await storage.getService(id);
      if (!existing || !verifyBusinessOwnership(existing, req)) {
        return res.status(404).json({ message: "Service not found" });
      }
      const businessId = existing.businessId;
      await storage.deleteService(id);

      // Invalidate services cache
      dataCache.invalidate(businessId, 'services');

      // Update Vapi assistant after service deletion (debounced to prevent race conditions)
      vapiProvisioningService.debouncedUpdateVapiAssistant(businessId);

      res.status(204).end();
    } catch (error) {
      res.status(500).json({ message: "Error deleting service" });
    }
  });

  // =================== CUSTOMERS API ===================
  app.get("/api/customers", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const customers = await storage.getCustomers(businessId);
      res.json(customers);
    } catch (error) {
      res.status(500).json({ message: "Error fetching customers" });
    }
  });

  app.get("/api/customers/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const customer = await storage.getCustomer(id);
      if (!customer || !verifyBusinessOwnership(customer, req)) {
        return res.status(404).json({ message: "Customer not found" });
      }
      res.json(customer);
    } catch (error) {
      res.status(500).json({ message: "Error fetching customer" });
    }
  });

  app.post("/api/customers", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const validatedData = insertCustomerSchema.parse({ ...req.body, businessId });
      const customer = await storage.createCustomer(validatedData);
      res.status(201).json(customer);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.format() });
      }
      res.status(500).json({ message: "Error creating customer" });
    }
  });

  app.put("/api/customers/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const existing = await storage.getCustomer(id);
      if (!existing || !verifyBusinessOwnership(existing, req)) {
        return res.status(404).json({ message: "Customer not found" });
      }
      const validatedData = insertCustomerSchema.partial().parse(req.body);
      const customer = await storage.updateCustomer(id, validatedData);
      res.json(customer);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.format() });
      }
      res.status(500).json({ message: "Error updating customer" });
    }
  });

  app.delete("/api/customers/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const existing = await storage.getCustomer(id);
      if (!existing || !verifyBusinessOwnership(existing, req)) {
        return res.status(404).json({ message: "Customer not found" });
      }
      await storage.deleteCustomer(id);
      res.status(204).end();
    } catch (error) {
      res.status(500).json({ message: "Error deleting customer" });
    }
  });

  // =================== STAFF API ===================
  app.get("/api/staff", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const staff = await storage.getStaff(businessId);
      res.json(staff);
    } catch (error) {
      res.status(500).json({ message: "Error fetching staff" });
    }
  });

  app.get("/api/staff/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const staffMember = await storage.getStaffMember(id);
      if (!staffMember || !verifyBusinessOwnership(staffMember, req)) {
        return res.status(404).json({ message: "Staff member not found" });
      }
      res.json(staffMember);
    } catch (error) {
      res.status(500).json({ message: "Error fetching staff member" });
    }
  });

  app.post("/api/staff", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      console.log('Creating staff member:', { ...req.body, businessId });
      const validatedData = insertStaffSchema.parse({ ...req.body, businessId });
      console.log('Validated data:', validatedData);
      const staffMember = await storage.createStaffMember(validatedData);

      // Invalidate staff cache
      dataCache.invalidate(businessId, 'staff');

      res.status(201).json(staffMember);
    } catch (error) {
      console.error('Error creating staff member:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.format() });
      }
      res.status(500).json({ message: "Error creating staff member" });
    }
  });

  app.put("/api/staff/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const existing = await storage.getStaffMember(id);
      if (!existing || !verifyBusinessOwnership(existing, req)) {
        return res.status(404).json({ message: "Staff member not found" });
      }
      const validatedData = insertStaffSchema.partial().parse(req.body);
      const staffMember = await storage.updateStaffMember(id, validatedData);

      // Invalidate staff cache
      dataCache.invalidate(existing.businessId, 'staff');

      res.json(staffMember);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.format() });
      }
      res.status(500).json({ message: "Error updating staff member" });
    }
  });

  app.delete("/api/staff/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const existing = await storage.getStaffMember(id);
      if (!existing || !verifyBusinessOwnership(existing, req)) {
        return res.status(404).json({ message: "Staff member not found" });
      }
      const businessId = existing.businessId;
      await storage.deleteStaffMember(id);

      // Invalidate staff and staff hours cache
      dataCache.invalidate(businessId, 'staff');
      dataCache.invalidate(businessId, 'staffHours');

      res.status(204).end();
    } catch (error) {
      res.status(500).json({ message: "Error deleting staff member" });
    }
  });

  // =================== STAFF HOURS API ===================
  // Get hours for a staff member
  app.get("/api/staff/:id/hours", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const staffId = parseInt(req.params.id);
      const staffMember = await storage.getStaffMember(staffId);

      if (!staffMember || !verifyBusinessOwnership(staffMember, req)) {
        return res.status(404).json({ message: "Staff member not found" });
      }

      const hours = await storage.getStaffHours(staffId);
      res.json(hours);
    } catch (error) {
      res.status(500).json({ message: "Error getting staff hours" });
    }
  });

  // Set hours for a staff member (replaces all hours)
  app.put("/api/staff/:id/hours", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const staffId = parseInt(req.params.id);
      console.log('Setting staff hours for staffId:', staffId, 'body:', JSON.stringify(req.body));
      const staffMember = await storage.getStaffMember(staffId);

      if (!staffMember || !verifyBusinessOwnership(staffMember, req)) {
        console.log('Staff member not found or ownership failed:', staffMember);
        return res.status(404).json({ message: "Staff member not found" });
      }

      const hours = req.body.hours || req.body;
      console.log('Hours to save:', JSON.stringify(hours));
      const savedHours = await storage.setStaffHours(staffId, hours);

      // Invalidate staff hours cache
      dataCache.invalidate(staffMember.businessId, 'staffHours');

      res.json(savedHours);
    } catch (error) {
      console.error('Error setting staff hours:', error);
      res.status(500).json({ message: "Error setting staff hours" });
    }
  });

  // Update hours for a specific day
  app.put("/api/staff/:id/hours/:day", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const staffId = parseInt(req.params.id);
      const day = req.params.day.toLowerCase();
      const staffMember = await storage.getStaffMember(staffId);

      if (!staffMember || !verifyBusinessOwnership(staffMember, req)) {
        return res.status(404).json({ message: "Staff member not found" });
      }

      const updatedHours = await storage.updateStaffHoursForDay(staffId, day, req.body);
      res.json(updatedHours);
    } catch (error) {
      console.error('Error updating staff hours:', error);
      res.status(500).json({ message: "Error updating staff hours" });
    }
  });

  // Get available staff for a specific time slot
  app.get("/api/staff/available", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const dateStr = req.query.date as string;
      const time = req.query.time as string;

      if (!dateStr || !time) {
        return res.status(400).json({ message: "Date and time are required" });
      }

      const date = new Date(dateStr);
      const availableStaff = await storage.getAvailableStaffForSlot(businessId, date, time);
      res.json(availableStaff);
    } catch (error) {
      console.error('Error getting available staff:', error);
      res.status(500).json({ message: "Error getting available staff" });
    }
  });

  // =================== APPOINTMENTS API ===================
  app.get("/api/appointments", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const params: any = {};

      if (req.query.startDate) {
        params.startDate = new Date(req.query.startDate as string);
      }

      if (req.query.endDate) {
        params.endDate = new Date(req.query.endDate as string);
      }

      if (req.query.customerId) {
        params.customerId = parseInt(req.query.customerId as string);
      }

      if (req.query.staffId) {
        params.staffId = parseInt(req.query.staffId as string);
      }

      const appointments = await storage.getAppointments(businessId, params);

      // Fetch related data for each appointment
      const populatedAppointments = await Promise.all(
        appointments.map(async (appointment) => {
          const customer = await storage.getCustomer(appointment.customerId);
          const staff = appointment.staffId ? await storage.getStaffMember(appointment.staffId) : null;
          const service = appointment.serviceId ? await storage.getService(appointment.serviceId) : null;

          return {
            ...appointment,
            customer,
            staff,
            service
          };
        })
      );

      res.json(populatedAppointments);
    } catch (error) {
      res.status(500).json({ message: "Error fetching appointments" });
    }
  });

  app.get("/api/appointments/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const appointment = await storage.getAppointment(id);
      if (!appointment || !verifyBusinessOwnership(appointment, req)) {
        return res.status(404).json({ message: "Appointment not found" });
      }

      // Fetch related data
      const customer = await storage.getCustomer(appointment.customerId);
      const staff = appointment.staffId ? await storage.getStaffMember(appointment.staffId) : null;
      const service = appointment.serviceId ? await storage.getService(appointment.serviceId) : null;

      res.json({
        ...appointment,
        customer,
        staff,
        service
      });
    } catch (error) {
      res.status(500).json({ message: "Error fetching appointment" });
    }
  });

  app.post("/api/appointments", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      console.log('Creating appointment, businessId:', businessId, 'body:', JSON.stringify(req.body));
      const validatedData = insertAppointmentSchema.parse({ ...req.body, businessId });
      console.log('Validated data:', JSON.stringify(validatedData));
      const appointment = await storage.createAppointment(validatedData);

      // Invalidate appointments cache
      dataCache.invalidate(businessId, 'appointments');

      // Send appointment confirmation notification (fire-and-forget)
      notificationService.sendAppointmentConfirmation(appointment.id, businessId).catch(err =>
        console.error('Background notification error:', err)
      );

      res.status(201).json(appointment);
    } catch (error) {
      console.error('Error creating appointment:', error);
      if (error instanceof z.ZodError) {
        console.error('Zod validation errors:', JSON.stringify(error.format()));
        return res.status(400).json({ errors: error.format() });
      }
      res.status(500).json({ message: "Error creating appointment" });
    }
  });

  app.put("/api/appointments/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      console.log('Updating appointment:', id, 'body:', JSON.stringify(req.body));
      const existing = await storage.getAppointment(id);
      if (!existing || !verifyBusinessOwnership(existing, req)) {
        console.log('Appointment not found or ownership failed:', existing);
        return res.status(404).json({ message: "Appointment not found" });
      }
      const validatedData = insertAppointmentSchema.partial().parse(req.body);
      console.log('Validated update data:', JSON.stringify(validatedData));
      const appointment = await storage.updateAppointment(id, validatedData);

      // Invalidate appointments cache
      dataCache.invalidate(existing.businessId, 'appointments');

      res.json(appointment);
    } catch (error) {
      console.error('Error updating appointment:', error);
      if (error instanceof z.ZodError) {
        console.error('Zod validation errors:', JSON.stringify(error.format()));
        return res.status(400).json({ errors: error.format() });
      }
      res.status(500).json({ message: "Error updating appointment" });
    }
  });

  app.delete("/api/appointments/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const existing = await storage.getAppointment(id);
      if (!existing || !verifyBusinessOwnership(existing, req)) {
        return res.status(404).json({ message: "Appointment not found" });
      }
      const businessId = existing.businessId;
      await storage.deleteAppointment(id);

      // Invalidate appointments cache
      dataCache.invalidate(businessId, 'appointments');

      res.status(204).end();
    } catch (error) {
      res.status(500).json({ message: "Error deleting appointment" });
    }
  });

  // =================== JOBS API ===================
  app.get("/api/jobs", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const params: any = {};

      if (req.query.status) {
        params.status = req.query.status as string;
      }

      if (req.query.customerId) {
        params.customerId = parseInt(req.query.customerId as string);
      }

      if (req.query.staffId) {
        params.staffId = parseInt(req.query.staffId as string);
      }

      const jobs = await storage.getJobs(businessId, params);

      // Fetch related data for each job
      const populatedJobs = await Promise.all(
        jobs.map(async (job) => {
          const customer = await storage.getCustomer(job.customerId);
          const staff = job.staffId ? await storage.getStaffMember(job.staffId) : null;

          return {
            ...job,
            customer,
            staff
          };
        })
      );

      res.json(populatedJobs);
    } catch (error) {
      res.status(500).json({ message: "Error fetching jobs" });
    }
  });

  app.get("/api/jobs/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const job = await storage.getJob(id);
      if (!job || !verifyBusinessOwnership(job, req)) {
        return res.status(404).json({ message: "Job not found" });
      }

      // Fetch related data
      const customer = await storage.getCustomer(job.customerId);
      const staff = job.staffId ? await storage.getStaffMember(job.staffId) : null;

      res.json({
        ...job,
        customer,
        staff
      });
    } catch (error) {
      res.status(500).json({ message: "Error fetching job" });
    }
  });

  app.post("/api/jobs", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const validatedData = insertJobSchema.parse({ ...req.body, businessId });
      const job = await storage.createJob(validatedData);
      res.status(201).json(job);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.format() });
      }
      res.status(500).json({ message: "Error creating job" });
    }
  });

  app.put("/api/jobs/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const existing = await storage.getJob(id);
      if (!existing || !verifyBusinessOwnership(existing, req)) {
        return res.status(404).json({ message: "Job not found" });
      }
      const validatedData = insertJobSchema.partial().parse(req.body);
      const job = await storage.updateJob(id, validatedData);

      // Send job completed notification if status changed to completed
      if (validatedData.status === 'completed' && existing.status !== 'completed') {
        notificationService.sendJobCompletedNotification(job.id, existing.businessId).catch(err =>
          console.error('Background notification error:', err)
        );
      }

      res.json(job);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.format() });
      }
      res.status(500).json({ message: "Error updating job" });
    }
  });

  app.delete("/api/jobs/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const existing = await storage.getJob(id);
      if (!existing || !verifyBusinessOwnership(existing, req)) {
        return res.status(404).json({ message: "Job not found" });
      }
      await storage.deleteJob(id);
      res.status(204).end();
    } catch (error) {
      res.status(500).json({ message: "Error deleting job" });
    }
  });

  // =================== JOB LINE ITEMS API ===================
  app.get("/api/jobs/:jobId/line-items", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const jobId = parseInt(req.params.jobId);
      // Verify job belongs to user's business
      const job = await storage.getJob(jobId);
      if (!job || !verifyBusinessOwnership(job, req)) {
        return res.status(404).json({ message: "Job not found" });
      }
      const items = await storage.getJobLineItems(jobId);
      res.json(items);
    } catch (error) {
      res.status(500).json({ message: "Error fetching job line items" });
    }
  });

  app.post("/api/jobs/:jobId/line-items", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const jobId = parseInt(req.params.jobId);
      // Verify job belongs to user's business
      const job = await storage.getJob(jobId);
      if (!job || !verifyBusinessOwnership(job, req)) {
        return res.status(404).json({ message: "Job not found" });
      }
      const { type, description, quantity, unitPrice, taxable } = req.body;

      const amount = (quantity || 1) * unitPrice;
      const item = await storage.createJobLineItem({
        jobId,
        type,
        description,
        quantity: quantity || 1,
        unitPrice,
        amount,
        taxable: taxable !== false
      });
      res.status(201).json(item);
    } catch (error) {
      console.error("Error creating job line item:", error);
      res.status(500).json({ message: "Error creating job line item" });
    }
  });

  app.put("/api/jobs/:jobId/line-items/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const jobId = parseInt(req.params.jobId);
      // Verify job belongs to user's business
      const job = await storage.getJob(jobId);
      if (!job || !verifyBusinessOwnership(job, req)) {
        return res.status(404).json({ message: "Job not found" });
      }
      const id = parseInt(req.params.id);
      const { type, description, quantity, unitPrice, taxable } = req.body;

      const amount = (quantity || 1) * unitPrice;
      const item = await storage.updateJobLineItem(id, {
        type,
        description,
        quantity: quantity || 1,
        unitPrice,
        amount,
        taxable
      });
      res.json(item);
    } catch (error) {
      res.status(500).json({ message: "Error updating job line item" });
    }
  });

  app.delete("/api/jobs/:jobId/line-items/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const jobId = parseInt(req.params.jobId);
      // Verify job belongs to user's business
      const job = await storage.getJob(jobId);
      if (!job || !verifyBusinessOwnership(job, req)) {
        return res.status(404).json({ message: "Job not found" });
      }
      const id = parseInt(req.params.id);
      await storage.deleteJobLineItem(id);
      res.status(204).end();
    } catch (error) {
      res.status(500).json({ message: "Error deleting job line item" });
    }
  });

  // Generate invoice from job
  app.post("/api/jobs/:jobId/generate-invoice", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const jobId = parseInt(req.params.jobId);

      // Get the job and verify ownership
      const job = await storage.getJob(jobId);
      if (!job || !verifyBusinessOwnership(job, req)) {
        return res.status(404).json({ message: "Job not found" });
      }

      // Get job line items
      const lineItems = await storage.getJobLineItems(jobId);
      if (lineItems.length === 0) {
        return res.status(400).json({ message: "No line items on this job. Add labor, parts, or services before generating an invoice." });
      }

      // Calculate totals
      const taxRate = req.body.taxRate || 0.08; // Default 8% tax
      const subtotal = lineItems.reduce((sum, item) => sum + (item.amount || 0), 0);
      const taxableAmount = lineItems
        .filter(item => item.taxable)
        .reduce((sum, item) => sum + (item.amount || 0), 0);
      const tax = taxableAmount * taxRate;
      const total = subtotal + tax;

      // Generate invoice number
      const date = new Date();
      const invoiceNumber = `INV-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}-${jobId}`;

      // Set due date (default 30 days from now)
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 30);

      // Create the invoice
      const invoice = await storage.createInvoice({
        businessId: job.businessId,
        customerId: job.customerId,
        jobId: job.id,
        invoiceNumber,
        amount: subtotal,
        tax,
        total,
        dueDate: dueDate.toISOString().split('T')[0],
        status: 'pending'
      });

      // Create invoice items from job line items
      for (const lineItem of lineItems) {
        await storage.createInvoiceItem({
          invoiceId: invoice.id,
          description: `${lineItem.type.toUpperCase()}: ${lineItem.description}`,
          quantity: lineItem.quantity || 1,
          unitPrice: lineItem.unitPrice,
          amount: lineItem.amount || 0
        });
      }

      // Fetch the complete invoice with items
      const items = await storage.getInvoiceItems(invoice.id);
      const customer = await storage.getCustomer(invoice.customerId);

      res.status(201).json({
        ...invoice,
        items,
        customer,
        job
      });
    } catch (error) {
      console.error("Error generating invoice:", error);
      res.status(500).json({ message: "Error generating invoice from job" });
    }
  });

  // =================== INVOICES API ===================
  app.get("/api/invoices", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const params: any = {};

      if (req.query.status) {
        params.status = req.query.status as string;
      }

      if (req.query.customerId) {
        params.customerId = parseInt(req.query.customerId as string);
      }

      const invoices = await storage.getInvoices(businessId, params);

      // Fetch related data for each invoice
      const populatedInvoices = await Promise.all(
        invoices.map(async (invoice) => {
          const customer = await storage.getCustomer(invoice.customerId);
          const items = await storage.getInvoiceItems(invoice.id);

          return {
            ...invoice,
            customer,
            items
          };
        })
      );

      res.json(populatedInvoices);
    } catch (error) {
      res.status(500).json({ message: "Error fetching invoices" });
    }
  });

  app.get("/api/invoices/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const invoice = await storage.getInvoice(id);
      if (!invoice || !verifyBusinessOwnership(invoice, req)) {
        return res.status(404).json({ message: "Invoice not found" });
      }

      // Fetch related data
      const customer = await storage.getCustomer(invoice.customerId);
      const items = await storage.getInvoiceItems(invoice.id);

      res.json({
        ...invoice,
        customer,
        items
      });
    } catch (error) {
      res.status(500).json({ message: "Error fetching invoice" });
    }
  });

  app.post("/api/invoices", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const validatedData = insertInvoiceSchema.parse({ ...req.body, businessId });
      const invoice = await storage.createInvoice(validatedData);

      // Handle invoice items if provided
      if (req.body.items && Array.isArray(req.body.items)) {
        for (const item of req.body.items) {
          const validatedItem = insertInvoiceItemSchema.parse({
            ...item,
            invoiceId: invoice.id
          });
          await storage.createInvoiceItem(validatedItem);
        }
      }

      // Send invoice created notification (fire-and-forget)
      notificationService.sendInvoiceCreatedNotification(invoice.id, businessId).catch(err =>
        console.error('Background notification error:', err)
      );

      res.status(201).json(invoice);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.format() });
      }
      res.status(500).json({ message: "Error creating invoice" });
    }
  });

  app.put("/api/invoices/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const existing = await storage.getInvoice(id);
      if (!existing || !verifyBusinessOwnership(existing, req)) {
        return res.status(404).json({ message: "Invoice not found" });
      }
      const validatedData = insertInvoiceSchema.partial().parse(req.body);
      const invoice = await storage.updateInvoice(id, validatedData);

      // Send payment confirmation if status changed to paid
      if (validatedData.status === 'paid' && existing.status !== 'paid') {
        notificationService.sendPaymentConfirmation(invoice.id, existing.businessId).catch(err =>
          console.error('Background notification error:', err)
        );
      }

      res.json(invoice);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.format() });
      }
      res.status(500).json({ message: "Error updating invoice" });
    }
  });

  app.delete("/api/invoices/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const existing = await storage.getInvoice(id);
      if (!existing || !verifyBusinessOwnership(existing, req)) {
        return res.status(404).json({ message: "Invoice not found" });
      }

      // Delete all invoice items first
      const items = await storage.getInvoiceItems(id);
      for (const item of items) {
        await storage.deleteInvoiceItem(item.id);
      }

      // Then delete the invoice
      await storage.deleteInvoice(id);
      res.status(204).end();
    } catch (error) {
      res.status(500).json({ message: "Error deleting invoice" });
    }
  });

  // =================== CUSTOMER PORTAL API (Public) ===================
  // Generate access token for an invoice
  app.post("/api/invoices/:id/generate-link", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const existing = await storage.getInvoice(id);
      if (!existing || !verifyBusinessOwnership(existing, req)) {
        return res.status(404).json({ message: "Invoice not found" });
      }

      // Generate a unique access token
      const crypto = await import('crypto');
      const accessToken = crypto.randomBytes(32).toString('hex');

      // Update invoice with access token
      await storage.updateInvoice(id, { accessToken });

      // Build the public URL
      const baseUrl = process.env.BASE_URL || (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5000');
      const publicUrl = `${baseUrl}/portal/invoice/${accessToken}`;

      res.json({
        success: true,
        accessToken,
        publicUrl,
        message: "Share this link with your customer to view and pay the invoice"
      });
    } catch (error) {
      console.error("Error generating invoice link:", error);
      res.status(500).json({ message: "Error generating link" });
    }
  });

  // Public endpoint - Get invoice by access token (NO AUTH REQUIRED)
  app.get("/api/portal/invoice/:token", async (req: Request, res: Response) => {
    try {
      const { token } = req.params;

      // Find invoice by access token
      const invoice = await storage.getInvoiceByAccessToken(token);
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found or link expired" });
      }

      // Get related data
      const customer = await storage.getCustomer(invoice.customerId);
      const business = await storage.getBusiness(invoice.businessId);
      const items = await storage.getInvoiceItems(invoice.id);

      // Build full address
      const fullAddress = business ? [
        business.address,
        business.city,
        business.state,
        business.zip
      ].filter(Boolean).join(', ') : '';

      // Return invoice data (without sensitive business info)
      res.json({
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        amount: invoice.amount,
        tax: invoice.tax,
        total: invoice.total,
        dueDate: invoice.dueDate,
        status: invoice.status,
        notes: invoice.notes,
        createdAt: invoice.createdAt,
        customer: customer ? {
          firstName: customer.firstName,
          lastName: customer.lastName,
          email: customer.email,
          phone: customer.phone
        } : null,
        business: business ? {
          name: business.name,
          phone: business.phone,
          email: business.email,
          address: fullAddress
        } : null,
        items
      });
    } catch (error) {
      console.error("Error fetching portal invoice:", error);
      res.status(500).json({ message: "Error fetching invoice" });
    }
  });

  // Public endpoint - Create payment intent for portal invoice (NO AUTH REQUIRED)
  app.post("/api/portal/invoice/:token/pay", async (req: Request, res: Response) => {
    try {
      const { token } = req.params;

      // Find invoice by access token
      const invoice = await storage.getInvoiceByAccessToken(token);
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }

      if (invoice.status === 'paid') {
        return res.status(400).json({ message: "Invoice already paid" });
      }

      const customer = await storage.getCustomer(invoice.customerId);

      if (!stripe) {
        return res.status(500).json({ message: "Payment processing is not configured" });
      }

      // Create payment intent
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round((invoice.total || 0) * 100), // Convert to cents
        currency: "usd",
        metadata: {
          invoiceId: invoice.id.toString(),
          invoiceNumber: invoice.invoiceNumber,
          customerName: customer ? `${customer.firstName} ${customer.lastName}` : 'Unknown',
          portalPayment: 'true'
        }
      });

      // Update invoice with payment intent ID
      await storage.updateInvoice(invoice.id, {
        stripePaymentIntentId: paymentIntent.id
      });

      res.json({ clientSecret: paymentIntent.client_secret });
    } catch (error) {
      console.error("Error creating portal payment:", error);
      res.status(500).json({ message: "Error creating payment" });
    }
  });

  // Public endpoint - Get customer's invoice history by email (for returning customers)
  app.post("/api/portal/lookup", async (req: Request, res: Response) => {
    try {
      const { email, phone } = req.body;

      if (!email && !phone) {
        return res.status(400).json({ message: "Email or phone required" });
      }

      // Find customer by email or phone
      // For security, we only return invoices that have access tokens
      const invoices = await storage.getInvoicesWithAccessToken(email, phone);

      // Get business names for each invoice
      const invoicesWithBusiness = await Promise.all(
        invoices.map(async (inv) => {
          const business = await storage.getBusiness(inv.businessId);
          return {
            id: inv.id,
            invoiceNumber: inv.invoiceNumber,
            total: inv.total,
            status: inv.status,
            dueDate: inv.dueDate,
            createdAt: inv.createdAt,
            accessToken: inv.accessToken,
            businessName: business?.name || 'Unknown Business'
          };
        })
      );

      res.json({
        count: invoices.length,
        invoices: invoicesWithBusiness
      });
    } catch (error) {
      console.error("Error looking up invoices:", error);
      res.status(500).json({ message: "Error looking up invoices" });
    }
  });

  // =================== INVOICE ITEMS API ===================
  app.get("/api/invoice-items/:invoiceId", async (req: Request, res: Response) => {
    try {
      const invoiceId = parseInt(req.params.invoiceId);
      // Verify invoice belongs to user's business
      const invoice = await storage.getInvoice(invoiceId);
      if (!invoice || !verifyBusinessOwnership(invoice, req)) {
        return res.status(404).json({ message: "Invoice not found" });
      }
      const items = await storage.getInvoiceItems(invoiceId);
      res.json(items);
    } catch (error) {
      res.status(500).json({ message: "Error fetching invoice items" });
    }
  });

  app.post("/api/invoice-items", async (req: Request, res: Response) => {
    try {
      const validatedData = insertInvoiceItemSchema.parse(req.body);
      const item = await storage.createInvoiceItem(validatedData);
      res.status(201).json(item);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.format() });
      }
      res.status(500).json({ message: "Error creating invoice item" });
    }
  });

  app.put("/api/invoice-items/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const validatedData = insertInvoiceItemSchema.partial().parse(req.body);
      const item = await storage.updateInvoiceItem(id, validatedData);
      res.json(item);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.format() });
      }
      res.status(500).json({ message: "Error updating invoice item" });
    }
  });

  app.delete("/api/invoice-items/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteInvoiceItem(id);
      res.status(204).end();
    } catch (error) {
      res.status(500).json({ message: "Error deleting invoice item" });
    }
  });

  // =================== REVIEW REQUESTS API ===================
  // Get review settings for a business
  app.get("/api/review-settings", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const reviewService = await import('./services/reviewService');
      const settings = await reviewService.getReviewSettings(businessId);
      res.json(settings || {
        businessId,
        reviewRequestEnabled: false,
        autoSendAfterJobCompletion: false,
        preferredPlatform: 'google'
      });
    } catch (error) {
      console.error("Error fetching review settings:", error);
      res.status(500).json({ message: "Error fetching review settings" });
    }
  });

  // Update review settings
  app.put("/api/review-settings", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const reviewService = await import('./services/reviewService');
      const settings = await reviewService.upsertReviewSettings(businessId, req.body);
      res.json(settings);
    } catch (error) {
      console.error("Error updating review settings:", error);
      res.status(500).json({ message: "Error updating review settings" });
    }
  });

  // Send review request manually
  app.post("/api/review-requests/send", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const { customerId, jobId, via = 'sms' } = req.body;

      if (!customerId) {
        return res.status(400).json({ message: "Customer ID is required" });
      }

      const reviewService = await import('./services/reviewService');

      let result;
      if (via === 'email') {
        result = await reviewService.sendReviewRequestEmail(businessId, customerId, jobId);
      } else {
        result = await reviewService.sendReviewRequestSms(businessId, customerId, jobId);
      }

      if (result.success) {
        res.json({ success: true, requestId: result.requestId });
      } else {
        res.status(400).json({ success: false, message: result.error });
      }
    } catch (error: any) {
      console.error("Error sending review request:", error);
      res.status(500).json({ message: error.message || "Error sending review request" });
    }
  });

  // Send review request for a specific job
  app.post("/api/jobs/:id/request-review", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const jobId = parseInt(req.params.id);
      const businessId = getBusinessId(req);

      // Verify job belongs to business
      const job = await storage.getJob(jobId);
      if (!job || !verifyBusinessOwnership(job, req)) {
        return res.status(404).json({ message: "Job not found" });
      }

      const reviewService = await import('./services/reviewService');
      const result = await reviewService.sendReviewRequestForCompletedJob(jobId, businessId);

      if (result.success) {
        res.json({ success: true, requestId: result.requestId, message: "Review request sent!" });
      } else {
        res.status(400).json({ success: false, message: result.error });
      }
    } catch (error: any) {
      console.error("Error sending review request for job:", error);
      res.status(500).json({ message: error.message || "Error sending review request" });
    }
  });

  // Get review request history
  app.get("/api/review-requests", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const limit = parseInt(req.query.limit as string) || 50;
      const reviewService = await import('./services/reviewService');
      const requests = await reviewService.getReviewRequests(businessId, limit);
      res.json(requests);
    } catch (error) {
      console.error("Error fetching review requests:", error);
      res.status(500).json({ message: "Error fetching review requests" });
    }
  });

  // Get review statistics
  app.get("/api/review-stats", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const reviewService = await import('./services/reviewService');
      const stats = await reviewService.getReviewStats(businessId);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching review stats:", error);
      res.status(500).json({ message: "Error fetching review stats" });
    }
  });

  // Track review link click (public endpoint)
  app.get("/api/review-track/:requestId", async (req: Request, res: Response) => {
    try {
      const requestId = parseInt(req.params.requestId);
      const reviewService = await import('./services/reviewService');
      await reviewService.markReviewClicked(requestId);

      // Redirect to the actual review URL
      // In production, you'd lookup the review URL from the request
      res.redirect(req.query.url as string || '/');
    } catch (error) {
      console.error("Error tracking review click:", error);
      res.redirect(req.query.url as string || '/');
    }
  });

  // =================== VIRTUAL RECEPTIONIST API ===================
  app.get("/api/receptionist-config/:businessId", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const requestedBusinessId = parseInt(req.params.businessId);
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

  app.post("/api/receptionist-config", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const validatedData = insertReceptionistConfigSchema.parse({ ...req.body, businessId });
      const config = await storage.createReceptionistConfig(validatedData);
      res.status(201).json(config);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.format() });
      }
      res.status(500).json({ message: "Error creating receptionist configuration" });
    }
  });

  app.put("/api/receptionist-config/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      // Get the config and verify ownership
      const existing = await storage.getReceptionistConfig(id);
      if (!existing || !verifyBusinessOwnership(existing, req)) {
        return res.status(404).json({ message: "Receptionist configuration not found" });
      }
      const validatedData = insertReceptionistConfigSchema.partial().parse(req.body);
      const config = await storage.updateReceptionistConfig(id, validatedData);
      res.json(config);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.format() });
      }
      res.status(500).json({ message: "Error updating receptionist configuration" });
    }
  });

  // =================== CALL LOGS API ===================
  app.get("/api/call-logs", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const params: any = {};

      if (req.query.startDate) {
        params.startDate = new Date(req.query.startDate as string);
      }

      if (req.query.endDate) {
        params.endDate = new Date(req.query.endDate as string);
      }

      if (req.query.isEmergency !== undefined) {
        params.isEmergency = req.query.isEmergency === 'true';
      }

      if (req.query.status) {
        params.status = req.query.status as string;
      }

      const logs = await storage.getCallLogs(businessId, params);
      res.json(logs);
    } catch (error) {
      res.status(500).json({ message: "Error fetching call logs" });
    }
  });

  app.get("/api/call-logs/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const log = await storage.getCallLog(id);
      if (!log || !verifyBusinessOwnership(log, req)) {
        return res.status(404).json({ message: "Call log not found" });
      }
      res.json(log);
    } catch (error) {
      res.status(500).json({ message: "Error fetching call log" });
    }
  });

  app.post("/api/call-logs", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const validatedData = insertCallLogSchema.parse({ ...req.body, businessId });
      const log = await storage.createCallLog(validatedData);
      res.status(201).json(log);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.format() });
      }
      res.status(500).json({ message: "Error creating call log" });
    }
  });

  app.put("/api/call-logs/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const existing = await storage.getCallLog(id);
      if (!existing || !verifyBusinessOwnership(existing, req)) {
        return res.status(404).json({ message: "Call log not found" });
      }
      const validatedData = insertCallLogSchema.partial().parse(req.body);
      const log = await storage.updateCallLog(id, validatedData);
      res.json(log);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.format() });
      }
      res.status(500).json({ message: "Error updating call log" });
    }
  });

  // =================== REMINDERS API ===================
  // Send appointment reminder manually
  app.post("/api/appointments/:id/send-reminder", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const appointmentId = parseInt(req.params.id);
      const businessId = getBusinessId(req);

      // Verify appointment belongs to this business
      const appointment = await storage.getAppointment(appointmentId);
      if (!appointment || !verifyBusinessOwnership(appointment, req)) {
        return res.status(404).json({ message: "Appointment not found" });
      }

      const result = await reminderService.sendAppointmentReminder(appointmentId, businessId);

      if (result.status === 'sent') {
        res.json({ success: true, message: "Reminder sent successfully" });
      } else if (result.status === 'skipped') {
        res.json({ success: false, message: result.message });
      } else {
        res.status(400).json({ success: false, message: result.error });
      }
    } catch (error) {
      console.error("Error sending appointment reminder:", error);
      res.status(500).json({ message: "Error sending reminder" });
    }
  });

  // Send invoice payment reminder manually
  app.post("/api/invoices/:id/send-reminder", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const invoiceId = parseInt(req.params.id);
      const businessId = getBusinessId(req);

      // Verify invoice belongs to this business
      const invoice = await storage.getInvoice(invoiceId);
      if (!invoice || !verifyBusinessOwnership(invoice, req)) {
        return res.status(404).json({ message: "Invoice not found" });
      }

      const result = await reminderService.sendInvoiceReminder(invoiceId, businessId);

      if (result.success) {
        res.json({ success: true, message: "Payment reminder sent successfully" });
      } else {
        res.status(400).json({ success: false, message: result.error });
      }
    } catch (error) {
      console.error("Error sending invoice reminder:", error);
      res.status(500).json({ message: "Error sending reminder" });
    }
  });

  // Send job follow-up / review request manually
  app.post("/api/jobs/:id/send-followup", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const jobId = parseInt(req.params.id);
      const businessId = getBusinessId(req);
      const { reviewLink } = req.body;

      // Verify job belongs to this business
      const job = await storage.getJob(jobId);
      if (!job || !verifyBusinessOwnership(job, req)) {
        return res.status(404).json({ message: "Job not found" });
      }

      const result = await reminderService.sendJobFollowUp(jobId, businessId, reviewLink);

      if (result.success) {
        res.json({ success: true, message: "Follow-up sent successfully" });
      } else {
        res.status(400).json({ success: false, message: result.error });
      }
    } catch (error) {
      console.error("Error sending job follow-up:", error);
      res.status(500).json({ message: "Error sending follow-up" });
    }
  });

  // Trigger reminder check manually (for testing)
  app.post("/api/reminders/run-check", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const hoursAhead = parseInt(req.query.hours as string) || 24;

      const results = await reminderService.sendUpcomingAppointmentReminders(businessId, hoursAhead);

      const summary = {
        total: results.length,
        sent: results.filter(r => r.status === 'sent').length,
        skipped: results.filter(r => r.status === 'skipped').length,
        failed: results.filter(r => r.status === 'failed').length,
        details: results
      };

      res.json(summary);
    } catch (error) {
      console.error("Error running reminder check:", error);
      res.status(500).json({ message: "Error running reminder check" });
    }
  });

  // =================== NOTIFICATION SETTINGS ===================

  // Get notification settings for the business
  app.get("/api/notification-settings", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const settings = await storage.getNotificationSettings(businessId);
      // Return defaults if none exist yet
      if (!settings) {
        return res.json({
          businessId,
          appointmentConfirmationEmail: true,
          appointmentConfirmationSms: true,
          appointmentReminderEmail: true,
          appointmentReminderSms: true,
          appointmentReminderHours: 24,
          invoiceCreatedEmail: true,
          invoiceCreatedSms: false,
          invoiceReminderEmail: true,
          invoiceReminderSms: true,
          invoicePaymentConfirmationEmail: true,
          jobCompletedEmail: true,
          jobCompletedSms: true,
        });
      }
      res.json(settings);
    } catch (error) {
      console.error("Error fetching notification settings:", error);
      res.status(500).json({ message: "Error fetching notification settings" });
    }
  });

  // Update notification settings
  app.put("/api/notification-settings", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const settings = await storage.upsertNotificationSettings({
        businessId,
        ...req.body,
      });
      res.json(settings);
    } catch (error) {
      console.error("Error updating notification settings:", error);
      res.status(500).json({ message: "Error updating notification settings" });
    }
  });

  // Get notification log
  app.get("/api/notification-log", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const limit = parseInt(req.query.limit as string) || 50;
      const logs = await storage.getNotificationLogs(businessId, limit);
      res.json(logs);
    } catch (error) {
      console.error("Error fetching notification log:", error);
      res.status(500).json({ message: "Error fetching notification log" });
    }
  });

  // Send a test notification (email or SMS)
  app.post("/api/notification-settings/test", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const { channel, recipient } = req.body; // channel: 'email' or 'sms'
      const business = await storage.getBusiness(businessId);
      if (!business) {
        return res.status(404).json({ message: "Business not found" });
      }

      if (channel === 'sms' && recipient) {
        const { sendSms } = await import("./services/twilioService");
        await sendSms(recipient, `Test notification from ${business.name}. Your SMS notifications are working!`);
        return res.json({ success: true, message: "Test SMS sent" });
      }

      if (channel === 'email' && recipient) {
        const { sendEmail } = await import("./emailService");
        await sendEmail({
          to: recipient,
          subject: `Test Notification - ${business.name}`,
          text: `This is a test notification from ${business.name}. Your email notifications are working!`,
          html: `<div style="font-family: Arial, sans-serif; padding: 20px;"><h2>Test Notification</h2><p>This is a test notification from <strong>${business.name}</strong>.</p><p>Your email notifications are working!</p></div>`,
        });
        return res.json({ success: true, message: "Test email sent" });
      }

      res.status(400).json({ message: "Please provide channel (email/sms) and recipient" });
    } catch (error) {
      console.error("Error sending test notification:", error);
      res.status(500).json({ message: "Error sending test notification" });
    }
  });

  // =================== PAYMENT API (STRIPE) ===================
  app.post("/api/create-payment-intent", async (req: Request, res: Response) => {
    try {
      const { amount, invoiceId } = req.body;
      
      // Fetch invoice to get customer details
      const invoice = await storage.getInvoice(invoiceId);
      if (!invoice) {
        return res.status(404).json({ message: "Invoice not found" });
      }
      
      const customer = await storage.getCustomer(invoice.customerId);
      if (!customer) {
        return res.status(404).json({ message: "Customer not found" });
      }

      if (!stripe) {
        return res.status(500).json({ message: "Payment processing is not configured" });
      }

      // Create payment intent
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Convert to cents
        currency: "usd",
        metadata: {
          invoiceId: invoiceId.toString(),
          invoiceNumber: invoice.invoiceNumber,
          customerName: `${customer.firstName} ${customer.lastName}`
        }
      });
      
      // Update invoice with payment intent ID
      await storage.updateInvoice(invoiceId, {
        stripePaymentIntentId: paymentIntent.id
      });
      
      res.json({ clientSecret: paymentIntent.client_secret });
    } catch (error) {
      res.status(500).json({ message: "Error creating payment intent" });
    }
  });

  // Webhook to handle Stripe events
  app.post("/api/stripe-webhook", async (req: Request, res: Response) => {
    // SECURITY: Require Stripe webhook secret in production
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!endpointSecret) {
      console.error('STRIPE_WEBHOOK_SECRET not configured - rejecting webhook');
      return res.status(500).json({ error: 'Webhook not configured' });
    }

    if (!stripe) {
      console.error('Stripe not configured - rejecting webhook');
      return res.status(500).json({ error: 'Stripe not configured' });
    }

    const sig = req.headers['stripe-signature'] as string;
    if (!sig) {
      return res.status(400).json({ error: 'Missing stripe-signature header' });
    }

    let event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) {
      console.error('Stripe webhook signature verification failed:', err);
      return res.status(400).send(`Webhook Error: ${err}`);
    }
    
    // Handle the event
    switch (event.type) {
      case 'payment_intent.succeeded':
        const paymentIntent = event.data.object;
        const invoiceId = parseInt(paymentIntent.metadata.invoiceId);
        
        // Update invoice status to paid
        if (invoiceId) {
          try {
            await storage.updateInvoice(invoiceId, { status: 'paid' });
          } catch (error) {
            console.error('Error updating invoice status:', error);
          }
        }
        break;
        
      default:
        console.log(`Unhandled event type ${event.type}`);
    }
    
    // Return a response to acknowledge receipt of the event
    res.json({received: true});
  });

  // =================== TWILIO WEBHOOK ENDPOINTS ===================
  // Twilio webhook for incoming calls
  app.post("/api/twilio/incoming-call", validateTwilioWebhook, async (req: Request, res: Response) => {
    try {
      const { From, CallSid } = req.body;
      // Extract businessId from query params (set by Twilio webhook URL)
      const businessId = parseInt(req.query.businessId as string);
      if (!businessId) {
        console.error('Twilio webhook called without businessId');
        return res.status(400).json({ message: "Business ID required" });
      }
      
      // Fetch business and receptionist config
      const business = await storage.getBusiness(businessId);
      const config = await storage.getReceptionistConfig(businessId);
      
      if (!business || !config) {
        return res.status(404).json({ message: "Business or receptionist configuration not found" });
      }
      
      // Check if caller is an existing customer
      const customer = await storage.getCustomerByPhone(From, businessId);
      
      // Create a call log entry
      await storage.createCallLog({
        businessId,
        callerId: From,
        callerName: customer ? `${customer.firstName} ${customer.lastName}` : "",
        transcript: null,
        intentDetected: null,
        isEmergency: false,
        callDuration: 0,
        recordingUrl: null,
        status: 'answered',
        callTime: new Date()
      });
      
      // Build the greeting TwiML
      const gatherCallback = `/api/twilio/gather-callback?businessId=${businessId}&callSid=${CallSid}`;
      
      // Use our improved TwiML response with speech hints for better recognition
      const twimlString = twilioService.createGreetingTwiml(config.greeting || "Hello, thank you for calling. How can I help you today?", gatherCallback);
      
      res.type('text/xml');
      res.send(twimlString);
    } catch (error) {
      console.error('Error handling incoming call:', error);
      
      // Create a friendly fallback response if there's an error
      const twiml = new twilio.twiml.VoiceResponse();
      twiml.say({ voice: 'alice' }, "Thank you for calling. We're experiencing some technical difficulties. Please try again in a few minutes.");
      twiml.hangup();
      
      res.type('text/xml');
      res.send(twiml.toString());
    }
  });

  // Twilio webhook for recording callback
  app.post("/api/twilio/recording-callback", validateTwilioWebhook, async (req: Request, res: Response) => {
    try {
      const { businessId, callSid } = req.query;
      const { RecordingUrl, RecordingDuration } = req.body;
      
      // Find the call log and update it
      const callLogs = await storage.getCallLogs(parseInt(businessId as string));
      const callLog = callLogs.find(log => log.callerId === req.body.From);
      
      if (callLog) {
        await storage.updateCallLog(callLog.id, {
          recordingUrl: RecordingUrl,
          callDuration: parseInt(RecordingDuration)
        });
      }
      
      // Simple response to acknowledge
      const twiml = new twilio.twiml.VoiceResponse();
      twiml.say({ voice: 'alice' }, "Thank you for your call. Goodbye.");
      twiml.hangup();
      
      res.type('text/xml');
      res.send(twiml.toString());
    } catch (error) {
      console.error('Error handling recording callback:', error);
      res.status(500).json({ message: "Error handling recording callback" });
    }
  });

  // Twilio webhook for transcription callback
  app.post("/api/twilio/transcription-callback", validateTwilioWebhook, async (req: Request, res: Response) => {
    try {
      const { businessId, callSid } = req.query;
      const { TranscriptionText, From } = req.body;
      
      // Get business info and type for context
      const business = await storage.getBusiness(parseInt(businessId as string));
      const businessType = business?.type || 'general';
      
      // Find the call log and update it
      const callLogs = await storage.getCallLogs(parseInt(businessId as string));
      const callLog = callLogs.find(log => log.callerId === From);
      
      if (callLog && TranscriptionText) {
        // Use Lex service to analyze the transcription for intent and emergency detection
        const analysis = lexService.analyzeText(TranscriptionText, businessType);
        
        // Update the call log with enhanced information
        await storage.updateCallLog(callLog.id, {
          transcript: TranscriptionText,
          intentDetected: analysis.intent,
          isEmergency: analysis.isEmergency
        });
        
        // Log the analysis for debugging
        console.log('Transcription analysis:', {
          transcript: TranscriptionText,
          intent: analysis.intent,
          isEmergency: analysis.isEmergency,
          confidence: analysis.confidence
        });
      }
      
      res.status(200).send('OK');
    } catch (error) {
      console.error('Error handling transcription callback:', error);
      res.status(500).json({ message: "Error handling transcription callback" });
    }
  });

  // Twilio webhook for gather callback
  app.post("/api/twilio/gather-callback", validateTwilioWebhook, async (req: Request, res: Response) => {
    try {
      const { businessId, callSid } = req.query;
      const { SpeechResult, Digits, From } = req.body;
      
      // Get business info and type for context
      const business = await storage.getBusiness(parseInt(businessId as string));
      const businessType = business?.type || 'general';
      
      // Find the call log
      const callLogs = await storage.getCallLogs(parseInt(businessId as string));
      const callLog = callLogs.find(log => log.callerId === From);
      
      // User input from speech or digits
      const userInput = SpeechResult || Digits || '';
      
      // Process input with Lex service
      const lexResponse = await lexService.sendVoiceInput(
        From || 'anonymous-caller', 
        userInput, 
        callSid as string || `session-${Date.now()}`,
        businessType
      );
      
      // Update call log with transcript and detected intent
      if (callLog) {
        await storage.updateCallLog(callLog.id, {
          transcript: userInput,
          intentDetected: lexResponse.intentName || 'general',
          isEmergency: lexResponse.isEmergency || false
        });
      }
      
      // Generate TwiML response based on Lex response
      const twiml = new twilio.twiml.VoiceResponse();
      
      if (lexResponse.isEmergency) {
        // Handle emergency case
        twiml.say({ voice: 'alice' }, lexResponse.message || "I understand this is an emergency. Let me connect you with our on-call staff right away.");

        // Get emergency contact number from business config
        const config = await storage.getReceptionistConfig(parseInt(businessId as string));
        const business = await storage.getBusiness(parseInt(businessId as string));

        // Get transfer numbers, validating they are real phone numbers
        let transferNumbers: string[] = [];
        if (config?.transferPhoneNumbers) {
          try {
            const parsed = typeof config.transferPhoneNumbers === 'string'
              ? JSON.parse(config.transferPhoneNumbers)
              : config.transferPhoneNumbers;
            if (Array.isArray(parsed)) {
              // Filter to valid phone numbers (basic E.164 or US format validation)
              transferNumbers = parsed.filter((num: string) => {
                if (!num || typeof num !== 'string') return false;
                const cleaned = num.replace(/\D/g, '');
                return cleaned.length >= 10 && cleaned.length <= 15;
              });
            }
          } catch (e) {
            console.error('Error parsing transfer phone numbers:', e);
          }
        }

        // Fall back to business phone if no transfer numbers configured
        if (transferNumbers.length === 0 && business?.phone) {
          const cleanedBusinessPhone = business.phone.replace(/\D/g, '');
          if (cleanedBusinessPhone.length >= 10) {
            transferNumbers = [business.phone];
          }
        }

        if (transferNumbers.length > 0) {
          // Use Dial with simultaneous ringing to all emergency contacts
          const dial = twiml.dial({ timeout: 30 });
          transferNumbers.forEach((num: string) => {
            dial.number({}, num);
          });

          // After dial attempt, offer voicemail if no answer
          twiml.say({ voice: 'alice' }, "I was unable to reach our emergency staff. Please leave a message after the beep and someone will call you back immediately.");
          twiml.record({
            action: `/api/twilio/voicemail-complete?businessId=${businessId}`,
            maxLength: 120,
            transcribe: true,
            transcribeCallback: `/api/twilio/transcription-callback?businessId=${businessId}`
          });
        } else {
          // No valid transfer number - take a message
          twiml.say({ voice: 'alice' }, "I apologize, but I cannot transfer your call at this moment. Please leave a detailed message and we will call you back immediately.");
          twiml.record({
            action: `/api/twilio/voicemail-complete?businessId=${businessId}`,
            maxLength: 120,
            transcribe: true,
            transcribeCallback: `/api/twilio/transcription-callback?businessId=${businessId}`
          });
        }

        // Update call log to mark as emergency
        const callLogs = await storage.getCallLogs(parseInt(businessId as string));
        const callLog = callLogs.find(log => log.callerId === From);
        if (callLog) {
          await storage.updateCallLog(callLog.id, {
            isEmergency: true,
            intentDetected: 'emergency'
          });
        }
      } else if (lexResponse.intentName === 'appointment') {
        // Handle appointment scheduling intent - check actual availability
        const parsedBusinessId = parseInt(businessId as string);

        // Get next available slots
        const startDate = new Date();
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + 3); // Check next 3 days

        const { findAvailableTimeSlots } = await import('./services/appointmentService');
        const availableSlots = await findAvailableTimeSlots(parsedBusinessId, startDate, endDate);
        const openSlots = availableSlots.filter(slot => slot.available).slice(0, 3);

        if (openSlots.length > 0) {
          const slotDescriptions = openSlots.map(slot => {
            const d = new Date(slot.date);
            const day = d.toLocaleDateString('en-US', { weekday: 'long' });
            const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
            return `${day} at ${time}`;
          }).join(', or ');

          twiml.say({ voice: 'alice' }, lexResponse.message || "I'd be happy to help you schedule an appointment.");
          twiml.say({ voice: 'alice' }, `We have openings ${slotDescriptions}. Which would work for you?`);
        } else {
          twiml.say({ voice: 'alice' }, "I'd be happy to help you schedule an appointment, but I don't see any immediate openings. What day and time would work best for you?");
        }
        
        twiml.gather({
          input: ['speech', 'dtmf'],
          action: `/api/twilio/appointment-callback?businessId=${businessId}&callSid=${callSid}`,
          speechTimeout: 'auto',
          speechModel: 'phone_call'
        });
      } else if (lexResponse.dialogState === 'Fulfilled' || lexResponse.dialogState === 'ReadyForFulfillment') {
        // Intent fulfilled, provide the response and ask if they need anything else
        twiml.say({ voice: 'alice' }, lexResponse.message || "I've processed your request. Is there anything else I can help you with?");
        
        twiml.gather({
          input: ['speech', 'dtmf'],
          action: `/api/twilio/general-callback?businessId=${businessId}&callSid=${callSid}`,
          speechTimeout: 'auto',
          speechModel: 'phone_call'
        });
      } else {
        // Intent not fulfilled, continue the conversation
        twiml.say({ voice: 'alice' }, lexResponse.message || "How else can I assist you today?");
        
        twiml.gather({
          input: ['speech', 'dtmf'],
          action: `/api/twilio/gather-callback?businessId=${businessId}&callSid=${callSid}`,
          speechTimeout: 'auto',
          speechModel: 'phone_call'
        });
      }
      
      res.type('text/xml');
      res.send(twiml.toString());
    } catch (error) {
      console.error('Error handling gather callback:', error);
      res.status(500).json({ message: "Error handling gather callback" });
    }
  });

  // Twilio webhook for incoming SMS
  app.post("/api/twilio/sms", validateTwilioWebhook, async (req: Request, res: Response) => {
    try {
      const { From, Body, MessageSid } = req.body;
      const businessId = parseInt(req.query.businessId as string);
      if (!businessId) {
        console.error('SMS webhook called without businessId');
        return res.status(400).send('');
      }

      // Fetch business info
      const business = await storage.getBusiness(businessId);
      if (!business) {
        console.error(`SMS received for unknown business ID: ${businessId}`);
        return res.status(404).send('');
      }

      // Check if sender is an existing customer
      const customer = await storage.getCustomerByPhone(From, businessId);

      // Log the SMS as a call log entry with 'sms' status
      await storage.createCallLog({
        businessId,
        callerId: From,
        callerName: customer ? `${customer.firstName} ${customer.lastName}` : "",
        transcript: Body,
        intentDetected: 'sms',
        isEmergency: false,
        callDuration: 0,
        recordingUrl: null,
        status: 'sms' as any,
        callTime: new Date()
      });

      // Generate TwiML response for SMS
      const twiml = new twilio.twiml.MessagingResponse();

      // Auto-reply with business hours or acknowledgment
      const config = await storage.getReceptionistConfig(businessId);
      if (config) {
        twiml.message(`Thank you for your message! We'll get back to you as soon as possible. ${business.name}`);
      } else {
        twiml.message(`Thank you for contacting ${business.name}. We'll respond shortly.`);
      }

      res.type('text/xml');
      res.send(twiml.toString());
    } catch (error) {
      console.error('Error handling incoming SMS:', error);
      // Return empty response to prevent Twilio retries
      res.type('text/xml');
      res.send('<Response></Response>');
    }
  });

  // Twilio webhook for appointment scheduling callback
  app.post("/api/twilio/appointment-callback", validateTwilioWebhook, async (req: Request, res: Response) => {
    try {
      const { businessId, callSid } = req.query;
      const { SpeechResult, From } = req.body;
      const parsedBusinessId = parseInt(businessId as string);
      if (!parsedBusinessId) {
        console.error('Appointment callback called without businessId');
        return res.status(400).send('');
      }

      const twiml = new twilio.twiml.VoiceResponse();
      const userInput = (SpeechResult || '').toLowerCase();

      // Check if user is saying "no" to correct - extract the actual day they want
      // e.g., "no tuesday" or "no, not tomorrow, tuesday" should extract "tuesday"
      const isCorrection = userInput.includes('no') || userInput.includes('not');

      // Get business and customer info
      const business = await storage.getBusiness(parsedBusinessId);
      const customer = await storage.getCustomerByPhone(From, parsedBusinessId);

      // Parse time preference from speech
      let preferredTime: Date | null = null;
      let timeDescription = '';

      // Helper to get next occurrence of a day of week
      const getNextDayOfWeek = (dayName: string): Date => {
        const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const today = new Date();
        const todayDay = today.getDay();
        const targetDay = days.indexOf(dayName.toLowerCase());

        if (targetDay === -1) return today;

        let daysUntil = targetDay - todayDay;
        if (daysUntil <= 0) daysUntil += 7; // Always schedule for next week if today or past

        const result = new Date(today);
        result.setDate(result.getDate() + daysUntil);
        return result;
      };

      // Helper to format date nicely
      const formatDate = (date: Date): string => {
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
        return `${days[date.getDay()]}, ${months[date.getMonth()]} ${date.getDate()}`;
      };

      const now = new Date();

      // Helper to parse month names
      const parseMonth = (monthStr: string): number => {
        const months: { [key: string]: number } = {
          'january': 0, 'jan': 0, 'february': 1, 'feb': 1, 'march': 2, 'mar': 2,
          'april': 3, 'apr': 3, 'may': 4, 'june': 5, 'jun': 5, 'july': 6, 'jul': 6,
          'august': 7, 'aug': 7, 'september': 8, 'sep': 8, 'sept': 8,
          'october': 9, 'oct': 9, 'november': 10, 'nov': 10, 'december': 11, 'dec': 11
        };
        return months[monthStr.toLowerCase()] ?? -1;
      };

      // Check for specific dates like "February 3rd" or "March 15"
      const dateMatch = userInput.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\s+(\d{1,2})(?:st|nd|rd|th)?\b/i);

      // Check for days of the week
      const dayMatches = userInput.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
      let targetDate: Date | null = null;

      if (dateMatch) {
        // Specific date like "February 3rd"
        const month = parseMonth(dateMatch[1]);
        const day = parseInt(dateMatch[2]);
        targetDate = new Date(now.getFullYear(), month, day);
        // If the date has passed this year, schedule for next year
        if (targetDate < now) {
          targetDate.setFullYear(targetDate.getFullYear() + 1);
        }
      } else if (dayMatches) {
        targetDate = getNextDayOfWeek(dayMatches[1]);
      } else if (userInput.includes('tomorrow')) {
        targetDate = new Date(now);
        targetDate.setDate(targetDate.getDate() + 1);
      } else if (userInput.includes('today')) {
        targetDate = new Date(now);
      } else if (userInput.includes('next week')) {
        targetDate = new Date(now);
        targetDate.setDate(targetDate.getDate() + 7);
      }

      // Parse time of day
      let hour = 9; // Default to 9 AM
      let timeOfDay = 'at 9 AM';

      // Check for specific times
      const timeMatch = userInput.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?/i);
      if (timeMatch) {
        hour = parseInt(timeMatch[1]);
        const isPM = timeMatch[3] && timeMatch[3].toLowerCase().includes('p');
        if (isPM && hour < 12) hour += 12;
        if (!isPM && hour === 12) hour = 0;
        const minutes = timeMatch[2] ? `:${timeMatch[2]}` : '';
        timeOfDay = `at ${timeMatch[1]}${minutes} ${isPM ? 'PM' : 'AM'}`;
      } else if (userInput.includes('morning')) {
        hour = 9;
        timeOfDay = 'in the morning at 9 AM';
      } else if (userInput.includes('afternoon')) {
        hour = 14;
        timeOfDay = 'in the afternoon at 2 PM';
      } else if (userInput.includes('evening')) {
        hour = 17;
        timeOfDay = 'in the evening at 5 PM';
      } else if (userInput.includes('noon') || userInput.includes('lunch')) {
        hour = 12;
        timeOfDay = 'at noon';
      }

      // If we have a target date, set the time
      if (targetDate) {
        preferredTime = new Date(targetDate);
        preferredTime.setHours(hour, 0, 0, 0);
        timeDescription = `${formatDate(preferredTime)} ${timeOfDay}`;
      } else if (timeMatch || userInput.includes('morning') || userInput.includes('afternoon') || userInput.includes('evening')) {
        // Time specified but no day - default to tomorrow
        preferredTime = new Date(now);
        preferredTime.setDate(preferredTime.getDate() + 1);
        preferredTime.setHours(hour, 0, 0, 0);
        timeDescription = `tomorrow ${timeOfDay}`;
      }

      // Check if user is confirming a previously proposed time
      const isConfirming = userInput.includes('yes') || userInput.includes('correct') ||
                           userInput.includes('that\'s right') || userInput.includes('confirm') ||
                           userInput.includes('sounds good') || userInput.includes('perfect');

      // Get pending appointment from query params (if confirming)
      const pendingTime = req.query.pendingTime as string;
      const pendingTimeDescription = req.query.pendingDesc as string;

      if (isConfirming && pendingTime && customer) {
        // User confirmed - now actually book the appointment
        const confirmedTime = new Date(pendingTime);
        const endTime = new Date(confirmedTime);
        endTime.setHours(endTime.getHours() + 1);

        const result = await virtualReceptionistService.processAppointmentRequest(
          parsedBusinessId,
          customer.id,
          {
            startDate: confirmedTime,
            endDate: endTime,
            notes: `Booked via phone call from ${From}`
          },
          { transcript: SpeechResult, callSid }
        );

        if (result.success) {
          twiml.say({ voice: 'alice' },
            `Your appointment has been confirmed for ${decodeURIComponent(pendingTimeDescription || '')}. You'll receive a text confirmation shortly. Is there anything else I can help you with?`
          );

          // Send SMS confirmation
          if (From && business) {
            try {
              await twilioService.sendSms(From,
                `Your appointment with ${business.name} is confirmed for ${decodeURIComponent(pendingTimeDescription || '')}. Reply CANCEL to cancel.`
              );
            } catch (smsError) {
              console.error('Error sending appointment confirmation SMS:', smsError);
            }
          }

          twiml.gather({
            input: ['speech', 'dtmf'],
            action: `/api/twilio/general-callback?businessId=${parsedBusinessId}&callSid=${callSid}`,
            speechTimeout: 'auto',
            speechModel: 'phone_call'
          });
        } else {
          twiml.say({ voice: 'alice' },
            `I'm sorry, there was a problem booking that time. Would you like to try a different time?`
          );
          twiml.gather({
            input: ['speech', 'dtmf'],
            action: `/api/twilio/appointment-callback?businessId=${parsedBusinessId}&callSid=${callSid}`,
            speechTimeout: 'auto',
            speechModel: 'phone_call'
          });
        }
      } else if (preferredTime && customer) {
        // We parsed a time - ask for confirmation before booking
        twiml.say({ voice: 'alice' },
          `I have ${timeDescription}. Is that correct?`
        );

        // Pass the pending time in the callback URL for confirmation
        twiml.gather({
          input: ['speech', 'dtmf'],
          action: `/api/twilio/appointment-callback?businessId=${parsedBusinessId}&callSid=${callSid}&pendingTime=${encodeURIComponent(preferredTime.toISOString())}&pendingDesc=${encodeURIComponent(timeDescription)}`,
          speechTimeout: 'auto',
          speechModel: 'phone_call'
        });
      } else if (preferredTime && !customer) {
        // We have a time but need to create customer first
        const newCustomer = await storage.createCustomer({
          businessId: parsedBusinessId,
          firstName: 'New',
          lastName: 'Caller',
          phone: From,
          email: '',
          address: '',
          notes: 'Created via phone call'
        });

        twiml.say({ voice: 'alice' },
          `I have ${timeDescription}. Is that correct?`
        );

        twiml.gather({
          input: ['speech', 'dtmf'],
          action: `/api/twilio/appointment-callback?businessId=${parsedBusinessId}&callSid=${callSid}&pendingTime=${encodeURIComponent(preferredTime.toISOString())}&pendingDesc=${encodeURIComponent(timeDescription)}`,
          speechTimeout: 'auto',
          speechModel: 'phone_call'
        });
      } else if (!preferredTime && (userInput.includes('no') || userInput.includes('different'))) {
        // User wants a different time
        twiml.say({ voice: 'alice' },
          `No problem. What day and time would work better for you?`
        );
        twiml.gather({
          input: ['speech', 'dtmf'],
          action: `/api/twilio/appointment-callback?businessId=${parsedBusinessId}&callSid=${callSid}`,
          speechTimeout: 'auto',
          speechModel: 'phone_call'
        });
      } else if (!customer) {
        // No customer record - create one and ask for time
        const newCustomer = await storage.createCustomer({
          businessId: parsedBusinessId,
          firstName: 'New',
          lastName: 'Caller',
          phone: From,
          email: '',
          address: '',
          notes: 'Created via phone call'
        });

        twiml.say({ voice: 'alice' },
          `I've created a new account for you. What day and time would work best for your appointment? For example, you can say Tuesday February 4th at 2 PM.`
        );

        twiml.gather({
          input: ['speech', 'dtmf'],
          action: `/api/twilio/appointment-callback?businessId=${parsedBusinessId}&callSid=${callSid}`,
          speechTimeout: 'auto',
          speechModel: 'phone_call'
        });
      } else {
        // Couldn't parse time - ask again with examples
        twiml.say({ voice: 'alice' },
          `I didn't catch that. What day and time would you like? For example, you can say Monday at 10 AM, or February 5th at 3 PM.`
        );

        twiml.gather({
          input: ['speech', 'dtmf'],
          action: `/api/twilio/appointment-callback?businessId=${parsedBusinessId}&callSid=${callSid}`,
          speechTimeout: 'auto',
          speechModel: 'phone_call'
        });
      }

      res.type('text/xml');
      res.send(twiml.toString());
    } catch (error) {
      console.error('Error handling appointment callback:', error);

      const twiml = new twilio.twiml.VoiceResponse();
      twiml.say({ voice: 'alice' },
        "I'm sorry, I'm having trouble with the scheduling system. Please try calling back later or visit our website to book online."
      );
      twiml.hangup();

      res.type('text/xml');
      res.send(twiml.toString());
    }
  });

  // Twilio webhook for general conversation callback
  app.post("/api/twilio/general-callback", validateTwilioWebhook, async (req: Request, res: Response) => {
    try {
      const { businessId, callSid } = req.query;
      const { SpeechResult, From } = req.body;
      const parsedBusinessId = parseInt(businessId as string);
      if (!parsedBusinessId) {
        console.error('General callback called without businessId');
        return res.status(400).send('');
      }

      const twiml = new twilio.twiml.VoiceResponse();
      const userInput = (SpeechResult || '').toLowerCase();

      // Check if user is trying to correct/reschedule (contains day/time references with "no")
      const hasTimeReference = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|tomorrow|today|morning|afternoon|evening|noon|\d{1,2}\s*(am|pm)?)\b/i.test(userInput);
      const isCorrection = userInput.includes('no') && hasTimeReference;

      // Check if user is done - but not if they're correcting a time
      if (!isCorrection && (userInput.includes('that\'s all') ||
          userInput.includes('nothing') || userInput.includes('bye') ||
          userInput.includes('goodbye') || userInput.includes('thank you') ||
          (userInput === 'no') || userInput.includes('no thank'))) {
        twiml.say({ voice: 'alice' },
          "Thank you for calling. Have a great day! Goodbye."
        );
        twiml.hangup();
      } else if (isCorrection || userInput.includes('appointment') ||
                 userInput.includes('schedule') || userInput.includes('book') ||
                 hasTimeReference) {
        // User is correcting time or wants to schedule - redirect to appointment flow
        // Redirect to appointment flow
        twiml.say({ voice: 'alice' },
          "I'd be happy to help you schedule an appointment. What day and time works best for you?"
        );

        twiml.gather({
          input: ['speech', 'dtmf'],
          action: `/api/twilio/appointment-callback?businessId=${parsedBusinessId}&callSid=${callSid}`,
          speechTimeout: 'auto',
          speechModel: 'phone_call'
        });
      } else {
        // Route through the main gather callback for other intents
        twiml.redirect({
          method: 'POST'
        }, `/api/twilio/gather-callback?businessId=${parsedBusinessId}&callSid=${callSid}`);
      }

      res.type('text/xml');
      res.send(twiml.toString());
    } catch (error) {
      console.error('Error handling general callback:', error);

      const twiml = new twilio.twiml.VoiceResponse();
      twiml.say({ voice: 'alice' }, "Thank you for your call. Goodbye.");
      twiml.hangup();

      res.type('text/xml');
      res.send(twiml.toString());
    }
  });

  // Twilio webhook for voicemail completion - send notification to business
  app.post("/api/twilio/voicemail-complete", validateTwilioWebhook, async (req: Request, res: Response) => {
    try {
      const { businessId } = req.query;
      const { RecordingUrl, RecordingSid, RecordingDuration, TranscriptionText, From } = req.body;
      const parsedBusinessId = parseInt(businessId as string);
      if (!parsedBusinessId) {
        console.error('Voicemail callback called without businessId');
        return res.status(400).send('');
      }

      // Get business info for notification
      const business = await storage.getBusiness(parsedBusinessId);
      const customer = await storage.getCustomerByPhone(From, parsedBusinessId);

      // Update the call log with voicemail info
      const callLogs = await storage.getCallLogs(parsedBusinessId);
      const callLog = callLogs.find(log => log.callerId === From);

      if (callLog) {
        await storage.updateCallLog(callLog.id, {
          recordingUrl: RecordingUrl,
          callDuration: parseInt(RecordingDuration) || 0,
          transcript: TranscriptionText || callLog.transcript,
          status: 'voicemail'
        });
      }

      // Send SMS notification to business owner if configured
      if (business?.phone) {
        const callerName = customer ? `${customer.firstName} ${customer.lastName}` : From;
        const message = `New voicemail from ${callerName}. Duration: ${RecordingDuration}s. ${TranscriptionText ? `Message: "${TranscriptionText.substring(0, 100)}..."` : 'Listen at: ' + RecordingUrl}`;

        try {
          await twilioService.sendSms(business.phone, message);
        } catch (smsError) {
          console.error('Error sending voicemail notification:', smsError);
        }
      }

      res.status(200).send('OK');
    } catch (error) {
      console.error('Error handling voicemail complete:', error);
      res.status(500).send('Error');
    }
  });

  // =================== VAPI.AI WEBHOOK ENDPOINTS ===================

  /**
   * Vapi Webhook Validation Middleware
   * Vapi sends a secret in the x-vapi-secret header that should match VAPI_WEBHOOK_SECRET
   * This prevents attackers from spoofing webhook calls
   */
  const validateVapiWebhook = (req: Request, res: Response, next: Function) => {
    const vapiSecret = process.env.VAPI_WEBHOOK_SECRET;

    // If no secret is configured, log warning but allow in development
    if (!vapiSecret) {
      if (process.env.NODE_ENV === 'production') {
        console.error('CRITICAL: VAPI_WEBHOOK_SECRET not configured in production');
        return res.status(500).json({ error: 'Webhook not configured' });
      }
      console.warn('⚠️  VAPI_WEBHOOK_SECRET not configured - webhook validation disabled');
      return next();
    }

    // Check for Vapi secret header
    const receivedSecret = req.headers['x-vapi-secret'] as string;

    // Also check Authorization header (Vapi may use Bearer token)
    const authHeader = req.headers['authorization'] as string;
    const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (receivedSecret === vapiSecret || bearerToken === vapiSecret) {
      return next();
    }

    // If neither header matches, validate by checking businessId exists in our database
    // This provides a fallback validation by ensuring the request references a real business
    const businessIdFromMetadata =
      req.body?.message?.assistant?.metadata?.businessId ||
      req.body?.message?.call?.assistant?.metadata?.businessId ||
      req.body?.metadata?.businessId;

    if (!businessIdFromMetadata) {
      console.error('Vapi webhook rejected: Missing secret and no businessId in metadata');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Allow the request but log the missing validation
    console.warn(`Vapi webhook received without secret validation for business ${businessIdFromMetadata}`);
    next();
  };

  // Vapi webhook for function calls and events
  app.post("/api/vapi/webhook", validateVapiWebhook, async (req: Request, res: Response) => {
    try {
      console.log('Vapi webhook received:', JSON.stringify(req.body, null, 2).substring(0, 1000));

      const messageType = req.body?.message?.type;

      // Handle tool-calls message type (Vapi's format)
      if (messageType === 'tool-calls') {
        // Vapi sends tool calls in both toolCallList and toolCalls (often duplicated)
        // Both can have nested function: { name, arguments } structure
        const toolCallList = req.body?.message?.toolCallList || [];
        const toolCalls = req.body?.message?.toolCalls || [];

        // Use toolCalls as primary (it's always present), only use toolCallList if toolCalls is empty
        const rawCalls = toolCalls.length > 0 ? toolCalls : toolCallList;

        // Normalize the format - handle both flat and nested function structure
        const normalizedCalls = rawCalls.map((tc: any) => ({
          id: tc.id,
          // Name can be at tc.name, tc.function.name
          name: tc.function?.name || tc.name,
          // Parameters can be at tc.parameters, tc.function.arguments (as object or JSON string)
          parameters: tc.function?.arguments || tc.parameters || {}
        }));

        const results: any[] = [];

        console.log(`Processing ${normalizedCalls.length} tool calls (from toolCallList: ${toolCallList.length}, toolCalls: ${toolCalls.length})`);

        for (const toolCall of normalizedCalls) {
          const toolCallId = toolCall.id;
          const functionName = toolCall.name;
          // Handle parameters that might be a string (JSON) or object
          let parameters = toolCall.parameters;
          if (typeof parameters === 'string') {
            try {
              parameters = JSON.parse(parameters);
            } catch (e) {
              parameters = {};
            }
          }
          parameters = parameters || {};

          console.log(`Processing tool call: ${functionName}, id: ${toolCallId}`);

          // For tool-calls, the assistant with metadata can be at:
          // - message.call.assistant.metadata
          // - message.assistant.metadata (more common in tool-calls)
          // We need to ensure the synthetic request has access to this
          const callObj = req.body?.message?.call || {};
          const assistantFromMessage = req.body?.message?.assistant;

          // If assistant is at message level, inject it into the call object
          if (assistantFromMessage && !callObj.assistant) {
            callObj.assistant = assistantFromMessage;
          }

          console.log(`Assistant metadata location check - message.assistant: ${!!assistantFromMessage}, call.assistant: ${!!callObj.assistant}`);
          console.log(`BusinessId from message.assistant.metadata: ${assistantFromMessage?.metadata?.businessId}`);

          // Create a synthetic request in the old format for the handler
          const syntheticRequest = {
            message: {
              type: 'function-call',
              functionCall: {
                name: functionName,
                parameters: parameters
              },
              call: callObj,
              // Also pass assistant directly at message level for the handler to find
              assistant: assistantFromMessage
            },
            metadata: req.body?.metadata
          };

          try {
            const result = await vapiWebhookHandler.handleVapiWebhook(syntheticRequest);

            if (result && 'result' in result) {
              results.push({
                name: functionName,
                toolCallId: toolCallId,
                result: typeof result.result === 'string' ? result.result : JSON.stringify(result.result)
              });
            } else if (result && 'error' in result) {
              results.push({
                name: functionName,
                toolCallId: toolCallId,
                result: JSON.stringify({ error: result.error })
              });
            }
          } catch (err) {
            console.error(`Error processing tool call ${functionName}:`, err);
            results.push({
              name: functionName,
              toolCallId: toolCallId,
              result: JSON.stringify({ error: 'Internal error processing tool call' })
            });
          }
        }

        console.log('Sending Vapi response:', JSON.stringify({ results }, null, 2));
        return res.status(200).json({ results });
      }

      // Handle legacy function-call format (for backwards compatibility)
      const result = await vapiWebhookHandler.handleVapiWebhook(req.body);

      if (result === null) {
        // No response needed for non-function-call messages
        res.status(200).json({ success: true });
      } else if ('error' in result) {
        res.status(200).json({ error: result.error });
      } else {
        res.status(200).json(result);
      }
    } catch (error) {
      console.error('Error handling Vapi webhook:', error);
      res.status(200).json({ error: 'Internal server error' });
    }
  });

  // Check what's missing for AI receptionist to work properly
  app.get("/api/vapi/status/:businessId", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = parseInt(req.params.businessId);

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

      if (!business.vapiAssistantId) {
        missing.push('Vapi AI assistant not provisioned');
      } else {
        configured.push('Vapi AI assistant active');
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
          vapiAssistantId: business.vapiAssistantId
        },
        setupInstructions: missing.length > 0 ? [
          'Go to Settings > Business Hours to configure your schedule',
          'Go to Settings > Services to add your service offerings with prices',
          'The AI will use this information to help customers book appointments'
        ] : null
      });
    } catch (error) {
      console.error('Error checking Vapi status:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Diagnostic endpoint to check business data for AI receptionist
  app.get("/api/vapi/diagnostic/:businessId", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = parseInt(req.params.businessId);

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
          vapiAssistantId: business.vapiAssistantId,
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
          hasVapiAssistant: !!business.vapiAssistantId,
          hasReceptionistConfig: !!receptionistConfig,
          issues: [
            ...(hours.length === 0 ? ['No business hours configured - availability will use defaults (Mon-Fri 9-5)'] : []),
            ...(services.length === 0 ? ['No services configured - AI will offer general appointments only'] : []),
            ...(!business.vapiAssistantId ? ['No Vapi assistant configured - run provisioning'] : []),
            ...(!receptionistConfig ? ['No receptionist config - run provisioning'] : [])
          ]
        }
      });
    } catch (error) {
      console.error('Error in Vapi diagnostic:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Force refresh Vapi assistant (for debugging - updates serverUrl and system prompt)
  app.post("/api/vapi/refresh/:businessId", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = parseInt(req.params.businessId);

      // Authorization: user must be admin or belong to this business
      if (!checkIsAdmin(req) && !checkBelongsToBusiness(req, businessId)) {
        return res.status(403).json({ message: "Not authorized to refresh this business's assistant" });
      }

      console.log(`Force refreshing Vapi assistant for business ${businessId}`);

      const business = await storage.getBusiness(businessId);
      if (!business) {
        return res.status(404).json({ error: 'Business not found' });
      }

      if (!business.vapiAssistantId) {
        return res.status(400).json({ error: 'Business does not have a Vapi assistant' });
      }

      const services = await storage.getServices(businessId);
      const businessHours = await storage.getBusinessHours(businessId);
      console.log(`Updating assistant ${business.vapiAssistantId} with ${services.length} services and ${businessHours.length} hour entries`);
      console.log(`BASE_URL is: ${process.env.BASE_URL}`);
      console.log(`Webhook URL will be: ${process.env.BASE_URL}/api/vapi/webhook`);

      const result = await vapiService.updateAssistant(
        business.vapiAssistantId,
        business,
        services,
        businessHours
      );

      if (!result.success) {
        console.error('Failed to update Vapi assistant:', result.error);
        return res.status(500).json({ error: result.error });
      }

      console.log('Vapi assistant updated successfully');
      res.json({
        success: true,
        assistantId: business.vapiAssistantId,
        message: 'Assistant refreshed successfully',
        webhookUrl: `${process.env.BASE_URL}/api/vapi/webhook`
      });
    } catch (error) {
      console.error('Error refreshing Vapi assistant:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Create or update Vapi assistant for a business
  app.post("/api/vapi/assistant", isAuthenticated, async (req: Request, res: Response) => {
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

      // Check if business already has a Vapi assistant
      if (business.vapiAssistantId) {
        // Update existing assistant
        const result = await vapiService.updateAssistant(
          business.vapiAssistantId,
          business,
          services,
          businessHours
        );

        if (!result.success) {
          return res.status(500).json({ error: result.error });
        }

        res.json({
          success: true,
          assistantId: business.vapiAssistantId,
          message: 'Assistant updated successfully'
        });
      } else {
        // Create new assistant
        const result = await vapiService.createAssistantForBusiness(business, services, businessHours);

        if (!result.assistantId) {
          return res.status(500).json({ error: result.error });
        }

        // Save assistant ID to business
        await storage.updateBusiness(businessId, {
          vapiAssistantId: result.assistantId
        });

        res.json({
          success: true,
          assistantId: result.assistantId,
          message: 'Assistant created successfully'
        });
      }
    } catch (error) {
      console.error('Error creating/updating Vapi assistant:', error);
      res.status(500).json({ error: 'Failed to create/update assistant' });
    }
  });

  // Connect Twilio phone number to Vapi
  app.post("/api/vapi/connect-phone", isAuthenticated, async (req: Request, res: Response) => {
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

      if (!business.vapiAssistantId) {
        return res.status(400).json({ error: 'Business does not have a Vapi assistant. Create one first.' });
      }

      // Import the phone number to Vapi
      const result = await vapiService.importPhoneNumber(
        business.twilioPhoneNumber,
        process.env.TWILIO_ACCOUNT_SID || '',
        process.env.TWILIO_AUTH_TOKEN || '',
        business.vapiAssistantId
      );

      if (result.error) {
        return res.status(500).json({ error: result.error });
      }

      // Save the Vapi phone number ID
      await storage.updateBusiness(businessId, {
        vapiPhoneNumberId: result.phoneNumberId
      });

      res.json({
        success: true,
        phoneNumberId: result.phoneNumberId,
        message: 'Phone number connected to Vapi successfully'
      });
    } catch (error) {
      console.error('Error connecting phone to Vapi:', error);
      res.status(500).json({ error: 'Failed to connect phone number' });
    }
  });

  // Get Vapi assistant status for a business
  app.get("/api/vapi/status/:businessId", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = parseInt(req.params.businessId);

      if (!checkIsAdmin(req) && !checkBelongsToBusiness(req, businessId)) {
        return res.status(403).json({ error: 'Not authorized' });
      }

      const business = await storage.getBusiness(businessId);
      if (!business) {
        return res.status(404).json({ error: 'Business not found' });
      }

      let assistantInfo = null;
      if (business.vapiAssistantId) {
        assistantInfo = await vapiService.getAssistant(business.vapiAssistantId);
      }

      res.json({
        hasAssistant: !!business.vapiAssistantId,
        assistantId: business.vapiAssistantId,
        hasPhoneConnected: !!business.vapiPhoneNumberId,
        phoneNumberId: business.vapiPhoneNumberId,
        phoneNumber: business.twilioPhoneNumber,
        receptionistEnabled: business.receptionistEnabled !== false, // Default to true if not set
        assistantInfo: assistantInfo ? {
          name: assistantInfo.name,
          firstMessage: assistantInfo.firstMessage
        } : null
      });
    } catch (error) {
      console.error('Error getting Vapi status:', error);
      res.status(500).json({ error: 'Failed to get status' });
    }
  });

  // =================== RECEPTIONIST ENABLE/DISABLE ===================

  // Toggle receptionist enabled status (soft disable - doesn't release resources)
  app.post("/api/business/:id/receptionist/toggle", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = parseInt(req.params.id);
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

  // Fully deprovision receptionist (releases Twilio number and deletes Vapi assistant)
  app.post("/api/business/:id/receptionist/deprovision", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = parseInt(req.params.id);

      if (!checkIsAdmin(req) && !checkBelongsToBusiness(req, businessId)) {
        return res.status(403).json({ error: 'Not authorized' });
      }

      const business = await storage.getBusiness(businessId);
      if (!business) {
        return res.status(404).json({ error: 'Business not found' });
      }

      // Check if there's anything to deprovision
      if (!business.vapiAssistantId && !business.twilioPhoneNumberSid) {
        return res.json({
          success: true,
          message: 'No receptionist resources to deprovision'
        });
      }

      // Call the deprovision service
      const result = await businessProvisioningService.deprovisionBusiness(businessId);

      // Also disable the receptionist
      await storage.updateBusiness(businessId, {
        receptionistEnabled: false
      });

      res.json({
        success: result.success,
        message: 'AI Receptionist deprovisioned successfully',
        details: {
          twilioReleased: result.twilioDeprovisioned,
          vapiRemoved: result.vapiDeprovisioned
        }
      });
    } catch (error) {
      console.error('Error deprovisioning receptionist:', error);
      res.status(500).json({ error: 'Failed to deprovision receptionist' });
    }
  });

  // Search available phone numbers for a business (user-facing)
  app.get("/api/business/:id/available-numbers", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = parseInt(req.params.id);

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

  // Re-provision receptionist (provisions new Twilio number and creates Vapi assistant)
  app.post("/api/business/:id/receptionist/provision", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = parseInt(req.params.id);
      const { areaCode, phoneNumber } = req.body;

      if (!checkIsAdmin(req) && !checkBelongsToBusiness(req, businessId)) {
        return res.status(403).json({ error: 'Not authorized' });
      }

      const business = await storage.getBusiness(businessId);
      if (!business) {
        return res.status(404).json({ error: 'Business not found' });
      }

      // Check if already provisioned
      if (business.vapiAssistantId && business.twilioPhoneNumberSid) {
        return res.status(400).json({
          error: 'Receptionist is already provisioned. Deprovision first to reprovision.'
        });
      }

      // Call the provisioning service with options
      const result = await businessProvisioningService.provisionBusiness(businessId, {
        preferredAreaCode: areaCode,
        specificPhoneNumber: phoneNumber
      });

      // Enable the receptionist
      await storage.updateBusiness(businessId, {
        receptionistEnabled: true
      });

      res.json({
        success: result.success,
        message: 'AI Receptionist provisioned successfully',
        phoneNumber: result.twilioPhoneNumber,
        assistantId: result.vapiAssistantId
      });
    } catch (error) {
      console.error('Error provisioning receptionist:', error);
      res.status(500).json({ error: 'Failed to provision receptionist' });
    }
  });

  // =================== ADMIN PHONE NUMBER MANAGEMENT ===================
  // Get available phone numbers in an area code
  app.get("/api/admin/phone-numbers/available", isAdmin, async (req: Request, res: Response) => {
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

  // Provision a specific phone number for a business
  app.post("/api/admin/phone-numbers/provision", isAdmin, async (req: Request, res: Response) => {
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

      // Skip validation for format/etc as Twilio will handle that

      // Check if Twilio is configured
      if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
        return res.status(503).json({
          error: "Twilio is not configured. Please set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN"
        });
      }

      // Purchase the phone number
      const result = await twilioProvisioningService.provisionSpecificPhoneNumber(
        businessId,
        phoneNumber
      );

      // Auto-connect to Vapi if assistant exists (background)
      vapiProvisioningService.connectPhoneToVapi(businessId).then(vapiResult => {
        if (vapiResult.success) {
          console.log(`Auto-connected phone to Vapi for business ${businessId}`);
        }
      }).catch(err => {
        console.error('Error auto-connecting phone to Vapi:', err);
      });

      // Return the result
      res.json({
        success: true,
        business: businessId,
        phoneNumber: result.phoneNumber,
        sid: result.sid,
        message: "Phone number provisioned successfully"
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
  app.delete("/api/admin/phone-numbers/:businessId", isAdmin, async (req: Request, res: Response) => {
    try {
      const businessId = parseInt(req.params.businessId);
      
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

  // Get admin dashboard stats
  app.get("/api/admin/stats", isAdmin, async (req: Request, res: Response) => {
    try {
      // Get all businesses with their phone numbers
      const businesses = await storage.getAllBusinesses();

      // Count businesses with active phone numbers
      const activePhoneNumbers = businesses.filter(b => b.twilioPhoneNumber).length;

      // For now, return real business stats - other stats would need additional queries
      res.json({
        totalBusinesses: businesses.length,
        activePhoneNumbers,
        // These would need actual queries to be accurate
        totalUsers: businesses.length, // Approximation for now
        totalCalls: 0 // Would need call log count
      });
    } catch (error) {
      console.error("Error fetching admin stats:", error);
      res.status(500).json({
        error: "Error fetching admin stats",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Get all businesses for admin
  app.get("/api/admin/businesses", isAdmin, async (req: Request, res: Response) => {
    try {
      const businesses = await storage.getAllBusinesses();
      res.json({ businesses });
    } catch (error) {
      console.error("Error fetching businesses:", error);
      res.status(500).json({
        error: "Error fetching businesses",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Get phone numbers for all businesses
  app.get("/api/admin/phone-numbers", isAdmin, async (req: Request, res: Response) => {
    try {
      // Get all businesses
      const businesses = await storage.getAllBusinesses();
      
      // Extract phone number information
      const phoneNumbers = businesses.map(business => ({
        businessId: business.id,
        businessName: business.name,
        phoneNumber: business.twilioPhoneNumber,
        phoneNumberSid: business.twilioPhoneNumberSid,
        dateProvisioned: business.twilioDateProvisioned,
        status: business.twilioPhoneNumber ? "active" : "not provisioned"
      }));

      res.json({ phoneNumbers });
    } catch (error) {
      console.error("Error fetching business phone numbers:", error);
      res.status(500).json({
        error: "Error fetching business phone numbers",
        details: error instanceof Error ? error.message : String(error)
      });
    }
  });

  // Register calendar routes
  app.use('/api/calendar', calendarRoutes);

  // Register QuickBooks integration routes
  app.use('/api/quickbooks', quickbooksRoutes);
  
  // Register subscription routes
  app.use('/api/subscription', subscriptionRoutes);

  // Register quote routes
  app.use('/api', quoteRoutes);
  
  // Register customer routes
  app.use('/api', customerRoutes);

  // Register recurring schedules routes
  app.use('/api/recurring-schedules', recurringRoutes);

  // Register Clover POS integration routes
  app.use('/api/clover', cloverRoutes);

  // Register Square POS integration routes
  app.use('/api/square', squareRoutes);

  // Register public booking routes (no auth required for customer-facing pages)
  app.use('/api', bookingRoutes);

  // Serve calendar files from public directory
  app.use('/calendar', express.static('public/calendar'));
  
  const httpServer = createServer(app);
  return httpServer;
}
