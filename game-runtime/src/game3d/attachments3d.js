// Khaaos Run — Fase 30 — ANEXOS DA AR-47 (4 sockets) + SKIN MÍTICA EVOLUTIVA.
//
// Diretiva de arte (mensagem 23 + follow-up): a AR-47 nasce com 4 sockets reais
// (muzzle/optic/mag/grip — Fase 28). Esta fase os torna PRODUTIVOS:
//   • ANEXOS VISUAIS — Mira 4x (optic), Silenciador (muzzle), Mag Estendida
//     (mag) e Empunhadura Vertical (grip): cada anexo tem malha procedural
//     própria montada na âncora do socket + efeito de gameplay real (puro);
//   • SKIN MÍTICA EVOLUTIVA — "AR-47 · Fúria Primordial": raridade MÍTICA que
//     EVOLUI por abates (4 estágios FF): runas emissivas → núcleo de energia →
//     aleta holográfica + aura. Estágio derivado de kills (função PURA).
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
export const MYTHIC_SKIN = Object.freeze({
  id: 'MITICA', weapon: 'ar47', stages: 4,
  name: 'AR-47 · Fúria Primordial',
  aura: '#ff2d78',
});

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

// --------------------------------------------------------- materiais ----
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
export function buildAttachmentMesh(attachId) {
  const def = ATTACHMENTS[attachId];
  const g = new THREE.Group();
  g.name = `attach_${def?.id ?? attachId}`;
  if (!def) return g;

  const gunMetal = memo('att.metal', () => M('#1c1f24', { rough: .4, metal: .82 }));
  const gunDark = memo('att.dark', () => M('#101215', { rough: .5, metal: .7 }));
  const polymer = memo('att.poly', () => M('#26292e', { rough: .78, metal: .12 }));

  if (attachId === 'mira4x') {
    // tubo da luneta + objetiva azul emissiva + montagem em rail
    const tube = cyl(.032, .032, .2, gunMetal, 0, .045, .02, 10);
    tube.rotation.x = Math.PI / 2;                       // alinhado ao eixo da arma (z)
    const ocular = cyl(.038, .034, .045, gunDark, 0, .045, .125, 10);
    ocular.rotation.x = Math.PI / 2;
    const lensM = glowMat('#3b82f6', 1.1); lensM.roughness = .15;
    const lens = cyl(.026, .026, .012, lensM, 0, .045, -.085, 10);
    lens.rotation.x = Math.PI / 2; lens.name = 'opticLens';
    const mount = box(.03, .05, .07, gunDark, 0, .005, .02);
    g.add(tube, ocular, lens, mount);
  } else if (attachId === 'silenciador') {
    // supressor cilíndrico com anéis de dissipação
    const body = cyl(.042, .042, .19, gunDark, 0, .015, -.095, 12);
    body.rotation.x = Math.PI / 2; body.name = 'suppressor';
    const ring1 = cyl(.048, .048, .02, gunMetal, 0, .015, -.035, 12);
    ring1.rotation.x = Math.PI / 2;
    const ring2 = cyl(.048, .048, .02, gunMetal, 0, .015, -.09, 12);
    ring2.rotation.x = Math.PI / 2;
    const tip = cyl(.03, .03, .015, gunMetal, 0, .015, -.19, 10);
    tip.rotation.x = Math.PI / 2;
    g.add(body, ring1, ring2, tip);
  } else if (attachId === 'magestendida') {
    // pente alongado levemente curvado (2 segmentos) + base reforçada
    const upper = box(.055, .16, .088, gunDark, 0, -.06, -.004);
    upper.rotation.x = .1;
    const lower = box(.055, .12, .086, gunDark, 0, -.185, -.022);
    lower.rotation.x = .22;
    const base = box(.06, .035, .09, polymer, 0, -.248, -.038);
    base.rotation.x = .22;
    const band = box(.058, .02, .09, glowMat('#c8ff3d', .5), 0, -.13, -.012);
    band.rotation.x = .16; band.name = 'magBand';
    g.add(upper, lower, base, band);
  } else if (attachId === 'gripvertical') {
    // foregrip vertical com sulcos de dedos
    const stem = box(.045, .11, .05, polymer, 0, -.055, 0);
    stem.rotation.x = -.12;
    const root = box(.07, .03, .07, gunDark, 0, .005, .006);
    const groove = box(.048, .02, .052, gunDark, 0, -.03, .004);
    const groove2 = box(.046, .02, .05, gunDark, 0, -.06, .008);
    const groove3 = box(.044, .02, .048, gunDark, 0, -.09, .012);
    g.add(stem, root, groove, groove2, groove3);
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  return g;
}

// Monta os anexos nas âncoras do socket da AR-47 (idempotente: limpa anexos
// antigos por socket antes de montar — re-aplicar não duplica). Não-AR-47 ou
// socket inexistente é simplesmente ignorado (contrato compat: ['ar47']).
export function applyAttachments(weaponGroup, attachments = []) {
  const sockets = weaponGroup?.userData?.sockets;
  if (!sockets) return [];
  const applied = [];
  const seen = new Set();
  for (const id of attachments) {
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
    const mesh = buildAttachmentMesh(id);
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
export function applyMythicSkin(weaponGroup, stage = 1, { color = MYTHIC_SKIN.aura } = {}) {
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
