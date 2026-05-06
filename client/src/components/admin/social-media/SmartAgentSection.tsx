/**
 * SmartAgentSection — On-demand invocation of the Claude Managed Agent
 * ("Social Media Brain"). Manual trigger only — no scheduler.
 *
 * Press button → agent reads platform stats + winners + recent content,
 * then writes coordinated drafts via tool calls. Drafts land in the same
 * approval queue as the legacy daily agent. Cost is shown after each run.
 */

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Sparkles, AlertCircle, Wrench, DollarSign } from "lucide-react";

interface SmartAgentResponse {
  text: string;
  toolCallsExecuted: number;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  estimatedCost: number;
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
  const [lastRun, setLastRun] = useState<SmartAgentResponse | null>(null);

  const runMutation = useMutation({
    mutationFn: async (p: string) => {
      const res = await apiRequest("POST", "/api/social-media/run-smart-agent", { prompt: p });
      return (await res.json()) as SmartAgentResponse;
    },
    onSuccess: (data) => {
      setLastRun(data);
      // Refresh the drafts queue so newly-created posts appear
      queryClient.invalidateQueries({ queryKey: ["/api/social-media/posts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/blog-posts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/social-media/video-briefs"] });
      toast({
        title: "Smart agent finished",
        description: `${data.toolCallsExecuted} tool call${data.toolCallsExecuted === 1 ? "" : "s"} • ~$${data.estimatedCost.toFixed(4)}`,
      });
    },
    onError: (err: any) => {
      toast({
        title: "Smart agent failed",
        description: err?.message || "Run failed. Check server logs.",
        variant: "destructive",
      });
    },
  });

  const handleRun = () => {
    if (!prompt.trim()) {
      toast({
        title: "Prompt required",
        description: "Tell the agent what to generate.",
        variant: "destructive",
      });
      return;
    }
    setLastRun(null);
    runMutation.mutate(prompt);
  };

  const handleUseExample = (p: string) => {
    setPrompt(p);
  };

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
              disabled={runMutation.isPending}
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
          disabled={runMutation.isPending}
          maxLength={4000}
          data-testid="smart-agent-prompt"
        />
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground">
            {prompt.length} / 4000 chars · ~$0.05–0.10 per run
          </span>
          <Button
            onClick={handleRun}
            disabled={runMutation.isPending || !prompt.trim()}
            data-testid="smart-agent-run"
          >
            {runMutation.isPending ? (
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

        {/* Loading hint */}
        {runMutation.isPending && (
          <div className="rounded-md border border-purple-200 bg-purple-50 dark:bg-purple-950/20 dark:border-purple-900 p-3 text-sm">
            <div className="flex items-start gap-2">
              <Loader2 className="h-4 w-4 animate-spin mt-0.5 text-purple-600 flex-shrink-0" />
              <div>
                <p className="font-medium">Agent is reasoning across your data…</p>
                <p className="text-muted-foreground mt-1">
                  This can take 15-90 seconds. The agent is calling tools (winner posts, platform
                  stats, recent content), drafting, and writing to your DB.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Last run result */}
        {lastRun && !runMutation.isPending && (
          <div className="rounded-md border bg-muted/30 p-4 space-y-3" data-testid="smart-agent-result">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-purple-500" />
                Last run summary
              </h4>
              <div className="flex gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Wrench className="h-3 w-3" />
                  {lastRun.toolCallsExecuted} tool call{lastRun.toolCallsExecuted === 1 ? "" : "s"}
                </span>
                <span className="flex items-center gap-1">
                  <DollarSign className="h-3 w-3" />${lastRun.estimatedCost.toFixed(4)}
                </span>
              </div>
            </div>

            {lastRun.text ? (
              <div className="text-sm whitespace-pre-wrap leading-relaxed">{lastRun.text}</div>
            ) : (
              <div className="flex items-start gap-2 text-sm text-muted-foreground">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <p>
                  Agent finished without a text response. Check the drafts queue below for newly
                  created content.
                </p>
              </div>
            )}

            <div className="text-xs text-muted-foreground border-t pt-2">
              Tokens: {lastRun.usage.inputTokens.toLocaleString()} in /{" "}
              {lastRun.usage.outputTokens.toLocaleString()} out
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
