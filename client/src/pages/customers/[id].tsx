import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { PageLayout } from "@/components/layout/PageLayout";
import PageTitle from "@/components/PageTitle";
import { CustomerForm } from "@/components/customers/CustomerForm";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SkeletonForm, SkeletonStats } from "@/components/ui/skeleton-loader";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { formatCurrency, formatPhoneNumber } from "@/lib/utils";
import {
  Briefcase,
  FileText,
  Calendar,
  ClipboardList,
  DollarSign,
  Clock,
  Users,
  Mail,
  Phone,
  PhoneIncoming,
  MessageSquare,
  MapPin,
  Edit,
  StickyNote,
  Tag,
  X,
  Plus,
  Heart,
  TrendingUp,
  TrendingDown,
  Minus,
  AlertTriangle,
  Star,
  ShieldCheck,
  Cake,
  CheckCircle2,
  XCircle,
  Bot,
  Send,
  Receipt,
} from "lucide-react";

function formatDate(dateStr: string) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(dateStr: string) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return "";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}

const typeIcons: Record<string, any> = {
  job: Briefcase,
  invoice: FileText,
  appointment: Calendar,
  quote: ClipboardList,
  call: PhoneIncoming,
  sms: MessageSquare,
};

const typeColors: Record<string, string> = {
  job: "text-amber-500 bg-amber-50 dark:bg-amber-900/20",
  invoice: "text-green-500 bg-green-50 dark:bg-green-900/20",
  appointment: "text-purple-500 bg-purple-50 dark:bg-purple-900/20",
  quote: "text-orange-500 bg-orange-50 dark:bg-orange-900/20",
  call: "text-blue-500 bg-blue-50 dark:bg-blue-900/20",
  sms: "text-teal-500 bg-teal-50 dark:bg-teal-900/20",
};

const typePaths: Record<string, string> = {
  job: "/jobs",
  invoice: "/invoices",
  appointment: "/appointments",
  quote: "/quotes",
};

const statusBadgeColors: Record<string, string> = {
  completed: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  confirmed: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  scheduled: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  pending: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  paid: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  overdue: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  cancelled: "bg-gray-100 text-gray-600 dark:bg-gray-800/30 dark:text-gray-400",
  no_show: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  answered: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  missed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  sent: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
};

function StatusBadge({ status }: { status: string | null }) {
  if (!status) return null;
  const label = status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const color = statusBadgeColors[status] || "bg-gray-100 text-gray-600";
  return <Badge className={`text-[10px] ${color}`}>{label}</Badge>;
}

