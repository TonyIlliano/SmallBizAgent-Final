/**
 * Retell AI Service
 *
 * Manages Retell AI agents and LLM resources for voice receptionist.
 * Each business gets one Retell LLM (prompt + tools) and one Retell Agent (voice + behavior).
 *
 * Retell architecture:
 *   1. Retell LLM - holds the system prompt, tool definitions, model config
 *   2. Retell Agent - holds voice, behavior config, references the LLM
 *
 * All API calls go through the centralized retellFetch() helper with auth, logging, and error handling.
 */

import { storage } from '../storage';
import { Business, Service, ReceptionistConfig } from '@shared/schema';

const RETELL_API_KEY = process.env.RETELL_API_KEY;
const RETELL_BASE_URL = 'https://api.retellai.com';
const APP_URL = process.env.APP_URL || 'https://www.smallbizagent.ai';

/**
 * Retell-specific provider hints for the system prompt builder.
 * - silenceDuringTools: false — Retell handles this via speak_during_execution on each tool
 * - endCallInstruction: tells AI to call the end_call tool (Retell has no endCallPhrases)
 */
const RETELL_PROVIDER_HINTS = {
  silenceDuringTools: false,
  endCallInstruction: 'When the conversation is complete and the caller has no more questions, call the end_call tool to hang up. Do NOT just say goodbye — you MUST call end_call or the call will stay open.',
  toolCallFormat: 'Call tools by name. Retell will execute them and return results.',
};

// ---------------------------------------------------------------------------
// Voice Options
// ---------------------------------------------------------------------------

/** Voice options from all providers (ElevenLabs, Cartesia, OpenAI) */
export const RETELL_VOICE_OPTIONS = [
  // ElevenLabs voices (prefix: 11labs-)
  { id: '11labs-Adrian', name: 'Adrian', gender: 'Male', provider: 'ElevenLabs' },
  { id: '11labs-Myra', name: 'Myra', gender: 'Female', provider: 'ElevenLabs' },
  { id: '11labs-Brian', name: 'Brian', gender: 'Male', provider: 'ElevenLabs' },
  { id: '11labs-Hailey', name: 'Hailey', gender: 'Female', provider: 'ElevenLabs' },
  { id: '11labs-Sarah', name: 'Sarah', gender: 'Female', provider: 'ElevenLabs' },
  { id: '11labs-Jason', name: 'Jason', gender: 'Male', provider: 'ElevenLabs' },
  { id: '11labs-Jenny', name: 'Jenny', gender: 'Female', provider: 'ElevenLabs' },
  { id: '11labs-James', name: 'James', gender: 'Male', provider: 'ElevenLabs' },
  // Cartesia Sonic-3 voices (prefix: cartesia-)
  { id: 'cartesia-Ryan', name: 'Ryan', gender: 'Male', provider: 'Cartesia' },
  { id: 'cartesia-Marissa', name: 'Marissa', gender: 'Female', provider: 'Cartesia' },
  { id: 'cartesia-Nathan', name: 'Nathan', gender: 'Male', provider: 'Cartesia' },
  { id: 'cartesia-Cimo', name: 'Cimo', gender: 'Female', provider: 'Cartesia' },
  { id: 'cartesia-Sarah', name: 'Sarah', gender: 'Female', provider: 'Cartesia' },
  { id: 'cartesia-Adam', name: 'Adam', gender: 'Male', provider: 'Cartesia' },
  { id: 'cartesia-Hailey', name: 'Hailey', gender: 'Female', provider: 'Cartesia' },
  { id: 'cartesia-Jason', name: 'Jason', gender: 'Male', provider: 'Cartesia' },
  // OpenAI voices (prefix: openai-)
  { id: 'openai-Alloy', name: 'Alloy', gender: 'Male', provider: 'OpenAI' },
  { id: 'openai-Echo', name: 'Echo', gender: 'Male', provider: 'OpenAI' },
  { id: 'openai-Nova', name: 'Nova', gender: 'Female', provider: 'OpenAI' },
  { id: 'openai-Shimmer', name: 'Shimmer', gender: 'Female', provider: 'OpenAI' },
  { id: 'openai-Sage', name: 'Sage', gender: 'Female', provider: 'OpenAI' },
  { id: 'openai-Coral', name: 'Coral', gender: 'Female', provider: 'OpenAI' },
];

/**
 * Map legacy Vapi voice IDs to Retell-compatible IDs.
 * Old Vapi config stored ElevenLabs IDs like "paula", "rachel", etc.
 * Retell needs IDs in format "11labs-Name" or Retell-native IDs.
 */
const VAPI_TO_RETELL_VOICE_MAP: Record<string, string> = {
  'paula': '11labs-Myra',
  'rachel': '11labs-Sarah',
  'domi': '11labs-Aria',
  'bella': '11labs-Laura',
  'elli': '11labs-Myra',
  'adam': '11labs-Adrian',
  'antoni': '11labs-Brian',
  'josh': '11labs-Roger',
  'arnold': '11labs-George',
  'sam': '11labs-Adrian',
};

