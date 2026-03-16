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

import { db } from '../server/db';
import { businesses, users } from '../shared/schema';
import { eq } from 'drizzle-orm';

const TARGET_PHONE_NUMBER = '+17659463854'; // (765) 946-3854

async function main() {
  console.log('=== Re-Provisioning Business ===\n');

  // 1. Find admin user's business
  const [adminUser] = await db.select()
    .from(users)
    .where(eq(users.role, 'admin'));

  if (!adminUser || !adminUser.businessId) {
    console.error('No admin user found or admin has no business');
    process.exit(1);
  }

  const businessId = adminUser.businessId;
  console.log(`Found admin user: ${adminUser.username} (business ID: ${businessId})`);

  // 2. Check current business state
  const [business] = await db.select()
    .from(businesses)
    .where(eq(businesses.id, businessId));

  if (!business) {
    console.error(`Business ${businessId} not found`);
    process.exit(1);
  }

  console.log(`Business: ${business.name}`);
  console.log(`Current status: ${business.subscriptionStatus}`);
  console.log(`Current phone: ${business.twilioPhoneNumber || 'none'}`);
  console.log(`Current phone SID: ${business.twilioPhoneNumberSid || 'none'}`);
  console.log(`Current Vapi assistant: ${business.vapiAssistantId || 'none'}`);
  console.log(`Receptionist enabled: ${business.receptionistEnabled}`);
  console.log('');

  if (business.twilioPhoneNumberSid && business.vapiAssistantId) {
    console.log('Business already has a phone number and Vapi assistant.');
    console.log('Skipping provisioning. If you want to re-provision, deprovision first.');
    process.exit(0);
  }

  // 3. Provision with the specific phone number
  console.log(`Provisioning with phone number: ${TARGET_PHONE_NUMBER}`);
  console.log('');

  try {
    const { provisionBusiness } = await import('../server/services/businessProvisioningService');

    const result = await provisionBusiness(businessId, {
      specificPhoneNumber: TARGET_PHONE_NUMBER,
    });

    console.log('\n=== Provisioning Result ===');
    console.log(`Success: ${result.success}`);
    console.log(`Twilio provisioned: ${result.twilioProvisioned}`);
    console.log(`Phone number: ${result.twilioPhoneNumber || 'none'}`);
    console.log(`Vapi provisioned: ${result.vapiProvisioned}`);
    console.log(`Vapi assistant ID: ${result.vapiAssistantId || 'none'}`);

    if (!result.success) {
      console.error('\nProvisioning failed!');
      console.error('Twilio error:', result.twilioError);
      console.error('Vapi error:', result.vapiError);
      process.exit(1);
    }

    // 4. Re-enable receptionist and fix status
    console.log('\nRe-enabling receptionist...');
    await db.update(businesses)
      .set({
        receptionistEnabled: true,
        subscriptionStatus: 'trialing', // Restore to trialing
        updatedAt: new Date(),
      })
      .where(eq(businesses.id, businessId));

    console.log('\n=== Done! ===');
    console.log(`Business ${businessId} (${business.name}) has been re-provisioned.`);
    console.log(`Phone: ${TARGET_PHONE_NUMBER}`);
    console.log('AI receptionist: ENABLED');
    console.log('Status: trialing');
  } catch (error) {
    console.error('Error during provisioning:', error);
    process.exit(1);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
