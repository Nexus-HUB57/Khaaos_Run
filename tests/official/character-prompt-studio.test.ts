import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  KHAAOS_OPERATIVE_ARCHETYPES,
  KHAAOS_MILITIA_ARCHETYPES,
  ALL_KHAAOS_OPERATIVE_ARCHETYPES,
  buildOperativePromptBundle,
  type OperativeFaction,
} from "../../shared/character-studio";

/**
 * Contrato do Character Prompt Studio (/studio) — o estúdio de prompts deve
 * expor o ROSTER COMPLETO (militares canônicos + Lote 4 milícias/gangues)
 * com filtro de facção funcional e cópia atualizada (sem resíduo
 * "UE5_Mannequin", eliminado no Lote 3 — ADR-ESQUELETO-RIG-POR-SEXO).
 *
 * A UI é validada como contrato estático (mesma escola dos demais testes
 * oficiais: leitura determinística dos arquivos-fonte) + matemática de
 * roster via import direto de shared/character-studio.ts.
 */

const COMPONENT_PATH = path.join(
  process.cwd(),
  "client/src/components/character-prompt-studio.tsx",
);
const PAGE_PATH = path.join(process.cwd(), "client/src/pages/studio.tsx");

function factionOf(op: { faction?: OperativeFaction }): OperativeFaction {
  return op.faction ?? "MILITAR";
}

function factionCounts(): Record<OperativeFaction, number> {
  const counts: Record<OperativeFaction, number> = {
    MILITAR: 0,
    MILICIA_URBANA: 0,
    GANGUE_URBANA: 0,
  };
  for (const op of ALL_KHAAOS_OPERATIVE_ARCHETYPES) {
    counts[factionOf(op)] += 1;
  }
  return counts;
}

test("studio: componente consome o roster combinado (32) e não o militar isolado", () => {
  const src = readFileSync(COMPONENT_PATH, "utf8");
  assert.ok(
    src.includes("ALL_KHAAOS_OPERATIVE_ARCHETYPES"),
    "component deve importar ALL_KHAAOS_OPERATIVE_ARCHETYPES (roster completo)",
  );
  // Qualquer uso do roster militar isolado no componente é resíduo do Lote 2.
  const bareUsage = src.match(/(?<!ALL_)KHAAOS_OPERATIVE_ARCHETYPES/);
  assert.equal(
    bareUsage,
    null,
    "component não pode filtrar KHAAOS_OPERATIVE_ARCHETYPES isolado (usar o roster combinado)",
  );
  assert.ok(
    src.includes("type OperativeFaction"),
    "component deve importar o tipo OperativeFaction para o filtro de facção",
  );
});

test("studio: filtro de facção completo (TODAS + MILITAR + MILÍCIA + GANGUE) com data-testids", () => {
  const src = readFileSync(COMPONENT_PATH, "utf8");
  for (const testid of [
    "filter-faction-all",
    "filter-faction-militar",
    "filter-faction-milicia",
    "filter-faction-gangue",
  ]) {
    assert.ok(
      src.includes(`data-testid="${testid}"`),
      `data-testid ausente no estúdio: ${testid}`,
    );
  }
  assert.ok(
    src.includes('setFactionFilter("MILICIA_URBANA")'),
    "filtro deve selecionar a facção MILICIA_URBANA",
  );
  assert.ok(
    src.includes('setFactionFilter("GANGUE_URBANA")'),
    "filtro deve selecionar a facção GANGUE_URBANA",
  );
  // Chips de facção nos cards do grid.
  assert.ok(src.includes("MILÍCIA"), "chip MILÍCIA ausente nos cards");
  assert.ok(src.includes("GANGUE"), "chip GANGUE ausente nos cards");
});

test("studio: cópia sem resíduo UE5_Mannequin e com rigs Lyra por sexo", () => {
  const component = readFileSync(COMPONENT_PATH, "utf8");
  const page = readFileSync(PAGE_PATH, "utf8");
  assert.equal(
    component.includes("UE5_Mannequin"),
    false,
    "cópia do estúdio ainda exporta para UE5_Mannequin (resíduo eliminado no Lote 3)",
  );
  assert.ok(
    component.includes("SK_Manny") && component.includes("SK_Gwen"),
    "cópia deve apontar os rigs canônicos SK_Manny/SK_Gwen (ADR-ESQUELETO-RIG-POR-SEXO)",
  );
  assert.ok(
    page.includes("32 operativos"),
    "wrapper da página /studio deve descrever o roster completo (32 operativos)",
  );
});

test("studio: matemática do roster — 32 operativos, 16M/16F, facções 16/8/8, bundles para todos", () => {
  assert.equal(ALL_KHAAOS_OPERATIVE_ARCHETYPES.length, 32);
  assert.equal(KHAAOS_OPERATIVE_ARCHETYPES.length, 16, "16 militares canônicos intactos");
  assert.equal(KHAAOS_MILITIA_ARCHETYPES.length, 16, "16 não-militares do Lote 4 intactos");
  assert.equal(
    ALL_KHAAOS_OPERATIVE_ARCHETYPES.filter((op) => op.gender === "MASCULINO").length,
    16,
    "16 masculinos",
  );
  assert.equal(
    ALL_KHAAOS_OPERATIVE_ARCHETYPES.filter((op) => op.gender === "FEMININO").length,
    16,
    "16 femininos",
  );
  const counts = factionCounts();
  assert.deepEqual(counts, { MILITAR: 16, MILICIA_URBANA: 8, GANGUE_URBANA: 8 });
  // IDs exibidos no estúdio são os mesmos da whitelist de seleção (catálogo 33
  // = 32 arquétipos + TALON suplementar), então todo card clicável é selecionável.
  for (const op of ALL_KHAAOS_OPERATIVE_ARCHETYPES) {
    const bundle = buildOperativePromptBundle({
      archetypeId: op.id,
      worldId: op.defaultWorldId,
      framing: "PORTRAIT_35MM",
      skinRarity: op.skinRarity,
      includeBiomechanicalClause: true,
    });
    assert.equal(bundle.operative.id, op.id, `bundle válido para ${op.id}`);
  }
});
