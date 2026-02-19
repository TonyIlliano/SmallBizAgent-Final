import { useEffect, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { Loader2, CheckCircle, XCircle, ExternalLink, Calendar } from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';

type CalendarStatus = {
  google: boolean;
  microsoft: boolean;
  apple: boolean;
};

type CalendarUrls = {
  google: string;
  microsoft: string;
  appleSubscription: string;
};

export function CalendarIntegration({ businessId }: { businessId: number }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  // Listen for OAuth callback messages from popup windows
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'calendar-connected') {
        queryClient.invalidateQueries({ queryKey: ['/api/calendar/status', businessId] });
        toast({
          title: 'Calendar Connected!',
          description: `Your ${event.data.provider} calendar is now syncing appointments automatically.`,
        });
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [businessId, toast]);

  // Get calendar integration status
  const {
    data: status,
    isLoading: statusLoading,
    error: statusError,
  } = useQuery<CalendarStatus>({
    queryKey: ['/api/calendar/status', businessId],
    queryFn: async () => {
      const res = await fetch(`/api/calendar/status/${businessId}`, {
        credentials: 'include',
      });
      
      if (!res.ok) {
        throw new Error('Failed to fetch calendar status');
      }
      
      return res.json();
    },
  });

  // Get calendar auth URLs
  const {
    data: urls,
    isLoading: urlsLoading,
    error: urlsError,
  } = useQuery<CalendarUrls>({
    queryKey: ['/api/calendar/auth-urls', businessId],
    queryFn: async () => {
      const res = await fetch(`/api/calendar/auth-urls/${businessId}`, {
        credentials: 'include',
      });
      
      if (!res.ok) {
        throw new Error('Failed to fetch calendar auth URLs');
      }
      
      return res.json();
    },
  });

  // Disconnect calendar provider
  const disconnectMutation = useMutation({
    mutationFn: async (provider: string) => {
      const res = await apiRequest('DELETE', `/api/calendar/${businessId}/${provider}`);
      
      if (!res.ok) {
        throw new Error(`Failed to disconnect ${provider} calendar`);
      }
      
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/calendar/status', businessId] });
      toast({
        title: 'Success',
        description: 'Calendar integration disconnected successfully',
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

  // Handle copy Apple Calendar subscription URL
  const handleCopyAppleUrl = async () => {
    if (urls?.appleSubscription) {
      try {
        // Get the Apple subscription URL
        const res = await fetch(`/api/calendar/apple/subscription/${businessId}`, {
          credentials: 'include',
        });
        
        if (!res.ok) {
          throw new Error('Failed to fetch Apple Calendar subscription URL');
        }
        
        const data = await res.json();
        
        // Copy to clipboard
        await navigator.clipboard.writeText(data.url);
        setCopied(true);
        
        toast({
          title: 'Success',
          description: 'Apple Calendar subscription URL copied to clipboard',
        });
        
        setTimeout(() => setCopied(false), 2000);
      } catch (error) {
        toast({
          title: 'Error',
          description: error instanceof Error ? error.message : 'Failed to copy URL',
          variant: 'destructive',
        });
      }
    }
  };

  // Handle connect calendar provider
  const handleConnect = (url: string) => {
    // Open the OAuth flow in a new window
    window.open(url, '_blank', 'width=600,height=700');
  };

  // Handle disconnect calendar provider
  const handleDisconnect = (provider: string) => {
    if (confirm(`Are you sure you want to disconnect your ${provider} calendar?`)) {
      disconnectMutation.mutate(provider);
    }
  };

  // Loading state
  if (statusLoading || urlsLoading) {
    return (
      <div className="flex items-center justify-center p-6">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Error state
  if (statusError || urlsError) {
    return (
      <Alert variant="destructive" className="mb-4">
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>
          {statusError instanceof Error
            ? statusError.message
            : urlsError instanceof Error
            ? urlsError.message
            : 'Failed to load calendar integration data'}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold">Calendar Integrations</h2>
      <p className="text-muted-foreground">
        Connect your external calendars to automatically sync appointments and avoid scheduling conflicts.
      </p>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Google Calendar */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Calendar className="mr-2 h-5 w-5" />
              Google Calendar
            </CardTitle>
            <CardDescription>
              Sync appointments with your Google Calendar
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-12 flex items-center">
              {status?.google ? (
                <div className="flex items-center text-green-600">
                  <CheckCircle className="mr-2 h-5 w-5" />
                  Connected
                </div>
              ) : (
                <div className="flex items-center text-gray-500">
                  <XCircle className="mr-2 h-5 w-5" />
                  Not connected
                </div>
              )}
            </div>
          </CardContent>
          <CardFooter>
            {status?.google ? (
              <Button 
                variant="outline" 
                onClick={() => handleDisconnect('google')}
                disabled={disconnectMutation.isPending}
              >
                {disconnectMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Disconnect
              </Button>
            ) : (
              <Button onClick={() => handleConnect(urls?.google || '#')}>
                <ExternalLink className="mr-2 h-4 w-4" />
                Connect
              </Button>
            )}
          </CardFooter>
        </Card>

        {/* Microsoft Calendar */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Calendar className="mr-2 h-5 w-5" />
              Microsoft Calendar
            </CardTitle>
            <CardDescription>
              Sync appointments with your Microsoft Outlook Calendar
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-12 flex items-center">
              {status?.microsoft ? (
                <div className="flex items-center text-green-600">
                  <CheckCircle className="mr-2 h-5 w-5" />
                  Connected
                </div>
              ) : (
                <div className="flex items-center text-gray-500">
                  <XCircle className="mr-2 h-5 w-5" />
                  Not connected
                </div>
              )}
            </div>
          </CardContent>
          <CardFooter>
            {status?.microsoft ? (
              <Button 
                variant="outline" 
                onClick={() => handleDisconnect('microsoft')}
                disabled={disconnectMutation.isPending}
              >
                {disconnectMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Disconnect
              </Button>
            ) : (
              <Button onClick={() => handleConnect(urls?.microsoft || '#')}>
                <ExternalLink className="mr-2 h-4 w-4" />
                Connect
              </Button>
            )}
          </CardFooter>
        </Card>

        {/* Apple Calendar */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Calendar className="mr-2 h-5 w-5" />
              Apple Calendar
            </CardTitle>
            <CardDescription>
              Subscribe to appointments via iCal subscription URL
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-12 flex items-center">
              {status?.apple ? (
                <div className="flex items-center text-green-600">
                  <CheckCircle className="mr-2 h-5 w-5" />
                  URL Generated
                </div>
              ) : (
                <div className="flex items-center text-gray-500">
                  <XCircle className="mr-2 h-5 w-5" />
                  Not configured
                </div>
              )}
            </div>
          </CardContent>
          <CardFooter>
            <Button 
              onClick={handleCopyAppleUrl}
              variant={status?.apple ? "default" : "outline"}
            >
              {copied ? (
                <CheckCircle className="mr-2 h-4 w-4" />
              ) : (
                <ExternalLink className="mr-2 h-4 w-4" />
              )}
              {status?.apple ? "Copy URL" : "Generate URL"}
            </Button>
          </CardFooter>
        </Card>
      </div>

      <Alert>
        <AlertTitle>About Calendar Integration</AlertTitle>
        <AlertDescription>
          <p className="mb-2">
            Connecting your calendars allows SmallBizAgent to:
          </p>
          <ul className="list-disc list-inside space-y-1">
            <li>Automatically sync your business appointments to your personal calendar</li>
            <li>Detect scheduling conflicts with your existing calendar events</li>
            <li>Update calendar events when appointments are rescheduled or canceled</li>
          </ul>
        </AlertDescription>
      </Alert>
    </div>
  );
}