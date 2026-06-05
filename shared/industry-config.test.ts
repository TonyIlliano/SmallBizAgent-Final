import { describe, it, expect, beforeEach } from "vitest";

import {
  INDUSTRY_CONFIG,
  IndustryConfig,
  getIndustryConfig,
  _clearIndustryConfigCache,
  isJobCategoryConfig,
  supportsMembershipPlans,
  tracksCustomerEquipment,
  getEquipmentLabel,
  getBookingFlow,
  getDiagnosticFeeDefault,
  hasEmergencyQueue,
  getServicePricingDefault,
  hasServiceCategories,
  getDefaultServiceCategories,
  getDefaultJobDuration,
} from "./industry-config";

import { isJobCategory, getIndustryCategory } from "./industry-categories";

// ───────────────────────────────────────────────────────────────────────────
// Original isJobCategory implementation (pre-refactor)
// ───────────────────────────────────────────────────────────────────────────
// This is the EXACT code from shared/industry-categories.ts before delegation
// was introduced. The regression test below proves the new delegated
// implementation returns the same answer for every industry input.

const ORIGINAL_JOB_INDUSTRIES = [
  "hvac",
  "plumbing",
  "electrical",
  "landscaping",
  "construction",
  "pest control",
  "roofing",
  "painting",
  "automotive",
  "cleaning",
];

function originalIsJobCategory(industry: string | null | undefined): boolean {
  if (!industry) return false;
  const lower = industry.toLowerCase();
  return ORIGINAL_JOB_INDUSTRIES.some((ind) => lower.includes(ind));
}

// ───────────────────────────────────────────────────────────────────────────
// Test fixtures
// ───────────────────────────────────────────────────────────────────────────

// Real-world industry strings that have appeared in production data or that
// owners commonly type during onboarding. The regression test asserts the
// new isJobCategory() returns the same value as originalIsJobCategory() for
// EVERY string in this list.
const REAL_WORLD_INDUSTRY_STRINGS: (string | null | undefined)[] = [
  // Job-category strings (should resolve to job)
  "hvac",
  "HVAC",
  "HVAC / Heating & Cooling",
  "HVAC and Refrigeration",
  "plumbing",
  "Plumbing",
  "Plumbing & Drain",
  "electrical",
  "Electrical",
  "Electrical Contractor",
  "landscaping",
  "Landscaping",
  "Lawn Care & Landscaping",
  "construction",
  "Construction",
  "General Construction",
  "pest control",
  "Pest Control",
  "Pest Control Services",
  "roofing",
  "Roofing",
  "Roofing & Gutters",
  "painting",
  "Painting",
  "Interior & Exterior Painting",
  "automotive",
  "Automotive",
  "Auto Repair Shop",
  "cleaning",
  "Cleaning",
  "Commercial Cleaning",

  // Appointment-category strings (should resolve to appointment)
  "barber",
  "Barbershop",
  "salon",
  "Hair Salon",
  "Salon and Spa",
  "dental",
  "Dentist Office",
  "medical",
  "Medical Practice",
  "veterinary",
  "Veterinary Clinic",
  "fitness",
  "Fitness Studio",
  "restaurant",
  "Restaurant",
  "Italian Restaurant",
  "retail",
  "Retail Store",
  "professional",
  "Professional Services",

  // Edge cases
  "",
  "   ",
  "Mobile Detailing",
  "Quantum Computing Consultancy",
  "general",
  "General",
  null,
  undefined,
];

beforeEach(() => {
  // Ensure cache state doesn't leak across tests.
  _clearIndustryConfigCache();
});

// ───────────────────────────────────────────────────────────────────────────
// Regression: new isJobCategory() must match original behavior byte-for-byte
// ───────────────────────────────────────────────────────────────────────────

