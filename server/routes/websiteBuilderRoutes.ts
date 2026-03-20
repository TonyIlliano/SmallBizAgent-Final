/**
 * Website Builder Routes
 *
 * Endpoints for:
 * - Domain management (subdomain, custom, purchase stub)
 * - Website CRUD + serving
 * - Feature gate checks (plan-based)
 * - OpenAI website generation
 */

import type { Express, Request, Response } from "express";
import { isAuthenticated } from "../middleware/auth";
import { storage } from "../storage";
import { z } from "zod";
import { generateWebsite, type WebsiteCustomizations } from "../services/websiteGenerationService";
import { getUsageInfo } from "../services/usageService";
import dns from "dns/promises";

const customDomainSchema = z.object({
  domain: z.string().min(3, "Domain required").max(253),
});

const saveHtmlSchema = z.object({
  html_content: z.string().min(1, "HTML content required"),
});

const customizationsSchema = z.object({
  accent_color: z.string().optional(),
  font_style: z.enum(['classic', 'modern', 'bold']).optional(),
  hero_headline: z.string().optional(),
  hero_subheadline: z.string().optional(),
  cta_primary_text: z.string().optional(),
  cta_secondary_text: z.string().optional(),
  about_text: z.string().optional(),
  footer_message: z.string().optional(),
  show_staff: z.boolean().optional(),
  show_reviews: z.boolean().optional(),
  show_hours: z.boolean().optional(),
}).optional();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Plan-based feature flags for the website builder.
 */
function getWebsiteFeatures(planTier: string | null): {
  websiteEnabled: boolean;
  customDomainEnabled: boolean;
  websiteManagedSetup: boolean;
} {
  switch (planTier) {
    case 'founder':
      return { websiteEnabled: true, customDomainEnabled: true, websiteManagedSetup: true };
    case 'professional':
      return { websiteEnabled: true, customDomainEnabled: true, websiteManagedSetup: false };
    case 'business': // legacy alias for Elite / $249
    case 'enterprise':
      return { websiteEnabled: true, customDomainEnabled: true, websiteManagedSetup: true };
    case 'starter':
      return { websiteEnabled: true, customDomainEnabled: false, websiteManagedSetup: false };
    case 'trial':
      return { websiteEnabled: true, customDomainEnabled: false, websiteManagedSetup: false };
    default:
      return { websiteEnabled: false, customDomainEnabled: false, websiteManagedSetup: false };
  }
}

// ─── Route Registration ──────────────────────────────────────────────────────

