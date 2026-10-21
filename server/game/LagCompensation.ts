/**
 * KHAAOS RUN — Lag Compensation (Rewind & Replay)
 * ================================================
 * Classic server-rewind approach used by competitive shooters:
 *
 * 1. Client sends attack with clientTimestamp (when they pressed fire).
 * 2. Server estimates RTT/2 and rewinds target position history to that moment.
 * 3. Hit test is performed against the rewound position.
 * 4. If valid, damage is applied at present time.
 *
 * Position history is a fixed-size ring buffer per player (default ~1s @ 20 Hz).
 *
 * References conceptually: Source engine lag compensation, Quake world.
 */

export interface PosSample {
  t: number; // epoch ms (server receive time)
  x: number;
  y: number;
}

const DEFAULT_HISTORY_MS = 1000;
const DEFAULT_MAX_REWIND_MS = 250; // clamp client claim
const DEFAULT_SAMPLE_HZ = 20;

export class PositionHistory {
  private samples: PosSample[] = [];
  private maxMs: number;

  constructor(maxMs = DEFAULT_HISTORY_MS) {
    this.maxMs = maxMs;
  }

  push(x: number, y: number, t = Date.now()) {
    this.samples.push({ t, x, y });
    const cutoff = t - this.maxMs;
    while (this.samples.length > 0 && this.samples[0].t < cutoff) {
      this.samples.shift();
    }
    // Hard cap samples (~20/s * 1.2s)
    if (this.samples.length > 30) {
      this.samples.splice(0, this.samples.length - 30);
    }
  }

  /** Interpolated position at time t (clamped to history bounds). */
  at(t: number): { x: number; y: number } | null {
    if (this.samples.length === 0) return null;
    if (this.samples.length === 1) return { x: this.samples[0].x, y: this.samples[0].y };

    // Before first / after last
    if (t <= this.samples[0].t) {
      return { x: this.samples[0].x, y: this.samples[0].y };
    }
    const last = this.samples[this.samples.length - 1];
    if (t >= last.t) {
      return { x: last.x, y: last.y };
    }

    for (let i = 0; i < this.samples.length - 1; i++) {
      const a = this.samples[i];
      const b = this.samples[i + 1];
      if (t >= a.t && t <= b.t) {
        const u = (t - a.t) / Math.max(1, b.t - a.t);
        return {
          x: a.x + (b.x - a.x) * u,
          y: a.y + (b.y - a.y) * u,
        };
      }
    }
    return { x: last.x, y: last.y };
  }

  clear() {
    this.samples = [];
  }
}

export interface LagCompConfig {
  maxRewindMs: number;
  defaultLatencyMs: number; // used when client doesn't send timestamp
}

export const DEFAULT_LAG_CONFIG: LagCompConfig = {
  maxRewindMs: DEFAULT_MAX_REWIND_MS,
  defaultLatencyMs: 50,
};

/**
 * Compute the server time to rewind to for a hit validation.
 * clientTimestamp is the client's local time of the shot (optional).
 * serverReceiveTime is when the packet arrived.
 * estimatedOneWayMs is half-RTT estimate (optional).
 */
export function computeRewindTime(
  serverReceiveTime: number,
  clientTimestamp?: number,
  estimatedOneWayMs?: number,
  config: LagCompConfig = DEFAULT_LAG_CONFIG,
): number {
  let rewindMs: number;

  if (clientTimestamp != null && Number.isFinite(clientTimestamp)) {
    // How far in the past the client claims the shot was
    rewindMs = serverReceiveTime - clientTimestamp;
  } else {
    rewindMs = estimatedOneWayMs ?? config.defaultLatencyMs;
  }

  // Clamp: never rewind more than max, never into the future
  rewindMs = Math.max(0, Math.min(config.maxRewindMs, rewindMs));
  return serverReceiveTime - rewindMs;
}

/**
 * Hit test with lag compensation.
 * Returns true if the rewound target was within range of the attacker's
 * position at (approximately) the same rewind time.
 */
export function lagCompensatedHit(params: {
  attackerHistory: PositionHistory;
  targetHistory: PositionHistory;
  attackerCurrent: { x: number; y: number };
  targetCurrent: { x: number; y: number };
  range: number;
  serverReceiveTime: number;
  clientTimestamp?: number;
  estimatedOneWayMs?: number;
  config?: LagCompConfig;
}): { hit: boolean; rewindMs: number; targetPos: { x: number; y: number }; attackerPos: { x: number; y: number } } {
  const config = params.config ?? DEFAULT_LAG_CONFIG;
  const rewindTime = computeRewindTime(
    params.serverReceiveTime,
    params.clientTimestamp,
    params.estimatedOneWayMs,
    config,
  );
  const rewindMs = params.serverReceiveTime - rewindTime;

  const targetPos =
    params.targetHistory.at(rewindTime) ?? params.targetCurrent;
  // Attacker position: prefer current (they are shooting "now" from their view)
  // but slight rewind is also fine for consistency
  const attackerPos =
    params.attackerHistory.at(rewindTime) ?? params.attackerCurrent;

  const dx = attackerPos.x - targetPos.x;
  const dy = attackerPos.y - targetPos.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  return {
    hit: dist <= params.range,
    rewindMs,
    targetPos,
    attackerPos,
  };
}
