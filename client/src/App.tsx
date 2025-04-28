import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import Customers from "@/pages/customers/index";
import CustomerDetail from "@/pages/customers/[id]";
import Appointments from "@/pages/appointments/index";
import Jobs from "@/pages/jobs/index";
import JobDetail from "@/pages/jobs/[id]";
import Invoices from "@/pages/invoices/index";
import CreateInvoice from "@/pages/invoices/create";
import InvoicePayment from "@/pages/invoices/pay";
import Quotes from "@/pages/quotes/index";
import CreateQuote from "@/pages/quotes/create";
import QuoteDetail from "@/pages/quotes/[id]/index";
import EditQuote from "@/pages/quotes/[id]/edit";
import Payment from "@/pages/payment";
import SubscriptionSuccess from "@/pages/subscription-success";
import OnboardingSubscription from "@/pages/onboarding/subscription";
import Receptionist from "@/pages/receptionist/index";
import ReceptionistTraining from "@/pages/receptionist/training";
import Settings from "@/pages/settings";
import CalendarSettings from "@/pages/settings/calendar";
import AuthPage from "@/pages/auth/index";
// Admin pages
import AdminDashboard from "@/pages/admin/index";
import PhoneManagement from "@/pages/admin/phone-management";
import { SidebarProvider } from "./context/SidebarContext";
import { AuthProvider } from "./hooks/use-auth";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import { ProtectedAdminRoute } from "./components/auth/ProtectedAdminRoute";
import { AppNav } from "./components/navigation/AppNav";
import { ServiceWorkerNotification } from "@/components/ui/ServiceWorkerNotification";

function Router() {
  return (
    <Switch>
      {/* Regular user routes */}
      <ProtectedRoute path="/" component={Dashboard} />
      <ProtectedRoute path="/customers" component={Customers} />
      <ProtectedRoute path="/customers/:id" component={CustomerDetail} />
      <ProtectedRoute path="/appointments" component={Appointments} />
      <ProtectedRoute path="/jobs" component={Jobs} />
      <ProtectedRoute path="/jobs/:id" component={JobDetail} />
      <ProtectedRoute path="/invoices" component={Invoices} />
      <ProtectedRoute path="/invoices/create" component={CreateInvoice} />
      <ProtectedRoute path="/invoices/pay/:invoiceId" component={InvoicePayment} />
      <ProtectedRoute path="/quotes" component={Quotes} />
      <ProtectedRoute path="/quotes/create" component={CreateQuote} />
      <ProtectedRoute path="/quotes/:id" component={QuoteDetail} />
      <ProtectedRoute path="/quotes/:id/edit" component={EditQuote} />
      <ProtectedRoute path="/payment" component={Payment} />
      <ProtectedRoute path="/subscription-success" component={SubscriptionSuccess} />
      <ProtectedRoute path="/onboarding/subscription" component={OnboardingSubscription} />
      <ProtectedRoute path="/receptionist" component={Receptionist} />
      <ProtectedRoute path="/receptionist/training" component={ReceptionistTraining} />
      <ProtectedRoute path="/settings" component={Settings} />
      <ProtectedRoute path="/settings/calendar" component={CalendarSettings} />
      
      {/* Admin routes */}
      <ProtectedAdminRoute path="/admin" component={AdminDashboard} />
      <ProtectedAdminRoute path="/admin/phone-management" component={PhoneManagement} />
      
      {/* Public routes */}
      <Route path="/auth" component={AuthPage} />
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
            <AppNav />
            <div className="pt-0 md:pt-14">
              <Router />
            </div>
          </SidebarProvider>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
