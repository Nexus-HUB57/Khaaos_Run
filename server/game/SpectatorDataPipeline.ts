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
  /** Fase 24 — último relatório sanitizado do diretor da transmissão. */
  director?: SpectatorDirectorReport & { reportedAt: number };
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
  /** Fase 24 — agregado do diretor da transmissão (client→server). */
  director: SpectatorDirectorAggregate;
  now: number;
}

// ─── Fase 24 — Métricas do diretor (client→server→/admin) ──────────────────

/** Motivos canônicos de corte do diretor automático (Fase 19). */
export const DIRECTOR_CUT_REASONS = ["hazard-start", "target-lost", "hazard-escalation"] as const;
/** Hazards canônicos dos mundos (mesma gramática de WORLD_HAZARD_INFO). */
export const DIRECTOR_HAZARDS = ["tsunami", "lava", "gravity", "acid"] as const;

export type DirectorCutReason = (typeof DIRECTOR_CUT_REASONS)[number];
export type DirectorHazard = (typeof DIRECTOR_HAZARDS)[number];

/** Relatório do diretor JÁ sanitizado (payload do cliente nunca é confiável).
 *  Fase 26 — `tuning`: afinação vigente (margem/pesos calibrados no cliente). */
export interface SpectatorDirectorReport {
  enabled: boolean;
  activeHazard: DirectorHazard | null;
  cuts: { total: number; byReason: Partial<Record<DirectorCutReason, number>>; byHazard: Partial<Record<DirectorHazard, number>> };
  manual: { followSelects: number; cycles: number };
  toggles: { on: number; off: number };
  tuning: DirectorTuningReport;
}

/** Sinais de perigo canônicos (mesma gramática de DANGER_WEIGHTS do cliente). */
export const DIRECTOR_WEIGHT_KEYS = ["knocked", "hazardDamage", "anchorZone", "outsideRing", "recentDamage", "lowHealth"] as const;
export type DirectorWeightKey = (typeof DIRECTOR_WEIGHT_KEYS)[number];

/** Afinação do diretor (margem de re-corte + pesos de perigo) — estado, não
 *  contador: no agregado vale LAST-REPORT-WINS (a última plateia a falar). */
export interface DirectorTuningReport {
  margin: number;
  weights: Partial<Record<DirectorWeightKey, number>>;
}

/** Agregado consumido pelo /admin: soma dos relatórios das conexões vivas.
 *  Fase 26 — `tuning` = último relatório com afinação (estado, não soma). */
export interface SpectatorDirectorAggregate {
  reporting: number;
  enabled: number;
  cuts: { total: number; byReason: Partial<Record<DirectorCutReason, number>>; byHazard: Partial<Record<DirectorHazard, number>> };
  manual: { followSelects: number; cycles: number };
  toggles: { on: number; off: number };
  tuning: DirectorTuningReport | null;
}

const DIRECTOR_METRIC_CAP = 1_000_000;

/** Sanitiza o relatório DIRECTOR_METRICS (whitelist de vocabulário + clamp
 *  numérico) — entrada bruta do WS, disponível a qualquer cliente. */
export function sanitizeDirectorReport(raw: unknown): SpectatorDirectorReport {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
  const cuts = (obj.cuts && typeof obj.cuts === "object" ? obj.cuts : {}) as Record<string, any>;
  const clamp = (v: unknown): number =>
    Math.min(DIRECTOR_METRIC_CAP, Math.max(0, Math.floor(Number(v) || 0)));
  const byKey = (src: unknown, keys: readonly string[]): Record<string, number> => {
    const out: Record<string, number> = {};
    if (!src || typeof src !== "object") return out;
    const rec = src as Record<string, unknown>;
    for (const k of keys) if (rec[k] != null) out[k] = clamp(rec[k]);
    return out;
  };
  return {
    enabled: !!obj.enabled,
    activeHazard: (DIRECTOR_HAZARDS as readonly string[]).includes(obj.activeHazard)
      ? (obj.activeHazard as DirectorHazard)
      : null,
    cuts: {
      total: clamp(cuts.total),
      byReason: byKey(cuts.byReason, DIRECTOR_CUT_REASONS),
      byHazard: byKey(cuts.byHazard, DIRECTOR_HAZARDS),
    },
    manual: {
      followSelects: clamp(obj.manual?.followSelects),
      cycles: clamp(obj.manual?.cycles),
    },
    toggles: {
      on: clamp(obj.toggles?.on),
      off: clamp(obj.toggles?.off),
    },
    tuning: sanitizeDirectorTuning(obj.tuning), // Fase 26 — whitelist própria
  };
}

