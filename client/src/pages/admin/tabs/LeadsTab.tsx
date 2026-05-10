/**
 * LeadsTab — admin-only lead discovery UI.
 *
 * Sections:
 *   A. Run controls — region/industry select, dry-run, Start Scan, spend meter, active rubric
 *   B. Leads table — paginated, filterable, sortable
 *   C. Recent runs — last 5 runs collapsible
 *   D. "Agent is learning" rubric history — last 10 versions with refinement summaries
 */

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
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
import { useToast } from "@/hooks/use-toast";
import {
  Loader2, Target, Star, Phone, ExternalLink, RefreshCw, Sparkles, ChevronDown, ChevronUp,
  Search,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────

interface Lead {
  id: number;
  businessName: string;
  industry: string;
  phone: string | null;
  website: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  rating: number | null;
  reviewCount: number | null;
  leadScore: number | null;
  icpFit: number | null;
  painSignals: number | null;
  reachDifficulty: number | null;
  scoringRationale: string | null;
  painSummary: string | null;
  status: string;
  contactedNotes: string | null;
  discoveredAt: string;
  rubricVersionId: number | null;
}

interface LeadDiscoveryRun {
  id: number;
  invokedByUserId: number;
  region: string | null;
  industries: string[];
  zipCodes: string[];
  status: string;
  placesSearchCount: number;
  placesDetailsCount: number;
  claudeScoringCount: number;
  leadsDiscovered: number;
  totalCost: number;
  startedAt: string;
  finishedAt: string | null;
  errorMessage: string | null;
}

interface RubricVersion {
  id: number;
  version: number;
  isActive: boolean;
  refinedFromVersion: number | null;
  positiveSignalsCount: number;
  negativeSignalsCount: number;
  refinementSummary: string | null;
  createdAt: string;
}

const INDUSTRIES = [
  { value: "hvac", label: "HVAC" },
  { value: "plumbing", label: "Plumbing" },
  { value: "electrical", label: "Electrical" },
  { value: "salon", label: "Salon" },
  { value: "barbershop", label: "Barbershop" },
  { value: "spa", label: "Spa" },
];

const REGIONS = [
  { value: "maryland", label: "Maryland" },
  { value: "northern_va", label: "Northern Virginia" },
  { value: "delaware", label: "Delaware" },
  { value: "se_pa", label: "SE Pennsylvania" },
  { value: "custom", label: "Custom (paste ZIPs)" },
];

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  discovered: { label: "Discovered", color: "bg-blue-100 text-blue-800" },
  contacted: { label: "Contacted", color: "bg-amber-100 text-amber-800" },
  qualified: { label: "Qualified", color: "bg-emerald-100 text-emerald-800" },
  converted: { label: "Converted", color: "bg-green-200 text-green-900" },
  dismissed: { label: "Dismissed", color: "bg-gray-100 text-gray-700" },
};

function scoreColor(score: number | null): string {
  if (score === null) return "text-muted-foreground";
  if (score >= 75) return "text-emerald-600 font-semibold";
  if (score >= 50) return "text-amber-600 font-semibold";
  return "text-red-600 font-semibold";
}

// ─── Main component ───────────────────────────────────────────────────────

function LeadsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Section A state
  const [region, setRegion] = useState("maryland");
  const [customZips, setCustomZips] = useState("");
  const [selectedIndustries, setSelectedIndustries] = useState<string[]>(["hvac", "plumbing"]);
  const [dryRun, setDryRun] = useState(true);
  const [lastDryRunResult, setLastDryRunResult] = useState<any>(null);
  const [activeRunId, setActiveRunId] = useState<number | null>(null);

  // Section B filters
  const [statusFilter, setStatusFilter] = useState("all");
  const [industryFilter, setIndustryFilter] = useState("all");
  const [minScore, setMinScore] = useState<number>(0);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  // Section C/D
  const [runsExpanded, setRunsExpanded] = useState(false);
  const [rubricExpanded, setRubricExpanded] = useState(false);

  // ── Queries ──────────────────────────────────────────────────────────

  const { data: spend } = useQuery<{ currentMonthSpend: number; monthlyBudget: number; remaining: number }>({
    queryKey: ["/api/admin/leads/spend"],
    refetchInterval: 60_000,
  });

  const { data: leadsData, isLoading: loadingLeads } = useQuery<{ leads: Lead[]; total: number; page: number; limit: number }>({
    queryKey: ["/api/admin/leads", page, statusFilter, industryFilter, minScore, search],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: "30" });
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (industryFilter !== "all") params.set("industry", industryFilter);
      if (minScore > 0) params.set("minScore", String(minScore));
      if (search.trim()) params.set("search", search.trim());
      const res = await apiRequest("GET", `/api/admin/leads?${params}`);
      return res.json();
    },
  });

  const { data: runsData } = useQuery<{ runs: LeadDiscoveryRun[] }>({
    queryKey: ["/api/admin/leads/runs"],
    refetchInterval: activeRunId ? 5000 : 60_000,
  });

  const { data: activeRubric } = useQuery<RubricVersion>({
    queryKey: ["/api/admin/leads/rubric/active"],
  });

  const { data: rubricHistory } = useQuery<{ rubrics: RubricVersion[] }>({
    queryKey: ["/api/admin/leads/rubric/history"],
    enabled: rubricExpanded,
  });

  // ── Active run polling ────────────────────────────────────────────────

  const { data: activeRunData } = useQuery<LeadDiscoveryRun>({
    queryKey: ["/api/admin/leads/discover-run", activeRunId],
    queryFn: async () => {
      const res = await apiRequest("GET", `/api/admin/leads/discover-run/${activeRunId}`);
      return res.json();
    },
    enabled: activeRunId !== null,
    refetchInterval: 3000,
  });

  // Clear active run polling once it's terminal
  useEffect(() => {
    if (activeRunData && (activeRunData.status === "completed" || activeRunData.status === "failed" || activeRunData.status === "aborted_budget")) {
      // Final invalidations
      queryClient.invalidateQueries({ queryKey: ["/api/admin/leads"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/leads/runs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/leads/spend"] });
      toast({
        title: activeRunData.status === "completed" ? "Scan complete" : `Scan ${activeRunData.status}`,
        description: activeRunData.status === "completed"
          ? `${activeRunData.leadsDiscovered} new leads · $${Number(activeRunData.totalCost).toFixed(2)}`
          : activeRunData.errorMessage || "See run details below",
        variant: activeRunData.status === "failed" || activeRunData.status === "aborted_budget" ? "destructive" : undefined,
      });
      setActiveRunId(null);
    }
  }, [activeRunData, queryClient, toast]);

  // ── Mutations ─────────────────────────────────────────────────────────

  const scanMutation = useMutation({
    mutationFn: async () => {
      const zipCodes = region === "custom"
        ? customZips.split(/[,\s]+/).map(z => z.trim()).filter(z => /^\d{5}$/.test(z))
        : undefined;
      const body: any = {
        industries: selectedIndustries,
        region: region === "custom" ? undefined : region,
        zipCodes,
        dryRun,
      };
      const res = await apiRequest("POST", "/api/admin/leads/discover-run", body);
      return res.json();
    },
    onSuccess: (data) => {
      if (dryRun) {
        setLastDryRunResult(data);
        toast({
          title: "Dry run complete",
          description: `Estimated cost: $${Number(data.totalCost).toFixed(2)} (no spend incurred)`,
        });
      } else if (data.runId) {
        setActiveRunId(data.runId);
        toast({ title: "Scan started", description: "Polling for results…" });
      }
    },
    onError: (err: any) => {
      toast({
        title: "Scan failed to start",
        description: err?.message || "Unknown error",
        variant: "destructive",
      });
    },
  });

  const patchLeadMutation = useMutation({
    mutationFn: async (opts: { id: number; status?: string; contactedNotes?: string }) => {
      const res = await apiRequest("PATCH", `/api/admin/leads/${opts.id}`, opts);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/leads"] });
      toast({ title: "Lead updated" });
    },
    onError: (err: any) => {
      toast({ title: "Update failed", description: err?.message, variant: "destructive" });
    },
  });

  const rescoreLeadMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/admin/leads/${id}/rescore`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/leads"] });
      toast({ title: "Lead re-scored" });
    },
    onError: (err: any) => {
      toast({ title: "Re-score failed", description: err?.message, variant: "destructive" });
    },
  });

  const refineMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/admin/leads/rubric/refine-now");
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/leads/rubric/active"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/leads/rubric/history"] });
      const msg = data.status === "refined"
        ? `Refined to v${data.newVersion} (${data.positiveSignalsCount} positive, ${data.negativeSignalsCount} negative signals)`
        : data.status === "skipped_insufficient_signal"
          ? `Skipped: not enough feedback yet (${data.positiveSignalsCount} positive, ${data.negativeSignalsCount} negative). Need 5+ positive and 3+ negative.`
          : `Failed: ${data.errorMessage}`;
      toast({
        title: data.status === "refined" ? "Rubric refined" : "Refinement skipped",
        description: msg,
        variant: data.status === "failed" ? "destructive" : undefined,
      });
    },
    onError: (err: any) => {
      toast({ title: "Refinement failed", description: err?.message, variant: "destructive" });
    },
  });

  const toggleIndustry = (industry: string, checked: boolean) => {
    setSelectedIndustries(prev =>
      checked ? [...prev, industry] : prev.filter(i => i !== industry),
    );
  };

  const scanInFlight = activeRunId !== null || scanMutation.isPending;
  const scanLabel = dryRun ? "Dry-Run Estimate" : "Start Scan";

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* SECTION A — Run controls */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Target className="h-5 w-5" />
                Discover Leads
              </CardTitle>
              <CardDescription>
                Scan Google Places for ICP-matching service businesses. Rule-based filters reject non-fits before any Claude spend.
              </CardDescription>
            </div>
            <div className="text-right text-sm">
              <div>Spend this month: <span className="font-semibold">${spend?.currentMonthSpend?.toFixed(2) ?? "0.00"}</span> / ${spend?.monthlyBudget ?? 20}</div>
              {activeRubric && (
                <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1 justify-end">
                  <Sparkles className="h-3 w-3" />
                  Rubric v{activeRubric.version}
                  {activeRubric.refinedFromVersion && ` · refined from v${activeRubric.refinedFromVersion}`}
                </div>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Region */}
          <div>
            <Label>Region</Label>
            <Select value={region} onValueChange={setRegion}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REGIONS.map(r => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {region === "custom" && (
              <Input
                className="mt-2"
                placeholder="21201, 21401, 20814 …"
                value={customZips}
                onChange={e => setCustomZips(e.target.value)}
              />
            )}
          </div>

          {/* Industries */}
          <div>
            <Label>Industries</Label>
            <div className="grid grid-cols-3 gap-2 mt-1">
              {INDUSTRIES.map(i => (
                <label key={i.value} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={selectedIndustries.includes(i.value)}
                    onCheckedChange={(c) => toggleIndustry(i.value, !!c)}
                  />
                  {i.label}
                </label>
              ))}
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Switch checked={dryRun} onCheckedChange={setDryRun} />
              Dry Run (estimate cost only, no spend)
            </label>
            <Button
              onClick={() => scanMutation.mutate()}
              disabled={scanInFlight || selectedIndustries.length === 0}
              data-testid="start-scan-button"
            >
              {scanInFlight ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
              {scanInFlight ? "Scanning…" : scanLabel}
            </Button>
          </div>

          {/* Dry-run preview */}
          {dryRun && lastDryRunResult && (
            <div className="text-sm rounded-md border bg-muted/30 p-3">
              <div className="font-medium mb-1">Dry-run estimate</div>
              <div>~{lastDryRunResult.placesSearchCount} text searches · ~{lastDryRunResult.placesDetailsCount} details · ~{lastDryRunResult.claudeScoringCount} Claude scores</div>
              <div className="mt-1">Estimated cost: <span className="font-semibold">${Number(lastDryRunResult.totalCost).toFixed(2)}</span></div>
            </div>
          )}

          {/* Active run progress */}
          {activeRunData && activeRunId !== null && (
            <div className="text-sm rounded-md border border-blue-200 bg-blue-50 dark:bg-blue-950/20 p-3">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Run #{activeRunData.id} in progress · {activeRunData.placesSearchCount} searches · {activeRunData.placesDetailsCount} details · {activeRunData.leadsDiscovered} leads so far
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* SECTION B — Leads table */}
      <Card>
        <CardHeader>
          <CardTitle>Leads</CardTitle>
          <CardDescription>Sorted by score (descending). Marking leads as Qualified, Converted, or Dismissed trains the rubric.</CardDescription>
          <div className="flex flex-wrap gap-2 mt-3">
            <Input
              placeholder="Search business name…"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="max-w-[260px]"
            />
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {Object.entries(STATUS_LABELS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={industryFilter} onValueChange={(v) => { setIndustryFilter(v); setPage(1); }}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="Industry" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Industries</SelectItem>
                {INDUSTRIES.map(i => (
                  <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Label className="text-xs whitespace-nowrap">Min score</Label>
              <Input
                type="number"
                min={0}
                max={100}
                value={minScore}
                onChange={e => { setMinScore(parseInt(e.target.value) || 0); setPage(1); }}
                className="w-[80px]"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loadingLeads ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !leadsData || leadsData.leads.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Target className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <div>No leads yet.</div>
              <div className="text-sm mt-1">Run a scan above to discover leads in your region.</div>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Business</TableHead>
                    <TableHead>Industry</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Score</TableHead>
                    <TableHead>Rating</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leadsData.leads.map(lead => {
                    const status = STATUS_LABELS[lead.status] || STATUS_LABELS.discovered;
                    return (
                      <TableRow key={lead.id} data-testid={`lead-row-${lead.id}`}>
                        <TableCell>
                          <div className="font-medium">{lead.businessName}</div>
                          {lead.painSummary && (
                            <div className="text-xs text-muted-foreground line-clamp-1 max-w-[300px]" title={lead.painSummary}>
                              {lead.painSummary}
                            </div>
                          )}
                        </TableCell>
                        <TableCell><Badge variant="outline" className="capitalize">{lead.industry}</Badge></TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {lead.city || "—"}{lead.state ? `, ${lead.state}` : ""} {lead.zipCode || ""}
                        </TableCell>
                        <TableCell>
                          <span className={scoreColor(lead.leadScore)}>{lead.leadScore ?? "—"}</span>
                        </TableCell>
                        <TableCell className="text-sm">
                          {lead.rating !== null ? (
                            <span className="inline-flex items-center gap-1">
                              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                              {lead.rating} <span className="text-muted-foreground">({lead.reviewCount ?? 0})</span>
                            </span>
                          ) : "—"}
                        </TableCell>
                        <TableCell className="text-sm">
                          {lead.phone ? (
                            <a href={`tel:${lead.phone}`} className="inline-flex items-center gap-1 hover:underline">
                              <Phone className="h-3 w-3" />
                              {lead.phone}
                            </a>
                          ) : "—"}
                        </TableCell>
                        <TableCell><Badge className={`text-xs ${status.color}`}>{status.label}</Badge></TableCell>
                        <TableCell className="text-xs">
                          <div className="flex flex-col gap-1">
                            <Select
                              value={lead.status}
                              onValueChange={(s) => patchLeadMutation.mutate({ id: lead.id, status: s })}
                            >
                              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {Object.entries(STATUS_LABELS).map(([k, v]) => (
                                  <SelectItem key={k} value={k}>{v.label}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <div className="flex gap-1">
                              {lead.website && (
                                <a href={lead.website} target="_blank" rel="noreferrer">
                                  <Button variant="outline" size="sm" className="h-7 px-2 text-xs">
                                    <ExternalLink className="h-3 w-3" />
                                  </Button>
                                </a>
                              )}
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-7 px-2 text-xs"
                                onClick={() => rescoreLeadMutation.mutate(lead.id)}
                                disabled={rescoreLeadMutation.isPending}
                              >
                                <RefreshCw className={`h-3 w-3 ${rescoreLeadMutation.isPending ? "animate-spin" : ""}`} />
                              </Button>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {/* Pagination */}
              <div className="flex justify-between items-center mt-4 text-sm text-muted-foreground">
                <div>Showing {(page - 1) * 30 + 1}–{Math.min(page * 30, leadsData.total)} of {leadsData.total}</div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
                  <Button variant="outline" size="sm" disabled={page * 30 >= leadsData.total} onClick={() => setPage(p => p + 1)}>Next</Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* SECTION C — Recent runs */}
      <Card>
        <CardHeader className="cursor-pointer" onClick={() => setRunsExpanded(!runsExpanded)}>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Recent Scans ({runsData?.runs?.length ?? 0})</CardTitle>
            {runsExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </CardHeader>
        {runsExpanded && (
          <CardContent>
            {runsData?.runs && runsData.runs.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Run</TableHead>
                    <TableHead>Region</TableHead>
                    <TableHead>Industries</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Leads</TableHead>
                    <TableHead>Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runsData.runs.slice(0, 10).map(run => (
                    <TableRow key={run.id}>
                      <TableCell className="text-sm">#{run.id} · {new Date(run.startedAt).toLocaleString()}</TableCell>
                      <TableCell className="text-sm capitalize">{run.region || "—"}</TableCell>
                      <TableCell className="text-xs">{(run.industries as string[]).join(", ")}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs capitalize">{run.status.replace(/_/g, " ")}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">{run.leadsDiscovered}</TableCell>
                      <TableCell className="text-sm">${Number(run.totalCost).toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-sm text-muted-foreground">No scans yet.</div>
            )}
          </CardContent>
        )}
      </Card>

      {/* SECTION D — Rubric history (the "agent is learning" story) */}
      <Card>
        <CardHeader className="cursor-pointer" onClick={() => setRubricExpanded(!rubricExpanded)}>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-purple-500" />
                Agent Learning · Rubric History
              </CardTitle>
              {activeRubric && (
                <CardDescription className="mt-1">
                  Currently scoring with v{activeRubric.version}
                </CardDescription>
              )}
            </div>
            {rubricExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </div>
        </CardHeader>
        {rubricExpanded && (
          <CardContent className="space-y-3">
            <div className="flex justify-end">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" size="sm" disabled={refineMutation.isPending}>
                    {refineMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
                    Force Refine Now
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Refine the scoring rubric now?</AlertDialogTitle>
                    <AlertDialogDescription>
                      The agent will analyze your qualified/converted vs dismissed leads from the last 30 days and propose a new rubric. Requires at least 5 positive and 3 negative signals — otherwise it skips. Costs ~$0.02 in Claude tokens.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => refineMutation.mutate()}>Refine Rubric</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>

            {rubricHistory?.rubrics && rubricHistory.rubrics.length > 0 ? (
              <div className="space-y-2">
                {rubricHistory.rubrics.map(r => (
                  <div key={r.id} className="border rounded-md p-3">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">v{r.version}</span>
                        {r.isActive && <Badge variant="default" className="text-xs">Active</Badge>}
                      </div>
                      <span className="text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleDateString()}</span>
                    </div>
                    {r.refinedFromVersion !== null && (
                      <div className="text-xs text-muted-foreground mb-1">
                        Refined from v{r.refinedFromVersion} · {r.positiveSignalsCount} positive, {r.negativeSignalsCount} negative signals
                      </div>
                    )}
                    {r.refinementSummary && (
                      <div className="text-sm text-muted-foreground">"{r.refinementSummary}"</div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">No refinements yet. Mark leads as qualified/converted/dismissed, then click "Force Refine Now".</div>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}

export default LeadsTab;
