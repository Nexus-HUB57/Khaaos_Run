// Khaaos Run — M3: multiplayer distribuído e SRE.
// Aceite do milestone, com evidência EXECUTADA:
//   1. Duas réplicas provam owner ÚNICO por sala e rejeitam fencing antigo.
//   2. Reconnect mantém ordem (seq monotônica) e NÃO duplica jogadores —
//      réplica sem a sala redireciona ao dono vivo em vez de realocar.
//   3. Relay entre réplicas: seq monotônica, deduplicação, replay LIMITADO
//      (MAXLEN) e TTL cleanup (sem crescimento indefinido).
//   4. Readiness falha (503/not_ready) quando uma dependência necessária cai.
//   5. AOI fan-out: snapshot por observador com histerese (enter/exit) e
//      aliveCount autoritativo independente do recorte.
// Drivers Redis ganham teste de paridade opt-in (REDIS_URL presente).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { createAuthoritativeServer } from '../server/server.js';
import { AuthService, hashPassword } from '../server/auth.js';
import { DurableJsonStore } from '../server/store.js';
import { SharedMemoryRateStore } from '../server/rateLimit.js';
import {
  MemoryOwnership, MemoryRelay, MemoryReplicaRegistry, RelayConsumer,
  createDistributed, RedisOwnership, RedisRelay,
} from '../server/distributed.js';
import { MatchRoom3D, AOI_ENTER_M, AOI_EXIT_M, AOI_PROJECTILE_M } from '../server/room3d.js';
import { createDependencyHealth } from '../server/health.js';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function expectMessage(ws, type) {
  return new Promise((resolve, reject) => {
    const onMessage = (raw) => {
      const message = JSON.parse(raw);
      if (message.type === type) { ws.off('message', onMessage); resolve(message); }
    };
    ws.on('message', onMessage);
    ws.once('error', reject);
  });
}

function collect(ws, types, sink) {
  ws.on('message', (raw) => {
    const message = JSON.parse(raw);
    if (types.includes(message.type)) sink.push(message);
  });
}

const makeAuth = () => new AuthService({
  secret: 'm3-secret',
  users: [{ id: 'u1', username: 'dist', role: 'player', region: 'sa-east', passwordHash: hashPassword('pass', 'salt') }],
});

// ─── 1) Owner único + fencing antigo rejeitado (registry compartilhado) ──────
test('M3: duas réplicas disputam a sala — owner único, epoch monotônico e fencing antigo rejeitado', async () => {
  const shared = new MemoryOwnership();
  const a = createDistributed({ enabled: true, replicaId: 'rep-a', ownership: shared, ttlMs: 40, heartbeatMs: 1000 });
  const b = createDistributed({ enabled: true, replicaId: 'rep-b', ownership: shared, ttlMs: 40, heartbeatMs: 1000 });

  const first = await a.acquire('room-x');
  assert.ok(first.owned, 'primeira réplica assume a posse');
  const second = await b.acquire('room-x');
  assert.equal(second.owned, false, 'dono único: segunda réplica NÃO assume');
  assert.equal(second.owner, 'rep-a');

  // Mutação do dono legítimo passa; fence válido.
  assert.equal((await a.guard('room-x')).ok, true);

  // Partição: A para de renovar, lease expira, B assume com epoch+1.
  await wait(80);
  const takeover = await b.acquire('room-x');
  assert.ok(takeover.owned, 'pós-expiração a réplica B assume');
  assert.equal(takeover.fence, first.fence + 1, 'epoch monotônico: takeover incrementa o fence');

  // Fencing ANTIGO: A (com o fence velho) é REJEITADA e a sala congela.
  const stale = await a.guard('room-x');
  assert.equal(stale.ok, false, 'fence antigo não muta');
  assert.equal(stale.reason, 'fencing_violation');
  assert.ok(a.isFrozen('room-x'), 'sala do dono antigo congela (owner_lost)');

  // Dono novo continua mutando normalmente.
  assert.equal((await b.guard('room-x')).ok, true);

  // Release condicional: só o dono com o fence atual libera.
  assert.equal(await a.release('room-x'), false, 'fence velho não libera');
  assert.equal(await b.release('room-x'), true);
  await a.stop(); await b.stop();
});

