/**
 * Twilio Provisioning Service
 * 
 * This service handles the automatic provisioning of Twilio phone numbers
 * for new businesses when they sign up for the platform.
 */

import twilio from 'twilio';
import { Business } from '@shared/schema';

// Initialize Twilio client with master account credentials
const accountSid = process.env.TWILIO_ACCOUNT_SID || '';
const authToken = process.env.TWILIO_AUTH_TOKEN || '';
const isTwilioConfigured = accountSid && authToken && accountSid.startsWith('AC');

// Only create client if properly configured
let client: ReturnType<typeof twilio> | null = null;
if (isTwilioConfigured) {
  client = twilio(accountSid, authToken);
}

// Base URL for your Twilio webhook endpoints
// IMPORTANT: This must be set to your publicly accessible URL for Twilio webhooks to work
const baseWebhookUrl = process.env.BASE_URL || '';

function validateWebhookUrl(): void {
  if (!baseWebhookUrl) {
    console.warn('⚠️  BASE_URL environment variable is not set. Twilio webhooks will not work.');
    console.warn('   Set BASE_URL to your publicly accessible URL (e.g., https://your-domain.com)');
  } else if (baseWebhookUrl.includes('localhost') || baseWebhookUrl.includes('127.0.0.1')) {
    console.warn('⚠️  BASE_URL is set to localhost. Twilio cannot reach localhost URLs.');
    console.warn('   Use ngrok or a similar tool for local development.');
  }
}

/**
 * Provision a new phone number for a business
 * 
 * @param business The business requiring a phone number
 * @param areaCode Optional preferred area code
 * @returns The provisioned phone number details
 */
export async function provisionPhoneNumber(business: Business, areaCode?: string) {
  try {
    // Validate Twilio credentials and client
    if (!client || !isTwilioConfigured) {
      throw new Error('Twilio credentials not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.');
    }

    // Validate BASE_URL is set
    if (!baseWebhookUrl) {
      throw new Error('BASE_URL environment variable is not configured. Twilio webhooks require a publicly accessible URL.');
    }

    validateWebhookUrl();

    // Search for available phone numbers
    // If areaCode is provided, search in that area code first
    let availableNumbers;
    if (areaCode) {
      try {
        // The API expects areaCode as a numeric value
        const numericAreaCode = parseInt(areaCode);
        availableNumbers = await client.availablePhoneNumbers('US')
          .local
          .list({ areaCode: numericAreaCode, limit: 1 });
      } catch (error) {
        console.warn(`No numbers available in area code ${areaCode}, falling back to general search`);
      }
    }

    if (!availableNumbers || availableNumbers.length === 0) {
      // If no numbers found in preferred area code or no area code specified, search generally
      availableNumbers = await client.availablePhoneNumbers('US')
        .local
        .list({ limit: 1 });
    }

    if (availableNumbers.length === 0) {
      throw new Error('No available phone numbers found');
    }

    // Purchase the phone number
    const phoneNumber = await client.incomingPhoneNumbers
      .create({
        phoneNumber: availableNumbers[0].phoneNumber,
        friendlyName: `${business.name} - SmallBizAgent`,
        // Set the voice URL to your webhook endpoint
        voiceUrl: `${baseWebhookUrl}/api/twilio/incoming-call?businessId=${business.id}`,
        // Optional: Set SMS URL if you want to handle SMS
        smsUrl: `${baseWebhookUrl}/api/twilio/sms?businessId=${business.id}`,
      });

    // Create a friendly name for the phone number with business details
    await client.incomingPhoneNumbers(phoneNumber.sid)
      .update({
        friendlyName: `${business.name} - ID: ${business.id} - SmallBizAgent`
      });

    // Return the details
    return {
      phoneNumberSid: phoneNumber.sid,
      phoneNumber: phoneNumber.phoneNumber,
      formattedPhoneNumber: phoneNumber.friendlyName,
      dateProvisioned: new Date().toISOString(),
      businessId: business.id
    };
  } catch (error) {
    console.error('Error provisioning phone number:', error);
    throw error;
  }
}

/**
 * Release a phone number for a business
 * 
 * @param businessId The ID of the business
 * @returns Success status
 */
