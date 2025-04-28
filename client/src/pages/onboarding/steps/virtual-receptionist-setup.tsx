import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';

import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

const virtualReceptionistSchema = z.object({
  greeting: z.string().min(10, 'Greeting message is required'),
  businessHoursMessage: z.string().min(10, 'Business hours message is required'),
  afterHoursMessage: z.string().min(10, 'After hours message is required'),
  enableVoicemail: z.boolean(),
  voicemailPrompt: z.string().min(10, 'Voicemail prompt is required'),
  emergencyOption: z.boolean(),
  emergencyMessage: z.string().min(10, 'Emergency message is required').optional(),
  emergencyForwardNumber: z.string().optional(),
  enableCallRouting: z.boolean(),
  defaultRouting: z.string().optional(),
});

interface VirtualReceptionistSetupProps {
  onComplete: () => void;
}

export default function VirtualReceptionistSetup({ onComplete }: VirtualReceptionistSetupProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasTwilioCredentials, setHasTwilioCredentials] = useState(true);
  
  // Fetch existing receptionist config if any
  const { data: existingConfig, isLoading } = useQuery({
    queryKey: ['/api/receptionist-config'],
    queryFn: async () => {
      try {
        const businessId = user?.businessId || 1;
        const res = await apiRequest('GET', `/api/receptionist-config/${businessId}`);
        const data = await res.json();
        return data;
      } catch (error) {
        return null;
      }
    }
  });
  
  // Check if Twilio credentials exist
  useQuery({
    queryKey: ['/api/twilio/status'],
    queryFn: async () => {
      try {
        const res = await apiRequest('GET', '/api/twilio/status');
        const data = await res.json();
        setHasTwilioCredentials(data.configured);
        return data;
      } catch (error) {
        setHasTwilioCredentials(false);
        return { configured: false };
      }
    }
  });
  
  const form = useForm<z.infer<typeof virtualReceptionistSchema>>({
    resolver: zodResolver(virtualReceptionistSchema),
    defaultValues: {
      greeting: existingConfig?.greeting || "Thank you for calling [Business Name]. How may we assist you today?",
      businessHoursMessage: existingConfig?.businessHoursMessage || "We're currently open. Please hold while we connect you with a team member.",
      afterHoursMessage: existingConfig?.afterHoursMessage || "We're currently closed. Our business hours are Monday to Friday, 9 AM to 5 PM. Please leave a message or call back during business hours.",
      enableVoicemail: existingConfig?.enableVoicemail ?? true,
      voicemailPrompt: existingConfig?.voicemailPrompt || "Please leave your name, phone number, and a brief message after the tone. We'll get back to you as soon as possible.",
      emergencyOption: existingConfig?.emergencyOption ?? false,
      emergencyMessage: existingConfig?.emergencyMessage || "If this is an emergency, please press 1 to be connected with our on-call staff.",
      emergencyForwardNumber: existingConfig?.emergencyForwardNumber || "",
      enableCallRouting: existingConfig?.enableCallRouting ?? false,
      defaultRouting: existingConfig?.defaultRouting || "voicemail",
    },
  });
  
  // Update form when existing config is loaded
  useState(() => {
    if (existingConfig) {
      form.reset({
        greeting: existingConfig.greeting,
        businessHoursMessage: existingConfig.businessHoursMessage,
        afterHoursMessage: existingConfig.afterHoursMessage,
        enableVoicemail: existingConfig.enableVoicemail,
        voicemailPrompt: existingConfig.voicemailPrompt,
        emergencyOption: existingConfig.emergencyOption,
        emergencyMessage: existingConfig.emergencyMessage,
        emergencyForwardNumber: existingConfig.emergencyForwardNumber,
        enableCallRouting: existingConfig.enableCallRouting,
        defaultRouting: existingConfig.defaultRouting,
      });
    }
  });
  
  const receptionistMutation = useMutation({
    mutationFn: async (data: z.infer<typeof virtualReceptionistSchema>) => {
      const businessId = user?.businessId || 1;
      
      if (existingConfig?.id) {
        // Update existing config
        return apiRequest("PUT", `/api/receptionist-config/${existingConfig.id}`, {
          ...data,
          businessId
        });
      } else {
        // Create new config
        return apiRequest("POST", `/api/receptionist-config`, {
          ...data,
          businessId
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/receptionist-config'] });
      toast({
        title: "Success",
        description: "Virtual receptionist settings saved successfully",
      });
      
      // Mark this step as complete
      localStorage.setItem('onboardingReceptionistComplete', 'true');
      
      onComplete();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "There was a problem saving your virtual receptionist settings",
        variant: "destructive",
      });
      setIsSubmitting(false);
    },
  });
  
  const onSubmit = (data: z.infer<typeof virtualReceptionistSchema>) => {
    setIsSubmitting(true);
    receptionistMutation.mutate(data);
  };
  
  const skipStep = () => {
    // Mark as completed but skipped
    localStorage.setItem('onboardingReceptionistComplete', 'skipped');
    onComplete();
  };
  
  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Configure Virtual Receptionist</h2>
        <p className="text-muted-foreground">
          Set up your AI-powered virtual receptionist to handle calls and provide information
        </p>
      </div>
      
      {!hasTwilioCredentials && (
        <Alert variant="warning" className="mb-6">
          <AlertTitle>Twilio setup required</AlertTitle>
          <AlertDescription>
            To fully enable the virtual receptionist, you'll need to configure Twilio.
            You can still configure the settings now and set up Twilio integration later.
          </AlertDescription>
        </Alert>
      )}

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Basic Settings</h3>
            
            <FormField
              control={form.control}
              name="greeting"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Initial Greeting</FormLabel>
                  <FormControl>
                    <Textarea 
                      {...field} 
                      placeholder="Thank you for calling [Business Name]. How may we assist you today?"
                      rows={2}
                    />
                  </FormControl>
                  <FormDescription>
                    This is the first message callers will hear when they call your business.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="businessHoursMessage"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>During Business Hours Message</FormLabel>
                  <FormControl>
                    <Textarea 
                      {...field} 
                      placeholder="We're currently open. Please hold while we connect you with a team member."
                      rows={2}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="afterHoursMessage"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>After Hours Message</FormLabel>
                  <FormControl>
                    <Textarea 
                      {...field} 
                      placeholder="We're currently closed. Our business hours are Monday to Friday, 9 AM to 5 PM. Please leave a message or call back during business hours."
                      rows={2}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          
          <div className="space-y-4 pt-4 border-t">
            <h3 className="text-lg font-medium">Voicemail Settings</h3>
            
            <FormField
              control={form.control}
              name="enableVoicemail"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Enable Voicemail</FormLabel>
                    <FormDescription>
                      Allow callers to leave a voicemail message
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
            
            {form.watch('enableVoicemail') && (
              <FormField
                control={form.control}
                name="voicemailPrompt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Voicemail Prompt</FormLabel>
                    <FormControl>
                      <Textarea 
                        {...field} 
                        placeholder="Please leave your name, phone number, and a brief message after the tone. We'll get back to you as soon as possible."
                        rows={2}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </div>
          
          <div className="space-y-4 pt-4 border-t">
            <h3 className="text-lg font-medium">Emergency Settings</h3>
            
            <FormField
              control={form.control}
              name="emergencyOption"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Enable Emergency Option</FormLabel>
                    <FormDescription>
                      Provide an option for emergency calls outside of business hours
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
            
            {form.watch('emergencyOption') && (
              <>
                <FormField
                  control={form.control}
                  name="emergencyMessage"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Emergency Message</FormLabel>
                      <FormControl>
                        <Textarea 
                          {...field} 
                          placeholder="If this is an emergency, please press 1 to be connected with our on-call staff."
                          rows={2}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="emergencyForwardNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Emergency Forward Number</FormLabel>
                      <FormControl>
                        <Input 
                          {...field} 
                          placeholder="+1234567890"
                        />
                      </FormControl>
                      <FormDescription>
                        The phone number to forward emergency calls to (e.g., on-call staff)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </>
            )}
          </div>
          
          <div className="pt-4 flex flex-col sm:flex-row gap-4">
            <Button 
              type="button" 
              variant="outline"
              className="flex-1"
              onClick={skipStep}
            >
              Skip for Now
            </Button>
            <Button 
              type="submit" 
              className="flex-1"
              disabled={isSubmitting}
            >
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Receptionist Settings
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}