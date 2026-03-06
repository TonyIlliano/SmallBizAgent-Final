import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getAgentMeta } from "./AgentCard";
import { MessageSquare } from "lucide-react";

interface SmsConversation {
  id: number;
  businessId: number;
  customerId?: number;
  customerPhone: string;
  agentType: string;
  referenceType?: string;
  referenceId?: number;
  state: string;
  context?: Record<string, any>;
  lastMessageSentAt?: string;
  lastReplyReceivedAt?: string;
  expiresAt?: string;
  createdAt: string;
}

const STATE_COLORS: Record<string, string> = {
  awaiting_reply: "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400",
  replied: "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400",
  resolved: "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400",
  expired: "bg-neutral-100 dark:bg-neutral-800 text-neutral-500",
  escalated: "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400",
};

interface ConversationListProps {
  conversations: SmsConversation[];
  isLoading: boolean;
}

export function ConversationList({ conversations, isLoading }: ConversationListProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <Card className="border-border bg-card">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <MessageSquare className="h-10 w-10 text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground">
            No active conversations. Conversations appear here when agents send messages that expect a reply.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="p-3 text-left font-medium text-muted-foreground">Agent</th>
              <th className="p-3 text-left font-medium text-muted-foreground">Phone</th>
              <th className="p-3 text-left font-medium text-muted-foreground">Reference</th>
              <th className="p-3 text-left font-medium text-muted-foreground">State</th>
              <th className="p-3 text-left font-medium text-muted-foreground">Last Sent</th>
              <th className="p-3 text-left font-medium text-muted-foreground">Expires</th>
            </tr>
          </thead>
          <tbody>
            {conversations.map((conv) => {
              const meta = getAgentMeta(conv.agentType);
              const stateColor = STATE_COLORS[conv.state] ?? "bg-muted text-muted-foreground";

              return (
                <tr
                  key={conv.id}
                  className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                >
                  <td className="p-3">
                    <Badge variant="secondary" className="text-xs">{meta.label}</Badge>
                  </td>
                  <td className="p-3 text-muted-foreground font-mono text-xs">
                    {conv.customerPhone}
                  </td>
                  <td className="p-3 text-muted-foreground text-xs">
                    {conv.referenceType && conv.referenceId
                      ? `${conv.referenceType} #${conv.referenceId}`
                      : "---"}
                  </td>
                  <td className="p-3">
                    <Badge className={`text-xs ${stateColor}`}>
                      {conv.state.replace(/_/g, " ")}
                    </Badge>
                  </td>
                  <td className="p-3 text-muted-foreground text-xs">
                    {conv.lastMessageSentAt
                      ? new Date(conv.lastMessageSentAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })
                      : "---"}
                  </td>
                  <td className="p-3 text-muted-foreground text-xs">
                    {conv.expiresAt
                      ? new Date(conv.expiresAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })
                      : "---"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
