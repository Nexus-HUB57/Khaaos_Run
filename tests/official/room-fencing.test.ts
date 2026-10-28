// Khaaos Run — M3: fencing de ownership de sala (epoch monotônico por sala).
//
// Valida a semântica do lease atômico com fencing token nos DOIS stores
// (LocalMeshStore e RedisMeshStore com cliente fake que executa a MESMA
// semântica do script Lua) e a decisão de fence do mesh (renewLeasesAndFence):
//   1. renovação pelo holder mantém o epoch;
//   2. assunção após expiração incrementa o epoch;
//   3. troca de mãos A→B incrementa o epoch (base do fencing);
//   4. epoch gap > 1 entre aquisições do MESMO nó → handler "fenced" dispara
//      (outro nó deteve a sala no intervalo — split-brain fechado);
//   5. gap == 1 (reassunção sem intervenção) NÃO cerca;
//   6. cliente Redis sem eval degrada gracefulmente (fallback legado, epoch 0).
import assert from "node:assert/strict";
import { test, describe } from "node:test";

import {
  LocalMeshStore,
  RedisMeshStore,
  RoomEventMesh,
  type RoomMeshRecord,
  type RoomLostHandler,
} from "../../server/game/RoomEventMesh";

// ─── Fakes ────────────────────────────────────────────────────────────────────

// Cliente Redis fake que implementa EXATAMENTE a semântica do RENEW_LEASE_SCRIPT
// (contrato: [status, epoch] — 1 = renovado, 2 = adquerido com INCR) e o hash
// de índice de salas (hSet/hGet/hDel/hVals) usado pelo mirror/reconcile.
function makeFakeRedis() {
  const state = {
    leases: new Map<string, { holder: string; epoch: number; expiresAt: number }>(),
    fences: new Map<string, number>(),
    hashes: new Map<string, Map<string, string>>(),
  };
  const now = () => Date.now();
  return {
    state,
    hSet: async (key: string, field: string, value: string) => {
      const hash = state.hashes.get(key) ?? new Map<string, string>();
      hash.set(field, value);
      state.hashes.set(key, hash);
    },
    hDel: async (key: string, field: string) => {
      state.hashes.get(key)?.delete(field);
    },
    hGet: async (key: string, field: string) => state.hashes.get(key)?.get(field) ?? null,
    hVals: async (key: string) => [...(state.hashes.get(key)?.values() ?? [])],
    set: async (key: string, value: string, options: { PX: number }) => {
      // fallback legado (sem epoch): valor é nodeId cru
      state.leases.set(key, { holder: value, epoch: 0, expiresAt: now() + options.PX });
    },
    exists: async (key: string) => {
      const lease = state.leases.get(key);
      return lease && lease.expiresAt > now() ? 1 : 0;
    },
    eval: async (_script: string, options: { keys: string[]; arguments: string[] }) => {
      const [leaseKey, fenceKey] = options.keys;
      const [nodeId, ttlRaw] = options.arguments;
      const ttl = Number(ttlRaw);
      const cur = state.leases.get(leaseKey);
      if (cur && cur.holder === nodeId && cur.expiresAt > now() && cur.epoch > 0) {
        cur.expiresAt = now() + ttl;
        return [1, cur.epoch];
      }
      const epoch = (state.fences.get(fenceKey) ?? 0) + 1;
      state.fences.set(fenceKey, epoch);
      state.leases.set(leaseKey, { holder: nodeId, epoch, expiresAt: now() + ttl });
      return [2, epoch];
    },
  };
}

