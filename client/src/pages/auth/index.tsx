import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Redirect } from "wouter";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

const loginFormSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

// Password must match server-side requirements
const passwordSchema = z.string()
  .min(12, "Password must be at least 12 characters")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/[a-z]/, "Password must contain at least one lowercase letter")
  .regex(/[0-9]/, "Password must contain at least one number")
  .regex(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/, "Password must contain at least one special character");

const registerFormSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters"),
  email: z.string().email("Please enter a valid email address"),
  password: passwordSchema,
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type LoginFormValues = z.infer<typeof loginFormSchema>;
type RegisterFormValues = z.infer<typeof registerFormSchema>;

const forgotPasswordSchema = z.object({
  email: z.string().email("Please enter a valid email address"),
});

type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;

export default function AuthPage() {
  const [activeTab, setActiveTab] = useState<string>("login");
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);
  const [forgotPasswordSent, setForgotPasswordSent] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const { user, loginMutation, registerMutation } = useAuth();
  const { toast } = useToast();

  const loginForm = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  const registerForm = useForm<RegisterFormValues>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: {
      username: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  const forgotPasswordForm = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: "",
    },
  });

  // Redirect if user is already logged in - moved after hook declarations
  if (user) {
    return <Redirect to="/" />;
  }

  const onLoginSubmit = (values: LoginFormValues) => {
    setLoginError(null);
    loginMutation.mutate(values, {
      onError: (error: Error) => {
        // Show user-friendly error message
        if (error.message.includes("Invalid") || error.message.includes("401")) {
          setLoginError("Invalid username or password. Please try again.");
        } else {
          setLoginError(error.message);
        }
      },
    });
  };

  const onRegisterSubmit = (values: RegisterFormValues) => {
    setRegisterError(null);
    const { confirmPassword, ...userData } = values;
    registerMutation.mutate(userData, {
      onSuccess: () => {
        // Redirect to email verification page after successful registration
        window.location.href = '/verify-email';
      },
      onError: (error: Error) => {
        // Display the error message from the hook (already user-friendly)
        setRegisterError(error.message);
      },
    });
  };

  const onForgotPasswordSubmit = async (values: ForgotPasswordValues) => {
    try {
      const res = await fetch("/api/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: values.email }),
      });

      // Always show success to prevent email enumeration
      setForgotPasswordSent(true);
      toast({
        title: "Reset link sent",
        description: `If an account exists for ${values.email}, you'll receive a password reset link.`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to send reset link. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="min-h-screen grid md:grid-cols-2 bg-black">
      {/* Hero section - matches landing page dark theme */}
      <div className="hidden md:flex flex-col justify-center px-12 bg-gradient-to-br from-neutral-900 to-black border-r border-neutral-800">
        <div className="space-y-8 max-w-md">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-white flex items-center justify-center">
              <svg viewBox="0 0 100 100" fill="currentColor" className="h-7 w-7 text-black">
                <rect x="47" y="5" width="6" height="10" rx="3" />
                <circle cx="50" cy="5" r="4" />
                <rect x="25" y="18" width="50" height="40" rx="12" />
                <rect x="30" y="28" width="40" height="15" rx="7" fill="black" />
                <circle cx="40" cy="35" r="5" fill="white" />
                <circle cx="60" cy="35" r="5" fill="white" />
                <path d="M 38 48 Q 50 55 62 48" stroke="black" strokeWidth="3" fill="none" strokeLinecap="round" />
                <path d="M 32 58 L 32 75 Q 32 82 39 82 L 61 82 Q 68 82 68 75 L 68 58" />
                <ellipse cx="20" cy="65" rx="8" ry="12" />
                <ellipse cx="80" cy="65" rx="8" ry="12" />
              </svg>
            </div>
            <span className="text-xl font-bold text-white tracking-wide">SMALLBIZ AGENT</span>
          </div>

          <div>
            <h1 className="text-4xl font-bold text-white mb-4">
              Your Business,
              <br />
              <span className="bg-gradient-to-r from-white via-neutral-300 to-neutral-500 bg-clip-text text-transparent">
                On Autopilot
              </span>
            </h1>
            <p className="text-lg text-neutral-400">
              The all-in-one platform that handles your calls, books appointments, and manages customers.
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-3 text-neutral-300">
              <div className="h-5 w-5 rounded-full bg-green-500/20 flex items-center justify-center">
                <svg className="h-3 w-3 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p>AI receptionist answers 24/7</p>
            </div>
            <div className="flex items-center gap-3 text-neutral-300">
              <div className="h-5 w-5 rounded-full bg-green-500/20 flex items-center justify-center">
                <svg className="h-3 w-3 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p>Smart appointment scheduling</p>
            </div>
            <div className="flex items-center gap-3 text-neutral-300">
              <div className="h-5 w-5 rounded-full bg-green-500/20 flex items-center justify-center">
                <svg className="h-3 w-3 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p>Professional invoicing & payments</p>
            </div>
            <div className="flex items-center gap-3 text-neutral-300">
              <div className="h-5 w-5 rounded-full bg-green-500/20 flex items-center justify-center">
                <svg className="h-3 w-3 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p>Customer management CRM</p>
            </div>
          </div>

          <div className="pt-4 border-t border-neutral-800">
            <p className="text-sm text-neutral-500">
              Trusted by 10,000+ small businesses
            </p>
          </div>
        </div>
      </div>

      {/* Auth forms */}
      <div className="flex items-center justify-center p-8 bg-neutral-950">
        <Card className="w-full max-w-md bg-neutral-900 border-neutral-800">
          <CardHeader>
            <div className="md:hidden flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-xl bg-white flex items-center justify-center">
                <svg viewBox="0 0 100 100" fill="currentColor" className="h-7 w-7 text-black">
                  <rect x="47" y="5" width="6" height="10" rx="3" />
                  <circle cx="50" cy="5" r="4" />
                  <rect x="25" y="18" width="50" height="40" rx="12" />
                  <rect x="30" y="28" width="40" height="15" rx="7" fill="black" />
                  <circle cx="40" cy="35" r="5" fill="white" />
                  <circle cx="60" cy="35" r="5" fill="white" />
                </svg>
              </div>
              <span className="text-xl font-bold text-white tracking-wide">SMALLBIZ AGENT</span>
            </div>
            <CardTitle className="text-white">Welcome back</CardTitle>
            <CardDescription className="text-neutral-400">
              Sign in to your account or create a new one
            </CardDescription>
            
            <Tabs defaultValue="login" value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Login</TabsTrigger>
                <TabsTrigger value="register">Register</TabsTrigger>
              </TabsList>

              <TabsContent value="login" className="mt-4">
                <Form {...loginForm}>
                  <form onSubmit={loginForm.handleSubmit(onLoginSubmit)} className="space-y-4">
                    {loginError && (
                      <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>{loginError}</AlertDescription>
                      </Alert>
                    )}
                    <FormField
                      control={loginForm.control}
                      name="username"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Username</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="yourname"
                              {...field}
                              onChange={(e) => {
                                setLoginError(null);
                                field.onChange(e);
                              }}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={loginForm.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <div className="flex items-center justify-between">
                            <FormLabel>Password</FormLabel>
                            <Button
                              type="button"
                              variant="link"
                              className="p-0 h-auto text-xs text-muted-foreground"
                              onClick={() => setForgotPasswordOpen(true)}
                            >
                              Forgot password?
                            </Button>
                          </div>
                          <FormControl>
                            <Input
                              type="password"
                              placeholder="••••••••"
                              {...field}
                              onChange={(e) => {
                                setLoginError(null);
                                field.onChange(e);
                              }}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button type="submit" className="w-full" disabled={loginMutation.isPending}>
                      {loginMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Logging in...
                        </>
                      ) : (
                        "Login"
                      )}
                    </Button>
                  </form>
                </Form>
                <div className="mt-4 text-center text-sm">
                  <span className="text-muted-foreground">Don't have an account? </span>
                  <Button variant="link" className="p-0" onClick={() => setActiveTab("register")}>
                    Register
                  </Button>
                </div>
              </TabsContent>

              <TabsContent value="register" className="mt-4">
                <Form {...registerForm}>
                  <form onSubmit={registerForm.handleSubmit(onRegisterSubmit)} className="space-y-4">
                    {registerError && (
                      <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>{registerError}</AlertDescription>
                      </Alert>
                    )}
                    <FormField
                      control={registerForm.control}
                      name="username"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Username</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="yourname"
                              {...field}
                              onChange={(e) => {
                                setRegisterError(null);
                                field.onChange(e);
                              }}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={registerForm.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Email</FormLabel>
                          <FormControl>
                            <Input
                              type="email"
                              placeholder="you@example.com"
                              {...field}
                              onChange={(e) => {
                                setRegisterError(null);
                                field.onChange(e);
                              }}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={registerForm.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Password</FormLabel>
                          <FormControl>
                            <Input type="password" placeholder="••••••••" {...field} />
                          </FormControl>
                          <p className="text-xs text-muted-foreground mt-1">
                            Must be 12+ characters with uppercase, lowercase, number, and special character
                          </p>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={registerForm.control}
                      name="confirmPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Confirm Password</FormLabel>
                          <FormControl>
                            <Input type="password" placeholder="••••••••" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button type="submit" className="w-full" disabled={registerMutation.isPending}>
                      {registerMutation.isPending ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Registering...
                        </>
                      ) : (
                        "Register"
                      )}
                    </Button>
                  </form>
                </Form>
                <div className="mt-4 text-center text-sm">
                  <span className="text-muted-foreground">Already have an account? </span>
                  <Button variant="link" className="p-0" onClick={() => setActiveTab("login")}>
                    Login
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </CardHeader>
          <CardFooter className="flex justify-center border-t pt-6">
            <p className="text-xs text-muted-foreground">
              By continuing, you agree to the terms of service and privacy policy.
            </p>
          </CardFooter>
        </Card>
      </div>

      {/* Forgot Password Dialog */}
      <Dialog open={forgotPasswordOpen} onOpenChange={(open) => {
        setForgotPasswordOpen(open);
        if (!open) {
          setForgotPasswordSent(false);
          forgotPasswordForm.reset();
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reset your password</DialogTitle>
            <DialogDescription>
              Enter your email address and we'll send you a link to reset your password.
            </DialogDescription>
          </DialogHeader>
          {forgotPasswordSent ? (
            <div className="py-6 text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-sm text-muted-foreground">
                If an account exists for that email, you'll receive a password reset link shortly.
              </p>
              <Button
                className="mt-4"
                onClick={() => {
                  setForgotPasswordOpen(false);
                  setForgotPasswordSent(false);
                  forgotPasswordForm.reset();
                }}
              >
                Back to login
              </Button>
            </div>
          ) : (
            <Form {...forgotPasswordForm}>
              <form onSubmit={forgotPasswordForm.handleSubmit(onForgotPasswordSubmit)} className="space-y-4">
                <FormField
                  control={forgotPasswordForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="you@example.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <DialogFooter className="gap-2 sm:gap-0">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setForgotPasswordOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit">
                    Send reset link
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}