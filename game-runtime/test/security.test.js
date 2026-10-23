// Testes de segurança: rotação de chaves, revogação, TLS e SSO/OIDC operacional.
// Sem dependências externas: o IdP OIDC é um http.createServer local real
// (discovery + jwks + token endpoint) com chave RSA gerada no próprio teste.
// O teste de TLS usa openssl quando disponível (skip automático caso contrário).
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { WebSocket } from 'ws';
import { createAuthoritativeServer } from '../server/server.js';
import { AuthService, hashPassword, signToken } from '../server/auth.js';
import { DurableJsonStore } from '../server/store.js';
import { SharedMemoryRateStore } from '../server/rateLimit.js';
import { verifyIdToken } from '../server/oidc.js';

const b64url = (value) => Buffer.from(value).toString('base64url');
const kidOf = (token) => JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString('utf8')).kid;
const listen = (server) => new Promise((resolve) => server.listen(0, () => resolve(server.address().port)));

const usersOf = (...names) => names.map((n) => ({ id: n, username: n, role: n.startsWith('admin') ? 'admin' : 'player', region: 'sa-east', passwordHash: hashPassword(`${n}-pw`, 'salt') }));
const withApp = async ({ users, ...options }) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kr-sec-'));
  const app = createAuthoritativeServer({
    port: 0,
    auth: new AuthService({ secret: options.secret || 'sec-secret', users }),
    store: new DurableJsonStore(path.join(dir, 'state.json')),
    rateStore: new SharedMemoryRateStore(),
    adminToken: 'legacy',
    ...options,
  });
  const port = await listen(app.server);
  return { app, port, dir };
};
const cleanupApp = async (app, dir) => {
  await app.close();
  fs.rmSync(dir, { recursive: true, force: true });
};

// ---------- rotação de chaves ----------

test('rotação: token antigo valida em grace, novo token usa nova kid e drop invalida o antigo', () => {
  const auth = new AuthService({ secret: 'key-one', users: usersOf('player') });
  const first = auth.login('player', 'player-pw');
  assert.equal(kidOf(first.token), auth.activeKey.kid);

  const rotation = auth.rotateSecret('key-two');
  assert.equal(rotation.rotated, true);
  assert.equal(auth.keys.filter((k) => k.state === 'active').length, 1);

  assert.ok(auth.verify(first.token), 'token antigo deve validar durante o grace (chave retired)');

  const second = auth.login('player', 'player-pw');
  assert.notEqual(kidOf(second.token), kidOf(first.token), 'novo login deve assinar com a nova kid');
  assert.ok(auth.verify(second.token));

  assert.equal(auth.dropKey(kidOf(first.token)), true);
  assert.equal(auth.verify(first.token), null, 'token da chave removida deve invalidar');
  assert.ok(auth.verify(second.token), 'token da chave ativa segue válido');

  assert.throws(() => auth.dropKey(kidOf(second.token)), /ativa/, 'chave ativa não pode ser removida');
  const same = auth.rotateSecret('key-two');
  assert.equal(same.rotated, false, 'rotação com o mesmo secret é idempotente');
  assert.ok(!JSON.stringify(auth.keyInfo()).includes('key-two'), 'keyInfo nunca expõe secrets');
});

test('verifyToken: kid desconhecido no header é rejeitado sem fallback (anti cross-key)', () => {
  const auth = new AuthService({ secret: 'meu-secret' });
  const forged = signToken({ sub: 'x' }, 'secret-alheio', 60, 'kid-alheio');
  assert.equal(auth.verify(forged), null);
  // token legado (sem kid) continua válido com secret único
  const legacy = signToken({ sub: 'legacy' }, 'meu-secret', 60);
  assert.ok(auth.verify(legacy));
});

// ---------- revogação ----------

