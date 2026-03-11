import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Link, Redirect } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { PageLayout } from "@/components/layout/PageLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Phone, Users, Building, BarChart3, Server,
  DollarSign, Activity, CheckCircle, XCircle, AlertCircle,
  Loader2, UserPlus, PhoneCall, Shield,
  TrendingUp, TrendingDown, PieChart,
  Bot, Play, ChevronDown, ChevronUp, Bell,
  Brain, Target, Heart, Wrench, Zap, FileText, Star, Search, Share2,
} from "lucide-react";

// ── Types ───────────────────────────────────────────────────────────────

interface PlatformStats {
  totalUsers: number;
  totalBusinesses: number;
  activePhoneNumbers: number;
  totalCalls: number;
  callsThisMonth: number;
  activeSubscriptions: number;
}

interface AdminBusiness {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  type: string | null;
  industry: string | null;
  subscriptionStatus: string | null;
  twilioPhoneNumber: string | null;
  vapiAssistantId: string | null;
  createdAt: string | null;
  ownerUsername: string | null;
  ownerEmail: string | null;
  callCount: number;
  appointmentCount: number;
}

interface AdminUser {
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

interface RevenueData {
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
}

interface SystemHealth {
  services: Array<{
    name: string;
    status: "connected" | "not_configured" | "error";
    details?: string;
  }>;
  serverInfo: {
    nodeVersion: string;
    uptime: number;
    environment: string;
    memoryUsage: { heapUsed: number; heapTotal: number };
  };
}

interface ActivityItem {
  type: "call" | "user_signup" | "business_created";
  title: string;
  description: string;
  timestamp: string;
  businessName?: string;
}

interface CostBreakdown {
  twilio: { calls: number; sms: number; phoneNumbers: number; total: number };
  vapi: { total: number; callCount: number };
  stripe: { fees: number; transactionCount: number };
  email: { total: number; count: number; ratePerEmail: number };
  railway: { total: number; estimated: boolean };
}

interface PerBusinessCost {
  businessId: number;
  businessName: string;
  subscriptionRevenue: number;
  estimatedCallCost: number;
  estimatedSmsCost: number;
  phoneNumberCost: number;
  totalEstimatedCost: number;
  estimatedProfit: number;
}

interface CostsData {
  period: string;
  revenue: { mrr: number };
  costs: CostBreakdown;
  totalCosts: number;
  grossMargin: number;
  grossMarginPercent: number;
  perBusiness: PerBusinessCost[];
  warnings: string[];
}

interface PlatformAgent {
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

interface AgentActivityLogEntry {
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

interface PlatformAgentsSummary {
  totalActionsLast24h: number;
  totalAlertsLast7d: number;
  actionsByAgent: Array<{ agentType: string; count: number }>;
}

// ── Main Component ──────────────────────────────────────────────────────

const AdminDashboardPage = () => {
  const { user } = useAuth();

  // Redirect if not admin
  if (user && user.role !== "admin") {
    return <Redirect to="/dashboard" />;
  }
  if (!user) {
    return <Redirect to="/auth" />;
  }

  return (
    <PageLayout title="Admin Dashboard">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">Admin Dashboard</h1>
          <p className="text-muted-foreground mt-1">Platform overview and management</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="destructive" className="flex items-center gap-1">
            <Shield className="h-3 w-3" />
            Admin
          </Badge>
          <span className="text-sm text-muted-foreground">{user.username}</span>
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList className="flex w-full overflow-x-auto md:grid md:w-full md:grid-cols-8 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          <TabsTrigger value="overview" className="flex items-center gap-2 whitespace-nowrap flex-shrink-0">
            <BarChart3 className="h-4 w-4" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="businesses" className="flex items-center gap-2 whitespace-nowrap flex-shrink-0">
            <Building className="h-4 w-4" />
            Businesses
          </TabsTrigger>
          <TabsTrigger value="users" className="flex items-center gap-2 whitespace-nowrap flex-shrink-0">
            <Users className="h-4 w-4" />
            Users
          </TabsTrigger>
          <TabsTrigger value="revenue" className="flex items-center gap-2 whitespace-nowrap flex-shrink-0">
            <DollarSign className="h-4 w-4" />
            Revenue
          </TabsTrigger>
          <TabsTrigger value="agents" className="flex items-center gap-2 whitespace-nowrap flex-shrink-0">
            <Bot className="h-4 w-4" />
            AI Agents
          </TabsTrigger>
          <TabsTrigger value="content" className="flex items-center gap-2 whitespace-nowrap flex-shrink-0">
            <FileText className="h-4 w-4" />
            Content
          </TabsTrigger>
          <TabsTrigger value="costs" className="flex items-center gap-2 whitespace-nowrap flex-shrink-0">
            <PieChart className="h-4 w-4" />
            Costs & P/L
          </TabsTrigger>
          <TabsTrigger value="system" className="flex items-center gap-2 whitespace-nowrap flex-shrink-0">
            <Server className="h-4 w-4" />
            System
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview"><OverviewTab /></TabsContent>
        <TabsContent value="businesses"><BusinessesTab /></TabsContent>
        <TabsContent value="users"><UsersTab /></TabsContent>
        <TabsContent value="revenue"><RevenueTab /></TabsContent>
        <TabsContent value="agents"><PlatformAgentsTab /></TabsContent>
        <TabsContent value="content"><ContentTab /></TabsContent>
        <TabsContent value="costs"><CostsTab /></TabsContent>
        <TabsContent value="system"><SystemTab /></TabsContent>
      </Tabs>
    </PageLayout>
  );
};

// ── Overview Tab ────────────────────────────────────────────────────────

function OverviewTab() {
  const { data: stats, isLoading: loadingStats } = useQuery<PlatformStats>({
    queryKey: ["/api/admin/stats"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/stats");
      return res.json();
    },
  });

  const { data: activityData, isLoading: loadingActivity } = useQuery<{ activity: ActivityItem[] }>({
    queryKey: ["/api/admin/activity"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/activity");
      return res.json();
    },
  });

  const { data: revenue } = useQuery<RevenueData>({
    queryKey: ["/api/admin/revenue"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/revenue");
      return res.json();
    },
  });

  return (
    <div className="space-y-6">
      {/* Stat Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatsCard
          title="Total Users"
          value={stats?.totalUsers}
          icon={<Users className="h-4 w-4 text-muted-foreground" />}
          loading={loadingStats}
        />
        <StatsCard
          title="Businesses"
          value={stats?.totalBusinesses}
          icon={<Building className="h-4 w-4 text-muted-foreground" />}
          loading={loadingStats}
        />
        <StatsCard
          title="Phone Numbers"
          value={stats?.activePhoneNumbers}
          icon={<Phone className="h-4 w-4 text-muted-foreground" />}
          loading={loadingStats}
        />
        <StatsCard
          title="Total Calls"
          value={stats?.totalCalls}
          icon={<PhoneCall className="h-4 w-4 text-muted-foreground" />}
          loading={loadingStats}
        />
        <StatsCard
          title="Calls (30d)"
          value={stats?.callsThisMonth}
          icon={<Activity className="h-4 w-4 text-muted-foreground" />}
          loading={loadingStats}
        />
        <StatsCard
          title="MRR"
          value={revenue?.mrr !== undefined ? `$${revenue.mrr.toFixed(2)}` : undefined}
          icon={<DollarSign className="h-4 w-4 text-muted-foreground" />}
          loading={!revenue}
        />
      </div>

      {/* Subscription Quick Stats */}
      {revenue && (
        <div className="grid gap-4 md:grid-cols-4">
          <MiniStatCard label="Active Subs" value={revenue.activeCount} color="text-emerald-600" />
          <MiniStatCard label="Trialing" value={revenue.trialingCount} color="text-blue-600" />
          <MiniStatCard label="Past Due" value={revenue.pastDueCount} color="text-amber-600" />
          <MiniStatCard label="Inactive" value={revenue.inactiveCount} color="text-gray-500" />
        </div>
      )}

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Recent Activity
          </CardTitle>
          <CardDescription>Latest platform events across all businesses</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingActivity ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : activityData?.activity && activityData.activity.length > 0 ? (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {activityData.activity.map((item, i) => (
                <ActivityRow key={i} item={item} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-8">No activity yet</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Businesses Tab ──────────────────────────────────────────────────────

function BusinessesTab() {
  const { data, isLoading, error } = useQuery<{ businesses: AdminBusiness[] }>({
    queryKey: ["/api/admin/businesses"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/businesses");
      return res.json();
    },
  });

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (error) {
    return (
      <Card className="border-red-200">
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-red-600">
            <XCircle className="h-5 w-5" />
            <p className="font-medium">Failed to load businesses</p>
          </div>
          <p className="text-sm text-muted-foreground mt-1">{(error as Error).message}</p>
        </CardContent>
      </Card>
    );
  }

  const businesses = data?.businesses || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>All Businesses ({businesses.length})</CardTitle>
        <CardDescription>Every registered business on the platform</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Owner</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Subscription</TableHead>
              <TableHead className="text-right">Calls</TableHead>
              <TableHead className="text-right">Appts</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {businesses.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  No businesses yet
                </TableCell>
              </TableRow>
            ) : (
              businesses.map((b) => (
                <TableRow key={b.id}>
                  <TableCell>
                    <div>
                      <div className="font-medium">{b.name}</div>
                      <div className="text-xs text-muted-foreground">{b.email}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{b.ownerUsername || "—"}</div>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm capitalize">{b.industry || b.type || "—"}</span>
                  </TableCell>
                  <TableCell>
                    {b.twilioPhoneNumber ? (
                      <div className="flex items-center gap-1">
                        <Phone className="h-3 w-3 text-emerald-500" />
                        <span className="text-sm">{b.twilioPhoneNumber}</span>
                      </div>
                    ) : (
                      <span className="text-sm text-muted-foreground">None</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <SubscriptionBadge status={b.subscriptionStatus} />
                  </TableCell>
                  <TableCell className="text-right font-medium">{b.callCount}</TableCell>
                  <TableCell className="text-right font-medium">{b.appointmentCount}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {b.createdAt ? formatDate(b.createdAt) : "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ── Users Tab ───────────────────────────────────────────────────────────

function UsersTab() {
  const { data, isLoading } = useQuery<{ users: AdminUser[] }>({
    queryKey: ["/api/admin/users"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/users");
      return res.json();
    },
  });

  if (isLoading) {
    return <LoadingSpinner />;
  }

  const users = data?.users || [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>All Users ({users.length})</CardTitle>
        <CardDescription>Every registered user account on the platform</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Username</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Business</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last Login</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  No users yet
                </TableCell>
              </TableRow>
            ) : (
              users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.username}</TableCell>
                  <TableCell className="text-sm">{u.email}</TableCell>
                  <TableCell>
                    <RoleBadge role={u.role} />
                  </TableCell>
                  <TableCell className="text-sm">
                    {u.businessName || <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {u.active !== false ? (
                        <Badge variant="success" className="text-xs">Active</Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">Inactive</Badge>
                      )}
                      {u.emailVerified && (
                        <span title="Email verified">
                          <CheckCircle className="h-3 w-3 text-emerald-500" />
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {u.lastLogin ? formatRelative(u.lastLogin) : "Never"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {u.createdAt ? formatDate(u.createdAt) : "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ── Revenue Tab ─────────────────────────────────────────────────────────

function RevenueTab() {
  const { data: revenue, isLoading } = useQuery<RevenueData>({
    queryKey: ["/api/admin/revenue"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/revenue");
      return res.json();
    },
  });

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!revenue) {
    return <p className="text-center text-muted-foreground py-8">Could not load revenue data</p>;
  }

  const totalBusinesses = revenue.activeCount + revenue.inactiveCount + revenue.trialingCount + revenue.pastDueCount + revenue.canceledCount;
  const churnColor = revenue.churnRate > 5 ? "text-red-600" : revenue.churnRate > 2 ? "text-amber-600" : "text-emerald-600";

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Monthly Recurring Revenue</CardDescription>
            <CardTitle className="text-3xl text-emerald-600">${revenue.mrr.toFixed(2)}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">ARR: ${revenue.arr.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Monthly Churn Rate</CardDescription>
            <CardTitle className={`text-3xl ${churnColor}`}>{revenue.churnRate}%</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">{revenue.canceledCount} canceled (last 30d)</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Avg Revenue per Business</CardDescription>
            <CardTitle className="text-3xl text-blue-600">${revenue.avgRevenuePerBusiness.toFixed(2)}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Per active subscriber/mo</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Estimated LTV</CardDescription>
            <CardTitle className="text-3xl text-purple-600">${revenue.lifetimeValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Based on ARPU / churn</p>
          </CardContent>
        </Card>
      </div>

      {/* Subscription Status Breakdown */}
      <div className="grid gap-4 md:grid-cols-5">
        <MiniStatCard label="Active" value={revenue.activeCount} color="text-emerald-600" />
        <MiniStatCard label="Trialing" value={revenue.trialingCount} color="text-blue-600" />
        <MiniStatCard label="Past Due" value={revenue.pastDueCount} color="text-amber-600" />
        <MiniStatCard label="Canceled" value={revenue.canceledCount} color="text-red-600" />
        <MiniStatCard label="Inactive" value={revenue.inactiveCount} color="text-gray-500" />
      </div>

      {/* MRR Trend (last 6 months) */}
      {revenue.mrrTrend && revenue.mrrTrend.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              MRR Trend (Last 6 Months)
            </CardTitle>
            <CardDescription>Monthly recurring revenue, new signups, and churn over time</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {/* Simple bar chart with table */}
              <div className="grid grid-cols-6 gap-2">
                {revenue.mrrTrend.map((m) => {
                  const maxMrr = Math.max(...revenue.mrrTrend.map(t => t.mrr), 1);
                  const barHeight = Math.max((m.mrr / maxMrr) * 100, 4);
                  return (
                    <div key={m.month} className="flex flex-col items-center gap-1">
                      <div className="w-full h-24 flex items-end justify-center">
                        <div
                          className="w-8 bg-emerald-500 rounded-t transition-all"
                          style={{ height: `${barHeight}%` }}
                          title={`$${m.mrr.toFixed(2)}`}
                        />
                      </div>
                      <span className="text-xs font-medium">{m.month.slice(5)}</span>
                      <span className="text-xs text-muted-foreground">${m.mrr.toFixed(0)}</span>
                    </div>
                  );
                })}
              </div>
              {/* Detail table */}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Month</TableHead>
                    <TableHead className="text-right">MRR</TableHead>
                    <TableHead className="text-right">Active</TableHead>
                    <TableHead className="text-right">New</TableHead>
                    <TableHead className="text-right">Churned</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {revenue.mrrTrend.map((m) => (
                    <TableRow key={m.month}>
                      <TableCell className="font-medium">{m.month}</TableCell>
                      <TableCell className="text-right text-emerald-600 font-medium">${m.mrr.toFixed(2)}</TableCell>
                      <TableCell className="text-right">{m.activeBusinesses}</TableCell>
                      <TableCell className="text-right text-blue-600">+{m.newBusinesses}</TableCell>
                      <TableCell className="text-right text-red-600">{m.churned > 0 ? `-${m.churned}` : "0"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Plan Distribution */}
      <Card>
        <CardHeader>
          <CardTitle>Plan Distribution</CardTitle>
          <CardDescription>Businesses by subscription plan ({totalBusinesses} total)</CardDescription>
        </CardHeader>
        <CardContent>
          {revenue.planDistribution.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No subscription plans configured yet</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plan</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Businesses</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {revenue.planDistribution.map((plan, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{plan.planName || "—"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">{plan.planTier || "—"}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {plan.price ? `$${plan.price.toFixed(2)}/mo` : "—"}
                    </TableCell>
                    <TableCell className="text-right font-medium">{plan.businessCount}</TableCell>
                    <TableCell className="text-right font-medium text-emerald-600">
                      ${plan.revenue.toFixed(2)}/mo
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Platform AI Agents Tab ──────────────────────────────────────────────

const AGENT_ICONS: Record<string, React.ReactNode> = {
  churn_prediction: <Brain className="h-5 w-5 text-red-500" />,
  onboarding_coach: <Target className="h-5 w-5 text-blue-500" />,
  lead_scoring: <TrendingUp className="h-5 w-5 text-emerald-500" />,
  health_score: <Heart className="h-5 w-5 text-pink-500" />,
  support_triage: <Wrench className="h-5 w-5 text-amber-500" />,
  revenue_optimization: <Zap className="h-5 w-5 text-purple-500" />,
  content_seo: <FileText className="h-5 w-5 text-cyan-500" />,
  testimonial: <Star className="h-5 w-5 text-yellow-500" />,
  competitive_intel: <Search className="h-5 w-5 text-indigo-500" />,
  social_media: <Share2 className="h-5 w-5 text-sky-500" />,
};

const CATEGORY_COLORS: Record<string, string> = {
  retention: "bg-red-100 text-red-800",
  growth: "bg-blue-100 text-blue-800",
  operations: "bg-amber-100 text-amber-800",
  revenue: "bg-purple-100 text-purple-800",
  marketing: "bg-cyan-100 text-cyan-800",
  strategy: "bg-indigo-100 text-indigo-800",
};

function PlatformAgentsTab() {
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const { toast } = useToast();

  const { data: agentsData, isLoading } = useQuery<{ agents: PlatformAgent[] }>({
    queryKey: ["/api/admin/platform-agents"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/platform-agents");
      return res.json();
    },
  });

  const { data: summary } = useQuery<PlatformAgentsSummary>({
    queryKey: ["/api/admin/platform-agents-summary"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/platform-agents-summary");
      return res.json();
    },
  });

  const runAgentMutation = useMutation({
    mutationFn: async (agentId: string) => {
      const res = await apiRequest("POST", `/api/admin/platform-agents/${agentId}/run`);
      return res.json();
    },
    onSuccess: (data, agentId) => {
      const agentName = agentsData?.agents.find(a => a.id === agentId)?.name || agentId;
      toast({
        title: "Agent completed",
        description: `${agentName} finished running successfully.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/platform-agents"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/platform-agents-summary"] });
      // Also refetch activity for the expanded agent
      queryClient.invalidateQueries({ queryKey: [`/api/admin/platform-agents/${agentId}/activity`] });
    },
    onError: (error: any, agentId) => {
      const agentName = agentsData?.agents.find(a => a.id === agentId)?.name || agentId;
      toast({
        title: "Agent failed",
        description: `${agentName} encountered an error: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return <LoadingSpinner />;
  }

  const agents = agentsData?.agents || [];
  const totalAlerts = agents.reduce((sum, a) => sum + a.alertsLast24h, 0);
  const totalActions = summary?.totalActionsLast24h || 0;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active Agents</CardDescription>
            <CardTitle className="text-3xl text-emerald-600">{agents.length}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Platform-level AI agents running</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Actions (24h)</CardDescription>
            <CardTitle className="text-3xl text-blue-600">{totalActions}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Total agent actions taken</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Alerts (24h)</CardDescription>
            <CardTitle className={`text-3xl ${totalAlerts > 0 ? "text-red-600" : "text-emerald-600"}`}>{totalAlerts}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">High-priority items requiring attention</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Alerts (7d)</CardDescription>
            <CardTitle className="text-3xl text-amber-600">{summary?.totalAlertsLast7d || 0}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Weekly alert trend</p>
          </CardContent>
        </Card>
      </div>

      {/* Agent Cards */}
      <div className="space-y-3">
        {agents.map((agent) => (
          <AgentCard
            key={agent.id}
            agent={agent}
            isExpanded={expandedAgent === agent.id}
            onToggle={() => setExpandedAgent(expandedAgent === agent.id ? null : agent.id)}
            onRun={() => runAgentMutation.mutate(agent.id)}
            isRunning={runAgentMutation.isPending && (runAgentMutation.variables as string) === agent.id}
          />
        ))}
      </div>
    </div>
  );
}

function AgentCard({ agent, isExpanded, onToggle, onRun, isRunning }: {
  agent: PlatformAgent;
  isExpanded: boolean;
  onToggle: () => void;
  onRun: () => void;
  isRunning: boolean;
}) {
  const [selectedLog, setSelectedLog] = useState<AgentActivityLogEntry | null>(null);

  // Fetch activity when expanded
  const { data: activityData, isLoading: loadingActivity } = useQuery<{ logs: AgentActivityLogEntry[] }>({
    queryKey: [`/api/admin/platform-agents/${agent.id}/activity`],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/admin/platform-agents/${agent.id}/activity?limit=20`);
      return res.json();
    },
    enabled: isExpanded,
  });

  const icon = AGENT_ICONS[agent.id] || <Bot className="h-5 w-5" />;
  const categoryClass = CATEGORY_COLORS[agent.category] || "bg-gray-100 text-gray-800";

  return (
    <Card className={agent.alertsLast24h > 0 ? "border-red-200" : ""}>
      <div
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center gap-4">
          <div className="flex-shrink-0">{icon}</div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold">{agent.name}</h3>
              <span className={`text-xs px-2 py-0.5 rounded-full ${categoryClass}`}>
                {agent.category}
              </span>
              {agent.alertsLast24h > 0 && (
                <Badge variant="destructive" className="text-xs flex items-center gap-1">
                  <Bell className="h-3 w-3" />
                  {agent.alertsLast24h}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{agent.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right hidden md:block">
            <p className="text-sm font-medium">{agent.actionsLast24h} actions</p>
            <p className="text-xs text-muted-foreground">
              {agent.lastRunAt ? `Last run: ${formatRelative(agent.lastRunAt)}` : "Never run"}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={(e) => { e.stopPropagation(); onRun(); }}
            disabled={isRunning}
            className="flex-shrink-0"
          >
            {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          </Button>
          {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </div>

      {isExpanded && (
        <CardContent className="border-t pt-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold">Recent Activity</h4>
            <span className="text-xs text-muted-foreground">Schedule: {agent.schedule}</span>
          </div>
          {loadingActivity ? (
            <div className="flex justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : activityData?.logs && activityData.logs.length > 0 ? (
            <div className="max-h-80 overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Business</TableHead>
                    <TableHead>Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activityData.logs.map((log) => (
                    <TableRow
                      key={log.id}
                      className="cursor-pointer hover:bg-muted/60"
                      onClick={() => setSelectedLog(log)}
                    >
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {log.createdAt ? formatRelative(log.createdAt) : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={log.action === 'alert_generated' ? 'destructive' : 'secondary'}
                          className="text-xs"
                        >
                          {log.action.replace(/_/g, ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {log.businessId > 0 ? `#${log.businessId}` : "Platform"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                        {formatAgentDetails(log.details)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">
              No activity yet. Click the play button to run this agent.
            </p>
          )}
        </CardContent>
      )}

      {/* Activity Detail Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Badge
                variant={selectedLog?.action === 'alert_generated' ? 'destructive' : 'secondary'}
                className="text-xs"
              >
                {selectedLog?.action?.replace(/_/g, ' ')}
              </Badge>
              <span className="text-muted-foreground text-sm font-normal">
                {selectedLog?.createdAt ? formatRelative(selectedLog.createdAt) : ""}
              </span>
            </DialogTitle>
          </DialogHeader>
          {selectedLog && <AgentDetailView details={selectedLog.details} action={selectedLog.action} businessId={selectedLog.businessId} />}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function AgentDetailView({ details, action, businessId }: { details: any; action: string; businessId: number }) {
  const d = typeof details === 'string' ? JSON.parse(details) : details;
  if (!d) return <p className="text-muted-foreground">No details available.</p>;

  // Content draft (blog or social)
  if (d.contentType === 'blog') {
    return (
      <div className="space-y-4">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Blog Post Draft</p>
          <h3 className="text-lg font-semibold mt-1">{d.title}</h3>
        </div>
        {d.industry && (
          <div className="flex items-center gap-2">
            <Badge variant="outline">{d.industry}</Badge>
            {d.businessCount && <span className="text-xs text-muted-foreground">({d.businessCount} businesses)</span>}
            {d.generatedVia && <Badge variant="secondary" className="text-xs">{d.generatedVia === 'openai' ? 'AI Generated' : 'Template'}</Badge>}
          </div>
        )}
        {d.outline && d.outline.length > 0 && (
          <div>
            <p className="text-sm font-medium mb-2">Outline</p>
            <ol className="list-decimal list-inside space-y-1">
              {d.outline.map((item: string, i: number) => (
                <li key={i} className="text-sm text-muted-foreground">{item}</li>
              ))}
            </ol>
          </div>
        )}
        {d.targetKeywords && d.targetKeywords.length > 0 && (
          <div>
            <p className="text-sm font-medium mb-2">Target Keywords</p>
            <div className="flex flex-wrap gap-1">
              {d.targetKeywords.map((kw: string, i: number) => (
                <Badge key={i} variant="outline" className="text-xs">{kw}</Badge>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (d.contentType === 'social') {
    return (
      <div className="space-y-4">
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Social Media Post Draft</p>
          <h3 className="text-lg font-semibold mt-1">{d.title}</h3>
        </div>
        {d.industry && (
          <div className="flex items-center gap-2">
            <Badge variant="outline">{d.industry}</Badge>
            {d.generatedVia && <Badge variant="secondary" className="text-xs">{d.generatedVia === 'openai' ? 'AI Generated' : 'Template'}</Badge>}
          </div>
        )}
        {d.body && (
          <div className="bg-muted rounded-lg p-4">
            <p className="text-sm whitespace-pre-wrap">{d.body}</p>
          </div>
        )}
        {d.targetKeywords && d.targetKeywords.length > 0 && (
          <div>
            <p className="text-sm font-medium mb-2">Target Keywords</p>
            <div className="flex flex-wrap gap-1">
              {d.targetKeywords.map((kw: string, i: number) => (
                <Badge key={i} variant="outline" className="text-xs">{kw}</Badge>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  // Health score
  if (d.tier || d.breakdown) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="text-center">
            <p className="text-4xl font-bold">{d.score}</p>
            <p className="text-xs text-muted-foreground">Health Score</p>
          </div>
          <Badge variant={d.tier === 'critical' ? 'destructive' : d.tier === 'at_risk' ? 'secondary' : 'default'} className="text-sm">
            {d.tier?.replace(/_/g, ' ')}
          </Badge>
        </div>
        {d.breakdown && (
          <div>
            <p className="text-sm font-medium mb-2">Score Breakdown</p>
            <div className="space-y-1">
              {Object.entries(d.breakdown).map(([key, value]) => (
                <div key={key} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}</span>
                  <span className="font-medium">{String(value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        {d.message && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-sm text-red-800">{d.message}</p>
          </div>
        )}
      </div>
    );
  }

  // Alert
  if (d.alertType || d.message) {
    return (
      <div className="space-y-4">
        {d.alertType && <Badge variant="destructive">{d.alertType.replace(/_/g, ' ')}</Badge>}
        {d.message && <p className="text-sm">{d.message}</p>}
        {d.score !== undefined && <p className="text-sm text-muted-foreground">Score: {d.score}</p>}
      </div>
    );
  }

  // Generic fallback - show all details nicely
  return (
    <div className="space-y-2">
      {Object.entries(d).map(([key, value]) => (
        <div key={key} className="flex gap-2">
          <span className="text-sm font-medium min-w-[120px]">{key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}:</span>
          <span className="text-sm text-muted-foreground">
            {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
          </span>
        </div>
      ))}
    </div>
  );
}

function formatAgentDetails(details: any): string {
  if (!details) return "—";
  try {
    const d = typeof details === 'string' ? JSON.parse(details) : details;
    if (d.score !== undefined && d.riskLevel) return `Score: ${d.score} (${d.riskLevel})`;
    if (d.tier) return `Tier: ${d.tier}${d.score !== undefined ? ` (${d.score})` : ''}`;
    if (d.category) return `${d.category}: ${d.description || d.severity || ''}`;
    if (d.step) return `Step: ${d.label || d.step}`;
    if (d.type) return `${d.type}: ${d.recommendation || d.businessName || ''}`;
    if (d.contentType) return `${d.contentType}: ${d.title || d.industry || ''}`;
    if (d.businessName) return d.businessName;
    if (d.recommendation) return d.recommendation;
    // Fallback: show first key-value
    const keys = Object.keys(d);
    if (keys.length > 0) return `${keys[0]}: ${JSON.stringify(d[keys[0]]).slice(0, 60)}`;
    return "—";
  } catch {
    return String(details).slice(0, 80);
  }
}

// ── System Tab ──────────────────────────────────────────────────────────

function SystemTab() {
  const { data: health, isLoading } = useQuery<SystemHealth>({
    queryKey: ["/api/admin/system"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/system");
      return res.json();
    },
    refetchInterval: 30000, // Refresh every 30s
  });

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!health) {
    return <p className="text-center text-muted-foreground py-8">Could not load system health</p>;
  }

  return (
    <div className="space-y-6">
      {/* Service Status */}
      <Card>
        <CardHeader>
          <CardTitle>Service Status</CardTitle>
          <CardDescription>External service connectivity</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {health.services.map((svc) => (
              <div
                key={svc.name}
                className="flex items-center justify-between p-4 border rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <ServiceStatusIcon status={svc.status} />
                  <div>
                    <p className="font-medium">{svc.name}</p>
                    {svc.details && (
                      <p className="text-xs text-muted-foreground">{svc.details}</p>
                    )}
                  </div>
                </div>
                <Badge
                  variant={
                    svc.status === "connected"
                      ? "success"
                      : svc.status === "not_configured"
                        ? "warning"
                        : "destructive"
                  }
                >
                  {svc.status === "connected"
                    ? "Connected"
                    : svc.status === "not_configured"
                      ? "Not Configured"
                      : "Error"}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Server Info */}
      <Card>
        <CardHeader>
          <CardTitle>Server Information</CardTitle>
          <CardDescription>Runtime details</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            <InfoRow label="Node Version" value={health.serverInfo.nodeVersion} />
            <InfoRow label="Environment" value={health.serverInfo.environment} />
            <InfoRow label="Uptime" value={formatUptime(health.serverInfo.uptime)} />
            <InfoRow
              label="Memory Usage"
              value={`${health.serverInfo.memoryUsage.heapUsed} MB / ${health.serverInfo.memoryUsage.heapTotal} MB`}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Costs & P/L Tab ──────────────────────────────────────────────────

function CostsTab() {
  const { data: costsData, isLoading, error } = useQuery<CostsData>({
    queryKey: ["/api/admin/costs"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/costs");
      return res.json();
    },
  });

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (error || !costsData) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="pt-4">
          <div className="flex items-start gap-2">
            <XCircle className="h-5 w-5 text-red-500 mt-0.5" />
            <div>
              <p className="font-medium text-red-800">Could not load costs data</p>
              {error && <p className="text-sm text-red-700 mt-1">{(error as Error).message}</p>}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const marginColor = costsData.grossMargin >= 0 ? "text-emerald-600" : "text-red-600";
  const marginIcon = costsData.grossMargin >= 0
    ? <TrendingUp className="h-5 w-5 text-emerald-500" />
    : <TrendingDown className="h-5 w-5 text-red-500" />;

  return (
    <div className="space-y-6">
      {/* Warnings */}
      {costsData.warnings.length > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-4">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5" />
              <div>
                <p className="font-medium text-amber-800">Some cost data unavailable</p>
                {costsData.warnings.map((w, i) => (
                  <p key={i} className="text-sm text-amber-700">{w}</p>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Revenue (MRR)</CardDescription>
            <CardTitle className="text-3xl text-emerald-600">
              ${costsData.revenue.mrr.toFixed(2)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">{costsData.period}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Costs</CardDescription>
            <CardTitle className="text-3xl text-red-600">
              ${costsData.totalCosts.toFixed(2)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">All services combined</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Gross Margin</CardDescription>
            <CardTitle className={`text-3xl ${marginColor}`}>
              ${costsData.grossMargin.toFixed(2)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-1">
              {marginIcon}
              <span className={`text-sm font-medium ${marginColor}`}>
                {costsData.grossMarginPercent.toFixed(1)}%
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Cost per $1 Revenue</CardDescription>
            <CardTitle className="text-3xl text-gray-700">
              ${costsData.revenue.mrr > 0
                ? (costsData.totalCosts / costsData.revenue.mrr).toFixed(2)
                : "0.00"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Lower is better</p>
          </CardContent>
        </Card>
      </div>

      {/* Cost Breakdown by Service */}
      <Card>
        <CardHeader>
          <CardTitle>Cost Breakdown by Service</CardTitle>
          <CardDescription>{costsData.period} — all amounts in USD</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Service</TableHead>
                <TableHead>Details</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">% of Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <CostRow
                service="Twilio — Calls"
                details="Inbound & outbound voice"
                cost={costsData.costs.twilio.calls}
                total={costsData.totalCosts}
              />
              <CostRow
                service="Twilio — SMS"
                details="Text notifications"
                cost={costsData.costs.twilio.sms}
                total={costsData.totalCosts}
              />
              <CostRow
                service="Twilio — Phone Numbers"
                details="Monthly number rental"
                cost={costsData.costs.twilio.phoneNumbers}
                total={costsData.totalCosts}
              />
              <CostRow
                service="Vapi (AI Voice)"
                details={`${costsData.costs.vapi.callCount} calls — transport, STT, LLM, TTS`}
                cost={costsData.costs.vapi.total}
                total={costsData.totalCosts}
              />
              <CostRow
                service="Stripe Fees"
                details={`${costsData.costs.stripe.transactionCount} transactions`}
                cost={costsData.costs.stripe.fees}
                total={costsData.totalCosts}
              />
              <CostRow
                service="Email (Estimated)"
                details={`${costsData.costs.email.count} emails @ $${costsData.costs.email.ratePerEmail}/ea`}
                cost={costsData.costs.email.total}
                total={costsData.totalCosts}
              />
              <CostRow
                service={`Railway (Hosting)${costsData.costs.railway?.estimated ? " *" : ""}`}
                details="Server, database & networking"
                cost={costsData.costs.railway?.total || 0}
                total={costsData.totalCosts}
              />
              <TableRow className="font-bold border-t-2">
                <TableCell>TOTAL</TableCell>
                <TableCell />
                <TableCell className="text-right">${costsData.totalCosts.toFixed(2)}</TableCell>
                <TableCell className="text-right">100%</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Per-Business Profitability */}
      <Card>
        <CardHeader>
          <CardTitle>Per-Business Profitability (Estimated)</CardTitle>
          <CardDescription>
            Revenue vs estimated costs per business, sorted by profit.
            Costs allocated proportionally based on actual usage.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Business</TableHead>
                <TableHead className="text-right">Revenue/mo</TableHead>
                <TableHead className="text-right">Call Cost</TableHead>
                <TableHead className="text-right">SMS Cost</TableHead>
                <TableHead className="text-right">Phone #</TableHead>
                <TableHead className="text-right">Total Cost</TableHead>
                <TableHead className="text-right">Profit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {costsData.perBusiness.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    No businesses yet
                  </TableCell>
                </TableRow>
              ) : (
                costsData.perBusiness.map((b) => (
                  <TableRow key={b.businessId}>
                    <TableCell className="font-medium">{b.businessName}</TableCell>
                    <TableCell className="text-right">${b.subscriptionRevenue.toFixed(2)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">${b.estimatedCallCost.toFixed(2)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">${b.estimatedSmsCost.toFixed(2)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">${b.phoneNumberCost.toFixed(2)}</TableCell>
                    <TableCell className="text-right text-red-600">${b.totalEstimatedCost.toFixed(2)}</TableCell>
                    <TableCell className={`text-right font-bold ${b.estimatedProfit >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      ${b.estimatedProfit.toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function CostRow({ service, details, cost, total }: {
  service: string;
  details: string;
  cost: number;
  total: number;
}) {
  return (
    <TableRow>
      <TableCell className="font-medium">{service}</TableCell>
      <TableCell className="text-sm text-muted-foreground">{details}</TableCell>
      <TableCell className="text-right">${cost.toFixed(2)}</TableCell>
      <TableCell className="text-right">
        {total > 0 ? ((cost / total) * 100).toFixed(1) : "0.0"}%
      </TableCell>
    </TableRow>
  );
}

// ── Shared Helper Components ────────────────────────────────────────────

function StatsCard({ title, value, icon, loading }: {
  title: string;
  value?: number | string;
  icon: React.ReactNode;
  loading?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        {loading ? (
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        ) : (
          <div className="text-2xl font-bold">{value ?? 0}</div>
        )}
      </CardContent>
    </Card>
  );
}

function MiniStatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <Card>
      <CardContent className="pt-6 flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className={`text-xl font-bold ${color}`}>{value}</span>
      </CardContent>
    </Card>
  );
}

function ActivityRow({ item }: { item: ActivityItem }) {
  const iconMap = {
    call: <PhoneCall className="h-4 w-4 text-blue-500" />,
    user_signup: <UserPlus className="h-4 w-4 text-emerald-500" />,
    business_created: <Building className="h-4 w-4 text-purple-500" />,
  };

  return (
    <div className="flex items-start gap-3 py-2 border-b last:border-0">
      <div className="mt-0.5">{iconMap[item.type]}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{item.title}</span>
          <span className="text-xs text-muted-foreground">{formatRelative(item.timestamp)}</span>
        </div>
        <p className="text-sm text-muted-foreground truncate">{item.description}</p>
      </div>
    </div>
  );
}

function SubscriptionBadge({ status }: { status: string | null }) {
  if (!status || status === "inactive") {
    return <Badge variant="secondary">Inactive</Badge>;
  }
  if (status === "active") {
    return <Badge variant="success">Active</Badge>;
  }
  if (status === "trialing") {
    return <Badge variant="outline" className="text-blue-600 border-blue-300">Trialing</Badge>;
  }
  if (status === "past_due") {
    return <Badge variant="warning">Past Due</Badge>;
  }
  return <Badge variant="secondary" className="capitalize">{status}</Badge>;
}

function RoleBadge({ role }: { role: string | null }) {
  if (role === "admin") {
    return <Badge variant="destructive">Admin</Badge>;
  }
  if (role === "staff") {
    return <Badge variant="outline" className="text-blue-600 border-blue-300">Staff</Badge>;
  }
  return <Badge variant="secondary">User</Badge>;
}

function ServiceStatusIcon({ status }: { status: string }) {
  if (status === "connected") return <CheckCircle className="h-5 w-5 text-emerald-500" />;
  if (status === "not_configured") return <AlertCircle className="h-5 w-5 text-amber-500" />;
  return <XCircle className="h-5 w-5 text-red-500" />;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex justify-center py-12">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

// ── Utilities ───────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
    });
  } catch {
    return "—";
  }
}

function formatRelative(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 30) return `${diffDays}d ago`;
    return formatDate(dateStr);
  } catch {
    return "—";
  }
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

// ── Content / Blog Management Tab ──────────────────────────────────────

interface BlogPost {
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

// ── Social Media Summary Card (links to /admin/social-media) ─────────

interface SocialConnectionStatus { connected: boolean; connectedAt?: string }
interface SocialPostSummary { id: number; status: string; platform: string }

const SOCIAL_PLATFORMS = [
  { id: "twitter", label: "Twitter" },
  { id: "facebook", label: "Facebook" },
  { id: "instagram", label: "Instagram" },
  { id: "linkedin", label: "LinkedIn" },
];

function SocialMediaSummaryCard() {
  const { data: socialPosts } = useQuery<SocialPostSummary[]>({
    queryKey: ["/api/social-media/posts"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/social-media/posts");
      return res.json();
    },
  });

  const { data: connectionStatuses } = useQuery<Record<string, SocialConnectionStatus>>({
    queryKey: ["/api/social-media/status"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/social-media/status");
      return res.json();
    },
  });

  const drafts = socialPosts?.filter(p => p.status === "draft").length || 0;
  const approved = socialPosts?.filter(p => p.status === "approved").length || 0;
  const published = socialPosts?.filter(p => p.status === "published").length || 0;
  const connectedCount = connectionStatuses
    ? Object.values(connectionStatuses).filter(s => s.connected).length
    : 0;

  return (
    <Card className="border-dashed">
      <CardContent className="py-4 px-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <Share2 className="h-5 w-5 mt-0.5 text-pink-500 flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-sm">Social Media Posts</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {drafts} drafts · {approved} approved · {published} published
              </p>
              <div className="flex items-center gap-2 mt-2">
                {SOCIAL_PLATFORMS.map(p => {
                  const connected = connectionStatuses?.[p.id]?.connected;
                  return (
                    <span
                      key={p.id}
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        connected
                          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          : "bg-neutral-100 text-neutral-400 dark:bg-neutral-800 dark:text-neutral-500"
                      }`}
                    >
                      {p.label} {connected ? "✓" : "✗"}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
          <Link href="/admin/social-media">
            <Button variant="outline" size="sm" className="flex-shrink-0">
              <Share2 className="h-3.5 w-3.5 mr-2" />
              Manage Social Media
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function ContentTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [editingPost, setEditingPost] = useState<BlogPost | null>(null);
  const [editBody, setEditBody] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editExcerpt, setEditExcerpt] = useState("");
  const [editMetaTitle, setEditMetaTitle] = useState("");
  const [editMetaDescription, setEditMetaDescription] = useState("");

  const { data: posts, isLoading } = useQuery<BlogPost[]>({
    queryKey: ["/api/admin/blog-posts", statusFilter],
    queryFn: async () => {
      const url = statusFilter !== "all"
        ? `/api/admin/blog-posts?status=${statusFilter}`
        : "/api/admin/blog-posts";
      const res = await apiRequest("GET", url);
      const data = await res.json();
      return data.posts || [];
    },
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/blog-posts/generate");
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Content generated", description: `${data.blogsCreated || 0} blog posts, ${data.socialDraftsCreated || 0} social drafts created` });
      qc.invalidateQueries({ queryKey: ["/api/admin/blog-posts"] });
    },
    onError: (err: Error) => {
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("POST", `/api/admin/blog-posts/${id}/approve`);
    },
    onSuccess: () => {
      toast({ title: "Post approved" });
      qc.invalidateQueries({ queryKey: ["/api/admin/blog-posts"] });
    },
  });

  const publishMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("POST", `/api/admin/blog-posts/${id}/publish`);
    },
    onSuccess: () => {
      toast({ title: "Post published" });
      qc.invalidateQueries({ queryKey: ["/api/admin/blog-posts"] });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!editingPost) return;
      await apiRequest("PUT", `/api/admin/blog-posts/${editingPost.id}`, {
        title: editTitle,
        excerpt: editExcerpt,
        editedBody: editBody,
        metaTitle: editMetaTitle,
        metaDescription: editMetaDescription,
      });
    },
    onSuccess: () => {
      toast({ title: "Post saved" });
      setEditingPost(null);
      qc.invalidateQueries({ queryKey: ["/api/admin/blog-posts"] });
    },
    onError: (err: Error) => {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/admin/blog-posts/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Post deleted" });
      qc.invalidateQueries({ queryKey: ["/api/admin/blog-posts"] });
    },
  });

  function openEditor(post: BlogPost) {
    setEditingPost(post);
    setEditTitle(post.title);
    setEditExcerpt(post.excerpt || "");
    setEditBody(post.editedBody || post.body);
    setEditMetaTitle(post.metaTitle || "");
    setEditMetaDescription(post.metaDescription || "");
  }

  const statusBadge = (status: string) => {
    const variants: Record<string, string> = {
      draft: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
      approved: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
      published: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
      archived: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
    };
    return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${variants[status] || variants.draft}`}>{status}</span>;
  };

  const counts = {
    all: posts?.length || 0,
    draft: posts?.filter(p => p.status === "draft").length || 0,
    approved: posts?.filter(p => p.status === "approved").length || 0,
    published: posts?.filter(p => p.status === "published").length || 0,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Blog Content Management</h2>
          <p className="text-sm text-muted-foreground">AI-generated blog posts for SEO. Review, edit, and publish.</p>
        </div>
        <Button onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending} size="sm">
          {generateMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Zap className="h-4 w-4 mr-2" />}
          Generate Content
        </Button>
      </div>

      {/* Social Media Quick Access */}
      <SocialMediaSummaryCard />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="cursor-pointer hover:ring-2 ring-primary/50 transition-all" onClick={() => setStatusFilter("all")}>
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-xs text-muted-foreground">Total Posts</p>
            <p className="text-2xl font-bold">{counts.all}</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:ring-2 ring-yellow-500/50 transition-all" onClick={() => setStatusFilter("draft")}>
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-xs text-muted-foreground">Drafts</p>
            <p className="text-2xl font-bold text-yellow-600">{counts.draft}</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:ring-2 ring-blue-500/50 transition-all" onClick={() => setStatusFilter("approved")}>
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-xs text-muted-foreground">Approved</p>
            <p className="text-2xl font-bold text-blue-600">{counts.approved}</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:ring-2 ring-green-500/50 transition-all" onClick={() => setStatusFilter("published")}>
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-xs text-muted-foreground">Published</p>
            <p className="text-2xl font-bold text-green-600">{counts.published}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Filter status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Posts</SelectItem>
            <SelectItem value="draft">Drafts</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="published">Published</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Posts Table */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : !posts || posts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No blog posts yet</h3>
            <p className="text-sm text-muted-foreground mb-4">Click "Generate Content" to create AI-powered blog posts for SEO.</p>
            <Button onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending} variant="outline" size="sm">
              <Zap className="h-4 w-4 mr-2" /> Generate First Posts
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead className="w-24">Status</TableHead>
                  <TableHead className="w-24">Industry</TableHead>
                  <TableHead className="w-20">Words</TableHead>
                  <TableHead className="w-24">Source</TableHead>
                  <TableHead className="w-28">Created</TableHead>
                  <TableHead className="w-40 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {posts.map((post) => (
                  <TableRow key={post.id} className="hover:bg-muted/30">
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm truncate max-w-[300px]">{post.title}</p>
                        {post.excerpt && (
                          <p className="text-xs text-muted-foreground truncate max-w-[300px] mt-0.5">{post.excerpt}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{statusBadge(post.status)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground capitalize">{post.industry || "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{post.wordCount?.toLocaleString() || 0}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {post.generatedVia === "openai" ? "AI" : "Template"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(post.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEditor(post)} title="Edit">
                          <FileText className="h-3.5 w-3.5" />
                        </Button>
                        {post.status === "draft" && (
                          <Button size="sm" variant="ghost" onClick={() => approveMutation.mutate(post.id)}
                            disabled={approveMutation.isPending} className="text-blue-600 hover:text-blue-700" title="Approve">
                            <CheckCircle className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {(post.status === "draft" || post.status === "approved") && (
                          <Button size="sm" variant="ghost" onClick={() => publishMutation.mutate(post.id)}
                            disabled={publishMutation.isPending} className="text-green-600 hover:text-green-700" title="Publish">
                            <Play className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => {
                          if (confirm("Delete this post?")) deleteMutation.mutate(post.id);
                        }} className="text-red-600 hover:text-red-700" title="Delete">
                          <XCircle className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editingPost} onOpenChange={(open) => !open && setEditingPost(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Blog Post</DialogTitle>
          </DialogHeader>
          {editingPost && (
            <div className="space-y-4 pt-2">
              <div className="flex items-center gap-3">
                {statusBadge(editingPost.status)}
                <Badge variant="outline" className="text-xs">
                  {editingPost.generatedVia === "openai" ? "AI Generated" : "Template Generated"}
                </Badge>
                <span className="text-xs text-muted-foreground">{editingPost.wordCount} words</span>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Title</label>
                <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Excerpt</label>
                <Textarea value={editExcerpt} onChange={(e) => setEditExcerpt(e.target.value)} rows={2} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Meta Title (SEO)</label>
                  <Input value={editMetaTitle} onChange={(e) => setEditMetaTitle(e.target.value)} placeholder="SEO title..." />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Meta Description (SEO)</label>
                  <Input value={editMetaDescription} onChange={(e) => setEditMetaDescription(e.target.value)} placeholder="SEO description..." />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Body (Markdown)</label>
                <Textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={18} className="font-mono text-sm" />
              </div>

              <div className="flex items-center justify-between pt-2 border-t">
                <div className="flex gap-2">
                  {editingPost.status === "draft" && (
                    <Button size="sm" variant="outline" onClick={() => { approveMutation.mutate(editingPost.id); setEditingPost(null); }}>
                      <CheckCircle className="h-4 w-4 mr-2" /> Approve
                    </Button>
                  )}
                  {(editingPost.status === "draft" || editingPost.status === "approved") && (
                    <Button size="sm" variant="outline" onClick={() => { publishMutation.mutate(editingPost.id); setEditingPost(null); }}
                      className="text-green-600 border-green-200 hover:bg-green-50">
                      <Play className="h-4 w-4 mr-2" /> Publish
                    </Button>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setEditingPost(null)}>Cancel</Button>
                  <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                    {saveMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                    Save Changes
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default AdminDashboardPage;
