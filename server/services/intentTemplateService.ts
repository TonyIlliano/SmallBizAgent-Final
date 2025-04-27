/**
 * Intent Template Service
 * 
 * Provides industry-specific templates for virtual receptionist intents
 * to help businesses get started quickly with common customer requests.
 */

import { BotIntent } from "./lexTrainingService";

// Template structure
export interface IntentTemplate {
  id: string;
  name: string;
  description: string;
  sampleUtterances: string[];
  industry: string;
  isCommon: boolean; // Common intents apply to all business types
}

// Common intents that apply to all business types
const commonIntents: IntentTemplate[] = [
  {
    id: "appointment",
    name: "Appointment",
    description: "Schedule, modify, or cancel an appointment",
    industry: "all",
    isCommon: true,
    sampleUtterances: [
      "I need to make an appointment",
      "I'd like to schedule a visit",
      "Can I book a time slot",
      "I need to reschedule my appointment",
      "I need to cancel my appointment",
      "Do you have any openings this week",
      "What's your availability like",
      "I need to come in for a consultation",
      "When can I book an appointment",
      "I need to see someone as soon as possible"
    ]
  },
  {
    id: "business_hours",
    name: "BusinessHours",
    description: "Inquiries about when the business is open",
    industry: "all",
    isCommon: true,
    sampleUtterances: [
      "What are your hours",
      "When are you open",
      "What time do you close",
      "Are you open on weekends",
      "What are your Sunday hours",
      "Are you open on holidays",
      "What are your hours of operation",
      "How late are you open today",
      "Do you open early",
      "When do you open tomorrow"
    ]
  },
  {
    id: "location",
    name: "Location",
    description: "Inquiries about the business location and directions",
    industry: "all",
    isCommon: true,
    sampleUtterances: [
      "Where are you located",
      "What's your address",
      "How do I get to your office",
      "Where is your shop",
      "Do you have parking",
      "Are you near public transportation",
      "What's the closest intersection",
      "How do I find you",
      "Is there parking nearby",
      "Do you have multiple locations"
    ]
  },
  {
    id: "general_inquiry",
    name: "GeneralInquiry",
    description: "General questions about the business",
    industry: "all",
    isCommon: true,
    sampleUtterances: [
      "Tell me about your company",
      "What services do you offer",
      "I have a question",
      "Can you help me with something",
      "I'm looking for information",
      "Do you provide consultations",
      "Who should I talk to about",
      "I'm interested in your services",
      "Can I speak to someone about",
      "I need some information"
    ]
  },
  {
    id: "pricing",
    name: "Pricing",
    description: "Questions about pricing and payment",
    industry: "all",
    isCommon: true,
    sampleUtterances: [
      "How much do you charge",
      "What are your rates",
      "Do you offer discounts",
      "What's the cost for",
      "Can you give me a quote",
      "What's your price range",
      "Do you accept insurance",
      "What payment methods do you accept",
      "Is there a deposit required",
      "Are there any hidden fees"
    ]
  },
  {
    id: "emergency",
    name: "Emergency",
    description: "Urgent situations requiring immediate attention",
    industry: "all",
    isCommon: true,
    sampleUtterances: [
      "This is an emergency",
      "I need help right away",
      "Something is seriously wrong",
      "I need immediate assistance",
      "This can't wait",
      "I have an urgent situation",
      "I need someone to come now",
      "This is a critical issue",
      "I have a serious problem",
      "I need help ASAP"
    ]
  }
];

