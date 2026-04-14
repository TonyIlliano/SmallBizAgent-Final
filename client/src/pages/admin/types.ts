// Shared types used across admin dashboard tabs

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
  retellAgentId: string | null;
  createdAt: string | null;
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
  lastLogin: string | null;
  createdAt: string | null;
}

export interface RevenueData {
  mrr: number;
  arr: number;
  activeCount: number;
  inactiveCount: number;
  trialingCount: number;
  pastDueCount: number;
  canceledCount: number;
  churnRate: number;
  avgRevenuePerBusiness: number;
  lifetimeValue: number;
  mrrTrend: Array<{
    month: string;
    mrr: number;
    activeBusinesses: number;
    newBusinesses: number;
    churned: number;
  }>;
  planDistribution: Array<{
    planTier: string | null;
    planName: string | null;
    price: number | null;
    businessCount: number;
    revenue: number;
  }>;
  forecast: {
    months: Array<{ month: string; projected: number; optimistic: number; pessimistic: number }>;
    growthRate: number;
    methodology: string;
  } | null;
}

export interface SystemHealth {
  services: Array<{
    name: string;
    status: "connected" | "not_configured" | "error";
    details?: string;
    responseTimeMs?: number;
  }>;
  serverInfo: {
    nodeVersion: string;
    uptime: number;
    environment: string;
    memoryUsage: { heapUsed: number; heapTotal: number };
  };
}

export interface ActivityItem {
  type: "call" | "user_signup" | "business_created";
  title: string;
  description: string;
  timestamp: string;
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

export interface PlatformAgent {
  id: string;
  name: string;
  description: string;
  schedule: string;
  category: string;
  agentType: string;
  lastRunAt: string | null;
  lastAction: string | null;
  actionsLast24h: number;
  alertsLast24h: number;
}

export interface AgentActivityLogEntry {
  id: number;
  businessId: number;
  agentType: string;
  action: string;
  customerId: number | null;
  referenceType: string | null;
  referenceId: number | null;
  details: any;
  createdAt: string;
}

export interface PlatformAgentsSummary {
  totalActionsLast24h: number;
  totalAlertsLast7d: number;
  actionsByAgent: Array<{ agentType: string; count: number }>;
}

export interface AlertAction {
  label: string;
  action: string;
  businessId?: number;
  email?: string;
}

export interface PlatformAlert {
  severity: "high" | "medium" | "low";
  businessId: number;
  businessName: string;
  type: string;
  message: string;
  suggestedAction: string;
  createdAt?: string;
  actions?: AlertAction[];
}

export interface AuditLogEntry {
  id: number;
  userId: number | null;
  businessId: number | null;
  action: string;
  resource: string | null;
  resourceId: number | null;
  details: any;
  ipAddress: string | null;
  createdAt: string;
  username: string;
}

export interface AlertsResponse {
  alertCount: number;
  alerts: PlatformAlert[];
}

export interface BusinessDetail {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  type: string | null;
  industry: string | null;
  subscriptionStatus: string | null;
  twilioPhoneNumber: string | null;
  twilioPhoneNumberSid: string | null;
  vapiAssistantId: string | null;
  vapiPhoneNumberId: string | null;
  retellAgentId: string | null;
  retellLlmId: string | null;
  retellPhoneNumberId: string | null;
  bookingSlug: string | null;
  receptionistEnabled: boolean | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  stripePlanId: string | null;
  subscriptionStartDate: string | null;
  trialEndsAt: string | null;
  timezone: string | null;
  createdAt: string | null;
  ownerUsername: string | null;
  ownerEmail: string | null;
  callCount: number;
  appointmentCount: number;
  customerCount: number;
  invoiceCount: number;
  staffCount: number;
  serviceCount: number;
}

export interface PlatformMessage {
  id: number;
  businessId: number;
  businessName: string;
  customerId?: number | null;
  type: string;
  channel: string;
  recipient: string;
  subject?: string | null;
  message?: string | null;
  status: string;
  referenceType?: string | null;
  referenceId?: number | null;
  error?: string | null;
  sentAt: string;
}

export interface BlogPost {
  id: number;
  title: string;
  slug: string;
  excerpt: string | null;
  body: string;
  industry: string | null;
  targetKeywords: string[] | null;
  metaTitle: string | null;
  metaDescription: string | null;
  status: string;
  generatedVia: string | null;
  wordCount: number;
  publishedAt: string | null;
  editedBody: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SocialConnectionStatus {
  connected: boolean;
  connectedAt?: string;
}

export interface SocialPostSummary {
  id: number;
  status: string;
  platform: string;
}

export interface HealthCheckEntry {
  serviceName: string;
  status: "healthy" | "degraded" | "down";
  responseTimeMs: number;
  errorMessage?: string;
  checkedAt: string;
}
