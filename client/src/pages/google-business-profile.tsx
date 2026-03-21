/**
 * Google Business Profile Dashboard
 *
 * 5-tab layout: Overview, Business Info, Reviews, Posts, SEO Score
 * Full bi-directional sync with GBP, review management, local posts, SEO scoring.
 */

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageLayout } from "@/components/layout/PageLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import {
  Loader2, RefreshCw, Star, MessageSquare, FileText, BarChart3,
  ExternalLink, CheckCircle2, XCircle, AlertTriangle, ArrowUpRight,
  ArrowDownLeft, Flag, Send, Sparkles, Globe, MapPin, Phone, Clock,
  Building2, Unlink, ChevronLeft, ChevronRight,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface GBPStatus {
  connected: boolean;
  data: {
    selectedAccount?: { name: string; accountName: string };
    selectedLocation?: { name: string; title: string };
    cachedBusinessInfo?: Record<string, any>;
    conflicts?: { field: string; localValue: string | null; gbpValue: string | null; detectedAt: string }[];
    syncMetadata?: { lastReviewSyncedAt?: string; fieldsLastPushed?: string };
  } | null;
}

interface BusinessInfo {
  info: Record<string, any> | null;
  conflicts: { field: string; localValue: string | null; gbpValue: string | null; detectedAt: string }[];
  cached: boolean;
}

interface ReviewsResponse {
  reviews: {
    id: number;
    businessId: number;
    gbpReviewId: string;
    reviewerName: string | null;
    rating: number | null;
    reviewText: string | null;
    reviewDate: string | null;
    replyText: string | null;
    replyDate: string | null;
    flagged: boolean;
  }[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
  summary: { total: number; avgRating: number; responseRate: number; flaggedCount: number };
}

interface GbpPost {
  id: number;
  businessId: number;
  content: string;
  callToAction: string | null;
  callToActionUrl: string | null;
  status: string;
  gbpPostId: string | null;
  publishedAt: string | null;
  createdAt: string;
}

interface SeoScore {
  score: number;
  breakdown: { category: string; label: string; points: number; maxPoints: number; met: boolean }[];
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function GoogleBusinessProfilePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const businessId = user?.businessId;

  // ── OAuth popup message listener ──
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === "gbp-connected") {
        queryClient.invalidateQueries({ queryKey: ["/api/gbp/status", businessId] });
        toast({ title: "Connected", description: "Google Business Profile connected successfully." });
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [businessId, toast, queryClient]);

