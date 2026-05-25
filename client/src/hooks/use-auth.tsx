import { createContext, ReactNode, useContext, useEffect } from "react";
import {
  useQuery,
  useMutation,
  UseMutationResult,
} from "@tanstack/react-query";
import { User } from "@shared/schema";
import { queryClient } from "../lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { getUtmParams, clearUtmParams } from "@/lib/utm";
import { identifyUser, identifyBusiness, captureEvent, resetPostHog } from "@/lib/posthog";

/**
 * Send identify + group calls to PostHog for an authenticated user.
 * Called on initial /api/user load and after login/register.
 * Safe to call repeatedly — PostHog merges properties on the same distinctId.
 */
function syncToPostHog(user: AuthUser): void {
  if (!user?.id) return;
  // Use the IMPERSONATED business when an admin is viewing as a tenant,
  // so the admin's PostHog events get attributed to the right business.
  const businessId = user.impersonating?.businessId ?? user.businessId;

  identifyUser(user.id, {
    username: user.username,
    email: user.email,
    role: user.role,
    effective_role: user.effectiveRole,
    business_id: businessId,
    subscription_status: user.subscriptionStatus ?? null,
    is_trial_active: user.isTrialActive ?? false,
    is_founder: user.isFounder ?? false,
    is_impersonating: !!user.impersonating,
  });

  if (businessId) {
    identifyBusiness(businessId, {
      subscription_status: user.subscriptionStatus ?? null,
      is_trial_active: user.isTrialActive ?? false,
    });
  }
}

// Extended user type that includes role/permission fields from GET /api/user
export type AuthUser = User & {
  effectiveRole?: 'admin' | 'owner' | 'manager' | 'staff';
  permissions?: string[];
  impersonating?: {
    businessId: number;
    businessName: string;
    originalBusinessId: number;
  };
  // Subscription fields enriched server-side for the global trial banner / modal.
  subscriptionStatus?: string | null;
  trialEndsAt?: string | null;
  isTrialActive?: boolean;
  isFounder?: boolean;
};

type AuthContextType = {
  user: AuthUser | null;
  isLoading: boolean;
  error: Error | null;
  loginMutation: UseMutationResult<AuthUser, Error, LoginData>;
  logoutMutation: UseMutationResult<void, Error, void>;
  registerMutation: UseMutationResult<AuthUser, Error, RegisterData>;
};

type LoginData = {
  username: string;
  password: string;
  turnstileToken?: string | null;
};

type RegisterData = {
  username: string;
  email: string;
  password: string;
  role?: string;
  businessId?: number;
  active?: boolean;
  turnstileToken?: string | null;
  acceptTerms?: boolean;
  acceptPrivacy?: boolean;
};

