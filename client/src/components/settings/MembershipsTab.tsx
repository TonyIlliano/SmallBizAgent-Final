/**
 * Memberships Settings Tab (Step 4 of HVAC roadmap)
 *
 * Owner-facing CRUD on membership plan tiers. Industry-config gated by the
 * parent — this component assumes the business supports memberships and
 * renders the full plan ladder + seed-defaults flow.
 *
 * Stripe Product / Price IDs are NOT shown in the form — they're populated
 * lazily by the server when the first customer enrolls. The form covers
 * the inputs an owner actually thinks about: name, description, price,
 * benefits, perks.
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
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sparkles, Plus, Pencil, Trash2, Zap, Shield, Wrench } from "lucide-react";

interface Plan {
  id: number;
  businessId: number;
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
  sortOrder: number;
  stripeProductId: string | null;
  stripePriceId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface FormState {
  name: string;
  description: string;
  priceMonthly: string;
  billingInterval: "month" | "year";
  includedTuneUps: number;
  includedServiceCalls: number;
  memberDiscountPercent: string;
  waivesDiagnosticFee: boolean;
  priorityDispatch: boolean;
  sortOrder: number;
}

const EMPTY_FORM: FormState = {
  name: "",
  description: "",
  priceMonthly: "0",
  billingInterval: "month",
  includedTuneUps: 0,
  includedServiceCalls: 0,
  memberDiscountPercent: "0",
  waivesDiagnosticFee: false,
  priorityDispatch: false,
  sortOrder: 0,
};

export default function MembershipsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const plansQueryKey = ["/api/membership-plans"];

  const { data: plans = [], isLoading } = useQuery<Plan[]>({
    queryKey: plansQueryKey,
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/membership-plans");
      return res.json();
    },
  });

  const seedMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/membership-plans/seed-defaults");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: plansQueryKey });
      toast({
        title: "Plans seeded",
        description: "Three HVAC-standard tiers added. Edit prices and benefits to match your market.",
      });
    },
    onError: (err: any) => {
      toast({
        title: "Could not seed plans",
        description: err?.message || "Unexpected error",
        variant: "destructive",
      });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        priceMonthly: String(form.priceMonthly),
        memberDiscountPercent: String(form.memberDiscountPercent),
        active: true,
      };
      if (editingId) {
        const res = await apiRequest(
          "PATCH",
          `/api/membership-plans/${editingId}`,
          payload,
        );
        return res.json();
      }
      const res = await apiRequest("POST", "/api/membership-plans", payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: plansQueryKey });
      toast({ title: editingId ? "Plan updated" : "Plan created" });
      setDialogOpen(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
    },
    onError: (err: any) => {
      toast({
        title: "Save failed",
        description: err?.message || "Unexpected error",
        variant: "destructive",
      });
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/membership-plans/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: plansQueryKey });
      toast({ title: "Plan deactivated" });
    },
    onError: (err: any) => {
      toast({
        title: "Deactivate failed",
        description: err?.message || "Unexpected error",
        variant: "destructive",
      });
    },
  });

  function openAdd() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  }

  function openEdit(plan: Plan) {
    setEditingId(plan.id);
    setForm({
      name: plan.name,
      description: plan.description ?? "",
      priceMonthly: plan.priceMonthly,
      billingInterval: plan.billingInterval,
      includedTuneUps: plan.includedTuneUps,
      includedServiceCalls: plan.includedServiceCalls,
      memberDiscountPercent: plan.memberDiscountPercent,
      waivesDiagnosticFee: plan.waivesDiagnosticFee,
      priorityDispatch: plan.priorityDispatch,
      sortOrder: plan.sortOrder,
    });
    setDialogOpen(true);
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <CardTitle>Membership Plans</CardTitle>
              <CardDescription>
                Build recurring revenue by enrolling customers in maintenance
                agreements. Members get auto-applied discounts, priority
                dispatch, and pre-paid tune-ups. Stripe Connect bills them
                automatically on your account.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {plans.length === 0 && (
                <Button
                  variant="secondary"
                  onClick={() => seedMutation.mutate()}
                  disabled={seedMutation.isPending}
                  data-testid="memberships-seed-defaults"
                >
                  <Sparkles className="h-4 w-4 mr-1" />
                  {seedMutation.isPending ? "Seeding…" : "Seed HVAC defaults"}
                </Button>
              )}
              <Button
                onClick={openAdd}
                data-testid="memberships-add-plan"
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Plan
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading plans…</p>
          ) : plans.length === 0 ? (
            <div className="text-center py-8 space-y-2">
              <Wrench className="h-8 w-8 mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                No plans yet. Click "Seed HVAC defaults" to add Basic /
                Premium / Elite Comfort tiers, or build your own from
                scratch.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {plans.map((plan) => (
                <div
                  key={plan.id}
                  className="rounded-lg border p-4 flex items-start justify-between gap-3"
                  data-testid={`membership-plan-${plan.id}`}
                >
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold">{plan.name}</h3>
                      <Badge variant="secondary">
                        ${plan.priceMonthly}/{plan.billingInterval === "month" ? "mo" : "yr"}
                      </Badge>
                      {!plan.active && (
                        <Badge variant="outline" className="text-xs">
                          Inactive
                        </Badge>
                      )}
                    </div>
                    {plan.description && (
                      <p className="text-sm text-muted-foreground">{plan.description}</p>
                    )}
                    <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                      {plan.includedTuneUps > 0 && (
                        <span className="flex items-center gap-1">
                          <Wrench className="h-3 w-3" />
                          {plan.includedTuneUps} tune-up{plan.includedTuneUps > 1 ? "s" : ""}/period
                        </span>
                      )}
                      {plan.includedServiceCalls > 0 && (
                        <span className="flex items-center gap-1">
                          <Shield className="h-3 w-3" />
                          {plan.includedServiceCalls} free service call{plan.includedServiceCalls > 1 ? "s" : ""}
                        </span>
                      )}
                      {Number(plan.memberDiscountPercent) > 0 && (
                        <span>{plan.memberDiscountPercent}% off labor + parts</span>
                      )}
                      {plan.waivesDiagnosticFee && <span>Diagnostic fee waived</span>}
                      {plan.priorityDispatch && (
                        <span className="flex items-center gap-1">
                          <Zap className="h-3 w-3" />
                          Priority dispatch
                        </span>
                      )}
                    </div>
                    {plan.stripePriceId && (
                      <div className="text-xs text-muted-foreground font-mono">
                        Stripe Price: {plan.stripePriceId}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => openEdit(plan)}
                      data-testid={`membership-edit-${plan.id}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {plan.active && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            size="icon"
                            variant="ghost"
                            data-testid={`membership-deactivate-${plan.id}`}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Deactivate this plan?</AlertDialogTitle>
                            <AlertDialogDescription>
                              The plan stays in your records (and existing members
                              keep their current benefits until cancellation), but
                              new customers won't see it as an option for
                              enrollment.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => deactivateMutation.mutate(plan.id)}
                              className="bg-destructive text-destructive-foreground"
                            >
                              Deactivate
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add / edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingId ? "Edit plan" : "Add membership plan"}
            </DialogTitle>
            <DialogDescription>
              Configure pricing and benefits. Stripe Products are created on
              your Connect account when the first customer enrolls.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Plan name</label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Premium Comfort"
                data-testid="plan-name"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium">Description</label>
              <Textarea
                value={form.description}
                onChange={(e) =>
                  setForm({ ...form, description: e.target.value })
                }
                rows={2}
                placeholder="What customers get with this plan…"
                data-testid="plan-description"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-sm font-medium">Price</label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.priceMonthly}
                  onChange={(e) =>
                    setForm({ ...form, priceMonthly: e.target.value })
                  }
                  data-testid="plan-price"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Per</label>
                <Select
                  value={form.billingInterval}
                  onValueChange={(v) =>
                    setForm({
                      ...form,
                      billingInterval: v as "month" | "year",
                    })
                  }
                >
                  <SelectTrigger data-testid="plan-interval">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="month">Month</SelectItem>
                    <SelectItem value="year">Year</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-sm font-medium">Tune-ups / period</label>
                <Input
                  type="number"
                  min="0"
                  value={form.includedTuneUps}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      includedTuneUps: parseInt(e.target.value, 10) || 0,
                    })
                  }
                  data-testid="plan-tune-ups"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">Free service calls</label>
                <Input
                  type="number"
                  min="0"
                  value={form.includedServiceCalls}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      includedServiceCalls: parseInt(e.target.value, 10) || 0,
                    })
                  }
                  data-testid="plan-service-calls"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">Member discount %</label>
              <Input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={form.memberDiscountPercent}
                onChange={(e) =>
                  setForm({ ...form, memberDiscountPercent: e.target.value })
                }
                placeholder="e.g. 15 for 15% off labor + parts"
                data-testid="plan-discount"
              />
            </div>

            <div className="flex items-center justify-between rounded-md border p-2">
              <label className="text-sm font-medium">
                Waive diagnostic fee
              </label>
              <Switch
                checked={form.waivesDiagnosticFee}
                onCheckedChange={(checked) =>
                  setForm({ ...form, waivesDiagnosticFee: checked })
                }
                data-testid="plan-waive-diagnostic"
              />
            </div>
            <div className="flex items-center justify-between rounded-md border p-2">
              <label className="text-sm font-medium">Priority dispatch</label>
              <Switch
                checked={form.priorityDispatch}
                onCheckedChange={(checked) =>
                  setForm({ ...form, priorityDispatch: checked })
                }
                data-testid="plan-priority"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">Sort order</label>
              <Input
                type="number"
                min="0"
                value={form.sortOrder}
                onChange={(e) =>
                  setForm({
                    ...form,
                    sortOrder: parseInt(e.target.value, 10) || 0,
                  })
                }
                data-testid="plan-sort-order"
              />
              <p className="text-xs text-muted-foreground">
                Lower numbers appear first in the customer-facing comparison.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saveMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !form.name}
              data-testid="plan-save"
            >
              {saveMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
