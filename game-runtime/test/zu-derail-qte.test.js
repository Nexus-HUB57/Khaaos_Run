// Khaaos Run — Fase 26 — ZU: modo 'derail' (QTE de emergência + descarrilo).
// O modo 'pass' (default) mantém o contrato Fase 11/12/16 intocado — coberto
// por train-intro.test.js. Aqui validam-se o QTE, as consequências, o
// determinismo do desastre, os destroços e as caixas resgatáveis.
//
// Nota de tempo real: entre DERAIL (5.8 s) e BULLET_END (7.4 s) o relógio
// interno avança a 0.32× — a cinemática completa leva ~14 s reais. Os testes
// usam runToDone() em vez de contagens fixas.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TrainIntro } from '../src/game3d/trainIntro.js';

const mkScene = () => new THREE.Scene();
const mkAudio = () => ({
  rumble: [], crash: 0, alarm: [], tinnitusN: 0,
  trainRumble(on, intensity) { this.rumble.push({ on, intensity }); },
  metalCrash() { this.crash++; },
  alarmSiren(on) { this.alarm.push(on); },
  tinnitus(d) { this.tinnitusN++; },
});
const mkDerail = (opts = {}) => new TrainIntro({ scene: mkScene(), spawn: { x: 0, z: 118 }, skippable: false, mode: 'derail', ...opts });
const runFor = (intro, seconds, dt = 1 / 60) => {
  let finished = false;
  const n = Math.ceil(seconds / dt);
  for (let i = 0; i < n && !finished; i++) finished = intro.update(dt);
  return finished;
};
const runToDone = (intro, maxReal = 25, dt = 1 / 60) => {
  let finished = false;
  for (let i = 0; i < maxReal / dt && !finished; i++) finished = intro.update(dt);
  assert.equal(finished, true, 'cinemática derail conclui dentro do tempo estendido');
  return finished;
};

test('modo derail: QTE abre na janela canônica e decide por teclado/botão', () => {
  const intro = mkDerail();
  assert.equal(intro.mode, 'derail');
  // antes da janela: escolha é recusada
  intro.update(1.0);
  assert.equal(intro.chooseQTE('seatbelt'), false);
  // dentro da janela (≥4.6 s): cinto travado
  runFor(intro, 3.9); // t ≈ 4.9
  assert.equal(intro.qteOpen, true);
  assert.equal(intro.chooseQTE('seatbelt'), true);
  assert.equal(intro.qteOpen, false);
  // fim da timeline (~14 s reais): onDone recebe o outcome do cinto
  let outcome = null;
  intro.onDone = (o) => { outcome = o; };
  runToDone(intro);
  assert.deepEqual(outcome, { choice: 'seatbelt', hpCost: 0, stunSeconds: 2.5 });
  intro.dispose();
});

test('modo derail: timeout sem decisão = falha com custo de vida e atordoamento', () => {
  let outcome = null;
  const intro = mkDerail({ onDone: (o) => { outcome = o; } });
  runToDone(intro); // atravessa a janela inteira sem decidir
  assert.deepEqual(outcome, { choice: 'fail', hpCost: 35, stunSeconds: 3.5 });
  intro.dispose();
});

test('modo derail: escolha "saltar" — custo de vida, zero atordoamento', () => {
  const intro = mkDerail();
  runFor(intro, 4.7); // dentro da janela (4.6–5.75)
  assert.equal(intro.chooseQTE('jump'), true);
  let outcome = null;
  intro.onDone = (o) => { outcome = o; };
  runToDone(intro);
  assert.deepEqual(outcome, { choice: 'jump', hpCost: 20, stunSeconds: 0 });
  intro.dispose();
});

test('modo derail: skip antes do QTE termina sem consequência (outcome null)', () => {
  let calls = 0, outcome = 'unset';
  const intro = new TrainIntro({
    scene: mkScene(), spawn: { x: 0, z: 118 }, skippable: true, mode: 'derail',
    onDone: (o) => { calls++; outcome = o; },
  });
  intro.update(1.0);
  intro.skip();
  assert.equal(calls, 1);
  assert.equal(outcome, null);
  intro.dispose();
});

test('desastre determinístico: mesmo spawn → mesmo frame do trem e dos destroços', () => {
  const a = mkDerail();
  const b = mkDerail();
  runFor(a, 9.0);
  runFor(b, 9.0);
  assert.equal(a.wreckHeadX, b.wreckHeadX, 'ponto de impacto idêntico');
  a.cars.forEach((car, i) => {
    assert.ok(Math.abs(car.position.x - b.cars[i].position.x) < 1e-9, `carro ${i} no mesmo lugar`);
    assert.ok(Math.abs(car.rotation.z - b.cars[i].rotation.z) < 1e-9, `carro ${i} tombado igual`);
  });
  a.dispose(); b.dispose();
});

