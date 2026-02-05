import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowRight } from "lucide-react";
import { Link } from "wouter";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: ReactNode;
  iconBgColor?: string;
  iconColor?: string;
  change?: number;
  changeText?: string;
  changeType?: "increase" | "decrease" | "neutral";
  linkText?: string;
  linkHref?: string;
}

export function StatCard({
  title,
  value,
  icon,
  iconBgColor,
  iconColor,
  change,
  changeText,
  changeType = "increase",
  linkText,
  linkHref = "#",
}: StatCardProps) {
  return (
    <Card className="overflow-hidden bg-card border-border hover:shadow-lg transition-all duration-300 group">
      <CardContent className="p-0">
        <div className="p-6">
          <div className="flex items-start justify-between">
            <div className="space-y-3">
              <p className="text-sm font-medium text-muted-foreground">{title}</p>
              <div className="flex items-baseline gap-2">
                <p className="text-3xl font-bold tracking-tight text-foreground">{value}</p>
                {(change !== undefined || changeText) && (
                  <div
                    className={cn(
                      "flex items-center text-xs font-medium px-2 py-0.5 rounded-full",
                      changeType === "increase"
                        ? "text-emerald-700 bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400"
                        : changeType === "decrease"
                        ? "text-red-700 bg-red-100 dark:bg-red-900/30 dark:text-red-400"
                        : "text-muted-foreground bg-muted"
                    )}
                  >
                    {changeType === "increase" && (
                      <ArrowUp className="h-3 w-3 mr-0.5" />
                    )}
                    {changeType === "decrease" && (
                      <ArrowDown className="h-3 w-3 mr-0.5" />
                    )}
                    {change !== undefined && change > 0 && <span>{change}%</span>}
                    {changeText && <span>{changeText}</span>}
                  </div>
                )}
              </div>
            </div>
            <div
              className={cn(
                "flex-shrink-0 rounded-xl p-3 transition-transform group-hover:scale-110",
                iconBgColor || "bg-neutral-100 dark:bg-neutral-800"
              )}
            >
              <div className={cn("h-6 w-6", iconColor || "text-foreground")}>{icon}</div>
            </div>
          </div>
        </div>
        {linkText && linkHref && (
          <Link
            href={linkHref}
            className="flex items-center justify-between px-6 py-3 bg-muted/50 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors border-t border-border"
          >
            <span>{linkText}</span>
            <ArrowRight className="h-4 w-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all" />
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
