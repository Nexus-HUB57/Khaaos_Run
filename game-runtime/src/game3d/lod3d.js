// Khaaos Run — Fase 10: LOD de personagens à distância.
// 24 atores com ~4.6k tris cada custam caro em draw calls (~50 meshes/ator).
// Este módulo troca o modelo DETALHADO por um PROXY low-poly (~600 tris, ~10
// meshes) além da distância de troca — mantendo A MESMA API de parts
// (head/torso/legL/legR/armL/armR com pivôs hip/knee/shoulder/elbow nos mesmos
// locais), de modo que animateOperative anima os dois níveis sem saber qual é.
// A decisão usa HISTERESE para não vibrar na fronteira, e o tier de qualidade
// (quality3d) escala os limiares — mobile simplifica mais perto e culla antes.
import * as THREE from 'three';

// Limiares base por tier (metros). full → troca p/ proxy; sil → troca p/
// silhueta sólida; cull → esconde. low simplifica mais perto e culla antes.
export const LOD_TIERS = {
  low: { full: 16, sil: 65, cull: 170 },
  medium: { full: 22, sil: 80, cull: 220 },
  high: { full: 30, sil: 95, cull: 280 },
};

export function lodThresholds(tier = 'high') {
  return LOD_TIERS[tier] ?? LOD_TIERS.high;
}

// margem de histerese: voltar ao nível melhor exige aproximar 15% além do limiar
const HYST = .15;

// decisão pura: 'full' | 'proxy' | 'silhouette' | 'hidden'
// `current` é o nível atual (histerese); primeira chamada pode omitir.
// Sem th.sil (wrapper 2 níveis legado), 'silhouette' nunca é emitida.
export function lodDecision(dist, current = 'full', th = LOD_TIERS.high) {
  const hasSil = th.sil != null;
  if (current === 'hidden') {
    if (dist >= th.cull * (1 - HYST)) return 'hidden';
    if (dist < th.full) return 'full';
    return hasSil && dist >= th.sil ? 'silhouette' : 'proxy';
  }
  if (current === 'silhouette') {
    if (dist > th.cull) return 'hidden';
    if (dist < th.sil * (1 - HYST)) return dist < th.full ? 'full' : 'proxy';
    return 'silhouette';
  }
  if (current === 'proxy') {
    if (dist > th.cull) return 'hidden';
    if (dist < th.full * (1 - HYST)) return 'full';
    if (hasSil && dist >= th.sil) return 'silhouette';
    return 'proxy';
  }
  if (dist >= th.cull) return 'hidden';
  if (hasSil && dist >= th.sil) return 'silhouette';
  if (dist >= th.full) return 'proxy';
  return 'full';
}

// ---------- LOD por frustum (Fase 13) ----------
// A cadeia por distância ignora ONDE o ator está na tela: 24 atores fora de visão
// continuam no nível detalhado (~50 draw calls cada) e sendo animados. O frustum
// resolve em duas frentes conservadoras:
//   1. ator FORA do cone de visão por N frames seguidos → distância EFETIVA
//      penalizada (acelera full→proxy→silhouette→hidden — tudo que está fora da
//      tela pode custar zero sem pop visível);
//   2. atores PERTES (dist < minDist = limiar full do tier) NUNCA são penalizados —
//      sombra/pose dos próximos permanecem corretas quando a câmera vira.
// O teste de cone usa margem angular de segurança + raio do ator: só recorta o que
// está BEM fora (ator meio visível na borda continua inside).

// margem angular de segurança (≈4°) — evita flicker na borda do frustum
export const FRUSTUM_MARGIN = 0.07;

// Teste puro: o ator (esfera de raio `radius`) está no frustum da câmera?
// cam = { fov (graus, convenção THREE), aspect }. Cone do half-FOV DIAGONAL
// (o frustum real é maior que o vertical) + atan2(radius, dist) do ator + margem.
export function frustumContains(camPos, camDir, cam, actorPos, radius = .9) {
  const dx = actorPos.x - camPos.x, dy = actorPos.y - camPos.y, dz = actorPos.z - camPos.z;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) return true;                       // ator NA câmera: dentro
  const dot = (dx * camDir.x + dy * camDir.y + dz * camDir.z) / len;
  if (dot <= 0) return false;                        // atrás da câmera
  const halfV = Math.tan(cam.fov * Math.PI / 360);   // half-FOV vertical
  const halfDiag = Math.atan(halfV * Math.sqrt(1 + cam.aspect * cam.aspect));
  const actorAng = Math.atan2(radius, len);          // esfera do ator projeta ângulo
  const limit = Math.min(Math.PI / 2, halfDiag + actorAng + FRUSTUM_MARGIN);
  return Math.acos(Math.min(1, dot)) <= limit;
}

