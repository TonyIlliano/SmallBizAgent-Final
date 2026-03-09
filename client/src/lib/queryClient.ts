import { QueryClient, QueryCache, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    let errorMessage = res.statusText;
    try {
      // Try to parse as JSON first
      const contentType = res.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        const errorData = await res.json();
        errorMessage = errorData.error || errorData.message || res.statusText;
      } else {
        // Fall back to text
        errorMessage = (await res.text()) || res.statusText;
      }
    } catch (parseError) {
      // If JSON parsing fails, use the status text
      console.error("Error parsing API response:", parseError);
    }
    throw new Error(`${res.status}: ${errorMessage}`);
  }
}

/** Read a cookie value by name */
function getCookie(name: string): string | undefined {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  try {
    const headers: Record<string, string> = {};
    if (data) headers["Content-Type"] = "application/json";

    // Include CSRF token on state-changing requests
    const csrfToken = getCookie("csrf-token");
    if (csrfToken && !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase())) {
      headers["X-CSRF-Token"] = csrfToken;
    }

    const res = await fetch(url, {
      method,
      headers,
      body: data ? JSON.stringify(data) : undefined,
      credentials: "include",
    });

    await throwIfResNotOk(res);
    return res;
  } catch (error) {
    console.error(`API Request failed for ${method} ${url}:`, error);
    throw error;
  }
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    try {
      // Build URL with query parameters if provided
      let url = queryKey[0] as string;
      if (queryKey[1] && typeof queryKey[1] === 'object') {
        const params = new URLSearchParams();
        Object.entries(queryKey[1] as Record<string, any>).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            params.append(key, String(value));
          }
        });
        const queryString = params.toString();
        if (queryString) {
          url = `${url}?${queryString}`;
        }
      }

      const res = await fetch(url, {
        credentials: "include",
      });

      if (unauthorizedBehavior === "returnNull" && res.status === 401) {
        return null;
      }

      await throwIfResNotOk(res);
      const data = await res.json();
      return data;
    } catch (error) {
      console.error(`Query failed for ${queryKey[0]}:`, error);
      throw error;
    }
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
  // Global query cache error handler — logs failed queries for visibility
  queryCache: new QueryCache({
    onError: (error, query) => {
      // Skip 401s — those are handled by auth redirect
      if (error.message?.startsWith("401:")) return;
      console.error(`[QueryError] ${query.queryKey[0]}:`, error.message);
    },
  }),
});
