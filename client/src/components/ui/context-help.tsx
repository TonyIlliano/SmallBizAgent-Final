import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { HelpCircle, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export function ContextHelp() {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const [helpContent, setHelpContent] = useState<{
    title: string;
    content: string[];
    links?: { label: string; href: string }[];
  }>({
    title: 'Need help?',
    content: ['Select a section to see help content.'],
  });
  
  // Update help content based on current location
  useEffect(() => {
    // Define help content for different routes
    if (location === '/') {
      setHelpContent({
        title: 'Dashboard Help',
        content: [
          'This is your main dashboard where you can see at-a-glance statistics and recent activity.',
          'Use the sidebar to navigate to different sections of the application.',
          'The setup checklist will guide you through configuring your business profile and services.'
        ],
        links: [
          { label: 'Start Onboarding', href: '/onboarding' },
          { label: 'View Appointments', href: '/appointments' },
        ]
      });
    } else if (location.startsWith('/onboarding')) {
      setHelpContent({
        title: 'Onboarding Help',
        content: [
          'Complete each step of the onboarding process to configure your business.',
          'All settings can be changed later in the Settings section.',
          'You can skip optional steps and return to them later.'
        ],
        links: [
          { label: 'View Settings', href: '/settings' },
        ]
      });
    } else if (location.startsWith('/appointments')) {
      setHelpContent({
        title: 'Appointments Help',
        content: [
          'Manage your upcoming appointments and schedule new ones.',
          'Click on an appointment to view details or make changes.',
          'Filter appointments by date, staff member, or status.'
        ],
      });
    } else if (location.startsWith('/customers')) {
      setHelpContent({
        title: 'Customers Help',
        content: [
          'View and manage your customer database.',
          'Click a customer to see their history and details.',
          'Add new customers using the "Add Customer" button.',
        ],
      });
    } else if (location.startsWith('/invoices')) {
      setHelpContent({
        title: 'Invoices Help',
        content: [
          'Create, send, and track invoices for your services.',
          'Check payment status and send reminders for overdue invoices.',
          'Generate new invoices from the "Create Invoice" button.',
        ],
      });
    } else if (location.startsWith('/jobs')) {
      setHelpContent({
        title: 'Jobs Help',
        content: [
          'Track your service jobs and their progress.',
          'Schedule staff and track time spent on jobs.',
          'Convert completed jobs to invoices with a single click.',
        ],
      });
    } else if (location.startsWith('/settings')) {
      setHelpContent({
        title: 'Settings Help',
        content: [
          'Configure your business profile, services, and integrations.',
          'Manage staff accounts and permissions.',
          'Set up payment methods and tax rates.',
        ],
      });
    } else {
      setHelpContent({
        title: 'Need help?',
        content: [
          'Select a section to see contextual help.',
          'You can also search for specific topics using the search bar.',
        ],
      });
    }
  }, [location]);
  
  return (
    <div className="fixed bottom-4 right-4 z-50">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button 
            variant="default" 
            size="icon" 
            className="h-12 w-12 rounded-full shadow-lg"
          >
            <HelpCircle className="h-6 w-6" />
            <span className="sr-only">Help</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent 
          side="top" 
          align="end" 
          className="w-80 p-0"
        >
          <Card className="border-0">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-lg">{helpContent.title}</CardTitle>
              <Button 
                variant="ghost" 
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setOpen(false)}
              >
                <X className="h-4 w-4" />
                <span className="sr-only">Close</span>
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {helpContent.content.map((paragraph, i) => (
                  <p key={i} className="text-sm text-muted-foreground">
                    {paragraph}
                  </p>
                ))}
              </div>
            </CardContent>
            {helpContent.links && (
              <CardFooter className="flex-col items-stretch gap-2 pt-0">
                {helpContent.links.map((link, i) => (
                  <Button 
                    key={i}
                    variant="outline" 
                    size="sm"
                    onClick={() => {
                      window.location.href = link.href;
                      setOpen(false);
                    }}
                    className="justify-start"
                  >
                    {link.label}
                  </Button>
                ))}
              </CardFooter>
            )}
          </Card>
        </PopoverContent>
      </Popover>
    </div>
  );
}