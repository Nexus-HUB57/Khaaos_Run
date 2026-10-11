import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import WebSocket from "ws";

process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/khaaos_test";

const { roomManager } = await import("../../server/game/RoomManager.ts");

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

test("WebSocket oficial: rejeita join sem identidade antes de consultar persistência", async () => {
  const httpServer = createServer();
  await new Promise<void>((resolve, reject) => {
    httpServer.once("error", reject);
    httpServer.listen(0, "127.0.0.1", resolve);
  });
  roomManager.attach(httpServer);

  const address = httpServer.address();
  assert.ok(address && typeof address !== "string");
  const ws = new WebSocket(`ws://127.0.0.1:${address.port}/ws`);

  try {
    await withTimeout(new Promise<void>((resolve, reject) => {
      ws.once("open", resolve);
      ws.once("error", reject);
    }), "WebSocket open timeout");

    const nextMessage = new Promise<[WebSocket.RawData]>((resolve) => {
      ws.once("message", (raw) => resolve([raw]));
    });
    ws.send(JSON.stringify({ type: "join" }));
    const [raw] = await withTimeout(nextMessage, "WebSocket response timeout");
    const response = JSON.parse(raw.toString());

    assert.deepEqual(response, {
      type: "error",
      message: "Auth required: send userId first",
    });
  } finally {
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      const closed = new Promise<void>((resolve) => ws.once("close", () => resolve()));
      ws.close();
      await withTimeout(closed, "WebSocket close timeout", 1_000).catch(() => undefined);
    }
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  }
});
