/**
 * Memberships Dashboard Card (Step 4 of HVAC roadmap)
 *
 * Shows the membership KPI snapshot: active count, MRR, past-due count.
 * Self-hides when the business has zero plans configured AND zero active
 * members (so HVAC contractors who haven't enrolled yet don't see an empty
 * card cluttering the dashboard).
 *
 * Industry-config gating happens at the parent (Dashboard page). The card
 * just queries /api/memberships/stats and renders.
 */

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Crown, TrendingUp, AlertCircle, ArrowRight } from "lucide-react";
import { Link } from "wouter";

interface MembershipStats {
  activeCount: number;
  pastDueCount: number;
  mrrCents: number;
}

export function MembershipsCard() {
  const { data, isLoading } = useQuery<MembershipStats>({
    queryKey: ["/api/memberships/stats"],
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-muted rounded w-1/3"></div>
            <div className="h-8 bg-muted rounded w-1/2"></div>
            <div className="h-4 bg-muted rounded w-2/3"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data || (data.activeCount === 0 && data.pastDueCount === 0)) {
    // No members yet — show a setup nudge instead of an empty stat
    return (
      <Card data-testid="memberships-card-empty">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Crown className="h-5 w-5 text-amber-500" />
            Membership Plans
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Build recurring revenue. Customers on a maintenance plan generate
            predictable MRR, get auto-applied discounts, and stay loyal.
          </p>
          <Link
            href="/settings?tab=memberships"
            className="text-sm font-medium text-primary flex items-center gap-1 hover:underline"
          >
            Set up plans <ArrowRight className="h-3 w-3" />
          </Link>
        </CardContent>
      </Card>
    );
  }

  const mrrDollars = (data.mrrCents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });

  return (
    <Card data-testid="memberships-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-medium flex items-center gap-2">
          <Crown className="h-5 w-5 text-amber-500" />
          Membership Plans
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-muted-foreground">Active members</div>
            <div
              className="text-2xl font-bold"
              data-testid="memberships-active-count"
            >
              {data.activeCount}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">MRR from plans</div>
            <div
              className="text-2xl font-bold flex items-center gap-1"
              data-testid="memberships-mrr"
            >
              ${mrrDollars}
              <TrendingUp className="h-4 w-4 text-emerald-600" />
            </div>
          </div>
        </div>

        {data.pastDueCount > 0 && (
          <div
            className="flex items-center gap-2 rounded-md border border-destructive/20 bg-destructive/5 p-2"
            data-testid="memberships-past-due-banner"
          >
            <AlertCircle className="h-4 w-4 text-destructive" />
            <div className="text-xs">
              <span className="font-medium">{data.pastDueCount} past-due</span>{" "}
              membership{data.pastDueCount === 1 ? "" : "s"} — payment failed,
              dunning recommended
            </div>
          </div>
        )}

        <Link
          href="/settings?tab=memberships"
          className="text-sm font-medium text-primary flex items-center gap-1 hover:underline"
        >
          Manage plans <ArrowRight className="h-3 w-3" />
        </Link>
      </CardContent>
    </Card>
  );
}
