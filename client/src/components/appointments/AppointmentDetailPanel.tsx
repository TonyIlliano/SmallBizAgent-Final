import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
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
import { formatTime } from "@/lib/utils";
import {
  Clock,
  Scissors,
  Phone,
  Mail,
  MessageSquare,
  ExternalLink,
  CheckCircle2,
  XCircle,
  UserX,
  User,
  Globe,
  Bot,
} from "lucide-react";
import { getStaffColor, getStatusColors } from "@/lib/scheduling-utils";
import type { AppointmentData, StaffData } from "./appointmentHelpers";
import { formatFullDate } from "./appointmentHelpers";

// ─── Status badge helper ─────────────────────────────────────────────
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

// ─── Component ───────────────────────────────────────────────────────
interface AppointmentDetailPanelProps {
  appointment: AppointmentData;
  staffMembers: StaffData[];
  onStatusChange: (status: string) => void;
  onSendReminder: () => void;
  reminderPending: boolean;
  statusPending: boolean;
  onViewFull: () => void;
}

export function AppointmentDetailPanel({
  appointment,
  staffMembers,
  onStatusChange,
  onSendReminder,
  reminderPending,
  statusPending,
  onViewFull,
}: AppointmentDetailPanelProps) {
  const start = new Date(appointment.startDate);
  const end = new Date(appointment.endDate);
  const durationMin = Math.round((end.getTime() - start.getTime()) / 60000);
  const customerName = appointment.customer
    ? `${appointment.customer.firstName} ${appointment.customer.lastName}`.trim()
    : "Walk-in";
  const source = getAppointmentSource(appointment.notes);
  const staffColor = getStaffColor(appointment.staff?.id, staffMembers);
  const colors = getStatusColors(appointment.status);

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
            <SelectTrigger className="h-10 text-sm flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="scheduled">Scheduled</SelectItem>
              <SelectItem value="confirmed">Confirmed</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="no_show">No Show</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Action buttons -- stack vertically on mobile for bigger touch targets */}
        <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
          {appointment.status !== "confirmed" && appointment.status !== "cancelled" && appointment.status !== "completed" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onStatusChange("confirmed")}
              disabled={statusPending}
              className="text-green-700 border-green-200 hover:bg-green-50 min-h-[44px] justify-start"
            >
              <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
              Confirm
            </Button>
          )}
          {appointment.status !== "completed" && appointment.status !== "cancelled" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onStatusChange("completed")}
              disabled={statusPending}
              className="text-purple-700 border-purple-200 hover:bg-purple-50 min-h-[44px] justify-start"
            >
              <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
              Complete
            </Button>
          )}
          {appointment.status !== "no_show" && appointment.status !== "completed" && appointment.status !== "cancelled" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onStatusChange("no_show")}
              disabled={statusPending}
              className="text-amber-700 border-amber-200 hover:bg-amber-50 min-h-[44px] justify-start"
            >
              <UserX className="h-3.5 w-3.5 mr-1.5" />
              No Show
            </Button>
          )}
          {appointment.status !== "cancelled" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onStatusChange("cancelled")}
              disabled={statusPending}
              className="text-red-700 border-red-200 hover:bg-red-50 min-h-[44px] justify-start"
            >
              <XCircle className="h-3.5 w-3.5 mr-1.5" />
              Cancel
            </Button>
          )}
          {appointment.customer?.phone && appointment.status !== "cancelled" && appointment.status !== "completed" && (
            <Button
              size="sm"
              variant="outline"
              onClick={onSendReminder}
              disabled={reminderPending}
              className="min-h-[44px] justify-start"
            >
              <MessageSquare className="h-3.5 w-3.5 mr-1.5" />
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
        className="w-full text-gray-500 min-h-[44px]"
      >
        <ExternalLink className="h-3.5 w-3.5 mr-1" />
        View Full Details / Edit
      </Button>
    </div>
  );
}
