import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Loader2, FileText, Zap, Play, CheckCircle, XCircle, Share2,
} from "lucide-react";
import type { BlogPost, SocialConnectionStatus, SocialPostSummary } from "../types";

// ── Social Media Summary Card ────────────────────────────────────────────

const SOCIAL_PLATFORMS = [
  { id: "twitter", label: "Twitter" },
  { id: "facebook", label: "Facebook" },
  { id: "instagram", label: "Instagram" },
  { id: "linkedin", label: "LinkedIn" },
];

function SocialMediaSummaryCard() {
  const { data: socialPosts } = useQuery<SocialPostSummary[]>({
    queryKey: ["/api/social-media/posts"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/social-media/posts");
      return res.json();
    },
  });

  const { data: connectionStatuses } = useQuery<Record<string, SocialConnectionStatus>>({
    queryKey: ["/api/social-media/status"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/social-media/status");
      return res.json();
    },
  });

  const drafts = socialPosts?.filter(p => p.status === "draft").length || 0;
  const approved = socialPosts?.filter(p => p.status === "approved").length || 0;
  const published = socialPosts?.filter(p => p.status === "published").length || 0;
  const connectedCount = connectionStatuses
    ? Object.values(connectionStatuses).filter(s => s.connected).length
    : 0;

  return (
    <Card className="border-dashed">
      <CardContent className="py-4 px-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <Share2 className="h-5 w-5 mt-0.5 text-pink-500 flex-shrink-0" />
            <div>
              <h3 className="font-semibold text-sm">Social Media Posts</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {drafts} drafts &middot; {approved} approved &middot; {published} published
              </p>
              <div className="flex items-center gap-2 mt-2">
                {SOCIAL_PLATFORMS.map(p => {
                  const connected = connectionStatuses?.[p.id]?.connected;
                  return (
                    <span
                      key={p.id}
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        connected
                          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          : "bg-neutral-100 text-neutral-400 dark:bg-neutral-800 dark:text-neutral-500"
                      }`}
                    >
                      {p.label}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
          <Link href="/admin/social-media">
            <Button variant="outline" size="sm" className="flex-shrink-0">
              <Share2 className="h-3.5 w-3.5 mr-2" />
              Manage Social Media
            </Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Content Tab ──────────────────────────────────────────────────────────

function ContentTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [editingPost, setEditingPost] = useState<BlogPost | null>(null);
  const [editBody, setEditBody] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editExcerpt, setEditExcerpt] = useState("");
  const [editMetaTitle, setEditMetaTitle] = useState("");
  const [editMetaDescription, setEditMetaDescription] = useState("");

  const { data: posts = [], isLoading } = useQuery<BlogPost[]>({
    queryKey: ["/api/admin/blog-posts", statusFilter],
    queryFn: async () => {
      const url = statusFilter !== "all"
        ? `/api/admin/blog-posts?status=${statusFilter}`
        : "/api/admin/blog-posts";
      const res = await apiRequest("GET", url);
      const data = await res.json();
      return data.posts || [];
    },
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/blog-posts/generate");
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Content generated", description: `${data.blogsCreated || 0} blog posts, ${data.socialDraftsCreated || 0} social drafts created` });
      qc.invalidateQueries({ queryKey: ["/api/admin/blog-posts"] });
    },
    onError: (err: Error) => {
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("POST", `/api/admin/blog-posts/${id}/approve`);
    },
    onSuccess: () => {
      toast({ title: "Post approved" });
      qc.invalidateQueries({ queryKey: ["/api/admin/blog-posts"] });
    },
  });

  const publishMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("POST", `/api/admin/blog-posts/${id}/publish`);
    },
    onSuccess: () => {
      toast({ title: "Post published" });
      qc.invalidateQueries({ queryKey: ["/api/admin/blog-posts"] });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!editingPost) return;
      await apiRequest("PUT", `/api/admin/blog-posts/${editingPost.id}`, {
        title: editTitle,
        excerpt: editExcerpt,
        editedBody: editBody,
        metaTitle: editMetaTitle,
        metaDescription: editMetaDescription,
      });
    },
    onSuccess: () => {
      toast({ title: "Post saved" });
      setEditingPost(null);
      qc.invalidateQueries({ queryKey: ["/api/admin/blog-posts"] });
    },
    onError: (err: Error) => {
      toast({ title: "Save failed", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/admin/blog-posts/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Post deleted" });
      qc.invalidateQueries({ queryKey: ["/api/admin/blog-posts"] });
    },
  });

  function openEditor(post: BlogPost) {
    setEditingPost(post);
    setEditTitle(post.title);
    setEditExcerpt(post.excerpt || "");
    setEditBody(post.editedBody || post.body);
    setEditMetaTitle(post.metaTitle || "");
    setEditMetaDescription(post.metaDescription || "");
  }

  const statusBadge = (status: string) => {
    const variants: Record<string, string> = {
      draft: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
      approved: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
      published: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
      archived: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
    };
    return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${variants[status] || variants.draft}`}>{status}</span>;
  };

  const counts = {
    all: posts?.length || 0,
    draft: posts?.filter(p => p.status === "draft").length || 0,
    approved: posts?.filter(p => p.status === "approved").length || 0,
    published: posts?.filter(p => p.status === "published").length || 0,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Blog Content Management</h2>
          <p className="text-sm text-muted-foreground">AI-generated blog posts for SEO. Review, edit, and publish.</p>
        </div>
        <Button onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending} size="sm">
          {generateMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Zap className="h-4 w-4 mr-2" />}
          Generate Content
        </Button>
      </div>

      <SocialMediaSummaryCard />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="cursor-pointer hover:ring-2 ring-primary/50 transition-all" onClick={() => setStatusFilter("all")}>
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-xs text-muted-foreground">Total Posts</p>
            <p className="text-2xl font-bold">{counts.all}</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:ring-2 ring-yellow-500/50 transition-all" onClick={() => setStatusFilter("draft")}>
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-xs text-muted-foreground">Drafts</p>
            <p className="text-2xl font-bold text-yellow-600">{counts.draft}</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:ring-2 ring-blue-500/50 transition-all" onClick={() => setStatusFilter("approved")}>
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-xs text-muted-foreground">Approved</p>
            <p className="text-2xl font-bold text-blue-600">{counts.approved}</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:ring-2 ring-green-500/50 transition-all" onClick={() => setStatusFilter("published")}>
          <CardContent className="pt-4 pb-3 px-4">
            <p className="text-xs text-muted-foreground">Published</p>
            <p className="text-2xl font-bold text-green-600">{counts.published}</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Filter status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Posts</SelectItem>
            <SelectItem value="draft">Drafts</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="published">Published</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : !posts || posts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 text-muted-foreground/40 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No blog posts yet</h3>
            <p className="text-sm text-muted-foreground mb-4">Click "Generate Content" to create AI-powered blog posts for SEO.</p>
            <Button onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending} variant="outline" size="sm">
              <Zap className="h-4 w-4 mr-2" /> Generate First Posts
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead className="w-24">Status</TableHead>
                  <TableHead className="w-24">Industry</TableHead>
                  <TableHead className="w-20">Words</TableHead>
                  <TableHead className="w-24">Source</TableHead>
                  <TableHead className="w-28">Created</TableHead>
                  <TableHead className="w-40 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(posts || []).map((post) => (
                  <TableRow key={post.id} className="hover:bg-muted/30">
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm truncate max-w-[300px]">{post.title}</p>
                        {post.excerpt && (
                          <p className="text-xs text-muted-foreground truncate max-w-[300px] mt-0.5">{post.excerpt}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{statusBadge(post.status)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground capitalize">{post.industry || "\u2014"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{post.wordCount?.toLocaleString() || 0}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {post.generatedVia === "openai" ? "AI" : "Template"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {post.createdAt ? new Date(post.createdAt).toLocaleDateString() : "\u2014"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEditor(post)} title="Edit">
                          <FileText className="h-3.5 w-3.5" />
                        </Button>
                        {post.status === "draft" && (
                          <Button size="sm" variant="ghost" onClick={() => approveMutation.mutate(post.id)}
                            disabled={approveMutation.isPending} className="text-blue-600 hover:text-blue-700" title="Approve">
                            <CheckCircle className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {(post.status === "draft" || post.status === "approved") && (
                          <Button size="sm" variant="ghost" onClick={() => publishMutation.mutate(post.id)}
                            disabled={publishMutation.isPending} className="text-green-600 hover:text-green-700" title="Publish">
                            <Play className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => {
                          if (confirm("Delete this post?")) deleteMutation.mutate(post.id);
                        }} className="text-red-600 hover:text-red-700" title="Delete">
                          <XCircle className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      <Dialog open={!!editingPost} onOpenChange={(open) => !open && setEditingPost(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Blog Post</DialogTitle>
          </DialogHeader>
          {editingPost && (
            <div className="space-y-4 pt-2">
              <div className="flex items-center gap-3">
                {statusBadge(editingPost.status)}
                <Badge variant="outline" className="text-xs">
                  {editingPost.generatedVia === "openai" ? "AI Generated" : "Template Generated"}
                </Badge>
                <span className="text-xs text-muted-foreground">{editingPost.wordCount} words</span>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Title</label>
                <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Excerpt</label>
                <Textarea value={editExcerpt} onChange={(e) => setEditExcerpt(e.target.value)} rows={2} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Meta Title (SEO)</label>
                  <Input value={editMetaTitle} onChange={(e) => setEditMetaTitle(e.target.value)} placeholder="SEO title..." />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Meta Description (SEO)</label>
                  <Input value={editMetaDescription} onChange={(e) => setEditMetaDescription(e.target.value)} placeholder="SEO description..." />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Body (Markdown)</label>
                <Textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} rows={18} className="font-mono text-sm" />
              </div>
              <div className="flex items-center justify-between pt-2 border-t">
                <div className="flex gap-2">
                  {editingPost.status === "draft" && (
                    <Button size="sm" variant="outline" onClick={() => { approveMutation.mutate(editingPost.id); setEditingPost(null); }}>
                      <CheckCircle className="h-4 w-4 mr-2" /> Approve
                    </Button>
                  )}
                  {(editingPost.status === "draft" || editingPost.status === "approved") && (
                    <Button size="sm" variant="outline" onClick={() => { publishMutation.mutate(editingPost.id); setEditingPost(null); }}
                      className="text-green-600 border-green-200 hover:bg-green-50">
                      <Play className="h-4 w-4 mr-2" /> Publish
                    </Button>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setEditingPost(null)}>Cancel</Button>
                  <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                    {saveMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                    Save Changes
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default ContentTab;
