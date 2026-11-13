// Khaaos Run — Fase 57: CORPO HUMANO REALISTA EM JOGO (rigs GLB Tripo).
//
// Problema eliminado por este módulo: os rigs realistas (GLB, esqueleto Mixamo
// de 23 joints) existiam apenas na VITRINE do menu e atrás de `?avatar=` — em
// partida o jogador e todos os atores seguiam no CORPO PROCEDURAL antigo
// (blocos/insígnias com senoides) — o "avatar robotizado" da era Fase 9.
//
// Solução end-to-end: o GLB humano passa a ser o corpo PADRÃO de TODOS os
// atores em jogo (jogador em 3ª pessoa + bots + remotos), com:
//   • LOCOMOÇÃO HUMANA fase-travada (gait.js): walk/run são amostrados pela
//     FASE da passada (metros percorridos), não pelo relógio — os pés do clip
//     aterrisam onde o corpo chega (zero patinação, herdando F42);
//   • BLEND por peso EWMA idle↔walk↔run (suave, sem pop);
//   • MIRA procedural aditiva (spine1/spine2 + cabeça) sobre o mixer;
//   • AGACHAMENTO (hips abaixam + tronco inclina), QUEDA LIVRE (pose espalhada),
//     RASTEJO DBNO (deitado arrastando braços) e MORTE (relaxa, caído assenta);
//   • ARMA SOLDADA NA MÃO DIREITA por frame (bone world → arma), mantendo o
//     grip no punho do corpo REAL (fim da arma no corpo procedural invisível);
//   • FALLBACK DOCTRINE (hero3d/avatars3d): qualquer falha de load/rig → o
//     chamador mantém createOperative() procedural — o boot NUNCA quebra.
//
// Retarget implícito: TODOS os rigs Tripo compartilham o MESMO esqueleto
// (nomes `mixamorig:*`, 23 joints) — os clips do animated-avatar-m-01
// (idle/walk/run) rebinam diretamente nos demais rigs (binding por NOME).
//
// Headless-safe: THREE puro + boneMap PURA (aceita nós fake em testes);
// determinístico (zero Math.random); importável por node --test.

