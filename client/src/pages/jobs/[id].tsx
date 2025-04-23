import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { PageLayout } from "@/components/layout/PageLayout";
import { JobForm } from "@/components/jobs/JobForm";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function JobDetail() {
  const params = useParams();
  const [, navigate] = useLocation();
  const jobId = params.id;
  const isNew = jobId === "new";
  
  // Fetch job data if editing existing job
  const { data: job, isLoading, error } = useQuery({
    queryKey: ['/api/jobs', parseInt(jobId)],
    enabled: !isNew && !!jobId,
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
  
  return (
    <PageLayout title={isNew ? "Create Job" : "Job Details"}>
      <div className="flex items-center mb-6">
        <Button 
          variant="ghost" 
          className="mr-4"
          onClick={() => navigate("/jobs")}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <h1 className="text-2xl font-bold">
          {isNew ? "Create New Job" : `Job: ${job?.title}`}
        </h1>
      </div>
      
      <JobForm job={job} isEdit={!isNew} />
    </PageLayout>
  );
}
