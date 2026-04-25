/**
 * Business Provisioning Service
 * 
 * This service handles the provisioning of resources for new businesses
 * including Twilio phone numbers and virtual receptionist setup.
 */

import { Business, businessPhoneNumbers } from '@shared/schema';
import { storage } from '../storage';
import { db } from '../db';
import { eq } from 'drizzle-orm';
import twilioProvisioningService from './twilioProvisioningService';
import retellProvisioningService from './retellProvisioningService';
import twilioService from './twilioService';
import { sendCallForwardingDeactivationEmail } from '../emailService';

/**
 * Provision resources for a new business
 * 
 * @param businessId The ID of the business to provision
 * @param options Optional provisioning options
 * @returns The provisioning result
 */
export async function provisionBusiness(
  businessId: number,
  options?: {
    preferredAreaCode?: string,
    specificPhoneNumber?: string,
    skipTwilioProvisioning?: boolean
  }
) {
  try {
    console.log(`Provisioning resources for business ID ${businessId}...`);

    // Get the business
    const business = await storage.getBusiness(businessId);
    if (!business) {
      throw new Error(`Business with ID ${businessId} not found`);
    }

    // Mark provisioning as in_progress
    await storage.updateBusiness(businessId, {
      provisioningStatus: 'in_progress'
    });
    
    const results: any = {
      businessId,
      success: true,
      twilioProvisioned: false,
      retellProvisioned: false,
      virtualReceptionistConfigured: false,
      businessHoursConfigured: false,
      servicesConfigured: false
    };
    
    // 1. Provision a Twilio phone number if not skipped
    console.log(`[Provisioning] Business ${businessId}: Starting Twilio provisioning. skipTwilioProvisioning=${options?.skipTwilioProvisioning}`);
    console.log(`[Provisioning] Business ${businessId}: Current business phone: ${business.twilioPhoneNumber || 'none'}`);

    // Check if business already has a phone number
    if (business.twilioPhoneNumber) {
      console.log(`[Provisioning] Business ${businessId}: Already has phone number ${business.twilioPhoneNumber}, skipping Twilio provisioning`);
      results.twilioProvisioned = true;
      results.twilioPhoneNumber = business.twilioPhoneNumber;
      results.twilioAlreadyProvisioned = true;
    } else if (!options?.skipTwilioProvisioning) {
      try {
        // Check if Twilio has valid credentials
        if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
          console.warn('[Provisioning] Twilio credentials not set, skipping phone number provisioning');
          results.twilioProvisioned = false;
          results.twilioProvisioningSkipped = true;
        } else {
          let phoneNumber;
          if (options?.specificPhoneNumber) {
            // User selected a specific phone number
            console.log(`[Provisioning] Business ${businessId}: Provisioning SPECIFIC phone number ${options.specificPhoneNumber}...`);
            phoneNumber = await twilioProvisioningService.provisionSpecificPhoneNumber(
              businessId,
              options.specificPhoneNumber
            );
          } else {
            // Auto-search for a number in the preferred area code
            console.log(`[Provisioning] Business ${businessId}: Provisioning NEW Twilio phone number...`);
            phoneNumber = await twilioProvisioningService.provisionPhoneNumber(
              business,
              options?.preferredAreaCode
            );
          }
          console.log(`[Provisioning] Business ${businessId}: Got phone number ${phoneNumber.phoneNumber} (SID: ${phoneNumber.phoneNumberSid})`);

          // Update the business with the new phone number
          await storage.updateBusiness(businessId, {
            twilioPhoneNumber: phoneNumber.phoneNumber,
            twilioPhoneNumberSid: phoneNumber.phoneNumberSid,
            twilioPhoneNumberStatus: 'active',
            twilioDateProvisioned: new Date(),
          });

          // Also insert into business_phone_numbers for multi-line support
          await db.insert(businessPhoneNumbers).values({
            businessId,
            twilioPhoneNumber: phoneNumber.phoneNumber,
            twilioPhoneNumberSid: phoneNumber.phoneNumberSid,
            label: 'Main Line',
            isPrimary: true,
            status: 'active',
            dateProvisioned: new Date(),
          });

          results.twilioProvisioned = true;
          results.twilioPhoneNumber = phoneNumber.phoneNumber;
        }
      } catch (error) {
        console.error(`[Provisioning] Business ${businessId}: Error provisioning Twilio phone number:`, error);
        results.twilioProvisioned = false;
        results.twilioError = error instanceof Error ? error.message : String(error);
      }
    } else {
      console.log(`[Provisioning] Business ${businessId}: Twilio provisioning skipped by option`);
    }
    
    // 2. Create default virtual receptionist configuration
    try {
      const existingConfig = await storage.getReceptionistConfig(businessId);
      if (!existingConfig) {
        const receptionistConfig = await storage.createReceptionistConfig({
          businessId,
          greeting: `Hi, thanks for calling ${business.name}! Just so you know, this call may be recorded to make sure we're giving you the best service possible. How can I help you today?`,
          afterHoursMessage: `Thank you for calling ${business.name}. Our office is currently closed. If this is an emergency, please say 'emergency' to be connected with our on-call staff. Otherwise, I'd be happy to schedule an appointment for you.`,
          emergencyKeywords: ['emergency', 'urgent', 'immediately', 'critical', 'asap'],
          voicemailEnabled: true,
          callRecordingEnabled: false,
          transcriptionEnabled: true,
          maxCallLengthMinutes: 15,
          transferPhoneNumbers: business.phone ? [business.phone] : []
        });
        
        results.virtualReceptionistConfigured = true;
        results.receptionistConfig = receptionistConfig;
      } else {
        results.virtualReceptionistConfigured = true;
        results.receptionistConfigExists = true;
      }
    } catch (error) {
      console.error('Error configuring virtual receptionist:', error);
      results.virtualReceptionistConfigured = false;
      results.virtualReceptionistError = error instanceof Error ? error.message : String(error);
    }
    
    // 3. Check business hours status (but don't create defaults - business owner must configure)
    try {
      const existingHours = await storage.getBusinessHours(businessId);
      if (existingHours.length === 0) {
        // Don't create default hours - the business owner needs to set their actual hours
        // The AI will gracefully handle missing hours by offering to take callback info
        results.businessHoursConfigured = false;
        results.businessHoursNote = 'Business hours not configured - owner should set up in Settings';
        console.log(`Business ${businessId}: No hours configured. AI will offer callbacks until hours are set.`);
      } else {
        results.businessHoursConfigured = true;
        results.businessHoursExist = true;
      }
    } catch (error) {
      console.error('Error checking business hours:', error);
      results.businessHoursConfigured = false;
      results.businessHoursError = error instanceof Error ? error.message : String(error);
    }

    // 4. Check services status (but don't create fake defaults - business owner must configure)
    try {
      const existingServices = await storage.getServices(businessId);
      if (existingServices.length === 0) {
        // Don't create default services with fake prices - that would confuse customers
        // The AI will gracefully handle missing services by offering general appointments
        results.servicesConfigured = false;
        results.servicesNote = 'Services not configured - owner should add their services in Settings';
        console.log(`Business ${businessId}: No services configured. AI will offer general appointments.`);
      } else {
        results.servicesConfigured = true;
        results.servicesExist = true;
      }
    } catch (error) {
      console.error('Error checking services:', error);
      results.servicesConfigured = false;
      results.servicesError = error instanceof Error ? error.message : String(error);
    }

    // 5. Provision Retell AI Receptionist
    console.log(`[Provisioning] Business ${businessId}: Starting Retell AI provisioning...`);
    try {
      if (process.env.RETELL_API_KEY) {
        const retellResult = await retellProvisioningService.provisionRetellForBusiness(businessId);
        console.log(`[Provisioning] Business ${businessId}: Retell result:`, JSON.stringify(retellResult));
        results.retellProvisioned = retellResult.success;
        results.retellAgentId = retellResult.agentId;
        results.retellPhoneConnected = retellResult.phoneConnected;
        if (retellResult.error) {
          results.retellError = retellResult.error;
        }
      } else {
        console.warn('[Provisioning] Retell API key not set, skipping AI receptionist provisioning');
        results.retellProvisioned = false;
        results.retellSkipped = true;
      }
    } catch (error) {
      console.error(`[Provisioning] Business ${businessId}: Error provisioning Retell AI receptionist:`, error);
      results.retellProvisioned = false;
      results.retellError = error instanceof Error ? error.message : String(error);
    }

    // ── Rollback on partial failure: release orphaned Twilio number ─────
    // If Twilio succeeded but Retell failed AND we just provisioned a NEW number
    // (not a pre-existing one), release the number to prevent paying $1/mo rent
    // on a dead line and to let the user cleanly retry. We do NOT release if the
    // number was already provisioned before this run (results.twilioAlreadyProvisioned)
    // — that would be destructive to existing setups.
    if (
      results.twilioProvisioned &&
      !results.retellProvisioned &&
      !results.twilioAlreadyProvisioned &&
      !results.retellSkipped // don't release if Retell was skipped intentionally (e.g., no API key in dev)
    ) {
      console.warn(`[Provisioning] Business ${businessId}: Retell failed after Twilio succeeded — releasing orphaned phone number to prevent leak`);
      try {
        await twilioProvisioningService.releasePhoneNumber(businessId);
        await storage.updateBusiness(businessId, {
          twilioPhoneNumber: null,
          twilioPhoneNumberSid: null,
          twilioPhoneNumberStatus: 'released',
          twilioDateProvisioned: null,
        });
        // Also clean up business_phone_numbers row(s) we just inserted
        await db.delete(businessPhoneNumbers).where(eq(businessPhoneNumbers.businessId, businessId));
        results.twilioRolledBack = true;
        // Reset twilioProvisioned flag — we no longer have a phone number
        results.twilioProvisioned = false;
        results.twilioPhoneNumber = null;
        console.log(`[Provisioning] Business ${businessId}: Rolled back Twilio provisioning successfully`);
      } catch (rollbackErr) {
        console.error(`[Provisioning] Business ${businessId}: ROLLBACK FAILED — orphaned phone number left in place:`, rollbackErr);
        results.twilioRollbackFailed = true;
        results.twilioRollbackError = rollbackErr instanceof Error ? rollbackErr.message : String(rollbackErr);
      }
    }

    console.log(`Provisioning completed for business ID ${businessId}`);

    // Enable all SMS automation agents by default
    try {
      const agentTypes = ['follow_up', 'no_show', 'estimate_follow_up', 'rebooking', 'review_response'];
      for (const agentType of agentTypes) {
        await storage.upsertAgentSettings(businessId, agentType, true, null);
      }
      console.log(`[Provisioning] Business ${businessId}: All ${agentTypes.length} agents enabled by default`);
    } catch (agentErr) {
      console.error(`[Provisioning] Business ${businessId}: Failed to enable default agents:`, agentErr);
    }

    // Determine actual success based on provisioning outcomes
    results.success = results.twilioProvisioned && results.retellProvisioned;

    // Store provisioning results in database
    const finalStatus = results.success ? 'completed' : 'failed';
    await storage.updateBusiness(businessId, {
      provisioningStatus: finalStatus,
      provisioningResult: JSON.stringify(results),
      provisioningCompletedAt: new Date()
    });

    // Notify admin on provisioning failure
    if (!results.success) {
      try {
        const { sendAdminAlert } = await import('./adminAlertService');
        await sendAdminAlert({
          type: 'provisioning_failed',
          severity: 'high',
          title: `Provisioning Failed: ${business?.name || `Business #${businessId}`}`,
          details: { businessId, businessName: business?.name || 'Unknown', twilioOk: results.twilioProvisioned, retellOk: results.retellProvisioned, twilioError: results.twilioError || 'none', retellError: results.retellError || 'none' },
        });
      } catch (alertErr) {
        console.error('[Provisioning] Admin alert failed:', alertErr);
      }
    }

    return results;
  } catch (error) {
    console.error(`Error provisioning business ID ${businessId}:`, error);

    // Store failure status in database
    await storage.updateBusiness(businessId, {
      provisioningStatus: 'failed',
      provisioningResult: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      provisioningCompletedAt: new Date()
    }).catch(updateErr => console.error('Failed to update provisioning status:', updateErr));

    throw error;
  }
}

