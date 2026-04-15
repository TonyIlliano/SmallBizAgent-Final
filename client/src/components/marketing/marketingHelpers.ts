// ---------------------------------------------------------------------------
// Shared types, helpers, and constants for the Marketing page tabs
// ---------------------------------------------------------------------------

// ── Types ────────────────────────────────────────────────────────────────

export interface MarketingInsights {
  totalCustomers: number;
  revenueThisMonth: number;
  revenueLastMonth: number;
  unansweredQuestions: number;
  segments: {
    new: number;
    active: number;
    atRisk: number;
    lost: number;
  };
  topServices: { name: string; count: number }[];
  busiestDay: { day: string; count: number };
  callIntents: { intent: string; count: number }[];
}

export interface InactiveCustomer {
  id: number;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  lastActivityDate: string;
  lifetimeRevenue: number;
  daysSinceVisit: number;
}

export interface CampaignTemplate {
  id: string;
  name: string;
  type: string;
  template: string;
  channel: string;
  segment: string;
}

export interface Campaign {
  id: number;
  name: string;
  type: string;
  channel: string;
  sentCount: number;
  createdAt: string;
  status: string;
}

export interface Customer {
  id: number;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  createdAt: string;
}

export interface ReviewStats {
  totalRequestsSent: number;
  clickThroughRate: number;
  smsSent: number;
  emailSent: number;
  topPlatform: string;
  eligibleCustomers: {
    id: number;
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
    lastJobDate: string;
  }[];
}

export interface BirthdayCustomer {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  birthday: string;
  marketingOptIn: boolean;
  isToday: boolean;
}

export interface SmsConsentStats {
  totalCustomers: number;
  smsOptIn: number;
  marketingOptIn: number;
  withBirthday: number;
}

export interface BusinessSettings {
  id: number;
  birthdayCampaignEnabled: boolean;
  birthdayDiscountPercent: number;
  birthdayCouponValidDays: number;
  birthdayCampaignChannel: string;
  birthdayCampaignMessage: string | null;
  [key: string]: any;
}

// ── Helpers ──────────────────────────────────────────────────────────────

export function formatDate(dateStr: string): string {
  if (!dateStr) return "N/A";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function trendPercent(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

export function formatBirthday(mmdd: string): string {
  if (!mmdd) return "N/A";
  const [month, day] = mmdd.split("-");
  const monthNames = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${monthNames[parseInt(month) - 1]} ${parseInt(day)}`;
}
