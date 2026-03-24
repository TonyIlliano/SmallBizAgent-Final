/**
 * Vertical SMS Configuration
 *
 * Industry-specific behavioral rules for AI-powered SMS generation.
 * These are static configs — no DB table needed. Changes are code deploys.
 *
 * Each vertical defines:
 * - Category (appointment/job/recurring) — determines scheduling behavior
 * - Rules — which marketing features are enabled
 * - Tone — how the AI should sound for this industry
 * - Constraints — max length, emoji policy
 */

export interface VerticalRules {
  hasStaffSpecificBooking: boolean;
  hasLateCancelProtection: boolean;
  lateCancelWindowHours: number;
  hasETAUpdates: boolean;
  hasWeatherDelays: boolean;
  hasWinBack: boolean;
  hasRebookingNudge: boolean;
  rebookingCycleDays: number;
  reservationOnly: boolean;
  hasBirthdayMessage: boolean;
  estimateFollowUp: boolean;
}

export interface VerticalConfig {
  id: string;
  displayName: string;
  category: 'appointment' | 'job' | 'recurring';
  rules: VerticalRules;
  defaultTone: string;
  defaultEmojiUsage: 'none' | 'occasional' | 'yes';
  defaultMaxLength: number;
  exampleVoice: string;
  /** Phrases the AI should NEVER use for this vertical */
  forbiddenPhrases: string[];
}

// ─── Vertical Definitions ────────────────────────────────────────────────────

const barbershop: VerticalConfig = {
  id: 'barbershop',
  displayName: 'Barbershop',
  category: 'appointment',
  rules: {
    hasStaffSpecificBooking: true,
    hasLateCancelProtection: false,
    lateCancelWindowHours: 0,
    hasETAUpdates: false,
    hasWeatherDelays: false,
    hasWinBack: true,
    hasRebookingNudge: true,
    rebookingCycleDays: 21,
    reservationOnly: false,
    hasBirthdayMessage: true,
    estimateFollowUp: false,
  },
  defaultTone: 'casual, warm, first-name basis, brief',
  defaultEmojiUsage: 'occasional',
  defaultMaxLength: 120,
  exampleVoice: 'sounds like the barber texted you personally',
  forbiddenPhrases: ['valued customer', 'per our records', 'kindly', 'please be advised', 'automated message', 'do not reply'],
};

const salon: VerticalConfig = {
  id: 'salon',
  displayName: 'Salon',
  category: 'appointment',
  rules: {
    hasStaffSpecificBooking: true,
    hasLateCancelProtection: true,
    lateCancelWindowHours: 24,
    hasETAUpdates: false,
    hasWeatherDelays: false,
    hasWinBack: true,
    hasRebookingNudge: true,
    rebookingCycleDays: 42,
    reservationOnly: false,
    hasBirthdayMessage: true,
    estimateFollowUp: false,
  },
  defaultTone: 'friendly, personal, slightly upscale',
  defaultEmojiUsage: 'yes',
  defaultMaxLength: 130,
  exampleVoice: 'sounds like your favorite stylist texted you',
  forbiddenPhrases: ['valued customer', 'per our records', 'kindly', 'please be advised', 'automated message', 'do not reply'],
};

const hvac: VerticalConfig = {
  id: 'hvac',
  displayName: 'HVAC',
  category: 'job',
  rules: {
    hasStaffSpecificBooking: false,
    hasLateCancelProtection: false,
    lateCancelWindowHours: 0,
    hasETAUpdates: true,
    hasWeatherDelays: false,
    hasWinBack: false,
    hasRebookingNudge: false,
    rebookingCycleDays: 0,
    reservationOnly: false,
    hasBirthdayMessage: false,
    estimateFollowUp: true,
  },
  defaultTone: 'professional, direct, time-focused',
  defaultEmojiUsage: 'none',
  defaultMaxLength: 140,
  exampleVoice: 'reliable local contractor who respects your time',
  forbiddenPhrases: ['valued customer', 'per our records', 'kindly', 'please be advised', 'automated message', 'do not reply'],
};

