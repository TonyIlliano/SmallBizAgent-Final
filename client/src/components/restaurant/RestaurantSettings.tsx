import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import CloverIntegration from "@/components/clover/CloverIntegration";
import SquareIntegration from "@/components/square/SquareIntegration";
import OrderHistory from "./OrderHistory";
import { PosIntegrationCard } from "./PosIntegrationCard";
import { ReservationPlatformCard } from "./ReservationPlatformCard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { UtensilsCrossed, CreditCard, CalendarCheck, Store, BookOpen, Truck, ShoppingBag, ExternalLink, Copy, Check } from "lucide-react";

interface RestaurantSettingsProps {
  businessId: number;
}

const orderTypeSchema = z.object({
  restaurantPickupEnabled: z.boolean(),
  restaurantDeliveryEnabled: z.boolean(),
});

type OrderTypeFormData = z.infer<typeof orderTypeSchema>;

export default function RestaurantSettings({ businessId }: RestaurantSettingsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: business } = useQuery<any>({
    queryKey: ['/api/business'],
    select: (data: any) => {
      if (Array.isArray(data)) {
        return data.find((b: any) => b.id === businessId);
      }
      return data;
    },
  });

  const form = useForm<OrderTypeFormData>({
    resolver: zodResolver(orderTypeSchema),
    defaultValues: {
      restaurantPickupEnabled: true,
      restaurantDeliveryEnabled: false,
    },
  });

  useEffect(() => {
    if (business) {
      form.reset({
        restaurantPickupEnabled: business.restaurantPickupEnabled ?? true,
        restaurantDeliveryEnabled: business.restaurantDeliveryEnabled ?? false,
      });
    }
  }, [business]);

  const updateOrderTypesMutation = useMutation({
    mutationFn: (data: OrderTypeFormData) => {
      return apiRequest("PUT", `/api/business/${businessId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/business"] });
      toast({
        title: "Order Types Updated",
        description: "Your AI receptionist will now reflect these order type settings.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update order type settings.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: OrderTypeFormData) => {
    // At least one must be enabled
    if (!data.restaurantPickupEnabled && !data.restaurantDeliveryEnabled) {
      toast({
        title: "Invalid Settings",
        description: "At least one order type must be enabled.",
        variant: "destructive",
      });
      return;
    }
    updateOrderTypesMutation.mutate(data);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-orange-100">
              <UtensilsCrossed className="h-5 w-5 text-orange-600" />
            </div>
            <div>
              <CardTitle>Restaurant Settings</CardTitle>
              <CardDescription>
                Connect your POS and reservation systems to power AI phone ordering and table bookings
              </CardDescription>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Order History Section */}
      <OrderHistory businessId={businessId} />

      {/* Order Types Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <ShoppingBag className="h-5 w-5 text-muted-foreground" />
          <div>
            <h3 className="text-lg font-semibold">Order Types</h3>
            <p className="text-sm text-muted-foreground">
              Choose which order types your restaurant supports. The AI receptionist will only offer enabled options.
            </p>
          </div>
        </div>

        <Card>
          <CardContent className="pt-6">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="restaurantPickupEnabled"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-4">
                      <div className="flex items-center gap-3">
                        <ShoppingBag className="h-5 w-5 text-green-600" />
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Pickup</FormLabel>
                          <FormDescription>
                            Customers can place orders for pickup at the restaurant
                          </FormDescription>
                        </div>
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

                <FormField
                  control={form.control}
                  name="restaurantDeliveryEnabled"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-4">
                      <div className="flex items-center gap-3">
                        <Truck className="h-5 w-5 text-blue-600" />
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">Delivery</FormLabel>
                          <FormDescription>
                            Customers can place orders for delivery
                          </FormDescription>
                        </div>
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

                <Button
                  type="submit"
                  disabled={updateOrderTypesMutation.isPending}
                  className="w-full"
                >
                  {updateOrderTypesMutation.isPending ? "Saving..." : "Save Order Types"}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>

      {/* POS Integrations Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-muted-foreground" />
          <div>
            <h3 className="text-lg font-semibold">Point of Sale Systems</h3>
            <p className="text-sm text-muted-foreground">
              Connect your POS to enable AI-powered phone ordering and menu sync
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Clover - Real Integration */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                  <UtensilsCrossed className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <CardTitle className="text-base">Clover POS</CardTitle>
                  <CardDescription className="text-xs">AI-powered phone ordering</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <CloverIntegration businessId={businessId} />
            </CardContent>
          </Card>

          {/* Toast - Coming Soon */}
          <PosIntegrationCard
            name="Toast POS"
            description="Sync your Toast menu and route phone orders to your kitchen"
            icon={<UtensilsCrossed className="w-5 h-5 text-orange-600" />}
            accentColor="orange"
            comingSoon
            features={[
              "Menu sync from Toast",
              "Phone order routing to kitchen",
              "Real-time order status",
              "Menu item availability sync",
            ]}
          />

          {/* Square for Restaurants - Real Integration */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                  <Store className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <CardTitle className="text-base">Square for Restaurants</CardTitle>
                  <CardDescription className="text-xs">AI-powered phone ordering</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <SquareIntegration businessId={businessId} />
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Online Reservations moved to its own tab in Settings */}
    </div>
  );
}

// ==========================================
// Reservation Settings Sub-Component
// ==========================================

export function ReservationSettings({ businessId, business }: { businessId: number; business: any }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);

  const [reservationEnabled, setReservationEnabled] = useState(false);
  const [maxPartySize, setMaxPartySize] = useState("10");
  const [capacityPerSlot, setCapacityPerSlot] = useState("40");
  const [slotDuration, setSlotDuration] = useState("90");
  const [leadTime, setLeadTime] = useState("2");
  const [bookingWindow, setBookingWindow] = useState("30");

  useEffect(() => {
    if (business) {
      setReservationEnabled(business.reservationEnabled ?? false);
      setMaxPartySize(String(business.reservationMaxPartySize ?? 10));
      setCapacityPerSlot(String(business.reservationMaxCapacityPerSlot ?? 40));
      setSlotDuration(String(business.reservationSlotDurationMinutes ?? 90));
      setLeadTime(String(business.reservationLeadTimeHours ?? 2));
      setBookingWindow(String(business.reservationMaxDaysAhead ?? 30));
    }
  }, [business]);

  const saveMutation = useMutation({
    mutationFn: (data: any) => {
      return apiRequest("PATCH", "/api/booking-settings", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/business"] });
      toast({
        title: "Reservation Settings Saved",
        description: "Your online reservation settings have been updated.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to save reservation settings.",
        variant: "destructive",
      });
    },
  });

  const handleSave = () => {
    saveMutation.mutate({
      reservationEnabled,
      reservationMaxPartySize: parseInt(maxPartySize),
      reservationMaxCapacityPerSlot: parseInt(capacityPerSlot),
      reservationSlotDurationMinutes: parseInt(slotDuration),
      reservationLeadTimeHours: parseInt(leadTime),
      reservationMaxDaysAhead: parseInt(bookingWindow),
    });
  };

  const bookingUrl = business?.bookingSlug
    ? `${window.location.origin}/book/${business.bookingSlug}`
    : null;

  const copyUrl = () => {
    if (bookingUrl) {
      navigator.clipboard.writeText(bookingUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({ title: "Copied!", description: "Booking URL copied to clipboard." });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <CalendarCheck className="h-5 w-5 text-muted-foreground" />
        <div>
          <h3 className="text-lg font-semibold">Online Reservations</h3>
          <p className="text-sm text-muted-foreground">
            Let customers book tables online or through the AI phone receptionist
          </p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-6">
          {/* Enable/Disable Toggle */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="flex items-center gap-3">
              <CalendarCheck className="h-5 w-5 text-green-600" />
              <div className="space-y-0.5">
                <p className="text-base font-medium">Enable Online Reservations</p>
                <p className="text-sm text-muted-foreground">
                  Accept table reservations on your booking page and through the AI receptionist
                </p>
              </div>
            </div>
            <Switch
              checked={reservationEnabled}
              onCheckedChange={setReservationEnabled}
            />
          </div>

          {reservationEnabled && (
            <>
              {/* Booking URL */}
              {bookingUrl && (
                <div className="rounded-lg border p-4 bg-green-50/50">
                  <p className="text-sm font-medium mb-2">Your Reservation Page</p>
                  <div className="flex items-center gap-2">
                    <code className="text-sm bg-white px-3 py-1.5 rounded border flex-1 truncate">
                      {bookingUrl}
                    </code>
                    <Button variant="outline" size="sm" onClick={copyUrl}>
                      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    </Button>
                    <Button variant="outline" size="sm" asChild>
                      <a href={bookingUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Embed on your website by adding <code className="bg-white px-1 rounded">?embed=true</code> to the URL
                  </p>
                </div>
              )}

              {/* Configuration Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Max Party Size */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Max Party Size</label>
                  <Select value={maxPartySize} onValueChange={setMaxPartySize}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[2, 4, 6, 8, 10, 12, 15, 20].map(n => (
                        <SelectItem key={n} value={String(n)}>{n} guests</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Larger parties will be asked to call</p>
                </div>

                {/* Capacity Per Time Slot */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Capacity Per Time Slot</label>
                  <Input
                    type="number"
                    min="1"
                    max="500"
                    value={capacityPerSlot}
                    onChange={(e) => setCapacityPerSlot(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">Total seats available per time slot</p>
                </div>

                {/* Reservation Duration */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Reservation Duration</label>
                  <Select value={slotDuration} onValueChange={setSlotDuration}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="30">30 minutes</SelectItem>
                      <SelectItem value="60">1 hour</SelectItem>
                      <SelectItem value="90">1.5 hours</SelectItem>
                      <SelectItem value="120">2 hours</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">How long each reservation occupies a table</p>
                </div>

                {/* Minimum Notice */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Minimum Notice</label>
                  <Select value={leadTime} onValueChange={setLeadTime}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">No minimum</SelectItem>
                      <SelectItem value="1">1 hour</SelectItem>
                      <SelectItem value="2">2 hours</SelectItem>
                      <SelectItem value="4">4 hours</SelectItem>
                      <SelectItem value="12">12 hours</SelectItem>
                      <SelectItem value="24">24 hours</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">How far in advance customers must book</p>
                </div>

                {/* Booking Window */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Booking Window</label>
                  <Select value={bookingWindow} onValueChange={setBookingWindow}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="7">7 days ahead</SelectItem>
                      <SelectItem value="14">14 days ahead</SelectItem>
                      <SelectItem value="30">30 days ahead</SelectItem>
                      <SelectItem value="60">60 days ahead</SelectItem>
                      <SelectItem value="90">90 days ahead</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">How far into the future customers can reserve</p>
                </div>
              </div>
            </>
          )}

          {/* Save Button */}
          <Button
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="w-full"
          >
            {saveMutation.isPending ? "Saving..." : "Save Reservation Settings"}
          </Button>
        </CardContent>
      </Card>

      {/* External Platform Integrations (Coming Soon) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ReservationPlatformCard
          name="OpenTable"
          description="Sync reservations and manage table availability through your AI receptionist"
          icon={<CalendarCheck className="w-5 h-5 text-red-600" />}
          accentColor="red"
          comingSoon
          features={[
            "Real-time reservation sync",
            "Table availability for phone bookings",
            "Guest notes and preferences",
            "Waitlist management",
          ]}
        />
        <ReservationPlatformCard
          name="Resy"
          description="Integrate with Resy for seamless reservation management"
          icon={<BookOpen className="w-5 h-5 text-purple-600" />}
          accentColor="purple"
          comingSoon
          features={[
            "Reservation sync and notifications",
            "Available slot queries for AI receptionist",
            "VIP guest recognition",
            "Walk-in waitlist integration",
          ]}
        />
      </div>
    </div>
  );
}
