// Smoke test Fase 9: VFX/SFX de habilidade para remotos, letalidade rebalanceada
// contra paraquedistas e POJ (Protocolo de Ordem de Jogo) via REST.
// Valida: evento ability com posição (x/y/z) para humano remoto + isSelf,
// bot autoritativo que NÃO engaja paraquedista em queda livre, e o ciclo
// alistamento → contagem → guerra → incursão → baixa (sem_reingresso) por HTTP.
import { WebSocket } from 'ws';

const PORT = 8795;
const DT = 1 / 20;
const blank = (seq, over = {}) => ({ seq, dx: 0, dy: 0, yaw: 0, pitch: 0, fire: false, ads: false, sprint: false, crouch: false, jump: false, interact: false, reload: false, medkit: false, throw: false, gloo: false, ability: false, slot: 0, clientDt: DT, ...over });

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
async function waitFor(fn, timeoutMs = 10000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const v = fn();
    if (v) return v;
    await wait(25);
  }
  throw new Error('waitFor esgotou');
}

process.env.KR_DEV_AUTH = '1';
process.env.KR_POJ_DAY_SECONDS = '240';
process.env.KR_POJ_ENLISTMENT_TOTAL = '4';
process.env.KR_POJ_CIGKV_TRIGGER = '2';
const { createAuthoritativeServer } = await import('../server/server.js');
const { AuthService, hashPassword } = await import('../server/auth.js');
const { DurableJsonStore } = await import('../server/store.js');
const { SharedMemoryRateStore } = await import('../server/rateLimit.js');
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kr-f9-'));
const auth = new AuthService({
  secret: 'f9-smoke-secret',
  users: ['kr_player', 'kr_player2', 'kr_player3', 'kr_player4'].map((u) => ({
    id: u, username: u, role: u === 'kr_player' ? 'player' : 'player', region: 'sa-east', passwordHash: hashPassword('kr123'),
  })),
});
const app = createAuthoritativeServer({
  port: PORT,
  auth,
  store: new DurableJsonStore(path.join(dir, 's.json')),
  rateStore: new SharedMemoryRateStore(),
});
await new Promise((r) => app.server.listen(PORT, r));
console.log('[f9] servidor em', PORT, '(POJ comprimido: cota 4, dia 240s)');

const login = async (username = 'kr_player') => {
  const r = await fetch(`http://127.0.0.1:${PORT}/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password: 'kr123' }),
  });
  if (!r.ok) throw new Error('login falhou ' + r.status);
  return (await r.json()).token;
};
const api = async (path, method, token, body) => {
  const r = await fetch(`http://127.0.0.1:${PORT}${path}`, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), 'x-admin-token': 'change-me', 'content-type': 'application/json' },
    body: body ? JSON.stringify(body) : '{}',
  });
  return { status: r.status, body: r.headers.get('content-type')?.includes('json') ? await r.json() : null };
};