// Industry-specific intents
const industryIntents: Record<string, IntentTemplate[]> = {
  // Plumbing
  plumbing: [
    {
      id: "leak",
      name: "PlumbingLeak",
      description: "Water leak emergencies",
      industry: "plumbing",
      isCommon: false,
      sampleUtterances: [
        "I have a water leak",
        "My pipe is leaking",
        "There's water coming from under the sink",
        "My ceiling has water damage",
        "I have a burst pipe",
        "My faucet won't stop dripping",
        "There's water all over my floor",
        "My water heater is leaking",
        "The toilet is overflowing",
        "Water is coming through the walls"
      ]
    },
    {
      id: "clog",
      name: "DrainClog",
      description: "Clogged drains and pipes",
      industry: "plumbing",
      isCommon: false,
      sampleUtterances: [
        "My drain is clogged",
        "The toilet won't flush",
        "My sink is backing up",
        "Water isn't draining",
        "I need a drain unclogged",
        "My bathtub won't drain",
        "I have a blocked pipe",
        "Sewage is backing up",
        "My garbage disposal is clogged",
        "The shower drain is slow"
      ]
    },
    {
      id: "installation",
      name: "PlumbingInstallation",
      description: "Installing new fixtures or appliances",
      industry: "plumbing",
      isCommon: false,
      sampleUtterances: [
        "I need a new toilet installed",
        "Can you install a dishwasher",
        "I want to replace my sink",
        "I need a water heater installation",
        "Can you install a garbage disposal",
        "I'm renovating my bathroom",
        "I need new pipes installed",
        "Can you hook up my washing machine",
        "I need a shower installed",
        "Can you install a water filtration system"
      ]
    }
  ],
  
  // HVAC
  hvac: [
    {
      id: "no_heat",
      name: "NoHeat",
      description: "Heating system not working",
      industry: "hvac",
      isCommon: false,
      sampleUtterances: [
        "My heat isn't working",
        "The furnace won't turn on",
        "My house is too cold",
        "The heating system is broken",
        "My thermostat isn't working",
        "The radiator is cold",
        "My boiler isn't working",
        "The pilot light is out",
        "No warm air is coming out",
        "My heat pump isn't working"
      ]
    },
    {
      id: "no_cooling",
      name: "NoCooling",
      description: "Air conditioning not working",
      industry: "hvac",
      isCommon: false,
      sampleUtterances: [
        "My AC isn't working",
        "The air conditioner is broken",
        "My house is too hot",
        "No cool air is coming out",
        "My central air isn't working",
        "The AC is making a strange noise",
        "My cooling system stopped working",
        "The air conditioner is leaking",
        "My home isn't cooling down",
        "The AC is blowing warm air"
      ]
    },
    {
      id: "maintenance",
      name: "HVACMaintenance",
      description: "Regular maintenance and tune-ups",
      industry: "hvac",
      isCommon: false,
      sampleUtterances: [
        "I need my HVAC serviced",
        "Time for regular maintenance",
        "Can you do a furnace tune-up",
        "I need my AC checked",
        "I need my air filters changed",
        "My system needs cleaning",
        "I want to schedule regular maintenance",
        "My system needs inspection",
        "Can you do preventative maintenance",
        "I need my ducts cleaned"
      ]
    }
  ],
  
  // Dental
  dental: [
    {
      id: "toothache",
      name: "ToothPain",
      description: "Tooth pain or dental emergencies",
      industry: "dental",
      isCommon: false,
      sampleUtterances: [
        "I have a terrible toothache",
        "My tooth is killing me",
        "I have pain in my mouth",
        "My filling fell out",
        "I chipped my tooth",
        "I have a dental emergency",
        "My crown came off",
        "I have a swollen jaw",
        "I'm in severe dental pain",
        "My gums are bleeding"
      ]
    },
    {
      id: "cleaning",
      name: "DentalCleaning",
      description: "Routine dental cleaning",
      industry: "dental",
      isCommon: false,
      sampleUtterances: [
        "I need a teeth cleaning",
        "Time for my regular cleaning",
        "I need a dental checkup",
        "I need a dental exam",
        "I want to schedule a cleaning",
        "It's time for my six-month cleaning",
        "I need a routine dental visit",
        "I need a dental hygienist appointment",
        "I want my teeth cleaned",
        "I need a dental check-up"
      ]
    },
    {
      id: "cosmetic",
      name: "CosmeticDental",
      description: "Cosmetic dental procedures",
      industry: "dental",
      isCommon: false,
      sampleUtterances: [
        "I'm interested in teeth whitening",
        "I want to get veneers",
        "Can I get Invisalign",
        "I want to improve my smile",
        "I need cosmetic dentistry",
        "Can you fix my crooked teeth",
        "I want to discuss smile makeover options",
        "Do you do dental bonding",
        "I'm interested in porcelain crowns",
        "I want to fix a gap in my teeth"
      ]
    }
  ],
  
  // Salon
  salon: [
    {
      id: "haircut",
      name: "Haircut",
      description: "Haircut services",
      industry: "salon",
      isCommon: false,
      sampleUtterances: [
        "I need a haircut",
        "I want to get my hair trimmed",
        "Do you have time for a quick cut",
        "I need a men's haircut",
        "I need a women's haircut",
        "Can I get a children's haircut",
        "I want to change my hairstyle",
        "I need a cut and style",
        "I need a bang trim",
        "How much for a basic haircut"
      ]
    },
    {
      id: "color",
      name: "HairColor",
      description: "Hair coloring services",
      industry: "salon",
      isCommon: false,
      sampleUtterances: [
        "I want to color my hair",
        "I need my roots touched up",
        "I'm interested in highlights",
        "Can I get balayage",
        "I want to go blonde",
        "I need a color correction",
        "I want to change my hair color",
        "Do you do ombre",
        "I need my gray covered",
        "How much for full color"
      ]
    },
    {
      id: "nails",
      name: "NailServices",
      description: "Manicure and pedicure services",
      industry: "salon",
      isCommon: false,
      sampleUtterances: [
        "I need a manicure",
        "I want to get a pedicure",
        "Do you do gel nails",
        "I need a nail fill",
        "Can I get acrylic nails",
        "I need a polish change",
        "Do you offer nail art",
        "I want to get dip powder nails",
        "I need a nail repair",
        "How much for a mani-pedi"
      ]
    }
  ],
  
  // Auto repair
  automotive: [
    {
      id: "check_engine",
      name: "CheckEngine",
      description: "Check engine light or diagnostic services",
      industry: "automotive",
      isCommon: false,
      sampleUtterances: [
        "My check engine light is on",
        "I need diagnostic service",
        "My car is giving me a warning light",
        "Can you check what's wrong with my car",
        "I need to know why my engine light is on",
        "My car needs a computer scan",
        "I need a diagnostic check",
        "My car is showing error codes",
        "Something's wrong with my engine",
        "My dashboard has a warning symbol"
      ]
    },
    {
      id: "maintenance",
      name: "CarMaintenance",
      description: "Routine car maintenance",
      industry: "automotive",
      isCommon: false,
      sampleUtterances: [
        "I need an oil change",
        "Time for my regular maintenance",
        "I need a tune-up",
        "Can you rotate my tires",
        "I need a brake inspection",
        "My car needs service",
        "It's time for my scheduled maintenance",
        "I need a filter change",
        "Can you check my fluids",
        "I need regular maintenance done"
      ]
    },
    {
      id: "repair",
      name: "CarRepair",
      description: "Car repair services",
      industry: "automotive",
      isCommon: false,
      sampleUtterances: [
        "My car won't start",
        "My brakes are squeaking",
        "My transmission is slipping",
        "I hear a strange noise",
        "My car is overheating",
        "The AC isn't working in my car",
        "My car is stalling",
        "I need new tires",
        "My car is leaking fluid",
        "Something's wrong with my steering"
      ]
    }
  ]
};

