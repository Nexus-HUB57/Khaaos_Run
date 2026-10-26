import { createHash } from "node:crypto";
import { calculateLoanInterestMinorUnits, fromMinorUnits, toMinorUnits } from "@shared/money";

export { calculateLoanInterestMinorUnits, fromMinorUnits, toMinorUnits };

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    );
  }
  return value;
}

export function hashEconomicRequest(operation: string, input: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify({ operation, input: canonicalize(input) }))
    .digest("hex");
}

export function isValidIdempotencyKey(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9._~-]{16,128}$/.test(value);
}
