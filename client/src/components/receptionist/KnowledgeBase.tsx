import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Globe,
  Brain,
  MessageCircleQuestion,
  Plus,
  Trash2,
  Pencil,
  Check,
  X,
  Loader2,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  HelpCircle,
  Send,
} from "lucide-react";

interface KnowledgeBaseProps {
  businessId?: number;
}

interface KnowledgeEntry {
  id: number;
  businessId: number;
  question: string;
  answer: string;
  category: string | null;
  source: string;
  isApproved: boolean;
  priority: number;
  createdAt: string;
  updatedAt: string;
}

interface UnansweredQuestion {
  id: number;
  businessId: number;
  callLogId: number | null;
  question: string;
  context: string | null;
  callerPhone: string | null;
  status: string;
  ownerAnswer: string | null;
  answeredAt: string | null;
  knowledgeEntryId: number | null;
  createdAt: string;
}

interface ScrapeStatus {
  status: string;
  url?: string;
  pagesScraped?: number;
  lastScrapedAt?: string;
  errorMessage?: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  policies: "Policies",
  service_area: "Service Area",
  faq: "FAQ",
  pricing: "Pricing",
  about: "About",
  general: "General",
};

const SOURCE_LABELS: Record<string, string> = {
  website: "Website",
  owner: "Manual",
  unanswered_question: "From Call",
};

