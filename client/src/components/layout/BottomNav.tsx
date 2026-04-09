import { useState } from "react";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  Home,
  Calendar,
  Briefcase,
  FileText,
  MoreHorizontal,
  Users,
  Phone,
  Settings,
  LogOut,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { isJobCategory } from "@shared/industry-categories";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

export function BottomNav() {
  const [location, setLocation] = useLocation();
  const { user, logoutMutation } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);

  // Fetch business to check industry for conditional tabs
  const { data: business } = useQuery<any>({
    queryKey: ['/api/business'],
    enabled: !!user?.businessId,
  });

  const isJobBiz = isJobCategory(business?.industry);

  // Job-category businesses see "Schedule" (pointing to /jobs)
  // Appointment-category businesses see "Schedule" (pointing to /appointments)
  const bottomTabs = [
    { path: "/", label: "Home", icon: Home },
    ...(isJobBiz
      ? [{ path: "/jobs", label: "Schedule", icon: Calendar }]
      : [{ path: "/appointments", label: "Schedule", icon: Calendar }]
    ),
    { path: "/invoices", label: "Invoices", icon: FileText },
    { path: "__more__", label: "More", icon: MoreHorizontal },
  ];

  const moreItems = [
    { path: "/customers", label: "Customers", icon: Users },
    { path: "/receptionist", label: "AI Receptionist", icon: Phone },
    { path: "/settings", label: "Settings", icon: Settings },
  ];

  const handleLogout = () => {
    setMoreOpen(false);
    logoutMutation.mutate();
  };

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-card border-t border-border"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        <div className="flex items-center justify-around h-16">
          {bottomTabs.map((tab) => {
            const isMore = tab.path === "__more__";
            const isActive = !isMore && (
              tab.path === "/"
                ? location === "/"
                : location.startsWith(tab.path)
            );

            if (isMore) {
              return (
                <button
                  key={tab.path}
                  onClick={() => setMoreOpen(true)}
                  className="flex flex-col items-center justify-center min-w-[48px] min-h-[48px] px-2 py-1 text-muted-foreground active:text-foreground transition-colors"
                >
                  <tab.icon className="h-5 w-5" />
                  <span className="text-[10px] mt-0.5 font-medium">{tab.label}</span>
                </button>
              );
            }

            return (
              <Link
                key={tab.path}
                href={tab.path}
                className={cn(
                  "flex flex-col items-center justify-center min-w-[48px] min-h-[48px] px-2 py-1 transition-colors",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground active:text-foreground"
                )}
              >
                <tab.icon className={cn("h-5 w-5", isActive && "fill-primary/20")} />
                <span className={cn(
                  "text-[10px] mt-0.5 font-medium",
                  isActive && "font-semibold"
                )}>
                  {tab.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* More actions sheet */}
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-8">
          <SheetHeader className="mb-4">
            <SheetTitle>Quick Actions</SheetTitle>
            <SheetDescription>Navigate to other sections of your dashboard.</SheetDescription>
          </SheetHeader>
          <div className="space-y-1">
            {moreItems.map((item) => {
              const isActive = location.startsWith(item.path);
              return (
                <button
                  key={item.path}
                  onClick={() => {
                    setMoreOpen(false);
                    setLocation(item.path);
                  }}
                  className={cn(
                    "flex items-center gap-3 w-full px-4 py-3 rounded-lg text-left transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "hover:bg-muted text-foreground"
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  <span className="text-sm font-medium">{item.label}</span>
                </button>
              );
            })}
            {/* Divider */}
            <div className="border-t border-border my-2" />
            {/* Logout */}
            <button
              onClick={handleLogout}
              disabled={logoutMutation.isPending}
              className="flex items-center gap-3 w-full px-4 py-3 rounded-lg text-left text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
            >
              {logoutMutation.isPending ? (
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-red-400 border-t-transparent" />
              ) : (
                <LogOut className="h-5 w-5" />
              )}
              <span className="text-sm font-medium">Logout</span>
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
