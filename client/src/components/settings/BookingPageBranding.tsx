import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { getContrastForeground } from "@/lib/brand-colors";
import { BRAND_COLOR_PRESETS } from "@/pages/settings/constants";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Palette, RotateCcw, Check } from "lucide-react";

export default function BookingPageBranding() {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const businessId = user?.businessId;

  // Fetch business data for branding fields
  const { data: business } = useQuery<any>({
    queryKey: ["/api/business"],
    enabled: !!businessId,
  });

  const brandColor: string | null = business?.brandColor || null;
  const brandName: string | null = (business as any)?.brandName || null;
  const logoUrl: string | null = business?.logoUrl || null;

  const [selectedColor, setSelectedColor] = useState<string>(brandColor || "");
  const [selectedBrandName, setSelectedBrandName] = useState<string>(brandName || "");
  const [selectedLogoUrl, setSelectedLogoUrl] = useState<string>(logoUrl || "");
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setSelectedColor(brandColor || "");
    setSelectedBrandName(brandName || "");
    setSelectedLogoUrl(logoUrl || "");
  }, [brandColor, brandName, logoUrl]);

  const hasChanges =
    (selectedColor || null) !== (brandColor || null) ||
    (selectedBrandName || null) !== (brandName || null) ||
    (selectedLogoUrl || null) !== (logoUrl || null);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: "File too large", description: "Logo must be under 2MB", variant: "destructive" });
      return;
    }
    setIsUploadingLogo(true);
    try {
      const formData = new FormData();
      formData.append("logo", file);
      const res = await fetch(`/api/business/${businessId}/logo`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      setSelectedLogoUrl(data.logoUrl);
      toast({ title: "Logo uploaded" });
    } catch {
      toast({ title: "Upload failed", variant: "destructive" });
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const handleSave = async () => {
    if (!businessId) return;
    setIsSaving(true);
    try {
      await apiRequest("PUT", `/api/business/${businessId}`, {
        brandColor: selectedColor || null,
        brandName: selectedBrandName || null,
        logoUrl: selectedLogoUrl || null,
      });
      toast({ title: "Saved", description: "Branding updated." });
      queryClient.invalidateQueries({ queryKey: ["/api/business"] });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err?.message || "Failed to save brand color",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setSelectedColor("");
  };

  const previewStyle =
    selectedColor && /^#[0-9a-fA-F]{6}$/.test(selectedColor)
      ? {
          background: `linear-gradient(to bottom right, ${selectedColor}, ${selectedColor}cc)`,
          color: getContrastForeground(selectedColor) === "0 0% 100%" ? "#ffffff" : "#171717",
        }
      : {
          background: "linear-gradient(to bottom right, #171717, #171717cc)",
          color: "#ffffff",
        };

  if (!businessId) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Palette className="h-5 w-5 text-muted-foreground" />
          <div>
            <CardTitle className="text-lg">Branding</CardTitle>
            <CardDescription>
              Customize your brand identity across booking pages, invoices, and generated websites.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Brand Name */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Brand Name</label>
          <p className="text-xs text-muted-foreground">
            Displayed on your booking page, invoices, and customer-facing emails. Leave blank to use your business name.
          </p>
          <Input
            type="text"
            placeholder="Your Business Name"
            value={selectedBrandName}
            onChange={(e) => setSelectedBrandName(e.target.value)}
            className="max-w-xs"
          />
        </div>

        {/* Logo Upload */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Logo</label>
          <p className="text-xs text-muted-foreground">
            Shown on your booking page header and invoices. Max 2MB, PNG or JPG recommended.
          </p>
          <div className="flex items-center gap-4">
            {selectedLogoUrl && (
              <img
                src={selectedLogoUrl}
                alt="Business logo"
                className="h-12 w-12 rounded-lg object-contain border"
              />
            )}
            <div className="flex items-center gap-2">
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleLogoUpload}
                  className="hidden"
                />
                <span className="inline-flex items-center px-3 py-1.5 rounded-md border text-sm font-medium hover:bg-muted transition-colors">
                  {isUploadingLogo ? "Uploading..." : selectedLogoUrl ? "Change Logo" : "Upload Logo"}
                </span>
              </label>
              {selectedLogoUrl && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedLogoUrl("")}
                  className="text-muted-foreground"
                >
                  Remove
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Color picker row */}
        <div className="space-y-3">
          <label className="text-sm font-medium">Brand Color</label>
          <div className="flex items-center gap-3">
            <div className="relative">
              <input
                type="color"
                value={selectedColor || "#171717"}
                onChange={(e) => setSelectedColor(e.target.value)}
                className="w-10 h-10 rounded-lg border cursor-pointer appearance-none bg-transparent [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-lg [&::-webkit-color-swatch]:border-0 [&::-moz-color-swatch]:rounded-lg [&::-moz-color-swatch]:border-0"
              />
            </div>
            <Input
              type="text"
              placeholder="#000000"
              value={selectedColor}
              onChange={(e) => {
                const val = e.target.value;
                if (val === "" || /^#[0-9a-fA-F]{0,6}$/.test(val)) {
                  setSelectedColor(val);
                }
              }}
              className="w-28 font-mono text-sm"
            />
            {selectedColor && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReset}
                className="text-muted-foreground"
              >
                <RotateCcw className="h-4 w-4 mr-1" />
                Reset
              </Button>
            )}
          </div>
        </div>

        {/* Preset swatches */}
        <div className="space-y-2">
          <label className="text-sm text-muted-foreground">Quick Presets</label>
          <div className="flex flex-wrap gap-2">
            {BRAND_COLOR_PRESETS.map((preset) => (
              <button
                key={preset.hex}
                onClick={() => setSelectedColor(preset.hex)}
                className="relative w-8 h-8 rounded-full border-2 transition-all hover:scale-110 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
                style={{
                  backgroundColor: preset.hex,
                  borderColor: selectedColor === preset.hex ? preset.hex : "transparent",
                }}
                title={preset.label}
              >
                {selectedColor === preset.hex && (
                  <Check
                    className="h-4 w-4 absolute inset-0 m-auto"
                    style={{
                      color: getContrastForeground(preset.hex) === "0 0% 100%" ? "#ffffff" : "#171717",
                    }}
                  />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Live preview */}
        <div className="space-y-2">
          <label className="text-sm text-muted-foreground">Preview</label>
          <div className="rounded-lg p-4 transition-all" style={previewStyle}>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-lg font-bold">
                {"\u2726"}
              </div>
              <div>
                <p className="font-semibold text-sm">Your Business Name</p>
                <p className="text-xs opacity-80">Book your appointment today</p>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <div
                className="px-3 py-1.5 rounded-md text-xs font-medium"
                style={{
                  backgroundColor:
                    previewStyle.color === "#ffffff" ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.1)",
                }}
              >
                Select Service
              </div>
              <div
                className="px-3 py-1.5 rounded-md text-xs font-medium opacity-60"
                style={{
                  backgroundColor:
                    previewStyle.color === "#ffffff" ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)",
                }}
              >
                Choose Time
              </div>
            </div>
          </div>
          {!selectedColor && (
            <p className="text-xs text-muted-foreground">
              No brand color set -- your booking page uses the default dark theme.
            </p>
          )}
        </div>
      </CardContent>
      <CardFooter className="flex justify-between border-t pt-6">
        <p className="text-xs text-muted-foreground">
          Changes apply to booking pages, invoices, and generated websites.
        </p>
        <Button onClick={handleSave} disabled={!hasChanges || isSaving} size="sm">
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              Saving...
            </>
          ) : (
            "Save Brand Color"
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}
