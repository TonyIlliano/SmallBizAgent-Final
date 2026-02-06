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
  const { data: plans = [], isLoading: isLoadingPlans } = useQuery<Plan[]>({
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

      // Store the selected plan for later (after business is created)
      localStorage.setItem('selectedPlanId', selectedPlan.toString());

      // Navigate to the main onboarding flow to create the business first
      navigate('/onboarding');
    } catch (error) {
      console.error('Error selecting plan:', error);
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
    <div className="min-h-screen bg-black py-12">
      <div className="container mx-auto max-w-5xl px-4">
        <div className="mb-10 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-neutral-900 border border-neutral-800 mb-6">
            <span className="text-sm text-neutral-300">Step 1 of 2</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-white">Choose Your Plan</h1>
          <p className="mt-3 text-neutral-400 max-w-2xl mx-auto">
            Select the subscription plan that works best for your business. All plans include a 14-day free trial.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 mb-8">
          {plans?.map((plan: Plan) => (
            <Card
              key={plan.id}
              className={`flex flex-col h-full bg-neutral-900 border-neutral-800 hover:border-neutral-700 transition-all cursor-pointer ${selectedPlan === plan.id ? 'ring-2 ring-white border-white' : ''}`}
              onClick={() => handleSelectPlan(plan.id)}
            >
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-2xl font-bold text-white">{plan.name}</CardTitle>
                    <CardDescription className="mt-2 text-neutral-400">{plan.description}</CardDescription>
                  </div>
                  <Badge variant={plan.interval === 'monthly' ? 'default' : 'secondary'} className="bg-neutral-800 text-neutral-300 border-neutral-700">
                    {plan.interval === 'monthly' ? 'Monthly' : 'Annual'}
                  </Badge>
                </div>
                <div className="mt-4">
                  <span className="text-4xl font-bold text-white">${plan.price}</span>
                  <span className="text-neutral-500 ml-1">
                    /{plan.interval === 'monthly' ? 'month' : 'year'}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="flex-grow">
                <Separator className="my-4 bg-neutral-800" />
                <h4 className="font-semibold mb-4 text-white">Features</h4>
                <ul className="space-y-2">
                  {plan.features?.map((feature, i) => (
                    <li key={i} className="flex items-start">
                      <Check className="h-5 w-5 text-green-500 mr-2 flex-shrink-0" />
                      <span className="text-neutral-300">{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                <Button
                  className={`w-full ${selectedPlan === plan.id ? 'bg-white text-black hover:bg-neutral-200' : 'bg-neutral-800 text-white hover:bg-neutral-700 border-neutral-700'}`}
                  variant={selectedPlan === plan.id ? "default" : "outline"}
                  onClick={() => handleSelectPlan(plan.id)}
                >
                  {selectedPlan === plan.id ? '✓ Selected' : 'Select Plan'}
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>

        <div className="flex flex-col items-center mt-10">
          <p className="text-neutral-500 mb-6 text-center max-w-2xl">
            No credit card required. Cancel anytime.
          </p>

          <Button
            size="lg"
            onClick={handleContinue}
            disabled={!selectedPlan || isCreatingSubscription}
            className="min-w-[220px] bg-white text-black hover:bg-neutral-200 px-8 py-6 text-lg"
          >
            {isCreatingSubscription ? (
              <>
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                Continue <ArrowRight className="ml-2 h-5 w-5" />
              </>
            )}
          </Button>

          {/* Skip subscription for debugging */}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate('/onboarding')}
            className="mt-6 text-neutral-600 hover:text-neutral-400"
          >
            Skip for now
          </Button>
        </div>
      </div>
    </div>
  );
}