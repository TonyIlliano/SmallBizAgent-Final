import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { getAgentMeta } from "./AgentCard";
import {
  MessageSquare,
  ArrowDownLeft,
  CheckCircle2,
  Clock,
  CalendarCheck,
  TrendingUp,
  BarChart3,
  Loader2,
} from "lucide-react";

type Period = "week" | "month" | "quarter" | "year";

interface AgentMetrics {
  agentType: string;
  smsSent: number;
  repliesReceived: number;
  replyRate: number;
  bookingReplies: number;
  escalated: number;
  reviewsDrafted: number;
  reviewsPosted: number;
  totalConversations: number;
  resolved: number;
  expired: number;
  active: number;
  resolutionRate: number;
  avgResponseTimeHours: number | null;
}

interface ReportData {
  period: string;
  since: string;
  totals: {
    smsSent: number;
    repliesReceived: number;
    totalConversations: number;
    resolved: number;
    appointmentsBooked: number;
    replyRate: number;
    resolutionRate: number;
  };
  agents: AgentMetrics[];
  trend: { date: string; sent: number; replies: number }[];
}

function StatCard({
  label,
  value,
  icon: Icon,
  subtitle,
}: {
  label: string;
  value: string | number;
  icon: any;
  subtitle?: string;
}) {
  return (
    <Card className="border-border bg-card">
      <CardContent className="pt-5 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-muted">
            <Icon className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <p className="text-2xl font-bold text-foreground">{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
            {subtitle && (
              <p className="text-xs text-muted-foreground/70 mt-0.5">{subtitle}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function TrendChart({ data }: { data: { date: string; sent: number; replies: number }[] }) {
  if (data.length === 0) return null;

  const maxVal = Math.max(...data.map(d => Math.max(d.sent, d.replies)), 1);
  const barWidth = Math.max(4, Math.floor(100 / data.length) - 1);

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          Daily Activity
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-1 h-32">
          {data.map((d, i) => (
            <div key={d.date} className="flex flex-col items-center gap-0.5 flex-1" title={`${d.date}: ${d.sent} sent, ${d.replies} replies`}>
              <div className="flex items-end gap-px w-full justify-center" style={{ height: '100px' }}>
                <div
                  className="bg-blue-400 dark:bg-blue-500 rounded-t-sm"
                  style={{
                    height: `${(d.sent / maxVal) * 100}%`,
                    width: `${barWidth}%`,
                    minHeight: d.sent > 0 ? '2px' : '0',
                    minWidth: '3px',
                    maxWidth: '12px',
                  }}
                />
                <div
                  className="bg-green-400 dark:bg-green-500 rounded-t-sm"
                  style={{
                    height: `${(d.replies / maxVal) * 100}%`,
                    width: `${barWidth}%`,
                    minHeight: d.replies > 0 ? '2px' : '0',
                    minWidth: '3px',
                    maxWidth: '12px',
                  }}
                />
              </div>
              {(i === 0 || i === data.length - 1 || i === Math.floor(data.length / 2)) && (
                <span className="text-[9px] text-muted-foreground">
                  {new Date(d.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </span>
              )}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm bg-blue-400 dark:bg-blue-500" />
            Sent
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm bg-green-400 dark:bg-green-500" />
            Replies
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function AgentReport() {
  const [period, setPeriod] = useState<Period>("month");

  const { data: report, isLoading } = useQuery<ReportData>({
    queryKey: ["/api/automations/report", { period }],
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!report) {
    return (
      <Card className="border-border bg-card">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <BarChart3 className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">
            No report data available. Enable agents and let them run to see performance metrics.
          </p>
        </CardContent>
      </Card>
    );
  }

  const { totals, agents, trend } = report;
  const activeAgents = agents.filter(a => a.smsSent > 0 || a.totalConversations > 0);

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Performance metrics for your SMS automation agents.
        </p>
        <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <TabsList className="h-8">
            <TabsTrigger value="week" className="text-xs px-2.5 h-7">Week</TabsTrigger>
            <TabsTrigger value="month" className="text-xs px-2.5 h-7">Month</TabsTrigger>
            <TabsTrigger value="quarter" className="text-xs px-2.5 h-7">Quarter</TabsTrigger>
            <TabsTrigger value="year" className="text-xs px-2.5 h-7">Year</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        <StatCard
          label="Messages Sent"
          value={totals.smsSent}
          icon={MessageSquare}
        />
        <StatCard
          label="Replies Received"
          value={totals.repliesReceived}
          icon={ArrowDownLeft}
        />
        <StatCard
          label="Reply Rate"
          value={`${totals.replyRate}%`}
          icon={TrendingUp}
        />
        <StatCard
          label="Conversations"
          value={totals.totalConversations}
          icon={MessageSquare}
        />
        <StatCard
          label="Resolved"
          value={`${totals.resolutionRate}%`}
          icon={CheckCircle2}
          subtitle={`${totals.resolved} of ${totals.totalConversations}`}
        />
        <StatCard
          label="SMS Bookings"
          value={totals.appointmentsBooked}
          icon={CalendarCheck}
          subtitle="Booked via SMS"
        />
      </div>

      {/* Daily trend chart */}
      {trend.length > 1 && <TrendChart data={trend} />}

      {/* Per-agent breakdown */}
      {activeAgents.length > 0 && (
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Per-Agent Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[160px]">Agent</TableHead>
                  <TableHead className="text-right">Sent</TableHead>
                  <TableHead className="text-right">Replies</TableHead>
                  <TableHead className="text-right">Reply Rate</TableHead>
                  <TableHead className="text-right">Conversations</TableHead>
                  <TableHead className="text-right">Resolution</TableHead>
                  <TableHead className="text-right">Avg Response</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeAgents.map((agent) => {
                  const meta = getAgentMeta(agent.agentType);
                  const Icon = meta.icon;
                  return (
                    <TableRow key={agent.agentType}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Icon className={`h-4 w-4 ${meta.color}`} />
                          <span className="text-sm font-medium">{meta.label}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-sm">{agent.smsSent}</TableCell>
                      <TableCell className="text-right text-sm">{agent.repliesReceived}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center gap-2 justify-end">
                          <Progress value={agent.replyRate} className="w-12 h-1.5" />
                          <span className="text-sm w-10 text-right">{agent.replyRate}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {agent.totalConversations}
                        {agent.active > 0 && (
                          <span className="text-xs text-muted-foreground ml-1">({agent.active} active)</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center gap-2 justify-end">
                          <Progress value={agent.resolutionRate} className="w-12 h-1.5" />
                          <span className="text-sm w-10 text-right">{agent.resolutionRate}%</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">
                        {agent.avgResponseTimeHours !== null
                          ? agent.avgResponseTimeHours < 1
                            ? `${Math.round(agent.avgResponseTimeHours * 60)}m`
                            : `${agent.avgResponseTimeHours}h`
                          : "—"}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Conversation outcomes */}
      {activeAgents.some(a => a.totalConversations > 0) && (
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Conversation Outcomes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {activeAgents
                .filter(a => a.totalConversations > 0)
                .map((agent) => {
                  const meta = getAgentMeta(agent.agentType);
                  const Icon = meta.icon;
                  const total = agent.totalConversations;
                  return (
                    <div key={agent.agentType} className="space-y-2.5">
                      <div className="flex items-center gap-2">
                        <Icon className={`h-4 w-4 ${meta.color}`} />
                        <span className="text-sm font-medium">{meta.label}</span>
                        <span className="text-xs text-muted-foreground ml-auto">{total} total</span>
                      </div>
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-green-600 dark:text-green-400">Resolved</span>
                          <span>{agent.resolved} ({total > 0 ? Math.round((agent.resolved / total) * 100) : 0}%)</span>
                        </div>
                        <Progress value={total > 0 ? (agent.resolved / total) * 100 : 0} className="h-1.5" />

                        <div className="flex items-center justify-between text-xs">
                          <span className="text-amber-600 dark:text-amber-400">Expired</span>
                          <span>{agent.expired} ({total > 0 ? Math.round((agent.expired / total) * 100) : 0}%)</span>
                        </div>
                        <Progress value={total > 0 ? (agent.expired / total) * 100 : 0} className="h-1.5" />

                        {agent.active > 0 && (
                          <>
                            <div className="flex items-center justify-between text-xs">
                              <span className="text-blue-600 dark:text-blue-400">Active</span>
                              <span>{agent.active}</span>
                            </div>
                            <Progress value={total > 0 ? (agent.active / total) * 100 : 0} className="h-1.5" />
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Review agent specific metrics */}
      {agents.some(a => a.agentType === 'review_response' && (a.reviewsDrafted > 0 || a.reviewsPosted > 0)) && (
        <Card className="border-border bg-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Review Response Agent</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-6">
              <div>
                <p className="text-xl font-bold text-foreground">
                  {agents.find(a => a.agentType === 'review_response')?.reviewsDrafted ?? 0}
                </p>
                <p className="text-xs text-muted-foreground">Responses Drafted</p>
              </div>
              <div>
                <p className="text-xl font-bold text-foreground">
                  {agents.find(a => a.agentType === 'review_response')?.reviewsPosted ?? 0}
                </p>
                <p className="text-xs text-muted-foreground">Responses Posted</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
