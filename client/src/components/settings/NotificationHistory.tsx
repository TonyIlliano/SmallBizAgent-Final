import { useState } from "react";
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
import { Mail, MessageSquare, AlertCircle, CheckCircle2, XCircle, RefreshCw } from "lucide-react";

interface NotificationLog {
  id: number;
  businessId: number;
  customerId?: number | null;
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

/** Mask email/phone for privacy in the table */
function maskRecipient(recipient: string): string {
  if (recipient.includes("@")) {
    const [local, domain] = recipient.split("@");
    return local.slice(0, 2) + "***@" + domain;
  }
  // Phone: show last 4 digits
  if (recipient.length >= 4) {
    return "***" + recipient.slice(-4);
  }
  return recipient;
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
  // Convert snake_case / underscore types to readable
  return type
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function NotificationHistory({ businessId }: { businessId: number }) {
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [limit, setLimit] = useState(50);

  const { data: logs = [], isLoading, refetch, isFetching } = useQuery<NotificationLog[]>({
    queryKey: ["/api/notification-log", limit],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/notification-log?limit=${limit}`);
      return res.json();
    },
    enabled: !!businessId,
  });

  const filtered = channelFilter === "all"
    ? logs
    : logs.filter((l) => l.channel === channelFilter);

  const emailCount = logs.filter((l) => l.channel === "email").length;
  const smsCount = logs.filter((l) => l.channel === "sms").length;
  const failedCount = logs.filter((l) => l.status === "failed").length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Notification History
            </CardTitle>
            <CardDescription>
              All emails and SMS messages sent by SmallBizAgent on behalf of your business
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
        <div className="flex gap-3 pt-2">
          <Badge variant="secondary" className="gap-1">
            <Mail className="h-3 w-3" />
            {emailCount} emails
          </Badge>
          <Badge variant="secondary" className="gap-1">
            <MessageSquare className="h-3 w-3" />
            {smsCount} SMS
          </Badge>
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
        <div className="flex items-center gap-3 mb-4">
          <Select value={channelFilter} onValueChange={setChannelFilter}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Channel" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All channels</SelectItem>
              <SelectItem value="email">Email only</SelectItem>
              <SelectItem value="sms">SMS only</SelectItem>
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
          <div className="text-center py-8 text-muted-foreground">Loading notification history...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No notifications sent yet. Emails and SMS messages will appear here once sent.
          </div>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">Channel</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Recipient</TableHead>
                  <TableHead>Subject / Message</TableHead>
                  <TableHead className="w-[80px]">Status</TableHead>
                  <TableHead className="w-[150px]">Sent</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>
                      {log.channel === "email" ? (
                        <Mail className="h-4 w-4 text-blue-500" />
                      ) : (
                        <MessageSquare className="h-4 w-4 text-green-500" />
                      )}
                    </TableCell>
                    <TableCell className="font-medium text-sm">
                      {formatType(log.type)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground font-mono">
                      {maskRecipient(log.recipient)}
                    </TableCell>
                    <TableCell className="text-sm max-w-[300px] truncate">
                      {log.subject || (log.message ? log.message.slice(0, 80) + "..." : "—")}
                    </TableCell>
                    <TableCell>
                      {log.status === "sent" || log.status === "delivered" ? (
                        <Badge variant="outline" className="text-green-600 border-green-200 gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          {log.status}
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="gap-1">
                          <XCircle className="h-3 w-3" />
                          failed
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {log.sentAt ? formatDate(log.sentAt) : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Show error details for failed items */}
        {filtered.some((l) => l.status === "failed" && l.error) && (
          <div className="mt-4 space-y-2">
            <p className="text-sm font-medium text-destructive">Failed notification details:</p>
            {filtered
              .filter((l) => l.status === "failed" && l.error)
              .slice(0, 5)
              .map((l) => (
                <div key={l.id} className="text-xs bg-destructive/5 border border-destructive/20 rounded p-2">
                  <span className="font-medium">{formatType(l.type)}</span> to {maskRecipient(l.recipient)}:{" "}
                  <span className="text-destructive">{l.error}</span>
                </div>
              ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
