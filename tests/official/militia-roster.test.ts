import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import {
  KHAAOS_OPERATIVE_ARCHETYPES,
  KHAAOS_MILITIA_ARCHETYPES,
  ALL_KHAAOS_OPERATIVE_ARCHETYPES,
  buildOperativePromptBundle,
  type OperativeArchetype,
} from "../../shared/character-studio";
import {
  OPERATIVE_AVATAR_OPTIONS,
  DEFAULT_OPERATIVE_AVATAR_ID,
  getOperativeAvatarOption,
  isOperativeAvatarId,
} from "../../shared/operative-avatar-catalog";
import { EP555_RANKS, SPECIALIZATION_IDS } from "../../shared/schema";
import { WORLD_ORDER } from "../../shared/worlds";

/**
 * Contrato do Lote 4 — Milícias e Gangues Urbanas (16 operantes não-militares).
 *
 * Garante que o lote complementa (sem alterar) os 16 militares canônicos:
 * 8 milicianos (MIL-01..08, facção MILICIA_URBANA) e 8 membros de gangues
 * urbanas (GNG-01..08, facção GANGUE_URBANA), com identidade completa
 * (studio), avatares SVG byte-idênticos, catálogo selecionável e paridade
 * no asset_manifest.json com rig base por sexo (ADR-ESQUELETO-RIG-POR-SEXO).
 */

type AnyRecord = Record<string, any>;

const MILITIA = KHAAOS_MILITIA_ARCHETYPES;
const MIL = MILITIA.filter((op) => op.faction === "MILICIA_URBANA");
const GNG = MILITIA.filter((op) => op.faction === "GANGUE_URBANA");

function skeletonByGender(op: OperativeArchetype): string {
  return op.gender === "MASCULINO" ? "SK_Manny" : "SK_Gwen";
}

test("Lote 4: 16 operantes não-militares (8 milicianos + 8 gangues, 8M/8F) sem tocar nos 16 militares", () => {
  assert.equal(KHAAOS_OPERATIVE_ARCHETYPES.length, 16, "roster militar canônico intacto (16)");
  assert.equal(MILITIA.length, 16, "Lote 4 tem exatamente 16 operantes");
  assert.equal(MIL.length, 8, "8 milicianos");
  assert.equal(GNG.length, 8, "8 membros de gangues");
  assert.equal(MILITIA.filter((op) => op.gender === "MASCULINO").length, 8, "8 masculinos no lote");
  assert.equal(MILITIA.filter((op) => op.gender === "FEMININO").length, 8, "8 femininos no lote");
  assert.equal(ALL_KHAAOS_OPERATIVE_ARCHETYPES.length, 32, "roster combinado = 16 militares + 16 lote 4 (TALON vive fora dos arrays)");

  // facção obrigatória no lote e proibida de colidir com o militar
  for (const op of MILITIA) {
    assert.ok(
      op.faction === "MILICIA_URBANA" || op.faction === "GANGUE_URBANA",
      `${op.id}: facção do lote inválida`,
    );
  }
  for (const op of KHAAOS_OPERATIVE_ARCHETYPES) {
    assert.equal(op.faction, undefined, `${op.id}: militares canônicos não declaram faction`);
  }

  // IDs/codenames/ueAssetIds únicos em TODO o roster combinado
  const all = [...KHAAOS_OPERATIVE_ARCHETYPES, ...MILITIA];
  const ids = new Set<string>();
  const codenames = new Set<string>();
  const ueAssets = new Set<string>();
  for (const op of all) {
    assert.ok(!ids.has(op.id), `id duplicado: ${op.id}`);
    assert.ok(!codenames.has(op.codename), `codename duplicado: ${op.codename}`);
    assert.ok(!ueAssets.has(op.ueAssetId), `ueAssetId duplicado: ${op.ueAssetId}`);
    ids.add(op.id);
    codenames.add(op.codename);
    ueAssets.add(op.ueAssetId);
  }

  // prefixos e tag de facção
  const tagRe = /^(MIL|GNG)-\d{2}$/;
  for (const op of MILITIA) {
    const prefix = op.faction === "MILICIA_URBANA" ? "OP_MIL_" : "OP_GNG_";
    assert.ok(op.id.startsWith(prefix), `${op.id}: deve iniciar com ${prefix}`);
    const tag = op.fullName.match(/(MIL|GNG)-\d{2}$/)?.[0];
    assert.ok(tag && tagRe.test(tag), `${op.id}: tag de facção MIL-xx/GNG-xx ausente no fullName`);
    assert.ok(op.ueAssetId.startsWith("CHR_"), `${op.id}: ueAssetId no padrão CHR_`);
  }
});

