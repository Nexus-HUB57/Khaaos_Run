// Auditoria Fase 51 — tris por operativa × subtree (tronco/braços/pernas/cabeça)
// para dimensionar o slim plate carrier sem estourar o gate ≤6500.
const ctx2d = {
  fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1,
  fillRect() {}, clearRect() {}, beginPath() {}, arc() {}, fill() {}, stroke() {},
  ellipse() {}, moveTo() {}, lineTo() {}, quadraticCurveTo() {}, closePath() {},
  save() {}, restore() {}, translate() {},
  createLinearGradient() { return { addColorStop() {} }; },
  createRadialGradient() { return { addColorStop() {} }; },
  getImageData: () => ({ data: new Uint8ClampedArray(4).fill(128) }),
  createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
  putImageData() {}, measureText: () => ({ width: 10 }),
};
if (typeof globalThis.document === 'undefined') {
  globalThis.document = { createElement() { return { width: 0, height: 0, getContext: () => ctx2d }; } };
}
const { createOperative } = await import('../src/game3d/entities3d.js');
const { CANON } = await import('../src/game3d/heads3d.js');

const tri = (g) => { let n = 0; g.traverse((o) => { if (o.isMesh) n += o.geometry.index ? o.geometry.index.count / 3 : o.geometry.attributes.position.count / 3; }); return n; };
const sub = (root, pred) => { const grp = new (root.constructor)(); /* count only matching subtree */ let n = 0; root.traverse((o) => { if (o.isMesh && pred(o)) n += o.geometry.index ? o.geometry.index.count / 3 : o.geometry.attributes.position.count / 3; }); return n; };

const ids = [...Object.keys(CANON)];
let worst = null, min = 1e9, max = 0;
for (const id of ids) {
  const { group } = createOperative({ variant: id, skin: '#d9a06b', eye: '#f59e0b', hair: '#171717', helmet: true });
  const total = tri(group);
  // head subtree = torso children whose userData.canon exists (head group)
  let head = 0, arms = 0, rest = 0;
  group.traverse((o) => {
    if (!o.isMesh) return;
    const n = o.geometry.index ? o.geometry.index.count / 3 : o.geometry.attributes.position.count / 3;
    if (o.parent && o.parent.userData && o.parent.userData.canon) head += n;
    else if (o.userData.baseHeadGear) head += n;
    else rest += n;
  });
  if (total > max) { max = total; worst = id; }
  if (total < min) min = total;
  console.log(`${id.padEnd(34)} total ${String(Math.round(total)).padStart(5)}  head~${Math.round(head)}`);
}
console.log(`\nmin ${Math.round(min)} · max ${Math.round(max)} (${worst}) · gate 6500 · headroom ${(6500 - max).toFixed(0)}`);
