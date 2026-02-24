import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { PageLayout } from "@/components/layout/PageLayout";
import { StatCard } from "@/components/dashboard/StatCard";
import { ScheduleCard } from "@/components/dashboard/ScheduleCard";
import { JobsTable } from "@/components/dashboard/JobsTable";
import { CallsCard } from "@/components/dashboard/CallsCard";
import { InvoicesCard } from "@/components/dashboard/InvoicesCard";
import { SetupChecklist } from "@/components/dashboard/setup-checklist";
import { SkeletonStats } from "@/components/ui/skeleton-loader";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { formatCurrency } from "@/lib/utils";

import { Progress } from "@/components/ui/progress";

import {
  CheckSquare,
  DollarSign,
  Calendar as CalendarIcon,
  Phone,
  TrendingUp,
  Clock,
  Repeat,
  Users,
  Briefcase,
  FileText,
  UserPlus,
  AlertTriangle,
  ArrowRight,
  Mic
} from "lucide-react";

// Analytics data interface
interface BusinessAnalytics {
  revenue: {
    totalRevenue: number;
    paidRevenue: number;
    pendingRevenue: number;
    overdueRevenue: number;
    revenueByMonth: { month: string; revenue: number; }[];
  };
  jobs: {
    totalJobs: number;
    completedJobs: number;
    inProgressJobs: number;
    scheduledJobs: number;
    jobsByService: { serviceName: string; count: number; }[];
    jobsOverTime: { date: string; count: number; }[];
  };
  appointments: {
    totalAppointments: number;
    completedAppointments: number;
    upcomingAppointments: number;
    appointmentsByStaff: { staffName: string; count: number; }[];
    appointmentsByDay: { day: string; count: number; }[];
  };
  calls: {
    totalCalls: number;
    answeredCalls: number;
    missedCalls: number;
    emergencyCalls: number;
    callsByTime: { hour: number; count: number; }[];
    callsOverTime: { date: string; count: number; }[];
    intentBreakdown: { intent: string; count: number; }[];
  };
  customers: {
    totalCustomers: number;
    newCustomers: number;
    returningCustomers: number;
    customersBySource: { source: string; count: number; }[];
    topCustomers: { customerId: number; customerName: string; revenue: number; jobCount: number; }[];
  };
  performance: {
    revenuePerJob: number;
    jobCompletionRate: number;
    averageJobDuration: number;
    callConversionRate: number;
    appointmentCompletionRate: number;
  };
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

const quickActions = [
  { label: "Appointments", icon: CalendarIcon, href: "/appointments", color: "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400" },
  { label: "Jobs", icon: Briefcase, href: "/jobs", color: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400" },
  { label: "Create Invoice", icon: FileText, href: "/invoices/create", color: "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400" },
  { label: "Customers", icon: UserPlus, href: "/customers", color: "bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400" },
];

export default function Dashboard() {
  const [showSetupChecklist, setShowSetupChecklist] = useState(true);
  const { user } = useAuth();

  // Get business ID from authenticated user
  const businessId = user?.businessId;

  // Fetch business info for greeting
  const { data: business } = useQuery<any>({
    queryKey: ['/api/business'],
    enabled: !!businessId,
  });

  // Check if onboarding is complete
  useEffect(() => {
    const isOnboardingComplete = localStorage.getItem('onboardingComplete') === 'true';
    setShowSetupChecklist(!isOnboardingComplete);
  }, []);

  // Fetch dashboard data for backward compatibility
  const { data: jobs = [] } = useQuery<any[]>({
    queryKey: ['/api/jobs', { businessId, status: 'completed' }],
    enabled: !!businessId,
  });

  const { data: invoices = [] } = useQuery<any[]>({
    queryKey: ['/api/invoices', { businessId }],
    enabled: !!businessId,
  });

  const { data: appointments = [] } = useQuery<any[]>({
    queryKey: ['/api/appointments', {
      businessId,
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date().toISOString().split('T')[0]
    }],
    enabled: !!businessId,
  });

  const { data: calls = [] } = useQuery<any[]>({
    queryKey: ['/api/call-logs', { businessId }],
    enabled: !!businessId,
  });

  const { data: quotes = [] } = useQuery<any[]>({
    queryKey: ['/api/quotes', { businessId }],
    enabled: !!businessId,
  });

  // Fetch AI call usage data
  const { data: usageData } = useQuery<{
    minutesUsed: number;
    minutesIncluded: number;
    minutesRemaining: number;
    overageMinutes: number;
    overageRate: number;
    overageCost: number;
    percentUsed: number;
    planName: string;
    planTier: string | null;
    isTrialActive: boolean;
    trialEndsAt: string | null;
    subscriptionStatus: string;
    canAcceptCalls: boolean;
  }>({
    queryKey: [`/api/subscription/usage/${businessId}`],
    enabled: !!businessId,
    retry: 2,
    staleTime: 60000,
    queryFn: async () => {
      const res = await fetch(`/api/subscription/usage/${businessId}`, {
        credentials: 'include',
      });
      if (!res.ok) {
        const text = await res.text();
        console.error(`Usage endpoint error: ${res.status}`, text);
        throw new Error(`Usage fetch failed: ${res.status} - ${text}`);
      }
      return res.json();
    },
  });

  // Fetch analytics data (endpoint uses session auth, no need to pass businessId)
  const { data: analytics, isLoading: analyticsLoading } = useQuery<BusinessAnalytics>({
    queryKey: ['/api/analytics', { period: 'month' }],
    enabled: !!businessId,
  });

  // Calculate monthly revenue (fallback method if analytics not available)
  const calculateMonthlyRevenue = () => {
    if (!invoices?.length) return 0;

    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();

    return invoices
      .filter((invoice: any) => {
        const invoiceDate = new Date(invoice.createdAt);
        return invoiceDate.getMonth() === currentMonth &&
               invoiceDate.getFullYear() === currentYear &&
               invoice.status === 'paid';
      })
      .reduce((sum: number, invoice: any) => sum + invoice.total, 0);
  };

  // Format the performance metrics for display
  const formatPercentage = (value: number) => {
    if (!value && value !== 0) return '0%';
    return `${Math.round(value * 100)}%`;
  };

  const revenueValue = analytics?.revenue
    ? formatCurrency(analytics.revenue.paidRevenue)
    : formatCurrency(calculateMonthlyRevenue());

  // Compute "Needs Attention" items
  const overdueInvoices = invoices.filter((inv: any) => inv.status === 'overdue');
  const overdueTotal = overdueInvoices.reduce((sum: number, inv: any) => sum + (inv.total || 0), 0);

  const today = new Date();
  const sevenDaysFromNow = new Date();
  sevenDaysFromNow.setDate(today.getDate() + 7);
  const todayStr = today.toISOString().split('T')[0];
  const sevenDayStr = sevenDaysFromNow.toISOString().split('T')[0];

  const expiringQuotes = quotes.filter((q: any) =>
    q.status === 'pending' &&
    q.validUntil &&
    q.validUntil >= todayStr &&
    q.validUntil <= sevenDayStr
  );
  const expiringQuotesTotal = expiringQuotes.reduce((sum: number, q: any) => sum + (q.total || 0), 0);

  const pendingInvoices = invoices.filter((inv: any) => inv.status === 'pending');
  const pendingTotal = pendingInvoices.reduce((sum: number, inv: any) => sum + (inv.total || 0), 0);

  const attentionItems = [
    ...(overdueInvoices.length > 0 ? [{
      type: 'overdue' as const,
      label: `${overdueInvoices.length} overdue invoice${overdueInvoices.length > 1 ? 's' : ''}`,
      detail: formatCurrency(overdueTotal),
      href: '/invoices',
      color: 'text-red-600 dark:text-red-400',
      bg: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
    }] : []),
    ...(expiringQuotes.length > 0 ? [{
      type: 'expiring' as const,
      label: `${expiringQuotes.length} quote${expiringQuotes.length > 1 ? 's' : ''} expiring soon`,
      detail: formatCurrency(expiringQuotesTotal),
      href: '/quotes',
      color: 'text-amber-600 dark:text-amber-400',
      bg: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800',
    }] : []),
    ...(pendingInvoices.length > 0 ? [{
      type: 'pending' as const,
      label: `${pendingInvoices.length} unpaid invoice${pendingInvoices.length > 1 ? 's' : ''}`,
      detail: formatCurrency(pendingTotal),
      href: '/invoices',
      color: 'text-amber-600 dark:text-amber-400',
      bg: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800',
    }] : []),
  ];

  return (
    <PageLayout title="Dashboard">
      <div className="space-y-4 sm:space-y-6">
        {/* Welcome Greeting */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-foreground">
              {getGreeting()}, {user?.username || 'there'}
            </h2>
            <p className="text-muted-foreground mt-1">
              {business?.name
                ? `Here's what's happening at ${business.name} today.`
                : "Here's your business overview for today."}
            </p>
          </div>
          <div className="text-sm text-muted-foreground">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
          </div>
        </div>

        {/* Setup Checklist */}
        {showSetupChecklist && (
          <SetupChecklist />
        )}

        {/* Quick Actions */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {quickActions.map((action) => (
            <Link key={action.href} href={action.href}>
              <Card className="border-border bg-card hover:bg-muted/50 hover:shadow-md transition-all duration-200 cursor-pointer group h-full">
                <CardContent className="flex items-center gap-3 p-4">
                  <div className={`flex-shrink-0 p-2.5 rounded-xl ${action.color}`}>
                    <action.icon className="h-5 w-5" />
                  </div>
                  <span className="text-sm font-medium text-foreground group-hover:text-foreground/90">{action.label}</span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        {/* Top Section - Analytics Cards */}
        {analyticsLoading ? (
          <SkeletonStats />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="Completed Jobs"
              value={analytics?.jobs?.completedJobs ?? jobs?.length ?? 0}
              icon={<CheckSquare />}
              iconBgColor="bg-emerald-100 dark:bg-emerald-900/30"
              iconColor="text-emerald-600 dark:text-emerald-400"
              changeText={analytics?.jobs?.totalJobs
                ? `${analytics.jobs.totalJobs} total`
                : undefined}
              changeType="neutral"
              linkText="View all jobs"
              linkHref="/jobs"
            />

            <StatCard
              title="Revenue MTD"
              value={revenueValue}
              icon={<DollarSign />}
              iconBgColor="bg-blue-100 dark:bg-blue-900/30"
              iconColor="text-blue-600 dark:text-blue-400"
              changeText={analytics?.revenue?.pendingRevenue
                ? `${formatCurrency(analytics.revenue.pendingRevenue)} pending`
                : undefined}
              changeType={analytics?.revenue?.pendingRevenue ? "neutral" : "neutral"}
              linkText="View invoices"
              linkHref="/invoices"
            />

            <StatCard
              title="Upcoming Appointments"
              value={analytics?.appointments?.upcomingAppointments ?? appointments?.length ?? 0}
              icon={<CalendarIcon />}
              iconBgColor="bg-amber-100 dark:bg-amber-900/30"
              iconColor="text-amber-600 dark:text-amber-400"
              changeText={analytics?.appointments?.completedAppointments
                ? `${analytics.appointments.completedAppointments} completed`
                : (appointments?.length === 0 ? "No appointments" : "Today")}
              changeType="neutral"
              linkText="View schedule"
              linkHref="/appointments"
            />

            <StatCard
              title="Calls This Month"
              value={analytics?.calls?.totalCalls ?? calls?.length ?? 0}
              icon={<Phone />}
              iconBgColor="bg-indigo-100 dark:bg-indigo-900/30"
              iconColor="text-indigo-600 dark:text-indigo-400"
              changeText={analytics?.calls?.answeredCalls
                ? `${analytics.calls.answeredCalls} answered`
                : (calls.length > 0 ? `${calls.filter((call: any) =>
                  new Date(call.callTime) > new Date(Date.now() - 24 * 60 * 60 * 1000)
                ).length} today` : "No recent calls")}
              changeType={analytics?.calls?.answeredCalls ? "increase" : "neutral"}
              linkText="View call logs"
              linkHref="/receptionist"
            />
          </div>
        )}

        {/* AI Receptionist Usage Widget */}
        {usageData && (
          <Card className="border-border bg-card shadow-sm rounded-xl overflow-hidden">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/30">
                    <Mic className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground">AI Receptionist Usage</h3>
                    <p className="text-xs text-muted-foreground">
                      {usageData.planName}
                      {usageData.isTrialActive && usageData.trialEndsAt && (
                        <> &middot; Trial ends {new Date(usageData.trialEndsAt).toLocaleDateString()}</>
                      )}
                    </p>
                  </div>
                </div>
                <Link href="/settings">
                  <span className="text-xs text-primary hover:underline cursor-pointer">
                    {usageData.subscriptionStatus === 'active' ? 'Manage Plan' : 'Upgrade'}
                  </span>
                </Link>
              </div>

              <div className="space-y-3">
                <div className="flex items-end justify-between">
                  <div>
                    <span className="text-2xl font-bold text-foreground">{usageData.minutesUsed}</span>
                    <span className="text-sm text-muted-foreground"> / {usageData.minutesIncluded} min</span>
                  </div>
                  <span className="text-sm text-muted-foreground">{usageData.minutesRemaining} remaining</span>
                </div>

                <Progress
                  value={usageData.percentUsed}
                  className={`h-2.5 ${
                    usageData.percentUsed >= 90
                      ? '[&>div]:bg-red-500'
                      : usageData.percentUsed >= 70
                      ? '[&>div]:bg-amber-500'
                      : '[&>div]:bg-indigo-500'
                  }`}
                />

                {usageData.overageMinutes > 0 && (
                  <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-amber-700 dark:text-amber-300">
                        {usageData.overageMinutes} overage min @ ${usageData.overageRate.toFixed(2)}/min
                      </span>
                      <span className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                        +${usageData.overageCost.toFixed(2)}
                      </span>
                    </div>
                    <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-1">
                      Billed automatically at period end
                    </p>
                  </div>
                )}

                {!usageData.canAcceptCalls && (
                  <div className="flex items-center gap-2 p-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                    <AlertTriangle className="h-4 w-4 text-red-500" />
                    <span className="text-xs text-red-700 dark:text-red-300">
                      AI receptionist is paused &mdash; {usageData.isTrialActive ? 'trial minutes exhausted' : 'upgrade to continue'}
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Needs Attention Section */}
        {attentionItems.length > 0 && (
          <div className="p-4 rounded-xl border border-border bg-card shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              <h3 className="font-semibold text-foreground">Needs Attention</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {attentionItems.map((item, index) => (
                <Link key={index} href={item.href}>
                  <div className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer hover:shadow-sm transition-all ${item.bg}`}>
                    <div>
                      <p className={`text-sm font-medium ${item.color}`}>{item.label}</p>
                      <p className="text-lg font-bold text-foreground">{item.detail}</p>
                    </div>
                    <ArrowRight className={`h-4 w-4 ${item.color}`} />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Middle Section - Appointments and Jobs */}
        <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-3">
          {/* Today's Schedule */}
          <div className="lg:col-span-1">
            <ScheduleCard businessId={businessId} />
          </div>

          {/* Active Jobs */}
          <div className="lg:col-span-2">
            <JobsTable businessId={businessId} limit={3} />
          </div>
        </div>

        {/* Bottom Section - Recent Calls and Invoices */}
        <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
          {/* Recent Calls from Virtual Receptionist */}
          <CallsCard businessId={businessId} limit={3} />

          {/* Recent Invoices */}
          <InvoicesCard businessId={businessId} limit={3} />
        </div>

        {/* Advanced Analytics Section */}
        {analytics && (
          <>
            <div className="p-6 rounded-xl border border-border bg-card shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <TrendingUp className="h-5 w-5 text-foreground" />
                  </div>
                  <h2 className="text-lg font-semibold text-foreground">Performance Metrics</h2>
                </div>
                <span className="text-sm text-muted-foreground">Last 30 days</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
                <div className="flex flex-col items-center justify-center p-5 bg-muted/50 rounded-xl border border-border/50 hover:bg-muted transition-colors">
                  <div className="p-3 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 mb-3">
                    <DollarSign className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide text-center">Revenue Per Job</p>
                  <p className="text-2xl font-bold text-foreground mt-1">{formatCurrency(analytics.performance.revenuePerJob)}</p>
                </div>

                <div className="flex flex-col items-center justify-center p-5 bg-muted/50 rounded-xl border border-border/50 hover:bg-muted transition-colors">
                  <div className="p-3 rounded-xl bg-blue-100 dark:bg-blue-900/30 mb-3">
                    <CheckSquare className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide text-center">Completion Rate</p>
                  <p className="text-2xl font-bold text-foreground mt-1">{formatPercentage(analytics.performance.jobCompletionRate)}</p>
                </div>

                <div className="flex flex-col items-center justify-center p-5 bg-muted/50 rounded-xl border border-border/50 hover:bg-muted transition-colors">
                  <div className="p-3 rounded-xl bg-amber-100 dark:bg-amber-900/30 mb-3">
                    <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide text-center">Avg Duration</p>
                  <p className="text-2xl font-bold text-foreground mt-1">{analytics.performance.averageJobDuration}h</p>
                </div>

                <div className="flex flex-col items-center justify-center p-5 bg-muted/50 rounded-xl border border-border/50 hover:bg-muted transition-colors">
                  <div className="p-3 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 mb-3">
                    <Phone className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide text-center">Call Conversion</p>
                  <p className="text-2xl font-bold text-foreground mt-1">{formatPercentage(analytics.performance.callConversionRate)}</p>
                </div>

                <div className="flex flex-col items-center justify-center p-5 bg-muted/50 rounded-xl border border-border/50 hover:bg-muted transition-colors">
                  <div className="p-3 rounded-xl bg-purple-100 dark:bg-purple-900/30 mb-3">
                    <Repeat className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide text-center">Appt. Completion</p>
                  <p className="text-2xl font-bold text-foreground mt-1">{formatPercentage(analytics.performance.appointmentCompletionRate)}</p>
                </div>
              </div>
            </div>

            {/* Customer & Revenue Analytics */}
            <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-2">
              <Card className="border-border bg-card shadow-sm rounded-xl overflow-hidden">
                <CardContent className="p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                      <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <h2 className="text-lg font-semibold text-foreground">Customer Insights</h2>
                  </div>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center py-2 border-b border-border/50">
                      <span className="text-sm text-muted-foreground">Total Customers</span>
                      <span className="font-semibold text-foreground">{analytics.customers.totalCustomers}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-border/50">
                      <span className="text-sm text-muted-foreground">New Customers (30 days)</span>
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">+{analytics.customers.newCustomers}</span>
                    </div>
                    <div className="flex justify-between items-center py-2">
                      <span className="text-sm text-muted-foreground">Returning Customers</span>
                      <span className="font-semibold text-foreground">{analytics.customers.returningCustomers}</span>
                    </div>
                    {analytics.customers.topCustomers.length > 0 && (
                      <div className="pt-4">
                        <h3 className="font-medium text-sm text-foreground mb-3 uppercase tracking-wide">Top Customers</h3>
                        <div className="space-y-2">
                          {analytics.customers.topCustomers.slice(0, 3).map((customer, index) => (
                            <div key={index} className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
                              <div className="flex items-center gap-3">
                                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-semibold text-foreground">
                                  {customer.customerName.split(' ').map(n => n[0]).join('').toUpperCase()}
                                </div>
                                <span className="text-sm font-medium text-foreground">{customer.customerName}</span>
                              </div>
                              <span className="text-sm font-semibold text-foreground">{formatCurrency(customer.revenue)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border bg-card shadow-sm rounded-xl overflow-hidden">
                <CardContent className="p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                      <DollarSign className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <h2 className="text-lg font-semibold text-foreground">Revenue Breakdown</h2>
                  </div>
                  <div className="space-y-4">
                    <div className="flex justify-between items-center py-2 border-b border-border/50">
                      <span className="text-sm text-muted-foreground">Total Revenue</span>
                      <span className="font-bold text-lg text-foreground">{formatCurrency(analytics.revenue.totalRevenue)}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-border/50">
                      <span className="text-sm text-muted-foreground">Paid</span>
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">{formatCurrency(analytics.revenue.paidRevenue)}</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-border/50">
                      <span className="text-sm text-muted-foreground">Pending</span>
                      <span className="font-semibold text-amber-600 dark:text-amber-400">{formatCurrency(analytics.revenue.pendingRevenue)}</span>
                    </div>
                    <div className="flex justify-between items-center py-2">
                      <span className="text-sm text-muted-foreground">Overdue</span>
                      <span className="font-semibold text-red-600 dark:text-red-400">{formatCurrency(analytics.revenue.overdueRevenue)}</span>
                    </div>

                    {analytics.revenue.revenueByMonth.length > 0 && (
                      <div className="pt-4">
                        <h3 className="font-medium text-sm text-foreground mb-3 uppercase tracking-wide">Monthly Trend</h3>
                        <div className="space-y-2">
                          {analytics.revenue.revenueByMonth.slice(-3).map((month, index) => (
                            <div key={index} className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
                              <span className="text-sm font-medium text-foreground">{month.month}</span>
                              <span className="text-sm font-semibold text-foreground">{formatCurrency(month.revenue)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </PageLayout>
  );
}
