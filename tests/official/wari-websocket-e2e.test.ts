import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import WebSocket from "ws";

process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/khaaos_test";
process.env.WS_TOKEN_SECRET = "official-wari-websocket-e2e-test-secret-32-bytes";

const [{ roomManager }, { storage }, { createWsAccessToken }] = await Promise.all([
  import("../../server/game/RoomManager.ts"),
  import("../../server/storage.ts"),
  import("../../server/replit_integrations/auth/ws-token.ts"),
]);

type ServerMessage = Record<string, any>;

async function withTimeout<T>(promise: Promise<T>, message: string, milliseconds = 8_000): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), milliseconds);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function waitForMessage(
  socket: WebSocket,
  predicate: (message: ServerMessage) => boolean,
  description: string,
  milliseconds = 8_000,
): Promise<ServerMessage> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`Timeout aguardando ${description}`));
    }, milliseconds);
    const onMessage = (raw: WebSocket.RawData) => {
      let message: ServerMessage;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (!predicate(message)) return;
      cleanup();
      resolve(message);
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      clearTimeout(timer);
      socket.off("message", onMessage);
      socket.off("error", onError);
    };
    socket.on("message", onMessage);
    socket.on("error", onError);
  });
}

async function connectAuthenticated(url: string, userId: string): Promise<WebSocket> {
  const { token } = createWsAccessToken(userId);
  const socket = new WebSocket(url, ["khaaos-v1", `khaaos-token.${token}`]);
  await withTimeout(new Promise<void>((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  }), `WebSocket autenticado para ${userId} não abriu`);
  return socket;
}

