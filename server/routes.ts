import type { Express, Request, Response } from "express";
import express from "express";
import rateLimit from "express-rate-limit";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { db, pool } from "./db";
import { z } from "zod";
import {
  insertCustomerSchema,
  customers,
  jobs,
  invoices,
  quotes,
  appointments,
  services,
} from "@shared/schema";
import { eq, and, or, desc, ilike, sql } from "drizzle-orm";
import { createHmac } from "crypto";
import { logAndSwallow } from './utils/safeAsync';
import { sendEmail } from "./emailService";

// Setup authentication
import {
  setupAuth,
  isAuthenticated,
  isAdmin,
  checkIsAdmin,
  checkBelongsToBusiness,
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

// reminderService + notificationService moved to notificationRoutes.ts

// Stripe Connect
import stripeConnectRoutes from "./routes/stripeConnectRoutes";
import { stripeConnectService } from "./services/stripeConnectService";

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

import twilioService from "./services/twilioService";
import * as virtualReceptionistService from "./services/virtualReceptionistService";

// Import cache for invalidation when data changes
import { dataCache } from "./services/callToolHandlers";

// Retell AI setup (voice receptionist)
// retellProvisioningService moved to receptionistConfigRoutes.ts + retellRoutes.ts
// retellWebhookHandler, businessProvisioningService, twilioProvisioningService moved to retellRoutes.ts
import calendarRoutes from "./routes/calendarRoutes";
import quickbooksRoutes from "./routes/quickbooksRoutes";
import subscriptionRoutes from "./routes/subscriptionRoutes";
import quoteRoutes from "./routes/quoteRoutes";
import invoiceRoutes from "./routes/invoiceRoutes";
import customerRoutes from "./routes/customerRoutes";
import appointmentRoutes from "./routes/appointmentRoutes";
import recurringRoutes from "./routes/recurring";
import bookingRoutes from "./routes/bookingRoutes";
import embedRoutes from "./routes/embedRoutes";
import cloverRoutes from "./routes/cloverRoutes";
import squareRoutes from "./routes/squareRoutes";
import heartlandRoutes from "./routes/heartlandRoutes";
import adminRoutes from "./routes/adminRoutes";
import gbpRoutes from "./routes/gbpRoutes";
import socialMediaRoutes from "./routes/socialMediaRoutes";

// Import analytics routes
import { registerAnalyticsRoutes } from './routes/analyticsRoutes';
// Import webhook routes
import { registerWebhookRoutes } from './routes/webhookRoutes';
// Import marketing routes
import { registerMarketingRoutes } from './routes/marketingRoutes';
// Import Zapier/API key routes
import { registerZapierRoutes } from './routes/zapierRoutes';
import { registerInventoryRoutes } from './routes/inventoryRoutes';
import { registerAutomationRoutes } from './routes/automationRoutes';
import { registerExpressSetupRoutes } from './routes/expressSetupRoutes';
import { registerWebsiteBuilderRoutes } from './routes/websiteBuilderRoutes';
import { fireEvent } from './services/webhookService';
// Multi-line phone + multi-location routes
import phoneRoutes from './routes/phoneRoutes';
import locationRoutes from './routes/locationRoutes';
import exportRoutes from './routes/exportRoutes';
import jobRoutes from './routes/jobRoutes';
import staffRoutes from './routes/staffRoutes';
import servicesRoutes from './routes/servicesRoutes';
import businessRoutes from './routes/businessRoutes';
import twilioWebhookRoutes from './routes/twilioWebhookRoutes';
import retellRoutes from './routes/retellRoutes';
import knowledgeRoutes from './routes/knowledgeRoutes';
import notificationRoutes from './routes/notificationRoutes';
import receptionistConfigRoutes from './routes/receptionistConfigRoutes';
import callLogRoutes from './routes/callLogRoutes';
import reviewRoutes from './routes/reviewRoutes';

export async function registerRoutes(app: Express): Promise<Server> {
  // Set up authentication first
  setupAuth(app);

  // ── Public Health Check (no auth required) ──
  /**
   * @openapi
   * /api/health:
   *   get:
   *     summary: Public health check
   *     tags: [Health]
   *     responses:
   *       200:
   *         description: All services healthy
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 status:
   *                   type: string
   *                   enum: [healthy, degraded, unhealthy]
   *                 services:
   *                   type: array
   *                   items:
   *                     type: object
   *                     properties:
   *                       name:
   *                         type: string
   *                       status:
   *                         type: string
   *                       responseTimeMs:
   *                         type: integer
   *       503:
   *         description: One or more services down
   */
  app.get("/api/health", async (_req: Request, res: Response) => {
    try {
      const { runAllHealthChecks } = await import("./services/healthCheckService.js");
      const results = await runAllHealthChecks();
      const allHealthy = results.every((r) => r.status === "healthy");
      const anyDown = results.some((r) => r.status === "down");
      res.status(anyDown ? 503 : 200).json({
        status: anyDown ? "unhealthy" : allHealthy ? "healthy" : "degraded",
        services: results.map((r) => ({
          name: r.serviceName,
          status: r.status,
          responseTimeMs: r.responseTimeMs,
        })),
        timestamp: new Date().toISOString(),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(503).json({ status: "unhealthy", error: message });
    }
  });

  // ── Push Notification Token Registration ──
  app.post("/api/push/register", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = (req.user as any)?.businessId;
      if (!businessId) return res.status(400).json({ error: "No business associated" });
      const { token, platform } = req.body;
      if (!token || !platform) return res.status(400).json({ error: "Missing token or platform" });

      // Store token in business record (append to existing tokens array)
      const [business] = await db.select({ pushNotificationTokens: sql`push_notification_tokens` })
        .from(sql`businesses`)
        .where(sql`id = ${businessId}`);
      const existing: Array<{ token: string; platform: string; registeredAt: string }> =
        (business?.pushNotificationTokens as any) || [];
      // Deduplicate by token
      const filtered = existing.filter((t: any) => t.token !== token);
      filtered.push({ token, platform, registeredAt: new Date().toISOString() });
      // Keep last 10 tokens
      const trimmed = filtered.slice(-10);
      await db.execute(sql`UPDATE businesses SET push_notification_tokens = ${JSON.stringify(trimmed)}::jsonb WHERE id = ${businessId}`);
      res.json({ success: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[Push] Token registration error:", message);
      res.status(500).json({ error: message });
    }
  });

  // ── SEO: Dynamic sitemap.xml ──
  app.get('/sitemap.xml', async (_req: Request, res: Response) => {
    try {
      // Get all businesses with booking enabled
      const result = await pool.query(
        `SELECT booking_slug, updated_at FROM businesses WHERE booking_enabled = true AND booking_slug IS NOT NULL`
      );

      const today = new Date().toISOString().split('T')[0];
      const siteUrl = process.env.APP_URL || 'https://www.smallbizagent.ai';
      let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${siteUrl}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${siteUrl}/auth</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.6</priority>
  </url>
  <url>
    <loc>${siteUrl}/sms-terms</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>
  <url>
    <loc>${siteUrl}/privacy</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>
  <url>
    <loc>${siteUrl}/terms</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.5</priority>
  </url>`;

      for (const biz of result.rows) {
        const lastmod = biz.updated_at ? new Date(biz.updated_at).toISOString().split('T')[0] : today;
        xml += `
  <url>
    <loc>${siteUrl}/book/${biz.booking_slug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;
      }

      xml += '\n</urlset>';
      res.set('Content-Type', 'application/xml');
      res.send(xml);
    } catch (error) {
      console.error('Error generating sitemap:', error);
      res.status(500).send('Error generating sitemap');
    }
  });

  // Register analytics routes
  registerAnalyticsRoutes(app);

  // Register webhook routes (Zapier/external integrations)
  registerWebhookRoutes(app);

  // Register marketing routes
  registerMarketingRoutes(app);

  // Register Zapier/API key routes
  registerZapierRoutes(app);

  // Register inventory routes (restaurant POS stock tracking)
  registerInventoryRoutes(app);

  // Register automation routes (SMS agents)
  registerAutomationRoutes(app);

  // Register express onboarding routes
  registerExpressSetupRoutes(app);

  // Register website builder routes (scanner, domains, site serving)
  registerWebsiteBuilderRoutes(app);

  // Register admin dashboard routes
  app.use(adminRoutes);

  // Register Stripe Connect routes
  app.use("/api/stripe-connect", isAuthenticated, stripeConnectRoutes);

  // Public config endpoint (no auth required — exposes only public keys)
  app.get("/api/config/public", (_req: Request, res: Response) => {
    res.json({
      turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || process.env.VITE_TURNSTILE_SITE_KEY || "",
      stripePublicKey: process.env.VITE_STRIPE_PUBLIC_KEY || "",
    });
  });

  // Public contact form endpoint (no auth required)
  const contactLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, message: { message: "Too many contact requests. Please try again later." } });
  app.post("/api/contact", contactLimiter, async (req: Request, res: Response) => {
    try {
      const { name, email, subject, message } = req.body;
      if (!name || !email || !subject || !message) {
        return res.status(400).json({ message: "All fields are required: name, email, subject, message." });
      }
      // Basic email format check
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return res.status(400).json({ message: "Invalid email address." });
      }

      const adminEmail = process.env.ADMIN_EMAIL || "Bark@smallbizagent.ai";

      await sendEmail({
        to: adminEmail,
        subject: `[Contact Form] ${subject}`,
        replyTo: email,
        text: `New contact form submission:\n\nName: ${name}\nEmail: ${email}\nSubject: ${subject}\n\nMessage:\n${message}`,
        html: `
          <h2>New Contact Form Submission</h2>
          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Subject:</strong> ${subject}</p>
          <hr />
          <p><strong>Message:</strong></p>
          <p>${message.replace(/\n/g, '<br />')}</p>
        `,
      });

      res.json({ success: true, message: "Your message has been sent. We'll get back to you soon!" });
    } catch (error: any) {
      console.error("Contact form error:", error);
      res.status(500).json({ message: "Failed to send message. Please try again later." });
    }
  });

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

  // Register data export routes
  // IMPORTANT: Do NOT use app.use("/api", isAuthenticated, router) — that applies
  // isAuthenticated to ALL /api/* requests, blocking webhooks and public endpoints.
  // Export routes already check auth internally via req.user?.businessId.
  app.use("/api", exportRoutes);
  
  // Helper function to get businessId from authenticated user or API key
  // Returns 0 if no business is associated (caller must handle this)
  const getBusinessId = (req: Request): number => {
    // If user is authenticated via session, use their businessId
    if (req.isAuthenticated() && req.user?.businessId) {
      return req.user.businessId;
    }
    // If authenticated via API key, use the attached businessId
    if ((req as any).apiKeyBusinessId) {
      return (req as any).apiKeyBusinessId;
    }
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

  // =================== BUSINESS API + BUSINESS HOURS API (extracted to server/routes/businessRoutes.ts) ===================
  app.use('/api', businessRoutes);

  // =================== SERVICES API (extracted to server/routes/servicesRoutes.ts) ===================
  app.use('/api', servicesRoutes);

  // =================== CUSTOMERS API ===================
  // Register customerRoutes FIRST so /customers/enriched is matched before /customers/:id
  app.use('/api', customerRoutes);

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
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid customer ID" });
      }
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

      // Send TCPA welcome SMS if customer was created with smsOptIn
      if (customer.smsOptIn && customer.phone) {
        import('./services/notificationService').then(ns => {
          ns.sendSmsOptInWelcome(customer.id, businessId).catch(logAndSwallow('Routes'));
        }).catch(logAndSwallow('Routes'));
      }

      // Fire webhook event (fire-and-forget)
      fireEvent(businessId, 'customer.created', { customer })
        .catch(err => console.error('Webhook fire error:', err));

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
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid customer ID" });
      }
      const existing = await storage.getCustomer(id);
      if (!existing || !verifyBusinessOwnership(existing, req)) {
        return res.status(404).json({ message: "Customer not found" });
      }
      const validatedData = insertCustomerSchema.partial().parse(req.body);
      const customer = await storage.updateCustomer(id, validatedData);

      // Fire webhook event (fire-and-forget)
      fireEvent(existing.businessId, 'customer.updated', { customer })
        .catch(err => console.error('Webhook fire error:', err));

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
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid customer ID" });
      }
      const existing = await storage.getCustomer(id);
      if (!existing || !verifyBusinessOwnership(existing, req)) {
        return res.status(404).json({ message: "Customer not found" });
      }
      await storage.deleteCustomer(id, existing.businessId);
      res.status(204).end();
    } catch (error) {
      res.status(500).json({ message: "Error deleting customer" });
    }
  });

  // =================== STAFF API (extracted to server/routes/staffRoutes.ts) ===================
  app.use('/api', staffRoutes);

  // =================== APPOINTMENTS API ===================
  app.use('/api', appointmentRoutes);

  // =================== RESTAURANT RESERVATIONS API ===================
  app.get("/api/restaurant-reservations", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const params: any = {};

      if (req.query.startDate) {
        // Convert ISO date to YYYY-MM-DD for reservationDate comparison
        const d = new Date(req.query.startDate as string);
        params.startDate = d.toISOString().split('T')[0];
      }
      if (req.query.endDate) {
        const d = new Date(req.query.endDate as string);
        params.endDate = d.toISOString().split('T')[0];
      }
      if (req.query.date) {
        params.date = req.query.date as string;
      }
      if (req.query.status) {
        params.status = req.query.status as string;
      }
      if (req.query.customerId) {
        const customerId = parseInt(req.query.customerId as string);
        if (isNaN(customerId)) {
          return res.status(400).json({ message: "Invalid customer ID" });
        }
        params.customerId = customerId;
      }

      const reservations = await storage.getRestaurantReservations(businessId, params);

      // Populate customer data for each reservation
      const populatedReservations = await Promise.all(
        reservations.map(async (reservation) => {
          const customer = await storage.getCustomer(reservation.customerId);
          return { ...reservation, customer };
        })
      );

      res.json(populatedReservations);
    } catch (error) {
      res.status(500).json({ message: "Error fetching reservations" });
    }
  });

  app.get("/api/restaurant-reservations/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid reservation ID" });
      }
      const reservation = await storage.getRestaurantReservation(id);
      if (!reservation || !verifyBusinessOwnership(reservation, req)) {
        return res.status(404).json({ message: "Reservation not found" });
      }
      const customer = await storage.getCustomer(reservation.customerId);
      res.json({ ...reservation, customer });
    } catch (error) {
      res.status(500).json({ message: "Error fetching reservation" });
    }
  });

  app.put("/api/restaurant-reservations/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid reservation ID" });
      }
      const existing = await storage.getRestaurantReservation(id);
      if (!existing || !verifyBusinessOwnership(existing, req)) {
        return res.status(404).json({ message: "Reservation not found" });
      }

      // Only allow updating specific fields from the dashboard
      const allowedFields: (keyof typeof req.body)[] = ['status', 'specialRequests', 'partySize'];
      const updates: any = {};
      for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
          updates[field] = req.body[field];
        }
      }

      const updated = await storage.updateRestaurantReservation(id, updates);
      const customer = await storage.getCustomer(updated.customerId);
      res.json({ ...updated, customer });
    } catch (error) {
      res.status(500).json({ message: "Error updating reservation" });
    }
  });

  // =================== JOBS API (extracted to server/routes/jobRoutes.ts) ===================
  app.use('/api/jobs', jobRoutes);

  // notificationLimiter moved to notificationRoutes.ts

  // =================== REVIEW REQUESTS (extracted to server/routes/reviewRoutes.ts) ===================
  app.use('/api', reviewRoutes);

  // =================== RECEPTIONIST CONFIG + VOICE PREVIEW + TEST CALL + AI SUGGESTIONS (extracted to server/routes/receptionistConfigRoutes.ts) ===================
  app.use('/api', receptionistConfigRoutes);

  // =================== CALL LOGS + INTELLIGENCE + INSIGHTS (extracted to server/routes/callLogRoutes.ts) ===================
  app.use('/api', callLogRoutes);

  // =================== KNOWLEDGE BASE + UNANSWERED QUESTIONS (extracted to server/routes/knowledgeRoutes.ts) ===================
  app.use('/api', knowledgeRoutes);

  // AI SUGGESTIONS included in receptionistConfigRoutes.ts above

  // =================== NOTIFICATIONS + REMINDERS + AGENT ACTIVITY (extracted to server/routes/notificationRoutes.ts) ===================
  app.use('/api', notificationRoutes);

  // =================== EMAIL UNSUBSCRIBE ===================
  // One-click unsubscribe from drip/marketing emails (CAN-SPAM compliant)
  // Uses HMAC token to prevent unauthenticated abuse (anyone forging businessId)
  app.get("/api/email/unsubscribe", async (req: Request, res: Response) => {
    try {
      const businessId = parseInt(req.query.bid as string);
      const token = req.query.token as string;

      if (!businessId || isNaN(businessId)) {
        return res.status(400).send("<h2>Invalid unsubscribe link.</h2>");
      }

      // Verify HMAC token to prevent unauthorized unsubscribes
      if (!token) {
        return res.status(400).send("<h2>Invalid unsubscribe link.</h2>");
      }

      const secret = process.env.SESSION_SECRET || process.env.ENCRYPTION_KEY || 'unsubscribe-secret';
      const expectedToken = createHmac('sha256', secret)
        .update(`unsubscribe:${businessId}`)
        .digest('hex')
        .substring(0, 32);

      if (token !== expectedToken) {
        return res.status(403).send("<h2>Invalid or expired unsubscribe link.</h2>");
      }

      const business = await storage.getBusiness(businessId);
      if (!business) {
        return res.status(404).send("<h2>Business not found.</h2>");
      }

      // Set email_opt_out to true
      await storage.updateBusiness(businessId, { emailOptOut: true } as any);

      res.send(`
        <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 60px auto; text-align: center; padding: 20px;">
          <h2 style="color: #333;">You've been unsubscribed</h2>
          <p style="color: #666;">You will no longer receive marketing emails from SmallBizAgent.</p>
          <p style="color: #999; font-size: 13px; margin-top: 30px;">If this was a mistake, you can re-subscribe from your <a href="${process.env.APP_URL || 'https://www.smallbizagent.ai'}/settings">account settings</a>.</p>
        </div>
      `);
    } catch (error) {
      console.error("Error processing unsubscribe:", error);
      res.status(500).send("<h2>Something went wrong. Please try again.</h2>");
    }
  });

  // =================== PAYMENT API (STRIPE CONNECT) ===================
  // Uses Stripe Connect destination charges — money goes to business, NOT platform
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

      // Use Stripe Connect service — will REJECT if business has no Connect account
      const result = await stripeConnectService.createPaymentIntentForInvoice({
        amount,
        businessId: invoice.businessId,
        invoiceId,
        invoiceNumber: invoice.invoiceNumber,
        customerName: `${customer.firstName} ${customer.lastName}`,
        isPortalPayment: false,
      });

      // Update invoice with payment intent ID
      await storage.updateInvoice(invoiceId, {
        stripePaymentIntentId: result.paymentIntentId
      });

      res.json({ clientSecret: result.clientSecret });
    } catch (error: any) {
      console.error("Error creating payment intent:", error);
      // Return specific message for payment blocked (no Connect account)
      if (error.message?.includes('PAYMENT_BLOCKED')) {
        return res.status(403).json({
          message: "Online payments are not available. Please connect your Stripe account in Settings → Integrations first.",
          code: "PAYMENT_BLOCKED"
        });
      }
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
      return res.status(400).json({ error: 'Webhook signature verification failed' });
    }

    // Handle the event
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object;
        const invoiceId = parseInt(paymentIntent.metadata?.invoiceId);

        // Update invoice status to paid
        if (invoiceId) {
          try {
            await storage.updateInvoice(invoiceId, { status: 'paid' });

            // Notify business owner of payment (fire-and-forget)
            const paidInvoice = await storage.getInvoice(invoiceId);
            if (paidInvoice) {
              import('./services/ownerNotificationService').then(mod => {
                mod.notifyOwnerPaymentReceived(invoiceId, paidInvoice.businessId, paymentIntent.amount / 100)
                  .catch(err => console.error('[OwnerNotify] Payment alert error:', err));
              }).catch(err => console.error('[OwnerNotify] Import error:', err));

              // Orchestrator: route invoice.paid to recalculate customer insights (fire-and-forget)
              import('./services/orchestrationService').then(mod => {
                mod.dispatchEvent('invoice.paid', {
                  businessId: paidInvoice.businessId,
                  customerId: paidInvoice.customerId || undefined,
                }).catch(err => console.error('[Orchestrator] Error dispatching invoice.paid:', err));
              }).catch(err => console.error('[Orchestrator] Import error:', err));
            }
          } catch (error) {
            console.error('Error updating invoice status:', error);
          }
        }
        break;
      }

      case 'payment_intent.payment_failed': {
        const failedPayment = event.data.object;
        const failedInvoiceId = parseInt(failedPayment.metadata?.invoiceId);
        if (failedInvoiceId) {
          console.warn(`[Stripe] Payment failed for invoice ${failedInvoiceId}: ${failedPayment.last_payment_error?.message || 'Unknown reason'}`);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const deletedSub = event.data.object;
        console.warn(`[Stripe] Subscription deleted: ${deletedSub.id} — customer: ${deletedSub.customer}`);
        // Note: subscription lifecycle is also handled by subscriptionRoutes webhook
        break;
      }

      case 'invoice.payment_failed': {
        const failedInvoice = event.data.object as any;
        console.warn(`[Stripe] Invoice payment failed: ${failedInvoice.id} — subscription: ${failedInvoice.subscription || 'N/A'}`);
        break;
      }

      case 'account.updated': {
        // Stripe Connect: sync connected account status when it changes
        try {
          const account = event.data.object;
          await stripeConnectService.handleAccountUpdated(account);
        } catch (error) {
          console.error('Error handling account.updated webhook:', error);
        }
        break;
      }

      default:
        // Log unhandled events for monitoring (not an error, just informational)
        if (process.env.NODE_ENV !== 'production') {
          console.log(`[Stripe] Unhandled event type: ${event.type}`);
        }
    }

    // Return a response to acknowledge receipt of the event
    res.json({received: true});
  });

  // =================== TWILIO WEBHOOK ENDPOINTS ===================
  // Extracted to server/routes/twilioWebhookRoutes.ts
  app.use(twilioWebhookRoutes);

  // =================== RETELL AI + ORDERS + PHONE MANAGEMENT (extracted to server/routes/retellRoutes.ts) ===================
  app.use('/api', retellRoutes);

  // =================== GLOBAL SEARCH API ===================
  app.get("/api/search", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      if (businessId === 0) {
        return res.status(400).json({ error: "No business associated with this account" });
      }

      const query = ((req.query.q as string) || "").trim();
      if (!query || query.length < 2) {
        return res.json({ customers: [], jobs: [], invoices: [], appointments: [], quotes: [] });
      }

      const searchTerm = `%${query}%`;

      // Search customers by firstName, lastName, email, phone
      const customerResults = await db
        .select()
        .from(customers)
        .where(
          and(
            eq(customers.businessId, businessId),
            or(
              ilike(customers.firstName, searchTerm),
              ilike(customers.lastName, searchTerm),
              ilike(customers.email, searchTerm),
              ilike(customers.phone, searchTerm)
            )
          )
        )
        .limit(5);

      // Search jobs by title, include customer name
      const jobResults = await db
        .select({
          job: jobs,
          customerFirstName: customers.firstName,
          customerLastName: customers.lastName,
        })
        .from(jobs)
        .leftJoin(customers, eq(jobs.customerId, customers.id))
        .where(
          and(
            eq(jobs.businessId, businessId),
            or(
              ilike(jobs.title, searchTerm),
              ilike(customers.firstName, searchTerm),
              ilike(customers.lastName, searchTerm)
            )
          )
        )
        .limit(5);

      // Search invoices by invoiceNumber, include customer name
      const invoiceResults = await db
        .select({
          invoice: invoices,
          customerFirstName: customers.firstName,
          customerLastName: customers.lastName,
        })
        .from(invoices)
        .leftJoin(customers, eq(invoices.customerId, customers.id))
        .where(
          and(
            eq(invoices.businessId, businessId),
            or(
              ilike(invoices.invoiceNumber, searchTerm),
              ilike(customers.firstName, searchTerm),
              ilike(customers.lastName, searchTerm)
            )
          )
        )
        .limit(5);

      // Search quotes by quoteNumber, include customer name
      const quoteResults = await db
        .select({
          quote: quotes,
          customerFirstName: customers.firstName,
          customerLastName: customers.lastName,
        })
        .from(quotes)
        .leftJoin(customers, eq(quotes.customerId, customers.id))
        .where(
          and(
            eq(quotes.businessId, businessId),
            or(
              ilike(quotes.quoteNumber, searchTerm),
              ilike(customers.firstName, searchTerm),
              ilike(customers.lastName, searchTerm)
            )
          )
        )
        .limit(5);

      // Search appointments, include customer name and service name
      const appointmentResults = await db
        .select({
          appointment: appointments,
          customerFirstName: customers.firstName,
          customerLastName: customers.lastName,
          serviceName: services.name,
        })
        .from(appointments)
        .leftJoin(customers, eq(appointments.customerId, customers.id))
        .leftJoin(services, eq(appointments.serviceId, services.id))
        .where(
          and(
            eq(appointments.businessId, businessId),
            or(
              ilike(customers.firstName, searchTerm),
              ilike(customers.lastName, searchTerm),
              ilike(services.name, searchTerm)
            )
          )
        )
        .limit(5);

      res.json({
        customers: customerResults,
        jobs: jobResults.map((r) => ({
          ...r.job,
          customerName: r.customerFirstName && r.customerLastName
            ? `${r.customerFirstName} ${r.customerLastName}`
            : "Unknown Customer",
        })),
        invoices: invoiceResults.map((r) => ({
          ...r.invoice,
          customerName: r.customerFirstName && r.customerLastName
            ? `${r.customerFirstName} ${r.customerLastName}`
            : "Unknown Customer",
        })),
        quotes: quoteResults.map((r) => ({
          ...r.quote,
          customerName: r.customerFirstName && r.customerLastName
            ? `${r.customerFirstName} ${r.customerLastName}`
            : "Unknown Customer",
        })),
        appointments: appointmentResults.map((r) => ({
          ...r.appointment,
          customerName: r.customerFirstName && r.customerLastName
            ? `${r.customerFirstName} ${r.customerLastName}`
            : "Unknown Customer",
          serviceName: r.serviceName || null,
        })),
      });
    } catch (error) {
      console.error("Search error:", error);
      res.status(500).json({ error: "Error performing search" });
    }
  });

  // =================== CUSTOMER ACTIVITY API ===================
  app.get("/api/customers/:id/activity", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      if (businessId === 0) {
        return res.status(400).json({ error: "No business associated with this account" });
      }

      const customerId = parseInt(req.params.id);
      if (isNaN(customerId)) {
        return res.status(400).json({ error: "Invalid customer ID" });
      }

      // Verify customer belongs to this business
      const customer = await storage.getCustomer(customerId);
      if (!customer || customer.businessId !== businessId) {
        return res.status(404).json({ error: "Customer not found" });
      }

      // Fetch all related data in parallel (including call logs, services, staff, and call intelligence)
      const [customerJobs, customerInvoices, customerAppointments, customerQuotes, allCallLogs, allServices, allStaff] = await Promise.all([
        storage.getJobs(businessId, { customerId }),
        storage.getInvoices(businessId, { customerId }),
        storage.getAppointments(businessId, { customerId }),
        storage.getAllQuotes(businessId, { customerId }),
        storage.getCallLogs(businessId).catch(() => []),
        storage.getServices(businessId).catch(() => []),
        storage.getStaff(businessId).catch(() => []),
      ]);

      // Build lookup maps for service/staff names
      const serviceMap = new Map((allServices as any[]).map(s => [s.id, s.name]));
      const staffMap = new Map((allStaff as any[]).map(s => [s.id, `${s.firstName} ${s.lastName}`.trim()]));

      // Filter call logs for this customer (by phone number match)
      const customerCallLogs = customer.phone
        ? allCallLogs.filter((log: any) => {
            const normalizedLogPhone = (log.callerId || '').replace(/\D/g, '');
            const normalizedCustomerPhone = (customer.phone || '').replace(/\D/g, '');
            return normalizedLogPhone === normalizedCustomerPhone ||
                   normalizedLogPhone.endsWith(normalizedCustomerPhone) ||
                   normalizedCustomerPhone.endsWith(normalizedLogPhone);
          })
        : [];

      // Calculate stats
      const totalJobs = customerJobs.length;

      const paidInvoices = customerInvoices.filter((inv) => inv.status === "paid");
      const totalSpent = paidInvoices.reduce((sum, inv) => sum + (inv.total || 0), 0);

      const activeInvoices = customerInvoices.filter(
        (inv) => inv.status === "pending" || inv.status === "overdue"
      ).length;

      // Most recent completed appointment
      const completedAppointments = customerAppointments
        .filter((apt) => apt.status === "completed" || apt.status === "confirmed")
        .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
      const lastVisit = completedAppointments.length > 0
        ? completedAppointments[0].startDate
        : null;

      // Build timeline array sorted by date (newest first)
      const timeline: Array<{
        type: string;
        id: number;
        title: string;
        status: string | null;
        date: string | Date | null;
        amount?: number | null;
        // Enriched fields
        serviceName?: string | null;
        staffName?: string | null;
        callDuration?: number | null;
        summary?: string | null;
        intentDetected?: string | null;
        transcript?: string | null;
      }> = [];

      for (const job of customerJobs) {
        timeline.push({
          type: "job",
          id: job.id,
          title: job.title,
          status: job.status,
          date: job.createdAt,
        });
      }

      for (const inv of customerInvoices) {
        timeline.push({
          type: "invoice",
          id: inv.id,
          title: `Invoice #${inv.invoiceNumber}`,
          status: inv.status,
          date: inv.createdAt,
          amount: inv.total,
        });
      }

      for (const apt of customerAppointments) {
        const svcName = apt.serviceId ? serviceMap.get(apt.serviceId) : null;
        const stfName = apt.staffId ? staffMap.get(apt.staffId) : null;
        timeline.push({
          type: "appointment",
          id: apt.id,
          title: apt.notes || "Appointment",
          status: apt.status,
          date: apt.startDate,
          serviceName: svcName || null,
          staffName: stfName || null,
        });
      }

      for (const q of customerQuotes) {
        timeline.push({
          type: "quote",
          id: q.id,
          title: `Quote #${q.quoteNumber}`,
          status: q.status,
          date: q.createdAt,
          amount: q.total,
        });
      }

      for (const call of customerCallLogs) {
        const callStatus = (call as any).status || 'answered';
        const isSms = callStatus === 'sms';
        timeline.push({
          type: isSms ? "sms" : "call",
          id: call.id,
          title: isSms
            ? "SMS Message"
            : `Phone Call${(call as any).intentDetected ? ` — ${(call as any).intentDetected}` : ''}`,
          status: callStatus,
          date: (call as any).callTime || (call as any).createdAt,
          callDuration: isSms ? null : ((call as any).callDuration || null),
          summary: isSms ? null : ((call as any).summary || null),
          intentDetected: isSms ? null : ((call as any).intentDetected || null),
          transcript: isSms ? ((call as any).transcript || null) : null,
        });
      }

      // Sort timeline by date, newest first
      timeline.sort((a, b) => {
        const dateA = a.date ? new Date(a.date).getTime() : 0;
        const dateB = b.date ? new Date(b.date).getTime() : 0;
        return dateB - dateA;
      });

      res.json({
        stats: {
          totalJobs,
          totalSpent,
          lastVisit,
          activeInvoices,
        },
        timeline,
      });
    } catch (error) {
      console.error("Customer activity error:", error);
      res.status(500).json({ error: "Error fetching customer activity" });
    }
  });

  // Admin dashboard stats, businesses, users, revenue, system, activity, and phone-numbers
  // are now handled by adminRoutes.ts (mounted above)

  // Register calendar routes
  app.use('/api/calendar', calendarRoutes);

  // Register Google Business Profile routes
  app.use('/api/gbp', gbpRoutes);

  // Register Support Chat routes (AI-powered in-app help)
  const supportChatRoutes = (await import('./routes/supportChatRoutes')).default;
  app.use('/api/support', supportChatRoutes);

  // Register Social Media routes (OAuth + post management)
  app.use('/api/social-media', socialMediaRoutes);

  // Register QuickBooks integration routes
  app.use('/api/quickbooks', quickbooksRoutes);
  
  // ── Usage Projection ──
  app.get("/api/usage/projection", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = (req.user as any)?.businessId;
      if (!businessId) return res.status(400).json({ error: "No business associated" });
      const { getUsageProjection } = await import("./services/usageService.js");
      const projection = await getUsageProjection(businessId);
      res.json(projection);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(500).json({ error: message });
    }
  });

  // Register subscription routes
  app.use('/api/subscription', subscriptionRoutes);

  // Register quote routes
  app.use('/api', quoteRoutes);

  // Register invoice routes
  app.use('/api', invoiceRoutes);

  // customerRoutes registered earlier (before /customers/:id) so /customers/enriched matches first

  // Register recurring schedules routes
  app.use('/api/recurring-schedules', recurringRoutes);

  // Register Clover POS integration routes
  app.use('/api/clover', cloverRoutes);

  // Register Square POS integration routes
  app.use('/api/square', squareRoutes);

  // Register Heartland POS integration routes
  app.use('/api/heartland', heartlandRoutes);

  // Register phone number management routes (multi-line)
  app.use('/api', phoneRoutes);

  // Register multi-location routes (switch location, business groups)
  app.use('/api', locationRoutes);

  // ── SMS Intelligence Layer routes ──
  const smsProfileRoutes = (await import('./routes/smsProfileRoutes')).default;
  app.use('/api/sms-profile', isAuthenticated, smsProfileRoutes);

  const smsCampaignRoutes = (await import('./routes/smsCampaignRoutes')).default;
  app.use('/api/sms-campaigns', isAuthenticated, smsCampaignRoutes);

  // ── Workflow Builder routes ──
  const workflowRoutes = (await import('./routes/workflowRoutes')).default;
  app.use('/api/workflows', isAuthenticated, workflowRoutes);

  // SMS Activity Feed for business owners
  app.get('/api/sms-activity-feed', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = req.user!.businessId;
      if (!businessId) return res.status(400).json({ error: 'No business' });
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      const unreadOnly = req.query.unreadOnly === 'true';
      const feed = await storage.getSmsActivityFeed(businessId, { limit, offset, unreadOnly });
      res.json(feed);
    } catch (err) {
      console.error('[SMS Feed] Error:', err);
      res.status(500).json({ error: 'Failed to fetch SMS activity feed' });
    }
  });

  app.post('/api/sms-activity-feed/mark-read', isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = req.user!.businessId;
      if (!businessId) return res.status(400).json({ error: 'No business' });
      await storage.markSmsActivityFeedRead(businessId);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to mark feed as read' });
    }
  });

  // Register public booking routes (no auth required for customer-facing pages)
  app.use('/api', bookingRoutes);

  // Register embed widget routes (public, serves JS for external websites)
  app.use('/api', embedRoutes);

  // Serve calendar files from public directory
  app.use('/calendar', express.static('public/calendar'));
  
  const httpServer = createServer(app);
  return httpServer;
}
