import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import WebSocket from "ws";

process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/khaaos_test";
process.env.NODE_ENV = "test";
process.env.WS_TOKEN_SECRET = "official-websocket-integration-test-key-32-bytes-minimum";
process.env.WS_LOCAL_TICKET_FALLBACK = "true";

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
  const address = httpServer.address();
  assert.ok(address && typeof address !== "string");
  const url = `ws://127.0.0.1:${address.port}/ws`;
  const origin = `http://127.0.0.1:${address.port}`;
  const originalPublicOrigin = process.env.PUBLIC_ORIGIN;
  const originalMissingOriginSetting = process.env.WS_ALLOW_MISSING_ORIGIN;
  process.env.PUBLIC_ORIGIN = origin;
  process.env.WS_ALLOW_MISSING_ORIGIN = "false";
  roomManager.attach(httpServer);
  const originalGetPlayerStats = storage.getPlayerStats;
  storage.getPlayerStats = async () => ({
    health: 100,
    maxHealth: 100,
    status: "VIVO",
    kills: 0,
    rating: 1000,
  } as Awaited<ReturnType<typeof storage.getPlayerStats>>);

  const unauthorizedWs = new WebSocket(url, { headers: { Origin: origin } });
  unauthorizedWs.on("error", () => undefined);

  let authenticatedWs: WebSocket | undefined;
  const rejectedSockets: WebSocket[] = [unauthorizedWs];
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
    const protocols = ["khaaos-v1", `khaaos-token.${token}`];
    const crossOriginWs = new WebSocket(url, protocols, { headers: { Origin: "https://attacker.example" } });
    rejectedSockets.push(crossOriginWs);
    crossOriginWs.on("error", () => undefined);
    const crossOriginStatus = await withTimeout(new Promise<number>((resolve, reject) => {
      crossOriginWs.once("unexpected-response", (_request, response) => {
        response.resume();
        resolve(response.statusCode ?? 0);
      });
      crossOriginWs.once("open", () => reject(new Error("Origem externa não deveria abrir")));
    }), "Handshake cross-origin não foi rejeitado");
    assert.equal(crossOriginStatus, 403);

    const missingOriginWs = new WebSocket(url, protocols);
    rejectedSockets.push(missingOriginWs);
    missingOriginWs.on("error", () => undefined);
    const missingOriginStatus = await withTimeout(new Promise<number>((resolve, reject) => {
      missingOriginWs.once("unexpected-response", (_request, response) => {
        response.resume();
        resolve(response.statusCode ?? 0);
      });
      missingOriginWs.once("open", () => reject(new Error("Handshake sem Origin não deveria abrir")));
    }), "Handshake sem Origin não foi rejeitado");
    assert.equal(missingOriginStatus, 403);

    const previousNodeEnv = process.env.NODE_ENV;
    const previousMissingOriginSetting = process.env.WS_ALLOW_MISSING_ORIGIN;
    process.env.NODE_ENV = "production";
    process.env.WS_ALLOW_MISSING_ORIGIN = "true";
    const productionMissingOriginWs = new WebSocket(url, protocols);
    rejectedSockets.push(productionMissingOriginWs);
    productionMissingOriginWs.on("error", () => undefined);
    const productionMissingOriginStatus = await withTimeout(new Promise<number>((resolve, reject) => {
      productionMissingOriginWs.once("unexpected-response", (_request, response) => {
        response.resume();
        resolve(response.statusCode ?? 0);
      });
      productionMissingOriginWs.once("open", () => reject(new Error("Produção não deveria aceitar Origin ausente")));
    }), "Produção não recusou Origin ausente");
    assert.equal(productionMissingOriginStatus, 403);

    const insecurePublicOriginWs = new WebSocket(url, protocols, { headers: { Origin: origin } });
    rejectedSockets.push(insecurePublicOriginWs);
    insecurePublicOriginWs.on("error", () => undefined);
    const insecurePublicOriginStatus = await withTimeout(new Promise<number>((resolve, reject) => {
      insecurePublicOriginWs.once("unexpected-response", (_request, response) => {
        response.resume();
        resolve(response.statusCode ?? 0);
      });
      insecurePublicOriginWs.once("open", () => reject(new Error("Produção não deveria aceitar PUBLIC_ORIGIN HTTP")));
    }), "PUBLIC_ORIGIN HTTP em produção não foi recusado");
    assert.equal(insecurePublicOriginStatus, 403);
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousMissingOriginSetting === undefined) delete process.env.WS_ALLOW_MISSING_ORIGIN;
    else process.env.WS_ALLOW_MISSING_ORIGIN = previousMissingOriginSetting;

    authenticatedWs = new WebSocket(url, protocols, { headers: { Origin: origin } });
    await withTimeout(new Promise<void>((resolve, reject) => {
      authenticatedWs!.once("open", resolve);
      authenticatedWs!.once("error", reject);
    }), "WebSocket autenticado não abriu");

    const replayWs = new WebSocket(url, protocols, { headers: { Origin: origin } });
    rejectedSockets.push(replayWs);
    replayWs.on("error", () => undefined);
    const replayStatus = await withTimeout(new Promise<number>((resolve, reject) => {
      replayWs.once("unexpected-response", (_request, response) => {
        response.resume();
        resolve(response.statusCode ?? 0);
      });
      replayWs.once("open", () => reject(new Error("Ticket WebSocket reutilizado não deveria abrir")));
    }), "Ticket reutilizado não foi rejeitado");
    assert.equal(replayStatus, 401);

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
    if (originalPublicOrigin === undefined) delete process.env.PUBLIC_ORIGIN;
    else process.env.PUBLIC_ORIGIN = originalPublicOrigin;
    if (originalMissingOriginSetting === undefined) delete process.env.WS_ALLOW_MISSING_ORIGIN;
    else process.env.WS_ALLOW_MISSING_ORIGIN = originalMissingOriginSetting;
    if (authenticatedWs && authenticatedWs.readyState !== WebSocket.CLOSED) {
      const closed = new Promise<void>((resolve) => authenticatedWs!.once("close", () => resolve()));
      authenticatedWs.close();
      await withTimeout(closed, "WebSocket autenticado não fechou", 1_000).catch(() => undefined);
    }
    for (const socket of rejectedSockets) {
      if (socket.readyState !== WebSocket.CLOSED) socket.terminate();
    }
    roomManager.leaveRoom("user-validado-no-servidor");
    roomManager.stop();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  }
});
