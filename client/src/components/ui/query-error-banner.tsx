import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "./button";

interface QueryErrorBannerProps {
  error: Error | null;
  onRetry?: () => void;
  message?: string;
}

/**
 * Reusable error banner for failed API queries.
 * Drop into any page: {isError && <QueryErrorBanner error={error} onRetry={refetch} />}
 */
export function QueryErrorBanner({ error, onRetry, message }: QueryErrorBannerProps) {
  if (!error) return null;

  // Parse status code from error message if available (format: "404: Not Found")
  const statusMatch = error.message?.match(/^(\d{3}):/);
  const status = statusMatch ? parseInt(statusMatch[1]) : null;

  // Don't show banner for auth errors — those redirect to login
  if (status === 401) return null;

  const displayMessage = message
    || (status === 403 ? "You don't have permission to view this."
      : status === 404 ? "The requested data was not found."
      : "Something went wrong loading this data. Please try again.");

  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4 flex items-start gap-3">
      <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-red-800">{displayMessage}</p>
        {error.message && !message && (
          <p className="text-xs text-red-600 mt-1 truncate">{error.message}</p>
        )}
      </div>
      {onRetry && (
        <Button
          variant="outline"
          size="sm"
          onClick={onRetry}
          className="flex-shrink-0 border-red-200 text-red-700 hover:bg-red-100"
        >
          <RefreshCw className="h-3 w-3 mr-1" />
          Retry
        </Button>
      )}
    </div>
  );
}
