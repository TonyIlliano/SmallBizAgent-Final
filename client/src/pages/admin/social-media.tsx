/**
 * Social Media Management — Admin Page
 *
 * Connect social accounts, review AI-generated drafts, approve & publish.
 * Performance review: track engagement, mark winners, generate from winners.
 * Video briefs: AI-generated split-screen video ad briefs.
 * Ad targeting: Meta targeting cheat sheet.
 * Platform-level only (admin).
 */

import { useState, useEffect, useRef } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, CheckCircle, XCircle, ExternalLink, Pencil, Trash2,
  Send, Eye, RefreshCw, Link2, Unlink, Shield, Share2, Video, FileText,
  Star, BarChart3, Copy, ChevronDown, ChevronUp, Clapperboard, Target,
  Upload, Play, Film, Mic, Download, Monitor,
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
  mediaType: string | null;
  thumbnailUrl: string | null;
  status: string;
  scheduledFor: string | null;
  publishedAt: string | null;
  externalPostId: string | null;
  industry: string | null;
  details: any;
  rejectionReason: string | null;
  editedContent: string | null;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  reach: number;
  engagementScore: number;
  isWinner: boolean;
  createdAt: string;
  updatedAt: string;
}

interface VideoBriefData {
  hook: string;
  voiceover: string | null;
  screen_sequence: Array<{ duration: string; clip: string; note?: string }>;
  broll: string;
  caption: string;
  hashtags: string[];
  cta_overlay: string;
  boost_targeting: string;
  boost_budget: string;
  stock_search_terms: string[];
  estimated_duration?: number;
}

interface VideoBrief {
  id: number;
  vertical: string;
  platform: string;
  pillar: string | null;
  briefData: VideoBriefData;
  sourceWinnerIds: number[] | null;
  renderStatus: string | null;
  renderId: string | null;
  videoUrl: string | null;
  thumbnailUrl: string | null;
  voiceoverUrl: string | null;
  aspectRatio: string | null;
  renderError: string | null;
  renderedAt: string | null;
  createdAt: string;
}

interface VideoClip {
  id: number;
  name: string;
  description: string | null;
  category: string;
  s3Key: string;
  s3Url: string;
  durationSeconds: number | null;
  width: number | null;
  height: number | null;
  fileSize: number | null;
  mimeType: string | null;
  tags: string[] | null;
  sortOrder: number;
  createdAt: string;
}

interface TTSVoice {
  id: string;
  name: string;
  description: string;
}

interface PipelineStatus {
  shotstack: boolean;
  pexels: boolean;
  tts: boolean;
  s3: boolean;
  ready: boolean;
}

const CLIP_CATEGORIES = [
  { id: "dashboard", label: "Dashboard" },
  { id: "calls", label: "Incoming Calls" },
  { id: "calendar", label: "Calendar / Booking" },
  { id: "sms", label: "SMS / Messages" },
  { id: "invoice", label: "Invoicing" },
  { id: "crm", label: "Customer CRM" },
  { id: "agents", label: "AI Agents" },
  { id: "general", label: "General" },
];

// Platform metadata
const PLATFORMS = [
  { id: 'twitter', name: 'X / Twitter', color: 'bg-black text-white', icon: '𝕏' },
  { id: 'facebook', name: 'Facebook', color: 'bg-blue-600 text-white', icon: 'f' },
  { id: 'instagram', name: 'Instagram', color: 'bg-gradient-to-r from-purple-500 to-pink-500 text-white', icon: '📷' },
  { id: 'linkedin', name: 'LinkedIn', color: 'bg-blue-700 text-white', icon: 'in' },
] as const;

const VERTICALS = [
  "Barbershops", "Salons", "HVAC", "Plumbing", "Landscaping", "Electrical",
  "Cleaning", "Construction", "Automotive", "Dental", "Medical", "Veterinary",
  "Fitness", "Restaurant", "Retail", "Professional Services",
];

