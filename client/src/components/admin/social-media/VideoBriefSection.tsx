/**
 * VideoBriefSection — AI-generated video ad briefs with automated rendering pipeline.
 * Includes generate, render, and view dialogs.
 */

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, Trash2, Copy, Clapperboard, Play, Film, Mic, Download,
} from "lucide-react";
import {
  VERTICALS,
  CONTENT_PILLARS,
  formatDate,
  type VideoBrief,
  type PipelineStatus,
  type TTSVoice,
} from "./socialMediaTypes";

export default function VideoBriefSection() {
  const { toast } = useToast();
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [showRenderDialog, setShowRenderDialog] = useState(false);
  const [renderBriefId, setRenderBriefId] = useState<number | null>(null);
  const [renderAspectRatio, setRenderAspectRatio] = useState<"9:16" | "16:9" | "1:1">("9:16");
  const [renderVoice, setRenderVoice] = useState("nova");
  const [viewingBrief, setViewingBrief] = useState<VideoBrief | null>(null);
  const [briefVertical, setBriefVertical] = useState("Barbershops");
  const [briefPlatform, setBriefPlatform] = useState("Instagram Reels");
  const [briefPillar, setBriefPillar] = useState("pain");
  const [useWinners, setUseWinners] = useState(true);

  const { data: briefs, isLoading } = useQuery<VideoBrief[]>({
    queryKey: ["/api/social-media/video-briefs"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/social-media/video-briefs");
      return res.json();
    },
  });

  const { data: pipelineStatus } = useQuery<PipelineStatus>({
    queryKey: ["/api/social-media/pipeline-status"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/social-media/pipeline-status");
      return res.json();
    },
  });

  const { data: voiceData } = useQuery<{ available: boolean; voices: TTSVoice[] }>({
    queryKey: ["/api/social-media/tts-voices"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/social-media/tts-voices");
      return res.json();
    },
  });

  // Poll for render status of in-progress briefs
  const renderingBriefIds = briefs?.filter(b => b.renderStatus === "rendering").map(b => b.id) || [];

  useEffect(() => {
    if (renderingBriefIds.length === 0) return;
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ["/api/social-media/video-briefs"] });
    }, 10000);
    return () => clearInterval(interval);
  }, [renderingBriefIds.length]);

  const generateBriefMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/social-media/video-brief", {
        vertical: briefVertical,
        platform: briefPlatform,
        pillar: CONTENT_PILLARS.find(p => p.id === briefPillar)?.label || briefPillar,
        useWinners,
      });
      return res.json();
    },
    onSuccess: (data: VideoBrief) => {
      queryClient.invalidateQueries({ queryKey: ["/api/social-media/video-briefs"] });
      setShowGenerateDialog(false);
      setViewingBrief(data);
      toast({ title: "Video brief generated!" });
    },
    onError: (err: Error) => {
      toast({ title: "Brief generation failed", description: err.message, variant: "destructive" });
    },
  });

  const renderMutation = useMutation({
    mutationFn: async () => {
      if (!renderBriefId) throw new Error("No brief selected");
      const res = await apiRequest("POST", `/api/social-media/video-briefs/${renderBriefId}/render`, {
        aspectRatio: renderAspectRatio,
        voice: renderVoice,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/social-media/video-briefs"] });
      setShowRenderDialog(false);
      setRenderBriefId(null);
      toast({ title: "Video rendering started!", description: "This takes 1-3 minutes. The card will update automatically." });
    },
    onError: (err: Error) => {
      toast({ title: "Render failed", description: err.message, variant: "destructive" });
    },
  });

  const deleteBriefMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/social-media/video-briefs/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/social-media/video-briefs"] });
      toast({ title: "Brief deleted" });
    },
  });

  const copyBrief = (brief: VideoBrief) => {
    const b = brief.briefData;
    const text = `VIDEO AD BRIEF \u2014 SmallBizAgent
Platform: ${brief.platform} | Vertical: ${brief.vertical} | Pillar: ${brief.pillar}

HOOK: ${b.hook}
VOICEOVER: ${b.voiceover || "None"}
CTA OVERLAY: ${b.cta_overlay}

SCREEN SEQUENCE:
${b.screen_sequence?.map((s: any, i: number) => `${i + 1}. [${s.duration}] ${s.clip}${s.note ? ` \u2014 ${s.note}` : ""}`).join("\n") || "N/A"}

B-ROLL: ${b.broll}

CAPTION:
${b.caption}

HASHTAGS: ${b.hashtags?.map((h: string) => `#${h}`).join(" ") || "N/A"}

BOOST: ${b.boost_targeting} \u00b7 ${b.boost_budget}
STOCK SEARCH TERMS: ${b.stock_search_terms?.join(", ") || "N/A"}`;

    navigator.clipboard.writeText(text);
    toast({ title: "Brief copied to clipboard" });
  };

  const openRenderDialog = (briefId: number) => {
    setRenderBriefId(briefId);
    setShowRenderDialog(true);
  };

  const getRenderStatusBadge = (brief: VideoBrief) => {
    switch (brief.renderStatus) {
      case "rendering":
        return <Badge variant="secondary" className="text-xs flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Rendering...</Badge>;
      case "done":
        return <Badge className="text-xs bg-green-600 flex items-center gap-1"><Play className="h-3 w-3" />Video Ready</Badge>;
      case "failed":
        return <Badge variant="destructive" className="text-xs">Render Failed</Badge>;
      default:
        return null;
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Clapperboard className="h-5 w-5" />
              Video Briefs
            </CardTitle>
            <CardDescription>AI-generated video ad briefs with automated rendering</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {/* Pipeline status indicators */}
            {pipelineStatus && (
              <div className="hidden sm:flex items-center gap-1.5 mr-2">
                <div title="Remotion (Video Rendering)" className={`h-2 w-2 rounded-full ${pipelineStatus.shotstack ? "bg-green-500" : "bg-red-400"}`} />
                <div title="Pexels (Stock Footage)" className={`h-2 w-2 rounded-full ${pipelineStatus.pexels ? "bg-green-500" : "bg-yellow-400"}`} />
                <div title="TTS (Voiceover)" className={`h-2 w-2 rounded-full ${pipelineStatus.tts ? "bg-green-500" : "bg-yellow-400"}`} />
                <div title="S3 (Storage)" className={`h-2 w-2 rounded-full ${pipelineStatus.s3 ? "bg-green-500" : "bg-red-400"}`} />
              </div>
            )}
            <Button
              onClick={() => setShowGenerateDialog(true)}
              className="flex items-center gap-2"
            >
              <Clapperboard className="h-4 w-4" />
              Generate Brief
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !briefs || briefs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            No video briefs yet. Click "Generate Brief" to create your first one.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {briefs.map((brief) => (
              <div
                key={brief.id}
                className="border rounded-lg p-4 hover:border-primary/50 transition-colors cursor-pointer relative"
                onClick={() => setViewingBrief(brief)}
              >
                {/* Render status badge */}
                {brief.renderStatus && brief.renderStatus !== "none" && (
                  <div className="mb-2">{getRenderStatusBadge(brief)}</div>
                )}

                {/* Video thumbnail preview */}
                {brief.renderStatus === "done" && brief.videoUrl && (
                  <div className="mb-3 rounded-md overflow-hidden bg-black aspect-video relative group">
                    {brief.thumbnailUrl ? (
                      <img src={brief.thumbnailUrl} alt="Video thumbnail" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Film className="h-8 w-8 text-muted-foreground" />
                      </div>
                    )}
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Play className="h-10 w-10 text-white" />
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between mb-2">
                  <Badge variant="outline" className="text-xs">{brief.vertical}</Badge>
                  <div className="flex items-center gap-1">
                    {/* Render button */}
                    {pipelineStatus?.ready && brief.renderStatus !== "rendering" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-purple-500"
                        title={brief.renderStatus === "done" ? "Re-render video" : "Render video"}
                        onClick={(e) => { e.stopPropagation(); openRenderDialog(brief.id); }}
                      >
                        <Film className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {/* Download button */}
                    {brief.renderStatus === "done" && brief.videoUrl && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-green-500"
                        title="Download video"
                        onClick={(e) => {
                          e.stopPropagation();
                          window.open(brief.videoUrl!, "_blank");
                        }}
                      >
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      title="Copy brief"
                      onClick={(e) => { e.stopPropagation(); copyBrief(brief); }}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-red-400"
                      title="Delete"
                      onClick={(e) => { e.stopPropagation(); deleteBriefMutation.mutate(brief.id); }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <p className="text-sm font-medium truncate">"{brief.briefData.hook}"</p>
                <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                  <span>{brief.platform}</span>
                  <span>\u00b7</span>
                  <span>{brief.pillar}</span>
                  <span>\u00b7</span>
                  <span>{formatDate(brief.createdAt)}</span>
                </div>
                {brief.renderStatus === "failed" && brief.renderError && (
                  <p className="text-xs text-red-500 mt-1 truncate" title={brief.renderError}>
                    {brief.renderError}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Generate Brief Dialog */}
      <Dialog open={showGenerateDialog} onOpenChange={setShowGenerateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clapperboard className="h-5 w-5" />
              Generate Video Ad Brief
            </DialogTitle>
            <DialogDescription>
              Create a split-screen video ad brief: SmallBizAgent UI on top, lifestyle b-roll on bottom.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Target Vertical</Label>
              <select
                value={briefVertical}
                onChange={(e) => setBriefVertical(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {VERTICALS.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Platform</Label>
              <select
                value={briefPlatform}
                onChange={(e) => setBriefPlatform(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {["Instagram Reels", "Facebook Video", "TikTok", "YouTube Shorts", "General"].map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Content Pillar</Label>
              <select
                value={briefPillar}
                onChange={(e) => setBriefPillar(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {CONTENT_PILLARS.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="useWinners"
                checked={useWinners}
                onChange={(e) => setUseWinners(e.target.checked)}
                className="rounded border-input"
              />
              <Label htmlFor="useWinners" className="text-sm font-normal">
                Use winner posts as tone/style reference
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowGenerateDialog(false)}>Cancel</Button>
            <Button
              onClick={() => generateBriefMutation.mutate()}
              disabled={generateBriefMutation.isPending}
              className="flex items-center gap-2"
            >
              {generateBriefMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Clapperboard className="h-4 w-4" />
              )}
              Generate Brief
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Render Video Dialog */}
      <Dialog open={showRenderDialog} onOpenChange={setShowRenderDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Film className="h-5 w-5" />
              Render Video from Brief
            </DialogTitle>
            <DialogDescription>
              Assemble screen recordings, stock b-roll, and AI voiceover into a finished MP4.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Aspect Ratio</Label>
              <div className="flex gap-3">
                <button
                  onClick={() => setRenderAspectRatio("9:16")}
                  className={`flex-1 border rounded-lg p-3 text-center transition-colors ${renderAspectRatio === "9:16" ? "border-primary bg-primary/5" : "hover:border-muted-foreground/50"}`}
                >
                  <div className="mx-auto w-6 h-10 border-2 rounded mb-1" style={{ borderColor: renderAspectRatio === "9:16" ? "hsl(var(--primary))" : "currentColor" }} />
                  <p className="text-sm font-medium">9:16 Vertical</p>
                  <p className="text-xs text-muted-foreground">TikTok, Reels, Shorts</p>
                </button>
                <button
                  onClick={() => setRenderAspectRatio("16:9")}
                  className={`flex-1 border rounded-lg p-3 text-center transition-colors ${renderAspectRatio === "16:9" ? "border-primary bg-primary/5" : "hover:border-muted-foreground/50"}`}
                >
                  <div className="mx-auto w-10 h-6 border-2 rounded mb-1" style={{ borderColor: renderAspectRatio === "16:9" ? "hsl(var(--primary))" : "currentColor" }} />
                  <p className="text-sm font-medium">16:9 Landscape</p>
                  <p className="text-xs text-muted-foreground">YouTube, LinkedIn, Facebook</p>
                </button>
                <button
                  onClick={() => setRenderAspectRatio("1:1")}
                  className={`flex-1 border rounded-lg p-3 text-center transition-colors ${renderAspectRatio === "1:1" ? "border-primary bg-primary/5" : "hover:border-muted-foreground/50"}`}
                >
                  <div className="mx-auto w-8 h-8 border-2 rounded mb-1" style={{ borderColor: renderAspectRatio === "1:1" ? "hsl(var(--primary))" : "currentColor" }} />
                  <p className="text-sm font-medium">1:1 Square</p>
                  <p className="text-xs text-muted-foreground">Instagram Feed, Facebook Feed</p>
                </button>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Mic className="h-4 w-4" />
                Voiceover Voice
              </Label>
              <select
                value={renderVoice}
                onChange={(e) => setRenderVoice(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {(voiceData?.voices || []).map((v) => (
                  <option key={v.id} value={v.id}>{v.name} \u2014 {v.description}</option>
                ))}
              </select>
              {!voiceData?.available && (
                <p className="text-xs text-amber-500">TTS not configured -- video will render without voiceover</p>
              )}
            </div>
            {/* Pipeline status */}
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Pipeline Status</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex items-center gap-2">
                  <div className={`h-2 w-2 rounded-full ${pipelineStatus?.shotstack ? "bg-green-500" : "bg-red-400"}`} />
                  <span>Remotion</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`h-2 w-2 rounded-full ${pipelineStatus?.pexels ? "bg-green-500" : "bg-yellow-400"}`} />
                  <span>Pexels Stock</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`h-2 w-2 rounded-full ${pipelineStatus?.tts ? "bg-green-500" : "bg-yellow-400"}`} />
                  <span>Voiceover TTS</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`h-2 w-2 rounded-full ${pipelineStatus?.s3 ? "bg-green-500" : "bg-red-400"}`} />
                  <span>S3 Storage</span>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRenderDialog(false)}>Cancel</Button>
            <Button
              onClick={() => renderMutation.mutate()}
              disabled={renderMutation.isPending || !pipelineStatus?.ready}
              className="flex items-center gap-2"
            >
              {renderMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Film className="h-4 w-4" />
              )}
              Start Rendering
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Brief Dialog */}
      <Dialog open={!!viewingBrief} onOpenChange={() => setViewingBrief(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clapperboard className="h-5 w-5" />
              Video Brief: {viewingBrief?.vertical}
            </DialogTitle>
            <DialogDescription>
              {viewingBrief?.platform} \u00b7 {viewingBrief?.pillar} \u00b7 {formatDate(viewingBrief?.createdAt || null)}
            </DialogDescription>
          </DialogHeader>

          {viewingBrief && (
            <div className="space-y-4">
              {/* Rendered video player */}
              {viewingBrief.renderStatus === "done" && viewingBrief.videoUrl && (
                <div className="rounded-lg overflow-hidden bg-black">
                  <video
                    src={viewingBrief.videoUrl}
                    controls
                    className="w-full max-h-[400px]"
                    poster={viewingBrief.thumbnailUrl || undefined}
                  />
                  <div className="p-2 flex justify-between items-center bg-muted/50">
                    <span className="text-xs text-muted-foreground">
                      Rendered {formatDate(viewingBrief.renderedAt)} \u00b7 {viewingBrief.aspectRatio}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs flex items-center gap-1"
                      onClick={() => window.open(viewingBrief.videoUrl!, "_blank")}
                    >
                      <Download className="h-3 w-3" />
                      Download
                    </Button>
                  </div>
                </div>
              )}

              {viewingBrief.renderStatus === "rendering" && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-blue-500" />
                  <p className="text-sm font-medium text-blue-700">Video is rendering...</p>
                  <p className="text-xs text-blue-500 mt-1">This usually takes 1-3 minutes</p>
                </div>
              )}

              {viewingBrief.renderStatus === "failed" && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <p className="text-sm font-medium text-red-700">Render failed</p>
                  <p className="text-xs text-red-500 mt-1">{viewingBrief.renderError}</p>
                </div>
              )}

              {/* Hook */}
              <div className="bg-muted/50 rounded-lg p-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Hook (First 2 Seconds)</p>
                <p className="text-lg font-bold">"{viewingBrief.briefData.hook}"</p>
                {viewingBrief.briefData.voiceover && (
                  <p className="text-sm text-muted-foreground mt-2">
                    Voiceover: <em>"{viewingBrief.briefData.voiceover}"</em>
                  </p>
                )}
                {viewingBrief.voiceoverUrl && (
                  <div className="mt-2">
                    <audio src={viewingBrief.voiceoverUrl} controls className="w-full h-8" />
                  </div>
                )}
              </div>

              {/* Screen Sequence + B-Roll */}
              <div className="grid grid-cols-2 gap-3">
                <div className="border rounded-lg p-4">
                  <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-3">Top Half \u2014 Screen Recording</p>
                  <div className="space-y-2">
                    {viewingBrief.briefData.screen_sequence?.map((s: any, i: number) => (
                      <div key={i} className="flex gap-2">
                        <span className="text-xs font-mono text-blue-500 font-semibold min-w-[40px]">{s.duration}</span>
                        <div>
                          <p className="text-sm">{s.clip}</p>
                          {s.note && <p className="text-xs text-muted-foreground">{s.note}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="border rounded-lg p-4">
                  <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider mb-3">Bottom Half \u2014 B-Roll</p>
                  <p className="text-sm">{viewingBrief.briefData.broll}</p>
                  {viewingBrief.briefData.stock_search_terms?.length > 0 && (
                    <div className="mt-3 pt-3 border-t">
                      <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-2">Stock Search Terms</p>
                      <div className="flex flex-wrap gap-1">
                        {viewingBrief.briefData.stock_search_terms.map((t: string) => (
                          <Badge key={t} variant="secondary" className="text-xs">"{t}"</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* CTA + Caption */}
              <div className="border rounded-lg p-4">
                <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider mb-2">CTA Overlay (Last 3 Seconds)</p>
                <p className="font-semibold text-emerald-700 mb-3">{viewingBrief.briefData.cta_overlay}</p>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Caption</p>
                <p className="text-sm whitespace-pre-wrap">{viewingBrief.briefData.caption}</p>
                {viewingBrief.briefData.hashtags?.length > 0 && (
                  <p className="text-sm text-blue-500 mt-2">
                    {viewingBrief.briefData.hashtags.map((h: string) => `#${h}`).join(" ")}
                  </p>
                )}
              </div>

              {/* Boost */}
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{viewingBrief.briefData.boost_targeting}</span>
                <span className="font-mono font-bold text-emerald-700">{viewingBrief.briefData.boost_budget}</span>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1 flex items-center gap-2"
                  onClick={() => copyBrief(viewingBrief)}
                >
                  <Copy className="h-4 w-4" />
                  Copy Brief
                </Button>
                {pipelineStatus?.ready && viewingBrief.renderStatus !== "rendering" && (
                  <Button
                    className="flex-1 flex items-center gap-2"
                    onClick={() => openRenderDialog(viewingBrief.id)}
                  >
                    <Film className="h-4 w-4" />
                    {viewingBrief.renderStatus === "done" ? "Re-render" : "Render Video"}
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