test('revogação: logout invalida o jti, outros tokens seguem válidos e purge remove vencidos', () => {
  const auth = new AuthService({ secret: 'rev', users: usersOf('a', 'b') });
  const tokenA = auth.login('a', 'a-pw').token;
  const tokenB = auth.login('b', 'b-pw').token;

  assert.equal(auth.revoke(tokenA), true);
  assert.equal(auth.verify(tokenA), null, 'token revogado deve ser rejeitado');
  assert.ok(auth.verify(tokenB), 'token não revogado deve seguir válido');
  assert.equal(auth.revoke('token-lixo'), false);
  assert.equal(auth.revoke(tokenA), false, 'revogar token já rejeitado não re-registra');

  const payload = JSON.parse(Buffer.from(tokenB.split('.')[1], 'base64url').toString('utf8'));
  auth.revoked.set(payload.jti, { expiresAt: Math.floor(Date.now() / 1000) - 10 });
  assert.ok(auth.verify(tokenB), 'entrada de revogação vencida deve ser purgada no próximo verify');
});

test('revogação via HTTP: /auth/logout revoga e o WebSocket passa a recusar o token', async () => {
  const { app, port, dir } = await withApp({ users: usersOf('player') });
  try {
    const login = await fetch(`http://127.0.0.1:${port}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'player', password: 'player-pw' }) });
    const { token } = await login.json();

    const noAuth = await fetch(`http://127.0.0.1:${port}/auth/logout`, { method: 'POST' });
    assert.equal(noAuth.status, 401);

    const logout = await fetch(`http://127.0.0.1:${port}/auth/logout`, { method: 'POST', headers: { authorization: `Bearer ${token}` } });
    assert.equal(logout.status, 200);
    assert.deepEqual(await logout.json(), { revoked: true, logout: true });

    await new Promise((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${token}`);
      ws.on('close', (code) => { assert.equal(code, 4001); resolve(); });
      ws.on('error', reject);
    });
    assert.equal(app.metrics.logouts, 1);
  } finally {
    await cleanupApp(app, dir);
  }
});

// ---------- administração de chaves ----------

test('admin de chaves: player não autorizado; legacy token rotaciona; lista nunca vaza secrets', async () => {
  const { app, port, dir } = await withApp({ users: usersOf('player') });
  try {
    const playerToken = app.auth.login('player', 'player-pw').token;
    const deniedList = await fetch(`http://127.0.0.1:${port}/admin/keys`, { headers: { authorization: `Bearer ${playerToken}` } });
    assert.equal(deniedList.status, 403); // RBAC: autenticado, porém sem permissão
    const deniedRotate = await fetch(`http://127.0.0.1:${port}/admin/keys/rotate`, { method: 'POST', headers: { authorization: `Bearer ${playerToken}` }, body: '{}' });
    assert.equal(deniedRotate.status, 403); // RBAC: autenticado, porém sem permissão

    const rotate = await fetch(`http://127.0.0.1:${port}/admin/keys/rotate?token=legacy`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ secret: 'novo-secret-ops' }) });
    assert.equal(rotate.status, 200);
    const rotation = await rotate.json();
    assert.equal(rotation.rotated, true);
    assert.equal(app.metrics.keyRotations, 1);

    const list = await fetch(`http://127.0.0.1:${port}/admin/keys?token=legacy`);
    const { keys } = await list.json();
    assert.ok(keys.some((k) => k.state === 'active') && keys.some((k) => k.state === 'retired'));
    assert.ok(!JSON.stringify(keys).includes('novo-secret-ops'));

    const drop = await fetch(`http://127.0.0.1:${port}/admin/keys/drop?token=legacy`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kid: rotation.keys.find((k) => k.state === 'retired').kid }) });
    assert.equal(drop.status, 200);
    const conflict = await fetch(`http://127.0.0.1:${port}/admin/keys/drop?token=legacy`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kid: rotation.kid }) });
    assert.equal(conflict.status, 409);
  } finally {
    await cleanupApp(app, dir);
  }
});

// ---------- TLS ----------

