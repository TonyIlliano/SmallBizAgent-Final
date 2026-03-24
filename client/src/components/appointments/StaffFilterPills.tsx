import { useCallback } from "react";
import { getStaffColor } from "@/lib/scheduling-utils";

interface StaffData {
  id: number;
  firstName: string;
  lastName: string;
}

interface StaffFilterPillsProps {
  staffMembers: StaffData[];
  visibleStaffIds: Set<number | null>;
  onToggle: (staffId: number | null) => void;
  onShowAll: () => void;
  /** Appointment count per staffId (null key = unassigned) */
  appointmentCounts: Map<number | null, number>;
}

/**
 * Horizontal strip of toggleable staff filter pills.
 * Each pill shows: color dot + "First L" name + appointment count.
 * Click to toggle visibility. At least one staff must remain visible.
 */
export function StaffFilterPills({
  staffMembers,
  visibleStaffIds,
  onToggle,
  onShowAll,
  appointmentCounts,
}: StaffFilterPillsProps) {
  const allVisible = visibleStaffIds.size >= staffMembers.length + 1; // +1 for unassigned
  const someHidden = !allVisible;

  if (staffMembers.length === 0) return null;

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1">
      <span className="text-xs font-medium text-gray-500 flex-shrink-0">Staff</span>

      {staffMembers.map((staff) => {
        const color = getStaffColor(staff.id, staffMembers);
        const isVisible = visibleStaffIds.has(staff.id);
        const count = appointmentCounts.get(staff.id) || 0;
        const name = `${staff.firstName} ${staff.lastName.charAt(0)}.`;

        return (
          <button
            key={staff.id}
            onClick={() => onToggle(staff.id)}
            className={`
              flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-medium
              transition-all duration-150 flex-shrink-0 cursor-pointer
              ${
                isVisible
                  ? "bg-white border-gray-300 shadow-sm hover:shadow"
                  : "bg-gray-50 border-gray-200 opacity-50 hover:opacity-70"
              }
            `}
          >
            <span
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: color }}
            />
            <span className="text-gray-800">{name}</span>
            {count > 0 && (
              <span
                className={`
                  text-xs font-semibold tabular-nums
                  ${isVisible ? "text-gray-600" : "text-gray-400"}
                `}
              >
                ({count})
              </span>
            )}
          </button>
        );
      })}

      {/* Unassigned pill — only show if there are unassigned appointments */}
      {(appointmentCounts.get(null) || 0) > 0 && (
        <button
          onClick={() => onToggle(null)}
          className={`
            flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-medium
            transition-all duration-150 flex-shrink-0 cursor-pointer
            ${
              visibleStaffIds.has(null)
                ? "bg-white border-gray-300 shadow-sm hover:shadow"
                : "bg-gray-50 border-gray-200 opacity-50 hover:opacity-70"
            }
          `}
        >
          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 bg-gray-400" />
          <span className="text-gray-600">Unassigned</span>
          <span className="text-xs font-semibold tabular-nums text-gray-400">
            ({appointmentCounts.get(null) || 0})
          </span>
        </button>
      )}

      {/* Show All link */}
      {someHidden && (
        <button
          onClick={onShowAll}
          className="text-xs text-primary font-medium hover:underline flex-shrink-0 ml-1"
        >
          Show All
        </button>
      )}
    </div>
  );
}
