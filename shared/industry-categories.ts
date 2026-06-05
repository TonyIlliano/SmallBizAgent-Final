/**
 * Shared industry category utility — single source of truth for client + server.
 * Determines whether a business is a "job-category" (field service / blue-collar)
 * vs "appointment-category" (chair-based / office visit).
 *
 * Job-category businesses see Jobs as their primary scheduling tab.
 * Appointment-category businesses see Appointments.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * RELATIONSHIP TO THE INDUSTRY CAPABILITY MATRIX
 *
 * The Industry Capability Matrix (shared/industry-config.ts) is the new
 * declarative source of truth for ALL industry-specific behavior — booking
 * flow, membership support, equipment tracking, AI receptionist style, etc.
 *
 * This file (isJobCategory) intentionally preserves its EXACT pre-roadmap
 * substring-match behavior as a legacy stability contract. The Capability
 * Matrix is more aggressive — it recognizes aliases ("Auto Repair Shop" →
 * automotive) that the legacy list did not. Both are correct for their
 * respective contracts:
 *
 *   isJobCategory()        — preserves legacy behavior byte-for-byte so
 *                            no existing call site (Sidebar, BottomNav,
 *                            schedule-router, Jobs page, Settings tabs,
 *                            GPS plan gate) changes behavior.
 *
 *   getIndustryConfig()    — the smarter resolver used by all new features
 *                            from the HVAC-first roadmap forward.
 *
 * New code should call getIndustryConfig() directly. This file exists
 * solely to keep existing call sites stable.
 */

// Industries where "Jobs" is the primary scheduling concept.
// LEGACY LIST — preserved exactly as it shipped before the Industry Capability
// Matrix landed. Do not modify; new industry behavior goes in industry-config.ts.
const JOB_INDUSTRIES = [
  "hvac",
  "plumbing",
  "electrical",
  "landscaping",
  "construction",
  "pest control",
  "roofing",
  "painting",
  "automotive",
  "cleaning",
];

export type IndustryCategory = "appointment" | "job";

/**
 * Determine whether a business industry falls into the "job" category.
 * Uses partial matching (e.g., "HVAC / Plumbing" matches "hvac").
 *
 * Behavior preserved byte-for-byte from the pre-roadmap implementation.
 * Verified by regression test in shared/industry-config.test.ts.
 */
export function isJobCategory(industry: string | null | undefined): boolean {
  if (!industry) return false;
  const lower = industry.toLowerCase();
  return JOB_INDUSTRIES.some((ind) => lower.includes(ind));
}

/**
 * Get the category for a given industry string.
 */
export function getIndustryCategory(
  industry: string | null | undefined,
): IndustryCategory {
  return isJobCategory(industry) ? "job" : "appointment";
}
