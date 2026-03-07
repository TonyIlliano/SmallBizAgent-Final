import { lazy, Suspense } from "react";
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
import { ContextHelp } from "@/components/ui/context-help";

// Eagerly loaded (critical path)
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import LandingPage from "@/pages/landing";
import AuthPage from "@/pages/auth/index";

// Lazy-loaded routes (code-split into separate chunks)
const Customers = lazy(() => import("@/pages/customers/index"));
const CustomerDetail = lazy(() => import("@/pages/customers/[id]"));
const Appointments = lazy(() => import("@/pages/appointments/index"));
const AppointmentDetail = lazy(() => import("@/pages/appointments/[id]"));
const FullscreenSchedule = lazy(() => import("@/pages/appointments/fullscreen"));
const Jobs = lazy(() => import("@/pages/jobs/index"));
const JobDetail = lazy(() => import("@/pages/jobs/[id]"));
const Invoices = lazy(() => import("@/pages/invoices/index"));
const CreateInvoice = lazy(() => import("@/pages/invoices/create"));
const InvoicePayment = lazy(() => import("@/pages/invoices/pay"));
const InvoiceDetail = lazy(() => import("@/pages/invoices/[id]/index"));
const EditInvoice = lazy(() => import("@/pages/invoices/[id]/edit"));
const PrintInvoice = lazy(() => import("@/pages/invoices/[id]/print"));
const Quotes = lazy(() => import("@/pages/quotes/index"));
const CreateQuote = lazy(() => import("@/pages/quotes/create"));
const QuoteDetail = lazy(() => import("@/pages/quotes/[id]/index"));
const EditQuote = lazy(() => import("@/pages/quotes/[id]/edit"));
const PrintQuote = lazy(() => import("@/pages/quotes/[id]/print"));
const Payment = lazy(() => import("@/pages/payment"));
const SubscriptionSuccess = lazy(() => import("@/pages/subscription-success"));
const OnboardingSubscription = lazy(() => import("@/pages/onboarding/subscription"));
const OnboardingFlow = lazy(() => import("@/pages/onboarding/index"));
const Receptionist = lazy(() => import("@/pages/receptionist/index"));
const AnalyticsPage = lazy(() => import("@/pages/analytics"));
const MarketingPage = lazy(() => import("@/pages/marketing"));
const AutomationsPage = lazy(() => import("@/pages/automations/index"));
const Settings = lazy(() => import("@/pages/settings"));
const CalendarSettings = lazy(() => import("@/pages/settings/calendar"));
const PWAInstallationGuide = lazy(() => import("@/pages/settings/pwa-installation"));
const RecurringSchedules = lazy(() => import("@/pages/recurring/index"));
const VerifyEmailPage = lazy(() => import("@/pages/auth/verify-email"));
const ResetPasswordPage = lazy(() => import("@/pages/reset-password"));
// Customer Portal pages (public)
const CustomerPortal = lazy(() => import("@/pages/portal/index"));
const PortalInvoice = lazy(() => import("@/pages/portal/invoice"));
const PortalQuote = lazy(() => import("@/pages/portal/quote"));
const PublicBooking = lazy(() => import("@/pages/book/[slug]"));
const ManageAppointment = lazy(() => import("@/pages/book/manage"));
const ManageReservation = lazy(() => import("@/pages/book/manage-reservation"));
// Admin pages
const AdminDashboard = lazy(() => import("@/pages/admin/index"));
const PhoneManagement = lazy(() => import("@/pages/admin/phone-management"));
const SocialMediaAdmin = lazy(() => import("@/pages/admin/social-media"));
// Staff pages
const StaffDashboard = lazy(() => import("@/pages/staff/dashboard"));
const StaffJoin = lazy(() => import("@/pages/staff/join"));
const PrivacyPolicy = lazy(() => import("@/pages/privacy"));
const TermsOfService = lazy(() => import("@/pages/terms"));
const SupportPage = lazy(() => import("@/pages/support"));
const ContactPage = lazy(() => import("@/pages/contact"));

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
        <ProtectedRoute path="/appointments" component={Appointments} />
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
        <Route path="/support" component={SupportPage} />
        <Route path="/contact" component={ContactPage} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <SidebarProvider>
            <Toaster />
            <ServiceWorkerNotification />
            <PWAInstallPrompt />
            <ContextHelp />
            <Router />
          </SidebarProvider>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
