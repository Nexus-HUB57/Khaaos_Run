import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Contrato do catálogo de espécies (components_dev/avatars/SPC_*.json).
 *
 * Fontes canônicas de stats numéricos:
 *   - data_tables_csv/DT_SpeciesStats.csv  (DataTable importada no UE5)
 *   - components_dev/avatars/avatars_manifest.json (manifest v2.0)
 * As duas concordam entre si; os SPC_*.json (design PhD) devem refleti-las.
 */

type AnyRecord = Record<string, any>;

const SPECIES_IDS = [
  "SPC_Zheers",
  "SPC_Onith",
  "SPC_Skeetw",
  "SPC_Huran",
  "SPC_Venex",
  "SPC_Khael",
] as const;

const RARITY_LADDER = ["COMUM", "RARO", "EPICO", "LENDARIO", "MITICO"];
const VFX_KEYS = ["passive_indicator", "ability_1", "ability_2", "ultimate", "death", "spawn"];
const FOOTSTEP_SURFACES = ["metal", "dirt", "concrete", "water"];
const VOICE_LINES = ["eliminate", "eliminated", "revive", "ultimate"];

function loadSpecies(id: string): AnyRecord {
  const file = path.resolve(`components_dev/avatars/${id}.json`);
  return JSON.parse(readFileSync(file, "utf8"));
}

function loadCsvSpeciesStats(): Map<string, AnyRecord> {
  const raw = readFileSync(path.resolve("data_tables_csv/DT_SpeciesStats.csv"), "utf8");
  const lines = raw.trim().split(/\r?\n/);
  const header = lines[0].split(",");
  const rows = new Map<string, AnyRecord>();
  for (const line of lines.slice(1)) {
    const cells = line.split(",");
    const row: AnyRecord = {};
    header.forEach((key, i) => {
      row[key.trim()] = cells[i]?.trim() ?? "";
    });
    rows.set(row.SpeciesID, row);
  }
  return rows;
}

function loadManifestSpecies(): AnyRecord[] {
  const manifest = JSON.parse(
    readFileSync(path.resolve("components_dev/avatars/avatars_manifest.json"), "utf8"),
  );
  return manifest.species ?? manifest.avatars ?? [];
}

function loadWorldIds(): Set<string> {
  const manifest = JSON.parse(
    readFileSync(path.resolve("components_dev/worlds/worlds_manifest.json"), "utf8"),
  );
  return new Set((manifest.worlds ?? []).map((w: AnyRecord) => w.id));
}

