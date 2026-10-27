import assert from "node:assert/strict";
import { test } from "node:test";

process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/khaaos_test";
process.env.WS_TOKEN_SECRET ??= "official-ws-gateway-test-key-32-bytes";
delete process.env.REDIS_URL; // barramento local: determinismo sem Redis

const gatewayModule = await import("../../server/game/NodeWsGateway.ts");
const {
  NodeWsGateway,
  LocalRelayTransport,
  LocalNodeRegistryStore,
  __expireLocalNodeLeaseForTests,
  __resetLocalRelayBusForTests,
} = gatewayModule;
const roomManagerModule = await import("../../server/game/RoomManager.ts");
const { RoomManagerClass } = roomManagerModule;
const { storage } = await import("../../server/storage.ts");

// joinRoom consulta stats do jogador — stub sem banco (padrão routes-ownership).
(storage as any).getPlayerStats = async (userId: string) => ({
  userId,
  rank: "ZHEERS",
  xp: 0,
  health: 100,
  maxHealth: 100,
  energy: 100,
  maxEnergy: 100,
  status: "VIVO",
  kills: 0,
  rating: 1000,
});

function uniqueId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function fakeSocket() {
  const state: { messages: any[]; closed: boolean } = { messages: [], closed: false };
  const socket = {
    readyState: 1,
    send(raw: string) {
      state.messages.push(JSON.parse(raw));
    },
    close(_code?: number, _reason?: string) {
      state.closed = true;
    },
  };
  return { state, socket: socket as any };
}

async function makeGatewayPair() {
  const suffix = uniqueId("pair");
  const nodeOrigin = `node-O-${suffix}`;
  const nodeHost = `node-H-${suffix}`;
  const hostReceived: { started: any[]; messages: any[]; ended: any[] } = { started: [], messages: [], ended: [] };
  const origin = new NodeWsGateway({
    nodeId: nodeOrigin,
    enabled: true,
    transport: new LocalRelayTransport(nodeOrigin),
    registryStore: new LocalNodeRegistryStore(),
  });
  const host = new NodeWsGateway({
    nodeId: nodeHost,
    enabled: true,
    transport: new LocalRelayTransport(nodeHost),
    registryStore: new LocalNodeRegistryStore(),
    callbacks: {
      onSessionStart: (socket) => hostReceived.started.push(socket),
      onClientMessage: (_socket, userId, displayName, msg) => {
        hostReceived.messages.push({ userId, displayName, msg });
      },
      onSessionEnd: (socket, reason) => hostReceived.ended.push({ session: socket.session, reason }),
    },
  });
  await host.start();    // host primeiro: a origem descobre no heartbeat inicial
  await origin.start();
  return { origin, host, nodeOrigin, nodeHost, hostReceived };
}

// ─── 1) Túnel end-to-end entre gateways (transporte local) ──────────────────

test("gateway: openRelay entrega join sintético ao host e s2c volta ao socket de origem", async () => {
  const { origin, host, nodeHost, hostReceived } = await makeGatewayPair();
  try {
    const { state, socket } = fakeSocket();
    const opened = origin.openRelay("u-1", "Origem", socket, nodeHost, "room-1", "CIGKV");
    assert.equal(opened, true);
    await new Promise((resolve) => setImmediate(resolve));

    // Host recebeu onSessionStart + join sintético.
    assert.equal(hostReceived.started.length, 1);
    assert.equal(hostReceived.started[0].userId, "u-1");
    assert.equal(hostReceived.messages.length, 1);
    assert.deepEqual(hostReceived.messages[0].msg, { type: "join", roomId: "room-1", worldId: "CIGKV" });

    // Host responde via RelaySocket → origem entrega no socket local.
    const relaySocket = hostReceived.started[0];
    relaySocket.send(JSON.stringify({ type: "welcome", userId: "u-1", roomId: "room-1" }));
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(state.messages.length, 1);
    assert.deepEqual(state.messages[0], { type: "welcome", userId: "u-1", roomId: "room-1" });
  } finally {
    await origin.stop();
    await host.stop();
    __resetLocalRelayBusForTests();
  }
});

