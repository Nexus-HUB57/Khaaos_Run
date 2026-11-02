import assert from "node:assert/strict";
import test from "node:test";
import {
  CIE_RULES_PROTOTYPE,
  decideCieRoster,
  evaluateCieTrigger,
  resolveCieReturn,
} from "../../server/game/specialIncursion.ts";

const NOW = Date.UTC(2026, 10, 1, 12, 0, 0);

function trigger(overrides: Partial<Parameters<typeof evaluateCieTrigger>[0]> = {}) {
  return evaluateCieTrigger({
    campaignDay: 3,
    nowMs: NOW,
    regularWindowClosesAtMs: NOW - 60_000,
    scheduledTriggerAtMs: NOW - 30_000,
    retryUntilMs: NOW + 30 * 60_000,
    activeRegularRings: 0,
    onlineSurvivors: 90,
    onlineEliminated: 1,
    cieAlreadyOpenedToday: false,
    ...overrides,
  });
}

function baseRoster(overrides: Partial<Parameters<typeof decideCieRoster>[0]> = {}) {
  return decideCieRoster({
    campaignDay: 3,
    openedAtMs: NOW,
    nowMs: NOW + 180_000,
    survivorSignups: Array.from({ length: 90 }, (_, i) => ({ playerId: `survivor-${i + 1}`, online: true })),
    eliminatedSignups: [{ playerId: "eliminated-1", online: true }],
    seed: "cie-seed-01",
    ...overrides,
  });
}

test("CIE ocupa no máximo 100 lugares: 90 sobreviventes e até 10 eliminados", () => {
  assert.equal(CIE_RULES_PROTOTYPE.capacity, 100);
  assert.equal(CIE_RULES_PROTOTYPE.survivorSlots, 90);
  assert.equal(CIE_RULES_PROTOTYPE.eliminatedSlotsMax, 10);
  const result = baseRoster({
    eliminatedSignups: Array.from({ length: 14 }, (_, i) => ({ playerId: `eliminated-${i + 1}`, online: true })),
  });
  assert.equal(result.kind, "READY");
  if (result.kind === "READY") {
    assert.equal(result.survivorIds.length, 90);
    assert.equal(result.eliminatedIds.length, 10);
    assert.equal(result.rosterIds.length, 100);
    assert.equal(new Set(result.rosterIds).size, 100);
  }
});

test("com menos de dez eliminados, os lugares de retorno não são preenchidos por sobreviventes extras", () => {
  const result = baseRoster({
    survivorSignups: Array.from({ length: 120 }, (_, i) => ({ playerId: `survivor-${i + 1}`, online: true })),
    eliminatedSignups: Array.from({ length: 3 }, (_, i) => ({ playerId: `eliminated-${i + 1}`, online: true })),
  });
  assert.equal(result.kind, "READY");
  if (result.kind === "READY") {
    assert.equal(result.survivorIds.length, 90);
    assert.equal(result.eliminatedIds.length, 3);
    assert.equal(result.rosterIds.length, 93);
  }
});

test("CIE só usa inscritos online no lock e não seleciona contas offline", () => {
  const result = baseRoster({
    survivorSignups: [
      ...Array.from({ length: 90 }, (_, i) => ({ playerId: `online-${i + 1}`, online: true })),
      { playerId: "survivor-offline", online: false },
    ],
    eliminatedSignups: [
      { playerId: "returner-online", online: true },
      { playerId: "returner-offline", online: false },
    ],
  });
  assert.equal(result.kind, "READY");
  if (result.kind === "READY") {
    assert.equal(result.rosterIds.includes("survivor-offline"), false);
    assert.equal(result.rosterIds.includes("returner-offline"), false);
  }
});

test("CIE aguarda quórum de 90 sobreviventes e ao menos um eliminado online", () => {
  const fewSurvivors = baseRoster({ survivorSignups: Array.from({ length: 89 }, (_, i) => ({ playerId: `survivor-${i}`, online: true })) });
  assert.deepEqual(fewSurvivors, { kind: "WAITING", reason: "NEED_90_ONLINE_SURVIVORS" });
  const noEliminated = baseRoster({ eliminatedSignups: [] });
  assert.deepEqual(noEliminated, { kind: "WAITING", reason: "NEED_ONLINE_ELIMINATED" });
});

