import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { MatchRoom } from './room.js';
import { MatchRoom3D } from './room3d.js';
import { validateInput, validateInput3D, ViolationTracker } from './antiCheat.js';
import { AuthService, hasRole, hashPassword } from './auth.js';
import { OidcClient } from './oidc.js';
import { createSessionStore, PostgresAuditStore } from './store.js';
import { AuditLog } from './audit.js';
import { can } from './rbac.js';
import { createEosBridge, eosConfigFromEnv } from './eos.js';
import { Economy, Ledger, PostgresEconomyStore, complianceReport, EconomyError } from './economy.js';
import { grantMatchRewards } from './rewards.js';
import { DistributedRateLimiter, RedisRateStore, SharedMemoryRateStore } from './rateLimit.js';
import { chooseRegion, chooseRoom, normalizeRegion, normalizeMode, makeInviteCode, normalizeInviteCode, findRoomByCode } from './matchmaking.js';
// M3 — multiplayer distribuído: ownership/fencing de salas entre réplicas + relay de eventos.
import { createDistributed } from './distributed.js';
import { createDependencyHealth, summarize } from './health.js';
import { regionLoads, recommend, SCALE_DEFAULTS } from './autoscale.js';
import { createObservability, traceHttpHandler, formatTraceparent } from './obs.js';
import { createPojService, PojError } from './poj.js';
import { collectUe58Status, setRepoSecrets, createRunnerRegistrationToken, triggerInfraSmoke } from './ue58unblock.js'; // Fase 39 — desbloqueio UE5.8/EAC pelo /admin
// Fase 14 — pipeline de espectador no game node (/ws/spectator + métricas /admin)
import { SpectatorPipeline } from './spectator.js';
// Fase 10 — patente do perfil (liderança): progressão canônica compartilhada
import { rankProgress } from '../src/shared/rank.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const MAX_WS_PAYLOAD = 16 * 1024;
const MAX_BUFFERED_BYTES = 256 * 1024;

const jsonBody = (req) => new Promise((resolve, reject) => {
  let raw = '';
  req.on('data', (chunk) => {
    raw += chunk;
    if (raw.length > 1e6) reject(new Error('payload too large'));
  });
  req.on('end', () => {
    try { resolve(JSON.parse(raw || '{}')); } catch { reject(new Error('invalid json')); }
  });
});
const bearer = (req) => String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
const cookieValue = (req, name) => {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return decodeURIComponent(rest.join('='));
  }
  return null;
};

