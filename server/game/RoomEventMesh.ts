import { randomUUID } from "node:crypto";
import { metrics } from "./metrics";

// ─── Room Event Mesh (Redis Event Mesh do RoomManager — auditoria Fase 0/2) ──
//
// O RoomManager detém o estado AUTORITATIVO das salas do SEU nó (os sockets
// WebSocket são locais e não podem ser possuídos por outro processo). O que
// faltava era o barramento: sem Redis, o registro de salas vivia só em Maps
// do processo — SPOF para descoberta multi-nó, join por convite e detecção
// de morte de nó.
//
// Este módulo é o Event Mesh: um índice de salas em HASH Redis
// (`<prefix>:rooms:index`), leases de vivacidade por sala
// (`<prefix>:room:<id>:alive`, sliding TTL) e eventos de controle no canal
// `realtime:control` (via DistributedState) para reação imediata entre nós.
//
// Contratos:
//  1. Nenhum nó nunca escreve o registro de sala de OUTRO nó — só o dono
//     (lease) espelha/atualiza. Corrupção por escrita concorrente é
//     estruturalmente impossível.
//  2. Morte de nó: o reconcile varre o índice, e registros cujo lease
//     expirou são removidos + anunciados (room_lost) — o lobby fantasma
//     some do discovery em ≤ leaseTtl + heartbeat.
//  3. Degradação graciosa: sem REDIS_URL o mesh opera com um barramento
//     local em-processo (mesma semântica de hash/lease) — comportamento
//     idêntico ao single-node de hoje; o cache remoto simplesmente fica
//     vazio em produção single-node.
//  4. Nenhuma falha do mesh PROPAGA: o RoomManager chama fire-and-forget;
//     erros são contidos e logados, o jogo segue local.

export type RoomMeshRecord = {
  id: string;
  worldId: string;
  status: string;
  playerCount: number;
  maxPlayers: number;
  isPrivate: boolean;
  inviteCode: string | null;
  hostId: string | null;
  nodeId: string;
  createdAt: number;
  updatedAt: number;
};

/**
 * Convite de lobby privado LIGADO a jogador (roadmap M1): o código da sala
 * sozinho NÃO autoriza entrada — o dono emite um convite por jogador-alvo e
 * somente esse userId pode consumi-lo (uso único, TTL, revogável).
 *
 * Escrita APENAS pelo nó dono da sala (mesma invariantes do índice de
 * salas); leitura por qualquer nó (pré-verificação na origem do túnel).
 */
export type RoomInviteRecord = {
  code: string;
  roomId: string;
  worldId: string;
  nodeId: string;
  invitedUserId: string;
  issuedBy: string;
  createdAt: number;
  expiresAt: number;
  status: "pending" | "used" | "revoked";
  usedAt: number | null;
};

export type MeshMirrorOutcome = "mirrored" | "unchanged" | "throttled";

export type RoomLostHandler = (
  record: RoomMeshRecord,
  reason: "lease_expired" | "stale_self" | "fenced",
) => void;

/**
 * M3 — Fencing token de ownership de sala (epoch monotônico por sala).
 *  - `renewed`: o lease era deste nó e foi renovado — epoch inalterado.
 *  - `acquired`: o lease estava morto/era de outro nó e ESTE nó assumiu com um
 *    epoch NOVO. Um epoch gap (> 1) entre aquisições do MESMO nó prova que
 *    OUTRO nó deteve a sala no intervalo → o estado local pode divergir.
 */
export type LeaseRenewal = { outcome: "renewed" | "acquired"; epoch: number };

const HEARTBEAT_INTERVAL_MS = 10_000;
const LEASE_TTL_MS = 30_000;
const MIRROR_THROTTLE_MS = 1_500;

