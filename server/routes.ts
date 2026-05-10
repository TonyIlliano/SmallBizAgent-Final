import type { Express, Request, Response } from "express";
import express from "express";
import { createServer, type Server } from "http";
import { pool } from "./db";

// Setup authentication
import {
  setupAuth,
  isAuthenticated,
  checkIsAdmin,
  checkBelongsToBusiness,
} from "./auth";

// Import handlers
import {
  importCustomers,
  importServices,
  importAppointments
} from "./routes/import";

// Stripe Connect
import stripeConnectRoutes from "./routes/stripeConnectRoutes";

// Route file imports (default exports)
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
import leadDiscoveryRoutes from './routes/leadDiscoveryRoutes';
import reviewRoutes from './routes/reviewRoutes';
import dashboardRoutes from './routes/dashboardRoutes';
import reservationRoutes from './routes/reservationRoutes';
import emailRoutes from './routes/emailRoutes';
import searchRoutes from './routes/searchRoutes';
import paymentRoutes from './routes/paymentRoutes';
import miscRoutes from './routes/miscRoutes';

// Route file imports (named exports — register-style)
import { registerAnalyticsRoutes } from './routes/analyticsRoutes';
import { registerWebhookRoutes } from './routes/webhookRoutes';
import { registerMarketingRoutes } from './routes/marketingRoutes';
import { registerZapierRoutes } from './routes/zapierRoutes';
import { registerInventoryRoutes } from './routes/inventoryRoutes';
import { registerAutomationRoutes } from './routes/automationRoutes';
import { registerExpressSetupRoutes } from './routes/expressSetupRoutes';
import { registerWebsiteBuilderRoutes } from './routes/websiteBuilderRoutes';

export async function registerRoutes(app: Express): Promise<Server> {
  // Set up authentication first
  setupAuth(app);

  // ── Misc routes (health check, push registration, config, contact, usage, SMS feed) ──
  app.use('/api', miscRoutes);

  // ── SEO: Dynamic sitemap.xml (root-level, not under /api) ──
  app.get('/sitemap.xml', async (_req: Request, res: Response) => {
    try {
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

  // ── Register-style routes (these use app.get/post directly) ──
  registerAnalyticsRoutes(app);
  registerWebhookRoutes(app);
  registerMarketingRoutes(app);
  registerZapierRoutes(app);
  registerInventoryRoutes(app);
  registerAutomationRoutes(app);
  registerExpressSetupRoutes(app);
  registerWebsiteBuilderRoutes(app);

  // ── Admin dashboard routes ──
  app.use(adminRoutes);

  // ── Stripe Connect routes ──
  app.use("/api/stripe-connect", isAuthenticated, stripeConnectRoutes);

  // ── Data import routes (with business ownership verification) ──
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

  // ── Data export routes ──
  // IMPORTANT: Do NOT use app.use("/api", isAuthenticated, router) — that applies
  // isAuthenticated to ALL /api/* requests, blocking webhooks and public endpoints.
  // Export routes already check auth internally via req.user?.businessId.
  app.use("/api", exportRoutes);

  // ── Business API + Business Hours API ──
  app.use('/api', businessRoutes);

  // ── Batched Dashboard API ──
  app.use('/api', dashboardRoutes);

  // ── Services API ──
  app.use('/api', servicesRoutes);

  // ── Customers API (includes CRUD, enriched, timeline, activity, tags, archive/restore, import) ──
  app.use('/api', customerRoutes);

  // ── Staff API ──
  app.use('/api', staffRoutes);

  // ── Appointments API ──
  app.use('/api', appointmentRoutes);

  // ── Restaurant Reservations API ──
  app.use('/api', reservationRoutes);

  // ── Jobs API ──
  app.use('/api/jobs', jobRoutes);

  // ── Review Requests ──
  app.use('/api', reviewRoutes);

  // ── Receptionist Config + Voice Preview + Test Call + AI Suggestions ──
  app.use('/api', receptionistConfigRoutes);

  // ── Call Logs + Intelligence + Insights ──
  app.use('/api', callLogRoutes);

  // ── Lead Discovery (admin-only Google Places scanner + self-refining rubric) ──
  app.use('/api', leadDiscoveryRoutes);

  // ── Knowledge Base + Unanswered Questions ──
  app.use('/api', knowledgeRoutes);

  // ── Notifications + Reminders + Agent Activity ──
  app.use('/api', notificationRoutes);

  // ── Email Unsubscribe (CAN-SPAM) ──
  app.use('/api', emailRoutes);

  // ── Payment API (Stripe Connect + Webhooks) ──
  app.use('/api', paymentRoutes);

  // ── Twilio Webhook Endpoints ──
  app.use(twilioWebhookRoutes);

  // ── Retell AI + Orders + Phone Management ──
  app.use('/api', retellRoutes);

  // ── Global Search API ──
  app.use('/api', searchRoutes);

  // ── Calendar Integration ──
  app.use('/api/calendar', calendarRoutes);

  // ── Google Business Profile ──
  app.use('/api/gbp', gbpRoutes);

  // ── Support Chat (AI-powered in-app help) ──
  const supportChatRoutes = (await import('./routes/supportChatRoutes')).default;
  app.use('/api/support', supportChatRoutes);

  // ── Social Media (OAuth + post management) ──
  app.use('/api/social-media', socialMediaRoutes);

  // ── QuickBooks Integration ──
  app.use('/api/quickbooks', quickbooksRoutes);

  // ── Subscription Management ──
  app.use('/api/subscription', subscriptionRoutes);

  // ── Quotes API ──
  app.use('/api', quoteRoutes);

  // ── Invoices API ──
  app.use('/api', invoiceRoutes);

  // ── Recurring Schedules ──
  app.use('/api/recurring-schedules', recurringRoutes);

  // ── POS Integrations (Clover, Square, Heartland) ──
  app.use('/api/clover', cloverRoutes);
  app.use('/api/square', squareRoutes);
  app.use('/api/heartland', heartlandRoutes);

  // ── Phone Number Management (multi-line) ──
  app.use('/api', phoneRoutes);

  // ── Multi-location Routes ──
  app.use('/api', locationRoutes);

  // ── SMS Intelligence Layer ──
  const smsProfileRoutes = (await import('./routes/smsProfileRoutes')).default;
  app.use('/api/sms-profile', isAuthenticated, smsProfileRoutes);

  const smsCampaignRoutes = (await import('./routes/smsCampaignRoutes')).default;
  app.use('/api/sms-campaigns', isAuthenticated, smsCampaignRoutes);

  // ── Workflow Builder ──
  const workflowRoutes = (await import('./routes/workflowRoutes')).default;
  app.use('/api/workflows', isAuthenticated, workflowRoutes);

  // ── Public Booking Routes (no auth required for customer-facing pages) ──
  app.use('/api', bookingRoutes);

  // ── Embed Widget Routes (public, serves JS for external websites) ──
  app.use('/api', embedRoutes);

  // ── Serve calendar files from public directory ──
  app.use('/calendar', express.static('public/calendar'));

  const httpServer = createServer(app);
  return httpServer;
}
