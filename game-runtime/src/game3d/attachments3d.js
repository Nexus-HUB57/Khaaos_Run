// Khaaos Run — Fase 30/31/32 — ANEXOS (4 sockets) + SKINS MÍTICAS EVOLUTIVAS.
//
// Diretiva de arte (mensagem 23 + follow-ups): a AR-47 nasceu com 4 sockets
// reais (muzzle/optic/mag/grip — Fase 28); a Fase 31 generalizou os sockets
// para M4/MP5/G19/Barrett. A Fase 32 fecha o ciclo end-to-end:
//   • SKINS MÍTICAS PARA O ARSENAL — MYTHIC_SKINS: cada arma com sockets tem
//     identidade mítica PRÓPRIA (nome, cor de aura e encaixe do overlay).
//     Evolução idêntica à da AR-47: 4 estágios por abates (função PURA);
//   • ANEXOS POR RARIDADE — variantes visuais GASTO→DOURADO: o MESMO anexo
//     nasce COMUM (metal riscado, fosco), INCOMUM (padrão), RARO (acento
//     violeta), LENDÁRIO (ouro fosco) ou MÍTICO (ouro polido + emissivo) —
//     chip de raridade legível à distância, material por raridade (memo);
//   • FIT POR ARMA — o overlay mítico escala/desloca por arma (pistola .55×,
//     sniper 1.6×) sem tocar as fábricas de armas.
//
// Contrato headless (idêntico ao gear3d): fábricas usam apenas THREE
// (Group/Mesh — sem document/canvas), lógica é PURA e determinística, e os
// meshes podem ser inspecionados em Node (nomes, filhos, userData).
import * as THREE from 'three';
import { RARITIES, ATTACHMENT_COMPAT } from '../shared/weapons.js';

// ---------------------------------------------------------------- catálogo ----
// socket ∈ {muzzle,optic,mag,grip} — âncoras reais criadas nas fábricas de
// armas (entities3d). Fase 31: a compatibilidade vive em ATTACHMENT_COMPAT
// (shared/weapons.js) — fonte única consumida por HUD, loot e sim.
export const ATTACHMENTS = Object.freeze({
  mira4x: Object.freeze({
    id: 'mira4x', name: 'Mira 4x', short: '4X', socket: 'optic', compatible: ATTACHMENT_COMPAT.mira4x,
    description: 'Luneta de aumento 4x — ADS aproxima 22% e alcance +8%.',
  }),
  silenciador: Object.freeze({
    id: 'silenciador', name: 'Silenciador', short: 'SIL', socket: 'muzzle', compatible: ATTACHMENT_COMPAT.silenciador,
    description: 'Supressor de boca — sem clarão e thump abafado dedicado.',
  }),
  magestendida: Object.freeze({
    id: 'magestendida', name: 'Mag Estendida', short: 'MAG', socket: 'mag', compatible: ATTACHMENT_COMPAT.magestendida,
    description: 'Carregador alongado — +balas conforme a classe da arma.',
  }),
  gripvertical: Object.freeze({
    id: 'gripvertical', name: 'Empunhadura Vertical', short: 'GRP', socket: 'grip', compatible: ATTACHMENT_COMPAT.gripvertical,
    description: 'Foregrip vertical — dispersão -20% (cadência livre).',
  }),
});

export const ATTACH_SOCKETS = Object.freeze(['muzzle', 'optic', 'mag', 'grip']);