// M3 — fencing: lease + epoch em UMA operação atômica no Redis.
// KEYS[1] = lease, KEYS[2] = contador de epoch da sala.
// ARGV[1] = nodeId, ARGV[2] = TTL ms.
// Retorno: [status, epoch] — 1 = renovado (mesmo epoch), 2 = (re)adquirido
// (epoch INCR). Qualquer troca de mãos incrementa o epoch: um nó que volta
// de partição e reassume vê epoch gap e é cercado (fenced) pelo mesh.
const RENEW_LEASE_SCRIPT = `
local cur = redis.call('GET', KEYS[1])
if cur then
  local sep = string.find(cur, '|', 1, true)
  if sep then
    local holder = string.sub(cur, 1, sep - 1)
    if holder == ARGV[1] then
      redis.call('PEXPIRE', KEYS[1], tonumber(ARGV[2]))
      return {1, tonumber(string.sub(cur, sep + 1))}
    end
  end
end
local epoch = redis.call('INCR', KEYS[2])
redis.call('SET', KEYS[1], ARGV[1] .. '|' .. epoch, 'PX', tonumber(ARGV[2]))
return {2, epoch}
`;

// ─── Storage abstraction ─────────────────────────────────────────────────────
// Hash index (roomId → JSON) + lease por sala. Duas implementações com a
// MESMA semântica: Redis (produção multi-nó) e barramento local em-processo
// (fallback single-node + determinismo em testes).

interface MeshStore {
  putRecord(record: RoomMeshRecord): Promise<void>;
  removeRecord(roomId: string): Promise<void>;
  getRecord(roomId: string): Promise<RoomMeshRecord | null>;
  listRecords(): Promise<RoomMeshRecord[]>;
  /** M3: sliding-TTL lease ATÔMICO com epoch de fencing por sala. */
  touchLease(roomId: string, nodeId: string, ttlMs: number): Promise<LeaseRenewal>;
  leaseAlive(roomId: string): Promise<boolean>;
  removeIfLeaseMissing(roomId: string): Promise<boolean>;
  /** Convites ligados a jogador: HASH por código (campo = invitedUserId). */
  putInvite(record: RoomInviteRecord, ttlMs: number): Promise<void>;
  getInvite(code: string, invitedUserId: string): Promise<RoomInviteRecord | null>;
  consumeInvite(code: string, invitedUserId: string): Promise<RoomInviteRecord | null>;
  revokeInvite(code: string, invitedUserId: string): Promise<void>;
  listInvites(code: string): Promise<RoomInviteRecord[]>;
  purgeInvites(code: string): Promise<void>;
}

// Barramento local compartilhado entre instâncias do MESMO processo — simula
// a semântica do Redis com um Map global (fallback single-node + testes que
// simulam dois nós sem Redis externo).
const localBus: {
  records: Map<string, RoomMeshRecord>;
  leases: Map<string, { nodeId: string; expiresAt: number }>;
  invites: Map<string, Map<string, RoomInviteRecord>>;
  /** M3: epoch de fencing por sala (mesma semântica do INCR Redis). */
  fences: Map<string, number>;
} = {
  records: new Map(),
  leases: new Map(),
  invites: new Map(),
  fences: new Map(),
};

function inviteExpired(record: RoomInviteRecord, now = Date.now()): boolean {
  return record.expiresAt <= now;
}