describe("isJobCategory() — backward-compatible delegation", () => {
  it.each(REAL_WORLD_INDUSTRY_STRINGS)(
    "returns the same value as the original implementation for %s",
    (input) => {
      const before = originalIsJobCategory(input);
      const after = isJobCategory(input);
      expect(after).toBe(before);
    },
  );

  it("returns false for null", () => {
    expect(isJobCategory(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isJobCategory(undefined)).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isJobCategory("")).toBe(false);
  });

  it("returns true for every job-category industry in the matrix (using legacy-recognized form)", () => {
    // Map matrix slugs to the form the legacy substring list recognizes
    // (e.g., "pest_control" matrix slug → "pest control" legacy form).
    const LEGACY_FORM: Record<string, string> = {
      pest_control: "pest control",
    };
    for (const [slug, config] of Object.entries(INDUSTRY_CONFIG)) {
      if (config.category === "job") {
        const legacyForm = LEGACY_FORM[slug] ?? slug;
        expect(
          isJobCategory(legacyForm),
          `isJobCategory("${legacyForm}") should be true for job-category slug "${slug}"`,
        ).toBe(true);
      }
    }
  });

  it("returns false for every appointment-category industry in the matrix", () => {
    for (const [slug, config] of Object.entries(INDUSTRY_CONFIG)) {
      if (config.category === "appointment") {
        expect(isJobCategory(slug)).toBe(false);
      }
    }
  });
});

