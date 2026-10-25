import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

const redisUrl = process.env.WS_TICKET_REDIS_TEST_URL;

if (!redisUrl) {
  test("tickets WS Redis: integração compartilhada", { skip: "Defina WS_TICKET_REDIS_TEST_URL para executar a integração Redis" }, () => {});
} else {
  process.env.NODE_ENV = "test";
  process.env.REDIS_URL = redisUrl;
  process.env.REDIS_NAMESPACE = `khaaos-test-ws-ticket-${randomUUID()}`;
  process.env.WS_LOCAL_TICKET_FALLBACK = "false";

  const [{ DistributedState }, { createClient }] = await Promise.all([
    import("../../server/game/DistributedState.ts"),
    import("redis"),
  ]);

  test("SET NX consome um ticket uma única vez entre duas instâncias e mantém TTL", async () => {
    const firstNode = new DistributedState();
    const secondNode = new DistributedState();
    const inspector = createClient({ url: redisUrl });
    const ticketId = randomUUID();
    const key = `${process.env.REDIS_NAMESPACE}:ws-ticket:${ticketId}`;

    try {
      const [firstResult, secondResult] = await Promise.all([
        firstNode.consumeWsTicket(ticketId, 90_000),
        secondNode.consumeWsTicket(ticketId, 90_000),
      ]);
      assert.equal([firstResult, secondResult].filter(Boolean).length, 1);

      await inspector.connect();
      const ttlMs = await inspector.pTTL(key);
      assert.ok(ttlMs > 80_000 && ttlMs <= 90_000, `expected TTL between 80000ms and 90000ms, got ${ttlMs}`);
      assert.equal(await firstNode.consumeWsTicket(ticketId, 90_000), false);
    } finally {
      if (inspector.isOpen) await inspector.close();
      await Promise.all([firstNode.close(), secondNode.close()]);
    }
  });
}
