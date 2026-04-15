import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { PageLayout } from "@/components/layout/PageLayout";
import { Button } from "@/components/ui/button";
import { QueryErrorBanner } from "@/components/ui/query-error-banner";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/api";
import { FeatureTip } from "@/components/ui/feature-tip";
import { ExportButton } from "@/components/ui/export-button";
import {
  PlusCircle,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Globe,
  Plus,
} from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useBusinessHours } from "@/hooks/use-business-hours";
import { AppointmentForm } from "@/components/appointments/AppointmentForm";
import { QuickStatsBar } from "@/components/appointments/QuickStatsBar";
import { StaffFilterPills } from "@/components/appointments/StaffFilterPills";
import { AppointmentDetailPanel } from "@/components/appointments/AppointmentDetailPanel";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { AppointmentData, StaffData, ViewMode } from "@/components/appointments/appointmentHelpers";
import {
  getStartOfDay,
  getEndOfDay,
  getStartOfWeek,
  getEndOfWeek,
  getStartOfMonth,
  getEndOfMonth,
  isSameDay,
  formatFullDate,
  formatWeekRange,
  formatMonthYear,
} from "@/components/appointments/appointmentHelpers";

// ─── Lazy-loaded view components ────────────────────────────────────
const MonthView = lazy(() =>
  import("@/components/appointments/MonthView").then((m) => ({ default: m.MonthView }))
);
const WeekView = lazy(() =>
  import("@/components/appointments/WeekView").then((m) => ({ default: m.WeekView }))
);
const StaffDayView = lazy(() =>
  import("@/components/appointments/StaffDayView").then((m) => ({ default: m.StaffDayView }))
);
const ReservationsView = lazy(() =>
  import("@/components/appointments/ReservationsView").then((m) => ({ default: m.ReservationsView }))
);