function CustomerTags({ customerId, tags }: { customerId: number; tags: string[] }) {
  const [newTag, setNewTag] = useState("");
  const [showInput, setShowInput] = useState(false);
  const queryClient = useQueryClient();

  const addTagMutation = useMutation({
    mutationFn: async (tag: string) => {
      const res = await apiRequest("POST", `/api/customers/${customerId}/tags`, { tags: [tag] });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/customers/${customerId}`] });
      setNewTag("");
      setShowInput(false);
    },
  });

  const removeTagMutation = useMutation({
    mutationFn: async (tag: string) => {
      const res = await apiRequest("DELETE", `/api/customers/${customerId}/tags/${encodeURIComponent(tag)}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/customers/${customerId}`] });
    },
  });

  const handleAddTag = () => {
    const trimmed = newTag.trim();
    if (trimmed && !tags.includes(trimmed)) {
      addTagMutation.mutate(trimmed);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((tag) => (
        <Badge
          key={tag}
          variant="secondary"
          className="text-xs flex items-center gap-1 pr-1"
        >
          <Tag className="h-3 w-3" />
          {tag}
          <button
            onClick={() => removeTagMutation.mutate(tag)}
            className="ml-0.5 hover:text-destructive rounded-full"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      {showInput ? (
        <div className="flex items-center gap-1">
          <Input
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAddTag()}
            placeholder="Tag name"
            className="h-6 w-24 text-xs"
            autoFocus
          />
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={handleAddTag}>
            <Plus className="h-3 w-3" />
          </Button>
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => { setShowInput(false); setNewTag(""); }}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          className="h-6 text-xs text-muted-foreground"
          onClick={() => setShowInput(true)}
        >
          <Plus className="h-3 w-3 mr-1" />
          Add Tag
        </Button>
      )}
    </div>
  );
}

// ── Insights Components ──

function SentimentIcon({ trend }: { trend?: string | null }) {
  if (trend === "improving") return <TrendingUp className="h-3.5 w-3.5 text-green-500" />;
  if (trend === "declining") return <TrendingDown className="h-3.5 w-3.5 text-red-500" />;
  return <Minus className="h-3.5 w-3.5 text-gray-400" />;
}

function RiskBadge({ level }: { level?: string | null }) {
  if (!level || level === "low") return <Badge className="bg-green-100 text-green-800 text-[10px]">Low Risk</Badge>;
  if (level === "medium") return <Badge className="bg-yellow-100 text-yellow-800 text-[10px]">Medium Risk</Badge>;
  return <Badge className="bg-red-100 text-red-800 text-[10px]">High Risk</Badge>;
}

function ReliabilityBar({ score }: { score?: number | null }) {
  const pct = Math.round((score ?? 0) * 100);
  const color = pct >= 80 ? "bg-green-500" : pct >= 50 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-medium w-8 text-right">{pct}%</span>
    </div>
  );
}

function InsightsCard({ insights }: { insights: any }) {
  if (!insights || insights.message === "No insights calculated yet") {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Bot className="h-4 w-4" />
            AI Insights
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Insights will appear after more interactions are logged.</p>
        </CardContent>
      </Card>
    );
  }

  const data = insights.insights || insights;
  const preferredServices: string[] = Array.isArray(data.preferredServices) ? data.preferredServices : [];
  const autoTags: string[] = Array.isArray(data.autoTags) ? data.autoTags : [];
  const riskFactors: string[] = Array.isArray(data.riskFactors) ? data.riskFactors : [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Bot className="h-4 w-4" />
          AI Insights
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Risk & Reliability Row */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              Churn Risk
            </div>
            <RiskBadge level={data.riskLevel} />
            {data.churnProbability != null && (
              <div className="text-[10px] text-muted-foreground mt-0.5">
                {Math.round(data.churnProbability * 100)}% probability
              </div>
            )}
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              <ShieldCheck className="h-3 w-3" />
              Reliability
            </div>
            <ReliabilityBar score={data.reliabilityScore} />
          </div>
        </div>

        {/* Sentiment */}
        {data.averageSentiment != null && (
          <div>
            <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              <Heart className="h-3 w-3" />
              Sentiment
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star
                    key={n}
                    className={`h-3.5 w-3.5 ${n <= Math.round(data.averageSentiment) ? "text-yellow-400 fill-yellow-400" : "text-gray-200"}`}
                  />
                ))}
              </div>
              <SentimentIcon trend={data.sentimentTrend} />
              <span className="text-xs text-muted-foreground capitalize">{data.sentimentTrend || "stable"}</span>
            </div>
          </div>
        )}

        {/* Lifetime Value */}
        {data.lifetimeValue != null && data.lifetimeValue > 0 && (
          <div>
            <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              <DollarSign className="h-3 w-3" />
              Lifetime Value
            </div>
            <div className="text-lg font-semibold">{formatCurrency(data.lifetimeValue)}</div>
            <div className="text-[10px] text-muted-foreground">
              {data.totalVisits || 0} visits &middot; {data.totalCalls || 0} calls
            </div>
          </div>
        )}

        {/* Preferences */}
        {(preferredServices.length > 0 || data.preferredStaff || data.preferredDayOfWeek || data.preferredTimeOfDay) && (
          <div>
            <div className="text-xs text-muted-foreground mb-1">Preferences</div>
            <div className="space-y-1">
              {preferredServices.length > 0 && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Services: </span>
                  {preferredServices.join(", ")}
                </div>
              )}
              {data.preferredStaff && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Staff: </span>
                  {data.preferredStaff}
                </div>
              )}
              {(data.preferredDayOfWeek || data.preferredTimeOfDay) && (
                <div className="text-sm">
                  <span className="text-muted-foreground">Prefers: </span>
                  {[data.preferredDayOfWeek, data.preferredTimeOfDay].filter(Boolean).join(", ")}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Visit Frequency */}
        {data.averageVisitFrequencyDays != null && data.averageVisitFrequencyDays > 0 && (
          <div>
            <div className="text-xs text-muted-foreground mb-1">Visit Frequency</div>
            <div className="text-sm">
              Every ~{Math.round(data.averageVisitFrequencyDays)} days
              {data.daysSinceLastVisit != null && (
                <span className="text-muted-foreground"> &middot; Last visit {data.daysSinceLastVisit} days ago</span>
              )}
            </div>
          </div>
        )}

        {/* Risk Factors */}
        {riskFactors.length > 0 && (
          <div>
            <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              Risk Factors
            </div>
            <ul className="text-xs space-y-0.5">
              {riskFactors.map((f, i) => (
                <li key={i} className="text-red-600 dark:text-red-400">&bull; {f}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Auto Tags */}
        {autoTags.length > 0 && (
          <div>
            <div className="text-xs text-muted-foreground mb-1">AI Tags</div>
            <div className="flex flex-wrap gap-1">
              {autoTags.map((t, i) => (
                <Badge key={i} variant="outline" className="text-[10px]">{t}</Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Timeline Entry ──

function TimelineEntry({ entry, navigate }: { entry: any; navigate: (path: string) => void }) {
  const Icon = typeIcons[entry.type] || Briefcase;
  const colorClass = typeColors[entry.type] || "";
  const basePath = typePaths[entry.type] || "";
  const isClickable = !!basePath;

  // Build a human-readable title
  let title = entry.title;
  let subtitle: string | null = null;

  if (entry.type === "call") {
    const intent = entry.intentDetected || entry.intent;
    if (intent && intent !== "ai-call") {
      title = `Phone Call — ${intent.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())}`;
    } else {
      title = "Phone Call";
    }
    if (entry.summary) {
      subtitle = entry.summary;
    }
    if (entry.callDuration) {
      const dur = formatDuration(entry.callDuration);
      subtitle = subtitle ? `${dur} — ${subtitle}` : dur;
    }
  }

  if (entry.type === "sms") {
    const preview = entry.transcript || entry.preview || "";
    title = "SMS Message";
    if (preview) {
      subtitle = preview.length > 100 ? preview.substring(0, 100) + "..." : preview;
    }
  }

  if (entry.type === "appointment") {
    // Make appointment titles more readable
    const serviceName = entry.serviceName || entry.service;
    const staffName = entry.staffName || entry.staff;
    if (serviceName) {
      title = serviceName;
      if (staffName) title += ` with ${staffName}`;
    } else if (!title || title === "Appointment") {
      title = "Appointment";
    }
    // Show time
    if (entry.date) {
      subtitle = formatTime(entry.date);
    }
  }

  return (
    <div
      className={`flex items-start gap-3 p-3 rounded-lg transition-colors ${isClickable ? "hover:bg-muted/50 cursor-pointer" : ""}`}
      onClick={() => isClickable && navigate(`${basePath}/${entry.id}`)}
    >
      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${colorClass}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium truncate">{title}</span>
          <StatusBadge status={entry.status} />
        </div>
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{subtitle}</p>
        )}
        <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
          <span>{formatDate(entry.date)}</span>
          {entry.amount != null && entry.amount > 0 && (
            <>
              <span>&middot;</span>
              <span>{formatCurrency(entry.amount)}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CustomerDetail() {
  const params = useParams();
  const [, navigate] = useLocation();
  const customerId = params.id;
  const isNew = customerId === "new";
  const [editOpen, setEditOpen] = useState(false);
  const [smsOpen, setSmsOpen] = useState(false);
  const [smsMessage, setSmsMessage] = useState("");
  const { toast } = useToast();

  const sendSmsMutation = useMutation({
    mutationFn: async (message: string) => {
      const res = await apiRequest("POST", `/api/customers/${customerId}/send-sms`, { message });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "SMS sent", description: "Message delivered successfully." });
      setSmsOpen(false);
      setSmsMessage("");
    },
    onError: () => {
      toast({ title: "Failed to send", description: "Could not send SMS. Please try again.", variant: "destructive" });
    },
  });

  // Fetch customer data
  const { data: customer, isLoading, error } = useQuery<any>({
    queryKey: [`/api/customers/${customerId}`],
    enabled: !isNew && !!customerId,
  });

  // Fetch activity data
  const { data: activity, isLoading: activityLoading } = useQuery<any>({
    queryKey: [`/api/customers/${customerId}/activity`],
    enabled: !isNew && !!customerId,
  });

  // Fetch AI insights
  const { data: insights } = useQuery<any>({
    queryKey: [`/api/customers/${customerId}/insights`],
    enabled: !isNew && !!customerId,
  });

  // New customer — just show the form
  if (isNew) {
    return (
      <PageLayout title="New Customer">
        <PageTitle
          title="Add New Customer"
          breadcrumbs={[
            { label: "Dashboard", href: "/" },
            { label: "Customers", href: "/customers" },
            { label: "New Customer", href: "#" },
          ]}
        />
        <div className="mt-6">
          <CustomerForm customer={undefined} isEdit={false} />
        </div>
      </PageLayout>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <PageLayout title="Customer Details">
        <PageTitle
          title="Loading Customer..."
          breadcrumbs={[
            { label: "Dashboard", href: "/" },
            { label: "Customers", href: "/customers" },
            { label: "Loading...", href: "#" },
          ]}
        />
        <div className="mt-6 space-y-6">
          <SkeletonStats />
          <SkeletonForm />
        </div>
      </PageLayout>
    );
  }

  // Error state
  if (error) {
    return (
      <PageLayout title="Customer Details">
        <PageTitle
          title="Customer Not Found"
          breadcrumbs={[
            { label: "Dashboard", href: "/" },
            { label: "Customers", href: "/customers" },
            { label: "Not Found", href: "#" },
          ]}
        />
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-4 text-red-800 dark:text-red-300 mt-4">
          We couldn't find the customer you're looking for.
        </div>
        <div className="mt-4">
          <Button onClick={() => navigate("/customers")}>
            Return to Customers
          </Button>
        </div>
      </PageLayout>
    );
  }

  const stats = activity?.stats || {};

  return (
    <PageLayout title="Customer Details">
      <PageTitle
        title={`${customer?.firstName} ${customer?.lastName}`}
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "Customers", href: "/customers" },
          {
            label: `${customer?.firstName} ${customer?.lastName}`,
            href: "#",
          },
        ]}
        actions={
          <Button size="sm" onClick={() => setEditOpen(true)}>
            <Edit className="h-4 w-4 mr-1" />
            Edit
          </Button>
        }
      />

      {/* Quick Action Buttons */}
      <div className="flex flex-wrap gap-2 mt-4">
        {customer?.phone && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setSmsOpen(true)}
          >
            <Send className="h-3.5 w-3.5 mr-1.5" />
            Send SMS
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={() => navigate("/appointments")}
        >
          <Calendar className="h-3.5 w-3.5 mr-1.5" />
          Book Appointment
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => navigate("/invoices/create")}
        >
          <Receipt className="h-3.5 w-3.5 mr-1.5" />
          Create Invoice
        </Button>
        {customer?.email && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => window.open(`mailto:${customer.email}`, "_self")}
          >
            <Mail className="h-3.5 w-3.5 mr-1.5" />
            Send Email
          </Button>
        )}
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Briefcase className="h-3.5 w-3.5" />
              Total Jobs
            </div>
            <p className="text-2xl font-bold">{stats.totalJobs || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <DollarSign className="h-3.5 w-3.5" />
              Total Spent
            </div>
            <p className="text-2xl font-bold">
              {formatCurrency(stats.totalSpent || 0)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Clock className="h-3.5 w-3.5" />
              Last Visit
            </div>
            <p className="text-lg font-bold truncate">
              {stats.lastVisit ? formatDate(stats.lastVisit) : "\u2014"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <FileText className="h-3.5 w-3.5" />
              Open Invoices
            </div>
            <p className="text-2xl font-bold">{stats.activeInvoices || 0}</p>
          </CardContent>
        </Card>
      </div>

      {/* Three-column layout on desktop */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
        {/* Left: Customer Info + Insights */}
        <div className="md:col-span-1 space-y-4">
          {/* Contact Information */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Contact Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {customer?.phone && (
                <div className="flex items-center gap-3">
                  <Phone className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm">
                    {formatPhoneNumber(customer.phone)}
                  </span>
                </div>
              )}
              {customer?.email && (
                <div className="flex items-center gap-3">
                  <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm truncate">{customer.email}</span>
                </div>
              )}
              {(customer?.address || customer?.city) && (
                <div className="flex items-start gap-3">
                  <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <div className="text-sm">
                    {customer.address && <div>{customer.address}</div>}
                    {customer.city && (
                      <div className="text-muted-foreground">
                        {customer.city}
                        {customer.state && `, ${customer.state}`}{" "}
                        {customer.zipcode || customer.zip}
                      </div>
                    )}
                  </div>
                </div>
              )}
              {customer?.birthday && (
                <div className="flex items-center gap-3">
                  <Cake className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm">{customer.birthday}</span>
                </div>
              )}
              {customer?.notes && (
                <div className="flex items-start gap-3 pt-2 border-t">
                  <StickyNote className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-muted-foreground whitespace-pre-line">
                    {customer.notes}
                  </p>
                </div>
              )}

              {/* SMS & Marketing Opt-In Status */}
              <div className="pt-2 border-t space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">SMS Opt-In</span>
                  {customer?.smsOptIn ? (
                    <span className="flex items-center gap-1 text-xs text-green-600"><CheckCircle2 className="h-3 w-3" /> Yes</span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground"><XCircle className="h-3 w-3" /> No</span>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Marketing Opt-In</span>
                  {customer?.marketingOptIn ? (
                    <span className="flex items-center gap-1 text-xs text-green-600"><CheckCircle2 className="h-3 w-3" /> Yes</span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground"><XCircle className="h-3 w-3" /> No</span>
                  )}
                </div>
              </div>

              {/* Source */}
              {customer?.source && (
                <div className="pt-2 border-t">
                  <div className="text-xs text-muted-foreground mb-1">Created via</div>
                  <span className="text-sm capitalize">{customer.source.replace(/_/g, " ")}</span>
                </div>
              )}

              {/* Customer Tags */}
              <div className="pt-3 border-t">
                <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
                  <Tag className="h-3.5 w-3.5" />
                  Tags
                </div>
                <CustomerTags
                  customerId={parseInt(customerId!)}
                  tags={(() => {
                    try { return customer?.tags ? JSON.parse(customer.tags) : []; } catch { return []; }
                  })()}
                />
              </div>
            </CardContent>
          </Card>

          {/* AI Insights */}
          <InsightsCard insights={insights} />
        </div>

        {/* Right: Activity Timeline */}
        <div className="md:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Activity Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              {activityLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div
                      key={i}
                      className="animate-pulse flex items-center gap-3 p-3"
                    >
                      <div className="w-8 h-8 rounded-full bg-muted" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 bg-muted rounded w-1/3" />
                        <div className="h-3 bg-muted rounded w-1/4" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : activity?.timeline?.length > 0 ? (
                <div className="space-y-1">
                  {activity.timeline.map((entry: any, i: number) => (
                    <TimelineEntry
                      key={`${entry.type}-${entry.id}-${i}`}
                      entry={entry}
                      navigate={navigate}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No activity yet</p>
                  <p className="text-xs mt-1">
                    Jobs, invoices, appointments, calls, and messages will appear here
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Edit Customer Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Customer</DialogTitle>
          </DialogHeader>
          <CustomerForm
            customer={customer}
            isEdit={true}
            onSuccess={() => setEditOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Send SMS Dialog */}
      <Dialog open={smsOpen} onOpenChange={(open) => { setSmsOpen(open); if (!open) setSmsMessage(""); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Send SMS to {customer?.firstName}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              To: {customer?.phone ? formatPhoneNumber(customer.phone) : ""}
            </div>
            <Textarea
              placeholder="Type your message..."
              value={smsMessage}
              onChange={(e) => setSmsMessage(e.target.value)}
              rows={4}
              maxLength={1600}
            />
            <div className="text-xs text-muted-foreground text-right">
              {smsMessage.length}/1600
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setSmsOpen(false); setSmsMessage(""); }}>
              Cancel
            </Button>
            <Button
              onClick={() => sendSmsMutation.mutate(smsMessage)}
              disabled={!smsMessage.trim() || sendSmsMutation.isPending}
            >
              {sendSmsMutation.isPending ? "Sending..." : "Send SMS"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
}
