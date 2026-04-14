import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import TwoFactorSetup from "@/components/settings/TwoFactorSetup";
import AuditLog from "@/components/settings/AuditLog";
import AgentInsights from "@/components/settings/AgentInsights";
import IntegrationHealth from "@/components/settings/IntegrationHealth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
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
import { Phone, Shield, FileText, Trash2, Download, Loader2, RefreshCw } from "lucide-react";

// Active Sessions component
function ActiveSessionsCard() {
  const { toast } = useToast();

  interface SessionInfo {
    id: string;
    isCurrent: boolean;
    device: string;
    browser: string;
    ip: string;
    expiresAt: string;
    lastActive: string;
  }

  const { data: sessionsData, isLoading } = useQuery<{ sessions: SessionInfo[]; activeSessions: number }>({
    queryKey: ["/api/sessions"],
  });

  const getDeviceIcon = (device: string) => {
    switch (device) {
      case 'iOS':
      case 'Android':
        return <Phone className="h-4 w-4" />;
      default:
        return <Shield className="h-4 w-4" />;
    }
  };

  const formatLastActive = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMins / 60);
      const diffDays = Math.floor(diffHours / 24);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      return `${diffDays}d ago`;
    } catch {
      return 'Unknown';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Active Sessions
        </CardTitle>
        <CardDescription>
          {sessionsData?.activeSessions
            ? `${sessionsData.activeSessions} active session${sessionsData.activeSessions > 1 ? 's' : ''}`
            : 'Manage your active sessions across all devices'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading sessions...
          </div>
        ) : sessionsData?.sessions && sessionsData.sessions.length > 0 ? (
          <div className="space-y-3">
            {sessionsData.sessions.map((session) => (
              <div
                key={session.id}
                className={`flex items-center justify-between p-3 rounded-lg border ${
                  session.isCurrent ? 'border-primary/50 bg-primary/5' : 'border-border'
                }`}
              >
                <div className="flex items-center gap-3">
                  {getDeviceIcon(session.device)}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {session.browser} on {session.device}
                      </span>
                      {session.isCurrent && (
                        <Badge variant="secondary" className="text-xs">Current</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>IP: {session.ip}</span>
                      <span>.</span>
                      <span>{formatLastActive(session.lastActive)}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No active sessions found.</p>
        )}

        <div className="pt-4 border-t">
          <Button
            variant="destructive"
            size="sm"
            onClick={async () => {
              try {
                await apiRequest("POST", "/api/logout-all-devices");
                toast({
                  title: "All sessions terminated",
                  description: "You have been logged out from all other devices. Please log in again.",
                });
                window.location.href = "/auth";
              } catch (error: any) {
                toast({
                  title: "Error",
                  description: error.message || "Failed to logout all devices",
                  variant: "destructive",
                });
              }
            }}
          >
            Logout All Devices
          </Button>
          <p className="text-xs text-muted-foreground mt-2">
            This will terminate all active sessions including this one.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AccountSection({ activeTab }: { activeTab: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const businessId = user?.businessId;

  const { data: business } = useQuery<any>({
    queryKey: ['/api/business'],
    enabled: !!businessId,
  });

  // Refresh Retell AI Assistant
  const refreshAssistantMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/retell/refresh/${businessId}`);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "AI Assistant Updated", description: "Your AI receptionist has been refreshed with the latest configuration." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to refresh AI assistant. Please try again.", variant: "destructive" });
    },
  });

  if (activeTab === "security") {
    return (
      <div className="space-y-4">
        <TwoFactorSetup />

        {(user?.role === 'admin' || user?.role === 'owner') && businessId && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Audit Log
              </CardTitle>
              <CardDescription>
                Track security events and changes made to your account and business
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AuditLog businessId={businessId} />
            </CardContent>
          </Card>
        )}

        <ActiveSessionsCard />
      </div>
    );
  }

  if (activeTab === "agent-insights" && (user?.role === 'admin' || user?.role === 'owner')) {
    return (
      <div className="space-y-4">
        <AgentInsights />
      </div>
    );
  }

  if (activeTab === "privacy") {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Data Retention</CardTitle>
            <CardDescription>
              Configure how long call recordings and transcripts are kept
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium">Call Recording Retention</label>
              <Select
                value={String(business?.callRecordingRetentionDays || 90)}
                onValueChange={async (value) => {
                  try {
                    await apiRequest("PUT", `/api/business/${businessId}`, {
                      callRecordingRetentionDays: parseInt(value),
                    });
                    queryClient.invalidateQueries({ queryKey: ['/api/business'] });
                    toast({ title: "Recording retention updated" });
                  } catch (error: any) {
                    toast({
                      title: "Error",
                      description: error.message || "Failed to update retention",
                      variant: "destructive",
                    });
                  }
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="30">30 days</SelectItem>
                  <SelectItem value="90">90 days</SelectItem>
                  <SelectItem value="180">180 days</SelectItem>
                  <SelectItem value="365">1 year</SelectItem>
                  <SelectItem value="730">2 years</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                Call recordings older than this will be automatically deleted
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Transcript & Data Retention</label>
              <Select
                value={String(business?.dataRetentionDays || 365)}
                onValueChange={async (value) => {
                  try {
                    await apiRequest("PUT", `/api/business/${businessId}`, {
                      dataRetentionDays: parseInt(value),
                    });
                    queryClient.invalidateQueries({ queryKey: ['/api/business'] });
                    toast({ title: "Data retention updated" });
                  } catch (error: any) {
                    toast({
                      title: "Error",
                      description: error.message || "Failed to update retention",
                      variant: "destructive",
                    });
                  }
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="90">90 days</SelectItem>
                  <SelectItem value="180">180 days</SelectItem>
                  <SelectItem value="365">1 year</SelectItem>
                  <SelectItem value="730">2 years</SelectItem>
                  <SelectItem value="0">Indefinite</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                Call transcripts and other data older than this will be automatically purged
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Data Export</CardTitle>
            <CardDescription>
              Download a copy of all your data (CCPA compliance)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              className="flex items-center gap-2"
              onClick={async () => {
                try {
                  const response = await apiRequest("POST", "/api/account/export");
                  const data = await response.json();
                  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `data-export-${new Date().toISOString().split('T')[0]}.json`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                  toast({ title: "Data exported successfully" });
                } catch (error: any) {
                  toast({
                    title: "Export failed",
                    description: error.message || "Failed to export data",
                    variant: "destructive",
                  });
                }
              }}
            >
              <Download className="h-4 w-4" />
              Export My Data
            </Button>
          </CardContent>
        </Card>

        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Danger Zone
            </CardTitle>
            <CardDescription>
              Permanently delete your account and all associated data. This action cannot be undone.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive">
                  Delete My Account
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete your account, all business data, customers, appointments,
                    call logs, invoices, and release all provisioned phone numbers. This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="my-4">
                  <Input
                    type="password"
                    placeholder="Enter your password to confirm"
                    id="delete-account-password"
                  />
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={async () => {
                      const password = (document.getElementById('delete-account-password') as HTMLInputElement)?.value;
                      if (!password) {
                        toast({
                          title: "Password required",
                          description: "Please enter your password to confirm account deletion",
                          variant: "destructive",
                        });
                        return;
                      }
                      try {
                        await apiRequest("POST", "/api/account/delete", { password });
                        toast({ title: "Account deleted" });
                        window.location.href = "/auth";
                      } catch (error: any) {
                        toast({
                          title: "Deletion failed",
                          description: error.message || "Failed to delete account",
                          variant: "destructive",
                        });
                      }
                    }}
                  >
                    Delete Account
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <p className="text-sm text-muted-foreground">
              Before deleting, consider exporting your data first using the button above.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Default: pwa tab
  return (
    <div className="space-y-4">
      {/* AI Receptionist Refresh Card */}
      {(business?.retellAgentId || business?.vapiAssistantId) && (
        <Card>
          <CardHeader>
            <CardTitle>AI Receptionist Configuration</CardTitle>
            <CardDescription>
              Manage your AI receptionist settings and sync configuration
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
              <div>
                <h4 className="font-medium">Refresh AI Assistant</h4>
                <p className="text-sm text-muted-foreground">
                  Update your AI receptionist with the latest business info, services, and hours
                </p>
              </div>
              <Button
                onClick={() => refreshAssistantMutation.mutate()}
                disabled={refreshAssistantMutation.isPending}
                variant="outline"
              >
                {refreshAssistantMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Refreshing...
                  </>
                ) : (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Refresh Assistant
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Install SmallBizAgent as an App</CardTitle>
          <CardDescription>
            Install SmallBizAgent on your device for a better experience
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col md:flex-row gap-6">
            <div className="flex-1 rounded-lg border bg-card p-6 shadow-sm">
              <div className="flex flex-col space-y-2">
                <h3 className="font-semibold text-lg">Why install SmallBizAgent?</h3>
                <ul className="space-y-2 text-sm text-muted-foreground list-disc list-inside">
                  <li>Works offline when you don't have internet</li>
                  <li>Faster loading times and better performance</li>
                  <li>App-like experience without app store downloads</li>
                  <li>Automatic updates with new features</li>
                  <li>Easier access from your home screen</li>
                </ul>
              </div>
            </div>
            <div className="flex-1 rounded-lg border bg-card p-6 shadow-sm">
              <div className="flex flex-col space-y-2">
                <h3 className="font-semibold text-lg">Available on all platforms</h3>
                <ul className="space-y-2 text-sm text-muted-foreground list-disc list-inside">
                  <li>iOS - iPhone and iPad using Safari</li>
                  <li>Android - phones and tablets using Chrome</li>
                  <li>Windows - using Chrome or Edge</li>
                  <li>macOS - using Chrome, Edge, or Safari</li>
                  <li>Linux - using Chrome or Edge</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="flex justify-center">
            <Button
              onClick={() => window.location.href = '/settings/pwa-installation'}
              className="py-2 px-4"
            >
              View Installation Instructions
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
