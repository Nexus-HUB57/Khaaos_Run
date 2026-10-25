function configuredOrigins(): Set<string> {
  const values = [process.env.PUBLIC_ORIGIN, ...(process.env.ALLOWED_WS_ORIGINS ?? "").split(",")]
    .filter((value): value is string => Boolean(value))
    .map((value) => {
      try { return new URL(value.trim()).origin; } catch { return ""; }
    })
    .filter(Boolean);
  return new Set(values);
}

export function isAllowedOrigin(origin: string | undefined, requestOrigin?: string): boolean {
  const allowlist = configuredOrigins();
  if (allowlist.size === 0) return process.env.NODE_ENV !== "production";
  if (!origin) return process.env.NODE_ENV !== "production" || process.env.ALLOW_MISSING_WS_ORIGIN === "true";
  if (!allowlist.has(origin)) return false;
  if (requestOrigin && allowlist.size > 0 && !allowlist.has(requestOrigin)) return false;
  return true;
}

export function requestOriginFromHeaders(headers: Record<string, string | string[] | undefined>): string | undefined {
  const value = headers.origin;
  return Array.isArray(value) ? value[0] : value;
}
