/**
 * Customer Membership Card (Step 4 of HVAC roadmap)
 *
 * Self-contained card for the customer detail page. Shows the customer's
 * active membership (if any) with benefits remaining, or an "Enroll in
 * plan" button when not enrolled. Industry-config gated by the caller
 * (don't render for businesses where supportsMembershipPlans is false).
 *
 * v1 enrollment flow: pick a plan → server creates Stripe subscription
 * with payment_behavior='default_incomplete' → if customer has a saved PM
 * on file, it bills immediately; otherwise the subscription stays
 * incomplete until a PM is attached out-of-band. Full Stripe Elements
 * inline payment collection is v2.
 */

import { useState } from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  Crown,
  Sparkles,
  Wrench,
  Shield,
  Zap,
  Calendar,
  X,
} from "lucide-react";

interface Plan {
  id: number;
  name: string;
  description: string | null;
  priceMonthly: string;
  billingInterval: "month" | "year";
  includedTuneUps: number;
  includedServiceCalls: number;
  memberDiscountPercent: string;
  waivesDiagnosticFee: boolean;
  priorityDispatch: boolean;
  active: boolean;
}

interface Membership {
  id: number;
  businessId: number;
  customerId: number;
  planId: number;
  status: "active" | "past_due" | "canceled" | "paused";
  startDate: string;
  nextBillingDate: string | null;
  canceledAt: string | null;
  stripeSubscriptionId: string | null;
  tuneUpsRemaining: number;
  serviceCallsRemaining: number;
  lastRenewedAt: string | null;
}

interface MembershipResponse {
  membership: Membership | null;
  plan: Plan | null;
}

interface MembershipCardProps {
  customerId: number;
}

