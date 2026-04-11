import { Router, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { storage } from "../storage";
import { db } from "../db";
import { agentActivityLog } from "@shared/schema";
import { eq, and, desc, sql } from "drizzle-orm";
import { isAuthenticated, isAdmin } from "../auth";
import reminderService from "../services/reminderService";
import notificationService from "../services/notificationService";

const router = Router();

// Helper to get businessId from authenticated request
const getBusinessId = (req: Request): number => {
  if (req.isAuthenticated() && req.user?.businessId) {
    return req.user.businessId;
  }
  if ((req as any).apiKeyBusinessId) {
    return (req as any).apiKeyBusinessId;
  }
  return 0;
};

// Helper to verify resource belongs to user's business
const verifyBusinessOwnership = (resource: any, req: Request): boolean => {
  if (!resource) return false;
  const userBusinessId = getBusinessId(req);
  return resource.businessId === userBusinessId;
};

// Rate limiter for notification/SMS-sending endpoints (prevent abuse)
const notificationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // 10 notifications per hour per user
  message: { message: 'Too many notification requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// =================== REMINDERS API ===================
// Send appointment reminder manually
router.post("/appointments/:id/send-reminder", isAuthenticated, notificationLimiter, async (req: Request, res: Response) => {
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
router.post("/invoices/:id/send-reminder", isAuthenticated, notificationLimiter, async (req: Request, res: Response) => {
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
router.post("/jobs/:id/send-followup", isAuthenticated, notificationLimiter, async (req: Request, res: Response) => {
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
router.post("/reminders/run-check", isAuthenticated, async (req: Request, res: Response) => {
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
router.get("/notification-settings", isAuthenticated, async (req: Request, res: Response) => {
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
router.put("/notification-settings", isAuthenticated, async (req: Request, res: Response) => {
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
router.get("/notification-log", isAuthenticated, async (req: Request, res: Response) => {
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
router.get("/agent-activity", isAuthenticated, async (req: Request, res: Response) => {
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
router.get("/admin/agent-insights", isAdmin, async (req: Request, res: Response) => {
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
router.get("/admin/integration-health", isAdmin, async (req: Request, res: Response) => {
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
router.post("/notification-settings/test", isAuthenticated, notificationLimiter, async (req: Request, res: Response) => {
  try {
    const businessId = getBusinessId(req);
    const { channel, recipient } = req.body; // channel: 'email' or 'sms'
    const business = await storage.getBusiness(businessId);
    if (!business) {
      return res.status(404).json({ message: "Business not found" });
    }

    if (channel === 'sms' && recipient) {
      const { sendSms } = await import("../services/twilioService");
      await sendSms(recipient, `Test notification from ${business.name}. Your SMS notifications are working!`, undefined, businessId);
      return res.json({ success: true, message: "Test SMS sent" });
    }

    if (channel === 'email' && recipient) {
      const { sendEmail } = await import("../emailService");
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
router.post("/customers/:id/send-sms", isAuthenticated, notificationLimiter, async (req: Request, res: Response) => {
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

    const { sendSms } = await import("../services/twilioService");
    await sendSms(customer.phone, message.trim(), undefined, businessId);

    res.json({ success: true, message: "SMS sent" });
  } catch (error) {
    console.error("Error sending SMS to customer:", error);
    res.status(500).json({ message: "Failed to send SMS" });
  }
});

export default router;
