import { toast } from "@/hooks/use-toast";

// Standard error messages for common HTTP status codes
const HTTP_ERROR_MESSAGES: Record<number, string> = {
  400: "Invalid request. Please check your input and try again.",
  401: "Your session has expired. Please log in again.",
  403: "You don't have permission to perform this action.",
  404: "The requested resource was not found.",
  409: "This operation conflicts with an existing resource.",
  422: "The provided data is invalid.",
  429: "Too many requests. Please wait a moment and try again.",
  500: "Something went wrong on our end. Please try again later.",
  502: "Service temporarily unavailable. Please try again.",
  503: "Service is currently unavailable. Please try again later.",
};

// Parse error response from API
export async function parseErrorResponse(response: Response): Promise<string> {
  try {
    const data = await response.json();
    return data.message || data.error || HTTP_ERROR_MESSAGES[response.status] || "An unexpected error occurred";
  } catch {
    return HTTP_ERROR_MESSAGES[response.status] || "An unexpected error occurred";
  }
}

// Handle API errors with toast notifications
export function handleApiError(error: unknown, customMessage?: string): void {
  let message = customMessage || "An unexpected error occurred";

  if (error instanceof Response) {
    message = HTTP_ERROR_MESSAGES[error.status] || message;
  } else if (error instanceof Error) {
    message = error.message || message;
  } else if (typeof error === "string") {
    message = error;
  }

  toast({
    title: "Error",
    description: message,
    variant: "destructive",
  });
}

// Show success toast
export function showSuccess(title: string, description?: string): void {
  toast({
    title,
    description,
    variant: "success" as any,
  });
}

// Show warning toast
export function showWarning(title: string, description?: string): void {
  toast({
    title,
    description,
    variant: "warning" as any,
  });
}

// Show info toast
export function showInfo(title: string, description?: string): void {
  toast({
    title,
    description,
  });
}

// Mutation error handler for React Query
export function createMutationErrorHandler(defaultMessage?: string) {
  return (error: unknown) => {
    handleApiError(error, defaultMessage);
  };
}

// Mutation success handler for React Query
export function createMutationSuccessHandler(title: string, description?: string) {
  return () => {
    showSuccess(title, description);
  };
}
