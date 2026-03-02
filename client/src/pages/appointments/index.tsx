import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { PageLayout } from "@/components/layout/PageLayout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
  Users,
  MoreVertical,
  Scissors,
  Maximize2,
  Phone,
  Mail,
  Globe,
  Bot,
  ExternalLink,
  CheckCircle2,
  XCircle,
  MapPin,
  Armchair,
  AlertTriangle,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ─── Types ───────────────────────────────────────────────────────────
type ViewMode = "week" | "day" | "month";

interface StaffData {
  id: number;
  firstName: string;
  lastName: string;
  role?: string;
  specialty?: string;
  color?: string;
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

function getStartOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function getEndOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
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
    return `${startMonth} ${start.getDate()} – ${end.getDate()}, ${year}`;
  }
  return `${startMonth} ${start.getDate()} – ${endMonth} ${end.getDate()}, ${year}`;
}

function formatMonthYear(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

// ─── Status Helpers ──────────────────────────────────────────────────
const STATUS_COLORS: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  scheduled: { bg: "bg-blue-50", text: "text-blue-700", border: "border-l-blue-500", dot: "bg-blue-500" },
  confirmed: { bg: "bg-green-50", text: "text-green-700", border: "border-l-green-500", dot: "bg-green-500" },
  completed: { bg: "bg-purple-50", text: "text-purple-700", border: "border-l-purple-500", dot: "bg-purple-500" },
  cancelled: { bg: "bg-red-50", text: "text-red-700", border: "border-l-red-500", dot: "bg-red-500" },
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

// ─── Source detection from notes field ────────────────────────────────
function getAppointmentSource(notes?: string): { label: string; icon: React.ReactNode; color: string } {
  if (!notes) return { label: "Manual", icon: <User className="h-3 w-3" />, color: "text-gray-500" };
  if (notes.includes("Online booking")) return { label: "Online Booking", icon: <Globe className="h-3 w-3" />, color: "text-blue-600" };
  if (notes.includes("AI receptionist")) return { label: "AI Receptionist", icon: <Bot className="h-3 w-3" />, color: "text-violet-600" };
  return { label: "Manual", icon: <User className="h-3 w-3" />, color: "text-gray-500" };
}

// ─── Reservation Status Helpers ──────────────────────────────────────
const RESERVATION_STATUS_COLORS: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  confirmed: { bg: "bg-blue-50", text: "text-blue-700", border: "border-l-blue-500", dot: "bg-blue-500" },
  seated: { bg: "bg-green-50", text: "text-green-700", border: "border-l-green-500", dot: "bg-green-500" },
  completed: { bg: "bg-purple-50", text: "text-purple-700", border: "border-l-purple-500", dot: "bg-purple-500" },
  cancelled: { bg: "bg-red-50", text: "text-red-700", border: "border-l-red-500", dot: "bg-red-500" },
  no_show: { bg: "bg-amber-50", text: "text-amber-700", border: "border-l-amber-500", dot: "bg-amber-500" },
};

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

// ─── Time grid constants ─────────────────────────────────────────────
const HOUR_START = 8; // 8 AM
const HOUR_END = 18; // 6 PM
const HOURS = Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => HOUR_START + i);
const HOUR_HEIGHT = 64; // px per hour row (week view)
const DAY_HOUR_HEIGHT = 80; // px per hour row (day view — larger for touch targets)

// Staff column color palette
const STAFF_COLORS = [
  '#3B82F6', // blue
  '#10B981', // emerald
  '#F59E0B', // amber
  '#EF4444', // red
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#06B6D4', // cyan
  '#F97316', // orange
];

function formatHour(hour: number): string {
  if (hour === 0) return "12 AM";
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return "12 PM";
  return `${hour - 12} PM`;
}

// Get staff color for an appointment
function getStaffColor(staffId: number | undefined, staffMembers: StaffData[]): string {
  if (!staffId) return '#9CA3AF';
  const index = staffMembers.findIndex(s => s.id === staffId);
  if (index === -1) return '#9CA3AF';
  return STAFF_COLORS[index % STAFF_COLORS.length];
}

// ─── Main Component ──────────────────────────────────────────────────
export default function Appointments() {
  const { user } = useAuth();
  const businessId = user?.businessId ?? undefined;

  // Check if this is a restaurant — show reservations instead
  const { data: business } = useQuery<any>({
    queryKey: ["/api/business"],
    enabled: !!businessId,
  });

  const isRestaurant = business?.industry?.toLowerCase().includes("restaurant");

  if (isRestaurant) {
    return <ReservationsView businessId={businessId} />;
  }

  return <AppointmentsView businessId={businessId} />;
}

