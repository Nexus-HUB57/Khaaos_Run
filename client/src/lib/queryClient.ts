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

const fallbackIdempotencyKeys = new Map<string, string>();

async function operationStorageKey(fingerprint: string): Promise<string> {
  if (globalThis.crypto?.subtle) {
    const bytes = new TextEncoder().encode(fingerprint);
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  return encodeURIComponent(fingerprint);
}

function createIdempotencyKey(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  if (globalThis.crypto?.getRandomValues) {
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  throw new Error("Este navegador não oferece geração segura de chave de idempotência.");
}

/** Reuses the same intent key after ambiguous transport/server failures. */
export async function idempotentFetch(url: string, init: RequestInit): Promise<Response> {
  const method = (init.method ?? "POST").toUpperCase();
  const body = typeof init.body === "string" ? init.body : "";
  const storageKey = `khaaos:economy-idempotency:${await operationStorageKey(`${method}:${url}:${body}`)}`;
  let key: string | null = null;
  try { key = sessionStorage.getItem(storageKey); } catch { key = fallbackIdempotencyKeys.get(storageKey) ?? null; }
  if (!key) {
    key = createIdempotencyKey();
    try { sessionStorage.setItem(storageKey, key); } catch { fallbackIdempotencyKeys.set(storageKey, key); }
  }

  const headers = new Headers(init.headers);
  headers.set("Idempotency-Key", key);
  const response = await fetch(url, { ...init, headers });
  if (response.status >= 400 && response.status < 500) {
    try { sessionStorage.removeItem(storageKey); } catch { fallbackIdempotencyKeys.delete(storageKey); }
  } else if (response.ok) {
    try {
      await response.clone().json();
      try { sessionStorage.removeItem(storageKey); } catch { fallbackIdempotencyKeys.delete(storageKey); }
    } catch {
      // Keep the key if the success response was malformed so a retry replays the committed result.
    }
  }
  return response;
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
});
