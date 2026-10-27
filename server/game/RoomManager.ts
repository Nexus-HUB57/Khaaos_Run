/**
 * KHAAOS RUN — Authoritative Room Manager
 * ========================================
 * PhD-grade real-time Battle Royale orchestration.
 *
 * Design principles:
 * 1. Server is the single source of truth (no client-side authority on damage, loot, zone).
 * 2. In-memory active rooms for low-latency tick (1 Hz zone, extensible to higher rates).
 * 3. Hybrid persistence: critical events (eliminations, loot pickups) still written to DB.
 * 4. WebSocket fan-out for state broadcast.
 * 5. Room lifecycle: LOBBY → COUNTDOWN → IN_PROGRESS → FINISHED.
 *
 * Future extensions: Redis pub/sub for multi-process, interest management, lag compensation.
 */

import { WebSocket, WebSocketServer } from "ws";
import type { Server } from "http";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { storage } from "../storage";
import {
  ZONE_PHASES,
  PlayerStatus,
  LOOT_PRESETS,
  type ZoneStatus,
  type PlayerStats,
} from "@shared/schema";
import { generateMatchContent } from "./ProceduralGenerator";
import { SpatialGrid } from "./SpatialGrid";
import { PositionHistory, lagCompensatedHit } from "./LagCompensation";
import { NodeWsGateway } from "./NodeWsGateway";
import { deriveCombatLoadout, getLootWeight, hasValidDurability } from "./loadout";
import { planPackBackAction } from "./packback-actions";
import { getWarIUseKind, type WarIActionItem } from "@shared/war-i";
import { applyMatchRankings, type MatchParticipant } from "./RankingService";
import { computeMatchPayouts, settleMatchPayouts } from "./EconomyPayoutSettlement";
import { MatchmakingService, type QueueMode, type MatchmakingEvent } from "./MatchmakingService";
import { consumeWsAccessToken } from "../replit_integrations/auth/ws-token";
import { isAllowedOrigin, requestOriginFromHeaders } from "../replit_integrations/auth/origin";
import { routeWebSocketUpgrade } from "./wsUpgradeRouter";
import type { WorldId } from "./orchestration";
import { aggregateWorldTelemetry, isWorldId, type NetworkLatencySample, type WorldTelemetrySnapshot, type WorldRoomSample } from "./worldTelemetry";
import { distributedState } from "./DistributedState";
import { RoomEventMesh, type RoomMeshRecord } from "./RoomEventMesh";

// ─── Types ───────────────────────────────────────────────────────────────────

export type RoomStatus = "LOBBY" | "COUNTDOWN" | "IN_PROGRESS" | "FINISHED";

export interface RoomPlayer {
  userId: string;
  displayName: string;
  ws: WebSocket | null;
  posX: number; // 0-100
  posY: number;
  targetPosX: number;
  targetPosY: number;
  lastMovementAt: number;
  speedMultiplier: number;
  speedBoostUntil: number;
  carryCapacity: number;
  carriedWeight: number;
  health: number;
  maxHealth: number;
  status: keyof typeof PlayerStatus;
  kills: number;
  isConnected: boolean;
  lastSeenAt: number;
  // Combat
  equippedDamage: number;   // from equipped weapon stats
  equippedRange: number;    // attack range in map %
  packbackItemIds: number[]; // durable, selected War'I items snapshotted for this match
  packbackItems: WarIActionItem[]; // private action snapshot, resent after an authenticated reconnect
  lastPackBackUseAt: number;
  lastAttackAt: number;     // epoch ms — fire rate gate
  posHistory: PositionHistory;
  damageDealt: number;
  joinedMatchAt: number;
  // Lobby
  isReady: boolean;
  isHost: boolean;
  rating: number;
}

export interface RoomLoot {
  id: number; // local sequential or DB id
  name: string;
  type: string;
  rarity: string;
  posX: number;
  posY: number;
  stats: Record<string, number>;
  isPickedUp: boolean;
  pickedUpBy?: string;
}

export interface BattleRoom {
  id: string;
  worldId: WorldId;
  status: RoomStatus;
  maxPlayers: number;
  players: Map<string, RoomPlayer>;
  // Zone state (authoritative)
  currentPhase: number;
  phaseStartedAt: number; // epoch ms
  isShrinking: boolean;
  centerX: number;
  centerY: number;
  // Loot
  loot: RoomLoot[];
  // Spatial interest management
  playerGrid: SpatialGrid<RoomPlayer & SpatialEntityAdapter>;
  lootGrid: SpatialGrid<RoomLoot & SpatialEntityAdapter>;
  // Meta
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
  winnerId: string | null;
  tickHandle: NodeJS.Timeout | null;
  countdownSeconds: number;
  // Lobby meta
  hostId: string | null;
  isPrivate: boolean;
  inviteCode: string | null;
  countdownHandle: NodeJS.Timeout | null;
  minPlayersToStart: number;
}

/** Adapter so SpatialGrid can key by userId/id */
type SpatialEntityAdapter = { id: string | number };

export type ClientMessage =
  | { type: "join"; roomId?: string; displayName?: string; worldId?: WorldId }
  | { type: "resume"; roomId: string }
  | { type: "leave" }
  | { type: "position"; x: number; y: number }
  | { type: "pickup"; lootId: number }
  | { type: "attack"; targetId: string; clientTimestamp?: number }
  | { type: "use_packback_item"; itemId: number }
  | { type: "queue"; mode?: QueueMode; worldId?: WorldId }
  | { type: "dequeue" }
  | { type: "set_ready"; ready: boolean }
  | { type: "start" }           // host force-start or all-ready start
  | { type: "cancel_countdown" } // host only
  | { type: "kick"; targetId: string } // host only
  | { type: "create_lobby"; private?: boolean; maxPlayers?: number; worldId?: WorldId }
  | { type: "join_code"; code: string };

const clientMessageSchema = z.object({
  type: z.enum(["join", "resume", "leave", "position", "pickup", "attack", "use_packback_item", "queue", "dequeue", "set_ready", "start", "cancel_countdown", "kick", "create_lobby", "join_code"]),
  roomId: z.string().trim().max(128).optional(),
  worldId: z.enum(["CIGKV", "W1", "W2", "W3", "W4"]).optional(),
  displayName: z.string().max(64).optional(),
  x: z.number().finite().min(0).max(100).optional(),
  y: z.number().finite().min(0).max(100).optional(),
  lootId: z.number().int().positive().optional(),
  targetId: z.string().max(256).optional(),
  clientTimestamp: z.number().finite().optional(),
  itemId: z.number().int().positive().optional(),
  mode: z.enum(["solo", "duo", "squad"]).optional(),
  ready: z.boolean().optional(),
  private: z.boolean().optional(),
  maxPlayers: z.number().int().min(2).max(50).optional(),
  code: z.string().trim().max(32).optional(),
}).strip();

export type ServerMessage =
  | { type: "welcome"; userId: string; roomId: string }
  | { type: "room_state"; room: SerializedRoom }
  | { type: "zone_tick"; zone: ZoneStatus; players: SerializedPlayer[] }
  | { type: "player_eliminated"; userId: string; cause: string; eliminatorId?: string }
  | { type: "loot_picked"; lootId: number; by: string }
  | { type: "damage_dealt"; attackerId: string; targetId: string; damage: number; targetHealth: number }
  | { type: "packback_ready"; items: WarIActionItem[] }
  | { type: "packback_item_used"; itemId: number; name: string; durability: string; message: string }
  | { type: "packback_scan"; itemId: number; durationMs: number; players: { userId: string; displayName: string; posX: number; posY: number }[]; loot: { id: number; name: string; type: string; posX: number; posY: number }[] }
  | { type: "interest_update"; players: SerializedPlayer[]; loot: RoomLoot[] } // AOI subset
  | { type: "match_finished"; winnerId: string | null; rankings: { userId: string; kills: number; placement: number; xpGained?: number; ratingAfter?: number; rankAfter?: string; promoted?: boolean }[] }
  | { type: "error"; message: string; code?: string; roomId?: string; nodeId?: string; endpoint?: string | null }
  | { type: "countdown"; seconds: number }
  | { type: "queue_joined"; position: number; rating: number; mode: QueueMode }
  | { type: "queue_left" }
  | { type: "queue_update"; position: number; estimatedWaitSec: number; currentDelta: number; playersInQueue: number }
  | { type: "match_found"; roomId: string; players: { userId: string; displayName: string; rating: number }[] };

interface SerializedPlayer {
  userId: string;
  displayName: string;
  posX: number;
  posY: number;
  carryCapacity?: number;
  carriedWeight?: number;
  speedBoostUntil?: number;
  speedMultiplier?: number;
  health: number;
  maxHealth: number;
  status: string;
  kills: number;
  isConnected: boolean;
  isReady: boolean;
  isHost: boolean;
  rating: number;
}

interface SerializedRoom {
  id: string;
  worldId: WorldId;
  status: RoomStatus;
  maxPlayers: number;
  playerCount: number;
  players: SerializedPlayer[];
  zone: ZoneStatus | null;
  loot: RoomLoot[];
  countdownSeconds?: number;
  winnerId?: string | null;
  hostId?: string | null;
  isPrivate?: boolean;
  inviteCode?: string | null;
  readyCount?: number;
  minPlayersToStart?: number;
}

// ─── RoomManager ─────────────────────────────────────────────────────────────