test('TLS: servidor atende HTTPS com certificado configurado e healthz expõe tls=true', { skip: spawnSync('openssl', ['version'], { encoding: 'utf8' }).status !== 0 ? 'openssl indisponível' : false }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kr-tls-'));
  const keyPath = path.join(dir, 'key.pem');
  const certPath = path.join(dir, 'cert.pem');
  const generated = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyPath, '-out', certPath, '-days', '1', '-subj', '/CN=localhost'], { encoding: 'utf8' });
  assert.equal(generated.status, 0, 'openssl deve gerar o par de chaves de teste');

  const { app, port, dir: appDir } = await withApp({ users: usersOf('player'), tls: { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) } });
  try {
    const status = await new Promise((resolve, reject) => {
      const req = https.get({ host: '127.0.0.1', port, path: '/healthz', agent: new https.Agent({ rejectUnauthorized: false }) }, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => resolve({ code: res.statusCode, body }));
      });
      req.on('error', reject);
      req.setTimeout(5000, () => { req.destroy(new Error('timeout no healthz TLS')); });
    });
    assert.equal(status.code, 200);
    const health = JSON.parse(status.body);
    assert.equal(health.tls, true);
    assert.equal(health.oidc, false);
  } finally {
    await cleanupApp(app, appDir);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------- OIDC: verificação de id_token (unidade) ----------

const mintIdToken = ({ privateKey, kid, headerExtra = {}, claims }) => {
  const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid, ...headerExtra }));
  const body = b64url(JSON.stringify(claims));
  const signature = b64url(crypto.sign('RSA-SHA256', Buffer.from(`${head}.${body}`), privateKey));
  return `${head}.${body}.${signature}`;
};

test('verifyIdToken: rejeita assinatura alheia, iss/aud/exp/nonce divergentes e algs não-RS256', async () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'real-key', use: 'sig', alg: 'RS256' };
  const now = Math.floor(Date.now() / 1000);
  const base = { iss: 'https://idp.example', aud: 'kr-client', sub: 'u1', nonce: 'n-123', iat: now, exp: now + 600 };

  const good = mintIdToken({ privateKey, kid: 'real-key', claims: base });
  assert.equal(verifyIdToken(good, { jwks: [jwk], issuer: 'https://idp.example', audience: 'kr-client', nonce: 'n-123' }).ok, true);

  const attacker = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
  const forged = mintIdToken({ privateKey: attacker, kid: 'real-key', claims: base });
  assert.equal(verifyIdToken(forged, { jwks: [jwk], issuer: 'https://idp.example', audience: 'kr-client' }).reason, 'bad_signature');

  assert.equal(verifyIdToken(good, { jwks: [jwk], issuer: 'https://outro.example', audience: 'kr-client' }).reason, 'issuer_mismatch');
  assert.equal(verifyIdToken(good, { jwks: [jwk], issuer: 'https://idp.example', audience: 'outro-client' }).reason, 'audience_mismatch');
  assert.equal(verifyIdToken(good, { jwks: [jwk], issuer: 'https://idp.example', audience: 'kr-client', nonce: 'outro' }).reason, 'nonce_mismatch');
  assert.equal(verifyIdToken(mintIdToken({ privateKey, kid: 'real-key', claims: { ...base, exp: now - 3600 } }), { jwks: [jwk], issuer: 'https://idp.example', audience: 'kr-client' }).reason, 'token_expired');
  assert.equal(verifyIdToken(mintIdToken({ privateKey, kid: 'chave-fora', claims: base }), { jwks: [jwk], issuer: 'https://idp.example', audience: 'kr-client' }).reason, 'unknown_kid');
  const hs256 = `${b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${b64url(JSON.stringify(base))}.c2ln`;
  assert.equal(verifyIdToken(hs256, { jwks: [jwk], issuer: 'https://idp.example', audience: 'kr-client' }).reason, 'unsupported_alg');
  assert.equal(verifyIdToken('lixo', { jwks: [jwk], issuer: 'x', audience: 'y' }).reason, 'malformed');
});

// ---------- OIDC: fluxo completo com IdP local real ----------

