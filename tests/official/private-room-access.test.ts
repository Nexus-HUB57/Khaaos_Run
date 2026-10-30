import assert from "node:assert/strict";
import { test } from "node:test";

if (!process.env.DATABASE_URL?.trim()) process.env.DATABASE_URL = "postgres://test:test@127.0.0.1:5432/khaaos_test";
process.env.WS_TOKEN_SECRET ??= "official-private-room-test-key-32-bytes";

const { roomManager } = await import("../../server/game/RoomManager.ts");
const rooms: Map<string, any> = (roomManager as any).rooms;

function privateRoom(id: string, inviteCode = "KX7T2Q") {
  return {
    id,
    worldId: "CIGKV",
    status: "LOBBY",
    maxPlayers: 16,
    players: new Map(),
    isPrivate: true,
    inviteCode,
  };
}

function fakeSocket() {
  const messages: any[] = [];
  return {
    messages,
    socket: {
      readyState: 1,
      send(raw: string) { messages.push(JSON.parse(raw)); },
    },
  };
}

test("private War’I rooms reject a normal join by room ID without disclosing existence", async () => {
  const id = `private-access-${Date.now()}-${Math.random()}`;
  const userId = `${id}-guest`;
  const room = privateRoom(id);
  const client = fakeSocket();
  rooms.set(id, room);
  try {
    await (roomManager as any).handleMessage(userId, "Visitante", client.socket, {
      type: "join", roomId: id, worldId: "CIGKV",
    });

    assert.deepEqual(client.messages, [{ type: "error", message: "Sala não encontrada" }]);
    assert.equal(room.players.size, 0);
    assert.equal((roomManager as any).userToRoom.has(userId), false);

    const wrongWorldClient = fakeSocket();
    await (roomManager as any).handleMessage(`${userId}-wrong-world`, "Visitante", wrongWorldClient.socket, {
      type: "join", roomId: id, worldId: "W1",
    });
    assert.deepEqual(wrongWorldClient.messages, [{ type: "error", message: "Sala não encontrada" }]);
  } finally {
    rooms.delete(id);
  }
});

test("public lobby listing excludes private War’I rooms", () => {
  const privateId = `private-list-${Date.now()}-${Math.random()}`;
  const publicId = `${privateId}-public`;
  rooms.set(privateId, privateRoom(privateId));
  rooms.set(publicId, { ...privateRoom(publicId), isPrivate: false, inviteCode: null });
  try {
    const listedIds = roomManager.listLobbies().map((entry: any) => entry.id);
    assert.equal(listedIds.includes(privateId), false);
    assert.equal(listedIds.includes(publicId), true);
  } finally {
    rooms.delete(privateId);
    rooms.delete(publicId);
  }
});

test("a valid invite code reaches the authorized private-room join path", async () => {
  const id = `private-invite-${Date.now()}-${Math.random()}`;
  const room = privateRoom(id, "KX7T2Q");
  const originalJoinRoom = (roomManager as any).joinRoom;
  let joinArguments: any[] | undefined;
  rooms.set(id, room);
  (roomManager as any).joinRoom = async (...args: any[]) => { joinArguments = args; };
  const now = Date.now();
  const mesh = (roomManager as any).mesh;
  // M1: o código só autoriza com convite PENDENTE ligado a este jogador.
  await mesh.issueInvite({
    code: "KX7T2Q", roomId: id, worldId: room.worldId, nodeId: mesh.nodeId,
    invitedUserId: "invited-user", issuedBy: "host-1", createdAt: now,
    expiresAt: now + 60 * 60_000, status: "pending", usedAt: null,
  }, 60 * 60_000);
  try {
    await (roomManager as any).joinByInviteCode("invited-user", "Convidado", fakeSocket().socket, " kx7t2q ");

    assert.equal(joinArguments?.[3], id);
    assert.equal(joinArguments?.[4], room.worldId);
    assert.equal(joinArguments?.[5], true);
    // Consumo único: o convite foi marcado como usado.
    const consumed = await mesh.store.getInvite("KX7T2Q", "invited-user");
    assert.equal(consumed?.status, "used");
  } finally {
    (roomManager as any).joinRoom = originalJoinRoom;
    rooms.delete(id);
    await mesh.purgeInvites("KX7T2Q");
  }
});

