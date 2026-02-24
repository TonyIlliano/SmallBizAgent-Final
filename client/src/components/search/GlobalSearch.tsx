import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import { useDebounce } from "@/hooks/use-debounce";
import {
  Users,
  Briefcase,
  FileText,
  Calendar,
  ClipboardList,
  Search,
  Clock,
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
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Search customers, jobs, invoices..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {debouncedQuery.length >= 2 && !hasResults && !isLoading && (
          <CommandEmpty>
            <div className="flex flex-col items-center gap-2 py-4">
              <Search className="h-8 w-8 text-muted-foreground" />
              <p>No results found for "{debouncedQuery}"</p>
              <p className="text-xs text-muted-foreground">
                Try a different search term
              </p>
            </div>
          </CommandEmpty>
        )}

        {isLoading && debouncedQuery.length >= 2 && (
          <div className="py-6 text-center text-sm text-muted-foreground">
            Searching...
          </div>
        )}

        {showRecent && (
          <CommandGroup heading="Recent Searches">
            {recentSearches.map((term) => (
              <CommandItem
                key={term}
                onSelect={() => handleRecentSearch(term)}
              >
                <Clock className="mr-2 h-4 w-4 text-muted-foreground" />
                <span>{term}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

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

        {results?.customers && results.customers.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Customers">
              {results.customers.map((customer: any) => (
                <CommandItem
                  key={`customer-${customer.id}`}
                  onSelect={() =>
                    handleSelect(`/customers/${customer.id}`, debouncedQuery)
                  }
                >
                  <Users className="mr-2 h-4 w-4 text-blue-500" />
                  <div className="flex-1 min-w-0">
                    <span className="font-medium">
                      {customer.firstName} {customer.lastName}
                    </span>
                    {customer.email && (
                      <span className="ml-2 text-xs text-muted-foreground truncate">
                        {customer.email}
                      </span>
                    )}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {results?.jobs && results.jobs.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Jobs">
              {results.jobs.map((job: any) => (
                <CommandItem
                  key={`job-${job.id}`}
                  onSelect={() =>
                    handleSelect(`/jobs/${job.id}`, debouncedQuery)
                  }
                >
                  <Briefcase className="mr-2 h-4 w-4 text-amber-500" />
                  <div className="flex-1 min-w-0">
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
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {results?.invoices && results.invoices.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Invoices">
              {results.invoices.map((invoice: any) => (
                <CommandItem
                  key={`invoice-${invoice.id}`}
                  onSelect={() =>
                    handleSelect(`/invoices/${invoice.id}`, debouncedQuery)
                  }
                >
                  <FileText className="mr-2 h-4 w-4 text-green-500" />
                  <div className="flex-1 min-w-0">
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
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {results?.appointments && results.appointments.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Appointments">
              {results.appointments.map((appt: any) => (
                <CommandItem
                  key={`appointment-${appt.id}`}
                  onSelect={() =>
                    handleSelect(`/appointments/${appt.id}`, debouncedQuery)
                  }
                >
                  <Calendar className="mr-2 h-4 w-4 text-purple-500" />
                  <div className="flex-1 min-w-0">
                    <span className="font-medium">{appt.customerName}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      {appt.date}
                    </span>
                  </div>
                  <Badge variant="outline" className="ml-2 text-xs">
                    {appt.status}
                  </Badge>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {results?.quotes && results.quotes.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Quotes">
              {results.quotes.map((quote: any) => (
                <CommandItem
                  key={`quote-${quote.id}`}
                  onSelect={() =>
                    handleSelect(`/quotes/${quote.id}`, debouncedQuery)
                  }
                >
                  <ClipboardList className="mr-2 h-4 w-4 text-orange-500" />
                  <div className="flex-1 min-w-0">
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
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
