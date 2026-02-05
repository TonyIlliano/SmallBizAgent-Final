import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Calendar,
  Link2,
  ExternalLink,
  Copy,
  Check,
  AlertCircle,
  Loader2,
} from "lucide-react";

// Booking Settings Schema
const bookingSettingsSchema = z.object({
  bookingSlug: z
    .string()
    .min(3, "Slug must be at least 3 characters")
    .max(50, "Slug must be less than 50 characters")
    .regex(
      /^[a-z0-9-]+$/,
      "Slug can only contain lowercase letters, numbers, and hyphens"
    )
    .optional()
    .or(z.literal("")),
  bookingEnabled: z.boolean(),
  bookingLeadTimeHours: z.coerce.number().min(0).max(168),
  bookingBufferMinutes: z.coerce.number().min(0).max(60),
  bookingSlotIntervalMinutes: z.coerce.number().min(5).max(120),
});

type BookingSettingsFormData = z.infer<typeof bookingSettingsSchema>;

interface BookingSettingsProps {
  business: any;
}

export default function BookingSettings({ business }: BookingSettingsProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const [isCheckingSlug, setIsCheckingSlug] = useState(false);
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);

  const form = useForm<BookingSettingsFormData>({
    resolver: zodResolver(bookingSettingsSchema),
    defaultValues: {
      bookingSlug: business?.bookingSlug || "",
      bookingEnabled: business?.bookingEnabled || false,
      bookingLeadTimeHours: business?.bookingLeadTimeHours || 24,
      bookingBufferMinutes: business?.bookingBufferMinutes || 15,
      bookingSlotIntervalMinutes: business?.bookingSlotIntervalMinutes || 30,
    },
  });

  // Update form when business data changes
  useEffect(() => {
    if (business) {
      form.reset({
        bookingSlug: business.bookingSlug || "",
        bookingEnabled: business.bookingEnabled || false,
        bookingLeadTimeHours: business.bookingLeadTimeHours || 24,
        bookingBufferMinutes: business.bookingBufferMinutes || 15,
        bookingSlotIntervalMinutes: business.bookingSlotIntervalMinutes || 30,
      });
    }
  }, [business]);

  // Check slug availability
  const checkSlugAvailability = async (slug: string) => {
    if (!slug || slug.length < 3) {
      setSlugAvailable(null);
      return;
    }

    try {
      setIsCheckingSlug(true);
      const res = await fetch(`/api/booking-slug/check?slug=${encodeURIComponent(slug)}`);
      const data = await res.json();
      setSlugAvailable(data.available);
    } catch (error) {
      console.error("Error checking slug:", error);
      setSlugAvailable(null);
    } finally {
      setIsCheckingSlug(false);
    }
  };

  // Debounced slug check
  useEffect(() => {
    const slug = form.watch("bookingSlug");
    const timer = setTimeout(() => {
      if (slug && slug !== business?.bookingSlug) {
        checkSlugAvailability(slug);
      } else if (slug === business?.bookingSlug) {
        setSlugAvailable(true); // Current slug is always available for this business
      } else {
        setSlugAvailable(null);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [form.watch("bookingSlug")]);

  // Update booking settings mutation
  const updateSettingsMutation = useMutation({
    mutationFn: async (data: BookingSettingsFormData) => {
      const res = await fetch("/api/booking-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      const responseData = await res.json();
      if (!res.ok) {
        throw new Error(responseData.error || "Failed to update booking settings");
      }
      return responseData;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/business"] });
      toast({
        title: "Settings Saved",
        description: "Your online booking settings have been updated.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to update booking settings",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: BookingSettingsFormData) => {
    updateSettingsMutation.mutate(data);
  };

  const bookingUrl = business?.bookingSlug
    ? `${window.location.origin}/book/${business.bookingSlug}`
    : null;

  const copyToClipboard = () => {
    if (bookingUrl) {
      navigator.clipboard.writeText(bookingUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({
        title: "Copied!",
        description: "Booking link copied to clipboard",
      });
    }
  };

  // Generate slug suggestion from business name
  const generateSlugFromName = () => {
    if (business?.name) {
      const slug = business.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      form.setValue("bookingSlug", slug);
    }
  };

  return (
    <div className="space-y-6">
      {/* Booking Link Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Link2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle>Online Booking Link</CardTitle>
              <CardDescription>
                Share this link with customers to allow them to book appointments online
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {business?.bookingSlug && business?.bookingEnabled ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge className="bg-green-500 hover:bg-green-600">Active</Badge>
                <span className="text-sm text-muted-foreground">
                  Customers can book appointments online
                </span>
              </div>
              <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
                <code className="flex-1 text-sm break-all">{bookingUrl}</code>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={copyToClipboard}
                  className="shrink-0"
                >
                  {copied ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(bookingUrl!, "_blank")}
                  className="shrink-0"
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                Add this link to your website, social media, or email signature to let
                customers schedule appointments directly.
              </p>
            </div>
          ) : (
            <div className="text-center py-6">
              <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <h3 className="font-semibold text-lg mb-1">Online Booking Not Set Up</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                {!business?.bookingSlug
                  ? "Create a booking URL slug below to enable online booking."
                  : "Enable online booking below to start accepting appointments from customers."}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Booking Settings Form */}
      <Card>
        <CardHeader>
          <CardTitle>Booking Settings</CardTitle>
          <CardDescription>
            Configure how customers can book appointments online
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {/* Booking Slug */}
              <FormField
                control={form.control}
                name="bookingSlug"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Booking URL</FormLabel>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground whitespace-nowrap">
                        {window.location.origin}/book/
                      </span>
                      <FormControl>
                        <div className="relative flex-1">
                          <Input
                            {...field}
                            placeholder="your-business-name"
                            className="pr-10"
                          />
                          {isCheckingSlug && (
                            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                          )}
                          {!isCheckingSlug && slugAvailable === true && field.value && (
                            <Check className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-500" />
                          )}
                          {!isCheckingSlug && slugAvailable === false && (
                            <AlertCircle className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-destructive" />
                          )}
                        </div>
                      </FormControl>
                    </div>
                    <FormDescription className="flex items-center justify-between">
                      <span>
                        Choose a unique URL for your booking page (lowercase letters,
                        numbers, and hyphens only)
                      </span>
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        onClick={generateSlugFromName}
                        className="p-0 h-auto"
                      >
                        Generate from business name
                      </Button>
                    </FormDescription>
                    {slugAvailable === false && (
                      <p className="text-sm text-destructive">
                        This URL is already taken. Please choose a different one.
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Enable Booking */}
              <FormField
                control={form.control}
                name="bookingEnabled"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Enable Online Booking</FormLabel>
                      <FormDescription>
                        Allow customers to book appointments through your booking page
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        disabled={!form.watch("bookingSlug")}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              {/* Lead Time */}
              <FormField
                control={form.control}
                name="bookingLeadTimeHours"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Minimum Booking Notice</FormLabel>
                    <Select
                      value={field.value?.toString()}
                      onValueChange={(v) => field.onChange(parseInt(v))}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="1">1 hour</SelectItem>
                        <SelectItem value="2">2 hours</SelectItem>
                        <SelectItem value="4">4 hours</SelectItem>
                        <SelectItem value="12">12 hours</SelectItem>
                        <SelectItem value="24">24 hours (1 day)</SelectItem>
                        <SelectItem value="48">48 hours (2 days)</SelectItem>
                        <SelectItem value="72">72 hours (3 days)</SelectItem>
                        <SelectItem value="168">168 hours (1 week)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      How much advance notice is required for online bookings
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Buffer Time */}
              <FormField
                control={form.control}
                name="bookingBufferMinutes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Buffer Time Between Appointments</FormLabel>
                    <Select
                      value={field.value?.toString()}
                      onValueChange={(v) => field.onChange(parseInt(v))}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="0">No buffer</SelectItem>
                        <SelectItem value="5">5 minutes</SelectItem>
                        <SelectItem value="10">10 minutes</SelectItem>
                        <SelectItem value="15">15 minutes</SelectItem>
                        <SelectItem value="30">30 minutes</SelectItem>
                        <SelectItem value="60">60 minutes</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Extra time between appointments for preparation or travel
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Slot Interval */}
              <FormField
                control={form.control}
                name="bookingSlotIntervalMinutes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Appointment Slot Interval</FormLabel>
                    <Select
                      value={field.value?.toString()}
                      onValueChange={(v) => field.onChange(parseInt(v))}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="15">15 minutes</SelectItem>
                        <SelectItem value="30">30 minutes</SelectItem>
                        <SelectItem value="45">45 minutes</SelectItem>
                        <SelectItem value="60">60 minutes (1 hour)</SelectItem>
                        <SelectItem value="90">90 minutes</SelectItem>
                        <SelectItem value="120">120 minutes (2 hours)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      How often appointment slots are offered (e.g., every 30 minutes shows 9:00, 9:30, 10:00...)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button
                type="submit"
                disabled={updateSettingsMutation.isPending || slugAvailable === false}
              >
                {updateSettingsMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  "Save Booking Settings"
                )}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