// ─── Roadmap M1 — convite ligado a jogador/sala ──────────────────────────────

import type { RoomInviteRecord } from "../../server/game/RoomEventMesh.ts";
const {
  INVITE_HOST_WINDOW_LIMIT,
  INVITE_ROOM_PENDING_LIMIT,
} = await import("../../server/game/RoomManager.ts");

const mesh = (roomManager as any).mesh;

function makeInvite(overrides: Partial<RoomInviteRecord> = {}): RoomInviteRecord {
  const now = Date.now();
  return {
    code: "KX7T2Q",
    roomId: "room-x",
    worldId: "CIGKV",
    nodeId: mesh.nodeId,
    invitedUserId: "user-a",
    issuedBy: "host-1",
    createdAt: now,
    expiresAt: now + 60 * 60_000,
    status: "pending",
    usedAt: null,
    ...overrides,
  };
}

async function seedInvite(overrides: Partial<RoomInviteRecord> = {}) {
  const record = makeInvite(overrides);
  await mesh.issueInvite(record, 60 * 60_000);
  return record;
}

function fullPlayer(userId: string, isHost = false) {
  return {
    userId,
    displayName: userId,
    posX: 50,
    posY: 50,
    health: 100,
    maxHealth: 100,
    status: "ALIVE",
    kills: 0,
    isConnected: true,
    isReady: false,
    isHost,
    rating: 1000,
  };
}

const INVITE_REJECTION = {
  type: "error",
  code: "INVITE_REQUIRED",
  message: "Código de lobby inválido, expirado ou sem convite válido para este operativo",
};

test("join_code sem convite é rejeitado com rejeição uniforme (sem oráculo de existência)", async () => {
  const id = `invite-none-${Date.now()}`;
  const room = privateRoom(id, "KX7T2Q");
  rooms.set(id, room);
  try {
    const client = fakeSocket();
    await (roomManager as any).handleMessage("intruder", "Intruso", client.socket, {
      type: "join_code", code: " kx7t2q ",
    });
    assert.deepEqual(client.messages, [INVITE_REJECTION]);

    // Código INEXISTENTE produz a MESMA resposta (não vaza existência).
    const ghost = fakeSocket();
    await (roomManager as any).handleMessage("intruder", "Intruso", ghost.socket, {
      type: "join_code", code: "ZZZZZZZZ",
    });
    assert.deepEqual(ghost.messages, [INVITE_REJECTION]);
    assert.equal(room.players.size, 0);
  } finally {
    rooms.delete(id);
    await mesh.purgeInvites("KX7T2Q");
  }
});

test("convite ligado a OUTRO jogador não autoriza a entrada", async () => {
  const id = `invite-other-${Date.now()}`;
  const room = privateRoom(id, "KX7T2Q");
  rooms.set(id, room);
  await seedInvite({ roomId: id, invitedUserId: "user-a" });
  try {
    const client = fakeSocket();
    await (roomManager as any).handleMessage("user-b", "Intruso B", client.socket, {
      type: "join_code", code: "KX7T2Q",
    });
    assert.deepEqual(client.messages, [INVITE_REJECTION]);
    assert.equal(room.players.size, 0);
    // Convite de user-a segue pendente (consumo é por usuário).
    const pending = await mesh.getPendingInvite("KX7T2Q", "user-a");
    assert.equal(pending?.status, "pending");
  } finally {
    rooms.delete(id);
    await mesh.purgeInvites("KX7T2Q");
  }
});

