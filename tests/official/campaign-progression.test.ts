import assert from "node:assert/strict";
import test from "node:test";
import {
  CAMPAIGN_RULES_PROTOTYPE,
  applyCampaignResolution,
  campaignKdRatio,
  campaignWindowAt,
  createCampaignRandomIndex,
  createCampaignProgress,
  decideCampaignRoster,
  extendRingProtection,
  resolveCampaignRing,
  startCampaignAttempt,
} from "../../server/game/campaignProgression.ts";

const NOW = Date.UTC(2026, 10, 1, 12, 0, 0);

function roster(size = 100, survivors: Array<{ id: number; health?: number; xp?: number; battles?: number; kills?: number; deaths?: number; tie?: number }> = []) {
  const byId = new Map(survivors.map((item) => [item.id, item]));
  return Array.from({ length: size }, (_, index) => {
    const playerId = `player-${String(index + 1).padStart(3, "0")}`;
    const metrics = byId.get(index + 1);
    return {
      playerId,
      aliveAtEvaluation: Boolean(metrics),
      currentHealth: metrics?.health ?? 0,
      accountXp: metrics?.xp ?? index,
      battlesPlayed: metrics?.battles ?? index,
      lifetimeKills: metrics?.kills ?? 0,
      lifetimeDeaths: metrics?.deaths ?? 0,
      ...(metrics?.tie === undefined ? {} : { randomTieBreak: metrics.tie }),
    };
  });
}

function start(day = 1, matchId = `ring-${day}`) {
  let progress = createCampaignProgress("campaign-2026-11", "player-001");
  for (let currentDay = 1; currentDay < day; currentDay += 1) {
    const priorId = `ring-${currentDay}`;
    progress = startCampaignAttempt(progress, priorId);
    const ring = resolveCampaignRing({
      matchId: priorId,
      day: currentDay,
      finishReason: "LAST_SURVIVOR",
      participants: roster(100, [{ id: 1, health: 100 }]),
    });
    const applied = applyCampaignResolution(progress, ring.results[0]);
    progress = applied.progress;
  }
  return startCampaignAttempt(progress, matchId);
}

function decision(overrides: Partial<Parameters<typeof decideCampaignRoster>[0]> = {}) {
  return decideCampaignRoster({
    openedAtMs: NOW,
    nowMs: NOW + 180_000,
    registered: [],
    eligibleSurvivors: Array.from({ length: 100 }, (_, index) => ({
      playerId: `candidate-${index + 1}`,
      online: index % 2 === 0,
      protectedUntilMs: null,
    })),
    drawSeed: "test-seed-001",
    randomIndex: (upperExclusive) => upperExclusive - 1,
    ...overrides,
  });
}

test("parâmetros do Ring confirmados: 100 vagas, registro 3 min, avaliação 10 min e 12 h UTC", () => {
  assert.equal(CAMPAIGN_RULES_PROTOTYPE.maxPlayers, 100);
  assert.equal(CAMPAIGN_RULES_PROTOTYPE.registrationTimeoutSeconds, 180);
  assert.equal(CAMPAIGN_RULES_PROTOTYPE.ringEvaluationSeconds, 600);
  assert.equal(CAMPAIGN_RULES_PROTOTYPE.dailyWindowHours, 12);
  assert.equal(CAMPAIGN_RULES_PROTOTYPE.promotionShare, 0.1);
  assert.deepEqual(CAMPAIGN_RULES_PROTOTYPE.protectionHours, [12, 24, 36, 72]);
});

test("a entrada aguarda até 100 inscrições ou os três minutos", () => {
  const result = decision({ nowMs: NOW + 179_999, registered: [{ playerId: "signed-1", online: true, protectedUntilMs: null }] });
  assert.equal(result.kind, "WAITING");
  if (result.kind === "WAITING") {
    assert.equal(result.reason, "REGISTRATION_WINDOW");
    assert.equal(result.remainingSlots, 99);
  }
});

test("100 inscrições fecham a formação imediatamente sem sorteio adicional", () => {
  const registered = Array.from({ length: 100 }, (_, index) => ({
    playerId: `signed-${String(index + 1).padStart(3, "0")}`,
    online: index % 2 === 0,
    protectedUntilMs: null,
    registeredAtMs: NOW + index,
  }));
  const result = decision({ nowMs: NOW + 1_000, registered, eligibleSurvivors: [] });
  assert.equal(result.kind, "READY");
  if (result.kind === "READY") {
    assert.equal(result.roster.length, 100);
    assert.equal(result.filledRandomly.length, 0);
    assert.equal(result.drawSeed, null);
  }
});