test("gateway: routeIfRelayed roteia mensagens do usuário relayado; âncora de sala re-ancora local", async () => {
  const { origin, host, nodeHost, hostReceived } = await makeGatewayPair();
  try {
    const { socket } = fakeSocket();
    assert.equal(origin.openRelay("u-2", "Origem", socket, nodeHost, "room-2"), true);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(hostReceived.messages.length, 1);

    // Mensagem comum roteada pelo túnel.
    assert.equal(origin.routeIfRelayed("u-2", { type: "set_ready", ready: true }), true);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(hostReceived.messages.length, 2);
    assert.deepEqual(hostReceived.messages[1].msg, { type: "set_ready", ready: true });

    // Âncora de sala (join/queue/create_lobby/join_code): encerra túnel + dispatch local.
    assert.equal(origin.routeIfRelayed("u-2", { type: "join", worldId: "CIGKV" }), false);
    assert.equal(origin.relayedRoomId("u-2"), null);
    await new Promise((resolve) => setImmediate(resolve));
    const ended = hostReceived.ended.find((entry) => entry.reason === "peer_closed");
    assert.ok(ended, "host deveria receber cls (peer_closed) na re-ancoragem");
  } finally {
    await origin.stop();
    await host.stop();
    __resetLocalRelayBusForTests();
  }
});

test("gateway: fechamento do socket local (cls) encerra a sessão no host", async () => {
  const { origin, host, nodeHost, hostReceived } = await makeGatewayPair();
  try {
    const { state, socket } = fakeSocket();
    origin.openRelay("u-3", "Origem", socket, nodeHost, "room-3");
    await new Promise((resolve) => setImmediate(resolve));

    origin.onLocalSocketClosed("u-3", socket);
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(hostReceived.ended.filter((entry) => entry.reason === "peer_closed").length, 1);
    assert.equal(host.hostedSessionCount(), 0);
    assert.equal(state.closed, false, "cls não fecha o socket de origem — só encerra o túnel");
  } finally {
    await origin.stop();
    await host.stop();
    __resetLocalRelayBusForTests();
  }
});

test("gateway: morte do nó dono (lease expirado) informa ROOM_NODE_LOST à origem", async () => {
  const { origin, host, nodeHost } = await makeGatewayPair();
  try {
    const { state, socket } = fakeSocket();
    origin.openRelay("u-4", "Origem", socket, nodeHost, "room-4");
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(__expireLocalNodeLeaseForTests(nodeHost), true, "lease do nó host deveria existir");
    await origin.__heartbeatNowForTests();

    const lost = state.messages.find((msg) => msg.code === "ROOM_NODE_LOST");
    assert.ok(lost, "origem deveria receber ROOM_NODE_LOST");
    assert.equal(lost.roomId, "room-4");
    assert.equal(origin.relayedRoomId("u-4"), null);
  } finally {
    await origin.stop();
    await host.stop();
    __resetLocalRelayBusForTests();
  }
});

test("gateway: RelaySocket.close no host publica drop; dropSessionsForRoom descarta por sala", async () => {
  const { origin, host, nodeHost, hostReceived } = await makeGatewayPair();
  try {
    const { state, socket } = fakeSocket();
    origin.openRelay("u-5", "Origem", socket, nodeHost, "room-5");
    await new Promise((resolve) => setImmediate(resolve));
    const relaySocket = hostReceived.started.at(-1);

    // Host encerra (ex.: revogação de sessão propagada pelo closeUserSockets).
    relaySocket.close(4001, "Session revoked");
    await new Promise((resolve) => setImmediate(resolve));
    const revoked = state.messages.find((msg) => msg.code === "ROOM_NODE_LOST");
    assert.ok(revoked, "origem deveria receber drop como ROOM_NODE_LOST");
    assert.match(String(revoked.reason), /4001:Session revoked/);
    assert.equal(hostReceived.ended.at(-1)?.reason, "socket_closed");

    // Segunda sessão para testar drop por sala.
    const { state: state2, socket: socket2 } = fakeSocket();
    origin.openRelay("u-5b", "Origem", socket2, nodeHost, "room-5b");
    await new Promise((resolve) => setImmediate(resolve));
    host.dropSessionsForRoom("room-5b");
    await new Promise((resolve) => setImmediate(resolve));
    const dropped = state2.messages.find((msg) => msg.code === "ROOM_NODE_LOST");
    assert.ok(dropped);
    assert.match(String(dropped.reason), /room_closed/);
  } finally {
    await origin.stop();
    await host.stop();
    __resetLocalRelayBusForTests();
  }
});

