// Khaaos Run — Fase 11 — trem do ZU: timeline determinística + skip.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TrainIntro } from '../src/game3d/trainIntro.js';

const mkScene = () => new THREE.Scene();

test('trem avança de forma determinística (headX linear no tempo)', () => {
  const intro = new TrainIntro({ scene: mkScene(), spawn: { x: 0, z: 118 }, skippable: false });
  const h0 = intro.headX(0);
  const h1 = intro.headX(1);
  const h2 = intro.headX(2);
  assert.ok(Math.abs((h1 - h0) - (h2 - h1)) < 1e-6, 'velocidade constante');
  assert.ok(Math.abs(h2 - h0) > 10, 'trem se desloca');
  intro.dispose();
});

test('direção do trem aponta para o spawn (entra pela borda contrária)', () => {
  const direita = new TrainIntro({ scene: mkScene(), spawn: { x: 60, z: 100 }, skippable: false });
  const esquerda = new TrainIntro({ scene: mkScene(), spawn: { x: -60, z: 100 }, skippable: false });
  assert.equal(direita.dir, 1);
  assert.equal(esquerda.dir, -1);
  direita.dispose(); esquerda.dispose();
});

test('update conclui no fim da timeline e chama onDone UMA vez', () => {
  let doneCalls = 0;
  const intro = new TrainIntro({ scene: mkScene(), spawn: { x: 0, z: -90 }, skippable: false, onDone: () => doneCalls++ });
  let finished = false;
  for (let i = 0; i < 600; i++) finished = intro.update(1 / 60); // 10 s @60fps
  assert.equal(finished, true);
  assert.equal(doneCalls, 1);
  intro.update(1 / 60); // ticks pós-fim não re-executam
  assert.equal(doneCalls, 1);
  intro.dispose();
});

test('skip encerra imediatamente (uma chamada), mesmo com timeline incompleta', () => {
  let doneCalls = 0;
  const intro = new TrainIntro({ scene: mkScene(), spawn: { x: 0, z: 118 }, onDone: () => doneCalls++ });
  intro.update(0.5);
  intro.skip();
  assert.equal(doneCalls, 1);
  intro.skip(); // idempotente
  assert.equal(doneCalls, 1);
  assert.equal(intro.done, true);
  intro.dispose();
});

test('cameraPose posiciona a câmera perto do trilho e converge com o tempo', () => {
  const scene = mkScene();
  const intro = new TrainIntro({ scene, spawn: { x: 0, z: 118 }, skippable: false });
  const cam = new THREE.PerspectiveCamera();
  intro.update(0.1);
  intro.cameraPose(cam, { x: 0, z: 118 });
  const early = cam.position.clone();
  intro.update(2.2);
  intro.cameraPose(cam, { x: 0, z: 118 });
  const late = cam.position.clone();
  assert.ok(early.distanceTo(late) > 1, 'câmera se move durante a cinemática');
  assert.ok(Math.abs(early.z - intro.railZ) > Math.abs(late.z - intro.railZ), 'aproxima-se do trilho');
  intro.dispose();
});

// ---------- Fase 12 — entrada sincronizada pelo relógio do servidor ----------
test('startAt sincronizado: remoto entra no meio da timeline e conclui no mesmo instante global', () => {
  let doneCalls = 0;
  // remoto recebeu o anúncio 2,2 s depois do startedAt do servidor
  const intro = new TrainIntro({ scene: mkScene(), spawn: { x: 0, z: 118 }, skippable: false, startAt: 2.2, onDone: () => doneCalls++ });
  assert.equal(intro.t, 2.2);
  const headLate = intro.headX(intro.t);
  // referência: quem começou no 0 já percorreu 2,2 s — MESMO frame do trem
  const reference = new TrainIntro({ scene: mkScene(), spawn: { x: 0, z: 118 }, skippable: false });
  reference.update(2.2);
  assert.ok(Math.abs(reference.headX(reference.t) - headLate) < 1e-6, 'remoto vê o mesmo frame');
  // restam DURATION − 2,2 s: conclui dentro da janela correta
  let elapsed = 0;
  while (!intro.update(1 / 60) && elapsed < 10) elapsed += 1 / 60;
  assert.ok(Math.abs(elapsed - (3.4 - 2.2)) < 0.05, `conclui em ~1,2 s (foi ${elapsed.toFixed(2)}s)`);
  assert.equal(doneCalls, 1);
  reference.dispose();
});