// ─── Shared loading spinner ─────────────────────────────────────────
function ViewLoader() {
  return (
    <div className="flex justify-center items-center h-64 bg-white rounded-lg border">
      <div className="animate-spin w-10 h-10 border-4 border-primary rounded-full border-t-transparent" />
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────
export default function Appointments() {
  const { user } = useAuth();
  const businessId = user?.businessId ?? undefined;

  const { data: business } = useQuery<any>({
    queryKey: ["/api/business"],
    enabled: !!businessId,
  });

  const isRestaurant = business?.industry?.toLowerCase().includes("restaurant");

  if (isRestaurant) {
    return (
      <Suspense fallback={<ViewLoader />}>
        <ReservationsView businessId={businessId} />
      </Suspense>
    );
  }

  return <AppointmentsView businessId={businessId} />;
}

// ─── Appointments View (non-restaurant) ─────────────────────────────
function AppointmentsView({ businessId }: { businessId?: number }) {
  const [, navigate] = useLocation();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [detailSheetOpen, setDetailSheetOpen] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<AppointmentData | null>(null);
  const [prefillDate, setPrefillDate] = useState<Date | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();

  // Dynamic business hours + vertical labels
  const { hourStart, hourEnd, hours: dynamicHours, labels } = useBusinessHours();

  // Staff visibility toggle state
  const [visibleStaffIds, setVisibleStaffIds] = useState<Set<number | null>>(new Set());

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

  // ─── Fetch appointments ──────────────────────────────────────────
  const { data: appointments = [], isLoading, isError, error: queryError, refetch } = useQuery<AppointmentData[]>({
    queryKey: ["/api/appointments", queryParams],
    refetchInterval: 10000,
    staleTime: 5000,
  });

  // ─── Fetch staff ─────────────────────────────────────────────────
  const { data: staffMembers = [] } = useQuery<StaffData[]>({
    queryKey: ["/api/staff", { businessId }],
    enabled: !!businessId,
  });

  // ─── Sync staff visibility with staff data ───────────────────────
  useEffect(() => {
    const newSet = new Set<number | null>(staffMembers.map((s) => s.id));
    newSet.add(null); // Unassigned
    setVisibleStaffIds(newSet);
  }, [staffMembers]);

  const toggleStaffVisibility = useCallback((staffId: number | null) => {
    setVisibleStaffIds((prev) => {
      const next = new Set(prev);
      if (next.has(staffId)) {
        if (next.size > 1) next.delete(staffId);
      } else {
        next.add(staffId);
      }
      return next;
    });
  }, []);

  const showAllStaff = useCallback(() => {
    const all = new Set<number | null>(staffMembers.map((s) => s.id));
    all.add(null);
    setVisibleStaffIds(all);
  }, [staffMembers]);

  // ─── Appointment counts per staff (for filter pills) ─────────────
  const appointmentCounts = useMemo(() => {
    const counts = new Map<number | null, number>();
    appointments.forEach((a) => {
      if (a.status === "cancelled") return;
      const staffId = a.staff?.id ?? null;
      counts.set(staffId, (counts.get(staffId) || 0) + 1);
    });
    return counts;
  }, [appointments]);

  // ─── Filter appointments by visible staff ────────────────────────
  const filteredAppointments = useMemo(() => {
    return appointments.filter((a) => {
      const staffId = a.staff?.id ?? null;
      return visibleStaffIds.has(staffId);
    });
  }, [appointments, visibleStaffIds]);

  // ─── Today's appointments for stats bar ──────────────────────────
  const todayAppointments = useMemo(() => {
    const today = new Date();
    return appointments.filter((a) => isSameDay(new Date(a.startDate), today));
  }, [appointments]);

  // ─── Send reminder mutation ──────────────────────────────────────
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

  // ─── Status update mutation ──────────────────────────────────────
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

  // ─── Drag-and-drop reschedule mutation ───────────────────────────
  const rescheduleByDragMutation = useMutation({
    mutationFn: (data: { appointmentId: number; startDate: string; endDate: string; staffId: number | null }) =>
      apiRequest("PUT", `/api/appointments/${data.appointmentId}`, {
        startDate: data.startDate,
        endDate: data.endDate,
        ...(data.staffId !== null ? { staffId: data.staffId } : {}),
      }),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      toast({
        title: "Rescheduled",
        description: "Appointment moved. Customer will be notified.",
      });
      apiRequest("POST", `/api/appointments/${variables.appointmentId}/send-reminder`).catch(() => {});
    },
    onError: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      toast({
        title: "Reschedule Failed",
        description: "Could not move appointment. There may be a conflict.",
        variant: "destructive",
      });
    },
  });

  // ─── Click appointment -> open side panel ────────────────────────
  const handleClickAppointment = useCallback((id: number) => {
    const appt = appointments.find((a) => a.id === id);
    if (appt) {
      setSelectedAppointment(appt);
      setDetailSheetOpen(true);
    }
  }, [appointments]);

  // ─── Navigation handlers ─────────────────────────────────────────
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

  // ─── Drag-and-drop handler ──────────────────────────────────────
  const handleDragReschedule = useCallback(
    (appointmentId: number, newStaffId: number | null, newHour: number, newQuarter: number) => {
      const appt = appointments.find((a) => a.id === appointmentId);
      if (!appt) return;

      const newStart = new Date(selectedDate);
      newStart.setHours(newHour, newQuarter * 15, 0, 0);

      const duration = new Date(appt.endDate).getTime() - new Date(appt.startDate).getTime();
      const newEnd = new Date(newStart.getTime() + duration);

      // Optimistic update
      queryClient.setQueryData(
        ["/api/appointments", queryParams],
        (old: AppointmentData[] | undefined) =>
          (old || []).map((a) =>
            a.id === appointmentId
              ? {
                  ...a,
                  startDate: newStart.toISOString(),
                  endDate: newEnd.toISOString(),
                  staff: newStaffId !== null
                    ? staffMembers.find((s) => s.id === newStaffId) || a.staff
                    : undefined,
                }
              : a
          )
      );

      rescheduleByDragMutation.mutate({
        appointmentId,
        startDate: newStart.toISOString(),
        endDate: newEnd.toISOString(),
        staffId: newStaffId,
      });
    },
    [appointments, selectedDate, staffMembers, queryParams, queryClient, rescheduleByDragMutation]
  );

  // Week view quick-create: click empty slot -> open form pre-filled
  const handleQuickCreate = useCallback((date: Date, hour: number) => {
    const d = new Date(date);
    d.setHours(hour, 0, 0, 0);
    setPrefillDate(d);
    setSheetOpen(true);
  }, []);

  const openNewAppointment = useCallback(() => {
    setPrefillDate(null);
    setSheetOpen(true);
  }, []);

  // ─── Date label ──────────────────────────────────────────────────
  const dateLabel =
    viewMode === "month"
      ? formatMonthYear(selectedDate)
      : viewMode === "week"
        ? (isMobile
            ? selectedDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })
            : formatWeekRange(selectedDate))
        : (isMobile
            ? selectedDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
            : formatFullDate(selectedDate));

  // ─── Render ──────────────────────────────────────────────────────
  return (
    <PageLayout title="Appointments">
      {isError && <QueryErrorBanner error={queryError} onRetry={() => refetch()} />}
      <FeatureTip
        tipId="appointments-booking"
        title="Enable online booking"
        description="Let customers book appointments 24/7 from your website or a shareable booking link. Go to Settings to set it up."
        actionLabel="Set up booking"
        actionHref="/settings?tab=booking"
        icon={Globe}
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h2 className={`font-bold ${isMobile ? "text-xl" : "text-2xl"}`}>Appointments</h2>
          {!isMobile && <p className="text-gray-500 text-sm">Manage your schedule</p>}
        </div>
        <div className="flex items-center gap-2">
          {!isMobile && (
            <>
              <ExportButton endpoint="/api/export/appointments" filename="appointments.csv" />
              <Button
                variant="outline"
                onClick={() => navigate("/appointments/fullscreen")}
                className="flex items-center"
                title="Open fullscreen schedule view"
              >
                <Maximize2 className="mr-2 h-4 w-4" />
                Enlarge
              </Button>
              <Button onClick={openNewAppointment} className="flex items-center">
                <PlusCircle className="mr-2 h-4 w-4" />
                New Appointment
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Navigation Bar */}
      <div className={`flex flex-col gap-2 mb-4 bg-white rounded-lg border ${isMobile ? "p-2.5" : "p-3"}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="icon" className={isMobile ? "h-8 w-8" : ""} onClick={navigatePrev} aria-label={viewMode === "month" ? "Previous month" : viewMode === "week" ? "Previous week" : "Previous day"}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" className={isMobile ? "h-8 px-2 text-xs" : ""} onClick={goToday}>
              Today
            </Button>
            <Button variant="outline" size="icon" className={isMobile ? "h-8 w-8" : ""} onClick={navigateNext} aria-label={viewMode === "month" ? "Next month" : viewMode === "week" ? "Next week" : "Next day"}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <span className={`font-medium text-gray-700 text-right ${isMobile ? "text-sm" : "text-sm ml-2"}`}>
            {dateLabel}
          </span>
        </div>

        <div className="flex rounded-lg border overflow-hidden">
          {(["week", "day", "month"] as ViewMode[]).map((mode) => {
            const modeLabel = isMobile && mode === "week" ? "Schedule" : mode.charAt(0).toUpperCase() + mode.slice(1);
            return (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`flex-1 py-1.5 font-medium transition-colors ${
                  mode !== "week" ? "border-l" : ""
                } ${isMobile ? "text-xs" : "text-sm"} ${
                  viewMode === mode
                    ? "bg-primary text-primary-foreground"
                    : "bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                {modeLabel}
              </button>
            );
          })}
        </div>
      </div>

      {/* Quick Stats Bar */}
      {!isLoading && (
        <div className="mb-3">
          <QuickStatsBar appointments={todayAppointments} labels={labels} />
        </div>
      )}

      {/* Staff Filter Pills */}
      {staffMembers.length > 1 && (
        <div className="mb-3">
          <StaffFilterPills
            staffMembers={staffMembers}
            visibleStaffIds={visibleStaffIds}
            onToggle={toggleStaffVisibility}
            onShowAll={showAllStaff}
            appointmentCounts={appointmentCounts}
          />
        </div>
      )}

      {/* Calendar Views */}
      {isLoading ? (
        <ViewLoader />
      ) : (
        <Suspense fallback={<ViewLoader />}>
          {viewMode === "month" && (
            <MonthView
              appointments={filteredAppointments}
              selectedDate={selectedDate}
              onSelectDate={(d) => {
                setSelectedDate(d);
                setViewMode("day");
              }}
            />
          )}
          {viewMode === "week" && (
            <WeekView
              appointments={filteredAppointments}
              selectedDate={selectedDate}
              staffMembers={staffMembers}
              hourStart={hourStart}
              hourEnd={hourEnd}
              dynamicHours={dynamicHours}
              onSelectDate={(d) => {
                setSelectedDate(d);
                setViewMode("day");
              }}
              onClickAppointment={handleClickAppointment}
              onQuickCreate={handleQuickCreate}
            />
          )}
          {viewMode === "day" && (
            <StaffDayView
              appointments={filteredAppointments}
              staffMembers={staffMembers}
              selectedDate={selectedDate}
              hourStart={hourStart}
              hourEnd={hourEnd}
              dynamicHours={dynamicHours}
              visibleStaffIds={visibleStaffIds}
              labels={labels}
              onClickAppointment={handleClickAppointment}
              onSendReminder={(id) => sendReminderMutation.mutate(id)}
              reminderPending={sendReminderMutation.isPending}
              onNewAppointment={openNewAppointment}
              onDragReschedule={handleDragReschedule}
            />
          )}
        </Suspense>
      )}

      {/* Mobile FAB */}
      {isMobile && (
        <button
          onClick={openNewAppointment}
          className="fixed bottom-20 right-4 z-40 h-14 w-14 rounded-full bg-primary text-white shadow-lg flex items-center justify-center active:scale-95 transition-transform"
          aria-label="New Appointment"
        >
          <Plus className="h-6 w-6" />
        </button>
      )}

      {/* New Appointment Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side={isMobile ? "bottom" : "right"}
          className={isMobile ? "h-[90vh] rounded-t-xl overflow-y-auto" : "w-full sm:max-w-xl overflow-y-auto"}
        >
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

      {/* Appointment Detail Side Panel */}
      <Sheet open={detailSheetOpen} onOpenChange={setDetailSheetOpen}>
        <SheetContent
          side={isMobile ? "bottom" : "right"}
          className={isMobile ? "h-[85vh] rounded-t-xl overflow-y-auto" : "w-full sm:max-w-md overflow-y-auto"}
        >
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
