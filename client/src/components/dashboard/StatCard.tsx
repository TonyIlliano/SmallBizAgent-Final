import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ReactNode } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: ReactNode;
  iconBgColor: string;
  iconColor: string;
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
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="p-5">
          <div className="flex items-center">
            <div
              className={cn(
                "flex-shrink-0 rounded-md p-3",
                iconBgColor
              )}
            >
              <div className={cn("h-6 w-6", iconColor)}>{icon}</div>
            </div>
            <div className="ml-5 w-0 flex-1">
              <dl>
                <dt className="text-sm font-medium text-gray-500 truncate">{title}</dt>
                <dd className="flex items-baseline">
                  <div className="text-2xl font-semibold text-gray-900">{value}</div>
                  {change !== undefined && (
                    <div
                      className={cn(
                        "ml-2 flex items-baseline text-sm font-semibold",
                        changeType === "increase"
                          ? "text-green-600"
                          : changeType === "decrease"
                          ? "text-red-600"
                          : "text-gray-600"
                      )}
                    >
                      {changeType === "increase" ? (
                        <ArrowUp className="self-center flex-shrink-0 h-5 w-5 text-green-500" />
                      ) : changeType === "decrease" ? (
                        <ArrowDown className="self-center flex-shrink-0 h-5 w-5 text-red-500" />
                      ) : null}
                      {change && <span>{change}%</span>}
                      {changeText && <span>{changeText}</span>}
                    </div>
                  )}
                </dd>
              </dl>
            </div>
          </div>
        </div>
        {linkText && (
          <div className="bg-gray-50 px-5 py-3">
            <div className="text-sm">
              <a href={linkHref} className="font-medium text-primary-600 hover:text-primary-700">
                {linkText}
              </a>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
