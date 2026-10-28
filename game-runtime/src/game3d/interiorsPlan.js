// Khaaos Run — Fase 24: PLANO DE INTERIORES ACESSÍVEIS (lógica PURA, sem THREE).
//
// Até a Fase 23 os interiores eram VISUAIS: a porta era um vão pintado na casca
// e o sim continuava tratando cada estrutura como um AABB sólido — entrar era
// impossível. A Fase 24 torna os interiores ACESSÍVEIS de verdade:
//   1. COLLIDERS OCOS — o collider sólido das estruturas-habitação é trocado
//      pelas PAREDES da casca (segmentos com o vão da porta REAL e faixas de
//      janela onde balas e explosões passam);
//   2. FLOORS — degraus de escada e mezaninos viram superfícies pisáveis
//      (stepActorMovement ganha suporte vertical: subir degrau, descer grudado
//      e cair da borda do mezanino);
//   3. JANELAS — aberturas reais (peitoril 1,55 m > alcance de salto 1,24 m)
//      que deixam PASSAR BALAS/LOS mas não o jogador.
//
// Este módulo é a FONTE DA VERDADE compartilhada por sim3d (física), room3d
// (servidor autoritativo), predict3d (predição) e interiors3d (visual) — a
// casca desenhada e o collider oco saem do MESMO plano determinístico.
//
// Filosofia do repo: LÓGICA PURA (sem THREE, headless-safe p/ servidor),
// DETERMINISMO (mesma seed => mesmos placements), ZERO assets externos.
import { SeededRng } from '../shared/rng.js';

// tipos de estrutura que viram casca habitável (visual) — as demais continuam caixa
export const SHELL_KINDS = new Set(['barrack', 'hangar', 'warehouse', 'depot', 'building', 'ruin', 'pavilion']);

// estruturas com escada + mezanino (piso superior pisável)
export const MEZZ_KINDS = new Set(['hangar', 'warehouse', 'building']);
// estruturas com faixas de janela (aberturas reais acima do salto)
export const WINDOW_KINDS = new Set(['barrack', 'hangar', 'warehouse', 'depot', 'building']);

// mobília por tipo de estrutura (kit do distrito)
const KITS = {
  barrack:  { bunk: 2, locker: 3, weaponsrack: 1, cratestack: 1 },
  hangar:   { workbench: 2, tirestack: 2, toolcart: 1, targetboard: 2, cratestack: 1 },
  warehouse:{ shelfrack: 3, palletstack: 2, barrelrow: 1, cratestack: 1 },
  depot:    { shelfrack: 1, cratestack: 2, barrelrow: 1 },
  building: { table: 2, shelf: 1, planter: 1, counter: 1, stool: 2 },
  ruin:     { rubble: 2, rebar: 2, brokenbench: 1, lanternpost: 1 },
  pavilion: { counter: 1, stool: 2, menuboard: 1, fridge: 1 },
};

// acento POR CENÁRIO: prop extra + cor do tecido do interior (consumido pelo builder visual)
export const ACCENTS = {
  CIGKV:     { prop: 'weaponsrack', cloth: '#5d6b4a' },                     // oliva crepuscular
  Barburhen: { prop: 'heater',         cloth: '#4a6373' },                     // frio gélido
  Priadus:   { prop: 'hammock',        cloth: '#3f6b52' },                     // umidade de mangue
  Ckesalth:  { prop: 'waterdrum',      cloth: '#8a6f42' },                     // poeira do deserto
  Arukheea:  { prop: 'astralconsole',  cloth: '#5a648a' },                     // cinza-astral
};

// porta maior em galpões/hangares (leitura de hangar de verdade)
const DOOR_SPEC = {
  barrack:   { w: 2.6, h: 3.0 },
  hangar:    { w: 6.0, h: 4.2 },
  warehouse: { w: 3.2, h: 3.6 },
  depot:     { w: 2.4, h: 2.8 },
  building:  { w: 2.2, h: 2.5 },
  ruin:      { w: 2.6, h: 2.5 },
  pavilion:  { w: 2.0, h: 2.4 },
};

// janelas: peitoril acima do alcance do salto (apex 7,4²/(2·22) ≈ 1,24 m),
// verga em 2,75 m — banda 1,55→2,75 deixa PASSAR balas/LOS, segura o jogador.
export const WINDOW_SPEC = { sill: 1.55, head: 2.75, w: 1.5, margin: 1.3, maxPerWall: 3 };
// segunda faixa (acima do mezanino) em estruturas altas — ilumina o piso de cima
export const WINDOW_SPEC_UPPER = { sill: 3.35, head: 4.45, w: 1.7, margin: 1.6, maxPerWall: 2 };

