import { useState, useEffect } from 'react';
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
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Plus, Edit2, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';

interface ServicesSetupProps {
  onComplete: () => void;
}

// Service form schema
const serviceFormSchema = z.object({
  name: z.string().min(2, 'Service name must be at least 2 characters'),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  priceType: z.enum(['fixed', 'hourly', 'variable']),
  basePrice: z.coerce.number().min(0, 'Price must be a positive number'),
  duration: z.coerce.number().min(0, 'Duration must be a positive number').optional(),
});

type ServiceFormValues = z.infer<typeof serviceFormSchema>;

interface Service extends ServiceFormValues {
  id: number;
  businessId: number;
}

export default function ServicesSetup({ onComplete }: ServicesSetupProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [currentService, setCurrentService] = useState<Service | null>(null);
  
  const businessId = user?.businessId || 1;
  
  // Fetch services for the business
  const { data: services = [], isLoading: isLoadingServices } = useQuery<Service[]>({
    queryKey: ['/api/services', { businessId }],
  });
  
  const form = useForm<ServiceFormValues>({
    resolver: zodResolver(serviceFormSchema),
    defaultValues: {
      name: '',
      description: '',
      priceType: 'fixed',
      basePrice: 0,
      duration: 60, // Default 60 minutes
    },
  });
  
  // Reset form when dialog opens/closes
  useEffect(() => {
    if (showDialog && currentService) {
      form.reset({
        name: currentService.name,
        description: currentService.description,
        priceType: currentService.priceType,
        basePrice: currentService.basePrice,
        duration: currentService.duration,
      });
    } else if (showDialog) {
      form.reset({
        name: '',
        description: '',
        priceType: 'fixed',
        basePrice: 0,
        duration: 60,
      });
    }
  }, [showDialog, currentService, form]);
  
  // Create service mutation
  const createServiceMutation = useMutation({
    mutationFn: async (data: ServiceFormValues) => {
      const payload = {
        ...data,
        businessId,
      };
      
      if (currentService) {
        return apiRequest('PUT', `/api/services/${currentService.id}`, payload);
      } else {
        return apiRequest('POST', '/api/services', payload);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/services'] });
      toast({
        title: currentService ? 'Service updated' : 'Service added',
        description: currentService ? 'Service has been updated' : 'New service has been added',
      });
      
      setShowDialog(false);
      setCurrentService(null);
      setIsSubmitting(false);
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: `There was a problem ${currentService ? 'updating' : 'adding'} the service`,
        variant: 'destructive',
      });
      setIsSubmitting(false);
    },
  });
  
  // Delete service mutation
  const deleteServiceMutation = useMutation({
    mutationFn: async (serviceId: number) => {
      return apiRequest('DELETE', `/api/services/${serviceId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/services'] });
      toast({
        title: 'Service deleted',
        description: 'Service has been removed',
      });
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: 'There was a problem deleting the service',
        variant: 'destructive',
      });
    },
  });
  
  const onSubmit = (data: ServiceFormValues) => {
    setIsSubmitting(true);
    createServiceMutation.mutate(data);
  };
  
  const handleDelete = (serviceId: number) => {
    deleteServiceMutation.mutate(serviceId);
  };
  
  const handleEdit = (service: Service) => {
    setCurrentService(service);
    setShowDialog(true);
  };
  
  const formatPrice = (price: number, priceType: string) => {
    const formattedPrice = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(price);
    
    if (priceType === 'hourly') {
      return `${formattedPrice}/hr`;
    } else if (priceType === 'variable') {
      return `From ${formattedPrice}`;
    }
    
    return formattedPrice;
  };
  
  const handleComplete = () => {
    localStorage.setItem('onboardingServicesComplete', 'true');
    onComplete();
  };
  
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">Your Services</h3>
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogTrigger asChild>
            <Button size="sm" className="flex items-center gap-1">
              <Plus className="h-4 w-4" />
              Add Service
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {currentService ? 'Edit Service' : 'Add New Service'}
              </DialogTitle>
            </DialogHeader>
            
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 mt-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Service Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g. Basic Plumbing Service" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Describe what's included in this service" 
                          {...field}
                          rows={3}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="priceType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Price Type</FormLabel>
                        <FormControl>
                          <select
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                            {...field}
                          >
                            <option value="fixed">Fixed Price</option>
                            <option value="hourly">Hourly Rate</option>
                            <option value="variable">Variable/Range</option>
                          </select>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="basePrice"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Base Price ($)</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="0.00"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                
                <FormField
                  control={form.control}
                  name="duration"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Typical Duration (minutes)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="0"
                          placeholder="e.g. 60"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <div className="flex justify-end gap-2 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowDialog(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {currentService ? 'Update Service' : 'Add Service'}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>
      
      {isLoadingServices ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : services.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center">
            <p className="text-muted-foreground mb-4">
              You haven't added any services yet.
            </p>
            <Button
              variant="outline"
              onClick={() => setShowDialog(true)}
              className="gap-1"
            >
              <Plus className="h-4 w-4" />
              Add Your First Service
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {services.map((service) => (
            <Card key={service.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex justify-between items-start">
                  <span>{service.name}</span>
                  <span className="text-primary font-medium">
                    {formatPrice(service.basePrice, service.priceType)}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-4">
                <p className="text-sm text-muted-foreground mb-4">{service.description}</p>
                <div className="flex justify-between items-center">
                  {service.duration ? (
                    <span className="text-xs bg-muted px-2 py-1 rounded-full">
                      Duration: {service.duration} mins
                    </span>
                  ) : (
                    <span></span> 
                  )}
                  <div className="flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => handleEdit(service)}
                    >
                      <Edit2 className="h-4 w-4" />
                      <span className="sr-only">Edit</span>
                    </Button>
                    
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                          <span className="sr-only">Delete</span>
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Service</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete {service.name}? This action cannot be undone.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction 
                            className="bg-destructive text-destructive-foreground"
                            onClick={() => handleDelete(service.id)}
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      
      <div className="pt-6 flex justify-end">
        <Button 
          onClick={handleComplete}
          disabled={services.length === 0}
        >
          {services.length === 0 ? 'Add at least one service to continue' : 'Continue to next step'}
        </Button>
      </div>
    </div>
  );
}