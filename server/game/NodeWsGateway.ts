import { randomUUID } from "node:crypto";

// ─── Node WS Gateway (proxy cross-node — auditoria Fase 0/2) ─────────────────
//
// O RoomEventMesh eliminou o SPOF de DESCOBERTA multi-nó: um join_code que
// aponta para outro nó recebe o erro ROOM_REMOTE_NODE e o cliente precisa
// reconectar no endpoint do nó dono. Isso funciona, mas impõe friction de UX
// (reconnect) e quebra quando o cliente não consegue alcançar o endpoint
// diretamente.
//
// O gateway fecha esse gap: o socket WebSocket permanece no nó de ORIGEM e as
// mensagens do cliente são ROTEADAS por nodeId até o nó dono da sala, que as
// aplica por uma conexão virtual (RelaySocket). As ServerMessages do nó dono
// voltam pelo mesmo túnel e são entregues ao socket local. Para o
// RoomManager do nó dono, a sessão relayada é indistinguível de um socket
// local (readyState/send/close).
//
// Contratos:
//  1. Estado autoritativo da sala permanece NO NÓ DONO (dono do lease no
//     mesh). O túnel é transport-only: nenhuma mutação de sala acontece no
//     nó de origem.
//  2. Operações de âncora de sala (join/queue/create_lobby/join_code) de um
//     usuário RELAYADO encerram o túnel e são processadas LOCALMENTE — o
//     jogador troca de sala/âncora sem túnel fantasma.
//  3. Morte do nó dono (lease do registro de nós expirado) derruba os túneis
//     com erro ROOM_NODE_LOST — o cliente reentra normalmente ( mesma UX de
//     queda de servidor dedicado).
//  4. Degradação graciosa: sem Redis o gateway opera em barramento local
//     (mesmo processo, útil para testes multi-nó simulados) ou fica
//     desabilitado — nesse caso o comportamento legado (ROOM_REMOTE_NODE)
//     permanece intacto.
//  5. Falha do túnel NUNCA propaga: publish é fire-and-forget com warn.

const ENVELOPE_VERSION = 1;
const MAX_ENVELOPE_BYTES = 32 * 1024; // parity com maxPayload do WS (16KB de payload + envelope)
const NODE_LEASE_TTL_MS = 15_000;
const NODE_HEARTBEAT_MS = 5_000;

export type RelayEnvelope =
  | { v: number; k: "c2s"; s: string; fn: string; u: string; d: string; m: unknown; ra?: 1 }
  | { v: number; k: "s2c"; s: string; m: string }
  | { v: number; k: "cls"; s: string; c?: number; r?: string }
  | { v: number; k: "drop"; s: string; r: string };

export function isRelayEnvelope(value: unknown): value is RelayEnvelope {
  if (!value || typeof value !== "object") return false;
  const envelope = value as Record<string, unknown>;
  if (envelope.v !== ENVELOPE_VERSION) return false;
  if (typeof envelope.s !== "string" || envelope.s.length === 0 || envelope.s.length > 128) return false;
  switch (envelope.k) {
    case "c2s":
      return typeof envelope.fn === "string" && typeof envelope.u === "string" &&
        typeof envelope.d === "string" && envelope.m != null;
    case "s2c":
      return typeof envelope.m === "string";
    case "cls":
      return true;
    case "drop":
      return typeof envelope.r === "string";
    default:
      return false;
  }
}

// ─── Transport (pub/sub por canal de nó) ─────────────────────────────────────

export interface RelayTransport {
  /** Publica no canal do nó alvo. true = havia consumidor/entrega publicada. */
  publish(targetNodeId: string, envelope: RelayEnvelope): Promise<boolean>;
  /** Assina o canal DESTE nó. */
  start(onEnvelope: (envelope: RelayEnvelope) => void): Promise<void>;
  stop(): Promise<void>;
}

