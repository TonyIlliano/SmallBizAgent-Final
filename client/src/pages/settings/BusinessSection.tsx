import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { apiRequest } from "@/lib/queryClient";
import { formatPhoneNumber } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import BookingSettings from "@/components/settings/BookingSettings";
import { StaffScheduleManager } from "@/components/settings/StaffScheduleManager";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Phone, PhoneCall, Power, PowerOff, AlertTriangle, Loader2, RefreshCw, Search, ChevronDown, ChevronUp, MapPin, ArrowRight, Info, Upload, X, ImageIcon, Palette, RotateCcw, Check, UserPlus, Users, Mail, Trash2 } from "lucide-react";
import { hexToHSL, getContrastForeground } from "@/lib/brand-colors";
import {
  INDUSTRY_OPTIONS,
  TIMEZONE_OPTIONS,
  businessProfileSchema,
  businessHoursSchema,
  serviceSchema,
  BRAND_COLOR_PRESETS,
  type ServiceFormData,
} from "./constants";

// --- BookingPageBranding component ---
function BookingPageBranding({
  businessId,
  brandColor,
  brandName,
  logoUrl,
  onSaved,
}: {
  businessId: number;
  brandColor: string | null;
  brandName: string | null;
  logoUrl: string | null;
  onSaved: () => void;
}) {
  const { toast } = useToast();
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

  const hasChanges = (selectedColor || null) !== (brandColor || null) ||
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
    setIsSaving(true);
    try {
      await apiRequest("PUT", `/api/business/${businessId}`, {
        brandColor: selectedColor || null,
        brandName: selectedBrandName || null,
        logoUrl: selectedLogoUrl || null,
      });
      toast({ title: "Saved", description: "Branding updated." });
      onSaved();
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

  const previewStyle = selectedColor && /^#[0-9a-fA-F]{6}$/.test(selectedColor)
    ? {
        background: `linear-gradient(to bottom right, ${selectedColor}, ${selectedColor}cc)`,
        color: getContrastForeground(selectedColor) === "0 0% 100%" ? "#ffffff" : "#171717",
      }
    : {
        background: "linear-gradient(to bottom right, #171717, #171717cc)",
        color: "#ffffff",
      };

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
                  <Check className="h-4 w-4 absolute inset-0 m-auto" style={{
                    color: getContrastForeground(preset.hex) === "0 0% 100%" ? "#ffffff" : "#171717",
                  }} />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Live preview */}
        <div className="space-y-2">
          <label className="text-sm text-muted-foreground">Preview</label>
          <div
            className="rounded-lg p-4 transition-all"
            style={previewStyle}
          >
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-lg font-bold">
                {previewStyle.color === "#ffffff" ? "\u2726" : "\u2726"}
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
                  backgroundColor: previewStyle.color === "#ffffff" ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.1)",
                }}
              >
                Select Service
              </div>
              <div
                className="px-3 py-1.5 rounded-md text-xs font-medium opacity-60"
                style={{
                  backgroundColor: previewStyle.color === "#ffffff" ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.05)",
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
        <Button
          onClick={handleSave}
          disabled={!hasChanges || isSaving}
          size="sm"
        >
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

// --- Team Management Card ---
interface TeamMember {
  userId: number;
  username: string;
  email: string;
  role: string;
  status: string;
}

function TeamManagementCard({ businessId }: { businessId: number }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<string>("staff");
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState<TeamMember | null>(null);

  const { data: teamMembers = [], isLoading } = useQuery<TeamMember[]>({
    queryKey: ['/api/staff/team'],
    enabled: !!businessId,
  });

  const inviteMutation = useMutation({
    mutationFn: async (data: { email: string; role: string }) => {
      return apiRequest("POST", "/api/staff/team/invite", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/staff/team'] });
      toast({ title: "Invite sent", description: `Invitation sent to ${inviteEmail}` });
      setInviteDialogOpen(false);
      setInviteEmail("");
      setInviteRole("staff");
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to send invite",
        variant: "destructive",
      });
    },
  });

  const changeRoleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: number; role: string }) => {
      return apiRequest("PUT", `/api/staff/team/${userId}/role`, { role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/staff/team'] });
      toast({ title: "Role updated", description: "Team member role has been changed." });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to change role",
        variant: "destructive",
      });
    },
  });

  const removeMutation = useMutation({
    mutationFn: async (userId: number) => {
      return apiRequest("DELETE", `/api/staff/team/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/staff/team'] });
      toast({ title: "Member removed", description: "Team member has been removed from this business." });
      setRemoveDialogOpen(false);
      setMemberToRemove(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to remove member",
        variant: "destructive",
      });
    },
  });

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'owner': return 'default' as const;
      case 'manager': return 'secondary' as const;
      case 'staff': return 'outline' as const;
      default: return 'outline' as const;
    }
  };

  const getStatusBadgeVariant = (status: string) => {
    return status === 'active' ? 'default' as const : 'secondary' as const;
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-muted-foreground" />
              <div>
                <CardTitle className="text-lg">Team Members</CardTitle>
                <CardDescription>
                  Manage who has access to your business and their roles.
                </CardDescription>
              </div>
            </div>
            <Button size="sm" onClick={() => setInviteDialogOpen(true)}>
              <UserPlus className="h-4 w-4 mr-2" />
              Invite Member
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-2 text-muted-foreground py-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading team...
            </div>
          ) : teamMembers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Users className="h-10 w-10 mx-auto mb-3 opacity-50" />
              <p className="text-sm font-medium">No team members yet</p>
              <p className="text-xs mt-1">Invite managers or staff to help run your business.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teamMembers.map((member) => {
                  const isCurrentUser = member.userId === user?.id;
                  const isOwner = member.role === 'owner';
                  return (
                    <TableRow key={member.userId}>
                      <TableCell className="font-medium">
                        {member.username}
                        {isCurrentUser && (
                          <span className="text-xs text-muted-foreground ml-2">(you)</span>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{member.email}</TableCell>
                      <TableCell>
                        {isOwner || isCurrentUser ? (
                          <Badge variant={getRoleBadgeVariant(member.role)}>
                            {member.role.charAt(0).toUpperCase() + member.role.slice(1)}
                          </Badge>
                        ) : (
                          <Select
                            value={member.role}
                            onValueChange={(newRole) =>
                              changeRoleMutation.mutate({ userId: member.userId, role: newRole })
                            }
                          >
                            <SelectTrigger className="h-8 w-28">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="manager">Manager</SelectItem>
                              <SelectItem value="staff">Staff</SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getStatusBadgeVariant(member.status)}>
                          {member.status.charAt(0).toUpperCase() + member.status.slice(1)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {!isOwner && !isCurrentUser && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => {
                              setMemberToRemove(member);
                              setRemoveDialogOpen(true);
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Invite Team Member Dialog */}
      <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite Team Member</DialogTitle>
            <DialogDescription>
              Send an invitation email to add a new team member to your business.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <label className="text-sm font-medium">Email Address</label>
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <Input
                  type="email"
                  placeholder="teammate@example.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Role</label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manager">Manager - Operational access (appointments, customers, jobs, invoices)</SelectItem>
                  <SelectItem value="staff">Staff - Own schedule only</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => inviteMutation.mutate({ email: inviteEmail, role: inviteRole })}
              disabled={!inviteEmail || inviteMutation.isPending}
            >
              {inviteMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                "Send Invite"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Member Confirmation Dialog */}
      <AlertDialog open={removeDialogOpen} onOpenChange={setRemoveDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Team Member</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove {memberToRemove?.username} ({memberToRemove?.email}) from your business? They will lose access immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setMemberToRemove(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => memberToRemove && removeMutation.mutate(memberToRemove.userId)}
            >
              {removeMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Removing...
                </>
              ) : (
                "Remove Member"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// --- Main BusinessSection Component ---
export default function BusinessSection({ activeTab }: { activeTab: string }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const businessId = user?.businessId;

  const [serviceDialogOpen, setServiceDialogOpen] = useState(false);
  const [editingService, setEditingService] = useState<any>(null);
  const [forwardingInfoOpen, setForwardingInfoOpen] = useState(false);

  // Phone provisioning dialog state
  const [phoneDialogOpen, setPhoneDialogOpen] = useState(false);
  const [phoneDialogTab, setPhoneDialogTab] = useState<"new" | "existing">("new");
  const [searchAreaCode, setSearchAreaCode] = useState("");
  const [selectedPhoneNumber, setSelectedPhoneNumber] = useState<string | null>(null);
  const [availableNumbers, setAvailableNumbers] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Fetch business profile
  const { data: business, isLoading: isLoadingBusiness } = useQuery<any>({
    queryKey: ['/api/business'],
    enabled: !!businessId,
  });

  const isRestaurant = (business?.industry?.toLowerCase() || '') === 'restaurant';

  // Fetch business hours
  const { data: businessHours = [], isLoading: isLoadingHours } = useQuery<any[]>({
    queryKey: [`/api/business/${businessId}/hours`],
    enabled: !!businessId,
  });

  // Fetch services
  const { data: services = [], isLoading: isLoadingServices } = useQuery<any[]>({
    queryKey: ['/api/services', { businessId }],
    enabled: !!businessId,
  });

  // Poll provisioning status when it may be in progress
  const { data: provisioningStatus } = useQuery<any>({
    queryKey: [`/api/business/${businessId}/provisioning-status`],
    enabled: !!businessId && (!business?.twilioPhoneNumber || (!business?.retellAgentId && !business?.vapiAssistantId)),
    refetchInterval: (query) => {
      const status = query.state.data?.provisioningStatus;
      if (status === 'in_progress' || status === 'pending') {
        return 5000;
      }
      return false;
    },
  });

  // When provisioning completes, refresh the business data
  useEffect(() => {
    if (provisioningStatus?.provisioningStatus === 'completed') {
      queryClient.invalidateQueries({ queryKey: ['/api/business'] });
    }
  }, [provisioningStatus?.provisioningStatus, queryClient]);

  // Pre-fill area code from business phone
  useEffect(() => {
    if (business?.phone && !searchAreaCode) {
      const digits = business.phone.replace(/\D/g, "");
      if (digits.length >= 3) {
        setSearchAreaCode(digits.substring(0, 3));
      }
    }
  }, [business?.phone]);

  // Business Profile Form
  const businessForm = useForm<z.infer<typeof businessProfileSchema>>({
    resolver: zodResolver(businessProfileSchema),
    defaultValues: {
      name: "",
      industry: "",
      address: "",
      city: "",
      state: "",
      zip: "",
      phone: "",
      ownerPhone: "",
      email: "",
      website: "",
      logoUrl: "",
    },
  });

  useEffect(() => {
    if (business) {
      businessForm.reset({
        name: business.name || "",
        industry: business.industry || "",
        timezone: business.timezone || "America/New_York",
        address: business.address || "",
        city: business.city || "",
        state: business.state || "",
        zip: business.zip || "",
        phone: business.phone || "",
        ownerPhone: (business as any).ownerPhone || "",
        email: business.email || "",
        website: business.website || "",
        logoUrl: business.logoUrl || "",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business]);

  // Format business hours data for form
  const formatBusinessHours = () => {
    if (!businessHours) return null;
    const daysOfWeek = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
    const formattedHours: any = {};
    daysOfWeek.forEach(day => {
      const dayData = businessHours.find((h: any) => h.day === day);
      if (dayData) {
        formattedHours[day] = {
          isClosed: dayData.isClosed,
          open: dayData.open,
          close: dayData.close,
        };
      } else {
        formattedHours[day] = {
          isClosed: day === "sunday",
          open: "09:00",
          close: "17:00",
        };
      }
    });
    return formattedHours;
  };

  // Business Hours Form
  const hoursForm = useForm<z.infer<typeof businessHoursSchema>>({
    resolver: zodResolver(businessHoursSchema),
    defaultValues: formatBusinessHours() || {
      monday: { isClosed: false, open: "09:00", close: "17:00" },
      tuesday: { isClosed: false, open: "09:00", close: "17:00" },
      wednesday: { isClosed: false, open: "09:00", close: "17:00" },
      thursday: { isClosed: false, open: "09:00", close: "17:00" },
      friday: { isClosed: false, open: "09:00", close: "17:00" },
      saturday: { isClosed: false, open: "10:00", close: "15:00" },
      sunday: { isClosed: true, open: "", close: "" },
    },
  });

  useEffect(() => {
    if (businessHours && businessHours.length > 0) {
      const formatted = formatBusinessHours();
      if (formatted) {
        hoursForm.reset(formatted);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessHours]);

  // Service Form
  const serviceForm = useForm<ServiceFormData>({
    resolver: zodResolver(serviceSchema),
    defaultValues: { name: "", description: "", price: 0, duration: 60, active: true },
  });

  useEffect(() => {
    if (editingService) {
      serviceForm.reset({
        name: editingService.name || "",
        description: editingService.description || "",
        price: editingService.price || 0,
        duration: editingService.duration || 60,
        active: editingService.active !== false,
      });
    } else {
      serviceForm.reset({ name: "", description: "", price: 0, duration: 60, active: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingService]);

  // Mutations
  const updateProfileMutation = useMutation({
    mutationFn: (data: z.infer<typeof businessProfileSchema>) => {
      return apiRequest("PUT", `/api/business/${businessId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/business"] });
      toast({ title: "Success", description: "Business profile updated successfully" });
    },
    onError: (error: any) => {
      console.error("Business profile update error:", error);
      toast({ title: "Error", description: error?.message || "Failed to update business profile", variant: "destructive" });
    },
  });

  const updateHoursMutation = useMutation({
    mutationFn: (data: any) => {
      const updates = Object.entries(data).map(([day, hours]: [string, any]) => {
        const hourData = businessHours?.find((h: any) => h.day === day);
        if (hourData) {
          return apiRequest("PUT", `/api/business-hours/${hourData.id}`, {
            businessId,
            day,
            open: hours.isClosed ? null : hours.open,
            close: hours.isClosed ? null : hours.close,
            isClosed: hours.isClosed,
          });
        } else {
          return apiRequest("POST", `/api/business-hours`, {
            businessId,
            day,
            open: hours.isClosed ? null : hours.open,
            close: hours.isClosed ? null : hours.close,
            isClosed: hours.isClosed,
          });
        }
      });
      return Promise.all(updates);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/business/${businessId}/hours`] });
      toast({ title: "Success", description: "Business hours updated successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update business hours", variant: "destructive" });
    },
  });

  const saveServiceMutation = useMutation({
    mutationFn: (data: ServiceFormData) => {
      if (editingService) {
        return apiRequest("PUT", `/api/services/${editingService.id}`, { ...data, businessId });
      } else {
        return apiRequest("POST", "/api/services", { ...data, businessId });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/services"] });
      toast({ title: "Success", description: editingService ? "Service updated successfully" : "Service created successfully" });
      setServiceDialogOpen(false);
      setEditingService(null);
      serviceForm.reset();
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error?.message || "Failed to save service", variant: "destructive" });
    },
  });

  const deleteServiceMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/services/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/services"] });
      toast({ title: "Success", description: "Service deleted successfully" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete service", variant: "destructive" });
    },
  });

  const toggleReceptionistMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const response = await apiRequest("POST", `/api/business/${businessId}/receptionist/toggle`, { enabled });
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/business"] });
      toast({
        title: data.receptionistEnabled ? "AI Receptionist Enabled" : "AI Receptionist Disabled",
        description: data.receptionistEnabled
          ? "Your AI receptionist is now answering calls"
          : "Your AI receptionist has been paused and will not answer calls",
      });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update receptionist status", variant: "destructive" });
    },
  });

  const deprovisionMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/business/${businessId}/receptionist/deprovision`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/business"] });
      toast({ title: "AI Receptionist Cancelled", description: "Your phone number has been released and the AI assistant has been removed" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to deprovision receptionist", variant: "destructive" });
    },
  });

  const provisionMutation = useMutation({
    mutationFn: async (params?: { phoneNumber?: string; areaCode?: string }) => {
      const body: any = {};
      if (params?.phoneNumber) {
        body.phoneNumber = params.phoneNumber;
      } else if (params?.areaCode) {
        body.areaCode = params.areaCode;
      } else {
        body.areaCode = business?.phone?.replace(/\D/g, "").substring(0, 3) || "212";
      }
      const response = await apiRequest("POST", `/api/business/${businessId}/receptionist/provision`, body);
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/business"] });
      setPhoneDialogOpen(false);
      setAvailableNumbers([]);
      setSelectedPhoneNumber(null);
      toast({ title: "AI Receptionist Activated!", description: `Your new phone number is ${formatPhoneNumber(data.phoneNumber)}` });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to provision receptionist. Please contact support.", variant: "destructive" });
    },
  });

  const refreshAssistantMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", `/api/retell/refresh/${businessId}`);
      return response.json();
    },
    onSuccess: () => {
      toast({ title: "AI Assistant Updated", description: "Your AI receptionist has been refreshed with the latest configuration." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to refresh AI assistant. Please try again.", variant: "destructive" });
    },
  });

  // Search available phone numbers
  const searchNumbers = async () => {
    if (!searchAreaCode || searchAreaCode.length !== 3 || !/^\d{3}$/.test(searchAreaCode)) {
      toast({ title: "Invalid area code", description: "Please enter a 3-digit area code", variant: "destructive" });
      return;
    }
    setIsSearching(true);
    setSelectedPhoneNumber(null);
    try {
      const response = await apiRequest("GET", `/api/business/${businessId}/available-numbers?areaCode=${searchAreaCode}`);
      const data = await response.json();
      setAvailableNumbers(data.phoneNumbers || []);
      if ((data.phoneNumbers || []).length === 0) {
        toast({ title: "No numbers found", description: `No phone numbers available in area code ${searchAreaCode}. Try a different area code.` });
      }
    } catch {
      toast({ title: "Search failed", description: "Failed to search for available numbers. Please try again.", variant: "destructive" });
      setAvailableNumbers([]);
    } finally {
      setIsSearching(false);
    }
  };

  // Submit handlers
  const onSubmitProfile = (data: z.infer<typeof businessProfileSchema>) => updateProfileMutation.mutate(data);
  const onSubmitHours = (data: z.infer<typeof businessHoursSchema>) => updateHoursMutation.mutate(data);
  const onSubmitService = (data: ServiceFormData) => saveServiceMutation.mutate(data);

  const openAddServiceDialog = () => { setEditingService(null); setServiceDialogOpen(true); };
  const openEditServiceDialog = (service: any) => { setEditingService(service); setServiceDialogOpen(true); };

  // Render only the content for the active tab
  if (activeTab === "team") {
    return (
      <div className="space-y-4">
        {businessId && (user?.effectiveRole === 'owner' || user?.role === 'admin') && (
          <TeamManagementCard businessId={businessId} />
        )}
        {businessId && <StaffScheduleManager businessId={businessId} />}
      </div>
    );
  }

  if (activeTab === "hours") {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Business Hours</CardTitle>
            <CardDescription>
              Set your regular business hours to help schedule appointments properly
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingHours ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin w-8 h-8 border-4 border-primary rounded-full border-t-transparent"></div>
              </div>
            ) : (
              <Form {...hoursForm}>
                <form onSubmit={hoursForm.handleSubmit(onSubmitHours)} className="space-y-6">
                  {["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"].map((day) => (
                    <div key={day} className="border rounded-md p-4">
                      <div className="flex justify-between items-center mb-4">
                        <h3 className="font-medium capitalize">{day}</h3>
                        <FormField
                          control={hoursForm.control}
                          name={`${day}.isClosed` as any}
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-center space-x-2">
                              <FormLabel htmlFor={`${day}-closed`}>Closed</FormLabel>
                              <FormControl>
                                <Switch
                                  id={`${day}-closed`}
                                  checked={field.value}
                                  onCheckedChange={field.onChange}
                                />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <FormField
                          control={hoursForm.control}
                          name={`${day}.open` as any}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Opening Time</FormLabel>
                              <FormControl>
                                <Input
                                  type="time"
                                  {...field}
                                  value={field.value || ""}
                                  disabled={hoursForm.watch(`${day}.isClosed` as any)}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={hoursForm.control}
                          name={`${day}.close` as any}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Closing Time</FormLabel>
                              <FormControl>
                                <Input
                                  type="time"
                                  {...field}
                                  value={field.value || ""}
                                  disabled={hoursForm.watch(`${day}.isClosed` as any)}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>
                  ))}
                  <Button type="submit" className="mt-4" disabled={updateHoursMutation.isPending}>
                    {updateHoursMutation.isPending ? "Saving..." : "Save Business Hours"}
                  </Button>
                </form>
              </Form>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (activeTab === "services" && !isRestaurant) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Services</CardTitle>
            <CardDescription>
              Manage the services your business offers to customers
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingServices ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin w-8 h-8 border-4 border-primary rounded-full border-t-transparent"></div>
              </div>
            ) : (
              <div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Service Name</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead>Duration</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {services && services.length > 0 ? (
                      services.map((service: any) => (
                        <TableRow key={service.id}>
                          <TableCell className="font-medium">{service.name}</TableCell>
                          <TableCell>{service.description || "N/A"}</TableCell>
                          <TableCell className="text-right">${(service.price ?? 0).toFixed(2)}</TableCell>
                          <TableCell>{service.duration ?? 0} min</TableCell>
                          <TableCell>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${service.active ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
                              {service.active ? "Active" : "Inactive"}
                            </span>
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm" onClick={() => openEditServiceDialog(service)}>
                              Edit
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-500 hover:text-red-700 hover:bg-red-50"
                              onClick={() => {
                                if (confirm(`Are you sure you want to delete ${service.name}?`)) {
                                  deleteServiceMutation.mutate(service.id);
                                }
                              }}
                            >
                              Delete
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8">
                          No services found. Add your first service.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
                <Button className="mt-6" onClick={openAddServiceDialog}>
                  Add New Service
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Service Dialog */}
        <Dialog open={serviceDialogOpen} onOpenChange={setServiceDialogOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>{editingService ? "Edit Service" : "Add New Service"}</DialogTitle>
              <DialogDescription>
                {editingService ? "Update the service details below." : "Create a new service for your business."}
              </DialogDescription>
            </DialogHeader>
            <Form {...serviceForm}>
              <form onSubmit={serviceForm.handleSubmit(onSubmitService)} className="space-y-4">
                <FormField
                  control={serviceForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Service Name</FormLabel>
                      <FormControl>
                        <Input placeholder="e.g., Basic Cleaning" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={serviceForm.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea placeholder="Describe what this service includes..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <FormField
                    control={serviceForm.control}
                    name="price"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Price ($)</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" min="0" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={serviceForm.control}
                    name="duration"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Duration (min)</FormLabel>
                        <FormControl>
                          <Input type="number" min="15" step="15" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={serviceForm.control}
                  name="active"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-3">
                      <div className="space-y-0.5">
                        <FormLabel>Active</FormLabel>
                        <FormDescription>Make this service available for booking</FormDescription>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setServiceDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={saveServiceMutation.isPending}>
                    {saveServiceMutation.isPending ? "Saving..." : (editingService ? "Update" : "Create")}
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  if (activeTab === "booking" && !isRestaurant) {
    return (
      <div className="space-y-4">
        {business && <BookingSettings business={business} />}
        {business && businessId && (
          <BookingPageBranding
            businessId={businessId}
            brandColor={business.brandColor || null}
            brandName={(business as any).brandName || null}
            logoUrl={business.logoUrl || null}
            onSaved={() => queryClient.invalidateQueries({ queryKey: ["/api/business"] })}
          />
        )}
      </div>
    );
  }

  // Default: profile tab
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Business Profile</CardTitle>
          <CardDescription>
            Update your business information that will appear on invoices and communications
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingBusiness ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin w-8 h-8 border-4 border-primary rounded-full border-t-transparent"></div>
            </div>
          ) : (
            <Form {...businessForm}>
              <form onSubmit={businessForm.handleSubmit(onSubmitProfile)} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField
                    control={businessForm.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Business Name</FormLabel>
                        <FormControl><Input {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={businessForm.control}
                    name="industry"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Industry Type</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger><SelectValue placeholder="Select your industry" /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {INDUSTRY_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>This helps customize the AI receptionist for your business type</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={businessForm.control}
                    name="timezone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Business Timezone</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger><SelectValue placeholder="Select your timezone" /></SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {TIMEZONE_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>All appointment times, booking page, and AI receptionist will use this timezone</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Business Logo */}
                <FormField
                  control={businessForm.control}
                  name="logoUrl"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Business Logo</FormLabel>
                      <FormDescription>Your logo will appear on quotes and invoices</FormDescription>
                      <FormControl>
                        <div className="flex items-center gap-4">
                          {field.value ? (
                            <div className="relative">
                              <img src={field.value} alt="Business logo" className="h-20 w-20 rounded-lg object-contain border bg-white" />
                              <button
                                type="button"
                                onClick={() => field.onChange("")}
                                className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-destructive text-white flex items-center justify-center hover:bg-destructive/80"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ) : (
                            <div className="h-20 w-20 rounded-lg border-2 border-dashed border-muted-foreground/25 flex items-center justify-center">
                              <ImageIcon className="h-8 w-8 text-muted-foreground/40" />
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
                                      let w = img.width;
                                      let h = img.height;
                                      if (w > maxSize || h > maxSize) {
                                        if (w > h) { h = (h / w) * maxSize; w = maxSize; }
                                        else { w = (w / h) * maxSize; h = maxSize; }
                                      }
                                      canvas.width = w;
                                      canvas.height = h;
                                      const ctx = canvas.getContext("2d");
                                      ctx?.drawImage(img, 0, 0, w, h);
                                      field.onChange(canvas.toDataURL("image/png", 0.9));
                                    };
                                    img.src = reader.result as string;
                                  };
                                  reader.readAsDataURL(file);
                                  e.target.value = "";
                                }}
                              />
                              <span className="inline-flex items-center gap-2 px-3 py-2 text-sm border rounded-md hover:bg-accent transition-colors">
                                <Upload className="h-4 w-4" />
                                {field.value ? "Change Logo" : "Upload Logo"}
                              </span>
                            </label>
                            <p className="text-xs text-muted-foreground mt-1">PNG, JPG, SVG, or WebP. Max 500KB.</p>
                          </div>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField control={businessForm.control} name="phone" render={({ field }) => (
                    <FormItem><FormLabel>Business Phone</FormLabel><FormControl><Input {...field} /></FormControl><FormDescription>Shown to customers</FormDescription><FormMessage /></FormItem>
                  )} />
                  <FormField control={businessForm.control} name="ownerPhone" render={({ field }) => (
                    <FormItem><FormLabel>Owner Cell Phone</FormLabel><FormControl><Input placeholder="(555) 987-6543" {...field} /></FormControl><FormDescription>For payment alerts and account notifications</FormDescription><FormMessage /></FormItem>
                  )} />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <FormField control={businessForm.control} name="email" render={({ field }) => (
                    <FormItem><FormLabel>Email Address</FormLabel><FormControl><Input {...field} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>

                <FormField control={businessForm.control} name="website" render={({ field }) => (
                  <FormItem><FormLabel>Website</FormLabel><FormControl><Input {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
                )} />

                <FormField control={businessForm.control} name="address" render={({ field }) => (
                  <FormItem><FormLabel>Street Address</FormLabel><FormControl><Input {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
                )} />

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <FormField control={businessForm.control} name="city" render={({ field }) => (
                    <FormItem><FormLabel>City</FormLabel><FormControl><Input {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={businessForm.control} name="state" render={({ field }) => (
                    <FormItem><FormLabel>State</FormLabel><FormControl><Input {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
                  )} />
                  <FormField control={businessForm.control} name="zip" render={({ field }) => (
                    <FormItem><FormLabel>ZIP Code</FormLabel><FormControl><Input {...field} value={field.value || ""} /></FormControl><FormMessage /></FormItem>
                  )} />
                </div>

                <Button type="submit" className="mt-4" disabled={updateProfileMutation.isPending}>
                  {updateProfileMutation.isPending ? "Saving..." : "Save Changes"}
                </Button>
              </form>
            </Form>
          )}
        </CardContent>
      </Card>

      {/* Virtual Receptionist Phone Number Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <PhoneCall className="h-5 w-5 text-primary" />
            </div>
            <div>
              <CardTitle>Virtual Receptionist Phone Number</CardTitle>
              <CardDescription>Your dedicated business phone number for the AI receptionist</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoadingBusiness ? (
            <div className="flex justify-center py-4">
              <div className="animate-spin w-6 h-6 border-4 border-primary rounded-full border-t-transparent"></div>
            </div>
          ) : business?.twilioPhoneNumber ? (
            <div className="space-y-4">
              <div className="flex items-center gap-4 p-4 bg-muted rounded-lg">
                <Phone className="h-8 w-8 text-primary" />
                <div className="flex-1">
                  <p className="text-2xl font-bold tracking-wide">{formatPhoneNumber(business.twilioPhoneNumber)}</p>
                  <p className="text-sm text-muted-foreground">
                    Provisioned on {business.twilioDateProvisioned ? new Date(business.twilioDateProvisioned).toLocaleDateString() : "N/A"}
                  </p>
                </div>
                <Badge
                  variant="default"
                  className={business.receptionistEnabled !== false ? "bg-green-500 hover:bg-green-600" : "bg-yellow-500 hover:bg-yellow-600"}
                >
                  {business.receptionistEnabled !== false ? "Active" : "Disabled"}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Customers can call this number to reach your AI-powered virtual receptionist.
                The receptionist will handle calls, answer questions, and book appointments on your behalf.
              </p>

              {/* Toggle and Deprovision Controls */}
              <div className="border-t pt-4 mt-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <label className="text-sm font-medium">AI Receptionist Status</label>
                    <p className="text-sm text-muted-foreground">
                      {business.receptionistEnabled !== false
                        ? "Your AI receptionist is answering calls"
                        : "Your AI receptionist is paused and not answering calls"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {toggleReceptionistMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        {business.receptionistEnabled !== false ? (
                          <Power className="h-4 w-4 text-green-500" />
                        ) : (
                          <PowerOff className="h-4 w-4 text-yellow-500" />
                        )}
                      </>
                    )}
                    <Switch
                      checked={business.receptionistEnabled !== false}
                      onCheckedChange={(checked) => toggleReceptionistMutation.mutate(checked)}
                      disabled={toggleReceptionistMutation.isPending}
                    />
                  </div>
                </div>

                {/* Deprovision Option */}
                <div className="flex items-center justify-between p-3 bg-destructive/5 rounded-lg border border-destructive/20">
                  <div className="space-y-0.5">
                    <label className="text-sm font-medium text-destructive">Cancel AI Receptionist</label>
                    <p className="text-sm text-muted-foreground">Release your phone number and remove the AI assistant</p>
                  </div>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="sm">Deprovision</Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                          <AlertTriangle className="h-5 w-5 text-destructive" />
                          Cancel AI Receptionist?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently:
                          <ul className="list-disc list-inside mt-2 space-y-1">
                            <li>Release your phone number ({formatPhoneNumber(business.twilioPhoneNumber)})</li>
                            <li>Delete your AI assistant configuration</li>
                            <li>Stop all incoming call handling</li>
                          </ul>
                          <p className="mt-3 font-medium">
                            You can re-enable the AI receptionist later, but you will be assigned a new phone number.
                          </p>
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Keep Active</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={() => deprovisionMutation.mutate()}
                          disabled={deprovisionMutation.isPending}
                        >
                          {deprovisionMutation.isPending ? (
                            <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Deprovisioning...</>
                          ) : "Yes, Cancel Receptionist"}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>

                {/* Call Forwarding Instructions */}
                <Collapsible open={forwardingInfoOpen} onOpenChange={setForwardingInfoOpen}>
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" className="w-full justify-between" size="sm">
                      <span className="flex items-center gap-2"><Info className="h-4 w-4" />Call Forwarding Setup</span>
                      {forwardingInfoOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="mt-2 p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800 space-y-3">
                      <p className="text-sm font-medium">Want calls to your existing business number to reach this AI receptionist?</p>
                      <p className="text-sm text-muted-foreground">Set up call forwarding from your current business phone to this number:</p>
                      <div className="flex items-center gap-2 p-2 bg-white dark:bg-background rounded border font-mono text-lg">
                        <Phone className="h-4 w-4 text-primary flex-shrink-0" />
                        {formatPhoneNumber(business.twilioPhoneNumber)}
                      </div>
                      <div className="space-y-2 text-sm">
                        <p className="font-medium">How to set up forwarding:</p>
                        <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                          <li><strong>Most carriers:</strong> Dial <code className="bg-muted px-1 rounded">*72</code> followed by <code className="bg-muted px-1 rounded">{formatPhoneNumber(business.twilioPhoneNumber)}</code></li>
                          <li><strong>To disable forwarding:</strong> Dial <code className="bg-muted px-1 rounded">*73</code></li>
                          <li><strong>Alternative:</strong> Contact your phone provider and ask to forward calls to {formatPhoneNumber(business.twilioPhoneNumber)}</li>
                        </ul>
                      </div>
                      <p className="text-xs text-muted-foreground italic">Forwarding codes may vary by carrier. Check with your provider if *72/*73 don't work.</p>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </div>
            </div>
          ) : (
            <>
              <div className="text-center py-6">
                <Phone className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                <h3 className="font-semibold text-lg mb-1">No Phone Number Assigned</h3>
                <p className="text-sm text-muted-foreground max-w-md mx-auto mb-4">
                  Get a dedicated phone number for your AI receptionist, or forward your existing business number.
                </p>

                {(provisioningStatus?.provisioningStatus === 'in_progress' || provisionMutation.isPending) && (
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground mb-4">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Setting up your AI receptionist... This may take a minute.
                  </div>
                )}

                {provisioningStatus?.provisioningStatus === 'failed' && !provisionMutation.isPending && (
                  <div className="text-sm text-destructive mb-4">
                    Provisioning encountered an issue. Click below to try again.
                  </div>
                )}

                <Button
                  onClick={() => { setPhoneDialogOpen(true); setPhoneDialogTab("new"); setAvailableNumbers([]); setSelectedPhoneNumber(null); }}
                  disabled={provisionMutation.isPending || provisioningStatus?.provisioningStatus === 'in_progress'}
                >
                  {(provisionMutation.isPending || provisioningStatus?.provisioningStatus === 'in_progress') ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Provisioning...</>
                  ) : (
                    <><Phone className="mr-2 h-4 w-4" />Enable AI Receptionist</>
                  )}
                </Button>
              </div>

              {/* Phone Number Provisioning Dialog */}
              <Dialog open={phoneDialogOpen} onOpenChange={setPhoneDialogOpen}>
                <DialogContent className="sm:max-w-[550px]">
                  <DialogHeader>
                    <DialogTitle>Set Up Your AI Receptionist Phone</DialogTitle>
                    <DialogDescription>Choose how you'd like to connect your AI receptionist</DialogDescription>
                  </DialogHeader>

                  <div className="flex gap-2 border-b pb-3">
                    <Button variant={phoneDialogTab === "new" ? "default" : "outline"} size="sm" onClick={() => setPhoneDialogTab("new")}>
                      <Phone className="mr-2 h-4 w-4" />Get a New Number
                    </Button>
                    <Button variant={phoneDialogTab === "existing" ? "default" : "outline"} size="sm" onClick={() => setPhoneDialogTab("existing")}>
                      <ArrowRight className="mr-2 h-4 w-4" />Use My Existing Number
                    </Button>
                  </div>

                  {phoneDialogTab === "new" && (
                    <div className="space-y-4">
                      <p className="text-sm text-muted-foreground">Search for a phone number in your preferred area code, or let us pick one for you.</p>
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <Input placeholder="Area code (e.g. 443)" value={searchAreaCode} onChange={(e) => { const val = e.target.value.replace(/\D/g, "").substring(0, 3); setSearchAreaCode(val); }} maxLength={3} />
                        </div>
                        <Button onClick={searchNumbers} disabled={isSearching || searchAreaCode.length !== 3}>
                          {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                          <span className="ml-2">Search</span>
                        </Button>
                      </div>

                      {availableNumbers.length > 0 && (
                        <div className="max-h-[250px] overflow-y-auto border rounded-lg">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Phone Number</TableHead>
                                <TableHead>Location</TableHead>
                                <TableHead className="w-[80px]"></TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {availableNumbers.map((num: any) => (
                                <TableRow key={num.phoneNumber} className={selectedPhoneNumber === num.phoneNumber ? "bg-primary/10" : ""}>
                                  <TableCell className="font-mono">{formatPhoneNumber(num.phoneNumber)}</TableCell>
                                  <TableCell className="text-sm text-muted-foreground">
                                    <span className="flex items-center gap-1">
                                      <MapPin className="h-3 w-3" />
                                      {num.locality ? `${num.locality}, ${num.region}` : num.region || "US"}
                                    </span>
                                  </TableCell>
                                  <TableCell>
                                    <Button size="sm" variant={selectedPhoneNumber === num.phoneNumber ? "default" : "outline"} onClick={() => setSelectedPhoneNumber(num.phoneNumber)}>
                                      {selectedPhoneNumber === num.phoneNumber ? "Selected" : "Select"}
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}

                      <DialogFooter className="flex-col sm:flex-row gap-2">
                        <Button variant="outline" onClick={() => provisionMutation.mutate({ areaCode: searchAreaCode.length === 3 ? searchAreaCode : undefined })} disabled={provisionMutation.isPending}>
                          {provisionMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                          Just Assign Me One
                        </Button>
                        {selectedPhoneNumber && (
                          <Button onClick={() => provisionMutation.mutate({ phoneNumber: selectedPhoneNumber })} disabled={provisionMutation.isPending}>
                            {provisionMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Phone className="mr-2 h-4 w-4" />}
                            Use {formatPhoneNumber(selectedPhoneNumber || '')}
                          </Button>
                        )}
                      </DialogFooter>
                    </div>
                  )}

                  {phoneDialogTab === "existing" && (
                    <div className="space-y-4">
                      <div className="p-4 bg-blue-50 dark:bg-blue-950/20 rounded-lg border border-blue-200 dark:border-blue-800">
                        <p className="text-sm font-medium mb-2">How it works:</p>
                        <div className="space-y-3 text-sm text-muted-foreground">
                          <div className="flex items-start gap-3">
                            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">1</span>
                            <p>We'll provision an AI receptionist number for you</p>
                          </div>
                          <div className="flex items-start gap-3">
                            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">2</span>
                            <p>Set up call forwarding from your existing business number to the new AI number</p>
                          </div>
                          <div className="flex items-start gap-3">
                            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold">3</span>
                            <p>Calls to your business number will automatically be answered by your AI receptionist</p>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-sm font-medium">Preferred area code (optional)</label>
                        <Input placeholder="Area code (e.g. 443)" value={searchAreaCode} onChange={(e) => { const val = e.target.value.replace(/\D/g, "").substring(0, 3); setSearchAreaCode(val); }} maxLength={3} />
                        <p className="text-xs text-muted-foreground">We'll try to get a number in this area code. Leave blank for any available number.</p>
                      </div>

                      <div className="p-3 bg-muted rounded-lg text-sm">
                        <p className="font-medium mb-1">After setup, you'll forward your existing number:</p>
                        <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                          <li><strong>Most carriers:</strong> Dial <code className="bg-background px-1 rounded">*72</code> + your new AI number</li>
                          <li><strong>To disable:</strong> Dial <code className="bg-background px-1 rounded">*73</code></li>
                          <li>Or contact your phone provider to set up forwarding</li>
                        </ul>
                      </div>

                      <DialogFooter>
                        <Button onClick={() => provisionMutation.mutate({ areaCode: searchAreaCode.length === 3 ? searchAreaCode : undefined })} disabled={provisionMutation.isPending}>
                          {provisionMutation.isPending ? (
                            <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Provisioning...</>
                          ) : (
                            <><Phone className="mr-2 h-4 w-4" />Provision AI Number</>
                          )}
                        </Button>
                      </DialogFooter>
                    </div>
                  )}
                </DialogContent>
              </Dialog>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
