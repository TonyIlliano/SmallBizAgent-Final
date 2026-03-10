import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { getAgentMeta } from "./AgentCard";
import { Save, Loader2, RotateCcw, Smartphone, Eye } from "lucide-react";

interface AgentSettingsFormProps {
  agentType: string;
  currentConfig: Record<string, any> | null;
  enabled: boolean;
}

const TEMPLATE_VARIABLES: Record<string, string[]> = {
  follow_up: ["{customerName}", "{businessName}", "{bookingLink}"],
  no_show: ["{customerName}", "{appointmentTime}", "{businessName}", "{businessPhone}", "{bookingLink}"],
  estimate_follow_up: ["{customerName}", "{businessName}", "{quoteTotal}"],
  rebooking: ["{customerName}", "{businessName}", "{daysSinceVisit}", "{serviceName}", "{bookingLink}", "{businessPhone}"],
  review_response: [],
};

// Sample data for live preview — shows owners what their customers will see
const PREVIEW_VALUES: Record<string, string> = {
  customerName: "Sarah",
  businessName: "Your Business",
  businessPhone: "(555) 123-4567",
  bookingLink: "smallbizagent.ai/book/your-business",
  appointmentTime: "2:00 PM",
  quoteTotal: "$450.00",
  daysSinceVisit: "42",
  serviceName: "haircut",
  validUntil: "March 15",
};

function fillPreview(template: string): string {
  if (!template) return "";
  let result = template;
  for (const [key, value] of Object.entries(PREVIEW_VALUES)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, "g"), value);
  }
  return result;
}

/** Phone-shaped SMS preview bubble */
function SmsPreview({ template, label }: { template: string; label?: string }) {
  const preview = fillPreview(template);
  if (!preview) return null;

  return (
    <div className="mt-2">
      {label && (
        <div className="flex items-center gap-1.5 mb-1.5">
          <Eye className="h-3 w-3 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">{label}</span>
        </div>
      )}
      <div className="bg-muted/50 rounded-xl p-3 border border-border">
        <div className="flex items-start gap-2">
          <Smartphone className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <div className="bg-blue-500 text-white text-sm rounded-2xl rounded-tl-sm px-3 py-2 max-w-[280px]">
            {preview}
          </div>
        </div>
        <div className="text-[10px] text-muted-foreground mt-1.5 ml-6">
          {preview.length} characters {preview.length > 160 ? "(2 SMS segments)" : "(1 SMS segment)"}
        </div>
      </div>
    </div>
  );
}

