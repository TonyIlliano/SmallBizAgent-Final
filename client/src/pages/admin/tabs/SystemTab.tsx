import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { SystemHealth } from "../types";
import { ServiceStatusIcon, InfoRow, LoadingSpinner, formatUptime } from "../shared";

function SystemTab() {
  const { data: health, isLoading } = useQuery<SystemHealth>({
    queryKey: ["/api/admin/system"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/system");
      return res.json();
    },
    refetchInterval: 30000,
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
    </div>
  );
}

export default SystemTab;
