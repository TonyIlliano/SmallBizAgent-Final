import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { formatPhoneNumber } from "@/lib/utils";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PlusCircle, Users, ChevronRight as ChevronRightIcon, Search, Phone, DollarSign, Calendar } from "lucide-react";
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

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "—";
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

  // Has open invoices → "Overdue" (red)
  if (customer.open_invoice_count > 0) {
    return { label: "Overdue", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" };
  }

  // Had a visit or paid invoice in last 60 days → "Active" (green)
  const lastVisit = customer.last_visit ? new Date(customer.last_visit) : null;
  const daysSinceVisit = lastVisit ? Math.floor((now.getTime() - lastVisit.getTime()) / (1000 * 60 * 60 * 24)) : null;

  if (daysSinceVisit !== null && daysSinceVisit <= 60) {
    return { label: "Active", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" };
  }

  // Has revenue but no recent visit → "Inactive" (yellow)
  if (Number(customer.total_revenue) > 0 && (daysSinceVisit === null || daysSinceVisit > 60)) {
    return { label: "Inactive", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" };
  }

  // Created in last 14 days → "New" (blue)
  if (daysSinceCreated <= 14) {
    return { label: "New", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" };
  }

  // Default — has record but no activity → "Lead" (gray)
  return { label: "Lead", color: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400" };
}

export function CustomerTable({ businessId }: { businessId?: number | null }) {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
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
    queryKey: ['/api/customers/enriched', { businessId, search: debouncedSearch }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set('search', debouncedSearch);
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

  const handleDelete = (customer: any) => {
    setCustomerToDelete(customer);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (customerToDelete) {
      deleteMutation.mutate(customerToDelete.id);
    }
  };

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

        // Build detail parts
        const details: string[] = [];
        if (invoiceCount > 0) details.push(`${invoiceCount} invoice${invoiceCount !== 1 ? 's' : ''}`);
        if (completedAppts > 0) details.push(`${completedAppts} appt${completedAppts !== 1 ? 's' : ''}`);

        return (
          <div className="text-right">
            <div className="font-medium">
              {totalRevenue > 0 ? formatCurrency(totalRevenue) : "—"}
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
              <span className="text-muted-foreground">—</span>
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
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              navigate(`/customers/${customer.id}`);
            }}
          >
            View
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
            onClick={(e) => {
              e.stopPropagation();
              handleDelete(customer);
            }}
          >
            Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold">Customer Management</h2>
          <p className="text-gray-500">Manage your customer information and history</p>
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
          <Link href="/customers/new">
            <Button className="flex items-center whitespace-nowrap">
              <PlusCircle className="mr-2 h-4 w-4" />
              Add Customer
            </Button>
          </Link>
        </div>
      </div>

      {isLoading ? (
        <SkeletonTable rows={6} />
      ) : customers && customers.length > 0 ? (
        <DataTable
          columns={columns}
          data={customers}
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
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-primary-50">
            <Users className="h-10 w-10 text-primary-500" />
          </div>
          <h3 className="mt-4 text-lg font-medium">
            {debouncedSearch ? "No customers match your search" : "No customers found"}
          </h3>
          <p className="mt-2 text-sm text-gray-500">
            {debouncedSearch
              ? "Try a different search term."
              : "Get started by adding your first customer."}
          </p>
          {!debouncedSearch && (
            <div className="mt-6">
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
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the customer{" "}
              {customerToDelete && (
                <span className="font-semibold">
                  {customerToDelete.first_name} {customerToDelete.last_name}
                </span>
              )}{" "}
              and all associated data. This action cannot be undone.
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
