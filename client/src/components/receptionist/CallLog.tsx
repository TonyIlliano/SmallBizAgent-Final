import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDateTime, formatPhoneNumber } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn, formatDate } from "@/lib/utils";
import {
  CalendarIcon,
  PhoneCall,
  Phone,
  PhoneOff,
  Voicemail,
  ChevronDown,
  ChevronUp,
  Play,
  Clock,
  User,
  MessageSquare,
  AlertTriangle,
} from "lucide-react";

// Normalize raw Vapi status strings to standard values
function normalizeStatus(status: string): string {
  if (!status) return "answered";
  const s = status.toLowerCase();
  if (
    s === "answered" ||
    s === "completed" ||
    s.includes("customer-ended") ||
    s.includes("assistant-ended") ||
    s.includes("end-call") ||
    s.includes("assistant-said")
  )
    return "answered";
  if (s === "missed" || s.includes("did-not-answer") || s.includes("silence") || s.includes("no-input"))
    return "missed";
  if (s === "voicemail" || s.includes("voicemail"))
    return "voicemail";
  return "answered";
}

// Normalize intent
function normalizeIntent(intent: string): string {
  if (!intent) return "General";
  if (intent === "vapi-ai-call") return "AI Call";
  return intent.charAt(0).toUpperCase() + intent.slice(1);
}

