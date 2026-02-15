import CloverIntegration from "@/components/clover/CloverIntegration";
import SquareIntegration from "@/components/square/SquareIntegration";
import { PosIntegrationCard } from "./PosIntegrationCard";
import { ReservationPlatformCard } from "./ReservationPlatformCard";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { UtensilsCrossed, CreditCard, CalendarCheck, Store, BookOpen } from "lucide-react";

interface RestaurantSettingsProps {
  businessId: number;
}

export default function RestaurantSettings({ businessId }: RestaurantSettingsProps) {
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

      {/* Reservation Platforms Section */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <CalendarCheck className="h-5 w-5 text-muted-foreground" />
          <div>
            <h3 className="text-lg font-semibold">Reservation Platforms</h3>
            <p className="text-sm text-muted-foreground">
              Connect your reservation platform so the AI receptionist can check availability and book tables
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* OpenTable - Coming Soon */}
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

          {/* Resy - Coming Soon */}
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
    </div>
  );
}