/** Sanitiza a afinação do diretor (Fase 26): margem inteira clampada + pesos
 *  só do vocabulário canônico; lixo/hostil vira tuning zerado (nunca lança). */
function sanitizeDirectorTuning(raw: unknown): DirectorTuningReport {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;
  const clamp = (v: unknown): number =>
    Math.min(DIRECTOR_METRIC_CAP, Math.max(0, Math.floor(Number(v) || 0)));
  const weights: Partial<Record<DirectorWeightKey, number>> = {};
  const src = obj.weights && typeof obj.weights === "object" ? (obj.weights as Record<string, unknown>) : null;
  if (src) {
    for (const k of DIRECTOR_WEIGHT_KEYS) if (src[k] != null) weights[k] = clamp(src[k]);
  }
  return { margin: clamp(obj.margin), weights };
}

/** Soma relatórios JÁ sanitizados — agregado p/ o /admin (Command Monitor).
 *  `reporting` = quantos espectadores enviaram dado; `enabled` = diretor ON. */
export function aggregateDirectorReports(reports: (SpectatorDirectorReport | null | undefined)[] | null | undefined): SpectatorDirectorAggregate {
  const out: SpectatorDirectorAggregate = {
    reporting: 0,
    enabled: 0,
    cuts: { total: 0, byReason: {}, byHazard: {} },
    manual: { followSelects: 0, cycles: 0 },
    toggles: { on: 0, off: 0 },
    tuning: null,
  };
  for (const r of reports ?? []) {
    if (!r) continue;
    out.reporting++;
    if (r.enabled) out.enabled++;
    out.cuts.total += r.cuts?.total ?? 0;
    for (const [k, v] of Object.entries(r.cuts?.byReason ?? {})) out.cuts.byReason[k as DirectorCutReason] = (out.cuts.byReason[k as DirectorCutReason] ?? 0) + (v ?? 0);
    for (const [k, v] of Object.entries(r.cuts?.byHazard ?? {})) out.cuts.byHazard[k as DirectorHazard] = (out.cuts.byHazard[k as DirectorHazard] ?? 0) + (v ?? 0);
    out.manual.followSelects += r.manual?.followSelects ?? 0;
    out.manual.cycles += r.manual?.cycles ?? 0;
    out.toggles.on += r.toggles?.on ?? 0;
    out.toggles.off += r.toggles?.off ?? 0;
    // Fase 26 — afinação é ESTADO (margem/pesos vigentes): last report wins
    if (r.tuning) out.tuning = { margin: r.tuning.margin, weights: { ...r.tuning.weights } };
  }
  return out;
}

// ─── Fase 39 — Calibração POPULACIONAL do diretor (servidor → clientes) ────
// Port TS canônico do cérebro puro do diretor (src/game3d/directorCalibration.js
// na trilha JS): mesmas bandas, mesmos limiares, mesmas 6 regras — paridade
// JS↔TS testada byte a byte (tests/integration/spectator-director-metrics).
// O SERVIDOR agrega os relatórios de TODAS as conexões vivas e recalibra a
// afinação GLOBAL; frames DIRECTOR_TUNING difundem o resultado p/ a plateia.

/** Pesos de perigo (Fase 19) — a hierarquia knocked > hazardDamage >
 *  anchorZone > outsideRing > recentDamage > lowHealth nunca inverte. */
