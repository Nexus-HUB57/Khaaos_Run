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
