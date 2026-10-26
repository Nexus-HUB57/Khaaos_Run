// Khaaos Run — Autoscaler de staging (externo ao runtime).
//
// Lê o /healthz do runtime pelo nginx (agregando as réplicas via round-robin
// DNS) e decide escala de répias do serviço `app` com a MESMA semântica do
// `server/autoscale.js` do runtime (scale_out ≥ outPct ou fila; scale_in
// < inPct; banda saudável = nada). A diferença: aqui o sinal vem do gate de
// conexões do readiness (`KR_READY_MAX_CONNECTIONS`) — cada réplica satura
// em maxConnections, então a capacidade total é `réplicas × maxConnections`.
//
// `decide()` é puro e unit-testado em game-runtime/test/staging-autoscaler.test.js.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const AUTOSCALE_DEFAULTS = Object.freeze({
  min: 1,
  max: 4,
  outPct: 85,   // % da capacidade total (réplicas × KR_READY_MAX_CONNECTIONS)
  inPct: 30,    // banda inferior para devolver réplica
  pollMs: 5_000,
  cooldownMs: 60_000,
  dryRun: true,
});

// Decide a contagem de réplicas. inputs:
//   connections  — conexões vivas agregadas (soma das réplicas, /healthz)
//   queue        — profundidade da fila de matchmaking (global)
//   maxConnections — KR_READY_MAX_CONNECTIONS por réplica (null = sem gate)
//   replicas     — contagem ATUAL de réplicas
//   lastScaleAt  — timestamp da última mudança (para cooldown; 0 se nunca)
//   now          — timestamp atual (injetável nos testes)
export function decide({
  connections = 0,
  queue = 0,
  maxConnections = null,
  replicas,
  lastScaleAt = 0,
  now = Date.now(),
}, overrides = {}) {
  const cfg = { ...AUTOSCALE_DEFAULTS, ...overrides };
  const current = Math.max(1, replicas ?? cfg.min);
  const replicaCapacity = maxConnections && maxConnections > 0 ? maxConnections : 1_000_000;
  const totalCapacity = current * replicaCapacity;
  const loadPct = totalCapacity ? (connections / totalCapacity) * 100 : 0;
  const inCooldown = now - lastScaleAt < cfg.cooldownMs;

  let action = 'ok';
  let target = current;
  if ((loadPct >= cfg.outPct || queue > 0) && current < cfg.max) {
    // scale_out progressivo: +1 réplica por ciclo (evita overshoot de custo).
    target = current + 1;
    action = 'scale_out';
  } else if ((loadPct >= cfg.outPct || queue > 0) && current >= cfg.max) {
    action = 'ok';
    return { action, target: current, reason: 'at_max', loadPct: round(loadPct), capacity: totalCapacity };
  } else if (loadPct < cfg.inPct && queue === 0 && current > cfg.min) {
    target = current - 1;
    action = 'scale_in';
  }

  if (action !== 'ok' && inCooldown) {
    return { action: 'ok', target: current, reason: 'cooldown', loadPct: round(loadPct), capacity: totalCapacity };
  }
  if (action === 'scale_in' && target < cfg.min) target = cfg.min;
  if (action === 'scale_out' && target > cfg.max) target = cfg.max;
  return {
    action,
    target,
    reason: action === 'scale_out'
      ? (queue > 0 ? 'queue' : `load ${round(loadPct)}% ≥ ${cfg.outPct}%`)
      : action === 'scale_in'
        ? `load ${round(loadPct)}% < ${cfg.inPct}%`
        : 'healthy band',
    loadPct: round(loadPct),
    capacity: totalCapacity,
  };
}

function round(value) {
  return Number(value.toFixed(2));
}