/**
 * Get all common intents for any business type
 */
export function getCommonIntents(): IntentTemplate[] {
  return [...commonIntents];
}

/**
 * Get industry-specific intents for a particular business type
 * 
 * @param industry The business industry/type
 * @returns Array of intent templates specific to the industry
 */
export function getIndustryIntents(industry: string): IntentTemplate[] {
  const lowerIndustry = industry.toLowerCase();
  
  // Return industry-specific intents if available
  if (lowerIndustry in industryIntents) {
    return [...industryIntents[lowerIndustry]];
  }
  
  // If no specific intents for this industry, return empty array
  return [];
}

/**
 * Get all intent templates for a business type
 * Combines common intents and industry-specific intents
 * 
 * @param industry The business industry/type
 * @returns Complete array of intent templates
 */
export function getAllIntentTemplates(industry: string = 'general'): IntentTemplate[] {
  const common = getCommonIntents();
  const industrySpecific = getIndustryIntents(industry);
  
  return [...common, ...industrySpecific];
}

/**
 * Get all available industry types
 * 
 * @returns Array of industry types
 */
export function getAvailableIndustryTypes(): string[] {
  return ['general', ...Object.keys(industryIntents)];
}

/**
 * Convert an intent template to a Lex intent format
 * 
 * @param template Intent template
 * @returns Lex intent format
 */
export function templateToBotIntent(template: IntentTemplate): BotIntent {
  return {
    name: template.name,
    description: template.description,
    sampleUtterances: template.sampleUtterances
  };
}

export default {
  getCommonIntents,
  getIndustryIntents,
  getAllIntentTemplates,
  getAvailableIndustryTypes,
  templateToBotIntent
};