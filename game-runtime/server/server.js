import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { MatchRoom } from './room.js';
import { MatchRoom3D } from './room3d.js';
import { validateInput, validateInput3D, ViolationTracker } from './antiCheat.js';
import { AuthService, hasRole, hashPassword } from './auth.js';
import { OidcClient } from './oidc.js';
import { createSessionStore, PostgresAuditStore } from './store.js';
import { AuditLog } from './audit.js';
import { can } from './rbac.js';
import { Economy, Ledger, PostgresEconomyStore, complianceReport, EconomyError } from './economy.js';
import { DistributedRateLimiter, RedisRateStore, SharedMemoryRateStore } from './rateLimit.js';
import { chooseRegion, chooseRoom, normalizeRegion, normalizeMode } from './matchmaking.js';
import { createDependencyHealth, summarize } from './health.js';
import { regionLoads, recommend, SCALE_DEFAULTS } from './autoscale.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const MAX_WS_PAYLOAD = 16 * 1024;
const MAX_BUFFERED_BYTES = 256 * 1024;

const jsonBody = (req) => new Promise((resolve, reject) => {
  let raw = '';
  req.on('data', (chunk) => {
    raw += chunk;
    if (raw.length > 1e6) reject(new Error('payload too large'));
  });
  req.on('end', () => {
    try { resolve(JSON.parse(raw || '{}')); } catch { reject(new Error('invalid json')); }
  });
});
const bearer = (req) => String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
const cookieValue = (req, name) => {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return decodeURIComponent(rest.join('='));
  }
  return null;
};

