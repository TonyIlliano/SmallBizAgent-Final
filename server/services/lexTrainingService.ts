/**
 * AWS Lex Training Service for SmallBizAgent
 * 
 * This service handles training operations for Amazon Lex bot:
 * - Creating and updating bot intents
 * - Managing sample utterances for intents
 * - Building and publishing the bot
 */

import { LexModelsV2Client } from "@aws-sdk/client-lex-models-v2";

// Initialize Lex client with environment variables
const region = process.env.AWS_REGION || 'us-east-1';
const lexClient = new LexModelsV2Client({
  region,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ''
  }
});

// Lex bot configuration
const botId = process.env.AWS_LEX_BOT_NAME || 'SmallBizAgent';
const botAliasId = process.env.AWS_LEX_BOT_ALIAS || 'Prod';
const locale = 'en_US';

/**
 * Represents a bot intent with its configuration
 */
export interface BotIntent {
  name: string;
  description: string;
  sampleUtterances: string[];
  slots?: BotSlot[];
}

/**
 * Represents a slot in an intent
 */
export interface BotSlot {
  name: string;
  description: string;
  slotConstraint: string;
  slotType: string;
  valueElicitationPrompt: {
    messages: {
      contentType: string;
      content: string;
    }[];
    maxAttempts: number;
  };
}

/**
 * Get bot information
 * @returns Bot information response
 */
export async function getBot() {
  try {
    // For now, we'll return simulated data
    // This would typically make an API call to AWS Lex
    // to get bot information
    return {
      botStatus: 'AVAILABLE',
      lastUpdatedDateTime: new Date(),
      botName: botId,
      botAlias: botAliasId,
      locale
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error getting bot information:', errorMessage);
    throw error;
  }
}

/**
 * List all intents in the bot
 * @returns List of intents
 */
export async function listIntents() {
  try {
    // In a real implementation, we would use:
    // const command = new ListIntentsCommand({...});
    // const response = await lexClient.send(command);
    
    // For now, return simulated intents
    return getSimulatedIntents().map((intent, index) => ({
      intentId: `intent-${index}`,
      intentName: intent.name,
      description: intent.description
    }));
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error listing intents:', errorMessage);
    throw error;
  }
}

/**
 * Get detailed information about an intent
 * @param intentId Intent ID to retrieve
 * @returns Intent details
 */
export async function getIntent(intentId: string) {
  try {
    // In a real implementation, we would use:
    // const command = new GetIntentCommand({...});
    // const response = await lexClient.send(command);
    
    // For now, simulate getting an intent
    const index = parseInt(intentId.split('-')[1]);
    const intent = getSimulatedIntents()[index];
    
    if (!intent) {
      return null;
    }
    
    return {
      intentId,
      intentName: intent.name,
      description: intent.description,
      sampleUtterances: intent.sampleUtterances.map(u => ({ utterance: u }))
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error getting intent:', errorMessage);
    throw error;
  }
}

/**
 * Create a new intent in the bot
 * @param intent Intent configuration
 * @returns Created intent response
 */
export async function createIntent(intent: BotIntent) {
  try {
    // In a real implementation, we would use:
    // const command = new CreateIntentCommand({...});
    // const response = await lexClient.send(command);
    
    // For now, simulate creating an intent
    const simulatedIntent = addSimulatedIntent(intent);
    
    return {
      intentId: simulatedIntent.intentId,
      intentName: intent.name,
      description: intent.description
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error creating intent:', errorMessage);
    throw error;
  }
}

/**
 * Update an existing intent
 * @param intentId Intent ID to update
 * @param intent Updated intent configuration
 * @returns Operation success status
 */
export async function updateIntent(intentId: string, intent: BotIntent) {
  try {
    // In a real implementation, we would use:
    // const command = new UpdateIntentCommand({...});
    // const response = await lexClient.send(command);
    
    // For now, simulate updating an intent
    const index = parseInt(intentId.split('-')[1]);
    
    if (index >= 0 && index < DEFAULT_INTENTS.length) {
      DEFAULT_INTENTS[index] = intent;
    }
    
    return {
      intentId,
      intentName: intent.name,
      description: intent.description
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error updating intent:', errorMessage);
    throw error;
  }
}

/**
 * Delete an intent from the bot
 * @param intentId Intent ID to delete
 * @returns Operation success status
 */
export async function deleteIntent(intentId: string) {
  try {
    // In a real implementation, we would use:
    // const command = new DeleteIntentCommand({...});
    // const response = await lexClient.send(command);
    
    // For now, simulate deleting an intent
    const index = parseInt(intentId.split('-')[1]);
    
    if (index >= 0 && index < DEFAULT_INTENTS.length) {
      DEFAULT_INTENTS.splice(index, 1);
    }
    
    return { success: true };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error deleting intent:', errorMessage);
    throw error;
  }
}

/**
 * Build the bot locale to apply changes
 * @returns Build status
 */
export async function buildBotLocale() {
  try {
    // In a real implementation, we would use:
    // const command = new BuildBotLocaleCommand({...});
    // const response = await lexClient.send(command);
    
    // For now, simulate building the bot
    return {
      botId,
      botVersion: 'DRAFT',
      localeId: locale,
      buildStatus: 'IN_PROGRESS'
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error building bot locale:', errorMessage);
    throw error;
  }
}

/**
 * Get the training status of the bot
 */
export async function getTrainingStatus() {
  try {
    const botInfo = await getBot();
    return {
      status: botInfo?.botStatus || 'UNKNOWN',
      lastUpdated: botInfo?.lastUpdatedDateTime || new Date(),
      intents: await listIntents()
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error getting training status:', errorMessage);
    return {
      status: 'ERROR',
      error: errorMessage
    };
  }
}

/**
 * Simulated training functions for development and testing
 */

// Common business intents
const DEFAULT_INTENTS = [
  {
    name: 'Appointment',
    description: 'Schedule an appointment or booking',
    sampleUtterances: [
      'I need to schedule an appointment',
      'Book a time slot',
      'Make a reservation',
      'Schedule a consultation',
      'Book an appointment'
    ]
  },
  {
    name: 'BusinessHours',
    description: 'Ask about business hours',
    sampleUtterances: [
      'What are your hours?',
      'When are you open?',
      'Are you open on Saturdays?',
      'What time do you close?',
      'Are you open right now?'
    ]
  },
  {
    name: 'Services',
    description: 'Ask about services offered',
    sampleUtterances: [
      'What services do you offer?',
      'Do you provide installation?',
      'Can you help with repairs?',
      'What do you specialize in?',
      'Tell me about your services'
    ]
  },
  {
    name: 'Pricing',
    description: 'Ask about pricing and rates',
    sampleUtterances: [
      'How much does it cost?',
      'What are your rates?',
      'Do you offer any discounts?',
      'Price for service',
      'How much do you charge for a consultation?'
    ]
  },
  {
    name: 'Emergency',
    description: 'Report an emergency or urgent issue',
    sampleUtterances: [
      'This is an emergency',
      'I need immediate help',
      'Urgent situation',
      'Need assistance right away',
      'Critical problem'
    ]
  }
];

/**
 * Get simulated intent list when AWS is not available
 */
export function getSimulatedIntents() {
  return DEFAULT_INTENTS;
}

/**
 * Add a new simulated intent
 */
export function addSimulatedIntent(intent: BotIntent) {
  DEFAULT_INTENTS.push(intent);
  return {
    intentId: `sim-${Date.now()}`,
    intentName: intent.name,
    description: intent.description
  };
}