import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { formatTime } from "@/lib/utils";
import { Plus } from "lucide-react";

interface JobsTableProps {
  businessId?: number;
  limit?: number;
}

export function JobsTable({ businessId = 1, limit }: JobsTableProps) {
  const { data: jobs, isLoading } = useQuery({
    queryKey: ['/api/jobs', { businessId, status: 'in_progress,waiting_parts' }],
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'in_progress':
        return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">In Progress</Badge>;
      case 'waiting_parts':
        return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Waiting Parts</Badge>;
      case 'completed':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Completed</Badge>;
      case 'pending':
        return <Badge className="bg-gray-100 text-gray-800 hover:bg-gray-100">Pending</Badge>;
      case 'cancelled':
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Cancelled</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const limitedJobs = limit && jobs ? jobs.slice(0, limit) : jobs;

  return (
    <Card>
      <CardHeader className="px-4 py-5 sm:px-6 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-medium text-gray-900">Active Jobs</h3>
            <p className="text-sm text-gray-500 mt-1">Currently in-progress jobs</p>
          </div>
          <div>
            <Link href="/jobs/new">
              <Button size="sm" className="h-8">
                <Plus className="-ml-0.5 mr-2 h-4 w-4" />
                New Job
              </Button>
            </Link>
          </div>
        </div>
      </CardHeader>
      <div className="overflow-x-auto">
        {isLoading ? (
          <div className="p-8 text-center">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto"></div>
            <p className="text-sm text-gray-500 mt-2">Loading jobs...</p>
          </div>
        ) : limitedJobs && limitedJobs.length > 0 ? (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Job
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Customer
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Technician
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Est. Complete
                </th>
                <th scope="col" className="relative px-6 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {limitedJobs.map((job: any) => (
                <tr key={job.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{job.title}</div>
                    <div className="text-sm text-gray-500">{job.description}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {job.customer?.firstName} {job.customer?.lastName}
                    </div>
                    <div className="text-sm text-gray-500">
                      {job.customer?.notes?.split('•')[1] || ''}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getStatusBadge(job.status)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <div className="flex items-center">
                      <div className="h-6 w-6 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 text-xs font-medium mr-2">
                        {job.staff?.firstName?.[0]}{job.staff?.lastName?.[0]}
                      </div>
                      {job.staff?.firstName} {job.staff?.lastName?.[0]}.
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {job.estimatedCompletion 
                      ? formatTime(new Date(job.estimatedCompletion)) 
                      : "TBD"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <Link href={`/jobs/${job.id}`}>
                      <a className="text-primary-600 hover:text-primary-900">Update</a>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-8 text-center">
            <p className="text-sm text-gray-500">No active jobs found.</p>
          </div>
        )}
      </div>
      {jobs && jobs.length > 0 && (
        <CardFooter className="bg-gray-50 px-4 py-4 sm:px-6 border-t border-gray-200">
          <div className="flex justify-between items-center w-full">
            <div className="text-sm text-gray-700">
              Showing <span className="font-medium">{limitedJobs?.length || 0}</span> of{" "}
              <span className="font-medium">{jobs.length}</span> active jobs
            </div>
            <div>
              <Link href="/jobs">
                <a className="text-sm font-medium text-primary-600 hover:text-primary-500">
                  View all jobs →
                </a>
              </Link>
            </div>
          </div>
        </CardFooter>
      )}
    </Card>
  );
}
