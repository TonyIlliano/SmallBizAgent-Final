import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { CalendarIntegration } from '@/components/calendar/CalendarIntegration';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Loader2 } from 'lucide-react';

export default function CalendarSettingsPage() {
  const { user } = useAuth();

  // Redirect to auth page if not authenticated
  useEffect(() => {
    if (user === null) {
      window.location.href = '/auth';
    }
  }, [user]);

  // Get business data
  const { data: business, isLoading } = useQuery({
    queryKey: ['/api/business'],
    queryFn: async () => {
      const res = await fetch('/api/business');
      
      if (!res.ok) {
        throw new Error('Failed to fetch business data');
      }
      
      return res.json();
    },
    enabled: !!user,
  });

  // Loading state
  if (isLoading || !business) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container py-6">
      <h1 className="text-3xl font-bold mb-6">Settings</h1>
      
      <Tabs defaultValue="calendar" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
        </TabsList>
        
        <TabsContent value="calendar" className="space-y-6">
          <div>
            <h2 className="text-2xl font-semibold mb-2">Calendar Settings</h2>
            <p className="text-muted-foreground">
              Manage your calendar integrations and scheduling preferences
            </p>
          </div>
          
          <Separator />
          
          <CalendarIntegration businessId={business.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}