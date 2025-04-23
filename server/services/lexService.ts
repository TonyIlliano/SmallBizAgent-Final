/**
 * AWS Lex Service for SmallBizAgent
 * 
 * This service handles all interactions with Amazon Lex for:
 * - Processing voice inputs from Twilio calls
 * - Processing text inputs from chat interfaces
 * - Intent detection and fulfillment
 * - Emergency detection and handling
 */

import { LexRuntimeServiceClient, PostTextCommand, PostContentCommand } from "@aws-sdk/client-lex-runtime-service";

// Initialize Lex client with environment variables or default test values
const region = process.env.AWS_REGION || 'us-east-1';
const lexClient = new LexRuntimeServiceClient({
  region,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ''
  }
});

// Lex bot configuration
const botName = process.env.AWS_LEX_BOT_NAME || 'SmallBizAgent';
const botAlias = process.env.AWS_LEX_BOT_ALIAS || 'Prod';

/**
 * Emergency keywords that indicate high-priority situations
 * This should be customized based on business type
 */
const DEFAULT_EMERGENCY_KEYWORDS = [
  'emergency', 'urgent', 'immediately', 'critical', 'asap',
  'broken', 'leaking', 'fire', 'smoke', 'danger', 'hurt',
  'injured', 'accident', 'pain', 'bleeding', 'stuck'
];

/**
 * Send text input to Lex for processing
 * 
 * @param userId Unique identifier for the user
 * @param text User's text input 
 * @param sessionId Session identifier for conversation context
 * @param businessType Type of business for context-specific processing
 * @returns Processed response from Lex with additional metadata
 */
export async function sendTextInput(
  userId: string,
  text: string,
  sessionId: string,
  businessType: string = 'general'
) {
  try {
    // Check credentials before attempting to make the API call
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      console.warn('AWS credentials not set - running in simulation mode');
      return simulateLexResponse(text, businessType);
    }

    const params = {
      botName,
      botAlias,
      userId,
      sessionAttributes: {
        businessType
      },
      inputText: text
    };

    const command = new PostTextCommand(params);
    const response = await lexClient.send(command);

    // Enhance the response with emergency detection
    const isEmergency = detectEmergency(text, businessType);
    
    return {
      ...response,
      isEmergency,
      originalText: text
    };
  } catch (error) {
    console.error('Error sending text to Lex:', error);
    
    // Fallback to simulation if AWS call fails
    return simulateLexResponse(text, businessType);
  }
}

/**
 * Send voice input to Lex for processing
 * 
 * @param userId Unique identifier for the user
 * @param audioInput User's voice input as text or audio data
 * @param sessionId Session identifier for conversation context
 * @param businessType Type of business for context-specific processing
 * @returns Processed response from Lex with additional metadata
 */
export async function sendVoiceInput(
  userId: string,
  audioInput: string,
  sessionId: string,
  businessType: string = 'general'
) {
  try {
    // For now, we're treating the audio input as text
    // In a production scenario, we would send actual audio data to Lex
    // and use the PostContent API instead
    return await sendTextInput(userId, audioInput, sessionId, businessType);
  } catch (error) {
    console.error('Error sending voice input to Lex:', error);
    
    // Fallback to simulation
    return simulateLexResponse(audioInput, businessType);
  }
}

/**
 * Analyze text for intent and emergency detection
 * 
 * @param text User input to analyze
 * @param businessType Type of business for context
 * @returns Analysis results
 */
export function analyzeText(text: string, businessType: string = 'general') {
  // Detect intent based on text patterns
  const intent = detectIntent(text, businessType);
  
  // Check for emergency indicators
  const isEmergency = detectEmergency(text, businessType);
  
  return {
    intent,
    isEmergency,
    confidence: 0.85, // Simplified confidence score
    entities: [],      // No entity extraction in this simplified version
    originalText: text
  };
}

/**
 * Detect intent from text input
 * 
 * @param text User input
 * @param businessType Business type for context
 * @returns Detected intent
 */