// ─── 2) Reconnect entre réplicas: redireciona ao dono, sem duplicar jogador ──
test('M3: reconnect em réplica sem a sala → redirect ao dono; no dono a sessão retoma sem duplicar', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kr-m3-'));
  const file = path.join(dir, 'shared.json');
  const auth = makeAuth();
  const sharedOwn = new MemoryOwnership();
  const sharedReg = new MemoryReplicaRegistry();
  // Backend de sessão COMPARTILHADO (uma instância = simulacro do Redis/PG de
  // staging; com backend real cada processo tem a sua view do MESMO registro).
  const sharedStore = new DurableJsonStore(file);
  const mk = (replicaId) => createAuthoritativeServer({
    port: 0, auth,
    store: sharedStore, rateStore: new SharedMemoryRateStore(), adminToken: 'legacy',
    distributed: createDistributed({
      enabled: true, replicaId, ownership: sharedOwn, registry: sharedReg,
      relay: new MemoryRelay(), ttlMs: 15_000, heartbeatMs: 200,
    }),
  });
  const repA = mk('m3-rep-a');
  const repB = mk('m3-rep-b');
  await Promise.all([
    new Promise((r) => repA.server.listen(0, r)),
    new Promise((r) => repB.server.listen(0, r)),
  ]);
  const portA = repA.server.address().port;
  const portB = repB.server.address().port;
  // Réplicas se anunciam (o registry precisa do endereço p/ redirecionar).
  await sharedReg.register('m3-rep-a', `ws://127.0.0.1:${portA}`, 15_000);
  await sharedReg.register('m3-rep-b', `ws://127.0.0.1:${portB}`, 15_000);
  const token = auth.login('dist', 'pass').token;

  try {
    // Jogador entra na réplica A → sala vive em A (id com prefixo da réplica).
    const first = new WebSocket(`ws://127.0.0.1:${portA}/ws?token=${token}&mode=3d`);
    const found = await expectMessage(first, 'match_found');
    assert.ok(found.roomId.startsWith('m3-rep-a-'), 'id de sala globalmente único (prefixo da réplica)');
    first.close();
    await wait(80); // close persiste a sessão com janela de retomada

    // Reconecta na réplica B: a sala NÃO vive aqui → REDIRECT (não realoca).
    const wrongReplica = new WebSocket(`ws://127.0.0.1:${portB}/ws?token=${token}&mode=3d&resume=${found.resumeToken}`);
    const redirect = await expectMessage(wrongReplica, 'redirect');
    assert.equal(redirect.roomId, found.roomId);
    assert.equal(redirect.to, `ws://127.0.0.1:${portA}`, 'redireciona ao dono vivo');
    wrongReplica.close();

    // Reconecta na réplica A (dono): retoma o MESMO client-id na MESMA sala.
    const again = new WebSocket(`ws://127.0.0.1:${portA}/ws?token=${token}&mode=3d&resume=${found.resumeToken}`);
    const resumed = await expectMessage(again, 'resumed');
    assert.equal(resumed.roomId, found.roomId, 'mesma sala — sem duplicação de sala');
    assert.ok(resumed.snapshot?.player, 'ator retomado presente no snapshot');
    const room = repA.rooms.get(found.roomId);
    assert.equal(room.players.size, 1, 'UM único humano na sala (jogador não duplicado)');

    // Ordem: inputs com seq crescente após o resume → ackSeq monotônico.
    again.send(JSON.stringify({ type: 'start' })); // sala retomada no LOBBY — abre o ring
    await wait(100);
    const acks = [];
    for (let seq = 1; seq <= 5; seq++) {
      again.send(JSON.stringify({ type: 'input', input: { seq, dx: 0, dy: 1, yaw: 0, pitch: 0, fire: false, interact: false } }));
      await wait(60);
      acks.push(room.snapshot(resumed.id).player?.ackSeq ?? 0);
    }
    const monotonic = acks.every((v, i) => i === 0 || v >= acks[i - 1]);
    assert.ok(monotonic, `ackSeq monotônico pós-resume (=${acks.join(',')})`);
    assert.ok(acks[acks.length - 1] >= 5, 'servidor processou os inputs pós-resume');
    again.close();

    // Fencing no caminho do servidor: dono que perde a posse congela a sala e
    // para de mutar (owner_lost) — o epoch novo sempre vence.
    const before = room.tickCount;
    // Partição simulada: posse de A expira e B assume com epoch+1 (determinístico
    // — a expiração e o takeover acontecem no mesmo bloco síncrono de microtask,
    // antes do próximo heartbeat de 200ms de A).
    const entry = sharedOwn.map.get(found.roomId);
    entry.expiresAt = Date.now() - 1;
    const takeover = await repB.distributed.acquire(found.roomId);
    assert.ok(takeover.owned, 'réplica B assume pós-expiração');
    assert.ok(takeover.fence > room.fence, 'epoch monotônico no takeover do servidor');
    const guardResult = await repA.distributed.guard(found.roomId);
    assert.equal(guardResult.ok, false, 'guard rejeita mutação após takeover');
    await wait(150); // tick do servidor percebe o freeze
    assert.ok(repA.distributed.isFrozen(found.roomId), 'sala congelada no dono antigo');
    assert.ok(room.tickCount - before <= 3, 'sala congelada quase não avança ticks');
  } finally {
    await repA.close(); await repB.close();
  }
});

