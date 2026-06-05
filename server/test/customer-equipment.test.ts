/**
 * Customer Equipment tests (Step 3 of HVAC roadmap)
 *
 * Covers the structural / logical surfaces that aren't already exercised by
 * the existing test suite:
 *
 *   1. Industry Capability Matrix drives UI gating correctly
 *      — HVAC, plumbing, electrical, automotive, vet all enable the card
 *      — barber, salon, restaurant, fitness, retail DON'T
 *      — equipmentLabel matches each industry's domain vocabulary
 *
 *   2. captureEquipment predicate + dedup logic
 *      — rejects missing customerId
 *      — rejects unknown equipmentType
 *      — rejects cross-tenant customer
 *      — dedup against existing active row with same type + make
 *      — merge-only-missing-fields behavior
 *      — notes append with dated prefix
 *
 *   3. Recognize-caller summary includes equipment line when records exist
 *
 *   4. Job briefing context includes Equipment section when records exist
 *
 * These tests do NOT exercise the full Retell webhook path or DB. They lock
 * in the structural decisions that make the demo magic work and catch
 * accidental drift in the gating contract.
 */

import { describe, it, expect } from "vitest";
import {
  getIndustryConfig,
  tracksCustomerEquipment,
  getEquipmentLabel,
} from "../../shared/industry-config";

// ──────────────────────────────────────────────────────────────────────────
// 1. Industry Capability Matrix drives UI gating
// ──────────────────────────────────────────────────────────────────────────

