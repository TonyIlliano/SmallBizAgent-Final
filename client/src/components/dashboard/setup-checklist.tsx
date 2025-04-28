import { useState, useEffect } from 'react';
import { Check, ChevronUp, ChevronDown } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { useLocation } from 'wouter';

interface SetupTask {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  url: string;
}

export function SetupChecklist() {
  const { toast } = useToast();
  const [isExpanded, setIsExpanded] = useState(true);
  const [, navigate] = useLocation();
  
  // Fetch setup progress
  const { data: tasks, isLoading, refetch } = useQuery({
    queryKey: ['/api/onboarding/progress'],
    queryFn: async () => {
      try {
        // Try to get from API first
        const res = await apiRequest('GET', '/api/onboarding/progress');
        const data = await res.json();
        return data as SetupTask[];
      } catch (error) {
        // If API is not ready, use local storage fallback
        const storedTasks = localStorage.getItem('setupTasks');
        if (storedTasks) {
          return JSON.parse(storedTasks) as SetupTask[];
        }
        
        // Default tasks if nothing exists yet
        const defaultTasks = [
          {
            id: 'business-profile',
            title: 'Complete Business Profile',
            description: 'Add your business contact information and details',
            completed: false,
            url: '/settings?tab=profile'
          },
          {
            id: 'business-hours',
            title: 'Set Business Hours',
            description: 'Define when your business is open to customers',
            completed: false,
            url: '/settings?tab=hours'
          },
          {
            id: 'add-services',
            title: 'Add Your Services',
            description: 'Create service offerings with prices and durations',
            completed: false,
            url: '/settings?tab=services'
          },
          {
            id: 'receptionist-setup',
            title: 'Configure Virtual Receptionist',
            description: 'Set up call handling rules and responses',
            completed: false,
            url: '/receptionist/setup'
          },
          {
            id: 'add-staff',
            title: 'Add Staff Members',
            description: 'Add your team members who provide services',
            completed: false,
            url: '/staff'
          }
        ] as SetupTask[];
        
        localStorage.setItem('setupTasks', JSON.stringify(defaultTasks));
        return defaultTasks;
      }
    }
  });
  
  // Calculate completion percentage
  const completedCount = tasks?.filter(task => task.completed).length || 0;
  const totalTasks = tasks?.length || 1;
  const completionPercentage = Math.round((completedCount / totalTasks) * 100);
  
  const markTaskComplete = async (taskId: string) => {
    try {
      if (!tasks) return;
      
      // Update in local storage
      const updatedTasks = tasks.map(task => 
        task.id === taskId ? { ...task, completed: true } : task
      );
      
      localStorage.setItem('setupTasks', JSON.stringify(updatedTasks));
      
      try {
        // Try to update on server if API endpoint exists
        await apiRequest('PUT', `/api/onboarding/tasks/${taskId}`, { completed: true });
      } catch (error) {
        // Silently fail if API doesn't exist yet
        console.log('API endpoint for task completion not available yet');
      }
      
      refetch();
      
      toast({
        title: "Progress saved",
        description: "Your setup progress has been updated",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update progress",
        variant: "destructive",
      });
    }
  };
  
  const handleTaskClick = (task: SetupTask) => {
    if (task.completed) {
      // Navigate to the URL to edit
      navigate(task.url);
    } else {
      // Mark as complete
      markTaskComplete(task.id);
    }
  };
  
  if (isLoading) {
    return <div className="animate-pulse h-40 bg-muted rounded-lg"></div>;
  }
  
  // If all tasks are complete and we're not forcing it to show, hide the widget
  if (completedCount === totalTasks) {
    return null;
  }
  
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex justify-between items-center">
          <CardTitle className="text-lg">Setup Your Business</CardTitle>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Progress value={completionPercentage} className="h-2" />
          <span className="text-sm text-muted-foreground w-12">{completionPercentage}%</span>
        </div>
      </CardHeader>
      
      {isExpanded && tasks && (
        <CardContent className="pt-2">
          <ul className="space-y-3">
            {tasks.map(task => (
              <li key={task.id} className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-1">
                  {task.completed ? (
                    <div className="h-5 w-5 rounded-full bg-green-100 flex items-center justify-center">
                      <Check className="h-3 w-3 text-green-600" />
                    </div>
                  ) : (
                    <div className="h-5 w-5 rounded-full border-2 border-muted-foreground" />
                  )}
                </div>
                
                <div className="flex-1">
                  <h4 className={`font-medium ${task.completed ? 'line-through text-muted-foreground' : ''}`}>
                    {task.title}
                  </h4>
                  <p className="text-sm text-muted-foreground">{task.description}</p>
                </div>
                
                <Button 
                  variant={task.completed ? "outline" : "default"} 
                  size="sm"
                  onClick={() => handleTaskClick(task)}
                >
                  {task.completed ? "Edit" : "Complete"}
                </Button>
              </li>
            ))}
          </ul>
        </CardContent>
      )}
    </Card>
  );
}