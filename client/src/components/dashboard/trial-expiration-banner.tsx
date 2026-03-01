import { useAuth } from '@/hooks/use-auth';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, X } from 'lucide-react';
import { useLocation } from 'wouter';
import { useState } from 'react';

export function TrialExpirationBanner() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [isDismissed, setIsDismissed] = useState(false);

  const { data: business } = useQuery<any>({
    queryKey: ['/api/business'],
    enabled: !!user?.businessId,
  });

  if (isDismissed) return null;
  if (!business) return null;

  // Only show if call forwarding is enabled
  if (!business.callForwardingEnabled) return null;

  // Only show if there's a trial end date
  if (!business.trialEndsAt) return null;

  // Don't show if they have an active subscription
  if (business.subscriptionStatus === 'active') return null;

  const trialEnd = new Date(business.trialEndsAt);
  const now = new Date();
  const daysLeft = Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  // Only show if trial is expiring within 5 days (gives a bit more notice than the emails)
  if (daysLeft > 5 || daysLeft < 0) return null;

  return (
    <Card className="mb-6 border-orange-300 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/30">
      <CardContent className="py-4 flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-orange-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="font-semibold text-orange-800 dark:text-orange-200">
            Your trial ends in {daysLeft} day{daysLeft !== 1 ? 's' : ''}
          </p>
          <p className="text-sm text-orange-700 dark:text-orange-300 mt-1">
            You have call forwarding set up. When your trial expires, your AI receptionist
            number will be deactivated and callers to your business phone will hear
            "the number you have dialed is not in service." Subscribe now to keep your
            AI receptionist, or dial <strong>*73</strong> from your business phone to remove forwarding.
          </p>
          <div className="flex gap-2 mt-3">
            <Button
              size="sm"
              onClick={() => setLocation('/settings?tab=subscription')}
            >
              Subscribe Now
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-orange-700 border-orange-300 hover:bg-orange-100"
              onClick={() => setIsDismissed(true)}
            >
              Dismiss
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