import * as THREE from 'three';
import { clone as skeletonClone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { avatarById, loadAvatarGlb, normalizeAvatarScale, fitAvatarToGround } from './avatars3d.js';
import { ewma } from './gait.js';

// Rigs com ESQUELETO real (animated ou rigged) — elegíveis para gameplay.
// Estáticos (T/A-pose sem skin) ficam de fora: corpo que não anima regrediria.
export const HUMANOID_AVATAR_POOL = Object.freeze([
  'animated-avatar-m-01',  // clips embutidos (idle/run/shoot/walk/standing_relax)
  'rigged-avatar-m-01',
  'rigged-avatar-m-02',
  'rigged-avatar-m-04',
  'rigged-avatar-f-01',
  'rigged-avatar-f-03',
]);

// GLB-fonte dos CLIPS de locomoção (o único tier animated do lote).
export const HUMANOID_CLIP_SOURCE = 'animated-avatar-m-01';

// Escape hatch explícito p/ ?avatar=: mantém o corpo procedural legado.
export const LEGACY_BODY_IDS = Object.freeze(['legacy', 'off', '0', 'none']);

// hash determinístico de string → índice do pool (mesmo esquema do repo:
// charCodeAt ponderado, sem Math.random).
export function pickAvatarForActor(seed) {
  const s = String(seed ?? 'khaaos');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return HUMANOID_AVATAR_POOL[h % HUMANOID_AVATAR_POOL.length];
}

/**
 * Resolve o avatar de GAMEPLAY de um ator:
 *  • override em LEGACY_BODY_IDS → null (corpo procedural legado, escape hatch);
 *  • override ∈ pool (rigged/animated) → o override;
 *  • override estático/inválido → null (não anima: procedural assume);
 *  • sem override → determinístico pelo seed do ator.
 */
export function resolveGameplayAvatar(overrideId, seed) {
  if (overrideId != null && overrideId !== '') {
    const id = String(overrideId);
    if (LEGACY_BODY_IDS.includes(id.toLowerCase())) return null;  // escape hatch
    if (HUMANOID_AVATAR_POOL.includes(id)) return id;             // escolha explícita
    return null; // estático/inválido p/ gameplay (não anima) → procedural
  }
  return pickAvatarForActor(seed);
}

// boneMap PURA: atravessa .children e normaliza nomes `mixamorig:Xxx` →
// chave minúscula sem prefixo (hips, spine, spine1, spine2, neck, head,
// leftshoulder…, righthand…). NÃO usa THREE — testável com nós fake.
const BONE_KEYS = [
  'hips', 'spine', 'spine1', 'spine2', 'neck', 'head',
  'leftshoulder', 'leftarm', 'leftforearm', 'lefthand',
  'rightshoulder', 'rightarm', 'rightforearm', 'righthand',
  'leftupleg', 'leftleg', 'leftfoot', 'lefttoebase',
  'rightupleg', 'rightleg', 'rightfoot', 'righttoebase',
];
export function normalizeBoneName(name) {
  return String(name ?? '')
    .replace(/^mixamorig:?/i, '')
    .replace(/[\s_]/g, '')
    .toLowerCase();
}
export function boneMap(root) {
  const map = {};
  const walk = (node) => {
    const key = normalizeBoneName(node?.name);
    if (key && BONE_KEYS.includes(key) && !map[key]) map[key] = node;
    const kids = node?.children ?? [];
    for (const c of kids) walk(c);
  };
  walk(root);
  return Object.keys(map).length ? map : null;
}

/**
 * Pesos de locomoção PUROS por speedNorm (0..1.25):
 *   idle domina perto de 0, walk é o regime de transição, run assume no sprint.
 * Somam ≈1 (fallback walk cobre a lacuna entre fade-out do idle e fade-in do run).
 */
export function locomotionWeights(speedNorm) {
  const sn = Math.max(0, Math.min(1.25, Number.isFinite(speedNorm) ? speedNorm : 0));
  const wIdle = Math.max(0, 1 - sn / .3);
  const wRun = Math.max(0, (sn - .62) / .3);
  const wWalk = Math.max(0, Math.min(1, 1 - wIdle - wRun));
  const sum = wIdle + wWalk + wRun;
  return {
    idle: wIdle / sum,
    walk: wWalk / sum,
    run: wRun / sum,
  };
}

// Fase (rad, cresce sem limite) → tempo do clip (s): (phase % 2π)/2π · duração.
// Um ciclo de passada = 2π de fase (2 passos) — o clip anda EXATAMENTE junto
// do deslocamento real (gait.js), com wrap estável.
export function phaseLockedTime(phase, duration) {
  if (!Number.isFinite(duration) || duration <= 1e-6) return 0;
  const p = Number.isFinite(phase) ? Math.max(0, phase) : 0;
  return ((p % (2 * Math.PI)) / (2 * Math.PI)) * duration;
}

// Rest pose capturada na criação (quaternion/position de cada bone) — a morte
// relaxa para ela e a ressurreição restaura, determinístico.
function captureRest(bones) {
  const rest = {};
  for (const [k, b] of Object.entries(bones)) {
    rest[k] = {
      q: b.quaternion ? b.quaternion.clone() : null,
      p: b.position ? b.position.clone() : null,
    };
  }
  return rest;
}
export { captureRest };
function restoreRest(bones, rest) {
  for (const [k, b] of Object.entries(bones)) {
    const r = rest[k];
    if (!r) continue;
    if (b.quaternion && r.q) b.quaternion.copy(r.q);
    if (b.position && r.p) b.position.copy(r.p);
  }
}

// cache: mesma PROMISE do asset (loadAvatarGlb) + clips resolvidos por id.
const clipCache = new Map();
async function clipsForAvatar(avatarId) {
  if (clipCache.has(avatarId)) return clipCache.get(avatarId);
  const promise = (async () => {
    const asset = await loadAvatarGlb(avatarId);
    if (!asset?.root) return null;
    let clips = asset.clips ?? [];
    if (!clips.length && avatarId !== HUMANOID_CLIP_SOURCE) {
      const src = await loadAvatarGlb(HUMANOID_CLIP_SOURCE); // retarget por NOME
      if (src?.clips?.length) clips = src.clips;
    }
    const byName = (rx) => clips.find((c) => c.name.toLowerCase() === rx) ?? null;
    return Object.freeze({
      idle: byName('idle'),
      walk: byName('walk'),
      run: byName('run'),
      shoot: byName('shoot'),
    });
  })();
  clipCache.set(avatarId, promise);
  return promise;
}
export function resetHumanoidClipCache() { clipCache.clear(); }

// Os clips Tripo/Mixamo apontam para nós `mixamorig:Xxx`, mas o PARSED PATH do
// three.js trata `mixamorig:` como DIRETÓRIO do track (parsedPath.nodeName = 'Hips')
// — o binding procura o bone `Hips` e NUNCA acha `mixamorig:Hips` (warning
// "No target node found" + rig congelado, inclusive na vitrine Fase 56). O clone
// do corpo humano renomeia os bones (strip do prefixo) para o binding por NOME
// funcionar em TODOS os rigs — o boneMap canônico aceita as duas formas.
const MIXAMORIG_PREFIX = 'mixamorig:';
export function stripMixamorigPrefix(root) {
  root.traverse((n) => {
    if (typeof n.name === 'string' && n.name.startsWith(MIXAMORIG_PREFIX)) {
      n.name = n.name.slice(MIXAMORIG_PREFIX.length);
    }
  });
  return root;
}

/**
 * Cria o corpo humanoide de um ator. Retorna null em QUALQUER falha
 * (id inválido, rede, rig sem hips, tier estático) — o chamador mantém o
 * procedural (mesma doutrina hero3d/avatars3d).
 */
export async function createHumanoidBody({ avatarId } = {}) {
  const spec = avatarById(avatarId);
  if (!spec || spec.tier === 'static') return null;
  const asset = await loadAvatarGlb(avatarId);
  if (!asset?.root) return null;
  const bones = boneMap(asset.root);
  if (!bones?.hips) return null;               // rig inesperado → procedural
  const root = skeletonClone(asset.root); // clone skinned correto (bones próprios)
  root.name = `humanoid_${avatarId}`;
  stripMixamorigPrefix(root);                  // binding dos clips por NOME (see acima)
  normalizeAvatarScale(root);
  fitAvatarToGround(root);
  root.traverse((n) => {
    if (n.isMesh || n.isSkinnedMesh) { n.castShadow = true; n.receiveShadow = true; }
    if (n.isObject3D) n.userData.avatarAsset = avatarId; // exclusão das rotinas de ocultação
  });
  const clips = await clipsForAvatar(avatarId);
  const mixer = new THREE.AnimationMixer(root);
  const mk = (clip) => {
    if (!clip) return null;
    const a = mixer.clipAction(clip);
    a.enabled = true;
    a.setEffectiveWeight(0);
    a.play();
    a.paused = true;                            // fase-travada: o tempo é setado por frame
    return a;
  };
  const actions = { idle: mk(clips.idle), walk: mk(clips.walk), run: mk(clips.run) };
  if (!actions.idle && !actions.walk && !actions.run) return null; // sem animação → procedural
  // NÃO congelar: host/weaponRig/deadPose são mutados pelo attach e pelo loop
  // (módulo ESM roda em strict mode — freeze lançaria TypeError).
  return {
    kind: 'humanoid',
    avatarId,
    root,
    mixer,
    actions,
    bones,
    rest: captureRest(bones),
    w: { idle: 1, walk: 0, run: 0 },
    deadPose: false,
    host: null,
    weaponRig: null,
  };
}

/**
 * Prende o corpo humanoide no operativo (playerOp ou LOD de bot):
 * oculta a MALHA procedural (arma/sombra/nameTag continuam vivas), adiciona o
 * GLB ao grupo e guarda o weaponRig p/ solda por frame. Retorna o entry.
 */
export function attachHumanoidToOperative(op, body) {
  if (!op?.group || !body?.root) return null;
  const keep = new Set();
  const wr = op.group.userData?.weaponRig ?? op.parts?.weaponRig;
  if (wr?.group) wr.group.traverse((o) => keep.add(o));
  if (op.parts?.shadow) op.parts.shadow.traverse((o) => keep.add(o));
  op.group.traverse((o) => {
    if (o === body.root || keep.has(o) || o.userData?.avatarAsset) return;
    if (o.isMesh || o.isSkinnedMesh) o.visible = false; // só a MALHA dorme (pivôs face etc. ok)
  });
  op.group.add(body.root);
  body.host = op;
  body.weaponRig = wr ?? null;
  return body;
}

// Poses procedurais (aplicadas APÓS mixer.update — aditivas sobre o clip):
function poseAim(entry, pitch, ads) {
  const b = entry.bones;
  const p = Math.max(-1.2, Math.min(1.2, pitch || 0));
  if (b.spine1) b.spine1.rotation.x += p * .28;
  if (b.spine2) b.spine2.rotation.x += p * .34;
  if (b.head) b.head.rotation.x += p * .22;       // olhar acompanha a mira
  if (ads) {                                       // recuo de ombro da mira
    if (b.rightarm) b.rightarm.rotation.z -= .04;
    if (b.leftarm) b.leftarm.rotation.z += .04;
  }
}
function poseCrouch(entry) {
  const b = entry.bones;
  if (b.hips?.position) b.hips.position.y -= .32;  // agachamento real do rig
  if (b.spine2) b.spine2.rotation.x += .28;
  if (b.leftleg) b.leftleg.rotation.x += .5;
  if (b.rightleg) b.rightleg.rotation.x += .5;
  if (b.leftfoot) b.leftfoot.rotation.x -= .18;
  if (b.rightfoot) b.rightfoot.rotation.x -= .18;
}
function poseKnocked(entry, t) {                   // deitado arrastando (DBNO)
  const b = entry.bones;
  const crawl = Math.sin(t * 5.2) * .5;
  entry.root.rotation.x = -1.15;                    // deita de costas (topo p/ +z)
  if (b.hips?.position) b.hips.position.y += .1;
  if (b.rightarm) b.rightarm.rotation.x = 1.1 + crawl * .3;
  if (b.leftarm) b.leftarm.rotation.x = 1.1 - crawl * .3;
  if (b.rightforearm) b.rightforearm.rotation.x = .5;
  if (b.leftforearm) b.leftforearm.rotation.x = .5;
  if (b.rightupleg) b.rightupleg.rotation.x = .55;
  if (b.leftupleg) b.leftupleg.rotation.x = .55 - crawl * .12;
  if (b.rightleg) b.rightleg.rotation.x = .5;
  if (b.leftleg) b.leftleg.rotation.x = .5;
  if (b.head) b.head.rotation.y = Math.sin(t * 1.3) * .18;
}
function poseAir(entry, t) {                       // queda livre: espalhado
  const b = entry.bones;
  const flap = Math.sin(t * 5) * .35;
  if (b.rightarm) b.rightarm.rotation.z = -1.05 - flap * .3;
  if (b.leftarm) b.leftarm.rotation.z = 1.05 + flap * .3;
  if (b.rightupleg) b.rightupleg.rotation.x = .5;
  if (b.leftupleg) b.leftupleg.rotation.x = .35;
  if (b.rightleg) b.rightleg.rotation.x = .45;
  if (b.leftleg) b.leftleg.rotation.x = .3;
}
function poseDeadRelax(entry) {                    // caído: membros abrem e assentam
  const b = entry.bones;
  if (b.rightarm) b.rightarm.rotation.z = -.55;
  if (b.leftarm) b.leftarm.rotation.z = .55;
  if (b.rightforearm) b.rightforearm.rotation.x = .35;
  if (b.leftforearm) b.leftforearm.rotation.x = .35;
  if (b.rightupleg) b.rightupleg.rotation.x = .18;
  if (b.leftupleg) b.leftupleg.rotation.x = .12;
  if (b.rightleg) b.rightleg.rotation.x = .22;
  if (b.leftleg) b.leftleg.rotation.x = .1;
  if (b.head) b.head.rotation.z = .18;
}

// peso EWMA do frame — suaviza o blend e o corte de estado
function blendWeights(entry, target) {
  const a = .3;
  entry.w.idle = ewma(entry.w.idle, target.idle, a);
  entry.w.walk = ewma(entry.w.walk, target.walk, a);
  entry.w.run = ewma(entry.w.run, target.run, a);
  const s = entry.w.idle + entry.w.walk + entry.w.run || 1;
  entry.w.idle /= s; entry.w.walk /= s; entry.w.run /= s;
}

/**
 * Anima o corpo humanoide — MESMO contrato de opts de animateOperative:
 * { t, speedNorm, phase, pitch, dead, ads, crouch, knocked, air }.
 * Locomoção é fase-travada (gait.js); idle anda no relógio; mira/crouch/
 * knocked/air são poses aditivas pós-mixer; morte congela e relaxa.
 * Retorna o entry (encadeável).
 */
export function animateHumanoid(entry, {
  t = 0, speedNorm = 0, phase = null, pitch = 0,
  dead = false, ads = false, crouch = false, knocked = false, air = 0,
} = {}) {
  if (!entry?.mixer) return entry;
  if (dead) {
    if (!entry.deadPose) {
      entry.mixer.stopAllAction();
      entry.deadPose = true;
      poseDeadRelax(entry);
    }
    return entry;
  }
  if (entry.deadPose) {                     // reviveu: restaura rest e religa ações
    if (entry.rest) restoreRest(entry.bones, entry.rest);
    entry.deadPose = false;
    for (const a of Object.values(entry.actions)) {
      if (a) { a.enabled = true; a.paused = true; a.setEffectiveWeight(0); a.play(); }
    }
    entry.root.rotation.x = 0;
  }
  const sn = Math.max(0, Math.min(1.25, Number.isFinite(speedNorm) ? speedNorm : 0));
  const PH = Number.isFinite(phase) ? phase : t * 8.6;
  // Estados especiais (rastejo/queda) CORTAM a locomoção instantaneamente —
  // são eventos abruptos (a pose procedural assume no mesmo frame); a saída
  // volta SUAVE pela EWMA (fade-in da passada). Morto congela via deadPose.
  const special = knocked || air > 0;
  if (special) {
    entry.w.idle = 0; entry.w.walk = 0; entry.w.run = 0;
  } else {
    blendWeights(entry, locomotionWeights(sn));
  }
  const setLocked = (a, w) => {
    if (!a) return;
    a.setEffectiveWeight(w);
    if (w > 0) a.time = phaseLockedTime(PH, a.getClip().duration); // pé planta onde o corpo chega
  };
  setLocked(entry.actions.walk, entry.w.walk);
  setLocked(entry.actions.run, entry.w.run);
  const idle = entry.actions.idle;
  if (idle) {
    idle.paused = false;                    // idle é o único no relógio (respiração)
    idle.setEffectiveWeight(entry.w.idle);
  }
  entry.mixer.update(special ? 0 : Math.max(0, 1 / 60));
  entry.root.rotation.x = 0;               // limpa pose do frame anterior
  if (knocked) { poseKnocked(entry, t); return entry; }
  if (air > 0) { poseAir(entry, t); return entry; }
  poseAim(entry, pitch, ads);
  if (crouch) poseCrouch(entry);
  return entry;
}

/**
 * Solda a ARMA na mão direita do corpo REAL (por frame, após animateHumanoid):
 * reparenta o weaponRig ao bone righthand (uma vez) e copia a transform de
 * mundo do bone → arma segue a animação do GLB (grip compensado p/ caber na
 * palma). Determinístico; nada aqui pode lançar.
 */
export function weldWeaponToHand(entry, weaponRig = entry?.weaponRig) {
  try {
    if (!entry?.bones?.righthand || !weaponRig?.group) return false;
    const hand = entry.bones.righthand;
    // troca de arma: o husk do rig ANTERIOR sai da mão (attachWeapon descarta
    // o mount procedural, mas o grupo antigo ficou órfão no bone do GLB).
    if (entry.weaponRig && entry.weaponRig !== weaponRig && entry.weaponRig.group?.parent === hand) {
      hand.remove(entry.weaponRig.group);
    }
    entry.weaponRig = weaponRig;
    const g = weaponRig.group;
    if (g.parent !== hand) hand.add(g);          // arma vive NA MÃO do corpo real
    // transform local fixa no espaço da MÃO (a animação do bone carrega a arma;
    // a calibração HUMANOID_GRIP alinha cano à mão — ajuste visual centralizado)
    g.position.set(HUMANOID_GRIP.pos[0], HUMANOID_GRIP.pos[1], HUMANOID_GRIP.pos[2]);
    g.quaternion.setFromEuler(new THREE.Euler(HUMANOID_GRIP.rot[0], HUMANOID_GRIP.rot[1], HUMANOID_GRIP.rot[2]));
    return true;
  } catch { return false; }
}

// offset de empunhadura da arma no espaço da MÃO mixamorig (mão ~7 cm eixo y
// aponta para os dedos; cano da arma alinha ao +y da mão). Constante única de
// calibração — ajuste visual em um lugar só.
export const HUMANOID_GRIP = Object.freeze({
  pos: Object.freeze([0, -.03, -.01]),
  rot: Object.freeze([-Math.PI / 2, 0, .12]),
});

export function resetHumanoidCache() {
  clipCache.clear();
}
