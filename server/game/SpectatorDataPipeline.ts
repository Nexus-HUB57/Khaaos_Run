/**
 * KHAAOS RUN — Spectator Data Pipeline
 * ======================================
 * Delayed, batched spectator data transmission over WebSocket.
 *
 * Design constraints:
 *   - 10-second delay to prevent cheat-assisted ghosting
 *   - Maximum 500 concurrent spectators per match
 *   - 200ms batch rate (5 updates/second) to limit bandwidth
 *   - WebSocket endpoint: /ws/spectator
 *   - Camera modes: FREECAM, FOLLOW_PLAYER, OVERHEAD, RING_CENTER
 *
 * Pipeline: Game State → Delay Buffer (10s) → Batch Aggregator (200ms) → WS Fan-out
 */

import { WebSocket, WebSocketServer } from "ws";
import type { Server } from "http";
import { routeWebSocketUpgrade } from "./wsUpgradeRouter";

// ─── Types ──────────────────────────────────────────────────────────────────

export type SpectatorCameraMode = "FREECAM" | "FOLLOW_PLAYER" | "OVERHEAD" | "RING_CENTER";

export interface SpectatorClient {
  id: string;
  ws: WebSocket;
  cameraMode: SpectatorCameraMode;
  followPlayerId: string | null;
  connectedAt: number;
  roomId: string;
  bytesSent: number;
  packetsSent: number;
}

export interface SpectatorGameData {
  type: string;
  roomId: string;
  timestamp: number;
  players: SpectatorPlayerSnapshot[];
  ringState: SpectatorRingSnapshot;
  events: SpectatorEvent[];
}

export interface SpectatorPlayerSnapshot {
  id: string;
  /** Nome real do jogador exibido no standings do HUD de espectador (Fase 14). */
  displayName?: string;
  species: string;
  posX: number;
  posY: number;
  health: number;
  shield: number;
  isDowned: boolean;
  isEliminated: boolean;
  kills: number;
}

export interface SpectatorRingSnapshot {
  currentPhase: number;
  currentRadius: number;
  ringCenter: [number, number, number];
  isShrinking: boolean;
  nextPhaseIn: number;
}

export interface SpectatorEvent {
  type: "ELIMINATION" | "WORLD_TRANSITION" | "RING_PHASE" | "AIRDROP" | "REVIVE";
  data: Record<string, any>;
  timestamp: number;
}

/** Métricas da transmissão — consumidas pela superfície de administração. */
export interface SpectatorPipelineMetrics {
  totalSpectators: number;
  peakSpectators: number;
  rooms: { roomId: string; spectators: number; packetsSent: number; bytesSent: number; delayBufferSize: number }[];
  totals: { packetsSent: number; bytesSent: number };
  limits: { delayMs: number; maxSpectatorsPerRoom: number; globalMaxSpectators: number; batchIntervalMs: number };
  now: number;
}

// ─── Spectator Data Pipeline Config ─────────────────────────────────────────

export const SpectatorConfig = {
  /** Delay in ms before spectator receives game data */
  delayMs: 10_000,

  /** Maximum concurrent spectators per room */
  maxSpectatorsPerRoom: 500,

  /** Batch interval in ms */
  batchIntervalMs: 200,

  /** Global max spectators across all rooms */
  globalMaxSpectators: 5_000,

  /** Max events per batch to limit payload size */
  maxEventsPerBatch: 20,

  /** Max bytes per second per spectator (throttle) */
  maxBytesPerSecond: 65_536, // 64 KB/s
};

// ─── Delay Buffer ───────────────────────────────────────────────────────────

interface DelayedEntry {
  data: SpectatorGameData;
  emitAt: number; // timestamp when this entry should be emitted
}

class DelayBuffer {
  private buffer: DelayedEntry[] = [];
  private delayMs: number;

  constructor(delayMs: number) {
    this.delayMs = delayMs;
  }

