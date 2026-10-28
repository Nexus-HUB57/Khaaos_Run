// Khaaos Run — Fase 28 — Arsenal & Equipamento (assinatura Free Fire).
//
// Pacote de assets da diretiva de arte (mensagem 23):
//   • AR-47 — fuzil 7.62 com 4 SOCKETS reais (muzzle/optic/mag/grip);
//   • Capacete Nv1-3, Colete Nv1-4 e Mochila Nv1-3 VISÍVEIS no corpo
//     (o gear muda a silhueta — identidade instantânea do loot FF);
//   • Caixa de Morte — onde o operativo cai, o loot fica (caixa metálica
//     com tampa entreaberta, placa de nome e farol de time);
//   • Airdrop de suprimento — caixa blindada desce de paraquedas com
//     sinalizador vermelho, contendo o AR-47 LENDÁRIO.
//
// Contrato headless: TODAS as fábricas usam apenas THREE (Group/Mesh —
// sem document/canvas) e a matemática é PURA e determinística (PRNG
// semeado — zero Math.random). Em Node os meshes existem e podem ser
// inspecionados (contagem de filhos, nomes, userData) nos testes.
import * as THREE from 'three';

// ---------------------------------------------------------------- const ----
export const GEAR_LIMITS = Object.freeze({ vest: 4, helmet: 3, pack: 3 });

export const GEAR_NAMES = Object.freeze({
  vest: Object.freeze(['—', 'Colete Nv1 (Tecido)', 'Colete Nv2 (Placa)', 'Colete Nv3 (Cerâmico)', 'Colete Nv4 (Blindado)']),
  helmet: Object.freeze(['—', 'Capacete Nv1 (Boné)', 'Capacete Nv2 (Casco)', 'Capacete Nv3 (Assalto)']),
  pack: Object.freeze(['—', 'Mochila Nv1 (Assalto)', 'Mochila Nv2 (Campo)', 'Mochila Nv3 (Expedição)']),
});

export const GEAR_ARMOR_BONUS = Object.freeze({ vest: [0, 8, 20, 34, 50], helmet: [0, 4, 12, 22] });

export const SUPPLY_DROP = Object.freeze({
  FRACTION: 0.38,          // acontece a ~38% da duração da partida
  ARMOR_PLATE: 40,         // blindagem da caixa (não é HP de gloo)
  CRATE_LOOT: Object.freeze(['ar47', 'medkit', 'armor']),
});

export const DEATH_BOX_RADIUS = 2.6;   // mesmo alcance de #interact

