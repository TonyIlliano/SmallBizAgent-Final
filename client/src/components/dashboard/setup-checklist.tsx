import { useState } from 'react';
import { useLocation } from 'wouter';
import { useAuth } from '@/hooks/use-auth';
import { useQuery } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import {
  CheckCircle,
  ChevronRight,
  X,
  Loader2,
  Building2,
  Briefcase,
  Bot,
  Clock,
  Users,
  UserPlus,
  Calendar,
  Globe,
  CreditCard,
  UtensilsCrossed,
  Scissors,
  Wrench,
  Zap,
} from 'lucide-react';
import { formatPhoneNumber } from '@/lib/utils';

interface SetupStatus {
  businessProfile: boolean;
  services: boolean;
  receptionist: boolean;
  calendar: boolean;
  staff: boolean;
  customers: boolean;
  booking: boolean;
  pos: boolean;
  reservations: boolean;
  agents: boolean;
  allComplete: boolean;
  businessType: string;
  businessIndustry: string | null;
  details?: {
    businessName: string | null;
    businessPhone: string | null;
    businessEmail: string | null;
    serviceCount: number;
    staffCount: number;
    customerCount: number;
    vapiAssistantId: string | null;
    twilioPhoneNumber: string | null;
    businessHoursDays: number;
    bookingSlug: string | null;
    bookingEnabled: boolean;
    enabledAgentCount: number;
  };
}

interface ChecklistItemConfig {
  key: string;
  title: string;
  subtitle: string;
  completedSubtitle: string;
  icon: React.ElementType;
  href: string;
  isCompleted: boolean;
  priority: number;
}

