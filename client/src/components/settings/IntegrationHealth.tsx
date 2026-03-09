import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Shield,
  MessageSquare,
  Phone,
  Mail,
  CreditCard,
  Brain,
  Calendar,
  Cloud,
  Video,
  HardDrive,
  Bug,
} from "lucide-react";

interface Integration {
  name: string;
  key: string;
  configured: boolean;
  required: boolean;
  description: string;
}

interface IntegrationHealthData {
  integrations: Integration[];
  summary: {
    total: number;
    configured: number;
    requiredMissing: string[];
  };
}

const ICON_MAP: Record<string, typeof Shield> = {
  twilio: MessageSquare,
  vapi: Phone,
  sendgrid: Mail,
  stripe: CreditCard,
  openai: Brain,
  google_calendar: Calendar,
  weather: Cloud,
  shotstack: Video,
  s3: HardDrive,
  sentry: Bug,
};

export default function IntegrationHealth() {
  const { data, isLoading, refetch, isFetching } = useQuery<IntegrationHealthData>({
    queryKey: ["/api/admin/integration-health"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/integration-health");
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Loading integration status...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Failed to load integration health data.
      </div>
    );
  }

  const { integrations, summary } = data;
  const requiredIntegrations = integrations.filter(i => i.required);
  const optionalIntegrations = integrations.filter(i => !i.required);

  return (
    <div className="space-y-4">
      {/* Summary Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <span className="text-xs text-muted-foreground">Configured</span>
            </div>
            <p className="text-2xl font-bold">
              {summary.configured}/{summary.total}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <Shield className="h-4 w-4 text-blue-500" />
              <span className="text-xs text-muted-foreground">Required OK</span>
            </div>
            <p className="text-2xl font-bold">
              {requiredIntegrations.filter(i => i.configured).length}/{requiredIntegrations.length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              {summary.requiredMissing.length > 0 ? (
                <AlertTriangle className="h-4 w-4 text-red-500" />
              ) : (
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              )}
              <span className="text-xs text-muted-foreground">Issues</span>
            </div>
            <p className="text-2xl font-bold">
              {summary.requiredMissing.length > 0
                ? `${summary.requiredMissing.length} missing`
                : "All good"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Required Missing Alert */}
      {summary.requiredMissing.length > 0 && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5" />
              <div>
                <p className="font-medium text-red-800">Missing Required Integrations</p>
                <p className="text-sm text-red-700 mt-1">
                  {summary.requiredMissing.join(", ")} — these need to be configured in your Railway environment variables for full functionality.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Integration List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Integration Status
              </CardTitle>
              <CardDescription>
                Third-party service connections and their configuration status
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`h-4 w-4 mr-1 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          {/* Required Integrations */}
          <div className="mb-4">
            <h4 className="text-sm font-medium text-muted-foreground mb-3">Required</h4>
            <div className="space-y-2">
              {requiredIntegrations.map((integration) => (
                <IntegrationRow key={integration.key} integration={integration} />
              ))}
            </div>
          </div>

          {/* Optional Integrations */}
          <div>
            <h4 className="text-sm font-medium text-muted-foreground mb-3">Optional</h4>
            <div className="space-y-2">
              {optionalIntegrations.map((integration) => (
                <IntegrationRow key={integration.key} integration={integration} />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function IntegrationRow({ integration }: { integration: Integration }) {
  const Icon = ICON_MAP[integration.key] || Shield;

  return (
    <div className="flex items-center gap-3 py-2 px-3 rounded-lg border">
      <div className={integration.configured ? "text-green-600" : "text-gray-400"}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{integration.name}</span>
          {integration.configured ? (
            <Badge className="bg-green-100 text-green-700 hover:bg-green-100 text-xs">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Connected
            </Badge>
          ) : (
            <Badge variant={integration.required ? "destructive" : "secondary"} className="text-xs">
              <XCircle className="h-3 w-3 mr-1" />
              {integration.required ? "Missing" : "Not configured"}
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{integration.description}</p>
      </div>
    </div>
  );
}