// ------------------------------------------------------------- helpers ----
export function seededRng(seed = 1) {
  let a = (Number(seed) >>> 0) || 1;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// nível do colete derivado do número de armor (paridade com o estado antigo:
// atores que só pegaram "Placa Cerâmica" também ganham silhueta).
export function gearFromArmor(armor = 0) {
  const a = Math.max(0, Math.min(100, Number(armor) || 0));
  if (a >= 78) return 4;
  if (a >= 54) return 3;
  if (a >= 30) return 2;
  if (a >= 12) return 1;
  return 0;
}

export function describeGearLevel(kind, level = 0) {
  const table = GEAR_NAMES[kind];
  if (!table) return '—';
  return table[Math.max(0, Math.min(table.length - 1, level | 0))];
}

// ----------------------------------------------------------- materiais ----
const M = (color, o = {}) => new THREE.MeshStandardMaterial({
  color, roughness: o.rough ?? .8, metalness: o.metal ?? .12, ...o.extra,
});

// memo global de materiais (compartilhados entre instâncias — draw-friendly)
const _mats = new Map();
function memo(key, factory) {
  if (!_mats.has(key)) _mats.set(key, factory());
  return _mats.get(key);
}

// --------------------------------------------------- meshes de equipamento ----
// Retorna um THREE.Group "flutuando na origem" pronto para ser anexado ao
// anchor correto do operativo (torso p/ vest+pack, head p/ helmet).
// Próteses visuais por nível — cada nível ADICIONA peças (monotônico):
export function buildGearMesh(kind, level, { vestColor = '#3a3f47', accent = '#c8ff3d' } = {}) {
  const g = new THREE.Group();
  g.name = `gear_${kind}_lv${level}`;
  const lvl = Math.max(0, Math.min(GEAR_LIMITS[kind] ?? 0, level | 0));
  if (lvl <= 0) return g;
  const plateM = memo(`gear.plate.${vestColor}`, () => M(vestColor, { rough: .62, metal: .25 }));
  const darkM = memo('gear.dark', () => M('#15171b', { rough: .88 }));
  const fabM = memo('gear.fabric', () => M('#23262c', { rough: .94, metal: .04 }));
  const metalM = memo('gear.metal', () => M('#565b63', { rough: .38, metal: .75 }));
  const glowM = memo(`gear.glow.${accent}`, () => new THREE.MeshStandardMaterial({
    color: accent, emissive: accent, emissiveIntensity: .8, roughness: .5,
  }));

  if (kind === 'vest') {
    // Nv1 tecido — porta-placas de tecido (sobre o peitoral)
    g.add(box(.44, .34, .06, fabM, 0, .04, -.19));
    if (lvl >= 2) { // Nv2 — placa balística frontal rígida
      g.add(box(.4, .3, .05, plateM, 0, .05, -.215));
      g.add(box(.03, .3, .05, darkM, -.215, .05, -.2));   // trilho lateral
      g.add(box(.03, .3, .05, darkM, .215, .05, -.2));
    }
    if (lvl >= 3) { // Nv3 — placa dorsal + gorjo (collar) + placas laterais
      g.add(box(.4, .32, .05, plateM, 0, .05, .2));
      g.add(box(.34, .09, .07, darkM, 0, .24, -.12));      // gorjo
      g.add(box(.04, .24, .2, plateM, -.235, .05, 0));
      g.add(box(.04, .24, .2, plateM, .235, .05, 0));
    }
    if (lvl >= 4) { // Nv4 — ombreiras blindadas + placa púbica + LED de equipe
      g.add(box(.14, .1, .19, plateM, -.24, .26, 0));
      g.add(box(.14, .1, .19, plateM, .24, .26, 0));
      g.add(box(.2, .12, .1, plateM, 0, -.2, -.05));
      g.add(box(.05, .02, .03, glowM, .17, .16, -.23));
    }
  } else if (kind === 'helmet') {
    // Nv1 boné tático (não cobre a nuca)
    g.add(box(.27, .08, .27, fabM, 0, .14, .01));
    g.add(box(.22, .025, .12, fabM, 0, .1, -.17));        // aba
    if (lvl >= 2) { // Nv2 casco balístico — dome + brim (substitui visual do boné)
      g.children.length = 0;                               // níveis substituem, não acumulam
      const dome = ball(.15, plateM, 0, .1, .012, 12, 10, 1.06, .84, 1.12);
      g.add(dome);
      g.add(box(.29, .035, .09, darkM, 0, .1, -.16));      // brim frontal
    }
    if (lvl >= 3) { // Nv3 assalto — casco + óculos balísticos + mount NVG + rails
      g.add(box(.305, .055, .31, memo('gear.goggle', () => new THREE.MeshStandardMaterial({
        color: '#20262e', roughness: .3, metalness: .4, emissive: '#0ea5e9', emissiveIntensity: .35,
      })), 0, .075, .012));
      g.add(box(.05, .045, .05, metalM, .085, .2, .08));   // mount NVG
      g.add(box(.02, .06, .15, darkM, -.15, .14, .01));    // rails
      g.add(box(.02, .06, .15, darkM, .15, .14, .01));
    }
  } else if (kind === 'pack') {
    // Nv1 assault pack compacto
    g.add(box(.3, .3, .12, fabM, 0, .0, .2));
    if (lvl >= 2) { // Nv2 campo — maior + bedroll + tiras
      g.children.length = 0;
      g.add(box(.36, .4, .16, fabM, 0, .01, .21));
      g.add(cyl(.06, .06, .32, darkM, 0, .26, .22, 8));    // bedroll
      g.add(box(.05, .34, .02, darkM, -.12, .0, .29));     // tiras MOLLE
      g.add(box(.05, .34, .02, darkM, .12, .0, .29));
    }
    if (lvl >= 3) { // Nv3 expedição — bolsos laterais + tampa + faixa reflexiva
      g.add(box(.12, .18, .1, darkM, -.2, -.05, .23));
      g.add(box(.12, .18, .1, darkM, .2, -.05, .23));
      g.add(box(.38, .06, .18, darkM, 0, .17, .22));       // tampa
      g.add(box(.36, .03, .02, glowM, 0, -.12, .3));       // faixa de equipe
    }
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  return g;
}

// Anexa/atualiza o gear VISÍVEL num operativo já construído (idempotente:
// re-aplicar o mesmo nível não duplica meshes). Non-destructive — os grupos
// de nível antigo são removidos, a geometria base do operativo é intocada.
// Fase 28: capacete Nv2+ SUBSTITUI o head-gear base do operativo (tag
// userData.baseHeadGear) e mochila Nv1+ substitui a mochila base (tag
// userData.basePack) — sem duplo capacete/mochila sobrepostos.
export function applyOperativeGear(parts, gear = {}) {
  const torso = parts?.torso, head = parts?.head;
  if (!torso || !head) return { vest: null, helmet: null, pack: null };
  const out = {};
  const anchors = { vest: torso, helmet: head, pack: torso };
  const tags = { vest: 'gear_vest', helmet: 'gear_helmet', pack: 'gear_pack' };
  for (const kind of ['vest', 'helmet', 'pack']) {
    const level = Math.max(0, Math.min(GEAR_LIMITS[kind], gear[kind] | 0));
    const anchor = anchors[kind];
    const old = anchor.getObjectByName(tags[kind]);
    if (old) anchor.remove(old);
    if (kind === 'helmet') {
      const replace = level >= 2;
      head.traverse((o) => { if (o.userData?.baseHeadGear) o.visible = !replace; });
    }
    if (kind === 'pack') {
      const replace = level >= 1;
      torso.traverse((o) => { if (o.userData?.basePack) o.visible = !replace; });
    }
    if (level <= 0) { out[kind] = null; continue; }
    const mesh = buildGearMesh(kind, level, { vestColor: parts.userData?.vestColor });
    mesh.name = tags[kind];
    if (kind === 'helmet') mesh.position.set(0, .01, 0);
    if (kind === 'pack') mesh.position.set(0, .02, .02);
    anchor.add(mesh);
    out[kind] = mesh;
  }
  return out;
}

// ------------------------------------------------------------ death box ----
// A caixa de morte FF: corpo metálico, tampa entreaberta, placa com o nome
// do dono e FAROL vertical de time (visível de longe — navegação natural).
export function createDeathBox({ seed = 1, accent = '#ffb52e', name = '' } = {}) {
  const g = new THREE.Group();
  g.name = 'deathBox';
  const rng = seededRng(seed);
  const bodyM = memo('dbox.body', () => M('#2e3338', { rough: .45, metal: .72 }));
  const lidM = memo('dbox.lid', () => M('#3a4046', { rough: .4, metal: .78 }));
  const darkM = memo('dbox.dark', () => M('#17191d', { rough: .8, metal: .3 }));
  const glowM = new THREE.MeshStandardMaterial({
    color: accent, emissive: accent, emissiveIntensity: 1.6, roughness: .4,
  });

  const body = box(.72, .42, .48, bodyM, 0, .21, 0);
  const lip = box(.74, .05, .5, darkM, 0, .44, 0);
  const lid = box(.72, .06, .48, lidM, 0, .5, .12);
  lid.rotation.x = -.5;                                     // tampa entreaberta
  const latch = box(.06, .08, .04, darkM, 0, .3, -.25);
  // pés (não flutua; encosta no chão com 4 sapatas)
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(box(.06, .04, .06, darkM, sx * .3, .02, sz * .19));
  // faixa emissiva de borda (a "boca" da caixa brilha)
  const rim = box(.7, .02, .46, glowM, 0, .455, 0);
  rim.name = 'boxRim';
  // placa de identificação (nome curto no frontal)
  const plate = box(.3, .09, .02, darkM, 0, .24, -.25);
  plate.name = 'namePlate';
  // farol vertical de time (coluna de luz — beacon FF)
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(.05, .09, 5.2, 8, 1, true), new THREE.MeshBasicMaterial({
    color: accent, transparent: true, opacity: .22, depthWrite: false, side: THREE.DoubleSide,
  }));
  beacon.position.y = 2.6; beacon.name = 'beacon';
  const gem = ball(.05, glowM, 0, .5, -.12, 8, 6);
  gem.name = 'lootGem';
  g.add(body, lip, lid, latch, rim, plate, beacon, gem);
  // jitter determinístico de yaw (evita fileira de caixas alinhadas)
  g.rotation.y = (rng() - .5) * .8;
  g.userData = { kind: 'deathBox', name, accent, seed, beaconT: rng() * Math.PI * 2 };
  g.traverse((o) => { if (o.isMesh && o !== beacon) { o.castShadow = true; } });
  return g;
}

// Conteúdo da caixa de morte — PURO: (rng semeado, estado do ator) → lista
// de drops. Leva a arma do caído + munição residual + consumíveis + o gear
// como itens de nível (a identidade do loot FF: matou, herdou).
export function deathBoxContents(rng, actor = {}) {
  const ammoId = actor.ammoId ?? '9MM';
  const ammoLeft = Math.max(0, Math.round(actor.ammoReserve ?? 0));
  const items = [];
  if (actor.weapon && actor.weapon !== 'sucata') items.push({ kind: 'weapon', id: actor.weapon, rarity: actor.weaponSkin ?? null });
  if (ammoLeft > 0) items.push({ kind: 'ammo', id: ammoId, amount: Math.min(ammoLeft, 60) });
  const meds = Math.max(0, Math.min(3, actor.medkit ?? 0));
  for (let i = 0; i < meds; i++) items.push({ kind: 'consumable', id: 'medkit', amount: 1 });
  const frags = Math.max(0, Math.min(2, actor.frag ?? 0));
  for (let i = 0; i < frags; i++) items.push({ kind: 'frag', id: 'frag', amount: 1 });
  const gloos = Math.max(0, Math.min(2, actor.gloo ?? 0));
  for (let i = 0; i < gloos; i++) items.push({ kind: 'gloo', id: 'gloo', amount: 1 });
  const gear = actor.gear ?? {};
  for (const k of ['helmet', 'vest', 'pack']) {
    const lv = Math.min(GEAR_LIMITS[k], Math.max(0, gear[k] | 0));
    if (lv > 0) items.push({ kind: k, id: k, level: lv });
  }
  if (items.length === 0) items.push({ kind: 'ammo', id: ammoId, amount: 12 }); // caixa nunca vazia
  return items;
}

// --------------------------------------------------------- supply drop ----
// Caixa blindada + paraquedas + sinalizador vermelho (fumaça FF).
export function createSupplyDrop({ seed = 1 } = {}) {
  const g = new THREE.Group();
  g.name = 'supplyDrop';
  const rng = seededRng(seed);
  const crateM = memo('sdrop.crate', () => M('#7a2f23', { rough: .5, metal: .5 }));
  const bandM = memo('sdrop.band', () => M('#e8dcc8', { rough: .6 }));
  const metalM = memo('sdrop.metal', () => M('#4b4f55', { rough: .35, metal: .8 }));
  const glowM = new THREE.MeshStandardMaterial({
    color: '#ff3b2f', emissive: '#ff3b2f', emissiveIntensity: 2.2, roughness: .4,
  });

  const crate = box(.9, .66, .66, crateM, 0, .33, 0);
  const band1 = box(.92, .1, .68, bandM, 0, .18, 0);
  const band2 = box(.92, .1, .68, bandM, 0, .5, 0);
  const cross1 = box(.1, .68, .1, metalM, 0, .33, .33);
  const cross2 = box(.1, .68, .1, metalM, 0, .33, -.33);
  const gem = ball(.06, glowM, 0, .7, 0, 8, 6); gem.name = 'lootGem';
  // paraquedas (dossel + 4 suspensões) — some no pouso (userData.paraMesh)
  const canopyMat = new THREE.MeshStandardMaterial({
    color: '#c23a2c', roughness: .9, side: THREE.DoubleSide, transparent: true, opacity: .96,
  });
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(1.5, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2.6), canopyMat);
  canopy.position.y = 3.4; canopy.name = 'canopy';
  const lines = new THREE.Group(); lines.name = 'paraLines';
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const line = cyl(.008, .008, 2.6, metalM, sx * .55, 2.0, sz * .42, 4);
    line.rotation.z = sx * .2; line.rotation.x = -sz * .16;
    lines.add(line);
  }
  // sinalizador: coluna de luz + fumaça (emissor é tickado no main3d)
  const flare = new THREE.Mesh(new THREE.CylinderGeometry(.14, .2, 6.5, 8, 1, true), new THREE.MeshBasicMaterial({
    color: '#ff4633', transparent: true, opacity: .26, depthWrite: false, side: THREE.DoubleSide,
  }));
  flare.position.y = 3.4; flare.name = 'flare';
  g.add(crate, band1, band2, cross1, cross2, gem, canopy, lines, flare);
  g.rotation.y = (rng() - .5) * .6;
  g.userData = { kind: 'supplyDrop', seed, landed: false, beaconT: rng() * Math.PI * 2, canopy, lines, flare };
  g.traverse((o) => { if (o.isMesh && o !== flare) { o.castShadow = true; } });
  return g;
}

