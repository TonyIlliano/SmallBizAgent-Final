import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { 
  Home, 
  Users, 
  Calendar, 
  Briefcase, 
  FileText, 
  MessageSquare, 
  Settings, 
  LogOut,
  Shield,
  Phone,
  LineChart
} from "lucide-react";
import { useSidebar } from "@/context/SidebarContext";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

const navItems = [
  { path: "/", label: "Dashboard", icon: Home },
  { path: "/customers", label: "Customers", icon: Users },
  { path: "/appointments", label: "Appointments", icon: Calendar },
  { path: "/jobs", label: "Jobs", icon: Briefcase },
  { path: "/invoices", label: "Invoices", icon: FileText },
  { path: "/receptionist", label: "Virtual Receptionist", icon: MessageSquare },
  { path: "/settings", label: "Settings", icon: Settings },
];

const adminNavItems = [
  { path: "/admin", label: "Admin Dashboard", icon: Shield },
  { path: "/admin/phone-management", label: "Phone Management", icon: Phone },
];

export function Sidebar() {
  const [location] = useLocation();
  const { isSidebarOpen, toggleSidebar } = useSidebar();
  const { user, logoutMutation } = useAuth();
  
  // Get user initials for avatar
  const getInitials = () => {
    if (!user) return '';
    return user.username.substring(0, 2).toUpperCase();
  };

  return (
    <aside
      className={cn(
        "transform transition-transform duration-300 lg:w-64 md:w-20 w-64 bg-white border-r border-gray-200 fixed md:static inset-0 z-40 h-full",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}
    >
      {/* Logo */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-gray-200">
        <div className="flex items-center">
          <svg className="h-8 w-8 text-primary-600" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16" />
            <path d="M12 11.5v-4" />
            <path d="M7.5 7.5h9v9h-9z" />
            <path d="M12 16.5v-4" />
          </svg>
          <span className="text-lg font-semibold ml-2 md:hidden lg:inline">SmallBizAgent</span>
        </div>
        <button
          onClick={toggleSidebar}
          className="md:hidden p-2 rounded-md hover:bg-gray-100"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>

      {/* Navigation Links */}
      <nav className="px-2 py-4 space-y-1">
        {navItems.map((item) => (
          <Link
            key={item.path}
            href={item.path}
            className={cn(
              "flex items-center px-4 py-2 text-sm font-medium rounded-md",
              location === item.path
                ? "bg-primary-50 text-primary-700"
                : "text-gray-700 hover:bg-gray-100"
            )}
          >
            <item.icon className="h-5 w-5 mr-2 md:mr-0 lg:mr-2" />
            <span className="md:hidden lg:inline">{item.label}</span>
          </Link>
        ))}
        
        {/* Admin Navigation Links - only shown to admin users */}
        {user?.role === 'admin' && (
          <>
            <div className="pt-3 pb-1">
              <Separator />
              <p className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase md:hidden lg:block">
                Admin
              </p>
              <Separator className="md:block lg:hidden" />
            </div>
            
            {adminNavItems.map((item) => (
              <Link
                key={item.path}
                href={item.path}
                className={cn(
                  "flex items-center px-4 py-2 text-sm font-medium rounded-md",
                  location === item.path || location.startsWith(item.path + '/')
                    ? "bg-red-50 text-red-700"
                    : "text-gray-700 hover:bg-gray-100"
                )}
              >
                <item.icon className="h-5 w-5 mr-2 md:mr-0 lg:mr-2" />
                <span className="md:hidden lg:inline">{item.label}</span>
              </Link>
            ))}
          </>
        )}
      </nav>

      {/* Profile Section */}
      <div className="border-t border-gray-200 p-4 mt-auto">
        <div className="flex items-center">
          <div className="h-8 w-8 rounded-full bg-primary-100 flex items-center justify-center text-primary-700 font-semibold">
            {getInitials()}
          </div>
          <div className="ml-3 md:hidden lg:block flex-grow">
            <p className="text-sm font-medium text-gray-700">{user?.username}</p>
            <p className="text-xs font-medium text-gray-500">{user?.email}</p>
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            className="ml-auto p-0 h-8 w-8 rounded-full"
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending}
          >
            {logoutMutation.isPending ? (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            ) : (
              <LogOut className="h-4 w-4 text-gray-500" />
            )}
          </Button>
        </div>
      </div>
    </aside>
  );
}
