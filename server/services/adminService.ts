/**
 * Admin Service
 *
 * Provides platform-wide aggregation functions for the admin dashboard.
 * All functions query across all businesses — only callable by admin users.
 */

import { db } from "../db";
import { eq, sql, desc, isNotNull, and, gte, count as drizzleCount } from "drizzle-orm";
import {
  users,
  businesses,
  callLogs,
  appointments,
  subscriptionPlans,
  notificationLog,
} from "../../shared/schema";
import twilioService from "./twilioService";
import stripeService from "./stripeService";

// ── Types ───────────────────────────────────────────────────────────────

export interface PlatformStats {
  totalUsers: number;
  totalBusinesses: number;
  activePhoneNumbers: number;
  totalCalls: number;
  callsThisMonth: number;
  activeSubscriptions: number;
}

export interface AdminBusiness {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  type: string | null;
  industry: string | null;
  subscriptionStatus: string | null;
  twilioPhoneNumber: string | null;
  vapiAssistantId: string | null;
  createdAt: Date | null;
  ownerUsername: string | null;
  ownerEmail: string | null;
  callCount: number;
  appointmentCount: number;
}

export interface AdminUser {
  id: number;
  username: string;
  email: string;
  role: string | null;
  businessId: number | null;
  businessName: string | null;
  active: boolean | null;
  emailVerified: boolean | null;
  lastLogin: Date | null;
  createdAt: Date | null;
}

export interface RevenueData {
  mrr: number;
  activeCount: number;
  inactiveCount: number;
  trialingCount: number;
  pastDueCount: number;
  planDistribution: Array<{
    planTier: string | null;
    planName: string | null;
    price: number | null;
    businessCount: number;
  }>;
}

export interface ServiceStatus {
  name: string;
  status: "connected" | "not_configured" | "error";
  details?: string;
}

export interface SystemHealth {
  services: ServiceStatus[];
  serverInfo: {
    nodeVersion: string;
    uptime: number; // seconds
    environment: string;
    memoryUsage: {
      heapUsed: number; // MB
      heapTotal: number; // MB
    };
  };
}

export interface ActivityItem {
  type: "call" | "user_signup" | "business_created";
  title: string;
  description: string;
  timestamp: Date;
  businessName?: string;
}

export interface CostBreakdown {
  twilio: { calls: number; sms: number; phoneNumbers: number; total: number };
  vapi: { total: number; callCount: number };
  stripe: { fees: number; transactionCount: number };
  email: { total: number; count: number; ratePerEmail: number };
  railway: { total: number; estimated: boolean };
}

export interface PerBusinessCost {
  businessId: number;
  businessName: string;
  subscriptionRevenue: number;
  estimatedCallCost: number;
  estimatedSmsCost: number;
  phoneNumberCost: number;
  totalEstimatedCost: number;
  estimatedProfit: number;
}

export interface CostsData {
  period: string;
  revenue: { mrr: number };
  costs: CostBreakdown;
  totalCosts: number;
  grossMargin: number;
  grossMarginPercent: number;
  perBusiness: PerBusinessCost[];
  warnings: string[];
}

// Simple in-memory cache for expensive external API calls
let costsCache: { data: CostsData; timestamp: number } | null = null;
const COSTS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ── Service Functions ───────────────────────────────────────────────────

/**
 * Get platform-wide statistics
 */
export async function getPlatformStats(): Promise<PlatformStats> {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Run all count queries in parallel
  const [
    userCountResult,
    businessCountResult,
    phoneCountResult,
    totalCallsResult,
    monthlyCallsResult,
    activeSubsResult,
  ] = await Promise.all([
    // Total users
    db.select({ count: sql`count(*)` }).from(users),
    // Total businesses
    db.select({ count: sql`count(*)` }).from(businesses),
    // Active phone numbers
    db.select({ count: sql`count(*)` })
      .from(businesses)
      .where(isNotNull(businesses.twilioPhoneNumber)),
    // Total calls
    db.select({ count: sql`count(*)` }).from(callLogs),
    // Calls this month
    db.select({ count: sql`count(*)` })
      .from(callLogs)
      .where(gte(callLogs.callTime, thirtyDaysAgo)),
    // Active subscriptions
    db.select({ count: sql`count(*)` })
      .from(businesses)
      .where(eq(businesses.subscriptionStatus, "active")),
  ]);

  const stats = {
    totalUsers: Number(userCountResult[0]?.count) || 0,
    totalBusinesses: Number(businessCountResult[0]?.count) || 0,
    activePhoneNumbers: Number(phoneCountResult[0]?.count) || 0,
    totalCalls: Number(totalCallsResult[0]?.count) || 0,
    callsThisMonth: Number(monthlyCallsResult[0]?.count) || 0,
    activeSubscriptions: Number(activeSubsResult[0]?.count) || 0,
  };

  console.log("[Admin] Platform stats:", JSON.stringify(stats));
  return stats;
}