/** Redis: canal dedicado `<ns>:relay:<nodeId>` por nó (produção multi-nó). */
export class RedisRelayTransport implements RelayTransport {
  private subscriber: { subscribe?: unknown } | null = null;
  private startRequested = false;
  constructor(
    private readonly clientProvider: () => {
      publish: (channel: string, message: string) => Promise<unknown>;
      duplicate: () => {
        connect: () => Promise<unknown>;
        subscribe: (channel: string, handler: (raw: string) => void) => Promise<unknown>;
        close: () => Promise<unknown>;
        quit: () => Promise<unknown>;
      };
    } | null,
    private readonly selfNodeId: string,
    private readonly prefix: string,
  ) {}
  private channel(nodeId: string): string {
    return `${this.prefix}:relay:${nodeId}`;
  }
  async publish(targetNodeId: string, envelope: RelayEnvelope): Promise<boolean> {
    const client = this.clientProvider();
    if (!client) return false;
    const receivers = Number(await client.publish(this.channel(targetNodeId), JSON.stringify(envelope)));
    if (process.env.SMOKE_DEBUG) {
      console.log("[RedisRelayTransport] publish", { target: targetNodeId, channel: this.channel(targetNodeId), receivers });
    }
    return receivers > 0;
  }
  async start(onEnvelope: (envelope: RelayEnvelope) => void): Promise<void> {
    const client = this.clientProvider();
    if (!client || this.subscriber || this.startRequested) return;
    // Marca ANTES do await: resolve() do lazy dispara este start em paralelo
    // com o start() aguardado pelo gateway — sem a marca, os dois correm e
    // o canal fica com DUAS inscrições (publish conta 2 receivers, envelopes
    // entregues em duplicidade).
    this.startRequested = true;
    const subscriber = client.duplicate();
    await subscriber.connect();
    await subscriber.subscribe(this.channel(this.selfNodeId), (raw) => {
      try {
        const envelope = JSON.parse(raw) as RelayEnvelope;
        if (isRelayEnvelope(envelope)) onEnvelope(envelope);
      } catch {
        // envelope malformado nunca afeta o jogo
      }
    });
    this.subscriber = subscriber;
  }
  async stop(): Promise<void> {
    if (!this.subscriber) return;
    const subscriber = this.subscriber as unknown as { quit: () => Promise<unknown>; close: () => Promise<unknown> };
    await (subscriber.quit ? subscriber.quit() : subscriber.close()).catch(() => undefined);
    this.subscriber = null;
  }
}

/** Barramento local compartilhado entre gateways do MESMO processo —
 *  fallback single-node e testes que simulam dois nós sem Redis. */
const localRelayBus = new Map<string, Set<(envelope: RelayEnvelope) => void>>();

export class LocalRelayTransport implements RelayTransport {
  private handler: ((envelope: RelayEnvelope) => void) | null = null;
  constructor(private readonly selfNodeId: string) {}
  async publish(targetNodeId: string, envelope: RelayEnvelope): Promise<boolean> {
    const handlers = localRelayBus.get(targetNodeId);
    if (!handlers || handlers.size === 0) return false;
    for (const handler of [...handlers]) {
      try {
        handler(envelope);
      } catch {
        // handler do consumidor nunca derruba o barramento
      }
    }
    return true;
  }
  async start(onEnvelope: (envelope: RelayEnvelope) => void): Promise<void> {
    this.handler = onEnvelope;
    let handlers = localRelayBus.get(this.selfNodeId);
    if (!handlers) {
      handlers = new Set();
      localRelayBus.set(this.selfNodeId, handlers);
    }
    handlers.add(onEnvelope);
  }
  async stop(): Promise<void> {
    if (!this.handler) return;
    localRelayBus.get(this.selfNodeId)?.delete(this.handler);
    this.handler = null;
  }
}

/** Somente testes: limpa o barramento local do transporte relay. */
export function __resetLocalRelayBusForTests(): void {
  localRelayBus.clear();
}

// ─── Node Registry (descoberta + vivacidade de nós) ─────────────────────────

export type NodeRegistryEntry = { nodeId: string; endpoint: string | null; at: number };

interface NodeRegistryStore {
  put(entry: NodeRegistryEntry): Promise<void>;
  remove(nodeId: string): Promise<void>;
  list(): Promise<NodeRegistryEntry[]>;
  touchLease(nodeId: string, ttlMs: number): Promise<void>;
  leaseAlive(nodeId: string): Promise<boolean>;
}

const localNodeBus = { records: new Map<string, NodeRegistryEntry>(), leases: new Map<string, number>() };

