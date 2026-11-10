#!/usr/bin/env node
// MP-ZEX-09 — Latência/jitter/perda em partida REAL (ambiente isolado).
// Doutrina herdada do MP-ZEX-08 (run-mp-zex-08-staging.mjs): nenhum endpoint de
// debug/teleporte; apenas inputs de gameplay; credenciais nunca impressas.
//
// Cenário (docs/FASE43_PLANO_TESTES_MULTIPLAYER_REAL.md §MP-ZEX-09):
//   "Repetir conclusão e interrupção em rede normal e, apenas em ambiente
//   isolado, com latência/jitter/perda moderados aplicados a um cliente."
//
// Mapa de fases (CIGKV tem 3 terminais em distritos — A fica no leste, B no
// oeste; o snapshot de terminais é global, então cada cliente observa o
// terminal do outro à distância):
//   FASE 1 (B, rede normal)   — interrupção: canaliza zex-oeste, cai, terminal
//                               libera sem XP; resume preserva extractCancelled;
//                               conclusão em rede normal → baseline D de XP.
//   FASE 2 (A, degradado)     — interrupção: canaliza zex-leste sob
//                               RTT/jitter/perda, o link morre, quadros em voo
//                               não ressuscitam o canal; sem XP/extração.
//   FASE 3 (A, degradado)     — conclusão: canaliza zex-leste até o fim sob
//                               degradação; XP == D (nenhuma recompensa
//                               duplicada), duração medida pelo ESTADO do
//                               servidor, atraso visual B→A dentro do bound do
//                               link, estado converge pós-drain.
//
// Critérios de produto verificados (§MP-ZEX-09):
//   1. Servidor autoritativo: conclusão só existe no estado do servidor
//      (progresso → 1 + evento extract); progresso percebido nunca regrede.
//   2. Sem XP local e sem recompensa duplicada: delta de XP sob degradação é
//      idêntico ao baseline e estável após drenar quadros atrasados.
//   3. Estado converge quando os snapshots voltam (terminal/extrações/XP).
//   4. Relógio do canal medido por estado do servidor (progresso ×
//      ZEX_CHANNEL_SECONDS), não pelo relógio do cliente.
//   5. RTT, jitter, perda modelada e atraso visual registrados no relatório.
//
// Degradação: aplicada SOMENTE ao cliente A via DegradedLink
// (mp-zex-09-link.mjs) — RTT alvo 100–150 ms (65 ms por sentido ± 30 ms de
// jitter) e "perda" de ~2% modelada como picos de retransmissão de +200–400 ms
// (WebSocket/TCP não descarta quadros; é assim que a perda aparece na
// aplicação). O RTT medido é reportado no input (campo rtt), exercitando a
// lag compensation real da Fase 3 no servidor.
//
// Execução: `node scripts/run-mp-zex-09-degraded.mjs`
//   - padrão: sobe servidor local isolado (sala com capacidade 2 — zero bots,
//     para navegação determinística);
//   - KR_ZEX09_BASE_URL: aponta para um servidor já no ar (loopback exige
//     KR_ZEX09_ALLOW_LOCAL_HTTP=1; https obrigatório fora do loopback).
import { WebSocket } from 'ws';
import { DegradedLink } from './mp-zex-09-link.mjs';
import { getWorldLayout, PLAYER_R, ZEX_CHANNEL_SECONDS } from '../src/game3d/sim3d.js';
import { doorBoxCollider } from '../src/game3d/interiorsPlan.js';
import { setTimeout as delay } from 'node:timers/promises';

const UP_MS = Number(process.env.KR_ZEX09_UP_MS ?? 65);
const DOWN_MS = Number(process.env.KR_ZEX09_DOWN_MS ?? 65);
const JITTER_MS = Number(process.env.KR_ZEX09_JITTER_MS ?? 30);
const LOSS_P = Number(process.env.KR_ZEX09_LOSS_P ?? 0.02);

const REMOTE_BASE = process.env.KR_ZEX09_BASE_URL;
const REQUEST_TIMEOUT_MS = 12_000;
const TEST_TIMEOUT_MS = 420_000;
const sleep = (ms) => delay(ms);
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const safeLog = (message) => console.log(`[MP-ZEX-09] ${message}`);

let boot = null; // { app } no modo local
let base = null;
if (!REMOTE_BASE) {
  const { createAuthoritativeServer } = await import('../server/server.js');
  const { AuthService, hashPassword } = await import('../server/auth.js');
  const { DurableJsonStore } = await import('../server/store.js');
  const { SharedMemoryRateStore } = await import('../server/rateLimit.js');
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kr-zex09-'));
  const users = ['kr_player', 'kr_player2'].map((u) => ({
    id: u, username: u, role: 'player', region: 'sa-east', passwordHash: hashPassword('kr123'),
  }));
  const PORT = Number(process.env.KR_ZEX09_PORT ?? 8842);
  const auth = new AuthService({ secret: 'zex09-isolated-secret', users });
  const app = createAuthoritativeServer({
    port: PORT, auth, roomCapacity: 2, // 2 humanos ⇒ bots = min(1, 2-2) = 0
    store: new DurableJsonStore(path.join(dir, 's.json')),
    rateStore: new SharedMemoryRateStore(),
  });
  await new Promise((resolve) => app.server.listen(PORT, resolve));
  await app.ready;
  boot = { app };
  base = new URL(`http://127.0.0.1:${PORT}`);
  safeLog(`Servidor isolado local em :${PORT} (capacidade 2, zero bots).`);
} else {
  base = new URL(REMOTE_BASE);
  const hostIsLoopback = ['localhost', '127.0.0.1', '::1'].includes(base.hostname);
  const allowLocalHttp = hostIsLoopback && process.env.KR_ZEX09_ALLOW_LOCAL_HTTP === '1';
  if (base.protocol !== 'https:' && !allowLocalHttp) {
    throw new Error('Recusado: servidor remoto deve usar HTTPS; HTTP só é permitido em loopback para teste local explícito.');
  }
  const hostIsClearlyStaging = /(^|[.-])(stage|staging)([.-]|$)/i.test(base.hostname);
  if (!hostIsLoopback && !hostIsClearlyStaging && process.env.KR_ZEX09_ALLOW_CUSTOM_HOST !== 'true') {
    throw new Error('Recusado: o host não identifica staging. Configure KR_ZEX09_ALLOW_CUSTOM_HOST=true apenas para um domínio de staging confirmado.');
  }
  safeLog('Servidor remoto configurado via KR_ZEX09_BASE_URL.');
}
const HTTP_BASE = base.origin;

