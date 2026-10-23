import { createHmac, timingSafeEqual } from "node:crypto";

export type SigningKey = { kid: string; secret: string; previous?: boolean };

function requireSecret(value: string | undefined, name: string): string {
  if (!value || Buffer.byteLength(value, "utf8") < 32) throw new Error(`${name} must contain at least 32 bytes`);
  return value;
}

function parseEpoch(value: string | undefined, name: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${name} must be a positive epoch timestamp`);
  return parsed;
}

export function getSigningKeys(
  prefix: "WS_TOKEN_SECRET" | "SESSION_SECRET",
  nowSeconds = Math.floor(Date.now() / 1000),
): SigningKey[] {
  const current = requireSecret(
    process.env[`${prefix}_CURRENT`] ?? process.env[prefix],
    `${prefix}_CURRENT`,
  );
  const currentKid = process.env[`${prefix}_KID`] ?? "current";
  const keys: SigningKey[] = [{ kid: currentKid, secret: current }];
  const previous = process.env[`${prefix}_PREVIOUS`];
  if (!previous) return keys;

  const until = parseEpoch(process.env[`${prefix}_PREVIOUS_VALID_UNTIL`], `${prefix}_PREVIOUS_VALID_UNTIL`);
  const rotatedAt = parseEpoch(process.env[`${prefix}_ROTATED_AT`], `${prefix}_ROTATED_AT`);
  const graceSeconds = Number(process.env[`${prefix}_GRACE_SECONDS`] ?? process.env.AUTH_KEY_GRACE_SECONDS ?? 86_400);
  if (!Number.isFinite(graceSeconds) || graceSeconds <= 0) throw new Error("AUTH_KEY_GRACE_SECONDS must be positive");
  const validUntil = until ?? (rotatedAt === undefined ? undefined : rotatedAt + graceSeconds);
  if (validUntil === undefined) {
    if (process.env.NODE_ENV === "production") throw new Error(`${prefix}_PREVIOUS requires an explicit validity window in production`);
    return keys;
  }
  if (validUntil > nowSeconds) {
    keys.push({ kid: process.env[`${prefix}_PREVIOUS_KID`] ?? "previous", secret: requireSecret(previous, `${prefix}_PREVIOUS`), previous: true });
  }
  return keys;
}

export function signWithKey(payload: string, key: SigningKey): string {
  return createHmac("sha256", key.secret).update(payload).digest("base64url");
}

export function verifySignature(payload: string, signature: string, key: SigningKey): boolean {
  try {
    const expected = Buffer.from(signWithKey(payload, key), "base64url");
    const provided = Buffer.from(signature, "base64url");
    return expected.length === provided.length && timingSafeEqual(expected, provided);
  } catch {
    return false;
  }
}
