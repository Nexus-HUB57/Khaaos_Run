import assert from "node:assert/strict";
import { test } from "node:test";

process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/khaaos_test";
process.env.WS_TOKEN_SECRET ??= "official-packback-use-test-key-32-bytes";

const [{ roomManager }, { storage }] = await Promise.all([
  import("../../server/game/RoomManager.ts"),
  import("../../server/storage.ts"),
]);

function fakeSocket() {
  const messages: any[] = [];
  const socket = {
    readyState: 1,
    send: (raw: string) => messages.push(JSON.parse(raw)),
  };
  return { socket, messages };
}

async function prepareMatch(item: any, playerCount = 2) {
  const ownerId = `packback-use-owner-${Date.now()}-${Math.random()}`;
  item.userId = ownerId;
  const otherIds = Array.from({ length: playerCount - 1 }, (_, index) => `${ownerId}-other-${index}`);
  const originalGetPlayerStats = storage.getPlayerStats;
  const originalGetEquippedItems = storage.getEquippedItems;
  const originalGetItemForUser = storage.getItemForUser;
  const originalConsumeItemDurability = storage.consumeItemDurability;
  const originalCreateItem = storage.createItem;
  const ownerSocket = fakeSocket();
  let consumed = 0;

  storage.getPlayerStats = async () => ({
    health: 100, maxHealth: 100, status: "VIVO", kills: 0, rating: 1000,
  } as Awaited<ReturnType<typeof storage.getPlayerStats>>);
  storage.getEquippedItems = async (userId) => userId === ownerId ? [item] as any : [];
  storage.getItemForUser = async (id, userId) => id === item.id && userId === ownerId ? item : undefined;
  storage.consumeItemDurability = async (id, userId, amount) => {
    if (id !== item.id || userId !== ownerId || amount !== 10 || Number(item.durability) <= 0) return undefined;
    consumed += 1;
    item = { ...item, durability: String(Math.max(0, Number(item.durability) - amount)) };
    return item;
  };
  storage.createItem = async (values) => ({ ...values, id: 9900 } as any);

  const roomId = await roomManager.createLobbyFromMatchmaking([
    { userId: ownerId, displayName: "Operativo PackBack", rating: 1000, ws: ownerSocket.socket as any },
    ...otherIds.map((userId, index) => ({ userId, displayName: `Alvo ${index + 1}`, rating: 1000, ws: null })),
  ]);
  const room = (roomManager as any).rooms.get(roomId);
  if (room.countdownHandle) clearInterval(room.countdownHandle);
  room.countdownHandle = null;
  room.status = "COUNTDOWN";
  room.countdownSeconds = 0;
  await (roomManager as any).beginMatch(room);

  return {
    ownerId,
    otherIds,
    room,
    owner: room.players.get(ownerId),
    ownerSocket,
    get consumed() { return consumed; },
    async use(userId: string, id: number) {
      await (roomManager as any).handleMessage(userId, "Operativo", ownerSocket.socket, { type: "use_packback_item", itemId: id });
    },
    cleanup() {
      room.status = "LOBBY";
      for (const userId of [ownerId, ...otherIds]) roomManager.leaveRoom(userId);
      roomManager.stop();
      storage.getPlayerStats = originalGetPlayerStats;
      storage.getEquippedItems = originalGetEquippedItems;
      storage.getItemForUser = originalGetItemForUser;
      storage.consumeItemDurability = originalConsumeItemDurability;
      storage.createItem = originalCreateItem;
    },
  };
}

function makeItem(id: number, userId: string, type: string, stats: Record<string, number>) {
  return {
    id, userId, name: `Item ${id}`, type, rarity: "RARO", isEquipped: true,
    durability: "100", maxDurability: "100", stats,
  };
}

test("combat heal uses item-owned stats, caps at match max health, and persists durability atomically", async () => {
  const item = makeItem(301, "owner", "CURATIVO", { heal: 35 });
  const match = await prepareMatch(item);
  try {
    match.owner.health = 55;
    await match.use(match.ownerId, item.id);

    assert.equal(match.owner.health, 90);
    assert.equal(match.consumed, 1);
    assert.deepEqual(match.ownerSocket.messages.find((message) => message.type === "packback_ready").items.map((entry: any) => entry.id), [301]);
    const result = match.ownerSocket.messages.find((message) => message.type === "packback_item_used");
    assert.equal(result.durability, "90");
    assert.match(result.message, /\+35 de vitalidade/);
  } finally {
    match.cleanup();
  }
});

