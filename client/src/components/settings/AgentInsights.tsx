import { useState } from "react";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Brain,
  TrendingDown,
  TrendingUp,
  Users,
  AlertTriangle,
  HeartPulse,
  Star,
  BarChart3,
  RefreshCw,
  FileText,
  Share2,
} from "lucide-react";

interface AgentLog {
  id: number;
  businessId: number;
  agentType: string;
  action: string;
  customerId?: number | null;
  referenceType?: string | null;
  referenceId?: number | null;
  details: any;
  createdAt: string;
}

const AGENT_LABELS: Record<string, { label: string; icon: typeof Brain; color: string }> = {
  "platform:health_score": { label: "Health Score", icon: HeartPulse, color: "text-green-600" },
  "platform:churn_prediction": { label: "Churn Prediction", icon: TrendingDown, color: "text-red-500" },
  "platform:lead_scoring": { label: "Lead Scoring", icon: TrendingUp, color: "text-blue-500" },
  "platform:support_triage": { label: "Support Triage", icon: AlertTriangle, color: "text-amber-500" },
  "platform:revenue_optimization": { label: "Revenue Optimization", icon: BarChart3, color: "text-purple-500" },
  "platform:testimonial": { label: "Testimonial Finder", icon: Star, color: "text-yellow-500" },
  "platform:onboarding_coach": { label: "Onboarding Coach", icon: Users, color: "text-cyan-500" },
  "platform:content_seo": { label: "Content & SEO", icon: FileText, color: "text-indigo-500" },
  "platform:social_media": { label: "Social Media", icon: Share2, color: "text-pink-500" },
};

function formatAction(action: string): string {
  return action
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function ScoreBadge({ score, type }: { score: number; type: "health" | "churn" | "lead" }) {
  let color = "bg-gray-100 text-gray-700";
  if (type === "health") {
    if (score >= 80) color = "bg-green-100 text-green-700";
    else if (score >= 60) color = "bg-blue-100 text-blue-700";
    else if (score >= 40) color = "bg-amber-100 text-amber-700";
    else color = "bg-red-100 text-red-700";
  } else if (type === "churn") {
    if (score >= 70) color = "bg-red-100 text-red-700";
    else if (score >= 40) color = "bg-amber-100 text-amber-700";
    else color = "bg-green-100 text-green-700";
  } else if (type === "lead") {
    if (score >= 70) color = "bg-green-100 text-green-700";
    else if (score >= 40) color = "bg-amber-100 text-amber-700";
    else color = "bg-gray-100 text-gray-700";
  }
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${color}`}>{score}/100</span>;
}

function InsightCard({ log }: { log: AgentLog }) {
  const agentInfo = AGENT_LABELS[log.agentType] || { label: log.agentType, icon: Brain, color: "text-gray-500" };
  const Icon = agentInfo.icon;
  const d = log.details || {};

  return (
    <div className="flex items-start gap-3 border-b last:border-0 py-3">
      <div className={`mt-0.5 ${agentInfo.color}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">{agentInfo.label}</span>
          <Badge variant="outline" className="text-xs">{formatAction(log.action)}</Badge>
          {d.score !== undefined && (
            <ScoreBadge
              score={d.score}
              type={
                log.agentType.includes("health") ? "health" :
                log.agentType.includes("churn") ? "churn" : "lead"
              }
            />
          )}
          {d.tier && (
            <Badge variant="secondary" className="text-xs capitalize">{d.tier}</Badge>
          )}
          {d.riskLevel && (
            <Badge
              variant={d.riskLevel === "high" ? "destructive" : "secondary"}
              className="text-xs capitalize"
            >
              {d.riskLevel} risk
            </Badge>
          )}
          {d.severity && (
            <Badge
              variant={d.severity === "critical" ? "destructive" : "secondary"}
              className="text-xs capitalize"
            >
              {d.severity}
            </Badge>
          )}
        </div>

        {/* Show key details */}
        {d.factors && Array.isArray(d.factors) && d.factors.length > 0 && (
          <p className="text-xs text-muted-foreground mt-1 truncate">
            Factors: {d.factors.slice(0, 3).join(", ")}
            {d.factors.length > 3 && ` +${d.factors.length - 3} more`}
          </p>
        )}
        {d.recommendations && Array.isArray(d.recommendations) && (
          <p className="text-xs text-muted-foreground mt-1 truncate">
            Action: {d.recommendations[0]}
          </p>
        )}
        {d.recommendedAction && (
          <p className="text-xs text-muted-foreground mt-1">{d.recommendedAction}</p>
        )}
        {d.category && (
          <p className="text-xs text-muted-foreground mt-1 capitalize">Category: {d.category}</p>
        )}
        {d.message && (
          <p className="text-xs text-muted-foreground mt-1 truncate">{d.message}</p>
        )}
        {/* Content & SEO agent details */}
        {d.title && (
          <p className="text-xs text-muted-foreground mt-1 truncate">
            📝 {d.title} {d.wordCount ? `(${d.wordCount} words)` : ""}
          </p>
        )}
        {d.industry && !d.title && (
          <p className="text-xs text-muted-foreground mt-1 capitalize">Industry: {d.industry}</p>
        )}
        {d.generatedVia && (
          <Badge variant="outline" className="text-[10px] mt-1 mr-1">
            {d.generatedVia === "openai" ? "🤖 OpenAI" : "📋 Template"}
          </Badge>
        )}
        {d.platform && (
          <Badge variant="outline" className="text-[10px] mt-1 mr-1 capitalize">{d.platform}</Badge>
        )}
        {d.hasVideo && (
          <Badge variant="secondary" className="text-[10px] mt-1">🎬 Video</Badge>
        )}
        {d.blogsCreated !== undefined && (
          <p className="text-xs text-muted-foreground mt-1">
            📊 {d.blogsCreated} blogs, {d.socialDraftsCreated} social posts generated
          </p>
        )}
        {d.contentPreview && (
          <p className="text-xs text-muted-foreground mt-1 truncate italic">"{d.contentPreview}..."</p>
        )}

        <p className="text-xs text-muted-foreground/60 mt-1">
          {log.businessId > 0 ? `Business #${log.businessId} · ` : ""}{formatDate(log.createdAt)}
        </p>
      </div>
    </div>
  );
}

