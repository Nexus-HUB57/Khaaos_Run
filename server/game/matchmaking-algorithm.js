/**
 * KHAAOS RUN — Skill-Based Matchmaking Algorithm (JavaScript)
 * ============================================================
 * Fila por ELO + janela de rating que cresce com o tempo.
 * Greedy oldest-first + soft-fill após maxWait.
 *
 * Uso:
 *   const mm = new MatchmakingAlgorithm({ onMatch: (players) => {...} });
 *   mm.enqueue({ userId: "a", rating: 1000, mode: "solo" });
 *   mm.tick(); // chamar a cada 2s (ou mm.start())
 */

/** @typedef {"solo" | "duo" | "squad"} QueueMode */

/**
 * @typedef {Object} QueueEntry
 * @property {string} userId
 * @property {string} [displayName]
 * @property {number} rating
 * @property {QueueMode} mode
 * @property {number} enqueuedAt
 * @property {number} currentDelta
 * @property {*} [meta]  // ws, partyId, etc.
 */

/**
 * @typedef {Object} MatchmakingConfig
 * @property {number} minPlayers
 * @property {number} maxPlayers
 * @property {number} initialDelta
 * @property {number} deltaGrowthPerSecond
 * @property {number} maxDelta
 * @property {number} maxWaitMs
 * @property {number} softMinPlayers
 * @property {number} tickIntervalMs
 */

/** @type {MatchmakingConfig} */
const DEFAULT_CONFIG = {
  minPlayers: 2,
  maxPlayers: 50,
  initialDelta: 100,
  deltaGrowthPerSecond: 15,
  maxDelta: 600,
  maxWaitMs: 45_000,
  softMinPlayers: 2,
  tickIntervalMs: 2000,
};

