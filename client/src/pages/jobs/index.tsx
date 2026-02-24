import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { PageLayout } from "@/components/layout/PageLayout";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatPhoneNumber } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { PlusCircle, Briefcase, ChevronRight as ChevronRightIcon } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function Jobs() {
  const [, navigate] = useLocation();
  const [statusFilter, setStatusFilter] = useState<string>("");
  const { user } = useAuth();
  const businessId = user?.businessId;

  // Build query parameters
  const queryParams: any = { businessId };
  if (statusFilter) {
    queryParams.status = statusFilter;
  }
  
  // Fetch jobs
  const { data: jobs = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/jobs', queryParams],
  });
  
  // Status badge component
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge className="bg-gray-100 text-gray-800 hover:bg-gray-100">Pending</Badge>;
      case 'in_progress':
        return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">In Progress</Badge>;
      case 'waiting_parts':
        return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Waiting Parts</Badge>;
      case 'completed':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Completed</Badge>;
      case 'cancelled':
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Cancelled</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };
  
  // Table columns
  const columns = [
    {
      header: "Job",
      accessorKey: "title",
      cell: (job: any) => (
        <div>
          <div className="font-medium">{job.title}</div>
          <div className="text-sm text-gray-500">{job.description}</div>
        </div>
      ),
    },
    {
      header: "Customer",
      accessorKey: "customer",
      cell: (job: any) => (
        <div>
          <div className="font-medium">
            {job.customer?.firstName} {job.customer?.lastName}
          </div>
          <div className="text-sm text-gray-500">
            {formatPhoneNumber(job.customer?.phone || '')}
          </div>
        </div>
      ),
    },
    {
      header: "Scheduled Date",
      accessorKey: "scheduledDate",
      cell: (job: any) => job.scheduledDate ? formatDate(job.scheduledDate) : 'Not scheduled',
    },
    {
      header: "Technician",
      accessorKey: "staff",
      cell: (job: any) => (
        job.staff ? (
          <div className="flex items-center">
            <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-800 font-medium mr-2">
              {job.staff.firstName?.[0]}{job.staff.lastName?.[0]}
            </div>
            <span>{job.staff.firstName} {job.staff.lastName}</span>
          </div>
        ) : (
          <span className="text-gray-500">Unassigned</span>
        )
      ),
    },
    {
      header: "Status",
      accessorKey: "status",
      cell: (job: any) => getStatusBadge(job.status),
    },
    {
      header: "Actions",
      accessorKey: "actions",
      cell: (job: any) => (
        <div className="flex items-center space-x-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/jobs/${job.id}`);
            }}
          >
            View Details
          </Button>
        </div>
      ),
    },
  ];
  
  return (
    <PageLayout title="Jobs">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold">Job Management</h2>
          <p className="text-gray-500">Manage all your ongoing and completed jobs</p>
        </div>
        <Link href="/jobs/new">
          <Button className="flex items-center">
            <PlusCircle className="mr-2 h-4 w-4" />
            New Job
          </Button>
        </Link>
      </div>
      
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        <div className="p-4 border-b flex justify-between items-center">
          <h3 className="text-lg font-medium">All Jobs</h3>
          
          <div className="w-64">
            <Select 
              value={statusFilter} 
              onValueChange={setStatusFilter}
            >
              <SelectTrigger>
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Jobs</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="waiting_parts">Waiting Parts</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        
        {isLoading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin w-10 h-10 border-4 border-primary rounded-full border-t-transparent"></div>
          </div>
        ) : jobs && jobs.length > 0 ? (
          <DataTable
            columns={columns}
            data={jobs}
            onRowClick={(job) => navigate(`/jobs/${job.id}`)}
            mobileCard={(job: any) => (
              <div className="p-4 flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{job.title}</div>
                  <div className="text-sm text-muted-foreground">
                    {job.customer?.firstName} {job.customer?.lastName}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    {getStatusBadge(job.status)}
                    {job.staff && (
                      <span className="text-xs text-muted-foreground">
                        {job.staff.firstName} {job.staff.lastName?.[0]}.
                      </span>
                    )}
                  </div>
                </div>
                <ChevronRightIcon className="h-5 w-5 text-muted-foreground flex-shrink-0 ml-2" />
              </div>
            )}
          />
        ) : (
          <div className="flex flex-col items-center justify-center p-8 text-center h-64">
            <Briefcase className="h-12 w-12 text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900">No jobs found</h3>
            <p className="mt-1 text-sm text-gray-500">
              {statusFilter ? 
                `There are no jobs with status "${statusFilter}".` : 
                "There are no jobs in the system yet."}
            </p>
            <Link href="/jobs/new">
              <Button className="mt-4">
                Create Your First Job
              </Button>
            </Link>
          </div>
        )}
      </div>
    </PageLayout>
  );
}
