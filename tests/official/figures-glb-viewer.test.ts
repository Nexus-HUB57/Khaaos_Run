/**
 * Contrato do viewer 3D das figuras de alistamento (lote 3).
 *
 * Garante que o parser client/src/lib/glb.ts lê os GLB reais publicados em
 * client/public/figures/glb/ e que o enquadramento do viewer (bbox aterrissada,
 * altura plausível) bate com o manifest do exportador. Substituir o placeholder
 * por scan/retopo real com os mesmos nomes de asset não pode quebrar este teste
 * sem atualizar o manifest + o parser em conjunto.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const REPO = path.resolve(import.meta.dirname, "../..");
const GLB_DIR = path.join(REPO, "client/public/figures/glb");

const { parseFigureGlb, figureGlbSrc } = await import("../../client/src/lib/glb.ts");

interface ManifestFigure {
  id: string;
  file: string;
  bytes: number;
  sha256: string;
  vertices: number;
  triangles: number;
  height_m: number;
  bbox_m: { x: number; y: number; z: number };
  palette: { skin: string; suit: string; accent: string };
}

const manifest = JSON.parse(
  readFileSync(path.join(GLB_DIR, "figures_glb_manifest.json"), "utf-8")
) as {
  manifest_version: string;
  figures: ManifestFigure[];
};

test("manifest das figuras GLB cobre as 6 figuras de alistamento", () => {
  assert.equal(manifest.manifest_version, "1.0.0");
  assert.equal(manifest.figures.length, 6, "esperadas as 6 figuras (3M + 3F)");
  const ids = manifest.figures.map((f) => f.id).sort();
  assert.deepEqual(ids, ["hald", "kane", "okada", "okonkwo", "puri", "voss"].sort());
});

test("figureGlbSrc aponta o mesmo nome de asset do manifest (substituição de asset não quebra viewer)", () => {
  for (const fig of manifest.figures) {
    assert.equal(
      path.basename(figureGlbSrc(fig.id)),
      fig.file,
      `viewer e manifest divergem para ${fig.id}`
    );
  }
});

for (const fig of manifest.figures) {
  test(`parser GLB lê ${fig.file} com paridade ao manifest`, () => {
    const bytes = readFileSync(path.join(GLB_DIR, fig.file));
    const glb = parseFigureGlb(bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength
    ));

    assert.ok(glb.meta.generator.includes("Khaaos Run"), "generator canônico");
    assert.equal(glb.meta.vertexCount, fig.vertices, `vértices de ${fig.id}`);
    assert.equal(glb.meta.triangleCount, fig.triangles, `triângulos de ${fig.id}`);
    assert.equal(glb.indices.length, fig.triangles * 3, "3 índices por triângulo");

    // bbox do accessor POSITION ↔ manifest (altura plausível e aterrissada)
    const height = glb.max[1] - glb.min[1];
    assert.ok(
      Math.abs(height - fig.height_m) < 0.01,
      `altura de ${fig.id}: parser ${height.toFixed(3)} vs manifest ${fig.height_m}`
    );
    assert.ok(Math.abs(glb.min[1]) < 0.01, `${fig.id} aterrissado em y=0 (min=${glb.min[1]})`);
    assert.ok(
      Math.abs(glb.max[1] - glb.min[1] - fig.bbox_m.y) < 0.01,
      `bbox_m.y de ${fig.id} é a altura Y`
    );

    // cores por vértice presentes (paleta da ficha) e índices válidos
    assert.equal(glb.colors.length, glb.meta.vertexCount * 4, "COLOR_0 rgba por vértice");
    assert.equal(glb.normals.length, glb.meta.vertexCount * 3, "NORMAL por vértice");
    for (let i = 0; i < glb.indices.length; i++) {
      assert.ok(glb.indices[i] < glb.meta.vertexCount, "índice dentro do range");
    }

    // alpha sempre 1 (exportador grava RGBA opaco)
    for (let i = 3; i < glb.colors.length; i += 4) {
      assert.equal(glb.colors[i], 1, `alpha opaco no vértice ${(i - 3) / 4}`);
    }
  });
}

test("parser GLB rejeita arquivos não-GLB com erro explícito (nunca silencioso)", () => {
  const fake = new ArrayBuffer(64);
  const view = new DataView(fake);
  view.setUint32(0, 0xdeadbeef, true); // magic inválido
  assert.throws(() => parseFigureGlb(fake), /magic bytes inválidos/);
  assert.throws(() => parseFigureGlb(new ArrayBuffer(8)), /muito curto/);
});