// ─── 2) Integração RoomManager ↔ gateway (nós reais no mesmo processo) ──────

test("RoomManager: join em sala de OUTRO nó abre túnel e entrega welcome/room_state reais", async () => {
  const suffix = uniqueId("rm");
  const nodeA = `node-A-${suffix}`;
  const nodeB = `node-B-${suffix}`;
  const managerHost = new RoomManagerClass();
  const managerOrigin = new RoomManagerClass();
  try {
    await managerHost.__startLocalBusNodeForTests(nodeB);
    await managerOrigin.__startLocalBusNodeForTests(nodeA);

    // Sala real no nó B (sem dependência de banco — stats com fallback).
    const roomId = await (managerHost as any).createLobbyFromMatchmaking(
      [{ userId: "u-host", displayName: "Host", rating: 1000, ws: null }],
      "CIGKV",
    );
    assert.ok(roomId);

    // Origem: join com roomId que só existe no nó B → túnel, não lobby local.
    const { state, socket } = fakeSocket();
    await (managerOrigin as any).handleMessage("u-relay", "Relay", socket, { type: "join", roomId, worldId: "CIGKV" });
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    const welcome = state.messages.find((msg) => msg.type === "welcome");
    assert.ok(welcome, "welcome deveria chegar pelo túnel");
    assert.equal(welcome.roomId, roomId);
    assert.equal(welcome.userId, "u-relay");
    const roomState = state.messages.filter((msg) => msg.type === "room_state").at(-1);
    assert.ok(roomState, "room_state deveria ser transmitido pelo túnel");
    const memberIds = roomState.room.players.map((p: any) => p.userId);
    assert.ok(memberIds.includes("u-host") && memberIds.includes("u-relay"));

    // set_ready roteado pelo túnel atualiza a sala AUTORITATIVA no nó B.
    assert.equal((managerOrigin as any).gateway.routeIfRelayed("u-relay", { type: "set_ready", ready: true }), true);
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    const readyState = state.messages.filter((msg) => msg.type === "room_state").at(-1);
    const relayMember = readyState.room.players.find((p: any) => p.userId === "u-relay");
    assert.equal(relayMember.isReady, true);

    // Sala do usuário na ORIGEM permanece vazia (estado autoritativo no host).
    assert.equal((managerOrigin as any).userToRoom.get("u-relay"), undefined);
    assert.equal(((managerHost as any).userToRoom.get("u-relay")), roomId);
  } finally {
    await managerOrigin.stop();
    await managerHost.stop();
    __resetLocalRelayBusForTests();
  }
});

