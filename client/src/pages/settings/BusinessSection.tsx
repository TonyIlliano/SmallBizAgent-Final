import { useState, useEffect, lazy, Suspense } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import BookingSettings from "@/components/settings/BookingSettings";
import { StaffScheduleManager } from "@/components/settings/StaffScheduleManager";
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
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Loader2, Upload, X, ImageIcon } from "lucide-react";
import {
  INDUSTRY_OPTIONS,
  TIMEZONE_OPTIONS,
  businessProfileSchema,
  businessHoursSchema,
  serviceSchema,
  type ServiceFormData,
} from "./constants";

// Lazy-loaded extracted components (self-contained with own data fetching)
const BookingPageBranding = lazy(() => import("@/components/settings/BookingPageBranding"));
const TeamManagementCard = lazy(() => import("@/components/settings/TeamManagementCard"));
// NOTE: PhoneProvisioningCard now lives on the Receptionist page (/receptionist) — that's
// the natural home for AI receptionist phone setup. It used to render here, but provisioning
// from two places caused confusion and bugs.

function LazyFallback() {
  return (
    <div className="flex justify-center py-8">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

// --- Main BusinessSection Component ---
export default function BusinessSection({ activeTab }: { activeTab: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const businessId = user?.businessId;

  const [serviceDialogOpen, setServiceDialogOpen] = useState(false);
  const [editingService, setEditingService] = useState<any>(null);

  // Fetch business profile
  const { data: business, isLoading: isLoadingBusiness } = useQuery<any>({
    queryKey: ["/api/business"],
    enabled: !!businessId,
  });

  const isRestaurant = (business?.industry?.toLowerCase() || "") === "restaurant";

  // Fetch business hours
  const { data: businessHours = [], isLoading: isLoadingHours } = useQuery<any[]>({
    queryKey: [`/api/business/${businessId}/hours`],
    enabled: !!businessId,
  });

  // Fetch services
  const { data: services = [], isLoading: isLoadingServices } = useQuery<any[]>({
    queryKey: ["/api/services", { businessId }],
    enabled: !!businessId,
  });

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
      ownerPhone: "",
      email: "",
      website: "",
      logoUrl: "",
    },
  });

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
        ownerPhone: (business as any).ownerPhone || "",
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
    daysOfWeek.forEach((day) => {
      const dayData = businessHours.find((h: any) => h.day === day);
      if (dayData) {
        formattedHours[day] = { isClosed: dayData.isClosed, open: dayData.open, close: dayData.close };
      } else {
        formattedHours[day] = { isClosed: day === "sunday", open: "09:00", close: "17:00" };
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

  useEffect(() => {
    if (businessHours && businessHours.length > 0) {
      const formatted = formatBusinessHours();
      if (formatted) hoursForm.reset(formatted);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessHours]);

  // Service Form
  const serviceForm = useForm<ServiceFormData>({
    resolver: zodResolver(serviceSchema),
    defaultValues: { name: "", description: "", price: 0, duration: 60, active: true },
  });

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
      serviceForm.reset({ name: "", description: "", price: 0, duration: 60, active: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingService]);

  // Mutations
  const updateProfileMutation = useMutation({
    mutationFn: (data: z.infer<typeof businessProfileSchema>) =>
      apiRequest("PUT", `/api/business/${businessId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/business"] });
      toast({ title: "Success", description: "Business profile updated successfully" });
    },
    onError: (error: any) => {
      console.error("Business profile update error:", error);
      toast({ title: "Error", description: error?.message || "Failed to update business profile", variant: "destructive" });
    },
  });

  const updateHoursMutation = useMutation({
    mutationFn: (data: any) => {
      const updates = Object.entries(data).map(([day, hours]: [string, any]) => {
        const hourData = businessHours?.find((h: any) => h.day === day);
        if (hourData) {
          return apiRequest("PUT", `/api/business-hours/${hourData.id}`, {
            businessId, day,
            open: hours.isClosed ? null : hours.open,
            close: hours.isClosed ? null : hours.close,
            isClosed: hours.isClosed,
          });
        } else {
          return apiRequest("POST", `/api/business-hours`, {
            businessId, day,
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
      toast({ title: "Success", description: "Business hours updated successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update business hours", variant: "destructive" });
    },
  });

  const saveServiceMutation = useMutation({
    mutationFn: (data: ServiceFormData) => {
      if (editingService) {
        return apiRequest("PUT", `/api/services/${editingService.id}`, { ...data, businessId });
      } else {
        return apiRequest("POST", "/api/services", { ...data, businessId });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/services"] });
      toast({ title: "Success", description: editingService ? "Service updated successfully" : "Service created successfully" });
      setServiceDialogOpen(false);
      setEditingService(null);
      serviceForm.reset();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error?.message || "Failed to save service", variant: "destructive" });
    },
  });

  const deleteServiceMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/services/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/services"] });
      toast({ title: "Success", description: "Service deleted successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete service", variant: "destructive" });
    },
  });

  // Submit handlers
  const onSubmitProfile = (data: z.infer<typeof businessProfileSchema>) => updateProfileMutation.mutate(data);
  const onSubmitHours = (data: z.infer<typeof businessHoursSchema>) => updateHoursMutation.mutate(data);
  const onSubmitService = (data: ServiceFormData) => saveServiceMutation.mutate(data);

  const openAddServiceDialog = () => { setEditingService(null); setServiceDialogOpen(true); };
  const openEditServiceDialog = (service: any) => { setEditingService(service); setServiceDialogOpen(true); };

  // --- Team tab ---
  if (activeTab === "team") {
    return (
      <div className="space-y-4">
        {businessId && (user?.effectiveRole === "owner" || user?.role === "admin") && (
          <Suspense fallback={<LazyFallback />}>
            <TeamManagementCard />
          </Suspense>
        )}
        {businessId && <StaffScheduleManager businessId={businessId} />}
      </div>
    );
  }

  // --- Hours tab ---
  if (activeTab === "hours") {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Business Hours</CardTitle>
            <CardDescription>Set your regular business hours to help schedule appointments properly</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingHours ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin w-8 h-8 border-4 border-primary rounded-full border-t-transparent" />
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
                                <Switch id={`${day}-closed`} checked={field.value} onCheckedChange={field.onChange} />
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
                                <Input type="time" {...field} value={field.value || ""} disabled={hoursForm.watch(`${day}.isClosed` as any)} />
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
                                <Input type="time" {...field} value={field.value || ""} disabled={hoursForm.watch(`${day}.isClosed` as any)} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>
                  ))}
                  <Button type="submit" className="mt-4" disabled={updateHoursMutation.isPending}>
                    {updateHoursMutation.isPending ? "Saving..." : "Save Business Hours"}
                  </Button>
                </form>
              </Form>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // --- Services tab ---
  if (activeTab === "services" && !isRestaurant) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Services</CardTitle>
            <CardDescription>Manage the services your business offers to customers</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingServices ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin w-8 h-8 border-4 border-primary rounded-full border-t-transparent" />
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
                          <TableCell className="text-right">${Number(service.price ?? 0).toFixed(2)}</TableCell>
                          <TableCell>{service.duration ?? 0} min</TableCell>
                          <TableCell>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${service.active ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                              {service.active ? "Active" : "Inactive"}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm" onClick={() => openEditServiceDialog(service)}>Edit</Button>
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
                        <TableCell colSpan={6} className="text-center py-8">No services found. Add your first service.</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
                <Button className="mt-6" onClick={openAddServiceDialog}>Add New Service</Button>
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
                <FormField control={serviceForm.control} name="name" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Service Name</FormLabel>
                    <FormControl><Input placeholder="e.g., Basic Cleaning" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={serviceForm.control} name="description" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl><Textarea placeholder="Describe what this service includes..." {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField control={serviceForm.control} name="price" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Price ($)</FormLabel>
                      <FormControl><Input type="number" step="0.01" min="0" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={serviceForm.control} name="duration" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Duration (min)</FormLabel>
                      <FormControl><Input type="number" min="15" step="15" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
                <FormField control={serviceForm.control} name="active" render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <FormLabel>Active</FormLabel>
                      <FormDescription>Make this service available for booking</FormDescription>
                    </div>
                    <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                  </FormItem>
                )} />
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setServiceDialogOpen(false)}>Cancel</Button>
                  <Button type="submit" disabled={saveServiceMutation.isPending}>
                    {saveServiceMutation.isPending ? "Saving..." : editingService ? "Update" : "Create"}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // --- Booking tab ---
  if (activeTab === "booking" && !isRestaurant) {
    return (
      <div className="space-y-4">
        {business && <BookingSettings business={business} />}
        <Suspense fallback={<LazyFallback />}>
          <BookingPageBranding />
        </Suspense>
      </div>
    );
  }

  // --- Default: Profile tab ---
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Business Profile</CardTitle>
          <CardDescription>Update your business information that will appear on invoices and communications</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingBusiness ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin w-8 h-8 border-4 border-primary rounded-full border-t-transparent" />
            </div>
          ) : (
            <Form {...businessForm}>
              <form onSubmit={businessForm.handleSubmit(onSubmitProfile)} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField control={businessForm.control} name="name" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Business Name</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={businessForm.control} name="industry" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Industry Type</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="Select your industry" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {INDUSTRY_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>This helps customize the AI receptionist for your business type</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={businessForm.control} name="timezone" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Business Timezone</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="Select your timezone" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {TIMEZONE_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>All appointment times, booking page, and AI receptionist will use this timezone</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                {/* Business Logo */}
                <FormField control={businessForm.control} name="logoUrl" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Business Logo</FormLabel>
                    <FormDescription>Your logo will appear on quotes and invoices</FormDescription>
                    <FormControl>
                      <div className="flex items-center gap-4">
                        {field.value ? (
                          <div className="relative">
                            <img src={field.value} alt="Business logo" className="h-20 w-20 rounded-lg object-contain border bg-white" />
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
                                  toast({ title: "File too large", description: "Logo must be under 500KB", variant: "destructive" });
                                  return;
                                }
                                const reader = new FileReader();
                                reader.onload = () => {
                                  const img = new Image();
                                  img.onload = () => {
                                    const canvas = document.createElement("canvas");
                                    const maxSize = 200;
                                    let w = img.width;
                                    let h = img.height;
                                    if (w > maxSize || h > maxSize) {
                                      if (w > h) { h = (h / w) * maxSize; w = maxSize; }
                                      else { w = (w / h) * maxSize; h = maxSize; }
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
                )} />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField control={businessForm.control} name="phone" render={({ field }) => (
                    <FormItem><FormLabel>Business Phone</FormLabel><FormControl><Input {...field} /></FormControl><FormDescription>Shown to customers</FormDescription><FormMessage /></FormItem>
                  )} />
                  <FormField control={businessForm.control} name="ownerPhone" render={({ field }) => (
                    <FormItem><FormLabel>Owner Cell Phone</FormLabel><FormControl><Input placeholder="(555) 987-6543" {...field} /></FormControl><FormDescription>For payment alerts and account notifications</FormDescription><FormMessage /></FormItem>
                  )} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField control={businessForm.control} name="email" render={({ field }) => (
                    <FormItem><FormLabel>Email Address</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>

                <FormField control={businessForm.control} name="website" render={({ field }) => (
                  <FormItem><FormLabel>Website</FormLabel><FormControl><Input {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
                )} />

                <FormField control={businessForm.control} name="address" render={({ field }) => (
                  <FormItem><FormLabel>Street Address</FormLabel><FormControl><Input {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
                )} />

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <FormField control={businessForm.control} name="city" render={({ field }) => (
                    <FormItem><FormLabel>City</FormLabel><FormControl><Input {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={businessForm.control} name="state" render={({ field }) => (
                    <FormItem><FormLabel>State</FormLabel><FormControl><Input {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={businessForm.control} name="zip" render={({ field }) => (
                    <FormItem><FormLabel>ZIP Code</FormLabel><FormControl><Input {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>

                <Button type="submit" className="mt-4" disabled={updateProfileMutation.isPending}>
                  {updateProfileMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </form>
            </Form>
          )}
        </CardContent>
      </Card>

    </div>
  );
}
