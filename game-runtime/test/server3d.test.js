// Khaaos Run — Teste de integração do servidor autoritativo no modo 3D:
// login HTTP, matchmaking mode=3d, partida com inputs reais via WebSocket,
// snapshots autoritativos, ping/pong e rejeição do anti-cheat.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import { createAuthoritativeServer } from '../server/server.js';
import { DurableJsonStore } from '../server/store.js';
import { SharedMemoryRateStore } from '../server/rateLimit.js';

const DT = 1 / 20;

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function waitFor(fn, timeoutMs = 5000, step = 25) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const value = fn();
    if (value) return value;
    await wait(step);
  }
  throw new Error(`waitFor esgotou (${timeoutMs}ms)`);
}

function connect(port, token, mode = '3d') {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${encodeURIComponent(token)}&mode=${mode}`);
  const state = { messages: [], snapshots: [], closed: null };
  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    state.messages.push(msg);
    if (msg.type === 'snapshot') state.snapshots.push(msg.snapshot);
  });
  ws.on('close', (code) => { state.closed = code; });
  return { ws, state };
}

const blank3D = (seq, over = {}) => ({ seq, dx: 0, dy: 0, yaw: 0, pitch: 0, fire: false, ads: false, sprint: false, jump: false, interact: false, reload: false, medkit: false, slot: 0, clientDt: DT, ...over });

test('server 3D end-to-end: login → matchmaking → partida → snapshots → anticheat', async () => {
  process.env.KR_DEV_AUTH = '1'; // provisiona kr_player/kr123 para o teste
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kr-3d-'));
  const app = createAuthoritativeServer({
    port: 0,
    roomCapacity: 16,
    store: new DurableJsonStore(path.join(dir, 'state.json')),
    rateStore: new SharedMemoryRateStore(),
  });
  await new Promise((resolve) => app.server.listen(0, resolve));
  const port = app.server.address().port;

  try {
    // ---- login via KR_DEV_AUTH ----
    const login = await fetch(`http://127.0.0.1:${port}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'kr_player', password: 'kr123' }),
    });
    assert.equal(login.status, 200);
    const { token } = await login.json();
    assert.ok(token);

    // login inválido falha
    const bad = await fetch(`http://127.0.0.1:${port}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'kr_player', password: 'errado' }),
    });
    assert.equal(bad.status, 401);

    // ---- WS sem token é rejeitado ----
    const anon = connect(port, '', '3d');
    await new Promise((r) => anon.ws.on('open', r));
    await waitFor(() => anon.state.closed === 4001);

    // ---- matchmaking 3D ----
    const c1 = connect(port, token, '3d');
    await new Promise((r) => c1.ws.on('open', r));
    const found = await waitFor(() => c1.state.messages.find((m) => m.type === 'match_found'));
    assert.equal(found.snapshot.mode, '3d');
    assert.equal(found.snapshot.player.name, 'kr_player');
    assert.equal(found.snapshot.state, 'LOBBY');
    assert.ok(found.resumeToken);

    // ---- ping/pong ----
    c1.ws.send(JSON.stringify({ type: 'ping', t: 123.5 }));
    const pong = await waitFor(() => c1.state.messages.find((m) => m.type === 'pong'));
    assert.equal(pong.t, 123.5);

    // ---- start + partida rodando ----
    c1.ws.send(JSON.stringify({ type: 'start', entry: 'belt' }));
    const inProgress = await waitFor(() => c1.state.snapshots.find((s) => s.state === 'IN_PROGRESS'));
    assert.equal(inProgress.started, true);
    assert.equal(inProgress.player.armor, 60);
    assert.ok(inProgress.others.filter((o) => o.isBot).length >= 14, 'bots preenchem o ring');

    // ---- movimento via inputs: jogador se desloca ----
    const z0 = inProgress.player.z;
    let seq = 1;
    const sender = setInterval(() => { c1.ws.send(JSON.stringify({ type: 'input', input: blank3D(seq++, { dy: -1 }) })); }, 50);
    const moved = await waitFor(() => {
      const latest = c1.state.snapshots.at(-1);
      return latest && latest.player && (z0 - latest.player.z) > 2 ? latest : null;
    }, 8000);
    clearInterval(sender);
    assert.ok(moved.player.z < z0 - 2, 'servidor aplicou movimento autoritativo');

    // ---- anti-cheat: seq repetida é rejeitada ----
    let rejected = null;
    c1.ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'rejected' && !rejected) rejected = msg;
    });
    c1.ws.send(JSON.stringify({ type: 'input', input: blank3D(1) })); // seq muito antiga
    await waitFor(() => rejected);

    // ---- snapshots monotônicos e eventos drenados ----
    const ticks = c1.state.snapshots.map((s) => s.tick);
    assert.deepEqual(ticks, [...ticks].sort((a, b) => a - b));

    // ---- cliente 2D continua funcionando em paralelo (isolamento por modo) ----
    const c2d = connect(port, token, '2d');
    await new Promise((r) => c2d.ws.on('open', r));
    const found2d = await waitFor(() => c2d.state.messages.find((m) => m.type === 'match_found'));
    assert.notEqual(found2d.snapshot.mode, '3d');
    assert.notEqual(found2d.roomId, found.roomId);

    // ---- healthz expõe salas 3D ----
    const health = await fetch(`http://127.0.0.1:${port}/healthz`).then((r) => r.json());
    assert.ok(health.rooms3d >= 1);

    c1.ws.close();
    c2d.ws.close();
  } finally {
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
}, { timeout: 20000 });
