/**
 * GPS Live Dispatch — tech disclosure & consent service.
 *
 * Drives the consent modal shown to techs before any tracking session starts.
 * Three triggers for re-prompt:
 *   1. Tech has never accepted (gpsConsentAcceptedAt is null)
 *   2. Owner bumped the disclosure copy (version mismatch)
 *   3. >90 days since last acceptance (CYA model — even if version unchanged)
 *
 * Check is LAZY — only runs when a tech tries to start a session.
 * No background job. Dormant accounts don't get polled.
 *
 * Default disclosure copy includes state-law awareness (CA, CT, DE, NY, TX,
 * WA, IL all require some form of written consent for employee location
 * tracking). Owner can override per business via gpsDisclosureCopy column.
 */

import { db } from "../db";
import { businesses, staff } from "@shared/schema";
import { eq } from "drizzle-orm";

export const DEFAULT_DISCLOSURE_VERSION = '2026-05-24';
export const CONSENT_REPROMPT_AFTER_DAYS = 90;

export const DEFAULT_DISCLOSURE_COPY = `Location Tracking Notice

By tapping Accept, you consent to {businessName} recording your GPS location
while you are on the clock for the purpose of dispatch coordination, customer
ETA notifications, and route optimization.

• Your location is recorded only during active tracking sessions you start.
• You can pause tracking at any time from your device.
• Location data is retained for {retentionHours} hours and then automatically
  deleted.
• Customer-facing share links expire after 4 hours by default.
• You can revoke consent at any time by contacting your manager.

Some US states (CA, CT, DE, NY, TX, WA, IL, and others) require written
consent for employee location tracking. By accepting, you confirm you have
reviewed your employer's location tracking policy.`;

export interface ActiveDisclosure {
  copy: string;        // template with {businessName} / {retentionHours} placeholders
  rendered: string;    // fully substituted copy ready for display
  version: string;
  isCustom: boolean;
}

export interface ReacceptanceCheck {
  required: boolean;
  reason: 'version_mismatch' | 'expired_90_days' | 'never_accepted' | null;
  staleSince?: Date;
  daysSinceAcceptance?: number;
}

/**
 * Render the disclosure template with business-specific substitutions.
 */
export function renderDisclosure(
  template: string,
  vars: { businessName: string; retentionHours: number }
): string {
  return template
    .replace(/\{businessName\}/g, vars.businessName)
    .replace(/\{retentionHours\}/g, String(vars.retentionHours));
}

/**
 * Get the active disclosure for a business. Returns custom copy if set,
 * else default. Always returns a rendered (substituted) version too.
 */
export async function getActiveDisclosure(businessId: number): Promise<ActiveDisclosure> {
  const [business] = await db.select().from(businesses).where(eq(businesses.id, businessId));
  if (!business) {
    return {
      copy: DEFAULT_DISCLOSURE_COPY,
      rendered: renderDisclosure(DEFAULT_DISCLOSURE_COPY, { businessName: 'your employer', retentionHours: 24 }),
      version: DEFAULT_DISCLOSURE_VERSION,
      isCustom: false,
    };
  }

  const copy = business.gpsDisclosureCopy || DEFAULT_DISCLOSURE_COPY;
  const version = business.gpsDisclosureVersion || DEFAULT_DISCLOSURE_VERSION;
  const rendered = renderDisclosure(copy, {
    businessName: business.name,
    retentionHours: business.gpsRetentionHours ?? 24,
  });

  return {
    copy,
    rendered,
    version,
    isCustom: !!business.gpsDisclosureCopy,
  };
}

/**
 * Decide whether a tech needs to re-accept the disclosure before starting
 * a session. Pure function — no DB calls. Pass in pre-loaded staff + business.
 *
 * Returns ReacceptanceCheck with `required: true` if ANY of:
 *   1. staff.gpsConsentAcceptedAt is null (never accepted)
 *   2. staff.gpsConsentVersion !== business.gpsDisclosureVersion (owner bumped)
 *   3. staff.gpsConsentAcceptedAt is older than 90 days
 */
export function needsTechReAcceptance(
  staffRow: { gpsConsentAcceptedAt: Date | null; gpsConsentVersion: string | null },
  business: { gpsDisclosureVersion: string | null }
): ReacceptanceCheck {
  // Case 1 — never accepted
  if (!staffRow.gpsConsentAcceptedAt) {
    return { required: true, reason: 'never_accepted' };
  }

  const businessVersion = business.gpsDisclosureVersion || DEFAULT_DISCLOSURE_VERSION;
  const staffVersion = staffRow.gpsConsentVersion;

  // Case 2 — owner bumped the copy
  if (staffVersion !== businessVersion) {
    return { required: true, reason: 'version_mismatch', staleSince: staffRow.gpsConsentAcceptedAt };
  }

  // Case 3 — older than 90 days
  const acceptedAt = staffRow.gpsConsentAcceptedAt instanceof Date
    ? staffRow.gpsConsentAcceptedAt
    : new Date(staffRow.gpsConsentAcceptedAt);
  const ageMs = Date.now() - acceptedAt.getTime();
  const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
  if (ageDays >= CONSENT_REPROMPT_AFTER_DAYS) {
    return {
      required: true,
      reason: 'expired_90_days',
      staleSince: acceptedAt,
      daysSinceAcceptance: ageDays,
    };
  }

  return { required: false, reason: null };
}

/**
 * Record a tech's acceptance of the current disclosure version.
 * Stamps gpsConsentAcceptedAt = now AND gpsConsentVersion = passed version.
 * Caller should pass the version that was active when the dialog was shown
 * (handles the race where owner bumps version between show and accept).
 */
export async function recordTechAcceptance(
  staffId: number,
  businessId: number,
  version: string
): Promise<void> {
  await db.update(staff)
    .set({
      gpsConsentAcceptedAt: new Date(),
      gpsConsentVersion: version,
      gpsTrackingPaused: false, // fresh acceptance clears any prior pause
    })
    .where(eq(staff.id, staffId));
  // Note: We don't filter by businessId in WHERE because staff.businessId is
  // the source of truth and we validate in the caller. This update is safe
  // because we only set GPS-related fields.
  void businessId;
}

/**
 * Bump the disclosure version. Used when owner edits gpsDisclosureCopy
 * via Settings. New version = today's ISO date. Forces all techs to re-accept.
 *
 * Returns the new version string.
 */
export async function bumpDisclosureVersion(
  businessId: number,
  newCopy: string | null
): Promise<{ version: string }> {
  const today = new Date().toISOString().split('T')[0]; // 'YYYY-MM-DD'
  await db.update(businesses)
    .set({
      gpsDisclosureCopy: newCopy,
      gpsDisclosureVersion: today,
    })
    .where(eq(businesses.id, businessId));
  return { version: today };
}

/**
 * Owner-triggered revoke: clears a single tech's consent so they MUST
 * re-accept before their next session. Used in Settings → Tech consent table.
 */
export async function revokeTechConsent(
  staffId: number,
  businessId: number
): Promise<void> {
  await db.update(staff)
    .set({
      gpsConsentAcceptedAt: null,
      gpsConsentVersion: null,
    })
    .where(eq(staff.id, staffId));
  void businessId;
}
