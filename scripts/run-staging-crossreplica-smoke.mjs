#!/usr/bin/env node
// =============================================================================
// Khaaos Run — Smoke Cross-Replica AO VIVO (M4)
// =============================================================================
// Exercita a cadeia multi-réplica REAL da camada distribuída M3/M4 contra uma
// stack de staging com 2 réplicas de aplicação + Redis (KR_DISTRIBUTED=1):
//
//   1. readiness das DUAS réplicas (/readyz 200 com PG/Redis reais);
//   2. camada distribuída ativa com identidades distintas (/healthz.distributed);
//   3. login real em cada réplica (KR_DEV_AUTH=0 → /auth/login);
//   4. sala privada criada na réplica A → posse (fence) e convite no Redis
//      (kr:own:<roomId> owner/fence + kr:invite:<code>);
//   5. join pelo código na réplica B → REDIRECT ao endereço público do dono
//      (registry kr:replica:*) → reconexão → private_joined na réplica dona;
//   6. séries Prometheus da camada distribuída nas duas réplicas;
//   7. [opcional --kill-owner, modo compose] morte do dono → lease expira no
//      Redis → réplica B segue saudável → dono volta (resiliência de staging).
//
// Modos:
//   --mode compose  (padrão) valida a stack já em pé por deploy.sh --replicas 2
//   --mode local    sobe tudo sozinho: Redis master+réplica reais + 2 nós do
//                   runtime (game-runtime/server/server.js) — evidência sem Docker
//
// Marcador final: F17_CROSSREPLICA_SMOKE_OK (verde) — igual convenção F16.
// =============================================================================
import { spawn, execSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUNTIME = path.join(REPO, 'game-runtime');
const requireFromRuntime = createRequire(path.join(RUNTIME, 'package.json'));
const WebSocket = requireFromRuntime('ws');

const args = process.argv.slice(2);
const argOf = (name, def = null) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def;
};
const MODE = argOf('--mode', 'compose');
const KILL_OWNER = args.includes('--kill-owner');
const A_URL = argOf('--a-url', 'http://127.0.0.1:8081');
const B_URL = argOf('--b-url', 'http://127.0.0.1:8082');
const STAGING_PORT = argOf('--staging-port', '8080');
const TTL_MS = Number(argOf('--ttl-ms', '15000'));
const SMOKE_USER = argOf('--user', 'smoke');
const SMOKE_PASS = argOf('--pass', process.env.KR_SMOKE_PASS || 'smoke-pass-staging');
const REDIS_CLI = process.env.KR_SMOKE_REDIS_CLI || '/tmp/redis-7.4.1/src/redis-cli';
const REDIS_SERVER = process.env.KR_SMOKE_REDIS_SERVER || '/tmp/redis-7.4.1/src/redis-server';
const REDIS_MASTER_PORT = Number(process.env.KR_SMOKE_REDIS_MASTER_PORT || 56379);
const REDIS_REPLICA_PORT = Number(process.env.KR_SMOKE_REDIS_REPLICA_PORT || 56380);
const LOGDIR = process.env.KR_SMOKE_LOGDIR || '/tmp/crossreplica-smoke';

let failures = 0;
const ok = (msg) => console.log(`  ✅ ${msg}`);
const fail = (msg) => { failures++; console.error(`  ❌ ${msg}`); };
const stage = (n, msg) => console.log(`\n== ${n}. ${msg} ==`);
const compose = (extra) => `docker compose -f docker-compose.yml -f docker-compose.2replicas.yml ${extra}`;

