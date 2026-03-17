import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageLayout } from "@/components/layout/PageLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { AgentCard, getAgentMeta } from "@/components/automations/AgentCard";
import { AgentSettingsForm } from "@/components/automations/AgentSettingsForm";
import { ActivityFeed } from "@/components/automations/ActivityFeed";
import { ConversationList } from "@/components/automations/ConversationList";
import { ReviewQueue } from "@/components/automations/ReviewQueue";
import { AgentReport } from "@/components/automations/AgentReport";
import NotificationHistory from "@/components/settings/NotificationHistory";
import {
  LayoutDashboard,
  Activity,
  MessageSquare,
  Settings,
  Star,
  BarChart3,
  Loader2,
  CheckCircle2,
  FlaskConical,
  TrendingUp,
  Zap,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

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

const TEST_DESCRIPTIONS: Record<string, string> = {
  follow_up: "You'll receive a thank-you SMS. This is a one-way message — no reply tracking.",
  no_show: "You'll receive a no-show check-in SMS. Reply YES to test the full conversational booking flow.",
  estimate_follow_up: "You'll receive an estimate follow-up SMS. This is a one-way message — no reply tracking.",
  rebooking: "You'll receive a rebooking prompt. Reply YES to test the full conversational booking flow.",
  review_response: "We'll generate a sample AI response to a mock 4-star review. No SMS will be sent.",
};

// ── Test Dialog ──

function TestAgentDialog({
  open,
  agentType,
  businessPhone,
  onClose,
}: {
  open: boolean;
  agentType: string | null;
  businessPhone?: string;
  onClose: () => void;
}) {
  const [phone, setPhone] = useState(businessPhone || "");
  const [result, setResult] = useState<{ message: string; aiDraft?: string } | null>(null);
  const { toast } = useToast();

  const testMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/automations/test/${agentType}`, { phone });
      return res.json();
    },
    onSuccess: (data) => {
      setResult({ message: data.message, aiDraft: data.aiDraft });
    },
    onError: (err: Error) => {
      toast({ title: "Test failed", description: err.message, variant: "destructive" });
    },
  });

  const meta = agentType ? getAgentMeta(agentType) : null;
  const isReviewAgent = agentType === "review_response";

  const handleClose = () => {
    setResult(null);
    setPhone(businessPhone || "");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4" />
            Test {meta?.label} Agent
          </DialogTitle>
          <DialogDescription>
            {agentType ? TEST_DESCRIPTIONS[agentType] : ""}
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
              <CheckCircle2 className="h-4 w-4" />
              <span className="text-sm font-medium">
                {isReviewAgent ? "AI response generated" : "Test SMS sent"}
              </span>
            </div>
            <div className="p-3 rounded-lg bg-muted text-sm">
              <p className="font-medium text-xs text-muted-foreground mb-1">
                {isReviewAgent ? "Mock Review:" : "Message Sent:"}
              </p>
              <p>{result.message}</p>
            </div>
            {result.aiDraft && (
              <div className="p-3 rounded-lg bg-muted text-sm">
                <p className="font-medium text-xs text-muted-foreground mb-1">AI Draft Response:</p>
                <p>{result.aiDraft}</p>
              </div>
            )}
            {!isReviewAgent && (agentType === "no_show" || agentType === "rebooking") && (
              <p className="text-xs text-muted-foreground">
                Reply YES to test the conversational booking flow. The test conversation expires in 1 hour. No real appointments will be created.
              </p>
            )}
            <Button variant="outline" className="w-full" onClick={handleClose}>
              Close
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {!isReviewAgent && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Phone Number</label>
                <Input
                  placeholder="+1 (555) 123-4567"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Enter your phone number to receive the test SMS.
                </p>
              </div>
            )}
            <Button
              className="w-full"
              onClick={() => testMutation.mutate()}
              disabled={testMutation.isPending || (!isReviewAgent && (!phone || phone.replace(/\D/g, "").length < 10))}
            >
              {testMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              {isReviewAgent ? "Generate Test Response" : "Send Test SMS"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Performance Banner ──

function PerformanceBanner() {
  const { data: report } = useQuery<{
    totals: {
      smsSent: number;
      repliesReceived: number;
      totalConversations: number;
      resolved: number;
      appointmentsBooked: number;
      replyRate: number;
      resolutionRate: number;
    };
  }>({
    queryKey: ["/api/automations/report", { period: "month" }],
  });

  if (!report?.totals || report.totals.smsSent === 0) return null;

  const { smsSent, repliesReceived, resolved, appointmentsBooked } = report.totals;
  // Estimate $85 avg revenue per recovered appointment (industry average for service businesses)
  const estimatedRevenue = appointmentsBooked * 85;

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="py-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Zap className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">
              Your agents sent <span className="font-bold">{smsSent}</span> messages this month
              {repliesReceived > 0 && <>, got <span className="font-bold">{repliesReceived}</span> replies</>}
              {resolved > 0 && <>, and resolved <span className="font-bold">{resolved}</span> conversations</>}
              {estimatedRevenue > 0 && (
                <> — recovering an estimated <span className="font-bold text-green-600 dark:text-green-400">${estimatedRevenue.toLocaleString()}</span> in revenue</>
              )}
              .
            </p>
          </div>
          {estimatedRevenue > 0 && (
            <div className="hidden sm:flex items-center gap-1 text-green-600 dark:text-green-400">
              <TrendingUp className="h-4 w-4" />
              <span className="text-sm font-bold">${estimatedRevenue.toLocaleString()}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Overview Tab ──

function OverviewTab({ isOwner, onTest }: { isOwner: boolean; onTest: (agentType: string) => void }) {
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
    <div className="space-y-4">
      {isOwner && <PerformanceBanner />}
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
            isOwner={isOwner}
            onTest={onTest}
          />
        ))}
      </div>
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

function ConversationsTab({ businessId }: { businessId?: number }) {
  const { data: conversations = [], isLoading } = useQuery<SmsConversation[]>({
    queryKey: ["/api/automations/conversations"],
  });

  const activeConversations = conversations.filter(c => c.state === 'awaiting_reply' || c.state === 'replied');
  const pastConversations = conversations.filter(c => c.state !== 'awaiting_reply' && c.state !== 'replied');

  return (
    <div className="space-y-6">
      {/* Active conversations section */}
      {activeConversations.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-foreground">Active Conversations</h3>
          <p className="text-sm text-muted-foreground">
            Ongoing SMS conversations waiting for a customer reply.
          </p>
          <ConversationList conversations={activeConversations} isLoading={isLoading} />
        </div>
      )}

      {/* Message log — all sent messages with full text */}
      {businessId && (
        <NotificationHistory businessId={businessId} />
      )}

      {/* Past conversations */}
      {pastConversations.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-foreground">Past Conversations</h3>
          <ConversationList conversations={pastConversations} isLoading={isLoading} />
        </div>
      )}
    </div>
  );
}

// ── Main Page ──

export default function AutomationsPage() {
  const { user } = useAuth();
  const isOwner = user?.role !== "staff";
  const [testAgent, setTestAgent] = useState<string | null>(null);

  const { data: business } = useQuery<any>({
    queryKey: ["/api/business"],
    enabled: !!user?.businessId,
  });

  return (
    <PageLayout title="AI Agents">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">AI Agents</h2>
          <p className="text-muted-foreground mt-1">
            Your AI-powered agents work around the clock — following up, recovering no-shows, closing estimates, rebooking inactive customers, and responding to reviews.
          </p>
        </div>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className={`grid w-full ${isOwner ? "grid-cols-6" : "grid-cols-5"}`}>
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
              <span className="hidden sm:inline">Messages</span>
            </TabsTrigger>
            <TabsTrigger value="reviews" className="flex items-center gap-1.5">
              <Star className="h-4 w-4" />
              <span className="hidden sm:inline">Reviews</span>
            </TabsTrigger>
            {isOwner && (
              <TabsTrigger value="report" className="flex items-center gap-1.5">
                <BarChart3 className="h-4 w-4" />
                <span className="hidden sm:inline">Report</span>
              </TabsTrigger>
            )}
            <TabsTrigger value="settings" className="flex items-center gap-1.5">
              <Settings className="h-4 w-4" />
              <span className="hidden sm:inline">Settings</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <OverviewTab isOwner={isOwner} onTest={setTestAgent} />
          </TabsContent>

          <TabsContent value="activity">
            <ActivityFeed />
          </TabsContent>

          <TabsContent value="conversations">
            <ConversationsTab businessId={user?.businessId ?? undefined} />
          </TabsContent>

          <TabsContent value="reviews">
            <ReviewQueue />
          </TabsContent>

          {isOwner && (
            <TabsContent value="report">
              <AgentReport />
            </TabsContent>
          )}

          <TabsContent value="settings">
            <SettingsTab />
          </TabsContent>
        </Tabs>
      </div>

      {/* Test Agent Dialog */}
      <TestAgentDialog
        open={testAgent !== null}
        agentType={testAgent}
        businessPhone={business?.phone || ""}
        onClose={() => setTestAgent(null)}
      />
    </PageLayout>
  );
}
