// Khaaos Run — Fase 17 — FX das sobrevivências de cada mundo (tsunami/lava/
// gravidade/ácido) ligados aos eventos autoritativos da sim/servidor.
// O dano é POR ALTURA (submergeBelowY/lavaBelowY): o FX materializa a MESMA
// regra — nível sobe, sustenta, recua — sem aplicar dano nenhum aqui.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SurvivalFX } from '../src/game3d/survivalfx3d.js';
import { ParticleSystem } from '../src/game3d/particles3d.js';

// stub de canvas p/ buildScene headless (mesmo padrão do worldmarks.test.js)
const ctx2d = {
  fillStyle: '', fillRect() {}, strokeRect() {}, clearRect() {}, beginPath() {}, arc() {}, fill() {},
  moveTo() {}, lineTo() {}, stroke() {}, ellipse() {}, quadraticCurveTo() {}, closePath() {},
  save() {}, restore() {}, translate() {}, fillText() {},
  measureText() { return { width: 10 }; },
  createLinearGradient() { return { addColorStop() {} }; },
  createRadialGradient() { return { addColorStop() {} }; },
  getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4).fill(128) }),
  putImageData() {}, createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
};
if (typeof globalThis.document === 'undefined') {
  globalThis.document = { createElement() { return { width: 0, height: 0, getContext: () => ctx2d }; } };
}

const PRIADUS = { id: 'Priadus', survival: { type: 'TSUNAMI_WAVE', intervalSeconds: 180, durationSeconds: 40, damagePerSecond: 6, submergeBelowY: 90 } };
const CKESALTH = { id: 'Ckesalth', survival: { type: 'VOLCANIC_LAVA', intervalSeconds: 140, durationSeconds: 35, damagePerSecond: 9, lavaBelowY: 180 } };
const ARUKHEEA = {
  id: 'Arukheea',
  survival: {
    type: 'KHAOS_GRAVITY', intervalSeconds: 120, durationSeconds: 30,
    damagePerSecond: 12, gravityScale: .35, anchorRadius: 28,
    anchors: [{ id: 'NEXUS', name: 'Nexus of Khaaos', x: 0, z: 0 }, { id: 'OESTE', name: 'Oeste', x: -40, z: 30 }],
  },
};

function makeFX(scenario) {
  const scene = new THREE.Scene();
  const particles = new ParticleSystem({ capacity: 512 });
  scene.add(particles.points);
  const fx = new SurvivalFX(scene, scenario, { particles });
  return { scene, particles, fx };
}

test('tsunami: superfície sobe até submergeBelowY (smoothstep) e sustenta', () => {
  const { fx } = makeFX(PRIADUS);
  fx.handleEvent({ type: 'tsunamiStart', durationSeconds: 40, submergeBelowY: 90 });
  assert.equal(fx.state.active, 'tsunami');
  assert.equal(fx.state.phase, 'rising');
  const rise = Math.min(10, 40 * .28); // 10 s
  let t = 0;
  for (let i = 0; i < Math.ceil(rise / (1 / 30)); i++) { fx.update(1 / 30, t); t += 1 / 30; }
  assert.equal(fx.state.phase, 'sustained');
  assert.ok(Math.abs(fx.state.surfaceY - 90) < .5, `superfície no alvo 90 (${fx.state.surfaceY.toFixed(2)})`);
  // sustentação ondula em torno do alvo — nunca desmente a regra de dano
  for (let i = 0; i < 90; i++) { fx.update(1 / 30, t); t += 1 / 30; }
  assert.ok(Math.abs(fx.state.surfaceY - 90) < 1, `ondulação ≤1m do alvo (${fx.state.surfaceY.toFixed(2)})`);
});

test('tsunami: tsunamiEnd recua a superfície até invisível e volta a idle', () => {
  const { fx } = makeFX(PRIADUS);
  fx.handleEvent({ type: 'tsunamiStart', durationSeconds: 40, submergeBelowY: 90 });
  for (let i = 0; i < 300; i++) fx.update(1 / 30, i / 30); // 10s sobe
  fx.handleEvent({ type: 'tsunamiEnd' });
  assert.equal(fx.state.phase, 'receding');
  for (let i = 0; i < 9 * 30 + 2; i++) fx.update(1 / 30, 10 + i / 30); // 9s recua
  assert.equal(fx.state.active, null);
  assert.equal(fx.state.phase, 'idle');
  assert.equal(fx.state.surfaceY, 0);
});

