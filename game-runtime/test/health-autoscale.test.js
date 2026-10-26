import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { DependencyHealth, createDependencyHealth, summarize } from '../server/health.js';
import { regionLoads, recommend, SCALE_DEFAULTS } from '../server/autoscale.js';
import { createAuthoritativeServer } from '../server/server.js';
import { AuthService, hashPassword } from '../server/auth.js';
import { DurableJsonStore } from '../server/store.js';
import { SharedMemoryRateStore } from '../server/rateLimit.js';

test('health: sonda mede latência real, marca falha e usa cache por TTL', async () => {
  const health = new DependencyHealth({
    checks: {
      fast: async () => { await new Promise((resolve) => setTimeout(resolve, 5)); return true; },
      broken: async () => { throw new Error('boom'); },
    },
    timeoutMs: 300,
  });
  const results = await health.probeAll({ force: true });
  assert.equal(results.fast.ok, true);
  assert.ok(results.fast.latencyMs >= 1, `latência medida: ${results.fast.latencyMs}`);
  assert.equal(results.broken.ok, false);
  assert.match(results.broken.error, /boom/);
  const summary = summarize(results);
  assert.equal(summary.ok, false);
  assert.equal(summary.checks.fast, true);
  assert.equal(summary.checks.broken, false);
  assert.match(summary.errors.broken, /boom/);
  // Sem force dentro do TTL: mesma instância de resultado (cache).
  const again = await health.probe('fast');
  assert.equal(again, results.fast);
});

test('health: dependência que não responde vira not_ok por probe_timeout', async () => {
  const health = new DependencyHealth({ checks: { slow: () => new Promise(() => {}) }, timeoutMs: 80 });
  const started = Date.now();
  const result = await health.probe('slow');
  assert.equal(result.ok, false);
  assert.match(result.error, /probe_timeout/);
  assert.ok(Date.now() - started < 2_000, 'sonda não pode travar o readiness');
});

test('health: monitor padrão conecta sessionStore/rateStore/auditStore', async () => {
  const sessionStore = new DurableJsonStore(path.join(os.tmpdir(), `kr-health-${Date.now()}.json`));
  const rateStore = new SharedMemoryRateStore();
  const auditStore = { ready: async () => true };
  const monitor = createDependencyHealth({ sessionStore, rateStore, auditStore });
  const results = await monitor.probeAll({ force: true });
  assert.deepEqual(Object.keys(results).sort(), ['auditStore', 'rateStore', 'sessionStore']);
  assert.equal(summarize(results).ok, true);
});

test('autoscale: carga por região, fila e recomendação determinística', () => {
  const rooms = new Map([
    ['a', { region: 'sa-east', players: new Map([1, 2, 3, 4].map((n) => [String(n), {}])), capacity: 4, mode: '3d' }],
    ['b', { region: 'sa-east', players: new Map([['5', {}]]), capacity: 4, mode: '3d' }],
    ['c', { region: 'eu-west', players: new Map([['6', {}]]), capacity: 16, mode: '2d' }],
  ]);
  const loads = regionLoads(rooms);
  const sa = loads.find((load) => load.region === 'sa-east');
  assert.equal(sa.rooms, 2);
  assert.equal(sa.players, 5);
  assert.equal(sa.playerSlots, 8);
  assert.ok(Math.abs(sa.utilization - 5 / 8) < 1e-9);
  // 62,5% está na banda saudável (30%–85%).
  assert.equal(recommend(sa), 'ok');
  // Saturação ≥ 85% dispara scale_out.
  assert.equal(recommend({ ...sa, players: 7, utilization: 7 / 8 }), 'scale_out');
  // Fila global cai na região mais cheia e força scale_out.
  const queued = regionLoads(rooms, { queue: 3 }).find((load) => load.region === 'sa-east');
  assert.equal(queued.queue, 3);
  assert.equal(recommend(queued), 'scale_out');
  // Região ociosa com salas abertas e sem fila → scale_in.
  assert.equal(recommend({ region: 'us-east', rooms: 2, players: 1, playerSlots: 32, utilization: 1 / 32, queue: 0 }), 'scale_in');
  // Sem salas, sem slots e com fila → scale_out (demanda sem provisionamento).
  assert.equal(recommend({ region: 'us-east', rooms: 0, players: 0, playerSlots: 0, utilization: 0, queue: 2 }), 'scale_out');
  assert.equal(Object.isFrozen(SCALE_DEFAULTS), true);
});

