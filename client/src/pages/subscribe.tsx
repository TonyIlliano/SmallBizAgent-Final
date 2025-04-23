import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useStripe, useElements, Elements, PaymentElement } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { queryClient } from '@/lib/queryClient';

// Make sure to call loadStripe outside of a component's render to avoid
// recreating the Stripe object on every render.
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY);

function CheckoutForm({ clientSecret, businessId }: { clientSecret: string, businessId: string }) {
  const stripe = useStripe();
  const elements = useElements();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!stripe || !elements) {
      // Stripe.js hasn't yet loaded.
      return;
    }

    setIsLoading(true);

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: window.location.origin + '/subscribe/success',
      },
    });

    // This point will only be reached if there is an immediate error when
    // confirming the payment. Otherwise, your customer will be redirected to
    // your `return_url`.
    if (error.type === "card_error" || error.type === "validation_error") {
      setMessage(error.message || "An unexpected error occurred.");
    } else {
      setMessage("An unexpected error occurred.");
    }

    setIsLoading(false);
  };

  return (
    <form id="payment-form" onSubmit={handleSubmit}>
      <PaymentElement id="payment-element" className="mb-6" />
      <Button 
        disabled={isLoading || !stripe || !elements} 
        className="w-full"
        size="lg"
      >
        {isLoading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Processing...
          </>
        ) : (
          'Subscribe Now'
        )}
      </Button>
      {/* Show any error or success messages */}
      {message && (
        <div className="mt-4 p-4 bg-destructive/10 border border-destructive/20 rounded-md text-destructive flex items-start">
          <AlertCircle className="h-5 w-5 mr-2 flex-shrink-0 mt-0.5" />
          <div>{message}</div>
        </div>
      )}
    </form>
  );
}

export default function SubscribePage() {
  const [searchParams] = useState(new URLSearchParams(window.location.search));
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [businessId, setBusinessId] = useState<string | null>(null);
  const [subscriptionId, setSubscriptionId] = useState<string | null>(null);

  useEffect(() => {
    // Get client secret, business ID, and subscription ID from URL
    const secret = searchParams.get('clientSecret');
    const business = searchParams.get('businessId');
    const subscription = searchParams.get('subscriptionId');

    if (secret && business && subscription) {
      setClientSecret(secret);
      setBusinessId(business);
      setSubscriptionId(subscription);
    }
  }, [searchParams]);

  if (!clientSecret || !businessId || !subscriptionId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] p-4">
        <AlertCircle className="h-12 w-12 text-destructive mb-4" />
        <h1 className="text-2xl font-bold mb-2">Invalid Checkout Session</h1>
        <p className="text-muted-foreground mb-4 text-center">
          Missing required parameters for checkout. Please try selecting a subscription plan again.
        </p>
        <Button onClick={() => window.location.href = '/settings'}>
          Return to Settings
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto p-6">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold mb-2">Complete Your Subscription</h1>
        <p className="text-muted-foreground">
          Enter your payment details to activate your subscription
        </p>
      </div>

      {clientSecret && (
        <Elements stripe={stripePromise} options={{ clientSecret }}>
          <CheckoutForm clientSecret={clientSecret} businessId={businessId} />
        </Elements>
      )}
    </div>
  );
}

// Success page after subscription is completed
export function SubscribeSuccessPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    // Invalidate subscription status query to refresh data
    queryClient.invalidateQueries({ queryKey: ['/api/subscription/status'] });
    
    // Show success toast
    toast({
      title: 'Subscription Activated',
      description: 'Your subscription has been successfully activated',
      variant: 'success',
    });
  }, [toast]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] p-4">
      <div className="bg-green-100 rounded-full p-4 mb-6">
        <CheckCircle2 className="h-12 w-12 text-green-600" />
      </div>
      <h1 className="text-2xl font-bold mb-2">Subscription Activated!</h1>
      <p className="text-muted-foreground mb-6 text-center max-w-md">
        Thank you for subscribing to SmallBizAgent. Your subscription is now active and you have full access to all features.
      </p>
      <Button onClick={() => navigate('/settings')}>
        Go to Settings
      </Button>
    </div>
  );
}