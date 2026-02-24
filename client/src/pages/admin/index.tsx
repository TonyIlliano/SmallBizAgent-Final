import { useAuth } from "@/hooks/use-auth";
import { Redirect } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { PageLayout } from "@/components/layout/PageLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Phone, Users, Building, BarChart3, Server,
  DollarSign, Activity, CheckCircle, XCircle, AlertCircle,
  Loader2, UserPlus, PhoneCall, Shield,
  TrendingUp, TrendingDown, PieChart,
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
        <TabsList className="flex w-full overflow-x-auto md:grid md:w-full md:grid-cols-6 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
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
  const { data, isLoading } = useQuery<{ businesses: AdminBusiness[] }>({
    queryKey: ["/api/admin/businesses"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/businesses");
      return res.json();
    },
  });

  if (isLoading) {
    return <LoadingSpinner />;
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

  const totalBusinesses = revenue.activeCount + revenue.inactiveCount + revenue.trialingCount + revenue.pastDueCount;

  return (
    <div className="space-y-6">
      {/* MRR and Subscription Summary */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2">
            <CardDescription>Monthly Recurring Revenue</CardDescription>
            <CardTitle className="text-3xl text-emerald-600">${revenue.mrr.toFixed(2)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active</CardDescription>
            <CardTitle className="text-2xl text-emerald-600">{revenue.activeCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Trialing</CardDescription>
            <CardTitle className="text-2xl text-blue-600">{revenue.trialingCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Past Due</CardDescription>
            <CardTitle className="text-2xl text-amber-600">{revenue.pastDueCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Inactive</CardDescription>
            <CardTitle className="text-2xl text-gray-500">{revenue.inactiveCount}</CardTitle>
          </CardHeader>
        </Card>
      </div>

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
                    <TableCell className="text-right font-medium">
                      {plan.price ? `$${(plan.price * plan.businessCount).toFixed(2)}/mo` : "—"}
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

export default AdminDashboardPage;
