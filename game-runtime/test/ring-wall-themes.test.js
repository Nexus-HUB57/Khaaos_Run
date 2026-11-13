// Task 64 — SAFE ZONE TEMÁTICA POR CENÁRIO: a parede do anel materializa o
// hazard canônico de cada mundo (fim do "círculo de linhas amarelas" genérico).
// Contrato: createRingWall(scenarioId) → uniforms por tema + userData.theme +
// fog-sync preservado (fix "mundo vermelho"). Headless-safe (THREE puro).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';

const { createRingWall, RING_WALL_THEMES, ringWallTheme } = await import('../src/game3d/world3d.js');
const { SCENARIOS } = await import('../src/game3d/scenarios.js');

const WORLD_IDS = ['CIGKV', 'Barburhen', 'Priadus', 'Ckesalth', 'Arukheea'];

test('T64 · um tema distinto por mundo canônico (5 hazards, 5 visuais)', () => {
  const modes = WORLD_IDS.map((id) => RING_WALL_THEMES[id].mode);
  assert.deepEqual(modes, ['energy', 'rain', 'fog', 'smoke', 'wave'],
    'CIGKV=energia, W1=chuva ácida, W2=esporos, W3=fumaça, W4=tsunami');
  // paletas distintas entre si (sem duas paredes idênticas)
  const palettes = new Set(WORLD_IDS.map((id) => `${RING_WALL_THEMES[id].a}|${RING_WALL_THEMES[id].b}`));
  assert.equal(palettes.size, 5, 'cada mundo tem sua própria cor');
});

test('T64 · createRingWall aplica o tema do cenário nos uniforms do shader', () => {
  for (const id of WORLD_IDS) {
    const wall = createRingWall(id);
    const u = wall.userData.uniforms[0];
    const t = RING_WALL_THEMES[id];
    assert.equal(new THREE.Color(t.a).getHex(), u.colorA.value.getHex(), `${id}: colorA do tema`);
    assert.equal(new THREE.Color(t.b).getHex(), u.colorB.value.getHex(), `${id}: colorB do tema`);
    assert.equal(new THREE.Color(t.glow).getHex(), u.glow.value.getHex(), `${id}: glow do tema`);
    assert.equal(wall.userData.ringWallTheme.mode, t.mode);
    // estrutura legada preservada: 2 camadas + uniforms sincronizáveis
    assert.equal(wall.userData.uniforms.length, 2);
    assert.equal(wall.children.length, 2);
  }
});

test('T64 · todos os cenários oficiais resolvem um tema (ids operacionais W1–W4)', () => {
  for (const s of Object.values(SCENARIOS)) {
    const theme = ringWallTheme(s.id);
    assert.ok(theme, `${s.id} tem tema`);
    assert.ok(WORLD_IDS.includes(s.id) === false || theme === RING_WALL_THEMES[s.id],
      `${s.id}: tema próprio`);
  }
  // ids fora do catálogo (o runtime sempre passa scenario.id canônico) caem
  // no default CIGKV sem quebrar
  assert.equal(ringWallTheme('W1').mode, 'energy');
  assert.equal(ringWallTheme('desconhecido').mode, 'energy');
  assert.equal(ringWallTheme(undefined).mode, 'energy');
});

test('T64 · fog-sync preservado: uniforms fogColor/fogDensity presentes (fix mundo vermelho)', () => {
  const wall = createRingWall('Arukheea');
  for (const u of wall.userData.uniforms) {
    assert.ok(u.fogColor, 'fogColor no uniform');
    assert.ok(u.fogDensity, 'fogDensity no uniform');
    assert.ok(u.time, 'time no uniform (updateRing anima)');
  }
});

test('T64 · parede é ShaderMaterial transparente dupla-face com depthWrite off', () => {
  const wall = createRingWall('Barburhen');
  for (const mesh of wall.children) {
    assert.equal(mesh.isMesh, true);
    assert.equal(mesh.material.transparent, true);
    assert.equal(mesh.material.side, THREE.DoubleSide);
    assert.equal(mesh.material.depthWrite, false);
    assert.ok(mesh.material.uniforms.opacity.value > 0);
  }
});
