import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/use-auth';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle, ChevronRight, X } from 'lucide-react';

export function SetupChecklist() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [isVisible, setIsVisible] = useState(true);
  const [completedItems, setCompletedItems] = useState<Record<string, boolean>>({});
  
  // Check localStorage on mount for completed items
  useEffect(() => {
    const onboardingComplete = localStorage.getItem('onboardingComplete') === 'true';
    const businessComplete = localStorage.getItem('onboardingBusinessComplete') === 'true';
    const servicesComplete = localStorage.getItem('onboardingServicesComplete') === 'true';
    const receptionistComplete = localStorage.getItem('onboardingReceptionistComplete') === 'true' || 
                               localStorage.getItem('onboardingReceptionistComplete') === 'skipped';
    const calendarComplete = localStorage.getItem('onboardingCalendarComplete') === 'true' || 
                           localStorage.getItem('onboardingCalendarComplete') === 'skipped';
    
    setCompletedItems({
      business: businessComplete,
      services: servicesComplete,
      receptionist: receptionistComplete,
      calendar: calendarComplete,
    });
    
    // Hide checklist if all items are complete
    if (onboardingComplete) {
      setIsVisible(false);
    }
  }, []);
  
  // Hide the checklist
  const handleDismiss = () => {
    setIsVisible(false);
    localStorage.setItem('hideSetupChecklist', 'true');
  };
  
  const navigateToOnboarding = () => {
    // Navigate directly to the settings tab for the first incomplete item
    // instead of /onboarding (which redirects back if already complete)
    if (!completedItems.business) {
      setLocation('/settings?tab=profile');
    } else if (!completedItems.services) {
      setLocation('/settings?tab=services');
    } else if (!completedItems.receptionist) {
      setLocation('/settings?tab=profile'); // Receptionist setup is in the Profile tab
    } else if (!completedItems.calendar) {
      setLocation('/settings?tab=integrations');
    } else {
      setLocation('/settings');
    }
  };
  
  // Return null if not visible
  if (!isVisible) return null;
  
  // Calculate remaining items
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
            isCompleted={completedItems.business || false}
            onClick={() => setLocation('/settings?tab=profile')}
          />
          <ChecklistItem
            title="Add your services"
            isCompleted={completedItems.services || false}
            onClick={() => setLocation('/settings?tab=services')}
          />
          <ChecklistItem
            title="Set up virtual receptionist"
            isCompleted={completedItems.receptionist || false}
            onClick={() => setLocation('/settings?tab=profile')}
          />
          <ChecklistItem
            title="Connect your calendar"
            isCompleted={completedItems.calendar || false}
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

function ChecklistItem({ title, isCompleted, onClick }: { title: string; isCompleted: boolean; onClick?: () => void }) {
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
      <span className={isCompleted ? 'text-muted-foreground line-through' : ''}>
        {title}
      </span>
    </div>
  );
}