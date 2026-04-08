// ─── Scheduling Utilities ─────────────────────────────────────────────
// Shared across: appointments/index.tsx, appointments/fullscreen.tsx, staff/dashboard.tsx

// ─── Types ────────────────────────────────────────────────────────────

export interface BusinessHoursEntry {
  day: string;
  open: string | null;
  close: string | null;
  isClosed: boolean;
}

export interface CalendarRange {
  hourStart: number;
  hourEnd: number;
  hours: number[];
}

export interface VerticalLabels {
  activeLabel: string;       // "In chair" / "On site" / "Seated" / "Active"
  entityLabel: string;       // "Appointments" / "Reservations" / "Jobs"
  entitySingular: string;    // "Appointment" / "Reservation" / "Job"
  providerLabel: string;     // "Stylist" / "Technician" / "Server" / "Staff"
  earnedLabel: string;       // "Earned" / "Billed" / "Covers"
  bookedLabel: string;       // "Booked" / "Reserved"
  noShowLabel: string;       // "No-shows"
}

// ─── Dynamic Hours Calculation ────────────────────────────────────────

/**
 * Compute the calendar display range from business hours.
 * Finds the earliest open and latest close across all non-closed days,
 * adds 1-hour padding on each side (clamped to 6AM-23).
 * Falls back to 8AM-6PM if no hours are configured.
 *
 * Optionally accepts appointments to extend the range if any fall outside
 * business hours (e.g., a 7 AM appointment when business opens at 9 AM).
 */
export function computeCalendarRange(
  businessHours: BusinessHoursEntry[],
  appointments?: Array<{ startDate: string; endDate: string }>
): CalendarRange {
  const openDays = businessHours.filter(h => !h.isClosed && h.open && h.close);

  let minOpen = 24;
  let maxClose = 0;

  if (openDays.length > 0) {
    for (const day of openDays) {
      const openHour = parseInt(day.open!.split(":")[0], 10);
      const closeHour = parseInt(day.close!.split(":")[0], 10);
      const closeMin = parseInt(day.close!.split(":")[1], 10);
      if (openHour < minOpen) minOpen = openHour;
      const effectiveClose = closeMin > 0 ? closeHour + 1 : closeHour;
      if (effectiveClose > maxClose) maxClose = effectiveClose;
    }
  } else {
    // No hours configured — fallback
    minOpen = 8;
    maxClose = 18;
  }

  // Extend range for appointments that fall outside business hours
  if (appointments && appointments.length > 0) {
    for (const appt of appointments) {
      const startH = new Date(appt.startDate).getHours();
      const endH = new Date(appt.endDate).getHours();
      const endM = new Date(appt.endDate).getMinutes();
      if (startH < minOpen) minOpen = startH;
      const effectiveEnd = endM > 0 ? endH + 1 : endH;
      if (effectiveEnd > maxClose) maxClose = effectiveEnd;
    }
  }

  // 1-hour padding, clamped to 6AM-23
  const hourStart = Math.max(6, minOpen - 1);
  const hourEnd = Math.min(23, maxClose + 1);

  return {
    hourStart,
    hourEnd,
    hours: Array.from({ length: hourEnd - hourStart + 1 }, (_, i) => hourStart + i),
  };
}

// ─── Staff Colors ─────────────────────────────────────────────────────

export const STAFF_COLORS = [
  "#3B82F6", // blue
  "#10B981", // emerald
  "#F59E0B", // amber
  "#EF4444", // red
  "#8B5CF6", // violet
  "#EC4899", // pink
  "#06B6D4", // cyan
  "#F97316", // orange
];

export const UNASSIGNED_COLOR = "#9CA3AF";

export function getStaffColor(
  staffId: number | undefined | null,
  staffMembers: Array<{ id: number }>
): string {
  if (!staffId) return UNASSIGNED_COLOR;
  const index = staffMembers.findIndex((s) => s.id === staffId);
  if (index === -1) return UNASSIGNED_COLOR;
  return STAFF_COLORS[index % STAFF_COLORS.length];
}

// ─── Hour Formatting ──────────────────────────────────────────────────

export function formatHour(hour: number): string {
  if (hour === 0) return "12 AM";
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return "12 PM";
  return `${hour - 12} PM`;
}

/** Short format for compact displays: "8a", "12p", "5p" */
export function formatHourShort(hour: number): string {
  if (hour === 0) return "12a";
  if (hour < 12) return `${hour}a`;
  if (hour === 12) return "12p";
  return `${hour - 12}p`;
}

// ─── Status Colors ────────────────────────────────────────────────────

export const STATUS_COLORS: Record<
  string,
  { bg: string; text: string; border: string; dot: string }
