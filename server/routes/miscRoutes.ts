import { Router, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { db } from "../db";
import { storage } from "../storage";
import { isAuthenticated } from "../auth";
import { sendEmail } from "../emailService";
import { sql } from "drizzle-orm";

const router = Router();

// ── Public Frontend Config (no auth required) ──
// Returns safe-to-share runtime config the frontend may need but couldn't get
// at build time. Currently used as a fallback for VITE_* vars when Railway
// doesn't expose them to the build phase. Only includes values that are
// PUBLIC by design (e.g. Google Maps API keys are restricted by HTTP referrer
// on Google's end, so leaking them client-side is expected and safe).
router.get("/config/public", (_req: Request, res: Response) => {
  res.json({
    googlePlacesApiKey:
      process.env.VITE_GOOGLE_PLACES_API_KEY ||
      process.env.GOOGLE_PLACES_API_KEY ||
      null,
  });
});

// ── Public Health Check (no auth required) ──
router.get("/health", async (_req: Request, res: Response) => {
  try {
    const { runAllHealthChecks } = await import("../services/healthCheckService.js");
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
router.post("/push/register", isAuthenticated, async (req: Request, res: Response) => {
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

// Public config endpoint (no auth required - exposes only public keys)
router.get("/config/public", (_req: Request, res: Response) => {
  res.json({
    turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || process.env.VITE_TURNSTILE_SITE_KEY || "",
    stripePublicKey: process.env.VITE_STRIPE_PUBLIC_KEY || "",
  });
});

// Public contact form endpoint (no auth required)
const contactLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, message: { message: "Too many contact requests. Please try again later." } });
router.post("/contact", contactLimiter, async (req: Request, res: Response) => {
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

// ── Usage Projection ──
router.get("/usage/projection", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const businessId = (req.user as any)?.businessId;
    if (!businessId) return res.status(400).json({ error: "No business associated" });
    const { getUsageProjection } = await import("../services/usageService.js");
    const projection = await getUsageProjection(businessId);
    res.json(projection);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

// SMS Activity Feed for business owners
router.get('/sms-activity-feed', isAuthenticated, async (req: Request, res: Response) => {
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

router.post('/sms-activity-feed/mark-read', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const businessId = req.user!.businessId;
    if (!businessId) return res.status(400).json({ error: 'No business' });
    await storage.markSmsActivityFeedRead(businessId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark feed as read' });
  }
});

export default router;
