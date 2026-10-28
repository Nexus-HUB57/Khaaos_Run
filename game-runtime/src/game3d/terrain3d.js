// Khaaos Run — Fase 23: TERRENO COM RELEVO (elevação visual por cenário).
//
// Até a Fase 22 o solo era um PlaneGeometry plano (440×440 em y=0): do alto,
// durante a queda livre, o mapa lia como "chapa" — Free Fire tem relevo ao
// redor da área jogável (colinas, escarpas, ilhas). Aqui o terreno ganha
// elevação VISUAL fora da área jogável, com perfil por mundo:
//   CIGKV     — colinas secas crepusculares
//   Barburhen — planícies gélidas baixas com neve nos pontos altos
//   Priadus   — ilhas de mangue emergindo do anel de água abissal (y=.3)
//   Ckesalth  — dunas altas + cristas rochosas de basalto
//   Arukheea  — fragmentos irregulares cinza-astral
//
// CONTRATO DE GAMEPLAY (inviolável): dentro da área jogável (chebyshev ≤ 197,
// o clamp do sim é ±198) a altura é EXATAMENTE 0 — entidades, sombras de
// contato, loot, dressing e grama continuam ancorados no plano y=0. O relevo
// só existe além da borda (ramp 197→211, platô moderado no anel dos marcos
// 205–220 p/ não engoli-los, cristas cheias nos cantos do plano).
//
// DETERMINISMO: value-noise 2D com hash de inteiros — mesma entrada => mesma
// altura, em qualquer máquina, sem estado compartilhado (função PURA).
import * as THREE from 'three';
import { groundMaterial } from './textures3d.js';

// ---- perfis por cenário ----
const FLAT = 197;            // chebyshev: jogo 100% plano até aqui (clamp sim = 198)
const PROFILES = {
  CIGKV:     { amp: 4.6, freq: .052, ridge: .30, salt: 0x4b4b01 },
  Barburhen: { amp: 2.3, freq: .045, ridge: .12, salt: 0x1ba2711 },
  Priadus:   { amp: 3.4, freq: .060, ridge: .30, salt: 0x2c6d3f2 },
  Ckesalth:  { amp: 7.4, freq: .050, ridge: .55, salt: 0x3de5a13 },
  Arukheea:  { amp: 3.9, freq: .075, ridge: .40, salt: 0x4f7b2b4 },
};

const smooth = (t) => t * t * (3 - 2 * t);
const smoothstep = (a, b, v) => smooth(Math.max(0, Math.min(1, (v - a) / (b - a))));

// hash de inteiros → [0,1) (estável, sem Math.random)
function hash2(ix, iz, salt) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263)) ^ salt;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
// value-noise bilinear suavizado
function vnoise(x, z, freq, salt) {
  const fx = x * freq, fz = z * freq;
  const ix = Math.floor(fx), iz = Math.floor(fz);
  const tx = smooth(fx - ix), tz = smooth(fz - iz);
  const a = hash2(ix, iz, salt), b = hash2(ix + 1, iz, salt);
  const c = hash2(ix, iz + 1, salt), d = hash2(ix + 1, iz + 1, salt);
  return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
}

/**
 * Altura VISUAL do terreno em (x, z). Pura e determinística.
 * - chebyshev ≤ 197  → 0 (contrato de gameplay: plano jogável intacto)
 * - 197→211          → rampa suave até ~0.2–0.5× amp (margem do mapa)
 * - anel dos marcos  → platô moderado (marcos de horizonte permanecem legíveis)
 * - cantos do plano  → cristas cheias (amp + termo ridged)
 * @returns {number} altura em metros (≥ 0, 3 casas)
 */
export function terrainHeightAt(x, z, scenarioId = 'CIGKV') {
  const p = PROFILES[scenarioId] ?? PROFILES.CIGKV;
  const cheb = Math.max(Math.abs(x), Math.abs(z));
  if (cheb <= FLAT) return 0;
  const ramp = smoothstep(FLAT, FLAT + 14, cheb);
  const r = Math.hypot(x, z);
  const mid = smoothstep(208, 272, r);                 // platô → subida
  const far = smoothstep(266, 312, r);                 // cristas nos cantos
  const n  = vnoise(x, z, p.freq, p.salt);
  const n2 = vnoise(x, z, p.freq * 2.7, p.salt ^ 0x9e37);
  const ridge = Math.pow(1 - Math.abs(2 * vnoise(x, z, p.freq * .55, p.salt ^ 0x51f7) - 1), 2);
  const h = p.amp * ramp * ((0.20 + 0.30 * n) + mid * (0.15 * n2 + 0.18 * n) + far * (0.75 + p.ridge * ridge));
  return +Math.max(0, h).toFixed(3);
}

// ---- tinta por vértice (variação de solo por altitude, identidade por mundo) ----
// multiplica o groundTint do cenário: baixo úmido → meio nativo → alto rocha
// (neve em Barburhen, basalto em Ckesalth, musgo escuro em Priadus, cinza-astral).
const TINTS = {
  CIGKV:     { low: [.84, .78, .66], mid: [1, 1, 1],    high: [.52, .46, .40] },
  Barburhen: { low: [.82, .86, .90], mid: [1, 1, 1],    high: [.96, .98, 1.0] }, // neve
  Priadus:   { low: [.42, .58, .48], mid: [1, 1, 1],    high: [.55, .62, .58] }, // musgo
  Ckesalth:  { low: [1, .92, .78],   mid: [1, 1, 1],    high: [.30, .24, .22] }, // basalto
  Arukheea:  { low: [.78, .80, .92], mid: [1, 1, 1],    high: [.62, .58, .78] }, // astral
};
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function terrainTint(h, x, z, scenarioId) {
  const p = TINTS[scenarioId] ?? TINTS.CIGKV;
  const amp = (PROFILES[scenarioId] ?? PROFILES.CIGKV).amp;
  const k = Math.max(0, Math.min(1, h / (amp * .85)));
  const jitter = (vnoise(x, z, .18, 0x7ea1) - .5) * .12; // quebra bandas retas
  const base = k < .55 ? mix3(p.low, p.mid, k / .55) : mix3(p.mid, p.high, (k - .55) / .45);
  return [
    Math.max(0, Math.min(1.15, base[0] + jitter)),
    Math.max(0, Math.min(1.15, base[1] + jitter)),
    Math.max(0, Math.min(1.15, base[2] + jitter)),
  ];
}

/**
 * Malha do terreno com relevo. Substitui o plano plano do buildScene:
 * mesma textura/tiling (groundMaterial 34×), mas vértices deslocados por
 * terrainHeightAt + vertex colors por altitude. receiveShadow preservado.
 * flag userData.terrain p/ inspeção e2e.
 */
export function buildTerrain(scenario, { segments = 96 } = {}) {
  const geo = new THREE.PlaneGeometry(440, 440, segments, segments);
  geo.rotateX(-Math.PI / 2); // plano XZ com +y para cima
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = terrainHeightAt(x, z, scenario.id);
    pos.setY(i, h);
    const [r, g, b] = terrainTint(h, x, z, scenario.id);
    colors[i * 3] = r; colors[i * 3 + 1] = g; colors[i * 3 + 2] = b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = groundMaterial(34, scenario.groundTint);
  mat.vertexColors = true;
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = 'terrain';
  mesh.userData.terrain = true;
  return mesh;
}
