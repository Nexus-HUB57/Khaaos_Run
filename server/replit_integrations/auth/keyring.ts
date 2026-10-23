import { createHmac, timingSafeEqual } from "node:crypto";

export type SigningKey = { kid: string; secret: string };

function requireSecret(value: string | undefined, name: string): string {
  if (!value || Buffer.byteLength(value, "utf8") < 32) throw new Error(`${name} must contain at least 32 bytes`);
  return value;
}

export function getSigningKeys(prefix: "WS_TOKEN_SECRET" | "SESSION_SECRET"): SigningKey[] {
  const current = requireSecret(
    process.env[`${prefix}_CURRENT`] ?? process.env[prefix],
    `${prefix}_CURRENT`,
  );
  const previous = process.env[`${prefix}_PREVIOUS`];
  const keys: SigningKey[] = [{ kid: process.env[`${prefix}_KID`] ?? "current", secret: current }];
  if (previous) keys.push({ kid: process.env[`${prefix}_PREVIOUS_KID`] ?? "previous", secret: requireSecret(previous, `${prefix}_PREVIOUS`) });
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
