import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

// Pull the HTTP status out of an error thrown by throwIfResNotOk ("503: ...").
function getStatusFromError(error: unknown): number | null {
  const msg = error instanceof Error ? error.message : String(error);
  const m = msg.match(/^(\d{3}):/);
  return m ? parseInt(m[1], 10) : null;
}

// Retry transient failures so a brief database/host hiccup self-heals instead of
// showing the customer a broken/blank page. We retry network errors (no status)
// and server-side/transient statuses, but NEVER client errors like 401/403/404
// (retrying those is pointless and could be harmful).
function shouldRetryQuery(failureCount: number, error: unknown): boolean {
  if (failureCount >= 3) return false;
  const status = getStatusFromError(error);
  if (status === null) return true; // fetch threw → network/connection blip
  return status >= 500 || status === 408 || status === 429;
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: shouldRetryQuery,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    },
    mutations: {
      // Mutations stay non-retrying on purpose: order-creating endpoints must not
      // be blindly retried (duplicate-order risk). Safe retries are handled
      // explicitly at the call site / via the upload base64 fallback helper.
      retry: false,
    },
  },
});
