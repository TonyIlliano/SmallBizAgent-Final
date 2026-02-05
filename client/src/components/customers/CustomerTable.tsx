import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { formatPhoneNumber } from "@/lib/utils";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PlusCircle, Users } from "lucide-react";
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

export function CustomerTable({ businessId }: { businessId?: number | null }) {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState<any>(null);

  const { data: customers = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/customers', { businessId }],
    enabled: !!businessId,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => {
      return apiRequest("DELETE", `/api/customers/${id}`);
    },
    onSuccess: () => {
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
      cell: (customer: any) => (
        <div>
          <div className="font-medium">
            {customer.firstName} {customer.lastName}
          </div>
          {customer.notes && (
            <div className="text-sm text-gray-500">
              {customer.notes.split('•')[1] || ''}
            </div>
          )}
        </div>
      ),
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
      header: "Address",
      accessorKey: "address",
      cell: (customer: any) => (
        <div>
          {customer.address ? (
            <>
              <div>{customer.address}</div>
              <div className="text-sm text-gray-500">
                {customer.city}, {customer.state} {customer.zip}
              </div>
            </>
          ) : (
            <span className="text-gray-400">No address</span>
          )}
        </div>
      ),
    },
    {
      header: "Status",
      accessorKey: "status",
      cell: (customer: any) => {
        // In a real app, this would be based on customer data
        // For demo purposes, assigned randomly
        const statuses = ["Active", "New"];
        const colors = {
          Active: "bg-green-100 text-green-800",
          New: "bg-blue-100 text-blue-800",
        };
        const status = statuses[Math.floor(Math.random() * statuses.length)];
        
        return (
          <Badge className={colors[status as keyof typeof colors]}>
            {status}
          </Badge>
        );
      },
    },
    {
      header: "Actions",
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
            Edit
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
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold">Customer Management</h2>
          <p className="text-gray-500">Manage your customer information and history</p>
        </div>
        <Link href="/customers/new">
          <Button className="flex items-center">
            <PlusCircle className="mr-2 h-4 w-4" />
            Add Customer
          </Button>
        </Link>
      </div>

      {isLoading ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-primary-50">
            <Users className="h-10 w-10 text-primary-500" />
          </div>
          <h3 className="mt-4 text-lg font-medium">Loading customers...</h3>
          <p className="mt-2 text-sm text-gray-500">Please wait while we fetch your customer data.</p>
        </div>
      ) : customers && customers.length > 0 ? (
        <DataTable
          columns={columns}
          data={customers}
          onRowClick={(customer) => navigate(`/customers/${customer.id}`)}
        />
      ) : (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-primary-50">
            <Users className="h-10 w-10 text-primary-500" />
          </div>
          <h3 className="mt-4 text-lg font-medium">No customers found</h3>
          <p className="mt-2 text-sm text-gray-500">Get started by adding your first customer.</p>
          <div className="mt-6">
            <Link href="/customers/new">
              <Button>
                <PlusCircle className="mr-2 h-4 w-4" />
                Add Customer
              </Button>
            </Link>
          </div>
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
                  {customerToDelete.firstName} {customerToDelete.lastName}
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
