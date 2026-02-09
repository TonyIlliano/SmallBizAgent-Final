import { createContext, ReactNode, useContext } from "react";
import {
  useQuery,
  useMutation,
  UseMutationResult,
} from "@tanstack/react-query";
import { User } from "@shared/schema";
import { queryClient } from "../lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type AuthContextType = {
  user: User | null;
  isLoading: boolean;
  error: Error | null;
  loginMutation: UseMutationResult<User, Error, LoginData>;
  logoutMutation: UseMutationResult<void, Error, void>;
  registerMutation: UseMutationResult<User, Error, RegisterData>;
};

type LoginData = {
  username: string;
  password: string;
};

type RegisterData = {
  username: string;
  email: string;
  password: string;
  role?: string;
  businessId?: number;
  active?: boolean;
};

export const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const {
    data: user,
    error,
    isLoading,
  } = useQuery<User | null, Error>({
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

  const loginMutation = useMutation({
    mutationFn: async (credentials: LoginData) => {
      // Don't use apiRequest here because it throws on non-OK responses
      // and we need to parse the error response ourselves
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
        credentials: "include",
      });

      if (!res.ok) {
        try {
          const error = await res.json();
          throw new Error(error.error || "Login failed");
        } catch {
          throw new Error("Login failed");
        }
      }
      return await res.json();
    },
    onSuccess: (user: User) => {
      queryClient.setQueryData(["/api/user"], user);
      toast({
        title: "Login successful",
        description: `Welcome back, ${user.username}!`,
      });
    },
    // Note: Error handling is done inline in the auth page for better UX
  });

  const registerMutation = useMutation({
    mutationFn: async (userData: RegisterData) => {
      // Don't use apiRequest here because it throws on non-OK responses
      // and we need to parse the error response ourselves
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(userData),
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
    onSuccess: (user: User) => {
      queryClient.setQueryData(["/api/user"], user);
      toast({
        title: "Registration successful",
        description: `Welcome, ${user.username}!`,
      });
    },
    // Note: Error handling is done inline in the auth page for better UX
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      try {
        const res = await fetch("/api/logout", {
          method: "POST",
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