import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, CheckCircle, XCircle } from "lucide-react";
import type { HealthCheckEntry } from "../types";

function MonitoringTab() {
  const { data: systemHealth, isLoading: healthLoading } = useQuery<{
    services: Array<{ name: string; status: string; details?: string; responseTimeMs?: number }>;
    serverInfo: { nodeVersion: string; uptime: number; environment: string; memoryUsage: { heapUsed: number; heapTotal: number } };
  }>({
    queryKey: ["/api/admin/system"],
    refetchInterval: 60000,
  });

  const { data: historyData } = useQuery<{ history: HealthCheckEntry[] }>({
    queryKey: ["/api/admin/health-history", { hours: 24 }],
    queryFn: async () => {
      const res = await fetch("/api/admin/health-history?hours=24", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch health history");
      return res.json();
    },
    refetchInterval: 300000,
  });

  const queryClient = useQueryClient();

  const uptimeByService: Record<string, { total: number; healthy: number }> = {};
  if (historyData?.history) {
    for (const entry of historyData.history) {
      if (!uptimeByService[entry.serviceName]) {
        uptimeByService[entry.serviceName] = { total: 0, healthy: 0 };
      }
      uptimeByService[entry.serviceName].total++;
      if (entry.status === "healthy") uptimeByService[entry.serviceName].healthy++;
    }
  }

  const incidents = historyData?.history?.filter(e => e.status === "down") || [];

  function statusDot(status: string) {
    if (status === "connected" || status === "healthy") return "bg-green-500";
    if (status === "degraded") return "bg-yellow-500";
    return "bg-red-500";
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Service Status</h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            queryClient.invalidateQueries({ queryKey: ["/api/admin/system"] });
            queryClient.invalidateQueries({ queryKey: ["/api/admin/health-history"] });
          }}
        >
          <RefreshCw className="h-4 w-4 mr-1" /> Refresh
        </Button>
      </div>

      {healthLoading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Checking services...
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {systemHealth?.services.map((svc) => {
            const uptimeInfo = uptimeByService[svc.name];
            const uptimePct = uptimeInfo ? Math.round((uptimeInfo.healthy / uptimeInfo.total) * 100) : null;
            return (
              <Card key={svc.name}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div className={`h-3 w-3 rounded-full ${statusDot(svc.status)}`} />
                    <span className="font-medium text-sm">{svc.name}</span>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <div>Status: <span className="font-medium">{svc.status}</span></div>
                    {svc.responseTimeMs != null && (
                      <div>Response: <span className="font-medium">{svc.responseTimeMs}ms</span></div>
                    )}
                    {uptimePct !== null && (
                      <div>24h uptime: <span className={`font-medium ${uptimePct >= 99 ? "text-green-600" : uptimePct >= 95 ? "text-yellow-600" : "text-red-600"}`}>{uptimePct}%</span></div>
                    )}
                    {svc.details && svc.status === "error" && (
                      <div className="text-red-500 truncate" title={svc.details}>{svc.details}</div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {systemHealth?.serverInfo && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Server Info</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-6 text-sm">
              <div><span className="text-muted-foreground">Node:</span> {systemHealth.serverInfo.nodeVersion}</div>
              <div><span className="text-muted-foreground">Uptime:</span> {Math.floor(systemHealth.serverInfo.uptime / 3600)}h {Math.floor((systemHealth.serverInfo.uptime % 3600) / 60)}m</div>
              <div><span className="text-muted-foreground">Env:</span> {systemHealth.serverInfo.environment}</div>
              <div><span className="text-muted-foreground">Memory:</span> {systemHealth.serverInfo.memoryUsage.heapUsed}MB / {systemHealth.serverInfo.memoryUsage.heapTotal}MB</div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Recent Incidents (24h)</CardTitle>
          <CardDescription>Times when a service was detected as down</CardDescription>
        </CardHeader>
        <CardContent>
          {incidents.length === 0 ? (
            <div className="flex items-center gap-2 text-green-600 text-sm">
              <CheckCircle className="h-4 w-4" /> No incidents in the last 24 hours
            </div>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {incidents.slice(0, 20).map((inc, i) => (
                <div key={i} className="flex items-center gap-3 text-sm border-b pb-2">
                  <XCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
                  <span className="font-medium">{inc.serviceName}</span>
                  <span className="text-muted-foreground truncate flex-1">{inc.errorMessage || "Unreachable"}</span>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(inc.checkedAt).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default MonitoringTab;
