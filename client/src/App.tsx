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
import Receptionist from "@/pages/receptionist/index";
import Settings from "@/pages/settings";
import AuthPage from "@/pages/auth/index";
// Admin pages
import AdminDashboard from "@/pages/admin/index";
import PhoneManagement from "@/pages/admin/phone-management";
import { SidebarProvider } from "./context/SidebarContext";
import { AuthProvider } from "./hooks/use-auth";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import { ProtectedAdminRoute } from "./components/auth/ProtectedAdminRoute";

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
      <ProtectedRoute path="/receptionist" component={Receptionist} />
      <ProtectedRoute path="/settings" component={Settings} />
      
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
            <Router />
          </SidebarProvider>
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
