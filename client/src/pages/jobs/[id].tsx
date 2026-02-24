import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageLayout } from "@/components/layout/PageLayout";
import PageTitle from "@/components/PageTitle";
import { JobForm } from "@/components/jobs/JobForm";
import { JobLineItems } from "@/components/jobs/JobLineItems";
import { JobProgressTimeline } from "@/components/jobs/JobProgressTimeline";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SkeletonForm } from "@/components/ui/skeleton-loader";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/api";
import { ArrowLeft, FileText, CheckCircle, MessageSquare, Star } from "lucide-react";

export default function JobDetail() {
  const params = useParams();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const jobId = params.id ?? "";
  const isNew = jobId === "new";
  const numericJobId = parseInt(jobId);

  // Fetch job data if editing existing job
  const { data: job, isLoading, error } = useQuery<any>({
    queryKey: ['/api/jobs', numericJobId],
    enabled: !isNew && !!jobId,
  });

  // Generate invoice mutation
  const generateInvoiceMutation = useMutation({
    mutationFn: () => apiRequest("POST", `/api/jobs/${numericJobId}/generate-invoice`),
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
    mutationFn: () => apiRequest("POST", `/api/jobs/${numericJobId}/send-followup`),
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
    mutationFn: () => apiRequest("POST", `/api/jobs/${numericJobId}/request-review`),
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
          We couldn't find the job you're looking for. It may have been deleted or you might have followed an invalid link.
        </div>
        <div className="mt-4">
          <Button onClick={() => navigate("/jobs")}>
            Return to Jobs
          </Button>
        </div>
      </PageLayout>
    );
  }

  const canGenerateInvoice = !isNew && job?.status === "completed";

  return (
    <PageLayout title={isNew ? "Create Job" : "Job Details"}>
      <PageTitle
        title={isNew ? "Create New Job" : `Job: ${job?.title || ""}`}
        description={
          !isNew && job?.status === "completed"
            ? "✓ Completed"
            : undefined
        }
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "Jobs", href: "/jobs" },
          { label: isNew ? "New Job" : (job?.title || "Job"), href: "#" },
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
                {generateInvoiceMutation.isPending ? "Generating..." : "Generate Invoice"}
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
        <Tabs defaultValue="details" className="mt-6">
          <TabsList>
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="line-items">Line Items</TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
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
        </Tabs>
      )}
    </PageLayout>
  );
}
