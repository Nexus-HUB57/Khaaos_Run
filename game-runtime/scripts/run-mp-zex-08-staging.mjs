#!/usr/bin/env node
// MP-ZEX-08 staging E2E: dois usuários reais, inputs WebSocket e movimento normal.
// Nenhum endpoint de debug/teleporte é usado; credenciais nunca são impressas.
import { WebSocket } from 'ws';
import { getWorldLayout, PLAYER_R } from '../src/game3d/sim3d.js';
import { doorBoxCollider } from '../src/game3d/interiorsPlan.js';
import { setTimeout as delay } from 'node:timers/promises';
import { resolveStagingConfig } from './mpzex-staging-env.mjs';

const { base } = resolveStagingConfig(process.env);

const HTTP_BASE = base.origin;
const REQUEST_TIMEOUT_MS = 12_000;
const TEST_TIMEOUT_MS = 240_000;
const sleep = (ms) => delay(ms);
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const safeLog = (message) => console.log(`[MP-ZEX-08] ${message}`);

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

function websocketUrl(token, resumeToken = null) {
  const url = new URL('/ws', HTTP_BASE);
  url.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
  url.searchParams.set('token', token);
  url.searchParams.set('mode', '3d');
  if (resumeToken) url.searchParams.set('resume', resumeToken);
  return url.toString();
}

function openClient(token, resumeToken = null, seqStart = 0) {
  const ws = new WebSocket(websocketUrl(token, resumeToken), { handshakeTimeout: REQUEST_TIMEOUT_MS });
  const client = { ws, inbox: [], waiters: [], latestSnapshot: null, seq: seqStart };
  client.closed = new Promise((resolve) => ws.once('close', (code) => resolve(code)));
  ws.once('close', (code, reason) => { client.closeCode = code; client.closeReason = reason.toString(); });
  ws.on('message', (raw) => {
    let message;
    try { message = JSON.parse(raw.toString()); } catch { return; }
    if (message.type === 'rejected') client.lastRejected = (message.violations ?? []).join(',');
    if (message.snapshot) client.latestSnapshot = message.snapshot;
    if (message.type === 'snapshot') client.latestSnapshot = message.snapshot;
    const waiterIndex = client.waiters.findIndex((waiter) => waiter.predicate(message));
    if (waiterIndex >= 0) {
      const [waiter] = client.waiters.splice(waiterIndex, 1);
      clearTimeout(waiter.timer);
      waiter.resolve(message);
    } else {
      client.inbox.push(message);
      if (client.inbox.length > 300) client.inbox.splice(0, client.inbox.length - 300);
    }
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout ao abrir WebSocket do staging.')), REQUEST_TIMEOUT_MS);
    ws.once('open', () => { clearTimeout(timer); resolve(client); });
    ws.once('error', () => { clearTimeout(timer); reject(new Error('Falha ao conectar WebSocket; detalhes de URL/token omitidos.')); });
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
      reject(new Error(`Timeout esperando ${description}.`));
    }, timeoutMs);
    client.waiters.push(waiter);
  });
}

async function waitSnapshot(client, predicate, description, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const snapshot = client.latestSnapshot;
    if (snapshot && predicate(snapshot)) return snapshot;
    await sleep(40);
  }
  throw new Error(`Timeout esperando estado do staging: ${description}.`);
}

function send(client, payload) {
  if (client.ws.readyState !== WebSocket.OPEN) throw new Error(`WebSocket fechou antes de concluir o cenário (code ${client.closeCode ?? 'indisponível'}, motivo ${client.closeReason || 'indisponível'}, última rejeição ${client.lastRejected || 'nenhuma'}).`);
  client.ws.send(JSON.stringify(payload));
}

function sendInput(client, over = {}) {
  client.seq += 1;
  const input = {
    seq: client.seq, dx: 0, dy: 0, yaw: client.lastSentYaw ?? client.latestSnapshot?.player?.yaw ?? 0, pitch: 0,
    fire: false, ads: false, sprint: false, crouch: false, jump: false,
    interact: false, reload: false, medkit: false, throw: false, gloo: false,
    ability: false, slot: 0, clientDt: 0.05, ...over,
  };
  send(client, {
    type: 'input',
    input,
  });
  client.lastSentYaw = input.yaw;
}

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

