import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { useLocation } from 'wouter';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle, ChevronRight, Loader2 } from 'lucide-react';

interface FinalSetupProps {
  onComplete: () => void;
}

export default function FinalSetup({ onComplete }: FinalSetupProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Check which steps are completed
  const businessComplete = localStorage.getItem('onboardingBusinessComplete') === 'true';
  const servicesComplete = localStorage.getItem('onboardingServicesComplete') === 'true';
  const receptionistComplete = localStorage.getItem('onboardingReceptionistComplete') === 'true' || 
                              localStorage.getItem('onboardingReceptionistComplete') === 'skipped';
  const calendarComplete = localStorage.getItem('onboardingCalendarComplete') === 'true' || 
                          localStorage.getItem('onboardingCalendarComplete') === 'skipped';
  
  const allStepsComplete = businessComplete && servicesComplete && receptionistComplete && calendarComplete;
  
  const completeOnboarding = () => {
    setIsSubmitting(true);
    
    // Mark onboarding as complete
    localStorage.setItem('onboardingComplete', 'true');
    
    // Show success message
    toast({
      title: 'Onboarding complete!',
      description: 'You\'re all set to start using SmallBizAgent',
    });
    
    // Move to dashboard
    setTimeout(() => {
      onComplete();
      setLocation('/');
    }, 1000);
  };
  
  return (
    <div className="space-y-6">
      <div className="text-center pb-4">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
          <CheckCircle className="h-8 w-8 text-primary" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight">Setup Complete!</h2>
        <p className="text-muted-foreground mt-2">
          You've completed all the necessary steps to get started with SmallBizAgent.
        </p>
      </div>
      
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Business Profile</CardTitle>
            <CardDescription>
              {businessComplete ? 'Setup complete' : 'Not configured'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex justify-between items-center">
              <p className="text-sm text-muted-foreground">
                Your business details and contact information
              </p>
              {businessComplete && (
                <div className="h-6 w-6 rounded-full bg-green-100 flex items-center justify-center">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                </div>
              )}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Services</CardTitle>
            <CardDescription>
              {servicesComplete ? 'Setup complete' : 'Not configured'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex justify-between items-center">
              <p className="text-sm text-muted-foreground">
                Your service offerings and pricing
              </p>
              {servicesComplete && (
                <div className="h-6 w-6 rounded-full bg-green-100 flex items-center justify-center">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                </div>
              )}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Virtual Receptionist</CardTitle>
            <CardDescription>
              {receptionistComplete 
                ? localStorage.getItem('onboardingReceptionistComplete') === 'skipped'
                  ? 'Will set up later'
                  : 'Setup complete'
                : 'Not configured'
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex justify-between items-center">
              <p className="text-sm text-muted-foreground">
                AI-powered call handling and scheduling
              </p>
              {receptionistComplete && (
                <div className="h-6 w-6 rounded-full bg-green-100 flex items-center justify-center">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                </div>
              )}
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Calendar Integration</CardTitle>
            <CardDescription>
              {calendarComplete 
                ? localStorage.getItem('onboardingCalendarComplete') === 'skipped'
                  ? 'Will set up later'
                  : 'Setup complete'
                : 'Not configured'
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex justify-between items-center">
              <p className="text-sm text-muted-foreground">
                Sync with your existing calendar system
              </p>
              {calendarComplete && (
                <div className="h-6 w-6 rounded-full bg-green-100 flex items-center justify-center">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
      
      <div className="pt-6">
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="p-6">
            <h3 className="font-medium text-lg mb-2">What's Next?</h3>
            <ul className="space-y-2">
              <li className="flex items-start">
                <ChevronRight className="h-5 w-5 mr-2 text-primary shrink-0" />
                <span>Invite staff members to join your team</span>
              </li>
              <li className="flex items-start">
                <ChevronRight className="h-5 w-5 mr-2 text-primary shrink-0" />
                <span>Add your first customer to the system</span>
              </li>
              <li className="flex items-start">
                <ChevronRight className="h-5 w-5 mr-2 text-primary shrink-0" />
                <span>Create and send your first invoice</span>
              </li>
              <li className="flex items-start">
                <ChevronRight className="h-5 w-5 mr-2 text-primary shrink-0" />
                <span>Schedule your first appointment</span>
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
      
      <div className="pt-4 text-center">
        <Button 
          onClick={completeOnboarding}
          disabled={!allStepsComplete || isSubmitting}
          size="lg"
          className="min-w-40"
        >
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Go to Dashboard
        </Button>
      </div>
    </div>
  );
}