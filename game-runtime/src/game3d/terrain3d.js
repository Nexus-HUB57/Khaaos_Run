// Khaaos Run — Fase 23b: VARIAÇÃO DE TERRENO POR ELEVAÇÃO (visual).
//
// O chão era um plano 440×440 perfeitamente liso e de cor única: de paraquedas
// a leitura era "grama pintada infinita". Este módulo devolve, de forma PURA e
// determinística, a elevação e a cor de CADA vértice do terreno:
//  - DENTRO da área jogável (|x|,|z| <= bound): y = 0 SEMPRE — zero impacto em
//    gameplay (colliders AABB, entidades, decals, estradas e sombras de contato
//    vivem no plano y≈0 e continuam exatos);
//  - FORA da área jogável: colinas suaves (fbm de ruído de valor, 3 oitavas)
//    sobem em direção à cordilheira de fundo — silhueta de horizonte real;
//  - COR por vértice: variação de capim em manchas de dois tons (identidade do
//    cenário), escurecimento em "vales" do ruído e MISTURA PARA ROCHA/seco com
//    a elevação — leitura de relevo mesmo onde a geometria é plana.
// Consumidor: world3d (PlaneGeometry segmentada + atributo color + vertexColors).
import { SeededRng } from '../shared/rng.js';

// ---- hash de valor 2D determinístico (sem estado, sem THREE) ----
function hash2(x, y, seedNum) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seedNum | 0, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}
const smooth = (t) => t * t * (3 - 2 * t);

// ruído de valor suave em grade de `cell` metros
function valueNoise(x, z, cell, seedNum) {
  const gx = x / cell, gz = z / cell;
  const x0 = Math.floor(gx), z0 = Math.floor(gz);
  const tx = smooth(gx - x0), tz = smooth(gz - z0);
  const n00 = hash2(x0, z0, seedNum), n10 = hash2(x0 + 1, z0, seedNum);
  const n01 = hash2(x0, z0 + 1, seedNum), n11 = hash2(x0 + 1, z0 + 1, seedNum);
  return (n00 * (1 - tx) + n10 * tx) * (1 - tz) + (n01 * (1 - tx) + n11 * tx) * tz;
}

// fbm 3 oitavas em [0,1]
function fbm(x, z, seedNum) {
  return (
    valueNoise(x, z, 46, seedNum) * .55 +
    valueNoise(x, z, 19, seedNum + 101) * .3 +
    valueNoise(x, z, 7.5, seedNum + 202) * .15
  );
}

export const TERRAIN_DEFAULTS = Object.freeze({
  bound: 200,     // área jogável plana (layout.size 400 → anel do Ring em 200)
  edge: 220,      // borda da malha (PlaneGeometry 440)
  maxRise: 15,    // elevação máxima nas bordas
  seedNum: 1337,
});

/**
 * Elevação VISUAL do terreno em (x, z).
 * Plana dentro da área jogável; colinas fora (fbm determinístico).
 */
export function terrainHeightAt(x, z, opts = {}) {
  const { bound, maxRise, seedNum } = { ...TERRAIN_DEFAULTS, ...opts };
  const over = Math.max(Math.abs(x), Math.abs(z)) - bound; // chebyshev
  if (over <= 0) return 0;
  const t = smooth(Math.min(1, over / 22));                 // rampa 0→1 em ~22 m
  const mask = .35 + .65 * fbm(x * .9, z * .9, seedNum);    // colinas com "vales"
  return +(t * maxRise * mask * (0.55 + .45 * fbm(x * 2.2, z * 2.2, seedNum + 77))).toFixed(3);
}

// mix de cores em espaço RGB (entrada/saída [r,g,b] 0..1)
function mix3(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
const hexToRgb = (hex) => {
  const n = parseInt(String(hex).replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

const ROCK_LOW = hexToRgb('#8a7f6d');
const ROCK_HIGH = hexToRgb('#a89a78');
const VALLEY = [.82, .82, .78];   // multiplicador de sombra nos "vales" do ruído

/**
 * Cor do terreno em (x, z) dada a elevação h:
 *  - manchas de dois tons de capim (tints do cenário, padrão Free Fire);
 *  - "vales" do ruído levemente escurecidos (leitura de micro-relevo);
 *  - h > 0 mistura para rocha (baixa) e capim seco (alta).
 * @returns [r, g, b] 0..1
 */
export function terrainColorAt(x, z, h, { tints = ['#c9cfa0', '#b3bd8c'], seedNum = TERRAIN_DEFAULTS.seedNum } = {}) {
  const c0 = hexToRgb(tints[0]), c1 = hexToRgb(tints[1] ?? tints[0]);
  // manchas grandes de dois tons (borda suave, sem xadrez)
  const patch = valueNoise(x, z, 13, seedNum + 404);
  const twoTone = smooth(Math.max(0, Math.min(1, (patch - .46) / .1)));
  let col = mix3(c0, c1, twoTone);
  // micro-variação (3ª tonalidade sutil, quebra a repetição da textura)
  const micro = valueNoise(x, z, 4.2, seedNum + 808);
  col = mix3(col, [col[0] * .9, col[1] * .92, col[2] * .86], (1 - micro) * .35);
  // vales escurecem (leitura de depressão mesmo no plano)
  const dip = valueNoise(x, z, 23, seedNum + 909);
  const dipK = smooth(Math.max(0, Math.min(1, (.34 - dip) / .16))) * .5;
  col = mix3(col, [col[0] * VALLEY[0], col[1] * VALLEY[1], col[2] * VALLEY[2]], dipK);
  // elevação: rocha na base das colinas → capim seco no topo
  if (h > 0) {
    const k = Math.min(1, h / TERRAIN_DEFAULTS.maxRise);
    col = mix3(col, ROCK_LOW, Math.min(1, k * 2.2) * .78);
    col = mix3(col, ROCK_HIGH, Math.max(0, k - .45) * 1.4);
  }
  return [
    +Math.max(0, Math.min(1, col[0])).toFixed(4),
    +Math.max(0, Math.min(1, col[1])).toFixed(4),
    +Math.max(0, Math.min(1, col[2])).toFixed(4),
  ];
}

/**
 * Dados de vértice completos p/ a malha do chão (posições já em XZ).
 * @param {{ positions: Float32Array, tints: string[] }} p — positions do
 *        PlaneGeometry rotacionado (x,y,z por vértice; y será sobrescrito).
 * @returns {{ heights: Float32Array, colors: Float32Array }}
 */
export function terrainVertexData(positions, { tints = ['#c9cfa0', '#b3bd8c'], ...opts } = {}) {
  const n = positions.length / 3;
  const heights = new Float32Array(n);
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const x = positions[i * 3], z = positions[i * 3 + 2];
    const h = terrainHeightAt(x, z, opts);
    heights[i] = h;
    const [r, g, b] = terrainColorAt(x, z, h, { tints, seedNum: opts.seedNum });
    colors[i * 3] = r; colors[i * 3 + 1] = g; colors[i * 3 + 2] = b;
  }
  return { heights, colors };
}

// semente numérica estável a partir do seed textual da partida + cenário
export function terrainSeedNum(seedText, scenarioId) {
  const rng = new SeededRng(`${seedText}:${scenarioId}:terrain`);
  return 1 + Math.floor(rng.next() * 1e9);
}
