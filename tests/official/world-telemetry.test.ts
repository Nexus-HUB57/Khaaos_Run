import assert from "node:assert/strict";
import { test } from "node:test";
import { aggregateWorldTelemetry } from "../../server/game/worldTelemetry.ts";
import { MatchmakingService } from "../../server/game/MatchmakingService.ts";

test("telemetria por mundo soma apenas salas ativas e informa cobertura ausente sem fabricar valores", () => {
  const snapshot = aggregateWorldTelemetry("W2", [
    { status: "LOBBY", connectedPlayers: 4, maxPlayers: 10 },
    { status: "IN_PROGRESS", connectedPlayers: 7, maxPlayers: 20 },
    { status: "FINISHED", connectedPlayers: 50, maxPlayers: 50 },
  ], { count: 3, p95WaitSeconds: 12.4 }, new Date("2026-10-21T20:00:00.000Z"));

  assert.equal(snapshot.worldId, "W2");
  assert.equal(snapshot.name, "Priadus");
  assert.equal(snapshot.operationalState, "running");
  assert.deepEqual(snapshot.occupancy, { current: 11, capacity: 30, percent: 36.7 });
  assert.equal(snapshot.activeRooms, 2);
  assert.equal(snapshot.queueCount, 3);
  assert.equal(snapshot.queueP95Seconds, 12.4);
  assert.equal(snapshot.activeIncidents, null);
  assert.equal(snapshot.incidentTelemetryAvailable, false);
  assert.equal(snapshot.stale, false);
  assert.equal(snapshot.observedAt, "2026-10-21T20:00:00.000Z");
});

test("telemetria sem salas não infere capacidade nem disponibilidade de incidentes", () => {
  const snapshot = aggregateWorldTelemetry("W4", [], { count: 0, p95WaitSeconds: null });
  assert.equal(snapshot.operationalState, "idle");
  assert.deepEqual(snapshot.occupancy, { current: 0, capacity: 0, percent: null });
  assert.equal(snapshot.activeIncidents, null);
  assert.equal(snapshot.incidentTelemetryAvailable, false);
});

test("fila de matchmaking calcula contagem e p95 de espera isolados por mundo", () => {
  const service = new MatchmakingService(() => undefined, async () => "room", { tickIntervalMs: 60_000 });
  service.enqueue("w2-a", "A", 1000, null, "solo", "W2");
  service.enqueue("w2-b", "B", 1000, null, "solo", "W2");
  service.enqueue("w1-a", "C", 1000, null, "solo", "W1");
  const entries = (service as any).queue as Map<string, { enqueuedAt: number }>;
  const now = Date.now();
  entries.get("w2-a")!.enqueuedAt = now - 5_000;
  entries.get("w2-b")!.enqueuedAt = now - 15_000;
  entries.get("w1-a")!.enqueuedAt = now - 100_000;

  assert.deepEqual(service.getTelemetry("W2", now), { count: 2, p95WaitSeconds: 15 });
  assert.deepEqual(service.getTelemetry("W1", now), { count: 1, p95WaitSeconds: 100 });
  assert.deepEqual(service.getTelemetry("W3", now), { count: 0, p95WaitSeconds: null });
  service.stop();
});
