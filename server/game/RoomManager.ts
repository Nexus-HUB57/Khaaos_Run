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
import { applyMatchRankings, type MatchParticipant } from "./RankingService";
import { MatchmakingService, type QueueMode, type MatchmakingEvent } from "./MatchmakingService";
import { verifyWsAccessToken } from "../replit_integrations/auth/ws-token";

// ─── Types ───────────────────────────────────────────────────────────────────

export type RoomStatus = "LOBBY" | "COUNTDOWN" | "IN_PROGRESS" | "FINISHED";

export interface RoomPlayer {
  userId: string;
  displayName: string;
  ws: WebSocket | null;
  posX: number; // 0-100
  posY: number;
  health: number;
  maxHealth: number;
  status: keyof typeof PlayerStatus;
  kills: number;
  isConnected: boolean;
  lastSeenAt: number;
  // Combat
  equippedDamage: number;   // from equipped weapon stats
  equippedRange: number;    // attack range in map %
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
  | { type: "join"; roomId?: string; displayName?: string }
  | { type: "leave" }
  | { type: "position"; x: number; y: number }
  | { type: "pickup"; lootId: number }
  | { type: "attack"; targetId: string; clientTimestamp?: number }
  | { type: "queue"; mode?: QueueMode }
  | { type: "dequeue" }
  | { type: "set_ready"; ready: boolean }
  | { type: "start" }           // host force-start or all-ready start
  | { type: "cancel_countdown" } // host only
  | { type: "kick"; targetId: string } // host only
  | { type: "create_lobby"; private?: boolean; maxPlayers?: number }
  | { type: "join_code"; code: string };

export type ServerMessage =
  | { type: "welcome"; userId: string; roomId: string }
  | { type: "room_state"; room: SerializedRoom }
  | { type: "zone_tick"; zone: ZoneStatus; players: SerializedPlayer[] }
  | { type: "player_eliminated"; userId: string; cause: string; eliminatorId?: string }
  | { type: "loot_picked"; lootId: number; by: string }
  | { type: "damage_dealt"; attackerId: string; targetId: string; damage: number; targetHealth: number }
  | { type: "interest_update"; players: SerializedPlayer[]; loot: RoomLoot[] } // AOI subset
  | { type: "match_finished"; winnerId: string | null; rankings: { userId: string; kills: number; placement: number; xpGained?: number; ratingAfter?: number; rankAfter?: string; promoted?: boolean }[] }
  | { type: "error"; message: string }
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
  private wss: WebSocketServer | null = null;
  private nextLootId = 1;
  private matchmaking: MatchmakingService;

  /** Attach to existing HTTP server */
  constructor() {
    this.matchmaking = new MatchmakingService(
      (ws, msg) => this.send(ws, msg as ServerMessage),
      (players) => this.createLobbyFromMatchmaking(players),
    );
  }

  attach(httpServer: Server) {
    this.wss = new WebSocketServer({
      server: httpServer,
      path: "/ws",
      handleProtocols: (protocols) => protocols.has("khaaos-v1") ? "khaaos-v1" : false,
      verifyClient: ({ req }, done) => {
        const offeredProtocols = (req.headers["sec-websocket-protocol"] ?? "")
          .split(",")
          .map((protocol) => protocol.trim());
        const tokenProtocol = offeredProtocols.find((protocol) => protocol.startsWith("khaaos-token."));
        const token = tokenProtocol?.slice("khaaos-token.".length);
        const userId = token ? verifyWsAccessToken(token) : null;
        if (!offeredProtocols.includes("khaaos-v1") || !userId) {
          done(false, 401, "Unauthorized");
          return;
        }
        (req as typeof req & { khaaosUserId?: string }).khaaosUserId = userId;
        done(true);
      },
    });
    this.matchmaking.start();

    this.wss.on("connection", (ws, req) => {
      const userId = (req as typeof req & { khaaosUserId?: string }).khaaosUserId;
      if (!userId) {
        ws.close(1008, "Unauthorized");
        return;
      }
      let displayName = "Operativo";

      ws.on("message", async (raw) => {
        try {
          const msg = JSON.parse(raw.toString()) as ClientMessage;
          if (msg.type === "join" && typeof msg.displayName === "string") {
            displayName = msg.displayName.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 32) || "Operativo";
          }
          await this.handleMessage(userId, displayName, ws, msg);
        } catch (err: any) {
          this.send(ws, { type: "error", message: err.message || "Invalid message" });
        }
      });

      ws.on("close", () => {
        this.onDisconnect(userId);
      });

      ws.on("error", () => {
        this.onDisconnect(userId);
      });
    });

