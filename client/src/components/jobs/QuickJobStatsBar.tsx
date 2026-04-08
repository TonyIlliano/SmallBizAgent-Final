import { useMemo } from "react";
import { Briefcase, DollarSign, Activity, Clock } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import type { VerticalLabels } from "@/lib/scheduling-utils";

interface JobForStats {
  id: number;
  status: string;
  scheduledDate?: string;
  appointment?: {
    startDate: string;
    endDate: string;
  } | null;
  lineItems?: Array<{ amount?: number }>;
}

interface QuickJobStatsBarProps {
  jobs: JobForStats[];
  labels: VerticalLabels;
}

function StatChip({
  label,
  value,
  icon: Icon,
  pulse,
  valueColor,
  compact,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  pulse?: boolean;
  valueColor?: string;
  compact?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 flex-shrink-0">
      <div className="relative">
        <Icon className={compact ? "h-3.5 w-3.5 text-gray-400" : "h-4 w-4 text-gray-400"} />
        {pulse && Number(value) > 0 && (
          <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-green-500 animate-pulse" />
        )}
      </div>
      <div className="flex flex-col leading-tight">
        <span className={`uppercase tracking-wider text-gray-400 font-medium ${compact ? "text-[9px]" : "text-[10px]"}`}>
          {label}
        </span>
        <span className={`font-bold tabular-nums ${compact ? "text-base" : "text-lg"} ${valueColor || "text-gray-900"}`}>
          {value}
        </span>
      </div>
    </div>
  );
}

export function QuickJobStatsBar({ jobs, labels }: QuickJobStatsBarProps) {
  const isMobile = useIsMobile();
  const compact = isMobile;

  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Filter to today's jobs
    const todayJobs = jobs.filter(j => {
      if (j.appointment?.startDate) {
        const d = new Date(j.appointment.startDate);
        return d >= today && d < tomorrow;
      }
      if (j.scheduledDate) {
        const d = new Date(j.scheduledDate);
        return d >= today && d < tomorrow;
      }
      return false;
    });

    const booked = todayJobs.filter(j => j.status !== 'cancelled').length;
    const onSite = todayJobs.filter(j => j.status === 'in_progress').length;
    const waitingParts = todayJobs.filter(j => j.status === 'waiting_parts').length;

    // Calculate earned from completed jobs' line items
    const earned = todayJobs
      .filter(j => j.status === 'completed')
      .reduce((sum, j) => {
        if (j.lineItems) {
          return sum + j.lineItems.reduce((s, item) => s + (item.amount || 0), 0);
        }
        return sum;
      }, 0);

    return { booked, onSite, waitingParts, earned };
  }, [jobs]);

  return (
    <div className="flex items-center gap-4 sm:gap-6 overflow-x-auto py-2 px-1 no-scrollbar">
      <StatChip
        label={`Booked ${labels.entityLabel}`}
        value={stats.booked}
        icon={Briefcase}
        compact={compact}
      />
      <StatChip
        label={labels.earnedLabel}
        value={stats.earned > 0 ? `$${stats.earned.toLocaleString()}` : "$0"}
        icon={DollarSign}
        compact={compact}
      />
      <StatChip
        label={labels.activeLabel}
        value={stats.onSite}
        icon={Activity}
        pulse
        valueColor={stats.onSite > 0 ? "text-green-600" : undefined}
        compact={compact}
      />
      <StatChip
        label="Waiting Parts"
        value={stats.waitingParts}
        icon={Clock}
        valueColor={stats.waitingParts > 0 ? "text-yellow-600" : undefined}
        compact={compact}
      />
    </div>
  );
}
