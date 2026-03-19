/**
 * Vapi.ai Integration Service
 *
 * Handles AI-powered voice receptionist using Vapi.ai
 * Creates intelligent, human-like phone conversations for businesses
 */

import { Business, Service, ReceptionistConfig } from '@shared/schema';
import { storage } from '../storage';
import { getCachedMenu as getCloverCachedMenu, formatMenuForPrompt, type CachedMenu } from './cloverService';
import { getCachedMenu as getSquareCachedMenu } from './squareService';
import { getCachedMenu as getHeartlandCachedMenu } from './heartlandService';

const VAPI_API_KEY = process.env.VAPI_API_KEY;
const VAPI_BASE_URL = 'https://api.vapi.ai';
const BASE_URL = process.env.APP_URL || '';
if (!BASE_URL) {
  console.warn('⚠️ APP_URL not set — webhook URLs will be relative paths');
}

/** Curated ElevenLabs voices available for VAPI assistants */
export const VOICE_OPTIONS: Array<{ id: string; name: string; gender: string }> = [
  { id: 'paula', name: 'Paula', gender: 'Female' },
  { id: 'rachel', name: 'Rachel', gender: 'Female' },
  { id: 'domi', name: 'Domi', gender: 'Female' },
  { id: 'bella', name: 'Bella', gender: 'Female' },
  { id: 'elli', name: 'Elli', gender: 'Female' },
  { id: 'adam', name: 'Adam', gender: 'Male' },
  { id: 'antoni', name: 'Antoni', gender: 'Male' },
  { id: 'josh', name: 'Josh', gender: 'Male' },
  { id: 'arnold', name: 'Arnold', gender: 'Male' },
  { id: 'sam', name: 'Sam', gender: 'Male' },
];

interface VapiAssistant {
  id: string;
  name: string;
  model: {
    provider: string;
    model: string;
    systemPrompt: string;
    temperature: number;
  };
  voice: {
    provider: string;
    voiceId: string;
  };
  firstMessage: string;
  serverUrl?: string;
  serverUrlSecret?: string;
}

interface VapiPhoneNumber {
  id: string;
  number: string;
  assistantId: string;
}

/**
 * Format business hours from database into readable string
 */
function formatBusinessHoursFromDB(hours: any[]): string {
  if (!hours || hours.length === 0) {
    return 'Monday through Friday 9 AM to 5 PM';
  }

  const dayOrder = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const sortedHours = [...hours].sort((a, b) => dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day));

  // Format times like "09:00" to "9 AM", "09:30" to "9:30 AM"
  const formatTime = (time: string) => {
    if (!time) return '';
    const [hourStr, minStr] = time.split(':');
    const hour = parseInt(hourStr);
    const min = parseInt(minStr || '0');
    const period = hour >= 12 ? 'PM' : 'AM';
    const hour12 = hour > 12 ? hour - 12 : (hour === 0 ? 12 : hour);
    return min > 0 ? `${hour12}:${minStr} ${period}` : `${hour12} ${period}`;
  };

  // Build a key for each day's hours so we can group consecutive days with the same schedule
  const dayEntries = sortedHours.map(h => {
    const dayName = h.day.charAt(0).toUpperCase() + h.day.slice(1);
    if (h.isClosed || (!h.open && !h.close)) {
      return { day: dayName, key: 'CLOSED', label: 'CLOSED' };
    }
    const timeRange = `${formatTime(h.open)} to ${formatTime(h.close)}`;
    return { day: dayName, key: timeRange, label: timeRange };
  });

  // Group consecutive days with the same hours
  const groups: { days: string[]; label: string }[] = [];
  for (const entry of dayEntries) {
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup.label === entry.label) {
      lastGroup.days.push(entry.day);
    } else {
      groups.push({ days: [entry.day], label: entry.label });
    }
  }

  // Format each group: "Monday through Friday: 9:30 AM to 7 PM"
  return groups.map(g => {
    const dayRange = g.days.length > 2
      ? `${g.days[0]} through ${g.days[g.days.length - 1]}`
      : g.days.length === 2
        ? `${g.days[0]} and ${g.days[1]}`
        : g.days[0];
    return `${dayRange}: ${g.label}`;
  }).join(', ');
}

/**
 * Determine if business is currently open based on hours AND current time.
 * Compares the business's local time against today's open/close window.
 */
