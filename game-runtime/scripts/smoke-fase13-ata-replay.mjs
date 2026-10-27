// Khaaos Run — Smoke Fase 13 (ao vivo): replay da ata da Corte Marcial na UI do
// jogador eliminado — contra staging com PostgreSQL/Redis REAIS (SMOKE_EXTERNAL=1).
//
//   1. privacidade do processo: GET /poj/court-martial/cases?mine=1 devolve
//      SOMENTE os casos do próprio militar (contagens escopadas); admin vê tudo;
//   2. caso aberto no meio de uma partida REAL (WS, 2 humanos + bots) carrega
//      TODA a matéria da ata: motivo rotulado, evidência, juiz/nota, registro,
//      xpVeredito e krc (ΔKRC + saldo);
//   3. a ATASÃO do caso REAL alimenta buildAtaSteps (o mesmo motor do HUD):
//      6 passos encadeados com veredito rotulado e linha de KRC correta;
//   4. veredito move KRC REAL no ledger (grant/fine idempotentes por caso) e o
//      evento court_verdict chega ao vivo — fonte do enriquecimento da ata;
//   5. persistência real: ledger + auditoria no PostgreSQL do staging.
//
// Uso: node scripts/smoke-fase13-ata-replay.mjs           (sobe o próprio :8813)
//      SMOKE_EXTERNAL=1 SMOKE_PORT=8800 node scripts/smoke-fase13-ata-replay.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { hashPassword } from '../server/auth.js';
import WebSocket from 'ws';
import { buildAtaSteps, rotuloVeredito } from '../src/game3d/courtAta.js';

const PORT = Number(process.env.SMOKE_PORT || 8813);
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
    try { const r = await fetch(`${BASE}/readyz`); if (r.ok) return true; } catch {}
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

