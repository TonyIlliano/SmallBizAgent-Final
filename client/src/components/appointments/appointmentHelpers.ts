// ─── Appointment Page Types, Constants & Helpers ─────────────────────
// Shared across all extracted appointment page components.

// ─── Types ───────────────────────────────────────────────────────────
export type ViewMode = "week" | "day" | "month";

export interface StaffData {
  id: number;
  firstName: string;
  lastName: string;
  role?: string;
  specialty?: string;
  color?: string;
}

export interface AppointmentData {
  id: number;
  startDate: string;
  endDate: string;
  status: string;
  notes?: string;
  customer?: {
    id: number;
    firstName: string;
    lastName: string;
    phone?: string;
    email?: string;
  };
  staff?: {
    id: number;
    firstName: string;
    lastName: string;
  };
  service?: {
    id: number;
    name: string;
    price?: string;
    duration?: number;
  };
}

export interface ReservationData {
  id: number;
  partySize: number;
  reservationDate: string;
  reservationTime: string;
  startDate: string;
  endDate: string;
  status: string;
  specialRequests?: string;
  source?: string;
  customer?: {
    id: number;
    firstName: string;
    lastName: string;
    phone?: string;
    email?: string;
  };
}

// ─── Layout Constants ────────────────────────────────────────────────
export const DEFAULT_HOUR_START = 8;
export const DEFAULT_HOUR_END = 18;
export const DEFAULT_HOURS = Array.from(
  { length: DEFAULT_HOUR_END - DEFAULT_HOUR_START + 1 },
  (_, i) => DEFAULT_HOUR_START + i
);
export const HOUR_HEIGHT = 64; // px per hour row (week view)
export const DAY_HOUR_HEIGHT = 80; // px per hour row (day view — larger for touch targets)

// ─── Date Helpers ────────────────────────────────────────────────────
export function getStartOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function getEndOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function getStartOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun, 1=Mon, ...
  const diff = day === 0 ? -6 : 1 - day; // Go back to Monday
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function getEndOfWeek(date: Date): Date {
  const start = getStartOfWeek(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

export function getStartOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function getEndOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

export function getWeekDays(date: Date): Date[] {
  const start = getStartOfWeek(date);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function isToday(date: Date): boolean {
  return isSameDay(date, new Date());
}

export function formatDayName(date: Date): string {
  return date.toLocaleDateString("en-US", { weekday: "short" });
}

export function formatFullDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function formatWeekRange(date: Date): string {
  const start = getStartOfWeek(date);
  const end = getEndOfWeek(date);
  const sameMonth = start.getMonth() === end.getMonth();
  const startMonth = start.toLocaleDateString("en-US", { month: "long" });
  const endMonth = end.toLocaleDateString("en-US", { month: "long" });
  const year = end.getFullYear();

  if (sameMonth) {
    return `${startMonth} ${start.getDate()} \u2013 ${end.getDate()}, ${year}`;
  }
  return `${startMonth} ${start.getDate()} \u2013 ${endMonth} ${end.getDate()}, ${year}`;
}

export function formatMonthYear(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

// ─── Customer Name Helper ────────────────────────────────────────────
export function getCustomerName(customer?: { firstName: string; lastName: string } | null): string {
  if (!customer) return "Walk-in";
  return `${customer.firstName} ${customer.lastName}`.trim();
}
