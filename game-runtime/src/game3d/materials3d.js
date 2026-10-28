// Khaaos Run — Fase 26 — micro-detalle PBR ("anti-plástico").
//
// O visual "artificial" de engines low-poly vem de materiais LIMPOSOS demais:
// roughness constante, albedo chapado e ausência de quebra de micro-superfície.
// Este kit gera mapas procedurais DETERMINÍSTICOS (PRNG semeado — zero
// Math.random) de tecido/metal/concreto/pele e aplica normalMap + roughnessMap
// sutis em materiais existentes, sem tocar geometria nem silhueta.
//
// Contrato headless: em Node (sem document/canvas) `buildMicroDetailMaps`
// retorna { map:null, roughnessMap:null, normalMap:null, headless:true } e
// `applyMicroDetail` vira no-op seguro — os testes unitários cobrem os
// parâmetros puros (determinismo byte a byte) sem depender de canvas.
import * as THREE from 'three';

// PRNG determinístico (mulberry32) — mesma semente ⇒ mesmos mapas.
export function seededRng(seed = 1) {
  let a = (Number(seed) >>> 0) || 1;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Parâmetros PUROS por preset (testável headless; consumido pelo canvas e
// aplicável direto como fallback de shading quando não há mapas).
export const MICRO_PRESETS = Object.freeze({
  fabric: Object.freeze({ repeat: 3.2, roughBase: .82, roughVar: .12, normalStrength: .55, cell: 8, weave: true }),
  metal: Object.freeze({ repeat: 2.4, roughBase: .45, roughVar: .2, normalStrength: .3, cell: 16, weave: false, brushed: true }),
  concrete: Object.freeze({ repeat: 2.0, roughBase: .92, roughVar: .08, normalStrength: .7, cell: 12, weave: false }),
  plastic: Object.freeze({ repeat: 1.6, roughBase: .6, roughVar: .06, normalStrength: .15, cell: 20, weave: false }),
  skin: Object.freeze({ repeat: 2.2, roughBase: .55, roughVar: .1, normalStrength: .22, cell: 24, weave: false }),
});

export function microDetailParams(preset = 'fabric', seed = 1) {
  const resolved = MICRO_PRESETS[preset] ? preset : 'fabric';
  const base = MICRO_PRESETS[preset] ?? MICRO_PRESETS.fabric;
  const rng = seededRng(seed);
  // jitter determinístico dos parâmetros por instância (variação por ator)
  const jitter = () => (rng() - .5) * .18;
  return {
    preset: resolved,
    seed,
    repeat: Math.max(.8, base.repeat * (1 + jitter() * .3)),
    roughBase: Math.min(.98, Math.max(.25, base.roughBase + jitter() * .08)),
    roughVar: base.roughVar,
    normalStrength: base.normalStrength,
    cell: base.cell,
    weave: base.weave,
    brushed: Boolean(base.brushed),
  };
}

function makeCanvas(size) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  return c;
}

// Height field procedural → (roughnessMap, normalMap). Determinístico.
export function buildMicroDetailMaps(preset = 'fabric', seed = 1, size = 128) {
  const p = microDetailParams(preset, seed);
  const canvas = makeCanvas(size);
  if (!canvas) return { map: null, roughnessMap: null, normalMap: null, headless: true, params: p };
  const ctx = canvas.getContext('2d');
  const height = new Float32Array(size * size);
  const rng = seededRng(seed ^ 0x9e3779b9);

  // base: ruído fino + padrão do preset
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = rng();
      let h = .5 + (n - .5) * .35;
      const cell = p.cell;
      if (p.weave) {
        // trama de tecido: xadrez de fios com brilho alternado
        const wx = Math.sin((x / size) * Math.PI * 2 * cell) > 0 ? 1 : 0;
        const wy = Math.sin((y / size) * Math.PI * 2 * cell) > 0 ? 1 : 0;
        h += (wx === wy ? .18 : -.18);
      } else if (p.brushed) {
        // metal escovado: riscos horizontais
        h += Math.sin((y / size) * Math.PI * 2 * cell * 3 + n * 2) * .12;
      } else {
        // concreto/plástico: manchas de baixa frequência
        const fx = Math.sin((x / size) * Math.PI * 2 * (cell / 4) + n) * .1;
        const fy = Math.cos((y / size) * Math.PI * 2 * (cell / 4) + n) * .1;
        h += fx + fy;
      }
      height[y * size + x] = h;
    }
  }
  // ---- roughnessMap (cinza: base ± var) ----
  const rCanvas = makeCanvas(size);
  const rCtx = rCanvas.getContext('2d');
  const rImg = rCtx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const r = Math.round(Math.min(1, Math.max(0, height[i] * p.roughVar + p.roughBase)) * 255);
    rImg.data[i * 4] = r; rImg.data[i * 4 + 1] = r; rImg.data[i * 4 + 2] = r; rImg.data[i * 4 + 3] = 255;
  }
  rCtx.putImageData(rImg, 0, 0);
  // ---- normalMap (Sobel do height) ----
  const nCanvas = makeCanvas(size);
  const nCtx = nCanvas.getContext('2d');
  const nImg = nCtx.createImageData(size, size);
  const at = (x, y) => height[((y + size) % size) * size + ((x + size) % size)];
  const k = p.normalStrength * 4;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * k;
      const dy = (at(x, y + 1) - at(x, y - 1)) * k;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      nImg.data[i] = Math.round(((-dx / len) * .5 + .5) * 255) & 255;
      nImg.data[i + 1] = Math.round(((-dy / len) * .5 + .5) * 255) & 255;
      nImg.data[i + 2] = Math.round((1 / len * .5 + .5) * 255);
      nImg.data[i + 3] = 255;
    }
  }
  nCtx.putImageData(nImg, 0, 0);
  const tex = (c, srgb = false) => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(p.repeat, p.repeat);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  return { map: null, roughnessMap: tex(rCanvas), normalMap: tex(nCanvas), headless: false, params: p };
}

// Aplica micro-detalle num material EXISTENTE (no-op seguro em Node).
export function applyMicroDetail(material, { preset = 'fabric', seed = 1, size = 128 } = {}) {
  const maps = buildMicroDetailMaps(preset, seed, size);
  if (!maps.headless) {
    material.roughnessMap = maps.roughnessMap;
    material.normalMap = maps.normalMap;
    material.normalScale = new THREE.Vector2(1, 1);
    material.needsUpdate = true;
  }
  return maps.params;
}