export function KnowledgeBase({ businessId }: KnowledgeBaseProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // State for adding new FAQ
  const [isAddingFAQ, setIsAddingFAQ] = useState(false);
  const [newQuestion, setNewQuestion] = useState("");
  const [newAnswer, setNewAnswer] = useState("");
  const [newCategory, setNewCategory] = useState("faq");

  // State for editing
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editQuestion, setEditQuestion] = useState("");
  const [editAnswer, setEditAnswer] = useState("");

  // State for answering unanswered questions
  const [answeringId, setAnsweringId] = useState<number | null>(null);
  const [answerText, setAnswerText] = useState("");

  // Fetch knowledge entries
  const { data: knowledge = [], isLoading: loadingKnowledge } = useQuery<KnowledgeEntry[]>({
    queryKey: ["/api/knowledge"],
    enabled: !!businessId,
  });

  // Fetch unanswered questions
  const { data: unansweredQuestions = [], isLoading: loadingQuestions } = useQuery<UnansweredQuestion[]>({
    queryKey: ["/api/unanswered-questions", { status: "pending" }],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/unanswered-questions?status=pending");
      return res.json();
    },
    enabled: !!businessId,
  });

  // Fetch scrape status
  const { data: scrapeStatus, isLoading: loadingScrape } = useQuery<ScrapeStatus>({
    queryKey: ["/api/knowledge/scrape-status"],
    enabled: !!businessId,
    refetchInterval: (query) => {
      const data = query.state.data as ScrapeStatus | undefined;
      return data?.status === "scraping" ? 3000 : false;
    },
  });

  // Trigger website scrape
  const scrapeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/knowledge/scrape-website");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Website scan started", description: "Scanning your website for knowledge..." });
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge/scrape-status"] });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to start website scan", variant: "destructive" });
    },
  });

  // Create knowledge entry
  const createMutation = useMutation({
    mutationFn: async (data: { question: string; answer: string; category: string }) => {
      const res = await apiRequest("POST", "/api/knowledge", data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "FAQ added", description: "Your AI receptionist will now use this knowledge." });
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge"] });
      setIsAddingFAQ(false);
      setNewQuestion("");
      setNewAnswer("");
      setNewCategory("faq");
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add FAQ entry", variant: "destructive" });
    },
  });

  // Update knowledge entry
  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: { id: number; question?: string; answer?: string }) => {
      const res = await apiRequest("PUT", `/api/knowledge/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Updated", description: "Knowledge entry updated." });
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge"] });
      setEditingId(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update entry", variant: "destructive" });
    },
  });

  // Delete knowledge entry
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("DELETE", `/api/knowledge/${id}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Deleted", description: "Knowledge entry removed." });
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete entry", variant: "destructive" });
    },
  });

  // Answer unanswered question
  const answerMutation = useMutation({
    mutationFn: async ({ id, answer }: { id: number; answer: string }) => {
      const res = await apiRequest("POST", `/api/unanswered-questions/${id}/answer`, { answer });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Answer saved!", description: "Your AI receptionist will now know this answer." });
      queryClient.invalidateQueries({ queryKey: ["/api/unanswered-questions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/unanswered-questions/count"] });
      queryClient.invalidateQueries({ queryKey: ["/api/knowledge"] });
      setAnsweringId(null);
      setAnswerText("");
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to save answer", variant: "destructive" });
    },
  });

  // Dismiss unanswered question
  const dismissMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/unanswered-questions/${id}/dismiss`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/unanswered-questions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/unanswered-questions/count"] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to dismiss question", variant: "destructive" });
    },
  });

  const handleStartEdit = (entry: KnowledgeEntry) => {
    setEditingId(entry.id);
    setEditQuestion(entry.question);
    setEditAnswer(entry.answer);
  };

  const handleSaveEdit = () => {
    if (!editingId || !editQuestion || !editAnswer) return;
    updateMutation.mutate({ id: editingId, question: editQuestion, answer: editAnswer });
  };

  return (
    <div className="space-y-6">
      {/* Section 1: Website Scanner */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-blue-500" />
              <div>
                <CardTitle className="text-lg">Website Scanner</CardTitle>
                <CardDescription>
                  Scan your business website to automatically teach your AI receptionist
                </CardDescription>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Scrape status */}
            {scrapeStatus && scrapeStatus.status !== "none" && (
              <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50">
                {scrapeStatus.status === "scraping" && (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                    <span className="text-sm text-blue-600">Scanning your website...</span>
                  </>
                )}
                {scrapeStatus.status === "completed" && (
                  <>
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <span className="text-sm text-gray-600">
                      Last scanned: {scrapeStatus.lastScrapedAt ? new Date(scrapeStatus.lastScrapedAt).toLocaleDateString() : "Unknown"}
                      {scrapeStatus.pagesScraped ? ` (${scrapeStatus.pagesScraped} pages)` : ""}
                    </span>
                  </>
                )}
                {scrapeStatus.status === "failed" && (
                  <>
                    <AlertCircle className="h-4 w-4 text-red-500" />
                    <span className="text-sm text-red-600">
                      Scan failed: {scrapeStatus.errorMessage || "Unknown error"}
                    </span>
                  </>
                )}
              </div>
            )}

            <div className="flex items-center gap-3">
              <Button
                onClick={() => scrapeMutation.mutate()}
                disabled={scrapeMutation.isPending || scrapeStatus?.status === "scraping"}
                className="gap-2"
              >
                {scrapeMutation.isPending || scrapeStatus?.status === "scraping" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                {scrapeStatus?.status === "completed" ? "Re-scan Website" : "Scan My Website"}
              </Button>
              <p className="text-xs text-gray-500">
                Extracts FAQs, policies, service areas, and more from your website
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Section 2: Unanswered Questions from Calls */}
      {unansweredQuestions.length > 0 && (
        <Card className="border-orange-200">
          <CardHeader className="bg-orange-50 border-b border-orange-200">
            <div className="flex items-center gap-2">
              <MessageCircleQuestion className="h-5 w-5 text-orange-500" />
              <div>
                <CardTitle className="text-lg text-orange-700">
                  Questions Your AI Couldn't Answer ({unansweredQuestions.length})
                </CardTitle>
                <CardDescription className="text-orange-600">
                  Callers asked these questions and the AI didn't have a good answer. Provide an answer to teach your AI!
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-4">
            <div className="space-y-3">
              {unansweredQuestions.map((q) => (
                <div key={q.id} className="p-4 border rounded-lg bg-white">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <HelpCircle className="h-4 w-4 text-orange-500" />
                        <p className="font-medium text-sm">{q.question}</p>
                      </div>
                      {q.context && (
                        <p className="text-xs text-gray-500 italic ml-6 mb-2">
                          Context: "{q.context}"
                        </p>
                      )}
                      {q.callerPhone && (
                        <p className="text-xs text-gray-400 ml-6">
                          Caller: {q.callerPhone}
                        </p>
                      )}
                    </div>
                    {answeringId !== q.id && (
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => {
                            setAnsweringId(q.id);
                            setAnswerText("");
                          }}
                          className="gap-1"
                        >
                          <Send className="h-3 w-3" />
                          Answer
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => dismissMutation.mutate(q.id)}
                          disabled={dismissMutation.isPending}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>

                  {answeringId === q.id && (
                    <div className="mt-3 ml-6 space-y-2">
                      <Textarea
                        placeholder="Type the answer your AI should give callers..."
                        value={answerText}
                        onChange={(e) => setAnswerText(e.target.value)}
                        rows={2}
                        className="text-sm"
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => answerMutation.mutate({ id: q.id, answer: answerText })}
                          disabled={!answerText.trim() || answerMutation.isPending}
                          className="gap-1"
                        >
                          {answerMutation.isPending ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Check className="h-3 w-3" />
                          )}
                          Save Answer
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setAnsweringId(null);
                            setAnswerText("");
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Section 3: Knowledge Base Entries */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-purple-500" />
              <div>
                <CardTitle className="text-lg">Knowledge Base</CardTitle>
                <CardDescription>
                  Everything your AI receptionist knows. Add, edit, or remove entries.
                </CardDescription>
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => setIsAddingFAQ(true)}
              disabled={isAddingFAQ}
              className="gap-1"
            >
              <Plus className="h-4 w-4" />
              Add FAQ
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {/* Add new FAQ form */}
            {isAddingFAQ && (
              <div className="p-4 border-2 border-dashed border-purple-200 rounded-lg bg-purple-50">
                <h4 className="font-medium text-sm mb-3">Add New FAQ</h4>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-gray-600">Question (what a caller might ask)</label>
                    <Input
                      placeholder="e.g., Do you offer free estimates?"
                      value={newQuestion}
                      onChange={(e) => setNewQuestion(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">Answer (what the AI should say)</label>
                    <Textarea
                      placeholder="e.g., Yes! We offer free in-home estimates for all of our services."
                      value={newAnswer}
                      onChange={(e) => setNewAnswer(e.target.value)}
                      rows={2}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-600">Category</label>
                    <Select value={newCategory} onValueChange={setNewCategory}>
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="faq">FAQ</SelectItem>
                        <SelectItem value="policies">Policies</SelectItem>
                        <SelectItem value="pricing">Pricing</SelectItem>
                        <SelectItem value="service_area">Service Area</SelectItem>
                        <SelectItem value="about">About</SelectItem>
                        <SelectItem value="general">General</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => createMutation.mutate({ question: newQuestion, answer: newAnswer, category: newCategory })}
                      disabled={!newQuestion.trim() || !newAnswer.trim() || createMutation.isPending}
                      className="gap-1"
                    >
                      {createMutation.isPending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Check className="h-3 w-3" />
                      )}
                      Add Entry
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setIsAddingFAQ(false);
                        setNewQuestion("");
                        setNewAnswer("");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Knowledge entries list */}
            {loadingKnowledge ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : knowledge.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Brain className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                <p className="font-medium">No knowledge entries yet</p>
                <p className="text-sm mt-1">
                  Scan your website or add FAQs to teach your AI receptionist
                </p>
              </div>
            ) : (
              knowledge.map((entry) => (
                <div key={entry.id} className="p-4 border rounded-lg hover:bg-gray-50 transition-colors">
                  {editingId === entry.id ? (
                    <div className="space-y-2">
                      <Input
                        value={editQuestion}
                        onChange={(e) => setEditQuestion(e.target.value)}
                        className="text-sm"
                      />
                      <Textarea
                        value={editAnswer}
                        onChange={(e) => setEditAnswer(e.target.value)}
                        rows={2}
                        className="text-sm"
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={handleSaveEdit} disabled={updateMutation.isPending} className="gap-1">
                          {updateMutation.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                          Save
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm">Q: {entry.question}</p>
                        <p className="text-sm text-gray-600 mt-1">A: {entry.answer}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant="outline" className="text-xs">
                            {CATEGORY_LABELS[entry.category || "general"] || entry.category}
                          </Badge>
                          <Badge
                            variant="secondary"
                            className={`text-xs ${
                              entry.source === "website"
                                ? "bg-blue-50 text-blue-700"
                                : entry.source === "owner"
                                ? "bg-green-50 text-green-700"
                                : "bg-orange-50 text-orange-700"
                            }`}
                          >
                            {SOURCE_LABELS[entry.source] || entry.source}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => handleStartEdit(entry)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => deleteMutation.mutate(entry.id)}
                          disabled={deleteMutation.isPending}
                          className="text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
