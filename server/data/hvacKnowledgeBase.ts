/**
 * HVAC Knowledge Base — pre-seeded FAQ template.
 *
 * Auto-populated when a business onboards with industry "HVAC" (or a
 * matching alias like "heating & cooling"). Owners can edit any entry from
 * the Receptionist → Knowledge Base UI; they are NOT locked.
 *
 * Placeholders the seeder will substitute:
 *   {businessName}   — business.name
 *   {businessPhone}  — business.phone or twilioPhoneNumber
 *   {businessHours}  — short summary of business hours
 *
 * Categories used here:
 *   - "emergency"   — high-priority urgent / after-hours
 *   - "equipment"   — refrigerant, brands, system types
 *   - "maintenance" — tune-ups, service plans, IAQ
 *   - "warranty"    — warranties, financing, licensing
 *   - "pricing"     — estimates, diagnostic fees, average install costs
 *   - "scheduling"  — turnaround, service area, hours
 *
 * Priority semantics (matches existing knowledge base scoring):
 *   20 = critical — always include in AI prompt
 *   15 = important — include unless severely budget-constrained
 *   10 = baseline — included when budget allows
 */

export interface HvacKbEntry {
  question: string;
  answer: string;
  category: string;
  priority: number;
}

export const HVAC_KB_SEED: HvacKbEntry[] = [
  // ── Emergency / urgent ──
  {
    question: 'Do you handle emergency calls? Like no heat or no AC?',
    answer:
      'Yes — {businessName} prioritizes no-heat and no-AC emergencies. If you have no heat in winter or no AC during a heat wave, call us at {businessPhone} and we will get a technician dispatched as quickly as possible. We treat gas smells, water leaks from the HVAC system, and complete system failures as urgent.',
    category: 'emergency',
    priority: 20,
  },
  {
    question: 'What is your after-hours or emergency rate?',
    answer:
      'After-hours service is available for emergencies. Rates vary based on the time of day, the day of the week, and the nature of the issue. For an accurate quote, please call {businessPhone} and our team will walk you through the pricing before we dispatch a technician.',
    category: 'emergency',
    priority: 20,
  },
  {
    question: 'I smell gas — what should I do?',
    answer:
      'If you smell gas, leave the home immediately and call your gas utility from outside. Do not turn lights on or off, do not use the phone inside, and do not start any vehicles in the garage. Once the utility has confirmed the area is safe, call us at {businessPhone} and we will inspect and repair the issue.',
    category: 'emergency',
    priority: 20,
  },

  // ── Equipment / refrigerant ──
  {
    question: 'What refrigerant do you use?',
    answer:
      'Most current installations use R-410A or the newer R-32 refrigerant, both of which meet EPA standards. We can still service older R-22 systems, but R-22 is no longer manufactured and replacement is recommended when costs add up. The technician will identify the refrigerant in your system during the diagnostic.',
    category: 'equipment',
    priority: 15,
  },
  {
    question: 'Do you service all brands of HVAC equipment?',
    answer:
      'Yes — {businessName} services all major HVAC brands including Carrier, Trane, Lennox, Goodman, Rheem, York, American Standard, Bryant, and others. Our technicians are trained on both heat pumps and traditional split systems.',
    category: 'equipment',
    priority: 15,
  },
  {
    question: 'Do you install heat pumps and mini-splits?',
    answer:
      'Yes — we install central heat pumps, ductless mini-split systems (single and multi-zone), and hybrid heat pump + furnace setups. Mini-splits are a great option for additions, garages, or homes without existing ductwork. We provide free estimates on new installations.',
    category: 'equipment',
    priority: 15,
  },

  // ── Maintenance / IAQ ──
  {
    question: "What is included in a tune-up?",
    answer:
      'Our standard tune-up includes inspecting and cleaning the outdoor condenser coils, checking refrigerant pressure, testing electrical components and capacitors, inspecting the blower motor and fan, checking the thermostat operation, replacing or cleaning the air filter, and verifying overall system performance. The technician will flag any issues before they become emergencies.',
    category: 'maintenance',
    priority: 15,
  },
  {
    question: 'How often should I service my HVAC system?',
    answer:
      'We recommend a tune-up twice a year — once in the spring for your AC and once in the fall for your furnace or heat pump. Regular maintenance extends the life of your equipment, keeps your warranty valid, and catches small issues before they become expensive failures.',
    category: 'maintenance',
    priority: 15,
  },
  {
    question: 'Do you offer maintenance plans or service agreements?',
    answer:
      'Yes — {businessName} offers annual maintenance plans that include two seasonal tune-ups, priority scheduling for repair calls, and a discount on parts and labor. Ask the technician for plan details or call {businessPhone} to enroll.',
    category: 'maintenance',
    priority: 15,
  },
  {
    question: 'Do you test indoor air quality?',
    answer:
      'Yes — we offer indoor air quality assessments. We can test for humidity issues, ventilation problems, allergens, and mold. Based on the assessment we may recommend UV lights, HEPA filtration, whole-home humidifiers or dehumidifiers, or duct cleaning.',
    category: 'maintenance',
    priority: 10,
  },
  {
    question: 'Do you do duct cleaning?',
    answer:
      'Yes — we provide professional duct cleaning using truck-mounted equipment. This is recommended every few years, or sooner if you notice visible dust around vents, musty smells, recent home renovations, or family members with allergies or respiratory issues.',
    category: 'maintenance',
    priority: 10,
  },
  {
    question: 'Can you help with high humidity or mold problems?',
    answer:
      'Yes — we diagnose and resolve humidity issues with whole-home dehumidifiers, properly sized AC equipment (oversized units are often the cause of humidity problems), and ventilation improvements. If mold is already present in the ductwork, we coordinate cleaning before any humidity equipment is installed.',
    category: 'maintenance',
    priority: 10,
  },

  // ── Warranty / financing / credentials ──
  {
    question: 'Do you offer financing on new systems?',
    answer:
      'Yes — we offer financing options for new HVAC installations and major repairs. Plans typically include low monthly payments and competitive APR. The estimator will walk through financing options when they prepare your quote. Approval is usually quick — within minutes.',
    category: 'warranty',
    priority: 15,
  },
  {
    question: 'What warranty do you provide on repairs and installations?',
    answer:
      'New equipment installations come with the manufacturer warranty (typically 10 years on parts) plus our labor warranty (typically 1 year, longer with maintenance plans). Repairs come with a labor warranty that the technician will explain at the time of service. Keep your tune-up records — most manufacturer warranties require proof of regular maintenance.',
    category: 'warranty',
    priority: 15,
  },
  {
    question: 'Are your technicians licensed and insured?',
    answer:
      'Yes — {businessName} is fully licensed, bonded, and insured. Our technicians are EPA Section 608 certified to handle refrigerant, and many are NATE certified for installation and service. We carry general liability and workers\' comp coverage on every job.',
    category: 'warranty',
    priority: 15,
  },

  // ── Pricing ──
  {
    question: 'Do you give free estimates?',
    answer:
      'For replacement systems and installation projects, yes — estimates are free. For diagnostic visits on a broken system, there is a service call fee that covers the technician\'s time to diagnose the issue. That fee is typically credited toward the repair if you choose to proceed.',
    category: 'pricing',
    priority: 10,
  },
  {
    question: 'How much does a new AC unit cost?',
    answer:
      'New AC installation costs vary based on the size of your home, system efficiency rating (SEER), brand, and any ductwork modifications needed. We do not provide quotes over the phone because every home is different. A free in-home estimate is the most accurate way to get pricing — call {businessPhone} to schedule.',
    category: 'pricing',
    priority: 10,
  },
  {
    question: 'Do you charge for diagnostics?',
    answer:
      'Yes — there is a flat-rate diagnostic fee for service calls. This covers the technician\'s time to come out, identify the issue, and provide you with a written repair estimate. If you approve the repair, we typically apply the diagnostic fee toward the cost of the repair.',
    category: 'pricing',
    priority: 10,
  },

  // ── Scheduling / service area ──
  {
    question: 'How quickly can you get out here?',
    answer:
      'For emergencies (no heat, no AC, gas smells, water leaks) we prioritize same-day service when possible. For non-emergency repairs and maintenance, we typically schedule within 1-3 business days. Call {businessPhone} and we will work to get you on the schedule as soon as it works for you.',
    category: 'scheduling',
    priority: 10,
  },
  {
    question: 'What is your service area?',
    answer:
      'Please call {businessPhone} and confirm with our office — service area depends on where the job is located. We are happy to confirm coverage when you reach out.',
    category: 'scheduling',
    priority: 10,
  },
  {
    question: 'Do you work weekends?',
    answer:
      'Standard service hours are {businessHours}. For HVAC emergencies — no heat in winter, no AC during a heat wave, gas smells, water leaks — we offer after-hours and weekend service. Call {businessPhone} and we will let you know what is available.',
    category: 'scheduling',
    priority: 10,
  },
];
