import { useAuth } from '@/hooks/use-auth';
import { useLocation } from 'wouter';
import { useState, useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';

const DISMISS_KEY = 'sba-trial-banner-dismissed';

function todayKey(): string {
  return new Date().toISOString().split('T')[0];
}

function daysLeft(trialEndsAt: string | null | undefined): number | null {
  if (!trialEndsAt) return null;
  const end = new Date(trialEndsAt).getTime();
  if (Number.isNaN(end)) return null;
  return Math.ceil((end - Date.now()) / (1000 * 60 * 60 * 24));
}

/**
 * Global trial / grace-period banner. Renders fixed at the top of the app on
 * every authenticated page. Hidden for active subscribers, founder accounts,
 * unauthenticated users, and trials with more than 7 days remaining.
 *
 * Dismissal is per-day: once dismissed, the banner stays hidden until the next
 * UTC date rolls over. The grace-period banner is non-dismissible because the
 * AI receptionist is paused and the merchant must take action.
 */
export function GlobalTrialBanner() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [dismissedToday, setDismissedToday] = useState(false);

  // Check localStorage once on mount and whenever the user changes.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(DISMISS_KEY);
      setDismissedToday(stored === todayKey());
    } catch {
      setDismissedToday(false);
    }
  }, [user?.id]);

  if (!user || !user.businessId) return null;
  if (user.isFounder) return null;
  if (user.subscriptionStatus === 'active') return null;

  const isImpersonating = !!user.impersonating;
  const isGracePeriod = user.subscriptionStatus === 'grace_period';
  const isFreePlan = user.subscriptionStatus === 'free';
  const days = daysLeft(user.trialEndsAt);

  // Show grace-period banner unconditionally (until merchant resubscribes).
  // Show free-plan banner persistently but dismissible per-day (low-stakes nudge).
  // Show trial banner only when 7 or fewer days remain and trial is still active.
  const showGrace = isGracePeriod;
  const showFree = !showGrace && isFreePlan;
  const showTrial = !showGrace && !showFree && user.isTrialActive && days !== null && days <= 7 && days >= 0;

  if (!showGrace && !showFree && !showTrial) return null;
  if (!showGrace && dismissedToday) return null; // grace is non-dismissible; free + trial are dismissible

  const handleDismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, todayKey());
    } catch {
      /* ignore quota errors */
    }
    setDismissedToday(true);
  };

  const handleAddPayment = () => {
    setLocation('/settings?tab=subscription');
  };

  const handleManageSubscription = () => {
    setLocation('/settings?tab=subscription');
  };

  // Stack below the impersonation banner if it's active (h-10 ≈ 40px).
  const topClass = isImpersonating ? 'top-10' : 'top-0';

  if (showGrace) {
    return (
      <div
        role="alert"
        className={`fixed ${topClass} left-0 right-0 z-[99] bg-red-600 text-white px-4 py-2 flex items-center justify-center gap-3 text-sm font-medium shadow-md`}
        data-testid="banner-trial-grace"
      >
        <AlertTriangle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
        <span>
          Your AI receptionist is paused. Add a payment method to resume taking calls.
        </span>
        <button
          onClick={handleAddPayment}
          className="bg-white text-red-700 px-3 py-0.5 rounded text-xs font-semibold hover:bg-red-50 transition-colors"
          data-testid="button-trial-add-payment"
        >
          Add Payment
        </button>
      </div>
    );
  }

  // Free-plan banner: low-key friendly slate. CRM is still fully usable;
  // upgrade unlocks AI receptionist, SMS, email reminders, and the booking page.
  if (showFree) {
    return (
      <div
        role="status"
        className={`fixed ${topClass} left-0 right-0 z-[99] bg-slate-700 text-white px-4 py-2 flex items-center justify-center gap-3 text-sm font-medium shadow-md`}
        data-testid="banner-free-plan"
      >
        <span>
          You're on the Free plan. Your CRM is still fully usable. Upgrade to bring back
          the AI receptionist, SMS, and online booking.
        </span>
        <button
          onClick={handleAddPayment}
          className="bg-white text-slate-800 px-3 py-0.5 rounded text-xs font-semibold hover:bg-slate-100 transition-colors"
          data-testid="button-free-upgrade"
        >
          Upgrade
        </button>
        <button
          onClick={handleDismiss}
          className="opacity-70 hover:opacity-100 transition-opacity"
          aria-label="Dismiss for today"
          data-testid="button-free-dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  // Trial banner: amber for 3-7 days, red for ≤2 days.
  const urgent = days !== null && days <= 2;
  const palette = urgent
    ? 'bg-red-500 text-white'
    : 'bg-amber-500 text-amber-950';
  const buttonPalette = urgent
    ? 'bg-white text-red-700 hover:bg-red-50'
    : 'bg-amber-700 text-white hover:bg-amber-800';

  const dayWord = days === 1 ? 'day' : 'days';
  // Card-required trial flow: at this point a card is on file (otherwise the
  // user would be in grace_period or free, not trialing). The copy reflects
  // that — billing will start automatically unless they cancel.
  const headline =
    days === 0
      ? "Your trial ends today — billing starts tomorrow unless you cancel."
      : days === 1
        ? "Your trial ends tomorrow — billing starts in 1 day unless you cancel."
        : `Your trial ends in ${days} days — billing starts then unless you cancel.`;

  return (
    <div
      role="alert"
      className={`fixed ${topClass} left-0 right-0 z-[99] ${palette} px-4 py-2 flex items-center justify-center gap-3 text-sm font-medium shadow-md`}
      data-testid="banner-trial-warning"
    >
      <AlertTriangle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
      <span>{headline}</span>
      <button
        onClick={handleManageSubscription}
        className={`${buttonPalette} px-3 py-0.5 rounded text-xs font-semibold transition-colors`}
        data-testid="button-trial-manage"
      >
        Manage
      </button>
      <button
        onClick={handleDismiss}
        className="opacity-70 hover:opacity-100 transition-opacity"
        aria-label="Dismiss for today"
        data-testid="button-trial-dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
