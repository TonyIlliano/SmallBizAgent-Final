import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, CheckCircle2, Unplug, Store } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

interface SquareIntegrationProps {
  businessId: number;
}

const SquareIntegration = ({ businessId }: SquareIntegrationProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isConnecting, setIsConnecting] = useState(false);

  // Check Square connection status
  const {
    data: squareStatus,
    isLoading: isStatusLoading,
  } = useQuery({
    queryKey: ['/api/square/status', businessId],
    queryFn: () =>
      apiRequest('GET', `/api/square/status?businessId=${businessId}`)
        .then(res => res.json()),
    enabled: !!businessId
  });

  // Check if Square is configured in environment
  const { data: squareConfig } = useQuery({
    queryKey: ['/api/square/check-config'],
    queryFn: () =>
      apiRequest('GET', '/api/square/check-config')
        .then(res => res.json()),
  });

  // Sync menu mutation
  const syncMenuMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/square/sync-menu', { businessId: String(businessId) })
        .then(res => res.json());
    },
    onSuccess: (data) => {
      toast({
        title: "Menu Synced",
        description: `Successfully synced ${data.categories} categories with ${data.items} items from Square.`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/square/status', businessId] });
    },
    onError: (error: any) => {
      toast({
        title: "Sync Failed",
        description: error.message || "Failed to sync menu from Square. Please try again.",
        variant: "destructive",
      });
    }
  });

  // Disconnect mutation
  const disconnectMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/square/disconnect', { businessId: String(businessId) })
        .then(res => res.json());
    },
    onSuccess: () => {
      toast({
        title: "Square Disconnected",
        description: "Your Square POS has been disconnected.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/square/status', businessId] });
    },
    onError: (error: any) => {
      toast({
        title: "Disconnection Failed",
        description: error.message || "Failed to disconnect Square.",
        variant: "destructive",
      });
    }
  });

  // Connect to Square
  const handleConnect = async () => {
    try {
      setIsConnecting(true);
      const response = await apiRequest('GET', `/api/square/auth-url?businessId=${businessId}&environment=sandbox`);
      const data = await response.json();

      if (data.authUrl) {
        window.location.href = data.authUrl;
      } else {
        throw new Error(data.error || "Failed to get authorization URL");
      }
    } catch (error: any) {
      toast({
        title: "Connection Failed",
        description: error.message || "Failed to connect to Square. Please try again.",
        variant: "destructive",
      });
      setIsConnecting(false);
    }
  };

  if (isStatusLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isConnected = squareStatus?.connected;
  const isConfigured = squareConfig?.configured;

  return (
    <div className="space-y-4">
      {/* Connection Status */}
      <div className="flex items-center justify-between p-4 border rounded-lg">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isConnected ? 'bg-green-100' : 'bg-blue-100'}`}>
            <Store className={`w-5 h-5 ${isConnected ? 'text-green-600' : 'text-blue-600'}`} />
          </div>
          <div>
            <h4 className="font-medium">Square for Restaurants</h4>
            <p className="text-sm text-muted-foreground">
              {isConnected
                ? `Connected to merchant ${squareStatus.merchantId}`
                : 'Connect your Square POS for AI phone ordering'}
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
            <strong>Square API not configured.</strong> Set SQUARE_APP_ID and SQUARE_APP_SECRET environment variables to enable the integration.
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
                {squareStatus.lastMenuSync
                  ? `Last synced: ${new Date(squareStatus.lastMenuSync).toLocaleString()} (${squareStatus.menuItemCount} items)`
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

          {/* Environment Info */}
          <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/30">
            <div>
              <p className="text-sm font-medium">Environment</p>
              <p className="text-xs text-muted-foreground">
                {squareStatus.environment === 'production' ? 'Production' : 'Sandbox (Testing)'}
              </p>
            </div>
          </div>

          {/* Location Info */}
          {squareStatus.locationId && (
            <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/30">
              <div>
                <p className="text-sm font-medium">Location</p>
                <p className="text-xs text-muted-foreground">
                  {squareStatus.locationId}
                </p>
              </div>
            </div>
          )}

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
              Disconnect Square
            </Button>
          </div>
        </div>
      )}

      {/* Not Connected State */}
      {!isConnected && isConfigured && (
        <div className="text-center py-4">
          <p className="text-sm text-muted-foreground mb-4">
            Connect your Square POS to enable AI-powered phone ordering.
            Your menu will be synced automatically and the AI receptionist will be able to
            take orders over the phone that go directly to your POS.
          </p>
          <Button
            onClick={handleConnect}
            disabled={isConnecting}
          >
            {isConnecting ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Store className="w-4 h-4 mr-2" />
            )}
            Connect Square POS
          </Button>
        </div>
      )}
    </div>
  );
};

export default SquareIntegration;
