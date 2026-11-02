import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Contrato das malhas GLB das figuras de alistamento
 * (client/public/figures/glb/).
 *
 * Cada figura de `shared/figures.ts` tem um manequim GLB placeholder
 * (A-pose, cores por vértice) gerado por `scripts/figures/export_figures_glb.py`.
 * O teste garante: 6 arquivos válidos (glTF 2.0 binário), sha256 e contagens
 * batendo com o manifest, e ids alinhados com shared/figures.ts.
 */

type AnyRecord = Record<string, any>;

const GLB_DIR = "client/public/figures/glb";
const EXPECTED_IDS = ["hald", "kane", "okada", "okonkwo", "puri", "voss"];

function parseGlbHeader(blob: Buffer): { json: AnyRecord; binOffset: number } {
  const magic = blob.readUInt32LE(0);
  assert.equal(magic, 0x46546c67, "magic GLB ('glTF') ausente");
  assert.equal(blob.readUInt32LE(4), 2, "glTF version != 2");
  assert.equal(blob.readUInt32LE(8), blob.length, "tamanho total divergente");
  const jsonLen = blob.readUInt32LE(12);
  assert.equal(blob.readUInt32LE(16), 0x4e4f534a, "chunk JSON ausente");
  const json = JSON.parse(blob.slice(20, 20 + jsonLen).toString("utf8"));
  const binOffset = 20 + jsonLen;
  assert.equal(blob.readUInt32LE(binOffset + 4), 0x004e4942, "chunk BIN ausente");
  return { json, binOffset };
}

test("figuras GLB: 6 manequins válidos, um por figura de alistamento", () => {
  const files = readdirSync(GLB_DIR).filter((f) => f.endsWith(".glb")).sort();
  assert.deepEqual(
    files,
    EXPECTED_IDS.map((id) => `FIG_${id}.glb`),
    "conjunto de GLBs divergente das figuras canônicas",
  );
  for (const f of files) {
    const blob = readFileSync(path.resolve(GLB_DIR, f));
    assert.ok(blob.length > 1000, `${f}: arquivo suspeito de vazio`);
    const { json } = parseGlbHeader(blob);
    assert.equal(json.asset.version, "2.0");
    assert.equal(json.meshes.length, 1);
    const prim = json.meshes[0].primitives[0];
    assert.ok(prim.attributes.POSITION !== undefined);
    assert.ok(prim.attributes.NORMAL !== undefined);
    assert.ok(prim.attributes.COLOR_0 !== undefined, `${f}: COLOR_0 ausente`);
    const posAcc = json.accessors[prim.attributes.POSITION];
    assert.ok(posAcc.count >= 200, `${f}: poucos vértices`);
    // figura em pé, aterrissada no chão e plausível (1.5m–2.0m)
    assert.equal(posAcc.min[1], 0, `${f}: base deve estar em y=0`);
    const height = posAcc.max[1] - posAcc.min[1];
    assert.ok(height >= 1.5 && height <= 2.0, `${f}: altura ${height}m fora da faixa`);
  }
});

test("figuras GLB: manifest com sha256/contagens batendo com os arquivos", () => {
  const manifest: AnyRecord = JSON.parse(
    readFileSync(path.resolve(GLB_DIR, "figures_glb_manifest.json"), "utf8"),
  );
  assert.equal(manifest.manifest_version, "1.0.0");
  assert.equal(manifest.figures.length, 6);
  const ids = manifest.figures.map((f: AnyRecord) => f.id).sort();
  assert.deepEqual(ids, EXPECTED_IDS);
  for (const entry of manifest.figures as AnyRecord[]) {
    const blob = readFileSync(path.resolve(GLB_DIR, entry.file));
    assert.equal(
      entry.sha256,
      createHash("sha256").update(blob).digest("hex"),
      `${entry.file}: sha256 divergente do manifest`,
    );
    const { json } = parseGlbHeader(blob);
    const prim = json.meshes[0].primitives[0];
    assert.equal(entry.vertices, json.accessors[prim.attributes.POSITION].count);
    assert.equal(entry.triangles, json.accessors[prim.indices].count / 3);
    assert.equal(statSync(path.resolve(GLB_DIR, entry.file)).size, entry.bytes);
  }
});
