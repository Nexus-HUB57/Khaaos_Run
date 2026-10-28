// Khaaos Run — Fase 26 — micro-detalle PBR (anti-plástico) — contrato headless.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { seededRng, microDetailParams, MICRO_PRESETS, buildMicroDetailMaps, applyMicroDetail } from '../src/game3d/materials3d.js';

test('seededRng é determinístico byte a byte (mesma semente ⇒ mesma sequência)', () => {
  const a = seededRng(42);
  const b = seededRng(42);
  const seqA = Array.from({ length: 16 }, () => a());
  const seqB = Array.from({ length: 16 }, () => b());
  assert.deepEqual(seqA, seqB);
  const c = seededRng(43);
  assert.notDeepEqual(seqA, Array.from({ length: 16 }, () => c()));
  // domínio [0,1)
  for (const v of seqA) assert.ok(v >= 0 && v < 1);
});

test('presets carregam parâmetros canônicos (tecido trama, metal escovado)', () => {
  assert.equal(MICRO_PRESETS.fabric.weave, true);
  assert.equal(MICRO_PRESETS.metal.brushed, true);
  assert.ok(MICRO_PRESETS.fabric.roughBase > MICRO_PRESETS.metal.roughBase, 'tecido mais fosco que metal');
});

test('microDetailParams: determinístico por semente com jitter controlado', () => {
  const a = microDetailParams('fabric', 7);
  const b = microDetailParams('fabric', 7);
  assert.deepEqual(a, b);
  const c = microDetailParams('fabric', 8);
  assert.notEqual(a.repeat, c.repeat, 'semente muda o repeat');
  // jitter nunca leva o repeat fora da margem do preset (±~6%)
  const base = MICRO_PRESETS.fabric.repeat;
  assert.ok(Math.abs(a.repeat - base) < base * .08);
  assert.ok(a.roughBase > .25 && a.roughBase < .98);
  // preset desconhecido cai no fabric (fallback seguro)
  const fb = microDetailParams('inexistente', 1);
  assert.equal(fb.preset, 'fabric');
});

test('headless: buildMicroDetailMaps não depende de canvas (Node) e é puro', () => {
  const maps = buildMicroDetailMaps('fabric', 3, 64);
  assert.equal(maps.headless, true);
  assert.equal(maps.map, null);
  assert.equal(maps.roughnessMap, null);
  assert.equal(maps.normalMap, null);
  // parâmetros embutidos continuam determinísticos
  assert.deepEqual(maps.params, microDetailParams('fabric', 3));
});

test('applyMicroDetail é no-op seguro em Node e não altera geometria/cores', () => {
  const mat = new THREE.MeshStandardMaterial({ color: '#3a3f47', roughness: .78 });
  const params = applyMicroDetail(mat, { preset: 'fabric', seed: 11 });
  assert.equal(params.seed, 11);
  assert.equal(mat.roughnessMap ?? null, null, 'sem canvas ⇒ sem mapas (headless)');
  assert.equal(mat.color.getHexString(), '3a3f47');
  assert.equal(mat.roughness, .78);
});