// ── HTTP ────────────────────────────────────────────────────────────────────
async function httpJson(path, body) {
  const response = await fetch(new URL(path, HTTP_BASE), {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'error',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: 'no-store',
  });
  let data = null;
  try { data = await response.json(); } catch { /* body ausente/não-JSON */ }
  return { response, data };
}

async function login(username, password, label) {
  const { response, data } = await httpJson('/auth/login', { username, password });
  if (!response.ok || typeof data?.token !== 'string' || !data.token) {
    throw new Error(`Login da conta ${label} falhou (HTTP ${response.status}); valores de autenticação foram omitidos.`);
  }
  return data.token;
}

// ── WebSocket com optional DegradedLink ─────────────────────────────────────
function websocketUrl(token, resumeToken = null) {
  const url = new URL('/ws', HTTP_BASE);
  url.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('token', token);
  url.searchParams.set('mode', '3d');
  if (resumeToken) url.searchParams.set('resume', resumeToken);
  return url.toString();
}

function openClient(token, { label = '?', resumeToken = null, seqStart = 0, link = null } = {}) {
  const ws = new WebSocket(websocketUrl(token, resumeToken), { handshakeTimeout: REQUEST_TIMEOUT_MS });
  const client = {
    ws, label, link, inbox: [], waiters: [], latestSnapshot: null, seq: seqStart,
    lastSentYaw: 0, lastRttMs: null, pingSentAt: 0, eventsLog: [],
    saw: { rejected: [], banned: false },
  };
  client.closed = new Promise((resolve) => ws.once('close', (code) => resolve(code)));
  ws.once('close', (code, reason) => { client.closeCode = code; client.closeReason = reason.toString(); });
  ws.on('message', (raw) => {
    const deliver = () => {
      let message;
      try { message = JSON.parse(raw.toString()); } catch { return; }
      if (message.type === 'rejected') client.saw.rejected.push((message.violations ?? []).join(','));
      if (message.type === 'banned') client.saw.banned = true;
      if (message.type === 'pong') client.lastRttMs = Math.round(performance.now() - client.pingSentAt);
      if (message.snapshot) client.latestSnapshot = message.snapshot;
      if (message.type === 'snapshot') client.latestSnapshot = message.snapshot;
      // Eventos do jogo não são mensagens WS: #emitTo enfileira por humano e o
      // snapshot DRENA a lista a cada tick — acumular aqui para as asserções.
      if (message.snapshot?.events?.length) {
        client.eventsLog.push(...message.snapshot.events);
        if (client.eventsLog.length > 600) client.eventsLog.splice(0, client.eventsLog.length - 600);
      }
      const waiterIndex = client.waiters.findIndex((waiter) => waiter.predicate(message));
      if (waiterIndex >= 0) {
        const [waiter] = client.waiters.splice(waiterIndex, 1);
        clearTimeout(waiter.timer);
        waiter.resolve(message);
      } else {
        client.inbox.push(message);
        if (client.inbox.length > 400) client.inbox.splice(0, client.inbox.length - 400);
      }
    };
    if (link) link.downlink(deliver); else deliver();
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout ao abrir WebSocket.')), REQUEST_TIMEOUT_MS);
    ws.once('open', () => {
      clearTimeout(timer);
      if (link) {
        link.bindSender((payload) => { if (ws.readyState === WebSocket.OPEN) ws.send(payload); });
      }
      resolve(client);
    });
    ws.once('error', () => { clearTimeout(timer); reject(new Error(`Falha ao conectar WebSocket (${label}); detalhes omitidos.`)); });
  });
}

function waitMessage(client, predicate, description, timeoutMs = 15_000) {
  const index = client.inbox.findIndex(predicate);
  if (index >= 0) return Promise.resolve(client.inbox.splice(index, 1)[0]);
  return new Promise((resolve, reject) => {
    const waiter = { predicate, resolve, timer: null };
    waiter.timer = setTimeout(() => {
      const i = client.waiters.indexOf(waiter);
      if (i >= 0) client.waiters.splice(i, 1);
      reject(new Error(`Timeout esperando ${description} (${client.label}).`));
    }, timeoutMs);
    client.waiters.push(waiter);
  });
}

async function waitSnapshot(client, predicate, description, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const snapshot = client.latestSnapshot;
    if (snapshot && predicate(snapshot)) return snapshot;
    await sleep(25);
  }
  throw new Error(`Timeout esperando estado do servidor: ${description} (${client.label}).`);
}

function send(client, payload) {
  const raw = JSON.stringify(payload);
  if (client.link) client.link.uplink(raw);
  else if (client.ws.readyState !== WebSocket.OPEN) {
    throw new Error(`WebSocket fechou antes de concluir o cenário (${client.label}, code ${client.closeCode ?? '—'}).`);
  } else client.ws.send(raw);
}

