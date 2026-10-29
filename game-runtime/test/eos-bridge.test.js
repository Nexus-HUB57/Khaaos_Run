// Khaaos Run — M4: ponte EOS nativa server-side (unit tests — ÚNICO lugar onde
// config de teste substitui credenciais reais; roadmap: "manter mock apenas
// como teste unitário").
//
// Cobertura:
//   1. unconfigured: status honesto (missing[]), operações rejeitadas com
//      EOS_UNCONFIGURED — o caminho de runtime NUNCA finge sucesso;
//   2. anchoring por ownership: sessão EOS só registra contra sala possuída
//      pela réplica (fencing) — sala inexistente → EOS_ROOM_NOT_OWNED;
//   3. ciclo de vida HTTP real: register (201) → heartbeat → end → 404;
//   4. RBAC: player não opera sessões (403), service/admin operam;
//   5. re-anchor idempotente (segundo register = renewed, não duplica).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { createAuthoritativeServer } from '../server/server.js';
import { AuthService, hashPassword } from '../server/auth.js';
import { DurableJsonStore } from '../server/store.js';
import { SharedMemoryRateStore } from '../server/rateLimit.js';
import { createEosBridge, eosConfigFromEnv } from '../server/eos.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const TEST_CONFIG = {
  productId: 'test-product', sandboxId: 'test-sandbox', deploymentId: 'test-deployment',
  clientId: 'test-client', clientSecret: 'test-secret', region: 'sa1',
};

function reservePort() {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => { const p = srv.address().port; srv.close(() => resolve(p)); });
  });
}
const listenOn = (s, p) => new Promise((res, rej) => { s.once('error', rej); s.listen(p, '127.0.0.1', res); });

// ── 1. Sem credenciais: honestidade do status + rejeição ─────────────────────
test('eos bridge: sem credenciais responde unconfigured, lista ausentes e rejeita operações (sem mock)', () => {
  const bridge = createEosBridge({ config: eosConfigFromEnv({}) });
  const status = bridge.status();
  assert.equal(status.mode, 'unconfigured');
  assert.equal(status.configured, false);
  assert.deepEqual(status.missing, ['productId', 'sandboxId', 'deploymentId', 'clientId', 'clientSecret']);
  assert.equal(status.sdkVersion, '1.16.0');
  assert.throws(() => bridge.registerSession({ sessionId: '12345678', roomId: 'r-1' }), (e) => e.code === 'EOS_UNCONFIGURED');
  assert.throws(() => bridge.heartbeat('12345678'), (e) => e.code === 'EOS_UNCONFIGURED');
  assert.throws(() => bridge.endSession('12345678'), (e) => e.code === 'EOS_UNCONFIGURED');
  // Nenhum segredo no status — só a LISTA do que falta.
  const raw = JSON.stringify(status);
  assert.ok(!raw.includes('secret'), 'status não vaza segredos');
});

test('eos bridge: anchoring por ownership (fencing) — sala não possuída é rejeitada', () => {
  let owned = false;
  const bridge = createEosBridge({
    config: TEST_CONFIG,
    isRoomOwnedLocally: () => owned,
  });
  assert.throws(() => bridge.registerSession({ sessionId: 'sess-abcdef-01', roomId: 'room-x' }), (e) => e.code === 'EOS_ROOM_NOT_OWNED');
  owned = true;
  const r = bridge.registerSession({ sessionId: 'sess-abcdef-01', roomId: 'room-x', maxPlayers: 60, hostAddress: '10.0.0.5:7777' });
  assert.equal(r.created, true);
  assert.equal(r.roomId, 'room-x');
  // Re-anchor idempotente: renewed, sem duplicar.
  const r2 = bridge.registerSession({ sessionId: 'sess-abcdef-01', roomId: 'room-x' });
  assert.equal(r2.renewed, true);
  assert.equal(bridge.__sessions.size, 1);
  // sessionId malformado rejeitado antes de qualquer estado.
  assert.throws(() => bridge.registerSession({ sessionId: 'x', roomId: 'room-x' }), (e) => e.code === 'EOS_SESSION_ID_INVALID');
  bridge.stop();
});

// ── 2. Ciclo HTTP real contra o servidor autoritativo ─────────────────────────
async function startServer({ eos }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kr-eos-'));
  const port = await reservePort();
  const auth = new AuthService({ secret: 'eos-secret', users: [
    { id: 'u1', username: 'player', role: 'player', region: 'sa-east', passwordHash: hashPassword('pass', 'salt') },
    { id: 'svc1', username: 'ds-service', role: 'service', region: 'sa-east', passwordHash: hashPassword('pass', 'salt') },
  ] });
  const app = createAuthoritativeServer({
    auth,
    store: new DurableJsonStore(path.join(dir, 'state.json')),
    rateStore: new SharedMemoryRateStore(),
    adminToken: 'legacy-admin',
    eos,
  });
  await listenOn(app.server, port);
  return { app, port, playerToken: auth.login('player', 'pass').token, serviceToken: auth.login('ds-service', 'pass').token, dir };
}

