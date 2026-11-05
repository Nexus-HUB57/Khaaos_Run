import assert from "node:assert/strict";
import { test } from "node:test";
import express from "express";
import session from "express-session";
import passport from "passport";
import request from "supertest";
import { registerLocalAuthRoutes, type LocalAuthRouteOptions } from "../../server/replit_integrations/auth/localAuthRoutes.ts";
import { AuthEmailUnavailableError } from "../../server/replit_integrations/auth/localAuthService.ts";

function buildApp(overrides: Partial<LocalAuthRouteOptions["service"]> = {}) {
  const app = express();
  app.use(express.json());
  app.use(session({ secret: "local-auth-test-session-secret-32bytes", resave: false, saveUninitialized: false }));
  passport.serializeUser((user: any, done) => done(null, user));
  passport.deserializeUser((user: any, done) => done(null, user));
  app.use(passport.initialize());
  app.use(passport.session());
  app.get("/test/session", (req, res) => res.json(req.user ?? null));
  const calls: string[] = [];
  const service = {
    async register() { calls.push("register"); },
    async authenticate(email: string, password: string) {
      calls.push(`authenticate:${email}:${password}`);
      return email.toLowerCase() === "player@example.com" && password === "senha certa muito forte 2026"
        ? { userId: "player-id", email: "player@example.com", firstName: "Player", lastName: null, passwordHash: "unused", emailVerifiedAt: new Date() }
        : null;
    },
    async verifyEmail() { return true; },
    async resendVerification() {},
    async requestPasswordReset() {},
    async resetPassword() { return true; },
    ...overrides,
  } as unknown as LocalAuthRouteOptions["service"];

  registerLocalAuthRoutes(app, {
    service,
    resolveOrigin: () => "https://khaaos.run",
    rateLimit: async () => ({ allowed: true, retryAfterMs: 0 }),
  });
  return { app, calls };
}

const origin = "https://khaaos.run";

test("local auth: cadastro exige confirmação de senha e origem confiável", async () => {
  const { app, calls } = buildApp();
  const noOrigin = await request(app).post("/api/auth/register").send({
    name: "Player", email: "player@example.com", password: "senha certa muito forte 2026", confirmPassword: "senha certa muito forte 2026",
  });
  assert.equal(noOrigin.status, 403);

  const mismatch = await request(app).post("/api/auth/register").set("Origin", origin).send({
    name: "Player", email: "player@example.com", password: "senha certa muito forte 2026", confirmPassword: "senha diferente muito forte 2026",
  });
  assert.equal(mismatch.status, 400);
  assert.equal(calls.length, 0);
});

test("local auth: cadastro fica fechado sem SMTP configurado", async () => {
  const { app, calls } = buildApp({
    async register() { calls.push("register"); throw new AuthEmailUnavailableError(); },
  });
  const response = await request(app).post("/api/auth/register").set("Origin", origin).send({
    name: "Player", email: "player@example.com", password: "senha certa muito forte 2026", confirmPassword: "senha certa muito forte 2026",
  });
  assert.equal(response.status, 503);
  assert.deepEqual(calls, ["register"]);
});

test("local auth: registro válido retorna resposta neutra e não expõe conta existente", async () => {
  const { app, calls } = buildApp();
  const response = await request(app).post("/api/auth/register").set("Origin", origin).send({
    name: "Player", email: "player@example.com", password: "senha certa muito forte 2026", confirmPassword: "senha certa muito forte 2026",
  });
  assert.equal(response.status, 202);
  assert.match(response.body.message, /enviaremos/i);
  assert.deepEqual(calls, ["register"]);
});

test("local auth: login cria sessão com subject canônico e devolve somente perfil público", async () => {
  const { app } = buildApp();
  const response = await request(app).post("/api/auth/login").set("Origin", origin).send({
    email: "PLAYER@example.com", password: "senha certa muito forte 2026",
  });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body.user, { id: "player-id", email: "player@example.com", firstName: "Player", lastName: null });
  assert.equal(response.headers["cache-control"], "no-store");
  const cookie = response.headers["set-cookie"]?.[0]?.split(";")[0];
  assert.ok(cookie, "Passport precisa gravar uma sessão autenticada");
  const session = await request(app).get("/test/session").set("Cookie", cookie);
  assert.equal((session.body as any).localAuth, true);
  assert.equal((session.body as any).claims.sub, "player-id");
});

test("local auth: falha de login não distingue credencial errada de conta não elegível", async () => {
  const { app } = buildApp();
  const response = await request(app).post("/api/auth/login").set("Origin", origin).send({
    email: "missing@example.com", password: "senha certa muito forte 2026",
  });
  assert.equal(response.status, 401);
  assert.deepEqual(response.body, { message: "Email, senha ou confirmação inválidos." });
});