    console.log("[RoomManager] WebSocket server attached at /ws");
  }

  stop() {
    this.matchmaking.stop();
  }

  // ─── Message Handler ─────────────────────────────────────────────────────

  private async handleMessage(
    userId: string,
    displayName: string,
    ws: WebSocket,
    msg: ClientMessage,
  ) {
    switch (msg.type) {
      case "join": {
        const roomId = msg.roomId || this.findOrCreateLobby();
        await this.joinRoom(userId, displayName, ws, roomId);
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
      case "queue": {
        await this.enqueuePlayer(userId, displayName, ws, msg.mode ?? "solo");
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
        await this.createPrivateLobby(userId, displayName, ws, !!msg.private, msg.maxPlayers);
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

  private findOrCreateLobby(): string {
    // Prefer an existing lobby with space
    for (const room of this.rooms.values()) {
      if (room.status === "LOBBY" && room.players.size < room.maxPlayers) {
        return room.id;
      }
    }
    // Create new
    const id = `room_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const room: BattleRoom = {
      id,
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
    return id;
  }

  async joinRoom(userId: string, displayName: string, ws: WebSocket, roomId: string) {
    // Leave matchmaking queue if present
    this.matchmaking.dequeue(userId);
    this.matchmaking.rebindWs(userId, ws);

    // Leave previous room if any
    if (this.userToRoom.has(userId)) {
      this.leaveRoom(userId);
    }

    let room = this.rooms.get(roomId);
    if (!room) {
      roomId = this.findOrCreateLobby();
      room = this.rooms.get(roomId)!;
    }

    if (room.status !== "LOBBY" && room.status !== "COUNTDOWN") {
      this.send(ws, { type: "error", message: "Match already in progress" });
      return;
    }

    if (room.players.size >= room.maxPlayers) {
      this.send(ws, { type: "error", message: "Room full" });
      return;
    }

    // Load or init player stats
    const stats = await storage.getPlayerStats(userId);

    const player: RoomPlayer = {
      userId,
      displayName,
      ws,
      posX: 20 + Math.random() * 60,
      posY: 20 + Math.random() * 60,
      health: stats.health,
      maxHealth: stats.maxHealth,
      status: stats.status as any,
      kills: stats.kills,
      isConnected: true,
      lastSeenAt: Date.now(),
      equippedDamage: 15, // baseline unarmed / starter
      equippedRange: 8,
      lastAttackAt: 0,
      posHistory: new PositionHistory(1000),
      damageDealt: 0,
      joinedMatchAt: Date.now(),
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

  onDisconnect(userId: string) {
    // Stay in matchmaking queue on brief disconnect (ws rebound on rejoin);
    // only clear ws ref. Full dequeue happens on explicit dequeue or match.
    this.matchmaking.rebindWs(userId, null as any);

    const roomId = this.userToRoom.get(userId);
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    if (!room) return;
    const player = room.players.get(userId);
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

  private beginMatch(room: BattleRoom) {
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
      p.status = "VIVO";
      p.health = p.maxHealth;
      p.kills = 0;
      p.lastAttackAt = 0;
      p.damageDealt = 0;
      p.joinedMatchAt = Date.now();
      p.posHistory.clear();
      p.posHistory.push(p.posX, p.posY);
      room.playerGrid.insert({ ...p, id: p.userId });
    }

    this.broadcastRoomState(room);

    // Start authoritative tick (1 Hz)
    room.tickHandle = setInterval(() => this.tick(room), 1000);
  }

  // ─── Authoritative Tick ──────────────────────────────────────────────────

  private tick(room: BattleRoom) {
    if (room.status !== "IN_PROGRESS") return;

    const now = Date.now();
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
    const players = this.serializePlayers(room);
    this.broadcast(room, { type: "zone_tick", zone, players });

    this.checkVictory(room);
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

    // Clamp + basic anti-cheat (teleport detection can be added later)
    player.posX = Math.max(0, Math.min(100, x));
    player.posY = Math.max(0, Math.min(100, y));
    player.lastSeenAt = Date.now();
    player.posHistory.push(player.posX, player.posY, player.lastSeenAt);
    room.playerGrid.update({ ...player, id: userId });

    // Interest management: push nearby entities only to this client
    this.pushInterest(room, player);
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
    target.health = Math.max(0, target.health - damage);
    attacker.damageDealt += damage;

    this.broadcast(room, {
      type: "damage_dealt",
      attackerId,
      targetId,
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
        eliminatorId: attackerId,
      });

      this.checkVictory(room);
    } else {
      room.playerGrid.update({ ...target, id: target.userId });
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

    loot.isPickedUp = true;
    loot.pickedUpBy = userId;
    room.lootGrid.remove(lootId);

    // Heal if curativo
    if (loot.type === "CURATIVO" && loot.stats?.heal) {
      player.health = Math.min(player.maxHealth, player.health + loot.stats.heal);
    }

    // Equip weapon/defense for PvP
    if (loot.type === "ARMA" && loot.stats?.damage) {
      player.equippedDamage = loot.stats.damage;
      player.equippedRange = Math.min(20, 6 + (loot.stats.damage / 10));
    }
    if (loot.type === "DEFESA" && loot.stats?.defense) {
      // Defense reduces incoming damage implicitly later; for now boost maxHealth slightly
      player.maxHealth = Math.min(200, player.maxHealth + Math.floor(loot.stats.defense / 4));
    }

    // Persist to inventory (async)
    storage
      .createItem({
        userId,
        name: loot.name,
        type: loot.type,
        rarity: loot.rarity,
        stats: loot.stats,
      })
      .catch(console.error);

    this.broadcast(room, { type: "loot_picked", lootId, by: userId });
  }

  // ─── Serialization & Broadcast ───────────────────────────────────────────

  private serializePlayers(room: BattleRoom): SerializedPlayer[] {
    return [...room.players.values()].map((p) => ({
      userId: p.userId,
      displayName: p.displayName,
      posX: p.posX,
      posY: p.posY,
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
    // Simplified snapshot
    const phaseConfig = ZONE_PHASES[room.currentPhase - 1] || ZONE_PHASES[0];
    return {
      isActive: room.status === "IN_PROGRESS",
      sessionId: null,
      currentPhase: room.currentPhase,
      totalPhases: ZONE_PHASES.length,
      isShrinking: room.isShrinking,
      currentRadiusPct: phaseConfig.radiusPct,
      targetRadiusPct: phaseConfig.radiusPct,
      prevRadiusPct: room.currentPhase > 1 ? ZONE_PHASES[room.currentPhase - 2].radiusPct : 100,
      waitTimeRemaining: 0,
      shrinkTimeRemaining: 0,
      shrinkProgress: 0,
      damagePerTick: phaseConfig.damagePerTick,
      centerX: room.centerX,
      centerY: room.centerY,
    };
  }

  private broadcastRoomState(room: BattleRoom) {
    const payload: ServerMessage = {
      type: "room_state",
      room: {
        id: room.id,
        status: room.status,
        maxPlayers: room.maxPlayers,
        playerCount: room.players.size,
        players: this.serializePlayers(room),
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
    this.broadcast(room, payload);
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
  ) {
    if (this.userToRoom.has(userId)) this.leaveRoom(userId);
    this.matchmaking.dequeue(userId);

    const id = `lobby_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const code = isPrivate
      ? Math.random().toString(36).slice(2, 8).toUpperCase()
      : null;

    const room: BattleRoom = {
      id,
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
    await this.joinRoom(userId, displayName, ws, id);
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
      this.send(ws, { type: "error", message: "Código de lobby inválido ou expirado" });
      return;
    }
    await this.joinRoom(userId, displayName, ws, room.id);
  }

  // ─── Matchmaking integration ─────────────────────────────────────────────

  private async enqueuePlayer(
    userId: string,
    displayName: string,
    ws: WebSocket,
    mode: QueueMode,
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
    this.matchmaking.enqueue(userId, displayName, rating, ws, mode);
  }

  /**
   * Called by MatchmakingService when a skill-matched group is ready.
   * Creates a dedicated lobby and seats all players.
   */
  async createLobbyFromMatchmaking(
    players: { userId: string; displayName: string; rating: number; ws: WebSocket | null }[],
  ): Promise<string> {
    const id = `mm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const room: BattleRoom = {
      id,
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

      const player: RoomPlayer = {
        userId: p.userId,
        displayName: p.displayName,
        ws: p.ws,
        posX: 20 + Math.random() * 60,
        posY: 20 + Math.random() * 60,
        health: stats.health ?? 100,
        maxHealth: stats.maxHealth ?? 100,
        status: "VIVO",
        kills: 0,
        isConnected: !!p.ws,
        lastSeenAt: Date.now(),
        equippedDamage: 15,
        equippedRange: 8,
        lastAttackAt: 0,
        posHistory: new PositionHistory(1000),
        damageDealt: 0,
        joinedMatchAt: Date.now(),
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

  // ─── Public helpers for REST ─────────────────────────────────────────────

  getRoomSummary(roomId: string) {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    return {
      id: room.id,
      status: room.status,
      playerCount: room.players.size,
      maxPlayers: room.maxPlayers,
    };
  }

  listLobbies() {
    return [...this.rooms.values()]
      .filter((r) => r.status === "LOBBY" || r.status === "COUNTDOWN")
      .map((r) => ({
        id: r.id,
        status: r.status,
        playerCount: r.players.size,
        maxPlayers: r.maxPlayers,
      }));
  }
}

export const roomManager = new RoomManager();
