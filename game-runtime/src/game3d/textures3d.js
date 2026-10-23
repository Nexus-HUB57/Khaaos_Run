// Khaaos Run — Texturas procedurais (canvas) para materiais PBR sem assets externos.
import * as THREE from 'three';

function canvas(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')];
}
function noise(ctx, size, amount = 0.12, alpha = 0.5) {
  const img = ctx.getImageData(0, 0, size, size), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amount * 255;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
  }
  ctx.putImageData(img, 0, 0);
}
function tex(c, { repeat = 1, srgb = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Fase 4 — normal map procedural: deriva de altura por Sobel sobre o canvas de cor.
// Converte a luminância em relevo (paredes/costelas/ferrugem ganham profundidade real
// sob a luz do sol). Custo único por material (256²) — barato e sem assets externos.
function normalMapFromCanvas(srcCanvas, { strength = 1.6 } = {}) {
  const size = srcCanvas.width;
  const sctx = srcCanvas.getContext('2d');
  const src = sctx.getImageData(0, 0, size, size).data;
  const lum = (i) => (src[i] * 0.299 + src[i + 1] * 0.587 + src[i + 2] * 0.114) / 255;
  const out = document.createElement('canvas');
  out.width = out.height = size;
  const octx = out.getContext('2d');
  const img = octx.createImageData(size, size);
  const at = (x, y) => lum((((y + size) % size) * size + ((x + size) % size)) * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1))
        - (at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1));
      const dy = (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1))
        - (at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1));
      let nx = dx * strength, ny = dy * strength, nz = 1;
      const len = Math.hypot(nx, ny, nz);
      nx /= len; ny /= len; nz /= len;
      const o = (y * size + x) * 4;
      img.data[o] = (nx * .5 + .5) * 255;
      img.data[o + 1] = (ny * .5 + .5) * 255;
      img.data[o + 2] = (nz * .5 + .5) * 255;
      img.data[o + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(out);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

// Material PBR de uma passada: cor + normal derivada da própria textura.
// `repeat` aplica-se igualmente a map e normalMap para o relevo bater com a cor.
function pbr(c, { repeat = 1, rough = .9, metal = 0, strength = 1.6, extra = {} } = {}) {
  const map = tex(c, { repeat });
  const normal = normalMapFromCanvas(c, { strength });
  normal.repeat.set(repeat, repeat);
  return new THREE.MeshStandardMaterial({ map, normalMap: normal, roughness: rough, metalness: metal, ...extra });
}

// ---- concreto ----
function concreteCanvas() {
  const [c, x] = canvas(256);
  x.fillStyle = '#8d8a84'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    x.fillStyle = `rgba(${60 + Math.random() * 60},${58 + Math.random() * 58},${54 + Math.random() * 55},.18)`;
    x.beginPath(); x.arc(Math.random() * 256, Math.random() * 256, Math.random() * 7, 0, 7); x.fill();
  }
  // rachaduras
  x.strokeStyle = 'rgba(40,38,36,.35)'; x.lineWidth = 1;
  for (let i = 0; i < 8; i++) {
    x.beginPath();
    let px = Math.random() * 256, py = Math.random() * 256;
    x.moveTo(px, py);
    for (let s = 0; s < 8; s++) { px += (Math.random() - .5) * 60; py += (Math.random() - .5) * 60; x.lineTo(px, py); }
    x.stroke();
  }
  // juntas de placas
  x.strokeStyle = 'rgba(35,33,32,.5)'; x.lineWidth = 3;
  x.strokeRect(0, 0, 256, 256);
  noise(x, 256, 0.1);
  return c;
}
export function concreteTexture(repeat = 2) { return tex(concreteCanvas(), { repeat }); }
export function concreteMaterial(repeat = 2) { return pbr(concreteCanvas(), { repeat, rough: .9, strength: 2.0 }); }

// ---- metal pintado / contêiner ----
function metalCanvas(base = '#7a4a2b') {
  const [c, x] = canvas(256);
  x.fillStyle = base; x.fillRect(0, 0, 256, 256);
  // costelas verticais de contêiner
  for (let i = 0; i < 256; i += 24) {
    const g = x.createLinearGradient(i, 0, i + 24, 0);
    g.addColorStop(0, 'rgba(0,0,0,.28)'); g.addColorStop(.5, 'rgba(255,255,255,.10)'); g.addColorStop(1, 'rgba(0,0,0,.28)');
    x.fillStyle = g; x.fillRect(i, 0, 24, 256);
  }
  // ferrugem
  for (let i = 0; i < 60; i++) {
    x.fillStyle = `rgba(${120 + Math.random() * 60},${50 + Math.random() * 30},20,${0.06 + Math.random() * 0.12})`;
    x.beginPath(); x.arc(Math.random() * 256, Math.random() * 256, 3 + Math.random() * 16, 0, 7); x.fill();
  }
  noise(x, 256, 0.08);
  return c;
}
export function metalTexture(base = '#7a4a2b', repeat = 1) { return tex(metalCanvas(base), { repeat }); }
export function metalMaterial(base = '#7a4a2b', repeat = 1) { return pbr(metalCanvas(base), { repeat, rough: .6, metal: .35, strength: 1.9 }); }

