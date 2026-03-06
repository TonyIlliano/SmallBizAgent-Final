/**
 * Competitive Intelligence Agent
 *
 * Runs every 7 days. Since we can't scrape competitor sites in a scheduler,
 * this agent tracks INTERNAL competitive signals:
 *
 * 1. Cancellation reasons: Analyze recently canceled businesses' patterns
 * 2. Feature gap analysis: Which features are most requested (proxy: which setup steps have lowest completion)
 * 3. Industry coverage: Which industries have the most/least businesses
 * 4. Pricing competitiveness: Average revenue per business vs plan price (are people choosing cheapest?)
 *
 * agentType: 'platform:competitive_intel'
 * action: 'analysis_completed'
 * details: {
 *   cancellationInsights: { recentCancellations: number, commonPatterns: [...] },
 *   featureGapAnalysis: { lowestAdoption: [...features] },
 *   industryAnalysis: { topIndustries: [...], underserved: [...] },
 *   pricingInsights: { avgRevenuePerBusiness, mostPopularPlan, recommendation }
 * }
 */

import { db } from "../../db";
import { eq, sql, gte, and, desc, isNotNull } from "drizzle-orm";
import { businesses, users, callLogs, appointments, customers, subscriptionPlans } from "../../../shared/schema";
import { logAgentAction } from "../agentActivityService";

const AGENT_TYPE = 'platform:competitive_intel';

interface CancellationInsights {
  recentCancellations: number;
  commonPatterns: {
    pattern: string;
    count: number;
  }[];
}

interface FeatureAdoption {
  feature: string;
  adoptionPercent: number;
  totalActive: number;
  adopted: number;
}

interface FeatureGapAnalysis {
  lowestAdoption: FeatureAdoption[];
}

interface IndustryEntry {
  industry: string;
  count: number;
}

interface IndustryAnalysis {
  topIndustries: IndustryEntry[];
  underserved: IndustryEntry[];
  totalWithIndustry: number;
  totalWithoutIndustry: number;
}

interface PricingInsights {
  avgRevenuePerBusiness: number;
  mostPopularPlan: string | null;
  planDistribution: { plan: string; count: number; percentage: number }[];
  recommendation: string;
}

interface CompetitiveIntelResult {
  cancellationInsights: CancellationInsights;
  featureGapAnalysis: FeatureGapAnalysis;
  industryAnalysis: IndustryAnalysis;
  pricingInsights: PricingInsights;
}

/**
 * Analyze recently canceled businesses to find patterns.
 */
async function analyzeCancellations(): Promise<CancellationInsights> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Find businesses that canceled in the last 30 days
  const canceledBusinesses = await db
    .select({
      id: businesses.id,
      name: businesses.name,
      type: businesses.type,
      industry: businesses.industry,
      twilioPhoneNumber: businesses.twilioPhoneNumber,
      bookingEnabled: businesses.bookingEnabled,
      callForwardingEnabled: businesses.callForwardingEnabled,
      receptionistEnabled: businesses.receptionistEnabled,
      subscriptionPlanId: businesses.subscriptionPlanId,
      createdAt: businesses.createdAt,
      subscriptionEndDate: businesses.subscriptionEndDate,
    })
    .from(businesses)
    .where(
      and(
        eq(businesses.subscriptionStatus, 'canceled'),
        gte(businesses.subscriptionEndDate, thirtyDaysAgo),
      )
    );

  const recentCancellations = canceledBusinesses.length;
  const patterns: Record<string, number> = {};

  for (const biz of canceledBusinesses) {
    // Analyze what was NOT set up (possible reasons for churn)
    if (!biz.twilioPhoneNumber) {
      patterns['No phone number provisioned'] = (patterns['No phone number provisioned'] || 0) + 1;
    }
    if (!biz.bookingEnabled) {
      patterns['Booking never enabled'] = (patterns['Booking never enabled'] || 0) + 1;
    }
    if (!biz.callForwardingEnabled) {
      patterns['Call forwarding not set up'] = (patterns['Call forwarding not set up'] || 0) + 1;
    }
    if (!biz.receptionistEnabled) {
      patterns['Receptionist disabled'] = (patterns['Receptionist disabled'] || 0) + 1;
    }

    // Check account age at cancellation
    if (biz.createdAt && biz.subscriptionEndDate) {
      const ageDays = Math.floor(
        (new Date(biz.subscriptionEndDate).getTime() - new Date(biz.createdAt).getTime()) / (1000 * 60 * 60 * 24)
      );
      if (ageDays <= 14) {
        patterns['Canceled within first 2 weeks'] = (patterns['Canceled within first 2 weeks'] || 0) + 1;
      } else if (ageDays <= 30) {
        patterns['Canceled within first month'] = (patterns['Canceled within first month'] || 0) + 1;
      }
    }

    // Check if they had low call volume (may not have seen value)
    const callCount = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(callLogs)
      .where(eq(callLogs.businessId, biz.id));

    if ((callCount[0]?.count ?? 0) < 5) {
      patterns['Very low call volume (< 5 total calls)'] = (patterns['Very low call volume (< 5 total calls)'] || 0) + 1;
    }
  }

  // Sort patterns by frequency
  const commonPatterns = Object.entries(patterns)
    .map(([pattern, count]) => ({ pattern, count }))
    .sort((a, b) => b.count - a.count);

  return { recentCancellations, commonPatterns };
}

