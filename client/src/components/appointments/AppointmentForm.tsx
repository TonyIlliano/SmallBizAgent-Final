import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/api";
import { useLocation } from "wouter";

import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn, formatDate } from "@/lib/utils";
import { CalendarIcon, Clock } from "lucide-react";

// Time slots for appointment selection
const TIME_SLOTS = [
  "09:00", "09:30", "10:00", "10:30", "11:00", "11:30",
  "12:00", "12:30", "13:00", "13:30", "14:00", "14:30",
  "15:00", "15:30", "16:00", "16:30", "17:00"
];

// Calculate end time based on service duration
const calculateEndTime = (startTime: string, durationMinutes: number = 60): string => {
  const [hours, minutes] = startTime.split(':').map(Number);
  const startDate = new Date();
  startDate.setHours(hours, minutes, 0, 0);
  
  const endDate = new Date(startDate.getTime() + durationMinutes * 60000);
  const endHours = endDate.getHours().toString().padStart(2, '0');
  const endMinutes = endDate.getMinutes().toString().padStart(2, '0');
  
  return `${endHours}:${endMinutes}`;
};

const appointmentSchema = z.object({
  businessId: z.number().default(1),
  customerId: z.string().min(1, "Customer is required"),
  staffId: z.string().optional(),
  serviceId: z.string().optional(),
  date: z.date({
    required_error: "Date is required",
  }),
  startTime: z.string().min(1, "Start time is required"),
  status: z.string().min(1, "Status is required"),
  notes: z.string().optional(),
});

type AppointmentFormData = z.infer<typeof appointmentSchema>;

interface AppointmentFormProps {
  appointment?: any; // Use the Appointment type from schema.ts
  isEdit?: boolean;
}