function getChecklistItems(status: SetupStatus): ChecklistItemConfig[] {
  const type = status.businessType?.toLowerCase() || 'general';
  const industry = status.businessIndustry?.toLowerCase() || '';

  const isRestaurant = type === 'restaurant' || industry.includes('restaurant') || industry.includes('food') || industry.includes('cafe') || industry.includes('bar');
  const isSalon = type === 'salon' || type === 'barber' || industry.includes('salon') || industry.includes('barber') || industry.includes('beauty') || industry.includes('spa') || industry.includes('hair');
  const isHomeService = type === 'plumbing' || type === 'electrical' || type === 'hvac' || type === 'cleaning' || industry.includes('plumb') || industry.includes('electric') || industry.includes('hvac') || industry.includes('clean') || industry.includes('handyman') || industry.includes('landscap');
  const isMedical = type === 'medical' || type === 'dental' || industry.includes('medical') || industry.includes('dental') || industry.includes('health') || industry.includes('therapy') || industry.includes('chiro');

  const items: ChecklistItemConfig[] = [
    {
      key: 'business',
      title: 'Complete your business profile',
      subtitle: 'Add your name, phone, and email',
      completedSubtitle: status.details?.businessName || 'Profile complete',
      icon: Building2,
      href: '/settings?tab=profile',
      isCompleted: status.businessProfile,
      priority: 1,
    },
    {
      key: 'services',
      title: isRestaurant ? 'Set up your menu categories' : 'Add your services',
      subtitle: isRestaurant ? 'Define your menu offerings' : 'Define what you offer and pricing',
      completedSubtitle: `${status.details?.serviceCount || 0} service(s) added`,
      icon: isRestaurant ? UtensilsCrossed : Briefcase,
      href: '/settings?tab=services',
      isCompleted: status.services,
      priority: 2,
    },
    {
      key: 'hours',
      title: 'Set your business hours',
      subtitle: 'Define when you\'re available',
      completedSubtitle: `${status.details?.businessHoursDays || 0} day(s) configured`,
      icon: Clock,
      href: '/settings?tab=integrations',
      isCompleted: status.calendar,
      priority: 3,
    },
    {
      key: 'receptionist',
      title: 'Activate your AI receptionist',
      subtitle: 'Never miss a call again',
      completedSubtitle: status.details?.twilioPhoneNumber
        ? `Active ${formatPhoneNumber(status.details.twilioPhoneNumber)}`
        : 'Connected',
      icon: Bot,
      href: '/settings?tab=profile',
      isCompleted: status.receptionist,
      priority: 4,
    },
    {
      key: 'agents',
      title: 'Review your AI agents',
      subtitle: 'SMS agents follow up, recover no-shows, and rebook customers automatically',
      completedSubtitle: `${status.details?.enabledAgentCount || 0} agent(s) active`,
      icon: Zap,
      href: '/ai-agents',
      isCompleted: status.agents,
      priority: 5,
    },
  ];

  if (isSalon) {
    items.push(
      {
        key: 'staff',
        title: 'Add your team members',
        subtitle: 'Set up stylists and their schedules',
        completedSubtitle: `${status.details?.staffCount || 0} team member(s)`,
        icon: Scissors,
        href: '/settings?tab=staff',
        isCompleted: status.staff,
        priority: 3,
      },
      {
        key: 'booking',
        title: 'Enable online booking',
        subtitle: 'Let clients book appointments 24/7',
        completedSubtitle: status.details?.bookingSlug
          ? `Live at /${status.details.bookingSlug}`
          : 'Booking enabled',
        icon: Globe,
        href: '/settings?tab=booking',
        isCompleted: status.booking,
        priority: 5,
      },
      {
        key: 'customer',
        title: 'Add your first client',
        subtitle: 'Import or add a customer to get started',
        completedSubtitle: `${status.details?.customerCount || 0} client(s)`,
        icon: UserPlus,
        href: '/customers/new',
        isCompleted: status.customers,
        priority: 6,
      },
    );
  } else if (isRestaurant) {
    items.push(
      {
        key: 'pos',
        title: 'Connect your POS system',
        subtitle: 'Sync with Clover, Square, or Heartland',
        completedSubtitle: 'POS connected',
        icon: CreditCard,
        href: '/settings?tab=integrations',
        isCompleted: status.pos,
        priority: 2,
      },
      {
        key: 'reservations',
        title: 'Enable reservations',
        subtitle: 'Accept table reservations online',
        completedSubtitle: 'Reservations active',
        icon: Calendar,
        href: '/settings?tab=booking',
        isCompleted: status.reservations,
        priority: 5,
      },
      {
        key: 'staff',
        title: 'Add your staff',
        subtitle: 'Set up managers and team members',
        completedSubtitle: `${status.details?.staffCount || 0} staff member(s)`,
        icon: Users,
        href: '/settings?tab=staff',
        isCompleted: status.staff,
        priority: 6,
      },
    );
  } else if (isHomeService) {
    items.push(
      {
        key: 'staff',
        title: 'Add your technicians',
        subtitle: 'Set up your field team',
        completedSubtitle: `${status.details?.staffCount || 0} technician(s)`,
        icon: Wrench,
        href: '/settings?tab=staff',
        isCompleted: status.staff,
        priority: 5,
      },
      {
        key: 'booking',
        title: 'Enable online booking',
        subtitle: 'Let customers request service calls',
        completedSubtitle: status.details?.bookingSlug
          ? `Live at /${status.details.bookingSlug}`
          : 'Booking enabled',
        icon: Globe,
        href: '/settings?tab=booking',
        isCompleted: status.booking,
        priority: 6,
      },
      {
        key: 'customer',
        title: 'Add your first customer',
        subtitle: 'Start building your customer base',
        completedSubtitle: `${status.details?.customerCount || 0} customer(s)`,
        icon: UserPlus,
        href: '/customers/new',
        isCompleted: status.customers,
        priority: 7,
      },
    );
  } else if (isMedical) {
    items.push(
      {
        key: 'staff',
        title: 'Add your practitioners',
        subtitle: 'Set up providers and their availability',
        completedSubtitle: `${status.details?.staffCount || 0} practitioner(s)`,
        icon: Users,
        href: '/settings?tab=staff',
        isCompleted: status.staff,
        priority: 3,
      },
      {
        key: 'booking',
        title: 'Enable patient booking',
        subtitle: 'Let patients schedule appointments online',
        completedSubtitle: status.details?.bookingSlug
          ? `Live at /${status.details.bookingSlug}`
          : 'Booking enabled',
        icon: Globe,
        href: '/settings?tab=booking',
        isCompleted: status.booking,
        priority: 5,
      },
      {
        key: 'customer',
        title: 'Add your first patient',
        subtitle: 'Import or add a patient record',
        completedSubtitle: `${status.details?.customerCount || 0} patient(s)`,
        icon: UserPlus,
        href: '/customers/new',
        isCompleted: status.customers,
        priority: 6,
      },
    );
  } else {
    items.push(
      {
        key: 'staff',
        title: 'Add team members',
        subtitle: 'Set up your team and their roles',
        completedSubtitle: `${status.details?.staffCount || 0} member(s)`,
        icon: Users,
        href: '/settings?tab=staff',
        isCompleted: status.staff,
        priority: 5,
      },
      {
        key: 'booking',
        title: 'Enable online booking',
        subtitle: 'Let customers book appointments online',
        completedSubtitle: status.details?.bookingSlug
          ? `Live at /${status.details.bookingSlug}`
          : 'Booking enabled',
        icon: Globe,
        href: '/settings?tab=booking',
        isCompleted: status.booking,
        priority: 6,
      },
      {
        key: 'customer',
        title: 'Add your first customer',
        subtitle: 'Start building your customer base',
        completedSubtitle: `${status.details?.customerCount || 0} customer(s)`,
        icon: UserPlus,
        href: '/customers/new',
        isCompleted: status.customers,
        priority: 7,
      },
    );
  }

  return items.sort((a, b) => a.priority - b.priority);
}