export class LocalNodeRegistryStore implements NodeRegistryStore {
  async put(entry: NodeRegistryEntry): Promise<void> {
    localNodeBus.records.set(entry.nodeId, { ...entry });
  }
  async remove(nodeId: string): Promise<void> {
    localNodeBus.records.delete(nodeId);
    localNodeBus.leases.delete(nodeId);
  }
  async list(): Promise<NodeRegistryEntry[]> {
    return [...localNodeBus.records.values()].map((entry) => ({ ...entry }));
  }
  async touchLease(nodeId: string, ttlMs: number): Promise<void> {
    localNodeBus.leases.set(nodeId, Date.now() + ttlMs);
  }
  async leaseAlive(nodeId: string): Promise<boolean> {
    const expiresAt = localNodeBus.leases.get(nodeId) ?? 0;
    return expiresAt > Date.now();
  }
}

interface RedisLikeMinimal {
  hSet: (key: string, field: string, value: string) => Promise<unknown>;
  hDel: (key: string, field: string) => Promise<unknown>;
  hVals: (key: string) => Promise<string[]>;
  set: (key: string, value: string, options: { PX: number }) => Promise<unknown>;
  exists: (key: string) => Promise<number>;
}

class RedisNodeRegistryStore implements NodeRegistryStore {
  constructor(private readonly client: RedisLikeMinimal, private readonly prefix: string) {}
  private indexKey(): string {
    return `${this.prefix}:nodes:index`;
  }
  private leaseKey(nodeId: string): string {
    return `${this.prefix}:node:${nodeId}:alive`;
  }
  async put(entry: NodeRegistryEntry): Promise<void> {
    await this.client.hSet(this.indexKey(), entry.nodeId, JSON.stringify(entry));
  }
  async remove(nodeId: string): Promise<void> {
    await this.client.hDel(this.indexKey(), nodeId);
  }
  async list(): Promise<NodeRegistryEntry[]> {
    const values = await this.client.hVals(this.indexKey());
    return values.flatMap((raw) => {
      try {
        const entry = JSON.parse(raw) as NodeRegistryEntry;
        return entry?.nodeId ? [entry] : [];
      } catch {
        return [];
      }
    });
  }
  async touchLease(nodeId: string, ttlMs: number): Promise<void> {
    await this.client.set(this.leaseKey(nodeId), "1", { PX: ttlMs });
  }
  async leaseAlive(nodeId: string): Promise<boolean> {
    return (await this.client.exists(this.leaseKey(nodeId))) === 1;
  }
}

/** Somente testes: expira o lease de um nó no barramento LOCAL. */
export function __expireLocalNodeLeaseForTests(nodeId: string): boolean {
  if (!localNodeBus.leases.has(nodeId)) return false;
  localNodeBus.leases.set(nodeId, Date.now() - 1);
  return true;
}

// ─── RelaySocket (conexão virtual no nó dono) ────────────────────────────────

/**
 * Duck-type da superfície de WebSocket usada pelo RoomManager no papel de
 * socket armazenado (readyState/send/close). O nó dono enxerga a sessão
 * relayada exatamente como um socket local:
 *  - send(raw)  → envelope s2c com a string PRONTA (origem faz ws.send sem re-parse)
 *  - close(...) → envelope drop + teardown local da sessão
 * O cast para WebSocket acontece UMA vez, na fronteira do RoomManager.
 */
export class RelaySocket {
  /** 1 = OPEN (ws.OPEN), 3 = CLOSED (ws.CLOSED). */
  readyState = 1;
  constructor(
    private readonly gateway: NodeWsGateway,
    readonly session: string,
    readonly userId: string,
    readonly originNode: string,
  ) {}
  send(raw: string): void {
    if (this.readyState !== 1) return;
    void this.gateway.deliverToOrigin(this, raw);
  }
  close(code?: number, reason?: string): void {
    if (this.readyState !== 1) return;
    this.readyState = 3;
    void this.gateway.publishFromHost(this.originNode, {
      v: ENVELOPE_VERSION, k: "drop", s: this.session,
      r: reason ? `${code ?? 1000}:${reason}`.slice(0, 256) : String(code ?? 1000),
    } satisfies RelayEnvelope).catch(() => undefined);
    this.gateway.endHostSession(this.session, "socket_closed");
  }
}

// ─── Gateway ─────────────────────────────────────────────────────────────────

type OriginSession = {
  session: string;
  userId: string;
  targetNode: string;
  roomId: string;
  ws: { readyState: number; send: (raw: string) => void; close: (code?: number, reason?: string) => void };
};

type HostSession = {
  session: string;
  userId: string;
  originNode: string;
  roomId: string | null;
  socket: RelaySocket;
};