test("CIE só arma após a janela regular, horário secreto e término dos Rings regulares", () => {
  assert.equal(trigger({ nowMs: NOW - 120_000 }).kind, "WAITING");
  assert.deepEqual(trigger({ nowMs: NOW - 45_000, regularWindowClosesAtMs: NOW - 60_000 }), {
    kind: "WAITING", reason: "BEFORE_SCHEDULED_TRIGGER", retryUntilMs: NOW + 30 * 60_000,
  });
  assert.deepEqual(trigger({ activeRegularRings: 1 }), {
    kind: "WAITING", reason: "REGULAR_RING_ACTIVE", retryUntilMs: NOW + 30 * 60_000,
  });
  assert.equal(trigger().kind, "OPEN");
});

test("CIE expira sem quórum, só abre uma vez por dia e não oferece retorno no Dia 7", () => {
  assert.deepEqual(trigger({ onlineSurvivors: 89, nowMs: NOW + 30 * 60_000, retryUntilMs: NOW + 30 * 60_000 }), {
    kind: "EXPIRED", reason: "POOL_OR_RING_GATE_NOT_MET",
  });
  assert.equal(trigger({ cieAlreadyOpenedToday: true }).kind, "UNAVAILABLE");
  assert.deepEqual(trigger({ campaignDay: 7 }), { kind: "UNAVAILABLE", reason: "DAY_7_HAS_NO_CAMPAIGN_RETURN" });
});

test("janela de inscrição da CIE dura 3 minutos mesmo quando há lugares imediatos", () => {
  const result = baseRoster({ nowMs: NOW + 179_999 });
  assert.deepEqual(result, { kind: "WAITING", reason: "REGISTRATION_WINDOW" });
});

test("eliminado retorna ao próximo dia ao terminar no top 10 da CIE", () => {
  assert.deepEqual(resolveCieReturn({
    role: "ELIMINATED", campaignDay: 3, finalPlacement: 10, aliveAtEnd: false, hasReturnSeal: false, alreadyReturned: false,
  }), { outcome: "RETURN_NEXT_DAY", nextCampaignDay: 4, returnEligible: true, reason: "TOP_10_RESULT" });
});

test("eliminado retorna pelo Selo apenas se sobreviver até o fim da CIE", () => {
  const returned = resolveCieReturn({
    role: "ELIMINATED", campaignDay: 6, finalPlacement: 45, aliveAtEnd: true, hasReturnSeal: true, alreadyReturned: false,
  });
  assert.deepEqual(returned, { outcome: "RETURN_NEXT_DAY", nextCampaignDay: 7, returnEligible: true, reason: "RETURN_SEAL_AND_SURVIVED" });
  const failed = resolveCieReturn({
    role: "ELIMINATED", campaignDay: 6, finalPlacement: 45, aliveAtEnd: false, hasReturnSeal: true, alreadyReturned: false,
  });
  assert.equal(failed.outcome, "REMAINS_ELIMINATED");
});

test("retorno é uma única vez; Dia 7 não ressuscita para a mesma campanha", () => {
  const used = resolveCieReturn({
    role: "ELIMINATED", campaignDay: 2, finalPlacement: 1, aliveAtEnd: true, hasReturnSeal: true, alreadyReturned: true,
  });
  assert.equal(used.outcome, "REMAINS_ELIMINATED");
  const finalDay = resolveCieReturn({
    role: "ELIMINATED", campaignDay: 7, finalPlacement: 1, aliveAtEnd: true, hasReturnSeal: true, alreadyReturned: false,
  });
  assert.equal(finalDay.outcome, "REMAINS_ELIMINATED");
});

test("sobrevivente mantém a campanha se vive; morrer na CIE elimina o estado ativo", () => {
  assert.deepEqual(resolveCieReturn({
    role: "SURVIVOR", campaignDay: 2, finalPlacement: 1, aliveAtEnd: true, hasReturnSeal: false, alreadyReturned: false,
  }), { outcome: "SURVIVOR_REMAINS_ACTIVE", nextCampaignDay: 3, returnEligible: false });
  assert.equal(resolveCieReturn({
    role: "SURVIVOR", campaignDay: 6, finalPlacement: 45, aliveAtEnd: true, hasReturnSeal: false, alreadyReturned: false,
  }).nextCampaignDay, 7);
  assert.equal(resolveCieReturn({
    role: "SURVIVOR", campaignDay: 2, finalPlacement: 20, aliveAtEnd: false, hasReturnSeal: false, alreadyReturned: false,
  }).outcome, "SURVIVOR_ELIMINATED_IN_CIE");
});
