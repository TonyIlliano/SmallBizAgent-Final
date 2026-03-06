import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Check, Loader2, Tag, ExternalLink } from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';

// Define the plan type
interface Plan {
  id: number;
  name: string;
  description: string;
  planTier: string;
  price: number;
  interval: string;
  features: string[];
  maxCallMinutes: number;
  overageRatePerMinute: number;
  maxStaff: number | null;
  active: boolean;
  sortOrder: number;
}

export function SubscriptionPlans({ businessId }: { businessId: number }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [selectedPlan, setSelectedPlan] = useState<number | null>(null);
  const [billingInterval, setBillingInterval] = useState<'monthly' | 'yearly'>('monthly');
  const [promoCode, setPromoCode] = useState('');
  const [promoError, setPromoError] = useState<string | null>(null);
  const [promoSuccess, setPromoSuccess] = useState<string | null>(null);
  const [showPromoInput, setShowPromoInput] = useState(false);

  // Fetch all available plans
  const { data: plans = [], isLoading: isLoadingPlans } = useQuery<Plan[]>({
    queryKey: ['/api/subscription/plans'],
    enabled: !!user,
  });

  // Fetch current subscription status
  const { data: subscriptionStatus, isLoading: isLoadingStatus } = useQuery<any>({
    queryKey: ['/api/subscription/status', businessId],
    enabled: !!businessId,
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
      toast({
        title: 'Subscription created',
        description: 'You will be redirected to complete payment',
      });
      
      queryClient.invalidateQueries({ queryKey: ['/api/subscription/status', businessId] });
      
      // If we have a client secret, redirect to payment page
      if (data.clientSecret) {
        navigate('/payment?clientSecret=' + data.clientSecret);
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to create subscription',
        description: error.message,
        variant: 'destructive',
      });
    }
  });

  // Cancel subscription mutation
  const cancelSubscriptionMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/subscription/cancel/${businessId}`);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: 'Subscription canceled',
        description: 'Your subscription will end at the end of the current billing period',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/subscription/status', businessId] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to cancel subscription',
        description: error.message,
        variant: 'destructive',
      });
    }
  });

  // Resume subscription mutation
  const resumeSubscriptionMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/subscription/resume/${businessId}`);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: 'Subscription resumed',
        description: 'Your subscription has been resumed',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/subscription/status', businessId] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to resume subscription',
        description: error.message,
        variant: 'destructive',
      });
    }
  });

  // Apply promo code to existing subscription
  const applyPromoMutation = useMutation({
    mutationFn: async (code: string) => {
      const res = await apiRequest('POST', `/api/subscription/apply-promo/${businessId}`, { code });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed to apply promo code');
      return data;
    },
    onSuccess: (data) => {
      setPromoSuccess(data.description || 'Promo code applied!');
      setPromoError(null);
      setPromoCode('');
      toast({
        title: 'Promo code applied',
        description: data.description || 'The discount has been applied to your subscription.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/subscription/status', businessId] });
    },
    onError: (error: Error) => {
      setPromoError(error.message);
      setPromoSuccess(null);
    },
  });

  // Open Stripe Billing Portal
  const billingPortalMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/subscription/billing-portal/${businessId}`, {
        returnUrl: window.location.href,
      });
      return await res.json();
    },
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Unable to open billing portal',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Change plan (upgrade/downgrade)
  const changePlanMutation = useMutation({
    mutationFn: async (planId: number) => {
      const res = await apiRequest('POST', `/api/subscription/change-plan/${businessId}`, { planId });
      return await res.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Plan changed',
        description: data.message || 'Your subscription plan has been updated.',
      });
      setChangePlanTarget(null);
      queryClient.invalidateQueries({ queryKey: ['/api/subscription/status', businessId] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to change plan',
        description: error.message,
        variant: 'destructive',
      });
      setChangePlanTarget(null);
    },
  });

  const [changePlanTarget, setChangePlanTarget] = useState<Plan | null>(null);

  const handleApplyPromo = () => {
    if (!promoCode.trim()) return;
    setPromoError(null);
    setPromoSuccess(null);
    applyPromoMutation.mutate(promoCode.trim());
  };

  const isLoading = isLoadingPlans || isLoadingStatus;
  const isPendingAction = createSubscriptionMutation.isPending ||
    cancelSubscriptionMutation.isPending ||
    resumeSubscriptionMutation.isPending ||
    changePlanMutation.isPending;
  
  const isSubscribed = subscriptionStatus?.status === 'active' || 
    subscriptionStatus?.status === 'trialing';
  
  const isCanceling = subscriptionStatus?.cancelAtPeriodEnd;

  const handleSelectPlan = (planId: number) => {
    setSelectedPlan(planId);
  };

  const handleSubscribe = () => {
    if (selectedPlan) {
      createSubscriptionMutation.mutate(selectedPlan);
    } else {
      toast({
        title: 'Please select a plan',
        description: 'You need to select a subscription plan before proceeding',
        variant: 'destructive',
      });
    }
  };

  const handleCancel = () => {
    cancelSubscriptionMutation.mutate();
  };

  const handleResume = () => {
    resumeSubscriptionMutation.mutate();
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-48">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Filter plans by selected billing interval
  const filteredPlans = plans?.filter((p: Plan) => p.interval === billingInterval) || [];

  return (
    <div className="container mx-auto py-8">
      <h2 className="text-3xl font-bold mb-2">Subscription Plans</h2>
      <p className="text-muted-foreground mb-4">
        Choose the plan that's right for your business
      </p>

      {/* Billing interval toggle */}
      <div className="flex items-center gap-3 mb-8">
        <button
          onClick={() => setBillingInterval('monthly')}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-colors border ${
            billingInterval === 'monthly'
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-muted text-muted-foreground border-border hover:bg-accent'
          }`}
        >
          Monthly
        </button>
        <button
          onClick={() => setBillingInterval('yearly')}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-colors border ${
            billingInterval === 'yearly'
              ? 'bg-primary text-primary-foreground border-primary'
              : 'bg-muted text-muted-foreground border-border hover:bg-accent'
          }`}
        >
          Annual <span className="text-green-500 ml-1">Save 20%</span>
        </button>
      </div>

      {isSubscribed && !isCanceling && (
        <div className="mb-8 p-4 bg-muted rounded-lg">
          <h3 className="text-lg font-semibold">Current Subscription</h3>
          <p>You're currently subscribed to the {subscriptionStatus?.plan?.name} plan.</p>
          <p className="text-sm text-muted-foreground mt-2">
            Your next billing date is {new Date(subscriptionStatus?.currentPeriodEnd).toLocaleDateString()}.
          </p>
          <div className="flex items-center gap-3 mt-4 flex-wrap">
            <Button
              variant="default"
              onClick={() => billingPortalMutation.mutate()}
              disabled={billingPortalMutation.isPending}
            >
              {billingPortalMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-2 h-4 w-4" />}
              Manage Billing
            </Button>
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={isPendingAction}
            >
              {cancelSubscriptionMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Cancel Subscription
            </Button>
            {!showPromoInput && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowPromoInput(true)}
              >
                <Tag className="mr-2 h-4 w-4" />
                Apply Promo Code
              </Button>
            )}
          </div>
          {showPromoInput && (
            <div className="mt-4 p-3 rounded-lg border bg-background">
              <p className="text-sm font-medium mb-2">Enter promo code</p>
              <div className="flex gap-2">
                <Input
                  placeholder="e.g. LAUNCH20"
                  value={promoCode}
                  onChange={(e) => {
                    setPromoCode(e.target.value.toUpperCase());
                    setPromoError(null);
                    setPromoSuccess(null);
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && handleApplyPromo()}
                  className="flex-1"
                />
                <Button
                  onClick={handleApplyPromo}
                  disabled={!promoCode.trim() || applyPromoMutation.isPending}
                  size="sm"
                >
                  {applyPromoMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Apply'
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowPromoInput(false);
                    setPromoCode('');
                    setPromoError(null);
                    setPromoSuccess(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
              {promoError && (
                <p className="text-sm text-red-600 mt-2">{promoError}</p>
              )}
              {promoSuccess && (
                <p className="text-sm text-green-600 mt-2">{promoSuccess}</p>
              )}
            </div>
          )}
        </div>
      )}

      {isSubscribed && isCanceling && (
        <div className="mb-8 p-4 bg-muted rounded-lg">
          <h3 className="text-lg font-semibold">Subscription Cancellation</h3>
          <p>Your subscription will be canceled at the end of the current billing period.</p>
          <p className="text-sm text-muted-foreground mt-2">
            Access ends on {new Date(subscriptionStatus?.currentPeriodEnd).toLocaleDateString()}.
          </p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={handleResume}
            disabled={isPendingAction}
          >
            {isPendingAction && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Resume Subscription
          </Button>
        </div>
      )}

      <div className="grid gap-8 md:grid-cols-3">
        {filteredPlans.map((plan: Plan) => (
          <Card
            key={plan.id}
            className={`flex flex-col h-full ${selectedPlan === plan.id ? 'border-primary ring-2 ring-primary' : ''} ${plan.planTier === 'professional' ? 'border-primary' : ''}`}
          >
            {plan.planTier === 'professional' && (
              <div className="text-center py-1 bg-primary text-primary-foreground text-xs font-semibold rounded-t-lg">
                Most Popular
              </div>
            )}
            <CardHeader>
              <CardTitle className="text-2xl font-bold">{plan.name}</CardTitle>
              <CardDescription className="mt-2">{plan.description}</CardDescription>
              <div className="mt-4">
                <span className="text-3xl font-bold">
                  ${billingInterval === 'yearly' ? Math.round(plan.price / 12) : plan.price}
                </span>
                <span className="text-muted-foreground ml-1">/month</span>
              </div>
              {billingInterval === 'yearly' && (
                <p className="text-xs text-green-600 mt-1">
                  Billed annually at ${plan.price}/yr
                </p>
              )}
              <p className="text-xs text-muted-foreground mt-2">
                ${plan.overageRatePerMinute?.toFixed(2)}/min overage
              </p>
            </CardHeader>
            <CardContent className="flex-grow">
              <Separator className="my-4" />
              <h4 className="font-semibold mb-4">Features</h4>
              <ul className="space-y-2">
                {plan.features?.map((feature, i) => (
                  <li key={i} className="flex items-start">
                    <Check className="h-5 w-5 text-green-500 mr-2 flex-shrink-0" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
            <CardFooter>
              {!isSubscribed ? (
                <Button
                  className="w-full"
                  onClick={() => handleSelectPlan(plan.id)}
                  variant={selectedPlan === plan.id ? "default" : "outline"}
                  disabled={isPendingAction}
                >
                  {selectedPlan === plan.id ? 'Selected' : 'Select Plan'}
                </Button>
              ) : (
                subscriptionStatus?.plan?.id === plan.id ? (
                  <Button className="w-full" variant="outline" disabled>
                    Current Plan
                  </Button>
                ) : (
                  <Button
                    className="w-full"
                    variant="outline"
                    disabled={isPendingAction}
                    onClick={() => setChangePlanTarget(plan)}
                  >
                    {changePlanMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    {plan.price > (subscriptionStatus?.plan?.price || 0) ? 'Upgrade' : 'Downgrade'} to {plan.name}
                  </Button>
                )
              )}
            </CardFooter>
          </Card>
        ))}
      </div>

      {!isSubscribed && selectedPlan && (
        <div className="mt-8 flex justify-center">
          <Button
            size="lg"
            onClick={handleSubscribe}
            disabled={isPendingAction}
          >
            {isPendingAction && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Subscribe Now
          </Button>
        </div>
      )}

      {/* Plan change confirmation dialog */}
      {changePlanTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setChangePlanTarget(null)}>
          <div className="bg-background rounded-lg p-6 max-w-md mx-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-2">
              {changePlanTarget.price > (subscriptionStatus?.plan?.price || 0) ? 'Upgrade' : 'Downgrade'} to {changePlanTarget.name}?
            </h3>
            <p className="text-sm text-muted-foreground mb-1">
              {changePlanTarget.price > (subscriptionStatus?.plan?.price || 0)
                ? 'You\'ll be charged a prorated amount for the remainder of your current billing period.'
                : 'You\'ll receive a prorated credit on your next invoice.'}
            </p>
            <p className="text-sm text-muted-foreground mb-4">
              New price: <strong>${changePlanTarget.price}/{changePlanTarget.interval === 'yearly' ? 'year' : 'month'}</strong>
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setChangePlanTarget(null)}>
                Cancel
              </Button>
              <Button
                onClick={() => changePlanMutation.mutate(changePlanTarget.id)}
                disabled={changePlanMutation.isPending}
              >
                {changePlanMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirm Change
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}