test("Lote 4: identidade completa válida (rank/spec/mundo, biomaecânica, rig por sexo, prompt bundle)", () => {
  const validRanks = new Set(EP555_RANKS.map((r) => r.id));
  const validSpecs = new Set(SPECIALIZATION_IDS);
  const validWorlds = new Set(WORLD_ORDER);

  for (const op of MILITIA) {
    assert.ok(validRanks.has(op.rank), `rank inválido ${op.rank} em ${op.id}`);
    assert.ok(validSpecs.has(op.specializationId), `spec inválida em ${op.id}`);
    assert.ok(validWorlds.has(op.defaultWorldId), `mundo inválido em ${op.id}`);

    // identidade
    assert.ok(op.ethnicity.length > 5, `${op.id}: etnia rica`);
    assert.ok(op.heritageLore.length > 80, `${op.id}: lore de facção detalhada`);
    assert.ok(op.roleTitle.length > 10, `${op.id}: roleTitle definido`);
    assert.ok(["COMUM", "RARO", "EPICO", "LENDARIO", "MITICO"].includes(op.skinRarity), `${op.id}: raridade`);

    // visual
    assert.ok(op.avatarVisual.skinToneHex.startsWith("#"));
    assert.ok(op.avatarVisual.eyeColorHex.startsWith("#"));
    assert.ok(op.avatarVisual.hairColorHex.startsWith("#"));
    assert.ok(op.avatarVisual.hairStyle.length > 3);
    assert.ok(op.avatarVisual.headgearOrVisor.length > 3);
    assert.equal(op.avatarVisual.avatarThemeGradient.length, 2);
    assert.ok(op.accentColors.primaryHex.startsWith("#"));
    assert.ok(op.accentColors.secondaryHex.startsWith("#"));
    assert.ok(op.accentColors.trimHex.startsWith("#"));

    // biomaecânica plausível e rig por sexo (ADR-ESQUELETO-RIG-POR-SEXO)
    const b = op.biomechanics;
    assert.ok(b.heightCm >= 160 && b.heightCm <= 200, `${op.id}: altura plausível`);
    assert.ok(b.massKg >= 50 && b.massKg <= 110, `${op.id}: massa plausível`);
    assert.ok(b.sprintSpeedMps >= 6.0 && b.sprintSpeedMps <= 9.0, `${op.id}: sprint plausível`);
    assert.ok(b.slideFrictionCoeff > 0.5 && b.slideFrictionCoeff < 0.9, `${op.id}: atrito plausível`);
    assert.ok(b.vaultClearanceCm >= 90 && b.vaultClearanceCm <= 135, `${op.id}: vault plausível`);
    assert.equal(b.skeleton, skeletonByGender(op), `${op.id}: rig base por sexo`);
    assert.equal(b.lyraHeroBridge, "KhaaosLyraHeroComponent", `${op.id}: ponte Lyra canônica`);

    // prompt bundle gera para cada operante do lote
    const bundle = buildOperativePromptBundle({
      archetypeId: op.id,
      worldId: op.defaultWorldId,
      framing: "FULL_BODY_TACTICAL",
      skinRarity: op.skinRarity,
      includeBiomechanicalClause: true,
    });
    assert.equal(bundle.operative.id, op.id);
    assert.ok(bundle.imagePromptEn.includes(op.appearancePromptEn));
    assert.ok(bundle.imagePromptPt.includes(op.appearancePromptPt));
    assert.ok(bundle.ue5ManifestEntry.skeleton === skeletonByGender(op));
    assert.equal(bundle.timelineKeyframes.length, 5);
  }
});

