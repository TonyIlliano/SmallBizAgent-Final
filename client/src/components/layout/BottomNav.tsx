import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  Home,
  Calendar,
  Briefcase,
  FileText,
  LogOut,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

const bottomTabs = [
  { path: "/", label: "Home", icon: Home },
  { path: "/appointments", label: "Schedule", icon: Calendar },
  { path: "/jobs", label: "Jobs", icon: Briefcase },
  { path: "/invoices", label: "Invoices", icon: FileText },
  { path: "__logout__", label: "Logout", icon: LogOut },
];

export function BottomNav() {
  const [location] = useLocation();
  const { logoutMutation } = useAuth();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-card border-t border-border"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <div className="flex items-center justify-around h-16">
        {bottomTabs.map((tab) => {
          const isLogout = tab.path === "__logout__";
          const isActive = !isLogout && (
            tab.path === "/"
              ? location === "/"
              : location.startsWith(tab.path)
          );

          if (isLogout) {
            return (
              <button
                key={tab.path}
                onClick={() => logoutMutation.mutate()}
                disabled={logoutMutation.isPending}
                className="flex flex-col items-center justify-center min-w-[48px] min-h-[48px] px-2 py-1 text-muted-foreground active:text-red-500 transition-colors"
              >
                {logoutMutation.isPending ? (
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
                ) : (
                  <tab.icon className="h-5 w-5" />
                )}
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
  );
}
