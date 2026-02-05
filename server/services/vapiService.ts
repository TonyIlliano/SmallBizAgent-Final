/**
 * Vapi.ai Integration Service
 *
 * Handles AI-powered voice receptionist using Vapi.ai
 * Creates intelligent, human-like phone conversations for businesses
 */

import { Business, Service } from '@shared/schema';

const VAPI_API_KEY = process.env.VAPI_API_KEY;
const VAPI_BASE_URL = 'https://api.vapi.ai';
const BASE_URL = process.env.BASE_URL || '';

// Warn if BASE_URL is not set - Vapi needs the full URL for webhooks
if (!BASE_URL) {
  console.warn('WARNING: BASE_URL environment variable is not set!');
  console.warn('Vapi webhooks will not work without a publicly accessible URL.');
  console.warn('Set BASE_URL to your public domain (e.g., https://your-app.railway.app)');
}

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
function isBusinessOpenNow(hours: any[]): { isOpen: boolean; todayHours: string } {
  const now = new Date();
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const today = dayNames[now.getDay()];

  const todayHours = hours?.find(h => h.day === today);
  if (!todayHours || todayHours.isClosed || (!todayHours.open && !todayHours.close)) {
    return { isOpen: false, todayHours: 'CLOSED today' };
  }

  return { isOpen: true, todayHours: `Open today: ${todayHours.open} - ${todayHours.close}` };
}

/**
 * Generate a smart system prompt based on business type
 */
