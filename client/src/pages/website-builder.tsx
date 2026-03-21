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
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Globe,
  RefreshCw,
  CheckCircle,
  XCircle,
  Lock,
  ExternalLink,
  Loader2,
  ArrowUpCircle,
  Settings,
  Sparkles,
  Palette,
  AlertTriangle,
  ArrowRight,
  Upload,
  X,
  ImageIcon,
} from "lucide-react";
import { useLocation } from "wouter";

interface DomainInfo {
  subdomain: string | null;
  customDomain: string | null;
  domainVerified: boolean;
  domainTier: string;
  websiteSetupRequested: boolean;
  hasHtml: boolean;
  generatedAt: string | null;
  customizations: WebsiteCustomizations | null;
  features: {
    websiteEnabled: boolean;
    customDomainEnabled: boolean;
    websiteManagedSetup: boolean;
  };
  planTier: string | null;
}

interface WebsiteCustomizations {
  accent_color?: string;
  font_style?: "classic" | "modern" | "bold";
  hero_headline?: string;
  hero_subheadline?: string;
  cta_primary_text?: string;
  cta_secondary_text?: string;
  about_text?: string;
  footer_message?: string;
  show_staff?: boolean;
  show_reviews?: boolean;
  show_hours?: boolean;
}

export default function WebsiteBuilder() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  // Custom domain input
  const [customDomainInput, setCustomDomainInput] = useState("");

  // Preview refresh key
  const [previewKey, setPreviewKey] = useState(0);

  // Customization state
  const [accentColor, setAccentColor] = useState("");
  const [fontStyle, setFontStyle] = useState<"classic" | "modern" | "bold">("classic");
  const [heroHeadline, setHeroHeadline] = useState("");
  const [heroSubheadline, setHeroSubheadline] = useState("");
  const [ctaPrimaryText, setCtaPrimaryText] = useState("");
  const [ctaSecondaryText, setCtaSecondaryText] = useState("");
  const [aboutText, setAboutText] = useState("");
  const [footerMessage, setFooterMessage] = useState("");
  const [showStaff, setShowStaff] = useState(true);
  const [showReviews, setShowReviews] = useState(true);
  const [showHours, setShowHours] = useState(true);
  const [customizationsLoaded, setCustomizationsLoaded] = useState(false);
  const [showGbpPush, setShowGbpPush] = useState(false);

  // ── Queries ──

  const { data: domainInfo, isLoading: domainLoading } = useQuery<DomainInfo>({
    queryKey: ["/api/website-builder/domain"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/website-builder/domain");
      return res.json();
    },
  });

  const { data: website } = useQuery<any>({
    queryKey: ["/api/website-builder/site"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/website-builder/site");
      return res.json();
    },
  });

  // Load customizations from server once
  if (domainInfo?.customizations && !customizationsLoaded) {
    const c = domainInfo.customizations;
    if (c.accent_color) setAccentColor(c.accent_color);
    if (c.font_style) setFontStyle(c.font_style);
    if (c.hero_headline) setHeroHeadline(c.hero_headline);
    if (c.hero_subheadline) setHeroSubheadline(c.hero_subheadline);
    if (c.cta_primary_text) setCtaPrimaryText(c.cta_primary_text);
    if (c.cta_secondary_text) setCtaSecondaryText(c.cta_secondary_text);
    if (c.about_text) setAboutText(c.about_text);
    if (c.footer_message) setFooterMessage(c.footer_message);
    if (c.show_staff !== undefined) setShowStaff(c.show_staff);
    if (c.show_reviews !== undefined) setShowReviews(c.show_reviews);
    if (c.show_hours !== undefined) setShowHours(c.show_hours);
    setCustomizationsLoaded(true);
  }

  // Check what business data is incomplete
  const { data: businessProfile } = useQuery<any>({
    queryKey: ["/api/business/profile"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/user");
      const user = await res.json();
      if (user.businessId) {
        const bizRes = await apiRequest("GET", `/api/business/${user.businessId}`);
        return bizRes.json();
      }
      return null;
    },
  });

  const { data: services } = useQuery<any[]>({
    queryKey: ["/api/services"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/services");
      return res.json();
    },
  });

  const { data: staffMembers } = useQuery<any[]>({
    queryKey: ["/api/staff"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/staff");
      return res.json();
    },
  });

  const businessId = businessProfile?.id;

  // Check if GBP is connected (for push prompt after generation)
  const { data: gbpStatus } = useQuery<{ connected: boolean }>({
    queryKey: ["/api/gbp/status", businessId],
    queryFn: async () => {
      const res = await fetch(`/api/gbp/status/${businessId}`, { credentials: "include" });
      if (!res.ok) return { connected: false };
      return res.json();
    },
    enabled: !!businessId,
  });

  const { data: businessHours } = useQuery<any[]>({
    queryKey: ["/api/business-hours", businessId],
    queryFn: async () => {
      if (!businessId) return [];
      const res = await apiRequest("GET", `/api/business/${businessId}/hours`);
      return res.json();
    },
    enabled: !!businessId,
  });

  // ── Mutations ──

  const generateMutation = useMutation({
    mutationFn: async (customizations?: WebsiteCustomizations) => {
      const res = await apiRequest("POST", "/api/website-builder/generate",
        customizations ? { customizations } : {}
      );
      return res.json();
    },
    onSuccess: () => {
      setPreviewKey(k => k + 1);
      queryClient.invalidateQueries({ queryKey: ["/api/website-builder/site"] });
      queryClient.invalidateQueries({ queryKey: ["/api/website-builder/domain"] });
      toast({ title: "Website generated", description: "Your site has been updated and is now live" });
      // If GBP connected, prompt to push website URL to Google
      if (gbpStatus?.connected) {
        setShowGbpPush(true);
      }
    },
    onError: (error: Error) => {
      toast({ title: "Generation failed", description: error.message, variant: "destructive" });
    },
  });

  const gbpPushMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/gbp/push/${businessId}`, { fields: ["website"] });
      return res.json();
    },
    onSuccess: () => {
      setShowGbpPush(false);
      toast({ title: "Website URL pushed to Google", description: "Your Google listing now links to your website." });
    },
    onError: (error: Error) => {
      toast({ title: "Push failed", description: error.message, variant: "destructive" });
    },
  });

  const setDomainMutation = useMutation({
    mutationFn: async (domain: string) => {
      const res = await apiRequest("POST", "/api/website-builder/set-custom-domain", { domain });
      return res.json();
    },
    onSuccess: (data: any) => {
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
    onSuccess: (data: any) => {
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
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/website-builder/domain"] });
      toast({ title: "Setup requested", description: data.message });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const logoUploadMutation = useMutation({
    mutationFn: async (data: { logoUrl: string }) => {
      if (!businessProfile?.id) throw new Error("No business");
      const res = await apiRequest("PUT", `/api/business/${businessProfile.id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/business/profile"] });
      toast({ title: "Logo updated", description: "Your logo has been saved" });
    },
    onError: (error: Error) => {
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
    },
  });

  const staffPhotoMutation = useMutation({
    mutationFn: async ({ staffId, photoUrl }: { staffId: number; photoUrl: string }) => {
      const res = await apiRequest("PUT", `/api/staff/${staffId}`, { photoUrl });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/staff"] });
      toast({ title: "Photo updated", description: "Staff photo has been saved" });
    },
    onError: (error: Error) => {
      toast({ title: "Upload failed", description: error.message, variant: "destructive" });
    },
  });

  // ── Helpers ──

  function buildCustomizations(): WebsiteCustomizations {
    return {
      accent_color: accentColor || undefined,
      font_style: fontStyle,
      hero_headline: heroHeadline || undefined,
      hero_subheadline: heroSubheadline || undefined,
      cta_primary_text: ctaPrimaryText || undefined,
      cta_secondary_text: ctaSecondaryText || undefined,
      about_text: aboutText || undefined,
      footer_message: footerMessage || undefined,
      show_staff: showStaff,
      show_reviews: showReviews,
      show_hours: showHours,
    };
  }

  const handleRegenerate = () => {
    if (!confirm("This will replace your current site. Continue?")) return;
    generateMutation.mutate(buildCustomizations());
  };

  const handleSaveAndRegenerate = () => {
    generateMutation.mutate(buildCustomizations());
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
  const hasHtml = domainInfo?.hasHtml;
  const isGenerating = generateMutation.isPending;

  // Compute incomplete profile nudges (only show after data has loaded)
  const nudges: Array<{ message: string; link: string; linkText: string }> = [];
  if (services !== undefined && services.length === 0) {
    nudges.push({ message: "Add your services in Settings to include them on your site", link: "/settings?tab=services", linkText: "Add Services" });
  }
  if (businessId && businessHours !== undefined && businessHours.length === 0) {
    nudges.push({ message: "Add your hours in Settings to display them on your site", link: "/settings?tab=hours", linkText: "Add Hours" });
  }
  if (staffMembers !== undefined && staffMembers.length === 0) {
    nudges.push({ message: "Add your team in Settings to feature them on your site", link: "/settings?tab=staff", linkText: "Add Staff" });
  }
  if (businessProfile && !businessProfile.bookingEnabled) {
    nudges.push({ message: "Enable online booking in Settings to embed your booking page on your site", link: "/settings?tab=booking", linkText: "Enable Booking" });
  }

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

        {/* ── GBP Push Prompt ── */}
        {showGbpPush && (
          <Alert className="border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800">
            <Globe className="h-4 w-4 text-blue-600" />
            <AlertDescription className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-blue-800 dark:text-blue-200">
                Push your website URL to Google Business Profile?
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => gbpPushMutation.mutate()}
                  disabled={gbpPushMutation.isPending}
                  className="border-blue-300 text-blue-700 hover:bg-blue-100"
                >
                  {gbpPushMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <ArrowUpCircle className="h-3 w-3 mr-1" />}
                  Push to Google
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowGbpPush(false)} className="text-blue-600">
                  Dismiss
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* ── Site Preview ── */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Globe className="h-5 w-5" />
                  Your Website
                </CardTitle>
                <CardDescription>
                  {hasHtml
                    ? `Last generated: ${domainInfo?.generatedAt ? new Date(domainInfo.generatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Unknown'}`
                    : "Generate your site to see a preview"
                  }
                </CardDescription>
              </div>
              <div className="flex gap-2">
                {hasHtml && domainInfo?.subdomain && (
                  <Button size="sm" variant="outline" asChild className="gap-1">
                    <a href={`/sites/${domainInfo.subdomain}`} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-3 w-3" />
                      View Live Site
                    </a>
                  </Button>
                )}
                {hasHtml && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleRegenerate}
                    disabled={isGenerating}
                    className="gap-1"
                  >
                    {isGenerating ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3 w-3" />
                    )}
                    Regenerate
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {hasHtml && domainInfo?.subdomain ? (
              <div className="border rounded-lg overflow-hidden bg-white">
                <iframe
                  key={previewKey}
                  src={`/sites/${domainInfo.subdomain}`}
                  width="100%"
                  height="500"
                  style={{ border: "none" }}
                  title="Website preview"
                />
              </div>
            ) : (
              <div className="border-2 border-dashed rounded-lg p-12 text-center text-muted-foreground">
                <Globe className="h-12 w-12 mx-auto mb-4 opacity-30" />
                <p className="text-lg font-medium mb-2">No website generated yet</p>
                <p className="text-sm mb-4">
                  We'll use your business profile — name, services, hours, staff — to build your site.
                </p>
                <Button
                  onClick={() => generateMutation.mutate(undefined)}
                  disabled={isGenerating}
                  size="lg"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-2" />
                      Generate Your Site
                    </>
                  )}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Domain Section ── */}
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

        {/* ── Customization Panel ── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="h-5 w-5" />
              Customize Your Site
            </CardTitle>
            <CardDescription>
              Adjust colors, text, and content — then regenerate
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">

            {/* ── Branding ── */}
            <div className="space-y-4">
              <Label className="text-base font-semibold">Branding</Label>

              {/* Accent Color */}
              <div className="space-y-2">
                <Label className="text-sm">Accent Color</Label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={accentColor || "#C9A84C"}
                    onChange={(e) => setAccentColor(e.target.value)}
                    className="w-10 h-10 rounded border cursor-pointer"
                  />
                  <Input
                    placeholder="#C9A84C"
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                    className="max-w-[140px] font-mono text-sm"
                  />
                  <span className="text-xs text-muted-foreground">Leave blank for auto</span>
                </div>
              </div>

              {/* Font Style */}
              <div className="space-y-2">
                <Label className="text-sm">Font Style</Label>
                <div className="flex gap-2">
                  {(["classic", "modern", "bold"] as const).map((style) => (
                    <Button
                      key={style}
                      variant={fontStyle === style ? "default" : "outline"}
                      size="sm"
                      onClick={() => setFontStyle(style)}
                      className="capitalize"
                    >
                      {style}
                    </Button>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  {fontStyle === "classic" && "Serif display font, editorial feel"}
                  {fontStyle === "modern" && "Clean sans-serif, minimal layout"}
                  {fontStyle === "bold" && "Heavy weight type, high contrast layout"}
                </p>
              </div>
            </div>

            <Separator />

            {/* ── Hero Section ── */}
            <div className="space-y-4">
              <Label className="text-base font-semibold">Hero Section</Label>

              <div className="space-y-2">
                <Label className="text-sm">Headline</Label>
                <Input
                  placeholder="Leave blank to auto-generate"
                  value={heroHeadline}
                  onChange={(e) => setHeroHeadline(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label className="text-sm">Subheadline</Label>
                <Input
                  placeholder="Leave blank to auto-generate"
                  value={heroSubheadline}
                  onChange={(e) => setHeroSubheadline(e.target.value)}
                />
              </div>

              {/* Business Logo */}
              <div className="space-y-2">
                <Label className="text-sm">Business Logo</Label>
                <div className="flex items-center gap-4">
                  {businessProfile?.logoUrl ? (
                    <div className="relative">
                      <img
                        src={businessProfile.logoUrl}
                        alt="Business logo"
                        className="h-16 w-16 rounded-lg object-contain border bg-white"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (!businessProfile?.id) return;
                          logoUploadMutation.mutate({ logoUrl: "" });
                        }}
                        className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-destructive text-white flex items-center justify-center hover:bg-destructive/80"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="h-16 w-16 rounded-lg border-2 border-dashed border-muted-foreground/25 flex items-center justify-center">
                      <ImageIcon className="h-6 w-6 text-muted-foreground/40" />
                    </div>
                  )}
                  <div>
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/svg+xml,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          if (file.size > 500 * 1024) {
                            toast({ title: "File too large", description: "Logo must be under 500KB", variant: "destructive" });
                            return;
                          }
                          const reader = new FileReader();
                          reader.onload = () => {
                            const img = new Image();
                            img.onload = () => {
                              const canvas = document.createElement("canvas");
                              const maxSize = 200;
                              let w = img.width, h = img.height;
                              if (w > maxSize || h > maxSize) {
                                if (w > h) { h = (h / w) * maxSize; w = maxSize; }
                                else { w = (w / h) * maxSize; h = maxSize; }
                              }
                              canvas.width = w;
                              canvas.height = h;
                              canvas.getContext("2d")?.drawImage(img, 0, 0, w, h);
                              logoUploadMutation.mutate({ logoUrl: canvas.toDataURL("image/png", 0.9) });
                            };
                            img.src = reader.result as string;
                          };
                          reader.readAsDataURL(file);
                          e.target.value = "";
                        }}
                      />
                      <span className="inline-flex items-center gap-2 px-3 py-2 text-sm border rounded-md hover:bg-accent transition-colors">
                        <Upload className="h-4 w-4" />
                        {businessProfile?.logoUrl ? "Change Logo" : "Upload Logo"}
                      </span>
                    </label>
                    <p className="text-xs text-muted-foreground mt-1">PNG, JPG, SVG, or WebP. Max 500KB.</p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">Your logo appears on the generated website, invoices, and quotes.</p>
              </div>
            </div>

            <Separator />

            {/* ── Call-to-Action Buttons ── */}
            <div className="space-y-4">
              <Label className="text-base font-semibold">Call-to-Action Buttons</Label>

              <div className="space-y-2">
                <Label className="text-sm">Primary Button Text</Label>
                <Input
                  placeholder="Call or Text 24/7"
                  value={ctaPrimaryText}
                  onChange={(e) => setCtaPrimaryText(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">The main button visitors see first</p>
              </div>

              <div className="space-y-2">
                <Label className="text-sm">Booking Button Text</Label>
                <Input
                  placeholder="Book Online"
                  value={ctaSecondaryText}
                  onChange={(e) => setCtaSecondaryText(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">Only shown if online booking is enabled</p>
              </div>
            </div>

            <Separator />

            {/* ── Content ── */}
            <div className="space-y-4">
              <Label className="text-base font-semibold">Content</Label>

              <div className="space-y-2">
                <Label className="text-sm">About Your Business</Label>
                <Textarea
                  placeholder="Tell visitors what makes your business special..."
                  value={aboutText}
                  onChange={(e) => setAboutText(e.target.value)}
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">Short description shown on your site. Leave blank to auto-generate.</p>
              </div>

              <div className="space-y-2">
                <Label className="text-sm">Custom Footer Message</Label>
                <Input
                  placeholder="e.g. Proudly serving Baltimore since 2010"
                  value={footerMessage}
                  onChange={(e) => setFooterMessage(e.target.value)}
                />
              </div>
            </div>

            <Separator />

            {/* ── Team Photos ── */}
            {staffMembers && staffMembers.length > 0 && (
              <>
                <div className="space-y-4">
                  <Label className="text-base font-semibold">Team Photos</Label>
                  <p className="text-xs text-muted-foreground">Upload photos for your team members. These appear in the "Meet the Team" section.</p>
                  <div className="grid grid-cols-2 gap-4">
                    {staffMembers.filter((s: any) => s.active !== false).map((staff: any) => (
                      <div key={staff.id} className="flex items-center gap-3">
                        {staff.photoUrl ? (
                          <div className="relative">
                            <img
                              src={staff.photoUrl}
                              alt={`${staff.firstName} ${staff.lastName}`}
                              className="h-12 w-12 rounded-full object-cover border"
                            />
                            <button
                              type="button"
                              onClick={() => staffPhotoMutation.mutate({ staffId: staff.id, photoUrl: "" })}
                              className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-destructive text-white flex items-center justify-center hover:bg-destructive/80"
                            >
                              <X className="h-2.5 w-2.5" />
                            </button>
                          </div>
                        ) : (
                          <label className="cursor-pointer">
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/webp"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                if (file.size > 500 * 1024) {
                                  toast({ title: "File too large", description: "Photo must be under 500KB", variant: "destructive" });
                                  return;
                                }
                                const reader = new FileReader();
                                reader.onload = () => {
                                  const img = new Image();
                                  img.onload = () => {
                                    const canvas = document.createElement("canvas");
                                    const size = 150;
                                    canvas.width = size;
                                    canvas.height = size;
                                    const ctx = canvas.getContext("2d");
                                    const minDim = Math.min(img.width, img.height);
                                    const sx = (img.width - minDim) / 2;
                                    const sy = (img.height - minDim) / 2;
                                    ctx?.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);
                                    staffPhotoMutation.mutate({ staffId: staff.id, photoUrl: canvas.toDataURL("image/png", 0.9) });
                                  };
                                  img.src = reader.result as string;
                                };
                                reader.readAsDataURL(file);
                                e.target.value = "";
                              }}
                            />
                            <div className="h-12 w-12 rounded-full border-2 border-dashed border-muted-foreground/25 flex items-center justify-center hover:border-muted-foreground/50 transition-colors">
                              <Upload className="h-4 w-4 text-muted-foreground/40" />
                            </div>
                          </label>
                        )}
                        <div className="text-sm">
                          <p className="font-medium">{staff.firstName} {staff.lastName}</p>
                          {staff.specialty && <p className="text-xs text-muted-foreground">{staff.specialty}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <Separator />
              </>
            )}

            {/* ── Section Toggles ── */}
            <div className="space-y-4">
              <Label className="text-base font-semibold">Sections</Label>
              <div className="flex items-center justify-between">
                <Label htmlFor="show-staff" className="text-sm font-normal">Show staff members</Label>
                <Switch id="show-staff" checked={showStaff} onCheckedChange={setShowStaff} />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="show-reviews" className="text-sm font-normal">Show rating and reviews</Label>
                <Switch id="show-reviews" checked={showReviews} onCheckedChange={setShowReviews} />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="show-hours" className="text-sm font-normal">Show hours</Label>
                <Switch id="show-hours" checked={showHours} onCheckedChange={setShowHours} />
              </div>
            </div>

            <Button
              onClick={handleSaveAndRegenerate}
              disabled={isGenerating}
              className="w-full"
              size="lg"
            >
              {generateMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Save & Regenerate
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* ── Incomplete Profile Nudges ── */}
        {nudges.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                Complete Your Profile
              </CardTitle>
              <CardDescription>
                Add more info to make your website even better
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {nudges.map((nudge, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{nudge.message}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => navigate(nudge.link)}
                    className="gap-1 shrink-0"
                  >
                    {nudge.linkText}
                    <ArrowRight className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </PageLayout>
  );
}
