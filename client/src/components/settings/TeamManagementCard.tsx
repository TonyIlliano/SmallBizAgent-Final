import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
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
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, UserPlus, Users, Mail, Trash2, Info, ArrowUpCircle } from "lucide-react";

interface TeamMember {
  userId: number;
  username: string;
  email: string;
  role: string;
  accessRole?: string;
  status?: string;
}

interface SeatInfo {
  usedSeats: number;
  includedSeats: number | null; // null = unlimited
  unlimited: boolean;
  chargeable: boolean; // true only on Starter
  perSeatPrice: number;
  extraSeats: number;
  monthlySeatCharge: number;
}

export default function TeamManagementCard() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const businessId = user?.businessId;

  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<string>("staff");
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<TeamMember | null>(null);

  const { data: teamMembers = [], isLoading } = useQuery<TeamMember[]>({
    queryKey: ["/api/team"],
    enabled: !!businessId,
  });

  const { data: seatInfo } = useQuery<SeatInfo>({
    queryKey: ["/api/team/seat-info"],
    enabled: !!businessId,
  });

  const invalidateTeam = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/team"] });
    queryClient.invalidateQueries({ queryKey: ["/api/team/seat-info"] });
  };

  const inviteMutation = useMutation({
    mutationFn: async (data: { email: string; role: string }) => {
      return apiRequest("POST", "/api/team/invite", data);
    },
    onSuccess: () => {
      invalidateTeam();
      toast({ title: "Invite sent", description: `Invitation sent to ${inviteEmail}` });
      setInviteDialogOpen(false);
      setInviteEmail("");
      setInviteRole("staff");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to send invite",
        variant: "destructive",
      });
    },
  });

  const changeRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: number; role: string }) => {
      return apiRequest("PUT", `/api/team/${userId}/role`, { role });
    },
    onSuccess: () => {
      invalidateTeam();
      toast({ title: "Role updated", description: "Team member role has been changed." });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to change role",
        variant: "destructive",
      });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (userId: number) => {
      return apiRequest("DELETE", `/api/team/${userId}`);
    },
    onSuccess: () => {
      invalidateTeam();
      toast({ title: "Member removed", description: "Team member has been removed from this business." });
      setRemoveDialogOpen(false);
      setMemberToRemove(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to remove member",
        variant: "destructive",
      });
    },
  });

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case "owner":
        return "default" as const;
      case "manager":
        return "secondary" as const;
      case "staff":
        return "outline" as const;
      default:
        return "outline" as const;
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    return status === "active" ? ("default" as const) : ("secondary" as const);
  };

  if (!businessId) return null;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-muted-foreground" />
              <div>
                <CardTitle className="text-lg">Team Members</CardTitle>
                <CardDescription>
                  Manage who has access to your business and their roles.
                </CardDescription>
              </div>
            </div>
            <Button size="sm" onClick={() => setInviteDialogOpen(true)}>
              <UserPlus className="h-4 w-4 mr-2" />
              Invite Member
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {seatInfo && seatInfo.chargeable && (
            <div className="mb-4 rounded-lg border bg-muted/40 p-3" data-testid="seat-billing-banner">
              <div className="flex items-start gap-2">
                <Info className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                <div className="text-sm">
                  <p className="font-medium">
                    {seatInfo.usedSeats} of {seatInfo.includedSeats} included seat
                    {seatInfo.includedSeats === 1 ? "" : "s"} used
                    {seatInfo.extraSeats > 0 && (
                      <span className="text-foreground">
                        {" "}· {seatInfo.extraSeats} extra (${seatInfo.monthlySeatCharge}/mo)
                      </span>
                    )}
                  </p>
                  <p className="text-muted-foreground mt-0.5">
                    Each seat beyond your plan is ${seatInfo.perSeatPrice}/mo.{" "}
                    <a href="/settings?tab=subscription" className="inline-flex items-center gap-1 font-medium text-foreground hover:underline">
                      <ArrowUpCircle className="h-3.5 w-3.5" />
                      Growth &amp; Pro include unlimited seats
                    </a>
                    .
                  </p>
                </div>
              </div>
            </div>
          )}
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading team...
            </div>
          ) : teamMembers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm font-medium">No team members yet</p>
              <p className="text-xs mt-1">Invite managers or staff to help run your business.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teamMembers.map((member) => {
                  const isCurrentUser = member.userId === user?.id;
                  const teamRole = member.accessRole ?? member.role;
                  const isOwner = teamRole === "owner";
                  const status = member.status ?? "active";
                  return (
                    <TableRow key={member.userId}>
                      <TableCell className="font-medium">
                        {member.username}
                        {isCurrentUser && (
                          <span className="text-xs text-muted-foreground ml-2">(you)</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{member.email}</TableCell>
                      <TableCell>
                        {isOwner || isCurrentUser ? (
                          <Badge variant={getRoleBadgeVariant(teamRole)}>
                            {teamRole.charAt(0).toUpperCase() + teamRole.slice(1)}
                          </Badge>
                        ) : (
                          <Select
                            value={teamRole}
                            onValueChange={(newRole) =>
                              changeRoleMutation.mutate({ userId: member.userId, role: newRole })
                            }
                          >
                            <SelectTrigger className="h-8 w-28">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="manager">Manager</SelectItem>
                              <SelectItem value="staff">Staff</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusBadgeVariant(status)}>
                          {status.charAt(0).toUpperCase() + status.slice(1)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {!isOwner && !isCurrentUser && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => {
                              setMemberToRemove(member);
                              setRemoveDialogOpen(true);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Invite Team Member Dialog */}
      <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite Team Member</DialogTitle>
            <DialogDescription>
              Send an invitation email to add a new team member to your business.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Email Address</label>
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <Input
                  type="email"
                  placeholder="teammate@example.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Role</label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manager">
                    Manager - Operational access (appointments, customers, jobs, invoices)
                  </SelectItem>
                  <SelectItem value="staff">Staff - Own schedule only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {seatInfo && seatInfo.chargeable && seatInfo.usedSeats >= (seatInfo.includedSeats ?? 1) && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" data-testid="seat-charge-notice">
                Heads up: you've used your {seatInfo.includedSeats} included seat
                {seatInfo.includedSeats === 1 ? "" : "s"}. When this person joins, your bill
                increases by <strong>${seatInfo.perSeatPrice}/mo</strong>.{" "}
                <a href="/settings?tab=subscription" className="font-medium underline">
                  Growth &amp; Pro include unlimited seats
                </a>
                .
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => inviteMutation.mutate({ email: inviteEmail, role: inviteRole })}
              disabled={!inviteEmail || inviteMutation.isPending}
            >
              {inviteMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                "Send Invite"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Member Confirmation Dialog */}
      <AlertDialog open={removeDialogOpen} onOpenChange={setRemoveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Team Member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove {memberToRemove?.username} ({memberToRemove?.email})
              from your business? They will lose access immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setMemberToRemove(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => memberToRemove && removeMutation.mutate(memberToRemove.userId)}
            >
              {removeMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Removing...
                </>
              ) : (
                "Remove Member"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
