/**
 * Vapi.ai Integration Service
 *
 * Handles AI-powered voice receptionist using Vapi.ai
 * Creates intelligent, human-like phone conversations for businesses
 */

import { Business, Service, ReceptionistConfig } from '@shared/schema';
import { getCachedMenu as getCloverCachedMenu, formatMenuForPrompt, type CachedMenu } from './cloverService';
import { getCachedMenu as getSquareCachedMenu } from './squareService';

const VAPI_API_KEY = process.env.VAPI_API_KEY;
const VAPI_BASE_URL = 'https://api.vapi.ai';
const BASE_URL = process.env.BASE_URL || '';

// Warn if BASE_URL is not set - Vapi needs the full URL for webhooks
if (!BASE_URL) {
  console.warn('WARNING: BASE_URL environment variable is not set!');
  console.warn('Vapi webhooks will not work without a publicly accessible URL.');
  console.warn('Set BASE_URL to your public domain (e.g., https://your-app.railway.app)');
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
 * Generate a smart system prompt based on business type
 */
interface PromptOptions {
  assistantName?: string;
  customInstructions?: string;
  afterHoursMessage?: string;
  voicemailEnabled?: boolean;
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

TODAY'S DATE: ${currentDate}
CURRENT YEAR: ${currentYear}

PERSONALITY:
- Speak at a relaxed, conversational pace - never rush
- Be warm and personable, like talking to a friend
- Use casual acknowledgments: "Sure thing", "Absolutely", "Got it", "Of course"
- Show genuine empathy when customers describe problems
- Keep responses concise - 1-2 sentences at a time

CRITICAL RULES:
- ALWAYS wait for the customer to respond after asking a question
- NEVER hang up until the customer says goodbye
- Answer their question FIRST, then offer next steps
- If Status above says "OPEN now", you ARE open — take orders and help customers normally. NEVER tell a customer you're closed when the status says OPEN.

ENDING CALLS — IMPORTANT FOR SAVING MINUTES:
- When the customer says goodbye or seems done → say "Have a great day!" (this exact phrase ends the call automatically)
- After booking an appointment and the customer confirms → say "Have a great day!" to end the call
- After placing an order and confirming → say "Thanks for calling, goodbye!" to end the call
- ALWAYS end your farewell with one of these EXACT phrases: "Have a great day!", "Have a wonderful day!", "Take care, goodbye!", "Thanks for calling, goodbye!", or "Goodbye!"
- These phrases MUST be the LAST thing you say — do NOT add anything after them
- Keep responses concise — 1-2 sentences max. Don't linger after the customer is done.

BUSINESS INFORMATION:
- Business Name: ${business.name}
- Phone: ${business.phone || 'Not provided'}
- Address: ${business.address || 'Not provided'}
- Hours: ${businessHours}
- Status: ${isOpen ? 'OPEN now' : 'CLOSED today'}${todayHours ? ` (${todayHours})` : ''}

SERVICES & PRICING:
${serviceList}
(Always call getServices for the most current pricing)

HANDLING QUESTIONS:
- "How much?" / "What's the price?" → Give the price directly from services list
- "How long does it take?" → Give the duration from services list
- "What services do you offer?" → List 2-3 main services, offer to explain more
- "Are you available [day]?" → Call checkAvailability, offer 2-3 time options

DATE HANDLING - CRITICAL:
- TODAY IS: ${currentDate}
- CURRENT YEAR: ${currentYear}
- NEVER use dates from 2023, 2024, or 2025. We are in ${currentYear}.
- When customer says "tomorrow", "Tuesday", "next week" - use dates from the checkAvailability function response
- The checkAvailability function returns the CORRECT date - use that date exactly as returned
- ALWAYS confirm with the full date from the function response: "Monday, February 2nd" not just "Monday"
- If the function says "Monday, February 2" then say "Monday, February 2nd" - DO NOT make up different dates

SCHEDULING FLOW:
1. Understand what they need — identify the SERVICE they want
2. If they ask about price, answer FIRST
3. If this is a NEW caller (recognizeCaller returned recognized: false), ask: "And may I get your name for the appointment?"
   - ALWAYS get the caller's name BEFORE checking availability or booking
   - You need their name to book — do NOT skip this step
4. Check availability with checkAvailability function — pass the serviceId if you know it
5. Confirm ALL details: "So that's [service] on [Day, Month Date] at [time] for $[price]. Does that work?"
6. WAIT for "yes" before calling bookAppointment — pass customerName AND serviceName (BOTH REQUIRED)
7. Confirm booking and ask if there's anything else

BOOKING DATA - MANDATORY:
- customerName: REQUIRED — ask for it if you don't have it (see NAME COLLECTION below)
- serviceName: REQUIRED — always pass the service name when booking. If the customer didn't specify a service, ask "What service are you looking for?" or match their request to a service from the list above. If there is only one service available, use that one.
- notes: ALWAYS include notes summarizing what the customer said they need or any special requests. For example: "Customer said brakes are squeaking", "Wants deep tissue massage on lower back", "Requested same stylist as last time". This helps the business prepare for the appointment.
- ALWAYS pass serviceName (and serviceId if you have it) to bookAppointment — without it, the appointment won't be linked to a service and pricing/duration will be wrong

NAME COLLECTION - MANDATORY:
- For EVERY appointment booking, you MUST have the caller's name
- If recognizeCaller returned recognized: true, you already have their name — use it
- If recognizeCaller returned recognized: false or isNewCaller: true, you MUST ask "May I get your name?" BEFORE booking
- NEVER call bookAppointment with a blank or missing customerName
- This applies to ALL business types — appointments always need a name
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
  * Use getStaffMembers to get the list of stylists/barbers
  * If they name someone, use that person's staffId when checking availability and booking
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
  * Use getStaffMembers to get the list of barbers
  * If they name someone, use that person's staffId when checking availability and booking
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
LANDSCAPING GUIDANCE:
- Seasonal awareness:
  * Spring: Cleanup, mulching, planting
  * Summer: Mowing, irrigation, pest control
  * Fall: Leaf removal, winterizing
  * Winter: Snow removal, planning
- Service types:
  * Regular maintenance (mowing, trimming)
  * One-time projects (installations, renovations)
  * Seasonal services
- Important questions:
  * Property size (rough estimate)
  * Current state of yard
  * Any HOA requirements?
  * Budget range for projects
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
- ALWAYS call getStaffMembers at the start to see if this business has team members
- If staff members exist, ask the customer if they have a preference for who they'd like to see
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

  // Build function documentation based on business type
  let functionDocs = `
APPOINTMENT MANAGEMENT:
- checkAvailability: Check available appointment slots for a specific date
- bookAppointment: Book a new appointment after confirming details
- rescheduleAppointment: Change an existing appointment to a new date/time
- cancelAppointment: Cancel an existing appointment
- getUpcomingAppointments: Look up the caller's upcoming appointments`;

  // Add restaurant-specific functions for restaurants with a connected POS
  if (businessType.includes('restaurant') && menuData) {
    functionDocs += `

RESTAURANT ORDERING (POS):
- getMenu: Get the full restaurant menu with categories, items, prices, and modifiers
- getMenuCategory: Get items in a specific category (e.g., appetizers, entrees, drinks)
- createOrder: Place an order in the restaurant's POS system. Use after confirming the complete order with the caller.`;
  }

  functionDocs += `

CUSTOMER & BUSINESS INFO:
- getCustomerInfo: Look up existing customer by phone number
- getServices: Get the list of services with pricing
- getBusinessHours: Check business hours and if currently open
- getEstimate: Get price estimates for specific services
- updateCustomerInfo: Update a caller's name or email when they correct it mid-call

COMMUNICATION:
- transferCall: Transfer the call to a human staff member (VAPI will perform a real phone transfer — use ONLY as a last resort after trying to help)${transferNumbers && transferNumbers.length > 0 ? `\n  When using transferCall, pass the destination parameter with the value "${transferNumbers[0]}"` : ''}
- leaveMessage: Record a message for the business owner (ONLY use if caller explicitly asks to leave a message — always try to help them directly first)`;

  return basePrompt + industryPrompt + menuSection + `

FUNCTION CALLING:
You have access to these functions to help customers:
` + functionDocs + `

SMART BEHAVIORS:

When caller says "I need to reschedule" or "change my appointment":
1. Call getUpcomingAppointments to find their appointment
2. Ask what date/time works better
3. Check availability for new time
4. Call rescheduleAppointment

When caller says "cancel my appointment":
1. Call getUpcomingAppointments to find their appointment
2. Confirm which appointment they want to cancel
3. Ask if they'd like to reschedule instead
4. If they confirm cancel, call cancelAppointment

When caller asks "what time do you close?" or "are you open?":
- Call getBusinessHours for accurate information

When caller asks "how much for..." or "what's the price?":
- Call getEstimate with service description

When caller says "I need to speak with someone" or "can I talk to a person?":
- DO NOT immediately transfer. First say: "I can help with most things — booking appointments, checking availability, pricing, placing orders, and more. What can I help you with today?"
- Try your best to handle their request with the tools available to you
- If the caller INSISTS on speaking to a human after you've offered to help, or asks a SECOND time, use the transferCall tool immediately — no more pushback
- For complaints, billing disputes, or "I already spoke to someone about this" — use transferCall right away without trying to help first

When caller reaches you after hours:
${options?.afterHoursMessage ? `- Tell the caller: "${options.afterHoursMessage}"` : '- Let them know the office is currently closed but that YOU can still help them right now'}
- You are FULLY capable of helping after hours. Do NOT act like a voicemail machine. You can:
  • Book appointments for the next available time
  • Answer questions about services and pricing
  • Place orders (for restaurants)
  • Provide directions and business info
  • Get price estimates
- PROACTIVELY offer help: "Even though we're closed right now, I can still book you an appointment, answer questions about our services, or help with pricing. What can I do for you?"
- Use checkAvailability to find the next available slot during business hours
- If the caller wants to schedule, proceed with the normal booking flow using bookAppointment
- KEEP the conversation going — answer their questions, schedule their appointment, give them pricing info
- Do NOT offer to "take a message" or suggest they "call back during business hours" unless the caller specifically says "I just want to leave a message for the owner"
${options?.voicemailEnabled !== false ? '- ONLY if the caller explicitly asks to leave a message for the owner (not you), use leaveMessage' : '- If the caller asks to leave a message, let them know you can handle most things and ask what they need help with'}

ADDITIONAL FUNCTIONS:
- scheduleCallback: Schedule a callback for later (preferred time/date)
- recognizeCaller: Called at start to identify returning customers
- getDirections: Provide business address and offer to text directions
- checkWaitTime: Check current wait time and next available slot
- confirmAppointment: Confirm an upcoming appointment
- getServiceDetails: Get detailed info about a specific service

CALL START BEHAVIOR:
1. IMMEDIATELY call recognizeCaller to check if this is a returning customer
2. IMMEDIATELY call getStaffMembers to know who works here (for scheduling)
3. If recognized, greet them by name using the name returned by recognizeCaller
4. If they have an appointment TODAY, ask if they're calling about that
5. Then proceed to help with their request
6. If booking and staff members exist, ALWAYS ask if they have a preferred person to see

CRITICAL - USING RECOGNIZED CUSTOMER DATA:
- When recognizeCaller returns recognized: true, ALWAYS use the customerName and firstName from the result
- NEVER ask a recognized customer "What is your name?" — you already know it
- When booking for a recognized customer, ALWAYS pass customerId, customerName, and customerPhone from recognizeCaller to bookAppointment
- For NEW callers (recognized: false), you MUST ask "May I get your name?" EARLY in the conversation — before checking availability
- NEVER call bookAppointment without a real customerName — if you don't have a name, ASK for it first
- customerName is REQUIRED for bookAppointment — the booking will FAIL if you don't provide it
- If you need their email and recognizeCaller didn't return one, then ask
- Address the caller by their firstName throughout the entire conversation
- NEVER make up or guess a caller's name — only use what recognizeCaller returns or what the caller explicitly tells you

NAME CORRECTIONS:
- If a recognized caller says "My name is actually [X]" or "Call me [X]" or corrects their name in any way, call updateCustomerInfo to update their record immediately
- Pass customerId from recognizeCaller so the correct customer is updated
- After updating, use their corrected name for the rest of the conversation
- This also works for email: if they provide an email, call updateCustomerInfo with the email field

CONVERSATION FLOW:
1. Start with recognizeCaller → personalized greeting using their actual name
2. Listen to their request fully before responding
3. Use appropriate function based on their needs
4. Confirm important details before taking action
5. After completing an action, ask if there's anything else
6. End with a warm goodbye using their name

NATURAL DATE/TIME UNDERSTANDING:
- You can say dates naturally: "tomorrow", "next Tuesday", "in 3 days"
- You can say times naturally: "2pm", "around noon", "morning", "end of day"
- The system will parse these correctly

PROACTIVE SUGGESTIONS:
- If they call about pricing, offer to schedule after giving the price
- If closed today, suggest tomorrow's first available — don't just say "call back"
- If they seem unsure, offer specific options: "I can book you an appointment, give you a price estimate, or answer any questions about our services"
- If wait is long, offer to schedule for a specific time
- ALWAYS try to convert the call into a booked appointment or completed action — your job is to help, not take messages

HANDLING DIRECTIONS:
- When asked "where are you located?" call getDirections
- Offer to text them a map link to their phone

CALLBACK SCHEDULING:
- If customer prefers callback, use scheduleCallback
- Ask for preferred time/date
- Confirm the callback is scheduled

APPOINTMENT CONFIRMATIONS:
- If customer is confirming an appointment, use confirmAppointment
- Ask if they're confirming or need to reschedule

IMPORTANT REMINDERS:
- ALWAYS start calls with recognizeCaller for personalization
- ALWAYS use getUpcomingAppointments before trying to reschedule/cancel
- NEVER make up prices - always call getServices or getEstimate
- If customer seems frustrated or asks for manager, use transferCall immediately
- For emergencies (water leak, car breakdown, etc.), prioritize and offer earliest available
- Understand natural language dates: "next week", "tomorrow", "this Friday"
${knowledgeSection ? `
ADDITIONAL KNOWLEDGE BASE (from website & owner-approved FAQs):
Note: If there is a conflict between the CRM data above (services, hours, pricing) and this knowledge base, ALWAYS use the CRM data as the source of truth.

${knowledgeSection}
` : ''}${options?.customInstructions ? `
CUSTOM BUSINESS INSTRUCTIONS (follow these closely — the business owner wrote them):
${options.customInstructions}
` : ''}
Remember: You're not just booking appointments - you're providing excellent customer service that reflects well on ${business.name}. Make every caller feel valued and heard. Personalization is key - use their name when you know it!`;
}

/**
 * Get the standard functions array for Vapi assistants
 */
function getAssistantFunctions() {
  return [
    {
      name: 'checkAvailability',
      description: 'Check available appointment slots. Supports natural language dates. Returns the CORRECT date - use that date exactly as returned.',
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'Date to check - YYYY-MM-DD or natural language like "tomorrow", "Monday"' },
          serviceId: { type: 'number', description: 'Optional service ID' },
          staffId: { type: 'number', description: 'Optional staff member ID' },
          staffName: { type: 'string', description: 'Optional staff member name' }
        },
        required: ['date']
      }
    },
    {
      name: 'bookAppointment',
      description: 'Book an appointment after customer confirms. Use the EXACT date returned from checkAvailability. ALWAYS pass customerId if recognizeCaller returned one. ALWAYS pass serviceName so the appointment is linked to the correct service.',
      parameters: {
        type: 'object',
        properties: {
          customerId: { type: 'number', description: 'Customer ID from recognizeCaller result — ALWAYS pass this if available' },
          customerPhone: { type: 'string', description: 'Customer phone number' },
          customerName: { type: 'string', description: 'Customer full name — ALWAYS pass this' },
          date: { type: 'string', description: 'Date - use YYYY-MM-DD format' },
          time: { type: 'string', description: 'Time - like "2pm" or "14:00"' },
          serviceId: { type: 'number', description: 'Service ID if known' },
          serviceName: { type: 'string', description: 'Service name — ALWAYS pass this so the appointment has the correct service' },
          staffId: { type: 'number' },
          staffName: { type: 'string' },
          notes: { type: 'string', description: 'Any special requests, details about what the customer needs, or notes from the conversation. Include what the customer described (e.g. "needs oil change and tire rotation", "back pain for 2 weeks", "wants highlights and trim")' }
        },
        required: ['customerPhone', 'customerName', 'date', 'time']
      }
    },
    {
      name: 'getServices',
      description: 'Get list of services with prices. Call when customer asks about services or pricing.',
      parameters: { type: 'object', properties: {} }
    },
    {
      name: 'getStaffMembers',
      description: 'Get list of team members. Call when customer asks who works here.',
      parameters: { type: 'object', properties: {} }
    },
    {
      name: 'getStaffSchedule',
      description: 'Get a staff member\'s working hours. Call when customer asks "when does [name] work?" or "what are [name]\'s hours?"',
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
      description: 'Get business hours and if currently open',
      parameters: { type: 'object', properties: {} }
    },
    {
      name: 'recognizeCaller',
      description: 'Check if caller is a returning customer',
      parameters: { type: 'object', properties: {} }
    },
    {
      name: 'getUpcomingAppointments',
      description: 'Get caller\'s upcoming appointments',
      parameters: { type: 'object', properties: {} }
    },
    {
      name: 'rescheduleAppointment',
      description: 'Reschedule an existing appointment',
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
      description: 'Cancel an existing appointment',
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
      description: 'Leave a message for the business owner. ONLY use this if the caller explicitly asks to leave a message — always try to help them directly first by booking, answering questions, or providing info.',
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
      description: 'Update a customer\'s name or email. Use when a caller corrects their name (e.g., "My name is actually Tony, not Test") or provides their email. Do NOT use this just because you already know their name — only when they explicitly correct or provide new info.',
      parameters: {
        type: 'object',
        properties: {
          customerId: { type: 'number', description: 'Customer ID from recognizeCaller — pass this if available' },
          firstName: { type: 'string', description: 'Customer\'s correct first name' },
          lastName: { type: 'string', description: 'Customer\'s correct last name' },
          email: { type: 'string', description: 'Customer\'s email address' }
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
    // Normalize to E.164 format
    const normalizedNumbers = numbers.map(num => {
      const digits = num.replace(/\D/g, '');
      if (digits.startsWith('1') && digits.length === 11) return `+${digits}`;
      if (digits.length === 10) return `+1${digits}`;
      return num.startsWith('+') ? num : `+${digits}`;
    });

    tools.push({
      type: 'transferCall',
      destinations: normalizedNumbers.map(num => ({
        type: 'number',
        number: num,
        message: 'I am transferring your call now. Please hold for just a moment.',
      })),
    });
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
      }
    } catch (e) {
      console.warn(`Could not load POS menu for business ${business.id}:`, e);
    }
  }

  // Extract config values with sensible defaults
  const configVoiceId = receptionistConfig?.voiceId || 'paula';
  const configAssistantName = receptionistConfig?.assistantName || 'Alex';
  const configGreeting = receptionistConfig?.greeting || `Thank you for calling ${business.name}, this is ${configAssistantName}. How can I help you today?`;
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

  const systemPrompt = generateSystemPrompt(business, services, businessHours, menuData, {
    assistantName: configAssistantName,
    customInstructions: configCustomInstructions,
    afterHoursMessage: configAfterHoursMessage,
    voicemailEnabled: configVoicemailEnabled,
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
      model: 'gpt-4o-mini', // Cost-effective but smart
      temperature: 0.7, // Natural variability
      systemPrompt: systemPrompt,
      functions: [
        ...functions,
        // Restaurant ordering functions (Clover POS) — conditionally added
        ...(isRestaurant && menuData ? getRestaurantFunctions() : [])
      ],
      // Native VAPI transferCall tool — must be in model.tools for Vapi to recognize it
      tools: nativeTools,
    },
    voice: {
      provider: '11labs',
      voiceId: configVoiceId,
      stability: 0.5,
      similarityBoost: 0.8,
      style: 0.3, // Slightly more expressive
      useSpeakerBoost: true
    },
    firstMessage: configGreeting,
    serverUrl: `${BASE_URL}/api/vapi/webhook`,
    recordingEnabled: configRecordingEnabled,
    hipaaEnabled: false,
    silenceTimeoutSeconds: 15, // End call after 15s silence to conserve minutes
    responseDelaySeconds: 0.5, // Slight delay for natural feel
    llmRequestDelaySeconds: 0.1,
    numWordsToInterruptAssistant: 2, // Allow interruptions
    maxDurationSeconds: configMaxCallMinutes * 60,
    backgroundSound: 'off',
    // When the AI says any of these phrases, Vapi automatically hangs up (platform-level, no AI decision needed)
    endCallPhrases: [
      "Have a great day!",
      "Have a wonderful day!",
      "Have a good one!",
      "Take care, goodbye!",
      "Thanks for calling, goodbye!",
      "Goodbye!",
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
      }
    } catch (e) {
      console.warn(`Could not load POS menu for business ${business.id} during assistant update:`, e);
    }
  }

  // Extract config values with sensible defaults
  const configVoiceId = receptionistConfig?.voiceId || 'paula';
  const configAssistantName = receptionistConfig?.assistantName || 'Alex';
  const configGreeting = receptionistConfig?.greeting || `Thank you for calling ${business.name}, this is ${configAssistantName}. How can I help you today?`;
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

  const systemPrompt = generateSystemPrompt(business, services, businessHours, menuData, {
    assistantName: configAssistantName,
    customInstructions: configCustomInstructions,
    afterHoursMessage: configAfterHoursMessage,
    voicemailEnabled: configVoicemailEnabled,
  }, knowledgeSection, normalizedTransferNumbers);

  // Get functions — conditionally exclude leaveMessage if voicemail is disabled
  const baseFunctions = getAssistantFunctions();
  const filteredFunctions = configVoicemailEnabled
    ? baseFunctions
    : baseFunctions.filter(f => f.name !== 'leaveMessage');
  const functions = [
    ...filteredFunctions,
    ...(isRestaurant && menuData ? getRestaurantFunctions() : [])
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
        model: {
          provider: 'openai',
          model: 'gpt-4o-mini',
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
        silenceTimeoutSeconds: 15,
        maxDurationSeconds: configMaxCallMinutes * 60,
        endCallPhrases: [
          "Have a great day!",
          "Have a wonderful day!",
          "Have a good one!",
          "Take care, goodbye!",
          "Thanks for calling, goodbye!",
          "Goodbye!",
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

export default {
  createAssistantForBusiness,
  updateAssistant,
  deleteAssistant,
  importPhoneNumber,
  getAssistant,
  listAssistants
};
