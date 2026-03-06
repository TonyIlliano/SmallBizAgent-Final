import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageLayout } from "@/components/layout/PageLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { AgentCard } from "@/components/automations/AgentCard";
import { AgentSettingsForm } from "@/components/automations/AgentSettingsForm";
import { ActivityFeed } from "@/components/automations/ActivityFeed";
import { ConversationList } from "@/components/automations/ConversationList";
import { ReviewQueue } from "@/components/automations/ReviewQueue";
import {
  LayoutDashboard,
  Activity,
  MessageSquare,
  Settings,
  Star,
  Loader2,
} from "lucide-react";

interface AgentDashboard {
  agentType: string;
  enabled: boolean;
  smsSentCount: number;
  repliesReceivedCount: number;
  lastActivityAt: string | null;
}

interface AgentSetting {
  agentType: string;
  enabled: boolean;
  config: Record<string, any> | null;
  businessId: number;
}

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

const AGENT_ORDER = ["follow_up", "no_show", "estimate_follow_up", "rebooking", "review_response"];

// ── Overview Tab ──

function OverviewTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [togglingAgent, setTogglingAgent] = useState<string | null>(null);

  const { data: dashboard = [], isLoading } = useQuery<AgentDashboard[]>({
    queryKey: ["/api/automations/dashboard"],
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ agentType, enabled }: { agentType: string; enabled: boolean }) => {
      setTogglingAgent(agentType);
      const res = await apiRequest("PUT", `/api/automations/settings/${agentType}`, { enabled });
      return res.json();
    },
    onSuccess: (_, { agentType, enabled }) => {
      const label = agentType.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
      toast({
        title: enabled ? `${label} enabled` : `${label} disabled`,
        description: enabled
          ? "This agent will now run automatically."
          : "This agent has been paused.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/automations/dashboard"] });
      queryClient.invalidateQueries({ queryKey: ["/api/automations/settings"] });
      setTogglingAgent(null);
    },
    onError: (err: Error) => {
      toast({ title: "Failed to toggle agent", description: err.message, variant: "destructive" });
      setTogglingAgent(null);
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Sort by AGENT_ORDER
  const sorted = AGENT_ORDER.map((type) => {
    return dashboard.find((d) => d.agentType === type) ?? {
      agentType: type,
      enabled: false,
      smsSentCount: 0,
      repliesReceivedCount: 0,
      lastActivityAt: null,
    };
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {sorted.map((agent) => (
        <AgentCard
          key={agent.agentType}
          agentType={agent.agentType}
          enabled={agent.enabled}
          smsSentCount={agent.smsSentCount}
          repliesReceivedCount={agent.repliesReceivedCount}
          lastActivityAt={agent.lastActivityAt}
          isToggling={togglingAgent === agent.agentType}
          onToggle={(enabled) =>
            toggleMutation.mutate({ agentType: agent.agentType, enabled })
          }
        />
      ))}
    </div>
  );
}

// ── Settings Tab ──

function SettingsTab() {
  const { data: settings = [], isLoading } = useQuery<AgentSetting[]>({
    queryKey: ["/api/automations/settings"],
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const sorted = AGENT_ORDER.map((type) => {
    return settings.find((s) => s.agentType === type) ?? {
      agentType: type,
      enabled: false,
      config: null,
      businessId: 0,
    };
  });

  return (
    <div className="space-y-6">
      {sorted.map((agent) => (
        <AgentSettingsForm
          key={agent.agentType}
          agentType={agent.agentType}
          currentConfig={agent.config}
          enabled={agent.enabled}
        />
      ))}
    </div>
  );
}

// ── Conversations Tab ──

function ConversationsTab() {
  const { data: conversations = [], isLoading } = useQuery<SmsConversation[]>({
    queryKey: ["/api/automations/conversations"],
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        SMS conversations from No-Show and Rebooking agents. Conversations expire after their configured timeout.
      </p>
      <ConversationList conversations={conversations} isLoading={isLoading} />
    </div>
  );
}

// ── Main Page ──

export default function AutomationsPage() {
  return (
    <PageLayout title="Automations">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">SMS Automations</h2>
          <p className="text-muted-foreground mt-1">
            Configure automated SMS agents that engage customers on your behalf — follow-ups, no-show recovery, estimate reminders, and rebooking prompts.
          </p>
        </div>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="overview" className="flex items-center gap-1.5">
              <LayoutDashboard className="h-4 w-4" />
              <span className="hidden sm:inline">Overview</span>
            </TabsTrigger>
            <TabsTrigger value="activity" className="flex items-center gap-1.5">
              <Activity className="h-4 w-4" />
              <span className="hidden sm:inline">Activity</span>
            </TabsTrigger>
            <TabsTrigger value="conversations" className="flex items-center gap-1.5">
              <MessageSquare className="h-4 w-4" />
              <span className="hidden sm:inline">Conversations</span>
            </TabsTrigger>
            <TabsTrigger value="reviews" className="flex items-center gap-1.5">
              <Star className="h-4 w-4" />
              <span className="hidden sm:inline">Reviews</span>
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex items-center gap-1.5">
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">Settings</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <OverviewTab />
          </TabsContent>

          <TabsContent value="activity">
            <ActivityFeed />
          </TabsContent>

          <TabsContent value="conversations">
            <ConversationsTab />
          </TabsContent>

          <TabsContent value="reviews">
            <ReviewQueue />
          </TabsContent>

          <TabsContent value="settings">
            <SettingsTab />
          </TabsContent>
        </Tabs>
      </div>
    </PageLayout>
  );
}