export type GatewaySessionCallbacks = {
  /** Nó dono: primeira mensagem de uma sessão — registre o RelaySocket. */
  onSessionStart?: (socket: RelaySocket) => void;
  /** Nó dono: mensagem do cliente relayado (após registro). relayAuthorized
   *  = true somente no join SINTÉTICO de um túnel aberto por join_code
   *  verificado na origem (a autorização vem do hop de relay, nunca do cliente). */
  onClientMessage?: (socket: RelaySocket, userId: string, displayName: string, msg: unknown, relayAuthorized: boolean) => void | Promise<void>;
  /** Nó dono: sessão encerrada (peer fechou / drop / limpeza). */
  onSessionEnd?: (socket: RelaySocket, reason: "peer_closed" | "socket_closed" | "node_lost") => void;
};

export class NodeWsGateway {
  readonly nodeId: string;
  readonly enabled: boolean;
  private prefix: string;
  private transport: RelayTransport;
  private registryStore: NodeRegistryStore;
  private heartbeatHandle: ReturnType<typeof setInterval> | null = null;
  private started = false;
  private endpoint: string | null;
  private readonly lostNodeHandlers = new Set<(nodeId: string) => void>();

  // Origem: sessões relayadas deste nó (userId → túnel).
  private readonly originByUser = new Map<string, OriginSession>();
  // Origem: índice por id de sessão (para s2c/cls/drop).
  private readonly originBySession = new Map<string, OriginSession>();
  // Nó dono: sessões que SERVO aqui.
  private readonly hostSessions = new Map<string, HostSession>();

  constructor(options?: {
    nodeId?: string;
    enabled?: boolean;
    prefix?: string;
    endpoint?: string | null;
    transport?: RelayTransport;
    registryStore?: NodeRegistryStore;
    redisClientProvider?: () => RedisLikeMinimal | null;
    callbacks?: GatewaySessionCallbacks;
  }) {
    this.nodeId = options?.nodeId ?? process.env.NODE_ID ?? `${process.pid}-${randomUUID()}`;
    this.enabled = options?.enabled ?? Boolean(process.env.REDIS_URL);
    this.prefix = options?.prefix ?? `${process.env.REDIS_NAMESPACE ?? "khaaos"}`;
    this.endpoint = options?.endpoint ?? process.env.NODE_PUBLIC_URL ?? null;
    this.transport = options?.transport ?? new LocalRelayTransport(this.nodeId);
    this.registryStore = options?.registryStore ?? new LocalNodeRegistryStore();
    if (!options?.transport || !options?.registryStore) {
      // Sem override explícito: resolver Redis lazy (conexão sobe depois do boot).
      const provider = options?.redisClientProvider ?? (() => null);
      const prefix = this.prefix;
      const nodeId = this.nodeId;
      // Wrapper: usa Redis quando conectado, barramento local caso contrário.
      // Factories retornam null sem cliente — o lazy re-resolve a cada uso
      // (padrão do mesh): Redis subindo depois do boot é adotado no próximo
      // ciclo, sem reinício do processo.
      this.transport = new LazyTransport(() => {
        const client = provider();
        return client ? new RedisRelayTransport(() => client as never, nodeId, prefix) : null;
      }, this.transport);
      this.registryStore = new LazyNodeRegistry(() => {
        const client = provider();
        return client ? new RedisNodeRegistryStore(client, prefix) : null;
      }, this.registryStore);
    }
    this.callbacks = options?.callbacks ?? {};
  }

  private callbacks: GatewaySessionCallbacks;

  // ── Ciclo de vida ─────────────────────────────────────────────────────────

  async start(): Promise<void> {
    if (this.started || !this.enabled) return;
    this.started = true;
    await this.transport.start((envelope) => this.handleEnvelope(envelope));
    await this.registerSelf();
    await this.heartbeat(); // populate knownNodes imediatamente (sem esperar 5s)
    this.heartbeatHandle = setInterval(() => {
      void this.heartbeat();
    }, NODE_HEARTBEAT_MS);
    this.heartbeatHandle.unref?.();
  }

  async stop(): Promise<void> {
    if (this.heartbeatHandle) {
      clearInterval(this.heartbeatHandle);
      this.heartbeatHandle = null;
    }
    this.started = false;
    await this.transport.stop().catch(() => undefined);
    if (this.enabled) {
      await this.registryStore.remove(this.nodeId).catch(() => undefined);
    }
  }

