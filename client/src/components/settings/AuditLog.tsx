import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, ChevronLeft, ChevronRight, ShieldAlert } from "lucide-react";

interface AuditLogEntry {
  id: number;
  userId: number | null;
  businessId: number | null;
  action: string;
  resource: string | null;
  resourceId: number | null;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

interface AuditLogResponse {
  logs: AuditLogEntry[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const ACTION_LABELS: Record<string, string> = {
  login: "Login",
  logout: "Logout",
  login_failed: "Login Failed",
  "2fa_enabled": "2FA Enabled",
  "2fa_disabled": "2FA Disabled",
  "2fa_validated": "2FA Validated",
  password_changed: "Password Changed",
  password_reset: "Password Reset",
  password_reset_requested: "Password Reset Requested",
  data_export: "Data Export",
  account_deleted: "Account Deleted",
  api_key_created: "API Key Created",
  api_key_revoked: "API Key Revoked",
  webhook_created: "Webhook Created",
  webhook_deleted: "Webhook Deleted",
  business_created: "Business Created",
  business_updated: "Business Updated",
  staff_invited: "Staff Invited",
  staff_removed: "Staff Removed",
  subscription_created: "Subscription Created",
  subscription_cancelled: "Subscription Cancelled",
  phone_provisioned: "Phone Provisioned",
  phone_deprovisioned: "Phone Deprovisioned",
};

function formatAction(action: string): string {
  return ACTION_LABELS[action] || action
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDetails(entry: AuditLogEntry): string {
  const parts: string[] = [];

  if (entry.resource && entry.resource !== "account") {
    parts.push(entry.resource);
  }

  if (entry.resourceId) {
    parts.push(`#${entry.resourceId}`);
  }

  if (entry.details && typeof entry.details === "object") {
    const detail = entry.details;
    if (detail.username) parts.push(`User: ${detail.username}`);
    if (detail.email) parts.push(`Email: ${detail.email}`);
    if (detail.reason) parts.push(`Reason: ${detail.reason}`);
  }

  return parts.join(" - ") || "-";
}

interface AuditLogProps {
  businessId: number;
}

export default function AuditLog({ businessId }: AuditLogProps) {
  const [page, setPage] = useState(1);
  const limit = 25;

  const { data, isLoading, error } = useQuery<AuditLogResponse>({
    queryKey: [`/api/business/${businessId}/audit-log`, { page: page.toString(), limit: limit.toString() }],
    enabled: !!businessId,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5" />
          Security Audit Log
        </CardTitle>
        <CardDescription>
          Recent security events and account activity for your business.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-muted-foreground">Loading audit log...</span>
          </div>
        ) : error ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>Failed to load audit log. Please try again later.</p>
          </div>
        ) : !data || data.logs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <ShieldAlert className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No security events recorded yet.</p>
          </div>
        ) : (
          <>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead>IP Address</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.logs.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="text-sm whitespace-nowrap">
                        {formatDate(entry.createdAt)}
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center px-2 py-1 rounded-md bg-muted text-xs font-medium">
                          {formatAction(entry.action)}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-xs truncate">
                        {formatDetails(entry)}
                      </TableCell>
                      <TableCell className="text-sm font-mono text-muted-foreground">
                        {entry.ipAddress || "-"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            {data.totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-muted-foreground">
                  Page {data.page} of {data.totalPages} ({data.total} total events)
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                    disabled={page >= data.totalPages}
                  >
                    Next
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
