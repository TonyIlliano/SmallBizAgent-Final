import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { X, ChevronRight, ChevronLeft, MapPin } from 'lucide-react';

export interface TourStep {
  target: string;
  title: string;
  content: string;
  placement?: 'top' | 'right' | 'bottom' | 'left';
}

export interface FeatureTourProps {
  tourId: string;
  steps: TourStep[];
  onComplete?: () => void;
  autoStart?: boolean;
}

export function FeatureTour({ tourId, steps, onComplete, autoStart = false }: FeatureTourProps) {
  const [location] = useLocation();
  const [currentStep, setCurrentStep] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [tooltipSize, setTooltipSize] = useState({ width: 320, height: 180 });
  
  // Check if this tour has been completed
  useEffect(() => {
    // Check if tour has been completed
    const completedTours = JSON.parse(localStorage.getItem('completedTours') || '{}');
    if (completedTours[tourId]) {
      setIsOpen(false);
      return;
    }
    
    // Auto-start the tour
    if (autoStart) {
      setIsOpen(true);
    }
  }, [tourId, autoStart]);
  
  // Update position when step changes or window resizes
  useEffect(() => {
    if (!isOpen) return;
    
    const updatePosition = () => {
      const currentTarget = steps[currentStep]?.target;
      if (!currentTarget) return;
      
      const targetElement = document.querySelector(currentTarget);
      if (!targetElement) return;
      
      const rect = targetElement.getBoundingClientRect();
      const placement = steps[currentStep]?.placement || 'bottom';
      
      let top = 0;
      let left = 0;
      
      switch (placement) {
        case 'top':
          top = rect.top - tooltipSize.height - 10;
          left = rect.left + rect.width / 2 - tooltipSize.width / 2;
          break;
        case 'right':
          top = rect.top + rect.height / 2 - tooltipSize.height / 2;
          left = rect.right + 10;
          break;
        case 'bottom':
          top = rect.bottom + 10;
          left = rect.left + rect.width / 2 - tooltipSize.width / 2;
          break;
        case 'left':
          top = rect.top + rect.height / 2 - tooltipSize.height / 2;
          left = rect.left - tooltipSize.width - 10;
          break;
      }
      
      // Ensure tooltip stays within viewport
      if (left < 10) left = 10;
      if (left + tooltipSize.width > window.innerWidth - 10) {
        left = window.innerWidth - tooltipSize.width - 10;
      }
      
      if (top < 10) top = 10;
      if (top + tooltipSize.height > window.innerHeight - 10) {
        top = window.innerHeight - tooltipSize.height - 10;
      }
      
      setPosition({ top, left });
      
      // Highlight the target element
      targetElement.classList.add('tour-highlight');
    };
    
    updatePosition();
    
    // Clean up previous highlight
    document.querySelectorAll('.tour-highlight').forEach(el => {
      el.classList.remove('tour-highlight');
    });
    
    // Add styles for the tour highlight if they don't exist
    if (!document.getElementById('tour-highlight-style')) {
      const style = document.createElement('style');
      style.id = 'tour-highlight-style';
      style.innerHTML = `
        .tour-highlight {
          position: relative;
          z-index: 60;
          box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.5);
          border-radius: 4px;
        }
      `;
      document.head.appendChild(style);
    }
    
    window.addEventListener('resize', updatePosition);
    
    return () => {
      window.removeEventListener('resize', updatePosition);
      document.querySelectorAll('.tour-highlight').forEach(el => {
        el.classList.remove('tour-highlight');
      });
    };
  }, [currentStep, isOpen, steps]);
  
  // Close the tour and mark as completed
  const completeTour = () => {
    setIsOpen(false);
    
    // Save completed tour in localStorage
    const completedTours = JSON.parse(localStorage.getItem('completedTours') || '{}');
    completedTours[tourId] = true;
    localStorage.setItem('completedTours', JSON.stringify(completedTours));
    
    if (onComplete) {
      onComplete();
    }
  };
  
  // Navigate between steps
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
  
  if (!isOpen || steps.length === 0) {
    return null;
  }
  
  const currentTourStep = steps[currentStep];
  
  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/40 z-50" onClick={completeTour}></div>
      
      {/* Tooltip */}
      <div 
        className="fixed z-[60] bg-white dark:bg-slate-800 rounded-lg shadow-lg p-4 max-w-[320px]"
        style={{
          top: `${position.top}px`,
          left: `${position.left}px`,
          width: `${tooltipSize.width}px`,
        }}
      >
        <Button 
          variant="ghost" 
          size="icon"
          className="absolute top-1 right-1 h-6 w-6 rounded-full p-0"
          onClick={completeTour}
          aria-label="Close tour"
        >
          <X className="h-4 w-4" />
        </Button>
        
        <div className="flex items-center gap-2 mb-2">
          <MapPin className="h-5 w-5 text-primary" />
          <h3 className="font-medium">{currentTourStep.title}</h3>
        </div>
        
        <p className="text-sm text-muted-foreground mb-4">
          {currentTourStep.content}
        </p>
        
        <div className="flex items-center justify-between mt-2">
          <div className="text-sm text-muted-foreground">
            Step {currentStep + 1} of {steps.length}
          </div>
          
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={prevStep}
              disabled={currentStep === 0}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
            
            <Button 
              variant="default" 
              size="sm" 
              onClick={nextStep}
            >
              {currentStep < steps.length - 1 ? (
                <>
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </>
              ) : 'Finish'}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}