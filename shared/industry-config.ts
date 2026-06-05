/**
 * Industry Capability Matrix — single declarative source of truth for all
 * industry-specific behavior across SmallBizAgent.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE EXISTS
 *
 * SmallBizAgent is a horizontal multi-vertical platform with a vertical-first
 * GTM (HVAC is the current wedge). Behavior that varies by industry — booking
 * flow, service catalog shape, AI receptionist style, membership support,
 * equipment tracking, etc. — is expressed HERE as configuration, not as
 * `if (industry === 'hvac')` branches in business logic.
 *
 * Every feature shipped under the HVAC-first roadmap reads from this file.
 * When we turn on a new vertical (plumbing, electrical, landscaping), it's
 * a config edit here, not a code project across the codebase.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * BACKWARD COMPATIBILITY GUARANTEE
 *
 * `shared/industry-categories.ts#isJobCategory` continues to work unchanged —
 * it now delegates to `getIndustryConfig(industry).category === 'job'`. Every
 * existing call site (Sidebar, BottomNav, schedule-router, Jobs page, Settings
 * tabs, GPS plan gate) keeps working without modification.
 *
 * No new behavior is activated by this file landing — it lays the wiring
 * for future steps to read from. See CLAUDE.md "🚀 Active Strategic Roadmap"
 * for the full execution plan.
 */

// ───────────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────────

export type IndustryCategory = "appointment" | "job";

export type ServicePricingType =
  | "fixed" // Flat-price service (barbershop haircut, salon color, restaurant menu item)
  | "diagnostic_required" // Tech must diagnose on-site before quoting (HVAC repair)
  | "quote_required"; // Custom quote without diagnostic (roofing, full HVAC install, construction)

export type BookingFlow =
  | "direct" // Caller picks a service, AI books it (barber, salon, restaurant)
  | "diagnostic_first" // AI books a diagnostic visit instead of the requested service (HVAC, plumbing, electrical, automotive)
  | "quote_first"; // AI books a quote/estimate visit, not the work itself (roofing, construction, painting)

export type CallerExpectation =
  | "price_quote" // Caller wants to know "how much?" upfront (fixed-price services)
  | "diagnostic_explanation" // Caller wants to understand "we'll need to look at it" (field service)
  | "time_slot"; // Caller wants to know "when can you?" (appointment services)

export type AddressTracking = "required" | "optional" | "none";

export interface IndustryConfig {
  /** Canonical slug used as the key in INDUSTRY_CONFIG. Stable identifier. */
  slug: string;

  /** Human-readable label shown in UI. */
  label: string;

  /** Top-level category — drives the Sidebar/BottomNav scheduling tab. */
  category: IndustryCategory;

  /** Primary scheduling entity. Mirrors `category` today; kept separate so we
   *  can introduce hybrid categories (e.g., "appointment-with-job-overflow")
   *  without a schema change. */
  primaryEntity: IndustryCategory;

  /** Existing key into systemPromptBuilder.ts INDUSTRY_PROMPTS. Resolved via
   *  partial-match in that file, so this value must be a substring that
   *  matches exactly one prompt block. See systemPromptBuilder for valid keys. */
  promptVerticalKey: string;

  /** What the caller most likely wants to walk away from the call knowing.
   *  Drives AI receptionist tone and which fields to confirm. */
  defaultCallerExpectation: CallerExpectation;

  /** Default pricing model for new services in this industry. Per-service
   *  override lives on services.pricingType (added in Step 2 of the roadmap). */
  servicePricingDefault: ServicePricingType;

  /** Whether the service catalog uses categories (Cooling / Heating / IAQ
   *  for HVAC) vs. a flat list (8 barbershop services, no grouping). */
  hasServiceCategories: boolean;

  /** Default category options shown in the service form when
   *  hasServiceCategories is true. Owner can edit. */
  defaultServiceCategories: string[] | null;

  /** How the AI receptionist routes booking requests for this industry. */
  bookingFlow: BookingFlow;

