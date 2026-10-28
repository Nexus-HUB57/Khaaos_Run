#!/usr/bin/env node
// Khaaos Run — Cross-Replica Smoke AO VIVO (M3/M4): 2 réplicas REAIS + Redis REAL.
//
// Prova, em processos de sistema operacional separados (não in-process), a
// cadeia distribuída inteira com KR_DISTRIBUTED=1:
//   1. boot: 2 réplicas prontas (/readyz 200) com replicaIds distintos;
//   2. ownership REAL: lease da sala registrado no Redis (kr:own:{roomId} →
//      dono + fence) e réplica anunciada no registro (kr:replica:{id} → URL);
//   3. redirect REAL: reconexão na réplica ERRADA devolve `redirect` com a URL
//      do dono vivo (lida do Redis) e fecha 4003;
//   4. resume REAL: reconexão no dono retoma o MESMO ator na MESMA sala
//      (sem duplicar jogador);
//   5. relay REAL: room_open publicado pela réplica A aparece no espelho da
//      réplica B (mirrorApplied > 0) via stream Redis com seq monotônica;
//   6. failover REAL: SIGKILL no dono → lease expira → reconexão degrada para
//      alocação nova (NUNCA erro) e o contador de epoch sobrevive no Redis;
//   7. SLO sob carga: perfil smoke12 do loadgen contra cada réplica viva
//      (p95 RTT < 150 ms, erros < 1%, gap de snapshots ≤ 100 ms).
//
// Contrato de aceite (grep): CROSS_REPLICA_SMOKE_OK
//
// Uso:
//   spawn (padrão; sobe Redis + 2 réplicas de verdade):
//     node scripts/smoke-cross-replica.mjs [--redis-url redis://127.0.0.1:6399]
//   attach (staging compose/real: réplicas JÁ rodando):
//     node scripts/smoke-cross-replica.mjs --mode attach \
//       --replica-a http://127.0.0.1:8791 --replica-b http://127.0.0.1:8792 \
//       --redis-url redis://127.0.0.1:6379
import { setTimeout as delay } from 'node:timers/promises';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket from 'ws';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RUNTIME = path.resolve(HERE, '..');
const log = (step, msg) => console.log(`[xreplica] [${step}] ${msg}`);
const fatal = (step, msg) => { console.error(`[xreplica] [${step}] FALHA: ${msg}`); };

// ─── Argumentos ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const arg = (name, fallback = null) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : fallback;
};
const hasFlag = (name) => args.includes(`--${name}`);
const MODE = arg('mode', 'spawn');
const REPLICA_A_URL = arg('replica-a');
const REPLICA_B_URL = arg('replica-b');
const REDIS_URL_ARG = arg('redis-url') || process.env.SMOKE_REDIS_URL || null;
const OWNERSHIP_TTL_MS = Number(arg('ownership-ttl-ms', MODE === 'spawn' ? 3_000 : 15_000));
const HEARTBEAT_MS = Number(arg('heartbeat-ms', MODE === 'spawn' ? 1_000 : 5_000));

