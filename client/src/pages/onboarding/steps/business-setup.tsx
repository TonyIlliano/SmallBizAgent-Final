import { useState } from 'react';
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
import { Loader2 } from 'lucide-react';

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
});

type FormValues = z.infer<typeof formSchema>;

export default function BusinessSetup({ onComplete }: BusinessSetupProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  
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
    },
  });
  
  // Fetch existing business if available
  const businessId = user?.businessId;
  
  // Mutation to update business
  const updateBusinessMutation = useMutation({
    mutationFn: async (data: FormValues) => {
      let response;
      if (businessId) {
        response = await apiRequest('PUT', `/api/business/${businessId}`, data);
      } else {
        response = await apiRequest('POST', '/api/business', data);
      }
      return response.json();
    },
    onSuccess: async (business) => {
      // If we have a stored plan selection, create the subscription now
      const selectedPlanId = localStorage.getItem('selectedPlanId');
      if (selectedPlanId && business.id) {
        try {
          await apiRequest('POST', '/api/subscription/create-subscription', {
            businessId: business.id,
            planId: parseInt(selectedPlanId)
          });
          localStorage.removeItem('selectedPlanId');
        } catch (subError) {
          console.error('Error creating subscription:', subError);
          // Continue anyway - subscription can be set up later
        }
      }

      // Invalidate and WAIT for user query to refresh so businessId is available
      await queryClient.invalidateQueries({ queryKey: ['/api/user'] });
      await queryClient.refetchQueries({ queryKey: ['/api/user'] });
      queryClient.invalidateQueries({ queryKey: ['/api/business'] });

      toast({
        title: 'Business profile updated',
        description: 'Your business information has been saved',
      });

      // Small delay to ensure React state updates
      await new Promise(resolve => setTimeout(resolve, 500));

      // Move to next step (progress is tracked by the onboarding index)
      onComplete();
    },
    onError: () => {
      toast({
        title: 'Error',
        description: 'There was a problem updating your business profile',
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
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
    </div>
  );
}