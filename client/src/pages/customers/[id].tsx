import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { PageLayout } from "@/components/layout/PageLayout";
import PageTitle from "@/components/PageTitle";
import { CustomerForm } from "@/components/customers/CustomerForm";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SkeletonForm, SkeletonStats } from "@/components/ui/skeleton-loader";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatCurrency, formatPhoneNumber } from "@/lib/utils";
import {
  Briefcase,
  FileText,
  Calendar,
  ClipboardList,
  DollarSign,
  Clock,
  Users,
  Mail,
  Phone,
  MapPin,
  Edit,
  StickyNote,
} from "lucide-react";

function formatDate(dateStr: string) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const typeIcons: Record<string, any> = {
  job: Briefcase,
  invoice: FileText,
  appointment: Calendar,
  quote: ClipboardList,
};

const typeColors: Record<string, string> = {
  job: "text-amber-500 bg-amber-50 dark:bg-amber-900/20",
  invoice: "text-green-500 bg-green-50 dark:bg-green-900/20",
  appointment: "text-purple-500 bg-purple-50 dark:bg-purple-900/20",
  quote: "text-orange-500 bg-orange-50 dark:bg-orange-900/20",
};

const typePaths: Record<string, string> = {
  job: "/jobs",
  invoice: "/invoices",
  appointment: "/appointments",
  quote: "/quotes",
};

export default function CustomerDetail() {
  const params = useParams();
  const [, navigate] = useLocation();
  const customerId = params.id;
  const isNew = customerId === "new";
  const [editOpen, setEditOpen] = useState(false);

  // Fetch customer data
  const { data: customer, isLoading, error } = useQuery<any>({
    queryKey: [`/api/customers/${customerId}`],
    enabled: !isNew && !!customerId,
  });

  // Fetch activity data
  const { data: activity, isLoading: activityLoading } = useQuery<any>({
    queryKey: [`/api/customers/${customerId}/activity`],
    enabled: !isNew && !!customerId,
  });

  // New customer — just show the form
  if (isNew) {
    return (
      <PageLayout title="New Customer">
        <PageTitle
          title="Add New Customer"
          breadcrumbs={[
            { label: "Dashboard", href: "/" },
            { label: "Customers", href: "/customers" },
            { label: "New Customer", href: "#" },
          ]}
        />
        <div className="mt-6">
          <CustomerForm customer={undefined} isEdit={false} />
        </div>
      </PageLayout>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <PageLayout title="Customer Details">
        <PageTitle
          title="Loading Customer..."
          breadcrumbs={[
            { label: "Dashboard", href: "/" },
            { label: "Customers", href: "/customers" },
            { label: "Loading...", href: "#" },
          ]}
        />
        <div className="mt-6 space-y-6">
          <SkeletonStats />
          <SkeletonForm />
        </div>
      </PageLayout>
    );
  }

  // Error state
  if (error) {
    return (
      <PageLayout title="Customer Details">
        <PageTitle
          title="Customer Not Found"
          breadcrumbs={[
            { label: "Dashboard", href: "/" },
            { label: "Customers", href: "/customers" },
            { label: "Not Found", href: "#" },
          ]}
        />
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-4 text-red-800 dark:text-red-300 mt-4">
          We couldn't find the customer you're looking for.
        </div>
        <div className="mt-4">
          <Button onClick={() => navigate("/customers")}>
            Return to Customers
          </Button>
        </div>
      </PageLayout>
    );
  }

  const stats = activity?.stats || {};

  return (
    <PageLayout title="Customer Details">
      <PageTitle
        title={`${customer?.firstName} ${customer?.lastName}`}
        breadcrumbs={[
          { label: "Dashboard", href: "/" },
          { label: "Customers", href: "/customers" },
          {
            label: `${customer?.firstName} ${customer?.lastName}`,
            href: "#",
          },
        ]}
        actions={
          <Button size="sm" onClick={() => setEditOpen(true)}>
            <Edit className="h-4 w-4 mr-1" />
            Edit
          </Button>
        }
      />

      {/* Quick Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Briefcase className="h-3.5 w-3.5" />
              Total Jobs
            </div>
            <p className="text-2xl font-bold">{stats.totalJobs || 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <DollarSign className="h-3.5 w-3.5" />
              Total Spent
            </div>
            <p className="text-2xl font-bold">
              {formatCurrency(stats.totalSpent || 0)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <Clock className="h-3.5 w-3.5" />
              Last Visit
            </div>
            <p className="text-lg font-bold truncate">
              {stats.lastVisit ? formatDate(stats.lastVisit) : "—"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
              <FileText className="h-3.5 w-3.5" />
              Open Invoices
            </div>
            <p className="text-2xl font-bold">{stats.activeInvoices || 0}</p>
          </CardContent>
        </Card>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
        {/* Left: Customer Info */}
        <div className="md:col-span-1 space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Contact Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {customer?.phone && (
                <div className="flex items-center gap-3">
                  <Phone className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm">
                    {formatPhoneNumber(customer.phone)}
                  </span>
                </div>
              )}
              {customer?.email && (
                <div className="flex items-center gap-3">
                  <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm truncate">{customer.email}</span>
                </div>
              )}
              {(customer?.address || customer?.city) && (
                <div className="flex items-start gap-3">
                  <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <div className="text-sm">
                    {customer.address && <div>{customer.address}</div>}
                    {customer.city && (
                      <div className="text-muted-foreground">
                        {customer.city}
                        {customer.state && `, ${customer.state}`}{" "}
                        {customer.zip}
                      </div>
                    )}
                  </div>
                </div>
              )}
              {customer?.notes && (
                <div className="flex items-start gap-3 pt-2 border-t">
                  <StickyNote className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-muted-foreground whitespace-pre-line">
                    {customer.notes}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: Activity Timeline */}
        <div className="md:col-span-2">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Activity Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              {activityLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div
                      key={i}
                      className="animate-pulse flex items-center gap-3 p-3"
                    >
                      <div className="w-8 h-8 rounded-full bg-muted" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 bg-muted rounded w-1/3" />
                        <div className="h-3 bg-muted rounded w-1/4" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : activity?.timeline?.length > 0 ? (
                <div className="space-y-1">
                  {activity.timeline.map((entry: any, i: number) => {
                    const Icon = typeIcons[entry.type] || Briefcase;
                    const colorClass = typeColors[entry.type] || "";
                    const basePath = typePaths[entry.type] || "";

                    return (
                      <div
                        key={`${entry.type}-${entry.id}-${i}`}
                        className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                        onClick={() =>
                          navigate(`${basePath}/${entry.id}`)
                        }
                      >
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${colorClass}`}
                        >
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-medium truncate">
                              {entry.title}
                            </span>
                            <Badge
                              variant="outline"
                              className="text-[10px] flex-shrink-0"
                            >
                              {entry.status}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                            <span>{formatDate(entry.date)}</span>
                            {entry.amount != null && entry.amount > 0 && (
                              <>
                                <span>•</span>
                                <span>{formatCurrency(entry.amount)}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No activity yet</p>
                  <p className="text-xs mt-1">
                    Jobs, invoices, and appointments will appear here
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Edit Customer Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Customer</DialogTitle>
          </DialogHeader>
          <CustomerForm
            customer={customer}
            isEdit={true}
            onSuccess={() => setEditOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
}