function resolveVoiceId(voiceId: string | null | undefined): string {
  if (!voiceId) return '11labs-Adrian';
  // If it already has a valid provider prefix, use it directly
  if (voiceId.startsWith('11labs-') || voiceId.startsWith('openai-') || voiceId.startsWith('retell-') || voiceId.startsWith('cartesia-') || voiceId.startsWith('minimax-') || voiceId.startsWith('fish_audio-')) return voiceId;
  // Map old Vapi voice IDs (bare ElevenLabs names like 'paula', 'rachel')
  const mapped = VAPI_TO_RETELL_VOICE_MAP[voiceId.toLowerCase()];
  if (mapped) return mapped;
  // Try treating bare name as Cartesia voice (old UI stored 'Ryan' not 'cartesia-Ryan')
  const asCartesia = `cartesia-${voiceId}`;
  const validCartesia = RETELL_VOICE_OPTIONS.find(v => v.id === asCartesia);
  if (validCartesia) return asCartesia;
  // Try treating bare name as any provider
  const exactMatch = RETELL_VOICE_OPTIONS.find(v => v.name.toLowerCase() === voiceId.toLowerCase());
  if (exactMatch) return exactMatch.id;
  // Unknown voice — default
  console.warn(`[Retell] Unknown voice ID "${voiceId}", defaulting to 11labs-Adrian`);
  return '11labs-Adrian';
}

/**
 * Determine the best voice_model for a given voice_id.
 * Cartesia voices use Sonic-3 (lowest latency), ElevenLabs use v2_5, OpenAI use their default.
 */
function getVoiceModel(voiceId: string): string | null {
  if (!voiceId) return null;
  const id = voiceId.toLowerCase();
  // Cartesia voices (prefix: cartesia-) or Retell platform voices
  if (id.startsWith('cartesia-') || id.startsWith('retell-')) {
    return 'sonic-3';
  }
  // ElevenLabs voices
  if (id.startsWith('11labs-')) {
    return 'eleven_turbo_v2_5';
  }
  // OpenAI voices — tts-1 is OpenAI's highest quality option available in Retell
  if (id.startsWith('openai-')) {
    return 'tts-1';
  }
  return null; // Let Retell use its default
}

// ---------------------------------------------------------------------------
// Centralized HTTP Helper
// ---------------------------------------------------------------------------

interface RetellFetchResult<T = any> {
  data?: T;
  error?: string;
  status?: number;
}

/**
 * Centralized HTTP helper for all Retell API calls.
 * Adds auth header, logs requests, and normalizes error handling.
 */
async function retellFetch<T = any>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: Record<string, any>
): Promise<RetellFetchResult<T>> {
  if (!RETELL_API_KEY) {
    return { error: 'RETELL_API_KEY not configured' };
  }

  const url = `${RETELL_BASE_URL}${path}`;
  const headers: Record<string, string> = {
    'Authorization': `Bearer ${RETELL_API_KEY}`,
  };
  if (body) {
    headers['Content-Type'] = 'application/json';
  }

  try {
    console.log(`[Retell] ${method} ${path}`);

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Retell] ${method} ${path} failed (${response.status}):`, errorText);
      return { error: `Retell API error (${response.status}): ${errorText}`, status: response.status };
    }

    // DELETE responses may have no body
    if (response.status === 204 || method === 'DELETE') {
      return { data: {} as T, status: response.status };
    }

    const data = await response.json();
    return { data, status: response.status };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[Retell] ${method} ${path} exception:`, message);
    return { error: `Retell fetch error: ${message}` };
  }
}

// ---------------------------------------------------------------------------
// First Message Builder
// ---------------------------------------------------------------------------

/**
 * Build the begin_message that plays when the call connects.
 *
 * Rules:
 * 1. Only includes recording disclosure when Call Recording is enabled.
 * 2. Uses the business's custom greeting if set.
 * 3. Always ends with an engagement question to prompt the caller.
 */
function buildFirstMessage(
  businessName: string,
  customGreeting?: string | null,
  callRecordingEnabled?: boolean
): string {
  console.log(`[Retell] buildFirstMessage: recording=${callRecordingEnabled}, customGreeting="${customGreeting?.substring(0, 50) || 'none'}"`);
  const recordingNotice = callRecordingEnabled
    ? 'Just so you know, this call may be recorded for quality purposes. '
    : '';

  if (customGreeting && customGreeting.trim()) {
    const msg = `${recordingNotice}${customGreeting.trim()}`;
    console.log(`[Retell] begin_message: "${msg.substring(0, 100)}"`);
    return msg;
  }

  const msg = `${recordingNotice}Thanks for calling ${businessName}! How can I help you today?`;
  console.log(`[Retell] begin_message: "${msg.substring(0, 100)}"`);
  return msg;
}

// ---------------------------------------------------------------------------
// Retell Tool Definitions Builder
// ---------------------------------------------------------------------------

interface BuildToolsOptions {
  isRestaurant?: boolean;
  hasMenu?: boolean;
  hasReservations?: boolean;
  voicemailEnabled?: boolean;
  transferNumber?: string | null;
}

/**
 * Build all Retell tool definitions for a business.
 * Maps ALL 30 tools from the Vapi service (getAssistantFunctions + getRestaurantFunctions
 * + getReservationFunctions) to Retell's custom tool format, plus built-in tools.
 */
