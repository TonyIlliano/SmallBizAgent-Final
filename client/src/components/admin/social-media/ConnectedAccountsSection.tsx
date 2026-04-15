/**
 * ConnectedAccountsSection — OAuth social media account connections.
 */

import { useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Loader2, CheckCircle, Link2, Unlink } from "lucide-react";
import { PLATFORMS, type ConnectionStatus } from "./socialMediaTypes";

export default function ConnectedAccountsSection() {
  const { toast } = useToast();

  const { data: statuses, isLoading } = useQuery<Record<string, ConnectionStatus>>({
    queryKey: ["/api/social-media/status"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/social-media/status");
      return res.json();
    },
  });

  // Listen for OAuth popup callback
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "social-connected") {
        queryClient.invalidateQueries({ queryKey: ["/api/social-media/status"] });
        toast({
          title: `${event.data.platform} connected!`,
          description: "Your account has been linked successfully.",
        });
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [toast]);

  const connectMutation = useMutation({
    mutationFn: async (platform: string) => {
      const res = await apiRequest("GET", `/api/social-media/${platform}/auth-url`);
      const data = await res.json();
      return data.url;
    },
    onSuccess: (url) => {
      if (!url) {
        toast({ title: "Not configured", description: "This platform's OAuth credentials are not set up on the server yet.", variant: "destructive" });
        return;
      }
      window.open(url, "_blank", "width=600,height=700");
    },
    onError: (err: Error) => {
      toast({ title: "Connection failed", description: err.message, variant: "destructive" });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async (platform: string) => {
      await apiRequest("DELETE", `/api/social-media/${platform}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/social-media/status"] });
      toast({ title: "Disconnected", description: "Account has been unlinked." });
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Link2 className="h-5 w-5" />
          Connected Accounts
        </CardTitle>
        <CardDescription>Connect your social media accounts to enable publishing</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {PLATFORMS.map((platform) => {
              const status = statuses?.[platform.id];
              const connected = status?.connected || false;

              return (
                <div
                  key={platform.id}
                  className={`flex items-center justify-between p-4 border rounded-lg ${connected ? "border-emerald-200 bg-emerald-50/50" : ""}`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg font-bold ${platform.color}`}>
                      {platform.icon}
                    </div>
                    <div>
                      <p className="font-medium text-sm">{platform.name}</p>
                      {connected ? (
                        <p className="text-xs text-emerald-600 flex items-center gap-1">
                          <CheckCircle className="h-3 w-3" /> Connected
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">Not connected</p>
                      )}
                    </div>
                  </div>
                  <div>
                    {connected ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        onClick={() => disconnectMutation.mutate(platform.id)}
                        disabled={disconnectMutation.isPending}
                      >
                        <Unlink className="h-4 w-4" />
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => connectMutation.mutate(platform.id)}
                        disabled={connectMutation.isPending}
                      >
                        {connectMutation.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          "Connect"
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
