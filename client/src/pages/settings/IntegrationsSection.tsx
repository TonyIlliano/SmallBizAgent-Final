import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { CalendarIntegration } from "@/components/calendar/CalendarIntegration";
import QuickBooksIntegration from "@/components/quickbooks/QuickBooksIntegration";
import { StripeConnectIntegration } from "@/components/stripe/StripeConnectIntegration";
import RestaurantSettings from "@/components/restaurant/RestaurantSettings";
import { ReservationSettings } from "@/components/restaurant/RestaurantSettings";
import InventoryDashboard from "@/components/restaurant/InventoryDashboard";
import { WebhookSettings } from "@/components/settings/WebhookSettings";
import { ApiKeySettings } from "@/components/settings/ApiKeySettings";
import { GoogleBusinessProfile } from "@/components/settings/GoogleBusinessProfile";
import IntegrationHealth from "@/components/settings/IntegrationHealth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

export default function IntegrationsSection({ activeTab }: { activeTab: string }) {
  const { user } = useAuth();
  const businessId = user?.businessId;

  const { data: business } = useQuery<any>({
    queryKey: ['/api/business'],
    enabled: !!businessId,
  });

  const isRestaurant = (business?.industry?.toLowerCase() || '') === 'restaurant';
  const hasPOS = isRestaurant && (
    (business?.cloverMerchantId && business?.cloverAccessToken) ||
    (business?.squareAccessToken && business?.squareLocationId)
  );

  if (activeTab === "restaurant" && isRestaurant) {
    return (
      <div className="space-y-4">
        {businessId && <RestaurantSettings businessId={businessId} />}
      </div>
    );
  }

  if (activeTab === "reservations" && isRestaurant) {
    return (
      <div className="space-y-4">
        {businessId && business && (
          <ReservationSettings businessId={businessId} business={business} />
        )}
      </div>
    );
  }

  if (activeTab === "inventory" && hasPOS) {
    return (
      <div className="space-y-4">
        {businessId && business && (
          <InventoryDashboard businessId={businessId} business={business} />
        )}
      </div>
    );
  }

  if (activeTab === "integrations-health") {
    return (
      <div className="space-y-4">
        <IntegrationHealth />
      </div>
    );
  }

  // Default: integrations tab (Calendar & Payments)
  return (
    <div className="space-y-4">
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
              <TabsTrigger value="google-business" className="whitespace-nowrap flex-shrink-0">Google Business</TabsTrigger>
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

            <TabsContent value="google-business">
              <div className="mb-6">
                <h3 className="text-lg font-medium mb-2">Google Business Profile</h3>
                <p className="text-muted-foreground mb-4">
                  Add a booking link to your Google Search and Maps listing so customers can book directly from Google
                </p>
                {businessId && (
                  <GoogleBusinessProfile
                    businessId={businessId}
                    bookingEnabled={business?.bookingEnabled}
                    bookingSlug={business?.bookingSlug}
                    twilioPhoneNumber={business?.twilioPhoneNumber}
                  />
                )}
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
    </div>
  );
}