test('healthz/readyz/ping/regions: ponta a ponta com gate de saturação', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kr-health-'));
  const auth = new AuthService({ secret: 'health-secret', users: [{ id: 'u1', username: 'load', role: 'player', region: 'sa-east', passwordHash: hashPassword('pass', 'salt') }] });
  const app = createAuthoritativeServer({
    port: 0, roomCapacity: 1, auth,
    store: new DurableJsonStore(path.join(dir, 'state.json')),
    rateStore: new SharedMemoryRateStore(),
    adminToken: 'legacy',
    readyGate: { maxConnections: 2 },
  });
  await new Promise((resolve) => app.server.listen(0, resolve));
  const port = app.server.address().port;
  const token = auth.login('load', 'pass').token;
  const sockets = [];
  try {
    // Instância vazia: readiness 200 com sondas reais e latência medida.
    const ready = await fetch(`http://127.0.0.1:${port}/readyz`);
    assert.equal(ready.status, 200);
    const readyBody = await ready.json();
    assert.equal(readyBody.status, 'ready');
    assert.equal(readyBody.checks.sessionStore, true);
    assert.equal(readyBody.checks.rateStore, true);
    assert.equal(typeof readyBody.latencyMs.sessionStore, 'number');
    assert.equal(readyBody.load.maxConnections, 2);

    // healthz público expõe resumo regional agregado (sem dados por usuário).
    const healthz = await fetch(`http://127.0.0.1:${port}/healthz`).then((r) => r.json());
    assert.equal(healthz.regions.length, 3);
    assert.ok(healthz.regions.every((region) => ['scale_out', 'scale_in', 'ok'].includes(region.recommendation)));
    assert.equal(typeof healthz.backpressure, 'number');

    // Ping real de dependências (admin): sondas forçadas com latência.
    const ping = await fetch(`http://127.0.0.1:${port}/admin/ping?token=legacy`).then((r) => r.json());
    assert.equal(ping.ok, true);
    assert.equal(ping.dependencies.sessionStore.ok, true);
    assert.ok(ping.dependencies.rateStore.latencyMs >= 0);

    // 3 conexões em capacidade 1: 3 salas cheias, conexões > gate → overload 503.
    for (let i = 0; i < 3; i += 1) {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${token}`);
      sockets.push(ws);
      await new Promise((resolve, reject) => {
        ws.on('message', (raw) => { if (JSON.parse(raw).type === 'match_found') resolve(); });
        ws.on('error', reject);
      });
    }
    const overloaded = await fetch(`http://127.0.0.1:${port}/readyz`);
    assert.equal(overloaded.status, 503);
    assert.equal((await overloaded.json()).status, 'overload');

    // sa-east com 3 salas cheias (100%) → scale_out no endpoint admin.
    const regions = await fetch(`http://127.0.0.1:${port}/admin/regions?token=legacy`).then((r) => r.json());
    const sa = regions.regions.find((region) => region.region === 'sa-east');
    assert.equal(sa.rooms, 3);
    assert.equal(sa.players, 3);
    assert.equal(sa.recommendation, 'scale_out');
    assert.deepEqual(regions.thresholds, SCALE_DEFAULTS);

    // Gate sem autenticação não é acessível (403 via RBAC).
    const denied = await fetch(`http://127.0.0.1:${port}/admin/ping`);
    assert.equal(denied.status, 403);
  } finally {
    for (const ws of sockets) { try { ws.close(); } catch {} }
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