function buildRetellTools(businessId: number, options: BuildToolsOptions = {}): any[] {
  const webhookUrl = `${APP_URL}/api/retell/function`;
  const tools: any[] = [];

  // ---- Helper to create a custom tool definition ----
  function customTool(
    name: string,
    description: string,
    parameters: Record<string, any>,
    opts: {
      speakDuring?: boolean;
      speakAfter?: boolean;
      timeout?: number;
    } = {}
  ) {
    return {
      type: 'custom',
      name,
      description,
      url: webhookUrl,
      method: 'POST',
      speak_during_execution: opts.speakDuring ?? false,
      speak_after_execution: opts.speakAfter ?? true,
      timeout_ms: opts.timeout ?? 10000,
      parameters,
    };
  }

  // ---- Standard Appointment/Service Tools (from getAssistantFunctions) ----

  tools.push(customTool(
    'checkAvailability',
    'Check available appointment slots for a specific date. Pass the caller\'s exact date words as-is.',
    {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'What the caller said: "tomorrow", "this Thursday", "April 7th". Pass as-is.' },
        serviceId: { type: 'number', description: 'Service ID if known' },
        staffId: { type: 'number', description: 'Staff member ID if known' },
        staffName: { type: 'string', description: 'Staff member name if preferred' },
      },
      required: ['date'],
    }
  ));

  tools.push(customTool(
    'bookAppointment',
    'Book after customer confirms. Pass customerId + customerName + serviceName + exact date from checkAvailability.',
    {
      type: 'object',
      properties: {
        customerId: { type: 'number', description: 'Customer ID from recognizeCaller' },
        customerPhone: { type: 'string', description: 'Customer phone' },
        customerName: { type: 'string', description: 'Customer full name (required)' },
        date: { type: 'string', description: 'Use the dateForBooking value from checkAvailability response.' },
        time: { type: 'string', description: 'Time like "2pm" or "14:00"' },
        serviceId: { type: 'number', description: 'Service ID' },
        serviceName: { type: 'string', description: 'Service name (required)' },
        staffId: { type: 'number', description: 'Staff member ID' },
        staffName: { type: 'string', description: 'Staff member name' },
        notes: { type: 'string', description: 'Special requests or notes' },
      },
      required: ['customerPhone', 'customerName', 'date', 'time'],
    },
    { speakDuring: true }  // AI says "Let me book that for you" while DB processes
  ));

  tools.push(customTool(
    'getServices',
    'Get services with prices.',
    { type: 'object', properties: {} }
  ));

  tools.push(customTool(
    'getStaffMembers',
    'Refresh team member list (already pre-loaded in prompt -- only call if needed mid-call).',
    { type: 'object', properties: {} }
  ));

  tools.push(customTool(
    'getStaffSchedule',
    'Get a staff member\'s working hours.',
    {
      type: 'object',
      properties: {
        staffName: { type: 'string', description: 'Staff member name' },
        staffId: { type: 'number', description: 'Staff member ID' },
      },
    }
  ));

  tools.push(customTool(
    'getBusinessHours',
    'Get business hours and open/closed status.',
    { type: 'object', properties: {} }
  ));

  tools.push(customTool(
    'recognizeCaller',
    'Identify returning caller. Call once at start — the begin_message already greets them so stay silent until results come back. Then personalize your first response using the summary.',
    { type: 'object', properties: {} },
    { speakDuring: false, speakAfter: true, timeout: 8000 }
  ));

  tools.push(customTool(
    'getUpcomingAppointments',
    'Get caller\'s upcoming appointments. Only call if recognizeCaller did not already return appointment details.',
    { type: 'object', properties: {} }
  ));

  tools.push(customTool(
    'rescheduleAppointment',
    'Move an existing appointment to a new date/time.',
    {
      type: 'object',
      properties: {
        appointmentId: { type: 'number', description: 'Appointment ID' },
        newDate: { type: 'string', description: 'New date' },
        newTime: { type: 'string', description: 'New time' },
        staffName: { type: 'string', description: 'New staff member name if switching' },
      },
      required: ['newDate', 'newTime'],
    },
    { speakDuring: true }  // AI says "Let me move that for you" while DB processes
  ));

  tools.push(customTool(
    'cancelAppointment',
    'Cancel an existing appointment.',
    {
      type: 'object',
      properties: {
        appointmentId: { type: 'number', description: 'Appointment ID' },
        reason: { type: 'string', description: 'Cancellation reason' },
      },
    }
  ));

  // leaveMessage — only if voicemail is enabled
  if (options.voicemailEnabled !== false) {
    tools.push(customTool(
      'leaveMessage',
      'Leave a message for the owner. Only use if caller explicitly asks.',
      {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'The message' },
          callbackRequested: { type: 'boolean', description: 'Whether a callback was requested' },
        },
        required: ['message'],
      }
    ));
  }

  tools.push(customTool(
    'updateCustomerInfo',
    'Save or update caller\'s name. Call immediately when a new caller tells you their name.',
    {
      type: 'object',
      properties: {
        customerId: { type: 'number', description: 'Customer ID from recognizeCaller' },
        firstName: { type: 'string', description: 'First name' },
        lastName: { type: 'string', description: 'Last name' },
        email: { type: 'string', description: 'Email address' },
      },
    }
  ));

  tools.push(customTool(
    'confirmAppointment',
    'Confirm a caller\'s upcoming appointment. Only call when the caller explicitly says "confirm".',
    {
      type: 'object',
      properties: {
        appointmentId: { type: 'number', description: 'Appointment ID if known' },
        confirmed: { type: 'boolean', description: 'true to confirm' },
      },
      required: ['confirmed'],
    }
  ));

  tools.push(customTool(
    'getEstimate',
    'Get a price estimate for one or more services.',
    {
      type: 'object',
      properties: {
        serviceNames: { type: 'array', items: { type: 'string' }, description: 'Service names to estimate' },
        description: { type: 'string', description: 'What the customer described needing' },
      },
    }
  ));

  tools.push(customTool(
    'checkWaitTime',
    'Check current wait time and next available slot for today.',
    { type: 'object', properties: {} }
  ));

  tools.push(customTool(
    'getServiceDetails',
    'Get detailed info about a specific service. Only call when caller explicitly asks about price or duration.',
    {
      type: 'object',
      properties: {
        serviceName: { type: 'string', description: 'Name of the service to look up' },
      },
      required: ['serviceName'],
    }
  ));

  tools.push(customTool(
    'getCustomerInfo',
    'Get customer details. Only use if caller asks to verify their info on file.',
    { type: 'object', properties: {} }
  ));

  tools.push(customTool(
    'scheduleCallback',
    'Schedule a callback only when the caller explicitly says "call me back" or "have someone call me."',
    {
      type: 'object',
      properties: {
        preferredTime: { type: 'string', description: 'When the caller would like to be called back' },
        reason: { type: 'string', description: 'Why they need a callback' },
      },
    }
  ));

  tools.push(customTool(
    'getDirections',
    'Get the business address. Read the address aloud and offer to text a Google Maps link to the caller.',
    {
      type: 'object',
      properties: {
        sendSms: { type: 'boolean', description: 'Set true to text caller a Google Maps link after they confirm.' },
      },
    }
  ));

  tools.push(customTool(
    'bookRecurringAppointment',
    'Set up a recurring appointment series (weekly, biweekly, or monthly).',
    {
      type: 'object',
      properties: {
        customerId: { type: 'number', description: 'Customer ID from recognizeCaller' },
        customerName: { type: 'string', description: 'Customer full name' },
        customerPhone: { type: 'string', description: 'Customer phone' },
        serviceId: { type: 'number', description: 'Service ID' },
        serviceName: { type: 'string', description: 'Service name' },
        staffId: { type: 'number', description: 'Preferred staff ID' },
        staffName: { type: 'string', description: 'Preferred staff name' },
        startDate: { type: 'string', description: 'When to start the series' },
        time: { type: 'string', description: 'Appointment time' },
        frequency: { type: 'string', description: 'weekly, biweekly, or monthly' },
        occurrences: { type: 'number', description: 'Total number of appointments. Default 4.' },
        notes: { type: 'string', description: 'Notes about the recurring appointment' },
      },
      required: ['startDate', 'time', 'frequency', 'serviceName'],
    }
  ));

  // ---- Restaurant Tools (from getRestaurantFunctions) ----

  if (options.isRestaurant && options.hasMenu) {
    tools.push(customTool(
      'getMenu',
      'Get the full restaurant menu with categories, items, prices, and modifiers.',
      { type: 'object', properties: {} }
    ));

    tools.push(customTool(
      'getMenuCategory',
      'Get items in a specific menu category (e.g., "appetizers", "entrees", "drinks").',
      {
        type: 'object',
        properties: {
          categoryName: { type: 'string', description: 'The category name to look up' },
        },
        required: ['categoryName'],
      }
    ));

    tools.push(customTool(
      'createOrder',
      'Place an order in the restaurant POS. Only call after reading back the complete order and getting confirmation.',
      {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            description: 'Array of items to order',
            items: {
              type: 'object',
              properties: {
                itemId: { type: 'string', description: 'Exact item name from the menu' },
                quantity: { type: 'number', description: 'Number to order' },
                modifiers: {
                  type: 'array',
                  description: 'Selected modifiers',
                  items: {
                    type: 'object',
                    properties: {
                      modifierId: { type: 'string', description: 'Modifier ID' },
                    },
                    required: ['modifierId'],
                  },
                },
                notes: { type: 'string', description: 'Special instructions for this item' },
              },
              required: ['itemId', 'quantity'],
            },
          },
          callerPhone: { type: 'string', description: 'Customer phone number' },
          callerName: { type: 'string', description: 'Customer name' },
          orderType: { type: 'string', description: 'pickup, delivery, or dine_in' },
          orderNotes: { type: 'string', description: 'General notes for the order' },
        },
        required: ['items', 'callerName'],
      },
      { timeout: 15000 } // Orders may take longer
    ));
  }

  // ---- Reservation Tools (from getReservationFunctions) ----

  if (options.isRestaurant && options.hasReservations) {
    tools.push(customTool(
      'checkReservationAvailability',
      'Check available reservation times for a given date and party size.',
      {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'The date in natural language or YYYY-MM-DD' },
          partySize: { type: 'number', description: 'Number of guests' },
        },
        required: ['date', 'partySize'],
      }
    ));

    tools.push(customTool(
      'makeReservation',
      'Book a reservation after confirming all details with the customer.',
      {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'Reservation date (YYYY-MM-DD from availability response)' },
          time: { type: 'string', description: 'Reservation time (HH:MM 24-hour from availability response)' },
          partySize: { type: 'number', description: 'Number of guests' },
          customerName: { type: 'string', description: 'Full name of the customer' },
          specialRequests: { type: 'string', description: 'Special requests (dietary, celebrations, seating)' },
        },
        required: ['date', 'time', 'partySize', 'customerName'],
      }
    ));

    tools.push(customTool(
      'cancelReservation',
      'Cancel an existing reservation.',
      {
        type: 'object',
        properties: {
          customerName: { type: 'string', description: 'Name of the customer who made the reservation' },
          date: { type: 'string', description: 'Date of the reservation to cancel (optional)' },
        },
        required: ['customerName'],
      }
    ));
  }

  // ---- Built-in Tools ----

  // end_call: always included so the agent can hang up after goodbye
  tools.push({
    type: 'end_call',
    name: 'end_call',
    description: 'End the call after saying goodbye.',
  });

  // transferToHuman: custom tool that logs the transfer request, then Retell's
  // agent-level transfer handles the actual call routing
  if (options.transferNumber) {
    tools.push(customTool(
      'transferToHuman',
      'Transfer the caller to a human staff member. Use when caller explicitly asks to speak to a person or when you cannot resolve their issue.',
      {
        type: 'object',
        properties: {
          reason: { type: 'string', description: 'Why the caller wants to be transferred' },
          callerName: { type: 'string', description: 'Caller name if known' },
        },
      }
    ));
  }

  return tools;
}

