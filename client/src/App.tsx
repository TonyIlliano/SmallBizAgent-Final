import React, { lazy, Suspense } from "react";
import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Loader2 } from "lucide-react";
import { SidebarProvider } from "./context/SidebarContext";
import { AuthProvider, useAuth } from "./hooks/use-auth";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import { ProtectedAdminRoute } from "./components/auth/ProtectedAdminRoute";
import { ServiceWorkerNotification } from "@/components/ui/ServiceWorkerNotification";
import { PWAInstallPrompt } from "@/components/ui/PWAInstallPrompt";
import { SupportChat } from "@/components/ui/support-chat";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { OfflineBanner } from "@/components/ui/offline-banner";

// Eagerly loaded (critical path)
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import LandingPage from "@/pages/landing";
import AuthPage from "@/pages/auth/index";

// Auto-retry lazy imports on chunk load failure (stale cache after deployment)
function lazyWithRetry(importFn: () => Promise<any>) {
  return lazy(() =>
    importFn().catch(() => {
      // Chunk failed to load — likely stale cache after a deployment.
      // Reload the page once to get fresh assets.
      const hasReloaded = sessionStorage.getItem('chunk-reload');
      if (!hasReloaded) {
        sessionStorage.setItem('chunk-reload', '1');
        window.location.reload();
        return new Promise(() => {}); // Never resolves — page is reloading
      }
      sessionStorage.removeItem('chunk-reload');
      return importFn(); // Final attempt after reload
    })
  );
}

// Lazy-loaded routes (code-split into separate chunks)
const Customers = lazyWithRetry(() => import("@/pages/customers/index"));
const CustomerDetail = lazyWithRetry(() => import("@/pages/customers/[id]"));
const Appointments = lazyWithRetry(() => import("@/pages/appointments/index"));
const ScheduleRouter = lazyWithRetry(() => import("@/pages/schedule-router"));
const AppointmentDetail = lazyWithRetry(() => import("@/pages/appointments/[id]"));
const FullscreenSchedule = lazyWithRetry(() => import("@/pages/appointments/fullscreen"));
const Jobs = lazyWithRetry(() => import("@/pages/jobs/index"));
const JobDetail = lazyWithRetry(() => import("@/pages/jobs/[id]"));
const Invoices = lazyWithRetry(() => import("@/pages/invoices/index"));
const CreateInvoice = lazyWithRetry(() => import("@/pages/invoices/create"));
const InvoicePayment = lazyWithRetry(() => import("@/pages/invoices/pay"));
const InvoiceDetail = lazyWithRetry(() => import("@/pages/invoices/[id]/index"));
const EditInvoice = lazyWithRetry(() => import("@/pages/invoices/[id]/edit"));
const PrintInvoice = lazyWithRetry(() => import("@/pages/invoices/[id]/print"));
const Quotes = lazyWithRetry(() => import("@/pages/quotes/index"));
const CreateQuote = lazyWithRetry(() => import("@/pages/quotes/create"));
const QuoteDetail = lazyWithRetry(() => import("@/pages/quotes/[id]/index"));
const EditQuote = lazyWithRetry(() => import("@/pages/quotes/[id]/edit"));
const PrintQuote = lazyWithRetry(() => import("@/pages/quotes/[id]/print"));
const Payment = lazyWithRetry(() => import("@/pages/payment"));
const SubscriptionSuccess = lazyWithRetry(() => import("@/pages/subscription-success"));
const OnboardingSubscription = lazyWithRetry(() => import("@/pages/onboarding/subscription"));
const OnboardingFlow = lazyWithRetry(() => import("@/pages/onboarding/index"));
const Receptionist = lazyWithRetry(() => import("@/pages/receptionist/index"));
const AnalyticsPage = lazyWithRetry(() => import("@/pages/analytics"));
const MarketingPage = lazyWithRetry(() => import("@/pages/marketing"));
const AutomationsPage = lazyWithRetry(() => import("@/pages/automations/index"));
const Settings = lazyWithRetry(() => import("@/pages/settings"));
const WebsiteBuilder = lazyWithRetry(() => import("@/pages/website-builder"));
const GoogleBusinessProfilePage = lazyWithRetry(() => import("@/pages/google-business-profile"));
const SmsCampaigns = lazyWithRetry(() => import("@/pages/sms-campaigns/index"));
const CalendarSettings = lazyWithRetry(() => import("@/pages/settings/calendar"));
const PWAInstallationGuide = lazyWithRetry(() => import("@/pages/settings/pwa-installation"));
const RecurringSchedules = lazyWithRetry(() => import("@/pages/recurring/index"));
const VerifyEmailPage = lazyWithRetry(() => import("@/pages/auth/verify-email"));
const ResetPasswordPage = lazyWithRetry(() => import("@/pages/reset-password"));
// Customer Portal pages (public)
const CustomerPortal = lazyWithRetry(() => import("@/pages/portal/index"));
const PortalInvoice = lazyWithRetry(() => import("@/pages/portal/invoice"));
const PortalQuote = lazyWithRetry(() => import("@/pages/portal/quote"));
const PublicBooking = lazyWithRetry(() => import("@/pages/book/[slug]"));
const ManageAppointment = lazyWithRetry(() => import("@/pages/book/manage"));
const ManageReservation = lazyWithRetry(() => import("@/pages/book/manage-reservation"));
// Admin pages
const AdminDashboard = lazyWithRetry(() => import("@/pages/admin/index"));
const PhoneManagement = lazyWithRetry(() => import("@/pages/admin/phone-management"));
const SocialMediaAdmin = lazyWithRetry(() => import("@/pages/admin/social-media"));
// Staff pages
const StaffDashboard = lazyWithRetry(() => import("@/pages/staff/dashboard"));
const StaffJoin = lazyWithRetry(() => import("@/pages/staff/join"));
const PrivacyPolicy = lazyWithRetry(() => import("@/pages/privacy"));
const TermsOfService = lazyWithRetry(() => import("@/pages/terms"));
const SmsTerms = lazyWithRetry(() => import("@/pages/sms-terms"));
const SupportPage = lazyWithRetry(() => import("@/pages/support"));
const ContactPage = lazyWithRetry(() => import("@/pages/contact"));
const HelpPage = lazyWithRetry(() => import("@/pages/help"));

