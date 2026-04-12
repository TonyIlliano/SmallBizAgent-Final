import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  Home,
  Users,
  Calendar,
  Briefcase,
  FileText,
  Settings,
  LogOut,
  Shield,
  Phone,
  Receipt,
  Bot,
  ChevronRight,
  X,
  RefreshCw,
  BarChart3,
  Megaphone,
  Zap,
  Globe,
  MapPin,
  HelpCircle,
} from "lucide-react";
import { useSidebar } from "@/context/SidebarContext";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { LocationSwitcher } from "@/components/layout/LocationSwitcher";
import { isJobCategory } from "@shared/industry-categories";

const allNavItems = [
  { path: "/", label: "Dashboard", icon: Home },
  { path: "/customers", label: "Customers", icon: Users, hideForRoles: ['staff'] as string[] },
  { path: "/appointments", label: "Appointments", icon: Calendar, labelForIndustry: { restaurant: "Reservations" } as Record<string, string>, hideForJobCategory: true, hideForRoles: ['staff'] as string[] },
  { path: "/jobs", label: "Jobs", icon: Briefcase, hideForIndustries: ['restaurant'], jobCategoryIcon: Calendar, jobCategoryLabel: "Schedule", hideForRoles: ['staff'] as string[] },
  { path: "/recurring", label: "Recurring", icon: RefreshCw, hideForIndustries: ['restaurant'], hideForRoles: ['staff', 'manager'] as string[] },
  { path: "/quotes", label: "Quotes", icon: Receipt, hideForRoles: ['staff'] as string[] },
  { path: "/invoices", label: "Invoices", icon: FileText, hideForRoles: ['staff'] as string[] },
  { path: "/receptionist", label: "AI Receptionist", icon: Bot, hideForRoles: ['staff'] as string[] },
  { path: "/analytics", label: "Analytics", icon: BarChart3, hideForRoles: ['staff'] as string[] },
  { path: "/marketing", label: "Marketing", icon: Megaphone, hideForRoles: ['staff', 'manager'] as string[] },
  { path: "/ai-agents", label: "AI Agents", icon: Zap, hideForRoles: ['staff', 'manager'] as string[] },
  { path: "/website", label: "Website", icon: Globe, hideForRoles: ['staff', 'manager'] as string[] },
  { path: "/google-business-profile", label: "Google", icon: MapPin, hideForRoles: ['staff', 'manager'] as string[] },
  { path: "/settings", label: "Settings", icon: Settings, hideForRoles: ['staff', 'manager'] as string[] },
  { path: "/staff/dashboard", label: "My Schedule", icon: Calendar, showForRoles: ['staff'] as string[] },
];

const adminNavItems = [
  { path: "/admin", label: "Admin Dashboard", icon: Shield },
  { path: "/admin/phone-management", label: "Phone Management", icon: Phone },
  { path: "/admin/social-media", label: "Social Media", icon: Megaphone },
];

// Robot SVG matching the Small Business Agent logo
const RobotLogo = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 100 100" fill="currentColor" className={className}>
    {/* Antenna */}
    <rect x="47" y="5" width="6" height="10" rx="3" />
    <circle cx="50" cy="5" r="4" />
    {/* Head */}
    <rect x="25" y="18" width="50" height="40" rx="12" />
    {/* Visor */}
    <rect x="30" y="28" width="40" height="15" rx="7" fill="black" />
    {/* Eyes */}
    <circle cx="40" cy="35" r="5" fill="white" />
    <circle cx="60" cy="35" r="5" fill="white" />
    {/* Smile */}
    <path d="M 38 48 Q 50 55 62 48" stroke="black" strokeWidth="3" fill="none" strokeLinecap="round" />
    {/* Body */}
    <path d="M 32 58 L 32 75 Q 32 82 39 82 L 61 82 Q 68 82 68 75 L 68 58" />
    {/* Chest detail */}
    <path d="M 42 62 L 50 68 L 58 62" stroke="black" strokeWidth="2" fill="none" />
    {/* Arms */}
    <ellipse cx="20" cy="65" rx="8" ry="12" />
    <ellipse cx="80" cy="65" rx="8" ry="12" />
    <circle cx="20" cy="78" r="5" />
    <circle cx="80" cy="78" r="5" />
    {/* Legs */}
    <rect x="36" y="82" width="10" height="12" rx="3" />
    <rect x="54" y="82" width="10" height="12" rx="3" />
  </svg>
);

