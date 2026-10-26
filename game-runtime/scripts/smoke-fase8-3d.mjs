// Smoke test Fase 8: identidade operativa online + habilidade autoritativa + céu dinâmico.
// Valida set_operative (self + bots com op), snapshot com abilityState, ativação de
// habilidade via input.ability (heal), evento ability com isSelf, cooldown no snapshot,
// e o campo op/revealed nos others. Reusa o fluxo de sala privada da Fase 7.
import { WebSocket } from 'ws';

const PORT = 8793;
const DT = 1 / 20;
const blank = (seq, over = {}) => ({ seq, dx: 0, dy: 0, yaw: 0, pitch: 0, fire: false, ads: false, sprint: false, jump: false, interact: false, reload: false, medkit: false, throw: false, gloo: false, ability: false, slot: 0, clientDt: DT, ...over });

function client(token, tag, onMsg) {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?token=${token}&mode=3d`);
  let seq = 0;
  const box = { messages: [], events: {}, snapshots: 0 };
  ws.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    box.messages.push(m);
    if (m.type === 'match_found' || m.type === 'private_created' || m.type === 'private_joined') ws.__id = m.id;
    if (m.type === 'snapshot') {
      box.snap = m.snapshot;
      box.snapshots++;
      for (const e of m.snapshot.events ?? []) box.events[e.type] = (box.events[e.type] || 0) + 1;
    }
    onMsg?.(m);
  });
  ws.sendInput = (over) => ws.send(JSON.stringify({ type: 'input', input: blank(++seq, over) }));
  ws.startMatch = (entry) => ws.send(JSON.stringify({ type: 'start', entry }));
  ws.setOperative = (operativeId) => ws.send(JSON.stringify({ type: 'set_operative', operativeId }));
  ws.box = box;
  return ws;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, timeoutMs = 8000) {
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
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kr-f8-'));
const app = createAuthoritativeServer({ port: PORT, store: new DurableJsonStore(path.join(dir, 's.json')), rateStore: new SharedMemoryRateStore() });
await new Promise((r) => app.server.listen(PORT, r));
console.log('[f8] servidor em', PORT);

const login = async () => {
  const r = await fetch(`http://127.0.0.1:${PORT}/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'kr_player', password: 'kr123' }),
  });
  if (!r.ok) throw new Error('login falhou ' + r.status);
  return (await r.json()).token;
};