  /** Default diagnostic fee charged on diagnostic_first bookings. Owner can
   *  override per-business. Dollars. */
  diagnosticFeeDefault: number | null;

  /** Whether to model customer-owned equipment (HVAC unit, vehicle, pet, etc.).
   *  Schema lands in Step 3 (customer_equipment table). */
  tracksCustomerEquipment: boolean;

  /** UI label for the equipment card. "Equipment" for HVAC, "Vehicle" for auto,
   *  "Pet" for vet. Null when tracksCustomerEquipment is false. */
  equipmentLabel: string | null;

  /** Whether the customer's address is required for service delivery.
   *  - "required" → field service that comes to you (HVAC, plumbing)
   *  - "optional" → mixed (some come-to-you, some come-in)
   *  - "none" → customer comes to the business (barbershop, restaurant) */
  tracksCustomerAddress: AddressTracking;

  /** Whether this industry supports first-class membership/maintenance plans.
   *  Step 4 of the roadmap lights up the full feature stack when true. */
  supportsMembershipPlans: boolean;

  /** Whether dispatch should support an emergency-priority queue (HVAC summer
   *  surge, plumbing burst-pipe, roofing storm damage). */
  emergencyQueueEnabled: boolean;

  /** Fallback job duration in minutes when service.duration is null. Used by
   *  the AI receptionist when booking to estimate timeslot length. */
  defaultJobDuration: number;
}

// ───────────────────────────────────────────────────────────────────────────
// The matrix
// ───────────────────────────────────────────────────────────────────────────
//
// Industries are organized top-to-bottom by GTM priority:
//   1. The active wedge (HVAC) and adjacent verticals that will turn on next
//   2. Other job-category verticals (already shipping but on conservative defaults)
//   3. Appointment-category verticals (unchanged from current behavior)
//   4. The general fallback
//
// Every IndustryConfig MUST populate every required field. The matrix-shape
// regression test in industry-config.test.ts enforces this at CI time.