export default function MembershipCard({ customerId }: MembershipCardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(null);

  const membershipQueryKey = [
    "/api/customers",
    customerId,
    "membership",
  ];

  const { data, isLoading } = useQuery<MembershipResponse>({
    queryKey: membershipQueryKey,
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        `/api/customers/${customerId}/membership`,
      );
      return res.json();
    },
  });

  const { data: plans = [], isLoading: plansLoading } = useQuery<Plan[]>({
    queryKey: ["/api/membership-plans"],
    queryFn: async () => {
      const res = await apiRequest(
        "GET",
        "/api/membership-plans?activeOnly=true",
      );
      return res.json();
    },
  });

  const enrollMutation = useMutation({
    mutationFn: async (planId: number) => {
      const res = await apiRequest(
        "POST",
        `/api/customers/${customerId}/enroll`,
        { planId },
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: membershipQueryKey });
      toast({
        title: "Customer enrolled",
        description:
          "Stripe subscription created. Customer needs a payment method on file before billing starts.",
      });
      setEnrollOpen(false);
      setSelectedPlanId(null);
    },
    onError: (err: any) => {
      toast({
        title: "Enrollment failed",
        description: err?.message || "Unexpected error",
        variant: "destructive",
      });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (membershipId: number) => {
      const res = await apiRequest(
        "POST",
        `/api/memberships/${membershipId}/cancel`,
      );
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: membershipQueryKey });
      toast({
        title: "Membership canceled",
        description:
          "Customer keeps their benefits until the end of the current billing period.",
      });
    },
    onError: (err: any) => {
      toast({
        title: "Cancel failed",
        description: err?.message || "Unexpected error",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Membership</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading…</p>
        </CardContent>
      </Card>
    );
  }

  const membership = data?.membership;
  const plan = data?.plan;

  // ── Active membership view ──
  if (membership && plan && membership.status !== "canceled") {
    return (
      <Card data-testid="membership-card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <Crown className="h-4 w-4 text-amber-500" />
              Membership
            </CardTitle>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  size="sm"
                  variant="ghost"
                  data-testid="membership-cancel"
                >
                  <X className="h-3 w-3 mr-1" />
                  Cancel
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancel membership?</AlertDialogTitle>
                  <AlertDialogDescription>
                    The customer keeps their benefits until the end of the
                    current billing period, then the subscription lapses.
                    They can re-enroll any time.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Never mind</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => cancelMutation.mutate(membership.id)}
                    className="bg-destructive text-destructive-foreground"
                  >
                    Cancel membership
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="secondary" className="text-sm">
              {plan.name}
            </Badge>
            <span className="text-sm text-muted-foreground">
              ${plan.priceMonthly}/{plan.billingInterval === "month" ? "mo" : "yr"}
            </span>
            {membership.status === "past_due" && (
              <Badge variant="destructive">Past due</Badge>
            )}
            {membership.status === "paused" && (
              <Badge variant="outline">Paused</Badge>
            )}
          </div>

          {/* Benefits remaining */}
          <div className="space-y-2">
            {plan.includedTuneUps > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <Wrench className="h-3 w-3 text-muted-foreground" />
                  Tune-ups remaining
                </span>
                <span className="font-medium" data-testid="membership-tune-ups-remaining">
                  {membership.tuneUpsRemaining} / {plan.includedTuneUps}
                </span>
              </div>
            )}
            {plan.includedServiceCalls > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <Shield className="h-3 w-3 text-muted-foreground" />
                  Free service calls remaining
                </span>
                <span className="font-medium" data-testid="membership-service-calls-remaining">
                  {membership.serviceCallsRemaining} / {plan.includedServiceCalls}
                </span>
              </div>
            )}
            {Number(plan.memberDiscountPercent) > 0 && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Member discount</span>
                <span className="font-medium">
                  {plan.memberDiscountPercent}% off
                </span>
              </div>
            )}
            {plan.priorityDispatch && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Zap className="h-3 w-3" />
                Priority dispatch — jumps the queue
              </div>
            )}
            {plan.waivesDiagnosticFee && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Sparkles className="h-3 w-3" />
                Diagnostic fee waived
              </div>
            )}
          </div>

          {/* Billing dates */}
          {membership.nextBillingDate && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground pt-2 border-t">
              <Calendar className="h-3 w-3" />
              Renews{" "}
              {new Date(membership.nextBillingDate).toLocaleDateString()}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  // ── Enroll view (no active membership) ──
  return (
    <Card data-testid="membership-card-empty">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Crown className="h-4 w-4 text-muted-foreground" />
          Membership
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Not enrolled. Membership plans turn one-time repair customers into
          recurring revenue with pre-paid tune-ups, priority dispatch, and
          auto-applied discounts.
        </p>
        <Button
          size="sm"
          onClick={() => setEnrollOpen(true)}
          disabled={plans.length === 0}
          data-testid="membership-enroll-open"
        >
          <Sparkles className="h-3 w-3 mr-1" />
          Enroll in plan
        </Button>
        {plans.length === 0 && !plansLoading && (
          <p className="text-xs text-muted-foreground">
            No plans configured yet. Go to Settings → Memberships to set up
            plan tiers.
          </p>
        )}
      </CardContent>

      <Dialog open={enrollOpen} onOpenChange={setEnrollOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Enroll customer in plan</DialogTitle>
            <DialogDescription>
              Pick a tier. Stripe Connect will start the subscription. If the
              customer doesn't have a payment method on file, they'll need to
              add one before billing kicks in.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-[50vh] overflow-y-auto">
            {plans.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedPlanId(p.id)}
                className={`w-full text-left rounded-md border p-3 space-y-1 transition-colors hover:bg-accent ${
                  selectedPlanId === p.id ? "border-primary bg-accent" : ""
                }`}
                data-testid={`enroll-plan-${p.id}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium">{p.name}</span>
                  <span className="text-sm text-muted-foreground">
                    ${p.priceMonthly}/{p.billingInterval === "month" ? "mo" : "yr"}
                  </span>
                </div>
                {p.description && (
                  <p className="text-xs text-muted-foreground">
                    {p.description}
                  </p>
                )}
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEnrollOpen(false)}
              disabled={enrollMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedPlanId) enrollMutation.mutate(selectedPlanId);
              }}
              disabled={!selectedPlanId || enrollMutation.isPending}
              data-testid="enroll-submit"
            >
              {enrollMutation.isPending ? "Enrolling…" : "Enroll"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