test("após 3 minutos, completa o roster por sorteio entre sobreviventes online e offline", () => {
  const result = decision({
    registered: [{ playerId: "registered", online: true, protectedUntilMs: null }],
    eligibleSurvivors: Array.from({ length: 120 }, (_, index) => ({
      playerId: `candidate-${index + 1}`,
      online: index % 2 === 0,
      protectedUntilMs: null,
    })),
  });
  assert.equal(result.kind, "READY");
  if (result.kind === "READY") {
    assert.equal(result.roster.length, 100);
    assert.equal(result.filledRandomly.length, 99);
    assert.equal(new Set(result.roster.map(({ playerId }) => playerId)).size, 100);
    assert.equal(result.roster.some(({ online }) => !online), true);
    assert.equal(result.drawSeed, "test-seed-001");
  }
});

test("seed do sorteio reproduz o mesmo roster após retry", () => {
  const candidates = Array.from({ length: 150 }, (_, index) => ({
    playerId: `seeded-${index + 1}`,
    online: index % 2 === 0,
    protectedUntilMs: null,
  }));
  const first = decision({ eligibleSurvivors: candidates, randomIndex: createCampaignRandomIndex("stable-ring-seed"), drawSeed: "stable-ring-seed" });
  const retry = decision({ eligibleSurvivors: candidates, randomIndex: undefined, drawSeed: "stable-ring-seed" });
  const sameSeed = decision({ eligibleSurvivors: candidates, randomIndex: createCampaignRandomIndex("stable-ring-seed"), drawSeed: "stable-ring-seed" });
  assert.equal(first.kind, "READY");
  assert.equal(retry.kind, "READY");
  assert.equal(sameSeed.kind, "READY");
  if (retry.kind === "READY" && sameSeed.kind === "READY") {
    assert.deepEqual(retry.roster.map(({ playerId }) => playerId), sameSeed.roster.map(({ playerId }) => playerId));
  }
});

test("a seleção aleatória exclui proteção ativa, mas não cancela quem já se inscreveu", () => {
  const result = decision({
    registered: [{ playerId: "signed-protected", online: false, protectedUntilMs: NOW + 50_000 }],
    eligibleSurvivors: [
      { playerId: "signed-protected", online: false, protectedUntilMs: NOW + 50_000 },
      ...Array.from({ length: 99 }, (_, index) => ({
        playerId: `protected-${index + 1}`,
        online: false,
        protectedUntilMs: NOW + 180_001,
      })),
      ...Array.from({ length: 100 }, (_, index) => ({
        playerId: `free-${index + 1}`,
        online: index % 2 === 0,
        protectedUntilMs: null,
      })),
    ],
  });
  assert.equal(result.kind, "READY");
  if (result.kind === "READY") {
    assert.equal(result.roster[0].playerId, "signed-protected");
    assert.equal(result.roster.length, 100);
    assert.equal(result.roster.some(({ playerId }) => playerId.startsWith("protected-")), false);
  }
});

test("proteção que expira no instante da seleção não exclui o candidato", () => {
  const result = decision({
    eligibleSurvivors: [
      { playerId: "expires-now", online: false, protectedUntilMs: NOW + 180_000 },
      ...Array.from({ length: 99 }, (_, index) => ({ playerId: `other-${index}`, online: true, protectedUntilMs: null })),
    ],
  });
  assert.equal(result.kind, "READY");
  if (result.kind === "READY") assert.equal(result.roster.some(({ playerId }) => playerId === "expires-now"), true);
});

test("não inicia Ring parcial se o pool elegível for insuficiente após o timeout", () => {
  const result = decision({ eligibleSurvivors: [{ playerId: "only-one", online: false, protectedUntilMs: null }] });
  assert.equal(result.kind, "WAITING");
  if (result.kind === "WAITING") {
    assert.equal(result.reason, "NOT_ENOUGH_ELIGIBLE_SURVIVORS");
    assert.equal(result.remainingSlots, 100);
  }
});