  /** Push a game data snapshot into the delay buffer. */
  push(data: SpectatorGameData): void {
    this.buffer.push({
      data,
      emitAt: Date.now() + this.delayMs,
    });
  }

  /** Flush all entries that have passed their emit time. */
  flush(): SpectatorGameData[] {
    const now = Date.now();
    const ready: SpectatorGameData[] = [];
    const remaining: DelayedEntry[] = [];

    for (const entry of this.buffer) {
      if (entry.emitAt <= now) {
        ready.push(entry.data);
      } else {
        remaining.push(entry);
      }
    }

    this.buffer = remaining;
    return ready;
  }

  /** Current buffer size. */
  get size(): number {
    return this.buffer.length;
  }
}

// ─── Batch Aggregator ───────────────────────────────────────────────────────

class BatchAggregator {
  private pendingData: SpectatorGameData[] = [];
  private lastFlushAt: number = 0;
  private batchIntervalMs: number;

  constructor(batchIntervalMs: number) {
    this.batchIntervalMs = batchIntervalMs;
  }

  /** Add data to pending batch. */
  add(data: SpectatorGameData[]): void {
    this.pendingData.push(...data);
  }

  /** Check if enough time has elapsed for a batch flush. */
  shouldFlush(): boolean {
    return Date.now() - this.lastFlushAt >= this.batchIntervalMs;
  }

  /** Flush pending data as a single batch. */
  flush(): SpectatorGameData[] {
    if (this.pendingData.length === 0) return [];
    const batch = this.pendingData;
    this.pendingData = [];
    this.lastFlushAt = Date.now();
    return batch;
  }
}

// ─── SpectatorDataPipeline Class ────────────────────────────────────────────

export class SpectatorDataPipeline {
  private wss: WebSocketServer | null = null;
  private spectators: Map<string, SpectatorClient> = new Map();
  private roomSpectators: Map<string, Set<string>> = new Map(); // roomId → spectator IDs
  private delayBuffers: Map<string, DelayBuffer> = new Map(); // roomId → delay buffer
  private batchAggregators: Map<string, BatchAggregator> = new Map(); // roomId → batch aggregator
  private batchTimers: Map<string, ReturnType<typeof setInterval>> = new Map();
  private totalSpectators: number = 0;
  private peakSpectators: number = 0;
  private roomTotals: Map<string, { packetsSent: number; bytesSent: number }> = new Map();
  private grandTotals: { packetsSent: number; bytesSent: number } = { packetsSent: 0, bytesSent: 0 };

