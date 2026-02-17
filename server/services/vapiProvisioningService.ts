/**
 * Vapi Provisioning Service
 *
 * Automatically creates and manages Vapi AI assistants for businesses
 * Handles the full lifecycle: create, update, connect phone, delete
 */

import { storage } from '../storage';
import vapiService from './vapiService';
import { Business } from '@shared/schema';

const VAPI_API_KEY = process.env.VAPI_API_KEY;
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN;

/**
 * Debounce map for VAPI assistant updates.
 * When a business rapidly updates settings/services/hours, multiple
 * updateVapiAssistant() calls fire. This coalesces them into one API call
 * using the latest data (2-second window).
 */
const pendingUpdates = new Map<number, NodeJS.Timeout>();
const DEBOUNCE_DELAY_MS = 2000;

/**
 * Debounced version of updateVapiAssistant.
 * Multiple calls within DEBOUNCE_DELAY_MS for the same business
 * are coalesced into a single update using the latest data.
 */
export function debouncedUpdateVapiAssistant(businessId: number): void {
  const existing = pendingUpdates.get(businessId);
  if (existing) {
    clearTimeout(existing);
  }

  const timeout = setTimeout(async () => {
    pendingUpdates.delete(businessId);
    try {
      console.log(`[Debounced] Executing VAPI update for business ${businessId}`);
      await updateVapiAssistant(businessId);
    } catch (error) {
      console.error(`[Debounced] Error updating VAPI assistant for business ${businessId}:`, error);
    }
  }, DEBOUNCE_DELAY_MS);

  pendingUpdates.set(businessId, timeout);
  console.log(`[Debounced] Scheduled VAPI update for business ${businessId} (${DEBOUNCE_DELAY_MS}ms delay)`);
}

/**
 * Provision a complete Vapi setup for a business
 * Creates assistant and optionally connects phone number
 */
