import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { after, before, test } from "node:test";
import { WebSocket, WebSocketServer } from "ws";

process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/khaaos_test";
delete process.env.REDIS_URL; // determinismo sem Redis

const { routeWebSocketUpgrade } = await import("../../server/game/wsUpgradeRouter.ts");

// ─── Dois WebSocketServer no MESMO httpServer (regressão do 400 cruzado) ─────
// Antes do roteador, o listener ws com `{ server }` respondia 400 a qualquer
// path alheio — o /ws do RoomManager morria contra o /ws/spectator do
// SpectatorPipeline (e vice-versa) porque o abortHandshake é síncrono e o
// verifyClient do RoomManager é async.

let httpServer: Server;
let baseUrl: string;
const roomReceived: string[] = [];
const spectatorReceived: string[] = [];
let roomWss: WebSocketServer;
let spectatorWss: WebSocketServer;

before(async () => {
  httpServer = createServer((_req, res) => {
    res.writeHead(200).end("ok");
  });

  roomWss = new WebSocketServer({ noServer: true });
  routeWebSocketUpgrade(httpServer, "/ws", (req, socket, head) => {
    roomWss.handleUpgrade(req, socket, head, (ws) => {
      roomReceived.push(req.url ?? "");
      roomWss.emit("connection", ws, req);
    });
  });

  spectatorWss = new WebSocketServer({ noServer: true });
  routeWebSocketUpgrade(httpServer, "/ws/spectator", (req, socket, head) => {
    spectatorWss.handleUpgrade(req, socket, head, (ws) => {
      spectatorReceived.push(req.url ?? "");
      spectatorWss.emit("connection", ws, req);
    });
  });

  await new Promise<void>((resolve) => {
    httpServer.listen(0, "127.0.0.1", resolve);
  });
  const address = httpServer.address();
  assert.ok(address && typeof address === "object");
  baseUrl = `127.0.0.1:${address.port}`;
});

after(async () => {
  roomWss.close();
  spectatorWss.close();
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});

function connect(path: string, protocols?: string[]): Promise<{ opened: boolean; status?: number; ws: WebSocket }> {
  return new Promise((resolve) => {
    const ws = new WebSocket(`ws://${baseUrl}${path}`, protocols);
    ws.on("open", () => resolve({ opened: true, ws }));
    ws.on("unexpected-response", (_req, res: any) => resolve({ opened: false, status: res.statusCode, ws }));
    ws.on("error", (err: any) => resolve({ opened: false, status: err.statusCode, ws }));
  });
}

test("roteador: /ws e /ws/spectator coexistem no mesmo httpServer (regressão 400 cruzado)", async () => {
  const room = await connect("/ws");
  assert.equal(room.opened, true, "upgrade /ws NÃO deve receber 400 do servidor espectador");
  const spectator = await connect("/ws/spectator?roomId=r1");
  assert.equal(spectator.opened, true, "upgrade /ws/spectator NÃO deve receber 400 do servidor de salas");
  assert.deepEqual(spectatorReceived, ["/ws/spectator?roomId=r1"]);
  room.ws.close();
  spectator.ws.close();
});

test("roteador: query string não impede o casamento de path (semântica do ws.path)", async () => {
  const before0 = roomReceived.length;
  const conn = await connect("/ws?mode=3d");
  assert.equal(conn.opened, true);
  assert.equal(roomReceived.length, before0 + 1);
  assert.equal(roomReceived.at(-1), "/ws?mode=3d");
  conn.ws.close();
});

test("roteador: path desconhecido é destruído sem resposta HTTP completa", async () => {
  const conn = await connect("/outra-rota");
  assert.equal(conn.opened, false);
  conn.ws.terminate();
});

test("roteador: registrar o MESMO path de novo substitui o handler (idempotente)", async () => {
  const seen: string[] = [];
  const extra = new WebSocketServer({ noServer: true });
  routeWebSocketUpgrade(httpServer, "/ws/spectator", (req, socket, head) => {
    extra.handleUpgrade(req, socket, head, (ws) => {
      seen.push(req.url ?? "");
      extra.emit("connection", ws, req);
    });
  });
  const conn = await connect("/ws/spectator?roomId=r2");
  assert.equal(conn.opened, true);
  assert.deepEqual(seen, ["/ws/spectator?roomId=r2"]);
  assert.equal(spectatorReceived.length, 1, "handler antigo não deve receber conexões");
  conn.ws.close();
  extra.close();
});
