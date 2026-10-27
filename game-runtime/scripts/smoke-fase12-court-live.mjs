// Khaaos Run — Smoke Fase 12 (ao vivo): Corte Marcial DURANTE uma partida real,
// trem do ZU autoritativo entre remotos e vereditos movendo KRC REAL no ledger.
//
//   1. /console servida com vereditos rotulados com efeito KRC;
//   2. partida REAL via WS (2 humanos na mesma sala + bots), matchStart com
//      anúncio AUTORITATIVO do trem (startedAt do servidor) — ambos os clientes
//      sincronizam o elapsed pelo pong (offset de relógio);
//   3. Marechal remete um militar À CORTE no meio da partida e julga pelo MESMO
//      caminho do console (HTTP) → caso, veredito, KRC no ledger e eventos ao
//      vivo no Ring (court_verdict + patente no nametag do julgado);
//   4. idempotência: veredito repetido NÃO paga/multa duas vezes;
//   5. economia real: /economy/balance + /economy/history + compliance íntegro.
//
// Uso: node scripts/smoke-fase12-court-live.mjs           (sobe o próprio :8812)
//      SMOKE_EXTERNAL=1 SMOKE_PORT=8800 node scripts/smoke-fase12-court-live.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { hashPassword } from '../server/auth.js';
import WebSocket from 'ws';
import { TRAIN_INTRO_DURATION_MS, TRAIN_INTRO_GRACE_MS, estimateClockOffset } from '../src/shared/clock.js';

const PORT = Number(process.env.SMOKE_PORT || 8812);
const BASE = `http://127.0.0.1:${PORT}`;
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
      KR_POJ_DAY_SECONDS: '120',
      KR_POJ_ENLISTMENT_TOTAL: '2',
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
  throw new Error('readyz não abriu');
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