function generateSystemPrompt(business: Business, services: Service[], businessHoursFromDB?: any[]): string {
  const businessType = business.industry?.toLowerCase() || 'general';
  const serviceList = services.length > 0
    ? services.map(s => `- ${s.name}: $${s.price}, ${s.duration || 60} minutes${s.description ? ` - ${s.description}` : ''}`).join('\n')
    : '- General services (call getServices for current list)';

  // Use hours from database if provided, otherwise fall back to business field
  const businessHours = businessHoursFromDB && businessHoursFromDB.length > 0
    ? formatBusinessHoursFromDB(businessHoursFromDB)
    : (business.businessHours || 'Monday-Friday 9am-5pm');

  // Check if open today
  const { isOpen, todayHours } = businessHoursFromDB
    ? isBusinessOpenNow(businessHoursFromDB)
    : { isOpen: true, todayHours: '' };

  // Get current date for context
  const now = new Date();
  const currentDate = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const currentYear = now.getFullYear();

  // Base personality and rules
  const basePrompt = `You are Alex, a friendly and professional receptionist for ${business.name}.

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
1. Understand what they need
2. If they ask about price, answer FIRST
3. Check availability with checkAvailability function
4. Confirm ALL details: "So that's [service] on [Day, Month Date] at [time] for $[price]. Does that work?"
5. WAIT for "yes" before calling bookAppointment
6. Confirm booking and ask if there's anything else
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
RESTAURANT GUIDANCE:
- Reservation handling:
  * Party size
  * Date and preferred time
  * Special occasions (birthday, anniversary)
  * Dietary restrictions or allergies
  * Indoor/outdoor/bar preference
- Common questions:
  * Menu and prices → Direct to website or read specials
  * Hours and location
  * Parking availability
  * Private events/catering
- Wait list management:
  * Current wait time
  * Call-ahead seating
  * Callback when table is ready
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

  return basePrompt + industryPrompt + `

FUNCTION CALLING:
You have access to these functions to help customers:

APPOINTMENT MANAGEMENT:
- checkAvailability: Check available appointment slots for a specific date
- bookAppointment: Book a new appointment after confirming details
- rescheduleAppointment: Change an existing appointment to a new date/time
- cancelAppointment: Cancel an existing appointment
- getUpcomingAppointments: Look up the caller's upcoming appointments

CUSTOMER & BUSINESS INFO:
- getCustomerInfo: Look up existing customer by phone number
- getServices: Get the list of services with pricing
- getBusinessHours: Check business hours and if currently open
- getEstimate: Get price estimates for specific services

COMMUNICATION:
- transferToHuman: Connect caller to a staff member (use when requested or for complex issues)
- leaveMessage: Record a message for callback

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
- Call transferToHuman (don't argue, just transfer)

When caller reaches voicemail or after hours:
- Offer to take a message using leaveMessage
- Always ask if they want a callback

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
3. If recognized, greet them by name and mention any upcoming appointments
4. If they have an appointment TODAY, ask if they're calling about that
5. Then proceed to help with their request
6. If booking and staff members exist, ALWAYS ask if they have a preferred person to see

CONVERSATION FLOW:
1. Start with recognizeCaller → personalized greeting
2. Listen to their request fully before responding
3. Use appropriate function based on their needs
4. Confirm important details before taking action
5. After completing an action, ask if there's anything else
6. End with a warm goodbye

NATURAL DATE/TIME UNDERSTANDING:
- You can say dates naturally: "tomorrow", "next Tuesday", "in 3 days"
- You can say times naturally: "2pm", "around noon", "morning", "end of day"
- The system will parse these correctly

PROACTIVE SUGGESTIONS:
- If they call about pricing, offer to schedule after giving the price
- If closed today, suggest tomorrow's first available
- If they seem unsure, offer to have someone call them back
- If wait is long, offer to schedule or callback

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
- If customer seems frustrated or asks for manager, use transferToHuman immediately
- For emergencies (water leak, car breakdown, etc.), prioritize and offer earliest available
- Understand natural language dates: "next week", "tomorrow", "this Friday"

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
      description: 'Book an appointment after customer confirms. Use the EXACT date returned from checkAvailability.',
      parameters: {
        type: 'object',
        properties: {
          customerPhone: { type: 'string', description: 'Customer phone number' },
          customerName: { type: 'string', description: 'Customer name' },
          date: { type: 'string', description: 'Date - use YYYY-MM-DD format' },
          time: { type: 'string', description: 'Time - like "2pm" or "14:00"' },
          serviceId: { type: 'number' },
          serviceName: { type: 'string' },
          staffId: { type: 'number' },
          staffName: { type: 'string' },
          notes: { type: 'string' }
        },
        required: ['customerPhone', 'date', 'time']
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
    {
      name: 'transferToHuman',
      description: 'Transfer call to a human staff member',
      parameters: {
        type: 'object',
        properties: {
          reason: { type: 'string' }
        }
      }
    },
    {
      name: 'leaveMessage',
      description: 'Leave a message for callback',
      parameters: {
        type: 'object',
        properties: {
          message: { type: 'string' },
          callbackRequested: { type: 'boolean' }
        },
        required: ['message']
      }
    }
  ];
}

/**
 * Create or update a Vapi assistant for a business
 */
export async function createAssistantForBusiness(
  business: Business,
  services: Service[],
  businessHours?: any[]
): Promise<{ assistantId: string; error?: string }> {
  if (!VAPI_API_KEY) {
    return { assistantId: '', error: 'Vapi API key not configured' };
  }

  const systemPrompt = generateSystemPrompt(business, services, businessHours);

  const assistantConfig = {
    name: `${business.name} Receptionist`,
    model: {
      provider: 'openai',
      model: 'gpt-4o-mini', // Cost-effective but smart
      temperature: 0.7, // Natural variability
      systemPrompt: systemPrompt,
      functions: [
        {
          name: 'checkAvailability',
          description: 'Check available appointment slots. Supports natural language dates like "tomorrow", "next Tuesday", "next week", "this Friday". For "next week" or general availability requests, returns multiple available days. For salons/barbershops, can filter by specific staff member.',
          parameters: {
            type: 'object',
            properties: {
              date: {
                type: 'string',
                description: 'The date to check - can be YYYY-MM-DD format OR natural language like "tomorrow", "next Tuesday", "next week", "this Friday", "in 3 days". Use "next week" to get availability across multiple days.'
              },
              serviceId: {
                type: 'number',
                description: 'Optional service ID to check specific service availability and use correct duration'
              },
              staffId: {
                type: 'number',
                description: 'Optional staff member ID (barber, stylist, technician) to check availability for a specific person. Get staff IDs from getStaffMembers function.'
              },
              staffName: {
                type: 'string',
                description: 'Optional staff member name (e.g., "Mike", "Sarah") - system will look up their ID'
              }
            },
            required: ['date']
          }
        },
        {
          name: 'bookAppointment',
          description: 'Book an appointment for a customer. For salons/barbershops, can assign to a specific staff member.',
          parameters: {
            type: 'object',
            properties: {
              customerId: {
                type: 'number',
                description: 'The customer ID'
              },
              customerName: {
                type: 'string',
                description: 'Customer name if new customer'
              },
              customerPhone: {
                type: 'string',
                description: 'Customer phone number'
              },
              customerEmail: {
                type: 'string',
                description: 'Customer email (optional)'
              },
              date: {
                type: 'string',
                description: 'Appointment date - can be YYYY-MM-DD or natural language like "tomorrow", "next Tuesday", "Monday"'
              },
              time: {
                type: 'string',
                description: 'Appointment time - can be HH:MM (24hr), "2pm", "2:30pm", "morning", "afternoon"'
              },
              serviceId: {
                type: 'number',
                description: 'Service ID if known'
              },
              serviceName: {
                type: 'string',
                description: 'Service name/description'
              },
              staffId: {
                type: 'number',
                description: 'Staff member ID (barber, stylist, etc.) to assign this appointment to. Get staff IDs from getStaffMembers function.'
              },
              staffName: {
                type: 'string',
                description: 'Staff member name (e.g., "Mike") - system will look up their ID'
              },
              notes: {
                type: 'string',
                description: 'Detailed notes about the appointment, customer issue, or special requests'
              },
              estimatedDuration: {
                type: 'number',
                description: 'Estimated duration in minutes'
              }
            },
            required: ['customerPhone', 'date', 'time']
          }
        },
        {
          name: 'getCustomerInfo',
          description: 'Look up existing customer information by phone number',
          parameters: {
            type: 'object',
            properties: {
              phoneNumber: {
                type: 'string',
                description: 'Customer phone number'
              }
            },
            required: ['phoneNumber']
          }
        },
        {
          name: 'getServices',
          description: 'Get the list of services offered by the business with prices and durations. ALWAYS call this when a customer asks about services, pricing, or what you offer. Returns service names, prices, and descriptions.',
          parameters: {
            type: 'object',
            properties: {}
          }
        },
        {
          name: 'getStaffMembers',
          description: 'Get the list of staff members (barbers, stylists, technicians, etc.) who work at this business. Use this when a customer asks for a specific person by name, or to offer them a choice of who they want to see. Returns names, specialties, and IDs needed for booking.',
          parameters: {
            type: 'object',
            properties: {}
          }
        },
        {
          name: 'getStaffSchedule',
          description: 'Get a specific staff member\'s working hours and schedule. Use this when a customer asks "when does [name] work?", "what are [name]\'s hours?", "what days does [name] work?". Returns their working days and hours.',
          parameters: {
            type: 'object',
            properties: {
              staffName: {
                type: 'string',
                description: 'Name of the staff member (e.g., "Josh", "Sarah")'
              },
              staffId: {
                type: 'number',
                description: 'Staff member ID if known'
              }
            }
          }
        },
        {
          name: 'rescheduleAppointment',
          description: 'Reschedule an existing appointment to a new date/time',
          parameters: {
            type: 'object',
            properties: {
              appointmentId: {
                type: 'number',
                description: 'The appointment ID if known'
              },
              newDate: {
                type: 'string',
                description: 'The new date - can be YYYY-MM-DD or natural language like "tomorrow", "next Wednesday"'
              },
              newTime: {
                type: 'string',
                description: 'The new time - can be HH:MM (24hr), "3pm", "morning", "afternoon"'
              },
              reason: {
                type: 'string',
                description: 'Reason for rescheduling'
              }
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
              appointmentId: {
                type: 'number',
                description: 'The appointment ID if known'
              },
              reason: {
                type: 'string',
                description: 'Reason for cancellation'
              }
            }
          }
        },
        {
          name: 'getBusinessHours',
          description: 'Get the business hours and check if currently open',
          parameters: {
            type: 'object',
            properties: {}
          }
        },
        {
          name: 'getEstimate',
          description: 'Get a price estimate for requested services',
          parameters: {
            type: 'object',
            properties: {
              serviceNames: {
                type: 'array',
                items: { type: 'string' },
                description: 'List of service names to get estimates for'
              },
              description: {
                type: 'string',
                description: 'Description of work needed for matching services'
              }
            }
          }
        },
        {
          name: 'transferToHuman',
          description: 'Transfer the call to a human staff member',
          parameters: {
            type: 'object',
            properties: {
              reason: {
                type: 'string',
                description: 'Why the customer wants to speak with a human'
              },
              urgent: {
                type: 'boolean',
                description: 'Whether this is urgent'
              }
            }
          }
        },
        {
          name: 'leaveMessage',
          description: 'Record a message for the business to call back',
          parameters: {
            type: 'object',
            properties: {
              message: {
                type: 'string',
                description: 'The message to leave'
              },
              urgent: {
                type: 'boolean',
                description: 'Whether this message is urgent'
              },
              callbackRequested: {
                type: 'boolean',
                description: 'Whether the customer wants a callback'
              }
            },
            required: ['message']
          }
        },
        {
          name: 'getUpcomingAppointments',
          description: 'Get the caller\'s upcoming appointments',
          parameters: {
            type: 'object',
            properties: {}
          }
        },
        {
          name: 'scheduleCallback',
          description: 'Schedule a callback for the customer at their preferred time',
          parameters: {
            type: 'object',
            properties: {
              preferredDate: {
                type: 'string',
                description: 'Preferred date for callback (can be natural language like "tomorrow")'
              },
              preferredTime: {
                type: 'string',
                description: 'Preferred time for callback (can be natural language like "afternoon")'
              },
              reason: {
                type: 'string',
                description: 'Reason for the callback request'
              },
              urgent: {
                type: 'boolean',
                description: 'Whether this is an urgent callback request'
              }
            }
          }
        },
        {
          name: 'recognizeCaller',
          description: 'Check if caller is a returning customer and get their info - CALL THIS AT THE START OF EVERY CALL',
          parameters: {
            type: 'object',
            properties: {}
          }
        },
        {
          name: 'getDirections',
          description: 'Get business address and directions info',
          parameters: {
            type: 'object',
            properties: {}
          }
        },
        {
          name: 'checkWaitTime',
          description: 'Check current wait time and next available appointment slot',
          parameters: {
            type: 'object',
            properties: {}
          }
        },
        {
          name: 'confirmAppointment',
          description: 'Confirm or acknowledge an upcoming appointment',
          parameters: {
            type: 'object',
            properties: {
              appointmentId: {
                type: 'number',
                description: 'The appointment ID if known'
              },
              confirmed: {
                type: 'boolean',
                description: 'Whether the customer is confirming (true) or wants to reschedule (false)'
              }
            },
            required: ['confirmed']
          }
        },
        {
          name: 'getServiceDetails',
          description: 'Get detailed information about a specific service',
          parameters: {
            type: 'object',
            properties: {
              serviceName: {
                type: 'string',
                description: 'The name or description of the service to look up'
              }
            },
            required: ['serviceName']
          }
        }
      ]
    },
    voice: {
      provider: '11labs',
      voiceId: 'paula', // Professional, friendly female voice
      stability: 0.5,
      similarityBoost: 0.8,
      style: 0.3, // Slightly more expressive
      useSpeakerBoost: true
    },
    firstMessage: `Thank you for calling ${business.name}, this is Alex. How can I help you today?`,
    serverUrl: `${BASE_URL}/api/vapi/webhook`,
    endCallFunctionEnabled: true,
    recordingEnabled: true,
    hipaaEnabled: false,
    silenceTimeoutSeconds: 30,
    responseDelaySeconds: 0.5, // Slight delay for natural feel
    llmRequestDelaySeconds: 0.1,
    numWordsToInterruptAssistant: 2, // Allow interruptions
    maxDurationSeconds: 600, // 10 min max call
    backgroundSound: 'off',
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
  businessHours?: any[]
): Promise<{ success: boolean; error?: string }> {
  if (!VAPI_API_KEY) {
    return { success: false, error: 'Vapi API key not configured' };
  }

  const systemPrompt = generateSystemPrompt(business, services, businessHours);

  // Get the same functions used in createAssistantForBusiness
  const functions = getAssistantFunctions();

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
          functions: functions
        },
        firstMessage: `Thank you for calling ${business.name}, this is Alex. How can I help you today?`,
        serverUrl: `${BASE_URL}/api/vapi/webhook`,
        metadata: {
          businessId: business.id.toString()
        }
      })
    });

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error: `Failed to update assistant: ${error}` };
    }

    return { success: true };
  } catch (error) {
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
