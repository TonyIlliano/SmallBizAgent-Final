import { useState } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/use-auth';
import { useQuery } from '@tanstack/react-query';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle, ChevronRight, X, Loader2 } from 'lucide-react';

interface SetupStatus {
  businessProfile: boolean;
  services: boolean;
  receptionist: boolean;
  calendar: boolean;
  allComplete: boolean;
  details?: {
    businessName: string | null;
    businessPhone: string | null;
    businessEmail: string | null;
    serviceCount: number;
    vapiAssistantId: string | null;
    twilioPhoneNumber: string | null;
    businessHoursDays: number;
  };
}

export function SetupChecklist() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [isDismissed, setIsDismissed] = useState(() => {
    // Check if user previously dismissed the checklist
    return localStorage.getItem('hideSetupChecklist') === 'true';
  });

  // Fetch real setup status from the API (not localStorage)
  const { data: setupStatus, isLoading } = useQuery<SetupStatus>({
    queryKey: ['/api/business/setup-status'],
    enabled: !!user?.businessId,
    // Re-check every 30 seconds in case user completes steps in another tab
    refetchInterval: 30000,
  });

  // Hide the checklist
  const handleDismiss = () => {
    setIsDismissed(true);
    localStorage.setItem('hideSetupChecklist', 'true');
  };

  const navigateToOnboarding = () => {
    // Navigate directly to the settings tab for the first incomplete item
    if (!setupStatus?.businessProfile) {
      setLocation('/settings?tab=profile');
    } else if (!setupStatus?.services) {
      setLocation('/settings?tab=services');
    } else if (!setupStatus?.receptionist) {
      setLocation('/settings?tab=profile');
    } else if (!setupStatus?.calendar) {
      setLocation('/settings?tab=integrations');
    } else {
      setLocation('/settings');
    }
  };

  // Don't show if dismissed, loading, or no user
  if (isDismissed || !user?.businessId) return null;

  // Show loading spinner while fetching
  if (isLoading) {
    return (
      <Card className="mb-6 overflow-hidden border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30">
        <CardContent className="py-4 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-blue-500 mr-2" />
          <span className="text-sm text-muted-foreground">Checking setup status...</span>
        </CardContent>
      </Card>
    );
  }

  // Don't show if all complete
  if (setupStatus?.allComplete) return null;

  // Calculate remaining items from real API data
  const completedItems = {
    business: setupStatus?.businessProfile || false,
    services: setupStatus?.services || false,
    receptionist: setupStatus?.receptionist || false,
    calendar: setupStatus?.calendar || false,
  };

  const totalItems = Object.keys(completedItems).length;
  const completedCount = Object.values(completedItems).filter(Boolean).length;
  const remainingItems = totalItems - completedCount;

  return (
    <Card className="mb-6 overflow-hidden border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30">
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle>Setup your business</CardTitle>
            <CardDescription>
              {remainingItems === 0
                ? "All setup steps complete!"
                : `${remainingItems} ${remainingItems === 1 ? 'item' : 'items'} remaining`}
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 rounded-full"
            onClick={handleDismiss}
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Dismiss</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <ChecklistItem
            title="Complete your business profile"
            subtitle={setupStatus?.details?.businessName ? `${setupStatus.details.businessName}` : 'Add name, phone, and email'}
            isCompleted={completedItems.business}
            onClick={() => setLocation('/settings?tab=profile')}
          />
          <ChecklistItem
            title="Add your services"
            subtitle={completedItems.services ? `${setupStatus?.details?.serviceCount} service(s) added` : 'Define what you offer'}
            isCompleted={completedItems.services}
            onClick={() => setLocation('/settings?tab=services')}
          />
          <ChecklistItem
            title="Set up virtual receptionist"
            subtitle={completedItems.receptionist
              ? `Connected${setupStatus?.details?.twilioPhoneNumber ? ` • ${setupStatus.details.twilioPhoneNumber}` : ''}`
              : 'AI phone assistant for your business'}
            isCompleted={completedItems.receptionist}
            onClick={() => setLocation('/settings?tab=profile')}
          />
          <ChecklistItem
            title="Set your business hours"
            subtitle={completedItems.calendar
              ? `${setupStatus?.details?.businessHoursDays} day(s) configured`
              : 'When are you available?'}
            isCompleted={completedItems.calendar}
            onClick={() => setLocation('/settings?tab=integrations')}
          />
        </div>
      </CardContent>
      <CardFooter className="bg-blue-100/50 dark:bg-blue-900/20 pt-2 pb-2">
        <Button
          variant="default"
          className="w-full"
          onClick={navigateToOnboarding}
        >
          {completedCount === 0 ? "Start setup" :
           completedCount === totalItems ? "Review setup" : "Continue setup"}
        </Button>
      </CardFooter>
    </Card>
  );
}

function ChecklistItem({
  title,
  subtitle,
  isCompleted,
  onClick
}: {
  title: string;
  subtitle?: string;
  isCompleted: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      className={`flex items-center ${onClick ? 'cursor-pointer hover:opacity-80' : ''}`}
      onClick={onClick}
    >
      <div className={`flex-shrink-0 w-6 h-6 rounded-full ${
        isCompleted ? 'bg-green-100 text-green-600' : 'bg-blue-100 text-blue-500'
      } flex items-center justify-center mr-3`}>
        {isCompleted ? (
          <CheckCircle className="w-4 h-4" />
        ) : (
          <ChevronRight className="w-4 h-4" />
        )}
      </div>
      <div className="flex flex-col">
        <span className={isCompleted ? 'text-muted-foreground line-through' : ''}>
          {title}
        </span>
        {subtitle && (
          <span className="text-xs text-muted-foreground">
            {subtitle}
          </span>
        )}
      </div>
    </div>
  );
}