export function CallLog({ businessId }: { businessId?: number | null }) {
  const [dateRange, setDateRange] = useState<{
    from: Date | undefined;
    to: Date | undefined;
  }>({
    from: undefined,
    to: undefined,
  });
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [emergencyFilter, setEmergencyFilter] = useState<string>("");
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Build query params for API call
  const buildQueryParams = () => {
    const params: Record<string, any> = { businessId };

    if (dateRange.from) {
      params.startDate = dateRange.from.toISOString();
    }

    if (dateRange.to) {
      params.endDate = dateRange.to.toISOString();
    }

    if (statusFilter && statusFilter !== "all") {
      params.status = statusFilter;
    }

    if (emergencyFilter === "true") {
      params.isEmergency = true;
    } else if (emergencyFilter === "false") {
      params.isEmergency = false;
    }

    return params;
  };

  // Fetch call logs with filters
  const { data: calls = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/call-logs", buildQueryParams()],
    enabled: !!businessId,
  });

  // Reset all filters
  const resetFilters = () => {
    setDateRange({ from: undefined, to: undefined });
    setStatusFilter("");
    setEmergencyFilter("");
  };

  const getStatusIcon = (status: string) => {
    const normalized = normalizeStatus(status);
    switch (normalized) {
      case "answered":
        return <PhoneCall className="h-4 w-4 text-green-500" />;
      case "missed":
        return <PhoneOff className="h-4 w-4 text-yellow-500" />;
      case "voicemail":
        return <Voicemail className="h-4 w-4 text-blue-500" />;
      default:
        return <Phone className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const normalized = normalizeStatus(status);
    switch (normalized) {
      case "answered":
        return (
          <Badge className="bg-green-100 text-green-800 hover:bg-green-100 dark:bg-green-900/30 dark:text-green-400">
            Answered
          </Badge>
        );
      case "missed":
        return (
          <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100 dark:bg-yellow-900/30 dark:text-yellow-400">
            Missed
          </Badge>
        );
      case "voicemail":
        return (
          <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400">
            Voicemail
          </Badge>
        );
      default:
        return <Badge>{normalized}</Badge>;
    }
  };

  const formatDuration = (seconds: number) => {
    if (!seconds) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Call History</CardTitle>
        <CardDescription>
          View and filter call logs handled by your virtual receptionist
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Filters */}
        <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="text-sm font-medium mb-1 block">Date Range</label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={"outline"}
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !dateRange.from && !dateRange.to && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateRange.from ? (
                    dateRange.to ? (
                      <>
                        {formatDate(dateRange.from)} -{" "}
                        {formatDate(dateRange.to)}
                      </>
                    ) : (
                      formatDate(dateRange.from)
                    )
                  ) : (
                    "Select date range"
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="range"
                  selected={dateRange}
                  onSelect={(range) =>
                    setDateRange({ from: range?.from, to: range?.to })
                  }
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Status</label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="answered">Answered</SelectItem>
                <SelectItem value="missed">Missed</SelectItem>
                <SelectItem value="voicemail">Voicemail</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Emergency</label>
            <Select value={emergencyFilter} onValueChange={setEmergencyFilter}>
              <SelectTrigger>
                <SelectValue placeholder="All calls" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All calls</SelectItem>
                <SelectItem value="true">Emergency only</SelectItem>
                <SelectItem value="false">Non-emergency only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-end">
            <Button variant="outline" onClick={resetFilters} className="w-full">
              Reset Filters
            </Button>
          </div>
        </div>

        {/* Call list */}
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="animate-pulse p-4 rounded-lg border">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-muted" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-muted rounded w-1/3" />
                    <div className="h-3 bg-muted rounded w-1/4" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : calls.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Phone className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm font-medium">No calls found</p>
            <p className="text-xs mt-1">
              Calls handled by your AI receptionist will appear here
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {calls.map((call: any) => {
              const isExpanded = expandedId === call.id;
              const normalized = normalizeStatus(call.status);

              return (
                <div
                  key={call.id}
                  className={cn(
                    "border rounded-lg transition-all cursor-pointer",
                    isExpanded
                      ? "border-primary/30 shadow-sm"
                      : "hover:border-border/80 hover:bg-muted/30"
                  )}
                >
                  {/* Summary row */}
                  <div
                    className="flex items-center gap-3 p-4"
                    onClick={() =>
                      setExpandedId(isExpanded ? null : call.id)
                    }
                  >
                    {/* Status icon */}
                    <div
                      className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0",
                        normalized === "answered" &&
                          "bg-green-50 dark:bg-green-900/20",
                        normalized === "missed" &&
                          "bg-yellow-50 dark:bg-yellow-900/20",
                        normalized === "voicemail" &&
                          "bg-blue-50 dark:bg-blue-900/20"
                      )}
                    >
                      {getStatusIcon(call.status)}
                    </div>

                    {/* Main info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">
                          {call.callerName ||
                            formatPhoneNumber(call.callerId)}
                        </span>
                        {call.callerName && (
                          <span className="text-xs text-muted-foreground">
                            {formatPhoneNumber(call.callerId)}
                          </span>
                        )}
                        {call.isEmergency && (
                          <Badge className="bg-red-100 text-red-800 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-400 text-[10px]">
                            <AlertTriangle className="h-3 w-3 mr-0.5" />
                            Emergency
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                        <span>{formatDateTime(call.callTime)}</span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {formatDuration(call.callDuration)}
                        </span>
                      </div>
                    </div>

                    {/* Right side: badges + expand */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {getStatusBadge(call.status)}
                      <Badge
                        variant="outline"
                        className="text-[10px] hidden sm:inline-flex"
                      >
                        {normalizeIntent(call.intentDetected)}
                      </Badge>
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="px-4 pb-4 border-t bg-muted/20">
                      <div className="pt-4 space-y-4">
                        {/* Call details row */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                          <div>
                            <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                              <Phone className="h-3 w-3" /> Caller
                            </p>
                            <p className="font-medium">
                              {formatPhoneNumber(call.callerId)}
                            </p>
                            {call.callerName && (
                              <p className="text-xs text-muted-foreground">
                                {call.callerName}
                              </p>
                            )}
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                              <Clock className="h-3 w-3" /> Duration
                            </p>
                            <p className="font-medium">
                              {formatDuration(call.callDuration)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                              <MessageSquare className="h-3 w-3" /> Intent
                            </p>
                            <p className="font-medium">
                              {normalizeIntent(call.intentDetected)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
                              <User className="h-3 w-3" /> Status
                            </p>
                            {getStatusBadge(call.status)}
                          </div>
                        </div>

                        {/* Recording */}
                        {call.recordingUrl && (
                          <div>
                            <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                              <Play className="h-3 w-3" /> Recording
                            </p>
                            <audio
                              controls
                              className="w-full h-10"
                              src={call.recordingUrl}
                            >
                              Your browser does not support audio playback.
                            </audio>
                          </div>
                        )}

                        {/* Transcript */}
                        <div>
                          <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                            <MessageSquare className="h-3 w-3" /> Full
                            Transcript
                          </p>
                          {call.transcript ? (
                            <div className="bg-background border rounded-lg p-4 text-sm whitespace-pre-wrap max-h-96 overflow-y-auto leading-relaxed">
                              {call.transcript}
                            </div>
                          ) : (
                            <p className="text-sm text-muted-foreground italic">
                              No transcript available for this call
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
