/**
 * CallQualityTrendChart — line chart of monthly average AI quality scores.
 *
 * Renders inside the Receptionist → Quality tab above the FlaggedCalls list.
 * Pulls last 6 months of monthly averages from /api/call-quality/business/trend.
 *
 * Empty state shown when fewer than 2 months of data — a single dot doesn't
 * communicate a "trend" and would be misleading.
 */

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  CartesianGrid,
} from "recharts";

interface MonthRow {
  month: string; // 'YYYY-MM'
  avg: number;
  count: number;
}

interface TrendResponse {
  months: MonthRow[];
}

function formatMonth(yyyymm: string): string {
  // 'YYYY-MM' → 'Mon YY'
  const [year, month] = yyyymm.split("-");
  if (!year || !month) return yyyymm;
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

export function CallQualityTrendChart() {
  const { data, isLoading } = useQuery<TrendResponse>({
    queryKey: ["/api/call-quality/business/trend"],
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse h-32 bg-muted rounded" />
        </CardContent>
      </Card>
    );
  }

  const months = data?.months || [];

  if (months.length < 2) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-purple-500" />
            Quality Trend
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Once you have 2+ months of scored calls, you'll see your quality
            trend here. Each AI call gets graded automatically against an
            industry-aware rubric.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Format chart data — convert YYYY-MM to "Mon YY" labels
  const chartData = months.map((m) => ({
    label: formatMonth(m.month),
    avg: Number(m.avg.toFixed(2)),
    count: m.count,
  }));

  const latest = chartData[chartData.length - 1];
  const earliest = chartData[0];
  const overallDelta = latest.avg - earliest.avg;
  const trendUp = overallDelta > 0.2;
  const trendDown = overallDelta < -0.2;
  const trendColor = trendUp
    ? "text-green-600 dark:text-green-400"
    : trendDown
      ? "text-red-600 dark:text-red-400"
      : "text-muted-foreground";

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-purple-500" />
            Quality Trend
          </CardTitle>
          <span className={`text-xs font-medium ${trendColor}`}>
            {trendUp && "↗ "}
            {trendDown && "↘ "}
            {!trendUp && !trendDown && "→ "}
            {overallDelta > 0 ? "+" : ""}
            {overallDelta.toFixed(1)} over {chartData.length} months
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="label"
                className="text-xs"
                stroke="currentColor"
                opacity={0.5}
              />
              <YAxis
                domain={[0, 10]}
                ticks={[0, 2, 4, 6, 8, 10]}
                className="text-xs"
                stroke="currentColor"
                opacity={0.5}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "0.5rem",
                  fontSize: "0.75rem",
                }}
                formatter={(value: number, _name, entry) => [
                  `${value.toFixed(1)}/10 (${entry?.payload?.count ?? 0} calls)`,
                  "Avg score",
                ]}
              />
              {/* Reference line at 6 — the flagged threshold */}
              <ReferenceLine
                y={6}
                stroke="rgb(245 158 11)"
                strokeDasharray="3 3"
                label={{ value: "Flag threshold", position: "right", fontSize: 10, fill: "rgb(245 158 11)" }}
              />
              <Line
                type="monotone"
                dataKey="avg"
                stroke="rgb(168 85 247)"
                strokeWidth={2}
                dot={{ r: 4, fill: "rgb(168 85 247)" }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

export default CallQualityTrendChart;
