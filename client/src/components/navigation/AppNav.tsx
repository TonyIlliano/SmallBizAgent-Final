import { Link, useLocation } from "wouter";
import {
  Home,
  Users,
  FileText,
  Briefcase,
  Calendar,
  Settings,
  Menu,
  X,
  Shield
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";

interface NavItem {
  name: string;
  href: string;
  icon: React.ReactNode;
}

export function AppNav() {
  const [location] = useLocation();
  const { user, logoutMutation } = useAuth();
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  
  // Close mobile nav when changing routes
  useEffect(() => {
    setIsMobileNavOpen(false);
  }, [location]);

  const mainNavItems: NavItem[] = [
    { name: "Dashboard", href: "/", icon: <Home className="w-5 h-5 mr-2" /> },
    { name: "Customers", href: "/customers", icon: <Users className="w-5 h-5 mr-2" /> },
    { name: "Quotes", href: "/quotes", icon: <FileText className="w-5 h-5 mr-2" /> },
    { name: "Jobs", href: "/jobs", icon: <Briefcase className="w-5 h-5 mr-2" /> },
    { name: "Appointments", href: "/appointments", icon: <Calendar className="w-5 h-5 mr-2" /> },
    { name: "Settings", href: "/settings", icon: <Settings className="w-5 h-5 mr-2" /> },
  ];

  // Admin-only nav items
  const adminNavItems: NavItem[] = user?.role === "admin" ? [
    { name: "Admin", href: "/admin", icon: <Shield className="w-5 h-5 mr-2" /> },
  ] : [];

  // Combine nav items
  const allNavItems = [...mainNavItems, ...adminNavItems];

  // Handle logout
  const handleLogout = () => {
    logoutMutation.mutate();
  };

  // Hide nav on public routes
  const publicRoutes = ['/auth', '/welcome', '/reset-password', '/portal'];
  const isPublicRoute = publicRoutes.some(route => location.startsWith(route)) || location === '/welcome';

  if (!user || isPublicRoute) return null;

  return (
    <>
      {/* Mobile nav toggle button - only visible on small screens */}
      <div className="md:hidden fixed top-4 right-4 z-50">
        <Button 
          variant="outline" 
          size="icon" 
          onClick={() => setIsMobileNavOpen(!isMobileNavOpen)}
          aria-label={isMobileNavOpen ? "Close menu" : "Open menu"}
        >
          {isMobileNavOpen ? (
            <X className="h-5 w-5" />
          ) : (
            <Menu className="h-5 w-5" />
          )}
        </Button>
      </div>
      
      {/* Mobile navigation - full screen overlay */}
      {isMobileNavOpen && (
        <div className="md:hidden fixed inset-0 bg-background z-40 p-4 pt-16 flex flex-col">
          <nav className="space-y-2">
            {allNavItems.map((item) => (
              <Link key={item.href} href={item.href}>
                <div className={cn(
                  "flex items-center p-3 rounded-md hover:bg-muted transition-colors cursor-pointer",
                  location === item.href ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground"
                )}>
                  {item.icon}
                  {item.name}
                </div>
              </Link>
            ))}
          </nav>
          <div className="mt-auto pt-4">
            <Button 
              variant="outline" 
              className="w-full" 
              onClick={handleLogout}
              disabled={logoutMutation.isPending}
            >
              {logoutMutation.isPending ? "Logging out..." : "Logout"}
            </Button>
          </div>
        </div>
      )}
      
      {/* Desktop horizontal navigation */}
      <div className="hidden md:flex w-full bg-background border-b sticky top-0 z-30">
        <div className="container flex items-center py-2">
          <div className="flex-1 flex items-center space-x-4">
            {allNavItems.map((item) => (
              <Link key={item.href} href={item.href}>
                <div className={cn(
                  "flex items-center px-3 py-2 rounded-md hover:bg-muted transition-colors cursor-pointer",
                  location === item.href ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground",
                  item.name === "Admin" && "text-amber-600 hover:text-amber-700"
                )}>
                  {item.icon}
                  {item.name}
                </div>
              </Link>
            ))}
          </div>
          <div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleLogout}
              disabled={logoutMutation.isPending}
            >
              {logoutMutation.isPending ? "Logging out..." : "Logout"}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}