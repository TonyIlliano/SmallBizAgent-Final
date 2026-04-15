import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { formatCurrency } from "@/lib/utils";
import {
  Send,
  UserX,
  Mail,
  MessageSquare,
  Loader2,
} from "lucide-react";
import { type InactiveCustomer, formatDate } from "./marketingHelpers";

// ---------------------------------------------------------------------------
// WinBackTab
// ---------------------------------------------------------------------------

export default function WinBackTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [days, setDays] = useState("90");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [template, setTemplate] = useState(
    "Hi {firstName}, we haven't seen you in {daysSinceVisit} days! We'd love to welcome you back to {businessName}. Reply STOP to opt out."
  );
  const [channel, setChannel] = useState<"sms" | "email" | "both">("sms");
  const [subject, setSubject] = useState("We miss you!");

  const { data: customers = [], isLoading } = useQuery<InactiveCustomer[]>({
    queryKey: ["/api/marketing/inactive-customers", { days }],
  });

  const winBackMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/marketing/win-back", {
        customerIds: Array.from(selectedIds),
        template,
        channel,
        subject: channel !== "sms" ? subject : undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Campaign sent",
        description: `Sent to ${selectedIds.size} customer${selectedIds.size !== 1 ? "s" : ""}`,
      });
      setSelectedIds(new Set());
      queryClient.invalidateQueries({
        queryKey: ["/api/marketing/inactive-customers"],
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

  const allSelected =
    customers.length > 0 && selectedIds.size === customers.length;

  function toggleAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(customers.map((c) => c.id)));
    }
  }

  function toggleOne(id: number) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  }

  return (
    <div className="space-y-6">
      {/* Filter */}
      <div className="flex items-center gap-4">
        <label className="text-sm font-medium text-foreground">
          Inactive for
        </label>
        <Select value={days} onValueChange={setDays}>
          <SelectTrigger className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="60">60 days</SelectItem>
            <SelectItem value="90">90 days</SelectItem>
            <SelectItem value="180">180 days</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground">
          {customers.length} customer{customers.length !== 1 ? "s" : ""} found
        </span>
      </div>

      {/* Customer table */}
      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : customers.length === 0 ? (
        <Card className="border-border bg-card">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <UserX className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm text-muted-foreground">
              No inactive customers for this time range.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="p-3 text-left">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={toggleAll}
                    />
                  </th>
                  <th className="p-3 text-left font-medium text-muted-foreground">
                    Name
                  </th>
                  <th className="p-3 text-left font-medium text-muted-foreground">
                    Phone
                  </th>
                  <th className="p-3 text-left font-medium text-muted-foreground">
                    Email
                  </th>
                  <th className="p-3 text-left font-medium text-muted-foreground">
                    Last Activity
                  </th>
                  <th className="p-3 text-right font-medium text-muted-foreground">
                    Revenue
                  </th>
                  <th className="p-3 text-right font-medium text-muted-foreground">
                    Days Away
                  </th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                  >
                    <td className="p-3">
                      <Checkbox
                        checked={selectedIds.has(c.id)}
                        onCheckedChange={() => toggleOne(c.id)}
                      />
                    </td>
                    <td className="p-3 font-medium text-foreground">
                      {c.firstName} {c.lastName}
                    </td>
                    <td className="p-3 text-muted-foreground">{c.phone || "---"}</td>
                    <td className="p-3 text-muted-foreground">{c.email || "---"}</td>
                    <td className="p-3 text-muted-foreground">
                      {formatDate(c.lastActivityDate)}
                    </td>
                    <td className="p-3 text-right font-medium text-foreground">
                      {formatCurrency(c.lifetimeRevenue)}
                    </td>
                    <td className="p-3 text-right">
                      <Badge
                        variant="secondary"
                        className={
                          c.daysSinceVisit > 180
                            ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
                            : c.daysSinceVisit > 90
                            ? "bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400"
                            : "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400"
                        }
                      >
                        {c.daysSinceVisit}d
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Campaign panel */}
      {selectedIds.size > 0 && (
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Send className="h-4 w-4" />
              Send Win-Back Campaign ({selectedIds.size} selected)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Variable chips */}
            <div className="flex flex-wrap gap-2">
              <span className="text-xs text-muted-foreground">
                Variables:
              </span>
              {["{firstName}", "{businessName}", "{daysSinceVisit}"].map(
                (chip) => (
                  <Badge
                    key={chip}
                    variant="outline"
                    className="cursor-pointer hover:bg-muted"
                    onClick={() =>
                      setTemplate((prev) => prev + " " + chip)
                    }
                  >
                    {chip}
                  </Badge>
                )
              )}
            </div>

            <Textarea
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
              rows={4}
              placeholder="Enter your win-back message..."
            />

            {/* Channel selector */}
            <div className="flex items-center gap-4">
              <span className="text-sm font-medium text-foreground">
                Channel:
              </span>
              <div className="flex gap-2">
                {(["sms", "email", "both"] as const).map((ch) => (
                  <Button
                    key={ch}
                    size="sm"
                    variant={channel === ch ? "default" : "outline"}
                    onClick={() => setChannel(ch)}
                    className="capitalize"
                  >
                    {ch === "sms" && (
                      <MessageSquare className="h-3.5 w-3.5 mr-1" />
                    )}
                    {ch === "email" && <Mail className="h-3.5 w-3.5 mr-1" />}
                    {ch === "both" && <Send className="h-3.5 w-3.5 mr-1" />}
                    {ch === "both" ? "SMS + Email" : ch.toUpperCase()}
                  </Button>
                ))}
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
              onClick={() => winBackMutation.mutate()}
              disabled={winBackMutation.isPending || !template.trim()}
            >
              {winBackMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Send Campaign
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