// ---------------------------------------------------------------- stats ----
// Efeito de gameplay PURO — a sim usa isto para derivar o estado do ator.
// magBonus  → capacidade do pente (sim #pickup/#reload) — escalado pela
//             CLASSE da arma (pistola +8, SMG +12, fuzil/sniper +15)
// spreadMul → multiplicador de dispersão (sim #fire)
// adsZoom   → multiplicador de FOV em ADS (main3d)
// rangeMul  → alcance de voo do projétil (sim #spawnBullet)
// silenced  → shot event sem clarão + áudio thump abafado (main3d/audio3d)
export function attachmentStats(attachments = [], weaponId = null) {
  const has = (id) => attachments.includes(id);
  const magBonusBase = weaponId === 'g19' ? 8 : (weaponId === 'mp5' ? 12 : 15);
  return Object.freeze({
    magBonus: has('magestendida') ? magBonusBase : 0,
    spreadMul: has('gripvertical') ? 0.8 : 1,
    adsZoom: has('mira4x') ? 0.78 : 1,          // 42° → ~33° em ADS
    rangeMul: has('mira4x') ? 1.08 : 1,
    silenced: has('silenciador'),
  });
}

// ---------------------------------------------------------------- evolução ----
// Fase 32 — CATÁLOGO MÍTICO POR ARMA: toda arma com sockets tem skin
// evolutiva própria (mesma régua de estágios; identidade visual distinta).
//   fit — encaixe do overlay no corpo da arma (escala/offset local): pistola
//   é ~1/3 do fuzil, sniper ~1.6×. O overlay é genérico (spine/runas); o fit
//   o assenta em cada silhueta sem tocar as fábricas de armas.
export const MYTHIC_SKINS = Object.freeze({
  ar47: Object.freeze({
    id: 'MITICA', weapon: 'ar47', stages: 4,
    name: 'AR-47 · Fúria Primordial',
    aura: '#ff2d78',                              // rosa-caos (assinatura F30)
    fit: Object.freeze({ scale: 1, y: 0, z: 0 }),
  }),
  m4: Object.freeze({
    id: 'MITICA', weapon: 'm4', stages: 4,
    name: 'M4 · Sentinela de Éter',
    aura: '#35e1ff',                              // ciano-éter (linha fria)
    fit: Object.freeze({ scale: 1.22, y: 0, z: -.05 }),
  }),
  mp5: Object.freeze({
    id: 'MITICA', weapon: 'mp5', stages: 4,
    name: 'MP5 · Vaga-lume Urbano',
    aura: '#b6ff3c',                              // lima-tóxica (bioluminescência)
    fit: Object.freeze({ scale: .88, y: 0, z: -.06 }),
  }),
  barrett: Object.freeze({
    id: 'MITICA', weapon: 'barrett', stages: 4,
    name: 'Barrett · Julgamento Orbital',
    aura: '#b47bff',                              // violeta-orbital
    fit: Object.freeze({ scale: 1.6, y: .02, z: -.1 }),
  }),
  g19: Object.freeze({
    id: 'MITICA', weapon: 'g19', stages: 4,
    name: 'G19 · Eco Espectral',
    aura: '#8ef7e0',                              // menta-espectral
    fit: Object.freeze({ scale: .55, y: 0, z: -.02 }),
  }),
});

// Alias legado (Fase 30) — a AR-47 continua sendo a referência canônica.
export const MYTHIC_SKIN = MYTHIC_SKINS.ar47;

// Resolução PURA: skin mítica da arma (null se não tiver — sucata/pulse).
export function mythicSkinFor(weaponId = null) {
  return MYTHIC_SKINS[weaponId] ?? null;
}

export const MYTHIC_STAGE_NAMES = Object.freeze([
  'Forja Bruta', 'Marca do Caos', 'Despertar Primordial', 'Fúria Primordial',
]);

// Kills necessários por estágio (FF: evolui com uso em partida). PURA.
// 0 abates → estágio 1 (base); 2 → 2; 4 → 3; 6 → 4 (final).
export function mythicStageFromKills(kills = 0) {
  const k = Math.max(0, kills | 0);
  if (k >= 6) return 4;
  if (k >= 4) return 3;
  if (k >= 2) return 2;
  return 1;
}

