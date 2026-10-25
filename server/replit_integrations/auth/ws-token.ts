import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { distributedState } from "../../game/DistributedState";

const TOKEN_LIFETIME_SECONDS = 60;
const MAX_FUTURE_CLOCK_SKEW_SECONDS = 30;
const TOKEN_PURPOSE = "khaaos-websocket";

interface WsTokenPayload {
  sub: string;
  iat: number;
  exp: number;
  jti: string;
  purpose: typeof TOKEN_PURPOSE;
}

function getSigningSecret(): string {
  const secret = process.env.WS_TOKEN_SECRET ?? process.env.SESSION_SECRET;
  if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error("WS_TOKEN_SECRET (or SESSION_SECRET) must contain at least 32 bytes");
  }
  return secret;
}

function sign(payload: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(payload).digest();
}

export function createWsAccessToken(userId: string, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (!userId || userId.length > 256) throw new Error("Invalid WebSocket subject");
  const payload: WsTokenPayload = {
    sub: userId,
    iat: nowSeconds,
    exp: nowSeconds + TOKEN_LIFETIME_SECONDS,
    jti: randomBytes(16).toString("base64url"),
    purpose: TOKEN_PURPOSE,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = sign(encodedPayload, getSigningSecret()).toString("base64url");
  return { token: `${encodedPayload}.${signature}`, expiresAt: payload.exp };
}

function readWsAccessToken(token: string, nowSeconds: number): WsTokenPayload | null {
  if (typeof token !== "string" || token.length > 2048) return null;
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;

  try {
    const [encodedPayload, encodedSignature] = parts;
    const payloadBytes = Buffer.from(encodedPayload, "base64url");
    if (payloadBytes.toString("base64url") !== encodedPayload) return null;
    const secret = getSigningSecret();
    const expectedSignature = sign(encodedPayload, secret);
    const providedSignature = Buffer.from(encodedSignature, "base64url");
    if (providedSignature.toString("base64url") !== encodedSignature) return null;
    if (providedSignature.length !== expectedSignature.length || !timingSafeEqual(providedSignature, expectedSignature)) {
      return null;
    }

    const payload = JSON.parse(payloadBytes.toString("utf8")) as Partial<WsTokenPayload>;
    if (
      typeof payload.sub !== "string" || !payload.sub || payload.sub.length > 256 ||
      typeof payload.jti !== "string" || !/^[A-Za-z0-9_-]{16,128}$/.test(payload.jti) ||
      payload.purpose !== TOKEN_PURPOSE || !Number.isInteger(payload.iat) || !Number.isInteger(payload.exp) ||
      (payload.iat as number) > nowSeconds + MAX_FUTURE_CLOCK_SKEW_SECONDS || (payload.exp as number) <= nowSeconds ||
      (payload.exp as number) - (payload.iat as number) > TOKEN_LIFETIME_SECONDS
    ) return null;

    return payload as WsTokenPayload;
  } catch {
    return null;
  }
}

export function verifyWsAccessToken(token: string, nowSeconds = Math.floor(Date.now() / 1000)): string | null {
  return readWsAccessToken(token, nowSeconds)?.sub ?? null;
}

export async function consumeWsAccessToken(
  token: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<string | null> {
  const payload = readWsAccessToken(token, nowSeconds);
  if (!payload) return null;
  // Retain the marker for the full lifetime plus the largest accepted issuer/consumer clock skew.
  const remainingTtlMs = (payload.exp - payload.iat + MAX_FUTURE_CLOCK_SKEW_SECONDS) * 1_000;
  try {
    return await distributedState.consumeWsTicket(payload.jti, remainingTtlMs) ? payload.sub : null;
  } catch {
    return null;
  }
}
