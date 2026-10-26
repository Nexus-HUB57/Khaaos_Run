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
