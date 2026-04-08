import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { PageLayout } from "@/components/layout/PageLayout";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate, formatPhoneNumber } from "@/lib/utils";
import { QueryErrorBanner } from "@/components/ui/query-error-banner";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import {
  PlusCircle, Briefcase, ChevronRight as ChevronRightIcon, FileText,
  Calendar as CalendarIcon, List, ChevronLeft, ChevronRight as ChevronR,
} from "lucide-react";
import { ExportButton } from "@/components/ui/export-button";
import { FeatureTip } from "@/components/ui/feature-tip";
import { SkeletonTable } from "@/components/ui/skeleton-loader";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useBusinessHours } from "@/hooks/use-business-hours";
import { QuickJobStatsBar } from "@/components/jobs/QuickJobStatsBar";
import { StaffFilterPills } from "@/components/appointments/StaffFilterPills";
import {
  getStaffColor, formatHour, getJobStatusColor, STAFF_COLORS,
} from "@/lib/scheduling-utils";
import { isJobCategory } from "@shared/industry-categories";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────

interface PopulatedJob {
  id: number;
  title: string;
  description?: string;
  status: string;
  scheduledDate?: string;
  customerId: number;
  staffId?: number;
  appointmentId?: number;
  customer?: { firstName: string; lastName?: string; phone?: string };
  staff?: { id: number; firstName: string; lastName?: string };
  appointment?: { id: number; startDate: string; endDate: string; status: string; serviceId?: number } | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function getWeekDates(date: Date): Date[] {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day); // Sunday
  const week: Date[] = [];
  for (let i = 0; i < 7; i++) {
    week.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return week;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  waiting_parts: "Waiting Parts",
  completed: "Completed",
  cancelled: "Cancelled",
};

// ─── Main Component ──────────────────────────────────────────────────────

export default function Jobs() {
  const [, navigate] = useLocation();
  const [statusFilter, setStatusFilter] = useState<string>("");
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const businessId = user?.businessId;

  // Business data for industry check
  const { data: business } = useQuery<any>({ queryKey: ['/api/business'], enabled: !!businessId });
  const isJobBiz = isJobCategory(business?.industry);

  // Calendar state
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>(isJobBiz ? 'calendar' : 'list');
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [calendarView, setCalendarView] = useState<'week' | 'day'>('week');

  // Staff visibility
  const [visibleStaffIds, setVisibleStaffIds] = useState<Set<number | null>>(new Set());
  const [staffInitialized, setStaffInitialized] = useState(false);

  // Business hours for calendar grid
  const { hourStart, hourEnd, labels, timezone } = useBusinessHours();

  // Query params
  const queryParams: any = { businessId };
  if (statusFilter) queryParams.status = statusFilter;

  // Fetch jobs
  const { data: jobs = [], isLoading, isError, error: queryError, refetch } = useQuery<PopulatedJob[]>({
    queryKey: ['/api/jobs', queryParams],
  });

  // Fetch staff
  const { data: staffMembers = [] } = useQuery<any[]>({
    queryKey: ['/api/staff'],
    enabled: !!businessId,
  });

  // Initialize staff visibility
  if (!staffInitialized && staffMembers.length > 0) {
    const allIds = new Set<number | null>(staffMembers.filter((s: any) => s.active !== false).map((s: any) => s.id));
    allIds.add(null); // unassigned
    setVisibleStaffIds(allIds);
    setStaffInitialized(true);
  }

  // Staff counts for filter pills
  const staffCounts = useMemo(() => {
    const counts = new Map<number | null, number>();
    jobs.forEach(j => {
      if (j.status !== 'cancelled') {
        const key = j.staffId || null;
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    });
    return counts;
  }, [jobs]);

  // ─── Update default viewMode when business data loads ─────────────
  useMemo(() => {
    if (business && !isJobBiz && viewMode === 'calendar') {
      // Non-job businesses default to list
    }
  }, [business, isJobBiz]);

  // ─── Status Badge ─────────────────────────────────────────────────
  const getStatusBadge = (status: string) => {
    const colors = getJobStatusColor(status);
    return (
      <Badge className={`${colors.bg} ${colors.text} hover:${colors.bg} border-0`}>
        {STATUS_LABELS[status] || status}
      </Badge>
    );
  };

  // ─── Navigation ───────────────────────────────────────────────────
  const goToday = () => setCurrentDate(new Date());
  const goPrev = () => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() - (calendarView === 'week' ? 7 : 1));
    setCurrentDate(d);
  };
  const goNext = () => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + (calendarView === 'week' ? 7 : 1));
    setCurrentDate(d);
  };

  // ─── Calendar Data ────────────────────────────────────────────────
  const weekDates = useMemo(() => getWeekDates(currentDate), [currentDate]);

  const calendarJobs = useMemo(() => {
    return jobs.filter(j => {
      if (j.status === 'cancelled') return false;
      if (!visibleStaffIds.has(j.staffId || null)) return false;
      return true;
    });
  }, [jobs, visibleStaffIds]);

  // Map jobs to time positions
  const getJobPosition = useCallback((job: PopulatedJob) => {
    let startDate: Date;
    let endDate: Date;

    if (job.appointment?.startDate) {
      startDate = new Date(job.appointment.startDate);
      endDate = new Date(job.appointment.endDate);
    } else if (job.scheduledDate) {
      startDate = new Date(job.scheduledDate + 'T09:00:00');
      endDate = new Date(startDate.getTime() + 60 * 60 * 1000); // 1 hour default
    } else {
      return null;
    }

    const startMinutes = startDate.getHours() * 60 + startDate.getMinutes();
    const endMinutes = endDate.getHours() * 60 + endDate.getMinutes();
    const topPx = ((startMinutes - hourStart * 60) / 60) * 64; // 64px per hour
    const heightPx = Math.max(((endMinutes - startMinutes) / 60) * 64, 28); // min 28px

    return { startDate, endDate, topPx, heightPx };
  }, [hourStart]);

  // ─── Table columns (list view) ───────────────────────────────────
  const columns = [
    {
      header: "Job",
      accessorKey: "title",
      cell: (job: PopulatedJob) => (
        <div>
          <div className="font-medium">{job.title}</div>
          {job.description && <div className="text-sm text-gray-500 truncate max-w-[200px]">{job.description}</div>}
        </div>
      ),
    },
    {
      header: "Customer",
      accessorKey: "customer",
      cell: (job: PopulatedJob) => (
        <div>
          <div className="font-medium">{job.customer?.firstName} {job.customer?.lastName}</div>
          <div className="text-sm text-gray-500">{formatPhoneNumber(job.customer?.phone || '')}</div>
        </div>
      ),
    },
    {
      header: "Scheduled",
      accessorKey: "scheduledDate",
      cell: (job: PopulatedJob) => {
        if (job.appointment?.startDate) {
          const d = new Date(job.appointment.startDate);
          return (
            <div>
              <div className="font-medium">{d.toLocaleDateString()}</div>
              <div className="text-sm text-gray-500">{d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</div>
            </div>
          );
        }
        return job.scheduledDate ? formatDate(job.scheduledDate) : 'Not scheduled';
      },
    },
    {
      header: labels.providerLabel,
      accessorKey: "staff",
      cell: (job: PopulatedJob) => (
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
      cell: (job: PopulatedJob) => getStatusBadge(job.status),
    },
    {
      header: "Actions",
      accessorKey: "actions",
      cell: (job: PopulatedJob) => (
        <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); navigate(`/jobs/${job.id}`); }}>
          View Details
        </Button>
      ),
    },
  ];

  // ─── Calendar Job Card ────────────────────────────────────────────
  const JobCard = ({ job }: { job: PopulatedJob }) => {
    const pos = getJobPosition(job);
    if (!pos) return null;
    const colors = getJobStatusColor(job.status);
    const staffColor = job.staffId ? getStaffColor(job.staffId) : STAFF_COLORS[0];
    const customerName = job.customer ? `${job.customer.firstName} ${job.customer.lastName || ''}`.trim() : '';

    return (
      <div
        className={cn(
          "absolute left-1 right-1 rounded-md border-l-[3px] px-1.5 py-0.5 overflow-hidden cursor-pointer hover:ring-2 hover:ring-primary/30 transition-shadow z-10",
          colors.bg, colors.border
        )}
        style={{ top: `${pos.topPx}px`, height: `${pos.heightPx}px` }}
        onClick={() => navigate(`/jobs/${job.id}`)}
      >
        <div className="flex items-center gap-1 min-w-0">
          <div className={cn("h-1.5 w-1.5 rounded-full flex-shrink-0", colors.dot)} />
          <span className="text-[11px] font-semibold truncate">{customerName}</span>
        </div>
        {pos.heightPx > 36 && (
          <div className="text-[10px] text-gray-600 truncate">{job.title}</div>
        )}
        {pos.heightPx > 52 && (
          <div className="text-[10px] text-gray-500 truncate">
            {STATUS_LABELS[job.status]}
            {job.staff ? ` • ${job.staff.firstName}` : ''}
          </div>
        )}
      </div>
    );
  };

  // ─── Calendar Column (one day) ────────────────────────────────────
  const DayColumn = ({ date, jobs: dayJobs }: { date: Date; jobs: PopulatedJob[] }) => {
    const isToday = isSameDay(date, new Date());
    const dayStr = date.toLocaleDateString('en-US', { weekday: 'short' });
    const dateStr = date.getDate().toString();

    return (
      <div className="flex-1 min-w-[120px] border-r border-gray-100 last:border-r-0">
        {/* Day header */}
        <div className={cn(
          "sticky top-0 z-20 bg-white border-b text-center py-1.5",
          isToday && "bg-primary/5"
        )}>
          <div className="text-[11px] text-gray-500 uppercase">{dayStr}</div>
          <div className={cn(
            "text-lg font-bold",
            isToday ? "text-primary" : "text-gray-900"
          )}>
            {dateStr}
          </div>
        </div>
        {/* Time grid */}
        <div className="relative" style={{ height: `${(hourEnd - hourStart) * 64}px` }}>
          {dayJobs.map(job => <JobCard key={job.id} job={job} />)}
        </div>
      </div>
    );
  };

  // ─── Calendar View ────────────────────────────────────────────────
  const CalendarView = () => {
    // Group jobs by day
    const jobsByDay = useMemo(() => {
      const map = new Map<string, PopulatedJob[]>();
      calendarJobs.forEach(job => {
        const pos = getJobPosition(job);
        if (!pos) return;
        const key = pos.startDate.toDateString();
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(job);
      });
      return map;
    }, [calendarJobs]);

    const displayDates = calendarView === 'week' ? weekDates : [currentDate];

    return (
      <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
        {/* Calendar header */}
        <div className="flex items-center justify-between px-4 py-2 border-b">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={goPrev}><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="outline" size="sm" onClick={goToday}>Today</Button>
            <Button variant="outline" size="sm" onClick={goNext}><ChevronR className="h-4 w-4" /></Button>
            <span className="text-sm font-medium text-gray-700 ml-2">
              {currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant={calendarView === 'day' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setCalendarView('day')}
            >
              Day
            </Button>
            <Button
              variant={calendarView === 'week' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setCalendarView('week')}
            >
              Week
            </Button>
          </div>
        </div>

        {/* Grid */}
        <div className="flex overflow-x-auto">
          {/* Time gutter */}
          <div className="w-14 flex-shrink-0 border-r border-gray-200">
            <div className="h-[52px] border-b" /> {/* header spacer */}
            <div className="relative" style={{ height: `${(hourEnd - hourStart) * 64}px` }}>
              {Array.from({ length: hourEnd - hourStart }, (_, i) => (
                <div
                  key={i}
                  className="absolute right-2 text-[11px] text-gray-400 -translate-y-1/2"
                  style={{ top: `${i * 64}px` }}
                >
                  {formatHour(hourStart + i)}
                </div>
              ))}
            </div>
          </div>

          {/* Day columns */}
          {displayDates.map(date => (
            <DayColumn
              key={date.toDateString()}
              date={date}
              jobs={jobsByDay.get(date.toDateString()) || []}
            />
          ))}
        </div>

        {/* Hour lines */}
        {/* Note: hour grid lines are implied by the card positioning */}
      </div>
    );
  };

  // ─── Render ───────────────────────────────────────────────────────
  return (
    <PageLayout title={isJobBiz ? "Schedule" : "Jobs"}>
      {isError && <QueryErrorBanner error={queryError} onRetry={() => refetch()} />}
      <FeatureTip
        tipId="jobs-workflow"
        title={isJobBiz ? "Your job schedule" : "Track jobs from start to finish"}
        description={
          isJobBiz
            ? "View your schedule, update job status, and your customers get automatic SMS updates."
            : "Assign technicians, update status as work progresses, and convert completed jobs into invoices with one click."
        }
        icon={FileText}
      />

      {/* Quick Stats */}
      <QuickJobStatsBar jobs={jobs} labels={labels} />

      {/* Staff Filter Pills */}
      {staffMembers.length > 0 && viewMode === 'calendar' && (
        <StaffFilterPills
          staffMembers={staffMembers.filter((s: any) => s.active !== false)}
          visibleStaffIds={visibleStaffIds}
          onToggle={(id) => {
            const next = new Set(visibleStaffIds);
            if (next.has(id)) next.delete(id); else next.add(id);
            setVisibleStaffIds(next);
          }}
          onShowAll={() => {
            const allIds = new Set<number | null>(staffMembers.filter((s: any) => s.active !== false).map((s: any) => s.id));
            allIds.add(null);
            setVisibleStaffIds(allIds);
          }}
          appointmentCounts={staffCounts}
        />
      )}

      {/* Header with view toggle */}
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-2xl font-bold">{isJobBiz ? "Job Schedule" : "Job Management"}</h2>
          <p className="text-gray-500">{isJobBiz ? "Manage your daily jobs and crew" : "Manage all your ongoing and completed jobs"}</p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center border rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode('calendar')}
              className={cn(
                "px-3 py-1.5 text-sm transition-colors",
                viewMode === 'calendar' ? "bg-primary text-white" : "bg-white text-gray-600 hover:bg-gray-50"
              )}
            >
              <CalendarIcon className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={cn(
                "px-3 py-1.5 text-sm transition-colors",
                viewMode === 'list' ? "bg-primary text-white" : "bg-white text-gray-600 hover:bg-gray-50"
              )}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
          <ExportButton endpoint="/api/export/jobs" filename="jobs.csv" />
          <Link href="/jobs/new">
            <Button className="flex items-center">
              <PlusCircle className="mr-2 h-4 w-4" />
              New Job
            </Button>
          </Link>
        </div>
      </div>

      {/* View content */}
      {viewMode === 'calendar' ? (
        isLoading ? (
          <div className="bg-white rounded-lg shadow-sm border p-12 text-center">
            <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto" />
            <p className="text-gray-500 mt-4">Loading schedule...</p>
          </div>
        ) : (
          <CalendarView />
        )
      ) : (
        /* List view */
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <div className="p-4 border-b flex justify-between items-center">
            <h3 className="text-lg font-medium">All Jobs</h3>
            <div className="w-64">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger><SelectValue placeholder="Filter by status" /></SelectTrigger>
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
            <SkeletonTable rows={6} />
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
            <div className="flex flex-col items-center justify-center p-12 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 mb-4">
                <Briefcase className="h-8 w-8 text-primary" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">
                {statusFilter ? "No matching jobs" : "Track your work with jobs"}
              </h3>
              <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
                {statusFilter
                  ? `No jobs with status "${statusFilter}". Try a different filter.`
                  : "Create jobs to track service requests, assign technicians, and manage your workflow from start to finish. Jobs can be converted into invoices when complete."}
              </p>
              {!statusFilter && (
                <Link href="/jobs/new">
                  <Button className="mt-6">Create Job</Button>
                </Link>
              )}
            </div>
          )}
        </div>
      )}
    </PageLayout>
  );
}