> = {
  scheduled: {
    bg: "bg-blue-50",
    text: "text-blue-700",
    border: "border-l-blue-500",
    dot: "bg-blue-500",
  },
  confirmed: {
    bg: "bg-green-50",
    text: "text-green-700",
    border: "border-l-green-500",
    dot: "bg-green-500",
  },
  completed: {
    bg: "bg-purple-50",
    text: "text-purple-700",
    border: "border-l-purple-500",
    dot: "bg-purple-500",
  },
  cancelled: {
    bg: "bg-red-50/60",
    text: "text-red-700",
    border: "border-l-red-500",
    dot: "bg-red-500",
  },
  no_show: {
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-l-amber-500",
    dot: "bg-amber-500",
  },
};

// Job status colors for field service calendar view
export const JOB_STATUS_COLORS: Record<
  string,
  { bg: string; text: string; border: string; dot: string }
> = {
  pending: {
    bg: "bg-gray-50",
    text: "text-gray-700",
    border: "border-l-gray-400",
    dot: "bg-gray-400",
  },
  in_progress: {
    bg: "bg-blue-50",
    text: "text-blue-700",
    border: "border-l-blue-500",
    dot: "bg-blue-500",
  },
  waiting_parts: {
    bg: "bg-yellow-50",
    text: "text-yellow-700",
    border: "border-l-yellow-500",
    dot: "bg-yellow-500",
  },
  completed: {
    bg: "bg-green-50",
    text: "text-green-700",
    border: "border-l-green-500",
    dot: "bg-green-500",
  },
  cancelled: {
    bg: "bg-red-50/60",
    text: "text-red-700",
    border: "border-l-red-500",
    dot: "bg-red-500",
  },
};

export function getJobStatusColor(status: string) {
  return JOB_STATUS_COLORS[status] || JOB_STATUS_COLORS.pending;
}

export const RESERVATION_STATUS_COLORS: Record<
  string,
  { bg: string; text: string; border: string; dot: string }
> = {
  confirmed: {
    bg: "bg-green-50",
    text: "text-green-700",
    border: "border-l-green-500",
    dot: "bg-green-500",
  },
  seated: {
    bg: "bg-blue-50",
    text: "text-blue-700",
    border: "border-l-blue-500",
    dot: "bg-blue-500",
  },
  completed: {
    bg: "bg-purple-50",
    text: "text-purple-700",
    border: "border-l-purple-500",
    dot: "bg-purple-500",
  },
  cancelled: {
    bg: "bg-red-50/60",
    text: "text-red-700",
    border: "border-l-red-500",
    dot: "bg-red-500",
  },
  no_show: {
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-l-amber-500",
    dot: "bg-amber-500",
  },
};

export function getStatusColors(status: string) {
  return (
    STATUS_COLORS[status] || {
      bg: "bg-gray-50",
      text: "text-gray-700",
      border: "border-l-gray-400",
      dot: "bg-gray-400",
    }
  );
}

export function getReservationStatusColors(status: string) {
  return (
    RESERVATION_STATUS_COLORS[status] || {
      bg: "bg-gray-50",
      text: "text-gray-700",
      border: "border-l-gray-400",
      dot: "bg-gray-400",
    }
  );
}

// ─── Vertical-Aware Terminology ───────────────────────────────────────

