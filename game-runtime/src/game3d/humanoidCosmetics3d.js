// Khaaos Run — Fase 60: IDENTIDADE VISUAL HUMANA DOS 33 AVATARES EM JOGO.
// ==============================================================================
// Problema: o corpo GLB realista (Fase 57) chegou padronizado — TODOS os atores
// usavam o mesmo rig "nu" sem uniforme, sem acessório de cabeça, sem colete,
// mochila ou ombreira: o "avatar sem identidade". O catálogo canônico
// (shared/character-studio.ts — 16 militares + Lote 4 milícia/gangue, mais o
// TALON do catálogo de avatares) define PALETA, HEADGEAR e Wardrobe por
// identidade, mas nada disso aparecia no corpo humano em partida.
//
// Solução end-to-end: tabela IDENTIDADE_LOOKS (33 entradas, 1:1 com o catálogo)
// + buildHumanoidCosmetics(): malhas low-poly SOLDADAS AOS BONES do rig real
// (headgear no head, colete/placa no spine2, mochila no spine1, ombreiras nos
// shoulders, faixa de facção emissiva no peito). O corpo continua animando pelo
// mixer (os cosméticos são filhos dos bones — seguem a animação).
//
// Headless-safe: apenas THREE puro, geometria paramétrica e matemática
// determinística (hash charCodeAt ponderado — zero Math.random); testável com
// node --test e com nós fake.
//
// Doutrina: FALHA NUNCA QUEBRA O JOGO — dressHumanoid() retorna o body intacto
// em qualquer condição inesperada (mesmo contrato humanoid3d/hero3d).
import * as THREE from 'three';
import { AVATAR_TARGET_HEIGHT } from './avatars3d.js';

