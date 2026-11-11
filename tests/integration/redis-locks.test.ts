import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";

const redisUrl = process.env.REDIS_URL?.trim();
const skipReason = redisUrl ? false : "REDIS_URL não configurado; integração Redis é opt-in";

if (redisUrl) {
  process.env.REDIS_NAMESPACE = `khaaos:redis-test:${process.pid}:${randomUUID()}`;
}

const distributedStateModule = redisUrl
  ? await import("../../server/game/DistributedState.ts")
  : null;
const redisModule = redisUrl ? await import("redis") : null;

test("Redis: release tardio não remove lock adquirido por outro owner", { skip: skipReason }, async () => {
  const { DistributedState } = distributedStateModule!;
  const client = redisModule!.createClient({ url: redisUrl });
  await client.connect();
  const ownerA = new DistributedState();
  const ownerB = new DistributedState();
  const keyName = `integration:${randomUUID()}`;
  try {
    const tokenA = await ownerA.acquireLock(keyName, 80);
    assert.ok(tokenA);
    assert.equal(await ownerB.acquireLock(keyName, 2_000), null);
    await new Promise((resolve) => setTimeout(resolve, 120));
    const tokenB = await ownerB.acquireLock(keyName, 2_000);
    assert.ok(tokenB);
    await ownerA.releaseLock(keyName, tokenA);
    assert.equal(await client.get(`${process.env.REDIS_NAMESPACE}:lock:${keyName}`), tokenB);
    await ownerB.releaseLock(keyName, tokenB);
  } finally {
    await ownerA.close();
    await ownerB.close();
    await client.quit();
  }
});

test("Redis: heartbeat renova lease e token obsoleto não pode renovar nem liberar", { skip: skipReason }, async () => {
  const { DistributedState } = distributedStateModule!;
  const client = redisModule!.createClient({ url: redisUrl });
  await client.connect();
  const ownerA = new DistributedState();
  const ownerB = new DistributedState();
  const roomId = `integration-room:${randomUUID()}`;
  try {
    const tokenA = await ownerA.setRoomOwner(roomId, 450);
    assert.ok(tokenA);
    await new Promise((resolve) => setTimeout(resolve, 320));
    const ownerKey = `${process.env.REDIS_NAMESPACE}:room:${roomId}:owner`;
    assert.ok((await client.pTTL(ownerKey)) > 200, "heartbeat deveria renovar antes da expiração");
    assert.equal(await ownerA.releaseRoomOwner(roomId, tokenA), true);
    const tokenB = await ownerB.setRoomOwner(roomId, 2_000);
    assert.ok(tokenB, "owner B deveria assumir após o release do owner A");
    assert.equal(await ownerA.renewRoomOwner(roomId, tokenA, 2_000), false);
    assert.equal(await ownerA.releaseRoomOwner(roomId, tokenA), false);
    assert.equal(await client.get(ownerKey), tokenB);
    assert.equal(await ownerB.releaseRoomOwner(roomId, tokenB), true);
  } finally {
    await ownerA.close();
    await ownerB.close();
    await client.quit();
  }
});