const VERTICAL_LABELS: Record<string, VerticalLabels> = {
  barbershop: {
    activeLabel: "In chair",
    entityLabel: "Appointments",
    entitySingular: "Appointment",
    providerLabel: "Barber",
    earnedLabel: "Earned",
    bookedLabel: "Booked",
    noShowLabel: "No-shows",
  },
  "barber/salon": {
    activeLabel: "In chair",
    entityLabel: "Appointments",
    entitySingular: "Appointment",
    providerLabel: "Stylist",
    earnedLabel: "Earned",
    bookedLabel: "Booked",
    noShowLabel: "No-shows",
  },
  salon: {
    activeLabel: "In chair",
    entityLabel: "Appointments",
    entitySingular: "Appointment",
    providerLabel: "Stylist",
    earnedLabel: "Earned",
    bookedLabel: "Booked",
    noShowLabel: "No-shows",
  },
  restaurant: {
    activeLabel: "Seated",
    entityLabel: "Reservations",
    entitySingular: "Reservation",
    providerLabel: "Server",
    earnedLabel: "Covers",
    bookedLabel: "Reserved",
    noShowLabel: "No-shows",
  },
  hvac: {
    activeLabel: "On site",
    entityLabel: "Jobs",
    entitySingular: "Job",
    providerLabel: "Technician",
    earnedLabel: "Earned",
    bookedLabel: "Booked",
    noShowLabel: "No-shows",
  },
  plumbing: {
    activeLabel: "On site",
    entityLabel: "Jobs",
    entitySingular: "Job",
    providerLabel: "Technician",
    earnedLabel: "Earned",
    bookedLabel: "Booked",
    noShowLabel: "No-shows",
  },
  electrical: {
    activeLabel: "On site",
    entityLabel: "Jobs",
    entitySingular: "Job",
    providerLabel: "Technician",
    earnedLabel: "Earned",
    bookedLabel: "Booked",
    noShowLabel: "No-shows",
  },
  "auto repair": {
    activeLabel: "In bay",
    entityLabel: "Appointments",
    entitySingular: "Appointment",
    providerLabel: "Mechanic",
    earnedLabel: "Earned",
    bookedLabel: "Booked",
    noShowLabel: "No-shows",
  },
  automotive: {
    activeLabel: "In bay",
    entityLabel: "Appointments",
    entitySingular: "Appointment",
    providerLabel: "Mechanic",
    earnedLabel: "Earned",
    bookedLabel: "Booked",
    noShowLabel: "No-shows",
  },
  medical: {
    activeLabel: "In exam",
    entityLabel: "Appointments",
    entitySingular: "Appointment",
    providerLabel: "Provider",
    earnedLabel: "Billed",
    bookedLabel: "Booked",
    noShowLabel: "No-shows",
  },
  dental: {
    activeLabel: "In chair",
    entityLabel: "Appointments",
    entitySingular: "Appointment",
    providerLabel: "Provider",
    earnedLabel: "Billed",
    bookedLabel: "Booked",
    noShowLabel: "No-shows",
  },
  veterinary: {
    activeLabel: "In exam",
    entityLabel: "Appointments",
    entitySingular: "Appointment",
    providerLabel: "Doctor",
    earnedLabel: "Billed",
    bookedLabel: "Booked",
    noShowLabel: "No-shows",
  },
  cleaning: {
    activeLabel: "On site",
    entityLabel: "Appointments",
    entitySingular: "Appointment",
    providerLabel: "Cleaner",
    earnedLabel: "Earned",
    bookedLabel: "Booked",
    noShowLabel: "No-shows",
  },
  landscaping: {
    activeLabel: "On site",
    entityLabel: "Jobs",
    entitySingular: "Job",
    providerLabel: "Crew",
    earnedLabel: "Earned",
    bookedLabel: "Booked",
    noShowLabel: "No-shows",
  },
  construction: {
    activeLabel: "On site",
    entityLabel: "Jobs",
    entitySingular: "Job",
    providerLabel: "Crew",
    earnedLabel: "Earned",
    bookedLabel: "Booked",
    noShowLabel: "No-shows",
  },
  fitness: {
    activeLabel: "In session",
    entityLabel: "Sessions",
    entitySingular: "Session",
    providerLabel: "Trainer",
    earnedLabel: "Earned",
    bookedLabel: "Booked",
    noShowLabel: "No-shows",
  },
  "pest control": {
    activeLabel: "On site",
    entityLabel: "Jobs",
    entitySingular: "Job",
    providerLabel: "Technician",
    earnedLabel: "Earned",
    bookedLabel: "Booked",
    noShowLabel: "No-shows",
  },
  roofing: {
    activeLabel: "On site",
    entityLabel: "Jobs",
    entitySingular: "Job",
    providerLabel: "Crew",
    earnedLabel: "Earned",
    bookedLabel: "Booked",
    noShowLabel: "No-shows",
  },
  painting: {
    activeLabel: "On site",
    entityLabel: "Jobs",
    entitySingular: "Job",
    providerLabel: "Painter",
    earnedLabel: "Earned",
    bookedLabel: "Booked",
    noShowLabel: "No-shows",
  },
};

const DEFAULT_LABELS: VerticalLabels = {
  activeLabel: "Active",
  entityLabel: "Appointments",
  entitySingular: "Appointment",
  providerLabel: "Staff",
  earnedLabel: "Earned",
  bookedLabel: "Booked",
  noShowLabel: "No-shows",
};

/**
 * Returns industry-specific terminology for UI labels.
 * Matches by exact key, then partial key match, then defaults.
 */
export function getVerticalLabels(industry: string): VerticalLabels {
  if (!industry) return DEFAULT_LABELS;
  const key = industry.toLowerCase().trim();

  // Exact match
  if (VERTICAL_LABELS[key]) return VERTICAL_LABELS[key];

  // Partial match (e.g., "HVAC / Plumbing" includes "hvac")
  for (const [k, v] of Object.entries(VERTICAL_LABELS)) {
    if (key.includes(k) || k.includes(key)) return v;
  }

  return DEFAULT_LABELS;
}
