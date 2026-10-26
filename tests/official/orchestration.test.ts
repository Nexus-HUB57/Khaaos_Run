import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { orchestrate, prioritizeAlerts, scoreAlert, SPECIAL_AGENTS } from "../../server/game/orchestration.ts";

describe("Special Class orchestration", () => {
  it("declares the three named agents and routes each domain to one expert", () => {
    assert.equal(SPECIAL_AGENTS.length, 3);
    assert.equal(orchestrate({ requestId: "request_001", actorId: "user-1", command: "world.status", scope: { worldId: "W1" } }).agentId, "marshal-henricks");
    assert.equal(orchestrate({ requestId: "request_002", actorId: "user-1", command: "market.brief", scope: { worldId: "W2", periodSeconds: 3600 } }).agentId, "king-krapulla");
    const ambassador = orchestrate({ requestId: "request_003", actorId: "user-1", command: "diplomacy.message.draft", scope: { faction: "Vigias", topic: "Trégua" } });
    assert.equal(ambassador.agentId, "ambassador-uryan");
    assert.equal(ambassador.status, "proposal");
  });

  it("rejects shell-like, unknown and worldless commands", () => {
    assert.equal(orchestrate({ requestId: "request_004", actorId: "user-1", command: "shell.exec", payload: { cmd: "rm -rf /" } }).reasonCodes[0], "COMMAND_NOT_ALLOWED");
    assert.equal(orchestrate({ requestId: "request_005", actorId: "user-1", command: "market.brief" }).reasonCodes[0], "INVALID_WORLD_SCOPE");
  });

  it("rejects malformed IDs, invalid time windows and oversized payloads", () => {
    assert.equal(orchestrate({ requestId: "x", actorId: "user-1", command: "world.status", scope: { worldId: "W1" } }).reasonCodes[0], "INVALID_REQUEST_ID");
    assert.equal(orchestrate({ requestId: "request_006", actorId: "user-1", command: "market.brief", scope: { worldId: "W1", periodSeconds: 10 } }).reasonCodes[0], "INVALID_PERIOD");
    assert.equal(orchestrate({ requestId: "request_007", actorId: "user-1", command: "world.status", scope: { worldId: "W1" }, payload: Object.fromEntries(Array.from({ length: 13 }, (_, i) => [`k${i}`, i])) }).reasonCodes[0], "INVALID_PAYLOAD");
  });

  it("only emits typed proposals and never direct writes", () => {
    const result = orchestrate({ requestId: "request_008", actorId: "user-1", command: "world.window.propose", scope: { worldId: "W2" }, payload: { window: "15m" } });
    assert.equal(result.status, "proposal");
    assert.deepEqual(result.proposal, { type: "world.window.propose", fields: { worldId: "W2" } });
    assert.equal(orchestrate({ requestId: "request_009", actorId: "user-1", command: "economy.transfer", payload: { amount: 5 } }).reasonCodes[0], "COMMAND_NOT_ALLOWED");
  });

  it("scores valid alerts deterministically and rejects out-of-range signals", () => {
    const signal = { severity: 4, impact: 4, confidence: 1, staleness: 0, createdAt: 100 };
    assert.equal(scoreAlert(signal), 100);
    assert.throws(() => scoreAlert({ ...signal, severity: 5 }), RangeError);
    const old = { ...signal, createdAt: 1 };
    const fresh = { ...signal, severity: 3, impact: 3, createdAt: 2 };
    assert.deepEqual(prioritizeAlerts([fresh, old]).map((item) => item.createdAt), [1, 2]);
  });
});
