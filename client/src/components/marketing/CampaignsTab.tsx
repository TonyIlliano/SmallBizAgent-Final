import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Send,
  Megaphone,
  Loader2,
} from "lucide-react";
import {
  type CampaignTemplate,
  type Campaign,
  type Customer,
  type InactiveCustomer,
  formatDate,
} from "./marketingHelpers";

// ---------------------------------------------------------------------------
// CampaignsTab
// ---------------------------------------------------------------------------

export default function CampaignsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [campaignName, setCampaignName] = useState("");
  const [campaignTemplate, setCampaignTemplate] = useState("");
  const [segment, setSegment] = useState("all");
  const [channel, setChannel] = useState<"sms" | "email" | "both">("sms");
  const [subject, setSubject] = useState("");

  const { data: templates = [] } = useQuery<CampaignTemplate[]>({
    queryKey: ["/api/marketing/templates"],
  });

  const { data: campaignHistory = [] } = useQuery<Campaign[]>({
    queryKey: ["/api/marketing/campaigns"],
  });

  const { data: allCustomers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const { data: inactiveCustomers = [] } = useQuery<InactiveCustomer[]>({
    queryKey: ["/api/marketing/inactive-customers", { days: "90" }],
  });

  // Compute filtered customer IDs based on segment
  const filteredCustomerIds = useMemo(() => {
    if (segment === "all") {
      return allCustomers.map((c) => c.id);
    }
    if (segment === "inactive_90") {
      return inactiveCustomers.map((c) => c.id);
    }
    if (segment === "new") {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      return allCustomers
        .filter((c) => new Date(c.createdAt) >= thirtyDaysAgo)
        .map((c) => c.id);
    }
    if (segment === "regular") {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const inactiveIds = new Set(inactiveCustomers.map((c) => c.id));
      return allCustomers
        .filter(
          (c) =>
            new Date(c.createdAt) < thirtyDaysAgo && !inactiveIds.has(c.id)
        )
        .map((c) => c.id);
    }
    return [];
  }, [segment, allCustomers, inactiveCustomers]);

  const sendCampaignMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/marketing/campaigns", {
        name: campaignName,
        type: "campaign",
        template: campaignTemplate,
        channel,
        subject: channel !== "sms" ? subject : undefined,
        customerIds: filteredCustomerIds,
        segment,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Campaign sent",
        description: `Sent to ${filteredCustomerIds.length} customer${filteredCustomerIds.length !== 1 ? "s" : ""}`,
      });
      setCampaignName("");
      setCampaignTemplate("");
      setSubject("");
      queryClient.invalidateQueries({
        queryKey: ["/api/marketing/campaigns"],
      });
    },
    onError: (err: Error) => {
      toast({
        title: "Failed to send campaign",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  function selectTemplate(t: CampaignTemplate) {
    setCampaignName(t.name);
    setCampaignTemplate(t.template);
  }

  return (
    <div className="space-y-6">
      {/* Template Gallery */}
      <div>
        <h3 className="text-base font-semibold text-foreground mb-3">
          Template Gallery
        </h3>
        {templates.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map((t) => (
              <Card
                key={t.id}
                className="border-border bg-card hover:bg-muted/50 cursor-pointer transition-colors"
                onClick={() => selectTemplate(t)}
              >
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-foreground text-sm">
                      {t.name}
                    </span>
                    <Badge variant="secondary" className="text-xs">
                      {t.type}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-3">
                    {t.template}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="border-border bg-card">
            <CardContent className="py-8 text-center">
              <Megaphone className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                No templates available yet. Create your first campaign below.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Campaign Editor */}
      <Card className="border-border bg-card">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Megaphone className="h-4 w-4" />
            Campaign Editor
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="Campaign name"
            value={campaignName}
            onChange={(e) => setCampaignName(e.target.value)}
          />

          <Textarea
            placeholder="Write your campaign message..."
            value={campaignTemplate}
            onChange={(e) => setCampaignTemplate(e.target.value)}
            rows={4}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Segment selector */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Target Segment
              </label>
              <Select value={segment} onValueChange={setSegment}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Customers</SelectItem>
                  <SelectItem value="new">New (last 30 days)</SelectItem>
                  <SelectItem value="regular">Regular</SelectItem>
                  <SelectItem value="inactive_90">Inactive (90d+)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {filteredCustomerIds.length} customer
                {filteredCustomerIds.length !== 1 ? "s" : ""} will receive this
              </p>
            </div>

            {/* Channel selector */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Channel
              </label>
              <Select
                value={channel}
                onValueChange={(v) =>
                  setChannel(v as "sms" | "email" | "both")
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sms">SMS</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="both">SMS + Email</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Email subject */}
          {(channel === "email" || channel === "both") && (
            <Input
              placeholder="Email subject line..."
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          )}

          <Button
            onClick={() => sendCampaignMutation.mutate()}
            disabled={
              sendCampaignMutation.isPending ||
              !campaignName.trim() ||
              !campaignTemplate.trim() ||
              filteredCustomerIds.length === 0
            }
          >
            {sendCampaignMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Send Campaign
          </Button>
        </CardContent>
      </Card>

      {/* Campaign History */}
      {campaignHistory.length > 0 && (
        <Card className="border-border bg-card overflow-hidden">
          <CardHeader>
            <CardTitle className="text-base">Campaign History</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="p-3 text-left font-medium text-muted-foreground">
                    Name
                  </th>
                  <th className="p-3 text-left font-medium text-muted-foreground">
                    Type
                  </th>
                  <th className="p-3 text-left font-medium text-muted-foreground">
                    Channel
                  </th>
                  <th className="p-3 text-right font-medium text-muted-foreground">
                    Sent
                  </th>
                  <th className="p-3 text-left font-medium text-muted-foreground">
                    Date
                  </th>
                  <th className="p-3 text-left font-medium text-muted-foreground">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {campaignHistory.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                  >
                    <td className="p-3 font-medium text-foreground">
                      {c.name}
                    </td>
                    <td className="p-3">
                      <Badge variant="secondary" className="text-xs">
                        {c.type}
                      </Badge>
                    </td>
                    <td className="p-3 text-muted-foreground capitalize">
                      {c.channel}
                    </td>
                    <td className="p-3 text-right text-foreground">
                      {c.sentCount}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {formatDate(c.createdAt)}
                    </td>
                    <td className="p-3">
                      <Badge
                        variant="secondary"
                        className={
                          c.status === "sent"
                            ? "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400"
                            : c.status === "failed"
                            ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
                            : "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400"
                        }
                      >
                        {c.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
