import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useIsMobile } from "@/hooks/use-mobile";
import { useBusinessHours } from "@/hooks/use-business-hours";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/api";
import { formatTime } from "@/lib/utils";
import { PageLayout } from "@/components/layout/PageLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Users,
  Phone,
  Mail,
  MessageSquare,
  Armchair,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  User,
  Globe,
  Bot,
} from "lucide-react";
import {
  getReservationStatusColors,
  formatHour,
} from "@/lib/scheduling-utils";
import type { ReservationData, ViewMode } from "./appointmentHelpers";
import {
  DEFAULT_HOUR_START,
  DEFAULT_HOURS,
  HOUR_HEIGHT,
  getStartOfDay,
  getStartOfWeek,
} from "./appointmentHelpers";

// ─── Reservation Status Helpers ──────────────────────────────────────
function getReservationStatusBadge(status: string) {
  switch (status) {
    case "confirmed":
      return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Confirmed</Badge>;
    case "seated":
      return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Seated</Badge>;
    case "completed":
      return <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-100">Completed</Badge>;
    case "cancelled":
      return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Cancelled</Badge>;
    case "no_show":
      return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">No Show</Badge>;
    default:
      return <Badge>{status}</Badge>;
  }
}

function getReservationSource(source?: string): { label: string; icon: React.ReactNode; color: string } {
  switch (source) {
    case "online":
      return { label: "Online", icon: <Globe className="h-3 w-3" />, color: "text-blue-600" };
    case "phone":
      return { label: "Phone / AI", icon: <Bot className="h-3 w-3" />, color: "text-violet-600" };
    case "walk_in":
      return { label: "Walk-in", icon: <User className="h-3 w-3" />, color: "text-green-600" };
    case "manual":
    default:
      return { label: "Manual", icon: <User className="h-3 w-3" />, color: "text-gray-500" };
  }
}

