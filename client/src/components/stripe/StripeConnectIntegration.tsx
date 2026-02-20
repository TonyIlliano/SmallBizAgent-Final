import { useQuery, useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import {
  Loader2,
  CheckCircle,
  AlertTriangle,
  ExternalLink,
  CreditCard,
  ArrowRight,
  Shield,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';

type ConnectStatus = {
  status: string;
  accountId: string | null;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
};

export function StripeConnectIntegration() {
  const { toast } = useToast();

  // Get current Connect status
  const {
    data: connectStatus,
    isLoading,
    error,
  } = useQuery<ConnectStatus>({
    queryKey: ['/api/stripe-connect/status'],
    refetchInterval: (query) => {
      // Poll more frequently during onboarding
      const data = query.state.data;
      if (data?.status === 'onboarding' || data?.status === 'pending_verification') {
        return 10000; // 10 seconds
      }
      return false;
    },
  });

  // Start onboarding mutation
  const onboardMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/stripe-connect/onboard');
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to start onboarding');
      }
      return res.json();
    },
    onSuccess: (data: { url: string }) => {
      // Redirect to Stripe-hosted onboarding
      window.location.href = data.url;
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Get dashboard link mutation
  const dashboardMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('GET', '/api/stripe-connect/dashboard-link');
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || 'Failed to get dashboard link');
      }
      return res.json();
    },
    onSuccess: (data: { url: string }) => {
      window.open(data.url, '_blank');
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Handle Stripe Connect return/refresh from URL params
  const urlParams = new URLSearchParams(window.location.search);
  const stripeConnectParam = urlParams.get('stripe_connect');

  if (stripeConnectParam === 'return') {
    // User returned from Stripe onboarding — refresh status
    queryClient.invalidateQueries({ queryKey: ['/api/stripe-connect/status'] });
    // Clean URL
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.delete('stripe_connect');
    window.history.replaceState({}, '', newUrl.toString());
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>
          {error instanceof Error ? error.message : 'Failed to load payment settings'}
        </AlertDescription>
      </Alert>
    );
  }

  const status = connectStatus?.status || 'not_connected';

  return (
    <div className="space-y-6">
      {/* Status Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <CreditCard className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-lg">Stripe Payments</CardTitle>
                <CardDescription>
                  Accept online payments from your customers
                </CardDescription>
              </div>
            </div>
            <StatusBadge status={status} />
          </div>
        </CardHeader>
        <CardContent>
          {status === 'not_connected' && (
            <NotConnectedState onConnect={() => onboardMutation.mutate()} isLoading={onboardMutation.isPending} />
          )}

          {status === 'onboarding' && (
            <OnboardingState onContinue={() => onboardMutation.mutate()} isLoading={onboardMutation.isPending} />
          )}

          {status === 'pending_verification' && (
            <PendingVerificationState />
          )}

          {status === 'active' && (
            <ActiveState
              onOpenDashboard={() => dashboardMutation.mutate()}
              isDashboardLoading={dashboardMutation.isPending}
              chargesEnabled={connectStatus?.chargesEnabled || false}
              payoutsEnabled={connectStatus?.payoutsEnabled || false}
            />
          )}
        </CardContent>
      </Card>

      {/* Info section */}
      <Alert>
        <Shield className="h-4 w-4" />
        <AlertTitle>How payments work</AlertTitle>
        <AlertDescription>
          <ul className="list-disc list-inside space-y-1 mt-2 text-sm">
            <li>Customer payments go directly to your Stripe account</li>
            <li>A 2.5% platform fee is automatically deducted per transaction</li>
            <li>You manage payouts, refunds, and disputes through your Stripe dashboard</li>
            <li>If Stripe isn't connected, customers will see "payments not available" on invoices</li>
          </ul>
        </AlertDescription>
      </Alert>
    </div>
  );
}