// ------------------------------------------------------------- tabela ----
// 1:1 com shared/character-studio.ts (extraído verbatim do catálogo) + TALON
// (operative-avatar-catalog.ts). `palette` = accentColors do catálogo;
// `headgear` = variant visual normalizada da descrição canônica;
// `vest` nível 0-4 (gear3d GEAR_NAMES), `pack` mochila, `pauldrons` ombreiras.
export const IDENTITY_LOOKS = Object.freeze([
  // ═══ 16 operativos militares canônicos ═══
  Object.freeze({ id: 'OP_MALE_VANGUARD', codename: 'KHAEL VANCE', sex: 'M', faction: 'MILITAR', palette: Object.freeze({ primary: '#F97316', secondary: '#7C3AED', trim: '#EAB308' }), headgear: 'headset', vest: 2, pack: true, pauldrons: false }),
  Object.freeze({ id: 'OP_MALE_BREACHER', codename: 'DRAXEN KORR', sex: 'M', faction: 'MILITAR', palette: Object.freeze({ primary: '#EA580C', secondary: '#6D28D9', trim: '#D97706' }), headgear: 'collar', vest: 3, pack: true, pauldrons: true }),
  Object.freeze({ id: 'OP_MALE_RECON_ASIAN', codename: 'REN TANAKA', sex: 'M', faction: 'MILITAR', palette: Object.freeze({ primary: '#06B6D4', secondary: '#7C3AED', trim: '#EAB308' }), headgear: 'mask', vest: 1, pack: true, pauldrons: false }),
  Object.freeze({ id: 'OP_MALE_MEDIC_AFRICAN', codename: 'TARIQ BAKARI', sex: 'M', faction: 'MILITAR', palette: Object.freeze({ primary: '#10B981', secondary: '#6D28D9', trim: '#EAB308' }), headgear: 'monocle', vest: 2, pack: true, pauldrons: false }),
  Object.freeze({ id: 'OP_MALE_HUNTER_INDIGENOUS', codename: 'ARANI YVY', sex: 'M', faction: 'MILITAR', palette: Object.freeze({ primary: '#EF4444', secondary: '#65A30D', trim: '#D97706' }), headgear: 'band', vest: 1, pack: true, pauldrons: false }),
  Object.freeze({ id: 'OP_MALE_MARKSMAN_MENA', codename: 'ZAYN AL-MANSOOR', sex: 'M', faction: 'MILITAR', palette: Object.freeze({ primary: '#D97706', secondary: '#475569', trim: '#EAB308' }), headgear: 'goggles', vest: 2, pack: true, pauldrons: false }),
  Object.freeze({ id: 'OP_MALE_BERSERKER_PACIFIC', codename: 'MANOA TUILAGI', sex: 'M', faction: 'MILITAR', palette: Object.freeze({ primary: '#0284C7', secondary: '#EA580C', trim: '#EAB308' }), headgear: 'none', vest: 4, pack: false, pauldrons: true }),
  Object.freeze({ id: 'OP_MALE_TECH_INDIAN', codename: 'DEVAN SHARMA', sex: 'M', faction: 'MILITAR', palette: Object.freeze({ primary: '#38BDF8', secondary: '#7C3AED', trim: '#EAB308' }), headgear: 'goggles', vest: 1, pack: true, pauldrons: false }),
  Object.freeze({ id: 'OP_FEMALE_VALKYRIE', codename: 'NYRA VEX', sex: 'F', faction: 'MILITAR', palette: Object.freeze({ primary: '#F97316', secondary: '#7C3AED', trim: '#EAB308' }), headgear: 'headset', vest: 2, pack: true, pauldrons: false }),
  Object.freeze({ id: 'OP_FEMALE_SNIPER', codename: 'LYRA SOLIS', sex: 'F', faction: 'MILITAR', palette: Object.freeze({ primary: '#FB923C', secondary: '#475569', trim: '#EAB308' }), headgear: 'headset', vest: 1, pack: true, pauldrons: false }),
  Object.freeze({ id: 'OP_FEMALE_STEALTH_ASIAN', codename: 'MEI-LING ZHOU', sex: 'F', faction: 'MILITAR', palette: Object.freeze({ primary: '#A855F7', secondary: '#334155', trim: '#EAB308' }), headgear: 'mask', vest: 1, pack: false, pauldrons: false }),
  Object.freeze({ id: 'OP_FEMALE_HEAVY_AFRICAN', codename: 'AMARA DIALLO', sex: 'F', faction: 'MILITAR', palette: Object.freeze({ primary: '#F97316', secondary: '#334155', trim: '#EAB308' }), headgear: 'collar', vest: 4, pack: true, pauldrons: true }),
  Object.freeze({ id: 'OP_FEMALE_SURVIVOR_INDIGENOUS', codename: 'KAYAEN APINAJÉ', sex: 'F', faction: 'MILITAR', palette: Object.freeze({ primary: '#10B981', secondary: '#65A30D', trim: '#D97706' }), headgear: 'band', vest: 1, pack: false, pauldrons: false }),
  Object.freeze({ id: 'OP_FEMALE_PILOT_EURO', codename: 'FREJA LINDSTROM', sex: 'F', faction: 'MILITAR', palette: Object.freeze({ primary: '#0284C7', secondary: '#334155', trim: '#EAB308' }), headgear: 'helmet', vest: 2, pack: true, pauldrons: false }),
  Object.freeze({ id: 'OP_FEMALE_DISRUPTOR_MENA', codename: 'SORAYA HADD', sex: 'F', faction: 'MILITAR', palette: Object.freeze({ primary: '#EF4444', secondary: '#7C3AED', trim: '#EAB308' }), headgear: 'headset', vest: 2, pack: true, pauldrons: false }),
  Object.freeze({ id: 'OP_FEMALE_TACTICIAN_SOUTHASIAN', codename: 'PRIYA NAIR', sex: 'F', faction: 'MILITAR', palette: Object.freeze({ primary: '#F59E0B', secondary: '#7C3AED', trim: '#EAB308' }), headgear: 'collar', vest: 2, pack: true, pauldrons: false }),
  // ═══ Lote 4 — milícia urbana (8) ═══
  Object.freeze({ id: 'OP_MIL_MALE_VULTO', codename: 'VULTO', sex: 'M', faction: 'MILICIA_URBANA', palette: Object.freeze({ primary: '#D97706', secondary: '#334155', trim: '#EAB308' }), headgear: 'band', vest: 1, pack: true, pauldrons: false }),
  Object.freeze({ id: 'OP_MIL_MALE_ECO', codename: 'ECO', sex: 'M', faction: 'MILICIA_URBANA', palette: Object.freeze({ primary: '#0EA5E9', secondary: '#334155', trim: '#EAB308' }), headgear: 'headset', vest: 2, pack: true, pauldrons: false }),
  Object.freeze({ id: 'OP_MIL_MALE_FERRAZ', codename: 'FERRAZ', sex: 'M', faction: 'MILICIA_URBANA', palette: Object.freeze({ primary: '#B45309', secondary: '#334155', trim: '#D97706' }), headgear: 'goggles', vest: 1, pack: true, pauldrons: false }),
  Object.freeze({ id: 'OP_MIL_MALE_GRAU', codename: 'GRAU', sex: 'M', faction: 'MILICIA_URBANA', palette: Object.freeze({ primary: '#65A30D', secondary: '#334155', trim: '#D97706' }), headgear: 'cap', vest: 1, pack: true, pauldrons: false }),
  Object.freeze({ id: 'OP_MIL_FEMALE_NOTA', codename: 'NOTA', sex: 'F', faction: 'MILICIA_URBANA', palette: Object.freeze({ primary: '#DC2626', secondary: '#334155', trim: '#EAB308' }), headgear: 'band', vest: 1, pack: false, pauldrons: false }),
  Object.freeze({ id: 'OP_MIL_FEMALE_SIRENE', codename: 'SIRENE', sex: 'F', faction: 'MILICIA_URBANA', palette: Object.freeze({ primary: '#7C3AED', secondary: '#334155', trim: '#EAB308' }), headgear: 'band', vest: 1, pack: false, pauldrons: false }),
  Object.freeze({ id: 'OP_MIL_FEMALE_SORO', codename: 'SORO', sex: 'F', faction: 'MILICIA_URBANA', palette: Object.freeze({ primary: '#10B981', secondary: '#334155', trim: '#D97706' }), headgear: 'mask', vest: 1, pack: false, pauldrons: false }),
  Object.freeze({ id: 'OP_MIL_FEMALE_CORUJA', codename: 'CORUJA', sex: 'F', faction: 'MILICIA_URBANA', palette: Object.freeze({ primary: '#334155', secondary: '#7C3AED', trim: '#D97706' }), headgear: 'hood', vest: 1, pack: false, pauldrons: false }),
  // ═══ Lote 4 — gangue urbana (8) ═══
  Object.freeze({ id: 'OP_GNG_MALE_SPRAY', codename: 'SPRAY', sex: 'M', faction: 'GANGUE_URBANA', palette: Object.freeze({ primary: '#22C55E', secondary: '#334155', trim: '#D97706' }), headgear: 'mask', vest: 0, pack: false, pauldrons: false }),
  Object.freeze({ id: 'OP_GNG_MALE_VENTANIA', codename: 'VENTANIA', sex: 'M', faction: 'GANGUE_URBANA', palette: Object.freeze({ primary: '#F97316', secondary: '#334155', trim: '#D97706' }), headgear: 'band', vest: 0, pack: false, pauldrons: false }),
  Object.freeze({ id: 'OP_GNG_MALE_CORTA', codename: 'CORTA', sex: 'M', faction: 'GANGUE_URBANA', palette: Object.freeze({ primary: '#EF4444', secondary: '#334155', trim: '#D97706' }), headgear: 'band', vest: 1, pack: false, pauldrons: false }),
  Object.freeze({ id: 'OP_GNG_MALE_BAILE', codename: 'BAILE', sex: 'M', faction: 'GANGUE_URBANA', palette: Object.freeze({ primary: '#EC4899', secondary: '#334155', trim: '#D97706' }), headgear: 'headset', vest: 0, pack: false, pauldrons: false }),
  Object.freeze({ id: 'OP_GNG_FEMALE_ROTA', codename: 'ROTA', sex: 'F', faction: 'GANGUE_URBANA', palette: Object.freeze({ primary: '#F59E0B', secondary: '#334155', trim: '#D97706' }), headgear: 'helmet', vest: 0, pack: false, pauldrons: false }),
  Object.freeze({ id: 'OP_GNG_FEMALE_COTOVELA', codename: 'COTOVELA', sex: 'F', faction: 'GANGUE_URBANA', palette: Object.freeze({ primary: '#F43F5E', secondary: '#334155', trim: '#D97706' }), headgear: 'headset', vest: 0, pack: false, pauldrons: false }),
  Object.freeze({ id: 'OP_GNG_FEMALE_SOMBRA', codename: 'SOMBRA', sex: 'F', faction: 'GANGUE_URBANA', palette: Object.freeze({ primary: '#64748B', secondary: '#334155', trim: '#D97706' }), headgear: 'hood', vest: 0, pack: false, pauldrons: false }),
  Object.freeze({ id: 'OP_GNG_FEMALE_PIXEL', codename: 'PIXEL', sex: 'F', faction: 'GANGUE_URBANA', palette: Object.freeze({ primary: '#06B6D4', secondary: '#334155', trim: '#D97706' }), headgear: 'goggles', vest: 0, pack: false, pauldrons: false }),
  // ═══ TALON — corredor urbano suplementar (catálogo de avatares) ═══
  Object.freeze({ id: 'OP_MALE_TALON', codename: 'TALON', sex: 'M', faction: 'MILITAR', palette: Object.freeze({ primary: '#F97316', secondary: '#7C3AED', trim: '#EAB308' }), headgear: 'band', vest: 1, pack: false, pauldrons: false }),
]);