/**
 * Analyze feature adoption rates across all active businesses.
 */
async function analyzeFeatureAdoption(): Promise<FeatureGapAnalysis> {
  const activeBusinesses = await db
    .select({
      id: businesses.id,
      twilioPhoneNumber: businesses.twilioPhoneNumber,
      callForwardingEnabled: businesses.callForwardingEnabled,
      bookingEnabled: businesses.bookingEnabled,
      bookingSlug: businesses.bookingSlug,
      receptionistEnabled: businesses.receptionistEnabled,
      vapiAssistantId: businesses.vapiAssistantId,
      website: businesses.website,
      industry: businesses.industry,
      stripeConnectAccountId: businesses.stripeConnectAccountId,
      birthdayCampaignEnabled: businesses.birthdayCampaignEnabled,
      inventoryAlertsEnabled: businesses.inventoryAlertsEnabled,
      reservationEnabled: businesses.reservationEnabled,
    })
    .from(businesses)
    .where(
      and(
        eq(businesses.isActive, true),
        eq(businesses.subscriptionStatus, 'active'),
      )
    );

  const total = activeBusinesses.length;
  if (total === 0) {
    return { lowestAdoption: [] };
  }

  // Calculate adoption for each key feature
  const features: FeatureAdoption[] = [
    {
      feature: 'Phone number provisioned',
      adopted: activeBusinesses.filter(b => !!b.twilioPhoneNumber).length,
      totalActive: total,
      adoptionPercent: 0,
    },
    {
      feature: 'Call forwarding enabled',
      adopted: activeBusinesses.filter(b => b.callForwardingEnabled).length,
      totalActive: total,
      adoptionPercent: 0,
    },
    {
      feature: 'Online booking enabled',
      adopted: activeBusinesses.filter(b => b.bookingEnabled).length,
      totalActive: total,
      adoptionPercent: 0,
    },
    {
      feature: 'Booking slug configured',
      adopted: activeBusinesses.filter(b => !!b.bookingSlug).length,
      totalActive: total,
      adoptionPercent: 0,
    },
    {
      feature: 'AI receptionist active',
      adopted: activeBusinesses.filter(b => b.receptionistEnabled && !!b.vapiAssistantId).length,
      totalActive: total,
      adoptionPercent: 0,
    },
    {
      feature: 'Website provided',
      adopted: activeBusinesses.filter(b => !!b.website).length,
      totalActive: total,
      adoptionPercent: 0,
    },
    {
      feature: 'Industry set',
      adopted: activeBusinesses.filter(b => !!b.industry).length,
      totalActive: total,
      adoptionPercent: 0,
    },
    {
      feature: 'Stripe Connect (payments)',
      adopted: activeBusinesses.filter(b => !!b.stripeConnectAccountId).length,
      totalActive: total,
      adoptionPercent: 0,
    },
    {
      feature: 'Birthday campaigns',
      adopted: activeBusinesses.filter(b => b.birthdayCampaignEnabled).length,
      totalActive: total,
      adoptionPercent: 0,
    },
    {
      feature: 'Inventory alerts',
      adopted: activeBusinesses.filter(b => b.inventoryAlertsEnabled).length,
      totalActive: total,
      adoptionPercent: 0,
    },
    {
      feature: 'Reservations enabled',
      adopted: activeBusinesses.filter(b => b.reservationEnabled).length,
      totalActive: total,
      adoptionPercent: 0,
    },
  ];

  // Calculate percentages
  for (const f of features) {
    f.adoptionPercent = Math.round((f.adopted / f.totalActive) * 100);
  }

  // Sort by lowest adoption and return the bottom features
  const lowestAdoption = features
    .sort((a, b) => a.adoptionPercent - b.adoptionPercent)
    .slice(0, 6);

  return { lowestAdoption };
}

/**
 * Analyze industry distribution across all businesses.
 */
async function analyzeIndustries(): Promise<IndustryAnalysis> {
  // Industries with businesses
  const industryGroups = await db
    .select({
      industry: businesses.industry,
      count: sql<number>`count(*)::int`,
    })
    .from(businesses)
    .where(
      and(
        eq(businesses.isActive, true),
        isNotNull(businesses.industry),
      )
    )
    .groupBy(businesses.industry)
    .orderBy(desc(sql`count(*)`));

  // Count businesses without an industry set
  const noIndustryResult = await db
    .select({
      count: sql<number>`count(*)::int`,
    })
    .from(businesses)
    .where(
      and(
        eq(businesses.isActive, true),
        sql`${businesses.industry} IS NULL OR ${businesses.industry} = ''`,
      )
    );

  const validIndustries = industryGroups.filter(
    g => g.industry && g.industry.trim().length > 0
  ) as { industry: string; count: number }[];

  const topIndustries = validIndustries.slice(0, 10);
  const underserved = validIndustries.length > 3
    ? validIndustries.slice(-3).reverse()
    : [];

  return {
    topIndustries,
    underserved,
    totalWithIndustry: validIndustries.reduce((sum, i) => sum + i.count, 0),
    totalWithoutIndustry: noIndustryResult[0]?.count ?? 0,
  };
}

