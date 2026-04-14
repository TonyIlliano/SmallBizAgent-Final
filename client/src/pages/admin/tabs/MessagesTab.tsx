import { useState, Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Mail, MessageSquare, RefreshCw, Bot, AlertCircle, XCircle, CheckCircle,
  ChevronDown, ChevronUp,
} from "lucide-react";
import type { PlatformMessage } from "../types";
import { LoadingSpinner, formatRelative } from "../shared";

function formatPlatformType(type: string): string {
  if (type.startsWith("drip:")) {
    const parts = type.split(":");
    const campaign = parts[1] || "";
    const step = parts[2] || "";
    const labels: Record<string, string> = {
      "onboarding:day1": "Onboarding \u2014 Day 1",
      "onboarding:day3": "Onboarding \u2014 Day 3",
      "onboarding:day7": "Onboarding \u2014 Day 7",
      "trial:expired": "Trial Expired",
      "trial:winback3": "Trial Win-back",
      "winback:day7": "Win-back \u2014 Day 7",
      "winback:day30": "Win-back \u2014 Day 30",
    };
    return labels[`${campaign}:${step}`] || `Drip: ${campaign} ${step}`;
  }
  if (type.startsWith("grace_period_")) {
    const day = type.replace("grace_period_", "");
    return `Grace Period \u2014 Day ${day}`;
  }
  if (type === "trial_expiration_warning") return "Trial Expiration Warning";
  if (type === "trial_deprovisioned") return "Phone Number Released";
  if (type.startsWith("onboarding_coach:")) return "Onboarding Nudge";
  if (type.startsWith("invoice_reminder:")) {
    const match = type.match(/(\d+)d/);
    return match ? `Invoice Reminder \u2014 ${match[1]}d Overdue` : "Invoice Reminder";
  }
  return type
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function getPlatformTypeBadgeVariant(type: string): "default" | "secondary" | "destructive" | "outline" {
  if (type.startsWith("drip:") || type.startsWith("onboarding_coach:")) return "secondary";
  if (type.startsWith("grace_period_") || type === "trial_deprovisioned") return "destructive";
  if (type === "trial_expiration_warning") return "default";
  return "outline";
}

function PlatformMessagesTab() {
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [limit, setLimit] = useState(100);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  const { data: messages = [], isLoading, refetch, isFetching } = useQuery<PlatformMessage[]>({
    queryKey: ["/api/admin/platform-messages", limit],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/admin/platform-messages?limit=${limit}`);
      return res.json();
    },
  });

  let filtered = messages;
  if (channelFilter !== "all") {
    filtered = filtered.filter((l) => l.channel === channelFilter);
  }
  if (typeFilter === "drip") {
    filtered = filtered.filter((l) => l.type.startsWith("drip:"));
  } else if (typeFilter === "trial") {
    filtered = filtered.filter((l) => l.type.includes("trial") || l.type.startsWith("grace_period_"));
  } else if (typeFilter === "onboarding") {
    filtered = filtered.filter((l) => l.type.startsWith("onboarding_coach:"));
  } else if (typeFilter === "invoices") {
    filtered = filtered.filter((l) => l.type.startsWith("invoice_reminder:"));
  }

  const emailCount = messages.filter((l) => l.channel === "email").length;
  const smsCount = messages.filter((l) => l.channel === "sms").length;
  const failedCount = messages.filter((l) => l.status === "failed").length;
  const dripCount = messages.filter((l) => l.type.startsWith("drip:")).length;
  const trialCount = messages.filter((l) => l.type.includes("trial") || l.type.startsWith("grace_period_")).length;

  const toggleRow = (id: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Platform Messages
              </CardTitle>
              <CardDescription>
                Emails and SMS sent to business owners &mdash; drip campaigns, trial warnings, onboarding nudges, and grace period notifications
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>

          <div className="flex gap-3 pt-2 flex-wrap">
            <Badge variant="secondary" className="gap-1">
              <Mail className="h-3 w-3" />
              {emailCount} emails
            </Badge>
            {smsCount > 0 && (
              <Badge variant="secondary" className="gap-1">
                <MessageSquare className="h-3 w-3" />
                {smsCount} SMS
              </Badge>
            )}
            {dripCount > 0 && (
              <Badge variant="secondary" className="gap-1">
                <Bot className="h-3 w-3" />
                {dripCount} drip
              </Badge>
            )}
            {trialCount > 0 && (
              <Badge variant="outline" className="gap-1">
                <AlertCircle className="h-3 w-3" />
                {trialCount} trial
              </Badge>
            )}
            {failedCount > 0 && (
              <Badge variant="destructive" className="gap-1">
                <XCircle className="h-3 w-3" />
                {failedCount} failed
              </Badge>
            )}
          </div>
        </CardHeader>

        <CardContent>
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <Select value={channelFilter} onValueChange={setChannelFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Channel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All channels</SelectItem>
                <SelectItem value="email">Email only</SelectItem>
                <SelectItem value="sms">SMS only</SelectItem>
                <SelectItem value="system">System only</SelectItem>
              </SelectContent>
            </Select>

            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="drip">Drip Campaigns</SelectItem>
                <SelectItem value="trial">Trial & Grace</SelectItem>
                <SelectItem value="onboarding">Onboarding</SelectItem>
                <SelectItem value="invoices">Invoice Reminders</SelectItem>
              </SelectContent>
            </Select>

            <Select value={String(limit)} onValueChange={(v) => setLimit(parseInt(v))}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="Show" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="50">Last 50</SelectItem>
                <SelectItem value="100">Last 100</SelectItem>
                <SelectItem value="200">Last 200</SelectItem>
                <SelectItem value="500">Last 500</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <LoadingSpinner />
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No platform messages sent yet. Drip campaigns, trial warnings, and onboarding emails will appear here.
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40px]"></TableHead>
                    <TableHead>Business</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Subject / Message</TableHead>
                    <TableHead className="w-[70px]">Status</TableHead>
                    <TableHead className="w-[130px]">Sent</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((log) => {
                    const isExpanded = expandedRows.has(log.id);
                    const hasContent = !!(log.message || log.subject);
                    const previewText = log.subject || (log.message ? log.message.slice(0, 100) + (log.message.length > 100 ? "..." : "") : "\u2014");

                    return (
                      <Fragment key={log.id}>
                        <TableRow
                          className={hasContent ? "cursor-pointer hover:bg-muted/50" : ""}
                          onClick={() => hasContent && toggleRow(log.id)}
                        >
                          <TableCell>
                            {log.channel === "email" ? (
                              <Mail className="h-4 w-4 text-blue-500" />
                            ) : log.channel === "sms" ? (
                              <MessageSquare className="h-4 w-4 text-green-500" />
                            ) : (
                              <Bot className="h-4 w-4 text-purple-500" />
                            )}
                          </TableCell>
                          <TableCell className="text-sm">
                            <div className="flex flex-col">
                              <span className="font-medium text-foreground">{log.businessName}</span>
                              <span className="text-xs text-muted-foreground">{log.recipient}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">
                            <Badge variant={getPlatformTypeBadgeVariant(log.type)} className="text-xs">
                              {formatPlatformType(log.type)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm max-w-[350px]">
                            <div className="flex items-center gap-1">
                              <span className={isExpanded ? "" : "truncate"}>
                                {isExpanded ? "" : previewText}
                              </span>
                              {hasContent && (
                                isExpanded ? (
                                  <ChevronUp className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                                ) : (
                                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                                )
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            {log.status === "sent" || log.status === "delivered" ? (
                              <CheckCircle className="h-4 w-4 text-green-500" />
                            ) : (
                              <XCircle className="h-4 w-4 text-destructive" />
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {log.sentAt ? formatRelative(log.sentAt) : "\u2014"}
                          </TableCell>
                        </TableRow>
                        {isExpanded && hasContent && (
                          <TableRow key={`${log.id}-expanded`}>
                            <TableCell colSpan={6} className="bg-muted/30 px-6 py-3">
                              {log.subject && (
                                <div className="text-xs font-medium text-muted-foreground mb-1">Subject: {log.subject}</div>
                              )}
                              <div className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                                {log.message || "No message body recorded."}
                              </div>
                              {log.error && (
                                <div className="mt-2 text-xs text-destructive bg-destructive/5 border border-destructive/20 rounded p-2">
                                  Error: {log.error}
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {filtered.some((l) => l.status === "failed" && l.error) && (
            <div className="mt-4 space-y-2">
              <p className="text-sm font-medium text-destructive">Failed message details:</p>
              {filtered
                .filter((l) => l.status === "failed" && l.error)
                .slice(0, 5)
                .map((l) => (
                  <div key={l.id} className="text-xs bg-destructive/5 border border-destructive/20 rounded p-2">
                    <span className="font-medium">{formatPlatformType(l.type)}</span> to {l.businessName} ({l.recipient}):{" "}
                    <span className="text-destructive">{l.error}</span>
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default PlatformMessagesTab;