// Portão por ator: conta frames fora e devolve { inside, effectiveDist }.
// penalty só aplica APÓS framesOut frames consecutivos fora E dist ≥ minDist
// (atores próximos ficam detalhados mesmo fora de tela — sombra entra no quadro
// quando a câmera vira). Reentrada zera o contador (histerese da cadeia cuida
// da transição de volta).
export function createFrustumGate({ fovY = 75, aspect = 16 / 9, penalty = 1.4, framesOut = 18, minDist = 0 } = {}) {
  const cam = { fov: fovY, aspect };
  let out = 0;
  return {
    get outFrames() { return out; },
    update(dist, camPos, camDir, actorPos, radius = .9) {
      const inside = frustumContains(camPos, camDir, cam, actorPos, radius);
      out = inside ? 0 : Math.min(out + 1, framesOut * 2);
      const penalized = !inside && out >= framesOut && dist >= minDist;
      return { inside, effectiveDist: penalized ? dist * penalty : dist };
    },
  };
}

// ---------- proxy low-poly (Fase 10; reconstruído organicamente na F34) ----------
// MINI-OPERATIVO orgânico: pelve elíptica, tronco V-taper cônico (seção elíptica),
// crânio esférico + capacete, membros em cápsula suave (8 lados) com ombrelos,
// joelheiras e PÉS ARTICULADOS (pivô foot igual ao detalhado — a passada rola
// calcanhar→ponta também à distância; antes os pés congelavam no proxy).
// Sem rosto, acessórios, pouches ou mochila retangular — silhueta correta a
// ≥16 m com a MESMA gramática orgânica do modelo detalhado. Materiais planos
// por instância. Orçamento contratado: ≤ 1200 tris (contrato recalibrado na
// F34: o teto de 900 foi dimensionado p/ o homem-palito de ~300 tris; o proxy
// orgânico custa ~1190 e segue ≥3× mais leve que o detalhado, ≤ 26 meshes).
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
  const bootM = new THREE.MeshStandardMaterial({ color: '#141517', roughness: .7 });
  const mesh = (geo, mat, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    return m;
  };
  const P = {
    // F57 — cápsulas parametrizadas: membros em 6 lados (suave a ≥16 m),
    // tronco em 8; esferas com segmentos por papel (crânio 8×6, detalhes 5×4).
    // Orçamento orgânico contratado: ≤ 1200 tris (recalibrado do teto de 900
    // que dimensionava o homem-palito).
    cap: (r, l, c = 1, rad = 6) => pgeo(`c${r}:${l}:${c}:${rad}`, () => new THREE.CapsuleGeometry(r, l, c, rad)),
    sph: (r, w = 7, h = 5) => pgeo(`s${r}:${w}x${h}`, () => new THREE.SphereGeometry(r, w, h)),
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

  // pelve elíptica + cinto (a caixa grande do "palito" saiu)
  const pelvis = mesh(P.sph(.2, 6, 4), bodyM, 0, .84, 0);
  pelvis.scale.set(1.15, .6, .82);
  g.add(pelvis, mesh(P.box(.44, .07, .3), gearM, 0, .94, 0));

  // tronco (grupo — mesmo pivô 1.22): V-taper cônico com seção elíptica +
  // colete cônico + mochila ARREDONDADA (cápsula deitada) em vez de bloco
  const torso = new THREE.Group();
  torso.position.set(0, 1.22, 0);
  const chest = mesh(P.cap(.24, .28, 1, 8), bodyM, 0, -.02, 0);
  chest.scale.z = .66;
  const pack = mesh(P.cap(.14, .2), gearM, 0, -.02, .21);
  pack.rotation.x = Math.PI / 2;
  pack.scale.set(1.25, 1, .8);
  torso.add(chest, pack);
  g.add(torso);

  // cabeça (grupo — mesmo pivô .46 local / 1.68 mundo): crânio + mandíbula +
  // capacete com casco arredondado (identidade visual do detalhado à distância)
  const head = new THREE.Group();
  head.position.set(0, .46, 0);
  const skull = mesh(P.sph(.13, 8, 6), skinM, 0, .01, 0);
  skull.scale.set(.95, 1.06, 1);
  const jaw = mesh(P.sph(.07, 5, 4), skinM, 0, -.07, -.015);
  jaw.scale.set(1.05, .8, 1.1);
  const dome = mesh(P.sph(.145, 6, 5), gearM, 0, .1, .01);
  dome.scale.set(1.05, .85, 1.12);
  head.add(skull, jaw, dome); // (pescoço omitido: invisível a ≥16 m)
  torso.add(head);

  // membros: mesmas assinaturas de pivô do modelo detalhado + PIVÔ FOOT
  const leg = (side) => {
    const hip = new THREE.Group();
    hip.position.set(side * .13, .84, 0);
    const knee = new THREE.Group();
    knee.position.set(0, -.42, 0);
    const foot = new THREE.Group();
    foot.position.set(0, -.31, .01);
    const boot = mesh(P.cap(.062, .1), bootM, 0, -.1, .03);
    boot.rotation.x = Math.PI / 2;
    boot.scale.set(1.1, 1, 1.35);
    foot.add(boot);
    hip.add(mesh(P.cap(.082, .26), bodyM, 0, -.21, 0));
    knee.add(mesh(P.sph(.06, 5, 4), bodyM, 0, -.1, .045), mesh(P.sph(.07, 5, 4), gearM, 0, -.01, -.005));
    knee.add(mesh(P.cap(.066, .24), bodyM, 0, -.19, 0));
    knee.add(foot);
    hip.add(knee);
    g.add(hip);
    return { hip, knee, foot };
  };
  const arm = (side) => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * .31, .24, 0);
    const elbow = new THREE.Group();
    elbow.position.set(0, -.31, 0);
    shoulder.add(mesh(P.sph(.09, 5, 4), bodyM, 0, .01, 0));            // deltóide
    shoulder.add(mesh(P.cap(.062, .2), bodyM, 0, -.16, 0));            // manga
    elbow.add(mesh(P.cap(.054, .18), bodyM, 0, -.15, 0), mesh(P.sph(.055, 5, 4), gearM, 0, -.3, 0)); // luva
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