function isBusinessOpenNow(hours: any[], timezone: string = 'America/New_York'): { isOpen: boolean; todayHours: string } {
  // Use business timezone to determine what day it is (not server UTC)
  const now = new Date();
  const today = now.toLocaleDateString('en-US', {
    timeZone: timezone,
    weekday: 'long'
  }).toLowerCase();

  const todayHours = hours?.find(h => h.day === today);
  if (!todayHours || todayHours.isClosed || (!todayHours.open && !todayHours.close)) {
    return { isOpen: false, todayHours: 'CLOSED today' };
  }

  // Parse current time in business timezone
  const currentTimeStr = now.toLocaleTimeString('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }); // e.g. "20:15"

  // Parse open/close times (formats: "9:00 AM", "9am", "09:00", etc.)
  function parseTime(timeStr: string): number {
    if (!timeStr) return 0;
    const cleaned = timeStr.trim().toLowerCase();
    const match = cleaned.match(/^(\d{1,2}):?(\d{2})?\s*(am|pm)?$/);
    if (!match) return 0;
    let hour = parseInt(match[1]);
    const min = parseInt(match[2] || '0');
    const period = match[3];
    if (period === 'pm' && hour < 12) hour += 12;
    if (period === 'am' && hour === 12) hour = 0;
    return hour * 60 + min;
  }

  const currentMinutes = (() => {
    const [h, m] = currentTimeStr.split(':').map(Number);
    return h * 60 + m;
  })();

  const openMinutes = parseTime(todayHours.open);
  const closeMinutes = parseTime(todayHours.close);

  const isOpen = currentMinutes >= openMinutes && currentMinutes < closeMinutes;

  return {
    isOpen,
    todayHours: `Today's hours: ${todayHours.open} to ${todayHours.close}`
  };
}

/**
 * Build the firstMessage that plays when the call connects.
 *
 * Rules:
 * 1. Only includes recording disclosure when Call Recording is enabled.
 * 2. ALWAYS ends with an engagement question so the caller responds
 *    while recognizeCaller runs in the background.
 * 3. Uses the business's custom greeting if set, but injects the
 *    recording disclosure if it's missing from the custom text.
 */
function buildFirstMessage(businessName: string, customGreeting?: string | null, callRecordingEnabled?: boolean): string {
  const recordingEnabled = callRecordingEnabled ?? true;
  const recordingPhrase = 'Just so you know, this call may be recorded for quality purposes.';
  const engagementQuestion = 'How can I help you today?';

  // No custom greeting — use dynamic default with business name
  if (!customGreeting || !customGreeting.trim()) {
    if (recordingEnabled) {
      return `Hi, thanks for calling ${businessName}! ${recordingPhrase} ${engagementQuestion}`;
    }
    return `Hi, thanks for calling ${businessName}! ${engagementQuestion}`;
  }

  // Use the custom greeting as-is, only adding what's missing
  let greeting = customGreeting.trim();
  const endsWithQuestion = /\?\s*$/.test(greeting);

  // Only inject recording disclosure if Call Recording is ON
  if (recordingEnabled) {
    const mentionsRecording = /record|monitor/i.test(greeting);

    if (!mentionsRecording) {
      if (endsWithQuestion) {
        const lastQ = greeting.lastIndexOf('?');
        const beforeQ = greeting.substring(0, lastQ);
        const lastSentenceBreak = Math.max(
          beforeQ.lastIndexOf('. '),
          beforeQ.lastIndexOf('! '),
          beforeQ.lastIndexOf('? ')
        );

        if (lastSentenceBreak >= 0) {
          const body = greeting.substring(0, lastSentenceBreak + 1).trim();
          const question = greeting.substring(lastSentenceBreak + 1).trim();
          greeting = `${body} ${recordingPhrase} ${question}`;
        } else {
          greeting = `${recordingPhrase} ${greeting}`;
        }
      } else {
        const stripped = greeting.replace(/[.!?]+\s*$/, '');
        greeting = `${stripped}. ${recordingPhrase} ${engagementQuestion}`;
      }
    } else if (!endsWithQuestion) {
      const stripped = greeting.replace(/[.!?]+\s*$/, '');
      greeting = `${stripped}. ${engagementQuestion}`;
    }
  } else {
    // Recording OFF — just ensure greeting ends with a question
    if (!endsWithQuestion) {
      const stripped = greeting.replace(/[.!?]+\s*$/, '');
      greeting = `${stripped}. ${engagementQuestion}`;
    }
  }

  return greeting;
}

/**
 * Generate a smart system prompt based on business type
 */
interface PromptOptions {
  assistantName?: string;
  customInstructions?: string;
  afterHoursMessage?: string;
  voicemailEnabled?: boolean;
  staffSection?: string;
}

function generateSystemPrompt(business: Business, services: Service[], businessHoursFromDB?: any[], menuData?: CachedMenu | null, options?: PromptOptions, knowledgeSection?: string, transferNumbers?: string[]): string {
  const businessType = business.industry?.toLowerCase() || 'general';
  const serviceList = services.length > 0
    ? services.map(s => `- ${s.name}: $${s.price}, ${s.duration || 60} minutes${s.description ? ` - ${s.description}` : ''}`).join('\n')
    : '- General services (call getServices for current list)';

  // Determine business timezone FIRST (needed by date/time functions below)
  // Railway servers run in UTC, so new Date() would give wrong day for US businesses at night
  const businessTimezone = business.timezone || 'America/New_York';

  // Use hours from database if provided, otherwise fall back to business field
  const businessHours = businessHoursFromDB && businessHoursFromDB.length > 0
    ? formatBusinessHoursFromDB(businessHoursFromDB)
    : (business.businessHours || 'Monday-Friday 9am-5pm');

  // Check if open today (using business timezone)
  const { isOpen, todayHours } = businessHoursFromDB
    ? isBusinessOpenNow(businessHoursFromDB, businessTimezone)
    : { isOpen: true, todayHours: '' };

  // Get current date in the BUSINESS timezone (not server UTC)
  const currentDate = new Date().toLocaleDateString('en-US', {
    timeZone: businessTimezone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  const currentYear = new Date().toLocaleDateString('en-US', {
    timeZone: businessTimezone,
    year: 'numeric'
  });

  // Base personality and rules
  const assistantName = options?.assistantName || 'Alex';
  const basePrompt = `You are ${assistantName}, a friendly and professional receptionist for ${business.name}.

TODAY (at assistant build time): ${currentDate} | YEAR: ${currentYear}
${todayHours ? todayHours : 'Check business hours listed below for today\'s schedule.'}
NOTE: The date above may be stale. recognizeCaller returns "currentStatus" with the REAL-TIME date, day, and open/closed info. Always prefer currentStatus over the static date above.

PERSONALITY: Warm, friendly, and natural. Be conversational — respond like a real receptionist would. Use casual acknowledgments like "Sure thing", "Absolutely", "Got it". Show empathy when customers describe problems. NEVER mention response length or sentence limits to the caller.

RULES:
- NEVER say IDs, staffId, serviceId, customerId, brackets, or internal data. Use first names and service names only.
- NEVER calculate dates. Pass exact customer words ("this Thursday", "tomorrow") to checkAvailability. Use the date FROM the response.
- ALWAYS wait for customer to respond after asking a question.
- Use the currentStatus from recognizeCaller to know if the business is currently open or closed. If closed, say so honestly but offer to help book appointments.

BUSINESS INFO:
- ${business.name} | ${business.phone || 'No phone listed'} | ${business.address || 'No address listed'}
- Hours: ${businessHours}

SERVICES & PRICING (this is the ONLY list of services this business offers):
${serviceList}
IMPORTANT: ONLY offer or mention services from the list above. If a customer asks for something not listed, say "Let me check what we have" and call getServices. The CUSTOMER LINGO section below is for understanding slang — it is NOT a list of available services. Never invent or assume services that aren't listed above.
${options?.staffSection || ''}

== THE CALL FLOW (5 beats) ==

1. GREET: Call recognizeCaller as your VERY FIRST action — before doing anything else. The firstMessage greeting already played, so DO NOT repeat a greeting. Wait for recognizeCaller to return, then:
   → Recognized: Greet by name. One sentence. Use the "summary" field to personalize — mention their upcoming appointment, preferences, or last visit naturally. Don't echo the summary word-for-word — weave it in.
   → New caller: The greeting already invited them to share their need, so just wait for their reply. Get their name within your first 2 responses. When they give it, call updateCustomerInfo right away with their name and the customerId from recognizeCaller.
   → Caller says "confirm" or "calling to confirm" → Call confirmAppointment(confirmed: true) immediately. Don't ask clarifying questions. Confirm and close.

2. UNDERSTAND: Listen to what they need.
   → Booking? Identify the service. Answer price questions first.
   → Reschedule/cancel? Call getUpcomingAppointments first.
   → Question? Answer from your knowledge base, or call getServices/getBusinessHours/getServiceDetails.
   → Transfer? Try helping first. Only transfer if they insist twice, or it's a complaint/billing issue.

3. CHECK: Call checkAvailability with exact date words + serviceId + staffId if known.
   → Offer 2-3 of the returned slots conversationally: "I've got 10 AM, 1 PM, or 3:30. What works for you?"
   → If closed that day, suggest the next open day.
   → If no slots, offer another day or staff member.

4. BOOK: Confirm ALL details before booking: "[Service] on [Day, Month Date] at [Time] for $[Price]. Sound good?"
   → Wait for "yes". Then call bookAppointment with: customerId, customerName (REQUIRED), customerPhone, serviceName (REQUIRED), date (YYYY-MM-DD from checkAvailability), time, notes.
   → Notes: always include what the customer described ("brakes squeaking", "wants highlights", etc.)

5. CLOSE: After completing an action, ask "Is there anything else I can help with?" and WAIT for their response.
   → If they say "no" / "that's all" / "I'm good" → Say your farewell: "Sounds great! Have a great day!"
   → If they say "bye" / "thanks, bye" → Skip "anything else?" and say farewell: "Thanks for calling! Have a great day!"
   → NEVER combine "anything else?" and the farewell in the same response. They are two separate turns.
   → Your farewell MUST end with "Have a great day", "Have a wonderful day", or "Take care". This triggers the call to end.

== KEY RULES ==

DATES: Today is ${currentDate}. Pass the caller's exact date words to checkAvailability. Use the date FROM the response when confirming. Say full date: "Thursday, March 20th" not just "Thursday".

NAMES: Required for every booking. If new caller, ask "May I get your name?" early and IMMEDIATELY call updateCustomerInfo with their first and last name + customerId from recognizeCaller. Don't wait until booking. If caller corrects their name, call updateCustomerInfo immediately.

STAFF: If team members are listed above, ask "Do you have someone you usually see?" Use their staffId for checkAvailability and bookAppointment.

AFTER HOURS: If currentStatus says CLOSED, tell the caller the business is closed but you are STILL fully functional — book appointments, answer questions, give pricing. Say "We're closed for the evening, but I can absolutely help you book an appointment!"
${options?.voicemailEnabled !== false ? 'Only use leaveMessage if caller explicitly asks to leave a message for the owner.' : ''}

TOOL CALLS: When you need information, call the function. Don't announce it — no "let me check", "one moment", "hold on", "let me look that up", or "one second". Just call the function and respond with the result as if you already knew the answer.

CONVERSATION STYLE:
- Get to the point. Don't repeat information the caller already knows.
- When confirming a booking, say it once clearly. Don't repeat the same details multiple ways.
- Don't list every service — ask what they need first, then confirm the match.
- If they only called for one thing and it's done, go straight to "Anything else?"
- When the caller says "no that's it" or "I'm good", say your farewell immediately. Keep it short.
- Never ask the same question twice in a call.
- Don't narrate tool results. Bad: "So I checked and we have three slots available." Good: "I've got 10, 1, and 3:30. What works?"

VOICE BREVITY: Short, punchy responses. One thought per sentence.
Good: "Thursday? I've got 10, 1, and 3:30. What works?"
Good: "Got it, Tony. You're booked for Thursday at 1 with Sarah."
Good: "$45 for a men's cut, about 30 minutes."
Bad: "I checked our availability for Thursday and I have several options available for you."
Bad: "Great news! I was able to successfully book your appointment."
Bad: "Based on the information in our system, the price for that service would be..."

MULTILINGUAL: Match the caller's language. If they speak Spanish, respond entirely in Spanish.
`;

  // Industry-specific additions
  const industryPrompts: { [key: string]: string } = {
    'automotive': `
AUTOMOTIVE-SPECIFIC GUIDANCE:
- When customers describe car problems (noises, warning lights, performance issues), ask:
  * How long has this been happening?
  * Does it happen all the time or only in certain conditions?
  * Have you noticed anything else unusual?
- Common issue categories:
  * Strange noises (grinding, squealing, clicking) → Diagnostic appointment
  * Warning lights → Diagnostic appointment
  * Routine maintenance (oil change, tire rotation, brakes) → Standard service appointment
  * Multiple issues → Book diagnostic first, can address routine maintenance same visit
- Set proper time expectations:
  * Oil change: 30-45 minutes
  * Diagnostic: 1-2 hours
  * Brake service: 2-3 hours
  * Major repairs: May need to leave the car
- Ask if they need a ride or loaner vehicle for longer services

CUSTOMER LINGO (understanding slang — NOT a service list, only reference SERVICES & PRICING above):
- "She's pulling to the right/left" → Alignment service
- "Check engine light" / "CEL is on" → Diagnostic appointment
- "Making a grinding noise" / "squealing when I brake" → Brake inspection
- "Shaking at highway speed" / "wobbling" → Tire balance or alignment
- "Won't turn over" / "won't crank" → Starter or battery issue, diagnostic
- "Running rough" / "idling funny" / "sputtering" → Engine diagnostic
- "Leaking something green/red/brown" → Fluid leak diagnostic
- "Needs a tune-up" → General maintenance (spark plugs, filters, fluids)
- "AC isn't blowing cold" / "heat doesn't work" → HVAC diagnostic
- "Tires are bald" / "need new shoes" → Tire replacement
- "Overheating" / "temp gauge is in the red" → Cooling system — urgent
- "Burning smell" → Could be brakes, clutch, or oil leak — diagnostic
- "Transmission is slipping" / "hard shifting" → Transmission diagnostic
- "State inspection" / "emissions" → Inspection service
`,
    'plumbing': `
PLUMBING-SPECIFIC GUIDANCE:
- When customers describe plumbing issues, ask:
  * Is this an emergency? (Active flooding, no water, sewage backup)
  * Which fixture or area is affected?
  * How long has this been happening?
  * Is there visible water damage?
- Emergency vs non-emergency:
  * Emergencies: Offer same-day or next available
  * Non-emergencies: Schedule within normal availability
- Common issues:
  * Leaks → Ask about severity and location
  * Clogs → Ask if it's complete blockage or slow drain
  * Water heater → Ask if there's no hot water vs leak vs strange noises
  * Running toilet → Usually quick fix, 30-60 min appointment
- Always ask about access to the area (basement, crawl space, etc.)

CUSTOMER LINGO (understanding slang — NOT a service list, only reference SERVICES & PRICING above):
- "Slab leak" → Leak under the foundation — emergency/urgent
- "Disposal is jammed" / "garbage disposal won't turn on" → Garbage disposal repair
- "Toilet keeps running" / "won't stop running" → Running toilet repair (flapper/fill valve)
- "Backed up" / "sewage coming up" → Drain/sewer backup — emergency
- "Dripping faucet" / "faucet won't shut off" → Faucet repair or replacement
- "No hot water" / "water is lukewarm" → Water heater issue
- "Water pressure is low" / "barely a trickle" → Pressure issue diagnostic
- "Pipe burst" / "water everywhere" → Emergency — shut off water, dispatch ASAP
- "Toilet is rocking" / "wobbly toilet" → Toilet reset/wax ring replacement
- "Smells like rotten eggs" / "sulfur smell" → Could be gas leak or drain issue — treat as urgent
- "Sump pump isn't working" → Sump pump repair/replacement
- "Water is brown/rusty" → Pipe corrosion or water heater sediment
`,
    'hvac': `
HVAC-SPECIFIC GUIDANCE:
- When customers describe heating/cooling issues, ask:
  * Is the system running at all?
  * Is it blowing air but not heating/cooling?
  * Are there strange noises or smells?
  * When was it last serviced?
- Seasonal considerations:
  * Summer: Cooling issues are urgent
  * Winter: Heating issues are urgent
  * Suggest maintenance if not serviced in past year
- Common issues:
  * No heat/cool → Diagnostic needed
  * Weak airflow → Could be filter or duct issue
  * Strange smells → Safety concern, prioritize
  * High bills → Suggest efficiency inspection

CUSTOMER LINGO (understanding slang — NOT a service list, only reference SERVICES & PRICING above):
- "Short cycling" / "keeps turning on and off" → System cycling issue — diagnostic
- "My unit is frozen" / "ice on the pipes" → AC freeze-up — turn off, schedule repair
- "Blowing hot air" (in summer) → AC not cooling — diagnostic
- "Blowing cold air" (in winter) → Furnace not heating — diagnostic
- "Thermostat is blank" / "thermostat won't turn on" → Thermostat or power issue
- "Weird smell from vents" / "musty smell" → Could be mold in ducts — duct inspection
- "Pilot light keeps going out" → Furnace issue — diagnostic
- "Loud banging when it kicks on" → Delayed ignition or duct expansion
- "My bill doubled" / "electric bill is crazy" → Efficiency inspection
- "Freon" / "needs a charge" / "needs refrigerant" → AC recharge / leak check
- "Ductwork" / "some rooms are hot, some cold" → Duct inspection or zoning
- "Annual tune-up" / "seasonal maintenance" → Maintenance appointment
`,
    'salon': `
SALON/BARBERSHOP-SPECIFIC GUIDANCE:
- IMPORTANT: Always ask if they have a preferred stylist/barber!
  * "Do you have a stylist you usually see, or would you like me to check who's available?"
  * Team members are listed above — use their staffId when checking availability and booking
  * If they don't have a preference, check who's available at their preferred time
- When customers book, ask:
  * What service are you looking for? (haircut, color, style, etc.)
  * Do you have a preferred stylist/barber?
  * When would you like to come in?
  * Is this for a special occasion?
- Service considerations:
  * Haircuts: 30-45 min typically
  * Color: 1.5-2 hours, ask if it's touch-up or full color
  * Style/blowout: 30-45 min
  * Special occasions: Book extra time
- If their preferred stylist isn't available:
  * Offer alternative times with that stylist
  * OR suggest another available stylist: "I have [Name] available at that time if you'd like"
- Always mention:
  * Arrival time (suggest 5-10 min early)
  * The stylist's name when confirming the appointment

CUSTOMER LINGO (understanding slang — NOT a service list, only reference SERVICES & PRICING above):
- "Touch-up" / "just my roots" → Root color service
- "Balayage" / "ombré" / "hand-painted highlights" → Color service (premium)
- "Full foil" / "highlights" / "lowlights" → Foil color service
- "Blowout" / "blow dry" → Styling/blowout service
- "Trim" / "just a trim" / "clean up the ends" → Haircut (shorter appointment)
- "Brazilian blowout" / "keratin" / "smoothing treatment" → Keratin/smoothing service
- "Updo" / "special occasion" / "prom hair" / "wedding hair" → Formal styling
- "Deep condition" / "treatment" / "my hair is fried" → Deep conditioning treatment
- "Extensions" / "tape-ins" / "sew-in" → Extension service (allow extra time)
- "Toner" / "gloss" / "my color is brassy" → Toner/gloss service
- "Buzz cut" / "pixie cut" / "bob" → Haircut styles — book as haircut
- "Split ends" / "damaged" → Haircut + possible treatment recommendation
`,
    'barber': `
BARBERSHOP-SPECIFIC GUIDANCE:
- IMPORTANT: Always ask if they have a preferred barber!
  * "Do you have a barber you usually see?"
  * Team members are listed above — use their staffId when checking availability and booking
- When customers call, ask:
  * What are you looking for? (haircut, beard trim, shave, etc.)
  * Do you have a preferred barber?
  * When works best for you?
- Common services:
  * Haircut: 20-30 min
  * Haircut + beard: 30-45 min
  * Hot towel shave: 30-45 min
  * Lineup/edge-up: 15-20 min
- If their preferred barber isn't available:
  * "He's booked at that time, but I have him available at [time]. Or [other barber] is free at your preferred time."
- Walk-ins vs appointments:
  * If they ask about walk-ins, explain current wait times if known
  * Recommend booking to guarantee a spot
- Always confirm:
  * The barber's name
  * Service and time
  * Suggest arriving 5 min early

CUSTOMER LINGO (understanding slang — NOT a service list, only reference SERVICES & PRICING above):
- "Lineup" / "line-up" / "edge-up" / "shape-up" → Edge-up/lineup service
- "Fade" / "taper" / "taper fade" / "skin fade" / "mid fade" / "high fade" / "low fade" → Haircut (specify fade type in notes)
- "Bald fade" / "zero on the sides" → Haircut with bald/skin fade
- "Buzz cut" / "number 2 all around" → Haircut (clipper cut)
- "Beard trim" / "just clean up the beard" / "line up the beard" → Beard trim service
- "Hot towel shave" / "straight razor" / "clean shave" → Hot towel shave service
- "Kid's cut" / "my son needs a cut" → Kids haircut
- "Design" / "hair design" / "razor design" → Design/art service if offered
- "Blow out" / "blow dry" → Styling after cut
- "Wash" / "shampoo" → Shampoo service (usually included)
- "I want it short on the sides, long on top" → Haircut — note the style preference
- "Temp fade" / "temple fade" → Haircut with temple fade
`,
    'electrical': `
ELECTRICAL-SPECIFIC GUIDANCE:
- Safety is paramount - identify potential hazards:
  * Burning smells → Urgent, could be fire hazard
  * Sparking outlets → Urgent safety issue
  * Flickering lights → Could indicate wiring issues
  * No power → Check if it's whole house or partial
- Common questions to ask:
  * Is this affecting the whole house or just one area?
  * Have you checked your breaker panel?
  * Are there any burning smells or visible damage?
  * How old is your home/wiring?
- Service categories:
  * Emergency (sparks, burning, no power): Same day
  * Upgrades (new outlets, panel upgrades): Schedule normally
  * Troubleshooting: 1-2 hour diagnostic

CUSTOMER LINGO (understanding slang — NOT a service list, only reference SERVICES & PRICING above):
- "Outlet is dead" / "plug doesn't work" → Outlet troubleshooting
- "Breaker keeps tripping" / "keeps blowing a fuse" → Circuit overload diagnostic
- "Lights are flickering" / "dimming on and off" → Wiring issue — diagnostic
- "Sparking" / "I saw a spark" → Urgent safety concern — prioritize
- "Burning smell from outlet/panel" → Fire hazard — emergency, same day
- "Need more outlets" / "not enough plugs" → Outlet installation
- "Panel upgrade" / "need more circuits" / "fuse box" → Electrical panel upgrade
- "GFCI" / "that outlet with the buttons" / "the reset button outlet" → GFCI outlet install/repair
- "Ceiling fan install" / "want a fan put in" → Ceiling fan installation
- "Hot tub hookup" / "EV charger" / "car charger install" → Dedicated circuit installation
- "Whole house surge protector" → Surge protection installation
- "Outdoor lighting" / "landscape lights" / "security lights" → Exterior electrical work
`,
    'cleaning': `
CLEANING SERVICE GUIDANCE:
- Key questions for quotes:
  * What type of cleaning? (regular, deep, move-in/out)
  * Square footage or number of bedrooms/bathrooms
  * Any pets in the home?
  * Are cleaning supplies provided or should we bring our own?
- Frequency options:
  * One-time deep clean
  * Weekly service
  * Bi-weekly service
  * Monthly service
- Special considerations:
  * Ask about areas needing extra attention
  * Note any allergies or eco-friendly product preferences
  * Confirm access arrangements (key, code, someone home)

CUSTOMER LINGO (understanding slang — NOT a service list, only reference SERVICES & PRICING above):
- "Deep clean" / "top to bottom" / "spring cleaning" → Deep cleaning service
- "Regular cleaning" / "maintenance clean" / "weekly/biweekly" → Recurring standard cleaning
- "Move-in" / "move-out" / "turnover clean" → Move-in/move-out cleaning (deep)
- "Post-construction" / "after renovation" → Construction cleanup (specialized)
- "Just the basics" / "light clean" → Standard cleaning
- "Organize" / "declutter" → Organization service (if offered), otherwise clarify scope
- "Carpet cleaning" / "steam clean" → Carpet/upholstery service (if offered)
- "Windows inside and out" → Window cleaning service
- "Airbnb" / "rental turnover" / "between guests" → Short-term rental turnover cleaning
- "Hoarder" / "heavy duty" → Heavy-duty cleaning — may need on-site quote
- "Green products" / "non-toxic" / "eco-friendly" → Note: customer wants eco-friendly products
`,
    'landscaping': `
LANDSCAPING-SPECIFIC GUIDANCE:

FREE ESTIMATES — This is the #1 reason people call. Handle it smoothly:
- When a caller asks about pricing or "how much does it cost":
  * Tell them: "We offer completely free estimates! One of our team will come out and do a quick walkthrough of your property — it usually takes about 20 to 30 minutes."
  * Ask: "Is this for a residential or commercial property?"
  * Ask for their property address (IMPORTANT: include the full address in the appointment notes)
  * Ask roughly how large the property is (small yard, half acre, full acre, larger)
  * Ask what services they're interested in (lawn care, landscaping, tree work, cleanup, etc.)
  * Use the "Free Estimate Walkthrough" service when booking the appointment
  * Include in the notes: property type (residential/commercial), address, size, and services of interest
  * Confirm: "I've got you scheduled for a free estimate walkthrough on [date] at [time]. Our team will come assess your property and put together a detailed quote — no obligation at all."
- NEVER quote prices sight-unseen. Always steer toward the free estimate.

SEASONAL SERVICE AWARENESS — Proactively suggest what's relevant right now:
- Spring (March–May): "A lot of our customers are getting spring cleanups, mulching, and aeration right now. Would any of that interest you?"
- Summer (June–August): Focus on regular mowing plans, trimming, fertilization
- Fall (September–November): "Fall is a great time for leaf cleanup and getting your yard winterized. Want me to include that in your estimate?"
- Winter (December–February): Snow removal services, and "It's a great time to plan your spring landscaping project"

KEY QUESTIONS FOR NEW CALLERS:
- What services are you looking for?
- Is this residential or commercial?
- What's the property address? (critical — always capture this)
- Roughly how large is the property?
- Any HOA requirements or restrictions we should know about?
- Are you looking for a one-time service or ongoing regular maintenance?
- If maintenance: How often? (weekly mowing, biweekly, monthly)

EXISTING / RECURRING CUSTOMERS:
- Check their upcoming appointments first using getUpcomingAppointments
- For mowing customers: "Your next mowing is scheduled for [date]. Need anything changed?"
- Ask about property access: "Will someone be home, or should we just go ahead and service the yard?"
- Note any gate codes, pet warnings, locked gates, or special access instructions in the appointment notes
- If they want to add a service to their regular visit, book it and note the add-on

WEATHER-RELATED CALLS:
- If a customer calls about a rain delay or missed service: "I totally understand — weather can be unpredictable! Let me check when we can reschedule your service."
- Be empathetic and proactive about rescheduling
- For snow removal requests: treat as high priority, offer the earliest available time

IMPORTANT REMINDERS:
- Landscaping customers are often calling from the field or while looking at their yard — keep the conversation efficient
- Many callers just want a quick estimate scheduled — don't over-question them
- The free estimate is the primary conversion tool — always offer it
- This business does NOT handle crew dispatch — only customer-facing scheduling and communication

CUSTOMER LINGO (understanding slang — NOT a service list, only reference SERVICES & PRICING above):
- "Mow" / "cut the grass" / "lawn needs cutting" → Mowing service
- "Edging" / "weed whack" / "weed eat" / "string trim" → Edging/trimming service
- "Mulch" / "need mulch laid" / "fresh mulch" → Mulching service
- "Leaf cleanup" / "fall cleanup" / "leaves everywhere" → Leaf removal service
- "Aeration" / "core aeration" / "lawn is compacted" → Aeration service
- "Overseeding" / "seed the lawn" / "bare spots" → Overseeding service
- "Sod" / "new grass" / "lay sod" → Sod installation
- "Bush trimming" / "hedge trimming" / "shrubs are overgrown" → Shrub/hedge trimming
- "Tree trimming" / "limbs hanging over" / "branches down" → Tree service
- "Stump grinding" / "remove a stump" → Stump removal service
- "Hardscaping" / "patio" / "retaining wall" / "pavers" → Hardscape project (estimate needed)
- "French drain" / "yard is flooding" / "drainage issue" → Drainage solution
- "Fertilize" / "weed control" / "lawn treatment" → Lawn treatment/fertilization
- "Irrigation" / "sprinkler" / "sprinkler heads broken" → Irrigation repair/install
- "Curb appeal" / "front yard makeover" → Landscape design — book estimate
`,
    'construction': `
CONSTRUCTION/CONTRACTOR GUIDANCE:
- Project types require different approaches:
  * Emergency repairs: Prioritize, get details on damage
  * Renovations: Schedule consultation first
  * New construction: Detailed planning needed
- Key questions:
  * What type of project?
  * Have you gotten permits (if needed)?
  * Timeline expectations?
  * Budget range?
- Always recommend:
  * On-site estimate for accurate pricing
  * Written quotes before work begins
  * Discuss timeline and milestones

CUSTOMER LINGO (understanding slang — NOT a service list, only reference SERVICES & PRICING above):
- "Punch list" / "touch-ups" / "small fixes" → Finishing/punch-out work
- "Demo" / "tear out" / "gut it" → Demolition work
- "Drywall" / "sheetrock" / "patch a hole" → Drywall repair/installation
- "Remodel" / "renovation" / "redo the kitchen/bath" → Renovation project — schedule consultation
- "Addition" / "build out" / "add a room" → Room addition — schedule consultation
- "Deck" / "build a deck" / "patio" → Deck/outdoor construction
- "Framing" / "structural" → Structural work
- "Foundation crack" / "settling" → Foundation repair — urgent consultation
- "Water damage" / "flood damage" / "mold" → Water damage restoration — urgent
- "Siding" / "exterior" / "curb appeal" → Exterior renovation
- "Permits" / "do I need a permit?" → Advise to discuss during consultation
- "Load-bearing wall" / "open up the floor plan" → Structural consultation needed
- "GC" / "general contractor" → They're looking for project management
`,
    'medical': `
MEDICAL/HEALTHCARE GUIDANCE:
- Patient privacy is critical - be professional and discrete
- Appointment types:
  * Urgent/Same-day: Symptoms, pain, concerns
  * Follow-up: Existing patients checking results
  * New patient: First visit, need more time
  * Routine: Checkups, physicals
- Important questions:
  * Is this urgent or can it wait?
  * New or existing patient?
  * Insurance information (if applicable)
  * Brief reason for visit (don't ask for detailed symptoms)
- HIPAA considerations:
  * Don't discuss medical details
  * Verify identity before sharing appointment info
  * Keep conversations professional

CUSTOMER LINGO (understanding slang — NOT a service list, only reference SERVICES & PRICING above):
- "Physical" / "annual physical" / "yearly checkup" → Wellness/annual exam
- "Sick visit" / "I'm not feeling well" / "I think I have a cold/flu" → Sick visit (same-day if possible)
- "Follow-up" / "check my results" / "lab results" → Follow-up appointment
- "Referral" / "I need a referral" → Referral request — may need appointment or can sometimes handle by phone
- "Prescription refill" / "need my meds refilled" → Prescription refill (may not need appointment)
- "Pre-op" / "clearance" / "surgical clearance" → Pre-operative clearance appointment
- "Shot" / "vaccine" / "flu shot" / "booster" → Immunization/vaccination appointment
- "Blood work" / "labs" / "need blood drawn" → Lab work appointment
- "Sports physical" / "school physical" → Sports/school physical exam
- "Workers comp" / "work injury" → Work injury visit — note workers comp
- "DOT physical" / "CDL physical" → DOT/CDL physical exam
`,
    'dental': `
DENTAL OFFICE GUIDANCE:
- Appointment types:
  * Emergency: Pain, broken tooth, swelling
  * Routine: Cleaning, checkup
  * Cosmetic: Whitening, veneers (consultation first)
  * Treatment: Fillings, crowns (follow-up from exam)
- Common scenarios:
  * Tooth pain → Offer earliest available, ask about severity
  * Routine cleaning → Schedule 6 months out if preferred
  * New patient → Allow extra time for paperwork
- Always mention:
  * Insurance accepted
  * New patient forms to fill out
  * Arrive 10-15 min early

CUSTOMER LINGO (understanding slang — NOT a service list, only reference SERVICES & PRICING above):
- "Cleaning" / "teeth cleaning" / "just a cleaning" → Hygiene/prophylaxis appointment
- "Chipped my tooth" / "broke a tooth" / "tooth cracked" → Emergency — book urgently
- "Crown fell off" / "lost my crown" / "cap came off" → Emergency — re-cement crown
- "Toothache" / "tooth is killing me" / "throbbing" → Emergency/urgent — pain visit
- "Filling" / "cavity" / "I have a cavity" → Restorative — filling appointment
- "Whitening" / "bleaching" / "want whiter teeth" → Cosmetic whitening consultation
- "Veneers" / "Invisalign" / "braces" / "straighten my teeth" → Cosmetic/ortho consultation
- "Wisdom teeth" / "my wisdoms are coming in" → Consultation for extraction
- "Root canal" / "I need a root canal" → Endodontic treatment appointment
- "Dentures" / "partials" / "my dentures don't fit" → Denture consultation/adjustment
- "Night guard" / "I grind my teeth" / "TMJ" / "jaw pain" → TMJ/bruxism consultation
- "Deep cleaning" / "scaling" → Periodontal scaling and root planing
`,
    'veterinary': `
VETERINARY GUIDANCE:
- Pet emergencies are stressful - be calm and reassuring
- Appointment types:
  * Emergency: Injury, poisoning, difficulty breathing → URGENT
  * Sick visit: Vomiting, lethargy, not eating
  * Wellness: Vaccines, checkups
  * Grooming: Baths, nail trims (if offered)
- Key questions:
  * What type of pet? (dog, cat, exotic)
  * Pet's name and age
  * What symptoms are you seeing?
  * Is your pet eating/drinking normally?
- For emergencies:
  * If after hours, provide emergency vet info
  * Reassure owner and get them in ASAP

CUSTOMER LINGO (understanding slang — NOT a service list, only reference SERVICES & PRICING above):
- "Shots" / "vaccines" / "puppy shots" / "kitten shots" → Vaccination appointment
- "Spay" / "neuter" / "fix" / "get fixed" → Spay/neuter surgery consultation
- "Checkup" / "wellness exam" / "annual" → Wellness exam
- "Not eating" / "won't eat" / "off their food" → Sick visit
- "Limping" / "favoring a leg" / "hurt their paw" → Injury exam
- "Throwing up" / "vomiting" / "diarrhea" → Sick visit (urgent if persistent)
- "Itching" / "scratching" / "hot spots" / "skin issue" → Dermatology/allergy visit
- "Ate something" / "got into the trash" / "ate chocolate" → Potential poisoning — URGENT
- "Lump" / "found a bump" / "growth" → Exam for mass/growth
- "Dental" / "bad breath" / "teeth cleaning" → Dental cleaning (requires anesthesia)
- "Heartworm" / "flea and tick" / "prevention" → Preventive care/medication refill
- "Boarding" / "kennel" → Boarding reservation (if offered)
- "Microchip" → Microchip implantation appointment
`,
    'fitness': `
FITNESS/GYM GUIDANCE:
- Membership inquiries:
  * Types of memberships available
  * Pricing and promotions
  * Trial passes
  * Class schedules
- Personal training:
  * Fitness goals
  * Experience level
  * Preferred times
  * Any injuries or limitations
- Tour scheduling:
  * Best times to see the facility
  * What to bring
  * Parking information

CUSTOMER LINGO (understanding slang — NOT a service list, only reference SERVICES & PRICING above):
- "Sign up" / "join" / "membership" → Membership inquiry
- "Tour" / "check out the gym" / "look around" → Facility tour appointment
- "Personal trainer" / "PT" / "one-on-one" → Personal training session/consultation
- "Group class" / "spin" / "yoga" / "Pilates" / "HIIT" → Group fitness class booking
- "Day pass" / "guest pass" / "trial" → Trial/guest pass
- "Freeze my membership" / "put it on hold" → Membership hold request
- "Cancel" / "cancel my membership" → Cancellation request — follow retention protocol
- "Locker" / "towel service" → Amenity inquiry
- "Pool" / "lap swim" / "swim lanes" → Pool/aquatics schedule
- "Kids program" / "child care" / "kids' club" → Youth program or childcare inquiry
- "Body comp" / "InBody" / "assessment" → Fitness assessment appointment
- "Rehab" / "physical therapy" / "recovering from injury" → Note limitations, suggest PT consultation
`,
    'restaurant': `
RESTAURANT AI ORDERING & RESERVATIONS:

You can take food orders over the phone AND handle reservations. You have access to the restaurant's full menu.

PHONE ORDERING FLOW:
1. Greet the caller warmly.
2. If ordering: Ask what they'd like. If unsure, ask which category they want to hear — appetizers, entrees, or drinks. Read ONE category at a time using getMenuCategory, then ask if they want to hear another.
3. NEVER read the entire menu in one long list. Always go category by category.
4. When they pick an item, confirm it and ask if they'd like anything else.
5. Only mention modifiers if the item actually has modifier groups listed in the menu data. If an item has NO modifiers, do NOT ask about toppings, sizes, cooking temp, or customizations.
6. Upsell briefly once: "Would you like to add a drink?" — don't push.
7. When done ordering, read back the complete order with prices and total.
8. Ask for their name. You already have their phone number from caller ID — do NOT ask for it.
9. {{ORDER_TYPE_STEP}}
10. Call the createOrder function to place the order.
11. Confirm the order was placed and say it'll be ready soon.

CRITICAL MENU RULES:
- ONLY offer items that are EXACTLY on the menu. The menu is your single source of truth.
- If a customer asks for something not on the menu (pizza, Coke, beer, Alfredo, etc.), say "I'm sorry, we don't have that" and suggest the closest item that IS on the menu.
- NEVER invent or assume menu items, brands, or variations. If "soda" is on the menu, say "soda" — don't say Coca Cola, Sprite, or any brand name.
- NEVER ask about modifiers (toppings, cooking temp, size) unless the item's menu data includes modifier groups. Most items have NO modifiers — just confirm the item and move on.
- Use getMenuCategory (not getMenu) when the customer asks about a specific section. Only use getMenu if they want to hear everything.

VOICE CONVERSATION TIPS:
- Be natural and conversational on the phone.
- Don't repeat the whole order after every single item — just confirm what they just said and ask "anything else?"
- Read back the full order only ONCE, right before placing it.
- If you're calling a function, don't say "just a sec" or "hold on". Wait silently for the result — the pause is brief and natural.
- When the customer's speech is unclear, make your best guess and confirm: "Did you say mozzarella sticks?" instead of "I don't understand."

PHONE NUMBER HANDLING:
- The caller's phone number is automatically captured from caller ID.
- Do NOT ask the customer for their phone number. You already have it.
- Only ask for their NAME before placing the order.

COMMON QUESTIONS:
- Hours and location
- Parking availability
- Private events/catering

IMPORTANT:
- NEVER guess at prices — always reference the menu data.
- Be patient with customers who are deciding.
- If they ask for an item that sounds similar to something on the menu, suggest the closest match.
- For large orders (5+ items), confirm in groups of 2-3.

RESERVATION HANDLING:
If a customer calls to make a reservation or book a table:
1. Ask how many guests and what date they'd like.
2. Call checkReservationAvailability with the date and party size.
3. Present 2-3 available time options conversationally: "We have openings at 6, 7, and 8 PM. What works best?"
4. Once they pick a time, confirm: "Great, so that's a table for [X] on [date] at [time]?"
5. Ask for their name if you don't already have it.
6. Ask: "Any special requests? Dietary needs, celebrations, seating preferences?"
7. Call makeReservation with all the details.
8. Confirm the booking: "You're all set! Your reservation for [X] is confirmed for [date] at [time]."
9. Mention they'll receive a confirmation text.

If a customer calls to CANCEL a reservation:
1. Ask for their name and the date of their reservation.
2. Call cancelReservation.
3. Confirm the cancellation politely.

If no times are available, suggest trying another date or calling back.

CUSTOMER LINGO (understanding slang — NOT a service list, only reference SERVICES & PRICING above):
- "Pickup" / "to-go" / "carryout" / "takeout" → Pickup order
- "Delivery" / "can you deliver?" → Delivery order (if offered)
- "Dine-in" / "eat there" / "table for" → Reservation
- "Party" / "large group" / "event" / "private dining" → Large party reservation or catering inquiry
- "Catering" / "cater an event" → Catering inquiry
- "What's good?" / "what do you recommend?" → Ask about popular items, suggest best sellers
- "Allergies" / "gluten-free" / "dairy-free" / "nut allergy" → Note allergy — check menu items carefully
- "Kids menu" / "children's" → Kids menu section
- "Happy hour" / "drink specials" → Happy hour menu/hours
- "Gift card" / "gift certificate" → Gift card inquiry
- "Reservation" / "book a table" / "table for tonight" → Reservation booking
`,
    'retail': `
RETAIL GUIDANCE:
- Product inquiries:
  * Check if item is in stock
  * Pricing and promotions
  * Store hours
  * Return policy
- Service scheduling (if applicable):
  * Appointments for fittings
  * Personal shopping
  * Pickup scheduling
- Always helpful to:
  * Know current sales/promotions
  * Mention online ordering options
  * Provide store location details

CUSTOMER LINGO (understanding slang — NOT a service list, only reference SERVICES & PRICING above):
- "Do you have it in stock?" / "is it available?" → Inventory check
- "Hold it for me" / "can you put it aside?" → Item hold/reserve request
- "Return" / "exchange" / "bring it back" → Return/exchange — share policy
- "Price match" / "I saw it cheaper at..." → Price match policy inquiry
- "Layaway" / "put it on hold" → Layaway program (if offered)
- "Gift wrap" / "it's a gift" → Gift wrapping service
- "Pickup" / "curbside" / "buy online pickup" → Order pickup
- "Personal shopper" / "need help picking" → Personal shopping service (if offered)
- "Sale" / "discount" / "any deals?" → Current promotions inquiry
- "Custom order" / "special order" / "can you order it?" → Special order request
`,
    'professional': `
PROFESSIONAL SERVICES GUIDANCE:
- Common professional services:
  * Legal: Consultations, document prep
  * Accounting: Tax prep, bookkeeping
  * Consulting: Strategy sessions
  * Real estate: Property viewings
- Consultation scheduling:
  * Initial consultations (allow more time)
  * Follow-up meetings
  * Document review sessions
- Key questions:
  * Nature of the matter (general terms)
  * Urgency level
  * Any deadlines to be aware of
  * Documents they should bring

CUSTOMER LINGO (understanding slang — NOT a service list, only reference SERVICES & PRICING above):
- "Consult" / "consultation" / "initial meeting" → Initial consultation appointment
- "Follow-up" / "check in" / "update meeting" → Follow-up appointment
- "Taxes" / "file my taxes" / "tax prep" → Tax preparation appointment (accounting)
- "Audit" / "IRS letter" / "got a notice" → Urgent — tax issue consultation
- "Will" / "estate planning" / "trust" → Estate planning consultation (legal)
- "Closing" / "real estate closing" → Closing appointment (legal/real estate)
- "Showing" / "view a property" / "open house" → Property viewing (real estate)
- "Contract review" / "look over a contract" → Document review appointment (legal)
- "Bookkeeping" / "monthly books" / "reconciliation" → Ongoing bookkeeping service
- "Retainer" / "ongoing services" → Retainer/ongoing engagement discussion
- "Second opinion" → New client consultation — note they're seeking second opinion
`,
    'general': `
GENERAL SERVICE GUIDANCE:
- Listen carefully to understand what the customer needs
- If unsure about timing, book a consultation appointment
- Always confirm customer contact information
- Take detailed notes to help the business prepare
- Ask clarifying questions to properly categorize the request
- When in doubt, offer to have someone call them back
- If team members are listed above, ask the customer if they have a preference for who they'd like to see

CUSTOMER LINGO TIPS:
- Pay attention to informal language — customers rarely use official service names
- If they describe a problem rather than naming a service, match it to the closest available service
- When unsure what service they need, ask: "Can you tell me a bit more about what you're looking for?" then match to available services
- Include customer's own words in booking notes so the business knows exactly what was discussed
`
  };

  // Select appropriate industry prompt
  let industryPrompt = industryPrompts['general'];
  for (const [key, prompt] of Object.entries(industryPrompts)) {
    if (businessType.includes(key)) {
      industryPrompt = prompt;
      break;
    }
  }

  // Replace {{ORDER_TYPE_STEP}} with dynamic order type instructions
  if (businessType.includes('restaurant')) {
    const pickupEnabled = business.restaurantPickupEnabled ?? true;
    const deliveryEnabled = business.restaurantDeliveryEnabled ?? false;

    let orderTypeStep: string;
    if (pickupEnabled && deliveryEnabled) {
      orderTypeStep = 'Ask if it\'s for pickup or delivery.';
    } else if (pickupEnabled) {
      orderTypeStep = 'All orders are for pickup. Confirm this is for pickup — do NOT offer delivery.';
    } else if (deliveryEnabled) {
      orderTypeStep = 'All orders are for delivery. Confirm this is for delivery — do NOT offer pickup.';
    } else {
      orderTypeStep = 'All orders are for pickup. Confirm this is for pickup.';
    }

    industryPrompt = industryPrompt.replace('{{ORDER_TYPE_STEP}}', orderTypeStep);
  }

  // For restaurants with Clover connected, append the full menu to the prompt
  let menuSection = '';
  if (businessType.includes('restaurant') && menuData) {
    menuSection = '\n\n' + formatMenuForPrompt(menuData);
  }

  // Build concise tools reference (tool descriptions are in function definitions — just list them here)
  let toolsRef = `
AVAILABLE TOOLS: recognizeCaller, checkAvailability, bookAppointment, rescheduleAppointment, cancelAppointment, confirmAppointment, getUpcomingAppointments, getServices, getServiceDetails, getEstimate, getStaffMembers, getStaffSchedule, getBusinessHours, checkWaitTime, getCustomerInfo, updateCustomerInfo, leaveMessage, transferCall, scheduleCallback, getDirections`;

  if (businessType.includes('restaurant') && menuData) {
    toolsRef += `, getMenu, getMenuCategory, createOrder`;
  }
  if (businessType.includes('restaurant') && business.reservationEnabled) {
    toolsRef += `, checkReservationAvailability, makeReservation, cancelReservation`;
  }
  if (transferNumbers && transferNumbers.length > 0) {
    toolsRef += `\nFor transferCall, use destination: "${transferNumbers[0]}"`;
  }

  return basePrompt + industryPrompt + menuSection + `
${toolsRef}
${knowledgeSection ? `
KNOWLEDGE BASE (CRM data above takes priority over this):
${knowledgeSection}
` : ''}${options?.customInstructions ? `
CUSTOM INSTRUCTIONS (from the business owner — follow closely):
${options.customInstructions}
` : ''}${options?.afterHoursMessage ? `
AFTER HOURS MESSAGE: "${options.afterHoursMessage}"
` : ''}
Make every caller feel valued. Use their name. Be helpful, not robotic.`;
}

/**
 * Get the standard functions array for Vapi assistants
 */
function getAssistantFunctions() {
  return [
    {
      name: 'checkAvailability',
      description: 'Check available slots. Pass customer\'s exact date words ("this Thursday", "tomorrow"). Server calculates the correct date.',
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'Customer\'s exact words: "tomorrow", "this Thursday", "next Monday". Do NOT convert to YYYY-MM-DD.' },
          serviceId: { type: 'number', description: 'Service ID if known' },
          staffId: { type: 'number', description: 'Staff member ID if known' },
          staffName: { type: 'string', description: 'Staff member name if preferred' }
        },
        required: ['date']
      }
    },
    {
      name: 'bookAppointment',
      description: 'Book after customer confirms. Pass customerId + customerName + serviceName + exact date from checkAvailability.',
      parameters: {
        type: 'object',
        properties: {
          customerId: { type: 'number', description: 'Customer ID from recognizeCaller' },
          customerPhone: { type: 'string', description: 'Customer phone' },
          customerName: { type: 'string', description: 'Customer full name (required)' },
          date: { type: 'string', description: 'YYYY-MM-DD from checkAvailability' },
          time: { type: 'string', description: 'Time like "2pm" or "14:00"' },
          serviceId: { type: 'number', description: 'Service ID' },
          serviceName: { type: 'string', description: 'Service name (required)' },
          staffId: { type: 'number' },
          staffName: { type: 'string' },
          notes: { type: 'string', description: 'What the customer needs or special requests' }
        },
        required: ['customerPhone', 'customerName', 'date', 'time']
      }
    },
    {
      name: 'getServices',
      description: 'Get services with prices.',
      parameters: { type: 'object', properties: {} }
    },
    {
      name: 'getStaffMembers',
      description: 'Refresh team member list (already pre-loaded above — only call if needed mid-call).',
      parameters: { type: 'object', properties: {} }
    },
    {
      name: 'getStaffSchedule',
      description: 'Get a staff member\'s working hours.',
      parameters: {
        type: 'object',
        properties: {
          staffName: { type: 'string', description: 'Staff member name' },
          staffId: { type: 'number', description: 'Staff member ID' }
        }
      }
    },
    {
      name: 'getBusinessHours',
      description: 'Get business hours and open/closed status.',
      parameters: { type: 'object', properties: {} }
    },
    {
      name: 'recognizeCaller',
      description: 'Identify returning caller. Call once at start. Returns summary, customer context, and currentStatus (real-time open/closed).',
      parameters: { type: 'object', properties: {} }
    },
    {
      name: 'getUpcomingAppointments',
      description: 'Get caller\'s upcoming appointments. Use before rescheduling or canceling.',
      parameters: { type: 'object', properties: {} }
    },
    {
      name: 'rescheduleAppointment',
      description: 'Move an existing appointment to a new date/time.',
      parameters: {
        type: 'object',
        properties: {
          appointmentId: { type: 'number' },
          newDate: { type: 'string' },
          newTime: { type: 'string' }
        },
        required: ['newDate', 'newTime']
      }
    },
    {
      name: 'cancelAppointment',
      description: 'Cancel an existing appointment.',
      parameters: {
        type: 'object',
        properties: {
          appointmentId: { type: 'number' },
          reason: { type: 'string' }
        }
      }
    },
    // NOTE: transferCall is handled by Vapi's native transferCall tool (see buildNativeTools),
    // NOT as a custom function. The native tool performs the actual phone transfer.
    {
      name: 'leaveMessage',
      description: 'Leave a message for the owner. Only use if caller explicitly asks — try helping them first.',
      parameters: {
        type: 'object',
        properties: {
          message: { type: 'string' },
          callbackRequested: { type: 'boolean' }
        },
        required: ['message']
      }
    },
    {
      name: 'updateCustomerInfo',
      description: 'Save or update caller\'s name. Call immediately when a new caller tells you their name. Also use when a returning caller corrects their name. Pass customerId from recognizeCaller.',
      parameters: {
        type: 'object',
        properties: {
          customerId: { type: 'number', description: 'Customer ID from recognizeCaller' },
          firstName: { type: 'string', description: 'Correct first name' },
          lastName: { type: 'string', description: 'Correct last name' },
          email: { type: 'string', description: 'Email address' }
        }
      }
    },
    {
      name: 'confirmAppointment',
      description: 'Confirm a caller\'s upcoming appointment. Auto-finds their next appointment by phone number. Use immediately when caller says "confirm" or "calling to confirm".',
      parameters: {
        type: 'object',
        properties: {
          appointmentId: { type: 'number', description: 'Appointment ID if known from recognizeCaller. Optional — will auto-find by phone.' },
          confirmed: { type: 'boolean', description: 'true to confirm, false if they want to reschedule instead' }
        },
        required: ['confirmed']
      }
    },
    {
      name: 'getEstimate',
      description: 'Get a price estimate for one or more services. Use when caller asks "how much" or "what does it cost".',
      parameters: {
        type: 'object',
        properties: {
          serviceNames: { type: 'array', items: { type: 'string' }, description: 'Service names to estimate' },
          description: { type: 'string', description: 'What the customer described needing' }
        }
      }
    },
    {
      name: 'checkWaitTime',
      description: 'Check current wait time and next available slot for today. Use when caller asks "how long is the wait" or "can I come in now".',
      parameters: { type: 'object', properties: {} }
    },
    {
      name: 'getServiceDetails',
      description: 'Get detailed info about a specific service (price, duration, description). Use when caller asks about a particular service.',
      parameters: {
        type: 'object',
        properties: {
          serviceName: { type: 'string', description: 'Name of the service to look up' }
        },
        required: ['serviceName']
      }
    }
  ];
}

