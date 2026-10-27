import assert from "node:assert/strict";
import { test } from "node:test";

process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/khaaos_test";
process.env.WS_TOKEN_SECRET ??= "official-room-mesh-test-key-32-bytes";

const meshModule = await import("../../server/game/RoomEventMesh.ts");
const { RoomEventMesh, __expireLocalLeaseForTests } = meshModule;
type RoomMeshRecord = import("../../server/game/RoomEventMesh.ts").RoomMeshRecord;
const { roomManager } = await import("../../server/game/RoomManager.ts");

// Determinismo: o mesh do RoomManager roda em modo BARRAMENTO LOCAL nos
// testes oficiais mesmo se REDIS_URL existir no ambiente (a suíte não depende
// de Redis; o caminho Redis real é coberto pelos testes de adapter).
(roomManager as any).mesh.enabled = false;

function makeRecord(overrides: Partial<RoomMeshRecord> = {}): RoomMeshRecord {
  return {
    id: `mesh_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    worldId: "CIGKV",
    status: "LOBBY",
    playerCount: 1,
    maxPlayers: 16,
    isPrivate: false,
    inviteCode: null,
    hostId: "host-1",
    nodeId: "node-A",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function fakeSocket() {
  const messages: any[] = [];
  return {
    messages,
    socket: {
      readyState: 1,
      send(raw: string) { messages.push(JSON.parse(raw)); },
    } as any,
  };
}

// ─── 1) Mesh puro: barramento local compartilhado simula dois nós ───────────

test("mesh local bus: registro de um nó é descoberto por outro nó", async () => {
  const meshA = new RoomEventMesh({ nodeId: "mesh-test-node-a", enabled: false });
  const meshB = new RoomEventMesh({ nodeId: "mesh-test-node-b", enabled: false });

  const record = makeRecord({ nodeId: meshA.nodeId });
  assert.equal(await meshA.mirrorRoom(record), "mirrored");

  const remoteForB = await meshB.listRemoteRooms();
  assert.equal(remoteForB.length, 1);
  assert.equal(remoteForB[0].id, record.id);
  assert.equal(remoteForB[0].nodeId, meshA.nodeId);

  const byId = await meshB.getRemoteRoom(record.id);
  assert.equal(byId?.playerCount, 1);

  // Nó dono NÃO vê a própria sala como remota.
  assert.equal((await meshA.listRemoteRooms()).length, 0);
  await meshA.markRoomClosed(record.id, "test");
  assert.equal((await meshB.listRemoteRooms()).length, 0);
});

test("mesh dedupe: fingerprint igual dentro do throttle não reescreve", async () => {
  const mesh = new RoomEventMesh({ nodeId: "mesh-test-throttle", enabled: false });
  const record = makeRecord({ nodeId: mesh.nodeId });
  try {
    assert.equal(await mesh.mirrorRoom(record), "mirrored");
    assert.equal(await mesh.mirrorRoom({ ...record }), "throttled");
    const changed = makeRecord({ id: record.id, playerCount: 2, nodeId: mesh.nodeId });
    assert.equal(await mesh.mirrorRoom(changed), "mirrored");
  } finally {
    await mesh.markRoomClosed(record.id, "cleanup");
  }
});

test("mesh reconcile: lease expirado de nó morto derruba o registro e emite room_lost", async () => {
  const meshA = new RoomEventMesh({ nodeId: "mesh-test-dead-node", enabled: false });
  const meshB = new RoomEventMesh({ nodeId: "mesh-test-survivor", enabled: false });

  const record = makeRecord({ nodeId: meshA.nodeId });
  await meshA.mirrorRoom(record);

  const lost: { id: string; reason: string }[] = [];
  meshB.onRoomLost((lostRecord, reason) => lost.push({ id: lostRecord.id, reason }));

  // Nó A "morre": sem heartbeat, o lease não é renovado. Força expiração
  // tocando o barramento local com TTL no passado via nova sala e removendo.
  const result = await meshB.reconcile(new Set());
  // Lease ainda vivo (mirror toca lease com TTL 30s) → nada derrubado ainda.
  assert.equal(result.dropped.length, 0);

  // Expira manualmente o lease no barramento local (simula morte do nó A).
  assert.equal(__expireLocalLeaseForTests(record.id), true, "lease deveria existir após mirror");

  const afterDeath = await meshB.reconcile(new Set());
  assert.equal(afterDeath.dropped.length, 1);
  assert.equal(afterDeath.dropped[0].id, record.id);
  assert.equal(lost.length, 1);
  assert.equal(lost[0].reason, "lease_expired");
  assert.equal((await meshB.listRemoteRooms()).length, 0);
});

test("mesh reconcile: registro self órfão (nó reiniciou) é limpo", async () => {
  const mesh = new RoomEventMesh({ nodeId: "mesh-test-orphan", enabled: false });
  // Registro com ESTE nodeId mas sala que não existe mais localmente.
  await mesh.mirrorRoom(makeRecord({ id: "orphan_1", nodeId: mesh.nodeId }));
  const result = await mesh.reconcile(new Set(["live_room"]));
  assert.deepEqual(result.staleSelf, ["orphan_1"]);
  assert.equal((await mesh.listRemoteRooms()).length, 0);
});

test("mesh invite: código de convite de outro nó é encontrado; privado não lista", async () => {
  const meshA = new RoomEventMesh({ nodeId: "mesh-test-invite-a", enabled: false });
  const meshB = new RoomEventMesh({ nodeId: "mesh-test-invite-b", enabled: false });

  try {
    await meshA.mirrorRoom(makeRecord({
      id: "private-invite-room",
      nodeId: meshA.nodeId,
      isPrivate: true,
      inviteCode: "PRIVKX42",
      status: "LOBBY",
    }));
    await meshA.mirrorRoom(makeRecord({
      id: "public-room-1",
      nodeId: meshA.nodeId,
      isPrivate: false,
      status: "LOBBY",
    }));

    // Join por convite cross-node encontra o privado pelo código.
    const found = await meshB.findRemoteByInviteCode("privkx42"); // case-insensitive
    assert.equal(found?.isPrivate, true);

    // Listagem de lobbies públicos EXCLUI o privado.
    await meshB.refreshRemoteCache();
    const lobbies = meshB.listRemoteLobbiesSync();
    assert.equal(lobbies.length, 1);
    assert.equal(lobbies[0].id, "public-room-1");

    // Cache síncrono também resolve getRoomSummary cross-node.
    assert.equal(meshB.findCachedByInviteCode("PRIVKX42")?.isPrivate, true);
  } finally {
    await meshA.markRoomClosed("private-invite-room", "cleanup");
    await meshA.markRoomClosed("public-room-1", "cleanup");
  }
});

// ─── 2) RoomManager integrado ao mesh ───────────────────────────────────────

test("RoomManager espelha salas no mesh e limpa ao destruir", async () => {
  const mesh = (roomManager as any).mesh as RoomEventMesh;
  const rooms: Map<string, any> = (roomManager as any).rooms;
  const userId = `mesh-owner-${Date.now()}`;
  const ws = {
    readyState: 1,
    sent: [] as any[],
    send(raw: string) { this.sent.push(JSON.parse(raw)); },
  };

  // createLobbyFromMatchmaking: sem dependência de banco (stats com fallback).
  const roomId = await (roomManager as any).createLobbyFromMatchmaking(
    [{ userId, displayName: "Host", rating: 1000, ws }],
    "CIGKV",
  );
  assert.ok(rooms.has(roomId), "sala deveria existir localmente");

  // Mirror assíncrono (fire-and-forget) — cede o microtask queue.
  await new Promise((resolve) => setImmediate(resolve));

  // Registro no store com ESTE nó (não é "remoto" para si mesmo).
  assert.equal(await mesh.getRemoteRoom(roomId), null);
  const stored = await (mesh as any).store.getRecord(roomId);
  assert.equal(stored?.playerCount, 1);
  assert.equal(stored?.isPrivate, false);
  assert.equal(stored?.nodeId, mesh.nodeId);
  assert.equal(stored?.hostId, userId);

  // listLobbies local inclui a sala pública.
  const listed = (roomManager as any).listLobbies().filter((e: any) => e.id === roomId);
  assert.equal(listed.length, 1);

  // Último jogador sai → sala destruída → registro sai do índice.
  (roomManager as any).leaveRoom(userId);
  await new Promise((resolve) => setImmediate(resolve));
  const afterClose = await (mesh as any).store.getRecord(roomId);
  assert.equal(afterClose, null);
  assert.equal(rooms.has(roomId), false);
});

test("join_code em sala de OUTRO nó responde ROOM_REMOTE_NODE sem vazar estado", async () => {
  const mesh = (roomManager as any).mesh as RoomEventMesh;
  const other = new RoomEventMesh({ nodeId: "mesh-test-remote-node", enabled: false });

  const record = makeRecord({
    nodeId: other.nodeId,
    isPrivate: true,
    inviteCode: "REMOTEX1",
    status: "LOBBY",
    hostId: "other-host",
  });
  await other.mirrorRoom(record);

  // M1: sem convite ligado a ESTE jogador, o túnel NEM abre — rejeição
  // uniforme sem oráculo (não revela sala remota/estado).
  const stranger = fakeSocket();
  await (roomManager as any).handleMessage("mesh-stranger-9", "Visitante", stranger.socket, {
    type: "join_code", code: "REMOTEX1",
  });
  const strangerError = stranger.messages.find((m: any) => m.type === "error");
  assert.equal(strangerError?.code, "INVITE_REQUIRED");
  assert.equal(strangerError?.message, "Código de lobby inválido, expirado ou sem convite válido para este operativo");

  // Com convite PENDENTE ligado ao convidado (visível cross-node no mesh),
  // a origem pré-verifica e responde o redirecionamento ROOM_REMOTE_NODE
  // (relay indisponível neste cenário de teste) — sem vazar estado.
  const now = Date.now();
  await mesh.issueInvite({
    code: "REMOTEX1", roomId: record.id, worldId: record.worldId, nodeId: other.nodeId,
    invitedUserId: "mesh-guest-1", issuedBy: "other-host", createdAt: now,
    expiresAt: now + 60 * 60_000, status: "pending", usedAt: null,
  }, 60 * 60_000);

  const guest = fakeSocket();
  await (roomManager as any).handleMessage("mesh-guest-1", "Visitante", guest.socket, {
    type: "join_code", code: "REMOTEX1",
  });

  const error = guest.messages.find((m: any) => m.type === "error");
  assert.ok(error, "deveria responder erro direcionado");
  assert.equal(error.code, "ROOM_REMOTE_NODE");
  assert.equal(error.roomId, record.id);
  assert.equal(error.nodeId, other.nodeId);
  // Privacidade: sem convite no payload, sem jogadores, sem host.
  assert.equal(error.inviteCode, undefined);
  assert.equal(error.players, undefined);
  assert.equal(error.hostId, undefined);

  // Código inexistente continua com a mensagem canônica uniforme (M1).
  const guest2 = fakeSocket();
  await (roomManager as any).handleMessage("mesh-guest-2", "Visitante", guest2.socket, {
    type: "join_code", code: "NAOEXISTE99",
  });
  const invalid = guest2.messages.find((m: any) => m.type === "error");
  assert.equal(invalid.message, "Código de lobby inválido, expirado ou sem convite válido para este operativo");
  assert.equal(invalid.code, "INVITE_REQUIRED");

  await mesh.markRoomClosed(record.id, "cleanup");
  await mesh.purgeInvites("REMOTEX1");
});

test("getRoomSummary cross-node usa o cache do mesh com marca remote", async () => {
  const mesh = (roomManager as any).mesh as RoomEventMesh;
  const other = new RoomEventMesh({ nodeId: "mesh-test-summary-node", enabled: false });
  const record = makeRecord({ nodeId: other.nodeId, status: "COUNTDOWN", playerCount: 4 });
  await other.mirrorRoom(record);

  // Cache síncrono vazio até refresh.
  assert.equal((roomManager as any).getRoomSummary(record.id), null);

  await mesh.refreshRemoteCache();
  const summary = (roomManager as any).getRoomSummary(record.id);
  assert.equal(summary?.remote, true);
  assert.equal(summary?.nodeId, other.nodeId);
  assert.equal(summary?.status, "COUNTDOWN");
  assert.equal(summary?.playerCount, 4);

  await mesh.markRoomClosed(record.id, "test-cleanup");
});

test("listLobbies mescla lobbies remotos do mesh (públicos apenas)", async () => {
  const mesh = (roomManager as any).mesh as RoomEventMesh;
  const other = new RoomEventMesh({ nodeId: "mesh-test-list-node", enabled: false });
  await other.mirrorRoom(makeRecord({
    id: "remote-public-1", nodeId: other.nodeId, isPrivate: false, playerCount: 3,
  }));
  await other.mirrorRoom(makeRecord({
    id: "remote-private-1", nodeId: other.nodeId, isPrivate: true, inviteCode: "SECRETX9",
  }));

  await mesh.refreshRemoteCache();
  const lobbies = (roomManager as any).listLobbies();
  const remoteIds = lobbies.filter((e: any) => e.remote).map((e: any) => e.id);
  assert.deepEqual(remoteIds.sort(), ["remote-public-1"]);

  await mesh.markRoomClosed("remote-public-1", "test-cleanup");
  await mesh.markRoomClosed("remote-private-1", "test-cleanup");
});

// ─── Convites ligados a jogador (roadmap M1) — store do mesh ────────────────

import type { RoomInviteRecord } from "../../server/game/RoomEventMesh.ts";

function makeInvite(overrides: Partial<RoomInviteRecord> = {}): RoomInviteRecord {
  const now = Date.now();
  return {
    code: "MESHINV1",
    roomId: "room-invite-1",
    worldId: "CIGKV",
    nodeId: "node-A",
    invitedUserId: "user-a",
    issuedBy: "host-1",
    createdAt: now,
    expiresAt: now + 60 * 60_000,
    status: "pending",
    usedAt: null,
    ...overrides,
  };
}

test("mesh invite store: convite emitido num nó é legível em outro (barramento local)", async () => {
  const meshA = new RoomEventMesh({ nodeId: "mesh-inv-node-a", enabled: false });
  const meshB = new RoomEventMesh({ nodeId: "mesh-inv-node-b", enabled: false });

  await meshA.issueInvite(makeInvite({ nodeId: meshA.nodeId }), 60 * 60_000);

  // Leitura cruzada: a origem do túnel pré-verifica o convite no índice.
  const seenByB = await meshB.getPendingInvite("MESHINV1", "user-a");
  assert.equal(seenByB?.roomId, "room-invite-1");
  assert.equal(seenByB?.status, "pending");

  // Quota: listInvites enxerga os vivos do código a partir de qualquer nó.
  assert.equal((await meshB.listInvites("MESHINV1")).length, 1);

  // Consumo único (dono): primeira chamada consome; segunda falha.
  const consumed = await meshA.consumeInvite("MESHINV1", "user-a");
  assert.equal(consumed?.status, "used");
  assert.notEqual(consumed?.usedAt, null);
  const replay = await meshA.consumeInvite("MESHINV1", "user-a");
  assert.equal(replay, null);
  // E o consumo é visível cross-node (o used impede getPending).
  assert.equal(await meshB.getPendingInvite("MESHINV1", "user-a"), null);

  // Revoada (kick do host) remove o registro.
  await meshA.issueInvite(makeInvite({ invitedUserId: "user-c", nodeId: meshA.nodeId }), 60 * 60_000);
  await meshA.revokeInvite("MESHINV1", "user-c");
  assert.equal(await meshA.getPendingInvite("MESHINV1", "user-c"), null);

  // Purge (sala fechada) limpa tudo do código.
  await meshA.purgeInvites("MESHINV1");
  assert.deepEqual(await meshA.listInvites("MESHINV1"), []);
});

test("mesh invite store: expiração lógica (TTL) e re-convite refrescam o registro", async () => {
  const mesh = new RoomEventMesh({ nodeId: "mesh-inv-ttl", enabled: false });

  await mesh.issueInvite(makeInvite({ invitedUserId: "user-exp", expiresAt: Date.now() - 1 }), 60 * 60_000);
  assert.equal(await mesh.getPendingInvite("MESHINV1", "user-exp"), null);
  // Expirados são filtrados também na listagem de quota.
  assert.deepEqual(await mesh.listInvites("MESHINV1"), []);

  // Re-convite do mesmo alvo sobrescreve (refresh de TTL/status).
  await mesh.issueInvite(makeInvite({ invitedUserId: "user-refresh", status: "used", usedAt: Date.now() }), 60 * 60_000);
  assert.equal(await mesh.getPendingInvite("MESHINV1", "user-refresh"), null);
  await mesh.issueInvite(makeInvite({ invitedUserId: "user-refresh" }), 60 * 60_000);
  const refreshed = await mesh.getPendingInvite("MESHINV1", "user-refresh");
  assert.equal(refreshed?.status, "pending");

  await mesh.purgeInvites("MESHINV1");
});

test("mesh invite store: adaptador Redis (hSet/hGet/hVals) com a mesma semântica", async () => {
  const hashes = new Map<string, Map<string, string>>();
  const client: any = {
    hSet: async (key: string, field: string, value: string) => {
      if (!hashes.has(key)) hashes.set(key, new Map());
      hashes.get(key)!.set(field, value);
    },
    hDel: async (key: string, field: string) => { hashes.get(key)?.delete(field); },
    hGet: async (key: string, field: string) => hashes.get(key)?.get(field) ?? null,
    hVals: async (key: string) => [...(hashes.get(key)?.values() ?? [])],
    set: async (_key: string, _value: string, _options: { PX: number }) => undefined,
    exists: async () => 0,
  };

  const mesh = new RoomEventMesh({
    nodeId: "mesh-inv-redis",
    enabled: true,
    prefix: "khaaos_invite_test",
    redisClientProvider: () => client,
  });

  await mesh.issueInvite(makeInvite({ invitedUserId: "user-r1" }), 60 * 60_000);
  await mesh.issueInvite(makeInvite({ invitedUserId: "user-r2" }), 60 * 60_000);
  assert.equal((await mesh.listInvites("MESHINV1")).length, 2);

  const consumed = await mesh.consumeInvite("MESHINV1", "user-r1");
  assert.equal(consumed?.status, "used");
  assert.equal(await mesh.consumeInvite("MESHINV1", "user-r1"), null);
  assert.equal((await mesh.getPendingInvite("MESHINV1", "user-r2"))?.status, "pending");

  await mesh.revokeInvite("MESHINV1", "user-r2");
  assert.equal(await mesh.getPendingInvite("MESHINV1", "user-r2"), null);
  await mesh.purgeInvites("MESHINV1");
  assert.deepEqual(await mesh.listInvites("MESHINV1"), []);

  // Sem provider Redis conectado → fallback barramento local (degradação).
  const fallback = new RoomEventMesh({
    nodeId: "mesh-inv-fallback",
    enabled: true,
    redisClientProvider: () => null,
  });
  await fallback.issueInvite(makeInvite({ code: "LOCALINV9", invitedUserId: "user-l1" }), 60 * 60_000);
  assert.equal((await fallback.getPendingInvite("LOCALINV9", "user-l1"))?.status, "pending");
  await fallback.purgeInvites("LOCALINV9");
});
