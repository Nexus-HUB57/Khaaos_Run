import assert from "node:assert/strict";
import test, { afterEach, beforeEach } from "node:test";
import type { WebSocket } from "ws";
import { RoomManager, type RoomStorage } from "../../server/game/RoomManager";
import {
  ZU_VEHICLE_ENTRY_V1,
  ZuIngressSchema,
  createZuIngress,
} from "../../shared/zuIngress";

const stats = {
  userId: "test-user",
  rank: "ZHEERS",
  xp: 0,
  health: 100,
  maxHealth: 100,
  energy: 100,
  maxEnergy: 100,
  status: "VIVO",
  kills: 0,
  rating: 1000,
};

const testStorage: RoomStorage = {
  getPlayerStats: async (userId) => ({ ...stats, userId } as never),
  getEquippedItems: async () => [],
  eliminatePlayer: async (userId) => ({ ...stats, userId } as never),
  addKill: async () => undefined,
  getItemForUser: async () => undefined,
  consumeItemDurability: async () => undefined,
  createItem: async (item) => item as never,
};

function fakeSocket() {
  const messages: unknown[] = [];
  const socket = {
    readyState: 1,
    send(payload: string) {
      messages.push(JSON.parse(payload));
    },
  } as unknown as WebSocket;
  return { socket, messages };
}

let manager: RoomManager;
const joinedUsers = new Set<string>();

beforeEach(() => {
  manager = new RoomManager(testStorage);
});

afterEach(() => {
  for (const userId of joinedUsers) manager.leaveRoom(userId);
  joinedUsers.clear();
  manager.stop();
});

async function join(userId: string, worldId: "CIGKV" | "W1" | "W2" | "W3" | "W4" = "CIGKV") {
  const client = fakeSocket();
  joinedUsers.add(userId);
  await manager.joinRoom(userId, userId, client.socket, "missing-room", worldId);
  const room = manager.listLobbies()
    .map((entry) => manager.getRoomSummary(entry.id))
    .find((entry) => entry?.playerCount && entry.worldId === worldId);
  assert.ok(room);
  return { ...client, roomId: room.id };
}

test("cria lobby, promove o primeiro jogador a host e envia welcome", async () => {
  const client = await join("host-1");
  const summary = manager.getRoomSummary(client.roomId);

  assert.ok(summary);
  assert.equal(summary.status, "LOBBY");
  assert.equal(summary.playerCount, 1);
  assert.deepEqual(client.messages[0], {
    type: "welcome",
    userId: "host-1",
    roomId: client.roomId,
  });
});

test("reutiliza lobby do mesmo mundo e transmite room_state", async () => {
  const first = await join("first", "W1");
  const second = fakeSocket();
  joinedUsers.add("second");
  await manager.joinRoom("second", "Second", second.socket, first.roomId, "W1");

  assert.equal(manager.getRoomSummary(first.roomId)?.playerCount, 2);
  assert.ok(second.messages.some((message) => (message as { type?: string }).type === "room_state"));
});

test("não mistura lobbies de mundos diferentes", async () => {
  const first = await join("world-one", "W1");
  const second = await join("world-two", "W2");

  assert.notEqual(first.roomId, second.roomId);
  assert.equal(manager.getRoomSummary(first.roomId)?.playerCount, 1);
  assert.equal(manager.getRoomSummary(second.roomId)?.playerCount, 1);
});

test("transfere host quando o host deixa a sala", async () => {
  const first = await join("old-host");
  const second = fakeSocket();
  joinedUsers.add("new-host");
  await manager.joinRoom("new-host", "New Host", second.socket, first.roomId);

  manager.leaveRoom("old-host");
  const state = second.messages.at(-1) as { type?: string; room?: { hostId?: string } };

  assert.equal(state.type, "room_state");
  assert.equal(state.room?.hostId, "new-host");
});

test("permite resume e ignora close atrasado do socket antigo", async () => {
  const first = await join("reconnect-user");
  manager.onDisconnect("reconnect-user", first.socket);
  const replacement = fakeSocket();

  (manager as unknown as { resumeRoom: (userId: string, ws: WebSocket, roomId: string) => void })
    .resumeRoom("reconnect-user", replacement.socket, first.roomId);
  manager.onDisconnect("reconnect-user", first.socket);

  assert.deepEqual(replacement.messages[0], {
    type: "welcome",
    userId: "reconnect-user",
    roomId: first.roomId,
  });
  const state = replacement.messages.at(-1) as { room?: { players?: Array<{ isConnected: boolean }> } };
  assert.equal(state.room?.players?.[0]?.isConnected, true);
});

test("rejeita ingresso em sala cheia", async () => {
  const first = await join("capacity-host");
  const room = (manager as any).rooms.get(first.roomId);
  room.maxPlayers = 1;
  const rejected = fakeSocket();
  joinedUsers.add("capacity-rejected");

  await manager.joinRoom("capacity-rejected", "Rejected", rejected.socket, first.roomId);

  assert.deepEqual(rejected.messages.at(-1), { type: "error", message: "Room full" });
});

test("protege início de partida quando visitante não é host nem todos estão prontos", async () => {
  const host = await join("start-host");
  const guest = fakeSocket();
  joinedUsers.add("start-guest");
  await manager.joinRoom("start-guest", "Guest", guest.socket, host.roomId);

  manager.tryStartMatch(host.roomId, "start-guest");

  assert.equal(manager.getRoomSummary(host.roomId)?.status, "LOBBY");
  assert.deepEqual(guest.messages.at(-1), {
    type: "error",
    message: "Aguardando todos prontos ou ação do host",
  });
});

test("cria payload Zu veicular sincronizado", () => {
  const event = createZuIngress({
    vehicle: "train",
    startedAt: 1_729_600_000_000,
    durationMs: 2_200,
    world: "CIGKV",
    spawn: { x: 0, z: 0 },
  });

  assert.equal(event.protocol, ZU_VEHICLE_ENTRY_V1);
  assert.equal(event.type, "zuIngress");
  assert.equal(ZuIngressSchema.safeParse(event).success, true);
});

test("aceita variante server-side com spawnCount", () => {
  const event = createZuIngress({
    vehicle: "train",
    startedAt: 1_729_600_000_000,
    durationMs: 2_200,
    world: "W1",
    spawnCount: 100,
  });

  assert.equal(event.spawnCount, 100);
  assert.equal(event.spawn, undefined);
});

test("rejeita portal, paraquedas, protocolo legado, timestamp inválido e campos extras", () => {
  const base = {
    type: "zuIngress",
    protocol: ZU_VEHICLE_ENTRY_V1,
    vehicle: "train",
    startedAt: 1_729_600_000_000,
    durationMs: 2_200,
    world: "CIGKV",
    spawn: { x: 0, z: 0 },
  };

  for (const invalid of [
    { ...base, vehicle: "portal" },
    { ...base, vehicle: "parachute" },
    { ...base, protocol: "ZU_PORTAL_V1" },
    { ...base, startedAt: Infinity },
    { ...base, durationMs: -1 },
    { ...base, legacyPortal: true },
  ]) {
    assert.equal(ZuIngressSchema.safeParse(invalid).success, false);
  }
});