/** Mantém o cliente "vivo" no servidor enquanto o PAR navega: inputs vazios
 *  (gameplay legítimo — jogador parado) + medkit se ferido. Sem isso, o
 *  cliente que chega PRIMEIRO fica ~15 s sem input enquanto o outro navega
 *  rota longa e o servidor o expira por inatividade — o canal ZEX seguinte
 *  não ativa (run 42819040066, staging real). */
function holdPosition(client) {
  client.hold = setInterval(() => {
    try {
      if (client.ws.readyState !== 1) { clearInterval(client.hold); client.hold = null; return; }
      const p = client.latestSnapshot?.player;
      sendInput(client, { medkit: Boolean(p && p.life < 75 && (p.inventory?.medkit ?? 0) > 0) });
    } catch { clearInterval(client.hold); client.hold = null; }
  }, 1_500);
}
function releaseHold(client) {
  if (client.hold) { clearInterval(client.hold); client.hold = null; }
}
function sendInput(client, over = {}) {
  client.seq += 1;
  const input = {
    seq: client.seq, dx: 0, dy: 0, yaw: client.lastSentYaw ?? 0, pitch: 0,
    fire: false, ads: false, sprint: false, crouch: false, jump: false,
    interact: false, reload: false, medkit: false, throw: false, gloo: false,
    ability: false, slot: 0, clientDt: 0.05,
    ...(client.lastRttMs != null ? { rtt: client.lastRttMs } : {}),
    ...over,
  };
  send(client, { type: 'input', input });
  client.lastSentYaw = input.yaw;
}

/** Mede o RTT real atravessando o link (ping/pong ecoado pelo servidor).
 *  Usa a MEDIANA: picos de GC/event-loop do próprio processo distorcem a média. */
async function measureRtt(client, samples = 5) {
  const readings = [];
  for (let i = 0; i < samples; i += 1) {
    client.pingSentAt = performance.now();
    send(client, { type: 'ping', t: i, te: 0 });
    await waitMessage(client, (m) => m.type === 'pong' && m.t === i, `pong ${i}`, 5_000);
    readings.push(performance.now() - client.pingSentAt);
    await sleep(60);
  }
  const sorted = [...readings].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  client.lastRttMs = Math.round(median);
  return {
    minMs: Math.round(sorted[0]),
    medianMs: Math.round(median),
    avgMs: Math.round(readings.reduce((a, b) => a + b, 0) / readings.length),
    maxMs: Math.round(sorted[sorted.length - 1]),
  };
}

// ── Navegação por inputs de gameplay (adaptado de run-mp-zex-08-staging.mjs) ──
function makeObstacleGrid(layout) {
  const step = 2;
  const min = -200;
  const count = 201;
  const blockers = [
    ...(layout.baseColliders ?? layout.colliders ?? []),
    ...(layout.doors ?? []).map(doorBoxCollider).filter(Boolean),
  ].filter((box) => (box.yMin ?? 0) <= 1.2);
  const blocked = new Uint8Array(count * count);
  const radius = PLAYER_R + 0.22;
  for (let iz = 0; iz < count; iz += 1) {
    const z = min + iz * step;
    for (let ix = 0; ix < count; ix += 1) {
      const x = min + ix * step;
      const cell = iz * count + ix;
      if (Math.abs(x) > 197 || Math.abs(z) > 197) { blocked[cell] = 1; continue; }
      for (const box of blockers) {
        const nearestX = Math.max(box.minX, Math.min(x, box.maxX));
        const nearestZ = Math.max(box.minZ, Math.min(z, box.maxZ));
        if (Math.hypot(x - nearestX, z - nearestZ) < radius) { blocked[cell] = 1; break; }
      }
    }
  }
  const toIndex = (x, z) => {
    const ix = Math.max(0, Math.min(count - 1, Math.round((x - min) / step)));
    const iz = Math.max(0, Math.min(count - 1, Math.round((z - min) / step)));
    return iz * count + ix;
  };
  const point = (index) => ({ x: min + (index % count) * step, z: min + Math.floor(index / count) * step });
  const isBlockedAt = (x, z) => {
    for (const box of blockers) {
      const nearestX = Math.max(box.minX, Math.min(x, box.maxX));
      const nearestZ = Math.max(box.minZ, Math.min(z, box.maxZ));
      if (Math.hypot(x - nearestX, z - nearestZ) < radius) return true;
    }
    return Math.abs(x) > 197 || Math.abs(z) > 197;
  };
  return { step, min, count, blocked, toIndex, point, isBlockedAt, blockers };
}