test("combat grenade damages only living opponents inside the authoritative radius", async () => {
  const item = makeItem(302, "owner", "UTILIDADE", { damage: 30, radius: 5 });
  const match = await prepareMatch(item, 3);
  try {
    const [nearId, farId] = match.otherIds;
    const near = match.room.players.get(nearId);
    const far = match.room.players.get(farId);
    match.owner.posX = 50; match.owner.posY = 50;
    near.posX = 53; near.posY = 50;
    far.posX = 70; far.posY = 70;

    await match.use(match.ownerId, item.id);

    assert.equal(near.health, 70);
    assert.equal(far.health, 100);
    assert.equal(match.owner.damageDealt, 30);
    assert.equal(match.consumed, 1);
    assert.ok(match.ownerSocket.messages.some((message) => message.type === "damage_dealt" && message.targetId === nearId));
  } finally {
    match.cleanup();
  }
});

test("recon utility returns a temporary private scan of nearby opponents and loot", async () => {
  const item = makeItem(303, "owner", "UTILIDADE", { vision: 10 });
  const match = await prepareMatch(item, 2);
  try {
    const targetId = match.otherIds[0];
    const target = match.room.players.get(targetId);
    match.owner.posX = 50; match.owner.posY = 50;
    target.posX = 56; target.posY = 50;
    match.room.loot = [{ id: 9901, name: "Loot sinalizado", type: "CURATIVO", rarity: "COMUM", posX: 58, posY: 50, stats: { heal: 10 }, isPickedUp: false }];

    await match.use(match.ownerId, item.id);

    const scan = match.ownerSocket.messages.find((message) => message.type === "packback_scan");
    assert.equal(scan.durationMs, 8000);
    assert.deepEqual(scan.players.map((player: any) => player.userId), [targetId]);
    assert.deepEqual(scan.loot.map((loot: any) => loot.id), [9901]);
    assert.equal(match.consumed, 1);
  } finally {
    match.cleanup();
  }
});

test("an item outside the player's match-start PackBack is rejected before storage access or consumption", async () => {
  const item = makeItem(304, "owner", "CURATIVO", { heal: 25 });
  const match = await prepareMatch(item);
  try {
    await match.use(match.otherIds[0], item.id);
    assert.equal(match.consumed, 0);
  } finally {
    match.cleanup();
  }
});

test("Adrenalina grants a bounded timed speed boost that increases server movement only", async () => {
  const item = makeItem(305, "owner", "CURATIVO", { heal: 75, speed: 20 });
  const match = await prepareMatch(item);
  try {
    await match.use(match.ownerId, item.id);
    assert.equal(match.owner.speedMultiplier, 1.2);
    assert.ok(match.owner.speedBoostUntil > Date.now());

    match.owner.posX = 50;
    match.owner.posY = 50;
    match.owner.lastMovementAt = Date.now() - 1000;
    const now = Date.now();
    roomManager.updatePosition(match.ownerId, 100, 50);
    (roomManager as any).advancePlayerMovement(match.room, now);
    assert.ok(Math.abs(match.owner.posX - 62) < 0.5, `expected about 62, got ${match.owner.posX}`);

    const expiredAt = match.owner.speedBoostUntil + 1000;
    match.owner.lastMovementAt = expiredAt - 1000;
    (roomManager as any).advancePlayerMovement(match.room, expiredAt);
    assert.equal(match.owner.speedMultiplier, 1);
    assert.ok(Math.abs(match.owner.posX - 72) < 0.5, `expected about 72 after expiry, got ${match.owner.posX}`);
  } finally {
    match.cleanup();
  }
});

test("live-match pickup refuses loot above PackBack capacity and tracks accepted weight", async () => {
  const item = makeItem(306, "owner", "UTILIDADE", { capacity: 20 });
  const match = await prepareMatch(item);
  try {
    assert.equal(match.owner.carryCapacity, 70);
    match.owner.posX = 50;
    match.owner.posY = 50;
    match.room.loot = [{
      id: 9902, name: "Rifle pesado", type: "ARMA", rarity: "COMUM",
      posX: 50, posY: 50, stats: { damage: 25, weight: 25 }, isPickedUp: false,
    }];
    match.owner.carriedWeight = 60;
    await roomManager.pickupLoot(match.ownerId, 9902);
    assert.equal(match.room.loot[0].isPickedUp, false);
    assert.equal(match.owner.carriedWeight, 60);
    assert.ok(match.ownerSocket.messages.some((message) => message.type === "error" && message.message.includes("PackBack cheia")));

    match.owner.carriedWeight = 45;
    await roomManager.pickupLoot(match.ownerId, 9902);
    assert.equal(match.room.loot[0].isPickedUp, true);
    assert.equal(match.owner.carriedWeight, 70);
  } finally {
    match.cleanup();
  }
});
