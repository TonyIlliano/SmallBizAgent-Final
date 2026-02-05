import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageLayout } from "@/components/layout/PageLayout";
import { JobForm } from "@/components/jobs/JobForm";
import { JobLineItems } from "@/components/jobs/JobLineItems";
import { Button } from "@/components/ui/button";
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
        <div className="flex items-center mb-6">
          <Button 
            variant="ghost" 
            className="mr-4"
            onClick={() => navigate("/jobs")}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <h1 className="text-2xl font-bold">Loading Job...</h1>
        </div>
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin w-10 h-10 border-4 border-primary rounded-full border-t-transparent"></div>
        </div>
      </PageLayout>
    );
  }
  
  // Handle error state
  if (!isNew && error) {
    return (
      <PageLayout title="Job Details">
        <div className="flex items-center mb-6">
          <Button 
            variant="ghost" 
            className="mr-4"
            onClick={() => navigate("/jobs")}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <h1 className="text-2xl font-bold">Job Not Found</h1>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-md p-4 text-red-800">
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
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center">
          <Button
            variant="ghost"
            className="mr-4"
            onClick={() => navigate("/jobs")}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold">
              {isNew ? "Create New Job" : `Job: ${job?.title}`}
            </h1>
            {!isNew && job?.status === "completed" && (
              <div className="flex items-center text-green-600 text-sm mt-1">
                <CheckCircle className="h-4 w-4 mr-1" />
                Completed
              </div>
            )}
          </div>
        </div>

        {canGenerateInvoice && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => requestReviewMutation.mutate()}
              disabled={requestReviewMutation.isPending}
            >
              <Star className="h-4 w-4 mr-2" />
              {requestReviewMutation.isPending ? "Sending..." : "Request Review"}
            </Button>
            <Button
              variant="outline"
              onClick={() => sendFollowUpMutation.mutate()}
              disabled={sendFollowUpMutation.isPending}
            >
              <MessageSquare className="h-4 w-4 mr-2" />
              {sendFollowUpMutation.isPending ? "Sending..." : "Send Thank You"}
            </Button>
            <Button
              onClick={() => generateInvoiceMutation.mutate()}
              disabled={generateInvoiceMutation.isPending}
              className="bg-green-600 hover:bg-green-700"
            >
              <FileText className="h-4 w-4 mr-2" />
              {generateInvoiceMutation.isPending ? "Generating..." : "Generate Invoice"}
            </Button>
          </div>
        )}
      </div>

      <JobForm job={job} isEdit={!isNew} />

      {/* Line Items section - only show for existing jobs */}
      {!isNew && numericJobId && (
        <JobLineItems
          jobId={numericJobId}
          readOnly={job?.status === "completed"}
        />
      )}
    </PageLayout>
  );
}