// ═══════════════════════════════════════════════════════════════════════
// RESERVATIONS VIEW -- Restaurant-specific reservation management
// ═══════════════════════════════════════════════════════════════════════
export function ReservationsView({ businessId }: { businessId?: number }) {
  const [, navigate] = useLocation();
  const isMobile = useIsMobile();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [selectedReservation, setSelectedReservation] = useState<ReservationData | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Dynamic business hours for reservation time grid
  const { hourStart: resHourStart, hours: resHours } = useBusinessHours();

  // Compute date range for current view
  const weekStart = getStartOfWeek(selectedDate);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  const monthStart = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
  const monthEnd = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0);

  const rangeStart =
    viewMode === "month" ? monthStart : viewMode === "week" ? weekStart : getStartOfDay(selectedDate);
  const rangeEnd =
    viewMode === "month" ? monthEnd : viewMode === "week" ? weekEnd : getStartOfDay(selectedDate);

  // Fetch reservations
  const { data: reservations = [], isLoading } = useQuery<ReservationData[]>({
    queryKey: [
      "/api/restaurant-reservations",
      { startDate: rangeStart.toISOString(), endDate: rangeEnd.toISOString() },
    ],
    enabled: !!businessId,
  });

  // Status update mutation
  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiRequest("PUT", `/api/restaurant-reservations/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/restaurant-reservations"] });
      toast({ title: "Status Updated", description: "Reservation status has been updated." });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update reservation status.",
        variant: "destructive",
      });
    },
  });

  const onClickReservation = (reservation: ReservationData) => {
    setSelectedReservation(reservation);
    setDetailOpen(true);
  };

  const onStatusChange = (id: number, status: string) => {
    statusMutation.mutate({ id, status });
    // Update local state so panel reflects change immediately
    if (selectedReservation?.id === id) {
      setSelectedReservation({ ...selectedReservation, status });
    }
  };

  // Navigation
  const goToday = () => setSelectedDate(new Date());
  const goPrev = () => {
    const d = new Date(selectedDate);
    if (viewMode === "month") d.setMonth(d.getMonth() - 1);
    else if (viewMode === "week") d.setDate(d.getDate() - 7);
    else d.setDate(d.getDate() - 1);
    setSelectedDate(d);
  };
  const goNext = () => {
    const d = new Date(selectedDate);
    if (viewMode === "month") d.setMonth(d.getMonth() + 1);
    else if (viewMode === "week") d.setDate(d.getDate() + 7);
    else d.setDate(d.getDate() + 1);
    setSelectedDate(d);
  };

  // Date label
  const dateLabel =
    viewMode === "month"
      ? selectedDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })
      : viewMode === "week"
        ? `${weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} \u2013 ${weekEnd.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
        : selectedDate.toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric",
          });

  return (
    <PageLayout title="Reservations">
      {/* Header controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={goToday}>
            Today
          </Button>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={goPrev}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium min-w-[180px] text-center">{dateLabel}</span>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={goNext}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/appointments/fullscreen")}
            title="Open fullscreen reservation view"
          >
            <Maximize2 className="mr-2 h-4 w-4" />
            Enlarge
          </Button>
          <div className="inline-flex rounded-lg border bg-muted p-0.5">
            {(["week", "day", "month"] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  viewMode === mode
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Loading state */}
      {isLoading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin w-10 h-10 border-4 border-primary rounded-full border-t-transparent" />
        </div>
      ) : (
        <>
          {viewMode === "month" && (
            <ReservationMonthView
              selectedDate={selectedDate}
              reservations={reservations}
              onSelectDate={(d) => {
                setSelectedDate(d);
                setViewMode("day");
              }}
            />
          )}
          {viewMode === "week" &&
            (isMobile ? (
              <ReservationMobileWeekView
                selectedDate={selectedDate}
                weekStart={weekStart}
                reservations={reservations}
                hourStart={resHourStart}
                dynamicHours={resHours}
                onClickReservation={onClickReservation}
              />
            ) : (
              <ReservationWeekView
                selectedDate={selectedDate}
                weekStart={weekStart}
                reservations={reservations}
                hourStart={resHourStart}
                dynamicHours={resHours}
                onClickReservation={onClickReservation}
              />
            ))}
          {viewMode === "day" && (
            <ReservationDayView
              selectedDate={selectedDate}
              reservations={reservations}
              hourStart={resHourStart}
              dynamicHours={resHours}
              onClickReservation={onClickReservation}
            />
          )}
        </>
      )}

      {/* Detail side panel */}
      <ReservationDetailPanel
        reservation={selectedReservation}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onStatusChange={onStatusChange}
      />
    </PageLayout>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// RESERVATION DETAIL PANEL
