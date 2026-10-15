import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  runSpecialClassCouncil,
  resolveGovernanceConflicts,
  type AgentId,
  type CouncilAgentAdapter,
  type GovernanceFinding,
} from "../../server/game/orchestration.ts";

const request = {
  requestId: "council_test_001",
  actorId: "operator-1",
  subject: "window-W2",
  context: { worldId: "W2", occupancyPct: 82, configRevision: "rev-12" },
};
const domainByAgent: Record<AgentId, GovernanceFinding["domain"]> = {
  "marshal-henricks": "operations",
  "king-krapulla": "economy",
  "ambassador-uryan": "diplomacy",
};
const createAdapters = (
  positions: Record<AgentId, GovernanceFinding["position"]>,
  observer?: (agentId: AgentId, peers: readonly GovernanceFinding[]) => void,
): Record<AgentId, CouncilAgentAdapter> => {
  const finding = (agentId: AgentId, position = positions[agentId]): GovernanceFinding => ({
    agentId, domain: domainByAgent[agentId], subject: request.subject, position,
    confidence: 0.8, rationale: `recomendação ${agentId}`,
  });
  return {
    "marshal-henricks": {
      async analyze() { await new Promise((resolve) => setTimeout(resolve, 12)); return finding("marshal-henricks"); },
      async review({ ownFinding, peerFindings }) { observer?.("marshal-henricks", peerFindings); assert.equal(ownFinding.agentId, "marshal-henricks"); return finding("marshal-henricks"); },
    },
    "king-krapulla": {
      async analyze() { await new Promise((resolve) => setTimeout(resolve, 2)); return finding("king-krapulla"); },
      async review({ ownFinding, peerFindings }) { observer?.("king-krapulla", peerFindings); assert.equal(ownFinding.agentId, "king-krapulla"); return finding("king-krapulla"); },
    },
    "ambassador-uryan": {
      async analyze() { await new Promise((resolve) => setTimeout(resolve, 7)); return finding("ambassador-uryan"); },
      async review({ ownFinding, peerFindings }) { observer?.("ambassador-uryan", peerFindings); assert.equal(ownFinding.agentId, "ambassador-uryan"); return finding("ambassador-uryan"); },
    },
  };
};

