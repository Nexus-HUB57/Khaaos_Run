// Khaaos Run — Texturas procedurais (canvas) para materiais PBR sem assets externos.
import * as THREE from 'three';

// PRNG estável: a aparência procedural não pode mudar a cada reload ou entre
// clientes. O estado é privado ao módulo e não participa da simulação/gameplay.
let textureSeed = 0x4b52554e;
function random() {
  textureSeed = (textureSeed * 1664525 + 1013904223) >>> 0;
  return textureSeed / 0x100000000;
}

function canvas(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')];
}
function noise(ctx, size, amount = 0.12, alpha = 0.5) {
  const img = ctx.getImageData(0, 0, size, size), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (random() - 0.5) * amount * 255;
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
    x.fillStyle = `rgba(${60 + random() * 60},${58 + random() * 58},${54 + random() * 55},.18)`;
    x.beginPath(); x.arc(random() * 256, random() * 256, random() * 7, 0, 7); x.fill();
  }
  // rachaduras
  x.strokeStyle = 'rgba(40,38,36,.35)'; x.lineWidth = 1;
  for (let i = 0; i < 8; i++) {
    x.beginPath();
    let px = random() * 256, py = random() * 256;
    x.moveTo(px, py);
    for (let s = 0; s < 8; s++) { px += (random() - .5) * 60; py += (random() - .5) * 60; x.lineTo(px, py); }
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
    x.fillStyle = `rgba(${120 + random() * 60},${50 + random() * 30},20,${0.06 + random() * 0.12})`;
    x.beginPath(); x.arc(random() * 256, random() * 256, 3 + random() * 16, 0, 7); x.fill();
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
    const r = random();
    x.fillStyle = r < .5 ? `rgba(96,84,58,${.2 + random() * .3})`
      : r < .8 ? `rgba(120,104,72,${.15 + random() * .3})`
        : `rgba(84,92,52,${.12 + random() * .25})`; // manchas de grama seca
    x.beginPath(); x.arc(random() * 512, random() * 512, 2 + random() * 22, 0, 7); x.fill();
  }
  // pedrinhas
  for (let i = 0; i < 300; i++) {
    x.fillStyle = `rgba(${90 + random() * 50},${86 + random() * 46},${80 + random() * 40},.5)`;
    x.fillRect(random() * 512, random() * 512, 1 + random() * 3, 1 + random() * 3);
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
    x.fillStyle = `rgba(${random() < .5 ? 20 : 78},${random() < .5 ? 20 : 78},${random() < .5 ? 22 : 82},.22)`;
    x.fillRect(random() * 256, random() * 256, 1 + random() * 4, 1 + random() * 4);
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
    const cx = 40 + random() * 176, cy = 90 + random() * 76;
    const r = 18 + random() * 42;
    const g = x.createRadialGradient(cx, cy, 2, cx, cy, r);
    const a = .05 + random() * .09;
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
      const lit = random();
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
    x.strokeStyle = `rgba(70,50,26,${.1 + random() * .2})`; x.lineWidth = 1;
    x.beginPath(); const y = random() * 128; x.moveTo(0, y); x.lineTo(128, y + (random() - .5) * 8); x.stroke();
  }
  noise(x, 128, 0.1);
  return tex(c, {});
}

