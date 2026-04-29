import { useAuth } from '@/hooks/use-auth';
import { useLocation } from 'wouter';
import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

const KEY_7D = 'sba-trial-modal-7d-shown';
const KEY_1D = 'sba-trial-modal-1d-shown';
const KEY_GRACE = 'sba-trial-modal-grace-shown';

type Threshold = '7d' | '1d' | 'grace';

function daysLeft(trialEndsAt: string | null | undefined): number | null {
  if (!trialEndsAt) return null;
  const end = new Date(trialEndsAt).getTime();
  if (Number.isNaN(end)) return null;
  return Math.ceil((end - Date.now()) / (1000 * 60 * 60 * 24));
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore quota errors */
  }
}

/**
 * One-shot modal triggered on app load when the user crosses a critical
 * trial threshold. Each threshold (7 days remaining, 1 day remaining, grace
 * period) is shown at most once per browser per user — once dismissed, the
 * localStorage flag prevents it from reappearing.
 *
 * The global banner remains visible after dismissal; this modal exists for
 * the higher-impact "you must look at this" moments only.
 */
export function TrialLoginModal() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const [threshold, setThreshold] = useState<Threshold | null>(null);

  useEffect(() => {
    if (!user || !user.businessId) return;
    if (user.isFounder) return;
    if (user.subscriptionStatus === 'active') return;

    // Highest priority first: grace period (AI is paused right now).
    if (user.subscriptionStatus === 'grace_period') {
      if (!safeGet(KEY_GRACE)) {
        setThreshold('grace');
        setOpen(true);
      }
      return;
    }

    if (!user.isTrialActive) return;
    const days = daysLeft(user.trialEndsAt);
    if (days === null) return;

    if (days <= 1 && days >= 0 && !safeGet(KEY_1D)) {
      setThreshold('1d');
      setOpen(true);
      return;
    }
    if (days <= 7 && days > 1 && !safeGet(KEY_7D)) {
      setThreshold('7d');
      setOpen(true);
    }
  }, [
    user?.id,
    user?.subscriptionStatus,
    user?.trialEndsAt,
    user?.isTrialActive,
    user?.isFounder,
    user?.businessId,
  ]);

  if (!threshold) return null;

  const markShown = () => {
    if (threshold === '7d') safeSet(KEY_7D, 'true');
    if (threshold === '1d') safeSet(KEY_1D, 'true');
    if (threshold === 'grace') safeSet(KEY_GRACE, 'true');
  };

  const handleAddPayment = () => {
    markShown();
    setOpen(false);
    setLocation('/settings?tab=subscription');
  };

  const handleClose = (next: boolean) => {
    if (!next) {
      // User dismissed (X button, escape, overlay click, "Remind me later").
      markShown();
    }
    setOpen(next);
  };

  let title: string;
  let description: string;
  let primaryLabel: string;
  let secondaryLabel: string;

  if (threshold === 'grace') {
    title = 'Your AI receptionist is paused';
    description =
      'Your free trial has ended. Add a payment method to resume taking calls — your phone number is still reserved for you.';
    primaryLabel = 'Add Payment Method';
    secondaryLabel = 'Not now';
  } else if (threshold === '1d') {
    title = 'Your trial ends tomorrow';
    description =
      "Add a payment method now so your AI receptionist keeps answering calls without interruption. We won't charge anything extra during the trial.";
    primaryLabel = 'Add Payment Method';
    secondaryLabel = 'Remind me later';
  } else {
    title = 'Your trial ends in 7 days';
    description =
      'You\'re a week away from the end of your free trial. Add a payment method anytime to keep your AI receptionist active. You can cancel later from Settings.';
    primaryLabel = 'Add Payment Method';
    secondaryLabel = 'Remind me later';
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md" data-testid="modal-trial-warning">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle
              className={
                threshold === 'grace' || threshold === '1d'
                  ? 'h-5 w-5 text-red-600'
                  : 'h-5 w-5 text-amber-600'
              }
              aria-hidden="true"
            />
            <DialogTitle>{title}</DialogTitle>
          </div>
          <DialogDescription className="pt-2">{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => handleClose(false)}
            data-testid="button-trial-modal-dismiss"
          >
            {secondaryLabel}
          </Button>
          <Button
            onClick={handleAddPayment}
            data-testid="button-trial-modal-add-payment"
          >
            {primaryLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
