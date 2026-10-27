// Khaaos Run — Fase 14: pipeline de espectador no SERVIDOR AUTORITATIVO.
// =====================================================================
// Porta JS do SpectatorDataPipeline (trilha TS, server/game/) para o game
// node — é AQUI que o cliente 3D aponta no dev (proxy /ws → :8787) e na
// produção (Dockerfile CMD server/server.js). Mesmas restrições do
// pipeline canônico:
//   - atraso de 10 s anti-ghosting (espectador nunca vira radar de cheat)
//   - 500 espectadores por sala / 5.000 globais
//   - batches de 200 ms (5 Hz) com merge de eventos (teto 20 por lote)
//   - throttle de 64 KB/s por conexão
// Diferença-chave: alimenta-se DIRETO das salas 3D do game node —
// pushRoom(room) pede room.spectatorView() (nomes reais incluídos) apenas
// quando existe espectador na sala (zero custo sem plateia). E expõe
// metrics() consumido pelo /admin/metrics (Command Monitor).
import { WebSocketServer } from 'ws';

export const SPECTATOR_CAMERAS = ['FREECAM', 'FOLLOW_PLAYER', 'OVERHEAD', 'RING_CENTER'];

export const SpectatorConfig = {
  /** Atraso anti-ghosting (ms) antes do espectador receber o estado */
  delayMs: 10_000,
  /** Máximo de espectadores simultâneos por sala */
  maxSpectatorsPerRoom: 500,
  /** Intervalo de agregação dos batches (ms) — 5 Hz */
  batchIntervalMs: 200,
  /** Máximo global de espectadores em todo o node */
  globalMaxSpectators: 5_000,
  /** Teto de eventos por batch (payload limitado) */
  maxEventsPerBatch: 20,
  /** Throttle por espectador (bytes/s) */
  maxBytesPerSecond: 65_536, // 64 KB/s
};

class DelayBuffer {
  constructor(delayMs) { this.delayMs = delayMs; this.buffer = []; }
  push(data) { this.buffer.push({ data, emitAt: Date.now() + this.delayMs }); }
  flush() {
    const now = Date.now();
    const ready = [];
    const remaining = [];
    for (const entry of this.buffer) {
      if (entry.emitAt <= now) ready.push(entry.data); // payload puro, sem wrapper
      else remaining.push(entry);
    }
    this.buffer = remaining;
    return ready;
  }
  get size() { return this.buffer.length; }
}

class BatchAggregator {
  constructor(batchIntervalMs) { this.batchIntervalMs = batchIntervalMs; this.pending = []; this.lastFlushAt = 0; }
  add(items) { this.pending.push(...items); }
  shouldFlush() { return Date.now() - this.lastFlushAt >= this.batchIntervalMs; }
  flush() {
    if (this.pending.length === 0) return [];
    const batch = this.pending;
    this.pending = [];
    this.lastFlushAt = Date.now();
    return batch;
  }
}

export class SpectatorPipeline {
  constructor(config = {}) {
    this.config = { ...SpectatorConfig, ...config };
    this.wss = null;
    this.spectators = new Map();   // spectatorId -> client
    this.rooms = new Map();        // roomId -> { spectators:Set, buffer, aggregator, timer, packetsSent, bytesSent }
    this.totals = { packetsSent: 0, bytesSent: 0 };
    this.peakSpectators = 0;
    this.rejected = 0;             // conexões recusadas por capacidade
    this.counter = 0;
  }

