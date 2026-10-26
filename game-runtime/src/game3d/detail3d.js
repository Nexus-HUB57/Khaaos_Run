// Khaaos Run — Fase 6: detalhes de cenário (lógica PURA, sem THREE).
// Estradas, props e detalhes de fachada calculados de forma determinística
// (mesma seed => mesma decoração) para o renderizador consumir como "burro".
// A simulação/colisão permanece intocada: nada aqui gera colliders.
import { SeededRng } from '../shared/rng.js';

const MARGIN = 1.2; // folga padrão contra colliders

// distância ponto→segmento (para props acompanharem a estrada)
function distToSeg(px, pz, x1, z1, x2, z2) {
  const dx = x2 - x1, dz = z2 - z1;
  const len2 = dx * dx + dz * dz;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (pz - z1) * dz) / len2));
  return Math.hypot(px - (x1 + dx * t), pz - (z1 + dz * t));
}

// um segmento (retângulo de largura `w`) intersecta algum collider no chão?
function segHitsCollider(x1, z1, x2, z2, w, colliders, margin = MARGIN) {
  for (const c of colliders) {
    if (c.yMin > 0.5) continue; // só bloqueio ao nível do chão importa p/ estrada
    // amostra o eixo do segmento (passo de 1.5m) + discos de raio w/2
    const len = Math.hypot(x2 - x1, z2 - z1);
    const steps = Math.max(2, Math.ceil(len / 1.5));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const px = x1 + (x2 - x1) * t, pz = z1 + (z2 - z1) * t;
      const r = w / 2;
      if (px > c.minX - r - margin && px < c.maxX + r + margin && pz > c.minZ - r - margin && pz < c.maxZ + r + margin) return true;
    }
  }
  return false;
}

// resolve o caminho centro→distrito desviando de estruturas com UM joelho (2 sub-segmentos)
function clearPath(x1, z1, x2, z2, w, colliders) {
  if (!segHitsCollider(x1, z1, x2, z2, w, colliders)) return [[x1, z1, x2, z2]];
  const mx = (x1 + x2) / 2, mz = (z1 + z2) / 2;
  const dx = x2 - x1, dz = z2 - z1;
  const len = Math.hypot(dx, dz) || 1;
  const nx = -dz / len, nz = dx / len; // perpendicular
  for (const off of [10, 15, 20, 26, 32, 40, 48]) {
    for (const s of [1, -1]) {
      const jx = mx + nx * off * s, jz = mz + nz * off * s;
      if (Math.abs(jx) > 195 || Math.abs(jz) > 195) continue;
      if (!segHitsCollider(x1, z1, jx, jz, w, colliders) && !segHitsCollider(jx, jz, x2, z2, w, colliders)) {
        return [[x1, z1, jx, jz], [jx, jz, x2, z2]];
      }
    }
  }
  return [[x1, z1, x2, z2]]; // fallback: reta (caso patológico)
}

// um disco (ponto + raio) intersecta algum collider no chão?
function discHitsCollider(px, pz, r, colliders, margin = MARGIN) {
  for (const c of colliders) {
    if (c.yMin > 0.5) continue;
    if (px > c.minX - r - margin && px < c.maxX + r + margin && pz > c.minZ - r - margin && pz < c.maxZ + r + margin) return true;
  }
  return false;
}

/**
 * Estradas de Khaoos Ville: 4 radiais (praça central → distrito) + anel de perímetro.
 * Cada distrito recebe um "ponto de aproximação": o primeiro ponto (varrendo direções
 * giradas ao redor do centro) de onde a praça enxerga em linha reta livre de
 * construções. Assim nenhuma estrada termina dentro de um galpão.
 * @returns [{ x1, z1, x2, z2, width, kind: 'radial'|'ring' }]
 */
