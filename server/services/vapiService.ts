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
    return 'Monday-Friday 9am-5pm';
  }

  const dayOrder = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const sortedHours = [...hours].sort((a, b) => dayOrder.indexOf(a.day) - dayOrder.indexOf(b.day));

  const formatted = sortedHours.map(h => {
    const dayName = h.day.charAt(0).toUpperCase() + h.day.slice(1);
    if (h.isClosed || (!h.open && !h.close)) {
      return `${dayName}: CLOSED`;
    }
    // Format times like "09:00" to "9 AM"
    const formatTime = (time: string) => {
      if (!time) return '';
      const [hourStr, minStr] = time.split(':');
      const hour = parseInt(hourStr);
      const min = parseInt(minStr || '0');
      const period = hour >= 12 ? 'PM' : 'AM';
      const hour12 = hour > 12 ? hour - 12 : (hour === 0 ? 12 : hour);
      return min > 0 ? `${hour12}:${minStr} ${period}` : `${hour12} ${period}`;
    };
    return `${dayName}: ${formatTime(h.open)} - ${formatTime(h.close)}`;
  });

  return formatted.join(', ');
}

/**
 * Determine if business is currently open based on hours
 */
function isBusinessOpenNow(hours: any[], timezone: string = 'America/New_York'): { isOpen: boolean; todayHours: string } {
  // Use business timezone to determine what day it is (not server UTC)
  const today = new Date().toLocaleDateString('en-US', {
    timeZone: timezone,
    weekday: 'long'
  }).toLowerCase();

  const todayHours = hours?.find(h => h.day === today);
  if (!todayHours || todayHours.isClosed || (!todayHours.open && !todayHours.close)) {
    return { isOpen: false, todayHours: 'CLOSED today' };
  }

  return { isOpen: true, todayHours: `Open today: ${todayHours.open} - ${todayHours.close}` };
}

/**
 * Build the firstMessage that plays when the call connects.
 *
 * Rules:
 * 1. ALWAYS includes recording disclosure ("this call may be recorded")
 *    — regardless of whether a custom greeting is stored in the DB.
 * 2. ALWAYS ends with an engagement question so the caller responds
 *    while recognizeCaller runs in the background.
 * 3. Uses the business's custom greeting if set, but injects the
 *    recording disclosure if it's missing from the custom text.
 */
