import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Loader2,
  Store,
  Utensils,
  Phone,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react';

interface CloverSetupProps {
  onComplete: () => void;
  onSkip?: () => void;
}

export default function CloverSetup({ onComplete, onSkip }: CloverSetupProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const businessId = user?.businessId;

  // Check if Clover API is configured on the server
  const { data: cloverConfig } = useQuery<{ configured: boolean }>({
    queryKey: ['/api/integrations/clover/config'],
    enabled: !!businessId,
  });

  // Check current Clover connection status
  const { data: cloverStatus } = useQuery<{
    connected: boolean;
    merchantId?: string;
    menuItemCount?: number;
  }>({
    queryKey: [`/api/integrations/clover/status/${businessId}`],
    enabled: !!businessId,
  });

  const isConnected = cloverStatus?.connected;

  const handleConnect = () => {
    if (!businessId) return;
    // Redirect to Clover OAuth - the server will handle the redirect
    window.location.href = `/api/integrations/clover/auth?businessId=${businessId}`;
  };

  const skipSetup = () => {
    toast({
      title: 'Step skipped',
      description: 'You can connect Clover POS later in Settings > Integrations',
      variant: 'default',
    });

    if (onSkip) {
      onSkip();
    } else {
      onComplete();
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 mb-4">
          <Utensils className="h-8 w-8 text-green-600" />
        </div>
        <h2 className="text-2xl font-bold">Connect Your POS System</h2>
        <p className="text-muted-foreground mt-2">
          Connect your Clover POS to enable AI-powered phone ordering for your restaurant
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center">
              <Store className="mr-2 h-4 w-4 text-green-600" />
              Menu Sync
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Your Clover menu automatically syncs so the AI always has your latest items and prices
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center">
              <Phone className="mr-2 h-4 w-4 text-blue-600" />
              AI Phone Orders
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Customers call your business and the AI reads the menu and takes their order
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center">
              <ArrowRight className="mr-2 h-4 w-4 text-purple-600" />
              Direct to POS
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Orders appear directly on your Clover POS device — no manual entry needed
            </p>
          </CardContent>
        </Card>
      </div>

      {isConnected ? (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-6 flex items-center justify-center space-x-3">
            <CheckCircle2 className="h-6 w-6 text-green-600" />
            <div>
              <p className="font-medium text-green-900">Clover POS Connected!</p>
              <p className="text-sm text-green-700">
                {cloverStatus?.menuItemCount
                  ? `${cloverStatus.menuItemCount} menu items synced`
                  : 'Your menu has been synced'}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="p-3 rounded-full bg-green-100">
                <Store className="h-8 w-8 text-green-600" />
              </div>
              <div>
                <h3 className="font-medium text-lg">Connect to Clover</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  You'll be redirected to Clover to authorize access. Your menu will sync automatically.
                </p>
              </div>
              {cloverConfig?.configured === false ? (
                <p className="text-sm text-amber-600">
                  Clover integration is not configured yet. Contact support or set it up in Settings later.
                </p>
              ) : (
                <Button
                  onClick={handleConnect}
                  size="lg"
                  className="gap-2 bg-green-600 hover:bg-green-700"
                >
                  <Store className="h-4 w-4" />
                  Connect Clover POS
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-between pt-4">
        <Button
          type="button"
          variant="ghost"
          onClick={skipSetup}
        >
          Skip for Now
        </Button>
        {isConnected && (
          <Button onClick={onComplete} className="gap-1">
            Continue
            <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