describe("getIndustryCategory()", () => {
  it("returns 'job' for HVAC", () => {
    expect(getIndustryCategory("hvac")).toBe("job");
  });

  it("returns 'appointment' for barbershop", () => {
    expect(getIndustryCategory("barber")).toBe("appointment");
  });

  it("returns 'appointment' for null/empty (safe fallback)", () => {
    expect(getIndustryCategory(null)).toBe("appointment");
    expect(getIndustryCategory("")).toBe("appointment");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Matrix shape invariants
// ───────────────────────────────────────────────────────────────────────────

describe("INDUSTRY_CONFIG matrix shape", () => {
  const REQUIRED_FIELDS: (keyof IndustryConfig)[] = [
    "slug",
    "label",
    "category",
    "primaryEntity",
    "promptVerticalKey",
    "defaultCallerExpectation",
    "servicePricingDefault",
    "hasServiceCategories",
    "defaultServiceCategories",
    "bookingFlow",
    "diagnosticFeeDefault",
    "tracksCustomerEquipment",
    "equipmentLabel",
    "tracksCustomerAddress",
    "supportsMembershipPlans",
    "emergencyQueueEnabled",
    "defaultJobDuration",
  ];

  it("includes a 'general' fallback entry", () => {
    expect(INDUSTRY_CONFIG.general).toBeDefined();
  });

  it("every entry has a populated slug matching its key", () => {
    for (const [key, config] of Object.entries(INDUSTRY_CONFIG)) {
      expect(config.slug).toBe(key);
    }
  });

  it("every entry has all required fields defined (not undefined)", () => {
    for (const [key, config] of Object.entries(INDUSTRY_CONFIG)) {
      for (const field of REQUIRED_FIELDS) {
        expect(
          config[field],
          `${key}.${String(field)} must not be undefined`,
        ).not.toBeUndefined();
      }
    }
  });

  it("category is always either 'appointment' or 'job'", () => {
    for (const config of Object.values(INDUSTRY_CONFIG)) {
      expect(["appointment", "job"]).toContain(config.category);
    }
  });

  it("primaryEntity is always either 'appointment' or 'job'", () => {
    for (const config of Object.values(INDUSTRY_CONFIG)) {
      expect(["appointment", "job"]).toContain(config.primaryEntity);
    }
  });

  it("bookingFlow is always one of the three valid values", () => {
    for (const config of Object.values(INDUSTRY_CONFIG)) {
      expect(["direct", "diagnostic_first", "quote_first"]).toContain(
        config.bookingFlow,
      );
    }
  });

  it("servicePricingDefault is always one of the three valid values", () => {
    for (const config of Object.values(INDUSTRY_CONFIG)) {
      expect([
        "fixed",
        "diagnostic_required",
        "quote_required",
      ]).toContain(config.servicePricingDefault);
    }
  });

  it("defaultCallerExpectation is always one of the three valid values", () => {
    for (const config of Object.values(INDUSTRY_CONFIG)) {
      expect([
        "price_quote",
        "diagnostic_explanation",
        "time_slot",
      ]).toContain(config.defaultCallerExpectation);
    }
  });

  it("tracksCustomerAddress is always required|optional|none", () => {
    for (const config of Object.values(INDUSTRY_CONFIG)) {
      expect(["required", "optional", "none"]).toContain(
        config.tracksCustomerAddress,
      );
    }
  });

  it("equipmentLabel is null IFF tracksCustomerEquipment is false", () => {
    for (const [key, config] of Object.entries(INDUSTRY_CONFIG)) {
      if (config.tracksCustomerEquipment) {
        expect(
          config.equipmentLabel,
          `${key}.equipmentLabel must be a non-null string when tracksCustomerEquipment=true`,
        ).not.toBeNull();
      } else {
        expect(
          config.equipmentLabel,
          `${key}.equipmentLabel must be null when tracksCustomerEquipment=false`,
        ).toBeNull();
      }
    }
  });

  it("defaultServiceCategories is null IFF hasServiceCategories is false", () => {
    for (const [key, config] of Object.entries(INDUSTRY_CONFIG)) {
      if (config.hasServiceCategories) {
        expect(
          config.defaultServiceCategories,
          `${key}.defaultServiceCategories must be a non-null array when hasServiceCategories=true`,
        ).not.toBeNull();
        expect(
          Array.isArray(config.defaultServiceCategories),
          `${key}.defaultServiceCategories must be an array`,
        ).toBe(true);
        expect((config.defaultServiceCategories as string[]).length).toBeGreaterThan(0);
      } else {
        expect(
          config.defaultServiceCategories,
          `${key}.defaultServiceCategories must be null when hasServiceCategories=false`,
        ).toBeNull();
      }
    }
  });

  it("diagnosticFeeDefault is null UNLESS bookingFlow is diagnostic_first", () => {
    // diagnostic_first MAY have a fee (HVAC, plumbing, electrical, automotive)
    // direct / quote_first MUST NOT have a fee
    for (const [key, config] of Object.entries(INDUSTRY_CONFIG)) {
      if (config.bookingFlow !== "diagnostic_first") {
        expect(
          config.diagnosticFeeDefault,
          `${key}.diagnosticFeeDefault must be null when bookingFlow=${config.bookingFlow}`,
        ).toBeNull();
      }
    }
  });

  it("defaultJobDuration is a positive integer for every entry", () => {
    for (const [key, config] of Object.entries(INDUSTRY_CONFIG)) {
      expect(
        config.defaultJobDuration,
        `${key}.defaultJobDuration must be > 0`,
      ).toBeGreaterThan(0);
      expect(Number.isInteger(config.defaultJobDuration)).toBe(true);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// getIndustryConfig() resolver behavior
// ───────────────────────────────────────────────────────────────────────────

describe("getIndustryConfig()", () => {
  it("returns the general fallback for null", () => {
    expect(getIndustryConfig(null).slug).toBe("general");
  });

  it("returns the general fallback for undefined", () => {
    expect(getIndustryConfig(undefined).slug).toBe("general");
  });

  it("returns the general fallback for empty string", () => {
    expect(getIndustryConfig("").slug).toBe("general");
  });

  it("returns the general fallback for whitespace-only string", () => {
    expect(getIndustryConfig("   ").slug).toBe("general");
  });

  it("returns the general fallback for unknown industry", () => {
    expect(getIndustryConfig("Mobile Detailing").slug).toBe("general");
    expect(getIndustryConfig("Quantum Computing").slug).toBe("general");
  });

  it("returns the exact match for a known slug", () => {
    expect(getIndustryConfig("hvac").slug).toBe("hvac");
    expect(getIndustryConfig("plumbing").slug).toBe("plumbing");
    expect(getIndustryConfig("barber").slug).toBe("barber");
  });

  it("is case-insensitive for exact matches", () => {
    expect(getIndustryConfig("HVAC").slug).toBe("hvac");
    expect(getIndustryConfig("Plumbing").slug).toBe("plumbing");
    expect(getIndustryConfig("BARBER").slug).toBe("barber");
  });

  it("resolves messy real-world strings via partial-match", () => {
    expect(getIndustryConfig("HVAC / Heating & Cooling").slug).toBe("hvac");
    expect(getIndustryConfig("Plumbing & Drain Cleaning").slug).toBe("plumbing");
    expect(getIndustryConfig("Electrical Contractor").slug).toBe("electrical");
    expect(getIndustryConfig("Italian Restaurant").slug).toBe("restaurant");
    expect(getIndustryConfig("Hair Salon").slug).toBe("salon");
  });

  it("resolves common aliases", () => {
    expect(getIndustryConfig("AC").slug).toBe("hvac");
    expect(getIndustryConfig("Air Conditioning").slug).toBe("hvac");
    expect(getIndustryConfig("Heating").slug).toBe("hvac");
    expect(getIndustryConfig("Refrigeration").slug).toBe("hvac");
    expect(getIndustryConfig("Auto Repair").slug).toBe("automotive");
    expect(getIndustryConfig("Plumber").slug).toBe("plumbing");
    expect(getIndustryConfig("Electrician").slug).toBe("electrical");
    expect(getIndustryConfig("Lawn Care").slug).toBe("landscaping");
    expect(getIndustryConfig("General Contracting").slug).toBe("construction");
    expect(getIndustryConfig("Exterminator").slug).toBe("pest_control");
    expect(getIndustryConfig("Vet").slug).toBe("veterinary");
    expect(getIndustryConfig("Gym").slug).toBe("fitness");
    expect(getIndustryConfig("Cafe").slug).toBe("restaurant");
    expect(getIndustryConfig("Coffee Shop").slug).toBe("restaurant");
    expect(getIndustryConfig("Lawyer").slug).toBe("professional");
    expect(getIndustryConfig("Consultant").slug).toBe("professional");
  });

  it("treats 'Heating and Air Conditioning' as HVAC", () => {
    // Regression: this string doesn't contain the "hvac" substring but should
    // route to hvac via the "heating" or "air conditioning" alias.
    expect(getIndustryConfig("Heating and Air Conditioning").slug).toBe("hvac");
  });

  it("treats 'Pest Control' (with space) as pest_control (with underscore)", () => {
    // Regression: the original isJobCategory() matched "pest control" via the
    // legacy substring list. The new resolver must route the spaced string to
    // the underscored slug.
    expect(getIndustryConfig("Pest Control").slug).toBe("pest_control");
    expect(getIndustryConfig("pest control").slug).toBe("pest_control");
    expect(getIndustryConfig("Pest Control Services").slug).toBe("pest_control");
  });

  it("never returns null/undefined", () => {
    const inputs = [
      null,
      undefined,
      "",
      "unknown industry",
      "hvac",
      "Mobile Pet Grooming",
    ];
    for (const input of inputs) {
      const result = getIndustryConfig(input);
      expect(result).toBeDefined();
      expect(result).not.toBeNull();
      expect(result.slug).toBeDefined();
    }
  });

  it("caches results (same input returns same reference)", () => {
    const first = getIndustryConfig("HVAC");
    const second = getIndustryConfig("HVAC");
    expect(first).toBe(second);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Convenience helpers
// ───────────────────────────────────────────────────────────────────────────

describe("convenience helpers", () => {
  it("isJobCategoryConfig() agrees with isJobCategory() for most matrix slugs", () => {
    // Slugs that match a substring in the legacy JOB_INDUSTRIES list cleanly
    // agree on both paths. Documented exceptions (where the matrix is more
    // inclusive than the legacy list):
    //   - "pest_control" (underscore slug) — legacy list only had "pest control" (space)
    //
    // These exceptions are intentional and correct for their respective
    // contracts. See industry-categories.ts file header.
    const KNOWN_DIVERGENCES = new Set(["pest_control"]);
    for (const slug of Object.keys(INDUSTRY_CONFIG)) {
      if (KNOWN_DIVERGENCES.has(slug)) continue;
      expect(
        isJobCategoryConfig(slug),
        `isJobCategoryConfig("${slug}") and isJobCategory("${slug}") should agree`,
      ).toBe(isJobCategory(slug));
    }
  });

  it("isJobCategoryConfig() may be MORE inclusive than legacy isJobCategory() for aliases", () => {
    // Documented divergence: the matrix recognizes "Auto Repair Shop" via
    // the "auto" alias → automotive (job). The legacy substring list did
    // not. Both are correct for their respective contracts.
    expect(isJobCategoryConfig("Auto Repair Shop")).toBe(true);
    expect(isJobCategory("Auto Repair Shop")).toBe(false);
  });

  it("isJobCategoryConfig() resolves 'pest_control' slug to job (matrix is more inclusive than legacy)", () => {
    // Documented divergence: the matrix slug "pest_control" with underscore
    // routes to job category. The legacy substring list only matched
    // "pest control" with a space.
    expect(isJobCategoryConfig("pest_control")).toBe(true);
    expect(isJobCategory("pest_control")).toBe(false);
    // Both paths agree on the space form (which is what real users type)
    expect(isJobCategoryConfig("Pest Control")).toBe(true);
    expect(isJobCategory("Pest Control")).toBe(true);
  });

  it("supportsMembershipPlans() returns true for HVAC, false for barbershop", () => {
    expect(supportsMembershipPlans("hvac")).toBe(true);
    expect(supportsMembershipPlans("barber")).toBe(false);
  });

  it("tracksCustomerEquipment() returns true for HVAC, false for barbershop", () => {
    expect(tracksCustomerEquipment("hvac")).toBe(true);
    expect(tracksCustomerEquipment("barber")).toBe(false);
  });

  it("getEquipmentLabel() returns 'Equipment' for HVAC, 'Vehicle' for auto, 'Pet' for vet, null for barbershop", () => {
    expect(getEquipmentLabel("hvac")).toBe("Equipment");
    expect(getEquipmentLabel("automotive")).toBe("Vehicle");
    expect(getEquipmentLabel("veterinary")).toBe("Pet");
    expect(getEquipmentLabel("barber")).toBeNull();
  });

  it("getBookingFlow() returns 'diagnostic_first' for HVAC, 'direct' for barbershop", () => {
    expect(getBookingFlow("hvac")).toBe("diagnostic_first");
    expect(getBookingFlow("barber")).toBe("direct");
    expect(getBookingFlow("construction")).toBe("quote_first");
  });

  it("getDiagnosticFeeDefault() returns a number for HVAC, null for barbershop", () => {
    expect(getDiagnosticFeeDefault("hvac")).toBe(89);
    expect(getDiagnosticFeeDefault("barber")).toBeNull();
  });

  it("hasEmergencyQueue() returns true for HVAC, false for barbershop", () => {
    expect(hasEmergencyQueue("hvac")).toBe(true);
    expect(hasEmergencyQueue("barber")).toBe(false);
  });

  it("getServicePricingDefault() returns 'quote_required' for HVAC, 'fixed' for barbershop", () => {
    expect(getServicePricingDefault("hvac")).toBe("quote_required");
    expect(getServicePricingDefault("barber")).toBe("fixed");
  });

  it("hasServiceCategories() returns true for HVAC, false for barbershop", () => {
    expect(hasServiceCategories("hvac")).toBe(true);
    expect(hasServiceCategories("barber")).toBe(false);
  });

  it("getDefaultServiceCategories() returns the HVAC category list", () => {
    const cats = getDefaultServiceCategories("hvac");
    expect(cats).toContain("Cooling");
    expect(cats).toContain("Heating");
    expect(cats).toContain("Maintenance");
  });

  it("getDefaultServiceCategories() returns null for barbershop", () => {
    expect(getDefaultServiceCategories("barber")).toBeNull();
  });

  it("getDefaultJobDuration() returns a positive number for every industry", () => {
    for (const slug of Object.keys(INDUSTRY_CONFIG)) {
      expect(getDefaultJobDuration(slug)).toBeGreaterThan(0);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// HVAC config snapshot (drift detector — accidental change to HVAC settings
// will fail this test and force a conscious review)
// ───────────────────────────────────────────────────────────────────────────

describe("HVAC config — drift detector", () => {
  it("HVAC config matches the locked-in roadmap values", () => {
    const hvac = INDUSTRY_CONFIG.hvac;
    expect(hvac.category).toBe("job");
    expect(hvac.primaryEntity).toBe("job");
    expect(hvac.promptVerticalKey).toBe("hvac");
    expect(hvac.bookingFlow).toBe("diagnostic_first");
    expect(hvac.diagnosticFeeDefault).toBe(89);
    expect(hvac.servicePricingDefault).toBe("quote_required");
    expect(hvac.hasServiceCategories).toBe(true);
    expect(hvac.tracksCustomerEquipment).toBe(true);
    expect(hvac.equipmentLabel).toBe("Equipment");
    expect(hvac.supportsMembershipPlans).toBe(true);
    expect(hvac.emergencyQueueEnabled).toBe(true);
    expect(hvac.tracksCustomerAddress).toBe("required");
  });
});
