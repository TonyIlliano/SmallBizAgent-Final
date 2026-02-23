import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Loader2 } from "lucide-react";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import Customers from "@/pages/customers/index";
import CustomerDetail from "@/pages/customers/[id]";
import Appointments from "@/pages/appointments/index";
import AppointmentDetail from "@/pages/appointments/[id]";
import Jobs from "@/pages/jobs/index";
import JobDetail from "@/pages/jobs/[id]";
import Invoices from "@/pages/invoices/index";
import CreateInvoice from "@/pages/invoices/create";
import InvoicePayment from "@/pages/invoices/pay";
import InvoiceDetail from "@/pages/invoices/[id]/index";
import EditInvoice from "@/pages/invoices/[id]/edit";
import PrintInvoice from "@/pages/invoices/[id]/print";
import Quotes from "@/pages/quotes/index";
import CreateQuote from "@/pages/quotes/create";
import QuoteDetail from "@/pages/quotes/[id]/index";
import EditQuote from "@/pages/quotes/[id]/edit";
import PrintQuote from "@/pages/quotes/[id]/print";
import Payment from "@/pages/payment";
import SubscriptionSuccess from "@/pages/subscription-success";
import OnboardingSubscription from "@/pages/onboarding/subscription";
import OnboardingFlow from "@/pages/onboarding/index";
import Receptionist from "@/pages/receptionist/index";
import AnalyticsPage from "@/pages/analytics";
import Settings from "@/pages/settings";
import CalendarSettings from "@/pages/settings/calendar";
import PWAInstallationGuide from "@/pages/settings/pwa-installation";
import RecurringSchedules from "@/pages/recurring/index";
import AuthPage from "@/pages/auth/index";
import VerifyEmailPage from "@/pages/auth/verify-email";
import ResetPasswordPage from "@/pages/reset-password";
// Customer Portal pages (public)
import CustomerPortal from "@/pages/portal/index";
import PortalInvoice from "@/pages/portal/invoice";
import PortalQuote from "@/pages/portal/quote";
import PublicBooking from "@/pages/book/[slug]";
// Admin pages
import AdminDashboard from "@/pages/admin/index";
import PhoneManagement from "@/pages/admin/phone-management";
// Staff pages
import StaffDashboard from "@/pages/staff/dashboard";
import StaffJoin from "@/pages/staff/join";
import LandingPage from "@/pages/landing";
import { SidebarProvider } from "./context/SidebarContext";
import { AuthProvider, useAuth } from "./hooks/use-auth";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import { ProtectedAdminRoute } from "./components/auth/ProtectedAdminRoute";
// AppNav removed — Sidebar handles all navigation
import { ServiceWorkerNotification } from "@/components/ui/ServiceWorkerNotification";
import { PWAInstallPrompt } from "@/components/ui/PWAInstallPrompt";
import { ContextHelp } from "@/components/ui/context-help";

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

  return <Dashboard />;
}

function Router() {
  return (
    <Switch>
      {/* Home - landing page or dashboard based on auth */}
      <Route path="/" component={HomePage} />

      {/* Regular user routes */}
      <ProtectedRoute path="/dashboard" component={Dashboard} />
      <ProtectedRoute path="/customers" component={Customers} />
      <ProtectedRoute path="/customers/:id" component={CustomerDetail} />
      <ProtectedRoute path="/appointments" component={Appointments} />
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
      <ProtectedRoute path="/recurring" component={RecurringSchedules} />
      <ProtectedRoute path="/settings" component={Settings} />
      <ProtectedRoute path="/settings/calendar" component={CalendarSettings} />
      <ProtectedRoute path="/settings/pwa-installation" component={PWAInstallationGuide} />
      
      {/* Admin routes */}
      <ProtectedAdminRoute path="/admin" component={AdminDashboard} />
      <ProtectedAdminRoute path="/admin/phone-management" component={PhoneManagement} />

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
      <Route path="/book/:slug" component={PublicBooking} />
      <Route component={NotFound} />
    </Switch>
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