// ---- grama (plano cruzado com alpha) ----
export function grassBladeTexture() {
  const [c, x] = canvas(64);
  x.clearRect(0, 0, 64, 64);
  for (let i = 0; i < 14; i++) {
    const bx = 6 + random() * 52;
    const h = 26 + random() * 34;
    const g = x.createLinearGradient(0, 64, 0, 64 - h);
    g.addColorStop(0, '#4a5a28'); g.addColorStop(1, '#7d8f3e');
    x.fillStyle = g;
    x.beginPath();
    x.moveTo(bx - 2, 64);
    x.quadraticCurveTo(bx + (random() - .5) * 14, 64 - h * .6, bx + (random() - .5) * 20, 64 - h);
    x.quadraticCurveTo(bx + 2 + (random() - .5) * 8, 64 - h * .5, bx + 2, 64);
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
      const cx = random() * 256, cy = random() * 256;
      const r = 14 + random() * 30;
      x.beginPath();
      // blob irregular (8 vértices com raio ruidoso) — sem emendas no tile
      for (let k = 0; k <= 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const rr = r * (.7 + random() * .5);
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
      const a = .10 + random() * .16;
      x.fillStyle = random() < .62 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a * .8})`;
      x.beginPath(); x.arc(random() * 128, random() * 128, .6 + random() * 1.3, 0, 7); x.fill();
    }
    // manchas macias de oleosidade (testa/nariz ficam mais "brilhantes")
    for (let i = 0; i < 26; i++) {
      const g = x.createRadialGradient(64, 64, 2, 32 + random() * 64, 32 + random() * 64, 8 + random() * 20);
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
// Fase 12 — blendshapes faciais: cada expressão é uma VARIANTE da textura do
// rosto (mesma base de sombreado/anatomia, olhos-sobrancelhas-boca redesenha-
// dos). `expression`: 'neutral' | 'blink' | 'pain' | 'shout' | 'death' |
// 'knocked'. Memoizada por combo+expressão — trocar map no rig é barato.
export function faceTexture(skin = '#d9a06b', eyes = '#f59e0b', hair = '#171717', expression = 'neutral') {
  return memo(`face:${skin}:${eyes}:${hair}:${expression}`, () => {
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
    // ---- olhos/sobrancelhas/boca por expressão (Fase 12) ----
    const eyeY = 58;
    const lid = (ex, close) => { // pálpebra: pele + linha do cílio
      if (close <= 0) return;
      x.fillStyle = skin; x.beginPath(); x.ellipse(ex, eyeY - close * 2.6, 10, close * 3.4, 0, 0, 7); x.fill();
      x.strokeStyle = 'rgba(20,14,10,.75)'; x.lineWidth = 1.6; x.beginPath();
      x.moveTo(ex - 8, eyeY - close * 1.5); x.quadraticCurveTo(ex, eyeY - close * 4, ex + 8, eyeY - close * 1.5); x.stroke();
    };
    const brows = (dy, tilt) => { // tilt: + = inner UP (preocupação), − = franzida
      x.strokeStyle = hair; x.lineWidth = 3.4;
      for (const [ex, mir] of [[40, 1], [88, -1]]) {
        x.beginPath();
        x.moveTo(ex - 11, eyeY - 10 + dy - tilt * mir);
        x.quadraticCurveTo(ex, eyeY - 14 + dy, ex + 11, eyeY - 9 + dy + tilt * mir);
        x.stroke();
      }
    };
    const eyePair = (open = 1, pupilLift = 0, wide = 1) => {
      for (const ex of [40, 88]) {
        if (open > .25) {
          x.fillStyle = '#f5f0e8'; x.beginPath(); x.ellipse(ex, eyeY, 9 * wide, 5.5 * open * wide, 0, 0, 7); x.fill();
          const iris = x.createRadialGradient(ex - 1.4, eyeY - 1.4 - pupilLift, .8, ex, eyeY - pupilLift, 4.6);
          iris.addColorStop(0, eyes); iris.addColorStop(1, '#10100e');
          x.fillStyle = iris; x.beginPath(); x.arc(ex, eyeY - pupilLift, 4.4, 0, 7); x.fill();
          x.fillStyle = '#10100e'; x.beginPath(); x.arc(ex, eyeY - pupilLift, 2.1, 0, 7); x.fill();
          x.fillStyle = 'rgba(255,255,255,0.85)'; // reflexo — olho "vivo"
          x.beginPath(); x.arc(ex - 1.8, eyeY - 1.8 - pupilLift, 1.1, 0, 7); x.fill();
        }
        lid(ex, 1 - open);
      }
    };
    const mouth = (open = 0, curve = 0, grit = false) => {
      x.strokeStyle = 'rgba(0,0,0,.3)'; x.lineWidth = 2.6;
      x.beginPath(); x.moveTo(64, 62); x.quadraticCurveTo(60, 80, 64, 84); x.stroke();
      if (grit) { // dentes cerrados
        x.fillStyle = '#e8e2d6'; x.fillRect(50, 94, 28, 7);
        x.strokeStyle = 'rgba(60,40,30,.8)'; x.lineWidth = 1.2;
        for (let gx = 54; gx <= 74; gx += 5) { x.beginPath(); x.moveTo(gx, 94); x.lineTo(gx, 101); x.stroke(); }
        x.strokeStyle = 'rgba(70,30,20,.65)'; x.lineWidth = 2.4; x.beginPath();
        x.moveTo(48, 94); x.quadraticCurveTo(64, 104, 80, 94); x.stroke();
        return;
      }
      if (open > 0) { // boca aberta (grito/dor/morte)
        x.fillStyle = 'rgba(52,22,16,.82)'; x.beginPath();
        x.ellipse(64, 100 + curve * 2, 8 + open * 4, 3 + open * 8, 0, 0, 7); x.fill();
        x.strokeStyle = 'rgba(70,30,20,.65)'; x.lineWidth = 2.6; x.beginPath();
        x.moveTo(50, 96 + curve * 2); x.quadraticCurveTo(64, 94 + curve * 4, 78, 96 + curve * 2); x.stroke();
      } else {
        x.strokeStyle = 'rgba(70,30,20,.65)'; x.lineWidth = 3; x.beginPath();
        x.moveTo(50, 98); x.quadraticCurveTo(64, 104 + curve * 8, 78, 98); x.stroke();
        x.fillStyle = 'rgba(150,64,52,0.28)'; // lábio inferior — volume
        x.beginPath(); x.ellipse(64, 102, 10, 3.2, 0, 0, 7); x.fill();
      }
    };
    switch ((expression || 'neutral').toLowerCase()) {
      case 'blink':
        brows(-1.5, 0); eyePair(.06); mouth(0, 0);
        break;
      case 'pain': // dor: sobrancelhas em V invertido interno, olhos apertados, boca aberta
        brows(1, -2.6); eyePair(.32); mouth(.42, -.5);
        x.fillStyle = 'rgba(160,60,40,.16)'; // rubor de dor na testa/glabela
        x.beginPath(); x.ellipse(64, 48, 26, 10, 0, 0, 7); x.fill();
        break;
      case 'shout': // grito: sobrancelhas altas, olhos arregalados, boca em O
        brows(-6, 2.2); eyePair(1.25, 0, 1.08); mouth(.85, .6);
        break;
      case 'death': // morte: pálpebras caídas, íris rolada p/ cima, boca frouxa, palidez
        brows(-2, 1); eyePair(.3, 2.2); mouth(.22, .3);
        x.fillStyle = 'rgba(168,178,192,.16)'; x.fillRect(0, 0, 128, 128); // palidez
        break;
      case 'knocked': // caído (DBNO): careta assimétrica + dentes cerrados
        brows(0, -1.8); eyePair(.3); lid(40, .35); mouth(0, 0, true);
        x.fillStyle = 'rgba(120,50,40,.20)'; x.beginPath(); x.ellipse(94, 76, 12, 7, .3, 0, 7); x.fill(); // hematomas
        x.beginPath(); x.ellipse(34, 76, 10, 6, -.2, 0, 7); x.fill();
        break;
      default: // neutral
        brows(0, 0); eyePair(1); mouth(0, 0);
    }
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
    x.fillStyle = `rgba(${random() < .5 ? 18 : 70},${random() < .5 ? 18 : 70},${random() < .5 ? 20 : 74},.2)`;
    x.fillRect(random() * 256, random() * 256, 1 + random() * 3, 1 + random() * 3);
  }
  // remendos de asfalto
  for (let i = 0; i < 5; i++) {
    x.fillStyle = 'rgba(24,25,28,.5)';
    x.fillRect(random() * 200, random() * 200, 20 + random() * 50, 14 + random() * 30);
  }
  // rachaduras
  x.strokeStyle = 'rgba(14,14,16,.5)'; x.lineWidth = 1.2;
  for (let i = 0; i < 6; i++) {
    x.beginPath(); let px = random() * 256, py = random() * 256; x.moveTo(px, py);
    for (let s = 0; s < 6; s++) { px += (random() - .5) * 50; py += (random() - .5) * 50; x.lineTo(px, py); }
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
    x.fillStyle = `rgba(${70 + random() * 50},${66 + random() * 48},${60 + random() * 44},.16)`;
    x.beginPath(); x.arc(random() * 256, random() * 256, random() * 5, 0, 7); x.fill();
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
      x.fillStyle = `rgba(${110 + random() * 50},${58 + random() * 26},18,${.08 + random() * .14})`;
      x.beginPath(); x.arc(random() * 128, random() * 128, 2 + random() * 8, 0, 7); x.fill();
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
      x.fillStyle = `rgba(${120 + random() * 30},${108 + random() * 26},${74 + random() * 20},.2)`;
      x.fillRect(random() * 128, random() * 128, 2 + random() * 4, 1 + random() * 2);
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
      x.strokeStyle = `rgba(40,28,12,${.15 + random() * .2})`; x.lineWidth = 1;
      const y = random() * 128;
      x.beginPath(); x.moveTo(0, y); x.lineTo(128, y + (random() - .5) * 6); x.stroke();
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
        px += 30 + random() * 55;
        const peak = 512 - hBase - random() * 70;
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

// ============================================================================
// Fase 22 — CENÁRIOS VIVOS: materiais por mundo (nível Free Fire).
// Lama de mangue, água de poça com ripple, neve, lava sob crosta rachada,
// runa astral, fenda do vazio, toldo listrado, tábuas de passarela e areia
// de duna. Tudo procedural (canvas) — zero assets externos, padrão do repo.
// ============================================================================

// cache próprio p/ materiais de cenário (mesma estratégia do memo() interno)
const _dressMemo = new Map();
function dressMemo(key, build) {
  if (!_dressMemo.has(key)) _dressMemo.set(key, build());
  return _dressMemo.get(key);
}

// ---- lama de mangue (Priadus) — solo úmido escuro com poças rasas ----
function mudCanvas() {
  const [c, x] = canvas(256);
  x.fillStyle = '#3d3628'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 700; i++) {
    const r = random();
    x.fillStyle = r < .45 ? `rgba(48,42,30,${.25 + random() * .35})`
      : r < .8 ? `rgba(58,54,38,${.2 + random() * .3})`
        : `rgba(34,44,36,${.15 + random() * .25})`; // musgo úmido
    x.beginPath(); x.arc(random() * 256, random() * 256, 2 + random() * 14, 0, 7); x.fill();
  }
  // brilho de umidade (manchas claras frias)
  for (let i = 0; i < 40; i++) {
    x.fillStyle = `rgba(120,130,120,${.04 + random() * .07})`;
    x.beginPath(); x.arc(random() * 256, random() * 256, 8 + random() * 20, 0, 7); x.fill();
  }
  noise(x, 256, 0.08);
  return c;
}
export function mudMaterial(repeat = 3) {
  return dressMemo(`mud${repeat}`, () => pbr(mudCanvas(), { repeat, rough: .55, strength: 1.4, extra: { color: new THREE.Color('#cdd4c8') } }));
}

// ---- água de poça (Priadus) — translúcida com relevo de ondulação ----
function rippleCanvas() {
  const [c, x] = canvas(256);
  x.fillStyle = '#808080'; x.fillRect(0, 0, 256, 256);
  // interferência de 4 fontes senoidais → cristas suaves (vira normal map)
  const img = x.getImageData(0, 0, 256, 256), d = img.data;
  for (let y = 0; y < 256; y++) {
    for (let px = 0; px < 256; px++) {
      const h =
        Math.sin(px * 0.11 + y * 0.04) * .5 +
        Math.sin(y * 0.09 - px * 0.05) * .5 +
        Math.sin((px + y) * 0.06) * .35 +
        Math.sin(Math.hypot(px - 128, y - 64) * 0.09) * .3;
      const v = 128 + h * 44;
      const o = (y * 256 + px) * 4;
      d[o] = d[o + 1] = d[o + 2] = v; d[o + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0);
  return c;
}
export function waterPoolMaterial(tint = '#2e6b63') {
  return dressMemo(`water${tint}`, () => {
    const normal = normalMapFromCanvas(rippleCanvas(), { strength: 1.1 });
    normal.wrapS = normal.wrapT = THREE.RepeatWrapping;
    normal.repeat.set(2, 2);
    return new THREE.MeshStandardMaterial({
      color: new THREE.Color(tint), transparent: true, opacity: .8,
      roughness: .12, metalness: .08, normalMap: normal,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    });
  });
}

// ---- neve (Barburhen) — branca azulada com flocos e relevo suave ----
function snowCanvas() {
  const [c, x] = canvas(256);
  x.fillStyle = '#dfe8ee'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 420; i++) {
    x.fillStyle = `rgba(${214 + random() * 40},${224 + random() * 30},${236 + random() * 18},${.2 + random() * .4})`;
    x.beginPath(); x.arc(random() * 256, random() * 256, 1 + random() * 9, 0, 7); x.fill();
  }
  // sombras azuladas de acumulação
  for (let i = 0; i < 26; i++) {
    x.fillStyle = `rgba(150,175,200,${.05 + random() * .09})`;
    x.beginPath(); x.arc(random() * 256, random() * 256, 10 + random() * 26, 0, 7); x.fill();
  }
  noise(x, 256, 0.05);
  return c;
}
export function snowMaterial(repeat = 2) {
  return dressMemo(`snow${repeat}`, () => pbr(snowCanvas(), { repeat, rough: .75, strength: 1.1 }));
}

// ---- lava sob crosta rachada (Ckesalth) — emissiveMap nas fissuras ----
function lavaCanvas() {
  const [c, x] = canvas(256);
  // crosta basáltica escura
  x.fillStyle = '#241d1a'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 500; i++) {
    x.fillStyle = `rgba(${34 + random() * 26},${28 + random() * 20},${24 + random() * 16},${.3 + random() * .3})`;
    x.beginPath(); x.arc(random() * 256, random() * 256, 2 + random() * 12, 0, 7); x.fill();
  }
  return c;
}
function lavaEmissiveCanvas() {
  const [c, x] = canvas(256);
  x.fillStyle = '#000000'; x.fillRect(0, 0, 256, 256);
  // fissuras ramificadas laranja→amarelo no centro dos traços
  x.lineCap = 'round';
  for (let i = 0; i < 16; i++) {
    let px = random() * 256, py = random() * 256;
    let ang = random() * Math.PI * 2;
    for (let s = 0; s < 7; s++) {
      const nx = px + Math.cos(ang) * (12 + random() * 22);
      const ny = py + Math.sin(ang) * (12 + random() * 22);
      const g = x.createLinearGradient(px, py, nx, ny);
      g.addColorStop(0, 'rgba(255,96,16,.95)');
      g.addColorStop(1, 'rgba(255,196,48,.9)');
      x.strokeStyle = g; x.lineWidth = 1.2 + random() * 2.4;
      x.beginPath(); x.moveTo(px, py); x.lineTo(nx, ny); x.stroke();
      px = nx; py = ny; ang += (random() - .5) * 1.4;
    }
  }
  // brilho difuso sob as fissuras (glow quente atravessando a crosta)
  for (let i = 0; i < 22; i++) {
    const gx = random() * 256, gy = random() * 256, r = 8 + random() * 26;
    const g = x.createRadialGradient(gx, gy, 1, gx, gy, r);
    g.addColorStop(0, `rgba(255,120,30,${.12 + random() * .2})`);
    g.addColorStop(1, 'rgba(255,80,10,0)');
    x.fillStyle = g;
    x.beginPath(); x.arc(gx, gy, r, 0, 7); x.fill();
  }
  noise(x, 256, 0.05);
  return c;
}
export function lavaMaterial(repeat = 1) {
  return dressMemo(`lava${repeat}`, () => {
    const em = tex(lavaEmissiveCanvas(), { repeat, srgb: true });
    return new THREE.MeshStandardMaterial({
      map: tex(lavaCanvas(), { repeat }), emissiveMap: em,
      emissive: new THREE.Color('#ff7a1e'), emissiveIntensity: 1.6,
      roughness: .9, metalness: .05,
    });
  });
}

// ---- runa astral (Arukheea) — anel de glifos emissivos com alpha ----
export function runeMaterial(color = '#59e6ff') {
  return dressMemo(`rune${color}`, () => {
    const [c, x] = canvas(256);
    x.clearRect(0, 0, 256, 256);
    x.strokeStyle = color; x.lineWidth = 5;
    x.beginPath(); x.arc(128, 128, 108, 0, 7); x.stroke();
    x.lineWidth = 2.5;
    x.beginPath(); x.arc(128, 128, 84, 0, 7); x.stroke();
    // glifos (triângulos rotacionados no cálculo — sem ctx.rotate, mantém o
    // stub de canvas das suítes antigas compatível)
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const gx = 128 + Math.cos(a) * 96, gy = 128 + Math.sin(a) * 96;
      const p = (da, r) => [gx + Math.cos(a + da) * r, gy + Math.sin(a + da) * r];
      const [x1, y1] = p(-Math.PI / 2, 9), [x2, y2] = p(Math.PI * .83, 8), [x3, y3] = p(Math.PI * .17, 8);
      x.lineWidth = 3;
      x.beginPath(); x.moveTo(x1, y1); x.lineTo(x2, y2); x.lineTo(x3, y3); x.closePath(); x.stroke();
    }
    // nós radiais
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      x.fillStyle = color;
      x.beginPath(); x.arc(128 + Math.cos(a) * 108, 128 + Math.sin(a) * 108, 4.5, 0, 7); x.fill();
    }
    const t = tex(c, { srgb: true });
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return new THREE.MeshBasicMaterial({
      map: t, transparent: true, depthWrite: false,
      color: new THREE.Color(color), toneMapped: false,
      polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
    });
  });
}

// ---- fenda do vazio (Arukheea) — plano vertical emissivo com alpha radial ----
export function riftMaterial() {
  return dressMemo('rift', () => {
    const [c, x] = canvas(128);
    x.clearRect(0, 0, 128, 128);
    const g = x.createRadialGradient(64, 64, 4, 64, 64, 62);
    g.addColorStop(0, 'rgba(226,190,255,.95)');
    g.addColorStop(.35, 'rgba(150,90,235,.75)');
    g.addColorStop(.7, 'rgba(80,40,150,.3)');
    g.addColorStop(1, 'rgba(40,20,80,0)');
    x.fillStyle = g;
    // fenda vertical: elipse alta e estreita (sem save/scale — stub-friendly)
    x.beginPath(); x.ellipse(64, 64, 23, 60, 0, 0, 7); x.fill();
    const t = tex(c, { srgb: true });
    t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    return new THREE.MeshBasicMaterial({
      map: t, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      toneMapped: false,
    });
  });
}

// ---- toldo listrado (bancas de feira Barburhen) ----
export function awningMaterial(base = '#b8452e') {
  return dressMemo(`awning${base}`, () => {
    const [c, x] = canvas(128);
    x.fillStyle = base; x.fillRect(0, 0, 128, 128);
    x.fillStyle = 'rgba(240,236,224,.92)';
    for (let i = 0; i < 128; i += 32) x.fillRect(i, 0, 16, 128);
    noise(x, 128, 0.06);
    return pbr(c, { repeat: 1, rough: .8, strength: .8 });
  });
}

// ---- tábuas de madeira (passarelas de palafita) ----
function plankCanvas() {
  const [c, x] = canvas(256);
  x.fillStyle = '#7a5c38'; x.fillRect(0, 0, 256, 256);
  // tábuas horizontais com veios
  for (let y = 0; y < 256; y += 42) {
    const shade = 0.85 + random() * 0.3;
    x.fillStyle = `rgb(${(122 * shade) | 0},${(92 * shade) | 0},${(56 * shade) | 0})`;
    x.fillRect(0, y, 256, 38);
    x.fillStyle = 'rgba(30,20,10,.55)';
    x.fillRect(0, y + 38, 256, 4); // junta escura
    // veios
    x.strokeStyle = 'rgba(60,42,22,.4)'; x.lineWidth = 1;
    for (let v = 0; v < 4; v++) {
      const vy = y + 6 + random() * 28;
      x.beginPath(); x.moveTo(0, vy);
      x.quadraticCurveTo(128, vy + (random() - .5) * 6, 256, vy);
      x.stroke();
    }
    // pregos
    x.fillStyle = 'rgba(40,40,44,.8)';
    x.fillRect(10 + random() * 20, y + 16, 3, 3);
    x.fillRect(220 + random() * 20, y + 16, 3, 3);
  }
  noise(x, 256, 0.09);
  return c;
}
export function plankMaterial(repeat = 1) {
  return dressMemo(`plank${repeat}`, () => pbr(plankCanvas(), { repeat, rough: .92, strength: 1.8 }));
}

// ---- areia de duna (Ckesalth) — ondulações vento-sopradas ----
function duneCanvas() {
  const [c, x] = canvas(256);
  x.fillStyle = '#c9a56a'; x.fillRect(0, 0, 256, 256);
  // cristas de vento (curvas claras + sombra fria abaixo)
  for (let i = 0; i < 30; i++) {
    const cy = random() * 256;
    x.strokeStyle = 'rgba(232,206,152,.5)'; x.lineWidth = 2 + random() * 3;
    x.beginPath(); x.moveTo(0, cy);
    x.quadraticCurveTo(128, cy + (random() - .5) * 34, 256, cy + (random() - .5) * 18);
    x.stroke();
    x.strokeStyle = 'rgba(140,110,66,.35)'; x.lineWidth = 1.5;
    x.beginPath(); x.moveTo(0, cy + 5);
    x.quadraticCurveTo(128, cy + 5 + (random() - .5) * 34, 256, cy + (random() - .5) * 18);
    x.stroke();
  }
  // grãos
  for (let i = 0; i < 700; i++) {
    x.fillStyle = `rgba(${170 + random() * 60},${140 + random() * 50},${90 + random() * 40},.25)`;
    x.fillRect(random() * 256, random() * 256, 1, 1);
  }
  noise(x, 256, 0.07);
  return c;
}
export function duneMaterial(repeat = 2) {
  return dressMemo(`dune${repeat}`, () => pbr(duneCanvas(), { repeat, rough: .96, strength: 1.2 }));
}

// ---- bandeira de tecido (mastros do cume / acampamento) ----
export function bannerMaterial(bg = '#8a2a22', glyph = '#e8d9a8') {
  return dressMemo(`banner${bg}${glyph}`, () => {
    const [c, x] = canvas(128);
    x.fillStyle = bg; x.fillRect(0, 0, 128, 128);
    // borda gasta
    x.strokeStyle = 'rgba(20,12,8,.5)'; x.lineWidth = 6;
    x.strokeRect(3, 3, 122, 122);
    // glifo central (runa do mundo)
    x.strokeStyle = glyph; x.lineWidth = 7; x.lineCap = 'round';
    x.beginPath();
    x.moveTo(64, 26); x.lineTo(40, 64); x.lineTo(64, 102); x.lineTo(88, 64); x.closePath();
    x.moveTo(64, 26); x.lineTo(64, 102);
    x.stroke();
    noise(x, 128, 0.08);
    return new THREE.MeshStandardMaterial({ map: tex(c, { srgb: true }), roughness: .85, side: THREE.DoubleSide });
  });
}

// ============================================================================
// Fase 24 — RAIOS DE LUZ pelas janelas (light shafts)
// ============================================================================

// Gradiente vertical: opaco no topo (boca da janela) → transparente na base.
// Mapeado com v=0 no topo do raio e v=1 no chão (UV do quad no lightshafts3d).
export function lightShaftTexture() {
  const c = document.createElement('canvas');
  c.width = 8; c.height = 128;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, 'rgba(255,242,206,.5)');
  g.addColorStop(.45, 'rgba(255,236,192,.2)');
  g.addColorStop(1, 'rgba(255,232,180,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 8, 128);
  const t = tex(c, { repeat: 1 });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// Mancha de luz no piso: disco radial com falloff suave (poça do raio).
export function lightPoolTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 4, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,240,204,.42)');
  g.addColorStop(.55, 'rgba(255,236,196,.16)');
  g.addColorStop(1, 'rgba(255,232,180,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  const t = tex(c, { repeat: 1 });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}
