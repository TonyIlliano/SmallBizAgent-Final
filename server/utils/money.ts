/**
 * Money utilities for safe arithmetic on Drizzle `numeric` columns.
 *
 * PostgreSQL NUMERIC returns strings through Drizzle ORM to preserve
 * exact decimal precision. These helpers convert safely to numbers
 * for arithmetic while guarding against NaN/null/undefined.
 */

/**
 * Convert a numeric DB value (string | number | null | undefined) to a number.
 * Returns 0 for any falsy/unparseable input — safe for summation.
 */
export function toMoney(value: string | number | null | undefined): number {
  if (value == null) return 0;
  const n = typeof value === 'string' ? parseFloat(value) : value;
  return Number.isFinite(n) ? n : 0;
}

/**
 * Round to 2 decimal places using banker's rounding (half-even).
 * Avoids the classic floating-point issue where 0.1 + 0.2 = 0.30000000000000004.
 */
export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Format a number as a dollar string: "$123.45"
 */
export function formatUSD(value: string | number | null | undefined): string {
  return `$${toMoney(value).toFixed(2)}`;
}

/**
 * Coerce numeric money fields in a request body to strings for Drizzle NUMERIC columns.
 * JSON request bodies send numbers (e.g., `price: 25.0`) but Drizzle's `numeric` type
 * expects strings. This converts known money fields in-place.
 */
const MONEY_FIELDS = ['price', 'amount', 'tax', 'total', 'unitPrice', 'unit_price', 'overageRate', 'overageAmount', 'invoiceAmount', 'invoiceTax'];

export function coerceMoneyFields<T extends Record<string, unknown>>(obj: T): T {
  const result = { ...obj };
  for (const field of MONEY_FIELDS) {
    if (field in result && typeof result[field] === 'number') {
      (result as any)[field] = String(result[field]);
    }
  }
  return result;
}
