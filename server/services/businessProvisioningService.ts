/**
 * Business Provisioning Service
 * 
 * This service handles the provisioning of resources for new businesses
 * including Twilio phone numbers and virtual receptionist setup.
 */

import { Business } from '@shared/schema';
import { storage } from '../storage';
import twilioProvisioningService from './twilioProvisioningService';
import vapiProvisioningService from './vapiProvisioningService';

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
      vapiProvisioned: false,
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
          greeting: `Thank you for calling ${business.name}. How may I help you today?`,
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

    // 5. Provision Vapi AI Receptionist
    console.log(`[Provisioning] Business ${businessId}: Starting Vapi provisioning...`);
    try {
      if (process.env.VAPI_API_KEY) {
        const vapiResult = await vapiProvisioningService.provisionVapiForBusiness(businessId);
        console.log(`[Provisioning] Business ${businessId}: Vapi result:`, JSON.stringify(vapiResult));
        results.vapiProvisioned = vapiResult.success;
        results.vapiAssistantId = vapiResult.assistantId;
        results.vapiPhoneConnected = vapiResult.phoneConnected;
        if (vapiResult.error) {
          results.vapiError = vapiResult.error;
        }
      } else {
        console.warn('[Provisioning] Vapi API key not set, skipping AI receptionist provisioning');
        results.vapiProvisioned = false;
        results.vapiSkipped = true;
      }
    } catch (error) {
      console.error(`[Provisioning] Business ${businessId}: Error provisioning Vapi AI receptionist:`, error);
      results.vapiProvisioned = false;
      results.vapiError = error instanceof Error ? error.message : String(error);
    }

    console.log(`Provisioning completed for business ID ${businessId}`);

    // Store provisioning results in database
    const finalStatus = results.success ? 'completed' : 'failed';
    await storage.updateBusiness(businessId, {
      provisioningStatus: finalStatus,
      provisioningResult: JSON.stringify(results),
      provisioningCompletedAt: new Date()
    });

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
      vapiDeprovisioned: false
    };

    // Remove Vapi assistant if one exists
    try {
      const vapiResult = await vapiProvisioningService.removeVapiAssistant(businessId);
      results.vapiDeprovisioned = vapiResult.success;
      if (vapiResult.error) {
        results.vapiError = vapiResult.error;
      }
    } catch (error) {
      console.error('Error removing Vapi assistant:', error);
      results.vapiDeprovisioned = false;
      results.vapiError = error instanceof Error ? error.message : String(error);
    }

    // Release Twilio phone number if one exists
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

export default {
  provisionBusiness,
  deprovisionBusiness
};