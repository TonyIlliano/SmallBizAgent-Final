import { useState } from 'react';
import { HelpCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useLocation } from 'wouter';

const helpContent: Record<string, { title: string; content: string; videoUrl?: string }> = {
  '/dashboard': {
    title: 'Dashboard Overview',
    content: 'The dashboard gives you a high-level view of your business performance including revenue, appointments, and recent activity. Use the charts to track trends and identify opportunities for growth.'
  },
  '/appointments': {
    title: 'Managing Appointments',
    content: 'Schedule, view, and manage customer appointments. Drag and drop to reschedule, or click an appointment to see details and make changes.'
  },
  '/customers': {
    title: 'Customer Management',
    content: 'Add new customers, search your customer database, and view customer history including past appointments, jobs, and invoices.'
  },
  '/jobs': {
    title: 'Job Management',
    content: 'Create and track jobs from start to finish. Assign staff, track time, add materials, and convert completed jobs to invoices.'
  },
  '/invoices': {
    title: 'Invoice Management',
    content: 'Generate professional invoices, send them to customers, and track payments. Set up recurring invoices for regular customers.'
  },
  '/settings': {
    title: 'Business Settings',
    content: 'Configure your business profile, hours of operation, services offered, and integration with external services like calendars and accounting software.'
  },
  '/staff': {
    title: 'Staff Management',
    content: 'Add staff members, set their availability, assign services they can perform, and track their schedules and performance.'
  },
  '/receptionist': {
    title: 'Virtual Receptionist',
    content: 'Configure your AI-powered virtual receptionist to handle incoming calls, schedule appointments, and provide information to callers based on your business rules.'
  }
};

export function ContextHelp() {
  const [isOpen, setIsOpen] = useState(false);
  const [location] = useLocation();
  
  // Get the base path without query params
  const basePath = location.split('?')[0];
  
  // Find the most specific help content for the current path
  const getHelpContent = () => {
    if (helpContent[basePath]) {
      return helpContent[basePath];
    }
    
    // Fall back to parent paths
    const pathSegments = basePath.split('/').filter(Boolean);
    while (pathSegments.length > 0) {
      pathSegments.pop();
      const parentPath = '/' + pathSegments.join('/');
      if (helpContent[parentPath]) {
        return helpContent[parentPath];
      }
    }
    
    // Default help
    return {
      title: 'SmallBizAgent Help',
      content: 'Welcome to SmallBizAgent. Navigate using the sidebar menu to access different features. If you need further assistance, contact our support team.'
    };
  };
  
  const content = getHelpContent();
  
  return (
    <>
      <Button 
        variant="outline" 
        size="icon" 
        className="fixed bottom-4 right-4 rounded-full h-10 w-10 shadow-md z-10"
        onClick={() => setIsOpen(true)}
      >
        <HelpCircle className="h-5 w-5" />
      </Button>
      
      {isOpen && (
        <div className="fixed inset-0 bg-black/20 flex items-end sm:items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md mx-auto">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle>{content.title}</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setIsOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">{content.content}</p>
              
              {content.videoUrl && (
                <div className="aspect-video bg-muted rounded-md overflow-hidden mb-4">
                  <video 
                    src={content.videoUrl} 
                    controls
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              
              <div className="flex justify-between mt-4 pt-4 border-t">
                <Button variant="outline" onClick={() => setIsOpen(false)}>
                  Close
                </Button>
                <Button onClick={() => window.open('/help-center', '_blank')}>
                  More Help
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}