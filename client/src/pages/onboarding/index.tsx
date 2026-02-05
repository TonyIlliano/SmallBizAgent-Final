import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { useOnboardingProgress, type OnboardingStep } from '@/hooks/use-onboarding-progress';

import Welcome from './steps/welcome';
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
  
  // Use our progress hook
  const {
    progress,
    setCurrentStep,
    updateStepStatus,
    completeOnboarding,
    getNextIncompleteStep,
    resetProgress
  } = useOnboardingProgress();
  
  // Define the steps with mapping to our progress tracking
  const steps = [
    { id: 'welcome' as OnboardingStep, label: 'Welcome', component: Welcome },
    { id: 'business' as OnboardingStep, label: 'Business Profile', component: BusinessSetup },
    { id: 'services' as OnboardingStep, label: 'Services', component: ServicesSetup },
    { id: 'receptionist' as OnboardingStep, label: 'Virtual Receptionist', component: VirtualReceptionistSetup },
    { id: 'calendar' as OnboardingStep, label: 'Calendar Integration', component: CalendarSetup },
    { id: 'final' as OnboardingStep, label: 'Complete', component: FinalSetup },
  ];
  
  // Find current step index based on progress
  const currentStepIndex = steps.findIndex(step => step.id === progress.currentStep);
  const currentStep = steps[currentStepIndex >= 0 ? currentStepIndex : 0];

  // Debug logging
  console.log('Onboarding Debug:', {
    progressCurrentStep: progress.currentStep,
    currentStepIndex,
    currentStepId: currentStep?.id,
    isComplete: progress.isComplete,
    userBusinessId: user?.businessId,
    stepStatuses: progress.stepStatuses
  });
  
  // Reset onboarding if localStorage says complete but user has no business
  // This handles cases where localStorage persists across different user accounts
  useEffect(() => {
    if (user && !user.businessId && progress.isComplete) {
      console.log('Resetting onboarding - user has no business but progress shows complete');
      resetProgress();
    }
  }, [user, progress.isComplete, resetProgress]);

  // Navigate to dashboard if onboarding is complete AND user has a business
  useEffect(() => {
    if (progress.isComplete && user?.businessId) {
      setLocation('/');
    }
  }, [progress.isComplete, user?.businessId, setLocation]);
  
  // If not logged in, navigate to auth page
  useEffect(() => {
    if (!isLoading && !user) {
      setLocation('/auth');
    }
  }, [user, isLoading, setLocation]);
  
  // On first mount, check if we need to resume at a specific step
  useEffect(() => {
    const nextStep = getNextIncompleteStep();
    const stepIndex = steps.findIndex(step => step.id === nextStep);
    
    if (stepIndex >= 0 && progress.currentStep !== nextStep) {
      setCurrentStep(nextStep);
    }
  }, []);
  
  const handleNext = () => {
    if (currentStepIndex < steps.length - 1) {
      // Mark current step as completed
      updateStepStatus(currentStep.id, 'completed');

      // Move to next step
      const nextStep = steps[currentStepIndex + 1].id;
      setCurrentStep(nextStep);

      // If step is already in progress, don't change its status
      if (progress.stepStatuses[nextStep] === 'not_started') {
        updateStepStatus(nextStep, 'in_progress');
      }
    }
  };

  const handleSkipStep = () => {
    if (currentStepIndex < steps.length - 1) {
      // Mark current step as skipped
      updateStepStatus(currentStep.id, 'skipped');

      // Move to next step
      const nextStep = steps[currentStepIndex + 1].id;
      setCurrentStep(nextStep);

      // If step is already in progress, don't change its status
      if (progress.stepStatuses[nextStep] === 'not_started') {
        updateStepStatus(nextStep, 'in_progress');
      }
    }
  };
  
  const handleBack = () => {
    if (currentStepIndex > 0) {
      // Move to previous step
      const prevStep = steps[currentStepIndex - 1].id;
      setCurrentStep(prevStep);
    }
  };
  
  const handleSkip = () => {
    // Mark all steps as skipped or completed
    updateStepStatus('welcome', 'completed');
    updateStepStatus('business', 'completed');
    updateStepStatus('services', 'completed');
    updateStepStatus('receptionist', 'skipped');
    updateStepStatus('calendar', 'skipped');
    updateStepStatus('final', 'completed');

    // Mark onboarding as complete
    completeOnboarding();

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
          <StepComponent onComplete={handleNext} onSkip={handleSkipStep} />
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