test("Lote 4: catálogo selecionável com 33 identidades e branch de facção correto", () => {
  assert.equal(OPERATIVE_AVATAR_OPTIONS.length, 33, "33 opções (16 militares + TALON + 16 lote 4)");
  assert.equal(
    OPERATIVE_AVATAR_OPTIONS.filter((o) => o.branch === "MILITAR").length,
    17,
    "17 militares no catálogo (16 canônicos + TALON)",
  );
  assert.equal(
    OPERATIVE_AVATAR_OPTIONS.filter((o) => o.branch === "MILICIA_URBANA").length,
    8,
    "8 milicianos no catálogo",
  );
  assert.equal(
    OPERATIVE_AVATAR_OPTIONS.filter((o) => o.branch === "GANGUE_URBANA").length,
    8,
    "8 gangues no catálogo",
  );
  assert.equal(
    OPERATIVE_AVATAR_OPTIONS.filter((o) => o.canonical).length,
    32,
    "32 canônicos (TALON segue suplementar)",
  );

  // todos os 16 novos são selecionáveis com o caminho de arte correto
  for (const op of MILITIA) {
    const option = OPERATIVE_AVATAR_OPTIONS.find((o) => o.id === op.id);
    assert.ok(option, `${op.id} selecionável`);
    assert.equal(option.codename, op.codename);
    assert.equal(option.branch, op.faction);
    const folder = op.gender === "MASCULINO" ? "male" : "female";
    assert.equal(option.avatarPath, `/avatars/${folder}/${op.id.toLowerCase()}.svg`);
  }

  // whitelist da API absorve o lote e mantém o default
  assert.equal(DEFAULT_OPERATIVE_AVATAR_ID, "OP_MALE_VANGUARD", "default segue VANGUARD");
  for (const op of MILITIA) {
    assert.ok(isOperativeAvatarId(op.id), `whitelist aceita ${op.id}`);
    assert.equal(getOperativeAvatarOption(op.id).id, op.id);
  }
  assert.ok(!isOperativeAvatarId("OP_MIL_FAKE"));
  assert.ok(!isOperativeAvatarId("OP_GNG_FAKE"));
  assert.ok(!isOperativeAvatarId("__proto__"));
  assert.equal(getOperativeAvatarOption("OP_GNG_INEXISTENTE").id, DEFAULT_OPERATIVE_AVATAR_ID);
});

test("Lote 4: 16 SVGs byte-idênticos nas duas árvores com marca d'água do codinome", async () => {
  const fs = await import("node:fs");
  for (const op of MILITIA) {
    const folder = op.gender === "MASCULINO" ? "male" : "female";
    const fname = `${op.id.toLowerCase()}.svg`;
    const contentPath = path.resolve(`Content/Avatars/${folder}/${fname}`);
    const publicPath = path.resolve(`client/public/avatars/${folder}/${fname}`);

    assert.ok(fs.existsSync(contentPath), `${fname} existe em Content/Avatars`);
    assert.ok(fs.existsSync(publicPath), `${fname} existe em client/public/avatars`);
    const content = fs.readFileSync(contentPath, "utf8");
    assert.ok(
      fs.readFileSync(contentPath).equals(fs.readFileSync(publicPath)),
      `${fname}: cópias byte-idênticas`,
    );
    assert.ok(content.includes("<svg"), `${fname}: SVG válido`);
    assert.ok(content.includes('viewBox="0 0 512 512"'), `${fname}: viewport 512`);
    assert.ok(content.includes(op.codename), `${fname}: marca d'água do codinome`);
    assert.ok(content.length > 1000, `${fname}: conteúdo vetorial rico`);
    assert.ok(!content.includes("UE5_Mannequin"), `${fname}: sem placeholder de rig`);
  }
});

test("Lote 4: asset_manifest.json com 16 entradas novas, rig por sexo e sem UE5_Mannequin", () => {
  const manifestPath = path.resolve("Content/Assets/asset_manifest.json");
  assert.ok(existsSync(manifestPath));
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as AnyRecord;
  const characters = manifest.characters as AnyRecord[];

  for (const op of MILITIA) {
    const entry = characters.find((c) => c.id === op.ueAssetId);
    assert.ok(entry, `manifest contém ${op.ueAssetId}`);
    assert.equal(entry.gender, op.gender, `${op.ueAssetId}: gênero`);
    assert.equal(entry.skeleton, skeletonByGender(op), `${op.ueAssetId}: rig por sexo`);
    assert.equal(entry.type, "character");
    assert.equal(entry.status, "avatar_generated", `${op.ueAssetId}: avatar gerado`);
    assert.equal(entry.default_world, op.defaultWorldId, `${op.ueAssetId}: mundo`);
    assert.ok(
      entry.faction === "MILICIA_URBANA" || entry.faction === "GANGUE_URBANA",
      `${op.ueAssetId}: facção declarada no manifest`,
    );
    const svgPath = path.resolve(String(entry.avatar_svg));
    assert.ok(existsSync(svgPath), `${op.ueAssetId}: avatar_svg aponta para arquivo real`);

    // 4 mapas PBR canônicos
    for (const suffix of ["_D", "_N", "_ORM", "_E"]) {
      assert.ok(
        (entry.textures as string[]).includes(`T_${op.ueAssetId}${suffix}`),
        `${op.ueAssetId}: textura ${suffix}`,
      );
    }
    assert.ok((entry.components as string[]).includes("KhaaosLyraHeroComponent"));
  }

  assert.ok(
    !JSON.stringify(manifest).includes("UE5_Mannequin"),
    "nenhum resíduo de placeholder no manifest",
  );
});
