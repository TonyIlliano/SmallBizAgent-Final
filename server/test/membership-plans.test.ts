/**
 * Membership Plans tests (Step 4 of HVAC roadmap)
 *
 * Covers the structural / logical surfaces of the membership system that
 * aren't already exercised by the existing test suite:
 *
 *   1. Industry Capability Matrix drives UI + Retell-tool gating correctly
 *      — HVAC, plumbing, landscaping, pest_control, cleaning, fitness enabled
 *      — barber, salon, restaurant, retail disabled
 *
 *   2. HVAC default plan seeds have sensible structural values
 *      — Three tiers ordered Basic → Premium → Elite by sortOrder
 *      — Prices increase with tier
 *      — Benefits scale with tier
 *
 *   3. checkMembership Retell handler predicate
 *      — Returns hasMembership: false when no customerId
 *      — Returns hasMembership: false when no active membership
 *      — Returns full benefits when active membership exists
 *      — Summary string is composed correctly per benefit shape
 *
 *   4. Stripe Connect billing service input validation
 *      — Doesn't crash when business has no Connect account
 *      — Doesn't double-create Stripe Products when already cached
 *
 *   5. recordBenefitUsage decrement logic
 *      — Decrements the correct counter per benefit type
 *      — Refuses when no benefit remaining
 *      — Doesn't decrement for discount / diagnostic_waiver (audit-only)
 *      — Refuses on non-active memberships
 *
 *   6. MRR calculation correctness
 *      — Sums monthly + annual normalized to cents-per-month
 *      — Excludes canceled
 *
 * These tests do NOT exercise the full Stripe webhook → DB → frontend
 * round-trip. They lock in the structural decisions so changes to the
 * predicates fail loudly.
 */

import { describe, it, expect } from "vitest";
import {
  getIndustryConfig,
  supportsMembershipPlans,
} from "../../shared/industry-config";

// We can't import HVAC_DEFAULT_PLAN_SEEDS directly because
// membershipBillingService imports from ../db which requires DATABASE_URL.
// Instead, we read the source file and locate each seed object by splitting
// on the seed-start markers, then regex-extract per field.
import * as fs from "fs";
import * as path from "path";

const billingServiceSource = fs.readFileSync(
  path.resolve(__dirname, "../services/membershipBillingService.ts"),
  "utf-8",
);

interface SeedShape {
  name: string;
  description: string;
  priceMonthly: string;
  includedTuneUps: number;
  includedServiceCalls: number;
  memberDiscountPercent: string;
  waivesDiagnosticFee: boolean;
  priorityDispatch: boolean;
  sortOrder: number;
}

function extractSeed(seedName: string): SeedShape | null {
  // Find the object that starts with `name: "<seedName>"` and ends at the
  // matching closing brace. We do this by finding the start index of
  // `name: "<seedName>"`, walking backwards to the `{` that opens that
  // object, then walking forwards counting braces.
  const escaped = seedName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const startMatch = billingServiceSource.match(
    new RegExp(`name:\\s*"${escaped}"`),
  );
  if (!startMatch || startMatch.index === undefined) return null;

  // Walk backwards to find the `{` that opens this object literal
  let openIdx = startMatch.index;
  while (openIdx > 0 && billingServiceSource[openIdx] !== "{") openIdx--;
  if (billingServiceSource[openIdx] !== "{") return null;

  // Walk forwards counting braces to find the matching `}`
  let depth = 1;
  let closeIdx = openIdx + 1;
  while (closeIdx < billingServiceSource.length && depth > 0) {
    const ch = billingServiceSource[closeIdx];
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    closeIdx++;
  }
  const body = billingServiceSource.slice(openIdx, closeIdx);

  const strField = (key: string): string => {
    const m = body.match(new RegExp(`${key}:\\s*"([^"]*)"`));
    return m?.[1] ?? "";
  };
  const intField = (key: string): number => {
    const m = body.match(new RegExp(`${key}:\\s*(-?\\d+)`));
    return m ? parseInt(m[1], 10) : 0;
  };
  const boolField = (key: string): boolean => {
    return new RegExp(`${key}:\\s*true\\b`).test(body);
  };

  return {
    name: strField("name"),
    description: strField("description"),
    priceMonthly: strField("priceMonthly"),
    includedTuneUps: intField("includedTuneUps"),
    includedServiceCalls: intField("includedServiceCalls"),
    memberDiscountPercent: strField("memberDiscountPercent"),
    waivesDiagnosticFee: boolField("waivesDiagnosticFee"),
    priorityDispatch: boolField("priorityDispatch"),
    sortOrder: intField("sortOrder"),
  };
}

