// Khaaos Run — Fase 10: LOD de personagens à distância.
// 24 atores com ~4.6k tris cada custam caro em draw calls (~50 meshes/ator).
// Este módulo troca o modelo DETALHADO por um PROXY low-poly (~600 tris, ~10
// meshes) além da distância de troca — mantendo A MESMA API de parts
// (head/torso/legL/legR/armL/armR com pivôs hip/knee/shoulder/elbow nos mesmos
// locais), de modo que animateOperative anima os dois níveis sem saber qual é.
// A decisão usa HISTERESE para não vibrar na fronteira, e o tier de qualidade
// (quality3d) escala os limiares — mobile simplifica mais perto e culla antes.
import * as THREE from 'three';

// Limiares base por tier (metros). full → troca p/ proxy; cull → esconde.
export const LOD_TIERS = {
  low: { full: 16, cull: 170 },
  medium: { full: 22, cull: 220 },
  high: { full: 30, cull: 280 },
};

export function lodThresholds(tier = 'high') {
  return LOD_TIERS[tier] ?? LOD_TIERS.high;
}

// margem de histerese: voltar ao nível melhor exige aproximar 15% além do limiar
const HYST = .15;

// decisão pura: 'full' | 'proxy' | 'hidden'
// `current` é o nível atual (histerese); primeira chamada pode omitir.
export function lodDecision(dist, current = 'full', th = LOD_TIERS.high) {
  if (current === 'hidden') {
    return dist < th.cull * (1 - HYST) ? (dist < th.full ? 'full' : 'proxy') : 'hidden';
  }
  if (current === 'proxy') {
    if (dist < th.full * (1 - HYST)) return 'full';
    if (dist > th.cull) return 'hidden';
    return 'proxy';
  }
  if (dist >= th.cull) return 'hidden';
  if (dist >= th.full) return 'proxy';
  return 'full';
}

// ---------- proxy low-poly (Fase 10) ----------
// Homem-palito anatômico: pelve + tronco cônico + cabeça esférica + membros em
// cápsula com os MESMOS pivôs do modelo detalhado. Sem rosto, acessórios,
// pouches ou mochila — silhueta correta a ≥16 m. Materiais planos por instância.
const _pgeo = new Map();
function pgeo(key, factory) {
  if (!_pgeo.has(key)) _pgeo.set(key, factory());
  return _pgeo.get(key);
}

export function buildOperativeProxy({ skin = '#d9a06b', vest = '#3a3f47' } = {}) {
  const g = new THREE.Group();
  const bodyM = new THREE.MeshStandardMaterial({ color: vest, roughness: .85, metalness: .1 });
  const skinM = new THREE.MeshStandardMaterial({ color: skin, roughness: .7 });
  const gearM = new THREE.MeshStandardMaterial({ color: '#1b1d20', roughness: .85 });
  const mesh = (geo, mat, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    return m;
  };
  const P = {
    cap: (r, l) => pgeo(`c${r}:${l}`, () => new THREE.CapsuleGeometry(r, l, 1, 5)),
    sph: (r) => pgeo(`s${r}`, () => new THREE.SphereGeometry(r, 7, 5)),
    box: (w, h, d) => pgeo(`b${w}:${h}:${d}`, () => new THREE.BoxGeometry(w, h, d)),
  };

  // sombra de contato simplificada (ancora no chão igual ao detalhado)
  const shadow = new THREE.Mesh(
    pgeo('shadow', () => new THREE.PlaneGeometry(1.15, 1.15)),
    new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: .55, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = .02;
  shadow.renderOrder = 1;
  g.add(shadow);

  // pelve + cinto
  const pelvis = mesh(P.sph(.2), bodyM, 0, .84, 0);
  pelvis.scale.set(1.15, .6, .82);
  g.add(pelvis, mesh(P.box(.44, .07, .3), gearM, 0, .94, 0));

  // tronco (grupo — mesmo pivô 1.22) cônico + mochila implícita (1 bloco)
  const torso = new THREE.Group();
  torso.position.set(0, 1.22, 0);
  const chest = mesh(P.cap(.24, .28), bodyM, 0, -.02, 0);
  chest.scale.z = .66;
  torso.add(chest, mesh(P.box(.4, .38, .26), gearM, 0, .02, .12));
  g.add(torso);

  // cabeça (grupo — mesmo pivô .46 local / 1.68 mundo)
  const head = new THREE.Group();
  head.position.set(0, .46, 0);
  const skull = mesh(P.sph(.13), skinM, 0, .01, 0);
  skull.scale.set(.95, 1.06, 1);
  head.add(skull, mesh(P.cap(.06, .07), skinM, 0, -.15, 0)); // pescoço
  torso.add(head);

  // membros: mesmas assinaturas de pivô do modelo detalhado
  const leg = (side) => {
    const hip = new THREE.Group();
    hip.position.set(side * .13, .84, 0);
    const knee = new THREE.Group();
    knee.position.set(0, -.42, 0);
    hip.add(mesh(P.cap(.082, .26), bodyM, 0, -.21, 0));
    knee.add(mesh(P.cap(.066, .24), bodyM, 0, -.19, 0), mesh(P.box(.16, .1, .26), gearM, 0, -.44, .04));
    hip.add(knee);
    g.add(hip);
    return { hip, knee };
  };
  const arm = (side) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * .31, .24, 0);
    const elbow = new THREE.Group();
    elbow.position.set(0, -.31, 0);
    shoulder.add(mesh(P.cap(.062, .2), bodyM, 0, -.16, 0));
    elbow.add(mesh(P.cap(.054, .18), skinM, 0, -.15, 0), mesh(P.sph(.055), gearM, 0, -.3, 0));
    shoulder.add(elbow);
    torso.add(shoulder);
    return { shoulder, elbow };
  };
  const legL = leg(-1), legR = leg(1), armL = arm(-1), armR = arm(1);

  return {
    group: g,
    parts: { head, torso, legL, legR, armL, armR, shadow },
    tris: (() => { let n = 0; g.traverse((o) => { if (o.isMesh) n += o.geometry.index ? o.geometry.index.count / 3 : o.geometry.attributes.position.count / 3; }); return n; })(),
  };
}

// ---------- wrapper ----------
// Root contém detail.group e proxy.group; update(dist) alterna visibilidade com
// histerese. `parts` fica no DETALHADO (armas/anexos continuam funcionando);
// activeParts() entrega o conjunto animável do nível ativo.
export function createCharacterLOD(detail, proxy, { tier = 'high' } = {}) {
  const root = new THREE.Group();
  root.add(detail.group, proxy.group);
  proxy.group.visible = false;
  const th = lodThresholds(tier);
  const lod = {
    group: root,
    parts: detail.parts,
    detailParts: detail.parts,
    proxyParts: proxy.parts,
    th,
    level: 'full',
    update(dist) {
      const next = lodDecision(dist, lod.level, th);
      if (next !== lod.level) {
        lod.level = next;
        const full = next === 'full';
        const hidden = next === 'hidden';
        detail.group.visible = full;
        proxy.group.visible = next === 'proxy';
        root.visible = !hidden;
      }
      return lod.level;
    },
    activeParts() {
      return lod.level === 'proxy' ? proxy.parts : detail.parts;
    },
  };
  return lod;
}