// ---------------------------------------------------------------------------
// LLM Management
// ---------------------------------------------------------------------------

/**
 * Create a Retell LLM resource for a business.
 * The LLM holds the system prompt, tool definitions, and model configuration.
 */
export async function createLlmForBusiness(
  business: Business,
  services: Service[],
  hours: any[],
  receptionistConfig: ReceptionistConfig | null | undefined,
  knowledgeSection: string
): Promise<{ llmId?: string; error?: string }> {
  // Build system prompt — use systemPromptBuilder when it exists, otherwise placeholder
  let systemPrompt: string;
  try {
    const { generateSystemPrompt } = await import('./systemPromptBuilder');
    systemPrompt = generateSystemPrompt(
      business, services, hours,
      null,             // menuData (loaded dynamically during calls for restaurants)
      { receptionistConfig, staff: (business as any)._staff },  // options
      knowledgeSection, // knowledgeSection
      Array.isArray(receptionistConfig?.transferPhoneNumbers) ? receptionistConfig!.transferPhoneNumbers as string[] : [],
      (business as any)._intelligenceHints,  // intelligenceHints
      RETELL_PROVIDER_HINTS,                 // providerHints for Retell
    );
  } catch (promptErr) {
    // systemPromptBuilder failed — use fallback (log so we can debug)
    console.error('[Retell] generateSystemPrompt failed, using fallback:', (promptErr as Error)?.message || promptErr);
    systemPrompt = buildFallbackSystemPrompt(business, services, hours, receptionistConfig, knowledgeSection, (business as any)._staff);
  }

  const isRestaurant = business.industry?.toLowerCase()?.includes('restaurant');
  const voicemailEnabled = receptionistConfig?.voicemailEnabled ?? true;

  // Determine transfer number
  const transferNumbers: string[] = Array.isArray(receptionistConfig?.transferPhoneNumbers)
    ? receptionistConfig!.transferPhoneNumbers as string[]
    : [];
  const transferNumber = transferNumbers[0] || business.phone || null;

  const tools = buildRetellTools(business.id, {
    isRestaurant,
    hasMenu: isRestaurant && !!(business.cloverMerchantId || business.squareAccessToken || business.heartlandApiKey),
    hasReservations: isRestaurant && !!(business as any).reservationEnabled,
    voicemailEnabled,
    transferNumber,
  });

  // Build the begin_message (greeting + optional recording disclosure)
  const configRecordingEnabled = receptionistConfig?.callRecordingEnabled ?? true;
  const configGreeting = receptionistConfig?.greeting || undefined;
  const beginMessage = buildFirstMessage(business.name, configGreeting, configRecordingEnabled);
  console.log(`[Retell] createLlm begin_message: "${beginMessage.substring(0, 100)}"`);

  const result = await retellFetch<{ llm_id: string }>('POST', '/create-retell-llm', {
    model: 'gpt-5-mini',
    model_temperature: 0.6,
    general_prompt: systemPrompt,
    general_tools: tools,
    begin_message: beginMessage,
    default_dynamic_variables: {
      businessId: String(business.id),
    },
  });

  if (result.error) {
    return { error: result.error };
  }

  const llmId = result.data?.llm_id;
  if (!llmId) {
    return { error: 'No llm_id returned from Retell API' };
  }

  console.log(`[Retell] Created LLM for business ${business.id}: ${llmId}`);
  return { llmId };
}