// Exportadas para testes de contrato (mesma semântica nos dois backends) e
// reuso operacional — a seleção segue sendo por `store` (Redis vivo → Redis).
export class LocalMeshStore implements MeshStore {
  async putRecord(record: RoomMeshRecord): Promise<void> {
    localBus.records.set(record.id, { ...record });
  }
  async removeRecord(roomId: string): Promise<void> {
    localBus.records.delete(roomId);
    localBus.leases.delete(roomId);
  }
  async getRecord(roomId: string): Promise<RoomMeshRecord | null> {
    const record = localBus.records.get(roomId);
    return record ? { ...record } : null;
  }
  async listRecords(): Promise<RoomMeshRecord[]> {
    return [...localBus.records.values()].map((record) => ({ ...record }));
  }
  async touchLease(roomId: string, nodeId: string, ttlMs: number): Promise<LeaseRenewal> {
    const now = Date.now();
    const lease = localBus.leases.get(roomId);
    if (lease && lease.nodeId === nodeId && lease.expiresAt > now) {
      lease.expiresAt = now + ttlMs;
      const epoch = localBus.fences.get(roomId) ?? 1;
      localBus.fences.set(roomId, epoch);
      return { outcome: "renewed", epoch };
    }
    // (re)aquisição: epoch monotônico — TODO cambio de mãos incrementa.
    const epoch = (localBus.fences.get(roomId) ?? 0) + 1;
    localBus.fences.set(roomId, epoch);
    localBus.leases.set(roomId, { nodeId, expiresAt: now + ttlMs });
    return { outcome: "acquired", epoch };
  }
  async leaseAlive(roomId: string): Promise<boolean> {
    const lease = localBus.leases.get(roomId);
    return Boolean(lease && lease.expiresAt > Date.now());
  }
  async removeIfLeaseMissing(roomId: string): Promise<boolean> {
    const lease = localBus.leases.get(roomId);
    if (lease && lease.expiresAt > Date.now()) return false;
    localBus.records.delete(roomId);
    localBus.leases.delete(roomId);
    return true;
  }
  async putInvite(record: RoomInviteRecord, _ttlMs: number): Promise<void> {
    const byUser = localBus.invites.get(record.code) ?? new Map<string, RoomInviteRecord>();
    byUser.set(record.invitedUserId, { ...record });
    localBus.invites.set(record.code, byUser);
  }
  async getInvite(code: string, invitedUserId: string): Promise<RoomInviteRecord | null> {
    const record = localBus.invites.get(code)?.get(invitedUserId);
    if (!record || inviteExpired(record)) return null;
    return { ...record };
  }
  async consumeInvite(code: string, invitedUserId: string): Promise<RoomInviteRecord | null> {
    const record = localBus.invites.get(code)?.get(invitedUserId);
    if (!record || record.status !== "pending" || inviteExpired(record)) return null;
    record.status = "used";
    record.usedAt = Date.now();
    return { ...record };
  }
  async revokeInvite(code: string, invitedUserId: string): Promise<void> {
    localBus.invites.get(code)?.delete(invitedUserId);
  }
  async listInvites(code: string): Promise<RoomInviteRecord[]> {
    const byUser = localBus.invites.get(code);
    if (!byUser) return [];
    return [...byUser.values()].filter((record) => !inviteExpired(record)).map((record) => ({ ...record }));
  }
  async purgeInvites(code: string): Promise<void> {
    localBus.invites.delete(code);
  }
}

