import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Clock, Wrench, DoorOpen, FileText } from "lucide-react";

interface TriageCardProps {
  urgency?: string | null;
  issueType?: string | null;
  symptoms?: string | null;
  accessNotes?: string | null;
}

const URGENCY_STYLES: Record<
  string,
  { label: string; className: string; icon: typeof AlertTriangle }
> = {
  emergency: {
    label: "Emergency",
    className: "bg-red-100 text-red-800 border-red-200",
    icon: AlertTriangle,
  },
  urgent: {
    label: "Urgent",
    className: "bg-amber-100 text-amber-800 border-amber-200",
    icon: Clock,
  },
  routine: {
    label: "Routine",
    className: "bg-slate-100 text-slate-700 border-slate-200",
    icon: Wrench,
  },
};

export default function TriageCard({
  urgency,
  issueType,
  symptoms,
  accessNotes,
}: TriageCardProps) {
  // Self-hide when there's nothing to show.
  if (!urgency && !issueType && !symptoms && !accessNotes) {
    return null;
  }

  const urgencyStyle = urgency ? URGENCY_STYLES[urgency] : undefined;
  const UrgencyIcon = urgencyStyle?.icon;

  return (
    <Card data-testid="triage-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          Triage
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {urgencyStyle && UrgencyIcon && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground w-24 shrink-0">
              Urgency
            </span>
            <Badge
              variant="outline"
              className={urgencyStyle.className}
              data-testid="triage-urgency"
            >
              <UrgencyIcon className="h-3 w-3 mr-1" />
              {urgencyStyle.label}
            </Badge>
          </div>
        )}

        {issueType && (
          <div className="flex items-start gap-2">
            <span className="text-sm text-muted-foreground w-24 shrink-0">
              Issue
            </span>
            <span className="text-sm font-medium" data-testid="triage-issue-type">
              {issueType}
            </span>
          </div>
        )}

        {symptoms && (
          <div className="flex items-start gap-2">
            <span className="text-sm text-muted-foreground w-24 shrink-0">
              Symptoms
            </span>
            <span className="text-sm whitespace-pre-wrap" data-testid="triage-symptoms">
              {symptoms}
            </span>
          </div>
        )}

        {accessNotes && (
          <div className="flex items-start gap-2">
            <span className="text-sm text-muted-foreground w-24 shrink-0 flex items-center gap-1">
              <DoorOpen className="h-3 w-3" />
              Access
            </span>
            <span className="text-sm whitespace-pre-wrap" data-testid="triage-access-notes">
              {accessNotes}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