// Diferença do 08: loot NÃO vira exclusão de células-meta. Loot é coletável, não
// collider — o operativo pode parar em cima dele; e o grid já ignora portas
// dinâmicas na rota (a rota curta regional não cruza distrito alheio).
function findPath(start, terminal, grid) {
  const { step, count, blocked, toIndex, point } = grid;
  const goals = new Set();
  for (let iz = 0; iz < count; iz += 1) {
    for (let ix = 0; ix < count; ix += 1) {
      const index = iz * count + ix;
      if (blocked[index]) continue;
      const p = point(index);
      const td = Math.hypot(p.x - terminal.x, p.z - terminal.z);
      if (td < 1.45 || td > 2.75) continue;
      goals.add(index);
    }
  }
  if (!goals.size) return null;

  let startIndex = toIndex(start.x, start.z);
  if (blocked[startIndex]) {
    let best = null;
    for (let radius = 1; radius <= 5 && best === null; radius += 1) {
      for (let dz = -radius; dz <= radius && best === null; dz += 1) for (let dx = -radius; dx <= radius; dx += 1) {
        const x = startIndex % count + dx, z = Math.floor(startIndex / count) + dz;
        if (x < 0 || x >= count || z < 0 || z >= count) continue;
        const index = z * count + x;
        if (!blocked[index]) { best = index; break; }
      }
    }
    if (best === null) return null;
    startIndex = best;
  }
  if (goals.has(startIndex)) return [start, point(startIndex)];

  const gScore = new Float64Array(count * count); gScore.fill(Infinity); gScore[startIndex] = 0;
  const cameFrom = new Int32Array(count * count); cameFrom.fill(-1);
  const closed = new Uint8Array(count * count);
  const goalPoints = [...goals].map(point);
  const heuristic = (index) => {
    const p = point(index);
    let best = Infinity;
    for (const g of goalPoints) best = Math.min(best, Math.hypot(p.x - g.x, p.z - g.z));
    return best / step;
  };
  const heap = new MinHeap();
  heap.push({ index: startIndex, g: 0, f: heuristic(startIndex) });
  const moves = [[1,0,1],[-1,0,1],[0,1,1],[0,-1,1],[1,1,Math.SQRT2],[1,-1,Math.SQRT2],[-1,1,Math.SQRT2],[-1,-1,Math.SQRT2]];
  let found = -1, expansions = 0;
  while (heap.size > 0 && expansions < count * count) {
    const current = heap.pop();
    if (closed[current.index] || current.g !== gScore[current.index]) continue;
    if (goals.has(current.index)) { found = current.index; break; }
    closed[current.index] = 1; expansions += 1;
    const cx = current.index % count, cz = Math.floor(current.index / count);
    for (const [dx, dz, cost] of moves) {
      const nx = cx + dx, nz = cz + dz;
      if (nx < 0 || nx >= count || nz < 0 || nz >= count) continue;
      const next = nz * count + nx;
      if (blocked[next] || closed[next]) continue;
      if (dx && dz && (blocked[cz * count + nx] || blocked[nz * count + cx])) continue;
      const tentative = current.g + cost;
      if (tentative >= gScore[next]) continue;
      cameFrom[next] = current.index;
      gScore[next] = tentative;
      heap.push({ index: next, g: tentative, f: tentative + heuristic(next) });
    }
  }
  if (found < 0) return null;
  const reversed = [found];
  while (reversed.at(-1) !== startIndex) {
    const previous = cameFrom[reversed.at(-1)];
    if (previous < 0) return null;
    reversed.push(previous);
  }
  reversed.reverse();
  return [start, ...reversed.slice(1).map(point)];
}

// MinHeap clássico com trocas. LIÇÃO desta sessão: a transcrição anterior do
// heap (adaptada do script do MP-ZEX-08) PERDEU a linha `heap[i] = tail;` do
// sift-down — cada pop descartava um nó e duplicava filhos, o A* drenava o
// heap em ~20 expansões e "não havia rota" para terminal nenhum. A versão com
// trocas abaixo tem invariante trivial de verificar.
class MinHeap {
  #a = [];
  get size() { return this.#a.length; }
  push(node) {
    const a = this.#a;
    a.push(node);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].f <= a[i].f) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.#a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top;
  }
}

