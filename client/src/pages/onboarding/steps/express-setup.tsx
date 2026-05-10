import { useState, useEffect, useRef } from 'react';
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
import { Loader2, Zap, CheckCircle2, Phone, Building2, MapPin } from 'lucide-react';
import GooglePlacesAutocomplete, { PlaceDetails } from '@/components/ui/google-places-autocomplete';

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
  const [gbpConnected, setGbpConnected] = useState(false);
  const [isConnectingGbp, setIsConnectingGbp] = useState(false);
  // GBP tokens are now stashed server-side in the session by the OAuth
  // callback. The express-setup endpoint reads them from the session after
  // the business is created and persists them via savePersistedTokens().
  // Nothing for the client to track or forward in the mutation payload.

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
      // Server now provisions Twilio + Retell synchronously, so this can take 20-45 seconds.
      // Step messages give the user something to watch instead of staring at a frozen spinner.
      setProvisioningStep('Creating your business...');
      const stepTimer1 = setTimeout(() => setProvisioningStep('Provisioning your phone number...'), 3000);
      const stepTimer2 = setTimeout(() => setProvisioningStep('Setting up your AI receptionist...'), 12000);
      const stepTimer3 = setTimeout(() => setProvisioningStep('Almost there...'), 25000);
      try {
        const res = await apiRequest('POST', '/api/onboarding/express-setup', data);
        return res.json();
      } finally {
        clearTimeout(stepTimer1);
        clearTimeout(stepTimer2);
        clearTimeout(stepTimer3);
      }
    },
    onSuccess: (data) => {
      // Always invalidate so dashboard picks up the new business.
      queryClient.invalidateQueries({ queryKey: ['/api/user'] });
      queryClient.invalidateQueries({ queryKey: ['/api/business'] });

      // Card-required trial flow: if the server created a Stripe subscription
      // and returned a clientSecret, redirect to /payment for card collection
      // BEFORE landing on the dashboard. The success page then forwards to /.
      if (data.clientSecret) {
        setProvisioningStep('Almost done — saving your payment method...');
        const params = new URLSearchParams({
          clientSecret: data.clientSecret,
          intentType: data.intentType || 'setup',
          returnTo: '/',
        });
        // Brief delay so the user sees the step message before redirect.
        setTimeout(() => {
          window.location.href = `/payment?${params.toString()}`;
        }, 600);
        return;
      }

      // No clientSecret: either the user didn't pick a plan, or the
      // subscription create failed silently. Fall back to the dashboard
      // landing path. They can subscribe from Settings later.

      // Branch: did provisioning ACTUALLY succeed, or did setup-only succeed?
      if (data.provisioningSuccess) {
        setProvisioningStep('Done! Redirecting...');
        const phoneText = data.twilioPhoneNumber
          ? `Your AI line: ${data.twilioPhoneNumber}`
          : 'Your AI receptionist is live.';
        toast({
          title: "You're all set!",
          description: `${data.servicesCreated} services configured. ${phoneText}`,
        });
        setTimeout(() => navigate('/'), 1500);
      } else {
        // Business + services + hours exist, but Twilio/Retell hit a snag.
        // Surface the issue clearly so the user knows AND admin alerting (server-side) flags it for support.
        setProvisioningStep(null);
        toast({
          title: 'Setup partially complete',
          description:
            'Your business was created, but we hit a snag setting up your phone line. Our team has been notified and will reach out shortly. You can continue exploring the dashboard while we sort it out.',
          variant: 'destructive',
          duration: 12000,
        });
        // Still redirect — they have a usable business shell. Provisioning can be retried later by admin.
        setTimeout(() => navigate('/'), 3000);
      }
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

  // Watchdog: clear the connecting spinner if the popup never posts back
  // (popup blocked silently, opener lost, postMessage dropped, etc).
  const watchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // COOP fallback: poll /api/gbp/onboarding/pending in case window.opener
  // postMessage is blocked by Cross-Origin-Opener-Policy in some browsers.
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Shared helper: apply GBP businessData to the form. Used by both the
  // postMessage listener (fast path when window.opener works) and the
  // polling fallback (when COOP severs window.opener).
  const applyGbpData = (d: any) => {
    setGbpConnected(true);
    setIsConnectingGbp(false);
    if (watchdogRef.current) {
      clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (d?.name) form.setValue('name', d.name);
    if (d?.phone) form.setValue('phone', d.phone);
    if (d?.address) form.setValue('address', d.address);
    if (d?.city) form.setValue('city', d.city);
    if (d?.state) form.setValue('state', d.state);
    if (d?.zipCode) form.setValue('zipCode', d.zipCode);
    if (d?.industry) form.setValue('industry', d.industry);
    if (d?.email || userEmail) form.setValue('email', d?.email || userEmail || '');
    if (d?.name) {
      toast({
        title: 'Business info imported!',
        description: `Found "${d.name}" on Google. Review the details and continue.`,
      });
    } else {
      toast({
        title: 'Connected to Google',
        description: 'No business listing found on this account. Fill in your details below.',
      });
    }
  };

  // Listen for GBP onboarding data from OAuth popup. Origin-checked (Option C):
  // only accept messages from our own origin so a malicious popup can't inject
  // form data. The popup callback's postMessage targetOrigin is APP_URL, which
  // matches window.location.origin in production.
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === 'gbp-onboarding-data' && event.data.data) {
        applyGbpData(event.data.data);
      }
    };
    window.addEventListener('message', handler);
    return () => {
      window.removeEventListener('message', handler);
      if (watchdogRef.current) clearTimeout(watchdogRef.current);
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
    // applyGbpData closes over stable refs (form, toast, userEmail). Don't
    // re-run this effect on render-by-render changes — it would tear down
    // and re-mount the listener for no reason.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Google Places auto-fill — primary signup path (covers any business listed
  // on Google Maps, not just claimed Business Profiles).
  const handlePlaceSelected = (place: PlaceDetails) => {
    if (place.name) form.setValue('name', place.name);
    if (place.address) form.setValue('address', place.address);
    if (place.city) form.setValue('city', place.city);
    if (place.state) form.setValue('state', place.state);
    if (place.zipCode) form.setValue('zipCode', place.zipCode);
    if (place.phone) form.setValue('phone', place.phone);
    toast({
      title: 'Business found!',
      description: `Auto-filled details for "${place.name}". Review and continue.`,
    });
  };

  const handleConnectGbp = async () => {
    setIsConnectingGbp(true);
    try {
      // apiRequest from @/lib/api returns parsed JSON directly (not a Response).
      const data: any = await apiRequest('GET', '/api/gbp/onboarding/auth-url');
      const url = data?.url;
      if (url) {
        const popup = window.open(url, 'gbp-onboarding', 'width=600,height=700');
        if (!popup) {
          toast({ title: 'Popup blocked', description: 'Please allow popups and try again.', variant: 'destructive' });
          setIsConnectingGbp(false);
        } else {
          // Watchdog: if neither postMessage nor polling delivers data within
          // 90s, give up and let the user retry or fill in manually.
          if (watchdogRef.current) clearTimeout(watchdogRef.current);
          watchdogRef.current = setTimeout(() => {
            if (pollIntervalRef.current) {
              clearInterval(pollIntervalRef.current);
              pollIntervalRef.current = null;
            }
            setIsConnectingGbp(false);
            toast({
              title: "Didn't hear back from Google",
              description: 'You can try again or fill in your details manually below.',
              variant: 'destructive',
            });
          }, 90_000);

          // COOP fallback polling: every 2s, check /api/gbp/onboarding/pending.
          // Whichever delivers first (postMessage or this poll) calls
          // applyGbpData(), which sets gbpConnected=true so this poll's
          // result-check effectively becomes a no-op.
          if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = setInterval(async () => {
            try {
              const res = await fetch('/api/gbp/onboarding/pending', { credentials: 'include' });
              if (!res.ok) return;
              const json = await res.json();
              if (json?.pending && json.data && Object.keys(json.data).length > 0) {
                if (pollIntervalRef.current) {
                  clearInterval(pollIntervalRef.current);
                  pollIntervalRef.current = null;
                }
                applyGbpData(json.data);
              }
            } catch {
              // Network blip — keep polling
            }
          }, 2000);
        }
      } else {
        const serverError = data?.error || 'No OAuth URL returned by the server';
        throw new Error(serverError);
      }
    } catch (err: any) {
      // Surface the actual server error so we can debug auth/config issues.
      console.error('GBP connect error:', err);
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      if (watchdogRef.current) {
        clearTimeout(watchdogRef.current);
        watchdogRef.current = null;
      }
      const serverMsg = err?.message || 'Could not connect to Google.';
      toast({
        title: 'Could not connect to Google',
        description: `${serverMsg} You can fill in your details manually.`,
        variant: 'destructive',
      });
      setIsConnectingGbp(false);
    }
  };

  const onSubmit = (data: ExpressSetupData) => {
    // Tokens are picked up server-side from the session stash, not the payload.
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
          {/* Find Your Business — Places autocomplete is the primary input.
              GBP is offered as a smaller secondary option for richer data
              (hours + category) when the user has a claimed profile. */}
          {!gbpConnected && (
            <div className="mb-6 space-y-3">
              <GooglePlacesAutocomplete
                onPlaceSelected={handlePlaceSelected}
                placeholder="Search for your business..."
              />
              <div className="flex items-center gap-2 text-sm">
                <button
                  type="button"
                  onClick={handleConnectGbp}
                  disabled={isConnectingGbp}
                  className="inline-flex items-center gap-1.5 text-primary hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                  data-testid="connect-gbp-link"
                >
                  {isConnectingGbp ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Connecting to Google...
                    </>
                  ) : (
                    <>
                      <MapPin className="h-3.5 w-3.5" />
                      Or connect your Google Business Profile
                    </>
                  )}
                </button>
                <span className="text-xs text-muted-foreground">(also imports hours + category)</span>
              </div>
            </div>
          )}

          {gbpConnected && (
            <div className="mb-4 flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
              <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
              <span className="text-sm text-green-700 dark:text-green-400">
                Business info imported from Google. Review and continue.
              </span>
            </div>
          )}

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