test("convite válido autoriza EXATAMENTE um uso", async () => {
  const id = `invite-use-${Date.now()}`;
  const room = privateRoom(id, "KX7T2Q");
  rooms.set(id, room);
  await seedInvite({ roomId: id, invitedUserId: "user-a" });
  const originalJoinRoom = (roomManager as any).joinRoom;
  let joinCalls = 0;
  (roomManager as any).joinRoom = async (..._args: any[]) => { joinCalls += 1; };
  try {
    const client = fakeSocket();
    await (roomManager as any).handleMessage("user-a", "Convidado", client.socket, {
      type: "join_code", code: "KX7T2Q",
    });
    assert.equal(joinCalls, 1);
    assert.deepEqual(client.messages, []);

    // Segunda tentativa com o MESMO convite (uso único) → rejeição uniforme.
    const replay = fakeSocket();
    await (roomManager as any).handleMessage("user-a", "Convidado", replay.socket, {
      type: "join_code", code: "KX7T2Q",
    });
    assert.deepEqual(replay.messages, [INVITE_REJECTION]);
    assert.equal(joinCalls, 1);
  } finally {
    (roomManager as any).joinRoom = originalJoinRoom;
    rooms.delete(id);
    await mesh.purgeInvites("KX7T2Q");
  }
});

test("convite expirado é rejeitado (TTL)", async () => {
  const id = `invite-exp-${Date.now()}`;
  const room = privateRoom(id, "KX7T2Q");
  rooms.set(id, room);
  await seedInvite({ roomId: id, invitedUserId: "user-a", expiresAt: Date.now() - 1_000 });
  try {
    const client = fakeSocket();
    await (roomManager as any).handleMessage("user-a", "Convidado", client.socket, {
      type: "join_code", code: "KX7T2Q",
    });
    assert.deepEqual(client.messages, [INVITE_REJECTION]);
    assert.equal(room.players.size, 0);
  } finally {
    rooms.delete(id);
    await mesh.purgeInvites("KX7T2Q");
  }
});

test("invite_player é exclusivo do host de lobby privado", async () => {
  const id = `invite-perm-${Date.now()}`;
  const room = { ...privateRoom(id, "KX7T2Q"), hostId: "host-1" };
  rooms.set(id, room);
  (roomManager as any).userToRoom.set("guest-9", id);
  try {
    const client = fakeSocket();
    await (roomManager as any).handleMessage("guest-9", "Visitante", client.socket, {
      type: "invite_player", targetUserId: "user-a",
    });
    assert.equal(client.messages[0]?.code, "INVITE_FORBIDDEN");
    assert.equal(await mesh.getPendingInvite("KX7T2Q", "user-a"), null);
  } finally {
    (roomManager as any).userToRoom.delete("guest-9");
    rooms.delete(id);
  }
});

test("host emite convite ligado a jogador e recebe invite_issued", async () => {
  const id = `invite-issue-${Date.now()}`;
  const room = { ...privateRoom(id, "KX7T2Q"), hostId: "host-1" };
  rooms.set(id, room);
  (roomManager as any).userToRoom.set("host-1", id);
  (roomManager as any).inviteIssueLog.delete("host-1");
  try {
    const client = fakeSocket();
    await (roomManager as any).handleMessage("host-1", "Host", client.socket, {
      type: "invite_player", targetUserId: "user-a",
    });
    assert.equal(client.messages.length, 1);
    assert.equal(client.messages[0].type, "invite_issued");
    assert.equal(client.messages[0].invitedUserId, "user-a");
    assert.equal(client.messages[0].roomId, id);
    const pending = await mesh.getPendingInvite("KX7T2Q", "user-a");
    assert.equal(pending?.roomId, id);
    assert.equal(pending?.issuedBy, "host-1");
    assert.equal(pending?.status, "pending");
  } finally {
    (roomManager as any).userToRoom.delete("host-1");
    (roomManager as any).inviteIssueLog.delete("host-1");
    rooms.delete(id);
    await mesh.purgeInvites("KX7T2Q");
  }
});

test("quota: janela móvel do host limita emissões de convite", async () => {
  const id = `invite-hostq-${Date.now()}`;
  const room = { ...privateRoom(id, "KX7T2Q"), hostId: "host-1" };
  rooms.set(id, room);
  (roomManager as any).userToRoom.set("host-1", id);
  (roomManager as any).inviteIssueLog.delete("host-1");
  try {
    for (let i = 0; i < INVITE_HOST_WINDOW_LIMIT; i += 1) {
      const client = fakeSocket();
      await (roomManager as any).handleMessage("host-1", "Host", client.socket, {
        type: "invite_player", targetUserId: `target-${i}`,
      });
      assert.equal(client.messages[0]?.type, "invite_issued", `convite ${i}`);
    }
    const blocked = fakeSocket();
    await (roomManager as any).handleMessage("host-1", "Host", blocked.socket, {
      type: "invite_player", targetUserId: "target-overflow",
    });
    assert.equal(blocked.messages[0]?.code, "INVITE_HOST_LIMIT");
  } finally {
    (roomManager as any).userToRoom.delete("host-1");
    (roomManager as any).inviteIssueLog.delete("host-1");
    rooms.delete(id);
    await mesh.purgeInvites("KX7T2Q");
  }
});

