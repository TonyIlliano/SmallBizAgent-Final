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
        if (user.emailVerified === false) {
          return <Redirect to="/verify-email" />;
        }

        return <Component {...params} />;
      }}
    </Route>
  );
}