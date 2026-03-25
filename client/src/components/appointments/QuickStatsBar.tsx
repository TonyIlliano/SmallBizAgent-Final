import { useMemo } from "react";
import { Calendar, DollarSign, Activity, UserX } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import type { VerticalLabels } from "@/lib/scheduling-utils";

interface AppointmentForStats {
  id: number;
  startDate: string;
  endDate: string;
  status: string;
  service?: {
    price?: string;
  };
}

interface QuickStatsBarProps {
  appointments: AppointmentForStats[];
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

/**
 * Quick stats bar showing today's key metrics.
 * Computes all stats from the already-fetched appointments array.
 * Mobile: 2x2 grid. Desktop: horizontal flex with dividers.
 */
export function QuickStatsBar({ appointments, labels }: QuickStatsBarProps) {
  const isMobile = useIsMobile();

  const stats = useMemo(() => {
    const now = new Date();

    // Booked: total non-cancelled for the day
    const booked = appointments.filter(
      (a) => a.status !== "cancelled"
    ).length;

    // Earned: sum of service prices for completed appointments
    const earned = appointments
      .filter((a) => a.status === "completed")
      .reduce((sum, a) => sum + parseFloat(a.service?.price || "0"), 0);

    // Active now: in-progress (startDate <= now <= endDate, not cancelled/no_show)
    const activeNow = appointments.filter((a) => {
      if (a.status === "cancelled" || a.status === "no_show") return false;
      const start = new Date(a.startDate);
      const end = new Date(a.endDate);
      return start <= now && now <= end;
    }).length;

    // No-shows
    const noShows = appointments.filter(
      (a) => a.status === "no_show"
    ).length;

    return { booked, earned, activeNow, noShows };
  }, [appointments]);

  if (isMobile) {
    return (
      <div className="grid grid-cols-2 gap-3 px-3 py-2.5 bg-white rounded-lg border">
        <StatChip
          label={labels.bookedLabel}
          value={stats.booked}
          icon={Calendar}
          compact
        />
        <StatChip
          label={labels.earnedLabel}
          value={`$${stats.earned.toFixed(0)}`}
          icon={DollarSign}
          valueColor={stats.earned > 0 ? "text-green-700" : "text-gray-900"}
          compact
        />
        <StatChip
          label={labels.activeLabel}
          value={stats.activeNow}
          icon={Activity}
          pulse
          valueColor={stats.activeNow > 0 ? "text-green-700" : "text-gray-900"}
          compact
        />
        <StatChip
          label={labels.noShowLabel}
          value={stats.noShows}
          icon={UserX}
          valueColor={stats.noShows > 0 ? "text-red-600" : "text-gray-900"}
          compact
        />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-5 sm:gap-8 px-4 py-2.5 bg-white rounded-lg border overflow-x-auto">
      <StatChip
        label={labels.bookedLabel}
        value={stats.booked}
        icon={Calendar}
      />
      <div className="w-px h-8 bg-gray-200 flex-shrink-0" />
      <StatChip
        label={labels.earnedLabel}
        value={`$${stats.earned.toFixed(0)}`}
        icon={DollarSign}
        valueColor={stats.earned > 0 ? "text-green-700" : "text-gray-900"}
      />
      <div className="w-px h-8 bg-gray-200 flex-shrink-0" />
      <StatChip
        label={labels.activeLabel}
        value={stats.activeNow}
        icon={Activity}
        pulse
        valueColor={stats.activeNow > 0 ? "text-green-700" : "text-gray-900"}
      />
      <div className="w-px h-8 bg-gray-200 flex-shrink-0" />
      <StatChip
        label={labels.noShowLabel}
        value={stats.noShows}
        icon={UserX}
        valueColor={stats.noShows > 0 ? "text-red-600" : "text-gray-900"}
      />
    </div>
  );
}