// Status badge component
function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'active':
      return (
        <Badge variant="default" className="bg-green-600 hover:bg-green-700">
          <CheckCircle className="h-3 w-3 mr-1" />
          Connected
        </Badge>
      );
    case 'onboarding':
      return (
        <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 hover:bg-yellow-200">
          <AlertTriangle className="h-3 w-3 mr-1" />
          Setup Incomplete
        </Badge>
      );
    case 'pending_verification':
      return (
        <Badge variant="secondary" className="bg-blue-100 text-blue-800 hover:bg-blue-200">
          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
          Pending Verification
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className="text-muted-foreground">
          Not Connected
        </Badge>
      );
  }
}

// Not Connected state
function NotConnectedState({ onConnect, isLoading }: { onConnect: () => void; isLoading: boolean }) {
  return (
    <div className="text-center py-6">
      <div className="mx-auto h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
        <CreditCard className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold mb-2">Accept Online Payments</h3>
      <p className="text-muted-foreground mb-6 max-w-md mx-auto">
        Connect your Stripe account to start accepting credit card and debit card payments from your customers.
        Setup takes about 5 minutes.
      </p>
      <Button onClick={onConnect} disabled={isLoading} size="lg">
        {isLoading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <ArrowRight className="mr-2 h-4 w-4" />
        )}
        Connect Stripe Account
      </Button>
      <p className="text-xs text-muted-foreground mt-3">
        You'll be redirected to Stripe to complete the secure setup process
      </p>
    </div>
  );
}

// Onboarding incomplete state
function OnboardingState({ onContinue, isLoading }: { onContinue: () => void; isLoading: boolean }) {
  return (
    <div className="space-y-4">
      <Alert className="border-yellow-200 bg-yellow-50">
        <AlertTriangle className="h-4 w-4 text-yellow-600" />
        <AlertTitle className="text-yellow-800">Setup Incomplete</AlertTitle>
        <AlertDescription className="text-yellow-700">
          You started connecting your Stripe account but haven't finished yet.
          Complete the setup to start accepting payments.
        </AlertDescription>
      </Alert>
      <Button onClick={onContinue} disabled={isLoading}>
        {isLoading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <ArrowRight className="mr-2 h-4 w-4" />
        )}
        Continue Setup
      </Button>
    </div>
  );
}

// Pending verification state
function PendingVerificationState() {
  return (
    <div className="space-y-4">
      <Alert className="border-blue-200 bg-blue-50">
        <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />
        <AlertTitle className="text-blue-800">Verification in Progress</AlertTitle>
        <AlertDescription className="text-blue-700">
          Stripe is verifying your account information. This usually takes a few minutes
          but can take up to 24 hours. You'll be able to accept payments once verification is complete.
        </AlertDescription>
      </Alert>
    </div>
  );
}

// Active / Connected state
function ActiveState({
  onOpenDashboard,
  isDashboardLoading,
  chargesEnabled,
  payoutsEnabled,
}: {
  onOpenDashboard: () => void;
  isDashboardLoading: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 p-4 rounded-lg bg-green-50 border border-green-200">
        <CheckCircle className="h-6 w-6 text-green-600 flex-shrink-0" />
        <div>
          <p className="font-medium text-green-800">Stripe is connected and active</p>
          <p className="text-sm text-green-700">
            Your customers can pay invoices online. Payments go directly to your Stripe account.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-center gap-2 p-3 rounded-lg border">
          <CheckCircle className={`h-4 w-4 ${chargesEnabled ? 'text-green-600' : 'text-muted-foreground'}`} />
          <span className="text-sm">Card payments {chargesEnabled ? 'enabled' : 'pending'}</span>
        </div>
        <div className="flex items-center gap-2 p-3 rounded-lg border">
          <CheckCircle className={`h-4 w-4 ${payoutsEnabled ? 'text-green-600' : 'text-muted-foreground'}`} />
          <span className="text-sm">Payouts {payoutsEnabled ? 'enabled' : 'pending'}</span>
        </div>
      </div>

      <Button onClick={onOpenDashboard} disabled={isDashboardLoading} variant="outline">
        {isDashboardLoading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <ExternalLink className="mr-2 h-4 w-4" />
        )}
        Open Stripe Dashboard
      </Button>
    </div>
  );
}
