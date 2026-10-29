import assert from "node:assert/strict";
import test from "node:test";
import {
  KHAAOS_OPERATIVE_ARCHETYPES,
  buildOperativePromptBundle,
} from "../../shared/character-studio";
import { EP555_RANKS, SPECIALIZATION_IDS } from "../../shared/schema";
import { WORLD_ORDER } from "../../shared/worlds";

test("Character Studio: 16 Operativos canônicos (8 masculinos e 8 femininos) com etnias e raças", () => {
  assert.equal(KHAAOS_OPERATIVE_ARCHETYPES.length, 16, "Must contain exactly 16 operatives");

  const males = KHAAOS_OPERATIVE_ARCHETYPES.filter((op) => op.gender === "MASCULINO");
  const females = KHAAOS_OPERATIVE_ARCHETYPES.filter((op) => op.gender === "FEMININO");

  assert.equal(males.length, 8, "Must contain exactly 8 masculine operatives");
  assert.equal(females.length, 8, "Must contain exactly 8 feminine operatives");

  const validRanks = new Set(EP555_RANKS.map((r) => r.id));
  const validSpecs = new Set(SPECIALIZATION_IDS);
  const validWorlds = new Set(WORLD_ORDER);

  for (const op of KHAAOS_OPERATIVE_ARCHETYPES) {
    // Identity & Nomenclature
    assert.ok(op.id.startsWith("OP_"), `Operative ${op.id} must start with OP_`);
    assert.ok(op.ueAssetId.startsWith("CHR_"), `UE Asset ${op.ueAssetId} must start with CHR_`);
    assert.ok(op.codename.length > 2, `Codename must be non-empty`);
    assert.ok(op.fullName.includes("·"), `Full name must follow canon naming with dot separator`);

    // Military, GAS and Multi-World Parity
    assert.ok(validRanks.has(op.rank), `Invalid rank ${op.rank} for ${op.id}`);
    assert.ok(validSpecs.has(op.specializationId), `Invalid spec ${op.specializationId} for ${op.id}`);
    assert.ok(validWorlds.has(op.defaultWorldId), `Invalid world ${op.defaultWorldId} for ${op.id}`);

    // Diversity: Ethnicity, Heritage Lore & Visual Avatar Specs
    assert.ok(op.ethnicity.length > 5, `Operative ${op.id} must have a rich ethnicity descriptor`);
    assert.ok(op.heritageLore.length > 20, `Operative ${op.id} must have detailed heritage lore`);
    assert.ok(op.avatarVisual, `Operative ${op.id} must have avatarVisual specs`);
    assert.ok(op.avatarVisual?.skinToneHex.startsWith("#"), `Skin tone must be hex color`);
    assert.ok(op.avatarVisual?.eyeColorHex.startsWith("#"), `Eye color must be hex color`);
    assert.ok(op.avatarVisual?.hairStyle.length > 3, `Hair style must be defined`);

    // Biomechanics
    assert.ok(op.biomechanics.heightCm >= 160 && op.biomechanics.heightCm <= 200, `Height plausible`);
    assert.ok(op.biomechanics.massKg >= 50 && op.biomechanics.massKg <= 110, `Mass plausible`);
    assert.ok(op.biomechanics.sprintSpeedMps >= 6.0 && op.biomechanics.sprintSpeedMps <= 9.0);
    assert.equal(op.biomechanics.skeleton, "UE5_Mannequin");
    assert.equal(op.biomechanics.lyraHeroBridge, "KhaaosLyraHeroComponent");

    // Prompt Bundle Generation
    const bundle = buildOperativePromptBundle({
      archetypeId: op.id,
      worldId: op.defaultWorldId,
      framing: "PORTRAIT_35MM",
      skinRarity: op.skinRarity,
      includeBiomechanicalClause: true,
    });

    assert.equal(bundle.operative.id, op.id);
    assert.ok(bundle.imagePromptEn.includes(op.appearancePromptEn));
    assert.ok(bundle.imagePromptPt.includes(op.appearancePromptPt));
    assert.ok(bundle.videoPromptEn.toLowerCase().includes("single continuous tracking shot"));
    assert.equal(bundle.timelineKeyframes.length, 5, "Must have 5 timeline keyframes across 10s");
    assert.equal(bundle.ue5ManifestEntry.skeleton, "UE5_Mannequin");
  }
});

