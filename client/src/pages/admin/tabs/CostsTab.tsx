import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  TrendingUp, TrendingDown, AlertCircle, XCircle,
} from "lucide-react";
import type { CostsData } from "../types";
import { LoadingSpinner } from "../shared";

function CostRow({ service, details, cost, total }: {
  service: string;
  details: string;
  cost: number;
  total: number;
}) {
  return (
    <TableRow>
      <TableCell className="font-medium">{service}</TableCell>
      <TableCell className="text-sm text-muted-foreground">{details}</TableCell>
      <TableCell className="text-right">${cost.toFixed(2)}</TableCell>
      <TableCell className="text-right">
        {total > 0 ? ((cost / total) * 100).toFixed(1) : "0.0"}%
      </TableCell>
    </TableRow>
  );
}

function CostsTab() {
  const { data: costsData, isLoading, error } = useQuery<CostsData>({
    queryKey: ["/api/admin/costs"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/admin/costs");
      return res.json();
    },
  });

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (error || !costsData) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardContent className="pt-4">
          <div className="flex items-start gap-2">
            <XCircle className="h-5 w-5 text-red-500 mt-0.5" />
            <div>
              <p className="font-medium text-red-800">Could not load costs data</p>
              {error && <p className="text-sm text-red-700 mt-1">{(error as Error).message}</p>}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const marginColor = costsData.grossMargin >= 0 ? "text-emerald-600" : "text-red-600";
  const marginIcon = costsData.grossMargin >= 0
    ? <TrendingUp className="h-5 w-5 text-emerald-500" />
    : <TrendingDown className="h-5 w-5 text-red-500" />;

  return (
    <div className="space-y-6">
      {costsData.warnings.length > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-4">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5" />
              <div>
                <p className="font-medium text-amber-800">Some cost data unavailable</p>
                {costsData.warnings.map((w, i) => (
                  <p key={i} className="text-sm text-amber-700">{w}</p>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Revenue (MRR)</CardDescription>
            <CardTitle className="text-3xl text-emerald-600">
              ${costsData.revenue.mrr.toFixed(2)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">{costsData.period}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Costs</CardDescription>
            <CardTitle className="text-3xl text-red-600">
              ${costsData.totalCosts.toFixed(2)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">All services combined</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Gross Margin</CardDescription>
            <CardTitle className={`text-3xl ${marginColor}`}>
              ${costsData.grossMargin.toFixed(2)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-1">
              {marginIcon}
              <span className={`text-sm font-medium ${marginColor}`}>
                {costsData.grossMarginPercent.toFixed(1)}%
              </span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Cost per $1 Revenue</CardDescription>
            <CardTitle className="text-3xl text-gray-700">
              ${costsData.revenue.mrr > 0
                ? (costsData.totalCosts / costsData.revenue.mrr).toFixed(2)
                : "0.00"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Lower is better</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cost Breakdown by Service</CardTitle>
          <CardDescription>{costsData.period} &mdash; all amounts in USD</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Service</TableHead>
                <TableHead>Details</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">% of Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <CostRow service="Twilio \u2014 Calls" details="Inbound & outbound voice" cost={costsData.costs.twilio.calls} total={costsData.totalCosts} />
              <CostRow service="Twilio \u2014 SMS" details="Text notifications" cost={costsData.costs.twilio.sms} total={costsData.totalCosts} />
              <CostRow service="Twilio \u2014 Phone Numbers" details="Monthly number rental" cost={costsData.costs.twilio.phoneNumbers} total={costsData.totalCosts} />
              <CostRow service="Retell AI (Voice)" details={`${costsData.costs.vapi?.callCount ?? 0} calls \u2014 transport, STT, LLM, TTS`} cost={costsData.costs.vapi?.total ?? 0} total={costsData.totalCosts} />
              <CostRow service="Stripe Fees" details={`${costsData.costs.stripe.transactionCount} transactions`} cost={costsData.costs.stripe.fees} total={costsData.totalCosts} />
              <CostRow service="Email (Estimated)" details={`${costsData.costs.email.count} emails @ $${costsData.costs.email.ratePerEmail}/ea`} cost={costsData.costs.email.total} total={costsData.totalCosts} />
              <CostRow service={`Railway (Hosting)${costsData.costs.railway?.estimated ? " *" : ""}`} details="Server, database & networking" cost={costsData.costs.railway?.total || 0} total={costsData.totalCosts} />
              <TableRow className="font-bold border-t-2">
                <TableCell>TOTAL</TableCell>
                <TableCell />
                <TableCell className="text-right">${costsData.totalCosts.toFixed(2)}</TableCell>
                <TableCell className="text-right">100%</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Per-Business Profitability (Estimated)</CardTitle>
          <CardDescription>
            Revenue vs estimated costs per business, sorted by profit.
            Costs allocated proportionally based on actual usage.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Business</TableHead>
                <TableHead className="text-right">Revenue/mo</TableHead>
                <TableHead className="text-right">Call Cost</TableHead>
                <TableHead className="text-right">SMS Cost</TableHead>
                <TableHead className="text-right">Phone #</TableHead>
                <TableHead className="text-right">Total Cost</TableHead>
                <TableHead className="text-right">Profit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {costsData.perBusiness.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    No businesses yet
                  </TableCell>
                </TableRow>
              ) : (
                costsData.perBusiness.map((b) => (
                  <TableRow key={b.businessId}>
                    <TableCell className="font-medium">{b.businessName}</TableCell>
                    <TableCell className="text-right">${b.subscriptionRevenue.toFixed(2)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">${b.estimatedCallCost.toFixed(2)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">${b.estimatedSmsCost.toFixed(2)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">${b.phoneNumberCost.toFixed(2)}</TableCell>
                    <TableCell className="text-right text-red-600">${b.totalEstimatedCost.toFixed(2)}</TableCell>
                    <TableCell className={`text-right font-bold ${b.estimatedProfit >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      ${b.estimatedProfit.toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export default CostsTab;