export function AppointmentForm({ appointment, isEdit = false }: AppointmentFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedService, setSelectedService] = useState<any>(null);

  // Fetch customers, staff, and services for dropdowns
  const { data: customers } = useQuery({
    queryKey: ['/api/customers', { businessId: 1 }],
  });

  const { data: staff } = useQuery({
    queryKey: ['/api/staff', { businessId: 1 }],
  });

  const { data: services } = useQuery({
    queryKey: ['/api/services', { businessId: 1 }],
  });

  // Find the service data when edit mode is active
  const getInitialService = () => {
    if (isEdit && appointment?.serviceId && services) {
      return services.find((s: any) => s.id === appointment.serviceId);
    }
    return null;
  };

  // Parse appointment date and time for edit mode
  const getInitialDate = () => {
    if (isEdit && appointment?.startDate) {
      return new Date(appointment.startDate);
    }
    return new Date();
  };

  const getInitialStartTime = () => {
    if (isEdit && appointment?.startDate) {
      const date = new Date(appointment.startDate);
      const hours = date.getHours().toString().padStart(2, '0');
      const minutes = date.getMinutes().toString().padStart(2, '0');
      return `${hours}:${minutes}`;
    }
    return "09:00";
  };

  const form = useForm<AppointmentFormData>({
    resolver: zodResolver(appointmentSchema),
    defaultValues: {
      businessId: 1,
      customerId: appointment?.customerId?.toString() || "",
      staffId: appointment?.staffId?.toString() || "",
      serviceId: appointment?.serviceId?.toString() || "",
      date: getInitialDate(),
      startTime: getInitialStartTime(),
      status: appointment?.status || "scheduled",
      notes: appointment?.notes || "",
    },
  });

  // Update selected service when service changes
  const onServiceChange = (serviceId: string) => {
    form.setValue("serviceId", serviceId);
    if (services) {
      const service = services.find((s: any) => s.id.toString() === serviceId);
      setSelectedService(service);
    }
  };

  // Convert form data to API format
  const prepareDataForSubmission = (data: AppointmentFormData) => {
    // Create Date objects for start and end times
    const startDate = new Date(data.date);
    const [startHours, startMinutes] = data.startTime.split(':').map(Number);
    startDate.setHours(startHours, startMinutes, 0, 0);
    
    // Calculate end time based on service duration or default to 1 hour
    const duration = selectedService?.duration || 60;
    const endDate = new Date(startDate.getTime() + duration * 60000);
    
    return {
      businessId: data.businessId,
      customerId: parseInt(data.customerId),
      staffId: data.staffId ? parseInt(data.staffId) : null,
      serviceId: data.serviceId ? parseInt(data.serviceId) : null,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      status: data.status,
      notes: data.notes,
    };
  };

  const createMutation = useMutation({
    mutationFn: (data: any) => {
      return apiRequest("POST", "/api/appointments", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      toast({
        title: "Success",
        description: "Appointment scheduled successfully",
      });
      navigate("/appointments");
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to schedule appointment. Please try again.",
        variant: "destructive",
      });
      console.error("Error creating appointment:", error);
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: any) => {
      return apiRequest("PUT", `/api/appointments/${appointment.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      queryClient.invalidateQueries({ 
        queryKey: ["/api/appointments", appointment.id]
      });
      toast({
        title: "Success",
        description: "Appointment updated successfully",
      });
      navigate("/appointments");
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update appointment. Please try again.",
        variant: "destructive",
      });
      console.error("Error updating appointment:", error);
    },
  });

  const onSubmit = async (data: AppointmentFormData) => {
    setIsSubmitting(true);
    try {
      const preparedData = prepareDataForSubmission(data);
      if (isEdit) {
        await updateMutation.mutateAsync(preparedData);
      } else {
        await createMutation.mutateAsync(preparedData);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Initialize selected service in edit mode
  useState(() => {
    if (isEdit && appointment?.serviceId) {
      setSelectedService(getInitialService());
    }
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {isEdit ? "Edit Appointment" : "Schedule New Appointment"}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="customerId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Customer *</FormLabel>
                    <Select 
                      onValueChange={field.onChange} 
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a customer" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {customers?.map((customer: any) => (
                          <SelectItem 
                            key={customer.id} 
                            value={customer.id.toString()}
                          >
                            {customer.firstName} {customer.lastName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="serviceId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Service</FormLabel>
                    <Select 
                      onValueChange={onServiceChange} 
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a service" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {services?.map((service: any) => (
                          <SelectItem 
                            key={service.id} 
                            value={service.id.toString()}
                          >
                            {service.name} ({service.duration} min)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="staffId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Technician</FormLabel>
                    <Select 
                      onValueChange={field.onChange} 
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Assign a technician" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {staff?.map((staffMember: any) => (
                          <SelectItem 
                            key={staffMember.id} 
                            value={staffMember.id.toString()}
                          >
                            {staffMember.firstName} {staffMember.lastName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status *</FormLabel>
                    <Select 
                      onValueChange={field.onChange} 
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="scheduled">Scheduled</SelectItem>
                        <SelectItem value="confirmed">Confirmed</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Date *</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant={"outline"}
                            className={cn(
                              "pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                          >
                            {field.value ? (
                              formatDate(field.value)
                            ) : (
                              <span>Pick a date</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          initialFocus
                          disabled={(date) => date < new Date()}
                        />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="startTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Time *</FormLabel>
                    <Select 
                      onValueChange={field.onChange} 
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a time" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {TIME_SLOTS.map((time) => {
                          const endTime = calculateEndTime(
                            time, 
                            selectedService?.duration || 60
                          );
                          return (
                            <SelectItem key={time} value={time}>
                              {time} - {endTime}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Duration: {selectedService?.duration || 60} minutes
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Additional notes or special instructions" 
                      className="min-h-[80px]" 
                      {...field} 
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <div className="flex justify-end space-x-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => navigate("/appointments")}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting 
                  ? "Saving..." 
                  : isEdit 
                    ? "Update Appointment" 
                    : "Schedule Appointment"}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
