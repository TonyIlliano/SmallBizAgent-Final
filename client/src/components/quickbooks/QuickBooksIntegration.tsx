import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, AlertTriangle, CheckCircle2, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";

interface QuickBooksIntegrationProps {
  businessId: number;
}

const QuickBooksIntegration = ({ businessId }: QuickBooksIntegrationProps) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [isConnectingToQuickBooks, setIsConnectingToQuickBooks] = useState(false);

  // Check if QuickBooks is configured on the server side
  const {
    data: qbStatus,
    isLoading: isStatusLoading,
    error: statusError,
    refetch: refetchStatus
  } = useQuery({
    queryKey: ['/api/quickbooks/status', businessId],
    queryFn: () => 
      apiRequest('GET', `/api/quickbooks/status?businessId=${businessId}`)
        .then(res => res.json()),
    enabled: !!businessId
  });

  // Mutation to disconnect QuickBooks
  const disconnectMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/quickbooks/disconnect', { businessId })
        .then(res => res.json());
    },
    onSuccess: () => {
      toast({
        title: "QuickBooks Disconnected",
        description: "Your QuickBooks account has been successfully disconnected.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/quickbooks/status', businessId] });
    },
    onError: (error: any) => {
      toast({
        title: "Disconnection Failed",
        description: error.message || "Failed to disconnect QuickBooks. Please try again.",
        variant: "destructive",
      });
    }
  });

  // Connect to QuickBooks
  const handleConnect = async () => {
    try {
      setIsConnectingToQuickBooks(true);
      const response = await apiRequest('GET', `/api/quickbooks/authorize?businessId=${businessId}`);
      const data = await response.json();
      
      if (data.success && data.authUrl) {
        window.location.href = data.authUrl;
      } else {
        throw new Error(data.error || "Failed to get authorization URL");
      }
    } catch (error: any) {
      toast({
        title: "Connection Failed",
        description: error.message || "Failed to connect to QuickBooks. Please try again.",
        variant: "destructive",
      });
      setIsConnectingToQuickBooks(false);
    }
  };

  // Handle disconnect
  const handleDisconnect = () => {
    disconnectMutation.mutate();
  };

  // Connection status indicators
  const getStatusIndicator = () => {
    if (!qbStatus) {
      return <Badge variant="outline" className="font-normal">Unknown</Badge>;
    }
    
    if (!qbStatus.configured) {
      return <Badge variant="destructive" className="font-normal">Not Configured</Badge>;
    }
    
    if (qbStatus.connected) {
      if (qbStatus.expired) {
        return <Badge variant="destructive" className="font-normal">Token Expired</Badge>;
      }
      return <Badge variant="secondary" className="bg-green-100 text-green-800 hover:bg-green-200 hover:text-green-900 font-normal">Connected</Badge>;
    }
    
    return <Badge variant="secondary" className="font-normal">Not Connected</Badge>;
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>QuickBooks Integration</CardTitle>
            <CardDescription>
              Connect to QuickBooks for invoicing and payment processing
            </CardDescription>
          </div>
          <div>{getStatusIndicator()}</div>
        </div>
      </CardHeader>
      <CardContent>
        {isStatusLoading ? (
          <div className="flex justify-center items-center py-4">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <span className="ml-2">Checking connection status...</span>
          </div>
        ) : statusError ? (
          <div className="flex items-center border rounded-md p-4 border-destructive bg-destructive/10">
            <AlertTriangle className="h-5 w-5 text-destructive mr-2" />
            <span>Failed to check QuickBooks connection status. Please refresh.</span>
          </div>
        ) : !qbStatus?.configured ? (
          <div className="flex items-center border rounded-md p-4 border-destructive bg-destructive/10">
            <AlertTriangle className="h-5 w-5 text-destructive mr-2" />
            <span>
              QuickBooks integration is not configured on the server. 
              Please contact the administrator to set up QuickBooks credentials.
            </span>
          </div>
        ) : qbStatus?.connected ? (
          <div>
            <div className="flex items-center border rounded-md p-4 border-primary bg-primary/10 mb-4">
              <CheckCircle2 className="h-5 w-5 text-primary mr-2" />
              <span>
                Your business is connected to QuickBooks. You can now sync invoices 
                and process payments through QuickBooks.
              </span>
            </div>
            {qbStatus.expired && (
              <div className="flex items-center border rounded-md p-4 border-destructive bg-destructive/10">
                <AlertTriangle className="h-5 w-5 text-destructive mr-2" />
                <span>
                  Your QuickBooks token has expired. Please reconnect your account.
                </span>
              </div>
            )}
            {qbStatus.expiresAt && (
              <p className="text-sm text-muted-foreground mt-2">
                Token expires: {new Date(qbStatus.expiresAt).toLocaleString()}
              </p>
            )}
          </div>
        ) : (
          <div className="flex items-center border rounded-md p-4 border-warning bg-warning/10">
            <AlertTriangle className="h-5 w-5 text-warning mr-2" />
            <span>
              Your business is not connected to QuickBooks. 
              Connect now to sync invoices and process payments.
            </span>
          </div>
        )}
      </CardContent>
      <CardFooter className="flex justify-between">
        {qbStatus?.connected ? (
          <>
            <Button
              variant="destructive"
              onClick={handleDisconnect}
              disabled={disconnectMutation.isPending}
            >
              {disconnectMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {disconnectMutation.isPending ? "Disconnecting..." : "Disconnect"}
            </Button>
            <Button
              variant="outline"
              onClick={() => refetchStatus()}
              disabled={isStatusLoading}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${isStatusLoading ? 'animate-spin' : ''}`} />
              Refresh Status
            </Button>
          </>
        ) : (
          <Button
            onClick={handleConnect}
            disabled={isConnectingToQuickBooks || !qbStatus?.configured}
          >
            {isConnectingToQuickBooks && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isConnectingToQuickBooks ? "Connecting..." : "Connect to QuickBooks"}
          </Button>
        )}
      </CardFooter>
    </Card>
  );
};

export default QuickBooksIntegration;