// ─── Daemon (não roda nos testes) ───────────────────────────────────────────
export async function pollHealth(baseUrl, fetchImpl = fetch) {
  const res = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/healthz`, { signal: AbortSignal.timeout(3_000) });
  if (!res.ok) throw new Error(`healthz HTTP ${res.status}`);
  return res.json();
}

export function scaleCompose(target, { composeDir, dryRun }) {
  const composeFile = path.join(composeDir, 'docker-compose.yml');
  const args = ['compose', '-f', composeFile, 'up', '-d', '--no-deps', '--scale', `app=${target}`];
  if (dryRun) {
    return { executed: false, args };
  }
  return new Promise((resolve) => {
    const child = spawn('docker', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.on('error', (error) => resolve({ executed: false, error: String(error) }));
    child.on('close', (code) => resolve({ executed: code === 0, code, output }));
  });
}

export async function mainLoop() {
  const composeDir = path.dirname(fileURLToPath(import.meta.url));
  const baseUrl = process.env.KR_STAGING_URL || 'http://127.0.0.1:8080';
  const cfg = {
    min: Number(process.env.KR_AUTOSCALE_MIN ?? AUTOSCALE_DEFAULTS.min),
    max: Number(process.env.KR_AUTOSCALE_MAX ?? AUTOSCALE_DEFAULTS.max),
    outPct: Number(process.env.KR_AUTOSCALE_OUT_PCT ?? AUTOSCALE_DEFAULTS.outPct),
    inPct: Number(process.env.KR_AUTOSCALE_IN_PCT ?? AUTOSCALE_DEFAULTS.inPct),
    pollMs: Number(process.env.KR_AUTOSCALE_POLL_MS ?? AUTOSCALE_DEFAULTS.pollMs),
    cooldownMs: Number(process.env.KR_AUTOSCALE_COOLDOWN_MS ?? AUTOSCALE_DEFAULTS.cooldownMs),
    dryRun: process.env.KR_AUTOSCALE_DRYRUN === '1',
  };
  // Capacidade por réplica: o MESMO valor de KR_READY_MAX_CONNECTIONS do app
  // (o gate do /readyz). O /healthz não o expõe de propósito (é liveness público).
  const maxConnections = Number(process.env.KR_READY_MAX_CONNECTIONS || 2000);
  let lastKnownReplicas = cfg.min;
  let lastScaleAt = 0;
  const seenUptimes = new Set();
  // Réplica atual: `docker compose ps` por ciclo é caro; contamos instâncias
  // distintas vistas em /healthz (uptimeMs difere por réplica). Suficiente
  // para staging (produção real: k8s HPA lê o mesmo /healthz).
  const replicas = () => lastKnownReplicas;

  process.stdout.write(`[kr-autoscaler] ${cfg.dryRun ? 'DRY-RUN' : 'ativo'} → ${baseUrl} min=${cfg.min} max=${cfg.max} out=${cfg.outPct}% in=${cfg.inPct}% gate/réplica=${maxConnections}\n`);
  setInterval(async () => {
    try {
      const health = await pollHealth(baseUrl);
      seenUptimes.add(health.uptimeMs);
      if (seenUptimes.size > lastKnownReplicas) lastKnownReplicas = seenUptimes.size;
      const decision = decide({
        connections: health.connections ?? 0,
        queue: health.queue ?? 0,
        maxConnections,
        replicas: replicas(),
        lastScaleAt,
      }, cfg);
      process.stdout.write(`[kr-autoscaler] load=${decision.loadPct}% conns=${health.connections} queue=${health.queue} → ${decision.action} (${decision.reason}) [réplicas=${replicas()} alvo=${decision.target}]\n`);
      if (decision.action !== 'ok' && !cfg.dryRun) {
        const result = await scaleCompose(decision.target, { composeDir, dryRun: false });
        if (result.executed) {
          lastScaleAt = Date.now();
          lastKnownReplicas = decision.target;
        } else {
          process.stderr.write(`[kr-autoscaler] falha ao escalar: ${result.error || result.output}\n`);
        }
      }
    } catch (error) {
      process.stderr.write(`[kr-autoscaler] ciclo ignorado: ${String(error?.message || error)}\n`);
    }
  }, cfg.pollMs);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  mainLoop();
}