/**
 * Get all businesses with owner info and activity counts
 */
export async function getAdminBusinesses(): Promise<AdminBusiness[]> {
  // Get all businesses
  const allBusinesses = await db.select().from(businesses);

  // Get call counts per business
  const callCounts = await db
    .select({
      businessId: callLogs.businessId,
      count: sql<number>`count(*)::int`,
    })
    .from(callLogs)
    .groupBy(callLogs.businessId);

  const callCountMap = new Map(callCounts.map(c => [c.businessId, c.count]));

  // Get appointment counts per business
  const appointmentCounts = await db
    .select({
      businessId: appointments.businessId,
      count: sql<number>`count(*)::int`,
    })
    .from(appointments)
    .groupBy(appointments.businessId);

  const appointmentCountMap = new Map(appointmentCounts.map(a => [a.businessId, a.count]));

  // Get owners (users linked to each business)
  const allUsers = await db.select({
    id: users.id,
    username: users.username,
    email: users.email,
    businessId: users.businessId,
    role: users.role,
  }).from(users);

  // Map business owners (first user with role='user' or any user linked to the business)
  const ownerMap = new Map<number, { username: string; email: string }>();
  for (const u of allUsers) {
    if (u.businessId && !ownerMap.has(u.businessId)) {
      ownerMap.set(u.businessId, { username: u.username, email: u.email });
    }
  }

  return allBusinesses.map(b => ({
    id: b.id,
    name: b.name,
    email: b.email,
    phone: b.phone,
    type: b.type,
    industry: b.industry,
    subscriptionStatus: b.subscriptionStatus,
    twilioPhoneNumber: b.twilioPhoneNumber,
    vapiAssistantId: b.vapiAssistantId,
    createdAt: b.createdAt,
    ownerUsername: ownerMap.get(b.id)?.username || null,
    ownerEmail: ownerMap.get(b.id)?.email || null,
    callCount: callCountMap.get(b.id) || 0,
    appointmentCount: appointmentCountMap.get(b.id) || 0,
  }));
}

/**
 * Get all users with their business names
 */
export async function getAdminUsers(): Promise<AdminUser[]> {
  const allUsers = await db.select().from(users);
  const allBusinesses = await db.select({
    id: businesses.id,
    name: businesses.name,
  }).from(businesses);

  const businessMap = new Map(allBusinesses.map(b => [b.id, b.name]));

  return allUsers.map(u => ({
    id: u.id,
    username: u.username,
    email: u.email,
    role: u.role,
    businessId: u.businessId,
    businessName: u.businessId ? (businessMap.get(u.businessId) || null) : null,
    active: u.active,
    emailVerified: u.emailVerified,
    lastLogin: u.lastLogin,
    createdAt: u.createdAt,
  }));
}

/**
 * Get revenue and subscription data
 */
