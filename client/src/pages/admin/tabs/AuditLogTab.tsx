import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, ScrollText } from "lucide-react";
import type { AuditLogEntry } from "../types";

function AuditLogTab() {
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState("all");
  const limit = 30;

  const { data, isLoading } = useQuery<{ logs: AuditLogEntry[]; total: number; page: number; limit: number }>({
    queryKey: ["/api/admin/audit-logs", page, actionFilter],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: String(limit) });
      if (actionFilter !== "all") params.set("action", actionFilter);
      const res = await apiRequest("GET", `/api/admin/audit-logs?${params}`);
      return res.json();
    },
  });

  const totalPages = data ? Math.ceil(data.total / limit) : 0;

  const ACTION_STYLES: Record<string, string> = {
    admin_provision: "bg-emerald-100 text-emerald-800",
    admin_deprovision: "bg-red-100 text-red-800",
    admin_disable_user: "bg-red-100 text-red-800",
    admin_enable_user: "bg-emerald-100 text-emerald-800",
    admin_reset_password: "bg-amber-100 text-amber-800",
    admin_change_role: "bg-blue-100 text-blue-800",
    admin_change_subscription: "bg-purple-100 text-purple-800",
    admin_extend_trial: "bg-blue-100 text-blue-800",
    admin_impersonate: "bg-amber-100 text-amber-800",
    admin_stop_impersonation: "bg-gray-100 text-gray-800",
  };

  const adminActions = [
    "admin_provision", "admin_deprovision", "admin_disable_user", "admin_enable_user",
    "admin_reset_password", "admin_change_role", "admin_change_subscription",
    "admin_extend_trial", "admin_impersonate", "admin_stop_impersonation",
    "login", "login_failed", "logout", "password_change", "settings_change",
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ScrollText className="h-5 w-5" />
            Audit Log
          </CardTitle>
          <CardDescription>All admin and security actions with timestamps and IP addresses</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2 mb-4">
            <Select value={actionFilter} onValueChange={(v) => { setActionFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Filter by action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                {adminActions.map(a => (
                  <SelectItem key={a} value={a}>{a.replace(/_/g, ' ')}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : !data || data.logs.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">No audit log entries found</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Resource</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead>IP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="text-xs whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </TableCell>
                      <TableCell className="text-sm">{log.username}</TableCell>
                      <TableCell>
                        <Badge className={`text-xs ${ACTION_STYLES[log.action] || "bg-gray-100 text-gray-800"}`}>
                          {log.action.replace(/_/g, ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {log.resource ? `${log.resource} #${log.resourceId}` : '\u2014'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                        {log.details ? (typeof log.details === 'string' ? log.details : (() => { try { return JSON.stringify(log.details); } catch { return '[complex object]'; } })()) : '\u2014'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{log.ipAddress || '\u2014'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <span className="text-sm text-muted-foreground">{data.total} total entries</span>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
                    <span className="text-sm py-1.5">Page {page} of {totalPages}</span>
                    <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default AuditLogTab;