try {
  const tokenA = await login();
  const tokenB = await login();
  console.log('[f8] logins ok');

  // --- sala privada squad (2 humanos) ---
  const a = client(tokenA, 'A');
  await new Promise((r) => a.on('open', r));
  await waitFor(() => a.box.messages.find((m) => m.type === 'queued'));
  a.send(JSON.stringify({ type: 'create_private' }));
  const created = await waitFor(() => a.box.messages.find((m) => m.type === 'private_created'));
  const code = created.code;
  console.log('[f8] sala privada criada, código', code);

  // Fase 8 — identidade: A declara a SNIPER antes de iniciar
  a.setOperative('OP_FEMALE_SNIPER');

  const b = client(tokenB, 'B');
  await new Promise((r) => b.on('open', r));
  await waitFor(() => b.box.messages.find((m) => m.type === 'queued'));
  b.send(JSON.stringify({ type: 'join_private', code: code.toLowerCase() }));
  await waitFor(() => b.box.messages.find((m) => m.type === 'private_joined'));
  b.setOperative('OP_MALE_MEDIC_AFRICAN');
  await wait(400); // assenta o set_operative antes do start (sockets distintos)
  console.log('[f8] B entrou com código normalizado; operativos declarados');

  a.startMatch('belt');
  await waitFor(() => a.box.snap?.started);

  // identidade no snapshot
  const snapA = a.box.snap;
  if (snapA.player.operativeId !== 'OP_FEMALE_SNIPER') throw new Error('operativo de A não sincronizou: ' + snapA.player.operativeId);
  const bots = snapA.others.filter((o) => o.isBot);
  const botsWithOp = bots.filter((o) => typeof o.op === 'string' && o.op.length > 0);
  console.log(`[f8] identidade OK — A=${snapA.player.operativeId}, B=${b.box.snap.player.operativeId}, bots com op: ${botsWithOp.length}/${bots.length}`);
  if (botsWithOp.length !== bots.length) throw new Error('bots sem operativo');
  if (b.box.snap.player.operativeId !== 'OP_MALE_MEDIC_AFRICAN') throw new Error('operativo de B não sincronizou: ' + b.box.snap.player.operativeId);

  // B (medic) precisa de vida baixa p/ o heal: corre para TRÁS (dy=+1, radialmente
  // para fora do anel de 168m) até tomar dano de zona — intervalo a 30Hz
  const lifeBefore = b.box.snap.player.life;
  let lifeAfterRing = lifeBefore;
  const runT0 = Date.now();
  const runner = setInterval(() => b.sendInput({ dy: 1 }), 33);
  while (Date.now() - runT0 < 20000) {
    await wait(500);
    lifeAfterRing = b.box.snap.player.life;
    if (lifeAfterRing < lifeBefore - 2) break;
  }
  clearInterval(runner);
  console.log(`[f8] B fora da zona: vida ${lifeBefore} → ${lifeAfterRing.toFixed(1)} (em ${((Date.now() - runT0) / 1000).toFixed(1)}s)`);
  if (lifeAfterRing >= lifeBefore) throw new Error('B não tomou dano de zona (não dá p/ validar heal)');
  // espera o pouso da infiltração aérea (habilidades são bloqueadas no ar — Fase 8)
  const landT0 = Date.now();
  const lander = setInterval(() => b.sendInput({ dx: 0, dy: 0 }), 66);
  while (Date.now() - landT0 < 18000) {
    await wait(300);
    if (b.box.snap.player.dropPhase === null && b.box.snap.player.onGround) break;
  }
  clearInterval(lander);
  console.log(`[f8] B pousou em ${((Date.now() - landT0) / 1000).toFixed(1)}s (dropPhase=${b.box.snap.player.dropPhase})`);
  await wait(500);
  const lifePreHeal = b.box.snap.player.life;
  for (let t = 0; t < 4; t++) { b.sendInput({ ability: true }); await wait(250); } // Coágulo de Campo (+24)
  await wait(700);
  const lifePostHeal = b.box.snap.player.life;
  const abilityEvents = b.box.events.ability ?? 0;
  const rejected = b.box.messages.filter((m) => m.type === 'rejected' || m.type === 'banned').map((m) => m.type + ':' + (m.violations?.join('|') ?? ''));
  const stNow = b.box.snap.player.abilityState;
  console.log(`[f8] heal autoritativo: ${lifePreHeal.toFixed(1)} → ${lifePostHeal.toFixed(1)} (+${(lifePostHeal - lifePreHeal).toFixed(1)}), eventos ability: ${abilityEvents}`);
  console.log(`[f8] rejeições B: ${rejected.length ? rejected.join(', ') : 'nenhuma'}; abilityState: ${JSON.stringify(stNow)}; op: ${b.box.snap.player.operativeId}`);
  if (lifePostHeal <= lifePreHeal) throw new Error('heal não aplicou vida');
  if (abilityEvents < 1) throw new Error('evento ability ausente');

  // cooldown visível no snapshot
  const st = b.box.snap.player.abilityState;
  console.log('[f8] abilityState no snapshot:', JSON.stringify(st));
  if (!st || st.cooldownTicks <= 0) throw new Error('cooldown não refletido no snapshot');

  // céu: snapshot tem ring.pulse p/ dirigir a noite
  if (!('pulse' in b.box.snap.ring)) throw new Error('ring.pulse ausente do snapshot');
  console.log('[f8] ring.pulse disponível p/ céu dinâmico:', b.box.snap.ring.pulse);

  console.log('F8_SMOKE_OK');
} catch (e) {
  console.error('F8_SMOKE_FAIL:', e.message);
  process.exitCode = 1;
} finally {
  try { app.server.closeAllConnections?.(); } catch {}
  app.server.close();
  await new Promise((r) => setTimeout(r, 200));
  process.exit(process.exitCode ?? 0);
}