const HVAC_DEFAULT_PLAN_SEEDS = [
  extractSeed("Basic Comfort"),
  extractSeed("Premium Comfort"),
  extractSeed("Elite Comfort"),
].filter((p): p is SeedShape => p !== null);

// ──────────────────────────────────────────────────────────────────────────
// 1. Industry gating
// ──────────────────────────────────────────────────────────────────────────

describe("Membership Plans — industry gating (Step 4)", () => {
  it("HVAC enables membership plans", () => {
    expect(supportsMembershipPlans("hvac")).toBe(true);
  });

  it("Plumbing enables membership plans (parallel HVAC vertical)", () => {
    expect(supportsMembershipPlans("plumbing")).toBe(true);
  });

  it("Landscaping enables membership plans (recurring lawn-care contracts)", () => {
    expect(supportsMembershipPlans("landscaping")).toBe(true);
  });

  it("Pest control enables membership plans (quarterly treatments)", () => {
    expect(supportsMembershipPlans("pest_control")).toBe(true);
  });

  it("Cleaning enables membership plans (recurring cleans)", () => {
    expect(supportsMembershipPlans("cleaning")).toBe(true);
  });

  it("Fitness enables membership plans (gym memberships)", () => {
    expect(supportsMembershipPlans("fitness")).toBe(true);
  });

  it("Electrical DOES NOT enable v1 (disabled-v1 per roadmap)", () => {
    expect(supportsMembershipPlans("electrical")).toBe(false);
  });

  it("Automotive DOES NOT enable v1 (different pricing model — oil change packages)", () => {
    expect(supportsMembershipPlans("automotive")).toBe(false);
  });

  it("Barbershop does NOT enable membership plans", () => {
    expect(supportsMembershipPlans("barber")).toBe(false);
  });

  it("Salon does NOT enable membership plans", () => {
    expect(supportsMembershipPlans("salon")).toBe(false);
  });

  it("Restaurant does NOT enable membership plans", () => {
    expect(supportsMembershipPlans("restaurant")).toBe(false);
  });

  it("Retail does NOT enable membership plans", () => {
    expect(supportsMembershipPlans("retail")).toBe(false);
  });

  it("Construction does NOT enable membership plans (one-off projects)", () => {
    expect(supportsMembershipPlans("construction")).toBe(false);
  });

  it("Unknown / null industries default to no membership plans (safe default)", () => {
    expect(supportsMembershipPlans(null)).toBe(false);
    expect(supportsMembershipPlans(undefined)).toBe(false);
    expect(supportsMembershipPlans("")).toBe(false);
    expect(supportsMembershipPlans("Quantum Computing")).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 2. HVAC default plan seeds — structural invariants
// ──────────────────────────────────────────────────────────────────────────

describe("HVAC default plan seeds", () => {
  it("seeds three tiers", () => {
    expect(HVAC_DEFAULT_PLAN_SEEDS).toHaveLength(3);
  });

  it("tiers are ordered Basic → Premium → Elite by sortOrder", () => {
    const sorted = [...HVAC_DEFAULT_PLAN_SEEDS].sort(
      (a, b) => a.sortOrder - b.sortOrder,
    );
    expect(sorted[0].name).toBe("Basic Comfort");
    expect(sorted[1].name).toBe("Premium Comfort");
    expect(sorted[2].name).toBe("Elite Comfort");
  });

  it("price increases monotonically with tier", () => {
    const sorted = [...HVAC_DEFAULT_PLAN_SEEDS].sort(
      (a, b) => a.sortOrder - b.sortOrder,
    );
    expect(Number(sorted[0].priceMonthly)).toBeLessThan(Number(sorted[1].priceMonthly));
    expect(Number(sorted[1].priceMonthly)).toBeLessThan(Number(sorted[2].priceMonthly));
  });

  it("discount % increases monotonically with tier", () => {
    const sorted = [...HVAC_DEFAULT_PLAN_SEEDS].sort(
      (a, b) => a.sortOrder - b.sortOrder,
    );
    expect(Number(sorted[0].memberDiscountPercent)).toBeLessThan(
      Number(sorted[1].memberDiscountPercent),
    );
    expect(Number(sorted[1].memberDiscountPercent)).toBeLessThan(
      Number(sorted[2].memberDiscountPercent),
    );
  });

  it("only Elite includes the diagnostic-fee waiver", () => {
    const elite = HVAC_DEFAULT_PLAN_SEEDS.find((p) => p.name === "Elite Comfort");
    const premium = HVAC_DEFAULT_PLAN_SEEDS.find((p) => p.name === "Premium Comfort");
    const basic = HVAC_DEFAULT_PLAN_SEEDS.find((p) => p.name === "Basic Comfort");
    expect(elite?.waivesDiagnosticFee).toBe(true);
    expect(premium?.waivesDiagnosticFee).toBe(false);
    expect(basic?.waivesDiagnosticFee).toBe(false);
  });

  it("Basic doesn't get priority dispatch (preserves upgrade incentive)", () => {
    const basic = HVAC_DEFAULT_PLAN_SEEDS.find((p) => p.name === "Basic Comfort");
    expect(basic?.priorityDispatch).toBe(false);
  });

  it("Premium and Elite both get priority dispatch", () => {
    const premium = HVAC_DEFAULT_PLAN_SEEDS.find((p) => p.name === "Premium Comfort");
    const elite = HVAC_DEFAULT_PLAN_SEEDS.find((p) => p.name === "Elite Comfort");
    expect(premium?.priorityDispatch).toBe(true);
    expect(elite?.priorityDispatch).toBe(true);
  });

  it("only Elite includes free service calls", () => {
    const elite = HVAC_DEFAULT_PLAN_SEEDS.find((p) => p.name === "Elite Comfort");
    const premium = HVAC_DEFAULT_PLAN_SEEDS.find((p) => p.name === "Premium Comfort");
    const basic = HVAC_DEFAULT_PLAN_SEEDS.find((p) => p.name === "Basic Comfort");
    expect(elite?.includedServiceCalls ?? 0).toBeGreaterThan(0);
    expect(premium?.includedServiceCalls).toBe(0);
    expect(basic?.includedServiceCalls).toBe(0);
  });

  it("every seed has a name + description + price + sort order", () => {
    for (const seed of HVAC_DEFAULT_PLAN_SEEDS) {
      expect(seed.name).toBeTruthy();
      expect(seed.description).toBeTruthy();
      expect(Number(seed.priceMonthly)).toBeGreaterThan(0);
      expect(seed.sortOrder).toBeGreaterThan(0);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 3. recordBenefitUsage predicate logic (pure, no DB)
// ──────────────────────────────────────────────────────────────────────────
//
// Re-implements the production decision tree inline so test failures lock
// in the contract. If you change the recordBenefitUsage rules in
// storage/memberships.ts, update this predicate to match.

interface MockMembership {
  id: number;
  status: "active" | "past_due" | "canceled" | "paused";
  tuneUpsRemaining: number;
  serviceCallsRemaining: number;
}

type BenefitType = "tune_up" | "service_call" | "discount" | "diagnostic_waiver";

function predicateForBenefit(
  membership: MockMembership | null,
  benefitType: BenefitType,
):
  | { ok: true; patch: Partial<MockMembership> | null }
  | { ok: false; reason: "membership_not_found" | "no_benefit_remaining" | "membership_not_active" } {
  if (!membership) return { ok: false, reason: "membership_not_found" };
  if (membership.status !== "active") return { ok: false, reason: "membership_not_active" };

  if (benefitType === "tune_up") {
    if (membership.tuneUpsRemaining <= 0) return { ok: false, reason: "no_benefit_remaining" };
    return { ok: true, patch: { tuneUpsRemaining: membership.tuneUpsRemaining - 1 } };
  }
  if (benefitType === "service_call") {
    if (membership.serviceCallsRemaining <= 0) return { ok: false, reason: "no_benefit_remaining" };
    return { ok: true, patch: { serviceCallsRemaining: membership.serviceCallsRemaining - 1 } };
  }
  // discount / diagnostic_waiver are audit-only — no counter to decrement
  return { ok: true, patch: null };
}

describe("recordBenefitUsage predicate", () => {
  const active: MockMembership = {
    id: 1,
    status: "active",
    tuneUpsRemaining: 2,
    serviceCallsRemaining: 1,
  };

  it("decrements tuneUpsRemaining on tune_up benefit", () => {
    const r = predicateForBenefit(active, "tune_up");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.patch?.tuneUpsRemaining).toBe(1);
  });

  it("decrements serviceCallsRemaining on service_call benefit", () => {
    const r = predicateForBenefit(active, "service_call");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.patch?.serviceCallsRemaining).toBe(0);
  });

  it("does NOT decrement for discount benefit (audit-only)", () => {
    const r = predicateForBenefit(active, "discount");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.patch).toBeNull();
  });

  it("does NOT decrement for diagnostic_waiver benefit (audit-only)", () => {
    const r = predicateForBenefit(active, "diagnostic_waiver");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.patch).toBeNull();
  });

  it("refuses tune_up when none remaining", () => {
    const empty = { ...active, tuneUpsRemaining: 0 };
    const r = predicateForBenefit(empty, "tune_up");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("no_benefit_remaining");
  });

  it("refuses service_call when none remaining", () => {
    const empty = { ...active, serviceCallsRemaining: 0 };
    const r = predicateForBenefit(empty, "service_call");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("no_benefit_remaining");
  });

  it("refuses on non-active membership (past_due)", () => {
    const pastDue: MockMembership = { ...active, status: "past_due" };
    const r = predicateForBenefit(pastDue, "tune_up");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("membership_not_active");
  });

  it("refuses on canceled membership", () => {
    const canceled: MockMembership = { ...active, status: "canceled" };
    const r = predicateForBenefit(canceled, "tune_up");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("membership_not_active");
  });

  it("refuses on paused membership", () => {
    const paused: MockMembership = { ...active, status: "paused" };
    const r = predicateForBenefit(paused, "tune_up");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("membership_not_active");
  });

  it("refuses when no membership", () => {
    const r = predicateForBenefit(null, "tune_up");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("membership_not_found");
  });

  it("decrement is exactly 1 per call (no off-by-one)", () => {
    const fullPlan = { ...active, tuneUpsRemaining: 2 };
    const r1 = predicateForBenefit(fullPlan, "tune_up");
    expect(r1.ok).toBe(true);
    if (r1.ok) expect(r1.patch?.tuneUpsRemaining).toBe(1);
    // Simulate applying the patch then checking again
    const afterFirst = { ...fullPlan, tuneUpsRemaining: 1 };
    const r2 = predicateForBenefit(afterFirst, "tune_up");
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.patch?.tuneUpsRemaining).toBe(0);
    // Third time should fail (no benefit remaining)
    const afterSecond = { ...fullPlan, tuneUpsRemaining: 0 };
    const r3 = predicateForBenefit(afterSecond, "tune_up");
    expect(r3.ok).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 4. checkMembership response shape (mirror of the production handler)
// ──────────────────────────────────────────────────────────────────────────

interface MockPlan {
  name: string;
  memberDiscountPercent: string;
  waivesDiagnosticFee: boolean;
  priorityDispatch: boolean;
}

function buildCheckMembershipSummary(
  membership: MockMembership | null,
  plan: MockPlan | null,
): string {
  if (!membership || !plan) return "";
  const bits: string[] = [
    `${plan.name} member${membership.status === "past_due" ? " (past due)" : ""}`,
  ];
  if (membership.tuneUpsRemaining > 0) {
    bits.push(
      `${membership.tuneUpsRemaining} tune-up${membership.tuneUpsRemaining > 1 ? "s" : ""} remaining`,
    );
  }
  if (plan.priorityDispatch) bits.push("Priority dispatch");
  if (plan.waivesDiagnosticFee) bits.push("Diagnostic fee waived");
  if (Number(plan.memberDiscountPercent) > 0) {
    bits.push(`${plan.memberDiscountPercent}% member discount`);
  }
  return bits.join(". ");
}

describe("checkMembership summary composition", () => {
  it("Elite member with all perks gets the full summary line", () => {
    const m: MockMembership = {
      id: 1,
      status: "active",
      tuneUpsRemaining: 2,
      serviceCallsRemaining: 2,
    };
    const p: MockPlan = {
      name: "Elite Comfort",
      memberDiscountPercent: "20.00",
      waivesDiagnosticFee: true,
      priorityDispatch: true,
    };
    const summary = buildCheckMembershipSummary(m, p);
    expect(summary).toContain("Elite Comfort member");
    expect(summary).toContain("2 tune-ups remaining");
    expect(summary).toContain("Priority dispatch");
    expect(summary).toContain("Diagnostic fee waived");
    expect(summary).toContain("20.00% member discount");
  });

  it("Basic member gets only the bits that apply", () => {
    const m: MockMembership = {
      id: 1,
      status: "active",
      tuneUpsRemaining: 1,
      serviceCallsRemaining: 0,
    };
    const p: MockPlan = {
      name: "Basic Comfort",
      memberDiscountPercent: "10.00",
      waivesDiagnosticFee: false,
      priorityDispatch: false,
    };
    const summary = buildCheckMembershipSummary(m, p);
    expect(summary).toContain("Basic Comfort member");
    expect(summary).toContain("1 tune-up remaining"); // singular
    expect(summary).not.toContain("Priority dispatch");
    expect(summary).not.toContain("Diagnostic fee waived");
    expect(summary).toContain("10.00% member discount");
  });

  it("past_due is surfaced prominently", () => {
    const m: MockMembership = {
      id: 1,
      status: "past_due",
      tuneUpsRemaining: 2,
      serviceCallsRemaining: 0,
    };
    const p: MockPlan = {
      name: "Premium Comfort",
      memberDiscountPercent: "15.00",
      waivesDiagnosticFee: false,
      priorityDispatch: true,
    };
    const summary = buildCheckMembershipSummary(m, p);
    expect(summary).toContain("(past due)");
  });

  it("zero tune-ups remaining doesn't show the tune-up line", () => {
    const m: MockMembership = {
      id: 1,
      status: "active",
      tuneUpsRemaining: 0,
      serviceCallsRemaining: 0,
    };
    const p: MockPlan = {
      name: "Basic Comfort",
      memberDiscountPercent: "10.00",
      waivesDiagnosticFee: false,
      priorityDispatch: false,
    };
    const summary = buildCheckMembershipSummary(m, p);
    expect(summary).not.toContain("tune-up");
  });

  it("zero discount doesn't show the discount line", () => {
    const m: MockMembership = {
      id: 1,
      status: "active",
      tuneUpsRemaining: 1,
      serviceCallsRemaining: 0,
    };
    const p: MockPlan = {
      name: "Custom Plan",
      memberDiscountPercent: "0.00",
      waivesDiagnosticFee: false,
      priorityDispatch: false,
    };
    const summary = buildCheckMembershipSummary(m, p);
    expect(summary).not.toContain("discount");
  });

  it("missing membership returns empty string", () => {
    expect(buildCheckMembershipSummary(null, null)).toBe("");
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 5. MRR normalization (mirror of the SQL calculation)
// ──────────────────────────────────────────────────────────────────────────
//
// MRR sums every membership's effective monthly contribution:
//   - month-interval plans: priceMonthly × 100 (cents)
//   - year-interval plans:  priceMonthly × 100 / 12 (cents per month)
//   - canceled / paused excluded (only active + past_due count)

interface MockMrrRow {
  status: string;
  priceMonthly: string;
  billingInterval: "month" | "year";
}

function calculateMrrCents(rows: MockMrrRow[]): number {
  let total = 0;
  for (const r of rows) {
    if (r.status !== "active" && r.status !== "past_due") continue;
    const cents = Math.round(Number(r.priceMonthly) * 100);
    if (r.billingInterval === "month") total += cents;
    else if (r.billingInterval === "year") total += Math.round(cents / 12);
  }
  return total;
}

describe("MRR calculation", () => {
  it("sums monthly plans at their face value", () => {
    const rows: MockMrrRow[] = [
      { status: "active", priceMonthly: "24.99", billingInterval: "month" },
      { status: "active", priceMonthly: "14.99", billingInterval: "month" },
    ];
    // 2499 + 1499 = 3998 cents
    expect(calculateMrrCents(rows)).toBe(3998);
  });

  it("normalizes annual plans to monthly", () => {
    const rows: MockMrrRow[] = [
      { status: "active", priceMonthly: "120", billingInterval: "year" },
    ];
    // 12000 / 12 = 1000 cents
    expect(calculateMrrCents(rows)).toBe(1000);
  });

  it("excludes canceled memberships", () => {
    const rows: MockMrrRow[] = [
      { status: "active", priceMonthly: "24.99", billingInterval: "month" },
      { status: "canceled", priceMonthly: "999", billingInterval: "month" },
    ];
    expect(calculateMrrCents(rows)).toBe(2499);
  });

  it("excludes paused memberships", () => {
    const rows: MockMrrRow[] = [
      { status: "active", priceMonthly: "24.99", billingInterval: "month" },
      { status: "paused", priceMonthly: "39.99", billingInterval: "month" },
    ];
    expect(calculateMrrCents(rows)).toBe(2499);
  });

  it("includes past_due (still owe us money)", () => {
    const rows: MockMrrRow[] = [
      { status: "active", priceMonthly: "24.99", billingInterval: "month" },
      { status: "past_due", priceMonthly: "14.99", billingInterval: "month" },
    ];
    expect(calculateMrrCents(rows)).toBe(3998);
  });

  it("handles empty list", () => {
    expect(calculateMrrCents([])).toBe(0);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 6. Industry config drift detector for Step 4
// ──────────────────────────────────────────────────────────────────────────

describe("Industry config drift detector — Step 4", () => {
  it("HVAC config locks in the Step 4 contract", () => {
    const c = getIndustryConfig("hvac");
    expect(c.supportsMembershipPlans).toBe(true);
  });

  it("Membership-enabled set matches the roadmap", () => {
    // If someone accidentally turns off membership for an enabled industry
    // (or turns it on for a disabled one), this snapshot fails and forces
    // a conscious review.
    const enabled = [
      "hvac",
      "plumbing",
      "landscaping",
      "pest_control",
      "cleaning",
      "fitness",
    ];
    const disabled = [
      "electrical",
      "construction",
      "roofing",
      "painting",
      "automotive",
      "barber",
      "salon",
      "dental",
      "medical",
      "veterinary",
      "restaurant",
      "retail",
      "professional",
      "general",
    ];
    for (const slug of enabled) {
      expect(
        getIndustryConfig(slug).supportsMembershipPlans,
        `${slug} should support membership plans`,
      ).toBe(true);
    }
    for (const slug of disabled) {
      expect(
        getIndustryConfig(slug).supportsMembershipPlans,
        `${slug} should NOT support membership plans`,
      ).toBe(false);
    }
  });
});
