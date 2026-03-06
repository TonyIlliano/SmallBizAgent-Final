import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Heart,
  UserX,
  FileText,
  CalendarClock,
  Star,
  MessageSquare,
  Loader2,
  FlaskConical,
} from "lucide-react";

const AGENT_META: Record<string, { label: string; description: string; icon: any; color: string }> = {
  follow_up: {
    label: "Follow-Up",
    description: "Thank-you and upsell SMS after completed jobs or appointments",
    icon: Heart,
    color: "text-pink-600 dark:text-pink-400",
  },
  no_show: {
    label: "No-Show",
    description: "Detect missed appointments and offer rescheduling",
    icon: UserX,
    color: "text-orange-600 dark:text-orange-400",
  },
  estimate_follow_up: {
    label: "Estimate Follow-Up",
    description: "Automated SMS follow-ups on pending quotes",
    icon: FileText,
    color: "text-blue-600 dark:text-blue-400",
  },
  rebooking: {
    label: "Rebooking",
    description: "Proactive rebooking prompts for inactive customers",
    icon: CalendarClock,
    color: "text-green-600 dark:text-green-400",
  },
  review_response: {
    label: "Review Response",
    description: "AI-drafted responses to Google reviews",
    icon: Star,
    color: "text-amber-600 dark:text-amber-400",
  },
};

export function getAgentMeta(agentType: string) {
  return AGENT_META[agentType] ?? {
    label: agentType,
    description: "",
    icon: MessageSquare,
    color: "text-muted-foreground",
  };
}

interface AgentCardProps {
  agentType: string;
  enabled: boolean;
  smsSentCount?: number;
  repliesReceivedCount?: number;
  lastActivityAt?: string | null;
  isToggling?: boolean;
  onToggle: (enabled: boolean) => void;
  isOwner?: boolean;
  onTest?: (agentType: string) => void;
}

export function AgentCard({
  agentType,
  enabled,
  smsSentCount = 0,
  repliesReceivedCount = 0,
  lastActivityAt,
  isToggling,
  onToggle,
  isOwner,
  onTest,
}: AgentCardProps) {
  const meta = getAgentMeta(agentType);
  const Icon = meta.icon;

  return (
    <Card className="border-border bg-card">
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-muted">
              <Icon className={`h-5 w-5 ${meta.color}`} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">{meta.label}</h3>
              <p className="text-xs text-muted-foreground mt-0.5 max-w-[200px]">
                {meta.description}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isToggling ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (
              <Switch
                checked={enabled}
                onCheckedChange={onToggle}
              />
            )}
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-1">
            <MessageSquare className="h-3 w-3" />
            <span>{smsSentCount} sent</span>
          </div>
          <div className="flex items-center gap-1">
            <span>{repliesReceivedCount} replies</span>
          </div>
          {isOwner && onTest && (
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-6 px-2 text-xs gap-1"
              onClick={() => onTest(agentType)}
            >
              <FlaskConical className="h-3 w-3" />
              Test
            </Button>
          )}
          {!onTest && lastActivityAt && (
            <div className="ml-auto">
              Last: {new Date(lastActivityAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