export function roadSegments(layout, { width = 7.5 } = {}) {
  const colliders = layout.colliders;
  const outer = layout.districts.slice(0, 4); // 4 distritos externos; [4] é a praça central
  const starts = outer.map((d) => {
    const L = Math.hypot(d.cx, d.cz) || 1;
    return [(d.cx / L) * 30, (d.cz / L) * 30]; // borda da praça (evita monolito/terminal)
  });
  const tips = outer.map((d, i) => {
    const [sx, sz] = starts[i];
    const bx = sx - d.cx, bz = sz - d.cz; // vetor centro→praça
    const bl = Math.hypot(bx, bz) || 1;
    const ux = bx / bl, uz = bz / bl;
    for (const da of [0, .24, -.24, .48, -.48, .72, -.72, .96, -.96, 1.2, -1.2]) {
      const c = Math.cos(da), s = Math.sin(da);
      const rx = ux * c - uz * s, rz = ux * s + uz * c; // direção de aproximação girada
      for (let back = 4; back <= 48; back += 4) {
        const px = d.cx + rx * back, pz = d.cz + rz * back;
        if (discHitsCollider(px, pz, width / 2, colliders)) continue;
        if (!segHitsCollider(sx, sz, px, pz, width, colliders)) return [px, pz];
      }
    }
    return [d.cx + ux * 50, d.cz + uz * 50]; // fallback: recuado para a praça
  });
  const segments = [];
  for (let i = 0; i < outer.length; i++) {
    const [tx, tz] = tips[i];
    for (const [ax, az, bx, bz] of clearPath(starts[i][0], starts[i][1], tx, tz, width, colliders)) {
      segments.push({ x1: ax, z1: az, x2: bx, z2: bz, width, kind: 'radial' });
    }
  }
  // anel de perímetro entre aproximações adjacentes (0↔1, 1↔3, 3↔2, 2↔0)
  const ringPairs = [[0, 1], [1, 3], [3, 2], [2, 0]];
  for (const [a, b] of ringPairs) {
    const [ax, az] = tips[a], [bx, bz] = tips[b];
    for (const [cx, cz, dx2, dz2] of clearPath(ax, az, bx, bz, width * 0.85, colliders)) {
      segments.push({ x1: cx, z1: cz, x2: dx2, z2: dz2, width: width * 0.85, kind: 'ring' });
    }
  }
  return segments;
}

/**
 * Props decorativos (sem colisão): postes de luz, barris, pneus, sacos de areia,
 * paletes e margens de calçada — ao longo das estradas e nas bordas de estruturas.
 * @returns [{ type, x, z, rot, s }]
 */
