/**
 * F47 — Paridade de fidelidade entre `shared/worlds.ts` (contrato E2E) e
 * `game-runtime/src/game3d/scenarios.js` (runtime canônico F42/F44).
 *
 * Hoje o portão F44 (fidelity-audit-lib.mjs) só audita o runtime contra o
 * README — `shared/worlds.ts` ficou de fora e DRIFTOU silenciosamente para
 * o layout pré-F42 (Pulso Khaaos no CIGKV virou SAFE_TRAINING, lava continuou
 * no Ckesalth, etc.). Este teste fecha o buraco: qualquer divergência de
 * hazard/biome/mapLabel entre o contrato E2E e o runtime vira falha vermelha.
 *
 * Anatomia: para cada WorldId, valida que
 *   1. `KHAAOS_WORLDS[id].hazard.type` == `SCENARIOS[scenarioKey].survival.type`
 *      (ou `undefined` para Barburhen — chuva ácida é id-gated no sim3d)
 *   2. `KHAAOS_WORLDS[id].configRevision` está pinned em `f42-2026-11-02`
 *   3. `KHAAOS_WORLDS[id].biome` contém keyword canônica do README daquele mundo
 *   4. `KHAAOS_WORLDS[id].subtitle` contém o nome canônico do README
 *   5. Campos F42 específicos (sporeTopY/smokeTopY/submergeBelowY/gravityScale)
 *      batem com o runtime
 *   6. Nenhum `hazard.type` é `VOLCANIC_LAVA` ou `SAFE_TRAINING` (não-cânon F42)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { KHAAOS_WORLDS, WORLD_OPERATIONAL_IDS, type WorldId } from "../../shared/worlds.ts";
import { SCENARIOS } from "../../game-runtime/src/game3d/scenarios.js";

const SCENARIO_KEY: Record<WorldId, keyof typeof SCENARIOS> = {
  CIGKV: "CIGKV",
  Barburhen: "BARBURHEN",
  Priadus: "PRIADUS",
  Ckesalth: "CKESALTH",
  Arukheea: "ARUKHEEA",
};

/**
 * Cânon F42 — qual hazard.type cada mundo DEVE ter em `shared/worlds.ts`.
 * - Para 4 dos 5 mundos, o hazard é materializado no runtime como
 *   `SCENARIOS[scenarioKey].survival.type`.
 * - Para Barburhen, a chuva ácida é id-gated no sim3d (`acidTimer` + gate
 *   `Barburhen`) — o cenário runtime tem `survival: undefined`, mas o contrato
 *   E2E ainda declara o hazard conceitual `ACID_RAIN` (contrato F42
 *   `DYNAMICS_CONTRACT.W1.type = 'ACID_RAIN_SIM'`).
 */
const EXPECTED_HAZARD: Record<WorldId, string> = {
  CIGKV: "KHAOS_GRAVITY",
  Barburhen: "ACID_RAIN",
  Priadus: "SPORE_FOG",
  Ckesalth: "TOXIC_SMOKE",
  Arukheea: "TSUNAMI_WAVE",
};

/** Worlds onde o hazard é materializado como `survival` no runtime (Barburhen é exceção). */
const RUNTIME_SURVIVAL_WORLDS: ReadonlySet<WorldId> = new Set(["CIGKV", "Priadus", "Ckesalth", "Arukheea"]);

/** Cânon F42 — fields extras pinados por mundo. */
const EXPECTED_F42_FIELDS: Record<WorldId, Record<string, number>> = {
  CIGKV: { gravityScale: 0.35, anchorRadius: 28 },
  Barburhen: {},
  Priadus: { sporeTopY: 90 },
  Ckesalth: { smokeTopY: 180 },
  Arukheea: { submergeBelowY: 90 },
};

/** Keyword canônica do README que DEVE aparecer no biome. */
const BIOME_KEYWORD: Record<WorldId, RegExp> = {
  CIGKV: /Vila Militar Murada/i,
  Barburhen: /Urbano P(ó|o)s-Guerra/i,
  Priadus: /(Selva Densa|P(â|a)ntanos|Flora Carn(í|i)vora|Neblina)/i,
  Ckesalth: /(Deserto|( Petr(ó|o)leo|Fuma(ç|c)a T(ó|o)xica|Areia Movedi(ç|c)a))/i,
  Arukheea: /(Ilha Isolada|Pris(ã|a)o do Sol da Noite|Tsunami|Tubar(õ|o)es)/i,
};

