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
} from "../../shared/schema";

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
    db.select({ count: sql<number>`count(*)::int` }).from(users),
    // Total businesses
    db.select({ count: sql<number>`count(*)::int` }).from(businesses),
    // Active phone numbers
    db.select({ count: sql<number>`count(*)::int` })
      .from(businesses)
      .where(isNotNull(businesses.twilioPhoneNumber)),
    // Total calls
    db.select({ count: sql<number>`count(*)::int` }).from(callLogs),
    // Calls this month
    db.select({ count: sql<number>`count(*)::int` })
      .from(callLogs)
      .where(gte(callLogs.callTime, thirtyDaysAgo)),
    // Active subscriptions
    db.select({ count: sql<number>`count(*)::int` })
      .from(businesses)
      .where(eq(businesses.subscriptionStatus, "active")),
  ]);

  return {
    totalUsers: userCountResult[0]?.count || 0,
    totalBusinesses: businessCountResult[0]?.count || 0,
    activePhoneNumbers: phoneCountResult[0]?.count || 0,
    totalCalls: totalCallsResult[0]?.count || 0,
    callsThisMonth: monthlyCallsResult[0]?.count || 0,
    activeSubscriptions: activeSubsResult[0]?.count || 0,
  };
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