export function registerWebsiteBuilderRoutes(app: Express): void {

  // ── Helper: get businessId from authenticated request ──
  const getBusinessId = (req: Request): number => {
    if (req.isAuthenticated() && req.user?.businessId) return req.user.businessId;
    if ((req as any).apiKeyBusinessId) return (req as any).apiKeyBusinessId;
    return 0;
  };

  // ─────────────────────────────────────────────────────────
  // Website Generation (OpenAI)
  // ─────────────────────────────────────────────────────────

  /**
   * POST /api/website-builder/generate
   * Input: { business_id } (optional — defaults to authenticated user's business)
   * Pulls all data from DB, generates website via OpenAI.
   * Output: { html, generated_at }
   */
  app.post("/api/website-builder/generate", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      if (businessId === 0) return res.status(400).json({ error: "No business associated" });

      // Check feature gate
      const usage = await getUsageInfo(businessId);
      const features = getWebsiteFeatures(usage.planTier);
      if (!features.websiteEnabled) {
        return res.status(403).json({ error: "Website Builder is not available on your current plan" });
      }

      // Get customizations from body or from saved website record
      let customizations: WebsiteCustomizations | undefined;
      if (req.body.customizations) {
        const parsed = customizationsSchema.safeParse(req.body.customizations);
        if (parsed.success && parsed.data) {
          customizations = parsed.data;
        }
      } else {
        const website = await storage.getWebsite(businessId);
        customizations = (website?.customizations as WebsiteCustomizations) || undefined;
      }

      // Generate website
      const result = await generateWebsite(businessId, customizations);

      // Save generated HTML + customizations + timestamp
      const websiteData: any = {
        htmlContent: result.html,
        generatedAt: result.generatedAt,
      };
      if (req.body.customizations) {
        websiteData.customizations = req.body.customizations;
      }

      const updatedWebsite = await storage.upsertWebsite(businessId, websiteData);

      res.json({
        html: result.html,
        generated_at: result.generatedAt,
        preview_url: updatedWebsite.subdomain ? `/sites/${updatedWebsite.subdomain}` : null,
      });
    } catch (error: any) {
      console.error("[WebsiteBuilder] Generation error:", error);
      res.status(500).json({ error: error.message || "Website generation failed" });
    }
  });

  /**
   * PUT /api/website-builder/customizations
   * Save customization preferences without regenerating.
   */
  app.put("/api/website-builder/customizations", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      if (businessId === 0) return res.status(400).json({ error: "No business associated" });

      const parsed = customizationsSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: "Invalid customizations" });

      await storage.upsertWebsite(businessId, {
        customizations: parsed.data as any,
      });

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ─────────────────────────────────────────────────────────
  // Part 2: Domain Management
  // ─────────────────────────────────────────────────────────

  /**
   * GET /api/website-builder/domain
   * Returns current domain info + feature gates for the UI.
   */
  app.get("/api/website-builder/domain", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      if (businessId === 0) return res.status(400).json({ error: "No business associated" });

      const usage = await getUsageInfo(businessId);
      const features = getWebsiteFeatures(usage.planTier);
      const website = await storage.getWebsite(businessId);

      // Auto-generate subdomain if not yet set
      let subdomain = website?.subdomain;
      if (!subdomain) {
        const business = await storage.getBusiness(businessId);
        if (business) {
          subdomain = slugify(business.name);
          // Collision check
          let candidate = subdomain;
          let suffix = 2;
          while (await storage.getWebsiteBySubdomain(candidate)) {
            candidate = `${subdomain}-${suffix}`;
            suffix++;
          }
          subdomain = candidate;
          await storage.upsertWebsite(businessId, { subdomain, domainTier: 'subdomain' });
        }
      }

      res.json({
        subdomain,
        customDomain: website?.customDomain || null,
        domainVerified: website?.domainVerified || false,
        domainTier: website?.domainTier || 'subdomain',
        websiteSetupRequested: website?.websiteSetupRequested || false,
        hasHtml: !!website?.htmlContent,
        generatedAt: website?.generatedAt || null,
        customizations: website?.customizations || null,
        features,
        planTier: usage.planTier,
      });
    } catch (error: any) {
      console.error("[WebsiteBuilder] Domain info error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/website-builder/set-custom-domain
   * Input: { domain: "cantonbarb.com" }
   * Returns CNAME instructions.
   */
  app.post("/api/website-builder/set-custom-domain", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      if (businessId === 0) return res.status(400).json({ error: "No business associated" });

      // Feature gate
      const usage = await getUsageInfo(businessId);
      const features = getWebsiteFeatures(usage.planTier);
      if (!features.customDomainEnabled) {
        return res.status(403).json({ error: "Custom domains require the Professional plan or higher" });
      }

      const parsed = customDomainSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

      const domain = parsed.data.domain.toLowerCase().trim();
      const website = await storage.getWebsite(businessId);
      const subdomain = website?.subdomain;

      await storage.upsertWebsite(businessId, {
        customDomain: domain,
        domainTier: 'custom',
        domainVerified: false,
      });

      res.json({
        domain,
        cname_instructions: {
          type: 'CNAME',
          name: 'www (or @)',
          value: `${subdomain}.smallbizagent.ai`,
        },
        message: `Add a CNAME record pointing to ${subdomain}.smallbizagent.ai, then verify.`,
      });
    } catch (error: any) {
      console.error("[WebsiteBuilder] Set custom domain error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/website-builder/verify-domain
   * Performs DNS CNAME lookup on the stored custom_domain.
   */
  app.post("/api/website-builder/verify-domain", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      if (businessId === 0) return res.status(400).json({ error: "No business associated" });

      const website = await storage.getWebsite(businessId);
      if (!website?.customDomain) {
        return res.status(400).json({ verified: false, message: "No custom domain configured" });
      }

      const subdomain = website.subdomain;
      const expectedTarget = `${subdomain}.smallbizagent.ai`;

      try {
        const records = await dns.resolveCname(website.customDomain);
        const matched = records.some(r => r.toLowerCase().includes('smallbizagent.ai'));

        if (matched) {
          await storage.upsertWebsite(businessId, { domainVerified: true });
          return res.json({ verified: true, message: "Domain verified successfully" });
        } else {
          return res.json({
            verified: false,
            message: `CNAME found but does not point to ${expectedTarget}. Found: ${records.join(', ')}`,
          });
        }
      } catch {
        return res.json({
          verified: false,
          message: `No CNAME record found for ${website.customDomain}. Add a CNAME record pointing to ${expectedTarget}.`,
        });
      }
    } catch (error: any) {
      console.error("[WebsiteBuilder] Verify domain error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/website-builder/purchase-domain
   * Stub — returns "coming soon".
   */
  app.post("/api/website-builder/purchase-domain", isAuthenticated, async (_req: Request, res: Response) => {
    res.json({ available: false, message: "Domain purchasing is coming soon" });
  });

  // ─────────────────────────────────────────────────────────
  // Part 3: Website Storage + Serving
  // ─────────────────────────────────────────────────────────

  /**
   * GET /api/website-builder/site
   * Returns the current website record for the authenticated business.
   */
  app.get("/api/website-builder/site", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      if (businessId === 0) return res.status(400).json({ error: "No business associated" });

      const website = await storage.getWebsite(businessId);
      if (!website) return res.json(null);

      res.json(website);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * PUT /api/website-builder/site
   * Save HTML content for the business website.
   */
  app.put("/api/website-builder/site", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      if (businessId === 0) return res.status(400).json({ error: "No business associated" });

      const usage = await getUsageInfo(businessId);
      const features = getWebsiteFeatures(usage.planTier);
      if (!features.websiteEnabled) {
        return res.status(403).json({ error: "Website Builder is not available on your current plan" });
      }

      const parsed = saveHtmlSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0].message });

      const website = await storage.upsertWebsite(businessId, {
        htmlContent: parsed.data.html_content,
      });

      res.json(website);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * POST /api/website-builder/request-setup
   * Elite plan: flag that managed setup is requested.
   */
  app.post("/api/website-builder/request-setup", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      if (businessId === 0) return res.status(400).json({ error: "No business associated" });

      const usage = await getUsageInfo(businessId);
      const features = getWebsiteFeatures(usage.planTier);
      if (!features.websiteManagedSetup) {
        return res.status(403).json({ error: "Managed website setup requires the Elite plan" });
      }

      await storage.upsertWebsite(businessId, { websiteSetupRequested: true });

      // Fire internal notification
      console.log(`[WebsiteBuilder] SETUP REQUESTED: Business ${businessId} (Elite plan) requested managed website setup`);

      res.json({ success: true, message: "Your website will be set up within 24 hours" });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /sites/:subdomain
   * Public: serve HTML content for a subdomain.
   */
  app.get("/sites/:subdomain", async (req: Request, res: Response) => {
    try {
      const { subdomain } = req.params;
      if (!subdomain) return res.status(404).send(notFoundPage());

      const website = await storage.getWebsiteBySubdomain(subdomain);
      if (!website?.htmlContent) return res.status(404).send(notFoundPage());

      res.set('Content-Type', 'text/html');
      res.send(website.htmlContent);
    } catch {
      res.status(500).send(notFoundPage());
    }
  });

  /**
   * GET /api/website-builder/features
   * Returns the feature flags for the current plan.
   */
  app.get("/api/website-builder/features", isAuthenticated, async (req: Request, res: Response) => {
    try {
      const businessId = getBusinessId(req);
      if (businessId === 0) return res.status(400).json({ error: "No business associated" });

      const usage = await getUsageInfo(businessId);
      const features = getWebsiteFeatures(usage.planTier);

      res.json({ ...features, planTier: usage.planTier });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
}

// ─── 404 Page ────────────────────────────────────────────────────────────────

function notFoundPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Site Not Found — SmallBizAgent</title>
  <style>
    body { margin:0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; display:flex; justify-content:center; align-items:center; min-height:100vh; background:#0f172a; color:#e2e8f0; }
    .container { text-align:center; padding:2rem; }
    h1 { font-size:2rem; margin-bottom:0.5rem; }
    p { color:#94a3b8; margin-bottom:1.5rem; }
    a { color:#3b82f6; text-decoration:none; }
    a:hover { text-decoration:underline; }
  </style>
</head>
<body>
  <div class="container">
    <h1>Site Not Found</h1>
    <p>This site hasn't been set up yet or doesn't exist.</p>
    <a href="https://smallbizagent.ai">Powered by SmallBizAgent</a>
  </div>
</body>
</html>`;
}
