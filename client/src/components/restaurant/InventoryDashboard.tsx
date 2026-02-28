/**
 * Inventory Dashboard — Restaurant-only component
 *
 * Shows POS inventory levels from Clover/Square with server-side pagination,
 * search, and filtering. Lets owners configure low-stock thresholds per item
 * and toggle inventory alert notifications.
 * Only visible when business type = restaurant and POS is connected.
 */

import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  AlertTriangle,
  RefreshCw,
  Package,
  PackageX,
  Bell,
  BellOff,
  ArrowDown,
  Loader2,
  Search,
  Filter,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";

interface InventoryItem {
  id: number;
  business_id: number;
  pos_item_id: string;
  pos_source: string;
  name: string;
  sku: string | null;
  category: string | null;
  quantity: number;
  low_stock_threshold: number;
  unit_cost: number | null;
  price: number | null;
  track_stock: boolean;
  last_alert_sent_at: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

interface PaginatedResponse {
  items: InventoryItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface InventoryStats {
  totalItems: number;
  trackedItems: number;
  lowStockItems: number;
  outOfStockItems: number;
  lastSyncedAt: string | null;
}

interface InventoryDashboardProps {
  businessId: number;
  business: any;
}

const PAGE_SIZE = 25;

export default function InventoryDashboard({ businessId, business }: InventoryDashboardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Filter/pagination state
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [showLowStockOnly, setShowLowStockOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [editingThreshold, setEditingThreshold] = useState<number | null>(null);
  const [thresholdValue, setThresholdValue] = useState<string>("");

  // Debounce search input (400ms)
  const debounceTimer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    debounceTimer.current = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setPage(1); // Reset to page 1 on new search
    }, 400);
    return () => clearTimeout(debounceTimer.current);
  }, [searchInput]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [categoryFilter, showLowStockOnly]);

  // POS detection
  const hasPOS =
    (business?.cloverMerchantId && business?.cloverAccessToken) ||
    (business?.squareAccessToken && business?.squareLocationId);
  const posName = business?.cloverMerchantId ? "Clover" : business?.squareAccessToken ? "Square" : null;

  // Build query string for server-side pagination/filtering
  const buildQueryString = () => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", String(PAGE_SIZE));
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (categoryFilter !== "all") params.set("category", categoryFilter);
    if (showLowStockOnly) params.set("lowStock", "true");
    return params.toString();
  };

  // Fetch paginated inventory items (server-side)
  const queryString = buildQueryString();
  const { data: paginatedData, isLoading: itemsLoading, error: itemsError } = useQuery({
    queryKey: ["/api/inventory/items", queryString],
    queryFn: async (): Promise<PaginatedResponse> => {
      const res = await fetch(`/api/inventory/items?${queryString}`, { credentials: "include" });
      if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
      return res.json();
    },
    enabled: !!hasPOS,
    placeholderData: (prev: PaginatedResponse | undefined) => prev, // Keep previous data while loading next page
  });

  const items: InventoryItem[] = paginatedData?.items ?? [];
  const totalItems = paginatedData?.total ?? 0;
  const totalPages = paginatedData?.totalPages ?? 1;

  // Fetch inventory stats
  const { data: stats } = useQuery<InventoryStats>({
    queryKey: ["/api/inventory/stats"],
    enabled: !!hasPOS,
  });

  // Fetch categories
  const { data: categories = [] } = useQuery<string[]>({
    queryKey: ["/api/inventory/categories"],
    enabled: !!hasPOS,
  });

  // Sync mutation
  const syncMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/inventory/sync"),
    onSuccess: async (response) => {
      const data = await response.json();
      toast({
        title: "Inventory Synced",
        description: data.message || `Synced ${data.synced} items from ${posName}`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/categories"] });
    },
    onError: (err: any) => {
      toast({
        title: "Sync Failed",
        description: err.message || "Failed to sync inventory from POS",
        variant: "destructive",
      });
    },
  });

  // Update item threshold
  const updateItemMutation = useMutation({
    mutationFn: ({ itemId, data }: { itemId: number; data: any }) =>
      apiRequest("PATCH", `/api/inventory/items/${itemId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory/stats"] });
      setEditingThreshold(null);
      toast({ title: "Item Updated" });
    },
    onError: (err: any) => {
      toast({
        title: "Update Failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  // Check alerts mutation
  const checkAlertsMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/inventory/check-alerts"),
    onSuccess: async (response) => {
      const data = await response.json();
      if (data.alertsSent > 0) {
        toast({
          title: "Alerts Sent",
          description: `Sent ${data.alertsSent} low-stock alert(s) for ${data.lowStockItems.length} items`,
        });
      } else if (data.lowStockItems.length > 0) {
        toast({
          title: "Low Stock Items Found",
          description: `${data.lowStockItems.length} items below threshold (alerts already sent recently)`,
        });
      } else {
        toast({ title: "All Good", description: "No items below threshold" });
      }
    },
  });

  // No POS connected
  if (!hasPOS) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Inventory Tracking
          </CardTitle>
          <CardDescription>
            Connect your Clover or Square POS system to track inventory levels
            and receive low-stock alerts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-lg font-medium">No POS System Connected</p>
            <p className="mt-1">
              Go to the <strong>Integrations</strong> tab to connect Clover or Square.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Total Items</span>
            </div>
            <p className="text-2xl font-bold mt-1">{stats?.totalItems ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Tracked</span>
            </div>
            <p className="text-2xl font-bold mt-1">{stats?.trackedItems ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              <span className="text-sm text-muted-foreground">Low Stock</span>
            </div>
            <p className="text-2xl font-bold mt-1 text-yellow-600">{stats?.lowStockItems ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <PackageX className="h-4 w-4 text-red-500" />
              <span className="text-sm text-muted-foreground">Out of Stock</span>
            </div>
            <p className="text-2xl font-bold mt-1 text-red-600">{stats?.outOfStockItems ?? 0}</p>
          </CardContent>
        </Card>
      </div>

      {/* Alert Settings Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bell className="h-4 w-4" />
            Low-Stock Alert Settings
          </CardTitle>
          <CardDescription>
            Get notified via SMS and/or email when items drop below their threshold
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="font-medium">Enable Alerts</Label>
              <p className="text-sm text-muted-foreground">
                Receive notifications when items are running low
              </p>
            </div>
            <Badge variant={business?.inventoryAlertsEnabled ? "default" : "secondary"}>
              {business?.inventoryAlertsEnabled ? "Active" : "Off"}
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label className="font-medium">Alert Channel</Label>
              <p className="text-sm text-muted-foreground">
                {business?.inventoryAlertChannel === "sms"
                  ? "SMS only"
                  : business?.inventoryAlertChannel === "email"
                    ? "Email only"
                    : "SMS & Email"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => checkAlertsMutation.mutate()}
                disabled={checkAlertsMutation.isPending || !business?.inventoryAlertsEnabled}
              >
                {checkAlertsMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-1" />
                ) : (
                  <Bell className="h-4 w-4 mr-1" />
                )}
                Check Now
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Manage alert preferences in your Business Profile settings (inventory alerts toggle, channel, default threshold).
          </p>
        </CardContent>
      </Card>

      {/* Inventory Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Package className="h-4 w-4" />
                Inventory Items
                <Badge variant="outline" className="ml-2">
                  {posName}
                </Badge>
              </CardTitle>
              <CardDescription>
                {stats?.lastSyncedAt
                  ? `Last synced: ${new Date(stats.lastSyncedAt).toLocaleString()}`
                  : "Not yet synced"}
                {totalItems > 0 && ` • ${totalItems} total items`}
              </CardDescription>
            </div>
            <Button
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
            >
              {syncMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Sync from {posName}
            </Button>
          </div>

          {/* Filters */}
          <div className="flex flex-col md:flex-row gap-3 mt-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search items by name, SKU, or category..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-full md:w-[200px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant={showLowStockOnly ? "default" : "outline"}
              size="sm"
              onClick={() => setShowLowStockOnly(!showLowStockOnly)}
              className="whitespace-nowrap"
            >
              <AlertTriangle className="h-4 w-4 mr-1" />
              Low Stock Only
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {itemsLoading && items.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">Loading inventory...</span>
            </div>
          ) : itemsError ? (
            <div className="text-center py-12 text-muted-foreground">
              <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-red-500" />
              <p>Failed to load inventory. Try syncing from {posName}.</p>
            </div>
          ) : totalItems === 0 && !debouncedSearch && categoryFilter === "all" && !showLowStockOnly ? (
            <div className="text-center py-12 text-muted-foreground">
              <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-lg font-medium">No inventory items yet</p>
              <p className="mt-1">Click &quot;Sync from {posName}&quot; to pull your items.</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item</TableHead>
                      <TableHead className="hidden md:table-cell">Category</TableHead>
                      <TableHead className="text-center">Qty</TableHead>
                      <TableHead className="text-center">Threshold</TableHead>
                      <TableHead className="text-center">Status</TableHead>
                      <TableHead className="text-center">Track</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          <Search className="h-6 w-6 mx-auto mb-2 opacity-50" />
                          <p>No items match your filters</p>
                        </TableCell>
                      </TableRow>
                    ) : (
                      items.map((item) => {
                        const isLow = item.track_stock && item.quantity < item.low_stock_threshold;
                        const isOut = item.track_stock && item.quantity === 0;

                        return (
                          <TableRow
                            key={item.id}
                            className={isOut ? "bg-red-50 dark:bg-red-950/20" : isLow ? "bg-yellow-50 dark:bg-yellow-950/20" : ""}
                          >
                            <TableCell>
                              <div>
                                <p className="font-medium">{item.name}</p>
                                {item.sku && (
                                  <p className="text-xs text-muted-foreground">SKU: {item.sku}</p>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="hidden md:table-cell">
                              <span className="text-sm text-muted-foreground">
                                {item.category || "—"}
                              </span>
                            </TableCell>
                            <TableCell className="text-center">
                              <span
                                className={`font-bold ${
                                  isOut
                                    ? "text-red-600"
                                    : isLow
                                      ? "text-yellow-600"
                                      : "text-green-600"
                                }`}
                              >
                                {item.quantity}
                              </span>
                            </TableCell>
                            <TableCell className="text-center">
                              {editingThreshold === item.id ? (
                                <div className="flex items-center gap-1 justify-center">
                                  <Input
                                    type="number"
                                    value={thresholdValue}
                                    onChange={(e) => setThresholdValue(e.target.value)}
                                    className="w-16 h-8 text-center"
                                    min={0}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        updateItemMutation.mutate({
                                          itemId: item.id,
                                          data: { lowStockThreshold: parseInt(thresholdValue) || 0 },
                                        });
                                      } else if (e.key === "Escape") {
                                        setEditingThreshold(null);
                                      }
                                    }}
                                    autoFocus
                                  />
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 px-2"
                                    onClick={() =>
                                      updateItemMutation.mutate({
                                        itemId: item.id,
                                        data: { lowStockThreshold: parseInt(thresholdValue) || 0 },
                                      })
                                    }
                                  >
                                    ✓
                                  </Button>
                                </div>
                              ) : (
                                <button
                                  className="text-sm hover:underline cursor-pointer"
                                  onClick={() => {
                                    setEditingThreshold(item.id);
                                    setThresholdValue(String(item.low_stock_threshold));
                                  }}
                                  title="Click to edit threshold"
                                >
                                  {item.low_stock_threshold}
                                </button>
                              )}
                            </TableCell>
                            <TableCell className="text-center">
                              {!item.track_stock ? (
                                <Badge variant="secondary" className="text-xs">
                                  <BellOff className="h-3 w-3 mr-1" />
                                  Untracked
                                </Badge>
                              ) : isOut ? (
                                <Badge variant="destructive" className="text-xs">
                                  <PackageX className="h-3 w-3 mr-1" />
                                  Out
                                </Badge>
                              ) : isLow ? (
                                <Badge variant="default" className="text-xs bg-yellow-500 hover:bg-yellow-600">
                                  <ArrowDown className="h-3 w-3 mr-1" />
                                  Low
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-xs text-green-600 border-green-300">
                                  OK
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-center">
                              <Switch
                                checked={item.track_stock}
                                onCheckedChange={(checked) =>
                                  updateItemMutation.mutate({
                                    itemId: item.id,
                                    data: { trackStock: checked },
                                  })
                                }
                              />
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                  <p className="text-sm text-muted-foreground">
                    Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, totalItems)} of {totalItems} items
                  </p>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(1)}
                      disabled={page <= 1}
                      className="h-8 w-8 p-0"
                    >
                      <ChevronsLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(page - 1)}
                      disabled={page <= 1}
                      className="h-8 w-8 p-0"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-sm px-3 font-medium">
                      Page {page} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(page + 1)}
                      disabled={page >= totalPages}
                      className="h-8 w-8 p-0"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(totalPages)}
                      disabled={page >= totalPages}
                      className="h-8 w-8 p-0"
                    >
                      <ChevronsRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}

              {items.length > 0 && totalPages <= 1 && (
                <p className="text-xs text-muted-foreground mt-4">
                  Showing {totalItems} item{totalItems !== 1 ? "s" : ""} •
                  Click a threshold value to edit • Toggle tracking per item
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