class MatchmakingAlgorithm {
  /**
   * @param {Object} [options]
   * @param {Partial<MatchmakingConfig>} [options.config]
   * @param {(players: QueueEntry[]) => void | Promise<void>} [options.onMatch]
   * @param {(userId: string, event: object) => void} [options.onUpdate]
   */
  constructor(options = {}) {
    /** @type {MatchmakingConfig} */
    this.config = { ...DEFAULT_CONFIG, ...options.config };
    /** @type {Map<string, QueueEntry>} */
    this.queue = new Map();
    this.onMatch = options.onMatch || (() => {});
    this.onUpdate = options.onUpdate || (() => {});
    /** @type {ReturnType<typeof setInterval> | null} */
    this._timer = null;
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  /**
   * Entra (ou reentra) na fila.
   * @param {{ userId: string, rating?: number, mode?: QueueMode, displayName?: string, meta?: * }} player
   */
  enqueue(player) {
    const entry = {
      userId: player.userId,
      displayName: player.displayName || player.userId,
      rating: player.rating ?? 1000,
      mode: player.mode || "solo",
      enqueuedAt: Date.now(),
      currentDelta: this.config.initialDelta,
      meta: player.meta,
    };
    this.queue.set(player.userId, entry);
    this.onUpdate(player.userId, {
      type: "queue_joined",
      position: this.positionOf(player.userId),
      rating: entry.rating,
      mode: entry.mode,
    });
    return entry;
  }

  /** @param {string} userId */
  dequeue(userId) {
    if (!this.queue.has(userId)) return false;
    this.queue.delete(userId);
    this.onUpdate(userId, { type: "queue_left" });
    return true;
  }

  /** @param {string} userId */
  isQueued(userId) {
    return this.queue.has(userId);
  }

  get size() {
    return this.queue.size;
  }

  /** Inicia ticks automáticos */
  start() {
    if (this._timer) return;
    this._timer = setInterval(() => this.tick(), this.config.tickIntervalMs);
  }

  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  // ─── Core algorithm ──────────────────────────────────────────────────────

  /**
   * Um passo do matcher. Pode ser chamado manualmente ou via start().
   * @returns {QueueEntry[][]} lista de matches formados neste tick
   */
  tick() {
    if (this.queue.size === 0) return [];

    const now = Date.now();
    this._growWindows(now);
    this._broadcastUpdates();

    /** @type {QueueEntry[][]} */
    const formed = [];
    /** @type {QueueEntry[]} */
    let remaining = [...this.queue.values()].sort(
      (a, b) => a.enqueuedAt - b.enqueuedAt,
    );

    while (remaining.length > 0) {
      const seed = remaining[0];
      const waitMs = now - seed.enqueuedAt;
      const soft = waitMs >= this.config.maxWaitMs;
      const need = soft ? this.config.softMinPlayers : this.config.minPlayers;

      // Candidatos: mesmo modo + janela mútua de rating
      const candidates = remaining.filter((e) => {
        if (e.mode !== seed.mode) return false;
        const delta = Math.max(seed.currentDelta, e.currentDelta);
        return Math.abs(e.rating - seed.rating) <= delta;
      });

      if (candidates.length < need) {
        // Não dá para formar com esta semente neste tick
        remaining = remaining.filter((e) => e.userId !== seed.userId);
        continue;
      }

      // Preferir ELO mais próximo da semente
      candidates.sort(
        (a, b) =>
          Math.abs(a.rating - seed.rating) - Math.abs(b.rating - seed.rating),
      );

      const matched = candidates.slice(0, this.config.maxPlayers);
      const matchedIds = new Set(matched.map((m) => m.userId));

      // Remover da fila e da lista local
      for (const m of matched) {
        this.queue.delete(m.userId);
      }
      remaining = remaining.filter((e) => !matchedIds.has(e.userId));

      formed.push(matched);
      this._emitMatch(matched);
    }

    return formed;
  }

  // ─── Internals ───────────────────────────────────────────────────────────

  /** @param {number} now */
  _growWindows(now) {
    for (const entry of this.queue.values()) {
      const waitSec = (now - entry.enqueuedAt) / 1000;
      entry.currentDelta = Math.min(
        this.config.maxDelta,
        this.config.initialDelta + waitSec * this.config.deltaGrowthPerSecond,
      );
    }
  }

  _broadcastUpdates() {
    for (const entry of this.queue.values()) {
      this.onUpdate(entry.userId, {
        type: "queue_update",
        position: this.positionOf(entry.userId),
        estimatedWaitSec: this._estimateWait(entry),
        currentDelta: Math.round(entry.currentDelta),
        playersInQueue: this.queue.size,
      });
    }
  }

  /** @param {QueueEntry} entry */
  _estimateWait(entry) {
    const inRange = [...this.queue.values()].filter(
      (o) =>
        o.userId !== entry.userId &&
        o.mode === entry.mode &&
        Math.abs(o.rating - entry.rating) <= entry.currentDelta,
    ).length;
    if (inRange + 1 >= this.config.minPlayers) return 5;
    if (inRange + 1 >= this.config.softMinPlayers) return 15;
    return Math.max(10, 40 - inRange * 5);
  }

  /** @param {string} userId */
  positionOf(userId) {
    const ordered = [...this.queue.values()].sort(
      (a, b) => a.enqueuedAt - b.enqueuedAt,
    );
    const idx = ordered.findIndex((e) => e.userId === userId);
    return idx >= 0 ? idx + 1 : 0;
  }

  /** @param {QueueEntry[]} matched */
  async _emitMatch(matched) {
    try {
      await this.onMatch(matched);
    } catch (err) {
      // Re-enfileira em caso de falha do consumidor
      console.error("[Matchmaking] onMatch failed, re-queuing", err);
      for (const m of matched) {
        this.queue.set(m.userId, m);
      }
    }
  }
}

// ─── Demo / self-test ──────────────────────────────────────────────────────

function demo() {
  console.log("=== Matchmaking Algorithm Demo ===\n");

  const mm = new MatchmakingAlgorithm({
    config: { minPlayers: 2, maxPlayers: 4, initialDelta: 100, maxWaitMs: 45_000 },
    onMatch: (players) => {
      const avg =
        players.reduce((s, p) => s + p.rating, 0) / players.length;
      console.log(
        `✓ MATCH (${players.length}p, avg ELO ${avg.toFixed(0)}):`,
        players.map((p) => `${p.displayName}(${p.rating})`).join(", "),
      );
    },
    onUpdate: () => {},
  });

  mm.enqueue({ userId: "1", displayName: "Alpha", rating: 1000, mode: "solo" });
  mm.enqueue({ userId: "2", displayName: "Bravo", rating: 1080, mode: "solo" });
  mm.enqueue({ userId: "3", displayName: "Charlie", rating: 1500, mode: "solo" });
  mm.enqueue({ userId: "4", displayName: "Delta", rating: 1020, mode: "solo" });
  mm.enqueue({ userId: "5", displayName: "Echo", rating: 1490, mode: "solo" });

  console.log(`Fila: ${mm.size} jogadores\n`);
  console.log("--- Tick 1 (janela ainda apertada) ---");
  mm.tick();
  console.log(`Restam na fila: ${mm.size}`);

  // Simula espera longa para Charlie/Echo (força soft window via delta)
  for (const e of mm.queue.values()) {
    e.enqueuedAt = Date.now() - 60_000; // 60s atrás
  }
  console.log("\n--- Tick 2 (após 60s simulados, janela larga) ---");
  mm.tick();
  console.log(`Restam na fila: ${mm.size}`);
}

// ESM export
export { MatchmakingAlgorithm, DEFAULT_CONFIG };

// Run demo: node server/game/matchmaking-algorithm.js
const isDirect = process.argv[1] && process.argv[1].includes("matchmaking-algorithm");
if (isDirect) demo();
