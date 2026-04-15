import { useState, useEffect } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSwipeGesture } from "@/hooks/use-swipe-gesture";
import { Button } from "@/components/ui/button";
import { formatTime } from "@/lib/utils";
import { PlusCircle, Calendar as CalendarIcon } from "lucide-react";
import {
  DndContext,
  DragOverlay,
  useSensor,
  useSensors,
  PointerSensor,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  STAFF_COLORS,
  UNASSIGNED_COLOR,
  getStatusColors,
  formatHour,
} from "@/lib/scheduling-utils";
import type { VerticalLabels } from "@/lib/scheduling-utils";
import type { AppointmentData, StaffData } from "./appointmentHelpers";
import {
  DEFAULT_HOUR_START,
  DEFAULT_HOUR_END,
  DEFAULT_HOURS,
  DAY_HOUR_HEIGHT,
  isToday,
  formatFullDate,
} from "./appointmentHelpers";
import { DraggableAppointment, DroppableCell, DroppableQuarter } from "./DragDropComponents";

// ─── StaffDayView Props ──────────────────────────────────────────────
interface StaffDayViewProps {
  appointments: AppointmentData[];
  staffMembers: StaffData[];
  selectedDate: Date;
  hourStart?: number;
  hourEnd?: number;
  dynamicHours?: number[];
  visibleStaffIds?: Set<number | null>;
  labels?: VerticalLabels;
  onClickAppointment: (id: number) => void;
  onSendReminder: (id: number) => void;
  reminderPending: boolean;
  onNewAppointment: () => void;
  onDragReschedule?: (appointmentId: number, staffId: number | null, hour: number, quarter: number) => void;
}

export function StaffDayView({
  appointments,
  staffMembers,
  selectedDate,
  hourStart = DEFAULT_HOUR_START,
  hourEnd = DEFAULT_HOUR_END,
  dynamicHours = DEFAULT_HOURS,
  visibleStaffIds,
  labels,
  onClickAppointment,
  onSendReminder,
  reminderPending,
  onNewAppointment,
  onDragReschedule,
}: StaffDayViewProps) {
  const isMobile = useIsMobile();
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update current time every minute for the time indicator line
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  // Build columns: active staff + "Unassigned", filtered by visibility
  const allColumns: { id: number | null; name: string; color: string }[] = staffMembers.map(
    (s, i) => ({
      id: s.id,
      name: `${s.firstName} ${s.lastName?.charAt(0) || ""}`.trim(),
      color: STAFF_COLORS[i % STAFF_COLORS.length],
    })
  );
  allColumns.push({ id: null, name: "Unassigned", color: UNASSIGNED_COLOR });

  // Filter columns by visibility
  const columns = visibleStaffIds
    ? allColumns.filter((col) => visibleStaffIds.has(col.id))
    : allColumns;

  // Group appointments by staff column
  const appointmentsByColumn = new Map<number | null, AppointmentData[]>();
  columns.forEach((col) => appointmentsByColumn.set(col.id, []));

  appointments.forEach((appt) => {
    const staffId = appt.staff?.id ?? null;
    const bucket = appointmentsByColumn.get(staffId);
    if (bucket) {
      bucket.push(appt);
    } else {
      // Staff not in current list -- put in unassigned
      appointmentsByColumn.get(null)!.push(appt);
    }
  });

  // Check if the selected date is today (for the current time indicator)
  const showTimeLine = isToday(selectedDate);
  const timeLineTop =
    ((currentTime.getHours() * 60 + currentTime.getMinutes() - hourStart * 60) / 60) *
    DAY_HOUR_HEIGHT;

  // No staff and no appointments -- show empty state
  if (staffMembers.length === 0 && appointments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center bg-card rounded-lg border">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 mb-4">
          <CalendarIcon className="h-8 w-8 text-primary" />
        </div>
        <h3 className="text-lg font-semibold text-foreground">No appointments yet</h3>
        <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
          Nothing scheduled for {formatFullDate(selectedDate)}. Schedule appointments manually, or
          enable online booking to let customers book themselves.
        </p>
        <Button className="mt-6" onClick={onNewAppointment}>
          <PlusCircle className="mr-2 h-4 w-4" />
          Schedule an Appointment
        </Button>
      </div>
    );
  }

  // Mobile: single staff at a time with selector strip
  if (isMobile) {
    return (
      <MobileStaffDayView
        columns={columns}
        appointmentsByColumn={appointmentsByColumn}
        selectedDate={selectedDate}
        hourStart={hourStart}
        dynamicHours={dynamicHours}
        showTimeLine={showTimeLine}
        timeLineTop={timeLineTop}
        onClickAppointment={onClickAppointment}
        onNewAppointment={onNewAppointment}
      />
    );
  }

  // Desktop / iPad: multi-column grid with drag-and-drop
  return (
    <DesktopStaffDayView
      columns={columns}
      appointmentsByColumn={appointmentsByColumn}
      appointments={appointments}
      dynamicHours={dynamicHours}
      showTimeLine={showTimeLine}
      timeLineTop={timeLineTop}
      onClickAppointment={onClickAppointment}
      onNewAppointment={onNewAppointment}
      onDragReschedule={onDragReschedule}
    />
  );
}

