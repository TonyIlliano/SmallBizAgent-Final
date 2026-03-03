import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Shield,
  ShieldCheck,
  ShieldOff,
  Copy,
  Download,
  Key,
  Loader2,
} from "lucide-react";

type SetupState = "idle" | "setup" | "backup" | "enabled";

export default function TwoFactorSetup() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const initialState: SetupState = user?.twoFactorEnabled ? "enabled" : "idle";
  const [state, setState] = useState<SetupState>(initialState);
  const [qrCode, setQrCode] = useState<string>("");
  const [manualKey, setManualKey] = useState<string>("");
  const [verificationCode, setVerificationCode] = useState<string>("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);

  // Disable 2FA dialog state
  const [showDisableForm, setShowDisableForm] = useState(false);
  const [disablePassword, setDisablePassword] = useState("");
  const [disableToken, setDisableToken] = useState("");

  // Step 1: Initiate 2FA setup
  const setupMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/2fa/setup");
      return await res.json();
    },
    onSuccess: (data: { qrCode: string; secret: string; otpauthUrl: string }) => {
      setQrCode(data.qrCode);
      setManualKey(data.secret);
      setState("setup");
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to start 2FA setup",
        variant: "destructive",
      });
    },
  });

  // Step 2: Verify TOTP code and enable 2FA
  const verifyMutation = useMutation({
    mutationFn: async (token: string) => {
      const res = await apiRequest("POST", "/api/2fa/verify-setup", { token });
      return await res.json();
    },
    onSuccess: (data: { success: boolean; backupCodes: string[] }) => {
      setBackupCodes(data.backupCodes);
      setState("backup");
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      toast({
        title: "2FA Enabled",
        description: "Two-factor authentication has been enabled. Save your backup codes!",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Verification Failed",
        description: error.message || "Invalid verification code. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Step 3: Disable 2FA
  const disableMutation = useMutation({
    mutationFn: async (data: { password: string; token: string }) => {
      const res = await apiRequest("POST", "/api/2fa/disable", data);
      return await res.json();
    },
    onSuccess: () => {
      setState("idle");
      setShowDisableForm(false);
      setDisablePassword("");
      setDisableToken("");
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      toast({
        title: "2FA Disabled",
        description: "Two-factor authentication has been disabled.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to disable 2FA",
        variant: "destructive",
      });
    },
  });

  const handleVerify = () => {
    if (verificationCode.length !== 6) {
      toast({
        title: "Invalid Code",
        description: "Please enter a 6-digit verification code.",
        variant: "destructive",
      });
      return;
    }
    verifyMutation.mutate(verificationCode);
  };

  const handleDisable = () => {
    if (!disablePassword || !disableToken) {
      toast({
        title: "Missing Fields",
        description: "Please enter both your password and a TOTP code.",
        variant: "destructive",
      });
      return;
    }
    disableMutation.mutate({ password: disablePassword, token: disableToken });
  };

  const copyBackupCodes = () => {
    navigator.clipboard.writeText(backupCodes.join("\n"));
    toast({
      title: "Copied",
      description: "Backup codes copied to clipboard.",
    });
  };

  const downloadBackupCodes = () => {
    const content = `SmallBizAgent 2FA Backup Codes\n${"=".repeat(40)}\n\nSave these codes in a safe place. Each code can only be used once.\n\n${backupCodes.map((code, i) => `${i + 1}. ${code}`).join("\n")}\n\nGenerated: ${new Date().toISOString()}\n`;
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "smallbizagent-backup-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  // Idle state: 2FA not enabled
  if (state === "idle") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Two-Factor Authentication
          </CardTitle>
          <CardDescription>
            Add an extra layer of security to your account. When enabled, you will
            need to enter a code from your authenticator app in addition to your
            password when signing in.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={() => setupMutation.mutate()}
            disabled={setupMutation.isPending}
          >
            {setupMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Setting up...
              </>
            ) : (
              <>
                <Key className="mr-2 h-4 w-4" />
                Enable Two-Factor Authentication
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Setup state: Show QR code and verification input
  if (state === "setup") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Set Up Two-Factor Authentication
          </CardTitle>
          <CardDescription>
            Scan the QR code with your authenticator app (Google Authenticator,
            Authy, 1Password, etc.) then enter the 6-digit code below.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* QR Code */}
          <div className="flex justify-center">
            {qrCode && (
              <img
                src={qrCode}
                alt="2FA QR Code"
                className="w-48 h-48 rounded-lg border"
              />
            )}
          </div>

          {/* Manual key */}
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">
              Can't scan? Enter this key manually:
            </Label>
            <div className="flex items-center gap-2">
              <code className="flex-1 p-2 bg-muted rounded text-sm font-mono break-all">
                {manualKey}
              </code>
              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  navigator.clipboard.writeText(manualKey);
                  toast({ title: "Copied", description: "Secret key copied to clipboard." });
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Verification code input */}
          <div className="space-y-2">
            <Label htmlFor="verification-code">Verification Code</Label>
            <div className="flex items-center gap-2">
              <Input
                id="verification-code"
                placeholder="Enter 6-digit code"
                value={verificationCode}
                onChange={(e) =>
                  setVerificationCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                maxLength={6}
                className="font-mono text-center text-lg tracking-widest"
              />
              <Button
                onClick={handleVerify}
                disabled={verifyMutation.isPending || verificationCode.length !== 6}
              >
                {verifyMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Verify"
                )}
              </Button>
            </div>
          </div>

          <Button
            variant="ghost"
            onClick={() => {
              setState("idle");
              setQrCode("");
              setManualKey("");
              setVerificationCode("");
            }}
          >
            Cancel
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Backup codes state: Show backup codes after successful verification
  if (state === "backup") {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-green-500" />
            Save Your Backup Codes
          </CardTitle>
          <CardDescription>
            These backup codes can be used to access your account if you lose your
            authenticator device. Each code can only be used once. Store them
            somewhere safe.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-2 p-4 bg-muted rounded-lg">
            {backupCodes.map((code, index) => (
              <code key={index} className="text-sm font-mono p-1">
                {index + 1}. {code}
              </code>
            ))}
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={copyBackupCodes}>
              <Copy className="mr-2 h-4 w-4" />
              Copy Codes
            </Button>
            <Button variant="outline" onClick={downloadBackupCodes}>
              <Download className="mr-2 h-4 w-4" />
              Download
            </Button>
          </div>

          <Button onClick={() => setState("enabled")} className="w-full">
            I've saved my backup codes
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Enabled state: 2FA is active
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-green-500" />
          Two-Factor Authentication
        </CardTitle>
        <CardDescription>
          Two-factor authentication is enabled. Your account is protected with an
          additional layer of security.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3 p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
          <ShieldCheck className="h-6 w-6 text-green-500" />
          <div>
            <p className="font-medium text-green-700 dark:text-green-400">
              2FA is enabled
            </p>
            <p className="text-sm text-muted-foreground">
              You will be asked for a verification code when signing in.
            </p>
          </div>
        </div>

        {!showDisableForm ? (
          <Button
            variant="destructive"
            onClick={() => setShowDisableForm(true)}
          >
            <ShieldOff className="mr-2 h-4 w-4" />
            Disable 2FA
          </Button>
        ) : (
          <div className="space-y-4 p-4 border rounded-lg">
            <p className="text-sm font-medium">
              To disable 2FA, enter your password and a current TOTP code:
            </p>
            <div className="space-y-2">
              <Label htmlFor="disable-password">Password</Label>
              <Input
                id="disable-password"
                type="password"
                value={disablePassword}
                onChange={(e) => setDisablePassword(e.target.value)}
                placeholder="Enter your password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="disable-token">TOTP Code</Label>
              <Input
                id="disable-token"
                value={disableToken}
                onChange={(e) =>
                  setDisableToken(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                maxLength={6}
                placeholder="Enter 6-digit code"
                className="font-mono"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="destructive"
                onClick={handleDisable}
                disabled={disableMutation.isPending}
              >
                {disableMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Disabling...
                  </>
                ) : (
                  "Confirm Disable"
                )}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setShowDisableForm(false);
                  setDisablePassword("");
                  setDisableToken("");
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
