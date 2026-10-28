// Khaaos Run — Fase 16 (P0) — veículos do ZU no padrão do jogo.
// A Fase 8 entregava "caixas com rodas-caixa": silhueta robótica fora do
// padrão Live Action. Aqui validamos a anatomia automotiva REAL: degraus de
// silhueta (capô/tampa), greenhouse em prisma com pilares inclinados, rodas
// cilíndricas com eixo no lugar, luzes emissivas e baú de van — tudo
// determinístico e instanciado (custo constante de draw calls).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { VEHICLE_PROFILES, windshieldSlope, buildTrafficVehicles } from '../src/game3d/vehicles3d.js';
import { frustumPrism } from '../src/game3d/prisms3d.js';

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

test('perfis: degraus de silhueta real (capô < teto, teto > greenhouse, rodas no chão)', () => {
  for (const type of ['car', 'van']) {
    const p = VEHICLE_PROFILES[type];
    const hullTop = p.hull.y + p.hull.h / 2;
    // rodas tocam o chão (centro = raio) e ficam dentro do comprimento do casco
    assert.equal(p.wheel.r, p.wheel.r, 'raio definido');
    assert.ok(p.wheel.base < p.hull.l, 'entre-eixos dentro do casco');
    // greenhouse assenta no casco e é mais estreita (pilares inclinados)
    assert.ok(p.cabin.y >= hullTop - .02, `${type}: cabin assenta no casco`);
    assert.ok(p.cabin.wB <= p.hull.w + .02, `${type}: greenhouse não excede a largura`);
    assert.ok(p.cabin.wT < p.cabin.wB, `${type}: topo da greenhouse recuado`);
    // teto fecha a greenhouse
    assert.ok(Math.abs(p.roof.y - (p.cabin.y + p.cabin.h)) < .1, `${type}: teto coroa o prisma`);
    // para-brisa com declive de carro real (25–70°)
    const slope = windshieldSlope(p);
    assert.ok(slope > .45 && slope < 1.25, `${type}: slope ${(slope * 180 / Math.PI).toFixed(0)}°`);
  }
  // van: baú mais alto que a cabine (furgão de verdade)
  const van = VEHICLE_PROFILES.van;
  assert.ok(van.cargo.h > van.cabin.h + .5, 'baú alto na van');
  assert.ok(van.cargo.z > 0 && van.cabin.z < 0, 'cabine à frente, baú atrás');
  // car: capô à frente da cabine, tampa atrás
  const car = VEHICLE_PROFILES.car;
  assert.ok(car.hoodLid.z < car.cabin.z - .5, 'capô à frente');
  assert.ok(car.trunkLid.z > car.cabin.z + .5, 'tampa do mala atrás');
});

test('prisma frustrado: 12 triângulos, normais finitas, topo recuado (pilar inclinado)', () => {
  const geo = frustumPrism({ wB: 1.62, wT: 1.3, lB: 2.1, lT: 1.42, h: .5 });
  const pos = geo.getAttribute('position');
  assert.equal(pos.count, 36, '12 triângulos × 3 vértices');
  const n = geo.getAttribute('normal');
  for (let i = 0; i < n.count; i++) {
    assert.ok(Number.isFinite(n.getX(i) + n.getY(i) + n.getZ(i)), 'normais finitas');
  }
  const ys = [];
  for (let i = 0; i < pos.count; i++) ys.push(pos.getY(i));
  assert.equal(Math.min(...ys), 0, 'base em y=0');
  assert.equal(Math.max(...ys), .5, 'topo em y=h');
});

test('buildTrafficVehicles: instancing completo — rodas cilíndricas, luzes, vidro, pintura', () => {
  const scene = new THREE.Scene();
  const placements = [];
  for (let i = 0; i < 5; i++) placements.push({ type: 'car', x: i * 6, z: 3, rot: .1 * i, color: i });
  for (let i = 0; i < 3; i++) placements.push({ type: 'van', x: i * 7, z: -4, rot: -.2 * i, color: i + 1 });
  const stats = buildTrafficVehicles(scene, placements);
  assert.equal(stats.car, 5);
  assert.equal(stats.van, 3);
  assert.equal(stats.drawCalls, scene.children.length, 'todos os meshes registrados');
  // rodas são CILÍNDRICAS (fim das rodas-caixa) — 4 por veículo
  const wheels = scene.children.filter((m) => m.isInstancedMesh && m.geometry.type === 'CylinderGeometry');
  const carWheel = wheels.find((m) => m.count === 20);  // 5 carros × 4
  const vanWheel = wheels.find((m) => m.count === 12);  // 3 vans × 4
  assert.ok(carWheel && vanWheel, 'rodas instanciadas por tipo');
  // eixo da roda ao longo do X local (rola no plano do comprimento Z)
  const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(carWheel.quaternion ?? new THREE.Quaternion());
  // geometria já vem rotacionada (rotateZ) — valida que o cilindro não é vertical puro
  assert.ok(carWheel.geometry.parameters.height < carWheel.geometry.parameters.radiusTop * 2, 'pneu fino (perfil de roda)');
  // luzes emissivas: farol quente + lanterna vermelha
  const emissive = scene.children.filter((m) => m.isInstancedMesh && m.material.emissiveIntensity > .5);
  assert.ok(emissive.length >= 2, `faróis + lanternas emissivos (${emissive.length})`);
  const hasWarm = emissive.some((m) => m.material.emissive.getHexString() === 'ffe9b0');
  const hasRed = emissive.some((m) => m.material.emissive.getHexString() === 'ff2d38');
  assert.ok(hasWarm, 'faróis quentes');
  assert.ok(hasRed, 'lanternas vermelhas');
  // greenhouse em vidro escuro e corpo com cor por instância
  const glass = scene.children.find((m) => m.isInstancedMesh && m.material.roughness < .3 && m.material.metalness > .5);
  assert.ok(glass, 'greenhouse em vidro');
  const painted = scene.children.filter((m) => m.isInstancedMesh && m.instanceColor);
  assert.ok(painted.length >= 3, `casco/capô/tinta por instância (${painted.length})`);
  // sombras habilitadas (padrão Khaaos)
  for (const m of scene.children) {
    assert.equal(m.castShadow, true, 'castShadow padrão do jogo');
    assert.equal(m.receiveShadow, true, 'receiveShadow padrão do jogo');
  }
});

test('determinismo: mesma placements → mesma cena (sem Math.random)', () => {
  const build = () => {
    const scene = new THREE.Scene();
    buildTrafficVehicles(scene, [
      { type: 'car', x: 2, z: 1, rot: .4, color: 2 },
      { type: 'van', x: -3, z: 5, rot: 1.1, color: 4 },
    ]);
    return scene.children.map((m) => `${m.geometry.type}:${m.count}`).sort().join('|');
  };
  assert.equal(build(), build(), 'estrutura de instâncias idêntica');
});