/**
 * Update an existing Retell LLM resource.
 */
export async function updateLlm(
  llmId: string,
  business: Business,
  services: Service[],
  hours: any[],
  receptionistConfig: ReceptionistConfig | null | undefined,
  knowledgeSection: string
): Promise<{ success: boolean; error?: string }> {
  // Build system prompt — use systemPromptBuilder when it exists, otherwise placeholder
  let systemPrompt: string;
  try {
    const { generateSystemPrompt } = await import('./systemPromptBuilder');
    systemPrompt = generateSystemPrompt(
      business, services, hours,
      null,             // menuData (loaded dynamically during calls for restaurants)
      { receptionistConfig, staff: (business as any)._staff },  // options
      knowledgeSection, // knowledgeSection
      Array.isArray(receptionistConfig?.transferPhoneNumbers) ? receptionistConfig!.transferPhoneNumbers as string[] : [],
      (business as any)._intelligenceHints,  // intelligenceHints
      RETELL_PROVIDER_HINTS,                 // providerHints for Retell
    );
  } catch {
    systemPrompt = buildFallbackSystemPrompt(business, services, hours, receptionistConfig, knowledgeSection);
  }

  const isRestaurant = business.industry?.toLowerCase()?.includes('restaurant');
  const voicemailEnabled = receptionistConfig?.voicemailEnabled ?? true;

  const transferNumbers: string[] = Array.isArray(receptionistConfig?.transferPhoneNumbers)
    ? receptionistConfig!.transferPhoneNumbers as string[]
    : [];
  const transferNumber = transferNumbers[0] || business.phone || null;

  const tools = buildRetellTools(business.id, {
    isRestaurant,
    hasMenu: isRestaurant && !!(business.cloverMerchantId || business.squareAccessToken || business.heartlandApiKey),
    hasReservations: isRestaurant && !!(business as any).reservationEnabled,
    voicemailEnabled,
    transferNumber,
  });

  // Build the begin_message (greeting + optional recording disclosure)
  const configRecordingEnabled = receptionistConfig?.callRecordingEnabled ?? true;
  const configGreeting = receptionistConfig?.greeting || undefined;
  const beginMessage = buildFirstMessage(business.name, configGreeting, configRecordingEnabled);
  console.log(`[Retell] updateLlm begin_message: "${beginMessage.substring(0, 100)}"`);

  const result = await retellFetch('PATCH', `/update-retell-llm/${llmId}`, {
    model: 'gpt-5-mini',
    model_temperature: 0.6,
    general_prompt: systemPrompt,
    general_tools: tools,
    begin_message: beginMessage,
  });

  if (result.error) {
    return { success: false, error: result.error };
  }

  console.log(`[Retell] Updated LLM ${llmId} for business ${business.id}`);
  return { success: true };
}

