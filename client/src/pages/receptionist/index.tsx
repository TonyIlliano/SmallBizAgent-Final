import { useState, useEffect, lazy, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageLayout } from "@/components/layout/PageLayout";
import { ReceptionistConfig } from "@/components/receptionist/ReceptionistConfig";
import { CallLog } from "@/components/receptionist/CallLog";
import { KnowledgeBase } from "@/components/receptionist/KnowledgeBase";
import { WeeklySuggestions } from "@/components/receptionist/WeeklySuggestions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { Phone, Settings, MessageSquare, Info, Brain, PhoneForwarded, Sparkles, ChevronDown, ChevronUp, Zap, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

import { FeatureTip } from "@/components/ui/feature-tip";
import { SectionErrorBoundary } from "@/components/ui/section-error-boundary";

// Phone provisioning lives here (used to live in Settings → Business). This is the
// natural home: it controls the AI receptionist's phone number, deprovisioning, and
// the receptionist on/off toggle.
const PhoneProvisioningCard = lazy(() => import("@/components/settings/PhoneProvisioningCard"));

// AI Quality scoring — lazy so it only loads when the merchant clicks the tab.
const CallQualityTrendChart = lazy(() => import("@/components/receptionist/CallQualityTrendChart"));
const FlaggedCalls = lazy(() => import("@/components/receptionist/FlaggedCalls"));


// Recording disclosure keywords (must match server-side check)
const DISCLOSURE_KEYWORDS = ['recorded', 'recording', 'monitored', 'monitor'];

function hasRecordingDisclosure(greeting: string | null | undefined): boolean {
  if (!greeting) return false;
  const lower = greeting.toLowerCase();
  return DISCLOSURE_KEYWORDS.some(kw => lower.includes(kw));
}

// Removed global key — now scoped per business inside component

/**
 * Small inline indicator showing when the AI's system prompt was last
 * refreshed with fresh call patterns. Hidden when the business has never
 * had a refresh (typical for brand-new accounts).
 */
function AiLearningIndicator({ lastRefreshAt }: { lastRefreshAt?: string | null }) {
  if (!lastRefreshAt) return null;
  const last = new Date(lastRefreshAt).getTime();
  if (Number.isNaN(last)) return null;

  const diffMs = Date.now() - last;
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor(diffMs / (1000 * 60 * 60));

  let label: string;
  if (days >= 2) label = `${days} days ago`;
  else if (days === 1) label = '1 day ago';
  else if (hours >= 1) label = `${hours} hour${hours === 1 ? '' : 's'} ago`;
  else label = 'just now';

  return (
    <div
      className="mt-2 inline-flex items-center gap-1.5 text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-full px-2.5 py-1"
      title="Your AI receptionist automatically learns from recent calls each week — common questions, frequently mentioned services, and caller sentiment."
      data-testid="ai-learning-indicator"
    >
      <Zap className="h-3 w-3 text-amber-500" />
      <span>AI last learned from your calls: <strong className="font-medium text-gray-700">{label}</strong></span>
    </div>
  );
}