test("Character Studio: Diversidade étnica cobre Américas, África, Ásia, Europa, Oriente Médio e Oceania", () => {
  const ethnicities = KHAAOS_OPERATIVE_ARCHETYPES.map((op) => op.ethnicity);

  // Masculine ethnicities
  assert.ok(ethnicities.some((e) => e.includes("Afro-Latino")));
  assert.ok(ethnicities.some((e) => e.includes("Eslavo")));
  assert.ok(ethnicities.some((e) => e.includes("Japonês")));
  assert.ok(ethnicities.some((e) => e.includes("Africano Subsaariano")));
  assert.ok(ethnicities.some((e) => e.includes("Indígena Sul-Americano")));
  assert.ok(ethnicities.some((e) => e.includes("Árabe-Beduíno")));
  assert.ok(ethnicities.some((e) => e.includes("Polinésio")));
  assert.ok(ethnicities.some((e) => e.includes("Sul-Asiático")));

  // Feminine ethnicities
  assert.ok(ethnicities.some((e) => e.includes("Afro-Brasileira")));
  assert.ok(ethnicities.some((e) => e.includes("Latina Mestiza")));
  assert.ok(ethnicities.some((e) => e.includes("Chinesa")));
  assert.ok(ethnicities.some((e) => e.includes("Oeste-Africana")));
  assert.ok(ethnicities.some((e) => e.includes("Apinajé")));
  assert.ok(ethnicities.some((e) => e.includes("Escandinava")));
  assert.ok(ethnicities.some((e) => e.includes("Libanesa")));
  assert.ok(ethnicities.some((e) => e.includes("Dravidiana")));
});

test("Character Studio: 17 Arquivos SVG de Avatares gerados e sincronizados (Content/Avatars & client/public/avatars)", async () => {
  const fs = await import("node:fs");
  const path = await import("node:path");

  const contentCatalogPath = path.resolve("Content/Avatars/avatar_catalog.json");
  const publicCatalogPath = path.resolve("client/public/avatars/avatar_catalog.json");

  assert.ok(fs.existsSync(contentCatalogPath), "Content avatar_catalog.json must exist");
  assert.ok(fs.existsSync(publicCatalogPath), "Public avatar_catalog.json must exist");

  const catalog = JSON.parse(fs.readFileSync(contentCatalogPath, "utf8"));
  // Fase 26 — 16 canônicos + TALON (Hacker & Urban Runner) = 17 no catálogo;
  // 9 masculinos (Talon entra como M-09) e 8 femininos.
  assert.equal(catalog.length, 17, "Catalog must list 17 operatives");

  const males = catalog.filter((c: any) => c.gender === "MASCULINO");
  const females = catalog.filter((c: any) => c.gender === "FEMININO");
  assert.equal(males.length, 9, "9 masculine avatars in catalog (incl. Talon M-09)");
  assert.equal(females.length, 8, "8 feminine avatars in catalog");

  for (const item of catalog) {
    const contentSvgPath = path.resolve(item.svgPathContent);
    const publicSvgPath = path.resolve(`client/public${item.svgPathPublic}`);

    assert.ok(fs.existsSync(contentSvgPath), `SVG file exists at ${item.svgPathContent}`);
    assert.ok(fs.existsSync(publicSvgPath), `SVG file exists at client/public${item.svgPathPublic}`);

    const svgContent = fs.readFileSync(contentSvgPath, "utf8");
    assert.ok(svgContent.includes("<svg"), "Valid SVG root element");
    assert.ok(svgContent.includes("viewBox=\"0 0 512 512\""), "512x512 tactical viewport");
    assert.ok(svgContent.includes(item.codename), "SVG includes codename watermark");
    assert.ok(svgContent.length > 1000, "SVG has rich vector content (>1000 bytes)");
  }

  // Asset Manifest parity
  const manifestPath = path.resolve("Content/Assets/asset_manifest.json");
  assert.ok(fs.existsSync(manifestPath), "Content/Assets/asset_manifest.json must exist");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  assert.ok(manifest.characters && manifest.characters.length >= 17, "Manifest includes all 16 operatives plus base");

  for (const op of KHAAOS_OPERATIVE_ARCHETYPES) {
    const entry = manifest.characters.find((c: any) => c.id === op.ueAssetId);
    assert.ok(entry, `Manifest contains character entry for ${op.ueAssetId}`);
    assert.equal(entry.gender, op.gender);
    assert.ok(entry.avatar_svg && fs.existsSync(path.resolve(entry.avatar_svg)), `Manifest avatar_svg points to valid file for ${op.ueAssetId}`);
  }
});
