// Diagnóstico F25: lado da folha aberta em TODAS as portas de um cenário.
// Verificação MATEMÁTICA (sem THREE): replica a transformação do pivot.
import * as THREE from 'three';
import { buildScene } from '../src/game3d/world3d.js';

const ctx2dStub = () => ({
  fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: 'butt', font: '',
  fillRect() {}, strokeRect() {}, clearRect() {}, beginPath() {}, arc() {}, fill() {},
  moveTo() {}, lineTo() {}, stroke() {}, ellipse() {}, quadraticCurveTo() {}, closePath() {},
  bezierCurveTo() {}, save() {}, restore() {}, translate() {}, rotate() {}, scale() {},
  fillText() {}, setTransform() {}, drawImage() {},
  measureText: () => ({ width: 10 }),
  createLinearGradient: () => ({ addColorStop() {} }),
  createRadialGradient: () => ({ addColorStop() {} }),
  getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4).fill(128) }),
  putImageData() {}, createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
});
globalThis.document = { createElement() { return { width: 0, height: 0, getContext: ctx2dStub }; } };

const { scene, layout } = buildScene(4242, 'CIGKV', null, 'high');
const reg = scene.userData.interiors;
scene.updateMatrixWorld(true); // transformações de mundo atualizadas p/ Box3

let fora = 0;
for (const [id, h] of reg.doors) {
  const door = layout.doors.find((d) => d.id === id);
  const dotOf = () => {
    const box = new THREE.Box3().setFromObject(h.leaf);
    const c = box.getCenter(new THREE.Vector3());
    return (c.x - door.x) * door.nx + (c.z - door.z) * door.nz;
  };
  // fechada: centro ~no plano do vão (|dot| pequeno)
  h.target = 0;
  for (let i = 0; i < 120; i++) for (const fn of reg.animators) fn(1 / 60, i / 60);
  scene.updateMatrixWorld(true);
  const dot0 = dotOf();
  // aberta: centro deve migrar PARA DENTRO (dot negativo)
  h.target = 1.92;
  for (let i = 0; i < 120; i++) for (const fn of reg.animators) fn(1 / 60, i / 60);
  scene.updateMatrixWorld(true);
  const dot1 = dotOf();
  const ok = dot1 < -0.05 && Math.abs(dot0) < 0.3;
  if (!ok) fora++;
  console.log(`${id} (${door.kind}) fechada dot=${dot0.toFixed(2)} | aberta dot=${dot1.toFixed(2)} ${ok ? 'DENTRO ✓' : 'FORA ✗'}`);
}
console.log(fora === 0 ? 'TODAS ABREM PARA DENTRO ✓' : `${fora} folhas com problema ✗`);
