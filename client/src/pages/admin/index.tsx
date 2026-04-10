import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Link, Redirect } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { PageLayout } from "@/components/layout/PageLayout";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  Mail, MessageSquare, RefreshCw, MoreHorizontal, Eye, Power, PowerOff,
  UserX, UserCheck, KeyRound, ShieldAlert, AlertTriangle, Clock,
  ScrollText, LogIn,
} from "lucide-react";
import { Fragment } from "react";

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
  retellAgentId: string | null;
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
  forecast: {
    months: Array<{ month: string; projected: number; optimistic: number; pessimistic: number }>;
    growthRate: number;
    methodology: string;
  } | null;
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

interface AlertAction {
  label: string;
  action: string;
  businessId?: number;
  email?: string;
}

interface PlatformAlert {
  severity: "high" | "medium" | "low";
  businessId: number;
  businessName: string;
  type: string;
  message: string;
  suggestedAction: string;
  createdAt?: string;
  actions?: AlertAction[];
}

interface AuditLogEntry {
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

interface AlertsResponse {
  alertCount: number;
  alerts: PlatformAlert[];
}

interface BusinessDetail {
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

// ── Main Component ──────────────────────────────────────────────────────

const AdminDashboardPage = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("overview");

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

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="flex w-full overflow-x-auto md:grid md:w-full md:grid-cols-10 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
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
          <TabsTrigger value="messages" className="flex items-center gap-2 whitespace-nowrap flex-shrink-0">
            <MessageSquare className="h-4 w-4" />
            Messages
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
          <TabsTrigger value="audit" className="flex items-center gap-2 whitespace-nowrap flex-shrink-0">
            <ScrollText className="h-4 w-4" />
            Audit Log
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">{activeTab === "overview" && <ErrorBoundary><OverviewTab /></ErrorBoundary>}</TabsContent>
        <TabsContent value="businesses">{activeTab === "businesses" && <ErrorBoundary><BusinessesTab /></ErrorBoundary>}</TabsContent>
        <TabsContent value="users">{activeTab === "users" && <ErrorBoundary><UsersTab /></ErrorBoundary>}</TabsContent>
        <TabsContent value="revenue">{activeTab === "revenue" && <ErrorBoundary><RevenueTab /></ErrorBoundary>}</TabsContent>
        <TabsContent value="agents">{activeTab === "agents" && <ErrorBoundary><PlatformAgentsTab /></ErrorBoundary>}</TabsContent>
        <TabsContent value="messages">{activeTab === "messages" && <ErrorBoundary><PlatformMessagesTab /></ErrorBoundary>}</TabsContent>
        <TabsContent value="content">{activeTab === "content" && <ErrorBoundary><ContentTab /></ErrorBoundary>}</TabsContent>
        <TabsContent value="costs">{activeTab === "costs" && <ErrorBoundary><CostsTab /></ErrorBoundary>}</TabsContent>
        <TabsContent value="system">{activeTab === "system" && <ErrorBoundary><SystemTab /></ErrorBoundary>}</TabsContent>
        <TabsContent value="audit">{activeTab === "audit" && <ErrorBoundary><AuditLogTab /></ErrorBoundary>}</TabsContent>
      </Tabs>
    </PageLayout>
  );
};

// ── Overview Tab ────────────────────────────────────────────────────────