export function AgentSettingsForm({ agentType, currentConfig, enabled }: AgentSettingsFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const meta = getAgentMeta(agentType);
  const Icon = meta.icon;
  const [config, setConfig] = useState<Record<string, any>>(currentConfig ?? {});

  useEffect(() => {
    if (currentConfig) setConfig(currentConfig);
  }, [currentConfig]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", `/api/automations/settings/${agentType}`, {
        enabled,
        config,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Settings saved", description: `${meta.label} agent configuration updated.` });
      queryClient.invalidateQueries({ queryKey: ["/api/automations/settings"] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to save", description: err.message, variant: "destructive" });
    },
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PUT", `/api/automations/settings/${agentType}`, {
        enabled,
        config: null,
      });
      return res.json();
    },
    onSuccess: () => {
      setConfig({});
      toast({ title: "Reset to defaults", description: `${meta.label} agent reset to default configuration.` });
      queryClient.invalidateQueries({ queryKey: ["/api/automations/settings"] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to reset", description: err.message, variant: "destructive" });
    },
  });

  const variables = TEMPLATE_VARIABLES[agentType] ?? [];

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Icon className={`h-4 w-4 ${meta.color}`} />
          {meta.label} Settings
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Template variables */}
        {variables.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <span className="text-xs text-muted-foreground">Available variables:</span>
            {variables.map((v) => (
              <Badge key={v} variant="outline" className="text-xs">{v}</Badge>
            ))}
          </div>
        )}

        {/* Follow-Up agent */}
        {agentType === "follow_up" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Enable Thank-You SMS</Label>
              <Switch
                checked={config.enableThankYou ?? true}
                onCheckedChange={(v) => setConfig({ ...config, enableThankYou: v })}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Thank-You Template</Label>
              <Textarea
                value={config.thankYouTemplate ?? ""}
                onChange={(e) => setConfig({ ...config, thankYouTemplate: e.target.value })}
                placeholder="Hi {customerName}! Thank you for choosing {businessName}..."
                rows={3}
              />
              <SmsPreview template={config.thankYouTemplate ?? ""} label="Customer will see" />
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Delay (minutes)</Label>
              <Input
                type="number"
                min={0}
                max={1440}
                value={config.thankYouDelayMinutes ?? 30}
                onChange={(e) => setConfig({ ...config, thankYouDelayMinutes: parseInt(e.target.value) || 30 })}
                className="w-32"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-sm">Enable Upsell SMS</Label>
              <Switch
                checked={config.enableUpsell ?? true}
                onCheckedChange={(v) => setConfig({ ...config, enableUpsell: v })}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Upsell Template</Label>
              <Textarea
                value={config.upsellTemplate ?? ""}
                onChange={(e) => setConfig({ ...config, upsellTemplate: e.target.value })}
                placeholder="Hi {customerName}, ready to book your next visit..."
                rows={3}
              />
              <SmsPreview template={config.upsellTemplate ?? ""} label="Customer will see" />
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Upsell Delay (hours)</Label>
              <Input
                type="number"
                min={1}
                max={168}
                value={config.upsellDelayHours ?? 48}
                onChange={(e) => setConfig({ ...config, upsellDelayHours: parseInt(e.target.value) || 48 })}
                className="w-32"
              />
            </div>
          </div>
        )}

        {/* No-Show agent */}
        {agentType === "no_show" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm">Message Template</Label>
              <Textarea
                value={config.messageTemplate ?? ""}
                onChange={(e) => setConfig({ ...config, messageTemplate: e.target.value })}
                placeholder="Hey {customerName}, we missed you..."
                rows={3}
              />
              <SmsPreview template={config.messageTemplate ?? ""} label="Initial SMS to customer" />
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Reschedule Reply Template</Label>
              <Textarea
                value={config.rescheduleReplyTemplate ?? ""}
                onChange={(e) => setConfig({ ...config, rescheduleReplyTemplate: e.target.value })}
                placeholder="Great! Book online at {bookingLink}..."
                rows={2}
              />
              <SmsPreview template={config.rescheduleReplyTemplate ?? ""} label="If customer says YES" />
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Decline Reply Template</Label>
              <Textarea
                value={config.declineReplyTemplate ?? ""}
                onChange={(e) => setConfig({ ...config, declineReplyTemplate: e.target.value })}
                placeholder="No problem! We'll be here..."
                rows={2}
              />
              <SmsPreview template={config.declineReplyTemplate ?? ""} label="If customer says NO" />
            </div>
            <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-sm text-blue-800">
              When you mark an appointment as "No Show", the customer will automatically receive the SMS above offering to reschedule.
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Reply Window (hours)</Label>
              <Input
                type="number"
                min={1}
                max={72}
                value={config.expirationHours ?? 24}
                onChange={(e) => setConfig({ ...config, expirationHours: parseInt(e.target.value) || 24 })}
                className="w-32"
              />
              <p className="text-xs text-muted-foreground">How long the customer has to reply before the conversation expires</p>
            </div>
          </div>
        )}

        {/* Estimate Follow-Up agent */}
        {agentType === "estimate_follow_up" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm">Follow-Up Messages (one per attempt)</Label>
              {((config.messageTemplates as string[]) ?? ["", "", ""]).map((tmpl: string, i: number) => (
                <div key={i} className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Attempt {i + 1}</Label>
                  <Textarea
                    value={tmpl}
                    onChange={(e) => {
                      const templates = [...((config.messageTemplates as string[]) ?? ["", "", ""])];
                      templates[i] = e.target.value;
                      setConfig({ ...config, messageTemplates: templates });
                    }}
                    rows={2}
                  />
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Max Attempts</Label>
              <Input
                type="number"
                min={1}
                max={5}
                value={config.maxAttempts ?? 3}
                onChange={(e) => setConfig({ ...config, maxAttempts: parseInt(e.target.value) || 3 })}
                className="w-32"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-sm">Auto-expire quotes after max attempts</Label>
              <Switch
                checked={config.autoExpire ?? true}
                onCheckedChange={(v) => setConfig({ ...config, autoExpire: v })}
              />
            </div>
          </div>
        )}

        {/* Rebooking agent */}
        {agentType === "rebooking" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm">Default Rebooking Interval (days)</Label>
              <Input
                type="number"
                min={7}
                max={365}
                value={config.defaultIntervalDays ?? 42}
                onChange={(e) => setConfig({ ...config, defaultIntervalDays: parseInt(e.target.value) || 42 })}
                className="w-32"
              />
              <p className="text-xs text-muted-foreground">Days since last visit before sending reminder</p>
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Message Template</Label>
              <Textarea
                value={config.messageTemplate ?? ""}
                onChange={(e) => setConfig({ ...config, messageTemplate: e.target.value })}
                placeholder="Hi {customerName}! It's been {daysSinceVisit} days..."
                rows={3}
              />
              <SmsPreview template={config.messageTemplate ?? ""} label="Initial SMS to customer" />
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Booking Reply Template</Label>
              <Textarea
                value={config.bookingReplyTemplate ?? ""}
                onChange={(e) => setConfig({ ...config, bookingReplyTemplate: e.target.value })}
                placeholder="Awesome! Book here: {bookingLink}..."
                rows={2}
              />
              <SmsPreview template={config.bookingReplyTemplate ?? ""} label="If customer says YES" />
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Decline Reply Template</Label>
              <Textarea
                value={config.declineReplyTemplate ?? ""}
                onChange={(e) => setConfig({ ...config, declineReplyTemplate: e.target.value })}
                placeholder="No worries! We'll be here when you're ready."
                rows={2}
              />
              <SmsPreview template={config.declineReplyTemplate ?? ""} label="If customer says NO" />
            </div>
          </div>
        )}

        {/* Review Response agent */}
        {agentType === "review_response" && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm">Response Tone</Label>
              <Select
                value={config.tone ?? "professional"}
                onValueChange={(v) => setConfig({ ...config, tone: v })}
              >
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="professional">Professional</SelectItem>
                  <SelectItem value="friendly">Friendly</SelectItem>
                  <SelectItem value="casual">Casual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-sm">Max Response Length (words)</Label>
              <Input
                type="number"
                min={50}
                max={500}
                value={config.maxResponseLength ?? 200}
                onChange={(e) => setConfig({ ...config, maxResponseLength: parseInt(e.target.value) || 200 })}
                className="w-32"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-sm">Include Business Name</Label>
              <Switch
                checked={config.includeBusinessName ?? true}
                onCheckedChange={(v) => setConfig({ ...config, includeBusinessName: v })}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-sm">Thank for Positive Reviews</Label>
              <Switch
                checked={config.thankForPositive ?? true}
                onCheckedChange={(v) => setConfig({ ...config, thankForPositive: v })}
              />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">Apologize for Negative Reviews</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Include an apology and offer to make it right for 1-2 star reviews
                </p>
              </div>
              <Switch
                checked={config.apologizeForNegative ?? true}
                onCheckedChange={(v) => setConfig({ ...config, apologizeForNegative: v })}
              />
            </div>
            <p className="text-xs text-muted-foreground border-l-2 border-muted pl-3">
              All AI-drafted responses require your approval before posting to Google. Review pending responses in the Reviews tab.
            </p>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-3 pt-2">
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Settings
          </Button>
          <Button
            variant="outline"
            onClick={() => resetMutation.mutate()}
            disabled={resetMutation.isPending}
          >
            {resetMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RotateCcw className="h-4 w-4 mr-2" />
            )}
            Reset to Defaults
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
