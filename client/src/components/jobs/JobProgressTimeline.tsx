import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import {
  Clock,
  Wrench,
  Package,
  CheckCircle2,
  XCircle,
  FileText,
  CalendarPlus,
} from "lucide-react";

interface JobProgressTimelineProps {
  job: any;
}

const STATUS_ORDER = ["pending", "in_progress", "waiting_parts", "completed"];
const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  waiting_parts: "Waiting Parts",
  completed: "Completed",
  cancelled: "Cancelled",
};
const STATUS_ICONS: Record<string, any> = {
  pending: Clock,
  in_progress: Wrench,
  waiting_parts: Package,
  completed: CheckCircle2,
  cancelled: XCircle,
};

function formatDate(dateStr: string) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function JobProgressTimeline({ job }: JobProgressTimelineProps) {
  // Fetch linked invoices for this job
  const { data: invoices = [] } = useQuery<any[]>({
    queryKey: ["/api/invoices", { jobId: job.id }],
    enabled: !!job.id,
  });

  const currentStatusIndex = STATUS_ORDER.indexOf(job.status);
  const isCancelled = job.status === "cancelled";

  return (
    <div className="space-y-6">
      {/* Visual Progress Bar */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Job Progress</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between mb-2">
            {STATUS_ORDER.map((status, index) => {
              const isPast = index <= currentStatusIndex && !isCancelled;
              const isCurrent = index === currentStatusIndex && !isCancelled;
              const Icon = STATUS_ICONS[status];

              return (
                <div
                  key={status}
                  className="flex flex-col items-center relative flex-1"
                >
                  {/* Connector line left */}
                  {index > 0 && (
                    <div
                      className={`absolute left-0 right-1/2 top-4 h-0.5 -translate-y-1/2 ${
                        isPast ? "bg-primary" : "bg-muted"
                      }`}
                    />
                  )}
                  {/* Connector line right */}
                  {index < STATUS_ORDER.length - 1 && (
                    <div
                      className={`absolute left-1/2 right-0 top-4 h-0.5 -translate-y-1/2 ${
                        index < currentStatusIndex && !isCancelled
                          ? "bg-primary"
                          : "bg-muted"
                      }`}
                    />
                  )}

                  {/* Icon circle */}
                  <div
                    className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                      isCurrent
                        ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
                        : isPast
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <span
                    className={`mt-2 text-[10px] sm:text-xs font-medium text-center ${
                      isCurrent
                        ? "text-primary"
                        : isPast
                        ? "text-foreground"
                        : "text-muted-foreground"
                    }`}
                  >
                    {STATUS_LABELS[status]}
                  </span>
                </div>
              );
            })}
          </div>

          {isCancelled && (
            <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg mt-4">
              <XCircle className="h-5 w-5 text-red-500" />
              <span className="text-sm text-red-700 dark:text-red-300">
                This job was cancelled
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Timeline Events */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative space-y-0">
            {/* Vertical line */}
            <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />

            {/* Job Created */}
            <div className="flex items-start gap-3 pb-4 relative">
              <div className="w-[15px] h-[15px] rounded-full bg-primary flex-shrink-0 mt-0.5 relative z-10 ring-2 ring-background" />
              <div>
                <p className="text-sm font-medium">Job Created</p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(job.createdAt)}
                </p>
                {job.customer && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Customer: {job.customer.firstName} {job.customer.lastName}
                  </p>
                )}
              </div>
            </div>

            {/* Status Update (if updated != created) */}
            {job.updatedAt &&
              job.updatedAt !== job.createdAt &&
              job.status !== "pending" && (
                <div className="flex items-start gap-3 pb-4 relative">
                  <div className="w-[15px] h-[15px] rounded-full bg-blue-500 flex-shrink-0 mt-0.5 relative z-10 ring-2 ring-background" />
                  <div>
                    <p className="text-sm font-medium">
                      Status: {STATUS_LABELS[job.status] || job.status}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(job.updatedAt)}
                    </p>
                  </div>
                </div>
              )}

            {/* Linked Invoices */}
            {invoices &&
              invoices.length > 0 &&
              invoices.map((inv: any) => (
                <div
                  key={inv.id}
                  className="flex items-start gap-3 pb-4 relative"
                >
                  <div className="w-[15px] h-[15px] rounded-full bg-green-500 flex-shrink-0 mt-0.5 relative z-10 ring-2 ring-background" />
                  <div>
                    <div className="flex items-center gap-2">
                      <FileText className="h-3.5 w-3.5 text-green-500" />
                      <p className="text-sm font-medium">
                        Invoice #{inv.invoiceNumber} generated
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(inv.createdAt)}
                      {inv.total && ` — ${formatCurrency(inv.total)}`}
                    </p>
                    <Badge variant="outline" className="mt-1 text-xs">
                      {inv.status}
                    </Badge>
                  </div>
                </div>
              ))}

            {/* Scheduled Date */}
            {job.scheduledDate && (
              <div className="flex items-start gap-3 pb-4 relative">
                <div className="w-[15px] h-[15px] rounded-full bg-purple-500 flex-shrink-0 mt-0.5 relative z-10 ring-2 ring-background" />
                <div>
                  <div className="flex items-center gap-2">
                    <CalendarPlus className="h-3.5 w-3.5 text-purple-500" />
                    <p className="text-sm font-medium">Scheduled Date</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(job.scheduledDate)}
                  </p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