/**
 * Get restaurant-specific functions for VAPI (Clover ordering)
 */
function getRestaurantFunctions() {
  return [
    {
      name: 'getMenu',
      description: 'Get the full restaurant menu with categories, items, prices, and modifiers. Call this when a customer asks about the menu, what you serve, or prices.',
      parameters: {
        type: 'object',
        properties: {}
      }
    },
    {
      name: 'getMenuCategory',
      description: 'Get items in a specific menu category. Use when the customer asks about a specific section like "appetizers", "entrees", "drinks", "desserts", etc.',
      parameters: {
        type: 'object',
        properties: {
          categoryName: {
            type: 'string',
            description: 'The category name to look up (e.g., "appetizers", "entrees", "drinks", "desserts", "sides")'
          }
        },
        required: ['categoryName']
      }
    },
    {
      name: 'createOrder',
      description: 'Place an order in the restaurant POS system. Call this ONLY after reading back the complete order and getting customer confirmation. IMPORTANT: Each item\'s itemId must be the EXACT item name from the menu (e.g. "lemonade", "buffalo wings", "classic burger") — NOT the category name (never use "drinks", "entree", "appetizer" as an itemId).',
      parameters: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            description: 'Array of items to order',
            items: {
              type: 'object',
              properties: {
                itemId: { type: 'string', description: 'The EXACT item name from the menu (e.g. "lemonade", "caesar salad"). Must be a specific item, NOT a category name.' },
                quantity: { type: 'number', description: 'Number of this item to order' },
                modifiers: {
                  type: 'array',
                  description: 'Selected modifiers for this item',
                  items: {
                    type: 'object',
                    properties: {
                      modifierId: { type: 'string', description: 'The modifier ID' }
                    },
                    required: ['modifierId']
                  }
                },
                notes: { type: 'string', description: 'Special instructions for this item' }
              },
              required: ['itemId', 'quantity']
            }
          },
          callerPhone: { type: 'string', description: 'Customer phone number' },
          callerName: { type: 'string', description: 'Customer name' },
          orderType: { type: 'string', description: 'Type of order: pickup, delivery, or dine_in' },
          orderNotes: { type: 'string', description: 'General notes for the order' }
        },
        required: ['items', 'callerName']
      }
    }
  ];
}

