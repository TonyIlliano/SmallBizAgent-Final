import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { SubscriptionPlans } from "@/components/subscription/SubscriptionPlans";
import { OverageBillingHistory } from "@/components/subscription/OverageBillingHistory";
import LocationsManager from "@/components/settings/LocationsManager";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PhoneCall, AlertTriangle, ArrowRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// --- Usage Dashboard for Billing section ---
function UsageDashboard({ businessId }: { businessId: number }) {
  const { data: usageData, isLoading: isLoadingUsage } = useQuery<{
    minutesUsed: number;
    minutesIncluded: number;
    minutesRemaining: number;
    overageMinutes: number;
    overageRate: number;
    overageCost: number;
    percentUsed: number;
    planName: string;
    planTier: string | null;
    isTrialActive: boolean;
    trialEndsAt: string | null;
    subscriptionStatus: string;
    canAcceptCalls: boolean;
  }>({
    queryKey: [`/api/subscription/usage/${businessId}`],
    enabled: !!businessId,
    staleTime: 60000,
    queryFn: async () => {
      const res = await fetch(`/api/subscription/usage/${businessId}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch usage");
      return res.json();
    },
  });

  const { data: projectionData, isLoading: isLoadingProjection } = useQuery<{
    projectedMinutesAtPeriodEnd: number;
    projectedOverageMinutes: number;
    projectedOverageCost: number;
    daysRemainingInPeriod: number;
    averageDailyMinutes: number;
    billingPeriodStart: string;
    billingPeriodEnd: string;
  }>({
    queryKey: ["/api/usage/projection"],
    enabled: !!businessId,
    staleTime: 60000,
  });

  if (isLoadingUsage || isLoadingProjection) {
    return (
      <Card>
        <CardContent className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!usageData) return null;

  const percent = usageData.percentUsed;
  const progressColor =
    percent > 80 ? "bg-red-500" : percent > 50 ? "bg-yellow-500" : "bg-green-500";

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  };

  const billingPeriodLabel = projectionData
    ? `${formatDate(projectionData.billingPeriodStart)} - ${formatDate(projectionData.billingPeriodEnd)}`
    : null;

  const getUpgradeTier = (currentTier: string | null) => {
    if (!currentTier || currentTier === "trial" || currentTier === "starter") return "Growth";
    if (currentTier === "growth" || currentTier === "professional") return "Pro";
    return null;
  };

  const upgradeTier = getUpgradeTier(usageData.planTier);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            <PhoneCall className="h-5 w-5" />
            Call Minutes
          </CardTitle>
          {billingPeriodLabel && (
            <CardDescription>Billing period: {billingPeriodLabel}</CardDescription>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-baseline gap-1">
            <span className="text-3xl font-bold">{usageData.minutesUsed}</span>
            <span className="text-lg text-muted-foreground">
              of {usageData.minutesIncluded} minutes used
            </span>
          </div>

          <div className="relative h-4 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className={`h-full transition-all rounded-full ${progressColor}`}
              style={{ width: `${Math.min(percent, 100)}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{usageData.minutesRemaining} minutes remaining</span>
            {projectionData && (
              <span>~{projectionData.averageDailyMinutes} min/day</span>
            )}
          </div>

          {projectionData && projectionData.daysRemainingInPeriod > 0 && (
            <p className="text-xs text-muted-foreground">
              {projectionData.daysRemainingInPeriod} day{projectionData.daysRemainingInPeriod !== 1 ? "s" : ""} remaining in billing period
            </p>
          )}

          {usageData.overageMinutes > 0 && (
            <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-900 px-3 py-2 text-sm">
              <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0" />
              <span>
                Current overage: {usageData.overageMinutes} minutes (${usageData.overageCost.toFixed(2)} at ${usageData.overageRate.toFixed(2)}/min)
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {projectionData && projectionData.projectedOverageMinutes > 0 && usageData.overageMinutes === 0 && (
        <Card className="border-yellow-200 dark:border-yellow-900">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-medium text-sm">
                  Projected overage: {projectionData.projectedOverageMinutes} minutes (~${projectionData.projectedOverageCost.toFixed(2)})
                </p>
                <p className="text-sm text-muted-foreground">
                  At current pace, you'll use ~{projectionData.projectedMinutesAtPeriodEnd} minutes by end of billing period.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {percent > 80 && upgradeTier && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="font-medium text-sm">Running low on minutes</p>
                <p className="text-sm text-muted-foreground">
                  Upgrade to {upgradeTier} for more included minutes and lower overage rates.
                </p>
              </div>
              <Button variant="default" size="sm" className="flex-shrink-0 ml-4">
                <ArrowRight className="h-4 w-4 mr-1" />
                Upgrade
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function BillingSection({ activeTab }: { activeTab: string }) {
  const { user } = useAuth();
  const businessId = user?.businessId;

  const { data: business, isLoading: isLoadingBusiness } = useQuery<any>({
    queryKey: ['/api/business'],
    enabled: !!businessId,
  });

  if (activeTab === "locations") {
    return (
      <div className="space-y-4">
        {business && <LocationsManager business={business} />}
      </div>
    );
  }

  // Default: subscription tab
  return (
    <div className="space-y-4">
      {business && <UsageDashboard businessId={business.id} />}

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
    </div>
  );
}
