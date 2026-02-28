import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { PageLayout } from "@/components/layout/PageLayout";
import { apiRequest } from "@/lib/queryClient";
import { formatPhoneNumber } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { CalendarIntegration } from "@/components/calendar/CalendarIntegration";
import QuickBooksIntegration from "@/components/quickbooks/QuickBooksIntegration";
import { StripeConnectIntegration } from "@/components/stripe/StripeConnectIntegration";
import RestaurantSettings from "@/components/restaurant/RestaurantSettings";
import InventoryDashboard from "@/components/restaurant/InventoryDashboard";
import ReviewSettings from "@/components/reviews/ReviewSettings";
import { SubscriptionPlans } from "@/components/subscription/SubscriptionPlans";
import { OverageBillingHistory } from "@/components/subscription/OverageBillingHistory";
import { StaffScheduleManager } from "@/components/settings/StaffScheduleManager";
import BookingSettings from "@/components/settings/BookingSettings";
import NotificationSettingsPanel from "@/components/settings/NotificationSettings";
import { WebhookSettings } from "@/components/settings/WebhookSettings";
import { ApiKeySettings } from "@/components/settings/ApiKeySettings";
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
import { Phone, PhoneCall, Power, PowerOff, AlertTriangle, Loader2, RefreshCw, Search, ChevronDown, ChevronUp, MapPin, ArrowRight, Info, Upload, X, ImageIcon } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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

// Timezone options for US businesses
const TIMEZONE_OPTIONS = [
  { value: "America/New_York", label: "Eastern Time (EST/EDT)" },
  { value: "America/Chicago", label: "Central Time (CST/CDT)" },
  { value: "America/Denver", label: "Mountain Time (MST/MDT)" },
  { value: "America/Los_Angeles", label: "Pacific Time (PST/PDT)" },
  { value: "America/Phoenix", label: "Arizona (MST, no DST)" },
  { value: "America/Anchorage", label: "Alaska Time (AKST/AKDT)" },
  { value: "Pacific/Honolulu", label: "Hawaii Time (HST)" },
];

