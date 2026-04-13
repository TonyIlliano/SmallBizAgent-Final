import { useState, useRef, useEffect, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageLayout } from "@/components/layout/PageLayout";
import PageTitle from "@/components/PageTitle";
import { JobForm } from "@/components/jobs/JobForm";
import { JobLineItems } from "@/components/jobs/JobLineItems";
import { JobProgressTimeline } from "@/components/jobs/JobProgressTimeline";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SkeletonForm } from "@/components/ui/skeleton-loader";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/api";
import {
  ArrowLeft,
  FileText,
  CheckCircle,
  MessageSquare,
  Star,
  Sparkles,
  ChevronDown,
  ChevronUp,
  MapPin,
  Car,
  Mic,
  Brain,
  Timer,
  Play,
  Pause,
  RotateCcw,
  AlertTriangle,
  Wrench,
  Loader2,
} from "lucide-react";

// =================== TYPE DEFINITIONS ===================

interface JobBriefing {
  summary: string;
  customerContext: string;
  jobHistory: string;
  currentJob: string;
  sentiment: string;
  suggestedApproach: string;
  followUpOpportunities: string[];
  generatedAt: string;
}

interface VoiceNotesResponse {
  parsed: {
    notes: string;
    partsUsed: Array<{ name: string; quantity?: number }>;
    equipmentInfo: string | null;
    followUpNeeded: boolean;
    followUpDescription: string | null;
    estimatedFollowUpCost: number | null;
    completionSummary: string;
  };
  saved: boolean;
  fallback?: boolean;
}

// =================== AI JOB BRIEFING CARD ===================

