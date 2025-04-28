import { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

interface TourStep {
  target: string;
  content: string;
  title: string;
  position: 'top' | 'right' | 'bottom' | 'left';
}

interface FeatureTourProps {
  tourId: string;
  steps: TourStep[];
  onComplete?: () => void;
}

export function FeatureTour({ tourId, steps, onComplete }: FeatureTourProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [isVisible, setIsVisible] = useState(true);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const tooltipRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    // Check if this tour has been completed before
    const completedTours = JSON.parse(localStorage.getItem('completedTours') || '{}');
    if (completedTours[tourId]) {
      setIsVisible(false);
      return;
    }
    
    // Position the tooltip relative to the target element
    const positionTooltip = () => {
      const step = steps[currentStep];
      const targetEl = document.querySelector(step.target);
      if (!targetEl || !tooltipRef.current) return;
      
      // Get positions
      const targetRect = targetEl.getBoundingClientRect();
      const tooltipRect = tooltipRef.current.getBoundingClientRect();
      
      // Calculate position based on specified position
      let top = 0;
      let left = 0;
      
      switch (step.position) {
        case 'top':
          top = targetRect.top - tooltipRect.height - 10;
          left = targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2);
          break;
        case 'right':
          top = targetRect.top + (targetRect.height / 2) - (tooltipRect.height / 2);
          left = targetRect.right + 10;
          break;
        case 'bottom':
          top = targetRect.bottom + 10;
          left = targetRect.left + (targetRect.width / 2) - (tooltipRect.width / 2);
          break;
        case 'left':
          top = targetRect.top + (targetRect.height / 2) - (tooltipRect.height / 2);
          left = targetRect.left - tooltipRect.width - 10;
          break;
      }
      
      // Make sure tooltip is within viewport
      if (top < 0) top = 10;
      if (left < 0) left = 10;
      if (top + tooltipRect.height > window.innerHeight) {
        top = window.innerHeight - tooltipRect.height - 10;
      }
      if (left + tooltipRect.width > window.innerWidth) {
        left = window.innerWidth - tooltipRect.width - 10;
      }
      
      setPosition({ top, left });
      
      // Highlight target element
      targetEl.classList.add('ring-2', 'ring-primary', 'ring-offset-2', 'z-30');
      
      // Remove highlight from all other elements
      document.querySelectorAll('.ring-primary').forEach(el => {
        if (el !== targetEl) {
          el.classList.remove('ring-2', 'ring-primary', 'ring-offset-2', 'z-30');
        }
      });
    };
    
    positionTooltip();
    
    // Update position on resize
    window.addEventListener('resize', positionTooltip);
    
    return () => {
      window.removeEventListener('resize', positionTooltip);
      // Remove highlights from all elements
      document.querySelectorAll('.ring-primary').forEach(el => {
        el.classList.remove('ring-2', 'ring-primary', 'ring-offset-2', 'z-30');
      });
    };
  }, [currentStep, steps, tourId]);
  
  const nextStep = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      completeTour();
    }
  };
  
  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };
  
  const skipTour = () => {
    completeTour();
  };
  
  const completeTour = () => {
    // Mark this tour as completed
    const completedTours = JSON.parse(localStorage.getItem('completedTours') || '{}');
    completedTours[tourId] = true;
    localStorage.setItem('completedTours', JSON.stringify(completedTours));
    
    // Hide the tour
    setIsVisible(false);
    
    // Remove highlights from all elements
    document.querySelectorAll('.ring-primary').forEach(el => {
      el.classList.remove('ring-2', 'ring-primary', 'ring-offset-2', 'z-30');
    });
    
    // Call onComplete callback
    onComplete?.();
  };
  
  if (!isVisible) return null;
  
  const step = steps[currentStep];
  
  return (
    <>
      <div className="fixed inset-0 bg-black/10 z-40" onClick={skipTour}></div>
      
      <Card 
        ref={tooltipRef}
        className="fixed z-50 w-80 shadow-lg"
        style={{ 
          top: `${position.top}px`, 
          left: `${position.left}px` 
        }}
      >
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex justify-between items-center">
            {step.title}
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={skipTour}>
              <X className="h-4 w-4" />
            </Button>
          </CardTitle>
        </CardHeader>
        
        <CardContent className="text-sm">
          <p>{step.content}</p>
        </CardContent>
        
        <CardFooter className="pt-0 flex justify-between items-center">
          <span className="text-xs text-muted-foreground">
            {currentStep + 1} of {steps.length}
          </span>
          
          <div className="space-x-2">
            {currentStep > 0 && (
              <Button variant="outline" size="sm" onClick={prevStep}>
                Back
              </Button>
            )}
            <Button size="sm" onClick={nextStep}>
              {currentStep < steps.length - 1 ? 'Next' : 'Finish'}
            </Button>
          </div>
        </CardFooter>
      </Card>
    </>
  );
}