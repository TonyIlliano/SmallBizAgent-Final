import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Star,
  Check,
  X,
  Edit3,
  RefreshCw,
  Loader2,
  AlertTriangle,
  MessageSquare,
} from "lucide-react";

interface ReviewResponse {
  id: number;
  businessId: number;
  reviewSource: string;
  reviewId: string;
  reviewerName: string | null;
  reviewRating: number | null;
  reviewText: string | null;
  aiDraftResponse: string | null;
  finalResponse: string | null;
  status: string | null;
  postedAt: string | null;
  createdAt: string | null;
}

function StarRating({ rating }: { rating: number | null }) {
  if (rating === null) return <span className="text-xs text-muted-foreground">No rating</span>;
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className={`h-3.5 w-3.5 ${
            i < rating
              ? "fill-amber-400 text-amber-400"
              : "text-muted-foreground/30"
          }`}
        />
      ))}
    </div>
  );
}

function StatusBadge({ status }: { status: string | null }) {
  const variants: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    pending: { label: "Pending Approval", variant: "secondary" },
    posted: { label: "Posted", variant: "default" },
    dismissed: { label: "Dismissed", variant: "outline" },
  };
  const info = variants[status ?? "pending"] ?? variants.pending;
  return <Badge variant={info.variant} className="text-xs">{info.label}</Badge>;
}

function ReviewCard({ review, onUpdate }: { review: ReviewResponse; onUpdate: () => void }) {
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [editedResponse, setEditedResponse] = useState(
    review.finalResponse || review.aiDraftResponse || ""
  );

  const approveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/automations/reviews/${review.id}/approve`, {
        finalResponse: editedResponse,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Response posted", description: "Your response has been posted to Google." });
      setIsEditing(false);
      onUpdate();
    },
    onError: (err: Error) => {
      toast({ title: "Failed to post", description: err.message, variant: "destructive" });
    },
  });

  const dismissMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/automations/reviews/${review.id}/dismiss`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Review dismissed" });
      onUpdate();
    },
    onError: (err: Error) => {
      toast({ title: "Failed to dismiss", description: err.message, variant: "destructive" });
    },
  });

  const saveDraftMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", `/api/automations/reviews/${review.id}`, {
        finalResponse: editedResponse,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Draft saved" });
      setIsEditing(false);
      onUpdate();
    },
    onError: (err: Error) => {
      toast({ title: "Failed to save", description: err.message, variant: "destructive" });
    },
  });

  const isPending = review.status === "pending";

  return (
    <Card className="border-border bg-card">
      <CardContent className="pt-5 space-y-3">
        {/* Header: reviewer + rating + status */}
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <h4 className="text-sm font-semibold text-foreground">
              {review.reviewerName || "Anonymous"}
            </h4>
            <StarRating rating={review.reviewRating} />
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={review.status} />
            {review.createdAt && (
              <span className="text-xs text-muted-foreground">
                {new Date(review.createdAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                })}
              </span>
            )}
          </div>
        </div>

        {/* Review text */}
        {review.reviewText && (
          <div className="bg-muted/50 rounded-md p-3">
            <p className="text-sm text-foreground leading-relaxed">
              "{review.reviewText}"
            </p>
          </div>
        )}

        {/* AI Draft / Editable Response */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {review.status === "posted" ? "Posted Response" : "AI Draft Response"}
            </span>
          </div>

          {isEditing ? (
            <div className="space-y-2">
              <Textarea
                value={editedResponse}
                onChange={(e) => setEditedResponse(e.target.value)}
                rows={4}
                className="text-sm"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => saveDraftMutation.mutate()}
                  disabled={saveDraftMutation.isPending}
                >
                  {saveDraftMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Save Draft
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditedResponse(review.finalResponse || review.aiDraftResponse || "");
                    setIsEditing(false);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground bg-muted/30 rounded-md p-3 leading-relaxed">
              {review.finalResponse || review.aiDraftResponse || "No response generated."}
            </p>
          )}
        </div>

        {/* Actions for pending reviews */}
        {isPending && !isEditing && (
          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              onClick={() => approveMutation.mutate()}
              disabled={approveMutation.isPending}
            >
              {approveMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5 mr-1.5" />
              )}
              Approve & Post
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsEditing(true)}
            >
              <Edit3 className="h-3.5 w-3.5 mr-1.5" />
              Edit
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => dismissMutation.mutate()}
              disabled={dismissMutation.isPending}
            >
              {dismissMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <X className="h-3.5 w-3.5 mr-1.5" />
              )}
              Dismiss
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function ReviewQueue() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: reviews = [], isLoading } = useQuery<ReviewResponse[]>({
    queryKey: ["/api/automations/reviews", statusFilter],
    queryFn: async () => {
      const url = statusFilter === "all"
        ? "/api/automations/reviews"
        : `/api/automations/reviews?status=${statusFilter}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch reviews");
      return res.json();
    },
  });

  const fetchMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/automations/reviews/fetch");
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Reviews fetched",
        description: data.message || `Found ${data.count ?? 0} new review(s).`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/automations/reviews"] });
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to fetch reviews",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const invalidateReviews = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/automations/reviews"] });
  };

  const filters = [
    { value: "all", label: "All" },
    { value: "pending", label: "Pending" },
    { value: "posted", label: "Posted" },
    { value: "dismissed", label: "Dismissed" },
  ];

  const pendingCount = reviews.filter(r => r.status === "pending").length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {filters.map((f) => (
            <Button
              key={f.value}
              size="sm"
              variant={statusFilter === f.value ? "default" : "outline"}
              onClick={() => setStatusFilter(f.value)}
              className="text-xs"
            >
              {f.label}
              {f.value === "pending" && pendingCount > 0 && (
                <Badge variant="secondary" className="ml-1.5 text-xs px-1.5 py-0">
                  {pendingCount}
                </Badge>
              )}
            </Button>
          ))}
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => fetchMutation.mutate()}
          disabled={fetchMutation.isPending}
        >
          {fetchMutation.isPending ? (
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          )}
          Fetch New Reviews
        </Button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : reviews.length === 0 ? (
        <Card className="border-border bg-card">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Star className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <h3 className="text-sm font-semibold mb-1">No reviews yet</h3>
            <p className="text-xs text-muted-foreground max-w-sm">
              {statusFilter === "all"
                ? "Click \"Fetch New Reviews\" to pull reviews from your Google Business Profile, or enable the Review Response agent to fetch automatically."
                : `No ${statusFilter} reviews found.`}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {reviews.map((review) => (
            <ReviewCard key={review.id} review={review} onUpdate={invalidateReviews} />
          ))}
        </div>
      )}
    </div>
  );
}
