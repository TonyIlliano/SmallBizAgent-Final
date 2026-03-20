import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { PageLayout } from "@/components/layout/PageLayout";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Globe,
  Search,
  Copy,
  RefreshCw,
  CheckCircle,
  XCircle,
  Lock,
  ExternalLink,
  Loader2,
  ArrowUpCircle,
  Settings,
  Sparkles,
} from "lucide-react";
import { useLocation } from "wouter";

interface DomainInfo {
  subdomain: string | null;
  customDomain: string | null;
  domainVerified: boolean;
  domainTier: string;
  websiteSetupRequested: boolean;
  hasHtml: boolean;
  features: {
    websiteEnabled: boolean;
    customDomainEnabled: boolean;
    websiteManagedSetup: boolean;
  };
  planTier: string | null;
}

export default function WebsiteBuilder() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  // Scanner inputs
  const [scanUrl, setScanUrl] = useState("");
  const [scanName, setScanName] = useState("");
  const [scanCity, setScanCity] = useState("");

  // Custom domain input
  const [customDomainInput, setCustomDomainInput] = useState("");

  // ── Queries ──

  const { data: domainInfo, isLoading: domainLoading } = useQuery<DomainInfo>({
    queryKey: ["/api/website-builder/domain"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/website-builder/domain");
      return res.json();
    },
  });

  const { data: website } = useQuery({
    queryKey: ["/api/website-builder/site"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/website-builder/site");
      return res.json();
    },
  });

  const { data: stitchStatus } = useQuery<{ available: boolean }>({
    queryKey: ["/api/website-builder/stitch-status"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/website-builder/stitch-status");
      return res.json();
    },
  });

  // ── Mutations ──

  const scanMutation = useMutation({
    mutationFn: async (body: Record<string, string>) => {
      const res = await apiRequest("POST", "/api/website-builder/scan", body);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/website-builder/site"] });
      toast({ title: "Scan complete", description: "Stitch prompt generated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Scan failed", description: error.message, variant: "destructive" });
    },
  });

  const generateMutation = useMutation({
    mutationFn: async (prompt?: string) => {
      const res = await apiRequest("POST", "/api/website-builder/generate", prompt ? { prompt } : {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/website-builder/site"] });
      queryClient.invalidateQueries({ queryKey: ["/api/website-builder/domain"] });
      toast({ title: "Website generated", description: "Your site has been created and is now live" });
    },
    onError: (error: Error) => {
      toast({ title: "Generation failed", description: error.message, variant: "destructive" });
    },
  });

  const setDomainMutation = useMutation({
    mutationFn: async (domain: string) => {
      const res = await apiRequest("POST", "/api/website-builder/set-custom-domain", { domain });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/website-builder/domain"] });
      toast({ title: "Domain saved", description: data.message });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const verifyMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/website-builder/verify-domain");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/website-builder/domain"] });
      if (data.verified) {
        toast({ title: "Verified", description: "Domain verified successfully" });
      } else {
        toast({ title: "Not verified", description: data.message, variant: "destructive" });
      }
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const requestSetupMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/website-builder/request-setup");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/website-builder/domain"] });
      toast({ title: "Setup requested", description: data.message });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  // ── Handlers ──

  const handleScan = () => {
    if (scanUrl.trim()) {
      scanMutation.mutate({ url: scanUrl.trim() });
    } else if (scanName.trim() && scanCity.trim()) {
      scanMutation.mutate({ business_name: scanName.trim(), city: scanCity.trim() });
    } else {
      toast({ title: "Missing input", description: "Enter a URL or business name + city", variant: "destructive" });
    }
  };

  const handleCopyPrompt = () => {
    const prompt = scanMutation.data?.stitch_prompt || website?.stitchPrompt;
    if (prompt) {
      navigator.clipboard.writeText(prompt);
      toast({ title: "Copied", description: "Stitch prompt copied to clipboard" });
    }
  };

  const handleGenerate = () => {
    const prompt = scanMutation.data?.stitch_prompt || website?.stitchPrompt;
    generateMutation.mutate(prompt || undefined);
  };

  if (domainLoading) {
    return (
      <PageLayout title="Website Builder">
        <div className="flex items-center justify-center min-h-[40vh]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </PageLayout>
    );
  }

  const features = domainInfo?.features;
  const hasPrompt = !!(scanMutation.data?.stitch_prompt || website?.stitchPrompt);
  const stitchAvailable = stitchStatus?.available ?? false;

  return (
    <PageLayout title="Website Builder">
      <div className="space-y-6 max-w-4xl">

        {/* Elite managed setup banner */}
        {domainInfo?.websiteSetupRequested && (
          <Alert>
            <Settings className="h-4 w-4" />
            <AlertDescription>
              Your website setup is in progress. Our team will have it ready within 24 hours.
            </AlertDescription>
          </Alert>
        )}

        {/* ── Domain Display ── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5" />
              Your Domain
            </CardTitle>
            <CardDescription>
              Your website address and domain settings
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Subdomain */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Subdomain</p>
                <p className="text-sm text-muted-foreground">
                  {domainInfo?.subdomain
                    ? `${domainInfo.subdomain}.smallbizagent.ai`
                    : "Not set — will be generated from your business name"}
                </p>
              </div>
              <Badge variant="secondary">
                {domainInfo?.domainTier === "custom" ? "Custom" : "Free"}
              </Badge>
            </div>

            <Separator />

            {/* Custom Domain */}
            {features?.customDomainEnabled ? (
              <div className="space-y-3">
                <p className="text-sm font-medium">Custom Domain</p>
                {domainInfo?.customDomain ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{domainInfo.customDomain}</span>
                      {domainInfo.domainVerified ? (
                        <Badge variant="default" className="gap-1">
                          <CheckCircle className="h-3 w-3" /> Verified
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="gap-1">
                          <XCircle className="h-3 w-3" /> Not verified
                        </Badge>
                      )}
                    </div>
                    {!domainInfo.domainVerified && (
                      <>
                        <div className="bg-muted/50 rounded-md p-3 text-xs font-mono space-y-1">
                          <p>Type: CNAME</p>
                          <p>Name: www (or @)</p>
                          <p>Value: {domainInfo.subdomain}.smallbizagent.ai</p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => verifyMutation.mutate()}
                          disabled={verifyMutation.isPending}
                        >
                          {verifyMutation.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-1" />
                          ) : (
                            <RefreshCw className="h-4 w-4 mr-1" />
                          )}
                          Verify DNS
                        </Button>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Input
                      placeholder="yourdomain.com"
                      value={customDomainInput}
                      onChange={(e) => setCustomDomainInput(e.target.value)}
                    />
                    <Button
                      onClick={() => setDomainMutation.mutate(customDomainInput)}
                      disabled={!customDomainInput.trim() || setDomainMutation.isPending}
                    >
                      {setDomainMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        "Connect"
                      )}
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Lock className="h-4 w-4" />
                  <span>Upgrade to Professional to connect your own domain</span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => navigate("/settings?tab=subscription")}
                  className="gap-1"
                >
                  <ArrowUpCircle className="h-4 w-4" />
                  Upgrade
                </Button>
              </div>
            )}

            {/* Elite managed setup */}
            {features?.websiteManagedSetup && !domainInfo?.websiteSetupRequested && (
              <>
                <Separator />
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Managed Setup</p>
                    <p className="text-xs text-muted-foreground">
                      Our team will build and deploy your site for you
                    </p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => requestSetupMutation.mutate()}
                    disabled={requestSetupMutation.isPending}
                  >
                    {requestSetupMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    ) : null}
                    Request Setup
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* ── Scanner ── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Business Scanner
            </CardTitle>
            <CardDescription>
              Scan a business listing or website to auto-generate your one-page site
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* URL scan */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Scan by URL</label>
              <div className="flex gap-2">
                <Input
                  placeholder="https://www.google.com/maps/place/..."
                  value={scanUrl}
                  onChange={(e) => setScanUrl(e.target.value)}
                />
              </div>
            </div>

            <div className="text-center text-sm text-muted-foreground">— or —</div>

            {/* Name + city scan */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-sm font-medium">Business Name</label>
                <Input
                  placeholder="Canton Barb Shop"
                  value={scanName}
                  onChange={(e) => setScanName(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">City</label>
                <Input
                  placeholder="Canton, OH"
                  value={scanCity}
                  onChange={(e) => setScanCity(e.target.value)}
                />
              </div>
            </div>

            <Button
              onClick={handleScan}
              disabled={scanMutation.isPending}
              className="w-full"
            >
              {scanMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Scanning...
                </>
              ) : (
                <>
                  <Search className="h-4 w-4 mr-2" />
                  Scan & Generate Prompt
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* ── Stitch Prompt Output + Generate ── */}
        {hasPrompt && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Generated Stitch Prompt</CardTitle>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={handleCopyPrompt} className="gap-1">
                    <Copy className="h-3 w-3" />
                    Copy
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleScan}
                    disabled={scanMutation.isPending}
                    className="gap-1"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Regenerate
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                readOnly
                rows={12}
                className="font-mono text-xs"
                value={scanMutation.data?.stitch_prompt || website?.stitchPrompt || ""}
              />

              {/* Generate with Stitch or manual instructions */}
              {stitchAvailable ? (
                <Button
                  onClick={handleGenerate}
                  disabled={generateMutation.isPending}
                  className="w-full"
                  size="lg"
                >
                  {generateMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Generating with Google Stitch...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-2" />
                      Generate Website with Google Stitch
                    </>
                  )}
                </Button>
              ) : (
                <div className="bg-muted/50 rounded-md p-4 space-y-2">
                  <p className="text-sm font-medium">Next Step: Generate Your Website</p>
                  <p className="text-xs text-muted-foreground">
                    Copy the prompt above and paste it into{" "}
                    <a
                      href="https://stitch.withgoogle.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline"
                    >
                      Google Stitch
                    </a>{" "}
                    (free, no credit card required). Export as HTML, then upload it below.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── Site Preview Link ── */}
        {domainInfo?.hasHtml && domainInfo?.subdomain && (
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Your Live Site</p>
                  <p className="text-xs text-muted-foreground">
                    {domainInfo.customDomain && domainInfo.domainVerified
                      ? domainInfo.customDomain
                      : `${domainInfo.subdomain}.smallbizagent.ai`}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  asChild
                  className="gap-1"
                >
                  <a
                    href={`/sites/${domainInfo.subdomain}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="h-3 w-3" />
                    View Site
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </PageLayout>
  );
}
