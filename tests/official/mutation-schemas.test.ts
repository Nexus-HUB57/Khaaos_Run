import assert from "node:assert/strict";
import test from "node:test";
import { api } from "../../shared/routes";
import {
  emptyMutationInput,
  zoneStartInput,
  zoneDamageInput,
  zoneHealInput,
  loanPreviewInput,
  economySimulationInput,
  economyBatchSimulationInput,
} from "../../server/game/mutationSchemas";

const rejects = <T extends { safeParse(value: unknown): { success: boolean } }>(schema: T, value: unknown) => {
  assert.equal(schema.safeParse(value).success, false);
};

test("bank/loan/item inputs reject non-finite, out-of-range, fractional and extra fields", () => {
  rejects(api.bank.deposit.input, { amountUsd: Infinity });
  rejects(api.bank.deposit.input, { amountUsd: 10001 });
  rejects(api.bank.transfer.input, { amountKrc: -1, destination: "fbm" });
  rejects(api.bank.transfer.input, { amountKrc: 5, destination: "fbm", userId: "victim" });
  rejects(api.loans.request.input, { amountKrc: 100.5, days: 1 });
  rejects(api.items.purchase.input, { type: "ARMA", name: "   " });
  rejects(api.items.equip.input, { isEquipped: true, userId: "victim" });
  rejects(api.items.repair.input, { amountKrc: 100001 });
});

test("zone, heal, loan preview and simulation mutations reject invalid ranges and unknown keys", () => {
  rejects(emptyMutationInput, { ownerId: "victim" });
  rejects(zoneStartInput, { centerX: 101, centerY: 50 });
  rejects(zoneDamageInput, { damage: 0 });
  rejects(zoneDamageInput, { damage: 5.5 });
  rejects(zoneHealInput, { amount: 101 });
  rejects(loanPreviewInput, { principal: 1, days: 1.5 });
  rejects(economySimulationInput, { agents: 501, days: 30 });
  rejects(economyBatchSimulationInput, { runs: 5, agents: 300, days: 21, seed: "extra" });
  assert.deepEqual(zoneStartInput.parse({}), { centerX: 50, centerY: 50 });
  assert.deepEqual(zoneDamageInput.parse({}), { damage: 5 });
});
