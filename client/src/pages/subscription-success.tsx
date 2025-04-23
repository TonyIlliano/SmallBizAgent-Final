import { useEffect } from 'react';
import { useLocation } from 'wouter';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useQuery } from '@tanstack/react-query';

export default function SubscriptionSuccessPage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const searchParams = new URLSearchParams(window.location.search);
  const paymentIntent = searchParams.get('payment_intent');
  const paymentIntentClientSecret = searchParams.get('payment_intent_client_secret');
  const redirectStatus = searchParams.get('redirect_status');

  // Optionally refresh the subscription status in the background
  const businessId = 1; // Default business ID, in a real app you'd get this from context
  useQuery({
    queryKey: ['/api/subscription/status', businessId],
    enabled: !!businessId && redirectStatus === 'succeeded',
  });

  useEffect(() => {
    if (redirectStatus === 'succeeded') {
      toast({
        title: 'Subscription successful!',
        description: 'Your subscription has been activated.',
      });
    }
  }, [redirectStatus, toast]);

  return (
    <div className="container mx-auto py-16 px-4 max-w-3xl">
      <Card className="border-2 border-green-500">
        <CardHeader className="bg-green-50 dark:bg-green-950">
          <div className="flex items-center justify-center mb-4">
            <div className="bg-green-500 text-white rounded-full p-2">
              <Check className="h-8 w-8" />
            </div>
          </div>
          <CardTitle className="text-center text-2xl">Subscription Successful!</CardTitle>
          <CardDescription className="text-center">
            Thank you for subscribing to SmallBizAgent.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div className="text-center">
              <p>Your subscription has been activated and is now ready to use.</p>
              <p className="mt-2 text-muted-foreground">
                You'll receive a confirmation email with all the details shortly.
              </p>
            </div>

            <div className="bg-muted p-4 rounded-lg mt-6">
              <h3 className="font-medium mb-2">Next Steps:</h3>
              <ul className="space-y-2">
                <li className="flex items-start">
                  <Check className="h-5 w-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                  <span>Explore the dashboard and familiarize yourself with all the available features</span>
                </li>
                <li className="flex items-start">
                  <Check className="h-5 w-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                  <span>Set up your business profile with complete information</span>
                </li>
                <li className="flex items-start">
                  <Check className="h-5 w-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                  <span>Configure the virtual receptionist for your specific business needs</span>
                </li>
                <li className="flex items-start">
                  <Check className="h-5 w-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
                  <span>Connect your calendar to start managing appointments efficiently</span>
                </li>
              </ul>
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-center">
          <Button onClick={() => navigate('/dashboard')} size="lg">
            Go to Dashboard
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}