export const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const {
    data: user,
    error,
    isLoading,
  } = useQuery<AuthUser | null, Error>({
    queryKey: ["/api/user"],
    queryFn: async () => {
      try {
        const res = await fetch("/api/user", {
          credentials: "include",
        });
        if (res.status === 401) {
          return null;
        }
        if (!res.ok) {
          return null;
        }
        return await res.json();
      } catch (error) {
        console.error("Error fetching user:", error);
        return null;
      }
    },
  });

  // Sync authenticated user to PostHog on every /api/user response change.
  // Covers: initial page load with existing session, login, register, plan upgrade, impersonation switch.
  useEffect(() => {
    if (user?.id) {
      syncToPostHog(user);
    }
  }, [user?.id, user?.businessId, user?.subscriptionStatus, user?.impersonating?.businessId]);

  const loginMutation = useMutation({
    mutationFn: async (credentials: LoginData) => {
      // Read CSRF token from cookie
      const csrfToken = document.cookie.match(/(?:^|; )csrf-token=([^;]*)/)?.[1];
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (csrfToken) headers["X-CSRF-Token"] = decodeURIComponent(csrfToken);

      const res = await fetch("/api/login", {
        method: "POST",
        headers,
        body: JSON.stringify(credentials),
        credentials: "include",
      });

      if (!res.ok) {
        let errorMessage = "Login failed";
        try {
          const errorData = await res.json();
          if (errorData.error || errorData.message) {
            errorMessage = errorData.error || errorData.message;
          }
        } catch {
          // JSON parsing failed, use default message
        }
        throw new Error(errorMessage);
      }
      return await res.json();
    },
    onSuccess: (user: AuthUser) => {
      queryClient.setQueryData(["/api/user"], user);
      syncToPostHog(user);
      captureEvent("user_logged_in", { method: "password" });
      toast({
        title: "Login successful",
        description: `Welcome back, ${user.username}!`,
      });
    },
    // Note: Error handling is done inline in the auth page for better UX
  });

  const registerMutation = useMutation({
    mutationFn: async (userData: RegisterData) => {
      // Read CSRF token from cookie
      const csrfToken = document.cookie.match(/(?:^|; )csrf-token=([^;]*)/)?.[1];
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (csrfToken) headers["X-CSRF-Token"] = decodeURIComponent(csrfToken);

      // Attach UTM attribution data so we know which channel converted
      const utmParams = getUtmParams();
      const bodyWithUtm = { ...userData, ...(Object.keys(utmParams).length > 0 ? { attribution: utmParams } : {}) };

      const res = await fetch("/api/register", {
        method: "POST",
        headers,
        body: JSON.stringify(bodyWithUtm),
        credentials: "include",
      });

      if (!res.ok) {
        try {
          const errorData = await res.json();
          // Handle specific error messages from the backend
          if (errorData.error) {
            if (errorData.error.toLowerCase().includes("email already") ||
                errorData.error.toLowerCase().includes("email in use")) {
              throw new Error("This email is already registered. Please use a different email or try logging in.");
            }
            if (errorData.error.toLowerCase().includes("username already")) {
              throw new Error("This username is already taken. Please choose a different username.");
            }
            throw new Error(errorData.error);
          }
        } catch (parseError) {
          // If JSON parsing fails, provide a generic error
          if (parseError instanceof Error && parseError.message !== "Registration failed") {
            throw parseError;
          }
        }
        throw new Error("Registration failed. Please try again.");
      }
      return await res.json();
    },
    onSuccess: (user: AuthUser) => {
      queryClient.setQueryData(["/api/user"], user);
      syncToPostHog(user);
      // Capture the signup event with attribution properties so we can
      // build channel-level conversion funnels in PostHog.
      const utmParams = getUtmParams();
      captureEvent("user_signed_up", {
        ...utmParams,
        has_attribution: Object.keys(utmParams).length > 0,
      });
      clearUtmParams(); // Attribution captured — clear so it doesn't re-send
      toast({
        title: "Registration successful",
        description: `Welcome, ${user.username}!`,
      });
    },
    // Note: Error handling is done inline in the auth page for better UX
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      // Best-effort: unregister the native push token BEFORE clearing the
      // session so the unregister request still authenticates. No-op on web.
      try {
        const mod = await import('../lib/capacitor-push');
        await mod.unregisterPushNotifications();
      } catch {
        // Push unregister is best-effort. Never block logout on it.
      }

      try {
        // Read CSRF token from cookie
        const csrfToken = document.cookie.match(/(?:^|; )csrf-token=([^;]*)/)?.[1];
        const headers: Record<string, string> = {};
        if (csrfToken) headers["X-CSRF-Token"] = decodeURIComponent(csrfToken);

        const res = await fetch("/api/logout", {
          method: "POST",
          headers,
          credentials: "include",
        });
        if (!res.ok) {
          throw new Error("Logout failed");
        }
      } catch (error) {
        // Even if there's a network error, we should still clear local state
        console.error("Logout request error:", error);
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/user"], null);
      queryClient.clear(); // Clear all cached data on logout
      captureEvent("user_logged_out");
      resetPostHog(); // Start a fresh anonymous session so next login isn't merged
      toast({
        title: "Logged out",
        description: "You have been successfully logged out.",
      });
      // Redirect to landing page
      window.location.href = "/";
    },
    onError: (error: Error) => {
      // Even on error, clear local auth state and redirect
      queryClient.setQueryData(["/api/user"], null);
      queryClient.clear();
      resetPostHog();
      toast({
        title: "Logged out",
        description: "You have been logged out.",
      });
      window.location.href = "/";
    },
  });

  return (
    <AuthContext.Provider
      value={{
        user: user ?? null,
        isLoading,
        error,
        loginMutation,
        logoutMutation,
        registerMutation,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}