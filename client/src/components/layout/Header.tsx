import { useState } from "react";
import { useSidebar } from "@/context/SidebarContext";
import { Bell, Search, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlobalSearch } from "@/components/search/GlobalSearch";

interface HeaderProps {
  title: string;
}

export function Header({ title }: HeaderProps) {
  const { toggleSidebar } = useSidebar();
  const [searchOpen, setSearchOpen] = useState(false);

  return (
    <>
      <header className="bg-card border-b border-border sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex h-16 items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleSidebar}
              className="md:hidden h-10 w-10 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              <Menu className="h-5 w-5" />
              <span className="sr-only">Toggle sidebar</span>
            </Button>
            <h1 className="text-xl font-bold tracking-tight text-foreground">{title}</h1>
          </div>

          <div className="flex items-center gap-3">
            {/* Mobile Search Button */}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden h-10 w-10 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
              onClick={() => setSearchOpen(true)}
            >
              <Search className="h-5 w-5" />
              <span className="sr-only">Search</span>
            </Button>

            {/* Desktop Search - opens command palette */}
            <div className="hidden md:block">
              <button
                onClick={() => setSearchOpen(true)}
                className="flex items-center w-64 h-10 px-3 bg-muted rounded-lg text-sm text-muted-foreground hover:bg-muted/80 transition-colors"
              >
                <Search className="h-4 w-4 mr-2 flex-shrink-0" />
                <span className="flex-1 text-left">Search...</span>
                <kbd className="hidden sm:inline-flex h-5 items-center gap-1 rounded border bg-background px-1.5 text-[10px] font-medium text-muted-foreground">
                  <span className="text-xs">⌘</span>K
                </kbd>
              </button>
            </div>

            {/* Notifications */}
            <Button
              variant="ghost"
              size="icon"
              className="relative h-10 w-10 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              <Bell className="h-5 w-5" />
              <span className="sr-only">View notifications</span>
              <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-red-500 ring-2 ring-card"></span>
            </Button>
          </div>
        </div>
      </header>

      {/* Global Search Command Palette */}
      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </>
  );
}
