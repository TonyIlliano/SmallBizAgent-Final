import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { PageLayout } from "@/components/layout/PageLayout";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { CalendarIntegration } from "@/components/calendar/CalendarIntegration";
import QuickBooksIntegration from "@/components/quickbooks/QuickBooksIntegration";
import ReviewSettings from "@/components/reviews/ReviewSettings";
import { SubscriptionPlans } from "@/components/subscription/SubscriptionPlans";
import { StaffScheduleManager } from "@/components/settings/StaffScheduleManager";
import BookingSettings from "@/components/settings/BookingSettings";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
import { Badge } from "@/components/ui/badge";
import { Phone, PhoneCall, Power, PowerOff, AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

// Industry options for AI receptionist
const INDUSTRY_OPTIONS = [
  { value: "automotive", label: "Automotive / Auto Repair" },
  { value: "plumbing", label: "Plumbing" },
  { value: "hvac", label: "HVAC / Heating & Cooling" },
  { value: "electrical", label: "Electrical" },
  { value: "salon", label: "Salon / Spa" },
  { value: "cleaning", label: "Cleaning Services" },
  { value: "landscaping", label: "Landscaping" },
  { value: "construction", label: "Construction / Contractors" },
  { value: "medical", label: "Medical / Healthcare" },
  { value: "dental", label: "Dental" },
  { value: "veterinary", label: "Veterinary" },
  { value: "fitness", label: "Fitness / Gym" },
  { value: "restaurant", label: "Restaurant / Food Service" },
  { value: "retail", label: "Retail" },
  { value: "professional", label: "Professional Services" },
  { value: "general", label: "General / Other" },
];

// Business Profile Schema
const businessProfileSchema = z.object({
  name: z.string().min(2, "Business name must be at least 2 characters"),
  industry: z.string().optional(),
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

// Service Schema
const serviceSchema = z.object({
  name: z.string().min(2, "Service name must be at least 2 characters"),
  description: z.string().optional(),
  price: z.coerce.number().min(0, "Price must be 0 or greater"),
  duration: z.coerce.number().min(15, "Duration must be at least 15 minutes"),
  active: z.boolean().default(true),
});

type ServiceFormData = z.infer<typeof serviceSchema>;

export default function Settings() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("profile");
  const [serviceDialogOpen, setServiceDialogOpen] = useState(false);
  const [editingService, setEditingService] = useState<any>(null);

  // Get businessId from authenticated user
  const businessId = user?.businessId;

  // Fetch business profile
  const { data: business, isLoading: isLoadingBusiness } = useQuery<any>({
    queryKey: ['/api/business'],
    enabled: !!businessId,
  });

  // Fetch business hours
  const { data: businessHours = [], isLoading: isLoadingHours } = useQuery<any[]>({
    queryKey: [`/api/business/${businessId}/hours`],
    enabled: !!businessId,
  });

  // Fetch services
  const { data: services = [], isLoading: isLoadingServices } = useQuery<any[]>({
    queryKey: ['/api/services', { businessId }],
    enabled: !!businessId,
  });

  // Poll provisioning status when it may be in progress
  const { data: provisioningStatus } = useQuery<any>({
    queryKey: [`/api/business/${businessId}/provisioning-status`],
    enabled: !!businessId && (!business?.twilioPhoneNumber || !business?.vapiAssistantId),
    refetchInterval: (query) => {
      const status = query.state.data?.provisioningStatus;
      // Poll every 5 seconds while provisioning is in progress or pending
      if (status === 'in_progress' || status === 'pending') {
        return 5000;
      }
      return false; // Stop polling when complete or failed
    },
  });

  // When provisioning completes, refresh the business data to show phone number
  useEffect(() => {
    if (provisioningStatus?.provisioningStatus === 'completed') {
      queryClient.invalidateQueries({ queryKey: ['/api/business'] });
    }
  }, [provisioningStatus?.provisioningStatus, queryClient]);
  
  // Business Profile Form
  const businessForm = useForm<z.infer<typeof businessProfileSchema>>({
    resolver: zodResolver(businessProfileSchema),
    defaultValues: {
      name: "",
      industry: "",
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
  useEffect(() => {
    if (business) {
      businessForm.reset({
        name: business.name || "",
        industry: business.industry || "",
        address: business.address || "",
        city: business.city || "",
        state: business.state || "",
        zip: business.zip || "",
        phone: business.phone || "",
        email: business.email || "",
        website: business.website || "",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business]);
  
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
      return apiRequest("PUT", `/api/business/${businessId}`, data);
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
            businessId,
            day,
            open: hours.isClosed ? null : hours.open,
            close: hours.isClosed ? null : hours.close,
            isClosed: hours.isClosed,
          });
        } else {
          // Create new hour record
          return apiRequest("POST", `/api/business-hours`, {
            businessId,
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
      queryClient.invalidateQueries({ queryKey: [`/api/business/${businessId}/hours`] });
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

  // Service Form
  const serviceForm = useForm<ServiceFormData>({
    resolver: zodResolver(serviceSchema),
    defaultValues: {
      name: "",
      description: "",
      price: 0,
      duration: 60,
      active: true,
    },
  });

  // Reset service form when editing service changes
  useEffect(() => {
    if (editingService) {
      serviceForm.reset({
        name: editingService.name || "",
        description: editingService.description || "",
        price: editingService.price || 0,
        duration: editingService.duration || 60,
        active: editingService.active !== false,
      });
    } else {
      serviceForm.reset({
        name: "",
        description: "",
        price: 0,
        duration: 60,
        active: true,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingService]);

  // Create/Update service mutation
  const saveServiceMutation = useMutation({
    mutationFn: (data: ServiceFormData) => {
      if (editingService) {
        return apiRequest("PUT", `/api/services/${editingService.id}`, {
          ...data,
          businessId,
        });
      } else {
        return apiRequest("POST", "/api/services", {
          ...data,
          businessId,
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/services"] });
      toast({
        title: "Success",
        description: editingService ? "Service updated successfully" : "Service created successfully",
      });
      setServiceDialogOpen(false);
      setEditingService(null);
      serviceForm.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to save service",
        variant: "destructive",
      });
    },
  });

  const onSubmitService = (data: ServiceFormData) => {
    saveServiceMutation.mutate(data);
  };

  const openAddServiceDialog = () => {
    setEditingService(null);
    setServiceDialogOpen(true);
  };

  const openEditServiceDialog = (service: any) => {
    setEditingService(service);
    setServiceDialogOpen(true);
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

  // Toggle AI Receptionist enabled/disabled
  const toggleReceptionistMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const response = await apiRequest("POST", `/api/business/${businessId}/receptionist/toggle`, { enabled });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/business"] });
      toast({
        title: data.receptionistEnabled ? "AI Receptionist Enabled" : "AI Receptionist Disabled",
        description: data.receptionistEnabled
          ? "Your AI receptionist is now answering calls"
          : "Your AI receptionist has been paused and will not answer calls",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update receptionist status",
        variant: "destructive",
      });
    },
  });

  // Deprovision AI Receptionist (release phone number and delete assistant)
  const deprovisionMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/business/${businessId}/receptionist/deprovision`);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/business"] });
      toast({
        title: "AI Receptionist Cancelled",
        description: "Your phone number has been released and the AI assistant has been removed",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to deprovision receptionist",
        variant: "destructive",
      });
    },
  });

  // Provision AI Receptionist (get new phone number and create assistant)
  const provisionMutation = useMutation({
    mutationFn: async () => {
      // Get area code from business phone if available
      const areaCode = business?.phone?.replace(/\D/g, "").substring(0, 3) || "212";
      const response = await apiRequest("POST", `/api/business/${businessId}/receptionist/provision`, { areaCode });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/business"] });
      toast({
        title: "AI Receptionist Activated!",
        description: `Your new phone number is ${data.phoneNumber}`,
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to provision receptionist. Please contact support.",
        variant: "destructive",
      });
    },
  });

  // Refresh VAPI Assistant (update webhook URL and configuration)
  const refreshVapiMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/vapi/refresh/${businessId}`);
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "AI Assistant Updated",
        description: "Your AI receptionist has been refreshed with the latest configuration.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to refresh AI assistant. Please try again.",
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
          <TabsList className="grid w-full grid-cols-9 mb-6">
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="team">Team</TabsTrigger>
            <TabsTrigger value="hours">Hours</TabsTrigger>
            <TabsTrigger value="services">Services</TabsTrigger>
            <TabsTrigger value="booking">Booking</TabsTrigger>
            <TabsTrigger value="reviews">Reviews</TabsTrigger>
            <TabsTrigger value="integrations">Integrations</TabsTrigger>
            <TabsTrigger value="subscription">Subscription</TabsTrigger>
            <TabsTrigger value="pwa">App</TabsTrigger>
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
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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

                        <FormField
                          control={businessForm.control}
                          name="industry"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Industry Type</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select your industry" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {INDUSTRY_OPTIONS.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                      {option.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormDescription>
                                This helps customize the AI receptionist for your business type
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

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

            {/* Virtual Receptionist Phone Number Card */}
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <PhoneCall className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle>Virtual Receptionist Phone Number</CardTitle>
                    <CardDescription>
                      Your dedicated business phone number for the AI receptionist
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {isLoadingBusiness ? (
                  <div className="flex justify-center py-4">
                    <div className="animate-spin w-6 h-6 border-4 border-primary rounded-full border-t-transparent"></div>
                  </div>
                ) : business?.twilioPhoneNumber ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
                      <Phone className="h-8 w-8 text-primary" />
                      <div className="flex-1">
                        <p className="text-2xl font-bold tracking-wide">
                          {business.twilioPhoneNumber}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Provisioned on {business.twilioDateProvisioned
                            ? new Date(business.twilioDateProvisioned).toLocaleDateString()
                            : "N/A"}
                        </p>
                      </div>
                      <Badge
                        variant="default"
                        className={business.receptionistEnabled !== false
                          ? "bg-green-500 hover:bg-green-600"
                          : "bg-yellow-500 hover:bg-yellow-600"}
                      >
                        {business.receptionistEnabled !== false ? "Active" : "Disabled"}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Customers can call this number to reach your AI-powered virtual receptionist.
                      The receptionist will handle calls, answer questions, and book appointments on your behalf.
                    </p>

                    {/* Toggle and Deprovision Controls */}
                    <div className="border-t pt-4 mt-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5">
                          <label className="text-sm font-medium">AI Receptionist Status</label>
                          <p className="text-sm text-muted-foreground">
                            {business.receptionistEnabled !== false
                              ? "Your AI receptionist is answering calls"
                              : "Your AI receptionist is paused and not answering calls"}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {toggleReceptionistMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              {business.receptionistEnabled !== false ? (
                                <Power className="h-4 w-4 text-green-500" />
                              ) : (
                                <PowerOff className="h-4 w-4 text-yellow-500" />
                              )}
                            </>
                          )}
                          <Switch
                            checked={business.receptionistEnabled !== false}
                            onCheckedChange={(checked) => {
                              toggleReceptionistMutation.mutate(checked);
                            }}
                            disabled={toggleReceptionistMutation.isPending}
                          />
                        </div>
                      </div>

                      {/* Deprovision Option */}
                      <div className="flex items-center justify-between p-3 bg-destructive/5 rounded-lg border border-destructive/20">
                        <div className="space-y-0.5">
                          <label className="text-sm font-medium text-destructive">Cancel AI Receptionist</label>
                          <p className="text-sm text-muted-foreground">
                            Release your phone number and remove the AI assistant
                          </p>
                        </div>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="destructive" size="sm">
                              Deprovision
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle className="flex items-center gap-2">
                                <AlertTriangle className="h-5 w-5 text-destructive" />
                                Cancel AI Receptionist?
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently:
                                <ul className="list-disc list-inside mt-2 space-y-1">
                                  <li>Release your phone number ({business.twilioPhoneNumber})</li>
                                  <li>Delete your AI assistant configuration</li>
                                  <li>Stop all incoming call handling</li>
                                </ul>
                                <p className="mt-3 font-medium">
                                  You can re-enable the AI receptionist later, but you will be assigned a new phone number.
                                </p>
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Keep Active</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                onClick={() => deprovisionMutation.mutate()}
                                disabled={deprovisionMutation.isPending}
                              >
                                {deprovisionMutation.isPending ? (
                                  <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Deprovisioning...
                                  </>
                                ) : (
                                  "Yes, Cancel Receptionist"
                                )}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <Phone className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                    <h3 className="font-semibold text-lg mb-1">No Phone Number Assigned</h3>
                    <p className="text-sm text-muted-foreground max-w-md mx-auto mb-4">
                      A dedicated phone number has not been provisioned for your business yet.
                    </p>

                    {/* Show provisioning progress */}
                    {(provisioningStatus?.provisioningStatus === 'in_progress' || provisionMutation.isPending) && (
                      <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground mb-4">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Setting up your AI receptionist... This may take a minute.
                      </div>
                    )}

                    {/* Show failure message */}
                    {provisioningStatus?.provisioningStatus === 'failed' && !provisionMutation.isPending && (
                      <div className="text-sm text-destructive mb-4">
                        Provisioning encountered an issue. Click below to try again.
                      </div>
                    )}

                    <Button
                      onClick={() => provisionMutation.mutate()}
                      disabled={provisionMutation.isPending || provisioningStatus?.provisioningStatus === 'in_progress'}
                    >
                      {(provisionMutation.isPending || provisioningStatus?.provisioningStatus === 'in_progress') ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Provisioning...
                        </>
                      ) : (
                        <>
                          <Phone className="mr-2 h-4 w-4" />
                          Enable AI Receptionist
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="team" className="space-y-4">
            {businessId && <StaffScheduleManager businessId={businessId} />}
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
                              <TableCell className="text-right">${(service.price ?? 0).toFixed(2)}</TableCell>
                              <TableCell>{service.duration ?? 0} min</TableCell>
                              <TableCell>
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${service.active ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                                  {service.active ? "Active" : "Inactive"}
                                </span>
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => openEditServiceDialog(service)}
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
                      onClick={openAddServiceDialog}
                    >
                      Add New Service
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Service Dialog */}
            <Dialog open={serviceDialogOpen} onOpenChange={setServiceDialogOpen}>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle>{editingService ? "Edit Service" : "Add New Service"}</DialogTitle>
                  <DialogDescription>
                    {editingService ? "Update the service details below." : "Create a new service for your business."}
                  </DialogDescription>
                </DialogHeader>
                <Form {...serviceForm}>
                  <form onSubmit={serviceForm.handleSubmit(onSubmitService)} className="space-y-4">
                    <FormField
                      control={serviceForm.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Service Name</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g., Basic Cleaning" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={serviceForm.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Description</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Describe what this service includes..."
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={serviceForm.control}
                        name="price"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Price ($)</FormLabel>
                            <FormControl>
                              <Input type="number" step="0.01" min="0" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={serviceForm.control}
                        name="duration"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Duration (min)</FormLabel>
                            <FormControl>
                              <Input type="number" min="15" step="15" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <FormField
                      control={serviceForm.control}
                      name="active"
                      render={({ field }) => (
                        <FormItem className="flex items-center justify-between rounded-lg border p-3">
                          <div className="space-y-0.5">
                            <FormLabel>Active</FormLabel>
                            <FormDescription>
                              Make this service available for booking
                            </FormDescription>
                          </div>
                          <FormControl>
                            <Switch
                              checked={field.value}
                              onCheckedChange={field.onChange}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <DialogFooter>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setServiceDialogOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button type="submit" disabled={saveServiceMutation.isPending}>
                        {saveServiceMutation.isPending ? "Saving..." : (editingService ? "Update" : "Create")}
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </TabsContent>

          <TabsContent value="booking" className="space-y-4">
            {business && <BookingSettings business={business} />}
          </TabsContent>

          <TabsContent value="reviews" className="space-y-4">
            {businessId && <ReviewSettings businessId={businessId} />}
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
                      {businessId && <CalendarIntegration businessId={businessId} />}
                    </div>
                  </TabsContent>

                  <TabsContent value="quickbooks">
                    <div className="mb-6">
                      <h3 className="text-lg font-medium mb-2">QuickBooks Integration</h3>
                      <p className="text-muted-foreground mb-4">
                        Connect with QuickBooks to sync invoices, customers, and payments
                      </p>
                      {businessId && <QuickBooksIntegration businessId={businessId} />}
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="subscription" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Subscription Management</CardTitle>
                <CardDescription>
                  Manage your SmallBizAgent subscription plan
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingBusiness ? (
                  <div className="flex justify-center py-8">
                    <div className="animate-spin w-8 h-8 border-4 border-primary rounded-full border-t-transparent"></div>
                  </div>
                ) : (
                  business && <SubscriptionPlans businessId={business.id} />
                )}
              </CardContent>
            </Card>
          </TabsContent>
          
          <TabsContent value="pwa" className="space-y-4">
            {/* AI Receptionist Refresh Card */}
            {business?.vapiAssistantId && (
              <Card>
                <CardHeader>
                  <CardTitle>AI Receptionist Configuration</CardTitle>
                  <CardDescription>
                    Manage your AI receptionist settings and sync configuration
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                    <div>
                      <h4 className="font-medium">Refresh AI Assistant</h4>
                      <p className="text-sm text-muted-foreground">
                        Update your AI receptionist with the latest business info, services, and hours
                      </p>
                    </div>
                    <Button
                      onClick={() => refreshVapiMutation.mutate()}
                      disabled={refreshVapiMutation.isPending}
                      variant="outline"
                    >
                      {refreshVapiMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Refreshing...
                        </>
                      ) : (
                        <>
                          <RefreshCw className="mr-2 h-4 w-4" />
                          Refresh Assistant
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle>Install SmallBizAgent as an App</CardTitle>
                <CardDescription>
                  Install SmallBizAgent on your device for a better experience
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex flex-col md:flex-row gap-6">
                  <div className="flex-1 rounded-lg border bg-card p-6 shadow-sm">
                    <div className="flex flex-col space-y-2">
                      <h3 className="font-semibold text-lg">Why install SmallBizAgent?</h3>
                      <ul className="space-y-2 text-sm text-muted-foreground list-disc list-inside">
                        <li>Works offline when you don't have internet</li>
                        <li>Faster loading times and better performance</li>
                        <li>App-like experience without app store downloads</li>
                        <li>Automatic updates with new features</li>
                        <li>Easier access from your home screen</li>
                      </ul>
                    </div>
                  </div>
                  <div className="flex-1 rounded-lg border bg-card p-6 shadow-sm">
                    <div className="flex flex-col space-y-2">
                      <h3 className="font-semibold text-lg">Available on all platforms</h3>
                      <ul className="space-y-2 text-sm text-muted-foreground list-disc list-inside">
                        <li>iOS - iPhone and iPad using Safari</li>
                        <li>Android - phones and tablets using Chrome</li>
                        <li>Windows - using Chrome or Edge</li>
                        <li>macOS - using Chrome, Edge, or Safari</li>
                        <li>Linux - using Chrome or Edge</li>
                      </ul>
                    </div>
                  </div>
                </div>
                
                <div className="flex justify-center">
                  <Button 
                    onClick={() => window.location.href = '/settings/pwa-installation'}
                    className="py-2 px-4"
                  >
                    View Installation Instructions
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </PageLayout>
  );
}