export const INDUSTRY_CONFIG: Record<string, IndustryConfig> = {
  // ──────────────────────────────────────────────────────────────────────
  // Active wedge + adjacent field-service verticals
  // ──────────────────────────────────────────────────────────────────────

  hvac: {
    slug: "hvac",
    label: "HVAC",
    category: "job",
    primaryEntity: "job",
    promptVerticalKey: "hvac",
    defaultCallerExpectation: "diagnostic_explanation",
    servicePricingDefault: "quote_required",
    hasServiceCategories: true,
    defaultServiceCategories: [
      "Cooling",
      "Heating",
      "Indoor Air Quality",
      "Maintenance",
      "Install",
      "Diagnostic",
    ],
    bookingFlow: "diagnostic_first",
    diagnosticFeeDefault: 89,
    tracksCustomerEquipment: true,
    equipmentLabel: "Equipment",
    tracksCustomerAddress: "required",
    supportsMembershipPlans: true,
    emergencyQueueEnabled: true,
    defaultJobDuration: 90,
  },

  plumbing: {
    slug: "plumbing",
    label: "Plumbing",
    category: "job",
    primaryEntity: "job",
    promptVerticalKey: "plumbing",
    defaultCallerExpectation: "diagnostic_explanation",
    servicePricingDefault: "quote_required",
    hasServiceCategories: true,
    defaultServiceCategories: [
      "Drain",
      "Water Heater",
      "Leak",
      "Install",
      "Maintenance",
      "Diagnostic",
    ],
    bookingFlow: "diagnostic_first",
    diagnosticFeeDefault: 79,
    tracksCustomerEquipment: true,
    equipmentLabel: "Equipment",
    tracksCustomerAddress: "required",
    supportsMembershipPlans: true,
    emergencyQueueEnabled: true,
    defaultJobDuration: 90,
  },

  electrical: {
    slug: "electrical",
    label: "Electrical",
    category: "job",
    primaryEntity: "job",
    promptVerticalKey: "electrical",
    defaultCallerExpectation: "diagnostic_explanation",
    servicePricingDefault: "quote_required",
    hasServiceCategories: true,
    defaultServiceCategories: [
      "Panel",
      "Wiring",
      "Lighting",
      "Install",
      "Diagnostic",
    ],
    bookingFlow: "diagnostic_first",
    diagnosticFeeDefault: 95,
    tracksCustomerEquipment: true,
    equipmentLabel: "Equipment",
    tracksCustomerAddress: "required",
    // Disabled v1 — architecturally supported, off until HVAC validates the model.
    supportsMembershipPlans: false,
    emergencyQueueEnabled: true,
    defaultJobDuration: 90,
  },

  // ──────────────────────────────────────────────────────────────────────
  // Other job-category verticals
  // ──────────────────────────────────────────────────────────────────────

  landscaping: {
    slug: "landscaping",
    label: "Landscaping",
    category: "job",
    primaryEntity: "job",
    promptVerticalKey: "landscaping",
    defaultCallerExpectation: "price_quote",
    servicePricingDefault: "fixed",
    hasServiceCategories: false,
    defaultServiceCategories: null,
    bookingFlow: "direct",
    diagnosticFeeDefault: null,
    tracksCustomerEquipment: false,
    equipmentLabel: null,
    tracksCustomerAddress: "required",
    supportsMembershipPlans: true,
    emergencyQueueEnabled: false,
    defaultJobDuration: 120,
  },

  construction: {
    slug: "construction",
    label: "Construction",
    category: "job",
    primaryEntity: "job",
    promptVerticalKey: "construction",
    defaultCallerExpectation: "diagnostic_explanation",
    servicePricingDefault: "quote_required",
    hasServiceCategories: false,
    defaultServiceCategories: null,
    bookingFlow: "quote_first",
    diagnosticFeeDefault: null,
    tracksCustomerEquipment: false,
    equipmentLabel: null,
    tracksCustomerAddress: "required",
    supportsMembershipPlans: false,
    emergencyQueueEnabled: false,
    defaultJobDuration: 240,
  },

  pest_control: {
    slug: "pest_control",
    label: "Pest Control",
    category: "job",
    primaryEntity: "job",
    // Pest control isn't its own prompt block today — falls back to general
    // until we add one. AI prompt builder partial-match resolves "pest_control"
    // → first matching key; "general" is the safe fallback.
    promptVerticalKey: "general",
    defaultCallerExpectation: "price_quote",
    servicePricingDefault: "fixed",
    hasServiceCategories: false,
    defaultServiceCategories: null,
    bookingFlow: "direct",
    diagnosticFeeDefault: null,
    tracksCustomerEquipment: false,
    equipmentLabel: null,
    tracksCustomerAddress: "required",
    supportsMembershipPlans: true,
    emergencyQueueEnabled: false,
    defaultJobDuration: 60,
  },

  roofing: {
    slug: "roofing",
    label: "Roofing",
    category: "job",
    primaryEntity: "job",
    // No dedicated prompt block yet — use general until we add one.
    promptVerticalKey: "general",
    defaultCallerExpectation: "diagnostic_explanation",
    servicePricingDefault: "quote_required",
    hasServiceCategories: false,
    defaultServiceCategories: null,
    bookingFlow: "quote_first",
    diagnosticFeeDefault: null,
    tracksCustomerEquipment: false,
    equipmentLabel: null,
    tracksCustomerAddress: "required",
    supportsMembershipPlans: false,
    emergencyQueueEnabled: true,
    defaultJobDuration: 180,
  },

  painting: {
    slug: "painting",
    label: "Painting",
    category: "job",
    primaryEntity: "job",
    // No dedicated prompt block yet — use general until we add one.
    promptVerticalKey: "general",
    defaultCallerExpectation: "diagnostic_explanation",
    servicePricingDefault: "quote_required",
    hasServiceCategories: false,
    defaultServiceCategories: null,
    bookingFlow: "quote_first",
    diagnosticFeeDefault: null,
    tracksCustomerEquipment: false,
    equipmentLabel: null,
    tracksCustomerAddress: "required",
    supportsMembershipPlans: false,
    emergencyQueueEnabled: false,
    defaultJobDuration: 240,
  },

  automotive: {
    slug: "automotive",
    label: "Automotive",
    category: "job",
    primaryEntity: "job",
    promptVerticalKey: "automotive",
    defaultCallerExpectation: "diagnostic_explanation",
    servicePricingDefault: "diagnostic_required",
    hasServiceCategories: false,
    defaultServiceCategories: null,
    bookingFlow: "diagnostic_first",
    diagnosticFeeDefault: 100,
    tracksCustomerEquipment: true,
    equipmentLabel: "Vehicle",
    // Customer brings the vehicle to the shop — address is for billing only.
    tracksCustomerAddress: "optional",
    // Disabled v1 — automotive memberships are a different shape (oil-change
    // packages, prepaid service plans). Architecturally supported, off for v1.
    supportsMembershipPlans: false,
    emergencyQueueEnabled: false,
    defaultJobDuration: 60,
  },

  cleaning: {
    slug: "cleaning",
    label: "Cleaning",
    category: "job",
    primaryEntity: "job",
    promptVerticalKey: "cleaning",
    defaultCallerExpectation: "price_quote",
    servicePricingDefault: "fixed",
    hasServiceCategories: false,
    defaultServiceCategories: null,
    bookingFlow: "direct",
    diagnosticFeeDefault: null,
    tracksCustomerEquipment: false,
    equipmentLabel: null,
    tracksCustomerAddress: "required",
    supportsMembershipPlans: true,
    emergencyQueueEnabled: false,
    defaultJobDuration: 120,
  },

  // ──────────────────────────────────────────────────────────────────────
  // Appointment-category verticals — unchanged behavior, conservative config
  // ──────────────────────────────────────────────────────────────────────

  barber: {
    slug: "barber",
    label: "Barbershop",
    category: "appointment",
    primaryEntity: "appointment",
    promptVerticalKey: "barber",
    defaultCallerExpectation: "time_slot",
    servicePricingDefault: "fixed",
    hasServiceCategories: false,
    defaultServiceCategories: null,
    bookingFlow: "direct",
    diagnosticFeeDefault: null,
    tracksCustomerEquipment: false,
    equipmentLabel: null,
    tracksCustomerAddress: "none",
    supportsMembershipPlans: false,
    emergencyQueueEnabled: false,
    defaultJobDuration: 30,
  },

  salon: {
    slug: "salon",
    label: "Salon",
    category: "appointment",
    primaryEntity: "appointment",
    promptVerticalKey: "salon",
    defaultCallerExpectation: "time_slot",
    servicePricingDefault: "fixed",
    hasServiceCategories: false,
    defaultServiceCategories: null,
    bookingFlow: "direct",
    diagnosticFeeDefault: null,
    tracksCustomerEquipment: false,
    equipmentLabel: null,
    tracksCustomerAddress: "none",
    supportsMembershipPlans: false,
    emergencyQueueEnabled: false,
    defaultJobDuration: 60,
  },

  dental: {
    slug: "dental",
    label: "Dental",
    category: "appointment",
    primaryEntity: "appointment",
    promptVerticalKey: "dental",
    defaultCallerExpectation: "time_slot",
    servicePricingDefault: "fixed",
    hasServiceCategories: false,
    defaultServiceCategories: null,
    bookingFlow: "direct",
    diagnosticFeeDefault: null,
    tracksCustomerEquipment: false,
    equipmentLabel: null,
    tracksCustomerAddress: "none",
    supportsMembershipPlans: false,
    emergencyQueueEnabled: false,
    defaultJobDuration: 45,
  },

  medical: {
    slug: "medical",
    label: "Medical",
    category: "appointment",
    primaryEntity: "appointment",
    promptVerticalKey: "medical",
    defaultCallerExpectation: "time_slot",
    servicePricingDefault: "fixed",
    hasServiceCategories: false,
    defaultServiceCategories: null,
    bookingFlow: "direct",
    diagnosticFeeDefault: null,
    tracksCustomerEquipment: false,
    equipmentLabel: null,
    tracksCustomerAddress: "none",
    supportsMembershipPlans: false,
    emergencyQueueEnabled: false,
    defaultJobDuration: 30,
  },

  veterinary: {
    slug: "veterinary",
    label: "Veterinary",
    category: "appointment",
    primaryEntity: "appointment",
    promptVerticalKey: "veterinary",
    defaultCallerExpectation: "time_slot",
    servicePricingDefault: "fixed",
    hasServiceCategories: false,
    defaultServiceCategories: null,
    bookingFlow: "direct",
    diagnosticFeeDefault: null,
    tracksCustomerEquipment: true,
    equipmentLabel: "Pet",
    tracksCustomerAddress: "none",
    supportsMembershipPlans: false,
    emergencyQueueEnabled: false,
    defaultJobDuration: 30,
  },

  fitness: {
    slug: "fitness",
    label: "Fitness",
    category: "appointment",
    primaryEntity: "appointment",
    promptVerticalKey: "fitness",
    defaultCallerExpectation: "time_slot",
    servicePricingDefault: "fixed",
    hasServiceCategories: false,
    defaultServiceCategories: null,
    bookingFlow: "direct",
    diagnosticFeeDefault: null,
    tracksCustomerEquipment: false,
    equipmentLabel: null,
    tracksCustomerAddress: "none",
    supportsMembershipPlans: true,
    emergencyQueueEnabled: false,
    defaultJobDuration: 60,
  },

  restaurant: {
    slug: "restaurant",
    label: "Restaurant",
    category: "appointment",
    primaryEntity: "appointment",
    promptVerticalKey: "restaurant",
    defaultCallerExpectation: "time_slot",
    servicePricingDefault: "fixed",
    hasServiceCategories: false,
    defaultServiceCategories: null,
    bookingFlow: "direct",
    diagnosticFeeDefault: null,
    tracksCustomerEquipment: false,
    equipmentLabel: null,
    tracksCustomerAddress: "none",
    supportsMembershipPlans: false,
    emergencyQueueEnabled: false,
    defaultJobDuration: 90,
  },

  retail: {
    slug: "retail",
    label: "Retail",
    category: "appointment",
    primaryEntity: "appointment",
    promptVerticalKey: "retail",
    defaultCallerExpectation: "price_quote",
    servicePricingDefault: "fixed",
    hasServiceCategories: false,
    defaultServiceCategories: null,
    bookingFlow: "direct",
    diagnosticFeeDefault: null,
    tracksCustomerEquipment: false,
    equipmentLabel: null,
    tracksCustomerAddress: "none",
    supportsMembershipPlans: false,
    emergencyQueueEnabled: false,
    defaultJobDuration: 30,
  },

  professional: {
    slug: "professional",
    label: "Professional Services",
    category: "appointment",
    primaryEntity: "appointment",
    promptVerticalKey: "professional",
    defaultCallerExpectation: "time_slot",
    servicePricingDefault: "fixed",
    hasServiceCategories: false,
    defaultServiceCategories: null,
    bookingFlow: "direct",
    diagnosticFeeDefault: null,
    tracksCustomerEquipment: false,
    equipmentLabel: null,
    tracksCustomerAddress: "none",
    supportsMembershipPlans: false,
    emergencyQueueEnabled: false,
    defaultJobDuration: 60,
  },

  // ──────────────────────────────────────────────────────────────────────
  // Safe fallback for unknown / null industries
  // ──────────────────────────────────────────────────────────────────────

  general: {
    slug: "general",
    label: "General",
    category: "appointment",
    primaryEntity: "appointment",
    promptVerticalKey: "general",
    defaultCallerExpectation: "time_slot",
    servicePricingDefault: "fixed",
    hasServiceCategories: false,
    defaultServiceCategories: null,
    bookingFlow: "direct",
    diagnosticFeeDefault: null,
    tracksCustomerEquipment: false,
    equipmentLabel: null,
    tracksCustomerAddress: "optional",
    supportsMembershipPlans: false,
    emergencyQueueEnabled: false,
    defaultJobDuration: 60,
  },
};

