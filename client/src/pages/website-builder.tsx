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
  Search,
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
  Code,
  Save,
  RotateCcw,
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
  hero_image_url?: string;
  show_staff?: boolean;
  show_reviews?: boolean;
  show_hours?: boolean;
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

  // HTML editor state
  const [showHtmlEditor, setShowHtmlEditor] = useState(false);
  const [htmlContent, setHtmlContent] = useState("");
  const [htmlLoaded, setHtmlLoaded] = useState(false);
  const [previewKey, setPreviewKey] = useState(0);

  // Customization state
  const [accentColor, setAccentColor] = useState("");
  const [fontStyle, setFontStyle] = useState<"classic" | "modern" | "bold">("classic");
  const [heroHeadline, setHeroHeadline] = useState("");
  const [heroImageUrl, setHeroImageUrl] = useState("");
  const [showStaff, setShowStaff] = useState(true);
  const [showReviews, setShowReviews] = useState(true);
  const [showHours, setShowHours] = useState(true);
  const [customizationsLoaded, setCustomizationsLoaded] = useState(false);

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
    if (c.hero_image_url) setHeroImageUrl(c.hero_image_url);
    if (c.show_staff !== undefined) setShowStaff(c.show_staff);
    if (c.show_reviews !== undefined) setShowReviews(c.show_reviews);
    if (c.show_hours !== undefined) setShowHours(c.show_hours);
    setCustomizationsLoaded(true);
  }

  // Load HTML content into editor once
  if (website?.htmlContent && !htmlLoaded) {
    setHtmlContent(website.htmlContent);
    setHtmlLoaded(true);
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

  const scanMutation = useMutation({
    mutationFn: async (body: Record<string, string>) => {
      const res = await apiRequest("POST", "/api/website-builder/scan", body);
      return res.json();
    },
    onSuccess: () => {
      setHtmlLoaded(false); // reload editor content
      setPreviewKey(k => k + 1); // refresh preview iframe
      queryClient.invalidateQueries({ queryKey: ["/api/website-builder/site"] });
      queryClient.invalidateQueries({ queryKey: ["/api/website-builder/domain"] });
      toast({ title: "Site generated", description: "Your website has been created and is now live" });
    },
    onError: (error: Error) => {
      toast({ title: "Generation failed", description: error.message, variant: "destructive" });
    },
  });

  const generateMutation = useMutation({
    mutationFn: async (customizations?: WebsiteCustomizations) => {
      const res = await apiRequest("POST", "/api/website-builder/generate",
        customizations ? { customizations } : {}
      );
      return res.json();
    },
    onSuccess: () => {
      setHtmlLoaded(false); // reload editor content
      setPreviewKey(k => k + 1); // refresh preview iframe
      queryClient.invalidateQueries({ queryKey: ["/api/website-builder/site"] });
      queryClient.invalidateQueries({ queryKey: ["/api/website-builder/domain"] });
      toast({ title: "Website generated", description: "Your site has been updated and is now live" });
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

  const saveHtmlMutation = useMutation({
    mutationFn: async (html: string) => {
      const res = await apiRequest("PUT", "/api/website-builder/site", { html_content: html });
      return res.json();
    },
    onSuccess: () => {
      setPreviewKey(k => k + 1); // refresh preview iframe
      queryClient.invalidateQueries({ queryKey: ["/api/website-builder/site"] });
      queryClient.invalidateQueries({ queryKey: ["/api/website-builder/domain"] });
      toast({ title: "Saved", description: "Your website changes have been saved and are now live" });
    },
    onError: (error: Error) => {
      toast({ title: "Save failed", description: error.message, variant: "destructive" });
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

  const handleRegenerate = () => {
    if (!confirm("This will replace your current site. Continue?")) return;
    const customizations: WebsiteCustomizations = {
      accent_color: accentColor || undefined,
      font_style: fontStyle,
      hero_headline: heroHeadline || undefined,
      hero_image_url: heroImageUrl || undefined,
      show_staff: showStaff,
      show_reviews: showReviews,
      show_hours: showHours,
    };
    generateMutation.mutate(customizations);
  };

  const handleSaveAndRegenerate = () => {
    const customizations: WebsiteCustomizations = {
      accent_color: accentColor || undefined,
      font_style: fontStyle,
      hero_headline: heroHeadline || undefined,
      hero_image_url: heroImageUrl || undefined,
      show_staff: showStaff,
      show_reviews: showReviews,
      show_hours: showHours,
    };
    generateMutation.mutate(customizations);
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
  const isGenerating = scanMutation.isPending || generateMutation.isPending;

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
                  Use the scanner below to generate your site, or click Generate to build one from your current business profile.
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

        {/* ── HTML Editor ── */}
        {hasHtml && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Code className="h-5 w-5" />
                    Edit HTML
                  </CardTitle>
                  <CardDescription>
                    Make direct changes to your website's HTML code
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    if (!showHtmlEditor && website?.htmlContent) {
                      setHtmlContent(website.htmlContent);
                    }
                    setShowHtmlEditor(!showHtmlEditor);
                  }}
                  className="gap-1"
                >
                  <Code className="h-3 w-3" />
                  {showHtmlEditor ? "Hide Editor" : "Show Editor"}
                </Button>
              </div>
            </CardHeader>
            {showHtmlEditor && (
              <CardContent className="space-y-4">
                <Textarea
                  value={htmlContent}
                  onChange={(e) => setHtmlContent(e.target.value)}
                  className="font-mono text-xs min-h-[400px] leading-relaxed"
                  placeholder="HTML content..."
                />
                <div className="flex gap-2 justify-end">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (website?.htmlContent) {
                        setHtmlContent(website.htmlContent);
                        toast({ title: "Reverted", description: "Editor reset to saved version" });
                      }
                    }}
                    className="gap-1"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Revert
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => saveHtmlMutation.mutate(htmlContent)}
                    disabled={saveHtmlMutation.isPending || htmlContent === website?.htmlContent}
                    className="gap-1"
                  >
                    {saveHtmlMutation.isPending ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Save className="h-3 w-3" />
                    )}
                    Save Changes
                  </Button>
                </div>
              </CardContent>
            )}
          </Card>
        )}

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

        {/* ── Scanner ── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Business Scanner
            </CardTitle>
            <CardDescription>
              Scan a business listing to auto-generate your one-page site
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
              disabled={isGenerating}
              className="w-full"
            >
              {scanMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Scanning & Generating...
                </>
              ) : (
                <>
                  <Search className="h-4 w-4 mr-2" />
                  Scan & Generate Site
                </>
              )}
            </Button>
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
              Adjust colors, fonts, and sections — then regenerate
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Accent Color */}
            <div className="space-y-2">
              <Label>Accent Color</Label>
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
                <span className="text-xs text-muted-foreground">Leave blank for vertical preset default</span>
              </div>
            </div>

            {/* Font Style */}
            <div className="space-y-2">
              <Label>Font Style</Label>
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

            {/* Hero Headline */}
            <div className="space-y-2">
              <Label>Hero Headline</Label>
              <Input
                placeholder="Leave blank to auto-generate"
                value={heroHeadline}
                onChange={(e) => setHeroHeadline(e.target.value)}
              />
            </div>

            {/* Hero Image */}
            <div className="space-y-2">
              <Label>Hero Image URL</Label>
              <Input
                placeholder="https://example.com/hero.jpg"
                value={heroImageUrl}
                onChange={(e) => setHeroImageUrl(e.target.value)}
              />
            </div>

            <Separator />

            {/* Section Toggles */}
            <div className="space-y-4">
              <Label className="text-base">Sections</Label>
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
