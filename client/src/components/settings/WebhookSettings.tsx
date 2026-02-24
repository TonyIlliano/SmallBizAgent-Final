import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  TestTube,
  ChevronDown,
  ChevronRight,
  Webhook,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WebhookData {
  id: number;
  url: string;
  description?: string;
  events: string[];
  active: boolean;
}

interface DeliveryLog {
  id: number;
  timestamp: string;
  event: string;
  status: "success" | "failed" | "pending";
  responseCode?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusColor(status: string) {
  switch (status) {
    case "success":
      return "bg-green-500/20 text-green-400 border-green-500/30";
    case "failed":
      return "bg-red-500/20 text-red-400 border-red-500/30";
    case "pending":
      return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
    default:
      return "bg-muted text-muted-foreground";
  }
}

const EVENT_COLORS = [
  "bg-blue-500/20 text-blue-400 border-blue-500/30",
  "bg-purple-500/20 text-purple-400 border-purple-500/30",
  "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  "bg-pink-500/20 text-pink-400 border-pink-500/30",
  "bg-orange-500/20 text-orange-400 border-orange-500/30",
  "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  "bg-amber-500/20 text-amber-400 border-amber-500/30",
  "bg-indigo-500/20 text-indigo-400 border-indigo-500/30",
];

function eventColor(event: string) {
  let hash = 0;
  for (let i = 0; i < event.length; i++) {
    hash = event.charCodeAt(i) + ((hash << 5) - hash);
  }
  return EVENT_COLORS[Math.abs(hash) % EVENT_COLORS.length];
}

// ---------------------------------------------------------------------------
// DeliveryLogSection
// ---------------------------------------------------------------------------

function DeliveryLogSection({ webhookId }: { webhookId: number }) {
  const { data: deliveries, isLoading } = useQuery<DeliveryLog[]>({
    queryKey: [`/api/webhooks/${webhookId}/deliveries`],
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!deliveries || deliveries.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-3 text-center">
        No deliveries recorded yet.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="h-8 text-xs">Timestamp</TableHead>
          <TableHead className="h-8 text-xs">Event</TableHead>
          <TableHead className="h-8 text-xs">Status</TableHead>
          <TableHead className="h-8 text-xs">Response</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {deliveries.map((d) => (
          <TableRow key={d.id}>
            <TableCell className="py-1.5 text-xs text-muted-foreground">
              {new Date(d.timestamp).toLocaleString()}
            </TableCell>
            <TableCell className="py-1.5 text-xs font-mono">
              {d.event}
            </TableCell>
            <TableCell className="py-1.5">
              <Badge variant="outline" className={`text-xs ${statusColor(d.status)}`}>
                {d.status}
              </Badge>
            </TableCell>
            <TableCell className="py-1.5 text-xs font-mono text-muted-foreground">
              {d.responseCode ?? "--"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// ---------------------------------------------------------------------------
// WebhookCard
// ---------------------------------------------------------------------------

function WebhookCard({
  webhook,
  onToggle,
  onEdit,
  onDelete,
  onTest,
}: {
  webhook: WebhookData;
  onToggle: (id: number, active: boolean) => void;
  onEdit: (webhook: WebhookData) => void;
  onDelete: (id: number) => void;
  onTest: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        {/* Top row: URL + actions */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p
              className="text-sm font-medium truncate"
              title={webhook.url}
            >
              {webhook.url}
            </p>
            {webhook.description && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {webhook.description}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Switch
              checked={webhook.active}
              onCheckedChange={(checked) => onToggle(webhook.id, checked)}
              aria-label="Toggle webhook active state"
            />
          </div>
        </div>

        {/* Event badges */}
        {webhook.events.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {webhook.events.map((evt) => (
              <Badge
                key={evt}
                variant="outline"
                className={`text-xs ${eventColor(evt)}`}
              >
                {evt}
              </Badge>
            ))}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onTest(webhook.id)}
          >
            <TestTube className="h-3.5 w-3.5 mr-1.5" />
            Test
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onEdit(webhook)}
          >
            <Pencil className="h-3.5 w-3.5 mr-1.5" />
            Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => onDelete(webhook.id)}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            Delete
          </Button>

          <div className="flex-1" />

          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-muted-foreground"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5 mr-1" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 mr-1" />
            )}
            Deliveries
          </Button>
        </div>

        {/* Expandable delivery log */}
        {expanded && (
          <div className="border rounded-md mt-2 overflow-hidden">
            <DeliveryLogSection webhookId={webhook.id} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// WebhookFormDialog
// ---------------------------------------------------------------------------

function WebhookFormDialog({
  open,
  onOpenChange,
  webhook,
  onSubmit,
  isPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  webhook: WebhookData | null;
  onSubmit: (data: { url: string; description: string; events: string[] }) => void;
  isPending: boolean;
}) {
  const [url, setUrl] = useState(webhook?.url ?? "");
  const [description, setDescription] = useState(webhook?.description ?? "");
  const [selectedEvents, setSelectedEvents] = useState<string[]>(webhook?.events ?? []);

  const { data: availableEvents, isLoading: eventsLoading } = useQuery<string[]>({
    queryKey: ["/api/webhooks/events"],
    enabled: open,
  });

  // Reset form when dialog opens with new data
  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) {
      setUrl(webhook?.url ?? "");
      setDescription(webhook?.description ?? "");
      setSelectedEvents(webhook?.events ?? []);
    }
    onOpenChange(nextOpen);
  };

  const toggleEvent = (event: string) => {
    setSelectedEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ url, description, events: selectedEvents });
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{webhook ? "Edit Webhook" : "Add Webhook"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* URL */}
          <div className="space-y-2">
            <Label htmlFor="webhook-url">Endpoint URL</Label>
            <Input
              id="webhook-url"
              type="url"
              placeholder="https://example.com/webhook"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
            />
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="webhook-desc">Description (optional)</Label>
            <Input
              id="webhook-desc"
              placeholder="e.g. Slack notifications"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Events */}
          <div className="space-y-2">
            <Label>Events</Label>
            {eventsLoading ? (
              <div className="flex justify-center py-3">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            ) : availableEvents && availableEvents.length > 0 ? (
              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto rounded-md border p-3">
                {availableEvents.map((evt) => (
                  <label
                    key={evt}
                    className="flex items-center gap-2 text-sm cursor-pointer"
                  >
                    <Checkbox
                      checked={selectedEvents.includes(evt)}
                      onCheckedChange={() => toggleEvent(evt)}
                    />
                    <span className="truncate">{evt}</span>
                  </label>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No events available.</p>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={isPending || !url}>
            {isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : webhook ? (
              "Update Webhook"
            ) : (
              "Create Webhook"
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// WebhookSettings (main export)
// ---------------------------------------------------------------------------

export default function WebhookSettings({ businessId }: { businessId: number }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState<WebhookData | null>(null);

  // ---- Queries ----
  const { data: webhooks, isLoading } = useQuery<WebhookData[]>({
    queryKey: ["/api/webhooks"],
  });

  // ---- Mutations ----
  const createMutation = useMutation({
    mutationFn: async (data: { url: string; description: string; events: string[] }) => {
      const res = await apiRequest("POST", "/api/webhooks", { ...data, businessId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/webhooks"] });
      toast({ title: "Webhook created", description: "Your webhook has been added." });
      setDialogOpen(false);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to create webhook.", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      ...data
    }: { id: number; url: string; description: string; events: string[] }) => {
      const res = await apiRequest("PUT", `/api/webhooks/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/webhooks"] });
      toast({ title: "Webhook updated", description: "Changes have been saved." });
      setDialogOpen(false);
      setEditingWebhook(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update webhook.", variant: "destructive" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, active }: { id: number; active: boolean }) => {
      const res = await apiRequest("PUT", `/api/webhooks/${id}`, { active });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/webhooks"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to toggle webhook.", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/webhooks/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/webhooks"] });
      toast({ title: "Webhook deleted", description: "The webhook has been removed." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete webhook.", variant: "destructive" });
    },
  });

  const testMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/webhooks/${id}/test`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Test sent", description: "A test event has been dispatched." });
      // Refresh deliveries that may be expanded
      queryClient.invalidateQueries({ queryKey: ["/api/webhooks"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Test delivery failed.", variant: "destructive" });
    },
  });

  // ---- Handlers ----
  const handleFormSubmit = (data: { url: string; description: string; events: string[] }) => {
    if (editingWebhook) {
      updateMutation.mutate({ id: editingWebhook.id, ...data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (webhook: WebhookData) => {
    setEditingWebhook(webhook);
    setDialogOpen(true);
  };

  const handleAddNew = () => {
    setEditingWebhook(null);
    setDialogOpen(true);
  };

  // ---- Render ----
  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Webhook className="h-5 w-5" />
              <div>
                <CardTitle>Webhooks</CardTitle>
                <CardDescription>
                  Send real-time notifications to external services when events occur in your account.
                </CardDescription>
              </div>
            </div>
            <Button size="sm" onClick={handleAddNew}>
              <Plus className="h-4 w-4 mr-1.5" />
              Add Webhook
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* Webhook list */}
      {webhooks && webhooks.length > 0 ? (
        <div className="space-y-3">
          {webhooks.map((wh) => (
            <WebhookCard
              key={wh.id}
              webhook={wh}
              onToggle={(id, active) => toggleMutation.mutate({ id, active })}
              onEdit={handleEdit}
              onDelete={(id) => deleteMutation.mutate(id)}
              onTest={(id) => testMutation.mutate(id)}
            />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Webhook className="h-10 w-10 text-muted-foreground mb-3" />
            <h3 className="font-semibold text-lg mb-1">No Webhooks Configured</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              Create a webhook to start receiving real-time event notifications at your endpoint.
            </p>
            <Button className="mt-4" size="sm" onClick={handleAddNew}>
              <Plus className="h-4 w-4 mr-1.5" />
              Add Your First Webhook
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Add / Edit dialog */}
      <WebhookFormDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditingWebhook(null);
        }}
        webhook={editingWebhook}
        onSubmit={handleFormSubmit}
        isPending={createMutation.isPending || updateMutation.isPending}
      />
    </div>
  );
}

export { WebhookSettings };