test("Catálogo de Espécies: 6 SPC completos no schema PhD (lore, stats, curvas, passive, 3 habilidades, 5 skins, animações, áudio, VFX)", () => {
  const validWorlds = loadWorldIds();

  for (const id of SPECIES_IDS) {
    const spc = loadSpecies(id);

    // Identidade e nomenclatura
    assert.equal(spc.id, id, `${id}: campo id deve bater com o nome do arquivo`);
    assert.ok(spc.codename.endsWith("_PHD"), `${id}: codename deve seguir padrão *_PHD`);
    assert.equal(spc.species_tag, `Species.${spc.name}`, `${id}: species_tag canônico`);
    assert.equal(spc.meta.design_tier, "PhD", `${id}: tier de design PhD`);

    // Lore em 4 dimensões
    for (const key of ["origin", "culture", "motivation", "relationship_with_khaaos"]) {
      assert.ok(
        typeof spc.lore?.[key] === "string" && spc.lore[key].length > 40,
        `${id}: lore.${key} deve ter conteúdo substancial (>40 chars)`,
      );
    }

    // Base stats completos e plausíveis
    const bs = spc.base_stats;
    for (const key of [
      "health",
      "energy",
      "speed",
      "stamina",
      "armor_base",
      "shield_capacity",
      "regen_health_per_sec",
      "regen_energy_per_sec",
      "regen_stamina_per_sec",
      "crit_chance",
      "crit_multiplier",
    ]) {
      assert.equal(typeof bs[key], "number", `${id}: base_stats.${key} numérico`);
    }
    assert.ok(bs.health >= 70 && bs.health <= 130, `${id}: health plausível`);
    assert.ok(bs.energy >= 70 && bs.energy <= 160, `${id}: energy plausível`);
    assert.ok(bs.speed >= 0.8 && bs.speed <= 1.4, `${id}: speed plausível`);
    assert.ok(bs.crit_chance > 0 && bs.crit_chance < 0.2, `${id}: crit_chance plausível`);

    // Curvas de progressão ancoradas no base_stats (10 níveis)
    for (const [curve, baseKey] of [
      ["health_per_level", "health"],
      ["energy_per_level", "energy"],
      ["speed_per_level", "speed"],
    ] as const) {
      const values: number[] = spc.stat_curves[curve];
      assert.equal(values.length, 10, `${id}: ${curve} deve ter 10 níveis`);
      assert.equal(values[0], bs[baseKey], `${id}: ${curve}[0] deve ancorar em base_stats.${baseKey}`);
      for (let i = 1; i < values.length; i++) {
        assert.ok(values[i] > values[i - 1], `${id}: ${curve} deve ser crescente`);
      }
    }

    // Físico e animação
    assert.ok(spc.physical.height_cm >= 150 && spc.physical.height_cm <= 220, `${id}: altura plausível`);
    assert.ok(spc.physical.weight_kg >= 45 && spc.physical.weight_kg <= 130, `${id}: peso plausível`);
    assert.ok(spc.physical.morph_targets.length >= 3, `${id}: 3+ morph targets`);
    assert.ok(spc.physical.ik_settings.foot_ik_enabled, `${id}: foot IK habilitado`);
    assert.ok(spc.physical.clothing_physics.cloth_sim_enabled, `${id}: cloth sim habilitado`);
    assert.equal(
      spc.animations.base_skeleton,
      spc.physical.skeleton,
      `${id}: base_skeleton deve bater com physical.skeleton`,
    );
    assert.ok(spc.animations.blend_spaces.length >= 2, `${id}: 2+ blend spaces`);
    assert.ok(spc.animations.anim_sequences.length >= 23, `${id}: 23+ anim sequences`);
    const animNames = spc.animations.anim_sequences.map((a: AnyRecord) => a.name);
    assert.equal(new Set(animNames).size, animNames.length, `${id}: nomes de animação únicos`);
    for (const anim of spc.animations.anim_sequences) {
      assert.ok(anim.id.startsWith("ANM_"), `${id}: anim id ANM_*`);
      assert.ok(typeof anim.duration === "number" && anim.duration > 0, `${id}: anim com duração`);
      assert.equal(typeof anim.loop, "boolean", `${id}: anim com flag de loop`);
    }

    // Passive com mecânicas
    assert.ok(spc.passive.name.length > 3, `${id}: passive nomeado`);
    assert.ok(spc.passive.tag.startsWith("Ability.Passive.Species."), `${id}: passive tag GAS`);
    // Convenções de tag coexistem: design doc usa Ability.Active.<Espécie>.*;
    // Huran segue o header UE5 (Ability.Species.Huran.*). Ambas são GAS válidas.
    const gasActivePrefixes = [`Ability.Active.${spc.name}.`, `Ability.Species.${spc.name}.`];
    assert.ok(spc.passive.class.startsWith("KhaaosAbility_"), `${id}: passive classe UE5`);
    assert.ok(Array.isArray(spc.passive.mechanics) && spc.passive.mechanics.length >= 2, `${id}: 2+ mecânicas passivas`);

    // 3 habilidades ativas com VFX/SFX coerentes
    assert.equal(spc.active_abilities.length, 3, `${id}: 3 habilidades ativas`);
    const abilityTags = spc.active_abilities.map((a: AnyRecord) => a.tag);
    assert.equal(new Set(abilityTags).size, 3, `${id}: tags de habilidade únicas`);
    const vfxValues = new Set(Object.values(spc.vfx));
    for (const ability of spc.active_abilities) {
      assert.ok(
        gasActivePrefixes.some((prefix) => ability.tag.startsWith(prefix)),
        `${id}: ability tag GAS (${gasActivePrefixes.join(" | ")})`,
      );
      assert.ok(ability.cooldown > 0, `${id}: ability com cooldown`);
      assert.ok(ability.energy_cost > 0, `${id}: ability com custo de energia`);
      assert.ok(ability.description.length > 10, `${id}: ability descrita`);
      assert.ok(vfxValues.has(ability.vfx), `${id}: ability vfx declarado na seção vfx`);
      assert.ok(ability.sfx.startsWith("SFX_"), `${id}: ability sfx SFX_*`);
    }

    // 5 skins na escada de raridade canônica
    assert.equal(spc.skins.length, 5, `${id}: 5 skins`);
    assert.deepEqual(
      spc.skins.map((s: AnyRecord) => s.rarity),
      RARITY_LADDER,
      `${id}: escada COMUM→MITICO em ordem`,
    );
    const skinIds = spc.skins.map((s: AnyRecord) => s.id);
    assert.equal(new Set(skinIds).size, 5, `${id}: ids de skin únicos`);
    for (const skin of spc.skins) {
      assert.ok(skin.id.startsWith(`SKN_${spc.name}_`), `${id}: skin id SKN_${spc.name}_*`);
      assert.ok(skin.color_primary.startsWith("#"), `${id}: skin com cor primária hex`);
      assert.ok(skin.unlock_rank.length > 3, `${id}: skin com rank de desbloqueio`);
    }

    // Áudio por superfície + vozes + emitter ambiente
    assert.deepEqual(
      Object.keys(spc.audio.footstep_surfaces).sort(),
      [...FOOTSTEP_SURFACES].sort(),
      `${id}: passos em 4 superfícies`,
    );
    assert.deepEqual(
      Object.keys(spc.audio.voice_lines).sort(),
      [...VOICE_LINES].sort(),
      `${id}: 4 voice lines canônicas`,
    );
    assert.ok(spc.audio.ambient_emitter.startsWith("SFX_"), `${id}: emitter ambiente`);

    // Seção VFX completa
    assert.deepEqual(Object.keys(spc.vfx).sort(), [...VFX_KEYS].sort(), `${id}: 6 slots de VFX`);

    // Mundos disponíveis válidos
    assert.equal(spc.available_worlds.length, 5, `${id}: disponível nos 5 mundos`);
    for (const world of spc.available_worlds) {
      assert.ok(validWorlds.has(world), `${id}: mundo ${world} existe no manifest`);
    }
  }
});