  private async registerSelf(): Promise<void> {
    try {
      await this.registryStore.put({ nodeId: this.nodeId, endpoint: this.endpoint, at: Date.now() });
      await this.registryStore.touchLease(this.nodeId, NODE_LEASE_TTL_MS);
    } catch {
      // registro é best-effort; relay cai no fallback legado sem registro
    }
  }

  private async heartbeat(): Promise<void> {
    try {
      await this.registerSelf();
      // Receptor: se Redis subiu depois do boot, inscreve o canal relay AGORA
      // (sem isso só o publicador adotaria o transporte Redis).
      await (this.transport as { refresh?: () => Promise<boolean> }).refresh?.();
      const nodes = await this.registryStore.list();
      const seen = new Set<string>();
      for (const node of nodes) {
        if (node.nodeId === this.nodeId) continue;
        let alive = false;
        try {
          alive = await this.registryStore.leaseAlive(node.nodeId);
        } catch (error) {
          if (process.env.SMOKE_DEBUG) {
            console.warn("[NodeWsGateway] leaseAlive falhou", {
              node: node.nodeId,
              message: error instanceof Error ? error.message : String(error),
            });
          }
          continue; // lease indeterminado NÃO remove o nó do índice
        }
        if (!alive) {
          await this.registryStore.remove(node.nodeId);
          this.knownNodes.delete(node.nodeId);
          // Túneis de origem apontando para o nó morto: informar o cliente.
          for (const relayed of [...this.originByUser.values()]) {
            if (relayed.targetNode === node.nodeId) this.failRelay(relayed.session, "node_lost");
          }
          for (const handler of this.lostNodeHandlers) {
            try {
              handler(node.nodeId);
            } catch {
              // handler do consumidor nunca derruba o heartbeat
            }
          }
        } else {
          seen.add(node.nodeId);
        }
      }
      this.knownNodes = seen;
      if (process.env.SMOKE_DEBUG) {
        console.log("[NodeWsGateway] heartbeat", {
          self: this.nodeId,
          listed: nodes.length,
          known: [...seen],
          started: this.started,
          enabled: this.enabled,
        });
      }
    } catch (error) {
      if (process.env.SMOKE_DEBUG) {
        console.warn("[NodeWsGateway] heartbeat falhou", {
          message: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack?.split("\n")[1] : undefined,
        });
      }
      // heartbeat é best-effort
    }
  }

  onNodeLost(handler: (nodeId: string) => void): void {
    this.lostNodeHandlers.add(handler);
  }

  // ── Origem: abrir/rotear/encerrar túneis ──────────────────────────────────

  private knownNodes = new Set<string>();

  /** O relay para este nó está disponível (registro fresco + não-self)? */
  relaySupported(targetNodeId: string): boolean {
    if (!this.enabled || !this.started) return false;
    if (targetNodeId === this.nodeId) return false;
    return this.knownNodes.has(targetNodeId);
  }

  /**
   * Decisão de relay SEM corrida de boot (F16/F17): o cache knownNodes só
   * popula no heartbeat (5 s), mas joins remotos chegam logo após o registro
   * do peer. Esta versão async faz uma leitura FRESCA do registro quando o
   * cache ainda não conhece o alvo — elimina o falso ROOM_REMOTE_NODE na
   * janela entre registro no Redis e primeiro heartbeat.
   */
  async ensureNodeKnown(targetNodeId: string): Promise<boolean> {
    if (!this.enabled || !this.started) return false;
    if (targetNodeId === this.nodeId) return false;
    if (this.knownNodes.has(targetNodeId)) return true;
    try {
      const nodes = await this.registryStore.list();
      const target = nodes.find((node) => node.nodeId === targetNodeId);
      if (!target) return false;
      const alive = await this.registryStore.leaseAlive(targetNodeId).catch(() => false);
      if (!alive) return false;
      this.knownNodes.add(targetNodeId);
      return true;
    } catch {
      return false;
    }
  }

  /** Endpoint público do nó alvo (para o fallback ROOM_REMOTE_NODE apontar
   *  o cliente para o dono REAL, não para este nó). */
  async remoteNodeEndpoint(targetNodeId: string): Promise<string | null> {
    if (!this.enabled) return null;
    try {
      const nodes = await this.registryStore.list();
      return nodes.find((node) => node.nodeId === targetNodeId)?.endpoint ?? null;
    } catch {
      return null;
    }
  }

