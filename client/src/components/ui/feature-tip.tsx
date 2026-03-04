import { useState, useMemo } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { X, Lightbulb, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLocation } from 'wouter';

interface FeatureTipProps {
  tipId: string;
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
  icon?: React.ElementType;
}

export function FeatureTip({
  tipId,
  title,
  description,
  actionLabel,
  actionHref,
  icon: Icon = Lightbulb,
}: FeatureTipProps) {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  const dismissedTips = useMemo<string[]>(() => {
    if (!user?.dismissedTips) return [];
    try {
      return JSON.parse(user.dismissedTips);
    } catch {
      return [];
    }
  }, [user?.dismissedTips]);

  const [isDismissed, setIsDismissed] = useState(() => dismissedTips.includes(tipId));

  if (isDismissed || !user) return null;

  const handleDismiss = async () => {
    setIsDismissed(true);
    try {
      await apiRequest('POST', '/api/user/dismiss-tip', { tipId });
      await queryClient.invalidateQueries({ queryKey: ['/api/user'] });
    } catch (error) {
      console.error('Error dismissing tip:', error);
    }
  };

  return (
    <div className="flex items-start gap-3 p-4 rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/30 mb-4">
      <div className="flex-shrink-0 mt-0.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
          <Icon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-medium text-foreground">{title}</h4>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        {actionLabel && actionHref && (
          <Button
            variant="link"
            size="sm"
            className="h-auto p-0 mt-1.5 text-xs text-blue-600 dark:text-blue-400"
            onClick={() => setLocation(actionHref)}
          >
            {actionLabel}
            <ArrowRight className="ml-1 h-3 w-3" />
          </Button>
        )}
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0 rounded-full flex-shrink-0 -mt-0.5 -mr-1"
        onClick={handleDismiss}
      >
        <X className="h-3.5 w-3.5" />
        <span className="sr-only">Dismiss</span>
      </Button>
    </div>
  );
}