  /**
   * Attach WebSocket server for spectator connections.
   */
  attach(httpServer: Server): void {
    // noServer + roteador compartilhado: o RoomManager (/ws) vive no MESMO
    // httpServer e um listener ws com `{ server }` responde 400 a paths
    // alheios, matando os DOIS handshakes (o do próprio espectador inclusive,
    // pois o listener do RoomManager é registrado primeiro). Detalhes em
    // wsUpgradeRouter.ts.
    this.wss = new WebSocketServer({ noServer: true });
    routeWebSocketUpgrade(httpServer, "/ws/spectator", (req, socket, head) => {
      this.wss!.handleUpgrade(req, socket, head, (ws) => this.wss!.emit("connection", ws, req));
    });

    this.wss.on("connection", (ws: WebSocket, req) => {
      const url = new URL(req.url || "/", `http://${req.headers.host}`);
      const roomId = url.searchParams.get("roomId") || "default";
      const cameraMode = (url.searchParams.get("camera") as SpectatorCameraMode) || "RING_CENTER";

      // Check capacity
      const roomCount = this.roomSpectators.get(roomId)?.size ?? 0;
      if (roomCount >= SpectatorConfig.maxSpectatorsPerRoom || this.totalSpectators >= SpectatorConfig.globalMaxSpectators) {
        ws.close(1013, "Spectator capacity reached");
        return;
      }

      const spectatorId = `spec_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const client: SpectatorClient = {
        id: spectatorId,
        ws,
        cameraMode,
        followPlayerId: null,
        connectedAt: Date.now(),
        roomId,
        bytesSent: 0,
        packetsSent: 0,
      };

      this.spectators.set(spectatorId, client);

      // Add to room
      let roomSet = this.roomSpectators.get(roomId);
      if (!roomSet) {
        roomSet = new Set();
        this.roomSpectators.set(roomId, roomSet);
        // Initialize delay buffer and batch aggregator for room
        this.delayBuffers.set(roomId, new DelayBuffer(SpectatorConfig.delayMs));
        this.batchAggregators.set(roomId, new BatchAggregator(SpectatorConfig.batchIntervalMs));
        this.startBatchTimer(roomId);
      }
      roomSet.add(spectatorId);
      this.totalSpectators++;
      this.peakSpectators = Math.max(this.peakSpectators, this.totalSpectators);

      // Send welcome
      ws.send(JSON.stringify({ type: "SPECTATOR_WELCOME", spectatorId, roomId, cameraMode, delayMs: SpectatorConfig.delayMs }));

      // Handle camera mode changes
      ws.on("message", (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.type === "SET_CAMERA") {
            client.cameraMode = msg.cameraMode || "RING_CENTER";
            client.followPlayerId = msg.followPlayerId || null;
          }
        } catch { /* ignore malformed messages */ }
      });

      ws.on("close", () => this.removeSpectator(spectatorId));

      console.log(`[SpectatorPipeline] ${spectatorId} connected to room ${roomId} (${cameraMode})`);
    });

    console.log("[SpectatorPipeline] WebSocket server attached at /ws/spectator");
  }

  /**
   * Remove a spectator from the pipeline.
   */
  private removeSpectator(spectatorId: string): void {
    const client = this.spectators.get(spectatorId);
    if (!client) return;

    this.spectators.delete(spectatorId);
    const roomSet = this.roomSpectators.get(client.roomId);
    if (roomSet) {
      roomSet.delete(spectatorId);
      if (roomSet.size === 0) {
        this.roomSpectators.delete(client.roomId);
        this.stopBatchTimer(client.roomId);
        this.delayBuffers.delete(client.roomId);
        this.batchAggregators.delete(client.roomId);
        this.roomTotals.delete(client.roomId);
      }
    }
    this.totalSpectators--;
    console.log(`[SpectatorPipeline] ${spectatorId} disconnected`);
  }

  /**
   * Push game data into the delay buffer for a room.
   * Called by the game loop on every tick.
   */
  pushGameData(roomId: string, data: SpectatorGameData): void {
    const buffer = this.delayBuffers.get(roomId);
    if (!buffer) return; // no spectators for this room
    buffer.push(data);
  }

  /**
   * Start the batch timer for a room. Periodically flushes delay buffer
   * and aggregates data before sending to spectators.
   */
  private startBatchTimer(roomId: string): void {
    const timer = setInterval(() => {
      this.processBatch(roomId);
    }, SpectatorConfig.batchIntervalMs);
    this.batchTimers.set(roomId, timer);
  }

  private stopBatchTimer(roomId: string): void {
    const timer = this.batchTimers.get(roomId);
    if (timer) {
      clearInterval(timer);
      this.batchTimers.delete(roomId);
    }
  }

  /**
   * Process a batch: flush delay buffer → aggregate → fan-out.
   */
  private processBatch(roomId: string): void {
    const buffer = this.delayBuffers.get(roomId);
    const aggregator = this.batchAggregators.get(roomId);
    if (!buffer || !aggregator) return;

    // Flush delay buffer (releases data that's aged past the delay)
    const delayed = buffer.flush();
    if (delayed.length === 0) return;

    // Add to batch aggregator
    aggregator.add(delayed);

    // Check if batch interval elapsed
    if (!aggregator.shouldFlush()) return;

    // Flush batch
    const batch = aggregator.flush();
    if (batch.length === 0) return;

    // Compose batch message (take latest snapshot, merge events)
    const latestData = batch[batch.length - 1];
    const allEvents: SpectatorEvent[] = [];
    for (const d of batch) {
      allEvents.push(...d.events);
    }
    // Trim events to max
    const trimmedEvents = allEvents.slice(-SpectatorConfig.maxEventsPerBatch);

    const payload = JSON.stringify({
      type: "SPECTATOR_BATCH",
      roomId,
      data: latestData,
      events: trimmedEvents,
      batchSize: batch.length,
      timestamp: Date.now(),
    });

    // Fan-out to all spectators in this room
    const roomSet = this.roomSpectators.get(roomId);
    if (!roomSet) return;

    const payloadBytes = Buffer.byteLength(payload);
    const roomTotals = this.roomTotals.get(roomId) ?? { packetsSent: 0, bytesSent: 0 };
    const beforePackets = roomTotals.packetsSent;
    const beforeBytes = roomTotals.bytesSent;
    for (const specId of roomSet) {
      const client = this.spectators.get(specId);
      if (!client || client.ws.readyState !== 1) continue;

      // Throttle check
      const bps = client.bytesSent / ((Date.now() - client.connectedAt) / 1000 || 1);
      if (bps > SpectatorConfig.maxBytesPerSecond) continue;

      try {
        client.ws.send(payload);
        client.bytesSent += payloadBytes;
        client.packetsSent++;
        roomTotals.packetsSent++;
        roomTotals.bytesSent += payloadBytes;
      } catch { /* send failed */ }
    }
    this.roomTotals.set(roomId, roomTotals);
    this.grandTotals.packetsSent += roomTotals.packetsSent - beforePackets;
    this.grandTotals.bytesSent += roomTotals.bytesSent - beforeBytes;
  }

  // ─── Query Methods ────────────────────────────────────────────────────────

  getSpectatorCount(roomId?: string): number {
    if (roomId) return this.roomSpectators.get(roomId)?.size ?? 0;
    return this.totalSpectators;
  }

  getSpectators(roomId: string): SpectatorClient[] {
    const roomSet = this.roomSpectators.get(roomId);
    if (!roomSet) return [];
    return Array.from(roomSet)
      .map(id => this.spectators.get(id))
      .filter((s): s is SpectatorClient => !!s);
  }

  getDelayBufferSize(roomId: string): number {
    return this.delayBuffers.get(roomId)?.size ?? 0;
  }

  /** Fase 14 — métricas da transmissão p/ a superfície de administração. */
  getMetrics(): SpectatorPipelineMetrics {
    return {
      totalSpectators: this.totalSpectators,
      peakSpectators: this.peakSpectators,
      rooms: [...this.roomSpectators.entries()].map(([roomId, set]) => ({
        roomId,
        spectators: set.size,
        packetsSent: this.roomTotals.get(roomId)?.packetsSent ?? 0,
        bytesSent: this.roomTotals.get(roomId)?.bytesSent ?? 0,
        delayBufferSize: this.delayBuffers.get(roomId)?.size ?? 0,
      })),
      totals: { packetsSent: this.grandTotals.packetsSent, bytesSent: this.grandTotals.bytesSent },
      limits: {
        delayMs: SpectatorConfig.delayMs,
        maxSpectatorsPerRoom: SpectatorConfig.maxSpectatorsPerRoom,
        globalMaxSpectators: SpectatorConfig.globalMaxSpectators,
        batchIntervalMs: SpectatorConfig.batchIntervalMs,
      },
      now: Date.now(),
    };
  }

  /**
   * Cleanup all resources.
   */
  destroy(): void {
    for (const timer of this.batchTimers.values()) clearInterval(timer);
    this.batchTimers.clear();
    this.spectators.clear();
    this.roomSpectators.clear();
    this.delayBuffers.clear();
    this.batchAggregators.clear();
    this.roomTotals.clear();
    this.wss?.close();
    console.log("[SpectatorPipeline] Destroyed");
  }
}
