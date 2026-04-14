import { useState, lazy, Suspense } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Redirect } from "wouter";
import { PageLayout } from "@/components/layout/PageLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import {
  BarChart3, Building, Users, DollarSign, Bot, MessageSquare,
  FileText, PieChart, Server, ScrollText, Activity, Shield,
} from "lucide-react";

// ── Lazy-loaded tab components ──────────────────────────────────────────

const OverviewTab = lazy(() => import("./tabs/OverviewTab"));
const BusinessesTab = lazy(() => import("./tabs/BusinessesTab"));
const UsersTab = lazy(() => import("./tabs/UsersTab"));
const RevenueTab = lazy(() => import("./tabs/RevenueTab"));
const AgentsTab = lazy(() => import("./tabs/AgentsTab"));
const MessagesTab = lazy(() => import("./tabs/MessagesTab"));
const ContentTab = lazy(() => import("./tabs/ContentTab"));
const CostsTab = lazy(() => import("./tabs/CostsTab"));
const SystemTab = lazy(() => import("./tabs/SystemTab"));
const AuditLogTab = lazy(() => import("./tabs/AuditLogTab"));
const MonitoringTab = lazy(() => import("./tabs/MonitoringTab"));

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
  { value: "overview", label: "Overview", icon: BarChart3 },
  { value: "businesses", label: "Businesses", icon: Building },
  { value: "users", label: "Users", icon: Users },
  { value: "revenue", label: "Revenue", icon: DollarSign },
  { value: "agents", label: "AI Agents", icon: Bot },
  { value: "messages", label: "Messages", icon: MessageSquare },
  { value: "content", label: "Content", icon: FileText },
  { value: "costs", label: "Costs & P/L", icon: PieChart },
  { value: "system", label: "System", icon: Server },
  { value: "audit", label: "Audit Log", icon: ScrollText },
  { value: "monitoring", label: "Monitoring", icon: Activity },
] as const;

const TAB_COMPONENTS: Record<string, React.LazyExoticComponent<React.ComponentType>> = {
  overview: OverviewTab,
  businesses: BusinessesTab,
  users: UsersTab,
  revenue: RevenueTab,
  agents: AgentsTab,
  messages: MessagesTab,
  content: ContentTab,
  costs: CostsTab,
  system: SystemTab,
  audit: AuditLogTab,
  monitoring: MonitoringTab,
};

// ── Main Component ──────────────────────────────────────────────────────

const AdminDashboardPage = () => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("overview");

  if (user && user.role !== "admin") {
    return <Redirect to="/dashboard" />;
  }
  if (!user) {
    return <Redirect to="/auth" />;
  }

  return (
    <PageLayout title="Admin Dashboard">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">Admin Dashboard</h1>
          <p className="text-muted-foreground mt-1">Platform overview and management</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="destructive" className="flex items-center gap-1">
            <Shield className="h-3 w-3" />
            Admin
          </Badge>
          <span className="text-sm text-muted-foreground">{user.username}</span>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="flex w-full overflow-x-auto md:grid md:w-full md:grid-cols-11 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {TAB_CONFIG.map(({ value, label, icon: Icon }) => (
            <TabsTrigger
              key={value}
              value={value}
              className="flex items-center gap-2 whitespace-nowrap flex-shrink-0"
            >
              <Icon className="h-4 w-4" />
              {label}
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
    </PageLayout>
  );
};

export default AdminDashboardPage;
