import { Link, useLocation } from "wouter";
import { ChevronRight, Home } from "lucide-react";
import { cn } from "@/lib/utils";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
}

export function Breadcrumb({ items, className }: BreadcrumbProps) {
  const [location] = useLocation();

  return (
    <nav className={cn("flex items-center space-x-1 text-sm text-muted-foreground", className)}>
      <Link href="/">
        <a className={cn(
          "inline-flex items-center hover:text-foreground",
          location === "/" ? "text-foreground" : ""
        )}>
          <Home className="h-4 w-4" />
        </a>
      </Link>
      {items.map((item, index) => (
        <span key={index} className="flex items-center">
          <ChevronRight className="h-4 w-4 mx-1" />
          {item.href ? (
            <Link href={item.href}>
              <a className={cn(
                "hover:text-foreground",
                location === item.href ? "text-foreground font-medium" : ""
              )}>
                {item.label}
              </a>
            </Link>
          ) : (
            <span className="text-foreground font-medium">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}