// ---------------------------------------------- raridade dos anexos ----
// Fase 32 — TRATAMENTO DE MATERIAL POR RARIDADE (visual gasto→dourado).
// O MESMO anexo é forjado em 5 acabamentos; leitura à distância pelo CHIP
// emissivo (cor = tabela central RARITIES) + corpo/acentos:
//   COMUM    — metal GASTO: fosco, escurecido, com arranhões claros;
//   INCOMUM  — padrão de fábrica (tabela da F30) + chip ciano;
//   RARO     — corpo padrão + acentos violeta emissivos;
//   LENDARIO — banho de ouro FOSCO nos acentos;
//   MITICA   — ouro POLIDO + emissivo dourado (vitrine de end-game).
export const ATTACHMENT_RARITY_TREATMENTS = Object.freeze({
  COMUM: Object.freeze({ body: '#33363a', rough: .9, metal: .3, accent: null, chip: '#b7c2c7', glow: 0, worn: true }),
  INCOMUM: Object.freeze({ body: '#1c1f24', rough: .55, metal: .7, accent: '#42d9de', chip: '#42d9de', glow: .8, worn: false }),
  RARO: Object.freeze({ body: '#1c1f24', rough: .5, metal: .74, accent: '#a875ff', chip: '#a875ff', glow: 1.1, worn: false }),
  LENDARIO: Object.freeze({ body: '#3d3423', rough: .38, metal: .88, accent: '#ffb52e', chip: '#ffb52e', glow: 1.3, worn: false }),
  MITICA: Object.freeze({ body: '#c9a23f', rough: .16, metal: .95, accent: '#ffd75e', chip: '#ffd75e', glow: 1.8, worn: false }),
});

// Resolução da raridade de um anexo: mapa {id:rarity}, array paralelo,
// string única ou null (padrão INCOMUM — retrocompatível com F30/31). PURA.
export function attachmentRarityFor(rarities, attachId = null, index = 0) {
  if (typeof rarities === 'string') return ATTACHMENT_RARITY_TREATMENTS[rarities] ? rarities : 'INCOMUM';
  if (Array.isArray(rarities)) {
    const r = rarities[index] ?? rarities[attachId];
    return ATTACHMENT_RARITY_TREATMENTS[r] ? r : 'INCOMUM';
  }
  if (rarities && typeof rarities === 'object') {
    const r = rarities[attachId];
    return ATTACHMENT_RARITY_TREATMENTS[r] ? r : 'INCOMUM';
  }
  return 'INCOMUM';
}

const M = (color, o = {}) => new THREE.MeshStandardMaterial({
  color, roughness: o.rough ?? .55, metalness: o.metal ?? .6, ...o.extra,
});

const _mats = new Map();
function memo(key, factory) {
  if (!_mats.has(key)) _mats.set(key, factory());
  return _mats.get(key);
}

function glowMat(color, intensity = 1.4) {
  // material emissivo NOVO por chamada (cada anexo/estágio pulsa de forma
  // independente sem vazar intensidade entre instâncias)
  return new THREE.MeshStandardMaterial({
    color, emissive: color, emissiveIntensity: intensity, roughness: .35, metalness: .2,
  });
}