  // ── GBP connection status ──
  const { data: status, isLoading: statusLoading } = useQuery<GBPStatus>({
    queryKey: ["/api/gbp/status", businessId],
    queryFn: async () => {
      const res = await fetch(`/api/gbp/status/${businessId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch GBP status");
      return res.json();
    },
    enabled: !!businessId,
  });

  // ── OAuth URL (only fetch when not connected) ──
  const { data: authData } = useQuery<{ url: string }>({
    queryKey: ["/api/gbp/auth-url", businessId],
    queryFn: async () => {
      const res = await fetch(`/api/gbp/auth-url/${businessId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch auth URL");
      return res.json();
    },
    enabled: !!businessId && !!status && !status.connected,
  });

  const handleConnect = () => {
    if (authData?.url) {
      window.open(authData.url, "_blank", "width=600,height=700");
    }
  };

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", `/api/gbp/${businessId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gbp/status", businessId] });
      toast({ title: "Disconnected", description: "Google Business Profile disconnected." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  if (statusLoading) {
    return (
      <PageLayout title="Google Business Profile">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </PageLayout>
    );
  }

  // ── Not Connected State ──
  if (!status?.connected) {
    return (
      <PageLayout title="Google Business Profile">
        <div className="max-w-2xl mx-auto">
          <Card className="border-border bg-card">
            <CardHeader className="text-center">
              <div className="mx-auto p-4 rounded-full bg-blue-100 dark:bg-blue-900/30 w-fit mb-4">
                <MapPin className="h-8 w-8 text-blue-600 dark:text-blue-400" />
              </div>
              <CardTitle className="text-xl">Connect Google Business Profile</CardTitle>
              <CardDescription>
                Sync your business info, manage reviews, publish posts, and boost your local SEO — all from one dashboard.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-4">
              <ul className="text-sm text-muted-foreground space-y-2 text-left">
                <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-500" /> Keep business info in sync with Google</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-500" /> Monitor and reply to reviews</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-500" /> Publish posts to your Google listing</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-500" /> Track your local SEO score</li>
              </ul>
              <Button onClick={handleConnect} disabled={!authData?.url} className="mt-2">
                <ExternalLink className="h-4 w-4 mr-2" />
                Connect with Google
              </Button>
            </CardContent>
          </Card>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout title="Google Business Profile">
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview" className="flex items-center gap-1.5">
            <Globe className="h-4 w-4" />
            <span className="hidden sm:inline">Overview</span>
          </TabsTrigger>
          <TabsTrigger value="info" className="flex items-center gap-1.5">
            <Building2 className="h-4 w-4" />
            <span className="hidden sm:inline">Business Info</span>
          </TabsTrigger>
          <TabsTrigger value="reviews" className="flex items-center gap-1.5">
            <Star className="h-4 w-4" />
            <span className="hidden sm:inline">Reviews</span>
          </TabsTrigger>
          <TabsTrigger value="posts" className="flex items-center gap-1.5">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Posts</span>
          </TabsTrigger>
          <TabsTrigger value="seo" className="flex items-center gap-1.5">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">SEO Score</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab businessId={businessId!} status={status} onDisconnect={() => disconnectMutation.mutate()} />
        </TabsContent>
        <TabsContent value="info">
          <BusinessInfoTab businessId={businessId!} />
        </TabsContent>
        <TabsContent value="reviews">
          <ReviewsTab businessId={businessId!} />
        </TabsContent>
        <TabsContent value="posts">
          <PostsTab businessId={businessId!} />
        </TabsContent>
        <TabsContent value="seo">
          <SeoScoreTab businessId={businessId!} />
        </TabsContent>
      </Tabs>
    </PageLayout>
  );
}

// ─── Tab 1: Overview ────────────────────────────────────────────────────────

function OverviewTab({ businessId, status, onDisconnect }: { businessId: number; status: GBPStatus; onDisconnect: () => void }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/gbp/sync/${businessId}`);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/gbp"] });
      toast({
        title: "Sync Complete",
        description: `${data.reviewsSynced} reviews synced, ${data.conflicts?.length || 0} conflicts detected.`,
      });
    },
    onError: (error: Error) => {
      toast({ title: "Sync Failed", description: error.message, variant: "destructive" });
    },
  });

  const { data: seoData } = useQuery<SeoScore>({
    queryKey: ["/api/gbp/seo-score", businessId],
    queryFn: async () => {
      const res = await fetch(`/api/gbp/seo-score/${businessId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!businessId,
  });

  const { data: reviewData } = useQuery<ReviewsResponse>({
    queryKey: ["/api/gbp/reviews", businessId, { page: 1, limit: 1 }],
    queryFn: async () => {
      const res = await fetch(`/api/gbp/reviews/${businessId}?page=1&limit=1`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!businessId,
  });

  const conflicts = status.data?.conflicts || [];
  const locationTitle = status.data?.selectedLocation?.title || "Connected";

  return (
    <div className="space-y-6 mt-4">
      {/* Connection status */}
      <Card className="border-border bg-card">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-green-100 dark:bg-green-900/30">
                <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="font-semibold">{locationTitle}</p>
                <p className="text-sm text-muted-foreground">Google Business Profile connected</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
                {syncMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
                Sync Now
              </Button>
              <Button variant="ghost" size="sm" onClick={onDisconnect} className="text-destructive hover:text-destructive">
                <Unlink className="h-4 w-4 mr-2" />
                Disconnect
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Conflicts banner */}
      {conflicts.length > 0 && (
        <Alert className="border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-800 dark:text-amber-200">
            {conflicts.length} field{conflicts.length !== 1 ? "s" : ""} differ between SmallBizAgent and Google.
            Review them in the <strong>Business Info</strong> tab.
          </AlertDescription>
        </Alert>
      )}

      {/* Quick stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-border bg-card">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Reviews</p>
                <p className="text-2xl font-bold">{reviewData?.summary?.total ?? "—"}</p>
              </div>
              <div className="p-3 rounded-full bg-yellow-100 dark:bg-yellow-900/30">
                <Star className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Avg Rating</p>
                <p className="text-2xl font-bold">{reviewData?.summary?.avgRating ? `${reviewData.summary.avgRating}/5` : "—"}</p>
              </div>
              <div className="p-3 rounded-full bg-green-100 dark:bg-green-900/30">
                <Star className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">SEO Score</p>
                <p className="text-2xl font-bold">{seoData?.score ?? "—"}<span className="text-sm font-normal text-muted-foreground">/100</span></p>
              </div>
              <div className="p-3 rounded-full bg-blue-100 dark:bg-blue-900/30">
                <BarChart3 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Conflicts</p>
                <p className="text-2xl font-bold">{conflicts.length}</p>
              </div>
              <div className={`p-3 rounded-full ${conflicts.length > 0 ? "bg-amber-100 dark:bg-amber-900/30" : "bg-gray-100 dark:bg-gray-900/30"}`}>
                <AlertTriangle className={`h-5 w-5 ${conflicts.length > 0 ? "text-amber-600 dark:text-amber-400" : "text-gray-400"}`} />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ─── Tab 2: Business Info ───────────────────────────────────────────────────

function BusinessInfoTab({ businessId }: { businessId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<BusinessInfo>({
    queryKey: ["/api/gbp/business-info", businessId],
    queryFn: async () => {
      const res = await fetch(`/api/gbp/business-info/${businessId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!businessId,
  });

  const pushMutation = useMutation({
    mutationFn: async (fields: string[]) => {
      const res = await apiRequest("POST", `/api/gbp/push/${businessId}`, { fields });
      return res.json();
    },
    onSuccess: (_, fields) => {
      queryClient.invalidateQueries({ queryKey: ["/api/gbp"] });
      toast({ title: "Pushed to Google", description: `Updated: ${fields.join(", ")}` });
    },
    onError: (error: Error) => {
      toast({ title: "Push Failed", description: error.message, variant: "destructive" });
    },
  });

  const resolveMutation = useMutation({
    mutationFn: async ({ field, resolution }: { field: string; resolution: string }) => {
      const res = await apiRequest("POST", `/api/gbp/resolve-conflict/${businessId}`, { field, resolution });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gbp"] });
      toast({ title: "Conflict Resolved" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  const conflicts = data?.conflicts || [];
  const info = data?.info;

  const fields = [
    { key: "phone", label: "Phone", icon: Phone, localValue: "From your profile", gbpValue: info?.phone },
    { key: "website", label: "Website", icon: Globe, localValue: "From your profile", gbpValue: info?.websiteUri },
    { key: "description", label: "Description", icon: FileText, localValue: "From your profile", gbpValue: info?.description },
    { key: "address", label: "Address", icon: MapPin, localValue: "From your profile", gbpValue: info?.address?.addressLines?.join(", ") },
    { key: "hours", label: "Business Hours", icon: Clock, localValue: "From your settings", gbpValue: info?.regularHours ? "Set on Google" : "Not set" },
  ];

  return (
    <div className="space-y-4 mt-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Business Information</h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => pushMutation.mutate(["phone", "website", "description", "address", "hours"])}
          disabled={pushMutation.isPending}
        >
          {pushMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ArrowUpRight className="h-4 w-4 mr-2" />}
          Push All to Google
        </Button>
      </div>

      {fields.map(({ key, label, icon: Icon, gbpValue }) => {
        const conflict = conflicts.find(c => c.field === key);
        const status = conflict ? "conflict" : gbpValue ? "synced" : "not_set";

        return (
          <Card key={key} className={`border-border bg-card ${conflict ? "border-amber-300 dark:border-amber-700" : ""}`}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className={`p-2 rounded-full mt-0.5 ${status === "conflict" ? "bg-amber-100 dark:bg-amber-900/30" : status === "synced" ? "bg-green-100 dark:bg-green-900/30" : "bg-gray-100 dark:bg-gray-900/30"}`}>
                    <Icon className={`h-4 w-4 ${status === "conflict" ? "text-amber-600" : status === "synced" ? "text-green-600" : "text-gray-400"}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{label}</p>
                      {status === "synced" && <Badge variant="outline" className="text-green-600 border-green-200 text-xs">In Sync</Badge>}
                      {status === "conflict" && <Badge variant="outline" className="text-amber-600 border-amber-200 text-xs">Conflict</Badge>}
                      {status === "not_set" && <Badge variant="outline" className="text-gray-400 text-xs">Not Set</Badge>}
                    </div>
                    {conflict && (
                      <div className="mt-2 space-y-1 text-sm">
                        <p><span className="text-muted-foreground">Local:</span> {conflict.localValue || "—"}</p>
                        <p><span className="text-muted-foreground">Google:</span> {conflict.gbpValue || "—"}</p>
                      </div>
                    )}
                    {!conflict && gbpValue && (
                      <p className="text-sm text-muted-foreground mt-1 truncate">{String(gbpValue)}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {conflict && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => resolveMutation.mutate({ field: key, resolution: "keep_local" })}
                        disabled={resolveMutation.isPending}
                      >
                        <ArrowUpRight className="h-3 w-3 mr-1" />
                        Keep Ours
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => resolveMutation.mutate({ field: key, resolution: "keep_gbp" })}
                        disabled={resolveMutation.isPending}
                      >
                        <ArrowDownLeft className="h-3 w-3 mr-1" />
                        Use Google's
                      </Button>
                    </>
                  )}
                  {!conflict && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => pushMutation.mutate([key])}
                      disabled={pushMutation.isPending}
                    >
                      <ArrowUpRight className="h-3 w-3 mr-1" />
                      Push
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ─── Tab 3: Reviews ─────────────────────────────────────────────────────────

function ReviewsTab({ businessId }: { businessId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<string>("all");
  const [replyingTo, setReplyingTo] = useState<number | null>(null);
  const [replyText, setReplyText] = useState("");

  const queryParams = new URLSearchParams({ page: String(page), limit: "10" });
  if (filter === "needs_reply") queryParams.set("hasReply", "false");
  if (filter === "flagged") queryParams.set("flagged", "true");

  const { data, isLoading } = useQuery<ReviewsResponse>({
    queryKey: ["/api/gbp/reviews", businessId, page, filter],
    queryFn: async () => {
      const res = await fetch(`/api/gbp/reviews/${businessId}?${queryParams}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!businessId,
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/gbp/reviews/sync/${businessId}`);
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/gbp/reviews"] });
      toast({ title: "Reviews Synced", description: `${data.synced} reviews synced, ${data.flagged} flagged.` });
    },
    onError: (error: Error) => {
      toast({ title: "Sync Failed", description: error.message, variant: "destructive" });
    },
  });

  const replyMutation = useMutation({
    mutationFn: async ({ reviewId, comment }: { reviewId: number; comment: string }) => {
      const res = await apiRequest("POST", `/api/gbp/reviews/${reviewId}/reply`, { comment });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gbp/reviews"] });
      toast({ title: "Reply Posted" });
      setReplyingTo(null);
      setReplyText("");
    },
    onError: (error: Error) => {
      toast({ title: "Reply Failed", description: error.message, variant: "destructive" });
    },
  });

  const suggestMutation = useMutation({
    mutationFn: async (reviewId: number) => {
      const res = await apiRequest("POST", `/api/gbp/reviews/${reviewId}/suggest-reply`);
      return res.json();
    },
    onSuccess: (data) => {
      setReplyText(data.suggestedReply || "");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  const summary = data?.summary || { total: 0, avgRating: 0, responseRate: 0, flaggedCount: 0 };

  return (
    <div className="space-y-4 mt-4">
      {/* Summary bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border-border bg-card"><CardContent className="pt-4 pb-4 text-center">
          <p className="text-2xl font-bold">{summary.total}</p><p className="text-xs text-muted-foreground">Total Reviews</p>
        </CardContent></Card>
        <Card className="border-border bg-card"><CardContent className="pt-4 pb-4 text-center">
          <p className="text-2xl font-bold">{summary.avgRating}/5</p><p className="text-xs text-muted-foreground">Avg Rating</p>
        </CardContent></Card>
        <Card className="border-border bg-card"><CardContent className="pt-4 pb-4 text-center">
          <p className="text-2xl font-bold">{summary.responseRate}%</p><p className="text-xs text-muted-foreground">Response Rate</p>
        </CardContent></Card>
        <Card className="border-border bg-card"><CardContent className="pt-4 pb-4 text-center">
          <p className="text-2xl font-bold">{summary.flaggedCount}</p><p className="text-xs text-muted-foreground">Flagged</p>
        </CardContent></Card>
      </div>

      {/* Filters + Sync */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          {(["all", "needs_reply", "flagged"] as const).map(f => (
            <Button key={f} variant={filter === f ? "default" : "outline"} size="sm" onClick={() => { setFilter(f); setPage(1); }}>
              {f === "all" ? "All" : f === "needs_reply" ? "Needs Reply" : "Flagged"}
            </Button>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
          {syncMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}
          Sync Reviews
        </Button>
      </div>

      {/* Review cards */}
      {!data?.reviews.length ? (
        <div className="flex flex-col items-center justify-center h-48 text-center">
          <Star className="h-12 w-12 text-muted-foreground/40 mb-4" />
          <h3 className="text-lg font-semibold mb-2">No reviews yet</h3>
          <p className="text-sm text-muted-foreground">Click "Sync Reviews" to pull reviews from Google.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.reviews.map(review => (
            <Card key={review.id} className={`border-border bg-card ${review.flagged ? "border-red-200 dark:border-red-800" : ""}`}>
              <CardContent className="pt-4 pb-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium">{review.reviewerName || "Anonymous"}</span>
                      <div className="flex items-center">
                        {Array.from({ length: 5 }, (_, i) => (
                          <Star key={i} className={`h-3.5 w-3.5 ${i < (review.rating || 0) ? "text-yellow-500 fill-yellow-500" : "text-gray-300"}`} />
                        ))}
                      </div>
                      {review.flagged && <Badge variant="destructive" className="text-xs"><Flag className="h-3 w-3 mr-1" /> Flagged</Badge>}
                    </div>
                    <p className="text-sm text-foreground">{review.reviewText || "(no text)"}</p>
                    {review.reviewDate && (
                      <p className="text-xs text-muted-foreground mt-1">{new Date(review.reviewDate).toLocaleDateString()}</p>
                    )}

                    {/* Existing reply */}
                    {review.replyText && review.replyText !== "(reply exists on GBP)" && (
                      <div className="mt-3 p-3 bg-muted/50 rounded-lg">
                        <p className="text-xs font-medium text-muted-foreground mb-1">Your Reply</p>
                        <p className="text-sm">{review.replyText}</p>
                      </div>
                    )}

                    {/* Reply form */}
                    {replyingTo === review.id && (
                      <div className="mt-3 space-y-2">
                        <Textarea
                          value={replyText}
                          onChange={e => setReplyText(e.target.value)}
                          placeholder="Write your reply..."
                          rows={3}
                        />
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            onClick={() => replyMutation.mutate({ reviewId: review.id, comment: replyText })}
                            disabled={!replyText.trim() || replyMutation.isPending}
                          >
                            {replyMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Send className="h-3 w-3 mr-1" />}
                            Post Reply
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => { suggestMutation.mutate(review.id); }}
                            disabled={suggestMutation.isPending}
                          >
                            {suggestMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Sparkles className="h-3 w-3 mr-1" />}
                            AI Suggest
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => { setReplyingTo(null); setReplyText(""); }}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  {replyingTo !== review.id && (
                    <div className="flex flex-col gap-1 shrink-0">
                      <Button variant="ghost" size="sm" onClick={() => { setReplyingTo(review.id); setReplyText(""); }}>
                        <MessageSquare className="h-3.5 w-3.5 mr-1" />
                        Reply
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Pagination */}
      {data && data.pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 pt-2">
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground">Page {page} of {data.pagination.totalPages}</span>
          <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(data.pagination.totalPages, p + 1))} disabled={page >= data.pagination.totalPages}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Tab 4: Posts ───────────────────────────────────────────────────────────

function PostsTab({ businessId }: { businessId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingPost, setEditingPost] = useState<number | null>(null);
  const [editContent, setEditContent] = useState("");

  const { data: posts, isLoading } = useQuery<GbpPost[]>({
    queryKey: ["/api/gbp/posts", businessId],
    queryFn: async () => {
      const res = await fetch(`/api/gbp/posts/${businessId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!businessId,
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/gbp/posts/generate/${businessId}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gbp/posts"] });
      toast({ title: "Post Generated", description: "AI draft created. Edit and publish when ready." });
    },
    onError: (error: Error) => {
      toast({ title: "Generation Failed", description: error.message, variant: "destructive" });
    },
  });

  const publishMutation = useMutation({
    mutationFn: async ({ postId, content }: { postId: number; content: string }) => {
      const res = await apiRequest("POST", `/api/gbp/posts/publish/${businessId}`, { postId, content });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gbp/posts"] });
      toast({ title: "Published", description: "Post published to Google Business Profile." });
      setEditingPost(null);
    },
    onError: (error: Error) => {
      toast({ title: "Publish Failed", description: error.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  const drafts = (posts || []).filter(p => p.status === "draft");
  const published = (posts || []).filter(p => p.status === "published");

  return (
    <div className="space-y-6 mt-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Google Posts</h3>
        <Button onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending}>
          {generateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
          Generate Post
        </Button>
      </div>

      {/* Drafts */}
      {drafts.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-muted-foreground">Drafts</h4>
          {drafts.map(post => (
            <Card key={post.id} className="border-border bg-card border-dashed">
              <CardContent className="pt-4 pb-4">
                {editingPost === post.id ? (
                  <div className="space-y-3">
                    <Textarea
                      value={editContent}
                      onChange={e => setEditContent(e.target.value)}
                      rows={5}
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => publishMutation.mutate({ postId: post.id, content: editContent })}
                        disabled={!editContent.trim() || publishMutation.isPending}
                      >
                        {publishMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Send className="h-3 w-3 mr-1" />}
                        Publish
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setEditingPost(null)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="text-sm whitespace-pre-wrap">{post.content}</p>
                    <div className="flex items-center gap-2 mt-3">
                      <Button size="sm" variant="outline" onClick={() => { setEditingPost(post.id); setEditContent(post.content); }}>
                        Edit & Publish
                      </Button>
                      <p className="text-xs text-muted-foreground">Created {new Date(post.createdAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Published */}
      {published.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-muted-foreground">Published</h4>
          {published.map(post => (
            <Card key={post.id} className="border-border bg-card">
              <CardContent className="pt-4 pb-4">
                <p className="text-sm whitespace-pre-wrap">{post.content}</p>
                <div className="flex items-center gap-2 mt-2">
                  <Badge variant="outline" className="text-green-600 border-green-200 text-xs">
                    <CheckCircle2 className="h-3 w-3 mr-1" /> Published
                  </Badge>
                  {post.publishedAt && (
                    <span className="text-xs text-muted-foreground">{new Date(post.publishedAt).toLocaleDateString()}</span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!posts?.length && (
        <div className="flex flex-col items-center justify-center h-48 text-center">
          <FileText className="h-12 w-12 text-muted-foreground/40 mb-4" />
          <h3 className="text-lg font-semibold mb-2">No posts yet</h3>
          <p className="text-sm text-muted-foreground mb-4">Generate an AI-written post to engage your local audience on Google.</p>
        </div>
      )}
    </div>
  );
}

// ─── Tab 5: SEO Score ───────────────────────────────────────────────────────

function SeoScoreTab({ businessId }: { businessId: number }) {
  const { data, isLoading } = useQuery<SeoScore>({
    queryKey: ["/api/gbp/seo-score", businessId],
    queryFn: async () => {
      const res = await fetch(`/api/gbp/seo-score/${businessId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!businessId,
  });

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  if (!data) return null;

  const scoreColor = data.score >= 80 ? "text-green-600" : data.score >= 50 ? "text-amber-600" : "text-red-600";
  const scoreBg = data.score >= 80 ? "stroke-green-600" : data.score >= 50 ? "stroke-amber-500" : "stroke-red-500";

  // Group breakdown by category
  const categories = ["connection", "profile", "engagement", "reviews", "posts"];
  const categoryLabels: Record<string, string> = {
    connection: "Connection",
    profile: "Business Profile",
    engagement: "Engagement",
    reviews: "Reviews",
    posts: "Posts",
  };

  return (
    <div className="space-y-6 mt-4">
      {/* Score display */}
      <Card className="border-border bg-card">
        <CardContent className="pt-6 pb-6 flex flex-col items-center">
          <div className="relative w-36 h-36 mb-4">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="42" fill="none" stroke="currentColor" strokeWidth="8" className="text-muted/20" />
              <circle
                cx="50" cy="50" r="42" fill="none" strokeWidth="8"
                className={scoreBg}
                strokeDasharray={`${(data.score / 100) * 264} 264`}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className={`text-3xl font-bold ${scoreColor}`}>{data.score}</span>
            </div>
          </div>
          <p className="text-lg font-semibold">Local SEO Score</p>
          <p className="text-sm text-muted-foreground">
            {data.score >= 80 ? "Excellent! Your listing is well-optimized." :
             data.score >= 50 ? "Good, but there's room for improvement." :
             "Your listing needs attention to rank better locally."}
          </p>
        </CardContent>
      </Card>

      {/* Checklist by category */}
      {categories.map(cat => {
        const items = data.breakdown.filter(b => b.category === cat);
        if (items.length === 0) return null;

        return (
          <Card key={cat} className="border-border bg-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{categoryLabels[cat] || cat}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {items.map((item, i) => (
                <div key={i} className="flex items-center justify-between py-1.5">
                  <div className="flex items-center gap-2">
                    {item.met ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-400 shrink-0" />
                    )}
                    <span className="text-sm">{item.label}</span>
                  </div>
                  <span className="text-sm text-muted-foreground font-mono">{item.points}/{item.maxPoints}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
