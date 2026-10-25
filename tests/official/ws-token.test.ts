import assert from "node:assert/strict";
import { createServer as createTcpServer, type Socket } from "node:net";
import { test } from "node:test";

process.env.NODE_ENV = "test";
process.env.WS_TOKEN_SECRET = "official-websocket-token-test-secret-with-32-bytes";
process.env.WS_LOCAL_TICKET_FALLBACK = "true";
const originalRedisUrl = process.env.REDIS_URL;
delete process.env.REDIS_URL;
const { createWsAccessToken, verifyWsAccessToken, consumeWsAccessToken } = await import("../../server/replit_integrations/auth/ws-token.ts");
const { DistributedState } = await import("../../server/game/DistributedState.ts");
if (originalRedisUrl !== undefined) process.env.REDIS_URL = originalRedisUrl;

const NOW = 1_800_000_000;

test("token WS: aceita token assinado dentro da validade", () => {
  const { token, expiresAt } = createWsAccessToken("user-42", NOW);
  assert.equal(expiresAt, NOW + 60);
  assert.equal(verifyWsAccessToken(token, NOW), "user-42");
});

test("token WS: rejeita token expirado, adulterado ou malformado", () => {
  const { token } = createWsAccessToken("user-42", NOW);
  const [payload, signature] = token.split(".");
  assert.equal(verifyWsAccessToken(token, NOW + 60), null);
  assert.equal(verifyWsAccessToken(`${payload}.${signature.slice(0, -1)}x`, NOW), null);
  assert.equal(verifyWsAccessToken("not-a-token", NOW), null);
});

test("token WS: assinatura não pode autorizar outro subject", () => {
  const { token } = createWsAccessToken("user-42", NOW);
  const [encodedPayload, signature] = token.split(".");
  const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  payload.sub = "user-admin";
  const forgedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  assert.equal(verifyWsAccessToken(`${forgedPayload}.${signature}`, NOW), null);
});

test("token WS: consumo concorrente aceita apenas uma conexão", async () => {
  const { token } = createWsAccessToken("user-ticket-de-uso-unico", NOW);
  const results = await Promise.all([
    consumeWsAccessToken(token, NOW),
    consumeWsAccessToken(token, NOW),
  ]);
  assert.equal(results.filter(Boolean).length, 1);
  assert.ok(results.includes("user-ticket-de-uso-unico"));
  assert.equal(results.filter((value) => value === null).length, 1);
});

test("tickets WS: limite de consumos concorrentes é aplicado por processo", async () => {
  const state = new DistributedState() as any;
  const resolveCommands: Array<(value: string) => void> = [];
  state.client = {
    isReady: true,
    isOpen: true,
    set: () => new Promise<string>((resolve) => resolveCommands.push(resolve)),
    destroy: () => undefined,
  };
  const pending = Array.from({ length: 128 }, (_, index) =>
    state.consumeWsTicket(`concurrency-ticket-${index}-0123456789`, 90_000),
  );
  await Promise.resolve();
  assert.equal(resolveCommands.length, 128);
  await assert.rejects(
    state.consumeWsTicket("concurrency-ticket-over-limit-0123456789", 90_000),
    /Too many concurrent WebSocket ticket consumptions/,
  );
  for (const resolve of resolveCommands) resolve("OK");
  assert.ok((await Promise.all(pending)).every(Boolean));
});

test("ticket WS: marcador de replay cobre a tolerância máxima de relógio", async () => {
  const { token } = createWsAccessToken("user-clock-skew", NOW + 30);
  const tooFarFutureToken = createWsAccessToken("user-clock-skew-rejected", NOW + 31).token;
  assert.equal(verifyWsAccessToken(tooFarFutureToken, NOW), null);
  const realDateNow = Date.now;
  let fakeNowMs = realDateNow();
  Date.now = () => fakeNowMs;
  try {
    assert.equal(await consumeWsAccessToken(token, NOW), "user-clock-skew");
    fakeNowMs += 60_001;
    assert.equal(await consumeWsAccessToken(token, NOW + 60), null);
    assert.equal(verifyWsAccessToken(token, NOW + 90), null);
  } finally {
    Date.now = realDateNow;
  }
});

test("tickets WS: o marcador de replay expira ao fim do TTL local", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousFallback = process.env.WS_LOCAL_TICKET_FALLBACK;
  const previousRedisUrl = process.env.REDIS_URL;
  const realDateNow = Date.now;
  try {
    process.env.NODE_ENV = "test";
    process.env.WS_LOCAL_TICKET_FALLBACK = "true";
    delete process.env.REDIS_URL;
    const state = new DistributedState();
    let fakeNowMs = 10_000;
    Date.now = () => fakeNowMs;
    assert.equal(await state.consumeWsTicket("expiring-local-marker-0123456789", 90_000), true);
    assert.equal(await state.consumeWsTicket("expiring-local-marker-0123456789", 90_000), false);
    fakeNowMs += 90_001;
    assert.equal(await state.consumeWsTicket("expiring-local-marker-0123456789", 90_000), true);
  } finally {
    Date.now = realDateNow;
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousFallback === undefined) delete process.env.WS_LOCAL_TICKET_FALLBACK;
    else process.env.WS_LOCAL_TICKET_FALLBACK = previousFallback;
    if (previousRedisUrl === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = previousRedisUrl;
  }
});

