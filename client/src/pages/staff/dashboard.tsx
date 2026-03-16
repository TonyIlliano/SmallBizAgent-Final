import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Calendar,
  Clock,
  User,
  Phone,
  Mail,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Briefcase,
  Loader2,
  Maximize2,
  Minimize2,
  Eye,
  CalendarOff,
  Plus,
  X,
} from "lucide-react";

interface StaffProfile {
  id: number;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  specialty?: string;
  bio?: string;
  businessName: string;
  hours: Array<{
    day: string;
    startTime?: string;
    endTime?: string;
    isOff: boolean;
  }>;
}

interface Appointment {
  id: number;
  startDate: string;
  endDate: string;
  status: string;
  notes?: string;
  customer: {
    firstName: string;
    lastName: string;
    phone: string;
    email?: string;
  } | null;
  service: {
    name: string;
    duration: number;
    price: number;
  } | null;
}

const DAYS_ORDER = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

// Time grid constants
const HOUR_START = 8;
const HOUR_END = 18;
const HOURS = Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, i) => HOUR_START + i);
const HOUR_HEIGHT = 70; // px per hour

const STATUS_STYLES: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  confirmed: { bg: "bg-green-50", text: "text-green-700", border: "border-l-green-500", dot: "bg-green-500" },
  scheduled: { bg: "bg-blue-50", text: "text-blue-700", border: "border-l-blue-500", dot: "bg-blue-500" },
  completed: { bg: "bg-purple-50", text: "text-purple-700", border: "border-l-purple-500", dot: "bg-purple-500" },
  cancelled: { bg: "bg-red-50", text: "text-red-700", border: "border-l-red-500", dot: "bg-red-500" },
};

function formatHour(hour: number): string {
  if (hour === 0) return "12 AM";
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return "12 PM";
  return `${hour - 12} PM`;
}

interface StaffTimeOff {
  id: number;
  staffId: number;
  businessId: number;
  startDate: string;
  endDate: string;
  reason?: string | null;
  allDay: boolean;
  note?: string | null;
}

const TIME_OFF_REASONS = ['Vacation', 'Sick', 'Personal', 'Training', 'Holiday', 'Other'];

