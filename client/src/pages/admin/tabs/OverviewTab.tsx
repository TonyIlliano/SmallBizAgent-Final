import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Users, Building, Phone, PhoneCall, Activity, DollarSign,
  Loader2, Clock, ShieldAlert, XCircle, AlertTriangle, AlertCircle,
  ChevronDown, ChevronUp,
} from "lucide-react";
import type { PlatformStats, RevenueData, AlertsResponse, PlatformAlert, AlertAction, ActivityItem } from "../types";
import { StatsCard, MiniStatCard, ActivityRow } from "../shared";

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
        break;
      case 'view_messages':
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

  useEffect(() => {
    if (statsUpdatedAt) {
      setLastUpdated(new Date(statsUpdatedAt));
    }
  }, [statsUpdatedAt]);

  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsAgo(Math.floor((Date.now() - lastUpdated.getTime()) / 1000));
    }, 5000);
    return () => clearInterval(interval);
  }, [lastUpdated]);

  const fmtSecondsAgo = (secs: number) => {
    if (secs < 5) return "just now";
    if (secs < 60) return `${secs}s ago`;
    const mins = Math.floor(secs / 60);
    return `${mins}m ago`;
  };

  return (
    <div className="space-y-6">
      {alertsData && alertsData.alertCount > 0 && (
        <AlertsBanner alerts={alertsData.alerts} alertCount={alertsData.alertCount} />
      )}

      <div className="flex justify-end">
        <span className="text-xs text-muted-foreground flex items-center gap-1">
          <Clock className="h-3 w-3" />
          Last updated: {fmtSecondsAgo(secondsAgo)}
          <span className="text-muted-foreground/50 ml-1">(auto-refreshes every 30s)</span>
        </span>
      </div>

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

      {revenue && (
        <div className="grid gap-4 md:grid-cols-4">
          <MiniStatCard label="Active Subs" value={revenue.activeCount} color="text-emerald-600" />
          <MiniStatCard label="Trialing" value={revenue.trialingCount} color="text-blue-600" />
          <MiniStatCard label="Past Due" value={revenue.pastDueCount} color="text-amber-600" />
          <MiniStatCard label="Inactive" value={revenue.inactiveCount} color="text-gray-500" />
        </div>
      )}

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

export default OverviewTab;
