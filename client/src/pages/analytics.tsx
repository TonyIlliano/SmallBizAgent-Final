import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageLayout } from "@/components/layout/PageLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DollarSign,
  TrendingUp,
  Users,
  Calendar,
  Phone,
  Clock,
  Star,
  BarChart3,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";

type Period = "week" | "month" | "quarter" | "year";

interface Analytics {
  revenue: {
    totalRevenue: number;
    paidRevenue: number;
    pendingRevenue: number;
    overdueRevenue: number;
    revenueByMonth: { month: string; revenue: number }[];
  };
  jobs: {
    totalJobs: number;
    completedJobs: number;
    inProgressJobs: number;
    scheduledJobs: number;
    jobsByService: { serviceName: string; count: number }[];
    jobsOverTime: { date: string; count: number }[];
  };
  appointments: {
    totalAppointments: number;
    completedAppointments: number;
    upcomingAppointments: number;
    appointmentsByStaff: { staffName: string; count: number }[];
    appointmentsByDay: { day: string; count: number }[];
  };
  calls: {
    totalCalls: number;
    answeredCalls: number;
    missedCalls: number;
    emergencyCalls: number;
    callsByTime: { hour: number; count: number }[];
    callsOverTime: { date: string; count: number }[];
    intentBreakdown: { intent: string; count: number }[];
  };
  customers: {
    totalCustomers: number;
    newCustomers: number;
    returningCustomers: number;
    topCustomers: { customerId: number; customerName: string; revenue: number; jobCount: number }[];
    customersBySource: { source: string; count: number }[];
  };
  performance: {
    revenuePerJob: number;
    jobCompletionRate: number;
    averageJobDuration: number;
    callConversionRate: number;
    appointmentCompletionRate: number;
  };
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

// Simple bar chart component
function BarChart({
  data,
  labelKey,
  valueKey,
  color = "#000",
  maxBars = 7,
}: {
  data: any[];
  labelKey: string;
  valueKey: string;
  color?: string;
  maxBars?: number;
}) {
  const items = data.slice(0, maxBars);
  const maxValue = Math.max(...items.map((d) => d[valueKey] || 0), 1);

  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground w-16 truncate text-right">
            {item[labelKey]}
          </span>
          <div className="flex-1 h-6 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.max((item[valueKey] / maxValue) * 100, 2)}%`,
                backgroundColor: color,
              }}
            />
          </div>
          <span className="text-sm font-medium w-10 text-right">
            {item[valueKey]}
          </span>
        </div>
      ))}
      {data.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">No data yet</p>
      )}
    </div>
  );
}