test("Catálogo de Espécies: paridade numérica SPC ↔ DT_SpeciesStats.csv ↔ avatars_manifest.json", () => {
  const csvStats = loadCsvSpeciesStats();
  const manifest = loadManifestSpecies();
  const manifestById = new Map(manifest.map((m: AnyRecord) => [m.id, m]));

  assert.equal(csvStats.size, 6, "CSV cobre as 6 espécies");
  assert.equal(manifest.length, 6, "Manifest cobre as 6 espécies");

  for (const id of SPECIES_IDS) {
    const spc = loadSpecies(id);
    const csvRow = csvStats.get(id);
    assert.ok(csvRow, `CSV contém ${id}`);

    assert.equal(spc.base_stats.health, Number(csvRow!.Health), `${id}: health SPC=CSV`);
    assert.equal(spc.base_stats.energy, Number(csvRow!.Energy), `${id}: energy SPC=CSV`);
    assert.equal(spc.base_stats.speed, Number(csvRow!.Speed), `${id}: speed SPC=CSV`);
    assert.equal(spc.base_stats.stamina, Number(csvRow!.Stamina), `${id}: stamina SPC=CSV`);
    assert.equal(spc.base_stats.armor_base, Number(csvRow!.ArmorBase), `${id}: armor_base SPC=CSV`);

    const mRow = manifestById.get(id);
    assert.ok(mRow, `Manifest contém ${id}`);
    assert.equal(spc.base_stats.health, mRow.hp, `${id}: health SPC=Manifest`);
    assert.equal(mRow.type, spc.type, `${id}: tipo SPC=Manifest`);
    assert.equal(
      mRow.passive,
      csvRow!.PassiveTag.replace(/_/g, " "),
      `${id}: passive do Manifest é a tag humanizada do CSV`,
    );
  }
});

