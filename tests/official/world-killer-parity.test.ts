/**
 * Gate de paridade da ATRIBUIÇÃO de mortes do MUNDO (Wart B) entre as pontas:
 *
 *   1. servidor raiz (MatchFlow) — killerId nulo = morte do mundo, rotulada
 *      por worldKillerLabel (@shared/worldKillers) no feed do espectador;
 *   2. game-runtime 3D (main3d.js) — botKill com kind 'quantum' → 'ANOMALIA'
 *      (mesma gramática do rótulo do servidor);
 *   3. GameServices — o endpoint /kill aceita killerId ausente (não descarta).
 *
 * Antes: processKill rejeitava killerId ausente (`if (!killer) return`) e a
 * morte por anomalia BYPASSAVA o killfeed inteiro; o caminho offline rotulava
 * TUDO como 'RING'. Qualquer regressão desses pontos quebra este teste ANTES
 * de divergir em runtime (mesma doutrina do dbno-parity.test.ts).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const REPO = path.resolve(import.meta.dirname, "../..");

const read = (rel: string): string =>
  readFileSync(path.join(REPO, rel), "utf-8");

const WORLD_KILLERS_PATH = "shared/worldKillers.ts";
const MATCHFLOW_PATH = "server/game/MatchFlow.ts";
const GAMESERVICES_PATH = "server/game/GameServices.ts";
const MAIN3D_PATH = "game-runtime/src/game3d/main3d.js";
const SIM3D_PATH = "game-runtime/src/game3d/sim3d.js";

test("wart-b: contrato compartilhado (@shared/worldKillers) carrega os rótulos canônicos", async () => {
  const src = read(WORLD_KILLERS_PATH);
  // os 6 kinds reais do runtime (HAZARD_DAMAGE_KINDS: tsunami/spore/smoke/ring/acid/quantum)
  for (const kind of ["quantum", "ring", "acid", "tsunami", "spore", "smoke"]) {
    assert.match(src, new RegExp(`${kind}:\\s*"`), `rótulo do kind '${kind}' presente`);
  }
  // importável — o mapa é a fonte única dos rótulos
  const mod = await import("../../shared/worldKillers.ts");
  assert.equal(mod.worldKillerLabel("quantum"), "ANOMALIA");
  assert.equal(mod.worldKillerLabel("ring"), "ANEL");
  assert.equal(mod.worldKillerLabel("inexistente"), "MUNDO");
  assert.equal(mod.worldKillerLabel(null), "MUNDO");
  // mapa congelado — nenhuma superfície muta o contrato
  assert.equal(Object.isFrozen(mod.WORLD_KILLER_LABELS), true);
});

test("wart-b: MatchFlow aceita killer nulo e rotula a fonte no feed do espectador", () => {
  const src = read(MATCHFLOW_PATH);
  // assinatura tolera morte do mundo (não descarta mais com `if (!killer) return`)
  assert.match(src, /processKill\(killerId:\s*string\s*\|\s*null/);
  // importa a fonte única dos rótulos
  assert.match(src, /import\s*\{\s*worldKillerLabel\s*\}\s*from\s*"@shared\/worldKillers"/);
  // o feed nomeia a fonte real quando killerId é nulo (DOWN e ELIMINATED)
  const occurrences = src.match(/d\.killerId \? nameOf\(d\.killerId\) : worldKillerLabel\(d\.weapon\)/g) ?? [];
  assert.ok(occurrences.length >= 2, `PLAYER_DOWNED e PLAYER_ELIMINATED rotulam o mundo (achados: ${occurrences.length})`);
  // eliminação preserva killerId nulo no log (sem coerção p/ string)
  assert.match(src, /logEvent\("PLAYER_ELIMINATED",\s*\{\s*killerId:\s*killerId \?\? null/);
});

test("wart-b: endpoint /kill do GameServices repassa killerId ausente como null", () => {
  const src = read(GAMESERVICES_PATH);
  assert.match(src, /processKill\(killerId \?\? null/);
});

test("wart-b: main3d (offline) rotula a anomalia — morte por quantum não é 'RING'", () => {
  const src = read(MAIN3D_PATH);
  assert.match(src, /e\.kind === 'quantum' \? 'ANOMALIA' : 'RING'/);
});

test("wart-b: sim3d emite a fonte letal no botKill da anomalia (kind 'quantum' chega ao HUD)", () => {
  const src = read(SIM3D_PATH);
  // a anomalia finaliza com a fonte explícita (dono nulo + kind)
  assert.match(src, /#finalizeDeath\(actor,\s*null,\s*'quantum'\)/);
  // e o botKill carrega o kind até o consumidor
  assert.match(src, /emit\('botKill',\s*\{\s*target:\s*a\.name,\s*kind\s*\}\)/);
});
