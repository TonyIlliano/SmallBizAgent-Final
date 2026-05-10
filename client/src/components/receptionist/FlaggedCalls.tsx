/**
 * FlaggedCalls — list of low-quality (or critically-failed) calls awaiting
 * merchant review. Renders inside the Receptionist → Quality tab.
 *
 * Each row shows: total score, top failure mode, when it happened, and a
 * "Mark as reviewed" action that hits POST /api/call-quality/:id/dismiss-flag.
 *
 * Click anywhere on the row → the existing CallQualityBadge dialog already
 * handles the per-dimension breakdown, but the badge component fetches its
 * own score by callLogId so we can drop it inline and let it open its own
 * dialog. We pass a tiny stub badge that auto-opens.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { CallQualityBadge } from "./CallQualityBadge";
import { CheckCircle2, AlertTriangle, Clock, Loader2 } from "lucide-react";
import { formatDateTime } from "@/lib/utils";

interface DimensionScore {
  score: number;
  justification?: string;
}

interface FlaggedScore {
  id: number;
  businessId: number;
  callLogId: number;
  industry: string | null;
  dimensions: Record<string, DimensionScore>;
  totalScore: number;
  flagged: boolean;
  flagDismissed: boolean;
  flagDismissedAt: string | null;
  failureModes: string[] | null;
  scoredAt: string;
}

interface FlaggedResponse {
  flagged: FlaggedScore[];
}

function humanizeKey(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function FlaggedRow({ score }: { score: FlaggedScore }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [dismissing, setDismissing] = useState(false);

  const dismissMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/call-quality/${score.callLogId}/dismiss-flag`);
      return res.json();
    },
    onMutate: () => setDismissing(true),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/call-quality/business/flagged"] });
      queryClient.invalidateQueries({ queryKey: ["/api/call-quality/business/summary"] });
      queryClient.invalidateQueries({ queryKey: [`/api/call-quality/${score.callLogId}`] });
      toast({ title: "Marked as reviewed", description: "Removed from your flagged queue." });
    },
    onError: () => {
      toast({ title: "Failed to dismiss", variant: "destructive" });
      setDismissing(false);
    },
  });

  const topFailure = score.failureModes?.[0];

  return (
    <div className="border rounded-lg p-3 hover:bg-muted/30 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge
              variant="outline"
              className="bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30 text-xs font-semibold"
            >
              <AlertTriangle className="h-3 w-3 mr-1" />
              {score.totalScore.toFixed(1)} / 10
            </Badge>
            {topFailure && (
              <Badge variant="outline" className="text-xs">
                {humanizeKey(topFailure)}
              </Badge>
            )}
            {score.industry && (
              <span className="text-xs text-muted-foreground">{score.industry}</span>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>{formatDateTime(score.scoredAt)}</span>
            <span>·</span>
            <span>Call #{score.callLogId}</span>
          </div>
          {/* Show 1-line summary of weakest dimension's justification, if available */}
          {(() => {
            const dims = Object.entries(score.dimensions);
            if (dims.length === 0) return null;
            const weakest = dims.sort(([, a], [, b]) => a.score - b.score)[0];
            const [key, dim] = weakest;
            if (!dim.justification) return null;
            return (
              <p className="text-xs text-muted-foreground line-clamp-2 pt-1">
                <span className="font-medium">{humanizeKey(key)}:</span>{" "}
                {dim.justification}
              </p>
            );
          })()}
        </div>

        {/* Right side: open detail + dismiss action */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <CallQualityBadge callLogId={score.callLogId} />
          <Button
            variant="outline"
            size="sm"
            onClick={() => dismissMutation.mutate()}
            disabled={dismissing || dismissMutation.isPending}
            data-testid={`dismiss-flag-${score.callLogId}`}
          >
            {dismissMutation.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <>
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Reviewed
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function FlaggedCalls() {
  const { data, isLoading } = useQuery<FlaggedResponse>({
    queryKey: ["/api/call-quality/business/flagged"],
    staleTime: 60 * 1000,
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-3">
            <div className="h-12 bg-muted rounded" />
            <div className="h-12 bg-muted rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const flagged = data?.flagged || [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Flagged Calls
            {flagged.length > 0 && (
              <Badge variant="outline" className="ml-1">{flagged.length}</Badge>
            )}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {flagged.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="rounded-full bg-green-500/10 p-3 mb-3">
              <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <p className="font-medium text-sm">No flagged calls</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm">
              Your AI is doing great. Calls scoring under 6/10 (or with critical
              failures) will appear here for review.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {flagged.map((score) => (
              <FlaggedRow key={score.id} score={score} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default FlaggedCalls;
