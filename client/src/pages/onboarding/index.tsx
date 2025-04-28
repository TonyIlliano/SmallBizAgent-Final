import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageLayout } from '@/components/layout/PageLayout';
import BusinessSetup from './steps/business-setup';
import ServicesSetup from './steps/services-setup';
import VirtualReceptionistSetup from './steps/virtual-receptionist-setup';
import CalendarSetup from './steps/calendar-setup';
import FinalSetup from './steps/final-setup';
import { Progress } from '@/components/ui/progress';
import { ArrowLeft, Building, Briefcase, PhoneCall, Calendar, CheckSquare } from 'lucide-react';

// Onboarding steps
type OnboardingStep = {
  id: string;
  title: string;
  description: string;
  component: React.ComponentType<{ onComplete: () => void }>;
  icon: React.ReactNode;
};

export default function OnboardingFlow() {
  const [, setLocation] = useLocation();
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  
  // Define onboarding steps
  const steps: OnboardingStep[] = [
    {
      id: 'business',
      title: 'Business Profile',
      description: 'Set up your business details',
      component: BusinessSetup,
      icon: <Building className="h-6 w-6" />
    },
    {
      id: 'services',
      title: 'Services',
      description: 'Add services your business offers',
      component: ServicesSetup,
      icon: <Briefcase className="h-6 w-6" />
    },
    {
      id: 'receptionist',
      title: 'Virtual Receptionist',
      description: 'Configure your AI receptionist',
      component: VirtualReceptionistSetup,
      icon: <PhoneCall className="h-6 w-6" />
    },
    {
      id: 'calendar',
      title: 'Calendar Integration',
      description: 'Connect your calendar',
      component: CalendarSetup,
      icon: <Calendar className="h-6 w-6" />
    },
    {
      id: 'final',
      title: 'Final Setup',
      description: 'Complete your setup',
      component: FinalSetup,
      icon: <CheckSquare className="h-6 w-6" />
    }
  ];
  
  // Check local storage for completed steps and set current step
  useEffect(() => {
    // Update progress based on completed steps
    let completedCount = 0;
    let nextIncompleteStep = 0;
    
    for (let i = 0; i < steps.length; i++) {
      const stepId = steps[i].id;
      const isCompleted = localStorage.getItem(`onboarding${stepId.charAt(0).toUpperCase() + stepId.slice(1)}Complete`) === 'true';
      
      if (isCompleted || localStorage.getItem(`onboarding${stepId.charAt(0).toUpperCase() + stepId.slice(1)}Complete`) === 'skipped') {
        completedCount++;
        nextIncompleteStep = i + 1;
      } else {
        break;
      }
    }
    
    // If all steps are complete, go to the dashboard
    if (completedCount === steps.length) {
      localStorage.setItem('onboardingComplete', 'true');
      setLocation('/');
      return;
    }
    
    // Set current step to the next incomplete step
    setCurrentStepIndex(nextIncompleteStep);
    
    // Calculate progress
    const calculatedProgress = Math.round((completedCount / steps.length) * 100);
    setProgress(calculatedProgress);
  }, [steps, setLocation]);
  
  const handleStepComplete = () => {
    const nextStep = currentStepIndex + 1;
    
    if (nextStep < steps.length) {
      setCurrentStepIndex(nextStep);
      setProgress(Math.round(((nextStep) / steps.length) * 100));
    } else {
      // All steps completed
      localStorage.setItem('onboardingComplete', 'true');
      setLocation('/');
    }
  };
  
  const handleBack = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(currentStepIndex - 1);
    } else {
      // First step, go back to dashboard
      setLocation('/');
    }
  };
  
  // Get current step
  const CurrentStepComponent = steps[currentStepIndex]?.component;
  
  return (
    <PageLayout title="Setup Your Business">
      <div className="max-w-5xl mx-auto">
        {/* Progress indicator */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={handleBack}
              className="gap-1"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <span className="text-sm text-muted-foreground">
              Step {currentStepIndex + 1} of {steps.length}
            </span>
          </div>
          
          <Progress value={progress} className="h-2" />
          
          {/* Step indicators */}
          <div className="flex justify-between mt-2">
            {steps.map((step, index) => (
              <div 
                key={step.id} 
                className={`flex flex-col items-center ${
                  index <= currentStepIndex 
                    ? 'text-primary' 
                    : 'text-muted-foreground'
                }`}
                style={{ width: `${100 / steps.length}%` }}
              >
                <div 
                  className={`rounded-full p-2 mb-1 ${
                    index < currentStepIndex 
                      ? 'bg-primary text-white' 
                      : index === currentStepIndex 
                        ? 'bg-primary/20 text-primary' 
                        : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {step.icon}
                </div>
                <span className="text-xs font-medium hidden md:inline-block">{step.title}</span>
              </div>
            ))}
          </div>
        </div>
        
        {/* Current step */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {steps[currentStepIndex]?.icon}
              {steps[currentStepIndex]?.title}
            </CardTitle>
            <CardDescription>
              {steps[currentStepIndex]?.description}
            </CardDescription>
          </CardHeader>
          
          <CardContent>
            {CurrentStepComponent && (
              <CurrentStepComponent onComplete={handleStepComplete} />
            )}
          </CardContent>
        </Card>
      </div>
    </PageLayout>
  );
}