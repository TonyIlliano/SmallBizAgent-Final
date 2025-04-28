import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Loader2, CalendarCheck, Calendar as CalendarIcon, Mail } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

interface CalendarSetupProps {
  onComplete: () => void;
}

export default function CalendarSetup({ onComplete }: CalendarSetupProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("google");
  const [isConnecting, setIsConnecting] = useState(false);
  
  // Fetch existing calendar integrations if any
  const { data: calendarIntegrations, isLoading, refetch } = useQuery({
    queryKey: ['/api/calendar/integrations'],
    queryFn: async () => {
      try {
        const businessId = user?.businessId || 1;
        const res = await apiRequest('GET', `/api/calendar/integrations/${businessId}`);
        const data = await res.json();
        return data;
      } catch (error) {
        return {
          google: { connected: false },
          outlook: { connected: false },
          apple: { connected: false }
        };
      }
    }
  });
  
  const googleConnectMutation = useMutation({
    mutationFn: async () => {
      const businessId = user?.businessId || 1;
      const res = await apiRequest("POST", "/api/calendar/connect/google", { businessId });
      return await res.json();
    },
    onSuccess: (data) => {
      // The API would return a URL to redirect to for OAuth
      if (data.authUrl) {
        window.location.href = data.authUrl;
      } else {
        toast({
          title: "Error",
          description: "Unable to initialize Google Calendar connection",
          variant: "destructive",
        });
        setIsConnecting(false);
      }
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "There was a problem connecting to Google Calendar",
        variant: "destructive",
      });
      setIsConnecting(false);
    },
  });
  
  const outlookConnectMutation = useMutation({
    mutationFn: async () => {
      const businessId = user?.businessId || 1;
      const res = await apiRequest("POST", "/api/calendar/connect/outlook", { businessId });
      return await res.json();
    },
    onSuccess: (data) => {
      // The API would return a URL to redirect to for OAuth
      if (data.authUrl) {
        window.location.href = data.authUrl;
      } else {
        toast({
          title: "Error",
          description: "Unable to initialize Outlook Calendar connection",
          variant: "destructive",
        });
        setIsConnecting(false);
      }
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "There was a problem connecting to Outlook Calendar",
        variant: "destructive",
      });
      setIsConnecting(false);
    },
  });
  
  const appleConnectMutation = useMutation({
    mutationFn: async (data: { username: string; password: string }) => {
      const businessId = user?.businessId || 1;
      const res = await apiRequest("POST", "/api/calendar/connect/apple", { 
        ...data,
        businessId 
      });
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Apple Calendar connected successfully",
      });
      refetch();
      setIsConnecting(false);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "There was a problem connecting to Apple Calendar",
        variant: "destructive",
      });
      setIsConnecting(false);
    },
  });
  
  const connectToGoogle = () => {
    setIsConnecting(true);
    googleConnectMutation.mutate();
  };
  
  const connectToOutlook = () => {
    setIsConnecting(true);
    outlookConnectMutation.mutate();
  };
  
  const skipStep = () => {
    // Mark as skipped but completed
    localStorage.setItem('onboardingCalendarComplete', 'skipped');
    onComplete();
  };
  
  // Mock form submit for Apple Calendar
  const [appleEmail, setAppleEmail] = useState('');
  const [applePassword, setApplePassword] = useState('');
  
  const handleAppleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsConnecting(true);
    appleConnectMutation.mutate({ 
      username: appleEmail, 
      password: applePassword 
    });
  };
  
  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  
  const isAnyCalendarConnected = 
    calendarIntegrations?.google?.connected || 
    calendarIntegrations?.outlook?.connected ||
    calendarIntegrations?.apple?.connected;
  
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Connect Your Calendar</h2>
        <p className="text-muted-foreground">
          Integrate with your calendar to sync appointments and avoid scheduling conflicts
        </p>
      </div>
      
      {isAnyCalendarConnected && (
        <Alert variant="success" className="mb-6">
          <CalendarCheck className="h-4 w-4" />
          <AlertTitle>Calendar Connected</AlertTitle>
          <AlertDescription>
            You've successfully connected your calendar! You can connect additional calendars or continue to the next step.
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3 mb-6">
          <TabsTrigger value="google">Google</TabsTrigger>
          <TabsTrigger value="outlook">Outlook/Microsoft</TabsTrigger>
          <TabsTrigger value="apple">Apple Calendar</TabsTrigger>
        </TabsList>
        
        <TabsContent value="google">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <CalendarIcon className="mr-2 h-5 w-5" />
                Google Calendar
              </CardTitle>
              <CardDescription>
                Connect your Google Calendar to sync appointments and availability
              </CardDescription>
            </CardHeader>
            <CardContent>
              {calendarIntegrations?.google?.connected ? (
                <div className="bg-muted p-4 rounded-lg flex flex-col items-center justify-center text-center">
                  <CalendarCheck className="h-10 w-10 text-green-500 mb-2" />
                  <h3 className="font-medium">Google Calendar Connected</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Your Google Calendar is already connected.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center text-center p-4">
                  <p className="mb-6">
                    By connecting Google Calendar, we can sync your appointments and avoid scheduling conflicts.
                  </p>
                  <Button
                    onClick={connectToGoogle}
                    disabled={isConnecting}
                    className="w-full max-w-xs"
                  >
                    {isConnecting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Connect Google Calendar
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="outlook">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Mail className="mr-2 h-5 w-5" />
                Outlook/Microsoft Calendar
              </CardTitle>
              <CardDescription>
                Connect your Outlook or Microsoft calendar to sync appointments and availability
              </CardDescription>
            </CardHeader>
            <CardContent>
              {calendarIntegrations?.outlook?.connected ? (
                <div className="bg-muted p-4 rounded-lg flex flex-col items-center justify-center text-center">
                  <CalendarCheck className="h-10 w-10 text-green-500 mb-2" />
                  <h3 className="font-medium">Microsoft Calendar Connected</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Your Microsoft Calendar is already connected.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center text-center p-4">
                  <p className="mb-6">
                    By connecting Microsoft Calendar, we can sync your appointments and avoid scheduling conflicts.
                  </p>
                  <Button
                    onClick={connectToOutlook}
                    disabled={isConnecting}
                    className="w-full max-w-xs"
                  >
                    {isConnecting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Connect Microsoft Calendar
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="apple">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <CalendarIcon className="mr-2 h-5 w-5" />
                Apple Calendar
              </CardTitle>
              <CardDescription>
                Connect your Apple Calendar to sync appointments and availability
              </CardDescription>
            </CardHeader>
            <CardContent>
              {calendarIntegrations?.apple?.connected ? (
                <div className="bg-muted p-4 rounded-lg flex flex-col items-center justify-center text-center">
                  <CalendarCheck className="h-10 w-10 text-green-500 mb-2" />
                  <h3 className="font-medium">Apple Calendar Connected</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Your Apple Calendar is already connected.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleAppleSubmit} className="space-y-4">
                  <p className="text-sm text-muted-foreground mb-4">
                    Enter your Apple ID credentials to connect to your Apple Calendar.
                  </p>
                  
                  <div className="space-y-2">
                    <Label htmlFor="apple-email">Apple ID Email</Label>
                    <Input
                      id="apple-email"
                      type="email"
                      placeholder="your-apple-id@icloud.com"
                      value={appleEmail}
                      onChange={(e) => setAppleEmail(e.target.value)}
                      required
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="apple-password">Apple ID Password</Label>
                    <Input
                      id="apple-password"
                      type="password"
                      placeholder="Your password"
                      value={applePassword}
                      onChange={(e) => setApplePassword(e.target.value)}
                      required
                    />
                  </div>
                  
                  <Button
                    type="submit"
                    disabled={isConnecting || !appleEmail || !applePassword}
                    className="w-full"
                  >
                    {isConnecting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Connect Apple Calendar
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      
      <div className="pt-4 flex flex-col sm:flex-row gap-4">
        <Button 
          variant="outline"
          className="flex-1"
          onClick={skipStep}
        >
          Skip for Now
        </Button>
        <Button 
          className="flex-1"
          onClick={onComplete}
        >
          {isAnyCalendarConnected ? "Continue" : "Continue Without Connecting"}
        </Button>
      </div>
    </div>
  );
}