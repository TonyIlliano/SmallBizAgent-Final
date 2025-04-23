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
const client = twilio(accountSid, authToken);

// Base URL for your Twilio webhook endpoints
const baseWebhookUrl = process.env.BASE_URL || 'https://your-app.herokuapp.com';

/**
 * Provision a new phone number for a business
 * 
 * @param business The business requiring a phone number
 * @param areaCode Optional preferred area code
 * @returns The provisioned phone number details
 */
export async function provisionPhoneNumber(business: Business, areaCode?: string) {
  try {
    // Validate Twilio credentials
    if (!accountSid || !authToken) {
      throw new Error('Twilio credentials not configured');
    }

    // Search for available phone numbers
    // If areaCode is provided, search in that area code first
    let availableNumbers;
    if (areaCode) {
      try {
        availableNumbers = await client.availablePhoneNumbers('US')
          .local
          .list({ areaCode, limit: 1 });
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
        voiceUrl: `${baseWebhookUrl}/api/twilio/call?businessId=${business.id}`,
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
 * Release a phone number when a business cancels
 * 
 * @param phoneNumberSid The Twilio SID of the phone number to release
 * @returns Success status
 */
export async function releasePhoneNumber(phoneNumberSid: string) {
  try {
    // Validate Twilio credentials
    if (!accountSid || !authToken) {
      throw new Error('Twilio credentials not configured');
    }

    // Release the phone number
    await client.incomingPhoneNumbers(phoneNumberSid).remove();

    return {
      success: true,
      message: 'Phone number released successfully',
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
    // Validate Twilio credentials
    if (!accountSid || !authToken) {
      throw new Error('Twilio credentials not configured');
    }

    // Update the webhook URLs
    const phoneNumber = await client.incomingPhoneNumbers(phoneNumberSid)
      .update({
        voiceUrl: `${baseWebhookUrl}/api/twilio/call?businessId=${businessId}`,
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
    // Validate Twilio credentials
    if (!accountSid || !authToken) {
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

export default {
  provisionPhoneNumber,
  releasePhoneNumber,
  updatePhoneNumberWebhooks,
  listPhoneNumbers
};