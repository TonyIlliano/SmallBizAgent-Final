/**
 * Twilio service for integrating with Twilio API
 * 
 * This service handles all interactions with Twilio for:
 * - Making outbound calls
 * - Sending SMS messages
 * - Generating TwiML for call flows
 * - Handling webhooks for inbound calls
 */

import twilio from 'twilio';
const { VoiceResponse } = twilio.twiml;

// Initialize Twilio client with environment variables
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const configuredPhoneNumber = process.env.TWILIO_PHONE_NUMBER || '';

// Check if Twilio is properly configured
const isTwilioConfigured = accountSid && authToken && accountSid.startsWith('AC');

// Create Twilio client only if configured, otherwise use a mock
let client: ReturnType<typeof twilio> | null = null;
if (isTwilioConfigured) {
  client = twilio(accountSid, authToken);
} else {
  console.warn('⚠️  Twilio credentials not configured or invalid. SMS/Call features will be disabled.');
  console.warn('   Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN in your .env file.');
}

// Cache for auto-discovered SMS-capable number (looked up once from account)
let discoveredSmsNumber: string | null = null;

/**
 * Get an SMS-capable phone number from this Twilio account.
 * Prefers the TWILIO_PHONE_NUMBER env var. If not set, looks up the first
 * SMS-capable number on the account and caches it.
 */
async function getSmsFromNumber(): Promise<string | null> {
  // 1. Use configured env var if it looks like a real number
  if (configuredPhoneNumber && configuredPhoneNumber.startsWith('+1')) {
    return configuredPhoneNumber;
  }

  // 2. Return cached discovery
  if (discoveredSmsNumber) return discoveredSmsNumber;

  // 3. Look up from Twilio account
  if (!client) return null;
  try {
    const numbers = await client.incomingPhoneNumbers.list({
      smsEnabled: true,
      limit: 5,
    } as any);
    if (numbers.length > 0) {
      discoveredSmsNumber = numbers[0].phoneNumber;
      console.log(`Auto-discovered SMS-capable number: ${discoveredSmsNumber}`);
      return discoveredSmsNumber;
    }
    console.warn('No SMS-capable numbers found on Twilio account');
    return null;
  } catch (err) {
    console.error('Failed to discover SMS number from Twilio account:', err);
    return null;
  }
}

/**
 * Send an SMS message
 * 
 * @param to Recipient phone number
 * @param body Message content
 * @returns Promise with message response
 */
export async function sendSms(to: string, body: string, from?: string) {
  if (!client) {
    console.warn('Twilio not configured - SMS would be sent to:', to, 'Message:', body.substring(0, 50));
    return { sid: 'mock-sid', status: 'mock' };
  }
  try {
    // Resolve the from number: explicit param > env var > auto-discover from account
    const fromNumber = from || await getSmsFromNumber();
    if (!fromNumber) {
      console.error('No SMS-capable from number available. Set TWILIO_PHONE_NUMBER or ensure account has SMS-capable numbers.');
      throw new Error('No SMS from number configured');
    }

    console.log(`Sending SMS: from=${fromNumber} to=${to} body="${body.substring(0, 60)}..."`);
    const message = await client.messages.create({
      body,
      from: fromNumber,
      to
    });

    console.log(`SMS sent successfully: sid=${message.sid} status=${message.status}`);
    return message;
  } catch (error) {
    console.error('Error sending SMS:', error);
    throw error;
  }
}

/**
 * Make an outbound call
 * 
 * @param to Recipient phone number
 * @param url URL for TwiML instructions or callback
 * @returns Promise with call response
 */
export async function makeCall(to: string, url: string) {
  if (!client) {
    console.warn('Twilio not configured - Call would be made to:', to);
    return { sid: 'mock-call-sid', status: 'mock' };
  }
  try {
    const fromNumber = await getSmsFromNumber() || configuredPhoneNumber;
    const call = await client.calls.create({
      url,
      from: fromNumber,
      to
    });

    return call;
  } catch (error) {
    console.error('Error making call:', error);
    throw error;
  }
}

/**
 * Create TwiML for a virtual receptionist greeting
 * 
 * @param greeting Greeting message
 * @param gatherCallback URL for handling speech input
 * @returns TwiML response as string
 */
export function createGreetingTwiml(greeting: string, gatherCallback: string) {
  const twiml = new VoiceResponse();
  
  // Say the greeting
  twiml.say({ voice: 'alice' }, greeting);
  
  // Gather speech input
  twiml.gather({
    input: ['speech', 'dtmf'],
    action: gatherCallback,
    speechTimeout: 'auto',
    speechModel: 'phone_call',
    hints: 'appointment, emergency, services, hours, pricing, location'
  });
  
  return twiml.toString();
}

/**
 * Create TwiML for after-hours message
 * 
 * @param afterHoursMessage After-hours message
 * @param gatherCallback URL for handling speech input
 * @returns TwiML response as string
 */
export function createAfterHoursTwiml(afterHoursMessage: string, gatherCallback: string) {
  const twiml = new VoiceResponse();
  
  // Say the after-hours message
  twiml.say({ voice: 'alice' }, afterHoursMessage);
  
  // Gather speech input
  twiml.gather({
    input: ['speech'],
    action: gatherCallback,
    speechTimeout: 'auto',
    speechModel: 'phone_call'
  });
  
  return twiml.toString();
}

/**
 * Create TwiML for recording a voicemail
 * 
 * @param message Instructional message before recording
 * @param recordingCallback URL for handling recording
 * @param maxLength Maximum length in seconds
 * @param transcribe Whether to transcribe the recording
 * @param transcribeCallback URL for handling transcription
 * @returns TwiML response as string
 */
export function createVoicemailTwiml(
  message: string,
  recordingCallback: string,
  maxLength: number = 300,
  transcribe: boolean = true,
  transcribeCallback?: string
) {
  const twiml = new VoiceResponse();
  
  // Say instructions
  twiml.say({ voice: 'alice' }, message);
  
  // Record voicemail
  const recordOptions: any = {
    action: recordingCallback,
    maxLength,
    transcribe
  };
  
  if (transcribe && transcribeCallback) {
    recordOptions.transcribeCallback = transcribeCallback;
  }
  
  twiml.record(recordOptions);
  
  return twiml.toString();
}

/**
 * Create TwiML for transferring a call
 * 
 * @param message Message before transfer
 * @param transferNumber Phone number to transfer to
 * @returns TwiML response as string
 */
export function createTransferTwiml(message: string, transferNumber: string) {
  const twiml = new VoiceResponse();
  
  // Say message before transfer
  twiml.say({ voice: 'alice' }, message);
  
  // Dial transfer number
  twiml.dial({}, transferNumber);
  
  return twiml.toString();
}

/**
 * Create TwiML for call completion
 * 
 * @param message Goodbye message
 * @returns TwiML response as string
 */
export function createGoodbyeTwiml(message: string = "Thank you for your call. Goodbye.") {
  const twiml = new VoiceResponse();
  
  // Say goodbye
  twiml.say({ voice: 'alice' }, message);
  
  // Hang up
  twiml.hangup();
  
  return twiml.toString();
}

export default {
  client,
  sendSms,
  makeCall,
  createGreetingTwiml,
  createAfterHoursTwiml,
  createVoicemailTwiml,
  createTransferTwiml,
  createGoodbyeTwiml
};
