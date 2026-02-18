import { useState, useCallback } from 'react';
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
import { Loader2, Search, Building2 } from 'lucide-react';
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

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      description: '',
      industry: '',
      phone: '',
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
      // If we have a stored plan selection, create the subscription now
      const selectedPlanId = localStorage.getItem('selectedPlanId');
      if (selectedPlanId && business.id) {
        const parsedPlanId = parseInt(selectedPlanId);
        if (!isNaN(parsedPlanId) && parsedPlanId > 0) {
          try {
            await apiRequest('POST', '/api/subscription/create-subscription', {
              businessId: business.id,
              planId: parsedPlanId
            });
            localStorage.removeItem('selectedPlanId');
          } catch (subError) {
            console.error('Error creating subscription:', subError);
            toast({
              title: 'Subscription notice',
              description: 'Your business was saved, but we had trouble setting up your subscription. You can set it up from Settings later.',
              variant: 'destructive',
            });
          }
        } else {
          localStorage.removeItem('selectedPlanId');
        }
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
      {/* Google Places Business Search */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-medium">Find Your Business</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Search for your business to auto-fill your details, or enter them manually.
        </p>
        <GooglePlacesAutocomplete
          onPlaceSelected={handlePlaceSelected}
          placeholder="Type your business name..."
        />
        {!showManualEntry && (
          <button
            type="button"
            onClick={() => setShowManualEntry(true)}
            className="text-sm text-primary hover:underline"
          >
            Can't find your business? Enter details manually
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
                    <FormLabel>Phone Number</FormLabel>
                    <FormControl>
                      <Input placeholder="(555) 123-4567" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

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