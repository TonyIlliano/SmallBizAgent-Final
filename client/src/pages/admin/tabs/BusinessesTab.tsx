import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Phone, DollarSign, Loader2, Search, MoreHorizontal, Eye, Power, PowerOff,
  XCircle, LogIn,
} from "lucide-react";
import type { AdminBusiness, BusinessDetail } from "../types";
import { SubscriptionBadge, LoadingSpinner, formatDate } from "../shared";

function BusinessesTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [detailBusinessId, setDetailBusinessId] = useState<number | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ type: "provision" | "deprovision"; businessId: number; businessName: string } | null>(null);
  const [subStatusBiz, setSubStatusBiz] = useState<{ id: number; name: string; currentStatus: string | null } | null>(null);

  const { data, isLoading, error } = useQuery<{ businesses: AdminBusiness[] }>({
    queryKey: ["/api/admin/businesses"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/businesses");
      return res.json();
    },
  });

  const { data: businessDetail, isLoading: loadingDetail } = useQuery<BusinessDetail>({
    queryKey: ["/api/admin/businesses", detailBusinessId, "detail"],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/admin/businesses/${detailBusinessId}/detail`);
      return res.json();
    },
    enabled: detailBusinessId !== null,
  });

  const provisionMutation = useMutation({
    mutationFn: async (businessId: number) => {
      const res = await apiRequest("POST", `/api/admin/businesses/${businessId}/provision`);
      return res.json();
    },
    onSuccess: (_data, businessId) => {
      toast({ title: "Business provisioned", description: `Business #${businessId} has been re-provisioned successfully.` });
      qc.invalidateQueries({ queryKey: ["/api/admin/businesses"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/stats"] });
    },
    onError: (err: Error) => {
      toast({ title: "Provisioning failed", description: err.message, variant: "destructive" });
    },
  });

  const deprovisionMutation = useMutation({
    mutationFn: async (businessId: number) => {
      const res = await apiRequest("POST", `/api/admin/businesses/${businessId}/deprovision`);
      return res.json();
    },
    onSuccess: (_data, businessId) => {
      toast({ title: "Business deprovisioned", description: `Business #${businessId} has been deprovisioned.` });
      qc.invalidateQueries({ queryKey: ["/api/admin/businesses"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/stats"] });
    },
    onError: (err: Error) => {
      toast({ title: "Deprovisioning failed", description: err.message, variant: "destructive" });
    },
  });

  const subStatusMutation = useMutation({
    mutationFn: async ({ businessId, status }: { businessId: number; status: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/businesses/${businessId}/subscription-status`, { status });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Subscription updated" });
      setSubStatusBiz(null);
      qc.invalidateQueries({ queryKey: ["/api/admin/businesses"] });
      qc.invalidateQueries({ queryKey: ["/api/admin/revenue"] });
    },
    onError: (err: Error) => {
      toast({ title: "Update failed", description: err.message, variant: "destructive" });
    },
  });

  const impersonateMutation = useMutation({
    mutationFn: async (businessId: number) => {
      const res = await apiRequest("POST", `/api/admin/impersonate/${businessId}`);
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: `Viewing as ${data.businessName}` });
      qc.invalidateQueries({ queryKey: ["/api/user"] });
      window.location.href = '/dashboard';
    },
    onError: (err: Error) => {
      toast({ title: "Impersonation failed", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (error) {
    return (
      <Card className="border-red-200">
        <CardContent className="pt-6">
          <div className="flex items-center gap-2 text-red-600">
            <XCircle className="h-5 w-5" />
            <p className="font-medium">Failed to load businesses</p>
          </div>
          <p className="text-sm text-muted-foreground mt-1">{(error as Error).message}</p>
        </CardContent>
      </Card>
    );
  }

  const allBusinesses = data?.businesses || [];

  let businesses = allBusinesses;
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    businesses = businesses.filter(b =>
      b.name.toLowerCase().includes(q) ||
      (b.ownerUsername && b.ownerUsername.toLowerCase().includes(q)) ||
      (b.ownerEmail && b.ownerEmail.toLowerCase().includes(q)) ||
      b.email.toLowerCase().includes(q)
    );
  }
  if (statusFilter !== "all") {
    businesses = businesses.filter(b => {
      const status = b.subscriptionStatus || "inactive";
      return status === statusFilter;
    });
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>All Businesses ({allBusinesses.length})</CardTitle>
          <CardDescription>Every registered business on the platform</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search businesses..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Subscription status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="trialing">Trialing</SelectItem>
                <SelectItem value="past_due">Past Due</SelectItem>
                <SelectItem value="canceled">Canceled</SelectItem>
                <SelectItem value="grace_period">Grace Period</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
            {(searchQuery || statusFilter !== "all") && (
              <Button variant="ghost" size="sm" onClick={() => { setSearchQuery(""); setStatusFilter("all"); }}>
                Clear filters
              </Button>
            )}
            {businesses.length !== allBusinesses.length && (
              <span className="text-xs text-muted-foreground">
                Showing {businesses.length} of {allBusinesses.length}
              </span>
            )}
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Subscription</TableHead>
                <TableHead className="text-right">Calls</TableHead>
                <TableHead className="text-right">Appts</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {businesses.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                    {allBusinesses.length === 0 ? "No businesses yet" : "No businesses match your filters"}
                  </TableCell>
                </TableRow>
              ) : (
                businesses.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{b.name}</div>
                        <div className="text-xs text-muted-foreground">{b.email}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{b.ownerUsername || "\u2014"}</div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm capitalize">{b.industry || b.type || "\u2014"}</span>
                    </TableCell>
                    <TableCell>
                      {b.twilioPhoneNumber ? (
                        <div className="flex items-center gap-1">
                          <Phone className="h-3 w-3 text-emerald-500" />
                          <span className="text-sm">{b.twilioPhoneNumber}</span>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">None</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <SubscriptionBadge status={b.subscriptionStatus} />
                    </TableCell>
                    <TableCell className="text-right font-medium">{b.callCount}</TableCell>
                    <TableCell className="text-right font-medium">{b.appointmentCount}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {b.createdAt ? formatDate(b.createdAt) : "\u2014"}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => setDetailBusinessId(b.id)}>
                            <Eye className="h-4 w-4 mr-2" />
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setConfirmAction({ type: "provision", businessId: b.id, businessName: b.name })}>
                            <Power className="h-4 w-4 mr-2" />
                            Re-provision
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setConfirmAction({ type: "deprovision", businessId: b.id, businessName: b.name })}
                            className="text-red-600"
                          >
                            <PowerOff className="h-4 w-4 mr-2" />
                            Deprovision
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => impersonateMutation.mutate(b.id)}>
                            <LogIn className="h-4 w-4 mr-2" />
                            View as Business
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => setSubStatusBiz({ id: b.id, name: b.name, currentStatus: b.subscriptionStatus })}>
                            <DollarSign className="h-4 w-4 mr-2" />
                            Change Subscription
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Business Detail Dialog */}
      <Dialog open={detailBusinessId !== null} onOpenChange={(open) => !open && setDetailBusinessId(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Business Details</DialogTitle>
            <DialogDescription>Full details for business #{detailBusinessId}</DialogDescription>
          </DialogHeader>
          {loadingDetail ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : businessDetail ? (
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Business Name</p>
                  <p className="font-semibold">{businessDetail.name}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Owner</p>
                  <p className="font-medium">{businessDetail.ownerUsername || "\u2014"}</p>
                  <p className="text-xs text-muted-foreground">{businessDetail.ownerEmail || ""}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Industry</p>
                  <p className="text-sm capitalize">{businessDetail.industry || businessDetail.type || "\u2014"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Timezone</p>
                  <p className="text-sm">{businessDetail.timezone || "\u2014"}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Subscription</p>
                  <div className="flex items-center gap-2 mt-1">
                    <SubscriptionBadge status={businessDetail.subscriptionStatus} />
                    {businessDetail.stripePlanId && (
                      <span className="text-xs text-muted-foreground">Plan: {businessDetail.stripePlanId}</span>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Trial Ends</p>
                  <p className="text-sm">{businessDetail.trialEndsAt ? formatDate(businessDetail.trialEndsAt) : "\u2014"}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Phone</p>
                  <p className="text-sm">{businessDetail.twilioPhoneNumber || "Not provisioned"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">AI Receptionist</p>
                  <p className="text-sm font-mono text-xs">{businessDetail.retellAgentId ? businessDetail.retellAgentId.slice(0, 20) + "..." : "Not set"}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Receptionist</p>
                  <Badge variant={businessDetail.receptionistEnabled ? "success" : "secondary"}>
                    {businessDetail.receptionistEnabled ? "Enabled" : "Disabled"}
                  </Badge>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Booking Slug</p>
                  <p className="text-sm font-mono">{businessDetail.bookingSlug || "\u2014"}</p>
                </div>
              </div>
              <div className="border-t pt-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Usage Stats</p>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-muted/50 rounded-lg p-3 text-center">
                    <p className="text-lg font-bold">{businessDetail.callCount}</p>
                    <p className="text-xs text-muted-foreground">Calls</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3 text-center">
                    <p className="text-lg font-bold">{businessDetail.appointmentCount}</p>
                    <p className="text-xs text-muted-foreground">Appointments</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3 text-center">
                    <p className="text-lg font-bold">{businessDetail.customerCount}</p>
                    <p className="text-xs text-muted-foreground">Customers</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3 text-center">
                    <p className="text-lg font-bold">{businessDetail.invoiceCount}</p>
                    <p className="text-xs text-muted-foreground">Invoices</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3 text-center">
                    <p className="text-lg font-bold">{businessDetail.staffCount}</p>
                    <p className="text-xs text-muted-foreground">Staff</p>
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3 text-center">
                    <p className="text-lg font-bold">{businessDetail.serviceCount}</p>
                    <p className="text-xs text-muted-foreground">Services</p>
                  </div>
                </div>
              </div>
              {businessDetail.stripeCustomerId && (
                <div className="border-t pt-3">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Stripe</p>
                  <p className="text-xs font-mono text-muted-foreground">Customer: {businessDetail.stripeCustomerId}</p>
                  {businessDetail.stripeSubscriptionId && (
                    <p className="text-xs font-mono text-muted-foreground">Subscription: {businessDetail.stripeSubscriptionId}</p>
                  )}
                </div>
              )}
              <div className="border-t pt-3">
                <p className="text-xs text-muted-foreground">
                  Created: {businessDetail.createdAt ? formatDate(businessDetail.createdAt) : "\u2014"}
                  {businessDetail.subscriptionStartDate && ` | Sub started: ${formatDate(businessDetail.subscriptionStartDate)}`}
                </p>
              </div>
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-4">Could not load business details</p>
          )}
        </DialogContent>
      </Dialog>

      {/* Provision/Deprovision Confirm Dialog */}
      <AlertDialog open={confirmAction !== null} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.type === "provision" ? "Re-provision Business?" : "Deprovision Business?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.type === "provision"
                ? `This will provision a Twilio phone number and AI receptionist for "${confirmAction?.businessName}". This may incur costs.`
                : `This will release the Twilio phone number and delete the AI receptionist for "${confirmAction?.businessName}". The business will no longer receive AI calls.`
              }
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmAction) {
                  if (confirmAction.type === "provision") {
                    provisionMutation.mutate(confirmAction.businessId);
                  } else {
                    deprovisionMutation.mutate(confirmAction.businessId);
                  }
                  setConfirmAction(null);
                }
              }}
              className={confirmAction?.type === "deprovision" ? "bg-red-600 hover:bg-red-700" : ""}
            >
              {confirmAction?.type === "provision" ? "Re-provision" : "Deprovision"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Change Subscription Status Dialog */}
      <Dialog open={subStatusBiz !== null} onOpenChange={(open) => !open && setSubStatusBiz(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Subscription Status</DialogTitle>
            <DialogDescription>
              Update subscription status for "{subStatusBiz?.name}".
              Current: {subStatusBiz?.currentStatus || "inactive"}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-2 pt-2">
            {["active", "trialing", "past_due", "canceled", "grace_period", "expired", "inactive"].map((status) => (
              <Button
                key={status}
                variant={subStatusBiz?.currentStatus === status ? "default" : "outline"}
                size="sm"
                className="capitalize"
                disabled={subStatusBiz?.currentStatus === status || subStatusMutation.isPending}
                onClick={() => {
                  if (subStatusBiz) {
                    subStatusMutation.mutate({ businessId: subStatusBiz.id, status });
                  }
                }}
              >
                {subStatusMutation.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
                {status.replace(/_/g, " ")}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default BusinessesTab;