// mezanino: geometria da escada (10 degraus de 24 cm / 34 cm de corrida)
export const MEZZ = { height: 2.4, rise: 0.24, run: 0.34, width: 1.5, steps: 10, front: 0.14 };

const T = 0.26; // espessura das paredes — MESMA do buildShellHost (interiors3d)

// teto de mobília por área útil (evitaEmpilhar em depósitos pequenos)
const maxItemsFor = (s) => Math.max(2, Math.min(7, Math.floor((s.w * s.d) / 16)));

// ---- geometria: retângulo local → AABB mundo (MESMA matemática do Three) ----
// host.rotation.y = θ mapeia local (lx, lz) → mundo:
//   x' = s.x + lx·cosθ + lz·sinθ ;  z' = s.z − lx·sinθ + lz·cosθ
export function localPointToWorld(s, lx, lz) {
  const c = Math.cos(s.rot ?? 0), sn = Math.sin(s.rot ?? 0);
  return { x: s.x + lx * c + lz * sn, z: s.z - lx * sn + lz * c };
}

/**
 * AABB mundo de um retângulo da parede. `axis` = eixo ao longo do qual `u`
 * corre (paredes front/back correm em lx; left/right correm em lz); `v` é a
 * espessura. y0/y1 fecham a caixa vertical.
 */
export function localRectToWorldAabb(s, axis, u0, u1, v0, v1, y0, y1, kind) {
  const corners = axis === 'x'
    ? [[u0, v0], [u1, v0], [u0, v1], [u1, v1]]
    : [[v0, u0], [v1, u0], [v0, u1], [v1, u1]];
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [lx, lz] of corners) {
    const p = localPointToWorld(s, lx, lz);
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
  }
  return { minX, maxX, minZ, maxZ, yMin: y0, yMax: y1, kind: kind ?? s.kind };
}

// retângulo LOCAL da parede por face (mesmas faixas do buildShellHost)
const wallBand = (s, face, u0, u1) => {
  if (face === 'front') return { axis: 'x', v0: -s.d / 2, v1: -s.d / 2 + T };
  if (face === 'back') return { axis: 'x', v0: s.d / 2 - T, v1: s.d / 2 };
  if (face === 'right') return { axis: 'z', v0: s.w / 2 - T, v1: s.w / 2 };
  return { axis: 'z', v0: -s.w / 2, v1: -s.w / 2 + T }; // left
};

// espelha a parede no eixo u (segmentos da esquerda ficam à esquerda no mundo)
const wallAxis = (s, face) => (face === 'front' || face === 'back') ? 'x' : 'z';

/**
 * Aberturas de janela de UMA face — fórmula PURA (sem rng): faixas espalhadas
 * simetricamente ao longo da parede, dentro das margens.
 * @returns {Array<{face,u0,u1,y0,y1}>} vãos (coordenadas locais)
 */
export function windowOpeningsForFace(s, face, isUpper = false) {
  const spec = isUpper ? WINDOW_SPEC_UPPER : WINDOW_SPEC;
  if (s.h < spec.head + 0.8) return [];                  // parede baixa demais
  const len = (face === 'front' || face === 'back') ? s.w : s.d;
  const usable = len - 2 * spec.margin;
  const count = Math.min(spec.maxPerWall, Math.floor(usable / (spec.w + 1.0)));
  if (count < 1 || usable < spec.w) return [];
  const step = usable / count;
  const out = [];
  for (let i = 0; i < count; i++) {
    const c = -len / 2 + spec.margin + step * (i + 0.5);
    out.push({ face, u0: +(c - spec.w / 2).toFixed(2), u1: +(c + spec.w / 2).toFixed(2), y0: spec.sill, y1: spec.head });
  }
  return out;
}

/**
 * Placements determinísticos dos interiores (Fase 23 estendida):
 * MESMA saída da Fase 23 (door/items) + janelas por estrutura + escada/
 * mezanino nas estruturas grandes. A porta continua saindo do rng na MESMA
 * ordem (1 next por estrutura) — densidade só afeta a mobília.
 * @returns {{ scenarioId, structures: Array<{index, kind, door, windows, stairs?, items}>, counts }}
 */
