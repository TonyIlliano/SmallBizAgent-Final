import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { PageLayout } from "@/components/layout/PageLayout";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { formatDateTime, formatTime } from "@/lib/utils";
import { PlusCircle, Calendar as CalendarIcon } from "lucide-react";
import { 
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { AppointmentForm } from "@/components/appointments/AppointmentForm";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export default function Appointments() {
  const [, navigate] = useLocation();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [sheetOpen, setSheetOpen] = useState(false);
  
  // Build query parameters
  const queryParams = {
    businessId: 1,
    startDate: selectedDate ? new Date(selectedDate.setHours(0, 0, 0, 0)).toISOString() : undefined,
    endDate: selectedDate ? new Date(selectedDate.setHours(23, 59, 59, 999)).toISOString() : undefined,
  };
  
  // Fetch appointments for selected date
  const { data: appointments, isLoading } = useQuery({
    queryKey: ['/api/appointments', queryParams],
  });
  
  // Status badge component
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'scheduled':
        return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Scheduled</Badge>;
      case 'confirmed':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Confirmed</Badge>;
      case 'completed':
        return <Badge className="bg-purple-100 text-purple-800 hover:bg-purple-100">Completed</Badge>;
      case 'cancelled':
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Cancelled</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };
  
  // Table columns
  const columns = [
    {
      header: "Time",
      accessorKey: "time",
      cell: (appointment: any) => formatTime(new Date(appointment.startDate)),
    },
    {
      header: "Customer",
      accessorKey: "customer",
      cell: (appointment: any) => (
        <div>
          <div className="font-medium">
            {appointment.customer?.firstName} {appointment.customer?.lastName}
          </div>
          <div className="text-sm text-gray-500">
            {appointment.customer?.phone}
          </div>
        </div>
      ),
    },
    {
      header: "Service",
      accessorKey: "service",
      cell: (appointment: any) => appointment.service?.name || 'General Appointment',
    },
    {
      header: "Staff",
      accessorKey: "staff",
      cell: (appointment: any) => (
        appointment.staff ? (
          <div className="flex items-center">
            <div className="h-8 w-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-800 font-medium mr-2">
              {appointment.staff.firstName?.[0]}{appointment.staff.lastName?.[0]}
            </div>
            <span>{appointment.staff.firstName} {appointment.staff.lastName}</span>
          </div>
        ) : (
          <span className="text-gray-500">Unassigned</span>
        )
      ),
    },
    {
      header: "Status",
      accessorKey: "status",
      cell: (appointment: any) => getStatusBadge(appointment.status),
    },
    {
      header: "Actions",
      accessorKey: "actions",
      cell: (appointment: any) => (
        <div className="flex items-center space-x-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/appointments/${appointment.id}`);
            }}
          >
            Edit
          </Button>
        </div>
      ),
    },
  ];
  
  return (
    <PageLayout title="Appointments">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold">Appointment Calendar</h2>
          <p className="text-gray-500">Manage your appointments and schedule</p>
        </div>
        <Button 
          onClick={() => setSheetOpen(true)} 
          className="flex items-center"
        >
          <PlusCircle className="mr-2 h-4 w-4" />
          New Appointment
        </Button>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow-sm border p-4">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant={"outline"}
                  className="w-full justify-start text-left font-normal mb-4"
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {selectedDate ? (
                    formatDateTime(selectedDate)
                  ) : (
                    <span>Pick a date</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
            
            <div className="mt-2">
              <Button 
                variant="outline" 
                className="w-full mb-2"
                onClick={() => setSelectedDate(new Date())}
              >
                Today
              </Button>
              
              <div className="grid grid-cols-2 gap-2 mt-4">
                <Button
                  variant="outline"
                  onClick={() => {
                    if (selectedDate) {
                      const prevDay = new Date(selectedDate);
                      prevDay.setDate(prevDay.getDate() - 1);
                      setSelectedDate(prevDay);
                    }
                  }}
                >
                  Previous Day
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    if (selectedDate) {
                      const nextDay = new Date(selectedDate);
                      nextDay.setDate(nextDay.getDate() + 1);
                      setSelectedDate(nextDay);
                    }
                  }}
                >
                  Next Day
                </Button>
              </div>
            </div>
          </div>
        </div>
        
        <div className="lg:col-span-3">
          <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
            <div className="p-4 border-b">
              <h3 className="text-lg font-medium">
                Appointments for {selectedDate ? formatDateTime(selectedDate).split(' at')[0] : 'Today'}
              </h3>
            </div>
            
            {isLoading ? (
              <div className="flex justify-center items-center h-64">
                <div className="animate-spin w-10 h-10 border-4 border-primary rounded-full border-t-transparent"></div>
              </div>
            ) : appointments && appointments.length > 0 ? (
              <DataTable
                columns={columns}
                data={appointments}
                pagination={false}
                searchable={false}
              />
            ) : (
              <div className="flex flex-col items-center justify-center p-8 text-center h-64">
                <CalendarIcon className="h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-lg font-medium text-gray-900">No appointments found</h3>
                <p className="mt-1 text-sm text-gray-500">
                  There are no appointments scheduled for this date.
                </p>
                <Button
                  className="mt-4"
                  onClick={() => setSheetOpen(true)}
                >
                  Schedule an Appointment
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Appointment Creation Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent size="full">
          <SheetHeader>
            <SheetTitle>Schedule New Appointment</SheetTitle>
            <SheetDescription>
              Fill in the details to schedule a new appointment
            </SheetDescription>
          </SheetHeader>
          <div className="mt-8 overflow-y-auto max-h-[calc(100vh-10rem)]">
            <AppointmentForm />
          </div>
        </SheetContent>
      </Sheet>
    </PageLayout>
  );
}