export default function Receptionist() {
  const { user } = useAuth();
  const businessId = user?.businessId;

  // Fetch call log count to decide default tab
  const { data: callLogs } = useQuery<any[]>({
    queryKey: ["/api/call-logs"],
    enabled: !!businessId,
  });

  // Default to Configuration tab if zero call logs
  const hasCallLogs = (callLogs?.length ?? 0) > 0;
  const [activeTab, setActiveTab] = useState<string | null>(null);

  // Set initial tab once call log data is available
  useEffect(() => {
    if (activeTab === null && callLogs !== undefined) {
      setActiveTab(hasCallLogs ? "calls" : "settings");
    }
  }, [callLogs, activeTab, hasCallLogs]);

  // Info card collapse state — scoped per business so multi-business users get independent state
  const infoCardKey = `sba-receptionist-info-collapsed-${businessId || 'default'}`;
  const [infoCardCollapsed, setInfoCardCollapsed] = useState(() => {
    try {
      return localStorage.getItem(infoCardKey) === 'true';
    } catch {
      return false;
    }
  });

  const toggleInfoCard = () => {
    const next = !infoCardCollapsed;
    setInfoCardCollapsed(next);
    try {
      localStorage.setItem(infoCardKey, String(next));
    } catch {
      // localStorage not available
    }
  };

  // Fetch unanswered question count for notification badge
  const { data: questionCountData } = useQuery<{ count: number }>({
    queryKey: ["/api/unanswered-questions/count"],
    enabled: !!businessId,
    refetchInterval: 60000, // Refresh every minute
  });
  const unansweredCount = questionCountData?.count || 0;

  // Fetch suggestion count for AI Insights badge
  const { data: suggestionCountData } = useQuery<{ count: number; acceptedCount: number }>({
    queryKey: ["/api/receptionist/suggestions/count"],
    enabled: !!businessId,
    refetchInterval: 60000,
  });
  const suggestionCount = suggestionCountData?.count || 0;

  // Fetch quality summary for the "flagged calls" badge on the Quality tab.
  // Reuses the same endpoint the dashboard widget hits, so the React Query
  // cache is warm if the user came from the dashboard.
  const { data: qualitySummary } = useQuery<{ flaggedCount: number; callsScored: number }>({
    queryKey: ["/api/call-quality/business/summary", businessId],
    enabled: !!businessId,
    staleTime: 60000,
  });
  const flaggedCount = qualitySummary?.flaggedCount || 0;

  // Fetch receptionist config to check aiInsightsEnabled + greeting disclosure
  const { data: receptionistConfig } = useQuery<any>({
    queryKey: [`/api/receptionist-config/${businessId}`],
    enabled: !!businessId,
  });

  // Fetch business profile to surface lastIntelligenceRefreshAt — the
  // timestamp of the most recent auto-refresh of the agent's system prompt
  // with fresh call patterns. Used in the "AI last learned" indicator.
  const { data: businessProfile } = useQuery<any>({
    queryKey: ['/api/business'],
    enabled: !!businessId,
  });
  const aiInsightsEnabled = receptionistConfig?.aiInsightsEnabled === true;
  const callRecordingEnabled = receptionistConfig?.callRecordingEnabled !== false; // defaults to true
  const greetingHasDisclosure = hasRecordingDisclosure(receptionistConfig?.greeting);

  return (
    <PageLayout title="Virtual Receptionist">
      <div className="space-y-6">
        <FeatureTip
          tipId="receptionist-forwarding"
          title="Forward your business phone"
          description="Set up call forwarding from your business line to your AI receptionist number. It will answer calls, take messages, and book appointments."
          icon={PhoneForwarded}
          actionLabel="View setup guide"
          actionHref="/settings?tab=profile"
        />
        <div>
          <h2 className="text-2xl font-bold">Virtual Receptionist Management</h2>
          <p className="text-gray-500">
            Manage your virtual receptionist settings and view call history
          </p>
          <AiLearningIndicator lastRefreshAt={businessProfile?.lastIntelligenceRefreshAt} />
        </div>

        <Card className="mb-6">
          <CardHeader
            className="bg-blue-50 border-b cursor-pointer"
            onClick={toggleInfoCard}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start">
                <Info className="h-5 w-5 text-blue-500 mr-2 mt-0.5" />
                <div>
                  <CardTitle className="text-blue-700">Virtual Receptionist</CardTitle>
                  <CardDescription className="text-blue-600">
                    Your virtual receptionist uses AI to handle your calls 24/7, schedule appointments,
                    and manage customer inquiries even when you're not available.
                  </CardDescription>
                </div>
              </div>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-blue-500 hover:text-blue-700 flex-shrink-0" aria-label={infoCardCollapsed ? "Expand info card" : "Collapse info card"}>
                {infoCardCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
              </Button>
            </div>
          </CardHeader>
          {!infoCardCollapsed && (
            <CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="flex flex-col items-center p-4 bg-gray-50 rounded-lg">
                  <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center mb-3">
                    <Phone className="h-6 w-6 text-blue-600" />
                  </div>
                  <h3 className="font-medium text-lg mb-1">24/7 Call Handling</h3>
                  <p className="text-sm text-center text-gray-500">
                    Never miss a call. The virtual receptionist answers calls anytime, even after hours.
                  </p>
                </div>

                <div className="flex flex-col items-center p-4 bg-gray-50 rounded-lg">
                  <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center mb-3">
                    <MessageSquare className="h-6 w-6 text-green-600" />
                  </div>
                  <h3 className="font-medium text-lg mb-1">Smart Conversations</h3>
                  <p className="text-sm text-center text-gray-500">
                    Understands caller needs and responds intelligently to schedule appointments or answer questions.
                  </p>
                </div>

                <div className="flex flex-col items-center p-4 bg-gray-50 rounded-lg">
                  <div className="h-12 w-12 rounded-full bg-purple-100 flex items-center justify-center mb-3">
                    <Settings className="h-6 w-6 text-purple-600" />
                  </div>
                  <h3 className="font-medium text-lg mb-1">Fully Customizable</h3>
                  <p className="text-sm text-center text-gray-500">
                    Customize greetings, after-hours messages, and emergency handling to match your business needs.
                  </p>
                </div>
              </div>
            </CardContent>
          )}
        </Card>

        {/* Phone provisioning card — controls the AI receptionist phone number,
            on/off toggle, deprovisioning, and call-forwarding setup. */}
        <SectionErrorBoundary fallbackTitle="Phone provisioning">
          <Suspense fallback={
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          }>
            <PhoneProvisioningCard />
          </Suspense>
        </SectionErrorBoundary>

        <Tabs defaultValue="calls" value={activeTab || "calls"} onValueChange={setActiveTab}>
          <TabsList className="flex w-full overflow-x-auto sm:grid sm:w-full sm:grid-cols-5 mb-6">
            <TabsTrigger value="calls">Call History</TabsTrigger>
            <TabsTrigger value="quality" className="relative">
              <Sparkles className="h-4 w-4 mr-1.5" />
              Quality
              {flaggedCount > 0 && (
                <Badge variant="destructive" className="ml-1.5 h-5 min-w-[20px] rounded-full px-1.5 text-[10px]">
                  {flaggedCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="knowledge" className="relative">
              <Brain className="h-4 w-4 mr-1.5" />
              Knowledge Base
              {unansweredCount > 0 && (
                <Badge variant="destructive" className="ml-1.5 h-5 min-w-[20px] rounded-full px-1.5 text-[10px]">
                  {unansweredCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="insights" className="relative">
              <Sparkles className="h-4 w-4 mr-1.5" />
              AI Insights
              {suggestionCount > 0 && (
                <Badge variant="destructive" className="ml-1.5 h-5 min-w-[20px] rounded-full px-1.5 text-[10px]">
                  {suggestionCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="settings">Configuration</TabsTrigger>
          </TabsList>

          <TabsContent value="calls" className="space-y-4">
            <SectionErrorBoundary fallbackTitle="Call history">
              <CallLog businessId={businessId} />
            </SectionErrorBoundary>
          </TabsContent>

          <TabsContent value="quality" className="space-y-4">
            <SectionErrorBoundary fallbackTitle="AI quality">
              <Suspense fallback={
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              }>
                <CallQualityTrendChart />
                <FlaggedCalls />
              </Suspense>
            </SectionErrorBoundary>
          </TabsContent>

          <TabsContent value="knowledge" className="space-y-4">
            <SectionErrorBoundary fallbackTitle="Knowledge base">
              <KnowledgeBase businessId={businessId ?? undefined} />
            </SectionErrorBoundary>
          </TabsContent>

          <TabsContent value="insights" className="space-y-4">
            <SectionErrorBoundary fallbackTitle="AI insights">
              <WeeklySuggestions
                businessId={businessId ?? undefined}
                aiInsightsEnabled={aiInsightsEnabled}
                callRecordingEnabled={callRecordingEnabled}
              />
            </SectionErrorBoundary>
          </TabsContent>

          <TabsContent value="settings" className="space-y-4">
            <SectionErrorBoundary fallbackTitle="Receptionist configuration">
              <ReceptionistConfig businessId={businessId} />
            </SectionErrorBoundary>
          </TabsContent>
        </Tabs>
      </div>
    </PageLayout>
  );
}