export class RedisMeshStore implements MeshStore {
  constructor(
    /** Público para o mesh detectar rotação de conexão por identidade. */
    readonly client: {
      hSet: (key: string, field: string, value: string) => Promise<unknown>;
      hDel: (key: string, field: string) => Promise<unknown>;
      hGet: (key: string, field: string) => Promise<string | null | undefined>;
      hVals: (key: string) => Promise<string[]>;
      set: (key: string, value: string, options: { PX: number }) => Promise<unknown>;
      exists: (key: string) => Promise<number>;
      /** Opcional: EVAL Lua (touchLease atômico); ausente → fallback best-effort. */
      eval?: (script: string, options: { keys: string[]; arguments: string[] }) => Promise<unknown>;
    },
    private readonly prefix: string,
  ) {}
  private indexKey(): string {
    return `${this.prefix}:rooms:index`;
  }
  private leaseKey(roomId: string): string {
    return `${this.prefix}:room:${roomId}:alive`;
  }
  private fenceKey(roomId: string): string {
    return `${this.prefix}:room:${roomId}:fence`;
  }
  async putRecord(record: RoomMeshRecord): Promise<void> {
    await this.client.hSet(this.indexKey(), record.id, JSON.stringify(record));
  }
  async removeRecord(roomId: string): Promise<void> {
    await this.client.hDel(this.indexKey(), roomId);
  }
  async getRecord(roomId: string): Promise<RoomMeshRecord | null> {
    const raw = await this.client.hGet(this.indexKey(), roomId);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as RoomMeshRecord;
    } catch {
      return null;
    }
  }
  async listRecords(): Promise<RoomMeshRecord[]> {
    const values = await this.client.hVals(this.indexKey());
    return values.flatMap((raw) => {
      try {
        const record = JSON.parse(raw) as RoomMeshRecord;
        return record?.id && record?.nodeId ? [record] : [];
      } catch {
        return [];
      }
    });
  }
  async touchLease(roomId: string, nodeId: string, ttlMs: number): Promise<LeaseRenewal> {
    // M3 — lease + epoch ATÔMICOS (Lua): renovation sem troca de mãos mantém
    // o epoch; qualquer outra escrita/assunção INCR o fence. Sem eval no
    // cliente (surface de compatibilidade), fallback best-effort legado com
    // outcome "renewed"/epoch 0 — o fence check ignora epoch 0.
    if (typeof this.client.eval !== "function") {
      await this.client.set(this.leaseKey(roomId), nodeId, { PX: ttlMs });
      return { outcome: "renewed", epoch: 0 };
    }
    const result = await this.client.eval(RENEW_LEASE_SCRIPT, {
      keys: [this.leaseKey(roomId), this.fenceKey(roomId)],
      arguments: [nodeId, String(ttlMs)],
    }) as number[];
    const status = Number(result?.[0] ?? 0);
    const epoch = Number(result?.[1] ?? 0);
    return status === 1 ? { outcome: "renewed", epoch } : { outcome: "acquired", epoch };
  }
  async leaseAlive(roomId: string): Promise<boolean> {
    return (await this.client.exists(this.leaseKey(roomId))) === 1;
  }
  async removeIfLeaseMissing(roomId: string): Promise<boolean> {
    if (typeof this.client.eval !== "function") {
      if (await this.leaseAlive(roomId)) return false;
      return (await this.client.hDel(this.indexKey(), roomId)) === 1;
    }
    const result = await this.client.eval(`
      if redis.call('EXISTS', KEYS[1]) == 0 then
        return redis.call('HDEL', KEYS[2], ARGV[1])
      end
      return 0
    `, { keys: [this.leaseKey(roomId), this.indexKey()], arguments: [roomId] });
    return Number(result) === 1;
  }
  private inviteKey(code: string): string {
    return `${this.prefix}:invite:${code}`;
  }
  async putInvite(record: RoomInviteRecord, ttlMs: number): Promise<void> {
    await this.client.hSet(this.inviteKey(record.code), record.invitedUserId, JSON.stringify(record));
    // PISO de TTL no CHAVE inteira: nenhum convite sobrevive ao seu expiresAt
    // + folga (expiração LÓGICA é pelo campo expiresAt; TTL limita memória).
    await this.client.set(`${this.inviteKey(record.code)}:ttl`, "1", { PX: Math.max(ttlMs, 1_000) });
  }
  async getInvite(code: string, invitedUserId: string): Promise<RoomInviteRecord | null> {
    const raw = await this.client.hGet(this.inviteKey(code), invitedUserId);
    if (!raw) return null;
    try {
      const record = JSON.parse(raw) as RoomInviteRecord;
      return inviteExpired(record) ? null : record;
    } catch {
      return null;
    }
  }
  async consumeInvite(code: string, invitedUserId: string): Promise<RoomInviteRecord | null> {
    const record = await this.getInvite(code, invitedUserId);
    if (!record || record.status !== "pending") return null;
    record.status = "used";
    record.usedAt = Date.now();
    await this.client.hSet(this.inviteKey(code), invitedUserId, JSON.stringify(record));
    return record;
  }
  async revokeInvite(code: string, invitedUserId: string): Promise<void> {
    await this.client.hDel(this.inviteKey(code), invitedUserId);
  }
  async listInvites(code: string): Promise<RoomInviteRecord[]> {
    const values = await this.client.hVals(this.inviteKey(code));
    return values.flatMap((raw) => {
      try {
        const record = JSON.parse(raw) as RoomInviteRecord;
        return record && record.invitedUserId && !inviteExpired(record) ? [record] : [];
      } catch {
        return [];
      }
    });
  }
  async purgeInvites(code: string): Promise<void> {
    const records = await this.listInvites(code);
    for (const record of records) {
      await this.client.hDel(this.inviteKey(code), record.invitedUserId);
    }
  }
}

