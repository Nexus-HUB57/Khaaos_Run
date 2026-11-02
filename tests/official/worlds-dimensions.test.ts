// KHAAOS RUN — Contrato de Dimensões Canônicas dos Rings (oficial, sem DB)
// =========================================================================
// Fonte: README "Dimensões canônicas" (especificação do Descentralizador,
// PR #244) — tabela única dos 5 rings. Este teste impede que a tabela do
// código (shared/worlds.ts) derive do README: qualquer mudança de área,
// perímetro, densidade, bbox ou shape quebra aqui.
//
// Também valida o RNG do WorldMapPreview (FNV-1a + LCG): o MESMO seed de
// mundo produz a MESMA sequência — determinismo byte a byte é o contrato
// do preview canônico.

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CANONICAL_RING_SPEC,
  KHAAOS_WORLDS,
  WORLD_ORDER,
  validateWorldDimensions,
  type WorldRingDimensions,
} from "@shared/worlds";
import { createLcg, fnv1a, worldPreviewSeed } from "@shared/world-preview-rng";

// Tabela canônica do README (linha a linha — drift do README quebra aqui).
const README_CANONICAL: Array<{
  id: string;
  areaM2: number;
  bbox: { x: number; z: number };
  perimeterM: number;
  densityM2PerOperator: number;
  shape: WorldRingDimensions["shape"];
}> = [
  { id: "CIGKV", areaM2: 16_000, bbox: { x: 160, z: 100 }, perimeterM: 520, densityM2PerOperator: 160, shape: "fortified_rectangle" },
  { id: "Barburhen", areaM2: 19_000, bbox: { x: 190, z: 100 }, perimeterM: 580, densityM2PerOperator: 190, shape: "urban_gridiron" },
  { id: "Priadus", areaM2: 22_000, bbox: { x: 220, z: 100 }, perimeterM: 640, densityM2PerOperator: 220, shape: "organic_blob" },
  { id: "Ckesalth", areaM2: 25_000, bbox: { x: 250, z: 100 }, perimeterM: 700, densityM2PerOperator: 250, shape: "desert_basin" },
  { id: "Arukheea", areaM2: 18_000, bbox: { x: 180, z: 100 }, perimeterM: 560, densityM2PerOperator: 180, shape: "coastal_island" },
];

test("dimensões canônicas: todos os 5 mundos casam com a tabela do README", () => {
  assert.equal(WORLD_ORDER.length, 5);
  for (const expected of README_CANONICAL) {
    const world = KHAAOS_WORLDS[expected.id as keyof typeof KHAAOS_WORLDS];
    assert.ok(world, `mundo ${expected.id} ausente em KHAAOS_WORLDS`);
    const dims = world.dimensions;
    assert.equal(dims.areaM2, expected.areaM2, `${expected.id}: área canônica`);
    assert.equal(dims.bboxMeters.x, expected.bbox.x, `${expected.id}: bbox x`);
    assert.equal(dims.bboxMeters.z, expected.bbox.z, `${expected.id}: bbox z`);
    assert.equal(dims.perimeterM, expected.perimeterM, `${expected.id}: perímetro de contorno`);
    assert.equal(dims.densityM2PerOperator, expected.densityM2PerOperator, `${expected.id}: densidade`);
    assert.equal(dims.shape, expected.shape, `${expected.id}: shape/bioma`);
    assert.equal(dims.operators, 100, `${expected.id}: 100 operadores (canônico)`);
  }
});

test("contrato interno: área = bbox, perímetro = 2×(x+z), densidade = área ÷ operadores", () => {
  for (const id of WORLD_ORDER) {
    const dims = KHAAOS_WORLDS[id].dimensions;
    assert.equal(dims.areaM2, dims.bboxMeters.x * dims.bboxMeters.z, `${id}: área ≠ bbox`);
    assert.equal(dims.perimeterM, 2 * (dims.bboxMeters.x + dims.bboxMeters.z), `${id}: perímetro ≠ contorno`);
    assert.equal(dims.densityM2PerOperator, dims.areaM2 / dims.operators, `${id}: densidade ≠ área÷op`);
  }
});

test("faixas canônicas do Descentralizador: 15.000–25.000 m² e 150–250 m²/jogador", () => {
  assert.equal(CANONICAL_RING_SPEC.operators, 100);
  assert.deepEqual([...CANONICAL_RING_SPEC.areaBandM2], [15_000, 25_000]);
  assert.deepEqual([...CANONICAL_RING_SPEC.densityBandM2PerOperator], [150, 250]);
  for (const id of WORLD_ORDER) {
    const dims = KHAAOS_WORLDS[id].dimensions;
    assert.ok(dims.areaM2 >= 15_000 && dims.areaM2 <= 25_000, `${id}: área fora da faixa`);
    assert.ok(dims.densityM2PerOperator >= 150 && dims.densityM2PerOperator <= 250, `${id}: densidade fora da faixa`);
  }
});

test("validador detecta TODAS as classes de deriva (nada passa em silêncio)", () => {
  const base = KHAAOS_WORLDS.CIGKV.dimensions;

  // 1 — área fora da faixa
  assert.ok(validateWorldDimensions({ ...base, areaM2: 10_000 }).some((e) => e.includes("fora da faixa")));
  // 2 — perímetro ≠ contorno
  assert.ok(validateWorldDimensions({ ...base, perimeterM: 520 + 10 }).some((e) => e.includes("perímetro")));
  // 3 — densidade ≠ área÷op
  assert.ok(validateWorldDimensions({ ...base, densityM2PerOperator: 200 }).some((e) => e.includes("densidade")));
  // 4 — operadores ≠ 100
  assert.ok(validateWorldDimensions({ ...base, operators: 50, densityM2PerOperator: 320 }).some((e) => e.includes("operadores")));
  // 5 — área ≠ bbox
  assert.ok(validateWorldDimensions({ ...base, areaM2: 16_001 }).some((e) => e.includes("bounding box")));

  // FELIZ: os valores canônicos não produzem nenhum desvio.
  for (const id of WORLD_ORDER) {
    assert.deepEqual(validateWorldDimensions(KHAAOS_WORLDS[id].dimensions), [], `${id}: contrato violado`);
  }
});

test("RNG do WorldMapPreview: FNV-1a + LCG determinísticos (mesmo seed → mesma sequência)", () => {
  const seqA = Array.from({ length: 64 }, createLcg(worldPreviewSeed("CIGKV")));
  const seqB = Array.from({ length: 64 }, createLcg(worldPreviewSeed("CIGKV")));
  assert.deepEqual(seqA, seqB, "mesmo seed produziu sequências diferentes");

  // Seeds distintos divergem (mundo ≠ mundo).
  const seqW1 = Array.from({ length: 16 }, createLcg(worldPreviewSeed("Barburhen")));
  const seqW2 = Array.from({ length: 16 }, createLcg(worldPreviewSeed("Priadus")));
  assert.notDeepEqual(seqW1, seqW2);

  // FNV-1a: valores de referência estáveis (contrato de formato 32-bit).
  assert.equal(fnv1a(""), 0x811c9dc5);
  assert.equal(fnv1a("a"), 0xe40c292c);
  assert.equal(fnv1a("khaaos:worldmap:CIGKV"), worldPreviewSeed("CIGKV"));

  // Saída do LCG em [0,1).
  for (const v of seqA) assert.ok(v >= 0 && v < 1);
});