async function createPrivateRoom(port, token) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${token}&mode=3d`);
  const first = new Promise((resolve, reject) => {
    const on = (raw) => { const m = JSON.parse(raw); if (m.type === 'queued' || m.type === 'match_found') { ws.off('message', on); resolve(m); } };
    ws.on('message', on); ws.once('error', reject);
  });
  await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
  await first;
  const p = new Promise((resolve, reject) => {
    const on = (raw) => { const m = JSON.parse(raw); if (m.type === 'private_created') { ws.off('message', on); resolve(m); } };
    ws.on('message', on); ws.once('error', reject);
  });
  ws.send(JSON.stringify({ type: 'create_private' }));
  const created = await p;
  return { ws, roomId: created.roomId };
}

test('eos bridge HTTP: register→201, heartbeat→200, end→200, desconhecida→404, player→403', async () => {
  const { app, port, playerToken, serviceToken, dir } = await startServer({ eos: createEosBridge({ config: TEST_CONFIG }) });
  let room;
  try {
    room = await createPrivateRoom(port, playerToken);
    const base = `http://127.0.0.1:${port}`;

    // status público SEM segredos
    const status = await fetch(`${base}/eos/status`).then((r) => r.json());
    assert.equal(status.mode, 'native');
    assert.ok(!JSON.stringify(status).includes('test-secret'));

    // player NÃO opera sessões (RBAC)
    const denied = await fetch(`${base}/eos/sessions`, { method: 'POST', headers: { authorization: `Bearer ${playerToken}`, 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: 'sess-abc-001', roomId: room.roomId }) });
    assert.equal(denied.status, 403);

    // service role ancora a sessão à sala possuída
    const reg = await fetch(`${base}/eos/sessions`, { method: 'POST', headers: { authorization: `Bearer ${serviceToken}`, 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: 'sess-abc-001', roomId: room.roomId, maxPlayers: 60, hostAddress: '127.0.0.1:7777' }) });
    assert.equal(reg.status, 201);
    const regBody = await reg.json();
    assert.equal(regBody.roomId, room.roomId);

    // sala inexistente → fencing 409
    const notOwned = await fetch(`${base}/eos/sessions`, { method: 'POST', headers: { authorization: `Bearer ${serviceToken}`, 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: 'sess-abc-002', roomId: 'nao-existe-1' }) });
    assert.equal(notOwned.status, 409);
    const notOwnedBody = await notOwned.json();
    assert.equal(notOwnedBody.error, 'EOS_ROOM_NOT_OWNED');

    // heartbeat e end
    const hb = await fetch(`${base}/eos/sessions/sess-abc-001/heartbeat`, { method: 'POST', headers: { authorization: `Bearer ${serviceToken}` } });
    assert.equal(hb.status, 200);
    const end = await fetch(`${base}/eos/sessions/sess-abc-001/end`, { method: 'POST', headers: { authorization: `Bearer ${serviceToken}` } });
    assert.equal(end.status, 200);
    const endBody = await end.json();
    assert.equal(endBody.ended, true);

    // sessão encerrada → heartbeat 404
    const hb2 = await fetch(`${base}/eos/sessions/sess-abc-001/heartbeat`, { method: 'POST', headers: { authorization: `Bearer ${serviceToken}` } });
    assert.equal(hb2.status, 404);

    // listagem protegida por admin:metrics
    const listed = await fetch(`${base}/eos/sessions`, { headers: { authorization: `Bearer ${serviceToken}` } });
    assert.equal(listed.status, 200);
    const listBody = await listed.json();
    assert.equal(listBody.sessions.length, 1);
    assert.equal(listBody.sessions[0].sessionId, 'sess-abc-001');
  } finally {
    room?.ws?.close();
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('eos bridge HTTP: runtime SEM credenciais rejeita registro com 503/EOS_UNCONFIGURED (nunca finge)', async () => {
  const { app, port, serviceToken, playerToken, dir } = await startServer({ eos: createEosBridge({ config: eosConfigFromEnv({}) }) });
  let room;
  try {
    room = await createPrivateRoom(port, playerToken);
    const res = await fetch(`http://127.0.0.1:${port}/eos/sessions`, { method: 'POST', headers: { authorization: `Bearer ${serviceToken}`, 'content-type': 'application/json' }, body: JSON.stringify({ sessionId: 'sess-xyz-009', roomId: room.roomId }) });
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.error, 'EOS_UNCONFIGURED');
    assert.ok(body.detail.includes('ausentes'));
  } finally {
    room?.ws?.close();
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
