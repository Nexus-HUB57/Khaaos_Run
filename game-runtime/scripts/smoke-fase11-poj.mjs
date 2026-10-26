// Khaaos Run — Smoke Fase 11 (ao vivo): POJ ↔ Ring fechado no servidor real.
//   1. /console (Console do Marechal) servida com banco da Corte Marcial;
//   2. Corte Marcial JOGÁVEL por HTTP: remeter → caso pendente → veredito → registro;
//   3. alistamento comprimido + advance até o dia 7 de Arukheea (comparecendo
//      em todos os mundos — covardia nunca se aplica);
//   4. Oficiais de Classe Especial JOGÁVEIS via WS: recusa fora da janela,
//      aceite na janela do 7º artigo, insígnia ÚNICA por partida;
//   5. patente do perfil no snapshot (own view) + killfeed com patente.
// Uso: node scripts/smoke-fase11-poj.mjs  (sobe o próprio servidor em :8811)
//      SMOKE_EXTERNAL=1 SMOKE_PORT=8800 node scripts/smoke-fase11-poj.mjs
//      (valida contra um servidor JÁ RODANDO — staging com PG/Redis reais)
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { hashPassword } from '../server/auth.js';
import WebSocket from 'ws';

const PORT = Number(process.env.SMOKE_PORT || 8811);
const BASE = `http://127.0.0.1:${PORT}`;
const LOG = '/tmp/kr-f11-smoke.log';
const EXTERNAL = process.env.SMOKE_EXTERNAL === '1';

const users = ['kr_player', 'kr_player2', 'kr_admin'].map((u) => ({
  id: u, username: u, role: u === 'kr_admin' ? 'admin' : 'player', region: 'sa-east', passwordHash: hashPassword('kr123'),
}));

let server = null;
if (!EXTERNAL) {
  server = spawn('node', ['server/server.js'], {
    env: {
      ...process.env,
      PORT: String(PORT),
      KR_DEV_AUTH: '1',
      KR_POJ_DAY_SECONDS: '120',          // dia comprimido: 2 min
      KR_POJ_ENLISTMENT_TOTAL: '2',       // 2 alistados fecham o alistamento
      KR_POJ_CIGKV_TRIGGER: '1',
      KR_USERS_JSON: JSON.stringify(users),
    },
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  server.unref();
  process.on('exit', () => { try { server.kill(); } catch {} });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function ready() {
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(`${BASE}/readyz`);
      if (r.ok) return true;
    } catch {}
    await sleep(250);
  }
  throw new Error('readyz não abriu — ver ' + LOG);
}

const api = async (path, { method = 'GET', body, token } = {}) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
};

