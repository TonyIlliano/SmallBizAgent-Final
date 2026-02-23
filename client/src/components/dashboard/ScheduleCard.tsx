import { useState } from "react";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Calendar, Clock, Plus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { formatTime, formatDate } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton-loader";
import { Link } from "wouter";

interface ScheduleCardProps {
  businessId?: number | null;
}

export function ScheduleCard({ businessId }: ScheduleCardProps) {
  const [currentDate, setCurrentDate] = useState(new Date());

  // Create proper ISO date strings for API filtering
  const getStartOfDay = (date: Date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  };

  const getEndOfDay = (date: Date) => {
    const d = new Date(date);
    d.setHours(23, 59, 59, 999);
    return d.toISOString();
  };

  const { data: appointments = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/appointments', {
      businessId,
      startDate: getStartOfDay(currentDate),
      endDate: getEndOfDay(currentDate)
    }],
    enabled: !!businessId,
  });

  const formatTimeSlot = (time: string) => {
    const d = new Date(time);
    const hours = d.getHours();
    const minutes = d.getMinutes();
    return `${hours === 0 ? 12 : hours > 12 ? hours - 12 : hours}:${minutes.toString().padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'confirmed':
        return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0 text-xs font-medium">Confirmed</Badge>;
      case 'pending':
        return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-0 text-xs font-medium">Pending</Badge>;
      case 'cancelled':
        return <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-0 text-xs font-medium">Cancelled</Badge>;
      case 'completed':
        return <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-0 text-xs font-medium">Completed</Badge>;
      default:
        return <Badge className="text-xs font-medium">{status}</Badge>;
    }
  };

  const previousDay = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() - 1);
    setCurrentDate(newDate);
  };

  const nextDay = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + 1);
    setCurrentDate(newDate);
  };

  const isToday = () => {
    const today = new Date();
    return currentDate.toDateString() === today.toDateString();
  };

  return (
    <Card className="h-full border-border bg-card shadow-sm rounded-xl overflow-hidden">
      <CardHeader className="pb-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Calendar className="h-5 w-5 text-foreground" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">
                {isToday() ? "Today's Schedule" : "Schedule"}
              </h3>
              <p className="text-sm text-muted-foreground">
                {formatDate(currentDate)}
              </p>
            </div>
          </div>
          <Link href="/appointments/new">
            <Button size="sm" className="h-9 rounded-lg">
              <Plus className="h-4 w-4 mr-1" />
              Add
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-4 space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-start gap-3">
                <Skeleton className="h-12 w-12 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
              </div>
            ))}
          </div>
        ) : appointments && appointments.length > 0 ? (
          <div className="divide-y divide-border">
            {appointments.map((appointment: any) => (
              <div key={appointment.id} className="py-4 px-4 flex items-start gap-4 hover:bg-muted/50 transition-colors">
                <div className="flex-shrink-0 h-12 w-12 rounded-xl bg-muted flex flex-col items-center justify-center">
                  <Clock className="h-4 w-4 text-muted-foreground mb-0.5" />
                  <span className="text-xs font-semibold text-foreground">
                    {formatTimeSlot(appointment.startDate)}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-sm font-semibold text-foreground truncate">
                      {appointment.customer
                        ? `${appointment.customer.firstName} ${appointment.customer.lastName}`.trim()
                        : 'Walk-in'}
                    </h4>
                    {getStatusBadge(appointment.status)}
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5 truncate">
                    {appointment.service?.name || 'General Appointment'}
                    {appointment.staff ? ` · ${appointment.staff.firstName}` : ''}
                  </p>
                  {appointment.customer?.phone && (
                    <p className="text-xs text-muted-foreground/70 truncate">
                      {appointment.customer.phone}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-12 flex flex-col items-center justify-center text-center px-4">
            <div className="p-4 rounded-full bg-muted mb-4">
              <Calendar className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-sm font-semibold text-foreground">No appointments today</h3>
            <p className="mt-1 text-sm text-muted-foreground max-w-[200px]">
              Schedule your first appointment to get started
            </p>
          </div>
        )}
      </CardContent>
      <CardFooter className="bg-muted/50 px-4 py-3 border-t border-border">
        <div className="flex justify-between w-full gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={previousDay}
            className="text-sm h-9 px-3 text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Previous
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={nextDay}
            className="text-sm h-9 px-3 text-muted-foreground hover:text-foreground"
          >
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