function redisCli(...cmdArgs) {
  // --raw: saída determinística em pipe (sem aspas/numeração de TTY).
  if (MODE === 'compose') {
    return execSync(compose(`exec -T redis redis-cli --raw ${cmdArgs.join(' ')}`), { cwd: path.join(REPO, 'infra/staging'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  }
  return execSync(`"${REDIS_CLI}" -p ${REDIS_MASTER_PORT} --raw ${cmdArgs.join(' ')}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

// HGETALL --raw → linhas alternadas campo/valor.
function hgetallMap(key) {
  const lines = redisCli('HGETALL', key).split(/\r?\n/).filter((l) => l.length > 0);
  const flat = {};
  for (let i = 0; i + 1 < lines.length; i += 2) flat[lines[i]] = lines[i + 1];
  return flat;
}

// ── helpers WS: handler anexado ANTES de qualquer send (anti-race F16/M4) ────
function wsConnect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const inbox = [];
    const waiters = [];
    let closed = false;
    ws.on('message', (raw) => {
      const message = JSON.parse(raw.toString());
      const idx = waiters.findIndex((w) => w.types.includes(message.type));
      if (idx >= 0) { const w = waiters.splice(idx, 1)[0]; clearTimeout(w.timer); w.resolve(message); }
      else inbox.push(message);
    });
    ws.on('close', (code, reason) => {
      closed = true;
      for (const w of waiters.splice(0)) { clearTimeout(w.timer); w.reject(new Error(`ws fechou (${code} ${reason}) aguardando [${w.types.join(',')}]`)); }
    });
    ws.on('error', (e) => { if (!closed) { /* erros de frame: aguardam close */ } });
    ws.on('open', () => resolve({
      ws,
      send: (payload) => ws.send(JSON.stringify(payload)),
      expect: (types, timeoutMs = 10_000) => {
        const idx = inbox.findIndex((m) => types.includes(m.type));
        if (idx >= 0) return Promise.resolve(inbox.splice(idx, 1)[0]);
        return new Promise((res, rej) => {
          const timer = setTimeout(() => rej(new Error(`timeout ${timeoutMs}ms aguardando [${types.join(',')}]`)), timeoutMs);
          waiters.push({ types, resolve: res, reject: rej, timer });
        });
      },
      close: () => { try { ws.close(); } catch { /* já fechado */ } },
    }));
    ws.on('error', (e) => reject(e));
  });
}

const httpJson = async (url) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
};

const waitFor = async (fn, { timeoutMs = 30_000, stepMs = 500, label = 'condição' } = {}) => {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try { if (await fn()) return; } catch { /* próxima tentativa */ }
    if (Date.now() > deadline) throw new Error(`timeout: ${label}`);
    await delay(stepMs);
  }
};

// ── modo LOCAL: sobe Redis real + 2 nós do runtime ───────────────────────────
const localProcs = [];
async function startLocalStack() {
  fs.rmSync(LOGDIR, { recursive: true, force: true });
  fs.mkdirSync(LOGDIR, { recursive: true });
  const stateDir = path.join(LOGDIR, 'state');
  fs.mkdirSync(stateDir, { recursive: true });

  // Redis master + réplica REAIS (mesma topologia do staging gerenciado).
  const masterLog = fs.openSync(path.join(LOGDIR, 'redis-master.log'), 'a');
  const replicaLog = fs.openSync(path.join(LOGDIR, 'redis-replica.log'), 'a');
  spawn(REDIS_SERVER, ['--port', String(REDIS_MASTER_PORT), '--save', '', '--appendonly', 'no', '--maxmemory', '256mb', '--maxmemory-policy', 'noeviction'], { stdio: ['ignore', masterLog, masterLog] });
  spawn(REDIS_SERVER, ['--port', String(REDIS_REPLICA_PORT), '--replicaof', '127.0.0.1', String(REDIS_MASTER_PORT), '--save', '', '--appendonly', 'no'], { stdio: ['ignore', replicaLog, replicaLog] });
  await waitFor(() => redisCli('PING') === 'PONG' && redisCli('-p', String(REDIS_REPLICA_PORT), 'INFO', 'replication').includes('master_link_status:up'), { label: 'Redis master+réplica', timeoutMs: 20_000 });
  console.log(`  ✅ Redis real: master ${REDIS_MASTER_PORT} + réplica ${REDIS_REPLICA_PORT} sincronizadas`);

  // Usuário do smoke (hash scrypt no formato do AuthService).
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(SMOKE_PASS, salt, 32).toString('hex');
  const usersJson = JSON.stringify([{ id: 'u-smoke', username: SMOKE_USER, role: 'player', region: 'sa-east', passwordHash: `scrypt:${salt}:${hash}` }]);

  const startNode = (replicaId, port, publicUrl) => {
    const env = {
      ...process.env,
      NODE_ENV: 'production',
      PORT: String(port),
      KR_DISTRIBUTED: '1',
      KR_REPLICA_ID: replicaId,
      KR_REPLICA_URL: publicUrl,
      KR_REDIS_URL: `redis://127.0.0.1:${REDIS_MASTER_PORT}`,
      KR_SESSION_STORE: 'json',
      KR_STORE: path.join(stateDir, `${replicaId}.json`),
      KR_USERS_JSON: usersJson,
      AUTH_SECRET: 'crossreplica-smoke-auth-secret-0123456789',
      MATCH_SEED: 'CIGKV-smoke',
      KR_DEV_AUTH: '0',
      KR_OWNERSHIP_TTL_MS: String(TTL_MS),
    };
    const logFd = fs.openSync(path.join(LOGDIR, `${replicaId}.log`), 'a');
    const proc = spawn('node', ['server/server.js'], { cwd: RUNTIME, env, stdio: ['ignore', logFd, logFd] });
    localProcs.push(proc);
    return proc;
  };
  startNode('staging-app-a', 8081, A_URL);
  startNode('staging-app-b', 8082, B_URL);
  await waitFor(() => Promise.all([httpJson(`${A_URL}/readyz`), httpJson(`${B_URL}/readyz`)]).then((rs) => rs.every((r) => r.status === 'ready')), { label: 'réplicas prontas', timeoutMs: 30_000 });
  console.log('  ✅ 2 nós do runtime em pé (staging-app-a :8081, staging-app-b :8082) com KR_DISTRIBUTED=1');
}

function stopLocalStack() {
  for (const p of localProcs) { try { p.kill('SIGKILL'); } catch { /* já morto */ } }
  try { execSync(`"${REDIS_CLI}" -p ${REDIS_MASTER_PORT} shutdown nosave 2>/dev/null`); } catch { /* já fora */ }
  try { execSync(`"${REDIS_CLI}" -p ${REDIS_REPLICA_PORT} shutdown nosave 2>/dev/null`); } catch { /* já fora */ }
}

// ═════════════════════════════ SMOKE ═════════════════════════════════════════
console.log(`Khaaos Run — Smoke Cross-Replica AO VIVO (modo: ${MODE}${KILL_OWNER ? ' + kill-owner' : ''})`);

if (MODE === 'local') {
  await startLocalStack();
}

try {
  // ── 1. readiness das DUAS réplicas ─────────────────────────────────────────
  stage(1, 'Readiness das duas réplicas (/readyz 200)');
  const readyA = await httpJson(`${A_URL}/readyz`);
  const readyB = await httpJson(`${B_URL}/readyz`);
  readyA.status === 'ready' ? ok(`A ready (checks: ${Object.values(readyA.checks).every(Boolean)})`) : fail(`A readyz=${readyA.status}`);
  readyB.status === 'ready' ? ok(`B ready (checks: ${Object.values(readyB.checks).every(Boolean)})`) : fail(`B readyz=${readyB.status}`);

  // ── 2. camada distribuída ativa, identidades distintas ─────────────────────
  stage(2, 'Camada distribuída ativa com identidades distintas');
  const healthA = await httpJson(`${A_URL}/healthz`);
  const healthB = await httpJson(`${B_URL}/healthz`);
  const distA = healthA.distributed || {};
  const distB = healthB.distributed || {};
  distA.enabled === true ? ok('A: KR_DISTRIBUTED ativo (/healthz.distributed.enabled)') : fail('A sem camada distribuída');
  distB.enabled === true ? ok('B: KR_DISTRIBUTED ativo (/healthz.distributed.enabled)') : fail('B sem camada distribuída');
  const idA = distA.replicaId, idB = distB.replicaId;
  (idA && idB && idA !== idB) ? ok(`identidades distintas: ${idA} ≠ ${idB}`) : fail(`identidades ausentes/iguais: ${idA} vs ${idB}`);

  // ── 3. login real por réplica ──────────────────────────────────────────────
  stage(3, 'Login real em cada réplica (/auth/login)');
  const login = async (base) => {
    const res = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: SMOKE_USER, password: SMOKE_PASS }) });
    if (!res.ok) throw new Error(`login em ${base} → ${res.status}`);
    return (await res.json()).token;
  };
  let tokenA, tokenB;
  try { tokenA = await login(A_URL); ok('token emitido pela réplica A'); } catch (e) { fail(`login A: ${e.message}`); }
  try { tokenB = await login(B_URL); ok('token emitido pela réplica B'); } catch (e) { fail(`login B: ${e.message}`); }
  if (!tokenA || !tokenB) throw new Error('sem tokens não há smoke');

  // ── 4. sala privada na réplica A → posse + convite no Redis ────────────────
  stage(4, 'Sala privada criada em A: posse (fence) e convite no Redis');
  const clientA = await wsConnect(`${A_URL.replace('http', 'ws')}/ws?token=${tokenA}&mode=3d`);
  await clientA.expect(['queued', 'match_found']);
  const createdPromise = clientA.expect(['private_created']);
  clientA.send({ type: 'create_private' });
  const created = await createdPromise;
  const roomId = created.roomId;
  (idA && roomId.startsWith(`${idA}-`)) ? ok(`sala ${roomId} prefixada pelo dono ${idA} (código ${created.code})`) : fail(`roomId sem prefixo do dono: ${roomId}`);

  const own = hgetallMap(`kr:own:${roomId}`);
  const owner = own['owner'];
  const fence = Number(own['fence'] || 0);
  owner === idA ? ok(`posse no Redis: kr:own:${roomId} → owner=${owner}`) : fail(`posse inesperada no Redis: ${JSON.stringify(own)}`);
  fence >= 1 ? ok(`fence (epoch) = ${fence}`) : fail(`fence inválido: ${fence}`);
  const inviteRaw = redisCli('GET', `kr:invite:${created.code}`);
  const inviteRef = inviteRaw && inviteRaw !== '' ? JSON.parse(inviteRaw) : null;
  inviteRef?.roomId === roomId ? ok(`convite no índice compartilhado: kr:invite:${created.code} → ${roomId}`) : fail(`convite ausente/errado no Redis: ${inviteRaw}`);

  // ── 5. join cross-réplica: B resolve o código e REDIRECIONA ao dono ────────
  stage(5, 'Join cross-réplica: B redireciona ao dono e o cliente entra em A');
  const clientB = await wsConnect(`${B_URL.replace('http', 'ws')}/ws?token=${tokenB}&mode=3d`);
  await clientB.expect(['queued', 'match_found']);
  const redirectPromise = clientB.expect(['redirect', 'private_not_found']);
  clientB.send({ type: 'join_private', code: created.code });
  const redirected = await redirectPromise;
  if (redirected.type !== 'redirect') fail(`B respondeu ${redirected.type} em vez de redirect`);
  else {
    redirected.owner === idA ? ok(`redirect ao dono: ${redirected.owner}`) : fail(`owner inesperado: ${redirected.owner}`);
    redirected.roomId === roomId ? ok(`roomId preservado no redirect: ${redirected.roomId}`) : fail(`roomId divergente: ${redirected.roomId}`);
    String(redirected.to || '').startsWith('http') ? ok(`endereço público do dono: ${redirected.to}`) : fail(`endereço ausente no redirect: ${JSON.stringify(redirected)}`);
  }

  // Reconexão ao DONO pelo endereço redirecionado — entrada de fato.
  const ownerBase = redirected.to || A_URL;
  const clientA2 = await wsConnect(`${ownerBase.replace('http', 'ws')}/ws?token=${tokenA}&mode=3d`);
  await clientA2.expect(['queued', 'match_found']);
  const joinedPromise = clientA2.expect(['private_joined', 'private_not_found']);
  clientA2.send({ type: 'join_private', code: created.code });
  const joined = await joinedPromise;
  joined.type === 'private_joined' && joined.roomId === roomId ? ok(`jogador ENTROU na sala ${joined.roomId} via reconexão ao dono`) : fail(`join no dono falhou: ${JSON.stringify(joined).slice(0, 200)}`);

  // ── 6. Métricas Prometheus da camada distribuída nas duas réplicas ─────────
  stage(6, 'Séries Prometheus da camada distribuída');
  const metricsA = await fetch(`${A_URL}/metrics`).then((r) => r.text());
  const metricsB = await fetch(`${B_URL}/metrics`).then((r) => r.text());
  const has = (text, re) => re.test(text);
  has(metricsA, new RegExp(`khaaos_runtime_replica_info\\{replica_id="${idA}"\\} 1`)) ? ok(`A: replica_info ${idA}`) : fail('A: replica_info ausente');
  has(metricsA, /khaaos_runtime_distributed_acquired_total [1-9]/) ? ok('A: acquired_total ≥ 1') : fail('A: acquired_total zerado');
  has(metricsA, /khaaos_runtime_distributed_invites_published_total [1-9]/) ? ok('A: convites publicados ≥ 1') : fail('A: convites_publicados zerado');
  has(metricsB, /khaaos_runtime_distributed_redirects_total [1-9]/) ? ok('B: redirects_total ≥ 1') : fail('B: redirects_total zerado');
  has(metricsB, /khaaos_runtime_distributed_invite_hits_total [1-9]/) ? ok('B: índice de convites resolveu (hits ≥ 1)') : fail('B: invite_hits zerado');
  has(metricsB, new RegExp(`khaaos_runtime_replica_info\\{replica_id="${idB}"\\} 1`)) ? ok(`B: replica_info ${idB}`) : fail('B: replica_info ausente');

  // ── 7. [opcional] morte do dono → lease expira → B saudável → dono volta ───
  if (KILL_OWNER) {
    if (MODE !== 'compose') {
      console.log('\n== 7. kill-owner: pulado (requer modo compose para parar/reiniciar o container) ==');
    } else {
      stage(7, `Morte do dono (${idA}): lease expira, B segue saudável, dono volta`);
      const composeArgs = ['-f', 'docker-compose.yml', '-f', 'docker-compose.2replicas.yml'];
      execSync(`docker compose ${composeArgs.join(' ')} stop app-a`, { cwd: path.join(REPO, 'infra/staging'), stdio: 'inherit' });
      ok('dono parado (docker compose stop app-a)');
      await waitFor(() => redisCli('EXISTS', `kr:own:${roomId}`) === '0', { timeoutMs: TTL_MS + 15_000, label: 'lease expirar no Redis' });
      ok(`lease da sala expirou no Redis (TTL ${TTL_MS} ms) — posse liberada sem dono vivo`);
      const readyB2 = await httpJson(`${B_URL}/readyz`);
      readyB2.status === 'ready' ? ok('B continua saudável durante a ausência do dono') : fail('B degradou sem o dono');
      execSync(`docker compose ${composeArgs.join(' ')} up -d app-a`, { cwd: path.join(REPO, 'infra/staging'), stdio: 'inherit' });
      await waitFor(() => httpJson(`${A_URL}/readyz`).then((r) => r.status === 'ready'), { timeoutMs: 60_000, label: 'dono voltar' });
      ok('dono de volta e ready — staging resiliente');
    }
  }

  clientA.close(); clientB.close(); clientA2.close();
  if (failures > 0) throw new Error(`${failures} asserção(ões) falharam`);
  console.log('\nF17_CROSSREPLICA_SMOKE_OK — cadeia cross-réplica ao vivo: REDIRECIONA, CERCA e SOBREVIVE.');
  process.exitCode = 0;
} catch (error) {
  console.error(`\nF17_CROSSREPLICA_SMOKE_FAIL: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (MODE === 'local') stopLocalStack();
}