// ───────────────────────────────────────────────────────────────────────────
// Resolver
// ───────────────────────────────────────────────────────────────────────────

/**
 * Resolution order:
 *   1. Resolve order matters — slugs are scanned from most-specific to
 *      least-specific (e.g., "pest_control" before "pest"; "professional"
 *      before "general").
 *   2. The "general" entry MUST be last in the scan so it never accidentally
 *      matches "general contracting" before "construction" can match.
 *
 * Scan keys are pre-sorted by length descending at module load so longer
 * (more specific) slugs win during partial-match. This means "pest_control"
 * matches before "pest" even if "pest" were added later, and "professional"
 * matches before "general" even though they're alphabetically inverse.
 */
const SCAN_KEYS = Object.keys(INDUSTRY_CONFIG).sort(
  (a, b) => b.length - a.length,
);

// Simple in-process cache. Industry strings rarely change after business
// onboarding, and getIndustryConfig() is called on most request paths
// (Sidebar, AI receptionist, settings, etc.). Cache is unbounded by design
// because the key space is the set of distinct industry strings ever seen,
// which is small (~100 even for a large multi-tenant deployment).
const CACHE = new Map<string, IndustryConfig>();

const FALLBACK = INDUSTRY_CONFIG.general;

/**
 * Resolve an industry string (from `business.industry`, free-form text) to
 * its IndustryConfig. Always returns a valid config — never null/undefined.
 *
 * Resolution rules:
 *   - null / undefined / empty → general fallback
 *   - Exact slug match (case-insensitive) → that config
 *   - Partial-match (case-insensitive substring) against any slug, scanning
 *     longest slug first → first matching config
 *   - No match → general fallback
 *
 * Slug aliases (single-word industry strings users commonly type) are also
 * recognized: "auto" → automotive, "ac" → hvac, "heat" → hvac, etc.
 *
 * Examples:
 *   getIndustryConfig("hvac")                          → hvac config
 *   getIndustryConfig("HVAC / Heating & Cooling")      → hvac config
 *   getIndustryConfig("Heating and Air Conditioning")  → hvac config (via "heating" alias)
 *   getIndustryConfig("Mobile Detailing")              → general fallback
 *   getIndustryConfig(null)                            → general fallback
 *   getIndustryConfig("")                              → general fallback
 */