// ---------- silhueta sólida (Fase 12 — LOD 2) ----------
// Um ÚNICO volume convexo (tronco-cápsula) + cabeça + sombra: 2 meshes, ~150
// tris, UM material — silhueta legível a >80 m por um draw call ridículo.
// Sem animação (activeParts() → null); rotação de morte na raiz continua
// valendo porque a silhueta vive dentro do mesmo root.
export function buildOperativeSilhouette({ vest = '#3a3f47' } = {}) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: vest, roughness: .92, metalness: .04 });
  const body = new THREE.Mesh(pgeo('sil-body', () => new THREE.CapsuleGeometry(.27, .82, 2, 7)), mat);
  body.position.y = .92;
  // F34 — taper de silhueta: ombrelos mais largos que a profundidade (leitura
  // humana de frente/costas em vez de cilindro perfeito). Zero tris extras.
  body.scale.set(1.08, 1, .88);
  body.castShadow = true;
  const head = new THREE.Mesh(pgeo('sil-head', () => new THREE.SphereGeometry(.15, 7, 5)), mat);
  head.position.y = 1.6;
  head.scale.set(.95, 1.08, 1);
  head.castShadow = true;
  const shadow = new THREE.Mesh(
    pgeo('shadow', () => new THREE.PlaneGeometry(1.15, 1.15)),
    new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: .55, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = .02;
  shadow.renderOrder = 1;
  g.add(body, head, shadow);
  return {
    group: g,
    parts: { shadow },
    tris: (() => { let n = 0; g.traverse((o) => { if (o.isMesh) n += o.geometry.index ? o.geometry.index.count / 3 : o.geometry.attributes.position.count / 3; }); return n; })(),
  };
}

// ---------- wrapper ----------
// Root contém detail.group, proxy.group e (opcional) silhouette.group; update
// (dist) alterna visibilidade com histerese. `parts` fica no DETALHADO (armas/
// anexos continuam funcionando); activeParts() entrega o conjunto animável do
// nível ativo — NULL no nível silhueta (nada para animar). Retrocompatível:
// createCharacterLOD(detail, proxy, { tier }) segue 2 níveis sem silhueta.
export function createCharacterLOD(detail, proxy, silhouette = null, opts = {}) {
  if (silhouette && !silhouette.group) { opts = silhouette; silhouette = null; }  // assinatura legado
  const root = new THREE.Group();
  root.add(detail.group, proxy.group);
  if (silhouette) root.add(silhouette.group);
  proxy.group.visible = false;
  if (silhouette) silhouette.group.visible = false;
  const thFull = lodThresholds(opts.tier);
  const th = silhouette ? thFull : { full: thFull.full, cull: thFull.cull };  // legado sem sil
  const lod = {
    group: root,
    parts: detail.parts,
    detailParts: detail.parts,
    proxyParts: proxy.parts,
    silhouetteParts: silhouette ? silhouette.parts : null,
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
        if (silhouette) silhouette.group.visible = next === 'silhouette';
        root.visible = !hidden;
      }
      return lod.level;
    },
    activeParts() {
      if (lod.level === 'proxy') return proxy.parts;
      if (lod.level === 'silhouette') return null;   // nada para animar a >80 m
      return detail.parts;
    },
  };
  return lod;
}