export const IDENTITY_IDS = Object.freeze(IDENTITY_LOOKS.map((l) => l.id));
const LOOK_BY_ID = new Map(IDENTITY_LOOKS.map((l) => [l.id, l]));
export const IDENTITY_COUNT = IDENTITY_LOOKS.length; // 33 — contrato do catálogo

// hash determinístico com AVALANCHE (FNV-1a + finalizador murmur): seeds
// sequenciais (bot-01…bot-99) espalham uniformemente pelo roster 33 —
// puro, sem Math.random, estável entre sessões.
export function identityHash(key) {
  const s = String(key ?? 'khaaos');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return h >>> 0;
}

/**
 * Look de uma identidade do catálogo. Id desconhecido NUNCA falha: deriva um
 * look genérico determinístico pelo próprio id (militar neutro, sexo pelo
 * hash) — bots e remotos desconhecidos continuam HUMANOS com vestimenta.
 */
export function resolveIdentityLook(id) {
  const direct = LOOK_BY_ID.get(String(id ?? ''));
  if (direct) return direct;
  const h = identityHash(id);
  const sex = h % 2 === 0 ? 'M' : 'F';
  return Object.freeze({
    id: `generic:${String(id ?? 'unknown')}`,
    codename: 'ZHEERS',
    sex,
    faction: 'MILITAR',
    palette: Object.freeze({
      primary: ['#F97316', '#0EA5E9', '#10B981', '#A855F7'][h % 4],
      secondary: '#334155',
      trim: '#EAB308',
    }),
    headgear: ['headset', 'band', 'goggles', 'cap'][h % 4],
    vest: 1 + ((h >> 3) % 3),
    pack: (h >> 5) % 2 === 0,
    pauldrons: false,
    generic: true,
  });
}