function findPath(start, terminal, snapshot, grid) {
  const { step, count, blocked, toIndex, point } = grid;
  const goals = new Set();
  const activeLoot = (snapshot.loot ?? []).filter((item) => item.active);
  for (let iz = 0; iz < count; iz += 1) {
    for (let ix = 0; ix < count; ix += 1) {
      const index = iz * count + ix;
      if (blocked[index]) continue;
      const p = point(index);
      const td = Math.hypot(p.x - terminal.x, p.z - terminal.z);
      if (td < 1.45 || td > 2.75) continue;
      if (activeLoot.some((item) => Math.hypot(p.x - item.x, p.z - item.z) < 2.65)) continue;
      goals.add(index);
    }
  }
  if (!goals.size) return null;

  let startIndex = toIndex(start.x, start.z);
  if (blocked[startIndex]) {
    let best = null;
    for (let radius = 1; radius <= 5 && best === null; radius += 1) {
      for (let dz = -radius; dz <= radius; dz += 1) for (let dx = -radius; dx <= radius; dx += 1) {
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
  const heap = [];
  const push = (node) => {
    heap.push(node);
    let i = heap.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (heap[p].f <= node.f) break; heap[i] = heap[p]; i = p; }
    heap[i] = node;
  };
  const pop = () => {
    const root = heap[0], tail = heap.pop();
    if (heap.length && tail) {
      let i = 0;
      while (true) {
        let child = i * 2 + 1;
        if (child >= heap.length) break;
        if (child + 1 < heap.length && heap[child + 1].f < heap[child].f) child += 1;
        if (heap[child].f >= tail.f) break;
        heap[i] = heap[child]; i = child;
      }
      heap[i] = tail;
    }
    return root;
  };
  push({ index: startIndex, g: 0, f: heuristic(startIndex) });
  const moves = [[1,0,1],[-1,0,1],[0,1,1],[0,-1,1],[1,1,Math.SQRT2],[1,-1,Math.SQRT2],[-1,1,Math.SQRT2],[-1,-1,Math.SQRT2]];
  let found = -1, expansions = 0;
  while (heap.length && expansions < count * count) {
    const current = pop();
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
      push({ index: next, g: tentative, f: tentative + heuristic(next) });
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

function segmentClear(a, b, grid) {
  const length = distance(a, b);
  const samples = Math.max(1, Math.ceil(length / 0.4));
  for (let i = 1; i <= samples; i += 1) {
    const t = i / samples;
    const x = a.x + (b.x - a.x) * t;
    const z = a.z + (b.z - a.z) * t;
    if (grid.isBlockedAt(x, z)) return false;
    // margem extra para colisão de quina: rejeita segmentos que passam a
    // menos de 0,55 m (raio do ator + folga) da borda de qualquer bloco.
    for (const box of grid.blockers) {
      const nearestX = Math.max(box.minX, Math.min(x, box.maxX));
      const nearestZ = Math.max(box.minZ, Math.min(z, box.maxZ));
      if (Math.hypot(x - nearestX, z - nearestZ) < PLAYER_R + 0.55) return false;
    }
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

async function navigateToTerminal(client, terminal, path, label) {
  const waypoints = smoothPath(path, client.grid);
  const deadline = Date.now() + TEST_TIMEOUT_MS;
  let waypointIndex = 1;
  let lastPosition = null;
  let bestDistance = Infinity;
  let lastProgressAt = Date.now();
  let lastDebugAt = 0;
  let unstickAttempts = 0;
  let unstickUntil = 0;
  let unstickSide = 1;
  while (Date.now() < deadline) {
    const snapshot = client.latestSnapshot;
    const player = snapshot?.player;
    if (!player || !player.alive || player.knocked) throw new Error(`Conta ${label} não sobreviveu à navegação até ZEX.`);
    const terminalDistance = Math.hypot(player.x - terminal.x, player.z - terminal.z);
    if (terminalDistance < 2.85) {
      sendInput(client);
      return;
    }
    if (Date.now() - lastDebugAt > 2_500) {
      lastDebugAt = Date.now();
      safeLog(`${label}: pos=(${player.x.toFixed(1)},${player.z.toFixed(1)}) d_terminal=${terminalDistance.toFixed(1)} waypoint=${waypointIndex}/${waypoints.length} vida=${player.life ?? '?'} medkit=${player.life < 75 && (player.inventory?.medkit ?? 0) > 0}`);
    }
    // Travou por >3 s (quina/micro-obstáculo imprevisto): manobra de jogador
    // real — sidestep perpendicular alternado com hop; depois retoma a rota.
    if (Date.now() - lastProgressAt > 3_000 && unstickAttempts < 10 && Date.now() > unstickUntil) {
      unstickAttempts += 1;
      unstickSide = -unstickSide;
      unstickUntil = Date.now() + 1_000;
      safeLog(`${label}: sem progresso — manobra de desimpedimento #${unstickAttempts} (sidestep ${unstickSide > 0 ? 'direita' : 'esquerda'} + hop)`);
      const hop = unstickAttempts % 3 === 1;
      for (let i = 0; i < 6; i += 1) {
        sendInput(client, { dx: unstickSide, dy: 0, jump: hop && i < 2 });
        await sleep(150);
      }
      lastProgressAt = Date.now();
      continue;
    }
    while (waypointIndex < waypoints.length && distance(player, waypoints[waypointIndex]) < 1.2) waypointIndex += 1;
    const target = waypoints[Math.min(waypointIndex, waypoints.length - 1)] ?? terminal;
    const dx = target.x - player.x, dz = target.z - player.z;
    const desiredYaw = Math.atan2(-dx, -dz); // input dy=-1: frente do ator aponta para o alvo
    const currentYaw = Number.isFinite(client.lastSentYaw) ? client.lastSentYaw : (Number.isFinite(player.yaw) ? player.yaw : 0);
    const yawDelta = Math.atan2(Math.sin(desiredYaw - currentYaw), Math.cos(desiredYaw - currentYaw));
    const yaw = currentYaw + Math.max(-0.3, Math.min(0.3, yawDelta)); // conserva margem abaixo do teto de 0,7 rad por input
    const aligned = Math.abs(yawDelta) <= 0.25;
    const medkit = player.life < 75 && (player.inventory?.medkit ?? 0) > 0;
    sendInput(client, { dy: aligned ? -1 : 0, yaw, sprint: aligned, medkit });
    await sleep(50);
    const now = client.latestSnapshot?.player;
    if (now) {
      const d = Math.hypot(now.x - terminal.x, now.z - terminal.z);
      if (d < bestDistance - 0.35) { bestDistance = d; lastProgressAt = Date.now(); }
      if (lastPosition && Math.hypot(now.x - lastPosition.x, now.z - lastPosition.z) > 0.15) lastProgressAt = Date.now();
      lastPosition = { x: now.x, z: now.z };
      if (Date.now() - lastProgressAt > 8_000) throw new Error(`Conta ${label} não progride pela rota até o terminal; sem teleport/debug, teste interrompido.`);
    }
  }
  throw new Error(`Timeout navegando com inputs normais até ZEX (${label}).`);
}

async function approachPair(a, b, terminal, paths) {
  a.grid = paths.grid; b.grid = paths.grid;
  safeLog(`Navegando A e B por inputs de gameplay até ${terminal.label ?? terminal.id}.`);
  await Promise.all([
    navigateToTerminal(a, terminal, paths.a, 'A').then(() => safeLog('A chegou ao alcance de interação.')),
    navigateToTerminal(b, terminal, paths.b, 'B').then(() => safeLog('B chegou ao alcance de interação.')),
  ]);
  const sa = a.latestSnapshot;
  const sb = b.latestSnapshot;
  if (!sa?.player || Math.hypot(sa.player.x - terminal.x, sa.player.z - terminal.z) >= 3.1) throw new Error('A não está mais no alcance ZEX após a navegação.');
  if (!sb?.player || Math.hypot(sb.player.x - terminal.x, sb.player.z - terminal.z) >= 3.1) throw new Error('B não está mais no alcance ZEX após a navegação.');
  if (!sa.player.alive || !sb.player.alive) throw new Error('Uma das contas não está viva ao chegar ao terminal.');
}

async function main() {
  const ready = await httpJson('/readyz');
  if (!ready.response.ok) throw new Error(`Staging não está pronto (readyz HTTP ${ready.response.status}).`);
  if (ready.data?.status && ready.data.status !== 'ready') throw new Error('Staging respondeu readyz, mas não declarou status=ready.');
  safeLog('Readiness do staging aprovada.');

  const [tokenA, tokenB] = await Promise.all([
    login(process.env.KR_STAGING_TEST_USER_A, process.env.KR_STAGING_TEST_PASSWORD_A, 'A'),
    login(process.env.KR_STAGING_TEST_USER_B, process.env.KR_STAGING_TEST_PASSWORD_B, 'B'),
  ]);
  safeLog('Duas contas de staging autenticadas.');
  const clients = [];
  try {
    const a = await openClient(tokenA); clients.push(a);
    const foundA = await waitMessage(a, (m) => m.type === 'match_found', 'match_found de A', 30_000);
    const b = await openClient(tokenB); clients.push(b);
    const foundB = await waitMessage(b, (m) => m.type === 'match_found', 'match_found de B', 30_000);
    if (foundA.roomId !== foundB.roomId) throw new Error('As duas contas caíram em salas distintas; teste cancelado sem afetar outras partidas.');
    if (!foundA.resumeToken) throw new Error('Servidor não enviou resumeToken para A.');
    a.lastSentYaw = 0; // validateInput3D inicia input3d.yaw em zero no servidor
    b.lastSentYaw = 0;
    safeLog('A e B estão na mesma sala de staging.');

    send(a, { type: 'start', entry: 'belt' });
    await waitSnapshot(a, (s) => s.state === 'IN_PROGRESS', 'partida iniciada', 30_000);
    await waitSnapshot(b, (s) => s.state === 'IN_PROGRESS', 'partida de B iniciada', 30_000);
    const [landedA, landedB] = await Promise.all([waitForLand(a, 'A'), waitForLand(b, 'B')]);
    const layout = getWorldLayout(landedA.seed, landedA.scenarioId);
    const grid = makeObstacleGrid(layout);
    const safeTerminals = (landedA.terminals ?? []).filter((terminal) => terminal.active
      && !(layout.doors ?? []).some((door) => Math.hypot(door.x - terminal.x, door.z - terminal.z) < 2.6)
      && !(landedA.loot ?? []).some((item) => item.active && Math.hypot(item.x - terminal.x, item.z - terminal.z) < 2.6));
    const plans = [];
    for (const terminal of safeTerminals) {
      const pathA = findPath(landedA.player, terminal, landedA, grid);
      const pathB = findPath(landedB.player, terminal, landedB, grid);
      if (pathA && pathB) plans.push({ terminal, pathA, pathB, score: pathA.length + pathB.length });
    }
    plans.sort((x, y) => x.score - y.score);
    const plan = plans[0];
    if (!plan) throw new Error('Nenhum terminal tem rota navegável para ambas as contas sem competir com loot/porta.');
    await approachPair(a, b, plan.terminal, { grid, a: plan.pathA, b: plan.pathB });
    const aAtChannelStart = a.latestSnapshot;
    const bAtChannelStart = b.latestSnapshot;
    const extractedBeforeA = aAtChannelStart?.player?.extracted ?? 0;
    const extractedBeforeB = bAtChannelStart?.player?.extracted ?? 0;
    const xpBefore = aAtChannelStart?.player?.xp ?? 0;

    sendInput(a, { interact: true });
    await sleep(70);
    sendInput(a, { interact: false });
    const channeling = await waitSnapshot(a, (s) => s.player?.zexChannel?.terminalId === plan.terminal.id && s.player.zexChannel.progress > 0, 'canal ZEX ativo em A', 5_000);
    if ((channeling.player.zexChannel.progress ?? 0) < 0.1) await waitSnapshot(a, (s) => s.player?.zexChannel?.terminalId === plan.terminal.id && s.player.zexChannel.progress >= 0.1, 'progresso inicial da canalização', 1_500);
    safeLog('Canal ZEX de A começou e avançou antes do close.');

    a.ws.terminate();
    await Promise.race([a.closed, sleep(1_000)]);
    const released = await waitSnapshot(b, (s) => {
      const terminal = s.terminals?.find((t) => t.id === plan.terminal.id);
      return terminal?.active === true && terminal.channeling === false && (terminal.channelProgress ?? 0) === 0;
    }, 'cancelamento imediato/liberação do terminal para B', 1_500);
    if ((released.player?.extracted ?? extractedBeforeB) !== extractedBeforeB) throw new Error('Disconnect alterou a contagem de extrações de B.');
    safeLog('MP-ZEX-08: desconexão liberou o terminal sem consumi-lo.');

    sendInput(b, { interact: true });
    await sleep(70);
    sendInput(b, { interact: false });
    await waitSnapshot(b, (s) => s.player?.zexChannel?.terminalId === plan.terminal.id, 'reserva do terminal por B', 5_000);
    safeLog('B reservou o mesmo terminal após a desconexão de A.');

    await sleep(100);
    const resumed = await openClient(tokenA, foundA.resumeToken, a.seq);
    resumed.lastSentYaw = 0; // a sessão WebSocket retomada cria novo input3d com yaw inicial zero
    clients.push(resumed);
    const resumedMessage = await waitMessage(resumed, (m) => m.type === 'resumed', 'resume de A', 8_000);
    const resumedSnapshot = resumedMessage.snapshot;
    if (!resumedSnapshot || resumedMessage.id !== foundA.id || resumedMessage.roomId !== foundA.roomId) throw new Error('Resume de A não recuperou a mesma identidade/sala.');
    if (resumedSnapshot.player?.zexChannel !== null) throw new Error('A retomou com canal ZEX ainda ativo.');
    const resumedTerminal = resumedSnapshot.terminals?.find((t) => t.id === plan.terminal.id);
    if (resumedTerminal?.channeling !== true) throw new Error('Resume não refletiu a nova reserva de B.');
    if ((resumedSnapshot.player?.extracted ?? 0) !== extractedBeforeA) throw new Error('A recebeu extração ao desconectar.');
    if ((resumedSnapshot.player?.xp ?? 0) - xpBefore >= 250) throw new Error('A recebeu a recompensa ZEX (+250 XP) ao desconectar.');
    if (!(resumedSnapshot.events ?? []).some((event) => event.type === 'extractCancelled' && event.reason === 'disconnect')) throw new Error('Snapshot de resume não preservou extractCancelled/disconnect.');
    safeLog('MP-ZEX-08 PASS: sem XP/extração para A; resume preservado; B canalizando o terminal.');
  } finally {
    for (const client of clients) {
      if (client.ws.readyState === WebSocket.OPEN || client.ws.readyState === WebSocket.CONNECTING) client.ws.close();
    }
  }
}

const runTimer = setTimeout(() => {
  console.error('[MP-ZEX-08] Timeout global; segredos e URL omitidos.');
  process.exit(1);
}, TEST_TIMEOUT_MS + 30_000);
runTimer.unref();
main().catch((error) => {
  console.error(`[MP-ZEX-08] FAIL: ${error?.message || 'erro desconhecido; detalhes sensíveis omitidos.'}`);
  process.exitCode = 1;
}).finally(() => clearTimeout(runTimer));