test("até dez sobreviventes avançam automaticamente, independente do rank individual", () => {
  const participants = roster(100, Array.from({ length: 10 }, (_, index) => ({ id: index + 1, health: 1 + index, xp: index, battles: index })));
  const result = resolveCampaignRing({ matchId: "ring-ten", day: 1, finishReason: "TIME_LIMIT", participants });
  assert.equal(result.survivorCount, 10);
  assert.equal(result.advancingLimit, 10);
  assert.equal(result.advancingPlayerIds.length, 10);
  assert.equal(result.results.filter((entry) => entry.outcome === "QUALIFIED").length, 10);
  assert.equal(result.results.filter((entry) => entry.outcome === "QUALIFIED").every((entry) => entry.advancedAutomatically), true);
});

test("com dois sobreviventes, ambos avançam automaticamente nos Dias 1–6", () => {
  const result = resolveCampaignRing({
    matchId: "ring-two-survivors",
    day: 1,
    finishReason: "TIME_LIMIT",
    participants: roster(100, [{ id: 1, health: 4 }, { id: 2, health: 2 }]),
  });
  assert.deepEqual(result.advancingPlayerIds, ["player-001", "player-002"]);
  assert.equal(result.results.filter((entry) => entry.outcome === "QUALIFIED").length, 2);
  assert.equal(result.results.filter((entry) => entry.outcome === "QUALIFIED").every((entry) => entry.advancedAutomatically), true);
});

test("com mais de dez sobreviventes, exatamente os dez de maior HP avançam", () => {
  const participants = roster(100, Array.from({ length: 11 }, (_, index) => ({ id: index + 1, health: index + 1 })));
  const result = resolveCampaignRing({ matchId: "ring-eleven", day: 2, finishReason: "TIME_LIMIT", participants });
  assert.equal(result.survivorCount, 11);
  assert.equal(result.advancingPlayerIds.length, 10);
  assert.equal(result.advancingPlayerIds.includes("player-011"), true);
  assert.equal(result.advancingPlayerIds.includes("player-001"), false);
  assert.equal(result.results.find((entry) => entry.playerId === "player-001")?.reason, "OUTSIDE_TOP_10");
});

test("desempate: HP, XP, batalhas e depois K/D", () => {
  const survivors = [
    { id: 1, health: 50, xp: 999, battles: 999, kills: 999, deaths: 1 },
    { id: 2, health: 80, xp: 10, battles: 1, kills: 1, deaths: 9 },
    { id: 3, health: 80, xp: 20, battles: 1, kills: 1, deaths: 1 },
    { id: 4, health: 80, xp: 20, battles: 3, kills: 1, deaths: 1 },
    { id: 5, health: 80, xp: 20, battles: 3, kills: 6, deaths: 2 },
  ];
  const result = resolveCampaignRing({ matchId: "tie-order", day: 1, finishReason: "TIME_LIMIT", participants: roster(100, survivors) });
  assert.deepEqual(result.orderedSurvivorIds.slice(0, 5), ["player-005", "player-004", "player-003", "player-002", "player-001"]);
});

test("empate absoluto usa ticket aleatório persistível e reprodutível", () => {
  const result = resolveCampaignRing({
    matchId: "ticket-tie",
    day: 1,
    finishReason: "TIME_LIMIT",
    participants: roster(100, [
      { id: 1, health: 100, xp: 100, battles: 20, kills: 10, deaths: 2, tie: 8 },
      { id: 2, health: 100, xp: 100, battles: 20, kills: 10, deaths: 2, tie: 90 },
    ]),
  });
  assert.deepEqual(result.orderedSurvivorIds, ["player-002", "player-001"]);
});

test("um único sobrevivente encerra cedo e avança nos Dias 1–6", () => {
  const result = resolveCampaignRing({
    matchId: "early-last-survivor",
    day: 3,
    finishReason: "LAST_SURVIVOR",
    participants: roster(100, [{ id: 1, health: 37 }]),
  });
  assert.equal(result.advancingPlayerIds.length, 1);
  assert.equal(result.results[0].outcome, "QUALIFIED");
  assert.equal(result.results[0].reason, "LAST_SURVIVOR");
});

