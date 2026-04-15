import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Send,
  Star,
  TrendingUp,
  MessageSquare,
  Loader2,
} from "lucide-react";
import { type ReviewStats, formatDate } from "./marketingHelpers";

// ---------------------------------------------------------------------------
// ReviewBoosterTab
// ---------------------------------------------------------------------------

export default function ReviewBoosterTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const { data: stats, isLoading } = useQuery<ReviewStats>({
    queryKey: ["/api/marketing/review-stats"],
  });

  const sendReviewsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/marketing/review-blast", {
        customerIds: Array.from(selectedIds),
      });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Review requests sent",
        description: `Sent to ${selectedIds.size} customer${selectedIds.size !== 1 ? "s" : ""}`,
      });
      setSelectedIds(new Set());
      queryClient.invalidateQueries({
        queryKey: ["/api/marketing/review-stats"],
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <Star className="h-12 w-12 text-muted-foreground/40 mb-4" />
        <h3 className="text-lg font-semibold mb-2">No review data yet</h3>
        <p className="text-sm text-muted-foreground max-w-md">
          Start sending review requests to your customers after completed jobs
          to build your online reputation.
        </p>
      </div>
    );
  }

  const eligible = stats.eligibleCustomers || [];
  const allSelected =
    eligible.length > 0 && selectedIds.size === eligible.length;

  function toggleAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(eligible.map((c) => c.id)));
    }
  }

  function toggleOne(id: number) {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  }

  const totalMessages = stats.smsSent + stats.emailSent;

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-border bg-card">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Requests Sent</p>
                <p className="text-2xl font-bold">{stats.totalRequestsSent}</p>
              </div>
              <div className="p-3 rounded-full bg-blue-100 dark:bg-blue-900/30">
                <Send className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">
                  Click-Through Rate
                </p>
                <p className="text-2xl font-bold">
                  {stats.clickThroughRate.toFixed(1)}%
                </p>
              </div>
              <div className="p-3 rounded-full bg-green-100 dark:bg-green-900/30">
                <TrendingUp className="h-5 w-5 text-green-600 dark:text-green-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">SMS vs Email</p>
                <p className="text-2xl font-bold">
                  {totalMessages > 0
                    ? `${Math.round((stats.smsSent / totalMessages) * 100)}% / ${Math.round((stats.emailSent / totalMessages) * 100)}%`
                    : "0% / 0%"}
                </p>
              </div>
              <div className="p-3 rounded-full bg-purple-100 dark:bg-purple-900/30">
                <MessageSquare className="h-5 w-5 text-purple-600 dark:text-purple-400" />
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {stats.smsSent} SMS / {stats.emailSent} Email
            </p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Top Platform</p>
                <p className="text-2xl font-bold capitalize">
                  {stats.topPlatform || "N/A"}
                </p>
              </div>
              <div className="p-3 rounded-full bg-amber-100 dark:bg-amber-900/30">
                <Star className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Eligible Customers Table */}
      <Card className="border-border bg-card overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">
            Eligible Customers for Review Requests
          </CardTitle>
          {selectedIds.size > 0 && (
            <Button
              size="sm"
              onClick={() => sendReviewsMutation.mutate()}
              disabled={sendReviewsMutation.isPending}
            >
              {sendReviewsMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Star className="h-4 w-4 mr-2" />
              )}
              Send Review Requests ({selectedIds.size})
            </Button>
          )}
        </CardHeader>
        {eligible.length > 0 ? (
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
                    Last Job
                  </th>
                </tr>
              </thead>
              <tbody>
                {eligible.map((c) => (
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
                    <td className="p-3 text-muted-foreground">
                      {c.phone || "---"}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {c.email || "---"}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {formatDate(c.lastJobDate)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <CardContent className="py-8 text-center">
            <Star className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              No eligible customers for review requests right now.
            </p>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