export function propPlacements(layout, { seed = 'props', density = 1 } = {}) {
  const rng = new SeededRng(`${layout.seed}:${layout.scenarioId}:${seed}`);
  const roads = roadSegments(layout);
  const colliders = layout.colliders;
  const free = (x, z, m = 1.1) => colliders.every(c => x < c.minX - m || x > c.maxX + m || z < c.minZ - m || z > c.maxZ + m);
  const lootClear = (x, z) => (layout.lootSpots || []).every(l => Math.hypot(x - l.x, z - l.z) > 3.2);
  const out = [];
  const push = (type, x, z, rot, s = 1) => {
    if (Math.abs(x) > 196 || Math.abs(z) > 196) return;
    if (!free(x, z) || !lootClear(x, z)) return;
    if (out.some(p => Math.hypot(p.x - x, p.z - z) < 2.4)) return; // evita amontoado
    out.push({ type, x: +x.toFixed(2), z: +z.toFixed(2), rot: +rot.toFixed(3), s: +s.toFixed(2) });
  };

  for (const seg of roads) {
    const len = Math.hypot(seg.x2 - seg.x1, seg.z2 - seg.z1);
    const ux = (seg.x2 - seg.x1) / len, uz = (seg.z2 - seg.z1) / len;
    const nx = -uz, nz = ux;
    const half = seg.width / 2;
    // postes de luz a cada ~26m, alternando os lados
    for (let d = 8; d < len - 6; d += 26) {
      const side = (Math.round(d / 26) % 2) ? 1 : -1;
      push('lamp', seg.x1 + ux * d + nx * (half + 1.6) * side, seg.z1 + uz * d + nz * (half + 1.6) * side,
        Math.atan2(nx * side, nz * side) * -1);
    }
    // barris e pneus rentes à borda (junk de beira de estrada) — densidade Fase 7
    const junk = Math.round((seg.kind === 'radial' ? 5 : 3) * density);
    for (let i = 0; i < junk; i++) {
      const d = 10 + rng.next() * Math.max(4, len - 22);
      const side = rng.next() < .5 ? 1 : -1;
      const roll = rng.next();
      const type = roll < .42 ? 'barrel' : roll < .68 ? 'tire' : roll < .84 ? 'cone' : 'barrel';
      push(type, seg.x1 + ux * d + nx * (half + .9 + rng.next() * .8) * side,
        seg.z1 + uz * d + nz * (half + .9 + rng.next() * .8) * side, rng.next() * Math.PI * 2,
        .85 + rng.next() * .4);
    }
    // caixotes de suprimento perto de estruturas logísticas (GLTF crate)
    if (seg.kind === 'radial' && rng.next() < .5 * density) {
      const d = 14 + rng.next() * Math.max(6, len - 30);
      const side = rng.next() < .5 ? 1 : -1;
      push('crate', seg.x1 + ux * d + nx * (half + 1.1) * side,
        seg.z1 + uz * d + nz * (half + 1.1) * side, rng.next() * Math.PI, .9 + rng.next() * .35);
    }
    // paletes ocasionais
    if (seg.kind === 'ring' && rng.next() < .8) {
      const d = len * (.3 + rng.next() * .4);
      const side = rng.next() < .5 ? 1 : -1;
      push('pallet', seg.x1 + ux * d + nx * (half + 1.4) * side, seg.z1 + uz * d + nz * (half + 1.4) * side, rng.next() * Math.PI);
    }
  }

  // sacos de areia e barricadas de trincheira junto a estruturas grandes (h>=2)
  for (const s of layout.structures) {
    if (s.h < 2 || s.kind === 'monolith') continue;
    const n = Math.round((s.h >= 6 ? 2 : 1) * density);
    // caixotes junto a depósitos/armazéns (Fase 7 — densidade de props)
    if ((s.kind === 'warehouse' || s.kind === 'depot' || s.kind === 'hangar') && rng.next() < .75 * density) {
      for (let i = 0; i < 2; i++) {
        const side = rng.int(0, 3);
        const off = (side === 0 ? [s.x + s.w / 2 + 1.4, s.z + (rng.next() - .5) * s.d]
          : side === 1 ? [s.x - s.w / 2 - 1.4, s.z + (rng.next() - .5) * s.d]
            : side === 2 ? [s.x + (rng.next() - .5) * s.w, s.z + s.d / 2 + 1.4]
              : [s.x + (rng.next() - .5) * s.w, s.z - s.d / 2 - 1.4]);
        push('crate', off[0], off[1], rng.next() * Math.PI, .85 + rng.next() * .4);
      }
    }
    for (let i = 0; i < n; i++) {
      const side = rng.int(0, 3);
      const off = (side === 0 ? [s.x + s.w / 2 + 1.8, s.z + (rng.next() - .5) * s.d]
        : side === 1 ? [s.x - s.w / 2 - 1.8, s.z + (rng.next() - .5) * s.d]
          : side === 2 ? [s.x + (rng.next() - .5) * s.w, s.z + s.d / 2 + 1.8]
            : [s.x + (rng.next() - .5) * s.w, s.z - s.d / 2 - 1.8]);
      const type = rng.next() < .6 ? 'sandbag' : 'barrierprop';
      push(type, off[0], off[1], rng.next() * Math.PI, .9 + rng.next() * .3);
    }
  }
  return out;
}

