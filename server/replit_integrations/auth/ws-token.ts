import { createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_LIFETIME_SECONDS = 60;
const TOKEN_PURPOSE = "khaaos-websocket";

interface WsTokenPayload {
  sub: string;
  iat: number;
  exp: number;
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
    purpose: TOKEN_PURPOSE,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = sign(encodedPayload, getSigningSecret()).toString("base64url");
  return { token: `${encodedPayload}.${signature}`, expiresAt: payload.exp };
}

export function verifyWsAccessToken(token: string, nowSeconds = Math.floor(Date.now() / 1000)): string | null {
  if (typeof token !== "string" || token.length > 2048) return null;
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;

  try {
    const [encodedPayload, encodedSignature] = parts;
    const secret = getSigningSecret();
    const expectedSignature = sign(encodedPayload, secret);
    const providedSignature = Buffer.from(encodedSignature, "base64url");
    if (providedSignature.length !== expectedSignature.length || !timingSafeEqual(providedSignature, expectedSignature)) {
      return null;
    }

    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as Partial<WsTokenPayload>;
    if (
      typeof payload.sub !== "string" || !payload.sub || payload.sub.length > 256 ||
      payload.purpose !== TOKEN_PURPOSE || !Number.isInteger(payload.iat) || !Number.isInteger(payload.exp) ||
      (payload.iat as number) > nowSeconds + 30 || (payload.exp as number) <= nowSeconds ||
      (payload.exp as number) - (payload.iat as number) > TOKEN_LIFETIME_SECONDS
    ) return null;

    return payload.sub;
  } catch {
    return null;
  }
}
