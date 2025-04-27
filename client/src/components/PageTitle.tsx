import { Link } from "wouter";
import { ChevronRight } from "lucide-react";

type Breadcrumb = {
  label: string;
  href: string;
};

interface PageTitleProps {
  title: string;
  description?: string;
  breadcrumbs?: Breadcrumb[];
  actions?: React.ReactNode;
}

export default function PageTitle({ 
  title, 
  description, 
  breadcrumbs,
  actions 
}: PageTitleProps) {
  return (
    <div className="space-y-2">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <div className="flex items-center text-sm text-muted-foreground mb-1">
          {breadcrumbs.map((breadcrumb, index) => (
            <div key={index} className="flex items-center">
              {index > 0 && <ChevronRight className="h-4 w-4 mx-1" />}
              <Link 
                href={breadcrumb.href}
                className={index === breadcrumbs.length - 1 
                  ? "font-medium text-foreground" 
                  : "hover:text-foreground transition-colors"
                }
              >
                {breadcrumb.label}
              </Link>
            </div>
          ))}
        </div>
      )}
      
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
          {description && (
            <p className="text-muted-foreground mt-1">{description}</p>
          )}
        </div>
        
        {actions && (
          <div className="flex items-center space-x-2">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}