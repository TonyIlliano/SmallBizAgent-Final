import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import {
  Users,
  DollarSign,
  HelpCircle,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Loader2,
} from "lucide-react";
import { type MarketingInsights, trendPercent } from "./marketingHelpers";

// ---------------------------------------------------------------------------
// Simple horizontal bar for segments
// ---------------------------------------------------------------------------

function SegmentBar({
  segments,
}: {
  segments: { label: string; count: number; color: string }[];
}) {
  const total = segments.reduce((s, seg) => s + seg.count, 0) || 1;
  return (
    <div className="space-y-3">
      <div className="flex h-4 rounded-full overflow-hidden bg-muted">
        {segments.map((seg) => (
          <div
            key={seg.label}
            className="h-full transition-all duration-500"
            style={{
              width: `${Math.max((seg.count / total) * 100, 1)}%`,
              backgroundColor: seg.color,
            }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-4">
        {segments.map((seg) => (
          <div key={seg.label} className="flex items-center gap-2">
            <div
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: seg.color }}
            />
            <span className="text-sm text-muted-foreground">
              {seg.label}:{" "}
              <span className="font-semibold text-foreground">{seg.count}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// InsightsTab
// ---------------------------------------------------------------------------

export default function InsightsTab() {
  const { data: insights, isLoading } = useQuery<MarketingInsights>({
    queryKey: ["/api/marketing/insights"],
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!insights) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <BarChart3 className="h-12 w-12 text-muted-foreground/40 mb-4" />
        <h3 className="text-lg font-semibold mb-2">No insights available yet</h3>
        <p className="text-sm text-muted-foreground max-w-md">
          Marketing insights will populate as you grow your customer base and
          track appointments, calls, and revenue.
        </p>
      </div>
    );
  }

  const trend = trendPercent(insights.revenueThisMonth, insights.revenueLastMonth);
  const trendPositive = trend >= 0;

  const segmentData = [
    { label: "New", count: insights.segments.new, color: "#22c55e" },
    { label: "Active", count: insights.segments.active, color: "#3b82f6" },
    { label: "At-Risk", count: insights.segments.atRisk, color: "#f97316" },
    { label: "Lost", count: insights.segments.lost, color: "#ef4444" },
  ];

  const topServicesMax = Math.max(
    ...insights.topServices.map((s) => s.count),
    1
  );

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-border bg-card">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Customers</p>
                <p className="text-2xl font-bold">{insights.totalCustomers}</p>
              </div>
              <div className="p-3 rounded-full bg-purple-100 dark:bg-purple-900/30">
                <Users className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">
                  Revenue This Month
                </p>
                <p className="text-2xl font-bold">
                  {formatCurrency(insights.revenueThisMonth)}
                </p>
              </div>
              <div className="p-3 rounded-full bg-green-100 dark:bg-green-900/30">
                <DollarSign className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
            </div>
            <div className="flex items-center mt-2 text-xs">
              {trendPositive ? (
                <span className="text-green-600 dark:text-green-400 flex items-center">
                  <TrendingUp className="h-3 w-3 mr-1" />
                  +{trend}% vs last month
                </span>
              ) : (
                <span className="text-red-500 flex items-center">
                  <TrendingDown className="h-3 w-3 mr-1" />
                  {trend}% vs last month
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        <Link href="/receptionist">
          <Card className="border-border bg-card hover:bg-muted/50 transition-colors cursor-pointer h-full">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">
                    Unanswered Questions
                  </p>
                  <p className="text-2xl font-bold">
                    {insights.unansweredQuestions}
                  </p>
                </div>
                <div className="p-3 rounded-full bg-amber-100 dark:bg-amber-900/30">
                  <HelpCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                View in Receptionist
              </p>
            </CardContent>
          </Card>
        </Link>

        <Card className="border-border bg-card">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">
                  At-Risk Customers
                </p>
                <p className="text-2xl font-bold">{insights.segments.atRisk}</p>
              </div>
              <div className="p-3 rounded-full bg-red-100 dark:bg-red-900/30">
                <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Customer Segments */}
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-base">Customer Segments</CardTitle>
        </CardHeader>
        <CardContent>
          <SegmentBar segments={segmentData} />
        </CardContent>
      </Card>

      {/* Top Services + Busiest Day + Call Intents */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Top Services */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base">Top Services</CardTitle>
          </CardHeader>
          <CardContent>
            {insights.topServices.length > 0 ? (
              <div className="space-y-3">
                {insights.topServices.map((svc) => (
                  <div key={svc.name} className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground w-28 truncate">
                      {svc.name}
                    </span>
                    <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-500 dark:bg-emerald-400 transition-all duration-500"
                        style={{
                          width: `${Math.max(
                            (svc.count / topServicesMax) * 100,
                            4
                          )}%`,
                        }}
                      />
                    </div>
                    <span className="text-sm font-medium w-8 text-right">
                      {svc.count}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                No service data yet
              </p>
            )}
          </CardContent>
        </Card>

        {/* Busiest Day */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base">Busiest Day</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center py-6">
            {insights.busiestDay?.day ? (
              <>
                <div className="p-4 rounded-full bg-blue-100 dark:bg-blue-900/30 mb-4">
                  <BarChart3 className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                </div>
                <p className="text-lg font-semibold text-foreground">
                  {insights.busiestDay.day}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {insights.busiestDay.count} appointments
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Not enough data yet
              </p>
            )}
          </CardContent>
        </Card>

        {/* Top Call Intents */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base">Top Call Intents</CardTitle>
          </CardHeader>
          <CardContent>
            {insights.callIntents.length > 0 ? (
              <div className="space-y-2">
                {insights.callIntents.map((ci) => (
                  <div
                    key={ci.intent}
                    className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
                  >
                    <span className="text-sm text-foreground">{ci.intent}</span>
                    <Badge variant="secondary">{ci.count}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                No call intent data yet
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
