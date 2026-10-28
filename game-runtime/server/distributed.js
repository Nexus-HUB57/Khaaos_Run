// Khaaos Run — M3: multiplayer distribuído (ownership/fencing de salas) + relay
// de eventos com ordem monotônica entre réplicas.
//
// Modelo de consistência (fencing tokens, Kleppmann):
//   - Cada sala tem UM dono por vez, registrado com lease (TTL) num registro
//     compartilhado entre réplicas (Redis ou memória compartilhada de teste).
//   - O lease carrega um EPOCH (fence) monotônico por sala: cada NOVA posse
//     incrementa o epoch; renovações preservam o fence. Uma réplica que age
//     com fence antigo (partição curta, GC pause, failover) é REJEITADA —
//     o dono novo sempre tem epoch maior.
//   - O dono perde o lease (heartbeat falhou) → congela a sala localmente
//     (owner_lost): para de mutar e pede reconexão — o dono antigo nunca
//     continua escrevendo depois do takeover.
//
// Relay de eventos entre réplicas:
//   - Cada sala publica eventos de ciclo de vida num stream com seq
//     MONOTÔNICA por sala; consumo deduplica (só aceita seq > última vista),
//     replay é LIMITADO (MAXLEN do stream / cap do buffer em memória) e os
//     dados expiram por TTL — sem crescimento indefinido.
//
// Dois drivers com SEMÂNTICA IDÊNTICA:
//   - MemoryOwnership/MemoryRelay: mapa em processo, operações serializadas —
//     usado nos testes de duas réplicas no CI (determinístico).
//   - RedisOwnership/RedisRelay: mesmas operações em Lua/scripts atômicos —
//     usado no staging (KR_REDIS_URL + KR_DISTRIBUTED=1).
import { setTimeout as delay } from 'node:timers/promises';
import { createRequire } from 'node:module';

const now = () => Date.now();

