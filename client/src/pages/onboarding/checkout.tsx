/**
 * Onboarding Checkout — Card-First Flow
 *
 * Sits between /onboarding/subscription (plan picker) and /onboarding (business
 * info form). Collects a card via Stripe Elements BEFORE any business is
 * created. On successful SetupIntent confirmation, redirects to /onboarding
 * where the user fills in their business info — by that point the
 * paymentRequired middleware gate is satisfied.
 *
 * Edge cases handled:
 *   - User already has a card on file → skip straight to /onboarding
 *   - Free plan selected → server short-circuits with skipCheckout:true → /onboarding
 *   - No plan selected → server 400s → redirect back to /onboarding/subscription
 *   - SetupIntent confirmation fails → inline error, user can retry
 *   - Stripe 3DS / SCA → Stripe redirects to return_url (subscription-success)
 *     which forwards to /onboarding
 */

import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, ShieldCheck, CreditCard, Lock } from 'lucide-react';
import { ErrorBoundary } from '@/components/ui/error-boundary';

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY);

interface CheckoutFormProps {
  planName: string;
}

function CheckoutForm({ planName }: CheckoutFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const stripe = useStripe();
  const elements = useElements();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  // After confirmSetup, Stripe redirects back to this URL with the SetupIntent
  // status in the query. /subscription-success forwards to /onboarding.
  const stripeReturnUrl = `${window.location.origin}/subscription-success?returnTo=${encodeURIComponent('/onboarding')}`;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setIsSubmitting(true);
    setErrorMessage(null);

    const result = await stripe.confirmSetup({
      elements,
      confirmParams: { return_url: stripeReturnUrl },
    });

    if (result.error) {
      setErrorMessage(result.error.message || 'Card setup failed. Please try again.');
      toast({
        title: 'Card setup failed',
        description: result.error.message || 'Please check your card details and try again.',
        variant: 'destructive',
      });
      setIsSubmitting(false);
      return;
    }

    // Success: Stripe handles the redirect via confirmParams.return_url.
    // No further action needed here.
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement />
      {errorMessage && (
        <div className="rounded-md bg-destructive/10 border border-destructive/20 text-destructive p-3 text-sm">
          {errorMessage}
        </div>
      )}
      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={!stripe || isSubmitting}
        data-testid="checkout-submit"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Saving card...
          </>
        ) : (
          <>
            <Lock className="mr-2 h-4 w-4" />
            Save card &amp; start {planName} trial
          </>
        )}
      </Button>
      <p className="text-xs text-center text-muted-foreground">
        You won&apos;t be charged today. We&apos;ll email you 3 days before billing starts.
        Cancel anytime in Settings before day 14 and you won&apos;t be charged.
      </p>
    </form>
  );
}

export default function OnboardingCheckoutPage() {
  const { user, isLoading: isAuthLoading } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [planName, setPlanName] = useState<string>('your');
  const [loading, setLoading] = useState(true);

  // Auth gates
  useEffect(() => {
    if (isAuthLoading) return;
    if (!user) {
      navigate('/auth');
      return;
    }
    if (!user.emailVerified) {
      navigate('/verify-email');
      return;
    }
    // Already has a business → past onboarding → don't re-prompt for card
    if (user.businessId) {
      navigate('/');
      return;
    }
  }, [user, isAuthLoading, navigate]);

  // Kick off start-trial as soon as we know the user is eligible
  useEffect(() => {
    if (isAuthLoading || !user || user.businessId || !user.emailVerified) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await apiRequest('POST', '/api/onboarding/start-trial');
        const data = await res.json();
        if (cancelled) return;

        // Free plan → skip checkout entirely
        if (data.skipCheckout) {
          navigate('/onboarding');
          return;
        }
        // Card already attached from a prior session → skip
        if (data.alreadyOnFile) {
          toast({
            title: 'Card already on file',
            description: 'Skipping ahead to business setup.',
          });
          navigate('/onboarding');
          return;
        }
        if (!data.clientSecret) {
          throw new Error('No clientSecret returned from server');
        }
        setClientSecret(data.clientSecret);
        if (data.planName) setPlanName(data.planName);
        setLoading(false);
      } catch (err: any) {
        if (cancelled) return;
        const msg = err?.message || '';
        // 400 PLAN_REQUIRED — no plan in session → bounce to picker
        if (msg.includes('400:') || msg.toLowerCase().includes('plan')) {
          toast({
            title: 'Choose a plan first',
            description: 'Please pick a subscription plan to continue.',
          });
          navigate('/onboarding/subscription');
          return;
        }
        toast({
          title: 'Could not start trial',
          description: 'Please try again. If the problem persists, contact support.',
          variant: 'destructive',
        });
        navigate('/onboarding/subscription');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, isAuthLoading, navigate, toast]);

  if (isAuthLoading || loading || !clientSecret) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Preparing your trial...</p>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-background py-12 px-4">
        <div className="container max-w-xl mx-auto">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mb-3">
              <CreditCard className="h-6 w-6 text-primary" />
            </div>
            <h1 className="text-2xl font-bold mb-2">Save your card to start your 14-day free trial</h1>
            <p className="text-muted-foreground text-sm">
              You won&apos;t be charged today. Trial converts to {planName} on day 14
              unless you cancel.
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center">
                <ShieldCheck className="h-4 w-4 text-primary mr-2" />
                Payment information
              </CardTitle>
              <CardDescription>
                Powered by Stripe. Your card details never touch our servers.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Elements
                stripe={stripePromise}
                options={{
                  clientSecret,
                  appearance: { theme: 'stripe' },
                }}
              >
                <CheckoutForm planName={planName} />
              </Elements>
            </CardContent>
            <CardFooter className="flex justify-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/onboarding/subscription')}
                data-testid="checkout-back"
              >
                Back to plans
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </ErrorBoundary>
  );
}
