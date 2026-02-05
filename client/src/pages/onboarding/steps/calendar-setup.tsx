import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Loader2, 
  Mail, 
  Calendar as CalendarIcon, 
  MailCheck, 
  BellRing, 
  Clock, 
  Globe, 
  Bookmark
} from 'lucide-react';

interface CalendarSetupProps {
  onComplete: () => void;
  onSkip?: () => void;
}

// Calendar setup form schema
const formSchema = z.object({
  provider: z.enum(['google', 'microsoft', 'apple', 'none']),
  syncEnabled: z.boolean().default(true),
  calendarId: z.string().optional(),
  reminderTime: z.enum(['none', '10min', '30min', '1hour', '1day']).default('30min'),
  customerNotifications: z.boolean().default(true),
  staffNotifications: z.boolean().default(true),
});

type FormValues = z.infer<typeof formSchema>;

export default function CalendarSetup({ onComplete, onSkip }: CalendarSetupProps) {
  const { user, isLoading: isLoadingUser } = useAuth();
  const { toast } = useToast();
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState('provider');

  const businessId = user?.businessId;

  // ALL HOOKS MUST BE CALLED BEFORE ANY EARLY RETURNS
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      provider: 'none',
      syncEnabled: true,
      calendarId: '',
      reminderTime: '30min',
      customerNotifications: true,
      staffNotifications: true,
    },
  });

  // Authenticate with calendar provider mutation
  const authProviderMutation = useMutation({
    mutationFn: async (provider: string) => {
      const res = await apiRequest('POST', '/api/calendar/auth', { provider });
      return await res.json();
    },
    onSuccess: (data: { authUrl?: string }) => {
      // Redirect to OAuth page
      if (data.authUrl) {
        window.location.href = data.authUrl;
      }
    },
    onError: () => {
      toast({
        title: 'Authentication failed',
        description: 'There was a problem connecting to the calendar provider',
        variant: 'destructive',
      });
      setIsAuthenticating(false);
    },
  });

  // Save calendar settings mutation
  const saveSettingsMutation = useMutation({
    mutationFn: async (data: FormValues) => {
      if (!businessId) {
        throw new Error('No business associated with account');
      }
      return apiRequest('POST', '/api/calendar/settings', {
        ...data,
        businessId,
      });
    },
    onSuccess: () => {
      toast({
        title: 'Calendar settings saved',
        description: 'Your calendar integration has been configured',
      });

      // Move to next step - if no provider selected, treat as skip
      if (form.getValues('provider') === 'none' && onSkip) {
        onSkip();
      } else {
        onComplete();
      }
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'There was a problem saving your calendar settings',
        variant: 'destructive',
      });
      setIsSubmitting(false);
    },
  });

  // NOW we can have early returns after all hooks are defined

  // Show loading while user data is being fetched
  if (isLoadingUser) {
    return (
      <div className="flex justify-center py-8">
        <div className="animate-spin w-8 h-8 border-4 border-primary rounded-full border-t-transparent"></div>
      </div>
    );
  }

  // Show error if no business is associated
  if (!businessId) {
    return (
      <div className="text-center py-8">
        <p className="text-destructive mb-4">
          No business is associated with your account. Please complete business setup first.
        </p>
      </div>
    );
  }
  
  const handleAuthProvider = (provider: string) => {
    setIsAuthenticating(true);
    authProviderMutation.mutate(provider);
  };
  
  const onSubmit = (data: FormValues) => {
    setIsSubmitting(true);
    saveSettingsMutation.mutate(data);
  };
  
  const skipSetup = () => {
    form.setValue('provider', 'none');
    
    toast({
      title: 'Step skipped',
      description: 'You can set up calendar integration later in Settings',
      variant: 'default',
    });

    // Move to next step (marked as skipped)
    if (onSkip) {
      onSkip();
    } else {
      onComplete();
    }
  };
  
  const reminderOptions = [
    { value: 'none', label: 'No reminders' },
    { value: '10min', label: '10 minutes before' },
    { value: '30min', label: '30 minutes before' },
    { value: '1hour', label: '1 hour before' },
    { value: '1day', label: '1 day before' },
  ];
  
  return (
    <div className="space-y-6">
      <div className="flex flex-col space-y-4 sm:flex-row sm:space-y-0 sm:space-x-4">
        <Card className="flex-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center">
              <CalendarIcon className="mr-2 h-4 w-4" />
              Calendar Integration
            </CardTitle>
            <CardDescription>
              Sync with your calendar
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              <li>• Sync appointments to your calendar</li>
              <li>• Avoid double bookings</li>
              <li>• Get appointment reminders</li>
              <li>• Works with Google, Microsoft, Apple</li>
            </ul>
          </CardContent>
        </Card>
        
        <Card className="flex-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center">
              <BellRing className="mr-2 h-4 w-4" />
              Automated Notifications
            </CardTitle>
            <CardDescription>
              Keep everyone informed
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              <li>• Automatic appointment confirmations</li>
              <li>• Customizable reminders</li>
              <li>• Staff assignment notifications</li>
              <li>• Reduces no-shows</li>
            </ul>
          </CardContent>
        </Card>
      </div>
      
      <Tabs 
        defaultValue="provider" 
        value={activeTab} 
        onValueChange={setActiveTab}
        className="space-y-4"
      >
        <TabsList className="grid grid-cols-2 w-full">
          <TabsTrigger value="provider">Calendar Provider</TabsTrigger>
          <TabsTrigger value="settings">Notification Settings</TabsTrigger>
        </TabsList>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <TabsContent value="provider" className="space-y-4">
              <FormField
                control={form.control}
                name="provider"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Calendar Provider</FormLabel>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
                      <Card className={`cursor-pointer ${field.value === 'google' ? 'border-primary' : ''}`} onClick={() => field.onChange('google')}>
                        <CardContent className="p-4 flex flex-col items-center text-center">
                          <div className="p-2 rounded-full bg-red-100 mb-2">
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 24 24"
                              width="24"
                              height="24"
                              className="h-6 w-6 text-red-500"
                            >
                              <path
                                fill="currentColor"
                                d="M12 22q-2.05 0-3.875-.788t-3.188-2.15-2.137-3.175T2 12q0-2.075.788-3.887t2.15-3.175Q6.3 3.575 8.124 2.787T12 2q2.075 0 3.888.788t3.175 2.15q1.362 1.363 2.15 3.175T22 12v1.45q0 1.475-1.012 2.513T18.5 17q-.875 0-1.65-.375t-1.3-1.075q-.725.725-1.638 1.088T12 17q-2.075 0-3.537-1.463T7 12q0-2.075 1.463-3.537T12 7q2.075 0 3.538 1.463T17 12v1.45q0 .65.425 1.1T18.5 15q.65 0 1.075-.45t.425-1.1V12q0-3.35-2.325-5.675T12 4Q8.65 4 6.325 6.325T4 12q0 3.35 2.325 5.675T12 20h5v2h-5Zm0-7q1.25 0 2.125-.875T15 12q0-1.25-.875-2.125T12 9q-1.25 0-2.125.875T9 12q0 1.25.875 2.125T12 15Z"
                              />
                            </svg>
                          </div>
                          <h3 className="font-medium">Google Calendar</h3>
                          <p className="text-xs text-muted-foreground mt-1">Connect with Gmail</p>
                        </CardContent>
                      </Card>
                      
                      <Card className={`cursor-pointer ${field.value === 'microsoft' ? 'border-primary' : ''}`} onClick={() => field.onChange('microsoft')}>
                        <CardContent className="p-4 flex flex-col items-center text-center">
                          <div className="p-2 rounded-full bg-blue-100 mb-2">
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 24 24"
                              width="24"
                              height="24"
                              className="h-6 w-6 text-blue-500"
                            >
                              <path
                                fill="currentColor"
                                d="M11.5 12.5H6v-1h5.5V6h1v5.5H18v1h-5.5V18h-1v-5.5Z"
                              />
                            </svg>
                          </div>
                          <h3 className="font-medium">Microsoft Outlook</h3>
                          <p className="text-xs text-muted-foreground mt-1">Connect with Office 365</p>
                        </CardContent>
                      </Card>
                      
                      <Card className={`cursor-pointer ${field.value === 'apple' ? 'border-primary' : ''}`} onClick={() => field.onChange('apple')}>
                        <CardContent className="p-4 flex flex-col items-center text-center">
                          <div className="p-2 rounded-full bg-gray-100 mb-2">
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 24 24"
                              width="24"
                              height="24"
                              className="h-6 w-6 text-gray-800"
                            >
                              <path
                                fill="currentColor"
                                d="M14.94 5.19A4.38 4.38 0 0 0 16 2a4.44 4.44 0 0 0-3 1.52a4.17 4.17 0 0 0-1 3.09a3.69 3.69 0 0 0 2.94-1.42zm2.52 7.44a4.51 4.51 0 0 1 2.16-3.81a4.66 4.66 0 0 0-3.66-2c-1.56-.16-3 .91-3.83.91s-2-.89-3.3-.87a4.92 4.92 0 0 0-4.14 2.53C2.92 12.29 4.24 17.2 6 19.86c.8 1.16 1.75 2.47 3 2.42s1.84-.77 3.44-.77 2.06.77 3.46.75 2.34-1.28 3.22-2.45a10.9 10.9 0 0 0 1.46-3A4.35 4.35 0 0 1 17.46 12.63z"
                              />
                            </svg>
                          </div>
                          <h3 className="font-medium">Apple Calendar</h3>
                          <p className="text-xs text-muted-foreground mt-1">Connect with iCloud</p>
                        </CardContent>
                      </Card>
                    </div>
                    <FormDescription className="mt-2">
                      Choose your preferred calendar provider
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {form.watch('provider') !== 'none' && (
                <div className="flex flex-col items-center justify-center p-6 border rounded-lg">
                  <h3 className="text-base font-medium mb-2">
                    {`Connect to ${
                      form.watch('provider') === 'google'
                        ? 'Google Calendar'
                        : form.watch('provider') === 'microsoft'
                        ? 'Microsoft Outlook'
                        : 'Apple Calendar'
                    }`}
                  </h3>
                  <p className="text-sm text-muted-foreground text-center mb-4">
                    You'll need to authorize access to your calendar
                  </p>
                  <Button
                    type="button"
                    onClick={() => handleAuthProvider(form.watch('provider'))}
                    disabled={isAuthenticating}
                    className="gap-2"
                  >
                    {isAuthenticating && <Loader2 className="h-4 w-4 animate-spin" />}
                    <CalendarIcon className="h-4 w-4" />
                    Connect Now
                  </Button>
                </div>
              )}
              
              <div className="flex justify-between pt-4">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={skipSetup}
                >
                  Skip for Now
                </Button>
                <Button
                  type="button"
                  onClick={() => setActiveTab('settings')}
                  disabled={form.watch('provider') === 'none'}
                >
                  Next: Notification Settings
                </Button>
              </div>
            </TabsContent>
            
            <TabsContent value="settings" className="space-y-4">
              <FormField
                control={form.control}
                name="syncEnabled"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">
                        Two-way Calendar Sync
                      </FormLabel>
                      <FormDescription>
                        Sync appointments in both directions
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="reminderTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Appointment Reminders</FormLabel>
                    <Select 
                      onValueChange={field.onChange} 
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select reminder time" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {reminderOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      When to send appointment reminders
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="customerNotifications"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 h-full">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">
                          Customer Notifications
                        </FormLabel>
                        <FormDescription>
                          Send email notifications to customers
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="staffNotifications"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3 h-full">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">
                          Staff Notifications
                        </FormLabel>
                        <FormDescription>
                          Send email notifications to staff
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>
              
              <div className="flex justify-between pt-6">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setActiveTab('provider')}
                >
                  Back: Calendar Provider
                </Button>
                <Button 
                  type="submit" 
                  disabled={isSubmitting}
                  className="min-w-32"
                >
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save & Continue
                </Button>
              </div>
            </TabsContent>
          </form>
        </Form>
      </Tabs>
    </div>
  );
}