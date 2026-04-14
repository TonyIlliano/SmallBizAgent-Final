// Shared helper components and utility functions used across admin dashboard tabs

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, UserPlus, PhoneCall, Building, CheckCircle, AlertCircle, XCircle,
} from "lucide-react";
import type { ActivityItem } from "./types";

// ── Shared Helper Components ────────────────────────────────────────────

export function StatsCard({ title, value, icon, loading }: {
  title: string;
  value?: number | string;
  icon: React.ReactNode;
  loading?: boolean;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        {loading ? (
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        ) : (
          <div className="text-2xl font-bold">{value ?? 0}</div>
        )}
      </CardContent>
    </Card>
  );
}

export function MiniStatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <Card>
      <CardContent className="pt-6 flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className={`text-xl font-bold ${color}`}>{value}</span>
      </CardContent>
    </Card>
  );
}

export function ActivityRow({ item }: { item: ActivityItem }) {
  const iconMap = {
    call: <PhoneCall className="h-4 w-4 text-blue-500" />,
    user_signup: <UserPlus className="h-4 w-4 text-emerald-500" />,
    business_created: <Building className="h-4 w-4 text-purple-500" />,
  };

  return (
    <div className="flex items-start gap-3 py-2 border-b last:border-0">
      <div className="mt-0.5">{iconMap[item.type]}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{item.title}</span>
          <span className="text-xs text-muted-foreground">{formatRelative(item.timestamp)}</span>
        </div>
        <p className="text-sm text-muted-foreground truncate">{item.description}</p>
      </div>
    </div>
  );
}

export function SubscriptionBadge({ status }: { status: string | null }) {
  if (!status || status === "inactive") {
    return <Badge variant="secondary">Inactive</Badge>;
  }
  if (status === "active") {
    return <Badge variant="success">Active</Badge>;
  }
  if (status === "trialing") {
    return <Badge variant="outline" className="text-blue-600 border-blue-300">Trialing</Badge>;
  }
  if (status === "past_due") {
    return <Badge variant="warning">Past Due</Badge>;
  }
  if (status === "grace_period") {
    return <Badge variant="outline" className="text-amber-600 border-amber-300">Grace Period</Badge>;
  }
  if (status === "expired") {
    return <Badge variant="destructive">Expired</Badge>;
  }
  if (status === "canceled") {
    return <Badge variant="secondary" className="text-red-600">Canceled</Badge>;
  }
  return <Badge variant="secondary" className="capitalize">{status.replace(/_/g, " ")}</Badge>;
}

export function RoleBadge({ role }: { role: string | null }) {
  if (role === "admin") {
    return <Badge variant="destructive">Admin</Badge>;
  }
  if (role === "staff") {
    return <Badge variant="outline" className="text-blue-600 border-blue-300">Staff</Badge>;
  }
  return <Badge variant="secondary">User</Badge>;
}

export function ServiceStatusIcon({ status }: { status: string }) {
  if (status === "connected") return <CheckCircle className="h-5 w-5 text-emerald-500" />;
  if (status === "not_configured") return <AlertCircle className="h-5 w-5 text-amber-500" />;
  return <XCircle className="h-5 w-5 text-red-500" />;
}

export function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}

export function LoadingSpinner() {
  return (
    <div className="flex justify-center py-12">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

// ── Utility Functions ───────────────────────────────────────────────────

export function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString("en-US", {
      month: "short", day: "numeric", year: "numeric",
    });
  } catch {
    return "\u2014";
  }
}

export function formatRelative(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 30) return `${diffDays}d ago`;
    return formatDate(dateStr);
  } catch {
    return "\u2014";
  }
}

export function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}
