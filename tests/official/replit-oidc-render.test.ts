import assert from "node:assert/strict";
import { createHash, generateKeyPairSync, sign as rsaSign } from "node:crypto";
import express from "express";
import session from "express-session";
import * as oidc from "openid-client";
import { createServer, type Server } from "node:http";
import { test } from "node:test";

process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/khaaos_test";
process.env.REPL_ID = "khaaos-local-oidc-client";

const host = "khaaos-staging.onrender.com";
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const publicJwk = { ...publicKey.export({ format: "jwk" }), use: "sig", alg: "RS256", kid: "local-test-key" };
const codes = new Map<string, { challenge: string; redirectUri: string }>();
let provider: Server;
let application: Server;
let providerOrigin: string;
let callbackRedirectUri: string | undefined;
let tokenGrantVerified = false;
let persistedClaims: Record<string, unknown> | undefined;

function signIdToken(claims: Record<string, unknown>) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const header = encode({ alg: "RS256", typ: "JWT", kid: "local-test-key" });
  const payload = encode(claims);
  const input = `${header}.${payload}`;
  return `${input}.${rsaSign("RSA-SHA256", Buffer.from(input), privateKey).toString("base64url")}`;
}

async function listen(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  assert(address && typeof address !== "string");
  return address.port;
}

async function close(server?: Server) {
  if (!server?.listening) return;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

async function browserRequest(
  path: string,
  cookie?: string,
  method = "GET",
  extraHeaders: Record<string, string> = {},
) {
  const response = await fetch(`http://127.0.0.1:${(application.address() as any).port}${path}`, {
    method,
    redirect: "manual",
    headers: {
      host,
      "x-forwarded-host": host,
      "x-forwarded-proto": "https",
      ...(cookie ? { cookie } : {}),
      ...extraHeaders,
    },
  });
  return response;
}

test("simulação OIDC local: callback Render, PKCE, sessão Secure e logout", async (t) => {
  const issuerApp = express();
  issuerApp.use(express.urlencoded({ extended: false }));
  issuerApp.get("/oidc/.well-known/openid-configuration", (_req, res) => {
    res.json({
      issuer: providerOrigin,
      authorization_endpoint: `${providerOrigin}/authorize`,
      token_endpoint: `${providerOrigin}/token`,
      jwks_uri: `${providerOrigin}/jwks`,
      end_session_endpoint: `${providerOrigin}/logout`,
      response_types_supported: ["code"],
      subject_types_supported: ["public"],
      id_token_signing_alg_values_supported: ["RS256"],
      token_endpoint_auth_methods_supported: ["none"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
    });
  });
  issuerApp.get("/oidc/jwks", (_req, res) => res.json({ keys: [publicJwk] }));
  issuerApp.get("/oidc/authorize", (req, res) => {
    const redirectUri = String(req.query.redirect_uri ?? "");
    callbackRedirectUri = redirectUri;
    assert.equal(redirectUri, `https://${host}/api/callback`);
    assert.equal(req.query.client_id, process.env.REPL_ID);
    const code = "local-one-time-code";
    codes.set(code, {
      challenge: String(req.query.code_challenge ?? ""),
      redirectUri,
    });
    res.redirect(`${redirectUri}?code=${code}`);
  });
  issuerApp.post("/oidc/token", (req, res) => {
    const record = codes.get(String(req.body.code));
    assert(record, "authorization code must be known");
    assert.equal(req.body.redirect_uri, record.redirectUri);
    const computedChallenge = createHash("sha256").update(String(req.body.code_verifier)).digest("base64url");
    assert.equal(computedChallenge, record.challenge, "PKCE verifier must match the authorization request");
    tokenGrantVerified = true;
    const idToken = signIdToken({
      iss: providerOrigin,
      aud: process.env.REPL_ID,
      sub: "simulated-replit-user",
      email: "local-user@example.test",
      first_name: "Local",
      last_name: "Simulation",
      profile_image_url: "https://example.test/avatar.png",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 300,
    });
    res.json({ access_token: "local-access-token", token_type: "Bearer", expires_in: 300, id_token: idToken });
  });
  issuerApp.get("/oidc/logout", (_req, res) => res.status(200).send("mock issuer logout"));

  provider = createServer(issuerApp);
  const providerPort = await listen(provider);
  providerOrigin = `http://127.0.0.1:${providerPort}/oidc`;
  process.env.ISSUER_URL = providerOrigin;

  const { setupAuth } = await import("../../server/replit_integrations/auth/replitAuth.ts");
  const oidcConfig = await oidc.discovery(
    new URL(providerOrigin),
    process.env.REPL_ID!,
    undefined,
    undefined,
    { execute: [oidc.allowInsecureRequests] },
  );
  const app = express();
  const sessionMiddleware = session({
    secret: "local-test-session-secret-long-enough-for-express-session",
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, secure: true, sameSite: "lax" },
  });
  await setupAuth(app, {
    oidcConfig,
    sessionMiddleware,
    upsertUser: async (claims) => { persistedClaims = claims; },
  });
  application = createServer(app);
  const appPort = await listen(application);
  t.after(async () => {
    await close(application);
    await close(provider);
    delete process.env.ISSUER_URL;
  });

  const login = await browserRequest("/api/login");
  assert.equal(login.status, 302);
  const setCookie = login.headers.get("set-cookie");
  assert(setCookie?.includes("connect.sid="), "session cookie must be issued");
  assert(/; secure/i.test(setCookie), "session cookie must be Secure behind the Render TLS proxy");
  assert(/; httponly/i.test(setCookie), "session cookie must be HttpOnly");
  const cookie = setCookie.split(";")[0];

  const issuerRedirect = new URL(login.headers.get("location")!);
  assert.equal(issuerRedirect.origin, providerOrigin.replace(/\/oidc$/, ""));
  const authorization = await fetch(issuerRedirect, { redirect: "manual" });
  assert.equal(authorization.status, 302);
  const callback = new URL(authorization.headers.get("location")!);
  assert.equal(callback.origin, `https://${host}`);
  assert.equal(callback.pathname, "/api/callback");

  const callbackResponse = await browserRequest(`${callback.pathname}${callback.search}`, cookie);
  assert.equal(callbackResponse.status, 302);
  assert.equal(callbackResponse.headers.get("location"), "/");
  assert.equal(callbackRedirectUri, `https://${host}/api/callback`);
  assert.equal(tokenGrantVerified, true);
  assert.equal(persistedClaims?.sub, "simulated-replit-user");
  assert.equal(persistedClaims?.email, "local-user@example.test");

  const legacyLogout = await browserRequest("/api/logout", cookie);
  assert.equal(legacyLogout.status, 404, "logout must not mutate the session through GET");

  const crossSiteLogout = await browserRequest("/api/logout", cookie, "POST", {
    origin: "https://attacker.example",
    "sec-fetch-site": "cross-site",
  });
  assert.equal(crossSiteLogout.status, 403, "cross-site logout must be rejected");

  const logout = await browserRequest("/api/logout", cookie, "POST", {
    origin: `https://${host}`,
    "sec-fetch-site": "same-origin",
  });
  assert.equal(logout.status, 302);
  const logoutRedirect = new URL(logout.headers.get("location")!);
  assert.equal(logoutRedirect.origin, providerOrigin.replace(/\/oidc$/, ""));
  assert.equal(logoutRedirect.searchParams.get("post_logout_redirect_uri"), `https://${host}`);
  assert.equal(appPort > 0, true);
});