// Business Profile Schema
const businessProfileSchema = z.object({
  name: z.string().min(2, "Business name must be at least 2 characters"),
  industry: z.string().optional(),
  timezone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  phone: z.string().min(10, "Phone number must be at least 10 digits"),
  email: z.string().email("Invalid email address"),
  website: z.string().url("Invalid website URL").optional().or(z.literal("")),
  logoUrl: z.string().optional().or(z.literal("")),
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
  // Read tab from URL query param (e.g. /settings?tab=services)
  const urlParams = new URLSearchParams(window.location.search);
  const initialTab = urlParams.get('tab') || "profile";
  const [activeTab, setActiveTab] = useState(initialTab);
  const [serviceDialogOpen, setServiceDialogOpen] = useState(false);
  const [editingService, setEditingService] = useState<any>(null);

  // Handle Clover OAuth callback redirect
  useEffect(() => {
    const cloverParam = urlParams.get('clover');
    if (cloverParam === 'connected') {
      toast({
        title: "Clover Connected!",
        description: "Your Clover POS has been connected successfully. Menu has been synced.",
      });
      setActiveTab('restaurant');
      // Clean up URL params
      window.history.replaceState({}, '', '/settings?tab=restaurant');
    } else if (cloverParam === 'error') {
      const message = urlParams.get('message') || 'Connection failed';
      toast({
        title: "Clover Connection Failed",
        description: decodeURIComponent(message),
        variant: "destructive",
      });
      setActiveTab('restaurant');
      window.history.replaceState({}, '', '/settings?tab=restaurant');
    }

    // Handle Stripe Connect return from onboarding
    const stripeConnectParam = urlParams.get('stripe_connect');
    if (stripeConnectParam === 'return') {
      toast({
        title: "Stripe Setup",
        description: "Checking your Stripe account status...",
      });
      setActiveTab('integrations');
      window.history.replaceState({}, '', '/settings?tab=integrations');
    } else if (stripeConnectParam === 'refresh') {
      // User needs to re-enter onboarding (link expired)
      toast({
        title: "Session Expired",
        description: "Your Stripe setup session expired. Please try again.",
        variant: "destructive",
      });
      setActiveTab('integrations');
      window.history.replaceState({}, '', '/settings?tab=integrations');
    }
  }, []);

  // Get businessId from authenticated user
  const businessId = user?.businessId;

  // Fetch business profile
  const { data: business, isLoading: isLoadingBusiness } = useQuery<any>({
    queryKey: ['/api/business'],
    enabled: !!businessId,
  });

  // Check if this is a restaurant business for conditional tab rendering
  const isRestaurant = business?.industry?.toLowerCase() === 'restaurant';
  // Check if restaurant has POS connected (for inventory tab)
  const hasPOS = isRestaurant && (
    (business?.cloverMerchantId && business?.cloverAccessToken) ||
    (business?.squareAccessToken && business?.squareLocationId)
  );

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
      logoUrl: "",
    },
  });
  
  // Update form when business data is loaded
  useEffect(() => {
    if (business) {
      businessForm.reset({
        name: business.name || "",
        industry: business.industry || "",
        timezone: business.timezone || "America/New_York",
        address: business.address || "",
        city: business.city || "",
        state: business.state || "",
        zip: business.zip || "",
        phone: business.phone || "",
        email: business.email || "",
        website: business.website || "",
        logoUrl: business.logoUrl || "",
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
  
  // Reset hours form when business hours data loads from API
  useEffect(() => {
    if (businessHours && businessHours.length > 0) {
      const formatted = formatBusinessHours();
      if (formatted) {
        hoursForm.reset(formatted);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessHours]);

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
    onError: (error: any) => {
      console.error("Business profile update error:", error);
      toast({
        title: "Error",
        description: error?.message || "Failed to update business profile",
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

  // Phone provisioning dialog state
  const [phoneDialogOpen, setPhoneDialogOpen] = useState(false);
  const [phoneDialogTab, setPhoneDialogTab] = useState<"new" | "existing">("new");
  const [searchAreaCode, setSearchAreaCode] = useState("");
  const [selectedPhoneNumber, setSelectedPhoneNumber] = useState<string | null>(null);
  const [availableNumbers, setAvailableNumbers] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [forwardingInfoOpen, setForwardingInfoOpen] = useState(false);

  // Pre-fill area code from business phone
  useEffect(() => {
    if (business?.phone && !searchAreaCode) {
      const digits = business.phone.replace(/\D/g, "");
      if (digits.length >= 3) {
        setSearchAreaCode(digits.substring(0, 3));
      }
    }
  }, [business?.phone]);

  // Search available phone numbers
  const searchNumbers = async () => {
    if (!searchAreaCode || searchAreaCode.length !== 3 || !/^\d{3}$/.test(searchAreaCode)) {
      toast({
        title: "Invalid area code",
        description: "Please enter a 3-digit area code",
        variant: "destructive",
      });
      return;
    }
    setIsSearching(true);
    setSelectedPhoneNumber(null);
    try {
      const response = await apiRequest("GET", `/api/business/${businessId}/available-numbers?areaCode=${searchAreaCode}`);
      const data = await response.json();
      setAvailableNumbers(data.phoneNumbers || []);
      if ((data.phoneNumbers || []).length === 0) {
        toast({
          title: "No numbers found",
          description: `No phone numbers available in area code ${searchAreaCode}. Try a different area code.`,
        });
      }
    } catch (error) {
      toast({
        title: "Search failed",
        description: "Failed to search for available numbers. Please try again.",
        variant: "destructive",
      });
      setAvailableNumbers([]);
    } finally {
      setIsSearching(false);
    }
  };

  // Provision AI Receptionist with optional specific number
  const provisionMutation = useMutation({
    mutationFn: async (params?: { phoneNumber?: string; areaCode?: string }) => {
      const body: any = {};
      if (params?.phoneNumber) {
        body.phoneNumber = params.phoneNumber;
      } else if (params?.areaCode) {
        body.areaCode = params.areaCode;
      } else {
        // Default: use area code from business phone
        body.areaCode = business?.phone?.replace(/\D/g, "").substring(0, 3) || "212";
      }
      const response = await apiRequest("POST", `/api/business/${businessId}/receptionist/provision`, body);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/business"] });
      setPhoneDialogOpen(false);
      setAvailableNumbers([]);
      setSelectedPhoneNumber(null);
      toast({
        title: "AI Receptionist Activated!",
        description: `Your new phone number is ${formatPhoneNumber(data.phoneNumber)}`,
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
          <TabsList className={`flex w-full overflow-x-auto md:grid md:w-full ${hasPOS ? 'md:grid-cols-12' : isRestaurant ? 'md:grid-cols-11' : 'md:grid-cols-10'} mb-6 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]`}>
            <TabsTrigger value="profile" className="whitespace-nowrap flex-shrink-0">Profile</TabsTrigger>
            <TabsTrigger value="team" className="whitespace-nowrap flex-shrink-0">Team</TabsTrigger>
            <TabsTrigger value="hours" className="whitespace-nowrap flex-shrink-0">Hours</TabsTrigger>
            <TabsTrigger value="services" className="whitespace-nowrap flex-shrink-0">Services</TabsTrigger>
            <TabsTrigger value="booking" className="whitespace-nowrap flex-shrink-0">Booking</TabsTrigger>
            <TabsTrigger value="notifications" className="whitespace-nowrap flex-shrink-0">Notifications</TabsTrigger>
            <TabsTrigger value="reviews" className="whitespace-nowrap flex-shrink-0">Reviews</TabsTrigger>
            {isRestaurant && <TabsTrigger value="restaurant" className="whitespace-nowrap flex-shrink-0">Restaurant</TabsTrigger>}
            {hasPOS && <TabsTrigger value="inventory" className="whitespace-nowrap flex-shrink-0">Inventory</TabsTrigger>}
            <TabsTrigger value="integrations" className="whitespace-nowrap flex-shrink-0">Integrations</TabsTrigger>
            <TabsTrigger value="subscription" className="whitespace-nowrap flex-shrink-0">Subscription</TabsTrigger>
            <TabsTrigger value="pwa" className="whitespace-nowrap flex-shrink-0">App</TabsTrigger>
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

                        <FormField
                          control={businessForm.control}
                          name="timezone"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Business Timezone</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select your timezone" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {TIMEZONE_OPTIONS.map((option) => (
                                    <SelectItem key={option.value} value={option.value}>
                                      {option.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormDescription>
                                All appointment times, booking page, and AI receptionist will use this timezone
                              </FormDescription>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      {/* Business Logo */}
                      <FormField
                        control={businessForm.control}
                        name="logoUrl"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Business Logo</FormLabel>
                            <FormDescription>
                              Your logo will appear on quotes and invoices
                            </FormDescription>
                            <FormControl>
                              <div className="flex items-center gap-4">
                                {field.value ? (
                                  <div className="relative">
                                    <img
                                      src={field.value}
                                      alt="Business logo"
                                      className="h-20 w-20 rounded-lg object-contain border bg-white"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => field.onChange("")}
                                      className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-destructive text-white flex items-center justify-center hover:bg-destructive/80"
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  </div>
                                ) : (
                                  <div className="h-20 w-20 rounded-lg border-2 border-dashed border-muted-foreground/25 flex items-center justify-center">
                                    <ImageIcon className="h-8 w-8 text-muted-foreground/40" />
                                  </div>
                                )}
                                <div>
                                  <label className="cursor-pointer">
                                    <input
                                      type="file"
                                      accept="image/png,image/jpeg,image/svg+xml,image/webp"
                                      className="hidden"
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (!file) return;
                                        if (file.size > 500 * 1024) {
                                          toast({
                                            title: "File too large",
                                            description: "Logo must be under 500KB",
                                            variant: "destructive",
                                          });
                                          return;
                                        }
                                        const reader = new FileReader();
                                        reader.onload = () => {
                                          // Resize image to max 200x200 to keep payload small
                                          const img = new Image();
                                          img.onload = () => {
                                            const canvas = document.createElement("canvas");
                                            const maxSize = 200;
                                            let w = img.width;
                                            let h = img.height;
                                            if (w > maxSize || h > maxSize) {
                                              if (w > h) {
                                                h = (h / w) * maxSize;
                                                w = maxSize;
                                              } else {
                                                w = (w / h) * maxSize;
                                                h = maxSize;
                                              }
                                            }
                                            canvas.width = w;
                                            canvas.height = h;
                                            const ctx = canvas.getContext("2d");
                                            ctx?.drawImage(img, 0, 0, w, h);
                                            field.onChange(canvas.toDataURL("image/png", 0.9));
                                          };
                                          img.src = reader.result as string;
                                        };
                                        reader.readAsDataURL(file);
                                        e.target.value = "";
                                      }}
                                    />
                                    <span className="inline-flex items-center gap-2 px-3 py-2 text-sm border rounded-md hover:bg-accent transition-colors">
                                      <Upload className="h-4 w-4" />
                                      {field.value ? "Change Logo" : "Upload Logo"}
                                    </span>
                                  </label>
                                  <p className="text-xs text-muted-foreground mt-1">PNG, JPG, SVG, or WebP. Max 500KB.</p>
                                </div>
                              </div>
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
                      
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                          {formatPhoneNumber(business.twilioPhoneNumber)}
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
                                  <li>Release your phone number ({formatPhoneNumber(business.twilioPhoneNumber)})</li>
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

                      {/* Call Forwarding Instructions */}
                      <Collapsible open={forwardingInfoOpen} onOpenChange={setForwardingInfoOpen}>
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" className="w-full justify-between" size="sm">
                            <span className="flex items-center gap-2">
                              <Info className="h-4 w-4" />
                              Call Forwarding Setup
                            </span>
                            {forwardingInfoOpen ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="mt-2 p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800 space-y-3">
                            <p className="text-sm font-medium">
                              Want calls to your existing business number to reach this AI receptionist?
                            </p>
                            <p className="text-sm text-muted-foreground">
                              Set up call forwarding from your current business phone to this number:
                            </p>
                            <div className="flex items-center gap-2 p-2 bg-white dark:bg-background rounded border font-mono text-lg">
                              <Phone className="h-4 w-4 text-primary flex-shrink-0" />
                              {formatPhoneNumber(business.twilioPhoneNumber)}
                            </div>
                            <div className="space-y-2 text-sm">
                              <p className="font-medium">How to set up forwarding:</p>
                              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                                <li>
                                  <strong>Most carriers:</strong> Dial <code className="bg-muted px-1 rounded">*72</code> followed by{" "}
                                  <code className="bg-muted px-1 rounded">{formatPhoneNumber(business.twilioPhoneNumber)}</code>
                                </li>
                                <li>
                                  <strong>To disable forwarding:</strong> Dial <code className="bg-muted px-1 rounded">*73</code>
                                </li>
                                <li>
                                  <strong>Alternative:</strong> Contact your phone provider and ask to forward calls to{" "}
                                  {formatPhoneNumber(business.twilioPhoneNumber)}
                                </li>
                              </ul>
                            </div>
                            <p className="text-xs text-muted-foreground italic">
                              Forwarding codes may vary by carrier. Check with your provider if *72/*73 don't work.
                            </p>
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    </div>
                  </div>
                ) : (
                  <>
                  <div className="text-center py-6">
                    <Phone className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                    <h3 className="font-semibold text-lg mb-1">No Phone Number Assigned</h3>
                    <p className="text-sm text-muted-foreground max-w-md mx-auto mb-4">
                      Get a dedicated phone number for your AI receptionist, or forward your existing business number.
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
                      onClick={() => {
                        setPhoneDialogOpen(true);
                        setPhoneDialogTab("new");
                        setAvailableNumbers([]);
                        setSelectedPhoneNumber(null);
                      }}
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

                  {/* Phone Number Provisioning Dialog */}
                  <Dialog open={phoneDialogOpen} onOpenChange={setPhoneDialogOpen}>
                    <DialogContent className="sm:max-w-[550px]">
                      <DialogHeader>
                        <DialogTitle>Set Up Your AI Receptionist Phone</DialogTitle>
                        <DialogDescription>
                          Choose how you'd like to connect your AI receptionist
                        </DialogDescription>
                      </DialogHeader>

                      {/* Tab selector */}
                      <div className="flex gap-2 border-b pb-3">
                        <Button
                          variant={phoneDialogTab === "new" ? "default" : "outline"}
                          size="sm"
                          onClick={() => setPhoneDialogTab("new")}
                        >
                          <Phone className="mr-2 h-4 w-4" />
                          Get a New Number
                        </Button>
                        <Button
                          variant={phoneDialogTab === "existing" ? "default" : "outline"}
                          size="sm"
                          onClick={() => setPhoneDialogTab("existing")}
                        >
                          <ArrowRight className="mr-2 h-4 w-4" />
                          Use My Existing Number
                        </Button>
                      </div>

                      {/* Tab: Get a New Number */}
                      {phoneDialogTab === "new" && (
                        <div className="space-y-4">
                          <p className="text-sm text-muted-foreground">
                            Search for a phone number in your preferred area code, or let us pick one for you.
                          </p>

                          {/* Area code search */}
                          <div className="flex gap-2">
                            <div className="flex-1">
                              <Input
                                placeholder="Area code (e.g. 443)"
                                value={searchAreaCode}
                                onChange={(e) => {
                                  const val = e.target.value.replace(/\D/g, "").substring(0, 3);
                                  setSearchAreaCode(val);
                                }}
                                maxLength={3}
                              />
                            </div>
                            <Button
                              onClick={searchNumbers}
                              disabled={isSearching || searchAreaCode.length !== 3}
                            >
                              {isSearching ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Search className="h-4 w-4" />
                              )}
                              <span className="ml-2">Search</span>
                            </Button>
                          </div>

                          {/* Available numbers list */}
                          {availableNumbers.length > 0 && (
                            <div className="max-h-[250px] overflow-y-auto border rounded-lg">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Phone Number</TableHead>
                                    <TableHead>Location</TableHead>
                                    <TableHead className="w-[80px]"></TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {availableNumbers.map((num: any) => (
                                    <TableRow
                                      key={num.phoneNumber}
                                      className={selectedPhoneNumber === num.phoneNumber ? "bg-primary/10" : ""}
                                    >
                                      <TableCell className="font-mono">
                                        {formatPhoneNumber(num.phoneNumber)}
                                      </TableCell>
                                      <TableCell className="text-sm text-muted-foreground">
                                        <span className="flex items-center gap-1">
                                          <MapPin className="h-3 w-3" />
                                          {num.locality ? `${num.locality}, ${num.region}` : num.region || "US"}
                                        </span>
                                      </TableCell>
                                      <TableCell>
                                        <Button
                                          size="sm"
                                          variant={selectedPhoneNumber === num.phoneNumber ? "default" : "outline"}
                                          onClick={() => setSelectedPhoneNumber(num.phoneNumber)}
                                        >
                                          {selectedPhoneNumber === num.phoneNumber ? "Selected" : "Select"}
                                        </Button>
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          )}

                          <DialogFooter className="flex-col sm:flex-row gap-2">
                            <Button
                              variant="outline"
                              onClick={() => {
                                provisionMutation.mutate({
                                  areaCode: searchAreaCode.length === 3 ? searchAreaCode : undefined,
                                });
                              }}
                              disabled={provisionMutation.isPending}
                            >
                              {provisionMutation.isPending ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : null}
                              Just Assign Me One
                            </Button>
                            {selectedPhoneNumber && (
                              <Button
                                onClick={() => {
                                  provisionMutation.mutate({ phoneNumber: selectedPhoneNumber });
                                }}
                                disabled={provisionMutation.isPending}
                              >
                                {provisionMutation.isPending ? (
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : (
                                  <Phone className="mr-2 h-4 w-4" />
                                )}
                                Use {formatPhoneNumber(selectedPhoneNumber || '')}
                              </Button>
                            )}
                          </DialogFooter>
                        </div>
                      )}

                      {/* Tab: Use My Existing Number */}
                      {phoneDialogTab === "existing" && (
                        <div className="space-y-4">
                          <div className="p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
                            <p className="text-sm font-medium mb-2">How it works:</p>
                            <div className="space-y-3 text-sm text-muted-foreground">
                              <div className="flex items-start gap-3">
                                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">1</span>
                                <p>We'll provision an AI receptionist number for you</p>
                              </div>
                              <div className="flex items-start gap-3">
                                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">2</span>
                                <p>Set up call forwarding from your existing business number to the new AI number</p>
                              </div>
                              <div className="flex items-start gap-3">
                                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">3</span>
                                <p>Calls to your business number will automatically be answered by your AI receptionist</p>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <label className="text-sm font-medium">Preferred area code (optional)</label>
                            <Input
                              placeholder="Area code (e.g. 443)"
                              value={searchAreaCode}
                              onChange={(e) => {
                                const val = e.target.value.replace(/\D/g, "").substring(0, 3);
                                setSearchAreaCode(val);
                              }}
                              maxLength={3}
                            />
                            <p className="text-xs text-muted-foreground">
                              We'll try to get a number in this area code. Leave blank for any available number.
                            </p>
                          </div>

                          <div className="p-3 bg-muted rounded-lg text-sm">
                            <p className="font-medium mb-1">After setup, you'll forward your existing number:</p>
                            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                              <li>
                                <strong>Most carriers:</strong> Dial <code className="bg-background px-1 rounded">*72</code> + your new AI number
                              </li>
                              <li>
                                <strong>To disable:</strong> Dial <code className="bg-background px-1 rounded">*73</code>
                              </li>
                              <li>
                                Or contact your phone provider to set up forwarding
                              </li>
                            </ul>
                          </div>

                          <DialogFooter>
                            <Button
                              onClick={() => {
                                provisionMutation.mutate({
                                  areaCode: searchAreaCode.length === 3 ? searchAreaCode : undefined,
                                });
                              }}
                              disabled={provisionMutation.isPending}
                            >
                              {provisionMutation.isPending ? (
                                <>
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                  Provisioning...
                                </>
                              ) : (
                                <>
                                  <Phone className="mr-2 h-4 w-4" />
                                  Provision AI Number
                                </>
                              )}
                            </Button>
                          </DialogFooter>
                        </div>
                      )}
                    </DialogContent>
                  </Dialog>
                  </>
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
                          
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

          <TabsContent value="notifications" className="space-y-4">
            {businessId && <NotificationSettingsPanel businessId={businessId} />}
          </TabsContent>

          <TabsContent value="reviews" className="space-y-4">
            {businessId && <ReviewSettings businessId={businessId} />}
          </TabsContent>

          {isRestaurant && (
            <TabsContent value="restaurant" className="space-y-4">
              {businessId && <RestaurantSettings businessId={businessId} />}
            </TabsContent>
          )}

          {hasPOS && (
            <TabsContent value="inventory" className="space-y-4">
              {businessId && business && (
                <InventoryDashboard businessId={businessId} business={business} />
              )}
            </TabsContent>
          )}

          <TabsContent value="integrations" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Integrations</CardTitle>
                <CardDescription>
                  Connect external services to enhance your business management
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="payments">
                  <TabsList className="mb-4 flex w-full overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                    <TabsTrigger value="payments" className="whitespace-nowrap flex-shrink-0">Payments</TabsTrigger>
                    <TabsTrigger value="calendar" className="whitespace-nowrap flex-shrink-0">Calendar</TabsTrigger>
                    <TabsTrigger value="quickbooks" className="whitespace-nowrap flex-shrink-0">QuickBooks</TabsTrigger>
                    <TabsTrigger value="webhooks" className="whitespace-nowrap flex-shrink-0">Webhooks</TabsTrigger>
                    <TabsTrigger value="api-keys" className="whitespace-nowrap flex-shrink-0">API Keys</TabsTrigger>
                  </TabsList>

                  <TabsContent value="payments">
                    <div className="mb-6">
                      <h3 className="text-lg font-medium mb-2">Payment Processing</h3>
                      <p className="text-muted-foreground mb-4">
                        Connect Stripe to accept online payments from your customers
                      </p>
                      <StripeConnectIntegration />
                    </div>
                  </TabsContent>

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

                  <TabsContent value="webhooks">
                    <div className="mb-6">
                      <h3 className="text-lg font-medium mb-2">Webhooks</h3>
                      <p className="text-muted-foreground mb-4">
                        Configure webhooks to receive real-time notifications when events occur in your business
                      </p>
                      <WebhookSettings businessId={business?.id} />
                    </div>
                  </TabsContent>

                  <TabsContent value="api-keys">
                    <div className="mb-6">
                      <ApiKeySettings businessId={business?.id} />
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

            {/* Overage Billing History */}
            {business && (
              <Card>
                <CardHeader>
                  <CardTitle>Overage Billing History</CardTitle>
                  <CardDescription>
                    Minutes beyond your plan limit are billed automatically at the end of each billing period.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <OverageBillingHistory businessId={business.id} />
                </CardContent>
              </Card>
            )}
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
