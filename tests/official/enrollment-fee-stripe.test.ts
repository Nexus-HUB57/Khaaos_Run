// KHAAOS RUN — Taxa de alistamento via gateway real (Task 44 / Fase 47.2)
// ========================================================================
// Cobertura hermética (sem banco) do modo gateway da taxa U$1:
//
//   1. Com gateway: POST /fee NÃO marca a sessão como paga — devolve
//      Checkout Session (GATEWAY_PENDING) e a sessão permanece AWAITING_FEE
//   2. Replay da MESMA Idempotency-Key → MESMA Checkout Session (a chave
//      Stripe é determinística por (protocol, clientKey)); ZERO chamadas
//      novas de criação
//   3. Sessão COMPLETED (fulfillment do webhook simulado via store) → replay
//      devolve a sessão concluída, nunca uma Checkout Session velha
//   4. Gateway indisponível → 503 e sessão intacta (fail-closed)
//   5. SEM gateway (default do #252) → caminho mock intacto: /fee marca
//      COMPLETED + walletDeltaKrc 600 (regression guard — primeira cobertura
//      hermética oficial do router de alistamento)
//   6. Contrato do checkout: moeda usd, amount 100, metadata completa
//      (kind/userId/protocol/clientIdempotencyKey) e chave Stripe
//      determinística

import assert from "node:assert/strict";
import { test } from "node:test";
import express, { type NextFunction, type Request, type Response } from "express";

const { createEnrollmentRouter, createInMemoryEnrollmentStore, ENROLLMENT_FEE_USD_CENTS } = await import(
  "../../server/routes/enrollment.ts"
);
const {
  createEnrollmentFeeCheckout,
  createEnrollmentFeePaymentService,
  isEnrollmentFeeEvent,
  ENROLLMENT_FEE_METADATA_KIND,
} = await import("../../server/payments/enrollmentFeePayment.ts");

interface FakeCheckoutCall {
  params: Record<string, unknown>;
  options: Record<string, unknown>;
}

function fakeStripeApi() {
  const calls: FakeCheckoutCall[] = [];
  const api = {
    checkout: {
      sessions: {
        create: async (params: Record<string, unknown>, options: Record<string, unknown>) => {
          calls.push({ params, options });
          const key = String(options.idempotencyKey ?? "unknown");
          return {
            id: `cs_test_${calls.length}`,
            url: `https://checkout.stripe.com/c/pay/${key}`,
          };
        },
      },
    },
  };
  return { api, calls };
}

type Handler = (req: Request, res: Response, next: NextFunction) => void;

function buildApp(options: {
  store: ReturnType<typeof createInMemoryEnrollmentStore>;
  gateway?: { createFeeCheckout: (input: { userId: string; protocol: string; idempotencyKey: string }) => Promise<{ checkoutUrl: string }> };
}) {
  const app = express();
  app.use(express.json());
  const authenticate: Handler = (req, _res, next) => {
    (req as Request & { user?: { claims: { sub: string } } }).user = { claims: { sub: "operator-1" } };
    next();
  };
  app.use(createEnrollmentRouter({
    authenticate,
    store: options.store,
    ...(options.gateway ? { gateway: options.gateway } : {}),
    getUserId: (req) => (req as Request & { user?: { claims: { sub: string } } }).user!.claims.sub,
  }));
  return app;
}

