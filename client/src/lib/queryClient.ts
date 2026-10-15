import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { IDEMPOTENCY_RETRY_WINDOW_DAYS } from "@shared/economyPolicy";

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

type StoredIdempotencyKey = { key: string; createdAt: number };
const IDEMPOTENCY_RETRY_WINDOW_MS = IDEMPOTENCY_RETRY_WINDOW_DAYS * 24 * 60 * 60 * 1000;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._~-]{16,128}$/;
const fallbackIdempotencyKeys = new Map<string, StoredIdempotencyKey>();

function isStoredIdempotencyKey(value: unknown): value is StoredIdempotencyKey {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<StoredIdempotencyKey>;
  return typeof candidate.key === "string"
    && IDEMPOTENCY_KEY_PATTERN.test(candidate.key)
    && Number.isSafeInteger(candidate.createdAt);
}

function isWithinRetryWindow(entry: StoredIdempotencyKey, now: number): boolean {
  return entry.createdAt <= now && now - entry.createdAt < IDEMPOTENCY_RETRY_WINDOW_MS;
}

function persistIdempotencyKey(storageKey: string, key: string, createdAt = Date.now()): void {
  const entry = { key, createdAt };
  fallbackIdempotencyKeys.set(storageKey, entry);
  try { sessionStorage.setItem(storageKey, JSON.stringify(entry)); } catch { /* in-memory fallback remains */ }
}

function removeIdempotencyKey(storageKey: string): void {
  fallbackIdempotencyKeys.delete(storageKey);
  try { sessionStorage.removeItem(storageKey); } catch { /* storage may be unavailable */ }
}

function readIdempotencyKey(storageKey: string): string | null {
  const now = Date.now();
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (raw !== null) {
      let parsed: unknown;
      try { parsed = JSON.parse(raw); } catch { parsed = null; }
      if (isStoredIdempotencyKey(parsed)) {
        if (isWithinRetryWindow(parsed, now)) {
          fallbackIdempotencyKeys.set(storageKey, parsed);
          return parsed.key;
        }
        removeIdempotencyKey(storageKey);
        return null;
      }
      // Migrate keys written by the previous client version; the migration starts a fresh window.
      if (IDEMPOTENCY_KEY_PATTERN.test(raw)) {
        persistIdempotencyKey(storageKey, raw, now);
        return raw;
      }
      removeIdempotencyKey(storageKey);
      return null;
    }
  } catch { /* use the in-memory fallback below */ }

  const fallback = fallbackIdempotencyKeys.get(storageKey);
  if (!fallback) return null;
  if (!isWithinRetryWindow(fallback, now)) {
    fallbackIdempotencyKeys.delete(storageKey);
    return null;
  }
  return fallback.key;
}

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
  let key = readIdempotencyKey(storageKey);
  if (!key) {
    key = createIdempotencyKey();
    persistIdempotencyKey(storageKey, key);
  }

  const headers = new Headers(init.headers);
  headers.set("Idempotency-Key", key);
  const response = await fetch(url, { ...init, headers });
  if (response.status >= 400 && response.status < 500) {
    removeIdempotencyKey(storageKey);
  } else if (response.ok) {
    try {
      await response.clone().json();
      removeIdempotencyKey(storageKey);
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
