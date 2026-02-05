import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { formatTime } from "@/lib/utils";
import { Plus, Briefcase, ArrowRight, Clock } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton-loader";

interface JobsTableProps {
  businessId?: number | null;
  limit?: number;
}

export function JobsTable({ businessId, limit }: JobsTableProps) {
  const { data: jobs = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/jobs', { businessId, status: 'in_progress,waiting_parts' }],
    enabled: !!businessId,
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'in_progress':
        return <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-0 text-xs font-medium">In Progress</Badge>;
      case 'waiting_parts':
        return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-0 text-xs font-medium">Waiting Parts</Badge>;
      case 'completed':
        return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0 text-xs font-medium">Completed</Badge>;
      case 'pending':
        return <Badge className="bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-400 border-0 text-xs font-medium">Pending</Badge>;
      case 'cancelled':
        return <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-0 text-xs font-medium">Cancelled</Badge>;
      default:
        return <Badge className="text-xs font-medium">{status}</Badge>;
    }
  };

  const limitedJobs = limit && jobs ? jobs.slice(0, limit) : jobs;

  return (
    <Card className="border-border bg-card shadow-sm rounded-xl overflow-hidden">
      <CardHeader className="px-6 py-5 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Briefcase className="h-5 w-5 text-foreground" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">Active Jobs</h3>
              <p className="text-sm text-muted-foreground">Currently in-progress</p>
            </div>
          </div>
          <Link href="/jobs/new">
            <Button size="sm" className="h-9 rounded-lg">
              <Plus className="h-4 w-4 mr-1" />
              New Job
            </Button>
          </Link>
        </div>
      </CardHeader>
      <div className="overflow-x-auto">
        {isLoading ? (
          <div className="p-6 space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-10 w-10 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-3 w-32" />
                </div>
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
            ))}
          </div>
        ) : limitedJobs && limitedJobs.length > 0 ? (
          <table className="min-w-full">
            <thead className="bg-muted/50">
              <tr>
                <th scope="col" className="px-6 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Job
                </th>
                <th scope="col" className="px-6 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Customer
                </th>
                <th scope="col" className="px-6 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Status
                </th>
                <th scope="col" className="px-6 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Technician
                </th>
                <th scope="col" className="px-6 py-3.5 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Est. Complete
                </th>
                <th scope="col" className="relative px-6 py-3.5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {limitedJobs.map((job: any) => (
                <tr key={job.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-semibold text-foreground">{job.title}</div>
                    <div className="text-sm text-muted-foreground truncate max-w-[200px]">{job.description}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-foreground">
                      {job.customer?.firstName} {job.customer?.lastName}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getStatusBadge(job.status)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <div className="h-7 w-7 rounded-lg bg-muted flex items-center justify-center text-foreground text-xs font-semibold">
                        {job.staff?.firstName?.[0]}{job.staff?.lastName?.[0]}
                      </div>
                      <span className="font-medium text-foreground">{job.staff?.firstName} {job.staff?.lastName?.[0]}.</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      {job.estimatedCompletion
                        ? formatTime(new Date(job.estimatedCompletion))
                        : "TBD"}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <Link href={`/jobs/${job.id}`}>
                      <Button variant="ghost" size="sm" className="h-8 text-foreground hover:bg-muted">
                        Update
                        <ArrowRight className="h-4 w-4 ml-1" />
                      </Button>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="py-12 text-center">
            <div className="p-4 rounded-full bg-muted inline-block mb-4">
              <Briefcase className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium text-foreground">No active jobs</p>
            <p className="text-sm text-muted-foreground mt-1">Create a new job to get started</p>
          </div>
        )}
      </div>
      {jobs && jobs.length > 0 && (
        <CardFooter className="bg-muted/50 px-6 py-4 border-t border-border">
          <div className="flex justify-between items-center w-full">
            <div className="text-sm text-muted-foreground">
              Showing <span className="font-semibold text-foreground">{limitedJobs?.length || 0}</span> of{" "}
              <span className="font-semibold text-foreground">{jobs.length}</span> active jobs
            </div>
            <Link href="/jobs">
              <Button variant="ghost" size="sm" className="h-9 text-foreground hover:bg-muted group">
                View all jobs
                <ArrowRight className="h-4 w-4 ml-1 group-hover:translate-x-0.5 transition-transform" />
              </Button>
            </Link>
          </div>
        </CardFooter>
      )}
    </Card>
  );
}
