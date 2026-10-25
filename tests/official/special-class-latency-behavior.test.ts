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

const observedAt = "2026-10-25T04:00:00.000Z";
const makeSnapshot = (rttValues: number[]) => {
  const samples: NetworkLatencySample[] = rttValues.map((rttMs, index) => ({
    rttMs,
    observedAt: new Date(Date.parse(observedAt) - (rttValues.length - index) * 1_000).toISOString(),
  }));
  return aggregateWorldTelemetry(
    "W2",
    [],
    { count: 0, p95WaitSeconds: null },
    new Date(observedAt),
    samples,
  );
};

const latencyEvent = (rttValues: number[]) => {
  const event = buildSpecialClassNarrativeEvents(makeSnapshot(rttValues))
    .find((candidate) => candidate.title === "O Corredor de Ecos" || candidate.title === "A Tempestade de Ecos");
  return event;
};

const expectedAgentDomains: Record<AgentId, GovernanceFinding["domain"]> = {
  "marshal-henricks": "operations",
  "king-krapulla": "economy",
  "ambassador-uryan": "diplomacy",
};
const expectedPositions: Record<AgentId, GovernanceFinding["position"]> = {
  "marshal-henricks": "hold",
  "king-krapulla": "hold",
  "ambassador-uryan": "support",
};

function adaptersFor(request: CouncilRequest, observations: { analyzed: AgentId[]; reviewed: AgentId[]; peers: Map<AgentId, AgentId[]> }): Record<AgentId, CouncilAgentAdapter> {
  const finding = (agentId: AgentId): GovernanceFinding => ({
    agentId,
    domain: expectedAgentDomains[agentId],
    subject: request.subject,
    position: expectedPositions[agentId],
    confidence: 0.8,
    rationale: agentId === "marshal-henricks"
      ? "Manter ordens operacionais em hold até revisão humana do RTT observado."
      : agentId === "king-krapulla"
        ? "RTT sozinho não demonstra causa de mercado; manter parecer econômico em hold."
        : "Redigir apenas uma mensagem ficcional de confirmação, sem enviar nem anunciar tratado.",
  });
  const adapter = (agentId: AgentId): CouncilAgentAdapter => ({
    async analyze(input) {
      observations.analyzed.push(agentId);
      assert.equal(input.subject, request.subject);
      assert.equal(input.context.worldId, "W2");
      return finding(agentId);
    },
    async review({ ownFinding, peerFindings }) {
      observations.reviewed.push(agentId);
      observations.peers.set(agentId, peerFindings.map((item) => item.agentId));
      assert.equal(ownFinding.agentId, agentId);
      assert.equal(ownFinding.domain, expectedAgentDomains[agentId]);
      assert.equal(peerFindings.length, 2);
      assert.ok(peerFindings.every((item) => item.subject === request.subject));
      return finding(agentId);
    },
  });
  return {
    "marshal-henricks": adapter("marshal-henricks"),
    "king-krapulla": adapter("king-krapulla"),
    "ambassador-uryan": adapter("ambassador-uryan"),
  };
}

