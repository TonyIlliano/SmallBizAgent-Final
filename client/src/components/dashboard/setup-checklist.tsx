import { useState, useEffect } from 'react';
import { Link } from 'wouter';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { AlertCircle, ArrowRight, Check, Building, Briefcase, PhoneCall, Calendar, Settings } from 'lucide-react';

interface SetupTask {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  link: string;
  icon: React.ReactNode;
}

export function SetupChecklist() {
  const [progress, setProgress] = useState(0);
  const [showDismissed, setShowDismissed] = useState(true);
  
  // Setup tasks
  const [tasks, setTasks] = useState<SetupTask[]>([
    {
      id: 'business-profile',
      title: 'Complete your business profile',
      description: 'Add your business details, logo, and contact information',
      completed: localStorage.getItem('onboardingBusinessComplete') === 'true',
      link: '/onboarding',
      icon: <Building className="h-5 w-5" />
    },
    {
      id: 'services',
      title: 'Add your services',
      description: 'Define the services your business offers with pricing',
      completed: localStorage.getItem('onboardingServicesComplete') === 'true',
      link: '/onboarding',
      icon: <Briefcase className="h-5 w-5" />
    },
    {
      id: 'receptionist',
      title: 'Set up virtual receptionist',
      description: 'Configure your AI-powered call handler',
      completed: localStorage.getItem('onboardingReceptionistComplete') === 'true' || 
                localStorage.getItem('onboardingReceptionistComplete') === 'skipped',
      link: '/onboarding',
      icon: <PhoneCall className="h-5 w-5" />
    },
    {
      id: 'calendar',
      title: 'Connect your calendar',
      description: 'Sync with Google, Outlook, or Apple calendar',
      completed: localStorage.getItem('onboardingCalendarComplete') === 'true' || 
                localStorage.getItem('onboardingCalendarComplete') === 'skipped',
      link: '/onboarding',
      icon: <Calendar className="h-5 w-5" />
    },
    {
      id: 'notification',
      title: 'Configure notifications',
      description: 'Set up email and browser notifications',
      completed: false,
      link: '/settings',
      icon: <Settings className="h-5 w-5" />
    }
  ]);
  
  // Calculate progress whenever tasks change
  useEffect(() => {
    const completedCount = tasks.filter(task => task.completed).length;
    const calculatedProgress = Math.round((completedCount / tasks.length) * 100);
    setProgress(calculatedProgress);
    
    // Hide checklist if user dismissed it or if all tasks are completed
    const isDismissed = localStorage.getItem('setupChecklistDismissed') === 'true';
    setShowDismissed(!isDismissed && calculatedProgress < 100);
  }, [tasks]);
  
  // Dismiss the checklist
  const dismissChecklist = () => {
    localStorage.setItem('setupChecklistDismissed', 'true');
    setShowDismissed(false);
  };
  
  // Mark a task as completed
  const markTaskCompleted = (taskId: string) => {
    setTasks(tasks.map(task => 
      task.id === taskId 
        ? { ...task, completed: true } 
        : task
    ));
    
    localStorage.setItem(`${taskId}Complete`, 'true');
  };
  
  if (!showDismissed) return null;
  
  const incompleteTasks = tasks.filter(task => !task.completed);
  
  return (
    <Card className="relative overflow-hidden border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950">
      <div className="absolute top-0 right-0 mt-4 mr-4">
        <Button 
          variant="ghost"
          size="sm"
          onClick={dismissChecklist}
          className="h-7 w-7 p-0 rounded-full"
          aria-label="Dismiss setup checklist"
        >
          <span className="sr-only">Dismiss</span>
          <AlertCircle className="h-4 w-4" />
        </Button>
      </div>
      
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl text-blue-800 dark:text-blue-200">
          <span>Getting Started</span>
          <span className="text-sm font-normal text-blue-700 dark:text-blue-300">{progress}% Complete</span>
        </CardTitle>
        <CardDescription className="text-blue-700 dark:text-blue-300">
          Complete these tasks to get the most out of SmallBizAgent
        </CardDescription>
        <Progress value={progress} className="h-2 mt-1" />
      </CardHeader>
      
      <CardContent>
        <div className="space-y-4">
          {incompleteTasks.slice(0, 3).map(task => (
            <div 
              key={task.id} 
              className="flex items-start gap-3 p-3 rounded-lg bg-white dark:bg-blue-900 shadow-sm"
            >
              <div className="flex-shrink-0 mt-0.5">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-800">
                  {task.icon}
                </div>
              </div>
              <div className="flex-grow">
                <h3 className="font-medium">{task.title}</h3>
                <p className="text-sm text-muted-foreground">{task.description}</p>
              </div>
              <div className="flex-shrink-0">
                <Link href={task.link}>
                  <Button variant="ghost" size="sm" className="text-blue-600 dark:text-blue-300">
                    <span className="sr-only">Start {task.title}</span>
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>
          ))}
          
          {incompleteTasks.length > 3 && (
            <p className="text-sm text-center text-blue-700 dark:text-blue-300">
              +{incompleteTasks.length - 3} more tasks remain
            </p>
          )}
        </div>
      </CardContent>
      
      <CardFooter className="flex justify-between border-t border-blue-200 dark:border-blue-900 pt-4">
        <Link href="/onboarding">
          <Button 
            variant="outline" 
            className="border-blue-600 text-blue-700 hover:bg-blue-100 dark:border-blue-400 dark:text-blue-300 dark:hover:bg-blue-900"
          >
            Continue Setup
          </Button>
        </Link>
        
        <Button
          variant="ghost"
          onClick={dismissChecklist}
          className="text-blue-700 hover:text-blue-800 hover:bg-blue-100 dark:text-blue-300 dark:hover:bg-blue-900"
        >
          Remind Me Later
        </Button>
      </CardFooter>
    </Card>
  );
}