export function interiorDressing(layout, scenario, { seed = 'interiors', density = 1 } = {}) {
  const rng = new SeededRng(`${layout.seed}:${layout.scenarioId}:${seed}`);
  const accent = ACCENTS[scenario.id] ?? ACCENTS.CIGKV;
  const out = [];
  const counts = {};
  const bump = (k) => { counts[k] = (counts[k] ?? 0) + 1; };

  layout.structures.forEach((s, index) => {
    if (!SHELL_KINDS.has(s.kind)) return;
    const frontZ = s.d >= s.w;                      // MESMA regra do facadeDetails
    const face = frontZ ? 'front' : 'right';
    const spec = DOOR_SPEC[s.kind];
    const wallLen = frontZ ? s.w : s.d;             // comprimento da parede da porta
    const dw = Math.min(spec.w, wallLen * .5);
    const du = (rng.next() - .5) * Math.max(0, wallLen - dw - 2.4); // desloca a porta na parede
    const door = { face, w: +dw.toFixed(2), h: spec.h, u: +du.toFixed(2) };

    // janelas: faces que NÃO são a da porta (ruína/pavilhão ficam como eram)
    const windows = [];
    if (WINDOW_KINDS.has(s.kind)) {
      for (const f of ['front', 'back', 'left', 'right']) {
        if (f === door.face) continue;
        windows.push(...windowOpeningsForFace(s, f, false));
        if (MEZZ_KINDS.has(s.kind)) windows.push(...windowOpeningsForFace(s, f, true));
      }
    }

    // escada + mezanino (estruturas grandes): zona de exclusão da mobília
    let stairs = null;
    if (MEZZ_KINDS.has(s.kind) && Math.min(s.w, s.d) >= 11 && s.h >= 6) {
      const z1 = +(s.d * MEZZ.front).toFixed(3);                    // borda do mezanino
      const z0 = +(z1 - MEZZ.steps * MEZZ.run).toFixed(3);          // base da escada
      stairs = {
        x0: +(-s.w / 2 + T).toFixed(3),                             // encostada na parede esquerda
        x1: +(-s.w / 2 + T + MEZZ.width).toFixed(3),
        z0, z1,
        mezzZ0: z1, mezzZ1: +(s.d / 2 - T).toFixed(3),
        height: MEZZ.height, rise: MEZZ.rise, steps: MEZZ.steps, run: MEZZ.run,
      };
    }

    // limites internos (folga das paredes)
    const limU = s.w / 2 - 1.0, limV = s.d / 2 - 1.0;
    // corredor da porta (nada de mobília bloqueando a leitura da entrada)
    const inCorridor = (u, v, m = 1.35) => {
      if (face === 'front') return v < -(s.d / 2 - 2.3) && Math.abs(u - door.u) < dw / 2 + m;
      return u > (s.w / 2 - 2.3) && Math.abs(v - door.u) < dw / 2 + m;
    };
    // Fase 24 — nada de mobília na escada (com folga de subida)
    const inStairs = (u, v) => stairs
      && u > stairs.x0 - 0.7 && u < stairs.x1 + 0.7 && v > stairs.z0 - 0.7 && v < stairs.z1 + 0.7;

    const items = [];
    const fits = (u, v) => {
      if (Math.abs(u) > limU || Math.abs(v) > limV) return false;
      if (inCorridor(u, v)) return false;
      if (inStairs(u, v)) return false;
      return !items.some((p) => Math.hypot(p.u - u, p.v - v) < 1.5);
    };

    const recipe = { ...(KITS[s.kind] ?? {}) };
    recipe[accent.prop] = (recipe[accent.prop] ?? 0) + 1;   // acento do mundo entra sempre
    let budget = Math.max(2, Math.round(maxItemsFor(s) * density));
    for (const [type, count] of Object.entries(recipe)) {
      if (budget <= 0) break;
      const n = Math.max(1, Math.min(budget, Math.round(count * Math.max(density, .5))));
      for (let i = 0; i < n && budget > 0; i++) {
        let placed = false;
        for (let t = 0; t < 14 && !placed; t++) {
          const u = (rng.next() * 2 - 1) * limU;
          const v = (rng.next() * 2 - 1) * limV;
          if (!fits(u, v)) continue;
          items.push({ type, u: +u.toFixed(2), v: +v.toFixed(2), rot: +(rng.next() * Math.PI * 2).toFixed(3), s: +(0.9 + rng.next() * 0.25).toFixed(2) });
          bump(type);
          budget--; placed = true;
        }
        if (!placed) break;
      }
    }
    out.push({ index, kind: s.kind, door, windows, stairs: stairs ?? undefined, items });
  });

  return { scenarioId: scenario.id, structures: out, counts };
}