/**
 * Restaurant reservation functions for AI phone receptionist.
 * These allow the AI to check availability, make reservations, and cancel them.
 */
function getReservationFunctions() {
  return [
    {
      name: 'checkReservationAvailability',
      description: 'Check available reservation times for a given date and party size. Call this when a customer wants to make a reservation and you need to find available times.',
      parameters: {
        type: 'object',
        properties: {
          date: {
            type: 'string',
            description: 'The date to check in natural language (e.g., "tomorrow", "Friday", "March 15") or YYYY-MM-DD format'
          },
          partySize: {
            type: 'number',
            description: 'Number of guests in the party'
          }
        },
        required: ['date', 'partySize']
      }
    },
    {
      name: 'makeReservation',
      description: 'Book a reservation after confirming all details with the customer. Call this ONLY after the customer confirms the date, time, and party size.',
      parameters: {
        type: 'object',
        properties: {
          date: {
            type: 'string',
            description: 'The reservation date (YYYY-MM-DD format, from checkReservationAvailability response)'
          },
          time: {
            type: 'string',
            description: 'The reservation time in HH:MM format (24-hour, from availability response)'
          },
          partySize: {
            type: 'number',
            description: 'Number of guests'
          },
          customerName: {
            type: 'string',
            description: 'Full name of the customer making the reservation'
          },
          specialRequests: {
            type: 'string',
            description: 'Any special requests like dietary restrictions, celebrations, seating preferences'
          }
        },
        required: ['date', 'time', 'partySize', 'customerName']
      }
    },
    {
      name: 'cancelReservation',
      description: 'Cancel an existing reservation. Use when a customer calls to cancel their reservation.',
      parameters: {
        type: 'object',
        properties: {
          customerName: {
            type: 'string',
            description: 'Name of the customer who made the reservation'
          },
          date: {
            type: 'string',
            description: 'The date of the reservation to cancel (optional, helps find the right one)'
          }
        },
        required: ['customerName']
      }
    }
  ];
}

