import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Zap } from "lucide-react";
import type { SystemHealth } from "../types";
import { ServiceStatusIcon, InfoRow, LoadingSpinner, formatUptime } from "../shared";

interface IntelligenceRefreshResult {
  total: number;
  refreshed: number;
  skipped: number;
  failed: number;
  errors: { businessId: number; error: string }[];
}

function SystemTab() {
  const { toast } = useToast();
  const [lastResult, setLastResult] = useState<IntelligenceRefreshResult | null>(null);

  const { data: health, isLoading } = useQuery<SystemHealth>({
    queryKey: ["/api/admin/system"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/system");
      return res.json();
    },
    refetchInterval: 30000,
  });

  const refreshMutation = useMutation<IntelligenceRefreshResult, Error, void>({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/intelligence-refresh/run");
      return res.json();
    },
    onSuccess: (data) => {
      setLastResult(data);
      toast({
        title: "Intelligence refresh complete",
        description: `${data.refreshed} agent prompts refreshed, ${data.skipped} skipped, ${data.failed} failed.`,
      });
    },
    onError: (err) => {
      toast({
        title: "Refresh failed",
        description: err.message ?? "Unknown error",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!health) {
    return <p className="text-center text-muted-foreground py-8">Could not load system health</p>;
  }

  return (
    <div className="space-y-6">
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

      <Card>
        <CardHeader>
          <CardTitle>Maintenance Actions</CardTitle>
          <CardDescription>Manually trigger scheduled jobs for testing or after platform changes</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-start justify-between gap-4 p-4 border rounded-lg">
            <div className="flex items-start gap-3 min-w-0">
              <Zap className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="font-medium">Run Intelligence Refresh</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Rebuild Retell agent system prompts with fresh call patterns. Normally runs every 7 days. Skips dormant businesses and ones refreshed within 6 days.
                </p>
              </div>
            </div>
            <Button
              onClick={() => refreshMutation.mutate()}
              disabled={refreshMutation.isPending}
              data-testid="button-run-intelligence-refresh"
              className="flex-shrink-0"
            >
              {refreshMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Running...
                </>
              ) : (
                "Run Now"
              )}
            </Button>
          </div>

          {lastResult && (
            <div
              className="p-4 border rounded-lg bg-muted/30 text-sm space-y-2"
              data-testid="intelligence-refresh-result"
            >
              <div className="font-medium">Last run result:</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div>
                  <div className="text-muted-foreground">Total</div>
                  <div className="text-lg font-semibold">{lastResult.total}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Refreshed</div>
                  <div className="text-lg font-semibold text-green-600">{lastResult.refreshed}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Skipped</div>
                  <div className="text-lg font-semibold text-gray-500">{lastResult.skipped}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Failed</div>
                  <div className={`text-lg font-semibold ${lastResult.failed > 0 ? 'text-red-600' : 'text-gray-500'}`}>
                    {lastResult.failed}
                  </div>
                </div>
              </div>
              {lastResult.errors.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                    {lastResult.errors.length} error{lastResult.errors.length === 1 ? '' : 's'} — show details
                  </summary>
                  <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                    {lastResult.errors.map((err, i) => (
                      <div key={i} className="text-xs font-mono p-2 bg-red-50 border border-red-200 rounded">
                        Business #{err.businessId}: {err.error}
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default SystemTab;
