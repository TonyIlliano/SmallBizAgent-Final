import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Loader2, Bot, Play, ChevronDown, ChevronUp, Bell,
  Brain, Target, Heart, Wrench, Zap, FileText, Star, Search, Share2,
  TrendingUp,
} from "lucide-react";
import type { PlatformAgent, AgentActivityLogEntry, PlatformAgentsSummary } from "../types";
import { LoadingSpinner, formatRelative } from "../shared";

// ── Constants ────────────────────────────────────────────────────────────

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

// ── Helper Functions ─────────────────────────────────────────────────────

function formatAgentDetails(details: any): string {
  if (!details) return "\u2014";
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
    const keys = Object.keys(d);
    if (keys.length > 0) return `${keys[0]}: ${JSON.stringify(d[keys[0]]).slice(0, 60)}`;
    return "\u2014";
  } catch {
    return String(details).slice(0, 80);
  }
}

// ── Agent Detail View ────────────────────────────────────────────────────

function AgentDetailView({ details, action, businessId }: { details: any; action: string; businessId: number }) {
  const d = typeof details === 'string' ? (() => { try { return JSON.parse(details); } catch { return {}; } })() : details;
  if (!d) return <p className="text-muted-foreground">No details available.</p>;

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
                  <span className="text-red-400 mt-0.5">&bull;</span>
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
                  <span className="mt-0.5">&rarr;</span> {r}
                </li>
              ))}
            </ul>
          </div>
        )}
        {d.interventionType && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
            <p className="text-sm text-emerald-800 font-medium">Intervention sent: {d.interventionType.replace(/_/g, ' ')}</p>
          </div>
        )}
      </div>
    );
  }

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

  if (d.alertType || d.message) {
    return (
      <div className="space-y-4">
        {d.alertType && <Badge variant="destructive">{d.alertType.replace(/_/g, ' ')}</Badge>}
        {d.message && <p className="text-sm">{d.message}</p>}
        {d.score !== undefined && <p className="text-sm text-muted-foreground">Score: {d.score}</p>}
      </div>
    );
  }

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

// ── Agent Card ───────────────────────────────────────────────────────────

function AgentCard({ agent, isExpanded, onToggle, onRun, isRunning }: {
  agent: PlatformAgent;
  isExpanded: boolean;
  onToggle: () => void;
  onRun: () => void;
  isRunning: boolean;
}) {
  const [selectedLog, setSelectedLog] = useState<AgentActivityLogEntry | null>(null);

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
                        {log.createdAt ? formatRelative(log.createdAt) : "\u2014"}
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

// ── Platform Agents Tab ──────────────────────────────────────────────────

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

export default PlatformAgentsTab;