describe("Special Class asynchronous integration", () => {
  it("fans out to all three agents, shares peer findings in round two, then arbitrates", async () => {
    const receivedPeers = new Map<AgentId, string[]>();
    const adapters = createAdapters(
      { "marshal-henricks": "support", "king-krapulla": "hold", "ambassador-uryan": "support" },
      (agentId, peers) => receivedPeers.set(agentId, peers.map((finding) => finding.agentId)),
    );
    const result = await runSpecialClassCouncil(request, adapters);
    assert.equal(result.status, "complete");
    assert.equal(result.roundsCompleted, 2);
    assert.deepEqual([...receivedPeers.keys()].sort(), ["ambassador-uryan", "king-krapulla", "marshal-henricks"]);
    for (const [agentId, peers] of receivedPeers) {
      assert.equal(peers.length, 2);
      assert.ok(!peers.includes(agentId));
    }
    assert.equal(result.conflicts[0].status, "preferred-proposal");
    assert.equal(result.conflicts[0].preferredAgent, "marshal-henricks");
    assert.equal(result.conflicts[0].executable, false);
  });

  it("fails closed when an agent cannot participate and returns partial, non-executable findings", async () => {
    const adapters = createAdapters({ "marshal-henricks": "support", "king-krapulla": "support", "ambassador-uryan": "support" });
    adapters["king-krapulla"].analyze = async () => { throw new Error("simulated adapter outage"); };
    const result = await runSpecialClassCouncil(request, adapters);
    assert.equal(result.status, "partial");
    assert.equal(result.roundsCompleted, 1);
    assert.deepEqual(result.failedAgents, ["king-krapulla"]);
    assert.ok(result.reasonCodes.includes("HUMAN_REVIEW_REQUIRED"));
    assert.ok(result.findings.every((finding) => finding.position === "hold" || finding.position === "support"));
    assert.ok(result.conflicts.every((resolution) => resolution.executable === false));
  });

  it("applies an adapter deadline and does not wait indefinitely", async () => {
    const adapters = createAdapters({ "marshal-henricks": "support", "king-krapulla": "support", "ambassador-uryan": "support" });
    adapters["king-krapulla"].analyze = () => new Promise<GovernanceFinding>(() => {});
    const startedAt = Date.now();
    const result = await runSpecialClassCouncil(request, adapters, { timeoutMs: 50 });
    assert.equal(result.status, "partial");
    assert.deepEqual(result.failedAgents, ["king-krapulla"]);
    assert.ok(Date.now() - startedAt < 1_000);
  });

  it("rejects a finding outside an agent's authority domain", async () => {
    const adapters = createAdapters({ "marshal-henricks": "support", "king-krapulla": "support", "ambassador-uryan": "support" });
    adapters["king-krapulla"].analyze = async () => ({
      agentId: "king-krapulla", domain: "operations", subject: request.subject,
      position: "support", confidence: 1, rationale: "domain spoof attempt",
    });
    const result = await runSpecialClassCouncil(request, adapters);
    assert.equal(result.status, "partial");
    assert.deepEqual(result.failedAgents, ["king-krapulla"]);
    assert.ok(result.reasonCodes.includes("HUMAN_REVIEW_REQUIRED"));
  });

  it("safety and competitive-integrity policies veto lower-priority disagreement", () => {
    const findings: GovernanceFinding[] = [
      { agentId: "marshal-henricks", domain: "safety", subject: "event-X", position: "hold", confidence: 0.6, rationale: "risco" },
      { agentId: "king-krapulla", domain: "economy", subject: "event-X", position: "support", confidence: 1, rationale: "mercado" },
      { agentId: "ambassador-uryan", domain: "diplomacy", subject: "event-X", position: "support", confidence: 1, rationale: "narrativa" },
    ];
    const resolution = resolveGovernanceConflicts(findings)[0];
    assert.equal(resolution.status, "safety-veto");
    assert.equal(resolution.reasonCode, "SAFETY_POLICY_VETO");
    assert.equal(resolution.preferredAgent, null);
    assert.equal(resolution.executable, false);
  });

  it("escalates conflicting positions at the same policy tier to human review", () => {
    const findings: GovernanceFinding[] = [
      { agentId: "marshal-henricks", domain: "operations", subject: "ring-Y", position: "support", confidence: 0.99, rationale: "A" },
      { agentId: "marshal-henricks", domain: "operations", subject: "ring-Y", position: "oppose", confidence: 0.2, rationale: "B" },
    ];
    const resolution = resolveGovernanceConflicts(findings)[0];
    assert.equal(resolution.status, "escalated-human-review");
    assert.equal(resolution.reasonCode, "CONFLICT_REQUIRES_HUMAN_REVIEW");
    assert.equal(resolution.executable, false);
  });

  it("rejects invalid council scopes instead of calling any agent", async () => {
    const adapters = createAdapters({ "marshal-henricks": "support", "king-krapulla": "support", "ambassador-uryan": "support" });
    let calls = 0;
    for (const agentId of ["marshal-henricks", "king-krapulla", "ambassador-uryan"] as const) {
      const original = adapters[agentId].analyze;
      adapters[agentId].analyze = async (input) => { calls += 1; return original(input); };
    }
    const result = await runSpecialClassCouncil({ ...request, context: Object.fromEntries(Array.from({ length: 25 }, (_, i) => [`metric${i}`, i])) }, adapters);
    assert.equal(result.status, "rejected");
    assert.equal(result.reasonCodes[0], "INVALID_COUNCIL_REQUEST");
    assert.equal(calls, 0);
  });
});