test("War’I E2E: WebSocket autenticado inicia partida, usa granada e replica dano/durabilidade", async () => {
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const ownerId = `wari-e2e-owner-${suffix}`;
  const rivalId = `wari-e2e-rival-${suffix}`;
  const grenadeId = Math.floor(Math.random() * 1_000_000_000) + 1;
  let grenade = {
    id: grenadeId,
    userId: ownerId,
    name: "Granada de teste",
    type: "UTILIDADE",
    rarity: "RARO",
    isEquipped: true,
    durability: "100",
    maxDurability: "100",
    stats: { damage: 30, radius: 5 },
  };

  const originals = {
    getPlayerStats: storage.getPlayerStats,
    getEquippedItems: storage.getEquippedItems,
    getItemForUser: storage.getItemForUser,
    consumeItemDurability: storage.consumeItemDurability,
    createItem: storage.createItem,
  };
  let durabilityWrites = 0;
  storage.getPlayerStats = async () => ({
    health: 100,
    maxHealth: 100,
    status: "VIVO",
    kills: 0,
    rating: 1000,
  } as Awaited<ReturnType<typeof storage.getPlayerStats>>);
  storage.getEquippedItems = async (userId) =>
    (userId === ownerId ? [grenade] : []) as any;
  storage.getItemForUser = async (itemId, userId) =>
    itemId === grenadeId && userId === ownerId ? grenade as any : undefined;
  storage.consumeItemDurability = async (itemId, userId, amount) => {
    if (itemId !== grenadeId || userId !== ownerId || amount !== 10 || Number(grenade.durability) < amount) {
      return undefined;
    }
    durabilityWrites += 1;
    grenade = { ...grenade, durability: String(Number(grenade.durability) - amount) };
    return grenade as any;
  };

  const httpServer = createServer();
  let ownerSocket: WebSocket | undefined;
  let previousOwnerSocket: WebSocket | undefined;
  let rivalSocket: WebSocket | undefined;
  let roomId: string | undefined;
  let releaseLootPersistence: (() => void) | undefined;

  try {
    await new Promise<void>((resolve, reject) => {
      httpServer.once("error", reject);
      httpServer.listen(0, "127.0.0.1", resolve);
    });
    roomManager.attach(httpServer);
    const address = httpServer.address();
    assert.ok(address && typeof address !== "string");
    const url = `ws://127.0.0.1:${address.port}/ws`;

    ownerSocket = await connectAuthenticated(url, ownerId);
    const ownerWelcomePromise = waitForMessage(ownerSocket, (message) => message.type === "welcome", "welcome do proprietário");
    ownerSocket.send(JSON.stringify({ type: "join", displayName: "Portador da Granada" }));
    const ownerWelcome = await ownerWelcomePromise;
    roomId = ownerWelcome.roomId;
    assert.equal(ownerWelcome.userId, ownerId);
    assert.ok(roomId);

    rivalSocket = await connectAuthenticated(url, rivalId);
    const rivalWelcomePromise = waitForMessage(rivalSocket, (message) => message.type === "welcome", "welcome do rival");
    rivalSocket.send(JSON.stringify({ type: "join", roomId, displayName: "Alvo de Teste" }));
    const rivalWelcome = await rivalWelcomePromise;
    assert.equal(rivalWelcome.userId, rivalId);
    assert.equal(rivalWelcome.roomId, roomId);

    // Start through the authenticated client message. Shorten only the test countdown
    // after the real countdown timer has fired once; the production beginMatch path runs.
    const countdownPromise = waitForMessage(ownerSocket, (message) => message.type === "countdown", "primeiro tick do countdown");
    const readyPromise = waitForMessage(ownerSocket, (message) => message.type === "packback_ready", "snapshot PackBack do match");
    ownerSocket.send(JSON.stringify({ type: "start" }));
    await countdownPromise;

    const room = (roomManager as any).rooms.get(roomId);
    assert.ok(room);
    assert.equal(room.status, "COUNTDOWN");
    room.countdownSeconds = 1;

    const ready = await readyPromise;
    assert.equal(ready.items.length, 1);
    assert.equal(ready.items[0].id, grenadeId);
    assert.equal(room.status, "IN_PROGRESS");

    // Keep the test deterministic while exercising grenade radius/damage in the live room.
    const owner = room.players.get(ownerId);
    const rival = room.players.get(rivalId);
    assert.ok(owner && rival);
    owner.posX = 50;
    owner.posY = 50;
    rival.posX = 53;
    rival.posY = 50;

    const usePromise = waitForMessage(
      ownerSocket,
      (message) => message.type === "packback_item_used" && message.itemId === grenadeId,
      "confirmação de uso e durabilidade",
    );
    const damagePromise = waitForMessage(
      rivalSocket,
      (message) => message.type === "damage_dealt" && message.targetId === rivalId,
      "evento de dano no cliente alvo",
    );
    ownerSocket.send(JSON.stringify({
      type: "use_packback_item",
      itemId: grenadeId,
      userId: rivalId, // Cliente não escolhe a identidade; vale o subject assinado no handshake.
    }));

    const [used, damage] = await Promise.all([usePromise, damagePromise]);
    assert.equal(damage.attackerId, ownerId);
    assert.equal(damage.damage, 30);
    assert.equal(damage.targetHealth, 70);
    assert.equal(rival.health, 70);
    assert.equal(used.durability, "90");
    assert.equal(durabilityWrites, 1);
    assert.equal(grenade.durability, "90");

    // A loot pickup is not acknowledged or broadcast until persistence resolves.
    const lootId = Math.floor(Math.random() * 1_000_000_000) + 1;
    const loot = {
      id: lootId,
      name: "Fixture de coleta",
      type: "CURATIVO",
      rarity: "COMUM",
      posX: 50,
      posY: 50,
      stats: { heal: 10 },
      isPickedUp: false,
    };
    room.loot.push(loot);
    room.lootGrid.insert({ ...loot });
    let signalPersistenceStarted!: () => void;
    const persistenceStarted = new Promise<void>((resolve) => { signalPersistenceStarted = resolve; });
    let allowPersistence!: () => void;
    const persistenceGate = new Promise<void>((resolve) => { allowPersistence = resolve; });
    releaseLootPersistence = allowPersistence;
    storage.createItem = async (input) => {
      signalPersistenceStarted();
      await persistenceGate;
      return { ...input, id: lootId } as any;
    };
    let lootBroadcastSeen = false;
    const monitorLootBroadcast = (raw: WebSocket.RawData) => {
      try {
        const message = JSON.parse(raw.toString());
        if (message.type === "loot_picked" && message.lootId === lootId) lootBroadcastSeen = true;
      } catch { /* ignore other packets */ }
    };
    ownerSocket.on("message", monitorLootBroadcast);
    const lootPickedPromise = waitForMessage(
      ownerSocket,
      (message) => message.type === "loot_picked" && message.lootId === lootId,
      "broadcast de coleta persistida",
    );
    ownerSocket.send(JSON.stringify({ type: "pickup", lootId }));
    await persistenceStarted;
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(lootBroadcastSeen, false, "não transmitir loot antes do commit da gravação");
    allowPersistence();
    releaseLootPersistence = undefined;
    await lootPickedPromise;
    assert.equal(lootBroadcastSeen, true);
    ownerSocket.off("message", monitorLootBroadcast);
    assert.equal(loot.isPickedUp, true);

    // A failed inventory write restores the loot and carried-weight reservation.
    const failedLootId = lootId + 1;
    const failedLoot = { ...loot, id: failedLootId, name: "Fixture de rollback", isPickedUp: false };
    room.loot.push(failedLoot);
    room.lootGrid.insert({ ...failedLoot });
    const carriedWeightBefore = owner.carriedWeight;
    storage.createItem = async () => { throw new Error("fixture: PostgreSQL indisponível"); };
    const persistenceErrorPromise = waitForMessage(
      ownerSocket,
      (message) => message.type === "error" && message.message.includes("Falha ao persistir o loot"),
      "erro de persistência da coleta",
    );
    ownerSocket.send(JSON.stringify({ type: "pickup", lootId: failedLootId }));
    await persistenceErrorPromise;
    assert.equal(failedLoot.isPickedUp, false);
    assert.equal(owner.carriedWeight, carriedWeightBefore);
    assert.ok(room.lootGrid.queryRadius(owner.posX, owner.posY, 8).some((item: any) => item.id === failedLootId));

    // Authenticated resume restores the same room/PackBack snapshot. A delayed
    // close event from the previous socket must not mark the rebound player offline.
    previousOwnerSocket = ownerSocket;
    const resumedSocket = await connectAuthenticated(url, ownerId);
    const resumedWelcomePromise = waitForMessage(resumedSocket, (message) => message.type === "welcome", "welcome da reconexão");
    const resumedRoomPromise = waitForMessage(resumedSocket, (message) => message.type === "room_state" && message.room.id === roomId, "snapshot da sala retomada");
    const resumedPackbackPromise = waitForMessage(resumedSocket, (message) => message.type === "packback_ready", "snapshot PackBack retomada");
    resumedSocket.send(JSON.stringify({ type: "resume", roomId }));
    const [resumedWelcome, resumedRoom, resumedPackback] = await Promise.all([
      resumedWelcomePromise,
      resumedRoomPromise,
      resumedPackbackPromise,
    ]);
    assert.equal(resumedWelcome.roomId, roomId);
    assert.equal(resumedRoom.room.status, "IN_PROGRESS");
    assert.equal(resumedRoom.room.players.find((player: any) => player.userId === ownerId)?.isConnected, true);
    assert.equal(resumedPackback.items[0]?.id, grenadeId);
    const reboundServerSocket = room.players.get(ownerId)?.ws;
    assert.ok(reboundServerSocket, "a sala deve vincular um socket do lado do servidor após resume");
    assert.equal(reboundServerSocket.readyState, WebSocket.OPEN);
    ownerSocket = resumedSocket;
    const oldSocketClosed = new Promise<void>((resolve) => previousOwnerSocket!.once("close", () => resolve()));
    previousOwnerSocket.close();
    await withTimeout(oldSocketClosed, "socket anterior não fechou", 1_500);
    assert.equal(room.players.get(ownerId)?.ws, reboundServerSocket);
    assert.equal(room.players.get(ownerId)?.isConnected, true);
  } finally {
    releaseLootPersistence?.();
    const activeRoom = roomId ? (roomManager as any).rooms.get(roomId) : undefined;
    if (activeRoom) {
      activeRoom.status = "LOBBY";
      if (activeRoom.countdownHandle) clearInterval(activeRoom.countdownHandle);
      if (activeRoom.tickHandle) clearInterval(activeRoom.tickHandle);
      activeRoom.countdownHandle = null;
      activeRoom.tickHandle = null;
    }
    roomManager.leaveRoom(ownerId);
    roomManager.leaveRoom(rivalId);
    roomManager.stop();

    for (const socket of [ownerSocket, previousOwnerSocket, rivalSocket]) {
      if (socket && socket.readyState !== WebSocket.CLOSED) {
        const closed = new Promise<void>((resolve) => socket.once("close", () => resolve()));
        socket.close();
        await withTimeout(closed, "WebSocket de teste não fechou", 1_500).catch(() => socket.terminate());
      }
    }

    const wss = (roomManager as any).wss;
    if (wss) {
      await new Promise<void>((resolve) => wss.close(() => resolve()));
    }
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));

    storage.getPlayerStats = originals.getPlayerStats;
    storage.getEquippedItems = originals.getEquippedItems;
    storage.getItemForUser = originals.getItemForUser;
    storage.consumeItemDurability = originals.consumeItemDurability;
    storage.createItem = originals.createItem;
  }
});
