import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Sparkles, Check, X, Pencil, Loader2, AlertTriangle, ShieldAlert } from "lucide-react";

interface WeeklySuggestionsProps {
  businessId?: number;
  aiInsightsEnabled?: boolean;
  hasRecordingDisclosure?: boolean; // deprecated — kept for backward compat, use callRecordingEnabled
  callRecordingEnabled?: boolean;
}

interface Suggestion {
  id: number;
  businessId: number;
  weekStart: string;
  type: string;
  title: string;
  description: string;
  currentValue: string | null;
  suggestedValue: string | null;
  occurrenceCount: number;
  riskLevel: string;
  status: string;
  acceptedAt: string | null;
  createdAt: string;
}

const typeLabel = (type: string) => {
  switch (type) {
    case "NEW_FAQ": return "New FAQ";
    case "UPDATE_GREETING": return "Greeting";
    case "UPDATE_INSTRUCTIONS": return "Instructions";
    case "UPDATE_AFTER_HOURS": return "After Hours";
    case "ADD_EMERGENCY_KEYWORD": return "Emergency";
    case "GENERAL_INSIGHT": return "Insight";
    default: return type;
  }
};

const typeBadgeClass = (type: string) => {
  switch (type) {
    case "NEW_FAQ": return "bg-blue-100 text-blue-800 hover:bg-blue-100";
    case "UPDATE_GREETING": return "bg-purple-100 text-purple-800 hover:bg-purple-100";
    case "UPDATE_INSTRUCTIONS": return "bg-purple-100 text-purple-800 hover:bg-purple-100";
    case "UPDATE_AFTER_HOURS": return "bg-indigo-100 text-indigo-800 hover:bg-indigo-100";
    case "ADD_EMERGENCY_KEYWORD": return "bg-red-100 text-red-800 hover:bg-red-100";
    case "GENERAL_INSIGHT": return "bg-gray-100 text-gray-800 hover:bg-gray-100";
    default: return "";
  }
};

function formatSuggestedValue(type: string, value: string | null): string {
  if (!value) return "";
  if (type === "NEW_FAQ") {
    try {
      const faq = JSON.parse(value);
      return `Q: ${faq.question}\nA: ${faq.answer}`;
    } catch {
      return value;
    }
  }
  return value;
}

