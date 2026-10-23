import { randomUUID } from "node:crypto";
import { distributedState } from "../../game/DistributedState";
import { getSigningKeys, signWithKey, verifySignature, type SigningKey } from "./keyring";

const TOKEN_LIFETIME_SECONDS = 60;
const TOKEN_PURPOSE = "khaaos-websocket";

type WsTokenPayload = {
  sub: string;
  sid?: string;
  jti: string;
  kid: string;
  iat: number;
  exp: number;
  purpose: typeof TOKEN_PURPOSE;
};

export type VerifiedWsToken = WsTokenPayload;

function keys(): SigningKey[] { return getSigningKeys("WS_TOKEN_SECRET"); }

export function createWsAccessToken(userId: string, nowSeconds = Math.floor(Date.now() / 1000), sessionId?: string) {
  if (!userId || userId.length > 256) throw new Error("Invalid WebSocket subject");
  const [key] = keys();
  const payload: WsTokenPayload = {
    sub: userId,
    sid: sessionId,
    jti: randomUUID(),
    kid: key.kid,
    iat: nowSeconds,
    exp: nowSeconds + TOKEN_LIFETIME_SECONDS,
    purpose: TOKEN_PURPOSE,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return { token: `${encodedPayload}.${signWithKey(encodedPayload, key)}`, expiresAt: payload.exp, jti: payload.jti };
}

export function verifyWsAccessTokenDetails(token: string, nowSeconds = Math.floor(Date.now() / 1000)): VerifiedWsToken | null {
  if (typeof token !== "string" || token.length > 2048) return null;
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  try {
    const [encodedPayload, signature] = parts;
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as Partial<WsTokenPayload>;
    const key = keys().find((candidate) => candidate.kid === payload.kid) ?? keys()[0];
    if (!key || !verifySignature(encodedPayload, signature, key)) return null;
    if (
      typeof payload.sub !== "string" || !payload.sub || payload.sub.length > 256 ||
      typeof payload.jti !== "string" || !payload.jti || payload.jti.length > 128 ||
      payload.purpose !== TOKEN_PURPOSE || !Number.isInteger(payload.iat) || !Number.isInteger(payload.exp) ||
      (payload.iat as number) > nowSeconds + 30 || (payload.exp as number) <= nowSeconds ||
      (payload.exp as number) - (payload.iat as number) > TOKEN_LIFETIME_SECONDS
    ) return null;
    return payload as VerifiedWsToken;
  } catch { return null; }
}

export function verifyWsAccessToken(token: string, nowSeconds = Math.floor(Date.now() / 1000)): string | null {
  return verifyWsAccessTokenDetails(token, nowSeconds)?.sub ?? null;
}

export async function consumeWsAccessToken(token: string, origin?: string): Promise<VerifiedWsToken | null> {
  const payload = verifyWsAccessTokenDetails(token);
  if (!payload) return null;
  if (origin && process.env.PUBLIC_ORIGIN && origin !== new URL(process.env.PUBLIC_ORIGIN).origin) return null;
  if (await distributedState.isUserRevoked(payload.sub)) return null;
  if (!(await distributedState.consumeOnce(`ws:${payload.jti}`, Math.max(1_000, (payload.exp - Math.floor(Date.now() / 1000)) * 1_000)))) return null;
  return payload;
}