// ------------------------------------------------- malhas dos anexos ----
// Cada fábrica retorna um Group com pivô NA ÂNCORA do socket (origem local =
// ponto de montagem). Z- = frente da arma (mesma convenção das fábricas F28).
export function buildAttachmentMesh(attachId, { rarity = 'INCOMUM' } = {}) {
  const def = ATTACHMENTS[attachId];
  const g = new THREE.Group();
  g.name = `attach_${def?.id ?? attachId}`;
  if (!def) return g;

  // Fase 32 — acabamento por raridade (memo com chave de raridade: zero
  // vazamento de material entre tiers; acentos/chip são da cor do tier).
  const tier = ATTACHMENT_RARITY_TREATMENTS[rarity] ? rarity : 'INCOMUM';
  const treat = ATTACHMENT_RARITY_TREATMENTS[tier];
  g.userData.rarity = tier;
  const gunMetal = memo(`att.metal:${tier}`, () => M(treat.body, { rough: treat.rough, metal: treat.metal }));
  const gunDark = memo(`att.dark:${tier}`, () => M('#101215', { rough: Math.min(.92, treat.rough + .12), metal: treat.metal * .82 }));
  const polymer = memo(`att.poly:${tier}`, () => M('#26292e', { rough: Math.max(.6, treat.rough + .2), metal: .12 }));
  const accentM = treat.accent ? glowMat(treat.accent, treat.glow) : gunMetal;
  const chipM = memo(`att.chip:${tier}`, () => glowMat(treat.chip, treat.glow + .5));

  if (attachId === 'mira4x') {
    // tubo da luneta + objetiva azul emissiva + montagem em rail
    const tube = cyl(.032, .032, .2, gunMetal, 0, .045, .02, 10);
    tube.rotation.x = Math.PI / 2;                       // alinhado ao eixo da arma (z)
    const ocular = cyl(.038, .034, .045, gunDark, 0, .045, .125, 10);
    ocular.rotation.x = Math.PI / 2;
    const lensM = glowMat('#3b82f6', 1.1); lensM.roughness = .15;
    const lens = cyl(.026, .026, .012, lensM, 0, .045, -.085, 10);
    lens.rotation.x = Math.PI / 2; lens.name = 'opticLens';
    const mount = box(.03, .05, .07, treat.accent ? accentM : gunDark, 0, .005, .02);
    g.add(tube, ocular, lens, mount);
    if (treat.worn) g.add(box(.021, .006, .05, wearMat(), .02, .052, -.01)); // risco no tubo
  } else if (attachId === 'silenciador') {
    // supressor cilíndrico com anéis de dissipação
    const body = cyl(.042, .042, .19, gunDark, 0, .015, -.095, 12);
    body.rotation.x = Math.PI / 2; body.name = 'suppressor';
    const ring1 = cyl(.048, .048, .02, accentM, 0, .015, -.035, 12);
    ring1.rotation.x = Math.PI / 2;
    const ring2 = cyl(.048, .048, .02, accentM, 0, .015, -.09, 12);
    ring2.rotation.x = Math.PI / 2;
    const tip = cyl(.03, .03, .015, gunMetal, 0, .015, -.19, 10);
    tip.rotation.x = Math.PI / 2;
    g.add(body, ring1, ring2, tip);
    if (treat.worn) g.add(box(.05, .005, .045, wearMat(), 0, .043, -.05));  // risco no corpo
  } else if (attachId === 'magestendida') {
    // pente alongado levemente curvado (2 segmentos) + base reforçada
    const upper = box(.055, .16, .088, gunDark, 0, -.06, -.004);
    upper.rotation.x = .1;
    const lower = box(.055, .12, .086, gunDark, 0, -.185, -.022);
    lower.rotation.x = .22;
    const base = box(.06, .035, .09, polymer, 0, -.248, -.038);
    base.rotation.x = .22;
    const band = box(.058, .02, .09, accentM, 0, -.13, -.012);
    band.rotation.x = .16; band.name = 'magBand';
    g.add(upper, lower, base, band);
    if (treat.worn) g.add(box(.056, .005, .05, wearMat(), 0, -.09, .042));  // risco no pente
  } else if (attachId === 'gripvertical') {
    // foregrip vertical com sulcos de dedos
    const stem = box(.045, .11, .05, polymer, 0, -.055, 0);
    stem.rotation.x = -.12;
    const root = box(.07, .03, .07, treat.accent ? accentM : gunDark, 0, .005, .006);
    const groove = box(.048, .02, .052, gunDark, 0, -.03, .004);
    const groove2 = box(.046, .02, .05, gunDark, 0, -.06, .008);
    const groove3 = box(.044, .02, .048, gunDark, 0, -.09, .012);
    g.add(stem, root, groove, groove2, groove3);
    if (treat.worn) g.add(box(.046, .005, .05, wearMat(), 0, -.045, .026)); // risco no grip
  }

  // CHIP DE RARIDADE — leitura de tier à distância (cor = tabela central)
  const chipPos = {
    mira4x: [0, .085, .02], silenciador: [0, .06, -.095],
    magestendida: [0, -.06, .046], gripvertical: [0, .025, .006],
  }[attachId] ?? [0, 0, 0];
  const chip = box(.018, .018, .018, chipM, chipPos[0], chipPos[1], chipPos[2]);
  chip.name = 'rarityChip';
  g.add(chip);

  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  return g;
}

