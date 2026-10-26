// Smoke test Fase 7: sala privada squad (DBNO) com 2 humanos via código de convite.
// Valida create_private → private_created (código) → join_private → mesma sala →
// partida squad → snapshots com knocked/squad → revive real entre humanos.
import { WebSocket } from 'ws';

const PORT = 8791;
const DT = 1 / 20;
const blank = (seq, over = {}) => ({ seq, dx: 0, dy: 0, yaw: 0, pitch: 0, fire: false, ads: false, sprint: false, jump: false, interact: false, reload: false, medkit: false, slot: 0, clientDt: DT, ...over });

function client(token, tag, onMsg) {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?token=${token}&mode=3d`);
  let seq = 0;
  const box = { messages: [], events: {} };
  ws.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    box.messages.push(m);
    if (m.type === 'match_found') ws.__id = m.id;
    if (m.type === 'snapshot') {
      box.snap = m.snapshot;
      for (const e of m.snapshot.events ?? []) box.events[e.type] = (box.events[e.type] || 0) + 1;
    }
    onMsg?.(m);
  });
  ws.sendInput = (over) => ws.send(JSON.stringify({ type: 'input', input: blank(++seq, over) }));
  ws.startMatch = (entry) => ws.send(JSON.stringify({ type: 'start', entry }));
  ws.box = box;
  return ws;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, timeoutMs = 6000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const v = fn();
    if (v) return v;
    await wait(25);
  }
  throw new Error('waitFor esgotou');
}

process.env.KR_DEV_AUTH = '1';
const { createAuthoritativeServer } = await import('../server/server.js');
const { DurableJsonStore } = await import('../server/store.js');
const { SharedMemoryRateStore } = await import('../server/rateLimit.js');
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kr-priv-'));
const app = createAuthoritativeServer({ port: PORT, store: new DurableJsonStore(path.join(dir, 's.json')), rateStore: new SharedMemoryRateStore() });
await new Promise((r) => app.server.listen(PORT, r));
console.log('[priv] servidor em', PORT);

const login = async () => {
  const r = await fetch(`http://127.0.0.1:${PORT}/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'kr_player', password: 'kr123' }),
  });
  if (!r.ok) throw new Error('login falhou ' + r.status);
  return (await r.json()).token;
};

let failed = false;
try {
  const tokenA = await login();
  const tokenB = await login();

  // A cria a sala privada
  const a = client(tokenA, 'A');
  await new Promise((r) => a.on('open', r));
  const code = await waitFor(() => new Promise((resolve) => {
    const on = (m) => { if (m.type === 'private_created') { a.off && a.removeListener('message', on); resolve(m.code); } };
    a.on('message', (raw) => on(JSON.parse(raw.toString())));
    a.send(JSON.stringify({ type: 'create_private' }));
  }));
  console.log('[priv] sala criada, código:', code);

  // B entra pelo código (case-insensitive com traço para testar normalize)
  const b = client(tokenB, 'B');
  await new Promise((r) => b.on('open', r));
  b.send(JSON.stringify({ type: 'join_private', code: code.toLowerCase().split('').join('-') }));
  const joined = await waitFor(() => b.box.messages.find((m) => m.type === 'private_joined'));
  console.log('[priv] B entrou na sala', joined.roomId);

  // Mesma sala? Ambos veem 2 humanos no snapshot
  await wait(400);
  const snapA = a.box.snap, snapB = b.box.snap;
  if (!snapA || !snapB) throw new Error('snapshots ausentes');
  console.log('[priv] squad A:', snapA.player.squad, '| squad B:', snapB.player.squad);
  if (snapA.player.squad !== snapB.player.squad) throw new Error('squads diferentes!');
  if (snapA.roomId !== snapB.roomId) throw new Error('salas diferentes!');
  if (!snapA.player.squad) throw new Error('sala privada deveria ter squads');

  // Código errado → private_not_found
  const c = client(tokenB, 'C');
  await new Promise((r) => c.on('open', r));
  c.send(JSON.stringify({ type: 'join_private', code: 'ZZZZZZ' }));
  await waitFor(() => c.box.messages.find((m) => m.type === 'private_not_found'));
  console.log('[priv] código inválido rejeitado (private_not_found) ✓');

  // Começa a partida squad (com bots)
  a.startMatch('belt');
  await wait(1500);
  const live = a.box.snap;
  if (!live || live.state !== 'IN_PROGRESS') throw new Error('partida não iniciou');
  const bots = live.others.filter((o) => o.isBot).length;
  console.log(`[priv] partida squad ativa: ${live.aliveCount} vivos (${bots} bots), room ${live.roomId}`);

  // Joga: drena vida do A de forma determinística (setup autoritativo direto na
  // sala: fora do anel + vida mínima) → ring derruba; B reviver via input interact.
  a.sendInput({ dx: 0, dy: -1 });
  const room = app.rooms.get(live.roomId);
  if (!room) throw new Error('sala não encontrada no servidor');
  const actorA = room.humans.get(a.__id);
  const actorB = room.humans.get(b.__id);
  actorA.armor = 0;
  actorA.life = 0.5;
  actorA.x = 195; actorA.z = 0; // fora do anel (r=170) → dano do ring
  let knockedSeen = false, revivedSeen = false, killfeedKnock = false;
  for (let i = 0; i < 80; i++) {
    a.sendInput({});
    await wait(50);
    if (actorA.knocked) { knockedSeen = true; break; }
  }
  if (!knockedSeen) throw new Error('nocaute autoritativo não ocorreu');
  console.log('[priv] A nocauteado (DBNO) ✓ — knockT', actorA.knockT.toFixed(1) + 's');
  // sai da zona letal NO MESMO tick JS (caído sob dano do ring = morte, comportamento correto)
  actorA.x = 60; actorA.z = 0;

  // B ao lado de A e segura E para reviver (inputs reais via WS)
  actorB.x = actorA.x + 1.5; actorB.z = actorA.z;
  actorB.yaw = Math.atan2(-(actorA.x - actorB.x), -(actorA.z - actorB.z));
  for (let i = 0; i < 100 && actorA.knocked; i++) {
    b.sendInput({ interact: true });
    await wait(50);
  }
  revivedSeen = !actorA.knocked && actorA.alive;
  console.log(`[priv] revive via input interact: ${revivedSeen} — vida A: ${Math.round(actorA.life)}`);
  for (const e of b.box.snap?.events ?? []) {
    if (e.type === 'revived') revivedSeen = true;
    if (e.type === 'killfeed' && e.knock) killfeedKnock = true;
  }
  if (!revivedSeen) throw new Error('revive não concluiu');
  if (Math.round(actorA.life) !== Math.round(100 * 0.4)) throw new Error('vida pós-revive inesperada: ' + actorA.life);
  console.log('[priv] killfeed nocaute entregue:', killfeedKnock);

  console.log('PRIV_SMOKE_OK');
} catch (err) {
  console.error('PRIV_SMOKE_FAIL:', err.message);
  failed = true;
} finally {
  await app.close().catch(() => {});
  process.exit(failed ? 1 : 0);
}
