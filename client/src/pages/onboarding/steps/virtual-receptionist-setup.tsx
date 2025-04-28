import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Phone, Bot, CalendarClock, MessageSquare, Settings } from 'lucide-react';

interface VirtualReceptionistSetupProps {
  onComplete: () => void;
}

// Virtual receptionist configuration schema
const configSchema = z.object({
  businessHours: z.string(),
  welcomeMessage: z.string().min(10, 'Welcome message must be at least 10 characters'),
  callHandling: z.enum(['ai', 'voicemail', 'both']),
  emergencySupport: z.boolean().default(false),
  appointmentBooking: z.boolean().default(true),
  notificationEmails: z.string().email('Please enter a valid email').or(z.literal('')),
  voicemailTranscription: z.boolean().default(true),
  callRecording: z.boolean().default(false),
  callForwarding: z.boolean().default(false),
  forwardingNumbers: z.string().optional(),
});

type ConfigFormValues = z.infer<typeof configSchema>;

export default function VirtualReceptionistSetup({ onComplete }: VirtualReceptionistSetupProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState('basic');
  
  const businessId = user?.businessId || 1;
  
  // Fetch any existing receptionist config
  const { data: config, isLoading: isLoadingConfig } = useQuery({
    queryKey: ['/api/receptionist-config', businessId],
    retry: false,
    enabled: !!businessId,
  });
  
  const form = useForm<ConfigFormValues>({
    resolver: zodResolver(configSchema),
    defaultValues: {
      businessHours: 'Monday-Friday, 9:00 AM - 5:00 PM',
      welcomeMessage: 'Thank you for calling. Our virtual receptionist will help you today.',
      callHandling: 'both',
      emergencySupport: false,
      appointmentBooking: true,
      notificationEmails: user?.email || '',
      voicemailTranscription: true,
      callRecording: false,
      callForwarding: false,
      forwardingNumbers: '',
    },
  });
  
  // Update form when config is loaded
  const updateFormWithConfig = (config: any) => {
    if (config) {
      form.reset({
        businessHours: config.businessHours || 'Monday-Friday, 9:00 AM - 5:00 PM',
        welcomeMessage: config.welcomeMessage || 'Thank you for calling. Our virtual receptionist will help you today.',
        callHandling: config.callHandling || 'both',
        emergencySupport: !!config.emergencySupport,
        appointmentBooking: config.appointmentBooking !== false,
        notificationEmails: config.notificationEmails || user?.email || '',
        voicemailTranscription: config.voicemailTranscription !== false,
        callRecording: !!config.callRecording,
        callForwarding: !!config.callForwarding,
        forwardingNumbers: config.forwardingNumbers || '',
      });
    }
  };
  
  // Save receptionist config mutation
  const saveConfigMutation = useMutation({
    mutationFn: async (data: ConfigFormValues) => {
      const payload = {
        ...data,
        businessId,
      };
      
      if (config?.id) {
        return apiRequest('PUT', `/api/receptionist-config/${config.id}`, payload);
      } else {
        return apiRequest('POST', '/api/receptionist-config', payload);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/receptionist-config'] });
      toast({
        title: 'Receptionist settings saved',
        description: 'Your virtual receptionist has been configured',
      });
      
      // Mark this step as complete
      localStorage.setItem('onboardingReceptionistComplete', 'true');
      
      // Move to next step
      onComplete();
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: 'There was a problem saving your receptionist settings',
        variant: 'destructive',
      });
      setIsSubmitting(false);
    },
  });
  
  const onSubmit = (data: ConfigFormValues) => {
    setIsSubmitting(true);
    saveConfigMutation.mutate(data);
  };
  
  const skipSetup = () => {
    toast({
      title: 'Step skipped',
      description: 'You can set up the virtual receptionist later in Settings',
      variant: 'default',
    });
    
    // Mark this step as skipped
    localStorage.setItem('onboardingReceptionistComplete', 'skipped');
    
    // Move to next step
    onComplete();
  };
  
  return (
    <div className="space-y-6">
      <div className="flex flex-col space-y-4 sm:flex-row sm:space-y-0 sm:space-x-4">
        <Card className="flex-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center">
              <Bot className="mr-2 h-4 w-4" />
              Virtual Receptionist
            </CardTitle>
            <CardDescription>
              AI-powered call handling
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              <li>• Answers calls professionally</li>
              <li>• Identifies caller intent</li>
              <li>• Routes calls appropriately</li>
              <li>• Schedules appointments</li>
            </ul>
          </CardContent>
        </Card>
        
        <Card className="flex-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center">
              <CalendarClock className="mr-2 h-4 w-4" />
              24/7 Availability
            </CardTitle>
            <CardDescription>
              Never miss an opportunity
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              <li>• Works after hours</li>
              <li>• Handles overflow calls</li>
              <li>• Provides emergency support</li>
              <li>• Captures detailed messages</li>
            </ul>
          </CardContent>
        </Card>
      </div>
      
      <Tabs 
        defaultValue="basic" 
        value={activeTab} 
        onValueChange={setActiveTab}
        className="space-y-4"
      >
        <TabsList className="grid grid-cols-3 w-full">
          <TabsTrigger value="basic">Basic Setup</TabsTrigger>
          <TabsTrigger value="advanced">Advanced</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
        </TabsList>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <TabsContent value="basic" className="space-y-4">
              <FormField
                control={form.control}
                name="businessHours"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Business Hours</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Monday-Friday, 9:00 AM - 5:00 PM" {...field} />
                    </FormControl>
                    <FormDescription>
                      This will help the virtual receptionist understand when you're open
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="welcomeMessage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Welcome Message</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Thank you for calling..." 
                        {...field}
                        rows={3}
                      />
                    </FormControl>
                    <FormDescription>
                      This is what callers will hear when they call your business
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="callHandling"
                render={({ field }) => (
                  <FormItem className="space-y-3">
                    <FormLabel>Call Handling Preference</FormLabel>
                    <FormControl>
                      <RadioGroup
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                        className="flex flex-col space-y-1"
                      >
                        <FormItem className="flex items-center space-x-3 space-y-0">
                          <FormControl>
                            <RadioGroupItem value="ai" />
                          </FormControl>
                          <FormLabel className="font-normal">
                            AI Receptionist (preferred)
                          </FormLabel>
                        </FormItem>
                        <FormItem className="flex items-center space-x-3 space-y-0">
                          <FormControl>
                            <RadioGroupItem value="voicemail" />
                          </FormControl>
                          <FormLabel className="font-normal">
                            Voicemail Only
                          </FormLabel>
                        </FormItem>
                        <FormItem className="flex items-center space-x-3 space-y-0">
                          <FormControl>
                            <RadioGroupItem value="both" />
                          </FormControl>
                          <FormLabel className="font-normal">
                            AI with Voicemail Fallback
                          </FormLabel>
                        </FormItem>
                      </RadioGroup>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="flex justify-between pt-2">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setActiveTab('advanced')}
                >
                  Next: Advanced Settings
                </Button>
              </div>
            </TabsContent>
            
            <TabsContent value="advanced" className="space-y-4">
              <div className="grid gap-6">
                <FormField
                  control={form.control}
                  name="emergencySupport"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">
                          Emergency Support
                        </FormLabel>
                        <FormDescription>
                          Allow callers to mark their call as an emergency
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
                  name="appointmentBooking"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">
                          Appointment Booking
                        </FormLabel>
                        <FormDescription>
                          Allow the receptionist to schedule appointments
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
                  name="voicemailTranscription"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">
                          Voicemail Transcription
                        </FormLabel>
                        <FormDescription>
                          Automatically transcribe voicemails to text
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
                  name="callRecording"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">
                          Call Recording
                        </FormLabel>
                        <FormDescription>
                          Record calls for quality and training
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
              
              <div className="flex justify-between pt-2">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setActiveTab('basic')}
                >
                  Back: Basic Setup
                </Button>
                <Button 
                  type="button" 
                  onClick={() => setActiveTab('notifications')}
                >
                  Next: Notifications
                </Button>
              </div>
            </TabsContent>
            
            <TabsContent value="notifications" className="space-y-4">
              <FormField
                control={form.control}
                name="notificationEmails"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notification Email</FormLabel>
                    <FormControl>
                      <Input placeholder="email@example.com" {...field} />
                    </FormControl>
                    <FormDescription>
                      Where to send call notifications and voicemails
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="callForwarding"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">
                        Call Forwarding
                      </FormLabel>
                      <FormDescription>
                        Forward calls to your mobile or office phone
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
              
              {form.watch('callForwarding') && (
                <FormField
                  control={form.control}
                  name="forwardingNumbers"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Forwarding Numbers</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="e.g. +1 (555) 123-4567, +1 (555) 987-6543" 
                          {...field} 
                        />
                      </FormControl>
                      <FormDescription>
                        Separate multiple numbers with commas
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              
              <div className="flex justify-between pt-6">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setActiveTab('advanced')}
                >
                  Back: Advanced Settings
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
      
      <div className="pt-6 border-t text-center">
        <Button 
          variant="ghost" 
          onClick={skipSetup}
          disabled={isSubmitting}
        >
          Skip this step for now
        </Button>
        <p className="text-xs text-muted-foreground mt-1">
          You can set up the virtual receptionist later in Settings
        </p>
      </div>
    </div>
  );
}