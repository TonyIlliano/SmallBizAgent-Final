import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Check, ArrowRight, Loader2 } from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';

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

export default function OnboardingSubscription() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [selectedPlan, setSelectedPlan] = useState<number | null>(null);
  const [isCreatingSubscription, setIsCreatingSubscription] = useState(false);
  const [billingInterval, setBillingInterval] = useState<'monthly' | 'yearly'>('monthly');
  const [showPromoInput, setShowPromoInput] = useState(false);
  const [promoCode, setPromoCode] = useState('');
  const [promoError, setPromoError] = useState<string | null>(null);
  const [promoSuccess, setPromoSuccess] = useState<string | null>(null);
  const [isApplyingPromo, setIsApplyingPromo] = useState(false);

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

      // Store the selected plan in server-side session (not localStorage)
      await apiRequest('POST', '/api/onboarding/save-selection', {
        selectedPlanId: selectedPlan,
        promoCode: promoCode.trim() || undefined,
      });

      // Navigate to the main onboarding flow to create the business first
      navigate('/onboarding');
    } catch (error) {
      console.error('Error selecting plan:', error);
    } finally {
      setIsCreatingSubscription(false);
    }
  };

  const handleApplyPromo = async () => {
    if (!promoCode.trim()) return;
    setIsApplyingPromo(true);
    setPromoError(null);
    setPromoSuccess(null);
    try {
      const res = await apiRequest('POST', '/api/subscription/validate-promo', { code: promoCode.trim() });
      const data = await res.json();
      if (data.valid) {
        setPromoSuccess(data.message || `Promo applied! ${data.description}`);
      } else {
        setPromoError(data.error || 'Invalid promo code');
      }
    } catch (error: any) {
      setPromoError('Invalid or expired promo code');
    } finally {
      setIsApplyingPromo(false);
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
            <span className="text-sm text-neutral-300">Select Your Subscription</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-white">Choose Your Plan</h1>
          <p className="mt-3 text-neutral-400 max-w-2xl mx-auto">
            Select the subscription plan that works best for your business. All plans include a 14-day free trial.
          </p>

          {/* Billing interval toggle */}
          <div className="inline-flex items-center gap-3 bg-neutral-900 border border-neutral-800 rounded-full p-1 mt-6">
            <button
              onClick={() => { setBillingInterval('monthly'); setSelectedPlan(null); }}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                billingInterval === 'monthly' ? 'bg-white text-black' : 'text-neutral-400 hover:text-white'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => { setBillingInterval('yearly'); setSelectedPlan(null); }}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                billingInterval === 'yearly' ? 'bg-white text-black' : 'text-neutral-400 hover:text-white'
              }`}
            >
              Annual <span className="text-green-500 ml-1">Save 20%</span>
            </button>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-8 mb-8">
          {plans?.filter((p: Plan) => p.interval === billingInterval).map((plan: Plan) => (
            <Card
              key={plan.id}
              className={`flex flex-col h-full bg-neutral-900 border-neutral-800 hover:border-neutral-700 transition-all cursor-pointer ${selectedPlan === plan.id ? 'ring-2 ring-white border-white' : ''} ${plan.planTier === 'professional' ? 'border-white' : ''}`}
              onClick={() => handleSelectPlan(plan.id)}
            >
              {plan.planTier === 'professional' && (
                <div className="text-center py-1 bg-white text-black text-xs font-semibold rounded-t-lg">
                  Most Popular
                </div>
              )}
              <CardHeader>
                <CardTitle className="text-2xl font-bold text-white">{plan.name}</CardTitle>
                <CardDescription className="mt-2 text-neutral-400">{plan.description}</CardDescription>
                <div className="mt-4">
                  <span className="text-4xl font-bold text-white">
                    ${billingInterval === 'yearly' ? Math.round(plan.price / 12) : plan.price}
                  </span>
                  <span className="text-neutral-500 ml-1">/month</span>
                </div>
                {billingInterval === 'yearly' && (
                  <p className="text-xs text-green-500 mt-1">
                    Billed annually at ${plan.price}/yr
                  </p>
                )}
                <p className="text-xs text-neutral-500 mt-2">
                  ${plan.overageRatePerMinute?.toFixed(2)}/min overage
                </p>
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
            14-day free trial. No credit card required. Cancel anytime.
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

          <button
            onClick={() => navigate('/')}
            className="mt-3 text-sm text-neutral-500 hover:text-neutral-300 underline underline-offset-4"
          >
            Back to home
          </button>

          {/* Promo code */}
          <div className="mt-6">
            {!showPromoInput ? (
              <button
                onClick={() => setShowPromoInput(true)}
                className="text-xs text-neutral-600 hover:text-neutral-400 underline underline-offset-4"
              >
                Have a promo code?
              </button>
            ) : (
              <div className="flex items-center gap-2 max-w-xs mx-auto">
                <Input
                  placeholder="Enter promo code"
                  value={promoCode}
                  onChange={(e) => { setPromoCode(e.target.value.toUpperCase()); setPromoError(null); setPromoSuccess(null); }}
                  className="bg-neutral-900 border-neutral-700 text-white text-sm h-9"
                  maxLength={20}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleApplyPromo}
                  disabled={isApplyingPromo || !promoCode.trim()}
                  className="border-neutral-700 text-neutral-300 hover:bg-neutral-800 h-9 px-3"
                >
                  {isApplyingPromo ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Apply'}
                </Button>
              </div>
            )}
            {promoError && <p className="text-xs text-red-400 mt-2">{promoError}</p>}
            {promoSuccess && <p className="text-xs text-green-400 mt-2">{promoSuccess}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}