export async function releasePhoneNumber(businessId: number) {
  try {
    // Validate Twilio client
    if (!client || !isTwilioConfigured) {
      throw new Error('Twilio credentials not configured');
    }

    // Get business details to find the phone number SID
    const db = await import('../db');
    const { eq } = await import('drizzle-orm');
    const { businesses } = await import('@shared/schema');
    
    const [business] = await db.db.select().from(businesses).where(eq(businesses.id, businessId));
    
    if (!business) {
      throw new Error(`Business ID ${businessId} not found`);
    }

    // Check if business has a phone number
    if (!business.twilioPhoneNumberSid) {
      throw new Error(`Business ID ${businessId} does not have a provisioned phone number`);
    }

    // Release the phone number
    await client.incomingPhoneNumbers(business.twilioPhoneNumberSid).remove();

    // Update the business record to remove the phone number
    await db.db.update(businesses)
      .set({
        twilioPhoneNumber: null,
        twilioPhoneNumberSid: null,
        updatedAt: new Date()
      })
      .where(eq(businesses.id, businessId));

    return {
      success: true,
      message: 'Phone number released successfully',
      businessId,
      dateReleased: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error releasing phone number:', error);
    throw error;
  }
}

/**
 * Update webhook URLs for an existing phone number
 * 
 * @param phoneNumberSid The Twilio SID of the phone number
 * @param businessId The business ID to update webhooks for
 * @returns Updated phone number details
 */
export async function updatePhoneNumberWebhooks(phoneNumberSid: string, businessId: number) {
  try {
    // Validate Twilio client
    if (!client || !isTwilioConfigured) {
      throw new Error('Twilio credentials not configured');
    }

    // Update the webhook URLs
    const phoneNumber = await client.incomingPhoneNumbers(phoneNumberSid)
      .update({
        voiceUrl: `${baseWebhookUrl}/api/twilio/incoming-call?businessId=${businessId}`,
        smsUrl: `${baseWebhookUrl}/api/twilio/sms?businessId=${businessId}`
      });

    return {
      phoneNumberSid: phoneNumber.sid,
      phoneNumber: phoneNumber.phoneNumber,
      voiceUrl: phoneNumber.voiceUrl,
      smsUrl: phoneNumber.smsUrl,
      updated: true
    };
  } catch (error) {
    console.error('Error updating phone number webhooks:', error);
    throw error;
  }
}

/**
 * List all phone numbers provisioned for your account
 * 
 * @returns List of phone numbers
 */
export async function listPhoneNumbers() {
  try {
    // Validate Twilio client
    if (!client || !isTwilioConfigured) {
      throw new Error('Twilio credentials not configured');
    }

    // Get all incoming phone numbers
    const phoneNumbers = await client.incomingPhoneNumbers.list();

    // Filter out any numbers that don't match our naming convention
    const smallBizAgentNumbers = phoneNumbers.filter(number => 
      number.friendlyName.includes('SmallBizAgent')
    );

    // Map to a more usable format
    return smallBizAgentNumbers.map(number => {
      // Try to extract business ID from friendly name
      const businessIdMatch = number.friendlyName.match(/ID: (\d+)/);
      const businessId = businessIdMatch ? parseInt(businessIdMatch[1]) : null;

      return {
        phoneNumberSid: number.sid,
        phoneNumber: number.phoneNumber,
        formattedPhoneNumber: number.friendlyName,
        businessId,
        voiceUrl: number.voiceUrl,
        smsUrl: number.smsUrl,
        capabilities: number.capabilities
      };
    });
  } catch (error) {
    console.error('Error listing phone numbers:', error);
    throw error;
  }
}

/**
 * Search for available phone numbers in a specific area code
 * 
 * @param areaCode The area code to search for (3 digits)
 * @returns List of available phone numbers
 */
export async function searchAvailablePhoneNumbers(areaCode: string) {
  try {
    // Validate Twilio client
    if (!client || !isTwilioConfigured) {
      throw new Error('Twilio credentials not configured');
    }

    // Validate area code
    if (!areaCode || areaCode.length !== 3 || !/^\d{3}$/.test(areaCode)) {
      throw new Error('Invalid area code format. Must be 3 digits.');
    }

    // The API expects areaCode as a numeric value
    const numericAreaCode = parseInt(areaCode);
    
    // Search for available phone numbers in the area code
    const availableNumbers = await client.availablePhoneNumbers('US')
      .local
      .list({ areaCode: numericAreaCode, limit: 10 });

    // Return formatted list of available numbers
    return availableNumbers.map(number => ({
      phoneNumber: number.phoneNumber,
      friendlyName: number.friendlyName,
      locality: number.locality,
      region: number.region,
      isoCountry: number.isoCountry,
      capabilities: number.capabilities
    }));
  } catch (error) {
    console.error('Error searching for available phone numbers:', error);
    throw error;
  }
}

/**
 * Provision a specific phone number for a business
 * 
 * @param businessId The ID of the business
 * @param phoneNumber The specific phone number to provision (in E.164 format)
 * @returns The provisioned phone number details
 */
export async function provisionSpecificPhoneNumber(businessId: number, phoneNumber: string) {
  try {
    // Validate Twilio client
    if (!client || !isTwilioConfigured) {
      throw new Error('Twilio credentials not configured');
    }

    // Get business details
    const db = await import('../db');
    const { eq } = await import('drizzle-orm');
    const { businesses } = await import('@shared/schema');
    
    const [business] = await db.db.select().from(businesses).where(eq(businesses.id, businessId));
    
    if (!business) {
      throw new Error(`Business ID ${businessId} not found`);
    }

    // Purchase the specific phone number
    const purchasedNumber = await client.incomingPhoneNumbers
      .create({
        phoneNumber,
        friendlyName: `${business.name} - SmallBizAgent`,
        // Set the voice URL to your webhook endpoint
        voiceUrl: `${baseWebhookUrl}/api/twilio/incoming-call?businessId=${business.id}`,
        // Optional: Set SMS URL if you want to handle SMS
        smsUrl: `${baseWebhookUrl}/api/twilio/sms?businessId=${business.id}`,
      });

    // Create a friendly name for the phone number with business details
    await client.incomingPhoneNumbers(purchasedNumber.sid)
      .update({
        friendlyName: `${business.name} - ID: ${business.id} - SmallBizAgent`
      });

    // Update the business record with the new phone number
    await db.db.update(businesses)
      .set({
        twilioPhoneNumber: purchasedNumber.phoneNumber,
        twilioPhoneNumberSid: purchasedNumber.sid,
        twilioDateProvisioned: new Date(),
        updatedAt: new Date()
      })
      .where(eq(businesses.id, businessId));

    // Return the details
    return {
      phoneNumberSid: purchasedNumber.sid,
      phoneNumber: purchasedNumber.phoneNumber,
      formattedPhoneNumber: purchasedNumber.friendlyName,
      dateProvisioned: new Date().toISOString(),
      businessId: business.id,
      sid: purchasedNumber.sid
    };
  } catch (error) {
    console.error('Error provisioning specific phone number:', error);
    throw error;
  }
}

export default {
  provisionPhoneNumber,
  releasePhoneNumber,
  updatePhoneNumberWebhooks,
  listPhoneNumbers,
  searchAvailablePhoneNumbers,
  provisionSpecificPhoneNumber
};