import { useState } from "react";
import { ChevronDown, Users } from "lucide-react";
import { useIsMobile } from "@/hooks/use-mobile";
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

function StaffPill({
  name,
  color,
  isVisible,
  count,
  compact,
  onToggle,
}: {
  name: string;
  color: string;
  isVisible: boolean;
  count: number;
  compact?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={`
        flex items-center gap-1.5 rounded-full border font-medium
        transition-all duration-150 flex-shrink-0 cursor-pointer
        ${compact ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm"}
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
}

/**
 * Staff filter pills.
 * Desktop: horizontal scroll strip.
 * Mobile: collapsible section — summary row + expandable pill grid.
 */
export function StaffFilterPills({
  staffMembers,
  visibleStaffIds,
  onToggle,
  onShowAll,
  appointmentCounts,
}: StaffFilterPillsProps) {
  const isMobile = useIsMobile();
  const [expanded, setExpanded] = useState(false);
  const allVisible = visibleStaffIds.size >= staffMembers.length + 1; // +1 for unassigned
  const someHidden = !allVisible;

  if (staffMembers.length === 0) return null;

  const unassignedCount = appointmentCounts.get(null) || 0;

  // ── Mobile: collapsible section ──
  if (isMobile) {
    return (
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 text-xs font-medium text-gray-600 px-3 py-2 bg-white rounded-lg border w-full"
        >
          <Users className="h-3.5 w-3.5 text-gray-400" />
          <span>
            Staff: {visibleStaffIds.size} of {staffMembers.length + (unassignedCount > 0 ? 1 : 0)} shown
          </span>
          <ChevronDown
            className={`h-3.5 w-3.5 ml-auto text-gray-400 transition-transform duration-200 ${
              expanded ? "rotate-180" : ""
            }`}
          />
        </button>
        {expanded && (
          <div className="flex flex-wrap gap-2 mt-2">
            {staffMembers.map((staff) => (
              <StaffPill
                key={staff.id}
                name={`${staff.firstName} ${staff.lastName.charAt(0)}.`}
                color={getStaffColor(staff.id, staffMembers)}
                isVisible={visibleStaffIds.has(staff.id)}
                count={appointmentCounts.get(staff.id) || 0}
                compact
                onToggle={() => onToggle(staff.id)}
              />
            ))}
            {unassignedCount > 0 && (
              <StaffPill
                name="Unassigned"
                color="#9ca3af"
                isVisible={visibleStaffIds.has(null)}
                count={unassignedCount}
                compact
                onToggle={() => onToggle(null)}
              />
            )}
            {someHidden && (
              <button
                onClick={onShowAll}
                className="text-xs text-primary font-medium hover:underline flex-shrink-0 px-2 py-1"
              >
                Show All
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  // ── Desktop: horizontal scroll strip ──
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1">
      <span className="text-xs font-medium text-gray-500 flex-shrink-0">Staff</span>

      {staffMembers.map((staff) => (
        <StaffPill
          key={staff.id}
          name={`${staff.firstName} ${staff.lastName.charAt(0)}.`}
          color={getStaffColor(staff.id, staffMembers)}
          isVisible={visibleStaffIds.has(staff.id)}
          count={appointmentCounts.get(staff.id) || 0}
          onToggle={() => onToggle(staff.id)}
        />
      ))}

      {/* Unassigned pill — only show if there are unassigned appointments */}
      {unassignedCount > 0 && (
        <StaffPill
          name="Unassigned"
          color="#9ca3af"
          isVisible={visibleStaffIds.has(null)}
          count={unassignedCount}
          onToggle={() => onToggle(null)}
        />
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
