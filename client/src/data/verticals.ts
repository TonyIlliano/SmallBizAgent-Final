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
}

export const verticals: Record<string, VerticalData> = {
  // ───────────────────────────────────────────── Barbershops
  barbershops: {
    slug: 'barbershops',
    nameSingular: 'barbershop',
    namePlural: 'barbershops',
    seoTitle: 'AI Receptionist for Barbershops',
    seoDescription:
      'Stop missing calls between cuts. SmallBizAgent answers your barbershop phone 24/7, books appointments, and texts confirmations — so you can keep the clippers running.',
    heroLine1: 'Stop missing calls',
    heroLine2Highlight: 'between haircuts.',
    heroLine3: 'Keep the chair full.',
    heroSubhead:
      "Your AI receptionist for barbershops. Answers every call while you're cutting, books appointments, sends confirmations. Live in 2 minutes.",
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
        scenario: 'Saturday rush, you can\'t answer',
        description:
          "Three calls come in while you're with a client. AI handles all three, books two, and texts the third with availability.",
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
          'Lineup, fade, taper, beard trim, hot towel shave — your AI speaks barbershop and books the right service with the right barber.',
      },
      {
        title: 'Works while you cut',
        description:
          'No more putting clippers down to grab the phone. Every call gets answered, every booking lands on your calendar.',
      },
      {
        title: 'Books late-night customers',
        description:
          'The customer calling at 10 PM looking for a Saturday slot? AI books them while you sleep. You wake up to a full chair.',
      },
    ],
    microTagline: 'AI receptionist for barbershops',
  },

  // ───────────────────────────────────────────── Salons
  salons: {
    slug: 'salons',
    nameSingular: 'salon',
    namePlural: 'salons',
    seoTitle: 'AI Receptionist for Hair Salons',
    seoDescription:
      "SmallBizAgent answers your salon's phone 24/7 — books color, cuts, and styles with the right stylist, sends confirmations, and reduces no-shows.",
    heroLine1: 'Stop missing calls',
    heroLine2Highlight: 'between clients.',
    heroLine3: 'Book more chairs.',
    heroSubhead:
      "Your AI receptionist for hair salons. Books color, cuts, and styles with the right stylist — even while you're foiling. Live in 2 minutes.",
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
    microTagline: 'AI receptionist for hair salons',
  },

  // ───────────────────────────────────────────── HVAC
  hvac: {
    slug: 'hvac',
    nameSingular: 'HVAC contractor',
    namePlural: 'HVAC contractors',
    seoTitle: 'AI Receptionist for HVAC Contractors',
    seoDescription:
      'Never miss an emergency AC call again. SmallBizAgent answers HVAC calls 24/7, qualifies emergencies, books service appointments, and routes urgent jobs to you.',
    heroLine1: 'Never miss',
    heroLine2Highlight: 'an emergency call.',
    heroLine3: 'Book more service jobs.',
    heroSubhead:
      "Your AI receptionist for HVAC. Answers 24/7, qualifies emergencies, books service calls — so you can stay on the job, not on the phone. Live in 2 minutes.",
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
        scenario: 'Maintenance season prep',
        description:
          'Customer wants their seasonal tune-up booked. AI checks your schedule, books a 90-minute slot, and adds the address + unit notes from CRM.',
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
        title: 'Triages emergencies',
        description:
          'AI distinguishes "no heat in winter" from "filter change in spring" — escalates true emergencies to your phone, books routine jobs into your schedule.',
      },
      {
        title: 'Books while you\'re on the job',
        description:
          'No more dropping a wrench to grab the phone. AI handles the call, sends you a text with the ticket, and the customer gets a confirmation.',
      },
    ],
    microTagline: 'AI receptionist for HVAC contractors',
  },

  // ───────────────────────────────────────────── Plumbing
  plumbing: {
    slug: 'plumbing',
    nameSingular: 'plumber',
    namePlural: 'plumbers',
    seoTitle: 'AI Receptionist for Plumbers',
    seoDescription:
      'Stop losing emergency plumbing calls. SmallBizAgent answers your plumbing phone 24/7, qualifies leaks vs clogs, dispatches urgent jobs, and books service.',
    heroLine1: 'Pick up every',
    heroLine2Highlight: 'flooding emergency.',
    heroLine3: 'Book more drain jobs.',
    heroSubhead:
      "Your AI receptionist for plumbing. Answers 24/7, qualifies emergencies, dispatches urgent jobs — so you don't lose another flooded basement to voicemail. Live in 2 minutes.",
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
        scenario: 'Water heater replacement quote',
        description:
          "AI gathers tank size + age + location, gives a ballpark range, books a free estimate. You don't waste a truck roll on a maybe.",
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
          'Sewer line, slab leak, water heater, sump pump, garbage disposal, P-trap — AI speaks plumbing and asks the right qualifying questions.',
      },
      {
        title: 'Triages by urgency',
        description:
          'A burst pipe gets dispatched in real-time. A slow drain gets a next-day slot. AI knows the difference and routes accordingly.',
      },
      {
        title: 'Captures emergency calls 24/7',
        description:
          "The plumber who answers at 11 PM gets the $1,200 emergency job. AI is awake when you're not — and texts you the moment a real emergency comes in.",
      },
    ],
    microTagline: 'AI receptionist for plumbers',
  },

  // ───────────────────────────────────────────── Cleaning
  cleaning: {
    slug: 'cleaning',
    nameSingular: 'cleaning service',
    namePlural: 'cleaning services',
    seoTitle: 'AI Receptionist for Cleaning Services',
    seoDescription:
      'SmallBizAgent answers your cleaning service phone 24/7, books recurring + one-time jobs, sends confirmations, and follows up with quote requests automatically.',
    heroLine1: 'Stop losing leads',
    heroLine2Highlight: 'while you\'re cleaning.',
    heroLine3: 'Book more recurring jobs.',
    heroSubhead:
      "Your AI receptionist for cleaning services. Quotes one-time and recurring jobs, books crews, sends confirmations — even while your team is on-site. Live in 2 minutes.",
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
        scenario: '"Do you bring supplies?"',
        description:
          "AI answers FAQs (supplies, eco-friendly options, pet policy, time estimates) without you having to pick up. Qualified leads get booked, tire-kickers get info.",
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
        title: 'Locks in recurring revenue',
        description:
          "Recurring clients can self-serve scheduling changes via SMS. Your highest-margin business runs itself instead of eating your evenings.",
      },
    ],
    microTagline: 'AI receptionist for cleaning services',
  },

  // ───────────────────────────────────────────── Auto Repair
  auto: {
    slug: 'auto',
    nameSingular: 'auto repair shop',
    namePlural: 'auto repair shops',
    seoTitle: 'AI Receptionist for Auto Repair Shops',
    seoDescription:
      'SmallBizAgent answers your auto shop phone 24/7 — books appointments, qualifies vehicle issues, gathers VIN + symptoms, and texts confirmations. Built for mechanics.',
    heroLine1: 'Stop losing calls',
    heroLine2Highlight: 'while you\'re in the bay.',
    heroLine3: 'Book more service tickets.',
    heroSubhead:
      "Your AI receptionist for auto repair shops. Books service appointments, qualifies symptoms, captures VIN + issue — so you can stay on the lift. Live in 2 minutes.",
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
        title: 'Books while you\'re in the bay',
        description:
          "No more dropping the impact gun to grab the phone. AI handles every call, every booking lands on your shop's calendar.",
      },
    ],
    microTagline: 'AI receptionist for auto repair shops',
  },
};

/** Helper: list of all vertical entries (for footer cross-links, sitemap, etc.) */
export const verticalList: VerticalData[] = Object.values(verticals);