/**
 * Build native VAPI tools (endCall, transferCall).
 * endCall is ALWAYS included so the AI can hang up after goodbye.
 * transferCall is included only if transfer numbers are configured.
 */
function buildNativeTools(
  transferPhoneNumbers: string[],
  businessPhone?: string | null
): any[] {
  const tools: any[] = [];

  // Always include endCall so the AI can hang up after goodbye
  tools.push({ type: 'endCall' });

  // Determine effective transfer numbers — use configured numbers, fallback to business phone
  const numbers = transferPhoneNumbers.length > 0
    ? transferPhoneNumbers
    : (businessPhone ? [businessPhone] : []);

  if (numbers.length > 0) {
    // Normalize to E.164 format and filter out invalid numbers
    const validNumbers = numbers
      .map(num => {
        const digits = num.replace(/\D/g, '');
        if (digits.startsWith('1') && digits.length === 11) return `+${digits}`;
        if (digits.length === 10) return `+1${digits}`;
        if (num.startsWith('+') && digits.length >= 10 && digits.length <= 15) return `+${digits}`;
        return null; // Invalid — skip this number
      })
      .filter((num): num is string => {
        if (!num) return false;
        // Validate E.164: + followed by 10-15 digits
        const isValid = /^\+[1-9]\d{9,14}$/.test(num);
        if (!isValid) {
          console.warn(`[Vapi] Skipping invalid transfer number: ${num}`);
        }
        return isValid;
      });

    if (validNumbers.length > 0) {
      tools.push({
        type: 'transferCall',
        destinations: validNumbers.map(num => ({
          type: 'number',
          number: num,
          message: 'I am transferring your call now. Please hold for just a moment.',
        })),
      });
    }
  }

  return tools;
}