export function createAuthoritativeServer({
  port = Number(process.env.PORT || 8787),
  adminToken = process.env.ADMIN_TOKEN || 'change-me',
  roomCapacity = 16,
  auth,
  economy,
  store,
  rateStore,
  tls,
  oidc,
  auditStore,
  health,
  readyGate,
  obs,
  poj,
  distributed, // M3 — camada distribuída injetável (testes/staging)
  eos, // M4 — ponte EOS nativa injetável (testes: config de teste explícita)
  ue58, // Fase 39 — desbloqueio UE5.8/EAC injetável (testes: fetchImpl/repo/token stubs)
} = {}) {
  // Fase 39 — config do desbloqueio UE5.8/EAC: token de env (nunca no código),
  // fetchImpl injetável p/ testes, probe de filesystem ancorado no ROOT.
  const ue58Cfg = {
    repo: ue58?.repo ?? 'Nexus-HUB57/Khaaos_Run',
    token: ue58?.token ?? process.env.GH_UNBLOCK_TOKEN ?? process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? '',
    fetchImpl: ue58?.fetchImpl ?? globalThis.fetch,
    rootDir: ue58?.rootDir ?? ROOT,
  };
  // TLS operacional: { cert, key } direto ou KR_TLS_CERT/KR_TLS_KEY (caminhos PEM).
  const tlsConfig = tls || (process.env.KR_TLS_CERT && process.env.KR_TLS_KEY
    ? { cert: fs.readFileSync(process.env.KR_TLS_CERT), key: fs.readFileSync(process.env.KR_TLS_KEY) }
    : null);
  // SSO/OIDC operacional: config direta ou env KR_OIDC_ISSUER/CLIENT_ID/CLIENT_SECRET/REDIRECT_URI.
  const oidcConfig = oidc || (process.env.KR_OIDC_ISSUER && process.env.KR_OIDC_CLIENT_ID && process.env.KR_OIDC_CLIENT_SECRET
    ? {
        issuer: process.env.KR_OIDC_ISSUER,
        clientId: process.env.KR_OIDC_CLIENT_ID,
        clientSecret: process.env.KR_OIDC_CLIENT_SECRET,
        redirectUri: process.env.KR_OIDC_REDIRECT_URI,
      }
    : null);
  const oidcClient = oidcConfig ? new OidcClient(oidcConfig) : null;
  const oidcSubjectsAdmin = new Set(String(process.env.KR_OIDC_ADMIN_SUBJECTS || '').split(',').filter(Boolean));
  // KR_USERS_JSON: parse RESILIENTE — JSON malformado (ex.: aspas consumidas
  // por `source .env` no deploy) não pode derrubar o runtime em crash loop:
  // degrada para users=[] com sinal claro no log; login falha honestamente.
  let users = [];
  if (process.env.KR_USERS_JSON) {
    try {
      users = JSON.parse(process.env.KR_USERS_JSON);
      if (!Array.isArray(users)) throw new Error('KR_USERS_JSON deve ser um array');
    } catch (error) {
      users = [];
      console.error('[KR_USERS_JSON] inválido — boot segue SEM usuários estáticos (login falhará até corrigir):', String(error?.message || error).slice(0, 200));
    }
  }
  // KR_DEV_AUTH=1 provisiona usuários de desenvolvimento (NUNCA usar em produção).
  if (process.env.KR_DEV_AUTH === '1' && users.length === 0) {
    users.push(
      { id: 'dev-player', username: 'kr_player', passwordHash: hashPassword('kr123'), role: 'player', region: 'sa-east' },
      { id: 'dev-admin', username: 'kr_admin', passwordHash: hashPassword('kr123'), role: 'admin', region: 'sa-east' },
    );
  }
  const identity = auth || new AuthService({ secret: process.env.AUTH_SECRET || 'dev-only-change-me', users });
  const durable = store || createSessionStore();
  const selectedRateStore = rateStore || (process.env.KR_RATE_STORE === 'redis' ? new RedisRateStore() : new SharedMemoryRateStore());
  // orçamento de mensagens/s por identidade, separado por modo:
  // 2D (legado, 20Hz de inputs) mantém 30/s; 3D (30Hz de inputs + ping) usa 90/s.
  const limiter = new DistributedRateLimiter({ store: selectedRateStore, limit: 30, windowMs: 1000, prefix: 'ws-input' });
  const limiter3d = new DistributedRateLimiter({ store: selectedRateStore, limit: Number(process.env.KR_INPUT_LIMIT || 90), windowMs: 1000, prefix: 'ws-input-3d' });
  // Trilha de auditoria: ring buffer em memória + store persistente opcional
  // (KR_AUDIT_STORE=postgres usa PostgresAuditStore, migração 002_audit_events.sql).
  const selectedAuditStore = auditStore
    || (process.env.KR_AUDIT_STORE === 'postgres' ? new PostgresAuditStore() : null);
  const audit = new AuditLog({ store: selectedAuditStore });
  // Economia virtual (KRC): ledger de dupla entrada append-only, sem qualquer
  // trilha de valor real (REAL_MONEY_ENABLED=false congelado). Injeção direta
  // ou KR_ECONOMY_STORE=postgres (migração 003_economy_ledger.sql).
  const economyService = economy || new Economy({ store: process.env.KR_ECONOMY_STORE === 'postgres' ? new PostgresEconomyStore() : undefined });
  // POJ — Protocolo de Ordem de Jogo: instância única do regramento da Guerra
  // (alistamento → CIGKV → 24 h → 4 mundos × 7 dias → desempate do 11º artigo).
  // Fase 12 — recebe a economia REAL: vereditos da Corte Marcial movem KRC no
  // ledger (prêmio/multa idempotentes por caso).
  const pojService = poj || createPojService({ economy: economyService });
  // Fase 14 — transmissão de espectadores no próprio game node: o cliente 3D
  // conecta em same-origin /ws/spectator (dev proxy /ws → :8787; produção é o
  // CMD da imagem). Sem plateia, custo zero — timers só existem por sala ocupada.
  const spectatorPipeline = new SpectatorPipeline();

  // ---------- Recompensas KRC no fim da partida ----------
  // room3d dispara uma única vez por partida; aqui resolvemos client-id →
  // userId (sub do token) e concedemos via ledger idempotente. Falhas são
  // contidas: recompensa nunca derruba o servidor nem o tick.
  const handleMatchEnd = ({ matchId, results }) => {
    // M3 — fim de partida: publica o ciclo de vida no relay (outras réplicas
    // espelham p/ métricas/admin) e libera o lease da sala.
    const endedRoomId = String(matchId || '').split('#')[0];
    if (endedRoomId) {
      void Promise.resolve(distributedLayer.publish(endedRoomId, 'match_end', { matchId, players: (results ?? []).length })).catch(() => {});
      void distributedLayer.release(endedRoomId).catch(() => {});
      frozenNotified.delete(endedRoomId);
    }
    const actorById = new Map();
    for (const c of clients.values()) actorById.set(c.id, c.identity);
    void grantMatchRewards({
      economy: economyService, matchId, results, actorById,
      audit, observability, metrics,
    }).catch((error) => {
      observability.recordLog({ level: 'warn', event: 'economy.match_rewards_failed', fields: { matchId, error: String(error?.message || error) } });
    });
    // Fase 10 — ponte partida → POJ: presença/queda/carreira automáticas no fim
    // de cada incursão 3D. Falha é contida — o POJ nunca derruba a recompensa.
    try {
      const pojResults = (results ?? []).map((r) => ({ ...r, userId: actorById.get(r.id)?.sub ?? null }));
      const pojSummary = pojService.reportMatchResult({ matchId, results: pojResults });
      if (pojSummary.reported) {
        audit.record({ actor: 'system', action: 'poj.match_report', resource: matchId, outcome: 'allow', detail: { incursionId: pojSummary.incursionId, attended: pojSummary.attended, eliminated: pojSummary.eliminated, skipped: pojSummary.skipped } });
        observability.recordLog({ level: 'info', event: 'poj.match_report', fields: { matchId, ...pojSummary } });
      }
    } catch (error) {
      observability.recordLog({ level: 'warn', event: 'poj.match_report_failed', fields: { matchId, error: String(error?.message || error) } });
    }
  };
  // Saúde real das dependências: sondas com latência medida (SELECT 1 / PING)
  // e cache curto para o readiness não martelar o banco a cada requisição.
  const healthMonitor = health || createDependencyHealth({ sessionStore: durable, rateStore: selectedRateStore, auditStore: selectedAuditStore });
  // Gate de saturação do readiness: ao passar do limite de conexões vivas, a
  // instância responde 503/overload para sair da rotação do balanceador.
  const readyGateConfig = readyGate || (process.env.KR_READY_MAX_CONNECTIONS ? { maxConnections: Number(process.env.KR_READY_MAX_CONNECTIONS) } : null);
  // Observabilidade distribuída: trace context W3C por requisição, spans em
  // árvore, logs estruturados agregados e exporter Redis opcional (KR_OBS_EXPORTER=redis)
  // para consolidar traces/logs de múltiplas instâncias num stream só.
  const observability = obs || createObservability();
  const rooms = new Map();
  const clients = new Map();
  const queue = [];
  let nextClient = 1;
  let nextRoom = 1;
  // M3 — camada distribuída (opt-in): KR_DISTRIBUTED=1 ativa ownership/fencing.
  // Com Redis (KR_REDIS_URL) os leases vivem no Redis; sem Redis, memória local
  // (útil p/ testes de duas réplicas no mesmo processo). Sem KR_DISTRIBUTED o
  // comportamento single-node é EXATAMENTE o de antes (no-op total).
  const distributedLayer = distributed || createDistributed({
    enabled: process.env.KR_DISTRIBUTED === '1',
    // M4 — identidade de réplica ESTÁVEL: KR_REPLICA_ID (override explícito) →
    // HOSTNAME (estável por container no compose/autoscaler) → aleatório.
    // Estabilidade importa: o registro de réplicas (redirect cross-réplica) e
    // o smoke ao vivo apontam para IDs previsíveis por réplica.
    replicaId: process.env.KR_REPLICA_ID || process.env.HOSTNAME || null,
    address: process.env.KR_REPLICA_URL || null,
    redisUrl: process.env.KR_REDIS_URL || process.env.REDIS_URL || null,
    ttlMs: Number(process.env.KR_OWNERSHIP_TTL_MS || 15_000),
    heartbeatMs: Number(process.env.KR_OWNERSHIP_HEARTBEAT_MS || 5_000),
  });
  // M3 — ids de sala GLOBALMENTE únicos quando distribuído: sem o prefixo,
  // duas réplicas criariam 'ring3d-1' independentes e o registro de posse
  // não teria a quem pertencer.
  const roomPrefix = distributedLayer.enabled ? `${distributedLayer.replicaId}-` : '';
  // M3 — AOI fan-out (opt-in): ativa com a camada distribuída ou KR_AOI=1.
  const aoiEnabled = distributedLayer.enabled || process.env.KR_AOI === '1';
  const frozenNotified = new Set();
  // Falha do driver não derruba o matchmaking: degrada para posse local
  // (fail-open com sinal em métricas/audit) — continuidade de jogo primeiro;
  // o epoch garante que o dono NOVO sempre vence no reconcile.
  const safeAcquire = async (roomId) => {
    try { return await distributedLayer.acquire(roomId); }
    catch (error) { audit.record({ actor: 'system', action: 'distributed.acquire_failed', resource: roomId, outcome: 'deny', detail: { error: String(error?.message || error) } }); return { owned: true, fence: 0, degraded: true }; }
  };
  const safeGuard = async (roomId) => {
    try { return await distributedLayer.guard(roomId); }
    catch { return { ok: true, local: true, degraded: true }; }
  };
  // Mutação estrutural sob fence: aplica addPlayer só com posse válida.
  const guardedJoin = async (room, client) => {
    const g = await safeGuard(room.id);
    if (!g.ok) {
      metrics.fenceRejects = (metrics.fenceRejects ?? 0) + 1;
      audit.record({ actor: client.identity.username, action: 'distributed.fence_reject', resource: room.id, outcome: 'deny', detail: { reason: g.reason } });
      send(client.ws, { type: 'redirect', roomId: room.id, reason: g.reason });
      return false;
    }
    room.addPlayer(client.id, client.identity.username);
    client.roomId = room.id;
    return true;
  };
  // Fase 12 — ponte veredito → Ring: o POJ não conhece salas/WS; o servidor
  // entrega o court_verdict ao militar julgado via snapshot da sala dele e
  // atualiza a patente do nametag ao vivo (setPatente emite evento 'patente').
  pojService.setNotifier?.((playerId, event) => {
    let delivered = 0;
    for (const c of clients.values()) {
      if (c.identity?.sub !== playerId) continue;
      const room = c.roomId ? rooms.get(c.roomId) : null;
      if (!room || typeof room.emitExternal !== 'function') continue;
      if (event.patente && typeof room.setPatente === 'function') room.setPatente(c.id, event.patente);
      room.emitExternal(c.id, event.type, event);
      delivered++;
    }
    return delivered;
  });
  const metrics = {
    startedAt: Date.now(), connections: 0, rejections: 0, violations: 0, bans: 0,
    messages: 0, ticks: 0, rateLimited: 0, reconnects: 0, authFailures: 0,
    backpressure: 0, oversized: 0, logouts: 0, keyRotations: 0, oidcLogins: 0, rbacDenies: 0,
    storeReadFailures: 0, rateStoreFailures: 0, economyMatchRewards: 0,
  };

  const send = (ws, message) => {
    if (ws?.readyState !== 1) return false;
    if (ws.bufferedAmount > MAX_BUFFERED_BYTES) {
      metrics.backpressure++;
      ws.close(4008, 'backpressure');
      return false;
    }
    ws.send(JSON.stringify(message));
    return true;
  };
  const getRoom = (client) => client.roomId ? rooms.get(client.roomId) : null;
  // Identidade da requisição HTTP: token KR (qualquer papel) ou token legacy de operações (admin).
  const identityFor = (req) => {
    const token = bearer(req) || req.headers['x-admin-token'] || new URL(req.url, 'http://localhost').searchParams.get('token');
    const user = identity.verify(token);
    if (user) return user;
    if (token === adminToken) return { sub: 'legacy', username: 'legacy-token', role: 'admin' };
    return null;
  };
  // Guarda RBAC de endpoint: 403 + evento de auditoria quando a permissão não cobre.
  // Decisões allow SÓ são auditadas em operações sensíveis (rotate/drop/login/logout/oidc/start);
  // leituras repetitivas (painel) não geram ruído.
  const guardHttp = (req, res, permission, resource = null) => {
    const actor = identityFor(req);
    if (can(actor, permission, resource)) return actor;
    metrics.rbacDenies++;
    audit.record({ actor: actor?.username || 'anonymous', action: 'rbac.deny', resource, outcome: 'deny', detail: { permission, via: 'http' } });
    res.writeHead(403, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'forbidden', permission }));
    return null;
  };

  // Carga por região (salas, assentos, utilização) + recomendação de autoscaling.
  const regionalLoad = () => regionLoads(rooms, { queue: queue.length }).map((load) => ({
    ...load,
    utilization: Number(load.utilization.toFixed(4)),
    recommendation: recommend(load),
  }));

  // Fail-open nos limitadores: indisponibilidade do rate store (Redis fora) não
  // pode derrubar a partida — o input flui sem limite e a degradação fica
  // sinalizada em metrics.rateStoreFailures para alarme externo.
  const allowOrOpen = async (limiter, key) => {
    try {
      return await limiter.allowAsync(key);
    } catch {
      metrics.rateStoreFailures++;
      return { allowed: true, count: 0, remaining: 0, resetAt: Date.now() + 1000 };
    }
  };

  async function assign(client) {
    let room = chooseRoom(rooms, client.region, roomCapacity, client.mode);
    if (!room) {
      const roomId = `${roomPrefix}ring3d-${nextRoom++}`;
      const lease = await safeAcquire(roomId); // M3 — posse ANTES da primeira mutação
      room = client.mode === '3d'
        ? new MatchRoom3D({ id: roomId, seed: `${process.env.MATCH_SEED || 'CIGKV'}-3D-${nextRoom}`, region: client.region, capacity: roomCapacity, botFill: roomCapacity - 1, onMatchEnd: handleMatchEnd, officerPlanFn: () => pojService.officerPlan(), aoi: aoiEnabled })
        : new MatchRoom({ id: roomId, seed: `${process.env.MATCH_SEED || 'CIGKV'}-${nextRoom}`, region: client.region, capacity: roomCapacity });
      room.fence = lease.fence ?? 0;
      rooms.set(room.id, room);
      void distributedLayer.publish(room.id, 'room_open', { region: room.region, mode: room.mode ?? '2d', capacity: room.capacity });
    }
    if (!(await guardedJoin(room, client))) return; // M3 — mutação sob fence; rejeição → redirect
    // Fase 11 — patente do perfil no nametag (KRC → hierarquia canônica).
    // Resolvida ANTES do match_found (nametag correto já no primeiro snapshot);
    // timeout curto: ledger lento não segura o matchmaking, evento patente
    // complementa em tempo real (room3d emite 'patente' quando chega).
    try {
      const bal = await Promise.race([
        economyService.balance(client.identity.sub).then((b) => b?.amount ?? 0),
        new Promise((resolve) => setTimeout(() => resolve(null), 700)),
      ]);
      if (bal !== null) room.setPatente(client.id, rankProgress(bal).patente);
    } catch { /* sem ledger → sem patente */ }
    const position = queue.indexOf(client);
    if (position >= 0) queue.splice(position, 1);
    send(client.ws, {
      type: 'match_found', id: client.id, roomId: room.id, region: room.region,
      position: room.players.size, capacity: room.capacity, resumeToken: client.resumeToken,
      snapshot: room.snapshot(client.id),
    });
  }

  // Estados de autorização OIDC (state single-use → { nonce, expiresAt }).
  const oidcStates = new Map();
  const OIDC_STATE_TTL_MS = 10 * 60 * 1000;

  async function httpHandler(req, res) {
    const url = new URL(req.url, 'http://localhost');
    const trace = req.trace || null;
    const traceHeader = trace ? { traceparent: formatTraceparent({ traceId: trace.traceId, spanId: trace.spanId, sampled: trace.sampled }) } : null;
    try {
      if (req.method === 'GET' && url.pathname === '/healthz') {
        const roomList = [...rooms.values()];
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...(traceHeader || {}) });
        res.end(JSON.stringify({ status: 'ok', uptimeMs: Date.now() - metrics.startedAt, ticks: metrics.ticks, rooms: rooms.size, rooms3d: roomList.filter((r) => r.is3d).length, connections: clients.size, queue: queue.length, backpressure: metrics.backpressure, regions: regionalLoad(), tls: Boolean(tlsConfig), oidc: Boolean(oidcClient), distributed: distributedStatus() }));
        return;
      }
      if (req.method === 'GET' && url.pathname === '/readyz') {
        const results = await healthMonitor.probeAll({ force: true });
        const summary = summarize(results);
        const saturated = readyGateConfig ? clients.size > readyGateConfig.maxConnections : false;
        const status = !summary.ok ? 'not_ready' : saturated ? 'overload' : 'ready';
        res.writeHead(status === 'ready' ? 200 : 503, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...(traceHeader || {}) });
        res.end(JSON.stringify({ status, checks: summary.checks, latencyMs: summary.latencyMs, errors: summary.errors, load: { connections: clients.size, queue: queue.length, maxConnections: readyGateConfig?.maxConnections ?? null } }));
        return;
      }
      // M3 — exposição Prometheus (staging SRE): counters do runtime + gauges
      // vivos (salas por estado, conexões, fila, backpressure, memória). Sem
      // dados sensíveis; desligável com KR_METRICS_ENABLED=0.
      if (req.method === 'GET' && url.pathname === '/metrics' && process.env.KR_METRICS_ENABLED !== '0') {
        const lines = [];
        const counter = (name, help, value, labels = '') => {
          lines.push(`# HELP ${name} ${help}`);
          lines.push(`# TYPE ${name} counter`);
          lines.push(`${name}${labels} ${value}`);
        };
        const gauge = (name, help, value, labels = '') => {
          lines.push(`# HELP ${name} ${help}`);
          lines.push(`# TYPE ${name} gauge`);
          lines.push(`${name}${labels} ${value}`);
        };
        const mem = process.memoryUsage();
        const roomList = [...rooms.values()];
        const byState = { LOBBY: 0, IN_PROGRESS: 0, FINISHED: 0 };
        for (const room of roomList) byState[room.state] = (byState[room.state] || 0) + 1;
        counter('khaaos_runtime_ws_messages_total', 'Mensagens WS recebidas do cliente', metrics.messages);
        counter('khaaos_runtime_ws_rejections_total', 'Handshakes WS rejeitados', metrics.rejections);
        counter('khaaos_runtime_anticheat_violations_total', 'Violações de movement validation', metrics.violations);
        counter('khaaos_runtime_anticheat_bans_total', 'Bans de 3-strike aplicados', metrics.bans);
        counter('khaaos_runtime_rate_limited_total', 'Requisições/conexões limitadas', metrics.rateLimited);
        counter('khaaos_runtime_reconnects_total', 'Reconexões de cliente', metrics.reconnects);
        counter('khaaos_runtime_auth_failures_total', 'Falhas de autenticação', metrics.authFailures);
        counter('khaaos_runtime_backpressure_total', 'Conexões fechadas por backpressure', metrics.backpressure);
        counter('khaaos_runtime_oversized_total', 'Mensagens acima do maxPayload', metrics.oversized);
        counter('khaaos_runtime_rate_store_failures_total', 'Falhas do rate store (fail-open)', metrics.rateStoreFailures);
        counter('khaaos_runtime_economy_match_rewards_total', 'Recompensas de partida liquidadas', metrics.economyMatchRewards);
        gauge('khaaos_runtime_ws_connections', 'Conexões WS ativas', clients.size);
        gauge('khaaos_runtime_matchmaking_queue', 'Jogadores na fila do matchmaking', queue.length);
        gauge('khaaos_runtime_rooms', 'Salas vivas por estado', byState.LOBBY, '{state="LOBBY"}');
        gauge('khaaos_runtime_rooms', 'Salas vivas por estado', byState.IN_PROGRESS, '{state="IN_PROGRESS"}');
        gauge('khaaos_runtime_rooms', 'Salas vivas por estado', byState.FINISHED, '{state="FINISHED"}');
        gauge('khaaos_runtime_rooms_3d', 'Salas 3D vivas', roomList.filter((r) => r.is3d).length);
        gauge('khaaos_runtime_ticks_total', 'Ticks de simulação executados', metrics.ticks);
        gauge('khaaos_runtime_process_resident_memory_bytes', 'RSS do processo', mem.rss);
        gauge('khaaos_runtime_process_heap_used_bytes', 'Heap V8 em uso', mem.heapUsed);
        gauge('khaaos_runtime_process_uptime_seconds', 'Uptime do processo', process.uptime());
        // M3/M4 — camada distribuída (ownership/fencing/convites). Séries só
        // existem quando KR_DISTRIBUTED=1: single-node não ganha ruído novo.
        if (distributedLayer.enabled) {
          const dist = distributedLayer.metrics || {};
          const dcounter = (name, help, value) => counter(name, help, Number(value || 0));
          gauge('khaaos_runtime_replica_info', 'Identidade da réplica (valor sempre 1)', 1, `{replica_id="${distributedLayer.replicaId}"}`);
          dcounter('khaaos_runtime_distributed_acquired_total', 'Posses de sala adquiridas', dist.acquired);
          dcounter('khaaos_runtime_distributed_renewed_total', 'Renovações de lease (heartbeat)', dist.renewed);
          dcounter('khaaos_runtime_distributed_lost_total', 'Posses perdidas para outra réplica', dist.lost);
          dcounter('khaaos_runtime_distributed_released_total', 'Leases liberados no encerramento de salas', dist.released);
          dcounter('khaaos_runtime_distributed_fence_violations_total', 'Mutação sob fence inválido (fencing)', dist.fenceViolations);
          dcounter('khaaos_runtime_distributed_redirects_total', 'Redirecionamentos ao dono da sala', dist.redirects);
          dcounter('khaaos_runtime_distributed_publishes_total', 'Eventos publicados no relay', dist.publishes);
          dcounter('khaaos_runtime_distributed_mirror_applied_total', 'Eventos do relay aplicados no espelho', dist.mirrorApplied);
          dcounter('khaaos_runtime_distributed_mirror_gaps_total', 'Gaps de seq detectados no espelho', dist.mirrorGaps);
          dcounter('khaaos_runtime_distributed_invites_published_total', 'Convites publicados no índice compartilhado', dist.invitesPublished);
          dcounter('khaaos_runtime_distributed_invite_lookups_total', 'Consultas ao índice de convites', dist.inviteLookups);
          dcounter('khaaos_runtime_distributed_invite_hits_total', 'Consultas resolvidas no índice de convites', dist.inviteHits);
          gauge('khaaos_runtime_distributed_held_rooms', 'Salas com lease vivo nesta réplica', distributedLayer.held ? distributedLayer.held.size : 0);
          gauge('khaaos_runtime_distributed_frozen_rooms', 'Salas congeladas (owner_lost/fence)', distributedLayer.frozen ? distributedLayer.frozen.size : 0);
        }
        res.writeHead(200, { 'content-type': 'text/plain; version=0.0.4; charset=utf-8', 'cache-control': 'no-store', ...(traceHeader || {}) });
        res.end(`${lines.join('\n')}\n`);
        return;
      }
      if (req.method === 'POST' && url.pathname === '/auth/login') {
        const ip = req.socket.remoteAddress || 'unknown';
        const allowed = await allowOrOpen(limiter, `login:${ip}`);
        if (!allowed.allowed) { res.writeHead(429); res.end(JSON.stringify({ error: 'rate_limited' })); return; }
        const body = await jsonBody(req);
        const logged = identity.login(body.username, body.password);
        if (!logged) {
          metrics.authFailures++;
          audit.record({ actor: body.username || 'unknown', action: 'auth.login', outcome: 'deny', detail: { via: 'password' } });
          res.writeHead(401, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'invalid_credentials' })); return;
        }
        audit.record({ actor: logged.user.username, action: 'auth.login', outcome: 'allow', detail: { via: 'password', role: logged.user.role } });
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(logged));
        return;
      }
      if (req.method === 'POST' && url.pathname === '/auth/logout') {
        const token = bearer(req);
        if (!token) { res.writeHead(401, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'unauthorized' })); return; }
        const actor = identity.verify(token);
        const revoked = identity.revoke(token);
        if (revoked) metrics.logouts++;
        audit.record({ actor: actor?.username || 'unknown', action: 'auth.logout', outcome: revoked ? 'allow' : 'deny' });
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        res.end(JSON.stringify({ revoked, logout: true }));
        return;
      }
      if (req.method === 'GET' && url.pathname === '/auth/oidc/start') {
        if (!oidcClient) { res.writeHead(503, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'oidc_not_configured' })); return; }
        try {
          await oidcClient.ready();
        } catch {
          res.writeHead(503, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'oidc_unavailable' })); return;
        }
        const now = Date.now();
        for (const [st, entry] of oidcStates) if (entry.expiresAt <= now) oidcStates.delete(st);
        const state = crypto.randomBytes(24).toString('base64url');
        const nonce = crypto.randomBytes(16).toString('base64url');
        oidcStates.set(state, { nonce, expiresAt: now + OIDC_STATE_TTL_MS });
        res.writeHead(302, {
          location: oidcClient.authorizationUrl({ state, nonce }),
          'set-cookie': `kr_oidc_state=${encodeURIComponent(state)}; HttpOnly; SameSite=Lax; Path=/auth/oidc; Max-Age=600`,
          'cache-control': 'no-store',
        });
        res.end();
        return;
      }
      if (req.method === 'GET' && url.pathname === '/auth/oidc/callback') {
        if (!oidcClient) { res.writeHead(503, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'oidc_not_configured' })); return; }
        const queryState = url.searchParams.get('state');
        const cookieState = cookieValue(req, 'kr_oidc_state');
        const entry = queryState ? oidcStates.get(queryState) : null;
        if (!queryState || !cookieState || queryState !== cookieState || !entry || entry.expiresAt <= Date.now()) {
          res.writeHead(400, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: 'invalid_state' }));
          return;
        }
        oidcStates.delete(queryState); // single-use
        const code = url.searchParams.get('code');
        if (!code) { res.writeHead(400, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'missing_code' })); return; }
        try {
          const tokens = await oidcClient.exchangeCode(code);
          const result = await oidcClient.verifyIdToken(tokens.id_token, { nonce: entry.nonce });
          if (!result.ok) { metrics.authFailures++; res.writeHead(401, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'invalid_id_token', reason: result.reason })); return; }
          const claims = result.claims;
          const username = claims.preferred_username || claims.email || `oidc:${claims.sub}`;
          const role = oidcSubjectsAdmin.has(claims.sub) ? 'admin' : 'player';
          const user = identity.upsertExternalUser({ id: `oidc-${claims.sub}`, username, role, region: claims.region });
          const session = identity.issueForUser(user);
          metrics.oidcLogins++;
          audit.record({ actor: user.username, action: 'auth.oidc', outcome: 'allow', detail: { subject: claims.sub, provider: 'oidc', role: user.role } });
          const headers = { 'content-type': 'application/json', 'cache-control': 'no-store' };
          if (process.env.KR_OIDC_SET_COOKIE === '1') {
            headers['set-cookie'] = `kr_token=${encodeURIComponent(session.token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=3600`;
          }
          res.writeHead(200, headers);
          res.end(JSON.stringify({ ...session, provider: 'oidc' }));
        } catch (error) {
          metrics.authFailures++;
          res.writeHead(502, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: 'oidc_exchange_failed', detail: error?.message }));
        }
        return;
      }
      // ─── Economia virtual (KRC) ────────────────────────────────────────────
      // Saldo/histórico são SEMPRE derivados da identidade do token — nunca de
      // parâmetro — garantindo que um jogador só leia o próprio ledger.
      if (url.pathname === '/economy/balance' && req.method === 'GET') {
        const actor = identityFor(req);
        if (!actor) { res.writeHead(401, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'unauthorized' })); return; }
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        res.end(JSON.stringify({ ...(await economyService.balance(actor.sub)), userId: actor.sub }));
        return;
      }
      if (url.pathname === '/economy/history' && req.method === 'GET') {
        const actor = identityFor(req);
        if (!actor) { res.writeHead(401, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'unauthorized' })); return; }
        const entries = await economyService.history(actor.sub, { sinceId: Number(url.searchParams.get('sinceId') || 0), limit: Number(url.searchParams.get('limit') || 50) });
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        res.end(JSON.stringify({ entries, nextSinceId: entries.length ? entries[0].id : Number(url.searchParams.get('sinceId') || 0) }));
        return;
      }
      if (url.pathname === '/economy/grant' && req.method === 'POST') {
        const admin = guardHttp(req, res, 'economy:grant');
        if (!admin) return;
        const body = await jsonBody(req);
        try {
          const entry = await economyService.grant({ userId: body.userId, amount: body.amount, reason: body.reason, idempotencyKey: body.idempotencyKey, by: admin.username });
          audit.record({ actor: admin.username, action: 'economy.grant', resource: body.userId ? `player:${body.userId}` : null, outcome: 'allow', detail: { amount: body.amount, idempotent: Boolean(body.idempotencyKey) } });
          res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
          res.end(JSON.stringify({ entry, balance: await economyService.balance(body.userId) }));
        } catch (error) {
          const code = error instanceof EconomyError ? error.code : 'economy_error';
          audit.record({ actor: admin.username, action: 'economy.grant', resource: body.userId ? `player:${body.userId}` : null, outcome: 'deny', detail: { code, amount: body.amount ?? null } });
          res.writeHead(code === 'economy_insufficient_funds' ? 409 : 400, { 'content-type': 'application/json', 'cache-control': 'no-store' });
          res.end(JSON.stringify({ error: code }));
        }
        return;
      }
      if (url.pathname === '/economy/compliance' && req.method === 'GET') {
        if (!guardHttp(req, res, 'admin:metrics')) return;
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        res.end(JSON.stringify(await complianceReport({ store: economyService.store })));
        return;
      }
      if (url.pathname === '/admin.html') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(fs.readFileSync(path.join(ROOT, 'admin.html')));
        return;
      }
      // ---------- Fase 11 — Console do Marechal (POJ + Corte Marcial jogável) ----------
      if (url.pathname === '/console' || url.pathname === '/console.html') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(fs.readFileSync(path.join(ROOT, 'console.html')));
        return;
      }
      // ─── POJ — Protocolo de Ordem de Jogo ────────────────────────────────
      // Estado público do regramento; comandos do Marechal exigem poj:command.
      if (url.pathname === '/poj/state' && req.method === 'GET') {
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        res.end(JSON.stringify(pojService.state()));
        return;
      }
      // Fase 10 — perfil do operativo: patente (progressão KRC), próximo degrau
      // e saldo. Qualquer sessão autenticada lê o PRÓPRIO perfil.
      if (url.pathname === '/profile' && req.method === 'GET') {
        const actor = identityFor(req);
        if (!actor) { res.writeHead(401, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'unauthorized' })); return; }
        let balance = 0;
        try { balance = (await economyService.balance(actor.sub)).amount ?? 0; } catch { /* sem ledger → Recruta */ }
        const rank = rankProgress(balance);
        const pojPlayers = pojService.state().players ?? [];
        const pojEntry = pojPlayers.find((p) => p.id === actor.sub) ?? null;
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        res.end(JSON.stringify({
          sub: actor.sub, username: actor.username,
          krc: balance, patente: rank.patente, peso: rank.peso,
          nextPatente: rank.nextPatente, xpForNext: rank.xpForNext, progress: rank.progress,
          poj: pojEntry ? { status: pojEntry.status, incursoes: pojEntry.incursoes, kills: pojEntry.kills, xp: pojEntry.xp, evasions: pojEntry.evasions } : null,
        }));
        return;
      }
      if (url.pathname === '/poj/register' && req.method === 'POST') {
        const actor = identityFor(req);
        if (!actor) { res.writeHead(401, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'unauthorized' })); return; }
        const body = await jsonBody(req);
        try {
          // Fase 10 — patente inicial = progressão KRC do perfil (coronel no KRC
          // alista como Coronel); corpo explícito prevalece (validado no motor).
          if (!body.patente) {
            try {
              const bal = (await economyService.balance(actor.sub)).amount ?? 0;
              body.patente = rankProgress(bal).patente;
            } catch { /* sem ledger → Recruta */ }
          }
          const result = pojService.register(actor, body);
          audit.record({ actor: actor.username, action: 'poj.register', resource: `player:${result.playerId}`, outcome: 'allow', detail: { total: result.registrations } });
          res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
          res.end(JSON.stringify(result));
        } catch (error) {
          const code = error instanceof PojError ? error.code : 'poj_error';
          res.writeHead(code === 'inscricao_duplicada' ? 409 : 409, { 'content-type': 'application/json', 'cache-control': 'no-store' });
          res.end(JSON.stringify({ error: code }));
        }
        return;
      }
      const pojCommand = async (fn, action, resource = null) => {
        const actor = guardHttp(req, res, 'poj:command');
        if (!actor) return true;
        const body = req.method === 'POST' ? await jsonBody(req) : {};
        try {
          // Fase 12 — veredito é assíncrono (efeito KRC no ledger): sempre await.
          const result = await fn(body, actor);
          audit.record({ actor: actor.username, action, resource, outcome: 'allow' });
          res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
          res.end(JSON.stringify(result ?? { ok: true }));
        } catch (error) {
          const code = error instanceof PojError ? error.code : 'poj_error';
          const status = code === 'fora_de_guerra' || code === 'guerra_em_curso' ? 409 : 400;
          audit.record({ actor: actor.username, action, resource, outcome: 'deny', detail: { code } });
          res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
          res.end(JSON.stringify({ error: code }));
        }
        return true;
      };
      if (url.pathname === '/poj/summon' && req.method === 'POST') { await pojCommand(() => pojService.summon(), 'poj.summon'); return; }
      if (url.pathname === '/poj/attend' && req.method === 'POST') {
        const actor = identityFor(req);
        if (!actor) { res.writeHead(401, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'unauthorized' })); return; }
        const isSelf = !actor.role || actor.role === 'player';
        const body = await jsonBody(req);
        if (isSelf) {
          try {
            const result = pojService.attend(actor, body);
            audit.record({ actor: actor.username, action: 'poj.attend', resource: `incursion:${body.incursionId}`, outcome: 'allow' });
            res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
            res.end(JSON.stringify(result));
          } catch (error) {
            const code = error instanceof PojError ? error.code : 'poj_error';
            res.writeHead(code === 'sem_reingresso' ? 403 : 400, { 'content-type': 'application/json', 'cache-control': 'no-store' });
            res.end(JSON.stringify({ error: code }));
          }
          return;
        }
        await pojCommand((b) => pojService.attend(actor, b), 'poj.attend');
        return;
      }
      if (url.pathname === '/poj/close' && req.method === 'POST') { await pojCommand((b) => pojService.close(b), 'poj.close'); return; }
      if (url.pathname === '/poj/eliminate' && req.method === 'POST') {
        const actor = identityFor(req);
        if (!actor) { res.writeHead(401, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'unauthorized' })); return; }
        const body = await jsonBody(req);
        const selfOnly = (!actor.role || actor.role === 'player');
        if (selfOnly) {
          try {
            const result = pojService.eliminate(actor, body); // resolve ANTES do writeHead
            res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
            res.end(JSON.stringify(result));
          } catch (error) {
            const code = error instanceof PojError ? error.code : 'poj_error';
            res.writeHead(code === 'sem_reingresso' ? 403 : 400, { 'content-type': 'application/json', 'cache-control': 'no-store' });
            res.end(JSON.stringify({ error: code }));
          }
          return;
        }
        await pojCommand((b) => pojService.eliminate(actor, b), 'poj.eliminate');
        return;
      }
      if (url.pathname === '/poj/advance' && req.method === 'POST') { await pojCommand((b) => pojService.advance(b), 'poj.advance'); return; }
      if (url.pathname === '/poj/champion' && req.method === 'POST') { await pojCommand(() => pojService.champion(), 'poj.champion'); return; }
      if (url.pathname === '/poj/court-martial' && req.method === 'POST') { await pojCommand((b) => pojService.courtMartial(b), 'poj.court_martial'); return; }
      // ---------- Fase 11 — Corte Marcial jogável (console do Marechal) ----------
      // GET: banco da Corte (leitura autenticada); POST /verdict: veredito do Marechal.
      if (url.pathname === '/poj/court-martial/cases' && req.method === 'GET') {
        const actor = identityFor(req);
        if (!actor) { res.writeHead(401, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'unauthorized' })); return; }
        const params = new URL(req.url, 'http://localhost').searchParams;
        const status = params.get('status');
        // Fase 13 — mine=1: replay da ata na UI do jogador eliminado. O próprio
        // militar enxerga SOMENTE os seus casos (privacidade do processo);
        // admin/Marechal continua com o docket completo.
        const mine = params.get('mine') === '1' || params.get('mine') === 'true';
        const mineSub = mine && actor.role !== 'admin' ? actor.sub : null;
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        res.end(JSON.stringify(pojService.courtCases(status === 'pendente' || status === 'julgado' ? status : null, mineSub)));
        return;
      }
      if (url.pathname === '/poj/court-martial/verdict' && req.method === 'POST') {
        await pojCommand((b, actor) => pojService.courtVerdict(actor, b), 'poj.court_verdict');
        return;
      }
      // ── M4 — Ponte EOS nativa (Unreal/KhaaosRun/.../Game/EOS ↔ runtime) ────
      // status: SEM segredos (o UE5 client/dedicated consulta a disponibilidade).
      if (url.pathname === '/eos/status' && req.method === 'GET') {
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store', ...(traceHeader || {}) });
        res.end(JSON.stringify({ ...eosBridge.status(), now: Date.now() }));
        return;
      }
      // Sessões: o DEDICATED SERVER (papel service/admin) ancora a sessão EOS
      // nativa à sala que ESTA réplica possui — fencing: sem posse, sem sessão.
      if (url.pathname === '/eos/sessions' && req.method === 'POST') {
        if (!guardHttp(req, res, 'eos:operate')) return;
        try {
          const body = await jsonBody(req);
          // Fencing AUTORITATIVO na camada HTTP (independente de injeção de
          // bridge em testes): sessão EOS só ancora em sala possuída por
          // ESTA réplica — lease vivo e não congelada.
          const ownsRoom = (() => {
            if (!body?.roomId || !rooms.has(body.roomId)) return false;
            if (!distributedLayer.enabled) return true;
            return Boolean(distributedLayer.held && distributedLayer.held.has(body.roomId)) && !distributedLayer.isFrozen(body.roomId);
          })();
          if (!ownsRoom) {
            const error = new Error(`sala ${body?.roomId} não é possuída por esta réplica — sessão EOS não pode ancorar (fencing)`);
            error.code = 'EOS_ROOM_NOT_OWNED';
            throw error;
          }
          const result = eosBridge.registerSession(body);
          audit.record({ actor: identityFor(req)?.username || 'eos-service', action: 'eos.session.register', resource: result.roomId, outcome: 'allow', detail: { sessionId: result.sessionId } });
          res.writeHead(result.created ? 201 : 200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
          res.end(JSON.stringify(result));
        } catch (error) {
          audit.record({ actor: 'eos-service', action: 'eos.session.register', outcome: 'deny', detail: { code: error.code, reason: String(error?.message || error).slice(0, 200) } });
          const code = error.code === 'EOS_ROOM_NOT_OWNED' || error.code === 'EOS_ROOM_REQUIRED' ? 409 : error.code === 'EOS_SESSION_ID_INVALID' ? 422 : 503;
          res.writeHead(code, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: error.code || 'eos_error', detail: error.message }));
        }
        return;
      }
      const eosSessionMatch = url.pathname.match(/^\/eos\/sessions\/([^/]+)\/(heartbeat|end)$/);
      if (eosSessionMatch && req.method === 'POST') {
        if (!guardHttp(req, res, 'eos:operate')) return;
        const [, sessionId, action] = eosSessionMatch;
        try {
          const result = action === 'heartbeat' ? eosBridge.heartbeat(sessionId) : eosBridge.endSession(sessionId);
          res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
          res.end(JSON.stringify(result));
        } catch (error) {
          res.writeHead(error.code === 'EOS_SESSION_UNKNOWN' ? 404 : 503, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: error.code || 'eos_error', detail: error.message }));
        }
        return;
      }
      if (url.pathname === '/eos/sessions' && req.method === 'GET') {
        if (!guardHttp(req, res, 'admin:metrics')) return;
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        res.end(JSON.stringify({ sessions: eosBridge.list(), status: eosBridge.status(), now: Date.now() }));
        return;
      }
      if (url.pathname === '/admin/keys' && req.method === 'GET') {
        if (!guardHttp(req, res, 'keys:rotate')) return;
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        res.end(JSON.stringify({ keys: identity.keyInfo() }));
        return;
      }
      if (url.pathname === '/admin/keys/rotate' && req.method === 'POST') {
        const admin = guardHttp(req, res, 'keys:rotate');
        if (!admin) return;
        const body = await jsonBody(req);
        const result = identity.rotateSecret(body.secret || undefined);
        metrics.keyRotations++;
        audit.record({ actor: admin.username, action: 'key.rotate', outcome: 'allow', detail: { kid: result.kid, providedSecret: Boolean(body.secret) } });
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        res.end(JSON.stringify(result));
        return;
      }
      if (url.pathname === '/admin/keys/drop' && req.method === 'POST') {
        const admin = guardHttp(req, res, 'keys:rotate');
        if (!admin) return;
        const body = await jsonBody(req);
        try {
          const dropped = identity.dropKey(body.kid);
          audit.record({ actor: admin.username, action: 'key.drop', outcome: dropped ? 'allow' : 'deny', detail: { kid: body.kid } });
          res.writeHead(dropped ? 200 : 404, { 'content-type': 'application/json', 'cache-control': 'no-store' });
          res.end(JSON.stringify({ dropped, keys: identity.keyInfo() }));
        } catch (error) {
          res.writeHead(409, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: error.message }));
        }
        return;
      }
      if (url.pathname === '/admin/audit' && req.method === 'GET') {
        if (!guardHttp(req, res, 'audit:read')) return;
        const events = audit.query({
          sinceId: Number(url.searchParams.get('sinceId') || 0),
          limit: Number(url.searchParams.get('limit') || 100),
          actor: url.searchParams.get('actor'),
          action: url.searchParams.get('action'),
          outcome: url.searchParams.get('outcome'),
        });
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        res.end(JSON.stringify({ events, nextSinceId: events.length ? events[0].id : Number(url.searchParams.get('sinceId') || 0) }));
        return;
      }
      // Traces e logs agregados: ring buffer local desta instância, ou snapshot
      // remoto (todas as instâncias via Redis Stream) com ?remote=1.
      if (url.pathname === '/admin/traces' && req.method === 'GET') {
        if (!guardHttp(req, res, 'obs:read')) return;
        if (url.searchParams.get('remote') === '1') {
          if (!observability.exporter?.snapshotRemote) { res.writeHead(503, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: 'remote_exporter_not_configured' })); return; }
          try {
            const snapshot = await observability.exporter.snapshotRemote({ count: Number(url.searchParams.get('limit') || 200) });
            res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
            res.end(JSON.stringify({ remote: true, spans: snapshot.spans, logs: snapshot.logs, now: Date.now() }));
          } catch (error) {
            res.writeHead(503, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ error: 'remote_exporter_unavailable', detail: String(error?.message || error) }));
          }
          return;
        }
        const spans = observability.queryTraces({
          limit: Number(url.searchParams.get('limit') || 100),
          sinceId: Number(url.searchParams.get('sinceId') || 0),
          traceId: url.searchParams.get('traceId'),
          minDurationMs: url.searchParams.get('minDurationMs') == null ? null : Number(url.searchParams.get('minDurationMs')),
          name: url.searchParams.get('name'),
          status: url.searchParams.get('status'),
        });
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...(traceHeader || {}) });
        res.end(JSON.stringify({ spans, nextSinceId: spans.length ? spans[0].seq : Number(url.searchParams.get('sinceId') || 0), dropped: observability.spans.dropped, metrics: { spansFinished: observability.metrics.spansFinished, spansDropped: observability.spans.dropped, exportFailures: observability.metrics.exportFailures }, now: Date.now() }));
        return;
      }
      if (url.pathname === '/admin/logs' && req.method === 'GET') {
        if (!guardHttp(req, res, 'obs:read')) return;
        const entries = observability.queryLogs({
          limit: Number(url.searchParams.get('limit') || 100),
          sinceId: Number(url.searchParams.get('sinceId') || 0),
          level: url.searchParams.get('level'),
          traceId: url.searchParams.get('traceId'),
          event: url.searchParams.get('event'),
        });
        res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...(traceHeader || {}) });
        res.end(JSON.stringify({ logs: entries, nextSinceId: entries.length ? entries[0].seq : Number(url.searchParams.get('sinceId') || 0), dropped: observability.logs.dropped, now: Date.now() }));
        return;
      }
      if (url.pathname === '/admin/ping' && req.method === 'GET') {
        if (!guardHttp(req, res, 'admin:metrics')) return;
        const dependencies = await healthMonitor.probeAll({ force: true });
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        res.end(JSON.stringify({ dependencies, ok: summarize(dependencies).ok, now: Date.now() }));
        return;
      }
      if (url.pathname === '/admin/regions' && req.method === 'GET') {
        if (!guardHttp(req, res, 'admin:metrics')) return;
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        res.end(JSON.stringify({ regions: regionalLoad(), thresholds: SCALE_DEFAULTS, now: Date.now() }));
        return;
      }
      // ---------- Fase 39 — DESBLOQUEIO UE5.8/EAC (5 bloqueadores) ----------
      if (url.pathname === '/admin/ue58' && req.method === 'GET') {
        if (!guardHttp(req, res, 'admin:metrics')) return;
        try {
          const status = await collectUe58Status(ue58Cfg);
          audit.record({ actor: 'admin', action: 'ue58.status', resource: 'repo', outcome: 'allow', detail: { api: status.api, blockers: status.blockers.length } });
          res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
          res.end(JSON.stringify(status));
        } catch (error) {
          res.writeHead(502, { 'content-type': 'application/json', 'cache-control': 'no-store' });
          res.end(JSON.stringify({ error: 'ue58_status_failed', detail: String(error?.message ?? error) }));
        }
        return;
      }
      if (url.pathname === '/admin/ue58/secrets' && req.method === 'POST') {
        const admin = guardHttp(req, res, 'admin:metrics');
        if (!admin) return;
        const body = await jsonBody(req);
        try {
          const result = await setRepoSecrets({ ...ue58Cfg, secrets: body.secrets });
          audit.record({ actor: admin.username, action: 'ue58.secrets.set', resource: 'repo', outcome: result.failed.length ? 'partial' : 'allow', detail: { set: result.set, failed: result.failed.map((f) => f.name) } });
          res.writeHead(result.failed.length ? 207 : 200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
          res.end(JSON.stringify(result)); // valores NUNCA ecoam
        } catch (error) {
          audit.record({ actor: admin.username, action: 'ue58.secrets.set', resource: 'repo', outcome: 'deny', detail: { error: String(error?.message ?? error).slice(0, 200) } });
          res.writeHead(400, { 'content-type': 'application/json', 'cache-control': 'no-store' });
          res.end(JSON.stringify({ error: 'ue58_secrets_rejected', detail: String(error?.message ?? error) }));
        }
        return;
      }
      if (url.pathname === '/admin/ue58/runner-token' && req.method === 'POST') {
        const admin = guardHttp(req, res, 'admin:metrics');
        if (!admin) return;
        try {
          const result = await createRunnerRegistrationToken(ue58Cfg);
          audit.record({ actor: admin.username, action: 'ue58.runner_token', resource: 'repo', outcome: 'allow', detail: { expiresAt: result.expiresAt } });
          res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
          res.end(JSON.stringify(result)); // token de registro (1 h) — ponto da ação
        } catch (error) {
          audit.record({ actor: admin.username, action: 'ue58.runner_token', resource: 'repo', outcome: 'deny', detail: { error: String(error?.message ?? error).slice(0, 200) } });
          res.writeHead(502, { 'content-type': 'application/json', 'cache-control': 'no-store' });
          res.end(JSON.stringify({ error: 'ue58_runner_token_failed', detail: String(error?.message ?? error) }));
        }
        return;
      }
      if (url.pathname === '/admin/ue58/smoke' && req.method === 'POST') {
        const admin = guardHttp(req, res, 'admin:metrics');
        if (!admin) return;
        try {
          const result = await triggerInfraSmoke(ue58Cfg);
          audit.record({ actor: admin.username, action: 'ue58.smoke', resource: 'repo', outcome: 'allow', detail: { lastRun: result.lastRun?.id ?? null } });
          res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
          res.end(JSON.stringify(result));
        } catch (error) {
          audit.record({ actor: admin.username, action: 'ue58.smoke', resource: 'repo', outcome: 'deny', detail: { error: String(error?.message ?? error).slice(0, 200) } });
          res.writeHead(502, { 'content-type': 'application/json', 'cache-control': 'no-store' });
          res.end(JSON.stringify({ error: 'ue58_smoke_failed', detail: String(error?.message ?? error) }));
        }
        return;
      }
      if (url.pathname.startsWith('/admin/')) {
        const admin = guardHttp(req, res, 'admin:metrics');
        if (!admin) return;
        const elevated = hasRole(admin, 'admin');
        const payload = {
          metrics,
          queue: queue.length,
          rooms: [...rooms.values()].map((room) => ({ ...room.metrics(), spectators: spectatorPipeline.countFor(room.id) })),
          // Fase 14 — métricas da transmissão (espectadores, pacotes, bytes, pico)
          spectators: spectatorPipeline.metrics(),
          // dados por usuário (usernames, strikes) só para papéis elevados
          clients: elevated ? [...clients.values()].map((client) => ({ id: client.id, username: client.identity.username, role: client.identity.role, region: client.region, roomId: client.roomId, strikes: client.violations.count, suspicious: client.violations.suspicious })) : undefined,
          sessions: (await durable.listSessions()).length,
          admin: admin?.username || 'legacy-token',
          now: Date.now(),
        };
        res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
        res.end(JSON.stringify(payload));
        return;
      }
      res.writeHead(404);
      res.end();
    } catch {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'bad_request' }));
    }
  }

  // Middleware de tracing: contexto W3C por requisição, span com duração,
  // log estruturado e headers traceparent/x-request-id na resposta.
  const tracedHandler = traceHttpHandler(observability, (req, res) => httpHandler(req, res));

  const server = tlsConfig
    ? https.createServer({ cert: tlsConfig.cert, key: tlsConfig.key }, (req, res) => { void tracedHandler(req, res); })
    : http.createServer((req, res) => { void tracedHandler(req, res); });

  // ws≥8: todo WebSocketServer criado com { server } recebe TODOS os eventos
  // 'upgrade' do http server e aborta com 400 os paths que não são seus —
  // DEPOIS de outro WSS já ter escrito o 101 no mesmo socket. O cliente, já
  // em modo de frames, lê "HTTP/1.1 400..." como frame (primeiro byte 0x48
  // seta RSV1) e cai com WS_ERR_UNEXPECTED_RSV_1. Solução: WSS em noServer +
  // UM roteador central que entrega cada upgrade ao WSS dono do path.
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_WS_PAYLOAD, perMessageDeflate: false });
  // Fase 14 — endpoint do espectador no MESMO http server (path próprio);
  // autoRoute=false: o despacho dos dois paths é centralizado no roteador.
  spectatorPipeline.attach(server, { autoRoute: false });
  const routeUpgrade = (req, socket, head) => {
    let pathname = '/';
    try { pathname = new URL(req.url || '/', 'ws://localhost').pathname; } catch { socket.destroy(); return; }
    if (pathname === '/ws') wss.handleUpgrade(req, socket, head, wss.emit.bind(wss, 'connection'));
    else if (pathname === '/ws/spectator') spectatorPipeline.handleUpgrade(req, socket, head);
    else socket.destroy();
  };
  server.on('upgrade', routeUpgrade);
  const handleConnection = async (ws, req) => {
    const url = new URL(req.url, 'ws://localhost');
    const token = url.searchParams.get('token');
    const user = identity.verify(token);
    if (!user) { metrics.authFailures++; send(ws, { type: 'auth_required' }); ws.close(4001, 'auth-required'); return; }
    const mode = normalizeMode(url.searchParams.get('mode'));
    const resume = url.searchParams.get('resume');
    // Falha de leitura no store não pode bloquear a entrada do jogador:
    // trata como sessão nova (fail-fresh) e sinaliza a degradação.
    let saved = null;
    if (resume) {
      try {
        saved = await durable.getSession(resume);
      } catch {
        saved = null;
        metrics.storeReadFailures++;
      }
    }
    const blankInput3D = { seq: 0, dx: 0, dy: 0, yaw: 0, pitch: 0, fire: false, ads: false, sprint: false, jump: false, interact: false, reload: false, medkit: false, slot: 0 };
    let client;
    if (saved && saved.userId === user.sub && saved.expiresAt > Date.now() && rooms.get(saved.roomId)?.players.has(saved.id)) {
      client = { id: saved.id, ws, roomId: saved.roomId, mode, seq: 0, input: { seq: 0, dx: 0, dy: 0, aimX: 550, aimY: 330, fire: false, interact: false }, input3d: { ...blankInput3D }, violations: new ViolationTracker(), identity: user, region: normalizeRegion(user.region), resumeToken: resume, connectedAt: Date.now() };
      metrics.reconnects++;
    } else if (saved && saved.userId === user.sub && saved.expiresAt > Date.now() && !rooms.has(saved.roomId)) {
      // M3 — a sala da sessão não vive nesta réplica: a sessão NÃO é duplicada
      // nem realocada às cegas — redireciona ao dono vivo (registry com TTL).
      // Dono morto/desconhecido → cai no fluxo normal (nova alocação).
      const redirect = await distributedLayer.redirectFor(saved.roomId).catch(() => null);
      if (redirect) {
        metrics.redirects = (metrics.redirects ?? 0) + 1;
        audit.record({ actor: user.username, action: 'distributed.redirect', resource: saved.roomId, outcome: 'allow', detail: { to: redirect.to || redirect.owner } });
        send(ws, { type: 'redirect', roomId: saved.roomId, to: redirect.to, owner: redirect.owner });
        ws.close(4003, 'redirect-owner');
        return;
      }
      client = { id: `client-${nextClient++}`, ws, roomId: null, mode, seq: 0, input: { seq: 0, dx: 0, dy: 0, aimX: 550, aimY: 330, fire: false, interact: false }, input3d: { ...blankInput3D }, violations: new ViolationTracker(), identity: user, region: chooseRegion(user.region, {}), resumeToken: crypto.randomBytes(24).toString('base64url'), connectedAt: Date.now() };
    } else {
      client = { id: `client-${nextClient++}`, ws, roomId: null, mode, seq: 0, input: { seq: 0, dx: 0, dy: 0, aimX: 550, aimY: 330, fire: false, interact: false }, input3d: { ...blankInput3D }, violations: new ViolationTracker(), identity: user, region: chooseRegion(user.region, {}), resumeToken: crypto.randomBytes(24).toString('base64url'), connectedAt: Date.now() };
    }
    clients.set(client.id, client);
    metrics.connections++;
    // Sessão WebSocket como trace de ciclo de vida: span por sessão + logs de
    // entrada/saída amostrados (KR_OBS_WS_SAMPLE) para não inundar a 30 Hz.
    const wsCtx = { traceId: crypto.randomBytes(16).toString('hex'), spanId: crypto.randomBytes(8).toString('hex') };
    const wsSpan = observability.startSpan({
      name: `ws session ${client.id}`,
      traceId: wsCtx.traceId,
      sampled: Math.random() < observability.wsSampleRate || metrics.reconnects === 0,
      attributes: { 'ws.mode': mode, 'ws.username': client.identity.username, 'ws.region': client.region, 'ws.resume': Boolean(resume) },
    });
    observability.recordLog({
      level: 'info', event: 'ws.connect', trace: wsCtx,
      fields: { username: client.identity.username, mode, region: client.region, resumed: Boolean(resume), connections: clients.size },
    });
    // M4 — buffer de mensagens durante o setup da conexão: o assign automático
    // pode levar centenas de ms (sala 3D + consulta de patente), e o handler
    // definitivo só era anexado DEPOIS — qualquer mensagem do cliente nesse
    // intervalo (create_private/join_private/ping imediatos) era PERDIDA sem
    // resposta nem erro. O handler provisório acumula; o drain injeta na
    // ordem de chegada quando o setup termina.
    const earlyMessages = [];
    let connectionReady = false;
    const earlyHandler = (raw) => { if (!connectionReady) earlyMessages.push(raw); };
    ws.on('message', earlyHandler);

    if (!client.roomId) { queue.push(client); send(ws, { type: 'queued', id: client.id, region: client.region, queue: queue.length }); await assign(client); }
    else send(ws, { type: 'resumed', id: client.id, roomId: client.roomId, region: client.region, resumeToken: client.resumeToken, snapshot: getRoom(client).snapshot(client.id) });

    connectionReady = true;
    ws.off('message', earlyHandler);

    const messageHandler = (raw) => {
      void (async () => {
        metrics.messages++;
        if (raw.length > MAX_WS_PAYLOAD) { metrics.oversized++; ws.close(4009, 'payload-too-large'); return; }
        const limited = await allowOrOpen(client.mode === '3d' ? limiter3d : limiter, client.identity.sub);
        if (!limited.allowed) { metrics.rateLimited++; send(ws, { type: 'rate_limited', retryAt: limited.resetAt }); return; }
        try {
          const message = JSON.parse(raw.toString());
          if (message.type === 'ping') { send(ws, { type: 'pong', t: message.t, te: message.te, now: Date.now() }); return; }
          // ---------- Fase 7 — salas privadas com código de convite (modo 3D) ----------
          if (message.type === 'create_private') {
            if (client.mode !== '3d') { send(ws, { type: 'private_error', reason: 'modo_2d_sem_squad' }); return; }
            const rngCrypto = () => crypto.randomBytes(4).readUInt32BE(0) / 0x100000000;
            const roomId = `${roomPrefix}priv3d-${nextRoom++}`;
            const lease = await safeAcquire(roomId); // M3 — posse antes da mutação
            const room = new MatchRoom3D({
              id: roomId,
              seed: `${process.env.MATCH_SEED || 'CIGKV'}-PRIV-${nextRoom}`,
              region: client.region, capacity: roomCapacity, botFill: roomCapacity - 1,
              squad: true, isPrivate: true, inviteCode: makeInviteCode(rngCrypto), onMatchEnd: handleMatchEnd,
              officerPlanFn: () => pojService.officerPlan(), aoi: aoiEnabled,
            });
            room.fence = lease.fence ?? 0;
            rooms.set(room.id, room);
            void distributedLayer.publish(room.id, 'room_open', { region: room.region, mode: '3d', capacity: room.capacity, private: true });
            // M4 — convite visível às OUTRAS réplicas: o índice compartilhado
            // permite join cross-réplica pelo código (redirect ao dono).
            void distributedLayer.publishInvite(room.inviteCode, room.id);
            const position = queue.indexOf(client);
            if (position >= 0) queue.splice(position, 1);
            if (!(await guardedJoin(room, client))) return; // M3
            audit.record({ actor: client.identity.username, action: 'room.private.create', resource: room.id, outcome: 'allow', detail: { code: room.inviteCode } });
            send(ws, { type: 'private_created', code: room.inviteCode, roomId: room.id, region: room.region, snapshot: room.snapshot(client.id) });
            return;
          }
          if (message.type === 'join_private') {
            if (client.mode !== '3d') { send(ws, { type: 'private_error', reason: 'modo_2d_sem_squad' }); return; }
            const code = normalizeInviteCode(message.code);
            const room = findRoomByCode(rooms, code);
            if (!room && distributedLayer.enabled) {
              // M4 — join cross-réplica: a sala não é desta réplica. O índice
              // de convites compartilhado resolve o dono; o registry fornece
              // o endereço público do dono (KR_REPLICA_URL) e o cliente é
              // redirecionado — a AUTORIDADE da sala nunca se duplica.
              const ref = await distributedLayer.lookupInvite(code);
              const target = ref?.roomId ? await distributedLayer.redirectFor(ref.roomId) : null;
              if (ref?.roomId && ref.replicaId === distributedLayer.replicaId) {
                // Dono é a própria réplica e a sala não está no mapa local:
                // sala morreu (restart) — sem para onde redirecionar.
                send(ws, { type: 'private_not_found', code }); return;
              }
              if (target?.to) {
                audit.record({ actor: client.identity.username, action: 'room.private.cross_replica_redirect', resource: ref.roomId, outcome: 'allow', detail: { owner: target.owner, to: target.to } });
                send(ws, { type: 'redirect', roomId: ref.roomId, code, to: target.to, owner: target.owner, reason: 'cross_replica' });
                return;
              }
            }
            if (!room) { send(ws, { type: 'private_not_found', code }); return; }
            const position = queue.indexOf(client);
            if (position >= 0) queue.splice(position, 1);
            if (!(await guardedJoin(room, client))) return; // M3 — mutação sob fence
            audit.record({ actor: client.identity.username, action: 'room.private.join', resource: room.id, outcome: 'allow' });
            send(ws, { type: 'private_joined', code: room.inviteCode, roomId: room.id, region: room.region, snapshot: room.snapshot(client.id) });
            return;
          }
          if (message.type === 'set_operative') {
            // Fase 8 — o cliente declara o operativo escolhido (LOBBY; validado na sala)
            const room = getRoom(client);
            if (room?.is3d) {
              room.setOperative(client.id, String(message.operativeId || ''));
              // Fase 11 — empurra snapshot imediato no LOBBY: erros de insígnia
              // (operative_error) e patente chegam sem esperar o start da partida.
              send(ws, { type: 'snapshot', snapshot: room.snapshot(client.id) });
            }
            return;
          }
          if (message.type === 'start') {
            const room = getRoom(client);
            if (!can(client.identity, 'room:start', room?.id)) {
              metrics.rbacDenies++;
              audit.record({ actor: client.identity.username, action: 'rbac.deny', resource: room?.id || null, outcome: 'deny', detail: { permission: 'room:start', via: 'ws' } });
              send(ws, { type: 'forbidden', permission: 'room:start' });
              return;
            }
            if (room) audit.record({ actor: client.identity.username, action: 'room.start', resource: room.id, outcome: 'allow' });
            room?.start(client.id, message.entry || 'belt');
            return;
          }
          if (message.type !== 'input') return;
          const room = getRoom(client);
          if (room?.is3d) {
            const candidate = { ...message.input, seq: message.input?.seq ?? -1 };
            const result = validateInput3D(client.input3d, candidate, 1 / 20);
            if (!result.ok) {
              client.violations.add(result.violations);
              metrics.rejections++;
              metrics.violations += result.violations.length;
              send(ws, { type: 'rejected', violations: result.violations, strikes: client.violations.count });
              if (client.violations.banned) { metrics.bans++; send(ws, { type: 'banned', reason: 'anti-cheat threshold' }); ws.close(4003, 'anti-cheat'); }
              return;
            }
            client.input3d = candidate;
            client.seq = candidate.seq;
            room.input(client.id, candidate);
            return;
          }
          const candidate = { ...message.input, seq: message.input?.seq ?? -1 };
          const player = room?.players.get(client.id);
          const previous = { ...client.input, x: player?.x ?? 550, y: player?.y ?? 330 };
          const result = validateInput(previous, candidate, 1 / 20);
          if (!result.ok) {
            client.violations.add(result.violations);
            metrics.rejections++;
            metrics.violations += result.violations.length;
            send(ws, { type: 'rejected', violations: result.violations, strikes: client.violations.count });
            if (client.violations.banned) { metrics.bans++; send(ws, { type: 'banned', reason: 'anti-cheat threshold' }); ws.close(4003, 'anti-cheat'); }
            return;
          }
          client.input = candidate;
          client.seq = candidate.seq;
          room?.input(client.id, candidate, 1 / 20);
        } catch {
          client.violations.add(['malformed_message']);
          metrics.violations++;
        }
      })().catch(() => ws.close(1011, 'server-error'));
    };
    // M4 — drain do buffer de setup (ordem de chegada preservada) + handler definitivo.
    for (const raw of earlyMessages.splice(0)) messageHandler(raw);
    ws.on('message', messageHandler);
    ws.on('close', () => {
      void durable.setSession(client.resumeToken, { id: client.id, userId: user.sub, roomId: client.roomId, expiresAt: Date.now() + 15000 }).catch?.(() => {});
      clients.delete(client.id);
      observability.recordLog({ level: 'info', event: 'ws.disconnect', trace: wsCtx, fields: { username: client.identity.username, roomId: client.roomId, liveConnections: clients.size } });
      wsSpan.finish('ok', { 'ws.durationMs': Date.now() - wsSpan.startedAt, 'ws.messages': metrics.messages });
    });
  };
  wss.on('connection', (ws, req) => { void handleConnection(ws, req).catch(() => ws.close(1011, 'server-error')); });

  const timer = setInterval(() => {
    metrics.ticks++;
    for (const room of rooms.values()) {
      // M3 — fencing: dono que perdeu a posse CONGELA a sala (owner_lost):
      // para de tickar/mutar e pede reconexão — o dono antigo nunca continua
      // escrevendo depois do takeover do epoch novo.
      if (distributedLayer.enabled && distributedLayer.isFrozen(room.id)) {
        if (!frozenNotified.has(room.id)) {
          frozenNotified.add(room.id);
          for (const client of clients.values()) if (client.roomId === room.id) send(client.ws, { type: 'owner_lost', roomId: room.id });
          audit.record({ actor: 'system', action: 'distributed.owner_lost', resource: room.id, outcome: 'deny' });
        }
        continue;
      }
      room.tick(1 / 20);
      // Fase 14 — transmissão: salas 3D alimentam o pipeline (custo zero sem plateia)
      if (room.mode === '3d') spectatorPipeline.pushRoom(room);
      for (const client of clients.values()) if (client.roomId === room.id) send(client.ws, { type: 'snapshot', snapshot: room.snapshot(client.id), events: [] });
    }
  }, 50);
  const cleanup = setInterval(() => {
    void (async () => {
      for (const [id, room] of rooms) if (room.players.size === 0 && Date.now() - room.lastActivity > 60000) { rooms.delete(id); await distributedLayer.release(id); if (room.isPrivate && room.inviteCode) await distributedLayer.dropInvite(room.inviteCode); frozenNotified.delete(id); } // M3 — lease liberado junto · M4 — convite removido do índice
      if (typeof durable.cleanupExpired === 'function') await durable.cleanupExpired();
      else for (const session of await durable.listSessions()) if (session.expiresAt < Date.now()) await durable.deleteSession(session.id);
    })().catch(() => {});
  }, 10000);

  // M3 — heartbeat do registro de réplicas + relay espelho entre réplicas.
  void distributedLayer.start().catch(() => {});
  const distributedStatus = () => ({
    enabled: distributedLayer.enabled,
    replicaId: distributedLayer.replicaId,
    heldRooms: distributedLayer.held ? distributedLayer.held.size : 0,
    frozenRooms: distributedLayer.frozen ? distributedLayer.frozen.size : 0,
    ...(distributedLayer.metrics || {}),
  });

  // M4 — ponte EOS NATIVA (credential-gated): sem credenciais responde
  // `unconfigured` e rejeita operações — o mock vive só nos unit tests.
  // Sessões EOS ancoram em salas POSSUÍDAS por esta réplica (fencing M3/M4).
  const eosBridge = eos || createEosBridge({
    config: eosConfigFromEnv(),
    isRoomOwnedLocally: (roomId) => {
      if (!rooms.has(roomId)) return false;
      if (!distributedLayer.enabled) return true;
      return Boolean(distributedLayer.held && distributedLayer.held.has(roomId)) && !distributedLayer.isFrozen(roomId);
    },
  });
  eosBridge.start();
  const ready = Promise.all([durable.ready?.(), selectedRateStore.ready?.(), distributedLayer.ready?.()]);
  return {
    server, wss, rooms, clients, queue, metrics, auth: identity, store: durable, rateStore: selectedRateStore, ready,
    distributed: distributedLayer, // M3 — exposto p/ testes/operação
    eos: eosBridge, // M4 — ponte EOS nativa exposta p/ testes/operação
    spectator: spectatorPipeline, // Fase 14 — pipeline da transmissão exposto p/ testes/operação
    economy: economyService,
    tls: tlsConfig, oidc: oidcClient, audit, health: healthMonitor,
    obs: observability,
    close: async () => {
      clearInterval(timer);
      clearInterval(cleanup);
      eosBridge.stop(); // M4 — encerra timers/estado da ponte EOS
      await distributedLayer.stop().catch(() => {}); // M3 — libera leases/registros
      try { server.off('upgrade', routeUpgrade); } catch { /* já removido */ }
      spectatorPipeline.destroy(); // Fase 14 — encerra timers/clients da transmissão
      for (const client of clients.values()) client.ws.close();
      await new Promise((resolve) => server.close(resolve));
      await durable.close?.();
      await selectedRateStore.close?.();
      await observability.exporter?.close?.();
    },
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const app = createAuthoritativeServer();
  app.ready.then(() => app.server.listen(Number(process.env.PORT || 8787), () => {
    const scheme = app.tls ? 'https' : 'http';
    const extras = [app.tls ? 'TLS on' : 'TLS off', app.oidc ? 'SSO/OIDC on' : 'SSO/OIDC off'].join(' | ');
    console.log(`[CIGKV authoritative] ${scheme}://localhost:${process.env.PORT || 8787} | /ws | /auth/login | /auth/logout | /auth/oidc/start | /admin.html | ${extras}`);
  }))
    .catch((error) => { console.error(`[CIGKV authoritative] dependency readiness failed: ${error.message}`); process.exitCode = 1; });
}
