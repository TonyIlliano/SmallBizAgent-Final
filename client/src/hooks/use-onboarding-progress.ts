import { useState, useEffect } from 'react';

// Define the onboarding steps
export type OnboardingStep = 
  | 'business'
  | 'services'
  | 'receptionist'
  | 'calendar'
  | 'final';

// Define the possible step statuses
export type StepStatus = 
  | 'not_started'
  | 'in_progress'
  | 'completed'
  | 'skipped';

// Interface for the onboarding progress
export interface OnboardingProgress {
  currentStep: OnboardingStep;
  stepStatuses: Record<OnboardingStep, StepStatus>;
  isComplete: boolean;
  lastUpdated: number; // timestamp
}

// Default progress state
const defaultProgress: OnboardingProgress = {
  currentStep: 'business',
  stepStatuses: {
    business: 'not_started',
    services: 'not_started',
    receptionist: 'not_started',
    calendar: 'not_started',
    final: 'not_started'
  },
  isComplete: false,
  lastUpdated: Date.now()
};

// Local storage key
const STORAGE_KEY = 'onboardingProgress';

/**
 * Custom hook for managing onboarding progress with persistence
 */
export function useOnboardingProgress() {
  const [progress, setProgress] = useState<OnboardingProgress>(defaultProgress);
  
  // Load progress from storage on mount
  useEffect(() => {
    try {
      const savedProgress = localStorage.getItem(STORAGE_KEY);
      
      if (savedProgress) {
        const parsedProgress = JSON.parse(savedProgress) as OnboardingProgress;
        setProgress(parsedProgress);
      } else {
        // Check for legacy storage format
        const businessComplete = localStorage.getItem('onboardingBusinessComplete') === 'true';
        const servicesComplete = localStorage.getItem('onboardingServicesComplete') === 'true';
        const receptionistComplete = localStorage.getItem('onboardingReceptionistComplete') === 'true';
        const receptionistSkipped = localStorage.getItem('onboardingReceptionistComplete') === 'skipped';
        const calendarComplete = localStorage.getItem('onboardingCalendarComplete') === 'true';
        const calendarSkipped = localStorage.getItem('onboardingCalendarComplete') === 'skipped';
        const onboardingComplete = localStorage.getItem('onboardingComplete') === 'true';
        
        // If we have legacy data, convert it to new format
        if (businessComplete || servicesComplete || receptionistComplete || 
            receptionistSkipped || calendarComplete || calendarSkipped || onboardingComplete) {
          
          const legacyProgress: OnboardingProgress = {
            currentStep: 'business',
            stepStatuses: {
              business: businessComplete ? 'completed' : 'not_started',
              services: servicesComplete ? 'completed' : 'not_started',
              receptionist: receptionistComplete ? 'completed' : 
                           receptionistSkipped ? 'skipped' : 'not_started',
              calendar: calendarComplete ? 'completed' : 
                        calendarSkipped ? 'skipped' : 'not_started',
              final: onboardingComplete ? 'completed' : 'not_started'
            },
            isComplete: onboardingComplete,
            lastUpdated: Date.now()
          };
          
          // Determine current step based on completed steps
          if (!businessComplete) {
            legacyProgress.currentStep = 'business';
          } else if (!servicesComplete) {
            legacyProgress.currentStep = 'services';
          } else if (!receptionistComplete && !receptionistSkipped) {
            legacyProgress.currentStep = 'receptionist';
          } else if (!calendarComplete && !calendarSkipped) {
            legacyProgress.currentStep = 'calendar';
          } else if (!onboardingComplete) {
            legacyProgress.currentStep = 'final';
          }
          
          setProgress(legacyProgress);
          // Save the converted progress
          localStorage.setItem(STORAGE_KEY, JSON.stringify(legacyProgress));
        }
      }
    } catch (error) {
      console.error('Error loading onboarding progress:', error);
    }
  }, []);
  
  // Save progress to storage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    } catch (error) {
      console.error('Error saving onboarding progress:', error);
    }
  }, [progress]);
  
  // Update current step
  const setCurrentStep = (step: OnboardingStep) => {
    setProgress(prev => ({
      ...prev,
      currentStep: step,
      lastUpdated: Date.now()
    }));
  };
  
  // Update a step's status
  const updateStepStatus = (step: OnboardingStep, status: StepStatus) => {
    setProgress(prev => ({
      ...prev,
      stepStatuses: {
        ...prev.stepStatuses,
        [step]: status
      },
      lastUpdated: Date.now()
    }));
    
    // Also update legacy storage format for backward compatibility
    if (status === 'completed') {
      localStorage.setItem(`onboarding${step.charAt(0).toUpperCase() + step.slice(1)}Complete`, 'true');
    } else if (status === 'skipped') {
      localStorage.setItem(`onboarding${step.charAt(0).toUpperCase() + step.slice(1)}Complete`, 'skipped');
    }
  };
  
  // Mark the entire onboarding as complete
  const completeOnboarding = () => {
    const updatedProgress = {
      ...progress,
      isComplete: true,
      lastUpdated: Date.now()
    };
    
    setProgress(updatedProgress);
    localStorage.setItem('onboardingComplete', 'true');
  };
  
  // Reset onboarding progress
  const resetProgress = () => {
    setProgress(defaultProgress);
    
    // Clear legacy storage as well
    localStorage.removeItem('onboardingBusinessComplete');
    localStorage.removeItem('onboardingServicesComplete');
    localStorage.removeItem('onboardingReceptionistComplete');
    localStorage.removeItem('onboardingCalendarComplete');
    localStorage.removeItem('onboardingComplete');
    localStorage.removeItem('selectedIndustryTemplate');
  };
  
  // Get next incomplete step
  const getNextIncompleteStep = (): OnboardingStep => {
    const steps: OnboardingStep[] = ['business', 'services', 'receptionist', 'calendar', 'final'];
    
    for (const step of steps) {
      const status = progress.stepStatuses[step];
      if (status === 'not_started' || status === 'in_progress') {
        return step;
      }
    }
    
    return 'final'; // Default to final step if all are completed or skipped
  };
  
  return {
    progress,
    setCurrentStep,
    updateStepStatus,
    completeOnboarding,
    resetProgress,
    getNextIncompleteStep
  };
}