test("RoomManager: join_code cross-node abre túnel quando o relay está disponível", async () => {
  const suffix = uniqueId("code");
  const nodeA = `node-A-${suffix}`;
  const nodeB = `node-B-${suffix}`;
  const managerHost = new RoomManagerClass();
  const managerOrigin = new RoomManagerClass();
  try {
    await managerHost.__startLocalBusNodeForTests(nodeB);
    await managerOrigin.__startLocalBusNodeForTests(nodeA);

    const roomId = await (managerHost as any).createLobbyFromMatchmaking(
      [{ userId: "u-owner", displayName: "Owner", rating: 1000, ws: null }],
      "CIGKV",
    );
    const room = (managerHost as any).rooms.get(roomId);
    room.isPrivate = true;
    room.inviteCode = "RELAY77";
    // Re-espelha: o mirror original aconteceu com inviteCode null.
    (managerHost as any).broadcastRoomState(room);
    await new Promise((resolve) => setImmediate(resolve));

    const { state, socket } = fakeSocket();
    await (managerOrigin as any).handleMessage("u-guest", "Guest", socket, { type: "join_code", code: "relay77" });
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    const welcome = state.messages.find((msg) => msg.type === "welcome");
    assert.ok(welcome, "join_code cross-node deveria entregar welcome pelo túnel");
    assert.equal(welcome.roomId, roomId);
    const relayed = (managerOrigin as any).gateway.relayedSessionsForTests();
    assert.equal(relayed.length, 1);
    assert.equal(relayed[0].targetNode, nodeB);
  } finally {
    await managerOrigin.stop();
    await managerHost.stop();
    __resetLocalRelayBusForTests();
  }
});

test("RoomManager: sem gateway ativo o caminho legado ROOM_REMOTE_NODE permanece", async () => {
  const suffix = uniqueId("legacy");
  const managerLegacy = new RoomManagerClass(); // gateway NUNCA started
  const { RoomEventMesh } = await import("../../server/game/RoomEventMesh.ts");
  const remoteOwner = new RoomEventMesh({ nodeId: `remote-${suffix}`, enabled: false });
  try {
    await remoteOwner.mirrorRoom({
      id: `legacy-room-${suffix}`,
      worldId: "CIGKV",
      status: "LOBBY",
      playerCount: 1,
      maxPlayers: 16,
      isPrivate: true,
      inviteCode: "LEGACY1",
      hostId: "u-owner",
      nodeId: remoteOwner.nodeId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const { state, socket } = fakeSocket();
    await (managerLegacy as any).handleMessage("u-any", "Any", socket, { type: "join_code", code: "LEGACY1" });
    await new Promise((resolve) => setImmediate(resolve));

    const error = state.messages.find((msg) => msg.type === "error");
    assert.ok(error);
    assert.equal(error.code, "ROOM_REMOTE_NODE");
    assert.equal(error.nodeId, remoteOwner.nodeId);
    assert.ok(error.message.includes("outro nó"));
    assert.equal(state.messages.filter((msg) => msg.type === "welcome").length, 0);
  } finally {
    await remoteOwner.markRoomClosed(`legacy-room-${suffix}`, "cleanup");
    await managerLegacy.stop();
    __resetLocalRelayBusForTests();
  }
});

test("RoomManager: destruição da sala derruba sessões relayadas com room_closed", async () => {
  const suffix = uniqueId("drop");
  const nodeA = `node-A-${suffix}`;
  const nodeB = `node-B-${suffix}`;
  const managerHost = new RoomManagerClass();
  const managerOrigin = new RoomManagerClass();
  try {
    await managerHost.__startLocalBusNodeForTests(nodeB);
    await managerOrigin.__startLocalBusNodeForTests(nodeA);

    const roomId = await (managerHost as any).createLobbyFromMatchmaking(
      [{ userId: "u-host", displayName: "Host", rating: 1000, ws: null }],
      "CIGKV",
    );
    const { state, socket } = fakeSocket();
    await (managerOrigin as any).handleMessage("u-gone", "Gone", socket, { type: "join", roomId, worldId: "CIGKV" });
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    assert.ok(state.messages.find((msg) => msg.type === "welcome"));

    // Host destrói a sala (fim de partida) → sessões relayadas recebem drop.
    (managerHost as any).destroyRoom(roomId);
    await new Promise((resolve) => setImmediate(resolve));
    const dropped = state.messages.find((msg) => msg.code === "ROOM_NODE_LOST");
    assert.ok(dropped, "origem deveria ser informada do encerramento");
    assert.match(String(dropped.reason), /room_closed/);
    assert.equal((managerOrigin as any).gateway.relayedRoomId("u-gone"), null);
  } finally {
    await managerOrigin.stop();
    await managerHost.stop();
    __resetLocalRelayBusForTests();
  }
});