// ─── Mesh ────────────────────────────────────────────────────────────────────

export class RoomEventMesh {
  readonly nodeId: string;
  readonly enabled: boolean;
  private prefix: string;
  private redisClientProvider: () => ConstructorParameters<typeof RedisMeshStore>[0] | null;
  private redisStore: RedisMeshStore | null = null;
  private readonly localStore = new LocalMeshStore();
  private publishControl: (event: Record<string, unknown>) => Promise<void>;
  private heartbeatHandle: ReturnType<typeof setInterval> | null = null;
  private readonly fingerprints = new Map<string, { fingerprint: string; at: number }>();
  /** Cache de registros de OUTROS nós, mantido por reconcile/eventos. */
  private readonly remoteCache = new Map<string, RoomMeshRecord>();
  private readonly lostHandlers = new Set<RoomLostHandler>();
  /** M3 — último epoch de fencing conhecido para salas locais. */
  private readonly localEpochs = new Map<string, number>();

  constructor(options?: {
    nodeId?: string;
    enabled?: boolean;
    prefix?: string;
    /** Resolve o cliente Redis CONECTADO; null antes da conexão/indefinido. */
    redisClientProvider?: () => ConstructorParameters<typeof RedisMeshStore>[0] | null;
    publishControl?: (event: Record<string, unknown>) => Promise<void>;
  }) {
    this.nodeId = options?.nodeId ?? process.env.NODE_ID ?? `${process.pid}-${randomUUID()}`;
    this.enabled = options?.enabled ?? Boolean(process.env.REDIS_URL);
    this.prefix = options?.prefix ?? `${process.env.REDIS_NAMESPACE ?? "khaaos"}`;
    this.redisClientProvider = options?.redisClientProvider ?? (() => null);
    this.publishControl = options?.publishControl ?? (async () => undefined);
  }

  /** Loja efetiva: Redis quando conectado (conexão é lazy no boot), senão
   *  barramento local. A resolução é por chamada — se o Redis subir depois,
   *  o próximo ciclo de heartbeat/mirror já usa o índice distribuído. */
  private get store(): MeshStore {
    if (this.enabled) {
      const client = this.redisClientProvider();
      if (client) {
        if (!this.redisStore || this.redisStore.client !== client) {
          this.redisStore = new RedisMeshStore(client, this.prefix);
        }
        return this.redisStore;
      }
    }
    return this.localStore;
  }

  // ── Escrita (só o nó dono chama) ──────────────────────────────────────────

  /** Espelha/atualiza o registro da sala. Dedupe por fingerprint + throttle. */
  async mirrorRoom(record: RoomMeshRecord): Promise<MeshMirrorOutcome> {
    const fingerprint = JSON.stringify([
      record.status,
      record.playerCount,
      record.maxPlayers,
      record.isPrivate,
      record.hostId,
      record.inviteCode,
    ]);
    const previous = this.fingerprints.get(record.id);
    const now = Date.now();
    if (previous && previous.fingerprint === fingerprint && now - previous.at < MIRROR_THROTTLE_MS) {
      return "throttled";
    }
    const material: RoomMeshRecord = { ...record, nodeId: this.nodeId, updatedAt: now };
    await this.store.putRecord(material);
    const renewal = await this.store.touchLease(record.id, this.nodeId, LEASE_TTL_MS);
    this.localEpochs.set(record.id, renewal.epoch);
    this.fingerprints.set(record.id, { fingerprint, at: now });
    void this.publishControl({ type: "mesh:room_updated", roomId: record.id, status: record.status, playerCount: record.playerCount }).catch(() => undefined);
    return "mirrored";
  }

  /** Sala deixou de existir no nó dono: remove do índice e anuncia. */
  async markRoomClosed(roomId: string, reason: string): Promise<void> {
    this.fingerprints.delete(roomId);
    await this.store.removeRecord(roomId);
    void this.publishControl({ type: "mesh:room_closed", roomId, reason }).catch(() => undefined);
  }

  // ── Leitura (qualquer nó) ─────────────────────────────────────────────────

