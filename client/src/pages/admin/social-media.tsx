/**
 * Social Media Management — Admin Page
 *
 * Connect social accounts, review AI-generated drafts, approve & publish.
 * Platform-level only (admin).
 */

import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Redirect } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { PageLayout } from "@/components/layout/PageLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, CheckCircle, XCircle, ExternalLink, Play, Pencil, Trash2,
  Send, Eye, RefreshCw, Link2, Unlink, Shield, Share2,
} from "lucide-react";

// ── Types ───────────────────────────────────────────────────────────────

interface ConnectionStatus {
  connected: boolean;
  connectedAt?: string;
}

interface SocialPost {
  id: number;
  platform: string;
  content: string;
  mediaUrl: string | null;
  status: string;
  scheduledFor: string | null;
  publishedAt: string | null;
  externalPostId: string | null;
  industry: string | null;
  details: any;
  rejectionReason: string | null;
  editedContent: string | null;
  createdAt: string;
  updatedAt: string;
}

// Platform metadata
const PLATFORMS = [
  { id: 'twitter', name: 'X / Twitter', color: 'bg-black text-white', icon: '𝕏' },
  { id: 'facebook', name: 'Facebook', color: 'bg-blue-600 text-white', icon: 'f' },
  { id: 'instagram', name: 'Instagram', color: 'bg-gradient-to-r from-purple-500 to-pink-500 text-white', icon: '📷' },
  { id: 'linkedin', name: 'LinkedIn', color: 'bg-blue-700 text-white', icon: 'in' },
] as const;

// ── Main Component ──────────────────────────────────────────────────────

export default function SocialMediaAdminPage() {
  const { user } = useAuth();

  if (user && user.role !== "admin") {
    return <Redirect to="/dashboard" />;
  }
  if (!user) {
    return <Redirect to="/auth" />;
  }

  return (
    <PageLayout title="Social Media">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Share2 className="h-8 w-8" />
            Social Media Manager
          </h1>
          <p className="text-muted-foreground mt-1">
            Connect accounts, review AI-generated content, and publish
          </p>
        </div>
        <Badge variant="destructive" className="flex items-center gap-1">
          <Shield className="h-3 w-3" />
          Admin
        </Badge>
      </div>

      <div className="space-y-8">
        {/* Connected Accounts */}
        <ConnectedAccountsSection />

        {/* Post Management */}
        <PostManagementSection />
      </div>
    </PageLayout>
  );
}

// ── Connected Accounts ──────────────────────────────────────────────────

function ConnectedAccountsSection() {
  const { toast } = useToast();

  const { data: statuses, isLoading } = useQuery<Record<string, ConnectionStatus>>({
    queryKey: ["/api/social-media/status"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/social-media/status");
      return res.json();
    },
  });

  // Listen for OAuth popup callback
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "social-connected") {
        queryClient.invalidateQueries({ queryKey: ["/api/social-media/status"] });
        toast({
          title: `${event.data.platform} connected!`,
          description: "Your account has been linked successfully.",
        });
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [toast]);

  const connectMutation = useMutation({
    mutationFn: async (platform: string) => {
      const res = await apiRequest("GET", `/api/social-media/${platform}/auth-url`);
      const data = await res.json();
      return data.url;
    },
    onSuccess: (url) => {
      window.open(url, "_blank", "width=600,height=700");
    },
    onError: (err: Error) => {
      toast({ title: "Connection failed", description: err.message, variant: "destructive" });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async (platform: string) => {
      await apiRequest("DELETE", `/api/social-media/${platform}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/social-media/status"] });
      toast({ title: "Disconnected", description: "Account has been unlinked." });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="h-5 w-5" />
          Connected Accounts
        </CardTitle>
        <CardDescription>Connect your social media accounts to enable publishing</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {PLATFORMS.map((platform) => {
              const status = statuses?.[platform.id];
              const connected = status?.connected || false;

              return (
                <div
                  key={platform.id}
                  className={`flex items-center justify-between p-4 border rounded-lg ${connected ? "border-emerald-200 bg-emerald-50/50" : ""}`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg font-bold ${platform.color}`}>
                      {platform.icon}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{platform.name}</p>
                      {connected ? (
                        <p className="text-xs text-emerald-600 flex items-center gap-1">
                          <CheckCircle className="h-3 w-3" /> Connected
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">Not connected</p>
                      )}
                    </div>
                  </div>
                  <div>
                    {connected ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => disconnectMutation.mutate(platform.id)}
                        disabled={disconnectMutation.isPending}
                      >
                        <Unlink className="h-4 w-4" />
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => connectMutation.mutate(platform.id)}
                        disabled={connectMutation.isPending}
                      >
                        {connectMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          "Connect"
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Post Management ─────────────────────────────────────────────────────

function PostManagementSection() {
  const { toast } = useToast();

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/social-media/generate");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/social-media/posts"] });
      toast({
        title: "Content generated!",
        description: `Created ${data.result?.draftsGenerated || 0} new draft posts.`,
      });
    },
    onError: (err: Error) => {
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Content Queue</CardTitle>
            <CardDescription>AI-generated posts for review and publishing</CardDescription>
          </div>
          <Button
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending}
            className="flex items-center gap-2"
          >
            {generateMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Generate Content
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="drafts">
          <TabsList>
            <TabsTrigger value="drafts">Drafts</TabsTrigger>
            <TabsTrigger value="approved">Approved</TabsTrigger>
            <TabsTrigger value="published">Published</TabsTrigger>
            <TabsTrigger value="rejected">Rejected</TabsTrigger>
          </TabsList>
          <TabsContent value="drafts"><PostsTable status="draft" /></TabsContent>
          <TabsContent value="approved"><PostsTable status="approved" /></TabsContent>
          <TabsContent value="published"><PostsTable status="published" /></TabsContent>
          <TabsContent value="rejected"><PostsTable status="rejected" /></TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

// ── Posts Table ──────────────────────────────────────────────────────────

function PostsTable({ status }: { status: string }) {
  const { toast } = useToast();
  const [editingPost, setEditingPost] = useState<SocialPost | null>(null);
  const [editContent, setEditContent] = useState("");
  const [viewingPost, setViewingPost] = useState<SocialPost | null>(null);

  const { data, isLoading } = useQuery<{ posts: SocialPost[] }>({
    queryKey: ["/api/social-media/posts", status],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/social-media/posts?status=${status}`);
      return res.json();
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

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const posts = data?.posts || [];

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
                  <p className="text-sm truncate">{displayContent.slice(0, 120)}...</p>
                  {post.editedContent && (
                    <span className="text-xs text-amber-600">(edited)</span>
                  )}
                </TableCell>
                <TableCell>
                  {post.industry ? (
                    <Badge variant="outline" className="capitalize text-xs">{post.industry}</Badge>
                  ) : "—"}
                </TableCell>
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

                    {/* Published — external link */}
                    {status === "published" && post.externalPostId && (
                      <Button size="sm" variant="ghost" asChild>
                        <a href={getExternalUrl(post.platform, post.externalPostId)} target="_blank" rel="noopener">
                          <ExternalLink className="h-4 w-4" />
                        </a>
                      </Button>
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
    </>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function getExternalUrl(platform: string, postId: string): string {
  switch (platform) {
    case "twitter":
      return `https://twitter.com/i/status/${postId}`;
    case "facebook":
      return `https://facebook.com/${postId}`;
    case "instagram":
      return `https://instagram.com/p/${postId}`;
    case "linkedin":
      return `https://linkedin.com/feed/update/${postId}`;
    default:
      return "#";
  }
}
