import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { 
  Check, 
  AlertTriangle,
  Calendar as CalendarIcon, 
  PhoneCall, 
  Building, 
  Briefcase,
  Loader2 
} from 'lucide-react';

interface FinalSetupProps {
  onComplete: () => void;
}

export default function FinalSetup({ onComplete }: FinalSetupProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isFinishing, setIsFinishing] = useState(false);
  const [notifications, setNotifications] = useState({
    email: true,
    sms: false,
    browser: true
  });
  
  // Get completion status from localStorage
  const [completedSteps, setCompletedSteps] = useState({
    business: localStorage.getItem('onboardingBusinessComplete') === 'true',
    services: localStorage.getItem('onboardingServicesComplete') === 'true',
    receptionist: localStorage.getItem('onboardingReceptionistComplete') === 'true' || 
                  localStorage.getItem('onboardingReceptionistComplete') === 'skipped',
    calendar: localStorage.getItem('onboardingCalendarComplete') === 'true' || 
              localStorage.getItem('onboardingCalendarComplete') === 'skipped',
  });
  
  const finishOnboardingMutation = useMutation({
    mutationFn: async () => {
      const businessId = user?.businessId || 1;
      return apiRequest("POST", "/api/onboarding/complete", { 
        businessId,
        notifications,
        completedSteps
      });
    },
    onSuccess: () => {
      toast({
        title: "Setup Complete",
        description: "Your business is now ready to use SmallBizAgent"
      });
      
      // Mark onboarding as complete
      localStorage.setItem('onboardingComplete', 'true');
      
      // Redirect to dashboard
      onComplete();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "There was a problem completing the setup",
        variant: "destructive",
      });
      setIsFinishing(false);
    },
  });
  
  const handleNotificationChange = (key: keyof typeof notifications) => {
    setNotifications(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };
  
  const finishSetup = () => {
    setIsFinishing(true);
    finishOnboardingMutation.mutate();
  };
  
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">You're Almost Done!</h2>
        <p className="text-muted-foreground">
          Review your setup progress and complete the onboarding process
        </p>
      </div>
      
      <div className="space-y-4">
        <h3 className="text-lg font-medium">Setup Progress</h3>
        
        <div className="grid gap-3">
          <Card>
            <CardContent className="p-4 flex items-start">
              <div className="mr-3 mt-0.5">
                {completedSteps.business ? (
                  <div className="h-6 w-6 rounded-full bg-green-100 flex items-center justify-center">
                    <Check className="h-4 w-4 text-green-600" />
                  </div>
                ) : (
                  <div className="h-6 w-6 rounded-full bg-amber-100 flex items-center justify-center">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                  </div>
                )}
              </div>
              <div>
                <div className="font-medium flex items-center">
                  <Building className="h-4 w-4 mr-1" />
                  Business Profile
                </div>
                <p className="text-sm text-muted-foreground">
                  {completedSteps.business 
                    ? "Your business profile is complete" 
                    : "Business profile is incomplete"}
                </p>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4 flex items-start">
              <div className="mr-3 mt-0.5">
                {completedSteps.services ? (
                  <div className="h-6 w-6 rounded-full bg-green-100 flex items-center justify-center">
                    <Check className="h-4 w-4 text-green-600" />
                  </div>
                ) : (
                  <div className="h-6 w-6 rounded-full bg-amber-100 flex items-center justify-center">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                  </div>
                )}
              </div>
              <div>
                <div className="font-medium flex items-center">
                  <Briefcase className="h-4 w-4 mr-1" />
                  Services
                </div>
                <p className="text-sm text-muted-foreground">
                  {completedSteps.services 
                    ? "You've added services your business offers" 
                    : "No services have been added yet"}
                </p>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4 flex items-start">
              <div className="mr-3 mt-0.5">
                {completedSteps.receptionist ? (
                  <div className="h-6 w-6 rounded-full bg-green-100 flex items-center justify-center">
                    <Check className="h-4 w-4 text-green-600" />
                  </div>
                ) : (
                  <div className="h-6 w-6 rounded-full bg-amber-100 flex items-center justify-center">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                  </div>
                )}
              </div>
              <div>
                <div className="font-medium flex items-center">
                  <PhoneCall className="h-4 w-4 mr-1" />
                  Virtual Receptionist
                </div>
                <p className="text-sm text-muted-foreground">
                  {completedSteps.receptionist 
                    ? localStorage.getItem('onboardingReceptionistComplete') === 'skipped'
                      ? "You skipped virtual receptionist setup"
                      : "Virtual receptionist is configured"
                    : "Virtual receptionist is not configured"}
                </p>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4 flex items-start">
              <div className="mr-3 mt-0.5">
                {completedSteps.calendar ? (
                  <div className="h-6 w-6 rounded-full bg-green-100 flex items-center justify-center">
                    <Check className="h-4 w-4 text-green-600" />
                  </div>
                ) : (
                  <div className="h-6 w-6 rounded-full bg-amber-100 flex items-center justify-center">
                    <AlertTriangle className="h-4 w-4 text-amber-600" />
                  </div>
                )}
              </div>
              <div>
                <div className="font-medium flex items-center">
                  <CalendarIcon className="h-4 w-4 mr-1" />
                  Calendar Integration
                </div>
                <p className="text-sm text-muted-foreground">
                  {completedSteps.calendar 
                    ? localStorage.getItem('onboardingCalendarComplete') === 'skipped'
                      ? "You skipped calendar integration"
                      : "Calendar is connected"
                    : "Calendar is not connected"}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
      
      <div className="space-y-4 pt-4 border-t">
        <h3 className="text-lg font-medium">Notification Preferences</h3>
        
        <div className="space-y-2">
          <div className="flex items-center space-x-2">
            <Checkbox 
              id="notifications-email" 
              checked={notifications.email}
              onCheckedChange={() => handleNotificationChange('email')}
            />
            <Label htmlFor="notifications-email">
              Email notifications
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox 
              id="notifications-sms" 
              checked={notifications.sms}
              onCheckedChange={() => handleNotificationChange('sms')}
            />
            <Label htmlFor="notifications-sms">
              SMS notifications (requires phone verification)
            </Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox 
              id="notifications-browser" 
              checked={notifications.browser}
              onCheckedChange={() => handleNotificationChange('browser')}
            />
            <Label htmlFor="notifications-browser">
              Browser notifications
            </Label>
          </div>
        </div>
      </div>
      
      <div className="pt-4">
        <Button 
          onClick={finishSetup}
          className="w-full"
          disabled={isFinishing}
        >
          {isFinishing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Complete Setup and Go to Dashboard
        </Button>
      </div>
    </div>
  );
}