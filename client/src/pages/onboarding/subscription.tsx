import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Check, ArrowRight, Loader2, Phone } from 'lucide-react';
import { captureEvent } from '@/lib/posthog';
import { apiRequest, queryClient } from '@/lib/queryClient';

interface Plan {
  id: number;
  name: string;
  description: string;
  planTier: string;
  // Numeric DB columns are returned by Drizzle as strings (PostgreSQL NUMERIC
  // can exceed JS Number precision). Always coerce with num() before math/format.
  price: number | string;
  interval: string;
  features: string[];
  maxCallMinutes: number;
  overageRatePerMinute: number | string | null;
  maxStaff: number | null;
  active: boolean;
  sortOrder: number;
}

function num(value: number | string | null | undefined): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
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
  const [isApplyingPromo, setIsApplyingPromo] = useState(false);
  // Persistent "applied" state. When a promo is successfully validated we
  // stash the canonical code + description here, hide the input, and show a
  // green confirmation pill. The user can click "Remove" to clear it.
  // Solves the "I clicked Apply once, hit Apply again, and now it says
  // 'Invalid or expired'" confusion — many Stripe codes are first-use-only
  // per customer, so the second validation legitimately fails.
  const [appliedPromo, setAppliedPromo] = useState<{ code: string; description: string } | null>(null);

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

      // Store the selected plan in server-side session (not localStorage).
      // Prefer the already-applied promo code (validated against Stripe) over
      // whatever's typed in the input — the input may be stale if the user
      // typed a new code but didn't click Apply.
      const effectivePromo = appliedPromo?.code || (promoCode.trim() || undefined);
      await apiRequest('POST', '/api/onboarding/save-selection', {
        selectedPlanId: selectedPlan,
        promoCode: effectivePromo,
      });

      // PostHog: plan_selected. We want to see which plan gets picked most often
      // AND which plans abandon at checkout (compare to card_saved drop-off).
      const plan = plans.find((p) => p.id === selectedPlan);
      captureEvent('plan_selected', {
        plan_id: selectedPlan,
        plan_name: plan?.name ?? null,
        plan_tier: plan?.planTier ?? null,
        billing_interval: billingInterval,
        price_usd: plan?.price ? Number(plan.price) : null,
        has_promo_code: !!effectivePromo,
        promo_code: effectivePromo ?? null,
      });

      // Card-first onboarding: send the user to /onboarding/checkout next.
      // That page will short-circuit to /onboarding if the plan is Free or if
      // the user already has a card on file (e.g., resumed after abandonment).
      navigate('/onboarding/checkout');
    } catch (error) {
      console.error('Error selecting plan:', error);
    } finally {
      setIsCreatingSubscription(false);
    }
  };

  const handleApplyPromo = async () => {
    const code = promoCode.trim();
    if (!code) return;
    setIsApplyingPromo(true);
    setPromoError(null);
    try {
      const res = await apiRequest('POST', '/api/subscription/validate-promo', { code });
      const data = await res.json();
      if (data.valid) {
        // Promote to persistent "applied" state. The input gets hidden and
        // replaced with a confirmation pill below.
        setAppliedPromo({
          code,
          description: data.description || data.message || `${code} applied`,
        });
        setPromoError(null);
      } else {
        setPromoError(data.error || 'Invalid promo code');
      }
    } catch (error: any) {
      setPromoError('Invalid or expired promo code');
    } finally {
      setIsApplyingPromo(false);
    }
  };

  const handleRemovePromo = () => {
    setAppliedPromo(null);
    setPromoCode('');
    setPromoError(null);
    setShowPromoInput(true);
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
            Select the plan that works best for your business. All plans include a 14-day free trial. Card required to start — cancel in Settings before day 14 and you won't be charged.
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
              className={`flex flex-col h-full bg-neutral-900 border-neutral-800 hover:border-neutral-700 transition-all cursor-pointer ${selectedPlan === plan.id ? 'ring-2 ring-white border-white' : ''} ${plan.planTier === 'growth' || plan.planTier === 'professional' ? 'border-white' : ''}`}
              onClick={() => handleSelectPlan(plan.id)}
            >
              {(plan.planTier === 'growth' || plan.planTier === 'professional') && (
                <div className="text-center py-1 bg-white text-black text-xs font-semibold rounded-t-lg">
                  Most Popular
                </div>
              )}
              <CardHeader>
                <CardTitle className="text-2xl font-bold text-white">{plan.name}</CardTitle>
                <CardDescription className="mt-2 text-neutral-400">{plan.description}</CardDescription>
                <div className="mt-4">
                  <span className="text-4xl font-bold text-white">
                    ${billingInterval === 'yearly' ? Math.round(num(plan.price) / 12) : num(plan.price)}
                  </span>
                  <span className="text-neutral-500 ml-1">/month</span>
                </div>
                {billingInterval === 'yearly' && (
                  <p className="text-xs text-green-500 mt-1">
                    Billed annually at ${num(plan.price)}/yr
                  </p>
                )}
                <div className="flex items-center gap-1.5 mt-3 text-sm font-medium text-white">
                  <Phone className="h-4 w-4 text-green-400" />
                  <span>{plan.maxCallMinutes} AI minutes/mo</span>
                </div>
                <p className="text-xs text-neutral-500 mt-1">
                  then ${num(plan.overageRatePerMinute).toFixed(2)}/min overage
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
          <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-4 mb-6 text-center max-w-lg">
            <p className="text-white font-medium mb-1">14-day free trial · Card required</p>
            <p className="text-neutral-400 text-sm">
              You won't be charged today. After your 14-day free trial, billing starts automatically.
              Cancel anytime in Settings before day 14 — one click, no charge.
            </p>
          </div>

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
                Continue to payment <ArrowRight className="ml-2 h-5 w-5" />
              </>
            )}
          </Button>

          <button
            onClick={() => { window.location.href = '/welcome'; }}
            className="mt-3 text-sm text-neutral-500 hover:text-neutral-300 underline underline-offset-4"
          >
            Back to home
          </button>

          {/* Promo code — three render modes:
              1. Applied: green confirmation pill with Remove link
              2. Showing input: text field + Apply button
              3. Collapsed: "Have a promo code?" link */}
          <div className="mt-6">
            {appliedPromo ? (
              <div className="max-w-sm mx-auto bg-green-950/40 border border-green-700/40 rounded-lg px-4 py-3 flex items-start gap-3">
                <div className="text-green-400 mt-0.5">✓</div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-medium text-green-300">
                    {appliedPromo.code} applied
                  </p>
                  <p className="text-xs text-green-400/80 mt-0.5">
                    {appliedPromo.description}
                  </p>
                </div>
                <button
                  onClick={handleRemovePromo}
                  className="text-xs text-neutral-400 hover:text-neutral-200 underline underline-offset-4"
                >
                  Remove
                </button>
              </div>
            ) : !showPromoInput ? (
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
                  onChange={(e) => { setPromoCode(e.target.value.toUpperCase()); setPromoError(null); }}
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
            {promoError && !appliedPromo && (
              <p className="text-xs text-red-400 mt-2">{promoError}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}