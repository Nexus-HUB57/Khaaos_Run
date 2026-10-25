// Testes de RBAC (permissões por recurso) e trilha de auditoria.
// O teste de persistência de auditoria é opt-in (KR_DATABASE_TEST_URL) e aplica
// a migração 002 de forma idempotente — em CI o job aplica `npm run db:migrate`.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { createAuthoritativeServer } from '../server/server.js';
import { AuthService, hashPassword } from '../server/auth.js';
import { DurableJsonStore } from '../server/store.js';
import { PostgresAuditStore } from '../server/store.js';
import { SharedMemoryRateStore } from '../server/rateLimit.js';
import { AuditLog } from '../server/audit.js';
import { can, permissionsFor, PERMISSIONS, ROLE_PERMISSIONS } from '../server/rbac.js';

const listen = (server) => new Promise((resolve) => server.listen(0, () => resolve(server.address().port)));
const usersOf = (...defs) => defs.map(({ name, role }) => ({ id: name, username: name, role, region: 'sa-east', passwordHash: hashPassword(`${name}-pw`, 'salt') }));
const withApp = async ({ users, ...options } = {}) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kr-rbac-'));
  const app = createAuthoritativeServer({
    port: 0,
    auth: new AuthService({ secret: 'rbac-secret', users }),
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

// ---------- matriz de permissões ----------

test('RBAC: matriz por papel cobre room:*, admin:metrics e audit:read; player nunca vê recursos admin', () => {
  const player = { sub: 'p1', username: 'player', role: 'player' };
  const moderator = { sub: 'm1', username: 'mod', role: 'moderator' };
  const admin = { sub: 'a1', username: 'admin', role: 'admin' };

  for (const permission of ['room:join', 'room:start', 'room:input']) {
    assert.equal(can(player, permission), true, `player deve ter ${permission}`);
    assert.equal(can(moderator, permission), true, `moderator herda ${permission}`);
  }
  assert.equal(can(player, 'admin:metrics'), false);
  assert.equal(can(player, 'keys:rotate'), false);
  assert.equal(can(player, 'audit:read'), false);
  assert.equal(can(player, 'permissao:inexistente'), false);

  assert.equal(can(moderator, 'admin:metrics'), true, 'moderator lê métricas');
  assert.equal(can(moderator, 'audit:read'), true, 'moderator lê auditoria');
  assert.equal(can(moderator, 'keys:rotate'), false, 'moderator NÃO rotaciona chaves');

  for (const permission of Object.keys(PERMISSIONS)) {
    assert.equal(can(admin, permission), true, `admin recebe tudo (${permission})`);
  }
  assert.deepEqual(permissionsFor(admin), ['*']);
  assert.deepEqual(permissionsFor(null), []);
  assert.equal(can(null, 'room:start'), false);
});

test('RBAC: permissões room:* são restritas ao recurso próprio (sala da identidade)', () => {
  const scoped = { sub: 'p1', role: 'player', roomId: 'ring-1' };
  assert.equal(can(scoped, 'room:start', 'ring-1'), true);
  assert.equal(can(scoped, 'room:start', 'ring-2'), false, 'sala alheia deve ser negada');
  // sem sala na identidade (handshake HTTP admin legado) o escopo não bloqueia
  assert.equal(can({ sub: 'legacy', role: 'admin' }, 'room:start', 'ring-9'), true);
  // identidade sem roomId conhecido (fluxo de matchmaking) decide por papel
  assert.equal(can({ sub: 'p1', role: 'player' }, 'room:join', 'ring-3'), true);
});

// ---------- auditoria em memória ----------

test('AuditLog: ids monotônicos, ring capacity e filtros de consulta', () => {
  const log = new AuditLog({ capacity: 5 });
  for (let i = 0; i < 8; i++) log.record({ actor: `u${i}`, action: 'auth.login', outcome: i % 2 ? 'deny' : 'allow' });
  assert.equal(log.events.length, 5, 'ring buffer respeita capacity');
  assert.deepEqual(log.events.map((e) => e.actor), ['u3', 'u4', 'u5', 'u6', 'u7']);

  const all = log.query({ limit: 100 });
  assert.equal(all.length, 5);
  assert.ok(all[0].id > all[all.length - 1].id, 'consulta vem em ordem decrescente');
  assert.equal(log.query({ outcome: 'deny' }).every((e) => e.outcome === 'deny'), true);
  assert.equal(log.query({ outcome: 'deny', limit: 2 }).length, 2);
  const since = log.query({ sinceId: all[2].id, limit: 10 });
  assert.ok(since.every((e) => e.id > all[2].id));
  assert.equal(log.query({ actor: 'u6' }).length, 1);
  assert.equal(log.nextId > 8, true, 'ids seguem monotônicos além do ring');
});

// ---------- HTTP: guards por endpoint + auditoria ----------

test('RBAC HTTP: player 403 em métricas, moderator lê sem clients e não rotaciona chaves, admin legacy tudo', async () => {
  const { app, port, dir } = await withApp({ users: usersOf({ name: 'player', role: 'player' }, { name: 'mod', role: 'moderator' }) });
  try {
    // login do moderator via HTTP (audita auth.login allow); player direto no AuthService
    const loginRes = await fetch(`http://127.0.0.1:${port}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'mod', password: 'mod-pw' }) });
    assert.equal(loginRes.status, 200);
    const modToken = (await loginRes.json()).token;
    const playerToken = app.auth.login('player', 'player-pw').token;

    // player: 403 com permissão nomeada + evento de auditoria
    const denied = await fetch(`http://127.0.0.1:${port}/admin/metrics`, { headers: { authorization: `Bearer ${playerToken}` } });
    assert.equal(denied.status, 403);
    const deniedBody = await denied.json();
    assert.equal(deniedBody.error, 'forbidden');
    assert.equal(deniedBody.permission, 'admin:metrics');

    // moderator: 200, mas payload NÃO contém clients (dados por usuário)
    const modView = await fetch(`http://127.0.0.1:${port}/admin/metrics`, { headers: { authorization: `Bearer ${modToken}` } });
    assert.equal(modView.status, 200);
    const modPayload = await modView.json();
    assert.equal(modPayload.clients, undefined);
    assert.equal(typeof modPayload.sessions, 'number');

    // moderator: auditoria 200, rotação 403
    const auditOk = await fetch(`http://127.0.0.1:${port}/admin/audit`, { headers: { authorization: `Bearer ${modToken}` } });
    assert.equal(auditOk.status, 200);
    const keyDenied = await fetch(`http://127.0.0.1:${port}/admin/keys/rotate`, { method: 'POST', headers: { authorization: `Bearer ${modToken}`, 'content-type': 'application/json' }, body: '{}' });
    assert.equal(keyDenied.status, 403);
    assert.equal((await keyDenied.json()).permission, 'keys:rotate');

    // admin legacy: metrics completo (com clients) e rotação liberada
    const adminView = await fetch(`http://127.0.0.1:${port}/admin/metrics?token=legacy`);
    assert.equal(adminView.status, 200);
    const adminPayload = await adminView.json();
    assert.ok(Array.isArray(adminPayload.clients));
    const rotated = await fetch(`http://127.0.0.1:${port}/admin/keys/rotate?token=legacy`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(rotated.status, 200);

    // auditoria registrou allows sensíveis e denies RBAC
    const denies = app.audit.query({ action: 'rbac.deny' });
    assert.ok(denies.length >= 2, `espera denies de HTTP (teve ${denies.length})`);
    assert.ok(denies.every((e) => e.outcome === 'deny'));
    assert.ok(app.audit.query({ action: 'key.rotate', outcome: 'allow' }).length === 1);
    assert.ok(app.audit.query({ action: 'auth.login', outcome: 'allow' }).length === 1, 'login HTTP é auditado (login direto no AuthService não passa pelo endpoint)');
    assert.ok(app.metrics.rbacDenies >= 2);
  } finally {
    await cleanupApp(app, dir);
  }
});

test('RBAC HTTP: /admin/audit respeita filtros actor/action/outcome e sinceId', async () => {
  const { app, port, dir } = await withApp({ users: usersOf({ name: 'mod', role: 'moderator' }) });
  try {
    const modToken = app.auth.login('mod', 'mod-pw').token;
    // gera eventos mistos
    await fetch(`http://127.0.0.1:${port}/admin/keys/rotate`, { method: 'POST', headers: { authorization: `Bearer ${modToken}`, 'content-type': 'application/json' }, body: '{}' }).catch(() => {});
    const snapshotId = app.audit.nextId;
    await fetch(`http://127.0.0.1:${port}/admin/metrics`, { headers: { authorization: `Bearer ${modToken}` } });
    await fetch(`http://127.0.0.1:${port}/admin/keys/rotate`, { method: 'POST', headers: { authorization: `Bearer ${modToken}`, 'content-type': 'application/json' }, body: '{}' }).catch(() => {});

    const byAction = await fetch(`http://127.0.0.1:${port}/admin/audit?action=rbac.deny`, { headers: { authorization: `Bearer ${modToken}` } });
    const { events } = await byAction.json();
    assert.ok(events.length >= 2, `espera denies de keys:rotate (teve ${events.length})`);
    assert.ok(events.every((e) => e.action === 'rbac.deny' && e.outcome === 'deny'));
    const allows = await fetch(`http://127.0.0.1:${port}/admin/audit?actor=mod&action=rbac.deny`, { headers: { authorization: `Bearer ${modToken}` } });
    const actorEvents = (await allows.json()).events;
    assert.ok(actorEvents.length >= 2);
    assert.ok(actorEvents.every((e) => e.actor === 'mod' && e.action === 'rbac.deny'));

    const since = await fetch(`http://127.0.0.1:${port}/admin/audit?sinceId=${snapshotId}`, { headers: { authorization: `Bearer ${modToken}` } });
    const sinceBody = await since.json();
    assert.ok(sinceBody.events.every((e) => e.id > snapshotId));
  } finally {
    await cleanupApp(app, dir);
  }
});

// ---------- WS: room:start por recurso ----------

const waitMatchFound = (ws) => new Promise((resolve, reject) => {
  ws.on('message', function handler(raw) {
    const message = JSON.parse(raw.toString());
    if (message.type === 'match_found') { ws.off('message', handler); resolve(message); }
  });
  ws.on('error', reject);
});

test('RBAC WS: spectator não inicia partida (forbidden + auditoria); player inicia (room.start auditado)', async () => {
  const { app, port, dir } = await withApp({ users: usersOf({ name: 'player', role: 'player' }, { name: 'viewer', role: 'spectator' }) });
  try {
    // spectator: start é negado por recurso
    const spectatorToken = app.auth.login('viewer', 'viewer-pw').token;
    const spectatorWs = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${spectatorToken}`);
    const spectatorRoom = await waitMatchFound(spectatorWs);
    const forbidden = await new Promise((resolve, reject) => {
      spectatorWs.on('message', function handler(raw) {
        const message = JSON.parse(raw.toString());
        if (message.type === 'forbidden') { spectatorWs.off('message', handler); resolve(message); }
      });
      spectatorWs.on('error', reject);
      spectatorWs.send(JSON.stringify({ type: 'start', entry: 'belt' }));
    });
    assert.equal(forbidden.permission, 'room:start');
    const denyEvent = app.audit.query({ action: 'rbac.deny', outcome: 'deny' }).find((e) => e.resource === spectatorRoom.roomId);
    assert.ok(denyEvent, 'negativa do WS deve ser auditada por sala');
    spectatorWs.close();

    // player: start permitido e auditado com o recurso da própria sala
    const playerToken = app.auth.login('player', 'player-pw').token;
    const playerWs = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${playerToken}`);
    const playerRoom = await waitMatchFound(playerWs);
    await new Promise((resolve) => setTimeout(resolve, 120));
    playerWs.send(JSON.stringify({ type: 'start', entry: 'belt' }));
    await new Promise((resolve) => setTimeout(resolve, 120));
    const startEvent = app.audit.query({ action: 'room.start', outcome: 'allow' }).find((e) => e.resource === playerRoom.roomId);
    assert.ok(startEvent, 'início de partida deve ser auditado por sala');
    playerWs.close();
  } finally {
    await cleanupApp(app, dir);
  }
});

// ---------- persistência real (opt-in) ----------

const databaseUrl = process.env.KR_DATABASE_TEST_URL || process.env.KR_DATABASE_URL;

test('PostgreSQL: auditoria persiste no servidor real com filtros e paginação por id', { skip: !databaseUrl }, async () => {
  const pg = (await import('pg')).default;
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    // migração 002 idempotente (o caminho oficial continua sendo npm run db:migrate)
    await pool.query(fs.readFileSync(new URL('../migrations/002_audit_events.sql', import.meta.url), 'utf8'));

    const store = new PostgresAuditStore({ pool });
    const marker = `rbac-test-${crypto.randomUUID()}`;
    await store.recordEvent({ at: Date.now(), actor: marker, action: 'auth.login', resource: null, outcome: 'allow', detail: { via: 'test' } });
    await store.recordEvent({ at: Date.now(), actor: marker, action: 'rbac.deny', resource: 'ring-1', outcome: 'deny', detail: { permission: 'keys:rotate' } });
    await store.recordEvent({ at: Date.now(), actor: marker, action: 'room.start', resource: 'ring-1', outcome: 'allow', detail: null });

    const denies = await store.queryEvents({ actor: marker, outcome: 'deny' });
    assert.equal(denies.length, 1);
    assert.equal(denies[0].action, 'rbac.deny');
    assert.deepEqual(denies[0].detail, { permission: 'keys:rotate' });

    const all = await store.queryEvents({ actor: marker });
    assert.equal(all.length, 3);
    assert.ok(all[0].id > all[2].id, 'ordem decrescente por id');
    const page = await store.queryEvents({ actor: marker, sinceId: all[0].id });
    assert.equal(page.length, 0);

    await pool.query('DELETE FROM audit_events WHERE actor = $1', [marker]);
    // pool é compartilhado com o store — encerrado UMA única vez no finally
  } finally {
    await pool.end().catch(() => {});
  }
});