const plumbing: VerticalConfig = {
  id: 'plumbing',
  displayName: 'Plumbing',
  category: 'job',
  rules: {
    hasStaffSpecificBooking: false,
    hasLateCancelProtection: false,
    lateCancelWindowHours: 0,
    hasETAUpdates: true,
    hasWeatherDelays: false,
    hasWinBack: false,
    hasRebookingNudge: false,
    rebookingCycleDays: 0,
    reservationOnly: false,
    hasBirthdayMessage: false,
    estimateFollowUp: true,
  },
  defaultTone: 'no-nonsense, fast, reliable',
  defaultEmojiUsage: 'none',
  defaultMaxLength: 120,
  exampleVoice: 'family plumbing business that gets it done',
  forbiddenPhrases: ['valued customer', 'per our records', 'kindly', 'please be advised', 'automated message', 'do not reply'],
};

const landscaping: VerticalConfig = {
  id: 'landscaping',
  displayName: 'Landscaping',
  category: 'recurring',
  rules: {
    hasStaffSpecificBooking: false,
    hasLateCancelProtection: false,
    lateCancelWindowHours: 0,
    hasETAUpdates: false,
    hasWeatherDelays: true,
    hasWinBack: true,
    hasRebookingNudge: true,
    rebookingCycleDays: 7,
    reservationOnly: false,
    hasBirthdayMessage: false,
    estimateFollowUp: true,
  },
  defaultTone: 'friendly, neighborhood, low-touch',
  defaultEmojiUsage: 'none',
  defaultMaxLength: 120,
  exampleVoice: "your neighbor's lawn guy who always shows up",
  forbiddenPhrases: ['valued customer', 'per our records', 'kindly', 'please be advised', 'automated message', 'do not reply'],
};

const restaurant: VerticalConfig = {
  id: 'restaurant',
  displayName: 'Restaurant',
  category: 'recurring',
  rules: {
    hasStaffSpecificBooking: false,
    hasLateCancelProtection: false,
    lateCancelWindowHours: 0,
    hasETAUpdates: false,
    hasWeatherDelays: false,
    hasWinBack: false,
    hasRebookingNudge: false,
    rebookingCycleDays: 0,
    reservationOnly: true,
    hasBirthdayMessage: false,
    estimateFollowUp: false,
  },
  defaultTone: 'warm, welcoming, neighborhood',
  defaultEmojiUsage: 'occasional',
  defaultMaxLength: 130,
  exampleVoice: 'the owner picked up the phone and texted you personally',
  forbiddenPhrases: ['valued customer', 'per our records', 'kindly', 'please be advised', 'automated message', 'do not reply'],
};

// General fallback for unrecognized industries
const general: VerticalConfig = {
  id: 'general',
  displayName: 'General',
  category: 'appointment',
  rules: {
    hasStaffSpecificBooking: false,
    hasLateCancelProtection: false,
    lateCancelWindowHours: 0,
    hasETAUpdates: false,
    hasWeatherDelays: false,
    hasWinBack: true,
    hasRebookingNudge: true,
    rebookingCycleDays: 30,
    reservationOnly: false,
    hasBirthdayMessage: true,
    estimateFollowUp: false,
  },
  defaultTone: 'friendly, helpful, concise',
  defaultEmojiUsage: 'occasional',
  defaultMaxLength: 140,
  exampleVoice: 'a small business that cares about every customer',
  forbiddenPhrases: ['valued customer', 'per our records', 'kindly', 'please be advised', 'automated message', 'do not reply'],
};

// ─── Registry ────────────────────────────────────────────────────────────────

const VERTICALS: Record<string, VerticalConfig> = {
  barbershop,
  barber: barbershop,
  salon,
  'hair salon': salon,
  'beauty salon': salon,
  hvac,
  'heating & cooling': hvac,
  plumbing,
  plumber: plumbing,
  landscaping,
  'lawn care': landscaping,
  restaurant,
  dining: restaurant,
  general,
};