/**
 * Delete a Retell LLM resource.
 */
export async function deleteLlm(llmId: string): Promise<{ success: boolean; error?: string }> {
  const result = await retellFetch('DELETE', `/delete-retell-llm/${llmId}`);

  if (result.error) {
    return { success: false, error: result.error };
  }

  console.log(`[Retell] Deleted LLM ${llmId}`);
  return { success: true };
}

// ---------------------------------------------------------------------------
// Agent Management
// ---------------------------------------------------------------------------

/**
 * Create a Retell Agent for a business.
 * The agent holds voice config, behavior settings, and references the LLM.
 */
export async function createAgentForBusiness(
  llmId: string,
  business: Business,
  receptionistConfig: ReceptionistConfig | null | undefined
): Promise<{ agentId?: string; error?: string }> {
  const configVoiceId = resolveVoiceId(receptionistConfig?.voiceId);
  const configRecordingEnabled = receptionistConfig?.callRecordingEnabled ?? true;
  const configMaxCallMinutes = receptionistConfig?.maxCallLengthMinutes ?? 15;
  const configGreeting = receptionistConfig?.greeting || undefined;

  const beginMessage = buildFirstMessage(business.name, configGreeting, configRecordingEnabled);

  const agentConfig: Record<string, any> = {
    response_engine: {
      type: 'retell-llm',
      llm_id: llmId,
    },
    voice_id: configVoiceId,
    voice_model: getVoiceModel(configVoiceId),
    agent_name: `${business.name} Receptionist`,
    language: 'en-US',
    stt_mode: 'accurate',  // Best transcription quality — critical for names, dates, service names
    webhook_url: `${APP_URL}/api/retell/webhook`,
    responsiveness: 0.5,             // Lower = more patient, waits for caller to finish
    interruption_sensitivity: 0.4,   // Lower = harder to interrupt, prevents cutting off callers
    end_call_after_silence_ms: 30000,
    max_call_duration_ms: configMaxCallMinutes * 60 * 1000,
    enable_backchannel: true,
    backchannel_frequency: 0.6,
    reminder_trigger_ms: 10000,
    reminder_max_count: 1,
    ambient_sound: null,
    enable_voicemail_detection: true,
    voicemail_message: `Hi, this is ${business.name}'s AI assistant. We missed your call. Please call us back and we'll be happy to help you.`,
    normalize_for_speech: true,
    opt_out_sensitive_data_storage: false,
    post_call_analysis_data: [
      { type: 'string', name: 'call_intent', description: 'What the caller wanted: booking, inquiry, reschedule, cancel, complaint, other' },
      { type: 'string', name: 'call_outcome', description: 'How the call ended: booked, rescheduled, cancelled, info_provided, transferred, no_action' },
      { type: 'enum', name: 'caller_sentiment', description: 'Overall caller sentiment', choices: ['positive', 'neutral', 'negative'] },
    ],
    metadata: {
      businessId: business.id.toString(),
      platform: 'smallbizagent',
    },
  };

  // Add noise cancellation
  agentConfig.denoising_mode = 'noise-cancellation';

  const result = await retellFetch<{ agent_id: string }>('POST', '/create-agent', agentConfig);

  if (result.error) {
    return { error: result.error };
  }

  const agentId = result.data?.agent_id;
  if (!agentId) {
    return { error: 'No agent_id returned from Retell API' };
  }

  console.log(`[Retell] Created agent for business ${business.id}: ${agentId}`);
  return { agentId };
}

/**
 * Update an existing Retell Agent.
 */
export async function updateAgent(
  agentId: string,
  llmId: string,
  business: Business,
  receptionistConfig: ReceptionistConfig | null | undefined
): Promise<{ success: boolean; error?: string }> {
  const configVoiceId = resolveVoiceId(receptionistConfig?.voiceId);
  const configRecordingEnabled = receptionistConfig?.callRecordingEnabled ?? true;
  const configMaxCallMinutes = receptionistConfig?.maxCallLengthMinutes ?? 15;
  const configGreeting = receptionistConfig?.greeting || undefined;

  const beginMessage = buildFirstMessage(business.name, configGreeting, configRecordingEnabled);
  console.log(`[Retell] updateAgent: recording=${configRecordingEnabled}, greeting="${configGreeting?.substring(0, 50)}", beginMessage="${beginMessage.substring(0, 80)}"`);

  const updateConfig: Record<string, any> = {
    response_engine: {
      type: 'retell-llm',
      llm_id: llmId,
    },
    voice_id: configVoiceId,
    voice_model: getVoiceModel(configVoiceId),
    agent_name: `${business.name} Receptionist`,
    language: 'en-US',
    webhook_url: `${APP_URL}/api/retell/webhook`,
    responsiveness: 0.5,             // Lower = more patient, waits for caller to finish
    interruption_sensitivity: 0.4,   // Lower = harder to interrupt, prevents cutting off callers
    end_call_after_silence_ms: 30000,
    max_call_duration_ms: configMaxCallMinutes * 60 * 1000,
    enable_backchannel: true,
    backchannel_frequency: 0.6,
    reminder_trigger_ms: 10000,
    reminder_max_count: 1,
    denoising_mode: 'noise-cancellation',
    normalize_for_speech: true,
    metadata: {
      businessId: business.id.toString(),
      platform: 'smallbizagent',
    },
  };

  const result = await retellFetch('PATCH', `/update-agent/${agentId}`, updateConfig);

  if (result.error) {
    return { success: false, error: result.error };
  }

  console.log(`[Retell] Updated agent ${agentId} for business ${business.id}`);
  return { success: true };
}