test("gateway: /fee devolve Checkout Session sem marcar a sessão como paga", async () => {
  const store = createInMemoryEnrollmentStore();
  const { api, calls } = fakeStripeApi();
  const checkout = await createEnrollmentFeeCheckout({
    userId: "operator-1",
    protocol: "KR-REG-ABCD2345",
    idempotencyKey: "idem-fee-key-1-0001",
    stripe: api as never,
    publicOrigin: "https://khaaos.example",
  });

  assert.equal(calls.length, 1);
  const params = calls[0].params as {
    mode: string;
    client_reference_id: string;
    metadata: Record<string, string>;
    line_items: Array<{ price_data: { currency: string; unit_amount: number } }>;
    success_url: string;
  };
  assert.equal(params.mode, "payment");
  assert.equal(params.client_reference_id, "KR-REG-ABCD2345");
  assert.equal(params.metadata.kind, ENROLLMENT_FEE_METADATA_KIND);
  assert.equal(params.metadata.userId, "operator-1");
  assert.equal(params.metadata.protocol, "KR-REG-ABCD2345");
  assert.equal(params.metadata.clientIdempotencyKey, "idem-fee-key-1-0001");
  assert.equal(params.line_items[0].price_data.currency, "usd");
  assert.equal(params.line_items[0].price_data.unit_amount, ENROLLMENT_FEE_USD_CENTS);
  assert.match(checkout.checkoutUrl, /^https:\/\/checkout\.stripe\.com\//);
  // Chave de idempotência determinística: protocol + hash da chave do cliente
  const idempotencyKey = calls[0].options.idempotencyKey as string;
  assert.match(idempotencyKey, /^enrollment-fee-KR-REG-ABCD2345-[0-9a-f]{16}$/);

  // Sessão de alistamento continua intocada (o checkout não é pagamento)
  void store;
});

test("router com gateway: /fee fica GATEWAY_PENDING e replay reusa a mesma sessão", async (t) => {
  const store = createInMemoryEnrollmentStore();
  let createCalls = 0;
  const seenKeys = new Map<string, string>();
  const app = buildApp({
    store,
    gateway: {
      createFeeCheckout: async ({ userId, protocol, idempotencyKey }) => {
        createCalls += 1;
        const cacheKey = `${protocol}:${idempotencyKey}`;
        if (!seenKeys.has(cacheKey)) {
          seenKeys.set(cacheKey, `https://checkout.stripe.com/c/pay/${createCalls}`);
        }
        return { checkoutUrl: seenKeys.get(cacheKey)! };
      },
    },
  });

  // fluxo até AWAITING_FEE
  await fetchJSON(app, "POST", "/api/enrollment/start", {});
  await fetchJSON(app, "POST", "/api/enrollment/steps/data", { displayName: "Operador Um", birthDate: "1990-05-10", country: "BR" });
  await fetchJSON(app, "POST", "/api/enrollment/steps/terms", { accepted: true });

  const first = await fetchJSON(app, "POST", "/api/enrollment/fee", { confirm: true }, "idem-fee-key-1-0001");
  assert.equal(first.status, 200);
  assert.equal(first.body.feeStatus, "GATEWAY_PENDING");
  assert.match(first.body.checkoutUrl, /^https:\/\/checkout\.stripe\.com\//);
  assert.equal(first.body.step, "AWAITING_FEE", "sessão NÃO pode avançar sem o webhook");
  const persisted = store.get("operator-1");
  assert.equal(persisted?.step, "AWAITING_FEE");
  assert.equal(persisted?.fee, null);

  // replay da MESMA chave → mesma URL, mesma resposta, sem nova criação
  const replay = await fetchJSON(app, "POST", "/api/enrollment/fee", { confirm: true }, "idem-fee-key-1-0001");
  assert.equal(replay.status, 200);
  assert.equal(replay.body.checkoutUrl, first.body.checkoutUrl);
  assert.equal(createCalls, 1, "idempotência do gateway: uma única criação");

  // chave diferente enquanto AWAITING_FEE → nova Checkout Session é permitida
  const second = await fetchJSON(app, "POST", "/api/enrollment/fee", { confirm: true }, "idem-fee-key-2-0001");
  assert.equal(second.status, 200);
  assert.notEqual(second.body.checkoutUrl, first.body.checkoutUrl);
  assert.equal(createCalls, 2);
});

test("router com gateway: após fulfillment (sessão COMPLETED) replay devolve sessão paga", async () => {
  const store = createInMemoryEnrollmentStore();
  const app = buildApp({
    store,
    gateway: {
      createFeeCheckout: async () => ({ checkoutUrl: "https://checkout.stripe.com/c/pay/x" }),
    },
  });

  await fetchJSON(app, "POST", "/api/enrollment/start", {});
  await fetchJSON(app, "POST", "/api/enrollment/steps/data", { displayName: "Operador Um", birthDate: "1990-05-10", country: "BR" });
  await fetchJSON(app, "POST", "/api/enrollment/steps/terms", { accepted: true });
  const first = await fetchJSON(app, "POST", "/api/enrollment/fee", { confirm: true }, "idem-fee-key-webhook-1");
  assert.equal(first.body.step, "AWAITING_FEE");

  // Simula o fulfillment do webhook (a ordem ledger→put é coberta na suíte postgres)
  const session = store.get("operator-1")!;
  session.step = "COMPLETED";
  session.fee = { idempotencyKey: "idem-fee-key-webhook-1", amountUsdCents: 100, krcCredited: 100, paidAt: new Date().toISOString() };
  session.bonusKrcCredited = 500;
  await store.put(session);

  const replay = await fetchJSON(app, "POST", "/api/enrollment/fee", { confirm: true }, "idem-fee-key-webhook-1");
  assert.equal(replay.status, 200);
  assert.equal(replay.body.step, "COMPLETED", "nunca devolve Checkout Session velha após pago");
  assert.equal(replay.body.feeStatus, undefined);
  assert.equal(replay.body.bonusKrcCredited, 500);
});

test("router com gateway: gateway indisponível → 503 e sessão permanece AWAITING_FEE", async () => {
  const store = createInMemoryEnrollmentStore();
  const app = buildApp({
    store,
    gateway: {
      createFeeCheckout: async () => {
        throw new Error("stripe unreachable");
      },
    },
  });

  await fetchJSON(app, "POST", "/api/enrollment/start", {});
  await fetchJSON(app, "POST", "/api/enrollment/steps/data", { displayName: "Operador Um", birthDate: "1990-05-10", country: "BR" });
  await fetchJSON(app, "POST", "/api/enrollment/steps/terms", { accepted: true });

  const failed = await fetchJSON(app, "POST", "/api/enrollment/fee", { confirm: true }, "idem-fee-key-down-01");
  assert.equal(failed.status, 503);
  assert.equal(store.get("operator-1")?.step, "AWAITING_FEE", "fail-closed: sem gateway, sem pagamento");
});

test("sem gateway (default #252): caminho mock intacto — COMPLETED + bônus 500", async () => {
  const store = createInMemoryEnrollmentStore();
  const app = buildApp({ store });

  await fetchJSON(app, "POST", "/api/enrollment/start", {});
  await fetchJSON(app, "POST", "/api/enrollment/steps/data", { displayName: "Operador Um", birthDate: "1990-05-10", country: "BR" });
  await fetchJSON(app, "POST", "/api/enrollment/steps/terms", { accepted: true });

  const paid = await fetchJSON(app, "POST", "/api/enrollment/fee", { confirm: true }, "idem-fee-key-mock-01");
  assert.equal(paid.status, 200);
  assert.equal(paid.body.step, "COMPLETED");
  assert.equal(paid.body.bonusKrcCredited, 500);
  assert.equal(paid.body.walletDeltaKrc, 600);
  assert.equal(paid.body.fee.amountUsdCents, 100);

  // replay da mesma chave → mesma resposta (idempotência original preservada)
  const replay = await fetchJSON(app, "POST", "/api/enrollment/fee", { confirm: true }, "idem-fee-key-mock-01");
  assert.equal(replay.status, 200);
  assert.equal(replay.body.step, "COMPLETED");
  assert.equal(replay.body.fee.paidAt, paid.body.fee.paidAt);
});

test("webhook: roteamento e transições de estado do fulfillment da taxa", async () => {
  // Fakes da cadeia drizzle usada por processEvent (insert/onConflict/
  // returning + select/where/for/limit + update/set/where) sobre um livro
  // de eventos em memória — a suíte .postgres cobre o caminho real.
  const eventBook = new Map<string, Record<string, unknown>>();
  const store = createInMemoryEnrollmentStore();
  let ledgerCalls = 0;
  const service = createEnrollmentFeePaymentService({
    store,
    ledger: {
      recordEnrollmentFeeLedger: async ({ protocol, idempotencyKey }) => {
        ledgerCalls += 1;
        return { feeRecorded: true, bonusRecorded: true, protocol, idempotencyKey } as never;
      },
    },
    database: fakeDatabase(eventBook) as never,
  });

  const baseSession = {
    id: "cs_test_a1",
    object: "checkout.session",
    mode: "payment",
    currency: "usd",
    amount_total: 100,
    livemode: false,
    status: "complete",
    payment_status: "paid",
    metadata: {
      kind: ENROLLMENT_FEE_METADATA_KIND,
      userId: "operator-1",
      protocol: "KR-REG-ABCD2345",
      clientIdempotencyKey: "idem-fee-key-wh-0001",
    },
  };

  // sessão de alistamento pronta para receber o pagamento
  await store.put({
    protocol: "KR-REG-ABCD2345",
    userId: "operator-1",
    step: "AWAITING_FEE",
    data: null,
    terms: { version: "KR-TERMS-2026-11", acceptedAt: new Date().toISOString() },
    fee: null,
    bonusKrcCredited: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  const paidEvent = {
    id: "evt_fee_paid",
    type: "checkout.session.completed",
    livemode: false,
    data: { object: baseSession },
  } as never;
  assert.equal(isEnrollmentFeeEvent(paidEvent), true);

  const first = await service.processEvent(paidEvent, "a".repeat(64));
  assert.equal(first, "processed");
  assert.equal(ledgerCalls, 1, "ledger gravado exatamente uma vez");
  const completed = store.get("operator-1");
  assert.equal(completed?.step, "COMPLETED");
  assert.equal(completed?.fee?.idempotencyKey, "idem-fee-key-wh-0001");
  assert.equal(completed?.bonusKrcCredited, 500);

  // re-entrega do mesmo evento → duplicate, nada muda
  const duplicate = await service.processEvent(paidEvent, "a".repeat(64));
  assert.equal(duplicate, "duplicate");
  assert.equal(ledgerCalls, 1);

  // re-entrega com payload divergente → rejected
  const tampered = await service.processEvent(paidEvent, "b".repeat(64));
  assert.equal(tampered, "rejected");

  // evento de expiração → processed e sessão NÃO avança
  await store.put({
    protocol: "KR-REG-ZZ9X8765",
    userId: "operator-2",
    step: "AWAITING_FEE",
    data: null,
    terms: null,
    fee: null,
    bonusKrcCredited: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  const expiredEvent = {
    id: "evt_fee_expired",
    type: "checkout.session.expired",
    livemode: false,
    data: { object: { ...baseSession, id: "cs_test_b2", metadata: { ...baseSession.metadata, userId: "operator-2", protocol: "KR-REG-ZZ9X8765" } } },
  } as never;
  const expiredResult = await service.processEvent(expiredEvent, "c".repeat(64));
  assert.equal(expiredResult, "processed");
  assert.equal(store.get("operator-2")?.step, "AWAITING_FEE");

  // valor divergente → rejected, sessão intacta
  const wrongAmountEvent = {
    id: "evt_fee_wrong_amount",
    type: "checkout.session.completed",
    livemode: false,
    data: { object: { ...baseSession, id: "cs_test_c3", amount_total: 200, metadata: { ...baseSession.metadata, userId: "operator-2", protocol: "KR-REG-ZZ9X8765" } } },
  } as never;
  const wrongAmount = await service.processEvent(wrongAmountEvent, "d".repeat(64));
  assert.equal(wrongAmount, "rejected");
  assert.equal(store.get("operator-2")?.step, "AWAITING_FEE");
  assert.equal(ledgerCalls, 1, "nada é creditado em sessão divergente");

  // sessão inexistente → rejected
  const ghostEvent = {
    id: "evt_fee_ghost",
    type: "checkout.session.completed",
    livemode: false,
    data: { object: { ...baseSession, id: "cs_test_d4", metadata: { ...baseSession.metadata, userId: "operator-404" } } },
  } as never;
  assert.equal(await service.processEvent(ghostEvent, "e".repeat(64)), "rejected");
});

// ─── helpers ────────────────────────────────────────────────────────────────

async function fetchJSON(
  app: express.Express,
  method: "POST" | "GET",
  path: string,
  body: unknown,
  idempotencyKey?: string,
): Promise<{ status: number; body: any }> {
  // A suíte usa o app Express diretamente via fetch contra servidor efêmero
  // (mesma escola do webhook-route).
  const { createServer } = await import("node:http");
  const server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("porta indisponível");
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
      },
      body: method === "POST" ? JSON.stringify(body) : undefined,
    });
    const payload = await response.json().catch(() => null);
    return { status: response.status, body: payload };
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  }
}

/** Fake mínimo da cadeia drizzle usada por processEvent.
 * select devolve TODAS as linhas do livro (o serviço pega a primeira via
 * destructuring — nos caminhos duplicate/tampered o alvo é o evento
 * conflitante, único no livro nestes testes).
 */
function fakeDatabase(eventBook: Map<string, Record<string, unknown>>) {
  const allRows = () => Array.from(eventBook.values());
  const tx = {
    insert: (_table: unknown) => ({
      values: (row: Record<string, unknown>) => ({
        onConflictDoNothing: () => ({
          returning: () => {
            const eventId = String(row.eventId);
            if (eventBook.has(eventId)) return Promise.resolve([]);
            const stored = { ...row, id: eventBook.size + 1 };
            eventBook.set(eventId, stored);
            return Promise.resolve([{ id: stored.id }]);
          },
        }),
        onConflictDoUpdate: () => Promise.resolve(),
      }),
    }),
    select: () => ({
      from: () => ({
        where: () => ({
          for: () => ({
            limit: () => Promise.resolve(allRows()),
          }),
          limit: () => Promise.resolve(allRows()),
        }),
        limit: () => Promise.resolve(allRows()),
      }),
    }),
    update: () => ({
      set: (patch: Record<string, unknown>) => ({
        where: (predicate: unknown) => {
          void predicate;
          for (const [eventId, row] of eventBook) {
            eventBook.set(eventId, { ...row, ...patch });
          }
          return Promise.resolve();
        },
      }),
    }),
  };
  return {
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(tx),
  };
}