test("com zero sobreviventes, ninguém avança", () => {
  const result = resolveCampaignRing({ matchId: "no-survivor", day: 4, finishReason: "TIME_LIMIT", participants: roster() });
  assert.equal(result.survivorCount, 0);
  assert.equal(result.advancingPlayerIds.length, 0);
  assert.equal(result.results.every((entry) => entry.outcome === "ELIMINATED"), true);
});

test("Dia 7: último sobrevivente ou primeiro pelo mesmo ranking do corte é campeão", () => {
  const result = resolveCampaignRing({
    matchId: "final-day",
    day: 7,
    finishReason: "TIME_LIMIT",
    participants: roster(100, [
      { id: 1, health: 80, xp: 100 },
      { id: 2, health: 95, xp: 1 },
      { id: 3, health: 90, xp: 900 },
    ]),
  });
  assert.equal(result.championId, "player-002");
  assert.equal(result.advancingPlayerIds.length, 0);
  assert.equal(result.results.find((entry) => entry.playerId === "player-002")?.outcome, "CHAMPION");
});

test("o K/D evita divisão por zero conforme a convenção do jogo", () => {
  assert.equal(campaignKdRatio(5, 0), 5);
  assert.equal(campaignKdRatio(0, 0), 0);
  assert.equal(campaignKdRatio(6, 2), 3);
});

test("uma tentativa por etapa; replay do mesmo resultado não avança duas vezes", () => {
  const active = start(1, "idempotent-ring");
  const group = resolveCampaignRing({
    matchId: "idempotent-ring",
    day: 1,
    finishReason: "LAST_SURVIVOR",
    participants: roster(100, [{ id: 1, health: 100 }]),
  });
  const first = applyCampaignResolution(active, group.results[0]);
  const replay = applyCampaignResolution(first.progress, group.results[0]);
  assert.equal(first.replayed, false);
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.progress, first.progress);
  assert.equal(first.progress.day, 2);
  assert.throws(() => startCampaignAttempt(active, "another-ring"), /CAMPAIGN_ATTEMPT_NOT_AVAILABLE/);
});

test("a campanha abre janelas de 12 horas por dia em blocos UTC de 24 horas", () => {
  const openAtStart = campaignWindowAt(NOW, NOW);
  assert.equal(openAtStart.open, true);
  assert.equal(openAtStart.day, 1);
  const openAtEnd = campaignWindowAt(NOW, NOW + 12 * 60 * 60 * 1000 - 1);
  assert.equal(openAtEnd.open, true);
  const closed = campaignWindowAt(NOW, NOW + 12 * 60 * 60 * 1000);
  assert.equal(closed.open, false);
  assert.equal(closed.day, 1);
  const nextDay = campaignWindowAt(NOW, NOW + 24 * 60 * 60 * 1000);
  assert.equal(nextDay.day, 2);
  assert.equal(nextDay.open, true);
});

test("proteção de Ring aceita 12/24/36/72h e acumula sem encurtar uma proteção ativa", () => {
  assert.equal(extendRingProtection(null, 12, NOW), NOW + 12 * 60 * 60 * 1000);
  assert.equal(extendRingProtection(NOW + 6 * 60 * 60 * 1000, 24, NOW), NOW + 30 * 60 * 60 * 1000);
  assert.equal(extendRingProtection(NOW - 1, 72, NOW), NOW + 72 * 60 * 60 * 1000);
  assert.throws(() => extendRingProtection(null, 48, NOW), /INVALID_RING_PROTECTION_DURATION/);
});

test("valida o tamanho obrigatório do Ring, métricas e IDs duplicados", () => {
  assert.throws(() => resolveCampaignRing({ matchId: "small", day: 1, finishReason: "TIME_LIMIT", participants: roster(99) }), /CAMPAIGN_RING_REQUIRES_100_PARTICIPANTS/);
  const duplicate = roster();
  duplicate[1].playerId = duplicate[0].playerId;
  assert.throws(() => resolveCampaignRing({ matchId: "dup", day: 1, finishReason: "TIME_LIMIT", participants: duplicate }), /DUPLICATE_CAMPAIGN_PLAYER/);
  const invalidHealth = roster(100, [{ id: 1, health: 0 }]);
  assert.throws(() => resolveCampaignRing({ matchId: "bad-hp", day: 1, finishReason: "TIME_LIMIT", participants: invalidHealth }), /ALIVE_PLAYER_MUST_HAVE_POSITIVE_HP/);
});
