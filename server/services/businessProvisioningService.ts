/**
 * Business Provisioning Service
 * 
 * This service handles the provisioning of resources for new businesses
 * including Twilio phone numbers and virtual receptionist setup.
 */

import { Business } from '@shared/schema';
import { storage } from '../storage';
import twilioProvisioningService from './twilioProvisioningService';

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
    
    const results: any = {
      businessId,
      success: true,
      twilioProvisioned: false,
      virtualReceptionistConfigured: false,
      businessHoursConfigured: false,
      servicesConfigured: false
    };
    
    // 1. Provision a Twilio phone number if not skipped
    if (!options?.skipTwilioProvisioning) {
      try {
        // Check if Twilio has valid credentials
        if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
          console.warn('Twilio credentials not set, skipping phone number provisioning');
          results.twilioProvisioned = false;
          results.twilioProvisioningSkipped = true;
        } else {
          // Get a phone number in the preferred area code if specified
          const phoneNumber = await twilioProvisioningService.provisionPhoneNumber(
            business, 
            options?.preferredAreaCode
          );
          
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
        console.error('Error provisioning Twilio phone number:', error);
        results.twilioProvisioned = false;
        results.twilioError = error.message;
      }
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
      results.virtualReceptionistError = error.message;
    }
    
    // 3. Configure default business hours
    try {
      const existingHours = await storage.getBusinessHours(businessId);
      if (existingHours.length === 0) {
        // Set up default hours (Mon-Fri 9-5, Sat 10-2, Sun closed)
        const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
        const defaultHours = [
          { open: '09:00', close: '17:00', isClosed: false }, // Mon-Fri
          { open: '09:00', close: '17:00', isClosed: false },
          { open: '09:00', close: '17:00', isClosed: false },
          { open: '09:00', close: '17:00', isClosed: false },
          { open: '09:00', close: '17:00', isClosed: false },
          { open: '10:00', close: '14:00', isClosed: false }, // Sat
          { open: '00:00', close: '00:00', isClosed: true }   // Sun
        ];
        
        // Create hours for each day
        const hoursPromises = days.map((day, index) => 
          storage.createBusinessHours({
            businessId,
            day,
            open: defaultHours[index].open,
            close: defaultHours[index].close,
            isClosed: defaultHours[index].isClosed
          })
        );
        
        const createdHours = await Promise.all(hoursPromises);
        results.businessHoursConfigured = true;
        results.businessHours = createdHours;
      } else {
        results.businessHoursConfigured = true;
        results.businessHoursExist = true;
      }
    } catch (error) {
      console.error('Error configuring business hours:', error);
      results.businessHoursConfigured = false;
      results.businessHoursError = error.message;
    }
    
    // 4. Add some default services
    try {
      const existingServices = await storage.getServices(businessId);
      if (existingServices.length === 0) {
        // Create a few generic services that can be customized later
        const defaultServices = [
          { name: 'Standard Service', description: 'Regular service appointment', price: 100, duration: 60 },
          { name: 'Express Service', description: 'Quick service for minor issues', price: 75, duration: 30 },
          { name: 'Premium Service', description: 'Comprehensive service with full inspection', price: 150, duration: 90 }
        ];
        
        const servicePromises = defaultServices.map(service => 
          storage.createService({
            businessId,
            name: service.name,
            description: service.description,
            price: service.price,
            duration: service.duration,
            active: true
          })
        );
        
        const createdServices = await Promise.all(servicePromises);
        results.servicesConfigured = true;
        results.services = createdServices;
      } else {
        results.servicesConfigured = true;
        results.servicesExist = true;
      }
    } catch (error) {
      console.error('Error configuring default services:', error);
      results.servicesConfigured = false;
      results.servicesError = error.message;
    }
    
    console.log(`Provisioning completed for business ID ${businessId}`);
    return results;
  } catch (error) {
    console.error(`Error provisioning business ID ${businessId}:`, error);
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
      twilioDeprovisioned: false
    };
    
    // Release Twilio phone number if one exists
    if (business.twilioPhoneNumberSid) {
      try {
        const releaseResult = await twilioProvisioningService.releasePhoneNumber(
          business.twilioPhoneNumberSid
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
        results.twilioError = error.message;
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