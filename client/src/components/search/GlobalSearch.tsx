import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useDebounce } from "@/hooks/use-debounce";
import {
  Users,
  Briefcase,
  FileText,
  Calendar,
  ClipboardList,
  Search,
  Clock,
  Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface GlobalSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface SearchResults {
  customers: any[];
  jobs: any[];
  invoices: any[];
  appointments: any[];
  quotes: any[];
}

const RECENT_SEARCHES_KEY = "smallbiz-recent-searches";
const MAX_RECENT = 5;

function getRecentSearches(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY) || "[]");
  } catch {
    return [];
  }
}

function addRecentSearch(term: string) {
  const recent = getRecentSearches().filter((s) => s !== term);
  recent.unshift(term);
  localStorage.setItem(
    RECENT_SEARCHES_KEY,
    JSON.stringify(recent.slice(0, MAX_RECENT))
  );
}

export function GlobalSearch({ open, onOpenChange }: GlobalSearchProps) {
  const [, navigate] = useLocation();
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 300);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      setRecentSearches(getRecentSearches());
      setQuery("");
    }
  }, [open]);

  // Listen for Cmd+K / Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onOpenChange]);

  const { data: results, isLoading } = useQuery<SearchResults>({
    queryKey: ["/api/search", { q: debouncedQuery }],
    enabled: debouncedQuery.length >= 2,
    staleTime: 30_000, // Search results should refresh frequently
  });

  const handleSelect = useCallback(
    (path: string, searchTerm?: string) => {
      if (searchTerm) addRecentSearch(searchTerm);
      onOpenChange(false);
      navigate(path);
    },
    [navigate, onOpenChange]
  );

  const handleRecentSearch = (term: string) => {
    setQuery(term);
  };

  const hasResults =
    results &&
    (results.customers?.length > 0 ||
      results.jobs?.length > 0 ||
      results.invoices?.length > 0 ||
      results.appointments?.length > 0 ||
      results.quotes?.length > 0);

  const showRecent = !debouncedQuery && recentSearches.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 shadow-lg sm:max-w-[500px]">
        {/* Search Input */}
        <div className="flex items-center border-b px-3">
          <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
          <input
            className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
            placeholder="Search customers, jobs, invoices..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        </div>

        {/* Results Area */}
        <div className="max-h-[400px] overflow-y-auto">
          {/* Loading state */}
          {isLoading && debouncedQuery.length >= 2 && (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Searching...
            </div>
          )}

          {/* No results */}
          {debouncedQuery.length >= 2 && !hasResults && !isLoading && (
            <div className="flex flex-col items-center gap-2 py-6">
              <Search className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm">No results found for &quot;{debouncedQuery}&quot;</p>
              <p className="text-xs text-muted-foreground">
                Try a different search term
              </p>
            </div>
          )}

          {/* Recent Searches */}
          {showRecent && (
            <div className="p-1">
              <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                Recent Searches
              </div>
              {recentSearches.map((term) => (
                <button
                  key={term}
                  className="relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                  onClick={() => handleRecentSearch(term)}
                >
                  <Clock className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span>{term}</span>
                </button>
              ))}
            </div>
          )}

          {/* Empty state */}
          {!debouncedQuery && !showRecent && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              <Search className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
              <p>Start typing to search across your business</p>
              <p className="text-xs mt-1">
                <kbd className="px-1.5 py-0.5 rounded border bg-muted text-xs">
                  ⌘K
                </kbd>{" "}
                to open anytime
              </p>
            </div>
          )}

          {/* Customers */}
          {results?.customers && results.customers.length > 0 && (
            <div className="p-1">
              <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                Customers
              </div>
              {results.customers.map((customer: any) => (
                <button
                  key={`customer-${customer.id}`}
                  className="relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                  onClick={() =>
                    handleSelect(`/customers/${customer.id}`, debouncedQuery)
                  }
                >
                  <Users className="mr-2 h-4 w-4 text-blue-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0 text-left">
                    <span className="font-medium">
                      {customer.firstName} {customer.lastName}
                    </span>
                    {customer.email && (
                      <span className="ml-2 text-xs text-muted-foreground truncate">
                        {customer.email}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Jobs */}
          {results?.jobs && results.jobs.length > 0 && (
            <div className="p-1 border-t">
              <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                Jobs
              </div>
              {results.jobs.map((job: any) => (
                <button
                  key={`job-${job.id}`}
                  className="relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                  onClick={() =>
                    handleSelect(`/jobs/${job.id}`, debouncedQuery)
                  }
                >
                  <Briefcase className="mr-2 h-4 w-4 text-amber-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0 text-left">
                    <span className="font-medium">{job.title}</span>
                    {job.customerName && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {job.customerName}
                      </span>
                    )}
                  </div>
                  <Badge variant="outline" className="ml-2 text-xs">
                    {job.status}
                  </Badge>
                </button>
              ))}
            </div>
          )}

          {/* Invoices */}
          {results?.invoices && results.invoices.length > 0 && (
            <div className="p-1 border-t">
              <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                Invoices
              </div>
              {results.invoices.map((invoice: any) => (
                <button
                  key={`invoice-${invoice.id}`}
                  className="relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                  onClick={() =>
                    handleSelect(`/invoices/${invoice.id}`, debouncedQuery)
                  }
                >
                  <FileText className="mr-2 h-4 w-4 text-green-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0 text-left">
                    <span className="font-medium">
                      #{invoice.invoiceNumber}
                    </span>
                    {invoice.customerName && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {invoice.customerName}
                      </span>
                    )}
                  </div>
                  <Badge variant="outline" className="ml-2 text-xs">
                    {invoice.status}
                  </Badge>
                </button>
              ))}
            </div>
          )}

          {/* Appointments */}
          {results?.appointments && results.appointments.length > 0 && (
            <div className="p-1 border-t">
              <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                Appointments
              </div>
              {results.appointments.map((appt: any) => (
                <button
                  key={`appointment-${appt.id}`}
                  className="relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                  onClick={() =>
                    handleSelect(`/appointments/${appt.id}`, debouncedQuery)
                  }
                >
                  <Calendar className="mr-2 h-4 w-4 text-purple-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0 text-left">
                    <span className="font-medium">{appt.customerName}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {appt.date}
                    </span>
                  </div>
                  <Badge variant="outline" className="ml-2 text-xs">
                    {appt.status}
                  </Badge>
                </button>
              ))}
            </div>
          )}

          {/* Quotes */}
          {results?.quotes && results.quotes.length > 0 && (
            <div className="p-1 border-t">
              <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                Quotes
              </div>
              {results.quotes.map((quote: any) => (
                <button
                  key={`quote-${quote.id}`}
                  className="relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                  onClick={() =>
                    handleSelect(`/quotes/${quote.id}`, debouncedQuery)
                  }
                >
                  <ClipboardList className="mr-2 h-4 w-4 text-orange-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0 text-left">
                    <span className="font-medium">#{quote.quoteNumber}</span>
                    {quote.customerName && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {quote.customerName}
                      </span>
                    )}
                  </div>
                  <Badge variant="outline" className="ml-2 text-xs">
                    {quote.status}
                  </Badge>
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
