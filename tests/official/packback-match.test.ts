import assert from "node:assert/strict";
import { test } from "node:test";

process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/khaaos_test";
process.env.WS_TOKEN_SECRET ??= "official-packback-integration-test-key-32-bytes";

const [{ roomManager }, { storage }] = await Promise.all([
  import("../../server/game/RoomManager.ts"),
  import("../../server/storage.ts"),
]);

async function makeCountdownRoom(userId: string) {
  const messages: any[] = [];
  const ws = { readyState: 1, send: (raw: string) => messages.push(JSON.parse(raw)) } as any;
  const roomId = await roomManager.createLobbyFromMatchmaking([{
    userId,
    displayName: "Operativo PackBack",
    rating: 1000,
    ws,
  }]);
  const room = (roomManager as any).rooms.get(roomId);
  room.status = "COUNTDOWN";
  room.countdownSeconds = 0;
  return { roomId, room, player: room.players.get(userId), messages };
}

test("RoomManager loads the authenticated player's durable PackBack before combat starts", async () => {
  const userId = "packback-integration-player";
  const originalGetPlayerStats = storage.getPlayerStats;
  const originalGetEquippedItems = storage.getEquippedItems;
  storage.getPlayerStats = async () => ({
    health: 73, maxHealth: 100, status: "VIVO", kills: 0, rating: 1100,
  } as Awaited<ReturnType<typeof storage.getPlayerStats>>);
  storage.getEquippedItems = async (requestedUserId) => requestedUserId === userId ? ([
    { id: 11, type: "ARMA", isEquipped: true, durability: "75", maxDurability: "100", stats: { damage: 90 } },
    { id: 12, type: "DEFESA", isEquipped: true, durability: "60", maxDurability: "100", stats: { defense: 40 } },
    { id: 13, type: "ARMA", isEquipped: true, durability: "0", maxDurability: "100", stats: { damage: 200 } },
    { id: 14, name: "Kit Médico", type: "CURATIVO", rarity: "RARO", isEquipped: true, durability: "40", maxDurability: "100", stats: { heal: 25 } },
    { id: 15, name: "Mochila Tática", type: "UTILIDADE", isEquipped: true, durability: "100", maxDurability: "100", stats: { capacity: 20 } },
  ] as any) : [];

  let roomId: string | undefined;
  try {
    const prepared = await makeCountdownRoom(userId);
    roomId = prepared.roomId;
    await (roomManager as any).beginMatch(prepared.room);

    assert.equal(prepared.room.status, "IN_PROGRESS");
    assert.deepEqual(prepared.player.packbackItemIds, [11, 12, 14, 15]);
    assert.equal(prepared.player.equippedDamage, 90);
    assert.equal(prepared.player.equippedRange, 15);
    assert.equal(prepared.player.maxHealth, 110);
    assert.equal(prepared.player.health, 110);
    assert.equal(prepared.player.carryCapacity, 70);
    const ready = prepared.messages.find((message) => message.type === "packback_ready");
    assert.deepEqual(ready.items.map((item: any) => item.id), [14]);
    assert.equal(ready.items[0].stats.heal, 25);
  } finally {
    if (roomId) roomManager.leaveRoom(userId);
    roomManager.stop();
    storage.getPlayerStats = originalGetPlayerStats;
    storage.getEquippedItems = originalGetEquippedItems;
  }
});

test("RoomManager returns to the lobby instead of starting when PackBack validation fails", async () => {
  const userId = "packback-storage-failure-player";
  const originalGetPlayerStats = storage.getPlayerStats;
  const originalGetEquippedItems = storage.getEquippedItems;
  storage.getPlayerStats = async () => ({
    health: 100, maxHealth: 100, status: "VIVO", kills: 0, rating: 1000,
  } as Awaited<ReturnType<typeof storage.getPlayerStats>>);
  storage.getEquippedItems = async () => { throw new Error("storage unavailable"); };

  let roomId: string | undefined;
  try {
    const prepared = await makeCountdownRoom(userId);
    roomId = prepared.roomId;
    await (roomManager as any).beginMatch(prepared.room);

    assert.equal(prepared.room.status, "LOBBY");
    assert.equal(prepared.player.isReady, false);
    assert.equal(prepared.room.tickHandle, null);
  } finally {
    if (roomId) roomManager.leaveRoom(userId);
    roomManager.stop();
    storage.getPlayerStats = originalGetPlayerStats;
    storage.getEquippedItems = originalGetEquippedItems;
  }
});

test("personalized room snapshots keep PackBack capacity and Adrenalina private", () => {
  const player = (userId: string, carryCapacity: number) => ({
    userId, displayName: userId, posX: 50, posY: 50, carryCapacity,
    carriedWeight: 20, speedBoostUntil: 12345, speedMultiplier: 1.2,
    health: 80, maxHealth: 100, status: "VIVO", kills: 0,
    isConnected: true, isReady: false, isHost: false, rating: 1000,
  });
  const room = { hostId: "owner", players: new Map([["owner", player("owner", 70)], ["rival", player("rival", 50)]]) };

  const ownerView = (roomManager as any).serializePlayers(room, "owner");
  assert.equal(ownerView.find((entry: any) => entry.userId === "owner").carryCapacity, 70);
  assert.equal(ownerView.find((entry: any) => entry.userId === "rival").carryCapacity, undefined);

  const rivalView = (roomManager as any).serializePlayers(room, "rival");
  assert.equal(rivalView.find((entry: any) => entry.userId === "owner").speedBoostUntil, undefined);
  assert.equal(rivalView.find((entry: any) => entry.userId === "rival").speedMultiplier, 1.2);
});
