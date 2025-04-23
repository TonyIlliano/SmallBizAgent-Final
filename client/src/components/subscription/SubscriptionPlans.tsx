import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { useLocation } from 'wouter';
import { apiRequest, queryClient } from '@/lib/queryClient';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, ArrowRight } from 'lucide-react';

export function SubscriptionPlans({ businessId }: { businessId: number }) {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [selectedPlan, setSelectedPlan] = useState<number | null>(null);

  // Fetch subscription plans
  const { data: plans, isLoading: isLoadingPlans } = useQuery({
    queryKey: ['/api/subscription/plans'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/subscription/plans');
      return await res.json();
    }
  });

  // Fetch subscription status
  const { data: subscriptionStatus, isLoading: isLoadingStatus } = useQuery({
    queryKey: ['/api/subscription/status', businessId],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/subscription/status/${businessId}`);
      return await res.json();
    }
  });

  // Create subscription mutation
  const createSubscriptionMutation = useMutation({
    mutationFn: async (planId: number) => {
      const res = await apiRequest('POST', '/api/subscription/create-subscription', {
        businessId,
        planId
      });
      return await res.json();
    },
    onSuccess: (data) => {
      // Redirect to the checkout page with the client secret
      navigate(`/subscribe?clientSecret=${data.clientSecret}&businessId=${businessId}&subscriptionId=${data.subscriptionId}`);
    },
    onError: (error: any) => {
      toast({
        title: 'Subscription Failed',
        description: error.message || 'Failed to create subscription',
        variant: 'destructive',
      });
    },
  });

  // Cancel subscription mutation
  const cancelSubscriptionMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/subscription/cancel/${businessId}`);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/subscription/status', businessId] });
      toast({
        title: 'Subscription Cancelled',
        description: 'Your subscription will be cancelled at the end of the billing period',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to cancel subscription',
        variant: 'destructive',
      });
    },
  });

  // Resume subscription mutation
  const resumeSubscriptionMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/subscription/resume/${businessId}`);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/subscription/status', businessId] });
      toast({
        title: 'Subscription Resumed',
        description: 'Your subscription has been resumed',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to resume subscription',
        variant: 'destructive',
      });
    },
  });

  const handleSelectPlan = (id: number) => {
    setSelectedPlan(id);
  };

  const handleSubscribe = () => {
    if (selectedPlan) {
      createSubscriptionMutation.mutate(selectedPlan);
    } else {
      toast({
        title: 'No Plan Selected',
        description: 'Please select a subscription plan',
        variant: 'destructive',
      });
    }
  };

  const handleCancelSubscription = () => {
    if (window.confirm('Are you sure you want to cancel your subscription? You will still have access until the end of your billing period.')) {
      cancelSubscriptionMutation.mutate();
    }
  };

  const handleResumeSubscription = () => {
    resumeSubscriptionMutation.mutate();
  };

  if (isLoadingPlans || isLoadingStatus) {
    return (
      <div className="flex justify-center items-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // If active subscription, show current plan info
  if (subscriptionStatus?.status === 'active') {
    const currentPlan = plans?.find(p => p.id.toString() === subscriptionStatus.planId);
    return (
      <div className="space-y-6">
        <div className="bg-green-50 border border-green-200 rounded-md p-4 flex items-start">
          <CheckCircle2 className="text-green-500 mr-3 h-5 w-5 mt-0.5" />
          <div>
            <h3 className="font-medium text-green-800">Active Subscription</h3>
            <p className="text-green-700 text-sm">
              You have an active subscription to {currentPlan?.name || 'SmallBizAgent'}.
            </p>
          </div>
        </div>

        {currentPlan && (
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>{currentPlan.name}</CardTitle>
                <Badge variant="outline" className="bg-primary/10 text-primary">Active</Badge>
              </div>
              <CardDescription>
                ${currentPlan.price} per {currentPlan.interval}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <h4 className="font-medium mb-2">Included Features:</h4>
              <ul className="space-y-1">
                {currentPlan.features && JSON.parse(currentPlan.features).map((feature: string, index: number) => (
                  <li key={index} className="flex items-center">
                    <CheckCircle2 className="h-4 w-4 text-green-500 mr-2" />
                    <span className="text-sm">{feature}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter>
              <Button variant="outline" onClick={handleCancelSubscription} disabled={cancelSubscriptionMutation.isPending}>
                {cancelSubscriptionMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Cancel Subscription
              </Button>
            </CardFooter>
          </Card>
        )}

        <div className="text-sm text-muted-foreground">
          Your subscription will automatically renew every {currentPlan?.interval || 'billing period'}.
          {subscriptionStatus.currentPeriodEnd && (
            <> The next billing date is {new Date(subscriptionStatus.currentPeriodEnd).toLocaleDateString()}.</>
          )}
        </div>
      </div>
    );
  }

  // If canceled but not expired
  if (subscriptionStatus?.status === 'active' && subscriptionStatus?.cancelAtPeriodEnd) {
    const currentPlan = plans?.find(p => p.id.toString() === subscriptionStatus.planId);
    return (
      <div className="space-y-6">
        <div className="bg-amber-50 border border-amber-200 rounded-md p-4 flex items-start">
          <CheckCircle2 className="text-amber-500 mr-3 h-5 w-5 mt-0.5" />
          <div>
            <h3 className="font-medium text-amber-800">Subscription Canceling</h3>
            <p className="text-amber-700 text-sm">
              Your subscription has been canceled but will remain active until the end of the current billing period
              {subscriptionStatus.currentPeriodEnd && (
                <span> ({new Date(subscriptionStatus.currentPeriodEnd).toLocaleDateString()})</span>
              )}.
            </p>
          </div>
        </div>

        {currentPlan && (
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>{currentPlan.name}</CardTitle>
                <Badge variant="outline" className="bg-amber-500/10 text-amber-600">Canceling</Badge>
              </div>
              <CardDescription>
                ${currentPlan.price} per {currentPlan.interval}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <h4 className="font-medium mb-2">Included Features:</h4>
              <ul className="space-y-1">
                {currentPlan.features && JSON.parse(currentPlan.features).map((feature: string, index: number) => (
                  <li key={index} className="flex items-center">
                    <CheckCircle2 className="h-4 w-4 text-green-500 mr-2" />
                    <span className="text-sm">{feature}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter>
              <Button onClick={handleResumeSubscription} disabled={resumeSubscriptionMutation.isPending}>
                {resumeSubscriptionMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Resume Subscription
              </Button>
            </CardFooter>
          </Card>
        )}
      </div>
    );
  }

  // If no active subscription or expired, show plan options
  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold tracking-tight">Choose a Subscription Plan</h2>
        <p className="text-muted-foreground mt-2">
          Select the plan that works best for your business
        </p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {plans?.map((plan: any) => (
          <Card 
            key={plan.id} 
            className={`transition-all ${selectedPlan === plan.id ? 'border-2 border-primary shadow-lg' : 'hover:shadow-md'}`}
            onClick={() => handleSelectPlan(plan.id)}
          >
            <CardHeader>
              <CardTitle className="flex justify-between items-center">
                {plan.name}
                {plan.interval === 'yearly' && (
                  <Badge className="bg-green-100 text-green-800 hover:bg-green-200">Save 17%</Badge>
                )}
              </CardTitle>
              <CardDescription>
                <span className="text-2xl font-bold">${plan.price}</span>
                <span className="text-muted-foreground"> per {plan.interval}</span>
              </CardDescription>
            </CardHeader>
            <CardContent>
              <h4 className="font-medium mb-2">Included Features:</h4>
              <ul className="space-y-1">
                {plan.features && JSON.parse(plan.features).map((feature: string, index: number) => (
                  <li key={index} className="flex items-center">
                    <CheckCircle2 className="h-4 w-4 text-green-500 mr-2" />
                    <span className="text-sm">{feature}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter>
              <Button 
                variant={selectedPlan === plan.id ? "default" : "outline"} 
                className="w-full"
                onClick={() => {
                  handleSelectPlan(plan.id);
                  handleSubscribe();
                }}
              >
                {selectedPlan === plan.id && createSubscriptionMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <>
                    Select Plan
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}