export const DANGER_WEIGHTS = Object.freeze({
  knocked: 40,
  hazardDamage: 35,
  anchorZone: 30,
  outsideRing: 20,
  recentDamage: 15,
  lowHealth: 10,
}) as Readonly<Record<DirectorWeightKey, number>>;

export const LOW_HEALTH_THRESHOLD = 30;

/** Margem de re-corte padrão (Fase 19). */
export const AUTO_RETARGET_MARGIN = 25;

/** Bandas de calibração (Fase 26) — clamp + passo por sinal. */
export const DIRECTOR_TUNING_LIMITS = Object.freeze({
  margin: Object.freeze({ min: 10, max: 45, step: 5 }),
  weights: Object.freeze({
    knocked: Object.freeze({ min: 30, max: 55, step: 3 }),
    hazardDamage: Object.freeze({ min: 25, max: 45, step: 3 }),
    anchorZone: Object.freeze({ min: 20, max: 40, step: 2 }),
    outsideRing: Object.freeze({ min: 12, max: 30, step: 2 }),
    recentDamage: Object.freeze({ min: 8, max: 24, step: 2 }),
    lowHealth: Object.freeze({ min: 5, max: 16, step: 1 }),
  }),
}) as Readonly<{
  margin: Readonly<{ min: number; max: number; step: number }>;
  weights: Readonly<Record<DirectorWeightKey, Readonly<{ min: number; max: number; step: number }>>>;
}>;

export const CALIBRATION_THRESHOLDS = Object.freeze({
  minCutsSample: 8,
  escalationHigh: 0.45,
  escalationLow: 0.15,
  manualPressureHigh: 1.2,
  fatigueOffDominance: 2,
  manualPressureLow: 0.6,
});

export interface DirectorTuning {
  margin: number;
  weights: Record<DirectorWeightKey, number>;
}

const clampInt = (v: unknown, min: number, max: number): number =>
  Math.min(max, Math.max(min, Math.round(Number.isFinite(v as number) ? (v as number) : min)));

/** Calibra margem/pesos a partir das métricas REAIS (Fase 26 — port TS byte a
 *  byte do calibrateDirector JS; PURO e determinístico). */