describe("regressão pós-PR #103 — comportamento dos agentes sob RTT alto", () => {
  it("classifica as fronteiras moderada/crítica e nunca duplica nem omite o agente consultivo", () => {
    assert.equal(latencyEvent([249.9, 249.9, 249.9, 249.9, 249.9]), undefined);
    const warning = latencyEvent([250, 250, 250, 250, 250]);
    assert.equal(warning?.title, "O Corredor de Ecos");
    assert.equal(latencyEvent([499.9, 499.9, 499.9, 499.9, 499.9])?.title, "O Corredor de Ecos");
    const critical = latencyEvent([500, 500, 500, 500, 500]);
    assert.equal(critical?.title, "A Tempestade de Ecos");

    for (const event of [warning!, critical!]) {
      assert.equal(event.contributions.length, 3);
      assert.deepEqual(new Set(event.contributions.map((line) => line.agentId)), new Set<AgentId>([
        "marshal-henricks", "king-krapulla", "ambassador-uryan",
      ]));
      assert.deepEqual(new Set(event.contributions.map((line) => line.role)), new Set(["lead", "review", "draft"]));
      assert.equal(event.status, "proposal");
      assert.equal(event.needsHumanReview, true);
      assert.equal(event.executable, false);
    }
  });

  it("não aciona resposta narrativa quando a disponibilidade e a cobertura do RTT são contraditórias ou insuficientes", () => {
    const measured = makeSnapshot([700, 710, 720, 730, 740]);
    const unavailable = { ...measured, networkLatencyTelemetryAvailable: false };
    const underSampled = { ...measured, networkLatencySampleCount: 4 };
    const missingP95 = { ...measured, networkLatencyP95Ms: null };
    for (const snapshot of [unavailable, underSampled, missingP95]) {
      const titles = buildSpecialClassNarrativeEvents(snapshot).map((event) => event.title);
      assert.equal(titles.includes("A Tempestade de Ecos"), false);
      assert.equal(titles.includes("O Corredor de Ecos"), false);
    }
  });

  it("encaminha draft crítico às três perspectivas, recebe revisão dos pares e termina em proposta não executável", async () => {
    const event = latencyEvent([510, 520, 530, 540, 550]);
    assert.ok(event);
    assert.equal(event.title, "A Tempestade de Ecos");
    assert.deepEqual(event.observedSignals, [
      { key: "networkLatencyP95Ms", value: 550 },
      { key: "networkLatencySampleCount", value: 5 },
    ]);

    const request: CouncilRequest = {
      requestId: "latency_council_103",
      actorId: "marshal-console-test",
      subject: event.eventId,
      context: {
        worldId: event.worldId,
        narrativeTitle: event.title,
        measuredRttP95Ms: event.observedSignals[0].value,
        sampleCount: event.observedSignals[1].value,
        proposalOnly: true,
      },
    };
    const observations = { analyzed: [] as AgentId[], reviewed: [] as AgentId[], peers: new Map<AgentId, AgentId[]>() };
    const result = await runSpecialClassCouncil(request, adaptersFor(request, observations));

    assert.equal(result.status, "complete");
    assert.equal(result.roundsCompleted, 2);
    assert.deepEqual(new Set(observations.analyzed), new Set<AgentId>([
      "marshal-henricks", "king-krapulla", "ambassador-uryan",
    ]));
    assert.deepEqual(new Set(observations.reviewed), new Set<AgentId>([
      "marshal-henricks", "king-krapulla", "ambassador-uryan",
    ]));
    for (const [agentId, peers] of observations.peers) {
      assert.equal(peers.length, 2);
      assert.ok(!peers.includes(agentId));
    }
    assert.equal(result.conflicts.length, 1);
    assert.equal(result.conflicts[0].status, "preferred-proposal");
    assert.equal(result.conflicts[0].preferredAgent, "marshal-henricks");
    assert.equal(result.conflicts[0].executable, false);
    assert.equal(result.findings.find((finding) => finding.agentId === "marshal-henricks")?.position, "hold");
    assert.equal(result.findings.find((finding) => finding.agentId === "king-krapulla")?.position, "hold");
    assert.equal(result.findings.find((finding) => finding.agentId === "ambassador-uryan")?.position, "support");
  });

  it("falha fechado se a comunicação de Uryan expirar durante revisão de RTT crítico", async () => {
    const event = latencyEvent([700, 710, 720, 730, 740]);
    assert.ok(event);
    const request: CouncilRequest = {
      requestId: "latency_timeout_103",
      actorId: "marshal-console-test",
      subject: event.eventId,
      context: { worldId: event.worldId, narrativeTitle: event.title, proposalOnly: true },
    };
    const observations = { analyzed: [] as AgentId[], reviewed: [] as AgentId[], peers: new Map<AgentId, AgentId[]>() };
    const adapters = adaptersFor(request, observations);
    adapters["ambassador-uryan"].review = async () => {
      throw Object.assign(new Error("simulated agent transport timeout"), { code: "ETIMEDOUT" });
    };

    const result = await runSpecialClassCouncil(request, adapters);

    assert.equal(result.status, "partial");
    assert.equal(result.roundsCompleted, 1);
    assert.deepEqual(result.failedAgents, ["ambassador-uryan"]);
    assert.equal(result.findings.find((finding) => finding.agentId === "ambassador-uryan")?.position, "hold");
    assert.ok(result.reasonCodes.includes("AGENT_REVIEW_INCOMPLETE"));
    assert.ok(result.reasonCodes.includes("HUMAN_REVIEW_REQUIRED"));
    assert.ok(result.conflicts.every((conflict) => conflict.executable === false));
  });
});