test('SSO/OIDC: fluxo authorization code completo (discovery+JWKS+exchange), state single-use e cookie', async () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'idp-key-1', use: 'sig', alg: 'RS256' };
  const AUTH_CODE = 'authcode-xyz-123';
  let capturedNonce = null;
  let tokenRequests = 0;

  const idp = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://idp.local');
    if (url.pathname === '/.well-known/openid-configuration') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        issuer: ISSUER,
        authorization_endpoint: `${ISSUER}/authorize`,
        token_endpoint: `${ISSUER}/token`,
        jwks_uri: `${ISSUER}/jwks`,
      }));
      return;
    }
    if (url.pathname === '/jwks') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ keys: [jwk] }));
      return;
    }
    if (url.pathname === '/token') {
      tokenRequests++;
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const form = new URLSearchParams(raw);
      assert.equal(form.get('grant_type'), 'authorization_code');
      assert.equal(form.get('code'), AUTH_CODE);
      assert.equal(form.get('client_id'), 'kr-client');
      assert.equal(form.get('client_secret'), 'kr-secret');
      const now = Math.floor(Date.now() / 1000);
      const idToken = mintIdToken({
        privateKey,
        kid: 'idp-key-1',
        claims: { iss: ISSUER, aud: 'kr-client', sub: 'ext-user-42', preferred_username: 'extplayer', nonce: capturedNonce, iat: now, exp: now + 600 },
      });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ access_token: 'at-1', token_type: 'Bearer', id_token: idToken }));
      return;
    }
    res.writeHead(404); res.end();
  });
  const idpPort = await listen(idp);
  const ISSUER = `http://127.0.0.1:${idpPort}`;

  const { app, port, dir } = await withApp({
    users: usersOf('player'),
    oidc: { issuer: ISSUER, clientId: 'kr-client', clientSecret: 'kr-secret', redirectUri: 'http://127.0.0.1:0/auth/oidc/callback' },
  });
  try {
    // não configurado → 503
    const { app: plainApp, port: plainPort, dir: plainDir } = await withApp({ users: usersOf('player') });
    const notConfigured = await fetch(`http://127.0.0.1:${plainPort}/auth/oidc/start`, { redirect: 'manual' });
    assert.equal(notConfigured.status, 503);
    await cleanupApp(plainApp, plainDir);

    // 1. start → 302 com cookie de state e nonce na URL de autorização
    const start = await fetch(`http://127.0.0.1:${port}/auth/oidc/start`, { redirect: 'manual' });
    assert.equal(start.status, 302);
    const setCookie = start.headers.getSetCookie().find((c) => c.startsWith('kr_oidc_state='));
    assert.ok(setCookie, 'cookie de state obrigatório');
    const cookieState = decodeURIComponent(setCookie.split(';')[0].split('=')[1]);
    const location = new URL(start.headers.get('location'));
    assert.equal(`${location.origin}${location.pathname}`, `${ISSUER}/authorize`);
    assert.equal(location.searchParams.get('state'), cookieState);
    assert.equal(location.searchParams.get('client_id'), 'kr-client');
    capturedNonce = location.searchParams.get('nonce');
    assert.ok(capturedNonce);

    // state divergente do cookie → 400
    const tampered = await fetch(`http://127.0.0.1:${port}/auth/oidc/callback?code=${AUTH_CODE}&state=outra-state`, { headers: { cookie: `kr_oidc_state=${cookieState}` } });
    assert.equal(tampered.status, 400);

    // 2. callback feliz → sessão KR emitida e usuário provisionado
    const callback = await fetch(`http://127.0.0.1:${port}/auth/oidc/callback?code=${AUTH_CODE}&state=${encodeURIComponent(cookieState)}`, { headers: { cookie: `kr_oidc_state=${cookieState}` } });
    assert.equal(callback.status, 200);
    const session = await callback.json();
    assert.equal(session.provider, 'oidc');
    assert.equal(session.user.username, 'extplayer');
    assert.equal(session.user.role, 'player');
    const verified = app.auth.verify(session.token);
    assert.equal(verified.sub, 'oidc-ext-user-42');
    assert.equal(app.metrics.oidcLogins, 1);
    assert.equal(tokenRequests, 1);

    // 3. state é single-use → replay rejeita
    const replay = await fetch(`http://127.0.0.1:${port}/auth/oidc/callback?code=${AUTH_CODE}&state=${encodeURIComponent(cookieState)}`, { headers: { cookie: `kr_oidc_state=${cookieState}` } });
    assert.equal(replay.status, 400);

    // 4. healthz reflete oidc on
    const health = await fetch(`http://127.0.0.1:${port}/healthz`).then((r) => r.json());
    assert.equal(health.oidc, true);
    assert.equal(health.tls, false);
  } finally {
    await cleanupApp(app, dir);
    idp.closeAllConnections?.();
    await new Promise((resolve) => idp.close(resolve));
  }
});
