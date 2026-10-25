import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { aggregateWorldTelemetry } from "../../server/game/worldTelemetry.ts";
import { buildSpecialClassNarrativeEvents } from "../../server/game/specialClassNarrative.ts";

const snapshot = (input: {
  queueCount?: number;
  p95?: number | null;
  players?: number;
  capacity?: number;
  rtt?: number | null;
  latencySamples?: number;
} = {}) => aggregateWorldTelemetry(
  "W2",
  input.capacity === undefined ? [] : [{ status: "IN_PROGRESS", connectedPlayers: input.players ?? 0, maxPlayers: input.capacity }],
  { count: input.queueCount ?? 0, p95WaitSeconds: input.p95 ?? null },
  new Date("2026-10-21T22:00:00.000Z"),
  input.rtt == null ? [] : Array.from({ length: input.latencySamples ?? 5 }, (_, index) => ({
    rttMs: input.rtt!,
    observedAt: new Date(Date.parse("2026-10-21T21:59:00.000Z") + index * 1000).toISOString(),
  })),
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

  it("dispara draft de aviso somente com RTT p95 ≥250 ms e cinco amostras", () => {
    assert.equal(buildSpecialClassNarrativeEvents(snapshot({ rtt: 249.9 })).length, 0);
    assert.equal(buildSpecialClassNarrativeEvents(snapshot({ rtt: 250, latencySamples: 4 })).length, 0);
    const [event] = buildSpecialClassNarrativeEvents(snapshot({ rtt: 250 }));
    assert.equal(event.title, "O Corredor de Ecos");
    assert.deepEqual(event.observedSignals, [
      { key: "networkLatencyP95Ms", value: 250 },
      { key: "networkLatencySampleCount", value: 5 },
    ]);
    assert.equal(event.executable, false);
    assert.equal(event.needsHumanReview, true);
  });

  it("dispara cenário crítico a partir de 500 ms sem afirmar causa nem executar pausa", () => {
    assert.equal(buildSpecialClassNarrativeEvents(snapshot({ rtt: 499.9 }))[0]?.title, "O Corredor de Ecos");
    const events = buildSpecialClassNarrativeEvents(snapshot({ rtt: 500 }));
    const event = events.find((item) => item.title === "A Tempestade de Ecos");
    assert.ok(event);
    assert.equal(event.executable, false);
    assert.equal(event.needsHumanReview, true);
    assert.match(event.contributions.find((line) => line.agentId === "marshal-henricks")!.line, /não pausa nem altera partidas/);
    assert.match(event.contributions.find((line) => line.agentId === "king-krapulla")!.line, /não revela causa/);
    assert.equal(event.contributions.length, 3);
  });

  it("não infere alta latência de fila p95, RTT ausente ou amostras insuficientes", () => {
    const isLatencyEvent = (title: string) => title === "O Corredor de Ecos" || title === "A Tempestade de Ecos";
    assert.equal(buildSpecialClassNarrativeEvents(snapshot({ p95: 600 })).some((event) => isLatencyEvent(event.title)), false);
    assert.equal(buildSpecialClassNarrativeEvents(snapshot({ rtt: null })).some((event) => isLatencyEvent(event.title)), false);
    assert.equal(buildSpecialClassNarrativeEvents(snapshot({ rtt: 800, latencySamples: 1 })).some((event) => isLatencyEvent(event.title)), false);
  });
});
