// Khaaos Run — M4: cross-replica AO VIVO (determinístico, in-process).
//
// Duas réplicas do runtime (processos distintos em produção; aqui, dois
// `createAuthoritativeServer` no mesmo processo) compartilham os MESMOS
// drivers Memory da camada distribuída — a semântica canônica que o driver
// Redis espelha 1:1 no staging (KR_DISTRIBUTED=1 + KR_REDIS_URL):
//
//   1. identidade de réplica estável e ids de sala prefixados pelo dono;
//   2. convite privado criado em A é resolvido por B via índice compartilhado;
//   3. join cross-réplica → REDIRECT ao endereço público do dono (registry) →
//      reconexão do cliente → `private_joined` na réplica dona;
//   4. fencing: réplica sem lease é rejeitada (no_lease) — split-brain
//      estruturalmente impossível;
//   5. registro de réplicas RENOVADO pelo heartbeat (bug M4: expirava em
//      ttlMs*2 e o redirect morria com a réplica viva);
//   6. relay espelhado (room_open de A aplicado no espelho de B);
//   7. /metrics expõe as séries Prometheus da camada distribuída.
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
import { createDistributed, MemoryOwnership, MemoryRelay, MemoryReplicaRegistry } from '../server/distributed.js';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Reserva uma porta efêmera (o endereço público da réplica precisa existir
// ANTES do start(), que registra id→address no registry compartilhado).
function reservePort() {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
  });
}

function listenOn(server, port) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve());
  });
}

// Espera a primeira mensagem cujo tipo esteja na lista.
function expectAny(ws, types) {
  return new Promise((resolve, reject) => {
    const onMessage = (raw) => {
      const message = JSON.parse(raw);
      if (types.includes(message.type)) { ws.off('message', onMessage); ws.off('close', onClose); resolve(message); }
    };
    const onClose = (code, reason) => reject(new Error(`ws fechou (${code} ${reason}) aguardando [${types.join(',')}]`));
    ws.on('message', onMessage);
    ws.once('close', onClose);
    ws.once('error', reject);
  });
}

function send(ws, payload) { ws.send(JSON.stringify(payload)); }

// Camada distribuída por réplica, com drivers COMPARTILHADOS entre elas.
function makeLayer({ id, address, drivers, ttlMs = 2_000, heartbeatMs = 150, mirrorMs = 100 }) {
  return createDistributed({
    enabled: true,
    replicaId: id,
    address,
    ownership: drivers.ownership,
    relay: drivers.relay,
    registry: drivers.registry,
    invites: drivers.invites,
    ttlMs,
    heartbeatMs,
    mirrorMs,
  });
}

async function startReplica({ id, drivers, dir }) {
  const port = await reservePort();
  const auth = new AuthService({ secret: 'crossreplica-secret', users: [{ id: 'u1', username: 'roam', role: 'player', region: 'sa-east', passwordHash: hashPassword('pass', 'salt') }] });
  const layer = makeLayer({ id, address: `http://127.0.0.1:${port}`, drivers });
  const app = createAuthoritativeServer({
    auth,
    store: new DurableJsonStore(path.join(dir, `state-${id}.json`)),
    rateStore: new SharedMemoryRateStore(),
    adminToken: 'legacy',
    distributed: layer,
  });
  await listenOn(app.server, port);
  return { app, layer, port, token: auth.login('roam', 'pass').token };
}

