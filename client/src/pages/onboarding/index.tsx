import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';

import BusinessSetup from './steps/business-setup';
import ServicesSetup from './steps/services-setup';
import VirtualReceptionistSetup from './steps/virtual-receptionist-setup';
import CalendarSetup from './steps/calendar-setup';
import FinalSetup from './steps/final-setup';

import { Button } from '@/components/ui/button';
import { Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

export default function OnboardingPage() {
  const { user, isLoading } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  
  // Check if onboarding is already complete
  const onboardingComplete = localStorage.getItem('onboardingComplete') === 'true';
  
  // Define the steps
  const steps = [
    { id: 'business', label: 'Business Profile', component: BusinessSetup },
    { id: 'services', label: 'Services', component: ServicesSetup },
    { id: 'receptionist', label: 'Virtual Receptionist', component: VirtualReceptionistSetup },
    { id: 'calendar', label: 'Calendar Integration', component: CalendarSetup },
    { id: 'complete', label: 'Complete', component: FinalSetup },
  ];
  
  // Track current step
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const currentStep = steps[currentStepIndex];
  
  // Navigate to dashboard if onboarding is complete
  useEffect(() => {
    if (onboardingComplete) {
      setLocation('/');
    }
  }, [onboardingComplete, setLocation]);
  
  // If not logged in, navigate to auth page
  useEffect(() => {
    if (!isLoading && !user) {
      setLocation('/auth');
    }
  }, [user, isLoading, setLocation]);
  
  const handleNext = () => {
    if (currentStepIndex < steps.length - 1) {
      setCurrentStepIndex(prevIndex => prevIndex + 1);
    }
  };
  
  const handleBack = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(prevIndex => prevIndex - 1);
    }
  };
  
  const handleSkip = () => {
    // Mark all steps as skipped
    localStorage.setItem('onboardingBusinessComplete', 'true');
    localStorage.setItem('onboardingServicesComplete', 'true');
    localStorage.setItem('onboardingReceptionistComplete', 'skipped');
    localStorage.setItem('onboardingCalendarComplete', 'skipped');
    localStorage.setItem('onboardingComplete', 'true');
    
    // Navigate to dashboard
    setLocation('/');
  };
  
  // Handle loading state
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p>Loading...</p>
      </div>
    );
  }
  
  // Handle not logged in state (should redirect via useEffect)
  if (!user) {
    return null;
  }
  
  // Calculate progress percentage
  const progressPercentage = ((currentStepIndex) / (steps.length - 1)) * 100;
  
  // Render the current step component
  const StepComponent = currentStep.component;
  
  return (
    <div className="bg-muted/40 min-h-screen flex flex-col">
      <header className="bg-background py-4 px-6 border-b">
        <div className="container max-w-5xl mx-auto">
          <div className="flex items-center justify-between">
            <h1 className="font-semibold text-xl">SmallBizAgent Setup</h1>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleSkip}
            >
              Skip Setup
            </Button>
          </div>
          <div className="mt-6">
            <div className="flex justify-between mb-2 text-sm">
              <span>Getting Started</span>
              <span>{currentStepIndex + 1} of {steps.length}</span>
            </div>
            <Progress value={progressPercentage} className="h-2" />
          </div>
          <div className="flex space-x-2 mt-6 overflow-x-auto pb-1">
            {steps.map((step, index) => (
              <div 
                key={step.id}
                className={`px-4 py-2 rounded-full text-sm whitespace-nowrap
                  ${index === currentStepIndex 
                    ? 'bg-primary text-primary-foreground font-medium'
                    : index < currentStepIndex
                      ? 'bg-primary/10 text-primary'
                      : 'bg-muted text-muted-foreground'
                  }`}
              >
                {step.label}
              </div>
            ))}
          </div>
        </div>
      </header>
      
      <main className="flex-1 py-8">
        <div className="container max-w-3xl mx-auto px-4">
          <StepComponent onComplete={handleNext} />
        </div>
      </main>
      
      <footer className="bg-background py-4 px-6 border-t">
        <div className="container max-w-3xl mx-auto flex justify-between">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={currentStepIndex === 0}
            className="gap-1"
          >
            <ChevronLeft className="h-4 w-4" />
            Back
          </Button>
          
          {currentStepIndex < steps.length - 1 && (
            <Button
              variant="default"
              onClick={handleNext}
              className="gap-1"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </footer>
    </div>
  );
}