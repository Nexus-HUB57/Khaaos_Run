/**
 * Contrato do mapeamento Lyra ↔ rigs canônicos (follow-up 1 do
 * ADR-ESQUELETO-RIG-POR-SEXO).
 *
 * Garante que epic_integration/lyra_mapping.json aponta os DOIS rigs base por
 * sexo (SK_Manny/SK_Gwen) e que as camadas de espécie batem com o runtime UE5
 * (KhaaosSpeciesMeshRegistry.cpp) e com o preview rig dos SPCs — as três fontes
 * que o ADR reconciliou não podem voltar a divergir.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const REPO = path.resolve(import.meta.dirname, "../..");

const mapping = JSON.parse(
  readFileSync(path.join(REPO, "epic_integration/lyra_mapping.json"), "utf-8")
) as {
  integration_points: { name: string; bridge: string; module: string }[];
  skeleton_rigs: {
    adr: string;
    rigs: { id: string; sex: string; derived_from: string; lod_levels: number }[];
    species_layers: {
      species: string;
      preview_rig: string;
      mesh_lod_prefix: string;
      anim_bp: string;
      physics_asset: string;
    }[];
  };
};

const SPC_DIR = path.join(REPO, "components_dev/avatars");
const REGISTRY_CPP = path.join(
  REPO,
  "Unreal/KhaaosRun/Source/KhaaosRun/Game/Character/KhaaosSpeciesMeshRegistry.cpp"
);

test("lyra_mapping aponta exatamente os dois rigs canônicos do ADR", () => {
  assert.equal(
    mapping.skeleton_rigs.adr,
    "docs/ADR-ESQUELETO-RIG-POR-SEXO.md",
    "mapping cita o ADR"
  );
  const rigs = mapping.skeleton_rigs.rigs;
  assert.equal(rigs.length, 2, "dois rigs, não seis esqueletos por espécie");
  assert.deepEqual(
    rigs.map((r) => r.id).sort(),
    ["SK_Gwen", "SK_Manny"]
  );
  const manny = rigs.find((r) => r.id === "SK_Manny")!;
  const gwen = rigs.find((r) => r.id === "SK_Gwen")!;
  assert.equal(manny.sex, "masculino");
  assert.equal(gwen.sex, "feminino");
  assert.ok(manny.derived_from.includes("SKM_Manny"), "SK_Manny herda do mannequin UE5");
  assert.ok(gwen.derived_from.includes("SKM_Quinn"), "SK_Gwen herda do mannequin UE5");
  assert.equal(manny.lod_levels, 4);
  assert.equal(gwen.lod_levels, 4);
});

test("camadas de espécie cobrem as 6 espécies com preview rig = SPC physical.skeleton", () => {
  const layers = mapping.skeleton_rigs.species_layers;
  assert.equal(layers.length, 6, "6 espécies canônicas");
  const species = layers.map((l) => l.species).sort();
  assert.deepEqual(species, ["Huran", "Khael", "Onith", "Skeetw", "Venex", "Zheers"]);

  for (const layer of layers) {
    const spcPath = path.join(SPC_DIR, `SPC_${layer.species}.json`);
    const spc = JSON.parse(readFileSync(spcPath, "utf-8")) as {
      physical: { skeleton: string };
    };
    assert.equal(
      layer.preview_rig,
      spc.physical.skeleton,
      `preview rig de ${layer.species} diverge do SPC`
    );
    assert.equal(
      layer.mesh_lod_prefix,
      `/Game/Characters/${layer.species}/Mesh/SK_${layer.species}_LOD`,
      `prefixo de mesh de ${layer.species} fora do padrão do registry`
    );
  }
});

test("anim_bp do mapping bate 1:1 com KhaaosSpeciesMeshRegistry.cpp (runtime é a verdade)", () => {
  const cpp = readFileSync(REGISTRY_CPP, "utf-8");
  const runtimeAbps = new Map<string, string>();
  const re = /\/Game\/Characters\/(\w+)\/Anim\/(ABP_\w+)\./g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cpp)) !== null) {
    runtimeAbps.set(m[1], m[2]);
  }
  assert.equal(runtimeAbps.size, 6, "registry tem 6 ABPs canônicos");

  for (const layer of mapping.skeleton_rigs.species_layers) {
    const runtime = runtimeAbps.get(layer.species);
    assert.ok(runtime, `sem ABP no registry para ${layer.species}`);
    assert.equal(
      layer.anim_bp,
      `/Game/Characters/${layer.species}/Anim/${runtime}.${runtime}`,
      `ABP de ${layer.species} diverge entre mapping e runtime UE5`
    );
  }
});

test("physics_asset do mapping bate 1:1 com KhaaosSpeciesMeshRegistry.cpp", () => {
  const cpp = readFileSync(REGISTRY_CPP, "utf-8");
  const runtimePas = new Map<string, string>();
  const re = /\/Game\/Characters\/(\w+)\/Physics\/(PA_\w+)\./g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cpp)) !== null) {
    runtimePas.set(m[1], m[2]);
  }
  assert.equal(runtimePas.size, 6, "registry tem 6 PhysicsAssets canônicos");

  for (const layer of mapping.skeleton_rigs.species_layers) {
    const runtime = runtimePas.get(layer.species);
    assert.ok(runtime, `sem PhysicsAsset no registry para ${layer.species}`);
    assert.equal(
      layer.physics_asset,
      `/Game/Characters/${layer.species}/Physics/${runtime}.${runtime}`,
      `PhysicsAsset de ${layer.species} diverge entre mapping e runtime UE5`
    );
  }
});

test("integration_points do Lyra continuam intactos (8 bridges)", () => {
  assert.equal(mapping.integration_points.length, 8);
  const names = mapping.integration_points.map((p) => p.name);
  assert.ok(names.includes("HeroComponent"), "KhaaosLyraHeroComponent é o ponto central");
  assert.ok(names.includes("EOSBridge"));
});
