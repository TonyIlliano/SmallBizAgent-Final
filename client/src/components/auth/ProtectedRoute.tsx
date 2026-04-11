import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import { Redirect, Route, RouteComponentProps } from "wouter";

interface ProtectedRouteProps {
  path: string;
  component: React.ComponentType<any>;
}

export function ProtectedRoute({
  path,
  component: Component,
}: ProtectedRouteProps) {
  const { user, isLoading } = useAuth();

  return (
    <Route path={path}>
      {(params) => {
        if (isLoading) {
          return (
            <div className="flex items-center justify-center min-h-screen">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          );
        }
        
        if (!user) {
          return <Redirect to="/auth" />;
        }

        // Redirect unverified users to email verification page
        // Use !user.emailVerified to also catch null/undefined (not just false)
        if (!user.emailVerified) {
          return <Redirect to="/verify-email" />;
        }

        // Staff users (effectiveRole === 'staff') can only access /staff/* routes and dashboard
        const effectiveRole = user.effectiveRole || (user.role === 'user' ? 'owner' : user.role);
        if (effectiveRole === "staff" && !path.startsWith("/staff/") && path !== "/") {
          return <Redirect to="/staff/dashboard" />;
        }

        // Managers use the regular dashboard with limited sidebar
        // No redirect needed for managers -- they access /dashboard normally

        // Redirect users who haven't completed onboarding (skip for admin and onboarding routes)
        const isOnboardingRoute = path.startsWith("/onboarding");
        if (!isOnboardingRoute && user.role !== "admin" && !user.onboardingComplete && !user.businessId) {
          return <Redirect to="/onboarding/subscription" />;
        }

        return <Component {...params} />;
      }}
    </Route>
  );
}