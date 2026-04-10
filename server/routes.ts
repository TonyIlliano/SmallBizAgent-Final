import type { Express, Request, Response } from "express";
import express from "express";
import rateLimit from "express-rate-limit";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { db, pool } from "./db";
import { z } from "zod";
import {
  insertBusinessSchema,
  insertBusinessHoursSchema,
  insertServiceSchema,
  insertCustomerSchema,
  insertStaffSchema,
  insertAppointmentSchema,
  insertJobSchema,
  insertReceptionistConfigSchema,
  insertCallLogSchema,
  customers,
  jobs,
  invoices,
  quotes,
  appointments,
  services,
  auditLogs,
  agentActivityLog
} from "@shared/schema";
import { eq, and, or, desc, ilike, sql } from "drizzle-orm";
import { sanitizeBusiness } from './utils/sanitize';
import { createHmac } from "crypto";
import { logAndSwallow } from './utils/safeAsync';
import { sendEmail } from "./emailService";

// Setup authentication
import {
  setupAuth,
  isAuthenticated,
  isAdmin,
  belongsToBusiness,
  checkIsAdmin,
  checkBelongsToBusiness,
  hashPassword,
  validatePassword
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
import retellProvisioningService from "./services/retellProvisioningService";
import { handleRetellFunction, handleRetellWebhook, handleInboundWebhook, validateRetellWebhook } from './services/retellWebhookHandler';
import businessProvisioningService from "./services/businessProvisioningService";
import twilioProvisioningService from "./services/twilioProvisioningService";
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
import { GoogleBusinessProfileService } from "./services/googleBusinessProfileService";
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
import twilioWebhookRoutes from './routes/twilioWebhookRoutes';

export async function registerRoutes(app: Express): Promise<Server> {
  // Set up authentication first
  setupAuth(app);
  
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
      res.json(sanitizeBusiness(business));
    } catch (error) {
      res.status(500).json({ message: "Error fetching business" });
    }
  });

  app.post("/api/business", isAuthenticated, async (req: Request, res: Response) => {
    try {
      // Clean up empty strings and non-existent fields before validation
      const body = { ...req.body };
      if (body.website === '') body.website = null;
      if (body.zip === '') body.zip = null;
      if (body.address === '') body.address = null;
      if (body.city === '') body.city = null;
      if (body.state === '') body.state = null;
      if (body.industry === '') body.industry = null;
      if (body.phone === '') body.phone = null;
      // Remove fields that don't exist in the businesses table
      delete body.description;
      delete body.zipCode;

      console.log('Business create request:', JSON.stringify(body));
      const validatedData = insertBusinessSchema.parse(body);
      const business = await storage.createBusiness(validatedData);

      // Set up 14-day free trial for the new business
      try {
        const trialEnd = new Date();
        trialEnd.setDate(trialEnd.getDate() + 14);
        await storage.updateBusiness(business.id, {
          trialEndsAt: trialEnd,
          subscriptionStatus: 'trialing',
        });
        console.log(`Set 14-day trial for business ${business.id}, expires ${trialEnd.toISOString()}`);
      } catch (trialError) {
        console.error(`Failed to set trial for business ${business.id}:`, trialError);
        // Non-blocking — business still created
      }

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

      // Notify admin about new signup (non-blocking)
      try {
        const { sendNewBusinessSignupNotification } = await import("./emailService");
        const ownerEmail = req.user?.email || 'unknown';
        const ownerUsername = req.user?.username || 'unknown';
        sendNewBusinessSignupNotification(
          business.name,
          ownerEmail,
          ownerUsername,
          body.industry || null,
          body.phone || null
        ).catch(notifyErr => console.error('Failed to send signup notification:', notifyErr));
      } catch (notifyErr) {
        console.error('Failed to load email service for signup notification:', notifyErr);
      }

      // Start reminder scheduler for the new business
      schedulerService.startReminderScheduler(business.id);

      // Automatically provision business resources
      try {
        // Get area code from request if available
        const preferredAreaCode = req.body.areaCode || req.body.zipCode?.substring(0, 3);

        // Provision business in background, don't wait for completion
        // This prevents the API from blocking if Twilio is slow
        businessProvisioningService.provisionBusiness(business.id, {
          preferredAreaCode,
          // Never auto-provision a phone number on signup — businesses
          // enable the AI receptionist themselves (saves Twilio costs and
          // avoids buying numbers for accounts that may never use them).
          skipTwilioProvisioning: true
        }).catch(provisionError => {
          console.error(`Error provisioning business ${business.id}:`, provisionError);
        });

        res.status(201).json({
          ...sanitizeBusiness(business),
          provisioning: "started",
          message: "Business created. Resources are being provisioned in the background."
        });
      } catch (provisionError) {
        // Even if provisioning fails, still return created business
        console.error("Failed to start business provisioning:", provisionError);
        res.status(201).json({
          ...sanitizeBusiness(business),
          provisioning: "failed",
          message: "Business created but resource provisioning failed to start."
        });
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        const fieldErrors = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
        console.error('Business create validation error:', fieldErrors);
        return res.status(400).json({
          message: `Validation error: ${fieldErrors}`,
          errors: error.format()
        });
      }
      console.error('Business create error:', error);
      res.status(500).json({ message: `Error creating business: ${error instanceof Error ? error.message : 'Unknown error'}` });
    }
  });

  app.put("/api/business/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid business ID" });
      }

      // Authorization: user must be admin or belong to this business
      if (!checkIsAdmin(req) && !checkBelongsToBusiness(req, id)) {
        return res.status(403).json({ message: "Not authorized to update this business" });
      }

      // Clean up empty strings for optional/nullable fields before validation
      const body = { ...req.body };
      if (body.website === '') body.website = null;
      if (body.zip === '') body.zip = null;
      if (body.address === '') body.address = null;
      if (body.city === '') body.city = null;
      if (body.state === '') body.state = null;
      if (body.industry === '') body.industry = null;
      if (body.phone === '') body.phone = null;
      if (body.ownerPhone === '') body.ownerPhone = null;
      if (body.logoUrl === '') body.logoUrl = null;
      // Remove fields that don't exist in the businesses table
      delete body.description;
      delete body.zipCode;

      console.log(`Business update request for id ${id}:`, JSON.stringify(body));
      const validatedData = insertBusinessSchema.partial().parse(body);
      console.log(`Business update validated data for id ${id}:`, JSON.stringify(validatedData));
      const business = await storage.updateBusiness(id, validatedData);

      // Update Retell agent if any business info that affects the AI prompt changed (debounced)
      if (validatedData.name || validatedData.industry || validatedData.businessHours ||
          validatedData.phone || validatedData.address || validatedData.city || validatedData.state || validatedData.zip ||
          validatedData.restaurantPickupEnabled !== undefined || validatedData.restaurantDeliveryEnabled !== undefined) {
        retellProvisioningService.debouncedUpdateRetellAgent(id);
      }

      // Fire-and-forget GBP sync to detect conflicts (pull only, no auto-push)
      if (validatedData.name || validatedData.phone || validatedData.address || validatedData.description || validatedData.website) {
        const gbpSvc = new GoogleBusinessProfileService();
        gbpSvc.isConnected(id).then(connected => {
          if (connected) gbpSvc.syncBusinessData(id).catch(logAndSwallow('Routes'));
        }).catch(logAndSwallow('Routes'));
      }

      res.json(sanitizeBusiness(business));
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error('Business update validation error:', JSON.stringify(error.format()));
        // Extract human-readable error messages from Zod format
        const fieldErrors = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
        return res.status(400).json({
          message: `Validation error: ${fieldErrors}`,
          errors: error.format()
        });
      }
      console.error('Business update error:', error);
      res.status(500).json({ message: `Error updating business: ${error instanceof Error ? error.message : 'Unknown error'}` });
    }
  });
  
  // Get provisioning status for a business
  app.get("/api/business/:id/provisioning-status", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = parseInt(req.params.id);
      if (isNaN(businessId)) {
        return res.status(400).json({ message: "Invalid business ID" });
      }

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
        retellAgentId: business.retellAgentId,
      });
    } catch (error) {
      console.error("Error fetching provisioning status:", error);
      res.status(500).json({ message: "Error fetching provisioning status" });
    }
  });

  // Audit log endpoint
  app.get("/api/business/:id/audit-log", isAuthenticated, belongsToBusiness, async (req: Request, res: Response) => {
    try {
      const businessId = parseInt(req.params.id);
      if (isNaN(businessId)) {
        return res.status(400).json({ message: "Invalid business ID" });
      }
      const page = parseInt(req.query.page as string) || 1;
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const offset = (page - 1) * limit;
      const actionFilter = req.query.action as string;

      let query = db.select().from(auditLogs)
        .where(eq(auditLogs.businessId, businessId))
        .orderBy(desc(auditLogs.createdAt))
        .limit(limit)
        .offset(offset);

      const logs = await query;

      // Get total count for pagination
      const [{ count }] = await db.select({ count: sql<number>`count(*)` })
        .from(auditLogs)
        .where(eq(auditLogs.businessId, businessId));

      res.json({ logs, total: Number(count), page, limit });
    } catch (error) {
      console.error('Error fetching audit log:', error);
      res.status(500).json({ error: 'Error fetching audit log' });
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

      // Check receptionist: must have a Retell agent created
      const hasReceptionist = !!(business.retellAgentId);

      // Check calendar/integrations: has business hours configured
      const businessHours = await storage.getBusinessHours(businessId);
      const hasCalendar = businessHours.length > 0;

      // Check staff: has at least one staff member
      const staff = await storage.getStaff(businessId);
      const hasStaff = staff.length > 0;

      // Check customers: has at least one customer
      const customers = await storage.getCustomers(businessId);
      const hasCustomers = customers.length > 0;

      // Check online booking: booking is enabled with a slug
      const hasBooking = !!(business.bookingEnabled && business.bookingSlug);

      // Check POS integration: Clover, Square, or Heartland connected
      const hasPOS = !!(business.cloverMerchantId || business.squareMerchantId || business.heartlandApiKey);

      // Check reservations (restaurant-specific)
      const hasReservations = !!(business.reservationEnabled);

      // Check AI agents: at least one agent enabled
      const agentSettings = await storage.getAllAgentSettings(businessId);
      const enabledAgentCount = agentSettings.filter(s => s.enabled).length;
      const hasAgents = enabledAgentCount > 0;

      // Determine business category for industry-specific checklist
      const businessType = business.type || 'general';
      const businessIndustry = business.industry || null;

      const allComplete = businessProfile && hasServices && hasReceptionist && hasCalendar;

      res.json({
        businessProfile,
        services: hasServices,
        receptionist: hasReceptionist,
        calendar: hasCalendar,
        staff: hasStaff,
        customers: hasCustomers,
        booking: hasBooking,
        pos: hasPOS,
        reservations: hasReservations,
        agents: hasAgents,
        allComplete,
        businessType,
        businessIndustry,
        details: {
          businessName: business.name || null,
          businessPhone: business.phone || null,
          businessEmail: business.email || null,
          serviceCount: services.length,
          staffCount: staff.length,
          customerCount: customers.length,
          retellAgentId: business.retellAgentId || null,
          twilioPhoneNumber: business.twilioPhoneNumber || null,
          businessHoursDays: businessHours.length,
          bookingSlug: business.bookingSlug || null,
          bookingEnabled: business.bookingEnabled || false,
          enabledAgentCount,
        }
      });
    } catch (error) {
      console.error("Error fetching setup status:", error);
      res.status(500).json({ message: "Error fetching setup status" });
    }
  });

  // Dismiss or show the setup checklist (replaces localStorage)
  app.post("/api/user/setup-checklist-dismiss", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const { dismissed } = req.body;
      await storage.updateUser(userId, { setupChecklistDismissed: !!dismissed });
      res.json({ success: true });
    } catch (error) {
      console.error("Error updating checklist dismiss state:", error);
      res.status(500).json({ message: "Error updating preference" });
    }
  });

  // Dismiss a feature discovery tip
  app.post("/api/user/dismiss-tip", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const userId = (req.user as any)?.id;
      if (!userId) return res.status(401).json({ message: "Not authenticated" });
      const { tipId } = req.body;
      if (!tipId || typeof tipId !== 'string') return res.status(400).json({ message: "Invalid tip ID" });

      const user = await storage.getUser(userId);
      if (!user) return res.status(404).json({ message: "User not found" });

      const dismissed: string[] = user.dismissedTips ? JSON.parse(user.dismissedTips) : [];
      if (!dismissed.includes(tipId)) {
        dismissed.push(tipId);
      }
      await storage.updateUser(userId, { dismissedTips: JSON.stringify(dismissed) });
      res.json({ success: true });
    } catch (error) {
      console.error("Error dismissing tip:", error);
      res.status(500).json({ message: "Error dismissing tip" });
    }
  });

  // Endpoint to manually provision a business (useful for businesses created before this feature)
  app.post("/api/business/:id/provision", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = parseInt(req.params.id);
      if (isNaN(businessId)) {
        return res.status(400).json({ message: "Invalid business ID" });
      }

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
      if (isNaN(businessId)) {
        return res.status(400).json({ message: "Invalid business ID" });
      }

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

      // Auto-refresh Retell agent when business hours are created (includes knowledge base)
      if (hours.businessId) {
        const business = await storage.getBusiness(hours.businessId);
        if (business?.retellAgentId) {
          retellProvisioningService.debouncedUpdateRetellAgent(hours.businessId);
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
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid ID" });
      }

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

      // Auto-refresh Retell agent when business hours change (includes knowledge base)
      if (hours.businessId) {
        const business = await storage.getBusiness(hours.businessId);
        if (business?.retellAgentId) {
          retellProvisioningService.debouncedUpdateRetellAgent(hours.businessId);
        }
      }

      // Fire-and-forget GBP sync when hours change
      if (hours.businessId) {
        const gbpSvc = new GoogleBusinessProfileService();
        gbpSvc.isConnected(hours.businessId).then(connected => {
          if (connected) gbpSvc.syncBusinessData(hours.businessId).catch(logAndSwallow('Routes'));
        }).catch(logAndSwallow('Routes'));
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
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid service ID" });
      }
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

      // Update Retell agent with new services (debounced to prevent race conditions)
      retellProvisioningService.debouncedUpdateRetellAgent(businessId);

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

      // Seed industry-specific agent configs based on the template being applied
      // The client also sends industryType in the body to identify the template
      const industryType = req.body.industryType || '';
      if (industryType === 'landscaping') {
        try {
          // Follow-up agent: landscaping-specific thank-you and upsell messages
          await storage.upsertAgentSettings(businessId, 'follow_up', true, {
            thankYouTemplate: "Hi {customerName}! Thank you for choosing {businessName} for your lawn and landscape needs. We hope everything looks great! Reply if you need anything.",
            upsellTemplate: "Hi {customerName}, your property is probably due for some attention. Book your next service with {businessName}: {bookingLink}",
            thankYouDelayMinutes: 60,
            upsellDelayHours: 72,
            enableThankYou: true,
            enableUpsell: true,
          });

          // Rebooking agent: weekly mowing cycle + seasonal service intervals
          await storage.upsertAgentSettings(businessId, 'rebooking', true, {
            defaultIntervalDays: 7,
            serviceIntervals: {
              'Lawn Mowing': 7,
              'Fertilization Treatment': 42,
              'Tree & Shrub Trimming': 90,
              'Mulching': 180,
              'Lawn Aeration & Seeding': 365,
              'Spring Cleanup': 365,
              'Fall Leaf Cleanup': 365,
            },
            messageTemplate: "Hi {customerName}! It's been {daysSinceVisit} days since your last {serviceName} with {businessName}. Ready for us to come back? Reply YES to schedule!",
            bookingReplyTemplate: "Great! Book your next service here: {bookingLink} or call us at {businessPhone}",
            declineReplyTemplate: "No problem, {customerName}! We'll be here when your yard needs us. - {businessName}",
          });

          // No-show agent: tuned for estimate walkthroughs
          await storage.upsertAgentSettings(businessId, 'no_show', true, {
            messageTemplate: "Hey {customerName}, we stopped by for your estimate walkthrough with {businessName} but didn't catch you. Want to reschedule? Reply YES!",
            rescheduleReplyTemplate: "Great! Book your free estimate here: {bookingLink} or call {businessPhone}.",
            declineReplyTemplate: "No problem! Whenever you're ready for that free estimate, just give us a call. - {businessName}",
            expirationHours: 48,
          });

          // Estimate follow-up agent: patient cadence with seasonal urgency
          await storage.upsertAgentSettings(businessId, 'estimate_follow_up', true, {
            messageTemplates: [
              "Hi {customerName}! Just following up on your estimate from {businessName}. Any questions about the work we discussed?",
              "Hi {customerName}, wanted to check in on your landscaping estimate. Spots are filling up — let us know if you'd like to get on the schedule!",
              "Hi {customerName}, last check-in on your estimate from {businessName}. We'd love to help transform your property!",
            ],
            attemptIntervalHours: [72, 168, 336],
            maxAttempts: 3,
            autoExpire: true,
          });

          console.log(`[Template] Seeded landscaping-specific agent configs for business ${businessId}`);
        } catch (agentErr) {
          console.error(`[Template] Failed to seed landscaping agent configs for business ${businessId}:`, agentErr);
          // Non-fatal — services were still created successfully
        }
      }

      // Invalidate services cache after bulk creation
      dataCache.invalidate(businessId, 'services');

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
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid service ID" });
      }
      // Verify ownership before update
      const existing = await storage.getService(id);
      if (!existing || !verifyBusinessOwnership(existing, req)) {
        return res.status(404).json({ message: "Service not found" });
      }
      const validatedData = insertServiceSchema.partial().parse(req.body);
      const service = await storage.updateService(id, validatedData);

      // Invalidate services cache
      dataCache.invalidate(existing.businessId, 'services');

      // Update Retell agent with updated services (debounced to prevent race conditions)
      retellProvisioningService.debouncedUpdateRetellAgent(existing.businessId);

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
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid service ID" });
      }
      // Verify ownership before delete
      const existing = await storage.getService(id);
      if (!existing || !verifyBusinessOwnership(existing, req)) {
        return res.status(404).json({ message: "Service not found" });
      }
      const businessId = existing.businessId;
      await storage.deleteService(id, businessId);

      // Invalidate services cache
      dataCache.invalidate(businessId, 'services');

      // Update Retell agent after service deletion (debounced to prevent race conditions)
      retellProvisioningService.debouncedUpdateRetellAgent(businessId);

      res.status(204).end();
    } catch (error) {
      res.status(500).json({ message: "Error deleting service" });
    }
  });

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

  // =================== STAFF API ===================

  // Staff portal: Get my profile (staff only) — MUST be before /api/staff/:id
  app.get("/api/staff/me", isAuthenticated, async (req: Request, res: Response) => {
    try {
      if (req.user?.role !== "staff") {
        return res.status(403).json({ message: "Staff access only" });
      }

      const staffMember = await storage.getStaffMemberByUserId(req.user.id);
      if (!staffMember) {
        return res.status(404).json({ message: "Staff profile not found" });
      }

      // Get the business info
      const business = await storage.getBusiness(staffMember.businessId);

      // Get staff hours
      const hours = await storage.getStaffHours(staffMember.id);

      res.json({
        ...staffMember,
        businessName: business?.name || "Unknown",
        hours,
      });
    } catch (error) {
      console.error("Error fetching staff profile:", error);
      res.status(500).json({ message: "Error fetching staff profile" });
    }
  });

  // Staff portal: Get my appointments (staff only) — MUST be before /api/staff/:id
  app.get("/api/staff/me/appointments", isAuthenticated, async (req: Request, res: Response) => {
    try {
      if (req.user?.role !== "staff") {
        return res.status(403).json({ message: "Staff access only" });
      }

      const staffMember = await storage.getStaffMemberByUserId(req.user.id);
      if (!staffMember) {
        return res.status(404).json({ message: "Staff profile not found" });
      }

      const params: any = { staffId: staffMember.id };

      if (req.query.startDate) {
        params.startDate = new Date(req.query.startDate as string);
      }
      if (req.query.endDate) {
        params.endDate = new Date(req.query.endDate as string);
      }

      const appointments = await storage.getAppointments(staffMember.businessId, params);

      // Populate with customer + service data
      const populatedAppointments = await Promise.all(
        appointments.map(async (appointment) => {
          const customer = await storage.getCustomer(appointment.customerId);
          const service = appointment.serviceId ? await storage.getService(appointment.serviceId) : null;
          return {
            ...appointment,
            customer: customer || null,
            service: service || null,
          };
        })
      );

      res.json(populatedAppointments);
    } catch (error) {
      res.status(500).json({ message: "Error fetching staff appointments" });
    }
  });

  // Staff portal: Get my time-off entries (staff only) — MUST be before /api/staff/:id
  app.get("/api/staff/me/time-off", isAuthenticated, async (req: Request, res: Response) => {
    try {
      if (req.user?.role !== "staff") {
        return res.status(403).json({ message: "Staff access only" });
      }
      const staffMember = await storage.getStaffMemberByUserId(req.user.id);
      if (!staffMember) {
        return res.status(404).json({ message: "Staff profile not found" });
      }
      const entries = await storage.getStaffTimeOff(staffMember.id);
      res.json(entries);
    } catch (error) {
      console.error("Error fetching staff time off:", error);
      res.status(500).json({ message: "Error fetching time off" });
    }
  });

  // Staff portal: Add my own time-off (staff only) — MUST be before /api/staff/:id
  app.post("/api/staff/me/time-off", isAuthenticated, async (req: Request, res: Response) => {
    try {
      if (req.user?.role !== "staff") {
        return res.status(403).json({ message: "Staff access only" });
      }
      const staffMember = await storage.getStaffMemberByUserId(req.user.id);
      if (!staffMember) {
        return res.status(404).json({ message: "Staff profile not found" });
      }

      const { startDate, endDate, reason, allDay, note } = req.body;
      if (!startDate || !endDate) {
        return res.status(400).json({ message: "Start date and end date are required" });
      }
      const start = new Date(startDate);
      const end = new Date(endDate);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({ message: "Invalid date format" });
      }
      if (end < start) {
        return res.status(400).json({ message: "End date must be on or after start date" });
      }

      const entry = await storage.createStaffTimeOff({
        staffId: staffMember.id,
        businessId: staffMember.businessId,
        startDate: start,
        endDate: end,
        reason: reason || null,
        allDay: allDay !== false,
        note: note || null,
      });

      // Invalidate availability cache
      dataCache.invalidate(staffMember.businessId);

      res.status(201).json(entry);
    } catch (error) {
      console.error("Error creating staff time off:", error);
      res.status(500).json({ message: "Error creating time off" });
    }
  });

  // Staff portal: Delete my own time-off (staff only) — MUST be before /api/staff/:id
  app.delete("/api/staff/me/time-off/:timeOffId", isAuthenticated, async (req: Request, res: Response) => {
    try {
      if (req.user?.role !== "staff") {
        return res.status(403).json({ message: "Staff access only" });
      }
      const staffMember = await storage.getStaffMemberByUserId(req.user.id);
      if (!staffMember) {
        return res.status(404).json({ message: "Staff profile not found" });
      }
      const timeOffId = parseInt(req.params.timeOffId);
      if (isNaN(timeOffId)) {
        return res.status(400).json({ message: "Invalid time off ID" });
      }
      // Delete scoped to their businessId (ensures they can only delete their own)
      await storage.deleteStaffTimeOff(timeOffId, staffMember.businessId);

      // Invalidate availability cache
      dataCache.invalidate(staffMember.businessId);

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting staff time off:", error);
      res.status(500).json({ message: "Error deleting time off" });
    }
  });

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
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid staff ID" });
      }
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
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid staff ID" });
      }
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
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid staff ID" });
      }
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
      if (isNaN(staffId)) {
        return res.status(400).json({ message: "Invalid staff ID" });
      }
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
      if (isNaN(staffId)) {
        return res.status(400).json({ message: "Invalid staff ID" });
      }
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
      if (isNaN(staffId)) {
        return res.status(400).json({ message: "Invalid staff ID" });
      }
      const day = req.params.day.toLowerCase();
      const staffMember = await storage.getStaffMember(staffId);

      if (!staffMember || !verifyBusinessOwnership(staffMember, req)) {
        return res.status(404).json({ message: "Staff member not found" });
      }

      const updatedHours = await storage.updateStaffHoursForDay(staffId, day, req.body);

      // Invalidate staff hours cache
      dataCache.invalidate(staffMember.businessId, 'staffHours');

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

  // =================== STAFF-SERVICE ASSIGNMENTS ===================

  // Get services assigned to a staff member
  app.get("/api/staff/:id/services", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const staffId = parseInt(req.params.id);
      if (isNaN(staffId)) {
        return res.status(400).json({ message: "Invalid staff ID" });
      }
      const staffMember = await storage.getStaffMember(staffId);
      if (!staffMember || !verifyBusinessOwnership(staffMember, req)) {
        return res.status(404).json({ message: "Staff member not found" });
      }
      const serviceIds = await storage.getStaffServices(staffId);
      res.json({ serviceIds });
    } catch (error) {
      console.error('Error getting staff services:', error);
      res.status(500).json({ message: "Error getting staff services" });
    }
  });

  // Set services for a staff member (replace all)
  app.put("/api/staff/:id/services", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const staffId = parseInt(req.params.id);
      if (isNaN(staffId)) {
        return res.status(400).json({ message: "Invalid staff ID" });
      }
      const staffMember = await storage.getStaffMember(staffId);
      if (!staffMember || !verifyBusinessOwnership(staffMember, req)) {
        return res.status(404).json({ message: "Staff member not found" });
      }
      const { serviceIds } = req.body;
      if (!Array.isArray(serviceIds)) {
        return res.status(400).json({ message: "serviceIds must be an array" });
      }
      await storage.setStaffServices(staffId, serviceIds);
      dataCache.invalidate(staffMember.businessId, 'staffServiceMap');
      res.json({ success: true, serviceIds });
    } catch (error) {
      console.error('Error setting staff services:', error);
      res.status(500).json({ message: "Error setting staff services" });
    }
  });

  // =================== STAFF PORTAL API ===================

  // Send invite to a staff member (owner only)
  app.post("/api/staff/:id/invite", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const staffId = parseInt(req.params.id);
      if (isNaN(staffId)) {
        return res.status(400).json({ message: "Invalid staff ID" });
      }
      const staffMember = await storage.getStaffMember(staffId);
      if (!staffMember || !verifyBusinessOwnership(staffMember, req)) {
        return res.status(404).json({ message: "Staff member not found" });
      }

      const email = req.body.email || staffMember.email;
      if (!email) {
        return res.status(400).json({ message: "Email is required to send an invite" });
      }

      // Generate unique invite code
      const { randomBytes } = await import("crypto");
      const inviteCode = randomBytes(24).toString("hex");

      // Create invite with 7-day expiry
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

      const invite = await storage.createStaffInvite({
        businessId: staffMember.businessId,
        staffId: staffMember.id,
        email,
        inviteCode,
        status: "pending",
        expiresAt,
      });

      // Update staff email if provided
      if (req.body.email && req.body.email !== staffMember.email) {
        await storage.updateStaffMember(staffId, { email: req.body.email });
      }

      // Send invite email to staff member
      const business = await storage.getBusiness(staffMember.businessId);
      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const fullInviteUrl = `${baseUrl}/staff/join/${inviteCode}`;
      const staffName = `${staffMember.firstName}${staffMember.lastName ? ` ${staffMember.lastName}` : ""}`;

      // Send invite via email
      try {
        const { sendStaffInviteEmail } = await import("./emailService");
        await sendStaffInviteEmail(email, staffName, business?.name || "Your Team", fullInviteUrl);
        console.log(`Staff invite email sent to ${email} for business ${staffMember.businessId}`);
      } catch (emailError) {
        console.error("Failed to send invite email (invite still created):", emailError);
      }

      // Also send invite via SMS if staff member has a phone number
      if (staffMember.phone) {
        try {
          const twilioService = await import("./services/twilioService");
          const businessName = business?.name || "Your Team";
          await twilioService.sendSms(
            staffMember.phone,
            `${businessName} has invited you to join their team on SmallBizAgent! Create your account here: ${fullInviteUrl}`
          );
          console.log(`Staff invite SMS sent to ${staffMember.phone}`);
        } catch (smsError) {
          console.error("Failed to send invite SMS (invite still created):", smsError);
        }
      }

      res.status(201).json({
        ...invite,
        inviteUrl: `/staff/join/${inviteCode}`,
      });
    } catch (error) {
      console.error("Error creating staff invite:", error);
      res.status(500).json({ message: "Error creating staff invite" });
    }
  });

  // Get invites for a business (owner only)
  app.get("/api/staff-invites", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const invites = await storage.getStaffInvitesByBusiness(businessId);
      res.json(invites);
    } catch (error) {
      res.status(500).json({ message: "Error fetching invites" });
    }
  });

  // Validate invite code (public - no auth needed)
  app.get("/api/staff-invite/:code", async (req: Request, res: Response) => {
    try {
      const invite = await storage.getStaffInviteByCode(req.params.code);
      if (!invite) {
        return res.status(404).json({ message: "Invalid invite code" });
      }

      if (invite.status !== "pending") {
        return res.status(400).json({ message: "This invite has already been used" });
      }

      if (new Date() > invite.expiresAt) {
        return res.status(400).json({ message: "This invite has expired" });
      }

      // Get business and staff info for the registration page
      const business = await storage.getBusiness(invite.businessId);
      const staffMember = await storage.getStaffMember(invite.staffId);

      res.json({
        valid: true,
        businessName: business?.name || "Unknown Business",
        staffName: staffMember ? `${staffMember.firstName} ${staffMember.lastName}` : "Staff",
        email: invite.email,
      });
    } catch (error) {
      res.status(500).json({ message: "Error validating invite" });
    }
  });

  // Accept invite - register as staff member (public - no auth)
  app.post("/api/staff-invite/:code/accept", async (req: Request, res: Response) => {
    try {
      const invite = await storage.getStaffInviteByCode(req.params.code);
      if (!invite) {
        return res.status(404).json({ message: "Invalid invite code" });
      }

      if (invite.status !== "pending") {
        return res.status(400).json({ message: "This invite has already been used" });
      }

      if (new Date() > invite.expiresAt) {
        return res.status(400).json({ message: "This invite has expired" });
      }

      const { username, password, email } = req.body;

      if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required" });
      }

      // Validate password strength
      const passwordValidation = validatePassword(password);
      if (!passwordValidation.valid) {
        return res.status(400).json({
          message: "Password does not meet security requirements",
          details: passwordValidation.errors,
        });
      }

      // Check if username already exists
      const existingUser = await storage.getUserByUsername(username.toLowerCase());
      if (existingUser) {
        return res.status(400).json({ message: "Username already exists" });
      }

      // Check if email already exists
      const existingEmail = await storage.getUserByEmail(email || invite.email);
      if (existingEmail) {
        return res.status(400).json({ message: "Email already in use" });
      }

      // Create the user account with staff role
      const hashedPassword = await hashPassword(password);
      const user = await storage.createUser({
        username: username.toLowerCase(),
        email: email || invite.email,
        password: hashedPassword,
        role: "staff",
        businessId: invite.businessId,
      });

      // Mark email as verified (they accepted an invite, so we trust the email)
      await storage.updateUser(user.id, { emailVerified: true });

      // Link user to staff record
      await storage.updateStaffMember(invite.staffId, { userId: user.id });

      // Mark invite as accepted
      await storage.updateStaffInvite(invite.id, { status: "accepted" });

      // Log them in
      req.login(user, (err: Error | null) => {
        if (err) {
          return res.status(500).json({ message: "Account created but login failed" });
        }
        const { password: _, ...userWithoutPassword } = user;
        return res.status(201).json(userWithoutPassword);
      });
    } catch (error) {
      console.error("Error accepting staff invite:", error);
      res.status(500).json({ message: "Error creating staff account" });
    }
  });

  // =================== STAFF TIME OFF API ===================

  // Get all time-off entries for a business
  app.get("/api/staff/time-off", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const entries = await storage.getStaffTimeOffByBusiness(businessId);
      res.json(entries);
    } catch (error) {
      console.error("Error fetching staff time off:", error);
      res.status(500).json({ message: "Error fetching time off entries" });
    }
  });

  // Get time-off entries for a specific staff member
  app.get("/api/staff/:id/time-off", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const staffId = parseInt(req.params.id);
      if (isNaN(staffId)) {
        return res.status(400).json({ message: "Invalid staff ID" });
      }
      const staffMember = await storage.getStaffMember(staffId);
      if (!staffMember || !verifyBusinessOwnership(staffMember, req)) {
        return res.status(404).json({ message: "Staff member not found" });
      }
      const entries = await storage.getStaffTimeOff(staffId);
      res.json(entries);
    } catch (error) {
      console.error("Error fetching staff time off:", error);
      res.status(500).json({ message: "Error fetching time off entries" });
    }
  });

  // Create a time-off entry
  app.post("/api/staff/:id/time-off", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const staffId = parseInt(req.params.id);
      if (isNaN(staffId)) {
        return res.status(400).json({ message: "Invalid staff ID" });
      }
      const staffMember = await storage.getStaffMember(staffId);
      if (!staffMember || !verifyBusinessOwnership(staffMember, req)) {
        return res.status(404).json({ message: "Staff member not found" });
      }

      const businessId = getBusinessId(req);
      const { startDate, endDate, reason, allDay, note } = req.body;

      if (!startDate || !endDate) {
        return res.status(400).json({ message: "Start date and end date are required" });
      }

      const start = new Date(startDate);
      const end = new Date(endDate);
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({ message: "Invalid date format" });
      }
      if (end < start) {
        return res.status(400).json({ message: "End date must be on or after start date" });
      }

      const entry = await storage.createStaffTimeOff({
        staffId,
        businessId,
        startDate: start,
        endDate: end,
        reason: reason || null,
        allDay: allDay !== false, // default to true
        note: note || null,
      });

      // Invalidate availability cache so Retell picks up time-off changes
      dataCache.invalidate(businessId);

      res.status(201).json(entry);
    } catch (error) {
      console.error("Error creating staff time off:", error);
      res.status(500).json({ message: "Error creating time off entry" });
    }
  });

  // Update a time-off entry
  app.put("/api/staff/time-off/:timeOffId", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const timeOffId = parseInt(req.params.timeOffId);
      if (isNaN(timeOffId)) {
        return res.status(400).json({ message: "Invalid time off ID" });
      }
      const businessId = getBusinessId(req);
      const { startDate, endDate, reason, allDay, note } = req.body;

      const updateData: any = {};
      if (startDate) updateData.startDate = new Date(startDate);
      if (endDate) updateData.endDate = new Date(endDate);
      if (reason !== undefined) updateData.reason = reason;
      if (allDay !== undefined) updateData.allDay = allDay;
      if (note !== undefined) updateData.note = note;

      const updated = await storage.updateStaffTimeOff(timeOffId, businessId, updateData);
      if (!updated) {
        return res.status(404).json({ message: "Time off entry not found" });
      }

      // Invalidate availability cache so Retell picks up time-off changes
      dataCache.invalidate(businessId);

      res.json(updated);
    } catch (error) {
      console.error("Error updating staff time off:", error);
      res.status(500).json({ message: "Error updating time off entry" });
    }
  });

  // Delete a time-off entry
  app.delete("/api/staff/time-off/:timeOffId", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const timeOffId = parseInt(req.params.timeOffId);
      if (isNaN(timeOffId)) {
        return res.status(400).json({ message: "Invalid time off ID" });
      }
      const businessId = getBusinessId(req);
      await storage.deleteStaffTimeOff(timeOffId, businessId);

      // Invalidate availability cache so Retell picks up time-off changes
      dataCache.invalidate(businessId);

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting staff time off:", error);
      res.status(500).json({ message: "Error deleting time off entry" });
    }
  });

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

  // Rate limiter for notification/SMS-sending endpoints (prevent abuse)
  const notificationLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10, // 10 notifications per hour per user
    message: { message: 'Too many notification requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
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
      if (isNaN(jobId)) {
        return res.status(400).json({ message: "Invalid job ID" });
      }
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
      if (isNaN(requestId)) {
        return res.redirect(req.query.url as string || '/');
      }
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

  // =================== VOICE PREVIEW PROXY ===================
  // Proxy ElevenLabs voice preview audio to avoid browser CORS/autoplay issues
  const VOICE_PREVIEW_URLS: Record<string, string> = {
    paula: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/21m00Tcm4TlvDq8ikWAM/dff5d82d-d16d-45b9-ae73-be2ad8850855.mp3',
    rachel: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/21m00Tcm4TlvDq8ikWAM/dff5d82d-d16d-45b9-ae73-be2ad8850855.mp3',
    domi: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/AZnzlk1XvdvUeBnXmlld/53bd2f5f-bb59-4146-9922-245b2a466c80.mp3',
    bella: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/EXAVITQu4vr4xnSDxMaL/53bd2f5f-bb59-4146-8822-245b2a466c80.mp3',
    elli: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/MF3mGyEYCl7XYWbV9V6O/bea2dc16-9abf-4162-b011-66531458e022.mp3',
    adam: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/pNInz6obpgDQGcFmaJgB/d6905d7a-dd26-4187-bfff-1bd3a5ea7cac.mp3',
    antoni: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/ErXwobaYiN019PkySvjV/53bd2f5f-bb59-1111-8822-225b2a466c80.mp3',
    josh: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/TxGEqnHWrfWFTfGW9XjX/bdc4303c-a20d-4cec-97eb-dca625044eac.mp3',
    arnold: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/VR6AewLTigWG4xSOukaG/2c4395e7-91b1-44cd-8f0f-e4aebd292461.mp3',
    sam: 'https://storage.googleapis.com/eleven-public-prod/premade/voices/yoZ06aMxZJJ28mfd3POQ/1c4d417c-ba80-4de8-874a-a1c57987ea63.mp3',
  };

  app.get("/api/voice-preview/:voiceId", async (req: Request, res: Response) => {
    try {
      const voiceId = req.params.voiceId.toLowerCase();
      const url = VOICE_PREVIEW_URLS[voiceId];
      if (!url) {
        return res.status(404).json({ error: "Voice not found" });
      }

      const response = await fetch(url);
      if (!response.ok) {
        return res.status(502).json({ error: "Failed to fetch voice preview" });
      }

      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
      const buffer = await response.arrayBuffer();
      res.send(Buffer.from(buffer));
    } catch (error) {
      console.error("Voice preview error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // =================== TEST CALL ===================
  // Let business owner test their AI receptionist by receiving an outbound call
  app.post("/api/receptionist/test-call", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      if (businessId === 0) {
        return res.status(400).json({ error: 'No business associated with your account' });
      }

      const business = await storage.getBusiness(businessId);
      if (!business) {
        return res.status(404).json({ error: 'Business not found' });
      }

      // Validate prerequisites: Retell agent and phone number must be provisioned
      if (!business.retellAgentId) {
        return res.status(400).json({
          error: 'AI receptionist not set up yet. Please provision your receptionist first.'
        });
      }
      if (!business.retellPhoneNumberId) {
        return res.status(400).json({
          error: 'No phone number configured for your AI receptionist. Please set up a phone number first.'
        });
      }

      // Get the phone number to call — use request body or fall back to business phone
      let phoneNumber = req.body.phoneNumber || business.phone;
      if (!phoneNumber) {
        return res.status(400).json({
          error: 'No phone number provided. Please enter a phone number to call.'
        });
      }

      // Normalize to E.164 format
      phoneNumber = phoneNumber.replace(/[\s\-\(\)\.]/g, '');
      if (!phoneNumber.startsWith('+')) {
        if (phoneNumber.startsWith('1') && phoneNumber.length === 11) {
          phoneNumber = '+' + phoneNumber;
        } else {
          phoneNumber = '+1' + phoneNumber;
        }
      }

      // Validate E.164 format
      if (!/^\+[1-9]\d{6,14}$/.test(phoneNumber)) {
        return res.status(400).json({
          error: 'Invalid phone number format. Please enter a valid phone number.'
        });
      }

      // Call Retell outbound API
      const retellService = (await import('./services/retellService')).default;
      const result = await retellService.createOutboundCall(
        business.retellAgentId,
        business.twilioPhoneNumber!,
        phoneNumber
      );

      if (result.error) {
        console.error(`[TestCall] Failed for business ${businessId}:`, result.error);
        return res.status(500).json({
          error: 'Failed to initiate test call. Please try again in a moment.'
        });
      }

      console.log(`[TestCall] Initiated for business ${businessId}: callId=${result.callId}, to=${phoneNumber}`);
      res.json({
        success: true,
        callId: result.callId,
        message: 'Test call initiated! Answer your phone to speak with your AI receptionist.'
      });
    } catch (error) {
      console.error('[TestCall] Error:', error);
      res.status(500).json({ error: 'Failed to initiate test call' });
    }
  });

  // =================== VIRTUAL RECEPTIONIST API ===================
  app.get("/api/receptionist-config/:businessId", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const requestedBusinessId = parseInt(req.params.businessId);
      if (isNaN(requestedBusinessId)) {
        return res.status(400).json({ message: "Invalid business ID" });
      }
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

      // Auto-refresh Retell agent when receptionist config is created (syncs transfer numbers etc.)
      retellProvisioningService.debouncedUpdateRetellAgent(businessId);

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
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid receptionist config ID" });
      }
      // Verify ownership: look up config by the user's businessId (NOT by the URL param id)
      // because getReceptionistConfig queries by businessId, not by config record id
      const userBusinessId = getBusinessId(req);
      const existing = await storage.getReceptionistConfig(userBusinessId);
      if (!existing || existing.id !== id) {
        return res.status(404).json({ message: "Receptionist configuration not found" });
      }
      const validatedData = insertReceptionistConfigSchema.partial().parse(req.body);
      const config = await storage.updateReceptionistConfig(id, validatedData);

      // Auto-refresh Retell agent when receptionist config changes (syncs transfer numbers etc.)
      retellProvisioningService.debouncedUpdateRetellAgent(userBusinessId);

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
    } catch (error: any) {
      // Handle missing column errors gracefully (DB migration may not have run yet)
      if (error?.message?.includes('does not exist') || error?.code === '42703') {
        console.warn('[CallLogs] Column missing in call_logs table, returning empty:', error.message);
        res.json([]);
      } else {
        console.error('[CallLogs] Error fetching call logs:', error?.message || error);
        res.status(500).json({ message: "Error fetching call logs" });
      }
    }
  });

  app.get("/api/call-logs/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid call log ID" });
      }
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
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid call log ID" });
      }
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

  // =================== CALL INTELLIGENCE API ===================

  app.get("/api/call-intelligence/:callLogId", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const callLogId = parseInt(req.params.callLogId);
      if (isNaN(callLogId)) {
        return res.status(400).json({ error: "Invalid call log ID" });
      }
      const intelligence = await storage.getCallIntelligence(callLogId);
      if (!intelligence) {
        return res.status(404).json({ error: 'Intelligence not found for this call' });
      }
      const businessId = getBusinessId(req);
      if (intelligence.businessId !== businessId && req.user!.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden' });
      }
      res.json(intelligence);
    } catch (error) {
      console.error('Error fetching call intelligence:', error);
      res.status(500).json({ error: 'Failed to fetch call intelligence' });
    }
  });

  app.get("/api/call-intelligence/business/summary", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const { startDate, endDate } = req.query;

      const intelligence = await storage.getCallIntelligenceByBusiness(businessId, {
        startDate: startDate ? new Date(startDate as string) : undefined,
        endDate: endDate ? new Date(endDate as string) : undefined,
        limit: 100,
      });

      const totalCalls = intelligence.length;
      const avgSentiment = intelligence.reduce((sum, r) => sum + (r.sentiment || 3), 0) / (totalCalls || 1);
      const intentBreakdown = intelligence.reduce((acc, r) => {
        if (r.intent) acc[r.intent] = (acc[r.intent] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      const followUpsNeeded = intelligence.filter(r => r.followUpNeeded).length;

      res.json({
        totalAnalyzed: totalCalls,
        averageSentiment: Math.round(avgSentiment * 10) / 10,
        intentBreakdown,
        followUpsNeeded,
        recentIntelligence: intelligence.slice(0, 20),
      });
    } catch (error) {
      console.error('Error fetching intelligence summary:', error);
      res.status(500).json({ error: 'Failed to fetch intelligence summary' });
    }
  });

  // =================== CUSTOMER INSIGHTS API ===================

  app.get("/api/customers/:id/insights", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const customerId = parseInt(req.params.id);
      if (isNaN(customerId)) {
        return res.status(400).json({ message: "Invalid customer ID" });
      }
      const businessId = getBusinessId(req);
      const insights = await storage.getCustomerInsights(customerId, businessId);
      if (!insights) {
        return res.json({ message: 'No insights calculated yet', insights: null });
      }
      res.json(insights);
    } catch (error) {
      console.error('Error fetching customer insights:', error);
      res.status(500).json({ error: 'Failed to fetch customer insights' });
    }
  });

  app.get("/api/customers/insights/high-risk", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const highRisk = await storage.getHighRiskCustomers(businessId);
      res.json(highRisk);
    } catch (error) {
      console.error('Error fetching high-risk customers:', error);
      res.status(500).json({ error: 'Failed to fetch high-risk customers' });
    }
  });

  // =================== AI KNOWLEDGE BASE API ===================

  // Trigger website scrape
  app.post("/api/knowledge/scrape-website", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const business = await storage.getBusiness(businessId);
      if (!business) {
        return res.status(404).json({ message: "Business not found" });
      }

      // Use URL from request body, or fall back to business profile website
      const url = req.body.url || business.website;
      if (!url) {
        return res.status(400).json({ message: "No website URL provided. Set your business website in Settings or provide a URL." });
      }

      // Start scrape in background (don't await)
      const { scrapeWebsite } = await import('./services/websiteScraperService');
      scrapeWebsite(businessId, url)
        .catch(err => console.error('Background website scrape error:', err));

      res.json({ message: "Website scan started", status: "scraping" });
    } catch (error) {
      console.error("Error starting website scrape:", error);
      res.status(500).json({ message: "Error starting website scan" });
    }
  });

  // Get website scrape status
  app.get("/api/knowledge/scrape-status", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const cache = await storage.getWebsiteScrapeCache(businessId);
      if (!cache) {
        return res.json({ status: 'none' });
      }
      // Also return count of website-sourced knowledge entries
      const websiteEntries = await storage.getBusinessKnowledge(businessId, { source: 'website' });
      res.json({ ...cache, knowledgeEntriesCount: websiteEntries.length });
    } catch (error) {
      res.status(500).json({ message: "Error fetching scrape status" });
    }
  });

  // List knowledge entries
  app.get("/api/knowledge", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const params: any = {};
      if (req.query.isApproved !== undefined) params.isApproved = req.query.isApproved === 'true';
      if (req.query.source) params.source = req.query.source as string;
      if (req.query.category) params.category = req.query.category as string;
      const entries = await storage.getBusinessKnowledge(businessId, params);
      res.json(entries);
    } catch (error) {
      res.status(500).json({ message: "Error fetching knowledge entries" });
    }
  });

  // Create manual knowledge entry
  app.post("/api/knowledge", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const { question, answer, category } = req.body;
      if (!question || !answer) {
        return res.status(400).json({ message: "Question and answer are required" });
      }
      const entry = await storage.createBusinessKnowledge({
        businessId,
        question,
        answer,
        category: category || 'faq',
        source: 'owner',
        isApproved: true,
        priority: 10, // Manual entries get highest priority
      });

      // Trigger Retell agent update to include new knowledge
      try {
        const { debouncedUpdateRetellAgent } = await import('./services/retellProvisioningService');
        debouncedUpdateRetellAgent(businessId);
      } catch (e) { console.error(`[Knowledge] Failed to update Retell agent for business ${businessId}:`, e); }

      res.json(entry);
    } catch (error) {
      res.status(500).json({ message: "Error creating knowledge entry" });
    }
  });

  // Update knowledge entry
  app.put("/api/knowledge/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid knowledge entry ID" });
      }
      const existing = await storage.getBusinessKnowledgeEntry(id);
      if (!existing || !verifyBusinessOwnership(existing, req)) {
        return res.status(404).json({ message: "Knowledge entry not found" });
      }
      const { question, answer, category, isApproved, priority } = req.body;
      const updated = await storage.updateBusinessKnowledge(id, {
        ...(question !== undefined && { question }),
        ...(answer !== undefined && { answer }),
        ...(category !== undefined && { category }),
        ...(isApproved !== undefined && { isApproved }),
        ...(priority !== undefined && { priority }),
      });

      // Trigger Retell agent update
      try {
        const { debouncedUpdateRetellAgent } = await import('./services/retellProvisioningService');
        debouncedUpdateRetellAgent(existing.businessId);
      } catch (e) { console.error(`[Knowledge] Failed to update Retell agent for business ${existing.businessId}:`, e); }

      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Error updating knowledge entry" });
    }
  });

  // Delete knowledge entry
  app.delete("/api/knowledge/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid knowledge entry ID" });
      }
      const existing = await storage.getBusinessKnowledgeEntry(id);
      if (!existing || !verifyBusinessOwnership(existing, req)) {
        return res.status(404).json({ message: "Knowledge entry not found" });
      }
      await storage.deleteBusinessKnowledge(id, existing.businessId);

      // Trigger Retell agent update
      try {
        const { debouncedUpdateRetellAgent } = await import('./services/retellProvisioningService');
        debouncedUpdateRetellAgent(existing.businessId);
      } catch (e) { console.error(`[Knowledge] Failed to update Retell agent for business ${existing.businessId}:`, e); }

      res.json({ message: "Knowledge entry deleted" });
    } catch (error) {
      res.status(500).json({ message: "Error deleting knowledge entry" });
    }
  });

  // List unanswered questions
  app.get("/api/unanswered-questions", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const params: any = {};
      if (req.query.status) params.status = req.query.status as string;
      const questions = await storage.getUnansweredQuestions(businessId, params);
      res.json(questions);
    } catch (error) {
      res.status(500).json({ message: "Error fetching unanswered questions" });
    }
  });

  // Get pending unanswered question count (for notification badge)
  app.get("/api/unanswered-questions/count", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const count = await storage.getUnansweredQuestionCount(businessId);
      res.json({ count });
    } catch (error) {
      res.status(500).json({ message: "Error fetching question count" });
    }
  });

  // Answer an unanswered question (promotes to knowledge base)
  app.post("/api/unanswered-questions/:id/answer", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid question ID" });
      }
      const { answer } = req.body;
      if (!answer) {
        return res.status(400).json({ message: "Answer is required" });
      }

      const question = await storage.getUnansweredQuestion(id);
      if (!question || !verifyBusinessOwnership(question, req)) {
        return res.status(404).json({ message: "Question not found" });
      }

      const { promoteToKnowledge } = await import('./services/unansweredQuestionService');
      const result = await promoteToKnowledge(id, answer);

      if (result.success) {
        res.json({ message: "Answer saved to knowledge base", knowledgeEntryId: result.knowledgeEntryId });
      } else {
        res.status(400).json({ message: result.error });
      }
    } catch (error) {
      res.status(500).json({ message: "Error answering question" });
    }
  });

  // Dismiss an unanswered question
  app.post("/api/unanswered-questions/:id/dismiss", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid question ID" });
      }
      const question = await storage.getUnansweredQuestion(id);
      if (!question || !verifyBusinessOwnership(question, req)) {
        return res.status(404).json({ message: "Question not found" });
      }
      await storage.updateUnansweredQuestion(id, { status: 'dismissed' });
      res.json({ message: "Question dismissed" });
    } catch (error) {
      res.status(500).json({ message: "Error dismissing question" });
    }
  });

  // Delete an unanswered question
  app.delete("/api/unanswered-questions/:id", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid question ID" });
      }
      const question = await storage.getUnansweredQuestion(id);
      if (!question || !verifyBusinessOwnership(question, req)) {
        return res.status(404).json({ message: "Question not found" });
      }
      await storage.deleteUnansweredQuestion(id, question.businessId);
      res.json({ message: "Question deleted" });
    } catch (error) {
      res.status(500).json({ message: "Error deleting question" });
    }
  });

  // =================== AI SUGGESTIONS (Auto-Refine Pipeline) ===================

  // Get all suggestions for the current business
  app.get("/api/receptionist/suggestions", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const params: any = {};
      if (req.query.status) params.status = req.query.status as string;
      const suggestions = await storage.getAiSuggestions(businessId, params);
      res.json(suggestions);
    } catch (error) {
      res.status(500).json({ message: "Error fetching suggestions" });
    }
  });

  // Get pending + accepted suggestion counts (for badge + summary)
  app.get("/api/receptionist/suggestions/count", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const count = await storage.getAiSuggestionCount(businessId);
      const acceptedCount = await storage.getAiSuggestionsAcceptedCount(businessId);
      res.json({ count, acceptedCount });
    } catch (error) {
      res.status(500).json({ message: "Error fetching suggestion count" });
    }
  });

  // Accept a suggestion (applies change to config/knowledge + triggers Retell agent update)
  app.post("/api/receptionist/suggestions/:id/accept", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid suggestion ID" });
      }
      const suggestion = await storage.getAiSuggestion(id);
      if (!suggestion || !verifyBusinessOwnership(suggestion, req)) {
        return res.status(404).json({ message: "Suggestion not found" });
      }
      const { acceptSuggestion } = await import('./services/autoRefineService');
      const result = await acceptSuggestion(id);
      if (result.success) {
        res.json({ message: "Suggestion accepted and applied" });
      } else {
        res.status(400).json({ message: result.error });
      }
    } catch (error) {
      res.status(500).json({ message: "Error accepting suggestion" });
    }
  });

  // Dismiss a suggestion
  app.post("/api/receptionist/suggestions/:id/dismiss", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid suggestion ID" });
      }
      const suggestion = await storage.getAiSuggestion(id);
      if (!suggestion || !verifyBusinessOwnership(suggestion, req)) {
        return res.status(404).json({ message: "Suggestion not found" });
      }
      await storage.updateAiSuggestion(id, { status: 'dismissed' });
      res.json({ message: "Suggestion dismissed" });
    } catch (error) {
      res.status(500).json({ message: "Error dismissing suggestion" });
    }
  });

  // Edit then accept a suggestion (modified value applied)
  app.post("/api/receptionist/suggestions/:id/edit", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      if (isNaN(id)) {
        return res.status(400).json({ message: "Invalid suggestion ID" });
      }
      const { editedValue } = req.body;
      if (!editedValue) {
        return res.status(400).json({ message: "editedValue is required" });
      }
      const suggestion = await storage.getAiSuggestion(id);
      if (!suggestion || !verifyBusinessOwnership(suggestion, req)) {
        return res.status(404).json({ message: "Suggestion not found" });
      }
      const { acceptSuggestion } = await import('./services/autoRefineService');
      const result = await acceptSuggestion(id, editedValue);
      if (result.success) {
        res.json({ message: "Suggestion edited and applied" });
      } else {
        res.status(400).json({ message: result.error });
      }
    } catch (error) {
      res.status(500).json({ message: "Error editing suggestion" });
    }
  });

  // Manual trigger for auto-refine analysis (testing / on-demand)
  app.post("/api/receptionist/suggestions/trigger", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const { analyzeBusinessWeek } = await import('./services/autoRefineService');
      await analyzeBusinessWeek(businessId);
      res.json({ message: "Auto-refine analysis triggered" });
    } catch (error) {
      res.status(500).json({ message: "Error triggering auto-refine" });
    }
  });

  // =================== REMINDERS API ===================
  // Send appointment reminder manually
  app.post("/api/appointments/:id/send-reminder", isAuthenticated, notificationLimiter, async (req: Request, res: Response) => {
    try {
      const appointmentId = parseInt(req.params.id);
      if (isNaN(appointmentId)) {
        return res.status(400).json({ message: "Invalid appointment ID" });
      }
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
  app.post("/api/invoices/:id/send-reminder", isAuthenticated, notificationLimiter, async (req: Request, res: Response) => {
    try {
      const invoiceId = parseInt(req.params.id);
      if (isNaN(invoiceId)) {
        return res.status(400).json({ message: "Invalid invoice ID" });
      }
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
  app.post("/api/jobs/:id/send-followup", isAuthenticated, notificationLimiter, async (req: Request, res: Response) => {
    try {
      const jobId = parseInt(req.params.id);
      if (isNaN(jobId)) {
        return res.status(400).json({ message: "Invalid job ID" });
      }
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
          weatherAlertsEnabled: true,
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

  // Get notification log with customer names (scoped to business, customer-facing only)
  app.get("/api/notification-log", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const limit = parseInt(req.query.limit as string) || 50;
      const logs = await storage.getNotificationLogs(businessId, limit);

      // Filter to customer-facing messages only (exclude platform drip emails, trial warnings, etc.)
      const customerLogs = logs.filter(l => l.customerId);

      // Enrich with customer names (batch lookup)
      const customerIds = Array.from(new Set(customerLogs.map(l => l.customerId!)));
      const customerMap = new Map<number, { name: string; phone: string | null }>();
      if (customerIds.length > 0) {
        const customers = await storage.getCustomers(businessId);
        for (const c of customers) {
          const name = [c.firstName, c.lastName].filter(Boolean).join(' ').trim();
          customerMap.set(c.id, { name: name || 'Unknown', phone: c.phone || null });
        }
      }

      const enriched = customerLogs.map(log => ({
        ...log,
        customerName: log.customerId ? (customerMap.get(log.customerId)?.name || null) : null,
        customerPhone: log.customerId ? (customerMap.get(log.customerId)?.phone || null) : null,
      }));

      res.json(enriched);
    } catch (error) {
      console.error("Error fetching notification log:", error);
      res.status(500).json({ message: "Error fetching notification log" });
    }
  });

  // Get agent activity logs for the business (admin/owner only)
  app.get("/api/agent-activity", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const agentType = req.query.agentType as string | undefined;
      const limit = parseInt(req.query.limit as string) || 100;
      const logs = await storage.getAgentActivityLogs(businessId, { agentType, limit });
      res.json(logs);
    } catch (error) {
      console.error("Error fetching agent activity logs:", error);
      res.status(500).json({ message: "Error fetching agent activity logs" });
    }
  });

  // Get platform-wide agent insights (admin only — cross-business)
  app.get("/api/admin/agent-insights", isAdmin, async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 200;
      const agentType = req.query.agentType as string | undefined;

      // Query agent_activity_log directly for platform agents
      const conditions: any[] = [];
      if (agentType) {
        conditions.push(eq(agentActivityLog.agentType, agentType));
      } else {
        // Default: only platform agents
        conditions.push(sql`${agentActivityLog.agentType} LIKE 'platform:%'`);
      }

      const logs = await db.select().from(agentActivityLog)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(agentActivityLog.createdAt))
        .limit(limit);

      res.json(logs);
    } catch (error) {
      console.error("Error fetching agent insights:", error);
      res.status(500).json({ message: "Error fetching agent insights" });
    }
  });

  // Admin: Integration health status — shows which services are configured
  app.get("/api/admin/integration-health", isAdmin, async (req: Request, res: Response) => {
    try {
      const integrations = [
        {
          name: "Twilio (SMS/Voice)",
          key: "twilio",
          configured: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
          required: true,
          description: "SMS notifications, AI receptionist phone numbers",
        },
        {
          name: "Retell AI (Voice AI)",
          key: "retell",
          configured: !!(process.env.RETELL_API_KEY),
          required: true,
          description: "AI receptionist voice calls",
        },
        {
          name: "SendGrid (Email)",
          key: "sendgrid",
          configured: !!(process.env.SENDGRID_API_KEY),
          required: true,
          description: "Transactional emails, drip campaigns, invoice emails",
        },
        {
          name: "Stripe (Payments)",
          key: "stripe",
          configured: !!(process.env.STRIPE_SECRET_KEY && process.env.VITE_STRIPE_PUBLIC_KEY),
          required: true,
          description: "Subscription billing, invoice payments via Stripe Connect",
        },
        {
          name: "OpenAI",
          key: "openai",
          configured: !!(process.env.OPENAI_API_KEY),
          required: true,
          description: "Platform AI agents, content generation, SMS agent intelligence",
        },
        {
          name: "Google Calendar",
          key: "google_calendar",
          configured: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
          required: false,
          description: "Two-way calendar sync for appointments",
        },
        {
          name: "OpenWeatherMap",
          key: "weather",
          configured: !!(process.env.OPENWEATHER_API_KEY),
          required: false,
          description: "Weather alerts in appointment reminders for field service",
        },
        {
          name: "Shotstack (Video)",
          key: "shotstack",
          configured: !!(process.env.SHOTSTACK_API_KEY),
          required: false,
          description: "Social media video generation",
        },
        {
          name: "AWS S3 (Storage)",
          key: "s3",
          configured: !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY && (process.env.S3_MEDIA_BUCKET || process.env.AWS_S3_BUCKET)),
          required: false,
          description: "File uploads, document storage",
        },
        {
          name: "Sentry (Error Tracking)",
          key: "sentry",
          configured: !!(process.env.SENTRY_DSN),
          required: false,
          description: "Production error monitoring and alerts",
        },
      ];

      const summary = {
        total: integrations.length,
        configured: integrations.filter(i => i.configured).length,
        requiredMissing: integrations.filter(i => i.required && !i.configured).map(i => i.name),
      };

      res.json({ integrations, summary });
    } catch (error) {
      console.error("Error fetching integration health:", error);
      res.status(500).json({ message: "Error fetching integration health" });
    }
  });

  // Send a test notification (email or SMS)
  app.post("/api/notification-settings/test", isAuthenticated, notificationLimiter, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const { channel, recipient } = req.body; // channel: 'email' or 'sms'
      const business = await storage.getBusiness(businessId);
      if (!business) {
        return res.status(404).json({ message: "Business not found" });
      }

      if (channel === 'sms' && recipient) {
        const { sendSms } = await import("./services/twilioService");
        await sendSms(recipient, `Test notification from ${business.name}. Your SMS notifications are working!`, undefined, businessId);
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

  // Send a direct SMS to a customer (from CRM detail page)
  app.post("/api/customers/:id/send-sms", isAuthenticated, notificationLimiter, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      const customerId = parseInt(req.params.id);
      if (isNaN(customerId)) {
        return res.status(400).json({ message: "Invalid customer ID" });
      }

      const { message } = req.body;
      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        return res.status(400).json({ message: "Message is required" });
      }
      if (message.length > 1600) {
        return res.status(400).json({ message: "Message too long (max 1600 characters)" });
      }

      const customer = await storage.getCustomer(customerId);
      if (!customer || customer.businessId !== businessId) {
        return res.status(404).json({ message: "Customer not found" });
      }
      if (!customer.phone) {
        return res.status(400).json({ message: "Customer has no phone number" });
      }

      const { sendSms } = await import("./services/twilioService");
      await sendSms(customer.phone, message.trim(), undefined, businessId);

      res.json({ success: true, message: "SMS sent" });
    } catch (error) {
      console.error("Error sending SMS to customer:", error);
      res.status(500).json({ message: "Failed to send SMS" });
    }
  });

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

  // =================== RETELL AI ENDPOINTS ===================

  // ==================== Order History API ====================

  /**
   * GET /api/orders
   * Fetch AI order history (Clover + Square + Heartland) for a business
   * Query params: businessId (required), limit (optional, default 50)
   */
  app.get("/api/orders", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = parseInt(req.query.businessId as string, 10);
      const limit = parseInt(req.query.limit as string, 10) || 50;

      if (isNaN(businessId)) {
        return res.status(400).json({ error: "Invalid business ID" });
      }

      if (!checkIsAdmin(req) && !checkBelongsToBusiness(req, businessId)) {
        return res.status(403).json({ message: "Not authorized" });
      }

      // Fetch from all POS order logs
      const [cloverOrders, squareOrders, heartlandOrders] = await Promise.all([
        storage.getCloverOrderLogs(businessId, limit),
        storage.getSquareOrderLogs(businessId, limit),
        storage.getHeartlandOrderLogs(businessId, limit),
      ]);

      // Normalize into a unified format
      const orders = [
        ...cloverOrders.map(o => ({
          id: o.id,
          posType: 'clover' as const,
          posOrderId: o.cloverOrderId,
          callerPhone: o.callerPhone,
          callerName: o.callerName,
          items: o.items,
          totalAmount: o.totalAmount,
          status: o.status,
          orderType: o.orderType,
          errorMessage: o.errorMessage,
          createdAt: o.createdAt,
        })),
        ...squareOrders.map(o => ({
          id: o.id,
          posType: 'square' as const,
          posOrderId: o.squareOrderId,
          callerPhone: o.callerPhone,
          callerName: o.callerName,
          items: o.items,
          totalAmount: o.totalAmount,
          status: o.status,
          orderType: o.orderType,
          errorMessage: o.errorMessage,
          createdAt: o.createdAt,
        })),
        ...heartlandOrders.map(o => ({
          id: o.id,
          posType: 'heartland' as const,
          posOrderId: o.heartlandOrderId,
          callerPhone: o.callerPhone,
          callerName: o.callerName,
          items: o.items,
          totalAmount: o.totalAmount,
          status: o.status,
          orderType: o.orderType,
          errorMessage: o.errorMessage,
          createdAt: o.createdAt,
        })),
      ].sort((a, b) => {
        const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      }).slice(0, limit);

      // Calculate stats
      const successfulOrders = orders.filter(o => o.status === 'created');
      const totalRevenue = successfulOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const todayOrders = successfulOrders.filter(o =>
        o.createdAt && new Date(o.createdAt) >= today
      );
      const todayRevenue = todayOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);

      res.json({
        orders,
        stats: {
          totalOrders: successfulOrders.length,
          failedOrders: orders.length - successfulOrders.length,
          totalRevenue,
          todayOrders: todayOrders.length,
          todayRevenue,
        },
      });
    } catch (error) {
      console.error("Error fetching order history:", error);
      res.status(500).json({ error: "Failed to fetch order history" });
    }
  });

  // Retell AI webhook endpoints (all voice AI calls handled here)
  app.post('/api/retell/webhook', validateRetellWebhook, handleRetellWebhook);
  app.post('/api/retell/function', validateRetellWebhook, handleRetellFunction);
  app.post('/api/retell/inbound', handleInboundWebhook);  // Pre-fetch caller data before call starts

  // Check what's missing for AI receptionist to work properly
  app.get("/api/retell/setup-status/:businessId", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = parseInt(req.params.businessId);
      if (isNaN(businessId)) {
        return res.status(400).json({ message: "Invalid business ID" });
      }

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

      if (!business.retellAgentId) {
        missing.push('Retell AI agent not provisioned');
      } else {
        configured.push('Retell AI agent active');
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
          retellAgentId: business.retellAgentId
        },
        setupInstructions: missing.length > 0 ? [
          'Go to Settings > Business Hours to configure your schedule',
          'Go to Settings > Services to add your service offerings with prices',
          'The AI will use this information to help customers book appointments'
        ] : null
      });
    } catch (error) {
      console.error('Error checking receptionist status:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Diagnostic endpoint to check business data for AI receptionist
  app.get("/api/retell/diagnostic/:businessId", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = parseInt(req.params.businessId);
      if (isNaN(businessId)) {
        return res.status(400).json({ message: "Invalid business ID" });
      }

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
          retellAgentId: business.retellAgentId,
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
          hasRetellAgent: !!business.retellAgentId,
          hasReceptionistConfig: !!receptionistConfig,
          issues: [
            ...(hours.length === 0 ? ['No business hours configured - availability will use defaults (Mon-Fri 9-5)'] : []),
            ...(services.length === 0 ? ['No services configured - AI will offer general appointments only'] : []),
            ...(!business.retellAgentId ? ['No Retell agent configured - run provisioning'] : []),
            ...(!receptionistConfig ? ['No receptionist config - run provisioning'] : [])
          ]
        }
      });
    } catch (error) {
      console.error('Error in Retell diagnostic:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Force refresh Retell agent (for debugging - updates webhook URL and system prompt)
  app.post("/api/retell/refresh/:businessId", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = parseInt(req.params.businessId);
      if (isNaN(businessId)) {
        return res.status(400).json({ message: "Invalid business ID" });
      }

      // Authorization: user must be admin or belong to this business
      if (!checkIsAdmin(req) && !checkBelongsToBusiness(req, businessId)) {
        return res.status(403).json({ message: "Not authorized to refresh this business's agent" });
      }

      console.log(`Force refreshing Retell agent for business ${businessId}`);

      const business = await storage.getBusiness(businessId);
      if (!business) {
        return res.status(404).json({ error: 'Business not found' });
      }

      // If no agent exists, CREATE one (+ connect phone if available)
      if (!business.retellAgentId) {
        console.log(`[RetellRefresh] Business ${businessId} has no agent — creating new one via full provisioning`);
        const provisionResult = await retellProvisioningService.provisionRetellForBusiness(businessId);
        if (!provisionResult.success) {
          console.error('[RetellRefresh] Failed to create Retell agent:', provisionResult.error);
          return res.status(500).json({ error: provisionResult.error || 'Failed to create agent' });
        }
        // Re-enable receptionist
        await storage.updateBusiness(businessId, { receptionistEnabled: true } as any);
        console.log(`[RetellRefresh] Created new agent ${provisionResult.agentId} for business ${businessId}`);
        return res.json({
          success: true,
          agentId: provisionResult.agentId,
          phoneConnected: provisionResult.phoneConnected,
          message: 'New agent created and connected successfully',
          webhookUrl: `${process.env.APP_URL || process.env.BASE_URL}/api/retell/webhook`
        });
      }

      // Agent exists — update it
      const updateResult = await retellProvisioningService.updateRetellAgent(businessId);

      if (!updateResult.success) {
        console.error('Failed to update Retell agent:', updateResult.error);
        return res.status(500).json({ error: updateResult.error });
      }

      console.log('Retell agent updated successfully');

      // Ensure phone is connected to Retell (may have been skipped on initial creation)
      let phoneConnected = !!business.retellPhoneNumberId;
      if (!phoneConnected && business.twilioPhoneNumber) {
        console.log(`[RetellRefresh] Phone not connected — setting up SIP trunk + Retell import for business ${businessId}`);
        try {
          const phoneResult = await retellProvisioningService.connectPhoneToRetell(businessId, business.retellAgentId);
          phoneConnected = phoneResult.success;
          if (phoneResult.success) {
            console.log(`[RetellRefresh] Phone connected successfully for business ${businessId}`);
          } else {
            console.error(`[RetellRefresh] Phone connection failed:`, phoneResult.error);
          }
        } catch (phoneErr) {
          console.error(`[RetellRefresh] Phone connection error:`, phoneErr);
        }
      }

      res.json({
        success: true,
        agentId: business.retellAgentId,
        phoneConnected,
        message: 'Agent refreshed successfully',
        webhookUrl: `${process.env.APP_URL || process.env.BASE_URL}/api/retell/webhook`
      });
    } catch (error) {
      console.error('Error refreshing Retell agent:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Create or update Retell agent for a business
  app.post("/api/retell/assistant", isAuthenticated, async (req: Request, res: Response) => {
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
      const rcConfig = await storage.getReceptionistConfig(businessId);

      // Check if business already has a Retell agent
      if (business.retellAgentId) {
        // Update existing agent
        const result = await retellProvisioningService.updateRetellAgent(businessId);

        if (!result.success) {
          return res.status(500).json({ error: result.error });
        }

        res.json({
          success: true,
          agentId: business.retellAgentId,
          message: 'Agent updated successfully'
        });
      } else {
        // Create new agent
        const result = await retellProvisioningService.provisionRetellForBusiness(businessId);

        if (!result.success) {
          return res.status(500).json({ error: result.error });
        }

        res.json({
          success: true,
          agentId: result.agentId,
          message: 'Agent created successfully'
        });
      }
    } catch (error) {
      console.error('Error creating/updating Retell agent:', error);
      res.status(500).json({ error: 'Failed to create/update agent' });
    }
  });

  // Connect Twilio phone number to Retell
  app.post("/api/retell/connect-phone", isAuthenticated, async (req: Request, res: Response) => {
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

      if (!business.retellAgentId) {
        return res.status(400).json({ error: 'Business does not have a Retell agent. Create one first.' });
      }

      // Connect the phone number to Retell via provisioning service
      const result = await retellProvisioningService.connectPhoneToRetell(businessId, business.retellAgentId);

      if (!result.success) {
        return res.status(500).json({ error: result.error });
      }

      res.json({
        success: true,
        phoneNumberId: result.phoneNumberId,
        message: 'Phone number connected to Retell successfully'
      });
    } catch (error) {
      console.error('Error connecting phone to Retell:', error);
      res.status(500).json({ error: 'Failed to connect phone number' });
    }
  });

  // Get Retell agent status for a business
  app.get("/api/retell/status/:businessId", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = parseInt(req.params.businessId);
      if (isNaN(businessId)) {
        return res.status(400).json({ error: "Invalid business ID" });
      }

      if (!checkIsAdmin(req) && !checkBelongsToBusiness(req, businessId)) {
        return res.status(403).json({ error: 'Not authorized' });
      }

      const business = await storage.getBusiness(businessId);
      if (!business) {
        return res.status(404).json({ error: 'Business not found' });
      }

      // Retell agent info — get from Retell API if agent exists
      let agentInfo = null;
      if (business.retellAgentId) {
        try {
          const retellService = (await import('./services/retellService')).default;
          agentInfo = await retellService.getAgent(business.retellAgentId);
        } catch (e) {
          console.warn('Could not fetch Retell agent info:', e);
        }
      }

      res.json({
        hasAgent: !!business.retellAgentId,
        agentId: business.retellAgentId,
        hasPhoneConnected: !!business.retellPhoneNumberId,
        phoneNumberId: business.retellPhoneNumberId,
        phoneNumber: business.twilioPhoneNumber,
        receptionistEnabled: business.receptionistEnabled !== false, // Default to true if not set
        agentInfo: agentInfo || null
      });
    } catch (error) {
      console.error('Error getting Retell status:', error);
      res.status(500).json({ error: 'Failed to get status' });
    }
  });

  // =================== RECEPTIONIST ENABLE/DISABLE ===================

  // Toggle receptionist enabled status (soft disable - doesn't release resources)
  app.post("/api/business/:id/receptionist/toggle", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = parseInt(req.params.id);
      if (isNaN(businessId)) {
        return res.status(400).json({ message: "Invalid business ID" });
      }
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

  // Fully deprovision receptionist (releases Twilio number and deletes Retell agent)
  app.post("/api/business/:id/receptionist/deprovision", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = parseInt(req.params.id);
      if (isNaN(businessId)) {
        return res.status(400).json({ message: "Invalid business ID" });
      }

      if (!checkIsAdmin(req) && !checkBelongsToBusiness(req, businessId)) {
        return res.status(403).json({ error: 'Not authorized' });
      }

      const business = await storage.getBusiness(businessId);
      if (!business) {
        return res.status(404).json({ error: 'Business not found' });
      }

      // Check if there's anything to deprovision
      if (!business.retellAgentId && !business.twilioPhoneNumberSid && !business.twilioPhoneNumber) {
        return res.json({
          success: true,
          message: 'No receptionist resources to deprovision'
        });
      }

      // Call the deprovision service
      const result = await businessProvisioningService.deprovisionBusiness(businessId);

      // Disable the receptionist and clear all phone/agent fields so UI shows empty state
      await storage.updateBusiness(businessId, {
        receptionistEnabled: false,
        twilioPhoneNumber: null,
        twilioPhoneNumberSid: null,
        twilioPhoneNumberStatus: null,
      });
      // Clear Retell fields via raw SQL
      await db.execute(
        sql`UPDATE businesses SET retell_agent_id = NULL, retell_llm_id = NULL, retell_phone_number_id = NULL WHERE id = ${businessId}`
      ).catch(logAndSwallow('Routes'));

      res.json({
        success: result.success,
        message: 'AI Receptionist deprovisioned successfully',
        details: {
          twilioReleased: result.twilioDeprovisioned,
          retellRemoved: result.retellDeprovisioned
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
      if (isNaN(businessId)) {
        return res.status(400).json({ message: "Invalid business ID" });
      }

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

  // Re-provision receptionist (provisions new Twilio number and creates Retell agent)
  app.post("/api/business/:id/receptionist/provision", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = parseInt(req.params.id);
      if (isNaN(businessId)) {
        return res.status(400).json({ message: "Invalid business ID" });
      }
      const { areaCode, phoneNumber } = req.body;

      if (!checkIsAdmin(req) && !checkBelongsToBusiness(req, businessId)) {
        return res.status(403).json({ error: 'Not authorized' });
      }

      const business = await storage.getBusiness(businessId);
      if (!business) {
        return res.status(404).json({ error: 'Business not found' });
      }

      // Check if already provisioned
      if (business.retellAgentId && business.twilioPhoneNumberSid) {
        return res.status(400).json({
          error: 'Receptionist is already provisioned. Deprovision first to reprovision.'
        });
      }

      // Call the provisioning service with options
      const result = await businessProvisioningService.provisionBusiness(businessId, {
        preferredAreaCode: areaCode,
        specificPhoneNumber: phoneNumber
      });

      // Enable the receptionist and protect from scheduler
      const statusUpdate: any = { receptionistEnabled: true };
      const currentStatus = (business as any).subscriptionStatus;
      if (currentStatus === 'expired' || currentStatus === 'grace_period' || currentStatus === 'trialing') {
        // Set to 'active' so the trial scheduler won't touch this business
        // Admin/owner manually provisioning = business should be protected
        statusUpdate.subscriptionStatus = 'active';
      }
      await storage.updateBusiness(businessId, statusUpdate);

      res.json({
        success: result.success,
        message: 'AI Receptionist provisioned successfully',
        phoneNumber: result.twilioPhoneNumber,
        agentId: result.retellAgentId
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

  // Provision a specific phone number for a business (FULL: Twilio + Retell + connection)
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

      // Check if Twilio is configured
      if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
        return res.status(503).json({
          error: "Twilio is not configured. Please set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN"
        });
      }

      // Use the FULL provisioning service (Twilio + Retell + phone connection)
      // This ensures the assistant is created AND the phone is connected to it
      const result = await businessProvisioningService.provisionBusiness(businessId, {
        specificPhoneNumber: phoneNumber
      });

      // Protect from scheduler: set status to 'active' and extend trial
      // Admin manually provisioning = business should NOT be auto-deprovisioned
      const statusUpdate: any = {
        receptionistEnabled: true,
        subscriptionStatus: 'active',  // Active businesses skip the trial scheduler entirely
      };
      await storage.updateBusiness(businessId, statusUpdate);
      console.log(`[AdminProvision] Business ${businessId} set to 'active' status (admin-provisioned, protected from scheduler)`);

      res.json({
        success: result.success,
        business: businessId,
        phoneNumber: result.twilioPhoneNumber,
        agentId: result.retellAgentId,
        retellConnected: result.retellPhoneConnected,
        message: result.success
          ? "Phone number + AI agent provisioned successfully"
          : "Provisioning partially completed — check logs"
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
      if (isNaN(businessId)) {
        return res.status(400).json({ error: "Invalid business ID" });
      }

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
