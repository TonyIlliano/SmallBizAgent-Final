import { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  resetKeys?: any[];
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * React Error Boundary — catches rendering errors and shows a fallback UI
 * instead of a white screen. Must be a class component (React requirement).
 *
 * Usage:
 *   <ErrorBoundary>
 *     <MyComponent />
 *   </ErrorBoundary>
 *
 *   // With custom fallback:
 *   <ErrorBoundary fallback={<PublicErrorFallback />}>
 *     <BookingPage />
 *   </ErrorBoundary>
 *
 *   // Auto-reset when route changes:
 *   <ErrorBoundary resetKeys={[slug]}>
 *     <BookingPage />
 *   </ErrorBoundary>
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Caught:', error, errorInfo);
    // Store error details for debugging
    try {
      localStorage.setItem('sba-last-error', JSON.stringify({
        message: error.message,
        stack: error.stack?.slice(0, 1000),
        componentStack: errorInfo.componentStack?.slice(0, 500),
        url: window.location.href,
        time: new Date().toISOString(),
      }));
    } catch {
      // localStorage not available — ignore
    }
    // Report to Sentry if available
    try {
      if (typeof window !== 'undefined' && (window as any).Sentry) {
        (window as any).Sentry.captureException(error, {
          contexts: { react: { componentStack: errorInfo.componentStack } },
        });
      }
    } catch {
      // Sentry not available — ignore
    }
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (this.state.hasError && this.props.resetKeys) {
      const changed = this.props.resetKeys.some(
        (key, i) => key !== prevProps.resetKeys?.[i]
      );
      if (changed) {
        this.setState({ hasError: false, error: null });
      }
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return <DefaultErrorFallback error={this.state.error} onReset={this.handleReset} />;
    }
    return this.props.children;
  }
}

/** Default fallback for authenticated pages */
function DefaultErrorFallback({ error, onReset }: { error: Error | null; onReset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] p-8 text-center">
      <div className="p-4 rounded-full bg-red-100 dark:bg-red-900/30 mb-6">
        <AlertTriangle className="h-8 w-8 text-red-600 dark:text-red-400" />
      </div>
      <h2 className="text-xl font-semibold text-foreground mb-2">
        Something went wrong
      </h2>
      <p className="text-muted-foreground max-w-md mb-6">
        We encountered an unexpected error. Please try again or contact support if the problem persists.
      </p>
      {error && (
        <details className="text-left max-w-lg mb-4 text-xs text-muted-foreground">
          <summary className="cursor-pointer text-sm">Error details</summary>
          <pre className="mt-2 p-3 bg-muted rounded-md overflow-auto max-h-40 whitespace-pre-wrap">
            {error.message}
            {error.stack && `\n\n${error.stack.slice(0, 500)}`}
          </pre>
        </details>
      )}
      <div className="flex gap-3">
        <Button variant="default" onClick={onReset}>
          Try Again
        </Button>
        <Button variant="outline" onClick={() => window.location.href = '/'}>
          Go to Dashboard
        </Button>
      </div>
    </div>
  );
}

/** Public-facing fallback for booking and payment pages */
export function PublicErrorFallback() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-8 text-center bg-background">
      <div className="p-4 rounded-full bg-red-100 mb-6">
        <AlertTriangle className="h-8 w-8 text-red-600" />
      </div>
      <h2 className="text-xl font-semibold mb-2">
        We're having trouble loading this page
      </h2>
      <p className="text-muted-foreground max-w-md mb-6">
        Please try refreshing the page. If the problem continues, contact the business directly.
      </p>
      <Button onClick={() => window.location.reload()}>
        Refresh Page
      </Button>
    </div>
  );
}
