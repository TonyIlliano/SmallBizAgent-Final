import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { X, HelpCircle, Book, Settings, Lightbulb } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

interface HelpTip {
  id: string;
  title: string;
  description: string;
  path: string;
  icon: React.ReactNode;
}

export function ContextHelp() {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const [currentTips, setCurrentTips] = useState<HelpTip[]>([]);
  const [viewed, setViewed] = useState<Record<string, boolean>>({});
  
  // Load viewed tips from localStorage
  useEffect(() => {
    const storedViewed = localStorage.getItem('contextHelpViewed');
    if (storedViewed) {
      setViewed(JSON.parse(storedViewed));
    }
  }, []);
  
  // Update viewed tips in localStorage
  useEffect(() => {
    localStorage.setItem('contextHelpViewed', JSON.stringify(viewed));
  }, [viewed]);
  
  // All possible help tips organized by path
  const allHelpTips: Record<string, HelpTip[]> = {
    '/': [
      {
        id: 'dashboard-overview',
        title: 'Dashboard Overview',
        description: 'Your dashboard provides a real-time overview of your business performance. Key metrics show completed jobs, revenue, upcoming appointments, and recent calls.',
        path: '/',
        icon: <Lightbulb className="h-5 w-5" />
      },
      {
        id: 'analytics-insights',
        title: 'Analytics Insights',
        description: 'The performance metrics section shows your business efficiency. Track revenue per job, job completion rate, and other important KPIs.',
        path: '/',
        icon: <Book className="h-5 w-5" />
      }
    ],
    '/jobs': [
      {
        id: 'jobs-management',
        title: 'Managing Jobs',
        description: 'Jobs represent the work your business performs for customers. Track status, assign staff, and manage the entire lifecycle from quote to completion.',
        path: '/jobs',
        icon: <Lightbulb className="h-5 w-5" />
      }
    ],
    '/customers': [
      {
        id: 'customer-management',
        title: 'Customer Relationship Management',
        description: 'Build your customer database by adding detailed profiles. Track contact information, job history, and important notes for personalized service.',
        path: '/customers',
        icon: <Book className="h-5 w-5" />
      }
    ],
    '/invoices': [
      {
        id: 'invoice-management',
        title: 'Invoice Management',
        description: 'Create professional invoices from completed jobs, track payment status, and send payment reminders automatically.',
        path: '/invoices',
        icon: <Lightbulb className="h-5 w-5" />
      }
    ],
    '/receptionist': [
      {
        id: 'virtual-receptionist',
        title: 'AI-Powered Virtual Receptionist',
        description: 'Your virtual receptionist answers calls, captures important details, and routes calls based on intent. Review call logs and transcripts to improve service.',
        path: '/receptionist',
        icon: <Book className="h-5 w-5" />
      }
    ],
    '/appointments': [
      {
        id: 'appointment-scheduling',
        title: 'Appointment Scheduling',
        description: 'Schedule appointments for your staff, manage availability, and send automated reminders to reduce no-shows.',
        path: '/appointments',
        icon: <Lightbulb className="h-5 w-5" />
      }
    ],
    '/settings': [
      {
        id: 'app-settings',
        title: 'Application Settings',
        description: 'Customize your SmallBizAgent experience, manage integrations, and configure notification preferences.',
        path: '/settings',
        icon: <Settings className="h-5 w-5" />
      }
    ]
  };
  
  // Update current tips when location changes
  useEffect(() => {
    // Find matching tips for the current path
    let matchingTips: HelpTip[] = [];
    
    // Exact path match
    if (allHelpTips[location]) {
      matchingTips = [...allHelpTips[location]];
    }
    
    // Match paths with parameters (e.g., /customers/123)
    const pathSegments = location.split('/');
    if (pathSegments.length > 2) {
      const basePath = `/${pathSegments[1]}`;
      if (allHelpTips[basePath]) {
        // Filter out duplicates
        allHelpTips[basePath].forEach(tip => {
          if (!matchingTips.some(existingTip => existingTip.id === tip.id)) {
            matchingTips.push(tip);
          }
        });
      }
    }
    
    // Filter out viewed tips
    const filteredTips = matchingTips.filter(tip => !viewed[tip.id]);
    
    setCurrentTips(filteredTips);
    
    // Auto-open if there are new tips and user hasn't dismissed the modal recently
    const lastDismissed = localStorage.getItem('contextHelpLastDismissed');
    const autoOpenDisabled = localStorage.getItem('contextHelpAutoOpenDisabled') === 'true';
    
    if (filteredTips.length > 0 && !autoOpenDisabled) {
      // Only auto-open if it's been at least 10 minutes since last dismissed
      if (!lastDismissed || Date.now() - parseInt(lastDismissed) > 10 * 60 * 1000) {
        setOpen(true);
      }
    }
  }, [location, viewed]);
  
  // Mark tip as viewed
  const markTipViewed = (tipId: string) => {
    setViewed(prev => ({
      ...prev,
      [tipId]: true
    }));
  };
  
  // Mark all current tips as viewed
  const markAllViewed = () => {
    const updatedViewed = { ...viewed };
    currentTips.forEach(tip => {
      updatedViewed[tip.id] = true;
    });
    setViewed(updatedViewed);
    
    // Record when modal was dismissed
    localStorage.setItem('contextHelpLastDismissed', Date.now().toString());
    setOpen(false);
  };
  
  // Disable auto-open
  const disableAutoOpen = () => {
    localStorage.setItem('contextHelpAutoOpenDisabled', 'true');
    markAllViewed();
  };
  
  // No tips to show
  if (currentTips.length === 0) {
    return null;
  }
  
  return (
    <>
      {/* Floating help button */}
      <div className="fixed bottom-6 right-6 z-50">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button 
              size="icon" 
              className="h-12 w-12 rounded-full shadow-lg bg-primary hover:bg-primary/90"
              aria-label="Open context help"
            >
              <HelpCircle className="h-6 w-6" />
              {currentTips.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full h-5 w-5 flex items-center justify-center text-xs">
                  {currentTips.length}
                </span>
              )}
            </Button>
          </DialogTrigger>
          
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Help & Tips</DialogTitle>
              <DialogDescription>
                Context-specific guidance for this page
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 my-2">
              {currentTips.map(tip => (
                <Card key={tip.id} className="overflow-hidden">
                  <CardContent className="p-0">
                    <div className="p-4 flex gap-3">
                      <div className="flex-shrink-0 mt-1">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                          {tip.icon}
                        </div>
                      </div>
                      <div className="flex-grow">
                        <h3 className="font-medium text-base">{tip.title}</h3>
                        <p className="text-sm text-muted-foreground mt-1">{tip.description}</p>
                      </div>
                    </div>
                    <div className="px-4 py-2 bg-muted border-t flex justify-end">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => markTipViewed(tip.id)}
                      >
                        Got it
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
            
            <div className="flex justify-between mt-4">
              <Button variant="outline" onClick={disableAutoOpen}>
                Don't show automatically
              </Button>
              <Button onClick={markAllViewed}>
                Dismiss all
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}