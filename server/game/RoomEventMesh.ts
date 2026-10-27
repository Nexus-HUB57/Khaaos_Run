import { randomUUID } from "node:crypto";

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

export type MeshMirrorOutcome = "mirrored" | "unchanged" | "throttled";

export type RoomLostHandler = (record: RoomMeshRecord, reason: "lease_expired" | "stale_self") => void;

const HEARTBEAT_INTERVAL_MS = 10_000;
const LEASE_TTL_MS = 30_000;
const MIRROR_THROTTLE_MS = 1_500;

// ─── Storage abstraction ─────────────────────────────────────────────────────
// Hash index (roomId → JSON) + lease por sala. Duas implementações com a
// MESMA semântica: Redis (produção multi-nó) e barramento local em-processo
// (fallback single-node + determinismo em testes).

interface MeshStore {
  putRecord(record: RoomMeshRecord): Promise<void>;
  removeRecord(roomId: string): Promise<void>;
  getRecord(roomId: string): Promise<RoomMeshRecord | null>;
  listRecords(): Promise<RoomMeshRecord[]>;
  /** Sliding-TTL lease da sala; true se o lease estava/está vivo. */
  touchLease(roomId: string, nodeId: string, ttlMs: number): Promise<void>;
  leaseAlive(roomId: string): Promise<boolean>;
}

// Barramento local compartilhado entre instâncias do MESMO processo — simula
// a semântica do Redis com um Map global (fallback single-node + testes que
// simulam dois nós sem Redis externo).
const localBus: { records: Map<string, RoomMeshRecord>; leases: Map<string, { nodeId: string; expiresAt: number }> } = {
  records: new Map(),
  leases: new Map(),
};

class LocalMeshStore implements MeshStore {
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
  async touchLease(roomId: string, nodeId: string, ttlMs: number): Promise<void> {
    localBus.leases.set(roomId, { nodeId, expiresAt: Date.now() + ttlMs });
  }
  async leaseAlive(roomId: string): Promise<boolean> {
    const lease = localBus.leases.get(roomId);
    return Boolean(lease && lease.expiresAt > Date.now());
  }
}

class RedisMeshStore implements MeshStore {
  constructor(
    /** Público para o mesh detectar rotação de conexão por identidade. */
    readonly client: {
      hSet: (key: string, field: string, value: string) => Promise<unknown>;
      hDel: (key: string, field: string) => Promise<unknown>;
      hGet: (key: string, field: string) => Promise<string | null | undefined>;
      hVals: (key: string) => Promise<string[]>;
      set: (key: string, value: string, options: { PX: number }) => Promise<unknown>;
      exists: (key: string) => Promise<number>;
    },
    private readonly prefix: string,
  ) {}
  private indexKey(): string {
    return `${this.prefix}:rooms:index`;
  }
  private leaseKey(roomId: string): string {
    return `${this.prefix}:room:${roomId}:alive`;
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
  async touchLease(roomId: string, nodeId: string, ttlMs: number): Promise<void> {
    await this.client.set(this.leaseKey(roomId), nodeId, { PX: ttlMs });
  }
  async leaseAlive(roomId: string): Promise<boolean> {
    return (await this.client.exists(this.leaseKey(roomId))) === 1;
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
    await this.store.touchLease(record.id, this.nodeId, LEASE_TTL_MS);
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
      const alive = await this.store.leaseAlive(record.id);
      if (!alive) {
        await this.store.removeRecord(record.id);
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
      void (async () => {
        try {
          const localRooms = localRoomsProvider();
          // Renova leases das salas locais (sliding).
          for (const roomId of localRooms) {
            await this.store.touchLease(roomId, this.nodeId, LEASE_TTL_MS);
          }
          await this.reconcile(localRooms);
        } catch (error) {
          console.warn("[RoomEventMesh] heartbeat ciclo falhou", {
            message: error instanceof Error ? error.message : String(error),
          });
        }
      })();
    }, HEARTBEAT_INTERVAL_MS);
    this.heartbeatHandle.unref?.();
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
