import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, MoreHorizontal, UserX, UserCheck, KeyRound, Shield, CheckCircle,
} from "lucide-react";
import type { AdminUser } from "../types";
import { RoleBadge, LoadingSpinner, formatDate, formatRelative } from "../shared";

function UsersTab() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [resetPasswordUser, setResetPasswordUser] = useState<{ id: number; username: string } | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const { data, isLoading } = useQuery<{ users: AdminUser[] }>({
    queryKey: ["/api/admin/users"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/users");
      return res.json();
    },
  });

  const disableUserMutation = useMutation({
    mutationFn: async (userId: number) => {
      const res = await apiRequest("POST", `/api/admin/users/${userId}/disable`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "User disabled" });
      qc.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to disable user", description: err.message, variant: "destructive" });
    },
  });

  const enableUserMutation = useMutation({
    mutationFn: async (userId: number) => {
      const res = await apiRequest("POST", `/api/admin/users/${userId}/enable`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "User enabled" });
      qc.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to enable user", description: err.message, variant: "destructive" });
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: async ({ userId, newPassword }: { userId: number; newPassword: string }) => {
      const res = await apiRequest("POST", `/api/admin/users/${userId}/reset-password`, { newPassword });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Password reset", description: "The user's password has been changed." });
      setResetPasswordUser(null);
      setNewPassword("");
    },
    onError: (err: Error) => {
      toast({ title: "Password reset failed", description: err.message, variant: "destructive" });
    },
  });

  const changeRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: number; role: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/users/${userId}/role`, { role });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Role updated" });
      qc.invalidateQueries({ queryKey: ["/api/admin/users"] });
    },
    onError: (err: Error) => {
      toast({ title: "Role change failed", description: err.message, variant: "destructive" });
    },
  });

  if (isLoading) {
    return <LoadingSpinner />;
  }

  const users = data?.users || [];

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>All Users ({users.length})</CardTitle>
          <CardDescription>Every registered user account on the platform</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Username</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Business</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Login</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    No users yet
                  </TableCell>
                </TableRow>
              ) : (
                users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.username}</TableCell>
                    <TableCell className="text-sm">{u.email}</TableCell>
                    <TableCell>
                      <RoleBadge role={u.role} />
                    </TableCell>
                    <TableCell className="text-sm">
                      {u.businessName || <span className="text-muted-foreground">{"\u2014"}</span>}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {u.active !== false ? (
                          <Badge variant="success" className="text-xs">Active</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">Inactive</Badge>
                        )}
                        {u.emailVerified && (
                          <span title="Email verified">
                            <CheckCircle className="h-3 w-3 text-emerald-500" />
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {u.lastLogin ? formatRelative(u.lastLogin) : "Never"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {u.createdAt ? formatDate(u.createdAt) : "\u2014"}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>User Actions</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          {u.active !== false ? (
                            <DropdownMenuItem
                              onClick={() => disableUserMutation.mutate(u.id)}
                              className="text-red-600"
                            >
                              <UserX className="h-4 w-4 mr-2" />
                              Disable Account
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onClick={() => enableUserMutation.mutate(u.id)}>
                              <UserCheck className="h-4 w-4 mr-2" />
                              Enable Account
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => setResetPasswordUser({ id: u.id, username: u.username })}>
                            <KeyRound className="h-4 w-4 mr-2" />
                            Reset Password
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuSub>
                            <DropdownMenuSubTrigger>
                              <Shield className="h-4 w-4 mr-2" />
                              Change Role
                            </DropdownMenuSubTrigger>
                            <DropdownMenuSubContent>
                              {["user", "staff", "admin"].map((role) => (
                                <DropdownMenuItem
                                  key={role}
                                  onClick={() => changeRoleMutation.mutate({ userId: u.id, role })}
                                  disabled={u.role === role}
                                  className="capitalize"
                                >
                                  {role === u.role && <CheckCircle className="h-3 w-3 mr-2 text-emerald-500" />}
                                  {role !== u.role && <span className="w-[20px]" />}
                                  {role}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuSubContent>
                          </DropdownMenuSub>
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

      {/* Reset Password Dialog */}
      <Dialog open={resetPasswordUser !== null} onOpenChange={(open) => { if (!open) { setResetPasswordUser(null); setNewPassword(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>
              Set a new password for user "{resetPasswordUser?.username}".
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">New Password</label>
              <Input
                type="password"
                placeholder="Enter new password (12+ chars, mixed case, number, special)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Must be 12+ characters with uppercase, lowercase, number, and special character.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setResetPasswordUser(null); setNewPassword(""); }}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (resetPasswordUser && newPassword) {
                  resetPasswordMutation.mutate({ userId: resetPasswordUser.id, newPassword });
                }
              }}
              disabled={!newPassword || newPassword.length < 12 || resetPasswordMutation.isPending}
            >
              {resetPasswordMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Reset Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default UsersTab;
