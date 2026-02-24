import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { PageLayout } from "@/components/layout/PageLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { formatCurrency } from "@/lib/utils";
import {
  Users,
  DollarSign,
  HelpCircle,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  Send,
  Star,
  Megaphone,
  BarChart3,
  UserX,
  Mail,
  MessageSquare,
  Loader2,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MarketingInsights {
  totalCustomers: number;
  revenueThisMonth: number;
  revenueLastMonth: number;
  unansweredQuestions: number;
  segments: {
    new: number;
    active: number;
    atRisk: number;
    lost: number;
  };
  topServices: { name: string; count: number }[];
  busiestDay: { day: string; count: number };
  callIntents: { intent: string; count: number }[];
}

interface InactiveCustomer {
  id: number;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  lastActivityDate: string;
  lifetimeRevenue: number;
  daysSinceVisit: number;
}

interface CampaignTemplate {
  id: number;
  name: string;
  type: string;
  message: string;
}

interface Campaign {
  id: number;
  name: string;
  type: string;
  channel: string;
  sentCount: number;
  createdAt: string;
  status: string;
}

interface Customer {
  id: number;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  createdAt: string;
}

interface ReviewStats {
  totalRequestsSent: number;
  clickThroughRate: number;
  smsSent: number;
  emailSent: number;
  topPlatform: string;
  eligibleCustomers: {
    id: number;
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
    lastJobDate: string;
  }[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateStr: string): string {
  if (!dateStr) return "N/A";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function trendPercent(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
}

// Simple horizontal bar for segments
function SegmentBar({
  segments,
}: {
  segments: { label: string; count: number; color: string }[];
}) {
  const total = segments.reduce((s, seg) => s + seg.count, 0) || 1;
  return (
    <div className="space-y-3">
      <div className="flex h-4 rounded-full overflow-hidden bg-muted">
        {segments.map((seg) => (
          <div
            key={seg.label}
            className="h-full transition-all duration-500"
            style={{
              width: `${Math.max((seg.count / total) * 100, 1)}%`,
              backgroundColor: seg.color,
            }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-4">
        {segments.map((seg) => (
          <div key={seg.label} className="flex items-center gap-2">
            <div
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: seg.color }}
            />
            <span className="text-sm text-muted-foreground">
              {seg.label}:{" "}
              <span className="font-semibold text-foreground">{seg.count}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 1: Smart Insights
// ---------------------------------------------------------------------------

function InsightsTab() {
  const { data: insights, isLoading } = useQuery<MarketingInsights>({
    queryKey: ["/api/marketing/insights"],
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!insights) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <BarChart3 className="h-12 w-12 text-muted-foreground/40 mb-4" />
        <h3 className="text-lg font-semibold mb-2">No insights available yet</h3>
        <p className="text-sm text-muted-foreground max-w-md">
          Marketing insights will populate as you grow your customer base and
          track appointments, calls, and revenue.
        </p>
      </div>
    );
  }

  const trend = trendPercent(insights.revenueThisMonth, insights.revenueLastMonth);
  const trendPositive = trend >= 0;

  const segmentData = [
    { label: "New", count: insights.segments.new, color: "#22c55e" },
    { label: "Active", count: insights.segments.active, color: "#3b82f6" },
    { label: "At-Risk", count: insights.segments.atRisk, color: "#f97316" },
    { label: "Lost", count: insights.segments.lost, color: "#ef4444" },
  ];

  const topServicesMax = Math.max(
    ...insights.topServices.map((s) => s.count),
    1
  );

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-border bg-card">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Customers</p>
                <p className="text-2xl font-bold">{insights.totalCustomers}</p>
              </div>
              <div className="p-3 rounded-full bg-purple-100 dark:bg-purple-900/30">
                <Users className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">
                  Revenue This Month
                </p>
                <p className="text-2xl font-bold">
                  {formatCurrency(insights.revenueThisMonth)}
                </p>
              </div>
              <div className="p-3 rounded-full bg-green-100 dark:bg-green-900/30">
                <DollarSign className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
            </div>
            <div className="flex items-center mt-2 text-xs">
              {trendPositive ? (
                <span className="text-green-600 dark:text-green-400 flex items-center">
                  <TrendingUp className="h-3 w-3 mr-1" />
                  +{trend}% vs last month
                </span>
              ) : (
                <span className="text-red-500 flex items-center">
                  <TrendingDown className="h-3 w-3 mr-1" />
                  {trend}% vs last month
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        <Link href="/receptionist">
          <Card className="border-border bg-card hover:bg-muted/50 transition-colors cursor-pointer h-full">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">
                    Unanswered Questions
                  </p>
                  <p className="text-2xl font-bold">
                    {insights.unansweredQuestions}
                  </p>
                </div>
                <div className="p-3 rounded-full bg-amber-100 dark:bg-amber-900/30">
                  <HelpCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                View in Receptionist
              </p>
            </CardContent>
          </Card>
        </Link>

        <Card className="border-border bg-card">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">
                  At-Risk Customers
                </p>
                <p className="text-2xl font-bold">{insights.segments.atRisk}</p>
              </div>
              <div className="p-3 rounded-full bg-red-100 dark:bg-red-900/30">
                <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Customer Segments */}
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-base">Customer Segments</CardTitle>
        </CardHeader>
        <CardContent>
          <SegmentBar segments={segmentData} />
        </CardContent>
      </Card>

      {/* Top Services + Busiest Day + Call Intents */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Top Services */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base">Top Services</CardTitle>
          </CardHeader>
          <CardContent>
            {insights.topServices.length > 0 ? (
              <div className="space-y-3">
                {insights.topServices.map((svc) => (
                  <div key={svc.name} className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground w-28 truncate">
                      {svc.name}
                    </span>
                    <div className="flex-1 h-5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-500 dark:bg-emerald-400 transition-all duration-500"
                        style={{
                          width: `${Math.max(
                            (svc.count / topServicesMax) * 100,
                            4
                          )}%`,
                        }}
                      />
                    </div>
                    <span className="text-sm font-medium w-8 text-right">
                      {svc.count}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                No service data yet
              </p>
            )}
          </CardContent>
        </Card>

        {/* Busiest Day */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base">Busiest Day</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center py-6">
            {insights.busiestDay?.day ? (
              <>
                <div className="p-4 rounded-full bg-blue-100 dark:bg-blue-900/30 mb-4">
                  <BarChart3 className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                </div>
                <p className="text-lg font-semibold text-foreground">
                  {insights.busiestDay.day}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {insights.busiestDay.count} appointments
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Not enough data yet
              </p>
            )}
          </CardContent>
        </Card>

        {/* Top Call Intents */}
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base">Top Call Intents</CardTitle>
          </CardHeader>
          <CardContent>
            {insights.callIntents.length > 0 ? (
              <div className="space-y-2">
                {insights.callIntents.map((ci) => (
                  <div
                    key={ci.intent}
                    className="flex items-center justify-between p-2 rounded-lg bg-muted/50"
                  >
                    <span className="text-sm text-foreground">{ci.intent}</span>
                    <Badge variant="secondary">{ci.count}</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                No call intent data yet
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 2: Customer Win-Back
// ---------------------------------------------------------------------------

function WinBackTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [days, setDays] = useState("90");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [template, setTemplate] = useState(
    "Hi {firstName}, we haven't seen you in {daysSinceVisit} days! We'd love to welcome you back to {businessName}. Reply STOP to opt out."
  );
  const [channel, setChannel] = useState<"sms" | "email" | "both">("sms");
  const [subject, setSubject] = useState("We miss you!");

  const { data: customers = [], isLoading } = useQuery<InactiveCustomer[]>({
    queryKey: ["/api/marketing/inactive-customers", { days }],
  });

  const winBackMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/marketing/win-back", {
        customerIds: Array.from(selectedIds),
        template,
        channel,
        subject: channel !== "sms" ? subject : undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Campaign sent",
        description: `Sent to ${selectedIds.size} customer${selectedIds.size !== 1 ? "s" : ""}`,
      });
      setSelectedIds(new Set());
      queryClient.invalidateQueries({
        queryKey: ["/api/marketing/inactive-customers"],
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to send",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const allSelected =
    customers.length > 0 && selectedIds.size === customers.length;

  function toggleAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(customers.map((c) => c.id)));
    }
  }

  function toggleOne(id: number) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  }

  return (
    <div className="space-y-6">
      {/* Filter */}
      <div className="flex items-center gap-4">
        <label className="text-sm font-medium text-foreground">
          Inactive for
        </label>
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="60">60 days</SelectItem>
            <SelectItem value="90">90 days</SelectItem>
            <SelectItem value="180">180 days</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">
          {customers.length} customer{customers.length !== 1 ? "s" : ""} found
        </span>
      </div>

      {/* Customer table */}
      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : customers.length === 0 ? (
        <Card className="border-border bg-card">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <UserX className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">
              No inactive customers for this time range.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="p-3 text-left">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={toggleAll}
                    />
                  </th>
                  <th className="p-3 text-left font-medium text-muted-foreground">
                    Name
                  </th>
                  <th className="p-3 text-left font-medium text-muted-foreground">
                    Phone
                  </th>
                  <th className="p-3 text-left font-medium text-muted-foreground">
                    Email
                  </th>
                  <th className="p-3 text-left font-medium text-muted-foreground">
                    Last Activity
                  </th>
                  <th className="p-3 text-right font-medium text-muted-foreground">
                    Revenue
                  </th>
                  <th className="p-3 text-right font-medium text-muted-foreground">
                    Days Away
                  </th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                  >
                    <td className="p-3">
                      <Checkbox
                        checked={selectedIds.has(c.id)}
                        onCheckedChange={() => toggleOne(c.id)}
                      />
                    </td>
                    <td className="p-3 font-medium text-foreground">
                      {c.firstName} {c.lastName}
                    </td>
                    <td className="p-3 text-muted-foreground">{c.phone || "---"}</td>
                    <td className="p-3 text-muted-foreground">{c.email || "---"}</td>
                    <td className="p-3 text-muted-foreground">
                      {formatDate(c.lastActivityDate)}
                    </td>
                    <td className="p-3 text-right font-medium text-foreground">
                      {formatCurrency(c.lifetimeRevenue)}
                    </td>
                    <td className="p-3 text-right">
                      <Badge
                        variant="secondary"
                        className={
                          c.daysSinceVisit > 180
                            ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
                            : c.daysSinceVisit > 90
                            ? "bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400"
                            : "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400"
                        }
                      >
                        {c.daysSinceVisit}d
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Campaign panel */}
      {selectedIds.size > 0 && (
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Send className="h-4 w-4" />
              Send Win-Back Campaign ({selectedIds.size} selected)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Variable chips */}
            <div className="flex flex-wrap gap-2">
              <span className="text-xs text-muted-foreground">
                Variables:
              </span>
              {["{firstName}", "{businessName}", "{daysSinceVisit}"].map(
                (chip) => (
                  <Badge
                    key={chip}
                    variant="outline"
                    className="cursor-pointer hover:bg-muted"
                    onClick={() =>
                      setTemplate((prev) => prev + " " + chip)
                    }
                  >
                    {chip}
                  </Badge>
                )
              )}
            </div>

            <Textarea
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              rows={4}
              placeholder="Enter your win-back message..."
            />

            {/* Channel selector */}
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium text-foreground">
                Channel:
              </span>
              <div className="flex gap-2">
                {(["sms", "email", "both"] as const).map((ch) => (
                  <Button
                    key={ch}
                    size="sm"
                    variant={channel === ch ? "default" : "outline"}
                    onClick={() => setChannel(ch)}
                    className="capitalize"
                  >
                    {ch === "sms" && (
                      <MessageSquare className="h-3.5 w-3.5 mr-1" />
                    )}
                    {ch === "email" && <Mail className="h-3.5 w-3.5 mr-1" />}
                    {ch === "both" && <Send className="h-3.5 w-3.5 mr-1" />}
                    {ch === "both" ? "SMS + Email" : ch.toUpperCase()}
                  </Button>
                ))}
              </div>
            </div>

            {/* Email subject */}
            {(channel === "email" || channel === "both") && (
              <Input
                placeholder="Email subject line..."
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
            )}

            <Button
              onClick={() => winBackMutation.mutate()}
              disabled={winBackMutation.isPending || !template.trim()}
            >
              {winBackMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Send Campaign
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 3: Quick Campaigns
// ---------------------------------------------------------------------------

function CampaignsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [campaignName, setCampaignName] = useState("");
  const [campaignTemplate, setCampaignTemplate] = useState("");
  const [segment, setSegment] = useState("all");
  const [channel, setChannel] = useState<"sms" | "email" | "both">("sms");
  const [subject, setSubject] = useState("");

  const { data: templates = [] } = useQuery<CampaignTemplate[]>({
    queryKey: ["/api/marketing/templates"],
  });

  const { data: campaignHistory = [] } = useQuery<Campaign[]>({
    queryKey: ["/api/marketing/campaigns"],
  });

  const { data: allCustomers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const { data: inactiveCustomers = [] } = useQuery<InactiveCustomer[]>({
    queryKey: ["/api/marketing/inactive-customers", { days: "90" }],
  });

  // Compute filtered customer IDs based on segment
  const filteredCustomerIds = useMemo(() => {
    if (segment === "all") {
      return allCustomers.map((c) => c.id);
    }
    if (segment === "inactive_90") {
      return inactiveCustomers.map((c) => c.id);
    }
    if (segment === "new") {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      return allCustomers
        .filter((c) => new Date(c.createdAt) >= thirtyDaysAgo)
        .map((c) => c.id);
    }
    if (segment === "regular") {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const inactiveIds = new Set(inactiveCustomers.map((c) => c.id));
      return allCustomers
        .filter(
          (c) =>
            new Date(c.createdAt) < thirtyDaysAgo && !inactiveIds.has(c.id)
        )
        .map((c) => c.id);
    }
    return [];
  }, [segment, allCustomers, inactiveCustomers]);

  const sendCampaignMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/marketing/campaigns", {
        name: campaignName,
        type: "campaign",
        template: campaignTemplate,
        channel,
        subject: channel !== "sms" ? subject : undefined,
        customerIds: filteredCustomerIds,
        segment,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Campaign sent",
        description: `Sent to ${filteredCustomerIds.length} customer${filteredCustomerIds.length !== 1 ? "s" : ""}`,
      });
      setCampaignName("");
      setCampaignTemplate("");
      setSubject("");
      queryClient.invalidateQueries({
        queryKey: ["/api/marketing/campaigns"],
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to send campaign",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  function selectTemplate(t: CampaignTemplate) {
    setCampaignName(t.name);
    setCampaignTemplate(t.message);
  }

  return (
    <div className="space-y-6">
      {/* Template Gallery */}
      <div>
        <h3 className="text-base font-semibold text-foreground mb-3">
          Template Gallery
        </h3>
        {templates.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map((t) => (
              <Card
                key={t.id}
                className="border-border bg-card hover:bg-muted/50 cursor-pointer transition-colors"
                onClick={() => selectTemplate(t)}
              >
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground text-sm">
                      {t.name}
                    </span>
                    <Badge variant="secondary" className="text-xs">
                      {t.type}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-3">
                    {t.message}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="border-border bg-card">
            <CardContent className="py-8 text-center">
              <Megaphone className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                No templates available yet. Create your first campaign below.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Campaign Editor */}
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Megaphone className="h-4 w-4" />
            Campaign Editor
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="Campaign name"
            value={campaignName}
            onChange={(e) => setCampaignName(e.target.value)}
          />

          <Textarea
            placeholder="Write your campaign message..."
            value={campaignTemplate}
            onChange={(e) => setCampaignTemplate(e.target.value)}
            rows={4}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Segment selector */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Target Segment
              </label>
              <Select value={segment} onValueChange={setSegment}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Customers</SelectItem>
                  <SelectItem value="new">New (last 30 days)</SelectItem>
                  <SelectItem value="regular">Regular</SelectItem>
                  <SelectItem value="inactive_90">Inactive (90d+)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {filteredCustomerIds.length} customer
                {filteredCustomerIds.length !== 1 ? "s" : ""} will receive this
              </p>
            </div>

            {/* Channel selector */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Channel
              </label>
              <Select
                value={channel}
                onValueChange={(v) =>
                  setChannel(v as "sms" | "email" | "both")
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sms">SMS</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="both">SMS + Email</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Email subject */}
          {(channel === "email" || channel === "both") && (
            <Input
              placeholder="Email subject line..."
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          )}

          <Button
            onClick={() => sendCampaignMutation.mutate()}
            disabled={
              sendCampaignMutation.isPending ||
              !campaignName.trim() ||
              !campaignTemplate.trim() ||
              filteredCustomerIds.length === 0
            }
          >
            {sendCampaignMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Send Campaign
          </Button>
        </CardContent>
      </Card>

      {/* Campaign History */}
      {campaignHistory.length > 0 && (
        <Card className="border-border bg-card overflow-hidden">
          <CardHeader>
            <CardTitle className="text-base">Campaign History</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="p-3 text-left font-medium text-muted-foreground">
                    Name
                  </th>
                  <th className="p-3 text-left font-medium text-muted-foreground">
                    Type
                  </th>
                  <th className="p-3 text-left font-medium text-muted-foreground">
                    Channel
                  </th>
                  <th className="p-3 text-right font-medium text-muted-foreground">
                    Sent
                  </th>
                  <th className="p-3 text-left font-medium text-muted-foreground">
                    Date
                  </th>
                  <th className="p-3 text-left font-medium text-muted-foreground">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {campaignHistory.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                  >
                    <td className="p-3 font-medium text-foreground">
                      {c.name}
                    </td>
                    <td className="p-3">
                      <Badge variant="secondary" className="text-xs">
                        {c.type}
                      </Badge>
                    </td>
                    <td className="p-3 text-muted-foreground capitalize">
                      {c.channel}
                    </td>
                    <td className="p-3 text-right text-foreground">
                      {c.sentCount}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {formatDate(c.createdAt)}
                    </td>
                    <td className="p-3">
                      <Badge
                        variant="secondary"
                        className={
                          c.status === "sent"
                            ? "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400"
                            : c.status === "failed"
                            ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
                            : "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400"
                        }
                      >
                        {c.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 4: Review Booster
// ---------------------------------------------------------------------------

function ReviewBoosterTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const { data: stats, isLoading } = useQuery<ReviewStats>({
    queryKey: ["/api/marketing/review-stats"],
  });

  const sendReviewsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/marketing/review-blast", {
        customerIds: Array.from(selectedIds),
      });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Review requests sent",
        description: `Sent to ${selectedIds.size} customer${selectedIds.size !== 1 ? "s" : ""}`,
      });
      setSelectedIds(new Set());
      queryClient.invalidateQueries({
        queryKey: ["/api/marketing/review-stats"],
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to send",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <Star className="h-12 w-12 text-muted-foreground/40 mb-4" />
        <h3 className="text-lg font-semibold mb-2">No review data yet</h3>
        <p className="text-sm text-muted-foreground max-w-md">
          Start sending review requests to your customers after completed jobs
          to build your online reputation.
        </p>
      </div>
    );
  }

  const eligible = stats.eligibleCustomers || [];
  const allSelected =
    eligible.length > 0 && selectedIds.size === eligible.length;

  function toggleAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(eligible.map((c) => c.id)));
    }
  }

  function toggleOne(id: number) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  }

  const totalMessages = stats.smsSent + stats.emailSent;

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-border bg-card">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Requests Sent</p>
                <p className="text-2xl font-bold">{stats.totalRequestsSent}</p>
              </div>
              <div className="p-3 rounded-full bg-blue-100 dark:bg-blue-900/30">
                <Send className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">
                  Click-Through Rate
                </p>
                <p className="text-2xl font-bold">
                  {stats.clickThroughRate.toFixed(1)}%
                </p>
              </div>
              <div className="p-3 rounded-full bg-green-100 dark:bg-green-900/30">
                <TrendingUp className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">SMS vs Email</p>
                <p className="text-2xl font-bold">
                  {totalMessages > 0
                    ? `${Math.round((stats.smsSent / totalMessages) * 100)}% / ${Math.round((stats.emailSent / totalMessages) * 100)}%`
                    : "0% / 0%"}
                </p>
              </div>
              <div className="p-3 rounded-full bg-purple-100 dark:bg-purple-900/30">
                <MessageSquare className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {stats.smsSent} SMS / {stats.emailSent} Email
            </p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Top Platform</p>
                <p className="text-2xl font-bold capitalize">
                  {stats.topPlatform || "N/A"}
                </p>
              </div>
              <div className="p-3 rounded-full bg-amber-100 dark:bg-amber-900/30">
                <Star className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Eligible Customers Table */}
      <Card className="border-border bg-card overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">
            Eligible Customers for Review Requests
          </CardTitle>
          {selectedIds.size > 0 && (
            <Button
              size="sm"
              onClick={() => sendReviewsMutation.mutate()}
              disabled={sendReviewsMutation.isPending}
            >
              {sendReviewsMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Star className="h-4 w-4 mr-2" />
              )}
              Send Review Requests ({selectedIds.size})
            </Button>
          )}
        </CardHeader>
        {eligible.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="p-3 text-left">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={toggleAll}
                    />
                  </th>
                  <th className="p-3 text-left font-medium text-muted-foreground">
                    Name
                  </th>
                  <th className="p-3 text-left font-medium text-muted-foreground">
                    Phone
                  </th>
                  <th className="p-3 text-left font-medium text-muted-foreground">
                    Email
                  </th>
                  <th className="p-3 text-left font-medium text-muted-foreground">
                    Last Job
                  </th>
                </tr>
              </thead>
              <tbody>
                {eligible.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                  >
                    <td className="p-3">
                      <Checkbox
                        checked={selectedIds.has(c.id)}
                        onCheckedChange={() => toggleOne(c.id)}
                      />
                    </td>
                    <td className="p-3 font-medium text-foreground">
                      {c.firstName} {c.lastName}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {c.phone || "---"}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {c.email || "---"}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {formatDate(c.lastJobDate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <CardContent className="py-8 text-center">
            <Star className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              No eligible customers for review requests right now.
            </p>
          </CardContent>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Marketing Page
// ---------------------------------------------------------------------------

export default function MarketingPage() {
  return (
    <PageLayout title="Marketing">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Marketing Hub</h2>
          <p className="text-muted-foreground mt-1">
            Grow your business with smart insights, automated campaigns, and
            reputation management.
          </p>
        </div>

        <Tabs defaultValue="insights" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="insights" className="flex items-center gap-1.5">
              <BarChart3 className="h-4 w-4" />
              <span className="hidden sm:inline">Insights</span>
            </TabsTrigger>
            <TabsTrigger value="winback" className="flex items-center gap-1.5">
              <UserX className="h-4 w-4" />
              <span className="hidden sm:inline">Win-Back</span>
            </TabsTrigger>
            <TabsTrigger
              value="campaigns"
              className="flex items-center gap-1.5"
            >
              <Megaphone className="h-4 w-4" />
              <span className="hidden sm:inline">Campaigns</span>
            </TabsTrigger>
            <TabsTrigger value="reviews" className="flex items-center gap-1.5">
              <Star className="h-4 w-4" />
              <span className="hidden sm:inline">Reviews</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="insights">
            <InsightsTab />
          </TabsContent>

          <TabsContent value="winback">
            <WinBackTab />
          </TabsContent>

          <TabsContent value="campaigns">
            <CampaignsTab />
          </TabsContent>

          <TabsContent value="reviews">
            <ReviewBoosterTab />
          </TabsContent>
        </Tabs>
      </div>
    </PageLayout>
  );
}