/**
 * Delete a Retell Agent.
 */
export async function deleteAgent(agentId: string): Promise<{ success: boolean; error?: string }> {
  const result = await retellFetch('DELETE', `/delete-agent/${agentId}`);

  if (result.error) {
    return { success: false, error: result.error };
  }

  console.log(`[Retell] Deleted agent ${agentId}`);
  return { success: true };
}

/**
 * Get a Retell Agent by ID.
 */
export async function getAgent(agentId: string): Promise<{ data?: any; error?: string }> {
  const result = await retellFetch('GET', `/get-agent/${agentId}`);

  if (result.error) {
    return { error: result.error };
  }

  return { data: result.data };
}

// ---------------------------------------------------------------------------
// Phone Number Management
// ---------------------------------------------------------------------------

/**
 * Import a Twilio phone number into Retell via SIP trunking.
 * Associates the number with an inbound agent.
 */
export async function importPhoneNumber(
  phoneNumber: string,
  terminationUri: string,
  agentId: string
): Promise<{ phoneNumberId?: string; error?: string }> {
  const result = await retellFetch<{ phone_number_id: string }>('POST', '/import-phone-number', {
    phone_number: phoneNumber,
    termination_uri: terminationUri,
    inbound_agent_id: agentId,
  });

  if (result.error) {
    return { error: result.error };
  }

  const phoneNumberId = result.data?.phone_number_id;
  if (!phoneNumberId) {
    return { error: 'No phone_number_id returned from Retell API' };
  }

  console.log(`[Retell] Imported phone ${phoneNumber} → agent ${agentId}: ${phoneNumberId}`);
  return { phoneNumberId };
}

/**
 * Delete (release) a phone number from Retell.
 */
export async function deletePhoneNumber(phoneNumberId: string): Promise<{ success: boolean; error?: string }> {
  const result = await retellFetch('DELETE', `/delete-phone-number/${phoneNumberId}`);

  if (result.error) {
    return { success: false, error: result.error };
  }

  console.log(`[Retell] Deleted phone number ${phoneNumberId}`);
  return { success: true };
}

// ---------------------------------------------------------------------------
// Outbound Calls
// ---------------------------------------------------------------------------

/**
 * Create an outbound call using Retell.
 * Used for test calls so business owners can hear their AI receptionist.
 */
export async function createOutboundCall(
  agentId: string,
  fromNumber: string,
  toNumber: string
): Promise<{ callId?: string; error?: string }> {
  const result = await retellFetch<{ call_id: string }>('POST', '/create-phone-call', {
    from_number: fromNumber,
    to_number: toNumber,
    override_agent_id: agentId,
  });

  if (result.error) {
    return { error: result.error };
  }

  const callId = result.data?.call_id;
  if (!callId) {
    return { error: 'No call_id returned from Retell API' };
  }

  console.log(`[Retell] Created outbound call ${callId}: ${fromNumber} → ${toNumber}`);
  return { callId };
}

// ---------------------------------------------------------------------------
// Fallback System Prompt (used when systemPromptBuilder is not yet available)
// ---------------------------------------------------------------------------

/**
 * Build a minimal system prompt when the dedicated systemPromptBuilder module
 * does not exist yet. This covers the core behavior for the AI receptionist.
 */
