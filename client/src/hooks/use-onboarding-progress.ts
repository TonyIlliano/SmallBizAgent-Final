import { useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from './use-auth';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useQuery } from '@tanstack/react-query';

// Define the onboarding steps (includes new hours, staff, and SMS personality steps)
export type OnboardingStep =
  | 'welcome'
  | 'business'
  | 'services'
  | 'hours'
  | 'staff'
  | 'clover'
  | 'receptionist'
  | 'calendar'
  | 'sms_vibe'
  | 'sms_style'
  | 'sms_customer'
  | 'sms_unique'
  | 'sms_response_time'
  | 'sms_preview'
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

// All possible step statuses with defaults
const allStepDefaults: Record<OnboardingStep, StepStatus> = {
  welcome: 'not_started',
  business: 'not_started',
  services: 'not_started',
  hours: 'not_started',
  staff: 'not_started',
  clover: 'not_started',
  receptionist: 'not_started',
  calendar: 'not_started',
  sms_vibe: 'not_started',
  sms_style: 'not_started',
  sms_customer: 'not_started',
  sms_unique: 'not_started',
  sms_response_time: 'not_started',
  sms_preview: 'not_started',
  final: 'not_started',
};

// Default progress state
const defaultProgress: OnboardingProgress = {
  currentStep: 'welcome',
  stepStatuses: { ...allStepDefaults },
  isComplete: false,
  lastUpdated: Date.now()
};

/**
 * Custom hook for managing onboarding progress.
 *
 * Step-by-step progress is persisted to the database via the
 * users.onboarding_progress JSONB column.
 * The overall "onboarding complete" flag is also persisted via
 * users.onboarding_complete.
 *
 * On mount, the hook fetches saved progress from the server and resumes
 * from the last saved step. On each step change, progress is saved.
 */
export function useOnboardingProgress() {
  const { user } = useAuth();
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasLoadedRef = useRef(false);

  // Fetch saved progress from the server
  const { data: savedProgress } = useQuery<{ progress: any }>({
    queryKey: ['/api/onboarding/progress'],
    enabled: !!user && !user.onboardingComplete,
    staleTime: Infinity,
  });

  const [progress, setProgress] = useState<OnboardingProgress>(() => {
    // If user already completed onboarding (from database), reflect that
    if (user?.onboardingComplete) {
      return {
        ...defaultProgress,
        isComplete: true,
        stepStatuses: Object.fromEntries(
          Object.keys(allStepDefaults).map(k => [k, 'completed'])
        ) as Record<OnboardingStep, StepStatus>,
      };
    }
    return defaultProgress;
  });

  // When saved progress loads from server, restore it
  useEffect(() => {
    if (savedProgress?.progress && !hasLoadedRef.current && !user?.onboardingComplete) {
      hasLoadedRef.current = true;
      const saved = savedProgress.progress;
      // Merge with defaults in case new steps were added since last save
      const mergedStatuses = { ...allStepDefaults };
      if (saved.stepStatuses) {
        for (const [key, value] of Object.entries(saved.stepStatuses)) {
          if (key in mergedStatuses) {
            mergedStatuses[key as OnboardingStep] = value as StepStatus;
          }
        }
      }
      setProgress({
        currentStep: saved.currentStep || 'welcome',
        stepStatuses: mergedStatuses,
        isComplete: false,
        lastUpdated: saved.lastUpdated || Date.now(),
      });
    }
  }, [savedProgress, user?.onboardingComplete]);

  // Debounced save to server
  const saveToServer = useCallback((newProgress: OnboardingProgress) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(async () => {
      try {
        await apiRequest('POST', '/api/onboarding/progress', {
          currentStep: newProgress.currentStep,
          stepStatuses: newProgress.stepStatuses,
        });
      } catch (error) {
        console.error('Error saving onboarding progress:', error);
      }
    }, 500); // Debounce 500ms to batch rapid step changes
  }, []);

  // Update current step
  const setCurrentStep = useCallback((step: OnboardingStep) => {
    setProgress(prev => {
      const updated = {
        ...prev,
        currentStep: step,
        lastUpdated: Date.now()
      };
      saveToServer(updated);
      return updated;
    });
  }, [saveToServer]);

  // Update a step's status
  const updateStepStatus = useCallback((step: OnboardingStep, status: StepStatus) => {
    setProgress(prev => {
      const updated = {
        ...prev,
        stepStatuses: {
          ...prev.stepStatuses,
          [step]: status
        },
        lastUpdated: Date.now()
      };
      saveToServer(updated);
      return updated;
    });
  }, [saveToServer]);

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

  // Reset onboarding progress
  const resetProgress = useCallback(() => {
    setProgress(defaultProgress);
    hasLoadedRef.current = false;
  }, []);

  // Get next incomplete step
  // Pass activeSteps to filter out steps not in the current flow (e.g., 'clover' for non-restaurants)
  const getNextIncompleteStep = useCallback((activeSteps?: OnboardingStep[]): OnboardingStep => {
    const allSteps: OnboardingStep[] = ['welcome', 'business', 'services', 'hours', 'staff', 'clover', 'receptionist', 'calendar', 'sms_vibe', 'sms_style', 'sms_customer', 'sms_unique', 'sms_response_time', 'sms_preview', 'final'];
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