  async getRemoteRoom(roomId: string): Promise<RoomMeshRecord | null> {
    const record = await this.store.getRecord(roomId);
    return record && record.nodeId !== this.nodeId ? record : null;
  }

  async listRemoteRooms(): Promise<RoomMeshRecord[]> {
    const records = await this.store.listRecords();
    return records.filter((record) => record.nodeId !== this.nodeId);
  }

  async findRemoteByInviteCode(code: string): Promise<RoomMeshRecord | null> {
    const normalized = code.trim().toUpperCase();
    const records = await this.store.listRecords();
    return (
      records.find(
        (record) =>
          record.nodeId !== this.nodeId &&
          record.inviteCode === normalized &&
          (record.status === "LOBBY" || record.status === "COUNTDOWN"),
      ) ?? null
    );
  }

  // ── Convites ligados a jogador (roadmap M1) ───────────────────────────────
  // Escrita pelo nó dono (issue/consume/revoke/purge); leitura por qualquer
  // nó (pré-verificação do túnel cross-node). Falhas NUNCA propagam para o
  // fluxo do jogo: o RoomManager envolve com catch.

  /** Dono: registra/atualiza convite (re-convite refresca TTL e status). */
  async issueInvite(record: RoomInviteRecord, ttlMs: number): Promise<void> {
    await this.store.putInvite(record, ttlMs);
  }

  /** Qualquer nó: convite pendente e não expirado do usuário, ou null. */
  async getPendingInvite(code: string, invitedUserId: string): Promise<RoomInviteRecord | null> {
    const record = await this.store.getInvite(code, invitedUserId).catch(() => null);
    return record && record.status === "pending" ? record : null;
  }

  /** Dono: consumo único (pending → used); null se inexistente/usado/expirado. */
  async consumeInvite(code: string, invitedUserId: string): Promise<RoomInviteRecord | null> {
    return this.store.consumeInvite(code, invitedUserId).catch(() => null);
  }

  /** Dono: revoga convite pendente (ex.: kick do host). */
  async revokeInvite(code: string, invitedUserId: string): Promise<void> {
    await this.store.revokeInvite(code, invitedUserId).catch(() => undefined);
  }

  /** Dono: lista convites vivos do código (quota de pendentes por sala). */
  async listInvites(code: string): Promise<RoomInviteRecord[]> {
    return this.store.listInvites(code).catch(() => []);
  }

  /** Dono: sala fechada — remove todos os convites do código. */
  async purgeInvites(code: string): Promise<void> {
    await this.store.purgeInvites(code).catch(() => undefined);
  }

  // ── Cache síncrono (para listLobbies/getRoomSummary sync do RoomManager) ──

  async refreshRemoteCache(): Promise<RoomMeshRecord[]> {
    const records = await this.listRemoteRooms();
    this.remoteCache.clear();
    for (const record of records) this.remoteCache.set(record.id, record);
    return records;
  }

  listRemoteLobbiesSync(): RoomMeshRecord[] {
    return [...this.remoteCache.values()]
      .filter((record) => !record.isPrivate && (record.status === "LOBBY" || record.status === "COUNTDOWN"))
      .map((record) => ({ ...record }));
  }

  getCachedRoom(roomId: string): RoomMeshRecord | null {
    const record = this.remoteCache.get(roomId);
    return record ? { ...record } : null;
  }

  findCachedByInviteCode(code: string): RoomMeshRecord | null {
    const normalized = code.trim().toUpperCase();
    const record = [...this.remoteCache.values()].find(
      (entry) => entry.inviteCode === normalized && (entry.status === "LOBBY" || entry.status === "COUNTDOWN"),
    );
    return record ? { ...record } : null;
  }

  onRoomLost(handler: RoomLostHandler): void {
    this.lostHandlers.add(handler);
  }

