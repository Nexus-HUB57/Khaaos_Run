// Khaaos Run — Task 65 (P0): LEGIBILIDADE DO ARSENAL.
//
// Dívida registrada no Task 64: "material base da arma quase-preto (#15171a)
// some contra colete escuro em contraluz". O arsenal agora usa #1d2126 +
// emissivo frio sutil (rim-light fake) — este teste trava o contrato:
// NENHUMA arma pode ter material de metal escuro SEM emissivo.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWeaponModel } from '../src/game3d/entities3d.js';

// luminância relativa Rec. 709 (0..1) — o "quase-preto" antigo (#15171a) dá ~0.087
function luminance(color) {
  const c = color;
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

const WEAPON_IDS = ['g19', 'mp5', 'm4', 'ar47'];

// stub de canvas p/ texturas procedurais headless (camoMaterial — mesmo padrão
// dos demais testes 3D do repo)
const ctx2d = {
  fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: 'butt', font: '',
  fillRect() {}, strokeRect() {}, clearRect() {}, beginPath() {}, arc() {}, fill() {},
  moveTo() {}, lineTo() {}, stroke() {}, ellipse() {}, quadraticCurveTo() {}, closePath() {},
  bezierCurveTo() {}, save() {}, restore() {}, translate() {}, rotate() {}, scale() {},
  fillText() {}, setTransform() {}, drawImage() {},
  measureText() { return { width: 10 }; },
  createLinearGradient() { return { addColorStop() {} }; },
  createRadialGradient() { return { addColorStop() {} }; },
  getImageData: (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4).fill(128) }),
  putImageData() {}, createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
};
if (typeof globalThis.document === 'undefined') {
  globalThis.document = { createElement() { return { width: 0, height: 0, getContext: () => ctx2d }; } };
}

test('arsenal: nenhum material de metal escuro sem emissivo (legibilidade em contraluz)', () => {
  for (const id of WEAPON_IDS) {
    const g = createWeaponModel(id).group;
    const offenders = [];
    g.traverse((o) => {
      if (!o.isMesh || !o.material?.isMeshStandardMaterial) return;
      const m = o.material;
      const darkMetal = m.metalness >= .5 && luminance(m.color) < .115;
      if (darkMetal && !(m.emissiveIntensity > 0)) {
        offenders.push(`#${m.color.getHexString()} (metal ${m.metalness})`);
      }
    });
    assert.deepEqual(offenders, [], `${id}: peças escuras devem levar emissivo (rim-light fake) — ofensores: ${offenders.join(', ')}`);
  }
});

test('arsenal: peças escuras usam a nova base #1d2126 + emissivo frio', () => {
  const g = createWeaponModel('m4').group;
  const bases = [];
  g.traverse((o) => {
    if (!o.isMesh || !o.material?.isMeshStandardMaterial) return;
    const hex = o.material.color.getHexString();
    if (hex === '1d2126') bases.push(o.material);
  });
  assert.ok(bases.length >= 3, `m4 usa a base legível em ≥3 peças (achadas ${bases.length})`);
  for (const m of bases) {
    assert.ok(m.emissiveIntensity >= .3, 'rim-light fake ativo');
    assert.equal(m.emissive.getHexString(), '0e141d', 'emissivo frio (azul-aço)');
  }
});

test('arsenal: skin de raridade não perde legibilidade nem tinge a base estrutural', () => {
  const g = createWeaponModel('m4', 'LENDÁRIA').group;
  let furniture = 0, base = 0;
  g.traverse((o) => {
    if (!o.isMesh || !o.material?.isMeshStandardMaterial) return;
    if (o.material.color.getHexString() === '1d2126') base++;
    else if (o.material.emissiveIntensity > 0) furniture++;
  });
  assert.ok(base >= 3, 'base estrutural permanece legível com skin');
  assert.ok(furniture >= 0, 'skin aplicada sem lançar erro');
});

test('arsenal: todas as famílias mantêm materiais metálicos legíveis (varredura completa)', () => {
  for (const id of WEAPON_IDS) {
    const g = createWeaponModel(id).group;
    let metals = 0, legible = 0;
    g.traverse((o) => {
      if (!o.isMesh || !o.material?.isMeshStandardMaterial) return;
      if (o.material.metalness >= .5) {
        metals++;
        if (luminance(o.material.color) >= .115 || o.material.emissiveIntensity > 0) legible++;
      }
    });
    assert.equal(legible, metals, `${id}: ${legible}/${metals} materiais metálicos legíveis`);
  }
});
