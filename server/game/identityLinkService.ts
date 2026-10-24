import { createHash, randomBytes } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { gameIdentityLinks, identityLinkChallenges, users } from "@shared/schema";
import { db } from "../db";

const EOS_CONNECT_JWKS = createRemoteJWKSet(new URL("https://api.epicgames.dev/auth/v1/oauth/jwks"));
const LINK_CHALLENGE_TTL_MS = 10 * 60 * 1000;
const ACTIVE_CHALLENGE_STATES = ["PENDING", "AWAITING_CONFIRMATION"] as const;

type EosConnectIdentity = {
  productUserId: string;
  productId: string;
  sandboxId: string;
  deploymentId: string;
};

type LinkStatus = "PENDING" | "AWAITING_CONFIRMATION" | "CONFIRMED" | "CANCELLED" | "EXPIRED";

export class IdentityLinkError extends Error {
  constructor(
    readonly status: 400 | 401 | 404 | 409 | 410 | 503,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "IdentityLinkError";
  }
}

function requiredSetting(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new IdentityLinkError(503, "IDENTITY_LINK_NOT_CONFIGURED", `Configuração ausente: ${name}`);
  return value;
}

function getEosConnectConfig() {
  const clientId = requiredSetting("EOS_CONNECT_CLIENT_ID");
  const issuer = requiredSetting("EOS_CONNECT_ISSUER");
  const productId = requiredSetting("EOS_PRODUCT_ID");
  const sandboxId = requiredSetting("EOS_SANDBOX_ID");
  const deploymentId = requiredSetting("EOS_DEPLOYMENT_ID");
  let issuerUrl: URL;
  try {
    issuerUrl = new URL(issuer);
  } catch {
    throw new IdentityLinkError(503, "IDENTITY_LINK_NOT_CONFIGURED", "EOS_CONNECT_ISSUER precisa ser uma URL HTTPS válida.");
  }
  if (issuerUrl.protocol !== "https:" || issuerUrl.hostname !== "api.epicgames.dev" || issuerUrl.port || issuerUrl.username || issuerUrl.password || issuerUrl.search || issuerUrl.hash) {
    throw new IdentityLinkError(503, "IDENTITY_LINK_NOT_CONFIGURED", "EOS_CONNECT_ISSUER precisa usar HTTPS em api.epicgames.dev.");
  }
  return { clientId, issuer, productId, sandboxId, deploymentId };
}

export function generateIdentityLinkCode(): string {
  return randomBytes(32).toString("base64url");
}

export function hashIdentityLinkCode(code: string): string {
  return createHash("sha256").update(code, "utf8").digest("hex");
}

export function hashEosConnectIdToken(idToken: string): string {
  return createHash("sha256").update(idToken, "utf8").digest("hex");
}

export function maskIdentitySubject(subject: string): string {
  return subject.length > 4 ? `••••${subject.slice(-4)}` : "••••";
}

export async function verifyEosConnectIdToken(
  idToken: string,
  keyResolver: Parameters<typeof jwtVerify>[1] = EOS_CONNECT_JWKS,
): Promise<EosConnectIdentity> {
  const config = getEosConnectConfig();
  let payload: Record<string, unknown>;
  try {
    const verified = await jwtVerify(idToken, keyResolver as JWTVerifyGetKey, {
      issuer: config.issuer,
      audience: config.clientId,
      clockTolerance: 30,
      maxTokenAge: "5m",
    });
    payload = verified.payload as Record<string, unknown>;
  } catch {
    throw new IdentityLinkError(401, "EOS_ID_TOKEN_INVALID", "ID token EOS Connect inválido, expirado ou emitido para outro cliente.");
  }

  const productUserId = payload.sub;
  if (typeof productUserId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(productUserId)) {
    throw new IdentityLinkError(401, "EOS_ID_TOKEN_INVALID", "O ID token não contém um Product User ID válido.");
  }
  if (payload.pfpid !== config.productId || payload.pfsid !== config.sandboxId || payload.pfdid !== config.deploymentId) {
    throw new IdentityLinkError(401, "EOS_ID_TOKEN_WRONG_DEPLOYMENT", "O ID token pertence a outro produto, sandbox ou deployment EOS.");
  }

  return {
    productUserId,
    productId: config.productId,
    sandboxId: config.sandboxId,
    deploymentId: config.deploymentId,
  };
}