  /** Abre túnel para a sala remota e envia o join sintético.
   *  inviteAuthorized: true APENAS quando a origem validou o código de
   *  convite (join_code) — nunca derivado de mensagem do cliente. */
  openRelay(
    userId: string,
    displayName: string,
    ws: { readyState: number; send: (raw: string) => void; close: (code?: number, reason?: string) => void },
    targetNodeId: string,
    roomId: string,
    worldId?: string,
    options?: { inviteAuthorized?: boolean },
  ): boolean {
    if (!this.relaySupported(targetNodeId)) return false;
    this.closeRelay(userId, "reanchored");
    const session = `rl_${randomUUID()}`;
    const relayed: OriginSession = { session, userId, targetNode: targetNodeId, roomId, ws };
    this.originByUser.set(userId, relayed);
    this.originBySession.set(session, relayed);
    void this.transport.publish(targetNodeId, {
      v: ENVELOPE_VERSION, k: "c2s", s: session, fn: this.nodeId, u: userId, d: displayName,
      m: { type: "join", roomId, worldId },
      ...(options?.inviteAuthorized ? { ra: 1 as const } : {}),
    } satisfies RelayEnvelope).then((ok) => {
      if (!ok) this.failRelay(session, "publish_failed");
    }).catch(() => this.failRelay(session, "publish_failed"));
    return true;
  }

  /** Mensagem do cliente: true se foi roteada pelo túnel (não processar local). */
  routeIfRelayed(userId: string, msg: { type: string } & Record<string, unknown>): boolean {
    const relayed = this.originByUser.get(userId);
    if (process.env.SMOKE_DEBUG) {
      console.log("[NodeWsGateway] routeIfRelayed", { userId, type: msg.type, relayed: relayed ? { target: relayed.targetNode, session: relayed.session } : null });
    }
    if (!relayed) return false;
    // Âncora de sala: encerra o túnel e processa LOCALMENTE (troca de sala).
    if (["join", "queue", "create_lobby", "join_code"].includes(msg.type)) {
      this.closeRelay(userId, "reanchored");
      return false;
    }
    void this.transport.publish(relayed.targetNode, {
      v: ENVELOPE_VERSION, k: "c2s", s: relayed.session, fn: this.nodeId,
      u: userId, d: (msg as { displayName?: string }).displayName ? String((msg as { displayName?: string }).displayName) : "",
      m: msg,
    } satisfies RelayEnvelope).then((ok) => {
      if (process.env.SMOKE_DEBUG) console.log("[NodeWsGateway] c2s publish ok=", ok, { session: relayed.session, target: relayed.targetNode });
      if (!ok) this.failRelay(relayed.session, "publish_failed");
    }).catch(() => this.failRelay(relayed.session, "publish_failed"));
    return true;
  }

  /** Socket local do usuário fechou: encerra túnel (cls). */
  onLocalSocketClosed(userId: string, ws: unknown): void {
    const relayed = this.originByUser.get(userId);
    if (!relayed || relayed.ws !== ws) return;
    this.closeRelay(userId, "peer_closed");
  }

  /** Id da sala relayada pelo usuário (ou null). */
  relayedRoomId(userId: string): string | null {
    return this.originByUser.get(userId)?.roomId ?? null;
  }

  private closeRelay(userId: string, reason: string): void {
    const relayed = this.originByUser.get(userId);
    if (!relayed) return;
    this.originByUser.delete(userId);
    this.originBySession.delete(relayed.session);
    void this.transport.publish(relayed.targetNode, {
      v: ENVELOPE_VERSION, k: "cls", s: relayed.session, r: reason.slice(0, 256),
    } satisfies RelayEnvelope).catch(() => undefined);
  }

  private failRelay(session: string, reason: string): void {
    const relayed = this.originBySession.get(session);
    if (!relayed) return;
    this.originBySession.delete(session);
    this.originByUser.delete(relayed.userId);
    try {
      relayed.ws.send(JSON.stringify({
        type: "error", code: "ROOM_NODE_LOST",
        message: "A conexão com o nó da sala foi perdida; entre novamente.",
        roomId: relayed.roomId, reason,
      }));
    } catch {
      // socket já morto
    }
  }

  // ── Nó dono: sessões que SERVO ────────────────────────────────────────────