export function getIndustryConfig(
  industry: string | null | undefined,
): IndustryConfig {
  if (!industry) return FALLBACK;

  const key = industry.toLowerCase().trim();
  if (!key) return FALLBACK;

  const cached = CACHE.get(key);
  if (cached) return cached;

  // Exact slug match (e.g., "hvac" → hvac)
  const exact = INDUSTRY_CONFIG[key];
  if (exact) {
    CACHE.set(key, exact);
    return exact;
  }

  // Alias map for common free-form synonyms that wouldn't match via substring.
  // Add aliases here (not new slugs) when business owners commonly type a
  // term that should route to an existing config but doesn't substring-match.
  const ALIASES: Record<string, string> = {
    ac: "hvac",
    "air conditioning": "hvac",
    heating: "hvac",
    cooling: "hvac",
    refrigeration: "hvac",
    auto: "automotive",
    "auto repair": "automotive",
    car: "automotive",
    mechanic: "automotive",
    "hair salon": "salon",
    "nail salon": "salon",
    spa: "salon",
    barbershop: "barber",
    doctor: "medical",
    physician: "medical",
    clinic: "medical",
    vet: "veterinary",
    animal: "veterinary",
    gym: "fitness",
    trainer: "fitness",
    yoga: "fitness",
    cafe: "restaurant",
    coffee: "restaurant",
    food: "restaurant",
    bakery: "restaurant",
    store: "retail",
    shop: "retail",
    boutique: "retail",
    legal: "professional",
    lawyer: "professional",
    accounting: "professional",
    accountant: "professional",
    consulting: "professional",
    consultant: "professional",
    "general contracting": "construction",
    contractor: "construction",
    carpenter: "construction",
    carpentry: "construction",
    handyman: "construction",
    maid: "cleaning",
    janitorial: "cleaning",
    housekeeping: "cleaning",
    lawn: "landscaping",
    "lawn care": "landscaping",
    landscape: "landscaping",
    yard: "landscaping",
    plumber: "plumbing",
    electrician: "electrical",
    exterminator: "pest_control",
    pest: "pest_control",
    roofer: "roofing",
    painter: "painting",
  };

  const aliasTarget = ALIASES[key];
  if (aliasTarget && INDUSTRY_CONFIG[aliasTarget]) {
    const config = INDUSTRY_CONFIG[aliasTarget];
    CACHE.set(key, config);
    return config;
  }

  // Partial-match against slugs (longest-first scan). Matches when the slug
  // appears anywhere as a substring of the lowered industry string.
  // This is the same semantic as the existing JOB_INDUSTRIES check in
  // industry-categories.ts — preserving exact backward compatibility.
  //
  // Skip "general" during partial-match so it never accidentally absorbs
  // strings like "General Contracting" before construction can match via
  // alias. "general" is the explicit fallback below.
  for (const slug of SCAN_KEYS) {
    if (slug === "general") continue;
    if (key.includes(slug)) {
      const config = INDUSTRY_CONFIG[slug];
      CACHE.set(key, config);
      return config;
    }
  }

  // No match — also try alias keys against the lowered industry as a substring
  // (so "Heating and Air Conditioning" matches the "heating" alias).
  for (const [aliasKey, target] of Object.entries(ALIASES)) {
    if (key.includes(aliasKey)) {
      const config = INDUSTRY_CONFIG[target];
      if (config) {
        CACHE.set(key, config);
        return config;
      }
    }
  }

  CACHE.set(key, FALLBACK);
  return FALLBACK;
}