// ═══════════════════════════════════════════════════════════════════════
// DESKTOP STAFF DAY VIEW (with drag-and-drop)
// ═══════════════════════════════════════════════════════════════════════
function DesktopStaffDayView({
  columns,
  appointmentsByColumn,
  appointments,
  dynamicHours = DEFAULT_HOURS,
  showTimeLine,
  timeLineTop,
  onClickAppointment,
  onNewAppointment,
  onDragReschedule,
}: {
  columns: { id: number | null; name: string; color: string }[];
  appointmentsByColumn: Map<number | null, AppointmentData[]>;
  appointments: AppointmentData[];
  dynamicHours?: number[];
  showTimeLine: boolean;
  timeLineTop: number;
  onClickAppointment: (id: number) => void;
  onNewAppointment: () => void;
  onDragReschedule?: (appointmentId: number, staffId: number | null, hour: number, quarter: number) => void;
}) {
  const colCount = columns.length;
  const gridCols = `60px repeat(${colCount}, minmax(180px, 1fr))`;

  // Drag-and-drop state
  const [draggedApptId, setDraggedApptId] = useState<number | null>(null);
  const draggedAppt = draggedApptId != null ? appointments.find((a) => a.id === draggedApptId) : null;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // 8px drag threshold to avoid accidental drags
      },
    })
  );

  function handleDragStart(event: DragStartEvent) {
    setDraggedApptId(event.active.id as number);
  }

  function handleDragEnd(event: DragEndEvent) {
    setDraggedApptId(null);
    const { active, over } = event;
    if (!over || !onDragReschedule) return;

    const appointmentId = active.id as number;
    const dropId = over.id as string;
    if (!dropId.startsWith("drop-")) return;

    // Parse: drop-{staffId}-{hour}-{quarter}
    const parts = dropId.split("-");
    const staffIdStr = parts[1];
    const hour = parseInt(parts[2], 10);
    const quarter = parseInt(parts[3] || "0", 10);

    const newStaffId = staffIdStr === "null" ? null : parseInt(staffIdStr, 10);

    onDragReschedule(appointmentId, newStaffId, hour, quarter);
  }

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
      <div className="bg-white rounded-lg border overflow-hidden">
        {/* Staff header row */}
        <div
          className="grid border-b sticky top-0 z-30 bg-white"
          style={{ gridTemplateColumns: gridCols }}
        >
          <div className="p-2 border-r bg-gray-50" /> {/* Time column spacer */}
          {columns.map((col) => {
            const colAppts = appointmentsByColumn.get(col.id) || [];
            const total = colAppts.length;
            const completed = colAppts.filter((a) => a.status === "completed").length;

            return (
              <div
                key={col.id ?? "unassigned"}
                className={`flex items-center gap-2 px-3 py-3 border-r last:border-r-0 ${
                  col.id === null ? "bg-gray-50" : ""
                }`}
              >
                <div
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: col.color }}
                />
                <span className="text-sm font-semibold text-gray-800 truncate">{col.name}</span>
                <span className="text-xs text-gray-500 ml-auto flex-shrink-0 tabular-nums font-medium">
                  {completed}/{total}
                </span>
              </div>
            );
          })}
        </div>

        {/* Scrollable time grid */}
        <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: "75vh" }}>
          <div
            className="grid relative"
            style={{
              gridTemplateColumns: gridCols,
              minHeight: dynamicHours.length * DAY_HOUR_HEIGHT,
            }}
          >
            {/* Current time indicator */}
            {showTimeLine &&
              timeLineTop >= 0 &&
              timeLineTop <= dynamicHours.length * DAY_HOUR_HEIGHT && (
                <div
                  className="absolute left-0 right-0 z-20 pointer-events-none flex items-center"
                  style={{ top: timeLineTop }}
                >
                  <div className="w-2.5 h-2.5 rounded-full bg-red-500 -ml-1" />
                  <div className="flex-1 h-0.5 bg-red-500" />
                </div>
              )}

            {/* Hour rows */}
            {dynamicHours.map((hour) => (
              <div key={`row-${hour}`} className="contents">
                {/* Time label */}
                <div
                  className="text-xs text-gray-400 text-right pr-2 pt-1 border-b border-r bg-gray-50/50"
                  style={{ height: DAY_HOUR_HEIGHT }}
                >
                  {formatHour(hour)}
                </div>

                {/* Staff column cells -- droppable zones */}
                {columns.map((col) => {
                  const colAppts = (appointmentsByColumn.get(col.id) || []).filter(
                    (a) => new Date(a.startDate).getHours() === hour
                  );

                  return (
                    <DroppableCell
                      key={`cell-${hour}-${col.id ?? "u"}`}
                      dropId={`drop-${col.id}-${hour}-0`}
                      className={`relative border-b border-r last:border-r-0 transition-colors hover:bg-gray-50/50 cursor-pointer ${
                        col.id === null ? "bg-gray-50/30" : ""
                      }`}
                      style={{ height: DAY_HOUR_HEIGHT }}
                      onClick={() => onNewAppointment()}
                    >
                      {/* 15-min drop subdivisions */}
                      {[0, 1, 2, 3].map((q) => (
                        <DroppableQuarter
                          key={`q-${hour}-${col.id ?? "u"}-${q}`}
                          dropId={`drop-${col.id}-${hour}-${q}`}
                          quarter={q}
                          hourHeight={DAY_HOUR_HEIGHT}
                        />
                      ))}

                      {colAppts.map((appt) => {
                        const start = new Date(appt.startDate);
                        const minuteOffset = start.getMinutes();
                        const topPx = (minuteOffset / 60) * DAY_HOUR_HEIGHT;
                        const end = new Date(appt.endDate);
                        const durationMinutes = (end.getTime() - start.getTime()) / 60000;
                        const heightPx = Math.max(
                          (durationMinutes / 60) * DAY_HOUR_HEIGHT - 2,
                          32
                        );
                        const colors = getStatusColors(appt.status);
                        const isCancelled = appt.status === "cancelled";
                        const isCompleted = appt.status === "completed";
                        const isDragging = draggedApptId === appt.id;

                        const customerName = appt.customer
                          ? `${appt.customer.firstName} ${appt.customer.lastName}`.trim()
                          : "Walk-in";

                        return (
                          <DraggableAppointment
                            key={appt.id}
                            id={appt.id}
                            disabled={isCancelled || isCompleted}
                          >
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onClickAppointment(appt.id);
                              }}
                              className={`absolute left-1 right-1 rounded-md px-2.5 py-1.5 border-l-4 text-left overflow-hidden cursor-pointer transition-all hover:shadow-lg hover:scale-[1.02] z-10 ${colors.bg} ${colors.border} ${
                                isCancelled ? "opacity-50" : ""
                              } ${isDragging ? "opacity-30" : ""} ${
                                !isCancelled && !isCompleted
                                  ? "cursor-grab active:cursor-grabbing"
                                  : ""
                              }`}
                              style={{ top: topPx, height: heightPx }}
                              title={`${formatTime(start)} \u2014 ${customerName}${appt.service ? ` \u2014 ${appt.service.name}` : ""}${!isCancelled && !isCompleted ? " (drag to reschedule)" : ""}`}
                            >
                              <div className="flex items-center justify-between gap-1">
                                <span
                                  className={`text-xs font-bold whitespace-nowrap truncate ${colors.text} ${isCancelled ? "line-through" : ""}`}
                                >
                                  {customerName}
                                </span>
                                <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${colors.dot}`} />
                              </div>
                              {heightPx >= 40 && (
                                <div className="text-[11px] text-gray-600 whitespace-nowrap truncate">
                                  {appt.service?.name || "Appointment"}
                                </div>
                              )}
                              {heightPx >= 56 && (
                                <div className="text-[10px] text-gray-400 whitespace-nowrap truncate">
                                  {formatTime(start)} – {formatTime(end)}
                                </div>
                              )}
                            </button>
                          </DraggableAppointment>
                        );
                      })}
                    </DroppableCell>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Drag overlay -- ghost card shown while dragging */}
        <DragOverlay>
          {draggedAppt &&
            (() => {
              const colors = getStatusColors(draggedAppt.status);
              const customerName = draggedAppt.customer
                ? `${draggedAppt.customer.firstName} ${draggedAppt.customer.lastName}`.trim()
                : "Walk-in";
              return (
                <div
                  className={`rounded-md px-2.5 py-1.5 border-l-4 text-left shadow-xl opacity-90 ${colors.bg} ${colors.border}`}
                  style={{ width: 180, minHeight: 40 }}
                >
                  <div className={`text-xs font-bold whitespace-nowrap truncate ${colors.text}`}>
                    {customerName}
                  </div>
                  <div className="text-[11px] text-gray-600 whitespace-nowrap truncate">
                    {draggedAppt.service?.name || "Appointment"}
                  </div>
                </div>
              );
            })()}
        </DragOverlay>
      </div>
    </DndContext>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// MOBILE STAFF DAY VIEW -- Single staff at a time with staff selector + swipe
// ═══════════════════════════════════════════════════════════════════════
function MobileStaffDayView({
  columns,
  appointmentsByColumn,
  selectedDate,
  hourStart = DEFAULT_HOUR_START,
  dynamicHours = DEFAULT_HOURS,
  showTimeLine,
  timeLineTop,
  onClickAppointment,
  onNewAppointment,
}: {
  columns: { id: number | null; name: string; color: string }[];
  appointmentsByColumn: Map<number | null, AppointmentData[]>;
  selectedDate: Date;
  hourStart?: number;
  dynamicHours?: number[];
  showTimeLine: boolean;
  timeLineTop: number;
  onClickAppointment: (id: number) => void;
  onNewAppointment: () => void;
}) {
  const [activeStaffIndex, setActiveStaffIndex] = useState(0);
  const activeCol = columns[activeStaffIndex];
  const activeAppts = appointmentsByColumn.get(activeCol?.id ?? null) || [];
  const MOBILE_DAY_HOUR_HEIGHT = 70;

  const swipeHandlers = useSwipeGesture({
    onSwipeLeft: () => setActiveStaffIndex((prev) => Math.min(prev + 1, columns.length - 1)),
    onSwipeRight: () => setActiveStaffIndex((prev) => Math.max(prev - 1, 0)),
  });

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
              className={`flex-shrink-0 flex items-center gap-2 px-3 py-2.5 text-center transition-colors relative border-r last:border-r-0 ${
                isActive ? "bg-primary/10" : "hover:bg-gray-50"
              }`}
            >
              <div
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: col.color }}
              />
              <span
                className={`text-xs font-medium whitespace-nowrap ${
                  isActive ? "text-primary" : "text-gray-600"
                }`}
              >
                {col.name}
              </span>
              {count > 0 && (
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    isActive ? "bg-primary text-white" : "bg-gray-200 text-gray-600"
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

      {/* Single-staff time grid -- swipeable */}
      <div className="overflow-y-auto" style={{ maxHeight: "65vh" }} {...swipeHandlers}>
        <div
          className="grid grid-cols-[46px_1fr] relative"
          style={{ minHeight: dynamicHours.length * MOBILE_DAY_HOUR_HEIGHT }}
        >
          {/* Current time indicator */}
          {showTimeLine && (
            <div
              className="absolute left-0 right-0 z-20 pointer-events-none flex items-center"
              style={{
                top:
                  ((new Date().getHours() * 60 +
                    new Date().getMinutes() -
                    hourStart * 60) /
                    60) *
                  MOBILE_DAY_HOUR_HEIGHT,
              }}
            >
              <div className="w-2 h-2 rounded-full bg-red-500" />
              <div className="flex-1 h-0.5 bg-red-500" />
            </div>
          )}

          {dynamicHours.map((hour) => {
            const cellAppts = activeAppts.filter(
              (a) => new Date(a.startDate).getHours() === hour
            );

            return (
              <div key={`mobile-staff-${hour}`} className="contents">
                {/* Time label */}
                <div
                  className="text-[11px] text-gray-400 text-right pr-1.5 pt-1 border-b"
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
                    const topPx = (minuteOffset / 60) * MOBILE_DAY_HOUR_HEIGHT;
                    const end = new Date(appt.endDate);
                    const durationMinutes = (end.getTime() - start.getTime()) / 60000;
                    const heightPx = Math.max(
                      (durationMinutes / 60) * MOBILE_DAY_HOUR_HEIGHT - 2,
                      36
                    );
                    const colors = getStatusColors(appt.status);
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
                        className={`absolute left-1 right-1 rounded-md px-2.5 py-1.5 border-l-3 text-left overflow-hidden cursor-pointer transition-shadow active:shadow-md z-10 ${colors.bg} ${colors.border} ${
                          isCancelled ? "opacity-50" : ""
                        }`}
                        style={{ top: topPx, height: Math.max(heightPx, 44), minHeight: 44 }}
                      >
                        <div
                          className={`text-sm font-semibold whitespace-nowrap truncate ${colors.text} ${isCancelled ? "line-through" : ""}`}
                        >
                          {customerName}
                        </div>
                        {heightPx >= 40 && (
                          <div className="text-xs text-gray-500 whitespace-nowrap truncate">
                            {appt.service?.name || "Appointment"} · {formatTime(start)}
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
