import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bot, Phone, CalendarCheck, DollarSign, TrendingUp, ArrowRight } from "lucide-react";
import { Link } from "wouter";

interface AiRoiData {
  period: string;
  totalCalls: number;
  answeredCalls: number;
  bookedFromCalls: number;
  revenueFromBookings: number;
  planCost: number;
  roi: number | null;
  conversionRate: number;
  avgRevenuePerBooking: number;
}

export function AiRoiCard({ businessId }: { businessId?: number }) {
  const { data, isLoading } = useQuery<AiRoiData>({
    queryKey: ["/api/analytics/ai-roi", businessId],
    enabled: !!businessId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-muted rounded w-1/3"></div>
            <div className="h-8 bg-muted rounded w-1/2"></div>
            <div className="h-4 bg-muted rounded w-2/3"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.totalCalls === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            AI Receptionist ROI
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Your AI receptionist hasn't answered any calls yet. Once it does, you'll see how many calls converted to bookings and revenue here.
          </p>
        </CardContent>
      </Card>
    );
  }

  const roiPositive = data.roi !== null && data.roi > 0;
  const roiColor = roiPositive ? "text-green-600" : data.roi !== null ? "text-red-500" : "text-muted-foreground";

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            AI Receptionist ROI
          </CardTitle>
          <span className="text-xs text-muted-foreground">Last 30 days</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Funnel: Calls → Bookings → Revenue */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-col items-center flex-1">
            <Phone className="h-4 w-4 text-blue-500 mb-1" />
            <span className="text-2xl font-bold">{data.answeredCalls}</span>
            <span className="text-xs text-muted-foreground">calls answered</span>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="flex flex-col items-center flex-1">
            <CalendarCheck className="h-4 w-4 text-emerald-500 mb-1" />
            <span className="text-2xl font-bold">{data.bookedFromCalls}</span>
            <span className="text-xs text-muted-foreground">booked</span>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="flex flex-col items-center flex-1">
            <DollarSign className="h-4 w-4 text-green-500 mb-1" />
            <span className="text-2xl font-bold">${data.revenueFromBookings.toLocaleString()}</span>
            <span className="text-xs text-muted-foreground">revenue</span>
          </div>
        </div>

        {/* ROI + Stats */}
        <div className="grid grid-cols-3 gap-4 pt-2 border-t">
          <div className="text-center">
            <div className={`text-lg font-bold flex items-center justify-center gap-1 ${roiColor}`}>
              {data.roi !== null ? (
                <>
                  <TrendingUp className="h-4 w-4" />
                  {data.roi > 0 ? '+' : ''}{data.roi}%
                </>
              ) : (
                'N/A'
              )}
            </div>
            <span className="text-xs text-muted-foreground">ROI</span>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold">{data.conversionRate}%</div>
            <span className="text-xs text-muted-foreground">conversion</span>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold">${data.avgRevenuePerBooking}</div>
            <span className="text-xs text-muted-foreground">avg booking</span>
          </div>
        </div>

        {/* Link to full analytics */}
        <div className="pt-1">
          <Link href="/analytics" className="text-xs text-primary hover:underline flex items-center gap-1">
            View full analytics <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
