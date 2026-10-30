import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateLoanInterestMinorUnits,
  computeLoanTerms,
  fromMinorUnits,
  hashEconomicRequest,
  isValidIdempotencyKey,
  toMinorUnits,
} from "../../server/game/economyMoney";
import { computeLoan } from "../../server/game/EconomyEngine";
import { loanPreviewInput } from "../../server/game/mutationSchemas";
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
  assert.equal(api.items.purchase.input.safeParse({ catalogId: "rifle-de-plasma" }).success, true);
  assert.equal(api.items.purchase.input.safeParse({ catalogId: "rifle-inventado" }).success, false);
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

test("M2: contrato canônico do empréstimo — juro 5%/dia, domínio inteiro 100..10000 × 1..30", () => {
  // valores canônicos em minor units
  assert.deepEqual(computeLoanTerms(1000, 7).minor, { principal: 100000n, interest: 35000n, totalDue: 135000n });
  assert.equal(computeLoanTerms(1000, 7).totalDue, "1350.00");
  assert.equal(computeLoanTerms(137, 1).interest, "6.85");
  // domínio exige principal INTEIRO em KRC (idêntico à cobrança)
  assert.throws(() => computeLoanTerms("100.50", 1), /inteiro de KRC/);
  assert.throws(() => computeLoanTerms(1000.5, 7), /inteiro de KRC/);
  // APR de exibição (multiplicador, mesma semântica do computeLoan antigo): 0.05 × 365 = 18.25× (1825% a.a.)
  assert.equal(computeLoanTerms(1000, 1).apr, "18.25");
  // fronteiras do domínio compartilhado
  assert.equal(computeLoanTerms(100, 1).totalDue, "105.00");
  assert.equal(computeLoanTerms(10000, 30).totalDue, "25000.00"); // 10000 + 15000 de juro
  assert.throws(() => computeLoanTerms(99, 1), /fora da faixa/);
  assert.throws(() => computeLoanTerms(10001, 1), /fora da faixa/);
  assert.throws(() => computeLoanTerms(100, 0), /fora da faixa/);
  assert.throws(() => computeLoanTerms(100, 31), /fora da faixa/);
  // preview (rota) recusa exatamente o mesmo domínio
  assert.equal(loanPreviewInput.safeParse({ principal: 99, days: 1 }).success, false);
  assert.equal(loanPreviewInput.safeParse({ principal: 10001, days: 1 }).success, false);
  assert.equal(loanPreviewInput.safeParse({ principal: 100, days: 31 }).success, false);
  assert.equal(loanPreviewInput.safeParse({ principal: 1000.5, days: 7 }).success, false);
});

test("M2: preview e cobrança compartilham a mesma fonte (matriz de prazos unitária)", () => {
  for (const principal of [100, 137, 250, 1000, 2500, 7777, 10000]) {
    for (const days of [1, 2, 3, 7, 14, 30]) {
      const viaEngine = computeLoan(principal, days);          // usado pela rota de preview
      const canonical = computeLoanTerms(principal, days);      // usado pela cobrança
      const oracleInterest = (BigInt(principal) * 100n * 5n * BigInt(days) + 50n) / 100n;
      assert.equal(viaEngine.interest, canonical.interest, `${principal}x${days}: interest`);
      assert.equal(viaEngine.totalDue, canonical.totalDue, `${principal}x${days}: totalDue`);
      assert.equal(canonical.minor.interest, oracleInterest, `${principal}x${days}: oracle`);
      assert.equal(BigInt(canonical.minor.principal) + canonical.minor.interest, canonical.minor.totalDue);
      assert.equal(Number(viaEngine.interest) * 100, Number(oracleInterest), "string = minor units");
    }
  }
});