// material de desgaste (arranhões claros do tier COMUM) — memo
function wearMat() {
  return memo('att.wear', () => M('#8b9096', { rough: .95, metal: .15 }));
}

// Monta os anexos nas âncoras do socket da arma (idempotente: limpa anexos
// antigos por socket antes de montar — re-aplicar não duplica). Arma sem
// âncoras ou socket inexistente é simplesmente ignorado. Fase 32: `rarities`
// (mapa {id:rarity} | array paralelo | string | null) escolhe o acabamento
// de cada anexo (gasto→dourado).
export function applyAttachments(weaponGroup, attachments = [], rarities = null) {
  const sockets = weaponGroup?.userData?.sockets;
  if (!sockets) return [];
  const applied = [];
  const seen = new Set();
  let idx = -1;
  for (const id of attachments) {
    idx++;
    const def = ATTACHMENTS[id];
    if (!def || seen.has(def.socket)) continue;         // um anexo por socket
    seen.add(def.socket);
    const anchor = sockets[def.socket];
    if (!anchor) continue;
    // limpa anexo antigo do MESMO socket (troca limpa, sem leak de malha)
    for (const child of [...anchor.children]) {
      anchor.remove(child);
      child.traverse?.((o) => { o.geometry?.dispose?.(); });
    }
    const mesh = buildAttachmentMesh(id, { rarity: attachmentRarityFor(rarities, id, idx) });
    anchor.add(mesh);
    applied.push(mesh);
  }
  // sockets sem anexo ficam limpos (remove leftovers de builds anteriores)
  for (const socket of ATTACH_SOCKETS) {
    if (seen.has(socket)) continue;
    const anchor = sockets[socket];
    for (const child of [...(anchor?.children ?? [])]) {
      anchor.remove(child);
      child.traverse?.((o) => { o.geometry?.dispose?.(); });
    }
  }
  return applied;
}

