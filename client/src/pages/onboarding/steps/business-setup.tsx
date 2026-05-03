import { useState, useCallback, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Loader2, Search, Building2, MapPin, CheckCircle2 } from 'lucide-react';
import GooglePlacesAutocomplete, { PlaceDetails } from '@/components/ui/google-places-autocomplete';

interface BusinessSetupProps {
  onComplete: () => void;
}

// Business setup form schema
const formSchema = z.object({
  name: z.string().min(2, 'Business name must be at least 2 characters'),
  description: z.string().optional(),
  industry: z.string().min(1, 'Please select an industry'),
  phone: z.string().min(10, 'Phone number must be at least 10 digits'),
  ownerPhone: z.string().min(10, 'Cell phone must be at least 10 digits').optional().or(z.literal('')),
  email: z.string().email('Please enter a valid email'),
  website: z.string().url('Please enter a valid URL').optional().or(z.literal('')),
  address: z.string().min(5, 'Address must be at least 5 characters'),
  city: z.string().min(2, 'City must be at least 2 characters'),
  state: z.string().min(2, 'State must be at least 2 characters'),
  zipCode: z.string().min(5, 'Zip code must be at least 5 characters'),
  numberOfLocations: z.coerce.number().min(1).default(1),
});

type FormValues = z.infer<typeof formSchema>;

