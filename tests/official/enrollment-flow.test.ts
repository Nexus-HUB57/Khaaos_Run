import assert from "node:assert/strict";
import { test } from "node:test";
import express, { type Request, type Response, type NextFunction } from "express";
import request from "supertest";
import {
  createEnrollmentRouter,
  ENROLLMENT_FEE_USD_CENTS,
  ENROLLMENT_FEE_KRC,
  ENROLLMENT_BONUS_KRC,
  ENROLLMENT_TERMS_VERSION,
  type EnrollmentStore,
  type EnrollmentSession,
} from "../../server/routes/enrollment.ts";
import { isValidIdempotencyKey } from "../../server/game/economyMoney.ts";

/* Alistamento E2E (T1.1): 3 etapas + taxa U$1 idempotente + bônus 500 KRC +
 * retomada de sessão. Router de fábrica com auth fake — boundaries de HTTP
 * testados sem provider de identidade. */

const VALID_FEE_KEY = "fee-key-0123456789abcdef"; // ≥16 chars, alfabeto válido
assert.ok(isValidIdempotencyKey(VALID_FEE_KEY));

let currentUser = "op-1";

const fakeAuth = (req: Request, _res: Response, next: NextFunction) => {
  (req as Request & { user?: unknown }).user = {
    claims: { sub: req.get("x-test-user") ?? currentUser },
  };
  next();
};

function buildApp(store?: EnrollmentStore, allowSimulatedFeeForTests = false) {
  const app = express();
  app.use(express.json());
  app.use(createEnrollmentRouter({ authenticate: fakeAuth, store, allowSimulatedFeeForTests }));
  return app;
}

async function enrollThroughTerms(app: express.Express, userId: string) {
  await request(app).post("/api/enrollment/start").set("x-test-user", userId);
  await request(app)
    .post("/api/enrollment/steps/data")
    .set("x-test-user", userId)
    .send({ displayName: "Operadora Alfa", birthDate: "1995-06-15", country: "BR" });
  await request(app)
    .post("/api/enrollment/steps/terms")
    .set("x-test-user", userId)
    .send({ accepted: true });
}

test("fluxo completo: start → dados → termos → taxa com bônus único de 500 KRC", async () => {
  const app = buildApp(undefined, true);

  const start = await request(app).post("/api/enrollment/start");
  assert.equal(start.status, 201);
  assert.equal(start.body.resumed, false);
  assert.match(start.body.protocol, /^KR-REG-[0-9A-Z]{8}$/);
  assert.equal(start.body.step, "AWAITING_DATA");

  const data = await request(app).post("/api/enrollment/steps/data").send({
    displayName: "Operador Bravo",
    birthDate: "2000-01-31",
    country: "PT",
  });
  assert.equal(data.status, 200);
  assert.equal(data.body.step, "AWAITING_TERMS");
  assert.equal(data.body.data.country, "PT");

  const terms = await request(app).post("/api/enrollment/steps/terms").send({ accepted: true });
  assert.equal(terms.status, 200);
  assert.equal(terms.body.step, "AWAITING_FEE");
  assert.equal(terms.body.terms.version, ENROLLMENT_TERMS_VERSION);

  const fee = await request(app)
    .post("/api/enrollment/fee")
    .set("Idempotency-Key", VALID_FEE_KEY)
    .send({ confirm: true });
  assert.equal(fee.status, 200);
  assert.equal(fee.body.step, "COMPLETED");
  assert.equal(fee.body.fee.amountUsdCents, ENROLLMENT_FEE_USD_CENTS);
  assert.equal(fee.body.fee.krcCredited, ENROLLMENT_FEE_KRC);
  assert.equal(fee.body.bonusKrcCredited, ENROLLMENT_BONUS_KRC);
  assert.equal(fee.body.walletDeltaKrc, ENROLLMENT_FEE_KRC + ENROLLMENT_BONUS_KRC);
});

test("sem gateway e sem opt-in de teste: taxa falha fechada sem concluir nem creditar", async () => {
  const app = buildApp();
  await enrollThroughTerms(app, "op-no-payment");

  const response = await request(app)
    .post("/api/enrollment/fee")
    .set("x-test-user", "op-no-payment")
    .set("Idempotency-Key", VALID_FEE_KEY)
    .send({ confirm: true });

  assert.equal(response.status, 503);
  assert.equal(response.body.code, "PAYMENT_PROVIDER_NOT_CONFIGURED");
  const status = await request(app).get("/api/enrollment/status").set("x-test-user", "op-no-payment");
  assert.equal(status.body.step, "AWAITING_FEE");
  assert.equal(status.body.fee, null);
  assert.equal(status.body.bonusKrcCredited, 0);
});

