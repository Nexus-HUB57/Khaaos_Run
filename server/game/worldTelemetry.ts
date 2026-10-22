import type { WorldId } from "./orchestration";

export const WORLD_CATALOG: Readonly<Record<WorldId, { name: string }>> = {
  CIGKV: { name: "Khaaos Ville" },
  W1: { name: "Barburhen" },
  W2: { name: "Priadus" },
  W3: { name: "Ckesalth" },
  W4: { name: "Arukheea" },
};
export const WORLD_IDS = Object.keys(WORLD_CATALOG) as WorldId[];
export function isWorldId(value: unknown): value is WorldId {
  return typeof value === "string" && Object.hasOwn(WORLD_CATALOG, value);
}

export interface WorldRoomSample {
  status: "LOBBY" | "COUNTDOWN" | "IN_PROGRESS" | "FINISHED";
  connectedPlayers: number;
  maxPlayers: number;
}
export interface QueueTelemetrySample {
  count: number;
  p95WaitSeconds: number | null;
}
export interface WorldTelemetrySnapshot {
  worldId: WorldId;
  name: string;
  operationalState: "running" | "queueing" | "idle";
  occupancy: { current: number; capacity: number; percent: number | null };
  activeRooms: number;
  queueCount: number;
  queueP95Seconds: number | null;
  activeIncidents: null;
  incidentTelemetryAvailable: false;
  configRevision: string | null;
  observedAt: string;
  stale: false;
}

/** Aggregates only live server-owned counters. Unavailable incident telemetry remains null. */
export function aggregateWorldTelemetry(
  worldId: WorldId,
  rooms: readonly WorldRoomSample[],
  queue: QueueTelemetrySample,
  observedAt = new Date(),
): WorldTelemetrySnapshot {
  const activeRooms = rooms.filter((room) => room.status !== "FINISHED");
  const current = activeRooms.reduce((sum, room) => sum + Math.max(0, room.connectedPlayers), 0);
  const capacity = activeRooms.reduce((sum, room) => sum + Math.max(0, room.maxPlayers), 0);
  const queueCount = Math.max(0, queue.count);
  return {
    worldId,
    name: WORLD_CATALOG[worldId].name,
    operationalState: activeRooms.some((room) => room.status === "IN_PROGRESS")
      ? "running"
      : activeRooms.length > 0 ? "running" : queueCount > 0 ? "queueing" : "idle",
    occupancy: {
      current,
      capacity,
      percent: capacity > 0 ? Math.round((current / capacity) * 1000) / 10 : null,
    },
    activeRooms: activeRooms.length,
    queueCount,
    queueP95Seconds: queue.p95WaitSeconds,
    activeIncidents: null,
    incidentTelemetryAvailable: false,
    configRevision: process.env.KHAOS_CONFIG_REVISION ?? process.env.GITHUB_SHA ?? null,
    observedAt: observedAt.toISOString(),
    stale: false,
  };
}
