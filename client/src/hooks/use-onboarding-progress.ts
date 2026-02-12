import { useState, useEffect } from 'react';
import { useAuth } from './use-auth';

// Define the onboarding steps
export type OnboardingStep =
  | 'welcome'
  | 'business'
  | 'services'
  | 'clover'
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
  currentStep: 'welcome',
  stepStatuses: {
    welcome: 'not_started',
    business: 'not_started',
    services: 'not_started',
    clover: 'not_started',
    receptionist: 'not_started',
    calendar: 'not_started',
    final: 'not_started'
  },
  isComplete: false,
  lastUpdated: Date.now()
};

// Get user-specific storage key
const getStorageKey = (userId: number | undefined) => {
  return userId ? `onboardingProgress_user_${userId}` : 'onboardingProgress';
};

/**
 * Custom hook for managing onboarding progress with persistence
 * Progress is stored per-user to prevent data mixing between accounts
 */
export function useOnboardingProgress() {
  const { user } = useAuth();
  const [progress, setProgress] = useState<OnboardingProgress>(defaultProgress);

  // Get the user-specific storage key
  const storageKey = getStorageKey(user?.id);

  // Load progress from storage on mount or when user changes
  useEffect(() => {
    if (!user?.id) {
      // No user logged in, reset to default
      setProgress(defaultProgress);
      return;
    }

    try {
      const savedProgress = localStorage.getItem(storageKey);

      if (savedProgress) {
        const parsedProgress = JSON.parse(savedProgress) as OnboardingProgress;
        setProgress(parsedProgress);
      } else {
        // Check for legacy storage format (non-user-specific)
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
              // Legacy users already started, so welcome is completed
              welcome: 'completed',
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
          // Save the converted progress to user-specific key
          localStorage.setItem(storageKey, JSON.stringify(legacyProgress));
          // Clear legacy keys after migration
          localStorage.removeItem('onboardingBusinessComplete');
          localStorage.removeItem('onboardingServicesComplete');
          localStorage.removeItem('onboardingReceptionistComplete');
          localStorage.removeItem('onboardingCalendarComplete');
          localStorage.removeItem('onboardingComplete');
        } else {
          // No saved progress and no legacy data - start fresh
          setProgress(defaultProgress);
        }
      }
    } catch (error) {
      console.error('Error loading onboarding progress:', error);
    }
  }, [user?.id, storageKey]);

  // Save progress to storage whenever it changes (only if user is logged in)
  useEffect(() => {
    if (!user?.id) return;

    try {
      localStorage.setItem(storageKey, JSON.stringify(progress));
    } catch (error) {
      console.error('Error saving onboarding progress:', error);
    }
  }, [progress, user?.id, storageKey]);
  
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
  };

  // Mark the entire onboarding as complete
  const completeOnboarding = () => {
    setProgress(prev => ({
      ...prev,
      isComplete: true,
      lastUpdated: Date.now()
    }));
  };

  // Reset onboarding progress
  const resetProgress = () => {
    setProgress(defaultProgress);
    // Clear the user-specific storage key
    if (user?.id) {
      localStorage.removeItem(storageKey);
    }
    // Clear any legacy keys that might exist
    localStorage.removeItem('onboardingProgress');
    localStorage.removeItem('onboardingBusinessComplete');
    localStorage.removeItem('onboardingServicesComplete');
    localStorage.removeItem('onboardingReceptionistComplete');
    localStorage.removeItem('onboardingCalendarComplete');
    localStorage.removeItem('onboardingComplete');
    localStorage.removeItem('selectedIndustryTemplate');
  };
  
  // Get next incomplete step
  const getNextIncompleteStep = (): OnboardingStep => {
    const steps: OnboardingStep[] = ['welcome', 'business', 'services', 'clover', 'receptionist', 'calendar', 'final'];

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