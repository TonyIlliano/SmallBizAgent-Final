import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import {
  Home,
  Calendar,
  BarChart,
  Settings,
  Users,
  Briefcase,
  FileText,
  LogOut,
  Menu,
  X,
  PhoneCall,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

type NavItem = {
  label: string;
  href: string;
  icon: React.ReactNode;
  admin?: boolean;
};

const navItems: NavItem[] = [
  { label: "Dashboard", href: "/", icon: <Home className="w-5 h-5" /> },
  { label: "Appointments", href: "/appointments", icon: <Calendar className="w-5 h-5" /> },
  { label: "Customers", href: "/customers", icon: <Users className="w-5 h-5" /> },
  { label: "Jobs", href: "/jobs", icon: <Briefcase className="w-5 h-5" /> },
  { label: "Quotes", href: "/quotes", icon: <FileText className="w-5 h-5" /> },
  { label: "Invoices", href: "/invoices", icon: <FileText className="w-5 h-5" /> },
  { 
    label: "Receptionist", 
    href: "/receptionist", 
    icon: <PhoneCall className="w-5 h-5" /> 
  },
  { label: "Analytics", href: "/analytics", icon: <BarChart className="w-5 h-5" /> },
  { label: "Settings", href: "/settings", icon: <Settings className="w-5 h-5" /> },
  { 
    label: "Admin", 
    href: "/admin", 
    icon: <Settings className="w-5 h-5" />,
    admin: true
  },
];

export default function AppNav() {
  const [isOpen, setIsOpen] = useState(false);
  const [location] = useLocation();
  const { user, logoutMutation } = useAuth();
  
  const isActive = (href: string) => {
    if (href === "/") {
      return location === "/";
    }
    return location.startsWith(href);
  };

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  const getInitials = (name?: string) => {
    if (!name) return "U";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .substring(0, 2);
  };

  const isAdmin = user?.role === "admin";

  return (
    <header className="border-b bg-background sticky top-0 z-40">
      <div className="container flex h-16 items-center justify-between">
        <div className="flex items-center gap-6 md:gap-8">
          <Link href="/" className="font-semibold text-lg hidden md:block">
            SmallBizAgent
          </Link>

          {/* Mobile menu button */}
          <Sheet open={isOpen} onOpenChange={setIsOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon" className="md:hidden">
                <Menu className="h-5 w-5" />
                <span className="sr-only">Toggle menu</span>
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="flex flex-col">
              <div className="px-7 py-4 border-b">
                <Link href="/" className="font-semibold text-lg">
                  SmallBizAgent
                </Link>
              </div>
              <nav className="flex flex-col gap-1 p-2 flex-1">
                {navItems
                  .filter((item) => !item.admin || isAdmin)
                  .map((item) => (
                    <Link key={item.href} href={item.href}>
                      <Button
                        variant={isActive(item.href) ? "default" : "ghost"}
                        className="w-full justify-start"
                        onClick={() => setIsOpen(false)}
                      >
                        {item.icon}
                        <span className="ml-2">{item.label}</span>
                      </Button>
                    </Link>
                  ))}
              </nav>
              <div className="border-t p-4">
                <Button
                  variant="ghost"
                  className="w-full justify-start"
                  onClick={handleLogout}
                >
                  <LogOut className="h-5 w-5 mr-2" />
                  Log out
                </Button>
              </div>
            </SheetContent>
          </Sheet>

          {/* Desktop navigation */}
          <nav className="hidden md:flex items-center space-x-1">
            {navItems
              .filter((item) => !item.admin || isAdmin)
              .map((item) => (
                <Link key={item.href} href={item.href}>
                  <Button
                    variant={isActive(item.href) ? "default" : "ghost"}
                    className="text-sm"
                  >
                    {item.icon}
                    <span className="ml-2">{item.label}</span>
                  </Button>
                </Link>
              ))}
          </nav>
        </div>

        {/* User dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="rounded-full h-8 w-8 p-0">
              <Avatar className="h-8 w-8">
                <AvatarFallback>{getInitials(user?.username)}</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <div className="flex items-center justify-start gap-2 p-2">
              <div className="flex flex-col space-y-1 leading-none">
                {user?.username && (
                  <p className="font-medium">{user.username}</p>
                )}
                {user?.email && (
                  <p className="text-sm text-muted-foreground">{user.email}</p>
                )}
              </div>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings" className="cursor-pointer w-full">
                <Settings className="w-4 h-4 mr-2" /> Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              className="cursor-pointer"
              onClick={handleLogout}
            >
              <LogOut className="w-4 h-4 mr-2" /> Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}