export async function createIdentityLinkChallenge(userId: string) {
  // Fail closed before issuing a challenge that this deployment cannot verify.
  getEosConnectConfig();
  const code = generateIdentityLinkCode();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + LINK_CHALLENGE_TTL_MS);
  const codeHash = hashIdentityLinkCode(code);

  const [challenge] = await db.transaction(async (tx) => {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
    await tx.update(identityLinkChallenges).set({
      status: "CANCELLED",
      providerSubject: null,
      productId: null,
      sandboxId: null,
      deploymentId: null,
    }).where(and(
      eq(identityLinkChallenges.userId, userId),
      inArray(identityLinkChallenges.status, [...ACTIVE_CHALLENGE_STATES]),
    ));

    return tx.insert(identityLinkChallenges).values({
      userId,
      provider: "EOS_CONNECT",
      codeHash,
      status: "PENDING",
      expiresAt,
    }).returning({ id: identityLinkChallenges.id });
  });

  return { challengeId: challenge.id, code, expiresAt: expiresAt.toISOString() };
}

export async function submitEosIdentityProof(
  code: string,
  idToken: string,
  verifyIdentity: (token: string) => Promise<EosConnectIdentity> = verifyEosConnectIdToken,
) {
  const identity = await verifyIdentity(idToken);
  const codeHash = hashIdentityLinkCode(code);
  const proofTokenHash = hashEosConnectIdToken(idToken);
  const now = new Date();

  let outcome: { error: IdentityLinkError } | { challengeId: string; status: "AWAITING_CONFIRMATION"; maskedSubject: string };
  try {
    outcome = await db.transaction(async (tx) => {
      const [challenge] = await tx.select().from(identityLinkChallenges)
        .where(eq(identityLinkChallenges.codeHash, codeHash))
        .for("update");
      if (!challenge) return { error: new IdentityLinkError(404, "IDENTITY_LINK_CHALLENGE_NOT_FOUND", "Código de vinculação não encontrado.") };
      if (ACTIVE_CHALLENGE_STATES.includes(challenge.status as typeof ACTIVE_CHALLENGE_STATES[number]) && challenge.expiresAt.getTime() <= now.getTime()) {
        await tx.update(identityLinkChallenges).set({
          status: "EXPIRED",
          providerSubject: null,
          productId: null,
          sandboxId: null,
          deploymentId: null,
        }).where(eq(identityLinkChallenges.id, challenge.id));
        return { error: new IdentityLinkError(410, "IDENTITY_LINK_CHALLENGE_EXPIRED", "O código de vinculação expirou. Crie outro na sua conta.") };
      }
      if (challenge.status === "AWAITING_CONFIRMATION" && challenge.proofTokenHash === proofTokenHash) {
        return {
          challengeId: challenge.id,
          status: "AWAITING_CONFIRMATION" as const,
          maskedSubject: maskIdentitySubject(challenge.providerSubject ?? identity.productUserId),
        };
      }
      if (challenge.status !== "PENDING") {
        return { error: new IdentityLinkError(409, "IDENTITY_LINK_CHALLENGE_NOT_PENDING", "Este código já foi usado ou substituído.") };
      }

      const [existingLink] = await tx.select({ id: gameIdentityLinks.id }).from(gameIdentityLinks).where(and(
        eq(gameIdentityLinks.provider, "EOS_CONNECT"),
        eq(gameIdentityLinks.productId, identity.productId),
        eq(gameIdentityLinks.providerSubject, identity.productUserId),
      )).limit(1);
      if (existingLink) {
        return { error: new IdentityLinkError(409, "EOS_IDENTITY_ALREADY_LINKED", "Esta identidade EOS já está vinculada a uma conta.") };
      }

      await tx.update(identityLinkChallenges).set({
        status: "AWAITING_CONFIRMATION",
        proofTokenHash,
        providerSubject: identity.productUserId,
        productId: identity.productId,
        sandboxId: identity.sandboxId,
        deploymentId: identity.deploymentId,
        proofSubmittedAt: now,
      }).where(eq(identityLinkChallenges.id, challenge.id));

      return {
        challengeId: challenge.id,
        status: "AWAITING_CONFIRMATION" as const,
        maskedSubject: maskIdentitySubject(identity.productUserId),
      };
    });
  } catch (error) {
    const dbError = error as { code?: string; constraint?: string };
    if (dbError?.code === "23505" && dbError.constraint === "identity_link_challenge_proof_token_hash_unique") {
      throw new IdentityLinkError(409, "EOS_ID_TOKEN_REPLAYED", "Este ID token EOS já foi usado em outro desafio.");
    }
    throw error;
  }

  if ("error" in outcome) throw outcome.error;
  return outcome;
}