test("tickets WS: fallback local só funciona por opt-in após falha Redis em dev", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousFallback = process.env.WS_LOCAL_TICKET_FALLBACK;
  const previousRedisUrl = process.env.REDIS_URL;
  try {
    process.env.NODE_ENV = "test";
    process.env.WS_LOCAL_TICKET_FALLBACK = "true";
    process.env.REDIS_URL = "redis://127.0.0.1:1";
    const optedInState = new DistributedState();
    assert.equal(await optedInState.consumeWsTicket("local-fallback-ticket-0123456789", 90_000), true);
    assert.equal(await optedInState.consumeWsTicket("local-fallback-ticket-0123456789", 90_000), false);

    process.env.WS_LOCAL_TICKET_FALLBACK = "false";
    const defaultState = new DistributedState();
    await assert.rejects(
      defaultState.consumeWsTicket("local-fallback-disabled-0123456789", 90_000),
      /Local WebSocket ticket fallback is disabled/,
    );
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousFallback === undefined) delete process.env.WS_LOCAL_TICKET_FALLBACK;
    else process.env.WS_LOCAL_TICKET_FALLBACK = previousFallback;
    if (previousRedisUrl === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = previousRedisUrl;
  }
});

test("tickets WS: produção falha fechada sem Redis mesmo com REDIS_REQUIRED=false", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousRedisRequired = process.env.REDIS_REQUIRED;
  const previousRedisUrl = process.env.REDIS_URL;
  try {
    process.env.NODE_ENV = "production";
    process.env.REDIS_REQUIRED = "false";
    delete process.env.REDIS_URL;
    const productionState = new DistributedState();
    await assert.rejects(
      productionState.consumeWsTicket("test-ticket-id-0123456789", 60_000),
      /Redis is required for one-time WebSocket ticket consumption in production/,
    );
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousRedisRequired === undefined) delete process.env.REDIS_REQUIRED;
    else process.env.REDIS_REQUIRED = previousRedisRequired;
    if (previousRedisUrl === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = previousRedisUrl;
  }
});

test("tickets WS: deadline de SET rejeita e destrói cliente Redis sem resposta", async () => {
  const state = new DistributedState() as any;
  let destroyed = false;
  let clientOpen = true;
  state.client = {
    get isReady() { return clientOpen; },
    get isOpen() { return clientOpen; },
    set: () => new Promise(() => undefined),
    destroy: () => { destroyed = true; clientOpen = false; },
  };
  const startedAt = Date.now();
  await assert.rejects(
    state.consumeWsTicket("stalled-set-ticket-0123456789", 90_000),
    /Redis ticket-consumption command exceeded 2000ms deadline/,
  );
  assert.ok(Date.now() - startedAt < 2_500, "SET deadline must bound the handshake duration");
  assert.equal(destroyed, true);
});

test("tickets WS: deadline limita Redis que aceita TCP mas não responde", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousFallback = process.env.WS_LOCAL_TICKET_FALLBACK;
  const previousRedisUrl = process.env.REDIS_URL;
  const sockets = new Set<Socket>();
  let state: InstanceType<typeof DistributedState> | undefined;
  const stalledRedis = createTcpServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });

  try {
    await new Promise<void>((resolve, reject) => {
      stalledRedis.once("error", reject);
      stalledRedis.listen(0, "127.0.0.1", resolve);
    });
    const address = stalledRedis.address();
    assert.ok(address && typeof address !== "string");
    process.env.NODE_ENV = "test";
    process.env.WS_LOCAL_TICKET_FALLBACK = "false";
    process.env.REDIS_URL = `redis://127.0.0.1:${address.port}`;
    state = new DistributedState();
    const startedAt = Date.now();
    await assert.rejects(
      state.consumeWsTicket("deadline-test-ticket-0123456789", 90_000),
      /Local WebSocket ticket fallback is disabled/,
    );
    assert.ok(Date.now() - startedAt < 4_000, "Redis handshake must return before the five-second socket timeout");
    assert.equal((state as any).client, null);
    assert.equal((state as any).connectingClient, null);
  } finally {
    if (state) await state.close();
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => stalledRedis.close(() => resolve()));
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousFallback === undefined) delete process.env.WS_LOCAL_TICKET_FALLBACK;
    else process.env.WS_LOCAL_TICKET_FALLBACK = previousFallback;
    if (previousRedisUrl === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = previousRedisUrl;
  }
});

test("DistributedState: close cancela conexão Redis em andamento sem vazar cliente", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousRedisUrl = process.env.REDIS_URL;
  const sockets = new Set<Socket>();
  let markAccepted!: () => void;
  const accepted = new Promise<void>((resolve) => { markAccepted = resolve; });
  const stalledRedis = createTcpServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    markAccepted();
  });
  let state: InstanceType<typeof DistributedState> | undefined;

  try {
    await new Promise<void>((resolve, reject) => {
      stalledRedis.once("error", reject);
      stalledRedis.listen(0, "127.0.0.1", resolve);
    });
    const address = stalledRedis.address();
    assert.ok(address && typeof address !== "string");
    process.env.NODE_ENV = "test";
    process.env.REDIS_URL = `redis://127.0.0.1:${address.port}`;
    state = new DistributedState();
    const connection = state.connect().then(() => true, () => false);
    await Promise.race([
      accepted,
      new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error("Redis test server was not reached")), 1_000)),
    ]);
    await state.close();
    assert.equal(await connection, true);
    assert.equal((state as any).client, null);
    assert.equal((state as any).connectingClient, null);
    assert.equal((state as any).connecting, null);
  } finally {
    if (state) await state.close();
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => stalledRedis.close(() => resolve()));
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousRedisUrl === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = previousRedisUrl;
  }
});