// ─── Utilidades HTTP/WS ──────────────────────────────────────────────────────
async function getJson(base, pathname) {
  const res = await fetch(`${base}${pathname}`);
  return { status: res.status, body: await res.json().catch(() => ({})) };
}
async function waitHealthy(base, label, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const { status, body } = await getJson(base, '/readyz');
      if (status === 200 && body.status === 'ready') return body;
      lastError = `readyz ${status} ${JSON.stringify(body).slice(0, 160)}`;
    } catch (e) { lastError = e.message; }
    await delay(300);
  }
  throw new Error(`${label} não ficou ready em ${timeoutMs}ms (${lastError})`);
}
async function login(base, username, password) {
  const res = await fetch(`${base}/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error(`login ${username} em ${base}: HTTP ${res.status}`);
  const data = await res.json();
  if (!data.token) throw new Error(`login ${username}: token ausente`);
  return data.token;
}
// Espera a PRIMEIRA mensagem do tipo pedido (descarta as demais, loga redirect).
function expectMessage(ws, type, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off('message', onMsg); ws.off('close', onClose);
      reject(new Error(`timeout aguardando '${type}' (${timeoutMs}ms)`));
    }, timeoutMs);
    const onClose = (code, reason) => {
      clearTimeout(timer); ws.off('message', onMsg);
      reject(new Error(`ws fechou (${code} ${reason}) antes de '${type}'`));
    };
    const onMsg = (raw) => {
      let msg; try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (msg.type !== type) {
        if (msg.type === 'redirect') log('ws', `mensagem intermediária redirect → ${msg.to || msg.reason || '?'}`);
        return;
      }
      clearTimeout(timer); ws.off('message', onMsg); ws.off('close', onClose);
      resolve(msg);
    };
    ws.on('message', onMsg);
    ws.on('close', onClose);
  });
}
function openWs(base, { token, resume, mode = '3d' } = {}) {
  const wsUrl = `${base.replace(/^http/, 'ws')}/ws?token=${token}&mode=${mode}${resume ? `&resume=${encodeURIComponent(resume)}` : ''}`;
  const ws = new WebSocket(wsUrl);
  const closed = new Promise((resolve) => ws.on('close', (code, reason) => resolve({ code, reason: String(reason || '') })));
  return { ws, closed };
}
async function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

// ─── Redis (assert direto nas chaves reais) ──────────────────────────────────
let redisClient = null;
let redisProcess = null;
async function bootRedis() {
  const { createClient } = await import('redis');
  let url = REDIS_URL_ARG;
  if (!url) {
    // Spawn mode sem URL: sobe um redis-server REAL (binário do PATH ou REDIS_SERVER_BIN).
    const bin = process.env.REDIS_SERVER_BIN || 'redis-server';
    const port = await freePort();
    redisProcess = spawn(bin, ['--port', String(port), '--save', '', '--appendonly', 'no'], { stdio: ['ignore', 'pipe', 'pipe'] });
    redisProcess.on('error', (e) => { fatal('redis', `não subiu ${bin}: ${e.message} (use --redis-url ou REDIS_SERVER_BIN)`); process.exit(1); });
    url = `redis://127.0.0.1:${port}`;
    const deadline = Date.now() + 15_000;
    while (Date.now() < deadline) {
      const up = await new Promise((resolve) => {
        const s = net.connect(port, '127.0.0.1', () => { s.end(); resolve(true); });
        s.on('error', () => resolve(false));
        setTimeout(() => { s.destroy(); resolve(false); }, 500).unref?.();
      });
      if (up) break;
      await delay(200);
    }
    log('redis', `redis-server real (${bin}) em ${url}`);
  }
  redisClient = createClient({ url });
  await redisClient.connect();
  await redisClient.ping();
  return url;
}