/**
 * Clear the in-process resolver cache. Intended for tests; production code
 * has no reason to call this.
 */
export function _clearIndustryConfigCache(): void {
  CACHE.clear();
}

// ───────────────────────────────────────────────────────────────────────────
// Convenience helpers
// ───────────────────────────────────────────────────────────────────────────
//
// Thin wrappers so call sites stay readable:
//   if (isJobCategory(business.industry)) { ... }
// is easier to read than:
//   if (getIndustryConfig(business.industry).category === "job") { ... }

export function isJobCategoryConfig(industry: string | null | undefined): boolean {
  return getIndustryConfig(industry).category === "job";
}

export function supportsMembershipPlans(
  industry: string | null | undefined,
): boolean {
  return getIndustryConfig(industry).supportsMembershipPlans;
}

export function tracksCustomerEquipment(
  industry: string | null | undefined,
): boolean {
  return getIndustryConfig(industry).tracksCustomerEquipment;
}

export function getEquipmentLabel(
  industry: string | null | undefined,
): string | null {
  return getIndustryConfig(industry).equipmentLabel;
}

export function getBookingFlow(
  industry: string | null | undefined,
): BookingFlow {
  return getIndustryConfig(industry).bookingFlow;
}

export function getDiagnosticFeeDefault(
  industry: string | null | undefined,
): number | null {
  return getIndustryConfig(industry).diagnosticFeeDefault;
}

export function hasEmergencyQueue(
  industry: string | null | undefined,
): boolean {
  return getIndustryConfig(industry).emergencyQueueEnabled;
}

export function getServicePricingDefault(
  industry: string | null | undefined,
): ServicePricingType {
  return getIndustryConfig(industry).servicePricingDefault;
}

export function hasServiceCategories(
  industry: string | null | undefined,
): boolean {
  return getIndustryConfig(industry).hasServiceCategories;
}

export function getDefaultServiceCategories(
  industry: string | null | undefined,
): string[] | null {
  return getIndustryConfig(industry).defaultServiceCategories;
}

export function getDefaultJobDuration(
  industry: string | null | undefined,
): number {
  return getIndustryConfig(industry).defaultJobDuration;
}
