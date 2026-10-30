import assert from "node:assert/strict";
import { test } from "node:test";
import {
  canUseItem,
  getItemUseDenialReason,
  type ItemProgressionRule,
} from "../../server/game/itemProgression.ts";

const priadusRareItem: ItemProgressionRule = {
  minWorld: "Priadus",
  minRank: "VENEX",
};

test("permite no limite exato de mundo e patente", () => {
  assert.equal(canUseItem(priadusRareItem, "Priadus", "VENEX"), true);
});

test("permite progressão acima dos dois requisitos", () => {
  assert.equal(canUseItem(priadusRareItem, "Arukheea", "OVERLORD"), true);
});

test("bloqueia jogador em mundo anterior mesmo com patente suficiente", () => {
  assert.equal(canUseItem(priadusRareItem, "Barburhen", "OVERLORD"), false);
  assert.equal(
    getItemUseDenialReason(priadusRareItem, "Barburhen", "OVERLORD"),
    "ITEM_WORLD_REQUIREMENT_NOT_MET",
  );
});

test("bloqueia patente anterior mesmo em mundo suficiente", () => {
  assert.equal(canUseItem(priadusRareItem, "Arukheea", "HURAN"), false);
  assert.equal(
    getItemUseDenialReason(priadusRareItem, "Arukheea", "HURAN"),
    "ITEM_RANK_REQUIREMENT_NOT_MET",
  );
});

test("falha fechada para valores desconhecidos", () => {
  assert.equal(canUseItem(priadusRareItem, "W2", "VENEX"), false);
  assert.equal(canUseItem(priadusRareItem, "Priadus", "GENERAL"), false);
  assert.equal(
    getItemUseDenialReason(priadusRareItem, "W2", "VENEX"),
    "INVALID_PLAYER_WORLD",
  );
});
