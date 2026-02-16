import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Receipt, DollarSign, TrendingUp, AlertCircle, ShoppingBag, Truck, Clock } from "lucide-react";

interface OrderHistoryProps {
  businessId: number;
}

interface OrderItem {
  name?: string;
  cloverItemId?: string;
  itemId?: string;
  quantity: number;
  price?: number;
  notes?: string;
}

interface Order {
  id: number;
  posType: "clover" | "square";
  posOrderId: string | null;
  callerPhone: string | null;
  callerName: string | null;
  items: OrderItem[] | null;
  totalAmount: number | null;
  status: string | null;
  orderType: string | null;
  errorMessage: string | null;
  createdAt: string | null;
}

interface OrderStats {
  totalOrders: number;
  failedOrders: number;
  totalRevenue: number;
  todayOrders: number;
  todayRevenue: number;
}

function formatCents(cents: number | null): string {
  if (cents === null || cents === undefined) return "$0.00";
  return `$${(cents / 100).toFixed(2)}`;
}

function formatTime(dateStr: string | null): string {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatItemList(items: OrderItem[] | null): string {
  if (!items || items.length === 0) return "—";
  return items
    .map((item) => {
      const qty = item.quantity > 1 ? `${item.quantity}x ` : "";
      const name = item.name || item.cloverItemId || item.itemId || "item";
      return `${qty}${name}`;
    })
    .join(", ");
}

export default function OrderHistory({ businessId }: OrderHistoryProps) {
  const { data, isLoading } = useQuery<{ orders: Order[]; stats: OrderStats }>({
    queryKey: [`/api/orders?businessId=${businessId}&limit=50`],
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const orders = data?.orders || [];
  const stats = data?.stats || {
    totalOrders: 0,
    failedOrders: 0,
    totalRevenue: 0,
    todayOrders: 0,
    todayRevenue: 0,
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Receipt className="h-5 w-5 text-muted-foreground" />
        <div>
          <h3 className="text-lg font-semibold">Order History</h3>
          <p className="text-sm text-muted-foreground">
            Orders placed through the AI phone receptionist
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-100">
                <ShoppingBag className="h-4 w-4 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.todayOrders}</p>
                <p className="text-xs text-muted-foreground">Today's Orders</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100">
                <DollarSign className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{formatCents(stats.todayRevenue)}</p>
                <p className="text-xs text-muted-foreground">Today's Revenue</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-100">
                <TrendingUp className="h-4 w-4 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.totalOrders}</p>
                <p className="text-xs text-muted-foreground">All-Time Orders</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-orange-100">
                <DollarSign className="h-4 w-4 text-orange-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{formatCents(stats.totalRevenue)}</p>
                <p className="text-xs text-muted-foreground">All-Time Revenue</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Orders Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Orders</CardTitle>
          <CardDescription>
            {orders.length === 0
              ? "No orders yet. Orders placed through the AI will appear here."
              : `Showing ${orders.length} most recent orders`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Clock className="h-4 w-4 mr-2 animate-spin" />
              Loading orders...
            </div>
          ) : orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
              <Receipt className="h-8 w-8 mb-2 opacity-50" />
              <p className="text-sm">No orders yet</p>
              <p className="text-xs">When customers order through the AI, they'll show up here</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((order) => (
                    <TableRow key={`${order.posType}-${order.id}`}>
                      <TableCell className="whitespace-nowrap text-sm">
                        {formatTime(order.createdAt)}
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium text-sm">
                            {order.callerName || "Unknown"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {order.callerPhone || "—"}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm max-w-[200px] truncate">
                        {formatItemList(order.items)}
                      </TableCell>
                      <TableCell className="font-medium text-sm">
                        {order.totalAmount ? formatCents(order.totalAmount) : "—"}
                      </TableCell>
                      <TableCell>
                        {order.orderType === "delivery" ? (
                          <Badge variant="outline" className="gap-1">
                            <Truck className="h-3 w-3" />
                            Delivery
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="gap-1">
                            <ShoppingBag className="h-3 w-3" />
                            Pickup
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {order.status === "created" ? (
                          <Badge className="bg-green-100 text-green-700 hover:bg-green-100">
                            Placed
                          </Badge>
                        ) : (
                          <Badge
                            variant="destructive"
                            className="gap-1 cursor-help"
                            title={order.errorMessage || "Order failed"}
                          >
                            <AlertCircle className="h-3 w-3" />
                            Failed
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