test("Catálogo de Espécies: kit UE5 do Huran espelha KhaaosAbility_HuranAbilities.h (8 habilidades)", () => {
  const huran = loadSpecies("SPC_Huran");
  const kit = huran.ue5_kit;
  assert.ok(kit, "SPC_Huran declara ue5_kit");
  assert.ok(kit.header.includes("KhaaosAbility_HuranAbilities.h"));
  assert.equal(kit.abilities.length, 8, "Kit UE5 canônico com 8 habilidades");

  const headerPath = path.resolve(
    "Unreal/KhaaosRun/Source/KhaaosRun/Game/AbilitySystem/Species/KhaaosAbility_HuranAbilities.h",
  );
  const header = readFileSync(headerPath, "utf8");

  const classMatches = [...header.matchAll(/class UKhaaosAbility_(\w+)/g)];

  const ultimates = kit.abilities.filter((a: AnyRecord) => a.is_ultimate);
  assert.equal(ultimates.length, 1, "Exatamente 1 ultimate no kit");
  assert.equal(ultimates[0].name, "TsunamiRage", "Ultimate canônico é TsunamiRage");
  assert.equal(
    huran.active_abilities[2].tag,
    ultimates[0].tag,
    "Slot 3 das habilidades ativas é o ultimate do kit UE5",
  );

  for (const ability of kit.abilities) {
    assert.ok(
      header.includes(ability.tag),
      `${ability.name}: GameplayTag ${ability.tag} no header`,
    );

    const start = classMatches.find((m) => m[1] === ability.name);
    assert.ok(start, `${ability.name}: classe UKhaaosAbility_${ability.name} no header`);
    const startIdx = start!.index!;
    const next = classMatches
      .filter((m) => m.index! > startIdx)
      .sort((a, b) => a.index! - b.index!)[0];
    const block = header.slice(startIdx, next?.index);

    const cooldown = Number(block.match(/Cooldown = ([\d.]+)f/)?.[1]);
    const energy = Number(block.match(/EnergyCost = ([\d.]+)f/)?.[1]);
    assert.equal(cooldown, ability.cooldown, `${ability.name}: cooldown header=JSON`);
    assert.equal(energy, ability.energy, `${ability.name}: energia header=JSON`);

    if (ability.damage > 0) {
      const damage = Number(block.match(/Damage = ([\d.]+)f/)?.[1]);
      assert.equal(damage, ability.damage, `${ability.name}: dano header=JSON`);
    } else {
      assert.ok(
        !/Damage = [\d.]+f/.test(block),
        `${ability.name}: sem dano => header não declara Damage`,
      );
    }
  }
});

test("Catálogo de Espécies: emote_catalog.json coerente (13 emotes, categorias canônicas, resumo batendo com a lista)", () => {
  const catalog: AnyRecord = JSON.parse(
    readFileSync(path.resolve("components_dev/avatars/emote_catalog.json"), "utf8"),
  );

  const emotes: AnyRecord[] = catalog.emotes;
  assert.equal(emotes.length, 13, "13 emotes no catálogo");
  assert.ok(catalog._meta.description.includes("13 emotes"), "meta descreve 13 emotes");
  assert.equal(catalog.summary.total_emotes, 13, "summary.total_emotes coerente");

  const ids = emotes.map((e) => e.id);
  assert.equal(new Set(ids).size, 13, "ids de emote únicos");

  const validCategories = new Set(catalog.categories ?? []);
  for (const emote of emotes) {
    assert.ok(validCategories.has(emote.category), `categoria ${emote.category} declarada`);
    assert.notEqual(emote.category, "ACAo", "typo ACAo banido");
    assert.ok(catalog.rarities.includes(emote.rarity), `raridade ${emote.rarity} canônica`);
    assert.ok(typeof emote.price_krc === "number", "preço em KRC numérico");
  }

  const byCategory: Record<string, number> = {};
  const byRarity: Record<string, number> = {};
  for (const emote of emotes) {
    byCategory[emote.category] = (byCategory[emote.category] ?? 0) + 1;
    byRarity[emote.rarity] = (byRarity[emote.rarity] ?? 0) + 1;
  }
  assert.deepEqual(catalog.summary.by_category, byCategory, "resumo por categoria bate com a lista");
  assert.deepEqual(catalog.summary.by_rarity, byRarity, "resumo por raridade bate com a lista");
});
