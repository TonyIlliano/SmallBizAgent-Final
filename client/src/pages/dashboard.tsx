import { useQuery } from "@tanstack/react-query";
import { PageLayout } from "@/components/layout/PageLayout";
import { StatCard } from "@/components/dashboard/StatCard";
import { ScheduleCard } from "@/components/dashboard/ScheduleCard";
import { JobsTable } from "@/components/dashboard/JobsTable";
import { CallsCard } from "@/components/dashboard/CallsCard";
import { InvoicesCard } from "@/components/dashboard/InvoicesCard";
import { Loader2 } from "lucide-react";

import { 
  CheckSquare, 
  DollarSign, 
  Calendar as CalendarIcon, 
  Phone,
  BarChart,
  TrendingUp,
  Clock,
  Repeat 
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
  // Fetch dashboard data for backward compatibility
  const { data: jobs = [] } = useQuery<any[]>({
    queryKey: ['/api/jobs', { businessId: 1, status: 'completed' }],
  });

  const { data: invoices = [] } = useQuery<any[]>({
    queryKey: ['/api/invoices', { businessId: 1 }],
  });

  const { data: appointments = [] } = useQuery<any[]>({
    queryKey: ['/api/appointments', { 
      businessId: 1, 
      startDate: new Date().toISOString().split('T')[0]
    }],
  });

  const { data: calls = [] } = useQuery<any[]>({
    queryKey: ['/api/call-logs', { businessId: 1 }],
  });

  // Fetch analytics data
  const { data: analytics, isLoading: analyticsLoading } = useQuery<BusinessAnalytics>({
    queryKey: ['/api/analytics', { businessId: 1, period: 'month' }],
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
            <ScheduleCard date={new Date()} businessId={1} />
          </div>
          
          {/* Active Jobs */}
          <div className="lg:col-span-2">
            <JobsTable businessId={1} limit={3} />
          </div>
        </div>
        
        {/* Advanced Analytics Section */}
        {analytics && (
          <>
            <div className="p-6 rounded-lg border border-border bg-card">
              <h2 className="text-xl font-semibold mb-4">Performance Metrics</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="flex flex-col items-center justify-center p-4 bg-background rounded-lg">
                  <TrendingUp className="w-8 h-8 text-primary mb-2" />
                  <p className="text-sm text-muted-foreground">Revenue Per Job</p>
                  <p className="text-2xl font-bold">${Math.round(analytics.performance.revenuePerJob)}</p>
                </div>
                
                <div className="flex flex-col items-center justify-center p-4 bg-background rounded-lg">
                  <CheckSquare className="w-8 h-8 text-green-500 mb-2" />
                  <p className="text-sm text-muted-foreground">Job Completion Rate</p>
                  <p className="text-2xl font-bold">{formatPercentage(analytics.performance.jobCompletionRate)}</p>
                </div>
                
                <div className="flex flex-col items-center justify-center p-4 bg-background rounded-lg">
                  <Clock className="w-8 h-8 text-amber-500 mb-2" />
                  <p className="text-sm text-muted-foreground">Avg Job Duration</p>
                  <p className="text-2xl font-bold">{analytics.performance.averageJobDuration} hrs</p>
                </div>
                
                <div className="flex flex-col items-center justify-center p-4 bg-background rounded-lg">
                  <Phone className="w-8 h-8 text-indigo-500 mb-2" />
                  <p className="text-sm text-muted-foreground">Call Conversion</p>
                  <p className="text-2xl font-bold">{formatPercentage(analytics.performance.callConversionRate)}</p>
                </div>
                
                <div className="flex flex-col items-center justify-center p-4 bg-background rounded-lg">
                  <Repeat className="w-8 h-8 text-purple-500 mb-2" />
                  <p className="text-sm text-muted-foreground">Appt. Completion</p>
                  <p className="text-2xl font-bold">{formatPercentage(analytics.performance.appointmentCompletionRate)}</p>
                </div>
              </div>
            </div>
            
            {/* Customer Analytics */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="p-6 rounded-lg border border-border bg-card">
                <h2 className="text-xl font-semibold mb-4">Customer Insights</h2>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Total Customers</span>
                    <span className="font-semibold">{analytics.customers.totalCustomers}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">New Customers (30 days)</span>
                    <span className="font-semibold">{analytics.customers.newCustomers}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Returning Customers</span>
                    <span className="font-semibold">{analytics.customers.returningCustomers}</span>
                  </div>
                  {analytics.customers.topCustomers.length > 0 && (
                    <>
                      <div className="h-px bg-border my-4"></div>
                      <h3 className="font-medium text-base mb-2">Top Customers by Revenue</h3>
                      <div className="space-y-2">
                        {analytics.customers.topCustomers.slice(0, 3).map((customer, index) => (
                          <div key={index} className="flex justify-between items-center">
                            <span>{customer.customerName}</span>
                            <span className="font-semibold">${Math.round(customer.revenue)}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
              
              <div className="p-6 rounded-lg border border-border bg-card">
                <h2 className="text-xl font-semibold mb-4">Revenue Breakdown</h2>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Total Revenue</span>
                    <span className="font-semibold">${Math.round(analytics.revenue.totalRevenue)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Paid Revenue</span>
                    <span className="font-semibold text-green-600">${Math.round(analytics.revenue.paidRevenue)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Pending Revenue</span>
                    <span className="font-semibold text-amber-600">${Math.round(analytics.revenue.pendingRevenue)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Overdue Revenue</span>
                    <span className="font-semibold text-destructive">${Math.round(analytics.revenue.overdueRevenue)}</span>
                  </div>
                  
                  {analytics.revenue.revenueByMonth.length > 0 && (
                    <>
                      <div className="h-px bg-border my-4"></div>
                      <h3 className="font-medium text-base mb-2">Monthly Trend</h3>
                      <div className="space-y-2">
                        {analytics.revenue.revenueByMonth.slice(-3).map((month, index) => (
                          <div key={index} className="flex justify-between items-center">
                            <span>{month.month}</span>
                            <span className="font-semibold">${Math.round(month.revenue)}</span>
                          </div>
                        ))}
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
          <CallsCard businessId={1} limit={3} />
          
          {/* Recent Invoices */}
          <InvoicesCard businessId={1} limit={3} />
        </div>
      </div>
    </PageLayout>
  );
}
