import type { Express, Request, Response } from "express";
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

// Stripe setup
import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "sk_test_example");

// Twilio setup
import twilio from "twilio";
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID || "AC_test_example", 
  process.env.TWILIO_AUTH_TOKEN || "auth_token_example"
);

export async function registerRoutes(app: Express): Promise<Server> {
  // Set default business ID for demo
  // In a real app, this would come from authentication
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
      res.status(201).json(business);
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
      
      // Create TwiML response
      const twiml = new twilio.twiml.VoiceResponse();
      
      // Start with greeting
      twiml.say({ voice: 'alice' }, config.greeting);
      
      // Record the call if enabled
      if (config.callRecordingEnabled) {
        twiml.record({
          action: `/api/twilio/recording-callback?businessId=${businessId}&callSid=${CallSid}`,
          maxLength: config.maxCallLengthMinutes * 60,
          transcribe: config.transcriptionEnabled,
          transcribeCallback: `/api/twilio/transcription-callback?businessId=${businessId}&callSid=${CallSid}`
        });
      } else {
        // If not recording, gather input for intent detection
        twiml.gather({
          input: 'speech',
          action: `/api/twilio/gather-callback?businessId=${businessId}&callSid=${CallSid}`,
          speechTimeout: 'auto',
          speechModel: 'phone_call'
        });
      }
      
      // Create a call log entry
      await storage.createCallLog({
        businessId,
        callerId: From,
        callerName: customer ? `${customer.firstName} ${customer.lastName}` : null,
        transcript: null,
        intentDetected: null,
        isEmergency: false,
        callDuration: 0,
        recordingUrl: null,
        status: 'answered',
        callTime: new Date()
      });
      
      res.type('text/xml');
      res.send(twiml.toString());
    } catch (error) {
      console.error('Error handling incoming call:', error);
      res.status(500).json({ message: "Error handling incoming call" });
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
      const { TranscriptionText } = req.body;
      
      // Find the call log and update it
      const callLogs = await storage.getCallLogs(parseInt(businessId as string));
      const callLog = callLogs.find(log => log.callerId === req.body.From);
      
      if (callLog) {
        // Basic intent detection (in a real app, this would be more sophisticated)
        let intentDetected = 'general';
        const text = TranscriptionText.toLowerCase();
        
        if (text.includes('appointment') || text.includes('schedule') || text.includes('book')) {
          intentDetected = 'appointment';
        } else if (text.includes('price') || text.includes('cost') || text.includes('how much')) {
          intentDetected = 'inquiry';
        } else if (text.includes('emergency') || text.includes('urgent') || text.includes('right away')) {
          intentDetected = 'emergency';
        }
        
        await storage.updateCallLog(callLog.id, {
          transcript: TranscriptionText,
          intentDetected,
          isEmergency: intentDetected === 'emergency'
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
      const { SpeechResult } = req.body;
      
      // Find the call log and update it
      const callLogs = await storage.getCallLogs(parseInt(businessId as string));
      const callLog = callLogs.find(log => log.callerId === req.body.From);
      
      // Basic intent detection (in a real app, this would be more sophisticated)
      let intentDetected = 'general';
      const text = SpeechResult.toLowerCase();
      
      if (text.includes('appointment') || text.includes('schedule') || text.includes('book')) {
        intentDetected = 'appointment';
      } else if (text.includes('price') || text.includes('cost') || text.includes('how much')) {
        intentDetected = 'inquiry';
      } else if (text.includes('emergency') || text.includes('urgent') || text.includes('right away')) {
        intentDetected = 'emergency';
      }
      
      if (callLog) {
        await storage.updateCallLog(callLog.id, {
          transcript: SpeechResult,
          intentDetected,
          isEmergency: intentDetected === 'emergency'
        });
      }
      
      // Respond based on intent
      const twiml = new twilio.twiml.VoiceResponse();
      
      if (intentDetected === 'appointment') {
        twiml.say({ voice: 'alice' }, "I'd be happy to help you schedule an appointment. Let me check our availability.");
        // In a real app, this would integrate with the appointment scheduling system
        twiml.say({ voice: 'alice' }, "We have openings tomorrow at 10 AM and 2 PM. Would either of those work for you?");
        twiml.gather({
          input: 'speech',
          action: `/api/twilio/appointment-callback?businessId=${businessId}&callSid=${callSid}`,
          speechTimeout: 'auto'
        });
      } else if (intentDetected === 'emergency') {
        twiml.say({ voice: 'alice' }, "I understand this is an emergency. Let me connect you with our on-call staff right away.");
        // In a real app, this would initiate a call transfer
        const config = await storage.getReceptionistConfig(parseInt(businessId as string));
        if (config && config.transferPhoneNumbers && config.transferPhoneNumbers.length > 0) {
          twiml.dial({}, config.transferPhoneNumbers[0]);
        } else {
          twiml.say({ voice: 'alice' }, "I'm sorry, but I'm having trouble connecting you. Please call our emergency line directly at 555-123-4567.");
        }
      } else {
        twiml.say({ voice: 'alice' }, "Thank you for your message. A member of our team will get back to you as soon as possible.");
        twiml.say({ voice: 'alice' }, "Is there anything else I can help you with today?");
        twiml.gather({
          input: 'speech',
          action: `/api/twilio/general-callback?businessId=${businessId}&callSid=${callSid}`,
          speechTimeout: 'auto'
        });
      }
      
      res.type('text/xml');
      res.send(twiml.toString());
    } catch (error) {
      console.error('Error handling gather callback:', error);
      res.status(500).json({ message: "Error handling gather callback" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
