// KHAAOS RUN — Contrato do SSOT dos ledgers (Task 44)
// ====================================================
// Guardas estáticos (sem banco) da decisão registrada em
// docs/ECONOMY_LEDGER_SSOT.md:
//
//   1. O doc de decisão existe e designa economy_ledger_entries como SSOT,
//      mapeando os 4 ledgers (SSOT, simulação game-runtime, 2PC economy-server,
//      AtomicLedger deprecado)
//   2. A trilha de simulação continua CONGELADA: REAL_MONEY_ENABLED é
//      Object.freeze(false) e o tripwire assertRealMoneyDisabled permanece
//      exportado em game-runtime/server/economy.js (dinheiro de brincadeira
//      NUNCA migra para o SSOT por acidente)
//   3. AtomicLedger.ts (TS) está marcado DEPRECADO — código novo usa o SSOT
//   4. O webhook Stripe roteia eventos da taxa (metadata.kind=enrollment_fee)
//      para o fulfillment dedicado ANTES do processador de pacotes KRC
//   5. O relatório de reconciliação carrega as 2 seções novas
//      (ledgerGlobalDrift + paidEnrollmentSessionsWithoutLedger) e o script
//      scripts/economy-reconcile.ts continua consumindo o relatório
//   6. O gateway da taxa só liga com ENROLLMENT_FEE_GATEWAY=stripe E config
//      test-only completa — e o wiring exige ENROLLMENT_STORE=postgres

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const read = (path: string) => readFile(`${process.cwd()}/${path}`, "utf8");

test("doc de decisão: economy_ledger_entries é o SSOT e os 4 ledgers estão mapeados", async () => {
  const doc = await read("docs/ECONOMY_LEDGER_SSOT.md");
  assert.match(doc, /SSOT = `economy_ledger_entries`/);
  assert.match(doc, /L1/);
  assert.match(doc, /game-runtime\/server\/economy\.js/);
  assert.match(doc, /economy-server\//);
  assert.match(doc, /krc_ledger/);
  assert.match(doc, /AtomicLedger/);
  assert.match(doc, /REAL_MONEY_ENABLED/);
  assert.match(doc, /NUNCA reconciliar contra o SSOT/);
});

test("trilha de simulação: REAL_MONEY_ENABLED congelado em false + tripwire intacto", async () => {
  const source = await read("game-runtime/server/economy.js");
  assert.match(source, /export const REAL_MONEY_ENABLED = Object\.freeze\(false\)/);
  assert.match(source, /export function assertRealMoneyDisabled/);
  const rewards = await read("game-runtime/server/rewards.js");
  assert.match(rewards, /assertRealMoneyDisabled/);
});

test("AtomicLedger.ts deprecado no runtime TS", async () => {
  const source = await read("server/game/AtomicLedger.ts");
  assert.match(source, /DEPRECADO NO RUNTIME TS/);
  assert.match(source, /ECONOMY_LEDGER_SSOT\.md/);
});

test("webhook roteia eventos da taxa antes do processador de pacotes KRC", async () => {
  const routes = await read("server/routes.ts");
  const interceptIndex = routes.indexOf("isEnrollmentFeeEvent(event)");
  const processEventIndex = routes.indexOf("stripePaymentService.processEvent(event, sha256Payload(rawBody))");
  assert.ok(interceptIndex > 0, "routes.ts deve referenciar o intercept de eventos da taxa");
  assert.ok(processEventIndex > 0, "routes.ts deve manter o processador de pacotes");
  assert.ok(interceptIndex < processEventIndex, "intercept da taxa deve vir ANTES do processador de pacotes");
});

test("auditoria de reconciliação expõe as seções novas e o reconciliador as consome", async () => {
  const audit = await read("server/game/economyAudit.ts");
  assert.match(audit, /ledgerGlobalConservationSql/);
  assert.match(audit, /paidEnrollmentSessionsWithoutLedgerSql/);
  assert.match(audit, /to_regclass\('public\.enrollment_sessions'\)/);
  assert.match(audit, /ledgerGlobalDrift/);
  const script = await read("scripts/economy-reconcile.ts");
  assert.match(script, /createEconomyAuditReport/);
  assert.match(script, /report\.status !== "clean"/);
});

test("gateway da taxa: fail-closed por env — stripe test-only e store postgres obrigatória", async () => {
  const payments = await read("server/payments/enrollmentFeePayment.ts");
  assert.match(payments, /ENROLLMENT_FEE_GATEWAY !== "stripe"/);
  assert.match(payments, /getStripeTestConfig/);
  assert.match(payments, /currency: "usd"/);
  assert.match(payments, /unit_amount: ENROLLMENT_FEE_USD_CENTS/);
  const routes = await read("server/routes.ts");
  assert.match(routes, /ENROLLMENT_FEE_GATEWAY=stripe exige ENROLLMENT_STORE=postgres/);
  const router = await read("server/routes/enrollment.ts");
  assert.match(router, /feeStatus: "GATEWAY_PENDING"/);
  assert.match(router, /Gateway de pagamento indisponível/);
});