test('tsunami: espuma real — partículas emitidas durante a elevação', () => {
  const { particles, fx } = makeFX(PRIADUS);
  fx.handleEvent({ type: 'tsunamiStart', durationSeconds: 40, submergeBelowY: 90 });
  for (let i = 0; i < 60; i++) { fx.update(1 / 30, i / 30); particles.update(1 / 30); }
  assert.ok(particles.activeCount > 0, `espuma viva (${particles.activeCount})`);
});

test('erupção: lava sobe até lavaBelowY (180 m) e emite brasas + fumaça', () => {
  const { particles, fx } = makeFX(CKESALTH);
  fx.handleEvent({ type: 'eruptionStart', durationSeconds: 35, lavaBelowY: 180 });
  assert.equal(fx.state.active, 'lava');
  const rise = Math.min(10, 35 * .28); // 9.8 s
  for (let i = 0; i < Math.ceil(rise / (1 / 30)); i++) { fx.update(1 / 30, i / 30); particles.update(1 / 30); }
  assert.ok(Math.abs(fx.state.surfaceY - 180) < .5, `lava no alvo 180 (${fx.state.surfaceY.toFixed(2)})`);
  assert.ok(particles.activeCount > 0, `brasas/fumaça vivas (${particles.activeCount})`);
  const surface = fx.group.children.find((m) => m.name === 'lava-surface');
  assert.ok(surface, 'superfície nomeada lava-surface na cena');
});

test('idempotência: tsunamiStart duplicado NÃO duplica a superfície', () => {
  const { fx } = makeFX(PRIADUS);
  fx.handleEvent({ type: 'tsunamiStart', durationSeconds: 40, submergeBelowY: 90 });
  const group = fx.group;
  const meshes = group.children.length;
  fx.handleEvent({ type: 'tsunamiStart', durationSeconds: 40, submergeBelowY: 90 });
  assert.equal(group.children.length, meshes, 'mesma superfície reutilizada');
});

test('anomalia KHAOS: domos nos anchors oficiais, pulso e encerramento', () => {
  const { particles, fx } = makeFX(ARUKHEEA);
  fx.handleEvent({ type: 'gravityAnomalyStart', durationSeconds: 30, gravityScale: .35, anchorRadius: 28, anchors: ARUKHEEA.survival.anchors });
  assert.equal(fx.state.active, 'gravity');
  assert.equal(fx.state.domes, 2, 'um domo por anchor');
  fx.update(1 / 30, 0);
  const group = fx.group;
  const domes = group.children.filter((m) => m.name.startsWith('gravity-dome:'));
  assert.equal(domes.length, 2);
  assert.ok(domes.every((d) => d.visible), 'domos visíveis durante a anomalia');
  assert.ok(domes.every((d) => d.material.opacity > 0), 'pulso com opacity > 0');
  // motos ascendentes
  for (let i = 0; i < 30; i++) { fx.update(1 / 30, i / 30); particles.update(1 / 30); }
  assert.ok(particles.activeCount > 0, 'motos de gravidade invertida');
  fx.handleEvent({ type: 'gravityAnomalyEnd' });
  for (let i = 0; i < 1.3 * 30; i++) fx.update(1 / 30, 1 + i / 30);
  assert.equal(fx.state.active, null);
  assert.ok(domes.every((d) => !d.visible), 'domos escondidos no fim');
});

test('acidRain: drizzle por evento, decai sozinho', () => {
  const { particles, fx } = makeFX({ id: 'CIGKV' });
  fx.handleEvent({ type: 'acidRain', damage: 1, intervalSeconds: 10 });
  assert.ok(fx.state.acidT > 0, 'drizzle ativo');
  for (let i = 0; i < 20; i++) { fx.update(1 / 30, i / 30); particles.update(1 / 30); }
  assert.ok(particles.activeCount > 0, 'gotas de ácido caindo');
  for (let i = 0; i < 3 * 30; i++) { fx.update(1 / 30, 1 + i / 30); particles.update(1 / 30); }
  assert.equal(fx.state.acidT, 0, 'decai a zero');
});

