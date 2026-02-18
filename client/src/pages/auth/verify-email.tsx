import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Redirect, useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Loader2, Mail, AlertCircle, CheckCircle2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export default function VerifyEmailPage() {
  const { user, isLoading } = useAuth();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Cooldown timer for resend button
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  // Auto-submit when 6 digits entered
  useEffect(() => {
    if (code.length === 6) {
      handleVerify(code);
    }
  }, [code]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Not logged in — go to auth page
  if (!user) {
    return <Redirect to="/auth" />;
  }

  // Already verified — go to onboarding or dashboard
  if (user.emailVerified) {
    return <Redirect to={user.businessId ? "/" : "/onboarding/subscription"} />;
  }

  async function handleVerify(verificationCode: string) {
    setError(null);
    setVerifying(true);

    try {
      const res = await fetch("/api/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user!.email, code: verificationCode }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Verification failed");
        setCode("");
        setVerifying(false);
        return;
      }

      setVerified(true);
      // Refresh user data so emailVerified is true BEFORE redirecting
      await queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      await queryClient.refetchQueries({ queryKey: ["/api/user"] });

      // Redirect after a brief success message using router navigation
      setTimeout(() => {
        navigate("/onboarding/subscription");
      }, 1500);
    } catch (err) {
      setError("Something went wrong. Please try again.");
      setCode("");
      setVerifying(false);
    }
  }

  async function handleResend() {
    setError(null);
    setResending(true);

    try {
      const res = await fetch("/api/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user!.email }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to resend code");
      } else {
        setResendCooldown(60);
      }
    } catch (err) {
      setError("Failed to resend code. Please try again.");
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
            {verified ? (
              <CheckCircle2 className="h-6 w-6 text-green-500" />
            ) : (
              <Mail className="h-6 w-6 text-primary" />
            )}
          </div>
          <CardTitle className="text-2xl">
            {verified ? "Email Verified!" : "Check your email"}
          </CardTitle>
          <CardDescription>
            {verified
              ? "Redirecting you to setup..."
              : `We sent a 6-digit code to ${user.email}`}
          </CardDescription>
        </CardHeader>

        {!verified && (
          <CardContent className="space-y-6">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="flex justify-center">
              <InputOTP
                maxLength={6}
                value={code}
                onChange={setCode}
                disabled={verifying}
              >
                <InputOTPGroup>
                  <InputOTPSlot index={0} className="h-12 w-12 text-lg" />
                  <InputOTPSlot index={1} className="h-12 w-12 text-lg" />
                  <InputOTPSlot index={2} className="h-12 w-12 text-lg" />
                  <InputOTPSlot index={3} className="h-12 w-12 text-lg" />
                  <InputOTPSlot index={4} className="h-12 w-12 text-lg" />
                  <InputOTPSlot index={5} className="h-12 w-12 text-lg" />
                </InputOTPGroup>
              </InputOTP>
            </div>

            {verifying && (
              <div className="flex items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Verifying...</span>
              </div>
            )}

            <div className="text-center">
              <p className="text-sm text-muted-foreground mb-2">
                Didn't receive the code?
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleResend}
                disabled={resending || resendCooldown > 0}
              >
                {resending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Sending...
                  </>
                ) : resendCooldown > 0 ? (
                  `Resend code (${resendCooldown}s)`
                ) : (
                  "Resend code"
                )}
              </Button>
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