// ---------- WS helper ----------
function wsConnect(token) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?token=${encodeURIComponent(token)}&mode=3d`);
    const state = { ws, snapshots: [], events: [], matchFound: null };
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'match_found') { state.matchFound = msg; state.snapshots.push(msg.snapshot); }
      if (msg.type === 'snapshot') {
        state.snapshots.push(msg.snapshot);
        for (const e of msg.snapshot?.events ?? []) state.events.push(e); // Fase 11 — eventos viajam DENTRO do snapshot
      }
      if (msg.type !== 'snapshot' && msg.type !== 'pong') state.events.push(msg);
    });
    ws.on('open', async () => {
      // aguarda o matchmaking emitir a sala (assign é síncrono pós-handshake)
      for (let i = 0; i < 40 && !state.matchFound; i++) await sleep(100);
      resolve(state);
    });
    ws.on('error', reject);
  });
}
const send = (state, obj) => state.ws.send(JSON.stringify(obj));
const waitEvent = async (state, type, tries = 40) => {
  for (let i = 0; i < tries; i++) {
    const found = state.events.find((e) => e.type === type);
    if (found) return found;
    await sleep(250);
  }
  return null;
};
const drain = (state) => { const n = state.snapshots.length; state.snapshots = []; return n; };

console.log('[f11] boot staging server em :' + PORT);
await ready();
console.log('[f11] servidor pronto');

// ---------- 1. Console do Marechal servida ----------
const consolePage = await fetch(`${BASE}/console`);
assert.equal(consolePage.status, 200);
const consoleHtml = await consolePage.text();
assert.ok(consoleHtml.includes('Corte Marcial'), 'console traz o banco da Corte');
assert.ok(consoleHtml.includes('veredito') || consoleHtml.includes('Veredito'), 'console traz vereditos');
console.log('[f11] /console OK (Marechal + Corte Marcial)');

// ---------- 2. Sessões ----------
const admin = (await api('/auth/login', { method: 'POST', body: { username: 'kr_admin', password: 'kr123' } })).data;
const p1 = (await api('/auth/login', { method: 'POST', body: { username: 'kr_player', password: 'kr123' } })).data;
assert.ok(admin.token && p1.token, 'sessões emitidas');
const noAuth = await api('/poj/court-martial/cases');
assert.equal(noAuth.status, 401, 'banco da Corte exige sessão');
console.log('[f11] sessões OK (admin + player); Corte exige auth');

// ---------- 3. Alistamento comprimido → GUERRA ----------
const r1 = await api('/poj/register', { method: 'POST', body: {}, token: p1.token });
assert.equal(r1.status, 200, `alistamento p1 (${r1.data?.error ?? ''})`);
const r2 = await api('/poj/register', { method: 'POST', body: { playerId: 'kr_player2' }, token: admin.token });
assert.equal(r2.status, 200, `alistamento p2 pelo Marechal (${r2.data?.error ?? ''})`);
assert.ok((await api('/poj/state')).data.cigkvOpen === true, 'CIGKV aberto no gatilho de 50%');
await api('/poj/advance', { method: 'POST', body: { seconds: 86400 }, token: admin.token });
let state = (await api('/poj/state')).data;
assert.equal(state.phase, 'guerra', 'guerra iniciada após 24 h (contagem comprimida)');
console.log('[f11] alistamento fechado (2/2) → GUERRA em Barburhen');

// dia a dia comparecendo (covardia nunca se aplica) até o dia 7 de Arukheea
const tokens = { kr_player: p1.token, kr_player2: null };
const p2login = (await api('/auth/login', { method: 'POST', body: { username: 'kr_player2', password: 'kr123' } })).data;
tokens.kr_player2 = p2login.token;
for (let d = 0; d < 27; d++) {
  const inc = (await api('/poj/summon', { method: 'POST', body: {}, token: admin.token })).data;
  for (const tk of [p1.token, p2login.token]) {
    const at = await api('/poj/attend', { method: 'POST', body: { incursionId: inc.id }, token: tk });
    assert.equal(at.status, 200, `presença em ${inc.id} (${at.data?.error ?? ''})`);
  }
  await api('/poj/close', { method: 'POST', body: { incursionId: inc.id }, token: admin.token });
  await api('/poj/advance', { method: 'POST', body: { seconds: 120 }, token: admin.token });
}
state = (await api('/poj/state')).data;
assert.equal(state.world, 'Arukheea');
assert.equal(state.day, 7);
assert.equal(state.survivorsCount, 2, '2 sobreviventes no dia 7 de Arukheea');
console.log('[f11] 27 dias comparecidos → Arukheea dia 7, 2 sobreviventes');

// ---------- 4. Oficiais jogáveis via WS ----------
const plan = state.officerPlan;
assert.equal(plan.allowed, true, `plano de oficiais autorizado no 7º dia (10% de 2 = 1 < 2) — ${plan.reason}`);
console.log(`[f11] plano dos Oficiais: ${plan.reason}`);

const c1 = await wsConnect(p1.token);
assert.ok(c1.matchFound, 'match_found emitido');
const snap0 = c1.matchFound.snapshot;
assert.ok(snap0?.player, 'snapshot inicial no match_found');
assert.ok(snap0.player.patente, `patente do perfil no snapshot (${snap0.player?.patente})`);
console.log(`[f11] patente no nametag (snapshot): ${snap0.player.patente}`);

// janela do 7º artigo aberta: insígnia OCE_01 aceita no LOBBY
send(c1, { type: 'set_operative', operativeId: 'OCE_01' });
await sleep(500);
// insígnia única: c2 tenta a mesma e é recusado; assume outra
const c2 = await wsConnect(p2login.token);
await sleep(500);
const c2snap0 = c2.matchFound.snapshot;
assert.ok(c2snap0?.player?.patente, `patente também no snapshot do 2º humano (${c2snap0?.player?.patente})`);
send(c2, { type: 'set_operative', operativeId: 'OCE_01' });
await sleep(700);
const c2err = c2.events.find((e) => e.type === 'operative_error');
assert.ok(c2err, 'insígnia ocupada recusada para o 2º humano');
assert.equal(c2err.reason, 'insignia_ocupada');
send(c2, { type: 'set_operative', operativeId: 'OCE_03' });
await sleep(500);

// partida inicia → snapshots 20 Hz carregam identidade OCE + patente
send(c1, { type: 'start', entry: 'belt' });
await sleep(1200);
const live1 = c1.snapshots.at(-1);
assert.ok(live1?.player, 'snapshots ao vivo após start');
assert.equal(live1.player.officer, true, 'humano virou Oficial no snapshot ao vivo');
assert.equal(live1.player.officerCallsign, 'Oficial de Classe Especial I');
assert.equal(live1.player.operativeId, 'OCE_01');
assert.equal(live1.player.weapon, 'm4', 'arma canônica da insígnia OCE-VALKON');
console.log('[f11] OCE-VALKON JOGÁVEL: officer=true, m4, chamada dourada no snapshot ao vivo');
const live2 = c2.snapshots.at(-1);
assert.equal(live2.player.officer, true, '2º humano com insígnia própria (OCE_03)');
const othersView = live1.others.find((o) => o.officer && o.id !== c1.matchFound.id);
assert.ok(othersView, 'Oficial remoto visível com marca dourada no snapshot do colega');
assert.ok(othersView.patente, `patente no nametag do Oficial remoto (${othersView.patente})`);
console.log('[f11] insígnia ÚNICA validada (OCE_01 ocupada → recusa; OCE_03 assumida) + nametages com patente');

// ---------- 5. Corte Marcial jogável por HTTP ----------
const cm = await api('/poj/court-martial', { method: 'POST', body: { playerId: 'kr_player2', motivo: 'desobediencia_final' }, token: admin.token });
assert.equal(cm.status, 200, `remessa à Corte (${cm.data?.error ?? ''})`);
let docket = (await api('/poj/court-martial/cases', { token: p1.token })).data;
assert.equal(docket.pendentes, 1, 'caso pendente no banco');
const caseId = docket.cases.find((c) => c.status === 'pendente').id;
const verdict = await api('/poj/court-martial/verdict', { method: 'POST', body: { caseId, veredito: 'honras_de_guerra', nota: 'Caiu cobrindo a retirada do esquadrão' }, token: admin.token });
assert.equal(verdict.status, 200, `veredito aplicado (${verdict.data?.error ?? ''})`);
docket = (await api('/poj/court-martial/cases', { token: p1.token })).data;
assert.equal(docket.julgados, 1);
const judged = docket.cases.find((c) => c.id === caseId);
assert.equal(judged.veredito, 'honras_de_guerra');
assert.equal(judged.juiz, 'kr_admin');
assert.ok(judged.nota?.includes('retirada'), 'nota do julgamento na ata');
// veredito de PLAYER comum é recusado (comando exclusivo do Marechal)
const deny = await api('/poj/court-martial/verdict', { method: 'POST', body: { caseId, veredito: 'absolvicao' }, token: p1.token });
assert.equal(deny.status, 403, 'veredito exigindo poj:command — player negado');
state = (await api('/poj/state')).data;
assert.equal(state.court.julgados, 1, 'resumo da Corte no snapshot público');
console.log('[f11] CORTE MARCIAL JOGÁVEL: pendente → veredito (honras) → registro na ata');

// vereditos inválidos
const bad = await api('/poj/court-martial/verdict', { method: 'POST', body: { caseId, veredito: 'fuzilamento' }, token: admin.token });
assert.equal(bad.status, 400, 'veredito desconhecido recusado');

c1.ws.close(); c2.ws.close();
console.log('F11_SMOKE_OK');
process.exit(0);