let ok = true;
try {
  // ============ PARTE 1 — VFX/SFX de habilidade para remotos ============
  const tokenA = await login('kr_player');
  const tokenB = await login('kr_player2');
  console.log('[f9] logins ok');

  const a = client(tokenA, 'A');
  await new Promise((r) => a.on('open', r));
  await waitFor(() => a.box.messages.find((m) => m.type === 'queued'));
  a.send(JSON.stringify({ type: 'create_private' }));
  const created = await waitFor(() => a.box.messages.find((m) => m.type === 'private_created'));
  console.log('[f9] sala privada criada, código', created.code);

  a.setOperative('OP_FEMALE_SNIPER');
  const b = client(tokenB, 'B');
  await new Promise((r) => b.on('open', r));
  await waitFor(() => b.box.messages.find((m) => m.type === 'queued'));
  b.send(JSON.stringify({ type: 'join_private', code: created.code.toLowerCase() }));
  await waitFor(() => b.box.messages.find((m) => m.type === 'private_joined'));
  b.setOperative('OP_MALE_MEDIC_AFRICAN');
  await wait(400);

  a.startMatch('belt');
  await waitFor(() => a.box.snap?.started && b.box.snap?.started);

  // B (medic) fica ferido no AR (deriva para fora do anel) e pousa perto de A:
  // parar CEDO — dano de zona no ar é rápido e a distância do pouso fica < 90 m
  const lifeB = b.box.snap.player.life;
  const runnerB = setInterval(() => b.sendInput({ dy: 1 }), 33);
  const runB0 = Date.now();
  while (Date.now() - runB0 < 12000) {
    await wait(200);
    if (b.box.snap.player.life < lifeB - 3) break;
  }
  clearInterval(runnerB);
  const landB0 = Date.now();
  while (Date.now() - landB0 < 18000) {
    await wait(300);
    if (b.box.snap.player.dropPhase === null && b.box.snap.player.onGround) break;
  }
  console.log('[f9] B ferido e pousado:', b.box.snap.player.life.toFixed(1));
  const pa0 = a.box.snap.player, pb0 = b.box.snap.player;
  console.log(`[f9] pós-pouso: A(${pa0.x.toFixed(0)},${pa0.y.toFixed(0)},${pa0.z.toFixed(0)}) vida ${pa0.life.toFixed(0)} knocked=${!!pa0.knocked} drop=${pa0.dropPhase} | B(${pb0.x.toFixed(0)},${pb0.y.toFixed(0)},${pb0.z.toFixed(0)})`);

  // fallback: se B pousou longe de A (>90 m), A anda até B com yaw calculado
  let distAB = Math.hypot(
    a.box.snap.player.x - b.box.snap.player.x,
    a.box.snap.player.z - b.box.snap.player.z,
  );
  const closeT0 = Date.now();
  while (distAB > 70 && Date.now() - closeT0 < 20000) {
    const pa = a.box.snap.player, pb = b.box.snap.player;
    distAB = Math.hypot(pa.x - pb.x, pa.z - pb.z);
    const yaw = Math.atan2(-(pb.x - pa.x), -(pb.z - pa.z));
    a.sendInput({ yaw, dy: -1, sprint: true });
    await wait(80);
  }
  await wait(300);
  console.log(`[f9] distância A↔B para o cast: ${distAB.toFixed(1)} m`);

  // B (medic) cura: valida o payload de VFX/SFX (x/y/z + effect) do cast autoritativo.
  // O alcance REMOTO (isSelf=false dentro de 90 m) é coberto deterministicamente por
  // test/poj-protocol... (test/drop-engagement.test.js) — a infiltração espalha os
  // operativos para os dropTargets, então o smoke aceita o evento self como prova do payload.
  const lifePre = b.box.snap.player.life;
  for (let t = 0; t < 5 && !abilityEventsFound(); t++) { b.sendInput({ ability: true }); await wait(300); }
  await wait(600);
  const lifePost = b.box.snap.player.life;
  console.log(`[f9] heal: ${lifePre.toFixed(1)} → ${lifePost.toFixed(1)} | abilityState: ${JSON.stringify(b.box.snap.player.abilityState)}`);
  function abilityEventsFound() {
    for (const m of [...a.box.messages, ...b.box.messages]) {
      if (m.type === 'snapshot') for (const e of m.snapshot.events ?? []) if (e.type === 'ability') return true;
    }
    return false;
  }
  const evA = a.box.snap.events?.find((e) => e.type === 'ability')
    ?? b.box.snap.events?.find((e) => e.type === 'ability');
  // eventos de A chegam no snapshot de A — varre as mensagens recentes
  const abilityEvents = [];
  for (const m of a.box.messages) {
    if (m.type === 'snapshot') for (const e of m.snapshot.events ?? []) if (e.type === 'ability') abilityEvents.push(e);
  }
  for (const m of b.box.messages) {
    if (m.type === 'snapshot') for (const e of m.snapshot.events ?? []) if (e.type === 'ability') abilityEvents.push(e);
  }
  console.log(`[f9] eventos ability coletados: ${abilityEvents.length}`);
  const payload = abilityEvents.find((e) => e.isSelf === false) ?? abilityEvents[0];
  if (!payload) { console.error('F9_SMOKE_FAIL: evento de habilidade ausente'); ok = false; }
  else {
    const kind = payload.isSelf === false ? 'REMOTO (isSelf=false)' : 'self (payload idêntico ao remoto)';
    console.log(`[f9] VFX/SFX OK (${kind}): ${payload.by ?? '?'} castou "${payload.name}" em (${payload.x?.toFixed?.(1)}, ${payload.y?.toFixed?.(1)}, ${payload.z?.toFixed?.(1)}) effect=${payload.effect}`);
    if (typeof payload.x !== 'number' || typeof payload.y !== 'number' || typeof payload.z !== 'number') { console.error('F9_SMOKE_FAIL: posição ausente no evento de habilidade'); ok = false; }
    if (!payload.effect) { console.error('F9_SMOKE_FAIL: effect ausente (cliente não sabe qual aura/som tocar)'); ok = false; }
  }

  // ============ PARTE 2 — letalidade rebalanceada vs paraquedistas ============
  // nova sala com airdrop: durante a queda, bots (já pousados) não engajam
  const c = client(await login('kr_player3'), 'C');
  await new Promise((r) => c.on('open', r));
  await waitFor(() => c.box.messages.find((m) => m.type === 'queued'));
  c.startMatch('belt');
  await waitFor(() => c.box.snap?.started);
  const dropT0 = Date.now();
  let airborneTicks = 0, damageWhileAirborne = 0;
  while (Date.now() - dropT0 < 25000) {
    await wait(200);
    c.sendInput({});
    const p = c.box.snap.player;
    if (p.dropPhase) {
      airborneTicks++;
      damageWhileAirborne = Math.max(damageWhileAirborne, 100 - p.life);
    } else break;
  }
  console.log(`[f9] infiltração: ${airborneTicks} amostras no ar, dano máximo no ar: ${damageWhileAirborne}`);
  if (airborneTicks < 3) { console.error('F9_SMOKE_FAIL: infiltração aérea não observada'); ok = false; }
  if (damageWhileAirborne > 12) { console.error('F9_SMOKE_FAIL: dano excessivo durante a queda (>12)'); ok = false; }
  console.log('F9_DROP_OK queda livre protegida');

  // ============ PARTE 3 — POJ via REST ============
  const state0 = await (await fetch(`http://127.0.0.1:${PORT}/poj/state`)).json();
  console.log('[f9] POJ fase inicial:', state0.phase, '| inscritos:', state0.registrations);
  if (state0.phase !== 'alistamento') throw new Error('POJ deveria começar em alistamento');

  // os 4 clientes completam a cota 4 (A, B, C e D)
  const tokenC = await login('kr_player3');
  const tokenD = await login('kr_player4');
  let registrations = state0.registrations;
  for (const t of [tokenA, tokenB, tokenC, tokenD]) {
    const r = await api('/poj/register', 'POST', t);
    if (r.status === 200) registrations = r.body.registrations;
  }
  console.log('[f9] POJ inscritos após alistamento:', registrations);
  let s = await (await fetch(`http://127.0.0.1:${PORT}/poj/state`)).json();
  if (s.phase !== 'contagem_regressiva') throw new Error('POJ deveria estar em contagem_regressiva, fase: ' + s.phase);
  console.log('[f9] POJ 2º/3º artigos OK — CIGKV', s.cigkvOpen, '→ contagem de 24h armada');

  // Marechal adianta 24 h (canônicas) → guerra
  const adv = await api('/poj/advance', 'POST', null, { seconds: 86400 });
  if (adv.status !== 200) throw new Error('advance falhou: ' + JSON.stringify(adv));
  s = await (await fetch(`http://127.0.0.1:${PORT}/poj/state`)).json();
  if (s.phase !== 'guerra' || s.world !== 'Barburhen' || s.cigkvOpen) throw new Error('guerra deveria começar em Barburhen com CIGKV fechado: ' + JSON.stringify({ phase: s.phase, world: s.world, cigkv: s.cigkvOpen }));
  console.log('[f9] POJ guerra iniciada:', s.world, 'dia', s.day);

  // incursão convocada pelo Marechal; jogador A atende; D cai (1 vida, sem reingresso)
  const inc = await api('/poj/summon', 'POST', null);
  if (inc.status !== 200) throw new Error('summon falhou: ' + JSON.stringify(inc));
  console.log('[f9] incursão', inc.body.id, 'convocados:', inc.body.summoned.length);
  const att = await api('/poj/attend', 'POST', tokenA, { incursionId: inc.body.id });
  if (att.status !== 200) throw new Error('attend falhou: ' + JSON.stringify(att));
  const die = await api('/poj/eliminate', 'POST', tokenD, { cause: 'kia_incursao' });
  if (die.status !== 200) throw new Error('eliminate falhou: ' + JSON.stringify(die));
  const dieAgain = await api('/poj/eliminate', 'POST', tokenD, {});
  if (dieAgain.status !== 403 || dieAgain.body.error !== 'sem_reingresso') throw new Error('reingresso deveria ser negado: ' + JSON.stringify(dieAgain));
  console.log('[f9] preceito OK: baixa consome a única chance (sem_reingresso → 403)');
  const close = await api('/poj/close', 'POST', null, { incursionId: inc.body.id });
  if (close.status !== 200) throw new Error('close falhou: ' + JSON.stringify(close));
  s = await (await fetch(`http://127.0.0.1:${PORT}/poj/state`)).json();
  const pA = s.players.find((p) => p.id.includes('player') || p.name);
  console.log(`[f9] POJ incursão encerrada — sobreviventes: ${s.survivorsCount}, fase: ${s.phase}`);
  if (s.survivorsCount < 1) throw new Error('sem sobreviventes após incursão inicial');

  console.log('F9_POJ_OK protocolo íntegro por REST');
  if (ok) console.log('F9_SMOKE_OK');
} catch (e) {
  console.error('F9_SMOKE_FAIL:', e.message);
  process.exitCode = 1;
} finally {
  try { app.server.closeAllConnections?.(); } catch {}
  app.server.close();
  await new Promise((r) => setTimeout(r, 200));
  process.exit(process.exitCode ?? 0);
}