export default function BusinessSetup({ onComplete }: BusinessSetupProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [placeSelected, setPlaceSelected] = useState(false);
  const [gbpConnected, setGbpConnected] = useState(false);
  const [gbpConnecting, setGbpConnecting] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      description: '',
      industry: '',
      phone: '',
      ownerPhone: '',
      email: user?.email || '',
      website: '',
      address: '',
      city: '',
      state: '',
      zipCode: '',
      numberOfLocations: 1,
    },
  });

  // Handle Google Places selection — auto-fill all form fields
  const handlePlaceSelected = useCallback((place: PlaceDetails) => {
    form.setValue('name', place.name, { shouldValidate: true });
    if (place.address) form.setValue('address', place.address, { shouldValidate: true });
    if (place.city) form.setValue('city', place.city, { shouldValidate: true });
    if (place.state) form.setValue('state', place.state, { shouldValidate: true });
    if (place.zipCode) form.setValue('zipCode', place.zipCode, { shouldValidate: true });
    if (place.phone) form.setValue('phone', place.phone, { shouldValidate: true });
    if (place.website) form.setValue('website', place.website, { shouldValidate: true });
    setPlaceSelected(true);
    setShowManualEntry(true); // Show the form so user can review/edit
    toast({
      title: 'Business found!',
      description: 'We auto-filled your details. Review and complete the remaining fields below.',
    });
  }, [form, toast]);

  // ── Google Business Profile import (same flow as express setup) ──
  // Uses GBP OAuth (which works in this codebase) instead of Places Autocomplete
  // (which needs a separate VITE_GOOGLE_PLACES_API_KEY). Listens for the
  // postMessage from the OAuth popup and pre-fills form fields.
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'gbp-onboarding-data' && event.data.data) {
        const d = event.data.data;
        setGbpConnected(true);
        setGbpConnecting(false);

        if (d.name) form.setValue('name', d.name, { shouldValidate: true });
        if (d.phone) form.setValue('phone', d.phone, { shouldValidate: true });
        if (d.address) form.setValue('address', d.address, { shouldValidate: true });
        if (d.city) form.setValue('city', d.city, { shouldValidate: true });
        if (d.state) form.setValue('state', d.state, { shouldValidate: true });
        if (d.zipCode) form.setValue('zipCode', d.zipCode, { shouldValidate: true });
        if (d.industry) form.setValue('industry', d.industry, { shouldValidate: true });
        if (d.website) form.setValue('website', d.website, { shouldValidate: true });
        if (d.email) form.setValue('email', d.email, { shouldValidate: true });

        setShowManualEntry(true);
        toast({
          title: 'Business info imported!',
          description: `Found "${d.name}" on Google. Review the details and continue.`,
        });
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [form, toast]);

  const handleConnectGbp = async () => {
    setGbpConnecting(true);
    try {
      const res = await apiRequest('GET', '/api/gbp/onboarding/auth-url');
      const { url } = await res.json();
      if (url) {
        const popup = window.open(url, 'gbp-onboarding', 'width=600,height=700');
        if (!popup) {
          toast({
            title: 'Popup blocked',
            description: 'Please allow popups and try again, or fill in your details manually below.',
            variant: 'destructive',
          });
          setGbpConnecting(false);
          setShowManualEntry(true);
        }
      } else {
        throw new Error('No OAuth URL returned');
      }
    } catch (err: any) {
      // Surface the actual server error message so we can debug auth/config issues
      // instead of always showing the same generic "fill in manually" message.
      console.error('GBP connect error:', err);
      const serverMsg = err?.message || 'Could not connect to Google.';
      toast({
        title: 'Could not connect to Google',
        description: `${serverMsg} You can fill in your business details manually below.`,
        variant: 'destructive',
      });
      setGbpConnecting(false);
      setShowManualEntry(true);
    }
  };

  // Fetch existing business if available
  const businessId = user?.businessId;

  // Mutation to update business — map zipCode → zip for the API
  const updateBusinessMutation = useMutation({
    mutationFn: async (data: FormValues) => {
      // The database column is "zip" but the form uses "zipCode"
      // Also remove "description" since it's not a businesses table column
      const { zipCode, description, ...rest } = data;
      const apiData = { ...rest, zip: zipCode };

      let response;
      if (businessId) {
        response = await apiRequest('PUT', `/api/business/${businessId}`, apiData);
      } else {
        response = await apiRequest('POST', '/api/business', apiData);
      }
      return response.json();
    },
    onSuccess: async (business) => {
      // Retrieve plan selection from server-side session and create subscription
      try {
        const selectionRes = await apiRequest('GET', '/api/onboarding/selection');
        const selection = await selectionRes.json();

        if (selection.selectedPlanId && business.id) {
          try {
            await apiRequest('POST', '/api/subscription/create-subscription', {
              businessId: business.id,
              planId: selection.selectedPlanId,
              promoCode: selection.promoCode || undefined,
            });
          } catch (subError) {
            console.error('Error creating subscription:', subError);
            toast({
              title: 'Subscription notice',
              description: 'Your business was saved, but we had trouble setting up your subscription. You can set it up from Settings later.',
              variant: 'destructive',
            });
          }
          // Clear the onboarding session data
          await apiRequest('POST', '/api/onboarding/clear-selection');
        }
      } catch (selError) {
        console.error('Error reading onboarding selection:', selError);
      }

      // Invalidate and WAIT for user + business queries to refresh
      await queryClient.invalidateQueries({ queryKey: ['/api/user'] });
      await queryClient.refetchQueries({ queryKey: ['/api/user'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/business'] });

      toast({
        title: 'Business profile updated',
        description: 'Your business information has been saved',
      });

      // Small delay to ensure React state updates
      await new Promise(resolve => setTimeout(resolve, 500));

      // Move to next step (progress is tracked by the onboarding index)
      onComplete();
    },
    onError: (error: any) => {
      console.error('Business profile save error:', error);
      toast({
        title: 'Error',
        description: error?.message || 'There was a problem updating your business profile',
        variant: 'destructive',
      });
      setIsLoading(false);
    },
  });
  
  const onSubmit = (data: FormValues) => {
    setIsLoading(true);
    updateBusinessMutation.mutate(data);
  };
  
  const industries = [
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
    'Other'
  ];
  
  return (
    <div className="space-y-6">
      {/* Find Your Business — GBP first (works today), Places fallback */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-medium">Find Your Business</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Connect your Google Business Profile to auto-fill everything, or enter your details manually.
        </p>

        {/* GBP success state */}
        {gbpConnected && (
          <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
            <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0" />
            <span className="text-sm text-green-700 dark:text-green-400">
              Business info imported from Google. Review and continue.
            </span>
          </div>
        )}

        {/* GBP Connect button */}
        {!gbpConnected && (
          <Button
            type="button"
            variant="outline"
            className="w-full py-6 border-2 border-dashed hover:border-blue-500 hover:bg-blue-50/5 transition-all"
            onClick={handleConnectGbp}
            disabled={gbpConnecting}
            data-testid="connect-gbp-button"
          >
            {gbpConnecting ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Connecting to Google...
              </>
            ) : (
              <>
                <MapPin className="mr-2 h-5 w-5 text-blue-500" />
                Connect Google Business Profile
                <span className="ml-2 text-xs text-muted-foreground">(auto-fills everything)</span>
              </>
            )}
          </Button>
        )}

        {/* Optional Places Autocomplete fallback (renders only when API key is configured) */}
        {!gbpConnected && (
          <GooglePlacesAutocomplete
            onPlaceSelected={handlePlaceSelected}
            onUnavailable={() => {
              // Places key isn't set — that's fine, GBP button above is the primary path.
              // No need to surface anything to the user.
            }}
            placeholder="Or search by business name..."
          />
        )}

        {!showManualEntry && (
          <button
            type="button"
            onClick={() => setShowManualEntry(true)}
            className="text-sm text-primary hover:underline"
          >
            Or enter your details manually
          </button>
        )}
      </div>

      {/* Show the form when manual entry is toggled or a place is selected */}
      {showManualEntry && (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {placeSelected && (
              <div className="rounded-md border border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-800 p-3">
                <p className="text-sm text-green-800 dark:text-green-200">
                  We found your business details. Please review the information below and fill in any missing fields.
                </p>
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Business Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Your Business Name" {...field} />
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
                    <FormLabel>Industry</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select your industry" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {industries.map((industry) => (
                          <SelectItem key={industry} value={industry}>
                            {industry}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Business Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Briefly describe your business and services"
                      {...field}
                      rows={3}
                    />
                  </FormControl>
                  <FormDescription>
                    This will be displayed to your customers
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Business Phone</FormLabel>
                    <FormControl>
                      <Input placeholder="(555) 123-4567" {...field} />
                    </FormControl>
                    <FormDescription>Your business phone number (shown to customers)</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="ownerPhone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Your Cell Phone <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                    <FormControl>
                      <Input placeholder="(555) 987-6543" {...field} />
                    </FormControl>
                    <FormDescription>For payment alerts and account notifications only</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input placeholder="contact@yourbusiness.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="website"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Website (Optional)</FormLabel>
                  <FormControl>
                    <Input placeholder="https://www.yourbusiness.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Street Address</FormLabel>
                  <FormControl>
                    <Input placeholder="123 Business St" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 md:grid-cols-3">
              <FormField
                control={form.control}
                name="city"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>City</FormLabel>
                    <FormControl>
                      <Input placeholder="City" {...field} />
                    </FormControl>
                    <FormMessage />
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
                      <Input placeholder="State" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="zipCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Zip Code</FormLabel>
                    <FormControl>
                      <Input placeholder="12345" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Number of Locations */}
            <FormField
              control={form.control}
              name="numberOfLocations"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>How many locations does your business have?</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min={1}
                      placeholder="1"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Enter the total number of business locations you operate
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="pt-4">
              <Button
                type="submit"
                className="w-full"
                disabled={isLoading}
              >
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Business Profile
              </Button>
            </div>
          </form>
        </Form>
      )}
    </div>
  );
}