// ─── Appointments View (non-restaurant) ──────────────────────────────
function AppointmentsView({ businessId }: { businessId?: number }) {
  const [, navigate] = useLocation();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [detailSheetOpen, setDetailSheetOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<AppointmentData | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // ─── Date range for current view ────────────────────────────────
  const queryStartDate =
    viewMode === "month"
      ? getStartOfMonth(selectedDate)
      : viewMode === "week"
        ? getStartOfWeek(selectedDate)
        : getStartOfDay(selectedDate);
  const queryEndDate =
    viewMode === "month"
      ? getEndOfMonth(selectedDate)
      : viewMode === "week"
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
    refetchInterval: 10000,
    staleTime: 5000,
  });

  // ─── Fetch staff (always, for color legend) ─────────────────────
  const { data: staffMembers = [] } = useQuery<StaffData[]>({
    queryKey: ["/api/staff", { businessId }],
    enabled: !!businessId,
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

  // ─── Status update mutation ─────────────────────────────────────
  const updateStatusMutation = useMutation({
    mutationFn: ({ appointmentId, status }: { appointmentId: number; status: string }) =>
      apiRequest("PUT", `/api/appointments/${appointmentId}`, { status }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      queryClient.invalidateQueries({ queryKey: [`/api/appointments/${variables.appointmentId}`] });
      toast({
        title: "Status Updated",
        description: `Appointment marked as ${variables.status}`,
      });
      // Update the selected appointment in the panel
      if (selectedAppointment && selectedAppointment.id === variables.appointmentId) {
        setSelectedAppointment({ ...selectedAppointment, status: variables.status });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Could not update status",
        variant: "destructive",
      });
    },
  });

  // ─── Click appointment → open side panel ─────────────────────
  const handleClickAppointment = useCallback((id: number) => {
    const appt = appointments.find(a => a.id === id);
    if (appt) {
      setSelectedAppointment(appt);
      setDetailSheetOpen(true);
    }
  }, [appointments]);

  // ─── Navigation handlers ────────────────────────────────────────
  function navigatePrev() {
    const d = new Date(selectedDate);
    if (viewMode === "month") {
      d.setMonth(d.getMonth() - 1);
    } else {
      d.setDate(d.getDate() - (viewMode === "week" ? 7 : 1));
    }
    setSelectedDate(d);
  }

  function navigateNext() {
    const d = new Date(selectedDate);
    if (viewMode === "month") {
      d.setMonth(d.getMonth() + 1);
    } else {
      d.setDate(d.getDate() + (viewMode === "week" ? 7 : 1));
    }
    setSelectedDate(d);
  }

  function goToday() {
    setSelectedDate(new Date());
  }

  // Week view quick-create: click empty slot → open new appointment pre-filled
  const [prefillDate, setPrefillDate] = useState<Date | null>(null);
  const handleQuickCreate = useCallback((date: Date, hour: number) => {
    const d = new Date(date);
    d.setHours(hour, 0, 0, 0);
    setPrefillDate(d);
    setSheetOpen(true);
  }, []);

  // ─── Render ─────────────────────────────────────────────────────
  return (
    <PageLayout title="Appointments">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold">Appointments</h2>
          <p className="text-gray-500 text-sm">Manage your schedule</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => navigate("/appointments/fullscreen")}
            className="flex items-center"
            title="Open fullscreen schedule view"
          >
            <Maximize2 className="mr-2 h-4 w-4" />
            Enlarge
          </Button>
          <Button onClick={() => { setPrefillDate(null); setSheetOpen(true); }} className="flex items-center">
            <PlusCircle className="mr-2 h-4 w-4" />
            New Appointment
          </Button>
        </div>
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
            {viewMode === "month"
              ? formatMonthYear(selectedDate)
              : viewMode === "week"
                ? formatWeekRange(selectedDate)
                : formatFullDate(selectedDate)}
          </span>
        </div>

        {/* Right: view toggle */}
        <div className="flex rounded-lg border overflow-hidden">
          {(["week", "day", "month"] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-4 py-1.5 text-sm font-medium transition-colors ${
                mode !== "week" ? "border-l" : ""
              } ${
                viewMode === mode
                  ? "bg-primary text-primary-foreground"
                  : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* ── Staff Color Legend ──────────────────────────────────── */}
      {staffMembers.length > 1 && viewMode === "week" && (
        <div className="flex items-center gap-3 mb-3 px-3 py-2 bg-white rounded-lg border text-sm overflow-x-auto">
          <span className="text-gray-500 font-medium flex-shrink-0">Staff:</span>
          {staffMembers.map((s, i) => (
            <div key={s.id} className="flex items-center gap-1.5 flex-shrink-0">
              <div
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: STAFF_COLORS[i % STAFF_COLORS.length] }}
              />
              <span className="text-gray-700">{s.firstName} {s.lastName?.charAt(0) || ""}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Content ────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="flex justify-center items-center h-64 bg-white rounded-lg border">
          <div className="animate-spin w-10 h-10 border-4 border-primary rounded-full border-t-transparent" />
        </div>
      ) : viewMode === "month" ? (
        <MonthView
          appointments={appointments}
          selectedDate={selectedDate}
          onSelectDate={(d) => {
            setSelectedDate(d);
            setViewMode("day");
          }}
        />
      ) : viewMode === "week" ? (
        <WeekView
          appointments={appointments}
          selectedDate={selectedDate}
          staffMembers={staffMembers}
          onSelectDate={(d) => {
            setSelectedDate(d);
            setViewMode("day");
          }}
          onClickAppointment={handleClickAppointment}
          onQuickCreate={handleQuickCreate}
        />
      ) : (
        <StaffDayView
          appointments={appointments}
          staffMembers={staffMembers}
          selectedDate={selectedDate}
          onClickAppointment={handleClickAppointment}
          onSendReminder={(id) => sendReminderMutation.mutate(id)}
          reminderPending={sendReminderMutation.isPending}
          onNewAppointment={() => { setPrefillDate(null); setSheetOpen(true); }}
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

      {/* ── Appointment Detail Side Panel ──────────────────────── */}
      <Sheet open={detailSheetOpen} onOpenChange={setDetailSheetOpen}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          {selectedAppointment && (
            <AppointmentDetailPanel
              appointment={selectedAppointment}
              staffMembers={staffMembers}
              onStatusChange={(status) => {
                updateStatusMutation.mutate({
                  appointmentId: selectedAppointment.id,
                  status,
                });
              }}
              onSendReminder={() => sendReminderMutation.mutate(selectedAppointment.id)}
              reminderPending={sendReminderMutation.isPending}
              statusPending={updateStatusMutation.isPending}
              onViewFull={() => {
                setDetailSheetOpen(false);
                navigate(`/appointments/${selectedAppointment.id}`);
              }}
            />
          )}
        </SheetContent>
      </Sheet>
    </PageLayout>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// APPOINTMENT DETAIL SIDE PANEL
// ═══════════════════════════════════════════════════════════════════════
function AppointmentDetailPanel({
  appointment,
  staffMembers,
  onStatusChange,
  onSendReminder,
  reminderPending,
  statusPending,
  onViewFull,
}: {
  appointment: AppointmentData;
  staffMembers: StaffData[];
  onStatusChange: (status: string) => void;
  onSendReminder: () => void;
  reminderPending: boolean;
  statusPending: boolean;
  onViewFull: () => void;
}) {
  const start = new Date(appointment.startDate);
  const end = new Date(appointment.endDate);
  const durationMin = Math.round((end.getTime() - start.getTime()) / 60000);
  const customerName = appointment.customer
    ? `${appointment.customer.firstName} ${appointment.customer.lastName}`.trim()
    : "Walk-in";
  const source = getAppointmentSource(appointment.notes);
  const staffColor = getStaffColor(appointment.staff?.id, staffMembers);
  const colors = STATUS_COLORS[appointment.status] || STATUS_COLORS.scheduled;

  return (
    <div className="space-y-5">
      <SheetHeader>
        <SheetTitle className="text-xl">{customerName}</SheetTitle>
        <SheetDescription>
          {formatFullDate(start)}
        </SheetDescription>
      </SheetHeader>

      {/* Status badge and source */}
      <div className="flex items-center gap-2 flex-wrap">
        {getStatusBadge(appointment.status)}
        <div className={`flex items-center gap-1 text-xs ${source.color}`}>
          {source.icon}
          <span>{source.label}</span>
        </div>
      </div>

      <Separator />

      {/* Time & Service */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <Clock className="h-4 w-4 text-gray-400 flex-shrink-0" />
          <div>
            <div className="text-sm font-medium">
              {formatTime(start)} – {formatTime(end)}
            </div>
            <div className="text-xs text-gray-500">{durationMin} minutes</div>
          </div>
        </div>

        {appointment.service && (
          <div className="flex items-center gap-3">
            <Scissors className="h-4 w-4 text-gray-400 flex-shrink-0" />
            <div>
              <div className="text-sm font-medium">{appointment.service.name}</div>
              {appointment.service.price && (
                <div className="text-xs text-gray-500">${appointment.service.price}</div>
              )}
            </div>
          </div>
        )}

        {appointment.staff && (
          <div className="flex items-center gap-3">
            <div
              className="w-4 h-4 rounded-full flex-shrink-0"
              style={{ backgroundColor: staffColor }}
            />
            <div className="text-sm font-medium">
              {appointment.staff.firstName} {appointment.staff.lastName}
            </div>
          </div>
        )}
      </div>

      <Separator />

      {/* Customer Contact */}
      {appointment.customer && (
        <div className="space-y-2">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Contact</div>
          {appointment.customer.phone && (
            <div className="flex items-center gap-3">
              <Phone className="h-4 w-4 text-gray-400 flex-shrink-0" />
              <a href={`tel:${appointment.customer.phone}`} className="text-sm text-blue-600 hover:underline">
                {appointment.customer.phone}
              </a>
            </div>
          )}
          {appointment.customer.email && (
            <div className="flex items-center gap-3">
              <Mail className="h-4 w-4 text-gray-400 flex-shrink-0" />
              <a href={`mailto:${appointment.customer.email}`} className="text-sm text-blue-600 hover:underline truncate">
                {appointment.customer.email}
              </a>
            </div>
          )}
        </div>
      )}

      {/* Notes */}
      {appointment.notes && (
        <>
          <Separator />
          <div className="space-y-1">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Notes</div>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">{appointment.notes}</p>
          </div>
        </>
      )}

      <Separator />

      {/* Quick Actions */}
      <div className="space-y-3">
        <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Quick Actions</div>

        {/* Status change */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600 w-16">Status:</span>
          <Select
            value={appointment.status}
            onValueChange={onStatusChange}
            disabled={statusPending}
          >
            <SelectTrigger className="h-8 text-sm flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="scheduled">Scheduled</SelectItem>
              <SelectItem value="confirmed">Confirmed</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2">
          {appointment.status !== "confirmed" && appointment.status !== "cancelled" && appointment.status !== "completed" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onStatusChange("confirmed")}
              disabled={statusPending}
              className="text-green-700 border-green-200 hover:bg-green-50"
            >
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
              Confirm
            </Button>
          )}
          {appointment.status !== "completed" && appointment.status !== "cancelled" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onStatusChange("completed")}
              disabled={statusPending}
              className="text-purple-700 border-purple-200 hover:bg-purple-50"
            >
              <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
              Complete
            </Button>
          )}
          {appointment.status !== "cancelled" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onStatusChange("cancelled")}
              disabled={statusPending}
              className="text-red-700 border-red-200 hover:bg-red-50"
            >
              <XCircle className="h-3.5 w-3.5 mr-1" />
              Cancel
            </Button>
          )}
          {appointment.customer?.phone && appointment.status !== "cancelled" && appointment.status !== "completed" && (
            <Button
              size="sm"
              variant="outline"
              onClick={onSendReminder}
              disabled={reminderPending}
            >
              <MessageSquare className="h-3.5 w-3.5 mr-1" />
              {reminderPending ? "Sending..." : "Send Reminder"}
            </Button>
          )}
        </div>
      </div>

      <Separator />

      {/* View full details */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onViewFull}
        className="w-full text-gray-500"
      >
        <ExternalLink className="h-3.5 w-3.5 mr-1" />
        View Full Details / Edit
      </Button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// MONTH VIEW
// ═══════════════════════════════════════════════════════════════════════
function MonthView({
  appointments,
  selectedDate,
  onSelectDate,
}: {
  appointments: AppointmentData[];
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
}) {
  const year = selectedDate.getFullYear();
  const month = selectedDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  // Build calendar grid: start from the Monday before (or on) the 1st
  const startDow = firstDay.getDay(); // 0=Sun
  const startOffset = startDow === 0 ? -6 : 1 - startDow;
  const calendarStart = new Date(year, month, 1 + startOffset);

  const weeks: Date[][] = [];
  let current = new Date(calendarStart);
  while (weeks.length < 6) {
    const week: Date[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
    weeks.push(week);
    // Stop if we've covered all days of the month
    if (current.getMonth() !== month && current.getDate() > 7) break;
  }

  // Count appointments per day
  const countsByDate = new Map<string, number>();
  appointments.forEach(a => {
    const d = new Date(a.startDate);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    countsByDate.set(key, (countsByDate.get(key) || 0) + 1);
  });

  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div className="bg-white rounded-lg border overflow-hidden">
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b">
        {dayNames.map(d => (
          <div key={d} className="p-2 text-center text-xs font-medium text-gray-500 uppercase">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7 border-b last:border-b-0">
          {week.map((day, di) => {
            const inMonth = day.getMonth() === month;
            const today = isToday(day);
            const key = `${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`;
            const count = countsByDate.get(key) || 0;

            return (
              <button
                key={di}
                onClick={() => onSelectDate(day)}
                className={`relative p-2 min-h-[72px] sm:min-h-[88px] text-left border-r last:border-r-0 transition-colors hover:bg-gray-50 ${
                  !inMonth ? "bg-gray-50/50" : ""
                } ${today ? "bg-blue-50/60" : ""}`}
              >
                <div
                  className={`text-sm font-medium inline-flex items-center justify-center w-7 h-7 rounded-full ${
                    today
                      ? "bg-blue-600 text-white"
                      : inMonth
                        ? "text-gray-900"
                        : "text-gray-400"
                  }`}
                >
                  {day.getDate()}
                </div>
                {count > 0 && (
                  <div className="mt-1 flex items-center gap-1">
                    <div className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${
                      count >= 5
                        ? "bg-red-100 text-red-700"
                        : count >= 3
                          ? "bg-amber-100 text-amber-700"
                          : "bg-blue-100 text-blue-700"
                    }`}>
                      {count} appt{count !== 1 ? "s" : ""}
                    </div>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// WEEK VIEW
// ═══════════════════════════════════════════════════════════════════════
function WeekView({
  appointments,
  selectedDate,
  staffMembers,
  onSelectDate,
  onClickAppointment,
  onQuickCreate,
}: {
  appointments: AppointmentData[];
  selectedDate: Date;
  staffMembers: StaffData[];
  onSelectDate: (date: Date) => void;
  onClickAppointment: (id: number) => void;
  onQuickCreate: (date: Date, hour: number) => void;
}) {
  const isMobile = useIsMobile();
  const weekDays = getWeekDays(selectedDate);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update current time every minute for the time indicator
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  // On mobile, show a day-selector strip + single-day time grid
  if (isMobile) {
    return (
      <MobileWeekView
        appointments={appointments}
        selectedDate={selectedDate}
        staffMembers={staffMembers}
        weekDays={weekDays}
        onSelectDate={onSelectDate}
        onClickAppointment={onClickAppointment}
      />
    );
  }

  // Check if today is in the current week
  const todayInWeek = weekDays.find(d => isToday(d));
  const showTimeLine = !!todayInWeek;
  const todayColumnIndex = todayInWeek ? weekDays.findIndex(d => isToday(d)) : -1;
  const timeLineTop =
    ((currentTime.getHours() * 60 + currentTime.getMinutes() - HOUR_START * 60) / 60) *
    HOUR_HEIGHT;

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
      <div className="relative overflow-x-auto" style={{ minHeight: HOURS.length * HOUR_HEIGHT }}>
        {/* Current time indicator line */}
        {showTimeLine && timeLineTop >= 0 && timeLineTop <= HOURS.length * HOUR_HEIGHT && (
          <div
            className="absolute z-20 pointer-events-none flex items-center"
            style={{
              top: timeLineTop,
              left: `calc(60px + (100% - 60px) / 7 * ${todayColumnIndex})`,
              width: `calc((100% - 60px) / 7)`,
            }}
          >
            <div className="w-2.5 h-2.5 rounded-full bg-red-500 -ml-1.5 flex-shrink-0" />
            <div className="flex-1 h-0.5 bg-red-500" />
          </div>
        )}

        <div className="grid grid-cols-[60px_repeat(7,1fr)]">
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
                const today = isToday(day);

                return (
                  <div
                    key={`cell-${hour}-${dayIdx}`}
                    className={`relative border-l border-b transition-colors hover:bg-gray-50/50 cursor-pointer ${
                      today ? "bg-blue-50/30" : ""
                    }`}
                    style={{ height: HOUR_HEIGHT }}
                    onClick={() => onQuickCreate(day, hour)}
                  >
                    {cellAppts.map((appt) => {
                      const start = new Date(appt.startDate);
                      const minuteOffset = start.getMinutes();
                      const topPx = (minuteOffset / 60) * HOUR_HEIGHT;
                      const end = new Date(appt.endDate);
                      const durationMinutes = (end.getTime() - start.getTime()) / 60000;
                      const heightPx = Math.max((durationMinutes / 60) * HOUR_HEIGHT - 2, 24);
                      const colors = STATUS_COLORS[appt.status] || STATUS_COLORS.scheduled;
                      const isCancelled = appt.status === "cancelled";
                      const staffColor = getStaffColor(appt.staff?.id, staffMembers);

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
                          className={`absolute left-0.5 right-0.5 rounded-md px-1.5 py-0.5 border-l-3 text-left overflow-hidden cursor-pointer transition-all hover:shadow-lg hover:scale-[1.02] z-10 ${colors.bg} ${colors.border} ${
                            isCancelled ? "opacity-50" : ""
                          }`}
                          style={{ top: topPx, height: heightPx }}
                          title={tooltipParts.join(" — ")}
                        >
                          <div className={`flex items-center gap-1 ${colors.text}`}>
                            {/* Staff color dot */}
                            <div
                              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                              style={{ backgroundColor: staffColor }}
                            />
                            <span className={`text-[10px] font-semibold whitespace-nowrap truncate ${isCancelled ? "line-through" : ""}`}>
                              {customerName}
                            </span>
                          </div>
                          {heightPx >= 30 && (
                            <div className="text-[9px] text-gray-500 whitespace-nowrap truncate pl-3">
                              {appt.service?.name || "Appointment"} · {formatTime(start)}
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
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// MOBILE WEEK VIEW — Day selector strip + single-day time grid
// ═══════════════════════════════════════════════════════════════════════
function MobileWeekView({
  appointments,
  selectedDate,
  staffMembers,
  weekDays,
  onSelectDate,
  onClickAppointment,
}: {
  appointments: AppointmentData[];
  selectedDate: Date;
  staffMembers: StaffData[];
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
                    const isCancelled = appt.status === "cancelled";
                    const staffColor = getStaffColor(appt.staff?.id, staffMembers);

                    const customerName = appt.customer
                      ? `${appt.customer.firstName} ${appt.customer.lastName}`.trim()
                      : "Walk-in";

                    return (
                      <button
                        key={appt.id}
                        onClick={() => onClickAppointment(appt.id)}
                        className={`absolute left-1 right-1 rounded-md px-2 py-1 border-l-3 text-left overflow-hidden cursor-pointer transition-shadow active:shadow-md z-10 ${colors.bg} ${colors.border} ${
                          isCancelled ? "opacity-50" : ""
                        }`}
                        style={{ top: topPx, height: heightPx }}
                      >
                        <div className={`flex items-center gap-1 ${colors.text}`}>
                          <div
                            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: staffColor }}
                          />
                          <span className={`text-xs font-semibold whitespace-nowrap truncate ${isCancelled ? "line-through" : ""}`}>
                            {customerName}
                          </span>
                        </div>
                        <div className="text-[11px] text-gray-500 whitespace-nowrap truncate pl-3">
                          {appt.service?.name || "Appointment"} · {formatTime(start)}
                        </div>
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
// STAFF DAY VIEW — Staff columns time grid (Vagaro/Fresha style)
// ═══════════════════════════════════════════════════════════════════════
function StaffDayView({
  appointments,
  staffMembers,
  selectedDate,
  onClickAppointment,
  onSendReminder,
  reminderPending,
  onNewAppointment,
}: {
  appointments: AppointmentData[];
  staffMembers: StaffData[];
  selectedDate: Date;
  onClickAppointment: (id: number) => void;
  onSendReminder: (id: number) => void;
  reminderPending: boolean;
  onNewAppointment: () => void;
}) {
  const isMobile = useIsMobile();
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update current time every minute for the time indicator line
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  // Build columns: active staff + "Unassigned"
  const columns: { id: number | null; name: string; color: string }[] = staffMembers.map(
    (s, i) => ({
      id: s.id,
      name: `${s.firstName} ${s.lastName?.charAt(0) || ""}`.trim(),
      color: STAFF_COLORS[i % STAFF_COLORS.length],
    })
  );
  columns.push({ id: null, name: "Unassigned", color: "#9CA3AF" });

  // Group appointments by staff column
  const appointmentsByColumn = new Map<number | null, AppointmentData[]>();
  columns.forEach((col) => appointmentsByColumn.set(col.id, []));

  appointments.forEach((appt) => {
    const staffId = appt.staff?.id ?? null;
    const bucket = appointmentsByColumn.get(staffId);
    if (bucket) {
      bucket.push(appt);
    } else {
      // Staff not in current list — put in unassigned
      appointmentsByColumn.get(null)!.push(appt);
    }
  });

  // Check if the selected date is today (for the current time indicator)
  const showTimeLine = isToday(selectedDate);
  const timeLineTop =
    ((currentTime.getHours() * 60 + currentTime.getMinutes() - HOUR_START * 60) / 60) *
    DAY_HOUR_HEIGHT;

  // No staff and no appointments — show empty state
  if (staffMembers.length === 0 && appointments.length === 0) {
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

  // ── Mobile: single staff at a time with selector strip ──
  if (isMobile) {
    return (
      <MobileStaffDayView
        columns={columns}
        appointmentsByColumn={appointmentsByColumn}
        selectedDate={selectedDate}
        showTimeLine={showTimeLine}
        timeLineTop={timeLineTop}
        onClickAppointment={onClickAppointment}
        onNewAppointment={onNewAppointment}
      />
    );
  }

  // ── Desktop / iPad: multi-column grid ──
  const colCount = columns.length;
  const gridCols = `60px repeat(${colCount}, minmax(180px, 1fr))`;

  return (
    <div className="bg-white rounded-lg border overflow-hidden">
      {/* Staff header row */}
      <div
        className="grid border-b sticky top-0 z-30 bg-white"
        style={{ gridTemplateColumns: gridCols }}
      >
        <div className="p-2 border-r bg-gray-50" /> {/* Time column spacer */}
        {columns.map((col) => (
          <div
            key={col.id ?? "unassigned"}
            className={`flex items-center gap-2 px-3 py-3 border-r last:border-r-0 ${
              col.id === null ? "bg-gray-50" : ""
            }`}
          >
            {/* Color dot */}
            <div
              className="w-3 h-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: col.color }}
            />
            <span className="text-sm font-semibold text-gray-800 truncate">
              {col.name}
            </span>
            <span className="text-xs text-gray-400 ml-auto flex-shrink-0">
              {appointmentsByColumn.get(col.id)?.length || 0}
            </span>
          </div>
        ))}
      </div>

      {/* Scrollable time grid */}
      <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: "75vh" }}>
        <div
          className="grid relative"
          style={{
            gridTemplateColumns: gridCols,
            minHeight: HOURS.length * DAY_HOUR_HEIGHT,
          }}
        >
          {/* Current time indicator */}
          {showTimeLine && timeLineTop >= 0 && timeLineTop <= HOURS.length * DAY_HOUR_HEIGHT && (
            <div
              className="absolute left-0 right-0 z-20 pointer-events-none flex items-center"
              style={{ top: timeLineTop }}
            >
              <div className="w-2.5 h-2.5 rounded-full bg-red-500 -ml-1" />
              <div className="flex-1 h-0.5 bg-red-500" />
            </div>
          )}

          {/* Hour rows */}
          {HOURS.map((hour) => (
            <div key={`row-${hour}`} className="contents">
              {/* Time label */}
              <div
                className="text-xs text-gray-400 text-right pr-2 pt-1 border-b border-r bg-gray-50/50"
                style={{ height: DAY_HOUR_HEIGHT }}
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
                    className={`relative border-b border-r last:border-r-0 transition-colors hover:bg-gray-50/50 cursor-pointer ${
                      col.id === null ? "bg-gray-50/30" : ""
                    }`}
                    style={{ height: DAY_HOUR_HEIGHT }}
                    onClick={() => onNewAppointment()}
                  >
                    {colAppts.map((appt) => {
                      const start = new Date(appt.startDate);
                      const minuteOffset = start.getMinutes();
                      const topPx = (minuteOffset / 60) * DAY_HOUR_HEIGHT;
                      const end = new Date(appt.endDate);
                      const durationMinutes =
                        (end.getTime() - start.getTime()) / 60000;
                      const heightPx = Math.max(
                        (durationMinutes / 60) * DAY_HOUR_HEIGHT - 2,
                        32
                      );
                      const colors =
                        STATUS_COLORS[appt.status] || STATUS_COLORS.scheduled;
                      const isCancelled = appt.status === "cancelled";

                      const customerName = appt.customer
                        ? `${appt.customer.firstName} ${appt.customer.lastName}`.trim()
                        : "Walk-in";

                      return (
                        <button
                          key={appt.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            onClickAppointment(appt.id);
                          }}
                          className={`absolute left-1 right-1 rounded-md px-2.5 py-1.5 border-l-4 text-left overflow-hidden cursor-pointer transition-all hover:shadow-lg hover:scale-[1.02] z-10 ${colors.bg} ${colors.border} ${
                            isCancelled ? "opacity-50" : ""
                          }`}
                          style={{ top: topPx, height: heightPx }}
                          title={`${formatTime(start)} — ${customerName}${appt.service ? ` — ${appt.service.name}` : ""}`}
                        >
                          <div
                            className={`text-xs font-bold whitespace-nowrap truncate ${colors.text} ${isCancelled ? "line-through" : ""}`}
                          >
                            {customerName}
                          </div>
                          <div className="text-[11px] text-gray-500 whitespace-nowrap truncate">
                            {appt.service?.name || "Appointment"} · {formatTime(start)}
                          </div>
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
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// MOBILE STAFF DAY VIEW — Single staff at a time with staff selector
// ═══════════════════════════════════════════════════════════════════════
function MobileStaffDayView({
  columns,
  appointmentsByColumn,
  selectedDate,
  showTimeLine,
  timeLineTop,
  onClickAppointment,
  onNewAppointment,
}: {
  columns: { id: number | null; name: string; color: string }[];
  appointmentsByColumn: Map<number | null, AppointmentData[]>;
  selectedDate: Date;
  showTimeLine: boolean;
  timeLineTop: number;
  onClickAppointment: (id: number) => void;
  onNewAppointment: () => void;
}) {
  const [activeStaffIndex, setActiveStaffIndex] = useState(0);
  const activeCol = columns[activeStaffIndex];
  const activeAppts = appointmentsByColumn.get(activeCol?.id ?? null) || [];
  const MOBILE_DAY_HOUR_HEIGHT = 70;

  return (
    <div className="bg-white rounded-lg border overflow-hidden">
      {/* Staff selector strip */}
      <div className="flex border-b overflow-x-auto">
        {columns.map((col, i) => {
          const isActive = i === activeStaffIndex;
          const count = appointmentsByColumn.get(col.id)?.length || 0;

          return (
            <button
              key={col.id ?? "unassigned"}
              onClick={() => setActiveStaffIndex(i)}
              className={`flex-shrink-0 flex items-center gap-2 px-4 py-3 text-center transition-colors relative border-r last:border-r-0 ${
                isActive ? "bg-primary/10" : "hover:bg-gray-50"
              }`}
            >
              <div
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: col.color }}
              />
              <span
                className={`text-sm font-medium whitespace-nowrap ${
                  isActive ? "text-primary" : "text-gray-600"
                }`}
              >
                {col.name}
              </span>
              {count > 0 && (
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    isActive
                      ? "bg-primary text-white"
                      : "bg-gray-200 text-gray-600"
                  }`}
                >
                  {count}
                </span>
              )}
              {isActive && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />
              )}
            </button>
          );
        })}
      </div>

      {/* Single-staff time grid */}
      <div className="overflow-y-auto" style={{ maxHeight: "65vh" }}>
        <div
          className="grid grid-cols-[50px_1fr] relative"
          style={{ minHeight: HOURS.length * MOBILE_DAY_HOUR_HEIGHT }}
        >
          {/* Current time indicator */}
          {showTimeLine && (
            <div
              className="absolute left-0 right-0 z-20 pointer-events-none flex items-center"
              style={{
                top:
                  ((new Date().getHours() * 60 +
                    new Date().getMinutes() -
                    HOUR_START * 60) /
                    60) *
                  MOBILE_DAY_HOUR_HEIGHT,
              }}
            >
              <div className="w-2 h-2 rounded-full bg-red-500" />
              <div className="flex-1 h-0.5 bg-red-500" />
            </div>
          )}

          {HOURS.map((hour) => {
            const cellAppts = activeAppts.filter(
              (a) => new Date(a.startDate).getHours() === hour
            );

            return (
              <div key={`mobile-staff-${hour}`} className="contents">
                {/* Time label */}
                <div
                  className="text-[11px] text-gray-400 text-right pr-2 pt-1 border-b"
                  style={{ height: MOBILE_DAY_HOUR_HEIGHT }}
                >
                  {formatHour(hour)}
                </div>
                {/* Single staff cell */}
                <div
                  className="relative border-b cursor-pointer"
                  style={{ height: MOBILE_DAY_HOUR_HEIGHT }}
                  onClick={() => onNewAppointment()}
                >
                  {cellAppts.map((appt) => {
                    const start = new Date(appt.startDate);
                    const minuteOffset = start.getMinutes();
                    const topPx =
                      (minuteOffset / 60) * MOBILE_DAY_HOUR_HEIGHT;
                    const end = new Date(appt.endDate);
                    const durationMinutes =
                      (end.getTime() - start.getTime()) / 60000;
                    const heightPx = Math.max(
                      (durationMinutes / 60) * MOBILE_DAY_HOUR_HEIGHT - 2,
                      28
                    );
                    const colors =
                      STATUS_COLORS[appt.status] || STATUS_COLORS.scheduled;
                    const isCancelled = appt.status === "cancelled";

                    const customerName = appt.customer
                      ? `${appt.customer.firstName} ${appt.customer.lastName}`.trim()
                      : "Walk-in";

                    return (
                      <button
                        key={appt.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          onClickAppointment(appt.id);
                        }}
                        className={`absolute left-1 right-1 rounded-md px-2 py-1 border-l-3 text-left overflow-hidden cursor-pointer transition-shadow active:shadow-md z-10 ${colors.bg} ${colors.border} ${
                          isCancelled ? "opacity-50" : ""
                        }`}
                        style={{ top: topPx, height: heightPx }}
                      >
                        <div
                          className={`text-xs font-semibold whitespace-nowrap truncate ${colors.text} ${isCancelled ? "line-through" : ""}`}
                        >
                          {customerName}
                        </div>
                        <div className="text-[11px] text-gray-500 whitespace-nowrap truncate">
                          {appt.service?.name || "Appointment"} · {formatTime(start)}
                        </div>
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
// RESERVATIONS VIEW — Restaurant-specific reservation management
// ═══════════════════════════════════════════════════════════════════════
function ReservationsView({ businessId }: { businessId?: number }) {
  const isMobile = useIsMobile();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [selectedReservation, setSelectedReservation] = useState<ReservationData | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Compute date range for current view
  const weekStart = getStartOfWeek(selectedDate);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);

  const monthStart = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
  const monthEnd = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0);

  const rangeStart = viewMode === "month" ? monthStart : viewMode === "week" ? weekStart : getStartOfDay(selectedDate);
  const rangeEnd = viewMode === "month" ? monthEnd : viewMode === "week" ? weekEnd : getStartOfDay(selectedDate);

  // Fetch reservations
  const { data: reservations = [], isLoading } = useQuery<ReservationData[]>({
    queryKey: ["/api/restaurant-reservations", { startDate: rangeStart.toISOString(), endDate: rangeEnd.toISOString() }],
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
      toast({ title: "Error", description: "Failed to update reservation status.", variant: "destructive" });
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
  const dateLabel = viewMode === "month"
    ? selectedDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : viewMode === "week"
      ? `${weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${weekEnd.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
      : selectedDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  return (
    <PageLayout title="Reservations">
      {/* Header controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={goToday}>Today</Button>
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
          <div className="inline-flex rounded-lg border bg-muted p-0.5">
            {(["week", "day", "month"] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  viewMode === mode ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
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
              onSelectDate={(d) => { setSelectedDate(d); setViewMode("day"); }}
            />
          )}
          {viewMode === "week" && (
            isMobile ? (
              <ReservationMobileWeekView
                selectedDate={selectedDate}
                weekStart={weekStart}
                reservations={reservations}
                onClickReservation={onClickReservation}
              />
            ) : (
              <ReservationWeekView
                selectedDate={selectedDate}
                weekStart={weekStart}
                reservations={reservations}
                onClickReservation={onClickReservation}
              />
            )
          )}
          {viewMode === "day" && (
            <ReservationDayView
              selectedDate={selectedDate}
              reservations={reservations}
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

  const colors = RESERVATION_STATUS_COLORS[reservation.status] || RESERVATION_STATUS_COLORS.confirmed;
  const source = getReservationSource(reservation.source);

  // Format date nicely
  const dateObj = new Date(reservation.reservationDate + "T00:00:00");
  const dateStr = dateObj.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

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
              <div className="text-xs text-muted-foreground">{reservation.partySize === 1 ? "Guest" : "Guests"}</div>
            </div>
          </div>

          {/* Customer Info */}
          {reservation.customer && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Customer</h4>
              <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                <div className="font-medium">{reservation.customer.firstName} {reservation.customer.lastName}</div>
                {reservation.customer.phone && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Phone className="h-3.5 w-3.5" />
                    <a href={`tel:${reservation.customer.phone}`} className="hover:underline">{reservation.customer.phone}</a>
                  </div>
                )}
                {reservation.customer.email && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Mail className="h-3.5 w-3.5" />
                    <a href={`mailto:${reservation.customer.email}`} className="hover:underline">{reservation.customer.email}</a>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Special Requests */}
          {reservation.specialRequests && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Special Requests</h4>
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
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Actions</h4>
            <div className="grid grid-cols-2 gap-2">
              {reservation.status !== "seated" && reservation.status !== "completed" && reservation.status !== "cancelled" && reservation.status !== "no_show" && (
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
              {reservation.status !== "no_show" && reservation.status !== "completed" && reservation.status !== "cancelled" && (
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
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Change Status</h4>
            <Select value={reservation.status} onValueChange={(v) => onStatusChange(reservation.id, v)}>
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
    const activeReservations = dayReservations.filter((r) => r.status !== "cancelled" && r.status !== "no_show");

    cells.push(
      <button
        key={day}
        onClick={() => onSelectDate(new Date(year, month, day))}
        className={`h-24 border border-gray-100 p-2 text-left hover:bg-gray-50 transition-colors ${
          isToday ? "bg-blue-50/50 border-blue-200" : ""
        }`}
      >
        <div className={`text-sm font-medium mb-1 ${isToday ? "text-blue-600" : "text-gray-700"}`}>{day}</div>
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
          <div key={d} className="text-center text-xs font-medium text-muted-foreground py-2 border-r last:border-r-0">
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
  onClickReservation,
}: {
  selectedDate: Date;
  weekStart: Date;
  reservations: ReservationData[];
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
              <div className="text-xs text-muted-foreground">{day.toLocaleDateString("en-US", { weekday: "short" })}</div>
              <div className={`text-lg font-semibold ${isToday ? "text-blue-600" : ""}`}>{day.getDate()}</div>
            </div>
          );
        })}
      </div>

      {/* Time grid */}
      <div className="grid grid-cols-[60px_repeat(7,1fr)] relative">
        {/* Hour labels */}
        <div>
          {HOURS.map((hour) => (
            <div key={hour} className="h-16 border-b border-r flex items-start justify-end pr-2 pt-1">
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
              {HOURS.map((hour) => (
                <div key={hour} className="h-16 border-b border-gray-100" />
              ))}

              {/* Reservation cards */}
              {dayReservations.map((res) => {
                const [rh, rm] = res.reservationTime.split(":").map(Number);
                const topPx = (rh - HOUR_START + rm / 60) * HOUR_HEIGHT;
                const heightPx = Math.max(HOUR_HEIGHT * 1.5, 48); // 1.5 hours default display height
                const colors = RESERVATION_STATUS_COLORS[res.status] || RESERVATION_STATUS_COLORS.confirmed;
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
                    <div className={`text-xs font-semibold whitespace-nowrap truncate ${colors.text} ${isCancelled ? "line-through" : ""}`}>
                      {res.customer ? `${res.customer.firstName} ${res.customer.lastName}` : "Guest"}
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
  onClickReservation,
}: {
  selectedDate: Date;
  weekStart: Date;
  reservations: ReservationData[];
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
          const count = reservations.filter((r) => r.reservationDate === dateStr && r.status !== "cancelled" && r.status !== "no_show").length;

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
              <div className="text-[10px] uppercase">{day.toLocaleDateString("en-US", { weekday: "short" })}</div>
              <div className="text-lg font-bold">{day.getDate()}</div>
              {count > 0 && (
                <div className={`text-[10px] ${isActive ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
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
          {HOURS.map((hour) => (
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
              const topPx = (rh - HOUR_START + rm / 60) * HOUR_HEIGHT;
              const colors = RESERVATION_STATUS_COLORS[res.status] || RESERVATION_STATUS_COLORS.confirmed;
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
                  <div className={`text-sm font-semibold truncate ${colors.text} ${isCancelled ? "line-through" : ""}`}>
                    {res.customer ? `${res.customer.firstName} ${res.customer.lastName}` : "Guest"}
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
  onClickReservation,
}: {
  selectedDate: Date;
  reservations: ReservationData[];
  onClickReservation: (reservation: ReservationData) => void;
}) {
  const dateStr = selectedDate.toISOString().split("T")[0];
  const dayReservations = reservations
    .filter((r) => r.reservationDate === dateStr)
    .sort((a, b) => a.reservationTime.localeCompare(b.reservationTime));

  const activeReservations = dayReservations.filter((r) => r.status !== "cancelled" && r.status !== "no_show");
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
            const colors = RESERVATION_STATUS_COLORS[res.status] || RESERVATION_STATUS_COLORS.confirmed;
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
                    {res.customer ? `${res.customer.firstName} ${res.customer.lastName}` : "Guest"}
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