function wsConnect(token) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?token=${encodeURIComponent(token)}&mode=3d`);
    const state = { ws, snapshots: [], events: [], matchFound: null };
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'pong') return;
      if (msg.type === 'match_found') { state.matchFound = msg; state.snapshots.push(msg.snapshot); }
      if (msg.type === 'snapshot') {
        state.snapshots.push(msg.snapshot);
        for (const e of msg.snapshot?.events ?? []) state.events.push(e);
      }
      if (msg.type !== 'snapshot' && msg.type !== 'pong') state.events.push(msg);
    });
    ws.on('open', async () => {
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

console.log(`[f13] boot servidor em :${PORT}${EXTERNAL ? ' (staging EXTERNAL)' : ''}`);
await ready();
console.log('[f13] servidor pronto');

// ---------- 1. Sessões ----------
const admin = (await api('/auth/login', { method: 'POST', body: { username: 'kr_admin', password: 'kr123' } })).data;
const p1 = (await api('/auth/login', { method: 'POST', body: { username: 'kr_player', password: 'kr123' } })).data;
const p2 = (await api('/auth/login', { method: 'POST', body: { username: 'kr_player2', password: 'kr123' } })).data;
assert.ok(admin.token && p1.token && p2.token, 'sessões emitidas');

// ---------- 2. Alistamento comprimido → GUERRA ----------
assert.equal((await api('/poj/register', { method: 'POST', body: {}, token: p1.token })).status, 200, 'alistamento p1');
assert.equal((await api('/poj/register', { method: 'POST', body: { playerId: 'kr_player2' }, token: admin.token })).status, 200, 'alistamento p2 pelo Marechal');
await api('/poj/advance', { method: 'POST', body: { seconds: 86400 }, token: admin.token });
assert.equal((await api('/poj/state')).data.phase, 'guerra', 'GUERRA iniciada');
console.log('[f13] alistamento 2/2 → GUERRA');

// ---------- 3. Partida REAL: 2 humanos na mesma sala ----------
const c1 = await wsConnect(p1.token);
const c2 = await wsConnect(p2.token);
assert.ok(c1.matchFound && c2.matchFound, 'match_found para ambos');
assert.equal(c1.matchFound.roomId, c2.matchFound.roomId, 'mesma sala');
send(c1, { type: 'start', entry: 'belt' });
assert.ok(await waitEvent(c1, 'matchStart') && await waitEvent(c2, 'matchStart'), 'matchStart nos dois');
await sleep(600);
console.log(`[f13] sala ${c1.matchFound.roomId} em andamento`);

// ---------- 4. Corte no meio da partida + mine=1 (privacidade) ----------
const cm = await api('/poj/court-martial', { method: 'POST', body: { playerId: 'kr_player2', motivo: 'evasao' }, token: admin.token });
assert.equal(cm.status, 200, `remessa à Corte (${cm.data?.error ?? ''})`);

// antes do veredito: mine de quem NÃO tem caso vazio; mine do réu tem 1 pendente
const mine1a = (await api('/poj/court-martial/cases?mine=1', { token: p1.token })).data;
assert.equal(mine1a.mine, true, 'flag mine:true no docket escopado');
assert.equal(mine1a.cases.length, 0, 'p1 sem caso — mine vazio (não vê o do alheio)');
const mine2a = (await api('/poj/court-martial/cases?mine=1', { token: p2.token })).data;
assert.equal(mine2a.cases.length, 1, 'réu vê o próprio caso');
assert.equal(mine2a.pendentes, 1, 'contagem escopada: 1 pendente');
const caseId = mine2a.cases[0].id;
assert.ok(caseId.startsWith('cm-'), `caso próprio ${caseId}`);
console.log(`[f13] caso ${caseId} aberto — mine=1 escopa a ata do réu (p1 não vê)`);

// ---------- 5. Veredito honras de guerra → KRC real + evento ao vivo ----------
const verdict = await api('/poj/court-martial/verdict', {
  method: 'POST', body: { caseId, veredito: 'honras_de_guerra', nota: 'Caiu cobrindo a retirada do esquadrão' }, token: admin.token,
});
assert.equal(verdict.status, 200, `veredito (${verdict.data?.error ?? ''})`);
assert.equal(verdict.data.krc.kind, 'grant');
assert.equal(verdict.data.krc.applied, true);
assert.ok(verdict.data.krc.delta === 200, `ΔKRC +200 (got ${verdict.data.krc.delta})`);
assert.ok(verdict.data.caso.registro === 'honrado');
const saldoApos = verdict.data.krc.balance;
const cv = await waitEvent(c2, 'court_verdict');
assert.ok(cv && cv.caseId === caseId && cv.krcApplied === true && cv.krcDelta === 200, 'court_verdict ao vivo no réu');
console.log(`[f13] veredito honras_de_guerra → +200 KRC reais (saldo ${saldoApos}) + evento ao vivo`);

// ---------- 6. A ATA do caso REAL alimenta o MESMO motor do HUD ----------
const mine2b = (await api('/poj/court-martial/cases?mine=1', { token: p2.token })).data;
const casoReal = mine2b.cases.find((c) => c.id === caseId);
assert.equal(casoReal.status, 'julgado', 'caso julgado no mine');
assert.equal(casoReal.juiz, admin.user.username, 'juiz na ata');
assert.ok(casoReal.nota?.includes('retirada'), 'nota do juiz na ata');
assert.equal(casoReal.registro, 'honrado', 'registro na ata');
assert.equal(casoReal.xpVeredito, 200, 'XP do veredito na ata');
assert.ok(casoReal.krc?.balance === saldoApos, 'efeito KRC gravado no caso');
// efeito econômico no evento ao vivo também alimenta a ata (fonte do replay)
const steps = buildAtaSteps(casoReal, { krcEvent: cv });
assert.equal(steps.length, 6, '6 blocos da ata julgada');
const [abertura, evidencia, veredito, registro, krc, fim] = steps;
assert.ok(abertura.lines.some((l) => l.includes('kr_player2')), 'réu identificado');
assert.ok(abertura.lines.some((l) => l.includes('Evasão (8º artigo)')), 'motivo rotulado');
assert.ok(evidencia.lines.length >= 3, 'evidência apresentada');
assert.equal(veredito.lines[0], `Veredito: ${rotuloVeredito('honras_de_guerra')}.`);
assert.ok(veredito.lines.some((l) => l.includes(admin.user.username)), 'juiz no replay');
assert.ok(veredito.lines.some((l) => l.includes('Caiu cobrindo')), 'nota do juiz no replay');
assert.ok(registro.lines.some((l) => l.includes('HONRADO')), 'registro no replay');
assert.ok(registro.lines.some((l) => l.includes('+200 XP')), 'XP no replay');
assert.ok(krc.lines[0].includes('+200') && krc.lines[0].includes(`saldo ${saldoApos}`), 'efeito KRC no replay');
assert.ok(fim.lines.some((l) => l.includes('vida única')), 'preceito da vida única');
console.log('[f13] ATASÃO do caso REAL → 6 blocos encenados (abertura/evidência/veredito/registro/KRC/fim)');

// ---------- 7. RBAC + persistência real ----------
const denado = await api('/poj/court-martial/verdict', { method: 'POST', body: { caseId, veredito: 'absolvicao' }, token: p1.token });
assert.equal(denado.status, 403, 'jogador comum não julga');
// ledger real: lançamento court:<caseId>:<veredito> no histórico do réu
const hist = (await api('/economy/history', { token: p2.token })).data;
const entries = Array.isArray(hist) ? hist : hist.entries ?? [];
const grant = entries.find((e) => e.idempotencyKey === `court:${caseId}:honras_de_guerra`);
assert.ok(grant, 'lançamento court:* persistido no histórico real');
const compliance = (await api('/economy/compliance', { token: admin.token })).data;
assert.equal(compliance.ledgerIntact, true, 'ledger de dupla entrada íntegro');
console.log(`[f13] ledger real íntegro (${compliance.ledgerEntries} lançamentos) — court:${caseId} persistido`);

// admin com mine=1 continua vendo o docket completo (Marechal não é escopado)
const adminMine = (await api('/poj/court-martial/cases?mine=1', { token: admin.token })).data;
assert.equal(adminMine.cases.length >= 1, true, 'admin com mine=1 vê o docket completo');
assert.equal('mine' in adminMine, false, 'docket completo não carrega flag mine');

try { c1.ws.close(); c2.ws.close(); } catch {}
console.log('F13_SMOKE_OK');
process.exit(0);
