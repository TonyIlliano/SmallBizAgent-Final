import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { useOnboardingProgress, type OnboardingStep } from '@/hooks/use-onboarding-progress';

import { useQuery } from '@tanstack/react-query';
import Welcome from './steps/welcome';
import ExpressSetup from './steps/express-setup';
import BusinessSetup from './steps/business-setup';
import ServicesSetup from './steps/services-setup';
import HoursSetup from './steps/hours-setup';
import StaffSetup from './steps/staff-setup';
import CloverSetup from './steps/clover-setup';
import VirtualReceptionistSetup from './steps/virtual-receptionist-setup';
import CalendarSetup from './steps/calendar-setup';
import SmsVibe from './steps/sms-vibe';
import SmsStyle from './steps/sms-style';
import SmsCustomer from './steps/sms-customer';
import SmsUnique from './steps/sms-unique';
import SmsResponseTime from './steps/sms-response-time';
import SmsPreview from './steps/sms-preview';
import FinalSetup from './steps/final-setup';

import { Button } from '@/components/ui/button';
import { Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

export default function OnboardingPage() {
  const { user, isLoading } = useAuth();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [setupMode, setSetupMode] = useState<'choose' | 'express' | 'detailed'>('choose');

  // Use our progress hook (now persists to database)
  const {
    progress,
    setCurrentStep,
    updateStepStatus,
    completeOnboarding,
    getNextIncompleteStep,
    resetProgress
  } = useOnboardingProgress();

  // Fetch business data to check industry for conditional steps
  const { data: business } = useQuery<{ industry?: string; type?: string }>({
    queryKey: [`/api/business/${user?.businessId}`],
    enabled: !!user?.businessId,
  });

  const isRestaurant = business?.industry?.toLowerCase() === 'restaurant';

  // Industries that need staff setup prominently
  const needsStaffStep = !isRestaurant; // Restaurants get staff via POS, everyone else needs it

  // Define the steps with mapping to our progress tracking
  // Clover POS step only shows for restaurant businesses
  // Staff step shows for non-restaurant service businesses
  const steps = [
    { id: 'welcome' as OnboardingStep, label: 'Welcome', component: Welcome },
    { id: 'business' as OnboardingStep, label: 'Business Profile', component: BusinessSetup },
    { id: 'services' as OnboardingStep, label: 'Services', component: ServicesSetup },
    { id: 'hours' as OnboardingStep, label: 'Business Hours', component: HoursSetup },
    ...(needsStaffStep ? [{ id: 'staff' as OnboardingStep, label: 'Team', component: StaffSetup }] : []),
    ...(isRestaurant ? [{ id: 'clover' as OnboardingStep, label: 'Clover POS', component: CloverSetup }] : []),
    { id: 'receptionist' as OnboardingStep, label: 'AI Receptionist', component: VirtualReceptionistSetup },
    { id: 'calendar' as OnboardingStep, label: 'Calendar', component: CalendarSetup },
    { id: 'sms_vibe' as OnboardingStep, label: 'SMS Personality', component: SmsVibe },
    { id: 'sms_style' as OnboardingStep, label: 'SMS Style', component: SmsStyle },
    { id: 'sms_customer' as OnboardingStep, label: 'Your Customers', component: SmsCustomer },
    { id: 'sms_unique' as OnboardingStep, label: 'Your Edge', component: SmsUnique },
    { id: 'sms_response_time' as OnboardingStep, label: 'Response Time', component: SmsResponseTime },
    { id: 'sms_preview' as OnboardingStep, label: 'SMS Preview', component: SmsPreview },
    { id: 'final' as OnboardingStep, label: 'Complete', component: FinalSetup },
  ];

  // Get the active step IDs for the current flow (excludes clover for non-restaurants, etc.)
  const activeStepIds = steps.map(s => s.id);

  // Find current step index based on progress
  const currentStepIndex = steps.findIndex(step => step.id === progress.currentStep);
  const currentStep = steps[currentStepIndex >= 0 ? currentStepIndex : 0];

  // Reset onboarding if state shows complete but user has no business
  useEffect(() => {
    if (user && !user.businessId && progress.isComplete) {
      resetProgress();
    }
  }, [user, progress.isComplete, resetProgress]);

  // Navigate to dashboard if onboarding is complete AND user has a business
  useEffect(() => {
    if ((progress.isComplete || user?.onboardingComplete) && user?.businessId) {
      setLocation('/');
    }
  }, [progress.isComplete, user?.onboardingComplete, user?.businessId, setLocation]);

  // If not logged in, navigate to auth page
  useEffect(() => {
    if (!isLoading && !user) {
      setLocation('/auth');
    }
  }, [user, isLoading, setLocation]);

  // On first mount or when steps change, check if we need to resume at a specific step
  useEffect(() => {
    const nextStep = getNextIncompleteStep(activeStepIds);
    const stepIndex = steps.findIndex(step => step.id === nextStep);

    if (stepIndex >= 0 && progress.currentStep !== nextStep) {
      // Only auto-advance if we're at a step that's not in the current flow
      // (e.g., user's progress says 'clover' but they're not a restaurant)
      const currentInFlow = activeStepIds.includes(progress.currentStep);
      if (!currentInFlow) {
        setCurrentStep(nextStep);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRestaurant]);

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

  // Handle welcome step completion — routes to express or detailed flow
  const handleWelcomeComplete = (mode?: 'express' | 'detailed') => {
    if (mode === 'express') {
      setSetupMode('express');
    } else {
      setSetupMode('detailed');
      handleNext();
    }
  };

  // Express setup — single-page form, no wizard
  if (setupMode === 'express' || (setupMode === 'choose' && progress.currentStep === 'welcome' && false)) {
    return (
      <div className="bg-muted/40 min-h-screen flex flex-col">
        <header className="bg-background py-4 px-6 border-b">
          <div className="container max-w-5xl mx-auto flex items-center justify-between">
            <h1 className="font-semibold text-xl">SmallBizAgent Setup</h1>
            <Button variant="ghost" size="sm" onClick={() => setSetupMode('choose')}>
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back to options
            </Button>
          </div>
        </header>
        <main className="flex-1 py-8">
          <div className="container max-w-3xl mx-auto px-4">
            <ExpressSetup userEmail={user?.email || undefined} />
          </div>
        </main>
      </div>
    );
  }

  // Render the current step component
  const StepComponent = currentStep.component;

  // For the welcome step, pass our custom handler instead of handleNext
  // SMS steps use onNext prop; pass both onComplete and onNext for compatibility
  const stepProps = currentStep.id === 'welcome'
    ? { onComplete: handleWelcomeComplete, onSkip: handleSkipStep, onNext: handleNext }
    : { onComplete: handleNext, onSkip: handleSkipStep, onNext: handleNext };

  return (
    <div className="bg-muted/40 min-h-screen flex flex-col">
      <header className="bg-background py-4 px-6 border-b">
        <div className="container max-w-5xl mx-auto">
          <div className="flex items-center justify-between">
            <h1 className="font-semibold text-xl">SmallBizAgent Setup</h1>
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
          <StepComponent {...stepProps} />
        </div>
      </main>

      {/* Hide footer nav on the welcome step — the user must explicitly pick
          Quick or Detailed setup by clicking a card. A bottom Next button
          here is a trap because it bypasses the path selection and silently
          drops the user into the detailed wizard regardless of which card
          was visually highlighted. */}
      {currentStep.id !== 'welcome' && (
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
      )}
    </div>
  );
}
