/**
 * GPS Live Dispatch plan + industry gate middleware.
 *
 * Two-layer gating:
 *   1. Industry gate — only field-service verticals (HVAC, plumbing, electrical,
 *      landscaping, etc.) can use GPS tracking. Barbers, salons, dentists,
 *      restaurants are blocked. Uses shared/industry-categories#isJobCategory.
 *   2. Plan gate — Growth+ (legacy: Professional/Business) required.
 *      Free, starter, trialing-without-plan all blocked.
 *
 * Admin role + founder accounts bypass both gates (consistent with other
 * paywalled features: websiteBuilderRoutes, gbpRoutes, leadDiscoveryRoutes).
 *
 * Fails open on transient DB errors — never block paying customers due to
 * Neon hiccup. Matches existing `requirePaidPlan` and `requirePaymentMethod`
 * fail-open posture throughout the codebase.
 *
 * Use AFTER `isAuthenticated`. Returns 402 (plan) or 403 (industry) on block.
 */

import { Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { businesses } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { isJobCategory } from '@shared/industry-categories';
import { getUsageInfo } from '../services/usageService';

// Accepted plan tiers. Includes legacy names ('professional', 'business') for
// customers grandfathered before the Growth/Pro renaming. Founder + admin
// bypass below this check entirely.
const ALLOWED_GPS_TIERS = new Set(['growth', 'pro', 'professional', 'business', 'founder']);

/**
 * Resolve the maximum retention hours owner can configure for a given plan tier.
 * Returned as a number; UI uses this to cap the retention slider.
 */
export function getGpsRetentionMaxHours(planTier: string | null | undefined): number {
  if (!planTier) return 0;
  const t = planTier.toLowerCase();
  if (t === 'pro' || t === 'business' || t === 'founder') return 168; // 7 days
  if (t === 'growth' || t === 'professional') return 24;
  return 0;
}

export async function requireGpsPlan(req: Request, res: Response, next: NextFunction) {
  // Admin bypass — consistent with other paywall middlewares
  if (req.user?.role === 'admin') return next();

  const businessId = req.user?.businessId;
  if (!businessId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const [business] = await db.select().from(businesses).where(eq(businesses.id, businessId));
    if (!business) {
      return res.status(404).json({ error: 'Business not found' });
    }

    // Industry gate FIRST — barbers/salons/dentists/restaurants blocked
    // regardless of plan. GPS tracking only makes sense for field service.
    if (!isJobCategory(business.industry)) {
      return res.status(403).json({
        code: 'GPS_NOT_AVAILABLE_FOR_INDUSTRY',
        message: 'Live Dispatch is only available for field-service businesses (HVAC, plumbing, electrical, landscaping, etc.)',
        industry: business.industry,
      });
    }

    // Plan gate — resolve tier via usageService (single source of truth)
    const usage = await getUsageInfo(businessId);
    const tier = (usage.planTier || '').toLowerCase();

    if (!ALLOWED_GPS_TIERS.has(tier)) {
      return res.status(402).json({
        code: 'GPS_PLAN_REQUIRED',
        upgradeUrl: '/settings?tab=subscription',
        currentTier: tier,
        requiredTier: 'growth',
        message: 'Live Dispatch requires Growth plan or higher.',
      });
    }

    // Phased-rollout gate — admin must approve this business for Live Dispatch.
    // Lets us roll out to one customer at a time during beta and yank access
    // selectively without affecting other tenants if a bug ships.
    if (!business.gpsBetaApproved) {
      return res.status(403).json({
        code: 'GPS_BETA_NOT_APPROVED',
        message: 'Live Dispatch is in limited beta. Contact support to request access.',
      });
    }

    // Master toggle — owner must explicitly enable
    if (!business.gpsTrackingEnabled) {
      return res.status(403).json({
        code: 'GPS_NOT_ENABLED',
        message: 'Live Dispatch is not enabled. Turn it on in Settings.',
        settingsUrl: '/settings?tab=dispatch',
      });
    }

    // Feature kill switch
    if (process.env.GPS_FEATURE_ENABLED === 'false') {
      return res.status(501).json({
        code: 'GPS_FEATURE_DISABLED',
        message: 'Live Dispatch is temporarily unavailable.',
      });
    }

    next();
  } catch (err) {
    console.error('[gpsPlanGate] Error checking GPS eligibility:', err);
    // Fail open — don't block legit paying customers due to transient DB error
    next();
  }
}

/**
 * Lighter gate used by the Settings UI: blocks at plan + industry levels
 * but NOT on `gpsTrackingEnabled` (since the setting may be off — owner needs
 * to be able to turn it on). Use this on Settings routes.
 */
export async function requireGpsPlanForSettings(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role === 'admin') return next();
  const businessId = req.user?.businessId;
  if (!businessId) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const [business] = await db.select().from(businesses).where(eq(businesses.id, businessId));
    if (!business) return res.status(404).json({ error: 'Business not found' });

    if (!isJobCategory(business.industry)) {
      return res.status(403).json({
        code: 'GPS_NOT_AVAILABLE_FOR_INDUSTRY',
        message: 'Live Dispatch is only available for field-service businesses.',
        industry: business.industry,
      });
    }

    const usage = await getUsageInfo(businessId);
    const tier = (usage.planTier || '').toLowerCase();
    if (!ALLOWED_GPS_TIERS.has(tier)) {
      return res.status(402).json({
        code: 'GPS_PLAN_REQUIRED',
        upgradeUrl: '/settings?tab=subscription',
        currentTier: tier,
        requiredTier: 'growth',
        message: 'Live Dispatch requires Growth plan or higher.',
      });
    }

    // Phased-rollout gate — admin must approve. Settings tab stays hidden
    // until approved.
    if (!business.gpsBetaApproved) {
      return res.status(403).json({
        code: 'GPS_BETA_NOT_APPROVED',
        message: 'Live Dispatch is in limited beta. Contact support to request access.',
      });
    }

    next();
  } catch (err) {
    console.error('[gpsPlanGate.settings] Error:', err);
    next();
  }
}
