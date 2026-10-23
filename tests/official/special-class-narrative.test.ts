import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { aggregateWorldTelemetry } from "../../server/game/worldTelemetry.ts";
import { buildSpecialClassNarrativeEvents } from "../../server/game/specialClassNarrative.ts";

const snapshot = (input: {
  queueCount?: number;
  p95?: number | null;
  players?: number;
  capacity?: number;
} = {}) => aggregateWorldTelemetry(
  "W2",
  input.capacity === undefined ? [] : [{ status: "IN_PROGRESS", connectedPlayers: input.players ?? 0, maxPlayers: input.capacity }],
  { count: input.queueCount ?? 0, p95WaitSeconds: input.p95 ?? null },
  new Date("2026-10-21T22:00:00.000Z"),
);

describe("eventos narrativos coordenados da Classe Especial", () => {
  it("não inventa gatilhos com telemetria vazia", () => {
    assert.deepEqual(buildSpecialClassNarrativeEvents(snapshot()), []);
  });

  it("inclui somente sinais observados e exige revisão humana em todos os drafts", () => {
    const events = buildSpecialClassNarrativeEvents(snapshot({ queueCount: 4, p95: 65, players: 81, capacity: 100 }));
    assert.deepEqual(events.map((event) => event.title), ["As Docas em Silêncio", "O Farol da Espera", "A Mesa do Anel"]);
    assert.deepEqual(events.map((event) => event.observedSignals[0]), [
      { key: "queueCount", value: 4 },
      { key: "queueP95Seconds", value: 65 },
      { key: "occupancy.percent", value: 81 },
    ]);
    for (const event of events) {
      assert.equal(event.worldId, "W2");
      assert.equal(event.status, "proposal");
      assert.equal(event.needsHumanReview, true);
      assert.equal(event.executable, false);
      assert.deepEqual(new Set(event.contributions.map((entry) => entry.agentId)), new Set([
        "marshal-henricks", "king-krapulla", "ambassador-uryan",
      ]));
      assert.equal(new Set(event.contributions.map((entry) => entry.role)).size, 3);
    }
  });

  it("ativa cada threshold inclusive sem inferir mercado ou diplomacia", () => {
    assert.deepEqual(buildSpecialClassNarrativeEvents(snapshot({ queueCount: 2 })).map((event) => event.title), []);
    assert.equal(buildSpecialClassNarrativeEvents(snapshot({ queueCount: 3 })).length, 1);
    assert.equal(buildSpecialClassNarrativeEvents(snapshot({ p95: 59.9 })).length, 0);
    assert.equal(buildSpecialClassNarrativeEvents(snapshot({ p95: 60 })).length, 1);
    assert.equal(buildSpecialClassNarrativeEvents(snapshot({ players: 79, capacity: 100 })).length, 0);
    assert.equal(buildSpecialClassNarrativeEvents(snapshot({ players: 80, capacity: 100 })).length, 1);
  });

  it("não cria evento de ocupação quando a capacidade não tem fonte", () => {
    const [event] = buildSpecialClassNarrativeEvents(snapshot({ queueCount: 1, capacity: 0 }));
    assert.equal(event, undefined);
  });
});
