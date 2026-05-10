import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { ErrorBoundary } from '@/components/ui/error-boundary';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, ShieldCheck, Calendar } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// Make sure to call loadStripe outside of a component's render to avoid recreating the Stripe object on every render
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY);

type IntentType = 'payment' | 'setup';

interface PaymentFormProps {
  intentType: IntentType;
  returnTo: string;
}

function PaymentForm({ intentType, returnTo }: PaymentFormProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const stripe = useStripe();
  const elements = useElements();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  // After 3DS / off-site auth Stripe redirects to this URL. The success page
  // will then forward the user to returnTo (default /dashboard).
  const stripeReturnUrl = `${window.location.origin}/subscription-success?returnTo=${encodeURIComponent(returnTo)}`;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!stripe || !elements) {
      // Stripe.js hasn't yet loaded
      return;
    }

    setIsProcessing(true);

    // Trial subs use SetupIntent (no charge today, just save the card).
    // Immediate-charge subs use PaymentIntent. Confirm method must match.
    const result = intentType === 'setup'
      ? await stripe.confirmSetup({
          elements,
          confirmParams: { return_url: stripeReturnUrl },
        })
      : await stripe.confirmPayment({
          elements,
          confirmParams: { return_url: stripeReturnUrl },
        });

    if (result.error) {
      setErrorMessage(result.error.message);
      toast({
        title: intentType === 'setup' ? 'Card setup failed' : 'Payment failed',
        description: result.error.message,
        variant: 'destructive',
      });
    }
    // Success path: Stripe redirects to stripeReturnUrl automatically.

    setIsProcessing(false);
  };

  const cancelLabel = intentType === 'setup' ? 'Maybe later' : 'Cancel';
  const submitLabel = intentType === 'setup' ? 'Save card & start trial' : 'Pay now';

  return (
    <form onSubmit={handleSubmit}>
      <PaymentElement />
      {errorMessage && <div className="text-destructive mt-4 text-sm">{errorMessage}</div>}
      <div className="flex justify-end mt-6 gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => navigate(returnTo)}
          disabled={isProcessing}
          data-testid="payment-cancel-button"
        >
          {cancelLabel}
        </Button>
        <Button
          type="submit"
          disabled={!stripe || isProcessing}
          data-testid="payment-submit-button"
        >
          {isProcessing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Processing...
            </>
          ) : (
            submitLabel
          )}
        </Button>
      </div>
    </form>
  );
}

function PaymentPageInner() {
  const [searchParams] = useState(() => new URLSearchParams(window.location.search));
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [intentType, setIntentType] = useState<IntentType>('payment');
  const [returnTo, setReturnTo] = useState<string>('/dashboard');

  useEffect(() => {
    const secret = searchParams.get('clientSecret');
    if (secret) setClientSecret(secret);

    const it = searchParams.get('intentType');
    if (it === 'setup' || it === 'payment') setIntentType(it);

    const rt = searchParams.get('returnTo');
    // Only allow same-origin paths (prevent open-redirect via returnTo).
    if (rt && rt.startsWith('/') && !rt.startsWith('//')) {
      setReturnTo(rt);
    }
  }, [searchParams]);

  if (!clientSecret) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Payment session expired</CardTitle>
            <CardDescription>
              Your payment session is missing or expired. Please pick a plan again from Settings.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button onClick={() => window.location.href = '/settings?tab=subscription'}>
              Return to Settings
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  const options = {
    clientSecret,
    appearance: {
      theme: 'stripe' as const,
    },
  };

  // Trial-aware copy. SetupIntent = trial scenario, no charge today.
  const isTrial = intentType === 'setup';

  return (
    <div className="container mx-auto max-w-3xl py-12 px-4">
      {isTrial && (
        <Card className="mb-6 border-primary/30 bg-primary/5">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <ShieldCheck className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="font-medium text-sm">
                  You won't be charged today.
                </p>
                <p className="text-sm text-muted-foreground">
                  We're saving your card so your AI receptionist starts immediately. After your
                  14-day free trial, billing starts automatically. Cancel anytime in Settings before
                  day 14 — one click, no charge.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            {isTrial ? 'Save your payment method' : 'Complete your subscription'}
          </CardTitle>
          <CardDescription>
            {isTrial
              ? 'Enter a card to start your 14-day free trial. You can cancel anytime in Settings.'
              : 'Please enter your payment details to complete your subscription'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Elements stripe={stripePromise} options={options}>
            <PaymentForm intentType={intentType} returnTo={returnTo} />
          </Elements>
        </CardContent>
      </Card>

      {isTrial && (
        <div className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Calendar className="h-3 w-3" />
          <span>Your trial ends in 14 days. We'll email you 3 days before billing starts.</span>
        </div>
      )}
    </div>
  );
}

export default function PaymentPage() {
  return (
    <ErrorBoundary>
      <PaymentPageInner />
    </ErrorBoundary>
  );
}