function buildFirstMessage(businessName: string, customGreeting?: string | null): string {
  const recordingPhrase = 'this call may be recorded for quality purposes';
  const engagementQuestion = 'How can I help you today?';

  // No custom greeting — use our complete default
  if (!customGreeting || !customGreeting.trim()) {
    return `Hi, thanks for calling ${businessName}! Just so you know, ${recordingPhrase}. ${engagementQuestion}`;
  }

  let greeting = customGreeting.trim();

  // Check if the custom greeting already mentions recording
  const mentionsRecording = /record|monitor/i.test(greeting);

  // Check if greeting already ends with a question
  const endsWithQuestion = /\?\s*$/.test(greeting);

  if (!mentionsRecording) {
    // Need to inject recording disclosure
    if (endsWithQuestion) {
      // Greeting ends with a question like "How may I help you today?"
      // Strategy: Remove the question, inject disclosure, then add our standard question
      // "Thank you for calling Canton Barb. How may I help you today?"
      //  → "Thank you for calling Canton Barb. Just so you know, this call may be recorded for quality purposes. How can I help you today?"

      // Find where the question starts — look for last sentence boundary before the ?
      const lastQ = greeting.lastIndexOf('?');
      const textBeforeQ = greeting.substring(0, lastQ);

      // Find the start of the question sentence (after last period/exclamation)
      const lastSentenceBreak = Math.max(
        textBeforeQ.lastIndexOf('. '),
        textBeforeQ.lastIndexOf('! '),
        textBeforeQ.lastIndexOf('? ')
      );

      let prefix: string;
      if (lastSentenceBreak >= 0) {
        // There's a sentence before the question — keep it
        prefix = textBeforeQ.substring(0, lastSentenceBreak + 1).trim();
      } else {
        // The entire greeting is one question — use business name intro
        prefix = `Thanks for calling ${businessName}!`;
      }

      greeting = `${prefix} Just so you know, ${recordingPhrase}. ${engagementQuestion}`;
    } else {
      // No question at the end — strip trailing punctuation, add disclosure + question
      const stripped = greeting.replace(/[.!?]+\s*$/, '');
      greeting = `${stripped}. Just so you know, ${recordingPhrase}. ${engagementQuestion}`;
    }
  } else if (!endsWithQuestion) {
    // Has recording mention but doesn't end with question — append one
    const stripped = greeting.replace(/[.!?]+\s*$/, '');
    greeting = `${stripped}. ${engagementQuestion}`;
  }
  // else: has recording mention AND ends with question — use as-is

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

TODAY: ${currentDate} | YEAR: ${currentYear}
STATUS: ${isOpen ? 'OPEN now' : 'CLOSED today'}${todayHours ? ` (${todayHours})` : ''}

PERSONALITY: Warm, conversational, concise. 1-2 sentences at a time. Use casual acknowledgments ("Sure thing", "Absolutely", "Got it"). Show empathy when customers describe problems.

RULES:
- NEVER say IDs, staffId, serviceId, customerId, brackets, or internal data. Use first names and service names only.
- NEVER calculate dates. Pass exact customer words ("this Thursday", "tomorrow") to checkAvailability. Use the date FROM the response.
- ALWAYS wait for customer to respond after asking a question.
- If status says OPEN, you ARE open. Never tell a customer you're closed when open.

BUSINESS INFO:
- ${business.name} | ${business.phone || 'No phone listed'} | ${business.address || 'No address listed'}
- Hours: ${businessHours}

SERVICES & PRICING:
${serviceList}
${options?.staffSection || ''}

== THE CALL FLOW (5 beats) ==

1. GREET: Call recognizeCaller at start.
   → If recognized: Address them by firstName naturally. Use the greeting and summary to personalize. Reference their context (upcoming appointment, preferences, past visits).
   → If not recognized: "How can I help you today?" Ask for their name early.

2. UNDERSTAND: Listen to what they need.
   → Booking? Identify the service. Answer price questions first.
   → Reschedule/cancel? Call getUpcomingAppointments first.
   → Question? Answer directly from your knowledge or call getServices/getBusinessHours.
   → Transfer? Try helping first. Only transfer if they insist twice, or it's a complaint/billing issue.

3. CHECK: Call checkAvailability with their exact date words + serviceId + staffId if known.
   → Offer 2-3 of the returned slots conversationally: "I've got 10 AM, 1 PM, or 3:30. What works for you?"
   → If closed that day, suggest the next open day.
   → If no slots, offer another day or staff member.

4. BOOK: Confirm ALL details before booking: "[Service] on [Day, Month Date] at [Time] for $[Price]. Sound good?"
   → Wait for "yes". Then call bookAppointment with: customerId, customerName (REQUIRED), customerPhone, serviceName (REQUIRED), date (YYYY-MM-DD from checkAvailability), time, notes.
   → Notes: always include what the customer said they need ("brakes squeaking", "wants highlights", etc.)

5. CLOSE: After completing an action, ask "Is there anything else I can help with?" and WAIT for their response.
   → If they say "no" / "that's all" / "I'm good" → THEN say your farewell: "Sounds great! Have a great day!" or "You're all set. Take care, goodbye!"
   → NEVER combine the "anything else?" question and the farewell in the same response. They are two separate turns.
   → Your farewell MUST end with one of: "Have a great day", "Have a wonderful day", "Take care, goodbye". This triggers the call to end.

== KEY RULES ==

DATES: Today is ${currentDate}. Never use 2023/2024/2025 dates. Pass exact customer words to checkAvailability. Use the date in the response when confirming. Say full date: "Thursday, March 20th" not just "Thursday".

NAMES: Required for every booking. If recognized, use their name. If new caller, ask "May I get your name?" early. Never book without customerName. If caller corrects their name, call updateCustomerInfo immediately.

STAFF: If team members are listed above, ask "Do you have someone you usually see?" Use their staffId for checkAvailability and bookAppointment.

AFTER HOURS: You're fully functional after hours — book appointments, answer questions, give pricing. Don't say "call back during business hours." Proactively offer help.
${options?.voicemailEnabled !== false ? 'Only use leaveMessage if caller explicitly asks to leave a message for the owner.' : ''}

NO DEAD AIR: Never say "one moment", "hold on", "let me check". Talk naturally while functions run: "Let's see what we've got..." or "Great question! Looking at the schedule..."

ENDING CALLS: After completing a task, ask "anything else?" and WAIT. Only say your farewell AFTER they confirm they're done. Never say "anything else?" and "goodbye" in the same breath — those are two separate turns. Your farewell must end with "Have a great day" or "Take care, goodbye" (this triggers hang-up).

MULTILINGUAL: Match the caller's language. If they speak Spanish, respond entirely in Spanish. Default to English.

COMPLIANCE: If asked about recording, confirm calls may be recorded for quality assurance.
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
- Keep responses SHORT. On the phone, long responses lose people.
- Don't repeat the whole order after every single item — just confirm what they just said and ask "anything else?"
- Read back the full order only ONCE, right before placing it.
- If you're calling a function, don't say "just a sec" or "hold on" every time. Only say it if it's actually going to take a moment.
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
AVAILABLE TOOLS: recognizeCaller, checkAvailability, bookAppointment, rescheduleAppointment, cancelAppointment, getUpcomingAppointments, getServices, getStaffMembers, getStaffSchedule, getBusinessHours, getEstimate, getCustomerInfo, updateCustomerInfo, leaveMessage, transferCall, scheduleCallback, getDirections, checkWaitTime, confirmAppointment, getServiceDetails`;

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
      description: 'Identify returning caller. Call once at start. Returns greeting, summary, and customer context.',
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
      description: 'Update caller\'s name or email when they correct it. Pass customerId from recognizeCaller.',
      parameters: {
        type: 'object',
        properties: {
          customerId: { type: 'number', description: 'Customer ID from recognizeCaller' },
          firstName: { type: 'string', description: 'Correct first name' },
          lastName: { type: 'string', description: 'Correct last name' },
          email: { type: 'string', description: 'Email address' }
        }
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
  // First message: greeting with recording disclosure + immediate engagement question.
  // IMPORTANT: Must end with a question so the caller responds while recognizeCaller runs in background.
  // Never say "one moment" or "hold on" — Vapi will hang up during silence.
  const configGreeting = buildFirstMessage(business.name, receptionistConfig?.greeting);
  const configRecordingEnabled = receptionistConfig?.callRecordingEnabled ?? true;
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

  // Build functions list — conditionally exclude leaveMessage if voicemail is disabled
  const baseFunctions = getAssistantFunctions();
  const functions = configVoicemailEnabled
    ? baseFunctions
    : baseFunctions.filter(f => f.name !== 'leaveMessage');

  const assistantConfig = {
    name: `${business.name} Receptionist`,
    model: {
      provider: 'openai',
      model: 'gpt-5-mini', // Smarter than gpt-4o-mini, still cost-effective for voice
      temperature: 0.6, // Slightly lower for more consistent, accurate responses
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
      language: 'multi', // Auto-detect language (supports English, Spanish, and more)
    },
    voice: {
      provider: '11labs',
      voiceId: configVoiceId,
      stability: 0.4, // Slightly lower for faster voice generation
      similarityBoost: 0.75,
      style: 0.2, // Less style processing = faster
      useSpeakerBoost: true,
      optimizeStreamingLatency: 4, // Maximum latency optimization (ElevenLabs turbo)
    },
    firstMessage: configGreeting,
    serverUrl: `${BASE_URL}/api/vapi/webhook`,
    recordingEnabled: configRecordingEnabled,
    hipaaEnabled: false,
    silenceTimeoutSeconds: 30, // End call after 15s silence to conserve minutes
    responseDelaySeconds: 0.1, // Near-instant response — natural enough for voice
    llmRequestDelaySeconds: 0, // No LLM delay — respond as fast as possible
    numWordsToInterruptAssistant: 1, // Allow instant interruptions — more natural conversation
    maxDurationSeconds: configMaxCallMinutes * 60,
    backgroundSound: 'off',
    // When the AI says any of these phrases, Vapi automatically hangs up (platform-level)
    // Include versions with period, exclamation, and bare — TTS output punctuation varies
    // Also include Spanish equivalents for multilingual support
    // Only use FULL farewell phrases — bare "Goodbye" is too trigger-happy and catches mid-sentence
    endCallPhrases: [
      "Have a great day",
      "Have a great day!",
      "Have a great day.",
      "Have a wonderful day",
      "Have a good one",
      "Take care goodbye",
      "Take care, goodbye",
      "Thanks for calling goodbye",
      "Thanks for calling, goodbye",
      // Spanish equivalents
      "Que tenga un buen día",
      "Que tenga un excelente día",
      "Gracias por llamar, adiós",
      "Cuídese, adiós",
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
  // First message: greeting with recording disclosure + immediate engagement question.
  // IMPORTANT: Must end with a question so the caller responds while recognizeCaller runs in background.
  // Never say "one moment" or "hold on" — Vapi will hang up during silence.
  const configGreeting = buildFirstMessage(business.name, receptionistConfig?.greeting);
  const configRecordingEnabled = receptionistConfig?.callRecordingEnabled ?? true;
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
          language: 'multi', // Auto-detect language (supports English, Spanish, and more)
        },
        model: {
          provider: 'openai',
          model: 'gpt-5-mini', // Smarter than gpt-4o-mini, still cost-effective for voice
          systemPrompt: systemPrompt,
          functions: functions,
          // Native VAPI transferCall tool — must be in model.tools for Vapi to recognize it
          tools: nativeTools,
        },
        voice: {
          provider: '11labs',
          voiceId: configVoiceId,
          stability: 0.5,
          similarityBoost: 0.8,
          style: 0.3,
          useSpeakerBoost: true
        },
        firstMessage: configGreeting,
        recordingEnabled: configRecordingEnabled,
        silenceTimeoutSeconds: 30,
        maxDurationSeconds: configMaxCallMinutes * 60,
        // Only use FULL farewell phrases — bare "Goodbye" is too trigger-happy
        endCallPhrases: [
          "Have a great day",
          "Have a great day!",
          "Have a great day.",
          "Have a wonderful day",
          "Have a good one",
          "Take care goodbye",
          "Take care, goodbye",
          "Thanks for calling goodbye",
          "Thanks for calling, goodbye",
          // Spanish equivalents
          "Que tenga un buen día",
          "Que tenga un excelente día",
          "Gracias por llamar, adiós",
          "Cuídese, adiós",
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
