/**
 * CallQualityCard — dashboard widget showing the AI's quality score for the
 * last 30 days. Templated after AiRoiCard. Becomes the visible artifact of
 * the agent platform for merchants on paid plans.
 *
 * Hidden when the merchant has zero scored calls (free tier OR brand new).
 *
 * Data source: GET /api/call-quality/business/summary
 *   - currentAvg: average totalScore over last 30 days
 *   - priorAvg:   average over the prior 30 days (for trend arrow)
 *   - callsScored: count of scored calls in current window
 *   - flaggedCount: still-open flags (flagged && !flag_dismissed)
 *   - dimensionBreakdown: per-dimension averages, weakest first
 */

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, TrendingUp, TrendingDown, Minus, AlertTriangle, ArrowRight } from "lucide-react";
import { Link } from "wouter";

interface DimensionRow {
  key: string;
  avg: number;
  count: number;
}

interface QualitySummary {
  currentAvg: number;
  priorAvg: number;
  callsScored: number;
  flaggedCount: number;
  dimensionBreakdown: DimensionRow[];
  windowDays: number;
}

function scoreColor(score: number): string {
  if (score >= 8) return "text-green-600 dark:text-green-400";
  if (score >= 6) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function scoreBarColor(score: number): string {
  if (score >= 8) return "bg-green-500";
  if (score >= 6) return "bg-amber-500";
  return "bg-red-500";
}

function humanizeKey(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function CallQualityCard({ businessId }: { businessId?: number }) {
  const { data, isLoading } = useQuery<QualitySummary>({
    queryKey: ["/api/call-quality/business/summary", businessId],
    enabled: !!businessId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-muted rounded w-1/3"></div>
            <div className="h-8 bg-muted rounded w-1/2"></div>
            <div className="h-4 bg-muted rounded w-2/3"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Empty state — free tier or brand-new account with no calls scored yet.
  // Hide entirely rather than show a stub: free businesses don't have the AI
  // receptionist anyway, and an empty card on the dashboard is visual noise.
  if (!data || data.callsScored === 0) {
    return null;
  }

  const delta = data.currentAvg - data.priorAvg;
  const trendNeutral = Math.abs(delta) < 0.2 || data.priorAvg === 0;
  const trendUp = !trendNeutral && delta > 0;
  const TrendIcon = trendNeutral ? Minus : trendUp ? TrendingUp : TrendingDown;
  const trendColor = trendNeutral
    ? "text-muted-foreground"
    : trendUp
      ? "text-green-600 dark:text-green-400"
      : "text-red-600 dark:text-red-400";
  const trendLabel = trendNeutral
    ? "steady"
    : `${delta > 0 ? "+" : ""}${delta.toFixed(1)} vs prior 30d`;

  // Show top 4 weakest dimensions (already sorted ascending server-side).
  const weakDims = data.dimensionBreakdown.slice(0, 4);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-500" />
            AI Quality Score
          </CardTitle>
          <span className="text-xs text-muted-foreground">Last {data.windowDays} days</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Big number + trend */}
        <div className="flex items-baseline justify-between">
          <div className="flex items-baseline gap-2">
            <span className={`text-4xl font-bold ${scoreColor(data.currentAvg)}`}>
              {data.currentAvg.toFixed(1)}
            </span>
            <span className="text-sm text-muted-foreground">/ 10</span>
          </div>
          <div className={`flex items-center gap-1 text-xs font-medium ${trendColor}`}>
            <TrendIcon className="h-3 w-3" />
            {trendLabel}
          </div>
        </div>

        <div className="text-xs text-muted-foreground">
          Based on {data.callsScored} call{data.callsScored === 1 ? "" : "s"}
          {data.flaggedCount > 0 && (
            <>
              {" · "}
              <Link
                href="/receptionist?tab=quality"
                className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 hover:underline"
                data-testid="link-flagged-calls"
              >
                <AlertTriangle className="h-3 w-3" />
                {data.flaggedCount} flagged
              </Link>
            </>
          )}
        </div>

        {/* Dimension breakdown — weakest 4 dims, horizontal bars */}
        {weakDims.length > 0 && (
          <div className="pt-2 border-t space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              Where the AI scores lowest
            </p>
            {weakDims.map((dim) => (
              <div key={dim.key} className="space-y-1">
                <div className="flex justify-between items-baseline">
                  <span className="text-xs">{humanizeKey(dim.key)}</span>
                  <span className={`text-xs font-semibold ${scoreColor(dim.avg)}`}>
                    {dim.avg.toFixed(1)}
                  </span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full ${scoreBarColor(dim.avg)} transition-all`}
                    style={{ width: `${Math.min(100, (dim.avg / 10) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Link to detail */}
        <div className="pt-1">
          <Link
            href="/receptionist?tab=quality"
            className="text-xs text-primary hover:underline flex items-center gap-1"
            data-testid="link-quality-detail"
          >
            View flagged calls & trends <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

export default CallQualityCard;
