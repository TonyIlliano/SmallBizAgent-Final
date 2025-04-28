import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { v4 as uuidv4 } from 'uuid';

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
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

const serviceItemSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Service name is required'),
  description: z.string().optional(),
  price: z.coerce.number().min(0, 'Price must be a positive number'),
  duration: z.coerce.number().min(15, 'Duration must be at least 15 minutes'),
});

const servicesFormSchema = z.object({
  services: z.array(serviceItemSchema).min(1, 'Add at least one service'),
});

interface ServicesSetupProps {
  onComplete: () => void;
}

export default function ServicesSetup({ onComplete }: ServicesSetupProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Fetch existing services if any
  const { data: existingServices, isLoading } = useQuery({
    queryKey: ['/api/services'],
    queryFn: async () => {
      try {
        const res = await apiRequest('GET', '/api/services');
        const data = await res.json();
        return data;
      } catch (error) {
        return [];
      }
    }
  });
  
  const form = useForm<z.infer<typeof servicesFormSchema>>({
    resolver: zodResolver(servicesFormSchema),
    defaultValues: {
      services: existingServices?.length ? existingServices.map((service: any) => ({
        id: service.id,
        name: service.name,
        description: service.description || '',
        price: service.price,
        duration: service.duration,
      })) : [
        { id: uuidv4(), name: '', description: '', price: 0, duration: 60 }
      ]
    },
  });
  
  // Update form when existing services are loaded
  useState(() => {
    if (existingServices?.length) {
      form.reset({
        services: existingServices.map((service: any) => ({
          id: service.id,
          name: service.name,
          description: service.description || '',
          price: service.price,
          duration: service.duration,
        }))
      });
    }
  });
  
  const servicesMutation = useMutation({
    mutationFn: async (data: z.infer<typeof servicesFormSchema>) => {
      const businessId = user?.businessId || 1;
      
      // Process each service (create new or update existing)
      const servicePromises = data.services.map(service => {
        const serviceData = {
          ...service,
          businessId
        };
        
        if (service.id && !service.id.startsWith('temp_')) {
          // Update existing service
          return apiRequest("PUT", `/api/services/${service.id}`, serviceData);
        } else {
          // Create new service
          delete serviceData.id;
          return apiRequest("POST", `/api/services`, serviceData);
        }
      });
      
      return Promise.all(servicePromises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/services'] });
      toast({
        title: "Success",
        description: "Services saved successfully",
      });
      
      // Mark this step as complete
      localStorage.setItem('onboardingServicesComplete', 'true');
      
      onComplete();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "There was a problem saving your services",
        variant: "destructive",
      });
      setIsSubmitting(false);
    },
  });
  
  const onSubmit = (data: z.infer<typeof servicesFormSchema>) => {
    setIsSubmitting(true);
    servicesMutation.mutate(data);
  };
  
  const addService = () => {
    const services = form.getValues().services;
    form.setValue('services', [
      ...services, 
      { id: `temp_${uuidv4()}`, name: '', description: '', price: 0, duration: 60 }
    ]);
  };
  
  const removeService = (index: number) => {
    const services = form.getValues().services;
    if (services.length <= 1) {
      toast({
        title: "Cannot remove service",
        description: "You need at least one service",
        variant: "destructive",
      });
      return;
    }
    
    services.splice(index, 1);
    form.setValue('services', [...services]);
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
        <h2 className="text-2xl font-bold mb-2">Add Your Services</h2>
        <p className="text-muted-foreground">
          Define the services your business offers with prices and durations
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {form.getValues().services.map((_, index) => (
            <Card key={index} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-medium">Service #{index + 1}</h3>
                  <Button 
                    type="button" 
                    variant="ghost" 
                    size="icon"
                    onClick={() => removeService(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name={`services.${index}.name`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Service Name</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="E.g. Basic Consultation" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name={`services.${index}.description`}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description (Optional)</FormLabel>
                        <FormControl>
                          <Textarea 
                            {...field} 
                            placeholder="Brief description of the service"
                            rows={2}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name={`services.${index}.price`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Price ($)</FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              type="number" 
                              min={0} 
                              step={0.01}
                              placeholder="0.00"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={form.control}
                      name={`services.${index}.duration`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Duration (minutes)</FormLabel>
                          <FormControl>
                            <Input 
                              {...field} 
                              type="number" 
                              min={15} 
                              step={15}
                              placeholder="60"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          
          <Button
            type="button"
            variant="outline"
            onClick={addService}
            className="w-full"
          >
            <Plus className="mr-2 h-4 w-4" />
            Add Another Service
          </Button>
          
          <div className="pt-4">
            <Button 
              type="submit" 
              className="w-full"
              disabled={isSubmitting}
            >
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Services
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}