test("quota: pendentes por sala limita novos alvos (re-convite do mesmo alvo refresca)", async () => {
  const id = `invite-roomq-${Date.now()}`;
  const room = { ...privateRoom(id, "KX7T2Q"), hostId: "host-1" };
  rooms.set(id, room);
  (roomManager as any).userToRoom.set("host-1", id);
  (roomManager as any).inviteIssueLog.delete("host-1");
  try {
    for (let i = 0; i < INVITE_ROOM_PENDING_LIMIT; i += 1) {
      await seedInvite({ roomId: id, invitedUserId: `pending-${i}` });
    }
    const blocked = fakeSocket();
    await (roomManager as any).handleMessage("host-1", "Host", blocked.socket, {
      type: "invite_player", targetUserId: "pending-overflow",
    });
    assert.equal(blocked.messages[0]?.code, "INVITE_ROOM_LIMIT");

    // Re-convite de alvo JÁ convidado refresca o registro (não conta quota).
    const refresh = fakeSocket();
    await (roomManager as any).handleMessage("host-1", "Host", refresh.socket, {
      type: "invite_player", targetUserId: "pending-0",
    });
    assert.equal(refresh.messages[0]?.type, "invite_issued");
  } finally {
    (roomManager as any).userToRoom.delete("host-1");
    (roomManager as any).inviteIssueLog.delete("host-1");
    rooms.delete(id);
    await mesh.purgeInvites("KX7T2Q");
  }
});

test("room_state expõe inviteCode SOMENTE ao host (sem leak para convidados)", () => {
  const id = `invite-leak-${Date.now()}`;
  const room: any = {
    ...privateRoom(id, "KX7T2Q"), hostId: "host-1", players: new Map(),
    loot: [], currentPhase: 1, phaseStartedAt: Date.now(), isShrinking: false,
    centerX: 50, centerY: 50,
  };
  const hostClient = fakeSocket();
  const guestClient = fakeSocket();
  room.players.set("host-1", { ...fullPlayer("host-1", true), ws: hostClient.socket });
  room.players.set("guest-1", { ...fullPlayer("guest-1"), ws: guestClient.socket });
  rooms.set(id, room);
  try {
    (roomManager as any).broadcastRoomState(room);
    const hostMsg = hostClient.messages.find((m: any) => m.type === "room_state");
    const guestMsg = guestClient.messages.find((m: any) => m.type === "room_state");
    assert.equal(hostMsg?.room?.inviteCode, "KX7T2Q");
    assert.equal(guestMsg?.room?.inviteCode, undefined);
    assert.equal(guestMsg?.room?.isPrivate, true);
  } finally {
    rooms.delete(id);
  }
});

test("kick do host revoga o convite pendente do removido", async () => {
  const id = `invite-kick-${Date.now()}`;
  const room: any = { ...privateRoom(id, "KX7T2Q"), hostId: "host-1", players: new Map() };
  room.players.set("host-1", { ...fullPlayer("host-1", true), ws: fakeSocket().socket });
  rooms.set(id, room);
  (roomManager as any).userToRoom.set("host-1", id);
  await seedInvite({ roomId: id, invitedUserId: "target-kick" });
  try {
    assert.notEqual(await mesh.getPendingInvite("KX7T2Q", "target-kick"), null);
    (roomManager as any).hostKick("host-1", "target-kick");
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(await mesh.getPendingInvite("KX7T2Q", "target-kick"), null);
  } finally {
    (roomManager as any).userToRoom.delete("host-1");
    (roomManager as any).userToRoom.delete("target-kick");
    rooms.delete(id);
    await mesh.purgeInvites("KX7T2Q");
  }
});
