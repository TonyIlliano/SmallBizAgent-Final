/**
 * Migration: Add Retell AI columns to businesses and business_phone_numbers tables.
 *
 * Part of the Vapi → Retell AI migration.
 * Adds retell_agent_id, retell_llm_id, retell_phone_number_id columns.
 */

import { Pool } from 'pg';

export async function migrateVapiToRetell(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    console.log('[Migration] Adding Retell AI columns...');

    // Add Retell columns to businesses table
    await client.query(`
      ALTER TABLE businesses ADD COLUMN IF NOT EXISTS retell_agent_id TEXT;
    `);
    await client.query(`
      ALTER TABLE businesses ADD COLUMN IF NOT EXISTS retell_llm_id TEXT;
    `);
    await client.query(`
      ALTER TABLE businesses ADD COLUMN IF NOT EXISTS retell_phone_number_id TEXT;
    `);

    // Add Retell column to business_phone_numbers table
    await client.query(`
      ALTER TABLE business_phone_numbers ADD COLUMN IF NOT EXISTS retell_phone_number_id TEXT;
    `);

    // Add index for looking up businesses by retell_agent_id (used in webhook handler)
    await client.query(`
      CREATE INDEX IF NOT EXISTS businesses_retell_agent_idx ON businesses (retell_agent_id) WHERE retell_agent_id IS NOT NULL;
    `);

    console.log('[Migration] Retell AI columns added successfully.');
  } finally {
    client.release();
  }
}
