/**
 * CallQualityBadge — small inline pill showing the AI quality score
 * for a single call. Color-coded: green ≥ 8, amber 6-7.9, red < 6.
 *
 * Lazy-fetches the score for a given callLogId. Renders nothing if
 * no score exists yet (e.g. very short call, free-tier business).
 *
 * Click → opens a detail modal with per-dimension breakdown.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Sparkles } from "lucide-react";

interface DimensionScore {
  score: number;
  justification?: string;
}

interface QualityScoreRecord {
  id: number;
  businessId: number;
  callLogId: number;
  industry: string | null;
  dimensions: Record<string, DimensionScore>;
  totalScore: number;
  rubricVersion: string;
  flagged: boolean;
  flagDismissed: boolean;
  flagDismissedAt: string | null;
  failureModes: string[] | null;
  scoredAt: string;
}

function scoreColor(score: number): { bg: string; text: string; border: string } {
  if (score >= 8) {
    return { bg: "bg-green-500/15", text: "text-green-700 dark:text-green-400", border: "border-green-500/30" };
  }
  if (score >= 6) {
    return { bg: "bg-amber-500/15", text: "text-amber-700 dark:text-amber-400", border: "border-amber-500/30" };
  }
  return { bg: "bg-red-500/15", text: "text-red-700 dark:text-red-400", border: "border-red-500/30" };
}

function humanizeKey(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function CallQualityBadge({ callLogId }: { callLogId: number }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: score, isLoading } = useQuery<QualityScoreRecord | null>({
    queryKey: [`/api/call-quality/${callLogId}`],
    queryFn: async () => {
      try {
        const res = await apiRequest("GET", `/api/call-quality/${callLogId}`);
        if (res.status === 404) return null;
        return await res.json();
      } catch {
        return null;
      }
    },
    staleTime: 60_000,
    retry: false,
  });

  const dismissMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/call-quality/${callLogId}/dismiss-flag`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/call-quality/${callLogId}`] });
      queryClient.invalidateQueries({ queryKey: [`/api/call-quality/business/flagged`] });
      queryClient.invalidateQueries({ queryKey: [`/api/call-quality/business/summary`] });
      toast({ title: "Flag dismissed", description: "Marked as reviewed." });
    },
    onError: () => {
      toast({ title: "Failed to dismiss", variant: "destructive" });
    },
  });

  if (isLoading || !score) return null;

  const colors = scoreColor(score.totalScore);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold border ${colors.bg} ${colors.text} ${colors.border} hover:opacity-80 transition-opacity`}
        data-testid={`call-quality-badge-${callLogId}`}
        title={score.flagged && !score.flagDismissed ? "Flagged for review" : "View quality breakdown"}
      >
        <Sparkles className="h-3 w-3" />
        {score.totalScore.toFixed(1)}
        {score.flagged && !score.flagDismissed && (
          <AlertTriangle className="h-3 w-3 ml-0.5" />
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-500" />
              AI Quality Score
              <Badge variant="outline" className={`${colors.text}`}>
                {score.totalScore.toFixed(1)} / 10
              </Badge>
            </DialogTitle>
            <DialogDescription>
              How the AI handled this call, scored against an industry rubric.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {/* Per-dimension breakdown */}
            <div className="space-y-2">
              {Object.entries(score.dimensions).map(([key, dim]) => {
                const c = scoreColor(dim.score);
                return (
                  <div key={key} className="border rounded-md p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-sm">{humanizeKey(key)}</span>
                      <span className={`text-sm font-semibold ${c.text}`}>{dim.score}/10</span>
                    </div>
                    {dim.justification && (
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {dim.justification}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Failure modes */}
            {score.failureModes && score.failureModes.length > 0 && (
              <div className="rounded-md border border-amber-500/30 bg-amber-50 dark:bg-amber-950/20 p-3">
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1">
                  Issues detected
                </p>
                <div className="flex flex-wrap gap-1">
                  {score.failureModes.map((mode) => (
                    <Badge key={mode} variant="outline" className="text-xs">
                      {humanizeKey(mode)}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Flag actions */}
            {score.flagged && !score.flagDismissed && (
              <div className="flex justify-end pt-2 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => dismissMutation.mutate()}
                  disabled={dismissMutation.isPending}
                >
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                  Mark as reviewed
                </Button>
              </div>
            )}
            {score.flagDismissed && (
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 text-green-600" />
                Reviewed{score.flagDismissedAt ? ` on ${new Date(score.flagDismissedAt).toLocaleDateString()}` : ''}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default CallQualityBadge;
