/**
 * Express Setup Routes
 *
 * Single atomic POST endpoint that handles the entire express onboarding flow
 * in one request: create business, set trial, create services from industry
 * template, set business hours, start provisioning, mark onboarding complete.
 */

import type { Express, Request, Response } from "express";
import { isAuthenticated, requireEmailVerified } from "../middleware/auth";
import { storage } from "../storage";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Zod validation schema
// ---------------------------------------------------------------------------

const expressSetupSchema = z.object({
  name: z.string().min(1, "Business name is required").max(200),
  industry: z.string().min(1, "Industry is required"),
  phone: z.string().min(7, "Phone number is required").max(20),
  email: z.string().email("Valid email is required"),
  address: z.string().optional().default(""),
  city: z.string().optional().default(""),
  state: z.string().optional().default(""),
  zipCode: z.string().optional().default(""),
});

// ---------------------------------------------------------------------------
// Slug helper
// ---------------------------------------------------------------------------

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") // remove non-word chars except spaces & hyphens
    .replace(/[\s_]+/g, "-")  // spaces/underscores → hyphens
    .replace(/-+/g, "-")      // collapse multiple hyphens
    .replace(/^-+|-+$/g, ""); // trim leading/trailing hyphens
}

/**
 * Extract a 3-digit US area code from a free-form phone string.
 * Accepts formats like "+1 (330) 555-1234", "330-555-1234", "13305551234", etc.
 * Returns undefined if no plausible area code is found.
 */