function detectIntent(text: string, businessType: string): string {
  const lowercaseText = text.toLowerCase();
  
  // Simple intent detection based on keywords
  if (lowercaseText.includes('appointment') || 
      lowercaseText.includes('schedule') || 
      lowercaseText.includes('book') ||
      lowercaseText.includes('reserve')) {
    return 'appointment';
  }
  
  if (lowercaseText.includes('hour') || 
      lowercaseText.includes('open') || 
      lowercaseText.includes('close') ||
      lowercaseText.includes('time')) {
    return 'business_hours';
  }
  
  if (lowercaseText.includes('price') || 
      lowercaseText.includes('cost') || 
      lowercaseText.includes('much') ||
      lowercaseText.includes('charge')) {
    return 'pricing';
  }
  
  if (lowercaseText.includes('address') || 
      lowercaseText.includes('location') || 
      lowercaseText.includes('where') ||
      lowercaseText.includes('directions')) {
    return 'location';
  }
  
  if (lowercaseText.includes('service') || 
      lowercaseText.includes('offer') || 
      lowercaseText.includes('provide') ||
      lowercaseText.includes('repair') ||
      lowercaseText.includes('fix')) {
    return 'services';
  }
  
  if (detectEmergency(text, businessType)) {
    return 'emergency';
  }
  
  return 'general_inquiry';
}

/**
 * Detect emergency situations from input
 * 
 * @param text User input
 * @param businessType Business type for context-specific emergency keywords
 * @returns True if emergency is detected
 */
function detectEmergency(text: string, businessType: string): boolean {
  const lowercaseText = text.toLowerCase();
  
  // Check against emergency keywords
  const emergencyKeywords = getEmergencyKeywords(businessType);
  return emergencyKeywords.some(keyword => lowercaseText.includes(keyword));
}

/**
 * Get emergency keywords for a specific business type
 * 
 * @param businessType Type of business
 * @returns Array of emergency keywords
 */
function getEmergencyKeywords(businessType: string): string[] {
  const keywords = [...DEFAULT_EMERGENCY_KEYWORDS];
  
  // Add business-specific emergency keywords
  switch (businessType.toLowerCase()) {
    case 'plumbing':
      keywords.push('flood', 'burst', 'pipe', 'water', 'leak', 'clog', 'overflow');
      break;
    case 'electrical':
      keywords.push('shock', 'outage', 'power', 'spark', 'electrical', 'circuit');
      break;
    case 'automotive':
      keywords.push('breakdown', 'stranded', 'accident', 'tow', 'roadside');
      break;
    case 'medical':
      keywords.push('pain', 'fever', 'injury', 'sick', 'blood', 'breathing', 'chest');
      break;
    case 'locksmith':
      keywords.push('locked out', 'break-in', 'stuck', 'key', 'lock', 'unlock');
      break;
    case 'hvac':
      keywords.push('heat', 'cooling', 'freezing', 'hot', 'cold', 'ac', 'furnace');
      break;
  }
  
  return keywords;
}

/**
 * Simulate Lex response when AWS credentials are not available
 * This is for development and testing purposes
 * 
 * @param text User input
 * @param businessType Business type for context
 * @returns Simulated Lex response
 */
function simulateLexResponse(text: string, businessType: string) {
  // Analyze the text to detect intent and emergency
  const intent = detectIntent(text, businessType);
  const isEmergency = detectEmergency(text, businessType);
  
  // Generate appropriate response based on intent
  let message = "I'm not sure I understand. Can you please rephrase that?";
  let dialogState = 'ElicitIntent';
  
  switch (intent) {
    case 'appointment':
      message = "I'd be happy to help you schedule an appointment. What day and time works best for you?";
      dialogState = 'ElicitSlot';
      break;
    case 'business_hours':
      message = "Our business hours are Monday to Friday from 9 AM to 5 PM, and Saturdays from 10 AM to 2 PM. We're closed on Sundays.";
      dialogState = 'Fulfilled';
      break;
    case 'pricing':
      message = "Our pricing varies depending on the specific service you need. Can you tell me what service you're interested in?";
      dialogState = 'ElicitSlot';
      break;
    case 'location':
      message = "We're located at 123 Main Street, Suite 100, Anytown, USA 12345. Would you like directions?";
      dialogState = 'ElicitIntent';
      break;
    case 'services':
      message = "We offer a wide range of services including repairs, maintenance, and installations. What specific service are you looking for?";
      dialogState = 'ElicitSlot';
      break;
    case 'emergency':
      message = "I understand this is an emergency. Let me connect you with our on-call staff right away.";
      dialogState = 'ReadyForFulfillment';
      break;
    default:
      message = "Thank you for contacting us. How can we help you today?";
      dialogState = 'ElicitIntent';
  }
  
  return {
    intentName: intent,
    slots: {},
    sessionAttributes: { businessType },
    message,
    dialogState,
    isEmergency,
    originalText: text
  };
}

export default {
  sendTextInput,
  sendVoiceInput,
  analyzeText,
  detectIntent,
  detectEmergency
};