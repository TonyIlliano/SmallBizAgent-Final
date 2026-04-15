import { useIsMobile } from "@/hooks/use-mobile";
import type { AppointmentData } from "./appointmentHelpers";
import { isToday } from "./appointmentHelpers";

interface MonthViewProps {
  appointments: AppointmentData[];
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
}

export function MonthView({ appointments, selectedDate, onSelectDate }: MonthViewProps) {
  const isMobile = useIsMobile();
  const year = selectedDate.getFullYear();
  const month = selectedDate.getMonth();
  const firstDay = new Date(year, month, 1);

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
  appointments.forEach((a) => {
    const d = new Date(a.startDate);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    countsByDate.set(key, (countsByDate.get(key) || 0) + 1);
  });

  const dayNames = isMobile
    ? ["M", "T", "W", "T", "F", "S", "S"]
    : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div className="bg-white rounded-lg border overflow-hidden">
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b">
        {dayNames.map((d, i) => (
          <div
            key={`${d}-${i}`}
            className={`text-center text-xs font-medium text-gray-500 uppercase ${isMobile ? "p-1.5" : "p-2"}`}
          >
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
                className={`relative text-left border-r last:border-r-0 transition-colors hover:bg-gray-50 ${
                  isMobile ? "p-1 min-h-[52px]" : "p-2 min-h-[88px]"
                } ${
                  !inMonth ? "bg-gray-50/50" : ""
                } ${today ? "bg-blue-50/60" : ""}`}
              >
                <div
                  className={`font-medium inline-flex items-center justify-center rounded-full ${
                    isMobile ? "text-xs w-6 h-6" : "text-sm w-7 h-7"
                  } ${
                    today
                      ? "bg-blue-600 text-white"
                      : inMonth
                        ? "text-gray-900"
                        : "text-gray-400"
                  }`}
                >
                  {day.getDate()}
                </div>
                {count > 0 &&
                  (isMobile ? (
                    <div className="flex gap-0.5 mt-0.5 justify-center">
                      {Array.from({ length: Math.min(count, 3) }).map((_, i) => (
                        <div
                          key={i}
                          className={`w-1.5 h-1.5 rounded-full ${
                            count >= 5
                              ? "bg-red-400"
                              : count >= 3
                                ? "bg-amber-400"
                                : "bg-blue-400"
                          }`}
                        />
                      ))}
                      {count > 3 && (
                        <span className="text-[8px] text-gray-400 leading-none">+{count - 3}</span>
                      )}
                    </div>
                  ) : (
                    <div className="mt-1 flex items-center gap-1">
                      <div
                        className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${
                          count >= 5
                            ? "bg-red-100 text-red-700"
                            : count >= 3
                              ? "bg-amber-100 text-amber-700"
                              : "bg-blue-100 text-blue-700"
                        }`}
                      >
                        {count} appt{count !== 1 ? "s" : ""}
                      </div>
                    </div>
                  ))}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
