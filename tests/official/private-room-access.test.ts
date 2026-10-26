import assert from "node:assert/strict";
import { test } from "node:test";

process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/khaaos_test";
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
  try {
    await (roomManager as any).joinByInviteCode("invited-user", "Convidado", fakeSocket().socket, " kx7t2q ");

    assert.equal(joinArguments?.[3], id);
    assert.equal(joinArguments?.[4], room.worldId);
    assert.equal(joinArguments?.[5], true);
  } finally {
    (roomManager as any).joinRoom = originalJoinRoom;
    rooms.delete(id);
  }
});
