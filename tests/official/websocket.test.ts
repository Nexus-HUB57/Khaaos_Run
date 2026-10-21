import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import WebSocket from "ws";

process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/khaaos_test";
process.env.WS_TOKEN_SECRET = "official-websocket-integration-test-key-32-bytes-minimum";

const [{ roomManager }, { storage }, { createWsAccessToken }] = await Promise.all([
  import("../../server/game/RoomManager.ts"),
  import("../../server/storage.ts"),
  import("../../server/replit_integrations/auth/ws-token.ts"),
]);

async function withTimeout<T>(promise: Promise<T>, message: string, milliseconds = 5_000): Promise<T> {
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

test("WebSocket oficial: handshake exige token e ignora userId forjado pelo cliente", async () => {
  const httpServer = createServer();
  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(0, "127.0.0.1", resolve);
  });
  roomManager.attach(httpServer);

  const address = httpServer.address();
  assert.ok(address && typeof address !== "string");
  const url = `ws://127.0.0.1:${address.port}/ws`;
  const originalGetPlayerStats = storage.getPlayerStats;
  storage.getPlayerStats = async () => ({
    health: 100,
    maxHealth: 100,
    status: "VIVO",
    kills: 0,
    rating: 1000,
  } as Awaited<ReturnType<typeof storage.getPlayerStats>>);

  const unauthorizedWs = new WebSocket(url);
  unauthorizedWs.on("error", () => undefined);

  let authenticatedWs: WebSocket | undefined;
  try {
    const rejectedStatus = await withTimeout(new Promise<number>((resolve, reject) => {
      unauthorizedWs.once("unexpected-response", (_request, response) => {
        response.resume();
        resolve(response.statusCode ?? 0);
      });
      unauthorizedWs.once("open", () => reject(new Error("Conexão sem token não deveria abrir")));
    }), "Handshake sem token não foi rejeitado");
    assert.equal(rejectedStatus, 401);

    const { token } = createWsAccessToken("user-validado-no-servidor");
    authenticatedWs = new WebSocket(url, ["khaaos-v1", `khaaos-token.${token}`]);
    await withTimeout(new Promise<void>((resolve, reject) => {
      authenticatedWs!.once("open", resolve);
      authenticatedWs!.once("error", reject);
    }), "WebSocket autenticado não abriu");

    const welcome = new Promise<{ type: string; userId?: string; roomId?: string }>((resolve, reject) => {
      authenticatedWs!.once("message", (raw) => resolve(JSON.parse(raw.toString())));
      authenticatedWs!.once("error", reject);
    });
    authenticatedWs.send(JSON.stringify({
      type: "join",
      userId: "user-forjado-pelo-cliente",
      displayName: "Operativo teste",
    }));

    const message = await withTimeout(welcome, "Servidor não enviou welcome");
    assert.equal(message.type, "welcome");
    assert.equal(message.userId, "user-validado-no-servidor");
    assert.ok(message.roomId);
  } finally {
    storage.getPlayerStats = originalGetPlayerStats;
    if (authenticatedWs && authenticatedWs.readyState !== WebSocket.CLOSED) {
      const closed = new Promise<void>((resolve) => authenticatedWs!.once("close", () => resolve()));
      authenticatedWs.close();
      await withTimeout(closed, "WebSocket autenticado não fechou", 1_000).catch(() => undefined);
    }
    if (unauthorizedWs.readyState !== WebSocket.CLOSED) unauthorizedWs.terminate();
    roomManager.leaveRoom("user-validado-no-servidor");
    roomManager.stop();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  }
});
