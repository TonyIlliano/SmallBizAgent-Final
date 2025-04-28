import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useLocation } from 'wouter';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import BusinessSetup from './steps/business-setup';
import ServicesSetup from './steps/services-setup';
import VirtualReceptionistSetup from './steps/virtual-receptionist-setup';
import CalendarSetup from './steps/calendar-setup';
import FinalSetup from './steps/final-setup';

export default function OnboardingFlow() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [currentStep, setCurrentStep] = useState(0);
  
  const steps = [
    { title: 'Business Profile', component: BusinessSetup },
    { title: 'Your Services', component: ServicesSetup },
    { title: 'Virtual Receptionist', component: VirtualReceptionistSetup },
    { title: 'Calendar Integration', component: CalendarSetup },
    { title: 'Final Setup', component: FinalSetup }
  ];

  useEffect(() => {
    if (!user) {
      navigate('/auth');
    }
  }, [user, navigate]);

  const nextStep = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
      window.scrollTo(0, 0);
    } else {
      // Onboarding complete
      navigate('/dashboard');
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
      window.scrollTo(0, 0);
    }
  };

  const skipOnboarding = () => {
    // Mark onboarding as dismissed
    localStorage.setItem('onboardingDismissed', 'true');
    navigate('/dashboard');
  };

  const CurrentStepComponent = steps[currentStep].component;
  const progress = ((currentStep + 1) / steps.length) * 100;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b">
        <div className="container py-4 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <img 
              src="/icons/icon-32x32.png" 
              alt="SmallBizAgent" 
              className="h-8 w-8" 
            />
            <h1 className="text-xl font-bold">SmallBizAgent Setup</h1>
          </div>
          <Button variant="outline" onClick={skipOnboarding}>
            Skip Setup
          </Button>
        </div>
      </header>
      
      <main className="flex-1 container py-8">
        <div className="max-w-3xl mx-auto">
          <div className="mb-8">
            <div className="flex justify-between mb-2">
              {steps.map((step, idx) => (
                <span 
                  key={idx} 
                  className={`text-sm ${idx <= currentStep ? 'text-primary font-medium' : 'text-muted-foreground'}`}
                >
                  {step.title}
                </span>
              ))}
            </div>
            <Progress value={progress} className="h-2" />
          </div>
          
          <div className="bg-card rounded-lg border p-6 shadow-sm mb-6">
            <CurrentStepComponent onComplete={nextStep} />
          </div>
          
          <div className="flex justify-between">
            <Button 
              variant="outline" 
              onClick={prevStep}
              disabled={currentStep === 0}
            >
              Back
            </Button>
            
            <Button 
              onClick={nextStep}
            >
              {currentStep < steps.length - 1 ? 'Continue' : 'Finish Setup'}
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}