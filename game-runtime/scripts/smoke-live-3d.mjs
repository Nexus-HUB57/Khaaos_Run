// Smoke test ao vivo: servidor autoritativo em :8787 + 2 clientes 3D jogando
// contra bots por ~15s — valida snapshots, eventos de combate e killfeed reais.
import { WebSocket } from 'ws';

const PORT = 8790;
const DT = 1 / 20;
const stats = { c1: { snaps: 0, events: {}, last: null }, c2: { snaps: 0, events: {}, last: null } };

function track(client, msg) {
  const s = stats[client];
  if (msg.type === 'snapshot') {
    s.snaps++;
    s.last = msg.snapshot;
    for (const e of msg.snapshot.events ?? []) s.events[e.type] = (s.events[e.type] || 0) + 1;
  }
}

const blank = (seq, over = {}) => ({ seq, dx: 0, dy: 0, yaw: 0, pitch: 0, fire: false, ads: false, sprint: false, jump: false, interact: false, reload: false, medkit: false, slot: 0, clientDt: DT, ...over });

async function login() {
  const r = await fetch(`http://127.0.0.1:${PORT}/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'kr_player', password: 'kr123' }),
  });
  if (!r.ok) throw new Error('login falhou ' + r.status);
  return (await r.json()).token;
}

function client(token, name, onMsg) {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?token=${token}&mode=3d`);
  let seq = 0;
  ws.on('message', (raw) => { const m = JSON.parse(raw.toString()); onMsg(m); if (m.type === 'match_found') { ws.__id = m.id; } });
  ws.sendInput = (over) => ws.send(JSON.stringify({ type: 'input', input: blank(++seq, over) }));
  ws.startMatch = (entry) => ws.send(JSON.stringify({ type: 'start', entry }));
  return ws;
}

// ---- bootstrap ----
process.env.KR_DEV_AUTH = '1';
const { createAuthoritativeServer } = await import('../server/server.js');
const { DurableJsonStore } = await import('../server/store.js');
const { SharedMemoryRateStore } = await import('../server/rateLimit.js');
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kr-live-'));
const app = createAuthoritativeServer({ port: PORT, store: new DurableJsonStore(path.join(dir, 's.json')), rateStore: new SharedMemoryRateStore() });
await new Promise((r) => app.server.listen(PORT, r));
console.log('[live] servidor em', PORT);

const token = await login();
console.log('[live] login ok');

let done;
const finished = new Promise((r) => { done = r; });

const c1 = client(token, 'c1', (m) => track('c1', m));
const c2 = client(token, 'c2', (m) => track('c2', m));
await Promise.all([
  new Promise((r, j) => { c1.on('open', r); c1.on('error', j); }),
  new Promise((r, j) => { c2.on('open', r); c2.on('error', j); }),
]);
await new Promise((r) => setTimeout(r, 300));
console.log('[live] clientes conectados — c1 sala:', stats.c1.last?.roomId, '| c2 sala:', stats.c2.last?.roomId);

c1.startMatch('belt');
c2.startMatch('rush');

// loop de jogo 15s: c1 avança e gira atirando; c2 avança e coleta
const t0 = Date.now();
const gameTimer = setInterval(() => {
  const t = (Date.now() - t0) / 1000;
  c1.sendInput({ dy: -1, yaw: t * 0.8, fire: t > 2, sprint: t < 2 });
  c2.sendInput({ dy: -0.6, dx: Math.sin(t * 1.3) * 0.7, yaw: -t * 0.5, fire: t > 4 });
  if (t >= 15) {
    clearInterval(gameTimer);
    done();
  }
}, 50);

await finished;

const s1 = stats.c1.last, s2 = stats.c2.last;
console.log('\n[live] RESULTADO');
console.log('c1: snapshots', stats.c1.snaps, '| eventos', JSON.stringify(stats.c1.events));
console.log('c2: snapshots', stats.c2.snaps, '| eventos', JSON.stringify(stats.c2.events));
console.log('c1 estado: vida', Math.round(s1.player.life), 'armor', Math.round(s1.player.armor), 'kills', s1.player.kills, 'pos', s1.player.x.toFixed(1), s1.player.z.toFixed(1), '| anel', s1.ring.pulse, Math.round(s1.ring.radius) + 'm', '| vivos', s1.aliveCount);
console.log('c2 estado: vida', Math.round(s2.player.life), 'kills', s2.player.kills, '| anel', s2.ring.pulse);
console.log('bullets em voo (c1 view):', s1.bullets.length, '| loot restante:', s1.loot.filter((l) => l.active).length);

const ok = stats.c1.snaps > 200 && stats.c2.snaps > 200 && (stats.c1.events.shot || 0) > 0 && (stats.c1.events.hurt || stats.c2.events.hurt || 0) >= 0;
console.log(ok ? '[live] SMOKE_OK' : '[live] SMOKE_FRACO');

c1.close(); c2.close();
await app.close();
fs.rmSync(dir, { recursive: true, force: true });
process.exit(ok ? 0 : 1);
