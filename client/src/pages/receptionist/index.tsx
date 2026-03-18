import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageLayout } from "@/components/layout/PageLayout";
import { ReceptionistConfig } from "@/components/receptionist/ReceptionistConfig";
import { CallLog } from "@/components/receptionist/CallLog";
import { KnowledgeBase } from "@/components/receptionist/KnowledgeBase";
import { WeeklySuggestions } from "@/components/receptionist/WeeklySuggestions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Phone, Settings, MessageSquare, Info, Brain, PhoneForwarded, Sparkles, RefreshCw, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { FeatureTip } from "@/components/ui/feature-tip";
import { apiRequest } from "@/lib/queryClient";

// Recording disclosure keywords (must match server-side check)
const DISCLOSURE_KEYWORDS = ['recorded', 'recording', 'monitored', 'monitor'];

function hasRecordingDisclosure(greeting: string | null | undefined): boolean {
  if (!greeting) return false;
  const lower = greeting.toLowerCase();
  return DISCLOSURE_KEYWORDS.some(kw => lower.includes(kw));
}

export default function Receptionist() {
  const [activeTab, setActiveTab] = useState("calls");
  const { user } = useAuth();
  const businessId = user?.businessId;
  const { toast } = useToast();

  // Refresh/recreate Vapi assistant
  const refreshVapiMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/vapi/refresh/${businessId}`);
      return response.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "AI Assistant Updated",
        description: data?.phoneConnected
          ? "Your AI receptionist has been refreshed and phone connected."
          : "Your AI receptionist has been refreshed with the latest configuration.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to refresh AI assistant. Please try again.",
        variant: "destructive",
      });
    },
  });

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

  // Fetch receptionist config to check aiInsightsEnabled + greeting disclosure
  const { data: receptionistConfig } = useQuery<any>({
    queryKey: [`/api/receptionist-config/${businessId}`],
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
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">Virtual Receptionist Management</h2>
            <p className="text-gray-500">
              Manage your virtual receptionist settings and view call history
            </p>
          </div>
          <Button
            onClick={() => refreshVapiMutation.mutate()}
            disabled={refreshVapiMutation.isPending || !businessId}
            variant="outline"
            size="sm"
          >
            {refreshVapiMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Refreshing...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh Assistant
              </>
            )}
          </Button>
        </div>

        <Card className="mb-6">
          <CardHeader className="bg-blue-50 border-b">
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
          </CardHeader>
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
        </Card>

        <Tabs defaultValue="calls" value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="flex w-full overflow-x-auto sm:grid sm:w-full sm:grid-cols-4 mb-6">
            <TabsTrigger value="calls">Call History</TabsTrigger>
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
            <CallLog businessId={businessId} />
          </TabsContent>

          <TabsContent value="knowledge" className="space-y-4">
            <KnowledgeBase businessId={businessId ?? undefined} />
          </TabsContent>

          <TabsContent value="insights" className="space-y-4">
            <WeeklySuggestions
              businessId={businessId ?? undefined}
              aiInsightsEnabled={aiInsightsEnabled}
              callRecordingEnabled={callRecordingEnabled}
            />
          </TabsContent>

          <TabsContent value="settings" className="space-y-4">
            <ReceptionistConfig businessId={businessId} />
          </TabsContent>
        </Tabs>
      </div>
    </PageLayout>
  );
}
