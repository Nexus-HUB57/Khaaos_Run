// Fase 31 — localiza o farol do W4 (Prisão do Sol da Noite) para mirar a
// câmera no smoke visual. Imprime posição mundial do beam + yaw a partir do spawn.
const ctx2d = {
  fillStyle: '#000', fillRect() {}, clearRect() {}, strokeRect() {}, beginPath() {}, closePath() {},
  moveTo() {}, lineTo() {}, arc() {}, ellipse() {}, fill() {}, stroke() {}, save() {}, restore() {},
  translate() {}, rotate() {}, scale() {}, drawImage() {}, setTransform() {}, rect() {}, clip() {},
  quadraticCurveTo() {}, bezierCurveTo() {}, fillText() {}, strokeText() {}, arcTo() {}, roundRect() {},
  measureText() { return { width: 10 }; },
  createLinearGradient() { return { addColorStop() {} }; }, createRadialGradient() { return { addColorStop() {} }; },
  getImageData() { return { data: new Uint8ClampedArray(4).fill(128) }; },
  putImageData() {}, createImageData(w, h) { return { data: new Uint8ClampedArray(w * h * 4).fill(128) }; },
};
globalThis.document = { createElement() { return { width: 0, height: 0, getContext: () => ctx2d }; } };

const { getWorldLayout } = await import('../src/game3d/sim3d.js');
const { districtDressing } = await import('../src/game3d/districts3d.js');

const seed = 'CIGKV-3D-01', scenarioId = 'Arukheea';
const layout = getWorldLayout(seed, scenarioId);
const scenario = { id: scenarioId, groundTint: '#b5c2bb', sectorNames: ['Bosque', 'Prisão', 'Cemitério', 'Marina', 'ZEX'] };
const placements = districtDressing(layout, scenario, { density: 1 });

const out = { lighthouses: [] };
for (const it of placements.items) {
  if (it.type === 'lighthouse') out.lighthouses.push({ x: it.x, z: it.z, s: it.s });
}
out.districts = layout.districts.map((d) => ({ name: d.name, cx: d.cx, cz: d.cz, r: d.r }));
const px = -150, pz = -90; // playerSpawn do Arukheea
const lh = out.lighthouses[0];
if (lh) {
  const dx = lh.x - px, dz = lh.z - pz;
  out.dist = +Math.hypot(dx, dz).toFixed(1);
  // convenção do sim: yaw = atan2(-dx, -dz) faz o ator encarar o alvo
  out.yawFromSpawn = +Math.atan2(-dx, -dz).toFixed(3);
}
console.log(JSON.stringify(out, null, 1));
