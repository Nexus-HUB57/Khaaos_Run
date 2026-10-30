// Smoke ZU — trem do ZU sincronizado pelo servidor (Fase 12) end to end:
// servidor real em :8795 + 2 clientes WS → matchmaking → start →
//   [1] matchStart carrega train { startedAt (epoch do servidor), durationMs }
//   [2] snapshots carregam o MESMO anúncio (reconexão/late-join)
//   [3] durationMs = TRAIN_INTRO_DURATION_MS (contrato compartilhado)
//   [4] elapsed calculado com estimateClockOffset/serverElapsedMs cai dentro
//       da janela reproduzível (grace) — o trem é tocado em TODOS os remotos.
import { WebSocket } from 'ws';
import { TRAIN_INTRO_DURATION_MS, TRAIN_INTRO_GRACE_MS, estimateClockOffset, serverElapsedMs } from '../src/shared/clock.js';

const PORT = 8795;
const found = { token: null, train: null };

function track(state, msg) {
  // matchStart trafega como EVENTO dentro do snapshot (fila per-human do room)
  for (const e of msg.snapshot?.events ?? []) {
    if (e.type === 'matchStart') {
      state.train = e.train ?? null;
      state.matchStartAt = Date.now();
    }
  }
  if (msg.type === 'snapshot' && msg.snapshot?.train) state.snapTrain = msg.snapshot.train;
}

const blank = (seq, over = {}) => ({ seq, dx: 0, dy: 0, yaw: 0, pitch: 0, fire: false, ads: false, sprint: false, jump: false, interact: false, reload: false, medkit: false, slot: 0, clientDt: 1 / 20, ...over });

async function login() {
  const r = await fetch(`http://127.0.0.1:${PORT}/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'kr_player', password: 'kr123' }),
  });
  if (!r.ok) throw new Error('login falhou ' + r.status);
  return (await r.json()).token;
}

function client(token, state) {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?token=${token}&mode=3d`);
  ws.on('message', (raw) => { const m = JSON.parse(raw.toString()); track(state, m); if (m.type === 'match_found') ws.send(JSON.stringify({ type: 'start', entry: 'belt' })); });
  return ws;
}

process.env.KR_DEV_AUTH = '1';
const { createAuthoritativeServer } = await import('../server/server.js');
const { DurableJsonStore } = await import('../server/store.js');
const { SharedMemoryRateStore } = await import('../server/rateLimit.js');
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kr-zu-'));
const app = createAuthoritativeServer({ port: PORT, store: new DurableJsonStore(path.join(dir, 's.json')), rateStore: new SharedMemoryRateStore() });
await new Promise((r) => app.server.listen(PORT, r));
console.log('[zu] servidor em', PORT);

const token = await login();
console.log('[zu] login ok');

const states = { c1: {}, c2: {} };
const c1 = client(token, states.c1);
const c2 = client(token, states.c2); // mesmo token — sala compartilhada (padrão do smoke-live-3d)
await Promise.all([
  new Promise((r, j) => { c1.on('open', r); c1.on('error', j); }),
  new Promise((r, j) => { c2.on('open', r); c2.on('error', j); }),
]);

// aguarda matchStart + primeiros snapshots (partida real contra bots)
const t0 = Date.now();
let seq = 0;
const inputTimer = setInterval(() => {
  try { c1.send(JSON.stringify({ type: 'input', input: blank(++seq) })); c2.send(JSON.stringify({ type: 'input', input: blank(++seq) })); } catch { }
}, 50);
let snapsSeen = 0;
while (Date.now() - t0 < 12000) {
  if (states.c1.train && states.c1.snapTrain && states.c2.train) break;
  await new Promise((r) => setTimeout(r, 200));
}
clearInterval(inputTimer);
console.log(`[zu] diag: c1.train=${!!states.c1.train} c1.snapTrain=${!!states.c1.snapTrain} c2.train=${!!states.c2.train} t=${Date.now() - t0}ms`);
if (!states.c1.train || !states.c1.snapTrain || !states.c2.train) {
  console.error('SMOKE_ZU_FALHOU — anúncio do trem não chegou aos remotos');
  c1.close(); c2.close(); app.server.close();
  process.exit(1);
}

const assert = (cond, label) => { if (!cond) throw new Error('FALHOU: ' + label); console.log('[zu] ok —', label); };

assert(!!states.c1.train, 'matchStart.c1 carrega train (anúncio autoritativo)');
assert(!!states.c2.train, 'matchStart.c2 carrega train (2º remoto recebe o MESMO anúncio)');
assert(!!states.c1.snapTrain, 'snapshot carrega train (reconexão/late-join)');
assert(Number.isFinite(states.c1.train.startedAt) && states.c1.train.startedAt > t0 - 5000, 'train.startedAt é epoch do servidor');
assert(states.c1.train.durationMs === TRAIN_INTRO_DURATION_MS, `durationMs = TRAIN_INTRO_DURATION_MS (${TRAIN_INTRO_DURATION_MS})`);
assert(states.c1.train.startedAt === states.c2.train.startedAt, 'ambos os remotos partilham o mesmo startedAt');
assert(states.c1.snapTrain.startedAt === states.c1.train.startedAt, 'snapshot.train ≡ matchStart.train');

// relógio do cliente: offset estimado com ping simulado (rtt 60ms) → elapsed dentro da janela
const rtt = 60;
const offset = estimateClockOffset({ serverNow: states.c1.train.startedAt + 300, clientSentAt: states.c1.train.startedAt + 300 - rtt / 2, rtt });
const elapsed = serverElapsedMs(states.c1.train.startedAt, offset);
assert(Number.isFinite(elapsed) && elapsed > -500 && elapsed < TRAIN_INTRO_DURATION_MS + TRAIN_INTRO_GRACE_MS, `elapsed (${Math.round(elapsed)}ms) dentro da janela reproduzível do trem`);

c1.close(); c2.close();
app.server.close();
console.log('SMOKE_ZU_OK — trem do ZU anunciado, sincronizado e reproduzível nos 2 remotos');
process.exit(0);