// ─── 3) Relay: seq monotônica, dedup, replay limitado, TTL ───────────────────
test('M3: relay entre réplicas — ordem monotônica, dedup, replay limitado (MAXLEN) e TTL', async () => {
  const relay = new MemoryRelay({ maxlen: 3, ttlMs: 60 });
  const consumer = new RelayConsumer();

  const e1 = relay.publish('room-1', 'room_open', {});
  const e2 = relay.publish('room-1', 'match_end', { players: 8 });
  assert.deepEqual([e1.seq, e2.seq], [1, 2], 'seq monotônica por sala');

  let batch = relay.read('room-1', 0);
  assert.equal(consumer.feed(batch).length, 2);
  // Replay: os MESMOS eventos de novo → dedup, nada aplicado duas vezes.
  batch = relay.read('room-1', 0);
  consumer.feed(batch);
  assert.equal(consumer.duplicates, 2, 'replay é deduplicado');
  assert.equal(consumer.applied, 2);

  // Gap: consumidor salta p/ frente e conta a perda — ordem nunca regrede.
  const jumped = relay.publish('room-1', 'room_open', {});
  consumer.feed([{ ...jumped, seq: jumped.seq + 2 }]); // perdeu 2 no meio
  assert.equal(consumer.gaps, 2);
  assert.ok(consumer.lastSeq >= jumped.seq + 2);

  // Replay limitado: maxlen=3 → só os 3 últimos permanecem (seq 5,6,7).
  for (let i = 0; i < 4; i++) relay.publish('room-1', 'pulse', { i });
  const tail = relay.read('room-1', 0);
  assert.equal(tail.length, 3, 'MAXLEN limita o replay');
  assert.equal(tail[0].seq, 5, 'mais antigo descartado (stream curto)');

  // TTL: eventos velhos expiram — sem crescimento indefinido.
  await wait(80);
  assert.deepEqual(relay.read('room-1', 0), [], 'TTL limpa o stream');
});