test('evento desconhecido é ignorado sem erro e sem estado', () => {
  const { fx } = makeFX(PRIADUS);
  fx.handleEvent({ type: 'meteorShower', durationSeconds: 5 });
  assert.equal(fx.state.active, null);
  assert.equal(fx.state.phase, 'idle');
});

test('mudança de hazard: tsunami ativo → erupção assume a MESMA superfície', () => {
  const { fx } = makeFX(PRIADUS);
  fx.handleEvent({ type: 'tsunamiStart', durationSeconds: 40, submergeBelowY: 90 });
  fx.handleEvent({ type: 'tsunamiEnd' });
  fx.handleEvent({ type: 'eruptionStart', durationSeconds: 35, lavaBelowY: 180 });
  assert.equal(fx.state.active, 'lava');
  assert.equal(fx.group.children.filter((m) => m.name.includes('surface')).length, 1, 'uma superfície só');
});

test('dispose: grupo removido da cena sem erro duplo', () => {
  const { scene, fx } = makeFX(PRIADUS);
  fx.handleEvent({ type: 'tsunamiStart', durationSeconds: 40, submergeBelowY: 90 });
  fx.update(1 / 30, 0);
  fx.dispose();
  assert.ok(!scene.children.includes(fx.group));
  fx.dispose(); // segunda passada segura
});

// ---------- integração headless com os 5 mundos reais (lição da Fase 16) ----------
import { buildScene } from '../src/game3d/world3d.js';
import { getWorldLayout } from '../src/game3d/sim3d.js';
import { SCENARIOS } from '../src/game3d/scenarios.js';

const HAZARD_EVENT = {
  CIGKV: () => ({ type: 'acidRain', damage: 1, intervalSeconds: 10 }),
  Barburhen: () => null, // sem survival hazard — só partículas de chaminé
  Priadus: (s) => ({ type: 'tsunamiStart', durationSeconds: s.durationSeconds, submergeBelowY: s.submergeBelowY }),
  Ckesalth: (s) => ({ type: 'eruptionStart', durationSeconds: s.durationSeconds, lavaBelowY: s.lavaBelowY }),
  Arukheea: (s) => ({ type: 'gravityAnomalyStart', durationSeconds: s.durationSeconds, gravityScale: s.gravityScale, anchorRadius: s.anchorRadius, anchors: s.anchors }),
};

test('5 mundos: marcos + partículas + SurvivalFX integram sem erro nem NaN', () => {
  for (const scenario of Object.values(SCENARIOS)) {
    const { scene } = buildScene(4321, scenario.id, null, 'high');
    const system = scene.userData.particles;
    assert.ok(system, `${scenario.id}: sistema de partículas compartilhado registrado`);
    const fx = new SurvivalFX(scene, scenario, { particles: system });
    const hazard = scenario.survival ? HAZARD_EVENT[scenario.id]?.(scenario.survival) : null;
    if (hazard) fx.handleEvent(hazard);
    let t = 0;
    for (let i = 0; i < 120; i++) { // 4 s de mundo vivo
      for (const fn of scene.userData.worldMarks.animators) fn(1 / 30, t);
      fx.update(1 / 30, t);
      system.update(1 / 30);
      t += 1 / 30;
    }
    for (const p of system.snapshot()) {
      for (const v of [p.x, p.y, p.z, p.alpha, p.size]) {
        assert.ok(Number.isFinite(v), `${scenario.id}: partícula finita (${v})`);
      }
    }
    if (hazard) assert.ok(fx.state.active, `${scenario.id}: hazard ativo (${fx.state.active})`);
    fx.dispose();
  }
});

// ══════════════════════════════════════════════════════════════════════════
// Fase 26 — FX DOS MARCOS × MUNDOS: o SurvivalFX abastece os MARCOS com o
// estado do hazard a cada frame (kind + boost 0..1 + surfaceY) via registro
// com applyHazard — a mesma fonte autoritativa que move a superfície.
// ══════════════════════════════════════════════════════════════════════════

function makeFXWithLandmarks(scenario) {
  const scene = new THREE.Scene();
  const particles = new ParticleSystem({ capacity: 512 });
  scene.add(particles.points);
  const pushes = [];
  const landmarks = {
    hazardState: null,
    applyHazard(kind, boost, surfaceY) { pushes.push({ kind, boost, surfaceY }); this.hazardState = { kind, boost, surfaceY }; },
  };
  const fx = new SurvivalFX(scene, scenario, { particles, landmarks });
  return { scene, particles, fx, pushes, landmarks };
}