/** Nome canônico do README que DEVE aparecer no subtitle. */
const SUBTITLE_KEYWORD: Record<WorldId, RegExp> = {
  CIGKV: /Khaaos Ville/i,
  Barburhen: /Mundo da Destrui(ç|c)(ã|a)o/i,
  Priadus: /Floresta da Escurid(ã|a)o/i,
  Ckesalth: /Deserto das Almas Esquecidas/i,
  Arukheea: /Ilha dos Gritos Calados/i,
};

test("F47 — paridade de hazard.type: shared/worlds.ts ↔ runtime scenarios.js", () => {
  for (const id of Object.keys(KHAAOS_WORLDS) as WorldId[]) {
    const world = KHAAOS_WORLDS[id];
    const scenario = SCENARIOS[SCENARIO_KEY[id]];
    const expected = EXPECTED_HAZARD[id];
    const actual = world.hazard.type;

    assert.equal(
      actual,
      expected,
      `${id}: shared/worlds.ts hazard.type = "${actual}", esperado "${expected}" (cânon F42)`,
    );

    if (RUNTIME_SURVIVAL_WORLDS.has(id)) {
      const runtimeActual = scenario.survival?.type;
      assert.equal(
        runtimeActual,
        expected,
        `${id}: runtime scenarios.js survival.type = "${runtimeActual}", esperado "${expected}"`,
      );
    } else {
      // Barburhen: chuva ácida é id-gated no sim3d, não no survival do cenário
      assert.equal(
        scenario.survival,
        undefined,
        `${id}: cenário canônico NÃO tem survival (chuva ácida id-gated no sim3d via acidTimer + gate Barburhen)`,
      );
    }
  }
});

test("F47 — nenhum hazard.type é VOLCANIC_LAVA ou SAFE_TRAINING (não-cânon F42)", () => {
  for (const id of Object.keys(KHAAOS_WORLDS) as WorldId[]) {
    const type = KHAAOS_WORLDS[id].hazard.type;
    assert.notEqual(type, "VOLCANIC_LAVA", `${id}: VOLCANIC_LAVA foi removido em F42 (não-cânon do README)`);
    assert.notEqual(type, "SAFE_TRAINING", `${id}: SAFE_TRAINING foi substituído por KHAOS_GRAVITY (Pulso Khaaos) em F42`);
  }
});

test("F47 — configRevision pinned em f42-2026-11-02 (contrato da arquitetura §4)", () => {
  for (const id of Object.keys(KHAAOS_WORLDS) as WorldId[]) {
    assert.equal(
      KHAAOS_WORLDS[id].configRevision,
      "f42-2026-11-02",
      `${id}: configRevision deve estar pinned em "f42-2026-11-02" (migração F42)`,
    );
  }
});

test("F47 — biome contém keyword canônica do README", () => {
  for (const id of Object.keys(KHAAOS_WORLDS) as WorldId[]) {
    const biome = KHAAOS_WORLDS[id].biome;
    assert.ok(
      BIOME_KEYWORD[id].test(biome),
      `${id}: biome "${biome}" não contém keyword canônica do README (${BIOME_KEYWORD[id]})`,
    );
  }
});

test("F47 — subtitle contém nome canônico do README", () => {
  for (const id of Object.keys(KHAAOS_WORLDS) as WorldId[]) {
    const subtitle = KHAAOS_WORLDS[id].subtitle;
    assert.ok(
      SUBTITLE_KEYWORD[id].test(subtitle),
      `${id}: subtitle "${subtitle}" não contém nome canônico do README (${SUBTITLE_KEYWORD[id]})`,
    );
  }
});

