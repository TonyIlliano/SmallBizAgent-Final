/**
 * SmartAgentSection — On-demand invocation of the Claude Managed Agent
 * ("Social Media Brain"). Manual trigger only — no scheduler.
 *
 * Flow: press button → POST /run-smart-agent returns 202 with a runId
 * (the actual agent runs in the background server-side). Frontend polls
 * GET /run-smart-agent/:runId every 3 seconds until status flips to
 * 'completed' or 'failed'. This avoids Cloudflare's 100s edge timeout
 * since the original HTTP request closes in ~50ms.
 */

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Sparkles, AlertCircle, Wrench, DollarSign, XCircle } from "lucide-react";

interface RunStatusResponse {
  runId: number;
  status: "running" | "completed" | "failed";
  prompt: string;
  resultText: string | null;
  // Numeric fields are nullable in the DB until the agent finishes — the
  // `running` state has no cost/tokens yet. Always coalesce with `?? 0`
  // before calling .toFixed/.toLocaleString on them.
  toolCallsExecuted: number | null;
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
  };
  estimatedCost: number | null;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
}

const EXAMPLE_PROMPTS = [
  {
    label: "5 LinkedIn posts (mixed types)",
    prompt:
      "Generate 5 LinkedIn posts targeting small service business owners (HVAC, plumbing, salons, restaurants). Mix content types: 1 stat-driven, 1 personal story, 1 myth-buster, 1 actionable tip, 1 question post. Each 1500-2000 chars. Skip topics covered in the last 7 days.",
  },
  {
    label: "Launch week (3 posts)",
    prompt:
      "I'm launching SmallBizAgent on LinkedIn this week. Generate 3 LinkedIn posts: post 1 announces the launch with a personal 'I missed a $3k job to a missed call' story, post 2 explains the Free CRM tier as a no-risk trial, post 3 invites first 10 customers as design partners. Voice: direct, confident, no corporate hype. 1500-2000 chars each.",
  },
  {
    label: "HVAC vertical push (full mix)",
    prompt:
      "Generate a coordinated HVAC content batch: 3 social posts (1 Twitter, 1 LinkedIn, 1 Facebook) about how AI receptionists help HVAC shops capture after-hours emergency calls. Plus 1 short blog post (800 words) with target keyword 'HVAC AI receptionist.' Use winner posts as style reference if available.",
  },
];