// Agendador PURO do airdrop de suprimento — determinístico por seed.
// state = { scheduledTick, done }. Retorna evento ou null.
export function supplyDropEvent(state, { tick, tickRate = 30, durationS = 480, ringX = 0, ringZ = 0, ringR = 120, seed = 1 }) {
  if (!state || state.done) return null;
  if (state.scheduledTick == null) {
    const rng = seededRng(seed);
    state.scheduledTick = Math.max(1, Math.round(durationS * SUPPLY_DROP.FRACTION * tickRate * (0.9 + rng() * 0.2)));
    state.seed = seed;
  }
  if (tick < state.scheduledTick) return null;
  state.done = true;
  const rng = seededRng((state.seed ^ (tick | 0)) >>> 0);
  const ang = rng() * Math.PI * 2;
  const r = Math.min(ringR * .6, 90) * (0.35 + rng() * .5);
  return {
    type: 'supplyDrop',
    x: +(ringX + Math.cos(ang) * r).toFixed(2),
    z: +(ringZ + Math.sin(ang) * r).toFixed(2),
    seed: state.seed,
  };
}

// ------------------------------------------------- geometria compartilhada ----
const _geo = new Map();
function geo(key, factory) {
  if (!_geo.has(key)) _geo.set(key, factory());
  return _geo.get(key);
}
function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}
function ball(r, mat, x = 0, y = 0, z = 0, w = 10, h = 8) {
  const m = new THREE.Mesh(geo(`b${r}:${w}x${h}`, () => new THREE.SphereGeometry(r, w, h)), mat);
  m.position.set(x, y, z);
  return m;
}
function cyl(rt, rb, h, mat, x = 0, y = 0, z = 0, seg = 8) {
  const m = new THREE.Mesh(geo(`c${rt}:${rb}:${h}:${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg)), mat);
  m.position.set(x, y, z);
  return m;
}

// Farol de loot — pulso barato de opacidade (t em segundos, fase por caixa).
export function pulseBeacon(mesh, t, { base = .16, amp = .1, freq = 2.2 } = {}) {
  if (!mesh?.material) return;
  const ph = mesh.parent?.userData?.beaconT ?? 0;
  mesh.material.opacity = base + amp * (.5 + .5 * Math.sin(t * freq + ph));
}