test("taxa idempotente: mesma chave devolve a mesma resposta sem recreditar", async () => {
  const app = buildApp(undefined, true);
  await enrollThroughTerms(app, "op-idem");

  const first = await request(app)
    .post("/api/enrollment/fee")
    .set("x-test-user", "op-idem")
    .set("Idempotency-Key", VALID_FEE_KEY)
    .send({ confirm: true });
  assert.equal(first.status, 200);
  assert.equal(first.body.bonusKrcCredited, ENROLLMENT_BONUS_KRC);

  const second = await request(app)
    .post("/api/enrollment/fee")
    .set("x-test-user", "op-idem")
    .set("Idempotency-Key", VALID_FEE_KEY)
    .send({ confirm: true });
  assert.equal(second.status, 200);
  assert.deepEqual(second.body, first.body); // mesma resposta, crédito único
});

test("retomada de sessão: start repetido devolve a mesma sessão sem resetar etapas", async () => {
  const app = buildApp();
  await enrollThroughTerms(app, "op-resume");

  const status = await request(app)
    .get("/api/enrollment/status")
    .set("x-test-user", "op-resume");
  assert.equal(status.status, 200);
  assert.equal(status.body.step, "AWAITING_FEE");
  const protocol = status.body.protocol;

  const resumed = await request(app)
    .post("/api/enrollment/start")
    .set("x-test-user", "op-resume");
  assert.equal(resumed.status, 200);
  assert.equal(resumed.body.resumed, true);
  assert.equal(resumed.body.protocol, protocol);
  assert.equal(resumed.body.step, "AWAITING_FEE");
  assert.equal(resumed.body.data.displayName, "Operadora Alfa");
});

test("máquina de estados: etapas fora de ordem são rejeitadas (409)", async () => {
  const app = buildApp();
  await request(app).post("/api/enrollment/start");

  const termsFirst = await request(app)
    .post("/api/enrollment/steps/terms")
    .send({ accepted: true });
  assert.equal(termsFirst.status, 409);

  const feeFirst = await request(app)
    .post("/api/enrollment/fee")
    .set("Idempotency-Key", VALID_FEE_KEY)
    .send({ confirm: true });
  assert.equal(feeFirst.status, 409);
});

test("validação de entrada: dados inválidos → 400; sem chave de idempotência → 400", async () => {
  const app = buildApp();
  await request(app).post("/api/enrollment/start");

  const badData = await request(app)
    .post("/api/enrollment/steps/data")
    .send({ displayName: "ab", birthDate: "31-01-2000", country: "brasil" });
  assert.equal(badData.status, 400);

  await enrollThroughTerms(app, currentUser);
  const noKey = await request(app).post("/api/enrollment/fee").send({ confirm: true });
  assert.equal(noKey.status, 400);

  const shortKey = await request(app)
    .post("/api/enrollment/fee")
    .set("Idempotency-Key", "curta")
    .send({ confirm: true });
  assert.equal(shortKey.status, 400);
});

test("store plugável: persistência externa é honrada (retomada entre instâncias)", async () => {
  const sessions = new Map<string, EnrollmentSession>();
  const store: EnrollmentStore = {
    get: (userId) => sessions.get(userId),
    getByProtocol: (protocol) => [...sessions.values()].find((session) => session.protocol === protocol),
    put: (session) => {
      sessions.set(session.userId, session);
    },
  };

  const writer = buildApp(store);
  const start = await request(writer).post("/api/enrollment/start").set("x-test-user", "op-ext");
  assert.equal(start.status, 201);

  // nova instância do router, mesmo store → mesma sessão
  const reader = buildApp(store);
  const status = await request(reader).get("/api/enrollment/status").set("x-test-user", "op-ext");
  assert.equal(status.status, 200);
  assert.equal(status.body.protocol, start.body.protocol);
});

test("sem sessão: status/steps/fee → 404", async () => {
  const app = buildApp();
  const status = await request(app).get("/api/enrollment/status").set("x-test-user", "ghost");
  assert.equal(status.status, 404);
  const step = await request(app)
    .post("/api/enrollment/steps/data")
    .set("x-test-user", "ghost")
    .send({ displayName: "Fantasma", birthDate: "1990-01-01", country: "BR" });
  assert.equal(step.status, 404);
});