export function SetupChecklist() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [isDismissed, setIsDismissed] = useState(user?.setupChecklistDismissed ?? false);

  const { data: setupStatus, isLoading } = useQuery<SetupStatus>({
    queryKey: ['/api/business/setup-status'],
    enabled: !!user?.businessId,
    refetchInterval: 30000,
  });

  const handleDismiss = async () => {
    setIsDismissed(true);
    try {
      await apiRequest('POST', '/api/user/setup-checklist-dismiss', { dismissed: true });
      await queryClient.invalidateQueries({ queryKey: ['/api/user'] });
    } catch (error) {
      console.error('Error dismissing checklist:', error);
    }
  };

  if (isDismissed || !user?.businessId) return null;

  if (isLoading) {
    return (
      <Card className="overflow-hidden border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30">
        <CardContent className="py-4 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-blue-500 mr-2" />
          <span className="text-sm text-muted-foreground">Checking setup status...</span>
        </CardContent>
      </Card>
    );
  }

  if (!setupStatus) return null;

  const items = getChecklistItems(setupStatus);
  const completedCount = items.filter(i => i.isCompleted).length;
  const totalItems = items.length;
  const progressPercent = totalItems > 0 ? Math.round((completedCount / totalItems) * 100) : 0;

  if (completedCount === totalItems) return null;

  const firstIncomplete = items.find(i => !i.isCompleted);

  return (
    <Card className="overflow-hidden border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30">
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <CardTitle className="text-lg">Getting Started</CardTitle>
            <CardDescription className="mt-1">
              {completedCount === 0
                ? 'Complete these steps to get the most out of your account'
                : `${completedCount} of ${totalItems} completed`}
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 rounded-full -mt-1 -mr-1"
            onClick={handleDismiss}
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Dismiss</span>
          </Button>
        </div>
        <div className="mt-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-muted-foreground">{progressPercent}% complete</span>
            <span className="text-xs text-muted-foreground">{completedCount}/{totalItems}</span>
          </div>
          <Progress
            value={progressPercent}
            className="h-2 [&>div]:bg-blue-500"
          />
        </div>
      </CardHeader>
      <CardContent className="pt-0 pb-4">
        <div className="space-y-1">
          {items.map((item) => (
            <ChecklistItem
              key={item.key}
              title={item.title}
              subtitle={item.isCompleted ? item.completedSubtitle : item.subtitle}
              icon={item.icon}
              isCompleted={item.isCompleted}
              onClick={() => setLocation(item.href)}
            />
          ))}
        </div>
        {firstIncomplete && (
          <Button
            variant="default"
            className="w-full mt-4"
            onClick={() => setLocation(firstIncomplete.href)}
          >
            {completedCount === 0 ? 'Start setup' : 'Continue setup'}
            <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function ChecklistItem({
  title,
  subtitle,
  icon: Icon,
  isCompleted,
  onClick,
}: {
  title: string;
  subtitle?: string;
  icon: React.ElementType;
  isCompleted: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
        onClick ? 'cursor-pointer hover:bg-blue-100/50 dark:hover:bg-blue-900/20' : ''
      } ${isCompleted ? 'opacity-60' : ''}`}
      onClick={onClick}
    >
      <div
        className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
          isCompleted
            ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
            : 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
        }`}
      >
        {isCompleted ? (
          <CheckCircle className="w-4 h-4" />
        ) : (
          <Icon className="w-4 h-4" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <span
          className={`text-sm font-medium block ${
            isCompleted ? 'text-muted-foreground line-through' : 'text-foreground'
          }`}
        >
          {title}
        </span>
        {subtitle && (
          <span className="text-xs text-muted-foreground block truncate">
            {subtitle}
          </span>
        )}
      </div>
      {!isCompleted && (
        <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
      )}
    </div>
  );
}