function buildFallbackSystemPrompt(
  business: Business,
  services: Service[],
  hours: any[],
  receptionistConfig: ReceptionistConfig | null | undefined,
  knowledgeSection: string,
  staff?: any[]
): string {
  const assistantName = receptionistConfig?.assistantName || 'Alex';
  const businessTimezone = business.timezone || 'America/New_York';

  // Format services list
  const serviceList = services.length > 0
    ? services.map(s => `- ${s.name}: $${s.price}, ${s.duration || 60} minutes${s.description ? ` - ${s.description}` : ''}`).join('\n')
    : '- General services (call getServices for current list)';

  // Format business hours
  let businessHoursStr = 'Monday through Friday 9 AM to 5 PM';
  if (hours && hours.length > 0) {
    const dayOrder = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const sorted = [...hours].sort((a, b) => dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day));
    const formatTime = (t: string) => {
      if (!t) return '';
      const [h, m] = t.split(':');
      const hour = parseInt(h);
      const min = parseInt(m || '0');
      const period = hour >= 12 ? 'PM' : 'AM';
      const hour12 = hour > 12 ? hour - 12 : (hour === 0 ? 12 : hour);
      return min > 0 ? `${hour12}:${m} ${period}` : `${hour12} ${period}`;
    };
    businessHoursStr = sorted.map(h => {
      const day = h.day.charAt(0).toUpperCase() + h.day.slice(1);
      if (h.isClosed) return `${day}: CLOSED`;
      return `${day}: ${formatTime(h.open)} to ${formatTime(h.close)}`;
    }).join(', ');
  }

  // Current date in business timezone
  const currentDate = new Date().toLocaleDateString('en-US', {
    timeZone: businessTimezone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const customInstructions = receptionistConfig?.customInstructions
    ? `\nCUSTOM INSTRUCTIONS:\n${receptionistConfig.customInstructions}\n`
    : '';

  const knowledgePart = knowledgeSection
    ? `\nKNOWLEDGE BASE:\n${knowledgeSection}\n`
    : '';

  return `You are ${assistantName}, the AI receptionist for ${business.name}. Sound natural and friendly like a real receptionist. If asked, you are an AI assistant — never claim to be human.

TODAY: ${currentDate}

== RULES ==
- Max 2 sentences per response unless listing options.
- NEVER say IDs, phone numbers, brackets, or internal data aloud.
- NEVER calculate dates. Pass the caller's words to tools as-is.
- Respond like a busy human receptionist — direct and efficient.
- If caller asks "are you real?" be honest: "I'm an AI assistant. How can I help?"

BUSINESS: ${business.name} | ${business.phone || ''} | ${business.address || ''}
Hours: ${businessHoursStr}

SERVICES:
${serviceList}

${staff && staff.length > 0 ? `TEAM:\n${staff.filter((s: any) => s.active !== false).map((s: any) => `- ${s.firstName} ${s.lastName || ''} (${s.specialty || 'Staff'})${s.id ? ' [ID:' + s.id + ']' : ''}`).join('\n')}\n` : 'TEAM: Call getStaffMembers to get the current team list.\n'}
== CALL FLOW ==
1. GREET: Speak the greeting FIRST, then call recognizeCaller while talking. Once results come back, personalize — reference their name, upcoming appointment, or preferences naturally. Keep it warm and brief.
2. UNDERSTAND: One question to clarify what they need, then act. Don't over-clarify — if they say "book a haircut tomorrow," go straight to checking availability.
3. CHECK: Call checkAvailability. Offer 2-3 slots naturally ("We have 10 AM, 1 PM, or 3 PM open").
4. BOOK: Confirm once, then book on "yes."
5. CLOSE: "Anything else?" If no → call end_call.

== KEY RULES ==
DATES: Pass caller's exact words to tools ("today", "tomorrow", "Saturday"). When speaking back to the caller, use natural references — say "today" not "Friday, March 28, 2026." Say "tomorrow" not "Saturday, March 29, 2026." Only use the full date for appointments more than a week out.
NAMES: Get new caller's name within the first 2 exchanges. Call updateCustomerInfo immediately with their name.
STAFF: When asked "who's working today/tomorrow" → call checkAvailability for that day to see which staff have slots. Report which staff members are available. Do NOT ask for clarification — just check and tell them.
AFTER HOURS: Still book appointments. Tell them you're closed now but can book for the next open day.
AVAILABILITY: When someone asks "do you have anything today?" or "who's available?" — immediately call checkAvailability. Don't ask follow-up questions first.
${customInstructions}${knowledgePart}`;
}

// ---------------------------------------------------------------------------
// Default Export
// ---------------------------------------------------------------------------

export default {
  createLlmForBusiness,
  updateLlm,
  deleteLlm,
  createAgentForBusiness,
  updateAgent,
  deleteAgent,
  getAgent,
  importPhoneNumber,
  deletePhoneNumber,
  createOutboundCall,
  syncKnowledgeBase,
  RETELL_VOICE_OPTIONS,
};

// ========================================
// KNOWLEDGE BASE INTEGRATION
// ========================================

/**
 * Sync a business's knowledge base to Retell's built-in KB.
 * Hybrid approach:
 *  1. Upload approved business_knowledge entries as text snippets
 *  2. If business has a website URL, add it as a crawl source
 *
 * Creates a new KB if none exists, or updates the existing one.
 * Returns the knowledge_base_id for linking to the LLM.
 */
async function syncKnowledgeBase(businessId: number): Promise<{ knowledgeBaseId: string | null; error?: string }> {
  if (!RETELL_API_KEY) {
    return { knowledgeBaseId: null, error: 'Retell API key not configured' };
  }

  try {
    const business = await storage.getBusiness(businessId);
    if (!business) return { knowledgeBaseId: null, error: 'Business not found' };

    // Fetch approved knowledge entries
    const knowledgeEntries = await storage.getBusinessKnowledge(businessId);
    const approvedEntries = knowledgeEntries.filter((k: any) => k.isApproved !== false);

    // Build text snippets from Q&A pairs
    const textSnippets: Array<{ title: string; text: string }> = [];
    for (const entry of approvedEntries) {
      textSnippets.push({
        title: entry.question || entry.category || 'Business Info',
        text: `Q: ${entry.question}\nA: ${entry.answer}`,
      });
    }

    // Add business description if available
    if (business.description) {
      textSnippets.push({
        title: `About ${business.name}`,
        text: business.description,
      });
    }

    // Collect website URLs for auto-crawling
    const urls: string[] = [];
    if (business.website) {
      urls.push(business.website);
    }

    // If no content to sync, skip
    if (textSnippets.length === 0 && urls.length === 0) {
      console.log(`[RetellKB] Business ${businessId}: No knowledge content to sync`);
      return { knowledgeBaseId: null };
    }

    const kbName = `${business.name} KB`.substring(0, 40); // Retell limit: 40 chars

    // Create knowledge base via Retell API (retellFetch returns { data?, error?, status? })
    const result = await retellFetch<{ knowledge_base_id: string }>('POST', '/create-knowledge-base', {
      knowledge_base_name: kbName,
      ...(textSnippets.length > 0 && { knowledge_base_texts: textSnippets }),
      ...(urls.length > 0 && { knowledge_base_urls: urls }),
    });

    if (result.error) {
      console.error(`[RetellKB] Failed to create KB for business ${businessId}:`, result.error);
      return { knowledgeBaseId: null, error: `KB creation failed: ${result.error}` };
    }

    const knowledgeBaseId = result.data?.knowledge_base_id;

    console.log(`[RetellKB] Created KB ${knowledgeBaseId} for business ${businessId} (${textSnippets.length} texts, ${urls.length} URLs)`);
    return { knowledgeBaseId };
  } catch (error) {
    console.error(`[RetellKB] Error syncing KB for business ${businessId}:`, error);
    return { knowledgeBaseId: null, error: String(error) };
  }
}