// Loading fallback for lazy-loaded routes
function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

// Smart home: shows dashboard if logged in, landing page if not
function HomePage() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Not logged in — show landing page
  if (!user) return <LandingPage />;

  // Logged in but email not verified — redirect to verification (skip for admin)
  if (!user.emailVerified && user.role !== "admin") return <Redirect to="/verify-email" />;

  // Staff users go to their portal
  if (user.role === "staff") return <Redirect to="/staff/dashboard" />;

  // User hasn't completed onboarding — redirect to subscription selection (skip for admin)
  if (user.role !== "admin" && !user.onboardingComplete && !user.businessId) {
    return <Redirect to="/onboarding/subscription" />;
  }

  return <Dashboard />;
}

function Router() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        {/* Home - landing page or dashboard based on auth */}
        <Route path="/" component={HomePage} />

        {/* Regular user routes */}
        <ProtectedRoute path="/dashboard" component={Dashboard} />
        <ProtectedRoute path="/customers" component={Customers} />
        <ProtectedRoute path="/customers/:id" component={CustomerDetail} />
        <ProtectedRoute path="/appointments" component={ScheduleRouter} />
        <ProtectedRoute path="/appointments/fullscreen" component={FullscreenSchedule} />
        <ProtectedRoute path="/appointments/:id" component={AppointmentDetail} />
        <ProtectedRoute path="/jobs" component={Jobs} />
        <ProtectedRoute path="/jobs/:id" component={JobDetail} />
        <ProtectedRoute path="/invoices" component={Invoices} />
        <ProtectedRoute path="/invoices/create" component={CreateInvoice} />
        <ProtectedRoute path="/invoices/pay/:invoiceId" component={InvoicePayment} />
        <ProtectedRoute path="/invoices/:id/print" component={PrintInvoice} />
        <ProtectedRoute path="/invoices/:id/edit" component={EditInvoice} />
        <ProtectedRoute path="/invoices/:id" component={InvoiceDetail} />
        <ProtectedRoute path="/quotes" component={Quotes} />
        <ProtectedRoute path="/quotes/create" component={CreateQuote} />
        <ProtectedRoute path="/quotes/:id" component={QuoteDetail} />
        <ProtectedRoute path="/quotes/:id/edit" component={EditQuote} />
        <ProtectedRoute path="/quotes/:id/print" component={PrintQuote} />
        <ProtectedRoute path="/payment" component={Payment} />
        <ProtectedRoute path="/subscription-success" component={SubscriptionSuccess} />
        <ProtectedRoute path="/onboarding" component={OnboardingFlow} />
        <ProtectedRoute path="/onboarding/subscription" component={OnboardingSubscription} />
        <ProtectedRoute path="/receptionist" component={Receptionist} />
        <ProtectedRoute path="/analytics" component={AnalyticsPage} />
        <ProtectedRoute path="/marketing" component={MarketingPage} />
        <ProtectedRoute path="/ai-agents" component={AutomationsPage} />
        <ProtectedRoute path="/recurring" component={RecurringSchedules} />
        <ProtectedRoute path="/website" component={WebsiteBuilder} />
        <ProtectedRoute path="/google-business-profile" component={GoogleBusinessProfilePage} />
        <ProtectedRoute path="/sms-campaigns" component={SmsCampaigns} />
        <ProtectedRoute path="/settings" component={Settings} />
        <ProtectedRoute path="/settings/calendar" component={CalendarSettings} />
        <ProtectedRoute path="/settings/pwa-installation" component={PWAInstallationGuide} />

        {/* Admin routes */}
        <ProtectedAdminRoute path="/admin" component={AdminDashboard} />
        <ProtectedAdminRoute path="/admin/phone-management" component={PhoneManagement} />
        <ProtectedAdminRoute path="/admin/social-media" component={SocialMediaAdmin} />

        {/* Staff routes */}
        <ProtectedRoute path="/staff/dashboard" component={StaffDashboard} />

        {/* Public routes */}
        <Route path="/staff/join/:code" component={StaffJoin} />
        <Route path="/welcome" component={LandingPage} />
        <Route path="/auth" component={AuthPage} />
        <Route path="/verify-email" component={VerifyEmailPage} />
        <Route path="/reset-password" component={ResetPasswordPage} />
        <Route path="/portal" component={CustomerPortal} />
        <Route path="/portal/invoice/:token" component={PortalInvoice} />
        <Route path="/portal/quote/:token" component={PortalQuote} />
        <Route path="/book/:slug/manage-reservation/:token" component={ManageReservation} />
        <Route path="/book/:slug/manage/:token" component={ManageAppointment} />
        <Route path="/book/:slug" component={PublicBooking} />
        <Route path="/privacy" component={PrivacyPolicy} />
        <Route path="/terms" component={TermsOfService} />
        <Route path="/sms-terms" component={SmsTerms} />
        <Route path="/support" component={SupportPage} />
        <Route path="/contact" component={ContactPage} />
        <Route path="/help" component={HelpPage} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function CapacitorInit() {
  const { user } = useAuth();
  React.useEffect(() => {
    import('./lib/capacitor-deeplinks').then(m => m.initDeepLinks()).catch(() => {});
    if (user?.businessId) {
      import('./lib/capacitor-push').then(m => m.initPushNotifications(user.businessId!)).catch(() => {});
    }
  }, [user?.businessId]);
  return null;
}

function ImpersonationBanner() {
  const { user } = useAuth();
  const imp = (user as any)?.impersonating;
  if (!imp) return null;

  const handleExit = async () => {
    try {
      await fetch('/api/admin/stop-impersonation', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
      // Wait for user data to refetch with impersonation cleared before navigating
      await queryClient.refetchQueries({ queryKey: ['/api/user'] });
      window.location.href = '/admin';
    } catch (e) {
      console.error('Failed to stop impersonation:', e);
      // Force reload as fallback
      window.location.href = '/admin';
    }
  };

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] bg-amber-500 text-amber-950 px-4 py-2 flex items-center justify-center gap-3 text-sm font-medium shadow-md">
      <span>Viewing as: <strong>{imp.businessName}</strong></span>
      <button onClick={handleExit} className="bg-amber-700 text-white px-3 py-0.5 rounded text-xs font-semibold hover:bg-amber-800 transition-colors">
        Exit
      </button>
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AuthProvider>
            <SidebarProvider>
              <Toaster />
              <ServiceWorkerNotification />
              <PWAInstallPrompt />
              <SupportChat />
              <OfflineBanner />
              <CapacitorInit />
              <ImpersonationBanner />
              <Router />
            </SidebarProvider>
          </AuthProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