export async function getRevenueData(): Promise<RevenueData> {
  const allBusinesses = await db.select({
    subscriptionStatus: businesses.subscriptionStatus,
    subscriptionPlanId: businesses.subscriptionPlanId,
    stripePlanId: businesses.stripePlanId,
  }).from(businesses);

  const plans = await db.select().from(subscriptionPlans);
  const planMap = new Map(plans.map(p => [p.id, p]));
  const planByTier = new Map(plans.map(p => [p.planTier, p]));

  let activeCount = 0;
  let inactiveCount = 0;
  let trialingCount = 0;
  let pastDueCount = 0;
  let mrr = 0;

  // Count per plan tier
  const planTierCounts = new Map<string, number>();

  for (const b of allBusinesses) {
    const status = b.subscriptionStatus || "inactive";
    if (status === "active") {
      activeCount++;
      // Calculate MRR from the plan
      const plan = b.stripePlanId ? planMap.get(b.stripePlanId) : null;
      if (plan && plan.price) {
        mrr += plan.interval === "yearly" ? plan.price / 12 : plan.price;
      }
      // Track plan tier
      const tier = plan?.planTier || "unknown";
      planTierCounts.set(tier, (planTierCounts.get(tier) || 0) + 1);
    } else if (status === "trialing") {
      trialingCount++;
    } else if (status === "past_due") {
      pastDueCount++;
    } else {
      inactiveCount++;
    }
  }

  const planDistribution = plans.map(p => ({
    planTier: p.planTier,
    planName: p.name,
    price: p.price,
    businessCount: planTierCounts.get(p.planTier || "") || 0,
  }));

  return {
    mrr: Math.round(mrr * 100) / 100,
    activeCount,
    inactiveCount,
    trialingCount,
    pastDueCount,
    planDistribution,
  };
}

/**
 * Check system health — service connectivity and server info
 */
export async function getSystemHealth(): Promise<SystemHealth> {
  const services: ServiceStatus[] = [];

  // Database
  try {
    await db.execute(sql`SELECT 1`);
    services.push({ name: "Database", status: "connected" });
  } catch (e: any) {
    services.push({ name: "Database", status: "error", details: e.message });
  }

  // OpenAI
  services.push({
    name: "OpenAI",
    status: process.env.OPENAI_API_KEY ? "connected" : "not_configured",
  });

  // Twilio
  const twilioConfigured = !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);
  services.push({
    name: "Twilio",
    status: twilioConfigured ? "connected" : "not_configured",
  });

  // Vapi
  services.push({
    name: "Vapi",
    status: process.env.VAPI_API_KEY ? "connected" : "not_configured",
  });

  // Stripe
  services.push({
    name: "Stripe",
    status: process.env.STRIPE_SECRET_KEY ? "connected" : "not_configured",
  });

  const mem = process.memoryUsage();

  return {
    services,
    serverInfo: {
      nodeVersion: process.version,
      uptime: Math.floor(process.uptime()),
      environment: process.env.NODE_ENV || "development",
      memoryUsage: {
        heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
        heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
      },
    },
  };
}

/**
 * Get recent platform activity (calls, signups, new businesses)
 */
export async function getRecentActivity(): Promise<ActivityItem[]> {
  const activities: ActivityItem[] = [];

  // Get business names map for lookups
  const allBusinesses = await db.select({
    id: businesses.id,
    name: businesses.name,
  }).from(businesses);
  const businessMap = new Map(allBusinesses.map(b => [b.id, b.name]));

  // Recent calls (last 20)
  const recentCalls = await db
    .select({
      id: callLogs.id,
      businessId: callLogs.businessId,
      callerId: callLogs.callerId,
      status: callLogs.status,
      callTime: callLogs.callTime,
    })
    .from(callLogs)
    .orderBy(desc(callLogs.callTime))
    .limit(20);

  for (const call of recentCalls) {
    if (call.callTime) {
      activities.push({
        type: "call",
        title: "Call Received",
        description: `${call.status || "unknown"} call from ${call.callerId || "unknown"} — ${businessMap.get(call.businessId) || "Unknown Business"}`,
        timestamp: call.callTime,
        businessName: businessMap.get(call.businessId) || undefined,
      });
    }
  }

  // Recent user signups (last 10)
  const recentUsers = await db
    .select({
      id: users.id,
      username: users.username,
      email: users.email,
      createdAt: users.createdAt,
      businessId: users.businessId,
    })
    .from(users)
    .orderBy(desc(users.createdAt))
    .limit(10);

  for (const u of recentUsers) {
    if (u.createdAt) {
      activities.push({
        type: "user_signup",
        title: "New User Signup",
        description: `${u.username} (${u.email}) signed up`,
        timestamp: u.createdAt,
        businessName: u.businessId ? (businessMap.get(u.businessId) || undefined) : undefined,
      });
    }
  }

  // Recent businesses (last 10)
  const recentBusinesses = await db
    .select({
      id: businesses.id,
      name: businesses.name,
      email: businesses.email,
      createdAt: businesses.createdAt,
    })
    .from(businesses)
    .orderBy(desc(businesses.createdAt))
    .limit(10);

  for (const b of recentBusinesses) {
    if (b.createdAt) {
      activities.push({
        type: "business_created",
        title: "New Business",
        description: `${b.name} registered (${b.email})`,
        timestamp: b.createdAt,
        businessName: b.name,
      });
    }
  }

  // Sort all by timestamp descending, take newest 30
  activities.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  return activities.slice(0, 30);
}

