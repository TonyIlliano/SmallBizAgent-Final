import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDateTime, formatPhoneNumber } from "@/lib/utils";
import { DataTable } from "@/components/ui/data-table";
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
import { CalendarIcon, PhoneCall, Phone, PhoneOff, Voicemail } from "lucide-react";

export function CallLog({ businessId = 1 }) {
  const [dateRange, setDateRange] = useState<{
    from: Date | undefined;
    to: Date | undefined;
  }>({
    from: undefined,
    to: undefined,
  });
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [emergencyFilter, setEmergencyFilter] = useState<string>("");

  // Build query params for API call
  const buildQueryParams = () => {
    const params: Record<string, any> = { businessId };
    
    if (dateRange.from) {
      params.startDate = dateRange.from.toISOString();
    }
    
    if (dateRange.to) {
      params.endDate = dateRange.to.toISOString();
    }
    
    if (statusFilter) {
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
  const { data: calls, isLoading } = useQuery({
    queryKey: ['/api/call-logs', buildQueryParams()],
  });

  // Status badge component
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'answered':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Answered</Badge>;
      case 'missed':
        return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Missed</Badge>;
      case 'voicemail':
        return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Voicemail</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  // Intent badge component
  const getIntentBadge = (intent: string) => {
    switch (intent) {
      case 'appointment':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Appointment</Badge>;
      case 'inquiry':
        return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Inquiry</Badge>;
      case 'emergency':
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Emergency</Badge>;
      default:
        return <Badge className="bg-gray-100 text-gray-800 hover:bg-gray-100">{intent || "Unknown"}</Badge>;
    }
  };

  // Call status icon component
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'answered':
        return <PhoneCall className="h-5 w-5 text-green-500" />;
      case 'missed':
        return <PhoneOff className="h-5 w-5 text-yellow-500" />;
      case 'voicemail':
        return <Voicemail className="h-5 w-5 text-blue-500" />;
      default:
        return <Phone className="h-5 w-5 text-gray-500" />;
    }
  };

  // Table columns configuration
  const columns = [
    {
      header: "Status",
      accessorKey: "status",
      cell: (call: any) => (
        <div className="flex items-center">
          {getStatusIcon(call.status)}
          <span className="ml-2">{getStatusBadge(call.status)}</span>
        </div>
      ),
    },
    {
      header: "Time",
      accessorKey: "callTime",
      cell: (call: any) => formatDateTime(call.callTime),
    },
    {
      header: "Caller",
      accessorKey: "caller",
      cell: (call: any) => (
        <div>
          <div className="font-medium">{formatPhoneNumber(call.callerId)}</div>
          {call.callerName && <div className="text-sm text-gray-500">{call.callerName}</div>}
        </div>
      ),
    },
    {
      header: "Intent",
      accessorKey: "intentDetected",
      cell: (call: any) => (
        <div className="flex items-center space-x-2">
          {call.intentDetected && getIntentBadge(call.intentDetected)}
          {call.isEmergency && (
            <Badge className="bg-red-100 text-red-800 hover:bg-red-100">
              Emergency
            </Badge>
          )}
        </div>
      ),
    },
    {
      header: "Duration",
      accessorKey: "callDuration",
      cell: (call: any) => {
        const duration = call.callDuration || 0;
        const minutes = Math.floor(duration / 60);
        const seconds = duration % 60;
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
      },
    },
    {
      header: "Transcript",
      accessorKey: "transcript",
      cell: (call: any) => (
        <div className="max-w-md truncate">
          {call.transcript || <span className="text-gray-500 italic">No transcript</span>}
        </div>
      ),
    },
  ];

  // Reset all filters
  const resetFilters = () => {
    setDateRange({ from: undefined, to: undefined });
    setStatusFilter("");
    setEmergencyFilter("");
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
        <div className="mb-6 grid grid-cols-1 md:grid-cols-4 gap-4">
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
                        {formatDate(dateRange.from)} - {formatDate(dateRange.to)}
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
                  onSelect={setDateRange}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
          
          <div>
            <label className="text-sm font-medium mb-1 block">Status</label>
            <Select 
              value={statusFilter} 
              onValueChange={setStatusFilter}
            >
              <SelectTrigger>
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All statuses</SelectItem>
                <SelectItem value="answered">Answered</SelectItem>
                <SelectItem value="missed">Missed</SelectItem>
                <SelectItem value="voicemail">Voicemail</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <label className="text-sm font-medium mb-1 block">Emergency</label>
            <Select 
              value={emergencyFilter} 
              onValueChange={setEmergencyFilter}
            >
              <SelectTrigger>
                <SelectValue placeholder="All calls" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All calls</SelectItem>
                <SelectItem value="true">Emergency only</SelectItem>
                <SelectItem value="false">Non-emergency only</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex items-end">
            <Button 
              variant="outline" 
              onClick={resetFilters}
              className="w-full"
            >
              Reset Filters
            </Button>
          </div>
        </div>
        
        <DataTable
          columns={columns}
          data={calls || []}
          isLoading={isLoading}
        />
      </CardContent>
    </Card>
  );
}