test('headX trava no impacto (clamp na direção do movimento), linear antes dele', () => {
  const direita = mkDerail({ spawn: { x: 20, z: 100 } });   // dir=1
  const esquerda = mkDerail({ spawn: { x: -20, z: 100 } }); // dir=-1
  for (const intro of [direita, esquerda]) {
    const h1 = intro.headX(1), h2 = intro.headX(2);
    assert.ok(Math.abs((h2 - h1) - (h1 - intro.headX(0))) < 1e-6, 'linear pré-derail');
    assert.equal(intro.headX(6.0), intro.wreckHeadX, 'pós-derail trava no impacto');
    assert.equal(intro.headX(9.0), intro.wreckHeadX, 'clamp estável');
  }
  direita.dispose(); esquerda.dispose();
});

test('câmera multi-estágio: perseguição → cabine 1ª pessoa → orbital → handover', () => {
  const intro = mkDerail();
  const cam = new THREE.PerspectiveCamera();
  intro.update(1.0);
  intro.cameraPose(cam, { x: 0, z: 118 });
  const chase = cam.position.clone();
  runFor(intro, 3.0); // t ≈ 4.0 — cabine
  intro.cameraPose(cam, { x: 0, z: 118 });
  const cabin = cam.position.clone();
  runFor(intro, 2.5); // t ≈ 6.0 (bullet-time) — orbital
  intro.cameraPose(cam, { x: 0, z: 118 });
  const orbit = cam.position.clone();
  assert.ok(chase.distanceTo(cabin) > 5, 'perseguição → cabine muda de estágio');
  assert.ok(Math.abs(cabin.z - intro.railZ) < 3, 'cabine junto ao trilho');
  assert.ok(orbit.distanceTo(cabin) > 5, 'cabine → orbital muda de estágio');
  intro.dispose();
});

test('caixas resgatáveis: 6 posições determinísticas com loot nas formas do #pickup', () => {
  const intro = mkDerail();
  assert.ok(Array.isArray(intro.crateLoot) && intro.crateLoot.length === 6);
  const kinds = intro.crateLoot.map((i) => i.kind);
  assert.ok(kinds.filter((k) => k === 'consumable').length === 2, '2 medkits');
  const barrett = intro.crateLoot.find((i) => i.id === 'barrett');
  assert.equal(barrett.kind, 'weapon');
  assert.equal(barrett.rarity, 'RARO');
  for (const item of intro.crateLoot) {
    assert.equal(item.active, true);
    assert.equal(item.sectorId, 'zu-wreck');
    assert.equal(item.y, .55);
    assert.ok(Number.isFinite(item.x) && Number.isFinite(item.z));
  }
  // mesmas posições em duas instâncias (semente = spawn)
  const b = mkDerail();
  assert.deepEqual(intro.crateLoot.map((i) => [i.x, i.z]), b.crateLoot.map((i) => [i.x, i.z]));
  intro.dispose(); b.dispose();
});

test('destruição no palco: destroços instanciados + pilares que cedem + incêndio', () => {
  const scene = mkScene();
  const intro = new TrainIntro({ scene, spawn: { x: 0, z: 118 }, skippable: false, mode: 'derail' });
  const group = scene.getObjectByName('zu-train-intro');
  // 2 InstancedMeshes: dormentes (via) e destroços (36) — pega o de 36
  const instanced = group.children.filter((o) => o.isInstancedMesh);
  const debris = instanced.find((o) => o.count === 36);
  assert.ok(debris, '36 destroços instanciados');
  assert.ok(instanced.some((o) => o.count >= 600), 'dormentes da via presentes');
  assert.ok(intro.pillars.length === 8, 'viaduto com pilares');
  runFor(intro, 9.0); // pós-derail: destroços voaram, pilares cederam
  const m = new THREE.Matrix4();
  intro.debrisMesh.getMatrixAt(0, m);
  assert.ok(Number.isFinite(m.elements[12]), 'matriz de destroço válida pós-balística');
  assert.ok(intro.fallingPillars.every((p) => p.mesh.rotation.z !== 0), 'pilares tombaram');
  assert.ok(intro.flames.length === 6 && intro.smokes.length === 7, 'incêndio + fumaça no destroço');
  intro.dispose();
});

test('áudio do derail: rumble na cabine, crash no impacto, tinnitus pós-bullet-time', () => {
  const audio = mkAudio();
  const intro = mkDerail({ audio });
  assert.ok(audio.rumble.length >= 1 && audio.rumble[0].on === true, 'rumble liga na entrada');
  runToDone(intro); // atravessa o impacto + bullet-time + aftermath
  assert.ok(audio.crash >= 1, 'crash metálico no descarrilo');
  assert.ok(audio.tinnitusN >= 1, 'tinnitus após o bullet-time');
  assert.ok(audio.rumble.some((c) => c.on === false), 'rumble desliga no fim');
  assert.ok(audio.alarm.includes(false), 'alarme desliga no fim');
  intro.dispose();
});

test('modo online intocado: default é pass — timeline 3.4 s e outcome null', () => {
  let outcome = 'unset';
  const intro = new TrainIntro({ scene: mkScene(), spawn: { x: 0, z: 118 }, skippable: false, onDone: (o) => { outcome = o; } });
  assert.equal(intro.mode, 'pass');
  let finished = false;
  for (let i = 0; i < 600 && !finished; i++) finished = intro.update(1 / 60);
  assert.equal(finished, true);
  assert.equal(outcome, null, 'sem QTE no modo pass');
  intro.dispose();
});