function extractAreaCode(phone: string): string | undefined {
  if (!phone) return undefined;
  const digits = phone.replace(/\D/g, "");
  // 11-digit number starting with 1 → area code is digits 2-4
  if (digits.length === 11 && digits.startsWith("1")) {
    return digits.slice(1, 4);
  }
  // 10-digit number → area code is digits 1-3
  if (digits.length === 10) {
    return digits.slice(0, 3);
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Industry → template mapping
// ---------------------------------------------------------------------------

type TemplateId =
  | "plumbing"
  | "hvac"
  | "automotive"
  | "salon"
  | "medical"
  | "consulting"
  | "cleaning"
  | "painting"
  | "restaurant"
  | "landscaping"
  | "legal"
  | "construction";

const INDUSTRY_TO_TEMPLATE: Record<string, TemplateId> = {
  "Barber/Salon": "salon",
  "Restaurant": "restaurant",
  "Plumbing": "plumbing",
  "Electrical": "construction",
  "Landscaping": "landscaping",
  "Cleaning": "cleaning",
  "HVAC": "hvac",
  "Carpentry": "construction",
  "Painting": "painting",
  "Auto Repair": "automotive",
  "General Contracting": "construction",
  "Construction": "construction",
  "Pest Control": "consulting",
  "Pool Maintenance": "consulting",
  "Roofing": "construction",
  "Flooring": "construction",
  "Appliance Repair": "hvac",
  "Computer Repair": "consulting",
  "Other": "consulting",
};

// ---------------------------------------------------------------------------
// Service templates — keyed by template ID
// Each service: { name, price, duration (minutes), description? }
// ---------------------------------------------------------------------------

interface ServiceTemplate {
  name: string;
  price: number;
  duration: number;
  description?: string;
}

const SERVICE_TEMPLATES: Record<TemplateId, ServiceTemplate[]> = {
  plumbing: [
    { name: "Drain Cleaning", price: 150, duration: 60, description: "Clear clogged drains using professional equipment" },
    { name: "Leak Repair", price: 200, duration: 90, description: "Locate and repair pipe leaks" },
    { name: "Water Heater Installation", price: 1200, duration: 240, description: "Install new water heater (tank or tankless)" },
    { name: "Faucet Replacement", price: 175, duration: 60, description: "Replace kitchen or bathroom faucet" },
    { name: "Toilet Repair", price: 125, duration: 45, description: "Fix running, leaking, or clogged toilets" },
    { name: "Sewer Line Inspection", price: 250, duration: 90, description: "Camera inspection of sewer lines" },
    { name: "Garbage Disposal Installation", price: 200, duration: 60, description: "Install or replace garbage disposal unit" },
    { name: "Emergency Service Call", price: 300, duration: 120, description: "After-hours emergency plumbing service" },
  ],

  hvac: [
    { name: "AC Tune-Up", price: 125, duration: 60, description: "Seasonal air conditioning maintenance" },
    { name: "Furnace Tune-Up", price: 125, duration: 60, description: "Seasonal heating system maintenance" },
    { name: "AC Repair", price: 250, duration: 120, description: "Diagnose and repair air conditioning issues" },
    { name: "Furnace Repair", price: 250, duration: 120, description: "Diagnose and repair heating system issues" },
    { name: "Thermostat Installation", price: 175, duration: 60, description: "Install smart or programmable thermostat" },
    { name: "Duct Cleaning", price: 350, duration: 180, description: "Professional air duct cleaning" },
    { name: "AC Installation", price: 3500, duration: 480, description: "Full air conditioning system installation" },
    { name: "Indoor Air Quality Assessment", price: 150, duration: 60, description: "Test and assess indoor air quality" },
  ],

  automotive: [
    { name: "Oil Change", price: 45, duration: 30, description: "Conventional or synthetic oil change" },
    { name: "Brake Inspection & Repair", price: 200, duration: 90, description: "Inspect and repair brake system" },
    { name: "Tire Rotation", price: 35, duration: 30, description: "Rotate tires for even wear" },
    { name: "Engine Diagnostic", price: 100, duration: 60, description: "Computer diagnostic scan and assessment" },
    { name: "Battery Replacement", price: 150, duration: 30, description: "Test and replace car battery" },
    { name: "Alignment", price: 100, duration: 60, description: "Four-wheel alignment service" },
    { name: "Transmission Service", price: 250, duration: 120, description: "Transmission fluid flush and service" },
    { name: "State Inspection", price: 35, duration: 30, description: "Annual state vehicle inspection" },
  ],

  salon: [
    { name: "Haircut", price: 35, duration: 30, description: "Professional haircut and style" },
    { name: "Haircut & Beard Trim", price: 45, duration: 45, description: "Haircut with beard shaping and trim" },
    { name: "Beard Trim", price: 15, duration: 15, description: "Beard shaping and trim" },
    { name: "Hot Towel Shave", price: 30, duration: 30, description: "Classic straight razor hot towel shave" },
    { name: "Hair Color", price: 80, duration: 90, description: "Full color or highlights" },
    { name: "Kids Haircut", price: 20, duration: 20, description: "Haircut for children 12 and under" },
    { name: "Blowout & Style", price: 45, duration: 45, description: "Shampoo, blowout, and styling" },
    { name: "Deep Conditioning Treatment", price: 25, duration: 20, description: "Restorative deep conditioning" },
  ],

  medical: [
    { name: "New Patient Visit", price: 250, duration: 60, description: "Comprehensive initial consultation" },
    { name: "Follow-Up Visit", price: 150, duration: 30, description: "Follow-up appointment" },
    { name: "Annual Physical", price: 300, duration: 60, description: "Comprehensive annual wellness exam" },
    { name: "Urgent Visit", price: 200, duration: 30, description: "Same-day urgent care visit" },
    { name: "Telemedicine Consultation", price: 100, duration: 20, description: "Virtual video consultation" },
    { name: "Lab Work", price: 75, duration: 15, description: "Blood draw and basic lab panels" },
    { name: "Vaccination", price: 50, duration: 15, description: "Standard vaccination administration" },
    { name: "Wellness Screening", price: 175, duration: 45, description: "Preventive health screening package" },
  ],

  consulting: [
    { name: "Initial Consultation", price: 150, duration: 60, description: "Discovery session and needs assessment" },
    { name: "Strategy Session", price: 250, duration: 90, description: "In-depth strategy planning session" },
    { name: "Follow-Up Meeting", price: 100, duration: 30, description: "Progress review and next steps" },
    { name: "Service Call", price: 125, duration: 60, description: "Standard on-site or remote service visit" },
    { name: "Assessment & Report", price: 300, duration: 120, description: "Full assessment with written report" },
    { name: "Emergency Service", price: 250, duration: 60, description: "Priority emergency service call" },
  ],

  cleaning: [
    { name: "Standard Cleaning", price: 150, duration: 120, description: "Regular home or office cleaning" },
    { name: "Deep Cleaning", price: 300, duration: 240, description: "Thorough top-to-bottom deep clean" },
    { name: "Move-In/Move-Out Cleaning", price: 350, duration: 300, description: "Complete cleaning for move transitions" },
    { name: "Office Cleaning", price: 200, duration: 120, description: "Commercial office space cleaning" },
    { name: "Carpet Cleaning", price: 175, duration: 90, description: "Professional carpet steam cleaning" },
    { name: "Window Cleaning", price: 125, duration: 60, description: "Interior and exterior window cleaning" },
    { name: "Post-Construction Cleaning", price: 500, duration: 480, description: "Cleanup after renovation or construction" },
  ],

  painting: [
    { name: "Interior Room Painting", price: 400, duration: 480, description: "Paint one standard room (walls and ceiling)" },
    { name: "Exterior Painting", price: 2500, duration: 1440, description: "Full exterior house painting" },
    { name: "Cabinet Painting", price: 1200, duration: 960, description: "Kitchen or bathroom cabinet refinishing" },
    { name: "Deck/Fence Staining", price: 500, duration: 480, description: "Stain and seal deck or fence" },
    { name: "Color Consultation", price: 75, duration: 60, description: "Professional color selection guidance" },
    { name: "Drywall Repair & Paint", price: 200, duration: 120, description: "Patch drywall holes and repaint" },
    { name: "Accent Wall", price: 250, duration: 240, description: "Single accent wall with premium finish" },
  ],

  restaurant: [
    { name: "Dine-In Reservation", price: 0, duration: 90, description: "Table reservation for dine-in" },
    { name: "Private Event Booking", price: 500, duration: 180, description: "Reserve space for private event" },
    { name: "Catering Consultation", price: 0, duration: 60, description: "Discuss catering options and menu" },
    { name: "Takeout Order", price: 0, duration: 15, description: "Place a takeout order by phone" },
    { name: "Delivery Order", price: 0, duration: 30, description: "Place a delivery order by phone" },
  ],

  landscaping: [
    { name: "Lawn Mowing", price: 50, duration: 60, description: "Standard lawn mowing and edging" },
    { name: "Landscape Design", price: 300, duration: 120, description: "Custom landscape design consultation" },
    { name: "Tree Trimming", price: 250, duration: 120, description: "Professional tree and shrub pruning" },
    { name: "Mulch Installation", price: 200, duration: 120, description: "Deliver and spread mulch in beds" },
    { name: "Spring/Fall Cleanup", price: 175, duration: 120, description: "Seasonal yard cleanup and debris removal" },
    { name: "Irrigation Repair", price: 150, duration: 60, description: "Sprinkler system repair and adjustment" },
    { name: "Sod Installation", price: 500, duration: 240, description: "Remove old turf and install new sod" },
    { name: "Snow Removal", price: 75, duration: 60, description: "Driveway and walkway snow clearing" },
  ],

  legal: [
    { name: "Initial Consultation", price: 200, duration: 60, description: "First meeting to discuss your legal matter" },
    { name: "Document Review", price: 300, duration: 60, description: "Review contracts, leases, or legal documents" },
    { name: "Will & Estate Planning", price: 500, duration: 90, description: "Draft or update will and estate documents" },
    { name: "Business Formation", price: 750, duration: 120, description: "LLC, corporation, or partnership setup" },
    { name: "Contract Drafting", price: 400, duration: 90, description: "Draft custom business or personal contracts" },
    { name: "Legal Letter", price: 250, duration: 60, description: "Demand letter or formal legal correspondence" },
  ],

  construction: [
    { name: "Free Estimate", price: 0, duration: 60, description: "On-site project evaluation and estimate" },
    { name: "General Repair", price: 200, duration: 120, description: "Miscellaneous repair and handyman work" },
    { name: "Drywall Installation", price: 400, duration: 240, description: "Install or repair drywall" },
    { name: "Flooring Installation", price: 800, duration: 480, description: "Install hardwood, tile, or vinyl flooring" },
    { name: "Framing", price: 1500, duration: 960, description: "Structural framing for walls, additions, or decks" },
    { name: "Deck/Patio Construction", price: 3000, duration: 2400, description: "Build new deck or patio" },
    { name: "Bathroom Remodel", price: 5000, duration: 4800, description: "Full bathroom renovation" },
    { name: "Kitchen Remodel", price: 8000, duration: 9600, description: "Full kitchen renovation" },
  ],
};

// ---------------------------------------------------------------------------
// Default business hours (Mon-Fri 9am-5pm, Sat+Sun closed)
// ---------------------------------------------------------------------------

const DAYS_OF_WEEK = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

function getDefaultHours(businessId: number) {
  return DAYS_OF_WEEK.map((day) => {
    const isWeekend = day === "saturday" || day === "sunday";
    return {
      businessId,
      day,
      open: isWeekend ? null : "09:00",
      close: isWeekend ? null : "17:00",
      isClosed: isWeekend,
    };
  });
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export function registerExpressSetupRoutes(app: Express) {
  /**
   * POST /api/onboarding/express-setup
   *
   * Atomic express onboarding: creates business, services, hours,
   * starts provisioning, and marks onboarding complete in one shot.
   */
  app.post(
    "/api/onboarding/express-setup",
    isAuthenticated,
    requireEmailVerified, // Block API-level bypass: spam farms / scripted clients can't provision Twilio+Retell without verified email
    async (req: Request, res: Response) => {
      try {
        const userId = req.user!.id;
        console.log(`[ExpressSetup] Starting for user ${userId}`);

        // -----------------------------------------------------------------
        // 0. Idempotency: if this user already has a business, return it.
        //    With synchronous provisioning taking 20-45 seconds, the risk of
        //    a duplicate submit (refresh during wait, double-tap on mobile,
        //    bad mobile network retry) is real. Without this check, a second
        //    business gets created mid-flight.
        // -----------------------------------------------------------------
        const existingBusinessId = req.user!.businessId;
        if (existingBusinessId) {
          const existing = await storage.getBusiness(existingBusinessId);
          if (existing) {
            console.log(`[ExpressSetup] User ${userId} already has business ${existing.id} — returning existing`);
            return res.json({
              success: true,
              alreadySetup: true,
              provisioningSuccess: existing.provisioningStatus === 'completed',
              provisioningError: null,
              twilioPhoneNumber: existing.twilioPhoneNumber || null,
              business: existing,
              servicesCreated: 0,
            });
          }
        }

        // -----------------------------------------------------------------
        // 1. Validate input
        // -----------------------------------------------------------------
        const parsed = expressSetupSchema.safeParse(req.body);
        if (!parsed.success) {
          console.warn("[ExpressSetup] Validation failed:", parsed.error.flatten());
          return res.status(400).json({
            error: "Invalid input",
            details: parsed.error.flatten().fieldErrors,
          });
        }

        const { name, industry, phone, email, address, city, state, zipCode } = parsed.data;

        // -----------------------------------------------------------------
        // 2. Create business
        // -----------------------------------------------------------------
        const slug = slugify(name);
        console.log(`[ExpressSetup] Creating business "${name}" (slug: ${slug})`);

        const business = await storage.createBusiness({
          name,
          industry,
          phone,
          email,
          address,
          city,
          state,
          zip: zipCode,
          timezone: "America/New_York",
          bookingSlug: slug,
        });

        console.log(`[ExpressSetup] Business created: id=${business.id}`);

        // -----------------------------------------------------------------
        // 3. Link user to business
        // -----------------------------------------------------------------
        await storage.updateUser(userId, { businessId: business.id });
        console.log(`[ExpressSetup] Linked user ${userId} → business ${business.id}`);

        // -----------------------------------------------------------------
        // 4. Set trial (14 days from now)
        // -----------------------------------------------------------------
        const now = new Date();
        const trialEnd = new Date(now);
        trialEnd.setDate(trialEnd.getDate() + 14);

        await storage.updateBusiness(business.id, {
          subscriptionStatus: "trialing",
          trialEndsAt: trialEnd,
          subscriptionStartDate: now,
        });
        console.log(`[ExpressSetup] Trial set: ends ${trialEnd.toISOString()}`);

        // -----------------------------------------------------------------
        // 5. Map industry → template and bulk-create services
        // -----------------------------------------------------------------
        const templateId: TemplateId = INDUSTRY_TO_TEMPLATE[industry] || "consulting";
        const templates = SERVICE_TEMPLATES[templateId];
        console.log(`[ExpressSetup] Industry "${industry}" → template "${templateId}" (${templates.length} services)`);

        let servicesCreated = 0;
        for (const tmpl of templates) {
          await storage.createService({
            businessId: business.id,
            name: tmpl.name,
            description: tmpl.description || null,
            price: String(tmpl.price),
            duration: tmpl.duration,
            active: true,
          });
          servicesCreated++;
        }
        console.log(`[ExpressSetup] Created ${servicesCreated} services`);

        // -----------------------------------------------------------------
        // 6. Create Mon-Fri 9am-5pm business hours (7 entries)
        // -----------------------------------------------------------------
        const hoursEntries = getDefaultHours(business.id);
        for (const entry of hoursEntries) {
          await storage.createBusinessHours(entry);
        }
        console.log("[ExpressSetup] Business hours created (Mon-Fri 9-5, Sat+Sun closed)");

        // -----------------------------------------------------------------
        // 6.5. Persist GBP OAuth tokens from session if user connected during onboarding
        //      Tokens were stashed in session by the GBP onboarding callback.
        //      Now that the business exists, write them to calendar_integrations
        //      via savePersistedTokens(). Failures don't block the rest of
        //      onboarding — user can reconnect from Settings if it doesn't take.
        // -----------------------------------------------------------------
        const stash = (req.session as any)?.pendingGbp;
        if (stash && stash.userId === userId && stash.tokens?.access_token) {
          const ageMs = Date.now() - (stash.stashedAt || 0);
          if (ageMs <= 30 * 60 * 1000) {
            try {
              const { GoogleBusinessProfileService } = await import('../services/googleBusinessProfileService');
              const gbpService = new GoogleBusinessProfileService();
              await gbpService.savePersistedTokens(
                business.id,
                stash.tokens,
                stash.selectedAccount,
                stash.selectedLocation
              );
              console.log(`[ExpressSetup] Persisted GBP tokens for business ${business.id}`);

              // Fire-and-forget: kick off initial sync (business info + reviews)
              gbpService.syncBusinessData(business.id).catch((err: any) => {
                console.error(`[ExpressSetup] Post-onboarding GBP sync error:`, err?.message || err);
              });
              gbpService.syncReviews(business.id).catch((err: any) => {
                console.error(`[ExpressSetup] Post-onboarding GBP review sync error:`, err?.message || err);
              });
            } catch (gbpErr: any) {
              console.error(`[ExpressSetup] Failed to persist GBP tokens for business ${business.id}:`, gbpErr?.message || gbpErr);
            }
          } else {
            console.log(`[ExpressSetup] GBP stash expired (age=${ageMs}ms), skipping`);
          }
          // Always clear the stash regardless of outcome
          delete (req.session as any).pendingGbp;
          await new Promise<void>((resolve) => req.session.save(() => resolve()));
        }

        // -----------------------------------------------------------------
        // 7. SYNCHRONOUSLY provision Twilio + Retell AI
        //    We wait for the result instead of fire-and-forget so the user
        //    sees the actual outcome — not a false "success" that masks a
        //    silent provisioning failure (which would leave their AI receptionist
        //    dead-on-arrival when their first customer calls).
        //
        //    Pass area code derived from the user's submitted phone so they
        //    get a local-feeling number (more likely to be answered by callers).
        // -----------------------------------------------------------------
        const preferredAreaCode = extractAreaCode(parsed.data.phone);
        let provisioningResult: any = { success: false };
        try {
          const { provisionBusiness } = await import("../services/businessProvisioningService");
          provisioningResult = await provisionBusiness(business.id, { preferredAreaCode });
          console.log(`[ExpressSetup] Provisioning complete for business ${business.id}: success=${provisioningResult.success}`);
        } catch (provErr: any) {
          console.error(`[ExpressSetup] Provisioning threw for business ${business.id}:`, provErr);
          provisioningResult = {
            success: false,
            error: provErr?.message || String(provErr),
          };
        }

        // -----------------------------------------------------------------
        // 7.5. Card-required trial flow: if the user picked a plan on the
        //      preceding /onboarding/subscription page, create a Stripe
        //      subscription with a SetupIntent so we can collect a card.
        //      The frontend uses clientSecret + intentType to redirect to
        //      /payment after this endpoint returns.
        //
        //      If subscription creation fails, we don't fail the whole setup
        //      — the user has a working business and can pick a plan from
        //      Settings later. They'll be on the no-card grace flow.
        // -----------------------------------------------------------------
        let subscriptionClientSecret: string | null = null;
        let subscriptionIntentType: 'payment' | 'setup' = 'setup';
        const selectedPlanId = (req.session as any)?.onboarding?.selectedPlanId;
        const selectedPromoCode = (req.session as any)?.onboarding?.promoCode;
        if (selectedPlanId && typeof selectedPlanId === 'number') {
          try {
            const { subscriptionService } = await import('../services/subscriptionService');
            const subResult = await subscriptionService.createSubscription(
              business.id,
              selectedPlanId,
              selectedPromoCode || undefined,
            );
            if (subResult.clientSecret) {
              subscriptionClientSecret = subResult.clientSecret;
              if (subResult.intentType === 'payment' || subResult.intentType === 'setup') {
                subscriptionIntentType = subResult.intentType;
              }
            }
            console.log(
              `[ExpressSetup] Subscription created for business ${business.id}: ` +
              `plan=${selectedPlanId} status=${subResult.status} ` +
              `intent=${subscriptionIntentType} ${subscriptionClientSecret ? 'has-clientSecret' : 'no-clientSecret'}`,
            );
            // Clear the onboarding plan selection from session
            if ((req.session as any).onboarding) {
              delete (req.session as any).onboarding.selectedPlanId;
              delete (req.session as any).onboarding.promoCode;
              await new Promise<void>((resolve) => req.session.save(() => resolve()));
            }
          } catch (subErr: any) {
            console.error(
              `[ExpressSetup] Subscription create failed for business ${business.id}, plan ${selectedPlanId}:`,
              subErr?.message || subErr,
            );
            // Don't block setup. User can subscribe from Settings later.
          }
        } else {
          console.log(`[ExpressSetup] No plan selected for user ${userId}; skipping subscription create`);
        }

        // -----------------------------------------------------------------
        // 8. Mark onboarding complete
        //    Even if provisioning failed, the business + services + hours exist.
        //    Owner can retry provisioning from settings/admin without redoing onboarding.
        // -----------------------------------------------------------------
        await storage.updateUser(userId, { onboardingComplete: true });
        console.log(`[ExpressSetup] Onboarding marked complete for user ${userId}`);

        // -----------------------------------------------------------------
        // 9. Return result
        //    `provisioningSuccess` is the source of truth for the frontend —
        //    it triggers the "your number is ready" success path or the
        //    "we hit a snag, support has been notified" recovery path.
        //    `clientSecret`/`intentType` (when present) tell the frontend to
        //    redirect to /payment for card collection before landing on the dashboard.
        // -----------------------------------------------------------------
        const refreshedBusiness = await storage.getBusiness(business.id);
        return res.json({
          success: true, // setup itself succeeded (business created)
          provisioningSuccess: provisioningResult.success === true,
          provisioningError: provisioningResult.error || provisioningResult.twilioError || provisioningResult.retellError || null,
          twilioPhoneNumber: refreshedBusiness?.twilioPhoneNumber || null,
          business: refreshedBusiness || business,
          servicesCreated,
          clientSecret: subscriptionClientSecret,
          intentType: subscriptionIntentType,
        });
      } catch (error: any) {
        console.error("[ExpressSetup] Unexpected error:", error);
        return res.status(500).json({
          error: "Express setup failed",
          details: error.message,
        });
      }
    }
  );
}