export async function getIdentityLinkChallengeStatus(userId: string, challengeId: string) {
  const [challenge] = await db.select().from(identityLinkChallenges).where(and(
    eq(identityLinkChallenges.id, challengeId),
    eq(identityLinkChallenges.userId, userId),
  )).limit(1);
  if (!challenge) throw new IdentityLinkError(404, "IDENTITY_LINK_CHALLENGE_NOT_FOUND", "Desafio de vinculação não encontrado.");

  let status = challenge.status as LinkStatus;
  let maskedSubject: string | undefined;
  if (ACTIVE_CHALLENGE_STATES.includes(status as typeof ACTIVE_CHALLENGE_STATES[number]) && challenge.expiresAt.getTime() <= Date.now()) {
    status = "EXPIRED";
    await db.update(identityLinkChallenges).set({
      status,
      providerSubject: null,
      productId: null,
      sandboxId: null,
      deploymentId: null,
    }).where(eq(identityLinkChallenges.id, challenge.id));
  } else if (status === "AWAITING_CONFIRMATION" && challenge.providerSubject) {
    maskedSubject = maskIdentitySubject(challenge.providerSubject);
  }

  return {
    challengeId: challenge.id,
    status,
    expiresAt: challenge.expiresAt.toISOString(),
    ...(maskedSubject ? { maskedSubject } : {}),
  };
}

export async function confirmIdentityLinkChallenge(userId: string, challengeId: string) {
  const now = new Date();
  try {
    const outcome = await db.transaction(async (tx) => {
      const [challenge] = await tx.select().from(identityLinkChallenges).where(and(
        eq(identityLinkChallenges.id, challengeId),
        eq(identityLinkChallenges.userId, userId),
      )).for("update");
      if (!challenge) return { error: new IdentityLinkError(404, "IDENTITY_LINK_CHALLENGE_NOT_FOUND", "Desafio de vinculação não encontrado.") };
      if (challenge.status !== "AWAITING_CONFIRMATION" || !challenge.providerSubject || !challenge.productId || !challenge.sandboxId || !challenge.deploymentId) {
        return { error: new IdentityLinkError(409, "IDENTITY_LINK_PROOF_REQUIRED", "O jogo ainda não comprovou uma identidade EOS para este desafio.") };
      }
      if (challenge.expiresAt.getTime() <= now.getTime()) {
        await tx.update(identityLinkChallenges).set({
          status: "EXPIRED",
          providerSubject: null,
          productId: null,
          sandboxId: null,
          deploymentId: null,
        }).where(eq(identityLinkChallenges.id, challenge.id));
        return { error: new IdentityLinkError(410, "IDENTITY_LINK_CHALLENGE_EXPIRED", "O desafio de vinculação expirou. Crie outro na sua conta.") };
      }

      const [identity] = await tx.insert(gameIdentityLinks).values({
        userId,
        provider: "EOS_CONNECT",
        providerSubject: challenge.providerSubject,
        productId: challenge.productId,
        sandboxId: challenge.sandboxId,
        deploymentId: challenge.deploymentId,
        linkedAt: now,
        lastVerifiedAt: now,
      }).returning({ id: gameIdentityLinks.id, provider: gameIdentityLinks.provider, providerSubject: gameIdentityLinks.providerSubject, linkedAt: gameIdentityLinks.linkedAt });

      await tx.update(identityLinkChallenges).set({
        status: "CONFIRMED",
        confirmedAt: now,
        providerSubject: null,
        productId: null,
        sandboxId: null,
        deploymentId: null,
      }).where(eq(identityLinkChallenges.id, challenge.id));

      return {
        id: identity.id,
        provider: "EOS_CONNECT" as const,
        maskedSubject: maskIdentitySubject(identity.providerSubject),
        linkedAt: identity.linkedAt.toISOString(),
      };
    });

    if ("error" in outcome) throw outcome.error;
    return outcome;
  } catch (error) {
    if (error instanceof IdentityLinkError) throw error;
    if ((error as { code?: string })?.code === "23505") {
      throw new IdentityLinkError(409, "EOS_IDENTITY_ALREADY_LINKED", "Esta conta ou identidade EOS já possui um vínculo.");
    }
    throw error;
  }
}

export async function listGameIdentityLinks(userId: string) {
  const identities = await db.select({
    id: gameIdentityLinks.id,
    provider: gameIdentityLinks.provider,
    providerSubject: gameIdentityLinks.providerSubject,
    linkedAt: gameIdentityLinks.linkedAt,
    lastVerifiedAt: gameIdentityLinks.lastVerifiedAt,
  }).from(gameIdentityLinks).where(eq(gameIdentityLinks.userId, userId));

  return identities.map((identity) => ({
    id: identity.id,
    provider: "EOS_CONNECT" as const,
    maskedSubject: maskIdentitySubject(identity.providerSubject),
    linkedAt: identity.linkedAt.toISOString(),
    lastVerifiedAt: identity.lastVerifiedAt.toISOString(),
  }));
}