// ---- terreno (terra/areia com grama seca) ----
function groundCanvas() {
  const [c, x] = canvas(512);
  x.fillStyle = '#6d5f45'; x.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 2600; i++) {
    const r = Math.random();
    x.fillStyle = r < .5 ? `rgba(96,84,58,${.2 + Math.random() * .3})`
      : r < .8 ? `rgba(120,104,72,${.15 + Math.random() * .3})`
        : `rgba(84,92,52,${.12 + Math.random() * .25})`; // manchas de grama seca
    x.beginPath(); x.arc(Math.random() * 512, Math.random() * 512, 2 + Math.random() * 22, 0, 7); x.fill();
  }
  // pedrinhas
  for (let i = 0; i < 300; i++) {
    x.fillStyle = `rgba(${90 + Math.random() * 50},${86 + Math.random() * 46},${80 + Math.random() * 40},.5)`;
    x.fillRect(Math.random() * 512, Math.random() * 512, 1 + Math.random() * 3, 1 + Math.random() * 3);
  }
  noise(x, 512, 0.09);
  return c;
}
export function groundTexture(repeat = 28) { return tex(groundCanvas(), { repeat }); }
export function groundMaterial(repeat = 28) { return pbr(groundCanvas(), { repeat, rough: .95, strength: 1.5 }); }

// ---- asfalto (praças/estradas) ----
function asphaltCanvas() {
  const [c, x] = canvas(256);
  x.fillStyle = '#3c3d40'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1400; i++) {
    x.fillStyle = `rgba(${Math.random() < .5 ? 20 : 78},${Math.random() < .5 ? 20 : 78},${Math.random() < .5 ? 22 : 82},.22)`;
    x.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 4, 1 + Math.random() * 4);
  }
  noise(x, 256, 0.07);
  return c;
}
export function asphaltTexture(repeat = 6) { return tex(asphaltCanvas(), { repeat }); }
export function asphaltMaterial(repeat = 6) { return pbr(asphaltCanvas(), { repeat, rough: .9, strength: 1.7 }); }

// ---- nuvem (sprite com alpha procedural) ----
export function cloudTexture() {
  const [c, x] = canvas(256);
  x.clearRect(0, 0, 256, 256);
  for (let i = 0; i < 26; i++) {
    const cx = 40 + Math.random() * 176, cy = 90 + Math.random() * 76;
    const r = 18 + Math.random() * 42;
    const g = x.createRadialGradient(cx, cy, 2, cx, cy, r);
    const a = .05 + Math.random() * .09;
    g.addColorStop(0, `rgba(236,222,214,${a})`);
    g.addColorStop(1, 'rgba(236,222,214,0)');
    x.fillStyle = g;
    x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---- janelas de prédio (emissivas fracas) ----
export function windowsTexture() {
  const [c, x] = canvas(256);
  x.fillStyle = '#2e3238'; x.fillRect(0, 0, 256, 256);
  for (let wy = 10; wy < 246; wy += 32) {
    for (let wx = 8; wx < 246; wx += 28) {
      const lit = Math.random();
      x.fillStyle = lit < .12 ? '#ffd28a' : lit < .3 ? '#5a6b78' : '#1a2026';
      x.fillRect(wx, wy, 18, 22);
      x.strokeStyle = 'rgba(0,0,0,.6)'; x.lineWidth = 2;
      x.strokeRect(wx, wy, 18, 22);
    }
  }
  return tex(c, {});
}

// ---- caixa de madeira ----
export function crateTexture() {
  const [c, x] = canvas(128);
  x.fillStyle = '#8a6a3f'; x.fillRect(0, 0, 128, 128);
  x.strokeStyle = 'rgba(60,42,20,.8)'; x.lineWidth = 4;
  x.strokeRect(4, 4, 120, 120);
  x.beginPath(); x.moveTo(4, 4); x.lineTo(124, 124); x.moveTo(124, 4); x.lineTo(4, 124); x.stroke();
  for (let i = 0; i < 40; i++) {
    x.strokeStyle = `rgba(70,50,26,${.1 + Math.random() * .2})`; x.lineWidth = 1;
    x.beginPath(); const y = Math.random() * 128; x.moveTo(0, y); x.lineTo(128, y + (Math.random() - .5) * 8); x.stroke();
  }
  noise(x, 128, 0.1);
  return tex(c, {});
}

// ---- grama (plano cruzado com alpha) ----
export function grassBladeTexture() {
  const [c, x] = canvas(64);
  x.clearRect(0, 0, 64, 64);
  for (let i = 0; i < 14; i++) {
    const bx = 6 + Math.random() * 52;
    const h = 26 + Math.random() * 34;
    const g = x.createLinearGradient(0, 64, 0, 64 - h);
    g.addColorStop(0, '#4a5a28'); g.addColorStop(1, '#7d8f3e');
    x.fillStyle = g;
    x.beginPath();
    x.moveTo(bx - 2, 64);
    x.quadraticCurveTo(bx + (Math.random() - .5) * 14, 64 - h * .6, bx + (Math.random() - .5) * 20, 64 - h);
    x.quadraticCurveTo(bx + 2 + (Math.random() - .5) * 8, 64 - h * .5, bx + 2, 64);
    x.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---- sprite radial (muzzle flash, glow) ----
export function radialSprite(inner = 'rgba(255,214,140,1)', outer = 'rgba(255,120,30,0)') {
  const [c, x] = canvas(128);
  const g = x.createRadialGradient(64, 64, 2, 64, 64, 62);
  g.addColorStop(0, inner);
  g.addColorStop(.35, inner.replace(/,1\)$/, ',.55)'));
  g.addColorStop(1, outer);
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---- label de nome (nametag) ----
export function labelSprite(text, color = '#e8e3d5') {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const x = c.getContext('2d');
  x.font = 'bold 28px "Rajdhani", "Share Tech Mono", monospace';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = 'rgba(8,8,12,.55)';
  const w = x.measureText(text).width + 26;
  x.fillRect(128 - w / 2, 8, w, 46);
  x.fillStyle = color;
  x.fillText(text, 128, 33);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