export function calibrateDirector(
  metrics: { cuts?: { total?: number; byReason?: Record<string, number> }; manual?: { followSelects?: number; cycles?: number }; toggles?: { on?: number; off?: number } } | null | undefined,
  current: { margin?: number; weights?: Partial<Record<DirectorWeightKey, number>> } | null | undefined,
  thresholds: typeof CALIBRATION_THRESHOLDS = CALIBRATION_THRESHOLDS,
): { margin: number; weights: Record<DirectorWeightKey, number>; actions: string[] } {
  const L = DIRECTOR_TUNING_LIMITS;
  const baseWeights: Record<DirectorWeightKey, number> = { ...DANGER_WEIGHTS, ...(current?.weights ?? {}) } as Record<DirectorWeightKey, number>;
  const out: { margin: number; weights: Record<DirectorWeightKey, number>; actions: string[] } = {
    margin: clampInt(current?.margin ?? AUTO_RETARGET_MARGIN, L.margin.min, L.margin.max),
    weights: {} as Record<DirectorWeightKey, number>,
    actions: [],
  };
  for (const k of Object.keys(L.weights) as DirectorWeightKey[]) out.weights[k] = clampInt(baseWeights[k], L.weights[k].min, L.weights[k].max);

  const total = Math.max(0, Math.floor(metrics?.cuts?.total ?? 0));
  if (total < thresholds.minCutsSample) return out; // amostra insuficiente — nada muda

  const byReason = metrics?.cuts?.byReason ?? {};
  const escalations = Math.max(0, Math.floor(byReason["hazard-escalation"] ?? 0));
  const escalationRate = escalations / total;
  const manualSelects = Math.max(0, Math.floor(metrics?.manual?.followSelects ?? 0));
  const manualCycles = Math.max(0, Math.floor(metrics?.manual?.cycles ?? 0));
  const manualTotal = manualSelects + manualCycles;
  const manualPressure = manualTotal / total;
  const togglesOn = Math.max(0, Math.floor(metrics?.toggles?.on ?? 0));
  const togglesOff = Math.max(0, Math.floor(metrics?.toggles?.off ?? 0));

  const bump = (key: DirectorWeightKey, dir: 1 | -1): void => {
    const band = L.weights[key];
    const next = clampInt(out.weights[key] + dir * band.step, band.min, band.max);
    if (next !== out.weights[key]) out.weights[key] = next;
  };
  const moveMargin = (dir: 1 | -1, action: string): void => {
    const next = clampInt(out.margin + dir * L.margin.step, L.margin.min, L.margin.max);
    if (next !== out.margin) { out.margin = next; out.actions.push(action); }
  };

  // 2. TWITCHY — diretor troca de alvo demais dentro do mesmo hazard
  if (escalationRate >= thresholds.escalationHigh) moveMargin(1, "margin-up:twitchy");
  // 3. DURO DEMAIS — plateia caça drama que o diretor não mostra
  else if (escalationRate <= thresholds.escalationLow && manualTotal > 0) moveMargin(-1, "margin-down:starved");
  // 4. PLATEIA ESCRAVA — intervenções manuais dominam os cortes
  if (manualPressure > thresholds.manualPressureHigh) moveMargin(-1, "margin-down:manual-pressure");
  // 5. FADIGA — AUTO desligado dominou: menos cortes, só drama forte
  if (togglesOff >= thresholds.fatigueOffDominance && togglesOff >= togglesOn * thresholds.fatigueOffDominance) {
    moveMargin(1, "margin-up:fatigue");
    bump("recentDamage", -1); out.actions.push("weight-down:recentDamage");
    bump("lowHealth", -1); out.actions.push("weight-down:lowHealth");
  }
  // 6. REVERSÃO À MÉDIA — recepção boa: volta um passo p/ o padrão da Fase 19
  if (
    escalationRate > thresholds.escalationLow && escalationRate < thresholds.escalationHigh
    && manualPressure < thresholds.manualPressureLow && togglesOn >= togglesOff
  ) {
    const target = AUTO_RETARGET_MARGIN;
    if (out.margin !== target) {
      const dir = target > out.margin ? 1 : -1;
      const next = clampInt(out.margin + dir * L.margin.step, L.margin.min, L.margin.max);
      const snapped = dir > 0 ? Math.min(next, target) : Math.max(next, target);
      if (snapped !== out.margin) { out.margin = snapped; out.actions.push("margin-revert:healthy"); }
    }
  }
  return out;
}

/** Sanitiza o frame DIRECTOR_TUNING (Fase 39) DEFENSIVAMENTE: margem e os 6
 *  pesos canônicos obrigatórios, bandas clampadas, hierarquia NUNCA invertida.
 *  PURO; null p/ frames inválidos (cliente ignora — afinação local fica). */
