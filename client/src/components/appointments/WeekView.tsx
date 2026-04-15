import { useState, useEffect } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSwipeGesture } from "@/hooks/use-swipe-gesture";
import { formatTime } from "@/lib/utils";
import { getStaffColor, getStatusColors, formatHour } from "@/lib/scheduling-utils";
import type { AppointmentData, StaffData } from "./appointmentHelpers";
import {
  DEFAULT_HOUR_START,
  DEFAULT_HOURS,
  HOUR_HEIGHT,
  getWeekDays,
  isSameDay,
  isToday,
  formatDayName,
} from "./appointmentHelpers";

// ─── WeekView Props ──────────────────────────────────────────────────
interface WeekViewProps {
  appointments: AppointmentData[];
  selectedDate: Date;
  staffMembers: StaffData[];
  hourStart?: number;
  hourEnd?: number;
  dynamicHours?: number[];
  onSelectDate: (date: Date) => void;
  onClickAppointment: (id: number) => void;
  onQuickCreate: (date: Date, hour: number) => void;
}

export function WeekView({
  appointments,
  selectedDate,
  staffMembers,
  hourStart = DEFAULT_HOUR_START,
  dynamicHours = DEFAULT_HOURS,
  onSelectDate,
  onClickAppointment,
  onQuickCreate,
}: WeekViewProps) {
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
        hourStart={hourStart}
        dynamicHours={dynamicHours}
        onSelectDate={onSelectDate}
        onClickAppointment={onClickAppointment}
      />
    );
  }

  // Check if today is in the current week
  const todayInWeek = weekDays.find((d) => isToday(d));
  const showTimeLine = !!todayInWeek;
  const todayColumnIndex = todayInWeek ? weekDays.findIndex((d) => isToday(d)) : -1;
  const timeLineTop =
    ((currentTime.getHours() * 60 + currentTime.getMinutes() - hourStart * 60) / 60) *
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
      <div className="relative overflow-x-auto" style={{ minHeight: dynamicHours.length * HOUR_HEIGHT }}>
        {/* Current time indicator line */}
        {showTimeLine && timeLineTop >= 0 && timeLineTop <= dynamicHours.length * HOUR_HEIGHT && (
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
          {dynamicHours.map((hour) => (
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
                      const colors = getStatusColors(appt.status);
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
                          title={tooltipParts.join(" \u2014 ")}
                        >
                          {/* Rich card: name + service + time */}
                          <div className={`flex items-center gap-1 ${colors.text}`}>
                            <div
                              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                              style={{ backgroundColor: staffColor }}
                            />
                            <span
                              className={`text-[10px] font-bold whitespace-nowrap truncate ${isCancelled ? "line-through" : ""}`}
                            >
                              {customerName}
                            </span>
                          </div>
                          {heightPx >= 30 && (
                            <div className="text-[9px] text-gray-500 whitespace-nowrap truncate pl-3">
                              {appt.service?.name || "Appointment"}
                            </div>
                          )}
                          {heightPx >= 44 && (
                            <div className="text-[9px] text-gray-400 whitespace-nowrap truncate pl-3">
                              {formatTime(start)} – {formatTime(end)}
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
// MOBILE WEEK VIEW -- Day selector strip + single-day time grid + swipe
// ═══════════════════════════════════════════════════════════════════════
function MobileWeekView({
  appointments,
  selectedDate,
  staffMembers,
  weekDays,
  hourStart = DEFAULT_HOUR_START,
  dynamicHours = DEFAULT_HOURS,
  onSelectDate,
  onClickAppointment,
}: {
  appointments: AppointmentData[];
  selectedDate: Date;
  staffMembers: StaffData[];
  weekDays: Date[];
  hourStart?: number;
  dynamicHours?: number[];
  onSelectDate: (date: Date) => void;
  onClickAppointment: (id: number) => void;
}) {
  const [activeDayIndex, setActiveDayIndex] = useState(() => {
    const todayIdx = weekDays.findIndex((d) => isToday(d));
    return todayIdx >= 0 ? todayIdx : 0;
  });

  const swipeHandlers = useSwipeGesture({
    onSwipeLeft: () => setActiveDayIndex((prev) => Math.min(prev + 1, weekDays.length - 1)),
    onSwipeRight: () => setActiveDayIndex((prev) => Math.max(prev - 1, 0)),
  });

  const activeDay = weekDays[activeDayIndex];
  const dayAppointments = appointments.filter((a) =>
    isSameDay(new Date(a.startDate), activeDay)
  );
  const MOBILE_HOUR_HEIGHT = 72;

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
              <div
                className={`text-[10px] font-medium uppercase ${
                  isActive ? "text-primary" : today ? "text-blue-600" : "text-gray-500"
                }`}
              >
                {formatDayName(day)}
              </div>
              <div
                className={`mt-0.5 text-base font-semibold inline-flex items-center justify-center w-7 h-7 rounded-full ${
                  isActive
                    ? "bg-primary text-white"
                    : today
                      ? "bg-blue-600 text-white"
                      : "text-gray-900"
                }`}
              >
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

      {/* Single-day time grid -- swipeable */}
      <div className="overflow-y-auto" style={{ maxHeight: "60vh" }} {...swipeHandlers}>
        <div
          className="grid grid-cols-[46px_1fr] relative"
          style={{ minHeight: dynamicHours.length * MOBILE_HOUR_HEIGHT }}
        >
          {dynamicHours.map((hour) => {
            const cellAppts = dayAppointments.filter((a) => {
              const aDate = new Date(a.startDate);
              return aDate.getHours() === hour;
            });

            return (
              <div key={`mobile-${hour}`} className="contents">
                {/* Time label */}
                <div
                  className="text-[11px] text-gray-400 text-right pr-1.5 pt-1 border-b"
                  style={{ height: MOBILE_HOUR_HEIGHT }}
                >
                  {formatHour(hour)}
                </div>
                {/* Single day cell -- full width */}
                <div className="relative border-b" style={{ height: MOBILE_HOUR_HEIGHT }}>
                  {cellAppts.map((appt) => {
                    const start = new Date(appt.startDate);
                    const minuteOffset = start.getMinutes();
                    const topPx = (minuteOffset / 60) * MOBILE_HOUR_HEIGHT;
                    const end = new Date(appt.endDate);
                    const durationMinutes = (end.getTime() - start.getTime()) / 60000;
                    const heightPx = Math.max((durationMinutes / 60) * MOBILE_HOUR_HEIGHT - 2, 36);
                    const colors = getStatusColors(appt.status);
                    const isCancelled = appt.status === "cancelled";
                    const staffColor = getStaffColor(appt.staff?.id, staffMembers);

                    const customerName = appt.customer
                      ? `${appt.customer.firstName} ${appt.customer.lastName}`.trim()
                      : "Walk-in";

                    return (
                      <button
                        key={appt.id}
                        onClick={() => onClickAppointment(appt.id)}
                        className={`absolute left-1 right-1 rounded-md px-2.5 py-1.5 border-l-3 text-left overflow-hidden cursor-pointer transition-shadow active:shadow-md z-10 ${colors.bg} ${colors.border} ${
                          isCancelled ? "opacity-50" : ""
                        }`}
                        style={{ top: topPx, height: Math.max(heightPx, 44), minHeight: 44 }}
                      >
                        <div className={`flex items-center gap-1.5 ${colors.text}`}>
                          <div
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ backgroundColor: staffColor }}
                          />
                          <span
                            className={`text-sm font-semibold whitespace-nowrap truncate ${isCancelled ? "line-through" : ""}`}
                          >
                            {customerName}
                          </span>
                        </div>
                        {heightPx >= 40 && (
                          <div className="text-xs text-gray-500 whitespace-nowrap truncate pl-3.5">
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