/**
 * Get the vertical config for a business based on its industry string.
 * Maps common industry names to the correct vertical. Falls back to 'general'.
 */
export function getVerticalConfig(industry: string | null | undefined): VerticalConfig {
  if (!industry) return general;
  const key = industry.toLowerCase().trim();

  // Direct match
  if (VERTICALS[key]) return VERTICALS[key];

  // Partial match (e.g., "Barber/Salon" contains "barber")
  for (const [verticalKey, config] of Object.entries(VERTICALS)) {
    if (key.includes(verticalKey) || verticalKey.includes(key)) {
      return config;
    }
  }

  // Industry-keyword mapping for express setup industries
  if (key.includes('electric')) return { ...general, id: 'electrical', displayName: 'Electrical', category: 'job', rules: { ...general.rules, hasETAUpdates: true, estimateFollowUp: true, hasWinBack: false, hasRebookingNudge: false, hasBirthdayMessage: false }, defaultTone: 'professional, reliable, safety-first', defaultEmojiUsage: 'none' };
  if (key.includes('clean')) return { ...general, id: 'cleaning', displayName: 'Cleaning', category: 'recurring', rules: { ...general.rules, hasWeatherDelays: false, hasRebookingNudge: true, rebookingCycleDays: 14 }, defaultTone: 'friendly, reliable, clean' };
  if (key.includes('dental') || key.includes('dentist')) return { ...general, id: 'dental', displayName: 'Dental', category: 'appointment', rules: { ...general.rules, hasStaffSpecificBooking: true, hasRebookingNudge: true, rebookingCycleDays: 180 }, defaultTone: 'warm, professional, reassuring', defaultMaxLength: 140 };
  if (key.includes('medical') || key.includes('doctor') || key.includes('health')) return { ...general, id: 'medical', displayName: 'Medical', category: 'appointment', rules: { ...general.rules, hasStaffSpecificBooking: true }, defaultTone: 'professional, caring, HIPAA-conscious', defaultMaxLength: 140 };
  if (key.includes('auto') || key.includes('mechanic') || key.includes('car')) return { ...general, id: 'automotive', displayName: 'Automotive', category: 'job', rules: { ...general.rules, hasETAUpdates: true, estimateFollowUp: true, hasWinBack: false, hasRebookingNudge: false, hasBirthdayMessage: false }, defaultTone: 'straightforward, honest, no-BS', defaultEmojiUsage: 'none' };
  if (key.includes('fitness') || key.includes('gym') || key.includes('yoga') || key.includes('personal train')) return { ...general, id: 'fitness', displayName: 'Fitness', category: 'appointment', rules: { ...general.rules, hasRebookingNudge: true, rebookingCycleDays: 7, hasBirthdayMessage: true }, defaultTone: 'motivating, energetic, supportive', defaultEmojiUsage: 'yes' };
  if (key.includes('vet') || key.includes('animal') || key.includes('pet')) return { ...general, id: 'veterinary', displayName: 'Veterinary', category: 'appointment', rules: { ...general.rules, hasStaffSpecificBooking: true, hasRebookingNudge: true, rebookingCycleDays: 365 }, defaultTone: 'warm, caring, pet-focused', defaultEmojiUsage: 'occasional' };
  if (key.includes('construct') || key.includes('roofing') || key.includes('flooring') || key.includes('paint') || key.includes('carpent')) return { ...general, id: 'construction', displayName: 'Construction', category: 'job', rules: { ...general.rules, hasETAUpdates: true, hasWeatherDelays: true, estimateFollowUp: true, hasWinBack: false, hasRebookingNudge: false, hasBirthdayMessage: false }, defaultTone: 'professional, project-focused, reliable', defaultEmojiUsage: 'none' };

  return general;
}

/**
 * Get all available vertical configs (for admin UI / selection dropdowns).
 */
export function getAllVerticals(): VerticalConfig[] {
  return [barbershop, salon, hvac, plumbing, landscaping, restaurant, general];
}

export default { getVerticalConfig, getAllVerticals };
