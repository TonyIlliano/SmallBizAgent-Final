import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2, RefreshCw, CheckCircle2, Unplug, CreditCard, KeyRound } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface HeartlandIntegrationProps {
  businessId: number;
}

const HeartlandIntegration = ({ businessId }: HeartlandIntegrationProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [apiKey, setApiKey] = useState("");

  // Check Heartland connection status
  const {
    data: heartlandStatus,
    isLoading: isStatusLoading,
  } = useQuery({
    queryKey: ['/api/heartland/status', businessId],
    queryFn: () =>
      apiRequest('GET', `/api/heartland/status?businessId=${businessId}`)
        .then(res => res.json()),
    enabled: !!businessId,
  });

  // Check if Heartland partner key is configured
  const { data: heartlandConfig } = useQuery({
    queryKey: ['/api/heartland/check-config'],
    queryFn: () =>
      apiRequest('GET', '/api/heartland/check-config')
        .then(res => res.json()),
  });

  // Connect mutation
  const connectMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/heartland/connect', {
        businessId: String(businessId),
        apiKey: apiKey.trim(),
      }).then(res => res.json());
    },
    onSuccess: () => {
      toast({
        title: "Heartland Connected",
        description: "Your Heartland POS has been connected and the menu is syncing.",
      });
      setApiKey("");
      queryClient.invalidateQueries({ queryKey: ['/api/heartland/status', businessId] });
    },
    onError: (error: any) => {
      toast({
        title: "Connection Failed",
        description: error.message || "Invalid API key or connection error. Please check your key and try again.",
        variant: "destructive",
      });
    },
  });

  // Sync menu mutation
  const syncMenuMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/heartland/sync-menu', { businessId: String(businessId) })
        .then(res => res.json());
    },
    onSuccess: (data) => {
      toast({
        title: "Menu Synced",
        description: `Successfully synced ${data.categories} categories with ${data.items} items from Heartland.`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/heartland/status', businessId] });
    },
    onError: (error: any) => {
      toast({
        title: "Sync Failed",
        description: error.message || "Failed to sync menu from Heartland. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Disconnect mutation
  const disconnectMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/heartland/disconnect', { businessId: String(businessId) })
        .then(res => res.json());
    },
    onSuccess: () => {
      toast({
        title: "Heartland Disconnected",
        description: "Your Heartland POS has been disconnected.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/heartland/status', businessId] });
    },
    onError: (error: any) => {
      toast({
        title: "Disconnection Failed",
        description: error.message || "Failed to disconnect Heartland.",
        variant: "destructive",
      });
    },
  });

  if (isStatusLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isConnected = heartlandStatus?.connected;
  const isConfigured = heartlandConfig?.configured;

  return (
    <div className="space-y-4">
      {/* Connection Status */}
      <div className="flex items-center justify-between p-4 border rounded-lg">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isConnected ? 'bg-green-100' : 'bg-gray-100'}`}>
            <CreditCard className={`w-5 h-5 ${isConnected ? 'text-green-600' : 'text-gray-400'}`} />
          </div>
          <div>
            <h4 className="font-medium">Heartland POS</h4>
            <p className="text-sm text-muted-foreground">
              {isConnected
                ? `Connected: ${heartlandStatus.locationName || 'Heartland Restaurant'}`
                : 'Connect your Heartland POS for AI phone ordering'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isConnected ? (
            <Badge variant="outline" className="border-green-500 text-green-600">
              <CheckCircle2 className="w-3 h-3 mr-1" />
              Connected
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              Not Connected
            </Badge>
          )}
        </div>
      </div>

      {/* Not configured warning */}
      {!isConfigured && (
        <div className="p-4 border border-yellow-200 bg-yellow-50 rounded-lg">
          <p className="text-sm text-yellow-800">
            <strong>Heartland integration not configured.</strong> The HEARTLAND_PARTNER_KEY environment variable must be set to enable this integration.
          </p>
        </div>
      )}

      {/* Connected State */}
      {isConnected && (
        <div className="space-y-3">
          {/* Menu Sync Info */}
          <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/30">
            <div>
              <p className="text-sm font-medium">Menu Cache</p>
              <p className="text-xs text-muted-foreground">
                {heartlandStatus.lastMenuSync
                  ? `Last synced: ${new Date(heartlandStatus.lastMenuSync).toLocaleString()} (${heartlandStatus.menuItemCount} items)`
                  : 'Not synced yet'}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => syncMenuMutation.mutate()}
              disabled={syncMenuMutation.isPending}
            >
              {syncMenuMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-1" />
              )}
              Sync Menu
            </Button>
          </div>

          {/* Disconnect Button */}
          <div className="flex justify-end pt-2">
            <Button
              variant="destructive"
              size="sm"
              onClick={() => disconnectMutation.mutate()}
              disabled={disconnectMutation.isPending}
            >
              {disconnectMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <Unplug className="w-4 h-4 mr-1" />
              )}
              Disconnect Heartland
            </Button>
          </div>
        </div>
      )}

      {/* Not Connected State — API Key Input */}
      {!isConnected && isConfigured && (
        <div className="space-y-3 py-4">
          <p className="text-sm text-muted-foreground">
            Enter your Heartland restaurant API key to enable AI-powered phone ordering.
            Your menu will be synced automatically and the AI receptionist will take orders
            that go directly to your POS. You can get this key from your Heartland representative.
          </p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                type="password"
                placeholder="Enter Heartland API key..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="pl-10"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && apiKey.trim()) {
                    connectMutation.mutate();
                  }
                }}
              />
            </div>
            <Button
              onClick={() => connectMutation.mutate()}
              disabled={!apiKey.trim() || connectMutation.isPending}
            >
              {connectMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <CreditCard className="w-4 h-4 mr-2" />
              )}
              Connect
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default HeartlandIntegration;