// ---------- WS helper (com sincronia de relógio Fase 12) ----------
function wsConnect(token) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?token=${encodeURIComponent(token)}&mode=3d`);
    const state = { ws, snapshots: [], events: [], matchFound: null, rtt: null, clockOffset: null, te: 0, t0: 0 };
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'pong') {
        state.rtt = Date.now() - state.t0; // ms (gross o suficiente p/ smoke)
        state.clockOffset = estimateClockOffset({ serverNow: msg.now, clientSentAt: state.te, rtt: state.rtt });
        return;
      }
      if (msg.type === 'match_found') { state.matchFound = msg; state.snapshots.push(msg.snapshot); }
      if (msg.type === 'snapshot') {
        state.snapshots.push(msg.snapshot);
        for (const e of msg.snapshot?.events ?? []) state.events.push(e);
      }
      if (msg.type !== 'snapshot' && msg.type !== 'pong') state.events.push(msg);
    });
    ws.on('open', async () => {
      // pings a cada 400ms mantêm o offset fresco (cliente real usa 2s)
      state.pingTimer = setInterval(() => {
        if (ws.readyState !== WebSocket.OPEN) return;
        state.t0 = Date.now(); state.te = Date.now();
        ws.send(JSON.stringify({ type: 'ping', t: state.t0, te: state.te }));
      }, 400);
      for (let i = 0; i < 40 && !state.matchFound; i++) await sleep(100);
      for (let i = 0; i < 20 && state.clockOffset === null; i++) await sleep(100); // 1º pong
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

console.log('[f12] boot servidor em :' + PORT);
await ready();
console.log('[f12] servidor pronto');

// ---------- 1. Console com vereditos KRC ----------
const consoleHtml = await (await fetch(`${BASE}/console`)).text();
assert.ok(consoleHtml.includes('Corte Marcial'), 'console traz o banco da Corte');
assert.ok(consoleHtml.includes('+200 KRC') && consoleHtml.includes('−250 KRC'), 'vereditos rotulados com efeito KRC real');
console.log('[f12] /console OK — vereditos exibem efeito em KRC');

// ---------- 2. Sessões + semeadura de saldo (patente visível no nametag) ----------
const admin = (await api('/auth/login', { method: 'POST', body: { username: 'kr_admin', password: 'kr123' } })).data;
const p1 = (await api('/auth/login', { method: 'POST', body: { username: 'kr_player', password: 'kr123' } })).data;
const p2 = (await api('/auth/login', { method: 'POST', body: { username: 'kr_player2', password: 'kr123' } })).data;
assert.ok(admin.token && p1.token && p2.token, 'sessões emitidas');
const base1 = (await api('/economy/balance', { token: p1.token })).data.amount;
const base2 = (await api('/economy/balance', { token: p2.token })).data.amount;
// Sargento (3500+) nos dois — afastamento derruba para Recruta visível no nametag
// grants REAIS (idempotentes, by Marechal)
const grant1 = await api('/economy/grant', { method: 'POST', body: { userId: 'kr_player', amount: Math.max(0, 3800 - base1), reason: 'seed_f12', idempotencyKey: `f12-seed-p1-${base1}` }, token: admin.token });
const grant2 = await api('/economy/grant', { method: 'POST', body: { userId: 'kr_player2', amount: Math.max(0, 4000 - base2), reason: 'seed_f12', idempotencyKey: `f12-seed-p2-${base2}` }, token: admin.token });
assert.equal(grant1.status, 200, `grant p1 (${grant1.data?.error ?? ''})`);
assert.equal(grant2.status, 200, `grant p2 (${grant2.data?.error ?? ''})`);
console.log(`[f12] saldo semeado — p1: ${base1}→${grant1.data.balance.amount} · p2: ${base2}→${grant2.data.balance.amount}`);

// ---------- 3. Alistamento comprimido → GUERRA ----------
assert.equal((await api('/poj/register', { method: 'POST', body: {}, token: p1.token })).status, 200, 'alistamento p1');
assert.equal((await api('/poj/register', { method: 'POST', body: { playerId: 'kr_player2' }, token: admin.token })).status, 200, 'alistamento p2 pelo Marechal');
await api('/poj/advance', { method: 'POST', body: { seconds: 86400 }, token: admin.token });
assert.equal((await api('/poj/state')).data.phase, 'guerra', 'GUERRA iniciada');
console.log('[f12] alistamento 2/2 → GUERRA');

// ---------- 4. Partida REAL: 2 humanos na mesma sala ----------
const c1 = await wsConnect(p1.token);
const c2 = await wsConnect(p2.token);
assert.ok(c1.matchFound && c2.matchFound, 'match_found para ambos');
assert.equal(c1.matchFound.roomId, c2.matchFound.roomId, 'mesma sala para os 2 remotos');
assert.ok(c1.clockOffset !== null && c2.clockOffset !== null, 'offset de relógio estimado via pong em ambos');
console.log(`[f12] sala ${c1.matchFound.roomId} · offset c1=${c1.clockOffset.toFixed(0)}ms · offset c2=${c2.clockOffset.toFixed(0)}ms`);

// LOBBY: patente do perfil (KRC real) já no snapshot
const snap0 = c1.matchFound.snapshot;
assert.ok(snap0.player.patente, 'patente do perfil no snapshot inicial');
console.log(`[f12] patentes no nametag — p1: ${snap0.player.patente}`);

// start → matchStart AUTORITATIVO com o trem, para AMBOS
send(c1, { type: 'start', entry: 'belt' });
const ms1 = await waitEvent(c1, 'matchStart');
const ms2 = await waitEvent(c2, 'matchStart');
assert.ok(ms1 && ms2, 'matchStart entregue aos dois remotos');
assert.ok(ms1.train?.startedAt && ms2.train?.startedAt, 'anúncio do trem no matchStart de ambos');
assert.equal(ms1.train.startedAt, ms2.train.startedAt, 'MESMO startedAt autoritativo para toda a sala');
assert.equal(ms1.train.durationMs, TRAIN_INTRO_DURATION_MS, 'duração canônica compartilhada');
// elapsed sincronizado pelo relógio do servidor (pong) — todos veem o mesmo frame
const elapsed1 = Date.now() + (c1.clockOffset ?? 0) - ms1.train.startedAt;
const elapsed2 = Date.now() + (c2.clockOffset ?? 0) - ms2.train.startedAt;
assert.ok(elapsed1 >= -500 && elapsed1 < TRAIN_INTRO_DURATION_MS + TRAIN_INTRO_GRACE_MS, `c1 na janela do trem (${elapsed1.toFixed(0)}ms)`);
assert.ok(elapsed2 >= -500 && elapsed2 < TRAIN_INTRO_DURATION_MS + TRAIN_INTRO_GRACE_MS, `c2 na janela do trem (${elapsed2.toFixed(0)}ms)`);
assert.ok(Math.abs(elapsed1 - elapsed2) < 900, `remotos sincronizados (${Math.abs(elapsed1 - elapsed2).toFixed(0)}ms de skew)`);
// snapshot também carrega o anúncio (reconexão/late join)
const live1 = c1.snapshots.at(-1);
assert.deepEqual(live1.train, ms1.train, 'snapshot carrega o anúncio do trem');
console.log(`[f12] TREM AUTORITATIVO: startedAt único, elapsed c1=${elapsed1.toFixed(0)}ms · c2=${elapsed2.toFixed(0)}ms (skew ${(Math.abs(elapsed1 - elapsed2)).toFixed(0)}ms)`);

// partida ao vivo: snapshots 20Hz
await sleep(700);
assert.ok(c1.snapshots.at(-1)?.player, 'snapshots ao vivo');
assert.equal(c1.snapshots.length > 5 && c2.snapshots.length > 5, true, 'stream 20Hz nos dois remotos');

// ---------- 5. Corte Marcial DURANTE a partida (caminho do console) ----------
const cm = await api('/poj/court-martial', { method: 'POST', body: { playerId: 'kr_player2', motivo: 'evasao' }, token: admin.token });
assert.equal(cm.status, 200, `remessa à Corte no meio da partida (${cm.data?.error ?? ''})`);
let docket = (await api('/poj/court-martial/cases', { token: p1.token })).data;
assert.equal(docket.pendentes, 1, 'caso pendente no banco da Corte');
const caseId1 = docket.cases.find((c) => c.status === 'pendente').id;
console.log(`[f12] caso ${caseId1} aberto DURANTE a partida (kr_player2, evasao)`);

// veredito HONRAS DE GUERRA → +200 KRC reais + evento court_verdict no Ring
const verdict1 = await api('/poj/court-martial/verdict', {
  method: 'POST', body: { caseId: caseId1, veredito: 'honras_de_guerra', nota: 'Caiu cobrindo a retirada do esquadrão' }, token: admin.token,
});
assert.equal(verdict1.status, 200, `veredito 1 (${verdict1.data?.error ?? ''})`);
assert.equal(verdict1.data.krc.kind, 'grant');
assert.equal(verdict1.data.krc.applied, true);
assert.equal(verdict1.data.krc.delta, 200);
assert.equal(verdict1.data.krc.balance, 4200, 'saldo real após prêmio (4000+200)');
assert.equal(verdict1.data.caso.registro, 'honrado', 'registro canônico no caso (ata do console)');
console.log(`[f12] VEREDITO 1 honras_de_guerra → +200 KRC no ledger (saldo ${verdict1.data.krc.balance})`);

// evento ao vivo no militar julgado (que está NA partida)
const cv2 = await waitEvent(c2, 'court_verdict');
assert.ok(cv2, 'court_verdict entregue ao julgado dentro do Ring');
assert.equal(cv2.caseId, caseId1);
assert.equal(cv2.veredito, 'honras_de_guerra');
assert.equal(cv2.krcDelta, 200);
assert.equal(cv2.krcApplied, true);
assert.equal(cv2.krcBalance, 4200);
console.log('[f12] court_verdict AO VIVO no Ring do julgado (feed HUD do cliente)');

// ---------- 6. AFASTAMENTO com multa: patente derruba AO VIVO no nametag ----------
const cm2 = await api('/poj/court-martial', { method: 'POST', body: { playerId: 'kr_player', motivo: 'desobediencia_final' }, token: admin.token });
assert.equal(cm2.status, 200, 'remessa 2 à Corte');
docket = (await api('/poj/court-martial/cases', { token: p1.token })).data;
const caseId2 = docket.cases.find((c) => c.status === 'pendente').id;
const verdict2 = await api('/poj/court-martial/verdict', {
  method: 'POST', body: { caseId: caseId2, veredito: 'afastamento', nota: 'Deserção na hora final' }, token: admin.token,
});
assert.equal(verdict2.status, 200, `veredito 2 (${verdict2.data?.error ?? ''})`);
assert.equal(verdict2.data.krc.kind, 'fine');
assert.equal(verdict2.data.krc.applied, true);
assert.equal(verdict2.data.krc.delta, -250, 'multa cheia (saldo 4050 > 250)');
assert.equal(verdict2.data.krc.balance, 3550, 'saldo real após multa (3800−250)');
assert.equal(verdict2.data.caso.patenteFinal, 'Recruta', 'patente do registro reduzida a Recruta');
// patente AO VIVO no nametag (room.setPatente via notifier) + evento patente
const patEv = await waitEvent(c1, 'patente');
assert.ok(patEv, 'evento patente ao vivo para o degradado');
assert.equal(patEv.patente, 'Recruta');
const own = c1.snapshots.at(-1).player;
assert.equal(own.patente, 'Recruta', 'nametag do julgado atualizado no snapshot ao vivo');
const cv1 = await waitEvent(c1, 'court_verdict');
assert.ok(cv1 && cv1.krcDelta === -250 && cv1.krcBalance === 3550, 'court_verdict da multa ao vivo (delta −250)');
console.log('[f12] VEREDITO 2 afastamento → multa −250 KRC + patente Recruta NO NAMETAG ao vivo');

// ---------- 7. Idempotência: caso julgado não paga/multa de novo ----------
const replay = await api('/poj/court-martial/verdict', { method: 'POST', body: { caseId: caseId1, veredito: 'honras_de_guerra' }, token: admin.token });
assert.equal(replay.status, 400, 'veredito repetido recusado (caso_julgado)');
assert.equal(replay.data.error, 'caso_julgado');
const bal1 = (await api('/economy/balance', { token: p1.token })).data.amount;
const bal2 = (await api('/economy/balance', { token: p2.token })).data.amount;
assert.equal(bal1, 3550, 'saldo p1 intacto após retry');
assert.equal(bal2, 4200, 'saldo p2 intacto após retry');
console.log('[f12] idempotência OK — caso_julgado não move KRC de novo');

// ---------- 8. Ledger real: histórico + compliance ----------
const hist1 = (await api('/economy/history', { token: p1.token })).data;
const courtEntries1 = hist1.filter?.length >= 0 ? null : null; // shape array
const entries1 = Array.isArray(hist1) ? hist1 : hist1.entries ?? [];
const courtFine = entries1.find((e) => e.type === 'fine');
assert.ok(courtFine, 'lançamento de multa no histórico do militar');
assert.equal(courtFine.idempotencyKey, `court:${caseId2}:afastamento`);
assert.equal(courtFine.creditAccount, 'treasury:fines');
const compliance = (await api('/economy/compliance', { token: admin.token })).data;
assert.equal(compliance.ledgerIntact, true, 'ledger de dupla entrada íntegro');
assert.equal(compliance.realMoneyEnabled, false, 'trilhas de valor real continuam congeladas');
console.log(`[f12] ledger íntegro (${compliance.ledgerEntries} lançamentos) — court:* com idempotência visível no histórico`);

// veredito por NÃO-admin recusado (RBAC do console)
const denado = await api('/poj/court-martial/verdict', { method: 'POST', body: { caseId: caseId1, veredito: 'absolvicao' }, token: p2.token });
assert.equal(denado.status, 403, 'jogador comum não julga (rbac.deny)');
console.log('[f12] RBAC OK — só o Marechal julga');

// encerra de forma limpa
try { c1.ws.close(); c2.ws.close(); } catch {}

console.log('F12_SMOKE_OK');
process.exit(0);