/**
 * Create or update a Vapi assistant for a business
 */
export async function createAssistantForBusiness(
  business: Business,
  services: Service[],
  businessHours?: any[],
  receptionistConfig?: ReceptionistConfig | null,
  knowledgeSection?: string
): Promise<{ assistantId: string; error?: string }> {
  if (!VAPI_API_KEY) {
    return { assistantId: '', error: 'Vapi API key not configured' };
  }

  // For restaurants, try to load cached menu data from connected POS (Square or Clover)
  let menuData: CachedMenu | null = null;
  const isRestaurant = business.industry?.toLowerCase()?.includes('restaurant');
  if (isRestaurant) {
    try {
      if (business.squareAccessToken) {
        menuData = await getSquareCachedMenu(business.id);
      } else if (business.cloverMerchantId) {
        menuData = await getCloverCachedMenu(business.id);
      } else if (business.heartlandApiKey) {
        menuData = await getHeartlandCachedMenu(business.id);
      }
    } catch (e) {
      console.warn(`Could not load POS menu for business ${business.id}:`, e);
    }
  }

  // Extract config values with sensible defaults
  const configVoiceId = receptionistConfig?.voiceId || 'paula';
  const configAssistantName = receptionistConfig?.assistantName || 'Alex';
  // Extract config values with sensible defaults
  const configRecordingEnabled = receptionistConfig?.callRecordingEnabled ?? true;
  // First message: greeting with conditional recording disclosure + engagement question.
  // IMPORTANT: Must end with a question so the caller responds while recognizeCaller runs in background.
  const configGreeting = buildFirstMessage(business.name, receptionistConfig?.greeting, configRecordingEnabled);
  const configMaxCallMinutes = receptionistConfig?.maxCallLengthMinutes ?? 10;
  const configVoicemailEnabled = receptionistConfig?.voicemailEnabled ?? true;
  const configAfterHoursMessage = receptionistConfig?.afterHoursMessage || '';
  const configCustomInstructions = receptionistConfig?.customInstructions || '';
  const transferPhoneNumbers: string[] = Array.isArray(receptionistConfig?.transferPhoneNumbers)
    ? receptionistConfig.transferPhoneNumbers as string[]
    : [];

  // Build native Vapi tools (endCall + transferCall)
  const nativeTools = buildNativeTools(transferPhoneNumbers, business.phone);
  const transferCallTool = nativeTools.find((t: any) => t.type === 'transferCall');
  const normalizedTransferNumbers = transferCallTool?.destinations?.map((d: any) => d.number) || [];

  // Pre-load staff members to embed in the system prompt (eliminates getStaffMembers call at start)
  let staffSection = '';
  try {
    const staffMembers = await storage.getStaff(business.id);
    const activeStaff = staffMembers.filter((s: any) => s.active !== false);
    if (activeStaff.length > 0) {
      staffSection = `\nTEAM MEMBERS (already loaded — do NOT call getStaffMembers at call start):\nIMPORTANT: NEVER say staff IDs, internal data, or technical details to the caller. Only use first names naturally.\n` +
        activeStaff.map((s: any) => {
          const name = s.firstName;
          return `- ${name} [staffId=${s.id}]${s.specialty ? ' — ' + s.specialty : ''}`;
        }).join('\n') + '\n';
    }
  } catch (e) {
    console.warn('Could not pre-load staff for system prompt:', e);
  }

  const systemPrompt = generateSystemPrompt(business, services, businessHours, menuData, {
    assistantName: configAssistantName,
    customInstructions: configCustomInstructions,
    afterHoursMessage: configAfterHoursMessage,
    voicemailEnabled: configVoicemailEnabled,
    staffSection,
  }, knowledgeSection, normalizedTransferNumbers);

  // Build functions list — conditionally exclude leaveMessage if voicemail is disabled
  const baseFunctions = getAssistantFunctions();
  const functions = configVoicemailEnabled
    ? baseFunctions
    : baseFunctions.filter(f => f.name !== 'leaveMessage');

  const assistantConfig = {
    name: `${business.name} Receptionist`,
    model: {
      provider: 'openai',
      model: 'gpt-4.1-mini-2025-04-14', // Latest model Vapi supports — fast, strong reasoning
      temperature: 0.6, // Slightly lower for more consistent, accurate responses
      maxTokens: 250, // Cap for voice — human receptionists use 10-25 words per response
      systemPrompt: systemPrompt,
      functions: [
        ...functions,
        // Restaurant ordering functions (Clover POS) — conditionally added
        ...(isRestaurant && menuData ? getRestaurantFunctions() : []),
        // Restaurant reservation functions — conditionally added
        ...(isRestaurant && business.reservationEnabled ? getReservationFunctions() : [])
      ],
      // Native VAPI transferCall tool — must be in model.tools for Vapi to recognize it
      tools: nativeTools,
    },
    transcriber: {
      provider: 'deepgram',
      model: 'nova-2', // Latest Deepgram model — fastest + most accurate
      language: 'en', // English-only — faster, more reliable barge-in recovery than 'multi'
    },
    backgroundDenoisingEnabled: true, // Helps Deepgram filter background noise and focus on voice
    voice: {
      provider: '11labs',
      voiceId: configVoiceId,
      stability: 0.4, // Slightly lower for faster voice generation
      similarityBoost: 0.75,
      style: 0.2, // Less style processing = faster
      useSpeakerBoost: true,
      optimizeStreamingLatency: 3, // High optimization but avoids first-word clipping at level 4
    },
    // START SPEAKING PLAN: Controls when the AI starts responding after the user stops talking.
    // Default onNoPunctuationSeconds is 1.5s — WAY too slow for phone conversations.
    // This single config is the biggest latency win: cuts perceived response time from ~1.5s to ~0.5s.
    startSpeakingPlan: {
      waitSeconds: 0.5, // Minimum wait before speaking — natural conversational pause
      smartEndpointingEnabled: false, // Disabled — we use transcription endpointing instead (faster)
      transcriptionEndpointingPlan: {
        onPunctuationSeconds: 0.3, // After punctuation — enough buffer for mid-sentence pauses ("I need... a haircut")
        onNoPunctuationSeconds: 0.6, // After speech without punctuation — balanced between responsiveness and letting callers finish
        onNumberSeconds: 0.5, // After numbers (phone numbers, dates) — let them finish the full number
      },
    },
    firstMessage: configGreeting,
    serverUrl: `${BASE_URL}/api/vapi/webhook`,
    recordingEnabled: configRecordingEnabled,
    hipaaEnabled: false,
    silenceTimeoutSeconds: 30, // End call after 30s silence — enough buffer if STT briefly drops audio
    responseDelaySeconds: 0.1, // Near-instant response — natural enough for voice
    llmRequestDelaySeconds: 0, // No LLM delay — respond as fast as possible
    numWordsToInterruptAssistant: 4, // Prevents filler words ("uh huh", "oh yeah") from cutting off the AI
    maxDurationSeconds: configMaxCallMinutes * 60,
    backgroundSound: 'off',
    // When the AI says any of these phrases, Vapi automatically hangs up (platform-level)
    // Include versions with period, exclamation, and bare — TTS output punctuation varies
    // Also include Spanish equivalents for multilingual support
    // Only use FULL farewell phrases — bare "Goodbye" is too trigger-happy and catches mid-sentence
    // Only FULL farewell phrases — bare "Goodbye"/"Bye bye" are too trigger-happy mid-sentence
    endCallPhrases: [
      "Have a great day",
      "Have a wonderful day",
      "Have a good one",
      "Have a good day",
      "Take care, goodbye",
      "Thanks for calling, have a great day",
      "Thank you for calling, have a great day",
      "Sounds great, have a great day",
      "You're all set, take care",
      // Spanish equivalents
      "Que tenga un buen día",
      "Que tenga un excelente día",
      "Gracias por llamar, que tenga un buen día",
      "Cuídese mucho",
    ],
    metadata: {
      businessId: business.id.toString()
    }
  };

  try {
    const response = await fetch(`${VAPI_BASE_URL}/assistant`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${VAPI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(assistantConfig)
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Vapi assistant creation error:', error);
      return { assistantId: '', error: `Failed to create assistant: ${error}` };
    }

    const assistant = await response.json();
    console.log(`Created Vapi assistant for ${business.name}: ${assistant.id}`);

    return { assistantId: assistant.id };
  } catch (error) {
    console.error('Error creating Vapi assistant:', error);
    return { assistantId: '', error: String(error) };
  }
}

/**
 * Update an existing Vapi assistant
 */
export async function updateAssistant(
  assistantId: string,
  business: Business,
  services: Service[],
  businessHours?: any[],
  receptionistConfig?: ReceptionistConfig | null,
  knowledgeSection?: string
): Promise<{ success: boolean; error?: string }> {
  if (!VAPI_API_KEY) {
    return { success: false, error: 'Vapi API key not configured' };
  }

  // Load menu data for restaurants with connected POS
  const isRestaurant = business.industry?.toLowerCase()?.includes('restaurant');
  let menuData: CachedMenu | null = null;
  if (isRestaurant) {
    try {
      if (business.squareAccessToken) {
        menuData = await getSquareCachedMenu(business.id);
      } else if (business.cloverMerchantId) {
        menuData = await getCloverCachedMenu(business.id);
      } else if (business.heartlandApiKey) {
        menuData = await getHeartlandCachedMenu(business.id);
      }
    } catch (e) {
      console.warn(`Could not load POS menu for business ${business.id} during assistant update:`, e);
    }
  }

  // Extract config values with sensible defaults
  const configVoiceId = receptionistConfig?.voiceId || 'paula';
  const configAssistantName = receptionistConfig?.assistantName || 'Alex';
  // Extract config values with sensible defaults
  const configRecordingEnabled = receptionistConfig?.callRecordingEnabled ?? true;
  // First message: greeting with conditional recording disclosure + engagement question.
  const configGreeting = buildFirstMessage(business.name, receptionistConfig?.greeting, configRecordingEnabled);
  const configMaxCallMinutes = receptionistConfig?.maxCallLengthMinutes ?? 10;
  const configVoicemailEnabled = receptionistConfig?.voicemailEnabled ?? true;
  const configAfterHoursMessage = receptionistConfig?.afterHoursMessage || '';
  const configCustomInstructions = receptionistConfig?.customInstructions || '';
  const transferPhoneNumbers: string[] = Array.isArray(receptionistConfig?.transferPhoneNumbers)
    ? receptionistConfig.transferPhoneNumbers as string[]
    : [];

  // Build native Vapi tools (endCall + transferCall)
  const nativeTools = buildNativeTools(transferPhoneNumbers, business.phone);
  const transferCallTool = nativeTools.find((t: any) => t.type === 'transferCall');
  const normalizedTransferNumbers = transferCallTool?.destinations?.map((d: any) => d.number) || [];

  // Pre-load staff members to embed in the system prompt
  let staffSection = '';
  try {
    const staffMembers = await storage.getStaff(business.id);
    const activeStaff = staffMembers.filter((s: any) => s.active !== false);
    if (activeStaff.length > 0) {
      staffSection = `\nTEAM MEMBERS (already loaded — do NOT call getStaffMembers at call start):\nIMPORTANT: NEVER say staff IDs, internal data, or technical details to the caller. Only use first names naturally.\n` +
        activeStaff.map((s: any) => {
          // Use staffId internally for tool calls, but instruct AI to only say first name
          const name = s.firstName;
          return `- ${name} [staffId=${s.id}]${s.specialty ? ' — ' + s.specialty : ''}`;
        }).join('\n') + '\n';
    }
  } catch (e) {
    console.warn('Could not pre-load staff for system prompt:', e);
  }

  const systemPrompt = generateSystemPrompt(business, services, businessHours, menuData, {
    assistantName: configAssistantName,
    customInstructions: configCustomInstructions,
    afterHoursMessage: configAfterHoursMessage,
    voicemailEnabled: configVoicemailEnabled,
    staffSection,
  }, knowledgeSection, normalizedTransferNumbers);

  // Get functions — conditionally exclude leaveMessage if voicemail is disabled
  const baseFunctions = getAssistantFunctions();
  const filteredFunctions = configVoicemailEnabled
    ? baseFunctions
    : baseFunctions.filter(f => f.name !== 'leaveMessage');
  const functions = [
    ...filteredFunctions,
    ...(isRestaurant && menuData ? getRestaurantFunctions() : []),
    ...(isRestaurant && business.reservationEnabled ? getReservationFunctions() : [])
  ];

  try {
    const response = await fetch(`${VAPI_BASE_URL}/assistant/${assistantId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${VAPI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: `${business.name} Receptionist`,
        transcriber: {
          provider: 'deepgram',
          model: 'nova-2',
          language: 'en', // English-only — faster, more reliable barge-in recovery than 'multi'
        },
        backgroundDenoisingEnabled: true,
        model: {
          provider: 'openai',
          model: 'gpt-4.1-mini-2025-04-14', // Latest model Vapi supports — fast, strong reasoning
          temperature: 0.6,
          maxTokens: 250, // Cap for voice — human receptionists use 10-25 words per response
          systemPrompt: systemPrompt,
          functions: functions,
          tools: nativeTools,
        },
        voice: {
          provider: '11labs',
          voiceId: configVoiceId,
          stability: 0.4,
          similarityBoost: 0.75,
          style: 0.2,
          useSpeakerBoost: true,
          optimizeStreamingLatency: 3, // High optimization but avoids first-word clipping at level 4
        },
        startSpeakingPlan: {
          waitSeconds: 0.5, // Minimum wait before speaking — natural conversational pause
          smartEndpointingEnabled: false,
          transcriptionEndpointingPlan: {
            onPunctuationSeconds: 0.3, // After punctuation — enough buffer for mid-sentence pauses
            onNoPunctuationSeconds: 0.6, // Balanced between responsiveness and letting callers finish
            onNumberSeconds: 0.5, // Let callers finish full numbers
          },
        },
        firstMessage: configGreeting,
        recordingEnabled: configRecordingEnabled,
        silenceTimeoutSeconds: 30, // End call after 30s silence — enough buffer if STT briefly drops audio
        responseDelaySeconds: 0.1,
        llmRequestDelaySeconds: 0,
        numWordsToInterruptAssistant: 4, // Prevents filler words from cutting off the AI
        maxDurationSeconds: configMaxCallMinutes * 60,
        // Only FULL farewell phrases — bare "Goodbye"/"Bye bye" are too trigger-happy mid-sentence
        endCallPhrases: [
          "Have a great day",
          "Have a wonderful day",
          "Have a good one",
          "Have a good day",
          "Take care, goodbye",
          "Thanks for calling, have a great day",
          "Thank you for calling, have a great day",
          "Sounds great, have a great day",
          "You're all set, take care",
          // Spanish equivalents
          "Que tenga un buen día",
          "Que tenga un excelente día",
          "Gracias por llamar, que tenga un buen día",
          "Cuídese mucho",
        ],
        serverUrl: `${BASE_URL}/api/vapi/webhook`,
        metadata: {
          businessId: business.id.toString()
        }
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`[VapiUpdate] FAILED for assistant ${assistantId}:`, error);
      return { success: false, error: `Failed to update assistant: ${error}` };
    }

    // Log the response to verify endCallPhrases was accepted
    const responseData = await response.json();
    console.log(`[VapiUpdate] SUCCESS for assistant ${assistantId}`);
    console.log(`[VapiUpdate] endCallPhrases in response:`, JSON.stringify(responseData.endCallPhrases));
    console.log(`[VapiUpdate] model.tools in response:`, JSON.stringify(responseData.model?.tools?.map((t: any) => t.type)));

    return { success: true };
  } catch (error) {
    console.error(`[VapiUpdate] Error:`, error);
    return { success: false, error: String(error) };
  }
}

/**
 * Delete a Vapi assistant
 */
export async function deleteAssistant(assistantId: string): Promise<{ success: boolean; error?: string }> {
  if (!VAPI_API_KEY) {
    return { success: false, error: 'Vapi API key not configured' };
  }

  try {
    const response = await fetch(`${VAPI_BASE_URL}/assistant/${assistantId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${VAPI_API_KEY}`
      }
    });

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error: `Failed to delete assistant: ${error}` };
    }

    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

/**
 * Import a phone number to Vapi and assign an assistant
 * Note: For Twilio numbers, we use the forwarding approach instead
 */
export async function importPhoneNumber(
  phoneNumber: string,
  twilioAccountSid: string,
  twilioAuthToken: string,
  assistantId: string
): Promise<{ phoneNumberId?: string; error?: string }> {
  if (!VAPI_API_KEY) {
    return { error: 'Vapi API key not configured' };
  }

  try {
    const response = await fetch(`${VAPI_BASE_URL}/phone-number`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${VAPI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        provider: 'twilio',
        number: phoneNumber,
        twilioAccountSid: twilioAccountSid,
        twilioAuthToken: twilioAuthToken,
        assistantId: assistantId
      })
    });

    if (!response.ok) {
      const error = await response.text();
      return { error: `Failed to import phone number: ${error}` };
    }

    const result = await response.json();
    return { phoneNumberId: result.id };
  } catch (error) {
    return { error: String(error) };
  }
}

/**
 * Get an assistant by ID
 */
export async function getAssistant(assistantId: string): Promise<VapiAssistant | null> {
  if (!VAPI_API_KEY) {
    return null;
  }

  try {
    const response = await fetch(`${VAPI_BASE_URL}/assistant/${assistantId}`, {
      headers: {
        'Authorization': `Bearer ${VAPI_API_KEY}`
      }
    });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('Error getting Vapi assistant:', error);
    return null;
  }
}

/**
 * List all assistants
 */
export async function listAssistants(): Promise<VapiAssistant[]> {
  if (!VAPI_API_KEY) {
    return [];
  }

  try {
    const response = await fetch(`${VAPI_BASE_URL}/assistant`, {
      headers: {
        'Authorization': `Bearer ${VAPI_API_KEY}`
      }
    });

    if (!response.ok) {
      return [];
    }

    return await response.json();
  } catch (error) {
    console.error('Error listing Vapi assistants:', error);
    return [];
  }
}

/**
 * Create an outbound call using Vapi's API.
 * Calls the specified phone number and connects them to the given Vapi assistant.
 * Used for "Test Call" feature so business owners can hear their AI receptionist.
 */
export async function createOutboundCall(
  assistantId: string,
  phoneNumberId: string,
  customerNumber: string
): Promise<{ callId?: string; error?: string }> {
  if (!VAPI_API_KEY) {
    return { error: 'Vapi API key not configured' };
  }

  try {
    const response = await fetch(`${VAPI_BASE_URL}/call/phone`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${VAPI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        assistantId,
        phoneNumberId,
        customer: {
          number: customerNumber
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[TestCall] Vapi outbound call failed:', response.status, errorText);
      return { error: `Failed to create outbound call: ${response.status}` };
    }

    const result = await response.json();
    console.log(`[TestCall] Outbound call created: ${result.id} to ${customerNumber}`);
    return { callId: result.id };
  } catch (error) {
    console.error('[TestCall] Error creating Vapi outbound call:', error);
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export default {
  createAssistantForBusiness,
  updateAssistant,
  deleteAssistant,
  importPhoneNumber,
  getAssistant,
  listAssistants,
  createOutboundCall
};
