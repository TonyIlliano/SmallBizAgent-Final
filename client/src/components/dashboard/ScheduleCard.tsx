import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { formatTime, formatDate } from "@/lib/utils";

interface ScheduleCardProps {
  date?: Date;
  businessId?: number;
}

export function ScheduleCard({ date = new Date(), businessId = 1 }: ScheduleCardProps) {
  const { data: appointments, isLoading } = useQuery({
    queryKey: ['/api/appointments', { 
      businessId, 
      startDate: formatDate(date), 
      endDate: formatDate(date) 
    }],
  });

  const formatTimeSlot = (time: string) => {
    const date = new Date(time);
    const hours = date.getHours();
    const minutes = date.getMinutes();
    return `${hours === 0 ? 12 : hours > 12 ? hours - 12 : hours}:${minutes.toString().padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'confirmed':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Confirmed</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Pending</Badge>;
      case 'cancelled':
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Cancelled</Badge>;
      case 'completed':
        return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Completed</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const previousDay = () => {
    // Logic to navigate to previous day
    // Would be implemented with state in a real component
  };

  const nextDay = () => {
    // Logic to navigate to next day
    // Would be implemented with state in a real component
  };

  return (
    <Card className="h-full">
      <CardHeader className="pb-3 border-b border-gray-200">
        <h3 className="text-lg font-medium text-gray-900">Today's Schedule</h3>
        <p className="text-sm text-gray-500 mt-1">
          Upcoming appointments for {formatDate(date)}
        </p>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-6 text-center">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto"></div>
            <p className="text-sm text-gray-500 mt-2">Loading schedule...</p>
          </div>
        ) : appointments && appointments.length > 0 ? (
          <div className="divide-y divide-gray-200">
            {appointments.map((appointment: any) => (
              <div key={appointment.id} className="py-3 px-4 flex items-start">
                <span className="flex-shrink-0 h-10 w-10 rounded-full bg-primary-100 flex items-center justify-center">
                  <span className="text-primary-600 text-sm font-medium">
                    {formatTimeSlot(appointment.startDate)}
                  </span>
                </span>
                <div className="ml-4 flex-1">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium text-gray-900">
                      {appointment.service?.name || 'Appointment'}
                    </h4>
                    {getStatusBadge(appointment.status)}
                  </div>
                  <p className="text-sm text-gray-500">
                    {appointment.customer?.firstName} {appointment.customer?.lastName} • 
                    {appointment.customer?.notes?.split('•')[1] || ''}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-6 flex flex-col items-center justify-center text-center">
            <svg
              className="h-12 w-12 text-gray-400"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">No appointments today</h3>
            <p className="mt-1 text-sm text-gray-500">You have no scheduled appointments for today.</p>
            <div className="mt-4">
              <Button>Add appointment</Button>
            </div>
          </div>
        )}
      </CardContent>
      <CardFooter className="bg-gray-50 px-4 py-4 border-t border-gray-200">
        <div className="flex justify-between w-full">
          <Button
            variant="outline"
            size="sm"
            onClick={previousDay}
            className="text-sm"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Previous Day
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={nextDay}
            className="text-sm"
          >
            Next Day
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </CardFooter>
    </Card>
  );
}
