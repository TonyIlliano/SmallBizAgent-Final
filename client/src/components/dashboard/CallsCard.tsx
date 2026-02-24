import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { formatDateTime, formatPhoneNumber } from "@/lib/utils";
import { Phone, ArrowRight, PhoneIncoming, PhoneMissed, Voicemail } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton-loader";
import { useAuth } from "@/hooks/use-auth";

interface CallsCardProps {
  businessId?: number | null;
  limit?: number;
}

export function CallsCard({ businessId, limit = 3 }: CallsCardProps) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { data: calls = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/call-logs', { businessId }],
    enabled: !!businessId,
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'answered':
        return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0 text-xs font-medium">Answered</Badge>;
      case 'missed':
        return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-0 text-xs font-medium">Missed</Badge>;
      case 'voicemail':
        return <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-0 text-xs font-medium">Voicemail</Badge>;
      default:
        return <Badge className="text-xs font-medium">{status}</Badge>;
    }
  };

  const getIntentBadge = (intent: string) => {
    switch (intent) {
      case 'appointment':
        return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-0 text-xs font-medium">Scheduled</Badge>;
      case 'inquiry':
        return <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border-0 text-xs font-medium">Inquiry</Badge>;
      case 'emergency':
        return <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-0 text-xs font-medium">Emergency</Badge>;
      default:
        return null;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'answered':
        return <PhoneIncoming className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />;
      case 'missed':
        return <PhoneMissed className="h-4 w-4 text-amber-600 dark:text-amber-400" />;
      case 'voicemail':
        return <Voicemail className="h-4 w-4 text-blue-600 dark:text-blue-400" />;
      default:
        return <Phone className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const limitedCalls = limit && calls ? calls.slice(0, limit) : calls;

  return (
    <Card className="border-border bg-card shadow-sm rounded-xl overflow-hidden">
      <CardHeader className="pb-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/30">
            <Phone className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Recent Calls</h3>
            <p className="text-sm text-muted-foreground">Handled by AI Receptionist</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-4 space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-start gap-3">
                <Skeleton className="h-10 w-10 rounded-xl" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : limitedCalls && limitedCalls.length > 0 ? (
          <div className="divide-y divide-border">
            {limitedCalls.map((call: any) => (
              <div key={call.id} className="py-4 px-4 flex items-start gap-4 hover:bg-muted/50 transition-colors">
                <div className="flex-shrink-0 h-10 w-10 rounded-xl bg-muted flex items-center justify-center">
                  {getStatusIcon(call.status)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-sm font-semibold text-foreground">
                      {formatPhoneNumber(call.callerId)}
                    </h4>
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(call.callTime)}
                    </span>
                  </div>
                  {isAdmin && call.transcript && (
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{call.transcript}</p>
                  )}
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    {getStatusBadge(call.status)}
                    {call.intentDetected && getIntentBadge(call.intentDetected)}
                    {call.isEmergency && (
                      <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-0 text-xs font-medium">
                        Emergency
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-12 flex flex-col items-center justify-center text-center px-4">
            <div className="p-4 rounded-full bg-muted mb-4">
              <Phone className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-sm font-semibold text-foreground">No recent calls</h3>
            <p className="mt-1 text-sm text-muted-foreground max-w-[200px]">
              The AI receptionist hasn't handled any calls yet
            </p>
          </div>
        )}
      </CardContent>
      {calls && calls.length > 0 && (
        <CardFooter className="bg-muted/50 px-4 py-3 border-t border-border">
          <Link href="/receptionist">
            <Button variant="ghost" size="sm" className="h-9 text-foreground hover:bg-muted group">
              View all calls
              <ArrowRight className="h-4 w-4 ml-1 group-hover:translate-x-0.5 transition-transform" />
            </Button>
          </Link>
        </CardFooter>
      )}
    </Card>
  );
}
