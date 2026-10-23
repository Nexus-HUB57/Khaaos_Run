import assert from "node:assert/strict";
import { createHmac, createHash } from "node:crypto";
import { after, test } from "node:test";
import { createServer } from "node:http";
import express from "express";

process.env.DATABASE_URL ??= "postgresql://test:test@127.0.0.1:5432/khaaos_test";
process.env.KRC_CHECKOUT_ENABLED = "true";
process.env.STRIPE_SECRET_KEY = "sk_test_unit_only_not_a_credential";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_unit_only_not_a_credential";
process.env.PUBLIC_ORIGIN = "https://khaaos.example";

const [{ registerApiRoutes }, { stripePaymentService }, { pool }] = await Promise.all([
  import("../../server/routes.ts"),
  import("../../server/payments/stripePaymentService.ts"),
  import("../../server/db.ts"),
]);

let processEventCalls = 0;
let observedPayloadHash: string | undefined;
const originalProcessEvent = stripePaymentService.processEvent;
stripePaymentService.processEvent = async (event, payloadHash) => {
  processEventCalls += 1;
  observedPayloadHash = payloadHash;
  assert.equal(event.type, "customer.created");
  return "ignored";
};

const app = express();
app.use(express.json({
  verify: (req, _res, rawBody) => {
    (req as typeof req & { rawBody?: Buffer }).rawBody = rawBody;
  },
}));
app.use((req, _res, next) => {
  (req as typeof req & { isAuthenticated: () => boolean }).isAuthenticated = () => false;
  next();
});
registerApiRoutes(app);
const server = createServer(app);
await new Promise<void>((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});
const address = server.address();
if (!address || typeof address === "string") throw new Error("Could not determine webhook test port");
const endpoint = `http://127.0.0.1:${address.port}/webhooks/stripe`;

function stripeSignature(body: string, timestamp: number): string {
  const signedPayload = `${timestamp}.${body}`;
  const signature = createHmac("sha256", process.env.STRIPE_WEBHOOK_SECRET!).update(signedPayload).digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

after(async () => {
  stripePaymentService.processEvent = originalProcessEvent;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await pool.end();
});

test("Stripe webhook: verifica assinatura sobre raw body antes de qualquer processamento", async () => {
  const timestamp = Math.floor(Date.now() / 1000);
  const body = JSON.stringify({
    id: "evt_unit_webhook_signature",
    object: "event",
    api_version: "2025-12-15.clover",
    created: timestamp,
    data: { object: { id: "cus_test_unit" } },
    livemode: false,
    pending_webhooks: 1,
    request: null,
    type: "customer.created",
  });
  const validResponse = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "stripe-signature": stripeSignature(body, timestamp),
    },
    body,
  });
  assert.equal(validResponse.status, 200);
  assert.deepEqual(await validResponse.json(), { received: true });
  assert.equal(processEventCalls, 1);
  assert.equal(observedPayloadHash, createHash("sha256").update(Buffer.from(body)).digest("hex"));

  const forgedResponse = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "stripe-signature": `t=${timestamp},v1=${"0".repeat(64)}`,
    },
    body,
  });
  assert.equal(forgedResponse.status, 400);
  assert.equal(processEventCalls, 1, "assinatura inválida nunca alcança o serviço de fulfillment");
});