// ─── Réplicas reais (spawn mode) ─────────────────────────────────────────────
const children = [];
function spawnReplica(port, userDataJson, env) {
  const child = spawn(process.execPath, [path.join(RUNTIME, 'server', 'server.js')], {
    cwd: RUNTIME,
    env: { ...process.env, ...env, PORT: String(port), KR_USERS_JSON: userDataJson },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stderr.on('data', (d) => { const s = String(d).trim(); if (s) console.error(`[replica:${port}] ${s.slice(0, 300)}`); });
  children.push(child);
  return child;
}

// ─── Loadgen (perfil reproduzível) ───────────────────────────────────────────
async function runLoadgen(url, outJson) {
  const child = spawn(process.execPath, [
    path.join(RUNTIME, 'scripts', 'loadgen.mjs'),
    '--profile', 'smoke12', '--url', url,
    '--user-prefix', 'kr_bot', '--user-count', '12', '--json', outJson,
  ], { cwd: RUNTIME, stdio: ['ignore', 'pipe', 'pipe'] });
  let stderr = '';
  child.stderr.on('data', (d) => { stderr += String(d); });
  const code = await new Promise((resolve) => child.on('close', resolve));
  const report = fs.existsSync(outJson) ? JSON.parse(fs.readFileSync(outJson, 'utf8')) : null;
  return { code, report, stderr };
}

// ═════════════════════════════════════════════════════════════════════════════
async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kr-xreplica-'));
  let redisUrl = null;
  let passed = 0;

  try {
    // ── [0] Redis REAL ──
    redisUrl = await bootRedis();
    log('0', `Redis REAL pronto em ${redisUrl}`);

    // ── [1] Duas réplicas reais prontas ──
    let baseA, baseB;
    if (MODE === 'attach') {
      if (!REPLICA_A_URL || !REPLICA_B_URL || !REDIS_URL_ARG) {
        throw new Error('attach exige --replica-a, --replica-b e --redis-url');
      }
      baseA = REPLICA_A_URL.replace(/\/$/, '');
      baseB = REPLICA_B_URL.replace(/\/$/, '');
      log('1', `attach às réplicas reais ${baseA} e ${baseB}`);
    } else {
      const portA = await freePort();
      const portB = await freePort();
      baseA = `http://127.0.0.1:${portA}`;
      baseB = `http://127.0.0.1:${portB}`;
      // Identidades: 2 humanos + pool kr_bot001..012 do loadgen (hash REAL).
      const { hashPassword } = await import(path.join(RUNTIME, 'server', 'auth.js'));
      const mk = (i, username) => ({ id: `xrep-${i}`, username, passwordHash: hashPassword('kr123'), role: 'player', region: 'sa-east' });
      const users = [mk(1, 'xrep_user_a'), mk(2, 'xrep_user_b')];
      for (let i = 1; i <= 12; i++) users.push(mk(2 + i, `kr_bot${String(i).padStart(3, '0')}`));
      const usersJson = JSON.stringify(users);
      const commonEnv = {
        KR_DISTRIBUTED: '1',
        KR_REDIS_URL: redisUrl,
        KR_SESSION_STORE: 'redis',
        KR_RATE_STORE: 'redis',
        KR_OWNERSHIP_TTL_MS: String(OWNERSHIP_TTL_MS),
        KR_OWNERSHIP_HEARTBEAT_MS: String(HEARTBEAT_MS),
        AUTH_SECRET: 'xreplica-smoke-secret-0123456789abcdef',
        ADMIN_TOKEN: 'xreplica-admin',
        MATCH_SEED: 'XREPLICA',
        KR_METRICS_ENABLED: '0',
      };
      log('1', `subindo réplica A :${portA} e réplica B :${portB} (KR_DISTRIBUTED=1, Redis REAL)`);
      spawnReplica(portA, usersJson, { ...commonEnv, KR_REPLICA_URL: `ws://127.0.0.1:${portA}` });
      spawnReplica(portB, usersJson, { ...commonEnv, KR_REPLICA_URL: `ws://127.0.0.1:${portB}` });
      await Promise.all([waitHealthy(baseA, 'réplica A'), waitHealthy(baseB, 'réplica B')]);
    }

    const healthA = (await getJson(baseA, '/healthz')).body;
    const healthB = (await getJson(baseB, '/healthz')).body;
    const idA = healthA.distributed?.replicaId;
    const idB = healthB.distributed?.replicaId;
    if (!healthA.distributed?.enabled) throw new Error('réplica A sem distributed.enabled=true');
    if (!healthB.distributed?.enabled) throw new Error('réplica B sem distributed.enabled=true');
    if (!idA || !idB || idA === idB) throw new Error(`replicaIds deviam ser distintos e vivos (A=${idA}, B=${idB})`);
    log('1', `réplicas prontas e distintas: A=${idA} · B=${idB}`);

    // ── [2] Ownership REAL no Redis ──
    const token = await login(baseA, 'xrep_user_a', 'kr123');
    const c1 = openWs(baseA, { token });
    const found = await expectMessage(c1.ws, 'match_found');
    if (!found.roomId || !found.roomId.startsWith(`${idA}-`)) {
      throw new Error(`roomId devia ter prefixo da réplica A (${idA}-): ${found.roomId}`);
    }
    if (!found.resumeToken) throw new Error('match_found sem resumeToken');
    log('2', `sala ${found.roomId} criada no dono A (fence proof a seguir)`);

    let lease = null;
    const leaseDeadline = Date.now() + 8_000;
    while (Date.now() < leaseDeadline) {
      lease = await redisClient.hGetAll(`kr:own:${found.roomId}`);
      if (lease && lease.owner) break;
      await delay(250);
    }
    if (!lease || lease.owner !== idA) throw new Error(`lease no Redis devia apontar para ${idA}: ${JSON.stringify(lease)}`);
    if (Number(lease.fence) < 1) throw new Error(`fence devia ser ≥ 1: ${lease.fence}`);
    const announcedA = await redisClient.get(`kr:replica:${idA}`);
    if (!announcedA) throw new Error(`réplica A não está no registro (kr:replica:${idA})`);
    log('2', `lease REAL no Redis: owner=${lease.owner} fence=${lease.fence} · anunciado em ${announcedA}`);

    // ── [3] Redirect REAL: reconectar na réplica ERRADA ──
    c1.ws.close();
    await delay(300); // close persiste a sessão (window de resume 15s)
    const wrong = openWs(baseB, { token, resume: found.resumeToken });
    let redirectMsg = null;
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('redirect não chegou em 10s')), 10_000);
      wrong.ws.on('message', (raw) => {
        try {
          const m = JSON.parse(raw.toString());
          if (m.type === 'redirect') { redirectMsg = m; clearTimeout(t); wrong.ws.close(); resolve(); }
        } catch { /* ignora */ }
      });
      wrong.ws.on('error', (e) => { clearTimeout(t); reject(e); });
      wrong.closed.then(({ code }) => { if (redirectMsg) resolve(); });
    }).catch((e) => { throw new Error(`etapa redirect: ${e.message}`); });
    if (redirectMsg.roomId !== found.roomId) throw new Error(`redirect roomId ${redirectMsg.roomId} ≠ ${found.roomId}`);
    if (redirectMsg.owner !== idA) throw new Error(`redirect owner ${redirectMsg.owner} ≠ ${idA}`);
    if (!redirectMsg.to) throw new Error('redirect sem URL do dono (to)');
    if (redirectMsg.to !== announcedA) throw new Error(`redirect.to ${redirectMsg.to} ≠ URL anunciada no Redis (${announcedA})`);
    const closeInfo = await wrong.closed;
    log('3', `redirect REAL ao dono vivo: to=${redirectMsg.to} owner=${redirectMsg.owner} (ws fechou ${closeInfo.code})`);

    // ── [4] Resume REAL no dono: mesmo ator, mesma sala, sem duplicar ──
    const again = openWs(baseA, { token, resume: found.resumeToken });
    const resumed = await expectMessage(again.ws, 'resumed');
    if (resumed.roomId !== found.roomId) throw new Error(`resume mudou de sala: ${resumed.roomId} ≠ ${found.roomId}`);
    if (!resumed.snapshot?.player) throw new Error('ator retomado ausente no snapshot');
    // Sem duplicação: nenhum "other" com o MESMO username do jogador retomado.
    const dupes = (resumed.snapshot.others || []).filter((o) => o.name === 'xrep_user_a');
    if (dupes.length > 0) throw new Error(`jogador duplicado na sala (${dupes.length} cópias em others)`);
    log('4', `resume REAL no dono: sala=${resumed.roomId} ator=${resumed.id} (sem duplicação)`);

    // ── [5] Relay REAL entre processos: room_open de A espelhado em B ──
    const mirrorDeadline = Date.now() + 8_000;
    let mirrorB = 0;
    while (Date.now() < mirrorDeadline) {
      const h = (await getJson(baseB, '/healthz')).body;
      mirrorB = h.distributed?.mirrorApplied ?? 0;
      if (mirrorB > 0) break;
      await delay(400);
    }
    if (mirrorB <= 0) throw new Error('réplica B não espelhou o room_open de A (mirrorApplied=0)');
    const violationsA = (await getJson(baseA, '/healthz')).body.distributed?.fenceViolations ?? -1;
    const violationsB = (await getJson(baseB, '/healthz')).body.distributed?.fenceViolations ?? -1;
    if (violationsA !== 0 || violationsB !== 0) throw new Error(`fenceViolations devia ser 0 (A=${violationsA}, B=${violationsB})`);
    log('5', `relay REAL entre réplicas: mirrorApplied(B)=${mirrorB} · fenceViolations A/B = 0/0`);
    again.ws.close();
    await delay(200);

    // ── [6] Failover REAL: SIGKILL no dono → degradação elegante ──
    if (MODE === 'spawn') {
      const ownerChild = children[0]; // réplica A
      log('6', `SIGKILL no dono (réplica A, pid ${ownerChild.pid}) — lease TTL ${OWNERSHIP_TTL_MS}ms`);
      ownerChild.kill('SIGKILL');
      await delay(OWNERSHIP_TTL_MS + 1_500); // lease expira no Redis
      const epochKey = `kr:ownfence:${found.roomId}`;
      const epochSurvived = await redisClient.get(epochKey);
      if (!epochSurvived) throw new Error('contador de epoch não sobreviveu à expiração da posse');
      const tokenB = token; // MESMA identidade: sessão salva no close é do usuário A
      const after = openWs(baseB, { token: tokenB, resume: found.resumeToken });
      const remade = await expectMessage(after.ws, 'match_found');
      if (!remade.roomId.startsWith(`${idB}-`)) {
        throw new Error(`pós-failover devia alocar sala na réplica B (${idB}-): ${remade.roomId}`);
      }
      log('6', `failover REAL: dono morto → jogador realocado sem erro (nova sala ${remade.roomId} na réplica B, epoch=${epochSurvived} preservado)`);
      after.ws.close();
      passed++;
    } else {
      log('6', 'attach: failover SIGKILL pulado (staging gerencia o ciclo de vida) — etapa coberta no spawn mode e no guard de CI');
    }

    // ── [7] SLO sob carga nas réplicas VIVAS (spawn: só B sobrou do failover) ──
    const aliveBases = [];
    for (const [label, base] of [['A', baseA], ['B', baseB]]) {
      try {
        const h = (await getJson(base, '/healthz')).body;
        if (h.status === 'ok') aliveBases.push([label, base]);
      } catch { /* réplica morta no failover: esperado no spawn mode */ }
    }
    if (aliveBases.length === 0) throw new Error('nenhuma réplica viva p/ etapa de carga');
    log('7', `réplicas vivas p/ carga: ${aliveBases.map(([l]) => l).join(', ')}`);
    const sloResults = [];
    for (const [label, base] of aliveBases) {
      const outJson = path.join(tmp, `loadgen-${label}.json`);
      const wsBase = base.replace(/^http/, 'ws');
      const { code, report } = await runLoadgen(wsBase, outJson);
      if (!report) throw new Error(`loadgen ${label} sem relatório (${code})`);
      const rttP95 = report.rtt?.p95 ?? null;
      const gapP95 = report.snapshotGap?.p95 ?? null;
      const errPct = (100 * (report.errors || 0)) / Math.max(1, report.players);
      const ok = rttP95 !== null && rttP95 < 150 && errPct < 1 && (gapP95 === null || gapP95 <= 100);
      sloResults.push({ label, rttP95, gapP95, errPct, ok, connected: report.connectedDone });
      log('7', `SLO réplica ${label}: p95 RTT=${rttP95?.toFixed(1)}ms · gap p95=${gapP95?.toFixed(1)}ms · erros=${errPct.toFixed(2)}% · conexões ${report.connectedDone}/${report.players} → ${ok ? 'OK' : 'VIOLADO'}`);
      if (!ok) throw new Error(`SLO violado na réplica ${label}`);
    }

    // ── Contrato ──
    console.log('CROSS_REPLICA_SMOKE_OK');
  } catch (error) {
    fatal('smoke', error.message);
    console.error(error.stack);
    process.exitCode = 1;
  } finally {
    // Teardown determinístico: filhos, redis efêmero, diretório temporário.
    for (const child of children) { try { child.kill('SIGKILL'); } catch { /* já morto */ } }
    for (const child of children) { try { await Promise.race([new Promise((r) => child.on('close', r)), delay(1_500)]); } catch { /* ok */ } }
    try { if (redisClient) await redisClient.quit(); } catch { /* ok */ }
    if (redisProcess) { try { redisProcess.kill('SIGKILL'); } catch { /* ok */ } }
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* ok */ }
  }
}

// Timeout global de segurança: smoke não fica preso > 120s.
setTimeout(() => { fatal('guard', 'tempo global esgotado (120s)'); process.exit(1); }, 120_000).unref?.();

main().then((r) => process.exit(process.exitCode || 0)).catch((e) => { fatal('main', e.message); process.exit(1); });