/**
 * Detalhes de fachada RELATIVOS ao centro de uma estrutura.
 * Consumidos pelo world3d para pendurar decoração (portas, janelas, ACs, tubos,
 * caixa d'água, placa do setor) sem tocar em colliders.
 * @returns [{ kind, face, u, v, w, h, d }] — face: front|back|left|right|top;
 *          u = deslocamento ao longo da face, v = altura do chão.
 */
export function facadeDetails(s, { seed = 'facade' } = {}) {
  if (s.kind === 'monolith' || s.kind === 'crate' || s.kind === 'container') return [];
  const rng = new SeededRng(`${s.kind}:${s.x}:${s.z}:${seed}`);
  const out = [];
  const add = (kind, face, u, v, w, h, d = .25) => out.push({ kind, face, u: +u.toFixed(2), v: +v.toFixed(2), w: +w.toFixed(2), h: +h.toFixed(2), d });
  const isBuilding = ['barrack', 'hangar', 'warehouse', 'building', 'ruin', 'depot', 'pavilion', 'tower', 'silo'].includes(s.kind);

  if (!isBuilding) return out;

  // porta na face maior (front = +z se d>=w, senão +x)
  const frontZ = s.d >= s.w;
  const doorW = Math.min(2.2, (frontZ ? s.w : s.d) * .35);
  add('door', frontZ ? 'front' : 'right', 0, 0, doorW, 2.5, .12);
  // placa do setor acima da porta
  if (s.h >= 3 && (s.kind === 'barrack' || s.kind === 'warehouse' || s.kind === 'hangar' || s.kind === 'building')) {
    add('sign', frontZ ? 'front' : 'right', 0, 2.9, Math.max(2.6, doorW * 1.6), .7, .1);
  }
  // faixas de janelas por andar (a partir de h>=4)
  if (s.h >= 4 && s.kind !== 'silo') {
    const faceW = frontZ ? s.w : s.d;
    const rows = Math.min(6, Math.floor((s.h - 2.4) / 2.8));
    for (let r = 0; r < rows; r++) {
      const v = 2.6 + r * 2.8;
      add('windows', 'front', 0, v, faceW * .78, 1.3, .1);
      add('windows', 'back', 0, v, faceW * .78, 1.3, .1);
      const sideW = frontZ ? s.d : s.w;
      add('windows', 'left', 0, v, sideW * .72, 1.3, .1);
      add('windows', 'right', 0, v, sideW * .72, 1.3, .1);
    }
  }
  // ar-condicionados no topo
  if (s.h >= 4.5) {
    const n = Math.min(3, 1 + Math.floor(rng.next() * 2));
    for (let i = 0; i < n; i++) {
      const u = (rng.next() - .5) * (frontZ ? s.w : s.d) * .6;
      const w2 = (rng.next() - .5) * (frontZ ? s.d : s.w) * .6;
      const plane = frontZ ? 'top' : 'top';
      out.push({ kind: 'ac', face: plane, u: +u.toFixed(2), v: +w2.toFixed(2), w: 1.1 + rng.next() * .6, h: .8 + rng.next() * .4, d: 1.1 + rng.next() * .6 });
    }
  }
  // caixa d'água cilíndrica em torres/edifícios altos
  if (s.h >= 8) out.push({ kind: 'tank', face: 'top', u: +(s.w * .22).toFixed(2), v: +(s.d * .22).toFixed(2), w: 1.5, h: 2.2, d: 1.5 });
  // tubulações verticais em galpões
  if (s.h >= 6 && (s.kind === 'warehouse' || s.kind === 'hangar' || s.kind === 'building')) {
    add('pipe', 'left', -(s.d / 2 - .8), 0, .3, s.h, .3);
  }
  return out;
}

/** Variação de copa por árvore (usado pelo world3d p/ instancing com tinta por instância). */
export function canopyTint(rng) {
  const dry = rng.next();
  if (dry < .45) return 0x6a7a3c;      // verde oliva vivo
  if (dry < .78) return 0x59682f;      // oliva escuro
  if (dry < .92) return 0x7d8443;      // oliva seco
  return 0x8a6f3c;                     // outonal (crepúsculo vulcânico)
}
