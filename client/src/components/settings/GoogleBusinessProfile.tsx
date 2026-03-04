import { useEffect, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  Loader2, CheckCircle2, ExternalLink, MapPin, Building2, Link2, AlertCircle, XCircle, Phone, PhoneForwarded, Undo2,
} from 'lucide-react';
import { queryClient } from '@/lib/queryClient';

interface GBPAccount {
  name: string;
  accountName: string;
  type: string;
  role: string;
}

interface GBPLocation {
  name: string;
  title: string;
  address?: any;
  websiteUri?: string;
}

interface GBPStoredData {
  selectedAccount?: GBPAccount;
  selectedLocation?: GBPLocation;
  bookingLinkName?: string;
  originalPhone?: string;
  aiPhoneSet?: boolean;
}

interface GBPPhoneData {
  primaryPhone?: string;
  additionalPhones?: string[];
  aiPhoneSet: boolean;
  originalPhone: string | null;
}

interface GBPStatus {
  connected: boolean;
  data: GBPStoredData | null;
}

interface GoogleBusinessProfileProps {
  businessId: number;
  bookingEnabled?: boolean;
  bookingSlug?: string;
  twilioPhoneNumber?: string | null;
}

export function GoogleBusinessProfile({ businessId, bookingEnabled, bookingSlug, twilioPhoneNumber }: GoogleBusinessProfileProps) {
  const { toast } = useToast();
  const [selectedAccountName, setSelectedAccountName] = useState<string>('');
  const [selectedLocation, setSelectedLocation] = useState<string>('');

  // Listen for OAuth callback messages from popup
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'gbp-connected') {
        queryClient.invalidateQueries({ queryKey: ['/api/gbp/status', businessId] });
        toast({
          title: 'Google Business Profile Connected!',
          description: 'You can now select your business location and set a booking link.',
        });
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [businessId, toast]);

  // Get connection status
  const { data: status, isLoading: statusLoading } = useQuery<GBPStatus>({
    queryKey: ['/api/gbp/status', businessId],
    queryFn: async () => {
      const res = await fetch(`/api/gbp/status/${businessId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch GBP status');
      return res.json();
    },
  });

  // Get OAuth URL
  const { data: authData } = useQuery<{ url: string }>({
    queryKey: ['/api/gbp/auth-url', businessId],
    queryFn: async () => {
      const res = await fetch(`/api/gbp/auth-url/${businessId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch auth URL');
      return res.json();
    },
    enabled: !!status && !status.connected,
  });

  // Fetch accounts (only when connected and no location selected yet)
  const { data: accounts, isLoading: accountsLoading, error: accountsError } = useQuery<GBPAccount[]>({
    queryKey: ['/api/gbp/accounts', businessId],
    queryFn: async () => {
      const res = await fetch(`/api/gbp/accounts/${businessId}`, { credentials: 'include' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to fetch accounts');
      }
      return res.json();
    },
    enabled: !!status?.connected && !status?.data?.selectedLocation,
  });

  // Fetch locations for selected account
  const { data: locations, isLoading: locationsLoading } = useQuery<GBPLocation[]>({
    queryKey: ['/api/gbp/locations', businessId, selectedAccountName],
    queryFn: async () => {
      const res = await fetch(
        `/api/gbp/locations/${businessId}?account=${encodeURIComponent(selectedAccountName)}`,
        { credentials: 'include' }
      );
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to fetch locations');
      }
      return res.json();
    },
    enabled: !!selectedAccountName && !!status?.connected,
  });

  // Set booking link mutation
  const setBookingLinkMutation = useMutation({
    mutationFn: async () => {
      const account = accounts?.find(a => a.name === selectedAccountName);
      const location = locations?.find(l => l.name === selectedLocation);
      if (!account || !location) throw new Error('Please select an account and location');

      const res = await fetch(`/api/gbp/set-booking-link/${businessId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          locationName: selectedLocation,
          account,
          location,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to set booking link');
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/gbp/status', businessId] });
      toast({
        title: 'Booking Link Set!',
        description: `Your booking page is now linked on Google: ${data.bookingUrl}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Disconnect mutation
  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/gbp/${businessId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to disconnect');
      }
      return res.json();
    },
    onSuccess: () => {
      setSelectedAccountName('');
      setSelectedLocation('');
      queryClient.invalidateQueries({ queryKey: ['/api/gbp/status', businessId] });
      toast({
        title: 'Disconnected',
        description: 'Google Business Profile has been disconnected.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Fetch phone numbers for the connected location
  const { data: phoneData, isLoading: phoneLoading } = useQuery<GBPPhoneData>({
    queryKey: ['/api/gbp/phone-numbers', businessId],
    queryFn: async () => {
      const res = await fetch(`/api/gbp/phone-numbers/${businessId}`, { credentials: 'include' });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to fetch phone numbers');
      }
      return res.json();
    },
    enabled: !!status?.connected && !!status?.data?.selectedLocation,
  });

  // Set AI phone number mutation
  const setAIPhoneMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/gbp/set-ai-phone/${businessId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to set AI phone number');
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/gbp/phone-numbers', businessId] });
      queryClient.invalidateQueries({ queryKey: ['/api/gbp/status', businessId] });
      toast({
        title: 'Phone Number Updated!',
        description: `Your Google listing now shows ${data.aiPhoneNumber}. Original number saved.`,
      });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  // Restore original phone mutation
  const restorePhoneMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/gbp/restore-phone/${businessId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to restore phone number');
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/gbp/phone-numbers', businessId] });
      queryClient.invalidateQueries({ queryKey: ['/api/gbp/status', businessId] });
      toast({
        title: 'Phone Number Restored',
        description: `Your Google listing is back to ${data.restoredPhone}`,
      });
    },
    onError: (error: Error) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    },
  });

  const handleConnect = () => {
    if (authData?.url) {
      window.open(authData.url, '_blank', 'width=600,height=700');
    }
  };

  const handleDisconnect = () => {
    if (confirm('Are you sure you want to disconnect Google Business Profile? This will remove the booking link from your Google listing.')) {
      disconnectMutation.mutate();
    }
  };

  // Loading state
  if (statusLoading) {
    return (
      <div className="flex items-center justify-center p-6">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Booking not enabled guard
  if (!bookingEnabled || !bookingSlug) {
    return (
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          Enable online booking and set a booking slug in your{' '}
          <a href="/settings" className="underline font-medium">Booking Settings</a>{' '}
          before connecting Google Business Profile.
        </AlertDescription>
      </Alert>
    );
  }

  const isLinkActive = status?.connected && status?.data?.selectedLocation && status?.data?.bookingLinkName;
  const hasError = accountsError as Error | null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-blue-600" />
            <div>
              <CardTitle className="text-lg">Google Business Profile</CardTitle>
              <CardDescription>
                Add a booking link to your Google Search and Maps listing
              </CardDescription>
            </div>
          </div>
          {status?.connected && (
            <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Connected
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Error from API (e.g., API not enabled) */}
        {hasError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{hasError.message}</AlertDescription>
          </Alert>
        )}

        {status?.connected ? (
          <>
            {/* Link is active — show success state */}
            {isLinkActive ? (
              <div className="space-y-4">
                {/* Booking link status */}
                <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200">
                  <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium text-green-800 dark:text-green-200">Booking link is active</p>
                    <div className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
                      <MapPin className="h-3 w-3 flex-shrink-0" />
                      <span className="truncate">{status.data!.selectedLocation!.title}</span>
                    </div>
                    <div className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
                      <Link2 className="h-3 w-3 flex-shrink-0" />
                      <span className="truncate">smallbizagent.ai/book/{bookingSlug}</span>
                    </div>
                  </div>
                </div>

                {/* Phone Number Management */}
                <div className="p-4 rounded-lg border bg-card">
                  <div className="flex items-center gap-2 mb-3">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <h4 className="font-medium text-sm">Google Listing Phone Number</h4>
                  </div>

                  {phoneLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading phone info...
                    </div>
                  ) : phoneData?.aiPhoneSet ? (
                    /* AI phone is active */
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 p-3 bg-indigo-50 dark:bg-indigo-950/30 rounded-lg border border-indigo-200">
                        <PhoneForwarded className="h-5 w-5 text-indigo-600 flex-shrink-0" />
                        <div>
                          <p className="font-medium text-indigo-800 dark:text-indigo-200 text-sm">
                            AI Receptionist number is live on Google
                          </p>
                          <p className="text-xs text-indigo-600 dark:text-indigo-400">
                            Callers from Google Search & Maps reach your AI receptionist
                          </p>
                          {phoneData.originalPhone && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Original number ({phoneData.originalPhone}) saved as additional
                            </p>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => restorePhoneMutation.mutate()}
                        disabled={restorePhoneMutation.isPending}
                      >
                        {restorePhoneMutation.isPending ? (
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        ) : (
                          <Undo2 className="h-4 w-4 mr-1" />
                        )}
                        Restore Original Number
                      </Button>
                    </div>
                  ) : (
                    /* AI phone not set yet */
                    <div className="space-y-3">
                      {phoneData?.primaryPhone && (
                        <p className="text-sm text-muted-foreground">
                          Current Google listing number: <span className="font-medium text-foreground">{phoneData.primaryPhone}</span>
                        </p>
                      )}
                      {twilioPhoneNumber ? (
                        <>
                          <p className="text-sm text-muted-foreground">
                            Replace your Google listing phone number with your AI receptionist number
                            (<span className="font-medium text-foreground">{twilioPhoneNumber}</span>).
                            Anyone who finds your business on Google will call your AI directly.
                            {phoneData?.primaryPhone && ' Your current number will be saved so you can restore it anytime.'}
                          </p>
                          <Button
                            size="sm"
                            onClick={() => setAIPhoneMutation.mutate()}
                            disabled={setAIPhoneMutation.isPending}
                          >
                            {setAIPhoneMutation.isPending ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <PhoneForwarded className="h-4 w-4 mr-2" />
                            )}
                            Set AI Receptionist as Google Number
                          </Button>
                        </>
                      ) : (
                        <p className="text-sm text-amber-600 dark:text-amber-400">
                          Provision an AI receptionist phone number first to use this feature.
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDisconnect}
                    disabled={disconnectMutation.isPending}
                  >
                    {disconnectMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                    Disconnect
                  </Button>
                </div>
              </div>
            ) : (
              /* Connected but no location selected — show selection flow */
              <div className="space-y-4">
                {/* Account selection */}
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Select your Google Business account</label>
                  {accountsLoading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading accounts...
                    </div>
                  ) : accounts && accounts.length > 0 ? (
                    <Select value={selectedAccountName} onValueChange={(val) => {
                      setSelectedAccountName(val);
                      setSelectedLocation('');
                    }}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose an account..." />
                      </SelectTrigger>
                      <SelectContent>
                        {accounts.map((account) => (
                          <SelectItem key={account.name} value={account.name}>
                            {account.accountName || account.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : !hasError ? (
                    <p className="text-sm text-muted-foreground">
                      No Google Business accounts found. Make sure you have a Google Business Profile set up.
                    </p>
                  ) : null}
                </div>

                {/* Location selection */}
                {selectedAccountName && (
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Select your business location</label>
                    {locationsLoading ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading locations...
                      </div>
                    ) : locations && locations.length > 0 ? (
                      <Select value={selectedLocation} onValueChange={setSelectedLocation}>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose a location..." />
                        </SelectTrigger>
                        <SelectContent>
                          {locations.map((location) => (
                            <SelectItem key={location.name} value={location.name}>
                              <div className="flex items-center gap-2">
                                <MapPin className="h-3 w-3" />
                                {location.title}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No locations found for this account.
                      </p>
                    )}
                  </div>
                )}

                {/* Set booking link button */}
                {selectedLocation && (
                  <div className="pt-2">
                    <p className="text-sm text-muted-foreground mb-2">
                      This will add a "Book Appointment" button to your Google listing pointing to:{' '}
                      <span className="font-medium">smallbizagent.ai/book/{bookingSlug}</span>
                    </p>
                    <Button
                      onClick={() => setBookingLinkMutation.mutate()}
                      disabled={setBookingLinkMutation.isPending}
                    >
                      {setBookingLinkMutation.isPending ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Setting up...
                        </>
                      ) : (
                        <>
                          <Link2 className="h-4 w-4 mr-2" />
                          Set Booking Link
                        </>
                      )}
                    </Button>
                  </div>
                )}

                {/* Disconnect option */}
                <div className="pt-2 border-t">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleDisconnect}
                    disabled={disconnectMutation.isPending}
                    className="text-muted-foreground"
                  >
                    {disconnectMutation.isPending && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                    Disconnect Google Business Profile
                  </Button>
                </div>
              </div>
            )}
          </>
        ) : (
          /* Not connected */
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-muted-foreground">
              <XCircle className="h-5 w-5" />
              <span>Not connected</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Connect your Google Business Profile to add a booking link directly on your Google Search and Maps listing.
              Customers will see a "Book Appointment" button that links to your SmallBizAgent booking page.
            </p>
            <Button
              onClick={handleConnect}
              disabled={!authData?.url}
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Connect Google Business Profile
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
