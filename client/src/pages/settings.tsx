import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { PageLayout } from "@/components/layout/PageLayout";
import { apiRequest } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { CalendarIntegration } from "@/components/calendar/CalendarIntegration";
import QuickBooksIntegration from "@/components/quickbooks/QuickBooksIntegration";

import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

// Business Profile Schema
const businessProfileSchema = z.object({
  name: z.string().min(2, "Business name must be at least 2 characters"),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  phone: z.string().min(10, "Phone number must be at least 10 digits"),
  email: z.string().email("Invalid email address"),
  website: z.string().url("Invalid website URL").optional().or(z.literal("")),
});

// Business Hours Schema
const businessHoursSchema = z.object({
  monday: z.object({
    isClosed: z.boolean(),
    open: z.string().optional(),
    close: z.string().optional(),
  }),
  tuesday: z.object({
    isClosed: z.boolean(),
    open: z.string().optional(),
    close: z.string().optional(),
  }),
  wednesday: z.object({
    isClosed: z.boolean(),
    open: z.string().optional(),
    close: z.string().optional(),
  }),
  thursday: z.object({
    isClosed: z.boolean(),
    open: z.string().optional(),
    close: z.string().optional(),
  }),
  friday: z.object({
    isClosed: z.boolean(),
    open: z.string().optional(),
    close: z.string().optional(),
  }),
  saturday: z.object({
    isClosed: z.boolean(),
    open: z.string().optional(),
    close: z.string().optional(),
  }),
  sunday: z.object({
    isClosed: z.boolean(),
    open: z.string().optional(),
    close: z.string().optional(),
  }),
});

