import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Building2, 
  Wrench, 
  Car, 
  Scissors, 
  Stethoscope, 
  Users2, 
  Home, 
  PaintBucket,
  Utensils,
  Leaf,
  LibraryBig,
  Wifi,
  CheckCircle,
  ChevronRight
} from 'lucide-react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';

interface IndustryTemplateSelectorProps {
  businessId: number;
  onTemplateApplied: () => void;
}

// Define industry templates
const industryTemplates = [
  {
    id: 'plumbing',
    name: 'Plumbing',
    icon: Wrench,
    description: 'Plumbing repair, installation, and maintenance services',
    services: [
      { name: 'Emergency Plumbing Repair', price: 150, duration: 60, category: 'Emergency' },
      { name: 'Drain Cleaning', price: 99.99, duration: 45, category: 'Maintenance' },
      { name: 'Pipe Installation', price: 250, duration: 120, category: 'Installation' },
      { name: 'Water Heater Repair', price: 125, duration: 90, category: 'Repair' },
      { name: 'Fixture Installation', price: 75, duration: 60, category: 'Installation' }
    ]
  },
  {
    id: 'hvac', 
    name: 'HVAC',
    icon: Wifi,
    description: 'Heating, ventilation, and air conditioning services',
    services: [
      { name: 'AC Repair', price: 125, duration: 60, category: 'Repair' },
      { name: 'Heating System Tune-up', price: 89.99, duration: 45, category: 'Maintenance' },
      { name: 'HVAC Installation', price: 1500, duration: 240, category: 'Installation' },
      { name: 'Emergency Heating Repair', price: 200, duration: 90, category: 'Emergency' },
      { name: 'Duct Cleaning', price: 299, duration: 180, category: 'Maintenance' }
    ]
  },
  {
    id: 'automotive',
    name: 'Automotive',
    icon: Car,
    description: 'Auto repair, maintenance, and diagnostics',
    services: [
      { name: 'Oil Change', price: 49.99, duration: 30, category: 'Maintenance' },
      { name: 'Brake Service', price: 149.99, duration: 60, category: 'Repair' },
      { name: 'Engine Diagnostics', price: 89.99, duration: 45, category: 'Diagnostics' },
      { name: 'Tire Rotation', price: 39.99, duration: 30, category: 'Maintenance' },
      { name: 'Full Vehicle Inspection', price: 99.99, duration: 90, category: 'Diagnostics' }
    ]
  },
  {
    id: 'salon',
    name: 'Hair Salon',
    icon: Scissors,
    description: 'Hair cutting, styling, and treatment services',
    services: [
      { name: 'Haircut', price: 35, duration: 30, category: 'Cutting' },
      { name: 'Color & Highlights', price: 125, duration: 120, category: 'Coloring' },
      { name: 'Blowout & Style', price: 45, duration: 45, category: 'Styling' },
      { name: 'Deep Conditioning', price: 25, duration: 30, category: 'Treatment' },
      { name: 'Bridal Hair', price: 150, duration: 90, category: 'Special Occasion' }
    ]
  },
  {
    id: 'medical',
    name: 'Medical Practice',
    icon: Stethoscope,
    description: 'Healthcare services for patients',
    services: [
      { name: 'Initial Consultation', price: 150, duration: 60, category: 'Consultation' },
      { name: 'Follow-up Visit', price: 75, duration: 30, category: 'Follow-up' },
      { name: 'Physical Exam', price: 200, duration: 45, category: 'Examination' },
      { name: 'Lab Work', price: 125, duration: 30, category: 'Diagnostics' },
      { name: 'Telehealth Appointment', price: 65, duration: 20, category: 'Virtual' }
    ]
  },
  {
    id: 'consulting',
    name: 'Consulting',
    icon: Users2,
    description: 'Business consulting and advisory services',
    services: [
      { name: 'Strategy Session', price: 250, duration: 90, category: 'Strategy' },
      { name: 'Business Analysis', price: 500, duration: 180, category: 'Analysis' },
      { name: 'Project Management', price: 150, duration: 60, category: 'Management' },
      { name: 'Training Workshop', price: 1000, duration: 240, category: 'Training' },
      { name: 'Executive Coaching', price: 300, duration: 60, category: 'Coaching' }
    ]
  },
  {
    id: 'cleaning',
    name: 'Cleaning Services',
    icon: Home,
    description: 'Residential and commercial cleaning services',
    services: [
      { name: 'Regular House Cleaning', price: 120, duration: 120, category: 'Residential' },
      { name: 'Deep Cleaning', price: 250, duration: 240, category: 'Residential' },
      { name: 'Office Cleaning', price: 200, duration: 180, category: 'Commercial' },
      { name: 'Move-in/Move-out Cleaning', price: 350, duration: 300, category: 'Specialty' },
      { name: 'Window Cleaning', price: 99, duration: 120, category: 'Specialty' }
    ]
  },
  {
    id: 'painting',
    name: 'Painting',
    icon: PaintBucket,
    description: 'Interior and exterior painting services',
    services: [
      { name: 'Interior Room Painting', price: 350, duration: 240, category: 'Interior' },
      { name: 'Exterior Home Painting', price: 2500, duration: 1440, category: 'Exterior' },
      { name: 'Cabinet Refinishing', price: 975, duration: 480, category: 'Specialty' },
      { name: 'Color Consultation', price: 75, duration: 60, category: 'Consultation' },
      { name: 'Commercial Painting', price: 1500, duration: 960, category: 'Commercial' }
    ]
  },
  {
    id: 'restaurant',
    name: 'Restaurant',
    icon: Utensils,
    description: 'Food service and catering',
    services: [
      { name: 'Private Dining Event', price: 500, duration: 180, category: 'Events' },
      { name: 'Catering - Small', price: 250, duration: 120, category: 'Catering' },
      { name: 'Catering - Large', price: 1000, duration: 240, category: 'Catering' },
      { name: 'Food Delivery', price: 25, duration: 30, category: 'Delivery' },
      { name: 'Cooking Class', price: 75, duration: 120, category: 'Education' }
    ]
  },
  {
    id: 'landscaping',
    name: 'Landscaping',
    icon: Leaf,
    description: 'Landscape design and maintenance services',
    services: [
      { name: 'Lawn Mowing', price: 45, duration: 60, category: 'Maintenance' },
      { name: 'Garden Design', price: 350, duration: 180, category: 'Design' },
      { name: 'Tree Trimming', price: 200, duration: 120, category: 'Maintenance' },
      { name: 'Irrigation Installation', price: 800, duration: 360, category: 'Installation' },
      { name: 'Seasonal Cleanup', price: 250, duration: 180, category: 'Maintenance' }
    ]
  },
  {
    id: 'legal',
    name: 'Legal Services',
    icon: LibraryBig,
    description: 'Legal consultation and services',
    services: [
      { name: 'Initial Legal Consultation', price: 200, duration: 60, category: 'Consultation' },
      { name: 'Contract Review', price: 350, duration: 120, category: 'Documents' },
      { name: 'Will Preparation', price: 500, duration: 90, category: 'Documents' },
      { name: 'Legal Research', price: 175, duration: 120, category: 'Research' },
      { name: 'Court Representation', price: 1500, duration: 240, category: 'Representation' }
    ]
  },
  {
    id: 'construction',
    name: 'Construction',
    icon: Building2,
    description: 'Construction and renovation services',
    services: [
      { name: 'Initial Consultation', price: 0, duration: 60, category: 'Consultation' },
      { name: 'Project Estimate', price: 150, duration: 120, category: 'Planning' },
      { name: 'Home Renovation', price: 5000, duration: 4320, category: 'Renovation' },
      { name: 'Bathroom Remodel', price: 8000, duration: 2880, category: 'Remodeling' },
      { name: 'Kitchen Remodel', price: 15000, duration: 4320, category: 'Remodeling' }
    ]
  }
];

