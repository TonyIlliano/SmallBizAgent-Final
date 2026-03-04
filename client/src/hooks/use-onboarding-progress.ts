import { useState, useCallback } from 'react';
import { useAuth } from './use-auth';
import { apiRequest, queryClient } from '@/lib/queryClient';

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

/**
 * Custom hook for managing onboarding progress.
 *
 * Step-by-step progress is tracked in React state (in-memory only).
 * The overall "onboarding complete" flag is persisted in the database
 * via the users.onboarding_complete column.
 *
 * No localStorage is used.
 */
export function useOnboardingProgress() {
  const { user } = useAuth();
  const [progress, setProgress] = useState<OnboardingProgress>(() => {
    // If user already completed onboarding (from database), reflect that
    if (user?.onboardingComplete) {
      return {
        ...defaultProgress,
        isComplete: true,
        stepStatuses: {
          welcome: 'completed',
          business: 'completed',
          services: 'completed',
          clover: 'completed',
          receptionist: 'completed',
          calendar: 'completed',
          final: 'completed',
        },
      };
    }
    return defaultProgress;
  });

  // Update current step
  const setCurrentStep = useCallback((step: OnboardingStep) => {
    setProgress(prev => ({
      ...prev,
      currentStep: step,
      lastUpdated: Date.now()
    }));
  }, []);

  // Update a step's status
  const updateStepStatus = useCallback((step: OnboardingStep, status: StepStatus) => {
    setProgress(prev => ({
      ...prev,
      stepStatuses: {
        ...prev.stepStatuses,
        [step]: status
      },
      lastUpdated: Date.now()
    }));
  }, []);

  // Mark the entire onboarding as complete (saves to database)
  const completeOnboarding = useCallback(async () => {
    setProgress(prev => ({
      ...prev,
      isComplete: true,
      lastUpdated: Date.now()
    }));

    // Persist to database
    try {
      await apiRequest('POST', '/api/onboarding/complete');
      // Refresh user data so onboardingComplete is true
      await queryClient.invalidateQueries({ queryKey: ['/api/user'] });
    } catch (error) {
      console.error('Error saving onboarding completion:', error);
    }
  }, []);

  // Reset onboarding progress (in-memory only)
  const resetProgress = useCallback(() => {
    setProgress(defaultProgress);
  }, []);

  // Get next incomplete step
  // Pass activeSteps to filter out steps not in the current flow (e.g., 'clover' for non-restaurants)
  const getNextIncompleteStep = useCallback((activeSteps?: OnboardingStep[]): OnboardingStep => {
    const allSteps: OnboardingStep[] = ['welcome', 'business', 'services', 'clover', 'receptionist', 'calendar', 'final'];
    const stepsToCheck = activeSteps || allSteps;

    for (const step of stepsToCheck) {
      const status = progress.stepStatuses[step];
      if (status === 'not_started' || status === 'in_progress') {
        return step;
      }
    }

    return 'final'; // Default to final step if all are completed or skipped
  }, [progress.stepStatuses]);

  return {
    progress,
    setCurrentStep,
    updateStepStatus,
    completeOnboarding,
    resetProgress,
    getNextIncompleteStep
  };
}
