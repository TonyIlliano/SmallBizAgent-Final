import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useState } from "react";
import { getAgentMeta } from "./AgentCard";
import {
  MessageSquare,
  ArrowDownLeft,
  RefreshCw,
  AlertCircle,
  Loader2,
  Activity,
} from "lucide-react";

interface ActivityLogEntry {
  id: number;
  businessId: number;
  agentType: string;
  action: string;
  customerId?: number;
  referenceType?: string;
  referenceId?: number;
  details?: Record<string, any>;
  createdAt: string;
}

const ACTION_ICONS: Record<string, any> = {
  sms_sent: MessageSquare,
  reply_received: ArrowDownLeft,
  status_changed: RefreshCw,
  escalated: AlertCircle,
};

const ACTION_COLORS: Record<string, string> = {
  sms_sent: "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400",
  reply_received: "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400",
  status_changed: "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400",
  escalated: "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400",
};

function formatActionLabel(action: string): string {
  return action.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function ActivityFeed() {
  const [filter, setFilter] = useState<string>("all");

  const { data: logs = [], isLoading } = useQuery<ActivityLogEntry[]>({
    queryKey: ["/api/automations/activity", { agentType: filter !== "all" ? filter : undefined, limit: "100" }],
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <label className="text-sm font-medium text-foreground">Filter by agent:</label>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Agents</SelectItem>
            <SelectItem value="follow_up">Follow-Up</SelectItem>
            <SelectItem value="no_show">No-Show</SelectItem>
            <SelectItem value="estimate_follow_up">Estimate Follow-Up</SelectItem>
            <SelectItem value="rebooking">Rebooking</SelectItem>
            <SelectItem value="review_response">Review Response</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : logs.length === 0 ? (
        <Card className="border-border bg-card">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Activity className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">
              No agent activity yet. Activity will appear here as agents send messages and process replies.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-border bg-card overflow-hidden">
          <div className="divide-y divide-border">
            {logs.map((log) => {
              const meta = getAgentMeta(log.agentType);
              const ActionIcon = ACTION_ICONS[log.action] ?? MessageSquare;
              const colorClass = ACTION_COLORS[log.action] ?? "bg-muted text-muted-foreground";

              return (
                <div key={log.id} className="p-4 hover:bg-muted/30 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded-lg ${colorClass}`}>
                      <ActionIcon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary" className="text-xs">{meta.label}</Badge>
                        <span className="text-sm font-medium text-foreground">
                          {formatActionLabel(log.action)}
                        </span>
                        {log.referenceType && log.referenceId && (
                          <span className="text-xs text-muted-foreground">
                            {log.referenceType} #{log.referenceId}
                          </span>
                        )}
                      </div>
                      {log.details?.message && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {log.details.message}
                        </p>
                      )}
                      {log.details?.newState && (
                        <p className="text-xs text-muted-foreground mt-1">
                          State changed to: <span className="font-medium">{log.details.newState}</span>
                          {log.details.reason && ` (${log.details.reason.replace(/_/g, " ")})`}
                        </p>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