export function sanitizePopulationTuning(raw: unknown): DirectorTuning | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (!Number.isFinite(obj.margin as number)) return null; // contrato: margem obrigatória
  if (!obj.weights || typeof obj.weights !== "object") return null;
  const src = obj.weights as Record<string, unknown>;
  const L = DIRECTOR_TUNING_LIMITS;
  const margin = clampInt(obj.margin, L.margin.min, L.margin.max);
  const weights = {} as Record<DirectorWeightKey, number>;
  let prev = Infinity; // hierarquia: cada peso estritamente ABAIXO do anterior
  for (const k of Object.keys(L.weights) as DirectorWeightKey[]) {
    const v = src[k];
    if (!Number.isFinite(v as number)) return null; // contrato: os 6 sinais presentes
    const band = L.weights[k];
    const clamped = Math.min(band.max, Math.max(band.min, Math.round(v as number)));
    const w = Math.max(band.min, Math.min(clamped, prev - 1));
    weights[k] = w;
    prev = w;
  }
  return { margin, weights };
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

  /** Fase 39 — intervalo da calibração POPULACIONAL do diretor (ms): o
   *  agregado das métricas reais de todas as conexões recalibra a afinação
   *  global; mudanças são difundidas em frames DIRECTOR_TUNING. 0 desliga. */
  calibrationIntervalMs: 15_000,
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
  // Fase 39 — calibração POPULACIONAL do diretor (afinação GLOBAL difundida)
  private directorTuning: DirectorTuning | null = null;
  private directorTuningAt: number = 0;
  private directorTuningActions: string[] = [];
  private calibrationTimer: ReturnType<typeof setInterval> | null = null;

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
    this.startCalibration(); // Fase 39 — heartbeat da calibração populacional
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
          } else if (msg.type === "DIRECTOR_METRICS") {
            // Fase 24 — relatório do diretor da transmissão (sanitizado;
            // last report wins por conexão — a desconexão remove a
            // contribuição do agregado automaticamente).
            client.director = { ...sanitizeDirectorReport(msg.metrics), reportedAt: Date.now() };
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

  /** Fase 24 — agregado do diretor sobre as conexões vivas (last report wins). */
  private directorAggregates(): SpectatorDirectorAggregate {
    return aggregateDirectorReports(
      [...this.spectators.values()].map((c) => c.director),
    );
  }

  // ─── Fase 39 — calibração POPULACIONAL (servidor → clientes) ──────────────

  startCalibration(): void {
    this.stopCalibration();
    const ms = SpectatorConfig.calibrationIntervalMs;
    if (!(ms > 0)) return; // 0 desliga (testes)
    this.calibrationTimer = setInterval(() => this.calibrationTick(), ms);
    if (this.calibrationTimer?.unref) this.calibrationTimer.unref(); // nunca segura o processo
  }

  stopCalibration(): void {
    if (this.calibrationTimer) { clearInterval(this.calibrationTimer); this.calibrationTimer = null; }
  }

  /** Agrega os relatórios vivos e, quando a afinação global MUDA, difunde
   *  DIRECTOR_TUNING para TODA a plateia (mesmas regras Fase 26 sobre o
   *  AGREGADO; tick sem mudança = zero tráfego; decisão PURA). */
  calibrationTick(): void {
    if (this.spectators.size === 0) return;
    const aggregate = this.directorAggregates();
    if (!aggregate.reporting) return;
    if (aggregate.cuts.total < CALIBRATION_THRESHOLDS.minCutsSample) return; // amostra insuficiente
    const base = this.directorTuning ?? { margin: AUTO_RETARGET_MARGIN, weights: { ...DANGER_WEIGHTS } };
    const tuned = calibrateDirector(aggregate, base);
    const changed = !this.directorTuning
      || tuned.margin !== this.directorTuning.margin
      || JSON.stringify(tuned.weights) !== JSON.stringify(this.directorTuning.weights);
    if (!changed) return;
    this.directorTuning = { margin: tuned.margin, weights: tuned.weights };
    this.directorTuningAt = Date.now();
    this.directorTuningActions = [...tuned.actions];
    const frame = JSON.stringify({
      type: "DIRECTOR_TUNING",
      tuning: this.directorTuning,
      source: "population",
      sampleCuts: aggregate.cuts.total,
      actions: this.directorTuningActions,
      calibratedAt: this.directorTuningAt,
    });
    for (const client of this.spectators.values()) {
      try { client.ws.send(frame); } catch { /* socket morrendo */ }
    }
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
      director: {
        ...this.directorAggregates(), // Fase 24 — métricas do diretor
        // Fase 39 — afinação GLOBAL calibrada com as estatísticas REAIS da
        // população inteira do node (o que TODOS os clientes estão adotando).
        globalTuning: this.directorTuning,
        globalTuningAt: this.directorTuningAt || undefined,
        globalTuningActions: [...this.directorTuningActions],
      } as SpectatorDirectorAggregate,
      now: Date.now(),
    };
  }

  /**
   * Cleanup all resources.
   */
  destroy(): void {
    this.stopCalibration(); // Fase 39 — encerra o heartbeat da calibração
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