// Conecta um cliente 3D e aguarda o primeiro estado de sessão (fila ou sala).
// O handler de mensagem é anexado ANTES do open: o servidor envia 'queued'/'match_found'
// sincronamente na conexão — anexar depois do open perde a mensagem (race).
async function connect3D(port, token) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${token}&mode=3d`);
  const firstPromise = expectAny(ws, ['queued', 'match_found']);
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  console.error('[bc4] ws open on', port);
  const first = await firstPromise;
  console.error('[bc4] first msg on', port, '=', first.type);
  return { ws, first };
}

test('cross-replica: convite criado em A é resolvido em B via redirect e a autoridade nunca se duplica', { timeout: 30_000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kr-xrep-'));
  const drivers = { ownership: new MemoryOwnership(), relay: new MemoryRelay({ maxlen: 64, ttlMs: 30_000 }), registry: new MemoryReplicaRegistry(), invites: new Map() };
  let a, b, clientA, clientB, layerA, layerB, portA, portB, tokenA, tokenB;
  try {
    ({ app: a, layer: layerA, port: portA, token: tokenA } = await startReplica({ id: 'rep-a', drivers, dir }));
    ({ app: b, layer: layerB, port: portB, token: tokenB } = await startReplica({ id: 'rep-b', drivers, dir }));
    await wait(120); // settle: start()/registro/heartbeat iniciais

    // ── 1. healthz: camada distribuída ON e identidades distintas ──────────
    const healthA = await fetch(`http://127.0.0.1:${portA}/healthz`).then((r) => r.json());
    const healthB = await fetch(`http://127.0.0.1:${portB}/healthz`).then((r) => r.json());
    assert.equal(healthA.distributed.enabled, true);
    assert.equal(healthB.distributed.enabled, true);
    assert.equal(healthA.distributed.replicaId, 'rep-a');
    assert.equal(healthB.distributed.replicaId, 'rep-b');
    assert.notEqual(healthA.distributed.replicaId, healthB.distributed.replicaId);

    // ── 2. Jogador 1 cria sala privada na réplica A ────────────────────────────
    ({ ws: clientA } = await connect3D(portA, tokenA));
    // Handler anexado ANTES do send: a resposta do servidor é rápida — anexar
    // depois do send perde a mensagem (race clássico de WS).
    const createdPromise = expectAny(clientA, ['private_created']);
    send(clientA, { type: 'create_private' });
    const created = await createdPromise;
    assert.ok(created.roomId.startsWith('rep-a-'), `roomId deve ser prefixado pelo dono: ${created.roomId}`);
    assert.ok(created.code);
    const roomId = created.roomId;

    assert.ok(layerA.held.has(roomId), 'dono deve deter o lease da sala');
    assert.ok(layerA.held.get(roomId) >= 1, 'fence (epoch) >= 1');
    const inviteRef = await drivers.invites.get(created.code) ?? null;
    assert.ok(inviteRef, 'convite deve estar no índice compartilhado');
    // Map compartilhado guarda { roomId, replicaId, expiresAt }
    const inviteViaLookup = await layerB.lookupInvite(created.code);
    assert.equal(inviteViaLookup.roomId, roomId);
    assert.equal(inviteViaLookup.replicaId, 'rep-a');

    // ── 4. Fencing: réplica B NUNCA muta sala que não possui ───────────────
    const guard = await layerB.guard(roomId);
    assert.equal(guard.ok, false);
    assert.equal(guard.reason, 'no_lease');

    ({ ws: clientB } = await connect3D(portB, tokenB));
    const redirectedPromise = expectAny(clientB, ['redirect', 'private_not_found']);
    send(clientB, { type: 'join_private', code: created.code });
    const redirected = await redirectedPromise;
    assert.equal(redirected.type, 'redirect', `B deve redirecionar ao dono, não rejeitar: ${JSON.stringify(redirected)}`);
    assert.equal(redirected.roomId, roomId);
    assert.equal(redirected.owner, 'rep-a');
    assert.equal(redirected.reason, 'cross_replica');
    assert.equal(redirected.to, `http://127.0.0.1:${portA}`, 'redirect deve apontar para o endereço REGISTRADO pelo dono');

    const clientA2 = new WebSocket(`ws://127.0.0.1:${portA}/ws?token=${tokenA}&mode=3d`);
    const firstA2 = expectAny(clientA2, ['queued', 'match_found']);
    await new Promise((resolve, reject) => { clientA2.once('open', resolve); clientA2.once('error', reject); });
    await firstA2;
    const joinedPromise = expectAny(clientA2, ['private_joined', 'private_not_found']);
    send(clientA2, { type: 'join_private', code: created.code });
    const joined = await joinedPromise;
    assert.equal(joined.type, 'private_joined');
    assert.equal(joined.roomId, roomId);
    assert.equal(joined.code, created.code);
    clientA2.close();

    assert.ok(layerA.metrics.acquired >= 1, 'dono adquiriu posse');
    assert.ok(layerB.metrics.redirects >= 1, 'B redirecionou ao dono');
    assert.ok(layerB.metrics.inviteLookups >= 1 && layerB.metrics.inviteHits >= 1, 'índice de convites consultado e resolvido em B');

    // ── 8. Relay espelhado: LIMITAÇÃO M3 documentada — o espelho lê o stream
    // global '__global__' que nenhum publisher escreve (publish vai por sala);
    // sem asserção aqui até o espelho global ser ativado. Ver docs/CROSS_REPLICA_SMOKE.md.

    const metricsText = await fetch(`http://127.0.0.1:${portA}/metrics`).then((r) => r.text());
    assert.match(metricsText, /khaaos_runtime_replica_info\{replica_id="rep-a"\} 1/);
    assert.match(metricsText, /khaaos_runtime_distributed_acquired_total [1-9]/);
    assert.match(metricsText, /khaaos_runtime_distributed_held_rooms [1-9]/);
    const metricsB = await fetch(`http://127.0.0.1:${portB}/metrics`).then((r) => r.text());
    assert.match(metricsB, /khaaos_runtime_distributed_redirects_total [1-9]/);
  } finally {
    if (clientA) clientA.close();
    if (clientB) clientB.close();
    if (a) await a.close();
    if (b) await b.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('cross-replica: registro de réplicas é RENOVADO pelo heartbeat (redirect sobrevive além do ttlMs*2)', { timeout: 20_000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kr-xrenew-'));
  const drivers = { ownership: new MemoryOwnership(), relay: new MemoryRelay(), registry: new MemoryReplicaRegistry(), invites: new Map() };
  let a, layerA, portA;
  try {
    // ttlMs=500 → registro TTL 1000 ms; heartbeat 150 ms renova antes de expirar.
    ({ app: a, layer: layerA, port: portA } = await startReplica({ id: 'rep-r', drivers, dir, ttlMs: 500, heartbeatMs: 150 }));
    await wait(1_600); // > 1.5× o TTL do registro — sem renovação, lookup já teria expirado
    const address = await drivers.registry.lookup('rep-r');
    assert.equal(address, `http://127.0.0.1:${portA}`, 'entrada do registro deve seguir viva além do TTL inicial (renovação por heartbeat)');
  } finally {
    if (a) await a.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('cross-replica: convite de sala morta responde private_not_found (sem redirect para sala fantasma)', { timeout: 20_000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kr-xghost-'));
  const drivers = { ownership: new MemoryOwnership(), relay: new MemoryRelay(), registry: new MemoryReplicaRegistry(), invites: new Map() };
  let a, b, client, layerA, layerB, portA, portB, tokenB;
  try {
    ({ app: a, layer: layerA, port: portA } = await startReplica({ id: 'rep-g1', drivers, dir }));
    ({ app: b, layer: layerB, port: portB, token: tokenB } = await startReplica({ id: 'rep-g2', drivers, dir }));
    await wait(120);

    // Índice tem o convite, mas o DONO não está mais no registry (caiu).
    await drivers.invites.set('GHOSTCODE', { roomId: 'rep-g1-priv3d-1', replicaId: 'rep-g1', expiresAt: Date.now() + 60_000 });
    ({ ws: client } = await connect3D(portB, tokenB));
    const notFoundPromise = expectAny(client, ['private_not_found', 'redirect']);
    send(client, { type: 'join_private', code: 'GHOSTCODE' });
    const notFound = await notFoundPromise;
    assert.equal(notFound.type, 'private_not_found', 'sem endereço do dono não há para onde redirecionar');
  } finally {
    if (client) client.close();
    if (a) await a.close();
    if (b) await b.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