  /** Envelope s2c do RelaySocket → origem. */
  async deliverToOrigin(socket: RelaySocket, raw: string): Promise<boolean> {
    if (raw.length > MAX_ENVELOPE_BYTES) {
      console.warn("[NodeWsGateway] s2c descartado (tamanho)", { session: socket.session, bytes: raw.length });
      return false;
    }
    try {
      return await this.transport.publish(socket.originNode, {
        v: ENVELOPE_VERSION, k: "s2c", s: socket.session, m: raw,
      } satisfies RelayEnvelope);
    } catch {
      return false;
    }
  }

  /** Publicação interna do host (RelaySocket.drop) — transporte encapsulado. */
  publishFromHost(targetNodeId: string, envelope: RelayEnvelope): Promise<boolean> {
    return this.transport.publish(targetNodeId, envelope).catch(() => false);
  }

  /** Observabilidade: nós atualmente conhecidos (registry vivo). */
  listKnownNodes(): string[] {
    return [...this.knownNodes];
  }

  /** Observabilidade: sessões de origem ativas (userId → roomId). */
  relayedSessionsForTests(): { userId: string; roomId: string; targetNode: string }[] {
    return [...this.originByUser.values()].map((s) => ({ userId: s.userId, roomId: s.roomId, targetNode: s.targetNode }));
  }

  // ── Somente testes ────────────────────────────────────────────────────

  /** Liga o gateway em barramento LOCAL com nodeId fixo (sem Redis) —
   *  determinismo em testes multi-nó simulados no mesmo processo. */
  async __startLocalBusForTests(nodeId: string): Promise<void> {
    (this as { nodeId: string }).nodeId = nodeId;
    (this as { enabled: boolean }).enabled = true;
    this.transport = new LocalRelayTransport(nodeId);
    this.registryStore = new LocalNodeRegistryStore();
    this.started = false;
    await this.start();
  }

  /** Força um ciclo de heartbeat agora (registry/leases/limpeza). */
  async __heartbeatNowForTests(): Promise<void> {
    await this.heartbeat();
  }

