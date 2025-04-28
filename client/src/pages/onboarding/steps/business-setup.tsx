import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

const businessProfileSchema = z.object({
  name: z.string().min(1, 'Business name is required'),
  phone: z.string().min(10, 'Please enter a valid phone number').max(20),
  email: z.string().email('Please enter a valid email address'),
  website: z.string().url('Please enter a valid URL').optional().or(z.literal('')),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
});

interface BusinessSetupProps {
  onComplete: () => void;
}

export default function BusinessSetup({ onComplete }: BusinessSetupProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const form = useForm<z.infer<typeof businessProfileSchema>>({
    resolver: zodResolver(businessProfileSchema),
    defaultValues: {
      name: '',
      phone: '',
      email: user?.email || '',
      website: '',
      address: '',
      city: '',
      state: '',
      zip: '',
    },
  });
  
  const businessMutation = useMutation({
    mutationFn: async (data: z.infer<typeof businessProfileSchema>) => {
      // We'll update the current business or create a new one if needed
      // For now assume businessId is 1 or user's businessId if available
      const businessId = user?.businessId || 1;
      
      try {
        const res = await apiRequest("PUT", `/api/business/${businessId}`, data);
        return await res.json();
      } catch (error) {
        // If business doesn't exist, create a new one
        const res = await apiRequest("POST", `/api/business`, data);
        return await res.json();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/business'] });
      toast({
        title: "Success",
        description: "Business profile saved successfully",
      });
      
      // Handle any additional onboarding data
      localStorage.setItem('onboardingBusinessComplete', 'true');
      
      onComplete();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "There was a problem saving your business profile",
        variant: "destructive",
      });
      setIsSubmitting(false);
    },
  });
  
  const onSubmit = (data: z.infer<typeof businessProfileSchema>) => {
    setIsSubmitting(true);
    businessMutation.mutate(data);
  };
  
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Tell us about your business</h2>
        <p className="text-muted-foreground">
          This information will be used on your invoices and customer communications
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Business Name</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="Acme Services" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone Number</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="(555) 123-4567" />
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
                  <FormLabel>Email Address</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="contact@example.com" />
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
                <FormLabel>Website</FormLabel>
                <FormControl>
                  <Input {...field} placeholder="https://example.com" />
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
                  <Input {...field} placeholder="123 Main St" />
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
                    <Input {...field} placeholder="New York" />
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
                    <Input {...field} placeholder="NY" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <FormField
              control={form.control}
              name="zip"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>ZIP Code</FormLabel>
                  <FormControl>
                    <Input {...field} placeholder="10001" />
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
              disabled={isSubmitting}
            >
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Business Information
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}