/**
 * Deprovision resources for a business that is being deleted or deactivated
 * 
 * @param businessId The ID of the business to deprovision
 * @returns The deprovisioning result
 */
export async function deprovisionBusiness(businessId: number) {
  try {
    console.log(`Deprovisioning resources for business ID ${businessId}...`);
    
    // Get the business
    const business = await storage.getBusiness(businessId);
    if (!business) {
      throw new Error(`Business with ID ${businessId} not found`);
    }
    
    const results: any = {
      businessId,
      success: true,
      twilioDeprovisioned: false,
      retellDeprovisioned: false
    };

    // Remove Retell AI agent if one exists
    try {
      const retellResult = await retellProvisioningService.removeRetellAgent(businessId);
      results.retellDeprovisioned = retellResult.success;
      if (retellResult.error) {
        results.retellError = retellResult.error;
      }
    } catch (error) {
      console.error('Error removing Retell agent:', error);
      results.retellDeprovisioned = false;
      results.retellError = error instanceof Error ? error.message : String(error);
    }

    // Call forwarding safety net: notify business owner BEFORE releasing the number
    if (business.callForwardingEnabled && business.twilioPhoneNumber) {
      const reason = determineDeprovisioningReason(business);

      // Send SMS warning to business owner's phone
      if (business.phone) {
        try {
          const smsBody = `URGENT from SmallBizAgent: Your AI receptionist number ` +
            `(${business.twilioPhoneNumber}) is being deactivated. ` +
            `If you set up call forwarding, dial *73 NOW from your business phone ` +
            `to restore direct calls. Without this, callers will hear "number not in service."`;
          await twilioService.sendSms(business.phone, smsBody);
          await storage.createNotificationLog({
            businessId,
            type: 'call_forwarding_deactivation',
            channel: 'sms',
            recipient: business.phone,
            message: smsBody,
            status: 'sent',
            referenceType: 'business',
            referenceId: businessId,
          });
          results.callForwardingSmsNotified = true;
          console.log(`[Deprovision] Call forwarding SMS sent to business ${businessId}`);
        } catch (err) {
          console.error(`[Deprovision] Failed to send call forwarding SMS for business ${businessId}:`, err);
          await storage.createNotificationLog({
            businessId,
            type: 'call_forwarding_deactivation',
            channel: 'sms',
            recipient: business.phone || '',
            status: 'failed',
            referenceType: 'business',
            referenceId: businessId,
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        }
      }

      // Send email warning to business owner
      if (business.email) {
        try {
          await sendCallForwardingDeactivationEmail(
            business.email,
            business.name,
            business.twilioPhoneNumber,
            reason
          );
          await storage.createNotificationLog({
            businessId,
            type: 'call_forwarding_deactivation',
            channel: 'email',
            recipient: business.email,
            subject: `ACTION REQUIRED: Restore phone service for ${business.name}`,
            status: 'sent',
            referenceType: 'business',
            referenceId: businessId,
          });
          results.callForwardingEmailNotified = true;
          console.log(`[Deprovision] Call forwarding email sent to business ${businessId}`);
        } catch (err) {
          console.error(`[Deprovision] Failed to send call forwarding email for business ${businessId}:`, err);
          await storage.createNotificationLog({
            businessId,
            type: 'call_forwarding_deactivation',
            channel: 'email',
            recipient: business.email || '',
            status: 'failed',
            referenceType: 'business',
            referenceId: businessId,
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        }
      }
    }

    // Release ALL phone numbers from business_phone_numbers for this business
    try {
      const allPhoneNumbers = await db.select().from(businessPhoneNumbers)
        .where(eq(businessPhoneNumbers.businessId, businessId));

      for (const phoneRecord of allPhoneNumbers) {
        try {
          await twilioProvisioningService.releaseSpecificPhoneNumber(phoneRecord.id);
          console.log(`[Deprovision] Released additional phone ${phoneRecord.twilioPhoneNumber} (record ${phoneRecord.id})`);
        } catch (phoneErr) {
          console.error(`[Deprovision] Failed to release phone record ${phoneRecord.id}:`, phoneErr);
        }
      }
      results.additionalPhonesReleased = allPhoneNumbers.length;
    } catch (error) {
      console.error(`[Deprovision] Error releasing additional phone numbers for business ${businessId}:`, error);
      results.additionalPhonesError = error instanceof Error ? error.message : String(error);
    }

    // Release Twilio phone number if one exists (legacy single-number path)
    if (business.twilioPhoneNumberSid) {
      try {
        const releaseResult = await twilioProvisioningService.releasePhoneNumber(
          businessId
        );

        // Update the business record
        await storage.updateBusiness(businessId, {
          twilioPhoneNumber: null,
          twilioPhoneNumberSid: null,
          twilioPhoneNumberStatus: 'released',
          twilioDateProvisioned: null
        });

        results.twilioDeprovisioned = true;
        results.twilioReleaseResult = releaseResult;
      } catch (error) {
        console.error('Error releasing Twilio phone number:', error);
        results.twilioDeprovisioned = false;
        results.twilioError = error instanceof Error ? error.message : String(error);
      }
    } else {
      results.twilioDeprovisioned = true;
      results.twilioNoNumberToRelease = true;
    }
    
    // Note: We're not deleting other resources like business hours, services, etc.
    // since those might want to be preserved if the business is reactivated later
    
    console.log(`Deprovisioning completed for business ID ${businessId}`);
    return results;
  } catch (error) {
    console.error(`Error deprovisioning business ID ${businessId}:`, error);
    throw error;
  }
}

/**
 * Determine why a business is being deprovisioned
 */
function determineDeprovisioningReason(business: Business): 'trial_expired' | 'subscription_canceled' | 'payment_failed' {
  if (business.trialEndsAt && new Date(business.trialEndsAt) <= new Date()) {
    return 'trial_expired';
  }
  if (business.subscriptionStatus === 'canceled') {
    return 'subscription_canceled';
  }
  return 'payment_failed';
}

export default {
  provisionBusiness,
  deprovisionBusiness
};