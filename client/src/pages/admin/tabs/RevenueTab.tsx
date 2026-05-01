import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { TrendingUp } from "lucide-react";
import type { RevenueData } from "../types";
import { MiniStatCard, LoadingSpinner } from "../shared";

function RevenueTab() {
  const { data: revenue, isLoading } = useQuery<RevenueData>({
    queryKey: ["/api/admin/revenue"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/revenue");
      return res.json();
    },
  });

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!revenue) {
    return <p className="text-center text-muted-foreground py-8">Could not load revenue data</p>;
  }

  const totalBusinesses = revenue.activeCount + revenue.inactiveCount + revenue.trialingCount + revenue.pastDueCount + revenue.canceledCount;
  const churnColor = revenue.churnRate > 5 ? "text-red-600" : revenue.churnRate > 2 ? "text-amber-600" : "text-emerald-600";

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Monthly Recurring Revenue</CardDescription>
            <CardTitle className="text-3xl text-emerald-600">${revenue.mrr.toFixed(2)}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">ARR: ${revenue.arr.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Monthly Churn Rate</CardDescription>
            <CardTitle className={`text-3xl ${churnColor}`}>{revenue.churnRate}%</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">{revenue.canceledCount} canceled (last 30d)</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Avg Revenue per Business</CardDescription>
            <CardTitle className="text-3xl text-blue-600">${revenue.avgRevenuePerBusiness.toFixed(2)}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Per active subscriber/mo</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Estimated LTV</CardDescription>
            <CardTitle className="text-3xl text-purple-600">${revenue.lifetimeValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Based on ARPU / churn</p>
          </CardContent>
        </Card>
      </div>

      {/* Subscription Status Breakdown */}
      <div className="grid gap-4 md:grid-cols-5">
        <MiniStatCard label="Active" value={revenue.activeCount} color="text-emerald-600" />
        <MiniStatCard label="Trialing" value={revenue.trialingCount} color="text-blue-600" />
        <MiniStatCard label="Past Due" value={revenue.pastDueCount} color="text-amber-600" />
        <MiniStatCard label="Canceled" value={revenue.canceledCount} color="text-red-600" />
        <MiniStatCard label="Inactive" value={revenue.inactiveCount} color="text-gray-500" />
      </div>

      {/* MRR Trend */}
      {revenue.mrrTrend && revenue.mrrTrend.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              MRR Trend (Last 6 Months)
            </CardTitle>
            <CardDescription>Monthly recurring revenue, new signups, and churn over time</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="grid grid-cols-6 gap-2">
                {revenue.mrrTrend.map((m) => {
                  const maxMrr = Math.max(...revenue.mrrTrend.map(t => t.mrr), 1);
                  const barHeight = Math.max((m.mrr / maxMrr) * 100, 4);
                  return (
                    <div key={m.month} className="flex flex-col items-center gap-1">
                      <div className="w-full h-24 flex items-end justify-center">
                        <div
                          className="w-8 bg-emerald-500 rounded-t transition-all"
                          style={{ height: `${barHeight}%` }}
                          title={`$${m.mrr.toFixed(2)}`}
                        />
                      </div>
                      <span className="text-xs font-medium">{m.month.slice(5)}</span>
                      <span className="text-xs text-muted-foreground">${m.mrr.toFixed(0)}</span>
                    </div>
                  );
                })}
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Month</TableHead>
                    <TableHead className="text-right">MRR</TableHead>
                    <TableHead className="text-right">Active</TableHead>
                    <TableHead className="text-right">New</TableHead>
                    <TableHead className="text-right">Churned</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {revenue.mrrTrend.map((m) => (
                    <TableRow key={m.month}>
                      <TableCell className="font-medium">{m.month}</TableCell>
                      <TableCell className="text-right text-emerald-600 font-medium">${m.mrr.toFixed(2)}</TableCell>
                      <TableCell className="text-right">{m.activeBusinesses}</TableCell>
                      <TableCell className="text-right text-blue-600">+{m.newBusinesses}</TableCell>
                      <TableCell className="text-right text-red-600">{m.churned > 0 ? `-${m.churned}` : "0"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* MRR Forecast */}
      {revenue.forecast && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-blue-500" />
              MRR Forecast
            </CardTitle>
            <CardDescription>
              {revenue.forecast.methodology} &bull; Monthly growth: {revenue.forecast.growthRate > 0 ? '+' : ''}{revenue.forecast.growthRate}%
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Pessimistic</TableHead>
                  <TableHead className="text-right">Projected</TableHead>
                  <TableHead className="text-right">Optimistic</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {revenue.forecast.months.map((m) => (
                  <TableRow key={m.month}>
                    <TableCell className="font-medium">{m.month}</TableCell>
                    <TableCell className="text-right text-red-600">${m.pessimistic.toFixed(2)}</TableCell>
                    <TableCell className="text-right font-semibold">${m.projected.toFixed(2)}</TableCell>
                    <TableCell className="text-right text-emerald-600">${m.optimistic.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Plan Distribution */}
      <Card>
        <CardHeader>
          <CardTitle>Plan Distribution</CardTitle>
          <CardDescription>Businesses by subscription plan ({totalBusinesses} total)</CardDescription>
        </CardHeader>
        <CardContent>
          {revenue.planDistribution.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No subscription plans configured yet</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Plan</TableHead>
                  <TableHead>Tier</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="text-right">Businesses</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {revenue.planDistribution.map((plan, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{plan.planName || "\u2014"}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">{plan.planTier || "\u2014"}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {plan.price ? `$${Number(plan.price).toFixed(2)}/mo` : "\u2014"}
                    </TableCell>
                    <TableCell className="text-right font-medium">{plan.businessCount}</TableCell>
                    <TableCell className="text-right font-medium text-emerald-600">
                      ${plan.revenue.toFixed(2)}/mo
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default RevenueTab;