export async function provisionVapiForBusiness(businessId: number): Promise<{
  success: boolean;
  assistantId?: string;
  phoneConnected?: boolean;
  error?: string;
}> {
  if (!VAPI_API_KEY) {
    return { success: false, error: 'Vapi API key not configured' };
  }

  try {
    // Get business details
    const business = await storage.getBusiness(businessId);
    if (!business) {
      return { success: false, error: 'Business not found' };
    }

    // Get services, business hours, and transfer numbers for this business
    const services = await storage.getServices(businessId);
    const businessHours = await storage.getBusinessHours(businessId);
    const receptionistConfig = await storage.getReceptionistConfig(businessId);
    const transferPhoneNumbers: string[] = Array.isArray(receptionistConfig?.transferPhoneNumbers)
      ? receptionistConfig.transferPhoneNumbers as string[]
      : [];

    // Check if assistant already exists
    if (business.vapiAssistantId) {
      // Update existing assistant
      const updateResult = await vapiService.updateAssistant(
        business.vapiAssistantId,
        business,
        services,
        businessHours,
        transferPhoneNumbers
      );

      if (!updateResult.success) {
        console.error('Failed to update Vapi assistant:', updateResult.error);
      }

      return {
        success: true,
        assistantId: business.vapiAssistantId,
        phoneConnected: !!business.vapiPhoneNumberId
      };
    }

    // Create new assistant
    const result = await vapiService.createAssistantForBusiness(business, services, businessHours, transferPhoneNumbers);

    if (!result.assistantId) {
      return { success: false, error: result.error || 'Failed to create assistant' };
    }

    // Save assistant ID to business
    await storage.updateBusiness(businessId, {
      vapiAssistantId: result.assistantId
    });

    console.log(`Created Vapi assistant for business ${businessId}: ${result.assistantId}`);

    // If business has a phone number, connect it
    let phoneConnected = false;
    if (business.twilioPhoneNumber && TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
      const phoneResult = await connectPhoneToVapi(businessId, result.assistantId);
      phoneConnected = phoneResult.success;
    }

    return {
      success: true,
      assistantId: result.assistantId,
      phoneConnected
    };
  } catch (error) {
    console.error('Error provisioning Vapi for business:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Connect a Twilio phone number to a Vapi assistant
 */
export async function connectPhoneToVapi(
  businessId: number,
  assistantId?: string
): Promise<{ success: boolean; phoneNumberId?: string; error?: string }> {
  if (!VAPI_API_KEY || !TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) {
    return { success: false, error: 'Vapi or Twilio not configured' };
  }

  try {
    const business = await storage.getBusiness(businessId);
    if (!business) {
      return { success: false, error: 'Business not found' };
    }

    if (!business.twilioPhoneNumber) {
      return { success: false, error: 'Business has no phone number' };
    }

    const targetAssistantId = assistantId || business.vapiAssistantId;
    if (!targetAssistantId) {
      return { success: false, error: 'No Vapi assistant for this business' };
    }

    // Import phone to Vapi
    const result = await vapiService.importPhoneNumber(
      business.twilioPhoneNumber,
      TWILIO_ACCOUNT_SID,
      TWILIO_AUTH_TOKEN,
      targetAssistantId
    );

    if (result.error) {
      return { success: false, error: result.error };
    }

    // Save phone number ID
    await storage.updateBusiness(businessId, {
      vapiPhoneNumberId: result.phoneNumberId
    });

    console.log(`Connected phone ${business.twilioPhoneNumber} to Vapi for business ${businessId}`);

    return { success: true, phoneNumberId: result.phoneNumberId };
  } catch (error) {
    console.error('Error connecting phone to Vapi:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Update Vapi assistant when business details or services change
 */
export async function updateVapiAssistant(businessId: number): Promise<{
  success: boolean;
  error?: string;
}> {
  if (!VAPI_API_KEY) {
    return { success: false, error: 'Vapi API key not configured' };
  }

  try {
    const business = await storage.getBusiness(businessId);
    if (!business) {
      return { success: false, error: 'Business not found' };
    }

    if (!business.vapiAssistantId) {
      // No assistant yet, create one
      const result = await provisionVapiForBusiness(businessId);
      return { success: result.success, error: result.error };
    }

    // Get current services, business hours, and transfer numbers
    const services = await storage.getServices(businessId);
    const businessHours = await storage.getBusinessHours(businessId);
    const receptionistConfig = await storage.getReceptionistConfig(businessId);
    const transferPhoneNumbers: string[] = Array.isArray(receptionistConfig?.transferPhoneNumbers)
      ? receptionistConfig.transferPhoneNumbers as string[]
      : [];

    // Update the assistant
    const result = await vapiService.updateAssistant(
      business.vapiAssistantId,
      business,
      services,
      businessHours,
      transferPhoneNumbers
    );

    if (!result.success) {
      return { success: false, error: result.error };
    }

    console.log(`Updated Vapi assistant for business ${businessId}`);
    return { success: true };
  } catch (error) {
    console.error('Error updating Vapi assistant:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Remove Vapi assistant when business is deleted or deactivated
 */
export async function removeVapiAssistant(businessId: number): Promise<{
  success: boolean;
  error?: string;
}> {
  if (!VAPI_API_KEY) {
    return { success: false, error: 'Vapi API key not configured' };
  }

  try {
    const business = await storage.getBusiness(businessId);
    if (!business || !business.vapiAssistantId) {
      return { success: true }; // Nothing to delete
    }

    // Delete the assistant
    const result = await vapiService.deleteAssistant(business.vapiAssistantId);

    if (!result.success) {
      console.error('Failed to delete Vapi assistant:', result.error);
    }

    // Clear the IDs from business
    await storage.updateBusiness(businessId, {
      vapiAssistantId: null,
      vapiPhoneNumberId: null
    });

    console.log(`Removed Vapi assistant for business ${businessId}`);
    return { success: true };
  } catch (error) {
    console.error('Error removing Vapi assistant:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Get Vapi status for a business
 */
export async function getVapiStatus(businessId: number): Promise<{
  configured: boolean;
  assistantId?: string;
  phoneConnected: boolean;
  phoneNumber?: string;
}> {
  const business = await storage.getBusiness(businessId);

  if (!business) {
    return { configured: false, phoneConnected: false };
  }

  return {
    configured: !!business.vapiAssistantId,
    assistantId: business.vapiAssistantId || undefined,
    phoneConnected: !!business.vapiPhoneNumberId,
    phoneNumber: business.twilioPhoneNumber || undefined
  };
}

export default {
  provisionVapiForBusiness,
  connectPhoneToVapi,
  updateVapiAssistant,
  debouncedUpdateVapiAssistant,
  removeVapiAssistant,
  getVapiStatus
};