function OverviewTab() {
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [secondsAgo, setSecondsAgo] = useState(0);

  const { data: stats, isLoading: loadingStats, dataUpdatedAt: statsUpdatedAt } = useQuery<PlatformStats>({
    queryKey: ["/api/admin/stats"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/stats");
      return res.json();
    },
    refetchInterval: 30000,
  });

  const { data: activityData, isLoading: loadingActivity } = useQuery<{ activity: ActivityItem[] }>({
    queryKey: ["/api/admin/activity"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/activity");
      return res.json();
    },
    refetchInterval: 30000,
  });

  const { data: revenue } = useQuery<RevenueData>({
    queryKey: ["/api/admin/revenue"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/revenue");
      return res.json();
    },
    refetchInterval: 30000,
  });

  const { data: alertsData } = useQuery<AlertsResponse>({
    queryKey: ["/api/admin/alerts"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/alerts");
      return res.json();
    },
    refetchInterval: 30000,
  });

  // Track last updated time
  useEffect(() => {
    if (statsUpdatedAt) {
      setLastUpdated(new Date(statsUpdatedAt));
    }
  }, [statsUpdatedAt]);

  // Update seconds ago counter every 5 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsAgo(Math.floor((Date.now() - lastUpdated.getTime()) / 1000));
    }, 5000);
    return () => clearInterval(interval);
  }, [lastUpdated]);

  const formatSecondsAgo = (secs: number) => {
    if (secs < 5) return "just now";
    if (secs < 60) return `${secs}s ago`;
    const mins = Math.floor(secs / 60);
    return `${mins}m ago`;
  };

  return (
    <div className="space-y-6">
      {/* Platform Alerts Banner */}
      {alertsData && alertsData.alertCount > 0 && (
        <AlertsBanner alerts={alertsData.alerts} alertCount={alertsData.alertCount} />
      )}

      {/* Auto-refresh indicator */}
      <div className="flex justify-end">
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          <Clock className="h-3 w-3" />
          Last updated: {formatSecondsAgo(secondsAgo)}
          <span className="text-muted-foreground/50 ml-1">(auto-refreshes every 30s)</span>
        </span>
      </div>

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

// ── Alerts Banner ────────────────────────────────────────────────────────

function AlertsBanner({ alerts, alertCount }: { alerts: PlatformAlert[]; alertCount: number }) {
  const [expanded, setExpanded] = useState(false);

  const highAlerts = alerts.filter(a => a.severity === "high");
  const medAlerts = alerts.filter(a => a.severity === "medium");
  const lowAlerts = alerts.filter(a => a.severity === "low");

  const bannerColor = highAlerts.length > 0
    ? "border-red-300 bg-red-50 dark:bg-red-950/20 dark:border-red-800"
    : medAlerts.length > 0
      ? "border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800"
      : "border-gray-300 bg-gray-50 dark:bg-gray-900/30 dark:border-gray-700";

  const iconColor = highAlerts.length > 0 ? "text-red-600" : medAlerts.length > 0 ? "text-amber-600" : "text-gray-500";

  return (
    <Card className={bannerColor}>
      <CardContent className="pt-4 pb-3">
        <div
          className="flex items-center justify-between cursor-pointer"
          onClick={() => setExpanded(!expanded)}
        >
          <div className="flex items-center gap-3">
            <ShieldAlert className={`h-5 w-5 ${iconColor}`} />
            <div>
              <p className="font-semibold text-sm">
                {alertCount} Platform Alert{alertCount !== 1 ? "s" : ""}
              </p>
              <p className="text-xs text-muted-foreground">
                {highAlerts.length > 0 && <span className="text-red-600 font-medium">{highAlerts.length} high</span>}
                {highAlerts.length > 0 && medAlerts.length > 0 && " / "}
                {medAlerts.length > 0 && <span className="text-amber-600 font-medium">{medAlerts.length} medium</span>}
                {(highAlerts.length > 0 || medAlerts.length > 0) && lowAlerts.length > 0 && " / "}
                {lowAlerts.length > 0 && <span className="text-gray-500">{lowAlerts.length} low</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={highAlerts.length > 0 ? "destructive" : "secondary"} className="text-xs">
              {alertCount}
            </Badge>
            {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </div>
        </div>

        {expanded && (
          <div className="mt-4 space-y-2 max-h-80 overflow-y-auto">
            {alerts.map((alert, i) => (
              <AlertItem key={i} alert={alert} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AlertItem({ alert }: { alert: PlatformAlert }) {
  const severityConfig = {
    high: {
      icon: <XCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />,
      bg: "bg-red-100 dark:bg-red-900/30 border-red-200 dark:border-red-800",
      textColor: "text-red-800 dark:text-red-300",
      badge: "destructive" as const,
    },
    medium: {
      icon: <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />,
      bg: "bg-amber-100 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800",
      textColor: "text-amber-800 dark:text-amber-300",
      badge: "secondary" as const,
    },
    low: {
      icon: <AlertCircle className="h-4 w-4 text-gray-500 flex-shrink-0 mt-0.5" />,
      bg: "bg-gray-100 dark:bg-gray-800/30 border-gray-200 dark:border-gray-700",
      textColor: "text-gray-700 dark:text-gray-300",
      badge: "outline" as const,
    },
  };

  const config = severityConfig[alert.severity] || severityConfig.low;

  return (
    <div className={`flex items-start gap-3 rounded-lg border p-3 ${config.bg}`}>
      {config.icon}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-sm font-medium ${config.textColor}`}>{alert.businessName}</span>
          <Badge variant={config.badge} className="text-xs">{alert.severity}</Badge>
          <Badge variant="outline" className="text-xs capitalize">{alert.type.replace(/_/g, " ")}</Badge>
        </div>
        <p className={`text-sm mt-0.5 ${config.textColor}`}>{alert.message}</p>
        {alert.actions && alert.actions.length > 0 && (
          <div className="flex gap-2 mt-2 flex-wrap">
            {alert.actions.map((action, i) => (
              <AlertActionButton key={i} action={action} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AlertActionButton({ action }: { action: AlertAction }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const provisionMutation = useMutation({
    mutationFn: async (businessId: number) => {
      const res = await apiRequest("POST", `/api/admin/businesses/${businessId}/provision`);
      return res.json();
    },
    onSuccess: () => { toast({ title: "Re-provisioned" }); qc.invalidateQueries({ queryKey: ["/api/admin/alerts"] }); },
    onError: (err: Error) => { toast({ title: "Failed", description: err.message, variant: "destructive" }); },
  });

  const extendTrialMutation = useMutation({
    mutationFn: async (businessId: number) => {
      const res = await apiRequest("POST", `/api/admin/businesses/${businessId}/extend-trial`);
      return res.json();
    },
    onSuccess: (data: any) => { toast({ title: `Trial extended for ${data.business}` }); qc.invalidateQueries({ queryKey: ["/api/admin/alerts"] }); },
    onError: (err: Error) => { toast({ title: "Failed", description: err.message, variant: "destructive" }); },
  });

  const handleClick = () => {
    switch (action.action) {
      case 'provision':
        if (action.businessId) provisionMutation.mutate(action.businessId);
        break;
      case 'extend_trial':
        if (action.businessId) extendTrialMutation.mutate(action.businessId);
        break;
      case 'contact':
        if (action.email) window.open(`mailto:${action.email}?subject=SmallBizAgent%20Account%20Issue`, '_blank');
        break;
      case 'view_detail':
        // Handled by parent via tab switch
        break;
      case 'view_messages':
        // Scroll to messages tab
        const trigger = document.querySelector('[value="messages"]') as HTMLElement;
        trigger?.click();
        break;
    }
  };

  const isPending = provisionMutation.isPending || extendTrialMutation.isPending;

  return (
    <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleClick} disabled={isPending}>
      {isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
      {action.label}
    </Button>
  );
}

// ── Businesses Tab ──────────────────────────────────────────────────────

function BusinessesTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [detailBusinessId, setDetailBusinessId] = useState<number | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ type: "provision" | "deprovision"; businessId: number; businessName: string } | null>(null);
  const [subStatusBiz, setSubStatusBiz] = useState<{ id: number; name: string; currentStatus: string | null } | null>(null);

  const { data, isLoading, error } = useQuery<{ businesses: AdminBusiness[] }>({
    queryKey: ["/api/admin/businesses"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/businesses");
      return res.json();
    },
  });

  // Business detail query — only fetches when dialog is open
  const { data: businessDetail, isLoading: loadingDetail } = useQuery<BusinessDetail>({
    queryKey: ["/api/admin/businesses", detailBusinessId, "detail"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/admin/businesses/${detailBusinessId}/detail`);
      return res.json();
    },
    enabled: detailBusinessId !== null,
  });

  const provisionMutation = useMutation({
    mutationFn: async (businessId: number) => {
      const res = await apiRequest("POST", `/api/admin/businesses/${businessId}/provision`);
      return res.json();
    },
    onSuccess: (_data, businessId) => {
      toast({ title: "Business provisioned", description: `Business #${businessId} has been re-provisioned successfully.` });
      qc.invalidateQueries({ queryKey: ["/api/admin/businesses"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/stats"] });
    },
    onError: (err: Error) => {
      toast({ title: "Provisioning failed", description: err.message, variant: "destructive" });
    },
  });

  const deprovisionMutation = useMutation({
    mutationFn: async (businessId: number) => {
      const res = await apiRequest("POST", `/api/admin/businesses/${businessId}/deprovision`);
      return res.json();
    },
    onSuccess: (_data, businessId) => {
      toast({ title: "Business deprovisioned", description: `Business #${businessId} has been deprovisioned.` });
      qc.invalidateQueries({ queryKey: ["/api/admin/businesses"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/stats"] });
    },
    onError: (err: Error) => {
      toast({ title: "Deprovisioning failed", description: err.message, variant: "destructive" });
    },
  });

  const subStatusMutation = useMutation({
    mutationFn: async ({ businessId, status }: { businessId: number; status: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/businesses/${businessId}/subscription-status`, { status });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Subscription updated" });
      setSubStatusBiz(null);
      qc.invalidateQueries({ queryKey: ["/api/admin/businesses"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/revenue"] });
    },
    onError: (err: Error) => {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    },
  });

  const impersonateMutation = useMutation({
    mutationFn: async (businessId: number) => {
      const res = await apiRequest("POST", `/api/admin/impersonate/${businessId}`);
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: `Viewing as ${data.businessName}` });
      qc.invalidateQueries({ queryKey: ["/api/user"] });
      window.location.href = '/dashboard';
    },
    onError: (err: Error) => {
      toast({ title: "Impersonation failed", description: err.message, variant: "destructive" });
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

  const allBusinesses = data?.businesses || [];

  // Apply filters
  let businesses = allBusinesses;
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    businesses = businesses.filter(b =>
      b.name.toLowerCase().includes(q) ||
      (b.ownerUsername && b.ownerUsername.toLowerCase().includes(q)) ||
      (b.ownerEmail && b.ownerEmail.toLowerCase().includes(q)) ||
      b.email.toLowerCase().includes(q)
    );
  }
  if (statusFilter !== "all") {
    businesses = businesses.filter(b => {
      const status = b.subscriptionStatus || "inactive";
      return status === statusFilter;
    });
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>All Businesses ({allBusinesses.length})</CardTitle>
          <CardDescription>Every registered business on the platform</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Search and Filter Bar */}
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search businesses..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Subscription status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="trialing">Trialing</SelectItem>
                <SelectItem value="past_due">Past Due</SelectItem>
                <SelectItem value="canceled">Canceled</SelectItem>
                <SelectItem value="grace_period">Grace Period</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
            {(searchQuery || statusFilter !== "all") && (
              <Button variant="ghost" size="sm" onClick={() => { setSearchQuery(""); setStatusFilter("all"); }}>
                Clear filters
              </Button>
            )}
            {businesses.length !== allBusinesses.length && (
              <span className="text-xs text-muted-foreground">
                Showing {businesses.length} of {allBusinesses.length}
              </span>
            )}
          </div>

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
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {businesses.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                    {allBusinesses.length === 0 ? "No businesses yet" : "No businesses match your filters"}
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
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => setDetailBusinessId(b.id)}>
                            <Eye className="h-4 w-4 mr-2" />
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setConfirmAction({ type: "provision", businessId: b.id, businessName: b.name })}>
                            <Power className="h-4 w-4 mr-2" />
                            Re-provision
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setConfirmAction({ type: "deprovision", businessId: b.id, businessName: b.name })}
                            className="text-red-600"
                          >
                            <PowerOff className="h-4 w-4 mr-2" />
                            Deprovision
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => impersonateMutation.mutate(b.id)}>
                            <LogIn className="h-4 w-4 mr-2" />
                            View as Business
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => setSubStatusBiz({ id: b.id, name: b.name, currentStatus: b.subscriptionStatus })}>
                            <DollarSign className="h-4 w-4 mr-2" />
                            Change Subscription
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Business Detail Dialog */}
      <Dialog open={detailBusinessId !== null} onOpenChange={(open) => !open && setDetailBusinessId(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Business Details</DialogTitle>
            <DialogDescription>Full details for business #{detailBusinessId}</DialogDescription>
          </DialogHeader>
          {loadingDetail ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : businessDetail ? (
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Business Name</p>
                  <p className="font-semibold">{businessDetail.name}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Owner</p>
                  <p className="font-medium">{businessDetail.ownerUsername || "—"}</p>
                  <p className="text-xs text-muted-foreground">{businessDetail.ownerEmail || ""}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Industry</p>
                  <p className="text-sm capitalize">{businessDetail.industry || businessDetail.type || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Timezone</p>
                  <p className="text-sm">{businessDetail.timezone || "—"}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Subscription</p>
                  <div className="flex items-center gap-2 mt-1">
                    <SubscriptionBadge status={businessDetail.subscriptionStatus} />
                    {businessDetail.stripePlanId && (
                      <span className="text-xs text-muted-foreground">Plan: {businessDetail.stripePlanId}</span>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Trial Ends</p>
                  <p className="text-sm">{businessDetail.trialEndsAt ? formatDate(businessDetail.trialEndsAt) : "—"}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Phone</p>
                  <p className="text-sm">{businessDetail.twilioPhoneNumber || "Not provisioned"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">AI Receptionist</p>
                  <p className="text-sm font-mono text-xs">{(businessDetail.retellAgentId || businessDetail.vapiAssistantId) ? ((businessDetail.retellAgentId || businessDetail.vapiAssistantId) as string).slice(0, 20) + "..." : "Not set"}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Receptionist</p>
                  <Badge variant={businessDetail.receptionistEnabled ? "success" : "secondary"}>
                    {businessDetail.receptionistEnabled ? "Enabled" : "Disabled"}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Booking Slug</p>
                  <p className="text-sm font-mono">{businessDetail.bookingSlug || "—"}</p>
                </div>
              </div>

              <div className="border-t pt-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Usage Stats</p>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-muted/50 rounded-lg p-3 text-center">
                    <p className="text-lg font-bold">{businessDetail.callCount}</p>
                    <p className="text-xs text-muted-foreground">Calls</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3 text-center">
                    <p className="text-lg font-bold">{businessDetail.appointmentCount}</p>
                    <p className="text-xs text-muted-foreground">Appointments</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3 text-center">
                    <p className="text-lg font-bold">{businessDetail.customerCount}</p>
                    <p className="text-xs text-muted-foreground">Customers</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3 text-center">
                    <p className="text-lg font-bold">{businessDetail.invoiceCount}</p>
                    <p className="text-xs text-muted-foreground">Invoices</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3 text-center">
                    <p className="text-lg font-bold">{businessDetail.staffCount}</p>
                    <p className="text-xs text-muted-foreground">Staff</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3 text-center">
                    <p className="text-lg font-bold">{businessDetail.serviceCount}</p>
                    <p className="text-xs text-muted-foreground">Services</p>
                  </div>
                </div>
              </div>

              {businessDetail.stripeCustomerId && (
                <div className="border-t pt-3">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Stripe</p>
                  <p className="text-xs font-mono text-muted-foreground">Customer: {businessDetail.stripeCustomerId}</p>
                  {businessDetail.stripeSubscriptionId && (
                    <p className="text-xs font-mono text-muted-foreground">Subscription: {businessDetail.stripeSubscriptionId}</p>
                  )}
                </div>
              )}

              <div className="border-t pt-3">
                <p className="text-xs text-muted-foreground">
                  Created: {businessDetail.createdAt ? formatDate(businessDetail.createdAt) : "—"}
                  {businessDetail.subscriptionStartDate && ` | Sub started: ${formatDate(businessDetail.subscriptionStartDate)}`}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-4">Could not load business details</p>
          )}
        </DialogContent>
      </Dialog>

      {/* Provision/Deprovision Confirm Dialog */}
      <AlertDialog open={confirmAction !== null} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.type === "provision" ? "Re-provision Business?" : "Deprovision Business?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.type === "provision"
                ? `This will provision a Twilio phone number and AI receptionist for "${confirmAction?.businessName}". This may incur costs.`
                : `This will release the Twilio phone number and delete the AI receptionist for "${confirmAction?.businessName}". The business will no longer receive AI calls.`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmAction) {
                  if (confirmAction.type === "provision") {
                    provisionMutation.mutate(confirmAction.businessId);
                  } else {
                    deprovisionMutation.mutate(confirmAction.businessId);
                  }
                  setConfirmAction(null);
                }
              }}
              className={confirmAction?.type === "deprovision" ? "bg-red-600 hover:bg-red-700" : ""}
            >
              {confirmAction?.type === "provision" ? "Re-provision" : "Deprovision"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Change Subscription Status Dialog */}
      <Dialog open={subStatusBiz !== null} onOpenChange={(open) => !open && setSubStatusBiz(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Subscription Status</DialogTitle>
            <DialogDescription>
              Update subscription status for "{subStatusBiz?.name}".
              Current: {subStatusBiz?.currentStatus || "inactive"}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2 pt-2">
            {["active", "trialing", "past_due", "canceled", "grace_period", "expired", "inactive"].map((status) => (
              <Button
                key={status}
                variant={subStatusBiz?.currentStatus === status ? "default" : "outline"}
                size="sm"
                className="capitalize"
                disabled={subStatusBiz?.currentStatus === status || subStatusMutation.isPending}
                onClick={() => {
                  if (subStatusBiz) {
                    subStatusMutation.mutate({ businessId: subStatusBiz.id, status });
                  }
                }}
              >
                {subStatusMutation.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
                {status.replace(/_/g, " ")}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Users Tab ───────────────────────────────────────────────────────────

function UsersTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [resetPasswordUser, setResetPasswordUser] = useState<{ id: number; username: string } | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const { data, isLoading } = useQuery<{ users: AdminUser[] }>({
    queryKey: ["/api/admin/users"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/users");
      return res.json();
    },
  });

  const disableUserMutation = useMutation({
    mutationFn: async (userId: number) => {
      const res = await apiRequest("POST", `/api/admin/users/${userId}/disable`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "User disabled" });
      qc.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to disable user", description: err.message, variant: "destructive" });
    },
  });

  const enableUserMutation = useMutation({
    mutationFn: async (userId: number) => {
      const res = await apiRequest("POST", `/api/admin/users/${userId}/enable`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "User enabled" });
      qc.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to enable user", description: err.message, variant: "destructive" });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async ({ userId, newPassword }: { userId: number; newPassword: string }) => {
      const res = await apiRequest("POST", `/api/admin/users/${userId}/reset-password`, { newPassword });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Password reset", description: "The user's password has been changed." });
      setResetPasswordUser(null);
      setNewPassword("");
    },
    onError: (err: Error) => {
      toast({ title: "Password reset failed", description: err.message, variant: "destructive" });
    },
  });

  const changeRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: number; role: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/users/${userId}/role`, { role });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Role updated" });
      qc.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
    onError: (err: Error) => {
      toast({ title: "Role change failed", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return <LoadingSpinner />;
  }

  const users = data?.users || [];

  return (
    <>
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
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
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
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>User Actions</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          {u.active !== false ? (
                            <DropdownMenuItem
                              onClick={() => disableUserMutation.mutate(u.id)}
                              className="text-red-600"
                            >
                              <UserX className="h-4 w-4 mr-2" />
                              Disable Account
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onClick={() => enableUserMutation.mutate(u.id)}>
                              <UserCheck className="h-4 w-4 mr-2" />
                              Enable Account
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => setResetPasswordUser({ id: u.id, username: u.username })}>
                            <KeyRound className="h-4 w-4 mr-2" />
                            Reset Password
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuSub>
                            <DropdownMenuSubTrigger>
                              <Shield className="h-4 w-4 mr-2" />
                              Change Role
                            </DropdownMenuSubTrigger>
                            <DropdownMenuSubContent>
                              {["user", "staff", "admin"].map((role) => (
                                <DropdownMenuItem
                                  key={role}
                                  onClick={() => changeRoleMutation.mutate({ userId: u.id, role })}
                                  disabled={u.role === role}
                                  className="capitalize"
                                >
                                  {role === u.role && <CheckCircle className="h-3 w-3 mr-2 text-emerald-500" />}
                                  {role !== u.role && <span className="w-[20px]" />}
                                  {role}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuSubContent>
                          </DropdownMenuSub>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Reset Password Dialog */}
      <Dialog open={resetPasswordUser !== null} onOpenChange={(open) => { if (!open) { setResetPasswordUser(null); setNewPassword(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>
              Set a new password for user "{resetPasswordUser?.username}".
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">New Password</label>
              <Input
                type="password"
                placeholder="Enter new password (12+ chars, mixed case, number, special)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Must be 12+ characters with uppercase, lowercase, number, and special character.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setResetPasswordUser(null); setNewPassword(""); }}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (resetPasswordUser && newPassword) {
                  resetPasswordMutation.mutate({ userId: resetPasswordUser.id, newPassword });
                }
              }}
              disabled={!newPassword || newPassword.length < 12 || resetPasswordMutation.isPending}
            >
              {resetPasswordMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Reset Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
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

      {/* MRR Forecast */}
      {revenue.forecast && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-blue-500" />
              MRR Forecast
            </CardTitle>
            <CardDescription>
              {revenue.forecast.methodology} &bull; Monthly growth: {revenue.forecast.growthRate > 0 ? '+' : ''}{revenue.forecast.growthRate}%
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Pessimistic</TableHead>
                  <TableHead className="text-right">Projected</TableHead>
                  <TableHead className="text-right">Optimistic</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {revenue.forecast.months.map((m) => (
                  <TableRow key={m.month}>
                    <TableCell className="font-medium">{m.month}</TableCell>
                    <TableCell className="text-right text-red-600">${m.pessimistic.toFixed(2)}</TableCell>
                    <TableCell className="text-right font-semibold">${m.projected.toFixed(2)}</TableCell>
                    <TableCell className="text-right text-emerald-600">${m.optimistic.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
  coordinator: <Zap className="h-5 w-5 text-orange-500" />,
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
  const d = typeof details === 'string' ? (() => { try { return JSON.parse(details); } catch { return {}; } })() : details;
  if (!d) return <p className="text-muted-foreground">No details available.</p>;

  // Churn risk score detail (from churn_prediction or coordinator)
  if (d.churnScore !== undefined || (d.score !== undefined && d.riskLevel)) {
    const score = d.churnScore || d.score;
    const riskLevel = d.riskLevel || (score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low');
    const riskColor = riskLevel === 'high' ? 'text-red-600' : riskLevel === 'medium' ? 'text-amber-600' : 'text-emerald-600';
    const factors = d.factors || d.topFactors || [];
    const recommendations = d.recommendations || [];

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="text-center">
            <p className={`text-4xl font-bold ${riskColor}`}>{score}</p>
            <p className="text-xs text-muted-foreground">Churn Risk</p>
          </div>
          <div>
            <Badge variant={riskLevel === 'high' ? 'destructive' : riskLevel === 'medium' ? 'secondary' : 'default'}>
              {riskLevel} risk
            </Badge>
            {d.businessName && <p className="text-sm font-medium mt-1">{d.businessName}</p>}
          </div>
        </div>
        {factors.length > 0 && (
          <div>
            <p className="text-sm font-medium mb-2">Risk Factors</p>
            <ul className="space-y-1">
              {factors.map((f: any, i: number) => (
                <li key={i} className="text-sm text-muted-foreground flex items-start gap-2">
                  <span className="text-red-400 mt-0.5">•</span>
                  {typeof f === 'string' ? f : f.detail || f.factor}
                </li>
              ))}
            </ul>
          </div>
        )}
        {recommendations.length > 0 && (
          <div>
            <p className="text-sm font-medium mb-2">Recommended Actions</p>
            <ul className="space-y-1">
              {recommendations.map((r: string, i: number) => (
                <li key={i} className="text-sm text-blue-700 flex items-start gap-2">
                  <span className="mt-0.5">→</span> {r}
                </li>
              ))}
            </ul>
          </div>
        )}
        {d.interventionType && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
            <p className="text-sm text-emerald-800 font-medium">✓ Intervention sent: {d.interventionType.replace(/_/g, ' ')}</p>
          </div>
        )}
      </div>
    );
  }

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
            {typeof value === 'object' ? (() => { try { return JSON.stringify(value, null, 2); } catch { return '[complex object]'; } })() : String(value)}
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
                service="Retell AI (Voice)"
                details={`${costsData.costs.vapi?.callCount ?? 0} calls — transport, STT, LLM, TTS`}
                cost={costsData.costs.vapi?.total ?? 0}
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
  if (status === "grace_period") {
    return <Badge variant="outline" className="text-amber-600 border-amber-300">Grace Period</Badge>;
  }
  if (status === "expired") {
    return <Badge variant="destructive">Expired</Badge>;
  }
  if (status === "canceled") {
    return <Badge variant="secondary" className="text-red-600">Canceled</Badge>;
  }
  return <Badge variant="secondary" className="capitalize">{status.replace(/_/g, " ")}</Badge>;
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

// ── Platform Messages Tab ──────────────────────────────────────────────

interface PlatformMessage {
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

/** Format platform notification types into readable labels */
function formatPlatformType(type: string): string {
  if (type.startsWith("drip:")) {
    const parts = type.split(":");
    const campaign = parts[1] || "";
    const step = parts[2] || "";
    const labels: Record<string, string> = {
      "onboarding:day1": "Onboarding — Day 1",
      "onboarding:day3": "Onboarding — Day 3",
      "onboarding:day7": "Onboarding — Day 7",
      "trial:expired": "Trial Expired",
      "trial:winback3": "Trial Win-back",
      "winback:day7": "Win-back — Day 7",
      "winback:day30": "Win-back — Day 30",
    };
    return labels[`${campaign}:${step}`] || `Drip: ${campaign} ${step}`;
  }
  if (type.startsWith("grace_period_")) {
    const day = type.replace("grace_period_", "");
    return `Grace Period — Day ${day}`;
  }
  if (type === "trial_expiration_warning") return "Trial Expiration Warning";
  if (type === "trial_deprovisioned") return "Phone Number Released";
  if (type.startsWith("onboarding_coach:")) return "Onboarding Nudge";
  if (type.startsWith("invoice_reminder:")) {
    const match = type.match(/(\d+)d/);
    return match ? `Invoice Reminder — ${match[1]}d Overdue` : "Invoice Reminder";
  }
  return type
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Badge color based on message category */
function getPlatformTypeBadgeVariant(type: string): "default" | "secondary" | "destructive" | "outline" {
  if (type.startsWith("drip:") || type.startsWith("onboarding_coach:")) return "secondary";
  if (type.startsWith("grace_period_") || type === "trial_deprovisioned") return "destructive";
  if (type === "trial_expiration_warning") return "default";
  return "outline";
}

function PlatformMessagesTab() {
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [limit, setLimit] = useState(100);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  const { data: messages = [], isLoading, refetch, isFetching } = useQuery<PlatformMessage[]>({
    queryKey: ["/api/admin/platform-messages", limit],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/admin/platform-messages?limit=${limit}`);
      return res.json();
    },
  });

  // Apply filters
  let filtered = messages;
  if (channelFilter !== "all") {
    filtered = filtered.filter((l) => l.channel === channelFilter);
  }
  if (typeFilter === "drip") {
    filtered = filtered.filter((l) => l.type.startsWith("drip:"));
  } else if (typeFilter === "trial") {
    filtered = filtered.filter((l) => l.type.includes("trial") || l.type.startsWith("grace_period_"));
  } else if (typeFilter === "onboarding") {
    filtered = filtered.filter((l) => l.type.startsWith("onboarding_coach:"));
  } else if (typeFilter === "invoices") {
    filtered = filtered.filter((l) => l.type.startsWith("invoice_reminder:"));
  }

  const emailCount = messages.filter((l) => l.channel === "email").length;
  const smsCount = messages.filter((l) => l.channel === "sms").length;
  const failedCount = messages.filter((l) => l.status === "failed").length;
  const dripCount = messages.filter((l) => l.type.startsWith("drip:")).length;
  const trialCount = messages.filter((l) => l.type.includes("trial") || l.type.startsWith("grace_period_")).length;

  const toggleRow = (id: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Platform Messages
              </CardTitle>
              <CardDescription>
                Emails and SMS sent to business owners — drip campaigns, trial warnings, onboarding nudges, and grace period notifications
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>

          {/* Summary badges */}
          <div className="flex gap-3 pt-2 flex-wrap">
            <Badge variant="secondary" className="gap-1">
              <Mail className="h-3 w-3" />
              {emailCount} emails
            </Badge>
            {smsCount > 0 && (
              <Badge variant="secondary" className="gap-1">
                <MessageSquare className="h-3 w-3" />
                {smsCount} SMS
              </Badge>
            )}
            {dripCount > 0 && (
              <Badge variant="secondary" className="gap-1">
                <Bot className="h-3 w-3" />
                {dripCount} drip
              </Badge>
            )}
            {trialCount > 0 && (
              <Badge variant="outline" className="gap-1">
                <AlertCircle className="h-3 w-3" />
                {trialCount} trial
              </Badge>
            )}
            {failedCount > 0 && (
              <Badge variant="destructive" className="gap-1">
                <XCircle className="h-3 w-3" />
                {failedCount} failed
              </Badge>
            )}
          </div>
        </CardHeader>

        <CardContent>
          {/* Filters */}
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <Select value={channelFilter} onValueChange={setChannelFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Channel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All channels</SelectItem>
                <SelectItem value="email">Email only</SelectItem>
                <SelectItem value="sms">SMS only</SelectItem>
                <SelectItem value="system">System only</SelectItem>
              </SelectContent>
            </Select>

            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="drip">Drip Campaigns</SelectItem>
                <SelectItem value="trial">Trial & Grace</SelectItem>
                <SelectItem value="onboarding">Onboarding</SelectItem>
                <SelectItem value="invoices">Invoice Reminders</SelectItem>
              </SelectContent>
            </Select>

            <Select value={String(limit)} onValueChange={(v) => setLimit(parseInt(v))}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="Show" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="50">Last 50</SelectItem>
                <SelectItem value="100">Last 100</SelectItem>
                <SelectItem value="200">Last 200</SelectItem>
                <SelectItem value="500">Last 500</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <LoadingSpinner />
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No platform messages sent yet. Drip campaigns, trial warnings, and onboarding emails will appear here.
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]"></TableHead>
                    <TableHead>Business</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Subject / Message</TableHead>
                    <TableHead className="w-[70px]">Status</TableHead>
                    <TableHead className="w-[130px]">Sent</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((log) => {
                    const isExpanded = expandedRows.has(log.id);
                    const hasContent = !!(log.message || log.subject);
                    const previewText = log.subject || (log.message ? log.message.slice(0, 100) + (log.message.length > 100 ? "..." : "") : "—");

                    return (
                      <Fragment key={log.id}>
                        <TableRow
                          className={hasContent ? "cursor-pointer hover:bg-muted/50" : ""}
                          onClick={() => hasContent && toggleRow(log.id)}
                        >
                          <TableCell>
                            {log.channel === "email" ? (
                              <Mail className="h-4 w-4 text-blue-500" />
                            ) : log.channel === "sms" ? (
                              <MessageSquare className="h-4 w-4 text-green-500" />
                            ) : (
                              <Bot className="h-4 w-4 text-purple-500" />
                            )}
                          </TableCell>
                          <TableCell className="text-sm">
                            <div className="flex flex-col">
                              <span className="font-medium text-foreground">{log.businessName}</span>
                              <span className="text-xs text-muted-foreground">{log.recipient}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">
                            <Badge variant={getPlatformTypeBadgeVariant(log.type)} className="text-xs">
                              {formatPlatformType(log.type)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm max-w-[350px]">
                            <div className="flex items-center gap-1">
                              <span className={isExpanded ? "" : "truncate"}>
                                {isExpanded ? "" : previewText}
                              </span>
                              {hasContent && (
                                isExpanded ? (
                                  <ChevronUp className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                                ) : (
                                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                                )
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {log.status === "sent" || log.status === "delivered" ? (
                              <CheckCircle className="h-4 w-4 text-green-500" />
                            ) : (
                              <XCircle className="h-4 w-4 text-destructive" />
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {log.sentAt ? formatRelative(log.sentAt) : "—"}
                          </TableCell>
                        </TableRow>
                        {isExpanded && hasContent && (
                          <TableRow key={`${log.id}-expanded`}>
                            <TableCell colSpan={6} className="bg-muted/30 px-6 py-3">
                              {log.subject && (
                                <div className="text-xs font-medium text-muted-foreground mb-1">Subject: {log.subject}</div>
                              )}
                              <div className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                                {log.message || "No message body recorded."}
                              </div>
                              {log.error && (
                                <div className="mt-2 text-xs text-destructive bg-destructive/5 border border-destructive/20 rounded p-2">
                                  Error: {log.error}
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Failed message details */}
          {filtered.some((l) => l.status === "failed" && l.error) && (
            <div className="mt-4 space-y-2">
              <p className="text-sm font-medium text-destructive">Failed message details:</p>
              {filtered
                .filter((l) => l.status === "failed" && l.error)
                .slice(0, 5)
                .map((l) => (
                  <div key={l.id} className="text-xs bg-destructive/5 border border-destructive/20 rounded p-2">
                    <span className="font-medium">{formatPlatformType(l.type)}</span> to {l.businessName} ({l.recipient}):{" "}
                    <span className="text-destructive">{l.error}</span>
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
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

  const { data: posts = [], isLoading } = useQuery<BlogPost[]>({
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
                {(posts || []).map((post) => (
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
                      {post.createdAt ? new Date(post.createdAt).toLocaleDateString() : "—"}
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

// ── Audit Log Tab ──────────────────────────────────────────────────────

function AuditLogTab() {
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState("all");
  const limit = 30;

  const { data, isLoading } = useQuery<{ logs: AuditLogEntry[]; total: number; page: number; limit: number }>({
    queryKey: ["/api/admin/audit-logs", page, actionFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (actionFilter !== "all") params.set("action", actionFilter);
      const res = await apiRequest("GET", `/api/admin/audit-logs?${params}`);
      return res.json();
    },
  });

  const totalPages = data ? Math.ceil(data.total / limit) : 0;

  const ACTION_STYLES: Record<string, string> = {
    admin_provision: "bg-emerald-100 text-emerald-800",
    admin_deprovision: "bg-red-100 text-red-800",
    admin_disable_user: "bg-red-100 text-red-800",
    admin_enable_user: "bg-emerald-100 text-emerald-800",
    admin_reset_password: "bg-amber-100 text-amber-800",
    admin_change_role: "bg-blue-100 text-blue-800",
    admin_change_subscription: "bg-purple-100 text-purple-800",
    admin_extend_trial: "bg-blue-100 text-blue-800",
    admin_impersonate: "bg-amber-100 text-amber-800",
    admin_stop_impersonation: "bg-gray-100 text-gray-800",
  };

  const adminActions = [
    "admin_provision", "admin_deprovision", "admin_disable_user", "admin_enable_user",
    "admin_reset_password", "admin_change_role", "admin_change_subscription",
    "admin_extend_trial", "admin_impersonate", "admin_stop_impersonation",
    "login", "login_failed", "logout", "password_change", "settings_change",
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ScrollText className="h-5 w-5" />
            Audit Log
          </CardTitle>
          <CardDescription>All admin and security actions with timestamps and IP addresses</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-4">
            <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Filter by action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                {adminActions.map(a => (
                  <SelectItem key={a} value={a}>{a.replace(/_/g, ' ')}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : !data || data.logs.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No audit log entries found</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Resource</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead>IP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-xs whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </TableCell>
                      <TableCell className="text-sm">{log.username}</TableCell>
                      <TableCell>
                        <Badge className={`text-xs ${ACTION_STYLES[log.action] || "bg-gray-100 text-gray-800"}`}>
                          {log.action.replace(/_/g, ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {log.resource ? `${log.resource} #${log.resourceId}` : '—'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                        {log.details ? (typeof log.details === 'string' ? log.details : (() => { try { return JSON.stringify(log.details); } catch { return '[complex object]'; } })()) : '—'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{log.ipAddress || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <span className="text-sm text-muted-foreground">{data.total} total entries</span>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
                    <span className="text-sm py-1.5">Page {page} of {totalPages}</span>
                    <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default AdminDashboardPage;