export default function Settings() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("profile");
  
  // Fetch business profile
  const { data: business, isLoading: isLoadingBusiness } = useQuery({
    queryKey: ['/api/business'],
  });
  
  // Fetch business hours
  const { data: businessHours, isLoading: isLoadingHours } = useQuery({
    queryKey: ['/api/business/1/hours'],
  });
  
  // Fetch services
  const { data: services, isLoading: isLoadingServices } = useQuery({
    queryKey: ['/api/services', { businessId: 1 }],
  });
  
  // Business Profile Form
  const businessForm = useForm<z.infer<typeof businessProfileSchema>>({
    resolver: zodResolver(businessProfileSchema),
    defaultValues: {
      name: "",
      address: "",
      city: "",
      state: "",
      zip: "",
      phone: "",
      email: "",
      website: "",
    },
  });
  
  // Update form when business data is loaded
  useState(() => {
    if (business) {
      businessForm.reset({
        name: business.name || "",
        address: business.address || "",
        city: business.city || "",
        state: business.state || "",
        zip: business.zip || "",
        phone: business.phone || "",
        email: business.email || "",
        website: business.website || "",
      });
    }
  });
  
  // Format business hours data for form
  const formatBusinessHours = () => {
    if (!businessHours) return null;
    
    const daysOfWeek = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
    const formattedHours: any = {};
    
    daysOfWeek.forEach(day => {
      const dayData = businessHours.find((h: any) => h.day === day);
      if (dayData) {
        formattedHours[day] = {
          isClosed: dayData.isClosed,
          open: dayData.open,
          close: dayData.close,
        };
      } else {
        formattedHours[day] = {
          isClosed: day === "sunday",
          open: "09:00",
          close: "17:00",
        };
      }
    });
    
    return formattedHours;
  };
  
  // Business Hours Form
  const hoursForm = useForm<z.infer<typeof businessHoursSchema>>({
    resolver: zodResolver(businessHoursSchema),
    defaultValues: formatBusinessHours() || {
      monday: { isClosed: false, open: "09:00", close: "17:00" },
      tuesday: { isClosed: false, open: "09:00", close: "17:00" },
      wednesday: { isClosed: false, open: "09:00", close: "17:00" },
      thursday: { isClosed: false, open: "09:00", close: "17:00" },
      friday: { isClosed: false, open: "09:00", close: "17:00" },
      saturday: { isClosed: false, open: "10:00", close: "15:00" },
      sunday: { isClosed: true, open: "", close: "" },
    },
  });
  
  // Update profile mutation
  const updateProfileMutation = useMutation({
    mutationFn: (data: z.infer<typeof businessProfileSchema>) => {
      return apiRequest("PUT", `/api/business/1`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/business"] });
      toast({
        title: "Success",
        description: "Business profile updated successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update business profile",
        variant: "destructive",
      });
    },
  });
  
  // Update business hours mutation
  const updateHoursMutation = useMutation({
    mutationFn: (data: any) => {
      // Transform form data to API format
      const updates = Object.entries(data).map(([day, hours]: [string, any]) => {
        const hourData = businessHours?.find((h: any) => h.day === day);
        if (hourData) {
          // Update existing hour record
          return apiRequest("PUT", `/api/business-hours/${hourData.id}`, {
            businessId: 1,
            day,
            open: hours.isClosed ? null : hours.open,
            close: hours.isClosed ? null : hours.close,
            isClosed: hours.isClosed,
          });
        } else {
          // Create new hour record
          return apiRequest("POST", `/api/business-hours`, {
            businessId: 1,
            day,
            open: hours.isClosed ? null : hours.open,
            close: hours.isClosed ? null : hours.close,
            isClosed: hours.isClosed,
          });
        }
      });
      
      return Promise.all(updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/business/1/hours"] });
      toast({
        title: "Success",
        description: "Business hours updated successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update business hours",
        variant: "destructive",
      });
    },
  });
  
  // Submit handlers
  const onSubmitProfile = (data: z.infer<typeof businessProfileSchema>) => {
    updateProfileMutation.mutate(data);
  };
  
  const onSubmitHours = (data: z.infer<typeof businessHoursSchema>) => {
    updateHoursMutation.mutate(data);
  };
  
  // Delete service mutation
  const deleteServiceMutation = useMutation({
    mutationFn: (id: number) => {
      return apiRequest("DELETE", `/api/services/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/services"] });
      toast({
        title: "Success",
        description: "Service deleted successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to delete service",
        variant: "destructive",
      });
    },
  });
  
  return (
    <PageLayout title="Settings">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold">Business Settings</h2>
          <p className="text-gray-500">
            Manage your business profile, hours, and services
          </p>
        </div>
        
        <Tabs defaultValue="profile" value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-5 mb-6">
            <TabsTrigger value="profile">Business Profile</TabsTrigger>
            <TabsTrigger value="hours">Business Hours</TabsTrigger>
            <TabsTrigger value="services">Services</TabsTrigger>
            <TabsTrigger value="integrations">Integrations</TabsTrigger>
            <TabsTrigger value="subscription">Subscription</TabsTrigger>
          </TabsList>
          
          <TabsContent value="profile" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Business Profile</CardTitle>
                <CardDescription>
                  Update your business information that will appear on invoices and communications
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingBusiness ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin w-8 h-8 border-4 border-primary rounded-full border-t-transparent"></div>
                  </div>
                ) : (
                  <Form {...businessForm}>
                    <form onSubmit={businessForm.handleSubmit(onSubmitProfile)} className="space-y-6">
                      <FormField
                        control={businessForm.control}
                        name="name"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Business Name</FormLabel>
                            <FormControl>
                              <Input {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <FormField
                          control={businessForm.control}
                          name="phone"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Phone Number</FormLabel>
                              <FormControl>
                                <Input {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={businessForm.control}
                          name="email"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Email Address</FormLabel>
                              <FormControl>
                                <Input {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      
                      <FormField
                        control={businessForm.control}
                        name="website"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Website</FormLabel>
                            <FormControl>
                              <Input {...field} value={field.value || ""} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <FormField
                        control={businessForm.control}
                        name="address"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Street Address</FormLabel>
                            <FormControl>
                              <Input {...field} value={field.value || ""} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      
                      <div className="grid grid-cols-3 gap-4">
                        <FormField
                          control={businessForm.control}
                          name="city"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>City</FormLabel>
                              <FormControl>
                                <Input {...field} value={field.value || ""} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={businessForm.control}
                          name="state"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>State</FormLabel>
                              <FormControl>
                                <Input {...field} value={field.value || ""} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        <FormField
                          control={businessForm.control}
                          name="zip"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>ZIP Code</FormLabel>
                              <FormControl>
                                <Input {...field} value={field.value || ""} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      
                      <Button 
                        type="submit" 
                        className="mt-4"
                        disabled={updateProfileMutation.isPending}
                      >
                        {updateProfileMutation.isPending ? "Saving..." : "Save Changes"}
                      </Button>
                    </form>
                  </Form>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="hours" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Business Hours</CardTitle>
                <CardDescription>
                  Set your regular business hours to help schedule appointments properly
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingHours ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin w-8 h-8 border-4 border-primary rounded-full border-t-transparent"></div>
                  </div>
                ) : (
                  <Form {...hoursForm}>
                    <form onSubmit={hoursForm.handleSubmit(onSubmitHours)} className="space-y-6">
                      {["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map((day) => (
                        <div key={day} className="border rounded-md p-4">
                          <div className="flex justify-between items-center mb-4">
                            <h3 className="font-medium capitalize">{day}</h3>
                            <FormField
                              control={hoursForm.control}
                              name={`${day}.isClosed` as any}
                              render={({ field }) => (
                                <FormItem className="flex flex-row items-center space-x-2">
                                  <FormLabel htmlFor={`${day}-closed`}>Closed</FormLabel>
                                  <FormControl>
                                    <Switch
                                      id={`${day}-closed`}
                                      checked={field.value}
                                      onCheckedChange={field.onChange}
                                    />
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                          </div>
                          
                          <div className="grid grid-cols-2 gap-4">
                            <FormField
                              control={hoursForm.control}
                              name={`${day}.open` as any}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Opening Time</FormLabel>
                                  <FormControl>
                                    <Input
                                      type="time"
                                      {...field}
                                      value={field.value || ""}
                                      disabled={hoursForm.watch(`${day}.isClosed` as any)}
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            
                            <FormField
                              control={hoursForm.control}
                              name={`${day}.close` as any}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Closing Time</FormLabel>
                                  <FormControl>
                                    <Input
                                      type="time"
                                      {...field}
                                      value={field.value || ""}
                                      disabled={hoursForm.watch(`${day}.isClosed` as any)}
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                        </div>
                      ))}
                      
                      <Button 
                        type="submit" 
                        className="mt-4"
                        disabled={updateHoursMutation.isPending}
                      >
                        {updateHoursMutation.isPending ? "Saving..." : "Save Business Hours"}
                      </Button>
                    </form>
                  </Form>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="services" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Services</CardTitle>
                <CardDescription>
                  Manage the services your business offers to customers
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingServices ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin w-8 h-8 border-4 border-primary rounded-full border-t-transparent"></div>
                  </div>
                ) : (
                  <div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Service Name</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead className="text-right">Price</TableHead>
                          <TableHead>Duration</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {services && services.length > 0 ? (
                          services.map((service: any) => (
                            <TableRow key={service.id}>
                              <TableCell className="font-medium">{service.name}</TableCell>
                              <TableCell>{service.description || "N/A"}</TableCell>
                              <TableCell className="text-right">${service.price.toFixed(2)}</TableCell>
                              <TableCell>{service.duration} min</TableCell>
                              <TableCell>
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${service.active ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                                  {service.active ? "Active" : "Inactive"}
                                </span>
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    // Edit service functionality would go here
                                    alert("Edit service: " + service.name);
                                  }}
                                >
                                  Edit
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-red-500 hover:text-red-700 hover:bg-red-50"
                                  onClick={() => {
                                    if (confirm(`Are you sure you want to delete ${service.name}?`)) {
                                      deleteServiceMutation.mutate(service.id);
                                    }
                                  }}
                                >
                                  Delete
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center py-8">
                              No services found. Add your first service.
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                    
                    <Button 
                      className="mt-6"
                      onClick={() => {
                        // Add service functionality would go here
                        alert("Add new service");
                      }}
                    >
                      Add New Service
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="integrations" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Integrations</CardTitle>
                <CardDescription>
                  Connect external services to enhance your business management
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="calendar">
                  <TabsList className="mb-4">
                    <TabsTrigger value="calendar">Calendar</TabsTrigger>
                    <TabsTrigger value="quickbooks">QuickBooks</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="calendar">
                    <div className="mb-6">
                      <h3 className="text-lg font-medium mb-2">Calendar Integrations</h3>
                      <p className="text-muted-foreground mb-4">
                        Sync appointments with your preferred calendar service
                      </p>
                      <CalendarIntegration businessId={1} />
                    </div>
                  </TabsContent>
                  
                  <TabsContent value="quickbooks">
                    <div className="mb-6">
                      <h3 className="text-lg font-medium mb-2">QuickBooks Integration</h3>
                      <p className="text-muted-foreground mb-4">
                        Connect with QuickBooks to sync invoices, customers, and payments
                      </p>
                      <QuickBooksIntegration businessId={1} />
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </PageLayout>
  );
}
