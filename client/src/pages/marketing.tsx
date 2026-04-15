import { useState, lazy, Suspense } from "react";
import { PageLayout } from "@/components/layout/PageLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, BarChart3, UserX, Megaphone, Cake, Star } from "lucide-react";

// ── Lazy-loaded tab components ──────────────────────────────────────────

const InsightsTab = lazy(() => import("@/components/marketing/InsightsTab"));
const WinBackTab = lazy(() => import("@/components/marketing/WinBackTab"));
const CampaignsTab = lazy(() => import("@/components/marketing/CampaignsTab"));
const ReviewBoosterTab = lazy(() => import("@/components/marketing/ReviewBoosterTab"));
const BirthdayTab = lazy(() => import("@/components/marketing/BirthdayTab"));

// ── Loading fallback ────────────────────────────────────────────────────

function TabLoadingFallback() {
  return (
    <div className="flex justify-center py-12">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

// ── Tab configuration ───────────────────────────────────────────────────

const TAB_CONFIG = [
  { value: "insights", label: "Insights", icon: BarChart3 },
  { value: "winback", label: "Win-Back", icon: UserX },
  { value: "campaigns", label: "Campaigns", icon: Megaphone },
  { value: "birthday", label: "Birthday", icon: Cake },
  { value: "reviews", label: "Reviews", icon: Star },
] as const;

const TAB_COMPONENTS: Record<string, React.LazyExoticComponent<React.ComponentType>> = {
  insights: InsightsTab,
  winback: WinBackTab,
  campaigns: CampaignsTab,
  birthday: BirthdayTab,
  reviews: ReviewBoosterTab,
};

// ── Main Component ──────────────────────────────────────────────────────

export default function MarketingPage() {
  const [activeTab, setActiveTab] = useState("insights");

  return (
    <PageLayout title="Marketing">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Marketing Hub</h2>
          <p className="text-muted-foreground mt-1">
            Grow your business with smart insights, automated campaigns, and
            reputation management.
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            {TAB_CONFIG.map(({ value, label, icon: Icon }) => (
              <TabsTrigger
                key={value}
                value={value}
                className="flex items-center gap-1.5"
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{label}</span>
              </TabsTrigger>
            ))}
          </TabsList>

          {TAB_CONFIG.map(({ value }) => {
            const TabComponent = TAB_COMPONENTS[value];
            return (
              <TabsContent key={value} value={value}>
                {activeTab === value && (
                  <Suspense fallback={<TabLoadingFallback />}>
                    <TabComponent />
                  </Suspense>
                )}
              </TabsContent>
            );
          })}
        </Tabs>
      </div>
    </PageLayout>
  );
}
