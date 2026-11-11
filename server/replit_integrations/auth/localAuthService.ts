import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";

export type LocalAuthAccount = {
  userId: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  passwordHash: string;
  emailVerifiedAt: Date | null;
};

export type LocalAuthRecipient = {
  email: string;
  firstName: string | null;
  lastName: string | null;
};

export interface LocalAuthRepository {
  createPendingAccount(input: {
    userId: string;
    email: string;
    firstName: string;
    lastName: string | null;
    passwordHash: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<boolean>;
  createEmailVerificationToken(email: string, tokenHash: string, expiresAt: Date): Promise<LocalAuthRecipient | null>;
  consumeEmailVerificationToken(tokenHash: string, now: Date): Promise<boolean>;
  findByEmail(email: string): Promise<LocalAuthAccount | null>;
  createPasswordResetToken(email: string, tokenHash: string, expiresAt: Date): Promise<LocalAuthRecipient | null>;
  consumePasswordResetToken(tokenHash: string, passwordHash: string, now: Date): Promise<boolean>;
}

export interface LocalAuthMailer {
  sendVerificationEmail(recipient: LocalAuthRecipient, url: string): Promise<void>;
  sendPasswordResetEmail(recipient: LocalAuthRecipient, url: string): Promise<void>;
}

export class AuthEmailUnavailableError extends Error {
  constructor() {
    super("Email delivery is not configured");
    this.name = "AuthEmailUnavailableError";
  }
}

export class AuthEmailDeliveryError extends Error {
  constructor() {
    super("Email delivery failed");
    this.name = "AuthEmailDeliveryError";
  }
}

const SCRYPT_N = 1 << 15;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEY_LENGTH = 64;
const SCRYPT_MAX_MEMORY = 64 * 1024 * 1024;

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, SCRYPT_KEY_LENGTH, {
      N: SCRYPT_N,
      r: SCRYPT_R,
      p: SCRYPT_P,
      maxmem: SCRYPT_MAX_MEMORY,
    }, (error, key) => {
      if (error) reject(error);
      else resolve(key as Buffer);
    });
  });
}

let dummyPasswordHash: Promise<string> | null = null;
function getDummyPasswordHash(): Promise<string> {
  if (!dummyPasswordHash) {
    const salt = Buffer.alloc(16, 0x5a);
    dummyPasswordHash = deriveKey("war-i-nonexistent-account", salt)
      .then((key) => `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("base64url")}$${key.toString("base64url")}`);
  }
  return dummyPasswordHash;
}

export function validatePassword(password: string): boolean {
  const length = [...password].length;
  return length >= 12 && length <= 128 && Buffer.byteLength(password, "utf8") <= 1024;
}

export async function hashPassword(password: string): Promise<string> {
  if (!validatePassword(password)) throw new Error("Password does not meet the length policy");
  const salt = randomBytes(16);
  const key = await deriveKey(password, salt);
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(password: string, encodedHash: string): Promise<boolean> {
  const [algorithm, n, r, p, saltText, keyText, extra] = encodedHash.split("$");
  if (extra !== undefined || algorithm !== "scrypt" || Number(n) !== SCRYPT_N || Number(r) !== SCRYPT_R || Number(p) !== SCRYPT_P) {
    return false;
  }
  try {
    const salt = Buffer.from(saltText, "base64url");
    const expected = Buffer.from(keyText, "base64url");
    if (salt.length !== 16 || expected.length !== SCRYPT_KEY_LENGTH) return false;
    const actual = await deriveKey(password, salt);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function normalizeEmail(email: string): string {
  return email.normalize("NFKC").trim().toLowerCase();
}

export function hashAuthToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function newToken(): { value: string; hash: string } {
  const value = randomBytes(32).toString("hex");
  return { value, hash: hashAuthToken(value) };
}

function buildAuthUrl(origin: string, mode: "verify" | "reset", token: string): string {
  const base = new URL("/auth", origin);
  base.hash = `${mode}=${token}`;
  return base.toString();
}

function isHexToken(token: string): boolean {
  return /^[a-f0-9]{64}$/i.test(token);
}

export function createLocalAuthService(repository: LocalAuthRepository, mailer: LocalAuthMailer | null) {
  return {
    async register(input: { name: string; email: string; password: string }, origin: string): Promise<void> {
      if (!mailer) throw new AuthEmailUnavailableError();
      const email = normalizeEmail(input.email);
      const name = input.name.trim().replace(/\s+/g, " ");
      if (!name || name.length > 80 || !validatePassword(input.password)) throw new Error("Invalid registration input");
      const [firstName, ...lastNames] = name.split(" ");
      const token = newToken();
      const created = await repository.createPendingAccount({
        userId: cryptoRandomId(),
        email,
        firstName,
        lastName: lastNames.join(" ") || null,
        passwordHash: await hashPassword(input.password),
        tokenHash: token.hash,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });
      // Existing OIDC accounts and duplicate local registrations get the same
      // public response; email-based account linking is deliberately forbidden.
      if (!created) return;
      try {
        await mailer.sendVerificationEmail({ email, firstName, lastName: lastNames.join(" ") || null }, buildAuthUrl(origin, "verify", token.value));
      } catch {
        throw new AuthEmailDeliveryError();
      }
    },

    async verifyEmail(token: string): Promise<boolean> {
      if (!isHexToken(token)) return false;
      return repository.consumeEmailVerificationToken(hashAuthToken(token), new Date());
    },

    async resendVerification(emailInput: string, origin: string): Promise<void> {
      if (!mailer) throw new AuthEmailUnavailableError();
      const email = normalizeEmail(emailInput);
      const token = newToken();
      const recipient = await repository.createEmailVerificationToken(email, token.hash, new Date(Date.now() + 24 * 60 * 60 * 1000));
      if (!recipient) return;
      try {
        await mailer.sendVerificationEmail(recipient, buildAuthUrl(origin, "verify", token.value));
      } catch {
        throw new AuthEmailDeliveryError();
      }
    },

    async authenticate(emailInput: string, password: string): Promise<LocalAuthAccount | null> {
      if (Buffer.byteLength(password, "utf8") > 1024) return null;
      const email = normalizeEmail(emailInput);
      const account = await repository.findByEmail(email);
      const hash = account?.passwordHash ?? await getDummyPasswordHash();
      const valid = await verifyPassword(password, hash);
      if (!account || !account.emailVerifiedAt || !valid) return null;
      return account;
    },

    async requestPasswordReset(emailInput: string, origin: string): Promise<void> {
      if (!mailer) throw new AuthEmailUnavailableError();
      const email = normalizeEmail(emailInput);
      const token = newToken();
      const recipient = await repository.createPasswordResetToken(email, token.hash, new Date(Date.now() + 30 * 60 * 1000));
      if (!recipient) return;
      try {
        await mailer.sendPasswordResetEmail(recipient, buildAuthUrl(origin, "reset", token.value));
      } catch {
        throw new AuthEmailDeliveryError();
      }
    },

    async resetPassword(token: string, password: string): Promise<boolean> {
      if (!isHexToken(token) || !validatePassword(password)) return false;
      const passwordHash = await hashPassword(password);
      return repository.consumePasswordResetToken(hashAuthToken(token), passwordHash, new Date());
    },
  };
}

function cryptoRandomId(): string {
  return randomUUID();
}
