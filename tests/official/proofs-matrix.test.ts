import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/**
 * Contrato da matriz de proofs sexo×espécie (components_dev/avatars/proofs/).
 *
 * Garante que o roster de operatives cobre as 6 espécies × 2 sexos (12 cruzamentos)
 * e que os dados derivados de espécie em cada proof batem com a fonte canônica
 * `data_tables_csv/DT_SpeciesStats.csv` (mesma regra dos SPC_*.json).
 *
 * Matriz fechada em 2026-11-02: PROOF_M-09..M-11 (Skeetw/Huran/Khael) e
 * PROOF_F-11..F-13 (Zheers/Onith/Venex).
 */

type AnyRecord = Record<string, any>;

const PROOFS_DIR = "components_dev/avatars/proofs";
const SPECIES_IDS = ["Zheers", "Onith", "Skeetw", "Huran", "Venex", "Khael"] as const;
const SKELETONS: Record<string, string> = {
  Zheers: "SK_Manny",
  Onith: "SK_Manny",
  Venex: "SK_Manny",
  Skeetw: "SK_Gwen",
  Huran: "SK_Gwen",
  Khael: "SK_Gwen",
};
const ABBRS: Record<string, string> = {
  Zheers: "ZHR",
  Onith: "ONI",
  Venex: "VNX",
  Skeetw: "SKW",
  Huran: "HUR",
  Khael: "KHL",
};
const WORLDS: Record<string, { name: string; capacity: number }> = {
  W1: { name: "Barburhen", capacity: 100 },
  W2: { name: "Priadus", capacity: 100 },
  W3: { name: "Ckesalth", capacity: 100 },
  W4: { name: "Arukheea", capacity: 100 },
};
const RANK_LADDER = ["RECRUTA", "VENEX", "ONITH", "HURAN"];

function loadProofs(): AnyRecord[] {
  const files = readdirSync(PROOFS_DIR)
    .filter((f) => /^PROOF_[MF]-\d+\.json$/.test(f))
    .sort();
  return files.map((f) =>
    JSON.parse(readFileSync(path.resolve(PROOFS_DIR, f), "utf8")),
  );
}

function loadManifest(): AnyRecord {
  return JSON.parse(
    readFileSync(path.resolve(PROOFS_DIR, "proofs_manifest.json"), "utf8"),
  );
}