function AiBriefingCard({ jobId }: { jobId: number }) {
  const [expanded, setExpanded] = useState(false);
  const [briefingRequested, setBriefingRequested] = useState(false);

  const {
    data: briefing,
    isLoading,
    error,
    refetch,
  } = useQuery<JobBriefing>({
    queryKey: ["/api/jobs", jobId, "briefing"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/jobs/${jobId}/briefing`);
      return res;
    },
    enabled: briefingRequested,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });

  return (
    <Card className="border-l-4 border-l-[#7c3aed]">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-[#7c3aed]" />
            <CardTitle className="text-lg">AI Briefing</CardTitle>
          </div>
          {briefing && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {!briefingRequested && !briefing && (
          <Button
            onClick={() => setBriefingRequested(true)}
            className="bg-[#7c3aed] hover:bg-[#6d28d9]"
          >
            <Sparkles className="h-4 w-4 mr-2" />
            Generate Briefing
          </Button>
        )}

        {isLoading && (
          <div className="flex items-center gap-3 text-muted-foreground py-4">
            <Loader2 className="h-5 w-5 animate-spin text-[#7c3aed]" />
            <div>
              <p className="font-medium">Generating briefing...</p>
              <p className="text-sm">
                Analyzing customer history, call transcripts, and job records
              </p>
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-sm">Failed to generate briefing.</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => refetch()}
              className="text-red-600 dark:text-red-400"
            >
              Retry
            </Button>
          </div>
        )}

        {briefing && (
          <div className="space-y-3">
            <p className="font-semibold text-sm">{briefing.summary}</p>

            {expanded && (
              <div className="space-y-4 pt-2 border-t">
                {briefing.customerContext && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                      Customer Context
                    </h4>
                    <p className="text-sm">{briefing.customerContext}</p>
                  </div>
                )}

                {briefing.jobHistory && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                      Job History
                    </h4>
                    <p className="text-sm">{briefing.jobHistory}</p>
                  </div>
                )}

                {briefing.sentiment && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                      Sentiment
                    </h4>
                    <p className="text-sm">{briefing.sentiment}</p>
                  </div>
                )}

                {briefing.suggestedApproach && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                      Suggested Approach
                    </h4>
                    <p className="text-sm">{briefing.suggestedApproach}</p>
                  </div>
                )}

                {briefing.followUpOpportunities &&
                  briefing.followUpOpportunities.length > 0 && (
                    <div>
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                        Follow-Up Opportunities
                      </h4>
                      <ul className="list-disc list-inside text-sm space-y-1">
                        {briefing.followUpOpportunities.map((opp, i) => (
                          <li key={i}>{opp}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                <div className="flex items-center justify-between pt-2 border-t">
                  <span className="text-xs text-muted-foreground">
                    Generated at{" "}
                    {new Date(briefing.generatedAt).toLocaleTimeString()}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => refetch()}
                    disabled={isLoading}
                  >
                    {isLoading ? (
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    ) : (
                      <RotateCcw className="h-3 w-3 mr-1" />
                    )}
                    Regenerate
                  </Button>
                </div>
              </div>
            )}

            {!expanded && (
              <Button
                variant="ghost"
                size="sm"
                className="text-[#7c3aed] p-0 h-auto"
                onClick={() => setExpanded(true)}
              >
                Show details
                <ChevronDown className="h-3 w-3 ml-1" />
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// =================== VOICE-TO-JOB-NOTES ===================

function VoiceNotesSection({ jobId, existingNotes }: { jobId: number; existingNotes?: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [transcript, setTranscript] = useState("");
  const [result, setResult] = useState<VoiceNotesResponse | null>(null);

  const processNotesMutation = useMutation({
    mutationFn: async (text: string) => {
      return apiRequest("POST", `/api/jobs/${jobId}/voice-notes`, {
        transcript: text,
      }) as Promise<VoiceNotesResponse>;
    },
    onSuccess: (data) => {
      setResult(data);
      setTranscript("");
      queryClient.invalidateQueries({ queryKey: ["/api/jobs", jobId] });
      toast({
        title: "Notes Processed",
        description: data.fallback
          ? "AI parsing unavailable - raw notes saved"
          : "Voice notes parsed and saved successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Processing Failed",
        description: error?.message || "Could not process voice notes",
        variant: "destructive",
      });
    },
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Mic className="h-5 w-5 text-blue-600" />
          <CardTitle className="text-lg">Voice Notes</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {existingNotes && !result && (
          <div className="bg-muted/50 rounded-md p-3">
            <p className="text-xs font-medium text-muted-foreground mb-1">
              Current Notes
            </p>
            <p className="text-sm whitespace-pre-wrap">{existingNotes}</p>
          </div>
        )}

        <div>
          <Textarea
            placeholder="Dictate your job notes here. Tap the microphone button on your keyboard to use speech-to-text, or type manually."
            className="min-h-[120px]"
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            maxLength={10000}
          />
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-muted-foreground">
              {transcript.length}/10,000 characters
            </span>
            <Button
              onClick={() => processNotesMutation.mutate(transcript)}
              disabled={
                !transcript.trim() || processNotesMutation.isPending
              }
              className="bg-blue-600 hover:bg-blue-700"
            >
              {processNotesMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Brain className="h-4 w-4 mr-2" />
              )}
              {processNotesMutation.isPending
                ? "Processing..."
                : "Process with AI"}
            </Button>
          </div>
        </div>

        {result && result.parsed && (
          <div className="space-y-3 border-t pt-4">
            {result.parsed.completionSummary && (
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md p-3">
                <p className="text-sm font-medium text-green-800 dark:text-green-200">
                  {result.parsed.completionSummary}
                </p>
              </div>
            )}

            {result.parsed.notes && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                  Clean Notes
                </h4>
                <p className="text-sm whitespace-pre-wrap">
                  {result.parsed.notes}
                </p>
              </div>
            )}

            {result.parsed.partsUsed && result.parsed.partsUsed.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                  Parts Used
                </h4>
                <div className="flex flex-wrap gap-2">
                  {result.parsed.partsUsed.map((part, i) => (
                    <Badge key={i} variant="secondary">
                      <Wrench className="h-3 w-3 mr-1" />
                      {part.name}
                      {part.quantity && part.quantity > 1
                        ? ` x${part.quantity}`
                        : ""}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {result.parsed.equipmentInfo && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                  Equipment Info
                </h4>
                <div className="bg-muted/50 rounded-md p-2 font-mono text-sm">
                  {result.parsed.equipmentInfo}
                </div>
              </div>
            )}

            {result.parsed.followUpNeeded && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-3">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
                  <h4 className="text-sm font-semibold text-red-800 dark:text-red-200">
                    Follow-Up Required
                  </h4>
                </div>
                {result.parsed.followUpDescription && (
                  <p className="text-sm text-red-700 dark:text-red-300">
                    {result.parsed.followUpDescription}
                  </p>
                )}
                {result.parsed.estimatedFollowUpCost != null && (
                  <p className="text-sm font-medium text-red-800 dark:text-red-200 mt-1">
                    Estimated cost: $
                    {result.parsed.estimatedFollowUpCost.toFixed(2)}
                  </p>
                )}
              </div>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setResult(null);
                setTranscript("");
              }}
            >
              Re-dictate
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// =================== CUSTOMER ACTIONS (Navigate + On My Way) ===================

function CustomerActionButtons({
  customer,
  jobId,
}: {
  customer: any;
  jobId: number;
}) {
  const { toast } = useToast();

  const customerAddress = [
    customer?.address,
    customer?.city,
    customer?.state,
    customer?.zip,
  ]
    .filter(Boolean)
    .join(", ");

  const sendOnMyWayMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(
        "POST",
        `/api/notifications/customers/${customer.id}/send-sms`,
        {
          message: `Hi ${customer.firstName || "there"}, your technician is on the way! We should be arriving shortly.`,
        }
      );
    },
    onSuccess: () => {
      toast({
        title: "Text Sent",
        description: `"On my way" text sent to ${customer.firstName || "customer"}`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Send",
        description: error?.message || "Could not send text message",
        variant: "destructive",
      });
    },
  });

  const hasAddress = !!customerAddress;
  const hasPhone = !!customer?.phone;

  if (!hasAddress && !hasPhone) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {hasAddress && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            window.open(
              `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(customerAddress)}`,
              "_blank"
            );
          }}
        >
          <MapPin className="h-4 w-4 mr-1" />
          Navigate
        </Button>
      )}

      {hasPhone && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => sendOnMyWayMutation.mutate()}
          disabled={sendOnMyWayMutation.isPending}
        >
          {sendOnMyWayMutation.isPending ? (
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          ) : (
            <Car className="h-4 w-4 mr-1" />
          )}
          {sendOnMyWayMutation.isPending ? "Sending..." : "On My Way"}
        </Button>
      )}
    </div>
  );
}

// =================== JOB TIMER ===================

function JobTimer() {
  const [seconds, setSeconds] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startTimer = useCallback(() => {
    if (isRunning) return;
    setIsRunning(true);
    intervalRef.current = setInterval(() => {
      setSeconds((prev) => prev + 1);
    }, 1000);
  }, [isRunning]);

  const pauseTimer = useCallback(() => {
    setIsRunning(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const resetTimer = useCallback(() => {
    setIsRunning(false);
    setSeconds(0);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  const formatTime = (totalSeconds: number) => {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <Card
      className={
        isRunning
          ? "border-l-4 border-l-green-500"
          : "border-l-4 border-l-gray-300"
      }
    >
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Timer
            className={`h-5 w-5 ${isRunning ? "text-green-600" : "text-muted-foreground"}`}
          />
          <CardTitle className="text-lg">Job Timer</CardTitle>
          {isRunning && (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-center space-y-4">
          <div
            className={`text-4xl font-mono font-bold tabular-nums ${isRunning ? "text-green-600 dark:text-green-400" : "text-foreground"}`}
          >
            {formatTime(seconds)}
          </div>
          <div className="flex items-center justify-center gap-2">
            {!isRunning ? (
              <Button
                onClick={startTimer}
                className="bg-green-600 hover:bg-green-700"
              >
                <Play className="h-4 w-4 mr-1" />
                {seconds > 0 ? "Resume" : "Start"}
              </Button>
            ) : (
              <Button
                onClick={pauseTimer}
                variant="outline"
                className="border-yellow-500 text-yellow-600 hover:bg-yellow-50"
              >
                <Pause className="h-4 w-4 mr-1" />
                Pause
              </Button>
            )}
            <Button
              onClick={resetTimer}
              variant="ghost"
              disabled={seconds === 0}
            >
              <RotateCcw className="h-4 w-4 mr-1" />
              Reset
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// =================== MAIN JOB DETAIL PAGE ===================

export default function JobDetail() {
  const params = useParams();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const jobId = params.id ?? "";
  const isNew = jobId === "new";
  const numericJobId = parseInt(jobId);

  // Fetch job data if editing existing job
  const {
    data: job,
    isLoading,
    error,
  } = useQuery<any>({
    queryKey: ["/api/jobs", numericJobId],
    enabled: !isNew && !!jobId,
  });

  // Generate invoice mutation
  const generateInvoiceMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/jobs/${numericJobId}/generate-invoice`),
    onSuccess: (invoice: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      toast({
        title: "Invoice Created",
        description: `Invoice ${invoice.invoiceNumber} created successfully`,
      });
      navigate(`/invoices/${invoice.id}`);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to generate invoice",
        variant: "destructive",
      });
    },
  });

  // Send follow-up/review request mutation
  const sendFollowUpMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/jobs/${numericJobId}/send-followup`),
    onSuccess: () => {
      toast({
        title: "Follow-up Sent",
        description: "Thank you message sent to customer",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Send",
        description: error?.message || "Could not send follow-up",
        variant: "destructive",
      });
    },
  });

  // Request review mutation
  const requestReviewMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/jobs/${numericJobId}/request-review`),
    onSuccess: () => {
      toast({
        title: "Review Request Sent",
        description: "Review request sent to customer",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Send",
        description: error?.message || "Could not send review request",
        variant: "destructive",
      });
    },
  });

  // Handle loading state
  if (!isNew && isLoading) {
    return (
      <PageLayout title="Job Details">
        <PageTitle
          title="Loading Job..."
          breadcrumbs={[
            { label: "Dashboard", href: "/" },
            { label: "Jobs", href: "/jobs" },
            { label: "Loading...", href: "#" },
          ]}
        />
        <div className="mt-6">
          <SkeletonForm />
        </div>
      </PageLayout>
    );
  }

  // Handle error state
  if (!isNew && error) {
    return (
      <PageLayout title="Job Details">
        <PageTitle
          title="Job Not Found"
          breadcrumbs={[
            { label: "Dashboard", href: "/" },
            { label: "Jobs", href: "/jobs" },
            { label: "Not Found", href: "#" },
          ]}
        />
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-4 text-red-800 dark:text-red-300 mt-4">
          We couldn't find the job you're looking for. It may have been deleted
          or you might have followed an invalid link.
        </div>
        <div className="mt-4">
          <Button onClick={() => navigate("/jobs")}>Return to Jobs</Button>
        </div>
      </PageLayout>
    );
  }

  const canGenerateInvoice = !isNew && job?.status === "completed";
  const showTimer =
    !isNew &&
    (job?.status === "in_progress" || job?.status === "waiting_parts");

  return (
    <PageLayout title={isNew ? "Create Job" : "Job Details"}>
      <PageTitle
        title={isNew ? "Create New Job" : `Job: ${job?.title || ""}`}
        description={
          !isNew && job?.status === "completed" ? "Completed" : undefined
        }
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "Jobs", href: "/jobs" },
          {
            label: isNew ? "New Job" : job?.title || "Job",
            href: "#",
          },
        ]}
        actions={
          canGenerateInvoice ? (
            <div className="flex gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => requestReviewMutation.mutate()}
                disabled={requestReviewMutation.isPending}
              >
                <Star className="h-4 w-4 mr-1" />
                {requestReviewMutation.isPending ? "Sending..." : "Review"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => sendFollowUpMutation.mutate()}
                disabled={sendFollowUpMutation.isPending}
              >
                <MessageSquare className="h-4 w-4 mr-1" />
                {sendFollowUpMutation.isPending ? "Sending..." : "Thank You"}
              </Button>
              <Button
                size="sm"
                onClick={() => generateInvoiceMutation.mutate()}
                disabled={generateInvoiceMutation.isPending}
                className="bg-green-600 hover:bg-green-700"
              >
                <FileText className="h-4 w-4 mr-1" />
                {generateInvoiceMutation.isPending
                  ? "Generating..."
                  : "Generate Invoice"}
              </Button>
            </div>
          ) : undefined
        }
      />

      {isNew ? (
        <div className="mt-6">
          <JobForm job={undefined} isEdit={false} />
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {/* Customer Action Buttons (Navigate + On My Way) */}
          {job?.customer && (
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="text-sm text-muted-foreground">
                {job.customer.firstName} {job.customer.lastName}
                {job.customer.phone && (
                  <span className="ml-2">| {job.customer.phone}</span>
                )}
                {job.customer.address && (
                  <span className="ml-2">
                    |{" "}
                    {[
                      job.customer.address,
                      job.customer.city,
                      job.customer.state,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </span>
                )}
              </div>
              <CustomerActionButtons
                customer={job.customer}
                jobId={numericJobId}
              />
            </div>
          )}

          {/* AI Briefing Card */}
          <AiBriefingCard jobId={numericJobId} />

          {/* Job Timer — only when in_progress or waiting_parts */}
          {showTimer && <JobTimer />}

          {/* Tabs: Details, Line Items, Timeline, Voice Notes */}
          <Tabs defaultValue="details">
            <TabsList>
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="line-items">Line Items</TabsTrigger>
              <TabsTrigger value="timeline">Timeline</TabsTrigger>
              <TabsTrigger value="voice-notes">Voice Notes</TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="mt-4">
              <JobForm job={job} isEdit={true} />
            </TabsContent>

            <TabsContent value="line-items" className="mt-4">
              {numericJobId && (
                <JobLineItems
                  jobId={numericJobId}
                  readOnly={job?.status === "completed"}
                />
              )}
            </TabsContent>

            <TabsContent value="timeline" className="mt-4">
              {job && <JobProgressTimeline job={job} />}
            </TabsContent>

            <TabsContent value="voice-notes" className="mt-4">
              <VoiceNotesSection
                jobId={numericJobId}
                existingNotes={job?.notes}
              />
            </TabsContent>
          </Tabs>
        </div>
      )}
    </PageLayout>
  );
}
