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
export interface NetworkLatencySample {
  rttMs: number;
  observedAt: string;
}
export interface WorldTelemetrySnapshot {
  worldId: WorldId;
  name: string;
  operationalState: "running" | "queueing" | "idle";
  occupancy: { current: number; capacity: number; percent: number | null };
  activeRooms: number;
  queueCount: number;
  queueP95Seconds: number | null;
  networkLatencyP95Ms: number | null;
  networkLatencySampleCount: number;
  networkLatencyTelemetryAvailable: boolean;
  networkLatencyObservedAt: string | null;
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
  networkLatencySamples: readonly NetworkLatencySample[] = [],
): WorldTelemetrySnapshot {
  const activeRooms = rooms.filter((room) => room.status !== "FINISHED");
  const current = activeRooms.reduce((sum, room) => sum + Math.max(0, room.connectedPlayers), 0);
  const capacity = activeRooms.reduce((sum, room) => sum + Math.max(0, room.maxPlayers), 0);
  const queueCount = Math.max(0, queue.count);
  const validLatencySamples = networkLatencySamples
    .filter((sample) => Number.isFinite(sample.rttMs) && sample.rttMs >= 0 && Number.isFinite(Date.parse(sample.observedAt)))
    .sort((left, right) => left.rttMs - right.rttMs);
  const latencyP95Index = Math.max(0, Math.ceil(validLatencySamples.length * 0.95) - 1);
  const latestLatencySample = validLatencySamples.reduce<NetworkLatencySample | null>((latest, sample) =>
    !latest || Date.parse(sample.observedAt) > Date.parse(latest.observedAt) ? sample : latest, null);
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
    networkLatencyP95Ms: validLatencySamples.length ? Math.round(validLatencySamples[latencyP95Index].rttMs * 10) / 10 : null,
    networkLatencySampleCount: validLatencySamples.length,
    networkLatencyTelemetryAvailable: validLatencySamples.length > 0,
    networkLatencyObservedAt: latestLatencySample?.observedAt ?? null,
    activeIncidents: null,
    incidentTelemetryAvailable: false,
    configRevision: process.env.KHAOS_CONFIG_REVISION ?? process.env.GITHUB_SHA ?? null,
    observedAt: observedAt.toISOString(),
    stale: false,
  };
}