function loadCsvSpeciesStats(): Map<string, AnyRecord> {
  const raw = readFileSync(
    path.resolve("data_tables_csv/DT_SpeciesStats.csv"),
    "utf8",
  );
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

test("proofs: matriz sexo×espécie fechada (6 espécies × 2 sexos)", () => {
  const proofs = loadProofs();
  assert.equal(proofs.length, 24, "esperava 24 proofs (18 originais + 6 novos)");

  for (const species of SPECIES_IDS) {
    const male = proofs.find(
      (p) => p.species?.name === species && p.gender === "MASCULINO",
    );
    const female = proofs.find(
      (p) => p.species?.name === species && p.gender === "FEMININO",
    );
    assert.ok(male, `${species} sem proof MASCULINO`);
    assert.ok(female, `${species} sem proof FEMININO`);
  }

  const men = proofs.filter((p) => p.gender === "MASCULINO");
  const women = proofs.filter((p) => p.gender === "FEMININO");
  assert.equal(men.length, 11);
  assert.equal(women.length, 13);
});

test("proofs: manifest consistente com os arquivos (counts + cobertura)", () => {
  const proofs = loadProofs();
  const manifest = loadManifest();

  assert.equal(manifest.proof_count, proofs.length);
  assert.equal(manifest.proofs.length, proofs.length);

  const genders = { MASCULINO: 0, FEMININO: 0 } as Record<string, number>;
  const coverage = new Map<string, number>();
  for (const p of proofs) {
    genders[p.gender] = (genders[p.gender] ?? 0) + 1;
    coverage.set(p.species.name, (coverage.get(p.species.name) ?? 0) + 1);
  }
  assert.equal(manifest.operatives_by_gender.masculino, genders.MASCULINO);
  assert.equal(manifest.operatives_by_gender.feminino, genders.FEMININO);
  for (const species of SPECIES_IDS) {
    assert.equal(
      manifest.species_coverage[species],
      coverage.get(species),
      `cobertura de ${species} divergente no manifest`,
    );
  }

  // todos os proofs do manifest apontam para arquivos que existem com o mesmo id
  for (const entry of manifest.proofs as AnyRecord[]) {
    const file = JSON.parse(
      readFileSync(path.resolve(PROOFS_DIR, entry.file), "utf8"),
    );
    assert.equal(file.proof_id, entry.proof_id);
    assert.equal(file.codename, entry.codename);
    assert.equal(file.gender, entry.gender);
  }
});

test("proofs: stats de espécie ancorados no DT_SpeciesStats.csv", () => {
  const csv = loadCsvSpeciesStats();
  for (const p of loadProofs()) {
    const species = p.species;
    const row = csv.get(species.id);
    assert.ok(row, `${species.id} ausente no CSV canônico`);
    assert.equal(
      species.base_stats.health,
      Number(row.Health),
      `${p.proof_id}: health divergente do CSV`,
    );
    assert.equal(
      species.base_stats.energy,
      Number(row.Energy),
      `${p.proof_id}: energy divergente do CSV`,
    );
    assert.equal(
      species.base_stats.speed,
      Number(row.Speed),
      `${p.proof_id}: speed divergente do CSV`,
    );
    assert.equal(species.skeleton, SKELETONS[species.name], `${p.proof_id}: esqueleto`);
    assert.equal(species.abbr, ABBRS[species.name], `${p.proof_id}: abreviação`);
  }
});

test("proofs: refs únicas, mundos canônicos e hierarquia de ranks", () => {
  const seenIds = new Set<string>();
  const seenOperativeIds = new Set<string>();
  const seenCodenames = new Set<string>();

  for (const p of loadProofs()) {
    assert.ok(!seenIds.has(p.proof_id), `proof_id duplicado: ${p.proof_id}`);
    assert.ok(
      !seenOperativeIds.has(p.operative_id),
      `operative_id duplicado: ${p.operative_id}`,
    );
    assert.ok(!seenCodenames.has(p.codename), `codename duplicado: ${p.codename}`);
    seenIds.add(p.proof_id);
    seenOperativeIds.add(p.operative_id);
    seenCodenames.add(p.codename);

    const abbr = ABBRS[p.species.name];
    const letter = p.gender === "MASCULINO" ? "M" : "F";
    const refRe = new RegExp(`^OP_${abbr}_${letter}_\\d{2}$`);
    const avtRe = new RegExp(`^AVT_${abbr}_${letter}_\\d{2}$`);
    assert.equal(p.ref_code, p.codename);
    assert.match(p.operative_ref, refRe);
    assert.match(p.avatar_ref, avtRe);
    assert.ok(
      ["MASCULINO", "FEMININO"].includes(p.gender),
      `gênero inválido em ${p.proof_id}`,
    );
    assert.ok(RANK_LADDER.includes(p.rank), `rank inválido em ${p.proof_id}`);

    const world = WORLDS[p.world.id];
    assert.ok(world, `mundo inválido em ${p.proof_id}`);
    assert.equal(p.world.name, world.name);
    assert.equal(p.world.capacity, world.capacity);

    // campos obrigatórios do dossiê
    for (const key of [
      "ethnicity",
      "phenotype",
      "cultural_markers",
      "species_traits",
      "distinguishing_summary",
      "generated_at",
    ]) {
      assert.ok(p[key], `${p.proof_id}: campo obrigatório ausente: ${key}`);
    }
    assert.ok(
      p.distinguishing_summary.length >= 40,
      `${p.proof_id}: resumo distintivo muito curto`,
    );
  }
});
