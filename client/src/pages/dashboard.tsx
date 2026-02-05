import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { PageLayout } from "@/components/layout/PageLayout";
import { StatCard } from "@/components/dashboard/StatCard";
import { ScheduleCard } from "@/components/dashboard/ScheduleCard";
import { JobsTable } from "@/components/dashboard/JobsTable";
import { CallsCard } from "@/components/dashboard/CallsCard";
import { InvoicesCard } from "@/components/dashboard/InvoicesCard";
import { SetupChecklist } from "@/components/dashboard/setup-checklist";
import { SkeletonStats, SkeletonCard, SkeletonTable } from "@/components/ui/skeleton-loader";
import { useAuth } from "@/hooks/use-auth";

import {
  CheckSquare,
  DollarSign,
  Calendar as CalendarIcon,
  Phone,
  TrendingUp,
  Clock,
  Repeat,
  Users,
  Briefcase
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

export default function Dashboard() {
  const [showSetupChecklist, setShowSetupChecklist] = useState(true);
  const { user } = useAuth();

  // Get business ID from authenticated user
  const businessId = user?.businessId;

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
      startDate: new Date().toISOString().split('T')[0]
    }],
    enabled: !!businessId,
  });

  const { data: calls = [] } = useQuery<any[]>({
    queryKey: ['/api/call-logs', { businessId }],
    enabled: !!businessId,
  });

  // Fetch analytics data
  const { data: analytics, isLoading: analyticsLoading } = useQuery<BusinessAnalytics>({
    queryKey: ['/api/analytics', { businessId, period: 'month' }],
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
    return `${Math.round(value * 100)}%`;
  };

  return (
    <PageLayout title="Dashboard">
      <div className="space-y-6">
        {/* Setup Checklist */}
        {showSetupChecklist && (
          <div className="mb-6">
            <SetupChecklist />
          </div>
        )}
        
        {/* Top Section - Analytics Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Completed Jobs"
            value={analytics?.jobs?.completedJobs ?? jobs?.length ?? 0}
            icon={<CheckSquare />}
            iconBgColor="bg-primary-100"
            iconColor="text-primary-600"
            change={analytics?.jobs?.completedJobs ? Math.round((analytics.jobs.completedJobs / (analytics.jobs.totalJobs || 1)) * 100) : 0}
            changeType="increase"
            linkText="View all"
            linkHref="/jobs"
          />
          
          <StatCard
            title="Revenue MTD"
            value={analytics?.revenue 
              ? `$${Math.round(analytics.revenue.paidRevenue)}` 
              : `$${Math.round(calculateMonthlyRevenue())}`}
            icon={<DollarSign />}
            iconBgColor="bg-indigo-100"
            iconColor="text-indigo-600"
            change={analytics?.revenue ? Math.round((analytics.revenue.paidRevenue / (analytics.revenue.totalRevenue || 1)) * 100) : 0}
            changeType="increase"
            linkText="View details"
            linkHref="/invoices"
          />
          
          <StatCard
            title="Appointments"
            value={analytics?.appointments?.upcomingAppointments ?? appointments?.length ?? 0}
            icon={<CalendarIcon />}
            iconBgColor="bg-green-100"
            iconColor="text-green-600"
            changeText={analytics?.appointments?.completedAppointments 
              ? `${analytics.appointments.completedAppointments} completed` 
              : (appointments?.length === 0 ? "No appointments" : "Today")}
            changeType="neutral"
            linkText="View schedule"
            linkHref="/appointments"
          />
          
          <StatCard
            title="Calls This Week"
            value={analytics?.calls?.totalCalls ?? calls?.length ?? 0}
            icon={<Phone />}
            iconBgColor="bg-amber-100"
            iconColor="text-amber-600"
            changeText={analytics?.calls?.answeredCalls 
              ? `${analytics.calls.answeredCalls} answered` 
              : (calls.length > 0 ? `${calls.filter((call: any) => 
                new Date(call.callTime) > new Date(Date.now() - 24 * 60 * 60 * 1000)
              ).length} new` : "No recent calls")}
            changeType={analytics?.calls?.answeredCalls ? "increase" : "neutral"}
            linkText="View logs"
            linkHref="/receptionist"
          />
        </div>
        
        {/* Middle Section - Appointments and Jobs */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Today's Schedule */}
          <div className="lg:col-span-1">
            <ScheduleCard businessId={businessId} />
          </div>

          {/* Active Jobs */}
          <div className="lg:col-span-2">
            <JobsTable businessId={businessId} limit={3} />
          </div>
        </div>
        
        {/* Advanced Analytics Section */}
        {analytics && (
          <>
            <div className="p-6 rounded-xl border border-border bg-card shadow-sm">
              <h2 className="text-lg font-semibold mb-6 text-foreground">Performance Metrics</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="flex flex-col items-center justify-center p-5 bg-muted/50 rounded-xl border border-border/50 hover:bg-muted transition-colors">
                  <div className="p-3 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 mb-3">
                    <TrendingUp className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Revenue Per Job</p>
                  <p className="text-2xl font-bold text-foreground mt-1">${Math.round(analytics.performance.revenuePerJob)}</p>
                </div>

                <div className="flex flex-col items-center justify-center p-5 bg-muted/50 rounded-xl border border-border/50 hover:bg-muted transition-colors">
                  <div className="p-3 rounded-xl bg-blue-100 dark:bg-blue-900/30 mb-3">
                    <CheckSquare className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Completion Rate</p>
                  <p className="text-2xl font-bold text-foreground mt-1">{formatPercentage(analytics.performance.jobCompletionRate)}</p>
                </div>

                <div className="flex flex-col items-center justify-center p-5 bg-muted/50 rounded-xl border border-border/50 hover:bg-muted transition-colors">
                  <div className="p-3 rounded-xl bg-amber-100 dark:bg-amber-900/30 mb-3">
                    <Clock className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                  </div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Avg Duration</p>
                  <p className="text-2xl font-bold text-foreground mt-1">{analytics.performance.averageJobDuration} hrs</p>
                </div>

                <div className="flex flex-col items-center justify-center p-5 bg-muted/50 rounded-xl border border-border/50 hover:bg-muted transition-colors">
                  <div className="p-3 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 mb-3">
                    <Phone className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Call Conversion</p>
                  <p className="text-2xl font-bold text-foreground mt-1">{formatPercentage(analytics.performance.callConversionRate)}</p>
                </div>

                <div className="flex flex-col items-center justify-center p-5 bg-muted/50 rounded-xl border border-border/50 hover:bg-muted transition-colors">
                  <div className="p-3 rounded-xl bg-purple-100 dark:bg-purple-900/30 mb-3">
                    <Repeat className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                  </div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Appt. Completion</p>
                  <p className="text-2xl font-bold text-foreground mt-1">{formatPercentage(analytics.performance.appointmentCompletionRate)}</p>
                </div>
              </div>
            </div>

            {/* Customer Analytics */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="p-6 rounded-xl border border-border bg-card shadow-sm">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                    <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <h2 className="text-lg font-semibold text-foreground">Customer Insights</h2>
                </div>
                <div className="space-y-4">
                  <div className="flex justify-between items-center py-2 border-b border-border/50">
                    <span className="text-muted-foreground">Total Customers</span>
                    <span className="font-semibold text-foreground">{analytics.customers.totalCustomers}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-border/50">
                    <span className="text-muted-foreground">New Customers (30 days)</span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">+{analytics.customers.newCustomers}</span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-muted-foreground">Returning Customers</span>
                    <span className="font-semibold text-foreground">{analytics.customers.returningCustomers}</span>
                  </div>
                  {analytics.customers.topCustomers.length > 0 && (
                    <>
                      <div className="pt-4">
                        <h3 className="font-medium text-sm text-foreground mb-3 uppercase tracking-wide">Top Customers</h3>
                        <div className="space-y-3">
                          {analytics.customers.topCustomers.slice(0, 3).map((customer, index) => (
                            <div key={index} className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
                              <div className="flex items-center gap-3">
                                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-foreground">
                                  {customer.customerName.split(' ').map(n => n[0]).join('').toUpperCase()}
                                </div>
                                <span className="font-medium text-foreground">{customer.customerName}</span>
                              </div>
                              <span className="font-semibold text-foreground">${Math.round(customer.revenue)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="p-6 rounded-xl border border-border bg-card shadow-sm">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                    <DollarSign className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <h2 className="text-lg font-semibold text-foreground">Revenue Breakdown</h2>
                </div>
                <div className="space-y-4">
                  <div className="flex justify-between items-center py-2 border-b border-border/50">
                    <span className="text-muted-foreground">Total Revenue</span>
                    <span className="font-bold text-xl text-foreground">${Math.round(analytics.revenue.totalRevenue).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-border/50">
                    <span className="text-muted-foreground">Paid Revenue</span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">${Math.round(analytics.revenue.paidRevenue).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-border/50">
                    <span className="text-muted-foreground">Pending Revenue</span>
                    <span className="font-semibold text-amber-600 dark:text-amber-400">${Math.round(analytics.revenue.pendingRevenue).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-muted-foreground">Overdue Revenue</span>
                    <span className="font-semibold text-red-600 dark:text-red-400">${Math.round(analytics.revenue.overdueRevenue).toLocaleString()}</span>
                  </div>

                  {analytics.revenue.revenueByMonth.length > 0 && (
                    <>
                      <div className="pt-4">
                        <h3 className="font-medium text-sm text-foreground mb-3 uppercase tracking-wide">Monthly Trend</h3>
                        <div className="space-y-2">
                          {analytics.revenue.revenueByMonth.slice(-3).map((month, index) => (
                            <div key={index} className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
                              <span className="font-medium text-foreground">{month.month}</span>
                              <span className="font-semibold text-foreground">${Math.round(month.revenue).toLocaleString()}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
        
        {/* Bottom Section - Recent Calls and Invoices */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Recent Calls from Virtual Receptionist */}
          <CallsCard businessId={businessId} limit={3} />

          {/* Recent Invoices */}
          <InvoicesCard businessId={businessId} limit={3} />
        </div>
      </div>
    </PageLayout>
  );
}
