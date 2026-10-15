import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  canUnlockSpecialization,
  EP555_RANKS,
  EP555_SPECIALIZATIONS,
  getRankProgress,
  rankFromXp,
  RANK_XP_THRESHOLDS,
} from "../../shared/schema";

test("patentes EP555 usam os oito limites documentados e promovem no limite exato", () => {
  assert.deepEqual(
    EP555_RANKS.map(({ id, xpRequired }) => [id, xpRequired]),
    [
      ["ZHEERS", 0],
      ["ONITH", 15_000],
      ["SKEETW", 45_000],
      ["HURAN", 100_000],
      ["VENEX", 250_000],
      ["KHAEL", 500_000],
      ["MALAKOR", 1_000_000],
      ["OVERLORD", 5_000_000],
    ],
  );

  for (let index = 1; index < EP555_RANKS.length; index += 1) {
    const { id, xpRequired } = EP555_RANKS[index];
    assert.equal(rankFromXp(xpRequired - 1), EP555_RANKS[index - 1].id);
    assert.equal(rankFromXp(xpRequired), id);
    assert.equal(RANK_XP_THRESHOLDS[id], xpRequired);
  }
  assert.equal(rankFromXp(-100), "ZHEERS");
  assert.equal(rankFromXp(Number.NaN), "ZHEERS");
});

test("progresso mostra o intervalo atual e a distância até a próxima patente", () => {
  assert.deepEqual(getRankProgress(20_000), {
    rank: "ONITH",
    currentXp: 20_000,
    currentThreshold: 15_000,
    nextRank: "SKEETW",
    nextThreshold: 45_000,
    xpToNext: 25_000,
    progressPct: (5_000 / 30_000) * 100,
  });
  assert.equal(getRankProgress(5_000_000).nextRank, null);
  assert.equal(getRankProgress(5_000_000).progressPct, 100);
});

test("catálogo contém as 12 especializações e libera com patente + Morth", () => {
  assert.equal(EP555_SPECIALIZATIONS.length, 12);
  const infantry = EP555_SPECIALIZATIONS.find(({ id }) => id === "INFANTARIA");
  const pilot = EP555_SPECIALIZATIONS.find(({ id }) => id === "PILOTO_AERONAVES");
  assert.ok(infantry);
  assert.ok(pilot);
  assert.equal(canUnlockSpecialization(infantry, 0, 24), false);
  assert.equal(canUnlockSpecialization(infantry, 0, 25), true);
  assert.equal(canUnlockSpecialization(pilot, 14_999, 1_000), false);
  assert.equal(canUnlockSpecialization(pilot, 15_000, 100), true);
});

test("limites compartilhados coincidem com a configuração e o PlayerState UE5", () => {
  const ini = readFileSync(new URL("../../Unreal/KhaaosRun/Source/KhaaosRun/Config/DefaultGame.ini", import.meta.url), "utf8");
  const cpp = readFileSync(new URL("../../Unreal/KhaaosRun/Source/KhaaosRun/Player/KhaaosPlayerState.cpp", import.meta.url), "utf8");
  const rankSection = ini.match(/\[Khaaos\.RankXpThresholds\]([\s\S]*?)(?:\r?\n\[|$)/)?.[1];
  assert.ok(rankSection, "DefaultGame.ini precisa da seção de patentes");
  const iniThresholds = new Map<string, number>(
    [...rankSection.matchAll(/^([A-Z]+)=(\d+)$/gm)].map(([, rank, xp]) => [rank, Number(xp)] as const),
  );
  const cppRankNames: Record<string, string> = {
    Zheers: "ZHEERS",
    Onith: "ONITH",
    Skeetw: "SKEETW",
    Huran: "HURAN",
    Venex: "VENEX",
    Khael: "KHAEL",
    Malakor: "MALAKOR",
    Overlord: "OVERLORD",
  };
  const cppThresholds = new Map<string, number>(
    [...cpp.matchAll(/\{\s*EPatenteRank::(\w+),\s*(\d+)\s*\}/g)]
      .map(([, enumRank, xp]) => [cppRankNames[enumRank], Number(xp)] as const),
  );

  for (const { id, xpRequired } of EP555_RANKS) {
    assert.equal(iniThresholds.get(id), xpRequired, `INI ${id}`);
    assert.equal(cppThresholds.get(id), xpRequired, `UE5 PlayerState ${id}`);
  }
});