/**
 * Get platform costs & P/L data — pulls from Twilio, Vapi, Stripe APIs
 */
export async function getCostsData(): Promise<CostsData> {
  // Return cached data if fresh
  if (costsCache && (Date.now() - costsCache.timestamp < COSTS_CACHE_TTL_MS)) {
    return costsCache.data;
  }

  const warnings: string[] = [];
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const period = now.toLocaleString("en-US", { month: "long", year: "numeric" });

  // ── 1. Revenue (reuse existing logic) ──────────────────────────────
  const revenueData = await getRevenueData();

  // ── 2. Twilio Usage Records ────────────────────────────────────────
  let twilioCosts = { calls: 0, sms: 0, phoneNumbers: 0, total: 0 };
  const twilioConfigured = !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);

  if (twilioConfigured && twilioService.client) {
    try {
      const records = await twilioService.client.usage.records.thisMonth.list();
      for (const record of records) {
        const price = parseFloat(String(record.price ?? "0"));
        const cat = record.category;
        if (cat === "calls" || cat === "calls-inbound" || cat === "calls-outbound") {
          twilioCosts.calls += price;
        } else if (cat === "sms" || cat === "sms-inbound" || cat === "sms-outbound") {
          twilioCosts.sms += price;
        } else if (cat === "phonenumbers") {
          twilioCosts.phoneNumbers += price;
        }
      }
      twilioCosts.total = twilioCosts.calls + twilioCosts.sms + twilioCosts.phoneNumbers;
    } catch (err: any) {
      console.error("[Admin] Error fetching Twilio usage:", err.message);
      warnings.push(`Twilio usage fetch failed: ${err.message}`);
    }
  } else {
    warnings.push("Twilio not configured — costs shown as $0");
  }

  // ── 3. Vapi Call Costs ────────────────────────────────────────────
  let vapiCosts = { total: 0, callCount: 0 };
  const vapiKey = process.env.VAPI_API_KEY;

  if (vapiKey) {
    try {
      // Strip milliseconds from ISO dates — Vapi API is strict about format
      const startISO = startOfMonth.toISOString().split(".")[0] + "Z";
      const endISO = now.toISOString().split(".")[0] + "Z";

      const url = new URL("https://api.vapi.ai/call");
      url.searchParams.set("createdAtGe", startISO);
      url.searchParams.set("createdAtLe", endISO);
      url.searchParams.set("limit", "1000");

      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${vapiKey}`,
          "Content-Type": "application/json",
        },
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Vapi API ${response.status}: ${body || response.statusText}`);
      }
      const calls = await response.json();
      const allCalls = Array.isArray(calls) ? calls : [];

      for (const call of allCalls) {
        const cost = call.costBreakdown?.total || call.cost || 0;
        vapiCosts.total += cost;
        vapiCosts.callCount++;
      }
    } catch (err: any) {
      console.error("[Admin] Error fetching Vapi costs:", err.message);
      warnings.push(`Vapi cost fetch failed: ${err.message}`);
    }
  } else {
    warnings.push("Vapi not configured — costs shown as $0");
  }

  // ── 4. Stripe Fees ────────────────────────────────────────────────
  let stripeCosts = { fees: 0, transactionCount: 0 };
  const stripeConfigured = process.env.STRIPE_SECRET_KEY
    && !process.env.STRIPE_SECRET_KEY.includes("example");

  if (stripeConfigured && stripeService.stripe) {
    try {
      const startTimestamp = Math.floor(startOfMonth.getTime() / 1000);
      let hasMore = true;
      let startingAfter: string | undefined;

      while (hasMore) {
        const params: any = {
          created: { gte: startTimestamp },
          type: "charge",
          limit: 100,
        };
        if (startingAfter) params.starting_after = startingAfter;

        const transactions = await stripeService.stripe.balanceTransactions.list(params);
        for (const txn of transactions.data) {
          stripeCosts.fees += txn.fee / 100; // cents → dollars
          stripeCosts.transactionCount++;
        }
        hasMore = transactions.has_more;
        if (transactions.data.length > 0) {
          startingAfter = transactions.data[transactions.data.length - 1].id;
        }
      }
    } catch (err: any) {
      console.error("[Admin] Error fetching Stripe fees:", err.message);
      warnings.push(`Stripe fee fetch failed: ${err.message}`);
    }
  } else {
    warnings.push("Stripe not configured — fees shown as $0");
  }

  // ── 5. Email Costs (estimated from notification log) ──────────────
  const EMAIL_COST_PER_EMAIL = 0.004; // ~Resend pricing
  let emailCount = 0;
  try {
    const emailCountResult = await db
      .select({ count: sql`count(*)` })
      .from(notificationLog)
      .where(
        and(
          eq(notificationLog.channel, "email"),
          gte(notificationLog.sentAt, startOfMonth)
        )
      );
    emailCount = Number(emailCountResult[0]?.count) || 0;
  } catch (err: any) {
    console.error("[Admin] Error querying notification_log for emails:", err.message);
    warnings.push(`Email cost query failed: ${err.message}`);
  }
  const emailCosts = {
    total: Math.round(emailCount * EMAIL_COST_PER_EMAIL * 100) / 100,
    count: emailCount,
    ratePerEmail: EMAIL_COST_PER_EMAIL,
  };

  // ── 6. Railway Infrastructure Costs ─────────────────────────────────
  let railwayCosts = { total: 0, estimated: true };
  const railwayToken = process.env.RAILWAY_API_TOKEN;
  const railwayProjectId = process.env.RAILWAY_PROJECT_ID;

  if (railwayToken && railwayProjectId) {
    try {
      const response = await fetch("https://backboard.railway.com/graphql/v2", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${railwayToken}`,
        },
        body: JSON.stringify({
          query: `query {
            estimatedUsage(projectId: "${railwayProjectId}", measurements: [CPU_USAGE, MEMORY_USAGE_GB, NETWORK_TX_GB, DISK_USAGE_GB]) {
              estimatedValue
              measurement
              projectId
            }
          }`,
        }),
      });

      if (response.ok) {
        const json = await response.json();
        const usageItems = json?.data?.estimatedUsage;
        if (Array.isArray(usageItems)) {
          let totalEstimate = 0;
          for (const item of usageItems) {
            totalEstimate += Number(item.estimatedValue) || 0;
          }
          railwayCosts = { total: Math.round(totalEstimate * 100) / 100, estimated: true };
        }
      } else {
        const body = await response.text();
        console.error("[Admin] Railway API error:", response.status, body);
        warnings.push(`Railway cost fetch failed: ${response.status}`);
      }
    } catch (err: any) {
      console.error("[Admin] Error fetching Railway costs:", err.message);
      warnings.push(`Railway cost fetch failed: ${err.message}`);
    }
  } else if (!railwayToken) {
    warnings.push("Railway API token not configured — add RAILWAY_API_TOKEN env var for infrastructure costs");
  }

  // ── 7. Per-Business Profitability ─────────────────────────────────
  const allBiz = await db.select({
    id: businesses.id,
    name: businesses.name,
    subscriptionStatus: businesses.subscriptionStatus,
    stripePlanId: businesses.stripePlanId,
    twilioPhoneNumber: businesses.twilioPhoneNumber,
  }).from(businesses);

  let plans: any[] = [];
  try {
    plans = await db.select().from(subscriptionPlans);
  } catch (err: any) {
    console.error("[Admin] Error querying subscription_plans:", err.message);
    warnings.push(`Subscription plans query failed: ${err.message}`);
  }
  const planMap = new Map(plans.map(p => [p.id, p]));

  // Call minutes per business this month
  let callMinutesMap = new Map<number, number>();
  try {
    const callMinutesPerBiz = await db
      .select({
        businessId: callLogs.businessId,
        totalSeconds: sql`coalesce(sum(${callLogs.callDuration}), 0)`,
      })
      .from(callLogs)
      .where(gte(callLogs.callTime, startOfMonth))
      .groupBy(callLogs.businessId);

    callMinutesMap = new Map(
      callMinutesPerBiz.map(c => [c.businessId, Number(c.totalSeconds) / 60])
    );
  } catch (err: any) {
    console.error("[Admin] Error querying call_logs:", err.message);
    warnings.push(`Call log query failed: ${err.message}`);
  }

  // SMS count per business this month
  let smsCountMap = new Map<number, number>();
  try {
    const smsPerBiz = await db
      .select({
        businessId: notificationLog.businessId,
        count: sql`count(*)`,
      })
      .from(notificationLog)
      .where(
        and(
          eq(notificationLog.channel, "sms"),
          gte(notificationLog.sentAt, startOfMonth)
        )
      )
      .groupBy(notificationLog.businessId);

    smsCountMap = new Map(smsPerBiz.map(s => [s.businessId, Number(s.count)]));
  } catch (err: any) {
    console.error("[Admin] Error querying notification_log for SMS:", err.message);
    warnings.push(`SMS count query failed: ${err.message}`);
  }

  // Calculate totals for proportional allocation
  const totalCallMinutes = Array.from(callMinutesMap.values()).reduce((a, b) => a + b, 0) || 1;
  const totalSmsCount = Array.from(smsCountMap.values()).reduce((a, b) => a + b, 0) || 1;

  const perBusiness: PerBusinessCost[] = allBiz.map(b => {
    const plan = b.stripePlanId ? planMap.get(b.stripePlanId) : null;
    const subRevenue = (b.subscriptionStatus === "active" && plan?.price)
      ? (plan.interval === "yearly" ? plan.price / 12 : plan.price)
      : 0;

    const bizCallMinutes = callMinutesMap.get(b.id) || 0;
    const bizSmsCount = smsCountMap.get(b.id) || 0;

    // Proportional Vapi cost based on call minutes
    const estimatedCallCost = totalCallMinutes > 0
      ? (bizCallMinutes / totalCallMinutes) * vapiCosts.total
      : 0;

    // Proportional SMS cost (Twilio SMS portion)
    const estimatedSmsCost = totalSmsCount > 0
      ? (bizSmsCount / totalSmsCount) * twilioCosts.sms
      : 0;

    // Phone number cost: flat ~$1.15/mo if provisioned
    const phoneNumberCost = b.twilioPhoneNumber ? 1.15 : 0;

    const totalEstimatedCost = estimatedCallCost + estimatedSmsCost + phoneNumberCost;
    const estimatedProfit = subRevenue - totalEstimatedCost;

    return {
      businessId: b.id,
      businessName: b.name,
      subscriptionRevenue: Math.round(subRevenue * 100) / 100,
      estimatedCallCost: Math.round(estimatedCallCost * 100) / 100,
      estimatedSmsCost: Math.round(estimatedSmsCost * 100) / 100,
      phoneNumberCost: Math.round(phoneNumberCost * 100) / 100,
      totalEstimatedCost: Math.round(totalEstimatedCost * 100) / 100,
      estimatedProfit: Math.round(estimatedProfit * 100) / 100,
    };
  });

  // Sort by profit descending (most profitable first)
  perBusiness.sort((a, b) => b.estimatedProfit - a.estimatedProfit);

  // ── 8. Assemble final response ────────────────────────────────────
  const totalCosts = twilioCosts.total + vapiCosts.total + stripeCosts.fees + emailCosts.total + railwayCosts.total;
  const grossMargin = revenueData.mrr - totalCosts;
  const grossMarginPercent = revenueData.mrr > 0
    ? Math.round((grossMargin / revenueData.mrr) * 10000) / 100
    : 0;

  const result: CostsData = {
    period,
    revenue: { mrr: revenueData.mrr },
    costs: {
      twilio: twilioCosts,
      vapi: vapiCosts,
      stripe: stripeCosts,
      email: emailCosts,
      railway: railwayCosts,
    },
    totalCosts: Math.round(totalCosts * 100) / 100,
    grossMargin: Math.round(grossMargin * 100) / 100,
    grossMarginPercent,
    perBusiness,
    warnings,
  };

  console.log("[Admin] Platform costs:", JSON.stringify({
    period, totalCosts: result.totalCosts, grossMargin: result.grossMargin, warnings,
  }));

  // Cache the result
  costsCache = { data: result, timestamp: Date.now() };
  return result;
}
