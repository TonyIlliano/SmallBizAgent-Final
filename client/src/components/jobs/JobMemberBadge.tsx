/**
 * Job Member Badge (Step 4 of HVAC roadmap)
 *
 * Compact component shown on the job detail page when the linked customer
 * has an active membership. Renders a badge + benefits summary + one-tap
 * "Use tune-up" / "Use service call" actions that decrement the membership
 * via the audit-trail-safe storage helper.
 *
 * Self-hides when the customer has no membership OR no benefits to use.
 * Industry-config gating happens at the parent — this component just
 * queries the membership endpoint and shows nothing if the response is
 * null.
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Crown, Wrench, Shield, Zap, Sparkles } from "lucide-react";

interface Plan {
  id: number;
  name: string;
  includedTuneUps: number;
  includedServiceCalls: number;
  memberDiscountPercent: string;
  waivesDiagnosticFee: boolean;
  priorityDispatch: boolean;
}

interface Membership {
  id: number;
  customerId: number;
  status: "active" | "past_due" | "canceled" | "paused";
  tuneUpsRemaining: number;
  serviceCallsRemaining: number;
}

interface MembershipResponse {
  membership: Membership | null;
  plan: Plan | null;
}

interface JobMemberBadgeProps {
  customerId: number;
  jobId: number;
}

export default function JobMemberBadge({ customerId, jobId }: JobMemberBadgeProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

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
    enabled: !!customerId,
  });

  const useBenefitMutation = useMutation({
    mutationFn: async (benefitType: "tune_up" | "service_call") => {
      if (!data?.membership) throw new Error("No active membership");
      const res = await apiRequest(
        "POST",
        `/api/memberships/${data.membership.id}/use-benefit`,
        { benefitType, jobId },
      );
      return res.json();
    },
    onSuccess: (_result, benefitType) => {
      queryClient.invalidateQueries({ queryKey: membershipQueryKey });
      toast({
        title:
          benefitType === "tune_up"
            ? "Tune-up benefit applied"
            : "Service call benefit applied",
        description: "Membership counter decremented and audit row written.",
      });
    },
    onError: (err: any) => {
      toast({
        title: "Could not apply benefit",
        description: err?.message || "Unexpected error",
        variant: "destructive",
      });
    },
  });

  // Self-hide when no membership data OR no active membership
  if (isLoading) return null;
  const membership = data?.membership;
  const plan = data?.plan;
  if (!membership || !plan) return null;
  if (membership.status === "canceled") return null;

  return (
    <Card
      className="border-amber-200 bg-amber-50/50"
      data-testid="job-member-badge"
    >
      <CardContent className="p-3 space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Crown className="h-4 w-4 text-amber-600" />
          <Badge variant="secondary" className="font-semibold">
            MEMBER — {plan.name}
          </Badge>
          {membership.status === "past_due" && (
            <Badge variant="destructive">Past due</Badge>
          )}
          {plan.priorityDispatch && (
            <Badge variant="outline" className="text-xs">
              <Zap className="h-3 w-3 mr-1" />
              Priority
            </Badge>
          )}
        </div>

        {/* Benefits summary */}
        <div className="text-xs text-muted-foreground space-y-1">
          {Number(plan.memberDiscountPercent) > 0 && (
            <div>{plan.memberDiscountPercent}% off labor + parts (apply manually on line items)</div>
          )}
          {plan.waivesDiagnosticFee && (
            <div className="flex items-center gap-1">
              <Sparkles className="h-3 w-3" />
              Diagnostic fee is waived
            </div>
          )}
        </div>

        {/* Use-benefit actions */}
        <div className="flex items-center gap-2 flex-wrap pt-1">
          {plan.includedTuneUps > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => useBenefitMutation.mutate("tune_up")}
              disabled={
                membership.tuneUpsRemaining <= 0 ||
                useBenefitMutation.isPending
              }
              data-testid="job-use-tune-up"
            >
              <Wrench className="h-3 w-3 mr-1" />
              Use tune-up ({membership.tuneUpsRemaining} left)
            </Button>
          )}
          {plan.includedServiceCalls > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => useBenefitMutation.mutate("service_call")}
              disabled={
                membership.serviceCallsRemaining <= 0 ||
                useBenefitMutation.isPending
              }
              data-testid="job-use-service-call"
            >
              <Shield className="h-3 w-3 mr-1" />
              Use service call ({membership.serviceCallsRemaining} left)
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
