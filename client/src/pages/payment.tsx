import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// Make sure to call loadStripe outside of a component's render to avoid recreating the Stripe object on every render
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY);

function PaymentForm() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();
  const stripe = useStripe();
  const elements = useElements();
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!stripe || !elements) {
      // Stripe.js hasn't yet loaded
      return;
    }

    setIsProcessing(true);

    const { error } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/subscription-success`,
      },
    });

    if (error) {
      setErrorMessage(error.message);
      toast({
        title: 'Payment failed',
        description: error.message,
        variant: 'destructive',
      });
    }

    setIsProcessing(false);
  };

  return (
    <form onSubmit={handleSubmit}>
      <PaymentElement />
      {errorMessage && <div className="text-destructive mt-4">{errorMessage}</div>}
      <div className="flex justify-end mt-6">
        <Button 
          type="button" 
          variant="outline" 
          onClick={() => navigate('/settings')} 
          className="mr-2"
          disabled={isProcessing}
        >
          Cancel
        </Button>
        <Button 
          type="submit" 
          disabled={!stripe || isProcessing}
        >
          {isProcessing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Processing...
            </>
          ) : (
            'Pay now'
          )}
        </Button>
      </div>
    </form>
  );
}

export default function PaymentPage() {
  const [searchParams] = useState(new URLSearchParams(window.location.search));
  const [clientSecret, setClientSecret] = useState<string | null>(null);

  useEffect(() => {
    // Get client secret from URL
    const secret = searchParams.get('clientSecret');
    if (secret) {
      setClientSecret(secret);
    }
  }, [searchParams]);

  if (!clientSecret) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Payment Failed</CardTitle>
            <CardDescription>
              We couldn't process your payment because the payment information is missing.
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button onClick={() => window.location.href = '/settings'}>
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

  return (
    <div className="container mx-auto max-w-3xl py-16 px-4">
      <Card>
        <CardHeader>
          <CardTitle>Complete your subscription</CardTitle>
          <CardDescription>
            Please enter your payment details to complete your subscription
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Elements stripe={stripePromise} options={options}>
            <PaymentForm />
          </Elements>
        </CardContent>
      </Card>
    </div>
  );
}