// ═══════════════════════════════════════════════════════════════════════
function ReservationDetailPanel({
  reservation,
  open,
  onOpenChange,
  onStatusChange,
}: {
  reservation: ReservationData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStatusChange: (id: number, status: string) => void;
}) {
  if (!reservation) return null;

  const colors = getReservationStatusColors(reservation.status);
  const source = getReservationSource(reservation.source);

  // Format date nicely
  const dateObj = new Date(reservation.reservationDate + "T00:00:00");
  const dateStr = dateObj.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  // Format time
  const [h, m] = reservation.reservationTime.split(":").map(Number);
  const timeDate = new Date();
  timeDate.setHours(h, m, 0, 0);
  const timeStr = formatTime(timeDate);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Armchair className="h-5 w-5" />
            Reservation Details
          </SheetTitle>
          <SheetDescription>
            {dateStr} at {timeStr}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Status */}
          <div className="flex items-center justify-between">
            {getReservationStatusBadge(reservation.status)}
            <div className={`flex items-center gap-1 text-xs ${source.color}`}>
              {source.icon}
              <span>{source.label}</span>
            </div>
          </div>

          {/* Party Size */}
          <div className="bg-muted/50 rounded-lg p-4 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${colors.bg}`}>
              <Users className={`h-5 w-5 ${colors.text}`} />
            </div>
            <div>
              <div className="text-2xl font-bold">{reservation.partySize}</div>
              <div className="text-xs text-muted-foreground">
                {reservation.partySize === 1 ? "Guest" : "Guests"}
              </div>
            </div>
          </div>

          {/* Customer Info */}
          {reservation.customer && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Customer
              </h4>
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <div className="font-medium">
                  {reservation.customer.firstName} {reservation.customer.lastName}
                </div>
                {reservation.customer.phone && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Phone className="h-3.5 w-3.5" />
                    <a href={`tel:${reservation.customer.phone}`} className="hover:underline">
                      {reservation.customer.phone}
                    </a>
                  </div>
                )}
                {reservation.customer.email && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Mail className="h-3.5 w-3.5" />
                    <a href={`mailto:${reservation.customer.email}`} className="hover:underline">
                      {reservation.customer.email}
                    </a>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Special Requests */}
          {reservation.specialRequests && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Special Requests
              </h4>
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex items-start gap-2">
                  <MessageSquare className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-amber-900">{reservation.specialRequests}</p>
                </div>
              </div>
            </div>
          )}

          <Separator />

          {/* Status Actions */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Actions
            </h4>
            <div className="grid grid-cols-2 gap-2">
              {reservation.status !== "seated" &&
                reservation.status !== "completed" &&
                reservation.status !== "cancelled" &&
                reservation.status !== "no_show" && (
                  <Button
                    variant="default"
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 text-white"
                    onClick={() => onStatusChange(reservation.id, "seated")}
                  >
                    <Armchair className="h-4 w-4 mr-1" />
                    Seat
                  </Button>
                )}
              {reservation.status === "seated" && (
                <Button
                  variant="default"
                  size="sm"
                  className="bg-purple-600 hover:bg-purple-700 text-white"
                  onClick={() => onStatusChange(reservation.id, "completed")}
                >
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                  Complete
                </Button>
              )}
              {reservation.status !== "cancelled" && reservation.status !== "completed" && (
                <Button
                  variant="outline"
                  size="sm"
                  className="text-red-600 border-red-200 hover:bg-red-50"
                  onClick={() => onStatusChange(reservation.id, "cancelled")}
                >
                  <XCircle className="h-4 w-4 mr-1" />
                  Cancel
                </Button>
              )}
              {reservation.status !== "no_show" &&
                reservation.status !== "completed" &&
                reservation.status !== "cancelled" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-amber-600 border-amber-200 hover:bg-amber-50"
                    onClick={() => onStatusChange(reservation.id, "no_show")}
                  >
                    <AlertTriangle className="h-4 w-4 mr-1" />
                    No Show
                  </Button>
                )}
            </div>
          </div>

          {/* Status dropdown for direct change */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Change Status
            </h4>
            <Select
              value={reservation.status}
              onValueChange={(v) => onStatusChange(reservation.id, v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="confirmed">Confirmed</SelectItem>
                <SelectItem value="seated">Seated</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="no_show">No Show</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// RESERVATION MONTH VIEW
// ═══════════════════════════════════════════════════════════════════════
function ReservationMonthView({
  selectedDate,
  reservations,
  onSelectDate,
}: {
  selectedDate: Date;
  reservations: ReservationData[];
  onSelectDate: (date: Date) => void;
}) {
  const year = selectedDate.getFullYear();
  const month = selectedDate.getMonth();
  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);
  const startDay = firstDayOfMonth.getDay();
  const daysInMonth = lastDayOfMonth.getDate();

  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];

  // Group reservations by date
  const byDate: Record<string, ReservationData[]> = {};
  reservations.forEach((r) => {
    const key = r.reservationDate;
    if (!byDate[key]) byDate[key] = [];
    byDate[key].push(r);
  });

  const cells: React.ReactNode[] = [];

  // Empty cells before first day
  for (let i = 0; i < startDay; i++) {
    cells.push(<div key={`empty-${i}`} className="h-24 border border-gray-100 bg-gray-50/50" />);
  }

  // Day cells
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const dayReservations = byDate[dateStr] || [];
    const isToday = dateStr === todayStr;
    const totalCovers = dayReservations.reduce((sum, r) => sum + r.partySize, 0);
    const activeReservations = dayReservations.filter(
      (r) => r.status !== "cancelled" && r.status !== "no_show"
    );

    cells.push(
      <button
        key={day}
        onClick={() => onSelectDate(new Date(year, month, day))}
        className={`h-24 border border-gray-100 p-2 text-left hover:bg-gray-50 transition-colors ${
          isToday ? "bg-blue-50/50 border-blue-200" : ""
        }`}
      >
        <div className={`text-sm font-medium mb-1 ${isToday ? "text-blue-600" : "text-gray-700"}`}>
          {day}
        </div>
        {activeReservations.length > 0 && (
          <div className="space-y-0.5">
            <div className="text-xs font-medium text-gray-900">
              {activeReservations.length} reservation{activeReservations.length > 1 ? "s" : ""}
            </div>
            <div className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Users className="h-3 w-3" />
              {totalCovers} covers
            </div>
          </div>
        )}
      </button>
    );
  }

  return (
    <div className="bg-white rounded-xl border shadow-sm">
      <div className="grid grid-cols-7 border-b">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div
            key={d}
            className="text-center text-xs font-medium text-muted-foreground py-2 border-r last:border-r-0"
          >
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">{cells}</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// RESERVATION WEEK VIEW (Desktop)
// ═══════════════════════════════════════════════════════════════════════
function ReservationWeekView({
  selectedDate,
  weekStart,
  reservations,
  hourStart = DEFAULT_HOUR_START,
  dynamicHours = DEFAULT_HOURS,
  onClickReservation,
}: {
  selectedDate: Date;
  weekStart: Date;
  reservations: ReservationData[];
  hourStart?: number;
  dynamicHours?: number[];
  onClickReservation: (reservation: ReservationData) => void;
}) {
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];

  // Generate 7 days
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  // Group reservations by date
  const byDate: Record<string, ReservationData[]> = {};
  reservations.forEach((r) => {
    const key = r.reservationDate;
    if (!byDate[key]) byDate[key] = [];
    byDate[key].push(r);
  });

  // Sort by time within each day
  Object.values(byDate).forEach((arr) =>
    arr.sort((a, b) => a.reservationTime.localeCompare(b.reservationTime))
  );

  return (
    <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
      {/* Day headers */}
      <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b">
        <div className="border-r" />
        {days.map((day, i) => {
          const dateStr = day.toISOString().split("T")[0];
          const isToday = dateStr === todayStr;
          return (
            <div
              key={i}
              className={`text-center py-3 border-r last:border-r-0 ${isToday ? "bg-blue-50" : ""}`}
            >
              <div className="text-xs text-muted-foreground">
                {day.toLocaleDateString("en-US", { weekday: "short" })}
              </div>
              <div className={`text-lg font-semibold ${isToday ? "text-blue-600" : ""}`}>
                {day.getDate()}
              </div>
            </div>
          );
        })}
      </div>

      {/* Time grid */}
      <div className="grid grid-cols-[60px_repeat(7,1fr)] relative">
        {/* Hour labels */}
        <div>
          {dynamicHours.map((hour) => (
            <div
              key={hour}
              className="h-16 border-b border-r flex items-start justify-end pr-2 pt-1"
            >
              <span className="text-[11px] text-muted-foreground">{formatHour(hour)}</span>
            </div>
          ))}
        </div>

        {/* Day columns */}
        {days.map((day, dayIdx) => {
          const dateStr = day.toISOString().split("T")[0];
          const dayReservations = byDate[dateStr] || [];

          return (
            <div key={dayIdx} className="relative border-r last:border-r-0">
              {/* Hour grid lines */}
              {dynamicHours.map((hour) => (
                <div key={hour} className="h-16 border-b border-gray-100" />
              ))}

              {/* Reservation cards */}
              {dayReservations.map((res) => {
                const [rh, rm] = res.reservationTime.split(":").map(Number);
                const topPx = (rh - hourStart + rm / 60) * HOUR_HEIGHT;
                const heightPx = Math.max(HOUR_HEIGHT * 1.5, 48);
                const colors = getReservationStatusColors(res.status);
                const isCancelled = res.status === "cancelled" || res.status === "no_show";

                return (
                  <button
                    key={res.id}
                    onClick={() => onClickReservation(res)}
                    className={`absolute left-1 right-1 rounded-md px-2 py-1 border-l-3 text-left overflow-hidden cursor-pointer transition-shadow active:shadow-md z-10 ${colors.bg} ${colors.border} ${
                      isCancelled ? "opacity-50" : ""
                    }`}
                    style={{ top: topPx, height: heightPx }}
                  >
                    <div
                      className={`text-xs font-semibold whitespace-nowrap truncate ${colors.text} ${isCancelled ? "line-through" : ""}`}
                    >
                      {res.customer
                        ? `${res.customer.firstName} ${res.customer.lastName}`
                        : "Guest"}
                    </div>
                    <div className="text-[11px] text-gray-500 whitespace-nowrap truncate flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {res.partySize} · {res.reservationTime}
                    </div>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// RESERVATION MOBILE WEEK VIEW
// ═══════════════════════════════════════════════════════════════════════
function ReservationMobileWeekView({
  selectedDate,
  weekStart,
  reservations,
  hourStart = DEFAULT_HOUR_START,
  dynamicHours = DEFAULT_HOURS,
  onClickReservation,
}: {
  selectedDate: Date;
  weekStart: Date;
  reservations: ReservationData[];
  hourStart?: number;
  dynamicHours?: number[];
  onClickReservation: (reservation: ReservationData) => void;
}) {
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];
  const [activeDayIdx, setActiveDayIdx] = useState(0);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return d;
  });

  // Auto-select today if in view
  useEffect(() => {
    const todayIdx = days.findIndex((d) => d.toISOString().split("T")[0] === todayStr);
    if (todayIdx >= 0) setActiveDayIdx(todayIdx);
  }, [weekStart.toISOString()]);

  const activeDay = days[activeDayIdx];
  const activeDateStr = activeDay.toISOString().split("T")[0];
  const dayReservations = reservations
    .filter((r) => r.reservationDate === activeDateStr)
    .sort((a, b) => a.reservationTime.localeCompare(b.reservationTime));

  return (
    <div className="space-y-4">
      {/* Day selector strip */}
      <div className="flex gap-1 overflow-x-auto pb-2">
        {days.map((day, i) => {
          const dateStr = day.toISOString().split("T")[0];
          const isToday = dateStr === todayStr;
          const isActive = i === activeDayIdx;
          const count = reservations.filter(
            (r) =>
              r.reservationDate === dateStr && r.status !== "cancelled" && r.status !== "no_show"
          ).length;

          return (
            <button
              key={i}
              onClick={() => setActiveDayIdx(i)}
              className={`flex-1 min-w-[52px] text-center py-2 rounded-lg border transition-colors ${
                isActive
                  ? "bg-primary text-primary-foreground border-primary"
                  : isToday
                    ? "bg-blue-50 border-blue-200 text-blue-700"
                    : "border-gray-200 hover:bg-gray-50"
              }`}
            >
              <div className="text-[10px] uppercase">
                {day.toLocaleDateString("en-US", { weekday: "short" })}
              </div>
              <div className="text-lg font-bold">{day.getDate()}</div>
              {count > 0 && (
                <div
                  className={`text-[10px] ${isActive ? "text-primary-foreground/80" : "text-muted-foreground"}`}
                >
                  {count}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Time grid for selected day */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div className="relative">
          {dynamicHours.map((hour) => (
            <div key={hour} className="flex border-b border-gray-100">
              <div className="w-14 flex-shrink-0 border-r flex items-start justify-end pr-2 pt-1 h-16">
                <span className="text-[11px] text-muted-foreground">{formatHour(hour)}</span>
              </div>
              <div className="flex-1 h-16" />
            </div>
          ))}

          {/* Reservation cards overlay */}
          <div className="absolute inset-0 left-14">
            {dayReservations.map((res) => {
              const [rh, rm] = res.reservationTime.split(":").map(Number);
              const topPx = (rh - hourStart + rm / 60) * HOUR_HEIGHT;
              const colors = getReservationStatusColors(res.status);
              const isCancelled = res.status === "cancelled" || res.status === "no_show";

              return (
                <button
                  key={res.id}
                  onClick={() => onClickReservation(res)}
                  className={`absolute left-1 right-1 rounded-md px-3 py-2 border-l-3 text-left cursor-pointer transition-shadow active:shadow-md z-10 ${colors.bg} ${colors.border} ${
                    isCancelled ? "opacity-50" : ""
                  }`}
                  style={{ top: topPx, height: 56 }}
                >
                  <div
                    className={`text-sm font-semibold truncate ${colors.text} ${isCancelled ? "line-through" : ""}`}
                  >
                    {res.customer
                      ? `${res.customer.firstName} ${res.customer.lastName}`
                      : "Guest"}
                  </div>
                  <div className="text-xs text-gray-500 flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {res.partySize} · {res.reservationTime}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// RESERVATION DAY VIEW
// ═══════════════════════════════════════════════════════════════════════
function ReservationDayView({
  selectedDate,
  reservations,
  hourStart = DEFAULT_HOUR_START,
  dynamicHours = DEFAULT_HOURS,
  onClickReservation,
}: {
  selectedDate: Date;
  reservations: ReservationData[];
  hourStart?: number;
  dynamicHours?: number[];
  onClickReservation: (reservation: ReservationData) => void;
}) {
  const dateStr = selectedDate.toISOString().split("T")[0];
  const dayReservations = reservations
    .filter((r) => r.reservationDate === dateStr)
    .sort((a, b) => a.reservationTime.localeCompare(b.reservationTime));

  const activeReservations = dayReservations.filter(
    (r) => r.status !== "cancelled" && r.status !== "no_show"
  );
  const totalCovers = activeReservations.reduce((sum, r) => sum + r.partySize, 0);

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="bg-white rounded-xl border shadow-sm p-4 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <div>
            <div className="text-2xl font-bold">{activeReservations.length}</div>
            <div className="text-xs text-muted-foreground">Reservations</div>
          </div>
          <Separator orientation="vertical" className="h-10" />
          <div>
            <div className="text-2xl font-bold flex items-center gap-1">
              <Users className="h-5 w-5 text-muted-foreground" />
              {totalCovers}
            </div>
            <div className="text-xs text-muted-foreground">Total Covers</div>
          </div>
        </div>
      </div>

      {/* Reservation list */}
      {dayReservations.length === 0 ? (
        <div className="bg-white rounded-xl border shadow-sm p-12 text-center">
          <Armchair className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No reservations for this day</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border shadow-sm divide-y">
          {dayReservations.map((res) => {
            const colors = getReservationStatusColors(res.status);
            const source = getReservationSource(res.source);
            const isCancelled = res.status === "cancelled" || res.status === "no_show";

            return (
              <button
                key={res.id}
                onClick={() => onClickReservation(res)}
                className={`w-full flex items-center gap-4 p-4 text-left hover:bg-gray-50 transition-colors ${
                  isCancelled ? "opacity-60" : ""
                }`}
              >
                {/* Time */}
                <div className="w-16 flex-shrink-0 text-center">
                  <div className="text-sm font-semibold">{res.reservationTime}</div>
                </div>

                {/* Status dot */}
                <div className={`w-3 h-3 rounded-full flex-shrink-0 ${colors.dot}`} />

                {/* Main info */}
                <div className="flex-1 min-w-0">
                  <div className={`font-medium truncate ${isCancelled ? "line-through" : ""}`}>
                    {res.customer
                      ? `${res.customer.firstName} ${res.customer.lastName}`
                      : "Guest"}
                  </div>
                  <div className="text-sm text-muted-foreground flex items-center gap-2">
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {res.partySize}
                    </span>
                    {res.specialRequests && (
                      <span className="flex items-center gap-1 text-amber-600">
                        <MessageSquare className="h-3 w-3" />
                        Note
                      </span>
                    )}
                  </div>
                </div>

                {/* Status + source */}
                <div className="flex-shrink-0 flex flex-col items-end gap-1">
                  {getReservationStatusBadge(res.status)}
                  <div className={`flex items-center gap-1 text-[11px] ${source.color}`}>
                    {source.icon}
                    <span>{source.label}</span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
