import React, { useState, useEffect, lazy, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageLayout } from "@/components/layout/PageLayout";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { SkeletonForm } from "@/components/ui/skeleton-loader";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { buildSettingsSections, type SettingsSection } from "./constants";

// Lazy-loaded section components
const BusinessSection = lazy(() => import("./BusinessSection"));
const CommunicationSection = lazy(() => import("./CommunicationSection"));
const IntegrationsSection = lazy(() => import("./IntegrationsSection"));
const BillingSection = lazy(() => import("./BillingSection"));
const AccountSection = lazy(() => import("./AccountSection"));

function SectionLoader() {
  return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

// --- Settings Navigation (mobile accordion) ---
function SettingsNav({
  activeTab,
  onTabChange,
  sections,
}: {
  activeTab: string;
  onTabChange: (tab: string) => void;
  sections: SettingsSection[];
}) {
  const activeSectionForTab = (tab: string) =>
    sections.find((s) => s.tabs.some((t) => t.value === tab))?.title;

  const [expandedSections, setExpandedSections] = useState<Set<string>>(() => {
    const initialSection = activeSectionForTab(activeTab);
    return new Set(initialSection ? [initialSection] : ["Business"]);
  });

  const toggleSection = (title: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  };

  useEffect(() => {
    const section = activeSectionForTab(activeTab);
    if (section && !expandedSections.has(section)) {
      setExpandedSections((prev) => new Set(prev).add(section));
    }
  }, [activeTab]);

  return (
    <div className="md:hidden space-y-1 mb-6">
      {sections.map((section) => {
        const isExpanded = expandedSections.has(section.title);
        const hasActiveTab = section.tabs.some((t) => t.value === activeTab);

        return (
          <div key={section.title} className="border border-border rounded-lg overflow-hidden">
            <button
              onClick={() => toggleSection(section.title)}
              className={`w-full flex items-center justify-between px-4 py-3 text-sm font-semibold transition-colors ${
                hasActiveTab ? "bg-primary/5 text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span>{section.title}</span>
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {isExpanded && (
              <div className="border-t border-border bg-muted/20 px-2 py-1">
                {section.tabs.map((tab) => (
                  <button
                    key={tab.value}
                    onClick={() => onTabChange(tab.value)}
                    className={`w-full text-left px-3 py-2 text-sm rounded-md transition-colors ${
                      activeTab === tab.value
                        ? "bg-primary text-primary-foreground font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// --- Settings Desktop Sidebar ---
function SettingsDesktopSidebar({
  activeTab,
  onTabChange,
  sections,
}: {
  activeTab: string;
  onTabChange: (tab: string) => void;
  sections: SettingsSection[];
}) {
  const activeSectionForTab = (tab: string) =>
    sections.find((s) => s.tabs.some((t) => t.value === tab))?.title;

  const [expandedSections, setExpandedSections] = useState<Set<string>>(() => {
    const initialSection = activeSectionForTab(activeTab);
    return new Set(initialSection ? [initialSection] : ["Business"]);
  });

  const toggleSection = (title: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  };

  useEffect(() => {
    const section = activeSectionForTab(activeTab);
    if (section && !expandedSections.has(section)) {
      setExpandedSections((prev) => new Set(prev).add(section));
    }
  }, [activeTab]);

  return (
    <div className="hidden md:block w-56 flex-shrink-0 space-y-1">
      {sections.map((section) => {
        const isExpanded = expandedSections.has(section.title);
        return (
          <div key={section.title}>
            <button
              onClick={() => toggleSection(section.title)}
              className="w-full flex items-center justify-between px-3 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors rounded-md hover:bg-muted/50"
            >
              {section.title}
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {isExpanded && (
              <div className="ml-1 space-y-0.5 mt-0.5">
                {section.tabs.map((tab) => (
                  <button
                    key={tab.value}
                    onClick={() => onTabChange(tab.value)}
                    className={`w-full text-left px-3 py-1.5 text-sm rounded-md transition-colors ${
                      activeTab === tab.value
                        ? "bg-primary text-primary-foreground font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Map tab name to section name
function getSectionForTab(tab: string, sections: SettingsSection[]): string | null {
  for (const section of sections) {
    if (section.tabs.some((t) => t.value === tab)) {
      return section.title;
    }
  }
  return null;
}

export default function Settings() {
  const { toast } = useToast();
  const { user, isLoading: isAuthLoading } = useAuth();

  // Read tab from URL query param (e.g. /settings?tab=services)
  const urlParams = new URLSearchParams(window.location.search);
  const initialTab = urlParams.get('tab') || "profile";
  const [activeTab, setActiveTab] = useState(initialTab);

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    window.history.replaceState({}, '', `/settings?tab=${tab}`);
  };

  // Handle Clover OAuth callback redirect
  useEffect(() => {
    const cloverParam = urlParams.get('clover');
    if (cloverParam === 'connected') {
      toast({
        title: "Clover Connected!",
        description: "Your Clover POS has been connected successfully. Menu has been synced.",
      });
      handleTabChange('restaurant');
    } else if (cloverParam === 'error') {
      const message = urlParams.get('message') || 'Connection failed';
      toast({
        title: "Clover Connection Failed",
        description: decodeURIComponent(message),
        variant: "destructive",
      });
      handleTabChange('restaurant');
    }

    // Handle Stripe Connect return from onboarding
    const stripeConnectParam = urlParams.get('stripe_connect');
    if (stripeConnectParam === 'return') {
      toast({
        title: "Stripe Setup",
        description: "Checking your Stripe account status...",
      });
      handleTabChange('integrations');
    } else if (stripeConnectParam === 'refresh') {
      toast({
        title: "Session Expired",
        description: "Your Stripe setup session expired. Please try again.",
        variant: "destructive",
      });
      handleTabChange('integrations');
    }
  }, []);

  const businessId = user?.businessId;

  // Fetch business profile for industry-aware navigation
  const { data: business, isLoading: isLoadingBusiness } = useQuery<any>({
    queryKey: ['/api/business'],
    enabled: !!businessId,
  });

  const industryLower = business?.industry?.toLowerCase() || '';
  const isRestaurant = industryLower === 'restaurant';
  const hasPOS = isRestaurant && (
    (business?.cloverMerchantId && business?.cloverAccessToken) ||
    (business?.squareAccessToken && business?.squareLocationId)
  );
  const isAdmin = user?.role === 'admin' || user?.role === 'owner';

  const sections = buildSettingsSections({ isRestaurant, hasPOS, isAdmin: !!isAdmin });

  // Show skeleton while auth or business data is loading
  const isPageLoading = isAuthLoading || isLoadingBusiness || (!business && !!businessId);

  if (isPageLoading) {
    return (
      <PageLayout title="Settings">
        <div className="space-y-6">
          <div>
            <h2 className="text-2xl font-bold">Business Settings</h2>
            <p className="text-gray-500">
              Manage your business profile, hours, and services
            </p>
          </div>
          <SkeletonForm />
        </div>
      </PageLayout>
    );
  }

  // Determine which section component to render based on active tab
  const activeSection = getSectionForTab(activeTab, sections);

  const renderActiveSection = () => {
    switch (activeSection) {
      case "Business":
        return (
          <Suspense fallback={<SectionLoader />}>
            <BusinessSection activeTab={activeTab} />
          </Suspense>
        );
      case "Communication":
        return (
          <Suspense fallback={<SectionLoader />}>
            <CommunicationSection activeTab={activeTab} />
          </Suspense>
        );
      case "Integrations":
        return (
          <Suspense fallback={<SectionLoader />}>
            <IntegrationsSection activeTab={activeTab} />
          </Suspense>
        );
      case "Billing":
        return (
          <Suspense fallback={<SectionLoader />}>
            <BillingSection activeTab={activeTab} />
          </Suspense>
        );
      case "Account":
        return (
          <Suspense fallback={<SectionLoader />}>
            <AccountSection activeTab={activeTab} />
          </Suspense>
        );
      default:
        // Fallback to Business/profile
        return (
          <Suspense fallback={<SectionLoader />}>
            <BusinessSection activeTab="profile" />
          </Suspense>
        );
    }
  };

  return (
    <PageLayout title="Settings">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold">Business Settings</h2>
          <p className="text-gray-500">
            Manage your business profile, hours, and services
          </p>
        </div>

        {/* Mobile navigation */}
        <SettingsNav
          activeTab={activeTab}
          onTabChange={handleTabChange}
          sections={sections}
        />

        <div className="md:flex md:gap-6">
          {/* Desktop sidebar */}
          <SettingsDesktopSidebar
            activeTab={activeTab}
            onTabChange={handleTabChange}
            sections={sections}
          />

          {/* Content area */}
          <div className="flex-1 min-w-0">
            {renderActiveSection()}
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