export default function StaffDashboard() {
  const { user, logoutMutation } = useAuth();
  const { toast } = useToast();
  const queryClientHook = useQueryClient();
  const [, setLocation] = useLocation();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [viewMode, setViewMode] = useState<"list" | "grid">("grid");
  const [showTimeOffForm, setShowTimeOffForm] = useState(false);
  const [timeOffForm, setTimeOffForm] = useState({
    startDate: '',
    endDate: '',
    reason: 'Vacation',
    note: '',
  });

  // Update current time every 30 seconds for the time indicator
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 30000);
    return () => clearInterval(interval);
  }, []);

  // Keyboard shortcuts for fullscreen
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (isFullscreen) {
        if (e.key === "Escape") setIsFullscreen(false);
        else if (e.key === "ArrowLeft") navigateDay(-1);
        else if (e.key === "ArrowRight") navigateDay(1);
        else if (e.key === "t" || e.key === "T") setSelectedDate(new Date());
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isFullscreen]);

  // Fetch staff profile
  const { data: profile, isLoading: profileLoading } = useQuery<StaffProfile>({
    queryKey: ["/api/staff/me"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/staff/me");
      return res.json();
    },
  });

  // Fetch appointments for selected date
  const startOfDay = new Date(selectedDate);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(selectedDate);
  endOfDay.setHours(23, 59, 59, 999);

  const { data: appointments = [], isLoading: appointmentsLoading } = useQuery<Appointment[]>({
    queryKey: ["/api/staff/me/appointments", selectedDate.toISOString().split("T")[0]],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/staff/me/appointments?startDate=${startOfDay.toISOString()}&endDate=${endOfDay.toISOString()}`
      );
      return res.json();
    },
    refetchInterval: 10000, // Auto-refresh every 10 seconds
    staleTime: 5000,
  });

  // Fetch all upcoming appointments
  const { data: upcomingAppointments = [] } = useQuery<Appointment[]>({
    queryKey: ["/api/staff/me/appointments", "upcoming"],
    queryFn: async () => {
      const now = new Date();
      const futureDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      const res = await apiRequest(
        "GET",
        `/api/staff/me/appointments?startDate=${now.toISOString()}&endDate=${futureDate.toISOString()}`
      );
      return res.json();
    },
    refetchInterval: 30000,
  });

  // Fetch time-off entries
  const { data: timeOffEntries = [] } = useQuery<StaffTimeOff[]>({
    queryKey: ["/api/staff/me/time-off"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/staff/me/time-off");
      return res.json();
    },
  });

  // Create time-off mutation
  const createTimeOffMutation = useMutation({
    mutationFn: async (data: typeof timeOffForm) => {
      const res = await apiRequest('POST', '/api/staff/me/time-off', {
        startDate: new Date(data.startDate + 'T00:00:00').toISOString(),
        endDate: new Date(data.endDate + 'T23:59:59').toISOString(),
        reason: data.reason,
        note: data.note || null,
        allDay: true,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClientHook.invalidateQueries({ queryKey: ['/api/staff/me/time-off'] });
      setTimeOffForm({ startDate: '', endDate: '', reason: 'Vacation', note: '' });
      setShowTimeOffForm(false);
      toast({ title: 'Time off added', description: 'Your schedule has been updated.' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to add time off', variant: 'destructive' });
    },
  });

  // Delete time-off mutation
  const deleteTimeOffMutation = useMutation({
    mutationFn: async (timeOffId: number) => {
      await apiRequest('DELETE', `/api/staff/me/time-off/${timeOffId}`);
    },
    onSuccess: () => {
      queryClientHook.invalidateQueries({ queryKey: ['/api/staff/me/time-off'] });
      toast({ title: 'Removed', description: 'Time off entry removed.' });
    },
    onError: () => {
      toast({ title: 'Error', description: 'Failed to remove time off', variant: 'destructive' });
    },
  });

  // Filter to upcoming time-off only
  const upcomingTimeOff = timeOffEntries
    .filter(e => new Date(e.endDate) >= new Date())
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());

  const pastTimeOff = timeOffEntries
    .filter(e => new Date(e.endDate) < new Date())
    .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());

  const formatTimeOffDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  const navigateDay = (offset: number) => {
    const newDate = new Date(selectedDate);
    newDate.setDate(newDate.getDate() + offset);
    setSelectedDate(newDate);
  };

  const isTodaySelected = selectedDate.toDateString() === new Date().toDateString();

  const formatTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "confirmed":
        return "bg-green-100 text-green-800";
      case "scheduled":
        return "bg-blue-100 text-blue-800";
      case "completed":
        return "bg-purple-100 text-purple-800";
      case "cancelled":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getDayName = () => {
    return selectedDate.toLocaleDateString("en-US", { weekday: "long" }).toLowerCase();
  };

  const todaySchedule = profile?.hours?.find((h) => h.day === getDayName());

  // Time line indicator
  const showTimeLine = isTodaySelected;
  const timeLineTop =
    ((currentTime.getHours() * 60 + currentTime.getMinutes() - HOUR_START * 60) / 60) *
    HOUR_HEIGHT;

  // Summary stats
  const totalToday = appointments.length;
  const confirmedCount = appointments.filter((a) => a.status === "confirmed").length;
  const scheduledCount = appointments.filter((a) => a.status === "scheduled").length;
  const completedCount = appointments.filter((a) => a.status === "completed").length;

  if (profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // FULLSCREEN MODE
  // ═══════════════════════════════════════════════════════════════════
  if (isFullscreen) {
    const clockStr = currentTime.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });

    const FS_HOUR_HEIGHT = 90;
    const fsTimeLineTop =
      ((currentTime.getHours() * 60 + currentTime.getMinutes() - HOUR_START * 60) / 60) *
      FS_HOUR_HEIGHT;

    return (
      <div className="fixed inset-0 z-50 bg-white flex flex-col overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center justify-between px-6 py-3 bg-black text-white border-b border-neutral-800 flex-shrink-0">
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
              className={`text-sm font-medium ${isTodaySelected ? "bg-white text-black hover:bg-neutral-200" : "text-neutral-300 hover:text-white hover:bg-neutral-800"}`}
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
              <h1 className="text-lg font-bold">{formatDate(selectedDate)}</h1>
              <p className="text-xs text-neutral-400">
                {profile?.firstName} {profile?.lastName} — {profile?.businessName}
              </p>
            </div>
          </div>

          {/* Center stats */}
          <div className="hidden md:flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-neutral-400" />
              <span className="text-sm">
                <span className="font-bold">{totalToday}</span>
                <span className="text-neutral-400 ml-1">total</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              <span className="text-sm">
                <span className="font-bold">{confirmedCount}</span>
                <span className="text-neutral-400 ml-1">confirmed</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-blue-500" />
              <span className="text-sm">
                <span className="font-bold">{scheduledCount}</span>
                <span className="text-neutral-400 ml-1">scheduled</span>
              </span>
            </div>
          </div>

          {/* Right: clock + exit */}
          <div className="flex items-center gap-4">
            <div className="text-lg font-mono font-bold tabular-nums hidden sm:block">{clockStr}</div>
            <Button
              variant="ghost"
              size="sm"
              className="text-neutral-400 hover:text-white hover:bg-neutral-800"
              onClick={() => setIsFullscreen(false)}
            >
              <Minimize2 className="h-4 w-4 mr-2" />
              Exit
            </Button>
          </div>
        </div>

        {/* Schedule grid */}
        <div className="flex-1 overflow-auto">
          <div
            className="grid grid-cols-[72px_1fr] relative"
            style={{ minHeight: HOURS.length * FS_HOUR_HEIGHT }}
          >
            {/* Current time indicator */}
            {showTimeLine && fsTimeLineTop >= 0 && fsTimeLineTop <= HOURS.length * FS_HOUR_HEIGHT && (
              <div
                className="absolute left-0 right-0 z-20 pointer-events-none flex items-center"
                style={{ top: fsTimeLineTop }}
              >
                <div className="w-3 h-3 rounded-full bg-red-500 -ml-1 shadow-lg" />
                <div className="flex-1 h-0.5 bg-red-500" />
              </div>
            )}

            {HOURS.map((hour) => {
              const hourAppts = appointments.filter(
                (a) => new Date(a.startDate).getHours() === hour
              );

              return (
                <div key={`fs-${hour}`} className="contents">
                  <div
                    className="text-sm text-gray-400 text-right pr-3 pt-2 border-b border-r bg-gray-50/50 font-medium"
                    style={{ height: FS_HOUR_HEIGHT }}
                  >
                    {formatHour(hour)}
                  </div>
                  <div
                    className="relative border-b"
                    style={{ height: FS_HOUR_HEIGHT }}
                  >
                    {hourAppts.map((appt) => {
                      const start = new Date(appt.startDate);
                      const minuteOffset = start.getMinutes();
                      const topPx = (minuteOffset / 60) * FS_HOUR_HEIGHT;
                      const end = new Date(appt.endDate);
                      const durationMinutes = (end.getTime() - start.getTime()) / 60000;
                      const heightPx = Math.max((durationMinutes / 60) * FS_HOUR_HEIGHT - 2, 40);
                      const colors = STATUS_STYLES[appt.status] || STATUS_STYLES.scheduled;
                      const customerName = appt.customer
                        ? `${appt.customer.firstName} ${appt.customer.lastName}`.trim()
                        : "Walk-in";

                      return (
                        <div
                          key={appt.id}
                          className={`absolute left-2 right-2 rounded-lg px-4 py-2 border-l-4 overflow-hidden transition-all hover:shadow-lg z-10 ${colors.bg} ${colors.border}`}
                          style={{ top: topPx, height: heightPx }}
                        >
                          <div className={`text-base font-bold truncate ${colors.text}`}>
                            {customerName}
                          </div>
                          <div className="text-sm text-gray-500 truncate">
                            {appt.service?.name || "Appointment"} &middot; {formatTime(appt.startDate)} - {formatTime(appt.endDate)}
                          </div>
                          {heightPx > 60 && appt.customer?.phone && (
                            <div className="text-sm text-gray-400 truncate mt-0.5">
                              {appt.customer.phone}
                            </div>
                          )}
                          <div className="absolute top-2 right-2">
                            <div className={`w-2.5 h-2.5 rounded-full ${colors.dot}`} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Bottom bar */}
        <div className="flex items-center justify-between px-6 py-2 bg-gray-50 border-t text-xs text-gray-500 flex-shrink-0">
          <div className="flex items-center gap-4">
            <span>Press <kbd className="px-1.5 py-0.5 bg-white border rounded text-gray-700 font-mono">Esc</kbd> to exit</span>
            <span><kbd className="px-1.5 py-0.5 bg-white border rounded text-gray-700 font-mono">&larr;</kbd> <kbd className="px-1.5 py-0.5 bg-white border rounded text-gray-700 font-mono">&rarr;</kbd> navigate</span>
            <span><kbd className="px-1.5 py-0.5 bg-white border rounded text-gray-700 font-mono">T</kbd> today</span>
          </div>
          <div className="flex items-center gap-3">
            {Object.entries(STATUS_STYLES).map(([status, colors]) => (
              <div key={status} className="flex items-center gap-1">
                <div className={`w-2 h-2 rounded-full ${colors.dot}`} />
                <span className="capitalize">{status}</span>
              </div>
            ))}
          </div>
          <span className="flex items-center gap-1">
            <Eye className="h-3 w-3" /> View only &middot; Auto-refreshes
          </span>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════
  // NORMAL MODE
  // ═══════════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="sticky top-0 z-10 bg-black text-white border-b border-neutral-800">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold">
              {profile?.firstName} {profile?.lastName}
            </h1>
            <p className="text-xs text-neutral-400">
              {profile?.specialty || "Team Member"} — {profile?.businessName}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="bg-neutral-800 text-neutral-300 border-neutral-700">
              <Eye className="h-3 w-3 mr-1" />
              View Only
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              className="text-neutral-400 hover:text-white"
              onClick={() => logoutMutation.mutate()}
            >
              <LogOut className="h-4 w-4 mr-1" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-3xl font-bold">{appointments.length}</div>
              <p className="text-sm text-muted-foreground">Today</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-3xl font-bold">
                {upcomingAppointments.filter((a) => a.status === "confirmed").length}
              </div>
              <p className="text-sm text-muted-foreground">Confirmed</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-3xl font-bold">{upcomingAppointments.length}</div>
              <p className="text-sm text-muted-foreground">This Month</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-sm font-medium">
                {todaySchedule?.isOff
                  ? "Day Off"
                  : todaySchedule
                  ? `${todaySchedule.startTime} - ${todaySchedule.endTime}`
                  : "No schedule"}
              </div>
              <p className="text-sm text-muted-foreground">Today's Hours</p>
            </CardContent>
          </Card>
        </div>

        {/* Date Navigator + View Controls */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                My Appointments
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => navigateDay(-1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant={isTodaySelected ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedDate(new Date())}
                >
                  Today
                </Button>
                <Button variant="outline" size="sm" onClick={() => navigateDay(1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <div className="border-l pl-2 ml-1 flex items-center gap-1">
                  {/* View mode toggle */}
                  <div className="flex rounded-lg border overflow-hidden">
                    <button
                      onClick={() => setViewMode("grid")}
                      className={`px-3 py-1 text-xs font-medium transition-colors ${
                        viewMode === "grid"
                          ? "bg-primary text-primary-foreground"
                          : "bg-white text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      Grid
                    </button>
                    <button
                      onClick={() => setViewMode("list")}
                      className={`px-3 py-1 text-xs font-medium transition-colors border-l ${
                        viewMode === "list"
                          ? "bg-primary text-primary-foreground"
                          : "bg-white text-gray-600 hover:bg-gray-50"
                      }`}
                    >
                      List
                    </button>
                  </div>
                  {/* Fullscreen button */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsFullscreen(true)}
                    title="Open fullscreen schedule"
                  >
                    <Maximize2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
            <CardDescription>{formatDate(selectedDate)}</CardDescription>
          </CardHeader>
          <CardContent>
            {appointmentsLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : appointments.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Calendar className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p className="font-medium">No appointments</p>
                <p className="text-sm">
                  {isTodaySelected ? "You're free today!" : "Nothing scheduled for this day."}
                </p>
              </div>
            ) : viewMode === "grid" ? (
              /* ── Visual Time Grid ──────────────────────────────────── */
              <div className="border rounded-lg overflow-hidden bg-white">
                <div className="overflow-y-auto" style={{ maxHeight: "65vh" }}>
                  <div
                    className="grid grid-cols-[60px_1fr] relative"
                    style={{ minHeight: HOURS.length * HOUR_HEIGHT }}
                  >
                    {/* Current time indicator */}
                    {showTimeLine && timeLineTop >= 0 && timeLineTop <= HOURS.length * HOUR_HEIGHT && (
                      <div
                        className="absolute left-0 right-0 z-20 pointer-events-none flex items-center"
                        style={{ top: timeLineTop }}
                      >
                        <div className="w-2.5 h-2.5 rounded-full bg-red-500 -ml-0.5 shadow-lg" />
                        <div className="flex-1 h-0.5 bg-red-500" />
                      </div>
                    )}

                    {HOURS.map((hour) => {
                      const hourAppts = appointments.filter(
                        (a) => new Date(a.startDate).getHours() === hour
                      );

                      return (
                        <div key={`grid-${hour}`} className="contents">
                          <div
                            className="text-xs text-gray-400 text-right pr-2 pt-1 border-b border-r bg-gray-50/50"
                            style={{ height: HOUR_HEIGHT }}
                          >
                            {formatHour(hour)}
                          </div>
                          <div
                            className="relative border-b"
                            style={{ height: HOUR_HEIGHT }}
                          >
                            {hourAppts.map((appt) => {
                              const start = new Date(appt.startDate);
                              const minuteOffset = start.getMinutes();
                              const topPx = (minuteOffset / 60) * HOUR_HEIGHT;
                              const end = new Date(appt.endDate);
                              const durationMinutes = (end.getTime() - start.getTime()) / 60000;
                              const heightPx = Math.max((durationMinutes / 60) * HOUR_HEIGHT - 2, 32);
                              const colors = STATUS_STYLES[appt.status] || STATUS_STYLES.scheduled;
                              const customerName = appt.customer
                                ? `${appt.customer.firstName} ${appt.customer.lastName}`.trim()
                                : "Walk-in";

                              return (
                                <div
                                  key={appt.id}
                                  className={`absolute left-1 right-1 rounded-md px-3 py-1.5 border-l-4 overflow-hidden transition-all hover:shadow-md z-10 ${colors.bg} ${colors.border}`}
                                  style={{ top: topPx, height: heightPx }}
                                >
                                  <div className={`text-xs font-bold truncate ${colors.text}`}>
                                    {customerName}
                                  </div>
                                  <div className="text-[11px] text-gray-500 truncate">
                                    {appt.service?.name || "Appointment"} &middot; {formatTime(appt.startDate)} - {formatTime(appt.endDate)}
                                  </div>
                                  {heightPx > 50 && appt.customer?.phone && (
                                    <div className="text-[10px] text-gray-400 truncate">
                                      {appt.customer.phone}
                                    </div>
                                  )}
                                  <div className="absolute top-1.5 right-1.5">
                                    <div className={`w-2 h-2 rounded-full ${colors.dot}`} />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                {/* Legend */}
                <div className="flex items-center gap-4 px-4 py-2 bg-gray-50 border-t text-xs text-gray-500">
                  {Object.entries(STATUS_STYLES).map(([status, colors]) => (
                    <div key={status} className="flex items-center gap-1">
                      <div className={`w-2 h-2 rounded-full ${colors.dot}`} />
                      <span className="capitalize">{status}</span>
                    </div>
                  ))}
                  <span className="ml-auto flex items-center gap-1">
                    <Eye className="h-3 w-3" /> View only
                  </span>
                </div>
              </div>
            ) : (
              /* ── List View ──────────────────────────────────────────── */
              <div className="space-y-3">
                {appointments
                  .sort(
                    (a, b) =>
                      new Date(a.startDate).getTime() - new Date(b.startDate).getTime()
                  )
                  .map((apt) => (
                    <div
                      key={apt.id}
                      className="border rounded-lg p-4 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">
                              {formatTime(apt.startDate)} — {formatTime(apt.endDate)}
                            </span>
                            <Badge className={getStatusColor(apt.status)}>
                              {apt.status}
                            </Badge>
                          </div>

                          {apt.service && (
                            <div className="flex items-center gap-2 text-sm">
                              <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
                              <span>
                                {apt.service.name} ({apt.service.duration} min)
                              </span>
                            </div>
                          )}

                          {apt.customer && (
                            <div className="flex items-center gap-2 text-sm">
                              <User className="h-3.5 w-3.5 text-muted-foreground" />
                              <span>
                                {apt.customer.firstName} {apt.customer.lastName}
                              </span>
                              {apt.customer.phone && (
                                <>
                                  <Phone className="h-3.5 w-3.5 text-muted-foreground ml-2" />
                                  <a
                                    href={`tel:${apt.customer.phone}`}
                                    className="text-primary underline"
                                  >
                                    {apt.customer.phone}
                                  </a>
                                </>
                              )}
                            </div>
                          )}

                          {apt.notes && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Notes: {apt.notes}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Weekly Schedule */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              My Schedule
            </CardTitle>
            <CardDescription>Your regular working hours</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {DAYS_ORDER.map((day) => {
                const dayHours = profile?.hours?.find((h) => h.day === day);
                const isCurrentDay = getDayName() === day;
                return (
                  <div
                    key={day}
                    className={`flex items-center justify-between p-3 rounded-lg ${
                      isCurrentDay ? "bg-primary/10 border border-primary/20" : "hover:bg-muted/50"
                    }`}
                  >
                    <span className="font-medium capitalize w-28">{day}</span>
                    {dayHours?.isOff ? (
                      <Badge variant="secondary">Day Off</Badge>
                    ) : dayHours ? (
                      <span className="text-sm">
                        {dayHours.startTime} — {dayHours.endTime}
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">Not set</span>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Time Off */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <CalendarOff className="h-5 w-5" />
                  Time Off
                </CardTitle>
                <CardDescription>Request days off — the AI won't book you during these times</CardDescription>
              </div>
              <Button size="sm" variant="outline" onClick={() => setShowTimeOffForm(!showTimeOffForm)}>
                <Plus className="h-4 w-4 mr-1" />
                Add
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {/* Add time off form */}
            {showTimeOffForm && (
              <div className="space-y-3 mb-4 p-3 border rounded-lg bg-muted/30">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Start Date</Label>
                    <Input
                      type="date"
                      value={timeOffForm.startDate}
                      onChange={(e) => {
                        const val = e.target.value;
                        setTimeOffForm(prev => ({
                          ...prev,
                          startDate: val,
                          endDate: (!prev.endDate || val > prev.endDate) ? val : prev.endDate,
                        }));
                      }}
                      min={new Date().toISOString().split('T')[0]}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">End Date</Label>
                    <Input
                      type="date"
                      value={timeOffForm.endDate}
                      onChange={(e) => setTimeOffForm({ ...timeOffForm, endDate: e.target.value })}
                      min={timeOffForm.startDate || new Date().toISOString().split('T')[0]}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Reason</Label>
                    <Select
                      value={timeOffForm.reason}
                      onValueChange={(value) => setTimeOffForm({ ...timeOffForm, reason: value })}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TIME_OFF_REASONS.map(r => (
                          <SelectItem key={r} value={r}>{r}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Note</Label>
                    <Input
                      value={timeOffForm.note}
                      onChange={(e) => setTimeOffForm({ ...timeOffForm, note: e.target.value })}
                      placeholder="Optional"
                      className="h-9"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => createTimeOffMutation.mutate(timeOffForm)}
                    disabled={!timeOffForm.startDate || !timeOffForm.endDate || createTimeOffMutation.isPending}
                  >
                    {createTimeOffMutation.isPending ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4 mr-1" />
                    )}
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowTimeOffForm(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {/* Time off entries */}
            {upcomingTimeOff.length === 0 && pastTimeOff.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-3">
                No time off scheduled. Tap "Add" to request days off.
              </p>
            ) : (
              <div className="space-y-2">
                {upcomingTimeOff.map((entry) => {
                  const isSameDay = new Date(entry.startDate).toDateString() === new Date(entry.endDate).toDateString();
                  return (
                    <div key={entry.id} className="flex items-center justify-between p-2 rounded-lg border bg-muted/50">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium">
                          {isSameDay
                            ? formatTimeOffDate(entry.startDate)
                            : `${formatTimeOffDate(entry.startDate)} - ${formatTimeOffDate(entry.endDate)}`
                          }
                        </div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          {entry.reason && <Badge variant="outline" className="text-xs py-0 h-5">{entry.reason}</Badge>}
                          {entry.note && <span className="truncate">{entry.note}</span>}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (confirm('Remove this time off?')) {
                            deleteTimeOffMutation.mutate(entry.id);
                          }
                        }}
                        disabled={deleteTimeOffMutation.isPending}
                      >
                        <X className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  );
                })}
                {pastTimeOff.slice(0, 3).map((entry) => {
                  const isSameDay = new Date(entry.startDate).toDateString() === new Date(entry.endDate).toDateString();
                  return (
                    <div key={entry.id} className="flex items-center justify-between p-2 rounded-lg border opacity-50 bg-muted/20">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm">
                          {isSameDay
                            ? formatTimeOffDate(entry.startDate)
                            : `${formatTimeOffDate(entry.startDate)} - ${formatTimeOffDate(entry.endDate)}`
                          }
                        </div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          {entry.reason && <Badge variant="secondary" className="text-xs py-0 h-5">{entry.reason}</Badge>}
                          <Badge variant="secondary" className="text-xs py-0 h-5">Past</Badge>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Profile Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              My Profile
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xl font-bold">
                  {profile?.firstName?.[0]}
                  {profile?.lastName?.[0]}
                </div>
                <div>
                  <h3 className="font-semibold text-lg">
                    {profile?.firstName} {profile?.lastName}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {profile?.specialty || "Team Member"}
                  </p>
                </div>
              </div>
              {profile?.email && (
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  {profile.email}
                </div>
              )}
              {profile?.phone && (
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  {profile.phone}
                </div>
              )}
              {profile?.bio && (
                <p className="text-sm text-muted-foreground mt-2">{profile.bio}</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
