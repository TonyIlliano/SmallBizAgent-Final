import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { PageLayout } from "@/components/layout/PageLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatTime } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/api";
import {
  PlusCircle,
  Calendar as CalendarIcon,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
  Clock,
  User,
  MoreVertical,
  Scissors,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { AppointmentForm } from "@/components/appointments/AppointmentForm";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// ─── Types ───────────────────────────────────────────────────────────
type ViewMode = "week" | "day";

interface AppointmentData {
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

// ─── Date Helpers ────────────────────────────────────────────────────
function getStartOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getEndOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function getStartOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun, 1=Mon, ...
  const diff = day === 0 ? -6 : 1 - day; // Go back to Monday
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getEndOfWeek(date: Date): Date {
  const start = getStartOfWeek(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

function getWeekDays(date: Date): Date[] {
  const start = getStartOfWeek(date);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isToday(date: Date): boolean {
  return isSameDay(date, new Date());
}

function formatDayName(date: Date): string {
  return date.toLocaleDateString("en-US", { weekday: "short" });
}

function formatFullDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatWeekRange(date: Date): string {
  const start = getStartOfWeek(date);
  const end = getEndOfWeek(date);
  const sameMonth = start.getMonth() === end.getMonth();
  const startMonth = start.toLocaleDateString("en-US", { month: "long" });
  const endMonth = end.toLocaleDateString("en-US", { month: "long" });
  const year = end.getFullYear();

  if (sameMonth) {
    // "February 16 – 22, 2026"
    return `${startMonth} ${start.getDate()} – ${end.getDate()}, ${year}`;
  }
  // "January 27 – February 2, 2026"
  return `${startMonth} ${start.getDate()} – ${endMonth} ${end.getDate()}, ${year}`;
}

// ─── Status Helpers ──────────────────────────────────────────────────
const STATUS_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  scheduled: { bg: "bg-blue-50", text: "text-blue-700", border: "border-l-blue-500" },
  confirmed: { bg: "bg-green-50", text: "text-green-700", border: "border-l-green-500" },
  completed: { bg: "bg-purple-50", text: "text-purple-700", border: "border-l-purple-500" },
  cancelled: { bg: "bg-red-50", text: "text-red-700", border: "border-l-red-500" },
};

function getStatusBadge(status: string) {
  switch (status) {
    case "scheduled":
      return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Scheduled</Badge>;
    case "confirmed":
      return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Confirmed</Badge>;
    case "completed":
      return <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-100">Completed</Badge>;
    case "cancelled":
      return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Cancelled</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
}

// ─── Time grid constants ─────────────────────────────────────────────
const HOUR_START = 8; // 8 AM
const HOUR_END = 18; // 6 PM
const HOURS = Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => HOUR_START + i);
const HOUR_HEIGHT = 64; // px per hour row

function formatHour(hour: number): string {
  if (hour === 0) return "12 AM";
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return "12 PM";
  return `${hour - 12} PM`;
}

// ─── Main Component ──────────────────────────────────────────────────
export default function Appointments() {
  const [, navigate] = useLocation();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [sheetOpen, setSheetOpen] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const businessId = user?.businessId;

  // ─── Date range for current view ────────────────────────────────
  const queryStartDate =
    viewMode === "week"
      ? getStartOfWeek(selectedDate)
      : getStartOfDay(selectedDate);
  const queryEndDate =
    viewMode === "week"
      ? getEndOfWeek(selectedDate)
      : getEndOfDay(selectedDate);

  const queryParams = {
    businessId,
    startDate: queryStartDate.toISOString(),
    endDate: queryEndDate.toISOString(),
  };

  // ─── Fetch appointments ─────────────────────────────────────────
  const { data: appointments = [], isLoading } = useQuery<AppointmentData[]>({
    queryKey: ["/api/appointments", queryParams],
  });

  // ─── Send reminder mutation ─────────────────────────────────────
  const sendReminderMutation = useMutation({
    mutationFn: (appointmentId: number) =>
      apiRequest("POST", `/api/appointments/${appointmentId}/send-reminder`),
    onSuccess: () => {
      toast({ title: "Reminder Sent", description: "SMS reminder sent successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Send",
        description: error?.message || "Could not send reminder",
        variant: "destructive",
      });
    },
  });

  // ─── Navigation handlers ────────────────────────────────────────
  function navigatePrev() {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - (viewMode === "week" ? 7 : 1));
    setSelectedDate(d);
  }

  function navigateNext() {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + (viewMode === "week" ? 7 : 1));
    setSelectedDate(d);
  }

  function goToday() {
    setSelectedDate(new Date());
  }

  // ─── Render ─────────────────────────────────────────────────────
  return (
    <PageLayout title="Appointments">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold">Appointments</h2>
          <p className="text-gray-500 text-sm">Manage your schedule</p>
        </div>
        <Button onClick={() => setSheetOpen(true)} className="flex items-center">
          <PlusCircle className="mr-2 h-4 w-4" />
          New Appointment
        </Button>
      </div>

      {/* ── Navigation Bar ─────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4 bg-white rounded-lg border p-3">
        {/* Left: navigation controls */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={navigatePrev}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={goToday}>
            Today
          </Button>
          <Button variant="outline" size="icon" onClick={navigateNext}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="ml-2 text-sm font-medium text-gray-700 truncate max-w-[160px] sm:max-w-none">
            {viewMode === "week"
              ? formatWeekRange(selectedDate)
              : formatFullDate(selectedDate)}
          </span>
        </div>

        {/* Right: view toggle */}
        <div className="flex rounded-lg border overflow-hidden">
          <button
            onClick={() => setViewMode("week")}
            className={`px-4 py-1.5 text-sm font-medium transition-colors ${
              viewMode === "week"
                ? "bg-primary text-primary-foreground"
                : "bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            Week
          </button>
          <button
            onClick={() => setViewMode("day")}
            className={`px-4 py-1.5 text-sm font-medium transition-colors border-l ${
              viewMode === "day"
                ? "bg-primary text-primary-foreground"
                : "bg-white text-gray-600 hover:bg-gray-50"
            }`}
          >
            Day
          </button>
        </div>
      </div>

      {/* ── Content ────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="flex justify-center items-center h-64 bg-white rounded-lg border">
          <div className="animate-spin w-10 h-10 border-4 border-primary rounded-full border-t-transparent" />
        </div>
      ) : viewMode === "week" ? (
        <WeekView
          appointments={appointments}
          selectedDate={selectedDate}
          onSelectDate={(d) => {
            setSelectedDate(d);
            setViewMode("day");
          }}
          onClickAppointment={(id) => navigate(`/appointments/${id}`)}
        />
      ) : (
        <DayView
          appointments={appointments}
          selectedDate={selectedDate}
          onClickAppointment={(id) => navigate(`/appointments/${id}`)}
          onSendReminder={(id) => sendReminderMutation.mutate(id)}
          reminderPending={sendReminderMutation.isPending}
          onNewAppointment={() => setSheetOpen(true)}
        />
      )}

      {/* ── New Appointment Sheet ──────────────────────────────── */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Schedule New Appointment</SheetTitle>
            <SheetDescription>
              Fill in the details to schedule a new appointment
            </SheetDescription>
          </SheetHeader>
          <div className="mt-8">
            <AppointmentForm />
          </div>
        </SheetContent>
      </Sheet>
    </PageLayout>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// WEEK VIEW
// ═══════════════════════════════════════════════════════════════════════
function WeekView({
  appointments,
  selectedDate,
  onSelectDate,
  onClickAppointment,
}: {
  appointments: AppointmentData[];
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
  onClickAppointment: (id: number) => void;
}) {
  const isMobile = useIsMobile();
  const weekDays = getWeekDays(selectedDate);

  // On mobile, show a day-selector strip + single-day time grid
  if (isMobile) {
    return (
      <MobileWeekView
        appointments={appointments}
        selectedDate={selectedDate}
        weekDays={weekDays}
        onSelectDate={onSelectDate}
        onClickAppointment={onClickAppointment}
      />
    );
  }

  return (
    <div className="bg-white rounded-lg border overflow-hidden">
      {/* Day headers */}
      <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b">
        <div className="p-2" /> {/* Time column spacer */}
        {weekDays.map((day, i) => {
          const today = isToday(day);
          return (
            <button
              key={i}
              onClick={() => onSelectDate(day)}
              className={`p-3 text-center border-l transition-colors hover:bg-gray-50 ${
                today ? "bg-blue-50" : ""
              }`}
            >
              <div className={`text-xs font-medium uppercase ${today ? "text-blue-600" : "text-gray-500"}`}>
                {formatDayName(day)}
              </div>
              <div
                className={`mt-1 text-lg font-semibold inline-flex items-center justify-center w-8 h-8 rounded-full ${
                  today ? "bg-blue-600 text-white" : "text-gray-900"
                }`}
              >
                {day.getDate()}
              </div>
            </button>
          );
        })}
      </div>

      {/* Time grid */}
      <div className="grid grid-cols-[60px_repeat(7,1fr)] overflow-x-auto" style={{ minHeight: HOURS.length * HOUR_HEIGHT }}>
        {/* Time labels + grid rows */}
        {HOURS.map((hour) => (
          <div key={`label-${hour}`} className="contents">
            {/* Time label */}
            <div
              className="text-xs text-gray-400 text-right pr-2 pt-1 border-b"
              style={{ height: HOUR_HEIGHT }}
            >
              {formatHour(hour)}
            </div>
            {/* Day cells */}
            {weekDays.map((day, dayIdx) => {
              const cellAppts = appointments.filter((a) => {
                const aDate = new Date(a.startDate);
                return isSameDay(aDate, day) && aDate.getHours() === hour;
              });

              return (
                <div
                  key={`cell-${hour}-${dayIdx}`}
                  className={`relative border-l border-b transition-colors hover:bg-gray-50/50 ${
                    isToday(day) ? "bg-blue-50/50" : ""
                  }`}
                  style={{ height: HOUR_HEIGHT }}
                  onClick={() => onSelectDate(day)}
                >
                  {cellAppts.map((appt) => {
                    const start = new Date(appt.startDate);
                    const minuteOffset = start.getMinutes();
                    const topPx = (minuteOffset / 60) * HOUR_HEIGHT;
                    const end = new Date(appt.endDate);
                    const durationMinutes = (end.getTime() - start.getTime()) / 60000;
                    const heightPx = Math.max((durationMinutes / 60) * HOUR_HEIGHT - 2, 20);
                    const colors = STATUS_COLORS[appt.status] || STATUS_COLORS.scheduled;

                    const customerName = appt.customer
                      ? `${appt.customer.firstName} ${appt.customer.lastName}`.trim()
                      : "Walk-in";
                    const tooltipParts = [customerName];
                    if (appt.customer?.phone) tooltipParts.push(appt.customer.phone);
                    if (appt.service?.name) tooltipParts.push(appt.service.name);
                    if (appt.staff) tooltipParts.push(`w/ ${appt.staff.firstName}`);

                    return (
                      <button
                        key={appt.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          onClickAppointment(appt.id);
                        }}
                        className={`absolute left-0.5 right-0.5 rounded px-1.5 py-0.5 border-l-3 text-left overflow-hidden cursor-pointer transition-shadow hover:shadow-md z-10 ${colors.bg} ${colors.border}`}
                        style={{ top: topPx, height: heightPx }}
                        title={tooltipParts.join(" — ")}
                      >
                        <div className={`text-[10px] font-semibold truncate ${colors.text}`}>
                          {formatTime(start)}
                        </div>
                        <div className="text-[10px] text-gray-600 truncate">
                          {customerName}
                        </div>
                        {heightPx > 30 && appt.service && (
                          <div className="text-[9px] text-gray-400 truncate">
                            {appt.service.name}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// MOBILE WEEK VIEW — Day selector strip + single-day time grid
// ═══════════════════════════════════════════════════════════════════════
function MobileWeekView({
  appointments,
  selectedDate,
  weekDays,
  onSelectDate,
  onClickAppointment,
}: {
  appointments: AppointmentData[];
  selectedDate: Date;
  weekDays: Date[];
  onSelectDate: (date: Date) => void;
  onClickAppointment: (id: number) => void;
}) {
  const [activeDayIndex, setActiveDayIndex] = useState(() => {
    const todayIdx = weekDays.findIndex((d) => isToday(d));
    return todayIdx >= 0 ? todayIdx : 0;
  });

  const activeDay = weekDays[activeDayIndex];
  const dayAppointments = appointments.filter((a) =>
    isSameDay(new Date(a.startDate), activeDay)
  );
  const MOBILE_HOUR_HEIGHT = 56;

  return (
    <div className="bg-white rounded-lg border overflow-hidden">
      {/* Day selector strip */}
      <div className="flex border-b">
        {weekDays.map((day, i) => {
          const today = isToday(day);
          const isActive = i === activeDayIndex;
          const hasAppts = appointments.some((a) => isSameDay(new Date(a.startDate), day));

          return (
            <button
              key={i}
              onClick={() => setActiveDayIndex(i)}
              className={`flex-1 min-w-[44px] py-2.5 text-center transition-colors relative ${
                isActive ? "bg-primary/10" : today ? "bg-blue-50/50" : ""
              }`}
            >
              <div className={`text-[10px] font-medium uppercase ${
                isActive ? "text-primary" : today ? "text-blue-600" : "text-gray-500"
              }`}>
                {formatDayName(day)}
              </div>
              <div className={`mt-0.5 text-base font-semibold inline-flex items-center justify-center w-7 h-7 rounded-full ${
                isActive
                  ? "bg-primary text-white"
                  : today
                    ? "bg-blue-600 text-white"
                    : "text-gray-900"
              }`}>
                {day.getDate()}
              </div>
              {hasAppts && !isActive && (
                <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" />
              )}
              {isActive && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
              )}
            </button>
          );
        })}
      </div>

      {/* Single-day time grid */}
      <div className="overflow-y-auto" style={{ maxHeight: "60vh" }}>
        <div className="grid grid-cols-[50px_1fr] relative" style={{ minHeight: HOURS.length * MOBILE_HOUR_HEIGHT }}>
          {HOURS.map((hour) => {
            const cellAppts = dayAppointments.filter((a) => {
              const aDate = new Date(a.startDate);
              return aDate.getHours() === hour;
            });

            return (
              <div key={`mobile-${hour}`} className="contents">
                {/* Time label */}
                <div
                  className="text-[11px] text-gray-400 text-right pr-2 pt-1 border-b"
                  style={{ height: MOBILE_HOUR_HEIGHT }}
                >
                  {formatHour(hour)}
                </div>
                {/* Single day cell — full width */}
                <div
                  className="relative border-b"
                  style={{ height: MOBILE_HOUR_HEIGHT }}
                >
                  {cellAppts.map((appt) => {
                    const start = new Date(appt.startDate);
                    const minuteOffset = start.getMinutes();
                    const topPx = (minuteOffset / 60) * MOBILE_HOUR_HEIGHT;
                    const end = new Date(appt.endDate);
                    const durationMinutes = (end.getTime() - start.getTime()) / 60000;
                    const heightPx = Math.max((durationMinutes / 60) * MOBILE_HOUR_HEIGHT - 2, 24);
                    const colors = STATUS_COLORS[appt.status] || STATUS_COLORS.scheduled;

                    const customerName = appt.customer
                      ? `${appt.customer.firstName} ${appt.customer.lastName}`.trim()
                      : "Walk-in";

                    return (
                      <button
                        key={appt.id}
                        onClick={() => onClickAppointment(appt.id)}
                        className={`absolute left-1 right-1 rounded-md px-2 py-1 border-l-3 text-left overflow-hidden cursor-pointer transition-shadow active:shadow-md z-10 ${colors.bg} ${colors.border}`}
                        style={{ top: topPx, height: heightPx }}
                      >
                        <div className={`text-xs font-semibold truncate ${colors.text}`}>
                          {formatTime(start)} — {customerName}
                        </div>
                        {heightPx > 28 && appt.service && (
                          <div className="text-[11px] text-gray-500 truncate">
                            {appt.service.name}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// DAY VIEW
// ═══════════════════════════════════════════════════════════════════════
function DayView({
  appointments,
  selectedDate,
  onClickAppointment,
  onSendReminder,
  reminderPending,
  onNewAppointment,
}: {
  appointments: AppointmentData[];
  selectedDate: Date;
  onClickAppointment: (id: number) => void;
  onSendReminder: (id: number) => void;
  reminderPending: boolean;
  onNewAppointment: () => void;
}) {
  // Sort by start time
  const sorted = [...appointments].sort(
    (a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
  );

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center bg-white rounded-lg border">
        <CalendarIcon className="h-12 w-12 text-gray-300 mb-4" />
        <h3 className="text-lg font-medium text-gray-900">No appointments</h3>
        <p className="mt-1 text-sm text-gray-500">
          Nothing scheduled for {formatFullDate(selectedDate)}
        </p>
        <Button className="mt-4" onClick={onNewAppointment}>
          <PlusCircle className="mr-2 h-4 w-4" />
          Schedule an Appointment
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sorted.map((appt) => {
        const start = new Date(appt.startDate);
        const end = new Date(appt.endDate);
        const durationMinutes = Math.round(
          (end.getTime() - start.getTime()) / 60000
        );
        const colors = STATUS_COLORS[appt.status] || STATUS_COLORS.scheduled;
        const canRemind = appt.status === "scheduled" || appt.status === "confirmed";

        return (
          <div
            key={appt.id}
            onClick={() => onClickAppointment(appt.id)}
            className={`flex items-stretch bg-white rounded-lg border cursor-pointer transition-shadow hover:shadow-md overflow-hidden border-l-4 ${colors.border}`}
          >
            {/* Time block */}
            <div className="flex flex-col items-center justify-center px-5 py-4 min-w-[90px] border-r bg-gray-50/50">
              <span className="text-lg font-bold text-gray-900">
                {formatTime(start)}
              </span>
              <span className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                <Clock className="h-3 w-3" />
                {durationMinutes} min
              </span>
            </div>

            {/* Details */}
            <div className="flex-1 px-4 py-3 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  {/* Customer name */}
                  <h4 className="font-semibold text-gray-900 truncate">
                    {appt.customer
                      ? `${appt.customer.firstName} ${appt.customer.lastName}`
                      : "Walk-in Customer"}
                  </h4>
                  {/* Customer phone */}
                  {appt.customer?.phone && (
                    <div className="text-xs text-gray-400 mt-0.5">
                      {appt.customer.phone}
                    </div>
                  )}
                  {/* Service */}
                  <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
                    <Scissors className="h-3.5 w-3.5 flex-shrink-0" />
                    <span className="truncate">
                      {appt.service?.name || "General Appointment"}
                      {appt.service?.price ? ` · $${appt.service.price}` : ""}
                    </span>
                  </div>
                  {/* Staff */}
                  <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
                    <User className="h-3.5 w-3.5 flex-shrink-0" />
                    {appt.staff ? (
                      <span className="truncate">
                        {appt.staff.firstName} {appt.staff.lastName}
                      </span>
                    ) : (
                      <span className="text-gray-400">Unassigned</span>
                    )}
                  </div>
                </div>

                {/* Right side: status + actions */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {getStatusBadge(appt.status)}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          onClickAppointment(appt.id);
                        }}
                      >
                        Edit Appointment
                      </DropdownMenuItem>
                      {canRemind && (
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            onSendReminder(appt.id);
                          }}
                          disabled={reminderPending}
                        >
                          <MessageSquare className="mr-2 h-4 w-4" />
                          Send SMS Reminder
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