test('Fase 26: tsunami abastece os marcos — boost 0→1 na subida, 1 na sustentação, 0 no recuo', () => {
  const { fx, pushes } = makeFXWithLandmarks(PRIADUS);
  fx.handleEvent({ type: 'tsunamiStart', durationSeconds: 40, submergeBelowY: 90 });
  const rise = Math.min(10, 40 * .28);
  let t = 0;
  for (let i = 0; i < Math.ceil(rise / (1 / 30)); i++) { fx.update(1 / 30, t); t += 1 / 30; }
  fx.update(1 / 30, t); // 1 frame de sustentação
  const kinds = pushes.map((p) => p.kind);
  assert.ok(kinds.every((k) => k === 'tsunami'), 'todo push é tsunami');
  const boosts = pushes.map((p) => p.boost);
  assert.ok(boosts[0] < .2, `primeiro boost quase zero (${boosts[0].toFixed(3)})`);
  const last = pushes.at(-1);
  assert.equal(last.boost, 1, 'sustentação = 1');
  assert.ok(Math.abs(last.surfaceY - 90) < 1, `surfaceY acompanha a superfície (${last.surfaceY.toFixed(2)})`);
  // recuo: boost desce monotonicamente até 0 e zerado no idle
  pushes.length = 0;
  fx.handleEvent({ type: 'tsunamiEnd' });
  for (let i = 0; i < 10 * 30; i++) { fx.update(1 / 30, t); t += 1 / 30; }
  const afterEnd = pushes.map((p) => p.boost);
  assert.ok(afterEnd.length > 2, 'pushes no recuo');
  assert.equal(afterEnd.at(-1), 0, 'recuo termina em boost 0');
  assert.equal(pushes.at(-1).kind, null, 'idle zera o kind 1×');
  // frame extra em idle NÃO empurra de novo (idempotente)
  const len = pushes.length;
  fx.update(1 / 30, t);
  assert.equal(pushes.length, len, 'idle não repete push');
});

test('Fase 26: lava e gravidade abastecem os marcos com o MESMO contrato', () => {
  const lava = makeFXWithLandmarks(CKESALTH);
  lava.fx.handleEvent({ type: 'eruptionStart', durationSeconds: 35, lavaBelowY: 180 });
  // push ocorre no INÍCIO do update (antes de elapsed avançar): 1º frame boost 0,
  // frames seguintes sobem — mesmo smoothstep da superfície
  for (let i = 0; i < 10; i++) lava.fx.update(1 / 30, i / 30);
  assert.equal(lava.pushes.at(-1).kind, 'lava');
  assert.ok(lava.pushes.at(-1).boost > 0, 'boost começa a subir');
  const grav = makeFXWithLandmarks(ARUKHEEA);
  grav.fx.handleEvent({ type: 'gravityAnomalyStart', durationSeconds: 30, anchors: ARUKHEEA.survival.anchors, anchorRadius: 28 });
  grav.fx.update(1 / 30, 0);
  grav.fx.update(1 / 30, 1 / 30);
  assert.equal(grav.pushes.at(-1).kind, 'gravity');
  assert.ok(grav.pushes.at(-1).boost > 0, 'gravityBoost flui para os marcos');
  // ácido: pulse curto com boost 1
  const acid = makeFXWithLandmarks({ id: 'CIGKV' });
  acid.fx.handleEvent({ type: 'acidRain', damage: 1, intervalSeconds: 10 });
  acid.fx.update(1 / 30, 0);
  assert.equal(acid.pushes.at(-1).kind, 'acid');
  assert.equal(acid.pushes.at(-1).boost, 1, 'pulse ativo = alerta pleno');
});

test('Fase 26: SEM landmarks (deps ausente) nada quebra — headless/testes antigos', () => {
  const { fx } = makeFX(PRIADUS); // sem landmarks
  fx.handleEvent({ type: 'tsunamiStart', durationSeconds: 40, submergeBelowY: 90 });
  assert.doesNotThrow(() => { for (let i = 0; i < 10; i++) fx.update(1 / 30, i / 30); });
  fx.handleEvent({ type: 'tsunamiEnd' });
  assert.doesNotThrow(() => fx.update(1 / 30, 1));
});
