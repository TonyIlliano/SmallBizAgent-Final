import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { formatPhoneNumber } from "@/lib/utils";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  PlusCircle,
  Users,
  ChevronRight as ChevronRightIcon,
  Search,
  Phone,
  DollarSign,
  Calendar,
  MoreHorizontal,
  Eye,
  Trash2,
  ArrowUpDown,
  MessageSquare,
  FileText,
  Archive,
  RotateCcw,
} from "lucide-react";
import { SkeletonTable } from "@/components/ui/skeleton-loader";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "\u2014";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getCustomerStatus(customer: any): { label: string; color: string } {
  const now = new Date();
  const createdAt = new Date(customer.created_at);
  const daysSinceCreated = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));

  if (customer.open_invoice_count > 0) {
    return { label: "Overdue", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" };
  }

  const lastVisit = customer.last_visit ? new Date(customer.last_visit) : null;
  const daysSinceVisit = lastVisit ? Math.floor((now.getTime() - lastVisit.getTime()) / (1000 * 60 * 60 * 24)) : null;

  if (daysSinceVisit !== null && daysSinceVisit <= 60) {
    return { label: "Active", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" };
  }

  if (Number(customer.total_revenue) > 0 && (daysSinceVisit === null || daysSinceVisit > 60)) {
    return { label: "Inactive", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" };
  }

  if (daysSinceCreated <= 14) {
    return { label: "New", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" };
  }

  return { label: "Lead", color: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400" };
}

const STATUS_FILTERS = [
  { label: "All", value: "all" },
  { label: "Active", value: "Active" },
  { label: "Inactive", value: "Inactive" },
  { label: "New", value: "New" },
  { label: "Lead", value: "Lead" },
  { label: "Overdue", value: "Overdue" },
];

type SortField = "name" | "total_revenue" | "last_visit" | "created_at";
type SortDir = "asc" | "desc";

export function CustomerTable({ businessId }: { businessId?: number | null }) {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [showArchived, setShowArchived] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Debounce search input
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search);
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search]);

  const { data: customers = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/customers/enriched', { businessId, search: debouncedSearch, archived: showArchived }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (showArchived) params.set('archived', 'true');
      const res = await fetch(`/api/customers/enriched?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch customers');
      return res.json();
    },
    enabled: !!businessId,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => {
      return apiRequest("DELETE", `/api/customers/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/customers/enriched'] });
      queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
      toast({
        title: "Success",
        description: "Customer deleted successfully",
      });
      setDeleteDialogOpen(false);
      setCustomerToDelete(null);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to delete customer. Please try again.",
        variant: "destructive",
      });
      console.error("Error deleting customer:", error);
    },
  });

  const archiveMutation = useMutation({
    mutationFn: (id: number) => {
      return apiRequest("POST", `/api/customers/${id}/archive`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/customers/enriched'] });
      queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
      toast({ title: "Customer archived", description: "Customer has been moved to the archive." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to archive customer.", variant: "destructive" });
    },
  });

  const restoreMutation = useMutation({
    mutationFn: (id: number) => {
      return apiRequest("POST", `/api/customers/${id}/restore`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/customers/enriched'] });
      queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
      toast({ title: "Customer restored", description: "Customer has been restored from the archive." });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to restore customer.", variant: "destructive" });
    },
  });

  const handleDelete = (customer: any) => {
    setCustomerToDelete(customer);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (customerToDelete) {
      deleteMutation.mutate(customerToDelete.id);
    }
  };

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDir("desc");
    }
  };

  // Filter and sort customers
  const filteredCustomers = customers
    .filter(c => {
      if (statusFilter === "all") return true;
      return getCustomerStatus(c).label === statusFilter;
    })
    .sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      switch (sortField) {
        case "name":
          return dir * ((a.first_name || "").localeCompare(b.first_name || ""));
        case "total_revenue":
          return dir * ((Number(a.total_revenue) || 0) - (Number(b.total_revenue) || 0));
        case "last_visit": {
          const da = a.last_visit ? new Date(a.last_visit).getTime() : 0;
          const db = b.last_visit ? new Date(b.last_visit).getTime() : 0;
          return dir * (da - db);
        }
        case "created_at": {
          const da = a.created_at ? new Date(a.created_at).getTime() : 0;
          const db = b.created_at ? new Date(b.created_at).getTime() : 0;
          return dir * (da - db);
        }
        default:
          return 0;
      }
    });

  // Count per status for filter pills
  const statusCounts: Record<string, number> = { all: customers.length };
  for (const c of customers) {
    const s = getCustomerStatus(c).label;
    statusCounts[s] = (statusCounts[s] || 0) + 1;
  }

  const columns = [
    {
      header: "Name",
      accessorKey: "name",
      cell: (customer: any) => {
        const isAutoGenerated = customer.first_name?.startsWith("Caller ");
        return (
          <div>
            <div className="font-medium">
              {customer.first_name} {customer.last_name}
            </div>
            {isAutoGenerated && (
              <div className="text-xs text-muted-foreground">
                Auto-created from call
              </div>
            )}
          </div>
        );
      },
    },
    {
      header: "Contact",
      accessorKey: "contact",
      cell: (customer: any) => (
        <div>
          <div>{formatPhoneNumber(customer.phone)}</div>
          {customer.email && (
            <div className="text-sm text-gray-500">{customer.email}</div>
          )}
        </div>
      ),
    },
    {
      header: "Revenue",
      accessorKey: "total_revenue",
      cell: (customer: any) => {
        const totalRevenue = Number(customer.total_revenue) || 0;
        const invoiceCount = Number(customer.paid_invoice_count) || 0;
        const completedAppts = Number(customer.completed_appointment_count) || 0;

        const details: string[] = [];
        if (invoiceCount > 0) details.push(`${invoiceCount} invoice${invoiceCount !== 1 ? 's' : ''}`);
        if (completedAppts > 0) details.push(`${completedAppts} appt${completedAppts !== 1 ? 's' : ''}`);

        return (
          <div className="text-right">
            <div className="font-medium">
              {totalRevenue > 0 ? formatCurrency(totalRevenue) : "\u2014"}
            </div>
            {details.length > 0 && (
              <div className="text-xs text-muted-foreground">
                {details.join(' + ')}
              </div>
            )}
          </div>
        );
      },
    },
    {
      header: "Last Visit",
      accessorKey: "last_visit",
      cell: (customer: any) => (
        <div className="text-sm">
          {formatDate(customer.last_visit)}
        </div>
      ),
    },
    {
      header: "Calls",
      accessorKey: "call_count",
      cell: (customer: any) => {
        const callCount = Number(customer.call_count) || 0;
        return (
          <div className="text-center">
            {callCount > 0 ? (
              <div>
                <div className="font-medium">{callCount}</div>
                <div className="text-xs text-muted-foreground">
                  {formatDate(customer.last_call_date)}
                </div>
              </div>
            ) : (
              <span className="text-muted-foreground">\u2014</span>
            )}
          </div>
        );
      },
    },
    {
      header: "Status",
      accessorKey: "status",
      cell: (customer: any) => {
        const status = getCustomerStatus(customer);
        return (
          <Badge className={status.color}>
            {status.label}
          </Badge>
        );
      },
    },
    {
      header: "",
      accessorKey: "actions",
      cell: (customer: any) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/customers/${customer.id}`);
              }}
            >
              <Eye className="h-4 w-4 mr-2" />
              View Details
            </DropdownMenuItem>
            {!showArchived && customer.phone && (
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(`sms:${customer.phone}`, '_self');
                }}
              >
                <MessageSquare className="h-4 w-4 mr-2" />
                Send SMS
              </DropdownMenuItem>
            )}
            {!showArchived && (
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/invoices/create?customerId=${customer.id}`);
                }}
              >
                <FileText className="h-4 w-4 mr-2" />
                Create Invoice
              </DropdownMenuItem>
            )}
            {!showArchived && (
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/appointments?action=book&customerId=${customer.id}`);
                }}
              >
                <Calendar className="h-4 w-4 mr-2" />
                Book Appointment
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            {showArchived ? (
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  restoreMutation.mutate(customer.id);
                }}
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Restore
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                className="text-yellow-600 focus:text-yellow-600"
                onClick={(e) => {
                  e.stopPropagation();
                  archiveMutation.mutate(customer.id);
                }}
              >
                <Archive className="h-4 w-4 mr-2" />
                Archive
              </DropdownMenuItem>
            )}
            <DropdownMenuItem
              className="text-red-600 focus:text-red-600"
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(customer);
              }}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
        <div>
          <h2 className="text-2xl font-bold">
            {showArchived ? "Archived Customers" : "Customer Management"}
          </h2>
          <p className="text-gray-500">
            {showArchived
              ? "Archived customers can be restored at any time"
              : "Manage your customer information and history"}
          </p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search customers..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button
            variant={showArchived ? "default" : "outline"}
            size="sm"
            onClick={() => setShowArchived(!showArchived)}
            className="whitespace-nowrap"
          >
            <Archive className="mr-1.5 h-4 w-4" />
            {showArchived ? "Active" : "Archived"}
          </Button>
          {!showArchived && (
            <Link href="/customers/new">
              <Button className="flex items-center whitespace-nowrap">
                <PlusCircle className="mr-2 h-4 w-4" />
                Add Customer
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Status Filter Pills */}
      <div className="flex flex-wrap gap-2 mb-4">
        {STATUS_FILTERS.map(f => {
          const count = statusCounts[f.value] || 0;
          const isActive = statusFilter === f.value;
          return (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`px-3 py-1 text-xs font-medium rounded-full border transition-colors ${
                isActive
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:bg-muted"
              }`}
            >
              {f.label} {count > 0 && <span className="ml-1 opacity-70">{count}</span>}
            </button>
          );
        })}
      </div>

      {/* Sort Controls */}
      <div className="flex items-center gap-2 mb-3 text-xs text-muted-foreground">
        <span>Sort by:</span>
        {([
          { field: "created_at" as SortField, label: "Newest" },
          { field: "name" as SortField, label: "Name" },
          { field: "total_revenue" as SortField, label: "Revenue" },
          { field: "last_visit" as SortField, label: "Last Visit" },
        ]).map(s => (
          <button
            key={s.field}
            onClick={() => toggleSort(s.field)}
            className={`px-2 py-0.5 rounded text-xs transition-colors ${
              sortField === s.field
                ? "bg-muted font-medium text-foreground"
                : "hover:bg-muted/50"
            }`}
          >
            {s.label}
            {sortField === s.field && (
              <ArrowUpDown className="inline h-3 w-3 ml-0.5" />
            )}
          </button>
        ))}
      </div>

      {isLoading ? (
        <SkeletonTable rows={6} />
      ) : filteredCustomers && filteredCustomers.length > 0 ? (
        <DataTable
          columns={columns}
          data={filteredCustomers}
          searchable={false}
          onRowClick={(customer) => navigate(`/customers/${customer.id}`)}
          mobileCard={(customer: any) => {
            const status = getCustomerStatus(customer);
            const isAutoGenerated = customer.first_name?.startsWith("Caller ");
            return (
              <div className="p-4 flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">
                      {customer.first_name} {customer.last_name}
                    </span>
                    <Badge className={`text-[10px] ${status.color}`}>{status.label}</Badge>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {formatPhoneNumber(customer.phone)}
                  </div>
                  {isAutoGenerated && (
                    <div className="text-xs text-muted-foreground italic">Auto-created from call</div>
                  )}
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    {Number(customer.total_revenue) > 0 && (
                      <span className="flex items-center gap-1">
                        <DollarSign className="h-3 w-3" />
                        {formatCurrency(Number(customer.total_revenue))}
                      </span>
                    )}
                    {Number(customer.call_count) > 0 && (
                      <span className="flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {customer.call_count} call{Number(customer.call_count) !== 1 ? 's' : ''}
                      </span>
                    )}
                    {customer.last_visit && (
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDate(customer.last_visit)}
                      </span>
                    )}
                  </div>
                </div>
                <ChevronRightIcon className="h-5 w-5 text-muted-foreground flex-shrink-0 ml-2" />
              </div>
            );
          }}
        />
      ) : (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 mb-4">
            <Users className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-foreground">
            {debouncedSearch || statusFilter !== "all"
              ? "No customers match your filters"
              : "Build your customer base"}
          </h3>
          <p className="mt-2 text-sm text-muted-foreground max-w-md mx-auto">
            {debouncedSearch || statusFilter !== "all"
              ? "Try a different search term or clear filters."
              : "Customers are added automatically when they book appointments or call in. You can also add them manually."}
          </p>
          {!debouncedSearch && statusFilter === "all" && (
            <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link href="/customers/new">
                <Button>
                  <PlusCircle className="mr-2 h-4 w-4" />
                  Add Customer
                </Button>
              </Link>
            </div>
          )}
        </div>
      )}

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete customer?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove{" "}
              {customerToDelete && (
                <span className="font-semibold">
                  {customerToDelete.first_name} {customerToDelete.last_name}
                </span>
              )}{" "}
              from your customer list. The record can be recovered by an administrator if needed.
              Consider archiving instead if you may need to access this customer later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