test('startAt ignora valores inválidos/negativos (fallback determinístico em 0)', () => {
  const a = new TrainIntro({ scene: mkScene(), skippable: false, startAt: -3 });
  assert.equal(a.t, 0);
  const b = new TrainIntro({ scene: mkScene(), skippable: false, startAt: NaN });
  assert.equal(b.t, 0);
  const c = new TrainIntro({ scene: mkScene(), skippable: false, startAt: 'x' });
  assert.equal(c.t, 0);
  a.dispose(); b.dispose(); c.dispose();
});

// ---------- Fase 16 (P0) — trem no padrão do jogo: via permanente + anatomia ferroviária ----------
test('via permanente: lastro, dormentes instanciados e 2 trilhos (fim da placa flutuante)', () => {
  const scene = mkScene();
  const intro = new TrainIntro({ scene, spawn: { x: 0, z: 118 }, skippable: false });
  const group = scene.getObjectByName('zu-train-intro');
  assert.ok(group, 'grupo do trem registrado');
  const rails = group.children.filter((o) => o.isMesh && Math.abs(o.position.z - intro.railZ) > .5);
  assert.ok(rails.length >= 2, `2 trilhos separados (${rails.length})`);
  const sleepers = group.children.find((o) => o.isInstancedMesh);
  assert.ok(sleepers, 'dormentes instanciados');
  assert.ok(sleepers.count >= 600, `dormentes cobrem a via (${sleepers.count})`);
  const ballast = group.children.find((o) => o.isMesh && o.geometry.type === 'BoxGeometry' && o.geometry.parameters.depth > 4);
  assert.ok(ballast, 'lastro sob os dormentes');
  intro.dispose();
});

test('locomotiva com anatomia ferroviária: bogies, rodas cilíndricas, nariz, cabine e farol', () => {
  const scene = mkScene();
  const intro = new TrainIntro({ scene, spawn: { x: 0, z: 118 }, skippable: false });
  const loco = intro.cars[0];
  assert.ok(loco.isGroup, 'locomotiva é composição (não caixa solta)');
  let cylinders = 0, emissive = 0, boxes = 0;
  loco.traverse((o) => {
    if (!o.isMesh) return;
    if (o.geometry.type === 'CylinderGeometry') cylinders++;
    if (o.geometry.type === 'BoxGeometry') boxes++;
    if (o.material?.emissiveIntensity > .8) emissive++;
  });
  // 2 bogies × 3 eixos × 2 lados (roda+aro) + 2 exaustores + 2 anéis
  assert.ok(cylinders >= 16, `rodas/eixos cilíndricos na locomotiva (${cylinders})`);
  assert.ok(boxes >= 6, `carroceria/cabine/teto/saias (${boxes})`);
  assert.ok(emissive >= 3, `farol + janelas + anéis de exaustão emissivos (${emissive})`);
  // vagões: 4 veículos, cada vagão com bogies rodando e janelas iluminadas
  assert.equal(intro.cars.length, 4, 'locomotiva + 3 vagões');
  let wagonWheels = 0;
  for (const car of intro.cars.slice(1)) {
    car.traverse((o) => { if (o.isMesh && o.geometry.type === 'CylinderGeometry') wagonWheels++; });
  }
  assert.ok(wagonWheels >= 24, `todos os bogies dos vagões rodam (${wagonWheels})`);
  // rodas dos bogies com eixo transversal ao trilho (rotation.x = π/2);
  // exaustores são verticais e não contam — procura entre TODOS os cilindros
  const wheelsCyl = [];
  loco.traverse((o) => { if (o.isMesh && o.geometry.type === 'CylinderGeometry') wheelsCyl.push(o); });
  assert.ok(
    wheelsCyl.some((o) => Math.abs(Math.abs(o.rotation.x) - Math.PI / 2) < .01),
    'pelo menos as rodas dos bogies têm eixo transversal',
  );
  intro.dispose();
});

test('veículos do trem seguem a cabeça com offsets preservados (fila sincronizada)', () => {
  const scene = mkScene();
  const intro = new TrainIntro({ scene, spawn: { x: 0, z: 118 }, skippable: false });
  intro.update(.7);
  const head = intro.headX(intro.t);
  intro.cars.forEach((car, i) => {
    const expected = head - intro.dir * car.userData.offset;
    assert.ok(Math.abs(car.position.x - expected) < 1e-9, `carro ${i} acompanha a cabeça`);
  });
  // gaps consistentes: offsets crescem com len + vão
  assert.ok(intro.cars[1].userData.offset > intro.cars[0].userData.offset, 'fila em ordem');
  assert.ok(intro.trainLength > 4 * 11, 'comprimento total coerente');
  intro.dispose();
});
