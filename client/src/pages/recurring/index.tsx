import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageLayout } from "@/components/layout/PageLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Plus,
  MoreVertical,
  Pause,
  Play,
  Trash2,
  Edit,
  Calendar,
  RefreshCw,
  Clock,
  DollarSign,
  User,
  Briefcase,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { RecurringScheduleForm } from "@/components/recurring/RecurringScheduleForm";
import { Skeleton } from "@/components/ui/skeleton-loader";

interface RecurringSchedule {
  id: number;
  businessId: number;
  customerId: number;
  name: string;
  frequency: string;
  interval: number;
  dayOfWeek?: number;
  dayOfMonth?: number;
  startDate: string;
  endDate?: string;
  nextRunDate?: string;
  jobTitle: string;
  jobDescription?: string;
  autoCreateInvoice: boolean;
  invoiceAmount?: number;
  status: string;
  totalJobsCreated: number;
  customer?: {
    id: number;
    firstName: string;
    lastName: string;
  };
  service?: {
    id: number;
    name: string;
  };
  staff?: {
    id: number;
    firstName: string;
    lastName: string;
  };
}

const frequencyLabels: Record<string, string> = {
  daily: "Daily",
  weekly: "Weekly",
  biweekly: "Every 2 Weeks",
  monthly: "Monthly",
  quarterly: "Quarterly",
  yearly: "Yearly",
};

const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function RecurringSchedulesPage() {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<RecurringSchedule | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: schedules = [], isLoading } = useQuery<RecurringSchedule[]>({
    queryKey: ["/api/recurring-schedules", { businessId: 1 }],
  });

  const pauseMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("POST", `/api/recurring-schedules/${id}/pause`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recurring-schedules"] });
      toast({ title: "Schedule paused", variant: "default" });
    },
  });

  const resumeMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("POST", `/api/recurring-schedules/${id}/resume`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recurring-schedules"] });
      toast({ title: "Schedule resumed", variant: "default" });
    },
  });

  const runNowMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("POST", `/api/recurring-schedules/${id}/run`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recurring-schedules"] });
      queryClient.invalidateQueries({ queryKey: ["/api/jobs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      toast({ title: "Job and invoice created!", variant: "default" });
    },
    onError: () => {
      toast({ title: "Failed to run schedule", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/recurring-schedules/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recurring-schedules"] });
      toast({ title: "Schedule deleted", variant: "default" });
    },
  });

  const handleEdit = (schedule: RecurringSchedule) => {
    setEditingSchedule(schedule);
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setEditingSchedule(null);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0">Active</Badge>;
      case "paused":
        return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-0">Paused</Badge>;
      case "completed":
        return <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-0">Completed</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  const formatScheduleDetails = (schedule: RecurringSchedule) => {
    let details = frequencyLabels[schedule.frequency] || schedule.frequency;

    if (schedule.frequency === "weekly" && schedule.dayOfWeek !== undefined) {
      details += ` on ${dayNames[schedule.dayOfWeek]}`;
    } else if (schedule.frequency === "monthly" && schedule.dayOfMonth) {
      details += ` on day ${schedule.dayOfMonth}`;
    }

    return details;
  };

  return (
    <PageLayout title="Recurring Jobs & Invoices">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-muted-foreground">
              Automate repeat services with scheduled jobs and invoices
            </p>
          </div>
          <Button onClick={() => setIsFormOpen(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            New Recurring Schedule
          </Button>
        </div>

        {/* Schedules List */}
        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="p-6">
                <div className="space-y-4">
                  <Skeleton className="h-6 w-48" />
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-24" />
                </div>
              </Card>
            ))}
          </div>
        ) : schedules.length === 0 ? (
          <Card className="p-12 text-center">
            <div className="flex flex-col items-center gap-4">
              <div className="p-4 rounded-full bg-muted">
                <RefreshCw className="h-8 w-8 text-muted-foreground" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">No recurring schedules yet</h3>
                <p className="text-muted-foreground mt-1">
                  Create your first recurring schedule to automate repeat jobs and invoices
                </p>
              </div>
              <Button onClick={() => setIsFormOpen(true)} className="mt-2 gap-2">
                <Plus className="h-4 w-4" />
                Create Schedule
              </Button>
            </div>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {schedules.map((schedule) => (
              <Card key={schedule.id} className="overflow-hidden">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <h3 className="font-semibold text-foreground">{schedule.name}</h3>
                      {getStatusBadge(schedule.status)}
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => handleEdit(schedule)}>
                          <Edit className="h-4 w-4 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        {schedule.status === "active" ? (
                          <DropdownMenuItem onClick={() => pauseMutation.mutate(schedule.id)}>
                            <Pause className="h-4 w-4 mr-2" />
                            Pause
                          </DropdownMenuItem>
                        ) : schedule.status === "paused" ? (
                          <DropdownMenuItem onClick={() => resumeMutation.mutate(schedule.id)}>
                            <Play className="h-4 w-4 mr-2" />
                            Resume
                          </DropdownMenuItem>
                        ) : null}
                        {schedule.status === "active" && (
                          <DropdownMenuItem onClick={() => runNowMutation.mutate(schedule.id)}>
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Run Now
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          className="text-red-600 focus:text-red-600"
                          onClick={() => deleteMutation.mutate(schedule.id)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Customer */}
                  <div className="flex items-center gap-2 text-sm">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="text-foreground font-medium">
                      {schedule.customer?.firstName} {schedule.customer?.lastName}
                    </span>
                  </div>

                  {/* Job Title */}
                  <div className="flex items-center gap-2 text-sm">
                    <Briefcase className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">{schedule.jobTitle}</span>
                  </div>

                  {/* Frequency */}
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-muted-foreground">{formatScheduleDetails(schedule)}</span>
                  </div>

                  {/* Next Run */}
                  {schedule.nextRunDate && schedule.status === "active" && (
                    <div className="flex items-center gap-2 text-sm">
                      <Clock className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">
                        Next: {new Date(schedule.nextRunDate).toLocaleDateString()}
                      </span>
                    </div>
                  )}

                  {/* Invoice Amount */}
                  {schedule.autoCreateInvoice && schedule.invoiceAmount && (
                    <div className="flex items-center gap-2 text-sm">
                      <DollarSign className="h-4 w-4 text-muted-foreground" />
                      <span className="font-semibold text-foreground">
                        ${schedule.invoiceAmount.toFixed(2)}
                      </span>
                      <span className="text-muted-foreground">per occurrence</span>
                    </div>
                  )}

                  {/* Stats */}
                  <div className="pt-3 border-t border-border flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Jobs created</span>
                    <span className="font-semibold text-foreground">{schedule.totalJobsCreated}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Create/Edit Dialog */}
        <Dialog open={isFormOpen} onOpenChange={handleCloseForm}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingSchedule ? "Edit Recurring Schedule" : "Create Recurring Schedule"}
              </DialogTitle>
            </DialogHeader>
            <RecurringScheduleForm
              schedule={editingSchedule}
              onSuccess={handleCloseForm}
              onCancel={handleCloseForm}
            />
          </DialogContent>
        </Dialog>
      </div>
    </PageLayout>
  );
}