/**
 * Analyze pricing data and plan distribution.
 */
async function analyzePricing(): Promise<PricingInsights> {
  // Get plan distribution among active businesses
  const planDistribution = await db
    .select({
      planId: businesses.subscriptionPlanId,
      count: sql<number>`count(*)::int`,
    })
    .from(businesses)
    .where(
      and(
        eq(businesses.isActive, true),
        eq(businesses.subscriptionStatus, 'active'),
        isNotNull(businesses.subscriptionPlanId),
      )
    )
    .groupBy(businesses.subscriptionPlanId)
    .orderBy(desc(sql`count(*)`));

  // Get plan details
  const plans = await db
    .select({
      id: subscriptionPlans.id,
      name: subscriptionPlans.name,
      price: subscriptionPlans.price,
      planTier: subscriptionPlans.planTier,
      stripePriceId: subscriptionPlans.stripePriceId,
    })
    .from(subscriptionPlans)
    .where(eq(subscriptionPlans.active, true));

  const planMap = new Map(plans.map(p => [p.stripePriceId, p]));

  const totalActiveBusinesses = planDistribution.reduce((sum, p) => sum + p.count, 0);

  // Calculate weighted average revenue
  let totalRevenue = 0;
  const distribution: { plan: string; count: number; percentage: number }[] = [];

  for (const entry of planDistribution) {
    const plan = entry.planId ? planMap.get(entry.planId) : null;
    const planName = plan?.name || entry.planId || 'Unknown';
    const planPrice = plan?.price || 0;

    totalRevenue += planPrice * entry.count;
    distribution.push({
      plan: planName,
      count: entry.count,
      percentage: totalActiveBusinesses > 0
        ? Math.round((entry.count / totalActiveBusinesses) * 100)
        : 0,
    });
  }

  const avgRevenuePerBusiness = totalActiveBusinesses > 0
    ? Math.round((totalRevenue / totalActiveBusinesses) * 100) / 100
    : 0;

  const mostPopularPlan = distribution.length > 0 ? distribution[0].plan : null;

  // Generate recommendation
  let recommendation = 'Insufficient data to generate pricing recommendation.';
  if (distribution.length > 0 && totalActiveBusinesses > 10) {
    const cheapestPlanPct = distribution[distribution.length - 1]?.percentage ?? 0;
    if (distribution[0]?.percentage > 60) {
      recommendation = `Most customers (${distribution[0].percentage}%) are on the "${distribution[0].plan}" plan. Consider whether higher-tier plans have enough differentiation to attract upgrades.`;
    } else if (cheapestPlanPct > 50) {
      recommendation = `Over half of customers are on the cheapest plan. Consider adding more value to mid-tier plans or introducing a more affordable entry plan to reduce churn.`;
    } else {
      recommendation = `Plan distribution is relatively balanced. Monitor upgrade/downgrade trends to optimize pricing tiers.`;
    }
  }

  return {
    avgRevenuePerBusiness,
    mostPopularPlan,
    planDistribution: distribution,
    recommendation,
  };
}

/**
 * Main entry point: run the Competitive Intelligence Agent.
 */
export async function runCompetitiveIntelAgent(): Promise<CompetitiveIntelResult> {
  console.log(`[${AGENT_TYPE}] Starting competitive intelligence analysis...`);

  // Run all analyses in parallel for efficiency
  const [cancellationInsights, featureGapAnalysis, industryAnalysis, pricingInsights] = await Promise.all([
    analyzeCancellations(),
    analyzeFeatureAdoption(),
    analyzeIndustries(),
    analyzePricing(),
  ]);

  const result: CompetitiveIntelResult = {
    cancellationInsights,
    featureGapAnalysis,
    industryAnalysis,
    pricingInsights,
  };

  // Log the full analysis report as a single entry
  await logAgentAction({
    businessId: 0,
    agentType: AGENT_TYPE,
    action: 'analysis_completed',
    details: result,
  });

  console.log(`[${AGENT_TYPE}] Analysis complete.`);
  console.log(`[${AGENT_TYPE}]   Cancellations (30d): ${cancellationInsights.recentCancellations}`);
  console.log(`[${AGENT_TYPE}]   Feature adoption gaps: ${featureGapAnalysis.lowestAdoption.map(f => `${f.feature} (${f.adoptionPercent}%)`).join(', ')}`);
  console.log(`[${AGENT_TYPE}]   Top industries: ${industryAnalysis.topIndustries.slice(0, 3).map(i => i.industry).join(', ')}`);
  console.log(`[${AGENT_TYPE}]   Avg revenue/business: $${pricingInsights.avgRevenuePerBusiness}`);

  return result;
}

export default { runCompetitiveIntelAgent };