// ─── 4) Readiness falha com dependência necessária indisponível ──────────────
test('M3: /readyz responde 503 not_ready quando a dependência necessária está indisponível', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kr-m3-ready-'));
  const deadStore = {
    ready: async () => { throw new Error('redis_down'); },
    incr: async () => ({ allowed: true, count: 0, remaining: 0, resetAt: Date.now() + 1000 }),
    close: async () => {},
  };
  const app = createAuthoritativeServer({
    port: 0,
    auth: makeAuth(),
    store: new DurableJsonStore(path.join(dir, 'state.json')),
    rateStore: deadStore,
    adminToken: 'legacy',
  });
  app.ready.catch(() => {}); // dependência morta rejeita o ready de boot — é a semântica esperada
  await new Promise((r) => app.server.listen(0, r));
  try {
    const res = await fetch(`http://127.0.0.1:${app.server.address().port}/readyz`);
    assert.equal(res.status, 503);
    const body = await res.json();
    assert.equal(body.status, 'not_ready');
    assert.equal(body.checks.rateStore, false);
    assert.match(String(body.errors.rateStore), /redis_down/);
    // Liveness continua OK (readiness ≠ liveness).
    const live = await fetch(`http://127.0.0.1:${app.server.address().port}/healthz`);
    assert.equal(live.status, 200);
  } finally {
    await app.close();
  }
});

// ─── 5) AOI fan-out: histerese enter/exit + aliveCount autoritativo ──────────
test('M3: AOI — snapshot por observador recorta por distância com histerese e mantém aliveCount global', async () => {
  const room = new MatchRoom3D({ id: 'aoi-room', seed: 'AOI-SEED', capacity: 8, botFill: 0, aoi: true, airdrop: false });
  room.addPlayer('p1', 'viewer');
  room.addPlayer('p2', 'far');
  room.start('p1');
  const p1 = room.humans.get('p1');
  const p2 = room.humans.get('p2');
  p1.x = 0; p1.z = 0;
  p2.x = 50; p2.z = 0; // DENTRO do raio de entrada

  const near = room.snapshot('p1');
  assert.ok(near.others.some((o) => o.id === 'p2'), 'ator a 50m entra no recorte');
  assert.equal(near.aliveCount, 2, 'aliveCount é GLOBAL (não recortado)');

  // Afasta para a banda de histerese: entra em 130, só sai em 165.
  p2.x = AOI_ENTER_M + 5; p2.z = 0;
  const band = room.snapshot('p1');
  assert.ok(band.others.some((o) => o.id === 'p2'), 'ator já visível só sai em AOI_EXIT (histerese)');

  // Além do exit: sai do recorte.
  p2.x = AOI_EXIT_M + 20; p2.z = 0;
  const far = room.snapshot('p1');
  assert.ok(!far.others.some((o) => o.id === 'p2'), 'ator além do raio de saída é recortado');
  assert.equal(far.aliveCount, 2, 'aliveCount continua global mesmo recortado');

  // Volta para dentro: reaparece (cliente recria o mesh por id — preexistente).
  p2.x = 40; p2.z = 0;
  assert.ok(room.snapshot('p1').others.some((o) => o.id === 'p2'));

  // AOI desligada: snapshot completo (comportamento canônico preservado).
  const plain = new MatchRoom3D({ id: 'no-aoi', seed: 'AOI-SEED-2', capacity: 8, botFill: 0, airdrop: false });
  plain.addPlayer('p1', 'viewer');
  plain.addPlayer('p2', 'far');
  const full = plain.snapshot('p1');
  assert.ok(full.others.length >= 1, 'sem AOI: todos os atores no snapshot');
});