// ─────────────────────────────────────────────────────────────────────────────
// Driver MEMÓRIA — semântica canônica (as mesmas regras do Lua abaixo).
// A entrada da sala SOBREVIVE à expiração preservando o fence (epoch) —
// expirar libera a POSSE, mas não reseta a contagem de epochs.
// ─────────────────────────────────────────────────────────────────────────────
export class MemoryOwnership {
  constructor() { this.map = new Map(); }
  #entry(roomId) {
    const e = this.map.get(roomId);
    if (!e) return null;
    return e;
  }
  acquire(roomId, owner, ttlMs) {
    const e = this.#entry(roomId);
    const t = now();
    if (e && e.owner === owner && e.expiresAt > t) {
      e.expiresAt = t + ttlMs; // renovação: mesma posse, mesmo fence
      return { owned: true, fence: e.fence, renewed: true };
    }
    if (e && e.expiresAt > t) return { owned: false, fence: e.fence, owner: e.owner };
    const fence = (e?.fence ?? 0) + 1; // nova posse → epoch sobe (inclusive pós-expiração)
    this.map.set(roomId, { owner, fence, expiresAt: t + ttlMs });
    return { owned: true, fence, fresh: true };
  }
  release(roomId, owner, fence) {
    const e = this.#entry(roomId);
    if (!e || e.owner !== owner || e.fence !== fence) return false;
    this.map.delete(roomId);
    return true;
  }
  verify(roomId, owner, fence) {
    const e = this.#entry(roomId);
    return Boolean(e && e.expiresAt > now() && e.owner === owner && e.fence === fence);
  }
  ownerOf(roomId) {
    const e = this.#entry(roomId);
    if (!e || e.expiresAt <= now()) return null;
    return { owner: e.owner, fence: e.fence };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Driver REDIS — mesmas regras, atômicas via Lua. Chaves:
//   kr:own:{roomId}        → HASH {owner, fence} com PX ttl (posse viva)
//   kr:ownfence:{roomId}   → contador de epochs (sobrevive à expiração da posse)
// ─────────────────────────────────────────────────────────────────────────────
const ACQUIRE_LUA = `
local own = redis.call('HGET', KEYS[1], 'owner')
local fence = redis.call('HGET', KEYS[1], 'fence')
if own and own == ARGV[1] and fence then
  redis.call('PEXPIRE', KEYS[1], ARGV[2])
  return {1, fence, 1}
end
if own and fence then
  return {0, fence, 0, own}
end
local nextf = redis.call('INCR', KEYS[2])
redis.call('HSET', KEYS[1], 'owner', ARGV[1], 'fence', nextf)
redis.call('PEXPIRE', KEYS[1], ARGV[2])
redis.call('PEXPIRE', KEYS[2], ARGV[3])
return {1, nextf, 0}
`;
export class RedisOwnership {
  constructor(client, { epochTtlMs = 24 * 3600 * 1000 } = {}) {
    this.client = client;
    this.epochTtlMs = epochTtlMs;
  }
  async acquire(roomId, owner, ttlMs) {
    const r = await this.client.eval(ACQUIRE_LUA, {
      keys: [`kr:own:${roomId}`, `kr:ownfence:${roomId}`],
      arguments: [owner, String(ttlMs), String(this.epochTtlMs)],
    });
    const [owned, fence, renewed] = r;
    const out = { owned: owned === 1, fence: Number(fence) };
    if (owned === 1) out.renewed = renewed === 1;
    else out.owner = String(r[3]);
    return out;
  }
  async release(roomId, owner, fence) {
    // Release condicional: só o dono com o fence atual libera.
    const script = `
local own = redis.call('HGET', KEYS[1], 'owner')
local f = redis.call('HGET', KEYS[1], 'fence')
if own == ARGV[1] and f == ARGV[2] then
  redis.call('DEL', KEYS[1])
  return 1
end
return 0`;
    const r = await this.client.eval(script, { keys: [`kr:own:${roomId}`], arguments: [owner, String(fence)] });
    return r === 1;
  }
  async verify(roomId, owner, fence) {
    const o = await this.ownerOf(roomId);
    return Boolean(o && o.owner === owner && o.fence === fence);
  }
  async ownerOf(roomId) {
    const r = await this.client.hGetAll(`kr:own:${roomId}`);
    if (!r || !r.owner || !r.fence) return null;
    return { owner: r.owner, fence: Number(r.fence) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Relay MEMÓRIA — stream por sala com seq monotônica, replay limitado (cap) e
// TTL preguiçoso (purga na leitura). Determinístico para testes.
// ─────────────────────────────────────────────────────────────────────────────
export class MemoryRelay {
  constructor({ maxlen = 512, ttlMs = 60_000 } = {}) {
    this.maxlen = maxlen;
    this.ttlMs = ttlMs;
    this.streams = new Map(); // roomId → { seq, events: [{seq, ts, type, payload}] }
    this.global = 'kr:relay:global';
  }
  #stream(roomId) {
    let s = this.streams.get(roomId);
    if (!s) { s = { seq: 0, events: [] }; this.streams.set(roomId, s); }
    return s;
  }
  publish(roomId, type, payload = {}) {
    const s = this.#stream(roomId);
    const event = { seq: ++s.seq, ts: now(), type, payload };
    s.events.push(event);
    if (s.events.length > this.maxlen) s.events.splice(0, s.events.length - this.maxlen); // replay limitado
    return event;
  }
  read(roomId, afterSeq = 0, { limit = 128 } = {}) {
    const s = this.streams.get(roomId);
    if (!s) return [];
    const cutoff = now() - this.ttlMs; // TTL: eventos velhos não são entregues
    s.events = s.events.filter((e) => e.ts >= cutoff || e === s.events[s.events.length - 1]);
    return s.events.filter((e) => e.seq > afterSeq && e.ts >= cutoff).slice(0, limit);
  }
  reset(roomId) { this.streams.delete(roomId); }
}

// ─────────────────────────────────────────────────────────────────────────────
// Relay REDIS — XADD com MAXLEN (replay limitado) + EXPIRE (TTL) + INCR (seq).
//   kr:relay:{roomId}       → stream de eventos (MAXLEN ~ maxlen)
//   kr:relayseq:{roomId}    → seq monotônica por sala
// O seq é lido do próprio evento (campo 'seq') — XRANGE é ordenado por tempo
// de inserção, e o INCR garante que a inserção segue a ordem do seq.
// ─────────────────────────────────────────────────────────────────────────────
export class RedisRelay {
  constructor(client, { maxlen = 512, ttlMs = 60_000 } = {}) {
    this.client = client;
    this.maxlen = maxlen;
    this.ttlMs = ttlMs;
  }
  async publish(roomId, type, payload = {}) {
    const seq = await this.client.incr(`kr:relayseq:${roomId}`);
    const id = `${seq}-${1}`; // id determinístico pela seq: XRANGE volta em ordem de seq
    await this.client.xAdd(`kr:relay:${roomId}`, id, { seq: String(seq), type, payload: JSON.stringify(payload ?? {}) });
    await this.client.expire(`kr:relay:${roomId}`, Math.ceil(this.ttlMs / 1000));
    await this.client.expire(`kr:relayseq:${roomId}`, Math.ceil(this.ttlMs / 1000) * 4);
    return { seq, type, payload, ts: now() };
  }
  async read(roomId, afterSeq = 0, { limit = 128 } = {}) {
    const entries = await this.client.xRange(`kr:relay:${roomId}`, `${afterSeq + 1}-0`, '+', { COUNT: limit });
    return entries.map(({ message }) => ({
      seq: Number(message.seq), type: message.type, payload: safeParse(message.payload), ts: now(),
    }));
  }
  async reset(roomId) {
    await this.client.del(`kr:relay:${roomId}`);
    await this.client.del(`kr:relayseq:${roomId}`);
  }
}

function safeParse(s) { try { return JSON.parse(s); } catch { return {}; } }

// ─────────────────────────────────────────────────────────────────────────────
// Consumidor com DEDUPLICação por seq: só aceita seq estritamente crescente
// (> última vista). Gap (perda) não trava o consumo: salta para o máximo visto
// e contabiliza — ordem NUNCA regrede e eventos NUNCA são aplicados duas vezes.
// ─────────────────────────────────────────────────────────────────────────────
export class RelayConsumer {
  constructor({ onGap } = {}) {
    this.lastSeq = 0;
    this.applied = 0;
    this.duplicates = 0;
    this.gaps = 0;
    this.onGap = onGap ?? null;
  }
  feed(events) {
    const accepted = [];
    for (const e of events ?? []) {
      if (e.seq <= this.lastSeq) { this.duplicates++; continue; } // duplicado/replay antigo
      if (this.lastSeq > 0 && e.seq > this.lastSeq + 1) {
        this.gaps += e.seq - this.lastSeq - 1; // perda: conta os buracos
        this.onGap?.({ from: this.lastSeq, to: e.seq });
      }
      this.lastSeq = e.seq; // monotônico, mesmo com gap (salta para frente)
      this.applied++;
      accepted.push(e);
    }
    return accepted;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Registro de réplicas: cada réplica se anuncia (id → endereço) com TTL para
// que outra réplica redirecione reconexões ao dono vivo da sala.
// ─────────────────────────────────────────────────────────────────────────────
export class MemoryReplicaRegistry {
  constructor() { this.map = new Map(); }
  async register(replicaId, address, ttlMs) { this.map.set(replicaId, { address, expiresAt: now() + ttlMs }); }
  async lookup(replicaId) {
    const e = this.map.get(replicaId);
    if (!e || e.expiresAt <= now()) return null;
    return e.address;
  }
}

export class RedisReplicaRegistry {
  constructor(client) { this.client = client; }
  async register(replicaId, address, ttlMs) {
    await this.client.set(`kr:replica:${replicaId}`, address, { PX: ttlMs });
  }
  async lookup(replicaId) {
    const v = await this.client.get(`kr:replica:${replicaId}`);
    return v ?? null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Camada distribuída de alto nível usada pelo servidor.
// `enabled=false` → no-op total (zero mudança de comportamento no single-node).
// ─────────────────────────────────────────────────────────────────────────────
export function createDistributed({
  enabled = false,
  replicaId = null,
  address = null,
  ownership = null,
  relay = null,
  registry = null,
  invites = null, // M4 — store de convites compartilhável (testes multi-réplica)
  redisUrl = null,
  ttlMs = 15_000,
  heartbeatMs = 5_000,
  mirrorMs = 1_000,
} = {}) {
  const id = replicaId || `replica-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
  // Drivers padrão: memória (determinística p/ testes no mesmo processo) ou
  // Redis (staging) com conexão LAZY — o cliente conecta em background e
  // `ready()` aguarda o PING; falhas de rede degradam via fail-open do caller.
  let redisClient = null;
  if (enabled && !ownership && redisUrl) {
    // Driver Redis com conexão LAZY: o construtor permanece síncrono e o
    // `ready()` da camada aguarda connect+ping. Os métodos operacionais falham
    // individualmente enquanto o cliente não está pronto — o caller faz fail-open.
    const require = createRequire(import.meta.url);
    const { createClient } = require('redis');
    redisClient = createClient({ url: redisUrl });
    const connectPromise = redisClient.connect().then(() => redisClient.ping());
    ownership = new RedisOwnership(redisClient);
    relay = new RedisRelay(redisClient);
    registry = new RedisReplicaRegistry(redisClient);
    var distributedReady = async () => { await connectPromise; return true; };
    var distributedClose = async () => { try { if (redisClient.isOpen) await redisClient.quit(); } catch { /* já fechado */ } };
  }
  const own = ownership || new MemoryOwnership();
  const rly = relay || null;
  // ── M4 — Índice de convites COMPARTILHADO entre réplicas ────────────────────
  // O código de convite de salas privadas nasce LOCAL à réplica dona; sem um
  // índice compartilhado, `join_private` numa outra réplica responde
  // `private_not_found` e o jogador não entra — o cross-replica de fato
  // dependia de adivinhar o nó certo. O índice mapeia code → {roomId, réplica}
  // no MESMO store da posse (Redis no staging; Map nos testes determinísticos),
  // com TTL próprio (convites sobrevivem a heartbeats curtos, mas expiram com
  // a sala). Escrita APENAS na criação (dono); leitura por qualquer réplica.
  const inviteTtlMs = Number(process.env.KR_INVITE_TTL_MS || 30 * 60_000);
  const localInvites = invites || new Map(); // code → { roomId, replicaId, expiresAt } (driver memória)
  const INVITE_KEY = (code) => `kr:invite:${code}`;
  const publishInvite = async (code, roomId) => {
    if (!enabled) return false;
    const record = { roomId, replicaId: id };
    try {
      if (redisClient) await redisClient.set(INVITE_KEY(code), JSON.stringify(record), { PX: inviteTtlMs });
      else localInvites.set(code, { ...record, expiresAt: now() + inviteTtlMs });
      metrics.invitesPublished++;
      return true;
    } catch { return false; } // fail-open: convite continua válido localmente
  };
  const lookupInvite = async (code) => {
    if (!enabled) return null;
    metrics.inviteLookups++;
    try {
      let found = null;
      if (redisClient) {
        const raw = await redisClient.get(INVITE_KEY(code));
        found = raw ? JSON.parse(raw) : null;
      } else {
        const e = localInvites.get(code);
        if (!e || e.expiresAt <= now()) { if (e) localInvites.delete(code); found = null; }
        else found = { roomId: e.roomId, replicaId: e.replicaId };
      }
      if (found) metrics.inviteHits++;
      return found;
    } catch { return null; }
  };
  const dropInvite = async (code) => {
    if (!enabled) return;
    try {
      if (redisClient) await redisClient.del(INVITE_KEY(code));
      else localInvites.delete(code);
    } catch { /* best-effort: TTL cobre o resíduo */ }
  };
  const metrics = {
    acquired: 0, renewed: 0, lost: 0, released: 0, fenceViolations: 0,
    redirects: 0, mirrorApplied: 0, mirrorGaps: 0, publishes: 0,
    invitesPublished: 0, inviteLookups: 0, inviteHits: 0,
  };
  let heartbeatTimer = null;
  let mirrorTimer = null;
  let stopped = false;
  const held = new Map(); // roomId → fence (leases vivos desta réplica)
  const frozen = new Set(); // salas congeladas por perda de lease (owner_lost)

  async function heartbeat() {
    // M4 — RENOVAÇÃO do registro de réplicas: sem isto, a entrada expira em
    // ttlMs*2 (30 s no default) e o redirect cross-réplica começa a falhar
    // (ownerOf → registry.lookup → null) mesmo com a réplica VIVA. O registro
    // é renovado no mesmo cadencimento do heartbeat de leases.
    if (address && registry) {
      try { await registry.register(id, address, ttlMs * 2); } catch { /* rede oscilou: próxima passada */ }
    }
    for (const [roomId, fence] of held) {
      try {
        const r = await ownership.acquire(roomId, id, ttlMs);
        if (!r.owned) {
          // Perdemos a posse (expirou e outra réplica tomou com epoch maior).
          held.delete(roomId);
          frozen.add(roomId);
          metrics.lost++;
          continue;
        }
        if (r.fence !== fence) { held.set(roomId, r.fence); } // epoch subiu por renovação pós-expiração
        metrics.renewed++;
      } catch { /* rede oscilou: tentativa seguinte decide */ }
    }
  }

  async function mirrorLoop() {
    try {
      const events = await relay.read(relayGlobalKey(), mirror.lastSeq, { limit: 64 });
      const accepted = mirror.feed(events);
      metrics.mirrorApplied += accepted.length;
      for (const e of accepted) mirrorHandlers.get(e.type)?.(e.payload, e);
    } catch { /* driver indisponível: próxima passada */ }
  }

  const mirrorHandlers = new Map();
  const mirror = new RelayConsumer({ onGap: () => {} });

  return {
    enabled: Boolean(enabled),
    replicaId: id,
    metrics,
    relayGlobalKey: () => '__global__',
    frozen,
    held,
    ready: distributedReady || (async () => true),
    onMirror(type, handler) { mirrorHandlers.set(type, handler); },
    async start() {
      if (!enabled || stopped) return;
      stopped = false;
      if (address && registry) await registry.register(id, address, ttlMs * 2);
      heartbeatTimer = setInterval(() => { void heartbeat(); }, heartbeatMs);
      if (mirrorTimer === null && rly) {
        mirrorTimer = setInterval(() => { void mirrorLoop(); }, mirrorMs);
        if (mirrorTimer.unref) mirrorTimer.unref();
      }
      if (heartbeatTimer.unref) heartbeatTimer.unref();
      await heartbeat();
      await mirrorLoop();
    },
    async stop() {
      stopped = true;
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      if (mirrorTimer) clearInterval(mirrorTimer);
      heartbeatTimer = mirrorTimer = null;
      for (const [roomId, fence] of held) { try { await own.release(roomId, id, fence); } catch { /* best-effort */ } }
      held.clear();
      if (distributedClose) await distributedClose();
    },
    // Tenta tornar esta réplica dona da sala. Falha → { owned:false, owner }.
    async acquire(roomId) {
      if (!enabled) return { owned: true, fence: 0, local: true };
      const r = await own.acquire(roomId, id, ttlMs);
      if (r.owned) {
        held.set(roomId, r.fence);
        metrics.acquired++;
        if (r.renewed) metrics.renewed++;
      }
      return r;
    },
    async release(roomId) {
      const fence = held.get(roomId);
      held.delete(roomId);
      frozen.delete(roomId);
      if (!enabled) return true;               // local: nada a liberar no registro
      if (fence === undefined) return false;   // não detínhamos o lease
      try { const ok = await own.release(roomId, id, fence); if (ok) metrics.released++; return ok; }
      catch { return false; }
    },
    // Guarda de fence: mutação estrutural só passa com posse VÁLIDA (dono +
    // fence atuais). Rechega a janela de partição entre heartbeats.
    async guard(roomId) {
      if (!enabled) return { ok: true, local: true };
      if (frozen.has(roomId)) return { ok: false, reason: 'owner_lost' };
      const fence = held.get(roomId);
      if (fence === undefined) return { ok: false, reason: 'no_lease' };
      const ok = await own.verify(roomId, id, fence);
      if (!ok) {
        held.delete(roomId);
        frozen.add(roomId);
        metrics.fenceViolations++;
        return { ok: false, reason: 'fencing_violation' };
      }
      return { ok: true, fence };
    },
    async ownerOf(roomId) {
      if (!enabled) return null;
      const o = await own.ownerOf(roomId);
      if (!o || o.owner === id) return null;
      const addr = registry ? await registry.lookup(o.owner) : null;
      return { owner: o.owner, fence: o.fence, address: addr };
    },
    async redirectFor(roomId) {
      const o = await this.ownerOf(roomId);
      if (!o) return null;
      metrics.redirects++;
      return o.address ? { roomId, to: o.address, owner: o.owner } : null;
    },
    publish(roomId, type, payload) {
      if (!enabled || !rly) return null;
      metrics.publishes++;
      return rly.publish(roomId, type, payload);
    },
    isFrozen(roomId) { return frozen.has(roomId); },
    // M4 — índice de convites compartilhado (cross-replica join)
    publishInvite,
    lookupInvite,
    dropInvite,
    inviteTtlMs,
  };
}
