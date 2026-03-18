import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Zap, CheckCircle2, Phone, Building2 } from 'lucide-react';

const INDUSTRIES = [
  'Barber/Salon',
  'Restaurant',
  'Plumbing',
  'Electrical',
  'Landscaping',
  'Cleaning',
  'HVAC',
  'Carpentry',
  'Painting',
  'Roofing',
  'Flooring',
  'Appliance Repair',
  'General Contracting',
  'Construction',
  'Pest Control',
  'Pool Maintenance',
  'Auto Repair',
  'Computer Repair',
  'Other',
];

const expressSetupSchema = z.object({
  name: z.string().min(2, 'Business name is required'),
  industry: z.string().min(1, 'Please select an industry'),
  phone: z.string().min(10, 'Phone number must be at least 10 digits'),
  email: z.string().email('Please enter a valid email'),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
});

type ExpressSetupData = z.infer<typeof expressSetupSchema>;

interface ExpressSetupProps {
  userEmail?: string;
}

export default function ExpressSetup({ userEmail }: ExpressSetupProps) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [provisioningStep, setProvisioningStep] = useState<string | null>(null);

  const form = useForm<ExpressSetupData>({
    resolver: zodResolver(expressSetupSchema),
    defaultValues: {
      name: '',
      industry: '',
      phone: '',
      email: userEmail || '',
      address: '',
      city: '',
      state: '',
      zipCode: '',
    },
  });

  const setupMutation = useMutation({
    mutationFn: async (data: ExpressSetupData) => {
      setProvisioningStep('Creating your business...');
      const res = await apiRequest('POST', '/api/onboarding/express-setup', data);
      return res.json();
    },
    onSuccess: (data) => {
      setProvisioningStep('Done! Redirecting...');
      // Invalidate user + business queries so dashboard loads fresh data
      queryClient.invalidateQueries({ queryKey: ['/api/user'] });
      queryClient.invalidateQueries({ queryKey: ['/api/business'] });

      toast({
        title: 'You\'re all set!',
        description: `${data.servicesCreated} services configured. Your AI receptionist is being set up now.`,
      });

      // Short delay so user sees the success state
      setTimeout(() => navigate('/'), 1500);
    },
    onError: (error: Error) => {
      setProvisioningStep(null);
      toast({
        title: 'Setup failed',
        description: error.message || 'Something went wrong. Please try again.',
        variant: 'destructive',
      });
    },
  });

  const onSubmit = (data: ExpressSetupData) => {
    setupMutation.mutate(data);
  };

  // Show provisioning progress
  if (provisioningStep) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] space-y-6 text-center">
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
          <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
            {provisioningStep.includes('Done') ? (
              <CheckCircle2 className="h-10 w-10 text-primary" />
            ) : (
              <Loader2 className="h-10 w-10 text-primary animate-spin" />
            )}
          </div>
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-semibold">{provisioningStep}</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            We're setting up your services, business hours, and AI phone receptionist. This takes about 30 seconds.
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <span>Industry services configured</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <span>Business hours set (Mon-Fri 9-5)</span>
          </div>
          <div className="flex items-center gap-2">
            {provisioningStep.includes('Done') ? (
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            ) : (
              <Loader2 className="h-4 w-4 animate-spin" />
            )}
            <span>AI phone receptionist provisioning</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mb-2">
          <Zap className="h-6 w-6 text-primary" />
        </div>
        <h1 className="text-2xl font-bold">Quick Setup</h1>
        <p className="text-muted-foreground">
          Tell us about your business and we'll handle the rest. You can customize everything later.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Business Information
          </CardTitle>
          <CardDescription>
            We'll use this to set up your AI receptionist, services, and booking page.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Business Name *</FormLabel>
                      <FormControl>
                        <Input placeholder="Canton Barber Shop" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="industry"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Industry *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select your industry" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {INDUSTRIES.map((ind) => (
                            <SelectItem key={ind} value={ind}>
                              {ind}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        We'll auto-configure services and AI prompts for your industry
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Business Phone *</FormLabel>
                      <FormControl>
                        <Input placeholder="(555) 123-4567" {...field} />
                      </FormControl>
                      <FormDescription>Shown to customers on your booking page</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email *</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="you@business.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                    <FormControl>
                      <Input placeholder="123 Main Street" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>City</FormLabel>
                      <FormControl>
                        <Input placeholder="Canton" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="state"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>State</FormLabel>
                      <FormControl>
                        <Input placeholder="MD" maxLength={2} {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="zipCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Zip</FormLabel>
                      <FormControl>
                        <Input placeholder="21228" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              <div className="pt-4">
                <Button
                  type="submit"
                  size="lg"
                  className="w-full"
                  disabled={setupMutation.isPending}
                >
                  {setupMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Setting up...
                    </>
                  ) : (
                    <>
                      <Zap className="mr-2 h-4 w-4" />
                      Set Up My Business
                    </>
                  )}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
