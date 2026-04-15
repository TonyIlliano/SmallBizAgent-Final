/**
 * AdTargetingReference -- Collapsible Meta ad targeting cheat sheet.
 */

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ChevronDown, ChevronUp, Copy, Target } from "lucide-react";
import { AD_TARGETING } from "./socialMediaTypes";

export default function AdTargetingReference() {
  const { toast } = useToast();
  const [expanded, setExpanded] = useState(false);

  const copyTargeting = () => {
    const text = `AD TARGETING -- SmallBizAgent
Objective: Lead Generation -> Demo Booking
CTA: Book Now -> smallbizagent.ai/demo
Budget: ${AD_TARGETING.budget}

INTERESTS: ${AD_TARGETING.interests.join(", ")}
BEHAVIORS: ${AD_TARGETING.behaviors.join(", ")}
AGE: ${AD_TARGETING.demographics.age}
LOCATIONS: ${AD_TARGETING.demographics.locations}
JOB TITLES: ${AD_TARGETING.demographics.jobTitles.join(", ")}`;

    navigator.clipboard.writeText(text);
    toast({ title: "Targeting sheet copied to clipboard" });
  };

  return (
    <Card>
      <CardHeader className="cursor-pointer" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            <CardTitle className="text-base">Ad Targeting Cheat Sheet</CardTitle>
          </div>
          {expanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
        </div>
        <CardDescription>Meta ad targeting parameters for SmallBizAgent's audience</CardDescription>
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-4">
          {/* Objective banner */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wider mb-1">Campaign Objective</p>
              <p className="font-semibold">{AD_TARGETING.objective}</p>
              <p className="text-xs text-muted-foreground mt-1">{AD_TARGETING.cta}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Daily Budget</p>
              <p className="text-xl font-bold font-mono text-amber-600">{AD_TARGETING.budget}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Interests */}
            <div className="border rounded-lg p-4">
              <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-3">Interests</p>
              <div className="flex flex-wrap gap-1.5">
                {AD_TARGETING.interests.map((i) => (
                  <Badge key={i} variant="secondary" className="text-xs">{i}</Badge>
                ))}
              </div>
            </div>

            {/* Behaviors + Demographics */}
            <div className="border rounded-lg p-4">
              <p className="text-xs font-semibold text-purple-600 uppercase tracking-wider mb-3">Behaviors</p>
              <div className="flex flex-wrap gap-1.5 mb-4">
                {AD_TARGETING.behaviors.map((b) => (
                  <Badge key={b} variant="secondary" className="text-xs">{b}</Badge>
                ))}
              </div>
              <div className="border-t pt-3">
                <p className="text-xs font-semibold text-amber-600 uppercase tracking-wider mb-2">Demographics</p>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Age</span>
                    <span className="font-mono">{AD_TARGETING.demographics.age}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Location</span>
                    <span>{AD_TARGETING.demographics.locations}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Job Titles */}
          <div className="border rounded-lg p-4">
            <p className="text-xs font-semibold text-red-600 uppercase tracking-wider mb-3">Job Titles to Target</p>
            <div className="flex flex-wrap gap-1.5">
              {AD_TARGETING.demographics.jobTitles.map((t) => (
                <Badge key={t} variant="outline" className="text-xs border-red-200 text-red-700">{t}</Badge>
              ))}
            </div>
          </div>

          <Button variant="outline" className="flex items-center gap-2" onClick={copyTargeting}>
            <Copy className="h-4 w-4" />
            Copy Full Targeting Sheet
          </Button>
        </CardContent>
      )}
    </Card>
  );
}