const CONTENT_PILLARS = [
  { id: "pain", label: "Pain Amplification" },
  { id: "feature", label: "Feature in Context" },
  { id: "proof", label: "Social Proof / Outcome" },
  { id: "education", label: "Education" },
  { id: "behind", label: "Behind the Build" },
];

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

        {/* Video Briefs + Render Pipeline */}
        <VideoBriefSection />

        {/* Clip Library */}
        <ClipLibrarySection />

        {/* Ad Targeting Reference */}
        <AdTargetingReference />
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
      if (!url) {
        toast({ title: "Not configured", description: "This platform's OAuth credentials are not set up on the server yet.", variant: "destructive" });
        return;
      }
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
  const [showWinnerGenDialog, setShowWinnerGenDialog] = useState(false);
  const [winnerGenVertical, setWinnerGenVertical] = useState("Barbershops");
  const [winnerGenPlatform, setWinnerGenPlatform] = useState("instagram");
  const [winnerGenCount, setWinnerGenCount] = useState(5);

  const { data: winners } = useQuery<SocialPost[]>({
    queryKey: ["/api/social-media/posts/winners"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/social-media/posts/winners");
      return res.json();
    },
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/social-media/generate");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/social-media/posts"] });
      toast({
        title: "Content generated!",
        description: `Created ${data.draftsGenerated || 0} new draft posts.`,
      });
    },
    onError: (err: Error) => {
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
    },
  });

  const generateFromWinnersMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/social-media/generate-from-winners", {
        vertical: winnerGenVertical,
        platform: winnerGenPlatform,
        count: winnerGenCount,
      });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/social-media/posts"] });
      setShowWinnerGenDialog(false);
      toast({
        title: "Content generated from winners!",
        description: `Created ${data.draftsGenerated || 0} new draft posts modeled after ${data.sourceWinners || 0} winner posts.`,
      });
    },
    onError: (err: Error) => {
      toast({ title: "Generation failed", description: err.message, variant: "destructive" });
    },
  });

  const winnerCount = winners?.length || 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <CardTitle>Content Queue</CardTitle>
            <CardDescription>AI-generated posts for review and publishing</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setShowWinnerGenDialog(true)}
              disabled={winnerCount === 0}
              className="flex items-center gap-2"
              title={winnerCount === 0 ? "Mark some published posts as winners first" : `Generate from ${winnerCount} winner posts`}
            >
              <Star className="h-4 w-4" />
              Generate from Winners
              {winnerCount > 0 && (
                <Badge variant="secondary" className="ml-1 bg-amber-100 text-amber-800">{winnerCount}</Badge>
              )}
            </Button>
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

      {/* Generate from Winners Dialog */}
      <Dialog open={showWinnerGenDialog} onOpenChange={setShowWinnerGenDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Star className="h-5 w-5 text-amber-500" />
              Generate from Winner Posts
            </DialogTitle>
            <DialogDescription>
              Create new posts modeled after your top-performing content. {winnerCount} winner{winnerCount !== 1 ? "s" : ""} available as training signal.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Target Vertical</Label>
              <select
                value={winnerGenVertical}
                onChange={(e) => setWinnerGenVertical(e.target.value)}
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
                value={winnerGenPlatform}
                onChange={(e) => setWinnerGenPlatform(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {PLATFORMS.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Number of Posts (1-10)</Label>
              <Input
                type="number"
                min={1}
                max={10}
                value={winnerGenCount}
                onChange={(e) => setWinnerGenCount(Math.min(10, Math.max(1, Number(e.target.value) || 5)))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowWinnerGenDialog(false)}>Cancel</Button>
            <Button
              onClick={() => generateFromWinnersMutation.mutate()}
              disabled={generateFromWinnersMutation.isPending}
              className="flex items-center gap-2"
            >
              {generateFromWinnersMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Star className="h-4 w-4" />
              )}
              Generate {winnerGenCount} Posts
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ── Posts Table ──────────────────────────────────────────────────────────

function PostsTable({ status }: { status: string }) {
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
      toast({ title: "Video generation started", description: "Rendering in progress — this page will update automatically when the video is ready (~30-60 seconds)." });
      if (videoPollIntervalRef.current) clearInterval(videoPollIntervalRef.current);
      let attempts = 0;
      const maxAttempts = 30;
      videoPollIntervalRef.current = setInterval(async () => {
        attempts++;
        try {
          const res = await apiRequest("GET", `/api/social-media/posts/${postId}/video-status`);
          const statusData = await res.json();
          if (statusData.mediaType === 'video' && statusData.mediaUrl) {
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
                    {post.mediaType === 'video' ? (
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
                  ) : "—"}
                </TableCell>
                {status === "published" && (
                  <TableCell>
                    {post.engagementScore > 0 ? (
                      <Badge variant="outline" className="font-mono text-xs">
                        {(post.engagementScore * 100).toFixed(2)}%
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
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
                        {post.mediaType !== 'video' && videoAvailability?.available && (
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

                    {/* Published actions — metrics, winner toggle, external link */}
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
          {viewingPost?.mediaType === 'video' && viewingPost?.mediaUrl && (
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
                  {viewingPost.details?.video?.duration && ` • ${viewingPost.details.video.duration}s`}
                </span>
              </div>
            </div>
          )}
          {viewingPost?.mediaType === 'video' && !viewingPost?.mediaUrl && (
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
              Score: (Saves×3 + Shares×2 + Comments×1.5 + Likes) ÷ Reach
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

// ── Video Brief Section ──────────────────────────────────────────────────

function VideoBriefSection() {
  const { toast } = useToast();
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [showRenderDialog, setShowRenderDialog] = useState(false);
  const [renderBriefId, setRenderBriefId] = useState<number | null>(null);
  const [renderAspectRatio, setRenderAspectRatio] = useState<"9:16" | "16:9">("9:16");
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
    }, 10000); // Poll every 10 seconds
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
    const text = `VIDEO AD BRIEF — SmallBizAgent
Platform: ${brief.platform} | Vertical: ${brief.vertical} | Pillar: ${brief.pillar}

HOOK: ${b.hook}
VOICEOVER: ${b.voiceover || "None"}
CTA OVERLAY: ${b.cta_overlay}

SCREEN SEQUENCE:
${b.screen_sequence?.map((s: any, i: number) => `${i + 1}. [${s.duration}] ${s.clip}${s.note ? ` — ${s.note}` : ""}`).join("\n") || "N/A"}

B-ROLL: ${b.broll}

CAPTION:
${b.caption}

HASHTAGS: ${b.hashtags?.map((h: string) => `#${h}`).join(" ") || "N/A"}

BOOST: ${b.boost_targeting} · ${b.boost_budget}
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
                <div title="Shotstack (Video Rendering)" className={`h-2 w-2 rounded-full ${pipelineStatus.shotstack ? 'bg-green-500' : 'bg-red-400'}`} />
                <div title="Pexels (Stock Footage)" className={`h-2 w-2 rounded-full ${pipelineStatus.pexels ? 'bg-green-500' : 'bg-yellow-400'}`} />
                <div title="TTS (Voiceover)" className={`h-2 w-2 rounded-full ${pipelineStatus.tts ? 'bg-green-500' : 'bg-yellow-400'}`} />
                <div title="S3 (Storage)" className={`h-2 w-2 rounded-full ${pipelineStatus.s3 ? 'bg-green-500' : 'bg-red-400'}`} />
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
                  <span>·</span>
                  <span>{brief.pillar}</span>
                  <span>·</span>
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
                  <option key={v.id} value={v.id}>{v.name} — {v.description}</option>
                ))}
              </select>
              {!voiceData?.available && (
                <p className="text-xs text-amber-500">TTS not configured — video will render without voiceover</p>
              )}
            </div>
            {/* Pipeline status */}
            <div className="bg-muted/50 rounded-lg p-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Pipeline Status</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex items-center gap-2">
                  <div className={`h-2 w-2 rounded-full ${pipelineStatus?.shotstack ? 'bg-green-500' : 'bg-red-400'}`} />
                  <span>Shotstack</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`h-2 w-2 rounded-full ${pipelineStatus?.pexels ? 'bg-green-500' : 'bg-yellow-400'}`} />
                  <span>Pexels Stock</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`h-2 w-2 rounded-full ${pipelineStatus?.tts ? 'bg-green-500' : 'bg-yellow-400'}`} />
                  <span>Voiceover TTS</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className={`h-2 w-2 rounded-full ${pipelineStatus?.s3 ? 'bg-green-500' : 'bg-red-400'}`} />
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
              {viewingBrief?.platform} · {viewingBrief?.pillar} · {formatDate(viewingBrief?.createdAt || null)}
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
                      Rendered {formatDate(viewingBrief.renderedAt)} · {viewingBrief.aspectRatio}
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
                  <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-3">Top Half — Screen Recording</p>
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
                  <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider mb-3">Bottom Half — B-Roll</p>
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

// ── Clip Library ───────────────────────────────────────────────────────

function ClipLibrarySection() {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [uploadName, setUploadName] = useState("");
  const [uploadDescription, setUploadDescription] = useState("");
  const [uploadCategory, setUploadCategory] = useState("dashboard");
  const [uploadTags, setUploadTags] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: clips, isLoading } = useQuery<VideoClip[]>({
    queryKey: ["/api/social-media/clips"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/social-media/clips");
      return res.json();
    },
    enabled: expanded,
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!uploadFile) throw new Error("No file selected");
      if (!uploadName) throw new Error("Name is required");

      const formData = new FormData();
      formData.append("file", uploadFile);
      formData.append("name", uploadName);
      formData.append("description", uploadDescription);
      formData.append("category", uploadCategory);
      if (uploadTags) {
        formData.append("tags", JSON.stringify(uploadTags.split(",").map(t => t.trim()).filter(Boolean)));
      }

      // Include CSRF token for multipart upload
      const csrfToken = document.cookie
        .split("; ")
        .find((c) => c.startsWith("csrf-token="))
        ?.split("=")[1];

      const headers: Record<string, string> = {};
      if (csrfToken) headers["X-CSRF-Token"] = csrfToken;

      // Route GIFs to the converter endpoint, videos to direct upload
      const isGif = uploadFile.type === "image/gif" || uploadFile.name.toLowerCase().endsWith(".gif");
      const endpoint = isGif ? "/api/social-media/clips/from-gif" : "/api/social-media/clips";

      const res = await fetch(endpoint, {
        method: "POST",
        body: formData,
        headers,
        credentials: "include",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Upload failed (${res.status})`);
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/social-media/clips"] });
      setShowUploadDialog(false);
      resetUploadForm();
      toast({ title: "Clip uploaded!", description: "It's now available for video rendering." });
    },
    onError: (err: Error) => {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/social-media/clips/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/social-media/clips"] });
      toast({ title: "Clip deleted" });
    },
  });

  const resetUploadForm = () => {
    setUploadName("");
    setUploadDescription("");
    setUploadCategory("dashboard");
    setUploadTags("");
    setUploadFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return "—";
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  const getCategoryIcon = (cat: string) => {
    switch (cat) {
      case "dashboard": return "📊";
      case "calls": return "📞";
      case "calendar": return "📅";
      case "sms": return "💬";
      case "invoice": return "💰";
      case "crm": return "👤";
      case "agents": return "🤖";
      default: return "🎬";
    }
  };

  return (
    <Card>
      <CardHeader className="cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Monitor className="h-5 w-5" />
            <CardTitle className="text-base">
              Screen Recording Library
              {clips && clips.length > 0 && (
                <Badge variant="secondary" className="ml-2 text-xs">{clips.length} clips</Badge>
              )}
            </CardTitle>
          </div>
          {expanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
        </div>
        <CardDescription>
          Upload screen recordings of SmallBizAgent (with demo data). These are used automatically when rendering video briefs.
        </CardDescription>
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-4">
          {/* Recording instructions */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm font-medium text-blue-800 mb-2">📹 How to Record Clips</p>
            <ol className="text-xs text-blue-700 space-y-1 list-decimal list-inside">
              <li>Press <kbd className="px-1 py-0.5 bg-blue-100 rounded text-xs font-mono">⌘+Shift+5</kbd> on Mac (or QuickTime → File → New Screen Recording)</li>
              <li>Navigate to the SmallBizAgent page you want to capture</li>
              <li>Use demo/fake data — <strong>never show real customer info</strong></li>
              <li>Record 8-10 seconds of interaction, then stop</li>
              <li>Upload the clip here with the matching category</li>
            </ol>
            <div className="mt-3 flex flex-wrap gap-1">
              {CLIP_CATEGORIES.map((cat) => (
                <Badge key={cat.id} variant="secondary" className="text-xs">
                  {getCategoryIcon(cat.id)} {cat.label}
                </Badge>
              ))}
            </div>
          </div>

          {/* Clips grid */}
          {isLoading ? (
            <div className="flex justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : !clips || clips.length === 0 ? (
            <div className="text-center py-8 border rounded-lg border-dashed">
              <Film className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground mb-3">No clips uploaded yet</p>
              <Button size="sm" onClick={() => setShowUploadDialog(true)} className="flex items-center gap-2">
                <Upload className="h-4 w-4" />
                Upload First Clip
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {clips.map((clip) => (
                <div
                  key={clip.id}
                  className="flex items-center justify-between border rounded-lg p-3 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{getCategoryIcon(clip.category)}</span>
                    <div>
                      <p className="text-sm font-medium">{clip.name}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{clip.category}</span>
                        {clip.durationSeconds && <span>· {clip.durationSeconds}s</span>}
                        <span>· {formatFileSize(clip.fileSize)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      title="Preview clip"
                      onClick={() => window.open(clip.s3Url, "_blank")}
                    >
                      <Play className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-red-400"
                      title="Delete clip"
                      onClick={() => deleteMutation.mutate(clip.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Upload button */}
          {clips && clips.length > 0 && (
            <Button
              variant="outline"
              className="w-full flex items-center gap-2"
              onClick={() => setShowUploadDialog(true)}
            >
              <Upload className="h-4 w-4" />
              Upload New Clip
            </Button>
          )}

          {/* Upload Dialog */}
          <Dialog open={showUploadDialog} onOpenChange={(open) => { setShowUploadDialog(open); if (!open) resetUploadForm(); }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Upload className="h-5 w-5" />
                  Upload Screen Recording
                </DialogTitle>
                <DialogDescription>
                  Upload a screen recording clip to use in automated video production.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label>Video or GIF File</Label>
                  <Input
                    ref={fileInputRef}
                    type="file"
                    accept="video/*,image/gif"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setUploadFile(file);
                        if (!uploadName) {
                          setUploadName(file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "));
                        }
                      }
                    }}
                  />
                  {uploadFile && (
                    <p className="text-xs text-muted-foreground">
                      {uploadFile.name} · {formatFileSize(uploadFile.size)}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Clip Name</Label>
                  <Input
                    value={uploadName}
                    onChange={(e) => setUploadName(e.target.value)}
                    placeholder="e.g., Dashboard Overview Scroll"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Category</Label>
                  <select
                    value={uploadCategory}
                    onChange={(e) => setUploadCategory(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    {CLIP_CATEGORIES.map((cat) => (
                      <option key={cat.id} value={cat.id}>{getCategoryIcon(cat.id)} {cat.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Description (optional)</Label>
                  <Input
                    value={uploadDescription}
                    onChange={(e) => setUploadDescription(e.target.value)}
                    placeholder="What this clip shows"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Tags (optional, comma-separated)</Label>
                  <Input
                    value={uploadTags}
                    onChange={(e) => setUploadTags(e.target.value)}
                    placeholder="e.g., ai, receptionist, stats"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setShowUploadDialog(false); resetUploadForm(); }}>Cancel</Button>
                <Button
                  onClick={() => uploadMutation.mutate()}
                  disabled={uploadMutation.isPending || !uploadFile || !uploadName}
                  className="flex items-center gap-2"
                >
                  {uploadMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  Upload Clip
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      )}
    </Card>
  );
}

// ── Ad Targeting Reference ──────────────────────────────────────────────

const AD_TARGETING = {
  interests: [
    "Small business owner", "Barbershop", "Hair salon", "HVAC services",
    "Landscaping", "Booksy", "StyleSeat", "Square Appointments",
    "Jobber", "Service business", "Entrepreneurship",
  ],
  behaviors: [
    "Small business owners", "Business page admins",
    "Engaged shoppers", "Mobile business",
  ],
  demographics: {
    age: "28–55",
    locations: "United States",
    jobTitles: ["Owner", "Founder", "Self-employed", "Independent contractor"],
  },
  budget: "$5–20/day per boosted post",
  objective: "Lead generation → Demo booking",
  cta: "Book Now → smallbizagent.ai/demo",
};

function AdTargetingReference() {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);

  const copyTargeting = () => {
    const text = `AD TARGETING — SmallBizAgent
Objective: Lead Generation → Demo Booking
CTA: Book Now → smallbizagent.ai/demo
Budget: ${AD_TARGETING.budget}

INTERESTS: ${AD_TARGETING.interests.join(", ")}
BEHAVIORS: ${AD_TARGETING.behaviors.join(", ")}
AGE: ${AD_TARGETING.demographics.age}
LOCATIONS: ${AD_TARGETING.demographics.locations}
JOB TITLES: ${AD_TARGETING.demographics.jobTitles.join(", ")}`;

    navigator.clipboard.writeText(text);
    toast({ title: "Targeting sheet copied to clipboard" });
  };

  return (
    <Card>
      <CardHeader className="cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            <CardTitle className="text-base">Ad Targeting Cheat Sheet</CardTitle>
          </div>
          {expanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
        </div>
        <CardDescription>Meta ad targeting parameters for SmallBizAgent's audience</CardDescription>
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-4">
          {/* Objective banner */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider mb-1">Campaign Objective</p>
              <p className="font-semibold">{AD_TARGETING.objective}</p>
              <p className="text-xs text-muted-foreground mt-1">{AD_TARGETING.cta}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Daily Budget</p>
              <p className="text-xl font-bold font-mono text-amber-600">{AD_TARGETING.budget}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Interests */}
            <div className="border rounded-lg p-4">
              <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-3">Interests</p>
              <div className="flex flex-wrap gap-1.5">
                {AD_TARGETING.interests.map((i) => (
                  <Badge key={i} variant="secondary" className="text-xs">{i}</Badge>
                ))}
              </div>
            </div>

            {/* Behaviors + Demographics */}
            <div className="border rounded-lg p-4">
              <p className="text-xs font-semibold text-purple-600 uppercase tracking-wider mb-3">Behaviors</p>
              <div className="flex flex-wrap gap-1.5 mb-4">
                {AD_TARGETING.behaviors.map((b) => (
                  <Badge key={b} variant="secondary" className="text-xs">{b}</Badge>
                ))}
              </div>
              <div className="border-t pt-3">
                <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider mb-2">Demographics</p>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Age</span>
                    <span className="font-mono">{AD_TARGETING.demographics.age}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Location</span>
                    <span>{AD_TARGETING.demographics.locations}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Job Titles */}
          <div className="border rounded-lg p-4">
            <p className="text-xs font-semibold text-red-600 uppercase tracking-wider mb-3">Job Titles to Target</p>
            <div className="flex flex-wrap gap-1.5">
              {AD_TARGETING.demographics.jobTitles.map((t) => (
                <Badge key={t} variant="outline" className="text-xs border-red-200 text-red-700">{t}</Badge>
              ))}
            </div>
          </div>

          <Button variant="outline" className="flex items-center gap-2" onClick={copyTargeting}>
            <Copy className="h-4 w-4" />
            Copy Full Targeting Sheet
          </Button>
        </CardContent>
      )}
    </Card>
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