// ------------------------------------------------- skin mítica evolutiva ----
// Overlay EVOLUTIVO sobre qualquer arma: runas emissivas crescem com o
// estágio. Estágio 1: faixa sutil no receiver; 2: runas laterais + ventes;
// 3: núcleo de energia exposto + bordas incandescentes; 4: aleta holográfica
// + faixa de aura (main3d pulsa userData.mythicPulse). Determinístico.
export function applyMythicSkin(weaponGroup, stage = 1, { color = MYTHIC_SKIN.aura, fit = null } = {}) {
  if (!weaponGroup || stage < 1) return null;
  const old = weaponGroup.getObjectByName('mythic_fx');
  if (old) {
    weaponGroup.remove(old);
    old.traverse?.((o) => { o.geometry?.dispose?.(); });
  }
  if (stage > 1 || weaponGroup.userData.mythicPulse == null) {
    weaponGroup.userData.mythicPulse = 0;
  }
  weaponGroup.userData.mythicStage = stage;

  const g = new THREE.Group();
  // Fase 32 — encaixe do overlay na silhueta da arma (escala/offset do fit)
  if (fit && typeof fit === 'object') {
    g.scale.setScalar(Math.max(.1, fit.scale ?? 1));
    g.position.set(0, fit.y ?? 0, fit.z ?? 0);
  }
  g.name = 'mythic_fx';
  const runeM = glowMat(color, 1.2 + stage * .35);
  runeM.name = 'mythicRune';
  const hotM = glowMat(color, 1.8 + stage * .5);
  hotM.name = 'mythicHot';

  // faixa dorsal do receiver (todas as armas — silhueta universal)
  const spine = box(.02, .022, .3, runeM, 0, .062, -.1);
  g.add(spine);
  if (stage >= 2) {
    // runas laterais + ventes incandescentes
    g.add(box(.014, .016, .22, runeM, .04, .02, -.2));
    g.add(box(.014, .016, .22, runeM, -.04, .02, -.2));
    g.add(box(.018, .014, .06, hotM, 0, .05, -.32));
  }
  if (stage >= 3) {
    // núcleo de energia exposto + bordas do furniture incandescentes
    const core = ball(.028, hotM, 0, .03, -.05, 8, 6);
    core.name = 'mythicCore';
    g.add(core);
    g.add(box(.022, .012, .16, hotM, .034, -.045, -.15));
    g.add(box(.022, .012, .16, hotM, -.034, -.045, -.15));
  }
  if (stage >= 4) {
    // aleta holográfica (plano duplo-face translúcido) + faixa de aura
    const holoM = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: .5, depthWrite: false, side: THREE.DoubleSide,
    });
    holoM.name = 'mythicHolo';
    const fin = new THREE.Mesh(new THREE.ConeGeometry(.05, .2, 4), holoM);
    fin.position.set(0, .12, .16); fin.rotation.x = -.35;
    fin.name = 'mythicFin';
    const aura = new THREE.Mesh(
      new THREE.CylinderGeometry(.06, .09, 1.1, 8, 1, true),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .16, depthWrite: false, side: THREE.DoubleSide }),
    );
    aura.position.y = .1; aura.name = 'mythicAura';
    g.add(fin, aura);
    weaponGroup.userData.mythicAura = true;
  } else {
    weaponGroup.userData.mythicAura = false;
  }
  weaponGroup.add(g);
  return g;
}

// Pulso de brilho das armas míticas ativas (barato: material emissivo único).
// main3d chama por frame com o relógio global. Seguro contra armas removidas —
// o grupo órfão sai do registry automaticamente (sem leak).
const _mythicRegistry = new Set();
export function registerMythic(weaponGroup) {
  if (weaponGroup?.userData?.mythicStage >= 1) _mythicRegistry.add(weaponGroup);
}
export function unregisterMythic(weaponGroup) {
  _mythicRegistry.delete(weaponGroup);
}
export function tickMythicWeapons(t) {
  for (const g of _mythicRegistry) {
    if (!g.parent) { _mythicRegistry.delete(g); continue; }
    const stage = g.userData.mythicStage ?? 1;
    g.userData.mythicPulse = .5 + .5 * Math.sin(t * (2 + stage * .6));
    const fx = g.getObjectByName('mythic_fx');
    if (fx) for (const child of fx.children) {
      if (child.material?.emissiveIntensity !== undefined && child.material.name !== 'mythicHolo') {
        child.material.emissiveIntensity = (1.1 + stage * .3) * (.75 + .45 * g.userData.mythicPulse);
      }
    }
  }
}

// cor de raridade centralizada (HUD/loot/fábricas usam a MESMA tabela)
export function rarityColor(rarity) {
  return RARITIES[rarity]?.color ?? null;
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
function cyl(rt, rb, h, mat, x = 0, y = 0, z = 0, seg = 8) {
  const m = new THREE.Mesh(geo(`c${rt}:${rb}:${h}:${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg)), mat);
  m.position.set(x, y, z);
  return m;
}
function ball(r, mat, x = 0, y = 0, z = 0, w = 10, h = 8) {
  const m = new THREE.Mesh(geo(`b${r}:${w}x${h}`, () => new THREE.SphereGeometry(r, w, h)), mat);
  m.position.set(x, y, z);
  return m;
}