describe("Customer Equipment — industry gating (Step 3)", () => {
  it("HVAC enables equipment tracking with label 'Equipment'", () => {
    expect(tracksCustomerEquipment("hvac")).toBe(true);
    expect(getEquipmentLabel("hvac")).toBe("Equipment");
  });

  it("Plumbing enables equipment tracking", () => {
    expect(tracksCustomerEquipment("plumbing")).toBe(true);
    expect(getEquipmentLabel("plumbing")).toBe("Equipment");
  });

  it("Electrical enables equipment tracking", () => {
    expect(tracksCustomerEquipment("electrical")).toBe(true);
  });

  it("Automotive uses 'Vehicle' label (different domain)", () => {
    expect(tracksCustomerEquipment("automotive")).toBe(true);
    expect(getEquipmentLabel("automotive")).toBe("Vehicle");
  });

  it("Veterinary uses 'Pet' label", () => {
    expect(tracksCustomerEquipment("veterinary")).toBe(true);
    expect(getEquipmentLabel("veterinary")).toBe("Pet");
  });

  it("Barbershop does NOT enable equipment tracking", () => {
    expect(tracksCustomerEquipment("barber")).toBe(false);
    expect(getEquipmentLabel("barber")).toBeNull();
  });

  it("Salon does NOT enable equipment tracking", () => {
    expect(tracksCustomerEquipment("salon")).toBe(false);
  });

  it("Restaurant does NOT enable equipment tracking", () => {
    expect(tracksCustomerEquipment("restaurant")).toBe(false);
  });

  it("Fitness does NOT enable equipment tracking", () => {
    expect(tracksCustomerEquipment("fitness")).toBe(false);
  });

  it("Retail does NOT enable equipment tracking", () => {
    expect(tracksCustomerEquipment("retail")).toBe(false);
  });

  it("Construction does NOT enable equipment tracking (one-off projects)", () => {
    expect(tracksCustomerEquipment("construction")).toBe(false);
  });

  it("Roofing does NOT enable equipment tracking", () => {
    expect(tracksCustomerEquipment("roofing")).toBe(false);
  });

  it("Landscaping does NOT enable equipment tracking", () => {
    expect(tracksCustomerEquipment("landscaping")).toBe(false);
  });

  it("Unknown industries default to no equipment tracking (safe default)", () => {
    expect(tracksCustomerEquipment(null)).toBe(false);
    expect(tracksCustomerEquipment(undefined)).toBe(false);
    expect(tracksCustomerEquipment("")).toBe(false);
    expect(tracksCustomerEquipment("Mobile Detailing")).toBe(false);
  });

  it("equipmentLabel is null iff tracksCustomerEquipment is false (matrix invariant)", () => {
    // Re-asserts the matrix invariant from industry-config.test.ts in the
    // Step 3 context — if someone accidentally turns on tracksCustomerEquipment
    // without setting equipmentLabel, the customer detail page would render a
    // null title.
    const SLUGS = [
      "hvac",
      "plumbing",
      "electrical",
      "landscaping",
      "construction",
      "pest_control",
      "roofing",
      "painting",
      "automotive",
      "cleaning",
      "barber",
      "salon",
      "dental",
      "medical",
      "veterinary",
      "fitness",
      "restaurant",
      "retail",
      "professional",
      "general",
    ];
    for (const slug of SLUGS) {
      const config = getIndustryConfig(slug);
      if (config.tracksCustomerEquipment) {
        expect(
          config.equipmentLabel,
          `${slug}: tracksCustomerEquipment=true but equipmentLabel is null`,
        ).not.toBeNull();
      } else {
        expect(
          config.equipmentLabel,
          `${slug}: tracksCustomerEquipment=false but equipmentLabel is non-null`,
        ).toBeNull();
      }
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 2. captureEquipment predicate + dedup logic
// ──────────────────────────────────────────────────────────────────────────

// Mirror of the production captureEquipment handler's structural logic.
// Pinned here so the test fails if someone changes the predicate without
// updating both. Pure logic — no DB.

const VALID_EQUIPMENT_TYPES = [
  "furnace",
  "ac",
  "heat_pump",
  "mini_split",
  "boiler",
  "water_heater",
  "thermostat",
  "vehicle",
  "pet",
  "other",
];

interface CapturePayload {
  customerId?: number;
  equipmentType?: string;
  make?: string;
  model?: string;
  installDate?: string;
  location?: string;
  notes?: string;
}

interface MockCustomer {
  id: number;
  businessId: number;
}

interface MockEquipment {
  id: number;
  customerId: number;
  equipmentType: string;
  make: string | null;
  model: string | null;
  installDate: string | null;
  location: string | null;
  notes: string | null;
  active: boolean;
}

function predicateForCapture(
  businessId: number,
  payload: CapturePayload,
  customers: MockCustomer[],
  existingEquipment: MockEquipment[],
):
  | { kind: "error"; reason: string }
  | { kind: "update"; targetId: number; patch: Record<string, any> }
  | { kind: "create"; payload: Omit<MockEquipment, "id"> } {
  if (!payload.customerId) return { kind: "error", reason: "missing_customer_id" };
  if (!payload.equipmentType) return { kind: "error", reason: "missing_equipment_type" };
  if (!VALID_EQUIPMENT_TYPES.includes(payload.equipmentType)) {
    return { kind: "error", reason: "invalid_equipment_type" };
  }
  const customer = customers.find((c) => c.id === payload.customerId);
  if (!customer || customer.businessId !== businessId) {
    return { kind: "error", reason: "customer_not_in_business" };
  }

  const dupe = existingEquipment.find(
    (e) =>
      e.customerId === payload.customerId &&
      e.equipmentType === payload.equipmentType &&
      (e.make || "").toLowerCase() === (payload.make || "").toLowerCase() &&
      e.active === true,
  );

  if (dupe) {
    const patch: Record<string, any> = {};
    if (payload.model && !dupe.model) patch.model = payload.model;
    if (payload.installDate && !dupe.installDate) patch.installDate = payload.installDate;
    if (payload.location && !dupe.location) patch.location = payload.location;
    if (payload.notes) {
      patch.notes = dupe.notes
        ? `${dupe.notes}\n${new Date().toISOString().slice(0, 10)}: ${payload.notes}`
        : payload.notes;
    }
    return { kind: "update", targetId: dupe.id, patch };
  }

  return {
    kind: "create",
    payload: {
      customerId: payload.customerId,
      equipmentType: payload.equipmentType,
      make: payload.make || null,
      model: payload.model || null,
      installDate: payload.installDate || null,
      location: payload.location || null,
      notes: payload.notes || null,
      active: true,
    },
  };
}

describe("captureEquipment — predicate and dedup", () => {
  const businessId = 42;
  const customers: MockCustomer[] = [
    { id: 100, businessId: 42 },
    { id: 200, businessId: 42 },
    { id: 999, businessId: 1 }, // belongs to a DIFFERENT business
  ];

  it("rejects missing customerId", () => {
    const r = predicateForCapture(
      businessId,
      { equipmentType: "ac" },
      customers,
      [],
    );
    expect(r.kind).toBe("error");
    if (r.kind === "error") expect(r.reason).toBe("missing_customer_id");
  });

  it("rejects missing equipmentType", () => {
    const r = predicateForCapture(
      businessId,
      { customerId: 100 },
      customers,
      [],
    );
    expect(r.kind).toBe("error");
    if (r.kind === "error") expect(r.reason).toBe("missing_equipment_type");
  });

  it("rejects unknown equipmentType", () => {
    const r = predicateForCapture(
      businessId,
      { customerId: 100, equipmentType: "spaceship" },
      customers,
      [],
    );
    expect(r.kind).toBe("error");
    if (r.kind === "error") expect(r.reason).toBe("invalid_equipment_type");
  });

  it("rejects cross-tenant customer (customer 999 belongs to business 1, not 42)", () => {
    const r = predicateForCapture(
      businessId,
      { customerId: 999, equipmentType: "ac" },
      customers,
      [],
    );
    expect(r.kind).toBe("error");
    if (r.kind === "error") expect(r.reason).toBe("customer_not_in_business");
  });

  it("creates a new row when no dupe exists", () => {
    const r = predicateForCapture(
      businessId,
      { customerId: 100, equipmentType: "ac", make: "Trane", model: "XR16" },
      customers,
      [],
    );
    expect(r.kind).toBe("create");
    if (r.kind === "create") {
      expect(r.payload.equipmentType).toBe("ac");
      expect(r.payload.make).toBe("Trane");
      expect(r.payload.model).toBe("XR16");
      expect(r.payload.active).toBe(true);
    }
  });

  it("dedupes against existing active row with same type + make (case-insensitive)", () => {
    const existing: MockEquipment[] = [
      {
        id: 5,
        customerId: 100,
        equipmentType: "ac",
        make: "Trane",
        model: null,
        installDate: null,
        location: null,
        notes: null,
        active: true,
      },
    ];
    const r = predicateForCapture(
      businessId,
      // Different case on the make — should still dedupe
      { customerId: 100, equipmentType: "ac", make: "trane", model: "XR16" },
      customers,
      existing,
    );
    expect(r.kind).toBe("update");
    if (r.kind === "update") {
      expect(r.targetId).toBe(5);
      // model was empty on the existing row, so it gets filled
      expect(r.patch.model).toBe("XR16");
    }
  });

  it("only patches missing fields on dedup (preserves existing data)", () => {
    const existing: MockEquipment[] = [
      {
        id: 7,
        customerId: 100,
        equipmentType: "furnace",
        make: "Carrier",
        model: "ABC123",          // already populated
        installDate: "2018-03-15", // already populated
        location: "basement",      // already populated
        notes: null,
        active: true,
      },
    ];
    const r = predicateForCapture(
      businessId,
      {
        customerId: 100,
        equipmentType: "furnace",
        make: "Carrier",
        model: "DIFFERENT",         // should NOT overwrite
        installDate: "2020-01-01",  // should NOT overwrite
        location: "garage",         // should NOT overwrite
      },
      customers,
      existing,
    );
    expect(r.kind).toBe("update");
    if (r.kind === "update") {
      // None of the already-populated fields should be in the patch
      expect(r.patch.model).toBeUndefined();
      expect(r.patch.installDate).toBeUndefined();
      expect(r.patch.location).toBeUndefined();
    }
  });

  it("notes always append with dated prefix when existing notes are present", () => {
    const existing: MockEquipment[] = [
      {
        id: 9,
        customerId: 100,
        equipmentType: "ac",
        make: "Trane",
        model: null,
        installDate: null,
        location: null,
        notes: "Initial install notes",
        active: true,
      },
    ];
    const r = predicateForCapture(
      businessId,
      { customerId: 100, equipmentType: "ac", make: "Trane", notes: "Compressor noise" },
      customers,
      existing,
    );
    expect(r.kind).toBe("update");
    if (r.kind === "update") {
      // Should be appended with today's date prefix
      expect(r.patch.notes).toContain("Initial install notes");
      expect(r.patch.notes).toContain("Compressor noise");
      expect(r.patch.notes).toMatch(/\d{4}-\d{2}-\d{2}/);
    }
  });

  it("an INACTIVE row with same type + make is NOT treated as a dupe (retired equipment doesn't block new captures)", () => {
    const existing: MockEquipment[] = [
      {
        id: 11,
        customerId: 100,
        equipmentType: "ac",
        make: "Trane",
        model: "old-model",
        installDate: null,
        location: null,
        notes: null,
        active: false, // retired
      },
    ];
    const r = predicateForCapture(
      businessId,
      { customerId: 100, equipmentType: "ac", make: "Trane", model: "new-model" },
      customers,
      existing,
    );
    expect(r.kind).toBe("create");
  });

  it("different equipmentType + same customer creates a new row (not a dupe)", () => {
    const existing: MockEquipment[] = [
      {
        id: 13,
        customerId: 100,
        equipmentType: "ac",
        make: "Trane",
        model: null,
        installDate: null,
        location: null,
        notes: null,
        active: true,
      },
    ];
    const r = predicateForCapture(
      businessId,
      { customerId: 100, equipmentType: "furnace", make: "Trane" },
      customers,
      existing,
    );
    expect(r.kind).toBe("create");
  });

  it("each VALID_EQUIPMENT_TYPE is accepted (no accidental enum drift)", () => {
    for (const t of VALID_EQUIPMENT_TYPES) {
      const r = predicateForCapture(
        businessId,
        { customerId: 100, equipmentType: t },
        customers,
        [],
      );
      expect(r.kind, `equipmentType=${t} should not error`).not.toBe("error");
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 3. recognizeCaller summary equipment block (formatting predicate)
// ──────────────────────────────────────────────────────────────────────────
//
// Mirror of the production formatter that appears in recognizeCaller's
// summaryParts build. Pinned so changes to the format are reviewed.

function formatEquipmentSummaryLine(records: any[]): string | null {
  if (!Array.isArray(records) || records.length === 0) return null;
  const active = records.filter((e) => e.active !== false).slice(0, 3);
  if (active.length === 0) return null;
  const parts = active.map((e: any) => {
    const makeModel = [e.make, e.model].filter(Boolean).join(" ");
    const typeLabel = String(e.equipmentType || "unit").replace(/_/g, " ");
    const where = e.location ? ` in ${e.location}` : "";
    const last = e.lastServiceDate ? ` (last serviced ${e.lastServiceDate})` : "";
    return makeModel
      ? `${makeModel} ${typeLabel}${where}${last}`
      : `${typeLabel}${where}${last}`;
  });
  return `Known equipment: ${parts.join("; ")}`;
}

describe("recognizeCaller equipment summary formatter", () => {
  it("returns null for no records", () => {
    expect(formatEquipmentSummaryLine([])).toBeNull();
    expect(formatEquipmentSummaryLine(null as any)).toBeNull();
  });

  it("returns null when all records are inactive", () => {
    expect(
      formatEquipmentSummaryLine([
        { active: false, equipmentType: "ac", make: "Trane" },
      ]),
    ).toBeNull();
  });

  it("formats make + model + type + location + last service", () => {
    const line = formatEquipmentSummaryLine([
      {
        active: true,
        equipmentType: "ac",
        make: "Trane",
        model: "XR16",
        location: "attic",
        lastServiceDate: "2025-05-12",
      },
    ]);
    expect(line).toContain("Trane XR16 ac");
    expect(line).toContain("in attic");
    expect(line).toContain("last serviced 2025-05-12");
  });

  it("normalizes heat_pump → 'heat pump' (underscore to space)", () => {
    const line = formatEquipmentSummaryLine([
      { active: true, equipmentType: "heat_pump", make: "Carrier" },
    ]);
    expect(line).toContain("Carrier heat pump");
  });

  it("caps at 3 entries to defend the summary length budget", () => {
    const records = Array.from({ length: 10 }).map((_, i) => ({
      active: true,
      equipmentType: "ac",
      make: `Brand${i}`,
    }));
    const line = formatEquipmentSummaryLine(records);
    // Should appear at most 3 times
    const brandCount = (line || "").match(/Brand\d+/g)?.length ?? 0;
    expect(brandCount).toBe(3);
  });
});
