/**
 * Shared industry category utility — single source of truth for client + server.
 * Determines whether a business is a "job-category" (field service / blue-collar)
 * vs "appointment-category" (chair-based / office visit).
 *
 * Job-category businesses see Jobs as their primary scheduling tab.
 * Appointment-category businesses see Appointments.
 */

// Industries where "Jobs" is the primary scheduling concept
const JOB_INDUSTRIES = [
  'hvac',
  'plumbing',
  'electrical',
  'landscaping',
  'construction',
  'pest control',
  'roofing',
  'painting',
  'automotive',
  'cleaning',
];

export type IndustryCategory = 'appointment' | 'job';

/**
 * Determine whether a business industry falls into the "job" category.
 * Uses partial matching (e.g., "HVAC / Plumbing" matches "hvac").
 */
export function isJobCategory(industry: string | null | undefined): boolean {
  if (!industry) return false;
  const lower = industry.toLowerCase();
  return JOB_INDUSTRIES.some(ind => lower.includes(ind));
}

/**
 * Get the category for a given industry string.
 */
export function getIndustryCategory(industry: string | null | undefined): IndustryCategory {
  return isJobCategory(industry) ? 'job' : 'appointment';
}
