import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  runSpecialClassCouncil,
  type AgentId,
  type CouncilAgentAdapter,
  type CouncilRequest,
  type GovernanceFinding,
} from "../../server/game/orchestration.ts";
import { buildSpecialClassNarrativeEvents } from "../../server/game/specialClassNarrative.ts";
import { aggregateWorldTelemetry, type NetworkLatencySample } from "../../server/game/worldTelemetry.ts";

const AGENTS: readonly AgentId[] = ["marshal-henricks", "king-krapulla", "ambassador-uryan"];
const DOMAINS: Record<AgentId, GovernanceFinding["domain"]> = {
  "marshal-henricks": "operations",
  "king-krapulla": "economy",
  "ambassador-uryan": "diplomacy",
};
const STANCES: Record<AgentId, GovernanceFinding["position"]> = {
  "marshal-henricks": "hold",
  "king-krapulla": "hold",
  "ambassador-uryan": "support",
};

/** Reproducible LCG: chaos tests never depend on Math.random or external services. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

interface ChaosCounters {
  attempted: Record<AgentId, { analyze: number; review: number }>;
  delivered: number;
  dropped: number;
}

function createLossAdapters(
  request: CouncilRequest,
  lossRate: number,
  random: () => number,
  counters: ChaosCounters,
  forcedDrops: ReadonlySet<string> = new Set(),
): Record<AgentId, CouncilAgentAdapter> {
  const transmit = async (agentId: AgentId, phase: "analyze" | "review", finding: GovernanceFinding) => {
    counters.attempted[agentId][phase] += 1;
    if (forcedDrops.has(`${agentId}:${phase}`) || random() < lossRate) {
      counters.dropped += 1;
      throw Object.assign(new Error(`simulated packet loss: ${agentId}/${phase}`), { code: "ECONNRESET" });
    }
    counters.delivered += 1;
    return finding;
  };
  const finding = (agentId: AgentId): GovernanceFinding => ({
    agentId,
    domain: DOMAINS[agentId],
    subject: request.subject,
    position: STANCES[agentId],
    confidence: 0.75,
    rationale: agentId === "marshal-henricks"
      ? "Ordens operacionais ficam em hold enquanto a comunicação é instável."
      : agentId === "king-krapulla"
        ? "Sem evidência econômica independente, manter revisão em hold."
        : "Preparar apenas rascunho ficcional de confirmação, sem transmissão.",
  });
  const adapter = (agentId: AgentId): CouncilAgentAdapter => ({
    analyze: async () => transmit(agentId, "analyze", finding(agentId)),
    review: async ({ ownFinding, peerFindings }) => {
      assert.equal(ownFinding.agentId, agentId);
      assert.equal(peerFindings.length, 2);
      assert.ok(peerFindings.every((peer) => peer.subject === request.subject));
      return transmit(agentId, "review", finding(agentId));
    },
  });
  return {
    "marshal-henricks": adapter("marshal-henricks"),
    "king-krapulla": adapter("king-krapulla"),
    "ambassador-uryan": adapter("ambassador-uryan"),
  };
}

function emptyCounters(): ChaosCounters {
  return {
    attempted: {
      "marshal-henricks": { analyze: 0, review: 0 },
      "king-krapulla": { analyze: 0, review: 0 },
      "ambassador-uryan": { analyze: 0, review: 0 },
    },
    delivered: 0,
    dropped: 0,
  };
}

function highLatencyRequest(index: number): CouncilRequest {
  const observedAt = "2026-10-25T04:00:00.000Z";
  const samples: NetworkLatencySample[] = [700, 710, 720, 730, 740].map((rttMs, sampleIndex) => ({
    rttMs,
    observedAt: new Date(Date.parse(observedAt) - (5 - sampleIndex) * 1_000).toISOString(),
  }));
  const snapshot = aggregateWorldTelemetry("W2", [], { count: 0, p95WaitSeconds: null }, new Date(observedAt), samples);
  const event = buildSpecialClassNarrativeEvents(snapshot).find((candidate) => candidate.title === "A Tempestade de Ecos");
  assert.ok(event, "snapshot crítico com cinco pongs deve criar draft narrativo");
  return {
    requestId: `packet_loss_${index}`,
    actorId: "staging-chaos-test-operator",
    subject: event.eventId,
    context: {
      worldId: event.worldId,
      narrativeTitle: event.title,
      measuredRttP95Ms: event.observedSignals[0].value,
      sampleCount: event.observedSignals[1].value,
      proposalOnly: true,
    },
  };
}

function assertSafeCouncil(result: Awaited<ReturnType<typeof runSpecialClassCouncil>>, counters: ChaosCounters) {
  assert.equal(result.findings.length, AGENTS.length);
  assert.deepEqual(new Set(result.findings.map((finding) => finding.agentId)), new Set(AGENTS));
  assert.ok(result.conflicts.every((conflict) => conflict.executable === false));
  assert.ok(result.findings.every((finding) => finding.position === "hold" || finding.position === "support" || finding.position === "oppose"));
  for (const agentId of AGENTS) {
    assert.ok(counters.attempted[agentId].analyze <= 1, "packet-loss scenario must not hide an automatic analysis retry");
    assert.ok(counters.attempted[agentId].review <= 1, "packet-loss scenario must not hide an automatic review retry");
  }
  if (result.status === "partial") {
    assert.ok(result.reasonCodes.includes("HUMAN_REVIEW_REQUIRED"));
    for (const failedAgent of result.failedAgents) {
      assert.equal(result.findings.find((finding) => finding.agentId === failedAgent)?.position, "hold");
    }
  }
}

describe("chaos de perda de pacotes — agentes KR (simulação determinística, staging-safe)", () => {
  it("varre perda de 0%, 10%, 25% e 50% sem falso sucesso, auto-retry ou proposta executável", async () => {
    const lossRates = [0, 0.1, 0.25, 0.5] as const;
    const campaignsPerRate = 40;
    const report: Array<{ lossRate: number; completed: number; partial: number; delivered: number; dropped: number }> = [];

    for (const [rateIndex, lossRate] of lossRates.entries()) {
      const random = seededRandom(0x4b520300 + rateIndex);
      let completed = 0;
      let partial = 0;
      let delivered = 0;
      let dropped = 0;

      for (let index = 0; index < campaignsPerRate; index += 1) {
        const request = highLatencyRequest(rateIndex * campaignsPerRate + index);
        const counters = emptyCounters();
        const result = await runSpecialClassCouncil(
          request,
          createLossAdapters(request, lossRate, random, counters),
        );
        delivered += counters.delivered;
        dropped += counters.dropped;
        assertSafeCouncil(result, counters);

        if (counters.dropped === 0) {
          assert.equal(result.status, "complete");
          assert.equal(result.roundsCompleted, 2);
          completed += 1;
        } else {
          assert.equal(result.status, "partial", "qualquer pacote perdido deve impedir conclusão plena do conselho");
          assert.equal(result.roundsCompleted, 1);
          assert.ok(result.failedAgents.length > 0);
          partial += 1;
        }
      }
      if (lossRate === 0) assert.equal(dropped, 0);
      if (lossRate > 0) assert.ok(dropped > 0, `seeded profile ${lossRate} precisa exercitar perdas`);
      report.push({ lossRate, completed, partial, delivered, dropped });
    }
    assert.ok(report[0].completed === campaignsPerRate && report[0].partial === 0);
    for (const profile of report.slice(1)) assert.ok(profile.partial > 0);
    console.log("packet-loss chaos report:", JSON.stringify(report));
  });

  it("falha fechado para drops específicos em analyze/review de cada agente durante evento crítico", async () => {
    const dropPlans = [
      new Set(["marshal-henricks:analyze"]),
      new Set(["king-krapulla:analyze"]),
      new Set(["ambassador-uryan:analyze"]),
      new Set(["marshal-henricks:review"]),
      new Set(["king-krapulla:review"]),
      new Set(["ambassador-uryan:review"]),
    ];
    for (const [index, forcedDrops] of dropPlans.entries()) {
      const request = highLatencyRequest(1000 + index);
      const counters = emptyCounters();
      const result = await runSpecialClassCouncil(
        request,
        createLossAdapters(request, 0, seededRandom(index + 1), counters, forcedDrops),
      );
      assertSafeCouncil(result, counters);
      assert.equal(result.status, "partial");
      assert.equal(result.roundsCompleted, 1);
      assert.deepEqual(result.failedAgents, [...forcedDrops].map((entry) => entry.split(":")[0] as AgentId));
      assert.ok(result.reasonCodes.includes("HUMAN_REVIEW_REQUIRED"));
      assert.ok(result.conflicts.every((conflict) => conflict.executable === false));
    }
  });
});
