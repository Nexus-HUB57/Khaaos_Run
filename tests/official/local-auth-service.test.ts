import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createLocalAuthService,
  hashPassword,
  normalizeEmail,
  validatePassword,
  verifyPassword,
  type LocalAuthAccount,
  type LocalAuthRecipient,
  type LocalAuthRepository,
} from "../../server/replit_integrations/auth/localAuthService.ts";

class MemoryLocalAuthRepository implements LocalAuthRepository {
  account: LocalAuthAccount | null = null;
  recipient: LocalAuthRecipient | null = null;
  verifyHash: string | null = null;
  resetHash: string | null = null;
  resetPasswordHash: string | null = null;
  verified = false;

  async createPendingAccount(input: { userId: string; email: string; firstName: string; lastName: string | null; passwordHash: string; tokenHash: string }): Promise<boolean> {
    if (this.account || this.recipient) return false;
    this.account = {
      userId: input.userId,
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      passwordHash: input.passwordHash,
      emailVerifiedAt: null,
    };
    this.verifyHash = input.tokenHash;
    this.recipient = { email: input.email, firstName: input.firstName, lastName: input.lastName };
    return true;
  }

  async createEmailVerificationToken(_email: string, tokenHash: string): Promise<LocalAuthRecipient | null> {
    if (!this.account || this.verified) return null;
    this.verifyHash = tokenHash;
    return this.recipient;
  }

  async consumeEmailVerificationToken(tokenHash: string): Promise<boolean> {
    if (!this.account || this.verified || tokenHash !== this.verifyHash) return false;
    this.verified = true;
    this.account.emailVerifiedAt = new Date();
    return true;
  }

  async findByEmail(email: string): Promise<LocalAuthAccount | null> {
    return this.account?.email === email ? this.account : null;
  }

  async createPasswordResetToken(email: string, tokenHash: string): Promise<LocalAuthRecipient | null> {
    if (!this.account || this.account.email !== email || !this.verified) return null;
    this.resetHash = tokenHash;
    return this.recipient;
  }

  async consumePasswordResetToken(tokenHash: string, passwordHash: string): Promise<boolean> {
    if (!this.account || !this.verified || tokenHash !== this.resetHash) return false;
    this.resetPasswordHash = passwordHash;
    this.account.passwordHash = passwordHash;
    this.resetHash = null;
    return true;
  }
}

function tokenFromMailLink(url: string, key: "verify" | "reset"): string {
  const value = new URL(url).hash.slice(1);
  const parsed = new URLSearchParams(value);
  assert.ok(parsed.has(key));
  return parsed.get(key)!;
}

test("local auth normaliza email, guarda hash e exige email verificado para login", async () => {
  const repository = new MemoryLocalAuthRepository();
  let verificationUrl = "";
  const service = createLocalAuthService(repository, {
    async sendVerificationEmail(_recipient, url) { verificationUrl = url; },
    async sendPasswordResetEmail() {},
  });

  assert.equal(normalizeEmail("  Operador@EXAMPLE.COM "), "operador@example.com");
  assert.equal(validatePassword("senha curta"), false);
  assert.equal(validatePassword("senha longa segura 2026"), true);

  await service.register({ name: "Operador Alfa", email: " Operador@Example.com ", password: "senha longa segura 2026" }, "https://khaaos.run");
  assert.equal(repository.account?.email, "operador@example.com");
  assert.notEqual(repository.account?.passwordHash, "senha longa segura 2026");
  assert.ok(await verifyPassword("senha longa segura 2026", repository.account!.passwordHash));
  assert.equal(await service.authenticate("operador@example.com", "senha longa segura 2026"), null);

  const token = tokenFromMailLink(verificationUrl, "verify");
  assert.equal(await service.verifyEmail(token), true);
  assert.equal(await service.verifyEmail(token), false, "token de verificação deve ser de uso único");
  assert.equal((await service.authenticate("OPERADOR@example.com", "senha longa segura 2026"))?.userId, repository.account?.userId);
  assert.equal(await service.authenticate("operador@example.com", "senha errada longa 2026"), null);
});

test("local auth recuperação usa link único e substitui somente o hash após email verificado", async () => {
  const repository = new MemoryLocalAuthRepository();
  let verificationUrl = "";
  let resetUrl = "";
  const service = createLocalAuthService(repository, {
    async sendVerificationEmail(_recipient, url) { verificationUrl = url; },
    async sendPasswordResetEmail(_recipient, url) { resetUrl = url; },
  });
  await service.register({ name: "Operador", email: "operador@example.com", password: "senha inicial muito forte" }, "https://khaaos.run");
  await service.verifyEmail(tokenFromMailLink(verificationUrl, "verify"));
  const originalHash = repository.account!.passwordHash;

  await service.requestPasswordReset("OPERADOR@example.com", "https://khaaos.run");
  const token = tokenFromMailLink(resetUrl, "reset");
  assert.equal(await service.resetPassword(token, "nova senha muito segura 2026"), true);
  assert.notEqual(repository.account!.passwordHash, originalHash);
  assert.ok(await verifyPassword("nova senha muito segura 2026", repository.account!.passwordHash));
  assert.equal(await service.resetPassword(token, "outra senha muito segura 2026"), false);
});

test("hash scrypt usa sal aleatório e rejeita senha fora de política", async () => {
  const first = await hashPassword("uma senha muito segura 2026");
  const second = await hashPassword("uma senha muito segura 2026");
  assert.notEqual(first, second);
  assert.ok(await verifyPassword("uma senha muito segura 2026", first));
  assert.equal(await verifyPassword("senha errada muito segura", first), false);
  await assert.rejects(() => hashPassword("curta"));
});