class RoomManager {
  private rooms = new Map<string, BattleRoom>();
  private userToRoom = new Map<string, string>(); // userId → roomId
  private packBackUseLocks = new Set<string>();
  private wss: WebSocketServer | null = null;
  private nextLootId = 1;
  private matchmaking: MatchmakingService;
  private socketWorlds = new WeakMap<WebSocket, WorldId>();
  private networkLatencySamples = new Map<WorldId, NetworkLatencySample[]>();
  private socketsByUser = new Map<string, Set<WebSocket>>();

  /**
   * Redis Event Mesh (auditoria Fase 0/2): espelha o índice de salas em
   * HASH Redis + leases de vivacidade, publica eventos entre nós e detecta
   * morte de nó via reconcile. Estado autoritativo continua LOCAL (sockets
   * são deste processo); o mesh é o barramento de descoberta/eventos.
   */
  readonly mesh = new RoomEventMesh({
    nodeId: distributedState.nodeId,
    redisClientProvider: () => distributedState.getRedisClient(),
    publishControl: (event) => distributedState.publishControl(event),
  });

  /**
   * Node WS Gateway (proxy cross-node — auditoria Fase 2): roteia mensagens
   * de clientes por nodeId até o nó dono da sala (RelaySocket), mantendo o
   * socket no nó de origem. Sem Redis/gateway, o caminho legado
   * (ROOM_REMOTE_NODE + reconexão) permanece intacto.
   */
  readonly gateway = new NodeWsGateway({
    nodeId: distributedState.nodeId,
    redisClientProvider: () => distributedState.getRedisClient() as never,
    callbacks: {
      onSessionStart: (socket) => this.registerSocket(socket.userId, socket as unknown as WebSocket),
      onClientMessage: (socket, userId, displayName, msg, relayAuthorized) =>
        this.handleMessage(userId, displayName, socket as unknown as WebSocket, msg as ClientMessage, { relayInviteAuthorized: relayAuthorized }),
      onSessionEnd: (socket) => {
        this.unregisterSocket(socket.userId, socket as unknown as WebSocket);
        this.onDisconnect(socket.userId, socket as unknown as WebSocket);
      },
    },
  });

  /** Attach to existing HTTP server */
  constructor() {
    this.matchmaking = new MatchmakingService(
      (ws, msg) => this.send(ws, msg as ServerMessage),
      (players, worldId) => this.createLobbyFromMatchmaking(players, worldId),
    );
    void distributedState.subscribeControl((event) => {
      if (event.type === "auth:revoke" && typeof event.userId === "string") this.closeUserSockets(event.userId);
    }).catch((error) => {
      console.error("[RoomManager] control subscriber unavailable", {
        message: process.env.NODE_ENV === "production" ? "subscriber unavailable" : error instanceof Error ? error.message : String(error),
      });
      if (process.env.NODE_ENV === "production") process.exitCode = 1;
    });
  }

  private closeUserSockets(userId: string): void {
    for (const ws of this.socketsByUser.get(userId) ?? []) {
      if (ws.readyState === WebSocket.OPEN) ws.close(4001, "Session revoked");
    }
  }

  private registerSocket(userId: string, ws: WebSocket): void {
    const sockets = this.socketsByUser.get(userId) ?? new Set<WebSocket>();
    sockets.add(ws);
    this.socketsByUser.set(userId, sockets);
  }

  private unregisterSocket(userId: string, ws: WebSocket): void {
    const sockets = this.socketsByUser.get(userId);
    sockets?.delete(ws);
    if (sockets && sockets.size === 0) this.socketsByUser.delete(userId);
  }

  attach(httpServer: Server) {
    // noServer + roteador compartilhado: o SpectatorPipeline (/ws/spectator)
    // vive no MESMO httpServer e um listener ws com `{ server }` responde 400
    // a paths alheios, matando o handshake deste servidor (corrida contra o
    // verifyClient async). Detalhes em wsUpgradeRouter.ts.
    this.wss = new WebSocketServer({
      noServer: true,
      maxPayload: 16 * 1024,
      perMessageDeflate: false,
      handleProtocols: (protocols) => protocols.has("khaaos-v1") ? "khaaos-v1" : false,
      verifyClient: ({ req }, done) => {
        const offeredProtocols = (req.headers["sec-websocket-protocol"] ?? "")
          .split(",")
          .map((protocol) => protocol.trim());
        const tokenProtocol = offeredProtocols.find((protocol) => protocol.startsWith("khaaos-token."));
        const token = tokenProtocol?.slice("khaaos-token.".length);
        const origin = requestOriginFromHeaders(req.headers);
        const ip = req.socket.remoteAddress ?? "unknown";
        void (async () => {
          const edgeLimit = await distributedState.rateLimit(`ws:upgrade:${ip}`, 30, 60_000);
          if (!edgeLimit.allowed) { done(false, 429, "Too Many Requests"); return; }
          if (!token) { done(false, 401, "Unauthorized"); return; }
          if (!offeredProtocols.includes("khaaos-v1") || !isAllowedOrigin(origin)) {
            done(false, 403, "Origin or protocol not allowed");
            return;
          }
          const verified = token ? await consumeWsAccessToken(token, origin) : null;
          if (!verified) { done(false, 401, "Unauthorized"); return; }
          const identityLimit = await distributedState.rateLimit(`ws:identity:${verified.sub}`, 120, 60_000);
          if (!identityLimit.allowed) { done(false, 429, "Too Many Requests"); return; }
          (req as typeof req & { khaaosUserId?: string }).khaaosUserId = verified.sub;
          done(true);
        })().catch(() => done(false, 503, "Realtime authentication unavailable"));
      },
    });
    routeWebSocketUpgrade(httpServer, "/ws", (req, socket, head) => {
      this.wss!.handleUpgrade(req, socket, head, (ws) => this.wss!.emit("connection", ws, req));
    });
    this.matchmaking.start();

    // Event Mesh: leases + reconcile (queda de nó, órfãos self) a cada 10s.
    this.mesh.startHeartbeat(() => new Set(this.rooms.keys()));

    // Gateway cross-node: registro de nós + canal relay deste nó (best-effort;
    // sem Redis fica desabilitado e o caminho legado ROOM_REMOTE_NODE vale).
    void this.gateway.start().catch((error) => {
      console.warn("[RoomManager] gateway cross-node indisponível", {
        message: error instanceof Error ? error.message : String(error),
      });
    });

    this.wss.on("connection", (ws, req) => {
      const userId = (req as typeof req & { khaaosUserId?: string }).khaaosUserId;
      if (!userId) {
        ws.close(1008, "Unauthorized");
        return;
      }
      this.registerSocket(userId, ws);
      let displayName = "Operativo";
      let messagesThisSecond = 0;
      let pendingPingAt: number | null = null;
      const initialRoomId = this.userToRoom.get(userId);
      const initialRoomWorld = initialRoomId ? this.rooms.get(initialRoomId)?.worldId : undefined;
      this.socketWorlds.set(ws, initialRoomWorld ?? "CIGKV");
      const rateReset = setInterval(() => { messagesThisSecond = 0; }, 1_000);
      const pingInterval = setInterval(() => {
        if (ws.readyState !== WebSocket.OPEN || pendingPingAt !== null) return;
        pendingPingAt = Date.now();
        ws.ping(String(pendingPingAt), false, (error) => {
          if (error) pendingPingAt = null;
        });
      }, 5_000);
      pingInterval.unref?.();

      ws.on("pong", (payload) => {
        const sentAt = Number(payload.toString());
        if (pendingPingAt === null || !Number.isFinite(sentAt) || sentAt !== pendingPingAt) return;
        const receivedAt = Date.now();
        const rttMs = receivedAt - sentAt;
        pendingPingAt = null;
        if (rttMs < 0 || rttMs > 120_000) return;
        const worldId = this.socketWorlds.get(ws) ?? "CIGKV";
        const samples = this.networkLatencySamples.get(worldId) ?? [];
        samples.push({ rttMs, observedAt: new Date(receivedAt).toISOString() });
        const cutoff = receivedAt - 5 * 60_000;
        const freshSamples = samples.filter((sample) => Date.parse(sample.observedAt) >= cutoff).slice(-1000);
        this.networkLatencySamples.set(worldId, freshSamples);
      });

      ws.on("message", async (raw) => {
        try {
          if (await distributedState.isUserRevoked(userId)) {
            ws.close(4001, "Session revoked");
            return;
          }
          const aggregateLimit = await distributedState.rateLimit(`ws:messages:${userId}`, 600, 10_000);
          if (++messagesThisSecond > 60 || !aggregateLimit.allowed) {
            ws.close(1008, "Rate limit exceeded");
            return;
          }
        } catch {
          ws.close(1011, "Realtime security unavailable");
          return;
        }
        let msgType: string | undefined;
        try {
          const parsed = clientMessageSchema.safeParse(JSON.parse(raw.toString()));
          if (!parsed.success) {
            this.send(ws, { type: "error", message: "Invalid message" });
            return;
          }
          const msg = parsed.data as ClientMessage;
          msgType = msg.type;
          if ((msg.type === "join" || msg.type === "queue" || msg.type === "create_lobby") && msg.worldId && isWorldId(msg.worldId)) {
            this.socketWorlds.set(ws, msg.worldId);
          } else if (msg.type === "join" && !msg.roomId) {
            this.socketWorlds.set(ws, "CIGKV");
          }
          if (msg.type === "join" && typeof msg.displayName === "string") {
            displayName = msg.displayName.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 32) || "Operativo";
          }
          await this.handleMessage(userId, displayName, ws, msg);
          const activeRoomId = this.userToRoom.get(userId);
          const activeWorld = activeRoomId ? this.rooms.get(activeRoomId)?.worldId : undefined;
          if (activeWorld) this.socketWorlds.set(ws, activeWorld);
        } catch (error) {
          // Observabilidade: o cliente recebe apenas "Invalid message" (sem
          // leak), mas o servidor registra a causa real para diagnóstico
          // (console.warn inspeciona a cadeia .cause do drizzle/pg).
          console.warn("[RoomManager] message handler error", {
            userId,
            type: msgType,
            error,
          });
          this.send(ws, { type: "error", message: "Invalid message" });
        }
      });

      ws.on("close", () => {
        clearInterval(rateReset);
        clearInterval(pingInterval);
        // Gateway: se este socket sustentava um túnel relay, encerra (cls).
        this.gateway.onLocalSocketClosed(userId, ws);
        this.unregisterSocket(userId, ws);
        this.onDisconnect(userId, ws);
      });

      ws.on("error", () => {
        clearInterval(rateReset);
        clearInterval(pingInterval);
        this.gateway.onLocalSocketClosed(userId, ws);
        this.unregisterSocket(userId, ws);
        this.onDisconnect(userId, ws);
      });
    });

