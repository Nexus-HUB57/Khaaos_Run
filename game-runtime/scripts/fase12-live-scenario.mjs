// Cenário ao vivo para o teste de browser da Fase 12:
// sobe servidor real em :8820, leva o POJ à GUERRA, semeia saldos, abre uma
// partida REAL (WS que fica conectado) e remete kr_player2 à Corte Marcial.
// O julgamento em si é feito POR HUMANO no /console (agent-browser).
import { spawn } from 'node:child_process';
import { hashPassword } from '../server/auth.js';
import WebSocket from 'ws';

const PORT = 8820;
const BASE = `http://127.0.0.1:${PORT}`;
const users = ['kr_player', 'kr_player2', 'kr_admin'].map((u) => ({
  id: u, username: u, role: u === 'kr_admin' ? 'admin' : 'player', region: 'sa-east', passwordHash: hashPassword('kr123'),
}));

const server = spawn('node', ['server/server.js'], {
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const api = async (path, { method = 'GET', body, token } = {}) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
};

for (let i = 0; i < 80; i++) {
  try { if ((await fetch(`${BASE}/readyz`)).ok) break; } catch {}
  await sleep(250);
}
console.log('[live] servidor pronto em :' + PORT);

const admin = (await api('/auth/login', { method: 'POST', body: { username: 'kr_admin', password: 'kr123' } })).data;
const p1 = (await api('/auth/login', { method: 'POST', body: { username: 'kr_player', password: 'kr123' } })).data;
const b1 = (await api('/economy/balance', { token: p1.token })).data.amount;
const b2 = (await api('/economy/balance', { token: admin.token ? (await api('/auth/login', { method: 'POST', body: { username: 'kr_player2', password: 'kr123' } })).data.token : '' }));
await api('/economy/grant', { method: 'POST', body: { userId: 'kr_player', amount: Math.max(0, 3800 - b1), reason: 'seed_live', idempotencyKey: `live-p1-${b1}` }, token: admin.token });
const p2 = (await api('/auth/login', { method: 'POST', body: { username: 'kr_player2', password: 'kr123' } })).data;
const b2r = (await api('/economy/balance', { token: p2.token })).data.amount;
await api('/economy/grant', { method: 'POST', body: { userId: 'kr_player2', amount: Math.max(0, 4000 - b2r), reason: 'seed_live', idempotencyKey: `live-p2-${b2r}` }, token: admin.token });
console.log(`[live] saldos: p1=${(await api('/economy/balance', { token: p1.token })).data.amount} p2=${(await api('/economy/balance', { token: p2.token })).data.amount}`);

await api('/poj/register', { method: 'POST', body: {}, token: p1.token });
await api('/poj/register', { method: 'POST', body: { playerId: 'kr_player2' }, token: admin.token });
await api('/poj/advance', { method: 'POST', body: { seconds: 86400 }, token: admin.token });
console.log('[live] fase:', (await api('/poj/state')).data.phase);

// partida real: WS do kr_player segura a sala (o jogo roda com bots)
const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?token=${encodeURIComponent(p1.token)}&mode=3d`);
await new Promise((resolve, reject) => { ws.on('open', resolve); ws.on('error', reject); });
let matchFound = null;
ws.on('message', (raw) => { const m = JSON.parse(raw.toString()); if (m.type === 'match_found' && !matchFound) matchFound = m; });
for (let i = 0; i < 40 && !matchFound; i++) await sleep(100);
console.log('[live] sala:', matchFound?.roomId);
setInterval(() => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping', t: Date.now(), te: Date.now() })); }, 2000);
ws.send(JSON.stringify({ type: 'start', entry: 'belt' }));
await sleep(800);
console.log('[live] partida INICIADA (sala ao vivo)');

// caso aberto DURANTE a partida — aguarda julgamento humano no /console
const cm = await api('/poj/court-martial', { method: 'POST', body: { playerId: 'kr_player2', motivo: 'evasao' }, token: admin.token });
console.log('[live] caso remetido à Corte:', cm.status, JSON.stringify((await api('/poj/court-martial/cases', { token: admin.token })).data.cases.filter((c) => c.status === 'pendente').map((c) => c.id)));
console.log('[live] PRONTO — julgue em http://127.0.0.1:' + PORT + '/console (kr_admin/kr123)');
// mantém o processo vivo (partida + servidor no ar)
setInterval(() => {}, 60000);
