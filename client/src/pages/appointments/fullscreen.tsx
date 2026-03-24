import { useState, useEffect, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useBusinessHours } from "@/hooks/use-business-hours";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  formatHour,
  getStaffColor,
  STAFF_COLORS,
  UNASSIGNED_COLOR,
  getStatusColors,
  getReservationStatusColors,
  STATUS_COLORS,
  RESERVATION_STATUS_COLORS,
} from "@/lib/scheduling-utils";
import {
  Minimize2,
  ChevronLeft,
  ChevronRight,
  Clock,
  User,
  Users,
  Scissors,
  Calendar as CalendarIcon,
  Armchair,
  MessageSquare,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────
interface StaffData {
  id: number;
  firstName: string;
  lastName: string;
  role?: string;
  specialty?: string;
}

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

interface ReservationData {
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

function isToday(date: Date): boolean {
  const today = new Date();
  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}

function formatFullDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

// ─── Constants ───────────────────────────────────────────────────────
const HOUR_HEIGHT = 90; // Larger for fullscreen readability

// ─── Main Export: detects restaurant vs appointments ─────────────────
export default function FullscreenSchedule() {
  const { isRestaurant } = useBusinessHours();

  if (isRestaurant) {
    return <FullscreenReservations />;
  }

  return <FullscreenAppointments />;
}

// ═══════════════════════════════════════════════════════════════════════
// FULLSCREEN APPOINTMENTS (original)
// ═══════════════════════════════════════════════════════════════════════
function FullscreenAppointments() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const businessId = user?.businessId;
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [currentTime, setCurrentTime] = useState(new Date());

  // Dynamic business hours with extra padding for fullscreen/kiosk display
  const { hourStart: rawHourStart, hourEnd: rawHourEnd } = useBusinessHours();
  const fsHourStart = Math.max(6, rawHourStart - 1);
  const fsHourEnd = Math.min(23, rawHourEnd + 2);
  const APPT_HOURS = useMemo(
    () => Array.from({ length: fsHourEnd - fsHourStart + 1 }, (_, i) => fsHourStart + i),
    [fsHourStart, fsHourEnd]
  );

  // Update current time every 30 seconds for the time indicator
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 30000);
    return () => clearInterval(interval);
  }, []);

  // Auto-advance to today at midnight
  useEffect(() => {
    const now = new Date();
    const msUntilMidnight =
      new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() -
      now.getTime();

    const timeout = setTimeout(() => {
      setSelectedDate(new Date());
    }, msUntilMidnight);

    return () => clearTimeout(timeout);
  }, [selectedDate]);

  // Date query range
  const queryStartDate = getStartOfDay(selectedDate);
  const queryEndDate = getEndOfDay(selectedDate);

  // Fetch appointments — auto-refetch every 10 seconds for live updates
  const { data: appointments = [] } = useQuery<AppointmentData[]>({
    queryKey: ["/api/appointments", { businessId, startDate: queryStartDate.toISOString(), endDate: queryEndDate.toISOString() }],
    refetchInterval: 10000,
    staleTime: 5000,
    enabled: !!businessId,
  });

  // Fetch staff members
  const { data: staffMembers = [] } = useQuery<StaffData[]>({
    queryKey: ["/api/staff", { businessId }],
    enabled: !!businessId,
  });

  // Navigation
  const navigateDay = useCallback((offset: number) => {
    setSelectedDate((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + offset);
      return d;
    });
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        navigate("/appointments");
      } else if (e.key === "ArrowLeft") {
        navigateDay(-1);
      } else if (e.key === "ArrowRight") {
        navigateDay(1);
      } else if (e.key === "t" || e.key === "T") {
        setSelectedDate(new Date());
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate, navigateDay]);

  // Build staff columns
  const columns: { id: number | null; name: string; color: string }[] = staffMembers.map(
    (s, i) => ({
      id: s.id,
      name: `${s.firstName} ${s.lastName?.charAt(0) || ""}`.trim(),
      color: getStaffColor(s.id, staffMembers),
    })
  );
  columns.push({ id: null, name: "Unassigned", color: UNASSIGNED_COLOR });

  // Group appointments by staff column
  const appointmentsByColumn = new Map<number | null, AppointmentData[]>();
  columns.forEach((col) => appointmentsByColumn.set(col.id, []));

  appointments.forEach((appt) => {
    const staffId = appt.staff?.id ?? null;
    const bucket = appointmentsByColumn.get(staffId);
    if (bucket) {
      bucket.push(appt);
    } else {
      appointmentsByColumn.get(null)!.push(appt);
    }
  });

  // Time indicator
  const showTimeLine = isToday(selectedDate);
  const timeLineTop =
    ((currentTime.getHours() * 60 + currentTime.getMinutes() - fsHourStart * 60) / 60) *
    HOUR_HEIGHT;

  // Summary counts
  const totalToday = appointments.length;
  const confirmed = appointments.filter((a) => a.status === "confirmed").length;
  const scheduled = appointments.filter((a) => a.status === "scheduled").length;
  const completed = appointments.filter((a) => a.status === "completed").length;

  // Clock display
  const clockStr = currentTime.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  const colCount = columns.length;
  const gridCols = `72px repeat(${colCount}, minmax(200px, 1fr))`;

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col overflow-hidden">
      {/* ── Top Bar ────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-3 bg-black text-white border-b border-neutral-800 flex-shrink-0">
        {/* Left: date nav */}
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="text-neutral-400 hover:text-white hover:bg-neutral-800"
            onClick={() => navigateDay(-1)}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={`text-sm font-medium ${isToday(selectedDate) ? "bg-white text-black hover:bg-neutral-200" : "text-neutral-300 hover:text-white hover:bg-neutral-800"}`}
            onClick={() => setSelectedDate(new Date())}
          >
            Today
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-neutral-400 hover:text-white hover:bg-neutral-800"
            onClick={() => navigateDay(1)}
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
          <div className="ml-2">
            <h1 className="text-lg font-bold">{formatFullDate(selectedDate)}</h1>
          </div>
        </div>

        {/* Center: summary stats */}
        <div className="hidden md:flex items-center gap-6">
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-4 w-4 text-neutral-400" />
            <span className="text-sm">
              <span className="font-bold text-white">{totalToday}</span>
              <span className="text-neutral-400 ml-1">total</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-sm">
              <span className="font-bold text-white">{confirmed}</span>
              <span className="text-neutral-400 ml-1">confirmed</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-500" />
            <span className="text-sm">
              <span className="font-bold text-white">{scheduled}</span>
              <span className="text-neutral-400 ml-1">scheduled</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-purple-500" />
            <span className="text-sm">
              <span className="font-bold text-white">{completed}</span>
              <span className="text-neutral-400 ml-1">completed</span>
            </span>
          </div>
        </div>

        {/* Right: clock + exit */}
        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <div className="text-lg font-mono font-bold tabular-nums">{clockStr}</div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-neutral-400 hover:text-white hover:bg-neutral-800"
            onClick={() => navigate("/appointments")}
          >
            <Minimize2 className="h-4 w-4 mr-2" />
            Exit
          </Button>
        </div>
      </div>

      {/* ── Schedule Grid ──────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {/* Staff header row */}
        <div
          className="grid border-b sticky top-0 z-30 bg-white flex-shrink-0"
          style={{ gridTemplateColumns: gridCols }}
        >
          <div className="p-3 border-r bg-gray-50 flex items-center justify-center">
            <Clock className="h-4 w-4 text-gray-400" />
          </div>
          {columns.map((col) => {
            const count = appointmentsByColumn.get(col.id)?.length || 0;
            return (
              <div
                key={col.id ?? "unassigned"}
                className={`flex items-center gap-3 px-4 py-3 border-r last:border-r-0 ${
                  col.id === null ? "bg-gray-50" : ""
                }`}
              >
                <div
                  className="w-3.5 h-3.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: col.color }}
                />
                <span className="text-sm font-bold text-gray-800 truncate">
                  {col.name}
                </span>
                <Badge variant="secondary" className="ml-auto text-xs">
                  {count}
                </Badge>
              </div>
            );
          })}
        </div>

        {/* Scrollable time grid */}
        <div className="flex-1 overflow-auto">
          <div
            className="grid relative"
            style={{
              gridTemplateColumns: gridCols,
              minHeight: APPT_HOURS.length * HOUR_HEIGHT,
            }}
          >
            {/* Current time indicator */}
            {showTimeLine && timeLineTop >= 0 && timeLineTop <= APPT_HOURS.length * HOUR_HEIGHT && (
              <div
                className="absolute left-0 right-0 z-20 pointer-events-none flex items-center"
                style={{ top: timeLineTop }}
              >
                <div className="w-3 h-3 rounded-full bg-red-500 -ml-1 shadow-lg" />
                <div className="flex-1 h-0.5 bg-red-500 shadow-sm" />
              </div>
            )}

            {/* Hour rows */}
            {APPT_HOURS.map((hour) => (
              <div key={`row-${hour}`} className="contents">
                {/* Time label */}
                <div
                  className="text-sm text-gray-400 text-right pr-3 pt-2 border-b border-r bg-gray-50/50 font-medium"
                  style={{ height: HOUR_HEIGHT }}
                >
                  {formatHour(hour)}
                </div>

                {/* Staff column cells */}
                {columns.map((col) => {
                  const colAppts = (appointmentsByColumn.get(col.id) || []).filter(
                    (a) => new Date(a.startDate).getHours() === hour
                  );

                  return (
                    <div
                      key={`cell-${hour}-${col.id ?? "u"}`}
                      className={`relative border-b border-r last:border-r-0 transition-colors ${
                        col.id === null ? "bg-gray-50/30" : "hover:bg-gray-50/50"
                      }`}
                      style={{ height: HOUR_HEIGHT }}
                    >
                      {colAppts.map((appt) => {
                        const start = new Date(appt.startDate);
                        const minuteOffset = start.getMinutes();
                        const topPx = (minuteOffset / 60) * HOUR_HEIGHT;
                        const end = new Date(appt.endDate);
                        const durationMinutes = (end.getTime() - start.getTime()) / 60000;
                        const heightPx = Math.max(
                          (durationMinutes / 60) * HOUR_HEIGHT - 2,
                          40
                        );
                        const colors = getStatusColors(appt.status);
                        const customerName = appt.customer
                          ? `${appt.customer.firstName} ${appt.customer.lastName}`.trim()
                          : "Walk-in";

                        return (
                          <div
                            key={appt.id}
                            className={`absolute left-1 right-1 rounded-lg px-3 py-2 border-l-4 text-left overflow-hidden transition-all hover:shadow-lg z-10 ${colors.bg} ${colors.border}`}
                            style={{ top: topPx, height: heightPx }}
                          >
                            {/* Customer name */}
                            <div className={`text-sm font-bold truncate ${colors.text}`}>
                              {customerName}
                            </div>
                            {/* Service + time */}
                            <div className="text-xs text-gray-500 truncate mt-0.5">
                              {appt.service?.name || "Appointment"} &middot; {formatTime(start)} - {formatTime(end)}
                            </div>
                            {/* Phone number if space allows */}
                            {heightPx > 60 && appt.customer?.phone && (
                              <div className="text-xs text-gray-400 truncate mt-0.5">
                                {appt.customer.phone}
                              </div>
                            )}
                            {/* Status dot */}
                            <div className="absolute top-2 right-2">
                              <div className={`w-2 h-2 rounded-full ${colors.dot}`} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Bottom status bar ──────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-2 bg-gray-50 border-t text-xs text-gray-500 flex-shrink-0">
        <div className="flex items-center gap-4">
          <span>Press <kbd className="px-1.5 py-0.5 bg-white border rounded text-gray-700 font-mono">Esc</kbd> to exit</span>
          <span><kbd className="px-1.5 py-0.5 bg-white border rounded text-gray-700 font-mono">&larr;</kbd> <kbd className="px-1.5 py-0.5 bg-white border rounded text-gray-700 font-mono">&rarr;</kbd> navigate days</span>
          <span><kbd className="px-1.5 py-0.5 bg-white border rounded text-gray-700 font-mono">T</kbd> go to today</span>
        </div>
        <div className="flex items-center gap-4">
          {Object.entries(STATUS_COLORS).map(([status, colors]) => (
            <div key={status} className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full ${colors.dot}`} />
              <span className="capitalize">{status}</span>
            </div>
          ))}
        </div>
        <div>
          Auto-refreshes every 10s
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// FULLSCREEN RESERVATIONS (restaurant)
// ═══════════════════════════════════════════════════════════════════════
function FullscreenReservations() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const businessId = user?.businessId;
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [currentTime, setCurrentTime] = useState(new Date());

  // Dynamic business hours with extra padding for fullscreen/kiosk display
  const { hourStart: rawHourStart, hourEnd: rawHourEnd } = useBusinessHours();
  const fsHourStart = Math.max(6, rawHourStart - 1);
  const fsHourEnd = Math.min(23, rawHourEnd + 2);
  const RES_HOURS = useMemo(
    () => Array.from({ length: fsHourEnd - fsHourStart + 1 }, (_, i) => fsHourStart + i),
    [fsHourStart, fsHourEnd]
  );

  // Update current time every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 30000);
    return () => clearInterval(interval);
  }, []);

  // Auto-advance at midnight
  useEffect(() => {
    const now = new Date();
    const msUntilMidnight =
      new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() -
      now.getTime();
    const timeout = setTimeout(() => setSelectedDate(new Date()), msUntilMidnight);
    return () => clearTimeout(timeout);
  }, [selectedDate]);

  // Date query
  const dateStr = selectedDate.toISOString().split("T")[0];

  // Fetch reservations — auto-refetch every 10 seconds
  const { data: reservations = [] } = useQuery<ReservationData[]>({
    queryKey: ["/api/restaurant-reservations", { startDate: getStartOfDay(selectedDate).toISOString(), endDate: getEndOfDay(selectedDate).toISOString() }],
    refetchInterval: 10000,
    staleTime: 5000,
    enabled: !!businessId,
  });

  // Navigation
  const navigateDay = useCallback((offset: number) => {
    setSelectedDate((prev) => {
      const d = new Date(prev);
      d.setDate(d.getDate() + offset);
      return d;
    });
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") navigate("/appointments");
      else if (e.key === "ArrowLeft") navigateDay(-1);
      else if (e.key === "ArrowRight") navigateDay(1);
      else if (e.key === "t" || e.key === "T") setSelectedDate(new Date());
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [navigate, navigateDay]);

  // Sort reservations by time
  const sorted = [...reservations].sort((a, b) =>
    a.reservationTime.localeCompare(b.reservationTime)
  );

  // Summary stats
  const active = sorted.filter((r) => r.status !== "cancelled" && r.status !== "no_show");
  const totalCovers = active.reduce((sum, r) => sum + r.partySize, 0);
  const confirmedCount = sorted.filter((r) => r.status === "confirmed").length;
  const seatedCount = sorted.filter((r) => r.status === "seated").length;
  const completedCount = sorted.filter((r) => r.status === "completed").length;

  // Clock
  const clockStr = currentTime.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  // Time indicator
  const showTimeLine = isToday(selectedDate);
  const timeLineTop =
    ((currentTime.getHours() * 60 + currentTime.getMinutes() - fsHourStart * 60) / 60) *
    HOUR_HEIGHT;

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col overflow-hidden">
      {/* ── Top Bar ────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-3 bg-neutral-900 text-white border-b border-neutral-800 flex-shrink-0">
        {/* Left: date nav */}
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="text-neutral-400 hover:text-white hover:bg-neutral-800"
            onClick={() => navigateDay(-1)}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className={`text-sm font-medium ${isToday(selectedDate) ? "bg-white text-black hover:bg-neutral-200" : "text-neutral-300 hover:text-white hover:bg-neutral-800"}`}
            onClick={() => setSelectedDate(new Date())}
          >
            Today
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-neutral-400 hover:text-white hover:bg-neutral-800"
            onClick={() => navigateDay(1)}
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
          <div className="ml-2">
            <h1 className="text-lg font-bold flex items-center gap-2">
              <Armchair className="h-5 w-5 text-neutral-400" />
              {formatFullDate(selectedDate)}
            </h1>
          </div>
        </div>

        {/* Center: summary stats */}
        <div className="hidden md:flex items-center gap-6">
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-4 w-4 text-neutral-400" />
            <span className="text-sm">
              <span className="font-bold text-white">{active.length}</span>
              <span className="text-neutral-400 ml-1">reservations</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-neutral-400" />
            <span className="text-sm">
              <span className="font-bold text-white">{totalCovers}</span>
              <span className="text-neutral-400 ml-1">covers</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-500" />
            <span className="text-sm">
              <span className="font-bold text-white">{confirmedCount}</span>
              <span className="text-neutral-400 ml-1">confirmed</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-sm">
              <span className="font-bold text-white">{seatedCount}</span>
              <span className="text-neutral-400 ml-1">seated</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-purple-500" />
            <span className="text-sm">
              <span className="font-bold text-white">{completedCount}</span>
              <span className="text-neutral-400 ml-1">completed</span>
            </span>
          </div>
        </div>

        {/* Right: clock + exit */}
        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <div className="text-lg font-mono font-bold tabular-nums">{clockStr}</div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-neutral-400 hover:text-white hover:bg-neutral-800"
            onClick={() => navigate("/appointments")}
          >
            <Minimize2 className="h-4 w-4 mr-2" />
            Exit
          </Button>
        </div>
      </div>

      {/* ── Reservation Time Grid ─────────────────────────────────── */}
      <div className="flex-1 overflow-auto">
        <div className="relative" style={{ minHeight: RES_HOURS.length * HOUR_HEIGHT }}>
          {/* Current time indicator */}
          {showTimeLine && timeLineTop >= 0 && timeLineTop <= RES_HOURS.length * HOUR_HEIGHT && (
            <div
              className="absolute left-0 right-0 z-20 pointer-events-none flex items-center"
              style={{ top: timeLineTop }}
            >
              <div className="w-3 h-3 rounded-full bg-red-500 -ml-1 shadow-lg" />
              <div className="flex-1 h-0.5 bg-red-500 shadow-sm" />
            </div>
          )}

          {/* Hour rows with reservation cards */}
          {RES_HOURS.map((hour) => {
            const hourReservations = sorted.filter((r) => {
              const [rh] = r.reservationTime.split(":").map(Number);
              return rh === hour;
            });

            return (
              <div
                key={hour}
                className="flex border-b border-gray-100"
                style={{ height: HOUR_HEIGHT }}
              >
                {/* Time label */}
                <div className="w-20 flex-shrink-0 border-r bg-gray-50/50 text-right pr-3 pt-2">
                  <span className="text-sm text-gray-400 font-medium">{formatHour(hour)}</span>
                </div>

                {/* Reservation cards for this hour */}
                <div className="flex-1 flex items-start gap-3 px-4 py-2 overflow-x-auto">
                  {hourReservations.map((res) => {
                    const colors = getReservationStatusColors(res.status);
                    const isCancelled = res.status === "cancelled" || res.status === "no_show";

                    return (
                      <div
                        key={res.id}
                        className={`flex-shrink-0 w-72 rounded-lg px-4 py-3 border-l-4 transition-all hover:shadow-lg ${colors.bg} ${colors.border} ${
                          isCancelled ? "opacity-50" : ""
                        }`}
                      >
                        {/* Customer name + party size */}
                        <div className="flex items-center justify-between">
                          <div className={`text-sm font-bold truncate ${colors.text} ${isCancelled ? "line-through" : ""}`}>
                            {res.customer
                              ? `${res.customer.firstName} ${res.customer.lastName}`.trim()
                              : "Guest"}
                          </div>
                          <div className="flex items-center gap-1 ml-2 flex-shrink-0">
                            <Users className="h-4 w-4 text-gray-500" />
                            <span className="text-sm font-bold text-gray-700">{res.partySize}</span>
                          </div>
                        </div>

                        {/* Time + status */}
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-xs text-gray-500">{res.reservationTime}</span>
                          <div className="flex items-center gap-1.5">
                            <div className={`w-2 h-2 rounded-full ${colors.dot}`} />
                            <span className={`text-xs font-medium capitalize ${colors.text}`}>
                              {res.status.replace("_", " ")}
                            </span>
                          </div>
                        </div>

                        {/* Phone */}
                        {res.customer?.phone && (
                          <div className="text-xs text-gray-400 mt-1">{res.customer.phone}</div>
                        )}

                        {/* Special requests */}
                        {res.specialRequests && (
                          <div className="flex items-start gap-1 mt-1.5 text-xs text-amber-700 bg-amber-50 rounded px-2 py-1">
                            <MessageSquare className="h-3 w-3 mt-0.5 flex-shrink-0" />
                            <span className="truncate">{res.specialRequests}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {hourReservations.length === 0 && (
                    <div className="text-xs text-gray-300 italic pt-1">No reservations</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Bottom status bar ──────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-2 bg-gray-50 border-t text-xs text-gray-500 flex-shrink-0">
        <div className="flex items-center gap-4">
          <span>Press <kbd className="px-1.5 py-0.5 bg-white border rounded text-gray-700 font-mono">Esc</kbd> to exit</span>
          <span><kbd className="px-1.5 py-0.5 bg-white border rounded text-gray-700 font-mono">&larr;</kbd> <kbd className="px-1.5 py-0.5 bg-white border rounded text-gray-700 font-mono">&rarr;</kbd> navigate days</span>
          <span><kbd className="px-1.5 py-0.5 bg-white border rounded text-gray-700 font-mono">T</kbd> go to today</span>
        </div>
        <div className="flex items-center gap-4">
          {Object.entries(RESERVATION_STATUS_COLORS).map(([status, colors]) => (
            <div key={status} className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full ${colors.dot}`} />
              <span className="capitalize">{status.replace("_", " ")}</span>
            </div>
          ))}
        </div>
        <div>
          Auto-refreshes every 10s
        </div>
      </div>
    </div>
  );
}
