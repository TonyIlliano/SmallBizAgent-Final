import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { formatDateTime, formatPhoneNumber } from "@/lib/utils";
import { Phone } from "lucide-react";

interface CallsCardProps {
  businessId?: number;
  limit?: number;
}

export function CallsCard({ businessId = 1, limit = 3 }: CallsCardProps) {
  const { data: calls, isLoading } = useQuery({
    queryKey: ['/api/call-logs', { businessId }],
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'answered':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Answered</Badge>;
      case 'missed':
        return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Missed</Badge>;
      case 'voicemail':
        return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Voicemail</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  const getIntentBadge = (intent: string) => {
    switch (intent) {
      case 'appointment':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Scheduled</Badge>;
      case 'inquiry':
        return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">Inquiry</Badge>;
      case 'emergency':
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Emergency</Badge>;
      default:
        return null;
    }
  };

  const getIconColor = (status: string) => {
    switch (status) {
      case 'answered':
        return "text-green-500";
      case 'missed':
        return "text-yellow-500";
      case 'voicemail':
        return "text-blue-500";
      default:
        return "text-gray-500";
    }
  };

  const limitedCalls = limit && calls ? calls.slice(0, limit) : calls;

  return (
    <Card>
      <CardHeader className="pb-3 border-b border-gray-200">
        <h3 className="text-lg font-medium text-gray-900">Recent Calls</h3>
        <p className="text-sm text-gray-500 mt-1">Handled by Virtual Receptionist</p>
      </CardHeader>
      <CardContent className="px-4 py-3 sm:p-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div>
          </div>
        ) : limitedCalls && limitedCalls.length > 0 ? (
          <div className="divide-y divide-gray-200">
            {limitedCalls.map((call: any) => (
              <div key={call.id} className="py-3 flex items-start">
                <div className="flex-shrink-0">
                  <Phone className={`h-5 w-5 ${getIconColor(call.status)}`} />
                </div>
                <div className="ml-3 flex-1">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium text-gray-900">
                      {formatPhoneNumber(call.callerId)}
                    </h4>
                    <span className="text-sm text-gray-500">
                      {formatDateTime(call.callTime)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 mt-1">{call.transcript}</p>
                  <div className="mt-1 flex items-center space-x-2">
                    {getStatusBadge(call.status)}
                    {call.intentDetected && getIntentBadge(call.intentDetected)}
                    {call.isEmergency && (
                      <Badge className="bg-red-100 text-red-800 hover:bg-red-100">
                        Emergency
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-8 flex flex-col items-center justify-center text-center">
            <Phone className="h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No recent calls</h3>
            <p className="mt-1 text-sm text-gray-500">The virtual receptionist hasn't handled any calls yet.</p>
          </div>
        )}
      </CardContent>
      {calls && calls.length > 0 && (
        <CardFooter className="bg-gray-50 px-4 py-4 border-t border-gray-200">
          <Link href="/receptionist">
            <a className="text-sm font-medium text-primary-600 hover:text-primary-700">
              View all call history →
            </a>
          </Link>
        </CardFooter>
      )}
    </Card>
  );
}