/** Corpo GLB do pool humanoide CORRETO POR SEXO da identidade (Fase 60). */
const POOL_BY_SEX = Object.freeze({
  M: Object.freeze(['animated-avatar-m-01', 'rigged-avatar-m-01', 'rigged-avatar-m-02', 'rigged-avatar-m-04']),
  F: Object.freeze(['rigged-avatar-f-01', 'rigged-avatar-f-03']),
});
export function poolBodyForIdentity(id) {
  const look = resolveIdentityLook(id);
  const pool = POOL_BY_SEX[look.sex] ?? POOL_BY_SEX.M;
  return pool[identityHash(id) % pool.length];
}

/** Id do roster (33) para um seed de bot — a arena inteira vira o catálogo. */
export function identityForBot(seed) {
  return IDENTITY_IDS[identityHash(seed) % IDENTITY_IDS.length];
}

// --------------------------------------------------------- materiais ----
// cache compartilhado por cor — cada look usa 3 cores; 33 looks = poucas
// combinações distintas; materiais NÃO são descartados por-corpo (intencional:
// câche vivo do módulo, mesma doutrina dos caches de clip/loader).
const matCache = new Map();
function materialFor(hex, { emissive = 0, roughness = .82, metalness = .12 } = {}) {
  const key = `${hex}|${emissive}`;
  if (matCache.has(key)) return matCache.get(key);
  const m = new THREE.MeshStandardMaterial({
    color: hex, roughness, metalness,
    emissive: emissive ? hex : '#000000',
    emissiveIntensity: emissive,
  });
  matCache.set(key, m);
  return m;
}
export function resetCosmeticsMaterialCache() { matCache.clear(); }

