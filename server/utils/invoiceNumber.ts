import { pool } from '../db';

/**
 * Generate the next sequential invoice number for a business.
 * Uses PostgreSQL row-level locking to guarantee uniqueness under concurrency.
 *
 * Format: INV-YYYYMMDD-XXXX (e.g., INV-20260414-0042)
 *
 * The sequence counter is per-business and persisted in the invoice_sequences table.
 * Falls back to timestamp-based if the table doesn't exist yet (pre-migration).
 */
export async function generateInvoiceNumber(businessId: number): Promise<string> {
  const today = new Date();
  const dateStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;

  try {
    // Upsert sequence row, then atomically increment and return the new number.
    // FOR UPDATE locks the row so concurrent calls wait, preventing duplicates.
    const result = await pool.query(
      `INSERT INTO invoice_sequences (business_id, last_number)
       VALUES ($1, 1)
       ON CONFLICT (business_id) DO UPDATE SET last_number = invoice_sequences.last_number + 1
       RETURNING last_number`,
      [businessId]
    );
    const seq = result.rows[0].last_number;
    return `INV-${dateStr}-${String(seq).padStart(4, '0')}`;
  } catch (err: any) {
    // Table doesn't exist yet (pre-migration) — use timestamp fallback
    if (err.code === '42P01') {
      return `INV-${dateStr}-${Date.now().toString(36).toUpperCase()}`;
    }
    throw err;
  }
}
