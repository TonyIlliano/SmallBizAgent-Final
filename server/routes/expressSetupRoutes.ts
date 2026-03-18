/**
 * Express Setup Routes
 *
 * Single atomic POST endpoint that handles the entire express onboarding flow
 * in one request: create business, set trial, create services from industry
 * template, set business hours, start provisioning, mark onboarding complete.
 */

import type { Express, Request, Response } from "express";
import { isAuthenticated } from "../middleware/auth";
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
    async (req: Request, res: Response) => {
      try {
        const userId = req.user!.id;
        console.log(`[ExpressSetup] Starting for user ${userId}`);

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
            price: tmpl.price,
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
        // 7. Fire-and-forget: start provisioning (Twilio + Vapi)
        // -----------------------------------------------------------------
        let provisioningStarted = false;
        try {
          import("../services/businessProvisioningService").then((m) => {
            m.provisionBusiness(business.id).catch((err: any) => {
              console.error(`[ExpressSetup] Provisioning failed for business ${business.id}:`, err);
            });
          });
          provisioningStarted = true;
          console.log(`[ExpressSetup] Provisioning kicked off for business ${business.id}`);
        } catch (provErr) {
          console.error("[ExpressSetup] Failed to start provisioning:", provErr);
        }

        // -----------------------------------------------------------------
        // 8. Mark onboarding complete
        // -----------------------------------------------------------------
        await storage.updateUser(userId, { onboardingComplete: true });
        console.log(`[ExpressSetup] Onboarding marked complete for user ${userId}`);

        // -----------------------------------------------------------------
        // 9. Return result
        // -----------------------------------------------------------------
        return res.json({
          success: true,
          business,
          servicesCreated,
          provisioningStarted,
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