export function Sidebar() {
  const [location] = useLocation();
  const { isSidebarOpen, toggleSidebar } = useSidebar();
  const { user, logoutMutation } = useAuth();
  const isMobile = useIsMobile();

  // Fetch business to check industry for conditional nav items
  const { data: business } = useQuery<any>({
    queryKey: ['/api/business'],
    enabled: !!user?.businessId,
  });

  // Filter nav items based on business industry and user role
  const businessIndustry = business?.industry?.toLowerCase() || '';
  const isJobBiz = isJobCategory(business?.industry);
  const effectiveRole = user?.effectiveRole || (user?.role === 'user' ? 'owner' : user?.role) || 'staff';
  const navItems = allNavItems.filter(item => {
    // Hide Appointments tab for job-category businesses (HVAC, plumbing, electrical, etc.)
    if ((item as any).hideForJobCategory && isJobBiz) {
      return false;
    }
    if (item.hideForIndustries && item.hideForIndustries.some(ind => businessIndustry.includes(ind))) {
      return false;
    }
    // Role-based filtering using effectiveRole
    if (item.hideForRoles && item.hideForRoles.includes(effectiveRole)) {
      return false;
    }
    // showForRoles: only show this item if user has one of the specified roles
    if ((item as any).showForRoles && !(item as any).showForRoles.includes(effectiveRole)) {
      return false;
    }
    return true;
  });

  // Get user initials for avatar
  const getInitials = () => {
    if (!user) return '';
    return user.username.substring(0, 2).toUpperCase();
  };

  // Close sidebar on mobile when a nav link is tapped
  const handleNavClick = () => {
    if (isMobile && isSidebarOpen) {
      toggleSidebar();
    }
  };

  return (
    <>
      {/* Dark backdrop overlay on mobile when sidebar is open */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden transition-opacity"
          onClick={toggleSidebar}
        />
      )}

      <aside
        className={cn(
          "transform transition-all duration-300 lg:w-64 md:w-20 w-64 fixed md:static inset-0 z-40 md:z-auto h-full flex flex-col",
          "bg-black border-r border-neutral-800",
          isSidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        {/* Logo Section */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-neutral-800">
          <div className="flex items-center gap-3">
            {/* Robot Logo */}
            <div className="h-10 w-10 flex items-center justify-center">
              <RobotLogo className="h-9 w-9 text-white" />
            </div>
            <div className="md:hidden lg:block">
              <div className="text-sm font-bold tracking-wide text-white uppercase">
                SmallBiz
              </div>
              <div className="text-xs font-semibold tracking-widest text-neutral-400 uppercase">
                Agent
              </div>
            </div>
          </div>
          <button
            onClick={toggleSidebar}
            className="md:hidden p-2 rounded-lg hover:bg-neutral-800 text-neutral-400 hover:text-white transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Location Switcher - only visible for multi-location users */}
        <LocationSwitcher />

        {/* Navigation Links */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location === item.path || (item.path !== "/" && location.startsWith(item.path));
            return (
              <Link
                key={item.path}
                href={item.path}
                onClick={handleNavClick}
                className={cn(
                  "group flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-all duration-200",
                  isActive
                    ? "bg-white text-black"
                    : "text-neutral-400 hover:text-white hover:bg-neutral-800/80"
                )}
              >
                <div className={cn(
                  "flex items-center justify-center h-8 w-8 rounded-lg mr-3 md:mr-0 lg:mr-3 transition-all",
                  isActive
                    ? "bg-black text-white"
                    : "bg-neutral-800 text-neutral-400 group-hover:bg-neutral-700 group-hover:text-white"
                )}>
                  {(() => {
                    const IconComponent = (isJobBiz && (item as any).jobCategoryIcon) ? (item as any).jobCategoryIcon : item.icon;
                    return <IconComponent className="h-4 w-4" />;
                  })()}
                </div>
                <span className="md:hidden lg:inline flex-1">
                  {(isJobBiz && (item as any).jobCategoryLabel) ? (item as any).jobCategoryLabel : ((item as any).labelForIndustry?.[businessIndustry] || item.label)}
                </span>
                {isActive && (
                  <ChevronRight className="h-4 w-4 md:hidden lg:block text-black" />
                )}
              </Link>
            );
          })}

          {/* Admin Navigation Links - only shown to admin users */}
          {user?.role === 'admin' && (
            <>
              <div className="pt-4 pb-2">
                <div className="px-3 flex items-center gap-2">
                  <div className="h-px flex-1 bg-neutral-800" />
                  <span className="text-xs font-semibold text-neutral-500 uppercase tracking-wider md:hidden lg:block">
                    Admin
                  </span>
                  <div className="h-px flex-1 bg-neutral-800" />
                </div>
              </div>

              {adminNavItems.map((item) => {
                const isActive = location === item.path || location.startsWith(item.path + '/');
                return (
                  <Link
                    key={item.path}
                    href={item.path}
                    onClick={handleNavClick}
                    className={cn(
                      "group flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-all duration-200",
                      isActive
                        ? "bg-red-500 text-white"
                        : "text-neutral-400 hover:text-white hover:bg-neutral-800/80"
                    )}
                  >
                    <div className={cn(
                      "flex items-center justify-center h-8 w-8 rounded-lg mr-3 md:mr-0 lg:mr-3 transition-all",
                      isActive
                        ? "bg-red-600 text-white"
                        : "bg-neutral-800 text-neutral-400 group-hover:bg-neutral-700 group-hover:text-white"
                    )}>
                      <item.icon className="h-4 w-4" />
                    </div>
                    <span className="md:hidden lg:inline flex-1">{item.label}</span>
                    {isActive && (
                      <ChevronRight className="h-4 w-4 md:hidden lg:block" />
                    )}
                  </Link>
                );
              })}
            </>
          )}
        </nav>

        {/* Help Link */}
        <div className="px-3 pb-1">
          <Link
            href="/help"
            onClick={handleNavClick}
            className={cn(
              "group flex items-center px-3 py-2.5 text-sm font-medium rounded-lg transition-all duration-200",
              location === "/help"
                ? "bg-white text-black"
                : "text-neutral-400 hover:text-white hover:bg-neutral-800/80"
            )}
          >
            <div className={cn(
              "flex items-center justify-center h-8 w-8 rounded-lg mr-3 md:mr-0 lg:mr-3 transition-all",
              location === "/help"
                ? "bg-black text-white"
                : "bg-neutral-800 text-neutral-400 group-hover:bg-neutral-700 group-hover:text-white"
            )}>
              <HelpCircle className="h-4 w-4" />
            </div>
            <span className="md:hidden lg:inline flex-1">Help</span>
            {location === "/help" && (
              <ChevronRight className="h-4 w-4 md:hidden lg:block text-black" />
            )}
          </Link>
        </div>

        {/* Profile Section */}
        <div className="border-t border-neutral-800 p-4">
          <div className="flex items-center">
            <div className="h-10 w-10 rounded-lg bg-white flex items-center justify-center text-black font-bold text-sm">
              {getInitials()}
            </div>
            <div className="ml-3 md:hidden lg:block flex-grow min-w-0">
              <p className="text-sm font-medium text-white truncate">{user?.username}</p>
              <p className="text-xs text-neutral-500 truncate">{user?.email}</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto p-0 h-9 w-9 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-all"
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
            >
              {logoutMutation.isPending ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <LogOut className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </aside>
    </>
  );
}
