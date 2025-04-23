import { useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";
import { Redirect, Route } from "wouter";

interface ProtectedAdminRouteProps {
  path: string;
  component: React.ComponentType<any>;
}

export function ProtectedAdminRoute({
  path,
  component: Component,
}: ProtectedAdminRouteProps) {
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
        
        // Redirect to auth if not logged in
        if (!user) {
          return <Redirect to="/auth" />;
        }
        
        // Redirect to dashboard if not an admin
        if (user.role !== "admin") {
          return <Redirect to="/" />;
        }
        
        // User is logged in and is an admin, render the component
        return <Component {...params} />;
      }}
    </Route>
  );
}