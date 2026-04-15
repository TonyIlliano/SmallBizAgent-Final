/**
 * PostsTable — Displays social media posts filtered by status with
 * view/edit/approve/reject/publish/delete/metrics/winner actions.
 */

import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, CheckCircle, XCircle, ExternalLink, Pencil, Trash2,
  Send, Eye, Video, FileText, Star, BarChart3,
} from "lucide-react";
import {
  PLATFORMS,
  formatDate,
  getExternalUrl,
  type SocialPost,
} from "./socialMediaTypes";

interface PostsTableProps {
  status: string;
}

export default function PostsTable({ status }: PostsTableProps) {
  const { toast } = useToast();
  const [editingPost, setEditingPost] = useState<SocialPost | null>(null);
  const [editContent, setEditContent] = useState("");
  const [viewingPost, setViewingPost] = useState<SocialPost | null>(null);
  const [metricsPost, setMetricsPost] = useState<SocialPost | null>(null);
  const [metricsForm, setMetricsForm] = useState({ likes: 0, comments: 0, shares: 0, saves: 0, reach: 0 });
  const videoPollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clean up video polling interval on unmount
  useEffect(() => {
    return () => {
      if (videoPollIntervalRef.current) {
        clearInterval(videoPollIntervalRef.current);
      }
    };
  }, []);

  const { data, isLoading } = useQuery<SocialPost[]>({
    queryKey: ["/api/social-media/posts", status],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/social-media/posts?status=${status}`);
      return res.json();
    },
  });

  const { data: videoAvailability } = useQuery<{ available: boolean }>({
    queryKey: ["/api/social-media/video-available"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/social-media/video-available");
      return res.json();
    },
  });

  const generateVideoMutation = useMutation({
    mutationFn: async (postId: number) => {
      const res = await apiRequest("POST", `/api/social-media/posts/${postId}/generate-video`);
      return res.json();
    },
    onSuccess: (_data, postId) => {
      toast({ title: "Video generation started", description: "Rendering in progress -- this page will update automatically when the video is ready (~30-60 seconds)." });
      if (videoPollIntervalRef.current) clearInterval(videoPollIntervalRef.current);
      let attempts = 0;
      const maxAttempts = 30;
      videoPollIntervalRef.current = setInterval(async () => {
        attempts++;
        try {
          const res = await apiRequest("GET", `/api/social-media/posts/${postId}/video-status`);
          const statusData = await res.json();
          if (statusData.mediaType === "video" && statusData.mediaUrl) {
            clearInterval(videoPollIntervalRef.current!);
            videoPollIntervalRef.current = null;
            queryClient.invalidateQueries({ queryKey: ["/api/social-media/posts"] });
            toast({ title: "Video ready!", description: "Your video has been generated. Click the eye icon to preview it." });
          } else if (attempts >= maxAttempts) {
            clearInterval(videoPollIntervalRef.current!);
            videoPollIntervalRef.current = null;
            queryClient.invalidateQueries({ queryKey: ["/api/social-media/posts"] });
            toast({ title: "Video may still be processing", description: "Refresh the page to check status.", variant: "destructive" });
          }
        } catch {
          if (attempts >= maxAttempts) {
            clearInterval(videoPollIntervalRef.current!);
            videoPollIntervalRef.current = null;
          }
        }
      }, 10000);
    },
    onError: () => {
      toast({ title: "Video generation failed", variant: "destructive" });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (postId: number) => {
      await apiRequest("POST", `/api/social-media/posts/${postId}/approve`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/social-media/posts"] });
      toast({ title: "Post approved", description: "Ready for publishing." });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (postId: number) => {
      await apiRequest("POST", `/api/social-media/posts/${postId}/reject`, { reason: "Not suitable" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/social-media/posts"] });
      toast({ title: "Post rejected" });
    },
  });

  const publishMutation = useMutation({
    mutationFn: async (postId: number) => {
      const res = await apiRequest("POST", `/api/social-media/posts/${postId}/publish`);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/social-media/posts"] });
      toast({
        title: data.success ? "Published!" : "Publish failed",
        description: data.error || "Post has been published to the platform.",
        variant: data.success ? "default" : "destructive",
      });
    },
  });

  const editMutation = useMutation({
    mutationFn: async ({ postId, content }: { postId: number; content: string }) => {
      await apiRequest("PUT", `/api/social-media/posts/${postId}`, { content });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/social-media/posts"] });
      setEditingPost(null);
      toast({ title: "Post updated" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (postId: number) => {
      await apiRequest("DELETE", `/api/social-media/posts/${postId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/social-media/posts"] });
      toast({ title: "Post deleted" });
    },
  });

  const metricsMutation = useMutation({
    mutationFn: async ({ postId, metrics }: { postId: number; metrics: typeof metricsForm }) => {
      const res = await apiRequest("PUT", `/api/social-media/posts/${postId}/metrics`, metrics);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/social-media/posts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/social-media/posts/winners"] });
      setMetricsPost(null);
      toast({ title: "Metrics saved", description: "Engagement score computed." });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to save metrics", description: err.message, variant: "destructive" });
    },
  });

  const winnerMutation = useMutation({
    mutationFn: async (postId: number) => {
      const res = await apiRequest("POST", `/api/social-media/posts/${postId}/winner`);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/social-media/posts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/social-media/posts/winners"] });
      toast({ title: data.isWinner ? "Marked as winner" : "Winner status removed" });
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const posts: SocialPost[] = Array.isArray(data) ? data : [];

  if (posts.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        {status === "draft"
          ? 'No drafts yet. Click "Generate Content" to create AI-powered posts.'
          : `No ${status} posts.`}
      </p>
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Platform</TableHead>
            <TableHead>Content</TableHead>
            <TableHead>Industry</TableHead>
            {status === "published" && <TableHead>Engagement</TableHead>}
            <TableHead>{status === "published" ? "Published" : "Created"}</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {posts.map((post) => {
            const platformInfo = PLATFORMS.find(p => p.id === post.platform);
            const displayContent = post.editedContent || post.content;

            return (
              <TableRow key={post.id}>
                <TableCell>
                  <div className={`w-8 h-8 rounded flex items-center justify-center text-xs font-bold ${platformInfo?.color || "bg-gray-200"}`}>
                    {platformInfo?.icon || "?"}
                  </div>
                </TableCell>
                <TableCell className="max-w-md">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    {post.mediaType === "video" ? (
                      <Badge variant="secondary" className="text-xs flex items-center gap-1 bg-purple-100 text-purple-800">
                        <Video className="h-3 w-3" /> Video
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs flex items-center gap-1">
                        <FileText className="h-3 w-3" /> Text
                      </Badge>
                    )}
                    {post.editedContent && (
                      <span className="text-xs text-amber-600">(edited)</span>
                    )}
                    {post.isWinner && (
                      <Badge className="text-xs bg-amber-100 text-amber-800 border-amber-300 flex items-center gap-1">
                        <Star className="h-3 w-3 fill-amber-500" /> Winner
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm truncate">{displayContent.slice(0, 120)}...</p>
                </TableCell>
                <TableCell>
                  {post.industry ? (
                    <Badge variant="outline" className="capitalize text-xs">{post.industry}</Badge>
                  ) : "\u2014"}
                </TableCell>
                {status === "published" && (
                  <TableCell>
                    {post.engagementScore > 0 ? (
                      <Badge variant="outline" className="font-mono text-xs">
                        {(post.engagementScore * 100).toFixed(2)}%
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">\u2014</span>
                    )}
                  </TableCell>
                )}
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                  {formatDate(status === "published" ? post.publishedAt : post.createdAt)}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    {/* View */}
                    <Button size="sm" variant="ghost" onClick={() => setViewingPost(post)}>
                      <Eye className="h-4 w-4" />
                    </Button>

                    {/* Draft actions */}
                    {status === "draft" && (
                      <>
                        {post.mediaType !== "video" && videoAvailability?.available && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-purple-600"
                            title="Generate Video"
                            onClick={() => generateVideoMutation.mutate(post.id)}
                            disabled={generateVideoMutation.isPending}
                          >
                            {generateVideoMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Video className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => { setEditingPost(post); setEditContent(post.editedContent || post.content); }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-emerald-600"
                          onClick={() => approveMutation.mutate(post.id)}
                          disabled={approveMutation.isPending}
                        >
                          <CheckCircle className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-600"
                          onClick={() => rejectMutation.mutate(post.id)}
                          disabled={rejectMutation.isPending}
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                      </>
                    )}

                    {/* Approved actions */}
                    {status === "approved" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-emerald-600"
                        onClick={() => publishMutation.mutate(post.id)}
                        disabled={publishMutation.isPending}
                      >
                        {publishMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                      </Button>
                    )}

                    {/* Published actions -- metrics, winner toggle, external link */}
                    {status === "published" && (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          title="Enter Metrics"
                          onClick={() => {
                            setMetricsPost(post);
                            setMetricsForm({
                              likes: post.likes || 0,
                              comments: post.comments || 0,
                              shares: post.shares || 0,
                              saves: post.saves || 0,
                              reach: post.reach || 0,
                            });
                          }}
                        >
                          <BarChart3 className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className={post.isWinner ? "text-amber-500" : "text-muted-foreground"}
                          title={post.isWinner ? "Remove winner" : "Mark as winner"}
                          onClick={() => winnerMutation.mutate(post.id)}
                          disabled={winnerMutation.isPending}
                        >
                          <Star className={`h-4 w-4 ${post.isWinner ? "fill-amber-500" : ""}`} />
                        </Button>
                        {post.externalPostId && (
                          <Button size="sm" variant="ghost" asChild>
                            <a href={getExternalUrl(post.platform, post.externalPostId)} target="_blank" rel="noopener">
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </Button>
                        )}
                      </>
                    )}

                    {/* Delete for drafts/rejected */}
                    {(status === "draft" || status === "rejected") && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-400"
                        onClick={() => deleteMutation.mutate(post.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {/* View Dialog */}
      <Dialog open={!!viewingPost} onOpenChange={() => setViewingPost(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {viewingPost && (
                <span className={`w-6 h-6 rounded flex items-center justify-center text-xs font-bold ${PLATFORMS.find(p => p.id === viewingPost.platform)?.color}`}>
                  {PLATFORMS.find(p => p.id === viewingPost.platform)?.icon}
                </span>
              )}
              {PLATFORMS.find(p => p.id === viewingPost?.platform)?.name} Post
            </DialogTitle>
            <DialogDescription>
              {viewingPost?.industry && `Industry: ${viewingPost.industry}`}
            </DialogDescription>
          </DialogHeader>
          {viewingPost?.mediaType === "video" && viewingPost?.mediaUrl && (
            <div className="rounded-lg overflow-hidden border bg-black">
              <video
                src={viewingPost.mediaUrl}
                controls
                className="w-full max-h-64"
                poster={viewingPost.thumbnailUrl || undefined}
              />
              <div className="flex items-center gap-2 p-2 bg-muted/50 text-xs text-muted-foreground">
                <Video className="h-3 w-3" />
                <span>
                  {viewingPost.details?.video?.template && `Template: ${viewingPost.details.video.template}`}
                  {viewingPost.details?.video?.duration && ` \u2022 ${viewingPost.details.video.duration}s`}
                </span>
              </div>
            </div>
          )}
          {viewingPost?.mediaType === "video" && !viewingPost?.mediaUrl && (
            <div className="rounded-lg border p-4 bg-muted/50 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Video is being generated...
            </div>
          )}
          <div className="whitespace-pre-wrap text-sm border rounded-lg p-4 bg-muted/50 max-h-80 overflow-y-auto">
            {viewingPost?.editedContent || viewingPost?.content}
          </div>
          {viewingPost?.rejectionReason && (
            <p className="text-sm text-red-600">Rejection reason: {viewingPost.rejectionReason}</p>
          )}
          {viewingPost?.status === "failed" && viewingPost?.details?.error && (
            <p className="text-sm text-red-600">Error: {viewingPost.details.error}</p>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={!!editingPost} onOpenChange={() => setEditingPost(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Post</DialogTitle>
            <DialogDescription>
              Modify the content before approving.
              {editingPost?.platform === "twitter" && " (Max 280 characters)"}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            rows={8}
            className="font-mono text-sm"
          />
          <div className="text-xs text-muted-foreground text-right">
            {editContent.length} characters
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingPost(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (editingPost) {
                  editMutation.mutate({ postId: editingPost.id, content: editContent });
                }
              }}
              disabled={editMutation.isPending}
            >
              {editMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Metrics Dialog */}
      <Dialog open={!!metricsPost} onOpenChange={() => setMetricsPost(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" />
              Enter Engagement Metrics
            </DialogTitle>
            <DialogDescription>
              Enter the engagement metrics from the platform for this post.
              Score: (Saves x 3 + Shares x 2 + Comments x 1.5 + Likes) / Reach
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-5 gap-3 py-2">
            {(["likes", "comments", "shares", "saves", "reach"] as const).map((field) => (
              <div key={field} className="space-y-1">
                <Label className="text-xs capitalize">{field}</Label>
                <Input
                  type="number"
                  min={0}
                  value={metricsForm[field]}
                  onChange={(e) => setMetricsForm(prev => ({ ...prev, [field]: Number(e.target.value) || 0 }))}
                  className="text-center font-mono"
                />
              </div>
            ))}
          </div>
          {metricsForm.reach > 0 && (
            <div className="text-sm text-center text-muted-foreground">
              Preview score: <span className="font-mono font-semibold text-foreground">
                {(((metricsForm.saves * 3 + metricsForm.shares * 2 + metricsForm.comments * 1.5 + metricsForm.likes) / Math.max(metricsForm.reach, 1)) * 100).toFixed(2)}%
              </span>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setMetricsPost(null)}>Cancel</Button>
            <Button
              onClick={() => {
                if (metricsPost) {
                  metricsMutation.mutate({ postId: metricsPost.id, metrics: metricsForm });
                }
              }}
              disabled={metricsMutation.isPending}
            >
              {metricsMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Metrics"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