function makeRecord(roomId: string, nodeId: string, overrides: Partial<RoomMeshRecord> = {}): RoomMeshRecord {
  return {
    id: roomId,
    worldId: "CIGKV",
    status: "LOBBY",
    playerCount: 1,
    maxPlayers: 16,
    isPrivate: false,
    inviteCode: null,
    hostId: "host-1",
    nodeId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

// ─── Contrato dos stores (epoch) ──────────────────────────────────────────────

describe("fencing: semântica do lease com epoch", () => {
  test("LocalMeshStore: renovação pelo holder mantém o epoch", async () => {
    const store = new LocalMeshStore();
    const first = await store.touchLease("r-local-renew", "node-a", 30_000);
    const second = await store.touchLease("r-local-renew", "node-a", 30_000);
    assert.equal(first.outcome, "acquired");
    assert.equal(second.outcome, "renewed");
    assert.equal(second.epoch, first.epoch);
  });

  test("LocalMeshStore: assunção após expiração incrementa o epoch", async () => {
    const store = new LocalMeshStore();
    const first = await store.touchLease("r-local-expire", "node-a", 5); // TTL curto
    await new Promise((resolve) => setTimeout(resolve, 20)); // deixa expirar
    const second = await store.touchLease("r-local-expire", "node-a", 30_000);
    assert.equal(second.outcome, "acquired");
    assert.ok(second.epoch > first.epoch, "epoch cresce ao reassumir");
  });

  test("LocalMeshStore: troca de mãos A→B incrementa o epoch", async () => {
    const store = new LocalMeshStore();
    const fromA = await store.touchLease("r-local-handover", "node-a", 30_000);
    const fromB = await store.touchLease("r-local-handover", "node-b", 30_000);
    assert.equal(fromB.outcome, "acquired");
    assert.ok(fromB.epoch > fromA.epoch);
  });

  test("RedisMeshStore (fake Lua): mesma semântica do script", async () => {
    const redis = makeFakeRedis();
    const store = new RedisMeshStore(redis as never, "fence-redis");
    const first = await store.touchLease("r-redis-1", "node-a", 30_000);
    const renewed = await store.touchLease("r-redis-1", "node-a", 30_000);
    const fromB = await store.touchLease("r-redis-1", "node-b", 30_000);
    assert.deepEqual(first, { outcome: "acquired", epoch: 1 });
    assert.deepEqual(renewed, { outcome: "renewed", epoch: 1 });
    assert.equal(fromB.outcome, "acquired");
    assert.equal(fromB.epoch, 2);
  });

  test("RedisMeshStore sem eval: fallback legado com epoch 0 (degradação)", async () => {
    const legacyClient = {
      hSet: async () => undefined,
      hDel: async () => undefined,
      hGet: async () => null,
      hVals: async () => [],
      set: async () => undefined,
      exists: async () => 1,
      // sem eval
    };
    const store = new RedisMeshStore(legacyClient as never, "fence-legacy");
    const renewal = await store.touchLease("r-legacy", "node-a", 30_000);
    assert.deepEqual(renewal, { outcome: "renewed", epoch: 0 });
  });
});

// ─── Decisão de fence do mesh (renewLeasesAndFence) ───────────────────────────

describe("fencing: mesh cerca salas com epoch gap (> 1)", () => {
  test("gap > 1 dispara handler fenced; gap == 1 não cerca", async () => {
    const redis = makeFakeRedis();
    const prefix = "fence-mesh";
    const mesh = new RoomEventMesh({
      nodeId: "node-a",
      enabled: true,
      prefix,
      redisClientProvider: () => redis as never,
    });
    const events: { record: RoomMeshRecord; reason: Parameters<RoomLostHandler>[1] }[] = [];
    mesh.onRoomLost((record, reason) => events.push({ record, reason }));

    const room = "r-mesh-fenced";
    const roomBenign = "r-mesh-benign";
    await mesh.mirrorRoom(makeRecord(room, "node-a")); // node-a adquire (epoch 1)
    await mesh.mirrorRoom(makeRecord(roomBenign, "node-a")); // node-a adquire (epoch 1)

    // Cenário SPLIT-BRAIN: nó B assume a sala (epoch 2) com TTL curto; depois
    // o lease de B expira e node-a (que nunca parou de ter a sala localmente)
    // reassume no ciclo do mesh.
    await redis.eval("", {
      keys: [`${prefix}:room:${room}:alive`, `${prefix}:room:${room}:fence`],
      arguments: ["node-b", "5"],
    });
    await new Promise((resolve) => setTimeout(resolve, 20)); // lease de B expira

    const result = await mesh.renewLeasesAndFence(new Set([room, roomBenign]));
    assert.deepEqual(result.fenced, [room], "apenas a sala com gap > 1 é cercada");

    const fencedEvents = events.filter((event) => event.reason === "fenced");
    assert.equal(fencedEvents.length, 1);
    assert.equal(fencedEvents[0].record.id, room);
    assert.equal(fencedEvents[0].record.nodeId, "node-a", "registro segue apontando o dono original");
  });

  test("renovação normal nunca cerca", async () => {
    const redis = makeFakeRedis();
    const mesh = new RoomEventMesh({
      nodeId: "node-a",
      enabled: true,
      prefix: "fence-calm",
      redisClientProvider: () => redis as never,
    });
    const events: { record: RoomMeshRecord; reason: Parameters<RoomLostHandler>[1] }[] = [];
    mesh.onRoomLost((record, reason) => events.push({ record, reason }));

    const room = "r-calm";
    await mesh.mirrorRoom(makeRecord(room, "node-a"));
    for (let cycle = 0; cycle < 3; cycle++) {
      const result = await mesh.renewLeasesAndFence(new Set([room]));
      assert.deepEqual(result.fenced, [], "renovação com holder vivo não cerca");
    }
    assert.equal(events.length, 0);
  });
});
