import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Check, ArrowRight, Loader2 } from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';

interface Plan {
  id: number;
  name: string;
  description: string;
  price: number;
  interval: string;
  features: string[];
  active: boolean;
  sortOrder: number;
}

export default function OnboardingSubscription() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [selectedPlan, setSelectedPlan] = useState<number | null>(null);
  const [isCreatingSubscription, setIsCreatingSubscription] = useState(false);

  // Redirect to dashboard if user is not authenticated
  useEffect(() => {
    if (!user) {
      navigate('/auth');
    }
  }, [user, navigate]);

  // Fetch all available plans
  const { data: plans, isLoading: isLoadingPlans } = useQuery({
    queryKey: ['/api/subscription/plans'],
    enabled: !!user,
  });

  const handleSelectPlan = (planId: number) => {
    setSelectedPlan(planId);
  };

  const handleContinue = async () => {
    if (!selectedPlan) return;
    
    try {
      setIsCreatingSubscription(true);
      
      // Get the business ID for the current user
      const businessRes = await apiRequest('GET', '/api/business');
      const business = await businessRes.json();
      
      // Create a subscription with the selected plan
      const res = await apiRequest('POST', '/api/subscription/create-subscription', {
        businessId: business.id,
        planId: selectedPlan
      });
      const data = await res.json();
      
      // Invalidate any cached subscription data
      queryClient.invalidateQueries({ queryKey: ['/api/subscription/status', business.id] });
      
      // Redirect to payment page if we have a client secret
      if (data.clientSecret) {
        navigate('/payment?clientSecret=' + data.clientSecret);
      } else {
        // If no payment is required (e.g., free trial), go to dashboard
        navigate('/');
      }
    } catch (error) {
      console.error('Error creating subscription:', error);
    } finally {
      setIsCreatingSubscription(false);
    }
  };

  if (isLoadingPlans) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-4 border-primary rounded-full border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted py-12">
      <div className="container mx-auto max-w-5xl px-4">
        <div className="mb-10 text-center">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Choose Your Plan</h1>
          <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
            Select the subscription plan that works best for your business. All plans include our core features with the flexibility to upgrade as your business grows.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 mb-8">
          {plans?.map((plan: Plan) => (
            <Card 
              key={plan.id} 
              className={`flex flex-col h-full hover:shadow-md transition-shadow ${selectedPlan === plan.id ? 'ring-2 ring-primary' : ''}`}
              onClick={() => handleSelectPlan(plan.id)}
            >
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-2xl font-bold">{plan.name}</CardTitle>
                    <CardDescription className="mt-2">{plan.description}</CardDescription>
                  </div>
                  <Badge variant={plan.interval === 'monthly' ? 'default' : 'secondary'}>
                    {plan.interval === 'monthly' ? 'Monthly' : 'Annual'}
                  </Badge>
                </div>
                <div className="mt-4">
                  <span className="text-4xl font-bold">${plan.price}</span>
                  <span className="text-muted-foreground ml-1">
                    /{plan.interval === 'monthly' ? 'month' : 'year'}
                  </span>
                </div>
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
                <Button 
                  className="w-full" 
                  variant={selectedPlan === plan.id ? "default" : "outline"}
                  onClick={() => handleSelectPlan(plan.id)}
                >
                  {selectedPlan === plan.id ? 'Selected' : 'Select Plan'}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>

        <div className="flex flex-col items-center mt-10">
          <p className="text-muted-foreground mb-4 text-center max-w-2xl">
            All plans come with a 14-day free trial. You can upgrade, downgrade, or cancel at any time.
          </p>
          
          <Button 
            size="lg" 
            onClick={handleContinue} 
            disabled={!selectedPlan || isCreatingSubscription}
            className="min-w-[200px]"
          >
            {isCreatingSubscription ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                Continue <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}