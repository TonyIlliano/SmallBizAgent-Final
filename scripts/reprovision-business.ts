/**
 * One-time script to re-provision a business with a specific phone number.
 *
 * Usage:
 *   npx tsx scripts/reprovision-business.ts
 *
 * This script will:
 * 1. Find the admin user's business
 * 2. Purchase the specific phone number (+17659463854) from Twilio
 * 3. Create a new Vapi assistant
 * 4. Link them together
 * 5. Re-enable the AI receptionist
 * 6. Reset subscription status to 'trialing' (or 'active' if subscribed)
 */

import 'dotenv/config';
import pg from 'pg';

const TARGET_PHONE_NUMBER = '+17659463854'; // (765) 946-3854

async function main() {
  console.log('=== Re-Provisioning Business ===\n');

  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  try {
    // 1. Find admin user's business
    const adminResult = await pool.query(
      `SELECT id, username, business_id FROM users WHERE role = 'admin' LIMIT 1`
    );

    if (adminResult.rows.length === 0 || !adminResult.rows[0].business_id) {
      console.error('No admin user found or admin has no business');
      process.exit(1);
    }

    const adminUser = adminResult.rows[0];
    const businessId = adminUser.business_id;
    console.log(`Found admin user: ${adminUser.username} (business ID: ${businessId})`);

    // 2. Check current business state
    const bizResult = await pool.query(
      `SELECT id, name, subscription_status, twilio_phone_number, twilio_phone_number_sid,
              retell_agent_id, receptionist_enabled FROM businesses WHERE id = $1`,
      [businessId]
    );

    if (bizResult.rows.length === 0) {
      console.error(`Business ${businessId} not found`);
      process.exit(1);
    }

    const business = bizResult.rows[0];
    console.log(`Business: ${business.name}`);
    console.log(`Current status: ${business.subscription_status}`);
    console.log(`Current phone: ${business.twilio_phone_number || 'none'}`);
    console.log(`Current phone SID: ${business.twilio_phone_number_sid || 'none'}`);
    console.log(`Current Retell agent: ${business.retell_agent_id || 'none'}`);
    console.log(`Receptionist enabled: ${business.receptionist_enabled}`);
    console.log('');

    if (business.twilio_phone_number_sid && business.retell_agent_id) {
      console.log('Business already has a phone number and Retell agent.');
      console.log('Skipping provisioning. If you want to re-provision, deprovision first.');
      process.exit(0);
    }

    // 3. Run migration for onboarding_progress column first (if missing)
    try {
      await pool.query(`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_progress JSONB;
      `);
      console.log('Migration: onboarding_progress column ensured');
    } catch (err) {
      console.warn('Migration note:', err);
    }

    // 4. Provision with the specific phone number using the provisioning service
    console.log(`\nProvisioning with phone number: ${TARGET_PHONE_NUMBER}`);
    console.log('');

    const { provisionBusiness } = await import('../server/services/businessProvisioningService');

    const result = await provisionBusiness(businessId, {
      specificPhoneNumber: TARGET_PHONE_NUMBER,
    });

    console.log('\n=== Provisioning Result ===');
    console.log(`Success: ${result.success}`);
    console.log(`Twilio provisioned: ${result.twilioProvisioned}`);
    console.log(`Phone number: ${result.twilioPhoneNumber || 'none'}`);
    console.log(`Retell provisioned: ${result.retellProvisioned}`);
    console.log(`Retell agent ID: ${result.retellAgentId || 'none'}`);

    if (!result.success) {
      console.error('\nProvisioning failed!');
      console.error('Twilio error:', result.twilioError);
      console.error('Retell error:', result.retellError);
      process.exit(1);
    }

    // 5. Re-enable receptionist and fix status using raw SQL
    console.log('\nRe-enabling receptionist...');
    await pool.query(
      `UPDATE businesses SET receptionist_enabled = true, subscription_status = 'trialing', updated_at = NOW() WHERE id = $1`,
      [businessId]
    );

    console.log('\n=== Done! ===');
    console.log(`Business ${businessId} (${business.name}) has been re-provisioned.`);
    console.log(`Phone: ${TARGET_PHONE_NUMBER}`);
    console.log('AI receptionist: ENABLED');
    console.log('Status: trialing');

  } catch (error) {
    console.error('Error during provisioning:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