// Horizontal stat with progress
function ProgressStat({
  label,
  value,
  total,
  color,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{value}</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${Math.max(pct, 1)}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

// Mini sparkline-style hour distribution
function HourChart({ data }: { data: { hour: number; count: number }[] }) {
  const maxCount = Math.max(...data.map((d) => d.count), 1);
  // Fill all 24 hours
  const hours = Array.from({ length: 24 }, (_, h) => {
    const found = data.find((d) => d.hour === h);
    return { hour: h, count: found?.count || 0 };
  });

  return (
    <div className="flex items-end gap-px h-20">
      {hours.map((h) => (
        <div
          key={h.hour}
          className="flex-1 bg-primary/80 rounded-t-sm transition-all duration-300 hover:bg-primary group relative"
          style={{ height: `${Math.max((h.count / maxCount) * 100, 2)}%` }}
          title={`${h.hour}:00 — ${h.count} calls`}
        />
      ))}
    </div>
  );
}

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<Period>("month");

  const { data: analytics, isLoading } = useQuery<Analytics>({
    queryKey: ["/api/analytics", period],
    queryFn: async () => {
      const res = await fetch(`/api/analytics?period=${period}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch analytics");
      return res.json();
    },
  });

  return (
    <PageLayout title="Analytics">
      {/* Period selector */}
      <div className="flex items-center justify-between mb-6">
        <p className="text-muted-foreground">
          Business performance overview
        </p>
        <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <TabsList>
            <TabsTrigger value="week">Week</TabsTrigger>
            <TabsTrigger value="month">Month</TabsTrigger>
            <TabsTrigger value="quarter">Quarter</TabsTrigger>
            <TabsTrigger value="year">Year</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      ) : !analytics ? (
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <BarChart3 className="h-12 w-12 text-muted-foreground/40 mb-4" />
          <h3 className="text-lg font-semibold mb-2">No analytics data yet</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            Analytics will populate as your business starts receiving appointments,
            AI calls, and completing jobs. Check back soon!
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Top-level KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Revenue</p>
                    <p className="text-2xl font-bold">
                      {formatCurrency(analytics.revenue.totalRevenue)}
                    </p>
                  </div>
                  <div className="p-3 rounded-full bg-green-100 dark:bg-green-900/30">
                    <DollarSign className="h-5 w-5 text-green-600" />
                  </div>
                </div>
                <div className="flex items-center mt-2 text-xs">
                  <span className="text-green-600 flex items-center">
                    <ArrowUpRight className="h-3 w-3 mr-1" />
                    {formatCurrency(analytics.revenue.paidRevenue)} collected
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Appointments</p>
                    <p className="text-2xl font-bold">
                      {analytics.appointments.totalAppointments}
                    </p>
                  </div>
                  <div className="p-3 rounded-full bg-blue-100 dark:bg-blue-900/30">
                    <Calendar className="h-5 w-5 text-blue-600" />
                  </div>
                </div>
                <div className="flex items-center mt-2 text-xs">
                  <span className="text-blue-600">
                    {analytics.appointments.upcomingAppointments} upcoming
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Customers</p>
                    <p className="text-2xl font-bold">
                      {analytics.customers.totalCustomers}
                    </p>
                  </div>
                  <div className="p-3 rounded-full bg-purple-100 dark:bg-purple-900/30">
                    <Users className="h-5 w-5 text-purple-600" />
                  </div>
                </div>
                <div className="flex items-center mt-2 text-xs">
                  <span className="text-purple-600 flex items-center">
                    <ArrowUpRight className="h-3 w-3 mr-1" />
                    {analytics.customers.newCustomers} new
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">AI Calls</p>
                    <p className="text-2xl font-bold">
                      {analytics.calls.totalCalls}
                    </p>
                  </div>
                  <div className="p-3 rounded-full bg-orange-100 dark:bg-orange-900/30">
                    <Phone className="h-5 w-5 text-orange-600" />
                  </div>
                </div>
                <div className="flex items-center mt-2 text-xs">
                  {analytics.calls.totalCalls > 0 ? (
                    <span className="text-green-600">
                      {formatPercent(
                        (analytics.calls.answeredCalls /
                          analytics.calls.totalCalls) *
                          100
                      )}{" "}
                      answered
                    </span>
                  ) : (
                    <span className="text-muted-foreground">No calls yet</span>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Performance metrics */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card>
              <CardContent className="pt-6 text-center">
                <TrendingUp className="h-5 w-5 mx-auto mb-2 text-muted-foreground" />
                <p className="text-2xl font-bold">
                  {formatCurrency(analytics.performance.revenuePerJob)}
                </p>
                <p className="text-xs text-muted-foreground">Revenue / Job</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <Star className="h-5 w-5 mx-auto mb-2 text-muted-foreground" />
                <p className="text-2xl font-bold">
                  {formatPercent(analytics.performance.jobCompletionRate)}
                </p>
                <p className="text-xs text-muted-foreground">Completion Rate</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <Clock className="h-5 w-5 mx-auto mb-2 text-muted-foreground" />
                <p className="text-2xl font-bold">
                  {analytics.performance.averageJobDuration.toFixed(1)}h
                </p>
                <p className="text-xs text-muted-foreground">Avg Duration</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <Phone className="h-5 w-5 mx-auto mb-2 text-muted-foreground" />
                <p className="text-2xl font-bold">
                  {formatPercent(analytics.performance.callConversionRate)}
                </p>
                <p className="text-xs text-muted-foreground">Call Conversion</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <Calendar className="h-5 w-5 mx-auto mb-2 text-muted-foreground" />
                <p className="text-2xl font-bold">
                  {formatPercent(analytics.performance.appointmentCompletionRate)}
                </p>
                <p className="text-xs text-muted-foreground">Appt Completion</p>
              </CardContent>
            </Card>
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Revenue breakdown */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Revenue Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <ProgressStat
                    label="Collected"
                    value={analytics.revenue.paidRevenue}
                    total={analytics.revenue.totalRevenue}
                    color="#22c55e"
                  />
                  <ProgressStat
                    label="Pending"
                    value={analytics.revenue.pendingRevenue}
                    total={analytics.revenue.totalRevenue}
                    color="#f59e0b"
                  />
                  <ProgressStat
                    label="Overdue"
                    value={analytics.revenue.overdueRevenue}
                    total={analytics.revenue.totalRevenue}
                    color="#ef4444"
                  />
                </div>

                {analytics.revenue.revenueByMonth.length > 0 && (
                  <div className="mt-6">
                    <p className="text-sm font-medium mb-3">Monthly Revenue</p>
                    <BarChart
                      data={analytics.revenue.revenueByMonth}
                      labelKey="month"
                      valueKey="revenue"
                      color="#22c55e"
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Appointments by staff */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Appointments by Staff</CardTitle>
              </CardHeader>
              <CardContent>
                {analytics.appointments.appointmentsByStaff.length > 0 ? (
                  <BarChart
                    data={analytics.appointments.appointmentsByStaff}
                    labelKey="staffName"
                    valueKey="count"
                    color="#3b82f6"
                  />
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No staff appointment data yet
                  </p>
                )}

                {analytics.appointments.appointmentsByDay.length > 0 && (
                  <div className="mt-6">
                    <p className="text-sm font-medium mb-3">Busiest Days</p>
                    <BarChart
                      data={analytics.appointments.appointmentsByDay}
                      labelKey="day"
                      valueKey="count"
                      color="#8b5cf6"
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Call analytics */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">AI Call Analytics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="text-center">
                    <p className="text-2xl font-bold text-green-600">
                      {analytics.calls.answeredCalls}
                    </p>
                    <p className="text-xs text-muted-foreground">Answered</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-red-500">
                      {analytics.calls.missedCalls}
                    </p>
                    <p className="text-xs text-muted-foreground">Missed</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-bold text-orange-500">
                      {analytics.calls.emergencyCalls}
                    </p>
                    <p className="text-xs text-muted-foreground">Emergency</p>
                  </div>
                </div>

                {analytics.calls.callsByTime.length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-2">Calls by Hour</p>
                    <HourChart data={analytics.calls.callsByTime} />
                    <div className="flex justify-between text-xs text-muted-foreground mt-1">
                      <span>12am</span>
                      <span>6am</span>
                      <span>12pm</span>
                      <span>6pm</span>
                      <span>12am</span>
                    </div>
                  </div>
                )}

                {analytics.calls.intentBreakdown.length > 0 && (
                  <div className="mt-6">
                    <p className="text-sm font-medium mb-3">Caller Intent</p>
                    <BarChart
                      data={analytics.calls.intentBreakdown}
                      labelKey="intent"
                      valueKey="count"
                      color="#f97316"
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Top customers */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top Customers</CardTitle>
              </CardHeader>
              <CardContent>
                {analytics.customers.topCustomers.length > 0 ? (
                  <div className="space-y-3">
                    {analytics.customers.topCustomers.map((customer, i) => (
                      <div
                        key={customer.customerId}
                        className="flex items-center justify-between"
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold">
                            {i + 1}
                          </div>
                          <div>
                            <p className="text-sm font-medium">
                              {customer.customerName}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {customer.jobCount} jobs
                            </p>
                          </div>
                        </div>
                        <p className="font-semibold text-green-600">
                          {formatCurrency(customer.revenue)}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No customer revenue data yet
                  </p>
                )}

                {/* Customer growth */}
                <div className="mt-6 grid grid-cols-3 gap-3">
                  <div className="text-center p-3 rounded-lg bg-muted/50">
                    <p className="text-lg font-bold">
                      {analytics.customers.totalCustomers}
                    </p>
                    <p className="text-xs text-muted-foreground">Total</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-green-50 dark:bg-green-900/20">
                    <p className="text-lg font-bold text-green-600">
                      +{analytics.customers.newCustomers}
                    </p>
                    <p className="text-xs text-muted-foreground">New</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20">
                    <p className="text-lg font-bold text-blue-600">
                      {analytics.customers.returningCustomers}
                    </p>
                    <p className="text-xs text-muted-foreground">Returning</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Services breakdown */}
            {analytics.jobs.jobsByService.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Popular Services</CardTitle>
                </CardHeader>
                <CardContent>
                  <BarChart
                    data={analytics.jobs.jobsByService}
                    labelKey="serviceName"
                    valueKey="count"
                    color="#10b981"
                  />
                </CardContent>
              </Card>
            )}

            {/* Job status */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Job Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-4 rounded-lg bg-green-50 dark:bg-green-900/20">
                    <p className="text-2xl font-bold text-green-600">
                      {analytics.jobs.completedJobs}
                    </p>
                    <p className="text-xs text-muted-foreground">Completed</p>
                  </div>
                  <div className="text-center p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20">
                    <p className="text-2xl font-bold text-blue-600">
                      {analytics.jobs.inProgressJobs}
                    </p>
                    <p className="text-xs text-muted-foreground">In Progress</p>
                  </div>
                  <div className="text-center p-4 rounded-lg bg-amber-50 dark:bg-amber-900/20">
                    <p className="text-2xl font-bold text-amber-600">
                      {analytics.jobs.scheduledJobs}
                    </p>
                    <p className="text-xs text-muted-foreground">Scheduled</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </PageLayout>
  );
}