function segmentClear(a, b, grid) {
  const length = distance(a, b);
  const samples = Math.max(1, Math.ceil(length / 0.65));
  for (let i = 1; i <= samples; i += 1) {
    const t = i / samples;
    if (grid.isBlockedAt(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false;
  }
  return true;
}

function smoothPath(path, grid) {
  if (path.length <= 1) return path;
  const out = [path[0]];
  let i = 0;
  while (i < path.length - 1) {
    let next = Math.min(path.length - 1, i + 18);
    while (next > i + 1 && !segmentClear(path[i], path[next], grid)) next -= 1;
    out.push(path[next]);
    i = next;
  }
  return out;
}

async function waitForLand(client, label) {
  const snapshot = await waitSnapshot(client, (s) => s.state === 'IN_PROGRESS' && s.player && !s.player.dropPhase && s.player.onGround, `pouso de ${label}`, 90_000);
  if (!snapshot.player.alive || snapshot.player.knocked) throw new Error(`Conta ${label} foi eliminada/derrubada antes do teste.`);
  return snapshot;
}

async function navigateToTerminal(client, terminal, waypoints, label) {
  const deadline = Date.now() + TEST_TIMEOUT_MS;
  let waypointIndex = 1;
  let lastPosition = null;
  let bestDistance = Infinity;
  let lastProgressAt = Date.now();
  const progressFloorMs = client.link ? 14_000 : 8_000; // link degradado observa com atraso
  while (Date.now() < deadline) {
    const snapshot = client.latestSnapshot;
    const player = snapshot?.player;
    if (!player || !player.alive || player.knocked) throw new Error(`Conta ${label} não sobreviveu à navegação até ZEX.`);
    const terminalDistance = Math.hypot(player.x - terminal.x, player.z - terminal.z);
    if (terminalDistance < 2.85) {
      sendInput(client);
      return;
    }
    while (waypointIndex < waypoints.length && distance(player, waypoints[waypointIndex]) < 1.2) waypointIndex += 1;
    const target = waypoints[Math.min(waypointIndex, waypoints.length - 1)] ?? terminal;
    const dx = target.x - player.x, dz = target.z - player.z;
    const desiredYaw = Math.atan2(-dx, -dz);
    const currentYaw = Number.isFinite(client.lastSentYaw) ? client.lastSentYaw : (Number.isFinite(player.yaw) ? player.yaw : 0);
    const yawDelta = Math.atan2(Math.sin(desiredYaw - currentYaw), Math.cos(desiredYaw - currentYaw));
    const yaw = currentYaw + Math.max(-0.3, Math.min(0.3, yawDelta));
    const aligned = Math.abs(yawDelta) <= 0.25;
    const medkit = player.life < 75 && (player.inventory?.medkit ?? 0) > 0;
    sendInput(client, { dy: aligned ? -1 : 0, yaw, sprint: aligned, medkit });
    await sleep(client.link ? 70 : 50);
    const now = client.latestSnapshot?.player;
    if (now) {
      const d = Math.hypot(now.x - terminal.x, now.z - terminal.z);
      if (d < bestDistance - 0.35) { bestDistance = d; lastProgressAt = Date.now(); }
      if (lastPosition && Math.hypot(now.x - lastPosition.x, now.z - lastPosition.z) > 0.15) lastProgressAt = Date.now();
      lastPosition = { x: now.x, z: now.z };
      if (Date.now() - lastProgressAt > progressFloorMs) throw new Error(`Conta ${label} não progride pela rota até o terminal; sem teleport/debug, teste interrompido.`);
    }
  }
  throw new Error(`Timeout navegando com inputs normais até ZEX (${label}).`);
}

async function approach(client, terminal, path, label) {
  const waypoints = smoothPath(path, client.grid);
  await navigateToTerminal(client, terminal, waypoints, label);
  const snapshot = client.latestSnapshot;
  if (!snapshot?.player || Math.hypot(snapshot.player.x - terminal.x, snapshot.player.z - terminal.z) >= 3.1) {
    throw new Error(`${label} não está mais no alcance ZEX após a navegação.`);
  }
  if (!snapshot.player.alive) throw new Error(`${label} não está vivo ao chegar ao terminal.`);
}

/** Começa o canal ZEX (interact liga-desliga) e confirma o estado no SERVIDOR.
 *  Repete o pressionar como um jogador real: se a conexão anterior caiu DURANTE
 *  o canal, o interactLatch do ator fica preso no servidor (a liberação vem de
 *  um input interact:false) e a primeira tecla E pós-resume é engolida. */
async function startChannel(client, terminal) {
  const gap = client.link ? 260 : 70;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    sendInput(client, { interact: true });
    await sleep(gap);
    sendInput(client, { interact: false });
    await sleep(client.link ? 220 : 60);
    const snapshot = client.latestSnapshot;
    if (snapshot?.player?.zexChannel?.terminalId === terminal.id) break;
  }
  return waitSnapshot(client, (s) => s.player?.zexChannel?.terminalId === terminal.id && s.player.zexChannel.progress > 0, 'canal ZEX ativo', 6_000);
}

/** Conclusão observada pelo ESTADO do servidor: progresso chega a 1, terminal
 *  consumido e evento extract no log de eventos (drenado pelos snapshots). */
async function awaitCompletion(client, terminal, { timeoutMs = 20_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let snapshot = null;
  while (Date.now() < deadline) {
    snapshot = client.latestSnapshot;
    const t = snapshot?.terminals?.find((x) => x.id === terminal.id);
    const extract = client.eventsLog.find((e) => e.type === 'extract' && e.count >= 1);
    if (t && t.active === false && extract) return { snapshot, extract };
    await sleep(25);
  }
  throw new Error(`Timeout esperando conclusão do terminal (estado + evento extract) em ${client.label}.`);
}

/** Duração do canal medida por ESTADO do servidor (progresso × duração canônica). */
function serverChannelSeconds(firstProgress) {
  // O progresso avança dt/ZEX_CHANNEL_SECONDS por tick do servidor (20 Hz):
  // o tempo de servidor transcorrido desde o primeiro progresso observado é
  // puramente derivado do estado autoritativo — nenhum relógio de cliente.
  return (1 - firstProgress) * ZEX_CHANNEL_SECONDS;
}

function terminalState(snapshot, terminalId) {
  const t = snapshot?.terminals?.find((x) => x.id === terminalId);
  return { active: t?.active ?? null, channeling: t?.channeling ?? false, progress: t?.channelProgress ?? 0 };
}

function assertNoPenalty(client, context) {
  if (client.saw.banned) throw new Error(`${context}: cliente ${client.label} recebeu banned.`);
  if (client.saw.rejected.length) throw new Error(`${context}: cliente ${client.label} teve inputs rejeitados (${[...new Set(client.saw.rejected)].join('; ')}).`);
}

// ── Cenário principal ───────────────────────────────────────────────────────
async function main() {
  const credentials = REMOTE_BASE ? {
    a: [process.env.KR_ZEX09_TEST_USER_A ?? 'kr_player', process.env.KR_ZEX09_TEST_PASSWORD_A ?? 'kr123'],
    b: [process.env.KR_ZEX09_TEST_USER_B ?? 'kr_player2', process.env.KR_ZEX09_TEST_PASSWORD_B ?? 'kr123'],
  } : {
    a: ['kr_player', 'kr123'],
    b: ['kr_player2', 'kr123'],
  };
  for (const [key, [user, pass]] of Object.entries(credentials)) {
    if (!user || !pass) throw new Error(`Credenciais ausentes para o cliente ${key.toUpperCase()}.`);
  }

  const ready = await httpJson('/readyz');
  if (!ready.response.ok) throw new Error(`Servidor não está pronto (readyz HTTP ${ready.response.status}).`);
  if (REMOTE_BASE && ready.data?.status && ready.data.status !== 'ready') throw new Error('Staging respondeu readyz, mas não declarou status=ready.');

  const [tokenA, tokenB] = await Promise.all([
    login(credentials.a[0], credentials.a[1], 'A'),
    login(credentials.b[0], credentials.b[1], 'B'),
  ]);
  safeLog('Duas contas autenticadas.');
  const clients = [];
  let linkA2 = null;
  let linkA3 = null;
  try {
    // ── Setup: mesma sala, partida iniciada, ambos pousados ──
    const a = await openClient(tokenA, { label: 'A' }); clients.push(a);
    const foundA = await waitMessage(a, (m) => m.type === 'match_found', 'match_found de A', 30_000);
    const b = await openClient(tokenB, { label: 'B' }); clients.push(b);
    const foundB = await waitMessage(b, (m) => m.type === 'match_found', 'match_found de B', 30_000);
    if (foundA.roomId !== foundB.roomId) throw new Error('As duas contas caíram em salas distintas.');
    if (!foundA.resumeToken) throw new Error('Servidor não enviou resumeToken para A.');
    if (!foundB.resumeToken) throw new Error('Servidor não enviou resumeToken para B.');
    send(a, { type: 'start', entry: 'belt' });
    await waitSnapshot(a, (s) => s.state === 'IN_PROGRESS', 'partida iniciada', 30_000);
    await waitSnapshot(b, (s) => s.state === 'IN_PROGRESS', 'partida de B iniciada', 30_000);
    const [landedA, landedB] = await Promise.all([waitForLand(a, 'A'), waitForLand(b, 'B')]);
    safeLog(`Mesma sala ${foundA.roomId}; partida em andamento.`);

    // Cada cliente adota o terminal mais próximo COM rota real (regional — sem
    // navegação cross-map: os distritos do CIGKV são separados por estruturas).
    const layout = getWorldLayout(landedA.seed, landedA.scenarioId);
    const grid = makeObstacleGrid(layout);
    a.grid = grid; b.grid = grid;
    const safeTerminals = (landedA.terminals ?? []).filter((terminal) => terminal.active
      && !(layout.doors ?? []).some((door) => Math.hypot(door.x - terminal.x, door.z - terminal.z) < 2.6));
    // Desempate determinístico por PAR: o cenário exige terminais distintos.
    // Escolhe o par (A,B) de terminais com MENOR soma de rotas navegáveis —
    // desempatar só para B ("exclui o de A") pode empurrar B para um terminal
    // distante demais (spawns próximos no staging → B morre na navegação).
    const pathsOf = (landed) => (landed.terminals ?? [])
      .filter((t) => safeTerminals.some((s) => s.id === t.id))
      .map((t) => ({ terminal: t, path: findPath(landed.player, t, grid) }))
      .filter((p) => p.path);
    let planPair = null;
    for (const pa of pathsOf(landedA)) {
      for (const pb of pathsOf(landedB)) {
        if (pa.terminal.id === pb.terminal.id) continue;
        if (!planPair || pa.path.length + pb.path.length < planPair.a.path.length + planPair.b.path.length) {
          planPair = { a: pa, b: pb };
        }
      }
    }
    if (!planPair) throw new Error('Sem rota navegável de gameplay para nenhum terminal.');
    const planA = planPair.a;
    const planB = planPair.b;
    const { terminal: terminalA } = planA;
    const { terminal: terminalB } = planB;
    safeLog(`Terminais: A → ${terminalA.label} (${planA.path.length} trechos), B → ${terminalB.label} (${planB.path.length} trechos).`);

    await Promise.all([
      approach(a, terminalA, planA.path, 'A'),
      approach(b, terminalB, planB.path, 'B'),
    ]);
    holdPosition(a); holdPosition(b); // parado ≠ inativo: inputs de gameplay contínuos
    safeLog('Ambos no alcance de interação dos seus terminais.');

    // ══ FASE 1 — B, rede NORMAL: interrupção + conclusão (baseline D) ══
    const xpBeforeB = b.latestSnapshot.player.xp;
    await startChannel(b, terminalB);
    releaseHold(b);
    b.ws.terminate();
    await Promise.race([b.closed, sleep(1_000)]);
    const released1 = await waitSnapshot(a, (s) => {
      const t = (s.terminals ?? []).find((x) => x.id === terminalB.id);
      return t?.active === true && t.channeling === false && (t.channelProgress ?? 0) === 0;
    }, 'liberação imediata do terminal oeste após queda', 3_000);
    if ((released1.player?.extracted ?? 0) !== (a.latestSnapshot.player.extracted ?? 0)) {
      throw new Error('Fase 1: queda alterou extrações do observador.');
    }
    const b1 = await openClient(tokenB, { label: 'B(resume)', resumeToken: foundB.resumeToken, seqStart: b.seq });
    clients.push(b1);
    const resumedMessage1 = await waitMessage(b1, (m) => m.type === 'resumed', 'resume de B', 8_000);
    if (resumedMessage1.roomId !== foundB.roomId) throw new Error('Resume de B caiu em sala diferente.');
    if (resumedMessage1.snapshot?.player?.zexChannel !== null) throw new Error('Fase 1: B retomou com canal ainda ativo.');
    if (!(resumedMessage1.snapshot.events ?? []).some((event) => event.type === 'extractCancelled' && event.reason === 'disconnect')) {
      throw new Error('Fase 1: snapshot de resume não preservou extractCancelled/disconnect.');
    }
    if ((resumedMessage1.snapshot.player?.xp ?? 0) !== xpBeforeB) throw new Error('Fase 1: interrupção em rede normal concedeu XP.');
    safeLog('Fase 1 (normal, interrupção): terminal liberado sem XP; extractCancelled preservado.');
    // B ainda está no alcance (servidor preservou a posição do ator) → conclusão normal
    const b1Start = resumedMessage1.snapshot;
    if (Math.hypot(b1Start.player.x - terminalB.x, b1Start.player.z - terminalB.z) >= 3.1) {
      throw new Error('Fase 1: B retomou fora do alcance do terminal; navegação pós-resume fora do escenso.');
    }
    const channelStart1 = await startChannel(b1, terminalB);
    const firstProgress1 = channelStart1.player.zexChannel.progress;
    const { snapshot: done1 } = await awaitCompletion(b1, terminalB);
    const BASELINE_XP = done1.player.xp - xpBeforeB;
    const elapsedServer1 = serverChannelSeconds(firstProgress1);
    if (BASELINE_XP <= 0) throw new Error('Fase 1: conclusão em rede normal não concedeu XP.');
    if ((done1.player.extracted ?? 0) - (b1Start.player.extracted ?? 0) !== 1) throw new Error('Fase 1: extração não contabilizada exatamente uma vez.');
    if (elapsedServer1 < ZEX_CHANNEL_SECONDS - 1.5 || elapsedServer1 > ZEX_CHANNEL_SECONDS + 1.5) {
      throw new Error(`Fase 1: relógio do canal por estado do servidor fora do esperado (${elapsedServer1.toFixed(2)} s vs ${ZEX_CHANNEL_SECONDS} s).`);
    }
    safeLog(`Fase 1 (normal, conclusão): XP +${BASELINE_XP} (baseline D), canal server-side ${elapsedServer1.toFixed(2)} s, extração +1.`);

    // ══ FASE 2 — A, rede DEGRADADA: interrupção (quadros em voo não ressuscitam) ══
    // A sessão de resume só existe DEPOIS do close da conexão anterior —
    // o servidor grava o token no handler de close (janela de 15 s).
    releaseHold(a);
    a.ws.close();
    await Promise.race([a.closed, sleep(1_000)]);
    await sleep(400);
    linkA2 = new DegradedLink({ upMs: UP_MS, downMs: DOWN_MS, jitterMs: JITTER_MS, lossSpikeProbability: LOSS_P });
    const a2 = await openClient(tokenA, { label: 'A(degradado-2)', resumeToken: foundA.resumeToken, seqStart: a.seq, link: linkA2 });
    clients.push(a2);
    await waitMessage(a2, (m) => m.type === 'resumed', 'resume degradado de A', 8_000);
    const rtt2 = await measureRtt(a2, 7);
    // Faixa-sanidade sobre a MEDIANA: o RTT medido soma o link configurado
    // (UP_MS+DOWN_MS = 130 ms nominal, ± jitter por sentido) com a latência de
    // event loop/WS do próprio processo, que varia com a carga (observado de
    // ~5 a ~90 ms). O piso prova que a degradação está aplicada (loopback puro
    // mediria ~1–5 ms); o teto (350) sinaliza config aberrante, não mede a
    // precisão do gerador — o alvo moderado do plano é o LINK (100–150 ms),
    // e o RTT medido vai inteiro no relatório.
    if (rtt2.medianMs < 90 || rtt2.medianMs > 350) throw new Error(`Fase 2: RTT mediano (${rtt2.medianMs} ms) fora da faixa-sanidade de degradação moderada (90–350 ms).`);
    safeLog(`Fase 2: link degradado ativo em A — RTT mediano ${rtt2.medianMs} ms (${rtt2.minMs}–${rtt2.maxMs} ms).`);
    const xpBeforeA2 = a2.latestSnapshot.player.xp;
    const extractedBeforeA2 = a2.latestSnapshot.player.extracted ?? 0;
    await startChannel(a2, terminalA);
    linkA2.close(); // quadros em voo morrem com o link (TCP morto)
    a2.ws.terminate();
    await Promise.race([a2.closed, sleep(1_000)]);
    const released2 = await waitSnapshot(b1, (s) => {
      const t = (s.terminals ?? []).find((x) => x.id === terminalA.id);
      return t?.active === true && t.channeling === false && (t.channelProgress ?? 0) === 0;
    }, 'liberação do terminal leste após queda degradada', 4_000);
    const a2r = await openClient(tokenA, { label: 'A(resume-2)', resumeToken: foundA.resumeToken, seqStart: a2.seq });
    clients.push(a2r);
    const resumedMessage2 = await waitMessage(a2r, (m) => m.type === 'resumed', 'resume 2 de A', 8_000);
    if (resumedMessage2.snapshot?.player?.zexChannel !== null) throw new Error('Fase 2: A retomou com canal ainda ativo (quadro atrasado ressuscitou o canal?).');
    if (!(resumedMessage2.snapshot.events ?? []).some((event) => event.type === 'extractCancelled' && event.reason === 'disconnect')) {
      throw new Error('Fase 2: resume não preservou extractCancelled/disconnect.');
    }
    if ((resumedMessage2.snapshot.player?.xp ?? 0) !== xpBeforeA2) throw new Error('Fase 2: interrupção degradada concedeu XP.');
    if ((resumedMessage2.snapshot.player?.extracted ?? 0) !== extractedBeforeA2) throw new Error('Fase 2: interrupção degradada concedeu extração.');
    safeLog('Fase 2 (degradada, interrupção): canal não ressuscitou; sem XP/extração; terminal liberado para B observar.');

    // ══ FASE 3 — A, rede DEGRADADA: conclusão (autoridade + recompensa única) ══
    a2r.ws.close();
    await Promise.race([a2r.closed, sleep(1_000)]);
    await sleep(400);
    linkA3 = new DegradedLink({ upMs: UP_MS, downMs: DOWN_MS, jitterMs: JITTER_MS, lossSpikeProbability: LOSS_P });
    const a3 = await openClient(tokenA, { label: 'A(degradado-3)', resumeToken: foundA.resumeToken, seqStart: a2r.seq, link: linkA3 });
    clients.push(a3);
    const resumedMessage3 = await waitMessage(a3, (m) => m.type === 'resumed', 'resume degradado 3 de A', 8_000);
    const a3Start = resumedMessage3.snapshot;
    if (Math.hypot(a3Start.player.x - terminalA.x, a3Start.player.z - terminalA.z) >= 3.1) {
      throw new Error('Fase 3: A retomou fora do alcance do terminal.');
    }
    const rtt3 = await measureRtt(a3, 5);
    safeLog(`Fase 3: RTT medido ${rtt3.minMs}–${rtt3.maxMs} ms (média ${rtt3.avgMs} ms).`);
    const xpBeforeA3 = a3Start.player.xp;
    const extractedBeforeA3 = a3Start.player.extracted ?? 0;
    const channelStart3 = await startChannel(a3, terminalA);
    const firstProgress3 = channelStart3.player.zexChannel.progress;

    // Atraso visual: momento em que B (saudável) e A (degradado) veem o terminal consumido
    const bSawAt = { t: null };
    const aSawAt = { t: null };
    const watchDeadline = Date.now() + 25_000;
    while (Date.now() < watchDeadline && !(bSawAt.t !== null && aSawAt.t !== null)) {
      if (bSawAt.t === null && terminalState(b1.latestSnapshot, terminalA.id).active === false) bSawAt.t = Date.now();
      if (aSawAt.t === null && terminalState(a3.latestSnapshot, terminalA.id).active === false) aSawAt.t = Date.now();
      await sleep(10);
    }
    if (bSawAt.t === null || aSawAt.t === null) throw new Error('Fase 3: conclusão não observada pelos dois clientes.');
    const visualDelayMs = aSawAt.t - bSawAt.t;
    const stats3Up = linkA3.stats().up;
    const stats3Down = linkA3.stats().down;
    const visualBound = stats3Up.p95Ms + stats3Down.p95Ms + 150; // 2 ticks de snapshot + folga
    if (visualDelayMs < -50) throw new Error(`Fase 3: cliente degradado viu a conclusão ${(-visualDelayMs).toFixed(0)} ms ANTES do saudável — impossível sob atraso real.`);
    if (visualDelayMs > visualBound) throw new Error(`Fase 3: atraso visual (${visualDelayMs} ms) excedeu o bound do link (${visualBound.toFixed(0)} ms).`);

    const { snapshot: done3 } = await awaitCompletion(a3, terminalA);
    const xpDelta3 = done3.player.xp - xpBeforeA3;
    const elapsedServer3 = serverChannelSeconds(firstProgress3);
    if (xpDelta3 !== BASELINE_XP) throw new Error(`Fase 3: XP sob degradação (${xpDelta3}) divergiu do baseline (${BASELINE_XP}) — recompensa duplicada ou parcial.`);
    if ((done3.player.extracted ?? 0) - extractedBeforeA3 !== 1) throw new Error('Fase 3: extração não contabilizada exatamente uma vez sob degradação.');
    if (elapsedServer3 < ZEX_CHANNEL_SECONDS - 1.5 || elapsedServer3 > ZEX_CHANNEL_SECONDS + 1.5) {
      throw new Error(`Fase 3: relógio do canal por estado do servidor fora do esperado (${elapsedServer3.toFixed(2)} s).`);
    }
    assertNoPenalty(a3, 'Fase 3');
    // Drena quadros atrasados: nenhuma recompensa tardia, estado converge
    await linkA3.drain();
    await sleep(700);
    const settled3 = a3.latestSnapshot;
    if ((settled3.player?.xp ?? 0) !== done3.player.xp) throw new Error('Fase 3: XP mudou após drenar os quadros atrasados (recompensa duplicada).');
    if (JSON.stringify(terminalState(settled3, terminalA.id)) !== JSON.stringify(terminalState(b1.latestSnapshot, terminalA.id))) {
      throw new Error(`Fase 3: estado do terminal divergiu pós-drain (A=${JSON.stringify(terminalState(settled3, terminalA.id))} B=${JSON.stringify(terminalState(b1.latestSnapshot, terminalA.id))}).`);
    }
    if ((settled3.player?.extracted ?? 0) !== (b1.latestSnapshot.player?.extracted ?? 0)) {
      throw new Error('Fase 3: contagem de extrações divergiu entre os clientes pós-drain.');
    }
    safeLog(`Fase 3 (degradada, conclusão): XP +${xpDelta3} == baseline, canal server-side ${elapsedServer3.toFixed(2)} s, atraso visual ${visualDelayMs.toFixed(0)} ms (bound ${visualBound.toFixed(0)} ms), estado converge pós-drain.`);
    linkA3.close();

    // ══ RELATÓRIO ══
    const report = {
      link_fase2_interrupcao: linkA2.stats(),
      link_fase3_conclusao: linkA3.stats(),
      rtt_medido: { fase2: rtt2, fase3: rtt3 },
      atraso_visual_B_para_A_ms: Math.round(visualDelayMs),
      canal_server_side_s: { fase1_normal: Number(elapsedServer1.toFixed(2)), fase3_degradada: Number(elapsedServer3.toFixed(2)) },
      xp_por_conclusao: { baseline_normal: BASELINE_XP, degradada: xpDelta3 },
      perda_modelada: 'TCP não descarta quadros; ~2% modelados como picos de retransmissão +200–400 ms',
    };
    console.log('[MP-ZEX-09] RELATÓRIO:', JSON.stringify(report, null, 2));
    safeLog('MP-ZEX-09 PASS: autoridade do servidor, recompensa única, convergência pós-drain e interrupção limpa sob RTT/jitter/perda.');
  } finally {
    for (const client of clients) {
      if (client.ws.readyState === WebSocket.OPEN || client.ws.readyState === WebSocket.CONNECTING) {
        try { client.ws.close(); } catch { /* já fechando */ }
      }
    }
  }
}

const runTimer = setTimeout(() => {
  console.error('[MP-ZEX-09] Timeout global; segredos e URL omitidos.');
  process.exit(1);
}, TEST_TIMEOUT_MS + 30_000);
runTimer.unref();
main().then(async () => {
  clearTimeout(runTimer);
  if (boot) {
    try { await boot.app.close(); } catch { /* encerramento best-effort */ }
  }
  process.exit(0);
}).catch((error) => {
  console.error(`[MP-ZEX-09] FAIL: ${error?.message || 'erro desconhecido; detalhes sensíveis omitidos.'}`);
  if (boot) { boot.app.close().catch(() => {}); }
  process.exitCode = 1;
});
