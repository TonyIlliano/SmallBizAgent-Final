import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Mail, MessageSquare, AlertCircle, CheckCircle2, XCircle, RefreshCw, ChevronDown, ChevronUp, Bot, User } from "lucide-react";

interface NotificationLog {
  id: number;
  businessId: number;
  customerId?: number | null;
  customerName?: string | null;
  customerPhone?: string | null;
  type: string;
  channel: string;
  recipient: string;
  subject?: string | null;
  message?: string | null;
  status: string;
  referenceType?: string | null;
  referenceId?: number | null;
  error?: string | null;
  sentAt: string;
}

/** Format phone as (XXX) XXX-XXXX */
function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 11 && digits[0] === "1") {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

/** Turn drip keys like "drip:onboarding:day1:42" into readable labels */
function formatType(type: string): string {
  if (type.startsWith("drip:")) {
    const parts = type.split(":");
    const campaign = parts[1] || "";
    const step = parts[2] || "";
    const labels: Record<string, string> = {
      "onboarding:day1": "Onboarding — Day 1",
      "onboarding:day3": "Onboarding — Day 3",
      "onboarding:day7": "Onboarding — Day 7",
      "trial:expired": "Trial Expired",
      "trial:winback3": "Trial Win-back",
      "winback:day7": "Win-back — Day 7",
      "winback:day30": "Win-back — Day 30",
    };
    return labels[`${campaign}:${step}`] || `Drip: ${campaign} ${step}`;
  }
  // Agent types get a special prefix
  if (type.startsWith("agent_")) {
    const agentLabels: Record<string, string> = {
      agent_follow_up: "Follow-Up",
      agent_no_show: "No-Show Recovery",
      agent_rebooking: "Rebooking",
      agent_estimate_follow_up: "Estimate Follow-Up",
    };
    return agentLabels[type] || type.replace("agent_", "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  }
  // Convert snake_case / underscore types to readable
  return type
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Check if a notification type is from an AI agent */
function isAgentType(type: string): boolean {
  return type.startsWith("agent_");
}

/** Check if a notification type is appointment-related */
function isAppointmentType(type: string): boolean {
  return type.includes("appointment") || type.includes("reminder") || type.includes("booking");
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function NotificationHistory({ businessId }: { businessId: number }) {
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [limit, setLimit] = useState(50);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  const { data: logs = [], isLoading, refetch, isFetching } = useQuery<NotificationLog[]>({
    queryKey: ["/api/notification-log", limit],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/notification-log?limit=${limit}`);
      return res.json();
    },
    enabled: !!businessId,
  });

  // Apply filters
  let filtered = logs;
  if (channelFilter !== "all") {
    filtered = filtered.filter((l) => l.channel === channelFilter);
  }
  if (typeFilter === "agents") {
    filtered = filtered.filter((l) => isAgentType(l.type));
  } else if (typeFilter === "appointments") {
    filtered = filtered.filter((l) => isAppointmentType(l.type));
  } else if (typeFilter === "other") {
    filtered = filtered.filter((l) => !isAgentType(l.type) && !isAppointmentType(l.type));
  }

  const smsCount = logs.filter((l) => l.channel === "sms").length;
  const emailCount = logs.filter((l) => l.channel === "email").length;
  const failedCount = logs.filter((l) => l.status === "failed").length;
  const agentCount = logs.filter((l) => isAgentType(l.type)).length;

  const toggleRow = (id: number) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              Sent Messages
            </CardTitle>
            <CardDescription>
              Every SMS and email sent to your customers — appointment reminders, confirmations, and AI agent messages
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

        {/* Summary badges */}
        <div className="flex gap-3 pt-2 flex-wrap">
          <Badge variant="secondary" className="gap-1">
            <MessageSquare className="h-3 w-3" />
            {smsCount} SMS
          </Badge>
          {emailCount > 0 && (
            <Badge variant="secondary" className="gap-1">
              <Mail className="h-3 w-3" />
              {emailCount} emails
            </Badge>
          )}
          {agentCount > 0 && (
            <Badge variant="secondary" className="gap-1">
              <Bot className="h-3 w-3" />
              {agentCount} from agents
            </Badge>
          )}
          {failedCount > 0 && (
            <Badge variant="destructive" className="gap-1">
              <AlertCircle className="h-3 w-3" />
              {failedCount} failed
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {/* Filters */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <Select value={channelFilter} onValueChange={setChannelFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Channel" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All channels</SelectItem>
              <SelectItem value="sms">SMS only</SelectItem>
              <SelectItem value="email">Email only</SelectItem>
            </SelectContent>
          </Select>

          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="appointments">Appointments</SelectItem>
              <SelectItem value="agents">AI Agents</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>

          <Select value={String(limit)} onValueChange={(v) => setLimit(parseInt(v))}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="Show" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="25">Last 25</SelectItem>
              <SelectItem value="50">Last 50</SelectItem>
              <SelectItem value="100">Last 100</SelectItem>
              <SelectItem value="200">Last 200</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading sent messages...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No messages sent yet. SMS and emails to your customers will appear here.
          </div>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]"></TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead className="w-[70px]">Status</TableHead>
                  <TableHead className="w-[130px]">Sent</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((log) => {
                  const isExpanded = expandedRows.has(log.id);
                  const hasMessage = !!(log.message || log.subject);
                  const previewText = log.subject || (log.message ? log.message.slice(0, 80) + (log.message.length > 80 ? "..." : "") : "—");
                  const displayPhone = log.customerPhone || log.recipient;

                  return (
                    <Fragment key={log.id}>
                      <TableRow
                        className={hasMessage ? "cursor-pointer hover:bg-muted/50" : ""}
                        onClick={() => hasMessage && toggleRow(log.id)}
                      >
                        <TableCell>
                          {log.channel === "email" ? (
                            <Mail className="h-4 w-4 text-blue-500" />
                          ) : isAgentType(log.type) ? (
                            <div className="relative">
                              <MessageSquare className="h-4 w-4 text-purple-500" />
                              <Bot className="h-2.5 w-2.5 text-purple-500 absolute -top-1 -right-1" />
                            </div>
                          ) : (
                            <MessageSquare className="h-4 w-4 text-green-500" />
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          <div className="flex flex-col">
                            {log.customerName ? (
                              <>
                                <span className="font-medium text-foreground">{log.customerName}</span>
                                <span className="text-xs text-muted-foreground">{formatPhone(displayPhone)}</span>
                              </>
                            ) : (
                              <span className="text-muted-foreground">{formatPhone(displayPhone)}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          <Badge variant={isAgentType(log.type) ? "secondary" : "outline"} className="text-xs">
                            {formatType(log.type)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm max-w-[300px]">
                          <div className="flex items-center gap-1">
                            <span className={isExpanded ? "" : "truncate"}>
                              {isExpanded ? "" : previewText}
                            </span>
                            {hasMessage && (
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
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          ) : (
                            <XCircle className="h-4 w-4 text-destructive" />
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {log.sentAt ? formatDate(log.sentAt) : "—"}
                        </TableCell>
                      </TableRow>
                      {isExpanded && hasMessage && (
                        <TableRow key={`${log.id}-expanded`}>
                          <TableCell colSpan={6} className="bg-muted/30 px-6 py-3">
                            {log.subject && (
                              <div className="text-xs font-medium text-muted-foreground mb-1">Subject: {log.subject}</div>
                            )}
                            <div className="text-sm whitespace-pre-wrap break-words leading-relaxed">
                              {log.message || "No message body recorded."}
                            </div>
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

        {/* Show error details for failed items */}
        {filtered.some((l) => l.status === "failed" && l.error) && (
          <div className="mt-4 space-y-2">
            <p className="text-sm font-medium text-destructive">Failed message details:</p>
            {filtered
              .filter((l) => l.status === "failed" && l.error)
              .slice(0, 5)
              .map((l) => (
                <div key={l.id} className="text-xs bg-destructive/5 border border-destructive/20 rounded p-2">
                  <span className="font-medium">{formatType(l.type)}</span> to {l.customerName || formatPhone(l.recipient)}:{" "}
                  <span className="text-destructive">{l.error}</span>
                </div>
              ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
