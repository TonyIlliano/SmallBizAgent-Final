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

// Stripe setup
import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_example");

// Twilio setup
import twilio from "twilio";
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID || "AC_test_example", 
  process.env.TWILIO_AUTH_TOKEN || "auth_token_example"
);

// AWS Lex setup
import lexService from "./services/lexService";
import twilioService from "./services/twilioService";
import businessProvisioningService from "./services/businessProvisioningService";
import twilioProvisioningService from "./services/twilioProvisioningService";
import calendarRoutes from "./routes/calendarRoutes";
import quickbooksRoutes from "./routes/quickbooksRoutes";
import subscriptionRoutes from "./routes/subscriptionRoutes";
import quoteRoutes from "./routes/quoteRoutes";
import customerRoutes from "./routes/customerRoutes";

// Import training routes
import { registerTrainingRoutes } from './routes/trainingRoutes';

export async function registerRoutes(app: Express): Promise<Server> {
  // Register training routes
  registerTrainingRoutes(app);
  // Set up authentication
  setupAuth(app);
  
  // Set default business ID for demo
  // This will be used for non-authenticated routes during development
  const DEFAULT_BUSINESS_ID = 1;

  // =================== BUSINESS API ===================
  app.get("/api/business", async (req: Request, res: Response) => {
    try {
      const business = await storage.getBusiness(DEFAULT_BUSINESS_ID);
      if (!business) {
        return res.status(404).json({ message: "Business not found" });
      }
      res.json(business);
    } catch (error) {
      res.status(500).json({ message: "Error fetching business" });
    }
  });

  app.post("/api/business", async (req: Request, res: Response) => {
    try {
      const validatedData = insertBusinessSchema.parse(req.body);
      const business = await storage.createBusiness(validatedData);
      
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

  app.put("/api/business/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const validatedData = insertBusinessSchema.partial().parse(req.body);
      const business = await storage.updateBusiness(id, validatedData);
      res.json(business);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.format() });
      }
      res.status(500).json({ message: "Error updating business" });
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
  app.get("/api/business/:businessId/hours", async (req: Request, res: Response) => {
    try {
      const businessId = parseInt(req.params.businessId);
      const hours = await storage.getBusinessHours(businessId);
      res.json(hours);
    } catch (error) {
      res.status(500).json({ message: "Error fetching business hours" });
    }
  });

  app.post("/api/business-hours", async (req: Request, res: Response) => {
    try {
      const validatedData = insertBusinessHoursSchema.parse(req.body);
      const hours = await storage.createBusinessHours(validatedData);
      res.status(201).json(hours);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.format() });
      }
      res.status(500).json({ message: "Error creating business hours" });
    }
  });

  app.put("/api/business-hours/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const validatedData = insertBusinessHoursSchema.partial().parse(req.body);
      const hours = await storage.updateBusinessHours(id, validatedData);
      res.json(hours);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.format() });
      }
      res.status(500).json({ message: "Error updating business hours" });
    }
  });

  // =================== SERVICES API ===================
  app.get("/api/services", async (req: Request, res: Response) => {
    try {
      const businessId = parseInt(req.query.businessId as string) || DEFAULT_BUSINESS_ID;
      const services = await storage.getServices(businessId);
      res.json(services);
    } catch (error) {
      res.status(500).json({ message: "Error fetching services" });
    }
  });

  app.get("/api/services/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const service = await storage.getService(id);
      if (!service) {
        return res.status(404).json({ message: "Service not found" });
      }
      res.json(service);
    } catch (error) {
      res.status(500).json({ message: "Error fetching service" });
    }
  });

  app.post("/api/services", async (req: Request, res: Response) => {
    try {
      const validatedData = insertServiceSchema.parse(req.body);
      const service = await storage.createService(validatedData);
      res.status(201).json(service);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.format() });
      }
      res.status(500).json({ message: "Error creating service" });
    }
  });

  app.put("/api/services/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const validatedData = insertServiceSchema.partial().parse(req.body);
      const service = await storage.updateService(id, validatedData);
      res.json(service);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.format() });
      }
      res.status(500).json({ message: "Error updating service" });
    }
  });

  app.delete("/api/services/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteService(id);
      res.status(204).end();
    } catch (error) {
      res.status(500).json({ message: "Error deleting service" });
    }
  });

  // =================== CUSTOMERS API ===================
  app.get("/api/customers", async (req: Request, res: Response) => {
    try {
      const businessId = parseInt(req.query.businessId as string) || DEFAULT_BUSINESS_ID;
      const customers = await storage.getCustomers(businessId);
      res.json(customers);
    } catch (error) {
      res.status(500).json({ message: "Error fetching customers" });
    }
  });

  app.get("/api/customers/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const customer = await storage.getCustomer(id);
      if (!customer) {
        return res.status(404).json({ message: "Customer not found" });
      }
      res.json(customer);
    } catch (error) {
      res.status(500).json({ message: "Error fetching customer" });
    }
  });

  app.post("/api/customers", async (req: Request, res: Response) => {
    try {
      const validatedData = insertCustomerSchema.parse(req.body);
      const customer = await storage.createCustomer(validatedData);
      res.status(201).json(customer);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.format() });
      }
      res.status(500).json({ message: "Error creating customer" });
    }
  });

  app.put("/api/customers/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
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

  app.delete("/api/customers/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteCustomer(id);
      res.status(204).end();
    } catch (error) {
      res.status(500).json({ message: "Error deleting customer" });
    }
  });

  // =================== STAFF API ===================
  app.get("/api/staff", async (req: Request, res: Response) => {
    try {
      const businessId = parseInt(req.query.businessId as string) || DEFAULT_BUSINESS_ID;
      const staff = await storage.getStaff(businessId);
      res.json(staff);
    } catch (error) {
      res.status(500).json({ message: "Error fetching staff" });
    }
  });

  app.get("/api/staff/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const staffMember = await storage.getStaffMember(id);
      if (!staffMember) {
        return res.status(404).json({ message: "Staff member not found" });
      }
      res.json(staffMember);
    } catch (error) {
      res.status(500).json({ message: "Error fetching staff member" });
    }
  });

  app.post("/api/staff", async (req: Request, res: Response) => {
    try {
      const validatedData = insertStaffSchema.parse(req.body);
      const staffMember = await storage.createStaffMember(validatedData);
      res.status(201).json(staffMember);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.format() });
      }
      res.status(500).json({ message: "Error creating staff member" });
    }
  });

  app.put("/api/staff/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const validatedData = insertStaffSchema.partial().parse(req.body);
      const staffMember = await storage.updateStaffMember(id, validatedData);
      res.json(staffMember);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.format() });
      }
      res.status(500).json({ message: "Error updating staff member" });
    }
  });

  app.delete("/api/staff/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteStaffMember(id);
      res.status(204).end();
    } catch (error) {
      res.status(500).json({ message: "Error deleting staff member" });
    }
  });

  // =================== APPOINTMENTS API ===================
  app.get("/api/appointments", async (req: Request, res: Response) => {
    try {
      const businessId = parseInt(req.query.businessId as string) || DEFAULT_BUSINESS_ID;
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

  app.get("/api/appointments/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const appointment = await storage.getAppointment(id);
      if (!appointment) {
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

  app.post("/api/appointments", async (req: Request, res: Response) => {
    try {
      const validatedData = insertAppointmentSchema.parse(req.body);
      const appointment = await storage.createAppointment(validatedData);
      res.status(201).json(appointment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.format() });
      }
      res.status(500).json({ message: "Error creating appointment" });
    }
  });

  app.put("/api/appointments/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const validatedData = insertAppointmentSchema.partial().parse(req.body);
      const appointment = await storage.updateAppointment(id, validatedData);
      res.json(appointment);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.format() });
      }
      res.status(500).json({ message: "Error updating appointment" });
    }
  });

  app.delete("/api/appointments/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteAppointment(id);
      res.status(204).end();
    } catch (error) {
      res.status(500).json({ message: "Error deleting appointment" });
    }
  });

  // =================== JOBS API ===================
  app.get("/api/jobs", async (req: Request, res: Response) => {
    try {
      const businessId = parseInt(req.query.businessId as string) || DEFAULT_BUSINESS_ID;
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

  app.get("/api/jobs/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const job = await storage.getJob(id);
      if (!job) {
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

  app.post("/api/jobs", async (req: Request, res: Response) => {
    try {
      const validatedData = insertJobSchema.parse(req.body);
      const job = await storage.createJob(validatedData);
      res.status(201).json(job);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.format() });
      }
      res.status(500).json({ message: "Error creating job" });
    }
  });

  app.put("/api/jobs/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const validatedData = insertJobSchema.partial().parse(req.body);
      const job = await storage.updateJob(id, validatedData);
      res.json(job);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.format() });
      }
      res.status(500).json({ message: "Error updating job" });
    }
  });

  app.delete("/api/jobs/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      await storage.deleteJob(id);
      res.status(204).end();
    } catch (error) {
      res.status(500).json({ message: "Error deleting job" });
    }
  });

  // =================== INVOICES API ===================
  app.get("/api/invoices", async (req: Request, res: Response) => {
    try {
      const businessId = parseInt(req.query.businessId as string) || DEFAULT_BUSINESS_ID;
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

  app.get("/api/invoices/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const invoice = await storage.getInvoice(id);
      if (!invoice) {
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

  app.post("/api/invoices", async (req: Request, res: Response) => {
    try {
      const validatedData = insertInvoiceSchema.parse(req.body);
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
      
      res.status(201).json(invoice);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.format() });
      }
      res.status(500).json({ message: "Error creating invoice" });
    }
  });

  app.put("/api/invoices/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const validatedData = insertInvoiceSchema.partial().parse(req.body);
      const invoice = await storage.updateInvoice(id, validatedData);
      res.json(invoice);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.format() });
      }
      res.status(500).json({ message: "Error updating invoice" });
    }
  });

  app.delete("/api/invoices/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      
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

  // =================== INVOICE ITEMS API ===================
  app.get("/api/invoice-items/:invoiceId", async (req: Request, res: Response) => {
    try {
      const invoiceId = parseInt(req.params.invoiceId);
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

  // =================== VIRTUAL RECEPTIONIST API ===================
  app.get("/api/receptionist-config/:businessId", async (req: Request, res: Response) => {
    try {
      const businessId = parseInt(req.params.businessId) || DEFAULT_BUSINESS_ID;
      const config = await storage.getReceptionistConfig(businessId);
      if (!config) {
        return res.status(404).json({ message: "Receptionist configuration not found" });
      }
      res.json(config);
    } catch (error) {
      res.status(500).json({ message: "Error fetching receptionist configuration" });
    }
  });

  app.post("/api/receptionist-config", async (req: Request, res: Response) => {
    try {
      const validatedData = insertReceptionistConfigSchema.parse(req.body);
      const config = await storage.createReceptionistConfig(validatedData);
      res.status(201).json(config);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.format() });
      }
      res.status(500).json({ message: "Error creating receptionist configuration" });
    }
  });

  app.put("/api/receptionist-config/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
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
  app.get("/api/call-logs", async (req: Request, res: Response) => {
    try {
      const businessId = parseInt(req.query.businessId as string) || DEFAULT_BUSINESS_ID;
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

  app.get("/api/call-logs/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const log = await storage.getCallLog(id);
      if (!log) {
        return res.status(404).json({ message: "Call log not found" });
      }
      res.json(log);
    } catch (error) {
      res.status(500).json({ message: "Error fetching call log" });
    }
  });

  app.post("/api/call-logs", async (req: Request, res: Response) => {
    try {
      const validatedData = insertCallLogSchema.parse(req.body);
      const log = await storage.createCallLog(validatedData);
      res.status(201).json(log);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ errors: error.format() });
      }
      res.status(500).json({ message: "Error creating call log" });
    }
  });

  app.put("/api/call-logs/:id", async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
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
    const sig = req.headers['stripe-signature'] as string;
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
    
    let event;
    
    try {
      event = stripe.webhooks.constructEvent(
        req.body, 
        sig, 
        endpointSecret || 'whsec_test_example'
      );
    } catch (err) {
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
  app.post("/api/twilio/incoming-call", async (req: Request, res: Response) => {
    try {
      const { From, CallSid } = req.body;
      const businessId = DEFAULT_BUSINESS_ID;
      
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
  app.post("/api/twilio/recording-callback", async (req: Request, res: Response) => {
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
  app.post("/api/twilio/transcription-callback", async (req: Request, res: Response) => {
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
  app.post("/api/twilio/gather-callback", async (req: Request, res: Response) => {
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
        if (config && config.transferPhoneNumbers && config.transferPhoneNumbers.length > 0) {
          twiml.dial({}, config.transferPhoneNumbers[0]);
        } else {
          twiml.say({ voice: 'alice' }, "I'm sorry, but I'm having trouble connecting you. Please call our emergency line directly at 555-123-4567.");
        }
      } else if (lexResponse.intentName === 'appointment') {
        // Handle appointment scheduling intent
        twiml.say({ voice: 'alice' }, lexResponse.message || "I'd be happy to help you schedule an appointment. Let me check our availability.");
        
        // In a real app, this would integrate with the appointment scheduling system
        twiml.say({ voice: 'alice' }, "We have openings tomorrow at 10 AM and 2 PM. Would either of those work for you?");
        
        twiml.gather({
          input: 'speech dtmf',
          action: `/api/twilio/appointment-callback?businessId=${businessId}&callSid=${callSid}`,
          speechTimeout: 'auto',
          speechModel: 'phone_call'
        });
      } else if (lexResponse.dialogState === 'Fulfilled' || lexResponse.dialogState === 'ReadyForFulfillment') {
        // Intent fulfilled, provide the response and ask if they need anything else
        twiml.say({ voice: 'alice' }, lexResponse.message || "I've processed your request. Is there anything else I can help you with?");
        
        twiml.gather({
          input: 'speech dtmf',
          action: `/api/twilio/general-callback?businessId=${businessId}&callSid=${callSid}`,
          speechTimeout: 'auto',
          speechModel: 'phone_call'
        });
      } else {
        // Intent not fulfilled, continue the conversation
        twiml.say({ voice: 'alice' }, lexResponse.message || "How else can I assist you today?");
        
        twiml.gather({
          input: 'speech dtmf',
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

  // Serve calendar files from public directory
  app.use('/calendar', express.static('public/calendar'));
  
  const httpServer = createServer(app);
  return httpServer;
}