const GEO = {
  cap: new THREE.SphereGeometry(.115, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2.15),
  helmet: new THREE.SphereGeometry(.13, 14, 10, 0, Math.PI * 2, 0, Math.PI / 1.9),
  visor: new THREE.BoxGeometry(.155, .045, .03),
  mask: new THREE.BoxGeometry(.115, .09, .062),
  band: new THREE.CylinderGeometry(.112, .112, .045, 12, 1, true),
  hood: new THREE.SphereGeometry(.14, 12, 10, 0, Math.PI * 2, 0, Math.PI / 1.65),
  headset: new THREE.BoxGeometry(.21, .035, .045),
  collar: new THREE.CylinderGeometry(.085, .105, .11, 10, 1, true),
  plate: new THREE.BoxGeometry(.24, .3, .1),
  pack: new THREE.BoxGeometry(.21, .3, .12),
  pauldron: new THREE.SphereGeometry(.075, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2),
  trim: new THREE.BoxGeometry(.19, .022, .012),
};

function mesh(geo, mat, name) {
  const m = new THREE.Mesh(geo, mat);
  m.name = name;
  m.castShadow = true;
  return m;
}

/**
 * Constrói o pacote de cosméticos da identidade: { group, attach(body) }.
 * Cada peça é filha do BONE correspondente do rig real (head/spine1/spine2/
 * shoulders) — segue a animação do GLB. Escalas em metros canônicos 1.8.
 */