  /** Reconcile: leases expirados (nó morto) e registros self órfãos. */
  async reconcile(localRooms: Set<string>): Promise<{ dropped: RoomMeshRecord[]; staleSelf: string[] }> {
    const records = await this.store.listRecords();
    const dropped: RoomMeshRecord[] = [];
    const staleSelf: string[] = [];
    for (const record of records) {
      if (record.nodeId === this.nodeId) {
        if (!localRooms.has(record.id)) {
          await this.store.removeRecord(record.id);
          this.fingerprints.delete(record.id);
          staleSelf.push(record.id);
        }
        continue;
      }
      const removed = await this.store.removeIfLeaseMissing(record.id);
      if (removed) {
        this.remoteCache.delete(record.id);
        dropped.push(record);
        for (const handler of this.lostHandlers) {
          try {
            handler(record, "lease_expired");
          } catch {
            // handler do consumidor nunca derruba o reconcile
          }
        }
        void this.publishControl({ type: "mesh:room_lost", roomId: record.id, ownerNode: record.nodeId }).catch(() => undefined);
      } else {
        this.remoteCache.set(record.id, record);
      }
    }
    return { dropped, staleSelf };
  }

  // ── Ciclo de vida ─────────────────────────────────────────────────────────

  startHeartbeat(localRoomsProvider: () => Set<string>): void {
    if (this.heartbeatHandle) return;
    this.heartbeatHandle = setInterval(() => {
      void this.renewLeasesAndFence(localRoomsProvider()).catch((error) => {
        console.warn("[RoomEventMesh] heartbeat ciclo falhou", {
          message: error instanceof Error ? error.message : String(error),
        });
      });
    }, HEARTBEAT_INTERVAL_MS);
    this.heartbeatHandle.unref?.();
  }

  /**
   * M3 — renova os leases das salas locais com epoch de fencing e aplica a
   * decisão de fence: epoch gap > 1 entre aquisições do MESMO nó prova que
   * outro nó deteve a sala no intervalo → dispara os handlers "fenced".
   * Pública para o heartbeat e para verificação determinística em testes.
   */
  async renewLeasesAndFence(localRooms: Set<string>): Promise<{ fenced: string[] }> {
    const fenced: string[] = [];
    for (const roomId of localRooms) {
      const renewal = await this.store.touchLease(roomId, this.nodeId, LEASE_TTL_MS);
      if (renewal.epoch > 0) {
        metrics.counter("khaaos_room_leases_total", { outcome: renewal.outcome });
      }
      const previous = this.localEpochs.get(roomId);
      this.localEpochs.set(roomId, renewal.epoch);
      if (
        renewal.outcome === "acquired" &&
        renewal.epoch > 0 &&
        previous !== undefined &&
        previous > 0 &&
        renewal.epoch - previous > 1
      ) {
        // M3 — FENCED: nosso lease expirou e OUTRO nó deteve a sala no
        // intervalo (epoch gap > 1). O estado local pode divergir do que os
        // jogadores viram lá — drena a autoridade e força reancoragem (mesma
        // UX da morte do nó dono, com razão auditável).
        metrics.counter("khaaos_room_fenced_total");
        const record = await this.store.getRecord(roomId);
        if (record) {
          fenced.push(roomId);
          for (const handler of this.lostHandlers) {
            try {
              handler(record, "fenced");
            } catch {
              // handler do consumidor nunca derruba o heartbeat
            }
          }
          void this.publishControl({ type: "mesh:room_fenced", roomId, ownerNode: this.nodeId, epoch: renewal.epoch }).catch(() => undefined);
        }
      }
    }
    await this.reconcile(localRooms);
    return { fenced };
  }

  stopHeartbeat(): void {
    if (this.heartbeatHandle) {
      clearInterval(this.heartbeatHandle);
      this.heartbeatHandle = null;
    }
  }

  async close(): Promise<void> {
    this.stopHeartbeat();
    this.lostHandlers.clear();
    this.remoteCache.clear();
  }
}

/** Somente testes: expira o lease de uma sala no barramento LOCAL
 *  (simula a morte do nó dono sem Redis externo). */
export function __expireLocalLeaseForTests(roomId: string): boolean {
  const lease = localBus.leases.get(roomId);
  if (!lease) return false;
  lease.expiresAt = Date.now() - 1;
  return true;
}