test("F47 — campos F42 específicos (sporeTopY/smokeTopY/submergeBelowY/gravityScale) batem com o runtime", () => {
  for (const id of Object.keys(KHAAOS_WORLDS) as WorldId[]) {
    const world = KHAAOS_WORLDS[id];
    const scenario = SCENARIOS[SCENARIO_KEY[id]];
    const expectedFields = EXPECTED_F42_FIELDS[id];

    for (const [field, expectedValue] of Object.entries(expectedFields)) {
      const worldValue = (world.hazard as Record<string, unknown>)[field];
      assert.equal(
        worldValue,
        expectedValue,
        `${id}: hazard.${field} = ${worldValue}, esperado ${expectedValue}`,
      );

      const runtimeValue = (scenario.survival as Record<string, unknown> | undefined)?.[field];
      assert.equal(
        runtimeValue,
        expectedValue,
        `${id}: runtime survival.${field} = ${runtimeValue}, esperado ${expectedValue}`,
      );
    }
  }
});

test("F47 — multiplicadores de KRC e XP do runtime batem com o catálogo compartilhado", () => {
  for (const id of Object.keys(KHAAOS_WORLDS) as WorldId[]) {
    const world = KHAAOS_WORLDS[id];
    const scenario = SCENARIOS[SCENARIO_KEY[id]] as typeof SCENARIOS[keyof typeof SCENARIOS] & {
      krcMultiplier?: number;
      xpMultiplier?: number;
    };

    assert.equal(
      scenario.krcMultiplier,
      world.krcMultiplier,
      `${id}: runtime krcMultiplier deve seguir shared/worlds.ts`,
    );
    assert.equal(
      scenario.xpMultiplier,
      world.xpMultiplier,
      `${id}: runtime xpMultiplier deve seguir shared/worlds.ts`,
    );
  }
});

test("F47 — CIGKV KHAOS_GRAVITY tem 4 âncoras canônicas (NEXUS/NORTH/EAST/WEST)", () => {
  const cigkv = KHAAOS_WORLDS.CIGKV.hazard;
  assert.ok(Array.isArray(cigkv.anchors), "CIGKV: hazard.anchors deve ser array");
  assert.equal(cigkv.anchors!.length, 4, "CIGKV: 4 âncoras canônicas");

  const anchorIds = cigkv.anchors!.map((a) => a.id).sort();
  assert.deepEqual(
    anchorIds,
    ["EAST", "NEXUS", "NORTH", "WEST"],
    "CIGKV: âncoras canônicas NEXUS/NORTH/EAST/WEST",
  );

  // Paridade nomes/coords com o runtime
  const runtime = SCENARIOS.CIGKV.survival as { anchors?: Array<{ id: string; name: string; x: number; z: number }> };
  assert.ok(runtime.anchors, "CIGKV runtime: survival.anchors existe");
  assert.equal(runtime.anchors!.length, 4, "CIGKV runtime: 4 âncoras");

  for (const expected of cigkv.anchors!) {
    const rt = runtime.anchors!.find((a) => a.id === expected.id);
    assert.ok(rt, `CIGKV runtime: âncora ${expected.id} existe`);
    assert.equal(rt!.name, expected.name, `CIGKV âncora ${expected.id}: name paridade`);
    assert.equal(rt!.x, expected.x, `CIGKV âncora ${expected.id}: x paridade`);
    assert.equal(rt!.z, expected.z, `CIGKV âncora ${expected.id}: z paridade`);
  }
});

test("F47 — operationalId (W1..W4) consistente entre KHAAOS_WORLDS order e SCENARIOS", () => {
  for (const id of Object.keys(KHAAOS_WORLDS) as WorldId[]) {
    const operational = WORLD_OPERATIONAL_IDS[id];
    const scenario = SCENARIOS[SCENARIO_KEY[id]];
    // CIGKV é CIGKV nos dois lados; W1-W4 batem com shortLabel do runtime
    if (id === "CIGKV") {
      assert.equal(operational, "CIGKV");
      assert.equal(scenario.id, "CIGKV");
    } else {
      // runtime shortLabel tem "BARBURHEN / W1", "PRIADUS / W2", etc.
      assert.ok(
        scenario.shortLabel.includes(operational),
        `${id}: runtime shortLabel "${scenario.shortLabel}" deve conter operationalId "${operational}"`,
      );
    }
  }
});
