import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateLoanInterestMinorUnits,
  fromMinorUnits,
  hashEconomicRequest,
  isValidIdempotencyKey,
  toMinorUnits,
} from "../../server/game/economyMoney";
import { api } from "../../shared/routes";

test("economia usa centavos inteiros sem aritmética binária monetária", () => {
  assert.equal(toMinorUnits(0.1), 10n);
  assert.equal(toMinorUnits(0.29), 29n);
  assert.equal(toMinorUnits("1e-2"), 1n);
  assert.equal(fromMinorUnits(toMinorUnits(1234.56)), "1234.56");
  assert.equal(calculateLoanInterestMinorUnits(1000, 7), 35000n);
  assert.throws(() => toMinorUnits(1.005), /duas casas decimais/);
});

test("entrada econômica aceita somente centavos exatos e rejeita destinos inexistentes", () => {
  assert.equal(api.bank.transfer.input.safeParse({ amountKrc: 2.25, destination: "bonus" }).success, true);
  assert.equal(api.bank.transfer.input.safeParse({ amountKrc: 2.25, destination: "weapons" }).success, false);
  assert.equal(api.bank.transfer.input.safeParse({ amountKrc: 1.005, destination: "fbm" }).success, false);
  assert.equal(api.items.repair.input.safeParse({ amountKrc: 1.001 }).success, false);
});

test("respostas econômicas preservam correlação e depósito sem pagamento permanece indisponível", () => {
  const operationId = "3d3a24ee-5c95-48df-a84d-2114e97cb12e";
  assert.equal(api.bank.deposit.responses[503].parse({
    code: "PAYMENTS_NOT_CONFIGURED",
    message: "Depósitos estão temporariamente indisponíveis. Nenhum KRC foi creditado.",
  }).code, "PAYMENTS_NOT_CONFIGURED");
  assert.equal(api.bank.transfer.responses[200].parse({ message: "ok", newBalance: "9.00", operationId }).operationId, operationId);
  assert.equal(api.loans.request.responses[201].parse({ id: 2, operationId }).operationId, operationId);
  assert.equal(api.loans.pay.responses[200].parse({ message: "ok", operationId }).operationId, operationId);
  assert.equal(api.items.purchase.responses[201].parse({ id: 3, operationId }).operationId, operationId);
  assert.equal(api.items.repair.responses[200].parse({ message: "ok", newDurability: "100", operationId }).operationId, operationId);
  assert.equal(api.player.daily.responses[200].parse({ message: "ok", amount: "100.00", operationId }).operationId, operationId);
  assert.equal(api.bank.deposit.responses[503].safeParse({ code: "PAYMENTS_NOT_CONFIGURED", message: "aguardando" }).success, true);
});

test("hashes idempotentes são estáveis à ordem das chaves e mudam com o conteúdo", () => {
  assert.equal(
    hashEconomicRequest("bank.transfer", { amountKrc: 10, destination: "fbm" }),
    hashEconomicRequest("bank.transfer", { destination: "fbm", amountKrc: 10 }),
  );
  assert.notEqual(
    hashEconomicRequest("bank.transfer", { amountKrc: 10, destination: "fbm" }),
    hashEconomicRequest("bank.transfer", { amountKrc: 11, destination: "fbm" }),
  );
  assert.notEqual(
    hashEconomicRequest("bank.transfer", { amountKrc: 10, destination: "fbm" }),
    hashEconomicRequest("bank.deposit", { amountKrc: 10, destination: "fbm" }),
  );
});

test("chave de idempotência exige tamanho e caracteres permitidos", () => {
  assert.equal(isValidIdempotencyKey("3d3a24ee-5c95-48df-a84d-2114e97cb12e"), true);
  assert.equal(isValidIdempotencyKey("too-short"), false);
  assert.equal(isValidIdempotencyKey("invalid key with spaces"), false);
  assert.equal(isValidIdempotencyKey("x".repeat(129)), false);
});