export function WeeklySuggestions({ businessId, aiInsightsEnabled, hasRecordingDisclosure, callRecordingEnabled }: WeeklySuggestionsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");

  // Fetch suggestions
  const { data: suggestions = [], isLoading } = useQuery<Suggestion[]>({
    queryKey: ["/api/receptionist/suggestions"],
    enabled: !!businessId && aiInsightsEnabled === true,
  });

  // Fetch counts
  const { data: countData } = useQuery<{ count: number; acceptedCount: number }>({
    queryKey: ["/api/receptionist/suggestions/count"],
    enabled: !!businessId,
  });

  // Accept mutation
  const acceptMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/receptionist/suggestions/${id}/accept`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/receptionist/suggestions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/receptionist/suggestions/count"] });
      toast({ title: "Suggestion applied", description: "Your AI receptionist has been updated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to apply suggestion.", variant: "destructive" });
    },
  });

  // Dismiss mutation
  const dismissMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/receptionist/suggestions/${id}/dismiss`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/receptionist/suggestions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/receptionist/suggestions/count"] });
      toast({ title: "Suggestion dismissed" });
    },
  });

  // Edit + accept mutation
  const editMutation = useMutation({
    mutationFn: ({ id, editedValue }: { id: number; editedValue: string }) =>
      apiRequest("POST", `/api/receptionist/suggestions/${id}/edit`, { editedValue }),
    onSuccess: () => {
      setEditingId(null);
      setEditValue("");
      queryClient.invalidateQueries({ queryKey: ["/api/receptionist/suggestions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/receptionist/suggestions/count"] });
      toast({ title: "Edited suggestion applied", description: "Your AI receptionist has been updated." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to apply edited suggestion.", variant: "destructive" });
    },
  });

  // Disabled state: not enabled
  if (!aiInsightsEnabled) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Sparkles className="h-12 w-12 text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-500">AI Insights Disabled</h3>
          <p className="text-sm text-gray-400 mt-1 text-center max-w-md">
            Enable AI Insights in the <strong>Configuration</strong> tab to let your AI receptionist
            analyze calls weekly and suggest improvements automatically.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Disabled state: Call Recording must be enabled for AI Insights
  const recordingActive = callRecordingEnabled ?? hasRecordingDisclosure ?? false;
  if (!recordingActive) {
    return (
      <Card className="border-amber-200">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <ShieldAlert className="h-12 w-12 text-amber-400 mb-4" />
          <h3 className="text-lg font-medium text-amber-700">Call Recording Required</h3>
          <p className="text-sm text-gray-500 mt-1 text-center max-w-md">
            AI Insights requires Call Recording to be enabled. Turn on Call Recording in the
            <strong> Configuration</strong> tab — the recording disclosure will be added to your greeting automatically.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </CardContent>
      </Card>
    );
  }

  const pendingSuggestions = suggestions.filter(s => s.status === "pending");
  const processedSuggestions = suggestions.filter(s => s.status !== "pending");

  // Empty state
  if (suggestions.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Sparkles className="h-12 w-12 text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-500">No AI Insights Yet</h3>
          <p className="text-sm text-gray-400 mt-1 text-center max-w-md">
            Your AI receptionist will analyze call patterns weekly and suggest improvements.
            Insights will appear here after your first week of calls.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Card */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Sparkles className="h-5 w-5 text-amber-500" />
              <span className="font-medium">
                {pendingSuggestions.length} suggestion{pendingSuggestions.length !== 1 ? "s" : ""} to review
              </span>
            </div>
            <span className="text-sm text-gray-500">
              {countData?.acceptedCount || 0} accepted all-time
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Pending Suggestions */}
      {pendingSuggestions.map(suggestion => (
        <Card key={suggestion.id} className="border-l-4 border-l-amber-400">
          <CardContent className="p-4 space-y-3">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className={typeBadgeClass(suggestion.type)}>
                  {typeLabel(suggestion.type)}
                </Badge>
                <Badge variant={suggestion.riskLevel === "high" ? "destructive" : "outline"} className={suggestion.riskLevel === "low" ? "bg-green-50 text-green-700 border-green-200" : ""}>
                  {suggestion.riskLevel === "high" ? (
                    <><AlertTriangle className="h-3 w-3 mr-1" /> HIGH risk</>
                  ) : "LOW risk"}
                </Badge>
                {suggestion.occurrenceCount > 1 && (
                  <span className="text-xs text-gray-500">
                    Seen {suggestion.occurrenceCount}x this week
                  </span>
                )}
              </div>
            </div>

            {/* Title + description */}
            <div>
              <h4 className="font-medium">{suggestion.title}</h4>
              <p className="text-sm text-gray-600 mt-1">{suggestion.description}</p>
            </div>

            {/* Current vs Suggested diff */}
            {suggestion.currentValue && (
              <div className="bg-red-50 p-3 rounded-md text-sm">
                <span className="font-medium text-red-700">Current: </span>
                <span className="text-red-600">{suggestion.currentValue}</span>
              </div>
            )}
            {suggestion.suggestedValue && (
              <div className="bg-green-50 p-3 rounded-md text-sm">
                <span className="font-medium text-green-700">Suggested: </span>
                <span className="text-green-600 whitespace-pre-wrap">
                  {formatSuggestedValue(suggestion.type, suggestion.suggestedValue)}
                </span>
              </div>
            )}

            {/* Edit mode */}
            {editingId === suggestion.id && (
              <div className="space-y-2">
                <Textarea
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  rows={4}
                  placeholder="Edit the suggested value..."
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => editMutation.mutate({ id: suggestion.id, editedValue: editValue })}
                    disabled={editMutation.isPending}
                  >
                    {editMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Check className="h-3.5 w-3.5 mr-1" />}
                    Save & Apply
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { setEditingId(null); setEditValue(""); }}>
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {/* Action buttons */}
            {editingId !== suggestion.id && (
              <div className="flex gap-2 pt-1">
                {suggestion.type !== "GENERAL_INSIGHT" && (
                  <Button
                    size="sm"
                    onClick={() => acceptMutation.mutate(suggestion.id)}
                    disabled={acceptMutation.isPending}
                  >
                    {acceptMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Check className="h-3.5 w-3.5 mr-1" />}
                    Accept
                  </Button>
                )}
                {suggestion.suggestedValue && suggestion.type !== "GENERAL_INSIGHT" && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditingId(suggestion.id);
                      setEditValue(formatSuggestedValue(suggestion.type, suggestion.suggestedValue));
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => dismissMutation.mutate(suggestion.id)}
                  disabled={dismissMutation.isPending}
                >
                  <X className="h-3.5 w-3.5 mr-1" /> Dismiss
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ))}

      {/* Past suggestions (collapsed) */}
      {processedSuggestions.length > 0 && (
        <Accordion type="single" collapsible>
          <AccordionItem value="history">
            <AccordionTrigger className="text-sm text-gray-500">
              Past suggestions ({processedSuggestions.length})
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-2">
                {processedSuggestions.map(s => (
                  <div key={s.id} className="flex items-center justify-between py-2 border-b last:border-0">
                    <div className="flex items-center gap-2">
                      <Badge className={typeBadgeClass(s.type) + " text-[10px]"}>
                        {typeLabel(s.type)}
                      </Badge>
                      <span className="text-sm text-gray-600">{s.title}</span>
                    </div>
                    <Badge
                      variant="outline"
                      className={
                        s.status === "accepted" || s.status === "edited"
                          ? "bg-green-50 text-green-700 border-green-200"
                          : "bg-gray-50 text-gray-500"
                      }
                    >
                      {s.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}
    </div>
  );
}