  endHostSession(session: string, reason: "peer_closed" | "socket_closed" | "node_lost"): void {
    const hosted = this.hostSessions.get(session);
    if (!hosted) return;
    this.hostSessions.delete(session);
    try {
      this.callbacks.onSessionEnd?.(hosted.socket, reason);
    } catch (error) {
      console.warn("[NodeWsGateway] onSessionEnd falhou", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /** Nó dono encerra sessões de uma sala (ex.: sala destruída pós-partida). */
  dropSessionsForRoom(roomId: string): void {
    for (const hosted of [...this.hostSessions.values()]) {
      if (hosted.roomId !== roomId) continue;
      this.hostSessions.delete(hosted.session);
      hosted.socket.readyState = 3;
      void this.transport.publish(hosted.originNode, {
        v: ENVELOPE_VERSION, k: "drop", s: hosted.session, r: "1000:room_closed",
      } satisfies RelayEnvelope).catch(() => undefined);
      try {
        this.callbacks.onSessionEnd?.(hosted.socket, "socket_closed");
      } catch {
        // nunca propaga
      }
    }
  }

  /** Nó dono: quantas sessões ativas (observabilidade/testes). */
  hostedSessionCount(): number {
    return this.hostSessions.size;
  }

  // ── Entrada de envelopes ──────────────────────────────────────────────────

  private handleEnvelope(envelope: RelayEnvelope): void {
    switch (envelope.k) {
      case "s2c": {
        const relayed = this.originBySession.get(envelope.s);
        if (!relayed) return;
        try {
          relayed.ws.send(envelope.m);
        } catch {
          this.failRelay(envelope.s, "send_failed");
        }
        return;
      }
      case "drop": {
        const relayed = this.originBySession.get(envelope.s);
        if (!relayed) return;
        this.originBySession.delete(envelope.s);
        this.originByUser.delete(relayed.userId);
        try {
          relayed.ws.send(JSON.stringify({
            type: "error", code: "ROOM_NODE_LOST",
            message: "A sala em outro nó foi encerrada; entre em uma nova sala.",
            roomId: relayed.roomId, reason: envelope.r,
          }));
        } catch {
          // socket já morto
        }
        return;
      }
      case "cls": {
        this.endHostSession(envelope.s, "peer_closed");
        return;
      }
      case "c2s": {
        if (envelope.fn === this.nodeId) return; // loop self — nunca deve ocorrer
        let hosted = this.hostSessions.get(envelope.s);
        if (!hosted) {
          const socket = new RelaySocket(this, envelope.s, envelope.u, envelope.fn);
          hosted = { session: envelope.s, userId: envelope.u, originNode: envelope.fn, roomId: null, socket };
          this.hostSessions.set(envelope.s, hosted);
          try {
            this.callbacks.onSessionStart?.(socket);
          } catch (error) {
            console.warn("[NodeWsGateway] onSessionStart falhou", {
              message: error instanceof Error ? error.message : String(error),
            });
          }
        }
        if (envelope.m && typeof envelope.m === "object" && (envelope.m as { type?: string }).type === "join") {
          const roomId = (envelope.m as { roomId?: unknown }).roomId;
          if (typeof roomId === "string") hosted.roomId = roomId;
        }
        void Promise.resolve(this.callbacks.onClientMessage?.(hosted.socket, envelope.u, envelope.d, envelope.m, envelope.ra === 1)).catch((error) => {
          console.warn("[NodeWsGateway] onClientMessage falhou", {
            message: error instanceof Error ? error.message : String(error),
          });
        });
        return;
      }
    }
  }
}

// ─── Lazy wrappers (Redis resolve depois da conexão; local antes disso) ──────

class LazyTransport implements RelayTransport {
  private active: RelayTransport;
  private redisTransport: RelayTransport | null = null;
  private startHandler: ((envelope: RelayEnvelope) => void) | null = null;
  constructor(
    /** Retorna o transporte Redis quando o cliente existe; null caso contrário. */
    private readonly factory: () => RelayTransport | null,
    private readonly fallback: RelayTransport,
  ) {
    this.active = fallback;
  }
  /** Resolve o transporte Redis na primeira oportunidade (padrão do mesh:
   *  se Redis subir depois do boot, o próximo uso já publica por lá).
   *  NÃO inicia o transporte — quem inicia é start()/refresh(), uma única
   *  vez (double-start = inscrição dupla no canal). */
  private resolve(): RelayTransport {
    if (!this.redisTransport) {
      const resolved = this.factory();
      if (resolved) {
        this.redisTransport = resolved;
        this.active = resolved;
      }
    }
    return this.active;
  }
  publish(targetNodeId: string, envelope: RelayEnvelope): Promise<boolean> {
    return this.resolve().publish(targetNodeId, envelope);
  }
  async start(onEnvelope: (envelope: RelayEnvelope) => void): Promise<void> {
    this.startHandler = onEnvelope;
    this.resolve(); // tenta Redis imediatamente; fica no fallback se indisponível
    await this.active.start(onEnvelope);
  }
  /** (Re)resolve e INSCREVE o canal relay de forma aguardável — usado pelo
   *  heartbeat para o papel de RECEPTOR (nada publica por este nó). */
  async refresh(): Promise<boolean> {
    const previous = this.active;
    this.resolve();
    if (this.active !== previous && this.startHandler) {
      await this.active.start(this.startHandler).catch(() => undefined);
    }
    return this.redisTransport !== null;
  }
  async stop(): Promise<void> {
    await this.active.stop().catch(() => undefined);
  }
}

class LazyNodeRegistry implements NodeRegistryStore {
  private active: NodeRegistryStore;
  private redisStore: NodeRegistryStore | null = null;
  constructor(
    /** Retorna o registro Redis quando o cliente existe; null caso contrário. */
    private readonly factory: () => NodeRegistryStore | null,
    private readonly fallback: NodeRegistryStore,
  ) {
    this.active = fallback;
  }
  /** Resolve o registro Redis na primeira oportunidade (padrão do mesh:
   *  registro no índice distribuído assim que o client existir). */
  private resolve(): NodeRegistryStore {
    if (!this.redisStore) {
      const resolved = this.factory();
      if (resolved) {
        this.redisStore = resolved;
        this.active = resolved;
      }
    }
    return this.active;
  }
  put(entry: NodeRegistryEntry): Promise<void> {
    return this.resolve().put(entry);
  }
  remove(nodeId: string): Promise<void> {
    return this.resolve().remove(nodeId);
  }
  list(): Promise<NodeRegistryEntry[]> {
    return this.resolve().list();
  }
  touchLease(nodeId: string, ttlMs: number): Promise<void> {
    return this.resolve().touchLease(nodeId, ttlMs);
  }
  async leaseAlive(nodeId: string): Promise<boolean> {
    return this.resolve().leaseAlive(nodeId);
  }
}