export default function AgentInsights() {
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [limit, setLimit] = useState(100);

  const { data: logs = [], isLoading, refetch, isFetching } = useQuery<AgentLog[]>({
    queryKey: ["/api/admin/agent-insights", agentFilter, limit],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: String(limit) });
      if (agentFilter !== "all") params.set("agentType", agentFilter);
      const res = await apiRequest("GET", `/api/admin/agent-insights?${params}`);
      return res.json();
    },
  });

  // Compute summary stats
  const healthLogs = logs.filter((l) => l.agentType === "platform:health_score" && l.details?.score !== undefined);
  const churnLogs = logs.filter((l) => l.agentType === "platform:churn_prediction" && l.details?.score !== undefined);
  const leadLogs = logs.filter((l) => l.agentType === "platform:lead_scoring" && l.details?.score !== undefined);
  const alerts = logs.filter((l) => l.action === "alert_generated" || l.action === "issue_detected");

  const avgHealth = healthLogs.length > 0
    ? Math.round(healthLogs.reduce((sum, l) => sum + (l.details?.score || 0), 0) / healthLogs.length)
    : null;
  const highChurn = churnLogs.filter((l) => l.details?.riskLevel === "high").length;
  const hotLeads = leadLogs.filter((l) => l.details?.tier === "hot").length;

  return (
    <div className="space-y-4">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <HeartPulse className="h-4 w-4 text-green-600" />
              <span className="text-xs text-muted-foreground">Avg Health</span>
            </div>
            <p className="text-2xl font-bold">{avgHealth !== null ? `${avgHealth}/100` : "—"}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="h-4 w-4 text-red-500" />
              <span className="text-xs text-muted-foreground">High Churn Risk</span>
            </div>
            <p className="text-2xl font-bold">{highChurn}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-blue-500" />
              <span className="text-xs text-muted-foreground">Hot Leads</span>
            </div>
            <p className="text-2xl font-bold">{hotLeads}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3 px-4">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <span className="text-xs text-muted-foreground">Alerts</span>
            </div>
            <p className="text-2xl font-bold">{alerts.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Activity Feed */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5" />
                Platform Agent Activity
              </CardTitle>
              <CardDescription>
                Insights from AI agents: health scores, churn predictions, lead scoring, support triage
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`h-4 w-4 mr-1 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          <div className="flex items-center gap-3 mb-4">
            <Select value={agentFilter} onValueChange={setAgentFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Agent type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All agents</SelectItem>
                <SelectItem value="platform:health_score">Health Score</SelectItem>
                <SelectItem value="platform:churn_prediction">Churn Prediction</SelectItem>
                <SelectItem value="platform:lead_scoring">Lead Scoring</SelectItem>
                <SelectItem value="platform:support_triage">Support Triage</SelectItem>
                <SelectItem value="platform:revenue_optimization">Revenue Optimization</SelectItem>
                <SelectItem value="platform:onboarding_coach">Onboarding Coach</SelectItem>
                <SelectItem value="platform:testimonial">Testimonial Finder</SelectItem>
                <SelectItem value="platform:content_seo">Content & SEO</SelectItem>
                <SelectItem value="platform:social_media">Social Media</SelectItem>
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
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading agent activity...</div>
          ) : logs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No agent activity yet. Platform agents run on schedules — results will appear here once they execute.
            </div>
          ) : (
            <div className="max-h-[600px] overflow-y-auto">
              {logs.map((log) => (
                <InsightCard key={log.id} log={log} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