  /** Registra o endpoint /ws/spectator no HTTP server do game node. */
  attach(httpServer) {
    this.wss = new WebSocketServer({ server: httpServer, path: '/ws/spectator', maxPayload: 16 * 1024 });
    this.wss.on('connection', (ws, req) => this.#onConnection(ws, req));
    return this;
  }

  #onConnection(ws, req) {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    const roomId = url.searchParams.get('roomId') || 'default';
    const camera = url.searchParams.get('camera');
    const roomCount = this.rooms.get(roomId)?.spectators.size ?? 0;
    if (roomCount >= this.config.maxSpectatorsPerRoom || this.spectators.size >= this.config.globalMaxSpectators) {
      this.rejected++;
      try { ws.close(1013, 'spectator-capacity'); } catch { /* já fechado */ }
      return;
    }

    const spectatorId = `spec_${Date.now()}_${(++this.counter).toString(36)}`;
    const client = {
      id: spectatorId, ws, roomId,
      cameraMode: SPECTATOR_CAMERAS.includes(camera) ? camera : 'RING_CENTER',
      followPlayerId: null,
      connectedAt: Date.now(), bytesSent: 0, packetsSent: 0,
    };
    this.spectators.set(spectatorId, client);

    let room = this.rooms.get(roomId);
    if (!room) {
      room = {
        spectators: new Set(),
        buffer: new DelayBuffer(this.config.delayMs),
        aggregator: new BatchAggregator(this.config.batchIntervalMs),
        timer: null, packetsSent: 0, bytesSent: 0,
      };
      this.rooms.set(roomId, room);
      room.timer = setInterval(() => this.#processBatch(roomId), this.config.batchIntervalMs);
    }
    room.spectators.add(spectatorId);
    this.peakSpectators = Math.max(this.peakSpectators, this.spectators.size);

    this.#send(client, JSON.stringify({
      type: 'SPECTATOR_WELCOME',
      spectatorId, roomId, cameraMode: client.cameraMode,
      delayMs: this.config.delayMs,
    }));

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg?.type === 'SET_CAMERA') {
          if (SPECTATOR_CAMERAS.includes(msg.cameraMode)) client.cameraMode = msg.cameraMode;
          client.followPlayerId = typeof msg.followPlayerId === 'string' ? msg.followPlayerId : null;
        }
      } catch { /* mensagem inválida nunca derruba o espectador */ }
    });
    ws.on('close', () => this.#remove(spectatorId));
  }

  #remove(spectatorId) {
    const client = this.spectators.get(spectatorId);
    if (!client) return;
    this.spectators.delete(spectatorId);
    const room = this.rooms.get(client.roomId);
    if (room) {
      room.spectators.delete(spectatorId);
      if (room.spectators.size === 0) {
        this.rooms.delete(client.roomId); // última saída encerra timer/buffers
        clearInterval(room.timer);
      }
    }
  }

  #send(client, payload) {
    if (client.ws.readyState !== 1) return false;
    try { client.ws.send(payload); return true; } catch { return false; }
  }

  /**
   * Alimenta o pipeline a partir de uma sala 3D (duck-typed): usa
   * room.spectatorView() — nome real dos jogadores incluído — apenas quando
   * a sala tem espectadores esperando o delay buffer.
   */
  pushRoom(room) {
    const entry = room && room.id ? this.rooms.get(room.id) : null;
    if (!entry) return; // sem plateia: custo zero
    entry.buffer.push(room.spectatorView());
  }

  /** Compatível com a trilha TS: alimenta um roomId arbitrário com payload pronto. */
  pushGameData(roomId, data) {
    const entry = roomId ? this.rooms.get(roomId) : null;
    if (!entry) return;
    entry.buffer.push(data);
  }

  /** Flush do delay buffer → agregador → fan-out com throttle. */
  #processBatch(roomId) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    const delayed = room.buffer.flush();
    if (delayed.length === 0) return;
    room.aggregator.add(delayed);
    if (!room.aggregator.shouldFlush()) return;
    const batch = room.aggregator.flush();
    if (batch.length === 0) return;

    // Mesmo contrato da trilha TS: snapshot MAIS RECENTE + cauda de eventos mesclada.
    const latest = batch[batch.length - 1];
    const events = [];
    for (const d of batch) {
      if (Array.isArray(d?.events)) events.push(...d.events);
    }
    const trimmed = events.slice(-this.config.maxEventsPerBatch);

    const payload = JSON.stringify({
      type: 'SPECTATOR_BATCH',
      roomId,
      data: latest,
      events: trimmed,
      batchSize: batch.length,
      timestamp: Date.now(),
    });
    const payloadBytes = Buffer.byteLength(payload);

    let sent = 0;
    for (const specId of room.spectators) {
      const client = this.spectators.get(specId);
      if (!client) continue;
      const elapsedS = Math.max(1, (Date.now() - client.connectedAt) / 1000);
      if (client.bytesSent / elapsedS > this.config.maxBytesPerSecond) continue; // throttle
      if (this.#send(client, payload)) {
        client.bytesSent += payloadBytes;
        client.packetsSent++;
        sent++;
      }
    }
    if (sent > 0) {
      room.packetsSent += sent;
      room.bytesSent += sent * payloadBytes;
      this.totals.packetsSent += sent;
      this.totals.bytesSent += sent * payloadBytes;
    }
  }

  countFor(roomId) { return this.rooms.get(roomId)?.spectators.size ?? 0; }

  /** Métricas do pipeline — consumidas pelo /admin/metrics (Command Monitor). */
  metrics() {
    return {
      totalSpectators: this.spectators.size,
      peakSpectators: this.peakSpectators,
      rejected: this.rejected,
      rooms: [...this.rooms.entries()].map(([roomId, room]) => ({
        roomId,
        spectators: room.spectators.size,
        packetsSent: room.packetsSent,
        bytesSent: room.bytesSent,
        delayBufferSize: room.buffer.size,
      })),
      totals: { packetsSent: this.totals.packetsSent, bytesSent: this.totals.bytesSent },
      limits: {
        delayMs: this.config.delayMs,
        maxSpectatorsPerRoom: this.config.maxSpectatorsPerRoom,
        globalMaxSpectators: this.config.globalMaxSpectators,
        batchIntervalMs: this.config.batchIntervalMs,
      },
      now: Date.now(),
    };
  }

  destroy() {
    for (const room of this.rooms.values()) clearInterval(room.timer);
    this.rooms.clear();
    for (const client of this.spectators.values()) {
      try { client.ws.close(1001, 'pipeline-shutdown'); } catch { /* já fechado */ }
    }
    this.spectators.clear();
    try { this.wss?.close(); } catch { /* já fechado */ }
    this.wss = null;
  }
}
