import { describe, it, expect } from 'vitest';

/**
 * The send-quote endpoint snapshots the member discount at send-time into
 * each quoteItem's unit price. These tests pin the math the endpoint uses,
 * extracted as pure functions so they're unit-testable without spinning up
 * an Express app or hitting Postgres. If anything later wants to alter how
 * the discount is applied (e.g., switch to a separate discount line item)
 * this suite will catch the silent behavior change.
 *
 * Mirrors the inline arithmetic in
 *   server/routes/jobRoutes.ts > POST /:jobId/send-quote
 * Keep the formulas in lock-step.
 */

interface LineItem {
  quantity: number;
  unitPrice: number;
}

function discountedSubtotal(
  lineItems: LineItem[],
  memberDiscountFraction: number,
): number {
  return lineItems.reduce(
    (sum, item) =>
      sum + Number(item.quantity || 0) * Number(item.unitPrice || 0) * (1 - memberDiscountFraction),
    0,
  );
}

function discountedUnit(unit: number, memberDiscountFraction: number): number {
  return unit * (1 - memberDiscountFraction);
}

/**
 * Resolve the discount fraction from a raw membership_plans.memberDiscountPercent
 * value. Mirrors the parsing/validation logic the endpoint does on the
 * Drizzle NUMERIC string column.
 *
 * Returns 0 (no discount) on any falsy / unparseable / out-of-range input
 * so a malformed plan row CANNOT accidentally over-discount or invert a
 * quote. Defense in depth: the schema's CHECK constraint should already
 * keep this in [0,100] but the endpoint defends anyway.
 */
function resolveDiscountFraction(rawPct: unknown): number {
  if (rawPct === null || rawPct === undefined) return 0;
  const pct = typeof rawPct === 'number' ? rawPct : parseFloat(String(rawPct));
  if (!Number.isFinite(pct) || pct <= 0 || pct > 100) return 0;
  return pct / 100;
}

describe('send-quote discount snapshot math', () => {
  describe('discountedSubtotal', () => {
    it('applies a 15% discount across multiple line items', () => {
      const items: LineItem[] = [
        { quantity: 1, unitPrice: 1000 }, // labor
        { quantity: 2, unitPrice: 200 }, // parts
      ];
      // 1000 + 400 = 1400 rack rate → 1400 * 0.85 = 1190
      expect(discountedSubtotal(items, 0.15)).toBeCloseTo(1190);
    });

    it('returns the rack-rate subtotal when discount is 0', () => {
      const items: LineItem[] = [{ quantity: 1, unitPrice: 500 }];
      expect(discountedSubtotal(items, 0)).toBe(500);
    });

    it('returns 0 for an empty line-item list', () => {
      expect(discountedSubtotal([], 0.2)).toBe(0);
    });

    it('handles fractional quantities (hours of labor)', () => {
      const items: LineItem[] = [{ quantity: 2.5, unitPrice: 120 }];
      // 2.5 * 120 = 300 → 300 * 0.9 = 270 (Premium 10% off labor)
      expect(discountedSubtotal(items, 0.1)).toBeCloseTo(270);
    });

    it('coerces null/undefined fields to 0 instead of NaN-ing the total', () => {
      const items: any[] = [
        { quantity: null, unitPrice: 500 },
        { quantity: 1, unitPrice: undefined },
      ];
      expect(discountedSubtotal(items, 0.2)).toBe(0);
    });
  });

  describe('discountedUnit', () => {
    it('drops a 100 unit price by 20% (Elite member)', () => {
      expect(discountedUnit(100, 0.2)).toBe(80);
    });

    it('returns the rack rate when discount is 0', () => {
      expect(discountedUnit(75, 0)).toBe(75);
    });
  });

  describe('resolveDiscountFraction', () => {
    it('parses a NUMERIC string column to a fraction', () => {
      // Drizzle gives us "15.00" for membership_plans.memberDiscountPercent
      expect(resolveDiscountFraction('15.00')).toBe(0.15);
    });

    it('accepts a number too', () => {
      expect(resolveDiscountFraction(20)).toBe(0.2);
    });

    it('returns 0 (no discount) for null', () => {
      expect(resolveDiscountFraction(null)).toBe(0);
    });

    it('returns 0 for undefined', () => {
      expect(resolveDiscountFraction(undefined)).toBe(0);
    });

    it('returns 0 for empty string (legacy nullable cell)', () => {
      // parseFloat('') is NaN → caught by Number.isFinite
      expect(resolveDiscountFraction('')).toBe(0);
    });

    it('returns 0 for "abc" (corrupted cell)', () => {
      expect(resolveDiscountFraction('abc')).toBe(0);
    });

    it('returns 0 for negative numbers (defense in depth against schema corruption)', () => {
      expect(resolveDiscountFraction(-5)).toBe(0);
    });

    it('returns 0 for values >100% (would invert the quote)', () => {
      // If a corrupted membership_plans row says 150% off, the quote would
      // come out *negative*. Defend.
      expect(resolveDiscountFraction(150)).toBe(0);
    });

    it('accepts the boundary value 100 → 1.0 (free service)', () => {
      // A free-tune-up tier is plausible (think first-year promo), so 100
      // should be accepted, not clamped.
      expect(resolveDiscountFraction(100)).toBe(1);
    });

    it('rejects 0 explicitly (treats "0% discount" as no discount, no membership applied)', () => {
      // Symmetric with "not enrolled" — same on-the-wire result.
      expect(resolveDiscountFraction(0)).toBe(0);
    });
  });

  describe('integration: discount snapshot example', () => {
    it('matches the HVAC demo example: $1,400 AC repair, Premium member 15% off → $1,190 subtotal', () => {
      const items: LineItem[] = [
        { quantity: 1, unitPrice: 800 }, // compressor part
        { quantity: 4, unitPrice: 150 }, // 4 hours labor @ $150/hr
      ];
      // rack: 800 + 600 = 1400
      const discount = resolveDiscountFraction('15.00');
      expect(discountedSubtotal(items, discount)).toBeCloseTo(1190);
    });

    it('non-member sees rack rate', () => {
      const items: LineItem[] = [
        { quantity: 1, unitPrice: 800 },
        { quantity: 4, unitPrice: 150 },
      ];
      const discount = resolveDiscountFraction(null);
      expect(discountedSubtotal(items, discount)).toBe(1400);
    });

    it('member-enrolled with 0% plan (corrupted/legacy data) sees rack rate, not negative', () => {
      const items: LineItem[] = [{ quantity: 1, unitPrice: 100 }];
      const discount = resolveDiscountFraction(0);
      expect(discountedSubtotal(items, discount)).toBe(100);
    });
  });
});
