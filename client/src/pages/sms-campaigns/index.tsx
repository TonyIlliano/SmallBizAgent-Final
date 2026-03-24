/**
 * SMS Campaign Manager
 *
 * Create, manage, and view analytics for SMS campaigns.
 * Supports broadcast (one-time blast) and sequence (multi-step) types.
 * Business owners can filter audiences, preview audience size, launch/pause campaigns,
 * and view per-campaign delivery metrics.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { formatDate } from "@/lib/utils";
import { PageLayout } from "@/components/layout/PageLayout";
import { SkeletonTable } from "@/components/ui/skeleton-loader";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  Loader2,
  Plus,
  MoreHorizontal,
  Eye,
  Pencil,
  Play,
  Pause,
  Trash2,
  Send,
  Users,
  MessageSquare,
  CheckCircle,
  XCircle,
  CalendarIcon,
  Megaphone,
  ArrowRight,
  BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

// ── Types ────────────────────────────────────────────────────────────────

interface SmsCampaign {
  id: number;
  name: string;
  type: "broadcast" | "sequence";
  status: "draft" | "active" | "paused" | "complete";
  audienceCount: number;
  sentCount: number;
  deliveredCount: number;
  repliedCount: number;
  bookingsCount: number;
  optOutCount: number;
  audienceFilter: AudienceFilter;
  messagePrompt: string;
  scheduledAt: string | null;
  launchedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface AudienceFilter {
  allCustomers: boolean;
  inactiveDays?: number;
  tags?: string[];
  minimumVisits?: number;
}

interface CampaignMetrics {
  sent: number;
  delivered: number;
  replied: number;
  bookings: number;
  optOuts: number;
  replyRate: number;
  conversionRate: number;
}

// ── Status Badge ────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case "draft":
      return <Badge variant="secondary">Draft</Badge>;
    case "active":
      return <Badge className="bg-green-500 hover:bg-green-600 text-white">Active</Badge>;
    case "paused":
      return <Badge className="bg-amber-500 hover:bg-amber-600 text-white">Paused</Badge>;
    case "complete":
      return <Badge className="bg-blue-500 hover:bg-blue-600 text-white">Complete</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function TypeBadge({ type }: { type: string }) {
  switch (type) {
    case "broadcast":
      return (
        <Badge variant="outline" className="border-purple-300 text-purple-700">
          <Megaphone className="h-3 w-3 mr-1" />
          Broadcast
        </Badge>
      );
    case "sequence":
      return (
        <Badge variant="outline" className="border-indigo-300 text-indigo-700">
          <ArrowRight className="h-3 w-3 mr-1" />
          Sequence
        </Badge>
      );
    default:
      return <Badge variant="outline">{type}</Badge>;
  }
}

// ── Metric Card ─────────────────────────────────────────────────────────

function MetricCard({
  label,
  value,
  icon: Icon,
  subtitle,
}: {
  label: string;
  value: number | string;
  icon: React.ElementType;
  subtitle?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-muted">
            <Icon className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Create Campaign Dialog ──────────────────────────────────────────────

function CreateCampaignDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [type, setType] = useState<"broadcast" | "sequence">("broadcast");
  const [allCustomers, setAllCustomers] = useState(true);
  const [inactiveDays, setInactiveDays] = useState("");
  const [tags, setTags] = useState("");
  const [minimumVisits, setMinimumVisits] = useState("");
  const [messagePrompt, setMessagePrompt] = useState("");
  const [scheduledDate, setScheduledDate] = useState<Date | undefined>(undefined);
  const [audiencePreview, setAudiencePreview] = useState<number | null>(null);

  const resetForm = () => {
    setName("");
    setType("broadcast");
    setAllCustomers(true);
    setInactiveDays("");
    setTags("");
    setMinimumVisits("");
    setMessagePrompt("");
    setScheduledDate(undefined);
    setAudiencePreview(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const buildAudienceFilter = (): AudienceFilter => {
    const filter: AudienceFilter = { allCustomers };
    if (!allCustomers) {
      if (inactiveDays) filter.inactiveDays = parseInt(inactiveDays, 10);
      if (tags.trim()) filter.tags = tags.split(",").map((t) => t.trim()).filter(Boolean);
      if (minimumVisits) filter.minimumVisits = parseInt(minimumVisits, 10);
    }
    return filter;
  };

  const previewAudienceMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/sms-campaigns/preview-audience", {
        audienceFilter: buildAudienceFilter(),
      });
      return res.json();
    },
    onSuccess: (data: { count: number }) => {
      setAudiencePreview(data.count);
    },
    onError: (err: Error) => {
      toast({ title: "Preview failed", description: err.message, variant: "destructive" });
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/sms-campaigns", {
        name,
        type,
        audienceFilter: buildAudienceFilter(),
        messagePrompt,
        scheduledAt: scheduledDate ? scheduledDate.toISOString() : null,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Campaign created", description: "Your campaign has been saved as a draft." });
      queryClient.invalidateQueries({ queryKey: ["/api/sms-campaigns"] });
      handleClose();
    },
    onError: (err: Error) => {
      toast({ title: "Create failed", description: err.message, variant: "destructive" });
    },
  });

  const isValid = name.trim().length > 0 && messagePrompt.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create SMS Campaign</DialogTitle>
          <DialogDescription>
            Set up a new campaign to reach your customers via SMS.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="campaign-name">Campaign Name</Label>
            <Input
              id="campaign-name"
              placeholder="e.g., Spring Promo, Holiday Reminder"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* Type */}
          <div className="space-y-2">
            <Label>Campaign Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as "broadcast" | "sequence")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="broadcast">
                  Broadcast -- Single message to all
                </SelectItem>
                <SelectItem value="sequence">
                  Sequence -- Multi-step drip
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Audience Filter */}
          <div className="space-y-3">
            <Label>Audience</Label>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="all-customers"
                checked={allCustomers}
                onCheckedChange={(checked) => setAllCustomers(!!checked)}
              />
              <label
                htmlFor="all-customers"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                All customers with SMS opt-in
              </label>
            </div>

            {!allCustomers && (
              <div className="space-y-3 pl-6 border-l-2 border-muted">
                <div className="space-y-1">
                  <Label htmlFor="inactive-days" className="text-xs">
                    Inactive for (days)
                  </Label>
                  <Input
                    id="inactive-days"
                    type="number"
                    min="0"
                    placeholder="e.g., 30"
                    value={inactiveDays}
                    onChange={(e) => setInactiveDays(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="tags" className="text-xs">
                    Customer Tags (comma-separated)
                  </Label>
                  <Input
                    id="tags"
                    placeholder="e.g., VIP, loyal, new"
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="min-visits" className="text-xs">
                    Minimum Visits
                  </Label>
                  <Input
                    id="min-visits"
                    type="number"
                    min="0"
                    placeholder="e.g., 3"
                    value={minimumVisits}
                    onChange={(e) => setMinimumVisits(e.target.value)}
                  />
                </div>
              </div>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={() => previewAudienceMutation.mutate()}
              disabled={previewAudienceMutation.isPending}
            >
              {previewAudienceMutation.isPending ? (
                <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <Users className="h-3 w-3 mr-1" />
              )}
              Preview Audience
            </Button>
            {audiencePreview !== null && (
              <p className="text-sm text-muted-foreground">
                {audiencePreview} customer{audiencePreview !== 1 ? "s" : ""} match this filter
              </p>
            )}
          </div>

          {/* Message Prompt */}
          <div className="space-y-2">
            <Label htmlFor="message-prompt">Message / AI Prompt</Label>
            <Textarea
              id="message-prompt"
              rows={4}
              placeholder="Describe what the SMS should say. The AI will craft a compliant, personalized message for each recipient."
              value={messagePrompt}
              onChange={(e) => setMessagePrompt(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              The AI will generate the actual SMS text based on this prompt and each customer's context.
            </p>
          </div>

          {/* Schedule */}
          <div className="space-y-2">
            <Label>Schedule (optional)</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !scheduledDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {scheduledDate ? format(scheduledDate, "PPP") : "Send immediately (no schedule)"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={scheduledDate}
                  onSelect={setScheduledDate}
                  disabled={(date) => date < new Date()}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            {scheduledDate && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs"
                onClick={() => setScheduledDate(undefined)}
              >
                Clear schedule (send immediately)
              </Button>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!isValid || createMutation.isPending}
          >
            {createMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Plus className="h-4 w-4 mr-2" />
            )}
            Create Campaign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Campaign Detail Dialog ──────────────────────────────────────────────

function CampaignDetailDialog({
  open,
  campaignId,
  onClose,
}: {
  open: boolean;
  campaignId: number | null;
  onClose: () => void;
}) {
  const { data: campaign, isLoading } = useQuery<SmsCampaign & { metrics: CampaignMetrics }>({
    queryKey: ["/api/sms-campaigns", campaignId],
    queryFn: async () => {
      const res = await fetch(`/api/sms-campaigns/${campaignId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch campaign details");
      return res.json();
    },
    enabled: open && campaignId !== null,
  });

  const metrics = campaign?.metrics;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{campaign?.name || "Campaign Details"}</DialogTitle>
          <DialogDescription>
            View campaign performance and delivery metrics.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : campaign ? (
          <div className="space-y-6 py-2">
            {/* Campaign Info */}
            <div className="flex flex-wrap items-center gap-2">
              <TypeBadge type={campaign.type} />
              <StatusBadge status={campaign.status} />
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Created</span>
                <p className="font-medium">{formatDate(campaign.createdAt)}</p>
              </div>
              {campaign.launchedAt && (
                <div>
                  <span className="text-muted-foreground">Launched</span>
                  <p className="font-medium">{formatDate(campaign.launchedAt)}</p>
                </div>
              )}
              {campaign.completedAt && (
                <div>
                  <span className="text-muted-foreground">Completed</span>
                  <p className="font-medium">{formatDate(campaign.completedAt)}</p>
                </div>
              )}
              {campaign.scheduledAt && !campaign.launchedAt && (
                <div>
                  <span className="text-muted-foreground">Scheduled</span>
                  <p className="font-medium">{formatDate(campaign.scheduledAt)}</p>
                </div>
              )}
            </div>

            {campaign.messagePrompt && (
              <div>
                <p className="text-sm text-muted-foreground mb-1">Message Prompt</p>
                <p className="text-sm bg-muted rounded-lg p-3">{campaign.messagePrompt}</p>
              </div>
            )}

            {/* Metrics */}
            {metrics && (
              <>
                <div className="border-t pt-4">
                  <h4 className="text-sm font-semibold mb-3">Delivery Metrics</h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <MetricCard label="Sent" value={metrics.sent} icon={Send} />
                    <MetricCard label="Delivered" value={metrics.delivered} icon={CheckCircle} />
                    <MetricCard label="Replied" value={metrics.replied} icon={MessageSquare} />
                    <MetricCard
                      label="Bookings"
                      value={metrics.bookings}
                      icon={CalendarIcon}
                    />
                    <MetricCard label="Opt-outs" value={metrics.optOuts} icon={XCircle} />
                    <MetricCard
                      label="Reply Rate"
                      value={`${metrics.replyRate.toFixed(1)}%`}
                      icon={BarChart3}
                      subtitle={
                        metrics.sent > 0
                          ? `${metrics.replied} of ${metrics.sent} sent`
                          : undefined
                      }
                    />
                  </div>
                </div>

                {metrics.sent > 0 && (
                  <div className="border-t pt-4">
                    <h4 className="text-sm font-semibold mb-3">Conversion</h4>
                    <div className="flex items-center gap-4">
                      <div className="flex-1 bg-muted rounded-full h-3 overflow-hidden">
                        <div
                          className="h-full bg-green-500 rounded-full transition-all"
                          style={{
                            width: `${Math.min(metrics.conversionRate, 100)}%`,
                          }}
                        />
                      </div>
                      <span className="text-sm font-bold">
                        {metrics.conversionRate.toFixed(1)}%
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {metrics.bookings} booking{metrics.bookings !== 1 ? "s" : ""} from{" "}
                      {metrics.sent} message{metrics.sent !== 1 ? "s" : ""} sent
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-8 text-center">
            Campaign not found.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────

export default function SmsCampaigns() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [createOpen, setCreateOpen] = useState(false);
  const [detailCampaignId, setDetailCampaignId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");

  // ── Fetch campaigns ────────────────────────────────────────────────

  const {
    data: campaigns,
    isLoading,
    error,
  } = useQuery<SmsCampaign[]>({
    queryKey: ["/api/sms-campaigns"],
    queryFn: async () => {
      const res = await fetch("/api/sms-campaigns", { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch campaigns");
      return res.json();
    },
    staleTime: 30000,
    refetchOnWindowFocus: true,
  });

  // ── Mutations ──────────────────────────────────────────────────────

  const launchMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("POST", `/api/sms-campaigns/${id}/launch`);
    },
    onSuccess: () => {
      toast({ title: "Campaign launched", description: "Messages are now being sent." });
      queryClient.invalidateQueries({ queryKey: ["/api/sms-campaigns"] });
    },
    onError: (err: Error) => {
      toast({ title: "Launch failed", description: err.message, variant: "destructive" });
    },
  });

  const pauseMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("POST", `/api/sms-campaigns/${id}/pause`);
    },
    onSuccess: () => {
      toast({ title: "Campaign paused", description: "Sending has been paused." });
      queryClient.invalidateQueries({ queryKey: ["/api/sms-campaigns"] });
    },
    onError: (err: Error) => {
      toast({ title: "Pause failed", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/sms-campaigns/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Campaign deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/sms-campaigns"] });
    },
    onError: (err: Error) => {
      toast({ title: "Delete failed", description: err.message, variant: "destructive" });
    },
  });

  // ── Filter ─────────────────────────────────────────────────────────

  const filteredCampaigns = campaigns?.filter((c) =>
    statusFilter === "all" ? true : c.status === statusFilter
  );

  // ── Render ─────────────────────────────────────────────────────────

  return (
    <PageLayout title="SMS Campaigns">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">SMS Campaigns</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Create and manage targeted SMS campaigns to engage your customers.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Campaign
        </Button>
      </div>

      {/* Status filter */}
      <div className="flex items-center gap-3 mb-4">
        <Label className="text-sm text-muted-foreground">Status:</Label>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="paused">Paused</SelectItem>
            <SelectItem value="complete">Complete</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Campaign Table */}
      {isLoading ? (
        <SkeletonTable rows={5} />
      ) : error ? (
        <Card>
          <CardContent className="py-12 text-center">
            <XCircle className="h-8 w-8 text-destructive mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              Failed to load campaigns. Please try refreshing the page.
            </p>
          </CardContent>
        </Card>
      ) : !filteredCampaigns || filteredCampaigns.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Megaphone className="h-10 w-10 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-1">
              {statusFilter !== "all" ? "No campaigns match this filter" : "No campaigns yet"}
            </h3>
            <p className="text-sm text-muted-foreground mb-4 max-w-sm mx-auto">
              {statusFilter !== "all"
                ? "Try changing the status filter or create a new campaign."
                : "Create your first SMS campaign to reach customers with targeted messages."}
            </p>
            {statusFilter === "all" && (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Campaign
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campaign</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Audience</TableHead>
                  <TableHead className="text-right">Sent</TableHead>
                  <TableHead className="text-right">Created</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCampaigns.map((campaign) => (
                  <TableRow key={campaign.id}>
                    <TableCell className="font-medium">{campaign.name}</TableCell>
                    <TableCell>
                      <TypeBadge type={campaign.type} />
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={campaign.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      {campaign.audienceCount.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {campaign.sentCount.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground text-sm">
                      {formatDate(campaign.createdAt)}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => setDetailCampaignId(campaign.id)}
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            View Details
                          </DropdownMenuItem>

                          {campaign.status === "draft" && (
                            <DropdownMenuItem
                              onClick={() => setDetailCampaignId(campaign.id)}
                            >
                              <Pencil className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                          )}

                          <DropdownMenuSeparator />

                          {(campaign.status === "draft" || campaign.status === "paused") && (
                            <DropdownMenuItem
                              onClick={() => launchMutation.mutate(campaign.id)}
                              disabled={launchMutation.isPending}
                            >
                              <Play className="h-4 w-4 mr-2" />
                              Launch
                            </DropdownMenuItem>
                          )}

                          {campaign.status === "active" && (
                            <DropdownMenuItem
                              onClick={() => pauseMutation.mutate(campaign.id)}
                              disabled={pauseMutation.isPending}
                            >
                              <Pause className="h-4 w-4 mr-2" />
                              Pause
                            </DropdownMenuItem>
                          )}

                          {campaign.status === "draft" && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      `Delete campaign "${campaign.name}"? This cannot be undone.`
                                    )
                                  ) {
                                    deleteMutation.mutate(campaign.id);
                                  }
                                }}
                                disabled={deleteMutation.isPending}
                              >
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Dialogs */}
      <CreateCampaignDialog open={createOpen} onClose={() => setCreateOpen(false)} />
      <CampaignDetailDialog
        open={detailCampaignId !== null}
        campaignId={detailCampaignId}
        onClose={() => setDetailCampaignId(null)}
      />
    </PageLayout>
  );
}