export function createAuthoritativeServer({
  port = Number(process.env.PORT || 8787),
  adminToken = process.env.ADMIN_TOKEN || 'change-me',
  roomCapacity = 16,
  auth,
  economy,
  store,
  rateStore,
  tls,
  oidc,
  auditStore,
  health,
  readyGate,
} = {}) {
  // TLS operacional: { cert, key } direto ou KR_TLS_CERT/KR_TLS_KEY (caminhos PEM).
  const tlsConfig = tls || (process.env.KR_TLS_CERT && process.env.KR_TLS_KEY
    ? { cert: fs.readFileSync(process.env.KR_TLS_CERT), key: fs.readFileSync(process.env.KR_TLS_KEY) }
    : null);
  // SSO/OIDC operacional: config direta ou env KR_OIDC_ISSUER/CLIENT_ID/CLIENT_SECRET/REDIRECT_URI.
  const oidcConfig = oidc || (process.env.KR_OIDC_ISSUER && process.env.KR_OIDC_CLIENT_ID && process.env.KR_OIDC_CLIENT_SECRET
    ? {
        issuer: process.env.KR_OIDC_ISSUER,
        clientId: process.env.KR_OIDC_CLIENT_ID,
        clientSecret: process.env.KR_OIDC_CLIENT_SECRET,
        redirectUri: process.env.KR_OIDC_REDIRECT_URI,
      }
    : null);
  const oidcClient = oidcConfig ? new OidcClient(oidcConfig) : null;
  const oidcSubjectsAdmin = new Set(String(process.env.KR_OIDC_ADMIN_SUBJECTS || '').split(',').filter(Boolean));
  const users = process.env.KR_USERS_JSON ? JSON.parse(process.env.KR_USERS_JSON) : [];
  // KR_DEV_AUTH=1 provisiona usuários de desenvolvimento (NUNCA usar em produção).
  if (process.env.KR_DEV_AUTH === '1' && users.length === 0) {
    users.push(
      { id: 'dev-player', username: 'kr_player', passwordHash: hashPassword('kr123'), role: 'player', region: 'sa-east' },
      { id: 'dev-admin', username: 'kr_admin', passwordHash: hashPassword('kr123'), role: 'admin', region: 'sa-east' },
    );
  }
  const identity = auth || new AuthService({ secret: process.env.AUTH_SECRET || 'dev-only-change-me', users });
  const durable = store || createSessionStore();
  const selectedRateStore = rateStore || (process.env.KR_RATE_STORE === 'redis' ? new RedisRateStore() : new SharedMemoryRateStore());
  // orçamento de mensagens/s por identidade, separado por modo:
  // 2D (legado, 20Hz de inputs) mantém 30/s; 3D (30Hz de inputs + ping) usa 90/s.
  const limiter = new DistributedRateLimiter({ store: selectedRateStore, limit: 30, windowMs: 1000, prefix: 'ws-input' });
  const limiter3d = new DistributedRateLimiter({ store: selectedRateStore, limit: Number(process.env.KR_INPUT_LIMIT || 90), windowMs: 1000, prefix: 'ws-input-3d' });
  // Trilha de auditoria: ring buffer em memória + store persistente opcional
  // (KR_AUDIT_STORE=postgres usa PostgresAuditStore, migração 002_audit_events.sql).
  const selectedAuditStore = auditStore
    || (process.env.KR_AUDIT_STORE === 'postgres' ? new PostgresAuditStore() : null);
  const audit = new AuditLog({ store: selectedAuditStore });
  // Economia virtual (KRC): ledger de dupla entrada append-only, sem qualquer
  // trilha de valor real (REAL_MONEY_ENABLED=false congelado). Injeção direta
  // ou KR_ECONOMY_STORE=postgres (migração 003_economy_ledger.sql).
  const economyService = economy || new Economy({ store: process.env.KR_ECONOMY_STORE === 'postgres' ? new PostgresEconomyStore() : undefined });
  // Saúde real das dependências: sondas com latência medida (SELECT 1 / PING)
  // e cache curto para o readiness não martelar o banco a cada requisição.
  const healthMonitor = health || createDependencyHealth({ sessionStore: durable, rateStore: selectedRateStore, auditStore: selectedAuditStore });
  // Gate de saturação do readiness: ao passar do limite de conexões vivas, a
  // instância responde 503/overload para sair da rotação do balanceador.
  const readyGateConfig = readyGate || (process.env.KR_READY_MAX_CONNECTIONS ? { maxConnections: Number(process.env.KR_READY_MAX_CONNECTIONS) } : null);
  const rooms = new Map();
  const clients = new Map();
  const queue = [];
  let nextClient = 1;
  let nextRoom = 1;
  const metrics = {
    startedAt: Date.now(), connections: 0, rejections: 0, violations: 0, bans: 0,
    messages: 0, ticks: 0, rateLimited: 0, reconnects: 0, authFailures: 0,
    backpressure: 0, oversized: 0, logouts: 0, keyRotations: 0, oidcLogins: 0, rbacDenies: 0,
    storeReadFailures: 0, rateStoreFailures: 0,
  };

  const send = (ws, message) => {
    if (ws?.readyState !== 1) return false;
    if (ws.bufferedAmount > MAX_BUFFERED_BYTES) {
      metrics.backpressure++;
      ws.close(4008, 'backpressure');
      return false;
    }
    ws.send(JSON.stringify(message));
    return true;
  };
  const getRoom = (client) => client.roomId ? rooms.get(client.roomId) : null;
  // Identidade da requisição HTTP: token KR (qualquer papel) ou token legacy de operações (admin).
  const identityFor = (req) => {
    const token = bearer(req) || req.headers['x-admin-token'] || new URL(req.url, 'http://localhost').searchParams.get('token');
    const user = identity.verify(token);
    if (user) return user;
    if (token === adminToken) return { sub: 'legacy', username: 'legacy-token', role: 'admin' };
    return null;
  };
  // Guarda RBAC de endpoint: 403 + evento de auditoria quando a permissão não cobre.
  // Decisões allow SÓ são auditadas em operações sensíveis (rotate/drop/login/logout/oidc/start);
  // leituras repetitivas (painel) não geram ruído.
  const guardHttp = (req, res, permission, resource = null) => {
    const actor = identityFor(req);
    if (can(actor, permission, resource)) return actor;
    metrics.rbacDenies++;
    audit.record({ actor: actor?.username || 'anonymous', action: 'rbac.deny', resource, outcome: 'deny', detail: { permission, via: 'http' } });
    res.writeHead(403, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'forbidden', permission }));
    return null;
  };

  // Carga por região (salas, assentos, utilização) + recomendação de autoscaling.
  const regionalLoad = () => regionLoads(rooms, { queue: queue.length }).map((load) => ({
    ...load,
    utilization: Number(load.utilization.toFixed(4)),
    recommendation: recommend(load),
  }));

  // Fail-open nos limitadores: indisponibilidade do rate store (Redis fora) não
  // pode derrubar a partida — o input flui sem limite e a degradação fica
  // sinalizada em metrics.rateStoreFailures para alarme externo.
  const allowOrOpen = async (limiter, key) => {
    try {
      return await limiter.allowAsync(key);
    } catch {
      metrics.rateStoreFailures++;
      return { allowed: true, count: 0, remaining: 0, resetAt: Date.now() + 1000 };
    }
  };

  function assign(client) {
    let room = chooseRoom(rooms, client.region, roomCapacity, client.mode);
    if (!room) {
      room = client.mode === '3d'
        ? new MatchRoom3D({ id: `ring3d-${nextRoom++}`, seed: `${process.env.MATCH_SEED || 'CIGKV'}-3D-${nextRoom}`, region: client.region, capacity: roomCapacity, botFill: roomCapacity - 1 })
        : new MatchRoom({ id: `ring-${nextRoom++}`, seed: `${process.env.MATCH_SEED || 'CIGKV'}-${nextRoom}`, region: client.region, capacity: roomCapacity });
      rooms.set(room.id, room);
    }
    room.addPlayer(client.id, client.identity.username);
    client.roomId = room.id;
    const position = queue.indexOf(client);
    if (position >= 0) queue.splice(position, 1);
    send(client.ws, {
      type: 'match_found', id: client.id, roomId: room.id, region: room.region,
      position: room.players.size, capacity: room.capacity, resumeToken: client.resumeToken,
      snapshot: room.snapshot(client.id),
    });
  }

  // Estados de autorização OIDC (state single-use → { nonce, expiresAt }).
  const oidcStates = new Map();
  const OIDC_STATE_TTL_MS = 10 * 60 * 1000;

  async function httpHandler(req, res) {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (req.method === 'GET' && url.pathname === '/healthz') {
        const roomList = [...rooms.values()];
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
        res.end(JSON.stringify({ status: 'ok', uptimeMs: Date.now() - metrics.startedAt, ticks: metrics.ticks, rooms: rooms.size, rooms3d: roomList.filter((r) => r.is3d).length, connections: clients.size, queue: queue.length, backpressure: metrics.backpressure, regions: regionalLoad(), tls: Boolean(tlsConfig), oidc: Boolean(oidcClient) }));
        return;
      }
      if (req.method === 'GET' && url.pathname === '/readyz') {
        const results = await healthMonitor.probeAll({ force: true });
        const summary = summarize(results);
        const saturated = readyGateConfig ? clients.size > readyGateConfig.maxConnections : false;
        const status = !summary.ok ? 'not_ready' : saturated ? 'overload' : 'ready';
        res.writeHead(status === 'ready' ? 200 : 503, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
        res.end(JSON.stringify({ status, checks: summary.checks, latencyMs: summary.latencyMs, errors: summary.errors, load: { connections: clients.size, queue: queue.length, maxConnections: readyGateConfig?.maxConnections ?? null } }));
        return;
      }
      if (req.method === 'POST' && url.pathname === '/auth/login') {
        const ip = req.socket.remoteAddress || 'unknown';
        const allowed = await allowOrOpen(limiter, `login:${ip}`);
        if (!allowed.allowed) { res.writeHead(429); res.end(JSON.stringify({ error: 'rate_limited' })); return; }
        const body = await jsonBody(req);
        const logged = identity.login(body.username, body.password);
        if (!logged) {
          metrics.authFailures++;
          audit.record({ actor: body.username || 'unknown', action: 'auth.login', outcome: 'deny', detail: { via: 'password' } });
          res.writeHead(401, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'invalid_credentials' })); return;
        }
        audit.record({ actor: logged.user.username, action: 'auth.login', outcome: 'allow', detail: { via: 'password', role: logged.user.role } });
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(logged));
        return;
      }
      if (req.method === 'POST' && url.pathname === '/auth/logout') {
        const token = bearer(req);
        if (!token) { res.writeHead(401, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'unauthorized' })); return; }
        const actor = identity.verify(token);
        const revoked = identity.revoke(token);
        if (revoked) metrics.logouts++;
        audit.record({ actor: actor?.username || 'unknown', action: 'auth.logout', outcome: revoked ? 'allow' : 'deny' });
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        res.end(JSON.stringify({ revoked, logout: true }));
        return;
      }
      if (req.method === 'GET' && url.pathname === '/auth/oidc/start') {
        if (!oidcClient) { res.writeHead(503, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'oidc_not_configured' })); return; }
        try {
          await oidcClient.ready();
        } catch {
          res.writeHead(503, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'oidc_unavailable' })); return;
        }
        const now = Date.now();
        for (const [st, entry] of oidcStates) if (entry.expiresAt <= now) oidcStates.delete(st);
        const state = crypto.randomBytes(24).toString('base64url');
        const nonce = crypto.randomBytes(16).toString('base64url');
        oidcStates.set(state, { nonce, expiresAt: now + OIDC_STATE_TTL_MS });
        res.writeHead(302, {
          location: oidcClient.authorizationUrl({ state, nonce }),
          'set-cookie': `kr_oidc_state=${encodeURIComponent(state)}; HttpOnly; SameSite=Lax; Path=/auth/oidc; Max-Age=600`,
          'cache-control': 'no-store',
        });
        res.end();
        return;
      }
      if (req.method === 'GET' && url.pathname === '/auth/oidc/callback') {
        if (!oidcClient) { res.writeHead(503, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'oidc_not_configured' })); return; }
        const queryState = url.searchParams.get('state');
        const cookieState = cookieValue(req, 'kr_oidc_state');
        const entry = queryState ? oidcStates.get(queryState) : null;
        if (!queryState || !cookieState || queryState !== cookieState || !entry || entry.expiresAt <= Date.now()) {
          res.writeHead(400, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: 'invalid_state' }));
          return;
        }
        oidcStates.delete(queryState); // single-use
        const code = url.searchParams.get('code');
        if (!code) { res.writeHead(400, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'missing_code' })); return; }
        try {
          const tokens = await oidcClient.exchangeCode(code);
          const result = await oidcClient.verifyIdToken(tokens.id_token, { nonce: entry.nonce });
          if (!result.ok) { metrics.authFailures++; res.writeHead(401, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'invalid_id_token', reason: result.reason })); return; }
          const claims = result.claims;
          const username = claims.preferred_username || claims.email || `oidc:${claims.sub}`;
          const role = oidcSubjectsAdmin.has(claims.sub) ? 'admin' : 'player';
          const user = identity.upsertExternalUser({ id: `oidc-${claims.sub}`, username, role, region: claims.region });
          const session = identity.issueForUser(user);
          metrics.oidcLogins++;
          audit.record({ actor: user.username, action: 'auth.oidc', outcome: 'allow', detail: { subject: claims.sub, provider: 'oidc', role: user.role } });
          const headers = { 'content-type': 'application/json', 'cache-control': 'no-store' };
          if (process.env.KR_OIDC_SET_COOKIE === '1') {
            headers['set-cookie'] = `kr_token=${encodeURIComponent(session.token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=3600`;
          }
          res.writeHead(200, headers);
          res.end(JSON.stringify({ ...session, provider: 'oidc' }));
        } catch (error) {
          metrics.authFailures++;
          res.writeHead(502, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: 'oidc_exchange_failed', detail: error?.message }));
        }
        return;
      }
      // ─── Economia virtual (KRC) ────────────────────────────────────────────
      // Saldo/histórico são SEMPRE derivados da identidade do token — nunca de
      // parâmetro — garantindo que um jogador só leia o próprio ledger.
      if (url.pathname === '/economy/balance' && req.method === 'GET') {
        const actor = identityFor(req);
        if (!actor) { res.writeHead(401, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'unauthorized' })); return; }
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        res.end(JSON.stringify({ ...(await economyService.balance(actor.sub)), userId: actor.sub }));
        return;
      }
      if (url.pathname === '/economy/history' && req.method === 'GET') {
        const actor = identityFor(req);
        if (!actor) { res.writeHead(401, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'unauthorized' })); return; }
        const entries = await economyService.history(actor.sub, { sinceId: Number(url.searchParams.get('sinceId') || 0), limit: Number(url.searchParams.get('limit') || 50) });
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        res.end(JSON.stringify({ entries, nextSinceId: entries.length ? entries[0].id : Number(url.searchParams.get('sinceId') || 0) }));
        return;
      }
      if (url.pathname === '/economy/grant' && req.method === 'POST') {
        const admin = guardHttp(req, res, 'economy:grant');
        if (!admin) return;
        const body = await jsonBody(req);
        try {
          const entry = await economyService.grant({ userId: body.userId, amount: body.amount, reason: body.reason, idempotencyKey: body.idempotencyKey, by: admin.username });
          audit.record({ actor: admin.username, action: 'economy.grant', resource: body.userId ? `player:${body.userId}` : null, outcome: 'allow', detail: { amount: body.amount, idempotent: Boolean(body.idempotencyKey) } });
          res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
          res.end(JSON.stringify({ entry, balance: await economyService.balance(body.userId) }));
        } catch (error) {
          const code = error instanceof EconomyError ? error.code : 'economy_error';
          audit.record({ actor: admin.username, action: 'economy.grant', resource: body.userId ? `player:${body.userId}` : null, outcome: 'deny', detail: { code, amount: body.amount ?? null } });
          res.writeHead(code === 'economy_insufficient_funds' ? 409 : 400, { 'content-type': 'application/json', 'cache-control': 'no-store' });
          res.end(JSON.stringify({ error: code }));
        }
        return;
      }
      if (url.pathname === '/economy/compliance' && req.method === 'GET') {
        if (!guardHttp(req, res, 'admin:metrics')) return;
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        res.end(JSON.stringify(await complianceReport({ store: economyService.store })));
        return;
      }
      if (url.pathname === '/admin.html') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(fs.readFileSync(path.join(ROOT, 'admin.html')));
        return;
      }
      if (url.pathname === '/admin/keys' && req.method === 'GET') {
        if (!guardHttp(req, res, 'keys:rotate')) return;
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        res.end(JSON.stringify({ keys: identity.keyInfo() }));
        return;
      }
      if (url.pathname === '/admin/keys/rotate' && req.method === 'POST') {
        const admin = guardHttp(req, res, 'keys:rotate');
        if (!admin) return;
        const body = await jsonBody(req);
        const result = identity.rotateSecret(body.secret || undefined);
        metrics.keyRotations++;
        audit.record({ actor: admin.username, action: 'key.rotate', outcome: 'allow', detail: { kid: result.kid, providedSecret: Boolean(body.secret) } });
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        res.end(JSON.stringify(result));
        return;
      }
      if (url.pathname === '/admin/keys/drop' && req.method === 'POST') {
        const admin = guardHttp(req, res, 'keys:rotate');
        if (!admin) return;
        const body = await jsonBody(req);
        try {
          const dropped = identity.dropKey(body.kid);
          audit.record({ actor: admin.username, action: 'key.drop', outcome: dropped ? 'allow' : 'deny', detail: { kid: body.kid } });
          res.writeHead(dropped ? 200 : 404, { 'content-type': 'application/json', 'cache-control': 'no-store' });
          res.end(JSON.stringify({ dropped, keys: identity.keyInfo() }));
        } catch (error) {
          res.writeHead(409, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: error.message }));
        }
        return;
      }
      if (url.pathname === '/admin/audit' && req.method === 'GET') {
        if (!guardHttp(req, res, 'audit:read')) return;
        const events = audit.query({
          sinceId: Number(url.searchParams.get('sinceId') || 0),
          limit: Number(url.searchParams.get('limit') || 100),
          actor: url.searchParams.get('actor'),
          action: url.searchParams.get('action'),
          outcome: url.searchParams.get('outcome'),
        });
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        res.end(JSON.stringify({ events, nextSinceId: events.length ? events[0].id : Number(url.searchParams.get('sinceId') || 0) }));
        return;
      }
      if (url.pathname === '/admin/ping' && req.method === 'GET') {
        if (!guardHttp(req, res, 'admin:metrics')) return;
        const dependencies = await healthMonitor.probeAll({ force: true });
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        res.end(JSON.stringify({ dependencies, ok: summarize(dependencies).ok, now: Date.now() }));
        return;
      }
      if (url.pathname === '/admin/regions' && req.method === 'GET') {
        if (!guardHttp(req, res, 'admin:metrics')) return;
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        res.end(JSON.stringify({ regions: regionalLoad(), thresholds: SCALE_DEFAULTS, now: Date.now() }));
        return;
      }
      if (url.pathname.startsWith('/admin/')) {
        const admin = guardHttp(req, res, 'admin:metrics');
        if (!admin) return;
        const elevated = hasRole(admin, 'admin');
        const payload = {
          metrics,
          queue: queue.length,
          rooms: [...rooms.values()].map((room) => room.metrics()),
          // dados por usuário (usernames, strikes) só para papéis elevados
          clients: elevated ? [...clients.values()].map((client) => ({ id: client.id, username: client.identity.username, role: client.identity.role, region: client.region, roomId: client.roomId, strikes: client.violations.count, suspicious: client.violations.suspicious })) : undefined,
          sessions: (await durable.listSessions()).length,
          admin: admin?.username || 'legacy-token',
          now: Date.now(),
        };
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        res.end(JSON.stringify(payload));
        return;
      }
      res.writeHead(404);
      res.end();
    } catch {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'bad_request' }));
    }
  }

  const server = tlsConfig
    ? https.createServer({ cert: tlsConfig.cert, key: tlsConfig.key }, (req, res) => { void httpHandler(req, res); })
    : http.createServer((req, res) => { void httpHandler(req, res); });

  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: MAX_WS_PAYLOAD, perMessageDeflate: false });
  const handleConnection = async (ws, req) => {
    const url = new URL(req.url, 'ws://localhost');
    const token = url.searchParams.get('token');
    const user = identity.verify(token);
    if (!user) { metrics.authFailures++; send(ws, { type: 'auth_required' }); ws.close(4001, 'auth-required'); return; }
    const mode = normalizeMode(url.searchParams.get('mode'));
    const resume = url.searchParams.get('resume');
    // Falha de leitura no store não pode bloquear a entrada do jogador:
    // trata como sessão nova (fail-fresh) e sinaliza a degradação.
    let saved = null;
    if (resume) {
      try {
        saved = await durable.getSession(resume);
      } catch {
        saved = null;
        metrics.storeReadFailures++;
      }
    }
    const blankInput3D = { seq: 0, dx: 0, dy: 0, yaw: 0, pitch: 0, fire: false, ads: false, sprint: false, jump: false, interact: false, reload: false, medkit: false, slot: 0 };
    let client;
    if (saved && saved.userId === user.sub && saved.expiresAt > Date.now() && rooms.get(saved.roomId)?.players.has(saved.id)) {
      client = { id: saved.id, ws, roomId: saved.roomId, mode, seq: 0, input: { seq: 0, dx: 0, dy: 0, aimX: 550, aimY: 330, fire: false, interact: false }, input3d: { ...blankInput3D }, violations: new ViolationTracker(), identity: user, region: normalizeRegion(user.region), resumeToken: resume, connectedAt: Date.now() };
      metrics.reconnects++;
    } else {
      client = { id: `client-${nextClient++}`, ws, roomId: null, mode, seq: 0, input: { seq: 0, dx: 0, dy: 0, aimX: 550, aimY: 330, fire: false, interact: false }, input3d: { ...blankInput3D }, violations: new ViolationTracker(), identity: user, region: chooseRegion(user.region, {}), resumeToken: crypto.randomBytes(24).toString('base64url'), connectedAt: Date.now() };
    }
    clients.set(client.id, client);
    metrics.connections++;
    if (!client.roomId) { queue.push(client); send(ws, { type: 'queued', id: client.id, region: client.region, queue: queue.length }); assign(client); }
    else send(ws, { type: 'resumed', id: client.id, roomId: client.roomId, region: client.region, resumeToken: client.resumeToken, snapshot: getRoom(client).snapshot(client.id) });

    ws.on('message', (raw) => {
      void (async () => {
        metrics.messages++;
        if (raw.length > MAX_WS_PAYLOAD) { metrics.oversized++; ws.close(4009, 'payload-too-large'); return; }
        const limited = await allowOrOpen(client.mode === '3d' ? limiter3d : limiter, client.identity.sub);
        if (!limited.allowed) { metrics.rateLimited++; send(ws, { type: 'rate_limited', retryAt: limited.resetAt }); return; }
        try {
          const message = JSON.parse(raw.toString());
          if (message.type === 'ping') { send(ws, { type: 'pong', t: message.t }); return; }
          if (message.type === 'start') {
            const room = getRoom(client);
            if (!can(client.identity, 'room:start', room?.id)) {
              metrics.rbacDenies++;
              audit.record({ actor: client.identity.username, action: 'rbac.deny', resource: room?.id || null, outcome: 'deny', detail: { permission: 'room:start', via: 'ws' } });
              send(ws, { type: 'forbidden', permission: 'room:start' });
              return;
            }
            if (room) audit.record({ actor: client.identity.username, action: 'room.start', resource: room.id, outcome: 'allow' });
            room?.start(client.id, message.entry || 'belt');
            return;
          }
          if (message.type !== 'input') return;
          const room = getRoom(client);
          if (room?.is3d) {
            const candidate = { ...message.input, seq: message.input?.seq ?? -1 };
            const result = validateInput3D(client.input3d, candidate, 1 / 20);
            if (!result.ok) {
              client.violations.add(result.violations);
              metrics.rejections++;
              metrics.violations += result.violations.length;
              send(ws, { type: 'rejected', violations: result.violations, strikes: client.violations.count });
              if (client.violations.banned) { metrics.bans++; send(ws, { type: 'banned', reason: 'anti-cheat threshold' }); ws.close(4003, 'anti-cheat'); }
              return;
            }
            client.input3d = candidate;
            client.seq = candidate.seq;
            room.input(client.id, candidate);
            return;
          }
          const candidate = { ...message.input, seq: message.input?.seq ?? -1 };
          const player = room?.players.get(client.id);
          const previous = { ...client.input, x: player?.x ?? 550, y: player?.y ?? 330 };
          const result = validateInput(previous, candidate, 1 / 20);
          if (!result.ok) {
            client.violations.add(result.violations);
            metrics.rejections++;
            metrics.violations += result.violations.length;
            send(ws, { type: 'rejected', violations: result.violations, strikes: client.violations.count });
            if (client.violations.banned) { metrics.bans++; send(ws, { type: 'banned', reason: 'anti-cheat threshold' }); ws.close(4003, 'anti-cheat'); }
            return;
          }
          client.input = candidate;
          client.seq = candidate.seq;
          room?.input(client.id, candidate, 1 / 20);
        } catch {
          client.violations.add(['malformed_message']);
          metrics.violations++;
        }
      })().catch(() => ws.close(1011, 'server-error'));
    });
    ws.on('close', () => {
      void durable.setSession(client.resumeToken, { id: client.id, userId: user.sub, roomId: client.roomId, expiresAt: Date.now() + 15000 }).catch?.(() => {});
      clients.delete(client.id);
    });
  };
  wss.on('connection', (ws, req) => { void handleConnection(ws, req).catch(() => ws.close(1011, 'server-error')); });

  const timer = setInterval(() => {
    metrics.ticks++;
    for (const room of rooms.values()) {
      room.tick(1 / 20);
      for (const client of clients.values()) if (client.roomId === room.id) send(client.ws, { type: 'snapshot', snapshot: room.snapshot(client.id), events: [] });
    }
  }, 50);
  const cleanup = setInterval(() => {
    void (async () => {
      for (const [id, room] of rooms) if (room.players.size === 0 && Date.now() - room.lastActivity > 60000) rooms.delete(id);
      if (typeof durable.cleanupExpired === 'function') await durable.cleanupExpired();
      else for (const session of await durable.listSessions()) if (session.expiresAt < Date.now()) await durable.deleteSession(session.id);
    })().catch(() => {});
  }, 10000);

  const ready = Promise.all([durable.ready?.(), selectedRateStore.ready?.()]);
  return {
    server, wss, rooms, clients, queue, metrics, auth: identity, store: durable, rateStore: selectedRateStore, ready,
    economy: economyService,
    tls: tlsConfig, oidc: oidcClient, audit, health: healthMonitor,
    close: async () => {
      clearInterval(timer);
      clearInterval(cleanup);
      for (const client of clients.values()) client.ws.close();
      await new Promise((resolve) => server.close(resolve));
      await durable.close?.();
      await selectedRateStore.close?.();
    },
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const app = createAuthoritativeServer();
  app.ready.then(() => app.server.listen(Number(process.env.PORT || 8787), () => {
    const scheme = app.tls ? 'https' : 'http';
    const extras = [app.tls ? 'TLS on' : 'TLS off', app.oidc ? 'SSO/OIDC on' : 'SSO/OIDC off'].join(' | ');
    console.log(`[CIGKV authoritative] ${scheme}://localhost:${process.env.PORT || 8787} | /ws | /auth/login | /auth/logout | /auth/oidc/start | /admin.html | ${extras}`);
  }))
    .catch((error) => { console.error(`[CIGKV authoritative] dependency readiness failed: ${error.message}`); process.exitCode = 1; });
}
