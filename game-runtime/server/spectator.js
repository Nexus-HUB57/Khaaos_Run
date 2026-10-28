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

/** Path canônico do endpoint WS da transmissão (roteamento de upgrade). */
export const SPECTATOR_WS_PATH = '/ws/spectator';

// ─── Fase 24 — métricas do DIRETOR (client→server→/admin) ───────────────────
// O cliente reporta o que o diretor FEZ na transmissão (cortes por motivo/
// hazard, reservas manuais da navegação, liga/desliga) em frames
// DIRECTOR_METRICS. O payload do cliente NUNCA é confiável: whitelist de
// vocabulário + clamp numérico antes de qualquer agregação/exibição.
export const DIRECTOR_CUT_REASONS = ['hazard-start', 'target-lost', 'hazard-escalation'];
export const DIRECTOR_HAZARDS = ['tsunami', 'lava', 'gravity', 'acid'];
const DIRECTOR_METRIC_CAP = 1_000_000;

/** Sanitiza o relatório DIRECTOR_METRICS (campos desconhecidos descartados,
 *  números clampados a [0, 1e6]) — entrada bruta do WS. */
export function sanitizeDirectorReport(raw) {
  const clamp = (v) => Math.min(DIRECTOR_METRIC_CAP, Math.max(0, Math.floor(Number(v) || 0)));
  const byKey = (src, keys) => {
    const out = {};
    if (!src || typeof src !== 'object') return out;
    for (const k of keys) if (src[k] != null) out[k] = clamp(src[k]);
    return out;
  };
  const obj = raw && typeof raw === 'object' ? raw : {};
  const cuts = obj.cuts && typeof obj.cuts === 'object' ? obj.cuts : {};
  return {
    enabled: !!obj.enabled,
    activeHazard: DIRECTOR_HAZARDS.includes(obj.activeHazard) ? obj.activeHazard : null,
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
  };
}

/** Soma relatórios JÁ sanitizados — agregado consumido pelo /admin (Command
 *  Monitor). `reporting` = quantos espectadores enviaram dado; `enabled` =
 *  quantos com o diretor ligado. */
export function aggregateDirectorReports(reports) {
  const out = {
    reporting: 0, enabled: 0,
    cuts: { total: 0, byReason: {}, byHazard: {} },
    manual: { followSelects: 0, cycles: 0 },
    toggles: { on: 0, off: 0 },
  };
  for (const r of reports ?? []) {
    if (!r) continue;
    out.reporting++;
    if (r.enabled) out.enabled++;
    out.cuts.total += r.cuts?.total ?? 0;
    for (const k of Object.keys(r.cuts?.byReason ?? {})) out.cuts.byReason[k] = (out.cuts.byReason[k] ?? 0) + r.cuts.byReason[k];
    for (const k of Object.keys(r.cuts?.byHazard ?? {})) out.cuts.byHazard[k] = (out.cuts.byHazard[k] ?? 0) + r.cuts.byHazard[k];
    out.manual.followSelects += r.manual?.followSelects ?? 0;
    out.manual.cycles += r.manual?.cycles ?? 0;
    out.toggles.on += r.toggles?.on ?? 0;
    out.toggles.off += r.toggles?.off ?? 0;
  }
  return out;
}

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

  /**
   * Registra o endpoint /ws/spectator no HTTP server do game node.
   *
   * O WSS roda em modo noServer e o roteamento do upgrade é feito aqui de
   * forma SEGURA: com `{ server }` direto, o ws≥8 entrega TODOS os eventos
   * 'upgrade' a este WSS — inclusive os do jogo (/ws) — e ele aborta com 400
   * os paths que não são seus DEPOIS de outro WSS já ter escrito o 101 no
   * mesmo socket. O cliente, já em modo de frames, lê "HTTP/1.1 400..." como
   * frame (primeiro byte 0x48 seta RSV1) e cai com WS_ERR_UNEXPECTED_RSV_1.
   *
   * `autoRoute` (default) registra um listener que reivindica APENAS o
   * próprio path e NÃO toca em sockets de outros endpoints. Passe
   * `{ autoRoute: false }` quando o http server já tem um roteador central
   * (server.js) que despacha /ws e /ws/spectator.
   */
  attach(httpServer, { autoRoute = true } = {}) {
    this.wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
    this.wss.on('connection', (ws, req) => this.#onConnection(ws, req));
    if (httpServer && autoRoute) {
      this._httpServer = httpServer;
      this._upgradeListener = (req, socket, head) => {
        let pathname = '/';
        try { pathname = new URL(req.url || '/', 'ws://localhost').pathname; } catch { socket.destroy(); return; }
        if (pathname === SPECTATOR_WS_PATH) this.handleUpgrade(req, socket, head);
        // Outros paths: intocados — o WSS dono (ex.: /ws do jogo) trata.
      };
      httpServer.on('upgrade', this._upgradeListener);
    }
    return this;
  }

  /** Entrega ao WSS interno um upgrade já classificado como /ws/spectator. */
  handleUpgrade(req, socket, head) {
    if (!this.wss) { socket.destroy(); return; }
    this.wss.handleUpgrade(req, socket, head, this.wss.emit.bind(this.wss, 'connection'));
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
        } else if (msg?.type === 'DIRECTOR_METRICS') {
          // Fase 24 — relatório do diretor da transmissão (sanitizado; cliente
          // não-confiável). Último relatório por conexão — a desconexão remove
          // a contribuição do agregado automaticamente.
          client.director = sanitizeDirectorReport(msg.metrics);
          client.director.reportedAt = Date.now();
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

  /** Fase 24 — agregado do diretor sobre as conexões vivas (last report wins). */
  #directorAggregates() {
    return aggregateDirectorReports(
      [...this.spectators.values()].map((c) => c.director).filter(Boolean),
    );
  }

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
      director: this.#directorAggregates(), // Fase 24 — métricas do diretor
      now: Date.now(),
    };
  }

  destroy() {
    if (this._httpServer && this._upgradeListener) {
      try { this._httpServer.off('upgrade', this._upgradeListener); } catch { /* já removido */ }
    }
    this._httpServer = null;
    this._upgradeListener = null;
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