export function buildHumanoidCosmetics(look) {
  const p = look.palette;
  const uniformMat = materialFor(p.primary, { roughness: .78, metalness: .08 });
  const darkMat = materialFor(p.secondary, { roughness: .9, metalness: .05 });
  const trimMat = materialFor(p.trim, { emissive: .45, roughness: .5, metalness: .35 });
  const group = new THREE.Group();
  group.name = `cosmetics_${look.id}`;

  // --- headgear (bone head) ---
  const headParts = [];
  switch (look.headgear) {
    case 'helmet': {
      const h = mesh(GEO.helmet, darkMat, 'hg_helmet');
      h.position.set(0, .055, 0);
      const visor = mesh(GEO.visor, trimMat, 'hg_visor');
      visor.position.set(0, -.02, -.075);
      headParts.push(h, visor);
      break;
    }
    case 'cap': {
      const c = mesh(GEO.cap, uniformMat, 'hg_cap');
      c.position.set(0, .055, 0);
      const brim = mesh(new THREE.BoxGeometry(.16, .012, .09), darkMat, 'hg_brim');
      brim.position.set(0, .045, -.09);
      headParts.push(c, brim);
      break;
    }
    case 'band': {
      const b = mesh(GEO.band, uniformMat, 'hg_band');
      b.position.set(0, .075, 0);   // cilindro em torno do eixo Y da cabeça
      headParts.push(b);
      break;
    }
    case 'hood': {
      const h = mesh(GEO.hood, darkMat, 'hg_hood');
      h.position.set(0, .04, .015);
      h.rotation.x = -.25;
      headParts.push(h);
      break;
    }
    case 'mask': {
      const m = mesh(GEO.mask, uniformMat, 'hg_mask');
      m.position.set(0, -.045, -.055);
      headParts.push(m);
      break;
    }
    case 'headset': {
      const band2 = mesh(GEO.headset, darkMat, 'hg_headset');
      band2.position.set(0, .06, 0);
      const cupL = mesh(new THREE.CylinderGeometry(.035, .035, .02, 10), trimMat, 'hg_cupL');
      cupL.rotation.z = Math.PI / 2;
      cupL.position.set(.085, 0, 0);
      const cupR = cupL.clone();
      cupR.name = 'hg_cupR';
      cupR.position.x = -.085;
      headParts.push(band2, cupL, cupR);
      break;
    }
    case 'goggles':
    case 'monocle': {
      const v = mesh(GEO.visor, look.headgear === 'monocle' ? trimMat : darkMat, 'hg_goggles');
      v.position.set(look.headgear === 'monocle' ? .04 : 0, .015, -.07);
      if (look.headgear === 'monocle') v.scale.set(.45, 1, 1);
      headParts.push(v);
      break;
    }
    case 'collar': {
      const c = mesh(GEO.collar, darkMat, 'hg_collar');
      c.position.set(0, .02, 0);
      headParts.push(c);
      break;
    }
    default: break; // 'none' — identidade sem headgear (BERSERKER usa ombreiras)
  }

  // --- colete/placa (bone spine2) + faixa de facção emissiva ---
  const vestParts = [];
  if (look.vest > 0) {
    const plate = mesh(GEO.plate, darkMat, 'vest_plate');
    plate.position.set(0, .05, -.005);
    plate.scale.set(1, 1, .55 + .12 * Math.min(4, look.vest));
    vestParts.push(plate);
  }
  const trim = mesh(GEO.trim, trimMat, 'faction_trim');
  trim.position.set(0, .12, -.075);
  vestParts.push(trim);

  // --- mochila (bone spine1, costas = +z local do torso mixamo) ---
  const packParts = [];
  if (look.pack) {
    const pack = mesh(GEO.pack, uniformMat, 'pack_body');
    pack.position.set(0, .04, .085);
    packParts.push(pack);
  }

  // --- ombreiras: UMA peça por ombro (espaço local do próprio bone) ---
  const shoulderParts = [];
  if (look.pauldrons) {
    const padL = mesh(GEO.pauldron, darkMat, 'pauldron_L');
    padL.position.set(.03, .015, 0);
    const padR = mesh(GEO.pauldron, darkMat, 'pauldron_R');
    padR.position.set(-.03, .015, 0);
    shoulderParts.push(padL, padR);
  }

  return {
    look,
    headParts,
    vestParts,
    packParts,
    shoulderParts,
    /** Anexa as peças aos bones do corpo real (idempotente por grupo). */
    attach(body) {
      if (!body?.bones || !body?.root) return false;
      if (body.root.userData.cosmeticGroup) { // re-dress: tira as peças ANTIGAS dos bones
        const old = body.root.userData.cosmeticGroup;
        for (const m of old.userData?.cosmeticParts ?? []) m.parent?.remove?.(m);
        if (old?.parent) old.parent.remove(old);
      }
      group.userData.cosmeticLook = look.id;
      group.userData.avatarCosmetic = true;
      group.userData.cosmeticParts = [...headParts, ...vestParts, ...packParts, ...shoulderParts];
      const put = (parts, boneName) => {
        const bone = body.bones[boneName];
        if (!bone) return;
        for (const m of parts) bone.add(m);
      };
      put(headParts, 'head');
      put(vestParts, 'spine2');
      put(packParts, 'spine1');
      put(shoulderParts.filter((m) => m.name === 'pauldron_L'), 'leftshoulder');
      put(shoulderParts.filter((m) => m.name === 'pauldron_R'), 'rightshoulder');
      // grupo fantoches as peças só para inspeção/testes (peças vivem nos bones)
      group.visible = false;
      body.root.add(group);
      body.root.userData.cosmeticGroup = group;
      return true;
    },
  };
}

/**
 * Vista o corpo humano com a identidade (roupa/acessórios/facção).
 * Idempotente; NUNCA lança — falha devolve o body intacto (doutrina F57).
 */
export function dressHumanoid(body, look) {
  try {
    if (!body?.root || !look) return body;
    const kit = buildHumanoidCosmetics(look);
    kit.attach(body);
    return body;
  } catch { return body; }
}

// escala visual dos cosméticos para corpos normalizados (1.8 m canônico).
export const COSMETIC_SCALE = AVATAR_TARGET_HEIGHT / 1.8; // = 1 — documentado p/ ajuste