// ============================================================================
// Fase 24 — COLLIDERS OCOS + FLOORS (pura, consumida por getWorldLayout)
// ============================================================================

const EPS = 1e-4;

/**
 * Decompõe as estruturas-casca em paredes (com vão de porta REAL e faixas de
 * janela), postes de pavilhão, escada/mezanino e guarda-corpo — tudo em AABBs
 * de mundo. Estruturas SEM casca preservam o collider sólido original.
 *
 * @param {object} layout getWorldLayout (mutações: nenhuma — retorna novo array)
 * @param {object} scenario resolveScenario(id)
 * @param {{ dressing?: object }} opts plano de interiores pré-computado (testes)
 * @returns {{ colliders, floors, dressing, replaced, windows, mezzanines, shells }}
 */
export function hollowAccess(layout, scenario, opts = {}) {
  const dressing = opts.dressing ?? interiorDressing(layout, scenario, { density: 1 });
  const shellByIndex = new Map(dressing.structures.map((sp) => [sp.index, sp]));
  const colliders = [];
  const floors = [];
  let windows = 0, mezzanines = 0;
  // Fase 24 — IDEMPOTENTE: layout já oco (cache) traz os sólidos originais em
  // baseColliders; hollowAccess sempre parte dos sólidos, nunca dos segmentos.
  const legacyColliders = layout.baseColliders ?? layout.colliders;

  layout.structures.forEach((s, i) => {
    const spec = shellByIndex.get(i);
    const legacy = legacyColliders[i];
    if (!spec) {
      if (legacy) colliders.push(legacy);                 // estrutura sólida: intocada
      return;
    }
    // fail-safe: o collider legado DEVE ser a pegada da estrutura (lockstep
    // addBox). Se não for (layout futuro), mantém sólido — nunca "mundo furado".
    if (legacy) {
      const match = Math.abs(legacy.minX - (s.x - s.w / 2)) < EPS
        && Math.abs(legacy.maxX - (s.x + s.w / 2)) < EPS
        && Math.abs(legacy.minZ - (s.z - s.d / 2)) < EPS
        && Math.abs(legacy.maxZ - (s.z + s.d / 2)) < EPS;
      if (!match) { colliders.push(legacy); return; }
    }

    const ruin = s.kind === 'ruin';
    const pavilion = s.kind === 'pavilion';

    if (pavilion) {
      // quiosque: 4 postes no lugar da caixa sólida (a cobertura é visual) —
      // centros NO ESPAÇO LOCAL e rotacionados p/ mundo (rot 0/90°)
      const p = .3;
      for (const [px, pz] of [[-s.w / 2 + p, -s.d / 2 + p], [s.w / 2 - p, -s.d / 2 + p], [-s.w / 2 + p, s.d / 2 - p], [s.w / 2 - p, s.d / 2 - p]]) {
        const c = localPointToWorld(s, px, pz);
        colliders.push({ minX: c.x - p, maxX: c.x + p, minZ: c.z - p, maxZ: c.z + p, yMin: s.yMin, yMax: s.yMin + s.h, kind: s.kind });
      }
      return;
    }

    const doorFace = spec.door.face;
    const dw = spec.door.w, dh = spec.door.h;
    for (const face of ['front', 'back', 'left', 'right']) {
      const axis = wallAxis(s, face);
      const band = wallBand(s, face);
      const len = (face === 'front' || face === 'back') ? s.w : s.d;

      if (face === doorFace) {
        // porta: 2 segmentos de altura total + verga (colidível p/ balas)
        const doorC = spec.door.u;
        const leftW = (len / 2 + doorC) - dw / 2;
        const rightW = (len / 2 - doorC) - dw / 2;
        if (leftW > .05) colliders.push(localRectToWorldAabb(s, axis, -len / 2, -len / 2 + leftW, band.v0, band.v1, 0, s.h));
        if (rightW > .05) colliders.push(localRectToWorldAabb(s, axis, len / 2 - rightW, len / 2, band.v0, band.v1, 0, s.h));
        if (!ruin && s.h - dh > .4) {
          colliders.push(localRectToWorldAabb(s, axis, doorC - dw / 2, doorC + dw / 2, band.v0, band.v1, dh, s.h));
        }
        continue;
      }

      if (ruin) {
        // ruína: face inteira sólida (paredes quebradas continuam decorativas —
        // a ENTRADA real fica na porta; comportamento Fase 23 preservado)
        colliders.push(localRectToWorldAabb(s, axis, -len / 2, len / 2, band.v0, band.v1, 0, s.h));
        continue;
      }

      const open = spec.windows.filter((w) => w.face === face);
      if (!open.length) {
        colliders.push(localRectToWorldAabb(s, axis, -len / 2, len / 2, band.v0, band.v1, 0, s.h));
        continue;
      }
      // face com janelas: decomposição por FAIXAS VERTICAIS — peitoril (0→sill),
      // montantes ENTRE vãos (banda aberta p/ balas/LOS), espelho entre bandas
      // (lower→upper) e parapeito acima da última. Cada faixa ganha TODOS os
      // sólidos entre seus vãos — lower e upper nunca se sobrepõem.
      const sorted = [...open].sort((a, b) => a.u0 - b.u0);
      const cuts = [...new Set([0, ...sorted.flatMap((w) => [w.y0, w.y1]).filter((y) => y > 0 && y < s.h), s.h])].sort((a, b) => a - b);
      for (let ci = 0; ci < cuts.length - 1; ci++) {
        const ya = cuts[ci], yb = cuts[ci + 1];
        if (yb - ya < .05) continue;
        // vãos que CUBREM esta faixa vertical (exact match — mesmas specs)
        const covering = sorted.filter((w) => Math.abs(w.y0 - ya) < EPS || (w.y0 <= ya + EPS && w.y1 >= yb - EPS));
        if (!covering.length) {
          colliders.push(localRectToWorldAabb(s, axis, -len / 2, len / 2, band.v0, band.v1, ya, yb));
          continue;
        }
        let cursor = -len / 2;
        for (const w of covering.sort((a, b) => a.u0 - b.u0)) {
          if (w.u0 - cursor > .05) colliders.push(localRectToWorldAabb(s, axis, cursor, w.u0, band.v0, band.v1, ya, yb));
          cursor = Math.max(cursor, w.u1);
        }
        if (len / 2 - cursor > .05) colliders.push(localRectToWorldAabb(s, axis, cursor, len / 2, band.v0, band.v1, ya, yb));
      }
      windows += sorted.length;
    }

    // escada + mezanino: degraus = FLOORS (pisáveis); laje = collider + floor;
    // guarda-corpo = collider alto na borda frontal (exceto a chegada da escada)
    const st = spec.stairs;
    if (st) {
      mezzanines++;
      // (u corre em lx → axis 'x': primeiro par = faixa em X, segundo = faixa em Z)
      for (let k = 0; k < st.steps; k++) {
        const zA = st.z0 + k * st.run, zB = zA + st.run;
        const top = +(st.rise * (k + 1)).toFixed(3);
        const f = localRectToWorldAabb(s, 'x', st.x0, st.x1, zA, zB, top - st.rise, top, 'step');
        floors.push({ minX: f.minX, maxX: f.maxX, minZ: f.minZ, maxZ: f.maxZ, yMax: top });
      }
      const slab = localRectToWorldAabb(s, 'x', -s.w / 2 + T, s.w / 2 - T, st.mezzZ0, st.mezzZ1, st.height - .25, st.height, 'mezz');
      colliders.push(slab);
      floors.push({ minX: slab.minX, maxX: slab.maxX, minZ: slab.minZ, maxZ: slab.maxZ, yMax: st.height });
      // guarda-corpo: borda frontal da laje, da chegada da escada até a parede direita
      const rail = localRectToWorldAabb(s, 'x', st.x1, s.w / 2 - T, st.mezzZ0 - .09, st.mezzZ0 + .09, st.height, st.height + 1.02, 'railing');
      colliders.push(rail);
      // berço lateral da escada: impede entrar POR DENTRO dos degraus
      const stringer = localRectToWorldAabb(s, 'x', st.x1, st.x1 + .24, st.z0, st.z1, 0, st.height, 'stringer');
      colliders.push(stringer);
    }
  });

  return { colliders, floors, dressing, replaced: shellByIndex.size, windows, mezzanines, shells: shellByIndex.size };
}
