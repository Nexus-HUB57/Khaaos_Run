import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { EP555_RANKS, EP555_SPECIALIZATIONS } from "../../shared/schema";
import {
  EP555_HIERARCHY_TIERS,
  EP555_SPECIALIZATION_DOCTRINES,
  WORLD_HIERARCHY_DAG,
  SUBMUNDO_KR_AUTHORITY_HIERARCHY,
  UE5_GAME_HIERARCHY_TREE,
  computeEp555MatchReward,
  evaluateOperativeHierarchyProfile,
  getFullGameHierarchyOverview,
} from "../../shared/game-hierarchy";

test("Eixo I: 8 escalões EP555 coincidem entre schema.ts, DefaultGame.ini e KhaaosPlayerState", () => {
  assert.equal(EP555_HIERARCHY_TIERS.length, 8);
  const cpp = readFileSync(
    new URL("../../Unreal/KhaaosRun/Source/KhaaosRun/Player/KhaaosPlayerState.cpp", import.meta.url),
    "utf8",
  );
  const ini = readFileSync(
    new URL("../../Unreal/KhaaosRun/Source/KhaaosRun/Config/DefaultGame.ini", import.meta.url),
    "utf8",
  );

  for (let i = 0; i < EP555_RANKS.length; i += 1) {
    const rank = EP555_RANKS[i];
    const cppRankName = rank.id[0] + rank.id.slice(1).toLowerCase();
    assert.equal(EP555_HIERARCHY_TIERS[i].id, rank.id);
    assert.equal(EP555_HIERARCHY_TIERS[i].xpRequired, rank.xpRequired);
    assert.equal(EP555_HIERARCHY_TIERS[i].echelon, i + 1);
    assert.match(ini, new RegExp(`^${rank.id}=${rank.xpRequired}$`, "m"));
    assert.match(
      cpp,
      new RegExp(`\\{\\s*EPatenteRank::${cppRankName},\\s*${rank.xpRequired}\\s*\\}`),
    );
  }
});

test("Eixo II: 12 especializações EP555 permanecem sincronizadas entre schema.ts e o modelo TypeScript", () => {
  assert.equal(EP555_SPECIALIZATION_DOCTRINES.length, 12);

  for (let i = 0; i < EP555_SPECIALIZATIONS.length; i += 1) {
    const baseSpec = EP555_SPECIALIZATIONS[i];
    const doctrine = EP555_SPECIALIZATION_DOCTRINES[i];
    assert.equal(doctrine.id, baseSpec.id);
    assert.equal(doctrine.requiredRank, baseSpec.rank);
    assert.equal(doctrine.morthRequired, baseSpec.morthRequired);
  }
});

test("Eixo III: DAG dos 5 mundos soma perímetros 8/8 (1 inteiro), possui 3 variantes Zu e multiplicadores sincronizados", () => {
  assert.equal(WORLD_HIERARCHY_DAG.length, 5);
  assert.deepEqual(
    WORLD_HIERARCHY_DAG.map((w) => w.worldId),
    ["CIGKV", "Barburhen", "Priadus", "Ckesalth", "Arukheea"],
  );

  for (const world of WORLD_HIERARCHY_DAG) {
    const sumEighths = world.sectors.reduce((acc, s) => acc + s.fractionEighths, 0);
    assert.equal(sumEighths, 8, `Perímetro de ${world.worldId} deve somar 8/8`);
    assert.equal(world.zuProtocols.length, 3, `${world.worldId} deve ter 3 variantes de Zu`);
    assert.deepEqual(
      world.zuProtocols.map((z) => z.variantId),
      ["ZU1", "ZU2", "ZU3"],
    );
    assert.ok(world.dedoDuroAgent.triggerIdleSeconds > 0);
  }
});

test("Eixo IV & V: Submundo KR preserva executable: false para agentes ficcionais sob Policy Engine (1000)", () => {
  const serverNode = SUBMUNDO_KR_AUTHORITY_HIERARCHY.find((n) => n.id === "server-policy-engine");
  assert.ok(serverNode);
  assert.equal(serverNode.precedenceScore, 1000);
  assert.equal(serverNode.executableMutations, true);

  const fictionalAgents = SUBMUNDO_KR_AUTHORITY_HIERARCHY.filter(
    (n) => n.tier === "LEVEL_1_SPECIAL_CLASS_ORCHESTRATION",
  );
  assert.equal(fictionalAgents.length, 3);
  for (const agent of fictionalAgents) {
    assert.equal(agent.executableMutations, false, `${agent.canonicalName} não pode ter mutação executável`);
  }

  assert.equal(UE5_GAME_HIERARCHY_TREE.length, 5);
  const overview = getFullGameHierarchyOverview();
  assert.equal(overview.excoMilestoneTarget, 1_000_000);
  assert.equal(overview.zexBaseTransferRatePct, 20);
});

test("Simulador EP555 calcula XP Accur, Morth, Zu 1 (1000 KRC Bankhaoos), ZEX 20% e promoção determinística", () => {
  // CIGKV Zu 1 correto -> 0% dano + 1000 KRC Bankhaoos
  const cigkvSuccess = computeEp555MatchReward({
    worldId: "CIGKV",
    placement: 1,
    totalPlayers: 50,
    pvpKills: 5,
    zexExtractions: 2,
    zuVariant: "ZU1",
    zuActionChosen: "APERTAR_CINTO",
    currentXp: 14_000,
    currentMorth: 22,
    giantsChallengeTop50: true,
  });

  assert.equal(cigkvSuccess.zuEvaluation.correctDecision, true);
  assert.equal(cigkvSuccess.zuEvaluation.initialVitalityDamagePct, 0);
  assert.equal(cigkvSuccess.zuEvaluation.zuInitialBankhaoosKrc, 1000);
  assert.equal(cigkvSuccess.progressionDelta.rankBefore, "ZHEERS");
  assert.equal(cigkvSuccess.progressionDelta.rankAfter, "ONITH");
  assert.equal(cigkvSuccess.progressionDelta.promoted, true);
  assert.equal(cigkvSuccess.progressionDelta.morthAfter, 27);
  assert.ok(cigkvSuccess.progressionDelta.newlyUnlockedSpecializations.includes("INFANTARIA"));
  assert.equal(cigkvSuccess.krcBreakdown.veteranTokenAwarded, true);

  // Zu incorreto -> 30% de dano de vitalidade
  const barburhenFailZu = computeEp555MatchReward({
    worldId: "Barburhen",
    placement: 10,
    totalPlayers: 100,
    pvpKills: 2,
    zexExtractions: 0,
    zuVariant: "ZU2",
    zuActionChosen: "APERTAR_CINTO", // errado para ZU2 (esperado SALTAR_AGORA)
    currentXp: 0,
    currentMorth: 0,
  });

  assert.equal(barburhenFailZu.zuEvaluation.correctDecision, false);
  assert.equal(barburhenFailZu.zuEvaluation.initialVitalityDamagePct, 30);
  assert.equal(barburhenFailZu.krcBreakdown.zexTransferable20PctKrc, 0);

  const profileEval = evaluateOperativeHierarchyProfile({
    xp: 500_000,
    morth: 520,
    specializationId: "PARAQUEDISTAS",
  });
  assert.equal(profileEval.currentTier.id, "KHAEL");
  assert.equal(profileEval.activeSpecialization?.callsign, "Raio");
  assert.equal(profileEval.unlockedSpecializations.length, 10);
});