    console.log("[RoomManager] WebSocket server attached at /ws");
  }

  stop() {
    this.matchmaking.stop();
    void this.gateway.stop().catch(() => undefined);
  }

  /** Somente testes: alinha mesh + gateway deste manager a um nodeId de
   *  barramento LOCAL (multi-nó simulado no mesmo processo, sem Redis). */
  async __startLocalBusNodeForTests(nodeId: string): Promise<void> {
    (this as unknown as { mesh: RoomEventMesh }).mesh = new RoomEventMesh({ nodeId, enabled: false });
    await this.gateway.__startLocalBusForTests(nodeId);
  }

  isInLiveMatch(userId: string): boolean {
    const roomId = this.userToRoom.get(userId);
    const room = roomId ? this.rooms.get(roomId) : undefined;
    return room?.status === "COUNTDOWN" || room?.status === "IN_PROGRESS";
  }

  private secureId(prefix: string): string {
    return `${prefix}_${Date.now()}_${randomBytes(8).toString("hex")}`;
  }

  // ─── Message Handler ─────────────────────────────────────────────────────

  private async handleMessage(
    userId: string,
    displayName: string,
    ws: WebSocket,
    msg: ClientMessage,
    relayContext?: { relayInviteAuthorized?: boolean },
  ) {
    // Gateway cross-node: usuário com túnel ativo tem a mensagem roteada ao
    // nó dono da sala. Operações de âncora (join/queue/create_lobby/join_code)
    // encerram o túnel e caem para o dispatch LOCAL abaixo.
    if (this.gateway.routeIfRelayed(userId, msg as unknown as { type: string } & Record<string, unknown>)) return;
    switch (msg.type) {
      case "join": {
        if (msg.worldId !== undefined && !isWorldId(msg.worldId)) {
          this.send(ws, { type: "error", message: "Mundo inválido" });
          break;
        }
        const worldId = msg.worldId ?? "CIGKV";
        const requestedRoom = msg.roomId ? this.rooms.get(msg.roomId) : undefined;
        if (msg.worldId !== undefined && requestedRoom && requestedRoom.worldId !== worldId) {
          this.send(ws, { type: "error", message: requestedRoom.isPrivate ? "Sala não encontrada" : "A sala pertence a outro mundo" });
          break;
        }
        // Gateway: roomId explícito que só existe em OUTRO nó → túnel relay
        // (antes disso o join caia silenciosamente em um lobby local novo).
        // Salas PRIVADAS remotas NUNCA relayam por roomId cru — exigem
        // join_code (a autorização de convite via túnel vem do hop de relay).
        if (msg.roomId && !requestedRoom) {
          const remote = await this.mesh.getRemoteRoom(msg.roomId).catch(() => null);
          if (remote && !remote.isPrivate && this.gateway.relaySupported(remote.nodeId)) {
            if (this.gateway.openRelay(userId, displayName, ws, remote.nodeId, remote.id, remote.worldId)) return;
          }
        }
        const roomId = msg.roomId || this.findOrCreateLobby(worldId);
        await this.joinRoom(userId, displayName, ws, roomId, worldId, relayContext?.relayInviteAuthorized === true);
        break;
      }
      case "resume": {
        if (typeof msg.roomId !== "string" || msg.roomId.length > 128) {
          this.send(ws, { type: "error", code: "ROOM_RESUME_UNAVAILABLE", message: "A sala anterior não está mais disponível." });
          break;
        }
        this.resumeRoom(userId, ws, msg.roomId);
        break;
      }
      case "leave": {
        this.leaveRoom(userId);
        break;
      }
      case "position": {
        this.updatePosition(userId, msg.x, msg.y);
        break;
      }
      case "pickup": {
        await this.pickupLoot(userId, msg.lootId);
        break;
      }
      case "attack": {
        this.handleAttack(userId, msg.targetId, msg.clientTimestamp);
        break;
      }
      case "use_packback_item": {
        await this.usePackBackItem(userId, msg.itemId);
        break;
      }
      case "queue": {
        if (msg.worldId !== undefined && !isWorldId(msg.worldId)) {
          this.send(ws, { type: "error", message: "Mundo inválido" });
          break;
        }
        await this.enqueuePlayer(userId, displayName, ws, msg.mode ?? "solo", msg.worldId ?? "CIGKV");
        break;
      }
      case "dequeue": {
        this.matchmaking.dequeue(userId);
        break;
      }
      case "set_ready": {
        this.setPlayerReady(userId, !!msg.ready);
        break;
      }
      case "start": {
        const roomId = this.userToRoom.get(userId);
        if (roomId) this.tryStartMatch(roomId, userId);
        break;
      }
      case "cancel_countdown": {
        this.hostCancelCountdown(userId);
        break;
      }
      case "kick": {
        this.hostKick(userId, msg.targetId);
        break;
      }
      case "create_lobby": {
        if (msg.worldId !== undefined && !isWorldId(msg.worldId)) {
          this.send(ws, { type: "error", message: "Mundo inválido" });
          break;
        }
        await this.createPrivateLobby(userId, displayName, ws, !!msg.private, msg.maxPlayers, msg.worldId ?? "CIGKV");
        break;
      }
      case "join_code": {
        await this.joinByInviteCode(userId, displayName, ws, msg.code);
        break;
      }
      default:
        this.send(ws, { type: "error", message: "Unknown message type" });
    }
  }

  // ─── Room Lifecycle ──────────────────────────────────────────────────────

  private findOrCreateLobby(worldId: WorldId = "CIGKV"): string {
    // Prefer an existing lobby with space
    for (const room of this.rooms.values()) {
      if (!room.isPrivate && room.worldId === worldId && room.status === "LOBBY" && room.players.size < room.maxPlayers) {
        return room.id;
      }
    }
    // Create new
    const id = this.secureId("room");
    const room: BattleRoom = {
      id,
      worldId,
      status: "LOBBY",
      maxPlayers: 50, // scalable later
      players: new Map(),
      currentPhase: 1,
      phaseStartedAt: Date.now(),
      isShrinking: false,
      centerX: 50 + Math.floor(Math.random() * 20 - 10),
      centerY: 50 + Math.floor(Math.random() * 20 - 10),
      loot: [],
      playerGrid: new SpatialGrid(15),
      lootGrid: new SpatialGrid(12),
      createdAt: Date.now(),
      startedAt: null,
      finishedAt: null,
      winnerId: null,
      tickHandle: null,
      countdownSeconds: 10,
      hostId: null,
      isPrivate: false,
      inviteCode: null,
      countdownHandle: null,
      minPlayersToStart: 2,
    };
    this.rooms.set(id, room);
    void distributedState.setRoomOwner(id);
    void distributedState.publishControl({ type: "room_created", roomId: id, status: room.status });
    return id;
  }

  async joinRoom(
    userId: string,
    displayName: string,
    ws: WebSocket,
    roomId: string,
    worldId: WorldId = "CIGKV",
    privateInviteAuthorized = false,
  ) {
    let room = this.rooms.get(roomId);
    if (!room) {
      roomId = this.findOrCreateLobby(worldId);
      room = this.rooms.get(roomId)!;
    }
    if (room.isPrivate && !privateInviteAuthorized) {
      this.send(ws, { type: "error", message: "Sala não encontrada" });
      return;
    }

    // Leave matchmaking queue if present
    this.matchmaking.dequeue(userId);
    this.matchmaking.rebindWs(userId, ws);

    // Leave previous room if any
    if (this.userToRoom.has(userId)) {
      this.leaveRoom(userId);
    }

    if (room.status !== "LOBBY" && room.status !== "COUNTDOWN") {
      this.send(ws, { type: "error", message: "Match already in progress" });
      return;
    }

    if (room.status === "COUNTDOWN" && room.countdownSeconds <= 0) {
      this.send(ws, { type: "error", message: "Partida em preparação; aguarde a próxima sala" });
      return;
    }

    if (room.players.size >= room.maxPlayers) {
      this.send(ws, { type: "error", message: "Room full" });
      return;
    }

    // Load or init player stats
    const stats = await storage.getPlayerStats(userId);
    const initialPosX = 20 + Math.random() * 60;
    const initialPosY = 20 + Math.random() * 60;
    const joinedAt = Date.now();

    const player: RoomPlayer = {
      userId,
      displayName,
      ws,
      posX: initialPosX,
      posY: initialPosY,
      targetPosX: initialPosX,
      targetPosY: initialPosY,
      lastMovementAt: joinedAt,
      speedMultiplier: 1,
      speedBoostUntil: 0,
      carryCapacity: 50,
      carriedWeight: 0,
      health: stats.health,
      maxHealth: stats.maxHealth,
      status: stats.status as any,
      kills: stats.kills,
      isConnected: true,
      lastSeenAt: joinedAt,
      equippedDamage: 15, // baseline unarmed / starter
      equippedRange: 8,
      packbackItemIds: [],
      packbackItems: [],
      lastPackBackUseAt: 0,
      lastAttackAt: 0,
      posHistory: new PositionHistory(1000),
      damageDealt: 0,
      joinedMatchAt: joinedAt,
      isReady: false,
      isHost: room.players.size === 0 || room.hostId === null,
      rating: (stats as any).rating ?? 1000,
    };

    if (!room.hostId) {
      room.hostId = userId;
      player.isHost = true;
    }

    room.players.set(userId, player);
    room.playerGrid.insert({ ...player, id: userId });
    this.userToRoom.set(userId, roomId);

    this.send(ws, { type: "welcome", userId, roomId });
    this.broadcastRoomState(room);
  }

  private resumeRoom(userId: string, ws: WebSocket, requestedRoomId: string) {
    const roomId = this.userToRoom.get(userId);
    const room = roomId ? this.rooms.get(roomId) : undefined;
    const player = room?.players.get(userId);
    if (!room || !player || roomId !== requestedRoomId || room.status === "FINISHED") {
      this.send(ws, {
        type: "error",
        code: "ROOM_RESUME_UNAVAILABLE",
        message: "A sala anterior não está mais disponível. Entre em uma nova sala.",
      });
      return;
    }

    player.ws = ws;
    player.isConnected = true;
    player.lastSeenAt = Date.now();
    this.matchmaking.rebindWs(userId, ws);
    this.send(ws, { type: "welcome", userId, roomId: room.id });
    this.broadcastRoomState(room);
    if (room.status === "IN_PROGRESS") {
      this.send(ws, { type: "packback_ready", items: player.packbackItems });
    }
  }

  leaveRoom(userId: string) {
    const roomId = this.userToRoom.get(userId);
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    if (!room) return;

    const wasHost = room.hostId === userId;
    room.players.delete(userId);
    room.playerGrid.remove(userId);
    this.userToRoom.delete(userId);

    if (room.players.size === 0) {
      if (room.countdownHandle) clearInterval(room.countdownHandle);
      this.destroyRoom(roomId);
    } else {
      if (wasHost) {
        // Transfer host to oldest remaining connected player
        const next = [...room.players.values()].find((p) => p.isConnected) || [...room.players.values()][0];
        if (next) {
          room.hostId = next.userId;
          next.isHost = true;
          for (const p of room.players.values()) {
            if (p.userId !== next.userId) p.isHost = false;
          }
        }
      }
      // If countdown and players dropped below min, cancel
      if (room.status === "COUNTDOWN" && room.players.size < room.minPlayersToStart) {
        this.cancelCountdown(room);
      }
      this.broadcastRoomState(room);
      this.checkVictory(room);
    }
  }

  onDisconnect(userId: string, disconnectedSocket?: WebSocket) {
    const roomId = this.userToRoom.get(userId);
    const room = roomId ? this.rooms.get(roomId) : undefined;
    const player = room?.players.get(userId);
    // A delayed close from the old socket must not clear a newly rebound socket.
    if (disconnectedSocket && player?.ws && player.ws !== disconnectedSocket) return;

    // Stay in matchmaking queue on brief disconnect; full dequeue happens on
    // explicit dequeue or when a match is created.
    this.matchmaking.rebindWs(userId, null as any);
    if (!roomId || !room) return;
    if (player) {
      player.isConnected = false;
      player.ws = null;
      player.lastSeenAt = Date.now();
    }
    this.broadcastRoomState(room);
  }

  // ─── Match Start ─────────────────────────────────────────────────────────

  tryStartMatch(roomId: string, requesterId: string) {
    const room = this.rooms.get(roomId);
    if (!room || room.status !== "LOBBY") return;

    const requester = room.players.get(requesterId);
    const isHost = room.hostId === requesterId || requester?.isHost;
    const readyCount = [...room.players.values()].filter((p) => p.isReady).length;
    const allReady =
      room.players.size >= room.minPlayersToStart &&
      readyCount === room.players.size;

    // Host can force-start with ≥1 player; otherwise require all ready
    if (!isHost && !allReady) {
      if (requester?.ws) {
        this.send(requester.ws, {
          type: "error",
          message: "Aguardando todos prontos ou ação do host",
        });
      }
      return;
    }
    if (room.players.size < 1) return;

    this.beginCountdown(room);
  }

  private beginCountdown(room: BattleRoom) {
    if (room.countdownHandle) clearInterval(room.countdownHandle);

    room.status = "COUNTDOWN";
    room.countdownSeconds = 10;
    this.broadcastRoomState(room);

    room.countdownHandle = setInterval(() => {
      room.countdownSeconds -= 1;
      this.broadcast(room, { type: "countdown", seconds: room.countdownSeconds });

      if (room.countdownSeconds <= 0) {
        if (room.countdownHandle) clearInterval(room.countdownHandle);
        room.countdownHandle = null;
        this.beginMatch(room);
      }
    }, 1000);
  }

  private cancelCountdown(room: BattleRoom) {
    if (room.countdownHandle) {
      clearInterval(room.countdownHandle);
      room.countdownHandle = null;
    }
    room.status = "LOBBY";
    room.countdownSeconds = 10;
    // Reset ready so players confirm again
    for (const p of room.players.values()) p.isReady = false;
    this.broadcastRoomState(room);
  }

  private async beginMatch(room: BattleRoom): Promise<void> {
    if (room.status !== "COUNTDOWN" || this.rooms.get(room.id) !== room) return;

    let preparedLoadouts: Map<string, { loadout: ReturnType<typeof deriveCombatLoadout>; actionItems: WarIActionItem[] }>;
    try {
      const prepared = await Promise.all([...room.players.values()].map(async (player) => {
        const equippedItems = await storage.getEquippedItems(player.userId);
        const readyItems = equippedItems.filter((item) => item.isEquipped === true && hasValidDurability(item));
        const actionItems: WarIActionItem[] = readyItems
          .filter((item) => getWarIUseKind(item.type, item.stats) !== null)
          .map((item) => ({
            id: item.id,
            name: item.name,
            type: item.type,
            rarity: item.rarity,
            durability: item.durability,
            maxDurability: item.maxDurability,
            stats: item.stats ?? {},
          }));
        return [player.userId, { loadout: deriveCombatLoadout(equippedItems, player.maxHealth), actionItems }] as const;
      }));
      preparedLoadouts = new Map(prepared);
    } catch (error) {
      console.error(`[RoomManager] Failed to prepare PackBack for ${room.id}:`, error);
      if (room.status === "COUNTDOWN" && this.rooms.get(room.id) === room) {
        this.cancelCountdown(room);
        for (const player of room.players.values()) {
          if (player.ws) this.send(player.ws, { type: "error", message: "Não foi possível validar a PackBack. A partida foi pausada; tente novamente." });
        }
      }
      return;
    }

    // A participant may have left while the database reads were in flight.
    if (room.status !== "COUNTDOWN" || this.rooms.get(room.id) !== room) return;

    room.status = "IN_PROGRESS";
    room.startedAt = Date.now();
    room.currentPhase = 1;
    room.phaseStartedAt = Date.now();
    room.isShrinking = false;

    // Procedural match content (seeded by room id — reproducible)
    const generated = generateMatchContent(room.id, 28);
    room.centerX = generated.zone.centerX;
    room.centerY = generated.zone.centerY;
    room.loot = generated.loot.map((l) => ({
      ...l,
      id: this.nextLootId++,
    }));

    // Rebuild spatial indices
    room.playerGrid.clear();
    room.lootGrid.clear();
    for (const l of room.loot) {
      room.lootGrid.insert({ ...l, id: l.id });
    }

    // Reset players to alive + re-index
    for (const p of room.players.values()) {
      const prepared = preparedLoadouts.get(p.userId);
      const loadout = prepared?.loadout;
      p.packbackItemIds = loadout?.itemIds ?? [];
      p.packbackItems = prepared?.actionItems ?? [];
      p.equippedDamage = loadout?.equippedDamage ?? 15;
      p.equippedRange = loadout?.equippedRange ?? 8;
      p.maxHealth = loadout?.maxHealth ?? p.maxHealth;
      p.status = "VIVO";
      p.health = p.maxHealth;
      p.carryCapacity = loadout?.carryCapacity ?? 50;
      p.carriedWeight = 0;
      p.targetPosX = p.posX;
      p.targetPosY = p.posY;
      p.lastMovementAt = Date.now();
      p.speedMultiplier = 1;
      p.speedBoostUntil = 0;
      p.kills = 0;
      p.lastAttackAt = 0;
      p.lastPackBackUseAt = 0;
      p.damageDealt = 0;
      p.joinedMatchAt = Date.now();
      p.posHistory.clear();
      p.posHistory.push(p.posX, p.posY);
      room.playerGrid.insert({ ...p, id: p.userId });
      if (p.ws) this.send(p.ws, { type: "packback_ready", items: p.packbackItems });
    }

    this.broadcastRoomState(room);

    // Start authoritative tick (1 Hz)
    room.tickHandle = setInterval(() => this.tick(room), 1000);
  }

  // ─── Authoritative Tick ──────────────────────────────────────────────────

  private tick(room: BattleRoom) {
    if (room.status !== "IN_PROGRESS") return;

    const now = Date.now();
    this.advancePlayerMovement(room, now);
    const phaseConfig = ZONE_PHASES[room.currentPhase - 1] || ZONE_PHASES[ZONE_PHASES.length - 1];
    const elapsedSeconds = (now - room.phaseStartedAt) / 1000;

    let currentRadiusPct: number;
    let waitTimeRemaining = 0;
    let shrinkTimeRemaining = 0;
    let shrinkProgress = 0;
    let isShrinking = room.isShrinking;

    const prevRadius =
      room.currentPhase === 1
        ? 100
        : ZONE_PHASES[room.currentPhase - 2]?.radiusPct ?? 100;
    const targetRadius = phaseConfig.radiusPct;

    if (room.isShrinking) {
      shrinkProgress = Math.min(1, elapsedSeconds / phaseConfig.shrinkSeconds);
      currentRadiusPct = prevRadius + (targetRadius - prevRadius) * shrinkProgress;
      shrinkTimeRemaining = Math.max(0, phaseConfig.shrinkSeconds - elapsedSeconds);

      if (shrinkProgress >= 1) {
        // Advance phase
        const next = room.currentPhase + 1;
        if (next <= ZONE_PHASES.length) {
          room.currentPhase = next;
          room.isShrinking = false;
          room.phaseStartedAt = now;
          isShrinking = false;
          currentRadiusPct = targetRadius;
        } else {
          // Final phase locked
          currentRadiusPct = targetRadius;
        }
      }
    } else {
      currentRadiusPct = prevRadius;
      waitTimeRemaining = Math.max(0, phaseConfig.waitSeconds - elapsedSeconds);
      if (waitTimeRemaining <= 0) {
        room.isShrinking = true;
        room.phaseStartedAt = now;
        isShrinking = true;
        shrinkTimeRemaining = phaseConfig.shrinkSeconds;
        currentRadiusPct = prevRadius;
      }
    }

    const zone: ZoneStatus = {
      isActive: true,
      sessionId: null, // in-memory
      currentPhase: room.currentPhase,
      totalPhases: ZONE_PHASES.length,
      isShrinking,
      currentRadiusPct,
      targetRadiusPct: targetRadius,
      prevRadiusPct: prevRadius,
      waitTimeRemaining,
      shrinkTimeRemaining,
      shrinkProgress,
      damagePerTick: phaseConfig.damagePerTick,
      centerX: room.centerX,
      centerY: room.centerY,
    };

    // Apply zone damage to players outside radius
    const maxR = 100; // normalized
    const radius = currentRadiusPct; // already pct

    for (const player of room.players.values()) {
      if (player.status !== "VIVO") continue;

      const dx = player.posX - room.centerX;
      const dy = player.posY - room.centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > radius) {
        player.health = Math.max(0, player.health - phaseConfig.damagePerTick);
        if (player.health <= 0) {
          player.status = "ELIMINADO";
          // Persist elimination
          storage
            .eliminatePlayer(player.userId, "ZONA", player.displayName)
            .catch(console.error);
          this.broadcast(room, {
            type: "player_eliminated",
            userId: player.userId,
            cause: "ZONA",
          });
        }
      }
    }

    // Broadcast tick
    for (const recipient of room.players.values()) {
      if (recipient.ws && recipient.ws.readyState === WebSocket.OPEN) {
        this.send(recipient.ws, { type: "zone_tick", zone, players: this.serializePlayers(room, recipient.userId) });
      }
    }

    this.checkVictory(room);
  }

  private advancePlayerMovement(room: BattleRoom, now: number) {
    const baseSpeed = 10; // map percentage points per second
    for (const player of room.players.values()) {
      const elapsedSeconds = Math.max(0, Math.min(1.5, (now - player.lastMovementAt) / 1000));
      player.lastMovementAt = now;
      if (player.status !== "VIVO") continue;
      if (player.speedBoostUntil <= now) player.speedMultiplier = 1;
      const dx = player.targetPosX - player.posX;
      const dy = player.targetPosY - player.posY;
      const distance = Math.hypot(dx, dy);
      if (distance < 0.001 || elapsedSeconds <= 0) continue;
      const step = Math.min(distance, baseSpeed * player.speedMultiplier * elapsedSeconds);
      player.posX = Math.max(0, Math.min(100, player.posX + dx / distance * step));
      player.posY = Math.max(0, Math.min(100, player.posY + dy / distance * step));
      player.lastSeenAt = now;
      player.posHistory.push(player.posX, player.posY, now);
      room.playerGrid.update({ ...player, id: player.userId });
    }
  }

  private checkVictory(room: BattleRoom) {
    if (room.status !== "IN_PROGRESS") return;
    const alive = [...room.players.values()].filter((p) => p.status === "VIVO");
    if (alive.length <= 1) {
      room.status = "FINISHED";
      room.finishedAt = Date.now();
      room.winnerId = alive[0]?.userId ?? null;

      if (room.tickHandle) {
        clearInterval(room.tickHandle);
        room.tickHandle = null;
      }

      // Build placement list: winner first, then by kills, then by survival
      const all = [...room.players.values()];
      const winner = alive[0] ?? null;
      const others = all
        .filter((p) => p.userId !== winner?.userId)
        .sort((a, b) => b.kills - a.kills || (b.joinedMatchAt - a.joinedMatchAt));

      const ordered = winner ? [winner, ...others] : others;
      const participants: MatchParticipant[] = ordered.map((p, idx) => ({
        userId: p.userId,
        kills: p.kills,
        damageDealt: p.damageDealt,
        survivedMs: (room.finishedAt ?? Date.now()) - p.joinedMatchAt,
        placement: idx + 1,
        isWinner: p.userId === room.winnerId,
      }));

      // Persist ranking asynchronously then broadcast enriched results
      applyMatchRankings(room.id, participants)
        .then((results) => {
          const rankings = results.map((r) => ({
            userId: r.userId,
            kills: r.kills,
            placement: r.placement,
            xpGained: r.xpGained,
            ratingAfter: r.ratingAfter,
            rankAfter: r.rankAfter,
            promoted: r.promoted,
          }));
          this.broadcast(room, {
            type: "match_finished",
            winnerId: room.winnerId,
            rankings,
          });
          this.broadcastRoomState(room);
        })
        .catch((err) => {
          console.error("[Ranking] failed", err);
          this.broadcast(room, {
            type: "match_finished",
            winnerId: room.winnerId,
            rankings: ordered.map((p, i) => ({
              userId: p.userId,
              kills: p.kills,
              placement: i + 1,
            })),
          });
          this.broadcastRoomState(room);
        });

      // Fase 16 — payouts KRC do fim de partida (2PC + Idempotency-Key
      // determinística payout.<roomId>.<userId>): PREPARE reserva na treasury,
      // COMMIT credita a wallet; crash entre fases é concluído pelo recovery.
      // Falha de settlement NUNCA propaga para o fluxo da partida.
      const payouts = computeMatchPayouts(participants.map((p) => ({
        userId: p.userId,
        kills: p.kills,
        placement: p.placement,
        totalPlayers: participants.length,
      })));
      if (payouts.length > 0) {
        settleMatchPayouts(room.id, payouts)
          .then((summary) => {
            console.log("[Payouts] settlement concluído", {
              roomId: summary.roomId,
              totalKrcCommitted: summary.totalKrcCommitted,
              players: summary.settled.length,
            });
          })
          .catch((err) => {
            console.error("[Payouts] settlement falhou (recovery cobrirá)", err);
          });
      }
    }
  }

  // ─── Player Actions ──────────────────────────────────────────────────────

  updatePosition(userId: string, x: number, y: number) {
    const roomId = this.userToRoom.get(userId);
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    if (!room || room.status !== "IN_PROGRESS") return;
    const player = room.players.get(userId);
    if (!player || player.status !== "VIVO") return;

    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    // Position messages set a destination only. The server advances the player
    // at the authoritative base speed or active Adrenalina multiplier.
    player.targetPosX = Math.max(0, Math.min(100, x));
    player.targetPosY = Math.max(0, Math.min(100, y));
  }

  /** Area-of-Interest update — only nearby players & loot */
  private pushInterest(room: BattleRoom, observer: RoomPlayer) {
    if (!observer.ws || observer.ws.readyState !== WebSocket.OPEN) return;
    const INTEREST_RADIUS = 28; // % of map
    const nearPlayers = room.playerGrid
      .queryRadius(observer.posX, observer.posY, INTEREST_RADIUS)
      .filter((p) => p.userId !== observer.userId || true) // include self
      .map((p) => {
        const full = room.players.get(typeof p.id === "string" ? p.id : p.userId);
        return full ?? p;
      });

    const nearLoot = room.lootGrid
      .queryRadius(observer.posX, observer.posY, INTEREST_RADIUS)
      .filter((l) => !l.isPickedUp);

    // Serialize
    const players: SerializedPlayer[] = nearPlayers.map((p) => ({
      userId: p.userId,
      displayName: p.displayName,
      posX: p.posX,
      posY: p.posY,
      ...(p.userId === observer.userId ? {
        carryCapacity: p.carryCapacity,
        carriedWeight: p.carriedWeight,
        speedBoostUntil: p.speedBoostUntil,
        speedMultiplier: p.speedMultiplier,
      } : {}),
      health: p.health,
      maxHealth: p.maxHealth,
      status: p.status,
      kills: p.kills,
      isConnected: p.isConnected,
      isReady: p.isReady ?? false,
      isHost: p.isHost ?? false,
      rating: p.rating ?? 1000,
    }));

    this.send(observer.ws, {
      type: "interest_update",
      players,
      loot: nearLoot.map((l) => ({
        id: l.id as number,
        name: l.name,
        type: l.type,
        rarity: l.rarity,
        posX: l.posX,
        posY: l.posY,
        stats: l.stats,
        isPickedUp: l.isPickedUp,
        pickedUpBy: l.pickedUpBy,
      })),
    });
  }

  /**
   * Authoritative PvP attack.
   * Range check via spatial grid + fire-rate gate + damage application.
   */
  /**
   * Authoritative PvP attack with lag compensation.
   * Rewinds target position history to client shot time (clamped).
   */
  handleAttack(attackerId: string, targetId: string, clientTimestamp?: number) {
    const roomId = this.userToRoom.get(attackerId);
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    if (!room || room.status !== "IN_PROGRESS") return;

    const attacker = room.players.get(attackerId);
    const target = room.players.get(targetId);
    if (!attacker || !target) return;
    if (attacker.status !== "VIVO" || target.status !== "VIVO") return;
    if (attackerId === targetId) return;

    const now = Date.now();
    if (now - attacker.lastAttackAt < 800) {
      if (attacker.ws) this.send(attacker.ws, { type: "error", message: "Fire rate limited" });
      return;
    }

    const range = attacker.equippedRange || 8;
    const result = lagCompensatedHit({
      attackerHistory: attacker.posHistory,
      targetHistory: target.posHistory,
      attackerCurrent: { x: attacker.posX, y: attacker.posY },
      targetCurrent: { x: target.posX, y: target.posY },
      range,
      serverReceiveTime: now,
      clientTimestamp,
      estimatedOneWayMs: 50,
    });

    if (!result.hit) {
      if (attacker.ws) {
        this.send(attacker.ws, {
          type: "error",
          message: `Miss (lag-comp dist check, rewind ${result.rewindMs}ms)`,
        });
      }
      return;
    }

    attacker.lastAttackAt = now;
    const damage = Math.max(5, attacker.equippedDamage || 15);
    this.applyCombatDamage(room, attacker, target, damage);
    this.checkVictory(room);
  }

  private applyCombatDamage(room: BattleRoom, attacker: RoomPlayer, target: RoomPlayer, damage: number) {
    target.health = Math.max(0, target.health - damage);
    attacker.damageDealt += damage;

    this.broadcast(room, {
      type: "damage_dealt",
      attackerId: attacker.userId,
      targetId: target.userId,
      damage,
      targetHealth: target.health,
    });

    if (target.health <= 0) {
      target.status = "ELIMINADO";
      attacker.kills += 1;
      room.playerGrid.update({ ...target, id: target.userId });

      storage.eliminatePlayer(target.userId, "PVP", target.displayName).catch(console.error);
      storage.addKill(attacker.userId).catch(console.error);

      this.broadcast(room, {
        type: "player_eliminated",
        userId: target.userId,
        cause: "PVP",
        eliminatorId: attacker.userId,
      });
    } else {
      room.playerGrid.update({ ...target, id: target.userId });
    }
  }

  private async usePackBackItem(userId: string, itemId: number) {
    const roomId = this.userToRoom.get(userId);
    const room = roomId ? this.rooms.get(roomId) : undefined;
    const player = room?.players.get(userId);
    if (!room || room.status !== "IN_PROGRESS" || !player || player.status !== "VIVO") {
      if (player?.ws) this.send(player.ws, { type: "error", message: "A PackBack só pode ser usada por um operativo vivo em combate." });
      return;
    }
    if (!Number.isSafeInteger(itemId) || itemId <= 0) {
      if (player.ws) this.send(player.ws, { type: "error", message: "ID de item inválido." });
      return;
    }
    if (!player.packbackItemIds.includes(itemId)) {
      if (player.ws) this.send(player.ws, { type: "error", message: "Este item não fazia parte da PackBack carregada no início da partida." });
      return;
    }

    const lockKey = `${room.id}:${userId}`;
    if (this.packBackUseLocks.has(lockKey)) {
      if (player.ws) this.send(player.ws, { type: "error", message: "Aguarde a confirmação do uso anterior." });
      return;
    }

    this.packBackUseLocks.add(lockKey);
    try {
      const item = await storage.getItemForUser(itemId, userId);
      if (!item || !hasValidDurability(item)) {
        if (player.ws) this.send(player.ws, { type: "error", message: "Item indisponível ou sem durabilidade." });
        return;
      }

      const plan = planPackBackAction(item, player.health, player.maxHealth);
      if (plan.kind === "UNAVAILABLE") {
        if (player.ws) this.send(player.ws, { type: "error", message: plan.reason });
        return;
      }

      const now = Date.now();
      if (now - player.lastPackBackUseAt < 1200) {
        if (player.ws) this.send(player.ws, { type: "error", message: "A PackBack está em recarga; aguarde um instante." });
        return;
      }

      const consumed = await storage.consumeItemDurability(itemId, userId, 10);
      if (!consumed) {
        if (player.ws) this.send(player.ws, { type: "error", message: "Item sem durabilidade disponível." });
        return;
      }
      player.packbackItems = player.packbackItems.map((entry) =>
        entry.id === itemId ? { ...entry, durability: consumed.durability } : entry,
      );
      player.lastPackBackUseAt = now;

      let resultMessage: string;
      if (plan.kind === "HEAL") {
        if (plan.amount > 0) player.health = Math.min(player.maxHealth, player.health + plan.amount);
        if (plan.speedMultiplier && plan.speedDurationMs) {
          player.speedMultiplier = Math.min(1.5, plan.speedMultiplier);
          player.speedBoostUntil = now + plan.speedDurationMs;
        }
        room.playerGrid.update({ ...player, id: player.userId });
        const effects = [
          ...(plan.amount > 0 ? [`+${plan.amount} de vitalidade (${player.health}/${player.maxHealth})`] : []),
          ...(plan.speedMultiplier && plan.speedDurationMs ? [`+${Math.round((plan.speedMultiplier - 1) * 100)}% de velocidade por ${Math.round(plan.speedDurationMs / 1000)}s`] : []),
        ];
        resultMessage = `${item.name}: ${effects.join(" · ")}.`;
      } else if (plan.kind === "GRENADE") {
        const targets = [...room.players.values()].filter((target) => {
          if (target.userId === player.userId || target.status !== "VIVO") return false;
          return Math.hypot(target.posX - player.posX, target.posY - player.posY) <= plan.radius;
        });
        for (const target of targets) this.applyCombatDamage(room, player, target, plan.damage);
        resultMessage = targets.length
          ? `${item.name}: atingiu ${targets.length} operativo(s) por ${plan.damage} de dano.`
          : `${item.name}: detonada; nenhum operativo no raio.`;
        this.checkVictory(room);
      } else {
        const players = [...room.players.values()]
          .filter((target) => target.userId !== player.userId && target.status === "VIVO")
          .filter((target) => Math.hypot(target.posX - player.posX, target.posY - player.posY) <= plan.radius)
          .map((target) => ({
            userId: target.userId,
            displayName: target.displayName,
            posX: target.posX,
            posY: target.posY,
          }));
        const loot = room.loot
          .filter((entry) => !entry.isPickedUp)
          .filter((entry) => Math.hypot(entry.posX - player.posX, entry.posY - player.posY) <= plan.radius)
          .map((entry) => ({ id: entry.id, name: entry.name, type: entry.type, posX: entry.posX, posY: entry.posY }));
        if (player.ws) this.send(player.ws, {
          type: "packback_scan",
          itemId,
          durationMs: 8000,
          players,
          loot,
        });
        resultMessage = `${item.name}: ${players.length} operativo(s) e ${loot.length} item(ns) detectado(s) por 8s.`;
      }

      if (player.ws) this.send(player.ws, {
        type: "packback_item_used",
        itemId,
        name: item.name,
        durability: consumed.durability,
        message: resultMessage,
      });
      this.broadcastRoomState(room);
    } catch (error) {
      console.error(`[RoomManager] Failed to use PackBack item ${itemId} for ${userId}:`, error);
      if (player.ws) this.send(player.ws, { type: "error", message: "Não foi possível usar este item agora." });
    } finally {
      this.packBackUseLocks.delete(lockKey);
    }
  }

  async pickupLoot(userId: string, lootId: number) {
    const roomId = this.userToRoom.get(userId);
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    if (!room || room.status !== "IN_PROGRESS") return;
    const player = room.players.get(userId);
    if (!player || player.status !== "VIVO") return;

    const loot = room.loot.find((l) => l.id === lootId && !l.isPickedUp);
    if (!loot) return;

    // Distance check (must be close)
    const dx = player.posX - loot.posX;
    const dy = player.posY - loot.posY;
    if (Math.sqrt(dx * dx + dy * dy) > 8) {
      if (player.ws) this.send(player.ws, { type: "error", message: "Too far from loot" });
      return;
    }

    const lootWeight = getLootWeight(loot.type, loot.stats);
    if (player.carriedWeight + lootWeight > player.carryCapacity) {
      if (player.ws) this.send(player.ws, {
        type: "error",
        message: `PackBack cheia: este item pesa ${lootWeight}; carga ${player.carriedWeight}/${player.carryCapacity}.`,
      });
      return;
    }

    loot.isPickedUp = true;
    loot.pickedUpBy = userId;
    player.carriedWeight += lootWeight;
    room.lootGrid.remove(lootId);
    try {
      await storage.createItem({
        userId,
        name: loot.name,
        type: loot.type,
        rarity: loot.rarity,
        stats: loot.stats,
      });
    } catch (error) {
      loot.isPickedUp = false;
      delete loot.pickedUpBy;
      player.carriedWeight = Math.max(0, player.carriedWeight - lootWeight);
      room.lootGrid.insert({ ...loot, id: loot.id });
      console.error(`[RoomManager] Failed to persist loot ${lootId} for ${userId}:`, error);
      if (player.ws) this.send(player.ws, { type: "error", message: "Falha ao persistir o loot. Tente coletar novamente." });
      return;
    }

    // Apply the gameplay effect only after the inventory write has succeeded.
    if (loot.type === "CURATIVO" && loot.stats?.heal) {
      player.health = Math.min(player.maxHealth, player.health + loot.stats.heal);
    }
    if (loot.type === "ARMA" && loot.stats?.damage) {
      player.equippedDamage = loot.stats.damage;
      player.equippedRange = Math.min(20, 6 + (loot.stats.damage / 10));
    }
    if (loot.type === "DEFESA" && loot.stats?.defense) {
      player.maxHealth = Math.min(200, player.maxHealth + Math.floor(loot.stats.defense / 4));
    }

    this.broadcast(room, { type: "loot_picked", lootId, by: userId });
    this.broadcastRoomState(room);
  }

  // ─── Serialization & Broadcast ───────────────────────────────────────────

  private serializePlayers(room: BattleRoom, viewerUserId?: string): SerializedPlayer[] {
    return [...room.players.values()].map((p) => ({
      userId: p.userId,
      displayName: p.displayName,
      posX: p.posX,
      posY: p.posY,
      ...(p.userId === viewerUserId ? {
        carryCapacity: p.carryCapacity,
        carriedWeight: p.carriedWeight,
        speedBoostUntil: p.speedBoostUntil,
        speedMultiplier: p.speedMultiplier,
      } : {}),
      health: p.health,
      maxHealth: p.maxHealth,
      status: p.status,
      kills: p.kills,
      isConnected: p.isConnected,
      isReady: p.isReady,
      isHost: p.isHost || p.userId === room.hostId,
      rating: p.rating ?? 1000,
    }));
  }

  private computeZoneStatus(room: BattleRoom): ZoneStatus | null {
    if (room.status !== "IN_PROGRESS" && room.status !== "FINISHED") return null;
    const phaseConfig = ZONE_PHASES[room.currentPhase - 1] || ZONE_PHASES[0];
    const elapsedSeconds = Math.max(0, (Date.now() - room.phaseStartedAt) / 1000);
    const prevRadiusPct = room.currentPhase === 1
      ? 100
      : ZONE_PHASES[room.currentPhase - 2]?.radiusPct ?? 100;
    let currentRadiusPct = prevRadiusPct;
    let waitTimeRemaining = 0;
    let shrinkTimeRemaining = 0;
    let shrinkProgress = 0;
    if (room.isShrinking) {
      shrinkProgress = Math.min(1, elapsedSeconds / phaseConfig.shrinkSeconds);
      currentRadiusPct = prevRadiusPct + (phaseConfig.radiusPct - prevRadiusPct) * shrinkProgress;
      shrinkTimeRemaining = Math.max(0, phaseConfig.shrinkSeconds - elapsedSeconds);
    } else {
      waitTimeRemaining = Math.max(0, phaseConfig.waitSeconds - elapsedSeconds);
    }
    return {
      isActive: room.status === "IN_PROGRESS",
      sessionId: null,
      currentPhase: room.currentPhase,
      totalPhases: ZONE_PHASES.length,
      isShrinking: room.isShrinking,
      currentRadiusPct,
      targetRadiusPct: phaseConfig.radiusPct,
      prevRadiusPct,
      waitTimeRemaining,
      shrinkTimeRemaining,
      shrinkProgress,
      damagePerTick: phaseConfig.damagePerTick,
      centerX: room.centerX,
      centerY: room.centerY,
    };
  }

  private broadcastRoomState(room: BattleRoom) {
    for (const recipient of room.players.values()) {
      if (!recipient.ws || recipient.ws.readyState !== WebSocket.OPEN) continue;
      const payload: ServerMessage = {
        type: "room_state",
        room: {
          id: room.id,
          worldId: room.worldId,
          status: room.status,
          maxPlayers: room.maxPlayers,
          playerCount: room.players.size,
          players: this.serializePlayers(room, recipient.userId),
          zone: this.computeZoneStatus(room),
          loot: room.loot.filter((l) => !l.isPickedUp),
          countdownSeconds: room.status === "COUNTDOWN" ? room.countdownSeconds : undefined,
          winnerId: room.winnerId,
          hostId: room.hostId,
          isPrivate: room.isPrivate,
          inviteCode: room.inviteCode,
          readyCount: [...room.players.values()].filter((p) => p.isReady).length,
          minPlayersToStart: room.minPlayersToStart,
        },
      };
      this.send(recipient.ws, payload);
    }
    // Event Mesh: toda mudança de estado visível atualiza o índice
    // distribuído (dedupe por fingerprint + throttle dentro do mesh).
    this.mirrorRoomSafely(room);
  }

  private toMeshRecord(room: BattleRoom): RoomMeshRecord {
    return {
      id: room.id,
      worldId: room.worldId,
      status: room.status,
      playerCount: room.players.size,
      maxPlayers: room.maxPlayers,
      isPrivate: room.isPrivate,
      inviteCode: room.inviteCode,
      hostId: room.hostId,
      nodeId: this.mesh.nodeId,
      createdAt: room.createdAt,
      updatedAt: Date.now(),
    };
  }

  /** Fire-and-forget: falha do mesh NUNCA propaga para o fluxo do jogo. */
  private mirrorRoomSafely(room: BattleRoom): void {
    this.mesh.mirrorRoom(this.toMeshRecord(room)).catch((error) => {
      console.warn("[RoomManager] mesh mirror falhou", {
        roomId: room.id,
        message: error instanceof Error ? error.message : String(error),
      });
    });
  }

  private broadcast(room: BattleRoom, msg: ServerMessage) {
    const data = JSON.stringify(msg);
    for (const p of room.players.values()) {
      if (p.ws && p.ws.readyState === WebSocket.OPEN) {
        p.ws.send(data);
      }
    }
  }

  private send(ws: WebSocket, msg: ServerMessage) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }

  private destroyRoom(roomId: string) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    if (room.tickHandle) clearInterval(room.tickHandle);
    if (room.countdownHandle) clearInterval(room.countdownHandle);
    this.rooms.delete(roomId);
    // Event Mesh: remove do índice distribuído e anuncia (fire-and-forget).
    void this.mesh.markRoomClosed(roomId, "destroyed").catch(() => undefined);
    // Gateway: sessões relayadas desta sala recebem drop (cliente reentra).
    this.gateway.dropSessionsForRoom(roomId);
  }

  // ─── Lobby controls ──────────────────────────────────────────────────────

  private setPlayerReady(userId: string, ready: boolean) {
    const roomId = this.userToRoom.get(userId);
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    if (!room || room.status !== "LOBBY") return;
    const player = room.players.get(userId);
    if (!player) return;

    player.isReady = ready;
    this.broadcastRoomState(room);

    // Auto-start when everyone is ready and min players met
    const readyCount = [...room.players.values()].filter((p) => p.isReady).length;
    if (
      room.players.size >= room.minPlayersToStart &&
      readyCount === room.players.size
    ) {
      this.beginCountdown(room);
    }
  }

  private hostCancelCountdown(hostId: string) {
    const roomId = this.userToRoom.get(hostId);
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    if (!room || room.hostId !== hostId) return;
    if (room.status !== "COUNTDOWN") return;
    this.cancelCountdown(room);
  }

  private hostKick(hostId: string, targetId: string) {
    const roomId = this.userToRoom.get(hostId);
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    if (!room || room.hostId !== hostId) return;
    if (room.status !== "LOBBY" && room.status !== "COUNTDOWN") return;
    if (targetId === hostId) return;

    const target = room.players.get(targetId);
    if (target?.ws) {
      this.send(target.ws, { type: "error", message: "Você foi removido do lobby pelo host" });
    }
    this.leaveRoom(targetId);
  }

  private async createPrivateLobby(
    userId: string,
    displayName: string,
    ws: WebSocket,
    isPrivate: boolean,
    maxPlayers?: number,
    worldId: WorldId = "CIGKV",
  ) {
    if (this.userToRoom.has(userId)) this.leaveRoom(userId);
    this.matchmaking.dequeue(userId);

    const id = this.secureId("lobby");
    const code = isPrivate
      ? randomBytes(6).toString("base64url").slice(0, 8).toUpperCase()
      : null;

    const room: BattleRoom = {
      id,
      worldId,
      status: "LOBBY",
      maxPlayers: Math.min(50, Math.max(2, maxPlayers ?? 16)),
      players: new Map(),
      currentPhase: 1,
      phaseStartedAt: Date.now(),
      isShrinking: false,
      centerX: 50,
      centerY: 50,
      loot: [],
      playerGrid: new SpatialGrid(15),
      lootGrid: new SpatialGrid(12),
      createdAt: Date.now(),
      startedAt: null,
      finishedAt: null,
      winnerId: null,
      tickHandle: null,
      countdownSeconds: 10,
      hostId: userId,
      isPrivate,
      inviteCode: code,
      countdownHandle: null,
      minPlayersToStart: 2,
    };
    this.rooms.set(id, room);
    if (!(await distributedState.setRoomOwner(id))) {
      this.send(ws, { type: "error", message: "Lobby indisponível; tente novamente" });
      this.rooms.delete(id);
      return;
    }
    await distributedState.publishControl({ type: "room_created", roomId: id, status: room.status });
    await this.joinRoom(userId, displayName, ws, id, worldId, isPrivate);
  }

  private async joinByInviteCode(
    userId: string,
    displayName: string,
    ws: WebSocket,
    code: string,
  ) {
    const normalized = code.trim().toUpperCase();
    const room = [...this.rooms.values()].find(
      (r) =>
        r.inviteCode === normalized &&
        (r.status === "LOBBY" || r.status === "COUNTDOWN"),
    );
    if (!room) {
      // Event Mesh: o lobby pode existir em OUTRO nó — lookup fresco no
      // índice distribuído antes de declarar o código inválido.
      const remote = await this.mesh.findRemoteByInviteCode(normalized).catch(() => null);
      if (remote) {
        // Gateway: com registro de nós vivo, ABRIMOS TÚNEL — o socket fica
        // neste nó e as mensagens são roteadas por nodeId ao dono da sala.
        // O join sintético carrega ra=1 (autorização do hop, validada AQUI
        // na origem contra o índice do mesh).
        if (this.gateway.relaySupported(remote.nodeId)) {
          if (this.gateway.openRelay(userId, displayName, ws, remote.nodeId, remote.id, remote.worldId, { inviteAuthorized: true })) return;
        }
        this.send(ws, {
          type: "error",
          code: "ROOM_REMOTE_NODE",
          roomId: remote.id,
          nodeId: remote.nodeId,
          endpoint: process.env.NODE_PUBLIC_URL ?? null,
          message: "Este lobby está hospedado em outro nó; reconecte no endpoint indicado",
        });
        return;
      }
      this.send(ws, { type: "error", message: "Código de lobby inválido ou expirado" });
      return;
    }
    await this.joinRoom(userId, displayName, ws, room.id, room.worldId, true);
  }

  // ─── Matchmaking integration ─────────────────────────────────────────────

  private async enqueuePlayer(
    userId: string,
    displayName: string,
    ws: WebSocket,
    mode: QueueMode,
    worldId: WorldId = "CIGKV",
  ) {
    // Cannot queue while already in an active match
    const existingRoom = this.userToRoom.get(userId);
    if (existingRoom) {
      const room = this.rooms.get(existingRoom);
      if (room && (room.status === "IN_PROGRESS" || room.status === "COUNTDOWN")) {
        this.send(ws, { type: "error", message: "Already in a match" });
        return;
      }
      // Leave idle lobby before queuing
      this.leaveRoom(userId);
    }

    const stats = await storage.getPlayerStats(userId);
    const rating = (stats as any).rating ?? 1000;
    this.matchmaking.enqueue(userId, displayName, rating, ws, mode, worldId);
  }

  /**
   * Called by MatchmakingService when a skill-matched group is ready.
   * Creates a dedicated lobby and seats all players.
   */
  async createLobbyFromMatchmaking(
    players: { userId: string; displayName: string; rating: number; ws: WebSocket | null }[],
    worldId: WorldId = "CIGKV",
  ): Promise<string> {
    const id = this.secureId("mm");
    const room: BattleRoom = {
      id,
      worldId,
      status: "LOBBY",
      maxPlayers: Math.max(50, players.length),
      players: new Map(),
      currentPhase: 1,
      phaseStartedAt: Date.now(),
      isShrinking: false,
      centerX: 50 + Math.floor(Math.random() * 20 - 10),
      centerY: 50 + Math.floor(Math.random() * 20 - 10),
      loot: [],
      playerGrid: new SpatialGrid(15),
      lootGrid: new SpatialGrid(12),
      createdAt: Date.now(),
      startedAt: null,
      finishedAt: null,
      winnerId: null,
      tickHandle: null,
      countdownSeconds: 10,
      hostId: players[0]?.userId ?? null,
      isPrivate: false,
      inviteCode: null,
      countdownHandle: null,
      minPlayersToStart: 2,
    };
    this.rooms.set(id, room);
    if (!(await distributedState.setRoomOwner(id))) {
      throw new Error("Sala distribuída indisponível");
    }
    await distributedState.publishControl({ type: "match_created", roomId: id, players: players.map((p) => p.userId) });

    for (const p of players) {
      // Seat without going through public join (already authenticated)
      if (this.userToRoom.has(p.userId)) {
        this.leaveRoom(p.userId);
      }

      let stats;
      try {
        stats = await storage.getPlayerStats(p.userId);
      } catch {
        stats = { health: 100, maxHealth: 100, status: "VIVO", kills: 0 } as any;
      }

      const initialPosX = 20 + Math.random() * 60;
      const initialPosY = 20 + Math.random() * 60;
      const joinedAt = Date.now();
      const player: RoomPlayer = {
        userId: p.userId,
        displayName: p.displayName,
        ws: p.ws,
        posX: initialPosX,
        posY: initialPosY,
        targetPosX: initialPosX,
        targetPosY: initialPosY,
        lastMovementAt: joinedAt,
        speedMultiplier: 1,
        speedBoostUntil: 0,
        carryCapacity: 50,
        carriedWeight: 0,
        health: stats.health ?? 100,
        maxHealth: stats.maxHealth ?? 100,
        status: "VIVO",
        kills: 0,
        isConnected: !!p.ws,
        lastSeenAt: joinedAt,
        equippedDamage: 15,
        equippedRange: 8,
        packbackItemIds: [],
        packbackItems: [],
        lastPackBackUseAt: 0,
        lastAttackAt: 0,
        posHistory: new PositionHistory(1000),
        damageDealt: 0,
        joinedMatchAt: joinedAt,
        isReady: true, // matchmaking players arrive ready
        isHost: p.userId === room.hostId,
        rating: p.rating ?? 1000,
      };

      room.players.set(p.userId, player);
      room.playerGrid.insert({ ...player, id: p.userId });
      this.userToRoom.set(p.userId, id);

      if (p.ws) {
        this.send(p.ws, { type: "welcome", userId: p.userId, roomId: id });
      }
    }

    this.broadcastRoomState(room);

    // Auto-start countdown when matchmaking fills a lobby
    if (room.players.size >= 2) {
      this.tryStartMatch(id, players[0].userId);
    }

    return id;
  }

  getMatchmakingStatus(userId: string) {
    return this.matchmaking.getStatus(userId);
  }

  getMatchmakingQueueSize() {
    return this.matchmaking.getQueueSize();
  }

  getWorldTelemetry(worldId: WorldId): WorldTelemetrySnapshot {
    const rooms: WorldRoomSample[] = [...this.rooms.values()]
      .filter((room) => room.worldId === worldId)
      .map((room) => ({
        status: room.status,
        connectedPlayers: [...room.players.values()].filter((player) => player.isConnected).length,
        maxPlayers: room.maxPlayers,
      }));
    const cutoff = Date.now() - 5 * 60_000;
    const samples = (this.networkLatencySamples.get(worldId) ?? [])
      .filter((sample) => Date.parse(sample.observedAt) >= cutoff);
    this.networkLatencySamples.set(worldId, samples);
    return aggregateWorldTelemetry(worldId, rooms, this.matchmaking.getTelemetry(worldId), new Date(), samples);
  }

  // ─── Public helpers for REST ─────────────────────────────────────────────

  getRoomSummary(roomId: string) {
    const room = this.rooms.get(roomId);
    if (!room) {
      // Event Mesh: sala de outro nó, via cache síncrono do reconcile.
      const remote = this.mesh.getCachedRoom(roomId);
      if (remote) {
        return {
          id: remote.id,
          worldId: remote.worldId,
          status: remote.status,
          playerCount: remote.playerCount,
          maxPlayers: remote.maxPlayers,
          remote: true,
          nodeId: remote.nodeId,
        };
      }
      return null;
    }
    return {
      id: room.id,
      worldId: room.worldId,
      status: room.status,
      playerCount: room.players.size,
      maxPlayers: room.maxPlayers,
    };
  }

  listLobbies() {
    const local = [...this.rooms.values()]
      .filter((r) => !r.isPrivate && (r.status === "LOBBY" || r.status === "COUNTDOWN"))
      .map((r) => ({
        id: r.id,
        status: r.status,
        playerCount: r.players.size,
        maxPlayers: r.maxPlayers,
      }));
    // Event Mesh: lobbies de outros nós (cache atualizado pelo heartbeat).
    const remote = this.mesh.listRemoteLobbiesSync().map((record) => ({
      id: record.id,
      status: record.status,
      playerCount: record.playerCount,
      maxPlayers: record.maxPlayers,
      remote: true,
      nodeId: record.nodeId,
    }));
    return [...local, ...remote];
  }
}

export const roomManager = new RoomManager();
// Classe exportada para testes multi-nó (instâncias adicionais no mesmo processo).
export { RoomManager as RoomManagerClass };
