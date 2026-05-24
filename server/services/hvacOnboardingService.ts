/**
 * HVAC vertical onboarding helpers.
 *
 * Currently exports one function:
 *   - seedHvacKnowledgeBase(businessId): bulk-populates the business's
 *     knowledge base with HVAC-specific FAQs the AI receptionist can use to
 *     answer common caller questions out of the box.
 *
 * Wired into:
 *   - server/routes/expressSetupRoutes.ts (fire-and-forget after services are
 *     created during express onboarding)
 *   - server/routes/businessRoutes.ts (when industry is updated to HVAC)
 *   - server/routes/adminRoutes.ts (manual admin re-seed endpoint)
 *
 * Idempotent: if any entry with source='hvac_template' already exists for
 * the business, the seeder is a no-op. Owners can edit or delete seeded
 * entries freely; we never overwrite them.
 */

import { storage } from '../storage';
import { HVAC_KB_SEED, type HvacKbEntry } from '../data/hvacKnowledgeBase';

export interface SeedResult {
  seeded: number;
  skipped: boolean;
  reason?: string;
}

function applyPlaceholders(template: string, business: {
  name?: string | null;
  phone?: string | null;
  twilioPhoneNumber?: string | null;
  hoursSummary?: string;
}): string {
  const businessName = business.name || 'our team';
  // Prefer the public phone (what customers see); fall back to twilio.
  const businessPhone = business.phone || business.twilioPhoneNumber || 'us';
  const businessHours = business.hoursSummary || 'standard business hours';

  return template
    .replace(/\{businessName\}/g, businessName)
    .replace(/\{businessPhone\}/g, businessPhone)
    .replace(/\{businessHours\}/g, businessHours);
}

/**
 * Build a short human-readable hours summary like "Mon-Fri 8am-6pm".
 * Returns null if business hours can't be determined; the caller will fall
 * back to a generic phrase.
 */
async function buildHoursSummary(businessId: number): Promise<string | undefined> {
  try {
    const hours = await storage.getBusinessHours(businessId);
    if (!hours || hours.length === 0) return undefined;
    // Group consecutive days with the same schedule.
    const DAY_ABBR: Record<string, string> = {
      monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed', thursday: 'Thu',
      friday: 'Fri', saturday: 'Sat', sunday: 'Sun',
    };
    const ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const sorted = [...hours].sort(
      (a, b) => ORDER.indexOf((a.day || '').toLowerCase()) - ORDER.indexOf((b.day || '').toLowerCase())
    );
    const open = sorted.filter(h => !h.isClosed && h.open && h.close);
    if (open.length === 0) return undefined;
    // Keep it simple — just first open day + last open day + first open hours
    const first = open[0];
    const last = open[open.length - 1];
    const firstAbbr = DAY_ABBR[(first.day || '').toLowerCase()] || first.day;
    const lastAbbr = DAY_ABBR[(last.day || '').toLowerCase()] || last.day;
    if (firstAbbr === lastAbbr) {
      return `${firstAbbr} ${first.open}-${first.close}`;
    }
    return `${firstAbbr}-${lastAbbr} ${first.open}-${first.close}`;
  } catch {
    return undefined;
  }
}

/**
 * Seed HVAC FAQs into the business's knowledge base.
 *
 * @returns SeedResult — `seeded` count, `skipped` if entries already existed.
 *          Never throws on individual insert failures; partial seeds are
 *          counted accurately.
 */
export async function seedHvacKnowledgeBase(businessId: number): Promise<SeedResult> {
  if (!businessId || !Number.isFinite(businessId)) {
    return { seeded: 0, skipped: true, reason: 'invalid businessId' };
  }

  // Idempotency check: don't reseed if a previous run already populated entries.
  try {
    const existing = await storage.getBusinessKnowledge(businessId, { source: 'hvac_template' });
    if (existing && existing.length > 0) {
      console.log(`[HVAC] KB already seeded for business ${businessId} (${existing.length} entries) — skipping`);
      return { seeded: 0, skipped: true, reason: 'already seeded' };
    }
  } catch (err) {
    console.error(`[HVAC] KB idempotency check failed for business ${businessId}:`, err);
    // Continue — better to risk a duplicate than miss the seed entirely.
  }

  const business = await storage.getBusiness(businessId);
  if (!business) {
    return { seeded: 0, skipped: true, reason: 'business not found' };
  }

  const hoursSummary = await buildHoursSummary(businessId);
  const ctx = {
    name: business.name,
    phone: business.phone,
    twilioPhoneNumber: business.twilioPhoneNumber,
    hoursSummary,
  };

  let seeded = 0;
  for (const entry of HVAC_KB_SEED as HvacKbEntry[]) {
    try {
      await storage.createBusinessKnowledge({
        businessId,
        question: applyPlaceholders(entry.question, ctx),
        answer: applyPlaceholders(entry.answer, ctx),
        category: entry.category,
        source: 'hvac_template',
        isApproved: true,
        priority: entry.priority,
      });
      seeded++;
    } catch (err) {
      console.error(`[HVAC] Failed to seed KB entry "${entry.question.slice(0, 40)}" for business ${businessId}:`, err);
    }
  }

  console.log(`[HVAC] Seeded ${seeded}/${HVAC_KB_SEED.length} KB entries for business ${businessId}`);

  // Refresh the Retell agent so the AI prompt picks up the new KB entries.
  // Fire-and-forget — never block seeding on this.
  if (seeded > 0) {
    try {
      const { debouncedUpdateRetellAgent } = await import('./retellProvisioningService');
      debouncedUpdateRetellAgent(businessId);
    } catch (err) {
      console.error(`[HVAC] Failed to refresh Retell agent for business ${businessId}:`, err);
    }
  }

  return { seeded, skipped: false };
}

/**
 * Returns true if a business's industry string indicates HVAC.
 * Centralized so all callers (express onboarding, profile update, admin
 * trigger) use the same matching logic.
 */
export function isHvacIndustry(industry: string | null | undefined): boolean {
  if (!industry) return false;
  const lower = industry.toLowerCase();
  return (
    lower.includes('hvac') ||
    lower.includes('heating') ||
    lower.includes('cooling') ||
    lower.includes('air condition')
  );
}
