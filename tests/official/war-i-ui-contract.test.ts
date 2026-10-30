import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { canUseItemOutsideMatch, getWarIUseKind, hasValidWarIDurability } from "../../shared/war-i.ts";

const battleHook = readFileSync(new URL("../../client/src/hooks/use-battle-room.ts", import.meta.url), "utf8");
const inventoryPage = readFileSync(new URL("../../client/src/pages/inventory.tsx", import.meta.url), "utf8");
const zonaPage = readFileSync(new URL("../../client/src/pages/zona.tsx", import.meta.url), "utf8");

test("UI só oferece uso legado fora do match para curativo com cura válida", () => {
  assert.equal(canUseItemOutsideMatch("CURATIVO", { heal: 25 }), true);
  assert.equal(canUseItemOutsideMatch("CURATIVO", { heal: 0 }), false);
  assert.equal(canUseItemOutsideMatch("CURATIVO", { speed: 20 }), false);
  assert.equal(canUseItemOutsideMatch("UTILIDADE", { damage: 30, radius: 5 }), false);
  assert.equal(canUseItemOutsideMatch("UTILIDADE", { vision: 20 }), false);
  assert.equal(canUseItemOutsideMatch("RECURSO", { heal: 20 }), false);
});

test("consumíveis de combate continuam classificados para a interface da Zona", () => {
  assert.equal(getWarIUseKind("CURATIVO", { heal: 25 }), "HEAL");
  assert.equal(getWarIUseKind("UTILIDADE", { damage: 30, radius: 5 }), "GRENADE");
  assert.equal(getWarIUseKind("UTILIDADE", { vision: 20 }), "RECON");
});

test("PackBack classifica corretamente itens aptos a entrar na batalha", () => {
  assert.equal(hasValidWarIDurability("75", "100"), true);
  assert.equal(hasValidWarIDurability(100, 100), true);
  assert.equal(hasValidWarIDurability("0", "100"), false);
  assert.equal(hasValidWarIDurability("120", "100"), false);
  assert.equal(hasValidWarIDurability("bad", "100"), false);
  assert.equal(hasValidWarIDurability("10", "0"), false);
});

test("War’I explica itens equipados sem durabilidade e distingue loadout congelado", () => {
  assert.match(inventoryPage, /PRONTOS PARA A BATALHA/);
  assert.match(inventoryPage, /não concedem bônus nesta partida/);
  assert.match(inventoryPage, /LOADOUT CONGELADO/);
});

test("PackBack bloqueia ações duplicadas e mostra confirmação até resposta do servidor", () => {
  assert.match(battleHook, /pendingPackbackItemIdRef\.current !== null/);
  assert.match(battleHook, /setLastError\("A PackBack não foi confirmada pelo servidor/);
  assert.match(zonaPage, /pendingPackbackItemId !== null\s*\|\|/);
  assert.match(zonaPage, /CONFIRMANDO AÇÃO NO SERVIDOR/);
  assert.match(zonaPage, /aria-busy=\{pending\}/);
});
