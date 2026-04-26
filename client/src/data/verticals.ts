/**
 * Vertical landing page data.
 *
 * Each vertical entry powers a `/for/<slug>` page rendered by
 * `<VerticalLandingPage vertical={...} />`.
 *
 * To add a new vertical:
 *   1. Add an entry to `verticals` below
 *   2. Create `client/src/pages/for/<slug>.tsx` (thin file — see existing examples)
 *   3. Register the route in `App.tsx`
 *   4. Add a footer link on the main landing page
 *
 * Pain points and use cases are written from defensible industry knowledge.
 * Replace any vertical's copy with real customer quotes once you have them —
 * authentic specificity converts much better than generic "AI for any business" copy.
 */

export interface VerticalUseCase {
  scenario: string;
  description: string;
}

export interface VerticalDemoLine {
  speaker: 'AI' | 'Caller';
  text: string;
}

export interface VerticalData {
  /** URL slug (`/for/<slug>`) */
  slug: string;
  /** Display name singular ("HVAC contractor") */
  nameSingular: string;
  /** Display name plural ("HVAC contractors") */
  namePlural: string;
  /** Browser tab title (becomes `${seoTitle} | SmallBizAgent`) */
  seoTitle: string;
  /** <meta name="description"> — keep <160 chars */
  seoDescription: string;
  /** Hero — 3 short phrases, the middle is gradient-highlighted */
  heroLine1: string;
  heroLine2Highlight: string;
  heroLine3: string;
  /** Subhead under hero — 1 sentence, what + who + when */
  heroSubhead: string;
  /** Pain section */
  painHeadline: string;
  painPoints: string[];
  /** 3 vertical-specific use cases for the demo grid */
  useCases: VerticalUseCase[];
  /** AI demo conversation snippet (3-5 lines) */
  demoConversation: VerticalDemoLine[];
  /** Demo header label (e.g., "Sample call · HVAC") */
  demoHeader: string;
  /** "Why for [vertical]" section — 3 reasons */
  whyReasons: { title: string; description: string }[];
  /** Footer-friendly tagline */
  microTagline: string;
  /**
   * "Everything in one place" stack — what's included on this vertical's plan.
   * Per-vertical so barbers/salons don't see invoicing copy that doesn't apply.
   * Each item is a feature pill rendered in a grid.
   */
  stackFeatures: { title: string; description: string }[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Reusable "stack" feature sets.
// These are the cards rendered in the "Everything in one place" section.
// Two flavors: APPOINTMENT_STACK for chair-based businesses (barbers, salons)
// where invoicing isn't part of the workflow; FULL_STACK for service businesses
// (HVAC, plumbing, cleaning, auto) where invoicing + chase actually matter.
// ─────────────────────────────────────────────────────────────────────────────

const APPOINTMENT_STACK: { title: string; description: string }[] = [
  {
    title: 'AI Voice Receptionist',
    description: 'Answers every call 24/7. Books with the right staff, knows your services and lingo.',
  },
  {
    title: 'Smart Scheduling',
    description: 'Online booking + staff calendars + automatic SMS reminders. Cut no-shows.',
  },
  {
    title: 'Customer CRM',
    description: 'Auto-built from every call and booking. Notes, history, preferences — one click away.',
  },
  {
    title: 'SMS Automation',
    description: 'Reminders, no-show recovery, rebooking nudges, review requests — all on autopilot.',
  },
  {
    title: 'Public Booking Page',
    description: 'A clean booking page customers can use 24/7. Sync with Google Business Profile.',
  },
  {
    title: 'Analytics + Insights',
    description: 'See call volume, booking conversion, top customers, and where revenue is leaking.',
  },
];

const FULL_STACK: { title: string; description: string }[] = [
  {
    title: 'AI Voice Receptionist',
    description: 'Answers every call 24/7. Triages emergencies, books service tickets, captures details.',
  },
  {
    title: 'Smart Scheduling + Dispatch',
    description: 'Calendar + staff routing + SMS reminders. Real emergencies escalate to your phone.',
  },
  {
    title: 'Invoicing + Payments',
    description: 'Send invoices in seconds with one-tap payment links. Stripe-powered. Get paid faster.',
  },
  {
    title: 'Automatic Invoice Chase',
    description: 'Overdue tickets chased via SMS at day 7, 14, 30. Recover money you used to write off.',
  },
  {
    title: 'Customer CRM',
    description: 'Every call, ticket, and invoice tracked per customer. History, notes, lifetime value.',
  },
  {
    title: 'SMS Automation Suite',
    description: 'Follow-ups, no-show recovery, review requests, rebooking nudges — all on autopilot.',
  },
];

export const verticals: Record<string, VerticalData> = {
  // ───────────────────────────────────────────── Barbershops
  // Pitch: AI receptionist + scheduling. Barbers don't deal with invoices —
  // it's cash/card-at-chair. Don't muddy the message with billing copy.
  barbershops: {
    slug: 'barbershops',
    nameSingular: 'barbershop',
    namePlural: 'barbershops',
    seoTitle: 'AI Receptionist & Scheduling for Barbershops',
    seoDescription:
      "Stop missing calls between cuts. SmallBizAgent answers your barbershop phone 24/7, books appointments, sends SMS reminders, and fills empty chairs — so you can keep the clippers running.",
    heroLine1: 'Stop missing calls',
    heroLine2Highlight: 'between haircuts.',
    heroLine3: 'Keep the chair full.',
    heroSubhead:
      "AI receptionist + scheduling for barbershops. Answers every call while you're cutting, books appointments, sends reminders, fills empty chairs. Live in 2 minutes.",
    painHeadline: "Sound familiar?",
    painPoints: [
      "Phone rings while you're mid-fade — caller hangs up, books with the shop down the street",
      "Walk-ins interrupt cuts to ask about pricing or wait times",
      "Texts piling up between clients, never getting answered",
      "Customers calling at 9 PM asking if you're open Saturday — and you're already in bed",
      "Empty chairs in the morning because last-minute cancellations went to voicemail",
    ],
    useCases: [
      {
        scenario: 'New client books a fade',
        description:
          "First-timer asks about pricing. AI walks them through your services, finds an open slot with the right barber, books and confirms via text.",
      },
      {
        scenario: '"You guys do lineups?"',
        description:
          "AI knows barbershop lingo — recognizes 'lineup' as an edge-up service, quotes the price, and offers next-available times.",
      },
      {
        scenario: 'No-show? Fill the chair instantly',
        description:
          "Client cancels their 2 PM. SMS goes out automatically to your last few callers offering the open slot. Chair gets filled before you'd even notice.",
      },
    ],
    demoHeader: 'Sample call · Barbershop',
    demoConversation: [
      { speaker: 'AI', text: "Thanks for calling Mike's Barbershop! How can I help?" },
      { speaker: 'Caller', text: "Yeah, can I get a lineup with Tony tomorrow?" },
      {
        speaker: 'AI',
        text: "Of course — Tony has openings tomorrow at 11 AM, 2 PM, or 4:30 PM. Which works best for you?",
      },
      { speaker: 'Caller', text: '2 PM is good.' },
      {
        speaker: 'AI',
        text: "You're booked for a lineup with Tony tomorrow at 2 PM. I'll text you a confirmation. See you then!",
      },
    ],
    whyReasons: [
      {
        title: 'Knows your services',
        description:
          'Lineup, fade, taper, beard trim, hot towel shave — AI speaks barbershop and books the right service with the right barber.',
      },
      {
        title: 'Books while you cut',
        description:
          'No more putting clippers down to grab the phone. Every call answered, every booking on your calendar, every reminder sent.',
      },
      {
        title: 'Fills no-shows automatically',
        description:
          'When someone cancels, SMS goes out to recent callers to fill the slot. Less downtime, more cuts, more revenue.',
      },
    ],
    microTagline: 'AI receptionist + scheduling for barbershops',
    stackFeatures: APPOINTMENT_STACK,
  },

  // ───────────────────────────────────────────── Salons
  // Same as barbers: salons collect at the chair, no invoicing workflow.
  // Pitch: AI receptionist + scheduling + SMS automation.
  salons: {
    slug: 'salons',
    nameSingular: 'salon',
    namePlural: 'salons',
    seoTitle: 'AI Receptionist & Scheduling for Hair Salons',
    seoDescription:
      "SmallBizAgent answers your salon's phone 24/7 — books color, cuts, and styles with the right stylist, sends SMS reminders, and fills cancellations automatically.",
    heroLine1: 'Stop missing calls',
    heroLine2Highlight: 'between clients.',
    heroLine3: 'Book more chairs.',
    heroSubhead:
      "AI receptionist + scheduling for hair salons. Books color, cuts, and styles with the right stylist — even while you're foiling. Live in 2 minutes.",
    painHeadline: 'Running a salon is loud. Your phone shouldn\'t be.',
    painPoints: [
      "Phone rings during a color application — you can't pick up, client hangs up",
      'Front-desk turnover means inconsistent booking quality',
      "New clients don't know which stylist to book with — they bounce instead of asking",
      'No-shows on color appointments cost you 2-3 hours of lost chair time',
      'Saturday phone tag with 6 callers when you only have time for 2',
    ],
    useCases: [
      {
        scenario: 'Color consultation request',
        description:
          'Caller wants balayage. AI explains how it differs from highlights, books a consultation with your colorist, and sends prep instructions.',
      },
      {
        scenario: '"Which stylist takes new clients?"',
        description:
          "AI knows each stylist's availability + specialties. Books the new client with the right stylist for their hair type.",
      },
      {
        scenario: 'Last-minute cancel',
        description:
          'Client cancels their 2 PM via text. AI immediately texts your last 3 callers about the open slot — fills the chair before the day starts.',
      },
    ],
    demoHeader: 'Sample call · Salon',
    demoConversation: [
      { speaker: 'AI', text: "Thanks for calling Studio Hair! How can I help?" },
      { speaker: 'Caller', text: "I'm new — looking for a haircut and root touch-up." },
      {
        speaker: 'AI',
        text: "Welcome! For a cut and root color we'll book about 2 hours. Sarah has openings Thursday at 10 AM or Friday at 2 PM — which works?",
      },
      { speaker: 'Caller', text: 'Friday at 2.' },
      {
        speaker: 'AI',
        text: "You're booked with Sarah on Friday at 2 PM. I'll text you a confirmation and what to expect. See you Friday!",
      },
    ],
    whyReasons: [
      {
        title: 'Knows your services + stylists',
        description:
          'Balayage, partial highlights, root touch-up, glaze, blowout — AI books the right service with the right stylist for the right duration.',
      },
      {
        title: 'Cuts no-shows with smart reminders',
        description:
          'Automatic SMS reminders at 24 hours and 2 hours before. Confirmations cut no-shows and protect your chair time.',
      },
      {
        title: 'Fills cancellations automatically',
        description:
          "When a client cancels, AI can text waitlisted clients to fill the slot — turning lost revenue into a booked chair.",
      },
    ],
    microTagline: 'AI receptionist + scheduling for hair salons',
    stackFeatures: APPOINTMENT_STACK,
  },

  // ───────────────────────────────────────────── HVAC
  // Full front office: AI + scheduling + invoicing + invoice chase.
  // HVAC tickets often go on 30-day terms; chase agent is real revenue.
  hvac: {
    slug: 'hvac',
    nameSingular: 'HVAC contractor',
    namePlural: 'HVAC contractors',
    seoTitle: 'Front Office Software for HVAC: AI Receptionist + Scheduling + Invoicing',
    seoDescription:
      'Never miss an emergency call. Never chase another invoice. SmallBizAgent answers HVAC calls 24/7, books service jobs, sends invoices, and chases overdue payments — automatically.',
    heroLine1: 'Never miss a call.',
    heroLine2Highlight: 'Never chase an invoice.',
    heroLine3: 'Stay on the job.',
    heroSubhead:
      "The all-in-one front office for HVAC. AI receptionist + scheduling + invoicing + automatic chase — so you can stay on the lift, not on the phone or chasing payments. Live in 2 minutes.",
    painHeadline: 'Every missed call is a $400 service ticket.',
    painPoints: [
      "Phone rings while you're on a roof in 95° heat — and you can't reach it",
      "AC dies at 11 PM in July. They call your number. You miss it. They call your competitor.",
      'Tire-kickers eat up your time asking for ballpark quotes',
      "Customer calls about a furnace, but you're three jobs deep and can't follow up for hours",
      'Office staff overwhelmed during summer rush — calls going to voicemail',
    ],
    useCases: [
      {
        scenario: 'Emergency: AC out at 11 PM',
        description:
          "Frustrated homeowner with no AC. AI recognizes the urgency, gathers the issue (no cooling, unit age, address), schedules first-thing morning service, and texts you the ticket.",
      },
      {
        scenario: '$1,200 ticket, 30 days late',
        description:
          "Customer ghosts on the invoice. Automatic SMS chase kicks in at day 7, 14, 30 — escalating tone, payment link in every message. Most pay before day 14.",
      },
      {
        scenario: '"How much for a new system?"',
        description:
          "AI gives a ballpark range, then offers to book a free in-home estimate. Tire-kickers get answers; serious leads get scheduled.",
      },
    ],
    demoHeader: 'Sample call · HVAC',
    demoConversation: [
      { speaker: 'AI', text: "Thanks for calling Reliable HVAC. How can I help?" },
      { speaker: 'Caller', text: "My AC isn't cooling. House is 85 degrees." },
      {
        speaker: 'AI',
        text: "Sorry to hear that — let's get a tech out to you. What's the address, and is the unit blowing warm air or not running at all?",
      },
      { speaker: 'Caller', text: '1247 Maple Street. Blowing warm.' },
      {
        speaker: 'AI',
        text: "Got it. I have a tech available tomorrow morning at 8 AM, or I can flag this as urgent and have someone call you back tonight to assess. Which works?",
      },
    ],
    whyReasons: [
      {
        title: 'Knows HVAC',
        description:
          'Short cycling, frozen coils, R-22 vs R-410A, heat pump vs furnace — AI speaks HVAC and asks the right diagnostic questions to qualify the call.',
      },
      {
        title: 'Triages + dispatches + books',
        description:
          'Real emergencies escalate to your phone in real-time. Routine jobs land on your schedule. No more juggling tickets in your truck.',
      },
      {
        title: 'Invoices + chases automatically',
        description:
          "Send invoices in seconds with one-tap payment links. Overdue tickets get chased automatically — most pay before day 14 without you lifting a finger.",
      },
    ],
    microTagline: 'Front office for HVAC contractors',
    stackFeatures: FULL_STACK,
  },

  // ───────────────────────────────────────────── Plumbing
  // Full front office: AI + scheduling + invoicing + chase. Emergency plumbing
  // tickets often go on terms — chase agent recovers a real % of overdues.
  plumbing: {
    slug: 'plumbing',
    nameSingular: 'plumber',
    namePlural: 'plumbers',
    seoTitle: 'Front Office Software for Plumbers: AI Receptionist + Scheduling + Invoicing',
    seoDescription:
      "Pick up every flooding emergency. Send invoices in seconds. Stop chasing overdue tickets. SmallBizAgent answers plumbing calls 24/7, dispatches emergencies, invoices customers, and chases payments — automatically.",
    heroLine1: 'Pick up every emergency.',
    heroLine2Highlight: 'Get paid for every job.',
    heroLine3: 'Stay in the truck.',
    heroSubhead:
      "The all-in-one front office for plumbers. AI receptionist + dispatch + invoicing + automatic chase — so you don't lose another flooded basement to voicemail or another invoice to silence. Live in 2 minutes.",
    painHeadline: 'A burst pipe at midnight is your highest-margin job. If you answer.',
    painPoints: [
      "Pipe bursts at 2 AM. They call you, then your competitor. Whoever picks up wins.",
      "You're under a sink — phone ringing in your truck, you can't get to it",
      'Routine drain calls clog up your phone time when emergencies need attention',
      'Customers asking about water heater quotes when you should be scoping a sewer line',
      "First call of the day comes in at 6 AM — you're not awake, they go to voicemail",
    ],
    useCases: [
      {
        scenario: 'Burst pipe at 2 AM',
        description:
          "Panicked homeowner, water everywhere. AI calmly walks them through finding the shutoff, schedules emergency dispatch, and texts you immediately.",
      },
      {
        scenario: 'Slow drain — not urgent',
        description:
          "AI recognizes a routine drain call vs an emergency. Books a next-day appointment, captures the issue (slow tub, gurgling toilet), no late-night dispatch.",
      },
      {
        scenario: '$800 emergency invoice goes unpaid',
        description:
          "Customer pays half, ghosts on the rest. Automatic SMS chase kicks in at day 7, 14, 30 with payment links. Recovery happens while you're on the next job.",
      },
    ],
    demoHeader: 'Sample call · Plumbing',
    demoConversation: [
      { speaker: 'AI', text: "Thanks for calling Pro Plumbing. How can I help?" },
      { speaker: 'Caller', text: "Pipe burst under my kitchen sink — there's water everywhere!" },
      {
        speaker: 'AI',
        text: "OK — first thing, can you turn off the main water shutoff? It's usually in the basement near the front of the house. I'll dispatch our on-call plumber right now.",
      },
      { speaker: 'Caller', text: "Yeah, shutting it off now. How fast can you get here?" },
      {
        speaker: 'AI',
        text: "Mike is on call tonight — he can be there in about 45 minutes. What's the address? I'll text you his ETA and contact info.",
      },
    ],
    whyReasons: [
      {
        title: 'Knows plumbing',
        description:
          'Sewer line, slab leak, water heater, sump pump, garbage disposal, P-trap — AI speaks plumbing and qualifies emergency vs routine.',
      },
      {
        title: 'Captures emergencies 24/7',
        description:
          "The plumber who answers at 11 PM gets the $1,200 emergency. AI is awake when you're not — and texts you the moment a real emergency comes in.",
      },
      {
        title: 'Invoices + chases automatically',
        description:
          'Send invoices from the truck with one-tap payment links. Overdue tickets chase themselves via SMS — recover money you used to write off.',
      },
    ],
    microTagline: 'Front office for plumbers',
    stackFeatures: FULL_STACK,
  },

  // ───────────────────────────────────────────── Cleaning
  // Full front office: recurring billing is the killer feature for this vertical.
  cleaning: {
    slug: 'cleaning',
    nameSingular: 'cleaning service',
    namePlural: 'cleaning services',
    seoTitle: 'Front Office Software for Cleaning Services: AI Receptionist + Scheduling + Invoicing',
    seoDescription:
      'SmallBizAgent answers your cleaning service phone 24/7, books recurring + one-time jobs, sends invoices automatically, and chases overdue payments — so you stop losing leads and stop chasing money.',
    heroLine1: 'Stop losing leads.',
    heroLine2Highlight: 'Stop chasing checks.',
    heroLine3: 'Just clean.',
    heroSubhead:
      "The all-in-one front office for cleaning services. AI receptionist + scheduling + recurring invoicing + automatic chase — even while your team is on-site. Live in 2 minutes.",
    painHeadline: 'You can\'t answer the phone with a vacuum running.',
    painPoints: [
      "Lead calls while you're on a deep clean — they don't leave a message",
      'Quote requests pile up in your inbox; you call back 2 days later, they already booked someone else',
      "Recurring clients calling to reschedule, and you're elbows-deep in a bathroom",
      'New leads asking "do you do move-out cleans?" — no one to answer in real-time',
      'Saturday morning rush of inquiries you handle late Sunday night',
    ],
    useCases: [
      {
        scenario: 'New move-out clean quote',
        description:
          'Caller needs a 3-bed/2-bath move-out clean by Friday. AI gathers square footage + scope (carpets, appliances, baseboards), gives a price range, books the job.',
      },
      {
        scenario: 'Recurring client reschedule',
        description:
          'Bi-weekly client needs to push their Wednesday clean to Thursday. AI checks your team\'s schedule, moves the appointment, texts confirmation.',
      },
      {
        scenario: 'Recurring invoice on autopilot',
        description:
          "Bi-weekly client billed automatically every other Wednesday after the clean. Invoice with payment link sent via email + SMS. Late payment chased without you lifting a finger.",
      },
    ],
    demoHeader: 'Sample call · Cleaning service',
    demoConversation: [
      { speaker: 'AI', text: "Thanks for calling Spotless Cleaning! How can I help?" },
      {
        speaker: 'Caller',
        text: 'I need a deep clean before my in-laws visit on Friday — 4 bedrooms, 3 baths.',
      },
      {
        speaker: 'AI',
        text: "Got it — for that size we'd send a team of 2 for about 4 hours. We have openings Wednesday morning or Thursday afternoon. Which works?",
      },
      { speaker: 'Caller', text: 'Thursday afternoon, around 1 PM?' },
      {
        speaker: 'AI',
        text: "You're booked Thursday at 1 PM with our 2-person crew. I'll text you the estimate and what to expect. Anything we should know about pets or special requests?",
      },
    ],
    whyReasons: [
      {
        title: 'Knows cleaning services',
        description:
          'Move-in/move-out, deep clean, recurring weekly/bi-weekly, post-construction, Airbnb turnover — AI books the right service with the right crew size.',
      },
      {
        title: 'Quotes accurately',
        description:
          'AI gathers square footage, bedroom/bathroom count, and scope to give realistic price ranges — converting more leads vs sending them to your inbox.',
      },
      {
        title: 'Recurring billing on autopilot',
        description:
          "Bi-weekly + monthly clients invoiced automatically after each clean. Payment links in every invoice. Overdue tickets chased via SMS — zero evenings spent on bookkeeping.",
      },
    ],
    microTagline: 'Front office for cleaning services',
    stackFeatures: FULL_STACK,
  },

  // ───────────────────────────────────────────── Auto Repair
  // Most shops collect at pickup, but bigger fleet/repair tickets use invoicing.
  // Pitch: AI + scheduling primary; invoicing as a soft mention.
  auto: {
    slug: 'auto',
    nameSingular: 'auto repair shop',
    namePlural: 'auto repair shops',
    seoTitle: 'AI Receptionist & Scheduling for Auto Repair Shops',
    seoDescription:
      'SmallBizAgent answers your auto shop phone 24/7 — books appointments, qualifies vehicle issues, captures VIN + symptoms, sends SMS reminders, and invoices customers. Built for mechanics.',
    heroLine1: 'Stop losing calls',
    heroLine2Highlight: "while you're in the bay.",
    heroLine3: 'Book more service tickets.',
    heroSubhead:
      "AI receptionist + scheduling + invoicing for auto repair shops. Books service tickets with VIN + symptoms, sends reminders, invoices customers — so you can stay on the lift. Live in 2 minutes.",
    painHeadline: 'You can\'t hear the phone over the impact gun.',
    painPoints: [
      "You're under a hood — phone in the office rings, no one to answer",
      "Customer says 'something feels off' — you need details, but you're on a brake job",
      "Service writers can't keep up with calls during a busy morning rush",
      'New customers calling at 7 AM with engine warning lights — first shop to answer wins',
      'Tire kickers call asking for ballpark prices, eat up service writer time',
    ],
    useCases: [
      {
        scenario: '"Check engine light is on"',
        description:
          'AI gathers year/make/model + symptoms, books a diagnostic appointment, quotes the diagnostic fee, and texts the customer prep info.',
      },
      {
        scenario: '"She\'s pulling to the right"',
        description:
          'AI knows that\'s likely an alignment. Quotes the service, checks lift availability, books the appointment with all vehicle details captured.',
      },
      {
        scenario: 'Brake job estimate',
        description:
          "Customer wants brake quote. AI gathers vehicle info, gives ballpark range (pads vs pads+rotors), and books a free brake inspection.",
      },
    ],
    demoHeader: 'Sample call · Auto repair',
    demoConversation: [
      { speaker: 'AI', text: "Thanks for calling Eastside Auto Repair. How can I help?" },
      { speaker: 'Caller', text: "My check engine light just came on, and the car's running rough." },
      {
        speaker: 'AI',
        text: "OK — what year/make/model are we looking at? I'll get you scheduled for a diagnostic.",
      },
      { speaker: 'Caller', text: '2017 Honda Civic.' },
      {
        speaker: 'AI',
        text: "Got it. Our diagnostic fee is $129 and takes about an hour. We have openings tomorrow at 8 AM or 1 PM — which works for you?",
      },
    ],
    whyReasons: [
      {
        title: 'Knows auto repair',
        description:
          "Alignment, brake job, oil change, tune-up, diagnostic, transmission flush — AI speaks shop-talk and asks the right questions to write a clean ticket.",
      },
      {
        title: 'Captures VIN + symptoms',
        description:
          "AI gets the vehicle info upfront so your service writers don't have to. Tickets land in your system pre-filled and ready to schedule.",
      },
      {
        title: 'Invoice from the lift',
        description:
          "Send invoices in seconds with one-tap payment links. Bigger fleet/insurance tickets get tracked. Overdue invoices chased automatically.",
      },
    ],
    microTagline: 'AI receptionist + scheduling for auto repair shops',
    stackFeatures: FULL_STACK,
  },
};

/** Helper: list of all vertical entries (for footer cross-links, sitemap, etc.) */
export const verticalList: VerticalData[] = Object.values(verticals);
