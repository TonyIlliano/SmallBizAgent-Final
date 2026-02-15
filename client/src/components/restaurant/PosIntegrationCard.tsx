import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface PosIntegrationCardProps {
  name: string;
  description: string;
  icon: React.ReactNode;
  features: string[];
  comingSoon?: boolean;
  connected?: boolean;
  accentColor?: string;
}

export function PosIntegrationCard({
  name,
  description,
  icon,
  features,
  comingSoon = false,
  connected = false,
  accentColor = "gray",
}: PosIntegrationCardProps) {
  const { toast } = useToast();

  const handleConnect = () => {
    toast({
      title: "Coming Soon",
      description: `${name} integration is under development. We'll notify you when it's available.`,
    });
  };

  return (
    <Card className={connected ? "border-green-200" : ""}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg bg-${accentColor}-100 flex items-center justify-center`}>
              {icon}
            </div>
            <div>
              <CardTitle className="text-base">{name}</CardTitle>
              <CardDescription className="text-xs">{description}</CardDescription>
            </div>
          </div>
          {connected ? (
            <Badge variant="outline" className="border-green-500 text-green-600">
              <CheckCircle2 className="w-3 h-3 mr-1" />
              Connected
            </Badge>
          ) : comingSoon ? (
            <Badge variant="outline" className="border-blue-400 text-blue-600 bg-blue-50">
              Coming Soon
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              Not Connected
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <ul className="space-y-1.5 mb-4">
          {features.map((feature) => (
            <li key={feature} className="text-sm text-muted-foreground flex items-start gap-2">
              <span className="text-primary mt-0.5">•</span>
              {feature}
            </li>
          ))}
        </ul>
        {!connected && (
          <Button
            onClick={handleConnect}
            disabled={comingSoon}
            variant={comingSoon ? "outline" : "default"}
            className="w-full"
            size="sm"
          >
            {comingSoon ? `${name} — Coming Soon` : `Connect ${name}`}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