export default function SmartAgentSection() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [prompt, setPrompt] = useState("");
  const [activeRunId, setActiveRunId] = useState<number | null>(null);

  // Start a new run. Returns immediately with a runId; the agent itself runs
  // in the background on the server. We then poll the status endpoint.
  const startMutation = useMutation({
    mutationFn: async (p: string) => {
      const res = await apiRequest("POST", "/api/social-media/run-smart-agent", { prompt: p });
      return (await res.json()) as { runId: number; status: string };
    },
    onSuccess: (data) => {
      setActiveRunId(data.runId);
      toast({
        title: "Smart agent started",
        description: `Run #${data.runId} is now running in the background. This usually takes 15-90 seconds.`,
      });
    },
    onError: (err: any) => {
      toast({
        title: "Couldn't start smart agent",
        description: err?.message || "Run failed to start. Check server logs.",
        variant: "destructive",
      });
    },
  });

  // Poll the run status while a run is active. Stops as soon as status is
  // not 'running' (i.e. completed or failed).
  const { data: runStatus } = useQuery<RunStatusResponse>({
    queryKey: ["/api/social-media/run-smart-agent", activeRunId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/social-media/run-smart-agent/${activeRunId}`);
      return (await res.json()) as RunStatusResponse;
    },
    enabled: activeRunId !== null,
    refetchInterval: (query) => {
      const data = query.state.data as RunStatusResponse | undefined;
      if (!data) return 3000; // first poll after 3s
      return data.status === "running" ? 3000 : false; // stop polling on terminal state
    },
    refetchIntervalInBackground: true,
  });

  // When the run flips to a terminal state, refresh draft queues so
  // newly-created content shows up below, and notify the user once.
  // Effect, not a render-time side effect — guards against polling loops.
  useEffect(() => {
    if (!runStatus) return;
    if (runStatus.status === "completed") {
      queryClient.invalidateQueries({ queryKey: ["/api/social-media/posts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/blog-posts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/social-media/video-briefs"] });
      const tc = runStatus.toolCallsExecuted ?? 0;
      const cost = runStatus.estimatedCost ?? 0;
      toast({
        title: "Smart agent finished",
        description: `${tc} tool call${tc === 1 ? "" : "s"} • ~$${cost.toFixed(4)}`,
      });
    } else if (runStatus.status === "failed") {
      toast({
        title: "Smart agent failed",
        description: runStatus.errorMessage || "Run failed. Check server logs.",
        variant: "destructive",
      });
    }
    // Only re-run when the run id or terminal status changes — not on every poll
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runStatus?.runId, runStatus?.status]);

  const handleRun = () => {
    if (!prompt.trim()) {
      toast({
        title: "Prompt required",
        description: "Tell the agent what to generate.",
        variant: "destructive",
      });
      return;
    }
    setActiveRunId(null);
    startMutation.mutate(prompt);
  };

  const handleUseExample = (p: string) => {
    setPrompt(p);
  };

  const handleClear = () => {
    setActiveRunId(null);
  };

  // Derived render state
  const isStarting = startMutation.isPending;
  const isRunning = runStatus?.status === "running";
  const hasResult = runStatus?.status === "completed" || runStatus?.status === "failed";
  const inFlight = isStarting || isRunning;

  // Elapsed time during a running session
  const elapsedSeconds = runStatus?.startedAt
    ? Math.max(0, Math.floor((Date.now() - new Date(runStatus.startedAt).getTime()) / 1000))
    : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-purple-500" />
          Smart Agent (Claude Managed)
          <Badge variant="outline" className="text-xs">
            On-demand
          </Badge>
        </CardTitle>
        <CardDescription>
          Invoke the autonomous Social Media Brain. Reads live platform stats, winner posts, and
          recent content, then drafts coordinated content via tool calls. Drafts appear in the
          approval queue below.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Example prompt chips */}
        <div className="flex flex-wrap gap-2">
          {EXAMPLE_PROMPTS.map((ex) => (
            <Button
              key={ex.label}
              variant="outline"
              size="sm"
              onClick={() => handleUseExample(ex.prompt)}
              disabled={inFlight}
              type="button"
            >
              {ex.label}
            </Button>
          ))}
        </div>

        {/* Prompt input */}
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Tell the agent what to generate. e.g. 'Generate 5 LinkedIn posts for HVAC business owners. Mix content types. Skip recent topics.'"
          rows={5}
          className="font-mono text-sm"
          disabled={inFlight}
          maxLength={4000}
          data-testid="smart-agent-prompt"
        />
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground">
            {prompt.length} / 4000 chars · ~$0.05–0.10 per run
          </span>
          <Button
            onClick={handleRun}
            disabled={inFlight || !prompt.trim()}
            data-testid="smart-agent-run"
          >
            {isStarting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Starting…
              </>
            ) : isRunning ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Working…
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Run Smart Agent
              </>
            )}
          </Button>
        </div>

        {/* Running state with elapsed time */}
        {isRunning && (
          <div className="rounded-md border border-purple-200 bg-purple-50 dark:bg-purple-950/20 dark:border-purple-900 p-3 text-sm">
            <div className="flex items-start gap-2">
              <Loader2 className="h-4 w-4 animate-spin mt-0.5 text-purple-600 flex-shrink-0" />
              <div className="flex-1">
                <p className="font-medium">
                  Agent is reasoning across your data… ({elapsedSeconds}s)
                </p>
                <p className="text-muted-foreground mt-1">
                  Run #{runStatus?.runId}. Calling tools (winner posts, platform stats, recent
                  content), drafting, writing to your DB. You can leave this page — the run keeps
                  going on the server. Drafts will appear in the queue below when finished.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Completed result */}
        {hasResult && runStatus?.status === "completed" && (
          <div className="rounded-md border bg-muted/30 p-4 space-y-3" data-testid="smart-agent-result">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-purple-500" />
                Run #{runStatus.runId} complete
              </h4>
              <div className="flex gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Wrench className="h-3 w-3" />
                  {runStatus.toolCallsExecuted ?? 0} tool call
                  {(runStatus.toolCallsExecuted ?? 0) === 1 ? "" : "s"}
                </span>
                <span className="flex items-center gap-1">
                  <DollarSign className="h-3 w-3" />${(runStatus.estimatedCost ?? 0).toFixed(4)}
                </span>
              </div>
            </div>

            {runStatus.resultText ? (
              <div className="text-sm whitespace-pre-wrap leading-relaxed">
                {runStatus.resultText}
              </div>
            ) : (
              <div className="flex items-start gap-2 text-sm text-muted-foreground">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <p>
                  Agent finished without a text response. Check the drafts queue below for newly
                  created content.
                </p>
              </div>
            )}

            <div className="flex justify-between items-center text-xs text-muted-foreground border-t pt-2">
              <span>
                Tokens: {(runStatus.usage.inputTokens ?? 0).toLocaleString()} in /{" "}
                {(runStatus.usage.outputTokens ?? 0).toLocaleString()} out
              </span>
              <Button variant="ghost" size="sm" onClick={handleClear}>
                Clear
              </Button>
            </div>
          </div>
        )}

        {/* Failed state */}
        {hasResult && runStatus?.status === "failed" && (
          <div
            className="rounded-md border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900 p-4 space-y-2"
            data-testid="smart-agent-failed"
          >
            <div className="flex items-center gap-2">
              <XCircle className="h-4 w-4 text-red-600 flex-shrink-0" />
              <h4 className="font-semibold text-red-700 dark:text-red-400">
                Run #{runStatus.runId} failed
              </h4>
            </div>
            <p className="text-sm text-red-700 dark:text-red-400">
              {runStatus.errorMessage || "The agent run failed. Check server logs for details."}
            </p>
            <Button variant="ghost" size="sm" onClick={handleClear}>
              Clear
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