// ─── 6) Paridade do driver Redis (opt-in: exige REDIS_URL real) ──────────────
test('M3: paridade Redis — ownership/relay com as mesmas semânticas do driver de memória', { skip: !process.env.REDIS_URL && !process.env.KR_REDIS_URL ? 'opt-in infra: REDIS_URL ausente' : false }, async () => {
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const { createClient } = require('redis');
  const client = createClient({ url: process.env.KR_REDIS_URL || process.env.REDIS_URL });
  await client.connect();
  try {
    const prefix = `m3test:${Date.now()}`;
    const own = new RedisOwnership(client);
    const a = await own.acquire(`${prefix}:room`, 'rep-a', 5_000);
    assert.ok(a.owned);
    const b = await own.acquire(`${prefix}:room`, 'rep-b', 5_000);
    assert.equal(b.owned, false);
    assert.equal(b.owner, 'rep-a');
    assert.ok(await own.verify(`${prefix}:room`, 'rep-a', a.fence));
    assert.ok(!(await own.verify(`${prefix}:room`, 'rep-b', b.fence ?? a.fence)));
    assert.ok(await own.release(`${prefix}:room`, 'rep-a', a.fence));

    const relay = new RedisRelay(client, { maxlen: 4, ttlMs: 60 });
    const e1 = await relay.publish(`${prefix}:stream`, 't1', { n: 1 });
    const e2 = await relay.publish(`${prefix}:stream`, 't2', { n: 2 });
    assert.equal(e2.seq, e1.seq + 1);
    const read = await relay.read(`${prefix}:stream`, 0);
    assert.equal(read.length, 2);
    assert.deepEqual(read.map((e) => e.seq).sort((x, y) => x - y), [e1.seq, e2.seq]);
    await relay.reset(`${prefix}:stream`);
    assert.deepEqual(await relay.read(`${prefix}:stream`, 0), []);
  } finally {
    await client.quit();
  }
});

// ─── 7) Relay mirror entre réplicas (regressão do espelho global) ────────────
// O publish escreve no stream POR SALA e no stream GLOBAL '__global__'; o
// mirrorLoop de cada réplica consome o global. Sem isso o relay entre réplicas
// é inerte (mirrorApplied eternamente 0) — bug provado ao vivo pelo smoke
// cross-replica (2 processos + Redis real) e pinado aqui de forma determinística.
test('M3: relay mirror — room_open da réplica A chega ao espelho da réplica B (mirrorApplied > 0)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kr-m3-mirror-'));
  const file = path.join(dir, 'shared.json');
  const auth = makeAuth();
  const sharedOwn = new MemoryOwnership();
  const sharedReg = new MemoryReplicaRegistry();
  const sharedRelay = new MemoryRelay({ maxlen: 512, ttlMs: 60_000 });
  const mk = (replicaId, address) => createAuthoritativeServer({
    port: 0, auth,
    store: new DurableJsonStore(file), rateStore: new SharedMemoryRateStore(), adminToken: 'legacy',
    distributed: createDistributed({
      enabled: true, replicaId, address, ownership: sharedOwn, registry: sharedReg,
      relay: sharedRelay, ttlMs: 15_000, heartbeatMs: 200, mirrorMs: 50,
    }),
  });
  const repA = mk('m3-mirror-a', 'ws://127.0.0.1:1');
  const repB = mk('m3-mirror-b', 'ws://127.0.0.1:2');
  await Promise.all([
    new Promise((r) => repA.server.listen(0, r)),
    new Promise((r) => repB.server.listen(0, r)),
  ]);
  try {
    await repA.distributed.start();
    await repB.distributed.start();
    const token = auth.login('dist', 'pass').token;
    const ws = new WebSocket(`ws://127.0.0.1:${repA.server.address().port}/ws?token=${token}&mode=3d`);
    const found = await expectMessage(ws, 'match_found');
    ws.close();

    // O mirror da réplica B (mirrorMs 50ms) consome o stream global publicado
    // pela réplica A — em segundos, mirrorApplied > 0 em B.
    const deadline = Date.now() + 3_000;
    let mirrorB = 0;
    while (Date.now() < deadline) {
      mirrorB = repB.distributed.metrics.mirrorApplied;
      if (mirrorB > 0) break;
      await wait(60);
    }
    assert.ok(mirrorB > 0, `espelho da réplica B aplicou eventos do relay (mirrorApplied=${mirrorB})`);
    assert.ok(repB.distributed.metrics.fenceViolations === 0, 'sem violações de fence no caminho feliz');
    assert.equal(repA.rooms.has(found.roomId), true, 'sala continua no dono A');
  } finally {
    await repA.close();
    await repB.close();
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* tmp */ }
  }
});