export function IndustryTemplateSelector({ businessId, onTemplateApplied }: IndustryTemplateSelectorProps) {
  const { toast } = useToast();
  const [selectedIndustry, setSelectedIndustry] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  
  const handleApplyTemplate = async () => {
    if (!selectedIndustry) return;
    
    const template = industryTemplates.find(t => t.id === selectedIndustry);
    if (!template) return;
    
    setIsApplying(true);
    
    try {
      // Apply the template services to the business
      const response = await apiRequest('POST', '/api/services/template', {
        businessId,
        services: template.services
      });
      
      if (response.ok) {
        toast({
          title: 'Template applied successfully',
          description: `Added ${template.services.length} services for your ${template.name} business.`,
        });
        
        // Also set this template as the business type
        await apiRequest('PUT', `/api/business/${businessId}`, {
          industryType: template.id,
          category: template.name
        });
        
        // Mark as complete and show success state
        setIsComplete(true);
        
        // Store this in local storage to track onboarding progress
        localStorage.setItem('onboardingServicesComplete', 'true');
        localStorage.setItem('selectedIndustryTemplate', template.id);
      } else {
        toast({
          title: 'Error applying template',
          description: 'There was a problem applying the template. Please try again.',
          variant: 'destructive',
        });
      }
    } catch (error: any) {
      toast({
        title: 'Error applying template',
        description: error.message || 'There was a problem applying the template.',
        variant: 'destructive',
      });
    } finally {
      setIsApplying(false);
    }
  };
  
  if (isComplete) {
    return (
      <Card className="border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30">
        <CardHeader>
          <CardTitle className="flex items-center">
            <CheckCircle className="mr-2 h-5 w-5 text-green-500" />
            Template Applied Successfully
          </CardTitle>
          <CardDescription>
            Your business has been set up with industry-specific services.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            You can always customize these services or add more from the Services section.
          </p>
        </CardContent>
        <CardFooter>
          <Button onClick={onTemplateApplied} className="w-full">
            Continue
            <ChevronRight className="ml-2 h-4 w-4" />
          </Button>
        </CardFooter>
      </Card>
    );
  }
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Select Your Industry</CardTitle>
        <CardDescription>
          Choose an industry template to quickly set up your business with relevant services.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <RadioGroup value={selectedIndustry || ''} onValueChange={setSelectedIndustry} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {industryTemplates.map((template) => {
            const Icon = template.icon;
            return (
              <Label
                key={template.id}
                htmlFor={template.id}
                className={`
                  flex flex-col items-center p-4 rounded-lg border-2 cursor-pointer transition-all
                  ${selectedIndustry === template.id 
                    ? 'border-primary bg-primary/5' 
                    : 'border-muted hover:border-muted-foreground/50'}
                `}
              >
                <RadioGroupItem value={template.id} id={template.id} className="sr-only" />
                <Icon className={`h-8 w-8 mb-2 ${selectedIndustry === template.id ? 'text-primary' : 'text-muted-foreground'}`} />
                <span className="font-medium text-center">{template.name}</span>
                <span className="text-xs text-muted-foreground text-center mt-1">{template.description}</span>
              </Label>
            );
          })}
        </RadioGroup>
      </CardContent>
      <CardFooter className="flex flex-col sm:flex-row gap-2 sm:justify-between">
        <Button 
          variant="ghost" 
          onClick={onTemplateApplied}
          className="w-full sm:w-auto"
        >
          Skip for now
        </Button>
        <Button 
          onClick={handleApplyTemplate} 
          disabled={!selectedIndustry || isApplying}
          className="w-full sm:w-auto"
        >
          {isApplying ? 'Applying Template...' : 'Apply Template'}
        </Button>
      </CardFooter>
    </Card>
  );
}