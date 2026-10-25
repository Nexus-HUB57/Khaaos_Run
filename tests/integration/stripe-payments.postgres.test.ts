import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { after, test } from "node:test";
import type Stripe from "stripe";

const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();
if (!testDatabaseUrl) {
  throw new Error("TEST_DATABASE_URL é obrigatório; Stripe payment integration exige PostgreSQL descartável.");
}

let parsedDatabaseUrl: URL;
try {
  parsedDatabaseUrl = new URL(testDatabaseUrl);
} catch {
  throw new Error("TEST_DATABASE_URL não é uma URL PostgreSQL válida.");
}
const databaseName = decodeURIComponent(parsedDatabaseUrl.pathname.replace(/^\//, ""));
const allowedHosts = new Set(["localhost", "127.0.0.1", "::1"]);
if (
  !["postgres:", "postgresql:"].includes(parsedDatabaseUrl.protocol)
  || !databaseName.endsWith("_test")
  || !allowedHosts.has(parsedDatabaseUrl.hostname)
  || process.env.NODE_ENV === "production"
) {
  throw new Error("Proteção de segurança: pagamentos PostgreSQL aceitam apenas host local e database *_test fora de production.");
}
process.env.DATABASE_URL = testDatabaseUrl;

const [{ pool }, { StripePaymentService }] = await Promise.all([
  import("../../server/db.ts"),
  import("../../server/payments/stripePaymentService.ts"),
]);
const service = new StripePaymentService();

after(async () => {
  await pool.end();
});

function createSession(input: {
  orderId: string;
  productId: string;
  sessionId: string;
  amountTotal: number;
  currency?: string;
  livemode?: boolean;
  customerCountry?: string;
  paymentStatus?: Stripe.Checkout.Session.PaymentStatus;
  status?: Stripe.Checkout.Session.Status;
}): Stripe.Checkout.Session {
  return {
    id: input.sessionId,
    object: "checkout.session",
    amount_total: input.amountTotal,
    client_reference_id: input.orderId,
    currency: input.currency ?? "brl",
    livemode: input.livemode ?? false,
    customer_details: { address: { country: input.customerCountry ?? "BR" } } as Stripe.Checkout.Session.CustomerDetails,
    metadata: { orderId: input.orderId, productId: input.productId },
    mode: "payment",
    payment_status: input.paymentStatus ?? "paid",
    status: input.status ?? "complete",
  } as Stripe.Checkout.Session;
}

function createEvent(
  session: Stripe.Checkout.Session,
  type: Stripe.Event.Type = "checkout.session.completed",
  id = `evt_${randomUUID().replaceAll("-", "")}`,
): Stripe.Event {
  return {
    id,
    object: "event",
    api_version: "2025-12-15.clover",
    created: Math.floor(Date.now() / 1000),
    data: { object: session },
    livemode: false,
    pending_webhooks: 1,
    request: null,
    type,
  } as unknown as Stripe.Event;
}

function hashEvent(event: Stripe.Event): string {
  return createHash("sha256").update(JSON.stringify(event)).digest("hex");
}

async function insertOrder(input: {
  orderId: string;
  userId: string;
  productId: string;
  sessionId: string;
  priceBrlMinor: number;
  krcMinorUnits: number;
  status?: "created" | "pending";
}) {
  await pool.query(`
    INSERT INTO payment_orders (
      id, user_id, provider, product_id, product_name, price_brl_minor,
      krc_minor_units, currency, status, idempotency_key, request_hash,
      stripe_session_id, checkout_url
    ) VALUES ($1, $2, 'stripe', $3, 'Integration Test Pack', $4, $5,
      'brl', $6, $7, $8, $9, $10)
  `, [
    input.orderId,
    input.userId,
    input.productId,
    input.priceBrlMinor,
    input.krcMinorUnits,
    input.status ?? "pending",
    randomUUID(),
    "a".repeat(64),
    input.sessionId,
    `https://checkout.stripe.com/c/pay/${input.sessionId}`,
  ]);
}

async function cleanMutableRows(userIds: string[], eventIds: string[], orderIds: string[]) {
  if (eventIds.length) await pool.query("DELETE FROM payment_webhook_events WHERE event_id = ANY($1::text[])", [eventIds]);
  if (orderIds.length) await pool.query("DELETE FROM payment_orders WHERE id = ANY($1::uuid[])", [orderIds]);
  if (userIds.length) {
    await pool.query("DELETE FROM transactions WHERE user_id = ANY($1::text[])", [userIds]);
    await pool.query("DELETE FROM bank_accounts WHERE user_id = ANY($1::text[])", [userIds]);
  }
  // Ledger rows deliberately remain: the production ledger is append-only. CI
  // uses an ephemeral database; this local test only leaves random synthetic IDs.
}

test("Stripe PostgreSQL: checkout idempotente, fulfillment atômico e state machine fail-closed", async () => {
  const current = await pool.query<{ database_name: string }>("SELECT current_database() AS database_name");
  assert.equal(current.rows[0]?.database_name, databaseName);

  const checkoutUserId = `stripe-test-${randomUUID()}`;
  const successUserId = `stripe-test-${randomUUID()}`;
  const mismatchUserId = `stripe-test-${randomUUID()}`;
  const foreignUserId = `stripe-test-${randomUUID()}`;
  const failedUserId = `stripe-test-${randomUUID()}`;
  const expiredUserId = `stripe-test-${randomUUID()}`;
  const successOrderId = randomUUID();
  const successSessionId = `cs_test_${randomUUID().replaceAll("-", "")}`;
  const successProductId = "test-pack-atomic";
  const mismatchOrderId = randomUUID();
  const mismatchSessionId = `cs_test_${randomUUID().replaceAll("-", "")}`;
  const mismatchProductId = "test-pack-mismatch";
  const foreignOrderId = randomUUID();
  const foreignSessionId = `cs_test_${randomUUID().replaceAll("-", "")}`;
  const foreignProductId = "test-pack-foreign";
  const failedOrderId = randomUUID();
  const failedSessionId = `cs_test_${randomUUID().replaceAll("-", "")}`;
  const expiredOrderId = randomUUID();
  const expiredSessionId = `cs_test_${randomUUID().replaceAll("-", "")}`;
  const eventIds: string[] = [];
  const orderIds = [successOrderId, mismatchOrderId, foreignOrderId, failedOrderId, expiredOrderId];
  const userIds = [checkoutUserId, successUserId, mismatchUserId, foreignUserId, failedUserId, expiredUserId];

  try {
    const checkoutCalls: Array<{ params: Stripe.Checkout.SessionCreateParams; idempotencyKey?: string }> = [];
    const sessionsByKey = new Map<string, Stripe.Checkout.Session>();
    const fakeStripe = {
      checkout: {
        sessions: {
          create: async (params: Stripe.Checkout.SessionCreateParams, options?: { idempotencyKey?: string }) => {
            checkoutCalls.push({ params, idempotencyKey: options?.idempotencyKey });
            const key = options?.idempotencyKey ?? "missing-idempotency-key";
            let session = sessionsByKey.get(key);
            if (!session) {
              session = {
                id: `cs_test_${randomUUID().replaceAll("-", "")}`,
                url: `https://checkout.stripe.com/c/pay/${randomUUID()}`,
              } as Stripe.Checkout.Session;
              sessionsByKey.set(key, session);
            }
            return session;
          },
        },
      },
      webhooks: {},
    } as unknown as Stripe;
    const config = {
      secretKey: "sk_test_unit_only_not_a_credential",
      webhookSecret: "whsec_unit_only_not_a_credential",
      publicOrigin: "https://khaaos.example",
      paymentMethodTypes: ["card"] as ("card" | "pix")[],
    };
    const pack = { id: "fixed-pack", name: "Fixed Test Pack", priceBrlMinor: 2500, krcMinorUnits: 12345 };
    const checkoutKey = `checkout-${randomUUID()}`;
    const [checkoutA, checkoutB] = await Promise.all([
      service.createCheckout(checkoutUserId, checkoutKey, pack, fakeStripe, config),
      service.createCheckout(checkoutUserId, checkoutKey, pack, fakeStripe, config),
    ]);
    assert.equal(checkoutA.kind, "ready");
    assert.equal(checkoutB.kind, "ready");
    if (checkoutA.kind !== "ready" || checkoutB.kind !== "ready") throw new Error("Expected idempotent checkout results");
    assert.equal(checkoutA.orderId, checkoutB.orderId);
    assert.equal(checkoutA.checkoutUrl, checkoutB.checkoutUrl);
    assert.equal(sessionsByKey.size, 1, "gateway idempotency must map retries to one hosted session");
    assert.equal(new Set(checkoutCalls.map((call) => call.idempotencyKey)).size, 1);
    for (const call of checkoutCalls) {
      assert.equal(call.params.mode, "payment");
      assert.equal(call.params.billing_address_collection, "required");
      assert.equal(call.params.allowed_payment_method_types?.[0], "card");
      assert.equal(call.params.line_items?.[0]?.price_data?.currency, "brl");
      assert.equal(call.params.line_items?.[0]?.price_data?.unit_amount, 2500, "price is taken from the server package");
      assert.equal(call.params.line_items?.[0]?.quantity, 1);
      assert.match(call.params.line_items?.[0]?.price_data?.product_data?.description ?? "", /123\.45 KRC internos/);
      assert.equal(call.params.metadata?.userId, undefined, "internal user IDs are not sent to Stripe metadata");
    }
    orderIds.push(checkoutA.orderId);
    const changedPack = { ...pack, priceBrlMinor: 2501 };
    assert.deepEqual(await service.createCheckout(checkoutUserId, checkoutKey, changedPack, fakeStripe, config), { kind: "idempotency_conflict" });
    const createdOrder = await service.getOrderForUser(checkoutUserId, checkoutA.orderId);
    assert.equal(createdOrder?.priceBrlMinor, "2500");
    assert.equal(await service.getOrderForUser(`another-user-${randomUUID()}`, checkoutA.orderId), null, "order lookup is owner-scoped");

    await insertOrder({
      orderId: successOrderId,
      userId: successUserId,
      productId: successProductId,
      sessionId: successSessionId,
      priceBrlMinor: 2500,
      krcMinorUnits: 12345,
    });
    const successfulSession = createSession({
      orderId: successOrderId,
      productId: successProductId,
      sessionId: successSessionId,
      amountTotal: 2500,
    });
    const concurrentEvents = [createEvent(successfulSession), createEvent(successfulSession)];
    eventIds.push(...concurrentEvents.map((event) => event.id));
    const results = await Promise.all(concurrentEvents.map((event) => service.processEvent(event, hashEvent(event))));
    assert.deepEqual(results, ["processed", "processed"]);

    const wallet = await pool.query<{ weapons_balance: string }>(
      "SELECT weapons_balance::text FROM bank_accounts WHERE user_id = $1",
      [successUserId],
    );
    assert.equal(wallet.rows[0]?.weapons_balance, "123.45");
    const transactionCount = await pool.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM transactions WHERE user_id = $1 AND type = 'COMPRA_KRC'",
      [successUserId],
    );
    assert.equal(transactionCount.rows[0]?.count, 1);
    const ledger = await pool.query<{ count: number; debits: string; credits: string }>(`
      SELECT count(*)::int AS count,
        sum(amount_krc) FILTER (WHERE side = 'DEBIT')::text AS debits,
        sum(amount_krc) FILTER (WHERE side = 'CREDIT')::text AS credits
      FROM economy_ledger_entries WHERE user_id = $1 AND idempotency_key = $2
    `, [successUserId, `stripe-order:${successOrderId}`]);
    assert.equal(ledger.rows[0]?.count, 2);
    assert.equal(ledger.rows[0]?.debits, "123.45");
    assert.equal(ledger.rows[0]?.credits, "123.45");
    const fulfilledOrder = await pool.query<{ status: string }>(
      "SELECT status FROM payment_orders WHERE id = $1",
      [successOrderId],
    );
    assert.equal(fulfilledOrder.rows[0]?.status, "fulfilled");

    const duplicateEvent = concurrentEvents[0];
    assert.equal(await service.processEvent(duplicateEvent, hashEvent(duplicateEvent)), "duplicate");
    const collidingEvent = {
      ...duplicateEvent,
      data: { object: createSession({
        orderId: successOrderId,
        productId: successProductId,
        sessionId: successSessionId,
        amountTotal: 2501,
      }) },
    } as Stripe.Event;
    assert.equal(await service.processEvent(collidingEvent, hashEvent(collidingEvent)), "rejected");
    const collisionAudit = await pool.query<{ error_code: string | null }>(
      "SELECT error_code FROM payment_webhook_events WHERE event_id = $1",
      [duplicateEvent.id],
    );
    assert.equal(collisionAudit.rows[0]?.error_code, "EVENT_ID_PAYLOAD_MISMATCH");

    await insertOrder({
      orderId: mismatchOrderId,
      userId: mismatchUserId,
      productId: mismatchProductId,
      sessionId: mismatchSessionId,
      priceBrlMinor: 5000,
      krcMinorUnits: 20000,
    });
    const mismatchedEvent = createEvent(createSession({
      orderId: mismatchOrderId,
      productId: mismatchProductId,
      sessionId: mismatchSessionId,
      amountTotal: 5001,
    }));
    eventIds.push(mismatchedEvent.id);
    assert.equal(await service.processEvent(mismatchedEvent, hashEvent(mismatchedEvent)), "rejected");
    const mismatchWallet = await pool.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM bank_accounts WHERE user_id = $1",
      [mismatchUserId],
    );
    assert.equal(mismatchWallet.rows[0]?.count, 0, "divergência nunca pode criar ou creditar uma carteira");
    const rejectedOrder = await pool.query<{ status: string }>(
      "SELECT status FROM payment_orders WHERE id = $1",
      [mismatchOrderId],
    );
    assert.equal(rejectedOrder.rows[0]?.status, "rejected");

    await insertOrder({
      orderId: foreignOrderId,
      userId: foreignUserId,
      productId: foreignProductId,
      sessionId: foreignSessionId,
      priceBrlMinor: 5000,
      krcMinorUnits: 20000,
    });
    const foreignEvent = createEvent(createSession({
      orderId: foreignOrderId,
      productId: foreignProductId,
      sessionId: foreignSessionId,
      amountTotal: 5000,
      customerCountry: "US",
    }));
    eventIds.push(foreignEvent.id);
    assert.equal(await service.processEvent(foreignEvent, hashEvent(foreignEvent)), "rejected");
    const foreignWallet = await pool.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM bank_accounts WHERE user_id = $1",
      [foreignUserId],
    );
    assert.equal(foreignWallet.rows[0]?.count, 0, "cliente fora do mercado BR não pode receber KRC");
    const foreignOrder = await pool.query<{ status: string }>("SELECT status FROM payment_orders WHERE id = $1", [foreignOrderId]);
    assert.equal(foreignOrder.rows[0]?.status, "rejected");

    await insertOrder({
      orderId: failedOrderId,
      userId: failedUserId,
      productId: "test-pack-failed",
      sessionId: failedSessionId,
      priceBrlMinor: 5000,
      krcMinorUnits: 20000,
    });
    const failedEvent = createEvent(createSession({
      orderId: failedOrderId,
      productId: "test-pack-failed",
      sessionId: failedSessionId,
      amountTotal: 5000,
      paymentStatus: "unpaid",
      status: "complete",
    }), "checkout.session.async_payment_failed");
    eventIds.push(failedEvent.id);
    assert.equal(await service.processEvent(failedEvent, hashEvent(failedEvent)), "processed");
    const latePaidEvent = createEvent(createSession({
      orderId: failedOrderId,
      productId: "test-pack-failed",
      sessionId: failedSessionId,
      amountTotal: 5000,
    }), "checkout.session.async_payment_succeeded");
    eventIds.push(latePaidEvent.id);
    assert.equal(await service.processEvent(latePaidEvent, hashEvent(latePaidEvent)), "rejected");
    const failedState = await pool.query<{ status: string }>("SELECT status FROM payment_orders WHERE id = $1", [failedOrderId]);
    assert.equal(failedState.rows[0]?.status, "failed");

    await insertOrder({
      orderId: expiredOrderId,
      userId: expiredUserId,
      productId: "test-pack-expired",
      sessionId: expiredSessionId,
      priceBrlMinor: 5000,
      krcMinorUnits: 20000,
    });
    const expiredEvent = createEvent(createSession({
      orderId: expiredOrderId,
      productId: "test-pack-expired",
      sessionId: expiredSessionId,
      amountTotal: 5000,
      paymentStatus: "unpaid",
      status: "expired",
    }), "checkout.session.expired");
    eventIds.push(expiredEvent.id);
    assert.equal(await service.processEvent(expiredEvent, hashEvent(expiredEvent)), "processed");
    const lateSuccessAfterExpiry = createEvent(createSession({
      orderId: expiredOrderId,
      productId: "test-pack-expired",
      sessionId: expiredSessionId,
      amountTotal: 5000,
    }), "checkout.session.async_payment_succeeded");
    eventIds.push(lateSuccessAfterExpiry.id);
    assert.equal(await service.processEvent(lateSuccessAfterExpiry, hashEvent(lateSuccessAfterExpiry)), "rejected");
    const expiredState = await pool.query<{ status: string }>("SELECT status FROM payment_orders WHERE id = $1", [expiredOrderId]);
    assert.equal(expiredState.rows[0]?.status, "expired");
    const terminalWallets = await pool.query<{ count: number }>(
      "SELECT count(*)::int AS count FROM bank_accounts WHERE user_id = ANY($1::text[])",
      [[failedUserId, expiredUserId]],
    );
    assert.equal(terminalWallets.rows[0]?.count, 0, "eventos de sucesso fora de ordem não podem reabrir estados terminais");
  } finally {
    await cleanMutableRows(userIds, eventIds, orderIds);
  }
});
