import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Workflow,
  Plus,
  Play,
  Pause,
  Trash2,
  Edit,
  Clock,
  MessageSquare,
  Loader2,
  Package,
  X,
  Download,
  Zap,
} from "lucide-react";

// ── Types ──

interface WorkflowStep {
  type: "wait" | "send_sms";
  config: {
    delayMinutes?: number;
    messageType?: string;
    messagePrompt?: string;
  };
}

interface WorkflowData {
  id: number;
  businessId: number;
  name: string;
  description: string | null;
  triggerEvent: string;
  status: string;
  steps: WorkflowStep[];
  templateId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  triggerEvent: string;
  steps: WorkflowStep[];
}

// ── Constants ──

const TRIGGER_EVENTS: Record<string, string> = {
  "appointment.completed": "Appointment Completed",
  "appointment.no_show": "Appointment No-Show",
  "job.completed": "Job Completed",
  "invoice.overdue": "Invoice Overdue",
  "invoice.paid": "Invoice Paid",
  "manual": "Manual Trigger",
};

const MESSAGE_TYPES: Record<string, string> = {
  FOLLOW_UP_THANK_YOU: "Thank You",
  FOLLOW_UP_UPSELL: "Upsell / Rebooking Offer",
  REVIEW_REQUEST: "Review Request",
  NO_SHOW_FOLLOWUP: "No-Show Follow-Up",
  REBOOKING_NUDGE: "Rebooking Nudge",
  INVOICE_COLLECTION_REMINDER: "Invoice Reminder",
  INVOICE_COLLECTION_FINAL: "Invoice Final Notice",
  ESTIMATE_FOLLOWUP: "Estimate Follow-Up",
  WIN_BACK: "Win-Back Message",
};

const STATUS_VARIANTS: Record<string, "secondary" | "success" | "warning"> = {
  draft: "secondary",
  active: "success",
  paused: "warning",
};

// ── Helpers ──

function formatDelay(minutes: number): { value: number; unit: string } {
  if (minutes >= 1440 && minutes % 1440 === 0) {
    return { value: minutes / 1440, unit: "days" };
  }
  if (minutes >= 60 && minutes % 60 === 0) {
    return { value: minutes / 60, unit: "hours" };
  }
  return { value: minutes, unit: "minutes" };
}

function toMinutes(value: number, unit: string): number {
  if (unit === "days") return value * 1440;
  if (unit === "hours") return value * 60;
  return value;
}

function formatDelayLabel(minutes: number): string {
  const { value, unit } = formatDelay(minutes);
  return `${value} ${unit}`;
}

// ── Template Install Dialog ──

function TemplateInstallDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: templates = [], isLoading } = useQuery<WorkflowTemplate[]>({
    queryKey: ["/api/workflows/templates"],
    enabled: open,
  });

  const installMutation = useMutation({
    mutationFn: async (templateId: string) => {
      const res = await apiRequest("POST", "/api/workflows/install-template", { templateId });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "Template installed", description: `"${data.name}" has been added as a draft workflow.` });
      queryClient.invalidateQueries({ queryKey: ["/api/workflows"] });
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "Failed to install template", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Install Workflow Template
          </DialogTitle>
          <DialogDescription>
            Choose a pre-built workflow to get started quickly. You can customize it after installation.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-3 mt-2">
            {templates.map((template) => (
              <Card key={template.id} className="border-border">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-semibold text-foreground">{template.name}</h4>
                      <p className="text-xs text-muted-foreground mt-1">{template.description}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <Badge variant="outline" className="text-xs">
                          <Zap className="h-3 w-3 mr-1" />
                          {TRIGGER_EVENTS[template.triggerEvent] || template.triggerEvent}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {template.steps.length} steps
                        </span>
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => installMutation.mutate(template.id)}
                      disabled={installMutation.isPending}
                    >
                      {installMutation.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                      ) : (
                        <Download className="h-3.5 w-3.5 mr-1" />
                      )}
                      Install
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
            {templates.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-8">
                No templates available.
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Step Editor Row ──

function StepEditorRow({
  step,
  index,
  onChange,
  onRemove,
}: {
  step: WorkflowStep;
  index: number;
  onChange: (updated: WorkflowStep) => void;
  onRemove: () => void;
}) {
  const delay = step.type === "wait" ? formatDelay(step.config.delayMinutes || 60) : { value: 60, unit: "minutes" };

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg border border-border bg-muted/30">
      <div className="flex items-center justify-center w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0 mt-1">
        {index + 1}
      </div>

      <div className="flex-1 space-y-2">
        <Select
          value={step.type}
          onValueChange={(value: "wait" | "send_sms") => {
            if (value === "wait") {
              onChange({ type: "wait", config: { delayMinutes: 60 } });
            } else {
              onChange({ type: "send_sms", config: { messageType: "FOLLOW_UP_THANK_YOU" } });
            }
          }}
        >
          <SelectTrigger className="w-full h-8 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="wait">
              <span className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" /> Wait
              </span>
            </SelectItem>
            <SelectItem value="send_sms">
              <span className="flex items-center gap-1.5">
                <MessageSquare className="h-3.5 w-3.5" /> Send SMS
              </span>
            </SelectItem>
          </SelectContent>
        </Select>

        {step.type === "wait" && (
          <div className="flex items-center gap-2">
            <Input
              type="number"
              min={1}
              className="w-20 h-8 text-sm"
              value={delay.value}
              onChange={(e) => {
                const val = parseInt(e.target.value) || 1;
                onChange({
                  type: "wait",
                  config: { delayMinutes: toMinutes(val, delay.unit) },
                });
              }}
            />
            <Select
              value={delay.unit}
              onValueChange={(unit) => {
                onChange({
                  type: "wait",
                  config: { delayMinutes: toMinutes(delay.value, unit) },
                });
              }}
            >
              <SelectTrigger className="w-28 h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="minutes">Minutes</SelectItem>
                <SelectItem value="hours">Hours</SelectItem>
                <SelectItem value="days">Days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {step.type === "send_sms" && (
          <Select
            value={step.config.messageType || "FOLLOW_UP_THANK_YOU"}
            onValueChange={(messageType) => {
              onChange({
                type: "send_sms",
                config: { ...step.config, messageType },
              });
            }}
          >
            <SelectTrigger className="w-full h-8 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(MESSAGE_TYPES).map(([key, label]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0 shrink-0 text-muted-foreground hover:text-destructive"
        onClick={onRemove}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

// ── Workflow Editor Dialog ──

function WorkflowEditorDialog({
  open,
  workflow,
  onClose,
}: {
  open: boolean;
  workflow: WorkflowData | null; // null = creating new
  onClose: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isEditing = workflow !== null;

  const [name, setName] = useState(workflow?.name || "");
  const [description, setDescription] = useState(workflow?.description || "");
  const [triggerEvent, setTriggerEvent] = useState(workflow?.triggerEvent || "appointment.completed");
  const [steps, setSteps] = useState<WorkflowStep[]>(
    workflow?.steps?.length ? workflow.steps : [{ type: "wait", config: { delayMinutes: 120 } }]
  );

  // Reset form when workflow changes
  const workflowId = workflow?.id;
  const [lastWorkflowId, setLastWorkflowId] = useState<number | undefined>(workflowId);
  if (workflowId !== lastWorkflowId) {
    setLastWorkflowId(workflowId);
    setName(workflow?.name || "");
    setDescription(workflow?.description || "");
    setTriggerEvent(workflow?.triggerEvent || "appointment.completed");
    setSteps(workflow?.steps?.length ? workflow.steps : [{ type: "wait", config: { delayMinutes: 120 } }]);
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = { name, description: description || undefined, triggerEvent, steps };
      if (isEditing) {
        const res = await apiRequest("PUT", `/api/workflows/${workflow.id}`, body);
        return res.json();
      } else {
        const res = await apiRequest("POST", "/api/workflows", body);
        return res.json();
      }
    },
    onSuccess: () => {
      toast({ title: isEditing ? "Workflow updated" : "Workflow created" });
      queryClient.invalidateQueries({ queryKey: ["/api/workflows"] });
      onClose();
    },
    onError: (err: Error) => {
      toast({ title: "Failed to save workflow", description: err.message, variant: "destructive" });
    },
  });

  const handleStepChange = (index: number, updated: WorkflowStep) => {
    setSteps((prev) => prev.map((s, i) => (i === index ? updated : s)));
  };

  const handleRemoveStep = (index: number) => {
    setSteps((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddStep = () => {
    setSteps((prev) => [...prev, { type: "wait", config: { delayMinutes: 60 } }]);
  };

  const canSave = name.trim().length > 0 && steps.length > 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Workflow className="h-5 w-5" />
            {isEditing ? "Edit Workflow" : "New Workflow"}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? "Update this workflow's trigger, steps, and settings."
              : "Define a trigger event and a sequence of steps to automate your follow-ups."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Name</label>
            <Input
              placeholder="e.g. Post-Appointment Follow-Up"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Description</label>
            <Textarea
              placeholder="What does this workflow do?"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          {/* Trigger Event */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Trigger Event</label>
            <Select value={triggerEvent} onValueChange={setTriggerEvent}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TRIGGER_EVENTS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Steps */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Steps</label>
            <div className="space-y-2">
              {steps.map((step, i) => (
                <StepEditorRow
                  key={i}
                  step={step}
                  index={i}
                  onChange={(updated) => handleStepChange(i, updated)}
                  onRemove={() => handleRemoveStep(i)}
                />
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full mt-2"
              onClick={handleAddStep}
            >
              <Plus className="h-3.5 w-3.5 mr-1" />
              Add Step
            </Button>
          </div>

          {/* Save */}
          <Button
            className="w-full"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !canSave}
          >
            {saveMutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {isEditing ? "Save Changes" : "Create Workflow"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Workflow Card ──

function WorkflowCard({
  workflow,
  onEdit,
  onDelete,
  onActivate,
  onPause,
  isActioning,
}: {
  workflow: WorkflowData;
  onEdit: () => void;
  onDelete: () => void;
  onActivate: () => void;
  onPause: () => void;
  isActioning: boolean;
}) {
  const steps = (workflow.steps || []) as WorkflowStep[];
  const smsSteps = steps.filter((s) => s.type === "send_sms").length;
  const waitSteps = steps.filter((s) => s.type === "wait").length;

  return (
    <Card className="border-border bg-card">
      <CardContent className="pt-6 space-y-3">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-foreground truncate">{workflow.name}</h3>
              <Badge variant={STATUS_VARIANTS[workflow.status] || "secondary"} className="capitalize shrink-0">
                {workflow.status}
              </Badge>
            </div>
            {workflow.description && (
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{workflow.description}</p>
            )}
          </div>
        </div>

        {/* Trigger + step summary */}
        <div className="flex items-center gap-3 flex-wrap">
          <Badge variant="outline" className="text-xs">
            <Zap className="h-3 w-3 mr-1" />
            {TRIGGER_EVENTS[workflow.triggerEvent] || workflow.triggerEvent}
          </Badge>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <MessageSquare className="h-3 w-3" />
            {smsSteps} message{smsSteps !== 1 ? "s" : ""}
          </span>
          <span className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {waitSteps} delay{waitSteps !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Step preview */}
        <div className="text-xs text-muted-foreground bg-muted/50 rounded-md p-2 space-y-1">
          {steps.slice(0, 4).map((step, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span className="text-primary font-medium">{i + 1}.</span>
              {step.type === "wait" ? (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Wait {formatDelayLabel(step.config.delayMinutes || 0)}
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <MessageSquare className="h-3 w-3" />
                  {MESSAGE_TYPES[step.config.messageType || ""] || step.config.messageType || "SMS"}
                </span>
              )}
            </div>
          ))}
          {steps.length > 4 && (
            <div className="text-muted-foreground/60">+{steps.length - 4} more steps</div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1">
          <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={onEdit}>
            <Edit className="h-3 w-3" />
            Edit
          </Button>
          {workflow.status === "active" ? (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={onPause}
              disabled={isActioning}
            >
              {isActioning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Pause className="h-3 w-3" />}
              Pause
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={onActivate}
              disabled={isActioning}
            >
              {isActioning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
              Activate
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1 ml-auto text-muted-foreground hover:text-destructive"
            onClick={onDelete}
            disabled={isActioning}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Main Component ──

export function WorkflowsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [showTemplates, setShowTemplates] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<WorkflowData | null>(null);
  const [actioningId, setActioningId] = useState<number | null>(null);

  const { data: workflows = [], isLoading } = useQuery<WorkflowData[]>({
    queryKey: ["/api/workflows"],
  });

  const activateMutation = useMutation({
    mutationFn: async (id: number) => {
      setActioningId(id);
      const res = await apiRequest("POST", `/api/workflows/${id}/activate`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Workflow activated" });
      queryClient.invalidateQueries({ queryKey: ["/api/workflows"] });
      setActioningId(null);
    },
    onError: (err: Error) => {
      toast({ title: "Failed to activate", description: err.message, variant: "destructive" });
      setActioningId(null);
    },
  });

  const pauseMutation = useMutation({
    mutationFn: async (id: number) => {
      setActioningId(id);
      const res = await apiRequest("POST", `/api/workflows/${id}/pause`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Workflow paused" });
      queryClient.invalidateQueries({ queryKey: ["/api/workflows"] });
      setActioningId(null);
    },
    onError: (err: Error) => {
      toast({ title: "Failed to pause", description: err.message, variant: "destructive" });
      setActioningId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      setActioningId(id);
      const res = await apiRequest("DELETE", `/api/workflows/${id}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Workflow deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/workflows"] });
      setActioningId(null);
    },
    onError: (err: Error) => {
      toast({ title: "Failed to delete", description: err.message, variant: "destructive" });
      setActioningId(null);
    },
  });

  const handleEdit = (workflow: WorkflowData) => {
    setEditingWorkflow(workflow);
    setEditorOpen(true);
  };

  const handleNew = () => {
    setEditingWorkflow(null);
    setEditorOpen(true);
  };

  const handleEditorClose = () => {
    setEditorOpen(false);
    setEditingWorkflow(null);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Workflows</h3>
          <p className="text-sm text-muted-foreground">
            Multi-step automation sequences triggered by events in your business.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowTemplates(true)}>
            <Package className="h-4 w-4 mr-1.5" />
            Install Template
          </Button>
          <Button size="sm" onClick={handleNew}>
            <Plus className="h-4 w-4 mr-1.5" />
            New Workflow
          </Button>
        </div>
      </div>

      {/* Workflow grid */}
      {workflows.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12">
            <div className="text-center space-y-3">
              <Workflow className="h-10 w-10 mx-auto text-muted-foreground/40" />
              <div>
                <p className="text-sm font-medium text-foreground">No workflows yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Create a custom workflow or install a template to automate your follow-ups.
                </p>
              </div>
              <div className="flex items-center justify-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowTemplates(true)}>
                  <Package className="h-4 w-4 mr-1.5" />
                  Install Template
                </Button>
                <Button size="sm" onClick={handleNew}>
                  <Plus className="h-4 w-4 mr-1.5" />
                  New Workflow
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {workflows.map((wf) => (
            <WorkflowCard
              key={wf.id}
              workflow={wf}
              onEdit={() => handleEdit(wf)}
              onDelete={() => deleteMutation.mutate(wf.id)}
              onActivate={() => activateMutation.mutate(wf.id)}
              onPause={() => pauseMutation.mutate(wf.id)}
              isActioning={actioningId === wf.id}
            />
          ))}
        </div>
      )}

      {/* Dialogs */}
      <TemplateInstallDialog open={showTemplates} onClose={() => setShowTemplates(false)} />
      <WorkflowEditorDialog
        open={editorOpen}
        workflow={editingWorkflow}
        onClose={handleEditorClose}
      />
    </div>
  );
}
