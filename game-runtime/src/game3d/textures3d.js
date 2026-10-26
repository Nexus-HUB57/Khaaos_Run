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
export function groundMaterial(repeat = 28, tint = null) {
  return pbr(groundCanvas(), { repeat, rough: .95, strength: 1.5, extra: tint ? { color: new THREE.Color(tint) } : {} });
}

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

// ---- Fase 7 — sombra de contato (blob) ----
// Gradiente radial escuro aplicado em planos sob props/árvores/pedras: ancora os
// objetos no chão mesmo onde o shadow map do sol não alcança com nitidez.
let _contactShadowTex = null;
export function contactShadowTexture() {
  if (_contactShadowTex) return _contactShadowTex;
  const [c, x] = canvas(128);
  const g = x.createRadialGradient(64, 64, 4, 64, 64, 62);
  g.addColorStop(0, 'rgba(8,9,12,0.62)');
  g.addColorStop(0.55, 'rgba(8,9,12,0.34)');
  g.addColorStop(1, 'rgba(8,9,12,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  _contactShadowTex = new THREE.CanvasTexture(c);
  _contactShadowTex.colorSpace = THREE.SRGBColorSpace;
  return _contactShadowTex;
}


// ===========================================================================
// Fase 6 — biblioteca de realismo: camuflagem, rosto, viação e props.
// Todos os materiais passam por cache (memo) — 16 operativos NÃO regeneram canvas.
// ===========================================================================
const _memo = new Map();
function memo(key, factory) {
  if (!_memo.has(key)) _memo.set(key, factory());
  return _memo.get(key);
}

// ---- camuflagem (manchas orgânicas + trama de tecido) ----
// paletas: 0 woodland, 1 deserto, 2 urbano, 3 noturno
const CAMO_PALETTES = [
  ['#3d4a2a', '#2a3520', '#5a6b3c', '#20281a'],
  ['#a89468', '#8a7548', '#c2b183', '#6e5a34'],
  ['#5c6066', '#3f434a', '#7b8087', '#2e3238'],
  ['#23262c', '#181a1f', '#31353d', '#101216'],
];
function camoCanvas(palette = 0) {
  const [c, x] = canvas(256);
  const pal = CAMO_PALETTES[palette % CAMO_PALETTES.length];
  x.fillStyle = pal[0]; x.fillRect(0, 0, 256, 256);
  // manchas orgânicas em 3 camadas
  for (let layer = 1; layer < 4; layer++) {
    x.fillStyle = pal[layer];
    for (let i = 0; i < 14; i++) {
      const cx = Math.random() * 256, cy = Math.random() * 256;
      const r = 14 + Math.random() * 30;
      x.beginPath();
      // blob irregular (8 vértices com raio ruidoso) — sem emendas no tile
      for (let k = 0; k <= 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const rr = r * (.7 + Math.random() * .5);
        const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr;
        k === 0 ? x.moveTo(px, py) : x.lineTo(px, py);
      }
      x.closePath(); x.fill();
      // réplica nas 4 bordas p/ tiling sem emenda
      for (const [ox, oy] of [[-256, 0], [256, 0], [0, -256], [0, 256], [-256, -256], [256, 256], [-256, 256], [256, -256]]) {
        x.save(); x.translate(ox, oy); x.fill(); x.restore();
      }
    }
  }
  // trama de tecido (linhas finas verticais/horizontais)
  x.globalAlpha = .1;
  for (let i = 0; i < 256; i += 4) {
    x.fillStyle = '#000'; x.fillRect(i, 0, 1, 256);
    x.fillStyle = '#fff'; x.fillRect(0, i, 256, 1);
  }
  x.globalAlpha = 1;
  noise(x, 256, 0.07);
  return c;
}
export function camoMaterial(palette = 0, { repeat = 1.6 } = {}) {
  return memo(`camo${palette}`, () => pbr(camoCanvas(palette), { repeat, rough: .92, strength: 1.1 }));
}

// ---- Fase 9 — pele realista: poros no roughness + pseudo-SSS ----
// roughnessMap com poros/manchas quebra o aspecto "plástico" do MeshStandardMaterial
// liso; o emissive na própria cor da pele aquece as sombras (aproximação barata de
// subsurface scattering). Memoizado por tom — 16 operativos não regeneram canvas.
export function skinMaterial(skin = '#d9a06b') {
  return memo(`skin:${skin}`, () => {
    const [c, x] = canvas(128);
    // base neutra (roughness médio); poros = pontos mais ásperos (claros)
    x.fillStyle = '#9a9a9a'; x.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 900; i++) {
      const a = .10 + Math.random() * .16;
      x.fillStyle = Math.random() < .62 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a * .8})`;
      x.beginPath(); x.arc(Math.random() * 128, Math.random() * 128, .6 + Math.random() * 1.3, 0, 7); x.fill();
    }
    // manchas macias de oleosidade (testa/nariz ficam mais "brilhantes")
    for (let i = 0; i < 26; i++) {
      const g = x.createRadialGradient(64, 64, 2, 32 + Math.random() * 64, 32 + Math.random() * 64, 8 + Math.random() * 20);
      g.addColorStop(0, 'rgba(255,255,255,0.10)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.fillRect(0, 0, 128, 128);
    }
    const rough = new THREE.CanvasTexture(c);
    rough.wrapS = rough.wrapT = THREE.RepeatWrapping;
    return new THREE.MeshStandardMaterial({
      color: skin,
      roughness: .58, roughnessMap: rough,
      metalness: 0,
      emissive: new THREE.Color(skin), emissiveIntensity: .038, // pseudo-SSS
    });
  });
}

// ---- rosto pintado (olhos, sobrancelhas, sombreado) ----
export function faceTexture(skin = '#d9a06b', eyes = '#f59e0b', hair = '#171717') {
  return memo(`face:${skin}:${eyes}:${hair}`, () => {
    const [c, x] = canvas(128);
    x.fillStyle = skin; x.fillRect(0, 0, 128, 128);
    // sombreado lateral + bochechas
    const shade = x.createLinearGradient(0, 0, 128, 0);
    shade.addColorStop(0, 'rgba(0,0,0,.28)'); shade.addColorStop(.25, 'rgba(0,0,0,0)');
    shade.addColorStop(.78, 'rgba(0,0,0,0)'); shade.addColorStop(1, 'rgba(0,0,0,.24)');
    x.fillStyle = shade; x.fillRect(0, 0, 128, 128);
    // sombra da testa/olheiras
    x.fillStyle = 'rgba(0,0,0,.12)'; x.fillRect(0, 34, 128, 6);
    // Fase 9 — modelagem facial por luz: pómulos iluminados, sombra sob
    // maçãs do rosto e no queixo; quebra a máscara plana do rosto
    for (const cx of [34, 94]) {
      const glow = x.createRadialGradient(cx, 74, 2, cx, 74, 16);
      glow.addColorStop(0, 'rgba(255,236,214,0.14)'); glow.addColorStop(1, 'rgba(255,236,214,0)');
      x.fillStyle = glow; x.fillRect(0, 0, 128, 128);
      x.fillStyle = 'rgba(40,22,14,0.16)'; // sombra sub-malar
      x.beginPath(); x.ellipse(cx, 86, 13, 6, 0, 0, 7); x.fill();
    }
    const jaw = x.createLinearGradient(0, 92, 0, 128);
    jaw.addColorStop(0, 'rgba(0,0,0,0)'); jaw.addColorStop(1, 'rgba(30,16,10,0.30)');
    x.fillStyle = jaw; x.fillRect(0, 92, 128, 36);
    // olhos
    const eyeY = 58;
    for (const ex of [40, 88]) {
      x.fillStyle = '#f5f0e8'; x.beginPath(); x.ellipse(ex, eyeY, 9, 5.5, 0, 0, 7); x.fill();
      const iris = x.createRadialGradient(ex - 1.4, eyeY - 1.4, .8, ex, eyeY, 4.6);
      iris.addColorStop(0, eyes); iris.addColorStop(1, '#10100e');
      x.fillStyle = iris; x.beginPath(); x.arc(ex, eyeY, 4.4, 0, 7); x.fill();
      x.fillStyle = '#10100e'; x.beginPath(); x.arc(ex, eyeY, 2.1, 0, 7); x.fill();
      x.fillStyle = 'rgba(255,255,255,0.85)'; // reflexo — olho "vivo"
      x.beginPath(); x.arc(ex - 1.8, eyeY - 1.8, 1.1, 0, 7); x.fill();
      // sobrancelha
      x.strokeStyle = hair; x.lineWidth = 3.4; x.beginPath();
      x.moveTo(ex - 11, eyeY - 10); x.quadraticCurveTo(ex, eyeY - 14, ex + 11, eyeY - 9); x.stroke();
    }
    // nariz + boca
    x.strokeStyle = 'rgba(0,0,0,.3)'; x.lineWidth = 2.6;
    x.beginPath(); x.moveTo(64, 62); x.quadraticCurveTo(60, 80, 64, 84); x.stroke();
    x.strokeStyle = 'rgba(70,30,20,.65)'; x.lineWidth = 3;
    x.beginPath(); x.moveTo(50, 98); x.quadraticCurveTo(64, 104, 78, 98); x.stroke();
    x.fillStyle = 'rgba(150,64,52,0.28)'; // lábio inferior — volume
    x.beginPath(); x.ellipse(64, 102, 10, 3.2, 0, 0, 7); x.fill();
    // barba/crocante sutil (tom do cabelo, alpha baixo)
    x.globalAlpha = .35; x.fillStyle = hair;
    x.fillRect(30, 92, 68, 26);
    x.globalAlpha = 1;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

// ---- estrada com faixas (central amarela tracejada + bordas brancas) ----
function roadCanvas() {
  const [c, x] = canvas(256);
  x.fillStyle = '#37383c'; x.fillRect(0, 0, 256, 256);
  // agregado
  for (let i = 0; i < 1500; i++) {
    x.fillStyle = `rgba(${Math.random() < .5 ? 18 : 70},${Math.random() < .5 ? 18 : 70},${Math.random() < .5 ? 20 : 74},.2)`;
    x.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 3, 1 + Math.random() * 3);
  }
  // remendos de asfalto
  for (let i = 0; i < 5; i++) {
    x.fillStyle = 'rgba(24,25,28,.5)';
    x.fillRect(Math.random() * 200, Math.random() * 200, 20 + Math.random() * 50, 14 + Math.random() * 30);
  }
  // rachaduras
  x.strokeStyle = 'rgba(14,14,16,.5)'; x.lineWidth = 1.2;
  for (let i = 0; i < 6; i++) {
    x.beginPath(); let px = Math.random() * 256, py = Math.random() * 256; x.moveTo(px, py);
    for (let s = 0; s < 6; s++) { px += (Math.random() - .5) * 50; py += (Math.random() - .5) * 50; x.lineTo(px, py); }
    x.stroke();
  }
  // bordas brancas contínuas (verticais no tile)
  x.fillStyle = 'rgba(228,226,216,.75)';
  x.fillRect(6, 0, 4, 256); x.fillRect(246, 0, 4, 256);
  // faixa central amarela tracejada
  x.fillStyle = 'rgba(214,178,52,.85)';
  for (let y = 0; y < 256; y += 64) x.fillRect(124, y, 8, 36);
  noise(x, 256, 0.06);
  return c;
}
export function roadMaterial() {
  return memo('road', () => pbr(roadCanvas(), { repeat: 1, rough: .88, strength: 1.5 }));
}

// ---- calçada (lajes de concreto com juntas) ----
function sidewalkCanvas() {
  const [c, x] = canvas(256);
  x.fillStyle = '#8f8b82'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 700; i++) {
    x.fillStyle = `rgba(${70 + Math.random() * 50},${66 + Math.random() * 48},${60 + Math.random() * 44},.16)`;
    x.beginPath(); x.arc(Math.random() * 256, Math.random() * 256, Math.random() * 5, 0, 7); x.fill();
  }
  // juntas de lajes 64px
  x.strokeStyle = 'rgba(52,50,46,.55)'; x.lineWidth = 3;
  for (let i = 0; i <= 256; i += 64) {
    x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 256); x.moveTo(0, i); x.lineTo(256, i); x.stroke();
  }
  noise(x, 256, 0.08);
  return c;
}
export function sidewalkMaterial() {
  return memo('sidewalk', () => pbr(sidewalkCanvas(), { repeat: 1, rough: .92, strength: 1.8 }));
}

// ---- faixa de pedestre (alpha) ----
export function crosswalkTexture() {
  return memo('crosswalk', () => {
    const [c, x] = canvas(128);
    x.clearRect(0, 0, 128, 128);
    x.fillStyle = 'rgba(226,222,210,.82)';
    for (let i = 8; i < 128; i += 32) x.fillRect(i, 0, 16, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

// ---- barril (metal com anéis) ----
export function barrelMaterial(base = '#4a5545') {
  return memo(`barrel:${base}`, () => {
    const [c, x] = canvas(128);
    x.fillStyle = base; x.fillRect(0, 0, 128, 128);
    for (const y of [18, 64, 110]) {
      const g = x.createLinearGradient(0, y - 8, 0, y + 8);
      g.addColorStop(0, 'rgba(0,0,0,.35)'); g.addColorStop(.5, 'rgba(255,255,255,.14)'); g.addColorStop(1, 'rgba(0,0,0,.35)');
      x.fillStyle = g; x.fillRect(0, y - 8, 128, 16);
    }
    for (let i = 0; i < 26; i++) {
      x.fillStyle = `rgba(${110 + Math.random() * 50},${58 + Math.random() * 26},18,${.08 + Math.random() * .14})`;
      x.beginPath(); x.arc(Math.random() * 128, Math.random() * 128, 2 + Math.random() * 8, 0, 7); x.fill();
    }
    noise(x, 128, 0.08);
    return pbr(c, { repeat: 1, rough: .62, metal: .45, strength: 1.4 });
  });
}

// ---- saco de areia (pana tosca) ----
export function sandbagMaterial() {
  return memo('sandbag', () => {
    const [c, x] = canvas(128);
    x.fillStyle = '#7d7354'; x.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 500; i++) {
      x.fillStyle = `rgba(${120 + Math.random() * 30},${108 + Math.random() * 26},${74 + Math.random() * 20},.2)`;
      x.fillRect(Math.random() * 128, Math.random() * 128, 2 + Math.random() * 4, 1 + Math.random() * 2);
    }
    x.strokeStyle = 'rgba(60,54,36,.5)'; x.lineWidth = 2;
    for (let i = 0; i < 5; i++) { x.beginPath(); x.moveTo(0, i * 26 + 13); x.lineTo(128, i * 26 + 9); x.stroke(); }
    noise(x, 128, 0.1);
    return pbr(c, { repeat: 1, rough: .96, strength: 1.6 });
  });
}

// ---- palete de madeira ----
export function palletMaterial() {
  return memo('pallet', () => {
    const [c, x] = canvas(128);
    x.fillStyle = '#6e5433'; x.fillRect(0, 0, 128, 128);
    x.fillStyle = '#5a4426';
    for (let i = 0; i < 128; i += 22) x.fillRect(0, i, 128, 14); // tábuas
    for (let i = 0; i < 30; i++) {
      x.strokeStyle = `rgba(40,28,12,${.15 + Math.random() * .2})`; x.lineWidth = 1;
      const y = Math.random() * 128;
      x.beginPath(); x.moveTo(0, y); x.lineTo(128, y + (Math.random() - .5) * 6); x.stroke();
    }
    noise(x, 128, 0.09);
    return pbr(c, { repeat: 1, rough: .9, strength: 1.8 });
  });
}

// ---- placa de setor (metal com texto) ----
export function signTexture(text = 'SETOR', accent = '#c8ff3d') {
  return memo(`sign:${text}:${accent}`, () => {
    const c = document.createElement('canvas');
    c.width = 256; c.height = 64;
    const x = c.getContext('2d');
    x.fillStyle = '#20242a'; x.fillRect(0, 0, 256, 64);
    x.strokeStyle = accent; x.lineWidth = 4; x.strokeRect(3, 3, 250, 58);
    x.font = 'bold 30px "Rajdhani", "Share Tech Mono", monospace';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = accent; x.fillText(text, 128, 34);
    // parafusos
    x.fillStyle = '#565d66';
    for (const [px, py] of [[10, 10], [246, 10], [10, 54], [246, 54]]) { x.beginPath(); x.arc(px, py, 3.4, 0, 7); x.fill(); }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

// ---- cordilheira de fundo (silhueta com alpha) ----
export function mountainTexture(tint = '#3a2438') {
  return memo(`mountain:${tint}`, () => {
    const [c, x] = canvas(512);
    x.clearRect(0, 0, 512, 512);
    // aceita '#rrggbb' e 'rgb(r,g,b)' — converte via THREE.Color
    let col;
    try { col = new THREE.Color(tint); } catch { col = new THREE.Color('#3a2438'); }
    const hex = col.getHexString();
    const base = [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
    // 2 camadas de cristas
    for (const [hBase, alpha] of [[150, 1], [90, .7]]) {
      x.beginPath(); x.moveTo(0, 512);
      let px = 0;
      x.lineTo(0, 512 - hBase - 40);
      while (px < 512) {
        px += 30 + Math.random() * 55;
        const peak = 512 - hBase - Math.random() * 70;
        x.lineTo(px, peak);
      }
      x.lineTo(512, 512); x.closePath();
      const g = x.createLinearGradient(0, 512 - hBase - 90, 0, 512);
      g.addColorStop(0, `rgba(${base[0]},${base[1]},${base[2]},${alpha})`);
      g.addColorStop(1, `rgba(${base[0]},${base[1]},${base[2]},${alpha * .55})`);
      x.fillStyle = g; x.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}

// ---- vidro de óculos tático (material escuro reflexivo) ----
export function goggleMaterial() {
  return memo('goggle', () => new THREE.MeshStandardMaterial({
    color: '#101418', roughness: .18, metalness: .5,
    emissive: '#2a4a58', emissiveIntensity: .35,
  }));
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
