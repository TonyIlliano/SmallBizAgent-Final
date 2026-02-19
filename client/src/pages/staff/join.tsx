import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, Check, AlertCircle, Eye, EyeOff } from "lucide-react";

export default function StaffJoin() {
  const [, params] = useRoute("/staff/join/:code");
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const code = params?.code || "";

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Validate the invite code
  const { data: inviteInfo, isLoading, error } = useQuery({
    queryKey: ["/api/staff-invite", code],
    queryFn: async () => {
      const res = await fetch(`/api/staff-invite/${code}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || "Invalid invite");
      }
      return res.json();
    },
    enabled: !!code,
    retry: false,
  });

  // Set email from invite data
  useEffect(() => {
    if (inviteInfo?.email) {
      setEmail(inviteInfo.email);
    }
  }, [inviteInfo]);

  // Accept invite mutation
  const acceptInviteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/staff-invite/${code}/accept`, {
        username,
        email,
        password,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Account Created!",
        description: "Welcome to your staff portal. Redirecting...",
      });
      // Give toast time to show, then redirect
      setTimeout(() => {
        window.location.href = "/staff/dashboard";
      }, 1500);
    },
    onError: (err: Error) => {
      toast({
        title: "Error",
        description: err.message || "Failed to create account",
        variant: "destructive",
      });
    },
  });

  const passwordChecks = {
    length: password.length >= 12,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password),
    match: password === confirmPassword && password.length > 0,
  };

  const allValid =
    username.length >= 3 &&
    email.includes("@") &&
    Object.values(passwordChecks).every(Boolean);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (allValid) {
      acceptInviteMutation.mutate();
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (error || !inviteInfo?.valid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <AlertCircle className="h-12 w-12 mx-auto mb-2 text-destructive" />
            <CardTitle>Invalid Invite</CardTitle>
            <CardDescription>
              {(error as Error)?.message || "This invite link is invalid, expired, or has already been used."}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button variant="outline" onClick={() => setLocation("/auth")}>
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Join {inviteInfo.businessName}</CardTitle>
          <CardDescription>
            You've been invited to join as <strong>{inviteInfo.staffName}</strong>. Create your account to access your staff portal.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Username</Label>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
                placeholder="Choose a username"
                autoComplete="username"
              />
            </div>

            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                autoComplete="email"
              />
            </div>

            <div className="space-y-2">
              <Label>Password</Label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Create a password"
                  autoComplete="new-password"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1 h-7 w-7 p-0"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Confirm Password</Label>
              <Input
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm your password"
                autoComplete="new-password"
              />
            </div>

            {/* Password requirements */}
            {password.length > 0 && (
              <div className="text-xs space-y-1 p-3 bg-muted rounded-lg">
                {[
                  { check: passwordChecks.length, label: "At least 12 characters" },
                  { check: passwordChecks.uppercase, label: "One uppercase letter" },
                  { check: passwordChecks.lowercase, label: "One lowercase letter" },
                  { check: passwordChecks.number, label: "One number" },
                  { check: passwordChecks.special, label: "One special character" },
                  { check: passwordChecks.match, label: "Passwords match" },
                ].map(({ check, label }) => (
                  <div
                    key={label}
                    className={`flex items-center gap-2 ${check ? "text-green-600" : "text-muted-foreground"}`}
                  >
                    {check ? <Check className="h-3 w-3" /> : <span className="h-3 w-3 rounded-full border inline-block" />}
                    {label}
                  </div>
                ))}
              </div>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={!allValid || acceptInviteMutation.isPending}
            >
              {acceptInviteMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating Account...
                </>
              ) : (
                "Create Account & Join"
              )}
            </Button>
          </form>

          <div className="mt-4 text-center text-sm text-muted-foreground">
            Already have an account?{" "}
            <a href="/auth" className="text-primary underline">
              Log in
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
