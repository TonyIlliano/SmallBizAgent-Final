import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import {
  Users,
  HelpCircle,
  Cake,
  Gift,
  Phone,
  ShieldCheck,
  Settings,
  Calendar,
  Save,
  Loader2,
} from "lucide-react";
import {
  type BirthdayCustomer,
  type SmsConsentStats,
  type BusinessSettings,
  formatBirthday,
} from "./marketingHelpers";

// ---------------------------------------------------------------------------
// BirthdayTab
// ---------------------------------------------------------------------------

export default function BirthdayTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const businessId = user?.businessId;

  // State for birthday campaign settings form
  const [enabled, setEnabled] = useState(false);
  const [discountPercent, setDiscountPercent] = useState(15);
  const [validDays, setValidDays] = useState(7);
  const [channel, setChannel] = useState("both");
  const [customMessage, setCustomMessage] = useState("");
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // Fetch business settings
  const { data: business } = useQuery<BusinessSettings>({
    queryKey: ["/api/business"],
  });

  // Populate form when business data loads
  useEffect(() => {
    if (business && !settingsLoaded) {
      setEnabled(business.birthdayCampaignEnabled ?? false);
      setDiscountPercent(business.birthdayDiscountPercent ?? 15);
      setValidDays(business.birthdayCouponValidDays ?? 7);
      setChannel(business.birthdayCampaignChannel ?? "both");
      setCustomMessage(business.birthdayCampaignMessage ?? "");
      setSettingsLoaded(true);
    }
  }, [business, settingsLoaded]);

  // Fetch upcoming birthdays
  const { data: upcomingBirthdays = [], isLoading: birthdaysLoading } =
    useQuery<BirthdayCustomer[]>({
      queryKey: ["/api/marketing/birthdays"],
    });

  // Fetch SMS consent stats
  const { data: consentStats } = useQuery<SmsConsentStats>({
    queryKey: ["/api/marketing/sms-consent-stats"],
  });

  // Save birthday campaign settings
  const saveSettingsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", `/api/business/${businessId}`, {
        birthdayCampaignEnabled: enabled,
        birthdayDiscountPercent: discountPercent,
        birthdayCouponValidDays: validDays,
        birthdayCampaignChannel: channel,
        birthdayCampaignMessage: customMessage || null,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Settings saved",
        description: enabled
          ? "Birthday campaigns are now active. Customers will receive automated birthday discounts."
          : "Birthday campaigns have been disabled.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/business"] });
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to save settings",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  // Manually trigger birthday campaign
  const sendNowMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/marketing/birthday-campaign", {
        discountPercent,
        validDays,
        customMessage: customMessage || undefined,
        channel,
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Birthday campaign sent",
        description: `Sent to ${data.sentCount || 0} customer${data.sentCount !== 1 ? "s" : ""} with birthdays today.`,
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to send",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  const todayBirthdays = upcomingBirthdays.filter((c) => c.isToday);

  return (
    <div className="space-y-6">
      {/* SMS Consent Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-border bg-card">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Customers</p>
                <p className="text-2xl font-bold">{consentStats?.totalCustomers ?? 0}</p>
              </div>
              <div className="p-3 rounded-full bg-blue-100 dark:bg-blue-900/30">
                <Users className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">SMS Opt-In</p>
                <p className="text-2xl font-bold">{consentStats?.smsOptIn ?? 0}</p>
              </div>
              <div className="p-3 rounded-full bg-green-100 dark:bg-green-900/30">
                <Phone className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Transactional messages
            </p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Marketing Opt-In</p>
                <p className="text-2xl font-bold">{consentStats?.marketingOptIn ?? 0}</p>
              </div>
              <div className="p-3 rounded-full bg-purple-100 dark:bg-purple-900/30">
                <ShieldCheck className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Promotional campaigns (TCPA)
            </p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Birthdays on File</p>
                <p className="text-2xl font-bold">{consentStats?.withBirthday ?? 0}</p>
              </div>
              <div className="p-3 rounded-full bg-pink-100 dark:bg-pink-900/30">
                <Cake className="h-5 w-5 text-pink-600 dark:text-pink-400" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Eligible for birthday offers
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Birthday Campaign Settings */}
      <Card className="border-border bg-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Birthday Campaign Settings
              </CardTitle>
              <CardDescription className="mt-1">
                Automatically send birthday discounts to opted-in customers
              </CardDescription>
            </div>
            <div className="flex items-center gap-3">
              <Label htmlFor="birthday-enabled" className="text-sm font-medium">
                {enabled ? "Active" : "Disabled"}
              </Label>
              <Switch
                id="birthday-enabled"
                checked={enabled}
                onCheckedChange={setEnabled}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Discount % */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Discount Percentage</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={discountPercent}
                  onChange={(e) =>
                    setDiscountPercent(
                      Math.min(100, Math.max(1, parseInt(e.target.value) || 1))
                    )
                  }
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">% off</span>
              </div>
              <p className="text-xs text-muted-foreground">
                The discount customers receive on their birthday
              </p>
            </div>

            {/* Valid Days */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Coupon Valid For</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={90}
                  value={validDays}
                  onChange={(e) =>
                    setValidDays(
                      Math.min(90, Math.max(1, parseInt(e.target.value) || 1))
                    )
                  }
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">days</span>
              </div>
              <p className="text-xs text-muted-foreground">
                How long customers have to use the discount
              </p>
            </div>

            {/* Channel */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Delivery Channel</Label>
              <Select value={channel} onValueChange={setChannel}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sms">SMS Only</SelectItem>
                  <SelectItem value="email">Email Only</SelectItem>
                  <SelectItem value="both">SMS + Email</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                How birthday messages are delivered
              </p>
            </div>
          </div>

          {/* Custom Message Template */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Custom Message (optional)</Label>
            <div className="flex flex-wrap gap-2 mb-2">
              <span className="text-xs text-muted-foreground">Variables:</span>
              {["{firstName}", "{businessName}", "{discount}", "{expiryDate}"].map(
                (chip) => (
                  <Badge
                    key={chip}
                    variant="outline"
                    className="cursor-pointer hover:bg-muted text-xs"
                    onClick={() =>
                      setCustomMessage((prev) => prev + " " + chip)
                    }
                  >
                    {chip}
                  </Badge>
                )
              )}
            </div>
            <Textarea
              placeholder={`Happy Birthday, {firstName}! ${String.fromCodePoint(0x1F382)} {businessName} wants to celebrate with you — enjoy {discount} off your next visit! Valid through {expiryDate}. Show this text to redeem.`}
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              rows={3}
            />
            <p className="text-xs text-muted-foreground">
              Leave blank to use the default birthday message
            </p>
          </div>

          <div className="flex gap-3">
            <Button
              onClick={() => saveSettingsMutation.mutate()}
              disabled={saveSettingsMutation.isPending}
            >
              {saveSettingsMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save Settings
            </Button>
            {enabled && todayBirthdays.length > 0 && (
              <Button
                variant="outline"
                onClick={() => sendNowMutation.mutate()}
                disabled={sendNowMutation.isPending}
              >
                {sendNowMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Gift className="h-4 w-4 mr-2" />
                )}
                Send Now ({todayBirthdays.length} today)
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Upcoming Birthdays */}
      <Card className="border-border bg-card overflow-hidden">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Upcoming Birthdays (Next 7 Days)
          </CardTitle>
        </CardHeader>
        {birthdaysLoading ? (
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </CardContent>
        ) : upcomingBirthdays.length === 0 ? (
          <CardContent className="py-8 text-center">
            <Cake className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              No customer birthdays in the next 7 days.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Collect birthday info from customers to enable birthday campaigns.
            </p>
          </CardContent>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="p-3 text-left font-medium text-muted-foreground">
                    Customer
                  </th>
                  <th className="p-3 text-left font-medium text-muted-foreground">
                    Birthday
                  </th>
                  <th className="p-3 text-left font-medium text-muted-foreground">
                    Phone
                  </th>
                  <th className="p-3 text-left font-medium text-muted-foreground">
                    Email
                  </th>
                  <th className="p-3 text-left font-medium text-muted-foreground">
                    Marketing Opt-In
                  </th>
                </tr>
              </thead>
              <tbody>
                {upcomingBirthdays.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                  >
                    <td className="p-3 font-medium text-foreground">
                      {c.firstName} {c.lastName}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground">
                          {formatBirthday(c.birthday)}
                        </span>
                        {c.isToday && (
                          <Badge className="bg-pink-100 dark:bg-pink-900/30 text-pink-600 dark:text-pink-400 text-xs">
                            Today!
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {c.phone || "---"}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {c.email || "---"}
                    </td>
                    <td className="p-3">
                      {c.marketingOptIn ? (
                        <Badge className="bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 text-xs">
                          Opted In
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">
                          Not Opted In
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* How It Works info */}
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <HelpCircle className="h-4 w-4" />
            How Birthday Campaigns Work
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flex gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-sm font-bold">
                1
              </div>
              <div>
                <p className="text-sm font-medium">Collect Birthdays</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Customers can text "BIRTHDAY MM-DD" to your business number, or you can add it from their profile.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 text-sm font-bold">
                2
              </div>
              <div>
                <p className="text-sm font-medium">Automatic Delivery</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  On their birthday, opted-in customers automatically receive your discount via SMS, email, or both.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 text-sm font-bold">
                3
              </div>
              <div>
                <p className="text-sm font-medium">Drive Repeat Visits</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Birthday discounts drive customer loyalty and repeat business. One message per customer per year.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
